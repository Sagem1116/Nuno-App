import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { generateText } from "ai";

type ExtractInput = {
  base64: string;
  mimeType: string;
  documentType: "image" | "pdf";
};

const SYSTEM = `Extrai dados estruturados de um documento de reserva (voo, hotel, transporte ou outro).
Devolve APENAS JSON válido (sem markdown, sem texto extra) com o seguinte formato:
{
  "type": "flight" | "hotel" | "transport" | "other",
  "confidence": number entre 0 e 1,
  "data": {
    "flightNumber"?: string,
    "airline"?: string,
    "departure"?: { "airport"?: string, "city"?: string, "time"?: string, "date"?: string },
    "arrival"?: { "airport"?: string, "city"?: string, "time"?: string, "date"?: string },
    "confirmationCode"?: string,
    "hotelName"?: string,
    "checkIn"?: string,
    "checkOut"?: string,
    "roomType"?: string,
    "company"?: string,
    "vehicleType"?: string,
    "pickupLocation"?: string,
    "dropoffLocation"?: string,
    "rawText"?: string
  }
}`;

export const extractReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ExtractInput) => {
    if (!data?.base64) throw new Error("Missing base64");
    if (!data?.mimeType) throw new Error("Missing mimeType");
    return data;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");

    const provider = createLovableAiGatewayProvider(apiKey);
    const model = provider("google/gemini-2.5-flash");

    const dataUrl = `data:${data.mimeType};base64,${data.base64}`;

    try {
      const { text } = await generateText({
        model,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Extrai os dados desta reserva e devolve só o JSON pedido." },
              { type: "image", image: dataUrl },
            ],
          },
        ],
      });

      const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
      let parsed: { type: string; confidence: number; data: Record<string, any> };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return { type: "other" as const, confidence: 0, data: { rawText: text.slice(0, 4000) } };
      }
      return parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha na extração";
      throw new Error(msg);
    }
  });
