-- D'Tunes cloud sync schema shared by the web player and the Android app.
-- Safe to re-run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.dtunes_tracks (
  id text primary key,
  title text not null default 'Unknown Track',
  artist text,
  album text,
  duration_ms integer,
  artwork_url text,
  source text not null default 'jiosaavn',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.dtunes_history (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null references public.dtunes_tracks (id) on delete cascade,
  played_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms integer,
  client text,
  context jsonb not null default '{}'::jsonb,
  client_event_id uuid default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.dtunes_history add column if not exists client_event_id uuid default gen_random_uuid();
update public.dtunes_history set client_event_id = gen_random_uuid() where client_event_id is null;
alter table public.dtunes_history alter column client_event_id set not null;
create unique index if not exists dtunes_history_client_event_id_uidx
  on public.dtunes_history (client_event_id);
create index if not exists dtunes_history_user_played_idx
  on public.dtunes_history (user_id, played_at desc);

create table if not exists public.dtunes_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null references public.dtunes_tracks (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, track_id)
);

create table if not exists public.dtunes_library (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null references public.dtunes_tracks (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, track_id)
);

create table if not exists public.dtunes_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.dtunes_playlists add column if not exists style jsonb default '{}'::jsonb;

create table if not exists public.dtunes_playlist_items (
  playlist_id uuid not null references public.dtunes_playlists (id) on delete cascade,
  track_id text not null references public.dtunes_tracks (id) on delete cascade,
  position integer not null default 0,
  primary key (playlist_id, track_id)
);

create table if not exists public.dtunes_playback_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  track_id text references public.dtunes_tracks (id) on delete set null,
  playback_state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.dtunes_search_history (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text references public.dtunes_tracks (id) on delete cascade,
  query text,
  searched_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.dtunes_search_history alter column track_id drop not null;
create index if not exists dtunes_search_history_user_idx
  on public.dtunes_search_history (user_id, searched_at desc);

create table if not exists public.dtunes_listening_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null references public.dtunes_tracks (id) on delete cascade,
  play_count integer not null default 0,
  total_duration_ms bigint not null default 0,
  last_played_at timestamptz,
  primary key (user_id, track_id)
);

create table if not exists public.dtunes_listening_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  play_count integer not null default 0,
  total_duration_ms bigint not null default 0,
  primary key (user_id, day)
);

create table if not exists public.dtunes_daily_mixes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  date_key text not null,
  playlists jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.dtunes_feedback (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null,
  name text,
  email text,
  category text,
  rating integer,
  message text,
  user_agent text,
  app_version text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.dtunes_feedback add column if not exists user_id uuid references auth.users (id) on delete set null;

do $$
declare
  t text;
begin
  foreach t in array array[
    'dtunes_tracks', 'dtunes_history', 'dtunes_likes', 'dtunes_library',
    'dtunes_playlists', 'dtunes_playlist_items', 'dtunes_playback_state',
    'dtunes_search_history', 'dtunes_listening_stats', 'dtunes_listening_daily',
    'dtunes_daily_mixes', 'dtunes_feedback'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

do $$
declare
  t text;
  policy_name text;
begin
  foreach t in array array[
    'dtunes_tracks', 'dtunes_history', 'dtunes_likes', 'dtunes_library',
    'dtunes_playlists', 'dtunes_playlist_items', 'dtunes_playback_state',
    'dtunes_search_history', 'dtunes_listening_stats', 'dtunes_listening_daily',
    'dtunes_daily_mixes', 'dtunes_feedback'
  ] loop
    policy_name := 'Users manage own ' || t || ' rows';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = policy_name
    ) then
      if t = 'dtunes_tracks' then
        execute format(
          'create policy "Users manage own %I rows" on public.%I for all to authenticated using (true) with check (true)',
          t, t
        );
      elsif t = 'dtunes_playlist_items' then
        execute format(
          'create policy "Users manage own %I rows" on public.%I for all ' ||
          'using (exists (select 1 from public.dtunes_playlists p where p.id = playlist_id and p.user_id = auth.uid())) ' ||
          'with check (exists (select 1 from public.dtunes_playlists p where p.id = playlist_id and p.user_id = auth.uid()))',
          t, t
        );
      else
        execute format(
          'create policy "Users manage own %I rows" on public.%I for all ' ||
          'using (auth.uid() = user_id) with check (auth.uid() = user_id)',
          t, t
        );
      end if;
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'dtunes_feedback' and policyname = 'Anyone can submit feedback'
  ) then
    create policy "Anyone can submit feedback"
      on public.dtunes_feedback for insert to anon with check (true);
  end if;
end $$;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'dtunes_tracks', 'dtunes_history', 'dtunes_search_history', 'dtunes_library',
    'dtunes_likes', 'dtunes_playlists', 'dtunes_playlist_items', 'dtunes_playback_state',
    'dtunes_listening_stats', 'dtunes_listening_daily', 'dtunes_daily_mixes', 'dtunes_feedback'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;
