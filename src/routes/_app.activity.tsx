import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { pickJsonFile, exportData } from "@/lib/data-io";
import { Trash2, Upload, Download, Plus, Wand2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";

export const Route = createFileRoute("/_app/activity")({
  component: ActivityPage,
});

type Category = { id: string; name: string; color: string };
type Project = { id: string; name: string; color: string };
type Rule = {
  id: string; rule_type: "app_name" | "window_title_contains";
  pattern: string; category_id: string | null; project_id: string | null; priority: number;
};
type Log = {
  id: string; start_time: string; end_time: string; duration_seconds: number;
  app_name: string; window_title: string;
  category_id: string | null; project_id: string | null;
};

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6"];

function fmtDuration(sec: number) {
  if (!sec || sec <= 0) return "0s";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const h = sec / 3600;
  return h % 1 === 0 ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
}

function ActivityPage() {
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const cats = useQuery({
    queryKey: ["activity_categories", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_categories").select("*").order("name");
      if (error) throw error; return (data ?? []) as Category[];
    },
  });
  const projs = useQuery({
    queryKey: ["activity_projects", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_projects").select("*").order("name");
      if (error) throw error; return (data ?? []) as Project[];
    },
  });
  const rules = useQuery({
    queryKey: ["activity_rules", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_rules").select("*").order("priority", { ascending: false });
      if (error) throw error; return (data ?? []) as Rule[];
    },
  });
  const logs = useQuery({
    queryKey: ["activity_logs", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("activity_logs").select("*").order("start_time", { ascending: false }).limit(5000);
      if (error) throw error; return (data ?? []) as Log[];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold neon-text">Activity Analytics</h2>
        <p className="text-sm text-muted-foreground">Importa, classifica e analisa atividades do ActivityWatch.</p>
      </div>
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="unclassified">Não classificados</TabsTrigger>
          <TabsTrigger value="rules">Regras</TabsTrigger>
          <TabsTrigger value="meta">Categorias & Projetos</TabsTrigger>
          <TabsTrigger value="import">Importar</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab logs={logs.data ?? []} cats={cats.data ?? []} projs={projs.data ?? []} />
        </TabsContent>
        <TabsContent value="unclassified" className="mt-4">
          <UnclassifiedTab uid={uid!} logs={(logs.data ?? []).filter(l => !l.category_id)} cats={cats.data ?? []} projs={projs.data ?? []} onChanged={() => { qc.invalidateQueries({ queryKey: ["activity_logs"] }); qc.invalidateQueries({ queryKey: ["activity_rules"] }); }} />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <RulesTab uid={uid!} rules={rules.data ?? []} cats={cats.data ?? []} projs={projs.data ?? []} onChanged={() => qc.invalidateQueries({ queryKey: ["activity_rules"] })} />
        </TabsContent>
        <TabsContent value="meta" className="mt-4">
          <MetaTab uid={uid!} cats={cats.data ?? []} projs={projs.data ?? []} onChanged={() => { qc.invalidateQueries({ queryKey: ["activity_categories"] }); qc.invalidateQueries({ queryKey: ["activity_projects"] }); }} />
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <ImportTab uid={uid!} rules={rules.data ?? []} logs={logs.data ?? []} onImported={() => qc.invalidateQueries({ queryKey: ["activity_logs"] })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Dashboard ----------

function DashboardTab({ logs, cats, projs }: { logs: Log[]; cats: Category[]; projs: Project[] }) {
  const [period, setPeriod] = useState<string>("30");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [projFilter, setProjFilter] = useState<string>("all");

  const range = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (period === "today") return { from: startOfToday, to: startOfToday + 24 * 3600 * 1000 };
    if (period === "yesterday") return { from: startOfToday - 24 * 3600 * 1000, to: startOfToday };
    const days = Number(period) || 30;
    return { from: Date.now() - days * 24 * 3600 * 1000, to: Infinity };
  }, [period]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      const t = new Date(l.start_time).getTime();
      if (t < range.from || t >= range.to) return false;
      if (catFilter !== "all" && (l.category_id ?? "none") !== catFilter) return false;
      if (projFilter !== "all" && (l.project_id ?? "none") !== projFilter) return false;
      return true;
    });
  }, [logs, range, catFilter, projFilter]);

  const total = filtered.reduce((a, l) => a + l.duration_seconds, 0);
  const unclassified = filtered.filter(l => !l.category_id).reduce((a, l) => a + l.duration_seconds, 0);

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filtered) m.set(l.category_id ?? "unclassified", (m.get(l.category_id ?? "unclassified") ?? 0) + l.duration_seconds);
    return Array.from(m.entries()).map(([id, sec], i) => {
      const c = cats.find(x => x.id === id);
      return { name: c?.name ?? "Não classificado", value: sec, color: c?.color ?? COLORS[i % COLORS.length] };
    }).sort((a, b) => b.value - a.value);
  }, [filtered, cats]);

  const byProj = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filtered) if (l.project_id) m.set(l.project_id, (m.get(l.project_id) ?? 0) + l.duration_seconds);
    return Array.from(m.entries()).map(([id, sec], i) => {
      const p = projs.find(x => x.id === id);
      return { name: p?.name ?? "—", value: sec, color: p?.color ?? COLORS[i % COLORS.length] };
    }).sort((a, b) => b.value - a.value);
  }, [filtered, projs]);

  const byApp = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filtered) m.set(l.app_name || "—", (m.get(l.app_name || "—") ?? 0) + l.duration_seconds);
    return Array.from(m.entries())
      .map(([name, sec]) => ({ name, seconds: sec }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 10);
  }, [filtered]);

  const timeline = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filtered) {
      const d = new Date(l.start_time).toISOString().slice(0, 10);
      m.set(d, (m.get(d) ?? 0) + l.duration_seconds);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, sec]) => ({ date: date.slice(5), seconds: sec }));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="yesterday">Ontem</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="365">Último ano</SelectItem>
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            <SelectItem value="none">Não classificado</SelectItem>
            {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={projFilter} onValueChange={setProjFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Projeto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os projetos</SelectItem>
            <SelectItem value="none">Sem projeto</SelectItem>
            {projs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total</div><div className="text-2xl font-semibold">{fmtDuration(total)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Não classificado</div><div className="text-2xl font-semibold">{fmtDuration(unclassified)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Atividades</div><div className="text-2xl font-semibold">{filtered.length}</div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Horas por categoria</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byCat} dataKey="value" nameKey="name" outerRadius={90} label={(entry: any) => fmtDuration(entry.value)}>
                  {byCat.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(value: number) => fmtDuration(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Horas por projeto</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            {byProj.length === 0 ? <div className="text-sm text-muted-foreground">Sem projetos atribuídos.</div> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byProj} dataKey="value" nameKey="name" outerRadius={90} label={(entry: any) => fmtDuration(entry.value)}>
                    {byProj.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => fmtDuration(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Evolução temporal</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" tickFormatter={(v: number) => fmtDuration(v)} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} formatter={(value: number) => fmtDuration(value)} />
                <Line type="monotone" dataKey="seconds" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Top aplicações</CardTitle></CardHeader>
          <CardContent style={{ height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={byApp} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" stroke="var(--muted-foreground)" tickFormatter={(v: number) => fmtDuration(v)} />
                <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" width={140} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} formatter={(value: number) => fmtDuration(value)} />
                <Bar dataKey="seconds" fill="var(--primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------- Unclassified ----------

function UnclassifiedTab({ uid, logs, cats, projs, onChanged }: { uid: string; logs: Log[]; cats: Category[]; projs: Project[]; onChanged: () => void }) {
  // Group by app_name for batch classification
  const groups = useMemo(() => {
    const m = new Map<string, { app: string; titles: Set<string>; total: number; ids: string[] }>();
    for (const l of logs) {
      const k = l.app_name || "—";
      const g = m.get(k) ?? { app: k, titles: new Set(), total: 0, ids: [] };
      g.titles.add(l.window_title);
      g.total += l.duration_seconds;
      g.ids.push(l.id);
      m.set(k, g);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [logs]);

  if (!logs.length) return <div className="text-sm text-muted-foreground">Não há atividades por classificar 🎉</div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{logs.length} atividade(s) sem categoria, agrupadas por aplicação.</p>
      {groups.map(g => (
        <UnclassifiedRow key={g.app} uid={uid} app={g.app} totalSec={g.total} titles={Array.from(g.titles).slice(0, 5)} ids={g.ids} cats={cats} projs={projs} onChanged={onChanged} />
      ))}
    </div>
  );
}

function UnclassifiedRow({ uid, app, totalSec, titles, ids, cats, projs, onChanged }: {
  uid: string; app: string; totalSec: number; titles: string[]; ids: string[]; cats: Category[]; projs: Project[]; onChanged: () => void;
}) {
  const [catId, setCatId] = useState<string>("");
  const [projId, setProjId] = useState<string>("");
  const [makeRule, setMakeRule] = useState(true);
  const [ruleType, setRuleType] = useState<"app_name" | "window_title_contains">("app_name");
  const [pattern, setPattern] = useState<string>(app);
  const [busy, setBusy] = useState(false);

  async function apply() {
    if (!catId) { toast.error("Escolhe uma categoria"); return; }
    setBusy(true);
    try {
      const patch: { category_id: string; project_id?: string } = { category_id: catId };
      if (projId && projId !== "__none__") patch.project_id = projId;
      const { error } = await supabase.from("activity_logs").update(patch).in("id", ids);
      if (error) throw error;
      if (makeRule && pattern.trim()) {
        const { error: rErr } = await supabase.from("activity_rules").insert({
          user_id: uid, rule_type: ruleType, pattern: pattern.trim(),
          category_id: catId, project_id: projId && projId !== "__none__" ? projId : null,
          priority: ruleType === "app_name" ? 10 : 5,
        });
        if (rErr) throw rErr;
      }
      toast.success(`${ids.length} atividade(s) classificadas`);
      onChanged();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium">{app}</div>
            <div className="text-xs text-muted-foreground">{ids.length} registo(s) • {fmtDuration(totalSec)}</div>
          </div>
        </div>
        {titles.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {titles.map((t, i) => <Badge key={i} variant="secondary" className="font-normal text-xs max-w-xs truncate">{t || "(sem título)"}</Badge>)}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select value={catId} onValueChange={setCatId}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={projId} onValueChange={setProjId}>
            <SelectTrigger><SelectValue placeholder="Projeto (opcional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem projeto</SelectItem>
              {projs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={makeRule} onChange={(e) => setMakeRule(e.target.checked)} />
            Criar regra
          </label>
          {makeRule && (
            <>
              <Select value={ruleType} onValueChange={(v) => setRuleType(v as any)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="app_name">App exato</SelectItem>
                  <SelectItem value="window_title_contains">Título contém</SelectItem>
                </SelectContent>
              </Select>
              <Input value={pattern} onChange={(e) => setPattern(e.target.value)} className="w-64" placeholder="padrão" />
            </>
          )}
          <Button size="sm" onClick={apply} disabled={busy}><Wand2 className="h-4 w-4 mr-1" /> Aplicar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Rules ----------

function RulesTab({ uid, rules, cats, projs, onChanged }: { uid: string; rules: Rule[]; cats: Category[]; projs: Project[]; onChanged: () => void }) {
  const [ruleType, setRuleType] = useState<"app_name" | "window_title_contains">("app_name");
  const [pattern, setPattern] = useState("");
  const [catId, setCatId] = useState("");
  const [projId, setProjId] = useState("");

  async function add() {
    if (!pattern.trim() || !catId) { toast.error("Preenche padrão e categoria"); return; }
    const { error } = await supabase.from("activity_rules").insert({
      user_id: uid, rule_type: ruleType, pattern: pattern.trim(),
      category_id: catId, project_id: projId && projId !== "__none__" ? projId : null,
      priority: ruleType === "app_name" ? 10 : 5,
    });
    if (error) { toast.error(error.message); return; }
    setPattern(""); onChanged();
  }
  async function del(id: string) {
    const { error } = await supabase.from("activity_rules").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }
  async function reapplyAll() {
    const { data: allLogs, error: le } = await supabase.from("activity_logs").select("id, app_name, window_title");
    if (le) { toast.error(le.message); return; }
    const { data: allRules, error: re } = await supabase.from("activity_rules").select("*").order("priority", { ascending: false });
    if (re) { toast.error(re.message); return; }
    let n = 0;
    for (const l of allLogs ?? []) {
      const m = matchRule(l.app_name, l.window_title, (allRules ?? []) as Rule[]);
      if (m) {
        await supabase.from("activity_logs").update({ category_id: m.category_id, project_id: m.project_id }).eq("id", l.id);
        n++;
      }
    }
    toast.success(`Re-aplicado em ${n} registo(s)`); onChanged();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Nova regra</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <Select value={ruleType} onValueChange={(v) => setRuleType(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="app_name">App exato</SelectItem>
              <SelectItem value="window_title_contains">Título contém</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="padrão (ex.: Code.exe)" value={pattern} onChange={(e) => setPattern(e.target.value)} />
          <Select value={catId} onValueChange={setCatId}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>{cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={projId} onValueChange={setProjId}>
            <SelectTrigger><SelectValue placeholder="Projeto (opcional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem projeto</SelectItem>
              {projs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={reapplyAll}><Wand2 className="h-4 w-4 mr-1" /> Re-aplicar regras a todos</Button>
      </div>

      <div className="space-y-2">
        {rules.map(r => {
          const c = cats.find(x => x.id === r.category_id);
          const p = projs.find(x => x.id === r.project_id);
          return (
            <Card key={r.id}>
              <CardContent className="pt-4 flex flex-wrap items-center gap-2 justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{r.rule_type === "app_name" ? "App" : "Título contém"}</Badge>
                  <code className="text-sm">{r.pattern}</code>
                  <span className="text-muted-foreground">→</span>
                  {c && <Badge style={{ backgroundColor: c.color, color: "white" }}>{c.name}</Badge>}
                  {p && <Badge variant="secondary">{p.name}</Badge>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          );
        })}
        {!rules.length && <div className="text-sm text-muted-foreground">Sem regras. Adiciona uma ou cria a partir da aba "Não classificados".</div>}
      </div>
    </div>
  );
}

// ---------- Meta (categories + projects) ----------

function MetaTab({ uid, cats, projs, onChanged }: { uid: string; cats: Category[]; projs: Project[]; onChanged: () => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <MetaList title="Categorias" items={cats} table="activity_categories" uid={uid} onChanged={onChanged} defaultColor="#6366f1" />
      <MetaList title="Projetos" items={projs} table="activity_projects" uid={uid} onChanged={onChanged} defaultColor="#10b981" />
    </div>
  );
}

function MetaList({ title, items, table, uid, onChanged, defaultColor }: {
  title: string; items: { id: string; name: string; color: string }[];
  table: "activity_categories" | "activity_projects"; uid: string; onChanged: () => void; defaultColor: string;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(defaultColor);
  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from(table).insert({ user_id: uid, name: name.trim(), color });
    if (error) { toast.error(error.message); return; }
    setName(""); onChanged();
  }
  async function del(id: string) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded border border-input bg-transparent" />
          <Button size="sm" onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-1">
          {items.map(i => (
            <div key={i.id} className="flex items-center justify-between p-2 rounded border border-border">
              <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: i.color }} />{i.name}</div>
              <Button variant="ghost" size="icon" onClick={() => del(i.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {!items.length && <div className="text-sm text-muted-foreground">Vazio.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Import ----------

function matchRule(app: string, title: string, rules: Rule[]): Rule | null {
  const apps = rules.filter(r => r.rule_type === "app_name").sort((a, b) => b.priority - a.priority);
  for (const r of apps) if (r.pattern.toLowerCase() === (app || "").toLowerCase()) return r;
  const titles = rules.filter(r => r.rule_type === "window_title_contains").sort((a, b) => b.priority - a.priority);
  const tLow = (title || "").toLowerCase();
  for (const r of titles) if (tLow.includes(r.pattern.toLowerCase())) return r;
  return null;
}

type AWEvent = {
  id?: number | string;
  timestamp: string;
  duration: number;
  data?: { app?: string; title?: string; [k: string]: any };
};

function parseAW(input: any): AWEvent[] {
  // Accept: array of events, { events: [] }, { buckets: { ...: { events: [] } } }
  if (Array.isArray(input)) return input as AWEvent[];
  if (Array.isArray(input?.events)) return input.events as AWEvent[];
  if (input?.buckets) {
    const all: AWEvent[] = [];
    for (const b of Object.values<any>(input.buckets)) {
      if (Array.isArray(b?.events)) all.push(...b.events);
    }
    return all;
  }
  return [];
}

function ImportTab({ uid, rules, logs, onImported }: { uid: string; rules: Rule[]; logs: Log[]; onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ total: number; matched: number; unmatched: number } | null>(null);

  async function doImport() {
    const parsed = await pickJsonFile();
    if (!parsed) return;
    const events = parseAW(parsed);
    if (!events.length) { toast.error("Nenhum evento encontrado no JSON"); return; }
    setBusy(true);
    try {
      let matched = 0;
      const rows = events.map(ev => {
        const app = ev.data?.app ?? "";
        const title = ev.data?.title ?? "";
        const start = new Date(ev.timestamp);
        const end = new Date(start.getTime() + (Number(ev.duration) || 0) * 1000);
        const m = matchRule(app, title, rules);
        if (m) matched++;
        return {
          user_id: uid,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          duration_seconds: Math.round(Number(ev.duration) || 0),
          app_name: app,
          window_title: title,
          category_id: m?.category_id ?? null,
          project_id: m?.project_id ?? null,
          source: "activitywatch",
          external_id: ev.id != null ? `aw:${ev.id}:${ev.timestamp}` : `aw:${ev.timestamp}:${app}`,
        };
      }).filter(r => r.duration_seconds > 0);

      // upsert in chunks
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const { error } = await supabase.from("activity_logs").upsert(rows.slice(i, i + chunk), { onConflict: "user_id,external_id" });
        if (error) throw error;
      }
      setPreview({ total: rows.length, matched, unmatched: rows.length - matched });
      toast.success(`${rows.length} evento(s) importados`);
      onImported();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader><CardTitle className="text-base">Importar JSON do ActivityWatch</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Exporta um bucket do ActivityWatch (ex.: <code>aw-watcher-window</code>) em JSON e seleciona aqui o ficheiro.
            Aceita formato bruto de eventos, <code>{`{ events: [] }`}</code> ou <code>{`{ buckets: {...} }`}</code>.
            Registos duplicados (mesmo evento) são ignorados.
          </p>
          <div className="flex gap-2">
            <Button onClick={doImport} disabled={busy}><Upload className="h-4 w-4 mr-1" /> {busy ? "A importar..." : "Importar JSON"}</Button>
            <Button variant="outline" onClick={() => exportData("activity_logs", { version: 1, items: logs })}>
              <Download className="h-4 w-4 mr-1" /> Exportar logs
            </Button>
          </div>
          {preview && (
            <div className="text-sm">
              Importados: <b>{preview.total}</b> • Classificados automaticamente: <b>{preview.matched}</b> • Por classificar: <b>{preview.unmatched}</b>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
