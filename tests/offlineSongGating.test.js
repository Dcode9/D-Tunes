const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const uiSource = fs.readFileSync(path.join(ROOT, 'src', 'js', 'ui.js'), 'utf8');

function createSongStore() {
    const songs = new Map();
    let counter = 0;
    return {
        add: (song) => {
            if (!song) return null;
            const raw = song.saavn_id || song.id || song.url || null;
            const id = raw ? `song:${raw}` : `song_${counter++}`;
            songs.set(id, song);
            return id;
        },
        get: (id) => songs.get(id),
        clear: () => songs.clear()
    };
}

function loadUi({ isOffline, downloaded = [], hasStore = true }) {
    const songStore = createSongStore();
    const downloadedIds = new Set(downloaded);
    const offlineStore = hasStore ? {
        isDownloaded: (id) => downloadedIds.has(String(id))
    } : undefined;

    const listeners = new Map();
    const win = {
        addEventListener: (type, fn) => {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(fn);
        },
        removeEventListener: () => {},
        __dtunesIsOffline: () => isOffline,
        __dtunesIsOnline: () => !isOffline
    };

    const state = {
        currentTrack: null,
        playing: false,
        likedArtists: [],
        playHistory: []
    };

    const context = vm.createContext({
        window: win,
        document: {
            getElementById: () => null,
            querySelectorAll: () => [],
            documentElement: { style: { setProperty: () => {} } },
            body: { classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false } }
        },
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        console: { warn: () => {}, log: () => {}, error: () => {} },
        setTimeout,
        clearTimeout,
        JSON,
        Map,
        Set,
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
        offlineStore,
        utils: {
            escapeHtml: (s) => String(s ?? ''),
            escapeJs: (s) => String(s ?? '').replace(/'/g, "\\'"),
            formatRelativeTime: () => 'now'
        },
        deviceMode: { isMobileUI: () => false },
        player: { likeSong: () => {}, addNext: () => {}, addToQueue: () => {} },
        toasts: []
    });
    context.__toasts = context.toasts;

    vm.runInContext(uiSource, context, { filename: 'ui.js' });
    return { context, ui: context.window.ui, songStore };
}

const song = { id: 's1', name: 'Test Song', artist: 'Test Artist', img: 'a.jpg', url: 'a.mp4' };

test('Offline gating: downloaded song renders as a normal playable card', () => {
    const { ui } = loadUi({ isOffline: true, downloaded: ['s1'] });
    const html = ui.createCard(song);
    assert.equal(ui.isOfflineUnavailable(song), false);
    assert.ok(html.includes(`playSongById(`), 'Downloaded song keeps its play handler');
    assert.equal(html.includes('Not downloaded'), false);
});

test('Offline gating: non-downloaded song card is greyed out and unplayable', () => {
    const { ui } = loadUi({ isOffline: true, downloaded: [] });
    const html = ui.createCard(song);
    assert.equal(ui.isOfflineUnavailable(song), true);
    assert.ok(html.includes('grayscale'), 'Blocked card must be greyed out');
    assert.ok(html.includes('Not downloaded'), 'Blocked card must explain why');
    assert.ok(html.includes('aria-disabled="true"'), 'Blocked card must be marked disabled');
    assert.equal(html.includes('notifyOfflineUnavailable'), false, 'Blocked card must be inert');
    assert.equal(html.includes('playSongById('), false, 'Blocked card must not expose a play handler');
});

test('Offline gating: online songs are playable even when not downloaded', () => {
    const { ui } = loadUi({ isOffline: false, downloaded: [] });
    const html = ui.createCard(song);
    assert.equal(ui.isOfflineUnavailable(song), false);
    assert.ok(html.includes('playSongById('));
    assert.equal(html.includes('Not downloaded'), false);
});

test('Offline gating: song pills follow the same rules in the library', () => {
    const blocked = loadUi({ isOffline: true, downloaded: [] });
    const blockedHtml = blocked.ui.createSongPill(song, `playSongById('x')`, 'history');
    assert.ok(blockedHtml.includes('Not downloaded'));
    assert.ok(blockedHtml.includes('aria-disabled="true"'));
    assert.equal(blockedHtml.includes('notifyOfflineUnavailable'), false);
    assert.equal(blockedHtml.includes(`playSongById('x')`), false);

    const allowed = loadUi({ isOffline: true, downloaded: ['s1'] });
    const allowedHtml = allowed.ui.createSongPill(song, `playSongById('x')`, 'history');
    assert.ok(allowedHtml.includes(`playSongById('x')`));
    assert.equal(allowedHtml.includes('Not downloaded'), false);
});

test('Offline gating: missing offline store blocks playback but album/artist cards stay playable', () => {
    const { ui } = loadUi({ isOffline: true, hasStore: false });
    assert.equal(ui.isOfflineUnavailable(song), true);
    assert.equal(ui.isOfflineUnavailable({ type: 'album', id: 'a1', name: 'Album' }), false);
    assert.equal(ui.isOfflineUnavailable({ type: 'artist', id: 'ar1', name: 'Artist' }), false);
});

test('Offline gating: saavn_id is matched against downloaded ids', () => {
    const { ui } = loadUi({ isOffline: true, downloaded: ['saavn-9'] });
    assert.equal(ui.isOfflineUnavailable({ saavn_id: 'saavn-9', name: 'X', artist: 'Y' }), false);
    assert.equal(ui.isOfflineUnavailable({ saavn_id: 'saavn-10', name: 'X', artist: 'Y' }), true);
});
