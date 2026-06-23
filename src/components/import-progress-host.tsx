import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  subscribeProgress, getProgress,
  subscribeConflicts, getConflicts,
  resolveConflicts,
  type ConflictDecision,
} from "@/lib/import-ui";
import { importProgress } from "@/lib/import-ui";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export function ImportProgressHost() {
  const [prog, setProg] = useState(getProgress());
  const [conf, setConf] = useState(getConflicts());
  useEffect(() => subscribeProgress(() => setProg({ ...getProgress() })), []);
  useEffect(() => subscribeConflicts(() => setConf({ ...getConflicts() })), []);

  return (
    <>
      <ProgressDialog state={prog} />
      <ConflictsDialog state={conf} />
    </>
  );
}

function ProgressDialog({ state }: { state: ReturnType<typeof getProgress> }) {
  if (!state.open) return null;
  const pct = state.total > 0 ? Math.min(100, Math.round((state.step / state.total) * 100)) : (state.done ? 100 : 0);
  const totalInserted = state.steps.reduce((a, s) => a + s.inserted, 0);
  const totalSkipped = state.steps.reduce((a, s) => a + s.skipped, 0);
  const totalUpdated = state.steps.reduce((a, s) => a + s.updated, 0);
  const totalErrors = state.steps.reduce((a, s) => a + s.errors, 0);

  return (
    <Dialog open={state.open} onOpenChange={(o) => { if (!o && state.done) importProgress.close(); }}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => { if (!state.done) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{state.title}</DialogTitle>
          <DialogDescription>
            {state.done
              ? (state.error ? "Importação concluída com erros." : "Importação concluída.")
              : (state.currentLabel || "A processar...")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Progress value={pct} />
          <div className="text-[11px] text-muted-foreground flex justify-between">
            <span>{state.step} / {state.total} secções</span>
            <span>{pct}%</span>
          </div>
        </div>

        {state.steps.length > 0 && (
          <div className="max-h-56 overflow-auto rounded-md border border-border bg-card/40 divide-y divide-border text-xs">
            {state.steps.map((s, i) => (
              <div key={i} className="px-3 py-2 flex items-center justify-between gap-2">
                <span className="font-medium truncate">{s.label}</span>
                <span className="text-muted-foreground shrink-0">
                  <span className="text-emerald-400">+{s.inserted}</span>
                  {s.updated ? <> · <span className="text-primary">~{s.updated}</span></> : null}
                  {s.skipped ? <> · <span className="text-muted-foreground">·{s.skipped}</span></> : null}
                  {s.errors ? <> · <span className="text-destructive">!{s.errors}</span></> : null}
                </span>
              </div>
            ))}
          </div>
        )}

        {state.done && (
          <div className="rounded-md border border-border bg-card/40 p-3 text-xs space-y-1">
            <div className="flex items-center gap-2">
              {state.error ? <XCircle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              <span className="font-medium">Resumo</span>
            </div>
            <div>Inseridos: <strong className="text-emerald-400">{totalInserted}</strong></div>
            {totalUpdated > 0 && <div>Atualizados: <strong className="text-primary">{totalUpdated}</strong></div>}
            <div>Ignorados (duplicados): <strong>{totalSkipped}</strong></div>
            {totalErrors > 0 && <div>Erros: <strong className="text-destructive">{totalErrors}</strong></div>}
            {state.error && <div className="text-destructive">{state.error}</div>}
          </div>
        )}

        {state.done && (
          <DialogFooter>
            <Button onClick={() => importProgress.close()}>Fechar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConflictsDialog({ state }: { state: ReturnType<typeof getConflicts> }) {
  const [decisions, setDecisions] = useState<ConflictDecision[]>([]);
  useEffect(() => {
    if (state.open) setDecisions(state.rows.map(() => "keep" as ConflictDecision));
  }, [state.open, state.rows]);

  if (!state.open) return null;

  const setOne = (i: number, d: ConflictDecision) => {
    setDecisions((arr) => { const c = [...arr]; c[i] = d; return c; });
  };
  const setAll = (d: ConflictDecision) => setDecisions(state.rows.map(() => d));

  return (
    <Dialog open={state.open} onOpenChange={() => { /* require explicit choice */ }}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Conflitos de importação ({state.rows.length})
          </DialogTitle>
          <DialogDescription>
            Estes itens já existem mas têm campos diferentes. Escolhe se queres manter os atuais ou atualizar com os do ficheiro.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs">
          <Button size="sm" variant="outline" onClick={() => setAll("keep")}>Manter todos</Button>
          <Button size="sm" variant="outline" onClick={() => setAll("update")}>Atualizar todos</Button>
        </div>

        <div className="max-h-[50vh] overflow-auto space-y-2">
          {state.rows.map((row, i) => (
            <div key={i} className="rounded-md border border-border bg-card/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{row.label}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{row.table}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant={decisions[i] === "keep" ? "default" : "outline"}
                    onClick={() => setOne(i, "keep")}
                  >Manter</Button>
                  <Button
                    size="sm"
                    variant={decisions[i] === "update" ? "default" : "outline"}
                    onClick={() => setOne(i, "update")}
                  >Atualizar</Button>
                </div>
              </div>
              <div className="text-[11px] space-y-1">
                {row.diffs.slice(0, 6).map((d, j) => (
                  <div key={j} className="grid grid-cols-[80px_1fr_1fr] gap-2">
                    <span className="text-muted-foreground truncate">{d.field}</span>
                    <span className="truncate" title={String(d.existing ?? "")}>
                      <span className="text-muted-foreground">atual:</span> {fmt(d.existing)}
                    </span>
                    <span className="truncate" title={String(d.incoming ?? "")}>
                      <span className="text-muted-foreground">novo:</span> {fmt(d.incoming)}
                    </span>
                  </div>
                ))}
                {row.diffs.length > 6 && (
                  <div className="text-[10px] text-muted-foreground">+ {row.diffs.length - 6} campo(s) adicional(is)</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={() => resolveConflicts(decisions)}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
