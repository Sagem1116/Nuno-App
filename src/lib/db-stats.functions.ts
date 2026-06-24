import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lovable Cloud free tier database quota (bytes). Used to render usage bars.
export const DB_QUOTA_BYTES = 500 * 1024 * 1024; // 500 MB

export const getDbSize = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ bytes: number; quota: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("get_db_size");
    if (error) {
      console.error("[db-stats] get_db_size rpc failed", error);
      return { bytes: 0, quota: DB_QUOTA_BYTES };
    }
    const bytes = Number((data as any)?.db_size_bytes ?? 0) || 0;
    return { bytes, quota: DB_QUOTA_BYTES };
  });
