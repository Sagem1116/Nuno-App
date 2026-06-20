import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Loader2 } from "lucide-react";
import { FileRow, fileKind, getSignedUrl, downloadFile, formatBytes } from "@/lib/drive";
import { format } from "date-fns";

export function FilePreview({ file, onClose }: { file: FileRow | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!file) { setUrl(null); return; }
    setLoading(true);
    getSignedUrl(file.storage_path, 300).then((u) => { setUrl(u); setLoading(false); }).catch(() => setLoading(false));
  }, [file]);

  if (!file) return null;
  const kind = fileKind(file.mime_type, file.extension);

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="min-w-0">
            <div className="font-medium truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground">
              {formatBytes(file.size_bytes)} · {format(new Date(file.updated_at), "dd MMM yyyy HH:mm")}
            </div>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={() => downloadFile(file)}><Download className="size-4" /></Button>
            <Button size="icon" variant="ghost" onClick={onClose}><X className="size-4" /></Button>
          </div>
        </div>
        <div className="bg-background min-h-[60vh] flex items-center justify-center p-4">
          {loading && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
          {!loading && url && kind === "image" && (
            <img src={url} alt={file.name} className="max-w-full max-h-[70vh] object-contain rounded" />
          )}
          {!loading && url && kind === "video" && (
            <video src={url} controls className="max-w-full max-h-[70vh] rounded" />
          )}
          {!loading && url && kind === "audio" && <audio src={url} controls />}
          {!loading && url && kind === "pdf" && (
            <iframe src={url} className="w-full h-[70vh] rounded bg-card" title={file.name} />
          )}
          {!loading && url && !["image","video","audio","pdf"].includes(kind) && (
            <div className="text-center text-muted-foreground">
              <p>Pré-visualização não disponível para este tipo.</p>
              <Button className="mt-3" onClick={() => downloadFile(file)}><Download className="size-4 mr-2" /> Transferir</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
