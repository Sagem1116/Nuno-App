import { useRouterState } from "@tanstack/react-router";
import { GlobalSearch } from "./global-search";
import { ThemeSwitcher } from "./theme-switcher";
import { InstallPwaButton } from "./install-pwa-button";
import { Menu } from "lucide-react";

const titles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/notas": "Notas",
  "/drive": "Drive",
  "/links": "Links",
  "/tarefas": "Tarefas",
  "/financas": "Finanças",
  "/viagens": "Travel Planner",
  "/mundial": "Mundial 2026",
  "/noticias": "Notícias",
  "/email": "Email",
  "/projetos": "Projetos",
  "/configuracoes": "Configurações",
};

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const title = titles[pathname] ?? "Nuno App";

  return (
    <header className="h-16 sticky top-0 z-10 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-border bg-background/60 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-lg text-muted-foreground/80 hover:bg-input/60 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-medium tracking-wide shrink-0">
          <span className="text-muted-foreground">/</span>{" "}
          <span className="neon-text">{title}</span>
        </h1>
      </div>
      <div className="flex-1 min-w-0 flex justify-center">
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-3">
        <InstallPwaButton />
        <ThemeSwitcher />
        <div className="text-xs text-muted-foreground hidden md:block">Life OS</div>
      </div>
    </header>
  );
}
