-- D'Tunes cross-platform library (separate from likes)
-- Run in Supabase SQL editor for the D'Verse project.

create table if not exists public.dtunes_library (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null references public.dtunes_tracks (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, track_id)
);

create index if not exists dtunes_library_user_created_idx
  on public.dtunes_library (user_id, created_at desc);

alter table public.dtunes_library enable row level security;

create policy "Users manage own library rows"
  on public.dtunes_library
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
