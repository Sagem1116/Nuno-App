
-- push_subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  platform TEXT,
  user_agent TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, fcm_token)
);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- push_sent_log (idempotency for server-side push)
CREATE TABLE public.push_sent_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
CREATE INDEX push_sent_log_sent_at_idx ON public.push_sent_log(sent_at);

GRANT SELECT ON public.push_sent_log TO authenticated;
GRANT ALL ON public.push_sent_log TO service_role;

ALTER TABLE public.push_sent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own push log"
  ON public.push_sent_log FOR SELECT
  USING (auth.uid() = user_id);

-- notification_preferences (server-readable copy of localStorage settings)
CREATE TABLE public.notification_preferences (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  tasks_enabled BOOLEAN NOT NULL DEFAULT true,
  tasks_window_hours INT NOT NULL DEFAULT 24,
  task_start_enabled BOOLEAN NOT NULL DEFAULT true,
  task_end_enabled BOOLEAN NOT NULL DEFAULT true,
  start_lead_minutes INT NOT NULL DEFAULT 5,
  priority_high_only BOOLEAN NOT NULL DEFAULT false,
  daily_enabled BOOLEAN NOT NULL DEFAULT true,
  daily_hour INT NOT NULL DEFAULT 9,
  timezone TEXT NOT NULL DEFAULT 'Europe/Lisbon',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences"
  ON public.notification_preferences FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER notification_preferences_set_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
