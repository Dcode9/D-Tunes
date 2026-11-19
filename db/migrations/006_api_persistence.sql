-- Durable server-side taste reads for the recommendation API.
-- The route layer reads public.dtunes_history / dtunes_likes / dtunes_library
-- through Supabase PostgREST instead of the instance-local JSON file.
--
-- Safe to re-run in the Supabase SQL editor.
-- Row Level Security stays enabled; these statements only add read-path indexes
-- and constraints (they do not widen access). Reads therefore still require a
-- user access token or a policy that matches auth.uid().

-- Newest-first history scans per user are the hot path for taste hydration.
create index if not exists dtunes_history_user_played_idx
  on public.dtunes_history (user_id, played_at desc);

-- Covering variant avoids heap fetches for the columns the API selects.
create index if not exists dtunes_history_user_played_cover_idx
  on public.dtunes_history (user_id, played_at desc)
  include (track_id, duration_ms, context, client, client_event_id);

-- Track lookups used when the API joins/resolves metadata for history rows.
create index if not exists dtunes_history_track_idx
  on public.dtunes_history (track_id);

-- Like and library hydration: newest-first per user, plus track lookups.
create index if not exists dtunes_likes_user_created_idx
  on public.dtunes_likes (user_id, created_at desc);

create index if not exists dtunes_likes_track_idx
  on public.dtunes_likes (track_id);

create index if not exists dtunes_library_user_created_idx
  on public.dtunes_library (user_id, created_at desc);

create index if not exists dtunes_library_track_idx
  on public.dtunes_library (track_id);

-- History keyset reads depend on a non-null timestamp; keep the invariant even
-- if a client inserts an explicit row without one.
alter table public.dtunes_history alter column played_at set default timezone('utc', now());
alter table public.dtunes_history alter column played_at set not null;

-- Guard against negative listened durations corrupting completion ratios.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'dtunes_history_duration_ms_nonnegative'
      and conrelid = 'public.dtunes_history'::regclass
  ) then
    alter table public.dtunes_history
      add constraint dtunes_history_duration_ms_nonnegative
      check (duration_ms is null or duration_ms >= 0);
  end if;
end $$;
