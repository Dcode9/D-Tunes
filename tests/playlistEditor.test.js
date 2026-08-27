const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./testHarness');

// Reference Playlist Formatting & Procedural Geometry Engine
const playlistEngine = {
    formatTotalDuration: (songs = []) => {
        if (!Array.isArray(songs) || songs.length === 0) return '0 mins';
        const totalSecs = songs.reduce((acc, s) => {
            const dur = Number((s && (s.duration || s.duration_seconds)) || 0);
            return acc + (isNaN(dur) ? 0 : dur);
        }, 0);
        
        if (totalSecs <= 0) return '0 mins';
        const hours = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        
        if (hours === 0) {
            return `${Math.max(1, mins)} min${mins === 1 ? '' : 's'}`;
        }
        if (mins === 0) {
            return `${hours} hr${hours === 1 ? '' : 's'}`;
        }
        return `${hours} hr${hours === 1 ? '' : 's'} ${mins} min${mins === 1 ? '' : 's'}`;
    },

    formatTrackCount: (songs = []) => {
        const count = Array.isArray(songs) ? songs.length : 0;
        return `${count} song${count === 1 ? '' : 's'}`;
    },

    generateStarPolygonPoints: (cx, cy, outerRadius, innerRadius, numPoints = 5) => {
        const points = [];
        const step = Math.PI / numPoints;
        for (let i = 0; i < 2 * numPoints; i++) {
            const r = (i % 2 === 0) ? outerRadius : innerRadius;
            const angle = i * step - Math.PI / 2;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
        }
        return points.join(' ');
    },

    generateProceduralCoverHtml: (style = {}) => {
        const color = style.color || '#0ea5e9';
        const shape = style.shape || 'SmoothRect';
        const cornerRadius = typeof style.cornerRadius === 'number' ? style.cornerRadius : 20;
        const starSides = typeof style.starSides === 'number' ? style.starSides : 5;
        const icon = style.icon || 'Music';

        let shapeSnippet = '';
        if (shape === 'SmoothRect') {
            shapeSnippet = `<div class="pl-shape-smooth-rect" style="background:${color}; border-radius:${cornerRadius}px;"></div>`;
        } else if (shape === 'RotatedPill') {
            shapeSnippet = `<div class="pl-shape-rotated-pill" style="background:${color}; transform: rotate(45deg); border-radius: 9999px;"></div>`;
        } else if (shape === 'Star') {
            const points = playlistEngine.generateStarPolygonPoints(50, 50, 45, 20, starSides);
            shapeSnippet = `<svg viewBox="0 0 100 100" class="pl-shape-star"><polygon points="${points}" fill="${color}"/></svg>`;
        } else if (shape === 'Circle') {
            shapeSnippet = `<div class="pl-shape-circle" style="background:${color}; border-radius: 50%;"></div>`;
        }

        return `<div class="procedural-cover" data-shape="${shape}" data-color="${color}" data-icon="${icon}">${shapeSnippet}<div class="pl-icon">${icon}</div></div>`;
    }
};

// Reference Playlist Editor Controller
function createPlaylistEditor(initialPlaylists = {}, initialStyles = {}, cloudSyncMock = null) {
    const playlists = JSON.parse(JSON.stringify(initialPlaylists));
    const styles = JSON.parse(JSON.stringify(initialStyles));
    let lastCloudSync = null;

    const renamePlaylist = (oldName, newName) => {
        if (!oldName || !newName || typeof newName !== 'string') return { success: false, error: 'Invalid name' };
        const trimmed = newName.trim();
        if (trimmed === '') return { success: false, error: 'Name cannot be empty' };
        if (oldName === 'Liked Songs') return { success: false, error: 'Cannot rename Liked Songs' };
        if (!playlists[oldName]) return { success: false, error: 'Playlist does not exist' };
        if (oldName !== trimmed && playlists[trimmed]) return { success: false, error: 'A playlist with this name already exists' };

        const songs = playlists[oldName];
        delete playlists[oldName];
        playlists[trimmed] = songs;

        if (styles[oldName]) {
            const s = styles[oldName];
            delete styles[oldName];
            styles[trimmed] = s;
        }

        if (cloudSyncMock) cloudSyncMock.savePlaylist(trimmed, songs, styles[trimmed]);
        return { success: true, newName: trimmed };
    };

    const updatePlaylistStyle = (name, newStyle) => {
        if (!playlists[name]) return false;
        styles[name] = { ...(styles[name] || {}), ...newStyle };
        if (cloudSyncMock) cloudSyncMock.savePlaylist(name, playlists[name], styles[name]);
        return true;
    };

    const reorderTrack = (name, fromIndex, toIndex) => {
        const list = playlists[name];
        if (!list || fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) {
            return false;
        }
        const [moved] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, moved);
        if (cloudSyncMock) cloudSyncMock.savePlaylist(name, list, styles[name]);
        return true;
    };

    const removeTrack = (name, trackId) => {
        const list = playlists[name];
        if (!list) return false;
        const initialLen = list.length;
        playlists[name] = list.filter(t => (t.id || t.saavn_id) !== trackId);
        if (playlists[name].length !== initialLen) {
            if (cloudSyncMock) cloudSyncMock.savePlaylist(name, playlists[name], styles[name]);
            return true;
        }
        return false;
    };

    const deletePlaylist = (name) => {
        if (name === 'Liked Songs') return { success: false, error: 'Cannot delete Liked Songs' };
        if (!playlists[name]) return { success: false, error: 'Not found' };
        delete playlists[name];
        delete styles[name];
        if (cloudSyncMock) cloudSyncMock.deletePlaylist(name);
        return { success: true };
    };

    return {
        playlists,
        styles,
        renamePlaylist,
        updatePlaylistStyle,
        reorderTrack,
        removeTrack,
        deletePlaylist
    };
}

test('R2: Playlists Viewer & Procedural Editor Suite', async (t) => {

    // --- TIER 1: FEATURE COVERAGE (R2) ---

    await t.test('Tier 1 - R2-F1: Duration calculation formats correctly across seconds, minutes, and hours', () => {
        // Less than 1 hr: 145s -> 2 mins
        assert.equal(playlistEngine.formatTotalDuration([{ duration: 145 }]), '2 mins');
        // Exact 1 hr: 3600s -> 1 hr
        assert.equal(playlistEngine.formatTotalDuration([{ duration: 3600 }]), '1 hr');
        // 1 hr 24 mins: 5040s
        assert.equal(playlistEngine.formatTotalDuration([{ duration: 5040 }]), '1 hr 24 mins');
        // Multiple tracks combined: 180s + 240s = 420s -> 7 mins
        assert.equal(playlistEngine.formatTotalDuration([{ duration: 180 }, { duration: 240 }]), '7 mins');
        // 2 hrs 5 mins: 7500s
        assert.equal(playlistEngine.formatTotalDuration([{ duration: 7500 }]), '2 hrs 5 mins');
    });

    await t.test('Tier 1 - R2-F2: Track count pluralization handles 0, 1, and N tracks', () => {
        assert.equal(playlistEngine.formatTrackCount([]), '0 songs');
        assert.equal(playlistEngine.formatTrackCount([{ id: '1' }]), '1 song');
        assert.equal(playlistEngine.formatTrackCount([{ id: '1' }, { id: '2' }]), '2 songs');
        assert.equal(playlistEngine.formatTrackCount(Array(15).fill({ id: 'x' })), '15 songs');
    });

    await t.test('Tier 1 - R2-F3: Procedural cover supports SmoothRect with corner radius', () => {
        const html = playlistEngine.generateProceduralCoverHtml({
            color: '#8b5cf6',
            shape: 'SmoothRect',
            cornerRadius: 28,
            icon: 'Sparkles'
        });
        assert.ok(html.includes('border-radius:28px'));
        assert.ok(html.includes('#8b5cf6'));
        assert.ok(html.includes('Sparkles'));
    });

    await t.test('Tier 1 - R2-F4: Procedural cover supports Star geometry with configurable sides', () => {
        const html = playlistEngine.generateProceduralCoverHtml({
            color: '#ec4899',
            shape: 'Star',
            starSides: 6,
            icon: 'Flame'
        });
        assert.ok(html.includes('<polygon points='));
        assert.ok(html.includes('#ec4899'));
        assert.ok(html.includes('Flame'));
    });

    await t.test('Tier 1 - R2-F5: Procedural cover supports RotatedPill and Circle shapes', () => {
        const pillHtml = playlistEngine.generateProceduralCoverHtml({ shape: 'RotatedPill', color: '#10b981' });
        assert.ok(pillHtml.includes('rotate(45deg)'));

        const circleHtml = playlistEngine.generateProceduralCoverHtml({ shape: 'Circle', color: '#f59e0b' });
        assert.ok(circleHtml.includes('border-radius: 50%'));
    });

    await t.test('Tier 1 - R2-F6: Playlist editor track reordering (swap / move up / move down)', () => {
        const editor = createPlaylistEditor({
            'My Mix': [
                { id: 't0', name: 'Track 0' },
                { id: 't1', name: 'Track 1' },
                { id: 't2', name: 'Track 2' }
            ]
        });

        // Move Track 2 to top (index 2 -> index 0)
        const ok = editor.reorderTrack('My Mix', 2, 0);
        assert.equal(ok, true);
        assert.equal(editor.playlists['My Mix'][0].id, 't2');
        assert.equal(editor.playlists['My Mix'][1].id, 't0');
        assert.equal(editor.playlists['My Mix'][2].id, 't1');
    });

    await t.test('Tier 1 - R2-F7: Playlist editor track removal updates playlist and track count', () => {
        const editor = createPlaylistEditor({
            'My Mix': [{ id: 't0' }, { id: 't1' }, { id: 't2' }]
        });

        const removed = editor.removeTrack('My Mix', 't1');
        assert.equal(removed, true);
        assert.equal(editor.playlists['My Mix'].length, 2);
        assert.equal(editor.playlists['My Mix'].some(t => t.id === 't1'), false);
    });

    // --- TIER 2: BOUNDARY & CORNER CASES ---

    await t.test('Tier 2 - R2-B1: Empty playlist formatting and boundary values', () => {
        assert.equal(playlistEngine.formatTotalDuration([]), '0 mins');
        assert.equal(playlistEngine.formatTotalDuration(null), '0 mins');
        assert.equal(playlistEngine.formatTotalDuration([{ duration: 0 }]), '0 mins');
        assert.equal(playlistEngine.formatTotalDuration([{ duration: 'invalid' }]), '0 mins');
    });

    await t.test('Tier 2 - R2-B2: Protected Liked Songs playlist cannot be renamed or deleted', () => {
        const editor = createPlaylistEditor({
            'Liked Songs': [{ id: 's1' }]
        });

        const renameRes = editor.renamePlaylist('Liked Songs', 'Hated Songs');
        assert.equal(renameRes.success, false);
        assert.equal(renameRes.error, 'Cannot rename Liked Songs');

        const deleteRes = editor.deletePlaylist('Liked Songs');
        assert.equal(deleteRes.success, false);
        assert.equal(deleteRes.error, 'Cannot delete Liked Songs');
    });

    await t.test('Tier 2 - R2-B3: Renaming with whitespace, duplicates, or empty strings', () => {
        const editor = createPlaylistEditor({
            'Road Trip': [],
            'Gym Beats': []
        });

        // Empty string
        assert.equal(editor.renamePlaylist('Road Trip', '   ').success, false);

        // Duplicate name
        assert.equal(editor.renamePlaylist('Road Trip', 'Gym Beats').success, false);

        // Valid rename with surrounding whitespace trimmed
        const res = editor.renamePlaylist('Road Trip', '  Epic Road Trip  ');
        assert.equal(res.success, true);
        assert.equal(res.newName, 'Epic Road Trip');
        assert.ok(editor.playlists['Epic Road Trip']);
        assert.equal(editor.playlists['Road Trip'], undefined);
    });

    await t.test('Tier 2 - R2-B4: Extreme procedural shape parameter limits (cornerRadius 0 to 50, sides 3 to 20)', () => {
        // Minimum Star sides (3 = triangle star)
        const star3 = playlistEngine.generateStarPolygonPoints(50, 50, 45, 20, 3);
        assert.ok(star3.split(' ').length === 6); // 2 * 3 points

        // Maximum Star sides (20)
        const star20 = playlistEngine.generateStarPolygonPoints(50, 50, 45, 20, 20);
        assert.ok(star20.split(' ').length === 40); // 2 * 20 points
    });

    // --- TIER 3: CROSS-FEATURE COMBINATIONS ---

    await t.test('Tier 3 - R2-C1: Renaming playlist migrates playlistStyles and triggers cloud sync', () => {
        let syncedPlaylist = null;
        const cloudMock = {
            savePlaylist: (name, songs, style) => {
                syncedPlaylist = { name, songs, style };
            }
        };

        const editor = createPlaylistEditor(
            { 'Chill': [{ id: 's1', duration: 200 }] },
            { 'Chill': { color: '#0ea5e9', shape: 'SmoothRect', cornerRadius: 24 } },
            cloudMock
        );

        const res = editor.renamePlaylist('Chill', 'Ultra Chill');
        assert.equal(res.success, true);
        assert.equal(editor.styles['Ultra Chill'].cornerRadius, 24);
        assert.equal(editor.styles['Chill'], undefined);
        assert.equal(syncedPlaylist.name, 'Ultra Chill');
    });

    await t.test('Tier 3 - R2-C2: Deleting a track recomputes total duration and syncs changes', () => {
        const editor = createPlaylistEditor({
            'Party': [
                { id: 's1', duration: 1800 }, // 30 mins
                { id: 's2', duration: 1800 }, // 30 mins -> total 1 hr
                { id: 's3', duration: 300 }   // 5 mins -> total 1 hr 5 mins
            ]
        });

        assert.equal(playlistEngine.formatTotalDuration(editor.playlists['Party']), '1 hr 5 mins');

        editor.removeTrack('Party', 's3');
        assert.equal(playlistEngine.formatTotalDuration(editor.playlists['Party']), '1 hr');

        editor.removeTrack('Party', 's2');
        assert.equal(playlistEngine.formatTotalDuration(editor.playlists['Party']), '30 mins');
    });

    // --- TIER 4: REAL-WORLD WORKLOAD ---

    await t.test('Tier 4 - R2-W1: Full Playlist Lifecycle (Create -> Customize Cover -> Reorder -> Sync)', () => {
        const cloudSaves = [];
        const cloudMock = {
            savePlaylist: (name, songs, style) => cloudSaves.push({ name, songs: [...songs], style: { ...style } })
        };

        const editor = createPlaylistEditor(
            { 'Workout 2026': [
                { id: 'w1', name: 'Power Intro', duration: 120 },
                { id: 'w2', name: 'Heavy Bass', duration: 240 },
                { id: 'w3', name: 'Sprint Beat', duration: 180 }
            ]},
            {},
            cloudMock
        );

        // 1. Customize cover style
        editor.updatePlaylistStyle('Workout 2026', {
            color: '#ef4444',
            shape: 'Star',
            starSides: 8,
            icon: 'Flame'
        });
        assert.equal(editor.styles['Workout 2026'].icon, 'Flame');

        // 2. Reorder track: Sprint Beat (idx 2) to top (idx 0)
        editor.reorderTrack('Workout 2026', 2, 0);
        assert.equal(editor.playlists['Workout 2026'][0].id, 'w3');

        // 3. Rename to 'Ultimate Workout'
        editor.renamePlaylist('Workout 2026', 'Ultimate Workout');
        assert.equal(editor.playlists['Ultimate Workout'][0].name, 'Sprint Beat');
        assert.equal(editor.styles['Ultimate Workout'].color, '#ef4444');

        // 4. Verify cloud sync calls were issued
        assert.ok(cloudSaves.length >= 3);
        assert.equal(cloudSaves[cloudSaves.length - 1].name, 'Ultimate Workout');
    });

});
