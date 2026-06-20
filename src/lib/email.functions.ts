import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MailProvider = "gmail" | "outlook";

export type MailMessage = {
  id: string;
  provider: MailProvider;
  subject: string;
  sender: string;
  senderEmail: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
};

type GmailMessage = {
  id?: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: Array<{ name?: string; value?: string }> };
};

type OutlookMessage = {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  from?: { emailAddress?: { name?: string; address?: string } };
};

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())
    ?.value;
}

function parseSender(value = "") {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  return {
    name: (match?.[1] || value || "Remetente desconhecido").replace(/^"|"$/g, "").trim(),
    email: match?.[2]?.trim() || value.trim(),
  };
}

async function gatewayFetch(path: string, connectorKey: string) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey || !connectorKey) throw new Error("Ligação de email não configurada");

  const response = await fetch(`https://connector-gateway.lovable.dev/${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectorKey,
    },
  });
  if (!response.ok) {
    console.error("Email gateway error", response.status, await response.text());
    throw new Error("Não foi possível aceder à caixa de correio");
  }
  return response.json();
}

async function fetchGmail(): Promise<MailMessage[]> {
  const connectorKey = process.env.GOOGLE_MAIL_API_KEY ?? "";
  const list = (await gatewayFetch(
    "google_mail/gmail/v1/users/me/messages?maxResults=20&labelIds=INBOX",
    connectorKey,
  )) as { messages?: Array<{ id?: string }> };

  const messages = await Promise.all(
    (list.messages ?? []).flatMap((item) =>
      item.id
        ? [
            gatewayFetch(
              `google_mail/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
              connectorKey,
            ) as Promise<GmailMessage>,
          ]
        : [],
    ),
  );

  return messages.flatMap((message) => {
    if (!message.id) return [];
    const sender = parseSender(header(message, "From"));
    return [
      {
        id: message.id,
        provider: "gmail" as const,
        subject: header(message, "Subject") || "(Sem assunto)",
        sender: sender.name,
        senderEmail: sender.email,
        preview: message.snippet || "",
        receivedAt: message.internalDate
          ? new Date(Number(message.internalDate)).toISOString()
          : header(message, "Date") || new Date(0).toISOString(),
        unread: message.labelIds?.includes("UNREAD") ?? false,
      },
    ];
  });
}

async function fetchOutlook(): Promise<MailMessage[]> {
  const params = new URLSearchParams({
    $top: "20",
    $orderby: "receivedDateTime desc",
    $select: "id,subject,from,receivedDateTime,isRead,bodyPreview",
  });
  const data = (await gatewayFetch(
    `microsoft_outlook/me/mailFolders/inbox/messages?${params.toString()}`,
    process.env.MICROSOFT_OUTLOOK_API_KEY ?? "",
  )) as { value?: OutlookMessage[] };

  return (data.value ?? []).flatMap((message) => {
    if (!message.id) return [];
    const sender = message.from?.emailAddress;
    return [
      {
        id: message.id,
        provider: "outlook" as const,
        subject: message.subject || "(Sem assunto)",
        sender: sender?.name || sender?.address || "Remetente desconhecido",
        senderEmail: sender?.address || "",
        preview: message.bodyPreview || "",
        receivedAt: message.receivedDateTime || new Date(0).toISOString(),
        unread: !message.isRead,
      },
    ];
  });
}

export const getInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [gmail, outlook] = await Promise.allSettled([fetchGmail(), fetchOutlook()]);
    const messages = [
      ...(gmail.status === "fulfilled" ? gmail.value : []),
      ...(outlook.status === "fulfilled" ? outlook.value : []),
    ].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

    return {
      messages,
      errors: {
        gmail: gmail.status === "rejected",
        outlook: outlook.status === "rejected",
      },
    };
  });
