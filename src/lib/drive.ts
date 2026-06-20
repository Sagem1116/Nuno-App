import { supabase } from "@/integrations/supabase/client";

export type FileRow = {
  id: string;
  user_id: string;
  folder_id: string | null;
  name: string;
  mime_type: string | null;
  extension: string | null;
  size_bytes: number;
  storage_path: string;
  is_trashed: boolean;
  trashed_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FolderRow = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  is_trashed: boolean;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const BUCKET = "user-files";

export function getExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), u.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export async function getCurrentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("No user");
  return data.user.id;
}

export async function uploadFileToStorage(
  userId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ path: string }> {
  const id = crypto.randomUUID();
  const ext = getExtension(file.name);
  const path = `${userId}/${id}${ext ? "." + ext : ""}`;
  onProgress?.(10);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  onProgress?.(100);
  return { path };
}

export async function downloadFile(file: FileRow) {
  // Baixar como Blob para garantir que o atributo `download` é respeitado
  // (browsers ignoram-no em URLs cross-origin como as da Storage).
  const { data, error } = await supabase.storage.from(BUCKET).download(file.storage_path);
  if (error || !data) throw error ?? new Error("Falha ao transferir o ficheiro");
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function getSignedUrl(path: string, expiresIn = 60): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error || !data) throw error ?? new Error("No signed url");
  return data.signedUrl;
}

export function fileKind(mime: string | null, ext: string | null): string {
  const m = mime ?? "";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (["doc", "docx", "odt"].includes(ext ?? "")) return "doc";
  if (["xls", "xlsx", "csv"].includes(ext ?? "")) return "sheet";
  if (["ppt", "pptx"].includes(ext ?? "")) return "slides";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext ?? "")) return "archive";
  if (m.startsWith("text/") || ["md", "txt", "json", "xml", "yml", "yaml"].includes(ext ?? "")) return "text";
  return "file";
}
