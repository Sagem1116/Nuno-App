import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertCircle, ExternalLink, Inbox, Mail, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getInbox, type MailProvider } from "@/lib/email.functions";

export const Route = createFileRoute("/_app/email")({
  component: EmailPage,
});

type ProviderFilter = "all" | MailProvider;

const providerNames: Record<MailProvider, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
};

function EmailPage() {
  const loadInbox = useServerFn(getInbox);
  const [provider, setProvider] = useState<ProviderFilter>("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["email-inbox"],
    queryFn: () => loadInbox(),
    staleTime: 60_000,
  });

  const messages = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt");
    return (data?.messages ?? []).filter((message) => {
      if (provider !== "all" && message.provider !== provider) return false;
      if (!term) return true;
      return [message.subject, message.sender, message.senderEmail, message.preview].some((value) =>
        value.toLocaleLowerCase("pt").includes(term),
      );
    });
  }, [data?.messages, provider, search]);

  const unread = (data?.messages ?? []).filter((message) => message.unread).length;

  return (
    <div className="page-enter space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card p-6 md:p-8">
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              Caixa de entrada unificada
            </p>
            <h2 className="flex items-center gap-3 text-3xl font-semibold md:text-4xl">
              <Mail className="h-8 w-8 text-primary" /> Email
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Gmail e Outlook no mesmo lugar · {unread} por ler
            </p>
          </div>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "animate-spin" : ""} /> Atualizar
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1 rounded-xl border border-border bg-card/60 p-1">
          {(["all", "gmail", "outlook"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={provider === value ? "default" : "ghost"}
              onClick={() => setProvider(value)}
            >
              {value === "all" ? "Todos" : providerNames[value]}
            </Button>
          ))}
        </div>
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar emails..."
            className="pl-9"
            aria-label="Pesquisar emails"
          />
        </div>
      </section>

      {(data?.errors.gmail || data?.errors.outlook) && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          Não foi possível atualizar {data.errors.gmail ? "o Gmail" : "o Outlook"}. A outra caixa
          continua disponível.
        </div>
      )}

      {isLoading ? (
        <div className="grid min-h-64 place-items-center text-sm tracking-widest text-muted-foreground animate-pulse">
          A CARREGAR EMAILS
        </div>
      ) : messages.length ? (
        <section className="overflow-hidden rounded-2xl border border-border bg-card/60">
          {messages.map((message) => (
            <a
              key={`${message.provider}-${message.id}`}
              href={
                message.provider === "gmail"
                  ? "https://mail.google.com"
                  : "https://outlook.live.com/mail/"
              }
              target="_blank"
              rel="noreferrer"
              className="group grid gap-2 border-b border-border p-4 transition-colors last:border-b-0 hover:bg-accent/40 md:grid-cols-[12rem_1fr_auto] md:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${message.unread ? "bg-primary" : "bg-muted"}`}
                />
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm ${message.unread ? "font-semibold" : "font-medium"}`}
                  >
                    {message.sender}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {providerNames[message.provider]}
                  </p>
                </div>
              </div>
              <div className="min-w-0">
                <p className={`truncate text-sm ${message.unread ? "font-semibold" : ""}`}>
                  {message.subject}
                </p>
                <p className="truncate text-xs text-muted-foreground">{message.preview}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(message.receivedAt), { addSuffix: true, locale: pt })}
                <ExternalLink className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </a>
          ))}
        </section>
      ) : (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center text-muted-foreground">
          <div>
            <Inbox className="mx-auto mb-3 h-8 w-8" />
            <p>Não foram encontrados emails.</p>
          </div>
        </div>
      )}
    </div>
  );
}
