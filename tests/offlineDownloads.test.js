const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const offlinePath = path.join(ROOT, 'src', 'js', 'offline.js');
const contextMenuPath = path.join(ROOT, 'src', 'js', 'context-menu.js');
const playerPath = path.join(ROOT, 'src', 'js', 'player.js');
const mainPath = path.join(ROOT, 'src', 'js', 'main.js');
const indexPath = path.join(ROOT, 'index.html');

const read = (file) => fs.readFileSync(file, 'utf8');

// Loads the real src/js/offline.js in an isolated ECMAScript context. There is no
// IndexedDB in Node, so the module exercises its in-memory fallback while still
// using the platform WebCrypto implementation (the same AES-GCM path browsers run).
function loadOfflineStore(options = {}) {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        crypto: globalThis.crypto,
        fetch: options.fetch || (async () => { throw new Error('fetch not stubbed'); }),
        Blob: globalThis.Blob,
        URL: { createObjectURL: (blob) => `blob:dtunes/${blob.size}`, revokeObjectURL: () => {} },
        AbortController: globalThis.AbortController,
        Uint8Array,
        ArrayBuffer,
        Map,
        Set,
        Date,
        JSON,
        Math,
        Number,
        String,
        Object,
        Array,
        Error,
        Promise,
        RegExp,
        Boolean,
        isNaN,
        parseInt
    };
    sandbox.window = sandbox;
    const context = vm.createContext(sandbox);
    vm.runInContext(`${read(offlinePath)}\n;window.__loadedOfflineStore = offlineStore;`, context, { filename: 'offline.js' });
    const store = context.__loadedOfflineStore || context.window.offlineStore;
    if (!store) throw new Error('offline.js did not expose offlineStore');
    return store;
}

function bufferResponse(bytes) {
    return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    };
}

function streamResponse(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    let index = 0;
    return {
        ok: true,
        status: 200,
        headers: { get: (name) => (String(name).toLowerCase() === 'content-length' ? String(total) : null) },
        body: {
            getReader: () => ({
                read: async () => (index < chunks.length ? { done: false, value: chunks[index++] } : { done: true, value: undefined }),
                cancel: async () => {}
            })
        }
    };
}

test('Offline downloads: module, encryption contract and app wiring exist', () => {
    const offline = read(offlinePath);

    assert.match(offline, /DB_NAME = 'dtunes-offline'/, 'downloads must live in a dedicated IndexedDB database');
    assert.match(offline, /name: 'AES-GCM'/, 'audio must be sealed with AES-GCM');
    assert.match(offline, /length: 256/, 'the vault key must be 256-bit');
    assert.match(
        offline,
        /generateKey\(\s*\{ name: 'AES-GCM', length: 256 \},\s*false,/,
        'the master key must be generated as NON-extractable so stored bytes are useless outside the app'
    );
    assert.match(offline, /getRandomValues/, 'every track needs a fresh IV');
    assert.ok(offline.includes('window.offlineStore = offlineStore;'), 'offline store must be exposed globally');

    const index = read(indexPath);
    assert.ok(index.includes('src/js/offline.js'), 'index.html must load src/js/offline.js');
    assert.ok(index.indexOf('src/js/offline.js') < index.indexOf('src/js/player.js'), 'offline.js must load before player.js');
    assert.ok(index.includes('id="cm-download"'), 'context menu must expose the download action');
    assert.ok(index.includes('id="library-downloads"'), 'Library must expose the Offline Downloads list');
    assert.ok(index.includes('Offline Downloads'), 'Library must label the Offline Downloads section');

    assert.ok(read(contextMenuPath).includes("getElementById('cm-download')"), 'context menu must wire the download action');
    assert.ok(read(playerPath).includes('offlineStore.getPlayUrl'), 'player must resolve offline blob URLs');
    assert.ok(read(mainPath).includes('offlineStore.init()'), 'app init must boot the offline store');
});

test('Offline downloads: audio is encrypted at rest and only decryptable in-app', async () => {
    const plain = new Uint8Array(4096).map((_, index) => (index * 7) % 251);
    const store = loadOfflineStore({ fetch: async () => bufferResponse(plain) });

    await store.init();
    assert.equal(store.isDownloaded('saavn-1'), false);

    const events = [];
    store.onChange((current) => events.push(current.usage().count));

    const meta = await store.download({
        id: 'saavn-1',
        name: 'Kesariya',
        artist: 'Arijit Singh',
        duration: 268,
        url: 'https://aac.saavncdn.com/871/kesariya_320.mp4'
    });

    assert.equal(meta.id, 'saavn-1');
    assert.equal(meta.name, 'Kesariya');
    assert.equal(meta.source, 'offline');
    assert.equal(store.isDownloaded('saavn-1'), true);
    assert.equal(store.usage().count, 1);
    assert.ok(store.usage().bytes > 0, 'usage must report stored bytes');
    assert.ok(events.length > 0, 'onChange must fire so the UI can react');

    const record = await store._internals.readTrack('saavn-1');
    assert.ok(record && record.bytes && record.iv, 'an encrypted record must be persisted');

    const cipher = new Uint8Array(record.bytes);
    assert.equal(cipher.byteLength, plain.byteLength + 16, 'AES-GCM appends a 16-byte auth tag');
    assert.notDeepEqual(
        Array.from(cipher.slice(0, 16)),
        Array.from(plain.slice(0, 16)),
        'stored bytes must not be the plain audio'
    );

    const key = await store._internals.getKey();
    assert.equal(key.extractable, false, 'the master key must never be exportable');
    assert.equal(key.algorithm.name, 'AES-GCM');

    const decrypted = await store._internals.decryptBytes(record.iv, record.bytes);
    assert.deepEqual(Array.from(new Uint8Array(decrypted)), Array.from(plain), 'the app must decrypt its own copy');

    const blobUrl = await store.getPlayUrl('saavn-1');
    assert.ok(String(blobUrl).startsWith('blob:'), 'offline playback must use a local blob URL');
    assert.equal(store.getPlayUrlSync('saavn-1'), blobUrl, 'decrypted URLs are cached per track');
    assert.equal(await store.resolvePlayUrl({ id: 'saavn-1' }), blobUrl, 'offline copies win over the network');
    assert.equal(
        await store.resolvePlayUrl({ id: 'not-saved', url: 'https://aac.saavncdn.com/live.mp4' }),
        'https://aac.saavncdn.com/live.mp4',
        'tracks without an offline copy fall back to streaming'
    );

    const listed = await store.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, 'saavn-1');
    assert.equal(listed[0].size, cipher.byteLength);

    await store.remove('saavn-1');
    assert.equal(store.isDownloaded('saavn-1'), false);
    assert.deepEqual(await store.list(), []);
    assert.equal(await store._internals.readTrack('saavn-1'), null);
    assert.equal(store.usage().count, 0);
});

test('Offline downloads: streamed progress, size limits and rejection paths', async () => {
    const chunks = [new Uint8Array(1024).fill(1), new Uint8Array(1024).fill(2), new Uint8Array(512).fill(3)];
    const store = loadOfflineStore({ fetch: async () => streamResponse(chunks) });
    await store.init();

    const seen = [];
    store.onChange(() => {
        const job = store.getProgress('stream-1');
        if (job) seen.push(`${job.status}:${job.received}`);
    });

    await store.download({ id: 'stream-1', name: 'Streamed', url: 'https://aac.saavncdn.com/871/stream_320.mp4' });

    assert.equal(store.isDownloaded('stream-1'), true);
    assert.ok(seen.some((entry) => entry.startsWith('downloading:1024')), 'progress must be reported per chunk');
    assert.ok(seen.some((entry) => entry === 'done:2576'), 'completion must be reported with the sealed size');
    assert.equal(store.formatProgress({ status: 'downloading', received: 50, total: 100 }), '50%');

    assert.equal(store.supported(), true, 'WebCrypto is available in this environment');

    await assert.rejects(
        () => store.download({ id: 'no-url', name: 'Broken' }),
        /no downloadable audio source/,
        'tracks without a stream URL cannot be saved'
    );
    await assert.rejects(() => store.download({ name: 'No id', url: 'https://x/y.mp4' }), /missing an id/);

    const failing = loadOfflineStore({ fetch: async () => ({ ok: false, status: 503, headers: { get: () => null } }) });
    await failing.init();
    await assert.rejects(() => failing.download({ id: 'boom', url: 'https://aac.saavncdn.com/871/boom.mp4' }), /HTTP 503/);
    assert.equal(failing.isDownloaded('boom'), false);
    assert.equal(failing.getProgress('boom').status, 'error');
});

test('Offline downloads: cancellation aborts cleanly and stores nothing', async () => {
    const store = loadOfflineStore({ fetch: async () => streamResponse([new Uint8Array(2048).fill(9)]) });
    await store.init();

    const pending = store.download({ id: 'cancel-me', name: 'Cancel', url: 'https://aac.saavncdn.com/871/cancel_160.mp4' });
    assert.equal(store.cancel('cancel-me'), true, 'an in-flight download must be cancellable');

    await assert.rejects(pending, (err) => err && (err.name === 'AbortError' || /cancel/i.test(err.message)));
    assert.equal(store.isDownloaded('cancel-me'), false);
    assert.equal(await store._internals.readTrack('cancel-me'), null);
    assert.equal(store.getProgress('cancel-me').status, 'cancelled');
});
