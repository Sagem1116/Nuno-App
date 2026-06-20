import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Plus, Search, ExternalLink, Pencil, Trash2, X, Star, Cloud, Link2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ExtLink {
  id: string;
  title: string;
  url: string;
  provider: string;
  description: string;
  is_favorite: boolean;
  created_at: string;
}

const PROVIDERS = [
  { value: "google-drive", label: "Google Drive", host: "drive.google.com" },
  { value: "dropbox", label: "Dropbox", host: "dropbox.com" },
  { value: "onedrive", label: "OneDrive", host: "1drv.ms" },
  { value: "icloud", label: "iCloud", host: "icloud.com" },
  { value: "mega", label: "MEGA", host: "mega.nz" },
  { value: "wetransfer", label: "WeTransfer", host: "wetransfer.com" },
  { value: "other", label: "Outro", host: "" },
];

function detectProvider(url: string): string {
  try {
    const h = new URL(url).hostname.replace("www.", "");
    const p = PROVIDERS.find((x) => x.host && h.includes(x.host));
    return p?.value ?? "other";
  } catch { return "other"; }
}

function providerLabel(v: string) {
  return PROVIDERS.find((p) => p.value === v)?.label ?? "Outro";
}

function hostname(u: string) {
  try { return new URL(u).hostname.replace("www.", ""); } catch { return u; }
}

export const Route = createFileRoute("/_app/drive/links")({
  component: ExternalLinksPage,
});

function ExternalLinksPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ExtLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExtLink | null>(null);
  const [tab, setTab] = useState<"all" | "favorites">("all");

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("drive_external_links")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data as ExtLink[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((l) => {
      if (tab === "favorites" && !l.is_favorite) return false;
      if (provider !== "all" && l.provider !== provider) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.provider.toLowerCase().includes(q)
      );
    });
  }, [items, search, tab, provider]);

  const toggleFav = async (l: ExtLink) => {
    const next = !l.is_favorite;
    setItems((prev) => prev.map((x) => (x.id === l.id ? { ...x, is_favorite: next } : x)));
    await (supabase as any).from("drive_external_links").update({ is_favorite: next }).eq("id", l.id);
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminar este link?")) return;
    setItems((prev) => prev.filter((l) => l.id !== id));
    await (supabase as any).from("drive_external_links").delete().eq("id", id);
  };

  const save = async (data: { title: string; url: string; provider: string; description: string }) => {
    if (!user) return;
    if (editing) {
      const { data: upd } = await (supabase as any)
        .from("drive_external_links").update(data).eq("id", editing.id).select().single();
      if (upd) setItems((prev) => prev.map((l) => (l.id === editing.id ? (upd as ExtLink) : l)));
    } else {
      const { data: ins } = await (supabase as any)
        .from("drive_external_links").insert({ ...data, user_id: user.id }).select().single();
      if (ins) setItems((prev) => [ins as ExtLink, ...prev]);
    }
    setOpen(false);
    setEditing(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Cloud className="size-6 text-primary" /> Links externos
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Guarda links de ficheiros alojados noutras drives (Google Drive, Dropbox, OneDrive…)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar..." className="pl-9 w-56 bg-card" />
          </div>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="px-3 py-2 rounded-md bg-card border border-border text-sm"
          >
            <option value="all">Todos os serviços</option>
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }} className="gap-1">
            <Plus className="size-4" /> Novo link
          </Button>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg bg-card/50 border border-border w-fit">
        {([["all", `Todos (${items.length})`], ["favorites", `Favoritos (${items.filter((l) => l.is_favorite).length})`]] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={[
            "px-4 py-1.5 rounded-md text-xs uppercase tracking-wider transition-all",
            tab === v ? "bg-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground",
          ].join(" ")}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="size-16 rounded-2xl bg-accent/40 flex items-center justify-center mb-4">
            <Link2 className="size-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium">Sem links externos</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Adiciona links para ficheiros em Google Drive, Dropbox e outros serviços.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((l) => (
            <article key={l.id} className="glass-card glass-card-hover p-4 flex flex-col gap-2 group">
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold leading-tight truncate flex items-center gap-1.5">
                    <Cloud className="size-4 text-primary shrink-0" />
                    <span className="truncate">{l.title}</span>
                  </h3>
                  <p className="text-[10px] uppercase tracking-wider text-primary/80 mt-0.5">
                    {providerLabel(l.provider)} · {hostname(l.url)}
                  </p>
                </div>
                <div className="flex gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleFav(l)} className="p-1.5 rounded hover:bg-accent" title="Favorito">
                    <Star className={`h-3.5 w-3.5 ${l.is_favorite ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </button>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-accent hover:text-primary" title="Abrir">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button onClick={() => { setEditing(l); setOpen(true); }} className="p-1.5 rounded hover:bg-accent hover:text-primary" title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(l.id)} className="p-1.5 rounded hover:bg-destructive/20 hover:text-destructive" title="Eliminar">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </header>
              {l.description && <p className="text-xs text-muted-foreground line-clamp-2">{l.description}</p>}
              <time className="text-[10px] text-muted-foreground/70 uppercase tracking-wider mt-auto">
                {new Date(l.created_at).toLocaleDateString("pt-PT")}
              </time>
            </article>
          ))}
        </div>
      )}

      {open && (
        <LinkDialog
          initial={editing}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSave={save}
        />
      )}
    </div>
  );
}

function LinkDialog({
  initial, onClose, onSave,
}: {
  initial: ExtLink | null;
  onClose: () => void;
  onSave: (d: { title: string; url: string; provider: string; description: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initial && url && !provider) setProvider(detectProvider(url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !url.trim()) return;
    try { new URL(url); } catch { setError("URL inválido (inclui https://)"); return; }
    setBusy(true);
    await onSave({
      title: title.trim(),
      url: url.trim(),
      provider: provider || detectProvider(url),
      description,
    });
    setBusy(false);
  };

  const inputCls = "w-full px-3 py-2 rounded-lg bg-input border border-border focus:border-primary focus:outline-none text-sm";

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
      <form onSubmit={submit} className="glass-card neon-border w-full max-w-lg p-6 space-y-4 page-enter">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold neon-text">{initial ? "Editar link" : "Novo link externo"}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:text-primary"><X className="h-4 w-4" /></button>
        </div>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Título</span>
          <input autoFocus value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={inputCls + " mt-1"} />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">URL do ficheiro</span>
          <input type="url" value={url} maxLength={2000} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/..." className={inputCls + " mt-1"} />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Serviço</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls + " mt-1"}>
            <option value="">— Detetar automaticamente —</option>
            {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Descrição (opcional)</span>
          <textarea value={description} maxLength={2000} rows={3} onChange={(e) => setDescription(e.target.value)} className={inputCls + " mt-1 resize-none"} />
        </label>

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
