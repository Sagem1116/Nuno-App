import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nanoid } from "nanoid";

export const enableTripShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tripId: string }) => {
    if (!d?.tripId) throw new Error("tripId obrigatório");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("trips")
      .select("public_slug,is_public,user_id" as any)
      .eq("id", data.tripId)
      .single();
    if (!existing || (existing as any).user_id !== userId) throw new Error("Sem acesso");
    let slug = (existing as any).public_slug as string | null;
    if (!slug) slug = nanoid(10);
    const { error } = await supabase
      .from("trips")
      .update({ public_slug: slug, is_public: true } as any)
      .eq("id", data.tripId);
    if (error) throw new Error(error.message);
    return { slug };
  });

export const disableTripShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tripId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase
      .from("trips")
      .update({ is_public: false } as any)
      .eq("id", data.tripId);
    return { ok: true };
  });

export const getPublicTrip = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => {
    if (!d?.slug || !/^[A-Za-z0-9_-]{6,32}$/.test(d.slug)) throw new Error("slug inválido");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: trip } = await supabaseAdmin
      .from("trips")
      .select("*")
      .eq("public_slug", data.slug)
      .eq("is_public", true)
      .maybeSingle();
    if (!trip) return { trip: null };

    const tripId = (trip as any).id;
    const [{ data: days }, { data: items }, { data: planItems }] = await Promise.all([
      supabaseAdmin.from("trip_days").select("*").eq("trip_id", tripId).order("day_order"),
      supabaseAdmin.from("trip_items").select("*").eq("trip_id", tripId).order("created_at"),
      supabaseAdmin.from("trip_itinerary_items").select("*").eq("trip_id", tripId).order("day_id").order("order_index"),
    ]);

    return {
      trip,
      days: days ?? [],
      items: items ?? [],
      planItems: planItems ?? [],
    };
  });
