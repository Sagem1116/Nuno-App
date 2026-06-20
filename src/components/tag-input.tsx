import { useMemo, useState, type KeyboardEvent } from "react";
import { X, Plus } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  max?: number;
}

export function TagInput({ value, onChange, suggestions = [], placeholder = "Adicionar tag e premir Enter", max = 30 }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (value.includes(t)) { setDraft(""); return; }
    if (value.length >= max) return;
    onChange([...value, t]);
    setDraft("");
  };

  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      remove(value[value.length - 1]);
    }
  };

  const available = useMemo(() => {
    const q = draft.trim().toLowerCase();
    const list = suggestions.filter((s) => !value.includes(s));
    const filtered = q ? list.filter((s) => s.toLowerCase().includes(q)) : list;
    return filtered.slice(0, 20);
  }, [suggestions, value, draft]);

  return (
    <div className="space-y-2">
      <div className="w-full px-2 py-1.5 rounded-lg bg-input border border-border focus-within:border-primary focus-within:shadow-glow transition-all flex flex-wrap gap-1.5 items-center">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/40">
            {t}
            <button type="button" onClick={() => remove(t)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => draft && add(draft)}
          placeholder={value.length === 0 ? placeholder : "Procurar ou adicionar tag..."}
          className="flex-1 min-w-[140px] bg-transparent px-1 py-1 text-sm focus:outline-none"
        />
      </div>
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground self-center mr-1">{draft.trim() ? "Resultados:" : "Existentes:"}</span>
          {available.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-transparent text-muted-foreground border border-border hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Plus className="h-3 w-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
