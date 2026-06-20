import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { UIMessage } from "ai";

// Tables created in 20260604130931_nuno_ai.sql; types not yet regenerated.
// Cast to any to bypass stale Supabase types until next regen.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("ai_threads")
      .select("id,title,created_at,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ id: string; title: string; created_at: string; updated_at: string }>;
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ title: z.string().min(1).max(120).optional() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await (context.supabase as any)
      .from("ai_threads")
      .insert({ user_id: context.userId, title: data.title ?? "Nova conversa" })
      .select("id,title,created_at,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string; title: string; created_at: string; updated_at: string };
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), title: z.string().min(1).max(120) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any)
      .from("ai_threads")
      .update({ title: data.title, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await (context.supabase as any).from("ai_threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getThreadMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ threadId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<any[]> => {
    const { data: rows, error } = await (context.supabase as any)
      .from("ai_messages")
      .select("message,created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => r.message as UIMessage);
  });