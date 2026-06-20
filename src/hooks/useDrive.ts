import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BUCKET, FileRow, FolderRow, getCurrentUserId, getExtension, uploadFileToStorage } from "@/lib/drive";
import { toast } from "sonner";

const FOLDERS_KEY = ["folders"];
const FILES_KEY = ["files"];
const FAVS_KEY = ["favorites"];

export function useFolders() {
  return useQuery({
    queryKey: FOLDERS_KEY,
    queryFn: async (): Promise<FolderRow[]> => {
      const { data, error } = await supabase.from("folders").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as FolderRow[];
    },
  });
}

export function useFiles() {
  return useQuery({
    queryKey: FILES_KEY,
    queryFn: async (): Promise<FileRow[]> => {
      const { data, error } = await supabase.from("files").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FileRow[];
    },
  });
}

export function useFavorites() {
  return useQuery({
    queryKey: FAVS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("favorites").select("file_id, folder_id");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDriveMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: FOLDERS_KEY });
    qc.invalidateQueries({ queryKey: FILES_KEY });
    qc.invalidateQueries({ queryKey: FAVS_KEY });
  };

  const createFolder = useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId: string | null }) => {
      const uid = await getCurrentUserId();
      const { error } = await supabase.from("folders").insert({ user_id: uid, name, parent_id: parentId });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Pasta criada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: async ({ kind, id, name }: { kind: "file" | "folder"; id: string; name: string }) => {
      const table = kind === "file" ? "files" : "folders";
      const { error } = await supabase.from(table).update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Renomeado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const trash = useMutation({
    mutationFn: async ({ kind, id }: { kind: "file" | "folder"; id: string }) => {
      const table = kind === "file" ? "files" : "folders";
      const { error } = await supabase.from(table).update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Movido para a reciclagem"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const restore = useMutation({
    mutationFn: async ({ kind, id }: { kind: "file" | "folder"; id: string }) => {
      const table = kind === "file" ? "files" : "folders";
      const { error } = await supabase.from(table).update({ is_trashed: false, trashed_at: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Restaurado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async ({ kind, id, storagePath }: { kind: "file" | "folder"; id: string; storagePath?: string }) => {
      if (kind === "file" && storagePath) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
      }
      const table = kind === "file" ? "files" : "folders";
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Eliminado permanentemente"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ kind, id, targetFolderId }: { kind: "file" | "folder"; id: string; targetFolderId: string | null }) => {
      if (kind === "file") {
        const { error } = await supabase.from("files").update({ folder_id: targetFolderId }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("folders").update({ parent_id: targetFolderId }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidate(); toast.success("Movido"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFavorite = useMutation({
    mutationFn: async ({ kind, id, on }: { kind: "file" | "folder"; id: string; on: boolean }) => {
      const uid = await getCurrentUserId();
      if (on) {
        const row: { user_id: string; file_id: string | null; folder_id: string | null } =
          kind === "file"
            ? { user_id: uid, file_id: id, folder_id: null }
            : { user_id: uid, folder_id: id, file_id: null };
        const { error } = await supabase.from("favorites").insert(row);
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const col = kind === "file" ? "file_id" : "folder_id";
        const { error } = await supabase.from("favorites").delete().eq(col, id);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: FAVS_KEY }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadFiles = async (
    files: File[],
    folderId: string | null,
    onItemProgress: (name: string, pct: number) => void,
    preservePaths = false,
  ) => {
    const uid = await getCurrentUserId();
    const folderCache = new Map<string, string | null>();
    folderCache.set("", folderId);

    const ensureFolder = async (relDir: string): Promise<string | null> => {
      if (folderCache.has(relDir)) return folderCache.get(relDir)!;
      const parts = relDir.split("/");
      const name = parts[parts.length - 1];
      const parentRel = parts.slice(0, -1).join("/");
      const parentId = await ensureFolder(parentRel);
      const { data, error } = await supabase
        .from("folders")
        .insert({ user_id: uid, name, parent_id: parentId })
        .select("id")
        .single();
      if (error) throw error;
      folderCache.set(relDir, data.id);
      return data.id;
    };

    for (const file of files) {
      try {
        let parentId = folderId;
        if (preservePaths) {
          const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
          if (rel && rel.includes("/")) {
            const dir = rel.split("/").slice(0, -1).join("/");
            parentId = await ensureFolder(dir);
          }
        }
        const { path } = await uploadFileToStorage(uid, file, (p) => onItemProgress(file.name, p));
        const ext = getExtension(file.name);
        const { error } = await supabase.from("files").insert({
          user_id: uid,
          folder_id: parentId,
          name: file.name,
          mime_type: file.type || null,
          extension: ext || null,
          size_bytes: file.size,
          storage_path: path,
        });
        if (error) throw error;
      } catch (e) {
        toast.error(`Falha ao carregar ${file.name}: ${(e as Error).message}`);
      }
    }
    invalidate();
  };

  const bulkTrash = useMutation({
    mutationFn: async (items: { kind: "file" | "folder"; id: string }[]) => {
      const now = new Date().toISOString();
      const fileIds = items.filter((i) => i.kind === "file").map((i) => i.id);
      const folderIds = items.filter((i) => i.kind === "folder").map((i) => i.id);
      if (fileIds.length) {
        const { error } = await supabase.from("files").update({ is_trashed: true, trashed_at: now }).in("id", fileIds);
        if (error) throw error;
      }
      if (folderIds.length) {
        const { error } = await supabase.from("folders").update({ is_trashed: true, trashed_at: now }).in("id", folderIds);
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidate(); toast.success("Itens movidos para a reciclagem"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkRemove = useMutation({
    mutationFn: async (items: { kind: "file" | "folder"; id: string; storagePath?: string }[]) => {
      const paths = items.filter((i) => i.kind === "file" && i.storagePath).map((i) => i.storagePath!);
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      const fileIds = items.filter((i) => i.kind === "file").map((i) => i.id);
      const folderIds = items.filter((i) => i.kind === "folder").map((i) => i.id);
      if (fileIds.length) {
        const { error } = await supabase.from("files").delete().in("id", fileIds);
        if (error) throw error;
      }
      if (folderIds.length) {
        const { error } = await supabase.from("folders").delete().in("id", folderIds);
        if (error) throw error;
      }
    },
    onSuccess: () => { invalidate(); toast.success("Itens eliminados"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { createFolder, rename, trash, restore, remove, move, toggleFavorite, uploadFiles, bulkTrash, bulkRemove };
}
