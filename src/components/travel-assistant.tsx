import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

interface TravelAssistantProps {
  tripId: string;
}

export function TravelAssistant({ tripId }: TravelAssistantProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat-travel",
        prepareSendMessagesRequest: async ({ messages, body }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers: Record<string, string> = {};
          if (token) headers.Authorization = `Bearer ${token}`;
          return {
            body: { messages, tripId, ...body },
            headers,
          };
        },
      }),
    [tripId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: `travel-${tripId}`,
    messages: [],
    transport,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, [status]);

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value || status === "submitted" || status === "streaming") return;
    setText("");
    await sendMessage({ text: value });
  };

  const isBusy = status === "submitted" || status === "streaming";

  const suggestedQuestions = [
    "O que tenho amanhã?",
    "Qual é o próximo voo?",
    "Quanto vou gastar?",
    "Resume esta viagem",
    "Há conflitos de horários?",
    "Sugerir poupanças",
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background/50">
      <Conversation className="flex-1">
        <ConversationContent className="max-w-3xl mx-auto w-full">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-6">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary-glow grid place-items-center shadow-glow">
                <Brain className="h-8 w-8 text-primary-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold neon-text">Assistente de Viagem</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Sou um especialista em viagens. Posso ajudar-te a organizar o itinerário, encontrar conflitos de horários, calcular despesas e muito mais!
                </p>
              </div>
              <div className="space-y-3 pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-[0.1em]">Perguntas sugeridas:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setText(q);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      className="text-left px-3 py-2 text-xs rounded-lg border border-border bg-card/50 hover:bg-card hover:border-primary/50 transition-colors flex items-center gap-2"
                    >
                      <Lightbulb className="h-3 w-3 text-primary flex-shrink-0" />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
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

      <div className="border-t border-border p-4 bg-background">
        <div className="max-w-3xl mx-auto">
          <PromptInput onSubmit={() => { void onSubmit(); }}>
            <PromptInputTextarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Pergunta ao assistente de viagem..."
              disabled={isBusy}
            />
            <PromptInputFooter>
              <PromptInputSubmit disabled={isBusy} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
