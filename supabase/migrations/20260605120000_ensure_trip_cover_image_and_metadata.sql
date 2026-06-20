-- Ensure Travel Planner trip metadata columns exist
alter table public.trips
  add column if not exists name text not null default '',
  add column if not exists description text not null default '',
  add column if not exists secondary_destinations text[] not null default '{}',
  add column if not exists currency text not null default 'EUR',
  add column if not exists cover_image text,
  add column if not exists status text not null default 'planned' check (status in ('planned','confirmed','ongoing','completed','cancelled'));
