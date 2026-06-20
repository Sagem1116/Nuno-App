import { createFileRoute, Outlet, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, MessageSquare, Trash2, Brain } from "lucide-react";
import { listThreads, createThread, deleteThread } from "@/lib/ai-threads.functions";

export const Route = createFileRoute("/_app/ai")({
  component: AiLayout,
});

function AiLayout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const remove = useServerFn(deleteThread);
  const params = useParams({ strict: false }) as { threadId?: string };
  const [message, setMessage] = useState<string | null>(null);

  const { data: threads = [], isLoading, error: threadsError } = useQuery<Array<{ id: string; title: string; created_at: string; updated_at: string }>>({
    queryKey: ["ai_threads"],
    queryFn: () => list(),
  });

  if (threadsError && !message) {
    console.error("Failed to load AI threads:", threadsError);
  }

  const createMut = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: async (t) => {
      setMessage(null);
      await qc.invalidateQueries({ queryKey: ["ai_threads"] });
      navigate({ to: "/ai/$threadId", params: { threadId: t.id } });
    },
    onError: (error) => {
      console.error("Failed to create AI thread:", error);
      setMessage("Não foi possível iniciar a nova conversa. Tenta novamente.");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: (_d, id) => {
      setMessage(null);
      qc.invalidateQueries({ queryKey: ["ai_threads"] });
      if (params.threadId === id) navigate({ to: "/ai" });
    },
    onError: (error) => {
      console.error("Failed to delete AI thread:", error);
      setMessage("Não foi possível eliminar a conversa. Tenta novamente.");
    },
  });

  return (
    <div className="page-enter flex gap-4 h-[calc(100vh-7rem)]">
      <aside className="hidden md:flex flex-col w-64 shrink-0 glass-card p-3">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="font-semibold tracking-wide neon-text">Nuno AI</span>
        </div>
        <button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="mb-3 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground text-sm font-medium hover:shadow-glow-strong disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Nova conversa
        </button>
        {message ? (
          <div className="mb-3 rounded-3xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {message}
          </div>
        ) : null}
        <nav className="flex-1 overflow-y-auto space-y-1">
          {isLoading && <div className="text-xs text-muted-foreground px-2">A carregar...</div>}
          {!isLoading && threads.length === 0 && (
            <div className="text-xs text-muted-foreground px-2">Sem conversas ainda.</div>
          )}
          {threads.map((t) => {
            const active = params.threadId === t.id;
            return (
              <div
                key={t.id}
                className={[
                  "group flex items-center gap-2 rounded-lg text-sm transition-all",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground neon-border"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40",
                ].join(" ")}
              >
                <Link
                  to="/ai/$threadId"
                  params={{ threadId: t.id }}
                  className="flex-1 flex items-center gap-2 px-3 py-2 min-w-0"
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t.title}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Eliminar conversa?")) deleteMut.mutate(t.id);
                  }}
                  className="p-2 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </nav>
      </aside>
      <section className="flex-1 min-w-0 glass-card flex flex-col overflow-hidden">
        <Outlet />
      </section>
    </div>
  );
}