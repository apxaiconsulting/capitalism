/* ============================================================
   Capitalism - all DOM rendering
   ============================================================ */
import {
  REGIONS, REGION, STRUCT, TERRAIN, TECHS, TECH, BRANCHES, ACTS, ACT, OPS,
  PROGRAMS, ACHS, DIFFICULTY, HELP, VERSION
} from './data.js';
import {
  G, bus, logMsg, diff, hasTech, save, oiledCount, greenCount, isOiled, repPrice, demandOf
} from './state.js';
import {
  turn, doBuild, doDemolish, doScan, scanCost, buildCost, canBuild, doBribeLocals, doPayOff,
  unlockRegion, startResearch, techReady, buyProgram, programCost, buyRep, tableAct, runOp,
  donate, sellStock, voteOn, ENDINGS, PRICE_CEILING
} from './sim.js';
import { $, $$, el, money, num, pct, clamp, esc } from './util.js';
import { genRegion } from './map.js';

export const UI = { view: 'field', map: null, selTile: null, expand: -1 };
const mbbl = (v) => num(v, v < 10 ? 1 : 0);

/* ---------------- toasts ---------------- */
export function toast(msg, kind = '') {
  const box = $('#toasts');
  const n = el('div', 'toast ' + kind, msg);
  box.appendChild(n);
  setTimeout(() => { n.style.transition = 'opacity .3s'; n.style.opacity = '0'; setTimeout(() => n.remove(), 320); }, 2600);
  while (box.children.length > 4) box.firstChild.remove();
}

/* ---------------- modal ---------------- */
let modalQueue = [], modalOpen = false;
export const modalBusy = () => modalOpen;
export function showModal(cfg) { modalQueue.push(cfg); if (!modalOpen) nextModal(); }
function nextModal() {
  const root = $('#modal-root');
  const cfg = modalQueue.shift();
  if (!cfg) { modalOpen = false; root.className = ''; root.innerHTML = ''; bus.emit('modalClosed'); return; }
  modalOpen = true;
  root.innerHTML = ''; root.className = 'open';
  const scrim = el('div', 'scrim');
  if (!cfg.sticky) scrim.onclick = () => close();
  const m = el('div', 'modal');
  if (cfg.eyebrow) m.appendChild(el('div', 'eyebrow', esc(cfg.eyebrow)));
  if (cfg.title) m.appendChild(el('h2', '', esc(cfg.title)));
  if (cfg.html) m.appendChild(el('div', '', cfg.html));
  else if (cfg.text) m.appendChild(el('p', '', esc(cfg.text)));
  if (cfg.choices) {
    const wrap = el('div', 'choices');
    cfg.choices.forEach((c) => {
      const b = el('button', 'choice');
      const bad = (c.cost && G.s.cash < c.cost) || (c.req && !c.req(G.s));
      b.innerHTML = '<b>' + esc(c.label) + '</b>' +
        ((c.sub || c.cost) ? '<small>' + (c.cost ? money(c.cost) + (c.sub ? ' &middot; ' + esc(c.sub) : '') : esc(c.sub)) + '</small>' : '');
      if (bad) b.disabled = true;
      b.onclick = () => { try { c.run && c.run(G.s); } catch (e) { console.error(e); } close(); bus.emit('refresh'); };
      wrap.appendChild(b);
    });
    m.appendChild(wrap);
  }
  if (cfg.buttons) {
    const foot = el('div', 'modal-foot');
    cfg.buttons.forEach(b => {
      const n = el('button', 'btn ' + (b.cls || ''), esc(b.label));
      n.onclick = () => { b.run && b.run(); close(); bus.emit('refresh'); };
      foot.appendChild(n);
    });
    m.appendChild(foot);
  }
  if (!cfg.choices && !cfg.buttons) {
    const foot = el('div', 'modal-foot');
    const n = el('button', 'btn primary', 'Continue');
    n.onclick = () => close();
    foot.appendChild(n); m.appendChild(foot);
  }
  root.appendChild(scrim); root.appendChild(m);
  function close() { root.className = ''; setTimeout(nextModal, 60); }
}

/* ---------------- HUD ---------------- */
export function renderHUD() {
  const s = G.s; if (!s) return;
  $('#hud-date').textContent = s.year;
  $('#hud-cash').textContent = money(s.cash);
  const net = s.stats.lastNet || 0;
  const inc = $('#hud-income');
  inc.textContent = money(net, true) + '/yr';
  inc.className = net >= 0 ? 'pos' : 'neg';
  $('#hud-play').textContent = G.paused ? '▶' : 'II';
  $$('.spd').forEach(b => b.classList.toggle('on', +b.dataset.speed === G.cfg.speed && !G.paused));

  /* the gauge: black production bar against the red demand line */
  const demand = s.demand || demandOf(s);
  const prod = s.production || 0;
  const max = Math.max(demand, prod, 1) * 1.16;
  const fill = $('#g-fill');
  fill.style.width = (prod / max * 100).toFixed(1) + '%';
  const covered = prod + s.stock >= demand;
  fill.className = 'g-fill ' + (prod >= demand ? 'ok' : covered ? '' : 'short');
  $('#g-demand').style.width = (demand / max * 100).toFixed(1) + '%';
  const st = $('#g-stock');
  st.style.left = (prod / max * 100).toFixed(1) + '%';
  st.style.width = (Math.min(s.stock, max - prod) / max * 100).toFixed(1) + '%';
  $('#g-prod').innerHTML = 'Production <b>' + mbbl(prod) + '</b>';
  $('#g-dem').innerHTML = '<b>' + mbbl(demand) + '</b> Demand';
  const note = $('#g-note');
  if (s.crisisYears > 0) note.innerHTML = '<b class="neg">SHORTFALL ' + s.crisisYears + ' / ' + diff().patience + ' YEARS</b>';
  else if (s.stock > 0) note.innerHTML = '<span class="mid">' + mbbl(s.stock) + ' stored</span>';
  else note.innerHTML = prod >= demand ? '<span class="pos">supplied</span>' : '';

  const stats = [
    { k: 'Crude', v: '$' + num(s.price, 2), bar: clamp(s.price / PRICE_CEILING, 0, 1), col: s.price > 150 ? 'var(--bad)' : 'var(--amber)' },
    { k: 'Addiction', v: Math.round(s.addiction * 100) + '%', bar: clamp(s.addiction / 1.6, 0, 1), col: 'var(--amber)' },
    { k: 'Green mood', v: Math.round(s.green), bar: s.green / 100, col: 'var(--good)' },
    { k: 'Oiliness', v: Math.round(s.president.oiliness), bar: s.president.oiliness / 100, col: isOiled() ? 'var(--amber)' : 'var(--ink3)' },
    { k: 'Scandal', v: Math.round(s.heat), bar: s.heat / 120, col: s.heat > 60 ? 'var(--bad)' : 'var(--warn)' },
    { k: 'Wells', v: s.stats.wells, bar: null },
    { k: 'Warming', v: '+' + s.temp.toFixed(2) + 'C', bar: clamp(s.temp / 4, 0, 1), col: 'var(--bad)' }
  ];
  $('#hud-stats').innerHTML = stats.map(x =>
    '<div class="stat"><b>' + x.v + '</b><span>' + x.k + '</span>' +
    (x.bar != null ? '<div class="bar"><i style="width:' + (clamp(x.bar, 0, 1) * 100).toFixed(0) + '%;background:' + (x.col || 'var(--amber)') + '"></i></div>' : '') +
    '</div>').join('');

  $('#badge-capitol').className = 'badge' + ((s.agenda.length || s.campaign) ? ' on' : '');
  $('#badge-rnd').className = 'badge' + (!s.research ? ' on' : '');
  $('#badge-world').className = 'badge' + (s.crisisYears > 0 ? ' on' : '');
  $('#badge-intel').className = 'badge' + (s.heat > 60 ? ' on' : '');
}

/* ---------------- field ---------------- */
export function renderRegionBar() {
  const s = G.s, bar = $('#region-bar');
  bar.innerHTML = '';
  REGIONS.forEach(r => {
    const rs = s.regions[r.id];
    const b = el('button', 'rchip' + (UI.map && UI.map.rid === r.id ? ' on' : '') + (rs.unlocked ? '' : ' locked'));
    b.innerHTML = r.ic + ' ' + esc(r.name) +
      (rs.unlocked ? '<small class="muted"> ' + mbbl(rs.prod || 0) + '</small>' +
        (rs.armed ? ' \u{1F525}' : rs.unrest ? ' ✊' : '')
        : (rs.seized ? ' <small>seized</small>' : ' \u{1F512}'));
    b.onclick = () => {
      if (!rs.unlocked) { offerUnlock(r.id); return; }
      if (!rs.tiles) genRegion(r.id);
      UI.map.setRegion(r.id);
      closeSheet(); renderRegionBar(); renderRegionStats();
    };
    bar.appendChild(b);
  });
}

export function offerUnlock(rid) {
  const s = G.s, r = REGION[rid], rs = s.regions[rid];
  const u = r.unlock || {};
  const bits = [];
  if (u.cash) bits.push(money(Math.round(u.cash * diff().cost)) + ' entry cost');
  if (u.tech) bits.push('technology: ' + TECH[u.tech].name + (hasTech(u.tech) ? ' ✓' : ' ✗'));
  if (u.act) bits.push('legislation: ' + ACT[u.act].name + (rs.actOk ? ' ✓' : ' ✗'));
  if (u.op) bits.push('a covert operation' + (s.ops[u.op] ? ' ✓' : ' ✗'));
  showModal({
    eyebrow: r.place, title: r.name,
    html: '<p>' + esc(r.blurb) + '</p>' +
      bits.map(b => '<div class="kv"><span class="muted">' + esc(b) + '</span></div>').join('') +
      '<div class="kv"><span>Royalty rate</span><b>' + pct(r.royalty) + '</b></div>' +
      '<div class="kv"><span>Operating costs</span><b>' + pct(r.opexMult - 1, 0).replace('-', '−') + ' of normal</b></div>' +
      '<div class="kv"><span>Instability</span><b>' + (r.instability > 0.25 ? 'High' : r.instability > 0.05 ? 'Moderate' : 'Low') + '</b></div>' +
      (rs.seized ? '<p class="neg">These assets were nationalised. Re-entry means paying again.</p>' : ''),
    choices: [
      {
        label: 'Open operations', sub: bits.join(' · '), run: () => {
          const res = unlockRegion(rid);
          if (res.err) toast(res.err, 'bad');
          else { toast('Operations opened in ' + r.name, 'gold'); UI.map.setRegion(rid); renderRegionBar(); }
        }
      },
      { label: 'Not yet', run: () => { } }
    ]
  });
}

export function renderRegionStats() {
  const s = G.s, rid = UI.map && UI.map.rid;
  if (!rid) return;
  const rs = s.regions[rid], r = REGION[rid];
  const left = rs.tiles ? rs.tiles.reduce((t, x) => t + x.oil, 0) : 0;
  const known = rs.tiles ? rs.tiles.filter(t => t.sv).length : 0;
  const tot = rs.tiles ? rs.tiles.length : 1;
  $('#region-stats').innerHTML =
    '<span>Output <b>' + mbbl(rs.prod || 0) + '</b> Mbbl/yr</span>' +
    '<span>Wells <b>' + (rs.wells || 0) + '</b></span>' +
    '<span>Surveyed <b>' + Math.round(known / tot * 100) + '%</b></span>' +
    '<span>Known reserves <b>' + mbbl(left) + '</b></span>' +
    (rs.guarded ? '<span class="amb">guarded</span>' : '');
  const hint = $('#map-hint');
  if (rs.armed) {
    hint.innerHTML = '<b class="neg">\u{1F525} Armed insurgents here.</b> Output is down ' +
      (rs.guarded || hasTech('pmc') ? '15%' : '70%') + '. Build a Mercenary Camp' +
      (isOiled() ? ' or run an operation from Washington.' : '.');
  } else if (rs.unrest) {
    hint.innerHTML = '<b class="warnc">✊ Blockade at the access road.</b> Output down 40%. ' +
      '<button class="btn sm" id="btn-settle" style="margin-left:6px">Settle for ' + money(Math.round(140 * r.costMult * diff().cost)) + '</button>';
  } else if (rs.natRisk > 0.4) {
    hint.innerHTML = '<b class="warnc">Nationalisation is being debated in ' + esc(r.place) + '.</b> ' + Math.round(rs.natRisk * 100) + '% and rising.';
  } else {
    hint.innerHTML = esc(r.place) + ' · tap a tile to send an exploration crew, then drill what it finds.';
  }
  const btn = $('#btn-settle');
  if (btn) btn.onclick = () => {
    const res = doPayOff(rid);
    if (res.err) toast(res.err, 'bad'); else toast('The blockade is lifted', 'good');
    renderRegionStats(); renderHUD();
  };
}

/* ---------------- tile sheet ---------------- */
export function closeSheet() { $('#sheet').classList.remove('open'); UI.selTile = null; if (UI.map) UI.map.sel = null; }

export function openTile(tile) {
  const s = G.s, rid = UI.map.rid, r = REGION[rid];
  if (!tile) { closeSheet(); return; }
  UI.selTile = tile;
  const sheet = $('#sheet');
  const terr = TERRAIN[tile.T];
  const acts = [];
  const add = (ic, name, sub, px, fn, opt = {}) => acts.push({ ic, name, sub, px, fn, ...opt });

  if (tile.st) {
    const def = STRUCT[tile.st.k];
    add(def.ic, def.name, def.rate ? 'Built ' + tile.st.at : 'Infrastructure', '', null, { info: 1 });
    if (def.rate) {
      const share = tile.oil0 ? tile.oil / tile.oil0 : 1;
      add('\u{1F4CA}', mbbl(tile.st.last || 0) + ' Mbbl last year',
        def.noOil ? 'No field needed' :
          (tile.oil <= 0 ? 'The field is dry' : mbbl(tile.oil) + ' left of ' + mbbl(tile.oil0) +
            (share < 0.5 ? ' · past the half-way point, flow is declining' : '')), '', null, { info: 1 });
    }
    add('\u{1F4A3}', 'Demolish', 'Recover a quarter of the build cost',
      '+' + money(Math.round(def.cost * 0.25 * r.costMult)), () => {
        const res = doDemolish(rid, tile);
        if (res.err) toast(res.err, 'bad'); else toast('Demolished, ' + money(res.refund) + ' recovered');
        closeSheet(); renderHUD(); renderRegionStats();
      }, { danger: 1 });
  } else if (tile.T === 'village' || tile.T === 'town') {
    add(tile.T === 'village' ? '\u{1F6D6}' : '\u{1F3D8}', terr.name, terr.note, '', null, { info: 1 });
    add('\u{1F4B5}', r.bribe && tile.T === 'village' ? 'Pay the local authorities' : 'Buy out and clear',
      r.bribe && tile.T === 'village' ? 'They will take care of it' : 'Relocate everyone. It will be noticed.',
      money(Math.round((tile.T === 'village' ? 60 : 180) * r.costMult * diff().cost)), () => {
        const res = doBribeLocals(rid, tile);
        if (res.err) toast(res.err, 'bad'); else { toast('Cleared', 'bad'); openTile(tile); }
        renderHUD();
      }, { danger: 1 });
  } else if (!terr.build) {
    add('⛨', terr.name, terr.note || 'Nothing can be built here.', '', null, { info: 1 });
    if (tile.T === 'park') add('\u{1F3DB}', 'Needs legislation', 'Pass the Public Lands Transfer Act in Washington.', '', null, { info: 1 });
  } else {
    if (!tile.sv) {
      add('\u{1FA82}', 'Send an exploration crew',
        hasTech('seismic') ? 'Seismic imaging: surveys a wide patch' : 'Surveys this tile and its neighbours',
        money(scanCost(rid)), () => {
          const res = doScan(rid, tile);
          if (res.err) toast(res.err, 'bad');
          else {
            toast(res.found > 0 ? 'The crew found ' + mbbl(res.found) + ' Mbbl nearby' : 'The crew found nothing here', res.found > 0 ? 'good' : '');
            openTile(tile); renderRegionStats();
          }
          renderHUD();
        });
      if (tile.hint && hasTech('seismic')) add('\u{1F4A1}', 'Seismic trace', tile.hint > 1 ? 'Strong signal nearby' : 'A faint signal nearby', '', null, { info: 1 });
    } else {
      add('\u{1F4CD}', terr.name, tile.oil > 0 ? mbbl(tile.oil) + ' Mbbl in place' : 'Surveyed, nothing recoverable', '', null, { info: 1 });
    }
    Object.entries(STRUCT).forEach(([k, def]) => {
      if (!def.on.includes(tile.T)) return;
      if (def.tech && !hasTech(def.tech)) return;
      if (def.flagged && !s.flags[def.flagged]) return;
      const err = canBuild(rid, tile, k);
      if (err === 'Send an exploration crew first') return;
      add(def.ic, def.name, err || def.desc, money(buildCost(rid, tile, k)), err ? null : () => {
        const res = doBuild(rid, tile, k);
        if (res.err) toast(res.err, 'bad');
        else { toast(def.name + ' built for ' + money(res.cost), 'good'); openTile(tile); }
        renderHUD(); renderRegionStats(); renderRegionBar();
      }, { disabled: !!err, danger: k === 'burner' });
    });
  }

  sheet.innerHTML = '<div class="grab"></div>' +
    '<div class="sheet-head"><div><h3>' + esc(terr.name) + ' ' + tile.x + ',' + tile.y + '</h3>' +
    '<div class="sub">' + esc(REGION[rid].name) + (tile.sv && tile.oil > 0 ? ' · ' + mbbl(tile.oil) + ' Mbbl' : '') + '</div></div>' +
    '<button class="x" aria-label="Close">×</button></div><div class="act-grid"></div>';
  sheet.querySelector('.x').onclick = closeSheet;
  const grid = sheet.querySelector('.act-grid');
  acts.forEach(a => {
    const b = el('button', 'act' + (a.danger ? ' danger' : '') + (a.info ? ' on' : ''));
    b.innerHTML = '<span class="ic">' + a.ic + '</span><span><b>' + esc(a.name) + '</b><small>' + esc(a.sub || '') + '</small></span>' +
      (a.px ? '<span class="px">' + a.px + '</span>' : '');
    if (!a.fn) b.disabled = true; else b.onclick = a.fn;
    grid.appendChild(b);
  });
  sheet.classList.add('open');
}

/* ---------------- world ---------------- */
export function renderWorld() {
  const s = G.s;
  const body = $('#world-body');
  const peakPct = clamp(s.world.extracted / Math.max(1, s.world.total), 0, 1);
  body.innerHTML = `
  <div class="card">
    <h3>Demand against your production
      <span class="tagn ${s.production >= s.demand ? 'pos' : 'neg'}">${s.production >= s.demand ? 'supplied' : 'short by ' + mbbl(s.demand - s.production)}</span></h3>
    <div class="sparkwrap"><canvas class="spark" id="spark-dem"></canvas></div>
    <div class="row" style="margin-top:10px;gap:14px;flex-wrap:wrap">
      <div><small class="muted">Demand</small><div><b>${mbbl(s.demand)}</b> Mbbl/yr</div></div>
      <div><small class="muted">You produce</small><div><b>${mbbl(s.production)}</b> Mbbl/yr</div></div>
      <div><small class="muted">Economy index</small><div><b>${s.gdp.toFixed(2)}&times;</b></div></div>
      <div><small class="muted">Oil addiction</small><div><b>${Math.round(s.addiction * 100)}%</b></div></div>
    </div>
    <p class="muted" style="font-size:12.5px;margin:10px 0 0">
      Demand is the economy multiplied by the country's addiction to oil. Pro-oil acts and the programmes in HQ raise addiction;
      efficiency standards, transit and electrification cut it. Fall short and Congress, the street and the price all react.</p>
  </div>

  <div class="card">
    <h3>Crude <span class="amb">$${num(s.price, 2)}</span>
      <span class="tagn">${s.price > 150 ? '<span class="neg">approaching the ceiling</span>' : 'stable value $' + num(s.stable, 2)}</span></h3>
    <div class="sparkwrap"><canvas class="spark" id="spark-price" style="height:86px"></canvas></div>
    <div class="meter" style="margin-top:8px"><i style="width:${(s.price / PRICE_CEILING * 100).toFixed(1)}%;background:${s.price > 150 ? 'var(--bad)' : 'var(--amber)'}"></i></div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">At $${PRICE_CEILING} a barrel the world stops functioning as a market. That is an ending, and not a good one.</p>
  </div>

  <div class="card">
    <h3>Stockpile <span class="tagn">${mbbl(s.stock)} / ${num(s.storeCap, 0)} Mbbl</span></h3>
    <div class="meter"><i style="width:${(clamp(s.stock / Math.max(1, s.storeCap), 0, 1) * 100).toFixed(0)}%"></i></div>
    <p class="muted" style="font-size:12.5px;margin:8px 0">Anything you pump above demand goes into storage automatically and covers a future shortfall. Tank farms on the map raise the limit.</p>
    <button class="btn sm" id="btn-dump" ${s.stock < 0.5 ? 'disabled' : ''}>Sell the stockpile now (${money(s.stock * s.price)})</button>
  </div>

  <div class="card">
    <h3>Last year</h3>
    <div class="kv"><span>Sold</span><b>${mbbl(s.sold)} Mbbl at $${num(s.price, 2)}</b></div>
    <div class="kv"><span>Gross revenue</span><b class="pos">${money(s.stats.lastGross || 0)}</b></div>
    <div class="kv"><span>Royalties and tax</span><b class="neg">-${money(s.stats.lastTax || 0)}</b></div>
    <div class="kv"><span>Operating and budgets</span><b class="neg">-${money(s.stats.lastOpex || 0)}</b></div>
    <div class="kv"><span>Net</span><b class="${(s.stats.lastNet || 0) >= 0 ? 'pos' : 'neg'}">${money(s.stats.lastNet || 0, true)}</b></div>
    ${s.subsidy ? `<div class="kv"><span>Federal subsidy</span><b class="pos">$${num(s.subsidy, 2)}/bbl on domestic oil</b></div>` : ''}
    <div class="kv"><span>Tax rate</span><b>${pct(s.tax)}</b></div>
  </div>

  <div class="card">
    <h3>The world's oil <span class="tagn">${s.world.peaked ? '<span class="neg">past peak</span>' : Math.round(peakPct * 100) + '% burned'}</span></h3>
    <div class="meter"><i style="width:${(peakPct * 100).toFixed(1)}%;background:${peakPct > 0.5 ? 'var(--bad)' : 'var(--amber)'}"></i></div>
    <div class="kv"><span>Pumped by you, all time</span><b>${num(s.stats.totalPumped, 0)} Mbbl</b></div>
    <div class="kv"><span>Peak output year</span><b>${s.world.peaked ? s.world.peakYear : '-'}</b></div>
    <div class="kv"><span>Cumulative carbon</span><b>${num(s.emissions, 0)} Gt · +${s.temp.toFixed(2)}C</b></div>
  </div>

  <div class="card">
    <h3>Production by region</h3>
    ${REGIONS.filter(r => s.regions[r.id].unlocked).map(r => {
    const rs = s.regions[r.id];
    const left = rs.tiles ? rs.tiles.reduce((t, x) => t + x.oil, 0) : 0;
    return `<div class="listitem"><span class="ic">${r.ic}</span><div class="body"><b>${esc(r.name)}</b>
      <small>${mbbl(rs.prod || 0)} Mbbl/yr · ${rs.wells || 0} wells · ${mbbl(left)} Mbbl known reserves · royalty ${pct(r.royalty)}</small>
      ${rs.armed ? '<small class="neg">armed insurgents</small>' : rs.unrest ? '<small class="warnc">blockade</small>' : ''}
      <div class="meter" style="margin-top:5px"><i style="width:${(clamp((rs.prod || 0) / Math.max(1, s.production), 0, 1) * 100).toFixed(0)}%"></i></div></div></div>`;
  }).join('') || '<div class="empty">No operations yet.</div>'}
  </div>`;
  const dump = $('#btn-dump');
  if (dump) dump.onclick = () => {
    const res = sellStock();
    if (res.err) toast(res.err, 'bad'); else toast('Sold ' + mbbl(res.take) + ' Mbbl for ' + money(res.got), 'gold');
    renderWorld(); renderHUD();
  };
  drawDemandChart();
  drawPriceChart();
}

function chartSetup(id, h) {
  const cv = $('#' + id); if (!cv) return null;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = cv.clientWidth, ht = cv.clientHeight || h;
  cv.width = w * dpr; cv.height = ht * dpr;
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, ht);
  c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1;
  for (let i = 0; i <= 3; i++) { const y = 6 + i * (ht - 12) / 3; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  return { c, w, ht };
}
function line(c, data, X, Y, color, fill) {
  if (data.length < 2) return;
  c.beginPath(); c.moveTo(X(0), Y(data[0]));
  data.forEach((v, i) => c.lineTo(X(i), Y(v)));
  if (fill) {
    c.lineTo(X(data.length - 1), Y(0)); c.lineTo(X(0), Y(0)); c.closePath();
    c.fillStyle = fill; c.fill();
  } else { c.strokeStyle = color; c.lineWidth = 2; c.stroke(); }
}
function drawDemandChart() {
  const s = G.s, setup = chartSetup('spark-dem', 110); if (!setup) return;
  const { c, w, ht } = setup;
  const d = s.demandHist.slice(-90), p = s.prodHist.slice(-90);
  if (d.length < 2) { c.fillStyle = '#6b768d'; c.font = '11px ui-sans-serif'; c.fillText('Advance a year to see the curve', 8, ht / 2); return; }
  const max = Math.max(...d, ...p, 1) * 1.1;
  const X = (i) => (i / (d.length - 1)) * (w - 6) + 3;
  const Y = (v) => ht - 6 - (v / max) * (ht - 14);
  line(c, p, X, Y, '#f0a830', 'rgba(240,168,48,.22)');
  line(c, p, X, Y, '#f0a830');
  line(c, d, X, Y, '#ff4d3d');
  c.fillStyle = '#6b768d'; c.font = '10px ui-sans-serif,sans-serif';
  c.fillText(num(max, 0) + ' Mbbl', 4, 12);
  c.fillStyle = '#ff4d3d'; c.fillText('demand', w - 54, 12);
  c.fillStyle = '#f0a830'; c.fillText('you', w - 54, 24);
}
function drawPriceChart() {
  const s = G.s, setup = chartSetup('spark-price', 86); if (!setup) return;
  const { c, w, ht } = setup;
  const h = s.priceHist.slice(-90);
  if (h.length < 2) return;
  const max = Math.max(...h) * 1.15, min = 0;
  const X = (i) => (i / (h.length - 1)) * (w - 6) + 3;
  const Y = (v) => ht - 6 - ((v - min) / Math.max(0.001, max - min)) * (ht - 14);
  line(c, h, X, Y, '#5aa9f0', 'rgba(90,169,240,.18)');
  line(c, h, X, Y, '#5aa9f0');
  c.fillStyle = '#6b768d'; c.font = '10px ui-sans-serif,sans-serif';
  c.fillText('$' + max.toFixed(0), 4, 12);
}

/* ---------------- Washington ---------------- */
export function renderCapitol() {
  const s = G.s, p = s.president, camp = s.campaign;
  const oiled = oiledCount(), green = greenCount(), gray = 10 - oiled - green;
  const body = $('#capitol-body');
  body.innerHTML = `
  <div class="card">
    <h3>The White House <span class="tagn">${camp ? 'election this year' : 'next election in ' + s.electionIn + ' years'}</span></h3>
    <div class="listitem"><span class="ic" style="font-size:22px">${isOiled() ? '\u{1F6E2}' : p.party === 'Elephant' ? '\u{1F418}' : '\u{1F434}'}</span>
      <div class="body"><b>${esc(p.name)} <span class="muted">(${esc(p.party)})</span></b>
      <small>Administration oiliness ${Math.round(p.oiliness)} of 100${isOiled() ? ' · <span class="amb">the room below the White House is open to you</span>' : ' · 60 is needed for covert operations'}</small>
      <div class="meter" style="margin-top:5px"><i style="width:${p.oiliness}%;background:${isOiled() ? 'var(--amber)' : 'var(--ink3)'}"></i></div>
      <small class="muted" style="margin-top:4px">Public approval of the administration: ${Math.round(s.popularity)}</small>
      </div></div>
  </div>

  ${camp ? `<div class="card">
    <h3>The race <span class="tagn">polls: ${Math.round(camp.poll * 100)} / ${Math.round((1 - camp.poll) * 100)}</span></h3>
    <div class="race">
      <div class="lane e"><i style="width:${clamp(camp.poll * 70 + camp.donE / 40, 4, 100)}%"></i>
        <span>\u{1F418} ${esc(camp.elephant.name)}</span><em>${money(camp.donE)}</em></div>
      <div class="lane d"><i style="width:${clamp((1 - camp.poll) * 70 + camp.donD / 40, 4, 100)}%"></i>
        <span>\u{1F434} ${esc(camp.donkey.name)}</span><em>${money(camp.donD)}</em></div>
    </div>
    <div class="row" style="gap:6px;flex-wrap:wrap">
      ${[100, 300, 700].map(a => `<button class="btn sm don" data-side="elephant" data-amt="${a}">\u{1F418} +${money(a)}</button>`).join('')}
    </div>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">
      ${[100, 300, 700].map(a => `<button class="btn sm don" data-side="donkey" data-amt="${a}">\u{1F434} +${money(a)}</button>`).join('')}
    </div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Back the likely winner, and hedge the other one in case of an upset. What you give the winner sets how oily the next administration is.${hasTech('media') ? ' Your media holdings double the effect of every dollar.' : ''}</p>
  </div>` : ''}

  <div class="card">
    <h3>Congress <span class="tagn">${oiled} oiled · ${gray} gray · ${green} green</span></h3>
    <div class="seats">
      ${s.congress.map((r, i) => {
    const cost = repPrice() * (r.type === 'green' ? 3 : 1);
    return `<button class="seat ${r.type}" data-rep="${i}" ${r.type === 'oiled' ? 'disabled' : ''}>
        <span class="who">${r.type === 'oiled' ? '\u{1F6E2}' : r.type === 'green' ? '\u{1F343}' : '\u{1F464}'} ${esc(r.name)}</span>
        <span class="what">${r.type}</span>
        ${r.type === 'oiled' ? '<span class="px">yours</span>' : '<span class="px">' + money(cost) + '</span>'}
      </button>`;
  }).join('')}
    </div>
    <p class="muted" style="font-size:12px;margin:0">Oiled representatives always vote for your acts and against the green ones. Gray ones flip a coin.
    Six votes carry a bill. Buying seats raises scandal, and an election loosens about a third of them.</p>
  </div>

  <div class="card">
    <h3>On the floor</h3>
    ${s.agenda.length ? s.agenda.map((a, i) => actCard(s, a, i)).join('') : '<div class="empty">Nothing in committee.</div>'}
    <button class="btn sm" id="btn-table" style="margin-top:8px">Introduce a bill of your own</button>
  </div>

  <div class="card ${isOiled() ? '' : 'muted'}" style="${isOiled() ? 'border-color:#6b4a15' : ''}">
    <h3>${isOiled() ? '\u{1F512} The room below the White House' : '\u{1F512} Covert operations'}
      <span class="tagn">${isOiled() ? 'open' : 'needs an oiled president'}</span></h3>
    ${isOiled() ? OPS.map(op => {
    const done = s.ops[op.id] && !op.anyRegion;
    const blocked = (op.req && op.req.some(r => !s.ops[r])) || (op.cond && !op.cond(s));
    return `<div class="listitem"><span class="ic">${op.ic}</span><div class="body">
        <b>${esc(op.name)}</b><small>${esc(op.desc)}</small>
        ${blocked ? '<small class="neg">' + (op.req ? 'Requires: ' + op.req.map(r => (OPS.find(o => o.id === r) || { name: r }).name).join(', ') : 'Conditions are not right yet') + '</small>' : ''}
        </div>${done ? '<span class="pill a">done</span>' : `<button class="btn sm op" data-op="${op.id}" ${blocked ? 'disabled' : ''}>${money(Math.round(op.cost * diff().cost))}</button>`}</div>`;
  }).join('') : '<p class="muted" style="font-size:12.5px;margin:0">Donate enough to a winning candidate and the next administration will take your calls. Wars, coups and quietly removed obstacles are arranged here.</p>'}
  </div>

  ${s.heat > 40 ? `<div class="card" style="border-color:#5a241c">
    <h3 class="neg">Scandal ${Math.round(s.heat)}</h3>
    <div class="meter"><i style="width:${clamp(s.heat / 120, 0, 1) * 100}%;background:var(--bad)"></i></div>
    <p class="muted" style="font-size:12.5px;margin:8px 0 0">Past 55 the Justice Department starts asking questions. Past 95 a grand jury indicts. The legal budget in HQ cools it.</p>
  </div>` : ''}`;

  $$('.don').forEach(b => b.onclick = () => {
    const res = donate(b.dataset.side, +b.dataset.amt);
    if (res.err) toast(res.err, 'bad');
    renderCapitol(); renderHUD();
  });
  $$('[data-rep]').forEach(b => b.onclick = () => {
    const res = buyRep(+b.dataset.rep);
    if (res.err) toast(res.err, 'bad'); else toast('Seat secured for ' + money(res.cost), 'good');
    renderCapitol(); renderHUD();
  });
  $$('.op').forEach(b => b.onclick = () => {
    const op = OPS.find(o => o.id === b.dataset.op);
    if (op.anyRegion) {
      const open = REGIONS.filter(r => s.regions[r.id].unlocked && (s.regions[r.id].unrest || s.regions[r.id].armed));
      if (!open.length) { toast('No unrest to deal with', 'bad'); return; }
      showModal({
        eyebrow: 'Operation', title: op.name,
        text: op.desc,
        choices: open.map(r => ({
          label: r.name, sub: r.place, cost: Math.round(op.cost * diff().cost),
          run: () => { const res = runOp(op.id, r.id); if (res.err) toast(res.err, 'bad'); else toast('Operation complete', 'gold'); }
        })).concat([{ label: 'Cancel', run: () => { } }])
      });
      return;
    }
    const res = runOp(op.id, op.region);
    if (res.err) toast(res.err, 'bad'); else toast('Operation complete: ' + op.name, 'gold');
    renderCapitol(); renderHUD(); renderRegionBar();
  });
  $('#btn-table').onclick = tableDialog;
}

function actCard(s, a, i) {
  const act = ACT[a.id];
  const oiled = oiledCount(), green = greenCount(), gray = 10 - oiled - green;
  const sure = act.pro ? oiled : green;
  const need = 6 - sure;
  return `<div class="listitem" style="align-items:flex-start">
    <span class="ic">${act.ic}</span>
    <div class="body">
      <b>${esc(act.name)} ${act.pro ? '<span class="pill a">helps you</span>' : '<span class="pill r">hurts you</span>'}</b>
      <small>${esc(act.desc)} <span class="${act.pro ? 'pos' : 'neg'}">${esc(act.blurb)}</span></small>
      <small>Vote ${a.voteIn <= 0 ? 'this year' : 'next year'} ·
        ${act.pro
      ? `<b class="${oiled >= 6 ? 'pos' : ''}">${oiled} certain yes</b>, ${gray} coin flips, ${green} certain no`
      : `<b class="${green >= 6 ? 'neg' : ''}">${green} certain yes</b>, ${gray} coin flips, ${oiled} certain no (yours)`}
      </small>
      ${act.pro && need > 0 ? `<small class="muted">You need ${need} of the ${gray} gray votes, or buy ${need} more seats.</small>` : ''}
      ${!act.pro && oiled < 5 ? `<small class="warnc">Buy gray seats to kill this.</small>` : ''}
    </div></div>`;
}

function tableDialog() {
  const s = G.s;
  const pool = ACTS.filter(a => a.pro && !s.agenda.some(x => x.id === a.id) && (a.repeat || !s.history.includes(a.id)) && (!a.cond || a.cond(s)));
  if (!pool.length) { toast('Nothing left to introduce', 'bad'); return; }
  const cost = Math.round(120 * (1 + (s.year - 1946) / 45) * diff().cost);
  showModal({
    eyebrow: 'Draft legislation', title: 'What would you like written?',
    text: 'Your counsel drafts it and a friendly member introduces it. The vote comes next year, which gives you a year to arrange the votes.',
    choices: pool.slice(0, 8).map(a => ({
      label: a.ic + ' ' + a.name, sub: a.blurb, cost,
      run: () => { const res = tableAct(a.id); if (res.err) toast(res.err, 'bad'); else toast('Bill introduced', 'good'); }
    })).concat([{ label: 'Nothing for now', run: () => { } }])
  });
}

/* ---------------- R&D ---------------- */
export function renderRnd() {
  const s = G.s, r = s.research;
  $('#rnd-body').innerHTML = `
  ${r ? `<div class="card" style="border-color:var(--amber)">
    <h3>In development <span class="tagn">${r.left} of ${r.total} years left</span></h3>
    <div class="listitem"><span class="ic">${TECH[r.id].ic}</span><div class="body"><b>${esc(TECH[r.id].name)}</b>
    <small>${esc(TECH[r.id].desc)}</small>
    <div class="meter" style="margin-top:6px"><i style="width:${((r.total - r.left) / r.total * 100).toFixed(0)}%"></i></div></div></div>
  </div>` : `<div class="card"><h3>Research department idle</h3><p class="muted" style="font-size:13px;margin:0">One programme at a time, and they take years. Choose carefully.</p></div>`}
  ${Object.entries(BRANCHES).map(([bid, br]) => `
    <div class="sectitle">${br.ic} ${br.name}</div>
    ${TECHS.filter(t => t.b === bid).map(t => {
    const done = !!s.techs[t.id], busy = r && r.id === t.id, ready = techReady(t.id);
    return `<button class="tech ${done ? 'done' : busy ? 'busy' : !ready ? 'locked' : ''}" data-tech="${t.id}">
      <span class="ic">${t.ic}</span>
      <span style="flex:1"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small>
      ${!ready && !done ? '<small class="neg">Needs ' + t.req.map(x => TECH[x].name).join(', ') + '</small>' : ''}</span>
      <span class="px">${done ? '<span class="pos">done</span>' : busy ? '<span class="amb">' + r.left + 'y</span>' : money(Math.round(t.cost * diff().cost)) + '<br><span class="muted">' + t.m + ' yrs</span>'}</span>
    </button>`;
  }).join('')}`).join('')}`;
  $$('[data-tech]').forEach(b => b.onclick = () => {
    const res = startResearch(b.dataset.tech);
    if (res.err) toast(res.err, 'bad'); else { toast('R&D started: ' + TECH[b.dataset.tech].name, 'good'); renderRnd(); renderHUD(); }
  });
}

/* ---------------- HQ ---------------- */
export function renderHQ() {
  const s = G.s, d = diff();
  $('#hq-body').innerHTML = `
  <div class="card">
    <h3>${esc(s.company)} <span class="tagn">${d.name} · since 1946</span></h3>
    <div class="kv"><span>Years supplying the country</span><b class="pos">${s.stats.metYears}</b></div>
    <div class="kv"><span>Consecutive shortfall years</span><b class="${s.crisisYears ? 'neg' : ''}">${s.crisisYears} of ${d.patience} allowed</b></div>
    <div class="kv"><span>Profit last year</span><b class="${(s.stats.lastNet || 0) >= 0 ? 'pos' : 'neg'}">${money(s.stats.lastNet || 0, true)}</b></div>
    <div class="kv"><span>Acts passed for you</span><b>${s.stats.actsPassed}</b></div>
    <div class="kv"><span>Seats bought</span><b>${s.stats.repsBought}</b></div>
    <div class="kv"><span>Operations run</span><b>${s.stats.opsRun}</b></div>
  </div>

  <div class="card">
    <h3>Annual budgets <span class="tagn">${money(s.budgets.pr + s.budgets.legal + s.budgets.lobby)}/yr</span></h3>
    ${[['pr', 'Public relations', 'Holds down environmental consciousness' + (hasTech('prmachine') ? ' (doubled)' : '')],
      ['legal', 'Legal department', 'Cools scandal' + (hasTech('lawfirm') ? ' (doubled)' : '')],
      ['lobby', 'Lobbying retainer', 'Keeps the gray seats friendly']].map(([k, name, desc]) => `
      <div style="margin-bottom:10px">
        <div class="row" style="justify-content:space-between"><b style="font-size:13px">${name}</b><span class="amb mono">${money(s.budgets[k])}/yr</span></div>
        <small class="muted">${desc}</small>
        <input type="range" min="0" max="400" step="20" value="${s.budgets[k]}" data-budget="${k}">
      </div>`).join('')}
  </div>

  <div class="card">
    <h3>Addiction programmes <span class="tagn">addiction ${Math.round(s.addiction * 100)}%</span></h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 8px">Nobody sells oil by waiting for demand. Build the country that cannot live without it. Every level raises national addiction permanently, and demand with it.</p>
    ${PROGRAMS.map(p => {
      const lv = s.programs[p.id] || 0, cost = programCost(p.id);
      return `<div class="listitem"><span class="ic">${p.ic}</span><div class="body">
        <b>${esc(p.name)} <span class="muted">${lv}/${p.max}</span></b><small>${esc(p.desc)}</small>
        <small class="muted">+${Math.round(p.addiction * 100)}% addiction per level${p.green > 0 ? ' · raises green mood' : p.green < 0 ? ' · lowers green mood' : ''}</small>
        <div class="meter" style="margin-top:5px"><i style="width:${lv / p.max * 100}%"></i></div></div>
        <button class="btn sm prog" data-p="${p.id}" ${cost == null ? 'disabled' : ''}>${cost == null ? 'max' : money(cost)}</button></div>`;
    }).join('')}
  </div>

  <div class="card">
    <h3>Concessions</h3>
    ${REGIONS.map(r => {
      const rs = s.regions[r.id];
      return `<div class="listitem"><span class="ic">${r.ic}</span><div class="body">
        <b>${esc(r.name)} <span class="muted">${esc(r.place)}</span></b>
        <small>${rs.unlocked ? mbbl(rs.prod || 0) + ' Mbbl/yr · ' + (rs.wells || 0) + ' wells · royalty ' + pct(r.royalty) : esc((r.unlock && r.unlock.text) || '')}</small></div>
        ${rs.unlocked ? '<span class="pill g">operating</span>' : '<button class="btn sm unlockr" data-r="' + r.id + '">open</button>'}</div>`;
    }).join('')}
  </div>

  <div class="card">
    <h3>Clean portfolio <span class="tagn">${num(s.green_cap, 0)} capacity</span></h3>
    <div class="meter"><i style="width:${clamp(s.green_cap / 1200, 0, 1) * 100}%;background:var(--good)"></i></div>
    <p class="muted" style="font-size:12.5px;margin:8px 0 0">Reach 1200 while still profitable and you can leave this industry on your own terms. The Futures branch in R&amp;D builds it.</p>
  </div>`;
  $$('[data-budget]').forEach(inp => inp.oninput = () => { G.s.budgets[inp.dataset.budget] = +inp.value; renderHQ(); });
  $$('.prog').forEach(b => b.onclick = () => {
    const res = buyProgram(b.dataset.p);
    if (res.err) toast(res.err, 'bad'); else toast('Funded for ' + money(res.cost), 'good');
    renderHQ(); renderHUD();
  });
  $$('.unlockr').forEach(b => b.onclick = () => offerUnlock(b.dataset.r));
}

/* ---------------- intel ---------------- */
export function renderIntel() {
  const s = G.s, got = Object.keys(s.achs).length;
  $('#intel-body').innerHTML = `
  <div class="card">
    <h3>The record</h3>
    <div class="kv"><span>Total pumped</span><b>${num(s.stats.totalPumped, 0)} Mbbl</b></div>
    <div class="kv"><span>Lifetime revenue</span><b>${money(s.stats.revenue)}</b></div>
    <div class="kv"><span>Wells running</span><b>${s.stats.wells}</b></div>
    <div class="kv"><span>Major spills</span><b>${s.stats.spills}</b></div>
    <div class="kv"><span>Wars started</span><b>${s.stats.warsStarted}</b></div>
    <div class="kv"><span>Hostile acts blocked</span><b>${s.stats.actsBlocked}</b></div>
    <div class="kv"><span>Administrations</span><b>${s.administrations} (${s.oiledTerms} oiled)</b></div>
    <div class="kv"><span>Global warming</span><b class="${s.temp > 2 ? 'neg' : ''}">+${s.temp.toFixed(2)}C</b></div>
  </div>

  <div class="card">
    <h3>Achievements <span class="tagn">${got} of ${ACHS.length}</span></h3>
    ${ACHS.map(a => `<div class="ach ${s.achs[a.id] ? 'got' : ''}"><span class="ic">${s.achs[a.id] ? a.ic : '❓'}</span>
      <div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div></div>`).join('')}
  </div>

  <div class="card">
    <h3>Dispatches</h3>
    ${s.log.length ? s.log.slice(0, 70).map(l => `<div class="logline ${l.kind}"><span class="when">${l.y}</span><span class="what">${esc(l.what)}</span></div>`).join('') : '<div class="empty">Nothing yet.</div>'}
  </div>

  <div class="card">
    <h3>Game</h3>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      <button class="btn sm" id="btn-save">Save now</button>
      <button class="btn sm" id="btn-sound">Sound: ${G.cfg.sound ? 'on' : 'off'}</button>
      <button class="btn sm" id="btn-help2">How to play</button>
      <button class="btn sm danger" id="btn-restart">Abandon run</button>
    </div>
    <p class="muted" style="font-size:11.5px;margin:10px 0 0">Autosaves every few years and whenever you leave the app. v${VERSION}</p>
  </div>`;
  $('#btn-save').onclick = () => toast(save() ? 'Saved' : 'Could not save', 'good');
  $('#btn-sound').onclick = () => { G.cfg.sound = !G.cfg.sound; bus.emit('cfg'); renderIntel(); };
  $('#btn-help2').onclick = () => showModal({ html: HELP.how });
  $('#btn-restart').onclick = () => showModal({
    eyebrow: 'Careful', title: 'Abandon this run?',
    text: 'The save will be deleted and you will start again in 1946.',
    choices: [
      { label: 'Abandon and return to the title', run: () => bus.emit('abandon') },
      { label: 'Keep playing', run: () => { } }
    ]
  });
}

/* ---------------- view switching ---------------- */
export function setView(v) {
  UI.view = v;
  $$('.view').forEach(n => n.classList.toggle('active', n.id === 'view-' + v));
  $$('.tab').forEach(n => n.classList.toggle('active', n.dataset.view === v));
  if (v !== 'field') closeSheet();
  renderView();
  if (UI.map && v === 'field') UI.map.resize();
}
export function renderView() {
  switch (UI.view) {
    case 'field': renderRegionBar(); renderRegionStats(); break;
    case 'world': renderWorld(); break;
    case 'capitol': renderCapitol(); break;
    case 'rnd': renderRnd(); break;
    case 'hq': renderHQ(); break;
    case 'intel': renderIntel(); break;
  }
}
export function refreshAll() { renderHUD(); renderView(); }
