import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Search, X, StickyNote, Link2, CheckSquare, Plane, Wallet, FileText, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type Hit = {
  id: string;
  kind: "nota" | "link" | "tarefa" | "viagem" | "transacao" | "ficheiro" | "pasta";
  title: string;
  subtitle?: string;
  to: string;
  params?: Record<string, string>;
  url?: string;
};

const KIND_META: Record<Hit["kind"], { label: string; icon: typeof StickyNote; route: string }> = {
  nota: { label: "Nota", icon: StickyNote, route: "/notas" },
  link: { label: "Link", icon: Link2, route: "/links" },
  tarefa: { label: "Tarefa", icon: CheckSquare, route: "/tarefas" },
  viagem: { label: "Viagem", icon: Plane, route: "/viagens" },
  transacao: { label: "Finanças", icon: Wallet, route: "/financas" },
  ficheiro: { label: "Ficheiro", icon: FileText, route: "/drive" },
  pasta: { label: "Pasta", icon: FileText, route: "/drive" },
};

export function GlobalSearch() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  // Cmd/Ctrl+K opens
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || !user) return;
    const term = q.trim();
    if (!term) { setHits([]); return; }
    setLoading(true);
    const handle = setTimeout(async () => {
      const like = `%${term}%`;
      const sb: any = supabase;
      const [notes, links, tasks, trips, tx, driveFiles, driveFolders] = await Promise.all([
        sb.from("notes").select("id,title,content").or(`title.ilike.${like},content.ilike.${like}`).limit(6),
        sb.from("links").select("id,title,url,description").or(`title.ilike.${like},url.ilike.${like},description.ilike.${like}`).limit(6),
        sb.from("tasks").select("id,title,description").or(`title.ilike.${like},description.ilike.${like}`).limit(6),
        sb.from("trips").select("id,destination,notes").or(`destination.ilike.${like},notes.ilike.${like}`).limit(6),
        sb.from("transactions").select("id,description,category,amount").or(`description.ilike.${like},category.ilike.${like}`).limit(6),
        sb.from("files").select("id,name,folder_id,mime_type,is_trashed").ilike("name", like).eq("is_trashed", false).limit(6),
        sb.from("folders").select("id,name,is_trashed").ilike("name", like).eq("is_trashed", false).limit(6),
      ]);
      const out: Hit[] = [];
      (notes.data ?? []).forEach((r: any) => out.push({
        id: `n-${r.id}`, kind: "nota", title: r.title, subtitle: r.content?.slice(0, 80), to: "/notas",
      }));
      (links.data ?? []).forEach((r: any) => out.push({
        id: `l-${r.id}`, kind: "link", title: r.title, subtitle: r.url, to: "/links", url: r.url,
      }));
      (tasks.data ?? []).forEach((r: any) => out.push({
        id: `t-${r.id}`, kind: "tarefa", title: r.title, subtitle: r.description?.slice(0, 80), to: "/tarefas",
      }));
      (trips.data ?? []).forEach((r: any) => out.push({
        id: `v-${r.id}`, kind: "viagem", title: r.destination, subtitle: r.notes?.slice(0, 80), to: "/viagens",
      }));
      (tx.data ?? []).forEach((r: any) => out.push({
        id: `x-${r.id}`, kind: "transacao",
        title: r.description || r.category || "Transação",
        subtitle: r.amount != null ? `${Number(r.amount).toFixed(2)} €` : undefined,
        to: "/financas",
      }));
      (driveFolders.data ?? []).forEach((r: any) => out.push({
        id: `df-${r.id}`, kind: "pasta", title: r.name, subtitle: "Pasta",
        to: `/drive/folder/${r.id}`,
      }));
      (driveFiles.data ?? []).forEach((r: any) => out.push({
        id: `f-${r.id}`, kind: "ficheiro", title: r.name,
        subtitle: r.mime_type || "",
        to: r.folder_id ? `/drive/folder/${r.folder_id}` : "/drive",
      }));
      setHits(out);
      setLoading(false);
    }, 220);
    return () => clearTimeout(handle);
  }, [q, open, user]);

  const grouped = useMemo(() => {
    const g: Record<string, Hit[]> = {};
    hits.forEach((h) => { (g[h.kind] ??= []).push(h); });
    return g;
  }, [hits]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 w-72 max-w-[60vw] px-3 py-2 rounded-lg bg-input/60 border border-border hover:border-primary/50 transition-all text-sm text-muted-foreground"
        aria-label="Pesquisa global"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left truncate">Pesquisar tudo…</span>
        <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded border border-border bg-background/40 text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center p-4 pt-[10vh]"
             onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
               className="glass-card neon-border w-full max-w-2xl page-enter overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <Search className="h-4 w-4 text-primary" />
              <input
                ref={inputRef}
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Procura em notas, links, tarefas, viagens, finanças, ficheiros…"
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              <button onClick={() => setOpen(false)} className="p-1 hover:text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {q.trim() === "" ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Começa a escrever para pesquisar em todo o teu workspace.
                </div>
              ) : hits.length === 0 && !loading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Sem resultados para “{q}”.
                </div>
              ) : (
                <div className="py-2">
                  {(Object.keys(grouped) as Hit["kind"][]).map((kind) => {
                    const meta = KIND_META[kind];
                    const Icon = meta.icon;
                    return (
                      <div key={kind} className="mb-2">
                        <div className="px-4 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                          {meta.label}
                        </div>
                        {grouped[kind].map((h) => (
                          <button
                            key={h.id}
                            onClick={() => {
                              setOpen(false);
                              if (h.url) window.open(h.url, "_blank", "noreferrer");
                              else navigate({ to: h.to as string });
                            }}
                            className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-accent/60 text-left transition-colors"
                          >
                            <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{h.title}</div>
                              {h.subtitle && (
                                <div className="text-xs text-muted-foreground truncate">{h.subtitle}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between">
              <span>Atalho: ⌘K / Ctrl+K</span>
              <Link to="/ai" onClick={() => setOpen(false)} className="hover:text-primary">
                Não encontras? Pergunta ao Nuno AI →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}