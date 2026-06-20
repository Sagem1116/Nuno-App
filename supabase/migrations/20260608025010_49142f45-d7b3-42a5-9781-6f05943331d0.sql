
-- Helper: trip is publicly shared
CREATE OR REPLACE FUNCTION public.is_trip_public(_trip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_public FROM public.trips WHERE id = _trip_id), false)
$$;

-- Grants for anon Data API access (RLS still enforces row-level)
GRANT SELECT, UPDATE ON public.trips TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_days TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_itinerary_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_item_attachments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_metadata TO anon;

-- Policies for trips: anyone can read or update public trips
CREATE POLICY "anon read public trips"
  ON public.trips FOR SELECT TO anon
  USING (is_public = true);

CREATE POLICY "anon update public trips"
  ON public.trips FOR UPDATE TO anon
  USING (is_public = true)
  WITH CHECK (is_public = true);

-- Policies for child tables: full CRUD on rows belonging to public trips
CREATE POLICY "anon all public trip_days"
  ON public.trip_days FOR ALL TO anon
  USING (public.is_trip_public(trip_id))
  WITH CHECK (public.is_trip_public(trip_id));

CREATE POLICY "anon all public trip_items"
  ON public.trip_items FOR ALL TO anon
  USING (public.is_trip_public(trip_id))
  WITH CHECK (public.is_trip_public(trip_id));

CREATE POLICY "anon all public trip_itinerary_items"
  ON public.trip_itinerary_items FOR ALL TO anon
  USING (public.is_trip_public(trip_id))
  WITH CHECK (public.is_trip_public(trip_id));

CREATE POLICY "anon all public trip_item_attachments"
  ON public.trip_item_attachments FOR ALL TO anon
  USING (public.is_trip_public(trip_id))
  WITH CHECK (public.is_trip_public(trip_id));

-- file_metadata: allow anon read/insert/delete for files inside a public trip folder
-- Folder format used by the app: 'trips/<trip_id>'
CREATE POLICY "anon read file_metadata of public trip"
  ON public.file_metadata FOR SELECT TO anon
  USING (
    folder LIKE 'trips/%'
    AND public.is_trip_public(NULLIF(split_part(folder, '/', 2), '')::uuid)
  );

CREATE POLICY "anon insert file_metadata for public trip"
  ON public.file_metadata FOR INSERT TO anon
  WITH CHECK (
    folder LIKE 'trips/%'
    AND public.is_trip_public(NULLIF(split_part(folder, '/', 2), '')::uuid)
  );

CREATE POLICY "anon delete file_metadata of public trip"
  ON public.file_metadata FOR DELETE TO anon
  USING (
    folder LIKE 'trips/%'
    AND public.is_trip_public(NULLIF(split_part(folder, '/', 2), '')::uuid)
  );

-- Storage: allow anon to read/upload/delete objects under '<user>/trips/<public_trip_id>/...'
CREATE POLICY "anon read public trip storage"
  ON storage.objects FOR SELECT TO anon
  USING (
    bucket_id = 'user-files'
    AND (storage.foldername(name))[2] = 'trips'
    AND public.is_trip_public(NULLIF((storage.foldername(name))[3], '')::uuid)
  );

CREATE POLICY "anon insert public trip storage"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'user-files'
    AND (storage.foldername(name))[2] = 'trips'
    AND public.is_trip_public(NULLIF((storage.foldername(name))[3], '')::uuid)
  );

CREATE POLICY "anon delete public trip storage"
  ON storage.objects FOR DELETE TO anon
  USING (
    bucket_id = 'user-files'
    AND (storage.foldername(name))[2] = 'trips'
    AND public.is_trip_public(NULLIF((storage.foldername(name))[3], '')::uuid)
  );
