import { useEffect, useState } from "react";
import { Database, HardDrive } from "lucide-react";
import { useFiles } from "@/hooks/useDrive";
import { formatBytes } from "@/lib/drive";
import { getDbSize, DB_QUOTA_BYTES } from "@/lib/db-stats.functions";

const FILES_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB (matches StorageBar)

export function StorageUsagePanel() {
  const { data: files = [] } = useFiles();
  const filesUsed = files.reduce((acc, f) => acc + (f.size_bytes ?? 0), 0);

  const [db, setDb] = useState<{ bytes: number; quota: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getDbSize()
      .then((r) => { if (alive) setDb(r); })
      .catch((e: any) => { if (alive) setErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, []);

  return (
    <section className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <HardDrive className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-wider uppercase">Armazenamento</h2>
      </div>
      <div className="px-5 py-5 space-y-4">
        <UsageRow
          icon={<HardDrive className="size-4 text-primary" />}
          label="Ficheiros (Drive)"
          used={filesUsed}
          quota={FILES_QUOTA_BYTES}
        />
        <UsageRow
          icon={<Database className="size-4 text-primary" />}
          label="Base de dados"
          used={db?.bytes ?? 0}
          quota={db?.quota ?? DB_QUOTA_BYTES}
          loading={!db && !err}
          error={err}
        />
        <p className="text-[10px] text-muted-foreground">
          Os limites mostrados correspondem às quotas do plano gratuito Lovable Cloud (1 GB de ficheiros · 500 MB de base de dados).
        </p>
      </div>
    </section>
  );
}

function UsageRow({
  icon, label, used, quota, loading, error,
}: { icon: React.ReactNode; label: string; used: number; quota: number; loading?: boolean; error?: string | null }) {
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  const near = pct >= 85;
  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        {icon}
        <span className="font-medium">{label}</span>
        <span className="ml-auto text-muted-foreground">
          {loading ? "A calcular…" : error ? "Erro" : `${formatBytes(used)} / ${formatBytes(quota)}`}
          {!loading && !error && <span className={`ml-2 ${near ? "text-destructive" : ""}`}>{pct.toFixed(1)}%</span>}
        </span>
      </div>
      <div className="h-2 mt-2 rounded-full bg-accent overflow-hidden">
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: near
              ? "var(--destructive)"
              : "linear-gradient(90deg, var(--primary), var(--primary-glow))",
          }}
        />
      </div>
      {error && <div className="text-[10px] text-destructive mt-1">{error}</div>}
    </div>
  );
}
