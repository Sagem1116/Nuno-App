import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, FileUp, AlertCircle, Loader } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { inputCls } from "./_app.notas";
import { extractReservation } from "@/lib/reservations.functions";

export const Route = createFileRoute("/_app/reservas/")({
  component: ReservasPage,
});

interface Reservation {
  id: string;
  trip_id: string | null;
  user_id: string;
  reservation_type: "flight" | "hotel" | "transport" | "other";
  title: string;
  confirmation_number: string | null;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  extracted_data: any;
  extraction_confidence: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

const typeLabels = {
  flight: "✈️ Voo",
  hotel: "🏨 Hotel",
  transport: "🚗 Transporte",
  other: "📄 Outro",
};

const statusLabels = {
  pending: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
};

function ReservasPage() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"flight" | "hotel" | "transport" | "other">("flight");
  const [confirmation, setConfirmation] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const extract = useServerFn(extractReservation);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error: err } = await (supabase as any)
        .from("reservations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (err) throw err;
      setReservations(data || []);
    } catch (err) {
      console.error("Erro ao carregar reservas:", err);
      setError("Erro ao carregar reservas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const processDocument = async (file: File): Promise<any> => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
    const documentType: "image" | "pdf" = file.type.startsWith("image") ? "image" : "pdf";
    return await extract({ data: { base64, mimeType: file.type || "application/octet-stream", documentType } });
  };

  const addReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) {
      setError("Por favor preencha todos os campos obrigatórios");
      return;
    }

    try {
      setError(null);
      setUploading(true);

      let extractedData = null;
      let extractionConfidence = null;

      // Process document if uploaded
      if (uploadFile) {
        const processed = await processDocument(uploadFile);
        extractedData = processed?.data || null;
        extractionConfidence = processed?.confidence || null;
      }

      const { data, error: err } = await (supabase as any)
        .from("reservations")
        .insert({
          user_id: user.id,
          reservation_type: type,
          title: title.trim(),
          confirmation_number: confirmation.trim() || null,
          notes: notes.trim(),
          status: "pending",
          extracted_data: extractedData,
          extraction_confidence: extractionConfidence,
        })
        .select()
        .single();

      if (err) throw err;

      if (data) {
        setReservations((prev) => [data, ...prev]);
        setTitle("");
        setConfirmation("");
        setNotes("");
        setUploadFile(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar reserva");
    } finally {
      setUploading(false);
    }
  };

  const deleteReservation = async (id: string) => {
    if (!user) return;
    try {
      const { error: err } = await (supabase as any)
        .from("reservations")
        .delete()
        .eq("id", id);

      if (err) throw err;
      setReservations((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao eliminar reserva");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Reservas</h1>
      </div>

      {error && (
        <div className="glass-card border-l-4 border-red-500 bg-red-500/10 p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <div className="text-sm text-red-900">{error}</div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold">Adicionar Nova Reserva</h2>
            <form onSubmit={addReservation} className="space-y-3">
              <select value={type} onChange={(e) => setType(e.target.value as any)} className={inputCls}>
                <option value="flight">✈️ Voo</option>
                <option value="hotel">🏨 Hotel</option>
                <option value="transport">🚗 Transporte</option>
                <option value="other">📄 Outro</option>
              </select>

              <input
                type="text"
                placeholder="Título da reserva (ex: Voo Lisbon-Paris)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
              />

              <input
                type="text"
                placeholder="Número de confirmação (opcional)"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className={inputCls}
              />

              <textarea
                placeholder="Notas adicionais"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={inputCls + " resize-none"}
              />

              <div className="border-2 border-dashed border-border rounded-lg p-4 hover:border-primary transition-colors cursor-pointer">
                <label className="flex flex-col items-center gap-2 cursor-pointer">
                  <FileUp className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {uploadFile ? uploadFile.name : "Clique para selecionar ficheiro"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={uploading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:shadow-glow disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Criar Reserva
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold">Histórico de Reservas</h2>
            {loading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : reservations.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma reserva registada.</p>
            ) : (
              <div className="space-y-3">
                {reservations.map((res) => (
                  <div
                    key={res.id}
                    className="glass-card border border-border p-4 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl">{typeLabels[res.reservation_type]}</span>
                          <h3 className="font-semibold">{res.title}</h3>
                          <span className="text-xs px-2 py-1 rounded bg-primary/20 text-primary">
                            {statusLabels[res.status]}
                          </span>
                        </div>
                        {res.confirmation_number && (
                          <p className="text-sm text-muted-foreground">
                            Confirmação: <span className="font-mono">{res.confirmation_number}</span>
                          </p>
                        )}
                        {res.notes && (
                          <p className="text-sm text-muted-foreground mt-1">{res.notes}</p>
                        )}
                        {res.extraction_confidence && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Confiança de extração: {Math.round(res.extraction_confidence * 100)}%
                          </p>
                        )}
                        {res.extracted_data && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <p className="font-mono bg-black/20 p-2 rounded max-h-24 overflow-auto">
                              {JSON.stringify(res.extracted_data, null, 2)}
                            </p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteReservation(res.id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="glass-card p-6 space-y-4 h-fit">
          <h2 className="text-lg font-semibold">Instruções</h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span>📋</span>
              <span>Selecione o tipo de reserva (voo, hotel, transporte)</span>
            </li>
            <li className="flex gap-2">
              <span>📄</span>
              <span>Adicione documentos (PDF, imagens)</span>
            </li>
            <li className="flex gap-2">
              <span>🤖</span>
              <span>O OCR vai extrair automaticamente os dados</span>
            </li>
            <li className="flex gap-2">
              <span>✏️</span>
              <span>Edite os dados se necessário</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
