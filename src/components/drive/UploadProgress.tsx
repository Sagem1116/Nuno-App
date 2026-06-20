import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface UploadItem { name: string; pct: number; done: boolean }

export function UploadProgress({ items, onClose }: { items: UploadItem[]; onClose: () => void }) {
  if (!items.length) return null;
  const allDone = items.every((i) => i.done);
  return (
    <Card className="fixed bottom-4 right-4 w-[340px] z-50 shadow-2xl border-border bg-card/95 backdrop-blur">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="text-sm font-medium">
          {allDone ? `${items.length} carregamento(s) concluído(s)` : `A carregar ${items.length} ficheiro(s)`}
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}><X className="size-4" /></Button>
      </div>
      <div className="max-h-64 overflow-y-auto p-3 space-y-3">
        {items.map((it, i) => (
          <div key={i}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="truncate pr-2">{it.name}</span>
              <span className="text-muted-foreground">{it.pct}%</span>
            </div>
            <Progress value={it.pct} className="h-1" />
          </div>
        ))}
      </div>
    </Card>
  );
}
