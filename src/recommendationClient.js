(function () {
  const ANON_USER_KEY = 'dtunesAnonymousUserId';
  const LOCAL_EVENTS_KEY = 'dtunesRecommendationEvents';
  const DUPLICATE_WINDOW_MS = 3500;

  function getUserId() {
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

  async function fetchPlaylist(type, options = {}) {
    const params = new URLSearchParams({ userId: options.userId || getUserId(), type, limit: options.limit || 25 });
    if (options.language) params.set('language', options.language);
    const endpoint = type === 'similar'
      ? `/api/music/similar?songId=${encodeURIComponent(options.songId)}&limit=${options.limit || 25}`
      : type === 'artist-radio'
        ? `/api/music/artist-radio?artist=${encodeURIComponent(options.artist)}&userId=${encodeURIComponent(params.get('userId'))}&limit=${options.limit || 25}`
        : `/api/music/playlist?${params.toString()}`;
    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return (data.songs || []).map(toAppSong);
    } catch (error) {
      return [];
    }
  }

  window.recommendationClient = { getUserId, recordEvent, fetchPlaylist, toAppSong, toApiSong };
}());
