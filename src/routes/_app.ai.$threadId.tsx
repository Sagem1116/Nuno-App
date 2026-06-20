import { createFileRoute, useParams } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getThreadMessages } from "@/lib/ai-threads.functions";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";

export const Route = createFileRoute("/_app/ai/$threadId")({
  component: ThreadView,
});

function ThreadView() {
  const { threadId } = useParams({ from: "/_app/ai/$threadId" });
  const getMsgs = useServerFn(getThreadMessages);

  const { data: initialMessages, isLoading } = useQuery({
    queryKey: ["ai_messages", threadId],
    queryFn: () => getMsgs({ data: { threadId } }),
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
        A carregar conversa...
      </div>
    );
  }

  return <ChatWindow key={threadId} threadId={threadId} initial={initialMessages ?? []} />;
}

function ChatWindow({ threadId, initial }: { threadId: string; initial: UIMessage[] }) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          return {
            body: { messages, threadId, ...body },
            headers,
          };
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initial,
    transport,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId, status]);

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || status === "submitted" || status === "streaming") return;
    setText("");
    await sendMessage({ text: value });
  };

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Conversation className="flex-1">
        <ConversationContent className="max-w-3xl mx-auto w-full">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center shadow-glow">
                <Brain className="h-6 w-6 text-primary-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Experimenta: "O que tenho para fazer hoje?", "Resume as minhas notas sobre programação", "Quais foram os meus maiores gastos este mês?"
              </p>
            </div>
          )}
          {messages.map((m) => {
            const text = m.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("");
            return (
              <Message key={m.id} from={m.role}>
                <MessageContent>
                  {m.role === "assistant" ? (
                    <MessageResponse>{text}</MessageResponse>
                  ) : (
                    <div className="whitespace-pre-wrap">{text}</div>
                  )}
                </MessageContent>
              </Message>
            );
          })}
          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>A pensar...</Shimmer>
              </MessageContent>
            </Message>
          )}
          {error && (
            <div className="text-xs text-destructive border border-destructive/40 rounded-lg p-3">
              Erro: {error.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border p-4">
        <div className="max-w-3xl mx-auto">
          <PromptInput onSubmit={() => { void onSubmit(); }}>
            <PromptInputTextarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Pergunta à Nuno AI..."
              disabled={isBusy}
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} disabled={!text.trim() || isBusy} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}