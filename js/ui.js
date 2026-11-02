/* ============================================================
   Capitalism - all DOM: three menus, a globe, a readout
   ============================================================ */
import { PLACES, PLACE, ACTIONS, ACTS, ACT, OPS, ACHS, DIFFICULTY, HELP, VERSION } from './data.js';
import { G, bus, diff, demandOf, royaltyOf, costOf, repPrice, oiledCount, greenCount, isOiled, save } from './state.js';
import { act, openPlace, buyRep, tableAct, runOp, opReady, donate, CEILING } from './sim.js';
import { genScene, poolUnder } from './field.js';
import { $, $$, el, money, num, pct, clamp, esc } from './util.js';

export const UI = { field: null, place: 'texas', armed: null, panel: null };
const mb = (v) => num(v, v < 10 ? 1 : 0);

/* ---------- toast + ticker ---------- */
export function toast(msg, kind = '') {
  const box = $('#toasts');
  const n = el('div', 'toast ' + kind, msg);
  box.appendChild(n);
  setTimeout(() => { n.style.transition = 'opacity .3s'; n.style.opacity = '0'; setTimeout(() => n.remove(), 320); }, 2600);
  while (box.children.length > 3) box.firstChild.remove();
}
let tickT = 0;
export function ticker(msg) {
  const t = $('#ticker');
  t.className = 'ticker on';
  t.innerHTML = msg;
  clearTimeout(tickT);
  tickT = setTimeout(() => t.classList.remove('on'), 4200);
}
/* the year's front page */
export function headline(msg) {
  const t = $('#ticker');
  t.className = 'ticker news on';
  t.innerHTML = esc(msg);
  clearTimeout(tickT);
  tickT = setTimeout(() => t.classList.remove('on'), 5200);
}

/* ---------- modal ---------- */
let queue = [], openM = false;
export const modalBusy = () => openM;
export function flushModals() {
  queue.length = 0; openM = false;
  const r = $('#modal-root'); if (r) { r.className = ''; r.innerHTML = ''; }
}
export function showModal(cfg) { queue.push(cfg); if (!openM) nextModal(); }
function nextModal() {
  const root = $('#modal-root'), cfg = queue.shift();
  if (!cfg) { openM = false; root.className = ''; root.innerHTML = ''; return; }
  openM = true; root.innerHTML = ''; root.className = 'open';
  const scrim = el('div', 'scrim' + (cfg.cls === 'ending' ? ' light' : ''));
  if (!cfg.sticky) scrim.onclick = close;
  const m = el('div', 'modal' + (cfg.cls ? ' ' + cfg.cls : ''));
  if (cfg.eyebrow) m.appendChild(el('div', 'eyebrow', esc(cfg.eyebrow)));
  if (cfg.title) m.appendChild(el('h2', '', esc(cfg.title)));
  if (cfg.html) m.appendChild(el('div', '', cfg.html));
  else if (cfg.text) m.appendChild(el('p', '', esc(cfg.text)));
  if (cfg.choices) {
    const w = el('div', 'choices');
    cfg.choices.forEach(c => {
      const b = el('button', 'choice');
      b.innerHTML = '<b>' + esc(c.label) + '</b>' + ((c.sub || c.cost) ? '<small>' + (c.cost ? money(c.cost) + (c.sub ? ' &middot; ' + esc(c.sub) : '') : esc(c.sub)) + '</small>' : '');
      if (c.cost && G.s.cash < c.cost) b.disabled = true;
      b.onclick = () => { try { c.run && c.run(G.s); } catch (e) { console.error(e); } close(); bus.emit('refresh'); };
      w.appendChild(b);
    });
    m.appendChild(w);
  }
  const foot = el('div', 'modal-foot');
  (cfg.buttons || (cfg.choices ? [] : [{ label: 'Continue', cls: 'primary' }])).forEach(b => {
    const n = el('button', 'btn ' + (b.cls || ''), esc(b.label));
    n.onclick = () => { b.run && b.run(); close(); bus.emit('refresh'); };
    foot.appendChild(n);
  });
  if (foot.children.length) m.appendChild(foot);
  root.appendChild(scrim); root.appendChild(m);
  if (cfg.after) { try { cfg.after(m); } catch (e) { console.error(e); } }
  function close() { root.className = ''; setTimeout(nextModal, 60); }
}

/* a year ticking past should be visible, and so should the money */
export function yearTick(s) {
  const y = $('#r-year');
  y.classList.remove('tick'); void y.offsetWidth; y.classList.add('tick');
  const net = s.stats.lastNet || 0;
  if (Math.abs(net) < 0.5) return;
  const f = el('div', 'float ' + (net >= 0 ? 'pos' : 'neg'), money(net, true));
  $('#stage').appendChild(f);
  setTimeout(() => f.remove(), 1500);
}

/* ---------- HUD ---------- */
export function renderHUD() {
  const s = G.s; if (!s) return;
  $('#r-cash').textContent = money(s.cash).replace('$', '');
  $('#r-oil').textContent = mb(s.production);
  $('#r-add').textContent = Math.round(s.addiction * 100) + '%';
  $('#r-gdp').textContent = '$' + num(s.price, 2);
  $('#r-year').textContent = s.year;
  const pb = $('#r-play');
  pb.className = 'r-play' + (G.paused ? '' : ' running');
  pb.innerHTML = G.paused ? '&#9654;' : ['', '&#9654;', '&#9654;&#9654;', '&#9654;&#9654;&#9654;'][G.rate || 1];
  pb.title = G.paused ? 'Run the clock' : 'Faster';

  const d = s.demand || demandOf(s), p = s.production || 0;
  const max = Math.max(d, p, 1) * 1.18;
  const fill = $('#vg-fill');
  fill.style.height = (p / max * 100).toFixed(1) + '%';
  fill.className = 'vg-fill' + (p >= d ? '' : ' short');
  $('#vg-line').style.bottom = (d / max * 100).toFixed(1) + '%';
  $('#vg-note').textContent = mb(p) + ' / ' + mb(d);
  $('#globe-label').textContent = PLACE[UI.place] ? PLACE[UI.place].name.toUpperCase() : 'WORLD';
  $('#globe').classList.toggle('alert', !!(s.campaign || s.agenda.length || s.crisisYears));
  renderArmed();
}

function renderArmed() {
  const box = $('#armed');
  if (!UI.armed) { box.hidden = true; return; }
  const a = ACTIONS[UI.armed];
  box.hidden = false;
  box.innerHTML = a.ic + ' <span>' + esc(a.verb) + '</span> <button id="dis">cancel</button>';
  $('#dis').onclick = () => { UI.armed = null; UI.field.armed = null; renderArmed(); };
}

/* ---------- panels ---------- */
export function closePanel() {
  UI.panel = null;
  $('#panel').classList.remove('open');
  $('#panel-scrim').classList.remove('on');
}
export function openPanel(which) {
  /* reading is not a turn: the clock waits while a panel is open */
  bus.emit('holdClock');
  UI.panel = which;
  $('#panel').classList.add('open');
  $('#panel-scrim').classList.add('on');
  renderPanel(which);
}
function head(title, extra = '') {
  return '<div class="panel-head"><h3>' + esc(title) + '</h3>' + extra + '<button class="x" aria-label="Close">&times;</button></div>';
}

export function renderPanel(which) {
  const s = G.s, box = $('#panel-in'), pane = $('#panel');
  const keep = pane ? pane.scrollTop : 0;
  if (which === 'actions') box.innerHTML = head('Actions') + actionsHTML(s);
  else if (which === 'world') box.innerHTML = head('The world') + worldHTML(s);
  else if (which === 'washington') box.innerHTML = head('Washington') + washingtonHTML(s);
  else if (which === 'stats') box.innerHTML = head('Stats') + statsHTML(s);
  else box.innerHTML = head('Menu') + menuHTML(s);
  box.querySelector('.x').onclick = closePanel;
  wire(which);
  if (pane) pane.scrollTop = keep;
}

function actionsHTML(s) {
  const id = UI.place, ps = s.places[id];
  if (!ps.open) return '<div class="empty">You do not operate here. Open it from the globe.</div>';
  const list = Object.entries(ACTIONS).filter(([k, a]) => !a.locked || s.flags[a.locked]);
  const hasPeople = ps.scene && ps.scene.ground.some(g => g.t === 'town' || g.t === 'village');
  return '<div class="actrow">' + list.filter(([k]) => k !== 'buyout' || hasPeople).map(([k, a]) => {
    const cost = k === 'demolish' ? 0 : costOf(a.cost, id);
    const poor = cost > s.cash;
    return `<button class="actbtn ${UI.armed === k ? 'on' : ''}" data-act="${k}" ${poor ? 'disabled' : ''}>
      <span class="ic">${a.ic}</span>
      <span style="flex:1"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></span>
      <span class="px">${k === 'demolish' ? 'refund' : money(cost)}</span></button>`;
  }).join('') + '</div>' +
    `<p class="muted" style="font-size:12px;margin:10px 2px 0">Pick one, then tap the ground. ${ps.unrest ? '<b class="warnc">There is a blockade here: output is down.</b>' : ''} ${ps.armed ? '<b class="neg">Armed insurgents here: output is down badly.</b>' : ''}</p>`;
}

function worldHTML(s) {
  return '<div class="placegrid">' +
    `<button class="placebtn ${UI.panel === 'washington' ? 'on' : ''}" data-go="washington">
      <b>&#127963; Washington</b><small>Congress, elections, and the room downstairs</small>
      <span class="flag amb">${oiledCount()} oiled &middot; ${greenCount()} green${s.campaign ? ' &middot; election' : ''}</span></button>` +
    PLACES.map(p => {
      const ps = s.places[p.id];
      const flag = ps.open
        ? mb(ps.prod) + ' Mbbl/yr' + (ps.armed ? ' &middot; <span class="neg">insurgents</span>' : ps.unrest ? ' &middot; <span class="warnc">blockade</span>' : '')
        : ps.seized ? '<span class="neg">seized</span>'
          : (p.unlock.act ? 'needs an act of Congress' : p.unlock.op ? 'needs a war' : p.unlock.peak ? 'after the peak' : money(p.unlock.cash));
      return `<button class="placebtn ${UI.place === p.id ? 'on' : ''} ${ps.open ? '' : 'locked'}" data-place="${p.id}">
        <b>${p.ic} ${esc(p.name)}</b><small>${esc(p.sub)}</small><span class="flag">${flag}</span></button>`;
    }).join('') + '</div>';
}

function washingtonHTML(s) {
  const p = s.president, c = s.campaign;
  return `
  <div class="card">
    <h3>${esc(p.name)} <span class="tagn">${esc(p.party)}</span></h3>
    <div class="meter"><i style="width:${p.oiliness}%;background:${isOiled() ? 'var(--amber)' : 'var(--ink3)'}"></i></div>
    <small class="muted">Oiliness ${p.oiliness} of 100. ${isOiled() ? 'The room below the White House is open to you.' : 'Sixty opens the room downstairs.'}</small>
  </div>

  ${c ? `<div class="card">
    <h3>The race <span class="tagn">polls ${Math.round(c.poll * 100)} / ${Math.round((1 - c.poll) * 100)}</span></h3>
    <div class="race">
      <div class="lane e"><i style="width:${clamp(c.poll * 70 + c.donE / 40, 5, 100)}%"></i><span>&#128024; ${esc(c.e.name)}</span><em>${money(c.donE)}</em></div>
      <div class="lane d"><i style="width:${clamp((1 - c.poll) * 70 + c.donD / 40, 5, 100)}%"></i><span>&#128052; ${esc(c.d.name)}</span><em>${money(c.donD)}</em></div>
    </div>
    <div class="row" style="gap:6px;flex-wrap:wrap">${[100, 300, 700].map(a => `<button class="btn sm don" data-side="e" data-amt="${a}" ${s.cash < a ? 'disabled' : ''}>&#128024; +${money(a)}</button>`).join('')}</div>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">${[100, 300, 700].map(a => `<button class="btn sm don" data-side="d" data-amt="${a}" ${s.cash < a ? 'disabled' : ''}>&#128052; +${money(a)}</button>`).join('')}</div>
    <small class="muted">Back the likely winner, hedge the other. What the winner takes from you sets the next administration's oiliness.</small>
  </div>` : `<div class="card"><h3>Next election <span class="tagn">${s.electionIn} years</span></h3></div>`}

  <div class="card">
    <h3>Congress <span class="tagn">${oiledCount()} oiled &middot; ${10 - oiledCount() - greenCount()} gray &middot; ${greenCount()} green</span></h3>
    <div class="seats">${s.congress.map((r, i) => `
      <button class="seat ${r.type}" data-rep="${i}" ${r.type === 'oiled' ? 'disabled' : ''}>
        <span class="who">${r.type === 'oiled' ? '&#128738;' : r.type === 'green' ? '&#127803;' : '&#128100;'} ${esc(r.name)}</span>
        <span class="what">${r.type}</span>
        <span class="px">${r.type === 'oiled' ? 'yours' : money(repPrice() * (r.type === 'green' ? 3 : 1))}</span></button>`).join('')}</div>
    <small class="muted">Six votes carry a bill. Oiled vote your way, green never do, gray flip a coin. An election loosens about a third of what you bought.</small>
  </div>

  <div class="card">
    <h3>On the floor</h3>
    ${s.agenda.length ? s.agenda.map(a => {
    const act = ACT[a.id];
    return `<div class="listitem"><span class="ic">${act.ic}</span><div class="body">
      <b>${esc(act.name)} ${act.pro ? '<span class="pill a">helps you</span>' : '<span class="pill r">hurts you</span>'}</b>
      <small>${esc(act.blurb)}</small>
      <small class="muted">Votes next year. You hold ${act.pro ? oiledCount() : 10 - greenCount()} of the six you need.</small>
      </div></div>`;
  }).join('') : '<div class="empty">Nothing in committee.</div>'}
    <button class="btn sm" id="btn-bill" style="margin-top:8px">Have a bill written</button>
  </div>

  <div class="card" style="${isOiled() ? 'border-color:#6b4a15' : ''}">
    <h3>&#128274; The room below the White House</h3>
    ${isOiled() ? OPS.map(o => {
    const err = opReady(o.id);
    return `<div class="listitem"><span class="ic">${o.ic}</span><div class="body"><b>${esc(o.name)}</b>
      <small>${esc(o.desc)}</small>${err && err !== 'Already done' ? '<small class="neg">' + esc(err) + '</small>' : ''}</div>
      ${err === 'Already done' ? '<span class="pill a">done</span>' : `<button class="btn sm op" data-op="${o.id}" ${err ? 'disabled' : ''}>${money(o.cost)}</button>`}</div>`;
  }).join('') : '<p class="muted" style="font-size:12.5px;margin:0">Fund a winning candidate heavily enough and the next president will take your calls. Wars, coups and quietly removed obstacles are arranged here, and Al-Dhahir opens no other way.</p>'}
  </div>`;
}

function statsHTML(s) {
  const peakPct = clamp(s.world.extracted / Math.max(1, s.world.total), 0, 1);
  return `
  <div class="card">
    <h3>The year <span class="tagn">${s.year}</span></h3>
    <div class="kv"><span>Demand</span><b>${mb(s.demand)} Mbbl</b></div>
    <div class="kv"><span>You pumped</span><b class="${s.production >= s.demand ? 'pos' : 'neg'}">${mb(s.production)} Mbbl</b></div>
    <div class="kv"><span>Crude</span><b>$${num(s.price, 2)}</b></div>
    <div class="kv"><span>Net last year</span><b class="${s.stats.lastNet >= 0 ? 'pos' : 'neg'}">${money(s.stats.lastNet || 0, true)}</b></div>
    <div class="kv"><span>Tax rate</span><b>${pct(s.tax)}</b></div>
    <div class="kv"><span>Shortfall years</span><b class="${s.crisisYears ? 'neg' : ''}">${s.crisisYears} of ${diff().patience}</b></div>
  </div>
  <div class="card">
    <h3>The country</h3>
    <div class="kv"><span>Oil addiction</span><b>${Math.round(s.addiction * 100)}%</b></div>
    <div class="kv"><span>Economy</span><b>${s.gdp.toFixed(2)}&times;</b></div>
    <div class="kv"><span>Green feeling</span><b>${Math.round(s.green)} of 100</b></div>
    <div class="kv"><span>Warming</span><b class="${s.temp > 2 ? 'neg' : ''}">+${s.temp.toFixed(2)}C</b></div>
  </div>
  <div class="card">
    <h3>The world's oil <span class="tagn">${s.world.peaked ? '<span class="neg">past peak</span>' : Math.round(peakPct * 100) + '% burned'}</span></h3>
    <div class="meter"><i style="width:${(peakPct * 100).toFixed(1)}%;background:${peakPct > 0.5 ? 'var(--bad)' : 'var(--amber)'}"></i></div>
    <div class="kv"><span>You have pumped</span><b>${num(s.stats.pumped, 0)} Mbbl</b></div>
    <div class="kv"><span>Dry holes</span><b>${s.stats.dry}</b></div>
    <div class="kv"><span>Wars</span><b>${s.stats.wars}</b></div>
  </div>
  <div class="card">
    <h3>Dispatches</h3>
    ${s.log.length ? s.log.slice(0, 40).map(l => `<div class="logline ${l.kind}"><span class="when">${l.y}</span><span class="what">${esc(l.what)}</span></div>`).join('') : '<div class="empty">Nothing yet.</div>'}
  </div>`;
}

function menuHTML(s) {
  const got = Object.keys(s.achs).length;
  return `
  <div class="card">
    <h3>${esc(s.company)}</h3>
    <div class="row" style="flex-wrap:wrap;gap:8px">
      <button class="btn sm" id="m-help">How to play</button>
      <button class="btn sm" id="m-save">Save</button>
      <button class="btn sm" id="m-sound">Sound: ${G.cfg.sound ? 'on' : 'off'}</button>
      <button class="btn sm danger" id="m-quit">Abandon run</button>
    </div>
  </div>
  <div class="card">
    <h3>Achievements <span class="tagn">${got} of ${ACHS.length}</span></h3>
    ${ACHS.map(a => `<div class="ach ${s.achs[a.id] ? 'got' : ''}"><span class="ic">${s.achs[a.id] ? a.ic : '?'}</span>
      <div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div></div>`).join('')}
  </div>
  <p class="muted" style="font-size:11.5px">v${VERSION} &middot; a tribute to Oiligarchy by Molleindustria</p>`;
}

/* ---------- wiring ---------- */
function wire(which) {
  const s = G.s;
  $$('[data-act]').forEach(b => b.onclick = () => {
    const k = b.dataset.act;
    UI.armed = UI.armed === k ? null : k;
    UI.field.armed = UI.armed;
    renderPanel('actions'); renderArmed();
    if (UI.armed) { closePanel(); ticker('Tap the ground: <b>' + esc(ACTIONS[k].verb) + '</b>'); }
  });
  $$('[data-place]').forEach(b => b.onclick = () => {
    const id = b.dataset.place, ps = s.places[id];
    if (!ps.open) { offerPlace(id); return; }
    travel(id); closePanel();
  });
  $$('[data-go]').forEach(b => b.onclick = () => openPanel(b.dataset.go));
  $$('[data-rep]').forEach(b => b.onclick = () => {
    const r = buyRep(+b.dataset.rep);
    if (r.err) toast(r.err, 'bad'); else toast('Seat secured for ' + money(r.cost), 'good');
    renderPanel('washington'); renderHUD();
  });
  $$('.don').forEach(b => b.onclick = () => {
    const r = donate(b.dataset.side, +b.dataset.amt);
    if (r.err) toast(r.err, 'bad');
    renderPanel('washington'); renderHUD();
  });
  $$('.op').forEach(b => b.onclick = () => {
    const op = OPS.find(o => o.id === b.dataset.op);
    if (op.anywhere) {
      const where = PLACES.filter(p => s.places[p.id].open && (s.places[p.id].unrest || s.places[p.id].armed));
      if (!where.length) { toast('No trouble to deal with', 'bad'); return; }
      showModal({
        eyebrow: 'Operation', title: op.name, text: op.desc,
        choices: where.map(p => ({
          label: p.name, sub: p.sub, cost: op.cost,
          run: () => { const r = runOp(op.id, p.id); if (r.err) toast(r.err, 'bad'); else toast('It is done', 'gold'); }
        })).concat([{ label: 'Cancel', run: () => { } }])
      });
      return;
    }
    const r = runOp(op.id, op.where);
    if (r.err) toast(r.err, 'bad'); else toast('It is done: ' + op.name, 'gold');
    renderPanel('washington'); renderHUD();
  });
  const bill = $('#btn-bill');
  if (bill) bill.onclick = () => {
    const pool = ACTS.filter(a => a.pro && !s.agenda.some(x => x.id === a.id) && (a.repeat || !s.history.includes(a.id)) && (!a.cond || a.cond(s)));
    if (!pool.length) { toast('Nothing left to write', 'bad'); return; }
    showModal({
      eyebrow: 'Draft legislation', title: 'What would you like written?',
      text: 'Your counsel drafts it and a friendly member introduces it. The vote is next year, which gives you a year to arrange the votes.',
      choices: pool.slice(0, 7).map(a => ({
        label: a.ic + ' ' + a.name, sub: a.blurb,
        run: () => { const r = tableAct(a.id); if (r.err) toast(r.err, 'bad'); else toast('Introduced', 'good'); }
      })).concat([{ label: 'Nothing for now', run: () => { } }])
    });
  };
  const h = $('#m-help'); if (h) h.onclick = () => showModal({ html: HELP.how });
  const sv = $('#m-save'); if (sv) sv.onclick = () => toast(save() ? 'Saved' : 'Could not save', 'good');
  const sd = $('#m-sound'); if (sd) sd.onclick = () => { G.cfg.sound = !G.cfg.sound; bus.emit('cfg'); renderPanel('menu'); };
  const q = $('#m-quit'); if (q) q.onclick = () => showModal({
    eyebrow: 'Careful', title: 'Abandon this run?',
    text: 'The save goes, and you start again in 1946.',
    choices: [{ label: 'Abandon it', run: () => bus.emit('abandon') }, { label: 'Keep playing', run: () => { } }]
  });
}

export function offerPlace(id) {
  const s = G.s, p = PLACE[id], ps = s.places[id], u = p.unlock || {};
  const bits = [];
  if (u.cash) bits.push(money(u.cash) + ' to enter');
  if (u.act) bits.push('an act of Congress' + (ps.actOk ? ' (passed)' : ' (not yet)'));
  if (u.op) bits.push('a war' + (s.ops[u.op] ? ' (won)' : ' (not yet)'));
  if (u.peak) bits.push('the peak' + (s.world.peaked ? ' (behind us)' : ' (not yet)'));
  showModal({
    eyebrow: p.sub, title: p.name,
    html: '<p>' + esc(p.blurb) + '</p>' +
      bits.map(b => '<div class="kv"><span class="muted">' + esc(b) + '</span></div>').join('') +
      '<div class="kv"><span>Royalty</span><b>' + pct(p.royalty) + '</b></div>' +
      (ps.seized ? '<p class="neg">These assets were taken from you. Going back means paying again.</p>' : ''),
    choices: [
      {
        label: 'Open operations', sub: bits.join(' · '), run: () => {
          const r = openPlace(id);
          if (r.err) toast(r.err, 'bad');
          else { toast('Operations opened in ' + p.name, 'gold'); travel(id); }
        }
      },
      { label: 'Not yet', run: () => { } }
    ]
  });
}

export function travel(id) {
  UI.place = id;
  const s = G.s;
  if (!s.places[id].scene) genScene(id);
  UI.field.setPlace(id);
  UI.armed = null; UI.field.armed = null;
  renderHUD();
  ticker('<b>' + esc(PLACE[id].name) + '</b> &middot; ' + esc(PLACE[id].sub));
}

/* ---------- what happens when you tap the ground ---------- */
export function groundTap(col) {
  const s = G.s, id = UI.place, ps = s.places[id];
  if (!ps.open) { ticker('You do not operate here yet.'); return; }
  const sc = ps.scene;
  if (!UI.armed) {
    const rig = sc.rigs[col], g = sc.ground[col];
    if (rig && rig.k === 'rival') {
      ticker('&#128681; <b>' + esc(s.rival ? s.rival.name : 'A rival') + '</b> &middot; their pump, on oil you left alone');
    } else if (rig) {
      const pool = rig.pool != null ? sc.pools[rig.pool] : null;
      ticker(ACTIONS[rig.k].ic + ' <b>' + esc(ACTIONS[rig.k].name) + '</b> &middot; ' +
        (ACTIONS[rig.k].rate ? (pool ? mb(rig.last || 0) + ' Mbbl last year, ' + mb(pool.oil) + ' left in the pool' : 'a dry hole') : 'standing guard'));
    } else if (!sc.seen[col]) ticker('Unsurveyed ground. Send an exploration crew.');
    else {
      const pool = poolUnder(sc, col);
      ticker(pool ? 'A pool below: <b>' + mb(pool.oil) + ' Mbbl</b>' : 'Surveyed. Nothing under this stretch.');
    }
    return;
  }
  const r = act(id, col, UI.armed);
  if (r.err) { toast(r.err, 'bad'); return; }
  ticker(esc(r.msg || 'Done'));
  if (r.dry) toast('Dry hole', 'bad'); else if (UI.armed !== 'explore') toast(ACTIONS[UI.armed].name + ' built', 'good');
  if (UI.armed === 'demolish' || UI.armed === 'burner') { UI.armed = null; UI.field.armed = null; }
  renderHUD();
}
