(function () {
  const SUPABASE_URL = window.DVERSE_SUPABASE_URL || 'https://gmwieijbrrztukqpfwkg.supabase.co';
  const SUPABASE_ANON_KEY = window.DVERSE_SUPABASE_ANON_KEY || '';

  const ready = Boolean(window.supabase && SUPABASE_ANON_KEY);
  const client = ready ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function signInWithGoogle() {
    if (!client) throw new Error('D\'Verse Supabase client is not configured.');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href.split('#')[0] }
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
      duration_ms: song.duration ? Number(song.duration) * 1000 : null,
      artwork_url: song.img || null,
      source: song.source || 'jiosaavn',
      metadata: song
    };
  }

  async function upsertTrack(song) {
    if (!client || !song || !song.id) return null;
    const track = normalizeTrack(song);
    const { error } = await client.from('dtunes_tracks').upsert(track);
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

  async function listPlaylists() {
    if (!client) return [];
    const session = await getSession();
    if (!session) return [];
    const { data, error } = await client
      .from('dtunes_playlists')
      .select('*, dtunes_playlist_items(*)')
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  window.dverse = {
    supabase: client,
    isConfigured: ready,
    getSession,
    signInWithGoogle,
    signOut,
    dtunes: { recordPlay, setLiked, listPlaylists, upsertTrack }
  };
})();