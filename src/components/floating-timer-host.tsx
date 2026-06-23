// Global floating PiP host: renders the floating timer window outside of any
// route, so it survives navigation. Reads the active-timer mirror written by
// useNativeTimerMirror, and a small toggle key set by the cronómetro page.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";

type ActivePayload = {
  active: true;
  sessionId: string;
  categoryName: string;
  categoryColor: string;
  note: string;
  startedAt: number;
  reminders: number[];
} | { active: false };

const OPEN_KEY = "floating_timer:open";
const ACTIVE_KEY = "active_timer";

export function setFloatingTimerOpen(open: boolean) {
  try {
    if (open) window.localStorage.setItem(OPEN_KEY, "1");
    else window.localStorage.removeItem(OPEN_KEY);
    window.dispatchEvent(new Event("floating-timer:toggle"));
  } catch {}
}

export function getFloatingTimerOpen(): boolean {
  try { return window.localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
}

function fmt(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function readActive(): ActivePayload {
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    if (!raw) return { active: false };
    const p = JSON.parse(raw);
    if (p && p.active) return p as ActivePayload;
    return { active: false };
  } catch { return { active: false }; }
}

export function FloatingTimerHost() {
  const [payload, setPayload] = useState<ActivePayload>(() =>
    typeof window === "undefined" ? { active: false } : readActive()
  );
  const [wantOpen, setWantOpen] = useState<boolean>(() =>
    typeof window === "undefined" ? false : getFloatingTimerOpen()
  );
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const [now, setNow] = useState(Date.now());
  const openingRef = useRef(false);

  // Subscribe to storage + toggle events
  useEffect(() => {
    const refresh = () => {
      setPayload(readActive());
      setWantOpen(getFloatingTimerOpen());
    };
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === ACTIVE_KEY || e.key === OPEN_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("floating-timer:toggle", refresh);
    const poll = setInterval(refresh, 1500);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("floating-timer:toggle", refresh);
      clearInterval(poll);
    };
  }, []);

  // Tick every second while window is open
  useEffect(() => {
    if (!pipWin) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pipWin]);

  // Open / close based on flag + active payload
  useEffect(() => {
    const supported = typeof window !== "undefined" && "documentPictureInPicture" in window;
    if (!supported) return;
    const shouldBeOpen = wantOpen && payload.active;
    if (shouldBeOpen && !pipWin && !openingRef.current) {
      openingRef.current = true;
      (async () => {
        try {
          const w: Window = await (window as any).documentPictureInPicture.requestWindow({
            width: 280, height: 160,
          });
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
          w.document.documentElement.classList.add(document.documentElement.classList.contains("dark") ? "dark" : "light");
          w.document.title = "Cronómetro";
          w.addEventListener("pagehide", () => {
            setPipWin(null);
            setFloatingTimerOpen(false);
          });
          setPipWin(w);
        } catch (e) {
          console.error(e);
          setFloatingTimerOpen(false);
        } finally {
          openingRef.current = false;
        }
      })();
    } else if (!shouldBeOpen && pipWin) {
      pipWin.close();
      setPipWin(null);
    }
  }, [wantOpen, payload.active, pipWin]);

  if (!pipWin || !payload.active) return null;

  const elapsed = Math.max(0, Math.floor((now - payload.startedAt) / 1000));

  const stop = async () => {
    try {
      await supabase
        .from("timer_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", payload.sessionId);
    } catch (e) {
      console.error(e);
    }
    setFloatingTimerOpen(false);
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
      }}>
        {fmt(elapsed)}
      </div>
      <button
        onClick={stop}
        style={{
          marginTop: "auto",
          padding: "8px 12px",
          borderRadius: 10,
          border: "none",
          background: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Parar
      </button>
    </div>,
    pipWin.document.body,
  );
}
