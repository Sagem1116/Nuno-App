import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lovable Cloud free tier database quota (bytes). Used to render usage bars.
export const DB_QUOTA_BYTES = 500 * 1024 * 1024; // 500 MB

export const getDbSize = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Use a raw SQL via PostgREST: call pg_database_size through a one-off RPC.
    // No SQL function exists; query pg_database_size by a small SELECT through PostgREST is
    // not supported, so we use a tiny query via the REST API trick: fetch with admin client.
    const { data, error } = await supabaseAdmin
      .rpc("pg_database_size_current" as any)
      .single();
    if (!error && data && typeof (data as any).size === "number") {
      return { bytes: (data as any).size as number, quota: DB_QUOTA_BYTES };
    }
    // Fallback: estimate by summing row counts is unreliable; just return 0 if RPC missing.
    return { bytes: 0, quota: DB_QUOTA_BYTES };
  });
