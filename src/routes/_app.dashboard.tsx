import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  StickyNote, Link2, CheckSquare, Wallet, Plane, Ticket,
  TrendingUp, TrendingDown, AlertTriangle, ArrowRight, Search, Download, RefreshCw, Star, ExternalLink, Trophy,
} from "lucide-react";
import { format, isToday, isPast, parseISO, differenceInCalendarDays, isValid, isSameDay, subDays } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { exportData } from "@/lib/data-io";
import { NotepadViewer } from "@/components/notepad-viewer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

interface Task { id: string; title: string; status: "pending" | "done"; priority: "low"|"medium"|"high"; due_date: string | null; }
interface Trip { id: string; name: string; destination: string; start_date: string | null; end_date: string | null; budget: number | null; }
interface Tx { id: string; amount: number; type: "income" | "expense"; category: string; description: string; occurred_at: string; }
interface Note { id: string; title: string; content: string; created_at: string; is_favorite: boolean; }
interface LinkRow { id: string; title: string; url: string; created_at: string; is_favorite: boolean; }
interface Reservation { id: string; title: string; reservation_type: string; status: string; extracted_data: any; created_at: string; }

const fmtEur = (v: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);

const parseValidDate = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
};

const fmtDate = (value: string | null | undefined, pattern: string) => {
  const parsed = parseValidDate(value);
  return parsed ? format(parsed, pattern, { locale: pt }) : "—";
};

const daysUntil = (value: string | null | undefined, from: Date) => {
  const parsed = parseValidDate(value);
  return parsed ? differenceInCalendarDays(parsed, from) : null;
};

const safeHost = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const PRIO_DOT: Record<string, string> = {
  high: "bg-red-400", medium: "bg-yellow-400", low: "bg-primary",
};

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-right">
      <div className="text-3xl font-semibold tabular-nums tracking-tight">
        {format(time, "HH:mm:ss")}
      </div>
      <div className="text-xs text-muted-foreground uppercase tracking-widest">
        {format(time, "EEEE, d MMMM yyyy", { locale: pt })}
      </div>
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [favNotes, setFavNotes] = useState<Note[]>([]);
  const [favLinks, setFavLinks] = useState<LinkRow[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [newsQuery, setNewsQuery] = useState("");
  const [newsResults, setNewsResults] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsDays, setNewsDays] = useState<number>(7);
  const [newsLastUpdated, setNewsLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<"all" | "today" | "last_day">("all");

  const load = async () => {
    setLoading(true);
    try {
      const [t, tr, tx, n, l, r, fn, fl] = await Promise.all([
        supabase.from("tasks").select("id,title,status,priority,due_date").order("due_date", { ascending: true, nullsFirst: false }),
        supabase.from("trips").select("id,name,destination,start_date,end_date,budget").order("start_date", { ascending: true, nullsFirst: false }),
        supabase.from("transactions").select("id,amount,type,category,description,occurred_at").order("occurred_at", { ascending: false }),
        supabase.from("notes").select("id,title,content,created_at,is_favorite").order("created_at", { ascending: false }).limit(5),
        supabase.from("links").select("id,title,url,created_at,is_favorite").order("created_at", { ascending: false }).limit(5),
        supabase.from("reservations").select("id,title,reservation_type,status,extracted_data,created_at").order("created_at", { ascending: false }),
        (supabase as any).from("notes").select("id,title,content,created_at,is_favorite").eq("is_favorite", true).order("created_at", { ascending: false }).limit(12),
        (supabase as any).from("links").select("id,title,url,created_at,is_favorite").eq("is_favorite", true).order("created_at", { ascending: false }).limit(12),
      ]);
      setTasks((t.data as any) ?? []);
      setTrips((tr.data as any) ?? []);
      setTxs(((tx.data as any) ?? []).map((x: any) => ({ ...x, amount: Number(x.amount) })));
      setNotes((n.data as any) ?? []);
      setLinks((l.data as any) ?? []);
      setReservations((r.data as any) ?? []);
      setFavNotes((fn.data as any) ?? []);
      setFavLinks((fl.data as any) ?? []);
    } finally {
      setLoading(false);
    }
  };

  const saveNoteContent = async (id: string, content: string) => {
    const { data: upd } = await (supabase as any)
      .from("notes").update({ content }).eq("id", id).select().single();
    if (upd) {
      setFavNotes((prev) => prev.map((n) => (n.id === id ? (upd as Note) : n)));
      setNotes((prev) => prev.map((n) => (n.id === id ? (upd as Note) : n)));
      setViewingNote((v) => (v && v.id === id ? (upd as Note) : v));
    }
  };

  useEffect(() => {
    if (user?.id) load();
  }, [user?.id]);

  const today = new Date();

  const isInPeriod = (dateStr: string | null, period: "all" | "today" | "last_day") => {
    if (period === "all") return true;
    const date = parseValidDate(dateStr);
    if (!date) return false;
    if (period === "today") return isToday(date);
    return isSameDay(date, subDays(today, 1));
  };

  const visibleTasks = useMemo(() => tasks.filter((t) => isInPeriod(t.due_date, periodFilter)), [tasks, periodFilter]);
  const visibleTxs = useMemo(() => txs.filter((t) => isInPeriod(t.occurred_at, periodFilter)), [txs, periodFilter]);
  const visibleNotes = useMemo(() => notes.filter((n) => isInPeriod(n.created_at, periodFilter)), [notes, periodFilter]);
  const visibleLinks = useMemo(() => links.filter((l) => isInPeriod(l.created_at, periodFilter)), [links, periodFilter]);
  const visibleReservations = useMemo(() => reservations.filter((r) => isInPeriod(r.created_at, periodFilter)), [reservations, periodFilter]);
  const visibleTrips = useMemo(() => trips.filter((t) => isInPeriod(t.start_date, periodFilter)), [trips, periodFilter]);
  const visibleFavNotes = useMemo(() => favNotes.filter((n) => isInPeriod(n.created_at, periodFilter)), [favNotes, periodFilter]);
  const visibleFavLinks = useMemo(() => favLinks.filter((l) => isInPeriod(l.created_at, periodFilter)), [favLinks, periodFilter]);

  const taskStats = useMemo(() => {
    const pending = visibleTasks.filter((t) => t.status === "pending");
    const overdue = pending.filter((t) => {
      const due = parseValidDate(t.due_date);
      return due && isPast(due) && !isToday(due);
    });
    const todayTasks = pending.filter((t) => {
      const due = parseValidDate(t.due_date);
      return due && isToday(due);
    });
    const upcoming = pending
      .filter((t) => {
        const due = parseValidDate(t.due_date);
        return due && !isPast(due);
      })
      .slice(0, 5);
    const doneCount = visibleTasks.filter((t) => t.status === "done").length;
    return { pending, overdue, todayTasks, upcoming, doneCount };
  }, [visibleTasks]);

  const monthStats = useMemo(() => {
    const m = periodFilter === "all"
      ? visibleTxs.filter((t) => t.occurred_at.startsWith(format(today, "yyyy-MM")))
      : visibleTxs;
    let income = 0, expense = 0;
    let personalIncome = 0, personalExpense = 0;
    let savingsIn = 0, savingsOut = 0;
    for (const t of m) {
      const cat = (t.category || "").toLowerCase().normalize("NFC");
      if (t.type === "income") {
        income += t.amount;
        if (cat === "poupanças") savingsIn += t.amount;
        else personalIncome += t.amount;
      } else {
        expense += t.amount;
        if (cat === "poupanças") savingsOut += t.amount;
        else personalExpense += t.amount;
      }
    }
    const balance = income - expense;
    const savings = savingsIn - savingsOut;
    const personal = personalIncome - personalExpense;
    const byCat = new Map<string, number>();
    m.filter((t) => t.type === "expense").forEach((t) => byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount));
    const topCats = Array.from(byCat, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 4);
    return { income, expense, balance, savings, personal, topCats, count: m.length };
  }, [visibleTxs, periodFilter, today]);

  // Cumulative totals matching Finanças "Saldo total" (all transactions, no period filter).
  const totalStats = useMemo(() => {
    let income = 0, expense = 0, savingsIn = 0, savingsOut = 0;
    for (const t of txs) {
      const cat = (t.category || "").toLowerCase().normalize("NFC");
      if (t.type === "income") {
        income += t.amount;
        if (cat === "poupanças") savingsIn += t.amount;
      } else {
        expense += t.amount;
        if (cat === "poupanças") savingsOut += t.amount;
      }
    }
    return { balance: income - expense, savings: savingsIn - savingsOut };
  }, [txs]);

  const tripStats = useMemo(() => {
    const upcoming = visibleTrips
      .filter((t) => {
        const start = parseValidDate(t.start_date);
        return start && start >= new Date(today.toDateString());
      })
      .slice(0, 3);
    const active = visibleTrips.find((t) => {
      const s = parseValidDate(t.start_date), e = parseValidDate(t.end_date);
      if (!s || !e) return false;
      return s <= today && today <= e;
    });
    return { upcoming, active, total: visibleTrips.length };
  }, [visibleTrips, today]);

  const upcomingReservations = useMemo(() => {
    return visibleReservations
      .filter((r) => r.status !== "cancelled")
      .slice(0, 4);
  }, [visibleReservations]);

  const toggleTask = async (t: Task) => {
    const next = t.status === "done" ? "pending" : "done";
    setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next } : x));
    await supabase.from("tasks").update({ status: next }).eq("id", t.id);
  };

  const fetchNews = async (eventOrOpts?: FormEvent<HTMLFormElement> | { days?: number; silent?: boolean }) => {
    let daysOverride: number | undefined;
    let silent = false;
    if (eventOrOpts && "preventDefault" in eventOrOpts) {
      eventOrOpts.preventDefault();
    } else if (eventOrOpts) {
      daysOverride = eventOrOpts.days;
      silent = !!eventOrOpts.silent;
    }
    const query = newsQuery.trim();
    if (!query) {
      if (!silent) {
        setNewsError("Insere palavras-chave para pesquisar.");
        setNewsResults([]);
      }
      return;
    }
    const days = daysOverride ?? newsDays;

    setNewsLoading(true);
    setNewsError(null);
    if (!silent) setNewsResults([]);

    try {
      const response = await fetch(`/api/news?q=${encodeURIComponent(query)}&pageSize=5&days=${days}&_=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }
      const data = await response.json();
      setNewsResults(data.articles ?? []);
      setNewsLastUpdated(new Date());
      if (!data.articles?.length) {
        setNewsError("Nenhuma notícia encontrada para estes temas.");
      }
    } catch (error: any) {
      setNewsError(error?.message || "Erro ao buscar notícias.");
    } finally {
      setNewsLoading(false);
    }
  };

  // Auto-refresh news daily (and on day change while tab open)
  useEffect(() => {
    if (!newsQuery.trim()) return;
    const lastKey = `news:lastAutoRefresh:${newsQuery.trim()}:${newsDays}`;
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const last = typeof window !== "undefined" ? localStorage.getItem(lastKey) : null;
    if (last !== todayStr) {
      fetchNews({ silent: true });
      if (typeof window !== "undefined") localStorage.setItem(lastKey, todayStr);
    }
    const interval = setInterval(() => {
      const nowStr = format(new Date(), "yyyy-MM-dd");
      const stored = localStorage.getItem(lastKey);
      if (stored !== nowStr) {
        fetchNews({ silent: true });
        localStorage.setItem(lastKey, nowStr);
      }
    }, 60 * 60 * 1000); // hourly check
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsQuery, newsDays]);


  if (loading) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <div className="neon-text text-sm tracking-widest animate-pulse">A CARREGAR</div>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{format(today, "EEEE, d 'de' MMMM", { locale: pt })}</p>
          <h2 className="text-3xl font-semibold mt-1">
            Olá, <span className="neon-text">{user?.email?.split("@")[0]}</span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor="period-filter">Período</label>
          <select
            id="period-filter"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as "all" | "today" | "last_day")}
            className="input-style text-sm py-2"
          >
            <option value="all">Tudo</option>
            <option value="today">Hoje</option>
            <option value="last_day">Último dia</option>
          </select>
          <Clock />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          to="/tarefas"
          icon={CheckSquare}
          label={periodFilter === "last_day" ? "Tarefas ontem" : "Tarefas hoje"}
          value={taskStats.todayTasks.length}
          sub={taskStats.overdue.length > 0 ? `${taskStats.overdue.length} atrasada(s)` : `${taskStats.pending.length} pendentes`}
          danger={taskStats.overdue.length > 0}
        />
        <Kpi
          to="/financas"
          icon={Wallet}
          label={`Saldo pessoal · ${periodFilter === "all" ? format(today, "MMM", { locale: pt }) : periodFilter === "today" ? "Hoje" : "Ontem"}`}
          value={fmtEur(monthStats.personal)}
          sub={`${fmtEur(monthStats.income)} · -${fmtEur(monthStats.expense)}${monthStats.savings !== 0 ? ` · poupanças ${fmtEur(monthStats.savings)}` : ""}`}
          tone={monthStats.personal >= 0 ? "good" : "bad"}
        />
        <Kpi
          to="/viagens"
          icon={Plane}
          label={periodFilter === "all" ? "Próxima viagem" : periodFilter === "today" ? "Viagem hoje" : "Viagem ontem"}
          value={tripStats.upcoming[0]?.destination ?? tripStats.active?.destination ?? "—"}
          sub={daysUntil(tripStats.upcoming[0]?.start_date, today) !== null
            ? `em ${daysUntil(tripStats.upcoming[0]?.start_date, today)} dias`
            : tripStats.active ? "Em curso" : `${tripStats.total} no total`}
        />
        <Kpi
          to="/reservas"
          icon={Ticket}
          label={periodFilter === "all" ? "Reservas" : periodFilter === "today" ? "Reservas hoje" : "Reservas ontem"}
          value={visibleReservations.filter((r) => r.status !== "cancelled").length}
          sub={`${visibleReservations.filter((r) => r.status === "confirmed").length} confirmadas`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Notas favoritas" icon={Star} to="/notas">
          {visibleFavNotes.length === 0 ? (
            <Empty text="Sem notas nos favoritos" />
          ) : (
            <ul className="space-y-1">
              {visibleFavNotes.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setViewingNote(n)}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40"
                  >
                    <StickyNote className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-sm truncate flex-1">{n.title || "Sem título"}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDate(n.created_at, "d MMM")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Links favoritos" icon={Star} to="/links">
          {visibleFavLinks.length === 0 ? (
            <Empty text="Sem links nos favoritos" />
          ) : (
            <ul className="space-y-1">
              {visibleFavLinks.map((l) => (
                <li key={l.id}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40"
                  >
                    <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{l.title || l.url}</div>
                      <div className="text-xs text-muted-foreground truncate">{safeHost(l.url)}</div>
                    </div>
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>




      <section className="glass-card overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent text-primary">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold">LiveScore</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Resultados de futebol, jogos em direto, classificações e calendário.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                O LiveScore não permite apresentação dentro de outros sites, por isso abre numa nova aba.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0">
            <a href="https://www.livescore.com/" target="_blank" rel="noopener noreferrer">
              Abrir LiveScore
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tasks panel - spans 2 */}
        <Panel
          title={periodFilter === "all" ? "Tarefas" : periodFilter === "today" ? "Tarefas hoje" : "Tarefas ontem"}
          icon={CheckSquare}
          to="/tarefas"
          className="lg:col-span-2"
          right={<span className="text-xs text-muted-foreground">{taskStats.doneCount} concluídas</span>}
        >
          {taskStats.overdue.length > 0 && (
            <div className="mb-3 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              {taskStats.overdue.length} tarefa(s) atrasada(s)
            </div>
          )}
          {(taskStats.todayTasks.length === 0 && taskStats.overdue.length === 0 && taskStats.upcoming.length === 0) ? (
            <Empty text="Sem tarefas pendentes. Bom trabalho!" />
          ) : (
            <ul className="space-y-1.5">
              {[...taskStats.overdue, ...taskStats.todayTasks, ...taskStats.upcoming.filter(u => !taskStats.todayTasks.includes(u))]
                .slice(0, 7)
                .map((t) => {
                  const due = parseValidDate(t.due_date);
                  const overdue = due && isPast(due) && !isToday(due);
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/40 transition-colors">
                      <button
                        onClick={() => toggleTask(t)}
                        className="h-4 w-4 rounded border border-primary/60 hover:bg-primary/20 shrink-0"
                        aria-label="Concluir"
                      />
                      <span className={`h-2 w-2 rounded-full shrink-0 ${PRIO_DOT[t.priority]}`} />
                      <span className="flex-1 text-sm truncate">{t.title}</span>
                      {t.due_date && (
                        <span className={`text-xs shrink-0 ${overdue ? "text-red-400" : "text-muted-foreground"}`}>
                          {due && isToday(due) ? "Hoje" : fmtDate(t.due_date, "d MMM")}
                        </span>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </Panel>

        {/* Finance panel */}
        <Panel title={periodFilter === "all" ? "Finanças do mês" : periodFilter === "today" ? "Finanças de hoje" : "Finanças de ontem"} icon={Wallet} to="/financas">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Mini icon={TrendingUp} tone="good" label="Receitas" value={fmtEur(monthStats.income)} />
            <Mini icon={TrendingDown} tone="bad" label="Despesas" value={fmtEur(monthStats.expense)} />
          </div>
          {monthStats.topCats.length === 0 ? (
            <Empty text={periodFilter === "all" ? "Sem transações este mês" : periodFilter === "today" ? "Sem transações hoje" : "Sem transações ontem"} />
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Top categorias</div>
              {monthStats.topCats.map((c) => {
                const pct = monthStats.expense > 0 ? (c.value / monthStats.expense) * 100 : 0;
                return (
                  <div key={c.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="capitalize">{c.name}</span>
                      <span className="text-muted-foreground">{fmtEur(c.value)}</span>
                    </div>
                    <div className="h-1.5 bg-accent rounded-full overflow-hidden">
                      <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Resumo de notícias" icon={Search} to="/dashboard" className="lg:col-span-3">
          <form onSubmit={fetchNews} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <label className="grid gap-2 text-sm text-muted-foreground">
              Temas de interesse
              <input
                type="text"
                value={newsQuery}
                onChange={(event) => setNewsQuery(event.target.value)}
                placeholder="Ex.: tecnologia, economia, futebol"
                className="input-style w-full"
              />
            </label>
            <label className="grid gap-2 text-sm text-muted-foreground">
              Intervalo
              <select
                value={newsDays}
                onChange={(e) => setNewsDays(Number(e.target.value))}
                className="input-style"
              >
                <option value={1}>Últimas 24h</option>
                <option value={3}>Últimos 3 dias</option>
                <option value={7}>Últimos 7 dias</option>
                <option value={14}>Últimos 14 dias</option>
                <option value={30}>Últimos 30 dias</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={newsLoading}
              className="self-end inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:shadow-glow disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              {newsLoading ? "A pesquisar..." : "Pesquisar"}
            </button>
            <button
              type="button"
              onClick={() => fetchNews()}
              disabled={newsLoading || !newsQuery.trim()}
              title="Atualizar agora"
              className="self-end inline-flex items-center justify-center gap-2 rounded-full border border-border bg-input px-4 py-3 text-sm font-semibold transition hover:border-primary/60 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${newsLoading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </form>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Intervalo ativo: <span className="text-foreground">últimos {newsDays} {newsDays === 1 ? "dia" : "dias"}</span>
              {newsLastUpdated && <> · atualizado às {format(newsLastUpdated, "HH:mm")} de {format(newsLastUpdated, "d MMM", { locale: pt })}</>}
            </span>
            {newsResults.length > 0 && (
              <button
                type="button"
                onClick={() => exportData(`noticias-${newsQuery.trim() || "resultados"}`, { query: newsQuery, days: newsDays, exported_at: new Date().toISOString(), articles: newsResults })}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-input border border-border hover:border-primary/50"
              >
                <Download className="h-3.5 w-3.5" /> Exportar JSON
              </button>
            )}
          </div>
          {newsError ? (
            <div className="mt-3 rounded-3xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{newsError}</div>
          ) : null}
          {newsLoading ? (
            <div className="mt-3 text-sm text-muted-foreground">A carregar notícias...</div>
          ) : null}
          {!newsLoading && newsResults.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {newsResults.map((article) => (
                <a
                  key={article.url}
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-3xl border border-border p-4 transition hover:border-primary/60 hover:shadow-glow"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    {article.urlToImage ? (
                      <img
                        src={article.urlToImage}
                        alt={article.title}
                        className="h-24 w-full rounded-2xl object-cover sm:w-40"
                      />
                    ) : (
                      <div className="h-24 w-full rounded-2xl bg-muted-foreground/10 sm:w-40" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-foreground transition group-hover:text-primary">{article.title}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {article.source?.name} · {article.publishedAt ? format(new Date(article.publishedAt), "d MMM", { locale: pt }) : ""}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{article.description || article.content || "Sem descrição."}</p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          ) : null}
        </Panel>

        {/* Viagens */}
        <Panel title={periodFilter === "all" ? "Viagens" : periodFilter === "today" ? "Viagens hoje" : "Viagens ontem"} icon={Plane} to="/viagens">
          {tripStats.active && (
            <div className="mb-3 px-3 py-2 rounded-md border border-primary/40 bg-primary/10">
              <div className="text-xs text-primary">Em curso</div>
              <div className="text-sm font-medium">{tripStats.active.destination}</div>
            </div>
          )}
          {tripStats.upcoming.length === 0 && !tripStats.active ? (
            <Empty text={periodFilter === "all" ? "Sem viagens planeadas" : "Sem viagens"} />
          ) : (
            <ul className="space-y-2">
              {tripStats.upcoming.map((t) => (
                <li key={t.id}>
                  <Link to="/viagens/$tripId" params={{ tripId: t.id }} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{t.destination}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.start_date && fmtDate(t.start_date, "d MMM")}
                        {t.end_date && ` – ${fmtDate(t.end_date, "d MMM")}`}
                      </div>
                    </div>
                    <span className="text-xs text-primary shrink-0">
                      {daysUntil(t.start_date, today) !== null && `em ${daysUntil(t.start_date, today)}d`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Reservas */}
        <Panel title={periodFilter === "all" ? "Reservas recentes" : periodFilter === "today" ? "Reservas hoje" : "Reservas ontem"} icon={Ticket} to="/reservas">
          {upcomingReservations.length === 0 ? (
            <Empty text="Sem reservas" />
          ) : (
            <ul className="space-y-1.5">
              {upcomingReservations.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-accent/40">
                  <span className="text-xs uppercase text-muted-foreground w-14 shrink-0">{r.reservation_type}</span>
                  <span className="flex-1 truncate">{r.title}</span>
                  <span className={`text-xs ${r.status === "confirmed" ? "text-primary" : "text-muted-foreground"}`}>
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Notas */}
        <Panel title={periodFilter === "all" ? "Notas recentes" : periodFilter === "today" ? "Notas de hoje" : "Notas de ontem"} icon={StickyNote} to="/notas">
          {visibleNotes.length === 0 ? <Empty text="Sem notas" /> : (
            <ul className="space-y-1">
              {visibleNotes.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 text-sm">
                  <span className="truncate">{n.title || "Sem título"}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{fmtDate(n.created_at, "d MMM")}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Links */}
        <Panel title={periodFilter === "all" ? "Links recentes" : periodFilter === "today" ? "Links de hoje" : "Links de ontem"} icon={Link2} to="/links">
          {visibleLinks.length === 0 ? <Empty text="Sem links" /> : (
            <ul className="space-y-1">
              {visibleLinks.map((l) => (
                <li key={l.id} className="px-2 py-1.5 rounded-md hover:bg-accent/40">
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-sm truncate block">
                    {l.title || l.url}
                  </a>
                  <div className="text-xs text-muted-foreground truncate">{safeHost(l.url)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {viewingNote && (
        <NotepadViewer
          title={viewingNote.title}
          initialContent={viewingNote.content}
          onSave={(c) => saveNoteContent(viewingNote.id, c)}
          onClose={() => setViewingNote(null)}
        />
      )}
    </div>
  );
}

function Kpi({
  to, icon: Icon, label, value, sub, tone, danger,
}: {
  to: string; icon: any; label: string; value: React.ReactNode; sub?: string;
  tone?: "good" | "bad"; danger?: boolean;
}) {
  const valueCls = tone === "good" ? "text-primary" : tone === "bad" ? "text-red-400" : danger ? "text-red-400" : "";
  return (
    <Link to={to} className="glass-card glass-card-hover p-4 block">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className={`text-2xl font-semibold truncate ${valueCls}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1 truncate">{sub}</div>}
    </Link>
  );
}

function Panel({
  title, icon: Icon, to, children, className = "", right,
}: {
  title: string; icon: any; to: string; children: React.ReactNode; className?: string; right?: React.ReactNode;
}) {
  return (
    <section className={`glass-card p-5 ${className}`}>
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="font-medium">{title}</h3>
        </div>
        <div className="flex items-center gap-3">
          {right}
          <Link to={to} className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
            ver tudo <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </header>
      {children}
    </section>
  );
}

function Mini({ icon: Icon, tone, label, value }: { icon: any; tone: "good"|"bad"; label: string; value: string; }) {
  const cls = tone === "good" ? "text-primary" : "text-red-400";
  return (
    <div className="rounded-md border border-border/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Icon className={`h-3 w-3 ${cls}`} />
        {label}
      </div>
      <div className={`text-sm font-medium ${cls}`}>{value}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground py-4 text-center">{text}</div>;
}

