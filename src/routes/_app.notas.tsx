import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Plus, Search, Trash2, Pencil, X, StickyNote, Tag,
  LayoutGrid, List as ListIcon, ArrowUpDown, ChevronLeft, ChevronRight, Settings2,
  Download, Upload, Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { TagInput } from "@/components/tag-input";
import { NotepadViewer } from "@/components/notepad-viewer";
import { RichNoteEditor } from "@/components/rich-note-editor";
// Strip HTML tags from any legacy rich-text content so notes display as plain text
const stripHtml = (s: string): string => {
  if (!s) return "";
  if (!/<[a-z!/][\s\S]*>/i.test(s)) return s;
  return s
    .replace(/<br\s*\/?>(?!\n)/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
};
import { exportTable, importTable } from "@/lib/data-io";
import { AutoExportMenu } from "@/components/auto-export-menu";

export const Route = createFileRoute("/_app/notas")({
  component: NotesPage,
});

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  is_favorite: boolean;
}

function NotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("notes:viewMode") as ViewMode) || "grid";
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("notes:viewMode", viewMode);
  }, [viewMode]);
  const [sortBy, setSortBy] = useState<SortBy>("created_desc");
  const [page, setPage] = useState(1);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [viewing, setViewing] = useState<Note | null>(null);
  const [tab, setTab] = useState<"all" | "favorites">("all");
  const pageSize = 12;

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notes")
      .select("*")
      .order("created_at", { ascending: false });
    setNotes((data as Note[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => s.add(t)));
    return Array.from(s);
  }, [notes]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = notes.filter((n) => {
      if (tab === "favorites" && !n.is_favorite) return false;
      if (activeTags.length > 0 && !activeTags.every((t) => n.tags.includes(t))) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
    return sortItems(list, sortBy);
  }, [notes, search, activeTags, sortBy, tab]);

  useEffect(() => { setPage(1); }, [search, activeTags, sortBy, tab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const remove = async (id: string) => {
    if (!confirm("Eliminar esta nota?")) return;
    await supabase.from("notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const toggleFavorite = async (n: Note) => {
    const next = !n.is_favorite;
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_favorite: next } : x)));
    await (supabase as any).from("notes").update({ is_favorite: next }).eq("id", n.id);
  };

  const startNew = () => { setEditing(null); setOpen(true); };
  const startEdit = (n: Note) => { setEditing(n); setOpen(true); };
  const openViewer = (n: Note) => setViewing(n);

  const saveContent = async (id: string, content: string) => {
    const { data: upd } = await supabase
      .from("notes").update({ content }).eq("id", id).select().single();
    if (upd) {
      setNotes((prev) => prev.map((n) => (n.id === id ? (upd as Note) : n)));
      setViewing((v) => (v && v.id === id ? (upd as Note) : v));
    }
  };

  const exportAll = async () => {
    const [{ data: notesData, error: notesError }, { data: linksData, error: linksError }] = await Promise.all([
      supabase.from("notes").select("*").order("created_at", { ascending: false }),
      supabase.from("links").select("*").order("created_at", { ascending: false }),
    ]);

    if (notesError || linksError) {
      console.error("Failed to export notes or links:", notesError || linksError);
      return;
    }

    const text = buildExportText(notesData as Note[] ?? [], linksData as any[] ?? []);
    downloadTextFile(`notas-links-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`, text);
  };

  const exportNote = (note: Note) => {
    const text = buildNoteExportText(note);
    const safeTitle = note.title.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 50) || "nota";
    downloadTextFile(`nota-${safeTitle}-${new Date(note.created_at).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`, text);
  };

  const handleSave = async (data: { title: string; content: string; tags: string[] }) => {
    if (!user) return;
    if (editing) {
      const { data: upd } = await supabase
        .from("notes").update(data).eq("id", editing.id).select().single();
      if (upd) setNotes((prev) => prev.map((n) => (n.id === editing.id ? (upd as Note) : n)));
    } else {
      const { data: ins } = await supabase
        .from("notes").insert({ ...data, user_id: user.id }).select().single();
      if (ins) setNotes((prev) => [ins as Note, ...prev]);
    }
    setOpen(false);
  };

  return (
    <div className="page-enter space-y-6">
      <Toolbar
        search={search}
        onSearch={setSearch}
        tags={allTags}
        activeTags={activeTags}
        onTagsChange={setActiveTags}
        onNew={startNew}
        newLabel="Nova nota"
        viewMode={viewMode}
        onViewMode={setViewMode}
        sortBy={sortBy}
        onSortBy={setSortBy}
        onManageTags={() => setTagManagerOpen(true)}
        onExport={exportAll}
        onExportJson={() => exportTable("notes")}
        onImportJson={async () => { if (user) { await importTable("notes", user.id); await load(); } }}
        autoExportTable="notes"
        autoExportLabel="Notas"
      />

      <FavoritesTabs
        tab={tab}
        onTab={setTab}
        allCount={notes.length}
        favCount={notes.filter((n) => n.is_favorite).length}
      />



      {loading ? (
        <div className="text-muted-foreground text-sm">A carregar...</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={StickyNote} label="Sem notas ainda" />
      ) : viewMode === "list" ? (
        <div className="glass-card divide-y divide-border">
          {paged.map((n) => (
            <div key={n.id} className="w-full px-4 py-3 hover:bg-accent/40 transition-colors flex items-center gap-3">
              <button type="button" onClick={() => openViewer(n)} className="flex-1 min-w-0 text-left" title="Abrir no bloco de notas">
                <div className="flex items-start gap-3 min-w-0">
                  <StickyNote className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{n.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{stripHtml(n.content) || "—"}</div>
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <span className="hidden sm:inline text-[10px] text-muted-foreground/70 uppercase">
                  {new Date(n.created_at).toLocaleDateString("pt-PT")}
                </span>
                <button onClick={() => toggleFavorite(n)} className="p-1.5 rounded hover:bg-accent" title={n.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
                  <Star className={`h-3.5 w-3.5 ${n.is_favorite ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                </button>
                <button onClick={() => exportNote(n)} className="p-1.5 rounded hover:bg-accent hover:text-primary" title="Exportar esta nota">
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => startEdit(n)} className="p-1.5 rounded hover:bg-accent hover:text-primary" title="Editar título / tags">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => remove(n.id)} className="p-1.5 rounded hover:bg-destructive/20 hover:text-destructive" title="Eliminar esta nota">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paged.map((n) => (
            <article key={n.id} className="glass-card glass-card-hover p-5 flex flex-col gap-3">
              <header className="flex items-start justify-between gap-2">
                <button onClick={() => openViewer(n)} className="text-left flex-1 min-w-0" title="Abrir no bloco de notas">
                  <h3 className="font-semibold leading-tight hover:text-primary transition-colors">{n.title}</h3>
                </button>
                <div className="flex gap-1 opacity-60 hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleFavorite(n)} className="p-1.5 rounded hover:bg-accent" title={n.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
                    <Star className={`h-3.5 w-3.5 ${n.is_favorite ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </button>
                  <button onClick={() => exportNote(n)} className="p-1.5 rounded hover:bg-accent hover:text-primary" title="Exportar esta nota">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => startEdit(n)} className="p-1.5 rounded hover:bg-accent hover:text-primary" title="Editar título / tags">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(n.id)} className="p-1.5 rounded hover:bg-destructive/20 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </header>
              <button onClick={() => openViewer(n)} className="text-left">
                <div className="text-sm text-muted-foreground line-clamp-6 hover:text-foreground/80 transition-colors whitespace-pre-wrap">
                  {stripHtml(n.content)}
                </div>
              </button>

              {n.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {n.tags.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground border border-primary/30">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <time className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mt-auto">
                {new Date(n.created_at).toLocaleString("pt-PT")}
              </time>
            </article>
          ))}
        </div>
      )}

      {filtered.length > pageSize && (
        <Pagination page={page} totalPages={totalPages} onPage={setPage} total={filtered.length} />
      )}

      {open && (
        <NoteDialog
          initial={editing}
          allTags={allTags}
          onClose={() => setOpen(false)}
          onSave={handleSave}
        />
      )}

      {viewing && (
        <NotepadViewer
          title={viewing.title}
          initialContent={viewing.content}
          onSave={(c) => saveContent(viewing.id, c)}
          onClose={() => setViewing(null)}
          onEditMeta={() => { setEditing(viewing); setViewing(null); setOpen(true); }}
        />
      )}


      {tagManagerOpen && (
        <TagManagerDialog
          table="notes"
          allTags={allTags}
          counts={tagCounts(notes)}
          onClose={() => setTagManagerOpen(false)}
          onChanged={load}
        />
      )}

      {user && (
        <DangerZone
          title="Apagar todas as notas"
          description="Remove permanentemente todas as notas (incluindo favoritos e tags)."
          confirmText="APAGAR NOTAS"
          onConfirm={async () => {
            const n = await deleteAllForUser(supabase, user.id, ["notes"]);
            await load();
            return { count: n };
          }}
        />
      )}
    </div>
  );
}

function NoteDialog({
  initial,
  allTags,
  onClose,
  onSave,
}: {
  initial: Note | null;
  allTags: string[];
  onClose: () => void;
  onSave: (d: { title: string; content: string; tags: string[] }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    await onSave({ title: title.trim(), content, tags });
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
      <form onSubmit={submit} className="glass-card neon-border w-full max-w-lg p-6 page-enter flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold neon-text">
            {initial ? "Editar nota" : "Nova nota"}
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <Field label="Título">
            <input
              autoFocus value={title} maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
            />
          </Field>

          <div className="block">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Conteúdo</span>
            <div className="mt-1">
              <RichNoteEditor
                value={content}
                onChange={setContent}
                className="overflow-hidden rounded-lg border border-border"
                placeholder="Escreve a tua nota..."
              />
            </div>
          </div>

          <Field label="Tags">
            <TagInput value={tags} onChange={setTags} suggestions={allTags} placeholder="ideia, trabalho, urgente" />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-accent">
            Cancelar
          </button>
          <button
            type="submit" disabled={busy || !title.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:shadow-glow-strong disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

export const inputCls =
  "w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary focus:outline-none focus:shadow-glow transition-all text-sm";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function EmptyState({ icon: Icon, label }: { icon: typeof StickyNote; label: string }) {
  return (
    <div className="glass-card p-12 text-center">
      <Icon className="h-10 w-10 mx-auto text-primary/60 mb-3" />
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}

export function Toolbar({
  search, onSearch, tags, activeTags, onTagsChange, onNew, newLabel,
  viewMode, onViewMode, sortBy, onSortBy, onManageTags, onExport,
  onExportJson, onImportJson, autoExportTable, autoExportLabel,
}: {
  search: string;
  onSearch: (v: string) => void;
  tags: string[];
  activeTags: string[];
  onTagsChange: (t: string[]) => void;
  onNew: () => void;
  newLabel: string;
  viewMode?: ViewMode;
  onViewMode?: (m: ViewMode) => void;
  sortBy?: SortBy;
  onSortBy?: (s: SortBy) => void;
  onManageTags?: () => void;
  onExport?: () => void;
  onExportJson?: () => void;
  onImportJson?: () => void;
  autoExportTable?: import("@/lib/data-io").Table;
  autoExportLabel?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search} onChange={(e) => onSearch(e.target.value)}
            placeholder="Pesquisar..."
            className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-input border border-border focus:border-primary focus:outline-none focus:shadow-glow transition-all text-sm"
          />
        </div>
        {sortBy && onSortBy && (
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <select value={sortBy} onChange={(e) => onSortBy(e.target.value as SortBy)}
              className="appearance-none pl-9 pr-8 py-2.5 rounded-lg bg-input border border-border text-xs focus:border-primary focus:outline-none">
              <option value="created_desc">Mais recentes</option>
              <option value="created_asc">Mais antigos</option>
              <option value="title_asc">Título A→Z</option>
              <option value="title_desc">Título Z→A</option>
            </select>
          </div>
        )}
        {viewMode && onViewMode && (
          <div className="flex p-1 rounded-lg bg-input border border-border">
            <button onClick={() => onViewMode("grid")} title="Grelha"
              className={["p-1.5 rounded", viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"].join(" ")}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => onViewMode("list")} title="Lista"
              className={["p-1.5 rounded", viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"].join(" ")}>
              <ListIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        {onManageTags && (
          <button onClick={onManageTags}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50">
            <Settings2 className="h-3.5 w-3.5" /> Tags
          </button>
        )}
        {onExport && (
          <button onClick={onExport}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50">
            <Download className="h-3.5 w-3.5" /> Exportar .txt
          </button>
        )}
        {onExportJson && (
          <button onClick={onExportJson}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50">
            <Download className="h-3.5 w-3.5" /> Exportar JSON
          </button>
        )}
        {onImportJson && (
          <button onClick={onImportJson}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-input border border-border text-xs hover:border-primary/50">
            <Upload className="h-3.5 w-3.5" /> Importar JSON
          </button>
        )}
        {autoExportTable && (
          <AutoExportMenu table={autoExportTable} label={autoExportLabel} />
        )}
        <button
          onClick={onNew}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium text-sm hover:shadow-glow-strong transition-all"
        >
          <Plus className="h-4 w-4" />
          {newLabel}
        </button>
      </div>
      {tags.length > 0 && (
        <TagFilter tags={tags} activeTags={activeTags} onTagsChange={onTagsChange} />
      )}
    </div>
  );
}

function TagFilter({ tags, activeTags, onTagsChange }: { tags: string[]; activeTags: string[]; onTagsChange: (t: string[]) => void }) {
  const [q, setQ] = useState("");
  const filtered = q.trim()
    ? tags.filter((t) => t.toLowerCase().includes(q.trim().toLowerCase()))
    : tags;
  const toggle = (t: string) => {
    if (activeTags.includes(t)) onTagsChange(activeTags.filter((x) => x !== t));
    else onTagsChange([...activeTags, t]);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar tags..."
            className="w-full pl-7 pr-2 py-1 rounded-md bg-input border border-border text-xs focus:border-primary focus:outline-none"
          />
        </div>
        {activeTags.length > 0 && (
          <>
            <span className="text-[10px] text-muted-foreground">
              {activeTags.length} selec. (todas)
            </span>
            <button onClick={() => onTagsChange([])} className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary">
              Limpar
            </button>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        <button onClick={() => onTagsChange([])} className={chipCls(activeTags.length === 0)}>
          Todas
        </button>
        {filtered.map((t) => (
          <button key={t} onClick={() => toggle(t)} className={chipCls(activeTags.includes(t))}>
            {t}
          </button>
        ))}
        {filtered.length === 0 && (
          <span className="text-[11px] text-muted-foreground">Sem tags para "{q}"</span>
        )}
      </div>
    </div>
  );
}

function chipCls(active: boolean) {
  return [
    "text-xs px-2.5 py-1 rounded-full border transition-all",
    active
      ? "bg-primary text-primary-foreground border-primary shadow-glow"
      : "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
  ].join(" ");
}

// ====================== Shared list utilities ======================
export type ViewMode = "grid" | "list";
export type SortBy = "created_desc" | "created_asc" | "title_asc" | "title_desc";

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildNoteExportText(note: Note) {
  return [
    `Título: ${note.title}`,
    `Data: ${new Date(note.created_at).toLocaleString("pt-PT")}`,
    `Tags: ${note.tags.join(", ") || "-"}`,
    "",
    "Conteúdo:",
    note.content || "-",
  ].join("\n");
}

function buildExportText(notes: Note[], links: { title: string; url: string; description: string; tags: string[]; created_at: string; }[]) {
  const lines: string[] = [];
  lines.push("NOTAS\n====================\n");
  if (notes.length === 0) {
    lines.push("Sem notas guardadas.\n");
  } else {
    notes.forEach((note, index) => {
      lines.push(`Título: ${note.title}`);
      lines.push(`Data: ${new Date(note.created_at).toLocaleString("pt-PT")}`);
      lines.push(`Tags: ${note.tags.join(", ") || "-"}`);
      lines.push("Conteúdo:");
      lines.push(note.content || "-");
      if (index < notes.length - 1) lines.push("--------------------");
    });
    lines.push("");
  }

  lines.push("LINKS\n====================\n");
  if (links.length === 0) {
    lines.push("Sem links guardados.\n");
  } else {
    links.forEach((link, index) => {
      lines.push(`Título: ${link.title}`);
      lines.push(`URL: ${link.url}`);
      lines.push(`Data: ${new Date(link.created_at).toLocaleString("pt-PT")}`);
      lines.push(`Tags: ${link.tags.join(", ") || "-"}`);
      lines.push("Descrição:");
      lines.push(link.description || "-");
      if (index < links.length - 1) lines.push("--------------------");
    });
    lines.push("");
  }

  return lines.join("\n");
}

export function sortItems<T extends { title: string; created_at: string }>(items: T[], by: SortBy): T[] {
  const copy = [...items];
  switch (by) {
    case "created_asc": return copy.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case "title_asc":   return copy.sort((a, b) => a.title.localeCompare(b.title, "pt"));
    case "title_desc":  return copy.sort((a, b) => b.title.localeCompare(a.title, "pt"));
    case "created_desc":
    default:            return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

export function tagCounts(items: { tags: string[] }[]): Record<string, number> {
  const out: Record<string, number> = {};
  items.forEach((i) => i.tags.forEach((t) => { out[t] = (out[t] ?? 0) + 1; }));
  return out;
}

export function Pagination({ page, totalPages, onPage, total }: {
  page: number; totalPages: number; onPage: (p: number) => void; total: number;
}) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{total} resultados · pág. {page} de {totalPages}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}
          className="p-1.5 rounded border border-border hover:border-primary/50 disabled:opacity-40">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
          className="p-1.5 rounded border border-border hover:border-primary/50 disabled:opacity-40">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function TagManagerDialog({ table, allTags, counts, onClose, onChanged }: {
  table: "notes" | "links";
  allTags: string[];
  counts: Record<string, number>;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const renameTag = async (oldName: string) => {
    const next = prompt(`Renomear tag "${oldName}" para:`, oldName);
    if (!next || next.trim() === oldName) return;
    setBusy(oldName);
    const { data } = await (supabase as any).from(table).select("id,tags").contains("tags", [oldName]);
    for (const row of (data ?? [])) {
      const tags: string[] = (row.tags ?? []).map((t: string) => t === oldName ? next.trim() : t);
      const unique = Array.from(new Set(tags));
      await (supabase as any).from(table).update({ tags: unique }).eq("id", row.id);
    }
    setBusy(null);
    await onChanged();
  };

  const deleteTag = async (name: string) => {
    if (!confirm(`Remover a tag "${name}" de todos os itens?`)) return;
    setBusy(name);
    const { data } = await (supabase as any).from(table).select("id,tags").contains("tags", [name]);
    for (const row of (data ?? [])) {
      const tags: string[] = (row.tags ?? []).filter((t: string) => t !== name);
      await (supabase as any).from(table).update({ tags }).eq("id", row.id);
    }
    setBusy(null);
    await onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
      <div className="glass-card neon-border w-full max-w-md p-6 space-y-4 page-enter">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold neon-text">Gerir tags</h3>
          <button onClick={onClose} className="p-1 hover:text-primary"><X className="h-4 w-4" /></button>
        </div>
        {allTags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem tags ainda.</p>
        ) : (
          <ul className="space-y-1 max-h-[50vh] overflow-y-auto">
            {allTags.map((t) => (
              <li key={t} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-input/40 border border-border">
                <Tag className="h-3.5 w-3.5 text-primary" />
                <span className="flex-1 text-sm truncate">{t}</span>
                <span className="text-[10px] text-muted-foreground">{counts[t] ?? 0}</span>
                <button onClick={() => renameTag(t)} disabled={busy === t}
                  className="p-1.5 rounded hover:bg-accent hover:text-primary disabled:opacity-50">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => deleteTag(t)} disabled={busy === t}
                  className="p-1.5 rounded hover:bg-destructive/20 hover:text-destructive disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-accent">Fechar</button>
        </div>
      </div>
    </div>
  );
}

export function FavoritesTabs({
  tab, onTab, allCount, favCount,
}: {
  tab: "all" | "favorites";
  onTab: (t: "all" | "favorites") => void;
  allCount: number;
  favCount: number;
}) {
  const btn = (active: boolean) =>
    [
      "px-4 py-2 text-sm rounded-lg transition-all inline-flex items-center gap-2",
      active
        ? "bg-primary text-primary-foreground shadow-glow"
        : "bg-input border border-border text-muted-foreground hover:text-foreground hover:border-primary/50",
    ].join(" ");
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onTab("all")} className={btn(tab === "all")}>
        Todos <span className="text-[10px] opacity-70">({allCount})</span>
      </button>
      <button onClick={() => onTab("favorites")} className={btn(tab === "favorites")}>
        ★ Favoritos <span className="text-[10px] opacity-70">({favCount})</span>
      </button>
    </div>
  );
}
