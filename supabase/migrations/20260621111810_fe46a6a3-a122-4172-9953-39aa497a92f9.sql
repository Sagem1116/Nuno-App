
-- Categories
CREATE TABLE public.activity_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_categories TO authenticated;
GRANT ALL ON public.activity_categories TO service_role;
ALTER TABLE public.activity_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activity_categories" ON public.activity_categories FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_activity_categories_updated BEFORE UPDATE ON public.activity_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Projects
CREATE TABLE public.activity_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#10b981',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_projects TO authenticated;
GRANT ALL ON public.activity_projects TO service_role;
ALTER TABLE public.activity_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activity_projects" ON public.activity_projects FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_activity_projects_updated BEFORE UPDATE ON public.activity_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Rules
CREATE TABLE public.activity_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('app_name','window_title_contains')),
  pattern TEXT NOT NULL,
  category_id UUID REFERENCES public.activity_categories(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.activity_projects(id) ON DELETE SET NULL,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_rules TO authenticated;
GRANT ALL ON public.activity_rules TO service_role;
ALTER TABLE public.activity_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activity_rules" ON public.activity_rules FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_activity_rules_user_type ON public.activity_rules(user_id, rule_type);
CREATE TRIGGER trg_activity_rules_updated BEFORE UPDATE ON public.activity_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Logs
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_seconds INT NOT NULL,
  app_name TEXT NOT NULL DEFAULT '',
  window_title TEXT NOT NULL DEFAULT '',
  category_id UUID REFERENCES public.activity_categories(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.activity_projects(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'activitywatch',
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activity_logs" ON public.activity_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_activity_logs_user_start ON public.activity_logs(user_id, start_time DESC);
CREATE INDEX idx_activity_logs_user_cat ON public.activity_logs(user_id, category_id);
CREATE INDEX idx_activity_logs_user_proj ON public.activity_logs(user_id, project_id);
CREATE TRIGGER trg_activity_logs_updated BEFORE UPDATE ON public.activity_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
