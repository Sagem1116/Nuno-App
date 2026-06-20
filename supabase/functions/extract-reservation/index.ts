import "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface ExtractedReservation {
  type: "flight" | "hotel" | "transport" | "other";
  confidence: number;
  data: {
    flightNumber?: string;
    airline?: string;
    departure?: {
      airport?: string;
      city?: string;
      time?: string;
      date?: string;
    };
    arrival?: {
      airport?: string;
      city?: string;
      time?: string;
      date?: string;
    };
    confirmationCode?: string;
    hotelName?: string;
    checkIn?: string;
    checkOut?: string;
    roomType?: string;
    company?: string;
    vehicleType?: string;
    pickupLocation?: string;
    dropoffLocation?: string;
    rawText?: string;
  };
}

async function extractFromPDF(base64Data: string): Promise<string> {
  // For PDF text extraction, we'll use a simple approach
  // In production, you'd use pdf.js or similar
  return base64Data;
}

async function extractFromImage(base64Data: string): Promise<ExtractedReservation> {
  const googleVisionApiKey = Deno.env.get("GOOGLE_VISION_API_KEY");
  
  if (!googleVisionApiKey) {
    throw new Error("GOOGLE_VISION_API_KEY not configured");
  }

  try {
    const response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Data,
            },
            features: [
              {
                type: "TEXT_DETECTION",
              },
            ],
          },
        ],
      }),
    });

    const result = await response.json();
    const extractedText = result.responses[0]?.fullTextAnnotation?.text || "";

    // Parse extracted text for reservation data
    const extracted = parseReservationText(extractedText);
    
    return {
      type: extracted.type,
      confidence: extracted.confidence,
      data: {
        ...extracted.data,
        rawText: extractedText,
      },
    };
  } catch (error) {
    console.error("Error calling Google Vision API:", error);
    return {
      type: "other",
      confidence: 0,
      data: {
        rawText: "Failed to extract text",
      },
    };
  }
}

function parseReservationText(text: string): {
  type: "flight" | "hotel" | "transport" | "other";
  confidence: number;
  data: any;
} {
  const upperText = text.toUpperCase();
  let type: "flight" | "hotel" | "transport" | "other" = "other";
  let confidence = 0;
  let data: any = {};

  // Flight detection
  if (
    upperText.includes("FLIGHT") ||
    upperText.includes("AIRLINE") ||
    upperText.includes("BOARDING") ||
    upperText.includes("DEPARTURE") ||
    upperText.includes("ARRIVAL")
  ) {
    type = "flight";
    confidence = 0.8;

    // Extract flight details
    const flightMatch = text.match(/([A-Z]{2})\s*(\d{3,4})/);
    if (flightMatch) {
      data.airline = flightMatch[1];
      data.flightNumber = flightMatch[2];
    }

    // Extract airports
    const fromMatch = text.match(/FROM\s*:?\s*([A-Z]{3})/i);
    const toMatch = text.match(/TO\s*:?\s*([A-Z]{3})/i);
    if (fromMatch) data.departure = { airport: fromMatch[1] };
    if (toMatch) data.arrival = { airport: toMatch[1] };

    // Extract confirmation
    const confirmMatch = text.match(/CONF[A-Z]*\s*:?\s*([A-Z0-9]{6,})/i);
    if (confirmMatch) data.confirmationCode = confirmMatch[1];
  }

  // Hotel detection
  if (
    upperText.includes("HOTEL") ||
    upperText.includes("CHECK-IN") ||
    upperText.includes("CHECK-OUT") ||
    upperText.includes("ROOM")
  ) {
    type = "hotel";
    confidence = 0.8;

    // Extract hotel name
    const hotelMatch = text.match(/HOTEL\s*:?\s*([^\n]+)/i);
    if (hotelMatch) data.hotelName = hotelMatch[1].trim();

    // Extract dates
    const checkinMatch = text.match(/CHECK.?IN\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    const checkoutMatch = text.match(/CHECK.?OUT\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (checkinMatch) data.checkIn = checkinMatch[1];
    if (checkoutMatch) data.checkOut = checkoutMatch[1];
  }

  // Transport detection
  if (
    upperText.includes("RENTAL") ||
    upperText.includes("CAR") ||
    upperText.includes("VEHICLE") ||
    upperText.includes("UBER") ||
    upperText.includes("TAXI")
  ) {
    type = "transport";
    confidence = 0.7;
  }

  return { type, confidence, data };
}

Deno.serve(async (req) => {
  try {
    const { imageBase64, documentType } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image data provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let result: ExtractedReservation;

    if (documentType === "image" || documentType === "email") {
      result = await extractFromImage(imageBase64);
    } else if (documentType === "pdf") {
      // For PDFs, we'd need a different approach
      result = {
        type: "other",
        confidence: 0,
        data: { rawText: "PDF processing not yet implemented" },
      };
    } else {
      result = {
        type: "other",
        confidence: 0,
        data: {},
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
