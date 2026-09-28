/* map.js: the Magic Map, a travel map of the site in the spirit of the one in King's Quest VI.
   Everything is original: the art is drawn procedurally at 320x200 and the sound is synthesized.
   site.js loads it on every page. It draws the islands in the header's map strip (the site's menu),
   plays the travel animation when you pick one, and runs the full-screen map dialog. */
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
  // Ridged multifractal noise: sharp crests and creases, the backbone of the mountain ranges.
  function ridged(x, y, s, oct = 4) {
    let sum = 0, amp = 0.5, f = 1, w = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      let n = 1 - Math.abs(noise2(x * f, y * f, s + o * 7) * 2 - 1);
      n = n * n * w;
      w = clamp(n * 1.8, 0, 1);
      sum += n * amp; norm += amp;
      f *= 2.1; amp *= 0.5;
    }
    return sum / norm;
  }
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
    { id: 'mountain', name: 'About', href: '/about', blob: { cx: 154, cy: 60, rx: 42, ry: 22, seed: 3, amp: 0.34 }, label: { x: 40, y: 42 } },
    { id: 'wonder', name: 'Writing', href: '/#writing', arc: { cx: 100, cy: 126, r: 40, a0: 3.30, a1: 4.95, th: 17, seed: 5 }, label: { x: 82, y: 104 } },
    { id: 'beast', name: 'Projects', href: '/#projects', blob: { cx: 222, cy: 106, rx: 25, ry: 11, seed: 7, amp: 0.34 }, label: { x: 210, y: 71 } },
    { id: 'crown', name: 'Contact', href: '/#contact', blob: { cx: 142, cy: 154, rx: 42, ry: 21, seed: 11, amp: 0.36 }, label: { x: 194, y: 150 } }
  ];

  // Terrain per island. Peaks are [u, v, spreadU, spreadV, height] in island-relative units
  // (u, v span -1..1 across the island's radii). The crescent uses spine knobs [t along arc, spread, height].
  const TOPO = {
    mountain: { rise: 11, hills: 0.2, detail: 1.0, peaks: [[-0.12, -0.2, 0.5, 0.6, 1.0], [0.52, 0.0, 0.28, 0.45, 0.66], [-0.62, 0.2, 0.22, 0.4, 0.5]] },
    crown: { rise: 8, hills: 0.34, detail: 0.5, peaks: [[0.45, -0.32, 0.24, 0.42, 0.8], [-0.52, 0.05, 0.3, 0.45, 0.45]],
      lake: [-0.05, 0.1, 0.14, 0.26], river: [[-0.05, 0.1], [0.25, 0.45], [0.55, 1.3]] },
    wonder: { rise: 6, hills: 0.35, detail: 0.4, spine: [[0.26, 0.12, 0.85], [0.52, 0.08, 0.45], [0.76, 0.1, 0.7]] },
    beast: { rise: 8, hills: 0.3, detail: 0.7, peaks: [[-0.45, -0.1, 0.32, 0.7, 0.85], [0.5, 0.1, 0.32, 0.7, 0.62]] }
  };

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
      const g = isle.blob, a = isle.arc;
      const bx0 = Math.max(0, Math.floor(g ? g.cx - 1.9 * g.rx : a.cx - a.r - a.th - 4)), bx1 = Math.min(W - 1, Math.ceil(g ? g.cx + 1.9 * g.rx : a.cx + a.r + a.th + 4));
      const by0 = Math.max(0, Math.floor(g ? g.cy - 1.9 * g.ry : a.cy - a.r - a.th - 4)), by1 = Math.min(H - 1, Math.ceil(g ? g.cy + 1.9 * g.ry : a.cy + a.r + a.th + 4));
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
        const inside = g ? blobInside(g, x, y) : arcInside(a, x, y);
        if (inside) { mask[y * W + x] = 1; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
      const din = distance(mask, 1), dout = distance(mask, 0);
      let maxD = 1; for (let i = 0; i < W * H; i++) if (mask[i]) maxD = Math.max(maxD, din[i]);
      const seed = (isle.blob || isle.arc).seed, topo = TOPO[isle.id], b = isle.blob;
      const h = new Float32Array(W * H), water = new Uint8Array(W * H);
      const segDist = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy), 0, 1); return Math.hypot(px - ax - vx * t, py - ay - vy * t); };
      const river = topo.river && topo.river.map(([u, v]) => [b.cx + u * b.rx, b.cy + v * b.ry]);
      let maxH = 0.001;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x; if (!mask[i]) continue;
        // Domain-warped noise so hills and ranges wander instead of following the coastline.
        const wx = x + 6 * (fbm2(x * 0.05, y * 0.05, seed + 1) - 0.5), wy = y + 6 * (fbm2(x * 0.05, y * 0.05, seed + 2) - 0.5);
        const hills = fbm2(wx * 0.06, wy * 0.06, seed + 3, 3);
        const rdg = ridged(wx * 0.05, wy * 0.07, seed + 4, 3);
        let mtn = 0;
        if (b) {
          topo.peaks.forEach(([u, v, su, sv, a], k) => {
            const dx = (x - (b.cx + u * b.rx)) / (su * b.rx), dy = (y - (b.cy + v * b.ry)) / (sv * b.ry);
            const r2 = dx * dx + dy * dy, ang = Math.atan2(dy, dx);
            // Spurs: ridges radiating from the summit with valleys between, like a real range from above.
            const spur = Math.pow(1 - Math.abs(Math.sin(ang * 2.5 + 1.6 * fbm2(Math.sqrt(r2) * 1.5, ang, seed + k * 9))), 2.2);
            const fall = Math.exp(-r2);
            mtn = Math.max(mtn, a * fall * (0.62 + 0.38 * spur * smooth(0.02, 0.35, r2)));
          });
        } else {
          const A = isle.arc;
          let th = Math.atan2(y - A.cy, x - A.cx); if (th < 0) th += Math.PI * 2;
          const t = (th - A.a0) / (A.a1 - A.a0);
          const d = Math.min(1, Math.abs(Math.hypot(x - A.cx, y - A.cy) - (A.r + 3 * Math.sin(t * 5 + A.seed))) / (A.th / 2));
          let knob = 0; topo.spine.forEach(([tc, w, a]) => { knob = Math.max(knob, a * Math.exp(-(((t - tc) / w) ** 2))); });
          mtn = Math.pow(1 - d * d, 0.4) * (0.15 + 0.85 * knob);
        }
        let v = 0.04 + topo.hills * hills * (1 - 0.6 * mtn) + mtn * (0.82 + 0.18 * topo.detail * rdg);
        v *= smooth(0, 3.5, din[i]);  // beaches: a short ramp at the shore, then free-form interior
        if (topo.lake) {
          const [lu, lv, lsu, lsv] = topo.lake, lx = b.cx + lu * b.rx, ly = b.cy + lv * b.ry;
          const q = ((x - lx) / (lsu * b.rx)) ** 2 + ((y - ly) / (lsv * b.ry)) ** 2;
          v *= 1 - 0.7 * Math.exp(-q * 0.6);  // basin around the lake
          if (q < 1 + 0.4 * (fbm2(x * 0.4, y * 0.4, seed + 50) - 0.5)) water[i] = 1;
        }
        if (river) {
          let best = 1e9;
          for (let k = 0; k < river.length - 1; k++) best = Math.min(best, segDist(x, y, river[k][0], river[k][1], river[k + 1][0], river[k + 1][1]));
          v -= 0.2 * Math.exp(-((best / 3) ** 2));  // river valley
          if (best < 0.85) water[i] = 1;
        }
        h[i] = Math.max(0, v);
        maxH = Math.max(maxH, h[i]);
      }
      for (let i = 0; i < W * H; i++) h[i] = water[i] ? 0.06 : h[i] / maxH;
      // Shading: one light from the northwest, plus cast shadows marched toward the light.
      const S = topo.rise, tone = new Float32Array(W * H);
      const Lx = -0.6, Ly = -0.75, Lz = 0.85, ln = Math.hypot(Lx, Ly, Lz), mx = -0.62, my = -0.78;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x; if (!mask[i]) continue;
        const gx = (h[i + 1] - h[i - 1]) * 4.5, gy = (h[i + W] - h[i - W]) * 4.5;
        const lambert = (-gx * Lx - gy * Ly + Lz) / (Math.hypot(gx, gy, 1) * ln);
        let shadow = 0;
        for (let k = 1; k <= 10; k++) {
          const qx = Math.round(x + mx * k), qy = Math.round(y + my * k);
          if (qx < 0 || qy < 0 || qx >= W || qy >= H) break;
          if (h[qy * W + qx] * S > h[i] * S + k * 0.9) { shadow = 1; break; }
        }
        let t = 0.72 - 0.12 * h[i] + (lambert - 0.78) * 1.25 - shadow * 0.14 + (h[i] < 0.14 ? 0.08 : 0);
        if (h[i] > 0.75 && lambert > 0.7) t += (h[i] - 0.75) * 0.7;  // pale rock on sunlit summits
        if (din[i] < 1.6) t = Math.max(t, 0.82);  // pale sand along the shore
        tone[i] = clamp(t, 0.02, 1);
      }
      // Flat ink look: dark rim, lighter middle, mottled.
      const ink = new Uint32Array(W * H);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x; if (!mask[i]) continue;
        const t = smooth(0, Math.min(maxD, 9), din[i]) * 0.85 + (fbm2(x * 0.12, y * 0.12, seed + 5) - 0.5) * 0.35;
        ink[i] = pick(INK, t, x, y);
      }
      Object.assign(isle, { mask, din, dout, h, ink, water, tone, box: { x0, y0, x1, y1 } });
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
  let basePx = null;
  function ensurePrepared() { if (basePx) return; prepareIsles(); basePx = new Uint32Array(W * H); drawBase(basePx); }

  // Paint the map: flat ink islands, an optional hover outline, and raised islands (Map isle -> { ring, rise }).
  function paintMap(px, hover, raised) {
    px.set(basePx);
    ISLES.forEach(isle => {
      if (raised && raised.has(isle)) return;
      const { x0, y0, x1, y1 } = isle.box;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (isle.mask[i]) px[i] = isle.ink[i]; }
      if (hover === isle) {
        for (let y = y0 - 3; y <= y1 + 3; y++) for (let x = x0 - 3; x <= x1 + 3; x++) {
          const i = y * W + x, d = isle.dout[i];
          if (d > 0.9 && d < 2.1 && ((x + y) & 1)) px[i] = HOVER;
        }
      }
    });
    if (raised) raised.forEach((lv, isle) => drawRising(px, isle, lv.ring, lv.rise));
  }

  let canvas, ctx, img;
  const state = { hover: null, travel: null, ring: 0, rise: 0 };
  function render() {
    paintMap(new Uint32Array(img.data.buffer), state.hover, state.travel ? new Map([[state.travel, { ring: state.ring, rise: state.rise }]]) : null);
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
    const S = TOPO[isle.id].rise * r, colorMix = smooth(0, 0.55, r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x; if (!isle.mask[i]) continue;
      const t = isle.tone[i], useTerrain = bayer(x, y) < colorMix * 1.05;
      const ty = Math.round(y - isle.h[i] * S);
      // Pixels between this column's raised top and its ground point are the slope facing the
      // viewer; shade them like the slope (a bit darker lower down), not as a flat cliff color.
      for (let yy = ty + 1; yy <= y; yy++) {
        if (yy < 0) continue;
        const up = (y - yy) / Math.max(1, y - ty);
        px[yy * W + x] = useTerrain ? pick(TERRAIN, t - 0.05 - (1 - up) * 0.1, x, yy) : isle.ink[i];
      }
      if (ty < 0) continue;
      if (!useTerrain) px[ty * W + x] = isle.ink[i];
      else if (isle.water[i]) px[ty * W + x] = r > 0.4 && bayer(x, ty) < 0.4 ? RING_MID : RING_IN;
      else px[ty * W + x] = pick(TERRAIN, t, x, ty);
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

  function fontLink() {
    if (document.querySelector('link[data-kq-map-font]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.dataset.kqMapFont = '1';
    l.href = 'https://fonts.googleapis.com/css2?family=Jacquarda+Bastarda+9&display=swap';
    document.head.appendChild(l);
  }

  function build() {
    fontLink();
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
      '<h2 class="kq-sr" id="kq-map-title">Map of the site</h2>' +
      '<p class="kq-map__hint">Touch an island to travel</p>' + isles +
      '<div class="kq-narr" role="status" aria-live="polite" hidden><span class="kq-narr__cap" aria-hidden="true">Y</span><span class="kq-sr">Y</span>ou feel a strange pulling sensation....</div>' +
      '</div><div class="kq-map__legend">' + legend + '</div>';
    document.body.appendChild(root);
    frame = root.querySelector('.kq-map__frame');
    narr = root.querySelector('.kq-narr');
    canvas = root.querySelector('canvas');
    ctx = canvas.getContext('2d');
    img = ctx.createImageData(W, H);

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

  function isleAt(e, cv = canvas) {
    const r = cv.getBoundingClientRect();
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

  function open(fromEl, travelTo) {
    ensurePrepared();
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
    const here = ISLES.find(i => i.href === location.pathname) || ISLES[0];
    const first = root.querySelector(`.kq-map__isle[data-isle="${here.id}"]`);
    if (first) first.focus({ preventScroll: true });
    const dest = travelTo && ISLES.find(i => i.id === travelTo);
    if (dest) setTimeout(() => travel(dest, dest.href), reduce() ? 0 : 420);  // let the scroll unroll first
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
    goTo(href, true);
  }

  // Go somewhere through the pixel dissolve. Same-page targets scroll instead of reloading.
  function goTo(href, fromDialog) {
    const url = new URL(href, location.href);
    const samePage = url.pathname === location.pathname;
    const go = () => {
      if (samePage) {
        if (fromDialog) close();
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

  // ── header map strip: the site's menu ──────────────────────────────
  // Each nav item shows its island; the island for the page (or homepage section) you're on is raised.
  const strip = { items: [], hover: null, levels: new Map(), target: null, raf: 0, busy: false, narr: null };
  const SECTION_ISLE = { about: 'mountain', expertise: 'mountain', writing: 'wonder', projects: 'beast', contact: 'crown' };
  const scratch = new Uint32Array(W * H);

  function thumbRender(item) {
    const isle = item.isle, lv = strip.levels.get(isle) || 0, { x0, y0, x1, y1 } = isle.box;
    scratch.fill(0);
    if (lv > 0.001) drawRising(scratch, isle, lv, lv);
    else for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (isle.mask[i]) scratch[i] = isle.ink[i]; }
    if (strip.hover === isle && lv < 0.5) {
      for (let y = y0 - 3; y <= y1 + 3; y++) for (let x = x0 - 3; x <= x1 + 3; x++) {
        const i = y * W + x, d = isle.dout[i];
        if (d > 0.9 && d < 2.1 && ((x + y) & 1)) scratch[i] = HOVER;
      }
    }
    const { cx, cy, cw, ch } = item.crop;
    for (let y = 0; y < ch; y++) item.px.set(scratch.subarray((cy + y) * W + cx, (cy + y) * W + cx + cw), y * cw);
    item.ctx.putImageData(item.img, 0, 0);
  }

  function stripSet(id, ms = 650) {
    const isle = ISLES.find(i => i.id === id) || null;
    strip.items.forEach(it => { if (it.isle === isle) it.a.setAttribute('aria-current', it.a.pathname === location.pathname && !it.a.hash ? 'page' : 'location'); else it.a.removeAttribute('aria-current'); });
    if (isle === strip.target) return;
    strip.target = isle;
    if (reduce()) { strip.levels.clear(); if (isle) strip.levels.set(isle, 1); strip.items.forEach(thumbRender); return; }
    cancelAnimationFrame(strip.raf);
    let prev = performance.now();
    const step = now => {
      const dt = Math.min(64, now - prev) / ms; prev = now;
      let moving = false;
      strip.items.forEach(it => {
        const cur = strip.levels.get(it.isle) || 0, goal = it.isle === strip.target ? 1 : 0;
        const next = cur < goal ? Math.min(goal, cur + dt) : Math.max(goal, cur - dt);
        if (next === cur) return;
        moving = true;
        if (next > 0) strip.levels.set(it.isle, next); else strip.levels.delete(it.isle);
        thumbRender(it);
      });
      if (moving) strip.raf = requestAnimationFrame(step);
    };
    strip.raf = requestAnimationFrame(step);
  }

  // A shorter trip than the full map: narrator line, sound, the island rises in place, then the dissolve.
  function stripTravel(item) {
    if (strip.busy) return;
    if (global.KQScore) global.KQScore.award('map:5');
    if (reduce()) { goTo(item.a.href); return; }
    strip.busy = true;
    if (!strip.narr) {
      strip.narr = document.createElement('div');
      strip.narr.className = 'kq-narr kq-narr--toast';
      strip.narr.setAttribute('role', 'status');
      strip.narr.innerHTML = '<span class="kq-narr__cap" aria-hidden="true">Y</span><span class="kq-sr">Y</span>ou feel a strange pulling sensation....';
      document.body.appendChild(strip.narr);
    }
    strip.narr.hidden = false;
    document.documentElement.classList.add('kq-traveling');
    playPull();
    stripSet(item.isle.id, 700);
    setTimeout(() => {
      strip.narr.hidden = true;
      document.documentElement.classList.remove('kq-traveling');
      strip.busy = false;
      goTo(item.a.href);
    }, 1150);
  }

  function mountStrip() {
    const el = document.querySelector('.kq-strip');
    if (!el || strip.items.length) return;
    if (global.innerWidth <= 560) {  // phones use the Menu button; skip the work until there is room
      const retry = () => { if (global.innerWidth > 560) { global.removeEventListener('resize', retry); mountStrip(); } };
      global.addEventListener('resize', retry);
      return;
    }
    ensurePrepared();
    fontLink();
    strip.items = [...el.querySelectorAll('.kq-strip__item')].map(a => {
      const isle = ISLES.find(i => i.id === a.dataset.isle), b = isle.box;
      const cx = Math.max(0, b.x0 - 7), cy = Math.max(0, b.y0 - TOPO[isle.id].rise - 3);
      const cw = Math.min(W, b.x1 + 8) - cx, ch = Math.min(H, b.y1 + 7) - cy;
      const cv = a.querySelector('canvas');
      cv.width = cw; cv.height = ch;
      const cctx = cv.getContext('2d'), cimg = cctx.createImageData(cw, ch);
      const item = { a, isle, ctx: cctx, img: cimg, px: new Uint32Array(cimg.data.buffer), crop: { cx, cy, cw, ch } };
      const on = () => { strip.hover = isle; thumbRender(item); };
      const off = () => { if (strip.hover === isle) { strip.hover = null; thumbRender(item); } };
      a.addEventListener('mouseenter', on); a.addEventListener('mouseleave', off);
      a.addEventListener('focus', on); a.addEventListener('blur', off);
      a.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        stripTravel(item);
      });
      return item;
    });
    strip.items.forEach(thumbRender);
    const path = location.pathname.replace(/\.html$/, '');
    if (path === '/' || path === '/index') {
      const sections = Object.keys(SECTION_ISLE).map(id => document.getElementById(id)).filter(Boolean);
      const seen = new Set();
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => { if (en.isIntersecting) seen.add(en.target.id); else seen.delete(en.target.id); });
        const inView = sections.filter(sec => seen.has(sec.id));
        if (!strip.busy) stripSet(inView.length ? SECTION_ISLE[inView[inView.length - 1].id] : null);
      }, { rootMargin: '-45% 0px -45% 0px' });
      sections.forEach(sec => io.observe(sec));
    } else {
      stripSet(path === '/about' ? 'mountain' : path.startsWith('/blog/') ? 'wonder' : null);
    }
  }

  global.KQMap = { open, close, mountStrip };
})(window);
