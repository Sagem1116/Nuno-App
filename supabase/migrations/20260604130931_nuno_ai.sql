create table if not exists public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_threads enable row level security;

create policy "ai_threads_select_own" on public.ai_threads for select using (auth.uid() = user_id);
create policy "ai_threads_insert_own" on public.ai_threads for insert with check (auth.uid() = user_id);
create policy "ai_threads_update_own" on public.ai_threads for update using (auth.uid() = user_id);
create policy "ai_threads_delete_own" on public.ai_threads for delete using (auth.uid() = user_id);

create index if not exists ai_threads_user_idx on public.ai_threads(user_id, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  message jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.ai_messages enable row level security;

create policy "ai_messages_select_own" on public.ai_messages for select using (auth.uid() = user_id);
create policy "ai_messages_insert_own" on public.ai_messages for insert with check (auth.uid() = user_id);
create policy "ai_messages_delete_own" on public.ai_messages for delete using (auth.uid() = user_id);

create index if not exists ai_messages_thread_idx on public.ai_messages(thread_id, created_at);
