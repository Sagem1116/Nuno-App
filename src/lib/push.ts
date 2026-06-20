import { getToken, onMessage } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";
import { getMessagingIfSupported, VAPID_KEY } from "./firebase";
import { loadSettings, type NotificationSettings } from "./notifications";

export type PushSupport = "supported" | "unsupported";

export async function isPushSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator) || !("Notification" in window) || !("PushManager" in window)) return false;
  const m = await getMessagingIfSupported();
  return !!m;
}

export function detectPlatform(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "web";
}

async function registerSW(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

export async function enableMobilePush(): Promise<{ ok: boolean; reason?: string; token?: string }> {
  if (!(await isPushSupported())) return { ok: false, reason: "Browser não suporta push." };
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permissão negada." };

  const messaging = await getMessagingIfSupported();
  if (!messaging) return { ok: false, reason: "Messaging indisponível." };

  const reg = await registerSW();

  let token: string;
  try {
    token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  } catch (e: any) {
    return { ok: false, reason: e?.message || "Falha ao gerar token FCM." };
  }
  if (!token) return { ok: false, reason: "Sem token FCM." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Sem sessão." };

  const platform = detectPlatform();
  const ua = navigator.userAgent;
  const { error } = await (supabase as any)
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, fcm_token: token, platform, user_agent: ua, last_seen: new Date().toISOString() },
      { onConflict: "user_id,fcm_token" }
    );
  if (error) return { ok: false, reason: error.message };

  // Foreground messages on this device — show via Notification API.
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.title || "Nuno App";
    const body = payload.notification?.body || payload.data?.body || "";
    const url = payload.data?.url || "/dashboard";
    try {
      const n = new Notification(title, { body, icon: "/icon-192.png", tag: payload.data?.tag });
      n.onclick = () => { window.focus(); if (url) window.location.assign(url); n.close(); };
    } catch {}
  });

  // Sync user prefs to DB so server can replicate scheduler.
  await syncPreferencesToServer();

  return { ok: true, token };
}

export async function getRegisteredToken(): Promise<string | null> {
  if (!(await isPushSupported())) return null;
  if (Notification.permission !== "granted") return null;
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
    if (!reg) return null;
    return await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  } catch {
    return null;
  }
}

export async function disableMobilePush(): Promise<void> {
  const token = await getRegisteredToken();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && token) {
    await (supabase as any).from("push_subscriptions").delete().eq("user_id", user.id).eq("fcm_token", token);
  }
}

export async function syncPreferencesToServer(extra?: Partial<NotificationSettings>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const s = { ...loadSettings(), ...(extra || {}) };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  await (supabase as any).from("notification_preferences").upsert({
    user_id: user.id,
    enabled: s.enabled,
    tasks_enabled: s.tasksEnabled,
    tasks_window_hours: s.tasksWindowHours,
    task_start_enabled: s.taskStartEnabled,
    task_end_enabled: s.taskEndEnabled,
    start_lead_minutes: s.startLeadMinutes,
    priority_high_only: s.priorityHighOnly,
    daily_enabled: s.dailyEnabled,
    daily_hour: s.dailyHour,
    timezone: tz,
  }, { onConflict: "user_id" });
}
