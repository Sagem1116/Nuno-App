import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

type ChatBody = { messages?: UIMessage[]; tripId?: string };

const TRAVEL_SYSTEM_PROMPT = `És um assistente especializado em viagens para o Nuno App.
Tens acesso aos dados completos da viagem actual: itinerário, reservas, documentos, despesas e notas.
Tua especialidade é:
- Responder a perguntas sobre a viagem (ex: "O que tenho amanhã?", "Qual é o próximo voo?")
- Calcular despesas e orçamentos
- Sugerir otimizações (ex: reorganizar dias, sugerir poupanças)
- Detectar conflitos de horários
- Criar resumos automáticos da viagem
- Organizar informações de viagem

Responde sempre em Português de Portugal, de forma clara, concisa e prática.
Usa markdown (listas, negrito, headings) para organizar respostas.
Se a pergunta exigir dados que não tens, di-lo abertamente.
Sê proactivo em sugerir melhorias baseadas nos dados da viagem.`;

function fmt(label: string, items: any[], render: (i: any) => string) {
  if (!items?.length) return "";
  return `\n\n## ${label} (${items.length})\n` + items.map(render).join("\n");
}

async function buildTravelContext(supabase: any, tripId: string) {
  const [trip, days, itinerary, reservations, expenses] = await Promise.all([
    supabase.from("trips").select("*").eq("id", tripId).single(),
    supabase.from("trip_days").select("*").eq("trip_id", tripId).order("day_order", { ascending: true }),
    supabase.from("trip_itinerary_items").select("*").eq("trip_id", tripId).order("scheduled_at", { ascending: true }),
    supabase.from("reservations").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
    supabase.from("transactions").select("*").eq("trip_id", tripId).order("occurred_at", { ascending: false }),
  ]);

  const truncate = (s: string | null | undefined, n = 300) => (s ?? "").slice(0, n);

  const context = [
    `## VIAGEM: ${trip.data?.destination || "Destino"}`,
    trip.data ? `- **Período**: ${trip.data.start_date} → ${trip.data.end_date}` : "",
    trip.data?.budget ? `- **Orçamento**: ${trip.data.budget}${trip.data.currency || "EUR"}` : "",
    trip.data?.status ? `- **Estado**: ${trip.data.status}` : "",
    trip.data?.description ? `- **Notas**: ${truncate(trip.data.description)}` : "",
  ].filter(Boolean).join("\n");

  return [
    context,
    fmt("Dias da Viagem", days.data ?? [], (d) =>
      `- **Dia ${d.day_order + 1}**: ${d.day_date} — ${d.title}${d.notes ? " — " + truncate(d.notes) : ""}`),
    fmt("Itinerário Completo", itinerary.data ?? [], (i) =>
      `- **${i.title}** (${i.item_type})${i.scheduled_at ? ` às ${new Date(i.scheduled_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}` : ""}${i.location ? ` em ${i.location}` : ""}${i.amount ? ` — ${i.amount}${i.currency}` : ""}${i.description ? " — " + truncate(i.description, 100) : ""}`),
    fmt("Reservas", reservations.data ?? [], (r) =>
      `- **${r.title}** (${r.reservation_type})${r.confirmation_number ? ` — Conf: ${r.confirmation_number}` : ""} [${r.status}]${r.notes ? " — " + truncate(r.notes, 100) : ""}`),
    fmt("Despesas Registadas", expenses.data ?? [], (e) =>
      `- ${e.occurred_at?.slice(0, 10)} — ${e.amount}${e.currency || "EUR"} (${e.category})${e.description ? " — " + truncate(e.description, 100) : ""}`),
  ].filter(Boolean).join("");
}

export const Route = createFileRoute("/api/chat-travel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Supabase não configurado", { status: 500 });
        }
        if (!LOVABLE_API_KEY) {
          return new Response("LOVABLE_API_KEY em falta", { status: 500 });
        }

        const authHeader = request.headers.get("authorization");
        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as ChatBody;
        if (!Array.isArray(body.messages) || !body.tripId) {
          return new Response("Bad request", { status: 400 });
        }

        // Verify trip belongs to user
        const { data: trip } = await (supabase as any)
          .from("trips").select("id").eq("id", body.tripId).eq("user_id", userData.user.id).maybeSingle();
        if (!trip) return new Response("Trip not found", { status: 404 });

        // Build travel context
        const travelContext = await buildTravelContext(supabase, body.tripId);

        // Build system prompt with travel context
        const systemPrompt = `${TRAVEL_SYSTEM_PROMPT}\n\n${travelContext}`;

        // Create AI provider
        const provider = createLovableAiGatewayProvider(LOVABLE_API_KEY);

        // Stream response
        const result = streamText({
          model: provider("google/gemini-3-flash-preview"),
          system: systemPrompt,
          messages: await convertToModelMessages(body.messages),
          onError: ({ error }) => {
            console.error("[Travel AI] streamText error", error);
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages,
        });
      },
    },
  },
});
