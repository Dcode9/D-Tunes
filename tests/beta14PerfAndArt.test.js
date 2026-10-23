const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Beta 1.4: Card hover does NOT translate or move up', () => {
  const stylesCss = fs.readFileSync(path.join(__dirname, '../src/css/styles.css'), 'utf8');

  // Verify .scroll-card:hover does NOT have negative translateY or translate3d(..., -..., ...)
  assert.doesNotMatch(stylesCss, /\.scroll-card:hover\s*\{[^}]*translateY\s*\(\s*-[^)]+\)/i);
  assert.doesNotMatch(stylesCss, /\.scroll-card:hover\s*\{[^}]*translate3d\s*\([^,]+,\s*-[^,]+,/i);

  // Verify transform: none !important is enforced
  assert.match(stylesCss, /\.scroll-card:hover\s*\{[^}]*transform:\s*none\s*!important/);
  assert.match(stylesCss, /\.scroll-card:active\s*\{[^}]*transform:\s*none\s*!important/);
});

test('Beta 1.4: Home page performance - No GPU blur shader overhead on images', () => {
  const stylesCss = fs.readFileSync(path.join(__dirname, '../src/css/styles.css'), 'utf8');

  // .reveal-blur-img should NOT use expensive Gaussian blur filter
  assert.doesNotMatch(stylesCss, /\.reveal-blur-img\s*\{[^}]*filter:\s*blur\(/i);

  // .reveal-text should NOT translate
  assert.doesNotMatch(stylesCss, /\.reveal-text\s*\{[^}]*translateY/i);
});

test('Beta 1.4: Home page performance - No layout thrashing mouseover listeners in main.js', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '../src/js/main.js'), 'utf8');

  // Must not attach mouseover/mouseout listeners that calculate getBoundingClientRect on cards
  assert.doesNotMatch(mainJs, /document\.addEventListener\('mouseover',\s*\(e\)\s*=>\s*\{[\s\S]*?getBoundingClientRect/);
  assert.doesNotMatch(mainJs, /document\.addEventListener\('mouseout',\s*\(e\)\s*=>\s*\{[\s\S]*?getBoundingClientRect/);
});

test('Beta 1.4: Album artwork display reliability & local fallback art', () => {
  const utilsJs = fs.readFileSync(path.join(__dirname, '../src/js/utils.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const uiJs = fs.readFileSync(path.join(__dirname, '../src/js/ui.js'), 'utf8');

  // 1. Fallback art candidates must prioritize local files and not depend on raw GitHub URLs
  assert.match(utilsJs, /const FALLBACK_ART\s*=\s*['"]DTunes\.svg['"]/);
  assert.doesNotMatch(utilsJs, /const FALLBACK_ART_CANDIDATES\s*=\s*\[\s*GITHUB_DETUNED_SVG/);

  // 2. sanitizeImageUrl must upgrade insecure http: to https:
  assert.match(utilsJs, /url\.startsWith\('http:\/\/'\)/);

  // 3. curr-art-img in index.html must not use crossorigin="anonymous"
  assert.doesNotMatch(indexHtml, /<img id="curr-art-img"[^>]*crossorigin/i);
  assert.doesNotMatch(indexHtml, /<img id="curr-art-img"[^>]*raw\.githubusercontent\.com/i);

  // 4. ui.js must not set artImg.crossOrigin = 'anonymous' (prevents CDN display blocks)
  assert.doesNotMatch(uiJs, /artImg\.crossOrigin\s*=\s*['"]anonymous['"]/);

  // 5. ui.js must have retry/fallback logic for 500x500 -> 150x150 -> fallback
  assert.match(uiJs, /500x500/);
  assert.match(uiJs, /150x150/);
});
