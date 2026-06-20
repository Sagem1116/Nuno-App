import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FolderOpen, Clock, Star, Tag, Trash2, Plus, Upload, FolderPlus, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { UploadProgress, UploadItem } from "@/components/drive/UploadProgress";
import { RenameDialog } from "@/components/drive/RenameDialog";
import { useDriveMutations } from "@/hooks/useDrive";
import { DriveCtx } from "@/components/drive/DriveContext";
import { StorageBar } from "@/components/drive/StorageBar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/drive")({
  component: DriveLayout,
});

const tabs = [
  { url: "/drive", label: "Meu Espaço", icon: FolderOpen, match: (p: string) => p === "/drive" || p.startsWith("/drive/folder") },
  { url: "/drive/recent", label: "Recentes", icon: Clock, match: (p: string) => p === "/drive/recent" },
  { url: "/drive/starred", label: "Favoritos", icon: Star, match: (p: string) => p === "/drive/starred" },
  { url: "/drive/tags", label: "Etiquetas", icon: Tag, match: (p: string) => p === "/drive/tags" },
  { url: "/drive/links", label: "Links externos", icon: Cloud, match: (p: string) => p === "/drive/links" },
  { url: "/drive/trash", label: "Reciclagem", icon: Trash2, match: (p: string) => p === "/drive/trash" },
] as const;

function DriveLayout() {
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const uploadFolderRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [newFolder, setNewFolder] = useState(false);
  const mut = useDriveMutations();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const currentFolderId = (() => {
    const m = pathname.match(/^\/drive\/folder\/([^/]+)/);
    return m ? m[1] : null;
  })();

  const onUpload = async (files: FileList, folderIdArg?: string | null) => {
    const folderId = folderIdArg !== undefined ? folderIdArg : currentFolderId;
    const list = Array.from(files);
    const preservePaths = list.some((f) => !!(f as File & { webkitRelativePath?: string }).webkitRelativePath);
    setItems((prev) => [...prev, ...list.map((f) => ({ name: f.name, pct: 0, done: false }))]);
    await mut.uploadFiles(list, folderId, (name, pct) => {
      setItems((prev) => prev.map((it) => it.name === name ? { ...it, pct, done: pct >= 100 } : it));
    }, preservePaths);
  };

  return (
    <DriveCtx.Provider value={{ uploadRef, uploadFolderRef, onUpload, search, setSearch, tagFilter, setTagFilter }}>
      <div className="-m-4 md:-m-8 flex flex-col min-h-[calc(100vh-4rem)]">
        <div className="flex items-center gap-2 px-4 md:px-6 py-3 border-b border-border bg-background/80 backdrop-blur sticky top-16 z-10 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-2 shadow-[var(--shadow-glow)]">
                <Plus className="size-4" /> Novo
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => setNewFolder(true)}>
                <FolderPlus className="size-4 mr-2" /> Nova pasta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => uploadRef.current?.click()}>
                <Upload className="size-4 mr-2" /> Carregar ficheiros
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => uploadFolderRef.current?.click()}>
                <Upload className="size-4 mr-2" /> Carregar pasta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <nav className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((t) => {
              const active = t.match(pathname);
              return (
                <Link
                  key={t.url}
                  to={t.url}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition whitespace-nowrap",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                  )}
                >
                  <t.icon className="size-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto">
            <StorageBar />
          </div>
        </div>


        <div className="flex-1 flex flex-col min-h-0">
          <Outlet />
        </div>
      </div>

      <UploadProgress items={items} onClose={() => setItems([])} />
      <RenameDialog
        open={newFolder}
        title="Nova pasta"
        initial="Sem título"
        confirmLabel="Criar"
        onCancel={() => setNewFolder(false)}
        onConfirm={(name) => {
          mut.createFolder.mutate({ name, parentId: currentFolderId });
          setNewFolder(false);
        }}
      />
    </DriveCtx.Provider>
  );
}
