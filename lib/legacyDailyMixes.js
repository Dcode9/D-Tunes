'use strict';

const saavn = require('./saavnClient');
const store = require('./jsonStore');
const { callAI } = require('./aiClient');
const {
  songTitle,
  songArtist,
  isFestiveText,
  withDualAliases,
} = require('./recommendationHelpers');

const LEGACY_MIX_COUNT = 6;
const LEGACY_MODEL = 'mercury-2.5';

const SYSTEM_PROMPT = 'You are an elite music curation director acclaimed for deep musicology, harmonic continuity, acoustic texture matching, and human-like discovery. You output strictly raw JSON without markdown backticks.';

// The pre-API client fell back to these five-song mixes when the model failed.
// The festive mix was removed with the rest of the Diwali branding.
const FALLBACK_PLAYLISTS = [
  {
    categoryTitle: 'After Hours Resonance',
    title: 'Midnight Velvet',
    description: 'Deep nocturnal rhythms and atmospheric melodies',
    styleIndex: 0,
    songs: [
      { title: 'Blinding Lights', artist: 'The Weeknd' },
      { title: 'Levitating', artist: 'Dua Lipa' },
      { title: 'Midnight City', artist: 'M83' },
      { title: 'Get Lucky', artist: 'Daft Punk' },
      { title: 'Starboy', artist: 'The Weeknd' },
    ],
  },
  {
    categoryTitle: 'Golden Hour Glow',
    title: 'Sun-Drenched Waves',
    description: 'Warm guitars and indie-pop sunset melodies',
    styleIndex: 1,
    songs: [
      { title: 'Heat Waves', artist: 'Glass Animals' },
      { title: 'As It Was', artist: 'Harry Styles' },
      { title: 'Sunflower', artist: 'Post Malone & Swae Lee' },
      { title: 'Stay', artist: 'The Kid LAROI & Justin Bieber' },
      { title: 'Lovely', artist: 'Billie Eilish & Khalid' },
    ],
  },
  {
    categoryTitle: 'Acoustic & Soulful',
    title: 'Raw & Unplugged',
    description: 'Intimate vocals, warm acoustic guitar, and piano warmth',
    styleIndex: 2,
    songs: [
      { title: 'Kesariya', artist: 'Arijit Singh' },
      { title: 'Shallow', artist: 'Lady Gaga & Bradley Cooper' },
      { title: 'Someone Like You', artist: 'Adele' },
      { title: 'All of Me', artist: 'John Legend' },
      { title: 'Riptide', artist: 'Vance Joy' },
    ],
  },
  {
    categoryTitle: 'Peak Energy & Flow',
    title: 'Electric Momentum',
    description: 'High-octane electronic beats to fuel your focus and pace',
    styleIndex: 3,
    songs: [
      { title: 'One More Time', artist: 'Daft Punk' },
      { title: 'Titanium', artist: 'David Guetta & Sia' },
      { title: 'Wake Me Up', artist: 'Avicii' },
      { title: 'Closer', artist: 'The Chainsmokers' },
      { title: "Don't Start Now", artist: 'Dua Lipa' },
    ],
  },
];

function formatClock(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '';
  const minutes = Math.floor(value / 60);
  const remainder = Math.floor(value % 60);
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function buildPrompt(taste = {}) {
  const playlists = Array.isArray(taste.playlists) ? taste.playlists : [];
  const stats = Array.isArray(taste.stats) ? taste.stats : [];
  const history = Array.isArray(taste.history) ? taste.history : [];
  const artists = Array.isArray(taste.artists) ? taste.artists : [];
  const liked = Array.isArray(taste.liked) ? taste.liked : [];
  const library = Array.isArray(taste.library) ? taste.library : [];
  const disliked = Array.isArray(taste.disliked) ? taste.disliked : [];

  const playlistsData = playlists
    .filter((playlist) => playlist && Array.isArray(playlist.songs) && playlist.songs.length > 0)
    .map((playlist) => {
      const songList = playlist.songs.slice(0, 10).map((song) => {
        const title = song.title || 'Track';
        const artist = song.artist || 'Artist';
        const clock = formatClock(song.duration);
        const dur = clock ? ` [${clock}]` : '';
        return `"${title}" by ${artist}${dur}`;
      }).join(', ');
      const count = Number(playlist.count) || playlist.songs.length;
      return `Playlist "${playlist.name || 'Playlist'}" (${count} tracks): [${songList}]`;
    });

  const historyList = history.slice(0, 25).map((entry) => {
    const title = entry.title || 'Track';
    const artist = entry.artist || 'Artist';
    const clock = formatClock(entry.duration);
    const dur = clock ? ` (length: ${clock})` : '';
    const playedAt = entry.playedAt ? ` at ${String(entry.playedAt).slice(0, 16).replace('T', ' ')}` : '';
    return `"${title}" by ${artist}${dur}${playedAt}`;
  });

  const statsList = stats.map((entry) => {
    const title = entry.title || 'Track';
    const artist = entry.artist || 'Artist';
    const mins = Math.round((Number(entry.durationMs) || 0) / 60000);
    const plays = Number(entry.playCount) || 0;
    return `"${title}" by ${artist} (${plays} plays, ~${mins} min listened)`;
  });

  const artistCounts = artists
    .slice()
    .sort((a, b) => Number(b.count) - Number(a.count))
    .slice(0, 8)
    .map((entry) => `${entry.name} (${Number(entry.count) || 0} plays)`);

  const likedList = liked.map((song) => `"${song.title || 'Track'}" by ${song.artist || 'Artist'}`);
  const libList = library.map((song) => `"${song.title || 'Track'}" by ${song.artist || 'Artist'}`);
  const dislikedList = disliked.map((song) => `"${song.title || 'Track'}" by ${song.artist || 'Artist'}`);

  const prompt = `Analyze this listener's complete music taste profile and listening habits:

1. USER'S PERSONAL PLAYLISTS (Hand-curated collections with song titles and track lengths):
${playlistsData.length > 0 ? playlistsData.join('\n') : 'No custom playlists yet'}

2. TOTAL LISTENING DURATION & FREQUENTLY PLAYED TRACKS:
${statsList.length > 0 ? statsList.join('\n') : 'No aggregated play records yet'}

3. RECENT STREAMS WITH PLAY TIMESTAMPS & LENGTHS:
${historyList.length > 0 ? historyList.join(' | ') : 'None yet'}

4. TOP PLAYED ARTISTS:
${artistCounts.length > 0 ? artistCounts.join(', ') : 'None yet'}

5. FAVORITE LIKED TRACKS:
${likedList.length > 0 ? likedList.join(', ') : 'None yet'}

6. SAVED TO LIBRARY:
${libList.length > 0 ? libList.join(', ') : 'None yet'}

7. STRICT EXCLUSIONS / DISLIKED SONGS (NEVER recommend these tracks or artists, and avoid their signature characteristics):
${dislikedList.length > 0 ? dislikedList.join(', ') : 'None'}

CURATION INSTRUCTIONS:
- Generate 6 distinct, immersive personalized playlist categories matching different moods, genres, and facets of their taste.
- Ensure diversity across all 6 mixes: do NOT repeat the same artist across multiple mixes.
- Each mix must contain EXACTLY 5 real, popular, widely known songs that exist on streaming platforms.
- Curate evocative, human playlist titles and descriptions that feel like Spotify/Apple Music editorial mixes (e.g. "Midnight Resonance", "Velvet Acoustic", "Sun-Drenched Drive", "Deep Focus & Flow", "High Voltage Anthem", "Nostalgia & Reprises").
- Strictly obey all negative exclusions.

Format strictly as JSON without markdown.
Schema:
{
  "playlists": [
    {
      "categoryTitle": "String (e.g. Late Night Resonance)",
      "title": "String (e.g. After Hours Vibe)",
      "description": "String (Short evocative mood description)",
      "styleIndex": Number (0 to 6),
      "songs": [
        { "title": "String", "artist": "String" }
      ]
    }
  ]
}`;

  return { prompt, systemPrompt: SYSTEM_PROMPT };
}

function hasTasteSignals(taste) {
  if (!taste || typeof taste !== 'object') return false;
  return ['playlists', 'stats', 'history', 'artists', 'liked', 'library', 'disliked']
    .some((key) => Array.isArray(taste[key]) && taste[key].length > 0);
}

function isPlayable(song) {
  const url = song && song.url;
  const img = song && song.img;
  return Boolean(
    url && typeof url === 'string' && url.startsWith('http') &&
    img && typeof img === 'string' && img.startsWith('http') &&
    !img.includes('DTunes.svg')
  );
}

async function searchTrackData(song, saavnClient, cache) {
  const query = `${song.title || song.name || ''} ${song.artist || song.primary_artists || ''}`.trim();
  if (!query) return null;
  if (cache.has(query)) return cache.get(query);
  const results = await saavnClient.searchSongs(query, 1).catch(() => []);
  const match = Array.isArray(results) && results.length > 0 ? results[0] : null;
  cache.set(query, match);
  return match;
}

async function hydratePlaylists(playlists, saavnClient) {
  const cache = new Map();
  const hydrated = [];
  for (const playlist of playlists) {
    const rawSongs = Array.isArray(playlist.songs) ? playlist.songs : [];
    const found = await Promise.all(rawSongs.map((song) => searchTrackData(song, saavnClient, cache)));
    const songs = found.filter(isPlayable);
    if (songs.length < 2) continue;

    const categoryTitle = String(playlist.categoryTitle || playlist.title || 'Mix').slice(0, 120);
    const title = String(playlist.title || playlist.categoryTitle || 'Mix').slice(0, 120);
    const description = String(playlist.description || '').slice(0, 300);
    if (isFestiveText(`${categoryTitle} ${title} ${description}`)) continue;

    const styleIndex = Number(playlist.styleIndex);
    hydrated.push({
      categoryTitle,
      title,
      description,
      styleIndex: Number.isFinite(styleIndex) ? styleIndex : hydrated.length,
      songs: songs.map(withDualAliases),
    });
  }
  return hydrated;
}

function tasteFromStoreData(data) {
  const scores = data && Array.isArray(data.userSongScores) ? data.userSongScores : [];
  const events = data && Array.isArray(data.recentEvents) ? data.recentEvents : [];

  const byRecency = scores
    .filter((row) => row && row.song)
    .slice()
    .sort((a, b) => new Date(b.last_played_at || 0).getTime() - new Date(a.last_played_at || 0).getTime());
  const history = byRecency.slice(0, 25).map((row) => ({
    title: songTitle(row.song),
    artist: songArtist(row.song),
    duration: Number(row.song.duration) || 0,
    playedAt: row.last_played_at || '',
  })).filter((row) => row.title);

  const byArtist = new Map();
  for (const row of scores) {
    const name = songArtist(row.song);
    if (!name || name === 'Unknown Artist') continue;
    byArtist.set(name, (byArtist.get(name) || 0) + (Number(row.play_count) || 0));
  }
  const artists = [...byArtist.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const stats = scores
    .slice()
    .sort((a, b) => (Number(b.play_count) || 0) - (Number(a.play_count) || 0))
    .slice(0, 15)
    .map((row) => ({
      title: songTitle(row.song),
      artist: songArtist(row.song),
      playCount: Number(row.play_count) || 0,
      durationMs: (Number(row.play_count) || 0) * (Number(row.song && row.song.duration) || 0) * 1000,
    }))
    .filter((row) => row.title);

  const liked = [];
  const library = [];
  const seenLiked = new Set();
  const seenLibrary = new Set();
  for (const event of events.slice().sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())) {
    const song = event && event.song;
    if (!song) continue;
    const key = song.id || song.saavn_id || `${songTitle(song)}::${songArtist(song)}`;
    const pair = { title: songTitle(song), artist: songArtist(song) };
    if (!pair.title) continue;
    if (event.event_type === 'like' && !seenLiked.has(key)) {
      seenLiked.add(key);
      liked.push(pair);
    }
    if (event.event_type === 'playlist_add' && !seenLibrary.has(key)) {
      seenLibrary.add(key);
      library.push(pair);
    }
  }

  return {
    playlists: [],
    stats,
    history,
    artists,
    liked: liked.slice(0, 200),
    library: library.slice(0, 200),
    disliked: [],
  };
}

async function tasteFromStore(userId, deps = {}) {
  const storeMod = deps.store || store;
  if (!userId || typeof storeMod.getRecommendationTasteData !== 'function') {
    return { playlists: [], stats: [], history: [], artists: [], liked: [], library: [], disliked: [] };
  }
  const data = await storeMod
    .getRecommendationTasteData(userId, { hours: 24 * 30 }, { accessToken: deps.accessToken || null })
    .catch(() => null);
  return tasteFromStoreData(data);
}

async function generateLegacyDailyMixes(input = {}, deps = {}) {
  const ai = deps.callAI || callAI;
  const saavnClient = deps.saavn || saavn;
  const taste = hasTasteSignals(input.taste)
    ? input.taste
    : await tasteFromStore(input.userId, deps);

  const { prompt, systemPrompt } = buildPrompt(taste);
  const parsed = await ai(prompt, systemPrompt, { model: LEGACY_MODEL }).catch(() => null);

  let playlists = parsed && Array.isArray(parsed.playlists) ? parsed.playlists : [];
  playlists = playlists
    .filter((playlist) => playlist && Array.isArray(playlist.songs) && playlist.songs.length > 0)
    .slice(0, LEGACY_MIX_COUNT);

  let mixes = playlists.length > 0 ? await hydratePlaylists(playlists, saavnClient) : [];
  if (mixes.length === 0) {
    mixes = await hydratePlaylists(FALLBACK_PLAYLISTS, saavnClient);
  }

  return {
    mixes: mixes.map((mix, index) => ({ ...mix, key: `daily-mix-${index + 1}` })),
  };
}

module.exports = {
  LEGACY_MIX_COUNT,
  SYSTEM_PROMPT,
  FALLBACK_PLAYLISTS,
  buildPrompt,
  hasTasteSignals,
  hydratePlaylists,
  tasteFromStoreData,
  generateLegacyDailyMixes,
};
