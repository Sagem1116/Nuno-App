DROP POLICY IF EXISTS "Users can read own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can insert own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can list own files" ON storage.objects;

CREATE POLICY "Users can read own files" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'user-files' AND name LIKE auth.uid() || '/%');

CREATE POLICY "Users can insert own files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'user-files' AND name LIKE auth.uid() || '/%');

CREATE POLICY "Users can update own files" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'user-files' AND name LIKE auth.uid() || '/%')
WITH CHECK (bucket_id = 'user-files' AND name LIKE auth.uid() || '/%');

CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'user-files' AND name LIKE auth.uid() || '/%');
