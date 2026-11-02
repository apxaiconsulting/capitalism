/* ============================================================
   Capitalism - state, saves, a tiny event bus
   ============================================================ */
import { VERSION, START_YEAR, DIFFICULTY, PLACES, PLACE, REP_NAMES } from './data.js';
import { clamp, pick } from './util.js';

export const SAVE_KEY = 'capitalism.save.v3';
export const CFG_KEY = 'capitalism.cfg.v3';

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

export const BASE_DEMAND = 90;

export function newGame(diffId, company) {
  const d = DIFFICULTY[diffId] || DIFFICULTY.exec;
  const s = {
    v: VERSION, diff: d.id, company: company || 'Consolidated Petroleum',
    year: START_YEAR, turn: 0, cash: d.cash, startCash: d.cash,
    gdp: 1, gdpPeak: 1, addiction: 0.62, green: 8, popularity: 55,
    price: 2.6, scarcity: 1, demand: 0, production: 0, sold: 0,
    tax: 0.3, cheaper: 0,
    places: {}, congress: REP_NAMES.map((n, i) => ({ name: n, type: i < 3 ? 'oiled' : i < 9 ? 'gray' : 'green' })),
    president: { name: 'Hollis Grant', party: 'Elephant', oiliness: 45 },
    electionIn: 4, campaign: null, administrations: 0, oiledTerms: 0,
    agenda: [], history: [], ops: {}, rival: null, frontPage: '',
    world: { total: 0, extracted: 0, peaked: false, peakYear: 0, maxProd: 0 },
    emissions: 0, temp: 0.1, crisisYears: 0,
    stats: { rigs: 0, dry: 0, metYears: 0, revenue: 0, lastNet: 0, lastGross: 0, lastCosts: 0, pumped: 0, repsBought: 0, ops: 0, wars: 0 },
    log: [], achs: {}, flags: {}, over: null, seed: (Math.random() * 1e9) | 0,
    hist: { demand: [], prod: [], price: [] }
  };
  PLACES.forEach(p => {
    s.places[p.id] = { open: !p.unlock, scene: null, unrest: 0, armed: 0, natRisk: 0, guarded: 0, royaltyMod: 0, prod: 0, actOk: 0, seized: 0 };
    s.world.total += p.pools.n * (p.pools.min + p.pools.max) / 2 * 1.6;
  });
  G.s = s;
  logMsg('You take the chair at ' + s.company + '. One pump in Texas and a country that wants more every year.', 'gold');
  return s;
}

export function logMsg(what, kind = '') {
  const s = G.s; if (!s) return;
  s.log.unshift({ y: s.year, what, kind });
  if (s.log.length > 160) s.log.length = 160;
}

export const diff = () => DIFFICULTY[G.s.diff] || DIFFICULTY.exec;
export const oiledCount = () => G.s.congress.filter(r => r.type === 'oiled').length;
export const greenCount = () => G.s.congress.filter(r => r.type === 'green').length;
export const isOiled = () => G.s.president.oiliness >= 60;
export const demandOf = (s) => BASE_DEMAND * s.gdp * clamp(s.addiction, 0.05, 2);
export const royaltyOf = (id) => clamp(PLACE[id].royalty + (G.s.places[id].royaltyMod || 0), 0, 0.6);
export function repPrice() {
  return Math.round(170 * (1 + (G.s.year - START_YEAR) / 42));
}
export function costOf(base, id) {
  const p = PLACE[id];
  return Math.round(base * (p ? p.cost : 1) * (1 - (G.s.cheaper || 0)));
}

export function addGreen(delta) {
  const s = G.s;
  if (delta > 0) delta *= diff().green;
  s.green = clamp(s.green + delta, 0, 100);
}
export function grantAch(id) {
  const s = G.s;
  if (s.achs[id]) return;
  s.achs[id] = s.year;
  bus.emit('ach', id);
}

export function save() {
  const s = G.s; if (!s || s.over) return false;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}
export function peekSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    return s ? { company: s.company, year: s.year, cash: s.cash } : null;
  } catch { return null; }
}
export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || !s.places || !s.congress) return false;
    s.hist ||= { demand: [], prod: [], price: [] };
    s.ops ||= {};
    G.s = s;
    return true;
  } catch { return false; }
}
export function wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch { } }
