import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play, Square, Plus, Pencil, Trash2, X, Timer, Tags as TagsIcon, Loader2,
  PictureInPicture2, Bell, BellOff, Download, Upload, Pause, ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNativeTimerMirror } from "@/lib/native-timer-mirror";
import { buildEnvelope, downloadJson, importHierarchicalCategories, pickJsonFile, validateEnvelope } from "@/lib/data-io";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


export const Route = createFileRoute("/_app/cronometro")({
  component: CronometroPage,
});

interface Cat {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}
interface DbSession {
  id: string;
  category_id: string | null;
  note: string | null;
  started_at: string;
  ended_at: string | null;
  reminders_minutes?: number[] | null;
  paused_at?: string | null;
  paused_ms?: number | null;
}
interface Session {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  parentId: string | null;
  parentName: string;
  parentColor: string;
  note: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
}

const DEFAULT_CATS: Array<{ name: string; color: string }> = [
  { name: "Trabalho", color: "#ff7a18" },
  { name: "Estudo", color: "#60a5fa" },
  { name: "Exercício", color: "#34d399" },
  { name: "Lazer", color: "#f472b6" },
  { name: "Projeto pessoal", color: "#a78bfa" },
];

function fmtDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}
function fmtHoursShort(seconds: number) {
  const h = seconds / 3600;
  return h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(seconds / 60)}m`;
}
function toLocalInput(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(s: string) {
  return new Date(s).getTime();
}

type Period = "day" | "week" | "month";

function periodStart(p: Period, ref = new Date()) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  if (p === "day") return d.getTime();
  if (p === "week") {
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return d.getTime();
  }
  d.setDate(1);
  return d.getTime();
}
function periodEnd(p: Period, ref = new Date()) {
  const d = new Date(periodStart(p, ref));
  if (p === "day") d.setDate(d.getDate() + 1);
  else if (p === "week") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

function CronometroPage() {
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();

  const catsQuery = useQuery({
    queryKey: ["timer-categories", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Cat[]> => {
      const { data, error } = await supabase
        .from("timer_categories")
        .select("id,name,color,parent_id")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const mapRow = (r: { id: string; name: string; color: string; parent_id: string | null }): Cat =>
        ({ id: r.id, name: r.name, color: r.color, parentId: r.parent_id });
      if (!data || data.length === 0) {
        const seeded = DEFAULT_CATS.map((c) => ({ ...c, user_id: user!.id }));
        const { data: inserted, error: e2 } = await supabase
          .from("timer_categories")
          .insert(seeded)
          .select("id,name,color,parent_id");
        if (e2) throw e2;
        return (inserted ?? []).map(mapRow);
      }
      return data.map(mapRow);
    },
    refetchOnWindowFocus: true,
  });

  const sessionsQuery = useQuery({
    queryKey: ["timer-sessions", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<DbSession[]> => {
      const { data, error } = await supabase
        .from("timer_sessions")
        .select("id,category_id,note,started_at,ended_at,reminders_minutes,paused_at,paused_ms")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  // Realtime sync across devices
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("timer-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "timer_sessions" }, () => {
        qc.invalidateQueries({ queryKey: ["timer-sessions", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "timer_categories" }, () => {
        qc.invalidateQueries({ queryKey: ["timer-categories", user.id] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, qc]);

  const cats = catsQuery.data ?? [];
  const rawSessions = sessionsQuery.data ?? [];

  const catById = useMemo(() => {
    const m = new Map<string, Cat>();
    cats.forEach((c) => m.set(c.id, c));
    return m;
  }, [cats]);

  const activeDb = rawSessions.find((s) => !s.ended_at) ?? null;
  const completedSessions: Session[] = useMemo(
    () =>
      rawSessions
        .filter((s) => s.ended_at)
        .map((s) => {
          const cat = s.category_id ? catById.get(s.category_id) : undefined;
          const parent = cat?.parentId ? catById.get(cat.parentId) : cat;
          const startedAt = Date.parse(s.started_at);
          const endedAt = Date.parse(s.ended_at!);
          const pausedMs = s.paused_ms ?? 0;
          return {
            id: s.id,
            categoryId: s.category_id ?? "",
            categoryName: cat?.name ?? "—",
            categoryColor: cat?.color ?? "#888",
            parentId: cat?.parentId ?? cat?.id ?? null,
            parentName: parent?.name ?? cat?.name ?? "—",
            parentColor: parent?.color ?? cat?.color ?? "#888",
            note: s.note ?? "",
            startedAt,
            endedAt,
            durationSeconds: Math.max(1, Math.round((endedAt - startedAt - pausedMs) / 1000)),
          };
        }),
    [rawSessions, catById],
  );

  const [tickNow, setTickNow] = useState(Date.now());
  const [pickerParentId, setPickerParentId] = useState<string>("");
  const [pickerCatId, setPickerCatId] = useState<string>("");
  const [pickerNote, setPickerNote] = useState("");
  const [pickerReminders, setPickerReminders] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("cron-reminder-last") || "[]"); } catch { return []; }
  });
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [breakdownMode, setBreakdownMode] = useState<"parent" | "sub">("parent");
  const [parentFilter, setParentFilter] = useState<string>("all");
  const [subFilter, setSubFilter] = useState<string>("all");

  const parentCats = useMemo(() => cats.filter((c) => !c.parentId), [cats]);
  const subCatsOf = (pid: string) => cats.filter((c) => c.parentId === pid);

  const isPaused = !!activeDb?.paused_at;
  useEffect(() => {
    if (!activeDb || isPaused) return;
    const t = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeDb, isPaused]);

  useEffect(() => {
    if (!pickerParentId && parentCats[0]) setPickerParentId(parentCats[0].id);
  }, [parentCats, pickerParentId]);
  useEffect(() => {
    if (!pickerParentId) return;
    const subs = subCatsOf(pickerParentId);
    // If current pickerCatId is not the parent and not one of its subs, reset
    if (pickerCatId !== pickerParentId && !subs.some((s) => s.id === pickerCatId)) {
      setPickerCatId(pickerParentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerParentId, cats]);

  const startMut = useMutation({
    mutationFn: async () => {
      const cat = cats.find((c) => c.id === pickerCatId);
      if (!cat) throw new Error("Escolhe uma categoria.");
      const { error } = await supabase.from("timer_sessions").insert({
        user_id: user!.id,
        category_id: cat.id,
        note: pickerNote.trim() || null,
        started_at: new Date().toISOString(),
        ended_at: null,
        reminders_minutes: pickerReminders,
      });
      if (error) throw error;
      try {
        window.localStorage.setItem("cron-reminder-last", JSON.stringify(pickerReminders));
      } catch {}
    },
    onSuccess: () => {
      setPickerNote("");
      qc.invalidateQueries({ queryKey: ["timer-sessions", user?.id] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const stopMut = useMutation({
    mutationFn: async () => {
      if (!activeDb) return;
      const now = Date.now();
      // If currently paused, finalize paused_ms with the time spent paused so far and clear paused_at.
      const wasPaused = !!activeDb.paused_at;
      const extraPaused = wasPaused ? now - Date.parse(activeDb.paused_at!) : 0;
      const { error } = await supabase
        .from("timer_sessions")
        .update({
          ended_at: new Date(now).toISOString(),
          paused_at: null,
          paused_ms: (activeDb.paused_ms ?? 0) + extraPaused,
        })
        .eq("id", activeDb.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timer-sessions", user?.id] }),
  });

  const pauseMut = useMutation({
    mutationFn: async () => {
      if (!activeDb || activeDb.paused_at) return;
      const { error } = await supabase
        .from("timer_sessions")
        .update({ paused_at: new Date().toISOString() })
        .eq("id", activeDb.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timer-sessions", user?.id] }),
  });

  const resumeMut = useMutation({
    mutationFn: async () => {
      if (!activeDb || !activeDb.paused_at) return;
      const extra = Date.now() - Date.parse(activeDb.paused_at);
      const { error } = await supabase
        .from("timer_sessions")
        .update({ paused_at: null, paused_ms: (activeDb.paused_ms ?? 0) + extra })
        .eq("id", activeDb.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timer-sessions", user?.id] }),
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      if (!activeDb) return;
      const { error } = await supabase.from("timer_sessions").delete().eq("id", activeDb.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timer-sessions", user?.id] }),
  });

  const deleteSessionMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("timer_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timer-sessions", user?.id] }),
  });

  const updateSessionMut = useMutation({
    mutationFn: async (s: Session) => {
      const { error } = await supabase
        .from("timer_sessions")
        .update({
          category_id: s.categoryId || null,
          note: s.note || null,
          started_at: new Date(s.startedAt).toISOString(),
          ended_at: new Date(s.endedAt).toISOString(),
        })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timer-sessions", user?.id] }),
  });

  const cancelActive = () => {
    if (!activeDb) return;
    if (!confirm("Descartar sessão em curso?")) return;
    cancelMut.mutate();
  };
  const removeSession = (id: string) => {
    if (!confirm("Eliminar sessão?")) return;
    deleteSessionMut.mutate(id);
  };

  const pStart = periodStart(period, refDate);
  const pEnd = periodEnd(period, refDate);
  const matchesCatFilter = (catId: string) => {
    if (parentFilter === "all") return true;
    if (!catId) return false;
    if (subFilter !== "all") return catId === subFilter;
    const c = catById.get(catId);
    return catId === parentFilter || c?.parentId === parentFilter;
  };
  const inPeriod = completedSessions.filter(
    (s) => s.startedAt >= pStart && s.startedAt < pEnd && matchesCatFilter(s.categoryId),
  );
  const totalSec = inPeriod.reduce((acc, s) => acc + s.durationSeconds, 0);

  const byCategory = useMemo(() => {
    // Aggregate by parent category (so subcategories roll up under their parent's color).
    const map = new Map<string, { name: string; color: string; value: number }>();
    for (const s of inPeriod) {
      const key = s.parentId ?? s.categoryId;
      const row = map.get(key) ?? {
        name: s.parentName,
        color: s.parentColor,
        value: 0,
      };
      row.value += s.durationSeconds;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [inPeriod]);

  const bySubcategory = useMemo(() => {
    // Break down each parent into its subcategories (+ note when there's no subcategory).
    type Row = { key: string; parentName: string; parentColor: string; subName: string; color: string; value: number };
    const map = new Map<string, Row>();
    for (const s of inPeriod) {
      const isSub = s.parentId && s.parentId !== s.categoryId;
      const subName = isSub ? s.categoryName : (s.note || "—");
      const key = `${s.parentId ?? s.categoryId}::${subName}`;
      const row = map.get(key) ?? {
        key,
        parentName: s.parentName,
        parentColor: s.parentColor,
        subName,
        color: isSub ? s.categoryColor : s.parentColor,
        value: 0,
      };
      row.value += s.durationSeconds;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [inPeriod]);

  const buckets = useMemo(() => {
    if (period === "day") {
      const arr = Array.from({ length: 24 }, (_, h) => ({ label: `${h}h`, hours: 0 }));
      for (const s of inPeriod) {
        const hour = new Date(s.startedAt).getHours();
        arr[hour].hours += s.durationSeconds / 3600;
      }
      return arr;
    }
    if (period === "week") {
      const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
      const arr = labels.map((label) => ({ label, hours: 0 }));
      for (const s of inPeriod) {
        const idx = (new Date(s.startedAt).getDay() + 6) % 7;
        arr[idx].hours += s.durationSeconds / 3600;
      }
      return arr;
    }
    const daysInMonth = new Date(
      new Date(refDate).getFullYear(),
      new Date(refDate).getMonth() + 1,
      0,
    ).getDate();
    const arr = Array.from({ length: daysInMonth }, (_, i) => ({
      label: String(i + 1),
      hours: 0,
    }));
    for (const s of inPeriod) {
      const day = new Date(s.startedAt).getDate();
      arr[day - 1].hours += s.durationSeconds / 3600;
    }
    return arr;
  }, [inPeriod, period, refDate]);

  const periodLabel = useMemo(() => {
    const d = new Date(refDate);
    if (period === "day")
      return d.toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long" });
    if (period === "week") {
      const start = new Date(pStart);
      const end = new Date(pEnd - 1);
      return `${start.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })} — ${end.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}`;
    }
    return d.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  }, [period, refDate, pStart, pEnd]);

  const shift = (dir: -1 | 1) => {
    const d = new Date(refDate);
    if (period === "day") d.setDate(d.getDate() + dir);
    else if (period === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setRefDate(d);
  };

  const activeStartedAt = activeDb ? Date.parse(activeDb.started_at) : 0;
  const activeCat = activeDb?.category_id ? catById.get(activeDb.category_id) : undefined;
  const activeParent = activeCat?.parentId ? catById.get(activeCat.parentId) : activeCat;
  const activePausedAt = activeDb?.paused_at ? Date.parse(activeDb.paused_at) : 0;
  const activePausedMs = activeDb?.paused_ms ?? 0;
  const elapsedActive = activeDb
    ? Math.floor(
        ((activePausedAt ? activePausedAt : tickNow) - activeStartedAt - activePausedMs) / 1000,
      )
    : 0;

  useNativeTimerMirror(
    activeDb
      ? {
          active: true,
          sessionId: activeDb.id,
          categoryName: activeCat?.name ?? "—",
          categoryColor: activeCat?.color ?? "#888",
          note: activeDb.note ?? "",
          startedAt: activeStartedAt + activePausedMs + (activePausedAt ? Date.now() - activePausedAt : 0),
          reminders: activeDb.reminders_minutes ?? [],
        }
      : { active: false },
  );

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
        {authLoading ? "A carregar…" : "Inicia sessão para usar o cronómetro."}
      </div>
    );
  }
  if (catsQuery.isLoading || sessionsQuery.isLoading) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold neon-text flex items-center gap-2">
            <Timer className="h-6 w-6" /> Cronómetro
          </h1>
          <p className="text-sm text-muted-foreground">
            Sincronizado entre os teus dispositivos · relatórios diários, semanais e mensais.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={async () => {
              const [{ data: cs }, { data: ss }] = await Promise.all([
                supabase.from("timer_categories").select("*"),
                supabase.from("timer_sessions").select("*"),
              ]);
              const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
              downloadJson(`cronometro-${stamp}.json`, buildEnvelope("cronometro_full", {
                categories: cs ?? [], sessions: ss ?? [],
              }));
              toast.success(`${(ss ?? []).length} sessão(ões) exportada(s)`);
            }}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
          >
            <Download className="h-3.5 w-3.5" /> Exportar
          </button>
          <button
            onClick={async () => {
              if (!user) return;
              const parsed: any = await pickJsonFile();
              if (!parsed) return;
              const cats: any[] = Array.isArray(parsed?.categories) ? parsed.categories : [];
              const sess: any[] = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
              let idMap = new Map<string, string>();
              if (cats.length) {
                const result = await importHierarchicalCategories("timer_categories", cats, user.id);
                idMap = result.idMap;
                if (result.skipped) toast.warning(`${result.skipped} subcategoria(s) ignoradas por falta da categoria-mãe`);
              }
              if (sess.length) {
                const rows = sess.map((s) => ({
                  user_id: user.id,
                  category_id: s.category_id ? (idMap.get(s.category_id) ?? null) : null,
                  note: s.note ?? null,
                  started_at: s.started_at,
                  ended_at: s.ended_at ?? null,
                  reminders_minutes: s.reminders_minutes ?? [],
                }));
                const { error } = await supabase.from("timer_sessions").insert(rows);
                if (error) { toast.error(error.message); return; }
              }
              qc.invalidateQueries({ queryKey: ["timer-sessions", user.id] });
              qc.invalidateQueries({ queryKey: ["timer-categories", user.id] });
              toast.success(`${sess.length} sessão(ões) importada(s)`);
            }}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
          >
            <Upload className="h-3.5 w-3.5" /> Importar
          </button>
          <button
            onClick={() => setCatManagerOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
          >
            <TagsIcon className="h-3.5 w-3.5" /> Categorias
          </button>
        </div>
      </div>

      <section className="glass-card p-6 md:p-8">
        {activeDb ? (
          <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                {isPaused ? "Em pausa" : "Em curso"}
              </div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {activeParent && activeParent.id !== activeCat?.id && (
                  <>
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: activeParent.color }}
                    />
                    <span className="text-sm font-medium text-muted-foreground">{activeParent.name}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </>
                )}
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: activeCat?.color ?? "#888" }}
                />
                <span className="text-lg font-semibold">{activeCat?.name ?? "—"}</span>
              </div>
              {activeDb.note && (
                <p className="text-sm text-muted-foreground">{activeDb.note}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Iniciado às{" "}
                {new Date(activeStartedAt).toLocaleTimeString("pt-PT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {activePausedMs > 0 && ` · pausado ${fmtDuration(Math.round(activePausedMs / 1000))}`}
              </p>
            </div>
            <div className={`text-5xl md:text-6xl font-mono font-bold tabular-nums ${isPaused ? "text-muted-foreground" : "neon-text"}`}>
              {fmtDuration(elapsedActive)}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 flex-wrap">
                {isPaused ? (
                  <button
                    onClick={() => resumeMut.mutate()}
                    disabled={resumeMut.isPending}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium hover:shadow-glow-strong transition-all"
                  >
                    <Play className="h-4 w-4" /> Retomar
                  </button>
                ) : (
                  <button
                    onClick={() => pauseMut.mutate()}
                    disabled={pauseMut.isPending}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-input border border-border font-medium hover:border-primary/50"
                  >
                    <Pause className="h-4 w-4" /> Pausar
                  </button>
                )}
                <button
                  onClick={() => stopMut.mutate()}
                  disabled={stopMut.isPending}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-input border border-border text-sm hover:border-primary/50"
                >
                  <Square className="h-4 w-4" /> Parar
                </button>
                <button
                  onClick={cancelActive}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-input border border-border text-sm hover:border-destructive/50 hover:text-destructive"
                >
                  <X className="h-4 w-4" /> Descartar
                </button>
              </div>
              <ActiveTimerExtras
                sessionId={activeDb.id}
                startedAt={activeStartedAt}
                elapsed={elapsedActive}
                categoryName={activeCat?.name ?? "—"}
                categoryColor={activeCat?.color ?? "#888"}
                note={activeDb.note ?? ""}
                reminders={activeDb.reminders_minutes ?? []}
                onRemindersChange={async (rs) => {
                  await supabase.from("timer_sessions").update({ reminders_minutes: rs }).eq("id", activeDb.id);
                  qc.invalidateQueries({ queryKey: ["timer-sessions", user?.id] });
                  try { window.localStorage.setItem("cron-reminder-last", JSON.stringify(rs)); } catch {}
                }}
                onStop={() => stopMut.mutate()}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-[10rem_10rem_1fr] gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Categoria
                </label>
                <select
                  value={pickerParentId}
                  onChange={(e) => setPickerParentId(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm"
                >
                  {parentCats.length === 0 && <option value="">— sem categorias —</option>}
                  {parentCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Subcategoria
                </label>
                <select
                  value={pickerCatId}
                  onChange={(e) => setPickerCatId(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm"
                  disabled={!pickerParentId}
                >
                  <option value={pickerParentId}>— (nenhuma) —</option>
                  {subCatsOf(pickerParentId).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Nota (opcional)
                </label>
                <input
                  value={pickerNote}
                  onChange={(e) => setPickerNote(e.target.value)}
                  placeholder="A trabalhar em..."
                  className="mt-1 w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") startMut.mutate();
                  }}
                />
              </div>
              <div className="md:col-span-3">
                <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Lembretes (notificação após o início) · podes escolher vários
                </label>
                <RemindersPicker value={pickerReminders} onChange={setPickerReminders} />
              </div>
            </div>
            <button
              onClick={() => startMut.mutate()}
              disabled={cats.length === 0 || startMut.isPending}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium hover:shadow-glow-strong transition-all disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Iniciar
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-1 rounded-xl border border-border bg-card/60 p-1">
          {(["day", "week", "month"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "day" ? "Dia" : p === "week" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shift(-1)}
            className="px-3 py-1.5 rounded-lg bg-input border border-border text-xs"
          >
            ◀
          </button>
          <span className="text-sm font-medium capitalize px-2 min-w-[10rem] text-center">
            {periodLabel}
          </span>
          <button
            onClick={() => shift(1)}
            className="px-3 py-1.5 rounded-lg bg-input border border-border text-xs"
          >
            ▶
          </button>
          <button
            onClick={() => setRefDate(new Date())}
            className="px-3 py-1.5 rounded-lg bg-input border border-border text-xs"
          >
            Hoje
          </button>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground mr-1">
          Filtrar
        </span>
        <select
          value={parentFilter}
          onChange={(e) => {
            setParentFilter(e.target.value);
            setSubFilter("all");
          }}
          className="px-3 py-1.5 rounded-lg bg-input border border-border text-xs"
        >
          <option value="all">Todas as categorias</option>
          {parentCats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={subFilter}
          onChange={(e) => setSubFilter(e.target.value)}
          disabled={parentFilter === "all" || subCatsOf(parentFilter).length === 0}
          className="px-3 py-1.5 rounded-lg bg-input border border-border text-xs disabled:opacity-50"
        >
          <option value="all">Todas as subcategorias</option>
          {parentFilter !== "all" && subCatsOf(parentFilter).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {(parentFilter !== "all" || subFilter !== "all") && (
          <button
            onClick={() => { setParentFilter("all"); setSubFilter("all"); }}
            className="px-2 py-1.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
          >
            Limpar
          </button>
        )}
      </section>



      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Tempo total
          </div>
          <div className="text-2xl font-bold neon-text mt-1">{fmtDuration(totalSec)}</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Sessões</div>
          <div className="text-2xl font-bold mt-1">{inPeriod.length}</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Top categoria
          </div>
          <div className="text-lg font-semibold mt-1 truncate">
            {byCategory[0]?.name ?? "—"}
            {byCategory[0] && (
              <span className="text-xs text-muted-foreground ml-2">
                {fmtHoursShort(byCategory[0].value)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">
            Horas por {period === "day" ? "hora" : period === "week" ? "dia" : "dia do mês"}
          </h3>
          {totalSec === 0 ? (
            <EmptyChart label="Sem sessões neste período" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--popover-foreground)",
                  }}
                  formatter={(v: number) => `${v.toFixed(2)}h`}
                />
                <Bar dataKey="hours" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
              Distribuição {breakdownMode === "parent" ? "por categoria" : "por subcategoria"}
            </h3>
            <div className="flex gap-1 rounded-lg border border-border bg-card/60 p-0.5">
              <button
                onClick={() => setBreakdownMode("parent")}
                className={`px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider transition-colors ${
                  breakdownMode === "parent" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Categoria
              </button>
              <button
                onClick={() => setBreakdownMode("sub")}
                className={`px-2 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider transition-colors ${
                  breakdownMode === "sub" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Subcategoria
              </button>
            </div>
          </div>
          {byCategory.length === 0 ? (
            <EmptyChart label="Sem dados" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={breakdownMode === "parent" ? byCategory : bySubcategory}
                    dataKey="value"
                    nameKey={breakdownMode === "parent" ? "name" : "subName"}
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="var(--background)"
                  >
                    {(breakdownMode === "parent" ? byCategory : bySubcategory).map((c: any, i) => (
                      <Cell key={i} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(v: number, _n, item: any) => {
                      const p = item?.payload;
                      const label = breakdownMode === "sub" && p?.parentName && p?.parentName !== p?.subName
                        ? `${p.parentName} › ${p.subName}`
                        : (p?.name ?? p?.subName);
                      return [fmtHoursShort(v), label];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2 max-h-48 overflow-y-auto pr-1">
                {breakdownMode === "parent"
                  ? byCategory.map((c) => {
                      const pct = totalSec > 0 ? (c.value / totalSec) * 100 : 0;
                      return (
                        <div key={c.name} className="flex items-center gap-2 text-xs">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ background: c.color }}
                          />
                          <span className="flex-1 truncate">{c.name}</span>
                          <span className="text-muted-foreground tabular-nums">
                            {fmtHoursShort(c.value)} · {pct.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })
                  : bySubcategory.map((c) => {
                      const pct = totalSec > 0 ? (c.value / totalSec) * 100 : 0;
                      return (
                        <div key={c.key} className="flex items-center gap-2 text-xs">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ background: c.color }}
                          />
                          <span className="flex-1 truncate">
                            <span className="text-muted-foreground">{c.parentName} › </span>
                            {c.subName}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {fmtHoursShort(c.value)} · {pct.toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
              </div>
            </>
          )}
        </div>
      </div>

      <section className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
            Sessões ({inPeriod.length})
          </h3>
        </div>
        {inPeriod.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sem sessões registadas neste período.
          </p>
        ) : (
          <div className="relative w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Subcategoria</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead className="text-right">Duração</TableHead>
                  <TableHead className="w-20 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inPeriod.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: s.parentColor }}
                        />
                        <span className="font-medium truncate">{s.parentName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.parentId && s.parentId !== s.categoryId ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ background: s.categoryColor }}
                          />
                          <span className="truncate">{s.categoryName}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(s.startedAt).toLocaleString("pt-PT", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {new Date(s.endedAt).toLocaleTimeString("pt-PT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums whitespace-nowrap">
                      {fmtDuration(s.durationSeconds)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingSession(s)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
                          aria-label="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => removeSession(s.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>


      {catManagerOpen && (
        <CategoryManager
          cats={cats}
          userId={user!.id}
          sessions={completedSessions}
          onClose={() => setCatManagerOpen(false)}
          onChanged={() => qc.invalidateQueries({ queryKey: ["timer-categories", user!.id] })}
        />
      )}

      {editingSession && (
        <SessionEditor
          session={editingSession}
          cats={cats}
          onClose={() => setEditingSession(null)}
          onSave={(updated) => {
            updateSessionMut.mutate(updated);
            setEditingSession(null);
          }}
        />
      )}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-[220px] grid place-items-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function CategoryManager({
  cats,
  userId,
  sessions,
  onClose,
  onChanged,
}: {
  cats: Cat[];
  userId: string;
  sessions: Session[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#ff7a18");
  const [parentId, setParentId] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const used = new Set(sessions.map((s) => s.categoryId));
  const parents = cats.filter((c) => !c.parentId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from("timer_categories")
          .update({ name: trimmed, color, parent_id: parentId || null })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("timer_categories")
          .insert({ user_id: userId, name: trimmed, color, parent_id: parentId || null });
        if (error) throw error;
      }
      setName("");
      setColor("#ff7a18");
      setParentId("");
      setEditingId(null);
      onChanged();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const edit = (c: Cat) => {
    setEditingId(c.id);
    setName(c.name);
    setColor(c.color);
    setParentId(c.parentId ?? "");
  };

  const remove = async (c: Cat) => {
    if (used.has(c.id)) {
      alert("Não podes eliminar: existem sessões com esta categoria.");
      return;
    }
    if (!confirm(`Eliminar "${c.name}"?`)) return;
    const { error } = await supabase.from("timer_categories").delete().eq("id", c.id);
    if (error) {
      alert(error.message);
      return;
    }
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Categorias e subcategorias</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent/40"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 border-b border-border space-y-3">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome"
              className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-12 rounded-lg bg-input border border-border cursor-pointer"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Categoria-mãe (opcional)
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
            >
              <option value="">— Nenhuma (categoria principal) —</option>
              {parents
                .filter((p) => p.id !== editingId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> {editingId ? "Guardar" : "Adicionar"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setName("");
                  setColor("#ff7a18");
                  setParentId("");
                }}
                className="px-3 py-2 rounded-lg bg-input border border-border text-sm"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
        <div className="max-h-80 overflow-y-auto p-3 space-y-1">
          {parents.map((p) => {
            const subs = cats.filter((c) => c.parentId === p.id);
            return (
              <div key={p.id}>
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/30">
                  <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                  <span className="flex-1 text-sm font-medium">{p.name}</span>
                  <button onClick={() => edit(p)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(p)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {subs.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 pl-8 pr-3 py-1.5 rounded-lg hover:bg-accent/30"
                  >
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1 text-sm text-muted-foreground">{c.name}</span>
                    <button onClick={() => edit(c)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button onClick={() => remove(c)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SessionEditor({
  session,
  cats,
  onClose,
  onSave,
}: {
  session: Session;
  cats: Cat[];
  onClose: () => void;
  onSave: (s: Session) => void;
}) {
  const parents = useMemo(() => cats.filter((c) => !c.parentId), [cats]);
  const initialParentId = useMemo(() => {
    const cur = cats.find((c) => c.id === session.categoryId);
    return cur?.parentId ?? cur?.id ?? parents[0]?.id ?? "";
  }, [cats, session.categoryId, parents]);
  const initialSubId = useMemo(() => {
    const cur = cats.find((c) => c.id === session.categoryId);
    return cur?.parentId ? cur.id : "";
  }, [cats, session.categoryId]);

  const [parentId, setParentId] = useState(initialParentId);
  const [subId, setSubId] = useState(initialSubId);
  const [note, setNote] = useState(session.note);
  const [startStr, setStartStr] = useState(toLocalInput(session.startedAt));
  const [endStr, setEndStr] = useState(toLocalInput(session.endedAt));

  const subs = useMemo(() => cats.filter((c) => c.parentId === parentId), [cats, parentId]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const startedAt = fromLocalInput(startStr);
    const endedAt = fromLocalInput(endStr);
    if (!(endedAt > startedAt)) {
      alert("Hora de fim tem de ser depois do início.");
      return;
    }
    const effectiveId = subId || parentId;
    const cat = cats.find((c) => c.id === effectiveId);
    const parentCat = cat?.parentId ? cats.find((c) => c.id === cat.parentId) : cat;
    onSave({
      ...session,
      categoryId: cat?.id ?? session.categoryId,
      categoryName: cat?.name ?? session.categoryName,
      categoryColor: cat?.color ?? session.categoryColor,
      parentId: parentCat?.id ?? null,
      parentName: parentCat?.name ?? cat?.name ?? session.parentName,
      parentColor: parentCat?.color ?? cat?.color ?? session.parentColor,
      note: note.trim(),
      startedAt,
      endedAt,
      durationSeconds: Math.round((endedAt - startedAt) / 1000),
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Editar sessão</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Categoria
            </label>
            <select
              value={parentId}
              onChange={(e) => { setParentId(e.target.value); setSubId(""); }}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
            >
              {parents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Subcategoria
            </label>
            <select
              value={subId}
              onChange={(e) => setSubId(e.target.value)}
              disabled={subs.length === 0}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border text-sm disabled:opacity-50"
            >
              <option value="">{subs.length === 0 ? "(sem subcategorias)" : "(nenhuma)"}</option>
              {subs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Nota
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Início
              </label>
              <input
                type="datetime-local"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Fim
              </label>
              <input
                type="datetime-local"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-input border border-border text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================
// Floating PiP window + reminder notifications
// ============================================================

const REMINDER_PRESETS = [15, 30, 45, 60, 90, 120, 180];

function fmtMinutes(m: number) {
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem ? `${h}h ${rem}m` : `${h}h`;
  }
  return `${m} min`;
}

async function ensureNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

function RemindersPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState("");
  const toggle = (m: number) => {
    const has = value.includes(m);
    const next = has ? value.filter((x) => x !== m) : [...value, m].sort((a, b) => a - b);
    onChange(next);
    if (!has) void ensureNotificationPermission();
  };
  const addCustom = () => {
    const n = Math.max(1, Math.floor(Number(customVal) || 0));
    if (n > 0 && !value.includes(n)) {
      onChange([...value, n].sort((a, b) => a - b));
      void ensureNotificationPermission();
    }
    setCustomOpen(false);
    setCustomVal("");
  };
  const all = Array.from(new Set([...REMINDER_PRESETS, ...value])).sort((a, b) => a - b);
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {all.map((m) => {
        const active = value.includes(m);
        return (
          <button
            key={m}
            type="button"
            onClick={() => toggle(m)}
            className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
              active
                ? "bg-primary/15 border-primary/60 text-primary"
                : "bg-input border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {active && <Bell className="inline h-3 w-3 mr-1 -mt-0.5" />}
            {fmtMinutes(m)}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setCustomOpen(true)}
        className="px-2.5 py-1 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:border-primary/40"
      >
        <Plus className="inline h-3 w-3 -mt-0.5" /> Personalizado
      </button>
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="px-2.5 py-1 rounded-full text-xs text-muted-foreground hover:text-destructive"
        >
          Limpar
        </button>
      )}
      {customOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setCustomOpen(false)}>
          <div className="glass-card p-5 w-full max-w-xs space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">Lembrete personalizado</h3>
            <label className="text-xs text-muted-foreground">Minutos após o início</label>
            <input
              autoFocus
              type="number"
              min={1}
              value={customVal}
              onChange={(e) => setCustomVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
              placeholder="ex: 45"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCustomOpen(false)} className="px-3 py-1.5 rounded-lg bg-input border border-border text-xs">Cancelar</button>
              <button onClick={addCustom} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs">Adicionar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveTimerExtras({
  sessionId,
  startedAt,
  elapsed,
  categoryName,
  categoryColor,
  note,
  reminders,
  onRemindersChange,
  onStop,
}: {
  sessionId: string;
  startedAt: number;
  elapsed: number;
  categoryName: string;
  categoryColor: string;
  note: string;
  reminders: number[];
  onRemindersChange: (v: number[]) => void;
  onStop: () => void;
}) {
  // Fire each reminder once per device. Key includes sessionId so each session is independent across devices.
  const firedKey = `cron-fired-${sessionId}`;
  const firedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      firedRef.current = new Set(JSON.parse(window.localStorage.getItem(firedKey) || "[]"));
    } catch {
      firedRef.current = new Set();
    }
  }, [firedKey]);

  useEffect(() => {
    if (!reminders.length) return;
    let changed = false;
    for (const m of reminders) {
      if (firedRef.current.has(m)) continue;
      if (elapsed >= m * 60) {
        firedRef.current.add(m);
        changed = true;
        const title = `⏱ ${categoryName} — ${fmtMinutes(m)}`;
        const body = `Já passaram ${fmtMinutes(m)}${note ? ` · ${note}` : ""}`;
        try {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(title, { body, tag: `timer-${sessionId}-${m}`, renotify: true } as any);
          }
        } catch {}
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 880; g.gain.value = 0.05;
          o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 350);
        } catch {}
      }
    }
    if (changed) {
      try { window.localStorage.setItem(firedKey, JSON.stringify([...firedRef.current])); } catch {}
    }
  }, [elapsed, reminders, categoryName, note, sessionId, firedKey]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <FloatingWindowButton
          startedAt={startedAt}
          categoryName={categoryName}
          categoryColor={categoryColor}
          note={note}
          onStop={onStop}
        />
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          {reminders.length ? <Bell className="h-3 w-3 text-primary" /> : <BellOff className="h-3 w-3" />}
          {reminders.length ? `Lembretes: ${reminders.map(fmtMinutes).join(" · ")}` : "Sem lembretes"}
        </span>
      </div>
      <RemindersPicker value={reminders} onChange={onRemindersChange} />
    </div>
  );
}

function FloatingWindowButton({
  startedAt,
  categoryName,
  categoryColor,
  note,
  onStop,
}: {
  startedAt: number;
  categoryName: string;
  categoryColor: string;
  note: string;
  onStop: () => void;
}) {
  const [pipWin, setPipWin] = useState<Window | null>(null);
  const [now, setNow] = useState(Date.now());
  const supportsDocPiP = typeof window !== "undefined" && "documentPictureInPicture" in window;

  useEffect(() => {
    if (!pipWin) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pipWin]);

  const open = async () => {
    if (!supportsDocPiP) {
      alert(
        "O teu browser não suporta janela flutuante (Document Picture-in-Picture). Usa Chrome/Edge atualizados em desktop."
      );
      return;
    }
    try {
      const w: Window = await (window as any).documentPictureInPicture.requestWindow({
        width: 280,
        height: 160,
      });
      // copy styles
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
      w.addEventListener("pagehide", () => setPipWin(null));
      setPipWin(w);
    } catch (err) {
      console.error(err);
    }
  };

  const close = () => {
    pipWin?.close();
    setPipWin(null);
  };

  const elapsed = Math.floor((now - startedAt) / 1000);

  return (
    <>
      <button
        onClick={pipWin ? close : open}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
        title={supportsDocPiP ? "Janela flutuante" : "Não suportado neste browser"}
      >
        <PictureInPicture2 className="h-3.5 w-3.5" />
        {pipWin ? "Fechar janela" : "Janela flutuante"}
      </button>
      {pipWin && createPortal(
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
            <span style={{ width: 10, height: 10, borderRadius: 999, background: categoryColor }} />
            <span style={{ fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{categoryName}</span>
          </div>
          {note && (
            <div style={{ fontSize: 11, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note}</div>
          )}
          <div style={{
            fontSize: 38,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            textAlign: "center",
            lineHeight: 1.1,
          }}>
            {fmtDuration(elapsed)}
          </div>
          <button
            onClick={() => { onStop(); close(); }}
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
      )}
    </>
  );
}
