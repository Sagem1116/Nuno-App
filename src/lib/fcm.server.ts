// Minimal Firebase Cloud Messaging HTTP v1 client.
// Uses Web Crypto (works on Cloudflare workerd) — no firebase-admin needed.

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

let cachedSvc: ServiceAccount | null = null;
function svc(): ServiceAccount {
  if (cachedSvc) return cachedSvc;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not set");
  const parsed = JSON.parse(raw) as ServiceAccount;
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  cachedSvc = parsed;
  return parsed;
}

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else bytes = new Uint8Array(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const s = svc();
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: s.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: s.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(s.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  const assertion = `${data}.${b64url(sig)}`;

  const res = await fetch(s.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!res.ok) throw new Error(`OAuth token failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return cachedToken.token;
}

export interface FcmMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  link?: string;
  tag?: string;
}

export interface FcmSendResult {
  token: string;
  ok: boolean;
  invalid?: boolean;
  error?: string;
}

export async function sendFcm(msg: FcmMessage): Promise<FcmSendResult> {
  const s = svc();
  const access = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${s.project_id}/messages:send`;
  const body = {
    message: {
      token: msg.token,
      notification: { title: msg.title, body: msg.body },
      data: msg.data,
      webpush: {
        fcm_options: msg.link ? { link: msg.link } : undefined,
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: msg.tag,
        },
      },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { token: msg.token, ok: true };
  const text = await res.text();
  const invalid = res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT|registration-token-not-registered/i.test(text);
  return { token: msg.token, ok: false, invalid, error: `${res.status} ${text}` };
}
