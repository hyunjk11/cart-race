-- 마트 카트 레이싱 (cart-race) — Supabase schema. Idempotent: safe to run again.
-- Paste the whole file into Supabase Dashboard > SQL Editor > New query > Run.
-- Only creates NEW objects prefixed cart_ in the public schema. It does not alter existing tables,
-- and it adds no triggers on auth.users (the game client upserts its own profile row after login).

-- ---------- shared: updated_at trigger function ----------
create or replace function public.cart_set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- cart_profiles: one row per user (nickname used in multiplayer + leaderboard) ----------
create table if not exists public.cart_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '플레이어' check (char_length(nickname) between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cart_profiles enable row level security;
drop policy if exists cart_profiles_select_own on public.cart_profiles;
create policy cart_profiles_select_own on public.cart_profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists cart_profiles_insert_own on public.cart_profiles;
create policy cart_profiles_insert_own on public.cart_profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists cart_profiles_update_own on public.cart_profiles;
create policy cart_profiles_update_own on public.cart_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop trigger if exists cart_profiles_updated_at on public.cart_profiles;
create trigger cart_profiles_updated_at before update on public.cart_profiles for each row execute function public.cart_set_updated_at();

-- ---------- cart_progress: one row per user, game save as jsonb ----------
-- data = { coins, owned{slot:[ids]}, loadout{slot:id}, char, best{map:seconds}, stats{…}, settings{…} }
create table if not exists public.cart_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 65536),
  merged boolean not null default false, -- guest progress of some device was merged in once
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cart_progress enable row level security;
drop policy if exists cart_progress_select_own on public.cart_progress;
create policy cart_progress_select_own on public.cart_progress for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists cart_progress_insert_own on public.cart_progress;
create policy cart_progress_insert_own on public.cart_progress for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists cart_progress_update_own on public.cart_progress;
create policy cart_progress_update_own on public.cart_progress for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop trigger if exists cart_progress_updated_at on public.cart_progress;
create trigger cart_progress_updated_at before update on public.cart_progress for each row execute function public.cart_set_updated_at();

-- ---------- cart_records: best lap per user per map (leaderboard) ----------
create table if not exists public.cart_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  map text not null check (map ~ '^[a-z0-9_]{1,20}$'),
  lap_ms integer not null check (lap_ms between 3000 and 600000),
  nickname text not null default '플레이어' check (char_length(nickname) between 1 and 10),
  char text check (char is null or char ~ '^[a-z0-9_]{1,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, map)
);
create index if not exists cart_records_map_lap on public.cart_records (map, lap_ms);
alter table public.cart_records enable row level security;
drop policy if exists cart_records_select_all on public.cart_records;
create policy cart_records_select_all on public.cart_records for select to anon, authenticated using (true);
drop policy if exists cart_records_insert_own on public.cart_records;
create policy cart_records_insert_own on public.cart_records for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists cart_records_update_own on public.cart_records;
create policy cart_records_update_own on public.cart_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop trigger if exists cart_records_updated_at on public.cart_records;
create trigger cart_records_updated_at before update on public.cart_records for each row execute function public.cart_set_updated_at();
-- a record can only get better
create or replace function public.cart_records_keep_best() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.lap_ms > old.lap_ms then new.lap_ms = old.lap_ms; new.char = old.char; end if;
  return new;
end $$;
drop trigger if exists cart_records_keep_best on public.cart_records;
create trigger cart_records_keep_best before update on public.cart_records for each row execute function public.cart_records_keep_best();

-- ---------- privileges ----------
-- public read of the leaderboard columns only (user_id stays private)
revoke all on public.cart_records from anon, authenticated;
grant select (map, lap_ms, nickname, char, updated_at) on public.cart_records to anon, authenticated;
grant insert (user_id, map, lap_ms, nickname, char) on public.cart_records to authenticated;
revoke all on public.cart_profiles, public.cart_progress from anon;
grant select, insert, update on public.cart_profiles, public.cart_progress to authenticated;

-- submit a lap: inserts or improves the caller's own row (update path needs no SELECT on user_id)
create or replace function public.cart_submit_lap(p_map text, p_lap_ms integer, p_nickname text, p_char text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); best integer;
begin
  if uid is null then raise exception 'not logged in'; end if;
  insert into public.cart_records as r (user_id, map, lap_ms, nickname, char)
  values (uid, p_map, p_lap_ms, left(coalesce(nullif(trim(p_nickname), ''), '플레이어'), 10), p_char)
  on conflict (user_id, map) do update
    set lap_ms = least(r.lap_ms, excluded.lap_ms),
        char = case when excluded.lap_ms < r.lap_ms then excluded.char else r.char end,
        nickname = excluded.nickname
  returning lap_ms into best;
  return best;
end $$;
revoke all on function public.cart_submit_lap(text, integer, text, text) from public, anon;
grant execute on function public.cart_submit_lap(text, integer, text, text) to authenticated;

-- PostgREST: pick up the new tables immediately
notify pgrst, 'reload schema';
