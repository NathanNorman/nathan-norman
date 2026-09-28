/* scene.js: procedural pixel-art scenes and pixel titles.
   All art is generated here; no game assets are used.
   Themes: 'isles' (ivory palace, emerald isles, golden hour) and 'dusk' (sunset silhouette). */
(function (global) {
  'use strict';

  // ── utils ───────────────────────────────────────────────────────────
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER4[((y & 3) << 2) | (x & 3)];
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const P = h => { const c = hex(h); return ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; };
  function hash(n, seed) { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, seed) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u; }
  function fbm(x, seed, oct = 4) { let a = 0, amp = 0.5, fr = 1, norm = 0; for (let o = 0; o < oct; o++) { a += amp * vnoise(x * fr, seed + o * 17.3); norm += amp; fr *= 2; amp *= 0.5; } return a / norm; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function layer(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const px = new Uint32Array(img.data.buffer);
    return {
      c, px, w, h,
      set(x, y, col) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = col; },
      flush() { ctx.putImageData(img, 0, 0); return c; }
    };
  }
  function gradient(L, y0, y1, stops, curve) {
    const n = stops.length - 1;
    for (let y = y0; y < y1; y++) {
      const t = Math.pow((y - y0) / Math.max(1, y1 - y0 - 1), curve) * n;
      const i = Math.min(n - 1, Math.floor(t)), f = t - i;
      for (let x = 0; x < L.w; x++) L.px[y * L.w + x] = f > bayer(x, y) ? stops[i + 1] : stops[i];
    }
  }
  function sprite(L, rows, x0, y0, colors) {
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = colors[row[x]]; if (c !== undefined) L.set(x0 + x, y0 + y, c); } });
  }

  // ── themes ──────────────────────────────────────────────────────────
  const THEMES = {
    isles: {
      sky: ['#0f1f5c', '#132870', '#193486', '#20419a', '#2a52ab', '#3765b9', '#4979c4', '#5f8fcd', '#7aa4d3', '#98b8d6', '#bac8d2', '#dcd4bc', '#f0d59e', '#f8c97c'],
      sea: ['#c9e6dc', '#9dd2d2', '#6fb8c8', '#4c9dba', '#3683a8', '#286b95', '#1e5780', '#16456b', '#10355a'],
      sun: ['#fcca72', '#ffe7a0', '#fff8d8'],
      stars: 0,
      clouds: 'puffy', cloud: ['#8d9fc6', '#c3cbe0', '#eee6dc', '#fff4dc', '#ffffff'],
      far: ['#86a9c7', '#6f96bb', '#5c84ab'],
      isle: { grass: '#3f8a4a', grassHi: '#6aae5c', grassLo: '#2a6a3e', rock: '#bfa06f', rockHi: '#dcbf8c', rockLo: '#8e7452', rockDeep: '#6b5640', foam: '#f2fbf8' },
      castle: 'palace',
      palace: { wall: '#f1e8cc', wallShade: '#cdb98f', wallDeep: '#a48f66', outline: '#3a2a1e', dome: '#f2b92c', domeHi: '#ffe48a', domeShade: '#b67d12', win: '#2f3160', winLit: '#ffd46b', flag: '#c2182b', gate: '#1e1a2e' },
      fg: { base: '#24552f', top: '#4a9a4e', hi: '#76b863', lo: '#173d24', rock: '#7a6650', rockHi: '#9c8566', flowers: ['#f2b92c', '#e04a5a', '#f6f1e3'] },
      trees: 'cypress', tree: { base: '#1f5236', hi: '#3a7d4a', lo: '#12331f', trunk: '#4a3322' },
      glint: '#e6f6f4', glintHi: '#ffffff', refl: ['#fff6cc', '#ffe8a6', '#fbd786', '#f1c67c', '#d6c49a', '#a9c6c4'],
      bird: '#f7f3ea', boat: false
    },
    dusk: {
      sky: ['#0b0d2c', '#11174a', '#1b2263', '#262d78', '#383888', '#50408f', '#6d4891', '#8f5290', '#b35e89', '#d6707c', '#ec8d72', '#f7b06e', '#fcd17f'],
      sea: ['#f0b27c', '#c77c86', '#8a5a8e', '#5c4a8a', '#403d7c', '#2d316b', '#20275a', '#171d48', '#10153a'],
      sun: ['#fbb46d', '#ffdf93', '#fff6cf'],
      stars: 0.006,
      clouds: 'streak', cloud: ['#4c3a78', '#6e4a86', '#e48d7c', '#ffc590'],
      far: ['#9a6594', '#7a568f', '#7a568f'],
      isle: { grass: '#2e2b63', grassHi: '#4f3d80', grassLo: '#2e2b63', rock: '#2e2b63', rockHi: '#2e2b63', rockLo: '#2e2b63', rockDeep: '#2e2b63', foam: '#2e2b63' },
      castle: 'silhouette', silhouette: { body: '#1d1b45', win: '#ffd46b', flag: '#e0582c' },
      fg: { base: '#0b0e27', top: '#18322f', hi: '#2c5646', lo: '#1a2140', rock: '#1a2140', rockHi: '#7a465f', flowers: [] },
      trees: 'palm', tree: { trunk: '#1a1430', trunkHi: '#4a2c4a', base: '#0f1a24', hi: '#23433a' },
      glint: '#7c6fb4', glintHi: '#caa0c0', refl: ['#fff3c0', '#ffdc8e', '#f7b06e', '#e8886f', '#c56a7c', '#9a5a86'],
      bird: '#1a1636', boat: { hull: '#15163a', sail: '#e7c7a4', sailShade: '#b88f86', flag: '#e0582c', lantern: '#ffcf6a' }
    }
  };

  // ── sprites (dusk) ──────────────────────────────────────────────────
  const CASTLE_SIL = [
    '..............f...............',
    '..............ff..............',
    '..............f...............',
    '..............#...............',
    '.............###..............',
    '............#####.............',
    '...........#######............',
    '...........#######............',
    '............#####.............',
    '.....#.......###.......#......',
    '....###.....#####.....###.....',
    '....###....#######....###.....',
    '....#w#....###w###....#w#.....',
    '....###....#######....###.....',
    '....###....###w###....###.....',
    '.#.#####.#.#######.#.#####.#..',
    '.##########w###w###########...',
    '.##w#####w#########w#####w##..',
    '.###########################..',
    '.###########################..'
  ];
  const BOAT = [
    '.....f.....',
    '.....#.....',
    '....s#.....',
    '...ss#S....',
    '..sss#SS...',
    '.ssss#SSS..',
    '.....#.....',
    'bbbbbbbbbbl',
    '.bbbbbbbbb.',
    '..bbbbbbb..'
  ];
  const BIRD = [['#...#', '.#.#.', '..#..'], ['.....', '##.##', '..#..']];

  // ── palace (isles) ──────────────────────────────────────────────────
  function drawPalace(L, cx, gy, pal) {
    const C = {}; Object.keys(pal).forEach(k => { C[k] = P(pal[k]); });
    const box = (x0, y0, w, h) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const u = (x - x0) / Math.max(1, w - 1);
        let c = u > 0.7 ? C.wallShade : C.wall;
        if (u > 0.7 && bayer(x, y) < 0.25) c = C.wallDeep;
        if (x === x0 || x === x0 + w - 1 || y === y0) c = C.outline;
        L.set(x, y, c);
      }
    };
    const crenels = (x0, y0, w) => { for (let x = x0; x < x0 + w; x++) if (((x - x0) % 4) < 2) { L.set(x, y0 - 1, C.outline); L.set(x, y0 - 2, C.outline); } };
    const onion = (dcx, by, r, h) => {
      for (let j = 0; j < h; j++) {
        const t = j / (h - 1);
        const w = t < 0.32 ? r * (0.82 + 0.18 * Math.sin((t / 0.32) * Math.PI / 2)) : r * Math.pow(Math.cos(((t - 0.32) / 0.68) * Math.PI / 2), 1.35);
        const hw = Math.round(w), y = by - j;
        for (let x = dcx - hw; x <= dcx + hw; x++) {
          const u = hw ? (x - dcx) / hw : 0;
          let c = u < -0.4 ? C.domeHi : (u > 0.35 ? C.domeShade : C.dome);
          if (u > 0.35 && bayer(x, y) < 0.3) c = C.dome;
          if (hw > 0 && Math.abs(x - dcx) === hw) c = C.outline;
          L.set(x, y, c);
        }
      }
      L.set(dcx, by - h, C.outline); L.set(dcx, by - h - 1, C.domeShade); L.set(dcx, by - h - 2, C.dome);
    };
    const win = (x, y, lit) => { const c = lit ? C.winLit : C.win; L.set(x, y, c); L.set(x, y + 1, c); L.set(x + 1, y, c); L.set(x + 1, y + 1, c); L.set(x, y - 1, c); };
    // minarets (behind)
    [[cx - 18, gy], [cx + 16, gy]].forEach(([mx]) => {
      box(mx, gy - 32, 3, 32);
      for (let x = mx - 1; x <= mx + 3; x++) { L.set(x, gy - 24, C.outline); L.set(x, gy - 25, x === mx + 3 ? C.wallShade : C.wall); }
      onion(mx + 1, gy - 33, 2, 5);
    });
    // corner towers
    [[cx - 27, 5], [cx + 22, 5]].forEach(([tx, w]) => { box(tx, gy - 17, w, 17); onion(tx + 2, gy - 18, 3, 6); win(tx + 1, gy - 12, false); });
    // outer wall
    box(cx - 23, gy - 9, 46, 9); crenels(cx - 23, gy - 9, 46);
    for (let x = cx - 20; x < cx + 20; x += 6) if (Math.abs(x - cx) > 5) win(x, gy - 6, hash(x, 3) > 0.6);
    // gate
    for (let y = gy - 6; y < gy; y++) for (let x = cx - 2; x <= cx + 2; x++) if (!(y === gy - 6 && Math.abs(x - cx) === 2)) L.set(x, y, C.gate);
    // keep + drum + dome
    box(cx - 10, gy - 21, 21, 12); crenels(cx - 10, gy - 21, 21);
    [-7, -3, 2, 6].forEach((dx, i) => win(cx + dx, gy - 17, i % 2 === 1));
    box(cx - 6, gy - 25, 13, 4);
    onion(cx, gy - 26, 8, 15);
    // pennant
    const fy = gy - 26 - 17; L.set(cx + 1, fy, C.flag); L.set(cx + 2, fy, C.flag); L.set(cx + 1, fy + 1, C.flag); L.set(cx + 3, fy, C.flag);
  }

  function drawCypress(L, bx, by, h, w, pal) {
    const base = P(pal.base), hi = P(pal.hi), lo = P(pal.lo), trunk = P(pal.trunk);
    L.set(bx, by, trunk); L.set(bx, by - 1, trunk);
    for (let j = 2; j < h; j++) {
      const t = (j - 2) / Math.max(1, h - 3);
      const prof = t < 0.22 ? 0.72 + t * 1.25 : Math.pow(1 - (t - 0.22) / 0.78, 0.85);
      const hw = Math.max(0, Math.round(w * prof)), y = by - j;
      for (let x = bx - hw; x <= bx + hw; x++) {
        const u = hw ? (x - bx) / hw : 0;
        let c = u < -0.35 ? hi : (u > 0.4 ? lo : base);
        if (bayer(x, y) < 0.16) c = c === hi ? base : (c === base ? hi : base);
        L.set(x, y, c);
      }
    }
  }

  function drawPalm(L, bx, by, height, lean, pal) {
    const cT = P(pal.trunk), cTH = P(pal.trunkHi), cF = P(pal.base), cFH = P(pal.hi);
    let tx = bx, ty = by;
    for (let i = 0; i <= height; i++) {
      const t = i / height;
      const x = (1 - t) * (1 - t) * bx + 2 * (1 - t) * t * (bx + lean * 0.1) + t * t * (bx + lean);
      L.set(x, by - i, cT); L.set(x + 1, by - i, (i % 3 === 0) ? cTH : cT);
      tx = x; ty = by - i;
    }
    [-0.15, -0.55, -1.05, -2.1, -2.6, -3.0, 0.35, 2.8].forEach((a, k) => {
      const len = Math.round(height * (0.42 + 0.12 * ((k * 7) % 3) / 2));
      for (let s = 1; s <= len; s++) {
        const t = s / len, x = tx + Math.cos(a) * s, y = ty + Math.sin(a) * s * 0.55 + t * t * len * 0.6;
        L.set(x, y, cF); L.set(x, y - 1, t < 0.5 ? cFH : cF);
        if (s > 2 && s % 2 === 0) { L.set(x, y + 1, cF); if (t > 0.45) L.set(x, y + 2, cF); }
      }
    });
  }

  function puffyCloud(L, cx, cy, len, cols, seed) {
    const n = Math.max(3, Math.round(len / 8));
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      puffs.push({ x: cx - len / 2 + u * len, r: 3 + Math.round(4 * Math.sin(Math.PI * u) * (0.7 + 0.6 * hash(i, seed))) });
    }
    const maxR = Math.max.apply(null, puffs.map(p => p.r));
    const [shade, mid, lit, warm, hi] = cols.map(P);
    for (let y = Math.round(cy - maxR - 1); y <= cy; y++) {
      for (let x = Math.round(cx - len / 2 - maxR); x <= Math.round(cx + len / 2 + maxR); x++) {
        let best = null, bd = 1e9;
        for (const p of puffs) { const dx = x - p.x, dy = (y - cy) * 1.25, d = Math.sqrt(dx * dx + dy * dy) / p.r; if (d < 1 && d < bd) { bd = d; best = { dx, dy, r: p.r }; } }
        if (!best) continue;
        const nx = best.dx / best.r, ny = best.dy / best.r;
        const light = -nx * 0.55 - ny * 0.85;
        let c = light > 0.62 ? hi : light > 0.3 ? lit : light > -0.05 ? mid : shade;
        if (cy - y < 2) c = bayer(x, y) < 0.5 ? shade : mid;
        else if (light > 0.2 && light < 0.4 && bayer(x, y) < 0.35) c = warm;
        L.set(x, y, c);
      }
    }
  }

  // ── Scene ───────────────────────────────────────────────────────────
  function Scene(canvas, opts) {
    this.canvas = canvas;
    this.opts = Object.assign({ theme: 'isles', scale: 4, height: 160, horizon: 0.6, sunX: 0.08, sunLift: 10, castleX: 0.8, seed: 11, clearOf: null }, opts || {});
    this.pal = THEMES[this.opts.theme] || THEMES.isles;
    this.ctx = canvas.getContext('2d');
    this.running = false;
    this.build();
    this.render(0);
    const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) this.start();
    // Rebuild when the host resizes (viewport changes, web fonts reflowing the hero, etc.).
    let t;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => { const p = this.canvas.parentElement; if (p.clientWidth !== this.lastW || p.clientHeight !== this.lastH) { this.build(); this.render(this.last || 0); } }, 120); };
    if ('ResizeObserver' in global) new ResizeObserver(onResize).observe(this.canvas.parentElement);
    else global.addEventListener('resize', onResize);
  }

  Scene.prototype.layout = function (W) {
    // Keep the castle clear of an overlapping element (e.g. the hero message window).
    const o = this.opts;
    let castleX = o.castleX, sunX = o.sunX;
    const el = o.clearOf && document.querySelector(o.clearOf);
    if (el) {
      const cr = this.canvas.getBoundingClientRect(), er = el.getBoundingClientRect();
      const overlaps = er.top < cr.bottom && er.bottom > cr.top;
      const free = (cr.right - er.right) / cr.width;
      if (overlaps && free > 0.2) castleX = ((er.right - cr.left) / cr.width) + free / 2;
      else if (overlaps) castleX = 0.5;
      else castleX = 0.5;
    }
    return { castleX: Math.min(0.9, Math.max(0.12, castleX)), sunX };
  };

  Scene.prototype.build = function () {
    const o = this.opts, pal = this.pal;
    const scale = typeof o.scale === 'function' ? o.scale() : o.scale;
    const parent = this.canvas.parentElement;
    this.lastW = parent.clientWidth; this.lastH = parent.clientHeight;
    const W = Math.ceil(parent.clientWidth / scale);
    const H = Math.max(60, Math.ceil(parent.clientHeight / scale));
    const R = Math.min(H, 160); // reference height for sprite-ish sizes, so tall hosts get more sea, not bigger art
    this.W = W; this.H = H;
    this.canvas.width = W; this.canvas.height = H;
    this.canvas.style.width = (W * scale) + 'px';
    this.canvas.style.height = (H * scale) + 'px';
    parent.style.backgroundColor = pal.sea[pal.sea.length - 1];
    this.ctx.imageSmoothingEnabled = false;
    const r = rng(o.seed);
    const hz = typeof o.horizonPx === 'function' ? Math.min(H - 10, o.horizonPx()) : Math.round(H * o.horizon); this.hz = hz;
    const lay = this.layout(W);
    const cx = Math.round(W * lay.castleX);
    const sun = { x: Math.round(W * lay.sunX), y: hz + 1 - o.sunLift, r: Math.max(7, Math.round(R * 0.07)) };
    this.sun = sun;

    // sky + sun + clouds
    const sky = layer(W, H);
    gradient(sky, 0, hz, pal.sky.map(P), 0.85);
    const [g0, g1, g2] = pal.sun.map(P);
    for (let y = Math.max(0, sun.y - sun.r * 3); y < hz; y++) for (let x = Math.max(0, sun.x - sun.r * 4); x < Math.min(W, sun.x + sun.r * 4); x++) {
      const dx = x - sun.x, dy = (y - sun.y) * 1.1, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= sun.r) sky.set(x, y, d < sun.r * 0.62 ? g2 : (d < sun.r * 0.86 ? g1 : (bayer(x, y) < 0.5 ? g1 : g0)));
      else if (d < sun.r * 2.2 && bayer(x, y) < (1 - (d - sun.r) / (sun.r * 1.2)) * 0.55) sky.set(x, y, g0);
    }
    if (pal.clouds === 'puffy') {
      const n = Math.max(3, Math.round(W / 70));
      for (let k = 0; k < n; k++) {
        const ccx = (k + 0.3 + r() * 0.5) * (W / n), ccy = Math.round(hz * (0.22 + r() * 0.42)), len = 18 + r() * 34;
        if (Math.abs(ccx - cx) < 34 && ccy > hz * 0.35) continue; // keep the palace skyline clear
        puffyCloud(sky, ccx, ccy, len, pal.cloud, k * 13 + o.seed);
      }
    } else {
      const [cD, cM, cL, cH] = pal.cloud.map(P);
      const n = Math.max(4, Math.round(W / 55));
      for (let k = 0; k < n; k++) {
        const cy = Math.floor(hz * (0.2 + r() * 0.62)), x0 = Math.floor(r() * W), len = Math.floor(24 + r() * 60), thick = 2 + Math.floor(r() * 3), warm = cy / hz;
        for (let i = 0; i < len; i++) {
          const x = x0 + i; if (x >= W) break;
          const th = Math.max(1, Math.round(thick * Math.sin(Math.PI * i / len) * (0.55 + 0.45 * vnoise(i * 0.18, k * 9.1))));
          for (let j = 0; j < th; j++) {
            let c = j === 0 ? (warm > 0.55 ? cL : cM) : (j === th - 1 ? cD : cM);
            if (j === 0 && warm > 0.7 && Math.abs(x - sun.x) < W * 0.25 && bayer(x, cy - j) < 0.6) c = cH;
            sky.set(x, cy - j, c);
          }
        }
      }
    }
    this.skyC = sky.flush();

    this.stars = [];
    const nStars = Math.floor(W * hz * pal.stars);
    for (let i = 0; i < nStars; i++) this.stars.push({ x: Math.floor(r() * W), y: Math.floor(Math.pow(r(), 1.8) * hz * 0.5), tw: r() < 0.4, ph: r() * 6.28, sp: 0.6 + r() * 2.4, big: r() < 0.06 });

    // sea
    const sea = layer(W, H);
    gradient(sea, hz, H, pal.sea.map(P), 0.7);
    this.seaC = sea;

    // isles
    const isl = layer(W, H);
    const [f0, f1, f2] = pal.far.map(P);
    for (let x = 0; x < W; x++) {
      const h = Math.floor((fbm(x * 0.022, o.seed + 3) - 0.5) * 34);
      for (let j = 1; j <= h; j++) isl.set(x, hz - j, j >= h - 1 ? f0 : (j < 3 && bayer(x, j) < 0.5 ? f2 : f1));
    }
    const I = {}; Object.keys(pal.isle).forEach(k => { I[k] = P(pal.isle[k]); });
    const hw = Math.max(34, Math.round(W * 0.13)), peak = Math.round(R * 0.12);
    const heights = [];
    for (let x = cx - hw; x <= cx + hw; x++) {
      const u = (x - cx) / hw;
      const plateau = Math.abs(u) < 0.45 ? 1 : Math.pow(Math.max(0, 1 - Math.pow((Math.abs(u) - 0.45) / 0.55, 2)), 0.8);
      const h = Math.round(peak * plateau * (0.93 + 0.14 * vnoise(x * 0.3, 11)));
      heights.push([x, h]);
      for (let j = 1; j <= h; j++) {
        const y = hz - j + 1;
        let c;
        if (pal.castle === 'silhouette') c = j === h && x < cx - 2 ? I.grassHi : I.grass;
        else if (j >= h - 1) c = (bayer(x, y) < 0.45 ? I.grassHi : I.grass);
        else if (j === h - 2) c = I.grassLo;
        else { const shade = u > 0.25 ? I.rockLo : (u < -0.5 ? I.rockHi : I.rock); c = (bayer(x, y) < 0.2) ? I.rockDeep : shade; if (j < 3 && bayer(x, y) < 0.5) c = I.rockLo; }
        isl.set(x, y, c);
      }
      if (pal.castle !== 'silhouette' && bayer(x, hz) < 0.6) isl.set(x, hz + 1, I.foam);
    }
    this.isleHeights = heights;
    const gy = hz - peak + 1;
    if (pal.castle === 'palace') {
      drawPalace(isl, cx, gy, pal.palace);
      [cx - hw + 10, cx - hw + 15, cx + hw - 12, cx + hw - 17].forEach((tx, i) => {
        const h = heights.find(p => p[0] === tx); if (h) drawCypress(isl, tx, hz - h[1], 9 + (i % 2) * 3, 2, pal.tree);
      });
    } else {
      const S = pal.silhouette;
      sprite(isl, CASTLE_SIL, cx - 14, hz - peak - CASTLE_SIL.length + 3, { '#': P(S.body), w: P(S.win), f: P(S.flag) });
    }
    this.islC = isl.flush();

    // isle reflection + sea flush
    const reflC = pal.castle === 'palace' ? P(pal.sea[5]) : P(pal.isle.grass);
    for (const [x, h] of heights) for (let j = 2; j <= Math.round(h * 0.55); j++) { const y = hz + j; if (y % 2 === 0 && hash(x * 13 + y * 7, 7) > 0.3 + j / h * 0.6) sea.set(x, y, reflC); }
    this.seaC = sea.flush();

    const depth = H - hz;
    this.glints = [];
    const nG = Math.floor(W * depth * 0.012);
    for (let i = 0; i < nG; i++) {
      const y = hz + 2 + Math.floor(Math.pow(r(), 0.8) * (depth - 3));
      this.glints.push({ x: Math.floor(r() * W), y, len: 2 + Math.floor(r() * 4 * ((y - hz) / depth + 0.3)), ph: r() * 6.28, sp: 0.8 + r() * 1.6 });
    }

    // foreground
    const fg = layer(W, H);
    const F = { base: P(pal.fg.base), top: P(pal.fg.top), hi: P(pal.fg.hi), lo: P(pal.fg.lo), rock: P(pal.fg.rock), rockHi: P(pal.fg.rockHi) };
    const flowers = pal.fg.flowers.map(P);
    const tops = {};
    const cliff = (x0, x1, lo, hi, dir, seed) => {
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
        const u = dir > 0 ? (x - x0) / (x1 - x0) : (x1 - x) / (x1 - x0);
        const s = u * u * (3 - 2 * u);
        const top = Math.round(H - (lo + (hi - lo) * s) - fbm(x * 0.12, seed) * 6);
        tops[x] = top;
        for (let y = top; y < H; y++) {
          let c = F.base;
          if (y === top) c = bayer(x, y) < 0.5 ? F.hi : F.top;
          else if (y === top + 1) c = F.top;
          else if (y > top + 5 && bayer(x, y) < 0.2) c = F.lo;
          else if (y > top + 3 && hash(x * 3 + y, seed) > 0.93) c = F.rockHi;
          fg.set(x, y, c);
        }
        if (bayer(x, top) < 0.22) { fg.set(x, top - 1, F.top); if (hash(x, seed) > 0.7) fg.set(x, top - 2, F.top); }
        if (flowers.length && hash(x * 7, seed) > 0.86) fg.set(x, top - 1, flowers[Math.floor(hash(x, seed + 1) * flowers.length)]);
      }
    };
    if (pal.trees === 'cypress') {
      cliff(Math.round(W * 0.9), W, 3, Math.round(R * 0.22), 1, 5);
      cliff(0, Math.round(W * 0.12), 2, Math.round(R * 0.14), -1, 9);
      [[0.955, 26, 4], [0.925, 19, 3], [0.03, 17, 3]].forEach(([fx, h, w]) => { const x = Math.round(W * fx); if (tops[x] !== undefined) drawCypress(fg, x, tops[x], Math.round(h * R / 160), w, pal.tree); });
    } else {
      cliff(Math.round(W * 0.88), W, 4, Math.round(R * 0.27), 1, 5);
      cliff(0, Math.round(W * 0.13), 2, Math.round(R * 0.12), -1, 9);
      drawPalm(fg, Math.round(W * 0.957), Math.round(H - R * 0.2), Math.round(R * 0.3), -9, pal.tree);
    }
    this.fgC = fg.flush();

    this.birds = [0, 1, 2].map(i => ({ x: W * (0.2 + i * 0.12), y: hz * (0.3 + i * 0.07), sp: 2.2 + i * 0.7, ph: i * 1.7 }));
    this.boat = pal.boat ? { x: Math.round(W * 0.05), y: hz + Math.round(depth * 0.18) } : null;
  };

  Scene.prototype.render = function (time) {
    const c = this.ctx, W = this.W, H = this.H, hz = this.hz, pal = this.pal, t = time / 1000;
    this.last = time;
    c.drawImage(this.skyC, 0, 0);
    for (const s of this.stars) {
      const v = s.tw ? Math.sin(t * s.sp + s.ph) : 1;
      if (v < -0.3) continue;
      c.fillStyle = v > 0.55 ? '#ffffff' : '#8fa0de';
      c.fillRect(s.x, s.y, 1, 1);
      if (s.big && v > 0.7) { c.fillRect(s.x - 1, s.y, 3, 1); c.fillRect(s.x, s.y - 1, 1, 3); }
    }
    c.fillStyle = pal.bird;
    for (const b of this.birds) {
      const bx = Math.round((b.x + t * b.sp) % (W + 20)) - 10, by = Math.round(b.y + Math.sin(t * 0.8 + b.ph) * 2);
      BIRD[Math.floor(t * 3 + b.ph) % 2].forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') c.fillRect(bx + x, by + y, 1, 1); });
    }
    c.drawImage(this.seaC, 0, 0);
    c.drawImage(this.islC, 0, 0);
    const refl = pal.refl, depth = H - hz, sun = this.sun;
    for (let y = hz + 1; y < H; y++) {
      const d = (y - hz) / depth;
      if ((y + Math.floor(t * 4)) % 2 === 1 && d > 0.08) continue;
      const half = Math.round(sun.r * (0.55 + d * 1.6));
      c.fillStyle = refl[Math.min(refl.length - 1, Math.floor(d * refl.length * 1.1))];
      const wob = Math.round(Math.sin(t * 2.2 + y * 0.9) * (1 + d * 3));
      let x = sun.x - half + wob;
      while (x < sun.x + half + wob) {
        const seg = 1 + Math.floor(hash(y * 31 + x, Math.floor(t * 3)) * 4);
        if (hash(x * 7 + y, Math.floor(t * 2.5) + 3) > 0.28 + d * 0.3) c.fillRect(x, y, seg, 1);
        x += seg + 1;
      }
    }
    for (const g of this.glints) {
      const v = Math.sin(t * g.sp + g.ph);
      if (v < 0.35) continue;
      c.fillStyle = v > 0.85 ? pal.glintHi : pal.glint;
      c.fillRect(g.x + Math.round(Math.sin(t + g.ph) * 1.5), g.y, g.len, 1);
    }
    if (this.boat) {
      const B = pal.boat, bc = { '#': B.hull, b: B.hull, s: B.sail, S: B.sailShade, f: B.flag, l: B.lantern };
      const bx = this.boat.x + Math.round(Math.sin(t * 0.05) * 6), by = this.boat.y + Math.round(Math.sin(t * 1.6) * 0.8) - BOAT.length + 2;
      BOAT.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const col = bc[row[x]]; if (col) { c.fillStyle = col; c.fillRect(bx + x, by + y, 1, 1); } } });
    }
    c.drawImage(this.fgC, 0, 0);
  };

  Scene.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    let acc = 0, prev = performance.now();
    const loop = now => {
      if (!this.running) return;
      acc += now - prev; prev = now;
      if (acc > 90) { acc = 0; this.render(now); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    if (!this.io && 'IntersectionObserver' in global) {
      this.io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) this.start(); else { this.running = false; cancelAnimationFrame(this.raf); } }));
      this.io.observe(this.canvas);
    }
  };

  // ── pixel title: gold, outlined, dithered ─────────────────────────
  function pixelTitle(canvas, text, opts) {
    const o = Object.assign({ font: '700 17px Cinzel', scale: 3, pad: 3, fill: ['#fff3b0', '#ffd24a', '#f2a91e', '#d27a12', '#9c4f0c'], outline: '#2a1206', shadow: '#12081f', hi: '#fffbe0' }, opts || {});
    const m = document.createElement('canvas').getContext('2d');
    m.font = o.font;
    const met = m.measureText(text);
    const asc = Math.ceil(met.actualBoundingBoxAscent), desc = Math.ceil(met.actualBoundingBoxDescent);
    const w = Math.ceil(met.width) + o.pad * 2 + 2, h = asc + desc + o.pad * 2 + 2;
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const tc = tmp.getContext('2d');
    tc.font = o.font; tc.fillStyle = '#fff'; tc.fillText(text, o.pad, o.pad + asc);
    const a = tc.getImageData(0, 0, w, h).data;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = a[i * 4 + 3] > 120 ? 1 : 0;
    const M = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
    const out = layer(w, h), outline = P(o.outline), shadow = P(o.shadow), hi = P(o.hi), fills = o.fill.map(P), fn = fills.length - 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!M(x, y) && (M(x - 1, y - 1) || M(x - 1, y - 2))) out.set(x, y, shadow);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (M(x, y)) continue;
      if (M(x - 1, y) || M(x + 1, y) || M(x, y - 1) || M(x, y + 1) || M(x - 1, y - 1) || M(x + 1, y - 1) || M(x - 1, y + 1) || M(x + 1, y + 1)) out.set(x, y, outline);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!M(x, y)) continue;
      const t = Math.max(0, Math.min(1, (y - o.pad) / Math.max(1, asc))) * fn;
      const i = Math.min(fn - 1, Math.floor(t)), f = t - i;
      out.set(x, y, !M(x, y - 1) ? hi : (f > bayer(x, y) ? fills[i + 1] : fills[i]));
    }
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(out.flush(), 0, 0);
    canvas.style.width = (w * o.scale) + 'px';
    canvas.style.height = (h * o.scale) + 'px';
  }

  // Auto-mount: <canvas data-scene="isles" data-scene-opts='{...}'> fills its parent;
  // <h1 data-pixel-title="TEXT"> gets a gold pixel logo (text stays for screen readers).
  function mount() {
    const override = new URLSearchParams(location.search).get('scene');
    document.querySelectorAll('canvas[data-scene]').forEach(cv => {
      const opts = JSON.parse(cv.dataset.sceneOpts || '{}');
      opts.theme = THEMES[override] ? override : cv.dataset.scene;
      const scale = opts.scale || 4, stack = opts.stackBelow || 700;
      const hzDesk = opts.horizonDesk || 96, hzStack = opts.horizonStack || 62;
      opts.scale = () => (global.innerWidth < 700 ? Math.min(3, scale) : scale);
      opts.horizonPx = () => (global.innerWidth <= stack ? hzStack : hzDesk);
      new Scene(cv, opts);
    });
    document.querySelectorAll('[data-pixel-title]').forEach(el => {
      const font = el.dataset.pixelFont || '700 17px Cinzel';
      const m = /^(\d+)\s+(\d+)px\s+(.+)$/.exec(font) || ['', '700', '17', 'Cinzel'];
      const draw = () => {
        let cv = el.querySelector('canvas');
        if (!cv) { cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); el.appendChild(cv); }
        const avail = el.clientWidth || el.parentElement.clientWidth;
        // Prefer 3x, then 2x; shrink the source font before giving up and dropping to 1x.
        let done = false;
        for (const scale of [3, 2]) {
          for (let size = +m[2]; size >= 11 && !done; size--) {
            pixelTitle(cv, el.dataset.pixelTitle, { font: `${m[1]} ${size}px ${m[3]}`, scale });
            if (cv.width * scale <= avail && (scale === 2 || size >= +m[2] - 3)) done = true;
          }
          if (done) break;
        }
        if (!done) { cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px'; }
        el.classList.add('is-pixel');
      };
      (document.fonts ? document.fonts.load(font).then(draw, draw) : Promise.resolve().then(draw));
      let t; global.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(draw, 150); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  global.KQScene = { Scene, pixelTitle, THEMES };
})(window);
