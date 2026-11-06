# Changelog

All notable changes to D'Tunes are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.4.5] - 2026-11-06 (Beta 1.4.5)

### Highlights
- **Unified Cross-Platform Sync**: Synchronized Now Playing state, queue, and playback position with D'Tunes Android.
- **Shared Autoplay Web API**: Implemented `POST /api/music/autoplay` with session deduplication and negative feedback filtering.
- **Cloud Search History Mirroring**: Search queries seamlessly mirror between mobile and web via Supabase `dtunes_search_history`.
- **Diwali Everyday Experience**: Warm golden Diya accents, festive quick-play banner, and dedicated daily celebration mixes.

### Added
- `POST /api/music/autoplay` endpoint accepting `seedSongId`, `currentQueueIds`, `excludedSongIds`, `language`, and `limit`.
- `recordSearchHistory`, `listSearchHistory`, and `clearSearchHistoryRemote` in `src/js/dverseClient.js`.
- Diwali Everyday festive card with one-tap celebration playback on the Home feed.
- Comprehensive `Beta_1.4.5.md` architecture guide.

### Changed
- Bumped application version to `1.4.5` in `package.json`.
- Polished home screen layout with festive header accents.

---

## [1.4.0] - 2026-10-15 (Beta 1.4)
- Added cross-platform playback state protocol.
- Enhanced home screen daily mixes persistence.
- Optimized image decoding and progressive unblur.

---

## [1.3.0] - 2026-10-01 (Beta 1.3)
- Initial Daily Mixes recommendation pipeline with once-per-day generation.
- JioSaavn audio stream pre-verification and cover art validation.
- Queue autoplay continuation logic.
