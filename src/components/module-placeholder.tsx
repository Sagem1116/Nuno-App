import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ModulePlaceholder({ icon: Icon, title, description }: Props) {
  return (
    <div className="page-enter max-w-3xl mx-auto">
      <div className="glass-card glass-card-hover p-10 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow shadow-glow mb-6">
          <Icon className="h-7 w-7 text-primary-foreground" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
        <p className="mt-6 text-xs uppercase tracking-widest text-primary/70">
          Módulo em preparação
        </p>
      </div>
    </div>
  );
}
