'use strict';
// D'Tunes WhatsApp Status video: 1080x1920, 24 fps, 30.09 s.
// Every frame is a pure function of its index (window.renderFrame(i)); build.py screenshots each one.
// Open scene.html?t=25.6 in Chrome to look at a single moment.

const W = 1080, H = 1920, FPS = 24, DUR = 30.09, NF = Math.floor(DUR * FPS);
const cv = document.getElementById('c'), ctx = cv.getContext('2d');

// ---------------------------------------------------------------- math / easing
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, u) => a + (b - a) * u;
const inv = (a, b, v) => clamp((v - a) / (b - a));
const smooth = u => u * u * (3 - 2 * u);
const ss = (a, b, v) => smooth(inv(a, b, v));
const outExpo = u => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
const outCubic = u => 1 - Math.pow(1 - u, 3);
const inCubic = u => u * u * u;
const inOutCubic = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const inOutQuad = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const inOutSine = u => -(Math.cos(Math.PI * u) - 1) / 2;
// damped spring: settles 0 -> 1 with one soft overshoot (~6 %)
const spring = (u, f = 1.1, z = 6.2) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.exp(-z * u) * Math.cos(2 * Math.PI * f * u));
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k); return lerp(b, a, h) - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);

// ---------------------------------------------------------------- soundtrack sync
// Strong onsets of audio-3ae9e05b.mp3 (spectral flux), [time, weight].
const HITS = [[5.67, .6], [6.62, .5], [7.26, .55], [8.21, 1], [9.49, .85], [9.8, .5], [10.75, .95], [11.7, .5], [13.31, .75],
  [15.85, .55], [16.8, .55], [17.44, .5], [18.39, 1], [19.67, 1], [19.98, .5], [20.93, .9], [22.85, .5], [23.49, .8]];
function hit(t) {
  let v = 0;
  for (const [h, s] of HITS) { const d = t - h; if (d >= 0 && d < 1.2) v = Math.max(v, s * Math.exp(-d * 5.5)); }
  return v;
}

// ---------------------------------------------------------------- canvas helpers
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const c2d = c => c.getContext('2d');
function reset(x) { x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.filter = 'none'; }
function clear(x) { reset(x); x.clearRect(0, 0, x.canvas.width, x.canvas.height); }
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgba = (c, a) => `rgba(${c[0].toFixed(1)},${c[1].toFixed(1)},${c[2].toFixed(1)},${clamp(a).toFixed(4)})`;
function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Paint `mask` with `fill` (source-in) on scratch S, then composite onto dst.
function tint(dst, S, mask, fill, op, alpha, dx = 0, dy = 0, filter = 'none') {
  const sx = c2d(S); clear(sx);
  sx.drawImage(mask, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = fill; sx.fillRect(0, 0, S.width, S.height);
  const d = c2d(dst); d.save(); d.globalCompositeOperation = op; d.globalAlpha = alpha; d.filter = filter; d.drawImage(S, dx, dy); d.restore();
}

// CSS-style multi-stop gradient, but Gaussian-smoothed (sigma in % of the run) so no stop leaves a visible kink.
// stops: [[pos %, [r, g, b, a]], ...], interpolated premultiplied like CSS.
const pm = c => [c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]];
function sampleStops(st, x) {
  if (x <= st[0][0]) return pm(st[0][1]);
  for (let j = 0; j < st.length - 1; j++) {
    const [p0, c0] = st[j], [p1, c1] = st[j + 1];
    if (x <= p1) { const u = p1 > p0 ? (x - p0) / (p1 - p0) : 1, a = pm(c0), b = pm(c1); return a.map((v, k) => lerp(v, b[k], u)); }
  }
  return pm(st[st.length - 1][1]);
}
function smoothGradient(x, x0, x1, stops, sigma) {
  const st = stops.map(([p, c]) => [p, c]).sort((a, b) => a[0] - b[0]);
  const raw = []; for (let i = -60; i <= 160; i++) raw.push(sampleStops(st, i));
  const sg = Math.max(0.3, sigma), R = Math.ceil(sg * 3), g = x.createLinearGradient(x0, 0, x1, 0);
  for (let i = 0; i <= 100; i++) {
    const acc = [0, 0, 0, 0]; let ws = 0;
    for (let k = -R; k <= R; k++) { const w = Math.exp(-(k * k) / (2 * sg * sg)), s = raw[i + k + 60]; ws += w; for (let q = 0; q < 4; q++) acc[q] += s[q] * w; }
    const a = acc[3] / ws;
    g.addColorStop(i / 100, a > 1e-5 ? rgba([acc[0] / ws / a, acc[1] / ws / a, acc[2] / ws / a], a) : 'rgba(0,0,0,0)');
  }
  return g;
}

// ---------------------------------------------------------------- assets
const A = {};
function prepObj(img, fade = 0.26) {
  const w = img.width, h = img.height, c = mk(w, h), x = c2d(c);
  x.drawImage(img, 0, 0);
  // soft elliptical edge so no object ever shows a rectangular boundary
  x.globalCompositeOperation = 'destination-in'; x.save(); x.translate(w / 2, h / 2); x.scale(w / 2, h / 2);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, '#000');
  for (let i = 0; i <= 12; i++) { const u = i / 12; g.addColorStop(1 - fade + fade * u, `rgba(0,0,0,${(1 - smooth(u)).toFixed(4)})`); }
  x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore();
  const gc = mk(w / 4, h / 4), gx = c2d(gc); gx.filter = 'blur(10px)'; gx.drawImage(c, 0, 0, gc.width, gc.height);
  return { c, glow: gc, w, h };
}
function lumaToAlpha(img) {
  // icon_color.png is on black: alpha = brightness, colour un-premultiplied (looks identical over black, composites cleanly elsewhere)
  const w = img.width, h = img.height, c = mk(w, h), x = c2d(c, { willReadFrequently: true });
  x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const m = Math.max(p[i], p[i + 1], p[i + 2]), a = clamp((m - 5) / 250) * 255;
    if (a < 1) { p[i + 3] = 0; continue; }
    const k = 255 / Math.max(a, m); p[i] = Math.min(255, p[i] * k); p[i + 1] = Math.min(255, p[i + 1] * k); p[i + 2] = Math.min(255, p[i + 2] * k); p[i + 3] = a;
  }
  x.putImageData(d, 0, 0); return c;
}
function makeGrain() {
  const r = rng(7), tiles = [];
  for (let k = 0; k < 6; k++) {
    const s = 256, c = mk(s, s), x = c2d(c), d = x.createImageData(s, s);
    for (let i = 0; i < d.data.length; i += 4) { const v = clamp(128 + (r() + r() + r() - 1.5) * 64, 0, 255); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); tiles.push(c);
  }
  return tiles;
}

// ---------------------------------------------------------------- glow buffer (half resolution, screen-composited)
const GS = 0.5, G = mk(W * GS, H * GS), gx = c2d(G);
const gblur = px => `blur(${(px * GS).toFixed(2)}px)`;
function glowBegin() { clear(gx); gx.fillStyle = '#000'; gx.fillRect(0, 0, G.width, G.height); gx.setTransform(GS, 0, 0, GS, 0, 0); gx.globalCompositeOperation = 'screen'; }
function glowEnd(alpha = 1, uncoverX = null) {
  reset(gx);
  if (uncoverX !== null) {
    gx.globalCompositeOperation = 'multiply';
    const g = gx.createLinearGradient((uncoverX - 50) * GS, 0, (uncoverX + 50) * GS, 0); g.addColorStop(0, '#000'); g.addColorStop(1, '#fff');
    gx.fillStyle = g; gx.fillRect(0, 0, G.width, G.height); gx.globalCompositeOperation = 'source-over';
  }
  ctx.save(); reset(ctx); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = alpha; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(G, 0, 0, W, H); ctx.restore();
}
function pool(x, cx, cy, rx, ry, col, a) {
  if (a <= 0.003) return;
  x.save(); x.translate(cx, cy); x.scale(rx, ry);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (let i = 0; i <= 10; i++) { const u = i / 10; g.addColorStop(u, rgba(col, a * Math.pow(1 - smooth(u), 1.6))); }
  x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore();
}

// ---------------------------------------------------------------- D'Verse light engine (CanvasFluidLightEngine.tsx, as deployed)
const STATE_1 = { spread: 6, originLen: 69, blur: 71, brightness: 2.2 };
const STATE_3 = { spread: 73, originLen: 63, blur: 80, brightness: 1.9 };
function beam(x, px, py, cfg, alpha = 1) {
  if (alpha <= 0.003) return;
  const bw = (cfg.originLen / 100) * W, bh = (cfg.spread / 100) * W, b = clamp(cfg.brightness, 0.2, 4), r = Math.max(bw, bh) * 0.6;
  x.save(); x.globalAlpha = alpha; x.filter = gblur(cfg.blur); x.globalCompositeOperation = 'screen';
  const g = x.createRadialGradient(px, py, 0, px, py, r);
  g.addColorStop(0, `rgba(255,255,255,${Math.min(1, 0.95 * b)})`); g.addColorStop(0.3, `rgba(210,220,240,${Math.min(1, 0.65 * b)})`);
  g.addColorStop(0.65, `rgba(140,160,200,${Math.min(1, 0.3 * b)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.beginPath(); x.ellipse(px, py, bw / 2, bh / 2, Math.PI / 2, 0, Math.PI * 2); x.fill(); x.restore();
}
const PR = 24, L_TOP = W - 2 * PR, L_ARC = (Math.PI / 2) * PR, L_RIGHT = H - 2 * PR, PER = 2 * L_TOP + 4 * L_ARC + 2 * L_RIGHT;
function perimNode(dist) {
  let d = ((dist % PER) + PER) % PER;
  const arc = (a0, cx, cy) => { const a = a0 + (d / L_ARC) * (Math.PI / 2); return { x: cx + PR * Math.cos(a), y: cy + PR * Math.sin(a), nx: -Math.cos(a), ny: -Math.sin(a) }; };
  if (d < L_TOP) return { x: PR + d, y: 0, nx: 0, ny: 1 }; d -= L_TOP;
  if (d < L_ARC) return arc(-Math.PI / 2, W - PR, PR); d -= L_ARC;
  if (d < L_RIGHT) return { x: W, y: PR + d, nx: -1, ny: 0 }; d -= L_RIGHT;
  if (d < L_ARC) return arc(0, W - PR, H - PR); d -= L_ARC;
  if (d < L_TOP) return { x: W - PR - d, y: H, nx: 0, ny: -1 }; d -= L_TOP;
  if (d < L_ARC) return arc(Math.PI / 2, PR, H - PR); d -= L_ARC;
  if (d < L_RIGHT) return { x: 0, y: H - PR - d, nx: 1, ny: 0 }; d -= L_RIGHT;
  return arc(Math.PI, PR, PR);
}
function ribbon(x, prog, cfg, alpha) {
  if (alpha <= 0.003) return;
  const len = (cfg.originLen / 100) * PER * 0.35, c = prog * PER, s0 = c - len / 2, N = 40, inner = [], outer = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), n = perimNode(s0 + u * len), sp = (cfg.spread / 100) * W * 0.45 * Math.sin(u * Math.PI);
    inner.push([n.x + n.nx * sp, n.y + n.ny * sp]); outer.push([n.x - n.nx * sp * 0.15, n.y - n.ny * sp * 0.15]);
  }
  const b = clamp(cfg.brightness, 0.2, 4), cn = perimNode(c);
  x.save(); x.globalAlpha = alpha; x.filter = gblur(cfg.blur); x.globalCompositeOperation = 'screen';
  x.beginPath(); x.moveTo(...outer[0]); for (let i = 1; i < N; i++) x.lineTo(...outer[i]); for (let i = N - 1; i >= 0; i--) x.lineTo(...inner[i]); x.closePath();
  const g = x.createRadialGradient(cn.x, cn.y, 0, cn.x, cn.y, len * 0.75);
  g.addColorStop(0, `rgba(255,255,255,${Math.min(1, 0.95 * b)})`); g.addColorStop(0.35, `rgba(210,220,240,${Math.min(1, 0.65 * b)})`);
  g.addColorStop(0.7, `rgba(140,160,200,${Math.min(1, 0.3 * b)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fill();
  x.beginPath(); x.moveTo(...outer[0]); for (let i = 1; i < N; i++) x.lineTo(...outer[i]);
  for (let i = N - 1; i >= 0; i--) x.lineTo((outer[i][0] + inner[i][0]) / 2, (outer[i][1] + inner[i][1]) / 2);
  x.closePath(); x.fillStyle = `rgba(255,255,255,${Math.min(1, 0.8 * b)})`; x.fill(); x.restore();
}
// Loading ribbon: starts at the middle of the left edge, runs up and over the top at the engine's own speed
// (0.25 * 0.8 perimeters/s, corner boost 1.3) and docks at the middle of the right edge; then the 1.4 s sweep.
const R_START = 23.3;
const RIB = (() => {
  const p0 = (L_TOP + 3 * L_ARC + L_RIGHT + L_TOP + L_RIGHT / 2) / PER, pd = (L_TOP + L_ARC + L_RIGHT / 2) / PER + 1, dt = 1 / 2400, tab = [p0];
  let p = p0;
  while (p < pd) { const n = ((p % 1) + 1) % 1; p += 0.25 * 0.8 * (1 + 0.3 * 0.5 * (1 + Math.cos(n * Math.PI * 8))) * dt; tab.push(Math.min(p, pd)); }
  return { tab, dt, p0, pd, dur: (tab.length - 1) * dt };
})();
const SWEEP_T0 = R_START + RIB.dur, SWEEP_D = 1.4;
function ribbonProg(t) {
  const i = (t - R_START) / RIB.dt; if (i <= 0) return RIB.p0; if (i >= RIB.tab.length - 1) return RIB.pd;
  const k = Math.floor(i); return lerp(RIB.tab[k], RIB.tab[k + 1], i - k);
}

// ---------------------------------------------------------------- type
// A text block is laid out once; its glyph mask, clean outline (mask minus its erosion: no seams where the
// variable font's contours overlap) and top-edge catch are cached. Lighting is re-rendered only when it changes.
class TextBlock {
  constructor({ lines, size, weight = 700, track = -0.03, lh = 1.04, unit = 'word', pad = 100 }) {
    Object.assign(this, { lines, size, pad });
    this.font = `${weight} ${size}px J`; this.track = track * size;
    const m = c2d(mk(4, 4)); this.setFont(m);
    const cap = m.measureText('H').actualBoundingBoxAscent;
    this.cap = cap; this.lineH = lh * size; this.w = W;
    this.h = Math.ceil((lines.length - 1) * this.lineH + cap + 0.3 * size + 2 * pad);
    this.base = lines.map((_, i) => pad + cap + i * this.lineH);
    this.units = []; this.bands = []; this.x0s = [];
    let tx0 = W, tx1 = 0;
    lines.forEach((ln, i) => {
      const lw = m.measureText(ln).width - this.track, x0 = (W - lw) / 2;
      this.x0s.push(x0); tx0 = Math.min(tx0, x0); tx1 = Math.max(tx1, x0 + lw);
      const top = i === 0 ? 0 : this.base[i - 1] + 0.27 * size, bot = i === lines.length - 1 ? this.h : this.base[i] + 0.27 * size;
      this.bands.push([top, bot]);
      const spans = [];
      if (unit === 'char') { for (let k = 0; k < ln.length; k++) if (ln[k] !== ' ') spans.push([k, k + 1]); }
      else { const re = /\S+/g; let mm; while ((mm = re.exec(ln))) spans.push([mm.index, mm.index + mm[0].length]); }
      const xs = spans.map(([a, b]) => [x0 + m.measureText(ln.slice(0, a)).width, x0 + m.measureText(ln.slice(0, b)).width - this.track]);
      xs.forEach(([a, b], j) => {
        const left = j === 0 ? 0 : (xs[j - 1][1] + a) / 2, right = j === xs.length - 1 ? W : (b + xs[j + 1][0]) / 2;
        this.units.push({ line: i, k: this.units.length, x0: left, x1: right });
      });
    });
    this.tx0 = tx0; this.tw = tx1 - tx0;
    this.M = mk(W, this.h); const mx = c2d(this.M); this.setFont(mx); mx.fillStyle = '#fff';
    lines.forEach((ln, i) => mx.fillText(ln, this.x0s[i], this.base[i]));
    const E = mk(W, this.h), ex = c2d(E), r = Math.max(1.1, size / 95);
    ex.drawImage(this.M, 0, 0); ex.globalCompositeOperation = 'destination-in';
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; ex.drawImage(this.M, Math.cos(a) * r, Math.sin(a) * r); }
    this.R = mk(W, this.h); const rx = c2d(this.R); rx.drawImage(this.M, 0, 0); rx.globalCompositeOperation = 'destination-out'; rx.drawImage(E, 0, 0);
    this.TC = mk(W, this.h); const tc = c2d(this.TC); tc.drawImage(this.M, 0, 0); tc.globalCompositeOperation = 'source-in';
    lines.forEach((_, i) => {
      const y0 = this.base[i] - cap * 1.02, g = tc.createLinearGradient(0, y0, 0, this.base[i] + 0.22 * size);
      g.addColorStop(0, '#fff'); g.addColorStop(0.3, 'rgba(255,255,255,.33)'); g.addColorStop(0.55, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      tc.fillStyle = g; tc.fillRect(0, this.bands[i][0], W, this.bands[i][1] - this.bands[i][0]);
    });
    this.L = mk(W, this.h); this.B = mk(W, this.h); this.S = mk(W, this.h); this.T = mk(W, this.h);
    this.b4 = mk(W / 4, this.h / 4); this.b8 = mk(W / 8, this.h / 8); this.key = null;
  }
  setFont(x) { x.font = this.font; x.letterSpacing = this.track + 'px'; x.textBaseline = 'alphabetic'; x.textAlign = 'left'; }
}

// Headline material: brushed silver with a moving Gaussian hot-spot (smooth letter-to-letter falloff),
// clean rim, top catch and an amber/cyan fringe that follows the light.
const SILVER = [[0.40, '#7d879b'], [0.55, '#9ba4b8'], [0.75, '#cbd2e0'], [0.9, '#eef1f8'], [1.0, '#ffffff']].map(([b, h]) => [b, hex(h)]);
function silver(b) {
  for (let i = 0; i < SILVER.length - 1; i++) {
    const [b0, c0] = SILVER[i], [b1, c1] = SILVER[i + 1];
    if (b <= b1) { const u = clamp((b - b0) / (b1 - b0)); return c0.map((v, k) => lerp(v, c1[k], u)); }
  }
  return SILVER[SILVER.length - 1][1];
}
function litSilver(tb, p, heat = 1) {
  const key = 's' + p.toFixed(2) + '/' + heat.toFixed(3); if (tb.key === key) return; tb.key = key;
  const L = tb.L, lx = c2d(L), x0 = tb.tx0, x1 = tb.tx0 + tb.tw; clear(lx);
  const run = (fn) => { const g = lx.createLinearGradient(x0, 0, x1, 0); for (let i = 0; i <= 50; i++) { const u = i / 50; g.addColorStop(u, fn(u * 100 - p)); } return g; };
  tint(L, tb.S, tb.M, run(d => rgba(silver(0.4 + 0.6 * heat * Math.exp(-((d / 30) ** 2))), 1)), 'source-over', 1);
  tint(L, tb.S, tb.TC, '#ffffff', 'screen', 0.22);
  tint(L, tb.S, tb.R, 'rgb(220,230,255)', 'screen', 0.32);
  tint(L, tb.S, tb.M, run(d => rgba([255, 170, 70], 0.55 * heat * Math.exp(-((d / 16) ** 2)))), 'screen', 1, -2.5, 0.5, 'blur(1.4px)');
  tint(L, tb.S, tb.M, run(d => rgba([140, 215, 255], 0.5 * heat * Math.exp(-((d / 16) ** 2)))), 'screen', 1, 2, -0.5, 'blur(1.2px)');
}

// D'Verse material: the WwdcTextEffect.tsx layer stack (left-to-right light at p % of the text box), with every
// gradient Gaussian-smoothed so the light rolls off evenly across the letters.
const C = (h, a = 1) => [...hex(h), a], Z = [0, 0, 0, 0];
function litWWDC(tb, p) {
  const key = 'w' + p.toFixed(2); if (tb.key === key) return; tb.key = key;
  const L = tb.L, lx = c2d(L), x0 = tb.tx0, x1 = tb.tx0 + tb.tw, S = tb.S; clear(lx);
  const sg = (st, s = 3.5) => smoothGradient(lx, x0, x1, st, s);
  const dark = Math.min(100, p + 55), mid = Math.min(100, p + 26), bright = Math.max(0, p + 10);
  const y0 = tb.base[0] - tb.cap, body = lx.createLinearGradient(0, y0, 0, tb.base[0] + 0.05 * tb.size);
  body.addColorStop(0, '#2a2a30'); body.addColorStop(0.3, '#18181c'); body.addColorStop(0.65, '#0c0c0f'); body.addColorStop(1, '#050506');
  tint(L, S, tb.M, body, 'source-over', 1);                                                     // A dark body
  tint(L, S, tb.R, 'rgba(160,165,185,.45)', 'screen', 0.9);                                      // B edge specular (clean contour)
  tint(L, S, tb.TC, 'rgb(180,185,200)', 'screen', 0.18 * 0.85);                                  // C top-edge catch
  tint(L, S, tb.M, sg([[0, C('#ffffff')], [p, C('#ffffff')], [bright, C('#d4d7e2')], [mid, C('#484b56')], [dark, C('#121316')], [100, Z]]), 'screen', 0.95); // D illumination
  tint(L, S, tb.M, sg([[0, Z], [50, Z], [80, [160, 170, 195, 0.12]], [100, [200, 210, 230, 0.25]]]), 'screen', 0.8, 0, 0, 'drop-shadow(0 0 6px rgba(160,180,220,.2))'); // E opposite rim
  tint(L, S, tb.M, sg([[0, [255, 160, 50, 0.95]], [p, [255, 190, 80, 0.9]], [bright, [255, 180, 70, 0.25]], [mid, Z], [100, Z]]), 'screen', 0.92, -3, 0.5,
    'blur(2px) drop-shadow(-4.5px 0 9px rgba(255,165,55,.9))');                                  // F amber fringe
  tint(L, S, tb.M, sg([[0, Z], [p, [190, 235, 255, 0.3]], [bright, [140, 220, 255, 0.75]], [mid, Z], [100, Z]]), 'screen', 0.82, 2, -0.5,
    'blur(1.6px) drop-shadow(3px 0 7px rgba(100,190,255,.8))');                                   // G cyan fringe
  tint(L, S, tb.M, sg([[0, C('#ffffff')], [p, C('#ffffff')], [bright, [255, 255, 255, 0.45]], [mid, Z], [100, Z]]), 'screen', 1, 0, 0,
    'drop-shadow(0 0 4px #fff) drop-shadow(0 0 16px rgba(255,255,255,.95)) drop-shadow(0 0 36px rgba(240,245,255,.6))'); // H incandescent core
  tint(L, S, tb.M, sg([[0, C('#ffffff')], [p, C('#ffffff')], [p + 2, [255, 255, 255, 0.7]], [bright, Z], [100, Z]], 2), 'screen', 1, 0, 0, 'drop-shadow(0 0 2px #fff)'); // I apex filament
}

// Kinetic reveal: each unit (word or letter) slides inside its own line window with blur and fade.
// anim(unit) -> {dy, blur, a}. Windows are partitions of the block, so nothing is drawn twice.
function compose(tb, anim) {
  const st = tb.units.map(anim);
  if (st.every(s => s.a <= 0.002)) return null;
  if (st.every(s => s.a >= 0.999 && Math.abs(s.dy) < 0.05 && s.blur < 0.05)) return tb.L;
  const bx = c2d(tb.B), tx = c2d(tb.T); clear(bx);
  tb.bands.forEach(([y0, y1], li) => {
    clear(tx); let any = false;
    tb.units.forEach((u, k) => {
      const s = st[k]; if (u.line !== li || s.a <= 0.002) return; any = true;
      tx.save(); tx.beginPath(); tx.rect(0, y0, W, y1 - y0); tx.clip();
      tx.globalAlpha = clamp(s.a); tx.filter = s.blur > 0.1 ? `blur(${s.blur.toFixed(2)}px)` : 'none';
      const sw = u.x1 - u.x0; tx.drawImage(tb.L, u.x0, y0, sw, y1 - y0, u.x0, y0 + s.dy, sw, y1 - y0); tx.restore();
    });
    if (!any) return;
    const h = y1 - y0, f = Math.min(0.2, 9 / h), g = tx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(f, '#000'); g.addColorStop(1 - f, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    tx.globalCompositeOperation = 'destination-in'; tx.fillStyle = g; tx.fillRect(0, y0, W, h); reset(tx);
    bx.drawImage(tb.T, 0, 0);
  });
  return tb.B;
}
// Draw a composed block at y with a two-radius bloom weighted toward the light position p.
function drawBlock(tb, src, y, bloom, p, alpha = 1) {
  if (!src) return;
  ctx.save(); reset(ctx); ctx.globalAlpha = alpha; ctx.drawImage(src, 0, y); ctx.restore();
  if (bloom <= 0.003) return;
  const weight = (x, cw) => { const g = x.createLinearGradient(tb.tx0 * cw / W, 0, (tb.tx0 + tb.tw) * cw / W, 0); for (let i = 0; i <= 20; i++) { const d = (i * 5 - p) / 35; g.addColorStop(i / 20, rgba([0, 0, 0], 0.3 + 0.7 * Math.exp(-d * d))); } return g; };
  for (const [b, rad, k] of [[tb.b4, 4, 1], [tb.b8, 5, 0.7]]) {
    const x = c2d(b); clear(x); x.filter = `blur(${rad}px)`; x.drawImage(src, 0, 0, b.width, b.height); x.filter = 'none';
    x.globalCompositeOperation = 'destination-in'; x.fillStyle = weight(x, b.width); x.fillRect(0, 0, b.width, b.height);
    ctx.save(); reset(ctx); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(bloom * k * alpha); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(b, 0, y, W, tb.h); ctx.restore();
  }
}
function label(txt, { x = W / 2, y, font, color, track = 0, a = 1, blur = 0, glow = null }) {
  if (a <= 0.003) return;
  ctx.save(); reset(ctx); ctx.font = font; ctx.letterSpacing = track + 'px'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = clamp(a); if (blur > 0.1) ctx.filter = `blur(${blur.toFixed(2)}px)`;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 22; }
  ctx.fillStyle = color; ctx.fillText(txt, x + track / 2, y); ctx.restore();
}

// ---------------------------------------------------------------- objects
const OS = mk(W, H), osx = c2d(OS);
function objXform(x, o, st) {
  const sc = (st.fit === 'h' ? st.size / o.h : st.size / o.w) * st.s;
  x.translate(st.cx, st.cy); x.rotate((st.rot * Math.PI) / 180); if (st.skx) x.transform(1, 0, st.skx, 1, 0, 0); x.scale(sc, sc);
}
function drawObj(o, st) {
  if (st.a <= 0.003) return;
  ctx.save(); reset(ctx); objXform(ctx, o, st);
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(st.a * (st.glow ?? 0.5)); ctx.drawImage(o.glow, -o.w / 2, -o.h / 2, o.w, o.h);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = clamp(st.a); if (st.blur > 0.3) ctx.filter = `blur(${st.blur.toFixed(2)}px)`;
  ctx.drawImage(o.c, -o.w / 2, -o.h / 2); ctx.restore();
  if (st.sheen != null && st.sheen > 0 && st.sheen < 1) {
    // glass specular: a soft diagonal band that only lights the object's own bright surfaces
    clear(osx); objXform(osx, o, st); osx.drawImage(o.c, -o.w / 2, -o.h / 2); reset(osx);
    const sx = lerp(st.cx - 760, st.cx + 760, st.sheenDir < 0 ? 1 - st.sheen : st.sheen), g = osx.createLinearGradient(sx - 230, st.cy + 120, sx + 230, st.cy - 120);
    for (let i = 0; i <= 12; i++) { const u = i / 12, d = (u - 0.5) / 0.22; g.addColorStop(u, `rgba(255,255,255,${(0.95 * Math.exp(-d * d)).toFixed(4)})`); }
    osx.globalCompositeOperation = 'source-in'; osx.fillStyle = g; osx.fillRect(0, 0, W, H);
    ctx.save(); reset(ctx); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(st.a * 0.75 * Math.sin(Math.PI * st.sheen)); ctx.drawImage(OS, 0, 0); ctx.restore();
  }
}

// ---------------------------------------------------------------- timeline
const SC = [
  { o: 's1', kick: 'Ad-free', lines: ['Music,', 'ad-free.'], sub: 'No ads between you and the song.', t0: 5.09, sd: 2.0, fit: 'h', size: 1120, cy: 1290, enter: 'rise', tint: [110, 140, 255] },
  { o: 's5', kick: 'High-quality audio', lines: ['Hear it as', 'it was made.'], sub: 'High-quality audio, made to be heard.', t0: 7.09, sd: 3.0, fit: 'w', size: 1120, cy: 1290, enter: 'slide', tint: [120, 150, 255] },
  { o: 's2', kick: 'Custom recommendations', lines: ['Tailored', 'for you.'], sub: 'Daily mixes from what you listen to.', t0: 10.09, sd: 3.0, fit: 'h', size: 1120, cy: 1310, enter: 'fan', tint: [150, 130, 255] },
  { o: 's6', kick: 'Vibe Mix \u00b7 Windows & web', lines: ['Mix by', 'mood.'], sub: 'Generate a Vibe Mix that fits the moment.', t0: 13.09, sd: 2.0, fit: 'w', size: 1160, cy: 1290, enter: 'burst', tint: [80, 170, 255] },
  { o: 's7', kick: 'Offline \u00b7 Windows & web', lines: ['Take it', 'anywhere.'], sub: 'Save tracks and listen offline.', t0: 15.09, sd: 3.0, fit: 'w', size: 1120, cy: 1290, enter: 'drop', tint: [120, 160, 255] },
];
const CARD_T0 = 18.09, BTN = 20.09, CARD_OUT = 23.4;
const KICK_Y = 300, HEAD_Y = 450, ICON_Y = 800;
const TB = {};

function swipe(gx_, t, tc, dir, y = 1150, peak = 0.72) {
  // a thin D'Verse beam crossing the frame on the cut
  const u = inv(tc - 0.24, tc + 0.5, t); if (u <= 0 || u >= 1) return null;
  const e = inOutCubic(u), bx = dir > 0 ? lerp(-0.22 * W, 1.22 * W, e) : lerp(1.22 * W, -0.22 * W, e);
  beam(gx_, bx, y, { spread: 4, originLen: 125, blur: 42, brightness: 1.6 }, peak * Math.sin(Math.PI * u));
  return bx;
}

function introPass(t, pass) {
  if (t > 5.35) return;
  const ex = inCubic(inv(4.6, 5.22, t)), icon = A.icon;
  const e = inv(0.25, 1.4, t), sp = spring(e), eo = outExpo(e);
  const st = { cx: W / 2, cy: ICON_Y + 8 * Math.sin(t * 1.4) - 90 * ex, size: 540, fit: 'w', s: (0.7 + 0.3 * sp) * (1 + 0.035 * t / 5) * (1 + 0.55 * ex),
    rot: -14 * (1 - sp) + 1.2 * Math.sin(t * 0.7), a: clamp(eo * 1.5) * (1 - ex), blur: 24 * (1 - eo) + 34 * ex, glow: 0.55 + 0.3 * hit(t), sheen: inv(1.55, 2.45, t) };
  if (pass === 'behind') {
    pool(gx, W / 2, ICON_Y, 560, 520, [90, 120, 255], 0.30 * st.a);
    pool(gx, W / 2, 1230, 620, 220, [120, 150, 255], 0.10 * ss(0.9, 2, t) * (1 - ex));
  } else if (pass === 'main') {
    drawObj(icon, st);
    const tb = TB.intro, lp = lerp(-35, 32, outCubic(inv(0.9, 2.7, t))) + 6 * Math.sin(t * 0.6) + 90 * ex;
    litSilver(tb, lp);
    const src = compose(tb, u => {
      const d = 0.85 + 0.055 * u.k, en = outExpo(inv(d, d + 0.9, t)), x = inCubic(inv(4.55 + 0.03 * u.k, 4.95 + 0.03 * u.k, t));
      return { dy: (1 - en) * tb.size * 1.0 - x * tb.size, blur: (1 - en) * 12 + x * 14, a: clamp(en * 1.4) * (1 - x) };
    });
    drawBlock(tb, src, 1235 - tb.base[0], 0.6, lp);
    const k = outExpo(inv(1.5, 2.5, t));
    label('NOW ON WINDOWS AND ANDROID', { y: 1345 - 30 * ex, font: '600 30px J', color: '#8fb8ff', track: lerp(0.62, 0.24, k) * 30, a: k * (1 - ex), blur: (1 - k) * 6 + ex * 8, glow: 'rgba(110,160,255,.45)' });
  } else {
    // a point of light that flares open into the mark: hot core, wide bloom, anamorphic streak, one faint ring
    const u = inv(0.0, 1.15, t);
    if (u > 0 && u < 1) {
      const a = Math.sin(Math.PI * Math.pow(u, 0.45)), o = outCubic(u);
      pool(gx, W / 2, ICON_Y, 50 + 230 * o, 50 + 230 * o, [240, 245, 255], 0.8 * a);
      pool(gx, W / 2, ICON_Y, 640, 600, [110, 140, 255], 0.28 * a);
      pool(gx, W / 2, ICON_Y, 140 + 820 * o, 9 + 14 * (1 - u), [195, 218, 255], 0.85 * a);
      pool(gx, W / 2, ICON_Y, 60 + 360 * o, 3 + 5 * (1 - u), [255, 255, 255], 0.9 * a);
    }
    const u2 = inv(0.42, 1.7, t);
    if (u2 > 0 && u2 < 1) {
      gx.save(); gx.filter = gblur(3); gx.strokeStyle = rgba([175, 205, 255], 0.32 * (1 - u2) * Math.min(1, u2 * 6)); gx.lineWidth = 3 * (1 - u2) + 1;
      gx.beginPath(); gx.ellipse(W / 2, ICON_Y, 120 + 620 * outCubic(u2), 120 + 620 * outCubic(u2), 0, 0, Math.PI * 2); gx.stroke(); gx.restore();
    }
  }
}

function scenePass(k, t, pass) {
  const sc = SC[k], lt = t - sc.t0, SD = sc.sd, dir = k % 2 === 0 ? 1 : -1;
  if (lt < -0.3 || lt > SD + 0.25) return;
  if (pass === 'front') {
    const bx = swipe(gx, t, sc.t0, dir);
    return bx;
  }
  if (lt < 0) return;
  const q = SD < 2.5 ? 0.85 : 1, en = inv(0, 0.95 * q, lt), sp = spring(en), eo = outExpo(en);
  const ex = inCubic(inv(SD - 0.34, SD + 0.16, lt)), o = A[sc.o];
  const st = { cx: W / 2, cy: sc.cy, size: sc.size, fit: sc.fit, s: 1, rot: 0, skx: 0, a: 1, blur: 0, glow: 0.5 + 0.35 * hit(t) };
  switch (sc.enter) {
    case 'rise': st.cy += (1 - sp) * 240; st.s = 0.84 + 0.16 * sp; st.rot = -8 * (1 - sp); break;
    case 'slide': st.cx += dir * -(1 - sp) * 420; st.rot = 12 * (1 - sp) * -dir; st.s = 0.9 + 0.1 * sp; break;
    case 'fan': st.cy += (1 - sp) * 180; st.skx = 0.24 * (1 - sp); st.s = 0.86 + 0.14 * sp; break;
    case 'burst': st.s = 0.42 + 0.58 * sp; st.rot = -28 * (1 - sp); st.glow += 0.9 * (1 - eo); break;
    case 'drop': st.cy -= (1 - sp) * 300; st.s = 0.94 + 0.06 * sp; break;
  }
  st.cy += 10 * Math.sin(lt * 1.6 + k) - 70 * ex;
  st.rot += 1.6 * Math.sin(lt * 0.8 + k);
  st.s *= (1 + 0.05 * (lt / SD)) * (1 + 0.34 * ex) * (1 + 0.018 * hit(t));
  st.blur = 22 * (1 - eo) + 28 * ex; st.a = clamp(eo * 1.6) * (1 - ex);
  // the cut's beam passes over the glass, then (on longer scenes) one slower glint
  const su = inv(sc.t0 - 0.05, sc.t0 + 0.55, t), su2 = inv(1.15, 2.1, lt);
  if (su > 0 && su < 1) { st.sheen = su; st.sheenDir = dir; } else if (SD >= 3 && su2 > 0 && su2 < 1) { st.sheen = su2; st.sheenDir = -dir; }
  if (pass === 'behind') {
    pool(gx, st.cx, st.cy, 620 * st.s, 560 * st.s, sc.tint, (0.22 + 0.16 * hit(t)) * st.a);
    return;
  }
  drawObj(o, st);
  const tb = TB['s' + k];
  const lp = lerp(dir > 0 ? -40 : 140, dir > 0 ? 32 : 68, outCubic(inv(0, 1.5, lt))) + dir * 8 * inv(1.5, SD, lt) + dir * 90 * ex;
  litSilver(tb, lp);
  const src = compose(tb, u => {
    const d = 0.1 + 0.07 * u.k + 0.05 * u.line, e = outExpo(inv(d, d + 0.85 * q, lt));
    const xs = SD - 0.36 + 0.03 * u.k, x = inCubic(inv(xs, xs + 0.36, lt));
    return { dy: (1 - e) * tb.size * 1.02 - x * tb.size * 1.02, blur: (1 - e) * 10 + x * 10, a: clamp(e * 1.25) * (1 - x) };
  });
  drawBlock(tb, src, HEAD_Y - tb.base[0], 0.5 + 0.35 * hit(t), lp);
  const kk = outExpo(inv(0, 0.75 * q, lt)), kx = inCubic(inv(SD - 0.4, SD - 0.05, lt));
  label(sc.kick.toUpperCase(), { y: KICK_Y - 24 * kx, font: '600 30px J', color: '#8fb8ff', track: lerp(0.6, 0.24, kk) * 30, a: kk * (1 - kx), blur: (1 - kk) * 6 + kx * 8, glow: 'rgba(110,160,255,.45)' });
  const se = outExpo(inv(0.38, 0.38 + 0.7 * q, lt)), sx = inCubic(inv(SD - 0.3, SD + 0.02, lt));
  label(sc.sub, { y: HEAD_Y + tb.lineH + 110 + (1 - se) * 26 - sx * 30, font: '400 40px I', color: '#aab0bd', a: se * (1 - sx), blur: (1 - se) * 8 + sx * 8 });
}

function pill(y, w, h, style, text, st) {
  if (st.a <= 0.003) return;
  ctx.save(); reset(ctx); ctx.globalAlpha = clamp(st.a); if (st.blur > 0.2) ctx.filter = `blur(${st.blur.toFixed(2)}px)`;
  ctx.translate(W / 2, y + st.dy); ctx.scale(st.s, st.s);
  const x0 = -w / 2, y0 = -h / 2;
  ctx.beginPath(); ctx.roundRect(x0, y0, w, h, h / 2);
  if (style === 'light') {
    ctx.shadowColor = `rgba(150,185,255,${(0.32 + 0.3 * st.glow).toFixed(3)})`; ctx.shadowBlur = 60;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e3e8f2'); ctx.fillStyle = g; ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#06070b';
  } else {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, 'rgba(24,29,43,.94)'); g.addColorStop(1, 'rgba(9,11,17,.94)'); ctx.fillStyle = g; ctx.fill();
    const b = ctx.createLinearGradient(x0, 0, x0 + w, 0); b.addColorStop(0, 'rgba(70,105,180,.9)'); b.addColorStop(0.5, 'rgba(150,185,255,1)'); b.addColorStop(1, 'rgba(70,105,180,.9)');
    ctx.lineWidth = 2.5; ctx.strokeStyle = b; ctx.stroke(); ctx.fillStyle = '#f2f5fb';
  }
  ctx.font = '600 40px J'; ctx.letterSpacing = '0px'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 2);
  if (st.sheen > 0 && st.sheen < 1) {
    ctx.beginPath(); ctx.roundRect(x0, y0, w, h, h / 2); ctx.clip();
    const sx = lerp(x0 - 220, x0 + w + 220, inOutSine(st.sheen)), g = ctx.createLinearGradient(sx - 110, y0 + h, sx + 110, y0);
    for (let i = 0; i <= 10; i++) { const u = i / 10, d = (u - 0.5) / 0.25; g.addColorStop(u, `rgba(200,220,255,${(0.42 * Math.exp(-d * d)).toFixed(4)})`); }
    ctx.globalCompositeOperation = style === 'light' ? 'multiply' : 'screen';
    if (style === 'light') { const g2 = ctx.createLinearGradient(sx - 110, y0 + h, sx + 110, y0); for (let i = 0; i <= 10; i++) { const u = i / 10, d = (u - 0.5) / 0.25; g2.addColorStop(u, rgba([255 - 38 * Math.exp(-d * d), 255 - 22 * Math.exp(-d * d), 255], 1)); } ctx.fillStyle = g2; }
    else ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
  }
  ctx.restore();
}

function cardPass(t, pass) {
  const lt = t - CARD_T0; if (lt < -0.3 || t > CARD_OUT + 0.9) return;
  if (pass === 'front') { swipe(gx, t, CARD_T0, -1); return; }
  if (lt < 0) return;
  const X = d => inCubic(inv(CARD_OUT + d, CARD_OUT + d + 0.55, t));
  const ie = inv(0.25, 1.3, lt), isp = spring(ie), ieo = outExpo(ie), ix = X(0.06);
  const ist = { cx: W / 2, cy: 905 + 8 * Math.sin(lt * 1.5) - 80 * ix, size: 360, fit: 'w', s: (0.6 + 0.4 * isp) * (1 + 0.025 * hit(t)) * (1 + 0.3 * ix), rot: 10 * (1 - isp),
    a: clamp(ieo * 1.5) * (1 - ix), blur: 18 * (1 - ieo) + 22 * ix, glow: 0.6 + 0.4 * hit(t), sheen: inv(1.25, 2.05, lt), sheenDir: 1 };
  if (pass === 'behind') { pool(gx, W / 2, 905, 520, 460, [95, 125, 255], 0.28 * ist.a * (1 + 0.5 * hit(t))); pool(gx, W / 2, 1265, 640, 300, [110, 150, 255], 0.10 * ss(BTN, BTN + 0.8, t) * (1 - X(0.1))); return; }
  drawObj(A.icon, ist);
  const tb = TB.card, lp = lerp(140, 64, outCubic(inv(0, 1.6, lt))) - 10 * inv(1.6, 5, lt) - 90 * X(0);
  litSilver(tb, lp);
  const src = compose(tb, u => {
    const d = 0.08 + 0.045 * u.k, e = outExpo(inv(d, d + 0.85, lt)), x = inCubic(inv(CARD_OUT + 0.02 * u.k, CARD_OUT + 0.4 + 0.02 * u.k, t));
    return { dy: (1 - e) * tb.size * 1.02 - x * tb.size * 1.02, blur: (1 - e) * 10 + x * 10, a: clamp(e * 1.3) * (1 - x) };
  });
  drawBlock(tb, src, 470 - tb.base[0], 0.55 + 0.35 * hit(t), lp);
  [['light', 'Windows \u00b7 Microsoft Store', 1185, 0], ['dark', 'Android \u00b7 Google Play', 1345, 1]].forEach(([style, text, y, j]) => {
    const pe = inv(BTN + 0.12 * j, BTN + 0.12 * j + 0.9, t), psp = spring(pe), peo = outExpo(pe), px = X(0.12 + 0.05 * j);
    pill(y, 800, 124, style, text, { a: clamp(peo * 1.4) * (1 - px), dy: (1 - psp) * 70 - 60 * px, s: (0.9 + 0.1 * psp) * (1 + 0.012 * hit(t)), blur: 10 * (1 - peo) + 12 * px,
      glow: hit(t), sheen: inv(BTN + 1.0 + 0.25 * j, BTN + 1.9 + 0.25 * j, t) });
  });
  const se = outExpo(inv(BTN + 0.5, BTN + 1.2, t)), sx = X(0.2);
  label('Search \u201cD\'Tunes\u201d in either store.', { y: 1510 + (1 - se) * 24 - 30 * sx, font: '400 40px I', color: '#aab0bd', a: se * (1 - sx), blur: (1 - se) * 8 + sx * 8 });
}

// D'Verse ending: the deployed D'Verse page, beat for beat. The loading ribbon runs the frame edge, docks on the
// right, sweeps right-to-left over 1.4 s (quadratic in-out, beam widening STATE_1 -> STATE_3) uncovering the type,
// then rests at the left edge.
function endState(t) {
  const prog = inv(SWEEP_T0, SWEEP_T0 + SWEEP_D, t), e = inOutQuad(prog);
  const cfg = {}; for (const k in STATE_3) cfg[k] = lerp(STATE_1[k], STATE_3[k], e);
  const tb = TB.end, bxp = (100 - e * 100) / 100 * W, cw = tb.tw + 48, cx0 = tb.tx0 - 24;
  const pb = ((bxp - cx0) / cw) * 100;
  return { prog, e, cfg, bxp, p: t < SWEEP_T0 ? 100 : smax(pb, 18, 12), cw, cx0 };
}
function endPass(t, pass) {
  if (t < R_START - 0.05) return;
  const s = endState(t), tb = TB.end, ty = 960 - (tb.base[0] - tb.cap / 2);
  const shown = t >= SWEEP_T0, uncover = s.prog < 1 ? s.bxp : null;
  if (pass === 'behind') {
    if (!shown) return;
    // WwdcTextEffect halos: amber / white core / cyan around the light, plus the opposite-side ambient glow
    const hx = pc => s.cx0 + (pc / 100) * s.cw, hy = 960;
    const halo = (pc, w, h, stops, blur, op) => {
      gx.save(); gx.filter = gblur(blur); gx.globalAlpha = op; gx.translate(hx(pc), hy); gx.scale(w / 2, h / 2);
      const g = gx.createRadialGradient(0, 0, 0, 0, 0, Math.SQRT2); for (const [u, c] of stops) g.addColorStop(u, c);
      gx.fillStyle = g; gx.beginPath(); gx.arc(0, 0, 1, 0, Math.PI * 2); gx.fill(); gx.restore();
    };
    const p = s.p, vw = W / 100, cl = (a, v, b) => clamp(v, a, b);
    halo(p + 1.5, cl(320, 40 * vw, 720), cl(240, 30 * vw, 540), [[0, 'rgba(255,180,60,.35)'], [0.35, 'rgba(255,145,30,.2)'], [0.7, 'rgba(255,145,30,0)'], [1, 'rgba(0,0,0,0)']], 38, 0.9);
    halo(p, cl(220, 28 * vw, 520), cl(160, 22 * vw, 400), [[0, 'rgba(255,255,255,.6)'], [0.3, 'rgba(255,250,240,.4)'], [0.7, 'rgba(255,250,240,0)'], [1, 'rgba(0,0,0,0)']], 26, 0.95);
    halo(p - 1.5, cl(260, 32 * vw, 580), cl(180, 24 * vw, 440), [[0, 'rgba(100,190,255,.2)'], [0.35, 'rgba(80,160,255,.12)'], [0.65, 'rgba(80,160,255,0)'], [1, 'rgba(0,0,0,0)']], 34, 0.85);
    halo(88, cl(240, 30 * vw, 500), cl(160, 20 * vw, 360), [[0, 'rgba(200,210,235,.1)'], [0.4, 'rgba(150,165,195,.06)'], [0.75, 'rgba(150,165,195,0)'], [1, 'rgba(0,0,0,0)']], 40, 0.8);
    return uncover;
  }
  if (pass === 'main') {
    if (!shown) return;
    litWWDC(tb, s.p);
    const push = 1 + 0.018 * ss(SWEEP_T0, 30.09, t);
    let src = tb.L;
    if (uncover !== null) {
      const T = tb.T, x = c2d(T); clear(x); x.drawImage(tb.L, 0, 0); x.globalCompositeOperation = 'destination-in';
      const g = x.createLinearGradient(uncover - 40, 0, uncover + 40, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, W, tb.h); src = T;
    }
    ctx.save(); reset(ctx); ctx.translate(W / 2, 960); ctx.scale(push, push); ctx.translate(-W / 2, -960); ctx.drawImage(src, 0, ty); ctx.restore();
    return;
  }
  // front: the light itself
  if (t < SWEEP_T0) ribbon(gx, ribbonProg(t), STATE_1, ss(R_START, R_START + 0.45, t));
  else if (s.prog < 1) beam(gx, s.bxp, H * 0.5, s.cfg);
  else beam(gx, 0, H * 0.5, STATE_3);
}

// ---------------------------------------------------------------- frame
let grain = null;
function drawBG(t) {
  reset(ctx); ctx.fillStyle = '#040406'; ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, H * 0.62); v.addColorStop(0, '#08080e'); v.addColorStop(1, '#040406');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  const pa = (1 - ss(23.3, 24.4, t)) * (0.8 + 0.3 * hit(t));
  if (pa > 0.003) {
    const z = 1.16 + 0.04 * Math.sin(t * 0.21), pw = W * z, ph = H * z;
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(pa);
    ctx.drawImage(A.plate, (W - pw) * (0.5 + 0.3 * Math.sin(t * 0.23)), (H - ph) * (0.5 - 0.3 * Math.cos(t * 0.19)), pw, ph); ctx.restore();
  }
}
function frame(i) {
  const t = i / FPS;
  drawBG(t);
  glowBegin(); introPass(t, 'behind'); for (let k = 0; k < 5; k++) scenePass(k, t, 'behind'); cardPass(t, 'behind');
  const unc = endPass(t, 'behind'); glowEnd(1, unc ?? null);
  introPass(t, 'main'); for (let k = 0; k < 5; k++) scenePass(k, t, 'main'); cardPass(t, 'main'); endPass(t, 'main');
  glowBegin(); introPass(t, 'front'); for (let k = 0; k < 5; k++) scenePass(k, t, 'front'); cardPass(t, 'front'); endPass(t, 'front'); glowEnd(1);
  // fine grain (soft-light, so blacks stay black): just enough to dither the long glow gradients
  ctx.save(); reset(ctx); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.08;
  const r = rng(1000 + i), tile = grain[i % grain.length], ox = Math.floor(r() * 256), oy = Math.floor(r() * 256);
  ctx.translate(-ox, -oy); ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, W + 256, H + 256); ctx.restore();
  const fade = Math.min(ss(0, 0.35, t), 1 - inOutSine(inv(29.35, DUR, t)));
  if (fade < 0.999) { reset(ctx); ctx.fillStyle = `rgba(0,0,0,${(1 - fade).toFixed(4)})`; ctx.fillRect(0, 0, W, H); }
}

// ---------------------------------------------------------------- boot
async function boot() {
  const fj = new FontFace('J', 'url(PlusJakartaSansVar.woff2)', { weight: '200 800' });
  const fi = new FontFace('I', 'url(Inter.ttf)', { weight: '100 900' });
  await Promise.all([fj.load(), fi.load()]); document.fonts.add(fj); document.fonts.add(fi);
  const img = async n => { const im = new Image(); im.src = n; await im.decode(); return im; };
  const [s1, s2, s5, s6, s7, icon, plate] = await Promise.all(['s1.webp', 's2.webp', 's5.webp', 's6.webp', 's7.webp', 'icon_color.png', 'bplate_phone.png'].map(img));
  Object.assign(A, { s1: prepObj(s1), s2: prepObj(s2), s5: prepObj(s5), s6: prepObj(s6), s7: prepObj(s7), icon: prepObj(lumaToAlpha(icon), 0.12), plate });
  grain = makeGrain();
  TB.intro = new TextBlock({ lines: ["D'Tunes"], size: 160, weight: 800, track: -0.035, unit: 'char' });
  SC.forEach((sc, k) => { TB['s' + k] = new TextBlock({ lines: sc.lines, size: 124, weight: 700, track: -0.03, unit: 'word' }); });
  TB.card = new TextBlock({ lines: ['Get', "D'Tunes."], size: 146, weight: 800, track: -0.035, unit: 'char' });
  TB.end = new TextBlock({ lines: ["D'Verse"], size: 208, weight: 800, track: -0.04, unit: 'word', pad: 120 });
  window.renderFrame = i => { frame(i); return new Promise(r => requestAnimationFrame(() => r(true))); };
  window.NF = NF; window.SWEEP_T0 = SWEEP_T0; window.__ready = true;
  const q = new URLSearchParams(location.search);
  if (q.has('t')) frame(Math.round(parseFloat(q.get('t')) * FPS));
}
boot().catch(e => { window.__error = String(e && e.stack || e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:red;position:fixed;top:0">${window.__error}</pre>`); });
