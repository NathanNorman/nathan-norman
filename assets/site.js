/* site.js: score counter, magic map loader, and the pixel dissolve used between map destinations. */
(function () {
  'use strict';
  var KEY = 'kq-score-v1', MAX = 231;
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { s: 0, k: [] }; } catch (e) { return { s: 0, k: [] }; } }
  function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* private mode */ } }
  var st = load();

  function paint() { document.querySelectorAll('[data-kq-score]').forEach(function (el) { el.textContent = st.s; }); }

  function toast(text, near) {
    var score = document.querySelector('.kq-score');
    var anchor = score && score.offsetParent ? score : near;
    if (!anchor) return;
    var r = anchor.getBoundingClientRect();
    var t = document.createElement('div');
    t.className = 'kq-toast';
    t.setAttribute('aria-hidden', 'true');
    t.textContent = text;
    t.style.left = (r.left + r.width / 2) + 'px';
    t.style.top = (r.bottom + 6) + 'px';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1200);
  }

  function award(spec, near) {
    var parts = String(spec).split(':'), key = parts[0], pts = parseInt(parts[1], 10) || 0;
    if (!key || st.k.indexOf(key) !== -1) return;
    st.k.push(key);
    st.s = Math.min(MAX, st.s + pts);
    save(st);
    paint();
    toast('+' + pts, near);
  }

  paint();
  var page = document.body.getAttribute('data-kq-points');
  if (page) setTimeout(function () { award(page); }, 700);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-kq-pts]');
    if (a) award(a.getAttribute('data-kq-pts'), a);
  });
  window.addEventListener('storage', function (e) { if (e.key === KEY) { st = load(); paint(); } });
  window.KQScore = { award: award };

  // Pixel dissolve: plum cells appear (out) or clear (in) in ordered-dither order.
  var BAYER8 = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  function dissolve(mode, done) {
    var cell = 10, cols = Math.ceil(innerWidth / cell), rows = Math.ceil(innerHeight / cell);
    var cv = document.querySelector('canvas.kq-dissolve');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'kq-dissolve'; cv.setAttribute('aria-hidden', 'true'); document.body.appendChild(cv); }
    cv.width = cols; cv.height = rows;
    var ctx = cv.getContext('2d'), start = performance.now(), dur = mode === 'out' ? 380 : 480;
    var noise = new Float32Array(cols * rows);
    for (var n = 0; n < noise.length; n++) noise[n] = Math.random();
    ctx.fillStyle = '#1b1233';
    if (mode === 'in') ctx.fillRect(0, 0, cols, rows);
    document.documentElement.classList.remove('kq-arriving');
    (function step(now) {
      var p = Math.min(1, (now - start) / dur);
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var th = 0.55 * (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64 + 0.45 * noise[y * cols + x];
        if (th < p) { if (mode === 'out') ctx.fillRect(x, y, 1, 1); else ctx.clearRect(x, y, 1, 1); }
      }
      if (p < 1) requestAnimationFrame(step);
      else if (mode === 'in') { cv.remove(); if (done) done(); }
      else if (done) done();
    })(start);
  }
  window.KQDissolve = { out: function (cb) { dissolve('out', cb); }, in: function (cb) { dissolve('in', cb); } };
  try {
    if (sessionStorage.getItem('kq-arrive')) {
      sessionStorage.removeItem('kq-arrive');
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.remove('kq-arriving');
      else dissolve('in');
    }
  } catch (e) { document.documentElement.classList.remove('kq-arriving'); }

  // Magic map: loaded on first use.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-kq-map]');
    if (!b) return;
    e.preventDefault();
    if (window.KQMap) { window.KQMap.open(b); return; }
    var s = document.createElement('script');
    s.src = '/assets/map.js';
    s.onload = function () { window.KQMap.open(b); };
    document.head.appendChild(s);
  });
})();
