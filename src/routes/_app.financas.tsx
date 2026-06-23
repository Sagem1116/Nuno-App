import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Plus, Trash2, Pencil, X, Wallet, TrendingUp, TrendingDown, Search,
  Download, Upload, Tags as TagsIcon, Check, ArrowRightLeft,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Field, inputCls } from "@/routes/_app.notas";
import { exportTable, importTable } from "@/lib/data-io";
import { AutoExportMenu } from "@/components/auto-export-menu";
import { DangerZone, deleteAllForUser } from "@/components/danger-zone";

export const Route = createFileRoute("/_app/financas")({
  component: FinancasPage,
});

type TxType = "income" | "expense";
type CatKind = "income" | "expense" | "both";
interface Tx {
  id: string;
  amount: number;
  type: TxType;
  category: string;
  description: string;
  occurred_at: string;
  created_at: string;
}
interface Cat {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  kind: CatKind;
  sort_order: number;
}

const SAVINGS_CATEGORY = "poupanças";
const isSavings = (name: string) =>
  name?.toLowerCase().normalize("NFC") === SAVINGS_CATEGORY;

const DEFAULT_CATEGORIES: { name: string; color: string; kind: CatKind }[] = [
  { name: "comida", color: "#ff7a18", kind: "expense" },
  { name: "transportes", color: "#ff9248", kind: "expense" },
  { name: "lazer", color: "#ffaa6b", kind: "expense" },
  { name: "casa", color: "#ffc28e", kind: "expense" },
  { name: "saúde", color: "#ffd9b1", kind: "expense" },
  { name: "trabalho", color: "#34d399", kind: "income" },
  { name: "compras", color: "#ff944d", kind: "expense" },
  { name: "educação", color: "#e85d1a", kind: "expense" },
  { name: "poupanças", color: "#60a5fa", kind: "both" },
  { name: "outros", color: "#ffe8cc", kind: "both" },
];

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);

function FinancasPage() {
  const { user } = useAuth();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tx | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | TxType>("all");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const loadCats = async () => {
    const { data } = await (supabase as any)
      .from("finance_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    return (data as Cat[]) ?? [];
  };

  const seedIfEmpty = async (existing: Cat[]) => {
    if (!user || existing.length > 0) return existing;
    const rows = DEFAULT_CATEGORIES.map((c, i) => ({
      user_id: user.id,
      name: c.name,
      color: c.color,
      kind: c.kind,
      sort_order: i,
    }));
    await (supabase as any).from("finance_categories").insert(rows);
    return await loadCats();
  };

  const load = async () => {
    setLoading(true);
    const [{ data: txData }, catList] = await Promise.all([
      supabase.from("transactions").select("*").order("occurred_at", { ascending: false }),
      loadCats(),
    ]);
    setTxs(((txData as any[]) ?? []).map((t) => ({ ...t, amount: Number(t.amount) })));
    const seeded = await seedIfEmpty(catList);
    setCats(seeded);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user?.id]);

  const stats = useMemo(() => {
    let income = 0, expense = 0, savings = 0;
    for (const t of txs) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
      if (isSavings(t.category)) {
        savings += t.type === "income" ? t.amount : -t.amount;
      }
    }
    const balance = income - expense;
    return { income, expense, balance, savings, personal: balance - savings };
  }, [txs]);

  const catColor = (name: string, fallback: string) =>
    cats.find((c) => c.name === name)?.color ?? fallback;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    txs.filter((t) => t.type === "expense").forEach((t) =>
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount),
    );
    return Array.from(map, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [txs]);

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    for (const t of txs) {
      const m = t.occurred_at.slice(0, 7);
      const row = map.get(m) ?? { month: m, income: 0, expense: 0 };
      if (t.type === "income") row.income += t.amount;
      else row.expense += t.amount;
      map.set(m, row);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [txs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const fromTs = fromDate ? new Date(fromDate + "T00:00:00").getTime() : null;
    const toTs = toDate ? new Date(toDate + "T23:59:59.999").getTime() : null;
    return txs.filter((t) => {
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterCat !== "all" && t.category !== filterCat) return false;
      if (fromTs != null || toTs != null) {
        const ts = new Date(t.occurred_at).getTime();
        if (fromTs != null && ts < fromTs) return false;
        if (toTs != null && ts > toTs) return false;
      }
      if (!q) return true;
      return t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    });
  }, [txs, search, filterType, filterCat, fromDate, toDate]);

  const remove = async (id: string) => {
    if (!confirm("Eliminar transação?")) return;
    await supabase.from("transactions").delete().eq("id", id);
    setTxs((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSave = async (data: Omit<Tx, "id" | "created_at">) => {
    if (!user) return;
    if (editing) {
      const { data: upd } = await supabase
        .from("transactions").update(data).eq("id", editing.id).select().single();
      if (upd) setTxs((prev) => prev.map((t) =>
        t.id === editing.id ? { ...(upd as any), amount: Number((upd as any).amount) } : t,
      ));
    } else {
      const { data: ins } = await supabase
        .from("transactions").insert({ ...data, user_id: user.id }).select().single();
      if (ins) setTxs((prev) => [{ ...(ins as any), amount: Number((ins as any).amount) }, ...prev]);
    }
    setOpen(false);
    setEditing(null);
  };

  const NEON_GLOW = "#ff8a3d";
  const FALLBACK_PIE = ["#ff7a18", "#ff9248", "#ffaa6b", "#ffc28e", "#ffd9b1", "#ffe8cc", "#ffb380", "#ff944d", "#e85d1a"];

  return (
    <div className="page-enter space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold neon-text">Finanças</h1>
          <p className="text-sm text-muted-foreground">Controla as tuas entradas e gastos.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setCatManagerOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
          >
            <TagsIcon className="h-3.5 w-3.5" /> Categorias
          </button>
          <button
            onClick={() => exportTable("transactions")}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
          >
            <Download className="h-3.5 w-3.5" /> Exportar JSON
          </button>
          <button
            onClick={async () => { if (user) { await importTable("transactions", user.id); await load(); } }}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50"
          >
            <Upload className="h-3.5 w-3.5" /> Importar JSON
          </button>
          <AutoExportMenu table="transactions" label="Finanças" />
          <button
            onClick={() => setTransferOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/40 text-xs hover:border-sky-400"
            title="Transferir dinheiro da conta pessoal para poupanças"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> Pessoal → Poupanças
          </button>
          <button
            onClick={() => { setEditing(null); setOpen(true); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium text-sm hover:shadow-glow-strong transition-all"
          >
            <Plus className="h-4 w-4" /> Nova transação
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Wallet} label="Saldo total" value={fmt(stats.balance)}
          accent={stats.balance >= 0 ? "text-primary" : "text-destructive"}
          note={stats.savings !== 0 ? `${fmt(stats.savings)} em poupanças` : undefined} />
        <StatCard icon={Wallet} label="Saldo pessoal" value={fmt(stats.personal)}
          accent={stats.personal >= 0 ? "text-primary" : "text-destructive"}
          note="Saldo total − poupanças" />
        <StatCard icon={Wallet} label="Poupanças" value={fmt(stats.savings)}
          accent="text-sky-400" />
        <StatCard icon={TrendingUp} label="Entradas" value={fmt(stats.income)} accent="text-emerald-400" />
        <StatCard icon={TrendingDown} label="Gastos" value={fmt(stats.expense)} accent="text-orange-400" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5">
          <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Gastos por categoria</h3>
          {byCategory.length === 0 ? (
            <EmptyChart label="Sem gastos registados" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95}
                  paddingAngle={2} stroke="hsl(var(--background))">
                  {byCategory.map((c, i) => (
                    <Cell key={i} fill={catColor(c.name, FALLBACK_PIE[i % FALLBACK_PIE.length])} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number) => fmt(v)}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          {byCategory.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {byCategory.map((c, i) => (
                <span key={c.name} className="text-[11px] flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-border">
                  <span className="h-2 w-2 rounded-full" style={{ background: catColor(c.name, FALLBACK_PIE[i % FALLBACK_PIE.length]) }} />
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-4">Evolução mensal</h3>
          {monthly.length === 0 ? (
            <EmptyChart label="Sem dados" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthly}>
                <defs>
                  <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number) => fmt(v)}
                />
                <Line type="monotone" dataKey="income" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} name="Entradas" />
                <Line type="monotone" dataKey="expense" stroke={NEON_GLOW} strokeWidth={2.5} dot={{ r: 3 }}
                  filter="url(#glow)" name="Gastos" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar descrição..."
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-input border border-border focus:border-primary focus:outline-none text-sm" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}
          className={inputCls + " md:w-40"}>
          <option value="all">Todos os tipos</option>
          <option value="income">Entradas</option>
          <option value="expense">Gastos</option>
        </select>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
          className={inputCls + " md:w-48"}>
          <option value="all">Todas categorias</option>
          {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">De</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className={inputCls + " md:w-40"} />
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Até</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className={inputCls + " md:w-40"} />
          {(fromDate || toDate) && (
            <button type="button" onClick={() => { setFromDate(""); setToDate(""); }}
              className="text-xs text-muted-foreground hover:text-destructive" title="Limpar datas">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-muted-foreground text-sm">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Wallet className="h-10 w-10 mx-auto text-primary/60 mb-3" />
          <p className="text-muted-foreground">Sem transações.</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Data</th>
                <th className="text-left px-4 py-3">Descrição</th>
                <th className="text-left px-4 py-3">Categoria</th>
                <th className="text-right px-4 py-3">Valor</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-t border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(t.occurred_at).toLocaleDateString("pt-PT")}
                  </td>
                  <td className="px-4 py-3">{t.description || <span className="text-muted-foreground italic">—</span>}</td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent border border-primary/30">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: catColor(t.category, "#888") }} />
                      {t.category}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-medium ${t.type === "income" ? "text-emerald-400" : "text-orange-400"}`}>
                    {t.type === "income" ? "+" : "−"}{fmt(t.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 opacity-60 hover:opacity-100">
                      <button onClick={() => { setEditing(t); setOpen(true); }}
                        className="p-1.5 rounded hover:bg-accent hover:text-primary">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(t.id)}
                        className="p-1.5 rounded hover:bg-destructive/20 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <TxDialog
          initial={editing}
          cats={cats}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSave={handleSave}
          onManageCats={() => setCatManagerOpen(true)}
        />
      )}

      {catManagerOpen && user && (
        <CategoryManager
          userId={user.id}
          cats={cats}
          usedNames={new Set(txs.map((t) => t.category))}
          onClose={() => setCatManagerOpen(false)}
          onChanged={async () => setCats(await loadCats())}
        />
      )}

      {transferOpen && user && (
        <TransferDialog
          userId={user.id}
          onClose={() => setTransferOpen(false)}
          onDone={async () => { setTransferOpen(false); await load(); }}
        />
      )}

      {user && (
        <DangerZone
          title="Apagar todas as transações"
          description="Remove permanentemente todas as transações. As categorias mantêm-se."
          confirmText="APAGAR FINANCAS"
          onConfirm={async () => {
            const n = await deleteAllForUser(supabase, user.id, ["transactions"]);
            await load();
            return { count: n };
          }}
        />
      )}
    </div>
  );
}

function TransferDialog({
  userId, onClose, onDone,
}: { userId: string; onClose: () => void; onDone: () => Promise<void> | void }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Transferência para poupanças");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = parseFloat(amount.replace(",", "."));
    if (!v || v <= 0) { setError("Valor inválido"); return; }
    setBusy(true);
    setError(null);
    const rows = [
      { user_id: userId, amount: v, type: "expense", category: "transferência", description, occurred_at: date },
      { user_id: userId, amount: v, type: "income", category: "poupanças", description, occurred_at: date },
    ];
    const { error } = await supabase.from("transactions").insert(rows as any);
    setBusy(false);
    if (error) { setError(error.message); return; }
    await onDone();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
      <form onSubmit={submit} className="glass-card neon-border w-full max-w-md p-6 space-y-4 page-enter">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold neon-text flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" /> Pessoal → Poupanças
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:text-primary"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground">
          Cria duas transações: uma saída da conta pessoal (categoria "transferência") e uma entrada em poupanças. O saldo total mantém-se; o saldo pessoal diminui e as poupanças aumentam.
        </p>
        <Field label="Valor (€)">
          <input autoFocus value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className={inputCls} />
        </Field>
        <Field label="Data">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Descrição">
          <input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </Field>
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-accent">Cancelar</button>
          <button type="submit" disabled={busy || !amount}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-500 text-white hover:bg-sky-400 disabled:opacity-50">
            Transferir
          </button>
        </div>
      </form>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, accent, note,
}: { icon: typeof Wallet; label: string; value: string; accent: string; note?: string }) {
  return (
    <div className="glass-card glass-card-hover p-5 flex items-center gap-4">
      <div className="h-12 w-12 rounded-xl grid place-items-center bg-gradient-to-br from-primary/20 to-primary-glow/10 border border-primary/30">
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${accent} font-mono`}>{value}</div>
        {note && <div className="text-[11px] text-muted-foreground mt-0.5">{note}</div>}
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <div className="h-[260px] grid place-items-center text-sm text-muted-foreground">{label}</div>;
}

function TxDialog({
  initial, cats, onClose, onSave, onManageCats,
}: {
  initial: Tx | null;
  cats: Cat[];
  onClose: () => void;
  onSave: (d: { amount: number; type: TxType; category: string; description: string; occurred_at: string }) => Promise<void>;
  onManageCats: () => void;
}) {
  const [amount, setAmount] = useState(initial?.amount.toString() ?? "");
  const [type, setType] = useState<TxType>(initial?.type ?? "expense");
  const availableCats = useMemo(
    () => cats.filter((c) => c.kind === "both" || c.kind === type),
    [cats, type],
  );
  const [category, setCategory] = useState(
    initial?.category ?? availableCats[0]?.name ?? "outros",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initial?.occurred_at ?? new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!availableCats.find((c) => c.name === category)) {
      setCategory(availableCats[0]?.name ?? "outros");
    }
  }, [type, availableCats, category]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = parseFloat(amount.replace(",", "."));
    if (!v || v <= 0) return;
    setBusy(true);
    await onSave({ amount: v, type, category, description: description.trim(), occurred_at: date });
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
      <form onSubmit={submit} className="glass-card neon-border w-full max-w-md p-6 space-y-4 page-enter">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold neon-text">
            {initial ? "Editar transação" : "Nova transação"}
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setType("expense")}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
              type === "expense" ? "bg-orange-500/20 border-orange-500/60 text-orange-300 shadow-glow" : "border-border text-muted-foreground hover:border-primary/40"
            }`}>
            <TrendingDown className="h-4 w-4 inline mr-1" /> Gasto
          </button>
          <button type="button" onClick={() => setType("income")}
            className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
              type === "income" ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300" : "border-border text-muted-foreground hover:border-primary/40"
            }`}>
            <TrendingUp className="h-4 w-4 inline mr-1" /> Entrada
          </button>
        </div>

        <Field label="Valor (€)">
          <input autoFocus value={amount} inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)} placeholder="0,00"
            className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <div className="flex gap-1">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls + " flex-1"}>
                {availableCats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                {availableCats.length === 0 && <option value="outros">outros</option>}
              </select>
              <button
                type="button"
                onClick={onManageCats}
                title="Gerir categorias"
                className="px-2 rounded-lg bg-input border border-border hover:border-primary/50"
              >
                <TagsIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </Field>
          <Field label="Data">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field label="Descrição">
          <input value={description} maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Opcional"
            className={inputCls} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-accent">
            Cancelar
          </button>
          <button type="submit" disabled={busy || !amount}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:shadow-glow-strong disabled:opacity-50">
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

const PRESET_COLORS = [
  "#ff7a18", "#ff9248", "#ffaa6b", "#ffc28e",
  "#34d399", "#60a5fa", "#a78bfa", "#f472b6",
  "#f87171", "#fbbf24", "#22d3ee", "#94a3b8",
];

function CategoryManager({
  userId, cats, usedNames, onClose, onChanged,
}: {
  userId: string;
  cats: Cat[];
  usedNames: Set<string>;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState<Cat | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [kind, setKind] = useState<CatKind>("expense");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (c: Cat) => {
    setEditing(c);
    setName(c.name);
    setColor(c.color);
    setKind(c.kind);
    setError(null);
  };

  const reset = () => {
    setEditing(null);
    setName("");
    setColor(PRESET_COLORS[0]);
    setKind("expense");
    setError(null);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim().toLowerCase();
    if (!n) return;
    setBusy(true);
    setError(null);
    if (editing) {
      const oldName = editing.name;
      const { error: e1 } = await (supabase as any)
        .from("finance_categories")
        .update({ name: n, color, kind })
        .eq("id", editing.id);
      if (e1) { setError(e1.message); setBusy(false); return; }
      // Cascade rename on transactions if name changed
      if (oldName !== n) {
        await supabase.from("transactions").update({ category: n } as any).eq("category", oldName);
      }
    } else {
      const { error: e1 } = await (supabase as any).from("finance_categories").insert({
        user_id: userId,
        name: n,
        color,
        kind,
        sort_order: cats.length,
      });
      if (e1) { setError(e1.message); setBusy(false); return; }
    }
    await onChanged();
    reset();
    setBusy(false);
  };

  const remove = async (c: Cat) => {
    if (usedNames.has(c.name)) {
      setError(`Não podes eliminar "${c.name}" — está em uso em transações.`);
      return;
    }
    if (!confirm(`Eliminar categoria "${c.name}"?`)) return;
    setBusy(true);
    setError(null);
    await (supabase as any).from("finance_categories").delete().eq("id", c.id);
    await onChanged();
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
      <div className="glass-card neon-border w-full max-w-2xl p-6 space-y-4 page-enter max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold neon-text flex items-center gap-2">
            <TagsIcon className="h-5 w-5" /> Gerir categorias
          </h3>
          <button onClick={onClose} className="p-1 hover:text-primary"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={save} className="glass-card p-4 space-y-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {editing ? `Editar "${editing.name}"` : "Nova categoria"}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="nome"
              maxLength={40}
              className={inputCls + " sm:col-span-2"}
            />
            <select value={kind} onChange={(e) => setKind(e.target.value as CatKind)} className={inputCls}>
              <option value="expense">Gasto</option>
              <option value="income">Entrada</option>
              <option value="both">Ambos</option>
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Cor</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 grid place-items-center"
                  style={{ background: c, borderColor: color === c ? "#fff" : "transparent" }}
                  title={c}
                >
                  {color === c && <Check className="h-3.5 w-3.5 text-black" />}
                </button>
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-7 w-7 rounded cursor-pointer bg-transparent border border-border"
                title="Cor personalizada"
              />
            </div>
          </div>

          {error && <div className="text-xs text-destructive">{error}</div>}

          <div className="flex justify-end gap-2">
            {editing && (
              <button type="button" onClick={reset} className="px-3 py-1.5 rounded-lg text-sm hover:bg-accent">
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="px-4 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:shadow-glow-strong disabled:opacity-50"
            >
              {editing ? "Guardar" : "Adicionar"}
            </button>
          </div>
        </form>

        <div className="glass-card divide-y divide-border">
          {cats.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Sem categorias.</div>
          ) : cats.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: c.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {c.kind === "income" ? "Entrada" : c.kind === "expense" ? "Gasto" : "Ambos"}
                  {usedNames.has(c.name) && " · em uso"}
                </div>
              </div>
              <button onClick={() => startEdit(c)} className="p-1.5 rounded hover:bg-accent hover:text-primary" title="Editar">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => remove(c)}
                disabled={usedNames.has(c.name)}
                className="p-1.5 rounded hover:bg-destructive/20 hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
                title={usedNames.has(c.name) ? "Em uso — não é possível eliminar" : "Eliminar"}
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
