-- D'Tunes search history sync across Web and Android
-- Run in Supabase SQL editor for the D'Verse project.

create table if not exists public.dtunes_search_history (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id text not null references public.dtunes_tracks (id) on delete cascade,
  query text,
  searched_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists dtunes_search_history_user_idx
  on public.dtunes_search_history (user_id, searched_at desc);

alter table public.dtunes_search_history enable row level security;

create policy "Users manage own search history"
  on public.dtunes_search_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
