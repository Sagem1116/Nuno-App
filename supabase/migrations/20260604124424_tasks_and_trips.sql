-- Tasks
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  due_date date,
  status text not null default 'pending' check (status in ('pending','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "tasks_select_own" on public.tasks for select using (auth.uid() = user_id);
create policy "tasks_insert_own" on public.tasks for insert with check (auth.uid() = user_id);
create policy "tasks_update_own" on public.tasks for update using (auth.uid() = user_id);
create policy "tasks_delete_own" on public.tasks for delete using (auth.uid() = user_id);

create index if not exists tasks_user_due_idx on public.tasks(user_id, due_date);

-- Trips
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  start_date date,
  end_date date,
  budget numeric(12,2),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trips enable row level security;

create policy "trips_select_own" on public.trips for select using (auth.uid() = user_id);
create policy "trips_insert_own" on public.trips for insert with check (auth.uid() = user_id);
create policy "trips_update_own" on public.trips for update using (auth.uid() = user_id);
create policy "trips_delete_own" on public.trips for delete using (auth.uid() = user_id);

-- Trip items
create table if not exists public.trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('checklist','link','idea')),
  label text not null,
  url text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.trip_items enable row level security;

create policy "trip_items_select_own" on public.trip_items for select using (auth.uid() = user_id);
create policy "trip_items_insert_own" on public.trip_items for insert with check (auth.uid() = user_id);
create policy "trip_items_update_own" on public.trip_items for update using (auth.uid() = user_id);
create policy "trip_items_delete_own" on public.trip_items for delete using (auth.uid() = user_id);

create index if not exists trip_items_trip_idx on public.trip_items(trip_id);
