import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

type ChatBody = { messages?: UIMessage[]; threadId?: string };

const SYSTEM_PROMPT = `És a Nuno AI, o assistente pessoal do Nuno App.
Tens acesso aos dados do utilizador: notas, links, tarefas, transações financeiras, viagens e ficheiros.
Responde sempre em Português de Portugal, de forma clara, concisa e prática.
Usa markdown (listas, negrito, headings) para organizar respostas.
Quando referires um item específico do utilizador, cita o título e a data.
Se a pergunta exigir dados que não tens, di-lo abertamente em vez de inventar.`;

function fmt(label: string, items: any[], render: (i: any) => string) {
  if (!items?.length) return "";
  return `\n\n## ${label} (${items.length})\n` + items.map(render).join("\n");
}

async function buildContext(supabase: any) {
  const [notes, links, tasks, tx, trips, files, folders] = await Promise.all([
    supabase.from("notes").select("title,content,tags,created_at").order("created_at", { ascending: false }).limit(40),
    supabase.from("links").select("title,url,description,tags,created_at").order("created_at", { ascending: false }).limit(40),
    supabase.from("tasks").select("title,description,priority,status,due_date,created_at").order("created_at", { ascending: false }).limit(40),
    supabase.from("transactions").select("type,amount,category,description,occurred_at").order("occurred_at", { ascending: false }).limit(40),
    supabase.from("trips").select("destination,start_date,end_date,budget,notes").order("start_date", { ascending: false }).limit(20),
    supabase.from("files").select("name,mime_type,size_bytes,folder_id,updated_at,is_trashed").eq("is_trashed", false).order("updated_at", { ascending: false }).limit(60),
    supabase.from("folders").select("id,name,parent_id,is_trashed").eq("is_trashed", false).limit(80),
  ]);

  const truncate = (s: string | null | undefined, n = 400) => (s ?? "").slice(0, n);
  const folderById = new Map<string, any>(((folders.data ?? []) as any[]).map((f) => [f.id, f]));
  const folderPath = (id: string | null): string => {
    if (!id) return "/";
    const parts: string[] = [];
    let cur = folderById.get(id);
    while (cur) { parts.unshift(cur.name); cur = cur.parent_id ? folderById.get(cur.parent_id) : null; }
    return "/" + parts.join("/");
  };

  return [
    fmt("Notas", notes.data ?? [], (n) =>
      `- **${n.title}** ${n.tags?.length ? `[${n.tags.join(", ")}]` : ""} — ${truncate(n.content)} _(${n.created_at?.slice(0,10)})_`),
    fmt("Links", links.data ?? [], (l) =>
      `- **${l.title}** ${l.url} ${l.tags?.length ? `[${l.tags.join(", ")}]` : ""} — ${truncate(l.description, 200)}`),
    fmt("Tarefas", tasks.data ?? [], (t) =>
      `- [${t.status}] **${t.title}** (${t.priority}${t.due_date ? `, prazo ${t.due_date}` : ""}) — ${truncate(t.description, 200)}`),
    fmt("Finanças", tx.data ?? [], (t) =>
      `- ${t.occurred_at?.slice(0,10)} ${t.type} ${t.amount}€ — ${t.category} ${t.description ? "— " + truncate(t.description, 100) : ""}`),
    fmt("Viagens", trips.data ?? [], (t) =>
      `- **${t.destination}** ${t.start_date ?? "?"} → ${t.end_date ?? "?"} ${t.budget ? `(${t.budget}€)` : ""} — ${truncate(t.notes, 200)}`),
    fmt("Pastas no Drive", folders.data ?? [], (f: any) => `- ${folderPath(f.id)}`),
    fmt("Ficheiros no Drive", files.data ?? [], (f: any) =>
      `- **${f.name}** (${f.mime_type ?? "?"}, ${f.size_bytes ?? "?"} bytes) em ${folderPath(f.folder_id)} _(${f.updated_at?.slice(0,10) ?? ""})_`),
  ].filter(Boolean).join("");
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Supabase não configurado", { status: 500 });
        }
        if (!LOVABLE_API_KEY) {
          return new Response("LOVABLE_API_KEY em falta", { status: 500 });
        }

        const authHeader = request.headers.get("authorization");
        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        const body = (await request.json()) as ChatBody;
        if (!Array.isArray(body.messages) || !body.threadId) {
          return new Response("Bad request", { status: 400 });
        }

        const threadId = body.threadId;

        // Verify thread belongs to user
        const { data: thread } = await (supabase as any)
          .from("ai_threads").select("id,title").eq("id", threadId).maybeSingle();
        if (!thread) return new Response("Thread not found", { status: 404 });

        // Persist the latest user message (last in array)
        const lastUserMsg = [...body.messages].reverse().find((m) => m.role === "user");
        if (lastUserMsg) {
          await (supabase as any).from("ai_messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "user",
            message: lastUserMsg,
          });

          // Auto-title from first user message if still default
          if (thread.title === "Nova conversa") {
            const text = lastUserMsg.parts
              ?.map((p: any) => (p.type === "text" ? p.text : ""))
              .join(" ")
              .trim()
              .slice(0, 60);
            if (text) {
              await (supabase as any).from("ai_threads")
                .update({ title: text, updated_at: new Date().toISOString() })
                .eq("id", threadId);
            }
          }
        }

        const contextText = await buildContext(supabase);

        const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
        const model = gateway("google/gemini-3-flash-preview");

        const result = streamText({
          model,
          system: SYSTEM_PROMPT + "\n\n# Dados do utilizador\n" + contextText,
          messages: await convertToModelMessages(body.messages),
          onError: ({ error }) => {
            console.error("[Nuno AI] streamText error", error);
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages,
          onFinish: async ({ responseMessage }) => {
            try {
              await (supabase as any).from("ai_messages").insert({
                thread_id: threadId,
                user_id: userId,
                role: "assistant",
                message: responseMessage,
              });
              await (supabase as any).from("ai_threads")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", threadId);
            } catch (e) {
              console.error("[Nuno AI] failed to persist assistant msg", e);
            }
          },
        });
      },
    },
  },
});