// Lightweight wrapper around the browser Notification API.
// Used by the in-app scheduler (src/lib/notification-scheduler.ts).

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export interface NotificationSettings {
  enabled: boolean;
  tasksEnabled: boolean;        // prazo a chegar (due_date)
  tasksWindowHours: number;     // 1, 24, 72
  taskStartEnabled: boolean;    // hora de início
  taskEndEnabled: boolean;      // hora de fim
  startLeadMinutes: number;     // 0 | 5 | 10 | 15
  priorityHighOnly: boolean;    // filtrar só prioridade alta
  dailyEnabled: boolean;
  dailyHour: number;            // 0-23
}

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  tasksEnabled: true,
  tasksWindowHours: 24,
  taskStartEnabled: true,
  taskEndEnabled: true,
  startLeadMinutes: 5,
  priorityHighOnly: false,
  dailyEnabled: true,
  dailyHour: 9,
};

const SETTINGS_KEY = "notifications:settings";

export function loadSettings(): NotificationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: NotificationSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("notifications:settings-changed"));
}

export function getPermissionState(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotificationPermissionState;
}

export async function requestPermission(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission as NotificationPermissionState;
  }
  const res = await Notification.requestPermission();
  return res as NotificationPermissionState;
}

export interface NotifyOptions {
  body?: string;
  tag?: string;
  url?: string;
  silent?: boolean;
  requireInteraction?: boolean;
  /** When provided, clicking the notification queues an in-app snooze prompt for this key. */
  snoozeKey?: string;
  snoozeLabel?: string;
}

const SNOOZE_PROMPT_KEY = "notifications:snooze-prompt";

export function notify(title: string, opts: NotifyOptions = {}) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body: opts.body,
      tag: opts.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      silent: opts.silent,
      requireInteraction: opts.requireInteraction,
    });
    n.onclick = () => {
      window.focus();
      if (opts.snoozeKey) {
        try {
          localStorage.setItem(SNOOZE_PROMPT_KEY, JSON.stringify({
            key: opts.snoozeKey,
            label: opts.snoozeLabel || title,
            ts: Date.now(),
          }));
        } catch {}
      }
      if (opts.url) window.location.assign(opts.url);
      n.close();
    };
  } catch (e) {
    console.warn("notify failed", e);
  }
}

// Idempotency helpers — prevent duplicate notifications.
const SENT_KEY = "notifications:sent";
const SNOOZE_KEY = "notifications:snooze";

function loadMap(key: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}
function saveMap(key: string, map: Record<string, number>) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const cleaned: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) if (v > cutoff) cleaned[k] = v;
  localStorage.setItem(key, JSON.stringify(cleaned));
}

export function hasSent(key: string): boolean { return key in loadMap(SENT_KEY); }
export function markSent(key: string) {
  const m = loadMap(SENT_KEY); m[key] = Date.now(); saveMap(SENT_KEY, m);
}
export function clearSent(key: string) {
  const m = loadMap(SENT_KEY); delete m[key]; saveMap(SENT_KEY, m);
}

/** Re-arm a notification key after `minutes` minutes (used by snooze). */
export function snooze(key: string, minutes: number) {
  const m = loadMap(SNOOZE_KEY);
  m[key] = Date.now() + minutes * 60 * 1000;
  saveMap(SNOOZE_KEY, m);
  clearSent(key); // allow re-send when due
}

/** Returns keys whose snooze deadline has passed (and removes them). */
export function consumeDueSnoozes(): string[] {
  const m = loadMap(SNOOZE_KEY);
  const now = Date.now();
  const due: string[] = [];
  const rest: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) {
    if (v <= now) due.push(k);
    else rest[k] = v;
  }
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(rest));
  return due;
}

/** Read + clear the pending snooze prompt (set when user clicks a notification). */
export function takePendingSnoozePrompt(): { key: string; label: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SNOOZE_PROMPT_KEY);
    if (!raw) return null;
    localStorage.removeItem(SNOOZE_PROMPT_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed?.key) return null;
    // ignore prompts older than 10 min (stale)
    if (Date.now() - (parsed.ts || 0) > 10 * 60 * 1000) return null;
    return { key: parsed.key, label: parsed.label || "Notificação" };
  } catch { return null; }
}
