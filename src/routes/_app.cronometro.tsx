import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Play, Square, Plus, Pencil, Trash2, X, Timer, Tags as TagsIcon,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from "recharts";

export const Route = createFileRoute("/_app/cronometro")({
  component: CronometroPage,
});

interface Cat {
  id: string;
  name: string;
  color: string;
}
interface Session {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  note: string;
  startedAt: number;   // ms epoch
  endedAt: number;     // ms epoch
  durationSeconds: number;
}
interface Active {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  note: string;
  startedAt: number;
}

const CATS_KEY = "cronometro:categories";
const SESSIONS_KEY = "cronometro:sessions";
const ACTIVE_KEY = "cronometro:active";

const DEFAULT_CATS: Cat[] = [
  { id: "c-trabalho", name: "Trabalho", color: "#ff7a18" },
  { id: "c-estudo", name: "Estudo", color: "#60a5fa" },
  { id: "c-exercicio", name: "Exercício", color: "#34d399" },
  { id: "c-lazer", name: "Lazer", color: "#f472b6" },
  { id: "c-projeto", name: "Projeto pessoal", color: "#a78bfa" },
];

const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

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
    const dow = (d.getDay() + 6) % 7; // segunda = 0
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
  const [cats, setCats] = useState<Cat[]>(() => {
    const c = loadJSON<Cat[]>(CATS_KEY, []);
    if (c.length === 0) {
      saveJSON(CATS_KEY, DEFAULT_CATS);
      return DEFAULT_CATS;
    }
    return c;
  });
  const [sessions, setSessions] = useState<Session[]>(() => loadJSON<Session[]>(SESSIONS_KEY, []));
  const [active, setActive] = useState<Active | null>(() => loadJSON<Active | null>(ACTIVE_KEY, null));
  const [tickNow, setTickNow] = useState(Date.now());
  const [pickerCatId, setPickerCatId] = useState<string>("");
  const [pickerNote, setPickerNote] = useState("");
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [period, setPeriod] = useState<Period>("week");
  const [refDate, setRefDate] = useState<Date>(new Date());

  // persist on change
  useEffect(() => saveJSON(CATS_KEY, cats), [cats]);
  useEffect(() => saveJSON(SESSIONS_KEY, sessions), [sessions]);
  useEffect(() => saveJSON(ACTIVE_KEY, active), [active]);

  // tick every second while a timer is running
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // sync default picker category
  useEffect(() => {
    if (!pickerCatId && cats[0]) setPickerCatId(cats[0].id);
  }, [cats, pickerCatId]);

  const start = () => {
    if (active) return;
    const cat = cats.find((c) => c.id === pickerCatId);
    if (!cat) {
      alert("Escolhe uma categoria primeiro.");
      return;
    }
    setActive({
      categoryId: cat.id,
      categoryName: cat.name,
      categoryColor: cat.color,
      note: pickerNote.trim(),
      startedAt: Date.now(),
    });
    setPickerNote("");
  };

  const stop = () => {
    if (!active) return;
    const endedAt = Date.now();
    const duration = Math.max(1, Math.round((endedAt - active.startedAt) / 1000));
    const sess: Session = {
      id: uid(),
      categoryId: active.categoryId,
      categoryName: active.categoryName,
      categoryColor: active.categoryColor,
      note: active.note,
      startedAt: active.startedAt,
      endedAt,
      durationSeconds: duration,
    };
    setSessions((prev) => [sess, ...prev]);
    setActive(null);
  };

  const cancelActive = () => {
    if (!active) return;
    if (!confirm("Descartar sessão em curso?")) return;
    setActive(null);
  };

  const removeSession = (id: string) => {
    if (!confirm("Eliminar sessão?")) return;
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  // ---- Reports
  const pStart = periodStart(period, refDate);
  const pEnd = periodEnd(period, refDate);
  const inPeriod = sessions.filter((s) => s.startedAt >= pStart && s.startedAt < pEnd);
  const totalSec = inPeriod.reduce((acc, s) => acc + s.durationSeconds, 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; color: string; value: number }>();
    for (const s of inPeriod) {
      const row = map.get(s.categoryId) ?? {
        name: s.categoryName,
        color: s.categoryColor,
        value: 0,
      };
      row.value += s.durationSeconds;
      map.set(s.categoryId, row);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [inPeriod]);

  const buckets = useMemo(() => {
    // bar chart buckets based on period
    if (period === "day") {
      // 24 hourly buckets
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

  const elapsedActive = active ? Math.floor((tickNow - active.startedAt) / 1000) : 0;

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold neon-text flex items-center gap-2">
            <Timer className="h-6 w-6" /> Cronómetro
          </h1>
          <p className="text-sm text-muted-foreground">
            Mede onde gastas o teu tempo e vê relatórios por dia, semana ou mês.
          </p>
        </div>
        <button
          onClick={() => setCatManagerOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
        >
          <TagsIcon className="h-3.5 w-3.5" /> Categorias
        </button>
      </div>

      {/* Timer card */}
      <section className="glass-card p-6 md:p-8">
        {active ? (
          <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                Em curso
              </div>
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: active.categoryColor }}
                />
                <span className="text-lg font-semibold">{active.categoryName}</span>
              </div>
              {active.note && (
                <p className="text-sm text-muted-foreground">{active.note}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Iniciado às{" "}
                {new Date(active.startedAt).toLocaleTimeString("pt-PT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <div className="text-5xl md:text-6xl font-mono font-bold neon-text tabular-nums">
              {fmtDuration(elapsedActive)}
            </div>
            <div className="flex gap-2">
              <button
                onClick={stop}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium hover:shadow-glow-strong transition-all"
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
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-[14rem_1fr] gap-3">
              <div>
                <label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Categoria
                </label>
                <select
                  value={pickerCatId}
                  onChange={(e) => setPickerCatId(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 rounded-lg bg-input border border-border text-sm"
                >
                  {cats.length === 0 && <option value="">— sem categorias —</option>}
                  {cats.map((c) => (
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
                    if (e.key === "Enter") start();
                  }}
                />
              </div>
            </div>
            <button
              onClick={start}
              disabled={cats.length === 0}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium hover:shadow-glow-strong transition-all disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Iniciar
            </button>
          </div>
        )}
      </section>

      {/* Reports header */}
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

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Tempo total
          </div>
          <div className="text-2xl font-bold neon-text mt-1">{fmtDuration(totalSec)}</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Sessões
          </div>
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

      {/* Charts */}
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
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => `${v.toFixed(2)}h`}
                />
                <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">
            Distribuição por categoria
          </h3>
          {byCategory.length === 0 ? (
            <EmptyChart label="Sem dados" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="hsl(var(--background))"
                  >
                    {byCategory.map((c, i) => (
                      <Cell key={i} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => fmtHoursShort(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {byCategory.map((c) => {
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
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sessions table */}
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
          <div className="space-y-1.5">
            {inPeriod.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-input/40 border border-border/60 hover:border-primary/40 transition-colors"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: s.categoryColor }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">
                    <span className="font-medium">{s.categoryName}</span>
                    {s.note && (
                      <span className="text-muted-foreground"> · {s.note}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(s.startedAt).toLocaleString("pt-PT", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" → "}
                    {new Date(s.endedAt).toLocaleTimeString("pt-PT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="text-sm font-mono tabular-nums">
                  {fmtDuration(s.durationSeconds)}
                </div>
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
            ))}
          </div>
        )}
      </section>

      {catManagerOpen && (
        <CategoryManager
          cats={cats}
          setCats={setCats}
          sessions={sessions}
          onClose={() => setCatManagerOpen(false)}
        />
      )}

      {editingSession && (
        <SessionEditor
          session={editingSession}
          cats={cats}
          onClose={() => setEditingSession(null)}
          onSave={(updated) => {
            setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
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
  setCats,
  sessions,
  onClose,
}: {
  cats: Cat[];
  setCats: (c: Cat[]) => void;
  sessions: Session[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#ff7a18");
  const [editingId, setEditingId] = useState<string | null>(null);

  const used = new Set(sessions.map((s) => s.categoryId));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editingId) {
      setCats(cats.map((c) => (c.id === editingId ? { ...c, name: trimmed, color } : c)));
    } else {
      setCats([...cats, { id: uid(), name: trimmed, color }]);
    }
    setName("");
    setColor("#ff7a18");
    setEditingId(null);
  };

  const edit = (c: Cat) => {
    setEditingId(c.id);
    setName(c.name);
    setColor(c.color);
  };

  const remove = (c: Cat) => {
    if (used.has(c.id)) {
      alert("Não podes eliminar: existem sessões com esta categoria. Apaga-as primeiro.");
      return;
    }
    if (!confirm(`Eliminar "${c.name}"?`)) return;
    setCats(cats.filter((x) => x.id !== c.id));
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Categorias</h3>
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
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm"
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
                }}
                className="px-3 py-2 rounded-lg bg-input border border-border text-sm"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
        <div className="max-h-80 overflow-y-auto p-3 space-y-1">
          {cats.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent/30"
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: c.color }}
              />
              <span className="flex-1 text-sm">{c.name}</span>
              <button
                onClick={() => edit(c)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => remove(c)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
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
  const [categoryId, setCategoryId] = useState(session.categoryId);
  const [note, setNote] = useState(session.note);
  const [startStr, setStartStr] = useState(toLocalInput(session.startedAt));
  const [endStr, setEndStr] = useState(toLocalInput(session.endedAt));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const startedAt = fromLocalInput(startStr);
    const endedAt = fromLocalInput(endStr);
    if (!(endedAt > startedAt)) {
      alert("Hora de fim tem de ser depois do início.");
      return;
    }
    const cat = cats.find((c) => c.id === categoryId) ?? cats[0];
    onSave({
      ...session,
      categoryId: cat?.id ?? session.categoryId,
      categoryName: cat?.name ?? session.categoryName,
      categoryColor: cat?.color ?? session.categoryColor,
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
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border text-sm"
            >
              {cats.map((c) => (
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
