/* ============================================================
   Capitalism - region generation and the field canvas
   ============================================================ */
import { REGION, TERRAIN, STRUCT } from './data.js';
import { G, hasTech } from './state.js';
import { mulberry32, clamp } from './util.js';

/* ---------------- generation ---------------- */
function noiseField(rng, w, h, scale) {
  const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
  const g = [];
  for (let i = 0; i < gw * gh; i++) g.push(rng());
  const at = (x, y) => g[clamp(y, 0, gh - 1) * gw + clamp(x, 0, gw - 1)];
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / scale, fy = y / scale;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    const top = a + (b - a) * sx, bot = c + (d - c) * sx;
    out[y * w + x] = top + (bot - top) * sy;
  }
  return out;
}

const PROFILES = {
  texas: (e, m, x, y, w, h, rng) => {
    if (e > 0.8 && m < 0.4) return 'mountain';
    if (rng() < 0.04) return 'town';
    if (rng() < 0.03) return 'derelict';
    if (m > 0.7 && e < 0.5) return 'forest';
    return e > 0.52 ? 'desert' : 'plain';
  },
  alaska: (e, m, x, y, w) => {
    if (x < 3) return e > 0.62 ? 'mountain' : 'tundra';
    if (e < 0.28) return 'ice';
    if (e > 0.74) return 'park';
    return x > w * 0.68 ? 'ice' : 'tundra';
  },
  venezuela: (e, m, x, y, w, h, rng) => {
    if (x < 3) return e < 0.45 ? 'deep' : 'water';
    if (rng() < 0.05) return 'village';
    if (e > 0.82) return 'park';
    if (m > 0.78) return 'swamp';
    return e > 0.58 ? 'jungle' : 'plain';
  },
  nigeria: (e, m, x, y, w, h, rng) => {
    if (x < 2) return e > 0.5 ? 'swamp' : 'water';
    if (rng() < 0.07) return 'village';
    if (m > 0.64) return 'swamp';
    if (e < 0.3) return 'water';
    return e > 0.72 ? 'jungle' : 'plain';
  },
  iraq: (e, m, x, y, w, h, rng) => {
    if (x > w - 3 && e < 0.42) return 'water';
    if (rng() < 0.04) return 'village';
    if (e > 0.86) return 'mountain';
    return m > 0.74 ? 'plain' : 'desert';
  },
  gulf: (e, m, x, y, w) => {
    if (x < 2) return m > 0.6 ? 'swamp' : 'plain';
    if (x === 2) return e > 0.55 ? 'plain' : 'water';
    if (e < 0.2 && x > 4) return 'park';
    return (x / w > 0.5 || e > 0.7) ? 'deep' : 'water';
  },
  caspian: (e, m, x, y, w) => {
    if (x < w * 0.42 && e < 0.6) return e < 0.3 ? 'deep' : 'water';
    if (e > 0.84) return 'mountain';
    return m > 0.6 ? 'plain' : 'desert';
  },
  antarctic: (e, m, x, y, w) => {
    if (e > 0.78) return 'mountain';
    if (x < 3) return e > 0.5 ? 'ice' : 'water';
    return e < 0.3 ? 'deep' : 'ice';
  },
  titan: (e, m) => (e > 0.62 ? 'rock' : (e < 0.3 || m > 0.6) ? 'lake' : 'ice')
};

export function genRegion(rid) {
  const r = REGION[rid], rs = G.s.regions[rid];
  const seed = (G.s.seed ^ (rid.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7))) >>> 0;
  const rng = mulberry32(seed);
  const w = r.w, h = r.h;
  const E = noiseField(rng, w, h, 3.1), M = noiseField(rng, w, h, 4.3);
  const prof = PROFILES[r.gen] || PROFILES.texas;
  const tiles = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    tiles.push({ x, y, T: prof(E[i], M[i], x, y, w, h, rng), oil: 0, oil0: 0, sv: 0, st: null, v: rng() });
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? null : tiles[y * w + x];

  /* oil clusters */
  const buildable = tiles.filter(t => TERRAIN[t.T].build);
  const cl = r.clusters;
  for (let c = 0; c < cl.n; c++) {
    const seedT = buildable[(rng() * buildable.length) | 0];
    if (!seedT) break;
    const peak = cl.min + rng() * (cl.max - cl.min);
    const spread = cl.spread * (0.7 + rng() * 0.7);
    tiles.forEach(t => {
      const d = Math.hypot(t.x - seedT.x, t.y - seedT.y);
      if (d > spread + 1.5) return;
      const f = Math.exp(-(d * d) / (2 * spread * spread));
      if (f < 0.13) return;
      t.oil += peak * f * (0.7 + rng() * 0.6);
    });
  }
  tiles.forEach(t => {
    if (!TERRAIN[t.T].build) t.oil = 0;
    if (t.oil < 60) t.oil = 0;
    t.oil = Math.round(t.oil);
    t.oil0 = t.oil;
    if (hasTech('horizontal')) { t.oil = Math.round(t.oil * 1.2); t.oil0 = t.oil; }
  });
  /* a neighbour trace, so a scan that finds nothing still tells you something */
  tiles.forEach(t => {
    let best = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const n = at(t.x + dx, t.y + dy); if (n) best = Math.max(best, n.oil);
    }
    t.hint = best > cl.max * 0.5 ? 2 : best > 0 ? 1 : 0;
  });
  rs.tiles = tiles; rs.w = w; rs.h = h;
  if (hasTech('satellite')) tiles.forEach(t => t.sv = 1);
  return rs;
}

export const tileAtXY = (rs, x, y) => (!rs || x < 0 || y < 0 || x >= rs.w || y >= rs.h) ? null : rs.tiles[y * rs.w + x];

/* an exploration crew reveals a patch */
export function revealArea(rid, cx, cy, rad) {
  const rs = G.s.regions[rid];
  let found = 0;
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    if (Math.hypot(dx, dy) > rad + 0.3) continue;
    const t = tileAtXY(rs, cx + dx, cy + dy);
    if (t && !t.sv) { t.sv = 1; if (t.oil > 0) found += t.oil; }
  }
  return found;
}

/* ---------------- colours ---------------- */
const COL = {
  plain: ['#6f6a3f', '#7d7748'], desert: ['#9a7b43', '#a8884c'], tundra: ['#5d6b63', '#6a786f'],
  forest: ['#2f4a2c', '#3a5935'], swamp: ['#36432f', '#3f4e37'], jungle: ['#22401f', '#2b4e27'],
  water: ['#14384f', '#17405a'], deep: ['#0c2338', '#0f2a42'], ice: ['#9db4bf', '#adc3cd'],
  lake: ['#3b2f4a', '#473857'], town: ['#5a5550', '#656059'], village: ['#6b5a46', '#75644e'],
  mountain: ['#4a4741', '#55514a'], rock: ['#584c45', '#63564e'], park: ['#2b4a3a', '#345845'],
  derelict: ['#6a5f49', '#746852']
};

/* ---------------- canvas view ---------------- */
export class MapView {
  constructor(canvas, wrap) {
    this.cv = canvas; this.wrap = wrap; this.ctx = canvas.getContext('2d');
    this.scale = 1; this.ox = 0; this.oy = 0; this.rid = null;
    this.sel = null; this.dpr = 1; this.base = 62;
    this.pointers = new Map(); this.pinch = null; this.moved = 0;
    this.onPick = () => { };
    this._bind();
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const r = this.wrap.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2.5);
    this.cv.width = Math.max(1, Math.round(r.width * this.dpr));
    this.cv.height = Math.max(1, Math.round(r.height * this.dpr));
    this.vw = r.width; this.vh = r.height;
    this.clampCam();
  }
  setRegion(rid, keep) { this.rid = rid; this.sel = null; if (!keep) this.center(); }
  get rs() { return G.s ? G.s.regions[this.rid] : null; }
  center() {
    const rs = this.rs; if (!rs || !rs.tiles) return;
    const fit = Math.min(this.vw / (rs.w * this.base), this.vh / (rs.h * this.base));
    this.scale = clamp(fit * 0.98, 0.35, 2.4);
    this.ox = (this.vw - rs.w * this.base * this.scale) / 2;
    this.oy = (this.vh - rs.h * this.base * this.scale) / 2;
  }
  clampCam() {
    const rs = this.rs; if (!rs || !rs.tiles) return;
    const w = rs.w * this.base * this.scale, h = rs.h * this.base * this.scale;
    this.ox = w <= this.vw ? (this.vw - w) / 2 : clamp(this.ox, this.vw - w - 60, 60);
    this.oy = h <= this.vh ? (this.vh - h) / 2 : clamp(this.oy, this.vh - h - 60, 60);
  }
  zoom(f, cx, cy) {
    const px = cx ?? this.vw / 2, py = cy ?? this.vh / 2;
    const s0 = this.scale, s1 = clamp(s0 * f, 0.35, 2.6);
    this.ox = px - (px - this.ox) * (s1 / s0);
    this.oy = py - (py - this.oy) * (s1 / s0);
    this.scale = s1; this.clampCam();
  }
  tileFromClient(cx, cy) {
    const r = this.cv.getBoundingClientRect();
    const x = Math.floor((cx - r.left - this.ox) / (this.base * this.scale));
    const y = Math.floor((cy - r.top - this.oy) / (this.base * this.scale));
    return tileAtXY(this.rs, x, y);
  }
  _bind() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.moved = 0;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.scale };
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = cv.getBoundingClientRect();
        this.zoom((d / this.pinch.d) * (this.pinch.s / this.scale), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        this.pinch.d = d; this.pinch.s = this.scale;
      } else if (this.pointers.size === 1) { this.ox += dx; this.oy += dy; this.clampCam(); }
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (p && this.moved < 9) {
        const t = this.tileFromClient(e.clientX, e.clientY);
        this.sel = t || null;
        this.onPick(t);
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.pinch = null; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.zoom(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  draw(now) {
    const ctx = this.ctx, rs = this.rs;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#06080b'; ctx.fillRect(0, 0, this.vw, this.vh);
    if (!rs || !rs.tiles) return;
    const S = this.base * this.scale, t = now / 1000;
    const x0 = Math.max(0, Math.floor(-this.ox / S)), x1 = Math.min(rs.w - 1, Math.ceil((this.vw - this.ox) / S));
    const y0 = Math.max(0, Math.floor(-this.oy / S)), y1 = Math.min(rs.h - 1, Math.ceil((this.vh - this.oy) / S));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const tl = tileAtXY(rs, x, y); if (tl) this.drawTile(ctx, tl, this.ox + x * S, this.oy + y * S, S, t);
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const tl = tileAtXY(rs, x, y);
      if (tl && tl.st) this.drawStruct(ctx, tl, this.ox + x * S, this.oy + y * S, S, t);
    }
    if (this.sel) {
      const px = this.ox + this.sel.x * S, py = this.oy + this.sel.y * S;
      ctx.strokeStyle = '#f0a830'; ctx.lineWidth = Math.max(2, S * 0.035);
      ctx.strokeRect(px + 1, py + 1, S - 2, S - 2);
      ctx.strokeStyle = 'rgba(240,168,48,.28)'; ctx.lineWidth = Math.max(5, S * 0.1);
      ctx.strokeRect(px + 1, py + 1, S - 2, S - 2);
    }
  }

  drawTile(ctx, tl, px, py, S, t) {
    const c = COL[tl.T] || COL.plain;
    ctx.fillStyle = c[(tl.x + tl.y) % 2];
    ctx.fillRect(px, py, S + 0.6, S + 0.6);
    const sh = tl.v;
    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, S, S); ctx.clip();
    switch (tl.T) {
      case 'forest': case 'jungle': {
        ctx.fillStyle = tl.T === 'jungle' ? '#1a3318' : '#26401f';
        for (let i = 0; i < 5; i++) {
          const a = ((sh * 97 + i * 53) % 10) / 10, b = ((sh * 131 + i * 29) % 10) / 10;
          const cx = px + S * (0.15 + a * 0.7), cy = py + S * (0.2 + b * 0.65), rr = S * 0.085;
          ctx.beginPath(); ctx.moveTo(cx, cy - rr * 1.7); ctx.lineTo(cx + rr, cy + rr); ctx.lineTo(cx - rr, cy + rr); ctx.fill();
        }
        break;
      }
      case 'swamp': {
        ctx.strokeStyle = 'rgba(90,130,110,.45)'; ctx.lineWidth = S * 0.02;
        for (let i = 0; i < 4; i++) {
          const yy = py + S * (0.2 + ((sh * 61 + i * 17) % 10) / 13);
          ctx.beginPath(); ctx.moveTo(px + S * 0.1, yy); ctx.lineTo(px + S * 0.9, yy + S * 0.04); ctx.stroke();
        }
        break;
      }
      case 'water': case 'deep': case 'lake': {
        ctx.strokeStyle = tl.T === 'lake' ? 'rgba(190,160,220,.22)' : 'rgba(120,180,220,.16)';
        ctx.lineWidth = S * 0.025;
        for (let i = 0; i < 3; i++) {
          const yy = py + S * (0.25 + i * 0.25) + Math.sin(t * 0.9 + tl.x + i) * S * 0.02;
          ctx.beginPath(); ctx.moveTo(px + S * 0.12, yy);
          ctx.quadraticCurveTo(px + S * 0.5, yy + S * 0.06, px + S * 0.88, yy); ctx.stroke();
        }
        break;
      }
      case 'ice': {
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = S * 0.02;
        ctx.beginPath();
        ctx.moveTo(px + S * (0.1 + sh * 0.3), py);
        ctx.lineTo(px + S * (0.4 + sh * 0.2), py + S * 0.55);
        ctx.lineTo(px + S * (0.2 + sh * 0.5), py + S); ctx.stroke();
        break;
      }
      case 'desert': {
        ctx.strokeStyle = 'rgba(255,230,180,.13)'; ctx.lineWidth = S * 0.02;
        for (let i = 0; i < 3; i++) {
          const yy = py + S * (0.3 + i * 0.22);
          ctx.beginPath(); ctx.moveTo(px + S * 0.15, yy);
          ctx.quadraticCurveTo(px + S * 0.5, yy - S * 0.05, px + S * 0.85, yy); ctx.stroke();
        }
        break;
      }
      case 'town': case 'village': {
        const vil = tl.T === 'village';
        ctx.fillStyle = vil ? '#9c8366' : '#8d8781';
        for (let i = 0; i < (vil ? 3 : 4); i++) {
          const a = ((sh * 71 + i * 37) % 10) / 10;
          const bw = S * (vil ? 0.14 : 0.16), bh = S * (vil ? 0.12 : 0.16 + a * 0.2);
          ctx.fillRect(px + S * (0.14 + i * 0.22), py + S * 0.76 - bh, bw, bh);
          if (vil) {
            ctx.beginPath();
            ctx.moveTo(px + S * (0.12 + i * 0.22), py + S * 0.76 - bh);
            ctx.lineTo(px + S * (0.21 + i * 0.22), py + S * 0.68 - bh);
            ctx.lineTo(px + S * (0.3 + i * 0.22), py + S * 0.76 - bh);
            ctx.fill();
          }
        }
        ctx.fillStyle = 'rgba(255,220,150,.5)';
        ctx.fillRect(px + S * 0.17, py + S * 0.66, S * 0.05, S * 0.05);
        break;
      }
      case 'mountain': case 'rock': {
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath();
        ctx.moveTo(px + S * 0.12, py + S * 0.82);
        ctx.lineTo(px + S * (0.35 + sh * 0.1), py + S * 0.25);
        ctx.lineTo(px + S * 0.6, py + S * 0.82); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(px + S * 0.45, py + S * 0.82);
        ctx.lineTo(px + S * 0.68, py + S * 0.4);
        ctx.lineTo(px + S * 0.9, py + S * 0.82); ctx.fill();
        break;
      }
      case 'park': {
        ctx.strokeStyle = 'rgba(120,230,170,.5)'; ctx.lineWidth = S * 0.035;
        ctx.setLineDash([S * 0.1, S * 0.07]);
        ctx.strokeRect(px + S * 0.1, py + S * 0.1, S * 0.8, S * 0.8);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(120,230,170,.75)';
        ctx.font = (S * 0.3) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⛨', px + S / 2, py + S / 2);
        break;
      }
      case 'derelict': {
        ctx.strokeStyle = 'rgba(40,34,26,.6)'; ctx.lineWidth = S * 0.03;
        ctx.beginPath();
        ctx.moveTo(px + S * 0.3, py + S * 0.74); ctx.lineTo(px + S * 0.5, py + S * 0.34);
        ctx.lineTo(px + S * 0.68, py + S * 0.76); ctx.stroke();
        break;
      }
    }
    /* what the scan found */
    if (tl.sv) {
      if (tl.oil > 0) {
        const a = clamp(tl.oil / 1400, 0.12, 0.85);
        ctx.fillStyle = 'rgba(8,8,10,' + (0.3 + a * 0.5) + ')';
        ctx.beginPath(); ctx.arc(px + S * 0.5, py + S * 0.5, S * (0.17 + a * 0.2), 0, 7); ctx.fill();
        if (S > 34) {
          ctx.fillStyle = '#ffd27a';
          ctx.font = 'bold ' + (S * 0.19) + 'px ui-sans-serif,sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(Math.round(tl.oil), px + S * 0.5, py + S * 0.5);
        }
      } else if (TERRAIN[tl.T].build) {
        ctx.strokeStyle = 'rgba(255,255,255,.13)'; ctx.lineWidth = S * 0.03;
        ctx.beginPath();
        ctx.moveTo(px + S * 0.43, py + S * 0.43); ctx.lineTo(px + S * 0.57, py + S * 0.57);
        ctx.moveTo(px + S * 0.57, py + S * 0.43); ctx.lineTo(px + S * 0.43, py + S * 0.57); ctx.stroke();
      }
    } else {
      /* unexplored */
      ctx.fillStyle = 'rgba(5,7,10,.62)'; ctx.fillRect(px, py, S, S);
      if (tl.hint && hasTech('seismic') && TERRAIN[tl.T].build) {
        ctx.fillStyle = tl.hint > 1 ? 'rgba(240,168,48,.45)' : 'rgba(240,168,48,.2)';
        for (let i = 0; i < tl.hint + 1; i++) {
          ctx.beginPath(); ctx.arc(px + S * (0.38 + i * 0.12), py + S * 0.84, S * 0.035, 0, 7); ctx.fill();
        }
      }
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.font = (S * 0.3) + 'px ui-sans-serif,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', px + S * 0.5, py + S * 0.5);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + .5, py + .5, S, S);
  }

  drawStruct(ctx, tl, px, py, S, t) {
    const k = tl.st.k, cx = px + S / 2;
    const live = (tl.st.last || 0) > 0.01;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(cx, py + S * 0.84, S * 0.3, S * 0.09, 0, 0, 7); ctx.fill();
    const steel = live ? '#d9dee8' : '#8b93a3';

    if (k === 'derrick' || k === 'frack') {
      ctx.strokeStyle = steel; ctx.lineWidth = Math.max(1.2, S * 0.035);
      const top = py + S * 0.18, bot = py + S * 0.8, wB = S * 0.17, wT = S * 0.05;
      ctx.beginPath();
      ctx.moveTo(cx - wB, bot); ctx.lineTo(cx - wT, top);
      ctx.moveTo(cx + wB, bot); ctx.lineTo(cx + wT, top);
      ctx.moveTo(cx - wB * 0.7, bot - S * 0.2); ctx.lineTo(cx + wB * 0.7, bot - S * 0.2);
      ctx.moveTo(cx - wB * 0.45, bot - S * 0.4); ctx.lineTo(cx + wB * 0.45, bot - S * 0.4);
      ctx.stroke();
      if (k === 'frack') {
        ctx.fillStyle = '#c8431f';
        ctx.fillRect(cx - S * 0.34, py + S * 0.62, S * 0.14, S * 0.16);
        ctx.fillRect(cx + S * 0.2, py + S * 0.66, S * 0.14, S * 0.12);
      }
      const a = live ? Math.sin(t * 2.1 + tl.x * 0.7 + tl.y) * 0.34 : 0;
      ctx.save();
      ctx.translate(cx + S * 0.03, py + S * 0.62); ctx.rotate(a);
      ctx.strokeStyle = live ? '#f0a830' : '#6b768d'; ctx.lineWidth = Math.max(1.6, S * 0.05);
      ctx.beginPath(); ctx.moveTo(-S * 0.17, 0); ctx.lineTo(S * 0.17, 0); ctx.stroke();
      ctx.restore();
      if (live) {
        const fl = 0.6 + Math.sin(t * 9 + tl.x) * 0.4;
        ctx.fillStyle = 'rgba(255,150,40,' + (0.45 + fl * 0.4) + ')';
        ctx.beginPath();
        ctx.ellipse(cx + S * 0.3, py + S * 0.3 - fl * S * 0.04, S * 0.045, S * (0.07 + fl * 0.04), 0, 0, 7);
        ctx.fill();
      }
    } else if (k === 'rig' || k === 'deepwater' || k === 'arctic') {
      const topY = py + S * (k === 'deepwater' ? 0.3 : 0.36);
      ctx.strokeStyle = '#7b8494'; ctx.lineWidth = Math.max(1.2, S * 0.035);
      ctx.beginPath();
      ctx.moveTo(cx - S * 0.26, py + S * 0.86); ctx.lineTo(cx - S * 0.2, topY);
      ctx.moveTo(cx + S * 0.26, py + S * 0.86); ctx.lineTo(cx + S * 0.2, topY);
      ctx.stroke();
      ctx.fillStyle = k === 'arctic' ? '#e6eef2' : '#cfd6e2';
      ctx.fillRect(cx - S * 0.32, topY - S * 0.07, S * 0.64, S * 0.1);
      ctx.strokeStyle = steel; ctx.lineWidth = Math.max(1.2, S * 0.03);
      ctx.beginPath();
      ctx.moveTo(cx - S * 0.1, topY - S * 0.07); ctx.lineTo(cx, py + S * 0.12);
      ctx.lineTo(cx + S * 0.1, topY - S * 0.07); ctx.stroke();
      if (k === 'deepwater') { ctx.fillStyle = '#5aa9f0'; ctx.beginPath(); ctx.arc(cx + S * 0.22, topY - S * 0.13, S * 0.05, 0, 7); ctx.fill(); }
      if (live) {
        const fl = 0.6 + Math.sin(t * 8 + tl.y) * 0.4;
        ctx.fillStyle = 'rgba(255,140,40,' + (0.4 + fl * 0.4) + ')';
        ctx.beginPath(); ctx.ellipse(cx - S * 0.3, topY - S * 0.16, S * 0.04, S * (0.06 + fl * 0.04), 0, 0, 7); ctx.fill();
      }
    } else if (k === 'burner') {
      ctx.fillStyle = '#3a3230';
      ctx.fillRect(cx - S * 0.22, py + S * 0.46, S * 0.44, S * 0.32);
      ctx.fillStyle = '#2a2422';
      ctx.fillRect(cx + S * 0.06, py + S * 0.2, S * 0.1, S * 0.3);
      const fl = 0.5 + Math.sin(t * 7 + tl.x) * 0.5;
      ctx.fillStyle = 'rgba(200,70,40,' + (0.5 + fl * 0.4) + ')';
      ctx.fillRect(cx - S * 0.14, py + S * 0.6, S * 0.16, S * 0.1);
      ctx.fillStyle = 'rgba(120,120,130,' + (0.25 + fl * 0.25) + ')';
      ctx.beginPath(); ctx.arc(cx + S * 0.11, py + S * 0.14 - fl * S * 0.04, S * 0.08, 0, 7); ctx.fill();
    } else if (k === 'cryo') {
      ctx.fillStyle = '#cfe4ff';
      ctx.beginPath(); ctx.arc(cx, py + S * 0.62, S * 0.26, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#6b4a9a'; ctx.fillRect(cx - S * 0.3, py + S * 0.62, S * 0.6, S * 0.12);
      ctx.fillStyle = 'rgba(200,180,255,.8)';
      ctx.beginPath(); ctx.arc(cx, py + S * 0.5, S * 0.07, 0, 7); ctx.fill();
    } else if (k === 'refinery') {
      ctx.fillStyle = '#39414f';
      ctx.fillRect(cx - S * 0.3, py + S * 0.5, S * 0.6, S * 0.28);
      ctx.fillStyle = '#aeb6c4';
      for (let i = 0; i < 3; i++) ctx.fillRect(cx - S * 0.24 + i * S * 0.18, py + S * 0.26, S * 0.07, S * 0.26);
      const fl = 0.6 + Math.sin(t * 6) * 0.4;
      ctx.fillStyle = 'rgba(255,150,40,' + (0.4 + fl * 0.4) + ')';
      ctx.beginPath(); ctx.ellipse(cx + S * 0.26, py + S * 0.24, S * 0.04, S * 0.07, 0, 0, 7); ctx.fill();
    } else if (k === 'storage') {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i === 1 ? '#aeb6c4' : '#98a0ae';
        ctx.beginPath(); ctx.ellipse(cx - S * 0.22 + i * S * 0.22, py + S * 0.55, S * 0.1, S * 0.05, 0, 0, 7); ctx.fill();
        ctx.fillRect(cx - S * 0.32 + i * S * 0.22, py + S * 0.55, S * 0.2, S * 0.2);
      }
    } else if (k === 'merc') {
      ctx.fillStyle = '#2f3845';
      ctx.beginPath();
      ctx.moveTo(cx, py + S * 0.3); ctx.lineTo(cx + S * 0.24, py + S * 0.74);
      ctx.lineTo(cx - S * 0.24, py + S * 0.74); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e2523c'; ctx.fillRect(cx - S * 0.02, py + S * 0.2, S * 0.04, S * 0.16);
      ctx.fillStyle = '#c8431f';
      ctx.beginPath(); ctx.moveTo(cx + S * 0.02, py + S * 0.2); ctx.lineTo(cx + S * 0.18, py + S * 0.25);
      ctx.lineTo(cx + S * 0.02, py + S * 0.3); ctx.fill();
    }
    if (tl.st.dry) {
      ctx.fillStyle = 'rgba(226,82,60,.9)';
      ctx.font = 'bold ' + (S * 0.17) + 'px ui-sans-serif,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DRY', px + S * 0.5, py + S * 0.92);
    }
    if (tl.st.spill) {
      ctx.fillStyle = 'rgba(10,8,6,.72)';
      ctx.beginPath(); ctx.ellipse(cx, py + S * 0.8, S * 0.42, S * 0.16, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
}
