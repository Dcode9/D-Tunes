const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createTestEnvironment } = require('./testHarness');

const ROOT = path.join(__dirname, '..');
const aiHubPath = path.join(ROOT, 'src', 'js', 'ai-hub.js');
const aiHubSource = fs.readFileSync(aiHubPath, 'utf8');

// Mirror of the songStore contract defined in src/js/state.js: it exposes
// add/get/clear only — it is NOT a Map, so .set() must never be called on it.
function createRealShapedSongStore() {
    const store = {
        songs: new Map(),
        counter: 0,
        order: [],
        maxEntries: 5000,
        add: (song) => {
            if (!song) return null;
            const raw = song.saavn_id || song.id || song.songid || song.perma_url || song.url || null;
            const kind = (song.type === 'album' || song.type === 'artist' || song.type === 'playlist' || song.type === 'show' || song.type === 'episode') ? song.type : 'song';
            const id = raw ? `${kind}:${raw}` : `song_${store.counter++}`;
            if (!store.songs.has(id)) {
                store.order.push(id);
                if (store.order.length > store.maxEntries) {
                    const oldest = store.order.shift();
                    if (oldest !== id) store.songs.delete(oldest);
                }
            }
            store.songs.set(id, song);
            return id;
        },
        get: (id) => store.songs.get(id),
        clear: () => { store.songs.clear(); store.order.length = 0; store.counter = 0; }
    };
    return store;
}

function loadAiHub(env, { jiosaavnAPI, state, ui, ai }) {
    const songStore = createRealShapedSongStore();
    env.window.songStore = songStore;
    env.window.jiosaavnAPI = jiosaavnAPI;
    env.window.dverse = { getSession: async () => ({ user: { id: 'test-user' } }) };
    env.window.ai = ai;

    const context = vm.createContext({
        window: env.window,
        document: env.document,
        localStorage: env.localStorage,
        console: { warn: () => {}, log: () => {}, error: () => {} },
        setTimeout,
        clearTimeout,
        JSON,
        Map,
        Date,
        Promise,
        Array,
        Object,
        String,
        Number,
        Math,
        RegExp,
        Error,
        FALLBACK_ART: 'assets/DTunes.svg',
        state,
        songStore,
        ui,
        utils: { escapeHtml: (s) => String(s ?? '') },
        player: { playDirect: () => {} },
        jiosaavnAPI
    });

    vm.runInContext(aiHubSource, context);
    assert.ok(context.window.aiHome, 'ai-hub.js must expose window.aiHome');
    return { songStore, context };
}

function makeSong(query, n) {
    const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return {
        id: `saavn_${slug}_${n}`,
        name: query,
        artist: 'Artist ' + n,
        img: `https://cdn.example.com/art/${slug}_${n}.jpg`,
        url: `https://cdn.example.com/audio/${slug}_${n}.mp4`
    };
}

test('Made For You: ai-hub never calls songStore.set (interface is add/get/clear)', () => {
    assert.equal(/window\.songStore\.set\(/.test(aiHubSource), false,
        'ai-hub.js must not call window.songStore.set — songStore exposes add/get/clear only');
    assert.ok(aiHubSource.includes('window.songStore.add('),
        'ai-hub.js must cache hydrated songs through window.songStore.add');
});

test('Made For You: searchTrackData returns valid tracks and caches them without throwing', async () => {
    const env = createTestEnvironment();
    const { songStore, context } = loadAiHub(env, {
        jiosaavnAPI: {
            searchSongs: async (query) => [makeSong(query, 1)]
        },
        state: { playHistory: [], likedIds: [], libraryIds: [], dislikedSongs: [] },
        ui: { createCard: () => '' }
    });

    const song = await context.window.aiHome.searchTrackData('Kesariya', 'Arijit Singh');

    assert.ok(song, 'A playable track with genuine artwork must be returned (not swallowed by a TypeError)');
    assert.equal(song.url, 'https://cdn.example.com/audio/kesariya_arijit_singh_1.mp4');
    assert.equal(songStore.songs.size, 1, 'Hydrated song must be registered in songStore via add()');
    assert.equal(songStore.get(`song:${song.id}`).name, 'Kesariya Arijit Singh', 'Song must be retrievable by its namespaced store id');
});

test('Made For You: tracks failing audio/artwork validation are rejected', async () => {
    const env = createTestEnvironment();
    const { context } = loadAiHub(env, {
        jiosaavnAPI: {
            searchSongs: async () => ([{ id: 'bad_1', name: 'Bad', artist: 'None', img: 'assets/DTunes.svg', url: 'https://cdn.example.com/bad.mp4' }])
        },
        state: { playHistory: [], likedIds: [], libraryIds: [], dislikedSongs: [] },
        ui: { createCard: () => '' }
    });

    const song = await context.window.aiHome.searchTrackData('No Artwork', 'Nobody');
    assert.equal(song, null, 'Fallback artwork must disqualify a track');
});

test('Made For You: renderAIHome renders hydrated shelves end-to-end', async () => {
    const env = createTestEnvironment();
    const state = { playHistory: [], likedIds: [], libraryIds: [], dislikedSongs: [] };
    let searchCount = 0;

    const { songStore, context } = loadAiHub(env, {
        jiosaavnAPI: {
            searchSongs: async (query) => [makeSong(query, ++searchCount)]
        },
        state,
        ui: {
            createCard: (song) => `<div class="scroll-card glass-panel p-3 rounded-xl"><img src="${song.img}" class="w-full h-full object-cover" /><div class="marquee-container w-full"><h3 class="marquee-text">${song.name}</h3></div></div>`
        },
        ai: {
            generateCustomPlaylists: async () => ([{
                categoryTitle: 'Golden Hour',
                title: 'Golden Hour',
                description: 'Warm evening favourites',
                styleIndex: 0,
                songs: [
                    { title: 'Song One', artist: 'Artist A' },
                    { title: 'Song Two', artist: 'Artist B' }
                ]
            }])
        }
    });

    await context.window.aiHome.renderAIHome(true);

    const container = env.document.getElementById('ai-hub-container');
    assert.ok(container.innerHTML.includes('Made For You'), 'Header must render');
    assert.ok(container.innerHTML.includes('Golden Hour'), 'Hydrated daily mix must render');
    assert.ok(container.innerHTML.includes('Song One'), 'Valid songs must render as cards');
    assert.ok(songStore.songs.size >= 2, 'Every hydrated song must be registered in songStore');
});
