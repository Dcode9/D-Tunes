-- Rule-based recommendation storage for D'Tunes.
-- PostgreSQL schema. For simple/local deployments the Node server also has a JSON-file fallback.

CREATE TABLE IF NOT EXISTS songs (
    id BIGSERIAL PRIMARY KEY,
    saavn_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    primary_artists TEXT,
    featured_artists TEXT,
    album TEXT,
    language TEXT,
    year INTEGER,
    image_url TEXT,
    duration_seconds INTEGER,
    play_url TEXT,
    raw_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_events (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'play_start', 'play_complete', 'skip', 'like', 'unlike',
        'search_play', 'playlist_add', 'repeat', 'queue_add'
    )),
    play_duration_seconds INTEGER,
    song_duration_seconds INTEGER,
    progress_ratio NUMERIC(5,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    context JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_user_events_user_created ON user_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_song ON user_events(song_id);

CREATE TABLE IF NOT EXISTS user_song_scores (
    user_id TEXT NOT NULL,
    song_id BIGINT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    score NUMERIC(10,2) NOT NULL DEFAULT 0,
    play_count INTEGER NOT NULL DEFAULT 0,
    complete_count INTEGER NOT NULL DEFAULT 0,
    skip_count INTEGER NOT NULL DEFAULT 0,
    like_count INTEGER NOT NULL DEFAULT 0,
    repeat_count INTEGER NOT NULL DEFAULT 0,
    last_played_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_user_song_scores_user_score ON user_song_scores(user_id, score DESC);

CREATE TABLE IF NOT EXISTS user_taste_profiles (
    user_id TEXT PRIMARY KEY,
    language_scores_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    artist_scores_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    album_scores_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    decade_scores_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    mood_scores_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendation_cache (
    user_id TEXT NOT NULL,
    playlist_type TEXT NOT NULL,
    song_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, playlist_type)
);
