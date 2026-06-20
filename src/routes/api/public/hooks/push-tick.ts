import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sendFcm } from "@/lib/fcm.server";


function supa() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

interface Pref {
  user_id: string;
  enabled: boolean;
  tasks_enabled: boolean;
  tasks_window_hours: number;
  task_start_enabled: boolean;
  task_end_enabled: boolean;
  start_lead_minutes: number;
  priority_high_only: boolean;
  daily_enabled: boolean;
  daily_hour: number;
  timezone: string | null;
}

interface Task {
  id: string;
  user_id: string;
  title: string;
  due_date: string | null;
  start_time: string | null;
  end_time: string | null;
  priority: "low" | "medium" | "high";
  status: string;
  notify_lead_minutes: number | null;
}

interface Sub { user_id: string; fcm_token: string }

const TOL = 60 * 60 * 1000;

function combine(dateStr: string, timeStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0).getTime();
}

function todayInTZ(tz: string): { dateStr: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date()).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
  return { dateStr: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

async function alreadySent(client: ReturnType<typeof supa>, user_id: string, key: string) {
  const { data } = await client.from("push_sent_log").select("id").eq("user_id", user_id).eq("key", key).maybeSingle();
  return !!data;
}

async function markSent(client: ReturnType<typeof supa>, user_id: string, key: string) {
  await client.from("push_sent_log").insert({ user_id, key }).select().single().then(() => {}, () => {});
}

async function sendToUser(
  client: ReturnType<typeof supa>,
  tokens: string[],
  user_id: string,
  notif: { title: string; body: string; url: string; tag: string },
  key: string,
) {
  if (await alreadySent(client, user_id, key)) return;
  const invalid: string[] = [];
  const results = await Promise.all(
    tokens.map((token) =>
      sendFcm({ token, title: notif.title, body: notif.body, link: notif.url, tag: notif.tag, data: { url: notif.url, tag: notif.tag } }),
    ),
  );
  for (const r of results) {
    if (!r.ok) {
      if (r.invalid) invalid.push(r.token);
      else console.warn("[push-tick] send error", r.error);
    }
  }
  if (invalid.length) {
    await client.from("push_subscriptions").delete().eq("user_id", user_id).in("fcm_token", invalid);
  }
  await markSent(client, user_id, key);
}

async function processUser(
  client: ReturnType<typeof supa>,
  pref: Pref,
  tokens: string[],
) {
  if (!pref.enabled || tokens.length === 0) return;
  const tz = pref.timezone || "UTC";
  const { dateStr: today, hour: nowHour } = todayInTZ(tz);
  const inTwoDaysDate = new Date();
  inTwoDaysDate.setDate(inTwoDaysDate.getDate() + 2);
  const inTwoDays = inTwoDaysDate.toISOString().slice(0, 10);

  // Due-soon
  if (pref.tasks_enabled) {
    const cutoff = new Date(Date.now() + pref.tasks_window_hours * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: due } = await client
      .from("tasks")
      .select("id,user_id,title,due_date,priority,status")
      .eq("user_id", pref.user_id)
      .eq("status", "pending")
      .not("due_date", "is", null)
      .lte("due_date", cutoff);
    for (const t of (due ?? []) as Task[]) {
      if (pref.priority_high_only && t.priority !== "high") continue;
      const key = `task:${t.id}:${pref.tasks_window_hours}`;
      await sendToUser(client, tokens, pref.user_id,
        { title: "Tarefa com prazo a chegar", body: `${t.title} — ${t.due_date}`, url: "/tarefas", tag: key }, key);
    }
  }

  // Start / pre / end
  if (pref.task_start_enabled || pref.task_end_enabled) {
    const { data: rows } = await client
      .from("tasks")
      .select("id,user_id,title,due_date,start_time,end_time,priority,status,notify_lead_minutes")
      .eq("user_id", pref.user_id)
      .eq("status", "pending")
      .gte("due_date", today)
      .lte("due_date", inTwoDays);
    const now = Date.now();
    for (const t of (rows ?? []) as Task[]) {
      if (!t.due_date) continue;
      if (pref.priority_high_only && t.priority !== "high") continue;

      if (pref.task_start_enabled && t.start_time) {
        const startMs = combine(t.due_date, t.start_time);
        const lead = t.notify_lead_minutes != null ? t.notify_lead_minutes : pref.start_lead_minutes;
        if (lead > 0) {
          const preMs = startMs - lead * 60 * 1000;
          const preKey = `task-pre:${t.id}:${lead}`;
          if (now >= preMs && now < startMs) {
            await sendToUser(client, tokens, pref.user_id,
              { title: `Daqui a ${lead} min: ${t.title}`, body: `Começa às ${t.start_time.slice(0,5)}`, url: "/tarefas", tag: preKey }, preKey);
          }
        }
        const startKey = `task-start:${t.id}`;
        if (now >= startMs && now < startMs + TOL) {
          await sendToUser(client, tokens, pref.user_id,
            { title: `A começar: ${t.title}`, body: `Hora de início ${t.start_time.slice(0,5)}`, url: "/tarefas", tag: startKey }, startKey);
        }
      }
      if (pref.task_end_enabled && t.end_time) {
        const endMs = combine(t.due_date, t.end_time);
        const endKey = `task-end:${t.id}`;
        if (now >= endMs && now < endMs + TOL) {
          await sendToUser(client, tokens, pref.user_id,
            { title: `A terminar: ${t.title}`, body: `Hora de fim ${t.end_time.slice(0,5)}`, url: "/tarefas", tag: endKey }, endKey);
        }
      }
    }
  }

  // Daily summary
  if (pref.daily_enabled && nowHour >= pref.daily_hour) {
    const key = `daily:${today}`;
    if (!(await alreadySent(client, pref.user_id, key))) {
      const in7 = new Date(); in7.setDate(in7.getDate() + 7);
      const [{ count: tc }, { count: trc }] = await Promise.all([
        client.from("tasks").select("id", { count: "exact", head: true })
          .eq("user_id", pref.user_id).eq("status", "pending")
          .gte("due_date", today).lte("due_date", today),
        client.from("trips").select("id", { count: "exact", head: true })
          .eq("user_id", pref.user_id)
          .gte("start_date", today).lte("start_date", in7.toISOString().slice(0,10)),
      ]);
      const parts = [`${tc ?? 0} tarefa(s) hoje`];
      if ((trc ?? 0) > 0) parts.push(`${trc} viagem(ns) próximas`);
      await sendToUser(client, tokens, pref.user_id,
        { title: "Bom dia! O teu resumo de hoje", body: parts.join(" · "), url: "/dashboard", tag: key }, key);
    }
  }
}

export const Route = createFileRoute("/api/public/hooks/push-tick")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const client = supa();

          const { data: subs } = await client
            .from("push_subscriptions")
            .select("user_id,fcm_token");
          const tokensByUser = new Map<string, string[]>();
          for (const s of (subs ?? []) as Sub[]) {
            const arr = tokensByUser.get(s.user_id) ?? [];
            arr.push(s.fcm_token);
            tokensByUser.set(s.user_id, arr);
          }
          if (tokensByUser.size === 0) {
            return Response.json({ ok: true, users: 0 });
          }

          const userIds = Array.from(tokensByUser.keys());
          const { data: prefs } = await client
            .from("notification_preferences")
            .select("*")
            .in("user_id", userIds);

          let processed = 0;
          for (const p of (prefs ?? []) as Pref[]) {
            const tokens = tokensByUser.get(p.user_id) ?? [];
            try {
              await processUser(client, p, tokens);
              processed++;
            } catch (e: any) {
              console.warn("[push-tick] user error", p.user_id, e?.message);
            }
          }
          return Response.json({ ok: true, users: processed });
        } catch (e: any) {
          console.error("[push-tick] fatal", e);
          return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST to run" }),
    },
  },
});
