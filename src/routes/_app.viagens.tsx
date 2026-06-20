import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Field, inputCls } from "./_app.notas";

export const Route = createFileRoute("/_app/viagens")({
  component: ViagensLayout,
});

export interface Trip {
  id: string;
  user_id: string;
  name: string;
  destination: string;
  description: string;
  secondary_destinations: string[];
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  currency: string;
  cover_image: string | null;
  status: "planned" | "confirmed" | "ongoing" | "completed" | "cancelled";
  notes: string;
  created_at: string;
  updated_at: string;
}

function ViagensLayout() {
  return <Outlet />;
}

export function TripDialog({ initial, onClose, onSave, error }: {
  initial: Trip | null;
  onClose: () => void;
  onSave: (d: { destination: string; name: string; description: string; secondary_destinations: string[]; currency: string; cover_image: string | null; status: string; start_date: string | null; end_date: string | null; budget: number | null; notes: string }) => Promise<void>;
  error: string | null;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [secondary, setSecondary] = useState((initial?.secondary_destinations ?? []).join(", "));
  const [currency, setCurrency] = useState(initial?.currency ?? "EUR");
  const [coverImage, setCoverImage] = useState(initial?.cover_image ?? "");
  const [status, setStatus] = useState(initial?.status ?? "planned");
  const [start, setStart] = useState(initial?.start_date ?? "");
  const [end, setEnd] = useState(initial?.end_date ?? "");
  const [budget, setBudget] = useState(initial?.budget != null ? String(initial.budget) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!destination.trim()) {
      setLocalError("Destino principal é obrigatório.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        destination: destination.trim(),
        name: name.trim(),
        description: description.trim(),
        secondary_destinations: secondary.split(",").map((item) => item.trim()).filter(Boolean),
        currency,
        cover_image: coverImage.trim() || null,
        status,
        start_date: start || null,
        end_date: end || null,
        budget: budget ? Number(budget) : null,
        notes,
      });
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "Erro desconhecido ao guardar a viagem.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto">
      <form onSubmit={submit} className="glass-card neon-border w-full max-w-2xl p-6 space-y-4 page-enter max-h-[90vh] overflow-y-auto my-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold neon-text">{initial ? "Editar viagem" : "Nova viagem"}</h3>
            <p className="text-sm text-muted-foreground">Regista os detalhes principais da viagem e prepara a estrutura do Travel Planner.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:text-primary"><X className="h-4 w-4" /></button>
        </div>

        {(error || localError) ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error || localError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Field label="Nome da viagem"><input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="Destino principal"><input value={destination} maxLength={200} onChange={(e) => setDestination(e.target.value)} className={inputCls} /></Field>
        </div>

        <Field label="Descrição"><textarea value={description} maxLength={3000} rows={3} onChange={(e) => setDescription(e.target.value)} className={inputCls + " resize-none"} /></Field>
        <Field label="Destinos secundários"><input value={secondary} onChange={(e) => setSecondary(e.target.value)} placeholder="Lisboa, Porto, Faro" className={inputCls} /></Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Data início"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} /></Field>
          <Field label="Data fim"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} /></Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Orçamento estimado"><input type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} className={inputCls} /></Field>
          <Field label="Moeda"><select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
            {[["EUR", "EUR"], ["USD", "USD"], ["GBP", "GBP"], ["BRL", "BRL"]].map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select></Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Imagem de capa (URL)"><input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} className={inputCls} /></Field>
          <Field label="Estado"><select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls}>
            <option value="planned">Planeada</option>
            <option value="confirmed">Confirmada</option>
            <option value="ongoing">Em curso</option>
            <option value="completed">Concluída</option>
            <option value="cancelled">Cancelada</option>
          </select></Field>
        </div>

        {coverImage && (
          <div className="rounded-xl overflow-hidden border border-border">
            <img src={coverImage} alt="Imagem de capa" className="w-full h-48 object-cover" />
          </div>
        )}

        <Field label="Notas"><textarea value={notes} maxLength={5000} rows={3} onChange={(e) => setNotes(e.target.value)} className={inputCls + " resize-none"} /></Field>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-accent">Cancelar</button>
          <button type="submit" disabled={busy || !destination.trim()} className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:shadow-glow-strong disabled:opacity-50">Guardar</button>
        </div>
      </form>
    </div>
  );
}
