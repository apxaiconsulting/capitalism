/* ============================================================
   Capitalism - the yearly turn
   ============================================================ */
import { REGIONS, REGION, STRUCT, TERRAIN, ACT, ACTS, OPS, PROGRAMS, TECH, TECHS, START_YEAR } from './data.js';
import {
  G, bus, logMsg, diff, hasTech, rateMult, opexMult, marginMult, demandOf, repPrice,
  addGreen, addHeat, grantAch, oiledCount, greenCount, isOiled, BASE_DEMAND
} from './state.js';
import { clamp, chance, pick, money, num } from './util.js';
import { genRegion, revealArea } from './map.js';
import { maybeEvent } from './events.js';

export const PRICE_CEILING = 300;

/* the structural price of a barrel in a given year, before scarcity */
export const baseline = (year) => {
  const fast = Math.min(year, 2020) - START_YEAR;      /* post-war to 2020: 4.5% a year */
  const slow = Math.max(0, year - 2020);               /* after that, 2% a year */
  return 2.4 * Math.pow(1.045, fast) * Math.pow(1.02, slow);
};
export function scarcityNudge(s, f) { s.scarcity = clamp((s.scarcity || 1) * f, 0.7, 3.4); }

/* ============================================================
   THE TURN
   ============================================================ */
export function turn() {
  const s = G.s;
  if (!s || s.over) return;
  s.year++; s.turn++;

  const prod = produce(s);
  s.demand = demandOf(s);
  s.production = prod;
  const result = settle(s, prod);
  economy(s, result);
  society(s);
  congressDrift(s);
  actsPhase(s);
  electionPhase(s);
  researchPhase(s);
  unrestPhase(s);
  history(s);
  maybeEvent(s);
  achievements(s);
  endgame(s);
  bus.emit('turn', s);
}

/* ---------------- production ---------------- */
function produce(s) {
  let total = 0, wells = 0, blocked = 0;
  const rm = rateMult();
  for (const r of REGIONS) {
    const rs = s.regions[r.id];
    rs.prod = 0; rs.wells = 0;
    if (!rs.unlocked || !rs.tiles) continue;
    let mult = 1;
    const guarded = rs.guarded || hasTech('pmc');
    if (rs.storm) { mult *= 0.35; rs.storm = 0; }
    if (rs.armed) mult = guarded ? 0.85 : 0.3;
    else if (rs.unrest) mult = guarded ? 0.95 : 0.6;
    for (const t of rs.tiles) {
      if (!t.st) continue;
      const def = STRUCT[t.st.k];
      if (!def || !def.rate) continue;
      wells++;
      let rate = def.rate * rm;
      if (!def.noOil) {
        if (t.oil <= 0) { t.st.dry = 1; continue; }
        t.st.dry = 0;
        /* Hubbert: the flow falls away once the field is half gone */
        const half = t.oil0 * 0.5;
        if (t.oil < half) rate *= Math.max(0.15, t.oil / half);
        rate = Math.min(rate, t.oil);
        t.oil = Math.max(0, t.oil - rate);
        s.world.extracted += rate;
      }
      rate *= mult;
      t.st.last = rate;
      rs.prod += rate;
    }
    if (mult < 1) blocked++;
    rs.wells = rs.tiles.filter(t => t.st && STRUCT[t.st.k].rate).length;
    total += rs.prod;
  }
  s.stats.wells = wells;
  s.stats.blocked = blocked;
  s.stats.totalPumped += total;
  if (total > s.world.maxProd) { s.world.maxProd = total; s.world.peakYear = s.year; }
  if (total > 0 && !s.flags.firstOil) { s.flags.firstOil = 1; grantAch('first_oil'); }
  return total;
}

/* ---------------- demand vs supply ---------------- */
function settle(s, prod) {
  const demand = s.demand;
  let sold = 0, surplus = 0, shortfall = 0;
  if (prod >= demand) {
    sold = demand;
    surplus = prod - demand;
    const room = Math.max(0, s.storeCap - s.stock);
    const stored = Math.min(room, surplus);
    s.stock += stored;
    /* anything you cannot store is dumped, and the dumping moves the price */
    const dumped = surplus - stored;
    sold += dumped * 0.85;
    if (dumped > demand * 0.25) scarcityNudge(s, 0.97);
    else if (surplus > 0) scarcityNudge(s, 0.995);
    s.goodYears++; s.crisisYears = 0; s.stats.metYears++;
    if (s.stats.metYears >= 10) grantAch('met_demand');
  } else {
    shortfall = demand - prod;
    const fromStock = Math.min(s.stock, shortfall);
    s.stock -= fromStock;
    sold = prod + fromStock;
    if (shortfall - fromStock > 0.5) {
      s.crisisYears++; s.goodYears = 0;
      supplyCrisis(s, shortfall - fromStock);
    } else { s.crisisYears = 0; }
  }
  s.sold = sold; s.surplus = surplus; s.shortfall = Math.max(0, shortfall);
  return { sold, surplus, shortfall };
}

/* The three-step crisis from the original's model */
function supplyCrisis(s, gap) {
  const pctGap = gap / Math.max(1, s.demand);
  logMsg('Supply crisis: the country wanted ' + num(s.demand, 0) + ' and you delivered ' + num(s.production, 0) + '.', 'bad');
  /* 1. Congress reaches for something that hurts you */
  if (greenCount() + 0.5 * s.congress.filter(r => r.type === 'gray').length > 2.5 || !isOiled()) {
    const act = proposeAct(s, 0, true);
    if (act) { bus.emit('crisis', { step: 1, act }); return; }
  }
  /* 2. The administration takes the blame and the street organises */
  if (s.popularity > 25) {
    s.popularity = clamp(s.popularity - 12 - pctGap * 40, 0, 100);
    addGreen(3 + pctGap * 10);
    const open = REGIONS.filter(r => s.regions[r.id].unlocked && !s.regions[r.id].unrest);
    if (open.length && chance(0.5)) {
      const r = pick(open);
      if (!hasTech('astroturf')) {
        s.regions[r.id].unrest = 1;
        logMsg('A grassroots blockade forms at ' + r.name + '.', 'bad');
      }
    }
    bus.emit('crisis', { step: 2 });
    return;
  }
  /* 3. The price does the rationing */
  scarcityNudge(s, 1 + 0.2 + pctGap * 0.6);
  s.stable = baseline(s.year) * s.scarcity;
  s.price = Math.max(s.price, s.stable);
  addGreen(2);
  bus.emit('crisis', { step: 3 });
}

/* ---------------- money and the macro economy ---------------- */
function economy(s, res) {
  /* structural price for the year, then scarcity on top */
  if (s.world.peaked) scarcityNudge(s, 1.02);
  s.stable = baseline(s.year) * (s.scarcity || 1);
  const tight = clamp((s.demand - s.production) / Math.max(1, s.demand), -0.35, 0.6);
  const target = s.stable * (1 + tight * 1.5);
  s.price = clamp(s.price + (target - s.price) * 0.55, 1, PRICE_CEILING);
  if (s.price > 100) grantAch('price100');

  let royalty = 0, opex = 0, margin = 0;
  for (const r of REGIONS) {
    const rs = s.regions[r.id];
    if (!rs.unlocked) continue;
    royalty += rs.prod * s.price * r.royalty;
    if (rs.refinery) margin += rs.prod * s.price * STRUCT.refinery.margin;
    if (rs.tiles) for (const t of rs.tiles) if (t.st) opex += (STRUCT[t.st.k].opex || 0) * r.opexMult;
  }
  opex *= opexMult();
  if (hasTech('havens')) royalty *= 0.7;

  const domestic = ['texas', 'alaska', 'gulf'].reduce((a, id) => a + (s.regions[id].prod || 0), 0);
  const subsidy = domestic * (s.subsidy || 0);
  const budgets = (s.budgets.pr + s.budgets.legal + s.budgets.lobby);
  const gross = res.sold * s.price * marginMult() + margin;
  let taxable = gross + subsidy - royalty - opex - budgets;
  const tax = taxable > 0 ? taxable * Math.max(0, s.tax) * (hasTech('havens') ? 0.7 : 1) : 0;
  const net = gross + subsidy - royalty - opex - budgets - tax;

  s.cash += net;
  s.stats.revenue += gross;
  s.stats.profitYear = net;
  s.stats.lastNet = net; s.stats.lastGross = gross;
  s.stats.lastOpex = opex + budgets; s.stats.lastTax = tax + royalty;

  if (s.cash < 0) {
    s.stats.redYears = (s.stats.redYears || 0) + 1;
    logMsg('The company is in the red. The banks are asking questions.', 'bad');
  } else s.stats.redYears = 0;

  /* GDP: default growth, hurt by expensive oil */
  let g = 0.03;
  if (s.price > s.stable * 2.2) {
    g = -0.03;
    if (chance(0.45)) {
      g = -0.09;
      logMsg('Oil shock recession. Industrial output falls across the country.', 'bad');
      bus.emit('shock', 'recession');
    }
  }
  if (s.shortfall > s.demand * 0.2) g -= 0.02;
  s.gdp = Math.max(0.2, s.gdp * (1 + g + (s.gdpMod || 0)));
  s.gdpMod = 0;
  if (s.gdp > s.gdpPeak) s.gdpPeak = s.gdp;

  /* carbon: the whole world burns roughly three times what this country does */
  s.emissions += s.demand * 4.5 * 0.00043 * (hasTech('ccs') ? 0.82 : 1);
  s.temp = 0.1 + s.emissions * 0.0145;
}

/* ---------------- public opinion, clout, green capacity ---------------- */
function society(s) {
  let g = 0;
  const anchor = 14 + s.temp * 26 + (s.crisisYears ? 10 : 0);
  g += (anchor - s.green) * 0.06;          /* the mood drifts toward what the weather justifies */
  g += Math.max(0, s.temp - 0.4) * 0.9;
  g += s.stats.wells * 0.008;
  let pr = s.budgets.pr * 0.004;
  if (hasTech('prmachine')) pr *= 2;
  g -= pr;
  if (hasTech('greenwash')) g -= 0.8;
  for (const p of PROGRAMS) {
    const lv = s.programs[p.id] || 0;
    if (lv) g += p.green * lv * 0.35;
  }
  addGreen(g);

  let cool = 2 + s.budgets.legal * 0.02;
  if (hasTech('lawfirm')) cool *= 2;
  s.heat = clamp(s.heat - cool, 0, 130);

  s.popularity = clamp(s.popularity + (s.crisisYears ? -4 : 2.5), 0, 100);

  let cap = 0;
  if (hasTech('solar')) cap += 12;
  if (hasTech('battery')) cap += 25;
  if (hasTech('fusion')) cap += 70;
  s.green_cap += cap;
  if (s.green_cap >= 800) grantAch('green_turn');

  s.storeCap = 100 + Object.values(s.regions).reduce((t, r) => t + (r.storeCap || 0), 0);
  s.stock = Math.min(s.stock, s.storeCap);
}

/* ---------------- congress ---------------- */
function congressDrift(s) {
  const wantGreen = clamp(Math.round(s.green / 13), 0, 7);
  let have = greenCount();
  if (have < wantGreen) {
    const gray = s.congress.filter(r => r.type === 'gray');
    if (gray.length) { pick(gray).type = 'green'; logMsg('A green representative takes a seat in Congress.', 'bad'); }
    else if (s.green > 70 && chance(0.4)) {
      /* with the public this angry, even a bought seat can be lost */
      const bought = s.congress.filter(r => r.type === 'oiled');
      if (bought.length > 1) {
        const r = pick(bought); r.type = 'green';
        logMsg('Representative ' + r.name + ' has read the polls and switched sides.', 'bad');
      }
    }
  } else if (have > wantGreen) {
    const gr = s.congress.filter(r => r.type === 'green');
    if (gr.length) pick(gr).type = 'gray';
  }
  if (oiledCount() >= 7) grantAch('congress');
}

export function voteOn(s, act) {
  let yes = 0;
  for (const r of s.congress) {
    if (r.type === 'oiled') yes += act.pro ? 1 : 0;
    else if (r.type === 'green') yes += act.pro ? 0 : 1;
    else yes += chance(0.5) ? 1 : 0;
  }
  return yes;
}

function actsPhase(s) {
  /* resolve anything due */
  for (let i = s.agenda.length - 1; i >= 0; i--) {
    const a = s.agenda[i];
    a.voteIn--;
    if (a.voteIn > 0) continue;
    const act = ACT[a.id];
    const yes = voteOn(s, act);
    const passed = yes > 5;
    s.agenda.splice(i, 1);
    s.history.push(a.id);
    if (passed) applyAct(s, act, a);
    else {
      logMsg(act.name + ' fails, ' + yes + ' to ' + (10 - yes) + '.', act.pro ? 'bad' : 'good');
      if (!act.pro) s.stats.actsBlocked++;
    }
    bus.emit('vote', { act, passed, yes });
  }
  /* the administration proposes something friendly now and then */
  const oil = s.president.oiliness / 100;
  if (chance(oil * 0.35) && s.agenda.filter(a => ACT[a.id].pro).length < 2) proposeAct(s, 1);
  /* and the greens keep trying */
  if (chance(clamp(s.green / 180, 0, 0.5)) && s.agenda.filter(a => !ACT[a.id].pro).length < 2) proposeAct(s, 0);
}

export function proposeAct(s, pro, fromCrisis) {
  const pool = ACTS.filter(a => {
    if (!!a.pro !== !!pro) return false;
    if (s.agenda.some(x => x.id === a.id)) return false;
    if (!a.repeat && s.history.includes(a.id)) return false;
    if (a.cond && !a.cond(s)) return false;
    return true;
  });
  if (!pool.length) return null;
  const a = pick(pool);
  s.agenda.push({ id: a.id, voteIn: 1, mine: false, crisis: !!fromCrisis });
  logMsg((pro ? 'The administration tables ' : 'Congress tables ') + a.name + '. The vote is next year.', pro ? '' : 'bad');
  bus.emit('agenda');
  return a;
}

export function applyAct(s, act, a) {
  const e = act.effect || {};
  logMsg(act.name + ' is law.', act.pro ? 'good' : 'bad');
  if (act.pro) s.stats.actsPassed++;
  if (e.addiction) s.addiction = clamp(s.addiction + e.addiction, 0.05, 2);
  if (e.tax) s.tax = clamp(s.tax + e.tax, 0, 0.8);
  if (e.subsidy) s.subsidy = (s.subsidy || 0) + e.subsidy;
  if (e.gdp) s.gdpMod = (s.gdpMod || 0) + e.gdp;
  if (e.green) addGreen(e.green);
  if (e.opex) s.opexMod = (s.opexMod || 0) + e.opex;
  if (e.fine) s.fineMod = (s.fineMod || 0) + e.fine;
  if (e.cash) s.cash += e.cash;
  if (e.cashPct) s.cash *= (1 + e.cashPct);
  if (e.costCut) for (const k in e.costCut) s.costCut[k] = Math.min(0.6, (s.costCut[k] || 0) + e.costCut[k]);
  if (e.ban) e.ban.forEach(id => s.banned[id] = s.year + 5);
  if (e.unlock) { s.regions[e.unlock].actOk = 1; logMsg(REGION[e.unlock].name + ' can now be leased.', 'gold'); }
  if (e.parks) {
    s.flags.parksOpen = 1;
    REGIONS.forEach(r => {
      const rs = s.regions[r.id];
      if (rs.tiles) rs.tiles.forEach(t => {
        if (t.T === 'park') t.T = r.gen === 'venezuela' ? 'jungle' : r.gen === 'alaska' ? 'tundra' : r.gen === 'gulf' ? 'water' : 'plain';
      });
    });
  }
  if (e.sprBuy) {
    const take = Math.min(s.stock, 150);
    s.stock -= take; s.cash += take * s.price * 1.4;
    logMsg('Sold ' + num(take, 0) + ' Mbbl into the strategic reserve at a premium.', 'good');
  }
  if (e.seizeHome) {
    const rs = s.regions.texas;
    rs.unlocked = false; rs.seized = 1; rs.prod = 0;
    logMsg('The domestic fields have been nationalised. Texas is gone.', 'bad');
  }
  bus.emit('lawChanged');
}

/* player action: put a friendly bill in committee */
export function tableAct(id) {
  const s = G.s, act = ACT[id];
  if (!act) return { err: 'Unknown act' };
  if (!oiledCount()) return { err: 'You need at least one oiled representative to introduce a bill' };
  if (s.agenda.some(a => a.id === id)) return { err: 'Already in committee' };
  const cost = Math.round(120 * (1 + (s.year - START_YEAR) / 45) * diff().cost);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  s.cash -= cost;
  addHeat(3);
  s.agenda.push({ id, voteIn: 1, mine: true });
  logMsg('You have ' + act.name + ' introduced in committee.', '');
  return { ok: true, cost };
}

export function buyRep(idx) {
  const s = G.s, r = s.congress[idx];
  if (!r) return { err: 'No such seat' };
  if (r.type === 'oiled') return { err: 'Already yours' };
  const cost = repPrice() * (r.type === 'green' ? 3 : 1);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  if (r.type === 'green' && s.green > 55) return { err: 'This one cannot be bought while the public is watching' };
  s.cash -= cost;
  r.type = 'oiled'; r.bought = s.year;
  s.stats.repsBought++;
  addHeat(r.type === 'green' ? 10 : 6);
  logMsg('Representative ' + r.name + ' is now reliable.', '');
  return { ok: true, cost };
}

/* ---------------- elections ---------------- */
function electionPhase(s) {
  s.electionIn--;
  if (s.electionIn === 2 && !s.campaign) startCampaign(s);
  if (s.electionIn <= 0) resolveElection(s);
}

function startCampaign(s) {
  const lean = clamp(0.5 + (s.popularity - 50) / 140 + (s.green - 30) / 250, 0.15, 0.85);
  s.campaign = {
    elephant: { name: pick(['Buck Hollis', 'Rex Calloway', 'Dale Wexler', 'Cole Fenwick', 'Harlan Boone']), party: 'Elephant', oil: 0.8 },
    donkey: { name: pick(['Margaret Ash', 'Theo Ruiz', 'Ingrid Vale', 'Nadia Crane', 'Avery Shaw']), party: 'Donkey', oil: 0.2 },
    donE: 0, donD: 0, poll: 1 - lean
  };
  logMsg('Campaign season. ' + s.campaign.elephant.name + ' against ' + s.campaign.donkey.name + '.', '');
  bus.emit('campaign');
}

function resolveElection(s) {
  const c = s.campaign;
  s.electionIn = 10;
  s.administrations++;
  const mediaX = hasTech('media') ? 2 : 1;
  let scoreE = (c ? c.poll : 0.5) + (c ? (c.donE * mediaX) / 2600 : 0) + (Math.random() - 0.5) * 0.3;
  let scoreD = (c ? 1 - c.poll : 0.5) + (c ? (c.donD * mediaX) / 2600 : 0) + (Math.random() - 0.5) * 0.3;
  scoreD += s.green / 320;
  const eWins = scoreE >= scoreD;
  const win = c ? (eWins ? c.elephant : c.donkey) : { name: 'Hollis Grant', party: 'Elephant', oil: 0.7 };
  const given = c ? (eWins ? c.donE : c.donD) : 0;
  const oiliness = clamp(18 + win.oil * 30 + given / 14, 0, 100);
  s.president = { name: win.name, party: win.party, oiliness: Math.round(oiliness), since: s.year };
  s.campaign = null;
  s.popularity = clamp(55 + (Math.random() - 0.5) * 20, 20, 85);
  /* bought seats are not forever */
  s.congress.forEach(r => { if (r.type === 'oiled' && chance(0.3)) r.type = 'gray'; });
  if (isOiled()) {
    s.oiledTerms++;
    grantAch('oiled');
    if (s.oiledTerms >= 3) grantAch('dynasty');
  }
  logMsg(win.name + ' (' + win.party + ') takes the White House with oiliness ' + Math.round(oiliness) + '.',
    isOiled() ? 'gold' : 'bad');
  bus.emit('election', { president: s.president, oiled: isOiled() });
}

export function donate(side, amount) {
  const s = G.s, c = s.campaign;
  if (!c) return { err: 'No campaign running' };
  if (s.cash < amount) return { err: 'Not enough cash' };
  s.cash -= amount;
  if (side === 'elephant') c.donE += amount; else c.donD += amount;
  addHeat(1.5);
  return { ok: true };
}

/* ---------------- covert operations ---------------- */
export function runOp(id, rid) {
  const s = G.s, op = OPS.find(o => o.id === id);
  if (!op) return { err: 'Unknown operation' };
  if (!isOiled()) return { err: 'The president is not yours. No access to that room.' };
  if (op.req && op.req.some(r => !s.ops[r])) return { err: 'Groundwork is not in place' };
  if (op.cond && !op.cond(s)) return { err: 'Conditions are not right' };
  if (s.ops[id] && !op.anyRegion) return { err: 'Already done' };
  const cost = Math.round(op.cost * diff().cost);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  s.cash -= cost;
  addHeat(op.heat);
  s.ops[id] = s.year;
  s.stats.opsRun++;
  if (op.sets) s.ops[op.sets] = s.year;
  if (op.war) {
    s.regions.iraq.actOk = 1;
    s.stats.warsStarted++;
    scarcityNudge(s, 1.28);
    s.popularity = clamp(s.popularity - 6, 0, 100);
    addGreen(2);
    grantAch('warhawk');
    logMsg('The war begins. Al-Dhahir will be open to you within the year.', 'gold');
  }
  const target = rid || op.region;
  if (op.effect === 'calm' && target) { s.regions[target].natRisk = 0; logMsg('Nationalisation shelved in ' + REGION[target].place + '.', 'good'); }
  if (op.effect === 'coup' && target) {
    const r = REGION[target];
    r.royalty = Math.max(0.04, r.royalty * 0.5);
    s.regions[target].natRisk = 0; s.regions[target].unrest = 0; s.regions[target].armed = 0;
    addGreen(1.5);
    grantAch('coup');
    logMsg('The new junta in ' + r.place + ' halves your royalty rate.', 'gold');
  }
  if (op.effect === 'crush' && target) {
    s.regions[target].unrest = 0;
    addGreen(2.5);
    logMsg('The blockade at ' + REGION[target].name + ' has been cleared.', 'bad');
  }
  if (op.effect === 'assassinate' && target) {
    s.regions[target].unrest = 0;
    s.regions[target].armed = chance(0.75) ? 1 : 0;
    addGreen(4);
    logMsg('The movement leaders in ' + REGION[target].name + ' are dead. Their successors have rifles.', 'bad');
  }
  if (op.effect === 'denial') { addGreen(-12); logMsg('The science is suddenly controversial again.', 'good'); }
  bus.emit('opRun', op);
  return { ok: true, cost };
}

/* ---------------- research ---------------- */
function researchPhase(s) {
  if (!s.research) return;
  s.research.left--;
  if (s.research.left <= 0) {
    s.techs[s.research.id] = s.year;
    const id = s.research.id;
    s.research = null;
    bus.emit('techDone', id);
  }
}
export function startResearch(id) {
  const s = G.s, t = TECH[id];
  if (!t) return { err: 'Unknown programme' };
  if (s.techs[id]) return { err: 'Already developed' };
  if (s.research) return { err: 'R&D is busy with ' + TECH[s.research.id].name };
  if (t.req && t.req.some(r => !s.techs[r])) return { err: 'Prerequisites missing' };
  const cost = Math.round(t.cost * diff().cost);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  s.cash -= cost;
  s.research = { id, left: t.m, total: t.m };
  logMsg('R&D begins on ' + t.name + ', ' + t.m + ' years.', '');
  return { ok: true, cost };
}
export function techReady(id) {
  const t = TECH[id];
  return !t.req || t.req.every(r => G.s.techs[r]);
}

/* ---------------- unrest ---------------- */
function unrestPhase(s) {
  for (const r of REGIONS) {
    const rs = s.regions[r.id];
    if (!rs.unlocked || !r.instability) continue;
    const guarded = rs.guarded || hasTech('pmc');
    /* peaceful dissent grows with public consciousness and with your footprint */
    if (!rs.unrest && !rs.armed && chance(r.instability * 0.35 + s.green / 600)) {
      rs.unrest = 1;
      logMsg((r.militia ? 'An Ogoni-style blockade' : 'A protest camp') + ' has closed the access road at ' + r.name + '.', 'bad');
    }
    if (rs.unrest && !guarded && chance(0.18)) {
      rs.unrest = 0; rs.armed = 1;
      logMsg('The movement at ' + r.name + ' has taken up arms.', 'bad');
    }
    if (rs.armed && guarded && chance(0.3)) { rs.armed = 0; logMsg('Insurgents pushed back at ' + r.name + '.', 'good'); }
    if (rs.armed && !guarded && chance(0.22)) {
      const live = rs.tiles.filter(t => t.st && STRUCT[t.st.k].rate);
      if (live.length) {
        const t = pick(live); t.st = null;
        logMsg('A well was destroyed at ' + r.name + '. You have no guards there.', 'bad');
      }
    }
    /* nationalisation */
    if (r.nationalize && rs.unlocked) {
      rs.natRisk = clamp((rs.natRisk || 0) + (rs.prod > 0 ? 0.07 : 0) + s.green / 2000, 0, 1);
      if (rs.natRisk > 0.75 && chance(0.3)) {
        if (s.ops.prevent_nat && s.year - s.ops.prevent_nat < 12) { rs.natRisk = 0.2; }
        else {
          rs.unlocked = false; rs.seized = 1; rs.prod = 0; rs.natRisk = 0;
          logMsg(r.name + ' has been nationalised. Your wells belong to the nation now.', 'bad');
          bus.emit('bigNews', {
            eyebrow: r.place, title: 'Nationalised',
            text: 'The assembly voted at four in the morning and the army was at your gates by six. Every well in ' + r.name + ' now belongs to the state oil company. The room below the White House could have prevented this.'
          });
        }
      }
    }
  }
}

/* ---------------- history for charts ---------------- */
function history(s) {
  s.priceHist.push(Math.round(s.price * 100) / 100);
  s.demandHist.push(Math.round(s.demand));
  s.prodHist.push(Math.round(s.production));
  [s.priceHist, s.demandHist, s.prodHist].forEach(a => { if (a.length > 140) a.shift(); });
  /* world peak: half the planet's oil gone and output rolling over */
  if (!s.world.peaked && s.world.extracted > s.world.total * 0.5 && s.year > 1985) {
    s.world.peaked = true;
    grantAch('peak');
    s.flags.burners = 1;
    logMsg('World production has peaked. Everything from here is harder and dearer.', 'gold');
    bus.emit('bigNews', {
      eyebrow: 'Geology', title: 'The Peak',
      text: 'Half of all the oil that ever existed has been burned. Output rolls over this year and will never recover. Prices will climb for the rest of your life, and your research department has quietly filed a proposal for something called a Human Burner.'
    });
  }
}

/* ---------------- achievements ---------------- */
function achievements(s) {
  if (s.cash >= 10000) grantAch('rich');
  if (s.cash >= 250000) grantAch('richer');
  if (s.cash >= 1e6) grantAch('trillion');
  if (s.stats.wells >= 50) grantAch('fifty_wells');
  if (Object.values(s.regions).filter(r => r.unlocked).length >= 6) grantAch('six_regions');
  if ((s.regions.alaska.prod || 0) > 0) grantAch('arctic_open');
  if ((s.regions.antarctic.prod || 0) > 0) grantAch('antarctica');
  if ((s.regions.titan.prod || 0) > 0) grantAch('titan');
  if (s.stats.revived >= 5) grantAch('frack_all');
  if (s.stats.spills >= 3) grantAch('spiller');
  if (s.year >= 2050) grantAch('century');
  if (s.year >= 1990 && s.stats.repsBought === 0) grantAch('clean');
}

/* ---------------- endings ---------------- */
export const ENDINGS = {
  fired: {
    e: 'The Board', t: 'Escorted Out',
    x: 'You failed to keep the country supplied for too many years running, and a competitor filled the gap. The board thanks you for your service with a pension and a non-disclosure agreement. The wells keep pumping without you.'
  },
  mad: {
    e: 'Mutually Assured Destruction', t: 'Three Hundred Dollars',
    x: 'Crude hit three hundred dollars a barrel and the world stopped being a market. Fuel riots, grounded fleets, grain at four times the price, and then the kind of news that does not get a second bulletin. You won every argument you ever had in Washington, and this is what winning them looked like.'
  },
  retirement: {
    e: 'Retirement', t: 'A Quiet Exit',
    x: 'Oil addiction fell below a quarter. The country learned to want less of what you sell, the share price settled, and you retired to a boat with a library. It is the softest ending available, and almost nobody gets it.'
  },
  farewell: {
    e: 'Farewell West', t: 'Farewell West',
    x: 'The economy you fed shrank to a third of what it was. Supply chains unwound, the suburbs emptied, and your product sat in tanks nobody could afford to empty. There was no single catastrophe, only a long subtraction.'
  },
  indicted: {
    e: 'The Grand Jury', t: 'United States v. You',
    x: 'The subpoenas outran the shredders. Eighteen months at a facility with tennis courts, then a memoir and a consultancy. Still, they got you.'
  },
  trillion: {
    e: 'Shareholders', t: 'One Trillion Dollars',
    x: 'You are the first private citizen to control a trillion dollars. Governments ask you for loans. The oil did that, and so did you.'
  },
  green: {
    e: 'The Press Release', t: 'The Pivot',
    x: 'You sold the derricks at the top and bought the sun. The company survives the century as an energy major with a conscience department, and the authorised biography is suspiciously flattering.'
  },
  space: {
    e: 'Beyond', t: 'Ligeia Mare',
    x: 'Earth had nothing left worth drilling, so you leased a sea of methane on a moon of Saturn. The first tanker is nineteen years out. The share price does not care.'
  },
  century: {
    e: 'Legacy', t: 'The Oil Century',
    x: 'A hundred years of boardrooms, wars and weather, and you were in the chair for all of it. You hand over the keys at the end of the age your industry wrote. The ocean is a metre higher than when you started.'
  }
};

function endgame(s) {
  const end = (k) => { if (!s.over) { s.over = { k, year: s.year }; bus.emit('gameOver', s.over); } };
  if (s.crisisYears >= diff().patience) return end('fired');
  if (s.price >= PRICE_CEILING - 0.5) return end('mad');
  if (s.addiction < 0.25 && s.year > 1980) return end('retirement');
  if (s.gdp < s.gdpPeak / 3) return end('farewell');
  if ((s.stats.redYears || 0) >= 5) return end('fired');
  if (s.year >= 2051) return end('century');
  if (s.cash >= 1e6 && !s.flags.trillionOffered) { s.flags.trillionOffered = 1; bus.emit('milestone', 'trillion'); }
  if (s.green_cap >= 1200 && s.cash > 40000 && !s.flags.greenOffered) { s.flags.greenOffered = 1; bus.emit('milestone', 'green'); }
  if ((s.regions.titan.prod || 0) > 0 && !s.flags.spaceOffered) { s.flags.spaceOffered = 1; bus.emit('milestone', 'space'); }
}

/* ============================================================
   PLAYER ACTIONS ON THE MAP
   ============================================================ */
export function scanCost(rid) {
  let c = 70 * REGION[rid].costMult * diff().cost;
  if (hasTech('seismic')) c *= 0.5;
  return Math.round(c);
}

export function doScan(rid, tile) {
  const s = G.s;
  const cost = scanCost(rid);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  s.cash -= cost;
  const rad = hasTech('seismic') ? 2 : 1;
  const found = revealArea(rid, tile.x, tile.y, rad);
  return { ok: true, cost, found };
}

export function canBuild(rid, tile, kind) {
  const s = G.s, def = STRUCT[kind];
  if (!def) return 'Unknown';
  if (s.banned[rid] && s.banned[rid] > s.year) return 'Blocked by moratorium';
  if (def.tech && !hasTech(def.tech)) return 'Needs ' + TECH[def.tech].name;
  if (def.flagged && !s.flags[def.flagged]) return 'Not available yet';
  if (tile.st) return 'Tile occupied';
  if (!def.on.includes(tile.T)) return 'Cannot build on ' + TERRAIN[tile.T].name;
  if (!tile.sv) return 'Send an exploration crew first';
  if (def.rate && !def.noOil) {
    if (def.revive) {
      if (!tile.oil0) return 'No field here to re-stimulate';
      if (tile.oil > tile.oil0 * 0.2) return 'Field is not exhausted yet';
    } else if (tile.oil <= 0) return 'No oil here';
  }
  if (def.guard && s.regions[rid].guarded) return 'Already guarded';
  if (def.margin && s.regions[rid].refinery) return 'This region already has one';
  return null;
}

export function buildCost(rid, tile, kind) {
  const s = G.s, def = STRUCT[kind], r = REGION[rid];
  let c = def.cost * r.costMult * diff().cost * (1 - (s.costCut[rid] || 0));
  const clear = TERRAIN[tile.T] && TERRAIN[tile.T].clear;
  if (clear) c += clear.cost * diff().cost;
  return Math.round(c);
}

export function doBuild(rid, tile, kind) {
  const s = G.s, def = STRUCT[kind], r = REGION[rid], rs = s.regions[rid];
  const err = canBuild(rid, tile, kind);
  if (err) return { err };
  const cost = buildCost(rid, tile, kind);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  s.cash -= cost;
  const clear = TERRAIN[tile.T].clear;
  tile.st = { k: kind, at: s.year, last: 0 };
  if (clear) { addGreen(clear.green * 1.2); tile.T = 'plain'; }
  if (def.revive && tile.oil0) { tile.oil = Math.max(tile.oil, tile.oil0 * def.revive); s.stats.revived++; }
  if (def.guard) rs.guarded = 1;
  if (def.margin) rs.refinery = 1;
  if (def.store) rs.storeCap = (rs.storeCap || 0) + def.store;
  if (def.rate) addGreen(r.green * 0.3);
  if (kind === 'burner') { grantAch('burner'); addGreen(3); addHeat(5); }
  return { ok: true, cost };
}

export function doDemolish(rid, tile) {
  const s = G.s, rs = s.regions[rid];
  if (!tile.st) return { err: 'Nothing here' };
  const def = STRUCT[tile.st.k];
  const refund = Math.round(def.cost * 0.25 * REGION[rid].costMult);
  if (def.guard) rs.guarded = 0;
  if (def.margin) rs.refinery = 0;
  if (def.store) rs.storeCap = Math.max(0, (rs.storeCap || 0) - def.store);
  tile.st = null; s.cash += refund;
  return { ok: true, refund };
}

export function doBribeLocals(rid, tile) {
  const s = G.s, r = REGION[rid];
  if (!['village', 'town'].includes(tile.T)) return { err: 'Nobody to pay here' };
  const cost = Math.round((tile.T === 'village' ? 60 : 180) * r.costMult * diff().cost);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  s.cash -= cost;
  tile.T = 'plain'; tile.sv = 1;
  addGreen(tile.T === 'village' ? 1.5 : 3);
  addHeat(2);
  logMsg(r.bribe ? 'The local authorities have taken care of it at ' + r.name + '.' : 'A township was bought out and cleared at ' + r.name + '.', 'bad');
  return { ok: true, cost };
}

export function doPayOff(rid) {
  const s = G.s, r = REGION[rid], rs = s.regions[rid];
  if (!rs.unrest) return { err: 'Nothing to settle' };
  const cost = Math.round(140 * r.costMult * diff().cost);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  s.cash -= cost;
  rs.unrest = 0;
  addGreen(-0.5);
  logMsg('A community fund quietly ends the blockade at ' + r.name + '.', '');
  return { ok: true, cost };
}

export function unlockRegion(rid) {
  const s = G.s, r = REGION[rid], rs = s.regions[rid];
  if (rs.unlocked) return { err: 'Already operating' };
  const u = r.unlock || {};
  if (u.tech && !hasTech(u.tech)) return { err: 'Requires ' + TECH[u.tech].name };
  if (u.act && !rs.actOk) return { err: 'Requires an act of Congress' };
  if (u.op && !s.ops[u.op]) return { err: 'Requires a covert operation' };
  const cost = Math.round((u.cash || 0) * diff().cost);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  s.cash -= cost;
  rs.unlocked = true; rs.seized = 0;
  if (!rs.tiles) genRegion(rid);
  addGreen(r.green * 1.5);
  logMsg('Operations opened in ' + r.name + ', ' + r.place + '.', 'gold');
  return { ok: true, cost };
}

export function buyProgram(id) {
  const s = G.s, p = PROGRAMS.find(x => x.id === id);
  if (!p) return { err: 'Unknown' };
  const lv = s.programs[id] || 0;
  if (lv >= p.max) return { err: 'Fully funded' };
  const cost = Math.round(p.cost * Math.pow(p.scale, lv) * diff().cost);
  if (s.cash < cost) return { err: 'Need ' + money(cost) };
  s.cash -= cost;
  s.programs[id] = lv + 1;
  s.addiction = clamp(s.addiction + p.addiction, 0.05, 2);
  logMsg(p.name + ' funded to level ' + (lv + 1) + '. National oil addiction rises.', '');
  return { ok: true, cost, level: lv + 1 };
}
export function programCost(id) {
  const p = PROGRAMS.find(x => x.id === id), lv = G.s.programs[id] || 0;
  return lv >= p.max ? null : Math.round(p.cost * Math.pow(p.scale, lv) * diff().cost);
}

export function sellStock(amount) {
  const s = G.s;
  const take = Math.min(s.stock, amount || s.stock);
  if (take <= 0) return { err: 'Nothing stored' };
  s.stock -= take;
  const got = take * s.price * 0.97 * marginMult();
  s.cash += got;
  scarcityNudge(s, 0.99);
  return { ok: true, got, take };
}
