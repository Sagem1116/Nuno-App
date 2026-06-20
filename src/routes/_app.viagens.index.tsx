import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, X, Trash2, Plane, MapPin, Calendar as CalIcon, Wallet, Globe, Image, CheckCircle2, Search, Filter } from "lucide-react";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Field, inputCls, EmptyState } from "./_app.notas";
import { Trip, TripDialog } from "./_app.viagens";

export const Route = createFileRoute("/_app/viagens/")({
  component: TripsIndexPage,
});

function TripsIndexPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [tab, setTab] = useState<"upcoming" | "ongoing" | "completed">("upcoming");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("trips").select("*").order("start_date", { ascending: false, nullsFirst: false });
    setTrips((data as Trip[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const now = new Date();
  const classify = (t: Trip): "upcoming" | "ongoing" | "completed" => {
    if (t.status === "ongoing") return "ongoing";
    if (t.status === "completed" || t.status === "cancelled") return "completed";
    if (!t.start_date) return "upcoming";
    const s = parseISO(t.start_date);
    const e = t.end_date ? parseISO(t.end_date) : s;
    if (isAfter(now, e)) return "completed";
    if (isBefore(now, s)) return "upcoming";
    return "ongoing";
  };

  const counts = useMemo(() => trips.reduce((acc, t) => {
    const c = classify(t);
    acc[c] += 1;
    return acc;
  }, { upcoming: 0, ongoing: 0, completed: 0 }), [trips]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const fromD = fromDate ? parseISO(fromDate) : null;
    const toD = toDate ? parseISO(toDate) : null;
    const minB = minBudget ? Number(minBudget) : null;
    const maxB = maxBudget ? Number(maxBudget) : null;
    return trips.filter((t) => {
      if (classify(t) !== tab) return false;
      if (q) {
        const hay = [
          t.destination, t.name, t.description,
          ...(t.secondary_destinations ?? []),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fromD || toD) {
        const s = t.start_date ? parseISO(t.start_date) : null;
        const e = t.end_date ? parseISO(t.end_date) : s;
        if (!s) return false;
        if (fromD && e && isBefore(e, fromD)) return false;
        if (toD && isAfter(s, toD)) return false;
      }
      if (minB != null && (t.budget == null || t.budget < minB)) return false;
      if (maxB != null && (t.budget == null || t.budget > maxB)) return false;
      return true;
    });
  }, [trips, tab, search, fromDate, toDate, minBudget, maxBudget]);

  const hasFilters = !!(search || fromDate || toDate || minBudget || maxBudget);
  const clearFilters = () => {
    setSearch(""); setFromDate(""); setToDate(""); setMinBudget(""); setMaxBudget("");
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminar viagem e todos os itens associados?")) return;
    setTrips((prev) => prev.filter((t) => t.id !== id));
    await (supabase as any).from("trips").delete().eq("id", id);
  };

  const handleSave = async (data: {
    destination: string;
    name: string;
    description: string;
    secondary_destinations: string[];
    currency: string;
    cover_image: string | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
    budget: number | null;
    notes: string;
  }) => {
    setSaveError(null);
    if (!user) {
      setSaveError("Necessita de iniciar sessão para guardar a viagem.");
      return;
    }

    if (editing) {
      const { data: upd, error } = await (supabase as any).from("trips")
        .update({ ...data, updated_at: new Date().toISOString() }).eq("id", editing.id).select().single();
      if (error) {
        setSaveError(error.message || "Erro ao atualizar a viagem.");
        return;
      }
      if (upd) setTrips((p) => p.map((t) => t.id === editing.id ? (upd as Trip) : t));
      setOpen(false);
      return;
    }

    const { data: ins, error } = await (supabase as any).from("trips").insert({ ...data, user_id: user.id }).select().single();
    if (error) {
      setSaveError(error.message || "Erro ao criar a viagem.");
      return;
    }
    if (ins) {
      setTrips((p) => [ins as Trip, ...p]);
      navigate({ to: "/viagens/$tripId", params: { tripId: (ins as Trip).id } });
      setOpen(false);
    }
  };

  return (
    <div className="page-enter space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Próximas viagens", value: counts.upcoming, valueKey: "upcoming" as const },
          { label: "Viagens em curso", value: counts.ongoing, valueKey: "ongoing" as const },
          { label: "Viagens concluídas", value: counts.completed, valueKey: "completed" as const },
        ].map((card) => (
          <button key={card.label} onClick={() => setTab(card.valueKey)}
            className={[
              "glass-card p-4 text-left transition-all border border-border hover:border-primary/60",
              tab === card.valueKey ? "bg-primary/10 border-primary text-primary" : "bg-card",
            ].join(" ")}
          >
            <span className="block text-xs uppercase tracking-[0.2em] text-muted-foreground">{card.label}</span>
            <span className="mt-2 block text-3xl font-semibold">{card.value}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-lg bg-card/50 border border-border w-fit">
          {([
            ["upcoming", "Próximas viagens"],
            ["ongoing", "Viagens em curso"],
            ["completed", "Viagens concluídas"],
          ] as const).map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)} className={[
              "px-4 py-1.5 rounded-md text-xs uppercase tracking-wider transition-all",
              tab === v ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground",
            ].join(" ")}>{l}</button>
          ))}
        </div>
        <button onClick={() => { setEditing(null); setOpen(true); }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium text-sm hover:shadow-glow-strong transition-all">
          <Plus className="h-4 w-4" /> Nova viagem
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar por destino, nome ou descrição..."
              className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-input border border-border focus:border-primary focus:outline-none text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={[
              "inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs uppercase tracking-wider transition",
              showFilters || hasFilters
                ? "bg-primary/15 border-primary/60 text-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            <Filter className="h-3.5 w-3.5" />
            Filtros{hasFilters ? ` (${[search, fromDate || toDate, minBudget || maxBudget].filter(Boolean).length})` : ""}
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-destructive hover:border-destructive/50"
            >
              <X className="h-3.5 w-3.5" /> Limpar
            </button>
          )}
        </div>

        {showFilters && (
          <div className="glass-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Data início desde</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:border-primary focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Data fim até</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:border-primary focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Orçamento mín. (€)</span>
              <input type="number" min="0" step="1" value={minBudget} onChange={(e) => setMinBudget(e.target.value)}
                placeholder="0"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:border-primary focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Orçamento máx. (€)</span>
              <input type="number" min="0" step="1" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)}
                placeholder="∞"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:border-primary focus:outline-none" />
            </label>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">A carregar...</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Plane} label="Sem viagens nesta categoria." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => {
            const c = classify(t);
            const badge = c === "upcoming" ? "Futura" : c === "ongoing" ? "Em curso" : "Concluída";
            const badgeCls = c === "ongoing"
              ? "bg-primary text-primary-foreground border-primary shadow-glow"
              : c === "upcoming"
                ? "bg-primary/15 text-primary border-primary/40"
                : "bg-muted text-muted-foreground border-border";
            return (
              <a key={t.id} href={`/viagens/${t.id}`}
                className="glass-card glass-card-hover p-5 flex flex-col gap-3 group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
                <header className="flex items-start justify-between gap-2 relative">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-lg leading-tight flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{t.name || t.destination}</span>
                    </h3>
                    {t.destination && <p className="text-xs text-muted-foreground truncate">{t.destination}</p>}
                  </div>
                  <span className={["text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border", badgeCls].join(" ")}>{badge}</span>
                </header>
                <div className="space-y-1.5 text-xs text-muted-foreground relative">
                  {t.start_date && (
                    <div className="flex items-center gap-1.5">
                      <CalIcon className="h-3.5 w-3.5" />
                      {format(parseISO(t.start_date), "d MMM yyyy", { locale: pt })}
                      {t.end_date && t.end_date !== t.start_date && <> – {format(parseISO(t.end_date), "d MMM yyyy", { locale: pt })}</>}
                    </div>
                  )}
                  {t.budget != null && (
                    <div className="flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5" />
                      {t.budget.toLocaleString("pt-PT", { style: "currency", currency: t.currency ?? "EUR" })}
                    </div>
                  )}
                </div>
                {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
                <div className="flex justify-between gap-2 opacity-0 group-hover:opacity-100 transition-opacity relative text-xs">
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(t); setOpen(true); }}
                    className="px-3 py-1.5 rounded-md bg-accent/20 hover:bg-accent text-muted-foreground hover:text-primary">Editar</button>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(t.id); }}
                    className="px-3 py-1.5 rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive">Eliminar</button>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {open && (
        <TripDialog initial={editing} onClose={() => setOpen(false)} onSave={handleSave} error={saveError} />
      )}
    </div>
  );
}
