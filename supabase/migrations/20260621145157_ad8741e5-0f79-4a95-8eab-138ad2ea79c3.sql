WITH ranked_duplicates AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, started_at, ended_at
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS duplicate_rank
  FROM public.timer_sessions
  WHERE ended_at IS NOT NULL
)
DELETE FROM public.timer_sessions
WHERE id IN (
  SELECT id
  FROM ranked_duplicates
  WHERE duplicate_rank > 1
);

ALTER TABLE public.timer_sessions
ADD CONSTRAINT timer_sessions_user_started_ended_unique
UNIQUE (user_id, started_at, ended_at);