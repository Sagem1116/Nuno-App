import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Folder, MoreVertical, Star, Download, Trash2, Pencil, ArrowUpRight, Grid3x3, List, Search,
  Undo2, X, Upload as UploadIcon, Tag as TagIcon, CheckCircle2, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator, BreadcrumbPage } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { FileRow, FolderRow, formatBytes, downloadFile } from "@/lib/drive";
import { useFavorites, useFiles, useFolders, useDriveMutations } from "@/hooks/useDrive";
import { useTags, useFileTags, useFolderTags } from "@/hooks/useTags";
import { useDriveCtx } from "./DriveContext";
import { FileIcon } from "./FileIcon";
import { RenameDialog } from "./RenameDialog";
import { FilePreview } from "./FilePreview";
import { TagBadges, TagChip } from "./TagBadges";
import { TagPicker } from "./TagPicker";

type View = "grid" | "list";
type Scope = { kind: "folder"; folderId: string | null } | { kind: "starred" } | { kind: "recent" } | { kind: "trash" };

export interface FileExplorerHandle { triggerUpload(): void; triggerUploadFolder(): void; }

interface Props {
  scope: Scope;
  title: string;
  search: string;
  setSearch: (v: string) => void;
  uploadRef: React.MutableRefObject<HTMLInputElement | null>;
  uploadFolderRef: React.MutableRefObject<HTMLInputElement | null>;
  onUpload: (files: FileList) => void;
}

export function FileExplorer({ scope, title, search, setSearch, uploadRef, uploadFolderRef, onUpload }: Props) {
  const [view, setView] = useState<View>("grid");
  const [preview, setPreview] = useState<FileRow | null>(null);
  const [renaming, setRenaming] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [tagTarget, setTagTarget] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [isDragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Map<string, { kind: "file" | "folder"; id: string; storagePath?: string }>>(new Map());
  const dragCounter = useRef(0);
  const navigate = useNavigate();
  const { tagFilter, setTagFilter } = useDriveCtx();

  const { data: folders = [] } = useFolders();
  const { data: files = [] } = useFiles();
  const { data: favs = [] } = useFavorites();
  const { data: allTags = [] } = useTags();
  const { data: fileTags = [] } = useFileTags();
  const { data: folderTags = [] } = useFolderTags();
  const mut = useDriveMutations();

  const scopeKey = scope.kind === "folder" ? `folder:${scope.folderId ?? ""}` : scope.kind;
  useEffect(() => { setSelected(new Map()); }, [scopeKey, tagFilter]);

  const selKey = (kind: "file" | "folder", id: string) => `${kind}:${id}`;
  const isSelected = (kind: "file" | "folder", id: string) => selected.has(selKey(kind, id));
  const toggleSelect = (kind: "file" | "folder", id: string, storagePath?: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const k = selKey(kind, id);
      if (next.has(k)) next.delete(k); else next.set(k, { kind, id, storagePath });
      return next;
    });
  };
  const clearSelection = () => setSelected(new Map());

  const tagById = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);
  const tagsForFile = (id: string) => fileTags.filter((l) => l.file_id === id).map((l) => tagById.get(l.tag_id)).filter(Boolean) as typeof allTags;
  const tagsForFolder = (id: string) => folderTags.filter((l) => l.folder_id === id).map((l) => tagById.get(l.tag_id)).filter(Boolean) as typeof allTags;
  const activeTag = tagFilter ? tagById.get(tagFilter) ?? null : null;

  const favFileIds = useMemo(() => new Set(favs.filter((f) => f.file_id).map((f) => f.file_id!)), [favs]);
  const favFolderIds = useMemo(() => new Set(favs.filter((f) => f.folder_id).map((f) => f.folder_id!)), [favs]);

  const visible = useMemo(() => {
    let vf: FolderRow[] = [];
    let vfi: FileRow[] = [];
    if (tagFilter) {
      const fileIds = new Set(fileTags.filter((l) => l.tag_id === tagFilter).map((l) => l.file_id!));
      const folderIds = new Set(folderTags.filter((l) => l.tag_id === tagFilter).map((l) => l.folder_id!));
      vf = folders.filter((f) => !f.is_trashed && folderIds.has(f.id));
      vfi = files.filter((f) => !f.is_trashed && fileIds.has(f.id));
    } else if (scope.kind === "folder") {
      vf = folders.filter((f) => !f.is_trashed && f.parent_id === scope.folderId);
      vfi = files.filter((f) => !f.is_trashed && f.folder_id === scope.folderId);
    } else if (scope.kind === "starred") {
      vf = folders.filter((f) => !f.is_trashed && favFolderIds.has(f.id));
      vfi = files.filter((f) => !f.is_trashed && favFileIds.has(f.id));
    } else if (scope.kind === "recent") {
      vfi = [...files.filter((f) => !f.is_trashed)].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)).slice(0, 50);
    } else {
      vf = folders.filter((f) => f.is_trashed);
      vfi = files.filter((f) => f.is_trashed);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      vf = vf.filter((f) => f.name.toLowerCase().includes(q));
      vfi = vfi.filter((f) => f.name.toLowerCase().includes(q));
    }
    vf = [...vf].sort((a, b) => a.name.localeCompare(b.name));
    return { folders: vf, files: vfi };
  }, [scope, folders, files, favFileIds, favFolderIds, search, tagFilter, fileTags, folderTags]);

  const breadcrumbs = useMemo(() => {
    if (scope.kind !== "folder") return null;
    const trail: FolderRow[] = [];
    let cur = folders.find((f) => f.id === scope.folderId);
    while (cur) {
      trail.unshift(cur);
      cur = folders.find((f) => f.id === cur!.parent_id);
    }
    return trail;
  }, [scope, folders]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current++; if (e.dataTransfer.types.includes("Files")) setDragging(true); };
  const onDragLeave = () => { dragCounter.current--; if (dragCounter.current <= 0) { setDragging(false); dragCounter.current = 0; } };
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); dragCounter.current = 0;
    if (e.dataTransfer.files?.length && scope.kind === "folder") onUpload(e.dataTransfer.files);
  }, [onUpload, scope]);

  const canDrop = scope.kind === "folder";

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      onDragEnter={canDrop ? onDragEnter : undefined}
      onDragOver={canDrop ? onDragOver : undefined}
      onDragLeave={canDrop ? onDragLeave : undefined}
      onDrop={canDrop ? onDrop : undefined}
    >
      <input ref={uploadRef} type="file" multiple hidden onChange={(e) => e.target.files && onUpload(e.target.files)} />
      <input
        ref={uploadFolderRef} type="file" multiple hidden
        // @ts-expect-error non-standard but widely supported
        webkitdirectory="" directory=""
        onChange={(e) => e.target.files && onUpload(e.target.files)}
      />

      {isDragging && canDrop && (
        <div className="absolute inset-4 z-30 rounded-2xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <UploadIcon className="size-12 mx-auto text-primary mb-3" />
            <p className="text-lg font-medium">Largar para carregar</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {scope.kind === "folder" ? (
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    {scope.folderId == null
                      ? <BreadcrumbPage className="text-2xl font-semibold text-foreground">{title}</BreadcrumbPage>
                      : <BreadcrumbLink asChild><Link to="/drive" className="text-2xl font-semibold text-muted-foreground hover:text-foreground">Meu Espaço</Link></BreadcrumbLink>}
                  </BreadcrumbItem>
                  {breadcrumbs?.map((c, i) => (
                    <span key={c.id} className="flex items-center gap-2">
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        {i === breadcrumbs.length - 1
                          ? <BreadcrumbPage className="text-2xl font-semibold">{c.name}</BreadcrumbPage>
                          : <BreadcrumbLink asChild><Link to="/drive/folder/$folderId" params={{ folderId: c.id }} className="text-2xl font-semibold text-muted-foreground hover:text-foreground">{c.name}</Link></BreadcrumbLink>}
                      </BreadcrumbItem>
                    </span>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            ) : (
              <h1 className="text-2xl font-semibold">{title}</h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            {scope.kind === "trash" && (visible.folders.length > 0 || visible.files.length > 0) && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  const total = visible.folders.length + visible.files.length;
                  if (!confirm(`Eliminar definitivamente todos os ${total} item(s) da reciclagem?`)) return;
                  const items = [
                    ...visible.folders.map((f) => ({ kind: "folder" as const, id: f.id })),
                    ...visible.files.map((f) => ({ kind: "file" as const, id: f.id, storagePath: f.storage_path })),
                  ];
                  mut.bulkRemove.mutate(items, { onSuccess: clearSelection });
                }}
              >
                <Trash2 className="size-4 mr-1" /> Esvaziar reciclagem
              </Button>
            )}
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar..." className="pl-9 w-64 bg-card" />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button onClick={() => setView("grid")} className={cn("p-2", view === "grid" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50")}>
                <Grid3x3 className="size-4" />
              </button>
              <button onClick={() => setView("list")} className={cn("p-2", view === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50")}>
                <List className="size-4" />
              </button>
            </div>
          </div>
        </div>
        {activeTag && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtrado por:</span>
            <TagChip tag={activeTag} size="md" onRemove={() => setTagFilter(null)} />
          </div>
        )}
        {selected.size > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
            <CheckCircle2 className="size-4 text-primary" />
            <span className="text-sm">{selected.size} selecionado{selected.size > 1 ? "s" : ""}</span>
            <div className="ml-auto flex items-center gap-2">
              {scope.kind === "trash" ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => {
                    selected.forEach((it) => mut.restore.mutate({ kind: it.kind, id: it.id }));
                    clearSelection();
                  }}>
                    <Undo2 className="size-4 mr-1" /> Restaurar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => {
                    if (!confirm(`Eliminar definitivamente ${selected.size} item(s)?`)) return;
                    mut.bulkRemove.mutate(Array.from(selected.values()), { onSuccess: clearSelection });
                  }}>
                    <Trash2 className="size-4 mr-1" /> Eliminar
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="destructive" onClick={() => {
                  mut.bulkTrash.mutate(Array.from(selected.values()).map(({ kind, id }) => ({ kind, id })), { onSuccess: clearSelection });
                }}>
                  <Trash2 className="size-4 mr-1" /> Mover para reciclagem
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={clearSelection}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 px-6 pb-6">
        {visible.folders.length === 0 && visible.files.length === 0 ? (
          <EmptyState scope={scope} tagFilter={!!activeTag} />
        ) : view === "grid" ? (
          <div className="space-y-6">
            {visible.folders.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Pastas</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {visible.folders.map((f) => (
                    <FolderCard key={f.id} folder={f} starred={favFolderIds.has(f.id)} tags={tagsForFolder(f.id)}
                      selected={isSelected("folder", f.id)}
                      onToggleSelect={() => toggleSelect("folder", f.id)}
                      onOpen={() => scope.kind === "trash" ? null : navigate({ to: "/drive/folder/$folderId", params: { folderId: f.id } })}
                      onRename={() => setRenaming({ kind: "folder", id: f.id, name: f.name })}
                      onEditTags={() => setTagTarget({ kind: "folder", id: f.id, name: f.name })}
                      onClickTag={(id: string) => setTagFilter(id)}
                      mut={mut} trashed={scope.kind === "trash"} />
                  ))}
                </div>
              </div>
            )}
            {visible.files.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Ficheiros</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {visible.files.map((f) => (
                    <FileCard key={f.id} file={f} starred={favFileIds.has(f.id)} tags={tagsForFile(f.id)}
                      selected={isSelected("file", f.id)}
                      onToggleSelect={() => toggleSelect("file", f.id, f.storage_path)}
                      onOpen={() => scope.kind === "trash" ? null : setPreview(f)}
                      onRename={() => setRenaming({ kind: "file", id: f.id, name: f.name })}
                      onEditTags={() => setTagTarget({ kind: "file", id: f.id, name: f.name })}
                      onClickTag={(id: string) => setTagFilter(id)}
                      mut={mut} trashed={scope.kind === "trash"} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <ListView
            folders={visible.folders} files={visible.files}
            favFileIds={favFileIds} favFolderIds={favFolderIds}
            tagsForFile={tagsForFile} tagsForFolder={tagsForFolder}
            isSelected={isSelected} toggleSelect={toggleSelect}
            onEditTags={(kind: "file" | "folder", id: string, name: string) => setTagTarget({ kind, id, name })}
            onClickTag={(id: string) => setTagFilter(id)}
            trashed={scope.kind === "trash"}
            onOpenFile={(f: FileRow) => scope.kind === "trash" ? null : setPreview(f)}
            onOpenFolder={(f: FolderRow) => scope.kind === "trash" ? null : navigate({ to: "/drive/folder/$folderId", params: { folderId: f.id } })}
            onRename={(kind: "file" | "folder", id: string, name: string) => setRenaming({ kind, id, name })}
            mut={mut}
          />
        )}
      </ScrollArea>

      <TagPicker open={!!tagTarget} target={tagTarget} onClose={() => setTagTarget(null)} />


      <FilePreview file={preview} onClose={() => setPreview(null)} />
      <RenameDialog
        open={!!renaming}
        title={renaming?.kind === "folder" ? "Renomear pasta" : "Renomear ficheiro"}
        initial={renaming?.name ?? ""}
        confirmLabel="Renomear"
        onCancel={() => setRenaming(null)}
        onConfirm={(name) => { if (renaming) mut.rename.mutate({ ...renaming, name }); setRenaming(null); }}
      />
    </div>
  );
}

function EmptyState({ scope, tagFilter }: { scope: Scope; tagFilter?: boolean }) {
  const map: Record<string, { title: string; msg: string }> = {
    folder: { title: "Esta pasta está vazia", msg: "Arrasta ficheiros para aqui ou usa o botão Novo." },
    starred: { title: "Sem favoritos", msg: "Adiciona itens aos favoritos para acesso rápido." },
    recent: { title: "Sem atividade recente", msg: "Carrega ou edita ficheiros para aparecerem aqui." },
    trash: { title: "Reciclagem vazia", msg: "Itens eliminados aparecem aqui." },
  };
  const m = tagFilter
    ? { title: "Nenhum item com esta etiqueta", msg: "Adiciona a etiqueta a ficheiros ou pastas." }
    : map[scope.kind];
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="size-16 rounded-2xl bg-accent/40 flex items-center justify-center mb-4">
        <Folder className="size-8 text-muted-foreground" />
      </div>
      <h3 className="font-medium">{m.title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{m.msg}</p>
    </div>
  );
}

function SelectCheck({ selected, onToggle }: { selected: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={cn(
        "absolute top-2 left-2 z-10 rounded-full bg-background/90 backdrop-blur-sm transition",
        selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
      )}
      aria-label={selected ? "Desmarcar" : "Selecionar"}
    >
      {selected
        ? <CheckCircle2 className="size-5 text-primary fill-primary/20" />
        : <Circle className="size-5 text-muted-foreground hover:text-foreground" />}
    </button>
  );
}

function FolderCard({ folder, starred, tags, selected, onToggleSelect, onOpen, onRename, onEditTags, onClickTag, mut, trashed }: any) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div onDoubleClick={onOpen} className={cn(
          "group relative rounded-xl border bg-card hover:border-primary/40 hover:shadow-[var(--shadow-glow)] transition cursor-pointer p-3",
          selected ? "border-primary ring-2 ring-primary/30" : "border-border",
        )}>
          <SelectCheck selected={!!selected} onToggle={onToggleSelect} />
          <div className="flex items-center justify-between mb-2">
            <Folder className="size-5 text-primary fill-primary/20" />
            <ItemMenu>
              {trashed ? (
                <>
                  <DropdownMenuItem onClick={() => mut.restore.mutate({ kind: "folder", id: folder.id })}><Undo2 className="size-4 mr-2" />Restaurar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => mut.remove.mutate({ kind: "folder", id: folder.id })} className="text-destructive"><Trash2 className="size-4 mr-2" />Eliminar definitivamente</DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={onOpen}><ArrowUpRight className="size-4 mr-2" />Abrir</DropdownMenuItem>
                  <DropdownMenuItem onClick={onRename}><Pencil className="size-4 mr-2" />Renomear</DropdownMenuItem>
                  <DropdownMenuItem onClick={onEditTags}><TagIcon className="size-4 mr-2" />Editar etiquetas</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => mut.toggleFavorite.mutate({ kind: "folder", id: folder.id, on: !starred })}>
                    <Star className={cn("size-4 mr-2", starred && "fill-primary text-primary")} />
                    {starred ? "Remover favorito" : "Adicionar a favoritos"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => mut.trash.mutate({ kind: "folder", id: folder.id })} className="text-destructive"><Trash2 className="size-4 mr-2" />Mover para reciclagem</DropdownMenuItem>
                </>
              )}
            </ItemMenu>
          </div>
          <div className="font-medium text-sm truncate flex items-center gap-1">
            {folder.name}
            {starred && <Star className="size-3 fill-primary text-primary shrink-0" />}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{format(new Date(folder.updated_at), "dd MMM yyyy")}</div>
          {tags && <TagBadges tags={tags} onClickTag={(t) => onClickTag?.(t.id)} />}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {trashed ? (
          <>
            <ContextMenuItem onClick={() => mut.restore.mutate({ kind: "folder", id: folder.id })}>Restaurar</ContextMenuItem>
            <ContextMenuItem onClick={() => mut.remove.mutate({ kind: "folder", id: folder.id })} className="text-destructive">Eliminar definitivamente</ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onClick={onOpen}>Abrir</ContextMenuItem>
            <ContextMenuItem onClick={onRename}>Renomear</ContextMenuItem>
            <ContextMenuItem onClick={onEditTags}>Editar etiquetas</ContextMenuItem>
            <ContextMenuItem onClick={() => mut.toggleFavorite.mutate({ kind: "folder", id: folder.id, on: !starred })}>{starred ? "Remover favorito" : "Favoritar"}</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => mut.trash.mutate({ kind: "folder", id: folder.id })} className="text-destructive">Mover para reciclagem</ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FileCard({ file, starred, tags, selected, onToggleSelect, onOpen, onRename, onEditTags, onClickTag, mut, trashed }: any) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div onDoubleClick={onOpen} className={cn(
          "group relative rounded-xl border bg-card hover:border-primary/40 hover:shadow-[var(--shadow-glow)] transition cursor-pointer overflow-hidden",
          selected ? "border-primary ring-2 ring-primary/30" : "border-border",
        )}>
          <SelectCheck selected={!!selected} onToggle={onToggleSelect} />
          <div className="aspect-[4/3] bg-gradient-to-br from-accent/30 to-card flex items-center justify-center">
            <FileIcon mime={file.mime_type} ext={file.extension} className="size-12" />
          </div>
          <div className="p-3 border-t border-border">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-1">
                  {file.name}
                  {starred && <Star className="size-3 fill-primary text-primary shrink-0" />}
                </div>
                <div className="text-[11px] text-muted-foreground">{formatBytes(file.size_bytes)}</div>
              </div>
              <ItemMenu>
                {trashed ? (
                  <>
                    <DropdownMenuItem onClick={() => mut.restore.mutate({ kind: "file", id: file.id })}><Undo2 className="size-4 mr-2" />Restaurar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => mut.remove.mutate({ kind: "file", id: file.id, storagePath: file.storage_path })} className="text-destructive"><Trash2 className="size-4 mr-2" />Eliminar definitivamente</DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem onClick={onOpen}><ArrowUpRight className="size-4 mr-2" />Pré-visualizar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => downloadFile(file)}><Download className="size-4 mr-2" />Transferir</DropdownMenuItem>
                    <DropdownMenuItem onClick={onRename}><Pencil className="size-4 mr-2" />Renomear</DropdownMenuItem>
                    <DropdownMenuItem onClick={onEditTags}><TagIcon className="size-4 mr-2" />Editar etiquetas</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => mut.toggleFavorite.mutate({ kind: "file", id: file.id, on: !starred })}>
                      <Star className={cn("size-4 mr-2", starred && "fill-primary text-primary")} />
                      {starred ? "Remover favorito" : "Favoritar"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => mut.trash.mutate({ kind: "file", id: file.id })} className="text-destructive"><Trash2 className="size-4 mr-2" />Mover para reciclagem</DropdownMenuItem>
                  </>
                )}
              </ItemMenu>
            </div>
            {tags && <TagBadges tags={tags} onClickTag={(t) => onClickTag?.(t.id)} />}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {trashed ? (
          <>
            <ContextMenuItem onClick={() => mut.restore.mutate({ kind: "file", id: file.id })}>Restaurar</ContextMenuItem>
            <ContextMenuItem onClick={() => mut.remove.mutate({ kind: "file", id: file.id, storagePath: file.storage_path })} className="text-destructive">Eliminar definitivamente</ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onClick={onOpen}>Pré-visualizar</ContextMenuItem>
            <ContextMenuItem onClick={() => downloadFile(file)}>Transferir</ContextMenuItem>
            <ContextMenuItem onClick={onRename}>Renomear</ContextMenuItem>
            <ContextMenuItem onClick={onEditTags}>Editar etiquetas</ContextMenuItem>
            <ContextMenuItem onClick={() => mut.toggleFavorite.mutate({ kind: "file", id: file.id, on: !starred })}>{starred ? "Remover favorito" : "Favoritar"}</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => mut.trash.mutate({ kind: "file", id: file.id })} className="text-destructive">Mover para reciclagem</ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ItemMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button onClick={(e) => e.stopPropagation()} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition opacity-0 group-hover:opacity-100">
          <MoreVertical className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ListView({ folders, files, favFileIds, favFolderIds, tagsForFile, tagsForFolder, isSelected, toggleSelect, onEditTags, onClickTag, trashed, onOpenFile, onOpenFolder, onRename, mut }: any) {
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <div className="grid grid-cols-[32px_1fr_140px_120px_60px] gap-4 px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground border-b border-border bg-muted/30">
        <div></div><div>Nome</div><div>Modificado</div><div>Tamanho</div><div></div>
      </div>
      {folders.map((f: FolderRow) => {
        const starred = favFolderIds.has(f.id);
        const tags = tagsForFolder?.(f.id) ?? [];
        const sel = isSelected?.("folder", f.id);
        return (
          <div key={f.id} onDoubleClick={() => onOpenFolder(f)} className={cn(
            "grid grid-cols-[32px_1fr_140px_120px_60px] gap-4 px-4 py-2.5 items-center border-b border-border/50 hover:bg-accent/40 cursor-pointer transition",
            sel && "bg-primary/10",
          )}>
            <button onClick={(e) => { e.stopPropagation(); toggleSelect?.("folder", f.id); }} className="grid place-items-center">
              {sel ? <CheckCircle2 className="size-4 text-primary fill-primary/20" /> : <Circle className="size-4 text-muted-foreground" />}
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <Folder className="size-4 text-primary fill-primary/20 shrink-0" />
              <span className="truncate text-sm">{f.name}</span>
              {starred && <Star className="size-3 fill-primary text-primary" />}
              <TagBadges tags={tags} max={2} onClickTag={(t) => onClickTag?.(t.id)} />
            </div>
            <div className="text-xs text-muted-foreground">{format(new Date(f.updated_at), "dd MMM yyyy")}</div>
            <div className="text-xs text-muted-foreground">—</div>
            <ItemMenu>
              {trashed ? (
                <>
                  <DropdownMenuItem onClick={() => mut.restore.mutate({ kind: "folder", id: f.id })}>Restaurar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => mut.remove.mutate({ kind: "folder", id: f.id })} className="text-destructive">Eliminar definitivamente</DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => onOpenFolder(f)}>Abrir</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRename("folder", f.id, f.name)}>Renomear</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEditTags("folder", f.id, f.name)}>Editar etiquetas</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => mut.toggleFavorite.mutate({ kind: "folder", id: f.id, on: !starred })}>{starred ? "Remover favorito" : "Favoritar"}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => mut.trash.mutate({ kind: "folder", id: f.id })} className="text-destructive">Mover para reciclagem</DropdownMenuItem>
                </>
              )}
            </ItemMenu>
          </div>
        );
      })}
      {files.map((f: FileRow) => {
        const starred = favFileIds.has(f.id);
        const tags = tagsForFile?.(f.id) ?? [];
        const sel = isSelected?.("file", f.id);
        return (
          <div key={f.id} onDoubleClick={() => onOpenFile(f)} className={cn(
            "grid grid-cols-[32px_1fr_140px_120px_60px] gap-4 px-4 py-2.5 items-center border-b border-border/50 hover:bg-accent/40 cursor-pointer transition",
            sel && "bg-primary/10",
          )}>
            <button onClick={(e) => { e.stopPropagation(); toggleSelect?.("file", f.id, f.storage_path); }} className="grid place-items-center">
              {sel ? <CheckCircle2 className="size-4 text-primary fill-primary/20" /> : <Circle className="size-4 text-muted-foreground" />}
            </button>
            <div className="flex items-center gap-3 min-w-0">
              <FileIcon mime={f.mime_type} ext={f.extension} className="size-4 shrink-0" />
              <span className="truncate text-sm">{f.name}</span>
              {starred && <Star className="size-3 fill-primary text-primary" />}
              <TagBadges tags={tags} max={2} onClickTag={(t) => onClickTag?.(t.id)} />
            </div>
            <div className="text-xs text-muted-foreground">{format(new Date(f.updated_at), "dd MMM yyyy")}</div>
            <div className="text-xs text-muted-foreground">{formatBytes(f.size_bytes)}</div>
            <ItemMenu>
              {trashed ? (
                <>
                  <DropdownMenuItem onClick={() => mut.restore.mutate({ kind: "file", id: f.id })}>Restaurar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => mut.remove.mutate({ kind: "file", id: f.id, storagePath: f.storage_path })} className="text-destructive">Eliminar definitivamente</DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => onOpenFile(f)}>Pré-visualizar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => downloadFile(f)}>Transferir</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onRename("file", f.id, f.name)}>Renomear</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEditTags("file", f.id, f.name)}>Editar etiquetas</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => mut.toggleFavorite.mutate({ kind: "file", id: f.id, on: !starred })}>{starred ? "Remover favorito" : "Favoritar"}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => mut.trash.mutate({ kind: "file", id: f.id })} className="text-destructive">Mover para reciclagem</DropdownMenuItem>
                </>
              )}
            </ItemMenu>
          </div>
        );
      })}
    </div>
  );
}
