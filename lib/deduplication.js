function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanTitle(rawTitle = '', album = '') {
  let t = decodeHtml(rawTitle || '').toLowerCase();

  // If album name is present, remove (Album Name) or - Album Name from title
  if (album) {
    const albClean = decodeHtml(album).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
    if (albClean.length > 2) {
      const escaped = albClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      t = t.replace(new RegExp(`[\\(\\[\\{]\\s*(?:from\\s+)?["']?${escaped}["']?\\s*[\\)\\]\\}]`, 'gi'), ' ');
      t = t.replace(new RegExp(`\\s*-\\s*(?:from\\s+)?["']?${escaped}["']?.*$`, 'gi'), ' ');
    }
  }

  // Strip release packaging variations (soundtrack, movie name, video, deluxe, single/album tag, remaster)
  t = t.replace(/\s*[\(\[\{]\s*(?:from\s+["']?[^()\[\]]+["']?|original\s+motion\s+picture\s+soundtrack|original\s+soundtrack|soundtrack\s+version|ost\s+version|ost|(?:official\s+)?(?:music\s+)?video|(?:official\s+)?(?:music\s+)?audio|video\s+song|audio\s+song|full\s+song|lyric\s+video|lyrics|official|clean|explicit|deluxe(?:\s+edition)?|bonus\s+track|single\s+version|album\s+version|remaster(?:ed)?(?:\s+\d+)?)\s*[\)\]\}]/gi, ' ');
  t = t.replace(/\s*-\s*(?:from\s+["']?[^-\n]+["']?|soundtrack(?:\s+version)?|single\s+version|album\s+version|(?:official\s+)?(?:music\s+)?(?:audio|video)|remaster(?:ed)?(?:\s+\d+)?).*$/i, ' ');

  // Strip feat./ft./with tags
  t = t.replace(/\s*[\(\[\{]?(?:feat\.?|ft\.?|featuring|with)\s+[^()\[\]]+[\)\]\}]?/gi, ' ');

  // Unicode-safe alphanumeric normalization
  t = t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

function getTitleRoot(rawTitle = '') {
  let t = decodeHtml(rawTitle || '').toLowerCase();
  const idx = t.search(/[\(\[\{\-]/);
  if (idx > 0) t = t.slice(0, idx);
  return t.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function getArtistTokens(rawArtist = '') {
  let a = decodeHtml(rawArtist || '').toLowerCase();
  return a.split(/[,&/|]/)
    .map((p) => p.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 1);
}

function areDuplicateTracks(songA, songB) {
  if (!songA || !songB) return false;
  const idA = String(songA.id || songA.saavn_id || songA.saavnId || '');
  const idB = String(songB.id || songB.saavn_id || songB.saavnId || '');
  if (idA && idB && idA === idB) return true;

  const rawTitleA = songA.title || songA.name || '';
  const rawTitleB = songB.title || songB.name || '';
  if (!rawTitleA || !rawTitleB) return false;

  // Check if one is an alternate version (remix, acoustic, live, lofi) while other is not
  const altRegex = /remix|acoustic|lofi|lo-fi|live|slowed|sped up|orchestral|piano|instrumental|karaoke|club mix/i;
  const isAltA = altRegex.test(rawTitleA);
  const isAltB = altRegex.test(rawTitleB);
  if (isAltA !== isAltB) return false;

  const durA = Number(songA.duration_seconds || songA.duration || 0);
  const durB = Number(songB.duration_seconds || songB.duration || 0);
  const durationMatches = durA === 0 || durB === 0 || Math.abs(durA - durB) <= 8;

  const titleA = cleanTitle(rawTitleA, songA.album);
  const titleB = cleanTitle(rawTitleB, songB.album);
  const rootA = getTitleRoot(rawTitleA);
  const rootB = getTitleRoot(rawTitleB);

  const isExactTitle = titleA && titleB && titleA === titleB;
  const isRootMatch = durationMatches && rootA && rootB && rootA.length >= 3 && rootB.length >= 3 && (rootA === rootB || titleA.startsWith(rootB) || titleB.startsWith(rootA));

  if (!isExactTitle && !isRootMatch) return false;

  const artistsA = getArtistTokens(songA.primary_artists || songA.primaryArtists || songA.artist || '');
  const artistsB = getArtistTokens(songB.primary_artists || songB.primaryArtists || songB.artist || '');

  if (!artistsA.length || !artistsB.length) return durationMatches;

  const sharedArtist = artistsA.some((a) => artistsB.some((b) => a === b || a.includes(b) || b.includes(a)));
  return sharedArtist && durationMatches;
}

function deduplicateSongs(songs = []) {
  if (!Array.isArray(songs)) return [];
  const result = [];
  for (const song of songs) {
    if (!song) continue;
    const existingIndex = result.findIndex((existing) => areDuplicateTracks(existing, song));
    if (existingIndex === -1) {
      result.push(song);
    } else {
      // If the incoming duplicate has more complete metadata (e.g. valid play_url / url or img), upgrade it
      const existing = result[existingIndex];
      const existingHasUrl = Boolean(existing.play_url || existing.url);
      const incomingHasUrl = Boolean(song.play_url || song.url);
      if (!existingHasUrl && incomingHasUrl) {
        result[existingIndex] = { ...existing, ...song };
      }
    }
  }
  return result;
}

module.exports = {
  cleanTitle,
  getTitleRoot,
  getArtistTokens,
  areDuplicateTracks,
  deduplicateSongs,
  decodeHtml,
};
