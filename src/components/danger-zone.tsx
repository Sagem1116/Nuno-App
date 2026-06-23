import { useState } from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DangerZoneProps {
  title: string;
  description: string;
  confirmText: string;
  onConfirm: () => Promise<{ count: number } | void>;
}

export function DangerZone({ title, description, confirmText, onConfirm }: DangerZoneProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");

  const run = async () => {
    if (typed !== confirmText) {
      toast.error(`Escreve "${confirmText}" para confirmar`);
      return;
    }
    setBusy(true);
    try {
      const res = await onConfirm();
      toast.success(res?.count != null ? `${res.count} item(s) apagado(s)` : "Apagado");
      setOpen(false);
      setTyped("");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao apagar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card border border-destructive/30 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-destructive/15 grid place-items-center shrink-0">
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-destructive">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25"
          >
            <Trash2 className="h-3.5 w-3.5" /> Apagar tudo
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-destructive/20 pt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Esta ação é irreversível. Escreve <span className="font-mono text-destructive">{confirmText}</span> para confirmar.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmText}
              className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-input border border-destructive/40 text-sm focus:border-destructive focus:outline-none"
            />
            <button
              type="button"
              disabled={busy || typed !== confirmText}
              onClick={run}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setTyped(""); }}
              className="px-3 py-2 rounded-lg text-xs hover:bg-accent"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Helper: delete all rows of one or more tables for the authenticated user. */
export async function deleteAllForUser(
  supabase: any,
  userId: string,
  tables: string[],
): Promise<number> {
  let total = 0;
  for (const t of tables) {
    const { count, error } = await supabase
      .from(t)
      .delete({ count: "exact" })
      .eq("user_id", userId);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}
