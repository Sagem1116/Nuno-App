
-- Shared trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- NOTES
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own notes" ON public.notes;
CREATE POLICY "Users manage own notes" ON public.notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS notes_user_idx ON public.notes(user_id, created_at DESC);
DROP TRIGGER IF EXISTS notes_updated_at ON public.notes;
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- LINKS
CREATE TABLE IF NOT EXISTS public.links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.links TO authenticated;
GRANT ALL ON public.links TO service_role;
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own links" ON public.links;
CREATE POLICY "Users manage own links" ON public.links FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS links_user_idx ON public.links(user_id, created_at DESC);
DROP TRIGGER IF EXISTS links_updated_at ON public.links;
CREATE TRIGGER links_updated_at BEFORE UPDATE ON public.links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('income','expense')),
  category text NOT NULL DEFAULT 'outros',
  description text NOT NULL DEFAULT '',
  occurred_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own transactions" ON public.transactions;
CREATE POLICY "Users manage own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS trg_transactions_updated ON public.transactions;
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, occurred_at DESC);

-- TASKS
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  due_date date,
  status text not null default 'pending' check (status in ('pending','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_select_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_own" ON public.tasks;
CREATE POLICY "tasks_select_own" ON public.tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tasks_insert_own" ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tasks_update_own" ON public.tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tasks_delete_own" ON public.tasks FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS tasks_user_due_idx ON public.tasks(user_id, due_date);

-- TRIPS
CREATE TABLE IF NOT EXISTS public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  start_date date,
  end_date date,
  budget numeric(12,2),
  notes text not null default '',
  name text not null default '',
  description text not null default '',
  secondary_destinations text[] not null default '{}',
  currency text not null default 'EUR',
  cover_image text,
  status text not null default 'planned' check (status in ('planned','confirmed','ongoing','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trips_select_own" ON public.trips;
DROP POLICY IF EXISTS "trips_insert_own" ON public.trips;
DROP POLICY IF EXISTS "trips_update_own" ON public.trips;
DROP POLICY IF EXISTS "trips_delete_own" ON public.trips;
CREATE POLICY "trips_select_own" ON public.trips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "trips_insert_own" ON public.trips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trips_update_own" ON public.trips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "trips_delete_own" ON public.trips FOR DELETE USING (auth.uid() = user_id);

-- TRIP ITEMS
CREATE TABLE IF NOT EXISTS public.trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('checklist','link','idea')),
  label text not null,
  url text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_items TO authenticated;
GRANT ALL ON public.trip_items TO service_role;
ALTER TABLE public.trip_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trip_items_select_own" ON public.trip_items;
DROP POLICY IF EXISTS "trip_items_insert_own" ON public.trip_items;
DROP POLICY IF EXISTS "trip_items_update_own" ON public.trip_items;
DROP POLICY IF EXISTS "trip_items_delete_own" ON public.trip_items;
CREATE POLICY "trip_items_select_own" ON public.trip_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "trip_items_insert_own" ON public.trip_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trip_items_update_own" ON public.trip_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "trip_items_delete_own" ON public.trip_items FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS trip_items_trip_idx ON public.trip_items(trip_id);

-- AI THREADS / MESSAGES
CREATE TABLE IF NOT EXISTS public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_threads TO authenticated;
GRANT ALL ON public.ai_threads TO service_role;
ALTER TABLE public.ai_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_threads_select_own" ON public.ai_threads;
DROP POLICY IF EXISTS "ai_threads_insert_own" ON public.ai_threads;
DROP POLICY IF EXISTS "ai_threads_update_own" ON public.ai_threads;
DROP POLICY IF EXISTS "ai_threads_delete_own" ON public.ai_threads;
CREATE POLICY "ai_threads_select_own" ON public.ai_threads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ai_threads_insert_own" ON public.ai_threads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_threads_update_own" ON public.ai_threads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ai_threads_delete_own" ON public.ai_threads FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS ai_threads_user_idx ON public.ai_threads(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  message jsonb not null,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_messages_select_own" ON public.ai_messages;
DROP POLICY IF EXISTS "ai_messages_insert_own" ON public.ai_messages;
DROP POLICY IF EXISTS "ai_messages_delete_own" ON public.ai_messages;
CREATE POLICY "ai_messages_select_own" ON public.ai_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ai_messages_insert_own" ON public.ai_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_messages_delete_own" ON public.ai_messages FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS ai_messages_thread_idx ON public.ai_messages(thread_id, created_at);

-- FILE METADATA (legacy)
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
DROP POLICY IF EXISTS "file_metadata_select_own" ON public.file_metadata;
DROP POLICY IF EXISTS "file_metadata_insert_own" ON public.file_metadata;
DROP POLICY IF EXISTS "file_metadata_update_own" ON public.file_metadata;
DROP POLICY IF EXISTS "file_metadata_delete_own" ON public.file_metadata;
CREATE POLICY "file_metadata_select_own" ON public.file_metadata FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "file_metadata_insert_own" ON public.file_metadata FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "file_metadata_update_own" ON public.file_metadata FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "file_metadata_delete_own" ON public.file_metadata FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS file_metadata_user_idx ON public.file_metadata(user_id);
CREATE INDEX IF NOT EXISTS file_metadata_tags_idx ON public.file_metadata USING gin(tags);

-- TRIP DAYS / ITINERARY / ATTACHMENTS
CREATE TABLE IF NOT EXISTS public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day_order integer not null default 0,
  day_date date,
  title text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_days TO authenticated;
GRANT ALL ON public.trip_days TO service_role;
ALTER TABLE public.trip_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trip_days_select_own" ON public.trip_days;
DROP POLICY IF EXISTS "trip_days_insert_own" ON public.trip_days;
DROP POLICY IF EXISTS "trip_days_update_own" ON public.trip_days;
DROP POLICY IF EXISTS "trip_days_delete_own" ON public.trip_days;
CREATE POLICY "trip_days_select_own" ON public.trip_days FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "trip_days_insert_own" ON public.trip_days FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trip_days_update_own" ON public.trip_days FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "trip_days_delete_own" ON public.trip_days FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS trip_days_trip_order_idx ON public.trip_days(trip_id, day_order);

CREATE TABLE IF NOT EXISTS public.trip_itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_id uuid not null references public.trip_days(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('activity','restaurant','transport','flight','note')),
  title text not null,
  description text not null default '',
  scheduled_at timestamptz,
  location text not null default '',
  notes text not null default '',
  order_index integer not null default 0,
  amount numeric(12,2),
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_itinerary_items TO authenticated;
GRANT ALL ON public.trip_itinerary_items TO service_role;
ALTER TABLE public.trip_itinerary_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trip_itinerary_items_select_own" ON public.trip_itinerary_items;
DROP POLICY IF EXISTS "trip_itinerary_items_insert_own" ON public.trip_itinerary_items;
DROP POLICY IF EXISTS "trip_itinerary_items_update_own" ON public.trip_itinerary_items;
DROP POLICY IF EXISTS "trip_itinerary_items_delete_own" ON public.trip_itinerary_items;
CREATE POLICY "trip_itinerary_items_select_own" ON public.trip_itinerary_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "trip_itinerary_items_insert_own" ON public.trip_itinerary_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trip_itinerary_items_update_own" ON public.trip_itinerary_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "trip_itinerary_items_delete_own" ON public.trip_itinerary_items FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS trip_itinerary_items_trip_idx ON public.trip_itinerary_items(trip_id);
CREATE INDEX IF NOT EXISTS trip_itinerary_items_day_order_idx ON public.trip_itinerary_items(day_id, order_index);

CREATE TABLE IF NOT EXISTS public.trip_item_attachments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_id uuid not null references public.trip_days(id) on delete cascade,
  item_id uuid not null references public.trip_itinerary_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_metadata_id uuid not null references public.file_metadata(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_item_attachments TO authenticated;
GRANT ALL ON public.trip_item_attachments TO service_role;
ALTER TABLE public.trip_item_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trip_item_attachments_select_own" ON public.trip_item_attachments;
DROP POLICY IF EXISTS "trip_item_attachments_insert_own" ON public.trip_item_attachments;
DROP POLICY IF EXISTS "trip_item_attachments_update_own" ON public.trip_item_attachments;
DROP POLICY IF EXISTS "trip_item_attachments_delete_own" ON public.trip_item_attachments;
CREATE POLICY "trip_item_attachments_select_own" ON public.trip_item_attachments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "trip_item_attachments_insert_own" ON public.trip_item_attachments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trip_item_attachments_update_own" ON public.trip_item_attachments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "trip_item_attachments_delete_own" ON public.trip_item_attachments FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS trip_item_attachments_item_idx ON public.trip_item_attachments(item_id);
CREATE INDEX IF NOT EXISTS trip_item_attachments_user_idx ON public.trip_item_attachments(user_id);

-- STORAGE policies for user-files
DROP POLICY IF EXISTS "Users view own files" ON storage.objects;
CREATE POLICY "Users view own files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Users upload own files" ON storage.objects;
CREATE POLICY "Users upload own files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Users update own files" ON storage.objects;
CREATE POLICY "Users update own files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Users delete own files" ON storage.objects;
CREATE POLICY "Users delete own files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'user-files' AND (storage.foldername(name))[1] = auth.uid()::text);
