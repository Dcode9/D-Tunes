const API_ENDPOINTS = [
  'https://jiosaavn-api-taupe-phi.vercel.app/api',
  'https://jiosaavn-api-v2.vercel.app/api',
  'https://saavn.me/api',
  'https://jio-saavn-api-red.vercel.app/api',
];

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function bestImage(image = []) {
  if (!Array.isArray(image)) return '';
  return image[2]?.url || image[1]?.url || image[0]?.url || '';
}

function bestDownloadUrl(downloadUrl = []) {
  if (!Array.isArray(downloadUrl) || downloadUrl.length === 0) return '';
  return downloadUrl[downloadUrl.length - 1]?.url || '';
}

function normalizeSong(song = {}) {
  const primaryArtists = song.artists?.primary?.map((artist) => artist.name).join(', ') || song.primaryArtists || song.primary_artists || '';
  const featuredArtists = song.artists?.featured?.map((artist) => artist.name).join(', ') || song.featuredArtists || song.featured_artists || '';
  return {
    saavn_id: String(song.id || song.saavn_id || ''),
    id: String(song.id || song.saavn_id || ''),
    title: decodeHtml(song.name || song.title || 'Unknown'),
    name: decodeHtml(song.name || song.title || 'Unknown'),
    primary_artists: decodeHtml(primaryArtists || 'Unknown Artist'),
    primaryArtists: decodeHtml(primaryArtists || 'Unknown Artist'),
    artist: decodeHtml(primaryArtists || 'Unknown Artist'),
    featured_artists: decodeHtml(featuredArtists),
    album: decodeHtml(song.album?.name || song.album || ''),
    language: song.language || '',
    year: Number(song.year || 0) || null,
    image_url: bestImage(song.image) || song.image_url || song.img || '',
    img: bestImage(song.image) || song.image_url || song.img || '',
    duration_seconds: Number(song.duration || song.duration_seconds || 0) || null,
    duration: Number(song.duration || song.duration_seconds || 0) || 0,
    play_url: bestDownloadUrl(song.downloadUrl) || song.play_url || song.url || '',
    url: bestDownloadUrl(song.downloadUrl) || song.play_url || song.url || '',
    raw_metadata_json: song,
    source: 'jiosaavn',
  };
}

async function fetchJson(path, { endpoints = API_ENDPOINTS } = {}) {
  let lastError;
  for (const base of endpoints) {
    const url = path.startsWith('http') ? path : `${base}${path}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`JioSaavn HTTP ${response.status}`);
      const json = await response.json();
      if (json.success === false) throw new Error(json.message || 'JioSaavn request failed');
      return json;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function searchSongs(query, limit = 25) {
  const data = await fetchJson(`/search/songs?query=${encodeURIComponent(query)}&limit=${limit}`);
  return (data.data?.results || []).map(normalizeSong).filter((song) => song.saavn_id);
}

async function getSong(saavnId) {
  const data = await fetchJson(`/songs/${encodeURIComponent(saavnId)}`);
  const raw = Array.isArray(data.data) ? data.data[0] : data.data;
  return raw ? normalizeSong(raw) : null;
}

async function getTrending(limit = 25) {
  try {
    const data = await fetchJson('/playlists?id=110858205');
    const songs = (data.data?.songs || []).map(normalizeSong).filter((song) => song.saavn_id);
    if (songs.length) return songs.slice(0, limit);
  } catch (error) {}
  return searchSongs('trending songs', limit);
}

module.exports = { API_ENDPOINTS, normalizeSong, searchSongs, getSong, getTrending };
