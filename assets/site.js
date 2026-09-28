/* site.js: score counter. Points are awarded once per action and kept in localStorage. */
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
})();
