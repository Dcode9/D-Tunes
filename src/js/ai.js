(function () {
    const DEFAULT_ENDPOINT = "https://ai.d-verse.in/api/chat";
    const DEFAULT_MODEL = "mercury-2.5";
    const CONFIG_KEY = "dtunes_ai_config";
    const CACHE_KEY = "dtunes_ai_playlists_cache";

    function getConfig() {
        try {
            const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
            return {
                endpoint: saved.endpoint || DEFAULT_ENDPOINT,
                model: saved.model || DEFAULT_MODEL,
                apiKey: saved.apiKey || '',
                provider: saved.provider || 'inception',
                autoPlayEnabled: saved.autoPlayEnabled !== false
            };
        } catch (e) {
            return {
                endpoint: DEFAULT_ENDPOINT,
                model: DEFAULT_MODEL,
                apiKey: '',
                provider: 'inception',
                autoPlayEnabled: true
            };
        }
    }

    function saveConfig(cfg) {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    }

    const state = {
        lastPrompt: '',
        lastResponse: '',
        lastError: null,
        isGenerating: false,
        debugLogs: []
    };

    function log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        const entry = { time, msg, type };
        state.debugLogs.unshift(entry);
        if (state.debugLogs.length > 100) state.debugLogs.pop();
        console.log(`[D-Tunes AI ${type.toUpperCase()}] ${msg}`);
        if (window.devOptions && window.devOptions.updateUI) {
            window.devOptions.updateUI();
        }
    }

    async function fetchWithRetry(url, options, retries = 2, delay = 1000) {
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
                log(`Attempt ${i + 1} failed (${e.message}), retrying in ${delay * (i + 1)}ms...`, 'warn');
                await new Promise(res => setTimeout(res, delay * Math.pow(1.5, i)));
            }
        }
    }

    async function callLLM(prompt, systemPrompt = "You are an expert music AI that outputs strictly raw JSON without markdown formatting.") {
        const cfg = getConfig();
        state.lastPrompt = prompt;
        state.lastError = null;
        log(`Sending request to ${cfg.endpoint} (Provider: ${cfg.provider}, Model: ${cfg.model})`, 'info');

        const headers = { 'Content-Type': 'application/json' };
        if (cfg.apiKey) {
            headers['Authorization'] = `Bearer ${cfg.apiKey}`;
        }

        const payload = {
            model: cfg.model,
            provider: cfg.provider,
            stream: false,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ]
        };

        try {
            const res = await fetchWithRetry(cfg.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            state.lastResponse = JSON.stringify(data, null, 2);

            let content = '';
            if (data.choices && data.choices[0] && data.choices[0].message) {
                content = data.choices[0].message.content || '';
            } else if (data.content) {
                content = data.content;
            } else if (typeof data === 'string') {
                content = data;
            } else {
                throw new Error("Unexpected LLM response format: " + JSON.stringify(data));
            }

            // Clean any potential markdown wrapping
            let clean = content.trim();
            if (clean.startsWith('```json')) {
                clean = clean.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
            } else if (clean.startsWith('```')) {
                clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            log("LLM successfully returned response (" + clean.length + " chars)", 'info');
            return JSON.parse(clean);
        } catch (err) {
            state.lastError = err.message;
            log(`LLM Error: ${err.message}`, 'error');
            throw err;
        }
    }

    // High quality sample profile when user is brand new
    const SAMPLE_PROFILE = [
        { title: "Starboy", artist: "The Weeknd" },
        { title: "Blinding Lights", artist: "The Weeknd" },
        { title: "Levitating", artist: "Dua Lipa" },
        { title: "Kesariya", artist: "Arijit Singh" },
        { title: "Get Lucky", artist: "Daft Punk" },
        { title: "Cruel Summer", artist: "Taylor Swift" }
    ];

    async function generateCustomPlaylists(history = [], likedSongs = [], librarySongs = [], force = false) {
        // Check cache if not forcing refresh
        if (!force) {
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const parsedCache = JSON.parse(cached);
                    if (parsedCache.timestamp && (Date.now() - parsedCache.timestamp < 3600000) && Array.isArray(parsedCache.playlists) && parsedCache.playlists.length > 0) {
                        log("Loaded playlists from cache (" + parsedCache.playlists.length + " mixes)", 'info');
                        return parsedCache.playlists;
                    }
                }
            } catch (e) {}
        }

        state.isGenerating = true;

        // Build taste profile representation
        let effectiveHistory = history;
        let effectiveLiked = likedSongs;
        let effectiveLib = librarySongs;

        const totalTracks = (effectiveHistory.length || 0) + (effectiveLiked.length || 0) + (effectiveLib.length || 0);
        if (totalTracks === 0) {
            log("No user history detected. Using curated taste seed for initial generation.", 'warn');
            effectiveLiked = SAMPLE_PROFILE;
        }

        const historyStr = (effectiveHistory || []).slice(-15).map(h => `"${h.name || h.title}" by ${h.artist || 'Artist'}`).join(" | ");
        const likedStr = (effectiveLiked || []).slice(-15).map(l => `"${l.name || l.title}" by ${l.artist || 'Artist'}`).join(", ");
        const libStr = (effectiveLib || []).slice(-15).map(l => `"${l.name || l.title}" by ${l.artist || 'Artist'}`).join(", ");

        const prompt = `You are an expert Music AI recommendation engine. Analyze this user's music taste profile:
      
1. RECENT HISTORY: [${historyStr || 'None'}]
2. EXPLICITLY LIKED SONGS: [${likedStr || 'None'}]
3. ADDED TO LIBRARY: [${libStr || 'None'}]

Generate 6 highly personalized playlist categories that match or expand upon their music taste.
Include a creative mix of these categories:
- "New & Trending Hits"
- "Late Night Chill & Lo-Fi"
- "High Energy & Workout Beats"
- "Deep Focus & Flow State"
- "Acoustic & Soulful Reprises"
- "More Like Favorite Artists"

Format STRICTLY as raw JSON. No markdown backticks.
Schema:
{
  "playlists": [
    {
      "categoryTitle": "String (Section Header)",
      "title": "String (Creative Mix Name)",
      "description": "String (Subtitle vibe)",
      "styleIndex": Number (0 to 6),
      "songs": [
        { "title": "String", "artist": "String" }
      ]
    }
  ]
}`;

        try {
            const parsed = await callLLM(prompt);
            const playlists = parsed.playlists || [];
            if (playlists.length > 0) {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    playlists
                }));
            }
            state.isGenerating = false;
            return playlists;
        } catch (e) {
            state.isGenerating = false;
            log(`Playlist generation failed: ${e.message}`, 'error');
            // Graceful fallback to rich starter playlists so the UI never breaks
            return getFallbackPlaylists();
        }
    }

    async function generateNextSimilar(currentTrackTitle, currentTrackArtist) {
        log(`Generating infinite radio transition for "${currentTrackTitle}" by ${currentTrackArtist}...`, 'info');
        const prompt = `The user is listening to "${currentTrackTitle}" by "${currentTrackArtist}". 
Recommend EXACTLY ONE highly similar track that provides a seamless, pleasing infinite radio transition.
Return ONLY raw JSON with no markdown:
{"title": "Song Name", "artist": "Artist Name"}`;

        try {
            const parsed = await callLLM(prompt, "You output strictly raw JSON with keys title and artist. No markdown.");
            if (parsed && parsed.title) {
                log(`AI Radio recommended: "${parsed.title}" by ${parsed.artist}`, 'info');
                return parsed;
            }
        } catch (e) {
            log(`Infinite radio recommendation failed: ${e.message}`, 'error');
        }
        return null;
    }

    async function generatePlaylistFromPrompt(userPrompt) {
        if (!userPrompt || !userPrompt.trim()) return null;
        log(`Generating custom playlist from prompt: "${userPrompt}"...`, 'info');
        const prompt = `Create a custom 6-song music playlist based on this exact user request: "${userPrompt}".
Ensure the songs are real and widely known.
Return ONLY raw JSON with no markdown:
{
  "title": "String (Catchy Mix Title)",
  "description": "String (Subtitle)",
  "styleIndex": Number (0 to 6),
  "songs": [
    { "title": "String", "artist": "String" }
  ]
}`;

        try {
            const parsed = await callLLM(prompt);
            return {
                id: 'ai_' + Date.now(),
                ...parsed
            };
        } catch (e) {
            log(`Prompt-based playlist creation failed: ${e.message}`, 'error');
            return null;
        }
    }

    function getFallbackPlaylists() {
        return [
            {
                categoryTitle: "Trending Global Hits",
                title: "Top Charting Resonance",
                description: "Today's most listened global hits",
                styleIndex: 0,
                songs: [
                    { title: "Blinding Lights", artist: "The Weeknd" },
                    { title: "Levitating", artist: "Dua Lipa" },
                    { title: "As It Was", artist: "Harry Styles" },
                    { title: "Starboy", artist: "The Weeknd" }
                ]
            },
            {
                categoryTitle: "Chill Vibes & Relaxation",
                title: "Midnight Lo-Fi & Soul",
                description: "Calm frequencies for evening unwinding",
                styleIndex: 1,
                songs: [
                    { title: "Lovely", artist: "Billie Eilish & Khalid" },
                    { title: "Heat Waves", artist: "Glass Animals" },
                    { title: "Sunflower", artist: "Post Malone & Swae Lee" },
                    { title: "Stay", artist: "The Kid LAROI & Justin Bieber" }
                ]
            },
            {
                categoryTitle: "Energetic Beats",
                title: "Peak Energy & Flow",
                description: "Pump-up rhythms to keep momentum high",
                styleIndex: 2,
                songs: [
                    { title: "One More Time", artist: "Daft Punk" },
                    { title: "Titanium", artist: "David Guetta & Sia" },
                    { title: "Wake Me Up", artist: "Avicii" },
                    { title: "Closer", artist: "The Chainsmokers" }
                ]
            }
        ];
    }

    async function testConnection() {
        const start = Date.now();
        try {
            const res = await callLLM('Output raw JSON: {"status": "ok", "message": "Inception AI connection active"}');
            const duration = Date.now() - start;
            return { success: true, duration, data: res };
        } catch (e) {
            return { success: false, duration: Date.now() - start, error: e.message };
        }
    }

    function clearCache() {
        localStorage.removeItem(CACHE_KEY);
        log("Cleared AI playlists cache", 'info');
    }

    window.ai = {
        getConfig,
        saveConfig,
        state,
        log,
        generateCustomPlaylists,
        generateNextSimilar,
        generatePlaylistFromPrompt,
        testConnection,
        clearCache,
        SAMPLE_PROFILE
    };
})();
