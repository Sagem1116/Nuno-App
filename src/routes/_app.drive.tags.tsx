import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Tag as TagIcon, Plus, Pencil, Trash2, Search, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useTags, useFileTags, useFolderTags, useTagMutations, TagRow } from "@/hooks/useTags";
import { TagChip, TAG_COLORS } from "@/components/drive/TagBadges";
import { useDriveCtx } from "@/components/drive/DriveContext";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/drive/tags")({
  component: TagsPage,
});

function TagsPage() {
  const { data: tags = [] } = useTags();
  const { data: fileTags = [] } = useFileTags();
  const { data: folderTags = [] } = useFolderTags();
  const mut = useTagMutations();
  const navigate = useNavigate();
  const { setTagFilter } = useDriveCtx();

  const [q, setQ] = useState("");
  const [editor, setEditor] = useState<{ id?: string; name: string; color: string } | null>(null);
  const [deleting, setDeleting] = useState<TagRow | null>(null);

  const counts = (id: string) => ({
    files: fileTags.filter((l) => l.tag_id === id).length,
    folders: folderTags.filter((l) => l.tag_id === id).length,
  });

  const filtered = q.trim() ? tags.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())) : tags;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <TagIcon className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold">Gestor de etiquetas</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar..." className="pl-9 w-64 bg-card" />
            </div>
            <Button onClick={() => setEditor({ name: "", color: TAG_COLORS[0] })}>
              <Plus className="size-4 mr-1" /> Nova etiqueta
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Clica numa etiqueta para ver os ficheiros e pastas que a usam.
        </p>
      </div>

      <ScrollArea className="flex-1 px-6 pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="size-16 rounded-2xl bg-accent/40 flex items-center justify-center mb-4">
              <TagIcon className="size-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium">Sem etiquetas</h3>
            <p className="text-sm text-muted-foreground mt-1">Cria etiquetas para organizar os teus ficheiros e pastas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((t) => {
              const c = counts(t.id);
              return (
                <div key={t.id} className="group rounded-xl border border-border bg-card hover:border-primary/40 transition p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => { setTagFilter(t.id); navigate({ to: "/drive" }); }}
                      className="text-left min-w-0 flex-1"
                    >
                      <TagChip tag={t} size="md" />
                      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-3">
                        <span><FolderOpen className="size-3 inline mr-1" />{c.folders} pastas</span>
                        <span>{c.files} ficheiros</span>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => setEditor({ id: t.id, name: t.name, color: t.color })}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                        <Pencil className="size-3.5" />
                      </button>
                      <button onClick={() => setDeleting(t)}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <Dialog open={!!editor} onOpenChange={(o) => !o && setEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor?.id ? "Editar etiqueta" : "Nova etiqueta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input
                autoFocus
                value={editor?.name ?? ""}
                onChange={(e) => setEditor((s) => s ? { ...s, name: e.target.value } : s)}
                placeholder="Ex: Importante"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-2">Cor</label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((c) => (
                  <button key={c} onClick={() => setEditor((s) => s ? { ...s, color: c } : s)} aria-label={c}
                    className={cn("size-7 rounded-full border-2 transition", editor?.color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105")}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditor(null)}>Cancelar</Button>
            <Button
              disabled={!editor?.name.trim()}
              onClick={async () => {
                if (!editor || !editor.name.trim()) return;
                if (editor.id) await mut.updateTag.mutateAsync({ id: editor.id, name: editor.name, color: editor.color });
                else await mut.createTag.mutateAsync({ name: editor.name, color: editor.color });
                setEditor(null);
              }}
            >{editor?.id ? "Guardar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar etiqueta</AlertDialogTitle>
            <AlertDialogDescription>
              A etiqueta "{deleting?.name}" será removida de todos os ficheiros e pastas. Esta ação é permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleting) mut.deleteTag.mutate(deleting.id); setDeleting(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
