
CREATE TABLE public.timer_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timer_categories TO authenticated;
GRANT ALL ON public.timer_categories TO service_role;
ALTER TABLE public.timer_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own categories" ON public.timer_categories FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER timer_categories_updated BEFORE UPDATE ON public.timer_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.timer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.timer_categories(id) ON DELETE SET NULL,
  note text,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timer_sessions TO authenticated;
GRANT ALL ON public.timer_sessions TO service_role;
ALTER TABLE public.timer_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.timer_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER timer_sessions_updated BEFORE UPDATE ON public.timer_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX timer_sessions_user_started ON public.timer_sessions(user_id, started_at DESC);
