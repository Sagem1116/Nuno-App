import { FileText, Image as ImageIcon, FileVideo, FileAudio, FileArchive, FileSpreadsheet, Presentation, FileCode, File as FileIcn } from "lucide-react";
import { fileKind } from "@/lib/drive";
import { cn } from "@/lib/utils";

export function FileIcon({ mime, ext, className }: { mime: string | null; ext: string | null; className?: string }) {
  const kind = fileKind(mime, ext);
  const map: Record<string, { Icon: typeof FileIcn; color: string }> = {
    image:   { Icon: ImageIcon,       color: "text-emerald-400" },
    video:   { Icon: FileVideo,       color: "text-rose-400" },
    audio:   { Icon: FileAudio,       color: "text-purple-400" },
    pdf:     { Icon: FileText,        color: "text-red-400" },
    doc:     { Icon: FileText,        color: "text-blue-400" },
    sheet:   { Icon: FileSpreadsheet, color: "text-green-400" },
    slides:  { Icon: Presentation,    color: "text-orange-400" },
    archive: { Icon: FileArchive,     color: "text-amber-400" },
    text:    { Icon: FileCode,        color: "text-sky-400" },
    file:    { Icon: FileIcn,         color: "text-muted-foreground" },
  };
  const { Icon, color } = map[kind] ?? map.file;
  return <Icon className={cn(color, className)} />;
}
