import { createFileRoute } from "@tanstack/react-router";
import { TripDetailView } from "@/components/trip-detail-view";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/viagens/$tripId")({
  component: TripDetailPage,
});

function TripDetailPage() {
  const { tripId } = Route.useParams();
  const { user } = useAuth();
  if (!user) return null;

  return (
    <TripDetailView
      tripId={tripId}
      effectiveUserId={user.id}
      isPublic={false}
      backHref="/viagens"
    />
  );
}