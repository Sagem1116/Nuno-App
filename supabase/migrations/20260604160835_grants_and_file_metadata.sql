-- Add missing Data API GRANTs for existing user tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_items TO authenticated;
GRANT ALL ON public.trip_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_threads TO authenticated;
GRANT ALL ON public.ai_threads TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;

-- Backfill any other public user tables missing authenticated/service_role grants
DO $$
DECLARE
    tbl record;
    has_priv boolean;
BEGIN
    FOR tbl IN
        SELECT c.relname AS table_name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind = 'r' AND n.nspname = 'public'
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM information_schema.role_table_grants
             WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = tbl.table_name
               AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
        ) INTO has_priv;
        IF NOT has_priv THEN
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM information_schema.role_table_grants
             WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name = tbl.table_name
               AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
        ) INTO has_priv;
        IF NOT has_priv THEN
            EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
        END IF;
    END LOOP;
END;
$$;

-- File metadata table (storage objects don't persist custom metadata via JS client)
CREATE TABLE IF NOT EXISTS public.file_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  original_name text not null default '',
  folder text not null default '',
  project text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, path)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_metadata TO authenticated;
GRANT ALL ON public.file_metadata TO service_role;

ALTER TABLE public.file_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "file_metadata_select_own" ON public.file_metadata FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "file_metadata_insert_own" ON public.file_metadata FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "file_metadata_update_own" ON public.file_metadata FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "file_metadata_delete_own" ON public.file_metadata FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS file_metadata_user_idx ON public.file_metadata(user_id);
CREATE INDEX IF NOT EXISTS file_metadata_tags_idx ON public.file_metadata USING gin(tags);
