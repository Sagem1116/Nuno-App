-- Travel Planner extensions: trip metadata, itinerary days, items and attachments

alter table public.trips
  add column if not exists name text not null default '',
  add column if not exists description text not null default '',
  add column if not exists secondary_destinations text[] not null default '{}',
  add column if not exists currency text not null default 'EUR',
  add column if not exists cover_image text,
  add column if not exists status text not null default 'planned' check (status in ('planned','confirmed','ongoing','completed','cancelled'));

CREATE TABLE IF NOT EXISTS public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day_order integer not null default 0,
  day_date date,
  title text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trip_days enable row level security;

create policy "trip_days_select_own" on public.trip_days for select using (auth.uid() = user_id);
create policy "trip_days_insert_own" on public.trip_days for insert with check (auth.uid() = user_id);
create policy "trip_days_update_own" on public.trip_days for update using (auth.uid() = user_id);
create policy "trip_days_delete_own" on public.trip_days for delete using (auth.uid() = user_id);

create index if not exists trip_days_trip_order_idx on public.trip_days(trip_id, day_order);

CREATE TABLE IF NOT EXISTS public.trip_itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_id uuid not null references public.trip_days(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('activity','restaurant','transport','flight','note')),
  title text not null,
  description text not null default '',
  scheduled_at timestamptz,
  location text not null default '',
  notes text not null default '',
  order_index integer not null default 0,
  amount numeric(12,2),
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trip_itinerary_items enable row level security;

create policy "trip_itinerary_items_select_own" on public.trip_itinerary_items for select using (auth.uid() = user_id);
create policy "trip_itinerary_items_insert_own" on public.trip_itinerary_items for insert with check (auth.uid() = user_id);
create policy "trip_itinerary_items_update_own" on public.trip_itinerary_items for update using (auth.uid() = user_id);
create policy "trip_itinerary_items_delete_own" on public.trip_itinerary_items for delete using (auth.uid() = user_id);

create index if not exists trip_itinerary_items_trip_idx on public.trip_itinerary_items(trip_id);
create index if not exists trip_itinerary_items_day_order_idx on public.trip_itinerary_items(day_id, order_index);

CREATE TABLE IF NOT EXISTS public.trip_item_attachments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_id uuid not null references public.trip_days(id) on delete cascade,
  item_id uuid not null references public.trip_itinerary_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_metadata_id uuid not null references public.file_metadata(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trip_item_attachments enable row level security;

create policy "trip_item_attachments_select_own" on public.trip_item_attachments for select using (auth.uid() = user_id);
create policy "trip_item_attachments_insert_own" on public.trip_item_attachments for insert with check (auth.uid() = user_id);
create policy "trip_item_attachments_update_own" on public.trip_item_attachments for update using (auth.uid() = user_id);
create policy "trip_item_attachments_delete_own" on public.trip_item_attachments for delete using (auth.uid() = user_id);

create index if not exists trip_item_attachments_item_idx on public.trip_item_attachments(item_id);
create index if not exists trip_item_attachments_user_idx on public.trip_item_attachments(user_id);
