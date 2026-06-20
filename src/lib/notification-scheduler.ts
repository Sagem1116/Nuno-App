import { supabase } from "@/integrations/supabase/client";
import {
  loadSettings,
  notify,
  getPermissionState,
  hasSent,
  markSent,
  consumeDueSnoozes,
} from "./notifications";

interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  start_time: string | null;
  end_time: string | null;
  priority: "low" | "medium" | "high";
  status: string;
  notify_lead_minutes: number | null;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function combineDateTime(dateStr: string, timeStr: string): number {
  // dateStr: yyyy-MM-dd, timeStr: HH:mm[:ss]
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0).getTime();
}

const TOLERANCE_MS = 60 * 60 * 1000; // 1h late tolerance

async function fetchPendingWithTimes(userId: string): Promise<TaskRow[]> {
  const today = todayKey();
  const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await (supabase as any)
    .from("tasks")
    .select("id,title,due_date,start_time,end_time,priority,status,notify_lead_minutes")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gte("due_date", today)
    .lte("due_date", inTwoDays);
  return (data ?? []) as TaskRow[];
}

async function checkTasksDue(userId: string, windowHours: number, highOnly: boolean) {
  const now = Date.now();
  const cutoff = new Date(now + windowHours * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await (supabase as any)
    .from("tasks")
    .select("id,title,due_date,priority,status")
    .eq("user_id", userId)
    .eq("status", "pending")
    .not("due_date", "is", null)
    .lte("due_date", cutoff);
  const tasks = (data ?? []) as TaskRow[];
  for (const t of tasks) {
    if (!t.due_date) continue;
    if (highOnly && t.priority !== "high") continue;
    const key = `task:${t.id}:${windowHours}`;
    if (hasSent(key)) continue;
    notify("Tarefa com prazo a chegar", {
      body: `${t.title} — ${t.due_date}`,
      tag: key,
      url: "/tarefas",
      snoozeKey: key,
      snoozeLabel: t.title,
    });
    markSent(key);
  }
}

function processStartEnd(
  tasks: TaskRow[],
  highOnly: boolean,
  startEnabled: boolean,
  endEnabled: boolean,
  leadMinutes: number,
) {
  const now = Date.now();
  for (const t of tasks) {
    if (!t.due_date) continue;
    if (highOnly && t.priority !== "high") continue;

    if (startEnabled && t.start_time) {
      const startMs = combineDateTime(t.due_date, t.start_time);
      const effectiveLead = t.notify_lead_minutes != null ? t.notify_lead_minutes : leadMinutes;

      // Pré-aviso
      if (effectiveLead > 0) {
        const preMs = startMs - effectiveLead * 60 * 1000;
        const preKey = `task-pre:${t.id}:${effectiveLead}`;
        if (now >= preMs && now < startMs && !hasSent(preKey)) {
          notify(`Daqui a ${effectiveLead} min: ${t.title}`, {
            body: `Começa às ${t.start_time.slice(0, 5)}`,
            tag: preKey,
            url: "/tarefas",
            snoozeKey: preKey,
            snoozeLabel: t.title,
          });
          markSent(preKey);
        }
      }

      // Início
      const startKey = `task-start:${t.id}`;
      if (now >= startMs && now < startMs + TOLERANCE_MS && !hasSent(startKey)) {
        notify(`A começar: ${t.title}`, {
          body: `Hora de início ${t.start_time.slice(0, 5)}`,
          tag: startKey,
          url: "/tarefas",
          snoozeKey: startKey,
          snoozeLabel: t.title,
        });
        markSent(startKey);
      }
    }

    if (endEnabled && t.end_time) {
      const endMs = combineDateTime(t.due_date, t.end_time);
      const endKey = `task-end:${t.id}`;
      if (now >= endMs && now < endMs + TOLERANCE_MS && !hasSent(endKey)) {
        notify(`A terminar: ${t.title}`, {
          body: `Hora de fim ${t.end_time.slice(0, 5)}`,
          tag: endKey,
          url: "/tarefas",
          snoozeKey: endKey,
          snoozeLabel: t.title,
        });
        markSent(endKey);
      }
    }
  }
}

async function checkDaily(userId: string, hour: number) {
  const now = new Date();
  if (now.getHours() < hour) return;
  const key = `daily:${todayKey()}`;
  if (hasSent(key)) return;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [tasksRes, tripsRes] = await Promise.all([
    (supabase as any)
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending")
      .gte("due_date", startOfDay.slice(0, 10))
      .lte("due_date", endOfDay.slice(0, 10)),
    (supabase as any)
      .from("trips")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("start_date", startOfDay.slice(0, 10))
      .lte("start_date", in7days.slice(0, 10)),
  ]);

  const tasksToday = tasksRes.count ?? 0;
  const upcomingTrips = tripsRes.count ?? 0;

  const parts: string[] = [];
  parts.push(`${tasksToday} tarefa(s) hoje`);
  if (upcomingTrips > 0) parts.push(`${upcomingTrips} viagem(ns) próximas`);

  notify("Bom dia! O teu resumo de hoje", {
    body: parts.join(" · "),
    tag: key,
    url: "/dashboard",
  });
  markSent(key);
}

export async function runScheduledChecks(userId: string | undefined) {
  if (!userId) return;
  if (getPermissionState() !== "granted") return;
  const settings = loadSettings();
  if (!settings.enabled) return;

  // snoozes whose deadline passed simply clear `sent` (done inside snooze());
  // calling consume here also drops them from the snooze map so they don't linger.
  consumeDueSnoozes();

  try {
    if (settings.tasksEnabled) {
      await checkTasksDue(userId, settings.tasksWindowHours, settings.priorityHighOnly);
    }
    if (settings.taskStartEnabled || settings.taskEndEnabled) {
      const rows = await fetchPendingWithTimes(userId);
      processStartEnd(
        rows,
        settings.priorityHighOnly,
        settings.taskStartEnabled,
        settings.taskEndEnabled,
        settings.startLeadMinutes,
      );
    }
    if (settings.dailyEnabled) await checkDaily(userId, settings.dailyHour);
  } catch (e) {
    console.warn("notification scheduler error", e);
  }
}
