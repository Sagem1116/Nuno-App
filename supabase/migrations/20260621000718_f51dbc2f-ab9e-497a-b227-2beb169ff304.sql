-- Storage RLS policies for the private 'user-files' bucket used by the Drive feature.
-- Users can only manage files inside their own user-id prefix.

-- Allow users to read (download) their own files
CREATE POLICY "Users can read own files" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'user-files' AND storage.filename(name) LIKE auth.uid() || '/%');

-- Allow users to upload files in their own folder
CREATE POLICY "Users can insert own files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'user-files' AND storage.filename(name) LIKE auth.uid() || '/%');

-- Allow users to update their own files
CREATE POLICY "Users can update own files" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'user-files' AND storage.filename(name) LIKE auth.uid() || '/%')
WITH CHECK (bucket_id = 'user-files' AND storage.filename(name) LIKE auth.uid() || '/%');

-- Allow users to delete their own files
CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'user-files' AND storage.filename(name) LIKE auth.uid() || '/%');

-- Allow users to list their own files
CREATE POLICY "Users can list own files" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'user-files' AND name LIKE auth.uid() || '/%');
