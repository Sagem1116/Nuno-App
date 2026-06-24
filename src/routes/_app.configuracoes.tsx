import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, RefreshCw, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NotificationsSettings } from "@/components/notifications-settings";
import { AutoExportMenu } from "@/components/auto-export-menu";
import { StorageUsagePanel } from "@/components/storage-usage-panel";
import {
  exportTable, exportAllCombined, importTable, importAllCombined,
  getGlobalSchedule, setGlobalSchedule, getNextAutoExportAt, getLastAutoExportResult,
  type Table as DataTable, type Frequency,
} from "@/lib/data-io";

export const Route = createFileRoute("/_app/configuracoes")({
  component: ConfiguracoesPage,
});

const BACKUP_TABLES: { table: DataTable; label: string }[] = [
  { table: "notes", label: "Notas" },
  { table: "links", label: "Links" },
  { table: "tasks", label: "Tarefas" },
  { table: "transactions", label: "Transações" },
  { table: "timer_categories", label: "Categorias do cronómetro" },
  { table: "timer_sessions", label: "Sessões do cronómetro" },
  { table: "activity_setup", label: "Activity: categorias, projetos e regras" },
  { table: "trips", label: "Viagens (Travel Planner)" },
];

function ConfiguracoesPage() {
  const { user } = useAuth();
  return (
    <div className="page-enter space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/15 grid place-items-center">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold neon-text">Configurações</h1>
          <p className="text-sm text-muted-foreground">Notificações, backups e exportações.</p>
        </div>
      </div>

      <NotificationsSettings />

      <StorageUsagePanel />

      <BackupsPanel userId={user?.id} />
    </div>
  );
}

function BackupsPanel({ userId }: { userId: string | undefined }) {
  const [busy, setBusy] = useState(false);
  const [sched, setSched] = useState(() =>
    typeof window === "undefined"
      ? { enabled: false, frequency: "weekly" as Frequency, dayOfWeek: 1, dayOfMonth: 1, hour: 9, last: 0 }
      : getGlobalSchedule()
  );
  const updateSched = (patch: Partial<typeof sched>) => setSched(setGlobalSchedule(patch));

  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  const lastResult = typeof window === "undefined" ? null : getLastAutoExportResult();
  const nextAt = getNextAutoExportAt(sched);
  const weekDays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

  const exportAll = async () => {
    setBusy(true);
    try { await exportAllCombined(); setSched(getGlobalSchedule()); } finally { setBusy(false); }
  };
  const importAll = async () => {
    if (!userId) return;
    setBusy(true);
    try { await importAllCombined(userId); } finally { setBusy(false); }
  };

  return (
    <section className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Download className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-wider uppercase">Backups e exportações</h2>
      </div>
      <div className="px-5 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportAll}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-xs font-medium hover:shadow-glow-strong disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> {busy ? "A processar..." : "Exportar tudo (JSON)"}
          </button>
          <button
            type="button"
            onClick={importAll}
            disabled={busy || !userId}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-input border border-border text-xs hover:border-primary/50 disabled:opacity-50"
            title="Importar um backup combinado (todas as secções num só ficheiro)"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Importar tudo (JSON)
          </button>
          <span className="text-[11px] text-muted-foreground">
            Um único ficheiro JSON com todas as secções (notas, links, tarefas, transações, cronómetro e Activity). Tags incluídas.
          </span>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Última execução</div>
            <div className="mt-1 font-medium">{sched.last ? new Date(sched.last).toLocaleString() : "Nunca"}</div>
            {lastResult && (
              <div className={`mt-0.5 text-[11px] ${lastResult.ok ? "text-emerald-400" : "text-destructive"}`}>
                {lastResult.ok
                  ? `✓ Sucesso${lastResult.count != null ? ` · ${lastResult.count} item(s)` : ""}`
                  : `✗ Erro: ${lastResult.error ?? "desconhecido"}`}
              </div>
            )}
            {lastResult?.filename && (
              <div className="mt-0.5 text-[10px] text-muted-foreground truncate" title={lastResult.filename}>{lastResult.filename}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Próximo agendamento</div>
            <div className="mt-1 font-medium">
              {sched.enabled ? (nextAt ? new Date(nextAt).toLocaleString() : "—") : "Desativado"}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {sched.enabled ? `${sched.frequency} · ${String(sched.hour).padStart(2, "0")}:00` : "Ativa abaixo para agendar"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Estado</div>
            <div className={`mt-1 font-medium ${sched.enabled ? "text-primary" : "text-muted-foreground"}`}>
              {sched.enabled ? "Auto-export ativo" : "Auto-export inativo"}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">Verificado a cada hora enquanto a app está aberta.</div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Auto-exportação programada (tudo)</div>
              <div className="text-[11px] text-muted-foreground">
                Exporta todas as secções automaticamente. {sched.last ? `Última: ${new Date(sched.last).toLocaleString()}` : "Nunca executada."}
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={sched.enabled}
                onChange={(e) => updateSched({ enabled: e.target.checked })}
                className="h-4 w-4 accent-primary"
              />
              {sched.enabled ? "Ativada" : "Desativada"}
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="text-xs space-y-1">
              <span className="block text-muted-foreground">Frequência</span>
              <select
                value={sched.frequency}
                onChange={(e) => updateSched({ frequency: e.target.value as Frequency })}
                className="w-full px-2 py-1.5 rounded-md bg-input border border-border text-xs"
              >
                <option value="daily">Diária</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
              </select>
            </label>
            {sched.frequency === "weekly" && (
              <label className="text-xs space-y-1">
                <span className="block text-muted-foreground">Dia da semana</span>
                <select
                  value={sched.dayOfWeek}
                  onChange={(e) => updateSched({ dayOfWeek: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 rounded-md bg-input border border-border text-xs"
                >
                  {weekDays.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </label>
            )}
            {sched.frequency === "monthly" && (
              <label className="text-xs space-y-1">
                <span className="block text-muted-foreground">Dia do mês</span>
                <select
                  value={sched.dayOfMonth}
                  onChange={(e) => updateSched({ dayOfMonth: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 rounded-md bg-input border border-border text-xs"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            )}
            <label className="text-xs space-y-1">
              <span className="block text-muted-foreground">Hora</span>
              <select
                value={sched.hour}
                onChange={(e) => updateSched({ hour: Number(e.target.value) })}
                className="w-full px-2 py-1.5 rounded-md bg-input border border-border text-xs"
              >
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Os backups disparam quando abres a app na hora escolhida (ou depois). É necessário ter a app aberta no dispositivo.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BACKUP_TABLES.map(({ table, label }) => (
            <div key={table} className="rounded-lg border border-border bg-card/40 p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{table}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => exportTable(table)}
                  title={`Exportar ${label} (JSON)`}
                  className="p-2 rounded-md hover:bg-accent hover:text-primary"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => userId && importTable(table, userId)}
                  title={`Importar ${label} (JSON)`}
                  className="p-2 rounded-md hover:bg-accent hover:text-primary"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <AutoExportMenu table={table} label={label} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
