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
        if (!force) {
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed.timestamp && (Date.now() - parsed.timestamp < 3600000) && Array.isArray(parsed.playlists) && parsed.playlists.length > 0) {
                        return parsed.playlists;
                    }
                }
            } catch (e) {}
        }

        let effectiveHistory = history;
        let effectiveLiked = likedSongs;
        let effectiveLib = librarySongs;
        let effectiveDisliked = dislikedSongs;

        const totalPositive = (effectiveHistory.length || 0) + (effectiveLiked.length || 0) + (effectiveLib.length || 0);
        if (totalPositive === 0) {
            effectiveLiked = SEED_PROFILE;
        }

        const historyList = (effectiveHistory || []).slice(-20).map(h => `"${h.name || h.title}" by ${h.artist || 'Artist'}`);
        const likedList = (effectiveLiked || []).map(l => `"${l.name || l.title}" by ${l.artist || 'Artist'}`);
        const libList = (effectiveLib || []).map(l => `"${l.name || l.title}" by ${l.artist || 'Artist'}`);
        const dislikedList = (effectiveDisliked || []).map(d => typeof d === 'object' ? `"${d.name || d.title}" by ${d.artist || 'Artist'}` : String(d));

        const systemPrompt = "You are an elite Music Curation Director and Algorithmic DJ, acclaimed for deep musicology, harmonic continuity, acoustic texture matching, and bespoke human-like discovery. You output strictly raw JSON without markdown backticks.";

        const prompt = `Analyze this listener's music taste profile with extreme precision:

1. TOP LIKED TRACKS (Highest positive affinity - match subgenres, vocal characteristics, and energy):
[${likedList.length > 0 ? likedList.join(', ') : 'None yet'}]

2. SAVED TO LIBRARY (Musical foundation):
[${libList.length > 0 ? libList.join(', ') : 'None yet'}]

3. RECENT STREAMS (Immediate listening rotation):
[${historyList.length > 0 ? historyList.join(' | ') : 'None yet'}]

4. STRICT EXCLUSIONS / DISLIKES (NEVER recommend these tracks or artists, and avoid their signature elements):
[${dislikedList.length > 0 ? dislikedList.join(', ') : 'None'}]

CURATION INSTRUCTIONS:
- Generate 6 distinct, immersive personalized playlist categories matching different moods and facets of their taste.
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
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    playlists
                }));
                return playlists;
            }
        } catch (e) {
            console.warn("[AI] Custom playlists generation failed, using fallback:", e);
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
