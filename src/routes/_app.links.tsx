import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Trash2, Pencil, X, Link2, ExternalLink, Download, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Toolbar, EmptyState, Field, inputCls,
  Pagination, TagManagerDialog, sortItems, tagCounts, FavoritesTabs,
  type ViewMode, type SortBy,
} from "./_app.notas";
import { TagInput } from "@/components/tag-input";
import { exportTable, importTable } from "@/lib/data-io";
import { DangerZone, deleteAllForUser } from "@/components/danger-zone";

export const Route = createFileRoute("/_app/links")({
  component: LinksPage,
});

interface LinkRow {
  id: string;
  title: string;
  url: string;
  description: string;
  tags: string[];
  created_at: string;
  is_favorite: boolean;
}

function LinksPage() {
  const { user } = useAuth();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("links:viewMode") as ViewMode) || "grid";
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("links:viewMode", viewMode);
  }, [viewMode]);
  const [sortBy, setSortBy] = useState<SortBy>("created_desc");
  const [page, setPage] = useState(1);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "favorites">("all");
  const pageSize = 12;

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("links").select("*").order("created_at", { ascending: false });
    setLinks((data as LinkRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    links.forEach((l) => l.tags.forEach((t) => s.add(t)));
    return Array.from(s);
  }, [links]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = links.filter((l) => {
      if (tab === "favorites" && !l.is_favorite) return false;
      if (activeTags.length > 0 && !activeTags.every((t) => l.tags.includes(t))) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
    return sortItems(list, sortBy);
  }, [links, search, activeTags, sortBy, tab]);

  useEffect(() => { setPage(1); }, [search, activeTags, sortBy, tab]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const remove = async (id: string) => {
    if (!confirm("Eliminar este link?")) return;
    await supabase.from("links").delete().eq("id", id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const toggleFavorite = async (l: LinkRow) => {
    const next = !l.is_favorite;
    setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, is_favorite: next } : x)));
    await (supabase as any).from("links").update({ is_favorite: next }).eq("id", l.id);
  };


  const handleSave = async (data: { title: string; url: string; description: string; tags: string[] }) => {
    if (!user) return;
    if (editing) {
      const { data: upd } = await supabase.from("links").update(data).eq("id", editing.id).select().single();
      if (upd) setLinks((prev) => prev.map((l) => (l.id === editing.id ? (upd as LinkRow) : l)));
    } else {
      const { data: ins } = await supabase.from("links").insert({ ...data, user_id: user.id }).select().single();
      if (ins) setLinks((prev) => [ins as LinkRow, ...prev]);
    }
    setOpen(false);
  };

  const hostname = (u: string) => {
    try { return new URL(u).hostname.replace("www.", ""); } catch { return u; }
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

    const text = [
      "NOTAS\n====================\n",
      ...(notesData as any[] ?? []).map((note) => [
        `Título: ${note.title}`,
        `Data: ${new Date(note.created_at).toLocaleString("pt-PT")}`,
        `Tags: ${(note.tags ?? []).join(", ") || "-"}`,
        "Conteúdo:",
        note.content || "-",
        "--------------------",
      ]).flat(),
      "\nLINKS\n====================\n",
      ...(linksData as any[] ?? []).map((link) => [
        `Título: ${link.title}`,
        `URL: ${link.url}`,
        `Data: ${new Date(link.created_at).toLocaleString("pt-PT")}`,
        `Tags: ${(link.tags ?? []).join(", ") || "-"}`,
        "Descrição:",
        link.description || "-",
        "--------------------",
      ]).flat(),
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notas-links-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildLinkExportText = (link: LinkRow) => {
    return [
      `Título: ${link.title}`,
      `URL: ${link.url}`,
      `Data: ${new Date(link.created_at).toLocaleString("pt-PT")}`,
      `Tags: ${link.tags.join(", ") || "-"}`,
      "",
      "Descrição:",
      link.description || "-",
    ].join("\n");
  };

  const exportLink = (link: LinkRow) => {
    const text = buildLinkExportText(link);
    const safeTitle = link.title.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 50) || "link";
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `link-${safeTitle}-${new Date(link.created_at).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-enter space-y-6">
      <Toolbar
        search={search}
        onSearch={setSearch}
        tags={allTags}
        activeTags={activeTags}
        onTagsChange={setActiveTags}
        onNew={() => { setEditing(null); setOpen(true); }}
        newLabel="Novo link"
        viewMode={viewMode}
        onViewMode={setViewMode}
        sortBy={sortBy}
        onSortBy={setSortBy}
        onManageTags={() => setTagManagerOpen(true)}
        onExport={exportAll}
        onExportJson={() => exportTable("links")}
        onImportJson={async () => { if (user) { await importTable("links", user.id); await load(); } }}
        autoExportTable="links"
        autoExportLabel="Links"
      />

      <FavoritesTabs
        tab={tab}
        onTab={setTab}
        allCount={links.length}
        favCount={links.filter((l) => l.is_favorite).length}
      />



      {loading ? (
        <div className="text-muted-foreground text-sm">A carregar...</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Link2} label="Sem links guardados" />
      ) : viewMode === "list" ? (
        <div className="glass-card divide-y divide-border">
          {paged.map((l) => (
            <div key={l.id} className="px-4 py-3 hover:bg-accent/40 transition-colors flex items-start gap-3">
              <Link2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium text-sm truncate block hover:text-primary">{l.title}</a>
                <div className="text-xs text-muted-foreground truncate">{l.description || hostname(l.url)}</div>
              </div>
              <button onClick={() => toggleFavorite(l)} className="p-1.5 rounded hover:bg-accent" title={l.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
                <Star className={`h-3.5 w-3.5 ${l.is_favorite ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              </button>
              <button onClick={() => exportLink(l)} className="p-1.5 rounded hover:bg-accent hover:text-primary" title="Exportar este link">
                <Download className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { setEditing(l); setOpen(true); }} className="p-1.5 rounded hover:bg-accent hover:text-primary">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => remove(l.id)} className="p-1.5 rounded hover:bg-destructive/20 hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paged.map((l) => (
            <article key={l.id} className="glass-card glass-card-hover p-5 flex flex-col gap-3">
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold leading-tight truncate">{l.title}</h3>
                  <p className="text-xs text-primary/80 truncate">{hostname(l.url)}</p>
                </div>
                <div className="flex gap-1 shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleFavorite(l)} className="p-1.5 rounded hover:bg-accent" title={l.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}>
                    <Star className={`h-3.5 w-3.5 ${l.is_favorite ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </button>
                  <button onClick={() => exportLink(l)} className="p-1.5 rounded hover:bg-accent hover:text-primary" title="Exportar este link">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-accent hover:text-primary">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button onClick={() => { setEditing(l); setOpen(true); }} className="p-1.5 rounded hover:bg-accent hover:text-primary">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(l.id)} className="p-1.5 rounded hover:bg-destructive/20 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </header>
              {l.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">{l.description}</p>
              )}
              {l.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {l.tags.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground border border-primary/30">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <time className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mt-auto">
                {new Date(l.created_at).toLocaleString("pt-PT")}
              </time>
            </article>
          ))}
        </div>
      )}

      {filtered.length > pageSize && (
        <Pagination page={page} totalPages={totalPages} onPage={setPage} total={filtered.length} />
      )}

      {open && (
        <LinkDialog
          initial={editing}
          allTags={allTags}
          onClose={() => setOpen(false)}
          onSave={handleSave}
        />
      )}


      {tagManagerOpen && (
        <TagManagerDialog
          table="links"
          allTags={allTags}
          counts={tagCounts(links)}
          onClose={() => setTagManagerOpen(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function LinkDialog({
  initial, allTags, onClose, onSave,
}: {
  initial: LinkRow | null;
  allTags: string[];
  onClose: () => void;
  onSave: (d: { title: string; url: string; description: string; tags: string[] }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !url.trim()) return;
    try { new URL(url); } catch { setError("URL inválido (inclui https://)"); return; }
    setBusy(true);
    await onSave({ title: title.trim(), url: url.trim(), description, tags });
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
      <form onSubmit={submit} className="glass-card neon-border w-full max-w-lg p-6 space-y-4 page-enter">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold neon-text">{initial ? "Editar link" : "Novo link"}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:text-primary"><X className="h-4 w-4" /></button>
        </div>

        <Field label="Título">
          <input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </Field>

        <Field label="URL">
          <input type="url" value={url} maxLength={2000} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className={inputCls} />
        </Field>

        <Field label="Descrição (opcional)">
          <textarea value={description} maxLength={2000} rows={3} onChange={(e) => setDescription(e.target.value)} className={inputCls + " resize-none"} />
        </Field>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} suggestions={allTags} placeholder="dev, design, inspiração" />
        </Field>


        {error && <div className="text-sm text-destructive">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-accent">Cancelar</button>
          <button type="submit" disabled={busy || !title.trim() || !url.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:shadow-glow-strong disabled:opacity-50">
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
