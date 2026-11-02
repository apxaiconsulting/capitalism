/* small shared helpers */
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;
export const sum = (arr, f = (x) => x) => arr.reduce((t, x) => t + f(x), 0);

/* deterministic rng for map generation */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* money is carried in $ millions */
export function money(m, sign = false) {
  const s = m < 0 ? '-' : sign ? '+' : '';
  const a = Math.abs(m);
  let out;
  if (a >= 1e6) out = (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'T';
  else if (a >= 1e3) out = (a / 1e3).toFixed(a >= 1e4 ? 1 : 2) + 'B';
  else if (a >= 10) out = a.toFixed(0) + 'M';
  else if (a >= 1) out = a.toFixed(1) + 'M';
  else out = (a * 1000).toFixed(0) + 'K';
  return s + '$' + out;
}
export const num = (v, d = 1) => (v || 0).toFixed(d).replace(/\.0$/, '');
export const pct = (v, d = 0) => (v * 100).toFixed(d) + '%';
export const bbl = (v) => v >= 1000 ? num(v / 1000, 2) + 'Bbbl' : num(v, 1) + 'Mbbl';

export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
