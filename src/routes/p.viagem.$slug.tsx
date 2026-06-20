import { createFileRoute, notFound } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TripDetailView } from "@/components/trip-detail-view";

export const Route = createFileRoute("/p/viagem/$slug")({
  ssr: false,
  loader: async ({ params }) => {
    if (!/^[A-Za-z0-9_-]{6,32}$/.test(params.slug)) throw notFound();
    const { data, error } = await (supabase as any)
      .from("trips")
      .select("id,user_id,is_public")
      .eq("public_slug", params.slug)
      .eq("is_public", true)
      .maybeSingle();
    if (error || !data) throw notFound();
    return { tripId: data.id as string, ownerUserId: data.user_id as string };
  },
  component: PublicTripPage,
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">Viagem não encontrada</h1>
        <p className="text-muted-foreground text-sm mt-2">O link pode ter expirado ou ter sido revogado.</p>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-bold">Erro</h1>
        <p className="text-muted-foreground text-sm mt-2">{error?.message}</p>
      </div>
    </div>
  ),
});

function PublicTripPage() {
  const { tripId, ownerUserId } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="neon-text font-semibold">Nuno App</span>
            <span className="text-muted-foreground">· Viagem partilhada (edição pública)</span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Qualquer pessoa com o link pode editar</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto p-6">
        <TripDetailView
          tripId={tripId}
          effectiveUserId={ownerUserId}
          isPublic
          backHref="/"
        />
      </main>
    </div>
  );
}
