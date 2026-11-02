/* ============================================================
   Capitalism - game state, persistence, tiny event bus
   One turn = one year.
   ============================================================ */
import { VERSION, START_YEAR, DIFFICULTY, REGIONS, REP_NAMES, TECH } from './data.js';
import { clamp, pick } from './util.js';

export const SAVE_KEY = 'capitalism.save.v2';
export const CFG_KEY = 'capitalism.cfg.v2';

/* ---- event bus ---- */
const handlers = {};
export const bus = {
  on(ev, fn) { (handlers[ev] ||= []).push(fn); return fn; },
  emit(ev, ...a) { (handlers[ev] || []).forEach(f => f(...a)); }
};

export const G = { s: null, cfg: loadCfg(), paused: true };

export function loadCfg() {
  try { return Object.assign({ sound: true, speed: 1 }, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); }
  catch { return { sound: true, speed: 1 }; }
}
export function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(G.cfg)); } catch { } }

export const BASE_DEMAND = 90;   /* Mbbl/yr at gdp index 1.0 and addiction 1.0 */

export function newGame(diffId, company) {
  const d = DIFFICULTY[diffId] || DIFFICULTY.exec;
  const s = {
    v: VERSION, diff: d.id, company: company || 'Consolidated Petroleum',
    year: START_YEAR, turn: 0,
    cash: d.cash, startCash: d.cash,

    gdp: 1, gdpPeak: 1, addiction: 0.62, green: 8, heat: 0,
    price: 2.6, stable: 2.6, scarcity: 1, demand: 0, production: 0, sold: 0, surplus: 0, shortfall: 0,
    stock: 0, storeCap: 100,
    tax: 0.3, subsidy: 0, opexMod: 0, fineMod: 0, margin: 0, costCut: {}, banned: {},

    crisisYears: 0, goodYears: 0, popularity: 55,

    regions: {}, techs: {}, research: null, programs: {}, ops: {},
    budgets: { pr: 0, legal: 0, lobby: 0 },

    congress: REP_NAMES.slice(0, 10).map((n, i) => ({
      name: n, type: i < 3 ? 'oiled' : i < 9 ? 'gray' : 'green', bought: 0
    })),
    president: { name: 'Hollis Grant', party: 'Elephant', oiliness: 45, since: START_YEAR },
    electionIn: 4, campaign: null, administrations: 0, oiledTerms: 0,

    agenda: [], history: [],
    world: { total: 0, extracted: 0, peaked: false, peakYear: 0, maxProd: 0 },
    green_cap: 0, emissions: 0, temp: 0.1,

    stats: {
      wells: 0, revenue: 0, profitYear: 0, lastNet: 0, lastGross: 0, lastOpex: 0, lastTax: 0,
      spills: 0, revived: 0, actsPassed: 0, actsBlocked: 0, repsBought: 0, opsRun: 0,
      totalPumped: 0, metYears: 0, blocked: 0, warsStarted: 0
    },
    log: [], achs: {}, flags: {}, over: null, seed: (Math.random() * 1e9) | 0,
    priceHist: [], demandHist: [], prodHist: []
  };
  REGIONS.forEach(r => {
    s.regions[r.id] = {
      unlocked: !r.unlock, tiles: null, unrest: 0, armed: 0, natRisk: 0,
      guarded: 0, refinery: 0, storeCap: 0, prod: 0, wells: 0, flags: {}
    };
    s.world.total += r.clusters.n * (r.clusters.min + r.clusters.max) / 2 * 2.2;
  });
  G.s = s;
  logMsg('You take the chair at ' + s.company + '. One derrick in Texas, and a country that wants more every year.', 'gold');
  return s;
}

/* ---- log ---- */
export function logMsg(what, kind = '') {
  const s = G.s; if (!s) return;
  s.log.unshift({ y: s.year, what, kind });
  if (s.log.length > 240) s.log.length = 240;
  bus.emit('log', what, kind);
}

/* ---- derived ---- */
export const diff = () => DIFFICULTY[G.s.diff] || DIFFICULTY.exec;
export const hasTech = (id) => !!G.s.techs[id];
export const activeRegions = () => REGIONS.filter(r => G.s.regions[r.id].unlocked);
export const oiledCount = () => G.s.congress.filter(r => r.type === 'oiled').length;
export const greenCount = () => G.s.congress.filter(r => r.type === 'green').length;
export const isOiled = () => G.s.president.oiliness >= 60;

export function demandOf(s) {
  return BASE_DEMAND * s.gdp * clamp(s.addiction, 0.05, 2);
}
export function rateMult() {
  let m = 1;
  if (hasTech('eor')) m += 0.12;
  if (hasTech('horizontal')) m += 0.15;
  return m;
}
export function opexMult() {
  let m = 1 + (G.s.opexMod || 0);
  if (hasTech('automation')) m -= 0.25;
  return Math.max(0.3, m);
}
export function marginMult() {
  let m = 1 + (G.s.margin || 0);
  if (hasTech('refining')) m += 0.08;
  return m;
}
export function repPrice() {
  const s = G.s;
  let c = 170 * (1 + (s.year - START_YEAR) / 42) * diff().cost;
  if (hasTech('kstreet')) c *= 0.75;
  return Math.round(c);
}

/* ---- save / load ---- */
export function save() {
  const s = G.s; if (!s || s.over) return false;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}
export function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
export function peekSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    return s ? { company: s.company, year: s.year, cash: s.cash, diff: s.diff } : null;
  } catch { return null; }
}
export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || !s.regions || !s.congress) return false;
    s.costCut ||= {}; s.banned ||= {}; s.ops ||= {};
    s.priceHist ||= []; s.demandHist ||= []; s.prodHist ||= [];
    if (s.scarcity == null) s.scarcity = 1;
    G.s = s; return true;
  } catch { return false; }
}
export function wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch { } }

/* ---- small mutators ---- */
export function addGreen(delta) {
  const s = G.s;
  if (delta > 0) {
    delta *= diff().green;
    if (hasTech('thinktank')) delta *= 0.5;
    delta *= Math.max(0.35, 1 - (s.programs.doubt || 0) * 0.18);
  }
  s.green = clamp(s.green + delta, 0, 100);
}
export function addHeat(h) {
  const s = G.s;
  if (hasTech('superpac')) h *= 0.35;
  s.heat = clamp(s.heat + h * diff().heat, 0, 130);
}
export function grantAch(id) {
  const s = G.s;
  if (s.achs[id]) return;
  s.achs[id] = s.year;
  bus.emit('ach', id);
}
