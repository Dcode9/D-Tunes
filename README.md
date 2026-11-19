# D-Tunes

D-Tunes is a browser music player for tunes.d-verse.in backed by JioSaavn unofficial API sources.

## Running locally

```bash
npm start
```

Open <http://localhost:3000>. The Node server serves the static app and exposes `/api/music/*` recommendation endpoints. The durable source for listening history and taste profiles is Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_ACCESS_TOKEN`), enabled with `DTUNES_REMOTE_TASTE=1` or automatically on Vercel. A local `data/recommendations.json` file is only a development/offline fallback when remote taste storage is disabled or unavailable; the SQL schema lives in `db/migrations/`.

## Multi-file structure

The original single-file app has been split into:

- `index.html` — app markup and modal/player containers.
- `src/styles.css` — visual styles and responsive/mobile UI rules.
- `src/preload.js` — early mobile/desktop UI-mode detection.
- `src/app.js` — existing player, search, playlist, queue, profile, and frontend recommendation integration.
- `src/recommendationClient.js` — anonymous user/session ID, event debounce, localStorage fallback, and API calls.
- `lib/recommendationEngine.js` — rule-based scoring and ranking engine.
- `lib/saavnClient.js` — JioSaavn unofficial API wrapper.
- `lib/jsonStore.js` — JSON-file persistence fallback implementing the recommendation data model.
- `server.js` — static server plus music API endpoints.
- `db/migrations/` — SQL schema for recommendation, library, and cloud-sync tables.
- `tests/recommendationEngine.test.js` — scoring/ranking tests.

## How the recommender works

The rule-based engine uses no embeddings. Autoplay and mixes use server-side AI curation (configurable with `AI_ENDPOINT`, `AI_MODEL`, and `AI_PROVIDER`), with a deterministic algorithmic fallback when that endpoint is unavailable, throttled, or returns no usable data. The engine itself combines explicit behavior signals, listening history, song metadata, and JioSaavn search/trending results. All AI logic lives server-side, so clients never call the AI endpoint directly.

### Recorded signals

`POST /api/music/event` stores events for:

- `play_start`
- `play_complete`
- `skip`
- `like`
- `unlike`
- `search_play`
- `playlist_add`
- `repeat`
- `queue_add`

The frontend records `play_start` immediately, `play_complete` after 90% progress, `skip` if the listener switches before 50%, `repeat` when the same song starts again shortly, and explicit like/queue/playlist actions. Duplicate events are debounced client-side, and anonymous users get a stable localStorage user ID until auth is available.

### Event scoring

`calculateEventScore(event)` uses configurable weights:

- `like`: `+8`
- `playlist_add`: `+7`
- `repeat`: `+6`
- `play_complete`: `+5`
- `search_play`: `+4`
- `queue_add`: `+3`
- `play_start`: `+1`
- `skip` before 20%: `-6`
- `skip` before 50%: `-3`
- `unlike`: `-8`

Completion progress is also applied:

- `>= 0.9`: `+5`
- `>= 0.7`: `+3`
- `>= 0.5`: `+1`
- `< 0.2`: `-5`

Every event updates `user_song_scores`, including play, completion, skip, like, repeat counts, total score, and last played time.

### Taste profiles

`POST /api/music/recalculate-profile` rebuilds profile maps from event history:

- language scores
- artist scores
- album scores
- decade scores
- mood scores

These maps power recommendations while keeping the architecture ready for a future embedding/vector feature. Future embeddings can become an additional candidate/ranking signal without replacing the current rule-based engine.

### Candidate generation

`getRecommendations(userId, options)` can combine:

- songs already stored in the database/fallback store
- user top artists
- user top languages
- albums similar to played albums
- JioSaavn search results for artist/language/seed queries
- JioSaavn trending/popular fallback songs
- seed-song candidates for similar-song playlists
- seed-artist candidates for artist radio
- late-night fallback queries such as soft/acoustic/romantic songs

Recently played songs from the last 24 hours are excluded unless the playlist is `recently-obsessed`.

### Ranking formula

The final score is:

```text
finalScore =
  0.30 * artistMatchScore
+ 0.20 * languageMatchScore
+ 0.15 * albumMatchScore
+ 0.15 * userSongScore
+ 0.10 * freshnessScore
+ 0.10 * popularityFallbackScore
- recentPenalty
- skipPenalty
```

All weights live in `DEFAULT_WEIGHTS` in `lib/recommendationEngine.js`.

### Diversity rules

The engine strongly penalizes repeatedly skipped songs and limits artist repetition with a default maximum of 3 songs per artist in a 25-song playlist.

## API endpoints

- `POST /api/music/event` — body: `userId` (non-empty string), `eventType` (one of the nine types listed above), and `songSaavnId` or `song.id`/`song.saavn_id` (string). Invalid payloads return `400`; oversized bodies return `413`.
- `POST /api/music/recalculate-profile`
- `POST /api/music/autoplay` (also `GET` with the same parameters as query strings) — `seedSongId` (or `songId`), `userId`, `language`, `currentQueueIds`, `excludedSongIds`, `limit` (8–25, default 10; clamped server-side). A seed is optional; without one, autoplay falls back to trending/popular candidates. Uses server-side AI curation when a seed is available, with an algorithmic fallback. Returns `{ songs: [...] }`.
- `POST /api/music/recommendations` — body: `userId`, `type`, `language`, `limit` (15–25), `currentQueueIds`, `sessionHistory`, `dislikedSongIds`, `negativeTitles`. Returns `{ songs: [...] }`.
- `POST /api/music/mixes` — body: `userId`, `language`, `limit` (15–25 per mix), `currentQueueIds`, `sessionHistory`, `dislikedSongIds`, `negativeTitles`. Returns `{ mixes: [...] }` with five mixes (`daily-mix-1`, `daily-mix-2`, `discover-weekly`, `chill-vibes`, `mood`), each holding 15–25 songs.
- `POST /api/music/feedback` — body: `userId`, `mixKey`, `isLiked`, `reason`, `songId`, `eventType`. Best-effort persistence; returns `{ ok: true }`.
- `GET /api/music/recommendations?userId=...&type=for-you&limit=25`
- `GET /api/music/similar?songId=...&limit=25`
- `GET /api/music/artist-radio?artist=...&userId=...&limit=25`
- `GET /api/music/playlist?type=late-night&userId=...&limit=25`

The POST endpoints apply normalized title/artist exclusions (including dislikes and the current queue), deduplicate tracks, backfill from JioSaavn trending so results meet the requested minimum, and return each song with both web and Android-compatible keys (`id`/`saavn_id`, `title`/`name`, `primary_artists`/`artist`, `album`, `duration`, `url`, `img`/`artwork_url`). Mix curation and autoplay use server-side AI with an algorithmic fallback; durable taste data comes from Supabase, with the local JSON store only as a fallback. All `/api/*` routes answer `OPTIONS` preflight (`Access-Control-Allow-Origin: *`, methods `GET, POST, OPTIONS`, and requested headers such as `Content-Type`/`Authorization`).

## Frontend features

The home page includes:

- a polished `For You` recommendation shelf that stays hidden until personalized songs are available
- generated playlist buttons for For You, Late Night, Discovery, Language Mix, and Recently Obsessed
- `Autoplay For You` and `Add to Queue` actions so generated songs are visible in the queue before/while playing
- player buttons for Similar Songs and Artist/Song Radio

The Library view is kept focused on playlists, liked songs, liked artists, and listening history. Search artist cards can be liked and later reopened from Library. Settings now include bass/mid/treble equalizer controls stored locally. Cold-start users can choose a preferred language and still see JioSaavn trending songs; after the first few plays, behavior events begin personalizing the generated playlists.
