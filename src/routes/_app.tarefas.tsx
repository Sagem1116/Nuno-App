import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Plus, X, Trash2, Pencil, CheckSquare, Calendar as CalIcon,
  ChevronLeft, ChevronRight, Download, Upload,
} from "lucide-react";
import {
  format, startOfWeek, endOfWeek, addDays, isSameDay, parseISO,
  startOfMonth, endOfMonth, isSameMonth, addMonths, subMonths,
  startOfDay,
} from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Field, inputCls, EmptyState } from "./_app.notas";
import { exportTable, importTable } from "@/lib/data-io";
import { AutoExportMenu } from "@/components/auto-export-menu";
import { DangerZone, deleteAllForUser } from "@/components/danger-zone";
import { snooze, takePendingSnoozePrompt } from "@/lib/notifications";

export const Route = createFileRoute("/_app/tarefas")({
  component: TasksPage,
});

type Priority = "low" | "medium" | "high";
type Status = "pending" | "done";

interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  due_date: string | null;
  start_time: string | null;
  end_time: string | null;
  notify_lead_minutes: number | null;
  status: Status;
  created_at: string;
}

type View = "daily" | "weekly" | "monthly";

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa", medium: "Média", high: "Alta",
};

const PRIORITY_CLASS: Record<Priority, string> = {
  low: "bg-primary/15 text-primary border-primary/40",
  medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
  high: "bg-red-500/15 text-red-400 border-red-500/40",
};

// Sort tasks by start_time ascending; tasks without start_time go last.
const byStartTime = (a: Task, b: Task) => {
  const sa = a.start_time ?? "99:99";
  const sb = b.start_time ?? "99:99";
  if (sa !== sb) return sa.localeCompare(sb);
  return (a.due_date ?? "").localeCompare(b.due_date ?? "");
};

function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("daily");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [filterPriority, setFilterPriority] = useState<Priority | "all">("all");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    const { data, error } = await (supabase as any)
      .from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("Failed to load tasks:", error);
      setMessage("Não foi possível carregar as tarefas. Tenta novamente.");
      setTasks([]);
    } else {
      setTasks((data as Task[]) ?? []);
    }

    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Snooze prompt — set when the user clicks a desktop notification.
  useEffect(() => {
    const check = () => {
      const p = takePendingSnoozePrompt();
      if (!p) return;
      if (confirm(`Adiar "${p.label}" 10 minutos?`)) {
        snooze(p.key, 10);
        setMessage("Notificação adiada por 10 minutos.");
      }
    };
    check();
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const filteredAll = useMemo(() => tasks.filter((t) => {
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    return true;
  }), [tasks, filterPriority, filterStatus]);

  const toggleStatus = async (t: Task) => {
    const previousTasks = tasks;
    const newStatus: Status = t.status === "done" ? "pending" : "done";
    setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: newStatus } : x));

    const { error } = await (supabase as any).from("tasks").update({ status: newStatus }).eq("id", t.id);
    if (error) {
      console.error("Failed to update task status:", error);
      setMessage("Não foi possível atualizar o estado da tarefa.");
      setTasks(previousTasks);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminar tarefa?")) return;
    const previousTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));

    const { error } = await (supabase as any).from("tasks").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete task:", error);
      setMessage("Não foi possível eliminar a tarefa. Tenta novamente.");
      setTasks(previousTasks);
    }
  };

  const handleSave = async (data: {
    title: string; description: string; priority: Priority; due_date: string | null;
    start_time: string | null; end_time: string | null; notify_lead_minutes: number | null;
  }) => {
    if (!user) {
      setMessage("Precisas de iniciar sessão para guardar tarefas.");
      return;
    }
    setMessage(null);

    if (editing) {
      const { data: upd, error } = await (supabase as any).from("tasks")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", editing.id).select().single();
      if (error) {
        console.error("Failed to update task:", error);
        setMessage("Não foi possível atualizar a tarefa. Tenta novamente.");
        return;
      }
      if (upd) setTasks((p) => p.map((t) => t.id === editing.id ? (upd as Task) : t));
    } else {
      const { data: ins, error } = await (supabase as any).from("tasks")
        .insert({ ...data, user_id: user.id, status: "pending" })
        .select().single();
      if (error) {
        console.error("Failed to insert task:", error);
        setMessage("Não foi possível guardar a tarefa. Tenta novamente.");
        return;
      }
      if (ins) setTasks((p) => [...p, ins as Task]);
    }

    setOpen(false);
  };

  return (
    <div className="page-enter space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-lg bg-card/50 border border-border w-fit">
          {(["daily", "weekly", "monthly"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={[
              "px-4 py-1.5 rounded-md text-xs uppercase tracking-wider transition-all",
              view === v
                ? "bg-primary text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}>
              {v === "daily" ? "Hoje" : v === "weekly" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportTable("tasks")}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
          >
            <Download className="h-3.5 w-3.5" /> Exportar JSON
          </button>
          <button
            onClick={async () => { if (user) { await importTable("tasks", user.id); await load(); } }}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
          >
            <Upload className="h-3.5 w-3.5" /> Importar JSON
          </button>
          <AutoExportMenu table="tasks" label="Tarefas" />
          <button onClick={() => { setEditing(null); setOpen(true); }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium text-sm hover:shadow-glow-strong transition-all">
            <Plus className="h-4 w-4" /> Nova tarefa
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <span className="text-muted-foreground uppercase tracking-wider">Filtros:</span>
        <Select value={filterPriority} onChange={setFilterPriority as (v: string) => void}
          options={[
            { value: "all", label: "Todas prioridades" },
            { value: "low", label: "Baixa" },
            { value: "medium", label: "Média" },
            { value: "high", label: "Alta" },
          ]} />
        <Select value={filterStatus} onChange={setFilterStatus as (v: string) => void}
          options={[
            { value: "all", label: "Todos estados" },
            { value: "pending", label: "Pendentes" },
            { value: "done", label: "Concluídas" },
          ]} />
      </div>

      {message ? (
        <div className="rounded-3xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {message}
        </div>
      ) : null}

      {/* Content */}
      {loading ? (
        <div className="text-muted-foreground text-sm">A carregar...</div>
      ) : view === "daily" ? (
        <DailyView tasks={filteredAll} onToggle={toggleStatus} onEdit={(t) => { setEditing(t); setOpen(true); }} onDelete={remove} />
      ) : view === "weekly" ? (
        <WeeklyView tasks={filteredAll} cursor={cursor} setCursor={setCursor}
          onSelectDay={(d) => setSelectedDay(d)}
          onToggle={toggleStatus} onEdit={(t) => { setEditing(t); setOpen(true); }} onDelete={remove} />
      ) : (
        <MonthlyView tasks={filteredAll} cursor={cursor} setCursor={setCursor}
          onSelectDay={(d) => setSelectedDay(d)} />
      )}

      {open && (
        <TaskDialog
          initial={editing && editing.id ? editing : null}
          prefillDate={editing && !editing.id ? editing.due_date : (selectedDay ? format(selectedDay, "yyyy-MM-dd") : null)}
          onClose={() => setOpen(false)}
          onSave={handleSave}
        />
      )}

      {/* Selected day tasks panel */}
      {selectedDay && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold neon-text">{format(selectedDay, "EEEE, d 'de' MMMM", { locale: pt })}</h3>
            <div className="flex gap-2">
              <button onClick={() => { setSelectedDay(null); }} className="px-2 py-1 text-sm rounded hover:bg-accent">Fechar</button>
              <button onClick={() => { setEditing(null); setOpen(true); }} className="px-2 py-1 text-sm rounded bg-primary text-primary-foreground">Nova</button>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <DayTasksList date={selectedDay} tasks={filteredAll} onToggle={toggleStatus} onEdit={(t) => { setEditing(t); setOpen(true); }} onDelete={remove} />
          </div>
        </div>
      )}
      {user && (
        <DangerZone
          title="Apagar todas as tarefas"
          description="Remove permanentemente todas as tarefas (pendentes e concluídas)."
          confirmText="APAGAR TAREFAS"
          onConfirm={async () => {
            const n = await deleteAllForUser(supabase, user.id, ["tasks"]);
            await load();
            return { count: n };
          }}
        />
      )}
    </div>
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 rounded-md bg-input border border-border text-xs focus:border-primary focus:outline-none focus:shadow-glow">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ---- Daily ----
function DailyView({ tasks, onToggle, onEdit, onDelete }: {
  tasks: Task[];
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (id: string) => void;
}) {
  const today = startOfDay(new Date());
  const overdue = tasks.filter((t) => t.due_date && parseISO(t.due_date) < today && t.status === "pending").sort(byStartTime);
  const todays = tasks.filter((t) => t.due_date && isSameDay(parseISO(t.due_date), today)).sort(byStartTime);
  const noDate = tasks.filter((t) => !t.due_date && t.status === "pending").sort(byStartTime);

  if (tasks.length === 0) return <EmptyState icon={CheckSquare} label="Sem tarefas." />;

  return (
    <div className="space-y-6">
      {overdue.length > 0 && (
        <Section title="Atrasadas" accent>
          {overdue.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}
        </Section>
      )}
      <Section title={`Hoje · ${format(today, "EEEE, d 'de' MMMM", { locale: pt })}`}>
        {todays.length === 0
          ? <p className="text-sm text-muted-foreground">Nada para hoje.</p>
          : todays.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}
      </Section>
      {noDate.length > 0 && (
        <Section title="Sem data">
          {noDate.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}
        </Section>
      )}
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className={["text-xs uppercase tracking-widest", accent ? "text-destructive" : "text-muted-foreground"].join(" ")}>
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

// ---- Weekly ----
function WeeklyView({ tasks, cursor, setCursor, onToggle, onEdit, onDelete, onSelectDay }: {
  tasks: Task[]; cursor: Date; setCursor: (d: Date) => void;
  onToggle: (t: Task) => void; onEdit: (t: Task) => void; onDelete: (id: string) => void;
  onSelectDay?: (d: Date) => void;
}) {
  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="space-y-4">
      <Nav
        label={`${format(weekStart, "d MMM", { locale: pt })} – ${format(endOfWeek(cursor, { weekStartsOn: 1 }), "d MMM yyyy", { locale: pt })}`}
        onPrev={() => setCursor(addDays(weekStart, -7))}
        onNext={() => setCursor(addDays(weekStart, 7))}
        onToday={() => setCursor(new Date())}
      />
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {days.map((d) => {
          const dayTasks = tasks.filter((t) => t.due_date && isSameDay(parseISO(t.due_date), d)).sort(byStartTime);
          const isToday = isSameDay(d, new Date());
          return (
            <div key={d.toISOString()} className={[
              "glass-card p-3 min-h-[140px] flex flex-col gap-2",
              isToday ? "neon-border" : "",
            ].join(" ")}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {format(d, "EEE", { locale: pt })}
              </div>
              <button type="button" onClick={() => onSelectDay?.(d)} className={["text-lg font-semibold text-left", isToday ? "neon-text" : ""].join(" ")}>
                {format(d, "d")}
              </button>
              <div className="space-y-1.5 flex-1">
                {dayTasks.map((t) => (
                  <MiniTask key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Monthly ----
function MonthlyView({ tasks, cursor, setCursor, onSelectDay }: {
  tasks: Task[]; cursor: Date; setCursor: (d: Date) => void;
  onSelectDay?: (d: Date) => void;
}) {
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  return (
    <div className="space-y-4">
      <Nav
        label={format(cursor, "MMMM 'de' yyyy", { locale: pt })}
        onPrev={() => setCursor(subMonths(cursor, 1))}
        onNext={() => setCursor(addMonths(cursor, 1))}
        onToday={() => setCursor(new Date())}
      />
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const dayTasks = tasks.filter((t) => t.due_date && isSameDay(parseISO(t.due_date), d)).sort(byStartTime);
          const isToday = isSameDay(d, new Date());
          const inMonth = isSameMonth(d, cursor);
          return (
            <button key={d.toISOString()} onClick={() => onSelectDay?.(d)}
              className={[
                "aspect-square p-1.5 rounded-md border text-left flex flex-col gap-0.5 transition-all hover:border-primary/60",
                inMonth ? "border-border bg-card/40" : "border-transparent bg-transparent opacity-40",
                isToday ? "neon-border" : "",
              ].join(" ")}>
              <span className={["text-xs", isToday ? "neon-text font-bold" : ""].join(" ")}>{format(d, "d")}</span>
              <div className="flex flex-wrap gap-0.5 mt-auto">
                {dayTasks.slice(0, 4).map((t) => (
                  <span key={t.id} className={[
                    "w-1.5 h-1.5 rounded-full",
                    t.priority === "high" ? "bg-red-500" :
                    t.priority === "medium" ? "bg-yellow-500" : "bg-primary",
                    t.status === "done" ? "opacity-30" : "",
                  ].join(" ")} />
                ))}
                {dayTasks.length > 4 && <span className="text-[8px] text-muted-foreground">+{dayTasks.length - 4}</span>}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Clica num dia para criar uma tarefa nesse dia.</p>
    </div>
  );
}

function Nav({ label, onPrev, onNext, onToday }: {
  label: string; onPrev: () => void; onNext: () => void; onToday: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <button onClick={onPrev} className="p-1.5 rounded hover:bg-accent hover:text-primary"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={onNext} className="p-1.5 rounded hover:bg-accent hover:text-primary"><ChevronRight className="h-4 w-4" /></button>
        <button onClick={onToday} className="ml-2 px-2.5 py-1 rounded text-[11px] uppercase tracking-wider border border-border hover:border-primary/60 hover:text-primary">Hoje</button>
      </div>
      <h2 className="neon-text capitalize text-sm font-semibold">{label}</h2>
    </div>
  );
}

// ---- Task rows ----
function TaskRow({ task, onToggle, onEdit, onDelete }: {
  task: Task; onToggle: (t: Task) => void; onEdit: (t: Task) => void; onDelete: (id: string) => void;
}) {
  const done = task.status === "done";
  return (
    <article className="glass-card glass-card-hover p-3 flex items-start gap-3 group">
      <NeonCheckbox checked={done} onChange={() => onToggle(task)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className={["font-medium leading-tight", done ? "line-through text-muted-foreground" : ""].join(" ")}>
            {task.title}
          </h4>
          <span className={["text-[10px] px-2 py-0.5 rounded-full border", PRIORITY_CLASS[task.priority]].join(" ")}>
            {PRIORITY_LABEL[task.priority]}
          </span>
          {task.due_date && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <CalIcon className="h-3 w-3" />
              {format(parseISO(task.due_date), "d MMM", { locale: pt })}
              {(task.start_time || task.end_time) && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {(task.start_time ?? "").slice(0, 5) || "—"}
                  {task.end_time ? `–${task.end_time.slice(0, 5)}` : ""}
                </span>
              )}
            </span>
          )}
        </div>
        {task.description && (
          <p className={["text-xs mt-1", done ? "text-muted-foreground/60" : "text-muted-foreground"].join(" ")}>{task.description}</p>
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(task)} className="p-1.5 rounded hover:bg-accent hover:text-primary">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onDelete(task.id)} className="p-1.5 rounded hover:bg-destructive/20 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}

function MiniTask({ task, onToggle, onEdit, onDelete }: {
  task: Task; onToggle: (t: Task) => void; onEdit: (t: Task) => void; onDelete: (id: string) => void;
}) {
  const done = task.status === "done";
  return (
    <div className="group flex items-start gap-1.5 p-1.5 rounded bg-card/60 border border-border/60 hover:border-primary/40">
      <NeonCheckbox small checked={done} onChange={() => onToggle(task)} />
      <button onClick={() => onEdit(task)} className={[
        "flex-1 text-left text-[11px] leading-tight truncate",
        done ? "line-through text-muted-foreground" : "",
      ].join(" ")}>
        {task.start_time && <span className="text-primary mr-1">{task.start_time.slice(0, 5)}</span>}
        {task.title}
      </button>
      <span className={[
        "w-1.5 h-1.5 rounded-full mt-1 shrink-0",
        task.priority === "high" ? "bg-red-500" :
        task.priority === "medium" ? "bg-yellow-500" : "bg-primary",
      ].join(" ")} />
      <button onClick={() => onDelete(task.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function DayTasksList({ date, tasks, onToggle, onEdit, onDelete }: {
  date: Date; tasks: Task[]; onToggle: (t: Task) => void; onEdit: (t: Task) => void; onDelete: (id: string) => void;
}) {
  const dayTasks = tasks.filter((t) => t.due_date && isSameDay(parseISO(t.due_date), date)).sort(byStartTime);
  if (dayTasks.length === 0) return <div className="rounded-md p-3 border border-border bg-card/40 text-sm text-muted-foreground">Sem tarefas para este dia.</div>;
  return (
    <div className="space-y-2">
      {dayTasks.map((t) => <TaskRow key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />)}
    </div>
  );
}

function NeonCheckbox({ checked, onChange, small }: { checked: boolean; onChange: () => void; small?: boolean }) {
  const size = small ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <button
      type="button" onClick={onChange}
      className={[
        size, "shrink-0 rounded-md border-2 grid place-items-center transition-all mt-0.5",
        checked
          ? "bg-primary border-primary shadow-glow"
          : "border-primary/40 hover:border-primary hover:shadow-glow",
      ].join(" ")}
    >
      {checked && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={[small ? "h-2.5 w-2.5" : "h-3.5 w-3.5", "text-primary-foreground"].join(" ")}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

// ---- Dialog ----
function TaskDialog({ initial, prefillDate, onClose, onSave }: {
  initial: Task | null;
  prefillDate: string | null;
  onClose: () => void;
  onSave: (d: {
    title: string; description: string; priority: Priority; due_date: string | null;
    start_time: string | null; end_time: string | null; notify_lead_minutes: number | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? prefillDate ?? "");
  const [startTime, setStartTime] = useState((initial?.start_time ?? "").slice(0, 5));
  const [endTime, setEndTime] = useState((initial?.end_time ?? "").slice(0, 5));
  const [leadMin, setLeadMin] = useState<string>(
    initial?.notify_lead_minutes != null ? String(initial.notify_lead_minutes) : ""
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (startTime && endTime && endTime <= startTime) {
      setErr("A hora de fim deve ser depois da hora de início.");
      return;
    }
    setErr(null);
    setBusy(true);
    await onSave({
      title: title.trim(),
      description,
      priority,
      due_date: dueDate || null,
      start_time: dueDate && startTime ? startTime : null,
      end_time: dueDate && endTime ? endTime : null,
      notify_lead_minutes: leadMin === "" ? null : Number(leadMin),
    });
    setBusy(false);
  };

  const timesDisabled = !dueDate;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
      <form onSubmit={submit} className="glass-card neon-border w-full max-w-lg p-6 space-y-4 page-enter">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold neon-text">{initial ? "Editar tarefa" : "Nova tarefa"}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:text-primary"><X className="h-4 w-4" /></button>
        </div>
        <Field label="Título">
          <input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Descrição">
          <textarea value={description} maxLength={2000} rows={3} onChange={(e) => setDescription(e.target.value)} className={inputCls + " resize-none"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prioridade">
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputCls}>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </select>
          </Field>
          <Field label="Data limite">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hora de início">
            <input
              type="time"
              value={startTime}
              disabled={timesDisabled}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputCls + (timesDisabled ? " opacity-50" : "")}
            />
          </Field>
          <Field label="Hora de fim">
            <input
              type="time"
              value={endTime}
              disabled={timesDisabled}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputCls + (timesDisabled ? " opacity-50" : "")}
            />
          </Field>
        </div>
        {timesDisabled && (
          <p className="text-[11px] text-muted-foreground -mt-2">Define primeiro uma data limite para usar horas.</p>
        )}
        <Field label="Pré-aviso (esta tarefa)">
          <select
            value={leadMin}
            onChange={(e) => setLeadMin(e.target.value)}
            disabled={timesDisabled || !startTime}
            className={inputCls + ((timesDisabled || !startTime) ? " opacity-50" : "")}
          >
            <option value="">Usar definição global</option>
            <option value="0">No momento</option>
            <option value="5">5 minutos antes</option>
            <option value="10">10 minutos antes</option>
            <option value="15">15 minutos antes</option>
            <option value="30">30 minutos antes</option>
            <option value="60">1 hora antes</option>
          </select>
        </Field>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-accent">Cancelar</button>
          <button type="submit" disabled={busy || !title.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:shadow-glow-strong disabled:opacity-50">
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
