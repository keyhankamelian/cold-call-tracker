-- Cold Call Accountability Tracker — Supabase schema
-- Paste this whole file into Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run: uses IF NOT EXISTS and drops/recreates policies.

-- ---------------------------------------------------------------
-- 1. campaigns: one row per user (setup + outcome counters)
-- ---------------------------------------------------------------
create table if not exists public.campaigns (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  client_name      text not null default '',
  close_goal       integer not null default 0 check (close_goal >= 0),
  bookings_per_100 numeric not null default 0 check (bookings_per_100 >= 0),
  show_rate        numeric not null default 0 check (show_rate >= 0 and show_rate <= 100),
  close_rate       numeric not null default 0 check (close_rate >= 0 and close_rate <= 100),
  working_days     integer not null default 20 check (working_days > 0),
  shows            integer not null default 0 check (shows >= 0),
  closes           integer not null default 0 check (closes >= 0),
  last_saved       timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 2. call_logs: one row per logged session
-- ---------------------------------------------------------------
create table if not exists public.call_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        integer not null check (day > 0),
  dials      integer not null default 0 check (dials >= 0),
  bookings   integer not null default 0 check (bookings >= 0),
  created_at timestamptz not null default now()
);

create index if not exists call_logs_user_day_idx
  on public.call_logs (user_id, day, created_at);

-- ---------------------------------------------------------------
-- 3. Row Level Security: each user only sees / edits their own rows
-- ---------------------------------------------------------------
alter table public.campaigns enable row level security;
alter table public.call_logs enable row level security;

drop policy if exists "campaigns_select_own" on public.campaigns;
drop policy if exists "campaigns_insert_own" on public.campaigns;
drop policy if exists "campaigns_update_own" on public.campaigns;
drop policy if exists "campaigns_delete_own" on public.campaigns;

create policy "campaigns_select_own" on public.campaigns
  for select using (auth.uid() = user_id);
create policy "campaigns_insert_own" on public.campaigns
  for insert with check (auth.uid() = user_id);
create policy "campaigns_update_own" on public.campaigns
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "campaigns_delete_own" on public.campaigns
  for delete using (auth.uid() = user_id);

drop policy if exists "call_logs_select_own" on public.call_logs;
drop policy if exists "call_logs_insert_own" on public.call_logs;
drop policy if exists "call_logs_update_own" on public.call_logs;
drop policy if exists "call_logs_delete_own" on public.call_logs;

create policy "call_logs_select_own" on public.call_logs
  for select using (auth.uid() = user_id);
create policy "call_logs_insert_own" on public.call_logs
  for insert with check (auth.uid() = user_id);
create policy "call_logs_update_own" on public.call_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "call_logs_delete_own" on public.call_logs
  for delete using (auth.uid() = user_id);
