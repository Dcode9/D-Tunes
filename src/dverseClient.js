(function () {
  const SUPABASE_URL = window.DVERSE_SUPABASE_URL || 'https://gmwieijbrrztukqpfwkg.supabase.co';
  const SUPABASE_ANON_KEY = window.DVERSE_SUPABASE_ANON_KEY || 'sb_publishable_KX3MYtV84QJJdy9bPDuMEA_V99sLKSE';

  const ready = Boolean(window.supabase && SUPABASE_ANON_KEY);
  const client = ready ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const PORTAL_ORIGIN = (window.DVERSE_PORTAL_ORIGIN || 'https://dverse.fun').replace(/\/$/, '');
  const AUTH_BRIDGE_URL = `${PORTAL_ORIGIN}/auth-bridge.html`;
  const authRedirectUrl = () => `${window.location.origin}/`;
  let portalSessionPromise = null;
  let currentSession = null;
  let checkedUrlHandoff = false;

  function base64UrlDecode(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function takeSessionHandoffFromUrl() {
    if (checkedUrlHandoff || typeof window === 'undefined') return null;
    checkedUrlHandoff = true;

    const hashText = window.location.hash ? window.location.hash.slice(1) : '';
    if (!hashText || !hashText.includes('dverse_session=')) return null;

    const params = new URLSearchParams(hashText.startsWith('?') ? hashText.slice(1) : hashText);
    const encodedSession = params.get('dverse_session');
    params.delete('dverse_session');

    const cleanHash = params.toString();
    const cleanUrl = `${window.location.pathname}${window.location.search}${cleanHash ? `#${cleanHash}` : ''}`;
    window.history.replaceState({}, document.title, cleanUrl);

    if (!encodedSession) return null;
    try {
      return base64UrlDecode(encodedSession);
    } catch (error) {
      console.warn('[DVerse] Ignored invalid session handoff:', error);
      return null;
    }
  }

  async function restoreSessionFromHandoff() {
    if (!client) return null;
    const session = takeSessionHandoffFromUrl();
    if (!session?.access_token || !session?.refresh_token) return null;

    const { data, error } = await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
    if (error) throw error;
    currentSession = data.session || null;
    if (currentSession) syncSessionToPortal(currentSession);
    return currentSession;
  }

  function bridgeRequest(message, timeoutMs = 2500) {
    if (!PORTAL_ORIGIN || window.location.origin === PORTAL_ORIGIN || typeof document === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const frame = document.createElement('iframe');
      let finished = false;

      function cleanup(value) {
        if (finished) return;
        finished = true;
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        frame.remove();
        resolve(value);
      }

      function onMessage(event) {
        if (event.origin !== PORTAL_ORIGIN) return;
        const data = event.data || {};
        if (data.source !== 'dverse-auth-bridge' || data.requestId !== requestId) return;
        cleanup(data);
      }

      const timer = setTimeout(() => cleanup(null), timeoutMs);
      frame.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:0;';
      frame.setAttribute('aria-hidden', 'true');
      frame.addEventListener('load', () => {
        frame.contentWindow?.postMessage({
          source: 'dverse-app',
          requestId,
          ...message
        }, PORTAL_ORIGIN);
      });
      window.addEventListener('message', onMessage);
      frame.src = AUTH_BRIDGE_URL;
      (document.body || document.documentElement).appendChild(frame);
    });
  }

  async function bootstrapFromPortal() {
    if (!client) return null;
    const handedOffSession = await restoreSessionFromHandoff();
    if (handedOffSession) return handedOffSession;

    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) {
      currentSession = data.session;
      return data.session;
    }

    if (!portalSessionPromise) {
      portalSessionPromise = (async () => {
        const response = await bridgeRequest({ type: 'dverse-auth:get-session' });
        const session = response?.session;
        if (!session?.access_token || !session?.refresh_token) return null;
        const { data: restored, error: restoreError } = await client.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });
        if (restoreError) throw restoreError;
        currentSession = restored.session || null;
        return restored.session || null;
      })().finally(() => {
        portalSessionPromise = null;
      });
    }
    return portalSessionPromise;
  }

  function syncSessionToPortal(session) {
    if (!session?.access_token || !session?.refresh_token) return;
    bridgeRequest({
      type: 'dverse-auth:set-session',
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token
      }
    }, 1500).catch((error) => console.warn('[DVerse] Portal session sync failed:', error));
  }

  async function getSession() {
    if (!client) return null;
    return bootstrapFromPortal();
  }

  function onAuthStateChange(callback) {
    if (!client || typeof callback !== 'function') return { unsubscribe() {} };
    const { data } = client.auth.onAuthStateChange((event, session) => {
      currentSession = session || null;
      if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        syncSessionToPortal(session);
      }
      callback(event, session);
    });
    return data.subscription;
  }

  async function signInWithGoogle() {
    if (!client) throw new Error('D\'Verse Supabase client is not configured.');
    window.location.href = `${PORTAL_ORIGIN}/?dverse_return_to=${encodeURIComponent(authRedirectUrl())}`;
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    await bridgeRequest({ type: 'dverse-auth:sign-out' }, 1500);
  }

  function normalizeTrack(song) {
    return {
      id: String(song.id),
      title: song.name || song.title || 'Unknown',
      artist: song.artist || null,
      album: song.album || null,
      duration_ms: song.duration ? Number(song.duration) * 1000 : null,
      artwork_url: song.img || song.artwork_url || null,
      source: song.source || 'jiosaavn',
      metadata: song
    };
  }

  function songFromTrack(track) {
    if (!track) return null;
    return {
      id: track.id,
      name: track.metadata?.name || track.metadata?.title || track.title || 'Unknown',
      title: track.metadata?.title || track.title || 'Unknown',
      artist: track.metadata?.artist || track.artist || '',
      album: track.metadata?.album || track.album || '',
      duration: track.metadata?.duration || (track.duration_ms ? Math.round(track.duration_ms / 1000) : undefined),
      img: track.metadata?.img || track.artwork_url || '',
      source: track.source || track.metadata?.source || 'jiosaavn',
      ...track.metadata
    };
  }

  async function upsertTrack(song) {
    if (!client || !song || !song.id) return null;
    const track = normalizeTrack(song);
    const { error } = await client
      .from('dtunes_tracks')
      .upsert(track, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    return track;
  }

  async function recordPlay(song, context = {}) {
    if (!client || !song || !song.id) return;
    const session = await getSession();
    if (!session) return;
    const track = await upsertTrack(song);
    const endedAt = context.ended_at || context.played_at || new Date().toISOString();
    const durationMs = context.duration_ms ?? context.durationMs ?? null;
    const startedAt = context.started_at || (durationMs
      ? new Date(new Date(endedAt).getTime() - durationMs).toISOString()
      : null);
    const { error } = await client.from('dtunes_history').insert({
      user_id: session.user.id,
      track_id: track.id,
      played_at: endedAt,
      duration_ms: durationMs,
      started_at: startedAt,
      ended_at: endedAt,
      client: 'dtunes-web',
      context: { source: 'dtunes-web', ...context }
    });
    if (error) throw error;
  }

  async function listHistory(limit = 100) {
    if (!client) return [];
    const session = await getSession();
    if (!session) return [];
    const { data, error } = await client
      .from('dtunes_history')
      .select('played_at, context, dtunes_tracks(*)')
      .eq('user_id', session.user.id)
      .order('played_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map((row) => songFromTrack(row.dtunes_tracks)).filter(Boolean);
  }

  async function setLiked(song, liked) {
    if (!client || !song || !song.id) return;
    const session = await getSession();
    if (!session) return;
    const track = await upsertTrack(song);
    const query = client.from('dtunes_likes');
    const { error } = liked
      ? await query.upsert({ user_id: session.user.id, track_id: track.id })
      : await query.delete().eq('user_id', session.user.id).eq('track_id', track.id);
    if (error) throw error;
  }

  async function listLikes() {
    if (!client) return [];
    const session = await getSession();
    if (!session) return [];
    const { data, error } = await client
      .from('dtunes_likes')
      .select('created_at, dtunes_tracks(*)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => songFromTrack(row.dtunes_tracks)).filter(Boolean);
  }

  async function setLibrary(song, inLibrary) {
    if (!client || !song || !song.id) return;
    const session = await getSession();
    if (!session) return;
    const track = await upsertTrack(song);
    const query = client.from('dtunes_library');
    const { error } = inLibrary
      ? await query.upsert({ user_id: session.user.id, track_id: track.id })
      : await query.delete().eq('user_id', session.user.id).eq('track_id', track.id);
    if (error) throw error;
  }

  async function listLibrary() {
    if (!client) return [];
    const session = await getSession();
    if (!session) return [];
    const { data, error } = await client
      .from('dtunes_library')
      .select('created_at, dtunes_tracks(*)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((row) => songFromTrack(row.dtunes_tracks)).filter(Boolean);
  }

  async function listPlaylists() {
    if (!client) return [];
    const session = await getSession();
    if (!session) return [];
    const { data, error } = await client
      .from('dtunes_playlists')
      .select('*, dtunes_playlist_items(position, track_id, dtunes_tracks(*))')
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((playlist) => ({
      ...playlist,
      songs: (playlist.dtunes_playlist_items || [])
        .sort((a, b) => a.position - b.position)
        .map((item) => songFromTrack(item.dtunes_tracks))
        .filter(Boolean)
    }));
  }

  async function findPlaylistByName(name) {
    const session = await getSession();
    if (!client || !session || !name) return null;
    const { data, error } = await client
      .from('dtunes_playlists')
      .select('id, name')
      .eq('user_id', session.user.id)
      .eq('name', name)
      .limit(1);
    if (error) throw error;
    return data?.[0] || null;
  }

  async function savePlaylist(name, songs = [], style = null) {
    const session = await getSession();
    if (!client || !session || !name) return null;
    const existing = await findPlaylistByName(name);
    const playlistPatch = {
      user_id: session.user.id,
      name,
      updated_at: new Date().toISOString()
    };
    if (style && typeof style === 'object') {
      playlistPatch.style = style;
    }
    const { data: playlist, error: playlistError } = existing
      ? await client.from('dtunes_playlists').update(playlistPatch).eq('id', existing.id).select().single()
      : await client.from('dtunes_playlists').insert(playlistPatch).select().single();
    if (playlistError) throw playlistError;

    const normalizedSongs = (songs || []).filter((song) => song && song.id);
    for (const song of normalizedSongs) {
      await upsertTrack(song);
    }

    const { error: deleteError } = await client
      .from('dtunes_playlist_items')
      .delete()
      .eq('playlist_id', playlist.id);
    if (deleteError) throw deleteError;

    if (normalizedSongs.length) {
      const { error: itemError } = await client.from('dtunes_playlist_items').insert(
        normalizedSongs.map((song, index) => ({
          playlist_id: playlist.id,
          track_id: String(song.id),
          position: index
        }))
      );
      if (itemError) throw itemError;
    }

    return playlist;
  }

  async function deletePlaylist(name) {
    const existing = await findPlaylistByName(name);
    if (!client || !existing) return;
    const { error } = await client.from('dtunes_playlists').delete().eq('id', existing.id);
    if (error) throw error;
  }

  async function getPlaybackState() {
    const session = await getSession();
    if (!client || !session) return null;
    const { data, error } = await client
      .from('dtunes_playback_state')
      .select('track_id, playback_state, updated_at')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.playback_state) return null;
    return {
      ...data.playback_state,
      track_id: data.track_id,
      updated_at: data.updated_at || data.playback_state.updated_at
    };
  }

  async function savePlaybackState(playbackState = {}) {
    const session = await getSession();
    if (!client || !session || !playbackState?.track?.id) return null;
    const track = await upsertTrack(playbackState.track);
    const payload = {
      ...playbackState,
      updated_at: playbackState.updated_at || new Date().toISOString()
    };
    const { data, error } = await client
      .from('dtunes_playback_state')
      .upsert({
        user_id: session.user.id,
        track_id: track?.id || null,
        playback_state: payload,
        updated_at: payload.updated_at
      }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  function savePlaybackStateFast(playbackState = {}) {
    if (!client || !currentSession?.access_token || !playbackState?.track?.id) return false;
    const payload = {
      ...playbackState,
      updated_at: playbackState.updated_at || new Date().toISOString()
    };
    fetch(`${SUPABASE_URL}/rest/v1/dtunes_playback_state?on_conflict=user_id`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${currentSession.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{
        user_id: currentSession.user.id,
        track_id: null,
        playback_state: payload,
        updated_at: payload.updated_at
      }])
    }).catch((error) => console.warn('[DVerse] Fast playback save failed:', error));
    return true;
  }

  async function fetchListeningStats(limit = 20) {
    if (!client) return [];
    const session = await getSession();
    if (!session) return [];
    const { data, error } = await client
      .from('dtunes_listening_stats')
      .select('play_count, total_duration_ms, last_played_at, dtunes_tracks(*)')
      .eq('user_id', session.user.id)
      .order('total_duration_ms', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  async function fetchListeningDaily(limit = 14) {
    if (!client) return [];
    const session = await getSession();
    if (!session) return [];
    const { data, error } = await client
      .from('dtunes_listening_daily')
      .select('day, play_count, total_duration_ms')
      .eq('user_id', session.user.id)
      .order('day', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }

  window.dverse = {
    supabase: client,
    isConfigured: ready,
    getSession,
    bootstrapFromPortal,
    onAuthStateChange,
    signInWithGoogle,
    signOut,
    dtunes: {
      recordPlay,
      listHistory,
      setLiked,
      listLikes,
      setLibrary,
      listLibrary,
      listPlaylists,
      savePlaylist,
      deletePlaylist,
      upsertTrack,
      getPlaybackState,
      savePlaybackState,
      savePlaybackStateFast,
      fetchListeningStats,
      fetchListeningDaily
    }
  };
  window.dispatchEvent(new CustomEvent('dverse:ready', { detail: { configured: ready } }));
})();
