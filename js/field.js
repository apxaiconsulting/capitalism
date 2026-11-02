/* ============================================================
   Capitalism - the side-view field: sky, ground, and the
   black pools underneath it.
   ============================================================ */
import { PLACE, ACTIONS } from './data.js';
import { G } from './state.js';
import { mulberry32, clamp } from './util.js';

/* blend two colours, for a world that gets browner as it warms */
function mix(a, b, t) {
  if (t <= 0) return a;
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

/* ---------------- generation ---------------- */
function pickType(rng, mix) {
  let r = rng(), acc = 0;
  for (const k in mix) { acc += mix[k]; if (r <= acc) return k; }
  return 'land';
}

export function genScene(id) {
  const p = PLACE[id], ps = G.s.places[id];
  const seed = (G.s.seed ^ (id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11))) >>> 0;
  const rng = mulberry32(seed);
  const cols = p.cols;

  /* surface: runs of terrain, with any sea pushed to one side so it reads as a coast */
  const ground = [];
  const seaShare = p.mix.sea || 0;
  const seaCols = Math.round(cols * seaShare);
  const seaOnLeft = rng() < 0.5;
  let i = 0;
  while (i < cols) {
    const run = 1 + (rng() * 3 | 0);
    const t = pickType(rng, Object.fromEntries(Object.entries(p.mix).filter(([k]) => k !== 'sea')));
    for (let k = 0; k < run && i < cols; k++, i++) ground.push({ t, h: 0 });
  }
  for (let s = 0; s < seaCols; s++) {
    const idx = seaOnLeft ? s : cols - 1 - s;
    ground[idx] = { t: 'sea', h: 0 };
  }
  /* height profile: smooth rolling hills, flat where there is water */
  const a = rng() * 6.28, b = rng() * 6.28, c = rng() * 6.28;
  ground.forEach((g, x) => {
    const n = Math.sin(x * 0.42 + a) * 0.5 + Math.sin(x * 0.19 + b) * 0.33 + Math.sin(x * 0.77 + c) * 0.17;
    g.h = g.t === 'sea' ? -0.22 : clamp(0.5 + n * 0.5, 0.08, 0.95);
    g.v = rng();
  });

  /* pools: irregular blobs in the earth */
  const pools = [];
  for (let n = 0; n < p.pools.n; n++) {
    const oil = Math.round(p.pools.min + rng() * (p.pools.max - p.pools.min));
    pools.push({
      x: 1.5 + rng() * (cols - 3),
      y: 0.16 + rng() * 0.6,
      rx: 0.75 + rng() * 1.15,
      ry: 0.035 + rng() * 0.05,
      wob: rng() * 6.28,
      oil, oil0: oil, found: 0
    });
  }
  ps.scene = { cols, ground, pools, rigs: new Array(cols).fill(null), seen: new Array(cols).fill(0) };
  return ps.scene;
}

/* which pool sits under this column, if any */
export function poolUnder(scene, col) {
  let best = null, bestD = 9;
  for (const pl of scene.pools) {
    const d = Math.abs(pl.x - (col + 0.5));
    if (d <= pl.rx && d < bestD) { best = pl; bestD = d; }
  }
  return best;
}

export function revealSpan(scene, col, span = 2) {
  let found = 0;
  for (let x = col - span; x <= col + span; x++) {
    if (x < 0 || x >= scene.cols) continue;
    scene.seen[x] = 1;
  }
  for (const pl of scene.pools) {
    if (pl.found) continue;
    if (Math.abs(pl.x - (col + 0.5)) <= pl.rx + span) { pl.found = 1; found += pl.oil; }
  }
  return found;
}

/* ---------------- the view ---------------- */
const TERR = {
  land: { top: '#8fa44d', top2: '#7d9142' },
  forest: { top: '#5e8040', top2: '#4c6b34' },
  town: { top: '#9aa45d', top2: '#8a9452' },
  village: { top: '#a99356', top2: '#98834b' },
  park: { top: '#6fae6a', top2: '#5c975a' },
  ice: { top: '#e8f1f6', top2: '#d2e2ea' },
  sea: { top: '#2e6c8e', top2: '#255b79' }
};

export class Field {
  constructor(canvas, wrap) {
    this.cv = canvas; this.wrap = wrap; this.ctx = canvas.getContext('2d');
    this.id = null; this.pan = 0; this.sel = -1; this.armed = null;
    this.onAct = () => { };
    this.pointers = new Map(); this.moved = 0;
    this.fx = [];
    this.bind();
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  get scene() { return G.s && G.s.places[this.id] ? G.s.places[this.id].scene : null; }
  resize() {
    const r = this.wrap.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2.5);
    this.cv.width = Math.max(1, Math.round(r.width * this.dpr));
    this.cv.height = Math.max(1, Math.round(r.height * this.dpr));
    this.w = r.width; this.h = r.height;
    const wide = this.w > this.h * 1.5;
    this.colW = Math.max(46, this.w / (this.w < 560 ? 7.5 : this.w < 900 ? (wide ? 12.5 : 11) : wide ? 15 : 14));
    this.clampPan();
  }
  /* a gusher, or anything else worth a moment of spectacle */
  burst(col, kind) { this.fx.push({ col, kind, t0: performance.now() }); }

  setPlace(id) {
    this.id = id; this.sel = -1; this.pan = 0;
    this.resize();
    this.centerOnWork();
  }
  /* open the view where the player actually has something, not on blank ground */
  centerOnWork() {
    const sc = this.scene; if (!sc) return;
    let cols = [];
    sc.rigs.forEach((r, i) => { if (r) cols.push(i); });
    if (!cols.length) sc.pools.forEach(pl => { if (pl.found) cols.push(Math.round(pl.x)); });
    if (!cols.length) sc.seen.forEach((v, i) => { if (v) cols.push(i); });
    if (!cols.length) { this.clampPan(); return; }
    const mid = cols.reduce((a, b) => a + b, 0) / cols.length;
    this.pan = this.w / 2 - (mid + 0.5) * this.colW;
    this.clampPan();
  }
  clampPan() {
    const sc = this.scene; if (!sc) return;
    const total = sc.cols * this.colW;
    this.pan = total <= this.w ? (this.w - total) / 2 : clamp(this.pan, this.w - total, 0);
  }
  colAt(clientX) {
    const r = this.cv.getBoundingClientRect();
    return Math.floor((clientX - r.left - this.pan) / this.colW);
  }
  bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX });
      this.moved = 0;
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x; p.x = e.clientX;
      this.moved += Math.abs(dx);
      this.pan += dx; this.clampPan();
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (p && this.moved < 8) {
        const col = this.colAt(e.clientX);
        const sc = this.scene;
        if (sc && col >= 0 && col < sc.cols) { this.sel = col; this.onAct(col); }
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.pan -= e.deltaY + e.deltaX; this.clampPan(); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* geometry */
  get horizon() { return this.h * (this.h < 460 && this.w > this.h * 1.5 ? 0.36 : 0.44); }
  surfaceY(col) {
    const sc = this.scene, g = sc.ground[clamp(col, 0, sc.cols - 1)];
    return this.horizon + (1 - g.h) * this.h * 0.1;
  }
  poolY(pl) { return this.horizon + this.h * 0.14 + pl.y * (this.h - this.horizon - this.h * 0.2); }

  /* how far gone the world looks, 0 to 1 */
  get warm() { return G.s ? clamp((G.s.temp - 0.7) / 2.4, 0, 1) : 0; }

  draw(now) {
    const ctx = this.ctx, sc = this.scene;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.ending) { this.drawEnding(ctx, this.ending, now); return; }
    if (!sc) { ctx.clearRect(0, 0, this.w, this.h); return; }
    const p = PLACE[this.id], t = now / 1000, warm = this.warm;
    const W = this.w, H = this.h, cw = this.colW, hz = this.horizon;

    /* sky */
    const sky = ctx.createLinearGradient(0, 0, 0, hz + 10);
    sky.addColorStop(0, mix(p.sky[0], '#7a5230', warm * 0.75));
    sky.addColorStop(1, mix(p.sky[1], '#c98a44', warm * 0.8));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz + 12);
    /* sun */
    ctx.fillStyle = 'rgba(255,240,190,.75)';
    ctx.beginPath(); ctx.arc(W * 0.78, hz * 0.34, Math.min(42, H * 0.07), 0, 7); ctx.fill();
    /* clouds drift with the pan so the parallax reads */
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 537 + this.pan * 0.22 + t * 4) % (W + 320)) - 160;
      const cy = hz * (0.22 + (i % 3) * 0.2);
      const r = Math.min(26, H * 0.045) * (1 + (i % 2) * 0.4);
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 2.1, r * 0.62, 0, 0, 7);
      ctx.ellipse(cx + r, cy - r * 0.4, r * 1.2, r * 0.5, 0, 0, 7);
      ctx.fill();
    }
    /* far hills */
    ctx.fillStyle = 'rgba(90,110,80,.35)';
    ctx.beginPath(); ctx.moveTo(0, hz + 6);
    for (let x = 0; x <= W; x += 18) {
      ctx.lineTo(x, hz - 14 - Math.sin((x + this.pan * 0.45) * 0.006) * 16 - Math.sin((x + this.pan * 0.45) * 0.013) * 9);
    }
    ctx.lineTo(W, hz + 6); ctx.closePath(); ctx.fill();

    /* earth */
    const earth = ctx.createLinearGradient(0, hz, 0, H);
    earth.addColorStop(0, p.earth[0]); earth.addColorStop(1, p.earth[1]);
    ctx.fillStyle = earth; ctx.fillRect(0, hz, W, H - hz);
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const y = hz + (H - hz) * (i / 6);
      ctx.beginPath();
      for (let x = 0; x <= W; x += 24) ctx.lineTo(x, y + Math.sin((x + this.pan) * 0.01 + i) * 4);
      ctx.stroke();
    }

    /* ground strip per column */
    const c0 = Math.max(0, Math.floor(-this.pan / cw) - 1);
    const c1 = Math.min(sc.cols - 1, Math.ceil((W - this.pan) / cw) + 1);
    for (let x = c0; x <= c1; x++) {
      const g = sc.ground[x], px = this.pan + x * cw, sy = this.surfaceY(x);
      const col = TERR[g.t] || TERR.land;
      if (g.t === 'sea') {
        ctx.fillStyle = col.top;
        ctx.fillRect(px, hz - this.h * 0.02, cw + 1, (sy - hz) + this.h * 0.02 + 2);
        const wg = ctx.createLinearGradient(0, hz, 0, hz + this.h * 0.1);
        wg.addColorStop(0, 'rgba(255,255,255,.22)'); wg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = wg; ctx.fillRect(px, hz - this.h * 0.02, cw + 1, this.h * 0.1);
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5;
        for (let k = 0; k < 2; k++) {
          const yy = hz + this.h * 0.015 + k * 9 + Math.sin(t * 1.4 + x + k) * 2;
          ctx.beginPath(); ctx.moveTo(px + 6, yy);
          ctx.quadraticCurveTo(px + cw / 2, yy + 4, px + cw - 6, yy); ctx.stroke();
        }
      } else {
        ctx.fillStyle = mix(col.top, '#8a7444', warm * 0.8);
        ctx.fillRect(px, sy, cw + 1, this.h * 0.055);
        ctx.fillStyle = mix(col.top2, '#776236', warm * 0.8);
        ctx.fillRect(px, sy + this.h * 0.038, cw + 1, this.h * 0.022);
        ctx.fillStyle = 'rgba(0,0,0,.14)';
        ctx.fillRect(px, sy + this.h * 0.058, cw + 1, this.h * 0.012);
      }
      this.drawProps(ctx, x, px, sy, cw, g, t);
    }

    /* pools */
    for (const pl of sc.pools) {
      if (!pl.found) continue;
      const px = this.pan + pl.x * cw, py = this.poolY(pl);
      const frac = pl.oil0 ? clamp(pl.oil / pl.oil0, 0, 1) : 0;
      if (frac <= 0.02) {
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(px, py, pl.rx * cw * 0.78, pl.ry * H, 0, 0, 7); ctx.stroke();
        continue;
      }
      const rx = pl.rx * cw * 0.78 * (0.45 + frac * 0.55), ry = pl.ry * H * (0.5 + frac * 0.5);
      ctx.fillStyle = '#090a0b';
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0, 0, 7);
      ctx.ellipse(px - rx * 0.45, py + ry * 0.3, rx * 0.6, ry * 0.8, 0, 0, 7);
      ctx.ellipse(px + rx * 0.5, py - ry * 0.2, rx * 0.5, ry * 0.7, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.beginPath(); ctx.ellipse(px - rx * 0.3, py - ry * 0.45, rx * 0.4, ry * 0.2, 0, 0, 7); ctx.fill();
    }

    /* rigs, pipes, and whoever is standing outside */
    for (let x = c0; x <= c1; x++) {
      const rig = sc.rigs[x]; if (!rig) continue;
      this.drawRig(ctx, x, this.pan + x * cw, this.surfaceY(x), cw, rig, t);
    }

    /* unexplored ground veil */
    for (let x = c0; x <= c1; x++) {
      if (sc.seen[x]) continue;
      const px = this.pan + x * cw, sy = this.surfaceY(x);
      ctx.fillStyle = 'rgba(16,12,8,.5)';
      ctx.fillRect(px, sy + this.h * 0.042, cw + 1, H);
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.font = Math.round(cw * 0.42) + 'px ui-sans-serif,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', px + cw / 2, (sy + H) / 2);
    }

    /* smog, once the century has had its way */
    if (warm > 0.05) {
      const haze = ctx.createLinearGradient(0, 0, 0, hz + 20);
      haze.addColorStop(0, 'rgba(190,130,70,' + (warm * 0.28).toFixed(3) + ')');
      haze.addColorStop(1, 'rgba(210,160,90,' + (warm * 0.42).toFixed(3) + ')');
      ctx.fillStyle = haze; ctx.fillRect(0, 0, W, hz + 20);
    }

    this.drawFx(ctx, now, cw);

    /* selection / armed cursor */
    if (this.sel >= 0 && this.sel < sc.cols) {
      const px = this.pan + this.sel * cw, sy = this.surfaceY(this.sel);
      ctx.strokeStyle = this.armed ? '#f0a830' : 'rgba(255,255,255,.5)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 5]); ctx.lineDashOffset = -(t * 14) % 1000;
      ctx.strokeRect(px + 1, sy - this.h * 0.12, cw - 2, this.h * 0.16);
      ctx.setLineDash([]);
    }
  }

  /* the last thing you see: one painted scene per ending */
  drawEnding(ctx, kind, now) {
    const W = this.w, H = this.h, t = now / 1000, hz = H * 0.6;
    const SK = {
      fired: ['#43506b', '#9b7f6a'], mad: ['#2a0c08', '#b3321c'], retirement: ['#9ec9e2', '#e7efe4'],
      farewell: ['#6b6f72', '#b4b0a4'], burned: ['#2a1412', '#8c3a24'], bought: ['#0d1326', '#2c3b63'],
      lastbarrel: ['#8a7b56', '#d8c79a'], drowned: ['#43708f', '#9fc6d8'], titan: ['#3a2a4a', '#c98f52'],
      trillion: ['#6b4a12', '#f0c870'], century: ['#7a4a2a', '#e0a35c']
    }[kind] || ['#43506b', '#9b7f6a'];
    const g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, SK[0]); g.addColorStop(1, SK[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const pump = (x, y, sc2, col, nod) => {
      const s2 = sc2;
      ctx.fillStyle = col;
      ctx.fillRect(x - 18 * s2, y - 4 * s2, 36 * s2, 4 * s2);
      ctx.strokeStyle = col; ctx.lineWidth = 2.4 * s2;
      ctx.beginPath();
      ctx.moveTo(x - 7 * s2, y - 4 * s2); ctx.lineTo(x, y - 22 * s2); ctx.lineTo(x + 7 * s2, y - 4 * s2); ctx.stroke();
      ctx.save(); ctx.translate(x, y - 22 * s2); ctx.rotate(nod ? Math.sin(t * 1.6 + x) * 0.22 : 0.3);
      ctx.fillRect(-20 * s2, -2 * s2, 38 * s2, 4 * s2);
      ctx.beginPath(); ctx.arc(-20 * s2, 0, 5 * s2, 0, 7); ctx.fill();
      ctx.restore();
    };

    if (kind === 'drowned') {
      ctx.fillStyle = '#2d5b78'; ctx.fillRect(0, hz * 0.8, W, H);
      for (let i = 0; i < 6; i++) {
        const x = W * (0.12 + i * 0.15), y = hz * 0.8 + 10 + (i % 3) * 14;
        ctx.globalAlpha = 0.85; pump(x, y, 0.8, '#1b2430', false); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const y = hz * 0.8 + 16 + i * 26;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 22) ctx.lineTo(x, y + Math.sin((x + t * 30) * 0.02 + i) * 4);
        ctx.stroke();
      }
    } else if (kind === 'mad') {
      ctx.fillStyle = '#1a0d08'; ctx.fillRect(0, hz, W, H - hz);
      for (let i = 0; i < 7; i++) {
        const x = W * (0.08 + i * 0.14);
        pump(x, hz + 20 + (i % 2) * 18, 0.9, '#0b0908', false);
        const fl = 0.5 + Math.sin(t * 6 + i) * 0.5;
        ctx.fillStyle = 'rgba(255,' + Math.round(90 + fl * 90) + ',30,' + (0.5 + fl * 0.4) + ')';
        ctx.beginPath(); ctx.ellipse(x, hz - 6 + (i % 2) * 18, 9, 26 + fl * 16, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(30,22,20,.5)';
        ctx.beginPath(); ctx.arc(x + 4, hz - 70 - ((t * 24 + i * 40) % 160), 24, 0, 7); ctx.fill();
      }
    } else if (kind === 'titan') {
      ctx.fillStyle = 'rgba(255,230,190,.9)';
      ctx.beginPath(); ctx.arc(W * 0.74, H * 0.26, Math.min(70, W * 0.09), 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,190,.55)'; ctx.lineWidth = 5;
      ctx.save(); ctx.translate(W * 0.74, H * 0.26); ctx.rotate(-0.4); ctx.scale(1, 0.26);
      ctx.beginPath(); ctx.arc(0, 0, Math.min(118, W * 0.15), 0, 7); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#2c2238'; ctx.fillRect(0, hz, W, H - hz);
      ctx.strokeStyle = 'rgba(200,170,230,.35)'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const y = hz + 20 + i * 24;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y + Math.sin((x + t * 18) * 0.02 + i) * 3);
        ctx.stroke();
      }
      ctx.fillStyle = '#cfe4ff';
      ctx.beginPath(); ctx.arc(W * 0.3, hz + 6, 34, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#6b4a9a'; ctx.fillRect(W * 0.3 - 40, hz + 6, 80, 14);
    } else if (kind === 'bought') {
      ctx.fillStyle = '#070b16'; ctx.fillRect(0, hz, W, H - hz);
      const cx = W / 2, base = hz + 8;
      ctx.fillStyle = '#e8e4d8';
      ctx.fillRect(cx - 110, base - 54, 220, 54);
      for (let i = 0; i < 9; i++) ctx.fillRect(cx - 100 + i * 24, base - 98, 11, 46);
      ctx.beginPath(); ctx.moveTo(cx - 120, base - 98); ctx.lineTo(cx, base - 128); ctx.lineTo(cx + 120, base - 98); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, base - 150, 34, Math.PI, 0); ctx.fill();
      pump(cx, base - 150, 0.85, '#1b1a18', true);
      ctx.fillStyle = 'rgba(240,168,48,.18)';
      ctx.beginPath(); ctx.arc(cx, base - 150, 120, 0, 7); ctx.fill();
    } else if (kind === 'retirement') {
      ctx.fillStyle = '#2f7fa8'; ctx.fillRect(0, hz, W, H - hz);
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const y = hz + 22 + i * 26;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y + Math.sin((x + t * 26) * 0.02 + i) * 4);
        ctx.stroke();
      }
      const bx = W * 0.5 + Math.sin(t * 0.6) * 12, by = hz + 54;
      ctx.fillStyle = '#f4f1e8';
      ctx.beginPath(); ctx.moveTo(bx - 46, by); ctx.lineTo(bx + 46, by); ctx.lineTo(bx + 30, by + 20); ctx.lineTo(bx - 30, by + 20); ctx.fill();
      ctx.fillRect(bx - 2, by - 62, 4, 62);
      ctx.beginPath(); ctx.moveTo(bx + 2, by - 60); ctx.lineTo(bx + 40, by - 6); ctx.lineTo(bx + 2, by - 6); ctx.fill();
    } else if (kind === 'lastbarrel') {
      ctx.fillStyle = '#7a6a45'; ctx.fillRect(0, hz, W, H - hz);
      pump(W * 0.5, hz + 40, 1.3, '#39322a', false);
      ctx.fillStyle = '#c8431f';
      ctx.fillRect(W * 0.5 + 70, hz + 18, 26, 36);
      ctx.fillStyle = '#9c3418'; ctx.fillRect(W * 0.5 + 70, hz + 28, 26, 5);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.ellipse(W * 0.5 + 83, hz + 56, 22, 5, 0, 0, 7); ctx.fill();
    } else if (kind === 'farewell' || kind === 'fired') {
      ctx.fillStyle = kind === 'fired' ? '#4a4535' : '#6e6a5c'; ctx.fillRect(0, hz, W, H - hz);
      for (let i = 0; i < 5; i++) {
        const x = W * (0.1 + i * 0.2);
        ctx.fillStyle = '#8d8779';
        ctx.fillRect(x - 26, hz - 34, 52, 34);
        ctx.fillStyle = '#5f5a4e';
        ctx.beginPath(); ctx.moveTo(x - 32, hz - 34); ctx.lineTo(x, hz - 54); ctx.lineTo(x + 32, hz - 34); ctx.fill();
      }
      if (kind === 'fired') {
        ctx.fillStyle = '#b08954';
        ctx.fillRect(W * 0.5 - 26, hz + 30, 52, 36);
        ctx.fillStyle = '#8d6b3f'; ctx.fillRect(W * 0.5 - 26, hz + 30, 52, 7);
        ctx.strokeStyle = '#2b2a28'; ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(W * 0.14 + i * 16, hz - 70); ctx.lineTo(W * 0.14 + i * 16, hz + 6); ctx.stroke(); }
      }
    } else if (kind === 'burned') {
      ctx.fillStyle = '#1d1210'; ctx.fillRect(0, hz, W, H - hz);
      const cx = W * 0.5;
      ctx.fillStyle = '#3a3330'; ctx.fillRect(cx - 70, hz - 54, 140, 54);
      ctx.fillStyle = '#2a2422'; ctx.fillRect(cx + 26, hz - 136, 34, 86);
      const fl = 0.5 + Math.sin(t * 7) * 0.5;
      ctx.fillStyle = 'rgba(190,46,30,' + (0.55 + fl * 0.4) + ')';
      ctx.fillRect(cx - 52, hz - 32, 44, 26);
      ctx.fillStyle = 'rgba(120,120,130,' + (0.3 + fl * 0.3) + ')';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx + 43, hz - 150 - ((t * 20 + i * 50) % 150), 20 + i * 5, 0, 7); ctx.fill(); }
      for (let i = 0; i < 9; i++) {
        const x = cx - 100 - i * 20;
        ctx.fillStyle = 'rgba(20,16,15,.9)';
        ctx.fillRect(x - 3, hz - 22, 6, 22);
        ctx.beginPath(); ctx.arc(x, hz - 26, 4.5, 0, 7); ctx.fill();
      }
    } else {
      /* trillion, century: a forest of pumps at sundown */
      ctx.fillStyle = kind === 'trillion' ? '#4a3310' : '#5c3a1e'; ctx.fillRect(0, hz, W, H - hz);
      for (let i = 0; i < 9; i++) pump(W * (0.06 + i * 0.11), hz + 24 + (i % 3) * 20, 0.75, kind === 'trillion' ? '#1d1708' : '#2a1d12', true);
      if (kind === 'century') {
        ctx.fillStyle = 'rgba(70,120,150,.55)'; ctx.fillRect(0, H - 54, W, 54);
      }
    }
    /* a vignette, so the words sit on something */
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.65)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  drawFx(ctx, now, cw) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      const age = (now - f.t0) / 1000;
      if (age > 3.4) { this.fx.splice(i, 1); continue; }
      const px = this.pan + (f.col + 0.5) * cw, sy = this.surfaceY(f.col);
      if (f.kind === 'gusher') {
        const up = Math.min(1, age / 0.5), fade = age > 2.4 ? 1 - (age - 2.4) : 1;
        const hgt = this.h * 0.42 * up * fade;
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.fillStyle = '#09090a';
        ctx.beginPath();
        ctx.moveTo(px - cw * 0.07, sy);
        ctx.quadraticCurveTo(px, sy - hgt * 1.08, px + cw * 0.07, sy);
        ctx.fill();
        for (let d = 0; d < 16; d++) {
          const a = (d * 97 % 100) / 100, sp = 0.4 + a * 0.9;
          const dx = Math.cos(d * 2.1) * cw * 0.5 * age * sp;
          const dy = -hgt * (0.55 + a * 0.5) + age * age * 90 * sp;
          ctx.beginPath();
          ctx.arc(px + dx, sy + dy, Math.max(1, cw * 0.035 * (1 - age / 3.4)), 0, 7);
          ctx.fill();
        }
        ctx.restore();
        /* what lands, stays */
        ctx.fillStyle = 'rgba(9,9,10,' + Math.min(0.75, age * 0.3) + ')';
        ctx.beginPath();
        ctx.ellipse(px, sy + this.h * 0.012, cw * (0.3 + age * 0.22), this.h * 0.012, 0, 0, 7);
        ctx.fill();
      }
    }
  }

  drawProps(ctx, x, px, sy, cw, g, t) {
    const s = cw / 44, mid = px + cw / 2;
    const rnd = g.v;
    if (g.t === 'forest') {
      for (let i = 0; i < 3; i++) {
        const tx = px + cw * (0.2 + i * 0.3 + (rnd - 0.5) * 0.08);
        const th = this.h * (0.05 + ((rnd * 7 + i) % 3) * 0.012);
        ctx.fillStyle = '#3b5c2c';
        ctx.fillRect(tx - 1.5 * s, sy - th * 0.3, 3 * s, th * 0.3);
        ctx.fillStyle = '#2f4a22';
        ctx.beginPath();
        ctx.moveTo(tx, sy - th); ctx.lineTo(tx + 7 * s, sy - th * 0.25); ctx.lineTo(tx - 7 * s, sy - th * 0.25);
        ctx.fill();
      }
    } else if (g.t === 'town' || g.t === 'village') {
      const vil = g.t === 'village';
      for (let i = 0; i < (vil ? 3 : 2); i++) {
        const bx = px + cw * (0.18 + i * 0.3);
        const bh = this.h * (vil ? 0.035 : 0.055);
        ctx.fillStyle = vil ? '#b9a06a' : '#c9c3b4';
        ctx.fillRect(bx, sy - bh, cw * 0.19, bh);
        ctx.fillStyle = vil ? '#7a5c38' : '#8c5b4a';
        ctx.beginPath();
        ctx.moveTo(bx - 2 * s, sy - bh); ctx.lineTo(bx + cw * 0.095, sy - bh - this.h * 0.016);
        ctx.lineTo(bx + cw * 0.19 + 2 * s, sy - bh); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,150,.75)';
        ctx.fillRect(bx + cw * 0.06, sy - bh * 0.62, cw * 0.045, bh * 0.3);
      }
    } else if (g.t === 'park') {
      ctx.strokeStyle = '#3f6b3c'; ctx.lineWidth = 2 * s;
      for (let i = 0; i < 3; i++) {
        const fx = px + cw * (0.15 + i * 0.35);
        ctx.beginPath(); ctx.moveTo(fx, sy); ctx.lineTo(fx, sy - this.h * 0.022); ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(px + cw * 0.15, sy - this.h * 0.016); ctx.lineTo(px + cw * 0.85, sy - this.h * 0.016); ctx.stroke();
      ctx.fillStyle = '#2f4a22';
      ctx.beginPath();
      ctx.moveTo(mid, sy - this.h * 0.075); ctx.lineTo(mid + 9 * s, sy - this.h * 0.02); ctx.lineTo(mid - 9 * s, sy - this.h * 0.02);
      ctx.fill();
    } else if (g.t === 'ice') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(px + cw * 0.2, sy); ctx.lineTo(px + cw * 0.34, sy - this.h * 0.03);
      ctx.lineTo(px + cw * 0.5, sy); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px + cw * 0.6, sy); ctx.lineTo(px + cw * 0.72, sy - this.h * 0.02);
      ctx.lineTo(px + cw * 0.84, sy); ctx.fill();
    }
  }

  drawRig(ctx, col, px, sy, cw, rig, t) {
    const sc = this.scene;
    const mid = px + cw / 2, s = cw / 44;
    const live = (rig.last || 0) > 0.01;

    /* the pipe, and the oil climbing it */
    if (rig.k === 'derrick' || rig.k === 'rig') {
      const pool = rig.pool != null ? sc.pools[rig.pool] : null;
      const endY = pool ? this.poolY(pool) : this.horizon + this.h * 0.42;
      ctx.strokeStyle = '#1d1c1b'; ctx.lineWidth = Math.max(2, 3 * s);
      ctx.beginPath(); ctx.moveTo(mid, sy); ctx.lineTo(mid, endY); ctx.stroke();
      if (live) {
        ctx.strokeStyle = 'rgba(240,168,48,.85)'; ctx.lineWidth = Math.max(1.5, 2 * s);
        ctx.setLineDash([4 * s, 9 * s]); ctx.lineDashOffset = (t * 40) % 1000;
        ctx.beginPath(); ctx.moveTo(mid, endY); ctx.lineTo(mid, sy); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (!pool) {
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.font = 'bold ' + Math.round(9 * s) + 'px ui-sans-serif,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('DRY', mid, endY + 14 * s);
      }
    }

    if (rig.k === 'derrick') {
      /* a pumpjack: skid, A-frame, walking beam, counterweight, nodding head */
      const by = sy;
      ctx.fillStyle = '#2b2a28';
      ctx.fillRect(mid - 18 * s, by - 5 * s, 36 * s, 5 * s);
      ctx.strokeStyle = '#3f3d3a'; ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      ctx.moveTo(mid - 7 * s, by - 5 * s); ctx.lineTo(mid, by - 22 * s);
      ctx.lineTo(mid + 7 * s, by - 5 * s); ctx.stroke();
      const ang = live ? Math.sin(t * 2.2 + col) * 0.26 : 0;
      ctx.save();
      ctx.translate(mid, by - 22 * s); ctx.rotate(ang);
      ctx.fillStyle = '#f0a830';
      ctx.fillRect(-20 * s, -2.2 * s, 38 * s, 4.4 * s);
      ctx.fillStyle = '#23221f';
      ctx.beginPath();
      ctx.moveTo(16 * s, -4 * s); ctx.quadraticCurveTo(24 * s, -1 * s, 16 * s, 7 * s);
      ctx.lineTo(13 * s, 2 * s); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(-20 * s, 0, 5.4 * s, 0, 7); ctx.fill();
      ctx.restore();
      /* the polished rod going into the ground */
      ctx.strokeStyle = '#1d1c1b'; ctx.lineWidth = 1.8 * s;
      ctx.beginPath();
      ctx.moveTo(mid + 16 * s, by - 22 * s + Math.sin(t * 2.2 + col) * 5 * s);
      ctx.lineTo(mid + 16 * s, by); ctx.stroke();
      if (live) {
        const fl = 0.6 + Math.sin(t * 9 + col) * 0.4;
        ctx.fillStyle = 'rgba(255,150,40,' + (0.4 + fl * 0.4) + ')';
        ctx.beginPath();
        ctx.ellipse(mid - 24 * s, by - 10 * s, 2.6 * s, (4 + fl * 3) * s, 0, 0, 7);
        ctx.fill();
      }
    } else if (rig.k === 'rig') {
      const deck = sy - this.h * 0.045;
      ctx.strokeStyle = '#8d8b86'; ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.moveTo(mid - 14 * s, sy + 8 * s); ctx.lineTo(mid - 10 * s, deck);
      ctx.moveTo(mid + 14 * s, sy + 8 * s); ctx.lineTo(mid + 10 * s, deck);
      ctx.stroke();
      ctx.fillStyle = '#d7d3c8';
      ctx.fillRect(mid - 18 * s, deck - 4 * s, 36 * s, 5 * s);
      ctx.strokeStyle = '#2b2a28'; ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(mid - 7 * s, deck - 4 * s); ctx.lineTo(mid, deck - 22 * s);
      ctx.lineTo(mid + 7 * s, deck - 4 * s); ctx.stroke();
      if (live) {
        const fl = 0.6 + Math.sin(t * 8 + col) * 0.4;
        ctx.fillStyle = 'rgba(255,140,40,' + (0.45 + fl * 0.4) + ')';
        ctx.beginPath(); ctx.ellipse(mid + 16 * s, deck - 9 * s, 3 * s, (5 + fl * 4) * s, 0, 0, 7); ctx.fill();
      }
    } else if (rig.k === 'rival') {
      /* somebody else's pump, in somebody else's colours */
      ctx.strokeStyle = '#1d1c1b'; ctx.lineWidth = Math.max(2, 3 * s);
      const pool = rig.pool != null ? sc.pools[rig.pool] : null;
      ctx.beginPath(); ctx.moveTo(mid, sy); ctx.lineTo(mid, pool ? this.poolY(pool) : sy + this.h * 0.3); ctx.stroke();
      ctx.fillStyle = '#2b2a28';
      ctx.fillRect(mid - 16 * s, sy - 4 * s, 32 * s, 4 * s);
      ctx.strokeStyle = '#4a4e58'; ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.moveTo(mid - 6 * s, sy - 4 * s); ctx.lineTo(mid, sy - 19 * s);
      ctx.lineTo(mid + 6 * s, sy - 4 * s); ctx.stroke();
      ctx.save();
      ctx.translate(mid, sy - 19 * s); ctx.rotate(Math.sin(t * 1.9 + col) * 0.24);
      ctx.fillStyle = '#7f8794';
      ctx.fillRect(-17 * s, -2 * s, 33 * s, 4 * s);
      ctx.beginPath(); ctx.arc(-17 * s, 0, 4.6 * s, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#5aa9f0';
      ctx.fillRect(mid + 17 * s, sy - 22 * s, 2 * s, 22 * s);
      ctx.beginPath();
      ctx.moveTo(mid + 19 * s, sy - 22 * s); ctx.lineTo(mid + 29 * s, sy - 18.5 * s); ctx.lineTo(mid + 19 * s, sy - 15 * s); ctx.fill();
    } else if (rig.k === 'merc') {
      /* a tent, a flag, and two men who are paid not to ask */
      ctx.fillStyle = '#4a4e3c';
      ctx.beginPath();
      ctx.moveTo(mid, sy - 20 * s); ctx.lineTo(mid + 15 * s, sy); ctx.lineTo(mid - 15 * s, sy); ctx.fill();
      ctx.strokeStyle = '#2b2a28'; ctx.lineWidth = 1.6 * s;
      ctx.beginPath(); ctx.moveTo(mid + 18 * s, sy); ctx.lineTo(mid + 18 * s, sy - 24 * s); ctx.stroke();
      ctx.fillStyle = '#b23a2a';
      ctx.beginPath();
      ctx.moveTo(mid + 18 * s, sy - 24 * s); ctx.lineTo(mid + 29 * s, sy - 20 * s); ctx.lineTo(mid + 18 * s, sy - 16 * s); ctx.fill();
      for (let i = 0; i < 2; i++) {
        const fx = mid - 9 * s + i * 20 * s;
        ctx.fillStyle = '#3c4232';
        ctx.fillRect(fx - 2 * s, sy - 11 * s, 4 * s, 11 * s);
        ctx.beginPath(); ctx.arc(fx, sy - 13 * s, 2.4 * s, 0, 7); ctx.fill();
        ctx.strokeStyle = '#22211f'; ctx.lineWidth = 1.4 * s;
        ctx.beginPath(); ctx.moveTo(fx + 2 * s, sy - 10 * s); ctx.lineTo(fx + 8 * s, sy - 14 * s); ctx.stroke();
      }
    } else if (rig.k === 'burner') {
      /* the thing nobody in the company says out loud */
      ctx.fillStyle = '#3a3330';
      ctx.fillRect(mid - 16 * s, sy - 16 * s, 32 * s, 16 * s);
      ctx.fillStyle = '#2a2422';
      ctx.fillRect(mid + 6 * s, sy - 34 * s, 9 * s, 19 * s);
      const fl = 0.5 + Math.sin(t * 7 + col) * 0.5;
      ctx.fillStyle = 'rgba(190,46,30,' + (0.55 + fl * 0.4) + ')';
      ctx.fillRect(mid - 12 * s, sy - 11 * s, 11 * s, 8 * s);
      ctx.fillStyle = 'rgba(120,120,130,' + (0.25 + fl * 0.3) + ')';
      ctx.beginPath(); ctx.arc(mid + 10 * s, sy - (38 + fl * 5) * s, 6 * s, 0, 7); ctx.fill();
      /* the queue */
      for (let i = 0; i < 3; i++) {
        const fx = mid - 26 * s - i * 7 * s;
        ctx.fillStyle = 'rgba(30,28,26,.85)';
        ctx.fillRect(fx - 1.6 * s, sy - 9 * s, 3.2 * s, 9 * s);
        ctx.beginPath(); ctx.arc(fx, sy - 11 * s, 2 * s, 0, 7); ctx.fill();
      }
    }

    /* who is at the gate */
    const ps = G.s.places[this.id];
    if (rig.k !== 'merc' && (ps.unrest || ps.armed) && col % 5 === 1) {
      const armed = ps.armed;
      for (let i = 0; i < 3; i++) {
        const fx = px + cw * (0.16 + i * 0.26);
        ctx.fillStyle = armed ? '#6b2f24' : '#2f4a6b';
        ctx.fillRect(fx - 1.8 * s, sy - 10 * s, 3.6 * s, 10 * s);
        ctx.beginPath(); ctx.arc(fx, sy - 12 * s, 2.2 * s, 0, 7); ctx.fill();
        ctx.strokeStyle = armed ? '#b23a2a' : '#cdd5e4'; ctx.lineWidth = 1.4 * s;
        ctx.beginPath();
        ctx.moveTo(fx + 2 * s, sy - 9 * s);
        ctx.lineTo(fx + (armed ? 9 : 7) * s, sy - (armed ? 13 : 17) * s);
        ctx.stroke();
        if (!armed) { ctx.fillStyle = '#e8ecf4'; ctx.fillRect(fx + 4 * s, sy - 21 * s, 7 * s, 5 * s); }
      }
    }
  }
}
