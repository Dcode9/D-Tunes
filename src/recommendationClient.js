(function () {
  const ANON_USER_KEY = 'dtunesAnonymousUserId';
  const LOCAL_EVENTS_KEY = 'dtunesRecommendationEvents';
  const DUPLICATE_WINDOW_MS = 3500;

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

  function toApiSong(song) {
    if (!song) return null;
    return {
      saavn_id: song.saavn_id || song.id,
      title: song.title || song.name,
      primary_artists: song.primary_artists || song.primaryArtists || song.artist,
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
    return {
      ...song,
      id: song.saavn_id || song.id,
      name: song.name || song.title,
      artist: song.artist || song.primary_artists || song.primaryArtists || 'Unknown Artist',
      img: song.img || song.image_url || 'DTunes.svg',
      url: song.url || song.play_url || null,
      duration: song.duration || song.duration_seconds || 0,
      source: 'recommendation',
    };
  }

  const recentKeys = new Map();
  function rememberLocal(payload) {
    const current = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || '[]');
    current.push(payload);
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(current.slice(-500)));
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

    try {
      await fetch('/api/music/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // Offline/static hosting fallback: keep anonymous history in localStorage and sync later.
    }
  }

  async function generateClientFallback(type, options = {}) {
    const limit = options.limit || 25;
    try {
      if (window.jiosaavnAPI) {
        if (type === 'artist-radio' && options.artist) {
          const res = await window.jiosaavnAPI.searchSongs(options.artist, limit);
          if (res && res.length > 0) return res.map(toAppSong);
        }
        if (type === 'similar' && options.songId) {
          const song = await window.jiosaavnAPI.getSong(options.songId);
          if (song && (song.artist || song.name)) {
            const query = `${(song.artist || '').split(',')[0].trim()} ${song.name || ''}`.trim();
            const res = await window.jiosaavnAPI.searchSongs(query, limit);
            if (res && res.length > 0) return res.map(toAppSong);
          }
        }
        if (type === 'late-night') {
          const lang = options.language || '';
          const res = await window.jiosaavnAPI.searchSongs(`${lang} acoustic romantic songs`.trim(), limit);
          if (res && res.length > 0) return res.map(toAppSong);
        }
        if (type === 'discovery') {
          const lang = options.language || '';
          const res = await window.jiosaavnAPI.searchSongs(`${lang} indie songs`.trim(), limit);
          if (res && res.length > 0) return res.map(toAppSong);
        }
        let seed = '';
        try {
          const counts = JSON.parse(localStorage.getItem('artistPlayCounts') || '{}');
          const topArtist = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
          if (topArtist && topArtist[0]) seed = topArtist[0];
        } catch (e) {}
        if (seed) {
          const res = await window.jiosaavnAPI.searchSongs(seed, limit);
          if (res && res.length > 0) return res.map(toAppSong);
        }
        const trending = await window.jiosaavnAPI.getTrending();
        if (trending && trending.length > 0) return trending.slice(0, limit).map(toAppSong);
      }
    } catch (e) {
      console.warn('[RecommendationClient] Client playlist fallback failed:', e);
    }
    return [];
  }

  async function fetchPlaylist(type, options = {}) {
    const seedSongId = options.songId || options.seedSongId;
    const seedArtist = options.artist || options.seedArtist;
    const params = new URLSearchParams({ userId: options.userId || getUserId(), type, limit: options.limit || 25 });
    if (options.language) params.set('language', options.language);
    const endpoint = type === 'similar'
      ? `/api/music/similar?songId=${encodeURIComponent(seedSongId || '')}&limit=${options.limit || 25}`
      : type === 'artist-radio'
        ? `/api/music/artist-radio?artist=${encodeURIComponent(seedArtist || '')}&userId=${encodeURIComponent(params.get('userId'))}&limit=${options.limit || 25}`
        : `/api/music/playlist?${params.toString()}`;
    try {
      const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined;
      const response = await fetch(endpoint, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data.songs) && data.songs.length > 0) {
        return data.songs.map(toAppSong);
      }
    } catch (error) {
      // Offline/static hosting fallback (e.g. Vercel static)
    }
    return await generateClientFallback(type, options);
  }

  window.recommendationClient = { getUserId, recordEvent, fetchPlaylist, toAppSong, toApiSong };
}());

