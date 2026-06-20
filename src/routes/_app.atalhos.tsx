import { createFileRoute, Link } from "@tanstack/react-router";
import { Keyboard } from "lucide-react";
import { SHORTCUTS } from "@/lib/shortcuts";

export const Route = createFileRoute("/_app/atalhos")({
  component: ShortcutsPage,
});

function ShortcutsPage() {
  return (
    <div className="page-enter space-y-6 max-w-3xl">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary-glow grid place-items-center shadow-glow">
          <Keyboard className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold neon-text">Atalhos de teclado</h1>
          <p className="text-sm text-muted-foreground">
            Usa estas combinações em qualquer página para navegar mais rápido.
          </p>
        </div>
      </header>

      <div className="glass-card divide-y divide-border">
        {SHORTCUTS.map((s) => (
          <div key={s.to} className="flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors">
            <Link to={s.to} className="text-sm font-medium hover:text-primary">
              {s.label}
            </Link>
            <kbd className="px-3 py-1 rounded-md bg-card border border-primary/30 text-xs font-mono tracking-wider text-primary shadow-glow">
              {s.combo}
            </kbd>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Nota: os atalhos não funcionam enquanto estiveres a escrever num campo de texto.
      </p>
    </div>
  );
}
