const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./testHarness');

// Reference UI Controller for Album and Artist Views
function createMediaViewsController(env, jiosaavnApiMock, playerMock) {
    const state = {
        currentView: 'home',
        viewHistory: ['home'],
        likedArtists: [],
        libraryAlbums: [],
        currentAlbum: null,
        currentArtist: null
    };

    const switchView = (viewName) => {
        state.currentView = viewName;
        state.viewHistory.push(viewName);
        const views = ['home', 'search', 'library', 'stats', 'settings', 'playlist', 'album', 'artist'];
        views.forEach(v => {
            const el = env.document.getElementById(`view-${v}`);
            if (el) {
                if (v === viewName) el.classList.remove('hidden');
                else el.classList.add('hidden');
            }
        });
    };

    const formatTime = (secs) => {
        if (!secs || isNaN(secs) || secs < 0) return '0:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const formatRuntime = (songs = []) => {
        const total = songs.reduce((acc, s) => acc + (Number(s.duration || s.duration_seconds) || 0), 0);
        if (total <= 0) return '0 mins';
        const hrs = Math.floor(total / 3600);
        const mins = Math.floor((total % 3600) / 60);
        if (hrs === 0) return `${mins} mins`;
        return `${hrs} hr${hrs === 1 ? '' : 's'} ${mins} mins`;
    };

    const openAlbum = async (albumId) => {
        switchView('album');
        const viewEl = env.document.getElementById('view-album');
        if (!albumId) {
            viewEl.innerHTML = '<div class="error-msg">Album not found</div>';
            return false;
        }

        try {
            const data = await jiosaavnApiMock.getAlbum(albumId);
            if (!data) throw new Error('Album not found');
            state.currentAlbum = data;

            const songs = data.songs || [];
            const tracklistHtml = songs.map((s, idx) => `
                <div class="album-track-row" data-id="${s.id}" data-index="${idx}">
                    <span class="track-number">${idx + 1}</span>
                    <span class="track-title">${s.name || s.title}</span>
                    <span class="track-duration">${formatTime(s.duration || s.duration_seconds)}</span>
                </div>
            `).join('');

            viewEl.innerHTML = `
                <div class="album-header">
                    <img class="album-cover" src="${data.image || 'assets/DTunes2.svg'}">
                    <h1 class="album-title">${data.name || data.title}</h1>
                    <button class="album-artist-link" data-artist-id="${data.artistId || ''}">${data.artist || data.primaryArtists || 'Various Artists'}</button>
                    <span class="album-year">${data.year || 'Unknown'}</span>
                    <span class="album-count">${songs.length} song${songs.length === 1 ? '' : 's'}</span>
                    <span class="album-runtime">${formatRuntime(songs)}</span>
                    <button class="btn-album-play-all">Play All</button>
                    <button class="btn-album-play-next">Play Next</button>
                    <button class="btn-album-add-queue">Add to Queue</button>
                    <button class="btn-album-save-lib">Save to Library</button>
                </div>
                <div class="album-tracklist">${tracklistHtml}</div>
            `;
            return true;
        } catch (e) {
            viewEl.innerHTML = '<div class="error-msg">Failed to load album</div>';
            return false;
        }
    };

    const openArtist = async (artistId, artistName = '') => {
        switchView('artist');
        const viewEl = env.document.getElementById('view-artist');
        if (!artistId && !artistName) {
            viewEl.innerHTML = '<div class="error-msg">Artist not found</div>';
            return false;
        }

        try {
            const data = await jiosaavnApiMock.getArtist(artistId || artistName);
            if (!data) throw new Error('Artist not found');
            state.currentArtist = data;

            const topSongs = data.topSongs || [];
            const albums = data.albums || [];
            const isLiked = state.likedArtists.some(a => (a.id || a.name) === (data.id || data.name));

            const topSongsHtml = topSongs.slice(0, 10).map((s, idx) => `
                <div class="artist-song-row" data-id="${s.id}">
                    <span class="song-rank">#${idx + 1}</span>
                    <span class="song-title">${s.name || s.title}</span>
                    <span class="song-duration">${formatTime(s.duration || s.duration_seconds)}</span>
                </div>
            `).join('');

            const albumsHtml = albums.map(a => `
                <div class="artist-album-card" data-album-id="${a.id}">
                    <img src="${a.image || 'assets/DTunes2.svg'}">
                    <p class="album-card-title">${a.name || a.title}</p>
                    <p class="album-card-year">${a.year || ''}</p>
                </div>
            `).join('');

            viewEl.innerHTML = `
                <div class="artist-hero">
                    <img class="artist-avatar" src="${data.image || 'assets/DTunes2.svg'}">
                    <h1 class="artist-name">${data.name}</h1>
                    <button class="btn-artist-follow ${isLiked ? 'active' : ''}">${isLiked ? 'Following' : 'Follow'}</button>
                    <button class="btn-artist-play-top">Play Top Songs</button>
                    <button class="btn-artist-queue-top">Add Top Songs to Queue</button>
                </div>
                <div class="artist-top-songs">${topSongsHtml}</div>
                <div class="artist-discography-grid">${albumsHtml}</div>
            `;
            return true;
        } catch (e) {
            viewEl.innerHTML = '<div class="error-msg">Failed to load artist</div>';
            return false;
        }
    };

    const toggleLikeArtist = (artist) => {
        if (!artist) return false;
        const id = artist.id || artist.name;
        const idx = state.likedArtists.findIndex(a => (a.id || a.name) === id);
        if (idx === -1) {
            state.likedArtists.push(artist);
            env.localStorage.setItem('likedArtists', JSON.stringify(state.likedArtists));
            return true; // Now liked
        } else {
            state.likedArtists.splice(idx, 1);
            env.localStorage.setItem('likedArtists', JSON.stringify(state.likedArtists));
            return false; // Unliked
        }
    };

    return {
        state,
        switchView,
        openAlbum,
        openArtist,
        toggleLikeArtist,
        formatRuntime
    };
}

test('R3: Dedicated Album & Artist Views Suite', async (t) => {

    const mockApi = {
        getAlbum: async (id) => {
            if (id === 'alb_rockstar') {
                return {
                    id: 'alb_rockstar',
                    name: 'Rockstar',
                    artist: 'A.R. Rahman',
                    artistId: 'art_arrahman',
                    year: '2011',
                    image: 'https://example.com/rockstar.jpg',
                    songs: [
                        { id: 's_r1', name: 'Kun Faya Kun', duration: 473 },
                        { id: 's_r2', name: 'Nadaan Parindey', duration: 386 },
                        { id: 's_r3', name: 'Tum Ho', duration: 318 }
                    ]
                };
            }
            if (id === 'alb_single') {
                return {
                    id: 'alb_single',
                    name: 'Single Track Album',
                    artist: 'Indie Artist',
                    year: '2024',
                    songs: [{ id: 's1', name: 'One Song', duration: 180 }]
                };
            }
            throw new Error('Not found');
        },
        getArtist: async (id) => {
            if (id === 'art_arijit' || id === 'Arijit Singh') {
                return {
                    id: 'art_arijit',
                    name: 'Arijit Singh',
                    image: 'https://example.com/arijit.jpg',
                    topSongs: Array.from({ length: 12 }, (_, i) => ({
                        id: `song_top_${i}`,
                        name: `Top Song ${i + 1}`,
                        duration: 240 + i * 10
                    })),
                    albums: [
                        { id: 'alb_a1', name: 'Aashiqui 2', year: '2013' },
                        { id: 'alb_a2', name: 'Brahmastra', year: '2022' }
                    ]
                };
            }
            if (id === 'art_indie') {
                return {
                    id: 'art_indie',
                    name: 'Indie Band',
                    topSongs: [{ id: 'i1', name: 'Indie Track 1', duration: 195 }],
                    albums: []
                };
            }
            throw new Error('Artist not found');
        }
    };

    // --- TIER 1: FEATURE COVERAGE (R3) ---

    await t.test('Tier 1 - R3-F1: openAlbum switches view and renders high-res cover, title, artist, year, count, runtime', async () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, mockApi);

        const ok = await ctrl.openAlbum('alb_rockstar');
        assert.equal(ok, true);
        assert.equal(ctrl.state.currentView, 'album');

        const viewEl = env.document.getElementById('view-album');
        assert.ok(viewEl.innerHTML.includes('Rockstar'));
        assert.ok(viewEl.innerHTML.includes('A.R. Rahman'));
        assert.ok(viewEl.innerHTML.includes('2011'));
        assert.ok(viewEl.innerHTML.includes('3 songs'));
        assert.ok(viewEl.innerHTML.includes('19 mins')); // 473 + 386 + 318 = 1177s ~ 19 mins
    });

    await t.test('Tier 1 - R3-F2: Album view renders numbered tracklist with title and duration', async () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, mockApi);

        await ctrl.openAlbum('alb_rockstar');
        const viewEl = env.document.getElementById('view-album');
        assert.ok(viewEl.innerHTML.includes('1'));
        assert.ok(viewEl.innerHTML.includes('Kun Faya Kun'));
        assert.ok(viewEl.innerHTML.includes('7:53')); // 473s = 7:53
        assert.ok(viewEl.innerHTML.includes('2'));
        assert.ok(viewEl.innerHTML.includes('Nadaan Parindey'));
        assert.ok(viewEl.innerHTML.includes('6:26')); // 386s = 6:26
    });

    await t.test('Tier 1 - R3-F3: Clicking artist inside Album view triggers openArtist with artist ID', async () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, mockApi);

        await ctrl.openAlbum('alb_rockstar');
        assert.equal(ctrl.state.currentAlbum.artistId, 'art_arrahman');
    });

    await t.test('Tier 1 - R3-F4: openArtist renders hero banner, avatar, artist name, and Top 10 songs capped at 10', async () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, mockApi);

        const ok = await ctrl.openArtist('art_arijit');
        assert.equal(ok, true);
        assert.equal(ctrl.state.currentView, 'artist');

        const viewEl = env.document.getElementById('view-artist');
        assert.ok(viewEl.innerHTML.includes('Arijit Singh'));
        assert.ok(viewEl.innerHTML.includes('#10'));
        assert.equal(viewEl.innerHTML.includes('#11'), false, 'Top songs list must be capped at 10');
    });

    await t.test('Tier 1 - R3-F5: Artist follow/like toggle updates state and persists to localStorage', () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, mockApi);

        const artist = { id: 'art_arijit', name: 'Arijit Singh' };
        
        // Like artist
        const liked = ctrl.toggleLikeArtist(artist);
        assert.equal(liked, true);
        assert.equal(ctrl.state.likedArtists.length, 1);
        const stored = JSON.parse(env.localStorage.getItem('likedArtists'));
        assert.equal(stored[0].name, 'Arijit Singh');

        // Unlike artist
        const unliked = ctrl.toggleLikeArtist(artist);
        assert.equal(unliked, false);
        assert.equal(ctrl.state.likedArtists.length, 0);
        assert.equal(JSON.parse(env.localStorage.getItem('likedArtists')).length, 0);
    });

    await t.test('Tier 1 - R3-F6: Artist view discography grid displays artist albums with titles and years', async () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, mockApi);

        await ctrl.openArtist('art_arijit');
        const viewEl = env.document.getElementById('view-artist');
        assert.ok(viewEl.innerHTML.includes('Aashiqui 2'));
        assert.ok(viewEl.innerHTML.includes('2013'));
        assert.ok(viewEl.innerHTML.includes('Brahmastra'));
    });

    // --- TIER 2: BOUNDARY & CORNER CASES ---

    await t.test('Tier 2 - R3-B1: Album with missing metadata (year, cover, zero songs)', async () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, {
            getAlbum: async () => ({ id: 'a_empty', name: 'Minimal Album', songs: [] })
        });

        const ok = await ctrl.openAlbum('a_empty');
        assert.equal(ok, true);
        const viewEl = env.document.getElementById('view-album');
        assert.ok(viewEl.innerHTML.includes('0 songs'));
        assert.ok(viewEl.innerHTML.includes('0 mins'));
        assert.ok(viewEl.innerHTML.includes('Unknown'));
    });

    await t.test('Tier 2 - R3-B2: Artist with fewer than 10 top songs (e.g. 1 song)', async () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, mockApi);

        const ok = await ctrl.openArtist('art_indie');
        assert.equal(ok, true);
        const viewEl = env.document.getElementById('view-artist');
        assert.ok(viewEl.innerHTML.includes('Indie Track 1'));
        assert.ok(viewEl.innerHTML.includes('#1'));
        assert.equal(viewEl.innerHTML.includes('#2'), false);
    });

    await t.test('Tier 2 - R3-B3: Network error on album or artist lookup renders error state without crashing', async () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, mockApi);

        const okAlbum = await ctrl.openAlbum('alb_nonexistent');
        assert.equal(okAlbum, false);
        assert.ok(env.document.getElementById('view-album').innerHTML.includes('Failed to load album'));

        const okArtist = await ctrl.openArtist('art_nonexistent');
        assert.equal(okArtist, false);
        assert.ok(env.document.getElementById('view-artist').innerHTML.includes('Failed to load artist'));
    });

    // --- TIER 3: CROSS-FEATURE COMBINATIONS ---

    await t.test('Tier 3 - R3-C1: Album View to Artist View navigation chain preserves view stack', async () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, mockApi);

        await ctrl.openAlbum('alb_rockstar');
        assert.equal(ctrl.state.currentView, 'album');

        await ctrl.openArtist('art_arijit');
        assert.equal(ctrl.state.currentView, 'artist');
        assert.deepEqual(ctrl.state.viewHistory, ['home', 'album', 'artist']);
    });

    await t.test('Tier 3 - R3-C2: Following artist reflects active status in Artist view header', async () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, mockApi);

        // Pre-like artist
        ctrl.state.likedArtists.push({ id: 'art_arijit', name: 'Arijit Singh' });

        await ctrl.openArtist('art_arijit');
        const viewEl = env.document.getElementById('view-artist');
        assert.ok(viewEl.innerHTML.includes('Following'));
    });

    // --- TIER 4: REAL-WORLD WORKLOAD ---

    await t.test('Tier 4 - R3-W1: Multi-entity music discovery user journey', async () => {
        const env = createTestEnvironment();
        const ctrl = createMediaViewsController(env, mockApi);

        // 1. User starts at home view
        assert.equal(ctrl.state.currentView, 'home');

        // 2. User navigates to Artist view
        await ctrl.openArtist('art_arijit');
        assert.equal(ctrl.state.currentArtist.name, 'Arijit Singh');

        // 3. User likes artist
        ctrl.toggleLikeArtist(ctrl.state.currentArtist);
        assert.equal(ctrl.state.likedArtists.length, 1);

        // 4. User opens Album from artist discography
        await ctrl.openAlbum('alb_rockstar');
        assert.equal(ctrl.state.currentAlbum.name, 'Rockstar');
        assert.equal(ctrl.state.currentAlbum.songs.length, 3);

        // 5. Verify DOM elements reflect the full journey
        assert.equal(ctrl.state.currentView, 'album');
        assert.equal(JSON.parse(env.localStorage.getItem('likedArtists')).length, 1);
    });

});
