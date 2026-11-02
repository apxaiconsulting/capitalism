/* ============================================================
   Capitalism - one turn is one year
   ============================================================ */
import { PLACES, PLACE, ACTIONS, ACT, ACTS, OPS, OP, HEADLINES, RIVALS, START_YEAR, END_YEAR } from './data.js';
import {
  G, bus, logMsg, diff, demandOf, royaltyOf, costOf, repPrice,
  addGreen, grantAch, oiledCount, greenCount, isOiled
} from './state.js';
import { clamp, chance, pick, money, num } from './util.js';
import { genScene, poolUnder, revealSpan } from './field.js';
import { maybeEvent } from './events.js';

export const CEILING = 300;
export const baseline = (y) => 2.4 * Math.pow(1.045, Math.min(y, 2020) - START_YEAR) * Math.pow(1.02, Math.max(0, y - 2020));
export const scarce = (s, f) => { s.scarcity = clamp((s.scarcity || 1) * f, 0.7, 3.4); };

export function turn() {
  const s = G.s;
  if (!s || s.over) return;
  s.year++; s.turn++;
  s.production = produce(s);
  s.demand = demandOf(s);
  const sold = settle(s);
  money_(s, sold);
  society(s);
  politics(s);
  unrest(s);
  rivalTurn(s);
  climateDamage(s);
  peak(s);
  s.hist.demand.push(Math.round(s.demand));
  s.hist.prod.push(Math.round(s.production));
  s.hist.price.push(Math.round(s.price * 100) / 100);
  Object.values(s.hist).forEach(a => { if (a.length > 120) a.shift(); });
  maybeEvent(s);
  achievements(s);
  headline(s);
  endgame(s);
  bus.emit('turn', s);
}

function produce(s) {
  let total = 0, rigs = 0, dry = 0, burned = 0;
  for (const p of PLACES) {
    const ps = s.places[p.id];
    ps.prod = 0;
    if (!ps.open || !ps.scene) continue;
    const guarded = ps.guarded;
    let mult = ps.armed ? (guarded ? 0.85 : 0.3) : ps.unrest ? (guarded ? 0.95 : 0.6) : 1;
    if (ps.storm) { mult *= 0.4; ps.storm = 0; }
    ps.scene.rigs.forEach((rig) => {
      if (!rig) return;
      const def = ACTIONS[rig.k];
      if (!def || !def.rate) return;
      rigs++;
      let rate = def.rate;
      if (rig.k === 'burner') {
        rig.last = rate * mult;
        ps.prod += rig.last;
        burned += rig.last;
        return;
      }
      const pool = rig.pool != null ? ps.scene.pools[rig.pool] : null;
      if (!pool || pool.oil <= 0) { rig.last = 0; dry++; return; }
      const half = pool.oil0 * 0.5;
      if (pool.oil < half) rate *= Math.max(0.15, pool.oil / half);
      rate = Math.min(rate, pool.oil);
      pool.oil = Math.max(0, pool.oil - rate);
      s.world.extracted += rate;
      rig.last = rate * mult;
      ps.prod += rig.last;
    });
    total += ps.prod;
  }
  s.stats.rigs = rigs; s.stats.dry = dry; s.stats.pumped += total;
  s.burnerShare = total > 0 ? burned / total : 0;
  s.stats.burnedTotal = (s.stats.burnedTotal || 0) + burned;
  if (total > s.world.maxProd) { s.world.maxProd = total; s.world.peakYear = s.year; }
  if (total > 0 && !s.flags.oil) { s.flags.oil = 1; grantAch('first_oil'); }
  return total;
}

function settle(s) {
  const d = s.demand, p = s.production;
  if (p >= d) {
    s.crisisYears = 0; s.stats.metYears++;
    const over = p - d;
    if (over > d * 0.25) scarce(s, 0.97); else if (over > 0) scarce(s, 0.995);
    return d + over * 0.85;
  }
  s.crisisYears++;
  crisis(s, d - p);
  return p;
}

/* the three steps from the original's model */
function crisis(s, gap) {
  const pct = gap / Math.max(1, s.demand);
  logMsg('Shortfall: the country wanted ' + num(s.demand, 0) + ' and got ' + num(s.production, 0) + '.', 'bad');
  if (!isOiled() || greenCount() > 2) {
    const a = propose(s, 0, 1);
    if (a) { bus.emit('crisis', { step: 1, act: a }); return; }
  }
  if (s.popularity > 25) {
    s.popularity = clamp(s.popularity - 12 - pct * 40, 0, 100);
    addGreen(3 + pct * 10);
    const open = PLACES.filter(p => s.places[p.id].open && !s.places[p.id].unrest);
    if (open.length && chance(0.5)) {
      const p = pick(open);
      s.places[p.id].unrest = 1;
      logMsg('A blockade forms at the gate in ' + p.name + '.', 'bad');
    }
    bus.emit('crisis', { step: 2 }); return;
  }
  scarce(s, 1 + 0.2 + pct * 0.6);
  s.price = Math.max(s.price, baseline(s.year) * s.scarcity);
  addGreen(2);
  bus.emit('crisis', { step: 3 });
}

function money_(s, sold) {
  s.sold = sold;
  if (s.world.peaked) scarce(s, 1.02);
  const stable = baseline(s.year) * s.scarcity;
  const tight = clamp((s.demand - s.production) / Math.max(1, s.demand), -0.35, 0.6);
  s.price = clamp(s.price + (stable * (1 + tight * 1.5) - s.price) * 0.55, 1, CEILING);

  let royalty = 0, upkeep = 0;
  for (const p of PLACES) {
    const ps = s.places[p.id];
    if (!ps.open) continue;
    royalty += ps.prod * s.price * royaltyOf(p.id);
    if (ps.scene) ps.scene.rigs.forEach(r => {
      const def = r && ACTIONS[r.k];
      if (def) upkeep += (def.upkeep || def.cost * 0.14);
    });
  }
  const gross = sold * s.price;
  const taxable = gross - royalty - upkeep;
  const tax = taxable > 0 ? taxable * Math.max(0, s.tax) : 0;
  const net = gross - royalty - upkeep - tax;
  s.cash += net;
  s.stats.revenue += gross;
  s.stats.lastNet = net; s.stats.lastGross = gross; s.stats.lastCosts = royalty + upkeep + tax;
  if (s.cash < 0) s.stats.red = (s.stats.red || 0) + 1; else s.stats.red = 0;

  let g = 0.03;
  if (s.price > stable * 2.2) {
    g = chance(0.45) ? -0.09 : -0.03;
    if (g < -0.05) { logMsg('Oil shock recession. Output falls across the country.', 'bad'); bus.emit('shock'); }
  }
  s.gdp = Math.max(0.2, s.gdp * (1 + g + (s.gdpMod || 0)));
  s.gdpMod = 0;
  if (s.gdp > s.gdpPeak) s.gdpPeak = s.gdp;
  s.emissions += s.demand * 4.5 * 0.00043;
  s.temp = 0.1 + s.emissions * 0.0145;
}

function society(s) {
  const anchor = 14 + s.temp * 26 + (s.crisisYears ? 10 : 0);
  let g = (anchor - s.green) * 0.06 + Math.max(0, s.temp - 0.4) * 0.9 + s.stats.rigs * 0.02;
  addGreen(g);
  s.popularity = clamp(s.popularity + (s.crisisYears ? -4 : 2.5), 0, 100);
}

/* ---------------- Congress, elections, operations ---------------- */
function politics(s) {
  const want = clamp(Math.round(s.green / 13), 0, 7);
  const have = greenCount();
  if (have < want) {
    const gray = s.congress.filter(r => r.type === 'gray');
    if (gray.length) { pick(gray).type = 'green'; logMsg('A green representative takes a seat.', 'bad'); }
    else if (s.green > 70 && chance(0.4)) {
      const bought = s.congress.filter(r => r.type === 'oiled');
      if (bought.length > 1) { const r = pick(bought); r.type = 'green'; logMsg('Representative ' + r.name + ' has read the polls and switched sides.', 'bad'); }
    }
  } else if (have > want) {
    const gr = s.congress.filter(r => r.type === 'green');
    if (gr.length) pick(gr).type = 'gray';
  }
  if (oiledCount() >= 7) grantAch('congress');

  for (let i = s.agenda.length - 1; i >= 0; i--) {
    const a = s.agenda[i];
    if (--a.voteIn > 0) continue;
    const act = ACT[a.id];
    let yes = 0;
    for (const r of s.congress) {
      if (r.type === 'oiled') yes += act.pro ? 1 : 0;
      else if (r.type === 'green') yes += act.pro ? 0 : 1;
      else yes += chance(0.5) ? 1 : 0;
    }
    s.agenda.splice(i, 1);
    s.history.push(a.id);
    const passed = yes > 5;
    if (passed) applyAct(s, act);
    else logMsg(act.name + ' fails, ' + yes + ' to ' + (10 - yes) + '.', act.pro ? 'bad' : 'good');
    bus.emit('vote', { act, passed, yes });
  }
  if (chance(s.president.oiliness / 100 * 0.35) && s.agenda.filter(a => ACT[a.id].pro).length < 2) propose(s, 1);
  if (chance(clamp(s.green / 180, 0, 0.5)) && s.agenda.filter(a => !ACT[a.id].pro).length < 2) propose(s, 0);

  if (--s.electionIn === 3 && !s.campaign) startCampaign(s);
  if (s.electionIn <= 0) election(s);
}

export function propose(s, pro, fromCrisis) {
  const pool = ACTS.filter(a => !!a.pro === !!pro
    && !s.agenda.some(x => x.id === a.id)
    && (a.repeat || !s.history.includes(a.id))
    && (!a.cond || a.cond(s)));
  if (!pool.length) return null;
  const a = pick(pool);
  s.agenda.push({ id: a.id, voteIn: 1, mine: false, crisis: !!fromCrisis });
  logMsg((pro ? 'The administration tables ' : 'Congress tables ') + a.name + '. Vote next year.', pro ? '' : 'bad');
  return a;
}

export function applyAct(s, act) {
  const e = act.effect || {};
  logMsg(act.name + ' is law.', act.pro ? 'good' : 'bad');
  if (e.addiction) s.addiction = clamp(s.addiction + e.addiction, 0.05, 2);
  if (e.tax) s.tax = clamp(s.tax + e.tax, 0, 0.8);
  if (e.gdp) s.gdpMod = (s.gdpMod || 0) + e.gdp;
  if (e.green) addGreen(e.green);
  if (e.cash) s.cash += e.cash;
  if (e.cashPct) s.cash *= (1 + e.cashPct);
  if (e.cheaper) s.cheaper = Math.min(0.5, (s.cheaper || 0) + e.cheaper);
  if (e.open) { s.places[e.open].actOk = 1; logMsg(PLACE[e.open].name + ' can now be leased.', 'gold'); }
  if (e.parks) {
    s.flags.parks = 1;
    PLACES.forEach(p => {
      const sc = s.places[p.id].scene;
      if (sc) sc.ground.forEach(g => { if (g.t === 'park') g.t = 'land'; });
    });
    logMsg('Protected land is private land now. The signs come down this week.', '');
  }
  if (e.seizeHome) {
    const ps = s.places.texas;
    ps.open = 0; ps.seized = 1; ps.prod = 0;
    logMsg('The domestic fields are nationalised. Texas is gone.', 'bad');
  }
  bus.emit('law');
}

export function tableAct(id) {
  const s = G.s, act = ACT[id];
  if (!act) return { err: 'Unknown bill' };
  if (!oiledCount()) return { err: 'You need at least one oiled representative to introduce a bill' };
  if (s.agenda.some(a => a.id === id)) return { err: 'Already in committee' };
  const cost = Math.round(120 * (1 + (s.year - START_YEAR) / 45));
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  s.cash -= cost;
  s.agenda.push({ id, voteIn: 1, mine: true });
  logMsg('You have ' + act.name + ' introduced in committee.', '');
  return { ok: 1, cost };
}

export function buyRep(i) {
  const s = G.s, r = s.congress[i];
  if (!r || r.type === 'oiled') return { err: 'Already yours' };
  if (r.type === 'green' && s.green > 55) return { err: 'Not while the public is watching this closely' };
  const cost = repPrice() * (r.type === 'green' ? 3 : 1);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  s.cash -= cost; r.type = 'oiled'; s.stats.repsBought++;
  logMsg('Representative ' + r.name + ' is reliable now.', '');
  return { ok: 1, cost };
}

function startCampaign(s) {
  const lean = clamp(0.5 + (s.popularity - 50) / 140 + (s.green - 30) / 250, 0.15, 0.85);
  s.campaign = {
    e: { name: pick(['Buck Hollis', 'Rex Calloway', 'Dale Wexler', 'Cole Fenwick']), oil: 0.8 },
    d: { name: pick(['Margaret Ash', 'Theo Ruiz', 'Ingrid Vale', 'Nadia Crane']), oil: 0.2 },
    donE: 0, donD: 0, poll: 1 - lean
  };
  bus.emit('campaign');
}

function election(s) {
  const c = s.campaign;
  s.electionIn = 10; s.administrations++;
  let se = (c ? c.poll + c.donE / 2600 : 0.5) + (Math.random() - 0.5) * 0.3;
  let sd = (c ? 1 - c.poll + c.donD / 2600 : 0.5) + (Math.random() - 0.5) * 0.3 + s.green / 320;
  const eWins = se >= sd;
  const win = c ? (eWins ? c.e : c.d) : { name: 'Hollis Grant', oil: 0.7 };
  const given = c ? (eWins ? c.donE : c.donD) : 0;
  s.president = {
    name: win.name, party: eWins ? 'Elephant' : 'Donkey',
    oiliness: Math.round(clamp(18 + win.oil * 30 + given / 14, 0, 100))
  };
  s.campaign = null;
  s.popularity = clamp(55 + (Math.random() - 0.5) * 20, 20, 85);
  s.congress.forEach(r => { if (r.type === 'oiled' && chance(0.3)) r.type = 'gray'; });
  if (isOiled()) { s.oiledTerms++; grantAch('oiled'); }
  logMsg(s.president.name + ' takes the White House. Oiliness ' + s.president.oiliness + '.', isOiled() ? 'gold' : 'bad');
  bus.emit('election', { president: s.president, oiled: isOiled() });
}

export function donate(side, amount) {
  const s = G.s, c = s.campaign;
  if (!c) return { err: 'No campaign running' };
  if (s.cash < amount) return { err: 'Not enough cash' };
  s.cash -= amount;
  if (side === 'e') c.donE += amount; else c.donD += amount;
  return { ok: 1 };
}

export function opReady(id) {
  const s = G.s, op = OP[id];
  if (!op) return 'Unknown';
  if (!isOiled()) return 'The president is not yours';
  if (op.req) for (const r of op.req) {
    if (r === 'kuwait' && !s.flags.kuwait) return 'Waiting on events in the Gulf';
    if (r === 'terror' && !s.flags.terror) return 'No pretext yet';
    if (!['kuwait', 'terror'].includes(r) && !s.ops[r]) return 'Groundwork missing: ' + (OP[r] ? OP[r].name : r);
  }
  if (s.ops[id] && !op.anywhere) return 'Already done';
  return null;
}

export function runOp(id, where) {
  const s = G.s, op = OP[id];
  const err = opReady(id);
  if (err) return { err };
  if (s.cash < op.cost) return { err: 'Need ' + money(op.cost) };
  s.cash -= op.cost;
  s.ops[id] = s.year; s.stats.ops++;
  if (op.sets) s.ops[op.sets] = s.year;
  const target = where || op.where;
  if (op.war) {
    s.places.iraq.actOk = 1; s.stats.wars++;
    scarce(s, 1.28);
    s.popularity = clamp(s.popularity - 6, 0, 100);
    addGreen(2); grantAch('warhawk');
    logMsg('The war begins. Al-Dhahir will be open to you within the year.', 'gold');
  }
  if (op.effect === 'calm' && target) { s.places[target].natRisk = 0; logMsg('Nationalisation shelved in ' + PLACE[target].sub + '.', 'good'); }
  if (op.effect === 'coup' && target) {
    s.places[target].royaltyMod = -(PLACE[target].royalty * 0.5);
    s.places[target].natRisk = 0; s.places[target].unrest = 0; s.places[target].armed = 0;
    addGreen(1.5); grantAch('coup');
    logMsg('The junta in ' + PLACE[target].sub + ' halves your royalty.', 'gold');
  }
  if (op.effect === 'crush' && target) { s.places[target].unrest = 0; addGreen(2.5); logMsg('The blockade at ' + PLACE[target].name + ' is cleared.', 'bad'); }
  if (op.effect === 'remove' && target) {
    s.places[target].unrest = 0;
    s.places[target].armed = chance(0.75) ? 1 : 0;
    addGreen(4);
    logMsg('The organisers in ' + PLACE[target].name + ' are dead. Their successors have rifles.', 'bad');
  }
  if (op.effect === 'denial') { addGreen(-12); logMsg('The science is controversial again.', 'good'); }
  bus.emit('op', op);
  return { ok: 1 };
}

/* ---------------- the competition ----------------
   Whatever you survey and do not drill, somebody else is reading. */
function rivalTurn(s) {
  s.rival ||= { name: pick(RIVALS), taken: 0 };
  /* their existing wells keep draining what could have been yours */
  for (const p of PLACES) {
    const ps = s.places[p.id];
    if (!ps.open || !ps.scene) continue;
    ps.scene.rigs.forEach(r => {
      if (!r || r.k !== 'rival') return;
      const pool = ps.scene.pools[r.pool];
      if (pool) { pool.oil = Math.max(0, pool.oil - 55); r.last = 55; }
    });
  }
  if (s.year < 1952 || !chance(0.3)) return;
  /* they prefer a pool you have already found and left alone */
  const options = [];
  for (const p of PLACES) {
    const ps = s.places[p.id];
    if (!ps.open || !ps.scene) continue;
    const sc = ps.scene;
    sc.pools.forEach((pool, i) => {
      if (pool.oil < 80) return;
      let mine = false, free = -1;
      for (let c = 0; c < sc.cols; c++) {
        if (Math.abs(pool.x - (c + 0.5)) > pool.rx) continue;
        if (sc.rigs[c]) { mine = true; break; }
        const t = sc.ground[c].t;
        if (free < 0 && (t === 'land' || t === 'forest')) free = c;
      }
      if (!mine && free >= 0) options.push({ id: p.id, col: free, pool: i, weight: pool.found ? 3 : 1 });
    });
  }
  if (!options.length) return;
  const total = options.reduce((t, o) => t + o.weight, 0);
  let roll = Math.random() * total, take = options[0];
  for (const o of options) { roll -= o.weight; if (roll <= 0) { take = o; break; } }
  const sc = s.places[take.id].scene;
  sc.rigs[take.col] = { k: 'rival', pool: take.pool, last: 55, at: s.year };
  sc.pools[take.pool].found = 1;
  sc.seen[take.col] = 1;
  s.rival.taken++;
  s.flags.rivalYear = s.year; s.flags.rivalPlace = take.id;
  logMsg(s.rival.name + ' has moved onto a field at ' + PLACE[take.id].name + '.', 'bad');
  bus.emit('rival', { id: take.id, col: take.col });
}

/* ---------------- the sea, arriving ---------------- */
function climateDamage(s) {
  if (s.temp < 1.4) return;
  if (!chance(Math.min(0.5, (s.temp - 1.4) * 0.3))) return;
  const cands = [];
  for (const p of PLACES) {
    const ps = s.places[p.id];
    if (!ps.open || !ps.scene) continue;
    const sc = ps.scene;
    for (let c = 0; c < sc.cols; c++) {
      if (sc.ground[c].t === 'sea') continue;
      const nextToSea = (sc.ground[c - 1] && sc.ground[c - 1].t === 'sea') || (sc.ground[c + 1] && sc.ground[c + 1].t === 'sea');
      if (nextToSea && sc.ground[c].h < 0.55) cands.push({ id: p.id, col: c, h: sc.ground[c].h });
    }
  }
  if (!cands.length) return;
  cands.sort((a, b) => a.h - b.h);
  const hit = cands[0];
  const sc = s.places[hit.id].scene;
  const lost = sc.rigs[hit.col];
  sc.ground[hit.col] = { t: 'sea', h: -0.22, v: Math.random() };
  if (lost) {
    sc.rigs[hit.col] = null;
    if (lost.k === 'merc') s.places[hit.id].guarded = sc.rigs.some(r => r && r.k === 'merc') ? 1 : 0;
  }
  s.flags.floodYear = s.year; s.flags.floodPlace = hit.id;
  s.stats.floods = (s.stats.floods || 0) + 1;
  logMsg('The sea has taken ground at ' + PLACE[hit.id].name + (lost ? ', and a well with it.' : '.'), 'bad');
  bus.emit('flood', { id: hit.id, col: hit.col, lostRig: !!lost });
}

/* ---------------- the front page ---------------- */
function headline(s) {
  const pool = HEADLINES.filter(h => { try { return h.cond(s); } catch { return false; } });
  if (!pool.length) return;
  const total = pool.reduce((t, h) => t + h.w, 0);
  let roll = Math.random() * total, pickd = pool[0];
  for (const h of pool) { roll -= h.w; if (roll <= 0) { pickd = h; break; } }
  const where = PLACE[s.flags.gusherPlace || s.flags.rivalPlace || s.flags.floodPlace || 'texas'];
  const nth = ['', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH'][Math.min(5, Math.max(1, s.crisisYears || 2))];
  const text = pick(pickd.t)
    .replace('@PLACE', (where ? where.name : 'TEXAS').toUpperCase())
    .replace('@RIVAL', (s.rival ? s.rival.name : 'A RIVAL').toUpperCase())
    .replace('@PRICE', Math.round(s.price))
    .replace('@NTH', nth);
  s.frontPage = text;
  bus.emit('headline', text);
}

/* ---------------- unrest and the peak ---------------- */
function unrest(s) {
  for (const p of PLACES) {
    const ps = s.places[p.id];
    if (!ps.open) continue;
    if (p.militia || p.insurgents || p.nationalise) {
      if (!ps.unrest && !ps.armed && chance(0.12 + s.green / 600)) {
        ps.unrest = 1;
        logMsg((p.militia ? 'A village blockade' : 'A protest camp') + ' closes the road at ' + p.name + '.', 'bad');
      }
      if (ps.unrest && !ps.guarded && chance(0.18)) { ps.unrest = 0; ps.armed = 1; logMsg('The movement at ' + p.name + ' has taken up arms.', 'bad'); }
      if (ps.armed && ps.guarded && chance(0.3)) { ps.armed = 0; logMsg('Insurgents pushed back at ' + p.name + '.', 'good'); }
      if (ps.armed && !ps.guarded && chance(0.22) && ps.scene) {
        const live = ps.scene.rigs.map((r, i) => (r && ACTIONS[r.k] && ACTIONS[r.k].rate) ? i : -1).filter(i => i >= 0);
        if (live.length) { ps.scene.rigs[pick(live)] = null; logMsg('A well was destroyed at ' + p.name + '. You have no guards there.', 'bad'); }
      }
    }
    if (p.nationalise) {
      ps.natRisk = clamp((ps.natRisk || 0) + (ps.prod > 0 ? 0.07 : 0) + s.green / 2000, 0, 1);
      if (ps.natRisk > 0.75 && chance(0.3)) {
        if (s.ops.prevent_nat && s.year - s.ops.prevent_nat < 12) ps.natRisk = 0.2;
        else {
          ps.open = 0; ps.seized = 1; ps.prod = 0; ps.natRisk = 0;
          bus.emit('bigNews', {
            eyebrow: p.sub, title: 'Nationalised',
            text: 'The assembly voted at four in the morning and the army was at your gate by six. Every pump in ' + p.name + ' belongs to the state company now. The room below the White House could have prevented this, if you had owned a president.'
          });
        }
      }
    }
  }
}

function peak(s) {
  if (s.world.peaked || s.world.extracted < s.world.total * 0.5 || s.year < 1985) return;
  s.world.peaked = true;
  s.flags.burners = 1;
  grantAch('peak');
  bus.emit('bigNews', {
    eyebrow: 'Geology', title: 'The Peak',
    text: 'Half of all the oil that ever existed has been burned. Output rolls over this year and never recovers. Prices climb from here for the rest of your life, and your research division has filed a proposal for something it calls a Human Burner. The feedstock section is three paragraphs long and contains no nouns.'
  });
}

/* ---------------- things you do on the ground ---------------- */
export function act(id, col, kind) {
  const s = G.s, ps = s.places[id], sc = ps.scene;
  if (!sc) return { err: 'Nothing here' };
  const g = sc.ground[col];
  const def = ACTIONS[kind];
  if (!def) return { err: 'Pick an action first' };
  const wet = g.t === 'sea';

  if (kind === 'demolish') {
    if (!sc.rigs[col]) return { err: 'Nothing to demolish' };
    const k = sc.rigs[col].k;
    if (!ACTIONS[k]) return { err: 'That one is not yours' };
    sc.rigs[col] = null;
    if (k === 'merc') ps.guarded = sc.rigs.some(r => r && r.k === 'merc') ? 1 : 0;
    const back = Math.round(costOf(ACTIONS[k].cost, id) * 0.25);
    s.cash += back;
    return { ok: 1, msg: 'Scrapped. ' + money(back) + ' back.' };
  }

  const cost = costOf(def.cost, id);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };

  if (kind === 'buyout') {
    if (g.t !== 'town' && g.t !== 'village') return { err: 'Nobody lives here' };
    const village = g.t === 'village';
    s.cash -= cost;
    g.t = 'land';
    sc.seen[col] = 1;
    addGreen(village ? 2 : 3.5);
    logMsg(village
      ? 'The local authorities took care of the village at ' + PLACE[id].name + '. Nobody asked where it went.'
      : 'A township at ' + PLACE[id].name + ' was bought out and levelled.', 'bad');
    return { ok: 1, msg: village ? 'The village is no longer a problem.' : 'The township is gone. The ground is yours.' };
  }

  if (kind === 'explore') {
    s.cash -= cost;
    const found = revealSpan(sc, col, 2);
    return { ok: 1, found, msg: found > 0 ? 'The crew found ' + num(found, 0) + ' Mbbl under this stretch.' : 'The crew found nothing here.' };
  }

  if (def.locked && !s.flags[def.locked]) return { err: 'Not available yet' };
  if (sc.rigs[col]) return { err: sc.rigs[col].k === 'rival' ? 'Their pump is on it. You were slow.' : 'Something is already built here' };
  if (def.on === 'land' && wet) return { err: 'That is water' };
  if (def.on === 'sea' && !wet) return { err: 'That is dry land' };
  if (g.t === 'park' && !s.flags.parks) return { err: 'Protected land. It takes an act of Congress.' };
  if ((g.t === 'town' || g.t === 'village') && kind !== 'merc') return { err: 'People live here' };

  s.cash -= cost;
  const pool = kind === 'burner' ? null : poolUnder(sc, col);
  const idx = pool ? sc.pools.indexOf(pool) : null;
  sc.rigs[col] = { k: kind, pool: idx, last: 0, at: s.year };
  sc.seen[col] = 1;
  if (pool) pool.found = 1;
  if (kind === 'merc') ps.guarded = 1;
  if (kind === 'burner') { grantAch('burner'); addGreen(3); }
  if (def.rate) addGreen(PLACE[id].green * 0.3);
  if (def.rate && !pool && kind !== 'burner') {
    grantAch('dry');
    s.flags.dryYear = s.year;
    return { ok: 1, dry: 1, msg: 'Dry hole. You have bought ' + money(cost) + ' of hole.' };
  }
  if (kind === 'burner') s.flags.burnerBuilt = 1;
  /* a fat pool under pressure does not wait to be asked */
  if (pool && chance(pool.oil > 400 ? 0.45 : 0.22)) {
    const bonus = Math.round(pool.oil * s.price * 0.12);
    s.cash += bonus;
    addGreen(2.5);
    s.flags.gusherYear = s.year; s.flags.gusherPlace = id;
    grantAch('gusher');
    bus.emit('gusher', { id, col, bonus });
    return { ok: 1, gusher: 1, bonus, msg: 'GUSHER. ' + money(bonus) + ' of crude in the air, on the grass and in the creek.' };
  }
  return { ok: 1, msg: pool ? 'Struck oil: ' + num(pool.oil, 0) + ' Mbbl under this pump.' : 'Built.' };
}

export function openPlace(id) {
  const s = G.s, p = PLACE[id], ps = s.places[id];
  if (ps.open) return { err: 'Already operating' };
  const u = p.unlock || {};
  if (u.act && !ps.actOk) return { err: 'Requires an act of Congress' };
  if (u.op && !s.ops[u.op]) return { err: 'Requires a war' };
  if (u.peak && !s.world.peaked) return { err: 'Not while there is still oil on Earth' };
  if (s.cash < (u.cash || 0)) return { err: 'Need ' + money(u.cash) };
  s.cash -= (u.cash || 0);
  ps.open = 1; ps.seized = 0;
  if (!ps.scene) genScene(id);
  addGreen(p.green * 1.5);
  logMsg('Operations opened in ' + p.name + ', ' + p.sub + '.', 'gold');
  return { ok: 1 };
}

function achievements(s) {
  if (s.cash >= 10000) grantAch('rich');
  if (s.cash >= 1e6) grantAch('trillion');
  if ((s.places.alaska.prod || 0) > 0) grantAch('arctic');
  if ((s.places.titan.prod || 0) > 0) grantAch('titan');
  if (s.year >= END_YEAR) grantAch('century');
  if (s.year >= 1990 && s.stats.repsBought === 0) grantAch('clean');
}

/* three or four lines about what you actually did */
export function epilogue(s) {
  const out = [];
  out.push('Your pumps lifted ' + num(s.stats.pumped, 0) + ' Mbbl. Almost all of it is in the atmosphere now.');
  if (s.rival && s.rival.taken) out.push(s.rival.name + ' drilled ' + s.rival.taken + ' field' + (s.rival.taken > 1 ? 's' : '') + ' you surveyed and left alone.');
  if (s.stats.repsBought) out.push('You bought ' + s.stats.repsBought + ' seat' + (s.stats.repsBought > 1 ? 's' : '') + ' in Congress and ' + (s.oiledTerms || 0) + ' administration' + (s.oiledTerms === 1 ? '' : 's') + '.');
  else out.push('You never bought a single representative, which the obituaries will mention twice.');
  if (s.stats.wars) out.push('One war, and the fields that came with it.');
  if (s.stats.burnedTotal > 0) out.push(num(s.stats.burnedTotal, 0) + ' Mbbl of it came out of the biomass plants. The appendix is still unread.');
  if (s.stats.floods) out.push('The sea took ground ' + s.stats.floods + ' time' + (s.stats.floods > 1 ? 's' : '') + '. Warming finished at +' + s.temp.toFixed(2) + 'C.');
  else out.push('Warming finished at +' + s.temp.toFixed(2) + 'C, which somebody else will have to deal with.');
  return out.slice(0, 4);
}

export const ENDINGS = {
  fired: { e: 'The Board', t: 'Escorted Out', x: 'You left the country short too many years running and a competitor filled the gap. You keep the pension, the lake house and a non-disclosure agreement. The pumps keep nodding without you.' },
  mad: { e: 'Mutually Assured Destruction', t: 'Three Hundred Dollars', x: 'Crude hit three hundred dollars and the world stopped being a market. Fuel riots, grounded fleets, grain at four times the price, and then the kind of news that gets no second bulletin. You won every argument you ever had in Washington. This is what winning them looked like.' },
  retirement: { e: 'Retirement', t: 'A Quiet Exit', x: 'The country learned to want less of what you sell. The share price settled, the board thanked you, and you retired to a boat with a library. It is the softest ending available and almost nobody gets it.' },
  farewell: { e: 'Farewell West', t: 'Farewell West', x: 'The economy you fed shrank to a third of itself. The suburbs emptied, the supply chains unwound, and your product sat in tanks nobody could afford to empty. No single catastrophe. Just a long subtraction.' },
  titan: { e: 'Beyond', t: 'Ligeia Mare', x: 'Earth had nothing left worth drilling, so you leased a sea of methane on a moon of Saturn. The first tanker is nineteen years out. The share price does not care, and neither, by now, do you.' },
  trillion: { e: 'Shareholders', t: 'One Trillion Dollars', x: 'You are the first private citizen to control a trillion dollars. Governments ask you for loans. The oil did that, and so did you.' },
  burned: {
    e: 'The Feedstock Question', t: 'What The Burners Burn',
    x: 'More than a third of your output now comes out of the biomass plants, and the appendix nobody requested has been requested. There is a hearing, and then there is not a hearing. The company is restructured, the plants keep running under a name with no history, and you are advised to travel.'
  },
  bought: {
    e: 'The Republic', t: 'You Are The Government',
    x: 'Ten of ten representatives and a president who calls you first. There is no longer any meaningful difference between your board minutes and federal energy policy, so the pretence is dropped. The oil keeps coming out of the ground. Nobody votes on it any more.'
  },
  lastbarrel: {
    e: 'Geology', t: 'The Last Barrel',
    x: 'It came up on a Tuesday in a field nobody had bothered to name, and it was indistinguishable from the first. There is no more. Not expensive, not difficult: none. The machine that ate a hundred and fifty million years of sunlight in a century stops, mid-sentence.'
  },
  drowned: {
    e: 'High Water', t: 'The Sea Came For The Wells',
    x: 'Six fields are under water, including the one your grandfather opened. The insurers stopped writing the policies, then stopped returning calls. You spent a century selling the thing that moved the coastline, and the coastline came to collect, which is the only honest transaction in this entire story.'
  },
  century: { e: 'Legacy', t: 'The Oil Century', x: 'A hundred years of boardrooms, wars and weather, and you were in the chair for all of it. You hand over the keys at the end of the age your industry wrote. The ocean is a metre higher than when you started.' }
};

function endgame(s) {
  const end = (k) => { if (!s.over) { s.over = { k, year: s.year }; bus.emit('gameOver', s.over); } };
  /* the ones you have to work for */
  if (s.burnerShare > 0.34 && s.year > 1990) return end('burned');
  if (oiledCount() >= 10 && isOiled()) return end('bought');
  if (s.world.extracted > s.world.total * 0.97) return end('lastbarrel');
  if ((s.stats.floods || 0) >= 6) return end('drowned');
  if (s.crisisYears >= diff().patience) return end('fired');
  if ((s.stats.red || 0) >= 5) return end('fired');
  if (s.price >= CEILING - 0.5) return end('mad');
  if (s.addiction < 0.25 && s.year > 1980) return end('retirement');
  if (s.gdp < s.gdpPeak / 3) return end('farewell');
  if (s.year >= END_YEAR) return end('century');
  if ((s.places.titan.prod || 0) > 0 && !s.flags.titanOffer) { s.flags.titanOffer = 1; bus.emit('milestone', 'titan'); }
  if (s.cash >= 1e6 && !s.flags.trillionOffer) { s.flags.trillionOffer = 1; bus.emit('milestone', 'trillion'); }
}
