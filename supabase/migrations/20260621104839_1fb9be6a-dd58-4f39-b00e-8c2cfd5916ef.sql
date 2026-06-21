
ALTER TABLE public.timer_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.timer_categories(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS timer_categories_parent_id_idx ON public.timer_categories(parent_id);

ALTER TABLE public.timer_sessions
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_ms bigint NOT NULL DEFAULT 0;
