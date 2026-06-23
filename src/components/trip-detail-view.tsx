import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, Plus, X, Trash2, MapPin, Calendar as CalIcon, Wallet,
  ListChecks, Link2, Lightbulb, ExternalLink, Pencil, Map, Activity,
  Coffee, Truck, FileText, Plane, Globe, Download,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { inputCls } from "@/routes/_app.notas";
import { BUCKET, getSignedUrl } from "@/lib/drive";

import { TripDialog, type Trip } from "@/routes/_app.viagens";
import { TravelAssistant } from "@/components/travel-assistant";
import { ShareTripButton } from "@/components/share-trip-button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type TripDialogData = Parameters<Parameters<typeof TripDialog>[0]["onSave"]>[0];

export interface TripDetailViewProps {
  tripId: string;
  effectiveUserId: string;
  isPublic: boolean;
  backHref: string;
}

type Kind = "checklist" | "link" | "idea" | "place" | "activity";
interface TripItem {
  id: string;
  trip_id: string;
  kind: Kind;
  label: string;
  url: string | null;
  price: number | null;
  done: boolean;
  created_at: string;
}

type ItineraryView = "timeline" | "calendar" | "list";
type DetailTab = "overview" | "itinerary" | "reservations" | "documents" | "expenses" | "map" | "ai";
type PlanItemType = "activity" | "restaurant" | "transport" | "flight" | "note";

interface TripDay {
  id: string;
  trip_id: string;
  user_id: string;
  day_order: number;
  day_date: string | null;
  title: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface TripItineraryItem {
  id: string;
  trip_id: string;
  day_id: string;
  user_id: string;
  item_type: PlanItemType;
  title: string;
  description: string;
  scheduled_at: string | null;
  location: string;
  notes: string;
  order_index: number;
  amount: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

interface FileMetadata {
  id: string;
  user_id: string;
  path: string;
  original_name: string;
  folder: string;
  project: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface TripItemAttachment {
  id: string;
  trip_id: string;
  day_id: string;
  item_id: string;
  user_id: string;
  file_metadata_id: string;
  created_at: string;
  updated_at: string;
  file_metadata: FileMetadata | null;
}

export function TripDetailView({ tripId, effectiveUserId, isPublic, backHref }: TripDetailViewProps) {
  const navigate = useNavigate();
  const userId = effectiveUserId;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<TripItem[]>([]);
  const [days, setDays] = useState<TripDay[]>([]);
  const [planItems, setPlanItems] = useState<TripItineraryItem[]>([]);
  const [attachments, setAttachments] = useState<TripItemAttachment[]>([]);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [viewMode, setViewMode] = useState<ItineraryView>("timeline");
  const [newDayTitle, setNewDayTitle] = useState("");
  const [newDayDate, setNewDayDate] = useState("");
  const [newItemType, setNewItemType] = useState<PlanItemType>("activity");
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemTime, setNewItemTime] = useState("");
  const [newItemLocation, setNewItemLocation] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemNotes, setNewItemNotes] = useState("");
  const [newItemAmount, setNewItemAmount] = useState("");
  const [newItemCurrency, setNewItemCurrency] = useState("EUR");
  const [fileSelection, setFileSelection] = useState("");
  const [selectedAttachmentItemId, setSelectedAttachmentItemId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: i }, { data: d }, { data: p }, { data: a }, { data: f }] = await Promise.all([
      (supabase as any).from("trips").select("*").eq("id", tripId).single(),
      (supabase as any).from("trip_items").select("*").eq("trip_id", tripId).order("created_at", { ascending: true }),
      (supabase as any).from("trip_days").select("*").eq("trip_id", tripId).order("day_order", { ascending: true }),
      (supabase as any).from("trip_itinerary_items").select("*").eq("trip_id", tripId).order("day_id", { ascending: true }).order("order_index", { ascending: true }),
      (supabase as any).from("trip_item_attachments").select("*, file_metadata(*)").eq("trip_id", tripId),
      isPublic
        ? (supabase as any).from("file_metadata").select("*").eq("folder", `trips/${tripId}`).order("created_at", { ascending: false }).limit(100)
        : (supabase as any).from("file_metadata").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);

    setTrip(t as Trip);
    setItems((i as TripItem[]) ?? []);
    setDays((d as TripDay[]) ?? []);
    setPlanItems((p as TripItineraryItem[]) ?? []);
    setAttachments((a as TripItemAttachment[]) ?? []);
    setFiles((f as FileMetadata[]) ?? []);
    if (!selectedDayId && (d as TripDay[])?.length) setSelectedDayId((d as TripDay[])[0]?.id ?? null);
    setLoading(false);
  };

  useEffect(() => {
    if (tripId && userId) load();
  }, [tripId, userId]);

  const addItem = async (kind: Kind, label: string, url?: string, price?: number) => {
    if (!label.trim()) return;
    const { data } = await (supabase as any).from("trip_items").insert({
      trip_id: tripId, user_id: userId, kind, label: label.trim(),
      url: url?.trim() || null, price: price && price > 0 ? price : null, done: false,
    }).select().single();
    if (data) setItems((p) => [...p, data as TripItem]);
  };

  const toggleItem = async (it: TripItem) => {
    setItems((p) => p.map((x) => x.id === it.id ? { ...x, done: !x.done } : x));
    await (supabase as any).from("trip_items").update({ done: !it.done }).eq("id", it.id);
  };

  const removeItem = async (id: string) => {
    setItems((p) => p.filter((x) => x.id !== id));
    await (supabase as any).from("trip_items").delete().eq("id", id);
  };

  const addDay = async () => {
    if (!newDayTitle.trim()) return;
    const order = days.length > 0 ? Math.max(...days.map((d) => d.day_order)) + 1 : 0;
    const { data } = await (supabase as any).from("trip_days").insert({
      trip_id: tripId, user_id: userId, title: newDayTitle.trim(), day_date: newDayDate || null, day_order: order,
    }).select().single();
    if (data) {
      setDays((prev) => [...prev, data as TripDay].sort((a, b) => a.day_order - b.day_order));
      setNewDayTitle("");
      setNewDayDate("");
      setSelectedDayId((data as TripDay).id);
    }
  };

  const addPlanItem = async () => {
    if (!selectedDayId || !newItemTitle.trim()) return;
    const dayItems = planItems.filter((item) => item.day_id === selectedDayId);
    const order = dayItems.length > 0 ? Math.max(...dayItems.map((item) => item.order_index)) + 1 : 0;
    
    let scheduledAt: string | null = null;
    if (newItemTime) {
      const selectedDay = days.find((d) => d.id === selectedDayId);
      if (selectedDay?.day_date) {
        try {
          const dateStr = `${selectedDay.day_date}T${newItemTime}:00`;
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            scheduledAt = date.toISOString();
          }
        } catch (err) {
          console.error("Erro ao processar tempo:", err);
        }
      }
    }
    
    const { data, error } = await (supabase as any).from("trip_itinerary_items").insert({
      trip_id: tripId,
      day_id: selectedDayId,
      user_id: userId,
      item_type: newItemType,
      title: newItemTitle.trim(),
      description: newItemDescription.trim(),
      scheduled_at: scheduledAt,
      location: newItemLocation.trim(),
      notes: newItemNotes.trim(),
      order_index: order,
      amount: newItemAmount ? Number(newItemAmount) : null,
      currency: newItemCurrency,
    }).select().single();
    
    if (error) {
      console.error("Erro ao adicionar item:", error);
      return;
    }
    
    if (data) {
      setPlanItems((prev) => [...prev, data as TripItineraryItem].sort((a, b) => a.day_id.localeCompare(b.day_id) || a.order_index - b.order_index));
      setNewItemTitle("");
      setNewItemLocation("");
      setNewItemNotes("");
      setNewItemDescription("");
      setNewItemAmount("");
      setNewItemTime("");
    }
  };

  const reorderPlanItems = async (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId) return;
    const source = planItems.find((item) => item.id === sourceId);
    const target = planItems.find((item) => item.id === targetId);
    if (!source || !target || source.id === target.id || source.day_id !== target.day_id) return;
    const sourceOrder = source.order_index;
    const targetOrder = target.order_index;
    setPlanItems((prev) => prev.map((item) => {
      if (item.id === source.id) return { ...item, order_index: targetOrder };
      if (item.id === target.id) return { ...item, order_index: sourceOrder };
      return item;
    }).sort((a, b) => a.day_id.localeCompare(b.day_id) || a.order_index - b.order_index));
    await (supabase as any).from("trip_itinerary_items").update({ order_index: targetOrder }).eq("id", source.id);
    await (supabase as any).from("trip_itinerary_items").update({ order_index: sourceOrder }).eq("id", target.id);
  };

  const attachFile = async () => {
    if (!fileSelection || !selectedAttachmentItemId) return;
    const file = files.find((file) => file.id === fileSelection);
    const item = planItems.find((item) => item.id === selectedAttachmentItemId);
    if (!file || !item) return;
    const { data } = await (supabase as any).from("trip_item_attachments").insert({
      trip_id: tripId,
      day_id: item.day_id,
      item_id: item.id,
      user_id: userId,
      file_metadata_id: file.id,
    }).select().single();
    if (data) setAttachments((prev) => [...prev, data as TripItemAttachment]);
    setFileSelection("");
  };

  const docInputRef = useRef<HTMLInputElement | null>(null);

  const uploadDocuments = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const newMetas: FileMetadata[] = [];
    for (const file of Array.from(fileList)) {
      try {
        const id = crypto.randomUUID();
        const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
        const path = `${userId}/trips/${tripId}/${id}${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || undefined, upsert: false,
        });
        if (upErr) throw upErr;
        const { data: meta, error: mErr } = await (supabase as any).from("file_metadata").insert({
          user_id: userId, path, original_name: file.name, folder: `trips/${tripId}`, project: "viagens", tags: [],
        }).select().single();
        if (mErr) throw mErr;
        newMetas.push(meta as FileMetadata);

        const targetItem = planItems.find((p) => p.id === selectedAttachmentItemId);
        if (targetItem) {
          const { data: att } = await (supabase as any).from("trip_item_attachments").insert({
            trip_id: tripId, day_id: targetItem.day_id, item_id: targetItem.id,
            user_id: userId, file_metadata_id: (meta as FileMetadata).id,
          }).select("*, file_metadata(*)").single();
          if (att) setAttachments((prev) => [...prev, att as TripItemAttachment]);
        }
      } catch (e) {
        console.error("upload failed", e);
      }
    }
    if (newMetas.length) setFiles((prev) => [...newMetas, ...prev]);
  };

  const downloadAttachment = async (att: TripItemAttachment) => {
    const path = att.file_metadata?.path;
    if (!path) return;
    try {
      const url = await getSignedUrl(path, 120);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.file_metadata?.original_name || "ficheiro";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e);
    }
  };

  const removeAttachment = async (att: TripItemAttachment) => {
    if (!confirm("Remover documento da viagem?")) return;
    await (supabase as any).from("trip_item_attachments").delete().eq("id", att.id);
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
  };

  const totalExpense = useMemo(() => planItems.reduce((sum, item) => sum + (item.amount || 0), 0), [planItems]);
  const reservationItems = useMemo(() => planItems.filter((item) => item.item_type === "transport" || item.item_type === "flight"), [planItems]);
  const itemsByDay = useMemo(() => {
    return planItems.reduce<Record<string, TripItineraryItem[]>>((acc, item) => {
      acc[item.day_id] = [...(acc[item.day_id] || []), item].sort((a, b) => a.order_index - b.order_index);
      return acc;
    }, {});
  }, [planItems]);
  const attachmentsByItem = useMemo(() => {
    return attachments.reduce<Record<string, TripItemAttachment[]>>((acc, attachment) => {
      if (!attachment.item_id) return acc;
      acc[attachment.item_id] = [...(acc[attachment.item_id] || []), attachment];
      return acc;
    }, {});
  }, [attachments]);

  useEffect(() => {
    if (!selectedAttachmentItemId && planItems.length > 0) {
      setSelectedAttachmentItemId(planItems[0].id);
    }
  }, [planItems, selectedAttachmentItemId]);

  if (loading) return <div className="text-muted-foreground text-sm">A carregar...</div>;
  if (!trip) return (
    <div className="space-y-3">
      <p className="text-muted-foreground">Viagem não encontrada.</p>
      <button onClick={() => navigate({ to: isPublic ? "/" : backHref })} className="text-primary hover:underline text-sm">Voltar</button>
    </div>
  );

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between gap-4">
        {isPublic ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="h-3.5 w-3.5 text-primary" /> Viagem partilhada
          </span>
        ) : (
          <Link to={backHref} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" /> Viagens
          </Link>
        )}
        <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Travel Planner{isPublic && " · Edição pública"}</span>
      </div>

      <header className="glass-card neon-border p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" />
              <span className="neon-text">{trip.name || trip.destination}</span>
            </h1>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
              {trip.destination && (
                <span className="flex items-center gap-1.5"><Globe className="h-4 w-4" /> {trip.destination}</span>
              )}
              {trip.start_date && (
                <span className="flex items-center gap-1.5"><CalIcon className="h-4 w-4" /> {format(parseISO(trip.start_date), "d MMM yyyy", { locale: pt })}{trip.end_date && trip.end_date !== trip.start_date && <> – {format(parseISO(trip.end_date), "d MMM yyyy", { locale: pt })}</>}</span>
              )}
              {trip.budget != null && (
                <span className="flex items-center gap-1.5"><Wallet className="h-4 w-4" /> {trip.budget.toLocaleString("pt-PT", { style: "currency", currency: trip.currency ?? "EUR" })}</span>
              )}
            </div>
            {trip.description && <p className="mt-3 text-sm text-muted-foreground max-w-3xl">{trip.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isPublic && (
              <ShareTripButton
                tripId={trip.id}
                initialSlug={(trip as any).public_slug ?? null}
                initialPublic={!!(trip as any).is_public}
                onChange={({ slug, isPublic: pub }) =>
                  setTrip((currentTrip) => (currentTrip ? ({ ...currentTrip, public_slug: slug, is_public: pub } as any) : currentTrip))
                }
              />
            )}
            <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary hover:text-primary">
              <Pencil className="h-3.5 w-3.5" /> Editar viagem
            </button>
          </div>
        </div>
      </header>

      <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as DetailTab)}>
        <TabsList className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(([
            ["overview", "Overview"],
            ["itinerary", "Itinerário"],
            ["reservations", "Reservas"],
            ["documents", "Documentos"],
            ["expenses", "Despesas"],
            ["map", "Mapa"],
            ["ai", "AI Assistant"],
          ] as const).filter(([v]) => !isPublic || v !== "ai")).map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="text-[11px] uppercase tracking-[0.2em]">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
            <div className="space-y-4">
              <div className="glass-card p-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Resumo de viagem</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <StatCard icon={<CalIcon className="h-4 w-4" />} title="Dias" value={days.length.toString()} />
                  <StatCard icon={<Map className="h-4 w-4" />} title="Itens" value={planItems.length.toString()} />
                  <StatCard icon={<Wallet className="h-4 w-4" />} title="Despesa" value={totalExpense.toLocaleString("pt-PT", { style: "currency", currency: trip.currency ?? "EUR" })} />
                </div>
              </div>
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Detalhes</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailField label="Nome" value={trip.name || "-"} />
                  <DetailField label="Estado" value={trip.status || "Planejada"} />
                  <DetailField label="Destino secundário" value={trip.secondary_destinations?.join(", ") || "-"} />
                  <DetailField label="Moeda" value={trip.currency || "EUR"} />
                </div>
              </div>
            </div>
            <div className="glass-card p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Itens rápidos</h3>
              <div className="space-y-3">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem itens rápidos registrados.</p>
                ) : items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-3 p-3 bg-card/70 border border-border rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{it.label}</p>
                      <p className="text-xs text-muted-foreground">{it.kind}</p>
                    </div>
                    <button onClick={() => removeItem(it.id)} className="text-destructive opacity-80 hover:opacity-100 text-xs">Remover</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="itinerary">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="glass-card p-4 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Dias da viagem</h3>
                    <p className="text-xs text-muted-foreground">Adicione etapas e organize os dias da sua viagem.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ItineraryView)} className={inputCls}>
                      <option value="timeline">Timeline</option>
                      <option value="calendar">Calendário</option>
                      <option value="list">Lista</option>
                    </select>
                    <button onClick={addDay} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:shadow-glow">
                      <Plus className="h-4 w-4" /> Adicionar dia
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={newDayTitle} onChange={(e) => setNewDayTitle(e.target.value)} placeholder="Título do dia" className={inputCls} />
                  <input type="date" value={newDayDate} onChange={(e) => setNewDayDate(e.target.value)} className={inputCls} />
                </div>
              </div>

              {days.length === 0 ? (
                <div className="glass-card p-6 text-center text-sm text-muted-foreground">Comece por adicionar um dia para a sua viagem.</div>
              ) : (
                <div className="space-y-4">
                  {viewMode === "calendar" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {days.map((day) => (
                        <div key={day.id} className="glass-card p-4 border-border">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <h4 className="font-semibold">{day.title || `Dia ${day.day_order + 1}`}</h4>
                              <p className="text-xs text-muted-foreground">{day.day_date ? format(parseISO(day.day_date), "d MMM yyyy", { locale: pt }) : "Sem data definida"}</p>
                            </div>
                            <button onClick={() => setSelectedDayId(day.id)} className={["rounded-full px-3 py-1 text-xs transition", selectedDayId === day.id ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-primary/10"].join(" ")}>
                              Selecionar
                            </button>
                          </div>
                          <div className="mt-4 space-y-3">
                            {(itemsByDay[day.id] ?? []).slice(0, 4).map((item) => (
                              <div key={item.id} className="rounded-lg border border-border p-3 bg-background/80">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2 text-sm">
                                    {renderItemIcon(item.item_type)}
                                    <div>
                                      <p className="font-medium">{item.title}</p>
                                      <p className="text-[11px] text-muted-foreground">{item.location || "Sem localização"}</p>
                                    </div>
                                  </div>
                                  <span className="text-[11px] text-muted-foreground">{item.scheduled_at ? format(parseISO(item.scheduled_at), "HH:mm") : "Sem horário"}</span>
                                </div>
                                <p className="mt-2 text-[11px] text-muted-foreground">{attachmentsByItem[item.id]?.length ?? 0} documentos anexados</p>
                              </div>
                            ))}
                            {(itemsByDay[day.id] ?? []).length > 4 && <p className="text-xs text-muted-foreground">...e mais {(itemsByDay[day.id] ?? []).length - 4} itens</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : viewMode === "list" ? (
                    <div className="space-y-3">
                      {planItems.map((item) => (
                        <div key={item.id} className="glass-card p-4 border-border">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{item.title}</p>
                              <p className="text-xs text-muted-foreground">{days.find((day) => day.id === item.day_id)?.title || "Dia sem título"} • {item.item_type}</p>
                            </div>
                            <span className="text-[11px] text-muted-foreground">{item.scheduled_at ? format(parseISO(item.scheduled_at), "HH:mm") : "Sem horário"}</span>
                          </div>
                          {item.description && <p className="mt-2 text-xs text-muted-foreground">{item.description}</p>}
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                            <span>{item.location || "Local não definido"}</span>
                            <span>{item.amount != null ? item.amount.toLocaleString("pt-PT", { style: "currency", currency: item.currency }) : "Sem custo"}</span>
                            <span>{attachmentsByItem[item.id]?.length ?? 0} documento(s)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {days.map((day) => (
                        <div key={day.id} className="glass-card p-4 border-border">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <h4 className="font-semibold">{day.title || `Dia ${day.day_order + 1}`}</h4>
                              <p className="text-xs text-muted-foreground">{day.day_date ? format(parseISO(day.day_date), "d MMM yyyy", { locale: pt }) : "Sem data definida"}</p>
                            </div>
                            <button onClick={() => setSelectedDayId(day.id)} className={["rounded-full px-3 py-1 text-xs transition", selectedDayId === day.id ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-primary/10"].join(" ")}>
                              Selecionar
                            </button>
                          </div>
                          <div className="mt-4 space-y-2">
                            {(itemsByDay[day.id] ?? []).map((item) => (
                              <div key={item.id}
                                draggable
                                onDragStart={() => setDraggingId(item.id)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => { if (draggingId) reorderPlanItems(draggingId, item.id); setDraggingId(null); }}
                                className="rounded-lg border border-border p-3 bg-background/80 hover:border-primary transition">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-2 text-sm">
                                    {renderItemIcon(item.item_type)}
                                    <div>
                                      <p className="font-medium">{item.title}</p>
                                      <p className="text-[11px] text-muted-foreground">{item.location || "Sem localização"}</p>
                                    </div>
                                  </div>
                                  <span className="text-[11px] text-muted-foreground">{item.scheduled_at ? format(parseISO(item.scheduled_at), "HH:mm") : "Sem horário"}</span>
                                </div>
                                {item.description && <p className="mt-2 text-xs text-muted-foreground">{item.description}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="glass-card p-4 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Adicionar item</h3>
                <div className="grid gap-3">
                  <select value={newItemType} onChange={(e) => setNewItemType(e.target.value as PlanItemType)} className={inputCls}>
                    <option value="activity">Atividade</option>
                    <option value="restaurant">Restaurante</option>
                    <option value="transport">Transporte</option>
                    <option value="flight">Voo</option>
                    <option value="note">Nota</option>
                  </select>
                  <select value={selectedDayId ?? ""} onChange={(e) => setSelectedDayId(e.target.value)} className={inputCls}>
                    <option value="">Selecionar dia</option>
                    {days.map((day) => (
                      <option key={day.id} value={day.id}>{day.title || `Dia ${day.day_order + 1}`}</option>
                    ))}
                  </select>
                  <input value={newItemTitle} onChange={(e) => setNewItemTitle(e.target.value)} placeholder="Título" className={inputCls} />
                  <input type="time" value={newItemTime} onChange={(e) => setNewItemTime(e.target.value)} className={inputCls} />
                  <input value={newItemLocation} onChange={(e) => setNewItemLocation(e.target.value)} placeholder="Localização" className={inputCls} />
                  <textarea value={newItemDescription} onChange={(e) => setNewItemDescription(e.target.value)} placeholder="Descrição" rows={3} className={inputCls + " resize-none"} />
                  <textarea value={newItemNotes} onChange={(e) => setNewItemNotes(e.target.value)} placeholder="Notas" rows={3} className={inputCls + " resize-none"} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input type="number" min="0" step="0.01" value={newItemAmount} onChange={(e) => setNewItemAmount(e.target.value)} placeholder="Valor" className={inputCls} />
                    <select value={newItemCurrency} onChange={(e) => setNewItemCurrency(e.target.value)} className={inputCls}>
                      {[["EUR", "EUR"], ["USD", "USD"], ["GBP", "GBP"]].map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={addPlanItem} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:shadow-glow">
                    <Plus className="h-4 w-4" /> Adicionar item
                  </button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reservations">
          <div className="glass-card p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Reservas</h3>
            {reservationItems.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Ainda não há transportes ou voos registados.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {reservationItems.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border p-4 bg-background/70">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        {renderItemIcon(item.item_type)}
                        <div>
                          <p className="font-medium">{item.title}</p>
                          <p className="text-[11px] text-muted-foreground">{item.location || "Sem localização"}</p>
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{item.amount ? item.amount.toLocaleString("pt-PT", { style: "currency", currency: item.currency }) : "Sem custo"}</span>
                    </div>
                    {item.notes && <p className="mt-3 text-xs text-muted-foreground">{item.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <div className="glass-card p-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Documentos</h3>
                <p className="text-xs text-muted-foreground">Carregue ficheiros para a viagem ou anexe ficheiros existentes ao itinerário.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={selectedAttachmentItemId ?? ""} onChange={(e) => setSelectedAttachmentItemId(e.target.value || null)} className={inputCls}>
                  <option value="">(Opcional) Ligar a item do itinerário</option>
                  {planItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.title || `${item.item_type} ${item.id.slice(0, 6)}`}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    ref={docInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => { void uploadDocuments(e.target.files); e.currentTarget.value = ""; }}
                  />
                  <button
                    onClick={() => docInputRef.current?.click()}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow px-3 py-2 text-sm text-primary-foreground hover:shadow-glow"
                  >
                    Carregar ficheiro(s)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select value={fileSelection} onChange={(e) => setFileSelection(e.target.value)} className={inputCls + " flex-1"}>
                <option value="">Anexar ficheiro existente…</option>
                {files.map((file) => (
                  <option key={file.id} value={file.id}>{file.original_name || file.path}</option>
                ))}
              </select>
              <button onClick={attachFile} disabled={!fileSelection || !selectedAttachmentItemId}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-input border border-border px-3 py-2 text-sm hover:border-primary/50 disabled:opacity-50">
                Anexar ao item
              </button>
            </div>

            <div className="space-y-3">
              {attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum documento anexado ainda.</p>
              ) : attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 bg-background/80">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{attachment.file_metadata?.original_name || "Ficheiro ligado"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{attachment.file_metadata?.path}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => downloadAttachment(attachment)} className="text-primary text-xs hover:underline">Download</button>
                    <button onClick={() => removeAttachment(attachment)} className="text-destructive text-xs hover:underline">Remover</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="expenses">
          <div className="glass-card p-4 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Despesas</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_0.6fr]">
              <div className="rounded-lg border border-border p-4 bg-background/80">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total</p>
                <p className="mt-2 text-3xl font-semibold">{totalExpense.toLocaleString("pt-PT", { style: "currency", currency: trip.currency ?? "EUR" })}</p>
              </div>
              <div className="rounded-lg border border-border p-4 bg-background/80">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Itens com custo</p>
                <p className="mt-2 text-3xl font-semibold">{planItems.filter((item) => item.amount != null).length}</p>
              </div>
            </div>
            <div className="space-y-3">
              {planItems.filter((item) => item.amount != null).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma despesa registada ainda.</p>
              ) : planItems.filter((item) => item.amount != null).map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3 bg-background/80">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-sm">{item.title}</p>
                    <span className="text-xs text-muted-foreground">{item.amount?.toLocaleString("pt-PT", { style: "currency", currency: item.currency })}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{item.item_type} • {item.location || "Sem localização"}</p>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="map">
          <div className="glass-card p-6 text-center text-sm text-muted-foreground">
            Mapa será implementado em breve. Aqui ficará a visualização de destinos, transportes e pontos de interesse.
          </div>
        </TabsContent>

        <TabsContent value="ai" className="h-screen flex flex-col">
          <TravelAssistant tripId={tripId} />
        </TabsContent>
      </Tabs>

      {editOpen && (
        <TripDialog
          initial={trip}
          onClose={() => setEditOpen(false)}
          error={null}
          onSave={async (d: TripDialogData) => {
            await (supabase as any).from("trips").update(d).eq("id", tripId);
            setEditOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function renderItemIcon(type: PlanItemType) {
  switch (type) {
    case "activity": return <Activity className="h-4 w-4 text-primary" />;
    case "restaurant": return <Coffee className="h-4 w-4 text-primary" />;
    case "transport": return <Truck className="h-4 w-4 text-primary" />;
    case "flight": return <Plane className="h-4 w-4 text-primary" />;
    default: return <FileText className="h-4 w-4 text-primary" />;
  }
}

function StatCard({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/80 p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
          <p className="mt-1 text-xl font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/80 p-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm">{value}</p>
    </div>
  );
}
