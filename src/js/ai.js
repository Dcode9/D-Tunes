(function () {
    const DEFAULT_ENDPOINT = "https://ai.d-verse.in/api/chat";
    const DEFAULT_MODEL = "mercury-2.5";
    const CACHE_KEY = "dtunes_ai_playlists_cache_v2";

    // The server-side API (/api/music/autoplay, /api/music/mixes) is preferred;
    // this direct AI path is now a last-resort client fallback only.

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
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error('Offline');
        }
        for (let i = 0; i <= retries; i++) {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                throw new Error('Offline');
            }
            let timeoutId = null;
            try {
                let fetchSignal;
                if (typeof AbortController !== 'undefined') {
                    const controller = new AbortController();
                    timeoutId = setTimeout(() => controller.abort(), 6000);
                    fetchSignal = controller.signal;
                }
                const res = await fetch(url, { ...options, signal: fetchSignal });
                if (timeoutId) clearTimeout(timeoutId);
                if (!res.ok) {
                    const errorText = await res.text().catch(() => '');
                    throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
                }
                return res;
            } catch (e) {
                if (timeoutId) clearTimeout(timeoutId);
                if (typeof navigator !== 'undefined' && !navigator.onLine) throw e;
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
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            return [];
        }
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
- Each mix must contain BETWEEN 15 AND 25 real, popular, widely known songs that exist on streaming platforms.
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
                    { title: "Starboy", artist: "The Weeknd" },
                    { title: "Die For You", artist: "The Weeknd" },
                    { title: "Save Your Tears", artist: "The Weeknd" },
                    { title: "Take On Me", artist: "a-ha" },
                    { title: "Billie Jean", artist: "Michael Jackson" },
                    { title: "Dancing On My Own", artist: "Robyn" },
                    { title: "Nightcall", artist: "Kavinsky" },
                    { title: "The Less I Know The Better", artist: "Tame Impala" },
                    { title: "Electric Feel", artist: "MGMT" },
                    { title: "Redbone", artist: "Childish Gambino" },
                    { title: "Snooze", artist: "SZA" },
                    { title: "Kill Bill", artist: "SZA" }
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
                    { title: "Lovely", artist: "Billie Eilish & Khalid" },
                    { title: "Yellow", artist: "Coldplay" },
                    { title: "Viva La Vida", artist: "Coldplay" },
                    { title: "Good Life", artist: "OneRepublic" },
                    { title: "Count On Me", artist: "Bruno Mars" },
                    { title: "Island In The Sun", artist: "Weezer" },
                    { title: "Banana Pancakes", artist: "Jack Johnson" },
                    { title: "Put Your Records On", artist: "Corinne Bailey Rae" },
                    { title: "Valerie", artist: "Mark Ronson & Amy Winehouse" },
                    { title: "September", artist: "Earth, Wind & Fire" },
                    { title: "Walking On Sunshine", artist: "Katrina & The Waves" },
                    { title: "Here Comes The Sun", artist: "The Beatles" }
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
                    { title: "Riptide", artist: "Vance Joy" },
                    { title: "Tum Hi Ho", artist: "Arijit Singh" },
                    { title: "Channa Mereya", artist: "Arijit Singh" },
                    { title: "Agar Tum Saath Ho", artist: "Arijit Singh, Alka Yagnik" },
                    { title: "Imagine", artist: "John Lennon" },
                    { title: "Let It Be", artist: "The Beatles" },
                    { title: "Nothing Compares 2 U", artist: "Sinéad O'Connor" },
                    { title: "Fast Car", artist: "Tracy Chapman" },
                    { title: "Landslide", artist: "Fleetwood Mac" },
                    { title: "Ho Hey", artist: "The Lumineers" },
                    { title: "I'm Yours", artist: "Jason Mraz" },
                    { title: "Say You Won't Let Go", artist: "James Arthur" }
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
                    { title: "Don't Start Now", artist: "Dua Lipa" },
                    { title: "Levels", artist: "Avicii" },
                    { title: "Believer", artist: "Imagine Dragons" },
                    { title: "Radioactive", artist: "Imagine Dragons" },
                    { title: "Stronger", artist: "Kanye West" },
                    { title: "Without Me", artist: "Eminem" },
                    { title: "Can't Hold Us", artist: "Macklemore & Ryan Lewis" },
                    { title: "Uptown Funk", artist: "Mark Ronson & Bruno Mars" },
                    { title: "Happy", artist: "Pharrell Williams" },
                    { title: "Shut Up and Dance", artist: "WALK THE MOON" },
                    { title: "Mr. Brightside", artist: "The Killers" },
                    { title: "Poison", artist: "The Prodigy" }
                ]
            }
        ];
    }

    async function generateVibeMix(vibePrompt, options = {}) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            throw new Error('Offline: Vibe Mix requires an internet connection');
        }
        const { isTimeCapsule = false, infuseTaste = true } = options;
        const disliked = (state.dislikedSongs || []).map(d => {
            if (typeof d === 'object') return `"${d.name || d.title}" by ${d.artist || 'Artist'}`;
            const s = window.songStore?.get(d);
            return s ? `"${s.name || s.title}" by ${s.artist || 'Artist'}` : String(d);
        });

        // Gather taste context
        let tasteContext = '';
        if (infuseTaste) {
            const topArtists = Object.entries(state.artistPlayCounts || {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([artist]) => artist);

            const likedTitles = (state.likedIds || []).slice(0, 10).map(l => {
                const s = typeof l === 'object' ? l : (window.songStore?.get(l) || state.playHistory?.find(h => h.id === l));
                return s ? `"${s.name || s.title}" by ${s.artist || 'Artist'}` : null;
            }).filter(Boolean);

            const recentTitles = (state.playHistory || []).slice(0, 15).map(h => {
                return `"${h.name || h.title}" by ${h.artist || 'Artist'}`;
            });

            // Older history for Time Capsule
            const olderHistory = (state.playHistory || []).slice(10, 40).map(h => {
                return `"${h.name || h.title}" by ${h.artist || 'Artist'}`;
            });

            tasteContext = `
Listener's Taste Profile:
- Top Artists: [${topArtists.join(', ') || 'Various'}]
- Favorite Liked Tracks: [${likedTitles.join(', ') || 'Various'}]
- Recent Plays: [${recentTitles.join(', ') || 'Various'}]
${isTimeCapsule ? `- Older Played Tracks (for rediscovery & time capsule nostalgia): [${olderHistory.join(', ') || likedTitles.join(', ')}]` : ''}
`;
        }

        let systemInstruction = "You are an expert music curator and playlist architect. Return ONLY valid raw JSON with schema: {\"title\": \"string\", \"description\": \"string\", \"styleIndex\": number (0-6), \"songs\": [{\"title\": \"string\", \"artist\": \"string\"}]}. No markdown formatting.";

        let userPrompt = '';
        if (isTimeCapsule) {
            userPrompt = `Curate a "Musical Time Capsule" playlist for this listener to rediscover forgotten favorites, signature anthems, and deep cuts from their past listening habits.
${tasteContext}
Strict Exclusions (NEVER recommend): [${disliked.length > 0 ? disliked.join(', ') : 'None'}]

Requirements:
- Curate an evocative, nostalgic title (e.g., "Rewind & Resonance", "Nostalgia Capsule", "Forgotten Echoes").
- Write an engaging 1-sentence description capturing their personal music journey.
- Include 8 to 10 real, popular songs that match their past listening era and favorite artists, blending beloved tracks with related nostalgic discoveries.
- Ensure artist diversity (max 2 tracks per artist).
- Strictly obey negative exclusions.`;
        } else {
            userPrompt = `Curate a "Vibe Mix" playlist tailored to this mood / request: "${vibePrompt || 'Feel Good Vibes'}".
${tasteContext}
Strict Exclusions (NEVER recommend): [${disliked.length > 0 ? disliked.join(', ') : 'None'}]

Requirements:
- Curate a human, aesthetic playlist title fitting the vibe (e.g. "Velvet Midnight", "Golden Hour Drift", "Sunday Morning Brew").
- Write an evocative 1-sentence description.
- Pick a styleIndex between 0 and 6.
- Curate 8 to 10 real, popular songs available on major streaming platforms matching this exact mood and acoustic feel ${infuseTaste ? 'while aligning seamlessly with the listener\'s music taste' : ''}.
- Ensure artist variety (no duplicate artists).
- Strictly obey negative exclusions.`;
        }

        try {
            const parsed = await callLLM(userPrompt, systemInstruction);
            if (parsed && Array.isArray(parsed.songs) && parsed.songs.length > 0) {
                return {
                    title: parsed.title || (isTimeCapsule ? "Time Capsule" : "Vibe Mix"),
                    description: parsed.description || "Curated for your moment.",
                    styleIndex: typeof parsed.styleIndex === 'number' ? parsed.styleIndex : Math.floor(Math.random() * 7),
                    songs: parsed.songs
                };
            }
        } catch (e) {
            console.warn("[VibeMix] AI generation failed, using fallback:", e);
        }

        // Fallback if network or LLM fails
        return {
            title: isTimeCapsule ? "Time Capsule Rewind" : (vibePrompt || "Vibe Mix"),
            description: "Handcrafted collection curated for your mood.",
            styleIndex: 1,
            songs: [
                { title: "Blinding Lights", artist: "The Weeknd" },
                { title: "Starboy", artist: "The Weeknd" },
                { title: "Levitating", artist: "Dua Lipa" },
                { title: "Get Lucky", artist: "Daft Punk" },
                { title: "Cruel Summer", artist: "Taylor Swift" },
                { title: "Midnight City", artist: "M83" }
            ]
        };
    }

    function clearCache() {
        localStorage.removeItem(CACHE_KEY);
    }

    const API_TIMEOUT_MS = 12000;
    const ANON_USER_KEY = 'dtunesAnonymousUserId';

    function resolveApiUserId() {
        try {
            if (window.recommendationClient && typeof window.recommendationClient.getUserId === 'function') {
                const id = window.recommendationClient.getUserId();
                if (id) return id;
            }
        } catch (_) {}
        try {
            if (window.cloudLibrary && cloudLibrary.session && cloudLibrary.session.user && cloudLibrary.session.user.id) {
                return cloudLibrary.session.user.id;
            }
        } catch (_) {}
        try {
            let id = localStorage.getItem(ANON_USER_KEY);
            if (!id) {
                const random = (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
                id = `anon_${random}`;
                localStorage.setItem(ANON_USER_KEY, id);
            }
            return id;
        } catch (_) {
            return 'anonymous';
        }
    }

    function isOfflineNow() {
        try {
            if (typeof window !== 'undefined' && typeof window.__dtunesIsOffline === 'function') {
                return window.__dtunesIsOffline();
            }
        } catch (_) {}
        return typeof navigator !== 'undefined' && navigator.onLine === false;
    }

    function normalizeApiSong(song) {
        if (!song) return null;
        try {
            if (window.recommendationClient && typeof window.recommendationClient.toAppSong === 'function') {
                return window.recommendationClient.toAppSong(song);
            }
        } catch (_) {}
        return {
            ...song,
            id: song.saavn_id || song.saavnId || song.id || null,
            name: song.name || song.title || '',
            artist: song.artist || song.primary_artists || song.primaryArtists || 'Unknown Artist',
            img: song.img || song.image_url || song.artwork_url || 'DTunes.svg',
            url: song.url || song.play_url || null,
            duration: song.duration || song.duration_seconds || 0,
            source: song.source || 'recommendation'
        };
    }

    function toIdList(value) {
        if (!Array.isArray(value)) return [];
        return value
            .map(item => (item && typeof item === 'object' ? (item.saavn_id || item.saavnId || item.id) : item))
            .filter(Boolean)
            .map(String);
    }

    async function postMusicApi(path, payload) {
        if (isOfflineNow()) return null;
        let controller = null;
        let timer = null;
        try {
            if (typeof AbortController !== 'undefined') {
                controller = new AbortController();
                timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
            }
            const res = await fetch(path, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller ? controller.signal : undefined
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            return null;
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    async function fetchServerMixes(options = {}) {
        const payload = {
            userId: options.userId || resolveApiUserId(),
            limit: options.limit || 20,
            currentQueueIds: toIdList(options.currentQueueIds),
            sessionHistory: Array.isArray(options.sessionHistory) ? options.sessionHistory : [],
            dislikedSongIds: toIdList(options.dislikedSongIds || options.disliked),
            negativeTitles: toIdList(options.negativeTitles)
        };
        if (options.language) payload.language = options.language;
        if (options.type) payload.type = options.type;
        const data = await postMusicApi('/api/music/mixes', payload);
        if (!data || !Array.isArray(data.mixes) || data.mixes.length === 0) return null;
        return data.mixes.map((mix, i) => ({
            key: mix.key || `daily-mix-${i + 1}`,
            categoryTitle: mix.categoryTitle || mix.title || 'Mix',
            title: mix.title || mix.categoryTitle || 'Mix',
            description: mix.description || '',
            styleIndex: Number.isFinite(Number(mix.styleIndex)) ? Number(mix.styleIndex) : i,
            songs: (Array.isArray(mix.songs) ? mix.songs : []).map(normalizeApiSong).filter(Boolean)
        })).filter(mix => mix.songs.length > 0);
    }

    async function fetchServerAutoplay(options = {}) {
        const payload = {
            userId: options.userId || resolveApiUserId(),
            seedSongId: options.seedSongId || options.songId || undefined,
            limit: options.limit || options.count || 8,
            currentQueueIds: toIdList(options.currentQueueIds),
            excludedSongIds: toIdList(options.excludedSongIds || options.dislikedSongIds || options.disliked)
        };
        if (options.language) payload.language = options.language;
        const data = await postMusicApi('/api/music/autoplay', payload);
        if (!data || !Array.isArray(data.songs) || data.songs.length === 0) return null;
        return data.songs.map(normalizeApiSong).filter(Boolean);
    }

    function getLocalYourMix() {
        const mix = getFallbackPlaylists()[0] || {};
        return {
            key: 'your-mix',
            categoryTitle: 'Your Mix',
            title: mix.title || 'Your Mix',
            description: mix.description || '',
            styleIndex: Number.isFinite(mix.styleIndex) ? mix.styleIndex : 0,
            songs: mix.songs || []
        };
    }

    window.ai = {
        generateCustomPlaylists,
        generateQueueAutoplay,
        generateNextSimilar,
        generateVibeMix,
        clearCache,
        fetchServerMixes,
        fetchServerAutoplay,
        getLocalYourMix
    };
})();
