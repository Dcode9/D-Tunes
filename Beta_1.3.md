# D'Tunes Beta 1.3: Recommendation Engine, Home Screen & Autoplay Architecture

This document breaks down the core functional and conceptual design of **Beta 1.3**, focusing specifically on the **recommendation system**, the **home screen lifecycle**, and the **queue autoplay engine**. It details how each system behaves and operates from the listener's perspective, without technical code syntax.

---

## 1. Recommendation System & Curation Model

### The Philosophy
Rather than generic algorithm feeds or repetitive top-charts, recommendations are curated like a music director hand-crafting tailored daily stations. The recommendation model evaluates the user's holistic listening profile:

1. **User Custom Playlists**:
   - Analyzes custom user-created playlists with their song titles and track durations.
   - Detects niche tastes, moods, and hand-curated collections that standard listening history might miss.
2. **Track Play Times & Duration Metrics**:
   - Takes into account not just *what* was played, but *how long* and *how often* it was listened to.
   - Songs with long completion rates and high repeat counts carry far greater weight than songs skipped early.
3. **Stream History & Recent Timestamps**:
   - Captures recent musical direction and chronological transitions over the last several listening sessions.
4. **Top Played Artists & Affinity**:
   - Identifies primary core artists while keeping variety so that recommendations do not collapse into single-artist loops.
5. **Liked & Library Tracks**:
   - Explicit positive affinity signals representing the foundation of the user's catalog.
6. **Strict Dislikes ("Don't Recommend This")**:
   - Explicit negative feedback signals. Any song or artist flagged with a dislike is blocked from appearing across all recommended shelves and continuations.

---

## 2. Home Screen Flow & Verification Pipeline

### A. Once-Per-Day Synchronization (Supabase Persistence)
- **Only Active When Signed In**:
  - Daily personal recommendations are tied to the authenticated user account.
  - If a user is signed out, the home screen presents a clean sign-in prompt explaining that daily mixes require an account.
- **Daily Persistence Strategy**:
  - The home screen does **not** re-generate recommendations on every page refresh or app open.
  - When a signed-in user opens D'Tunes, the client checks the database for today's date key.
  - If today's mixes already exist in the database, they are loaded immediately.
  - If today's mixes have not yet been generated (or it is a new calendar day), the generation pipeline runs once, verifies every song, and records the new day's mixes in the database.
  - Only today's mixes are kept active for the user, rather than cluttering an indefinite archive of historical days.

### B. Strict Audio & Album Art Pre-Verification
A major issue with music search engines is missing audio streams or fallback/broken album art. The recommendation pipeline solves this with an absolute verification gate:
- **Audio Verification**:
  - Every suggested track is looked up via JioSaavn.
  - If JioSaavn cannot resolve a verified, streamable audio URL, the track is **completely rejected**.
- **Artwork Verification**:
  - Every track's cover image is checked.
  - If JioSaavn fails to return a genuine high-resolution album cover, or returns a generic placeholder/SVG icon, the track is **completely rejected**.
- **Result**:
  - No broken songs or blank art ever appear on the home screen.
  - A mix shelf is only rendered if it contains at least two verified, fully streamable tracks with confirmed artwork.

### C. Visual Presentation & Progressive Unblur Animation
- **Skeleton Screen Loading**:
  - When fetching or generating mixes, the home screen presents structured skeleton cards matching the exact layout of the real shelves.
- **Progressive Reveal**:
  - Once metadata resolves, the album art starts with a soft blur (`blur(14px)`) and reduced opacity.
  - As the high-resolution artwork loads into the browser, it smoothly unblurs (`blur(0px)`) and fades into full clarity.
  - Song titles and artist details follow with a synchronized fade-in and subtle lift animation.

### D. Clean, Consumer-Friendly Interface
- **Zero Technical/AI Jargon**:
  - Technical terms, model names, internal generation parameters, and developer controls have been purged from the home screen.
  - The shelves are presented naturally as personalized daily music collections ("Made For You", "Daily Mixes").
- **Full Row & Playlist Controls**:
  - Each recommended shelf includes standard playlist action buttons (e.g., "Play", "Add to Queue") alongside standard swipe gestures and context menus.

---

## 3. Queue Autoplay Continuation Logic

### How It Works
Autoplay ensures that music never abruptly stops when the active queue finishes:

1. **Trigger Condition**:
   - The queue monitor checks the playback queue as tracks conclude.
   - When the queue is empty or reaches the end of the user's queued tracks, the autoplay continuation engine triggers automatically.
2. **Contextual Seed Selection**:
   - The engine selects the currently playing song (or most recent track) as the seed reference.
3. **Harmonic & Vibe Matching**:
   - Pulls **5 to 10 contextually matched songs** that share harmonic continuity, tempo alignment, and emotional energy with the seed song.
   - Enforces artist variety so the queue does not flood with songs from only one artist.
4. **Strict Negative Signal Enforcement**:
   - Disliked and hidden songs are strictly excluded from the autoplay pool.
5. **Pre-Verification Filter**:
   - Every autoplay candidate is checked for streamable audio URLs and valid artwork before entering the queue.
6. **Queue Injection**:
   - Verified songs are appended to the queue, displaying a simple toast notification: *"Added songs to queue for continuous playback"*, with no technical or internal jargon exposed to the listener.

---

## 4. Summary Table of Core Behaviors

| Feature | Listener Experience & Behavior |
|---|---|
| **Daily Mix Generation** | Generates once every 24 hours per signed-in user. Re-used instantly throughout the day from cloud storage. |
| **Signed-Out State** | Displays a clean prompt to sign in; avoids burning unnecessary computation without a taste profile. |
| **Taste Inputs** | Evaluates playlists, play counts, total listening time, recent history timestamps, liked tracks, and explicit dislikes. |
| **Track Reliability** | Strict validation rule: if JioSaavn has no valid stream or no genuine cover art, the song is discarded. |
| **Loading UX** | Shimmering layout skeletons -> smooth blur-to-sharp image transition with typography fade-in. |
| **Autoplay** | Adds 5–10 stylistically harmonious songs to the queue when tracks run out. Excludes dislikes, avoids single-artist repetition. |
| **Tone & Messaging** | Clean, consumer-grade music player experience. No technical prompts, dev badges, or AI branding shown to the user. |
