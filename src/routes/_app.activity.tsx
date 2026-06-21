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
import { pickJsonFile, pickJsonFileWithName, exportData, exportTable, importTable, recordImport, getLastImport, recordLastImportIds, getLastImportIds } from "@/lib/data-io";
import { Trash2, Upload, Download, Plus, Wand2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";

export const Route = createFileRoute("/_app/activity")({
  component: ActivityPage,
});

type Category = { id: string; name: string; color: string; parent_id?: string | null };
type Project = { id: string; name: string; color: string };
type Rule = {
  id: string; rule_type: "app_name" | "window_title_contains";
  pattern: string; category_id: string | null; project_id: string | null; priority: number;
};
type Log = {
  id: string; start_time: string; end_time: string; duration_seconds: number;
  app_name: string; window_title: string;
  category_id: string | null; project_id: string | null;
  external_id?: string | null;
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
          <TabsTrigger value="unclassified">Por classificar</TabsTrigger>
          <TabsTrigger value="classified">Classificadas</TabsTrigger>
          <TabsTrigger value="rules">Regras</TabsTrigger>
          <TabsTrigger value="meta">Categorias & Projetos</TabsTrigger>
          <TabsTrigger value="import">Importar</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab logs={logs.data ?? []} cats={cats.data ?? []} projs={projs.data ?? []} />
        </TabsContent>
        <TabsContent value="unclassified" className="mt-4">
          <UnclassifiedTab uid={uid!} allLogs={logs.data ?? []} cats={cats.data ?? []} projs={projs.data ?? []} onChanged={() => { qc.invalidateQueries({ queryKey: ["activity_logs"] }); qc.invalidateQueries({ queryKey: ["activity_rules"] }); }} />
        </TabsContent>
        <TabsContent value="classified" className="mt-4">
          <ClassifiedTab allLogs={logs.data ?? []} cats={cats.data ?? []} projs={projs.data ?? []} onChanged={() => qc.invalidateQueries({ queryKey: ["activity_logs"] })} />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <RulesTab uid={uid!} rules={rules.data ?? []} cats={cats.data ?? []} projs={projs.data ?? []} onChanged={() => { qc.invalidateQueries({ queryKey: ["activity_rules"] }); qc.invalidateQueries({ queryKey: ["activity_logs"] }); }} />
        </TabsContent>
        <TabsContent value="meta" className="mt-4">
          <MetaTab uid={uid!} cats={cats.data ?? []} projs={projs.data ?? []} onChanged={async () => {
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["activity_categories"], refetchType: "all" }),
              qc.invalidateQueries({ queryKey: ["activity_projects"], refetchType: "all" }),
              qc.invalidateQueries({ queryKey: ["activity_rules"], refetchType: "all" }),
              qc.invalidateQueries({ queryKey: ["activity_logs"], refetchType: "all" }),
            ]);
            await Promise.all([cats.refetch(), projs.refetch(), rules.refetch(), logs.refetch()]);
          }} />
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
  const [parentCatFilter, setParentCatFilter] = useState<string>("all");
  const [subCatFilter, setSubCatFilter] = useState<string>("all");
  const [projFilter, setProjFilter] = useState<string>("all");

  const parents = useMemo(() => cats.filter(c => !c.parent_id), [cats]);
  const subsOfSelected = useMemo(
    () => (parentCatFilter === "all" || parentCatFilter === "none" ? [] : cats.filter(c => c.parent_id === parentCatFilter)),
    [cats, parentCatFilter]
  );

  const range = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (period === "today") return { from: startOfToday, to: startOfToday + 24 * 3600 * 1000 };
    if (period === "yesterday") return { from: startOfToday - 24 * 3600 * 1000, to: startOfToday };
    const days = Number(period) || 30;
    return { from: Date.now() - days * 24 * 3600 * 1000, to: Infinity };
  }, [period]);

  const matchesCatFilter = (logCatId: string | null) => {
    if (parentCatFilter === "all") return true;
    if (parentCatFilter === "none") return !logCatId;
    if (!logCatId) return false;
    if (subCatFilter !== "all") return logCatId === subCatFilter;
    // include parent itself + all its subs
    const subIds = cats.filter(c => c.parent_id === parentCatFilter).map(c => c.id);
    return logCatId === parentCatFilter || subIds.includes(logCatId);
  };

  const filtered = useMemo(() => {
    return logs.filter(l => {
      const t = new Date(l.start_time).getTime();
      if (t < range.from || t >= range.to) return false;
      if (!matchesCatFilter(l.category_id)) return false;
      if (projFilter !== "all" && (l.project_id ?? "none") !== projFilter) return false;
      return true;
    });
  }, [logs, range, parentCatFilter, subCatFilter, projFilter, cats]);

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
        <Select value={parentCatFilter} onValueChange={(v) => { setParentCatFilter(v); setSubCatFilter("all"); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            <SelectItem value="none">Não classificado</SelectItem>
            {parents.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {subsOfSelected.length > 0 && (
          <Select value={subCatFilter} onValueChange={setSubCatFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Subcategoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as subcategorias</SelectItem>
              {subsOfSelected.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
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

type Scope = "last-import" | "7d" | "30d" | "all";

function UnclassifiedTab({ uid, allLogs, cats, projs, onChanged }: { uid: string; allLogs: Log[]; cats: Category[]; projs: Project[]; onChanged: () => void }) {
  const lastInfo = getLastImport("activity_logs");
  const lastIds = useMemo(() => new Set(getLastImportIds("activity_logs")), [allLogs.length]);
  const [scope, setScope] = useState<Scope>(lastIds.size ? "last-import" : "7d");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);

  const scoped = useMemo(() => {
    const unclassified = allLogs.filter(l => !l.category_id);
    if (scope === "last-import") {
      return unclassified.filter(l => l.external_id && lastIds.has(l.external_id));
    }
    if (scope === "all") return unclassified;
    const days = scope === "7d" ? 7 : 30;
    const cutoff = Date.now() - days * 86400_000;
    return unclassified.filter(l => new Date(l.start_time).getTime() >= cutoff);
  }, [allLogs, scope, lastIds]);

  const groups = useMemo(() => {
    const m = new Map<string, { app: string; total: number; entries: Log[] }>();
    for (const l of scoped) {
      const k = l.app_name || "—";
      const g = m.get(k) ?? { app: k, total: 0, entries: [] };
      g.total += l.duration_seconds;
      g.entries.push(l);
      m.set(k, g);
    }
    const arr = Array.from(m.values())
      .map(g => ({ ...g, entries: g.entries.sort((a, b) => b.duration_seconds - a.duration_seconds) }))
      .sort((a, b) => b.total - a.total);
    const q = search.trim().toLowerCase();
    return q ? arr.filter(g => g.app.toLowerCase().includes(q)) : arr;
  }, [scoped, search]);

  const totalSec = useMemo(() => scoped.reduce((a, l) => a + l.duration_seconds, 0), [scoped]);
  const visible = groups.slice(0, visibleCount);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={scope} onValueChange={(v) => { setScope(v as Scope); setVisibleCount(20); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="last-import" disabled={!lastIds.size}>Último import {lastIds.size ? `(${lastIds.size})` : ""}</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Filtrar por aplicação…" value={search} onChange={(e) => { setSearch(e.target.value); setVisibleCount(20); }} className="w-64" />
        <div className="text-xs text-muted-foreground ml-auto">
          {scoped.length} evento(s) • {groups.length} app(s) • {fmtDuration(totalSec)}
        </div>
      </div>
      {scope === "last-import" && lastInfo && (
        <div className="text-xs text-muted-foreground">
          Último import: <span className="font-medium text-foreground">{lastInfo.filename}</span> em {new Date(lastInfo.at).toLocaleString()}
        </div>
      )}
      {!groups.length ? (
        <div className="text-sm text-muted-foreground">
          {scoped.length ? "Nenhuma aplicação corresponde ao filtro." : "Não há atividades por classificar neste período 🎉"}
        </div>
      ) : (
        <>
          {visible.map(g => (
            <UnclassifiedRow key={g.app} uid={uid} app={g.app} totalSec={g.total} entries={g.entries} cats={cats} projs={projs} onChanged={onChanged} />
          ))}
          {groups.length > visible.length && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={() => setVisibleCount(c => c + 20)}>
                Mostrar mais ({groups.length - visible.length} restantes)
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}


function UnclassifiedRow({ uid, app, totalSec, entries, cats, projs, onChanged }: {
  uid: string; app: string; totalSec: number; entries: Log[]; cats: Category[]; projs: Project[]; onChanged: () => void;
}) {
  const [catId, setCatId] = useState<string>("");
  const [projId, setProjId] = useState<string>("");
  const [makeRule, setMakeRule] = useState(true);
  const [ruleType, setRuleType] = useState<"app_name" | "window_title_contains">("app_name");
  const [pattern, setPattern] = useState<string>(app);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function applyTo(ids: string[], makeRuleNow: boolean) {
    if (!catId) { toast.error("Escolhe uma categoria"); return; }
    setBusy(true);
    try {
      const patch: { category_id: string; project_id?: string } = { category_id: catId };
      if (projId && projId !== "__none__") patch.project_id = projId;
      const { error } = await supabase.from("activity_logs").update(patch).in("id", ids);
      if (error) throw error;
      if (makeRuleNow && pattern.trim()) {
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
            <div className="text-xs text-muted-foreground">{entries.length} registo(s) • {fmtDuration(totalSec)}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)}>
            {expanded ? "Ocultar entradas" : "Ver entradas"}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Select value={catId} onValueChange={setCatId}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.parent_id ? "↳ " : ""}{c.name}</SelectItem>)}
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
          <Button size="sm" onClick={() => applyTo(entries.map(e => e.id), makeRule)} disabled={busy}>
            <Wand2 className="h-4 w-4 mr-1" /> Aplicar a todos ({entries.length})
          </Button>
        </div>
        {expanded && (
          <div className="space-y-1 border-t border-border pt-2 max-h-80 overflow-y-auto">
            {entries.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded hover:bg-accent/50">
                <div className="flex-1 min-w-0">
                  <div className="truncate">{e.window_title || "(sem título)"}</div>
                  <div className="text-muted-foreground">{new Date(e.start_time).toLocaleString()} • {fmtDuration(e.duration_seconds)}</div>
                </div>
                <Button size="sm" variant="outline" disabled={busy || !catId} onClick={() => applyTo([e.id], false)}>
                  Classificar
                </Button>
              </div>
            ))}
          </div>
        )}
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
    try {
      // paginate logs (Supabase default cap is 1000 per request)
      const PAGE = 1000;
      const all: { id: string; app_name: string; window_title: string }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("activity_logs")
          .select("id, app_name, window_title")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      const { data: allRules, error: re } = await supabase
        .from("activity_rules").select("*").order("priority", { ascending: false });
      if (re) throw re;

      // group ids by (category_id|project_id) and bulk update
      const buckets = new Map<string, { cat: string; proj: string | null; ids: string[] }>();
      for (const l of all) {
        const m = matchRule(l.app_name, l.window_title, (allRules ?? []) as Rule[]);
        if (!m || !m.category_id) continue;
        const key = `${m.category_id}|${m.project_id ?? ""}`;
        const b = buckets.get(key) ?? { cat: m.category_id, proj: m.project_id, ids: [] };
        b.ids.push(l.id);
        buckets.set(key, b);
      }
      let n = 0;
      for (const b of buckets.values()) {
        // chunk .in() to avoid URL-length limits
        for (let i = 0; i < b.ids.length; i += 500) {
          const slice = b.ids.slice(i, i + 500);
          const { error } = await supabase
            .from("activity_logs")
            .update({ category_id: b.cat, project_id: b.proj })
            .in("id", slice);
          if (error) throw error;
          n += slice.length;
        }
      }
      toast.success(`Re-aplicado em ${n} registo(s)`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao re-aplicar regras");
    }
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
      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-base">Exportar / importar Activity</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <Button variant="outline" onClick={() => exportTable("activity_setup")}>
            <Download className="h-4 w-4 mr-1" /> Exportar categorias, projetos e regras
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await importTable("activity_setup", uid);
              onChanged();
            }}
          >
            <Upload className="h-4 w-4 mr-1" /> Importar JSON
          </Button>
        </CardContent>
      </Card>
      <CategoriesList cats={cats} uid={uid} onChanged={onChanged} />
      <MetaList title="Projetos" items={projs} table="activity_projects" uid={uid} onChanged={onChanged} defaultColor="#10b981" />
    </div>
  );
}

function CategoriesList({ cats, uid, onChanged }: { cats: Category[]; uid: string; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [parentId, setParentId] = useState<string>("__none__");
  const parents = useMemo(() => cats.filter(c => !c.parent_id), [cats]);

  async function add() {
    if (!name.trim()) return;
    const payload: any = { user_id: uid, name: name.trim(), color };
    if (parentId && parentId !== "__none__") payload.parent_id = parentId;
    const { error } = await supabase.from("activity_categories").insert(payload);
    if (error) { toast.error(error.message); return; }
    setName(""); setParentId("__none__"); onChanged();
  }
  async function del(id: string) {
    const { error } = await supabase.from("activity_categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Categorias</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-40" />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded border border-input bg-transparent" />
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Categoria-mãe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem mãe</SelectItem>
              {parents.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-1">
          {parents.map(p => (
            <div key={p.id}>
              <div className="flex items-center justify-between p-2 rounded border border-border">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: p.color }} />{p.name}</div>
                <div className="flex items-center gap-1">
                  <EditMetaDialog table="activity_categories" item={p} parents={parents} onChanged={onChanged} />
                  <Button variant="ghost" size="icon" onClick={() => del(p.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {cats.filter(c => c.parent_id === p.id).map(s => (
                <div key={s.id} className="flex items-center justify-between p-2 ml-6 rounded border border-border mt-1">
                  <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">↳</span><span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />{s.name}</div>
                  <div className="flex items-center gap-1">
                    <EditMetaDialog table="activity_categories" item={s} parents={parents} onChanged={onChanged} />
                    <Button variant="ghost" size="icon" onClick={() => del(s.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {!parents.length && <div className="text-sm text-muted-foreground">Vazio.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function MetaList({ title, items, table, uid, onChanged, defaultColor }: {
  title: string; items: { id: string; name: string; color: string }[];
  table: "activity_projects"; uid: string; onChanged: () => void; defaultColor: string;
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
              <div className="flex items-center gap-1">
                <EditMetaDialog table={table} item={i} onChanged={onChanged} />
                <Button variant="ghost" size="icon" onClick={() => del(i.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          {!items.length && <div className="text-sm text-muted-foreground">Vazio.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function EditMetaDialog({ table, item, parents, onChanged }: {
  table: "activity_categories" | "activity_projects";
  item: { id: string; name: string; color: string; parent_id?: string | null };
  parents?: Category[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(item.name);
  const [color, setColor] = useState(item.color);
  const [parentId, setParentId] = useState<string>(item.parent_id ?? "__none__");

  async function save() {
    const patch: any = { name: name.trim(), color };
    if (table === "activity_categories") patch.parent_id = parentId === "__none__" ? null : parentId;
    const { error } = await supabase.from(table).update(patch).eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Atualizado");
    setOpen(false);
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setName(item.name); setColor(item.color); setParentId(item.parent_id ?? "__none__"); } }}>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /></Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" />
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded border border-input bg-transparent" />
            <span className="text-sm text-muted-foreground">Cor</span>
          </div>
          {table === "activity_categories" && parents && (
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue placeholder="Categoria-mãe" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem mãe</SelectItem>
                {parents.filter(p => p.id !== item.id).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Classified ----------

function ClassifiedTab({ allLogs, cats, projs, onChanged }: { allLogs: Log[]; cats: Category[]; projs: Project[]; onChanged: () => void }) {
  const [scope, setScope] = useState<"7d" | "30d" | "all">("7d");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [projFilter, setProjFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let arr = allLogs.filter(l => l.category_id);
    if (scope !== "all") {
      const days = scope === "7d" ? 7 : 30;
      const cutoff = Date.now() - days * 86400_000;
      arr = arr.filter(l => new Date(l.start_time).getTime() >= cutoff);
    }
    if (catFilter !== "all") arr = arr.filter(l => l.category_id === catFilter);
    if (projFilter !== "all") arr = arr.filter(l => (l.project_id ?? "__none__") === projFilter);
    const q = search.trim().toLowerCase();
    if (q) arr = arr.filter(l => (l.app_name || "").toLowerCase().includes(q) || (l.window_title || "").toLowerCase().includes(q));
    return arr;
  }, [allLogs, scope, catFilter, projFilter, search]);

  const visible = filtered.slice(0, visibleCount);
  const totalSec = filtered.reduce((a, l) => a + l.duration_seconds, 0);

  async function unclassify(id: string) {
    setBusyId(id);
    const { error } = await supabase.from("activity_logs").update({ category_id: null, project_id: null }).eq("id", id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Removida classificação");
    onChanged();
  }

  async function updateLog(id: string, patch: { category_id?: string | null; project_id?: string | null }) {
    setBusyId(id);
    const { error } = await supabase.from("activity_logs").update(patch).eq("id", id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    onChanged();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={scope} onValueChange={(v) => { setScope(v as any); setVisibleCount(50); }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={(v) => { setCatFilter(v); setVisibleCount(50); }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.parent_id ? "↳ " : ""}{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={projFilter} onValueChange={(v) => { setProjFilter(v); setVisibleCount(50); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Projeto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os projetos</SelectItem>
            <SelectItem value="__none__">Sem projeto</SelectItem>
            {projs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Procurar app ou título…" value={search} onChange={(e) => { setSearch(e.target.value); setVisibleCount(50); }} className="w-64" />
        <div className="text-xs text-muted-foreground ml-auto">
          {filtered.length} registo(s) • {fmtDuration(totalSec)}
        </div>
      </div>

      {!filtered.length ? (
        <div className="text-sm text-muted-foreground">Sem atividades classificadas neste filtro.</div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-2">Quando</th>
                  <th className="p-2">App / Título</th>
                  <th className="p-2">Categoria</th>
                  <th className="p-2">Projeto</th>
                  <th className="p-2 text-right">Duração</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(l => {
                  const c = cats.find(x => x.id === l.category_id);
                  return (
                    <tr key={l.id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">{new Date(l.start_time).toLocaleString()}</td>
                      <td className="p-2 min-w-0 max-w-md">
                        <div className="truncate font-medium">{l.app_name || "—"}</div>
                        <div className="truncate text-xs text-muted-foreground">{l.window_title}</div>
                      </td>
                      <td className="p-2">
                        <Select value={l.category_id ?? ""} onValueChange={(v) => updateLog(l.id, { category_id: v })}>
                          <SelectTrigger className="h-8 w-44">
                            <SelectValue>{c ? <Badge style={{ backgroundColor: c.color, color: "white" }}>{c.name}</Badge> : "—"}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {cats.map(x => <SelectItem key={x.id} value={x.id}>{x.parent_id ? "↳ " : ""}{x.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Select value={l.project_id ?? "__none__"} onValueChange={(v) => updateLog(l.id, { project_id: v === "__none__" ? null : v })}>
                          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sem projeto</SelectItem>
                            {projs.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2 text-right whitespace-nowrap">{fmtDuration(l.duration_seconds)}</td>
                      <td className="p-2 text-right">
                        <Button size="sm" variant="ghost" disabled={busyId === l.id} onClick={() => unclassify(l.id)} title="Remover classificação">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {filtered.length > visible.length && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setVisibleCount(c => c + 50)}>
            Mostrar mais ({filtered.length - visible.length} restantes)
          </Button>
        </div>
      )}
    </div>
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
  const [lastImport, setLastImport] = useState(() => getLastImport("activity_logs"));

  async function doImport() {
    const picked = await pickJsonFileWithName();
    if (!picked) return;
    const events = parseAW(picked.parsed);
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
      recordImport("activity_logs", picked.filename);
      recordLastImportIds("activity_logs", rows.map(r => r.external_id));
      setLastImport(getLastImport("activity_logs"));
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
            <Button variant="outline" onClick={() => exportData("activity_logs", { items: logs })}>
              <Download className="h-4 w-4 mr-1" /> Exportar logs
            </Button>
          </div>
          {preview && (
            <div className="text-sm">
              Importados: <b>{preview.total}</b> • Classificados automaticamente: <b>{preview.matched}</b> • Por classificar: <b>{preview.unmatched}</b>
            </div>
          )}
          {lastImport && (
            <div className="text-xs text-muted-foreground border-t border-border pt-2 mt-1">
              Último import: <span className="font-medium text-foreground">{lastImport.filename}</span>{" "}
              em {new Date(lastImport.at).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
