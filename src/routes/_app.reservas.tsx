import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/reservas")({
  component: ReservasLayout,
});

function ReservasLayout() {
  return <Outlet />;
}
