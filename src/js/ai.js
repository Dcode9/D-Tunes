(function () {
    const DEFAULT_ENDPOINT = "https://ai.d-verse.in/api/chat";
    const DEFAULT_MODEL = "mercury-2.5";
    const CACHE_KEY = "dtunes_ai_playlists_cache_v2";

    // Curated seed taste profile when user is brand new with 0 history
    const SEED_PROFILE = [
        { title: "Starboy", artist: "The Weeknd" },
        { title: "Blinding Lights", artist: "The Weeknd" },
        { title: "Levitating", artist: "Dua Lipa" },
        { title: "Kesariya", artist: "Arijit Singh" },
        { title: "Get Lucky", artist: "Daft Punk" },
        { title: "Cruel Summer", artist: "Taylor Swift" }
    ];

    async function fetchWithRetry(url, options, retries = 2, delay = 800) {
        for (let i = 0; i <= retries; i++) {
            try {
                const res = await fetch(url, options);
                if (!res.ok) {
                    const errorText = await res.text().catch(() => '');
                    throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
                }
                return res;
            } catch (e) {
                if (i === retries) throw e;
                await new Promise(res => setTimeout(res, delay * (i + 1)));
            }
        }
    }

    async function callLLM(prompt, systemPrompt = "You are an elite music curation director that outputs strictly raw JSON without markdown formatting.") {
        const payload = {
            model: DEFAULT_MODEL,
            provider: "inception",
            stream: false,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ]
        };

        const res = await fetchWithRetry(DEFAULT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        let content = '';
        if (data.choices && data.choices[0] && data.choices[0].message) {
            content = data.choices[0].message.content || '';
        } else if (data.content) {
            content = data.content;
        } else if (typeof data === 'string') {
            content = data;
        } else {
            throw new Error("Unexpected LLM response");
        }

        // Clean any markdown backticks
        let clean = content.trim();
        if (clean.startsWith('```json')) {
            clean = clean.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
        } else if (clean.startsWith('```')) {
            clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        return JSON.parse(clean);
    }

    async function generateCustomPlaylists(history = [], likedSongs = [], librarySongs = [], dislikedSongs = [], force = false) {
        let effectiveHistory = history && history.length ? history : (state.playHistory || []);
        let effectiveLiked = likedSongs && likedSongs.length ? likedSongs : (state.likedIds || []);
        let effectiveLib = librarySongs && librarySongs.length ? librarySongs : (state.libraryIds || []);
        let effectiveDisliked = dislikedSongs && dislikedSongs.length ? dislikedSongs : (state.dislikedSongs || []);

        // 1. Playlists data (Custom playlists, song titles, and durations)
        const playlistsData = Object.entries(state.playlists || {})
            .filter(([_, songs]) => Array.isArray(songs) && songs.length > 0)
            .map(([name, songs]) => {
                const songList = songs.slice(0, 10).map(s => {
                    const title = s.name || s.title || 'Track';
                    const artist = s.artist || s.primary_artists || 'Artist';
                    const dur = s.duration ? ` [${Math.floor(s.duration / 60)}:${String(s.duration % 60).padStart(2, '0')}]` : '';
                    return `"${title}" by ${artist}${dur}`;
                }).join(', ');
                return `Playlist "${name}" (${songs.length} tracks): [${songList}]`;
            });

        // 2. Play history with track durations and listen timestamps
        const historyList = (effectiveHistory || []).slice(0, 25).map(h => {
            const title = h.name || h.title || 'Track';
            const artist = h.artist || h.primary_artists || 'Artist';
            const dur = h.duration ? ` (length: ${Math.floor(h.duration / 60)}:${String(h.duration % 60).padStart(2, '0')})` : '';
            const playedAt = h.playedAt ? ` at ${h.playedAt.slice(0, 16).replace('T', ' ')}` : '';
            return `"${title}" by ${artist}${dur}${playedAt}`;
        });

        // 3. Listening stats & total play durations (from cloud if signed in)
        let statsList = [];
        try {
            if (window.dverse && window.dverse.dtunes && window.dverse.dtunes.fetchListeningStats) {
                const stats = await window.dverse.dtunes.fetchListeningStats(15);
                if (Array.isArray(stats) && stats.length > 0) {
                    statsList = stats.map(s => {
                        const tr = s.dtunes_tracks || {};
                        const mins = Math.round((s.total_duration_ms || 0) / 60000);
                        return `"${tr.title || 'Track'}" by ${tr.artist || 'Artist'} (${s.play_count} plays, ~${mins} min listened)`;
                    });
                }
            }
        } catch (e) {}

        // 4. Artist play counts
        const artistCounts = Object.entries(state.artistPlayCounts || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([artist, count]) => `${artist} (${count} plays)`);

        // 5. Liked & Library songs
        const likedList = (effectiveLiked || []).map(l => {
            const song = typeof l === 'object' ? l : (window.songStore?.get(l) || state.playHistory?.find(h => h.id === l));
            return song ? `"${song.name || song.title}" by ${song.artist || 'Artist'}` : null;
        }).filter(Boolean);

        const libList = (effectiveLib || []).map(l => {
            const song = typeof l === 'object' ? l : (window.songStore?.get(l) || state.playHistory?.find(h => h.id === l));
            return song ? `"${song.name || song.title}" by ${song.artist || 'Artist'}` : null;
        }).filter(Boolean);

        // 6. Strict Dislikes / Exclusions
        const dislikedList = (effectiveDisliked || []).map(d => {
            if (typeof d === 'object') return `"${d.name || d.title}" by ${d.artist || 'Artist'}`;
            const s = window.songStore?.get(d);
            return s ? `"${s.name || s.title}" by ${s.artist || 'Artist'}` : String(d);
        });

        const totalPositive = historyList.length + likedList.length + libList.length + playlistsData.length + statsList.length;
        if (totalPositive === 0) {
            effectiveLiked = SEED_PROFILE;
        }

        const systemPrompt = "You are an elite music curation director acclaimed for deep musicology, harmonic continuity, acoustic texture matching, and human-like discovery. You output strictly raw JSON without markdown backticks.";

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

        try {
            const parsed = await callLLM(prompt, systemPrompt);
            const playlists = parsed.playlists || [];
            if (playlists.length > 0) {
                return playlists;
            }
        } catch (e) {
            console.warn("[Recommendations] Playlists generation error, using fallback:", e);
        }

        return getFallbackPlaylists();
    }

    async function generateQueueAutoplay(seedTitle, seedArtist, count = 8, dislikedSongs = []) {
        const dislikedList = (dislikedSongs || []).map(d => typeof d === 'object' ? `"${d.name || d.title}" by ${d.artist || 'Artist'}` : String(d));
        
        const prompt = `The listener is currently enjoying "${seedTitle}" by "${seedArtist}".
Strict exclusions (never recommend): [${dislikedList.length > 0 ? dislikedList.join(', ') : 'None'}]

Recommend ${count} real, popular, and stylistically similar songs that maintain seamless harmonic, tempo, and emotional continuity with this track for an uninterrupted continuous listening session.
Ensure artist variety (do not repeat the same artist more than once).
Return ONLY raw JSON with schema:
{
  "songs": [
    { "title": "Song Name", "artist": "Artist Name" }
  ]
}`;

        try {
            const parsed = await callLLM(prompt, "You output strictly raw JSON with schema {\"songs\": [{\"title\": \"string\", \"artist\": \"string\"}]}. No markdown.");
            return parsed.songs || [];
        } catch (e) {
            console.warn("[AI] Queue autoplay generation error:", e);
            return [];
        }
    }

    async function generateNextSimilar(currentTrackTitle, currentTrackArtist, dislikedSongs = []) {
        const dislikedList = (dislikedSongs || []).map(d => typeof d === 'object' ? `"${d.name || d.title}" by ${d.artist || 'Artist'}` : String(d));
        const prompt = `The user is listening to "${currentTrackTitle}" by "${currentTrackArtist}".
Strict exclusions: [${dislikedList.length > 0 ? dislikedList.join(', ') : 'None'}]
Recommend EXACTLY ONE highly similar track that provides a seamless, pleasing transition.
Return ONLY raw JSON: {"title": "Song Name", "artist": "Artist Name"}`;

        try {
            const parsed = await callLLM(prompt, "You output strictly raw JSON with keys title and artist. No markdown.");
            return parsed;
        } catch (e) {
            return null;
        }
    }

    function getFallbackPlaylists() {
        return [
            {
                categoryTitle: "After Hours Resonance",
                title: "Midnight Velvet",
                description: "Deep nocturnal rhythms and atmospheric melodies",
                styleIndex: 0,
                songs: [
                    { title: "Blinding Lights", artist: "The Weeknd" },
                    { title: "Levitating", artist: "Dua Lipa" },
                    { title: "Midnight City", artist: "M83" },
                    { title: "Get Lucky", artist: "Daft Punk" },
                    { title: "Starboy", artist: "The Weeknd" }
                ]
            },
            {
                categoryTitle: "Golden Hour Glow",
                title: "Sun-Drenched Waves",
                description: "Warm guitars and indie-pop sunset melodies",
                styleIndex: 1,
                songs: [
                    { title: "Heat Waves", artist: "Glass Animals" },
                    { title: "As It Was", artist: "Harry Styles" },
                    { title: "Sunflower", artist: "Post Malone & Swae Lee" },
                    { title: "Stay", artist: "The Kid LAROI & Justin Bieber" },
                    { title: "Lovely", artist: "Billie Eilish & Khalid" }
                ]
            },
            {
                categoryTitle: "Acoustic & Soulful",
                title: "Raw & Unplugged",
                description: "Intimate vocals, warm acoustic guitar, and piano warmth",
                styleIndex: 2,
                songs: [
                    { title: "Kesariya", artist: "Arijit Singh" },
                    { title: "Shallow", artist: "Lady Gaga & Bradley Cooper" },
                    { title: "Someone Like You", artist: "Adele" },
                    { title: "All of Me", artist: "John Legend" },
                    { title: "Riptide", artist: "Vance Joy" }
                ]
            },
            {
                categoryTitle: "Peak Energy & Flow",
                title: "Electric Momentum",
                description: "High-octane electronic beats to fuel your focus and pace",
                styleIndex: 3,
                songs: [
                    { title: "One More Time", artist: "Daft Punk" },
                    { title: "Titanium", artist: "David Guetta & Sia" },
                    { title: "Wake Me Up", artist: "Avicii" },
                    { title: "Closer", artist: "The Chainsmokers" },
                    { title: "Don't Start Now", artist: "Dua Lipa" }
                ]
            }
        ];
    }

    function clearCache() {
        localStorage.removeItem(CACHE_KEY);
    }

    window.ai = {
        generateCustomPlaylists,
        generateQueueAutoplay,
        generateNextSimilar,
        clearCache
    };
})();
