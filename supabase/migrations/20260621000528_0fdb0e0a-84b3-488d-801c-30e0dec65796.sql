-- Recreate the application schema in the new Lovable Cloud project
-- so the existing TypeScript code and features can compile and run.

-- 1. todos (legacy demo table)
CREATE TABLE public.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.todos TO authenticated;
GRANT ALL ON public.todos TO service_role;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own todos" ON public.todos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Drive: folders
CREATE TABLE public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  parent_id uuid,
  name text NOT NULL,
  is_trashed boolean DEFAULT false,
  trashed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.folders TO authenticated;
GRANT ALL ON public.folders TO service_role;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own folders" ON public.folders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_folders_user_parent ON public.folders(user_id, parent_id);

-- 3. Drive: files
CREATE TABLE public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  folder_id uuid,
  name text NOT NULL,
  mime_type text,
  extension text,
  size_bytes bigint DEFAULT 0,
  storage_path text NOT NULL,
  is_trashed boolean DEFAULT false,
  trashed_at timestamp with time zone,
  last_accessed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.files TO authenticated;
GRANT ALL ON public.files TO service_role;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own files" ON public.files FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_files_user_folder ON public.files(user_id, folder_id);

-- 4. Drive: favorites
CREATE TABLE public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_id uuid,
  folder_id uuid,
  created_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own favorites" ON public.favorites FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_favorites_user_file ON public.favorites(user_id, file_id) WHERE file_id IS NOT NULL;
CREATE UNIQUE INDEX idx_favorites_user_folder ON public.favorites(user_id, folder_id) WHERE folder_id IS NOT NULL;

-- 5. Tags
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#3B82F6',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tags" ON public.tags FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_tags_user_name ON public.tags(user_id, name);

-- 6. File tags
CREATE TABLE public.file_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  file_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.file_tags TO authenticated;
GRANT ALL ON public.file_tags TO service_role;
ALTER TABLE public.file_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own file tags" ON public.file_tags FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_file_tags_user_tag_file ON public.file_tags(user_id, tag_id, file_id);

-- 7. Folder tags
CREATE TABLE public.folder_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  folder_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.folder_tags TO authenticated;
GRANT ALL ON public.folder_tags TO service_role;
ALTER TABLE public.folder_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own folder tags" ON public.folder_tags FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_folder_tags_user_tag_folder ON public.folder_tags(user_id, tag_id, folder_id);

-- 8. Notes
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  content text DEFAULT '',
  tags text[] DEFAULT '{}',
  is_favorite boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notes" ON public.notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_notes_user_created ON public.notes(user_id, created_at DESC);

-- 9. Links
CREATE TABLE public.links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  description text DEFAULT '',
  tags text[] DEFAULT '{}',
  is_favorite boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.links TO authenticated;
GRANT ALL ON public.links TO service_role;
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own links" ON public.links FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_links_user_created ON public.links(user_id, created_at DESC);

-- 10. Transactions
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  category text NOT NULL,
  description text DEFAULT '',
  occurred_at timestamp with time zone DEFAULT now(),
  trip_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transactions" ON public.transactions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_transactions_user_occurred ON public.transactions(user_id, occurred_at DESC);

-- 11. Tasks
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date date,
  start_time text,
  end_time text,
  notify_lead_minutes integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tasks" ON public.tasks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_tasks_user_due ON public.tasks(user_id, due_date);

-- 12. Trips
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  destination text NOT NULL,
  description text DEFAULT '',
  secondary_destinations text[] DEFAULT '{}',
  start_date date,
  end_date date,
  budget numeric,
  currency text NOT NULL DEFAULT 'EUR',
  cover_image text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'confirmed', 'ongoing', 'completed', 'cancelled')),
  notes text DEFAULT '',
  public_slug text,
  is_public boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT SELECT ON public.trips TO anon;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trips" ON public.trips FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public trips are readable" ON public.trips FOR SELECT TO anon USING (is_public = true);
CREATE UNIQUE INDEX idx_trips_public_slug ON public.trips(public_slug) WHERE public_slug IS NOT NULL;
CREATE INDEX idx_trips_user_start ON public.trips(user_id, start_date);

-- 13. Trip days
CREATE TABLE public.trip_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  user_id uuid NOT NULL,
  day_order integer NOT NULL DEFAULT 0,
  day_date date,
  title text NOT NULL,
  notes text DEFAULT '',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_days TO authenticated;
GRANT ALL ON public.trip_days TO service_role;
ALTER TABLE public.trip_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trip days" ON public.trip_days FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_trip_days_trip_order ON public.trip_days(trip_id, day_order);

-- 14. Trip itinerary items
CREATE TABLE public.trip_itinerary_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  day_id uuid NOT NULL,
  user_id uuid NOT NULL,
  item_type text NOT NULL DEFAULT 'activity' CHECK (item_type IN ('activity', 'restaurant', 'transport', 'flight', 'note')),
  title text NOT NULL,
  description text DEFAULT '',
  scheduled_at timestamp with time zone,
  location text DEFAULT '',
  notes text DEFAULT '',
  order_index integer NOT NULL DEFAULT 0,
  amount numeric,
  currency text NOT NULL DEFAULT 'EUR',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_itinerary_items TO authenticated;
GRANT ALL ON public.trip_itinerary_items TO service_role;
ALTER TABLE public.trip_itinerary_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own itinerary items" ON public.trip_itinerary_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_trip_itinerary_trip_day_order ON public.trip_itinerary_items(trip_id, day_id, order_index);

-- 15. Trip quick items
CREATE TABLE public.trip_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'checklist' CHECK (kind IN ('checklist', 'link', 'idea', 'place', 'activity')),
  label text NOT NULL,
  url text,
  price numeric,
  done boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_items TO authenticated;
GRANT ALL ON public.trip_items TO service_role;
ALTER TABLE public.trip_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trip items" ON public.trip_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_trip_items_trip ON public.trip_items(trip_id, created_at);

-- 16. Reservations
CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid,
  user_id uuid NOT NULL,
  reservation_type text NOT NULL DEFAULT 'other' CHECK (reservation_type IN ('flight', 'hotel', 'transport', 'other')),
  title text NOT NULL,
  confirmation_number text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  extracted_data jsonb DEFAULT '{}',
  extraction_confidence numeric,
  notes text DEFAULT '',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reservations" ON public.reservations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_reservations_user_created ON public.reservations(user_id, created_at DESC);

-- 17. File metadata (trip documents)
CREATE TABLE public.file_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  path text NOT NULL,
  original_name text NOT NULL,
  folder text NOT NULL,
  project text NOT NULL,
  tags text[] DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_metadata TO authenticated;
GRANT ALL ON public.file_metadata TO service_role;
ALTER TABLE public.file_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own file metadata" ON public.file_metadata FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_file_metadata_user_folder ON public.file_metadata(user_id, folder);

-- 18. Trip item attachments
CREATE TABLE public.trip_item_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  day_id uuid NOT NULL,
  item_id uuid NOT NULL,
  user_id uuid NOT NULL,
  file_metadata_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.trip_item_attachments TO authenticated;
GRANT ALL ON public.trip_item_attachments TO service_role;
ALTER TABLE public.trip_item_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trip attachments" ON public.trip_item_attachments FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_trip_attachments_trip ON public.trip_item_attachments(trip_id);

-- 19. User integrations (GitHub, etc.)
CREATE TABLE public.user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  token text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_integrations TO authenticated;
GRANT ALL ON public.user_integrations TO service_role;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own integrations" ON public.user_integrations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_user_integrations_user_provider ON public.user_integrations(user_id, provider);

-- 20. Finance categories
CREATE TABLE public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#ff7a18',
  kind text NOT NULL DEFAULT 'both' CHECK (kind IN ('income', 'expense', 'both')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_categories TO authenticated;
GRANT ALL ON public.finance_categories TO service_role;
ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own finance categories" ON public.finance_categories FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_finance_categories_user_name ON public.finance_categories(user_id, name);

-- Generic updated_at trigger helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Attach updated_at triggers to tables that have the column
CREATE TRIGGER update_todos_updated_at BEFORE UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_folders_updated_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_links_updated_at BEFORE UPDATE ON public.links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trip_days_updated_at BEFORE UPDATE ON public.trip_days FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trip_itinerary_items_updated_at BEFORE UPDATE ON public.trip_itinerary_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_file_metadata_updated_at BEFORE UPDATE ON public.file_metadata FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trip_item_attachments_updated_at BEFORE UPDATE ON public.trip_item_attachments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_integrations_updated_at BEFORE UPDATE ON public.user_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_finance_categories_updated_at BEFORE UPDATE ON public.finance_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Foreign key relationships between app tables (avoid FKs to auth.users per guidelines)
ALTER TABLE public.folders ADD CONSTRAINT fk_folders_parent FOREIGN KEY (parent_id) REFERENCES public.folders(id) ON DELETE SET NULL;
ALTER TABLE public.files ADD CONSTRAINT fk_files_folder FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;
ALTER TABLE public.favorites ADD CONSTRAINT fk_favorites_file FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;
ALTER TABLE public.favorites ADD CONSTRAINT fk_favorites_folder FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;
ALTER TABLE public.file_tags ADD CONSTRAINT fk_file_tags_tag FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;
ALTER TABLE public.file_tags ADD CONSTRAINT fk_file_tags_file FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;
ALTER TABLE public.folder_tags ADD CONSTRAINT fk_folder_tags_tag FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;
ALTER TABLE public.folder_tags ADD CONSTRAINT fk_folder_tags_folder FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;
ALTER TABLE public.trip_days ADD CONSTRAINT fk_trip_days_trip FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
ALTER TABLE public.trip_itinerary_items ADD CONSTRAINT fk_trip_itinerary_trip FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
ALTER TABLE public.trip_itinerary_items ADD CONSTRAINT fk_trip_itinerary_day FOREIGN KEY (day_id) REFERENCES public.trip_days(id) ON DELETE CASCADE;
ALTER TABLE public.trip_items ADD CONSTRAINT fk_trip_items_trip FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
ALTER TABLE public.reservations ADD CONSTRAINT fk_reservations_trip FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD CONSTRAINT fk_transactions_trip FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE SET NULL;
ALTER TABLE public.trip_item_attachments ADD CONSTRAINT fk_trip_attachments_trip FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
ALTER TABLE public.trip_item_attachments ADD CONSTRAINT fk_trip_attachments_day FOREIGN KEY (day_id) REFERENCES public.trip_days(id) ON DELETE CASCADE;
ALTER TABLE public.trip_item_attachments ADD CONSTRAINT fk_trip_attachments_item FOREIGN KEY (item_id) REFERENCES public.trip_itinerary_items(id) ON DELETE CASCADE;
ALTER TABLE public.trip_item_attachments ADD CONSTRAINT fk_trip_attachments_metadata FOREIGN KEY (file_metadata_id) REFERENCES public.file_metadata(id) ON DELETE CASCADE;
