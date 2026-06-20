import { TagRow } from "@/hooks/useTags";
import { cn } from "@/lib/utils";

export const TAG_COLORS = [
  "#f97316", "#ef4444", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#a855f7", "#ec4899",
  "#64748b", "#0ea5e9",
];

export function TagChip({ tag, size = "sm", onRemove, onClick, className }: {
  tag: TagRow;
  size?: "sm" | "md";
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium border transition",
        size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
        onClick && "cursor-pointer hover:opacity-80",
        className,
      )}
      style={{
        backgroundColor: `${tag.color}22`,
        borderColor: `${tag.color}55`,
        color: tag.color,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
      {tag.name}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
      )}
    </span>
  );
}

export function TagBadges({ tags, max = 3, onClickTag }: { tags: TagRow[]; max?: number; onClickTag?: (t: TagRow) => void }) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  const extra = tags.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {shown.map((t) => <TagChip key={t.id} tag={t} onClick={onClickTag ? () => onClickTag(t) : undefined} />)}
      {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
    </div>
  );
}
