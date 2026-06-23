// Global floating PiP host: renders the floating timer window outside of any
// route so it survives navigation. The cronómetro page calls
// `openFloatingTimer()` directly from a user click (required for the Document
// Picture-in-Picture API). Once a window is open, this component portals the
// timer UI (with pause / resume / restart / stop) into it and keeps it in sync
// with the `active_timer` localStorage mirror.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import type { ActiveTimerPayload } from "@/lib/native-timer-mirror";

const ACTIVE_KEY = "active_timer";

// Module-level singleton — the actual PiP window across navigations.
let pipWindowRef: Window | null = null;
const winSubs = new Set<() => void>();
function setPipWindow(w: Window | null) {
  pipWindowRef = w;
  winSubs.forEach((cb) => cb());
}

export function isFloatingTimerOpen() {
  return !!pipWindowRef && !pipWindowRef.closed;
}

/** MUST be invoked synchronously from a user gesture (click). */
export async function openFloatingTimer(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (pipWindowRef && !pipWindowRef.closed) {
    pipWindowRef.focus?.();
    return true;
  }
  const dpip = (window as any).documentPictureInPicture;
  if (!dpip) {
    alert(
      "O teu browser não suporta janela flutuante (Document Picture-in-Picture). Usa Chrome/Edge atualizados em desktop.",
    );
    return false;
  }
  try {
    const w: Window = await dpip.requestWindow({ width: 300, height: 230 });
    // Copy stylesheets so Tailwind / CSS variables work inside the PiP window.
    [...document.styleSheets].forEach((sheet) => {
      try {
        const rules = [...sheet.cssRules].map((r) => r.cssText).join("\n");
        const style = w.document.createElement("style");
        style.textContent = rules;
        w.document.head.appendChild(style);
      } catch {
        if (sheet.href) {
          const link = w.document.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          w.document.head.appendChild(link);
        }
      }
    });
    w.document.documentElement.classList.add(
      document.documentElement.classList.contains("dark") ? "dark" : "light",
    );
    w.document.title = "Cronómetro";
    w.addEventListener("pagehide", () => setPipWindow(null));
    setPipWindow(w);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export function closeFloatingTimer() {
  if (pipWindowRef && !pipWindowRef.closed) pipWindowRef.close();
  setPipWindow(null);
}

function fmt(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function readActive(): ActiveTimerPayload {
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    if (!raw) return { active: false };
    const p = JSON.parse(raw);
    if (p && p.active) return p as ActiveTimerPayload;
  } catch {}
  return { active: false };
}

export function FloatingTimerHost() {
  const [payload, setPayload] = useState<ActiveTimerPayload>(() =>
    typeof window === "undefined" ? { active: false } : readActive(),
  );
  const [win, setWin] = useState<Window | null>(pipWindowRef);
  const [now, setNow] = useState(Date.now());
  const busyRef = useRef(false);

  // Subscribe to PiP window opens/closes
  useEffect(() => {
    const cb = () => setWin(pipWindowRef);
    winSubs.add(cb);
    return () => { winSubs.delete(cb); };
  }, []);

  // Subscribe to active_timer changes (same-tab + cross-tab)
  useEffect(() => {
    const refresh = () => setPayload(readActive());
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key === ACTIVE_KEY) refresh(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("active-timer:change", refresh);
    const poll = setInterval(refresh, 2000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("active-timer:change", refresh);
      clearInterval(poll);
    };
  }, []);

  // Tick every second while the window is open
  useEffect(() => {
    if (!win) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [win]);

  // Auto-close the window when there's no active timer
  useEffect(() => {
    if (win && !payload.active) closeFloatingTimer();
  }, [win, payload.active]);

  if (!win || !payload.active) return null;

  const paused = payload.pausedAt !== null;
  const elapsed = Math.max(
    0,
    Math.floor(
      ((paused ? payload.pausedAt! : now) - payload.startedAt - payload.pausedMs) / 1000,
    ),
  );

  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try { await fn(); } catch (e) { console.error(e); }
    finally { busyRef.current = false; }
  };

  const stop = () => run(async () => {
    const p = payload as Extract<ActiveTimerPayload, { active: true }>;
    const extraPaused = p.pausedAt ? Date.now() - p.pausedAt : 0;
    await supabase.from("timer_sessions").update({
      ended_at: new Date().toISOString(),
      paused_at: null,
      paused_ms: p.pausedMs + extraPaused,
    }).eq("id", p.sessionId);
    closeFloatingTimer();
  });

  const pause = () => run(async () => {
    const p = payload as Extract<ActiveTimerPayload, { active: true }>;
    await supabase.from("timer_sessions")
      .update({ paused_at: new Date().toISOString() })
      .eq("id", p.sessionId);
  });

  const resume = () => run(async () => {
    const p = payload as Extract<ActiveTimerPayload, { active: true }>;
    if (!p.pausedAt) return;
    const extra = Date.now() - p.pausedAt;
    await supabase.from("timer_sessions")
      .update({ paused_at: null, paused_ms: p.pausedMs + extra })
      .eq("id", p.sessionId);
  });

  const restart = () => run(async () => {
    const p = payload as Extract<ActiveTimerPayload, { active: true }>;
    // End current session
    const extraPaused = p.pausedAt ? Date.now() - p.pausedAt : 0;
    await supabase.from("timer_sessions").update({
      ended_at: new Date().toISOString(),
      paused_at: null,
      paused_ms: p.pausedMs + extraPaused,
    }).eq("id", p.sessionId);
    // Start a new one with same category/note
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !p.categoryId) return;
    await supabase.from("timer_sessions").insert({
      user_id: user.id,
      category_id: p.categoryId,
      note: p.note || null,
      started_at: new Date().toISOString(),
      reminders_minutes: p.reminders,
    });
  });

  const btn: React.CSSProperties = {
    flex: 1,
    padding: "8px 6px",
    borderRadius: 10,
    border: "1px solid hsl(var(--border))",
    background: "hsl(var(--input))",
    color: "hsl(var(--foreground))",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 12,
  };
  const primaryBtn: React.CSSProperties = {
    ...btn,
    background: "hsl(var(--primary))",
    color: "hsl(var(--primary-foreground))",
    border: "none",
  };

  return createPortal(
    <div
      style={{
        margin: 0,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "hsl(var(--background))",
        color: "hsl(var(--foreground))",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        padding: "12px 14px",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <span style={{ width: 10, height: 10, borderRadius: 999, background: payload.categoryColor }} />
        <span style={{ fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{payload.categoryName}</span>
        {paused && <span style={{ fontSize: 10, opacity: 0.7 }}>EM PAUSA</span>}
      </div>
      {payload.note && (
        <div style={{ fontSize: 11, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{payload.note}</div>
      )}
      <div style={{
        fontSize: 38,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        textAlign: "center",
        lineHeight: 1.1,
        opacity: paused ? 0.6 : 1,
      }}>
        {fmt(elapsed)}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
        {paused ? (
          <button onClick={resume} style={btn}>▶ Retomar</button>
        ) : (
          <button onClick={pause} style={btn}>⏸ Pausar</button>
        )}
        <button onClick={restart} style={btn} title="Reiniciar">↻</button>
        <button onClick={stop} style={primaryBtn}>■ Parar</button>
      </div>
    </div>,
    win.document.body,
  );
}
