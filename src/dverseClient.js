(function () {
  const SUPABASE_URL = window.DVERSE_SUPABASE_URL || 'https://gmwieijbrrztukqpfwkg.supabase.co';
  const SUPABASE_ANON_KEY = window.DVERSE_SUPABASE_ANON_KEY || 'sb_publishable_KX3MYtV84QJJdy9bPDuMEA_V99sLKSE';

  const ready = Boolean(window.supabase && SUPABASE_ANON_KEY);
  const client = ready ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const authRedirectUrl = () => `${window.location.origin}/`;

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  function onAuthStateChange(callback) {
    if (!client || typeof callback !== 'function') return { unsubscribe() {} };
    const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session));
    return data.subscription;
  }

  async function signInWithGoogle() {
    if (!client) throw new Error('D\'Verse Supabase client is not configured.');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl() }
    });
    if (error) throw error;
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
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
    const { error } = await client.from('dtunes_history').insert({
      user_id: session.user.id,
      track_id: track.id,
      context
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

  async function savePlaylist(name, songs = []) {
    const session = await getSession();
    if (!client || !session || !name) return null;
    const existing = await findPlaylistByName(name);
    const playlistPatch = {
      user_id: session.user.id,
      name,
      updated_at: new Date().toISOString()
    };
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

  window.dverse = {
    supabase: client,
    isConfigured: ready,
    getSession,
    onAuthStateChange,
    signInWithGoogle,
    signOut,
    dtunes: {
      recordPlay,
      listHistory,
      setLiked,
      listLikes,
      listPlaylists,
      savePlaylist,
      deletePlaylist,
      upsertTrack
    }
  };
  window.dispatchEvent(new CustomEvent('dverse:ready', { detail: { configured: ready } }));
})();
