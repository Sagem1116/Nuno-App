ALTER TABLE public.timer_sessions
  ADD COLUMN IF NOT EXISTS reminders_minutes integer[] NOT NULL DEFAULT '{}'::int[];