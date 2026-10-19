const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadServiceWorker({ cachedResponse = null, previousShells = [], clients = [] } = {}) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const puts = [];
    const deleted = [];
    const cache = {
        match: async (request, options) => {
            if (options && options.ignoreSearch) return cachedResponse;
            return null;
        },
        put: async (key, response) => {
            puts.push(typeof key === 'string' ? key : key.url);
            return response;
        }
    };
    let fetchHandler = null;
    let activateHandler = null;
    const self = {
        location: { origin: 'https://app.example.com' },
        addEventListener: (type, handler) => {
            if (type === 'fetch') fetchHandler = handler;
            if (type === 'activate') activateHandler = handler;
        },
        skipWaiting: async () => {},
        clients: {
            claim: async () => {},
            matchAll: async () => clients
        }
    };
    const context = vm.createContext({
        self,
        caches: {
            open: async () => cache,
            keys: async () => ['dtunes-shell-v1.1.1', 'unrelated-cache'].filter(key =>
                key !== 'dtunes-shell-v1.1.1' || previousShells.length > 0),
            delete: async (key) => { deleted.push(key); return true; }
        },
        fetch: async () => new Response('fresh', { status: 200 }),
        Response,
        Request,
        URL,
        Promise,
        setTimeout,
        clearTimeout,
        console
    });
    vm.runInContext(source, context, { filename: 'sw.js' });

    const dispatch = async (url) => {
        const request = new Request(url);
        let result = null;
        fetchHandler({ request, respondWith: (promise) => { result = promise; } });
        return result;
    };

    const activate = async () => {
        let waited = null;
        activateHandler({ waitUntil: (promise) => { waited = promise; } });
        return waited;
    };

    return { dispatch, puts, deleted, activate };
}

test('Service worker: cached shell still answers while a fresh version is written', async () => {
    const stale = new Response('stale', { status: 200 });
    const { dispatch } = loadServiceWorker({ cachedResponse: stale });
    const response = await dispatch('https://app.example.com/src/js/ai-hub.js?v=1.3.7');
    assert.equal(await response.text(), 'stale', 'Cached shell must render immediately');
});

test('Service worker: versioned requests also refresh the unversioned shell key', async () => {
    const stale = new Response('stale', { status: 200 });
    const { dispatch, puts } = loadServiceWorker({ cachedResponse: stale });
    const url = 'https://app.example.com/src/js/ai-hub.js?v=1.3.7';
    await dispatch(url);
    await new Promise(resolve => setTimeout(resolve, 20));

    assert.ok(puts.includes(url), 'Versioned request must be cached');
    assert.ok(puts.includes('https://app.example.com/src/js/ai-hub.js'),
        'The precached unversioned key must be refreshed so deploys are not shadowed');
});

test('Service worker: replacing a shell reloads open tabs into the new build', async () => {
    const navigations = [];
    const client = {
        url: 'https://app.example.com/',
        navigate: async (url) => { navigations.push(url); return null; }
    };
    const { activate, deleted } = loadServiceWorker({
        previousShells: ['dtunes-shell-v1.1.1'],
        clients: [client]
    });

    await activate();

    assert.deepEqual(navigations, ['https://app.example.com/'],
        'Open tabs must be reloaded so they stop running the previous JS');
    assert.ok(deleted.includes('dtunes-shell-v1.1.1'), 'Previous shell cache must be removed');
});

test('Service worker: a first install does not reload open tabs', async () => {
    const navigations = [];
    const client = {
        url: 'https://app.example.com/',
        navigate: async (url) => { navigations.push(url); return null; }
    };
    const { activate } = loadServiceWorker({ previousShells: [], clients: [client] });

    await activate();

    assert.deepEqual(navigations, [], 'First install must not force a reload');
});
