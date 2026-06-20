import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Bold, Palette, Type, Undo2, Redo2, Search, ChevronUp, ChevronDown, X } from "lucide-react";
import DOMPurify, { type Config } from "dompurify";

const COLORS = [
  { name: "Padrão", value: "" },
  { name: "Laranja", value: "#ff7a18" },
  { name: "Verde", value: "#34d399" },
  { name: "Azul", value: "#60a5fa" },
  { name: "Rosa", value: "#f472b6" },
  { name: "Vermelho", value: "#f87171" },
  { name: "Amarelo", value: "#fbbf24" },
];

const ALLOWED: Config = {
  ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "br", "div", "p", "span", "font"],
  ALLOWED_ATTR: ["style", "color", "size"],
};

export function sanitizeNote(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, ALLOWED) as string;
}

export interface RichNoteEditorHandle {
  focus: () => void;
  undo: () => void;
  redo: () => void;
  selectTextRange: (start: number, end: number) => void;
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
}

export const RichNoteEditor = forwardRef<RichNoteEditorHandle, Props>(function RichNoteEditor(
  { value, onChange, className, autoFocus, placeholder },
  forwardedRef,
) {
  const ref = useRef<HTMLDivElement>(null);
  const lastSetValue = useRef("");

  useEffect(() => {
    if (ref.current && value !== lastSetValue.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = sanitizeNote(value || "");
      lastSetValue.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);

  const exec = (cmd: string, val?: string) => {
    ref.current?.focus();
    try {
      document.execCommand(cmd, false, val);
    } catch {
      return;
    }
    handleInput();
  };

  const handleInput = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastSetValue.current = html;
    onChange(html);
  };

  useImperativeHandle(forwardedRef, () => ({
    focus: () => ref.current?.focus(),
    undo: () => exec("undo"),
    redo: () => exec("redo"),
    selectTextRange: (start, end) => {
      if (!ref.current) return;
      const walker = document.createTreeWalker(ref.current, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let startNode: Node | null = null;
      let endNode: Node | null = null;
      let startOffset = 0;
      let endOffset = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const length = node.textContent?.length ?? 0;
        if (!startNode && start <= offset + length) {
          startNode = node;
          startOffset = Math.max(0, start - offset);
        }
        if (end <= offset + length) {
          endNode = node;
          endOffset = Math.max(0, end - offset);
          break;
        }
        offset += length;
      }
      if (!startNode || !endNode) return;
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      ref.current.focus();
    },
  }));

  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);

  const plainText = useMemo(() => {
    if (typeof window === "undefined") return "";
    const div = document.createElement("div");
    div.innerHTML = (value || "").replace(/<br\s*\/?>(?!\n)/gi, "\n").replace(/<\/(p|div)>/gi, "\n");
    return (div.textContent || "").toLowerCase();
  }, [value]);

  const matches = useMemo(() => {
    if (!findQuery) return [] as number[];
    const out: number[] = [];
    const needle = findQuery.toLowerCase();
    let i = 0;
    while ((i = plainText.indexOf(needle, i)) !== -1) { out.push(i); i += Math.max(needle.length, 1); }
    return out;
  }, [plainText, findQuery]);

  useEffect(() => { setFindIndex(0); }, [findQuery]);

  const gotoMatch = (idx: number) => {
    if (!matches.length || !ref.current) return;
    const safe = ((idx % matches.length) + matches.length) % matches.length;
    setFindIndex(safe);
    const start = matches[safe];
    const end = start + findQuery.length;
    const walker = document.createTreeWalker(ref.current, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let startNode: Node | null = null;
    let endNode: Node | null = null;
    let startOffset = 0;
    let endOffset = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const length = node.textContent?.length ?? 0;
      if (!startNode && start <= offset + length) {
        startNode = node;
        startOffset = Math.max(0, start - offset);
      }
      if (end <= offset + length) {
        endNode = node;
        endOffset = Math.max(0, end - offset);
        break;
      }
      offset += length;
    }
    if (!startNode || !endNode) return;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    ref.current.focus();
    // Scroll match into view
    const rect = range.getBoundingClientRect();
    const containerRect = ref.current.getBoundingClientRect();
    if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
      ref.current.scrollTop += rect.top - containerRect.top - 40;
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-1 px-2 py-1 bg-[#2d2d2d] border-b border-black/40 text-xs text-neutral-300 flex-wrap">
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); exec("undo"); }}
          className="inline-flex items-center px-2 py-1 rounded hover:bg-white/10"
          title="Anular (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); exec("redo"); }}
          className="inline-flex items-center px-2 py-1 rounded hover:bg-white/10"
          title="Refazer (Ctrl+Y)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-white/15" />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10"
          title="Negrito (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" /> Negrito
        </button>
        <span className="mx-1 h-4 w-px bg-white/15" />
        <label className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10" title="Tamanho da letra">
          <Type className="h-3.5 w-3.5" />
          <select
            defaultValue="3"
            onChange={(e) => exec("fontSize", e.target.value)}
            className="bg-transparent text-xs focus:outline-none"
            aria-label="Tamanho da letra"
          >
            <option value="2">Pequena</option>
            <option value="3">Normal</option>
            <option value="4">Grande</option>
            <option value="5">Muito grande</option>
          </select>
        </label>
        <span className="mx-1 h-4 w-px bg-white/15" />
        <div className="relative group">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10"
            title="Cor do texto"
          >
            <Palette className="h-3.5 w-3.5" /> Cor
          </button>
          <div className="absolute left-0 top-full mt-1 hidden group-hover:flex flex-wrap gap-1 p-2 bg-[#2d2d2d] border border-black/40 rounded shadow-lg z-10 w-44">
            {COLORS.map((c) => (
              <button
                key={c.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  exec("foreColor", c.value || "inherit");
                }}
                className="h-6 w-6 rounded border border-white/20 hover:scale-110 transition-transform"
                style={{ background: c.value || "transparent" }}
                title={c.name}
              />
            ))}
          </div>
        </div>
        <span className="mx-1 h-4 w-px bg-white/15" />
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setFindOpen((v) => !v); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10"
          title="Procurar (Ctrl+F)"
        >
          <Search className="h-3.5 w-3.5" /> Procurar
        </button>
      </div>
      {findOpen && (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-[#252526] border-b border-black/40">
          <Search className="h-3.5 w-3.5 text-neutral-400" />
          <input
            autoFocus
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); gotoMatch(findIndex + (e.shiftKey ? -1 : 1)); }
              else if (e.key === "Escape") { e.preventDefault(); setFindOpen(false); ref.current?.focus(); }
            }}
            placeholder="Procurar palavra ou caracteres..."
            className="flex-1 bg-transparent text-xs text-neutral-100 focus:outline-none"
          />
          <span className="text-[11px] text-neutral-400 tabular-nums">
            {matches.length ? `${findIndex + 1}/${matches.length}` : "0/0"}
          </span>
          <button type="button" onClick={() => gotoMatch(findIndex - 1)} disabled={!matches.length} className="p-1 hover:bg-white/10 rounded text-neutral-300 disabled:opacity-30" title="Anterior (Shift+Enter)">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => gotoMatch(findIndex + 1)} disabled={!matches.length} className="p-1 hover:bg-white/10 rounded text-neutral-300 disabled:opacity-30" title="Próximo (Enter)">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => setFindOpen(false)} className="p-1 hover:bg-white/10 rounded text-neutral-300" title="Fechar (Esc)">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
            e.preventDefault();
            setFindOpen(true);
          }
        }}
        data-placeholder={placeholder}
        className="flex-1 w-full p-4 bg-[#1e1e1e] text-neutral-100 font-mono text-sm leading-relaxed whitespace-pre-wrap focus:outline-none overflow-auto min-h-[200px] empty:before:content-[attr(data-placeholder)] empty:before:text-neutral-500"
        style={{ fontFamily: 'Consolas, "Courier New", monospace' }}
      />
    </div>
  );
});
