import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { runWeeklyAutoExports } from "@/lib/data-io";
import { runScheduledChecks } from "@/lib/notification-scheduler";
import { FloatingTimerHost } from "@/components/floating-timer-host";
import { SHORTCUTS } from "@/lib/shortcuts";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (session) {
      void runWeeklyAutoExports();
      const t = setInterval(() => { void runWeeklyAutoExports(); }, 60 * 60 * 1000);
      return () => clearInterval(t);
    }
  }, [session]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    void runScheduledChecks(uid);
    const t = setInterval(() => { void runScheduledChecks(uid); }, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") void runScheduledChecks(uid); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const match = SHORTCUTS.find((s) => s.key === e.key.toLowerCase());
      if (!match) return;
      e.preventDefault();
      navigate({ to: match.to });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="neon-text text-sm tracking-widest animate-pulse">CARREGANDO</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex w-full">
      <AppSidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onMenuClick={() => setMobileMenuOpen((prev) => !prev)} />
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
      <FloatingTimerHost />
    </div>
  );
}
