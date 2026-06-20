import { useMemo, useState } from "react";
import { Check, Plus, Tag as TagIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTags, useFileTags, useFolderTags, useTagMutations } from "@/hooks/useTags";
import { TagChip, TAG_COLORS } from "./TagBadges";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  target: { kind: "file" | "folder"; id: string; name: string } | null;
}

export function TagPicker({ open, onClose, target }: Props) {
  const { data: tags = [] } = useTags();
  const { data: fileTags = [] } = useFileTags();
  const { data: folderTags = [] } = useFolderTags();
  const mut = useTagMutations();

  const [q, setQ] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);

  const selected = useMemo(() => {
    if (!target) return new Set<string>();
    const links = target.kind === "file"
      ? fileTags.filter((l) => l.file_id === target.id)
      : folderTags.filter((l) => l.folder_id === target.id);
    return new Set(links.map((l) => l.tag_id));
  }, [target, fileTags, folderTags]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? tags.filter((x) => x.name.toLowerCase().includes(t)) : tags;
  }, [tags, q]);

  const exactMatch = tags.find((t) => t.name.toLowerCase() === q.trim().toLowerCase());

  const toggle = (tagId: string) => {
    if (!target) return;
    mut.setItemTag.mutate({ kind: target.kind, id: target.id, tagId, on: !selected.has(tagId) });
  };

  const createAndAssign = async () => {
    if (!q.trim() || !target || exactMatch) return;
    const created = await mut.createTag.mutateAsync({ name: q.trim(), color: newColor });
    mut.setItemTag.mutate({ kind: target.kind, id: target.id, tagId: created.id, on: true });
    setQ("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><TagIcon className="size-4" /> Etiquetas</DialogTitle>
          {target && <p className="text-xs text-muted-foreground truncate">{target.name}</p>}
        </DialogHeader>

        <div className="space-y-3">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar ou criar etiqueta..." />

          {q.trim() && !exactMatch && (
            <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Criar nova:</span>
                <div className="flex items-center gap-1">
                  {TAG_COLORS.slice(0, 6).map((c) => (
                    <button key={c} onClick={() => setNewColor(c)} aria-label={c}
                      className={cn("size-4 rounded-full border-2", newColor === c ? "border-foreground" : "border-transparent")}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <Button size="sm" className="w-full" onClick={createAndAssign}>
                <Plus className="size-3.5 mr-1" /> Criar "{q.trim()}"
              </Button>
            </div>
          )}

          <ScrollArea className="max-h-64 -mx-1 px-1">
            {filtered.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-6">Sem etiquetas. Escreve em cima para criar.</div>
            ) : (
              <div className="space-y-1">
                {filtered.map((t) => {
                  const on = selected.has(t.id);
                  return (
                    <button key={t.id} onClick={() => toggle(t.id)}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition text-left">
                      <TagChip tag={t} size="md" />
                      {on && <Check className="size-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
