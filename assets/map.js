/* map.js: the Magic Map, a travel map of the site in the spirit of the one in King's Quest VI.
   Everything is original: the art is drawn procedurally at 320x200 and scaled up with crisp
   pixels, and the sound is synthesized. Loaded on demand by site.js. */
(function (global) {
  'use strict';

  const W = 320, H = 200;
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER4[((y & 3) << 2) | (x & 3)];
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const P = h => { const c = hex(h); return ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function hash2(x, y, s) { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); }
  function noise2(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm2(x, y, s, oct = 4) { let a = 0, amp = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { a += amp * noise2(x * f, y * f, s + o * 13); n += amp; f *= 2; amp *= 0.5; } return a / n; }
  const pick = (pal, t, x, y) => { const n = pal.length - 1, v = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(v)); return v - i > bayer(x, y) ? pal[i + 1] : pal[i]; };

  // ── palette ──────────────────────────────────────────────────────────
  const PARCH = ['#9e7746', '#b88f58', '#cba468', '#dab676', '#e5c585', '#edd296', '#f3dda7'].map(P);
  const INK = ['#4a2d16', '#583619', '#67401f', '#774c27', '#86592f', '#946638', '#a07343'].map(P);
  const TERRAIN = ['#3e2410', '#553418', '#6c4522', '#86592f', '#a1713f', '#bb8b52', '#d3a86b', '#e6c38b', '#f3dcaa'].map(P);
  const RING_OUT = P('#17a6b6'), RING_MID = P('#45c7d8'), RING_IN = P('#a2e1f1'), FOAM = P('#e8fbff');
  const GRID = P('#a07a49');
  const ROLLER = ['#140a04', '#2b180b', '#472a15', '#66401f', '#83562c', '#9a6a3a', '#83562c', '#66401f', '#472a15', '#2b180b', '#140a04'].map(P);
  const CURL = ['#f6ecca', '#e9d7a8', '#d3b884', '#b8965f'].map(P);
  const EDGE = [P('#6e4a26'), P('#8a6234')];
  const DARK = P('#4a2e16');
  const HOVER = P('#2f9fb0');

  // ── islands (low-res coordinates) ───────────────────────────────────
  const ISLES = [
    { id: 'mountain', name: 'About', href: '/about', blob: { cx: 154, cy: 60, rx: 42, ry: 22, seed: 3, amp: 0.34 }, ridge: 1.0, label: { x: 40, y: 42 } },
    { id: 'wonder', name: 'Writing', href: '/#writing', arc: { cx: 100, cy: 126, r: 40, a0: 3.30, a1: 4.95, th: 14, seed: 5 }, ridge: 0.35, label: { x: 82, y: 104 } },
    { id: 'beast', name: 'Projects', href: '/#projects', blob: { cx: 222, cy: 106, rx: 25, ry: 11, seed: 7, amp: 0.34 }, ridge: 0.55, label: { x: 210, y: 71 } },
    { id: 'crown', name: 'Home', href: '/', blob: { cx: 142, cy: 154, rx: 42, ry: 21, seed: 11, amp: 0.36 }, ridge: 0.5, label: { x: 46, y: 162 } }
  ];

  function blobInside(b, x, y) {
    const dx = (x - b.cx) / b.rx, dy = (y - b.cy) / b.ry, r = Math.sqrt(dx * dx + dy * dy);
    if (r > 1.9) return false;
    const th = Math.atan2(dy, dx);
    let edge = 1;
    for (let k = 2; k <= 6; k++) edge += (b.amp / k) * Math.sin(k * th + hash2(k, b.seed, 1) * 6.283);
    edge += 0.14 * (fbm2(x * 0.16, y * 0.16, b.seed + 40) - 0.5);
    return r < edge;
  }
  function arcInside(a, x, y) {
    let th = Math.atan2(y - a.cy, x - a.cx); if (th < 0) th += Math.PI * 2;
    if (th < a.a0 || th > a.a1) return false;
    const u = (th - a.a0) / (a.a1 - a.a0);
    const thick = a.th * Math.pow(Math.sin(Math.PI * u), 0.55) * (0.8 + 0.4 * fbm2(u * 6, 0.5, a.seed));
    const d = Math.abs(Math.hypot(x - a.cx, y - a.cy) - (a.r + 3 * Math.sin(u * 5 + a.seed)));
    return d < thick / 2 + 0.6 * (fbm2(x * 0.3, y * 0.3, a.seed + 3) - 0.5);
  }

  // Chamfer distance transform: distance from each pixel to the nearest pixel NOT in `set`.
  function distance(mask, want) {
    const INF = 1e6, d = new Float32Array(W * H), R2 = Math.SQRT2;
    for (let i = 0; i < W * H; i++) d[i] = mask[i] === want ? INF : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) { v = Math.min(v, d[i - W] + 1); if (x > 0) v = Math.min(v, d[i - W - 1] + R2); if (x < W - 1) v = Math.min(v, d[i - W + 1] + R2); }
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!d[i]) continue;
      let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < H - 1) { v = Math.min(v, d[i + W] + 1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + R2); if (x > 0) v = Math.min(v, d[i + W - 1] + R2); }
      d[i] = v;
    }
    return d;
  }

  function prepareIsles() {
    ISLES.forEach(isle => {
      const mask = new Uint8Array(W * H);
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const inside = isle.blob ? blobInside(isle.blob, x, y) : arcInside(isle.arc, x, y);
        if (inside) { mask[y * W + x] = 1; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
      const din = distance(mask, 1), dout = distance(mask, 0);
      let maxD = 1; for (let i = 0; i < W * H; i++) if (mask[i]) maxD = Math.max(maxD, din[i]);
      const seed = (isle.blob || isle.arc).seed;
      const h = new Float32Array(W * H);
      let maxH = 0.001;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x; if (!mask[i]) continue;
        const base = Math.pow(smooth(0, maxD * 0.9, din[i]), 0.7);
        const low = fbm2(x * 0.05, y * 0.05, seed + 9);
        let v;
        if (isle.ridge >= 1 && isle.blob) {
          // One jagged east-west ridge with erosion gullies, like a mountain range seen from above.
          const dyn = (y - isle.blob.cy) / isle.blob.ry;
          const line = Math.max(0, 1 - Math.abs(dyn + 0.12) * 1.5);
          const jag = fbm2(x * 0.12, 0.5, seed + 30);
          const gully = Math.abs(Math.sin(x * 0.8 + fbm2(x * 0.05, y * 0.1, seed + 40) * 8));
          v = base * (0.22 + 0.78 * Math.pow(line, 1.3) * (0.6 + 0.6 * jag)) - 0.06 * gully * line;
        } else {
          v = base * (0.55 + 0.45 * low);
        }
        h[i] = Math.max(0, v);
        maxH = Math.max(maxH, h[i]);
      }
      for (let i = 0; i < W * H; i++) h[i] /= maxH;
      // Flat ink look: dark rim, lighter middle, mottled.
      const ink = new Uint32Array(W * H);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x; if (!mask[i]) continue;
        const t = smooth(0, Math.min(maxD, 9), din[i]) * 0.85 + (fbm2(x * 0.12, y * 0.12, seed + 5) - 0.5) * 0.35;
        ink[i] = pick(INK, t, x, y);
      }
      Object.assign(isle, { mask, din, dout, h, ink, box: { x0, y0, x1, y1 } });
    });
  }

  // ── base art: parchment, grid, rollers, compass ─────────────────────
  function drawBase(px) {
    const top = new Int16Array(W), bot = new Int16Array(W);
    for (let x = 0; x < W; x++) {
      top[x] = Math.round(9 + 4 * fbm2(x * 0.07, 1, 31) + (hash2(x, 3, 5) > 0.9 ? 1 : 0));
      bot[x] = Math.round(191 - 4 * fbm2(x * 0.06, 7, 33) - (hash2(x, 9, 5) > 0.9 ? 1 : 0));
    }
    for (let y = 0; y < H; y++) for (let x = 34; x < 287; x++) {
      if (y < top[x] || y > bot[x]) continue;
      let c;
      if (y <= top[x] + 1 || y >= bot[x] - 1) c = EDGE[(y === top[x] || y === bot[x]) ? 0 : 1];
      else {
        const u = (x - 160) / 150, v = (y - 100) / 92;
        const vign = 1 - (u * u * 0.55 + v * v * 0.8);
        const stain = fbm2(x * 0.035, y * 0.05, 7) - 0.5;
        const edgeBurn = Math.min(y - top[x], bot[x] - y) < 5 ? -0.25 : 0;
        const t = vign * 0.8 + stain * 0.45 + (hash2(x, y * 3, 2) - 0.5) * 0.07 + 0.12 + edgeBurn;
        c = pick(PARCH, t, x, y);
      }
      px[y * W + x] = c;
    }
    // lat/long grid, hand-drawn wobble
    [58, 106, 154, 202, 250].forEach((gx, k) => { for (let y = 12; y < 189; y++) { const x = gx + Math.round(fbm2(y * 0.05, k, 50) * 2 - 1); if (y > top[x] + 2 && y < bot[x] - 2 && hash2(x, y, k) > 0.08) px[y * W + x] = GRID; } });
    [50, 90, 130, 170].forEach((gy, k) => { for (let x = 36; x < 285; x++) { const y = gy + Math.round(fbm2(x * 0.05, k, 60) * 2 - 1); if (y > top[x] + 2 && y < bot[x] - 2 && hash2(x, y, k + 7) > 0.08) px[y * W + x] = GRID; } });
    // rolled paper and wooden rollers
    const roller = (x0, x1) => {
      for (let y = 3; y < 197; y++) for (let x = x0; x <= x1; x++) {
        const u = (x - x0) / (x1 - x0);
        const cap = (y < 7 || y > 192) ? Math.abs(u - 0.5) * 2 : 0;
        if (cap > 0.85) continue;
        const grain = (fbm2(x * 0.6, y * 0.04, 70) - 0.5) * 0.12;
        px[y * W + x] = pick(ROLLER, u + grain, x, y);
      }
    };
    roller(6, 28); roller(292, 314);
    for (let y = 6; y < 194; y++) {
      [[29, 3], [30, 1], [31, 0], [32, 1], [33, 2]].forEach(([x, c]) => { px[y * W + x] = CURL[c]; });
      [[286, 2], [287, 1], [288, 0], [289, 1], [290, 3]].forEach(([x, c]) => { px[y * W + x] = CURL[c]; });
    }
    // compass: "(N)" with a north arrow
    const cx = 272, cy = 124;
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const x = Math.round(cx + 8 * Math.cos(a)), y = Math.round(cy + 9 * Math.sin(a));
      if (Math.abs(Math.cos(a)) > 0.45) px[y * W + x] = DARK;
    }
    for (let x = cx - 13; x <= cx + 13; x++) if (Math.abs(x - cx) > 5) px[cy * W + x] = DARK;
    ['kkk..kkk', '.kk...k.', '.kkk..k.', '.k.kk.k.', '.k..kkk.', '.k...kk.', 'kkk...k.'].forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === 'k') px[(cy - 3 + j) * W + (cx - 4 + i)] = DARK;
    });
    for (let y = cy - 26; y < cy - 8; y++) px[y * W + cx + 3] = DARK;
    [[0, 0], [-1, 1], [1, 1], [-2, 2], [2, 2], [-1, 3], [1, 3]].forEach(([dx, dy]) => { px[(cy - 28 + dy) * W + cx + 3 + dx] = DARK; });
  }

  // ── renderer ────────────────────────────────────────────────────────
  let canvas, ctx, img, basePx, prepared = false;
  const state = { hover: null, travel: null, ring: 0, rise: 0 };

  function render() {
    const px = new Uint32Array(img.data.buffer);
    px.set(basePx);
    ISLES.forEach(isle => {
      if (state.travel === isle) return;
      const { x0, y0, x1, y1 } = isle.box;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (isle.mask[i]) px[i] = isle.ink[i]; }
      if (state.hover === isle) {
        for (let y = y0 - 3; y <= y1 + 3; y++) for (let x = x0 - 3; x <= x1 + 3; x++) {
          const i = y * W + x, d = isle.dout[i];
          if (d > 0.9 && d < 2.1 && ((x + y) & 1)) px[i] = HOVER;
        }
      }
    });
    if (state.travel) drawRising(px, state.travel, state.ring, state.rise);
    ctx.putImageData(img, 0, 0);
  }

  // The selected island: a turquoise shoreline, then the ink rises into a lit relief.
  function drawRising(px, isle, g, r) {
    const { x0, y0, x1, y1 } = isle.box;
    const ringW = g > 0 ? 1 + g * 4 : 0;
    for (let y = Math.max(0, y0 - 7); y <= Math.min(H - 1, y1 + 7); y++) for (let x = Math.max(0, x0 - 7); x <= Math.min(W - 1, x1 + 7); x++) {
      const i = y * W + x, d = isle.dout[i];
      if (isle.mask[i] || d > ringW) continue;
      if (d > ringW - 1.3) { if (d < ringW - 0.4 || bayer(x, y) < 0.6) px[i] = RING_OUT; }
      else px[i] = d <= 1.2 && r > 0.35 ? FOAM : (d > ringW - 2.4 ? RING_MID : RING_IN);
    }
    const S = (isle.ridge >= 1 ? 10 : 6) * r, colorMix = smooth(0, 0.55, r);
    const L = [-0.4, -0.55, 1.1], ln = Math.hypot(L[0], L[1], L[2]);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x; if (!isle.mask[i]) continue;
      const h = isle.h[i];
      const gx = (isle.h[i + 1] - isle.h[i - 1]) * 9, gy = (isle.h[i + W] - isle.h[i - W]) * 9;
      const nl = Math.hypot(gx, gy, 1);
      const lambert = (-gx * L[0] - gy * L[1] + L[2]) / (nl * ln);
      const shadeT = clamp((lambert - 0.2) / 0.8, 0, 1) * 0.7 + h * 0.25 + 0.08;
      const useTerrain = bayer(x, y) < colorMix * 1.05;
      const ty = Math.round(y - h * S);
      // Pixels between this column's raised top and its ground point are the slope facing the
      // viewer; shade them like the slope (a bit darker lower down), not as a flat cliff color.
      for (let yy = ty + 1; yy <= y; yy++) {
        if (yy < 0) continue;
        const up = (y - yy) / Math.max(1, y - ty);
        px[yy * W + x] = useTerrain ? pick(TERRAIN, shadeT - 0.12 - (1 - up) * 0.22, x, yy) : isle.ink[i];
      }
      if (ty >= 0) px[ty * W + x] = useTerrain ? pick(TERRAIN, shadeT, x, ty) : isle.ink[i];
    }
  }

  // ── sound: a short synthesized "pulling" whoosh with a whole-tone shimmer ─
  let audio;
  function playPull() {
    if (localStorage.getItem('kq-sound') === 'off') return;
    const AC = global.AudioContext || global.webkitAudioContext; if (!AC) return;
    audio = audio || new AC();
    if (audio.state === 'suspended') audio.resume();
    const a = audio, now = a.currentTime;
    const master = a.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.2, now + 0.08);
    master.gain.setValueAtTime(0.2, now + 1.5);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 2.3);
    const delay = a.createDelay(); delay.delayTime.value = 0.17;
    const fb = a.createGain(); fb.gain.value = 0.32;
    delay.connect(fb); fb.connect(delay);
    master.connect(a.destination); master.connect(delay); delay.connect(a.destination);
    // rising pull tone with widening vibrato
    const o = a.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(170, now); o.frequency.exponentialRampToValueAtTime(760, now + 1.9);
    const lfo = a.createOscillator(); lfo.frequency.value = 7;
    const lfoAmt = a.createGain(); lfoAmt.gain.setValueAtTime(3, now); lfoAmt.gain.linearRampToValueAtTime(38, now + 1.9);
    lfo.connect(lfoAmt); lfoAmt.connect(o.frequency);
    const og = a.createGain(); og.gain.value = 0.45; o.connect(og); og.connect(master);
    // whole-tone sparkle
    for (let k = 0; k < 10; k++) {
      const t0 = now + 0.12 + k * 0.12, f = 523.25 * Math.pow(2, (k * 2) / 12);
      const s = a.createOscillator(); s.type = 'square'; s.frequency.value = f;
      const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800;
      const sg = a.createGain(); sg.gain.setValueAtTime(0.0001, t0); sg.gain.exponentialRampToValueAtTime(0.09, t0 + 0.01); sg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
      s.connect(lp); lp.connect(sg); sg.connect(master); s.start(t0); s.stop(t0 + 0.3);
    }
    // swept noise
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * 2.2), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = a.createBufferSource(); n.buffer = buf;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5;
    bp.frequency.setValueAtTime(260, now); bp.frequency.exponentialRampToValueAtTime(2600, now + 1.9);
    const ng = a.createGain(); ng.gain.setValueAtTime(0.0001, now); ng.gain.exponentialRampToValueAtTime(0.22, now + 1.0); ng.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);
    n.connect(bp); bp.connect(ng); ng.connect(master);
    o.start(now); lfo.start(now); n.start(now);
    o.stop(now + 2.4); lfo.stop(now + 2.4); n.stop(now + 2.2);
  }

  // ── dialog ─────────────────────────────────────────────────────────
  let root, frame, narr, opener, prevOverflow, rafId;
  const reduce = () => global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pct = (v, total) => (v / total * 100).toFixed(3) + '%';

  function build() {
    if (!document.querySelector('link[data-kq-map-font]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.dataset.kqMapFont = '1';
      l.href = 'https://fonts.googleapis.com/css2?family=Jacquarda+Bastarda+9&display=swap';
      document.head.appendChild(l);
    }
    root = document.createElement('div');
    root.className = 'kq-map';
    root.id = 'kq-map';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'kq-map-title');
    root.hidden = true;
    const isles = ISLES.map(isle => `<a class="kq-map__isle" href="${isle.href}" data-isle="${isle.id}">` +
      `<span class="kq-map__label" style="left:${pct(isle.label.x, W)};top:${pct(isle.label.y, H)}">` +
      `<span class="kq-map__name">${isle.name}</span></span></a>`).join('');
    const legend = ISLES.map(isle => `<a class="kq-btn" href="${isle.href}" data-isle="${isle.id}">${isle.name}</a>`).join('');
    root.innerHTML =
      '<div class="kq-map__backdrop" data-close></div>' +
      '<div class="kq-map__bar"><button type="button" class="kq-btn kq-map__sound" aria-pressed="true"></button>' +
      '<button type="button" class="kq-btn kq-map__close" data-close>Close <small>(Esc)</small></button></div>' +
      '<div class="kq-map__frame"><canvas class="kq-map__art" width="320" height="200" aria-hidden="true"></canvas>' +
      '<h2 class="kq-map__title" id="kq-map-title"><span>Land of the</span> Green<br>Isles</h2>' +
      '<p class="kq-map__hint">Touch an island to travel</p>' + isles +
      '<div class="kq-narr" role="status" aria-live="polite" hidden><span class="kq-narr__cap" aria-hidden="true">Y</span><span class="kq-sr">Y</span>ou feel a strange pulling sensation....</div>' +
      '</div><div class="kq-map__legend">' + legend + '</div>';
    document.body.appendChild(root);
    frame = root.querySelector('.kq-map__frame');
    narr = root.querySelector('.kq-narr');
    canvas = root.querySelector('canvas');
    ctx = canvas.getContext('2d');
    img = ctx.createImageData(W, H);
    basePx = new Uint32Array(W * H);
    drawBase(basePx);

    root.addEventListener('click', e => {
      if (state.travel) { e.preventDefault(); skip(); return; }
      if (e.target.closest('[data-close]')) { e.preventDefault(); close(); return; }
      const a = e.target.closest('a[data-isle]');
      if (a) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        travel(ISLES.find(i => i.id === a.dataset.isle), a.href);
        return;
      }
      const isle = e.target === canvas ? isleAt(e) : null;
      if (isle) { e.preventDefault(); travel(isle, isle.href); }
    });
    // Pointer hit-testing uses the island shapes, not rectangles, so nearby islands never compete.
    canvas.addEventListener('mousemove', e => {
      if (state.travel) return;
      const isle = isleAt(e);
      if (isle !== state.hover) { state.hover = isle; render(); }
    });
    canvas.addEventListener('mouseleave', () => { if (!state.travel && state.hover) { state.hover = null; render(); } });
    root.querySelectorAll('.kq-map__isle').forEach(a => {
      const isle = ISLES.find(i => i.id === a.dataset.isle);
      const on = () => { if (!state.travel) { state.hover = isle; render(); } };
      const off = () => { if (state.hover === isle && !state.travel) { state.hover = null; render(); } };
      a.addEventListener('focus', on); a.addEventListener('blur', off);
      const label = a.querySelector('.kq-map__label');
      label.addEventListener('mouseenter', on); label.addEventListener('mouseleave', off);
    });
    const sound = root.querySelector('.kq-map__sound');
    const paintSound = () => { const on = localStorage.getItem('kq-sound') !== 'off'; sound.textContent = on ? 'Sound: On' : 'Sound: Off'; sound.setAttribute('aria-pressed', String(on)); };
    sound.addEventListener('click', () => { localStorage.setItem('kq-sound', localStorage.getItem('kq-sound') === 'off' ? 'on' : 'off'); paintSound(); });
    paintSound();
    root.addEventListener('keydown', onKey);
    global.addEventListener('resize', fit);
  }

  function isleAt(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return ISLES.find(isle => isle.dout[y * W + x] <= 2) || null;
  }

  function fit() {
    if (!root || root.hidden) return;
    const avail = Math.min((global.innerWidth - 24) / W, (global.innerHeight - 110) / H);
    const s = avail >= 2 ? Math.min(4, Math.floor(avail)) : Math.max(0.5, avail);
    root.style.setProperty('--s', s);
    root.classList.toggle('is-small', s < 2);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); state.travel ? skip() : close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...root.querySelectorAll('button, a[href]')].filter(el => el.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }

  function open(fromEl) {
    if (!prepared) { prepareIsles(); prepared = true; }
    if (!root) build();
    opener = fromEl || document.activeElement;
    state.hover = null; state.travel = null;
    narr.hidden = true;
    root.classList.remove('is-traveling');
    root.hidden = false;
    fit();
    render();
    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const here = ISLES.find(i => i.href === location.pathname) || ISLES.find(i => i.id === 'crown');
    const first = root.querySelector(`.kq-map__isle[data-isle="${here.id}"]`);
    if (first) first.focus({ preventScroll: true });
  }

  function close() {
    cancelAnimationFrame(rafId);
    root.hidden = true;
    state.travel = null;
    document.documentElement.style.overflow = prevOverflow || '';
    if (opener && opener.focus) opener.focus({ preventScroll: true });
  }

  let pending;
  function travel(isle, href) {
    if (global.KQScore) global.KQScore.award('map:5');
    pending = { isle, href };
    if (reduce()) { arrive(); return; }
    state.travel = isle; state.hover = null; state.ring = 0; state.rise = 0;
    root.classList.add('is-traveling');
    narr.hidden = false;
    playPull();
    const t0 = performance.now();
    const step = now => {
      const t = now - t0;
      state.ring = smooth(0, 650, t);
      state.rise = smooth(250, 1700, t);
      render();
      if (t < 2000) rafId = requestAnimationFrame(step);
      else arrive();
    };
    rafId = requestAnimationFrame(step);
  }
  function skip() { cancelAnimationFrame(rafId); arrive(); }

  function arrive() {
    if (!pending) return;
    const { href } = pending; pending = null;
    const url = new URL(href, location.href);
    const samePage = url.pathname === location.pathname;
    const go = () => {
      if (samePage) {
        close();
        const target = url.hash && document.querySelector(url.hash);
        if (target) target.scrollIntoView({ block: 'start' }); else global.scrollTo(0, 0);
        if (url.hash) history.replaceState(null, '', url.hash);
        if (global.KQDissolve && !reduce()) global.KQDissolve.in();
      } else {
        if (!reduce()) { try { sessionStorage.setItem('kq-arrive', '1'); } catch (e) { /* private mode */ } }
        location.href = url.href;
      }
    };
    if (global.KQDissolve && !reduce()) global.KQDissolve.out(go); else go();
  }

  global.KQMap = { open, close };
})(window);
