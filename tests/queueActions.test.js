const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./testHarness');

// Reference Player Queue Controller implementation following PROJECT.md interface contracts
function createQueueController(initialState = {}, jiosaavnApiMock = null, toastMock = null) {
    const state = {
        currentTrack: initialState.currentTrack || null,
        userQueue: initialState.userQueue ? [...initialState.userQueue] : [],
        autoQueue: initialState.autoQueue ? [...initialState.autoQueue] : [],
        playlists: initialState.playlists || {},
        playing: false,
        shuffle: false
    };

    const toasts = [];
    const showToast = toastMock || ((msg, type) => toasts.push({ msg, type }));

    const getSongId = (song) => typeof song === 'string' ? song : (song.id || song.saavn_id || '');

    const addSongNext = (song) => {
        if (!song) return false;
        state.userQueue.unshift(song);
        showToast(`Playing "${song.name || song.title}" next`, 'info');
        return true;
    };

    const addSongToQueue = (song) => {
        if (!song) return false;
        state.userQueue.push(song);
        showToast(`Added "${song.name || song.title}" to queue`, 'info');
        return true;
    };

    const addPlaylistNext = (playlistName) => {
        const playlist = state.playlists[playlistName];
        if (!playlist || !Array.isArray(playlist) || playlist.length === 0) {
            showToast(`Playlist "${playlistName}" is empty or not found`, 'warning');
            return 0;
        }
        // Insert all tracks at head of userQueue, preserving order
        state.userQueue.unshift(...playlist);
        showToast(`Added ${playlist.length} song${playlist.length === 1 ? '' : 's'} to play next`, 'success');
        return playlist.length;
    };

    const addPlaylistToQueue = (playlistName) => {
        const playlist = state.playlists[playlistName];
        if (!playlist || !Array.isArray(playlist) || playlist.length === 0) {
            showToast(`Playlist "${playlistName}" is empty or not found`, 'warning');
            return 0;
        }
        // Append all tracks at tail of userQueue
        state.userQueue.push(...playlist);
        showToast(`Added ${playlist.length} song${playlist.length === 1 ? '' : 's'} to queue`, 'success');
        return playlist.length;
    };

    const addAlbumNext = async (albumId) => {
        if (!albumId || !jiosaavnApiMock) {
            showToast('Could not find album', 'error');
            return 0;
        }
        try {
            const albumData = await jiosaavnApiMock.getAlbum(albumId);
            const songs = albumData && albumData.songs ? albumData.songs : [];
            if (songs.length === 0) {
                showToast('Album has no songs', 'warning');
                return 0;
            }
            state.userQueue.unshift(...songs);
            showToast(`Added ${songs.length} song${songs.length === 1 ? '' : 's'} from "${albumData.name || 'Album'}" to play next`, 'success');
            return songs.length;
        } catch (e) {
            showToast('Failed to load album tracks', 'error');
            return 0;
        }
    };

    const addAlbumToQueue = async (albumId) => {
        if (!albumId || !jiosaavnApiMock) {
            showToast('Could not find album', 'error');
            return 0;
        }
        try {
            const albumData = await jiosaavnApiMock.getAlbum(albumId);
            const songs = albumData && albumData.songs ? albumData.songs : [];
            if (songs.length === 0) {
                showToast('Album has no songs', 'warning');
                return 0;
            }
            state.userQueue.push(...songs);
            showToast(`Added ${songs.length} song${songs.length === 1 ? '' : 's'} from "${albumData.name || 'Album'}" to queue`, 'success');
            return songs.length;
        } catch (e) {
            showToast('Failed to load album tracks', 'error');
            return 0;
        }
    };

    const next = () => {
        if (state.userQueue.length > 0) {
            state.currentTrack = state.userQueue.shift();
            state.playing = true;
            return state.currentTrack;
        }
        if (state.autoQueue.length > 0) {
            state.currentTrack = state.autoQueue.shift();
            state.playing = true;
            return state.currentTrack;
        }
        state.playing = false;
        return null;
    };

    const clearQueue = () => {
        state.userQueue = [];
        showToast('Queue cleared', 'info');
    };

    return {
        state,
        toasts,
        addSongNext,
        addSongToQueue,
        addPlaylistNext,
        addPlaylistToQueue,
        addAlbumNext,
        addAlbumToQueue,
        next,
        clearQueue
    };
}

test('R5: Queue & Media Actions Suite', async (t) => {

    const mockApi = {
        getAlbum: async (id) => {
            if (id === 'alb_rockstar') {
                return {
                    id: 'alb_rockstar',
                    name: 'Rockstar',
                    songs: [
                        { id: 's_r1', name: 'Kun Faya Kun', duration: 473 },
                        { id: 's_r2', name: 'Nadaan Parindey', duration: 386 },
                        { id: 's_r3', name: 'Tum Ho', duration: 318 }
                    ]
                };
            }
            if (id === 'alb_empty') {
                return { id: 'alb_empty', name: 'Empty Album', songs: [] };
            }
            throw new Error('Album not found');
        }
    };

    // --- TIER 1: FEATURE COVERAGE (R5) ---

    await t.test('Tier 1 - R5-F1: addPlaylistNext inserts all playlist tracks at the head of userQueue', () => {
        const player = createQueueController({
            currentTrack: { id: 'now_playing', name: 'Track 0' },
            userQueue: [{ id: 'q_existing', name: 'Existing in queue' }],
            playlists: {
                'Chill Beats': [
                    { id: 'cb_1', name: 'Chill 1' },
                    { id: 'cb_2', name: 'Chill 2' }
                ]
            }
        });

        const count = player.addPlaylistNext('Chill Beats');
        assert.equal(count, 2);
        assert.equal(player.state.userQueue.length, 3);
        assert.equal(player.state.userQueue[0].id, 'cb_1');
        assert.equal(player.state.userQueue[1].id, 'cb_2');
        assert.equal(player.state.userQueue[2].id, 'q_existing');
    });

    await t.test('Tier 1 - R5-F2: addPlaylistToQueue appends all playlist tracks at the tail of userQueue', () => {
        const player = createQueueController({
            currentTrack: { id: 'now_playing', name: 'Track 0' },
            userQueue: [{ id: 'q_existing', name: 'Existing in queue' }],
            playlists: {
                'Party Hits': [
                    { id: 'ph_1', name: 'Party 1' },
                    { id: 'ph_2', name: 'Party 2' }
                ]
            }
        });

        const count = player.addPlaylistToQueue('Party Hits');
        assert.equal(count, 2);
        assert.equal(player.state.userQueue.length, 3);
        assert.equal(player.state.userQueue[0].id, 'q_existing');
        assert.equal(player.state.userQueue[1].id, 'ph_1');
        assert.equal(player.state.userQueue[2].id, 'ph_2');
    });

    await t.test('Tier 1 - R5-F3: addAlbumNext fetches album tracks and inserts them at head of userQueue', async () => {
        const player = createQueueController({
            userQueue: [{ id: 'tail_track', name: 'Tail' }]
        }, mockApi);

        const count = await player.addAlbumNext('alb_rockstar');
        assert.equal(count, 3);
        assert.equal(player.state.userQueue.length, 4);
        assert.equal(player.state.userQueue[0].id, 's_r1');
        assert.equal(player.state.userQueue[1].id, 's_r2');
        assert.equal(player.state.userQueue[2].id, 's_r3');
        assert.equal(player.state.userQueue[3].id, 'tail_track');
    });

    await t.test('Tier 1 - R5-F4: addAlbumToQueue fetches album tracks and appends them at tail of userQueue', async () => {
        const player = createQueueController({
            userQueue: [{ id: 'head_track', name: 'Head' }]
        }, mockApi);

        const count = await player.addAlbumToQueue('alb_rockstar');
        assert.equal(count, 3);
        assert.equal(player.state.userQueue.length, 4);
        assert.equal(player.state.userQueue[0].id, 'head_track');
        assert.equal(player.state.userQueue[1].id, 's_r1');
        assert.equal(player.state.userQueue[2].id, 's_r2');
        assert.equal(player.state.userQueue[3].id, 's_r3');
    });

    await t.test('Tier 1 - R5-F5: Queue actions trigger feedback toasts with exact song counts', async () => {
        const player = createQueueController({
            playlists: { 'Mix': [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] }
        }, mockApi);

        player.addPlaylistToQueue('Mix');
        assert.equal(player.toasts.length, 1);
        assert.ok(player.toasts[0].msg.includes('3 songs'));

        await player.addAlbumNext('alb_rockstar');
        assert.equal(player.toasts.length, 2);
        assert.ok(player.toasts[1].msg.includes('Rockstar') && player.toasts[1].msg.includes('3 songs'));
    });

    // --- TIER 2: BOUNDARY & CORNER CASES ---

    await t.test('Tier 2 - R5-B1: Empty playlist and missing playlist handling', () => {
        const player = createQueueController({
            playlists: { 'Empty': [] }
        });

        const countEmpty = player.addPlaylistNext('Empty');
        assert.equal(countEmpty, 0);
        assert.equal(player.state.userQueue.length, 0);
        assert.ok(player.toasts.some(t => t.type === 'warning'));

        const countMissing = player.addPlaylistToQueue('Nonexistent');
        assert.equal(countMissing, 0);
        assert.equal(player.state.userQueue.length, 0);
    });

    await t.test('Tier 2 - R5-B2: Empty album or failed API network response handling', async () => {
        const player = createQueueController({}, mockApi);

        // Empty album
        const countEmpty = await player.addAlbumToQueue('alb_empty');
        assert.equal(countEmpty, 0);
        assert.equal(player.state.userQueue.length, 0);

        // Nonexistent album / network error
        const countError = await player.addAlbumNext('alb_not_found');
        assert.equal(countError, 0);
        assert.equal(player.state.userQueue.length, 0);
        assert.ok(player.toasts.some(t => t.type === 'error'));
    });

    await t.test('Tier 2 - R5-B3: Adding large playlist (150 songs) maintains queue integrity', () => {
        const largePlaylist = Array.from({ length: 150 }, (_, i) => ({ id: `song_${i}`, name: `Song ${i}` }));
        const player = createQueueController({
            playlists: { 'Mega Mix': largePlaylist }
        });

        player.addPlaylistToQueue('Mega Mix');
        assert.equal(player.state.userQueue.length, 150);
        assert.equal(player.state.userQueue[0].id, 'song_0');
        assert.equal(player.state.userQueue[149].id, 'song_149');
    });

    await t.test('Tier 2 - R5-B4: Adding to empty queue when player is idle', () => {
        const player = createQueueController();
        assert.equal(player.state.currentTrack, null);
        assert.equal(player.state.userQueue.length, 0);

        player.addSongToQueue({ id: 's1', name: 'First Song' });
        assert.equal(player.state.userQueue.length, 1);
        
        // Playing next song pulls the queued item
        const played = player.next();
        assert.equal(played.id, 's1');
        assert.equal(player.state.userQueue.length, 0);
        assert.equal(player.state.playing, true);
    });

    // --- TIER 3: CROSS-FEATURE COMBINATIONS ---

    await t.test('Tier 3 - R5-C1: addPlaylistNext followed by player.next() immediately plays first playlist track', () => {
        const player = createQueueController({
            currentTrack: { id: 'current_song', name: 'Current' },
            userQueue: [{ id: 'old_queued', name: 'Old Queued' }],
            playlists: {
                'Fast Next': [{ id: 'fn_1', name: 'Fast 1' }, { id: 'fn_2', name: 'Fast 2' }]
            }
        });

        player.addPlaylistNext('Fast Next');
        const nextTrack = player.next();
        assert.equal(nextTrack.id, 'fn_1', 'Next track must be first song of newly inserted playlist');
        assert.equal(player.state.userQueue[0].id, 'fn_2');
        assert.equal(player.state.userQueue[1].id, 'old_queued');
    });

    await t.test('Tier 3 - R5-C2: clearQueue wipes user queue while current playing song continues playing', () => {
        const player = createQueueController({
            currentTrack: { id: 'playing_song', name: 'Still Playing' },
            userQueue: [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]
        });

        player.clearQueue();
        assert.equal(player.state.userQueue.length, 0);
        assert.equal(player.state.currentTrack.id, 'playing_song', 'Current track must remain active after clearQueue');
    });

    await t.test('Tier 3 - R5-C3: User queue takes strict priority over auto-recommendation pool', () => {
        const player = createQueueController({
            userQueue: [{ id: 'manual_1', name: 'Manual Song' }],
            autoQueue: [{ id: 'auto_1', name: 'Auto Recommended 1' }, { id: 'auto_2', name: 'Auto Recommended 2' }]
        });

        // 1st next should pull manual
        assert.equal(player.next().id, 'manual_1');
        // 2nd next should fall back to auto queue
        assert.equal(player.next().id, 'auto_1');
        assert.equal(player.next().id, 'auto_2');
        // When both empty -> null
        assert.equal(player.next(), null);
    });

    // --- TIER 4: REAL-WORLD WORKLOAD ---

    await t.test('Tier 4 - R5-W1: Complex multi-source queue builder journey', async () => {
        const player = createQueueController({
            currentTrack: { id: 'start_track', name: 'Start Track' },
            playlists: {
                'Vibes': [{ id: 'v1', name: 'Vibe 1' }, { id: 'v2', name: 'Vibe 2' }]
            }
        }, mockApi);

        // 1. User appends Album (3 songs)
        await player.addAlbumToQueue('alb_rockstar'); // userQueue: [s_r1, s_r2, s_r3]
        assert.equal(player.state.userQueue.length, 3);

        // 2. User inserts Playlist "Vibes" next (2 songs)
        player.addPlaylistNext('Vibes'); // userQueue: [v1, v2, s_r1, s_r2, s_r3]
        assert.equal(player.state.userQueue.length, 5);
        assert.equal(player.state.userQueue[0].id, 'v1');

        // 3. User skips to next song
        const track1 = player.next(); // Now playing: v1, userQueue: [v2, s_r1, s_r2, s_r3]
        assert.equal(track1.id, 'v1');

        // 4. User single-adds a song next
        player.addSongNext({ id: 'urgent_song', name: 'Urgent Track' }); // userQueue: [urgent_song, v2, s_r1, s_r2, s_r3]
        assert.equal(player.state.userQueue[0].id, 'urgent_song');

        // 5. User skips again -> plays urgent_song
        assert.equal(player.next().id, 'urgent_song');
        assert.equal(player.next().id, 'v2');
        assert.equal(player.next().id, 's_r1');
        assert.equal(player.state.userQueue.length, 2);
    });

});
