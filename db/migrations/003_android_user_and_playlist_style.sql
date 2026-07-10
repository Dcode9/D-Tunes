-- Track first Android sign-in and playlist cover styles for D'Tunes.
alter table public.profiles
  add column if not exists android_first_signed_in_at timestamptz,
  add column if not exists android_client_version text;

alter table public.dtunes_playlists
  add column if not exists style jsonb default '{}'::jsonb;

comment on column public.profiles.android_first_signed_in_at is 'First time this user signed in from the D''Tunes Android app';
comment on column public.dtunes_playlists.style is 'Playlist cover style: icon, color, shape, and shape params';
