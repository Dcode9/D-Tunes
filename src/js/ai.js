(function () {
    const INCEPTION_API_KEY = ""; // Inception API Key
    const INCEPTION_ENDPOINT = "https://api.inceptionlabs.ai/v1/chat/completions";
    const MODEL_NAME = "mercury-2.5";

    async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                const res = await fetch(url, options);
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                return res;
            } catch (e) {
                if (i === retries - 1) throw e;
                await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
            }
        }
    }

    async function generateCustomPlaylists(history, likedSongs, librarySongs) {
        if (!history || history.length < 2) return [];
        
        const historyStr = history.slice(-15).map(h => `"${h.title || h.name}" by ${h.artist || h.artists} (${h.listenDuration || 0}s)`).join(" | ");
        const likedStr = likedSongs.map(l => `"${l.title || l.name}" by ${l.artist || l.artists}`).join(", ");
        const libStr = librarySongs.map(l => `"${l.title || l.name}" by ${l.artist || l.artists}`).join(", ");

        const prompt = `You are an expert Music AI. Analyze this user's music taste profile:
      
      1. RECENT HISTORY (Duration indicates preference): [${historyStr}]
      2. EXPLICITLY LIKED SONGS (Strongest preference): [${likedStr || 'None yet'}]
      3. ADDED TO LIBRARY (Long-term preference): [${libStr || 'None yet'}]
      
      Generate 6 highly personalized playlist categories. Prioritize genres/artists found in their Liked and Library songs.
      Include a mix of these specific categories based on the data:
      - "New Releases" (match their favorite genres)
      - "Chart Topping" (in their preferred language/region based on history)
      - "Albums featuring songs you like"
      - "Recommended for today"
      - "Recents & Reprises"
      - "More like [Specific Artist from Liked/History]"

      Format strictly as JSON. No markdown.
      Schema:
      {
        "playlists": [
          {
            "categoryTitle": "String",
            "title": "String (Creative Mix Name)",
            "description": "String (Short subtitle)",
            "styleIndex": Number (0 to 6),
            "songs": [ { "title": "String", "artist": "String" } ] // Exactly 5 real, well-known songs per playlist
          }
        ]
      }`;

        const payload = {
            model: MODEL_NAME,
            messages: [
                { role: "system", content: "You output only valid JSON without markdown formatting." },
                { role: "user", content: prompt }
            ],
            stream: false,
            max_tokens: 4096,
            temperature: 0.7
        };

        const headers = { 'Content-Type': 'application/json' };
        if (INCEPTION_API_KEY) headers['Authorization'] = `Bearer ${INCEPTION_API_KEY}`;

        try {
            const response = await fetchWithRetry(INCEPTION_ENDPOINT, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            const text = data.choices[0].message.content.trim();
            // Try to parse JSON from text, remove markdown if present
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedData = JSON.parse(cleanText);
            return parsedData.playlists || [];
        } catch (error) {
            console.error("Error generating playlists:", error);
            return [];
        }
    }

    async function generatePlaylistFromPrompt(promptDesc) {
        if (!promptDesc.trim()) return null;
        const prompt = `Create a custom 6-song music playlist based on this exact user description/vibe: "${promptDesc}".
      Make sure the songs perfectly capture the requested mood, genre, or activity. Ensure the songs are real and popular enough to be found on iTunes/Spotify.
      
      Format strictly as JSON. No markdown.
      Schema:
      {
        "title": "String (A catchy, aesthetic title for this playlist)",
        "description": "String (A poetic or descriptive subtitle)",
        "styleIndex": Number (Random integer from 0 to 6),
        "songs": [ { "title": "String", "artist": "String" } ]
      }`;

        const payload = {
            model: MODEL_NAME,
            messages: [
                { role: "system", content: "You output only valid JSON without markdown formatting." },
                { role: "user", content: prompt }
            ],
            stream: false,
            max_tokens: 4096,
            temperature: 0.7
        };

        const headers = { 'Content-Type': 'application/json' };
        if (INCEPTION_API_KEY) headers['Authorization'] = `Bearer ${INCEPTION_API_KEY}`;

        try {
            const response = await fetchWithRetry(INCEPTION_ENDPOINT, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            const text = data.choices[0].message.content.trim();
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsedData = JSON.parse(cleanText);
            return {
                id: Date.now().toString(),
                ...parsedData
            };
        } catch (error) {
            console.error("Failed to create playlist:", error);
            return null;
        }
    }

    async function generateNextSimilar(currentTrackTitle, currentTrackArtist) {
        const prompt = `The user just listened to "${currentTrackTitle}" by "${currentTrackArtist}". 
      Recommend EXACTLY ONE highly similar track for a seamless infinite radio transition.
      Return ONLY raw JSON: {"title": "Song Name", "artist": "Artist Name"}`;

        const payload = {
            model: MODEL_NAME,
            messages: [
                { role: "system", content: "You output only valid JSON without markdown formatting." },
                { role: "user", content: prompt }
            ],
            stream: false,
            max_tokens: 1024,
            temperature: 0.7
        };

        const headers = { 'Content-Type': 'application/json' };
        if (INCEPTION_API_KEY) headers['Authorization'] = `Bearer ${INCEPTION_API_KEY}`;

        try {
            const response = await fetchWithRetry(INCEPTION_ENDPOINT, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            const text = data.choices[0].message.content.trim();
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanText);
        } catch (error) {
            console.error("Failed to generate similar track:", error);
            return null;
        }
    }

    window.ai = { generateCustomPlaylists, generatePlaylistFromPrompt, generateNextSimilar };
})();
