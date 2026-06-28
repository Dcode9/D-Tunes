const { performance } = require('perf_hooks');

const state = {
    likedIds: ['id1', 'id2', 'id3', 'id4', 'id5', 'id6', 'id7', 'id8', 'id9', 'id10']
};

const jiosaavnAPI = {
    getSong: async (id) => {
        return new Promise(resolve => setTimeout(() => resolve({ id, title: 'Song ' + id }), 100));
    }
};

const ui = {
    switchView: () => {},
};

const utils = {
    escapeHtml: (s) => s
};

const document = {
    getElementById: () => ({ textContent: '' })
};

const localStorage = {
    setItem: () => {}
};

async function openPlaylistSequential(name) {
    let songs = [];
    if (name === 'Liked Songs') {
        const loaded = [];
        for (let i = 0; i < state.likedIds.length; i++) {
            if(typeof state.likedIds[i] === 'string') {
                const fetched = await jiosaavnAPI.getSong(state.likedIds[i]);
                if(fetched) { loaded.push(fetched); state.likedIds[i] = fetched; }
            } else { loaded.push(state.likedIds[i]); }
        }
        localStorage.setItem('likedIds', JSON.stringify(state.likedIds));
        songs = loaded;
    }
    return songs;
}

async function openPlaylistParallel(name) {
    let songs = [];
    if (name === 'Liked Songs') {
        const loaded = await Promise.all(state.likedIds.map(async (item, i) => {
            if (typeof item === 'string') {
                const fetched = await jiosaavnAPI.getSong(item);
                if (fetched) { state.likedIds[i] = fetched; return fetched; }
                return null;
            }
            return item;
        }));
        songs = loaded.filter(Boolean);
        localStorage.setItem('likedIds', JSON.stringify(state.likedIds));
    }
    return songs;
}

async function run() {
    // Reset state
    state.likedIds = ['id1', 'id2', 'id3', 'id4', 'id5', 'id6', 'id7', 'id8', 'id9', 'id10'];
    let start = performance.now();
    await openPlaylistSequential('Liked Songs');
    let end = performance.now();
    console.log(`Sequential baseline: ${end - start} ms`);

    // Reset state
    state.likedIds = ['id1', 'id2', 'id3', 'id4', 'id5', 'id6', 'id7', 'id8', 'id9', 'id10'];
    start = performance.now();
    await openPlaylistParallel('Liked Songs');
    end = performance.now();
    console.log(`Parallel optimization: ${end - start} ms`);
}

run();
