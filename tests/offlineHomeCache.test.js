const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createTestEnvironment } = require('./testHarness');

const ROOT = path.join(__dirname, '..');
const aiHubSource = fs.readFileSync(path.join(ROOT, 'src', 'js', 'ai-hub.js'), 'utf8');
const DAILY_MIX_CACHE_KEY = 'dtunes_daily_mixes_cache_v1';

function createSongStore() {
    const store = {
        songs: new Map(),
        counter: 0,
        add: (song) => {
            if (!song) return null;
            const raw = song.saavn_id || song.id || song.url || null;
            const id = raw ? `song:${raw}` : `song_${store.counter++}`;
            store.songs.set(id, song);
            return id;
        },
        get: (id) => store.songs.get(id),
        clear: () => store.songs.clear()
    };
    return store;
}

function loadAiHub(env, { state, offlineStore, ai, isOffline, jiosaavnAPI = { searchSongs: async () => [] } }) {
    const songStore = createSongStore();
    env.window.songStore = songStore;
    env.window.offlineStore = offlineStore;
    env.window.ai = ai;
    env.window.jiosaavnAPI = jiosaavnAPI;
    env.window.dverse = { getSession: async () => ({ user: { id: 'user-1' } }) };
    env.window.__dtunesIsOffline = () => isOffline;
    env.window.__dtunesIsOnline = () => !isOffline;

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
        ui: {
            createCard: (song) => `<div class="scroll-card"><h3 class="marquee-text">${song.name}</h3></div>`
        },
        utils: {
            escapeHtml: (s) => String(s ?? ''),
            deduplicateSongs: (songs) => {
                const seen = new Set();
                return (songs || []).filter(song => {
                    const key = song && (song.id || song.saavn_id);
                    if (!key || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            }
        },
        player: { playDirect: () => {} },
        jiosaavnAPI
    });

    vm.runInContext(aiHubSource, context);
    return { songStore, context };
}

function offlineSongs() {
    return [
        { id: 'dl_1', name: 'Downloaded One', artist: 'Offline Artist', img: 'https://cdn.example.com/1.jpg', url: 'https://cdn.example.com/1.mp4' },
        { id: 'dl_2', name: 'Downloaded Two', artist: 'Offline Artist', img: 'https://cdn.example.com/2.jpg', url: 'https://cdn.example.com/2.mp4' }
    ];
}

function cachedMix(expiresAt) {
    return {
        userId: 'user-1',
        dateKey: '2026-01-01',
        generatedAt: new Date(Date.now() - 3600000).toISOString(),
        expiresAt,
        playlists: [{
            categoryTitle: 'Golden Hour',
            title: 'Golden Hour',
            description: 'Warm evening favourites',
            styleIndex: 0,
            songs: [
                { id: 'm1', name: 'Mix Song A', artist: 'Artist A', img: 'https://cdn.example.com/a.jpg', url: 'https://cdn.example.com/a.mp4' },
                { id: 'm2', name: 'Mix Song B', artist: 'Artist B', img: 'https://cdn.example.com/b.jpg', url: 'https://cdn.example.com/b.mp4' }
            ]
        }]
    };
}

test('Offline home: downloaded songs render above cached Made For You with expiry', async () => {
    const env = createTestEnvironment();
    const future = new Date(Date.now() + 6 * 3600000).toISOString();
    env.localStorage.setItem(DAILY_MIX_CACHE_KEY, JSON.stringify(cachedMix(future)));

    const { context } = loadAiHub(env, {
        state: { playHistory: [], likedIds: [], libraryIds: [], dislikedSongs: [] },
        offlineStore: { list: async () => offlineSongs() },
        ai: { generateCustomPlaylists: async () => { throw new Error('must not be called offline'); } },
        isOffline: true
    });

    await context.window.aiHome.renderAIHome();

    const html = env.document.getElementById('ai-hub-container').innerHTML;
    assert.ok(html.includes('Offline mode'), 'Offline banner must render');
    assert.ok(html.includes('Downloaded Songs'), 'Downloads shelf must render');
    assert.ok(html.includes('Downloaded One'), 'Downloaded songs must be listed');
    assert.ok(html.includes('Made For You'), 'Made For You header must render');
    assert.ok(html.includes('Golden Hour'), 'Cached daily mix must render offline');
    assert.equal(html.includes('expires'), false, 'Cache expiry must never be exposed');
    assert.equal(html.includes('Saved on this device ·'), false, 'Cache diagnostics must not be user-facing');
    assert.ok(html.indexOf('Downloaded Songs') < html.indexOf('Made For You'),
        'Downloaded songs must sit above cached content');
});

test('Offline home: expired Made For You cache is hidden but downloads remain', async () => {
    const env = createTestEnvironment();
    const past = new Date(Date.now() - 3600000).toISOString();
    env.localStorage.setItem(DAILY_MIX_CACHE_KEY, JSON.stringify(cachedMix(past)));

    const { context } = loadAiHub(env, {
        state: { playHistory: [], likedIds: [], libraryIds: [], dislikedSongs: [] },
        offlineStore: { list: async () => offlineSongs() },
        ai: { generateCustomPlaylists: async () => { throw new Error('must not be called offline'); } },
        isOffline: true
    });

    await context.window.aiHome.renderAIHome();

    const html = env.document.getElementById('ai-hub-container').innerHTML;
    assert.ok(html.includes('Downloaded One'), 'Downloads still render');
    assert.equal(html.includes('Golden Hour'), false, 'Expired cache must not render');
    assert.ok(html.includes('not saved on this device yet'), 'Empty offline message must explain the cache');
});

test('Offline home: downloads lead, Recently Played is local, network shelves are hidden', async () => {
    const env = createTestEnvironment();
    const future = new Date(Date.now() + 6 * 3600000).toISOString();
    env.localStorage.setItem(DAILY_MIX_CACHE_KEY, JSON.stringify(cachedMix(future)));

    const { context } = loadAiHub(env, {
        state: {
            playHistory: [
                { id: 'dl_1', name: 'Downloaded One', artist: 'Offline Artist', img: 'https://cdn.example.com/1.jpg', url: 'https://cdn.example.com/1.mp4' },
                { id: 'stream_1', name: 'Stream Only', artist: 'Cloud Artist', img: 'https://cdn.example.com/s.jpg', url: 'https://cdn.example.com/s.mp4' }
            ],
            likedIds: [],
            libraryIds: [],
            dislikedSongs: []
        },
        offlineStore: {
            list: async () => offlineSongs(),
            isDownloaded: (id) => id === 'dl_1' || id === 'dl_2'
        },
        ai: { generateCustomPlaylists: async () => { throw new Error('must not be called offline'); } },
        isOffline: true
    });

    await context.window.aiHome.renderAIHome();

    const html = env.document.getElementById('ai-hub-container').innerHTML;
    assert.ok(html.includes('Offline mode'), 'Offline message must render');
    assert.ok(html.indexOf('Downloaded Songs') < html.indexOf('Recently Played'),
        'Downloaded songs must lead the offline home');
    assert.ok(html.indexOf('Recently Played') < html.indexOf('Made For You'),
        'Local history must come before cached mixes');
    assert.ok(html.includes('Stream Only'), 'History still renders (gated) offline');
    assert.ok(env.document.getElementById('section-trending').classList.contains('hidden'),
        'Network-only Trending must be hidden offline');
    assert.ok(env.document.getElementById('section-recent').classList.contains('hidden'),
        'External Recently Played section must be hidden offline');
});

test('Online home: freshly generated mixes are written to the local cache with expiry', async () => {
    const env = createTestEnvironment();
    assert.equal(env.localStorage.getItem(DAILY_MIX_CACHE_KEY), null);

    const { context } = loadAiHub(env, {
        state: { playHistory: [], likedIds: [], libraryIds: [], dislikedSongs: [] },
        offlineStore: { list: async () => [] },
        ai: {
            generateCustomPlaylists: async () => ([{
                categoryTitle: 'Fresh Mix',
                title: 'Fresh Mix',
                description: '',
                styleIndex: 0,
                songs: [
                    { title: 'Fresh One', artist: 'Artist A' },
                    { title: 'Fresh Two', artist: 'Artist B' }
                ]
            }])
        },
        isOffline: false,
        jiosaavnAPI: {
            searchSongs: async (query) => ([{
                id: query.replace(/\s+/g, '_').toLowerCase(),
                name: query,
                artist: 'Artist',
                img: `https://cdn.example.com/${encodeURIComponent(query)}.jpg`,
                url: `https://cdn.example.com/${encodeURIComponent(query)}.mp4`
            }])
        }
    });

    await context.window.aiHome.renderAIHome(true);

    const raw = env.localStorage.getItem(DAILY_MIX_CACHE_KEY);
    assert.ok(raw, 'Generated mixes must be cached locally');
    const cached = JSON.parse(raw);
    assert.ok(cached.expiresAt, 'Cache payload must record an expiry');
    assert.ok(Date.parse(cached.expiresAt) > Date.now(), 'Cache expiry must be in the future');
    assert.equal(cached.playlists[0].categoryTitle, 'Fresh Mix');
});
