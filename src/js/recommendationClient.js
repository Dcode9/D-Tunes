(function () {
  const ANON_USER_KEY = 'dtunesAnonymousUserId';
  const LOCAL_EVENTS_KEY = 'dtunesRecommendationEvents';
  const DUPLICATE_WINDOW_MS = 3500;
  const API_TIMEOUT_MS = 12000;
  const EVENT_TIMEOUT_MS = 4000;
  const DEFAULT_LIMIT = 20;
  const MIN_LIMIT = 15;
  const MAX_LIMIT = 25;

  function isOffline() {
    try {
      if (typeof window !== 'undefined' && typeof window.__dtunesIsOffline === 'function') return window.__dtunesIsOffline();
      return typeof navigator !== 'undefined' && navigator.onLine === false;
    } catch (_) {
      return false;
    }
  }

  function getUserId() {
    if (typeof window !== 'undefined' && window.cloudLibrary?.session?.user?.id) {
      return window.cloudLibrary.session.user.id;
    }
    let userId = localStorage.getItem(ANON_USER_KEY);
    if (!userId) {
      userId = `anon_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
      localStorage.setItem(ANON_USER_KEY, userId);
    }
    return userId;
  }

  function normalizeLimit(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_LIMIT;
    return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.round(n)));
  }

  function toApiSong(song) {
    if (!song) return null;
    return {
      saavn_id: song.saavn_id || song.id || null,
      title: song.title || song.name || '',
      primary_artists: song.primary_artists || song.primaryArtists || song.artist || '',
      featured_artists: song.featured_artists || song.featuredArtists || '',
      album: song.album || '',
      language: song.language || '',
      year: song.year || null,
      image_url: song.image_url || song.img || '',
      duration_seconds: song.duration_seconds || song.duration || null,
      play_url: song.play_url || song.url || '',
      raw_metadata_json: song.raw_metadata_json || song,
    };
  }

  function toAppSong(song) {
    if (!song) return null;
    return {
      ...song,
      id: song.saavn_id || song.id || null,
      name: song.name || song.title || '',
      artist: song.artist || song.primary_artists || song.primaryArtists || 'Unknown Artist',
      img: song.img || song.image_url || 'DTunes.svg',
      url: song.url || song.play_url || null,
      duration: song.duration || song.duration_seconds || 0,
      source: song.source || 'recommendation',
    };
  }

  function normalizeSongs(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const appSong = toAppSong(item);
      const id = appSong && appSong.id != null ? String(appSong.id) : '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(appSong);
    }
    return out;
  }

  function makeTimeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(ms);
    }
    return undefined;
  }

  const recentKeys = new Map();
  function rememberLocal(payload) {
    try {
      const current = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || '[]');
      current.push(payload);
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(current.slice(-500)));
    } catch (_) {
      // Ignore localStorage quota/parse failures.
    }
  }

  async function recordEvent(eventType, song, details = {}) {
    if (!song || !(song.id || song.saavn_id)) return;
    const now = Date.now();
    const key = `${eventType}:${song.id || song.saavn_id}:${details.context?.source || 'manual'}`;
    if (recentKeys.has(key) && now - recentKeys.get(key) < DUPLICATE_WINDOW_MS) return;
    recentKeys.set(key, now);

    const payload = {
      userId: details.userId || getUserId(),
      songSaavnId: song.saavn_id || song.id,
      song: toApiSong(song),
      eventType,
      playDurationSeconds: details.playDurationSeconds,
      songDurationSeconds: details.songDurationSeconds || song.duration || song.duration_seconds,
      context: details.context || { source: 'manual' },
    };
    rememberLocal(payload);

    if (isOffline()) return;
    try {
      const response = await fetch('/api/music/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: makeTimeoutSignal(EVENT_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (_) {
      // Offline/static hosting fallback: keep anonymous history in localStorage and sync later.
    }
  }

  async function generateClientFallback(type, options = {}) {
    const limit = normalizeLimit(options.limit);
    try {
      if (typeof window !== 'undefined' && window.jiosaavnAPI) {
        if (type === 'artist-radio' && options.artist) {
          const res = await window.jiosaavnAPI.searchSongs(options.artist, limit);
          const songs = normalizeSongs(res).slice(0, limit);
          if (songs.length > 0) return songs;
        }
        if (type === 'similar' && options.songId) {
          const song = await window.jiosaavnAPI.getSong(options.songId);
          if (song && (song.artist || song.name || song.primary_artists || song.title)) {
            const artist = (song.artist || song.primary_artists || '').split(',')[0].trim();
            const query = `${artist} ${song.name || song.title || ''}`.trim();
            if (query) {
              const res = await window.jiosaavnAPI.searchSongs(query, limit);
              const songs = normalizeSongs(res).filter((s) => String(s.id) !== String(options.songId)).slice(0, limit);
              if (songs.length > 0) return songs;
            }
          }
        }
        if (type === 'late-night') {
          const lang = options.language || '';
          const res = await window.jiosaavnAPI.searchSongs(`${lang} acoustic romantic songs`.trim(), limit);
          const songs = normalizeSongs(res).slice(0, limit);
          if (songs.length > 0) return songs;
        }
        if (type === 'discovery') {
          const lang = options.language || '';
          const res = await window.jiosaavnAPI.searchSongs(`${lang} indie songs`.trim(), limit);
          const songs = normalizeSongs(res).slice(0, limit);
          if (songs.length > 0) return songs;
        }
        let seed = '';
        try {
          const counts = JSON.parse(localStorage.getItem('artistPlayCounts') || '{}');
          const topArtist = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          if (topArtist && topArtist[0]) seed = topArtist[0];
        } catch (_) {}
        if (seed) {
          const res = await window.jiosaavnAPI.searchSongs(seed, limit);
          const songs = normalizeSongs(res).slice(0, limit);
          if (songs.length > 0) return songs;
        }
        if (typeof window.jiosaavnAPI.getTrending === 'function') {
          const trending = await window.jiosaavnAPI.getTrending();
          const songs = normalizeSongs(trending).slice(0, limit);
          if (songs.length > 0) return songs;
        }
      }
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[RecommendationClient] Client playlist fallback failed:', e);
      }
    }
    return [];
  }

  async function fetchPlaylist(type, options = {}) {
    const limit = normalizeLimit(options.limit);
    const seedSongId = options.songId || options.seedSongId;
    const seedArtist = options.artist || options.seedArtist;
    const userId = options.userId || getUserId();
    const params = new URLSearchParams({ userId, type, limit: String(limit) });
    if (options.language) params.set('language', options.language);

    if (isOffline()) {
      return await generateClientFallback(type, { ...options, userId, songId: seedSongId, artist: seedArtist, limit });
    }

    const endpoint = type === 'similar'
      ? `/api/music/similar?songId=${encodeURIComponent(seedSongId || '')}&limit=${encodeURIComponent(String(limit))}`
      : type === 'artist-radio'
        ? `/api/music/artist-radio?artist=${encodeURIComponent(seedArtist || '')}&userId=${encodeURIComponent(userId)}&limit=${encodeURIComponent(String(limit))}`
        : `/api/music/playlist?${params.toString()}`;

    try {
      const response = await fetch(endpoint, { signal: makeTimeoutSignal(API_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json().catch(() => null);
      const songs = normalizeSongs(data && data.songs);
      if (songs.length > 0) {
        return songs.slice(0, limit);
      }
    } catch (_) {
      // Offline/static hosting fallback (e.g. Vercel static, timeout, server error)
    }
    return await generateClientFallback(type, { ...options, userId, songId: seedSongId, artist: seedArtist, limit });
  }

  window.recommendationClient = {
    getUserId,
    recordEvent,
    fetchPlaylist,
    toAppSong,
    toApiSong,
    normalizeLimit,
    _internal: {
      ANON_USER_KEY,
      DEFAULT_LIMIT,
      MIN_LIMIT,
      MAX_LIMIT,
      API_TIMEOUT_MS,
    },
  };
}());

