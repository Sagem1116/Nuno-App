import { useEffect, useMemo, useRef, useState } from "react";
import { X, Save, Pencil, FileText, Undo2, Redo2, Search, ChevronUp, ChevronDown } from "lucide-react";
import { RichNoteEditor, type RichNoteEditorHandle } from "@/components/rich-note-editor";

interface NotepadViewerProps {
  title: string;
  initialContent: string;
  onClose: () => void;
  onSave: (content: string) => Promise<void> | void;
  onEditMeta?: () => void;
}

function htmlToPlain(s: string): string {
  if (!s) return "";
  if (!/<[a-z!/][\s\S]*>/i.test(s)) return s;
  if (typeof window === "undefined") return s.replace(/<[^>]+>/g, "");
  const tmp = document.createElement("div");
  tmp.innerHTML = s
    .replace(/<br\s*\/?>(?!\n)/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n");
  return (tmp.textContent || tmp.innerText || "").trim();
}

export function NotepadViewer({ title, initialContent, onClose, onSave, onEditMeta }: NotepadViewerProps) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const ref = useRef<RichNoteEditorHandle>(null);

  const matches = useMemo(() => {
    if (!findQuery) return [] as number[];
    const out: number[] = [];
    const hay = htmlToPlain(content).toLowerCase();
    const needle = findQuery.toLowerCase();
    let i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) { out.push(i); i += Math.max(needle.length, 1); }
    return out;
  }, [content, findQuery]);

  useEffect(() => { setFindIndex(0); }, [findQuery]);

  const gotoMatch = (idx: number) => {
    if (!matches.length || !ref.current) return;
    const safe = ((idx % matches.length) + matches.length) % matches.length;
    setFindIndex(safe);
    const start = matches[safe];
    const end = start + findQuery.length;
    ref.current.selectTextRange(start, end);
  };


  useEffect(() => {
    setContent(initialContent);
    setSaved(true);
  }, [initialContent]);

  useEffect(() => {
    setSaved(content === initialContent);
  }, [content, initialContent]);

  const save = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      await onSave(content);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const tryClose = () => {
    if (saved) onClose();
    else setConfirmClose(true);
  };

  const saveAndClose = async () => {
    try {
      setSaving(true);
      await onSave(content);
      setSaved(true);
      setConfirmClose(false);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
      } else if (e.key === "Escape") {
        if (findOpen) { setFindOpen(false); return; }
        tryClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, saved, saving, findOpen]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4">
      <div className="w-full max-w-3xl h-[80vh] rounded-lg overflow-hidden border border-border shadow-2xl flex flex-col bg-[#1e1e1e]">
        <div className="flex items-center justify-between bg-gradient-to-r from-primary/80 to-primary-glow/70 text-primary-foreground px-3 py-1.5 select-none">
          <div className="flex items-center gap-2 text-sm font-medium truncate">
            <FileText className="h-4 w-4" />
            <span className="truncate">{title || "Sem título"}{!saved && " •"} — Bloco de notas</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => ref.current?.undo()} className="px-2 py-0.5 hover:bg-white/20 rounded-sm text-xs" title="Anular (Ctrl+Z)">
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => ref.current?.redo()} className="px-2 py-0.5 hover:bg-white/20 rounded-sm text-xs" title="Refazer (Ctrl+Y)">
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setFindOpen((v) => !v)} className="px-2 py-0.5 hover:bg-white/20 rounded-sm text-xs" title="Procurar (Ctrl+F)">
              <Search className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={save}
              disabled={saving || saved}
              className="px-2 py-0.5 hover:bg-white/20 rounded-sm disabled:opacity-40 text-xs inline-flex items-center gap-1"
              title="Guardar (Ctrl+S)"
            >
              <Save className="h-3.5 w-3.5" /> {saving ? "..." : saved ? "Guardado" : "Guardar"}
            </button>
            {onEditMeta && (
              <button onClick={onEditMeta} className="px-2 py-0.5 hover:bg-white/20 rounded-sm" title="Editar título / tags">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={tryClose} className="px-2 py-0.5 hover:bg-destructive/80 rounded-sm" title="Fechar (Esc)">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {findOpen && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#252526] border-b border-black/40">
            <Search className="h-3.5 w-3.5 text-neutral-400" />
            <input
              autoFocus
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  gotoMatch(findIndex + (e.shiftKey ? -1 : 1));
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setFindOpen(false);
                  ref.current?.focus();
                }
              }}
              placeholder="Procurar na nota..."
              className="flex-1 bg-transparent text-sm text-neutral-100 focus:outline-none"
            />
            <span className="text-[11px] text-neutral-400 tabular-nums">
              {matches.length ? `${findIndex + 1}/${matches.length}` : "0/0"}
            </span>
            <button onClick={() => gotoMatch(findIndex - 1)} disabled={!matches.length} className="p-1 hover:bg-white/10 rounded text-neutral-300 disabled:opacity-30" title="Anterior (Shift+Enter)">
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => gotoMatch(findIndex + 1)} disabled={!matches.length} className="p-1 hover:bg-white/10 rounded text-neutral-300 disabled:opacity-30" title="Próximo (Enter)">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setFindOpen(false)} className="p-1 hover:bg-white/10 rounded text-neutral-300" title="Fechar (Esc)">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <RichNoteEditor
          ref={ref}
          value={content}
          onChange={setContent}
          autoFocus
          placeholder="Escreve a tua nota..."
          className="flex flex-1 min-h-0 flex-col"
        />

        <div className="px-3 py-1 text-[10px] text-neutral-400 bg-[#2d2d2d] border-t border-black/40 flex justify-between">
          <span>{saved ? "Pronto" : "Alterações não guardadas"}</span>
          <span>UTF-8 · Ctrl+Z anular · Ctrl+Y refazer · Ctrl+S guardar</span>
        </div>
      </div>

      {confirmClose && (
        <div className="fixed inset-0 z-[60] bg-black/70 grid place-items-center p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-primary/80 to-primary-glow/70 text-primary-foreground px-3 py-1.5 text-sm font-medium">
              Bloco de notas
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm">
                Pretendes guardar as alterações em <span className="font-medium">{title || "Sem título"}</span>?
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmClose(false)} className="px-3 py-1.5 rounded text-sm border border-border hover:bg-accent">Cancelar</button>
                <button onClick={() => { setConfirmClose(false); onClose(); }} className="px-3 py-1.5 rounded text-sm border border-destructive/60 text-destructive hover:bg-destructive/10">Descartar</button>
                <button onClick={saveAndClose} disabled={saving} className="px-3 py-1.5 rounded text-sm bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:shadow-glow-strong disabled:opacity-50">
                  {saving ? "A guardar..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
