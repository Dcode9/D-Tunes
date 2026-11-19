-- Durable per-user mix feedback shared by the Android app and the web API.
-- The Android app writes here directly and POST /api/music/feedback persists
-- mix ratings through the route layer.
--
-- Safe to re-run in the Supabase SQL editor.

create table if not exists public.dtunes_mix_feedback (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  mix_key text,
  mix_title text,
  is_liked boolean,
  reason text,
  custom_feedback text,
  created_at timestamptz not null default timezone('utc', now())
);

-- Older installs may already have a partial table; fill in missing columns.
alter table public.dtunes_mix_feedback add column if not exists mix_key text;
alter table public.dtunes_mix_feedback add column if not exists mix_title text;
alter table public.dtunes_mix_feedback add column if not exists is_liked boolean;
alter table public.dtunes_mix_feedback add column if not exists reason text;
alter table public.dtunes_mix_feedback add column if not exists custom_feedback text;
alter table public.dtunes_mix_feedback add column if not exists created_at timestamptz not null default timezone('utc', now());

-- The recommendation route reads the newest feedback rows per user.
create index if not exists dtunes_mix_feedback_user_created_idx
  on public.dtunes_mix_feedback (user_id, created_at desc);

alter table public.dtunes_mix_feedback enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'dtunes_mix_feedback'
      and policyname = 'Users manage own dtunes_mix_feedback rows'
  ) then
    create policy "Users manage own dtunes_mix_feedback rows"
      on public.dtunes_mix_feedback
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dtunes_mix_feedback'
  ) then
    execute 'alter publication supabase_realtime add table public.dtunes_mix_feedback';
  end if;
end $$;

alter table public.dtunes_mix_feedback replica identity full;
