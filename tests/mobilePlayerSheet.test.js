/**
 * Mobile Now-Playing Sheet regression tests.
 *
 * The expanded mobile player was rebuilt as a dedicated #mobile-player-sheet
 * (previously it re-pieced the desktop footer together with ~60 !important
 * CSS overrides + nth-child selectors, which broke ordering, animations,
 * and seek reliability). These tests pin the rebuild in place.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'src', 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(rootDir, 'src', 'app.js'), 'utf8');

test('sheet markup exists with the required component order', () => {
  assert.match(html, /id="mobile-player-sheet"/);

  const order = ['class="mps-header"', 'id="mps-art-wrap"', 'id="mps-title"', 'id="mps-artist"',
                 'id="mps-seek-bar"', 'id="mps-play"', 'id="mps-queue"'].map((needle) => html.indexOf(needle));
  assert.ok(order.every((pos) => pos !== -1), 'every sheet component must exist');
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, 'art -> info -> controls -> queue order must be preserved');

  // Transport row: shuffle | prev | play | next | repeat
  const transport = ['id="mps-shuffle"', 'id="mps-prev"', 'id="mps-play"', 'id="mps-next"', 'id="mps-repeat"'].map((n) => html.indexOf(n));
  assert.deepStrictEqual([...transport].sort((a, b) => a - b), transport, 'transport button order must be shuffle, prev, play, next, repeat');

  // Queue + history lists live inside the scrollable sheet section
  const queueStart = html.indexOf('id="mps-queue"');
  const queueList = html.indexOf('id="mps-queue-list"');
  const historyList = html.indexOf('id="mps-history-list"');
  assert.ok(queueStart !== -1 && queueList > queueStart && historyList > queueStart, 'queue/history lists must be inside the sheet queue section');
});

test('old fragile expanded-player CSS overrides are gone', () => {
  // These nth-child re-flowing selectors were the root cause of the broken layout.
  assert.doesNotMatch(css, /#player-card > div:nth-child/, 'no nth-child re-flowing of the desktop player card');
  assert.doesNotMatch(css, /mobile-sheet-slide-up/, 'old one-way open animation removed');
  assert.doesNotMatch(css, /\.mobile-player-header/, 'old header class no longer styled');
  assert.doesNotMatch(css, /\.mobile-queue-btn/, 'old queue button class no longer styled');
});

test('sheet opens AND closes with a real transform animation', () => {
  const sheetRules = css.slice(css.indexOf('#mobile-player-sheet {'));
  assert.match(sheetRules, /transform: translateY\(103%\)/, 'closed state is parked below the viewport');
  assert.match(css, /#mobile-player-sheet\.open\s*\{[^}]*transform: translateY\(0\)/, 'open state slides fully in');
  // transition must cover transform for BOTH directions (close previously snapped instantly)
  assert.match(sheetRules, /transition:[^;]*transform/s);
});

test('side scrolling is banned and queue/history scroll vertically', () => {
  assert.match(css, /html\[data-ui-mode="mobile"\] body\s*\{[^}]*overflow-x: hidden/s, 'mobile body must not scroll sideways');
  assert.match(css, /\.mps-scroll\s*\{[^}]*overflow-y: auto/s, 'queue/history lists must scroll vertically');
  assert.match(css, /\.mps-scroll\s*\{[^}]*overflow-x: hidden/s, 'queue/history lists must never scroll sideways');
  assert.match(css, /\.mps-queue\s*\{[^}]*min-height: 0/s, 'queue section must be able to shrink so inner lists scroll');
  assert.match(css, /\.mps-inner\s*\{[^}]*overflow: hidden/s, 'sheet surface itself does not scroll as a page');
});

test('seek bar is a real touch target and cannot be stolen by scrolling', () => {
  assert.match(css, /#mps-seek-bar\s*\{[^}]*height: 44px/s, '44px tall seek input');
  assert.match(css, /#mps-seek-bar\s*\{[^}]*touch-action: none/s, 'touch-action none so drags are never treated as page scrolls');
});

test('seek controller uses pointer capture with window-level release', () => {
  assert.match(appJs, /function bindSeekBar/, 'shared seek binder exists');
  assert.match(appJs, /input\.setPointerCapture\(e\.pointerId\)/, 'drags are captured on the input');
  assert.match(appJs, /window\.addEventListener\('pointerup'/, 'window pointerup releases dragging');
  assert.match(appJs, /window\.addEventListener\('pointercancel'/, 'window pointercancel releases dragging');
  assert.match(appJs, /function updateSeekUI/, 'shared UI updater exists');
  assert.match(appJs, /String\(input\.max\) !== String\(dur\)/, 'bar max stays in sync with real duration');
  // Both bars are registered through the same controller
  const binderCount = (appJs.match(/bindSeekBar\(/g) || []).length;
  assert.ok(binderCount >= 3, `desktop + mobile bars must both be bound (found ${binderCount} references)`);
  // The old element-local drag listeners are gone
  assert.doesNotMatch(appJs, /seekBar\.addEventListener\('touchstart'/);
  assert.doesNotMatch(appJs, /seekBar\.addEventListener\('mouseleave'/);
});

test('sheet state is driven by dedicated JS, not footer class surgery', () => {
  assert.match(appJs, /sheet\?\.classList\.add\('open'\)/, 'open toggles the sheet');
  assert.match(appJs, /sheet\?\.classList\.remove\('open'\)/, 'close toggles the sheet');
  assert.match(appJs, /syncMobilePlayerUI/, 'sheet has a dedicated state mirror');
  assert.match(appJs, /toggleMpsQueue/, 'queue section has a dedicated toggle');
  // Queue + history render into the sheet too
  assert.match(appJs, /mps-queue-list/, 'queue renders into the sheet');
  assert.match(appJs, /mps-history-list/, 'history renders into the sheet');
  assert.match(appJs, /mps-seek-bar/, 'mobile seek bar is wired up');
  assert.match(appJs, /getElementById\('mps-art-wrap'\)/, 'album art swipe targets the sheet art');
  // Every direct body-class close also closes the sheet element
  const closes = (appJs.match(/classList\.remove\('mobile-player-open'\)/g) || []).length;
  const sheetCloses = (appJs.match(/mobile-player-sheet'\)\?\.classList\.remove\('open'\)/g) || []).length;
  assert.ok(sheetCloses >= 5, `expected >=5 sheet-close hooks (found ${sheetCloses}, body closes: ${closes})`);
});
