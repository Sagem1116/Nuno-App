import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Sparkles } from "lucide-react";
import { listThreads, createThread } from "@/lib/ai-threads.functions";

export const Route = createFileRoute("/_app/ai/")({
  component: AiIndex,
});

function AiIndex() {
  const navigate = useNavigate();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      const threads = await list();
      if (threads.length > 0) {
        navigate({ to: "/ai/$threadId", params: { threadId: threads[0].id }, replace: true });
      }
    })();
  }, [list, navigate]);

  const [error, setError] = useState<string | null>(null);

  const startNew = async () => {
    setError(null);
    try {
      const t = await create({ data: {} });
      navigate({ to: "/ai/$threadId", params: { threadId: t.id } });
    } catch (err) {
      console.error("Failed to start new AI conversation:", err);
      setError("Não foi possível iniciar a conversa. Tenta novamente.");
    }
  };

  return (
    <div className="flex-1 grid place-items-center p-8 text-center">
      <div className="max-w-md space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center shadow-glow-strong">
          <Brain className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-semibold neon-text">Nuno AI</h1>
        <p className="text-sm text-muted-foreground">
          Pergunta-me sobre as tuas notas, links, tarefas, finanças, viagens e ficheiros.
          Cruzo a informação por ti e respondo em linguagem natural.
        </p>
        <button
          onClick={startNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-glow text-primary-foreground font-medium text-sm hover:shadow-glow-strong"
        >
          <Sparkles className="h-4 w-4" />
          Começar nova conversa
        </button>
        {error ? (
          <div className="mt-4 rounded-3xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}