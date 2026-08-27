const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment } = require('./testHarness');

// Reference Stats Aggregation Engine
const statsEngine = {
    computeOverview: (history = []) => {
        if (!Array.isArray(history) || history.length === 0) {
            return {
                totalSeconds: 0,
                formattedTime: '0 mins',
                totalPlays: 0,
                uniqueTracks: 0,
                favoriteArtist: 'None'
            };
        }

        let totalSeconds = 0;
        const uniqueTrackIds = new Set();
        const artistCounts = new Map();

        for (const item of history) {
            const sec = Number(item.duration || item.duration_seconds || item.playedDuration || 0);
            if (!isNaN(sec) && sec > 0) totalSeconds += sec;

            const trackId = item.id || item.saavn_id || item.title;
            if (trackId) uniqueTrackIds.add(trackId);

            const artist = (item.artist || item.primary_artists || item.primaryArtists || 'Unknown').trim();
            if (artist && artist !== 'Unknown') {
                artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
            }
        }

        let favoriteArtist = 'None';
        let maxArtistPlays = 0;
        for (const [artist, count] of artistCounts.entries()) {
            if (count > maxArtistPlays) {
                maxArtistPlays = count;
                favoriteArtist = artist;
            }
        }

        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        let formattedTime = '0 mins';
        if (hrs > 0) {
            formattedTime = `${hrs} hr${hrs === 1 ? '' : 's'}${mins > 0 ? ` ${mins} min${mins === 1 ? '' : 's'}` : ''}`;
        } else if (mins > 0) {
            formattedTime = `${mins} min${mins === 1 ? '' : 's'}`;
        }

        return {
            totalSeconds,
            formattedTime,
            totalPlays: history.length,
            uniqueTracks: uniqueTrackIds.size,
            favoriteArtist
        };
    },

    computeTopTracks: (history = [], limit = 5) => {
        if (!Array.isArray(history) || history.length === 0) return [];
        const trackMap = new Map();

        for (const item of history) {
            const key = item.id || item.title;
            if (!key) continue;
            if (!trackMap.has(key)) {
                trackMap.set(key, {
                    id: item.id || key,
                    title: item.title || item.name || 'Untitled',
                    artist: item.artist || item.primary_artists || 'Unknown',
                    image: item.image || item.img || 'assets/DTunes2.svg',
                    playCount: 0
                });
            }
            trackMap.get(key).playCount += 1;
        }

        return Array.from(trackMap.values())
            .sort((a, b) => b.playCount - a.playCount)
            .slice(0, limit)
            .map((t, idx) => ({ ...t, rank: idx + 1 }));
    },

    computeTopArtists: (history = [], limit = 5) => {
        if (!Array.isArray(history) || history.length === 0) return [];
        const artistMap = new Map();

        for (const item of history) {
            const rawArtist = (item.artist || item.primary_artists || item.primaryArtists || 'Unknown').trim();
            if (!rawArtist || rawArtist === 'Unknown') continue;
            artistMap.set(rawArtist, (artistMap.get(rawArtist) || 0) + 1);
        }

        const sorted = Array.from(artistMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);

        const totalTopPlays = sorted.reduce((acc, curr) => acc + curr[1], 0);

        return sorted.map(([name, plays], idx) => {
            const percentage = totalTopPlays > 0 ? Math.round((plays / totalTopPlays) * 100) : 0;
            return { rank: idx + 1, name, plays, percentage };
        });
    },

    compute7DayTimeline: (history = [], referenceDate = new Date()) => {
        const days = [];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date(referenceDate);
            d.setUTCDate(d.getUTCDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            days.push({
                dateStr: dateStr,
                dayLabel: dayNames[d.getUTCDay()],
                minutes: 0,
                plays: 0
            });
        }

        const dayMap = new Map(days.map(d => [d.dateStr, d]));

        for (const item of history) {
            if (!item.playedAt && !item.timestamp) continue;
            const itemDate = new Date(item.playedAt || item.timestamp);
            const dateStr = itemDate.toISOString().slice(0, 10);
            if (dayMap.has(dateStr)) {
                const entry = dayMap.get(dateStr);
                entry.plays += 1;
                const dur = Number(item.duration || item.duration_seconds || 0);
                entry.minutes += Math.round(dur / 60);
            }
        }

        return days;
    },

    groupHistoryByRelativeDates: (history = [], referenceDate = new Date()) => {
        const groups = {
            'Today': [],
            'Yesterday': [],
            'Earlier this week': [],
            'Older': []
        };

        const ref = new Date(referenceDate);
        const refUtcMidnight = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
        const oneDayMs = 24 * 60 * 60 * 1000;

        for (const item of history) {
            if (!item.playedAt && !item.timestamp) continue;
            const itemDate = new Date(item.playedAt || item.timestamp);
            const itemUtcMidnight = Date.UTC(itemDate.getUTCFullYear(), itemDate.getUTCMonth(), itemDate.getUTCDate());
            const diffDays = Math.round((refUtcMidnight - itemUtcMidnight) / oneDayMs);

            if (diffDays === 0) groups['Today'].push(item);
            else if (diffDays === 1) groups['Yesterday'].push(item);
            else if (diffDays > 1 && diffDays <= 7) groups['Earlier this week'].push(item);
            else groups['Older'].push(item);
        }

        return groups;
    }
};

test('R7: Exact Playing Stats Dashboard Suite', async (t) => {

    // Fixture history
    const sampleHistory = [
        { id: 's1', title: 'Kesariya', artist: 'Arijit Singh', duration: 268, playedAt: '2026-08-27T12:00:00Z' },
        { id: 's1', title: 'Kesariya', artist: 'Arijit Singh', duration: 268, playedAt: '2026-08-27T14:00:00Z' },
        { id: 's2', title: 'Kun Faya Kun', artist: 'A.R. Rahman', duration: 473, playedAt: '2026-08-26T18:00:00Z' },
        { id: 's3', title: 'Starboy', artist: 'The Weeknd', duration: 230, playedAt: '2026-08-25T10:00:00Z' },
        { id: 's1', title: 'Kesariya', artist: 'Arijit Singh', duration: 268, playedAt: '2026-08-24T09:00:00Z' },
        { id: 's4', title: 'Blinding Lights', artist: 'The Weeknd', duration: 200, playedAt: '2026-08-23T11:00:00Z' },
        { id: 's5', title: 'Channa Mereya', artist: 'Arijit Singh', duration: 289, playedAt: '2026-08-19T08:00:00Z' }
    ];

    // --- TIER 1: FEATURE COVERAGE (R7) ---

    await t.test('Tier 1 - R7-F1: Overview metrics compute total time, total plays, unique tracks, and favorite artist', () => {
        const overview = statsEngine.computeOverview(sampleHistory);
        assert.equal(overview.totalPlays, 7);
        assert.equal(overview.uniqueTracks, 5); // s1, s2, s3, s4, s5
        assert.equal(overview.favoriteArtist, 'Arijit Singh'); // 4 plays
        assert.ok(overview.totalSeconds > 1900);
        assert.ok(overview.formattedTime.includes('min') || overview.formattedTime.includes('hr'));
    });

    await t.test('Tier 1 - R7-F2: Top 5 Tracks rank songs accurately with play counts', () => {
        const topTracks = statsEngine.computeTopTracks(sampleHistory, 5);
        assert.equal(topTracks.length, 5);
        assert.equal(topTracks[0].id, 's1');
        assert.equal(topTracks[0].playCount, 3); // 3 Kesariya plays
        assert.equal(topTracks[0].rank, 1);
    });

    await t.test('Tier 1 - R7-F3: Top 5 Artists calculates relative percentage breakdown progress bars', () => {
        const topArtists = statsEngine.computeTopArtists(sampleHistory, 5);
        assert.equal(topArtists.length, 3); // Arijit (4), The Weeknd (2), A.R. Rahman (1) -> Total 7
        assert.equal(topArtists[0].name, 'Arijit Singh');
        assert.equal(topArtists[0].plays, 4);
        assert.equal(topArtists[0].percentage, 57); // 4 / 7 = 57.14% -> 57%
        assert.equal(topArtists[1].name, 'The Weeknd');
        assert.equal(topArtists[1].plays, 2);
        assert.equal(topArtists[1].percentage, 29); // 2 / 7 = 28.57% -> 29%
        assert.equal(topArtists[2].name, 'A.R. Rahman');
        assert.equal(topArtists[2].plays, 1);
        assert.equal(topArtists[2].percentage, 14); // 1 / 7 = 14.28% -> 14%
    });

    await t.test('Tier 1 - R7-F4: 7-day timeline generates 7 daily data points with minutes and play counts', () => {
        const refDate = new Date('2026-08-27T15:00:00Z');
        const timeline = statsEngine.compute7DayTimeline(sampleHistory, refDate);
        assert.equal(timeline.length, 7);
        assert.equal(timeline[6].dateStr, '2026-08-27');
        assert.equal(timeline[6].plays, 2); // 2 plays on Aug 27
        assert.equal(timeline[5].dateStr, '2026-08-26');
        assert.equal(timeline[5].plays, 1); // 1 play on Aug 26
    });

    await t.test('Tier 1 - R7-F5: History log groups items by relative dates (Today, Yesterday, Earlier this week)', () => {
        const refDate = new Date('2026-08-27T15:00:00Z');
        const groups = statsEngine.groupHistoryByRelativeDates(sampleHistory, refDate);
        assert.equal(groups['Today'].length, 2); // Aug 27
        assert.equal(groups['Yesterday'].length, 1); // Aug 26
        assert.equal(groups['Earlier this week'].length, 3); // Aug 25 (s3), Aug 24 (s1), Aug 23 (s4)
        assert.equal(groups['Older'].length, 1); // Aug 19 (s5, 8 days ago)
    });

    // --- TIER 2: BOUNDARY & CORNER CASES ---

    await t.test('Tier 2 - R7-B1: Empty history renders safe zero values without NaN or crashes', () => {
        const overview = statsEngine.computeOverview([]);
        assert.equal(overview.totalPlays, 0);
        assert.equal(overview.uniqueTracks, 0);
        assert.equal(overview.formattedTime, '0 mins');
        assert.equal(overview.favoriteArtist, 'None');

        const topTracks = statsEngine.computeTopTracks([]);
        assert.deepEqual(topTracks, []);

        const topArtists = statsEngine.computeTopArtists([]);
        assert.deepEqual(topArtists, []);

        const timeline = statsEngine.compute7DayTimeline([]);
        assert.equal(timeline.length, 7);
        assert.equal(timeline.every(d => d.plays === 0), true);
    });

    await t.test('Tier 2 - R7-B2: Single item history calculates 100% artist share', () => {
        const singleHistory = [{ id: 's1', title: 'Solo', artist: 'Solo Artist', duration: 180 }];
        const topArtists = statsEngine.computeTopArtists(singleHistory);
        assert.equal(topArtists.length, 1);
        assert.equal(topArtists[0].percentage, 100);
    });

    await t.test('Tier 2 - R7-B3: Corrupt or missing durations are safely ignored in time calculation', () => {
        const messyHistory = [
            { id: '1', artist: 'Artist', duration: 'corrupt' },
            { id: '2', artist: 'Artist', duration: -50 },
            { id: '3', artist: 'Artist', duration: null },
            { id: '4', artist: 'Artist', duration: 120 }
        ];
        const overview = statsEngine.computeOverview(messyHistory);
        assert.equal(overview.totalSeconds, 120);
        assert.equal(overview.formattedTime, '2 mins');
    });

    // --- TIER 3: CROSS-FEATURE COMBINATIONS ---

    await t.test('Tier 3 - R7-C1: Playback events dynamically update history and recalculate stats in real-time', () => {
        const history = [...sampleHistory];
        const initialOverview = statsEngine.computeOverview(history);

        // New play event occurs
        history.unshift({
            id: 's_new',
            title: 'Brand New Track',
            artist: 'New Star',
            duration: 300,
            playedAt: '2026-08-27T16:00:00Z'
        });

        const updatedOverview = statsEngine.computeOverview(history);
        assert.equal(updatedOverview.totalPlays, initialOverview.totalPlays + 1);
        assert.equal(updatedOverview.uniqueTracks, initialOverview.uniqueTracks + 1);
        assert.equal(updatedOverview.totalSeconds, initialOverview.totalSeconds + 300);
    });

    // --- TIER 4: REAL-WORLD WORKLOAD ---

    await t.test('Tier 4 - R7-W1: Comprehensive 50-event listening stats lifecycle', () => {
        const bigHistory = [];
        const artists = ['Arijit Singh', 'Pritam', 'A.R. Rahman', 'Shreya Ghoshal', 'Anirudh'];
        const refDate = new Date('2026-08-27T20:00:00Z');

        for (let i = 0; i < 50; i++) {
            const artist = artists[i % artists.length];
            const d = new Date(refDate);
            d.setUTCDate(d.getUTCDate() - (i % 7));
            bigHistory.push({
                id: `song_${i % 15}`,
                title: `Track ${i % 15}`,
                artist: artist,
                duration: 200 + (i % 5) * 30,
                playedAt: d.toISOString()
            });
        }

        const overview = statsEngine.computeOverview(bigHistory);
        assert.equal(overview.totalPlays, 50);
        assert.equal(overview.uniqueTracks, 15);

        const topArtists = statsEngine.computeTopArtists(bigHistory, 5);
        assert.equal(topArtists.length, 5);
        const percentSum = topArtists.reduce((acc, a) => acc + a.percentage, 0);
        assert.ok(Math.abs(percentSum - 100) <= 2, `Percentage sum should be ~100%, got ${percentSum}%`);

        const timeline = statsEngine.compute7DayTimeline(bigHistory, refDate);
        const timelineTotalPlays = timeline.reduce((acc, d) => acc + d.plays, 0);
        assert.equal(timelineTotalPlays, 50);
    });

});
