/* ============================================================
   Capitalism - boot, the yearly clock, wiring
   ============================================================ */
import { VERSION, DIFFICULTY, HELP, TECH, ACHS, REGION, STRUCT } from './data.js';
import { G, bus, newGame, load, save, peekSave, wipeSave, saveCfg, logMsg, demandOf, isOiled } from './state.js';
import * as SIM from './sim.js';
const { turn, ENDINGS } = SIM;
import { MapView, genRegion, revealArea, tileAtXY } from './map.js';
import {
  UI, refreshAll, renderHUD, renderView, setView, showModal, toast, openTile, closeSheet,
  renderRegionBar, renderRegionStats, modalBusy, flushModals
} from './ui.js';
import { $, $$, el, money, num, clamp } from './util.js';

const SPEED_MS = { 1: 5200, 2: 2600, 3: 1200 };
G.paused = true;

/* ---------------- audio ---------------- */
let actx = null;
function beep(freq = 440, dur = 0.07, type = 'square', vol = 0.04) {
  if (!G.cfg.sound) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(actx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur + 0.02);
  } catch { }
}
const SFX = {
  tap: () => beep(520, 0.05, 'triangle', 0.03),
  build: () => { beep(330, 0.06, 'square', 0.04); setTimeout(() => beep(495, 0.08, 'square', 0.035), 60); },
  cash: () => { beep(740, 0.05, 'triangle', 0.035); setTimeout(() => beep(990, 0.07, 'triangle', 0.03), 55); },
  bad: () => beep(170, 0.2, 'sawtooth', 0.035),
  news: () => { beep(620, 0.08, 'sine', 0.04); setTimeout(() => beep(830, 0.12, 'sine', 0.035), 90); },
  year: () => beep(300, 0.04, 'triangle', 0.02)
};

/* ---------------- title ---------------- */
function renderTitle() {
  $('#v-num').textContent = VERSION;
  const menu = $('#title-menu');
  menu.innerHTML = '';
  const sv = peekSave();
  if (sv) {
    const b = el('button', 'btn primary', 'Continue · ' + sv.year + ' · ' + money(sv.cash));
    b.onclick = () => { if (load()) startGame(true); else toast('Save is unreadable', 'bad'); };
    menu.appendChild(b);
  }
  const nb = el('button', 'btn' + (sv ? '' : ' primary'), sv ? 'New run' : 'Begin · 1946');
  nb.onclick = newRunDialog;
  menu.appendChild(nb);
  $$('#title-screen [data-help]').forEach(b => b.onclick = () => showModal({ html: HELP[b.dataset.help] }));
}

function newRunDialog() {
  let chosen = 'exec';
  const paintDiffs = () => {
    const box = $('#diffs'); if (!box) return;
    box.innerHTML = '';
    Object.values(DIFFICULTY).forEach(d => {
      const b = el('button', 'diffopt' + (d.id === chosen ? ' on' : ''));
      b.innerHTML = '<span><b>' + d.name + '</b><small>' + d.blurb + '</small>' +
        '<small class="muted">Start ' + money(d.cash) + ' \u00B7 ' + d.patience + ' shortfall years allowed</small></span>';
      b.onclick = () => { chosen = d.id; $$('#diffs .diffopt').forEach(x => x.classList.remove('on')); b.classList.add('on'); };
      box.appendChild(b);
    });
  };
  showModal({
    eyebrow: 'New run', title: 'Take the chair',
    html: '<p>It is 1946. You inherit a small company with one derrick in Texas, and a country that is about to want more oil every single year.</p>' +
      '<input type="text" id="coname" maxlength="28" placeholder="Company name" value="Consolidated Petroleum">' +
      '<div class="sectitle">Difficulty</div><div class="choices" id="diffs"></div>',
    after: paintDiffs,
    buttons: [
      { label: 'Cancel', cls: 'ghost', run: () => { } },
      {
        label: 'Begin', cls: 'primary', run: () => {
          const name = ($('#coname') && $('#coname').value.trim()) || 'Consolidated Petroleum';
          wipeSave();
          newGame(chosen, name);
          startGame(false);
        }
      }
    ]
  });
}

/* ---------------- start ---------------- */
function seedTexas() {
  const s = G.s, rs = s.regions.texas;
  if (!rs.tiles) genRegion('texas');
  /* find a decent field and put the family derrick on it */
  const best = [...rs.tiles]
    .filter(t => t.oil > 0 && STRUCT.derrick.on.includes(t.T))
    .sort((a, b) => b.oil - a.oil)[0];
  if (best) {
    revealArea('texas', best.x, best.y, 1);
    best.st = { k: 'derrick', at: s.year, last: STRUCT.derrick.rate };
    rs.prod = STRUCT.derrick.rate;
    rs.wells = 1;
    s.production = STRUCT.derrick.rate;
    s.stats.wells = 1;
    s.flags.firstOil = 1;
  }
  s.demand = demandOf(s);
}

function startGame(resumed) {
  $('#title-screen').classList.add('gone');
  $('#app').hidden = false;
  if (!UI.map) {
    UI.map = new MapView($('#map'), $('#map-wrap'));
    UI.map.onPick = (t) => { SFX.tap(); openTile(t); };
  }
  if (!resumed) seedTexas();
  const first = Object.keys(G.s.regions).find(id => G.s.regions[id].unlocked) || 'texas';
  if (!G.s.regions[first].tiles) genRegion(first);
  if (!G.s.demand) G.s.demand = demandOf(G.s);
  UI.map.setRegion(first);
  setView('field');
  refreshAll();
  G.paused = false;
  acc = 0; last = performance.now();
  if (!resumed) {
    showModal({
      eyebrow: '1946', title: 'One derrick, one country',
      text: 'The red line on the gauge is what the country wants this year. The bar is what you can pump. Your grandfather\'s derrick covers it, barely. Demand grows about three per cent a year forever, so find the next field before you need it: tap an unexplored tile, send an exploration crew, and drill whatever it finds.',
      buttons: [{ label: 'Get to work', cls: 'primary', run: () => { } }]
    });
  }
}

/* ---------------- the clock ---------------- */
let acc = 0, last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(400, now - last); last = now;
  if (UI.map && UI.view === 'field') UI.map.draw(now);
  if (G.paused || modalBusy() || !G.s || G.s.over) return;
  acc += dt;
  const step = SPEED_MS[G.cfg.speed] || 5200;
  if (acc >= step) { acc = 0; SFX.year(); turn(); }
}

function nextYear() {
  if (!G.s || G.s.over || modalBusy()) return;
  acc = 0; SFX.year(); turn();
}

/* ---------------- wiring ---------------- */
function wire() {
  $$('.tab').forEach(b => b.onclick = () => { SFX.tap(); setView(b.dataset.view); });
  $('#btn-pause').onclick = () => { G.paused = !G.paused; renderHUD(); };
  $('#btn-next').onclick = nextYear;
  $$('.spd').forEach(b => b.onclick = () => { G.cfg.speed = +b.dataset.speed; G.paused = false; saveCfg(); renderHUD(); });
  $('#btn-zoom-in').onclick = () => UI.map.zoom(1.2);
  $('#btn-zoom-out').onclick = () => UI.map.zoom(0.82);
  $('#btn-center').onclick = () => UI.map.center();

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); G.paused = !G.paused; renderHUD(); }
    if (e.code === 'Enter' || e.key === 'n') nextYear();
    if (['1', '2', '3'].includes(e.key)) { G.cfg.speed = +e.key; G.paused = false; saveCfg(); renderHUD(); }
    if (e.key === 'Escape') closeSheet();
  });

  bus.on('turn', (s) => {
    renderHUD();
    if (UI.view !== 'field') {
      const sc = $('#view-' + UI.view + ' .scroll');
      const top = sc ? sc.scrollTop : 0;
      renderView();
      const sc2 = $('#view-' + UI.view + ' .scroll');
      if (sc2) sc2.scrollTop = top;
    } else { renderRegionStats(); renderRegionBar(); }
    if (s.turn % 3 === 0) save();
  });
  bus.on('refresh', () => refreshAll());
  bus.on('cfg', () => saveCfg());

  bus.on('event', (card) => {
    SFX.news();
    showModal({
      eyebrow: card.eyebrow, title: card.title, text: card.text, sticky: true,
      choices: card.choices.map(c => ({ label: c.label, sub: c.sub, cost: c.cost, req: c.req, run: c.run }))
    });
  });
  bus.on('bigNews', (n) => { SFX.news(); showModal({ eyebrow: n.eyebrow, title: n.title, text: n.text, sticky: true }); });
  bus.on('crisis', ({ step, act }) => {
    SFX.bad();
    const s = G.s;
    const texts = {
      1: 'You could not meet demand, and Congress has reached for the obvious lever: ' + (act ? act.name + '. The vote is next year, so there is still time to arrange it.' : 'new regulation.'),
      2: 'You could not meet demand. The administration is taking the blame, its approval is falling, and organisers are at your gates.',
      3: 'You could not meet demand and there is nothing left to legislate. The price is doing the rationing now, and the price is what ends worlds.'
    };
    showModal({
      eyebrow: 'Supply crisis, year ' + s.crisisYears, title: 'Below The Line',
      text: texts[step] || texts[2], sticky: true
    });
  });
  bus.on('ach', (id) => {
    const a = ACHS.find(x => x.id === id); if (!a) return;
    SFX.cash();
    toast(a.ic + ' <b>' + a.name + '</b> &middot; ' + a.desc, 'gold');
  });
  bus.on('techDone', (id) => {
    SFX.cash();
    const t = TECH[id];
    showModal({ eyebrow: 'Research complete', title: t.name, text: t.desc });
  });
  bus.on('vote', ({ act, passed, yes }) => {
    (passed === !!act.pro) ? SFX.cash() : SFX.bad();
    toast((passed ? 'PASSED ' : 'DEFEATED ') + yes + '-' + (10 - yes) + ': ' + act.name, (passed === !!act.pro) ? 'good' : 'bad');
  });
  bus.on('campaign', () => {
    SFX.news();
    const c = G.s.campaign;
    showModal({
      eyebrow: 'Campaign season', title: 'Two runners, one chair',
      text: c.elephant.name + ' of the Elephant party against ' + c.donkey.name + ' of the Donkey party. The polls open in two years and donations are legal in every way that matters. Back the likely winner, hedge the other one, and remember that what you give the winner decides how oily the next administration will be.',
      buttons: [{ label: 'Go to Washington', cls: 'primary', run: () => setView('capitol') }, { label: 'Later', run: () => { } }]
    });
  });
  bus.on('election', ({ president, oiled }) => {
    SFX.news();
    showModal({
      eyebrow: 'Election night', title: president.name + ' wins',
      text: (oiled
        ? 'Your money did that. Oiliness ' + president.oiliness + ' of 100: the administration takes your calls, pro-oil acts will keep arriving, and the room below the White House is open to you.'
        : 'Oiliness ' + president.oiliness + ' of 100. Not enough. No covert operations under this administration, and friendly legislation will be rare.')
    });
  });
  bus.on('opRun', (op) => { SFX.news(); });
  bus.on('milestone', (k) => {
    const s = G.s;
    const cfgs = {
      trillion: ['One trillion dollars', 'You control a trillion dollars. You could retire into the history books today, or keep going and find out how the century ends.', 'Retire as the richest person alive'],
      green: ['The pivot is possible', 'Your clean portfolio can carry the company. You could sell the upstream business at the top and be remembered as the executive who turned.', 'Take the pivot'],
      space: ['Hydrocarbon from Titan', 'A skimmer on another world is filling tanks with methane. Nothing about this is necessary and everything about it is possible.', 'Declare the age of interplanetary oil']
    };
    const [title, text, label] = cfgs[k];
    showModal({
      eyebrow: 'Milestone', title, text, sticky: true,
      choices: [
        { label, sub: 'Ends the run', run: () => { s.over = { k, year: s.year }; bus.emit('gameOver', s.over); } },
        { label: 'Not finished yet', run: () => { } }
      ]
    });
  });
  bus.on('gameOver', (over) => {
    const s = G.s;
    const e = ENDINGS[over.k] || ENDINGS.fired;
    SFX.news();
    wipeSave();
    flushModals();
    const score = Math.round(s.cash + s.stats.revenue * 0.08 + s.green_cap * 3 + s.stats.metYears * 40 - s.temp * 900);
    showModal({
      eyebrow: e.e, title: e.t, sticky: true,
      html: '<p>' + e.x + '</p>' +
        '<div class="kv"><span>Years in the chair</span><b>' + (s.year - 1946) + '</b></div>' +
        '<div class="kv"><span>Final cash</span><b>' + money(s.cash) + '</b></div>' +
        '<div class="kv"><span>Lifetime revenue</span><b>' + money(s.stats.revenue) + '</b></div>' +
        '<div class="kv"><span>Oil pumped</span><b>' + num(s.stats.totalPumped, 0) + ' Mbbl</b></div>' +
        '<div class="kv"><span>Years you kept the country supplied</span><b>' + s.stats.metYears + '</b></div>' +
        '<div class="kv"><span>Final crude price</span><b>$' + num(s.price, 2) + '</b></div>' +
        '<div class="kv"><span>Carbon in the air</span><b>' + num(s.emissions, 0) + ' Gt, +' + s.temp.toFixed(2) + 'C</b></div>' +
        '<div class="kv"><span>Achievements</span><b>' + Object.keys(s.achs).length + ' of ' + ACHS.length + '</b></div>' +
        '<div class="kv"><span>Legacy score</span><b class="amb">' + score.toLocaleString() + '</b></div>',
      buttons: [{ label: 'New run', cls: 'primary', run: () => backToTitle() }]
    });
  });
  bus.on('abandon', () => { wipeSave(); backToTitle(); });

  addEventListener('visibilitychange', () => { if (document.hidden) { save(); G.paused = true; renderHUD(); } });
  addEventListener('pagehide', () => save());
}

function backToTitle() {
  flushModals();
  G.s = null; G.paused = true;
  $('#app').hidden = true;
  $('#title-screen').classList.remove('gone');
  renderTitle();
}

wire();
renderTitle();
requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}
window.__CAP = { G, bus, turn, SIM, UI, refreshAll, nextYear };
