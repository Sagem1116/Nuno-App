import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertCircle, Bell, BellOff, ExternalLink, Inbox, Mail, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getInbox, type MailProvider } from "@/lib/email.functions";
import { getPermissionState, notify, requestPermission, type NotificationPermissionState } from "@/lib/notifications";

export const Route = createFileRoute("/_app/email")({
  component: EmailPage,
});

type ProviderFilter = "all" | MailProvider;

const providerNames: Record<MailProvider, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
};

const SEEN_KEY = "email:seen-ids";
const NOTIF_ENABLED_KEY = "email:notify-enabled";

function loadSeen(): Record<MailProvider, string[]> {
  if (typeof window === "undefined") return { gmail: [], outlook: [] };
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return { gmail: [], outlook: [] };
    const parsed = JSON.parse(raw);
    return { gmail: parsed.gmail ?? [], outlook: parsed.outlook ?? [] };
  } catch {
    return { gmail: [], outlook: [] };
  }
}
function saveSeen(v: Record<MailProvider, string[]>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SEEN_KEY, JSON.stringify(v));
}

function EmailPage() {
  const loadInbox = useServerFn(getInbox);
  const [provider, setProvider] = useState<ProviderFilter>("all");
  const [search, setSearch] = useState("");
  const [perm, setPerm] = useState<NotificationPermissionState>(() => getPermissionState());
  const [notifEnabled, setNotifEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(NOTIF_ENABLED_KEY) === "1";
  });
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["email-inbox"],
    queryFn: () => loadInbox(),
    staleTime: 60_000,
    refetchInterval: 2 * 60_000, // verifica novos emails a cada 2 minutos
    refetchIntervalInBackground: true,
  });

  // Diff e notificação
  useEffect(() => {
    if (!data?.messages) return;
    const seen = loadSeen();
    const next: Record<MailProvider, string[]> = { gmail: [], outlook: [] };
    const newOnes: typeof data.messages = [];
    for (const m of data.messages) {
      next[m.provider].push(m.id);
      if (!seen[m.provider].includes(m.id)) newOnes.push(m);
    }
    // primeira carga -> só guarda, não notifica
    if (!initialized) {
      saveSeen(next);
      setInitialized(true);
      return;
    }
    if (notifEnabled && perm === "granted") {
      for (const m of newOnes.filter((x) => x.unread).slice(0, 5)) {
        notify(`${providerNames[m.provider]}: ${m.sender}`, {
          body: m.subject,
          tag: `email-${m.provider}-${m.id}`,
          url:
            m.provider === "gmail"
              ? "https://mail.google.com"
              : "https://outlook.live.com/mail/",
        });
      }
    }
    saveSeen(next);
  }, [data, initialized, notifEnabled, perm]);

  const enableNotifs = async () => {
    const state = await requestPermission();
    setPerm(state);
    if (state === "granted") {
      setNotifEnabled(true);
      localStorage.setItem(NOTIF_ENABLED_KEY, "1");
    }
  };
  const disableNotifs = () => {
    setNotifEnabled(false);
    localStorage.setItem(NOTIF_ENABLED_KEY, "0");
  };

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
  const unreadByProvider = useMemo(() => {
    const all = data?.messages ?? [];
    return {
      gmail: all.filter((m) => m.provider === "gmail" && m.unread).length,
      outlook: all.filter((m) => m.provider === "outlook" && m.unread).length,
    };
  }, [data?.messages]);

  const notifsActive = notifEnabled && perm === "granted";

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
          <div className="flex flex-wrap gap-2">
            {perm === "unsupported" ? null : notifsActive ? (
              <Button variant="outline" onClick={disableNotifs}>
                <BellOff /> Notificações ativas
              </Button>
            ) : (
              <Button variant="outline" onClick={enableNotifs}>
                <Bell /> Ativar notificações
              </Button>
            )}
            <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "animate-spin" : ""} /> Atualizar
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1 rounded-xl border border-border bg-card/60 p-1">
          {(["all", "gmail", "outlook"] as const).map((value) => {
            const count =
              value === "all"
                ? unread
                : value === "gmail"
                  ? unreadByProvider.gmail
                  : unreadByProvider.outlook;
            return (
              <Button
                key={value}
                size="sm"
                variant={provider === value ? "default" : "ghost"}
                onClick={() => setProvider(value)}
              >
                {value === "all" ? "Todos" : providerNames[value]}
                {count > 0 && (
                  <span className="ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold text-primary">
                    {count}
                  </span>
                )}
              </Button>
            );
          })}
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

      {perm === "denied" && notifEnabled && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          O browser bloqueou as notificações. Reativa-as nas definições do site para receberes alertas.
        </div>
      )}

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
