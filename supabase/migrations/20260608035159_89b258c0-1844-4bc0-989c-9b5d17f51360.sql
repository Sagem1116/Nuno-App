
CREATE TABLE public.drive_external_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drive_external_links TO authenticated;
GRANT ALL ON public.drive_external_links TO service_role;

ALTER TABLE public.drive_external_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own drive external links"
  ON public.drive_external_links FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX drive_external_links_user_idx ON public.drive_external_links(user_id, created_at DESC);

CREATE TRIGGER drive_external_links_updated_at
  BEFORE UPDATE ON public.drive_external_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
