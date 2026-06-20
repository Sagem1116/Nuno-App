import { HardDrive } from "lucide-react";
import { useFiles } from "@/hooks/useDrive";
import { formatBytes } from "@/lib/drive";

// Total cloud storage quota (Lovable Cloud free tier). Adjust if the plan changes.
const TOTAL_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB

export function StorageBar() {
  const { data: files = [] } = useFiles();
  const used = files.reduce((acc, f) => acc + (f.size_bytes ?? 0), 0);
  const pct = Math.min(100, (used / TOTAL_QUOTA_BYTES) * 100);
  const near = pct >= 85;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-md bg-card/60 border border-border min-w-[220px]">
      <HardDrive className="size-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground gap-2">
          <span className="truncate">{formatBytes(used)} de {formatBytes(TOTAL_QUOTA_BYTES)}</span>
          <span className={near ? "text-destructive" : ""}>{pct.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 mt-1 rounded-full bg-accent overflow-hidden">
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
      </div>
    </div>
  );
}
