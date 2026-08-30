# D-Tunes

D-Tunes is a browser music player for tunes.dverse.fun backed by JioSaavn unofficial API sources.

## Running locally

```bash
npm start
```

Open <http://localhost:3000>. The Node server serves the static app and exposes `/api/music/*` recommendation endpoints. Local/simple deployments use `data/recommendations.json` as a persistence fallback; production deployments should apply the PostgreSQL migration in `db/migrations/001_recommendations.sql` and wire the same repository interface to Postgres.

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
- `db/migrations/001_recommendations.sql` — PostgreSQL schema.
- `tests/recommendationEngine.test.js` — scoring/ranking tests.

## Security & performance hardening

The server applies the following protections (see `tests/hardening.test.js`):

- **Static allow-listing** — repo internals (`.git/`, `data/`, `lib/`, `db/`, `tests/`, `server.js`, `.env*`, …) are never served; public assets get `ETag`/`304` revalidation, cache headers, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.
- **Request validation** — `POST /api/music/event` only accepts the documented event types, caps request bodies at 64 KB (HTTP 413), and is rate limited per IP (60 req/min, HTTP 429).
- **Limit sanitization** — playlist/recommendation `limit` params are clamped to 1–100 (default 25) instead of silently returning empty results on bad input.
- **Resilience** — the JioSaavn wrapper fails over across four community API mirrors with per-request timeouts; external candidate fetching runs in parallel; identical playlist queries are served from a short-lived in-memory cache.
- **Storage hygiene** — the JSON store compacts raw song metadata, prunes old events (configurable via `DTUNES_MAX_EVENTS`), and writes the file once per event. `data/` is git-ignored.
- **Health check** — `GET /api/music/health` returns service status and uptime.

## Mobile now-playing sheet

The expanded mobile player is a dedicated `#mobile-player-sheet` overlay (see `tests/mobilePlayerSheet.test.js`) rather than a CSS re-arrangement of the desktop footer. It stacks album art → song info (centered) → seek bar + transport controls → internally scrollable queue/history, slides in and out with a single transform animation, supports swipe-to-change-track on the art and pull-down-to-close, and bans horizontal scrolling. All seek bars share one pointer-capture based controller (44px touch targets, `touch-action: none`, window-level drag release) so seeking always tracks the real song.

## How the recommender works

No embeddings or paid APIs are used. The engine combines explicit behavior signals, listening history, song metadata, and JioSaavn search/trending results.

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

- `POST /api/music/event`
- `GET /api/music/recommendations?userId=...&type=for-you&limit=25`
- `GET /api/music/similar?songId=...&limit=25`
- `GET /api/music/artist-radio?artist=...&userId=...&limit=25`
- `GET /api/music/playlist?type=late-night&userId=...&limit=25`
- `POST /api/music/recalculate-profile`

## Frontend features

The home page includes:

- a polished `For You` recommendation shelf that stays hidden until personalized songs are available
- generated playlist buttons for For You, Late Night, Discovery, Language Mix, and Recently Obsessed
- `Autoplay For You` and `Add to Queue` actions so generated songs are visible in the queue before/while playing
- player buttons for Similar Songs and Artist/Song Radio

The Library view is kept focused on playlists, liked songs, liked artists, and listening history. Search artist cards can be liked and later reopened from Library. Settings now include bass/mid/treble equalizer controls stored locally. Cold-start users can choose a preferred language and still see JioSaavn trending songs; after the first few plays, behavior events begin personalizing the generated playlists.
