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
const outCubic = u => 1 - Math.pow(1 - u, 3);
const inOutQuad = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const inOutSine = u => -(Math.cos(Math.PI * u) - 1) / 2;
// anticipation (back) curves: c sets how far they pull back / overshoot
const inBack = (u, c = 1.70158) => (c + 1) * u * u * u - c * u * u;
const outBack = (u, c = 1.70158) => 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
const inOutBack = (u, c = 1.0) => {
  const k = c * 1.525;
  return u < 0.5 ? (Math.pow(2 * u, 2) * ((k + 1) * 2 * u - k)) / 2 : (Math.pow(2 * u - 2, 2) * ((k + 1) * (2 * u - 2) + k) + 2) / 2;
};
// damped spring: settles 0 -> 1 with one soft overshoot
const spring = (u, f = 0.95, z = 6.8) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.exp(-z * u) * Math.cos(2 * Math.PI * f * u));
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k); return lerp(b, a, h) - k * h * (1 - h); };
const smax = (a, b, k) => -smin(-a, -b, k);
// half of a 180-degree shutter at 24 fps: motion blur integrates over [t - SH, t + SH]
const SH = 1 / 96;

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
  if (fade > 0) {
    // soft elliptical edge so no object ever shows a rectangular boundary
    x.globalCompositeOperation = 'destination-in'; x.save(); x.translate(w / 2, h / 2); x.scale(w / 2, h / 2);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, '#000');
    for (let i = 0; i <= 12; i++) { const u = i / 12; g.addColorStop(1 - fade + fade * u, `rgba(0,0,0,${(1 - smooth(u)).toFixed(4)})`); }
    x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore();
  }
  const gc = mk(w / 4, h / 4), gx = c2d(gc); gx.filter = 'blur(10px)'; gx.drawImage(c, 0, 0, gc.width, gc.height);
  return { c, glow: gc, w, h };
}
function lumaToAlpha(img) {
  // icon_color.png is on black with faint compression noise around the mark. alpha = brightness with a soft
  // floor that drops the noise (it otherwise shows as a disc behind the logo); colour un-premultiplied.
  const w = img.width, h = img.height, c = mk(w, h), x = c2d(c, { willReadFrequently: true });
  x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const m = Math.max(p[i], p[i + 1], p[i + 2]), a = m * smooth(inv(12, 26, m));
    if (a < 1) { p[i + 3] = 0; continue; }
    const k = 255 / m; p[i] *= k; p[i + 1] *= k; p[i + 2] *= k; p[i + 3] = a;
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
// (0.25 * 0.8 perimeters/s, corner boost 1.3) and eases to a stop at the middle of the right edge. The beam
// takes over there at rest, so the sweep's slow-in starts from the ribbon's slow-out.
const R_START = 23.3;
const RIB = (() => {
  const p0 = (L_TOP + 3 * L_ARC + L_RIGHT + L_TOP + L_RIGHT / 2) / PER, pd = (L_TOP + L_ARC + L_RIGHT / 2) / PER + 1, dt = 1 / 2400, tab = [p0];
  let p = p0;
  while (p < pd) { const n = ((p % 1) + 1) % 1; p += 0.25 * 0.8 * (1 + 0.3 * 0.5 * (1 + Math.cos(n * Math.PI * 8))) * dt; tab.push(Math.min(p, pd)); }
  return { tab, dt, p0, pd, dur: (tab.length - 1) * dt };
})();
// time warp: engine speed for the first 62 %, then a quadratic slow-out into the dock
const RIB_A = 0.62, RIB_V = 1 / (RIB_A + (1 - RIB_A) / 2), RIB_D = RIB.dur * RIB_V;
const T_DOCK = R_START + RIB_D, SWEEP_T0 = T_DOCK + 0.05, SWEEP_D = 1.4;
function ribbonProg(t) {
  const u = inv(R_START, T_DOCK, t);
  const w = u <= RIB_A ? RIB_V * u : RIB_V * RIB_A + RIB_V * (u - RIB_A) - (RIB_V * (u - RIB_A) ** 2) / (2 * (1 - RIB_A));
  const i = clamp(w) * (RIB.tab.length - 1), k = Math.min(RIB.tab.length - 2, Math.floor(i));
  return lerp(RIB.tab[k], RIB.tab[k + 1], i - k);
}

// ---------------------------------------------------------------- type
// A text block is laid out once; its glyph mask, clean outline (mask minus its erosion: no seams where the
// variable font's contours overlap) and top-edge catch are cached. Lighting is re-rendered only when it changes.
class TextBlock {
  constructor({ lines, size, weight = 700, track = -0.03, lh = 1.1, unit = 'word', pad = 100 }) {
    Object.assign(this, { lines, size, pad });
    this.font = `${weight} ${size}px J`; this.track = track * size;
    const m = c2d(mk(4, 4)); this.setFont(m);
    const cap = m.measureText('H').actualBoundingBoxAscent;
    this.cap = cap; this.lineH = lh * size; this.w = W;
    this.h = Math.ceil((lines.length - 1) * this.lineH + cap + 0.3 * size + 2 * pad);
    this.base = lines.map((_, i) => pad + cap + i * this.lineH);
    this.units = []; this.bands = []; this.x0s = []; this.chars = [];
    let tx0 = W, tx1 = 0;
    lines.forEach((ln, i) => {
      const lw = m.measureText(ln).width - this.track, x0 = (W - lw) / 2;
      this.x0s.push(x0); tx0 = Math.min(tx0, x0); tx1 = Math.max(tx1, x0 + lw);
      this.chars.push([...ln].map((_, k) => [x0 + m.measureText(ln.slice(0, k)).width, x0 + m.measureText(ln.slice(0, k + 1)).width - this.track]));
      const top = i === 0 ? 0 : this.base[i - 1] + 0.25 * size, bot = i === lines.length - 1 ? this.h : this.base[i] + 0.25 * size;
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
  // position of x as % of the text run (the coordinate every lighting gradient uses)
  pct(x) { return ((x - this.tx0) / this.tw) * 100; }
}

// Headline material: light brushed silver at rest. A single specular band (p = its centre, % of the run)
// crosses the type once, left to right, carrying the bloom and a thin amber/cyan fringe with it.
const SILVER = [[0, '#a7afc0'], [0.45, '#cfd5e1'], [0.75, '#edf0f6'], [1.0, '#ffffff']].map(([b, h]) => [b, hex(h)]);
function silver(b) {
  for (let i = 0; i < SILVER.length - 1; i++) {
    const [b0, c0] = SILVER[i], [b1, c1] = SILVER[i + 1];
    if (b <= b1) { const u = clamp((b - b0) / (b1 - b0)); return c0.map((v, k) => lerp(v, c1[k], u)); }
  }
  return SILVER[SILVER.length - 1][1];
}
const SWEEP_SIGMA = 20;
const sweepP = (t, t0, d = 1.25) => lerp(-60, 160, inOutSine(inv(t0, t0 + d, t)));
function litSilver(tb, p) {
  const key = 's' + p.toFixed(2); if (tb.key === key) return; tb.key = key;
  const L = tb.L, lx = c2d(L), x0 = tb.tx0, x1 = tb.tx0 + tb.tw; clear(lx);
  const run = (fn) => { const g = lx.createLinearGradient(x0, 0, x1, 0); for (let i = 0; i <= 60; i++) { const u = i / 60; g.addColorStop(u, fn(u * 100 - p)); } return g; };
  const band = (d, s = SWEEP_SIGMA) => Math.exp(-((d / s) ** 2));
  tint(L, tb.S, tb.M, run(d => rgba(silver(band(d)), 1)), 'source-over', 1);
  tint(L, tb.S, tb.TC, '#ffffff', 'screen', 0.2);
  tint(L, tb.S, tb.R, 'rgb(225,232,255)', 'screen', 0.24);
  if (p > -45 && p < 145) {
    tint(L, tb.S, tb.M, run(d => rgba([255, 172, 80], 0.45 * band(d + 4, 11))), 'screen', 1, -2, 0.5, 'blur(1.2px)');
    tint(L, tb.S, tb.M, run(d => rgba([150, 215, 255], 0.42 * band(d - 4, 11))), 'screen', 1, 2, -0.5, 'blur(1.2px)');
  }
}

// D'Verse material: the WwdcTextEffect.tsx layer stack, lit by letter: full light through the first `e`,
// the falloff carried entirely across the `r`, and `s`, `e` left as plain unlit type.
const C = (h, a = 1) => [...hex(h), a], Z = [0, 0, 0, 0];
function litDVerse(tb) {
  if (tb.key === 'dv') return; tb.key = 'dv';
  const L = tb.L, lx = c2d(L), x0 = tb.tx0, x1 = tb.tx0 + tb.tw, S = tb.S; clear(lx);
  const ch = tb.chars[0], e1 = tb.pct(ch[3][1]), r0 = tb.pct(ch[4][0]), r1 = tb.pct(ch[4][1]), rm = (r0 + r1) / 2, rw = r1 - r0;
  const sg = (st, s = 1.6) => smoothGradient(lx, x0, x1, st, s);
  const y0 = tb.base[0] - tb.cap, body = lx.createLinearGradient(0, y0, 0, tb.base[0] + 0.05 * tb.size);
  body.addColorStop(0, '#2a2a30'); body.addColorStop(0.3, '#18181c'); body.addColorStop(0.65, '#0c0c0f'); body.addColorStop(1, '#050506');
  tint(L, S, tb.M, body, 'source-over', 1);                                                     // A dark body
  tint(L, S, tb.R, 'rgba(160,165,185,.45)', 'screen', 0.9);                                      // B edge specular (clean contour)
  tint(L, S, tb.TC, 'rgb(180,185,200)', 'screen', 0.18 * 0.85);                                  // C top-edge catch
  tint(L, S, tb.M, sg([[0, C('#ffffff')], [r0, C('#ffffff')], [rm, C('#9da1ae')], [r1, C('#5c606c')], [100, C('#565a66')]]), 'screen', 0.95); // D illumination
  tint(L, S, tb.M, sg([[0, Z], [r1, Z], [100, [190, 200, 225, 0.1]]], 4), 'screen', 0.8);       // E opposite rim
  tint(L, S, tb.M, sg([[0, [255, 160, 50, 0.95]], [e1, [255, 190, 80, 0.9]], [rm, [255, 180, 70, 0.2]], [r1, Z], [100, Z]]), 'screen', 0.92, -3, 0.5,
    'blur(2px) drop-shadow(-4.5px 0 9px rgba(255,165,55,.9))');                                  // F amber fringe
  tint(L, S, tb.M, sg([[0, Z], [e1 - 10, [190, 235, 255, 0.3]], [r0 + 0.25 * rw, [140, 220, 255, 0.75]], [r1, Z], [100, Z]]), 'screen', 0.82, 2, -0.5,
    'blur(1.6px) drop-shadow(3px 0 7px rgba(100,190,255,.8))');                                   // G cyan fringe
  tint(L, S, tb.M, sg([[0, C('#ffffff')], [e1 - 2, C('#ffffff')], [r0, [255, 255, 255, 0.55]], [rm, Z], [100, Z]]), 'screen', 1, 0, 0,
    'drop-shadow(0 0 4px #fff) drop-shadow(0 0 16px rgba(255,255,255,.95)) drop-shadow(0 0 36px rgba(240,245,255,.6))'); // H incandescent core
  tint(L, S, tb.M, sg([[0, C('#ffffff')], [e1 - 3, C('#ffffff')], [e1, [255, 255, 255, 0.7]], [r0 + 0.4 * rw, Z], [100, Z]]), 'screen', 1, 0, 0, 'drop-shadow(0 0 2px #fff)'); // I apex filament
}

// Kinetic type: each unit (word or letter) moves inside its own line window. anim(unit, t) -> {dy, a}.
// Fast moves are integrated over the shutter (motion blur) instead of being Gaussian-blurred.
function compose(tb, anim, t) {
  const st = tb.units.map(u => {
    const s = anim(u, t), d = Math.abs(anim(u, t + SH).dy - anim(u, t - SH).dy);
    s.n = clamp(Math.ceil(d / 2.5), 1, 10); return s;
  });
  if (st.every(s => s.a <= 0.002)) return null;
  if (st.every(s => s.a >= 0.999 && Math.abs(s.dy) < 0.05 && s.n === 1)) return tb.L;
  const bx = c2d(tb.B), tx = c2d(tb.T); clear(bx);
  tb.bands.forEach(([y0, y1], li) => {
    clear(tx); let any = false;
    tb.units.forEach((u, k) => {
      const s = st[k]; if (u.line !== li || s.a <= 0.002) return; any = true;
      tx.save(); tx.beginPath(); tx.rect(0, y0, W, y1 - y0); tx.clip();
      const sw = u.x1 - u.x0, put = (dy, a) => { tx.globalAlpha = clamp(a); tx.drawImage(tb.L, u.x0, y0, sw, y1 - y0, u.x0, y0 + dy, sw, y1 - y0); };
      if (s.n === 1) put(s.dy, s.a);
      else { tx.globalCompositeOperation = 'lighter'; for (let i = 0; i < s.n; i++) { const si = anim(u, t - SH + (2 * SH * (i + 0.5)) / s.n); put(si.dy, si.a / s.n); } }
      tx.restore();
    });
    if (!any) return;
    const h = y1 - y0, f = Math.min(0.2, 6 / h), g = tx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(f, '#000'); g.addColorStop(1 - f, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    tx.globalCompositeOperation = 'destination-in'; tx.fillStyle = g; tx.fillRect(0, y0, W, h); reset(tx);
    bx.drawImage(tb.T, 0, 0);
  });
  return tb.B;
}
// Draw a composed block at y. The bloom exists only where the specular band is (none at rest).
function drawBlock(tb, src, y, bloom, p, alpha = 1) {
  if (!src) return;
  ctx.save(); reset(ctx); ctx.globalAlpha = alpha; ctx.drawImage(src, 0, y); ctx.restore();
  if (bloom <= 0.003 || p < -45 || p > 145) return;
  const weight = (x, cw) => { const g = x.createLinearGradient(tb.tx0 * cw / W, 0, (tb.tx0 + tb.tw) * cw / W, 0); for (let i = 0; i <= 25; i++) { const d = (i * 4 - p) / (SWEEP_SIGMA * 1.1); g.addColorStop(i / 25, rgba([0, 0, 0], Math.exp(-d * d))); } return g; };
  for (const [b, rad, k] of [[tb.b4, 4, 1], [tb.b8, 5, 0.7]]) {
    const x = c2d(b); clear(x); x.filter = `blur(${rad}px)`; x.drawImage(src, 0, 0, b.width, b.height); x.filter = 'none';
    x.globalCompositeOperation = 'destination-in'; x.fillStyle = weight(x, b.width); x.fillRect(0, 0, b.width, b.height);
    ctx.save(); reset(ctx); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(bloom * k * alpha); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(b, 0, y, W, tb.h); ctx.restore();
  }
}
// A single line of plain type, motion-blurred the same way. f(t) -> {dy, a, track}.
const LB = mk(W, 240), lbx = c2d(LB), LB_BASE = 160;
function label(txt, { y, font, color }, f, t) {
  const s = f(t); if (s.a <= 0.003 && f(t - SH).a <= 0.003 && f(t + SH).a <= 0.003) return;
  const n = clamp(Math.ceil(Math.abs(f(t + SH).dy - f(t - SH).dy) / 2.5), 1, 10);
  clear(lbx); lbx.font = font; lbx.textAlign = 'center'; lbx.textBaseline = 'alphabetic'; lbx.fillStyle = color;
  if (n > 1) lbx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const si = n === 1 ? s : f(t - SH + (2 * SH * (i + 0.5)) / n), tr = si.track ?? 0;
    lbx.letterSpacing = tr + 'px'; lbx.globalAlpha = clamp(si.a) / n; lbx.fillText(txt, W / 2 + tr / 2, LB_BASE + si.dy);
  }
  ctx.save(); reset(ctx); ctx.drawImage(LB, 0, y - LB_BASE); ctx.restore();
}
// Shared unit choreography: rise in on a spring, leave upward with a small anticipation dip.
function unitIn(t, d, size, dur = 0.7) {
  const u = inv(d, d + dur, t);
  return { dy: (1 - spring(u)) * size * 1.02, a: clamp(u * 3) };
}
function unitOut(t, d, size, dur = 0.38) {
  const u = inv(d, d + dur, t);
  return { dy: -inBack(u, 1.6) * size * 1.05, a: 1 - smooth(inv(0.4, 1, u)) };
}
const mix = (i, o) => ({ dy: i.dy + o.dy, a: i.a * o.a });

// ---------------------------------------------------------------- objects
// Every feature object lives on one timeline of poses: hidden in the logo, parked out of focus at its own spot
// on the edge of frame, or centre stage. Moves between poses run along arcs with anticipation and overshoot;
// size lags position (follow-through), velocity stretches the object along its path and banks it into turns.
const OS = mk(W, H), osx = c2d(OS);
const ICON_Y = 800, STAGE_Y = 1300, BURST = 3.2, CARD_T0 = 18.09, CARD_Y = 860;
const SCN = [5.09, 7.09, 10.09, 12.42, 15.09];
const OBJS = [
  { id: 's1', fit: 'h', big: 1040, spot: [70, 1000, 430, -9], bend: -0.2 },
  { id: 's5', fit: 'w', big: 1060, spot: [1015, 1070, 460, 8], bend: 0.25 },
  { id: 's2', fit: 'h', big: 1040, spot: [80, 1650, 430, 8], bend: 0.2 },
  { id: 's6', fit: 'w', big: 1060, spot: [1000, 1660, 470, -7], bend: -0.2 },
  { id: 's7', fit: 'w', big: 1040, spot: [1000, 170, 440, 6], bend: -0.22 },
];
const POSE = (x, y, size, o = {}) => ({ x, y, size, rot: 0, a: 1, dof: 0, c: 0, ...o });
OBJS.forEach((o, j) => {
  const [sx, sy, ssz, srot] = o.spot, spot = POSE(sx, sy, ssz, { rot: srot, a: 0.55, dof: 5 }), centre = POSE(W / 2, STAGE_Y, o.big, { c: 1 });
  const origin = POSE(W / 2, ICON_Y, 50, { a: 0, rot: j % 2 ? 32 : -32 }), segs = [];
  if (j === 0) segs.push({ t0: BURST, t1: BURST + 1.15, A: origin, B: centre, bend: 0.2, kind: 'burst' });
  else segs.push({ t0: BURST + 0.04 * j, t1: BURST + 0.04 * j + 0.95, A: origin, B: spot, bend: j % 2 ? 0.32 : -0.32, kind: 'burst' });
  if (j > 0) segs.push({ t0: SCN[j] - 0.22, t1: SCN[j] + 0.62, A: spot, B: centre, bend: o.bend, kind: 'travel' });
  if (j < 4) segs.push({ t0: SCN[j + 1] - 0.3, t1: SCN[j + 1] + 0.5, A: centre, B: spot, bend: -o.bend, kind: 'travel' });
  const t0 = j === 4 ? CARD_T0 + 0.16 : CARD_T0 + 0.04 * j;
  segs.push({ t0, t1: t0 + 0.6, A: j === 4 ? centre : spot, B: POSE(W / 2, CARD_Y, 36, { a: 0, rot: j % 2 ? -40 : 40 }), bend: j % 2 ? 0.25 : -0.25, kind: 'implode' });
  o.segs = segs;
  o.arrive = j === 0 ? BURST + 1.15 : SCN[j] + 0.62;
});
function segPose(s, t) {
  const u = inv(s.t0, s.t1, t), A_ = s.A, B = s.B;
  let e, es, ef, a, dof, pop = 1;
  if (s.kind === 'burst') {
    // thrown out sharp and bright, then racked out of focus as it parks
    e = outBack(u, 1.25); es = outBack(inv(0, 0.9, u), 0.9); ef = smooth(inv(0, 0.35, u));
    const park = smooth(inv(0.5, 1, u));
    a = lerp(A_.a, lerp(1, B.a, park), smooth(inv(0, 0.18, u))); dof = B.dof * park;
    if (B.c < 0.5) pop = 1 + 0.3 * Math.sin(Math.PI * clamp(u / 0.85));
  } else if (s.kind === 'travel') { e = inOutBack(u, 1.0); es = inOutBack(clamp((u - 0.1) / 0.9), 0.8); ef = smooth(u); }
  else { e = inBack(u, 1.5); es = inBack(u, 0.8); ef = smooth(inv(0.55, 1, u)); }
  const dx = B.x - A_.x, dy = B.y - A_.y, cx = (A_.x + B.x) / 2 - dy * s.bend, cy = (A_.y + B.y) / 2 + dx * s.bend, q = 1 - e;
  return {
    x: q * q * A_.x + 2 * q * e * cx + e * e * B.x, y: q * q * A_.y + 2 * q * e * cy + e * e * B.y,
    size: Math.max(1, lerp(A_.size, B.size, es) * pop), rot: lerp(A_.rot, B.rot, es),
    a: a ?? lerp(A_.a, B.a, ef), dof: dof ?? lerp(A_.dof, B.dof, ef), c: lerp(A_.c, B.c, ef),
  };
}
function poseOf(j, t) {
  const segs = OBJS[j].segs; let p = { ...segs[0].A };
  for (const s of segs) { if (t < s.t0) break; p = t <= s.t1 ? segPose(s, t) : { ...s.B }; }
  // secondary action: centre stage floats and sways, parked objects drift slowly
  const c = p.c, ph = j * 1.9;
  p.y += c * 10 * Math.sin(t * 1.5 + ph); p.rot += c * 1.3 * Math.sin(t * 0.75 + ph);
  p.x += (1 - c) * 10 * Math.sin(t * 0.33 + ph); p.y += (1 - c) * 14 * Math.sin(t * 0.27 + ph * 1.3);
  return p;
}
function xform(x, im, fit, p, vx, vy) {
  const v = Math.hypot(vx, vy), st = 1 + clamp(v / 16000, 0, 0.12), ang = Math.atan2(vy, vx), lean = clamp(vx / 260, -8, 8);
  x.translate(p.x, p.y);
  if (st > 1.001) { x.rotate(ang); x.scale(st, 1 / Math.sqrt(st)); x.rotate(-ang); }
  x.rotate(((p.rot + lean) * Math.PI) / 180);
  const sc = p.size / (fit === 'h' ? im.h : im.w); x.scale(sc, sc);
}
function drawPose(x, o, j, t, k, op) {
  const p = poseOf(j, t); if (p.a <= 0.002) return;
  const a = poseOf(j, t - SH), b = poseOf(j, t + SH), im = A[o.id];
  const vx = (b.x - a.x) / (2 * SH), vy = (b.y - a.y) / (2 * SH);
  x.save(); reset(x); xform(x, im, o.fit, p, vx, vy);
  if (p.c > 0.01) { x.globalCompositeOperation = op === 'lighter' ? 'lighter' : 'screen'; x.globalAlpha = clamp(p.a * p.c * 0.22 * k); x.drawImage(im.glow, -im.w / 2, -im.h / 2, im.w, im.h); }
  x.globalCompositeOperation = op; x.globalAlpha = clamp(p.a * k);
  if (p.dof > 0.3) x.filter = `blur(${p.dof.toFixed(2)}px)`;
  x.drawImage(im.c, -im.w / 2, -im.h / 2); x.restore();
}
function glint(o, j, t, u) {
  // one soft specular pass across the glass after the object lands, only on its own bright surfaces
  const p = poseOf(j, t), im = A[o.id];
  clear(osx); xform(osx, im, o.fit, p, 0, 0); osx.drawImage(im.c, -im.w / 2, -im.h / 2); reset(osx);
  const sx = lerp(p.x - 700, p.x + 700, inOutSine(u)), g = osx.createLinearGradient(sx - 220, p.y + 120, sx + 220, p.y - 120);
  for (let i = 0; i <= 12; i++) { const v = i / 12, d = (v - 0.5) / 0.22; g.addColorStop(v, `rgba(255,255,255,${(0.9 * Math.exp(-d * d)).toFixed(4)})`); }
  osx.globalCompositeOperation = 'source-in'; osx.fillStyle = g; osx.fillRect(0, 0, W, H);
  ctx.save(); reset(ctx); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(p.a * p.c * 0.6 * Math.sin(Math.PI * u)); ctx.drawImage(OS, 0, 0); ctx.restore();
}
function drawObjects(t) {
  if (t < BURST - 0.05 || t > CARD_T0 + 0.9) return;
  const list = OBJS.map((o, j) => ({ o, j, p: poseOf(j, t) })).filter(e => e.p.a > 0.002 || poseOf(e.j, t + SH).a > 0.002).sort((a, b) => a.p.c - b.p.c);
  for (const { o, j } of list) {
    const pa = poseOf(j, t - SH), pb = poseOf(j, t + SH);
    const d = Math.hypot(pb.x - pa.x, pb.y - pa.y) + Math.abs(pb.size - pa.size) * 0.5 + Math.abs(pb.rot - pa.rot) * 6;
    const n = clamp(Math.ceil(d / 6), 1, 14);
    if (n === 1) {
      drawPose(ctx, o, j, t, 1, 'source-over');
      const gu = inv(o.arrive + 0.15, o.arrive + 1.05, t); if (gu > 0 && gu < 1) glint(o, j, t, gu);
    } else {
      clear(osx);
      for (let i = 0; i < n; i++) drawPose(osx, o, j, t - SH + (2 * SH * (i + 0.5)) / n, 1 / n, 'lighter');
      ctx.save(); reset(ctx); ctx.drawImage(OS, 0, 0); ctx.restore();
    }
  }
}
function drawIcon(cx, cy, size, s, a, rot = 0) {
  if (a <= 0.003 || s <= 0.003) return;
  const im = A.icon, sc = (size / im.w) * s;
  ctx.save(); reset(ctx); ctx.globalAlpha = clamp(a); ctx.translate(cx, cy); ctx.rotate((rot * Math.PI) / 180); ctx.scale(sc, sc);
  ctx.drawImage(im.c, -im.w / 2, -im.h / 2); ctx.restore();
}

// ---------------------------------------------------------------- timeline
const SC = [
  { lines: ['Music,', 'ad-free.'], sub: 'No ads between you and the song.' },
  { lines: ['Hear it as', 'it was made.'], sub: 'High-quality audio, made to be heard.' },
  { lines: ['Tailored', 'for you.'], sub: 'Daily mixes from what you listen to.' },
  { lines: ['Mix by', 'mood.'], sub: 'Generate a Vibe Mix on Windows & web.' },
  { lines: ['Take it', 'anywhere.'], sub: 'Save tracks offline on Windows & web.' },
];
const HEAD_Y = 420, BTN = 20.09, CARD_OUT = 23.4;
const TB = {};

// Intro: the mark fades up and settles, the name rises in letter by letter and catches one pass of light.
// On the first downbeat of the build the mark pulls back (anticipation), collapses, and the features burst out of it.
function intro(t) {
  if (t > BURST + 0.2) return;
  const ui = inv(0.3, 1.3, t), v = inv(2.96, 3.3, t);
  const s = (0.94 + 0.06 * outCubic(ui)) * (1 + 0.012 * inv(1.3, 2.96, t)) * Math.max(0, 1 - inBack(v, 1.4));
  drawIcon(W / 2, ICON_Y + 18 * (1 - outCubic(ui)), 460, s, smooth(ui) * (1 - ss(3.2, 3.32, t)));
  const tb = TB.intro, lp = sweepP(t, 1.55, 1.2);
  litSilver(tb, lp);
  const src = compose(tb, (u, tt) => mix(unitIn(tt, 0.7 + 0.045 * u.k, tb.size, 0.65), unitOut(tt, 2.84 + 0.02 * u.k, tb.size, 0.34)), t);
  drawBlock(tb, src, 1235 - tb.base[0], 0.55, lp);
  label('NOW ON WINDOWS AND ANDROID', { y: 1345, font: '600 30px J', color: '#8fb8ff' }, tt => {
    const k = outCubic(inv(1.3, 2.1, tt)), x = unitOut(tt, 2.8, 30, 0.34);
    return { dy: (1 - k) * 14 + x.dy, a: k * x.a, track: lerp(0.5, 0.24, k) * 30 };
  }, t);
}

function sceneText(k, t) {
  const t0 = SCN[k], t1 = k < 4 ? SCN[k + 1] : CARD_T0;
  if (t < t0 || t > t1 + 0.1) return;
  const tb = TB['s' + k], lp = sweepP(t, t0 + 0.45);
  litSilver(tb, lp);
  const src = compose(tb, (u, tt) => mix(unitIn(tt, t0 + 0.18 + 0.06 * u.k, tb.size), unitOut(tt, t1 - 0.42 + 0.03 * u.k, tb.size)), t);
  drawBlock(tb, src, HEAD_Y - tb.base[0], 0.5, lp);
  label(SC[k].sub, { y: HEAD_Y + tb.lineH + 96, font: '400 40px I', color: '#aab0bd' },
    tt => mix(unitIn(tt, t0 + 0.42, 40, 0.75), unitOut(tt, t1 - 0.4, 40, 0.34)), t);
}

// Store badges, drawn as vectors.
function playLogo(x, cx, cy, s) {
  const P = (u, v) => [cx + (u - 0.5) * s, cy + (v - 0.5) * s];
  const TL = P(0.14, 0.02), BL = P(0.14, 0.98), R = P(0.94, 0.5), Cc = P(0.56, 0.5), T = P(0.64, 0.31), B = P(0.64, 0.69);
  x.save(); x.beginPath(); x.moveTo(...P(0.14, 0.5)); x.arcTo(...TL, ...R, s * 0.08); x.arcTo(...R, ...BL, s * 0.1); x.arcTo(...BL, ...TL, s * 0.08); x.closePath(); x.clip();
  const tri = (c, ...pts) => { x.fillStyle = c; x.beginPath(); x.moveTo(...pts[0]); pts.slice(1).forEach(p => x.lineTo(...p)); x.closePath(); x.fill(); };
  const bl = x.createLinearGradient(...TL, ...Cc); bl.addColorStop(0, '#00d7fe'); bl.addColorStop(1, '#0090ff');
  tri(bl, TL, BL, Cc);
  tri('#00e676', TL, Cc, T);
  tri('#ff3d47', BL, B, Cc);
  tri('#ffc800', T, [R[0] + s * 0.1, R[1]], B, Cc);
  x.restore();
}
function storeLogo(x, cx, cy, s) {
  const u = v => v * s;
  x.save(); x.translate(cx - s / 2, cy - s / 2);
  x.strokeStyle = '#eef1f7'; x.lineWidth = u(0.07); x.lineJoin = 'round'; x.lineCap = 'round';
  x.beginPath(); x.arc(u(0.5), u(0.3), u(0.17), Math.PI, 0); x.stroke();
  x.beginPath(); x.roundRect(u(0.08), u(0.3), u(0.84), u(0.64), u(0.08)); x.stroke();
  const q = u(0.21), g = u(0.035), ox = u(0.5) - q - g / 2, oy = u(0.62) - q - g / 2;
  [['#f25022', 0, 0], ['#7fba00', 1, 0], ['#00a4ef', 0, 1], ['#ffb900', 1, 1]].forEach(([c, i, k]) => { x.fillStyle = c; x.fillRect(ox + i * (q + g), oy + k * (q + g), q, q); });
  x.restore();
}
function storeButton(y, primary, title, link, st) {
  if (st.a <= 0.003) return;
  const w = 840, h = 156, r = 44;
  ctx.save(); reset(ctx); ctx.globalAlpha = clamp(st.a); ctx.translate(W / 2, y + st.dy); ctx.scale(st.s, st.s);
  const x0 = -w / 2, y0 = -h / 2;
  ctx.beginPath(); ctx.roundRect(x0, y0, w, h, r);
  if (primary) {
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 44; ctx.shadowOffsetY = 16;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e6eaf2'); ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = 'transparent';
  } else {
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, 'rgba(26,30,42,.96)'); g.addColorStop(1, 'rgba(12,14,20,.96)'); ctx.fillStyle = g; ctx.fill();
    const b = ctx.createLinearGradient(0, y0, 0, y0 + h); b.addColorStop(0, 'rgba(255,255,255,.26)'); b.addColorStop(1, 'rgba(255,255,255,.08)');
    ctx.lineWidth = 2; ctx.strokeStyle = b; ctx.stroke();
  }
  // the badge mark pops in just behind the plate (overlapping action)
  const ls = st.logo; if (ls > 0.003) {
    ctx.save(); ctx.translate(x0 + 92, 0); ctx.scale(ls, ls);
    primary ? playLogo(ctx, 0, 0, 74) : storeLogo(ctx, 0, 2, 70); ctx.restore();
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = '-0.4px';
  ctx.font = '700 42px J'; ctx.fillStyle = primary ? '#07080c' : '#f3f5fa'; ctx.fillText(title, x0 + 170, -6);
  ctx.font = '500 29px I'; ctx.letterSpacing = '0px'; ctx.fillStyle = primary ? '#4f5869' : '#9099ab'; ctx.fillText(link, x0 + 170, 40);
  if (st.sheen > 0 && st.sheen < 1) {
    ctx.beginPath(); ctx.roundRect(x0, y0, w, h, r); ctx.clip();
    const sx = lerp(x0 - 240, x0 + w + 240, inOutSine(st.sheen)), g = ctx.createLinearGradient(sx - 120, y0 + h, sx + 120, y0);
    for (let i = 0; i <= 10; i++) { const u = i / 10, d = (u - 0.5) / 0.25; g.addColorStop(u, rgba(primary ? [205, 222, 255] : [200, 220, 255], (primary ? 0.55 : 0.2) * Math.exp(-d * d))); }
    ctx.globalCompositeOperation = primary ? 'multiply' : 'screen';
    if (primary) { const g2 = ctx.createLinearGradient(sx - 120, y0 + h, sx + 120, y0); for (let i = 0; i <= 10; i++) { const u = i / 10, d = (u - 0.5) / 0.25, k = Math.exp(-d * d); g2.addColorStop(u, rgba([255 - 34 * k, 255 - 20 * k, 255], 1)); } ctx.fillStyle = g2; }
    else ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
  }
  ctx.restore();
}

// End card: the features collapse into the mark, which lands centred with the title under it. Then the pair
// lifts (dip, rise, settle) to make room and the two store buttons follow it in, Android first.
function card(t) {
  if (t < CARD_T0 + 0.3 || t > CARD_OUT + 0.9) return;
  const m = inOutBack(inv(BTN, BTN + 0.76, t), 1.1), mt = inOutBack(inv(BTN + 0.07, BTN + 0.83, t), 1.1);
  const X = (d, dur = 0.5) => inv(CARD_OUT + d, CARD_OUT + d + dur, t);
  const xo = d => ({ dy: -inBack(X(d), 1.6) * 110, a: 1 - smooth(inv(0.35, 1, X(d))) });
  const pop = inv(18.52, 19.25, t), lx = xo(0);
  drawIcon(W / 2, lerp(CARD_Y, 640, m) + lx.dy, lerp(380, 330, m), lerp(0.25, 1, spring(pop, 0.9, 6)), smooth(inv(0, 0.22, pop)) * lx.a);
  const tb = TB.card, lp = sweepP(t, 19.3, 1.25);
  litSilver(tb, lp);
  const src = compose(tb, (u, tt) => mix(unitIn(tt, 18.72 + 0.035 * u.k, tb.size, 0.65), unitOut(tt, CARD_OUT + 0.06 + 0.015 * u.k, tb.size, 0.38)), t);
  drawBlock(tb, src, lerp(1190, 940, mt) - tb.base[0], 0.55, lp);
  [[true, 'Android \u00b7 Google Play', 'tunes.d-verse.in/android', 1140, 0], [false, 'Windows \u00b7 Microsoft Store', 'tunes.d-verse.in/windows', 1320, 1]].forEach(([primary, title, link, y, j]) => {
    const t0 = BTN + 0.36 + 0.14 * j, pe = inv(t0, t0 + 0.85, t), x = xo(0.12 + 0.06 * j);
    storeButton(y, primary, title, link, {
      a: smooth(inv(0, 0.3, pe)) * x.a, dy: (1 - spring(pe, 0.9, 6.5)) * 120 + x.dy, s: lerp(0.94, 1, spring(pe, 0.9, 6.5)),
      logo: spring(inv(t0 + 0.12, t0 + 0.82, t), 1.0, 6), sheen: primary ? inv(21.45, 22.25, t) : 0,
    });
  });
}

// D'Verse ending: the deployed D'Verse page, beat for beat. The loading ribbon runs the frame edge and docks on the
// right; the beam takes over at rest and sweeps right-to-left over 1.4 s (quadratic in-out, widening STATE_1 -> STATE_3)
// uncovering the type, fading out as it reaches the left edge so only the lit word is left.
function endState(t) {
  const prog = inv(SWEEP_T0, SWEEP_T0 + SWEEP_D, t), e = inOutQuad(prog);
  const cfg = {}; for (const k in STATE_3) cfg[k] = lerp(STATE_1[k], STATE_3[k], e);
  const bxp = (1 - e) * W, fade = ss(0, 0.45, bxp / W);
  return { prog, cfg, bxp, fade };
}
function endPass(t, pass) {
  if (t < R_START - 0.05) return;
  const s = endState(t), tb = TB.end, ty = 960 - (tb.base[0] - tb.cap / 2);
  const shown = t >= SWEEP_T0, uncover = s.prog < 1 ? s.bxp : null;
  if (pass === 'behind') {
    if (!shown || s.fade <= 0.003) return uncover;
    // WwdcTextEffect halos around the light (amber / white core / cyan), travelling with the beam and fading with it
    const halo = (dx, w, h, stops, blur, op) => {
      gx.save(); gx.filter = gblur(blur); gx.globalAlpha = op * s.fade; gx.translate(s.bxp + dx, 960); gx.scale(w / 2, h / 2);
      const g = gx.createRadialGradient(0, 0, 0, 0, 0, Math.SQRT2); for (const [u, c] of stops) g.addColorStop(u, c);
      gx.fillStyle = g; gx.beginPath(); gx.arc(0, 0, 1, 0, Math.PI * 2); gx.fill(); gx.restore();
    };
    halo(12, 432, 324, [[0, 'rgba(255,180,60,.35)'], [0.35, 'rgba(255,145,30,.2)'], [0.7, 'rgba(255,145,30,0)'], [1, 'rgba(0,0,0,0)']], 38, 0.9);
    halo(0, 302, 238, [[0, 'rgba(255,255,255,.6)'], [0.3, 'rgba(255,250,240,.4)'], [0.7, 'rgba(255,250,240,0)'], [1, 'rgba(0,0,0,0)']], 26, 0.95);
    halo(-12, 346, 259, [[0, 'rgba(100,190,255,.2)'], [0.35, 'rgba(80,160,255,.12)'], [0.65, 'rgba(80,160,255,0)'], [1, 'rgba(0,0,0,0)']], 34, 0.85);
    return uncover;
  }
  if (pass === 'main') {
    if (!shown) return;
    litDVerse(tb);
    const push = 1 + 0.018 * ss(SWEEP_T0, DUR, t);
    let src = tb.L;
    if (uncover !== null) {
      const T = tb.T, x = c2d(T); clear(x); x.drawImage(tb.L, 0, 0); x.globalCompositeOperation = 'destination-in';
      const g = x.createLinearGradient(uncover - 40, 0, uncover + 40, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); x.fillStyle = g; x.fillRect(0, 0, W, tb.h); src = T;
    }
    ctx.save(); reset(ctx); ctx.translate(W / 2, 960); ctx.scale(push, push); ctx.translate(-W / 2, -960); ctx.drawImage(src, 0, ty); ctx.restore();
    return;
  }
  // front: the light itself. Ribbon and beam cross-fade while both sit still at the right-edge dock.
  const hand = ss(T_DOCK - 0.3, T_DOCK + 0.2, t);
  if (t < T_DOCK + 0.2) ribbon(gx, ribbonProg(t), STATE_1, ss(R_START, R_START + 0.45, t) * (1 - hand));
  if (t > T_DOCK - 0.3 && s.prog < 1) beam(gx, s.bxp, H * 0.5, s.cfg, hand * s.fade);
}

// ---------------------------------------------------------------- frame
let grain = null;
function drawBG(t) {
  reset(ctx); ctx.fillStyle = '#040406'; ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, H * 0.62); v.addColorStop(0, '#08080e'); v.addColorStop(1, '#040406');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  const pa = 0.85 * (1 - ss(23.3, 24.4, t));
  if (pa > 0.003) {
    const z = 1.16 + 0.04 * Math.sin(t * 0.21), pw = W * z, ph = H * z;
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(pa);
    ctx.drawImage(A.plate, (W - pw) * (0.5 + 0.3 * Math.sin(t * 0.23)), (H - ph) * (0.5 - 0.3 * Math.cos(t * 0.19)), pw, ph); ctx.restore();
  }
}
function frame(i) {
  const t = i / FPS;
  drawBG(t);
  glowBegin(); const unc = endPass(t, 'behind'); glowEnd(1, unc ?? null);
  intro(t); drawObjects(t);
  for (let k = 0; k < 5; k++) sceneText(k, t);
  card(t); endPass(t, 'main');
  glowBegin(); endPass(t, 'front'); glowEnd(1);
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
  Object.assign(A, { s1: prepObj(s1), s2: prepObj(s2), s5: prepObj(s5), s6: prepObj(s6), s7: prepObj(s7), icon: prepObj(lumaToAlpha(icon), 0), plate });
  grain = makeGrain();
  TB.intro = new TextBlock({ lines: ["D'Tunes"], size: 160, weight: 800, track: -0.035, unit: 'char' });
  SC.forEach((sc, k) => { TB['s' + k] = new TextBlock({ lines: sc.lines, size: 124, weight: 700, track: -0.03, unit: 'word' }); });
  TB.card = new TextBlock({ lines: ["Get D'Tunes"], size: 132, weight: 800, track: -0.035, unit: 'char' });
  TB.end = new TextBlock({ lines: ["D'Verse"], size: 208, weight: 800, track: -0.04, unit: 'word', pad: 120 });
  window.renderFrame = i => { frame(i); return new Promise(r => requestAnimationFrame(() => r(true))); };
  window.NF = NF; window.SWEEP_T0 = SWEEP_T0; window.__ready = true;
  const q = new URLSearchParams(location.search);
  if (q.has('t')) frame(Math.round(parseFloat(q.get('t')) * FPS));
}
boot().catch(e => { window.__error = String(e && e.stack || e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:red;position:fixed;top:0">${window.__error}</pre>`); });
