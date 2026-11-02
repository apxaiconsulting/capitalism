/* ============================================================
   Capitalism - boot and the yearly clock
   ============================================================ */
import { VERSION, DIFFICULTY, HELP, ACHS, PLACE, ACTIONS } from './data.js';
import { G, bus, newGame, load, save, peekSave, wipeSave, saveCfg, demandOf, isOiled } from './state.js';
import * as SIM from './sim.js';
const { turn, ENDINGS } = SIM;
import { Field, genScene, revealSpan, poolUnder } from './field.js';
import {
  UI, renderHUD, yearTick, openPanel, closePanel, renderPanel, showModal, toast, ticker,
  modalBusy, flushModals, groundTap, travel, offerPlace
} from './ui.js';
import { $, $$, el, money, num, clamp } from './util.js';

const SPEEDS = [0, 2600, 1300, 650];   /* paused, 1x, 2x, 4x */
G.paused = true;
G.rate = 1;

/* ---------- sound ---------- */
let actx = null;
function beep(f = 440, d = 0.07, type = 'square', v = 0.04) {
  if (!G.cfg.sound) return;
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = v;
    o.connect(g); g.connect(actx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
    o.stop(actx.currentTime + d + 0.02);
  } catch { }
}
const SFX = {
  tap: () => beep(520, 0.05, 'triangle', 0.03),
  cash: () => { beep(740, 0.05, 'triangle', 0.035); setTimeout(() => beep(990, 0.07, 'triangle', 0.03), 55); },
  bad: () => beep(170, 0.2, 'sawtooth', 0.035),
  news: () => { beep(620, 0.08, 'sine', 0.04); setTimeout(() => beep(830, 0.12, 'sine', 0.035), 90); },
  year: () => beep(300, 0.04, 'triangle', 0.02)
};

/* ---------- title ---------- */
function renderTitle() {
  $('#v-num').textContent = VERSION;
  const menu = $('#title-menu');
  menu.innerHTML = '';
  const sv = peekSave();
  if (sv) {
    const b = el('button', 'btn primary', 'Continue · ' + sv.year + ' · ' + money(sv.cash));
    b.onclick = () => { if (load()) start(true); else toast('Save is unreadable', 'bad'); };
    menu.appendChild(b);
  }
  const nb = el('button', 'btn' + (sv ? '' : ' primary'), sv ? 'New run' : 'Begin · 1946');
  nb.onclick = newRun;
  menu.appendChild(nb);
  $$('#title-screen [data-help]').forEach(b => b.onclick = () => showModal({ html: HELP[b.dataset.help] }));
}

function newRun() {
  let chosen = 'exec';
  const paint = () => {
    const box = $('#diffs'); if (!box) return;
    box.innerHTML = '';
    Object.values(DIFFICULTY).forEach(d => {
      const b = el('button', 'diffopt' + (d.id === chosen ? ' on' : ''));
      b.innerHTML = '<span><b>' + d.name + '</b><small>' + d.blurb + '</small>' +
        '<small class="muted">Start ' + money(d.cash) + '</small></span>';
      b.onclick = () => { chosen = d.id; $$('#diffs .diffopt').forEach(x => x.classList.remove('on')); b.classList.add('on'); };
      box.appendChild(b);
    });
  };
  showModal({
    eyebrow: 'New run', title: 'Take the chair',
    html: '<p>It is 1946. One pump in Texas, a country about to want more oil every year, and a board that measures exactly one thing.</p>' +
      '<input type="text" id="coname" maxlength="28" value="Consolidated Petroleum">' +
      '<div class="sectitle">Difficulty</div><div class="choices" id="diffs"></div>',
    after: paint,
    buttons: [
      { label: 'Cancel', cls: 'ghost', run: () => { } },
      {
        label: 'Begin', cls: 'primary', run: () => {
          const n = ($('#coname') && $('#coname').value.trim()) || 'Consolidated Petroleum';
          wipeSave(); newGame(chosen, n); start(false);
        }
      }
    ]
  });
}

function seed() {
  const s = G.s, ps = s.places.texas;
  const sc = ps.scene || genScene('texas');
  const pool = sc.pools.slice().sort((a, b) => b.oil - a.oil)[0];
  if (pool) {
    const col = clamp(Math.round(pool.x - 0.5), 1, sc.cols - 2);
    if (sc.ground[col].t === 'sea') sc.ground[col].t = 'land';
    revealSpan(sc, col, 2);
    sc.rigs[col] = { k: 'derrick', pool: sc.pools.indexOf(pool), last: ACTIONS.derrick.rate, at: s.year };
    ps.prod = ACTIONS.derrick.rate;
    s.production = ACTIONS.derrick.rate;
    s.stats.rigs = 1;
    s.flags.oil = 1;
  }
  s.demand = demandOf(s);
}

function start(resumed) {
  $('#title-screen').classList.add('gone');
  $('#app').hidden = false;
  if (!UI.field) {
    UI.field = new Field($('#scene'), $('#stage'));
    UI.field.onAct = (col) => { SFX.tap(); groundTap(col); };
  }
  if (!resumed) seed();
  if (!G.s.demand) G.s.demand = demandOf(G.s);
  const first = Object.keys(G.s.places).find(id => G.s.places[id].open) || 'texas';
  travel(first);
  renderHUD();
  setRate(true, 1);
  if (!resumed) {
    showModal({
      eyebrow: '1946', title: 'One pump, one country',
      text: 'The red line on the right is what the country wants this year. The bar underneath it is what you pump. Your grandfather’s pump covers it, barely, and demand grows about three per cent a year forever. Open ACTIONS, send an exploration crew, and find the next pool before you need it. The globe takes you to Washington, where the laws are for sale.',
      buttons: [{ label: 'Get to work', cls: 'primary', run: () => { } }]
    });
  }
}

/* ---------- clock ----------
   On a timer, not on animation frames: a throttled tab must not stall the year. */
let clockT = null;
function schedule() {
  clearTimeout(clockT);
  if (G.paused || !G.s || G.s.over) return;
  clockT = setTimeout(step, SPEEDS[G.rate] || 2600);
}
function step() {
  if (modalBusy()) { clockT = setTimeout(step, 250); return; }
  SFX.year(); turn(); schedule();
}
export function setRate(paused, rate) {
  G.paused = paused;
  if (rate != null) G.rate = rate;
  renderHUD();
  schedule();
}
function frame(now) {
  requestAnimationFrame(frame);
  if (UI.field) UI.field.draw(now);
}
function nextYear() {
  if (!G.s || G.s.over || modalBusy()) return;
  SFX.year(); turn(); schedule();
}

/* ---------- wiring ---------- */
function wire() {
  $$('[data-panel]').forEach(b => b.onclick = () => {
    SFX.tap();
    if (UI.panel === b.dataset.panel) closePanel(); else openPanel(b.dataset.panel);
  });
  $('#globe').onclick = () => { SFX.tap(); openPanel('world'); };
  $('#panel-scrim').onclick = closePanel;
  /* one button, the way the original does it: play, faster, fastest, stop */
  $('#r-play').onclick = () => {
    if (G.paused) setRate(false, 1);
    else if (G.rate < 3) setRate(false, G.rate + 1);
    else setRate(true, 1);
  };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); setRate(!G.paused, G.rate); }
    if (e.key === 'Enter' || e.key === 'n') nextYear();
    if (e.key === 'Escape') { closePanel(); UI.armed = null; if (UI.field) UI.field.armed = null; renderHUD(); }
    if (e.key === 'a') openPanel('actions');
    if (e.key === 'w') openPanel('world');
  });

  bus.on('turn', (s) => { renderHUD(); yearTick(s); if (UI.panel) renderPanel(UI.panel); if (s.turn % 3 === 0) save(); });
  bus.on('refresh', () => { renderHUD(); if (UI.panel) renderPanel(UI.panel); });
  bus.on('cfg', () => saveCfg());
  bus.on('event', (card) => {
    SFX.news();
    showModal({ eyebrow: card.eyebrow, title: card.title, text: card.text, sticky: true, choices: card.choices });
  });
  bus.on('bigNews', (n) => { SFX.news(); showModal({ eyebrow: n.eyebrow, title: n.title, text: n.text, sticky: true }); });
  bus.on('crisis', ({ step, act }) => {
    SFX.bad();
    const s = G.s;
    const txt = {
      1: 'You could not meet demand, and Congress reached for the obvious lever: ' + (act ? act.name + '. It votes next year, so there is still time to arrange the votes.' : 'new regulation.'),
      2: 'You could not meet demand. The administration is taking the blame, its approval is falling, and there are organisers at your gates.',
      3: 'You could not meet demand and there is nothing left to legislate. The price is doing the rationing now, and the price is what ends worlds.'
    }[step];
    showModal({ eyebrow: 'Shortfall, year ' + s.crisisYears, title: 'Below The Line', text: txt, sticky: true });
  });
  bus.on('ach', (id) => {
    const a = ACHS.find(x => x.id === id); if (!a) return;
    SFX.cash(); toast(a.ic + ' <b>' + a.name + '</b> &middot; ' + a.desc, 'gold');
  });
  bus.on('vote', ({ act, passed, yes }) => {
    (passed === !!act.pro) ? SFX.cash() : SFX.bad();
    toast((passed ? 'PASSED ' : 'DEFEATED ') + yes + '-' + (10 - yes) + ': ' + act.name, (passed === !!act.pro) ? 'good' : 'bad');
  });
  bus.on('holdClock', () => { if (!G.paused) setRate(true, G.rate); });
  bus.on('campaign', () => {
    SFX.news();
    setRate(true, G.rate);
    const c = G.s.campaign;
    showModal({
      eyebrow: 'Campaign season', title: 'Two runners, one chair',
      text: c.e.name + ' against ' + c.d.name + '. The polls open in three years and donations are legal in every way that matters. Back the likely winner, hedge the other, and remember that what you give the winner decides how oily the next administration will be.',
      buttons: [{ label: 'Go to Washington', cls: 'primary', run: () => openPanel('washington') }, { label: 'Later', run: () => { } }]
    });
  });
  bus.on('election', ({ president, oiled }) => {
    SFX.news();
    showModal({
      eyebrow: 'Election night', title: president.name + ' wins',
      text: oiled
        ? 'Your money did that. Oiliness ' + president.oiliness + ': friendly laws will keep arriving, and the room below the White House is open to you.'
        : 'Oiliness ' + president.oiliness + '. Not enough. No operations under this administration, and friendly legislation will be rare.'
    });
  });
  bus.on('milestone', (k) => {
    const s = G.s;
    const c = {
      titan: ['Hydrocarbon from Titan', 'A skimmer on another world is filling tanks with methane. Nothing about this is necessary and everything about it is possible.', 'Declare the age of interplanetary oil'],
      trillion: ['One trillion dollars', 'You control a trillion dollars. You could retire into the history books today, or keep going and see how the century ends.', 'Retire as the richest person alive']
    }[k];
    showModal({
      eyebrow: 'Milestone', title: c[0], text: c[1], sticky: true,
      choices: [
        { label: c[2], sub: 'Ends the run', run: () => { s.over = { k, year: s.year }; bus.emit('gameOver', s.over); } },
        { label: 'Not finished yet', run: () => { } }
      ]
    });
  });
  bus.on('gameOver', (over) => {
    const s = G.s, e = ENDINGS[over.k] || ENDINGS.fired;
    SFX.news(); wipeSave(); flushModals();
    const score = Math.round(s.cash + s.stats.revenue * 0.08 + s.stats.metYears * 60 - s.temp * 900);
    showModal({
      eyebrow: e.e, title: e.t, sticky: true,
      html: '<p>' + e.x + '</p>' +
        '<div class="kv"><span>Years in the chair</span><b>' + (s.year - 1946) + '</b></div>' +
        '<div class="kv"><span>Final cash</span><b>' + money(s.cash) + '</b></div>' +
        '<div class="kv"><span>Oil pumped</span><b>' + num(s.stats.pumped, 0) + ' Mbbl</b></div>' +
        '<div class="kv"><span>Years you kept the country supplied</span><b>' + s.stats.metYears + '</b></div>' +
        '<div class="kv"><span>Crude at the end</span><b>$' + num(s.price, 2) + '</b></div>' +
        '<div class="kv"><span>Carbon</span><b>' + num(s.emissions, 0) + ' Gt, +' + s.temp.toFixed(2) + 'C</b></div>' +
        '<div class="kv"><span>Achievements</span><b>' + Object.keys(s.achs).length + ' of ' + ACHS.length + '</b></div>' +
        '<div class="kv"><span>Legacy score</span><b class="amb">' + score.toLocaleString() + '</b></div>',
      buttons: [{ label: 'New run', cls: 'primary', run: backToTitle }]
    });
  });
  bus.on('abandon', () => { wipeSave(); backToTitle(); });
  addEventListener('visibilitychange', () => { if (document.hidden) { save(); setRate(true, G.rate); } });
  addEventListener('pagehide', () => save());
}

function backToTitle() {
  flushModals(); closePanel();
  G.s = null; G.paused = true;
  $('#app').hidden = true;
  $('#title-screen').classList.remove('gone');
  renderTitle();
}

wire();
renderTitle();
requestAnimationFrame(frame);
/* the offline cache is for the published game; on localhost it only hides edits */
const LOCAL = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
if ('serviceWorker' in navigator) {
  if (LOCAL) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => { });
  else addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}
window.__CAP = { G, bus, turn, SIM, UI, renderHUD, nextYear };
