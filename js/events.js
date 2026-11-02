/* ============================================================
   Capitalism - the yearly card
   ============================================================ */
import { PLACES, PLACE, ACTIONS } from './data.js';
import { G, bus, logMsg, addGreen, grantAch, isOiled } from './state.js';
import { clamp, chance, pick, money, num } from './util.js';

const open = (s) => PLACES.filter(p => s.places[p.id].open && s.places[p.id].scene);
const withKind = (s, k) => open(s).filter(p => s.places[p.id].scene.rigs.some(r => r && r.k === k));
const scar = (s, f) => { s.scarcity = clamp((s.scarcity || 1) * f, 0.7, 3.4); };
const C = (label, sub, run, opt = {}) => Object.assign({ label, sub, run }, opt);

export const EVENTS = [
  {
    id: 'blowout', w: 10, cond: (s) => withKind(s, 'rig').length,
    make(s) {
      const p = pick(withKind(s, 'rig'));
      return {
        eyebrow: 'Accident', title: 'Blowout',
        text: `The preventer failed on a platform off ${p.name}. Six hundred thousand barrels are in the water, there are camera boats on the slick, and the men who were on the drill floor are not all accounted for.`,
        choices: [
          C('Send the containment fleet', 'Pay for all of it, loudly', () => { s.cash -= 420; addGreen(2); logMsg('Spill contained off ' + p.name + '.', 'bad'); }, { cost: 420 }),
          C('Minimum response, maximum advertising', 'Cheaper. Everyone can tell', () => { s.cash -= 110; addGreen(8); }, { cost: 110 }),
          C('Blame the drilling contractor', 'Litigate for a decade', () => { addGreen(6); logMsg('Liability pushed onto the contractor.', 'bad'); })
        ]
      };
    }
  },
  {
    id: 'hurricane', w: 8, cond: (s) => withKind(s, 'rig').length,
    make(s) {
      const p = pick(withKind(s, 'rig'));
      return {
        eyebrow: 'Weather', title: 'Category Four',
        text: `A hurricane is forty hours from your platforms off ${p.name}. Evacuating costs you the season. Riding it out costs whatever it costs.`,
        choices: [
          C('Evacuate and shut in', 'Lose the season, keep the steel', () => { s.places[p.id].storm = 1; }),
          C('Keep drilling', 'Gamble on the forecast', () => {
            if (chance(0.55)) {
              const sc = s.places[p.id].scene;
              const idx = sc.rigs.map((r, i) => (r && r.k === 'rig') ? i : -1).filter(i => i >= 0);
              if (idx.length) sc.rigs[pick(idx)] = null;
              addGreen(5);
              logMsg('A platform was lost in the storm off ' + p.name + '.', 'bad');
            } else logMsg('The storm turned. Nobody stopped pumping.', 'good');
          })
        ]
      };
    }
  },
  {
    id: 'kuwait', w: 70, once: 1, cond: (s) => s.ops.messing && !s.ops.liberation,
    make() {
      return {
        eyebrow: 'Wire Report', title: 'Al-Dhahir Invades Its Neighbour',
        text: 'The currency you broke collapsed, the border dispute you encouraged boiled over, and three divisions crossed into the emirate at dawn. The regime you armed is now the villain of the century, which was the point. A coalition is being assembled, and the room below the White House is expecting your call.',
        choices: [C('Understood', 'Desert Storm is now available', (s) => { s.flags.kuwait = 1; logMsg('The invasion gives you your war. Desert Storm is available.', 'gold'); })]
      };
    }
  },
  {
    id: 'terror', w: 30, once: 1, cond: (s) => s.year > 1998 && !s.ops.liberation,
    make() {
      return {
        eyebrow: 'Breaking', title: 'Attack On The Mainland',
        text: 'Thousands are dead on American soil and the country wants someone held responsible without being fussy about who. Your strategy people have circulated a memo. The memo uses the word "window".',
        choices: [C('Issue a sombre statement', 'The Dossier becomes available', (s) => {
          s.flags.terror = 1;
          s.popularity = clamp(s.popularity + 18, 0, 100);
          addGreen(-4);
        })]
      };
    }
  },
  {
    id: 'blockade', w: 10, cond: (s) => open(s).some(p => s.places[p.id].unrest),
    make(s) {
      const p = pick(open(s).filter(x => s.places[x.id].unrest));
      return {
        eyebrow: p.sub, title: 'The Blockade Holds',
        text: `Nine villages have put one demand behind one banner at ${p.name}: clean the creeks or stop pumping. They are unarmed, disciplined and extremely photogenic, and your output here is down by nearly half.`,
        choices: [
          C('Fund a community programme', 'Clinics, a school, quiet', () => { s.cash -= 200; s.places[p.id].unrest = 0; addGreen(-1); }, { cost: 200 }),
          C('Pay the local authorities', 'They will take care of it', () => { s.cash -= 90; s.places[p.id].unrest = 0; addGreen(2.5); logMsg('The road at ' + p.name + ' is clear. Nobody will say how.', 'bad'); }, { cost: 90 }),
          C('Wait them out', 'They have to eat', () => { addGreen(1); })
        ]
      };
    }
  },
  {
    id: 'insurgents', w: 9, cond: (s) => open(s).some(p => p.insurgents),
    make(s) {
      const p = pick(open(s).filter(x => x.insurgents));
      const guarded = s.places[p.id].guarded;
      return {
        eyebrow: 'Occupation', title: 'Mortars On The Wellheads',
        text: `Three flow stations at ${p.name} were hit this year. ${guarded ? 'Your contractors held the perimeter and submitted an invoice.' : 'You have nobody out there at all.'}`,
        choices: [
          C('Hire more contractors', 'Expensive, effective', () => { s.cash -= 260; s.places[p.id].guarded = 1; s.places[p.id].armed = 0; }, { cost: 260 }),
          C('Pay the local commanders', 'Protection, of a sort', () => { s.cash -= 150; s.places[p.id].armed = 0; }, { cost: 150 }),
          C('Accept the losses', '', () => {
            const sc = s.places[p.id].scene;
            const idx = sc.rigs.map((r, i) => (r && ACTIONS[r.k] && ACTIONS[r.k].rate) ? i : -1).filter(i => i >= 0);
            if (idx.length) { sc.rigs[pick(idx)] = null; logMsg('A well at ' + p.name + ' is gone.', 'bad'); }
          })
        ]
      };
    }
  },
  {
    id: 'nat', w: 8, cond: (s) => open(s).some(p => p.nationalise && s.places[p.id].natRisk > 0.4),
    make(s) {
      const p = pick(open(s).filter(x => x.nationalise && s.places[x.id].natRisk > 0.4));
      return {
        eyebrow: p.sub, title: 'The Assembly Is Debating Your Concession',
        text: `A nationalisation bill has reached the floor and the public galleries are cheering. Your embassy contact says it passes within a few years unless something changes.`,
        choices: [
          C('Buy the vote', 'Discreet, expensive, temporary', () => { s.cash -= 320; s.places[p.id].natRisk = 0.15; logMsg('The bill dies in committee in ' + p.sub + '.', 'good'); }, { cost: 320 }),
          C('Go to arbitration', 'Treaties and years', () => { s.cash -= 140; s.places[p.id].natRisk = chance(0.5) ? 0.3 : 0.8; }, { cost: 140 }),
          C('Let Washington handle it', isOiled() ? 'The president is yours' : 'The president is not yours', () => {
            if (isOiled()) { s.places[p.id].natRisk = 0.2; logMsg('A quiet word from the State Department.', ''); }
            else { s.places[p.id].natRisk = 0.9; logMsg('Washington is not interested this year.', 'bad'); }
          })
        ]
      };
    }
  },
  {
    id: 'memo', w: 9, once: 1, cond: (s) => s.year > 1974 && s.year < 2000,
    make() {
      return {
        eyebrow: 'Internal', title: 'The 1977 Memo',
        text: 'Your head of research hands the executive committee a projection: doubling atmospheric carbon raises global temperature two to three degrees, and the company should plan for a world that regulates its product. It is careful, correct and devastating. It is also eleven pages long, which is nine more than anyone on the committee reads.',
        choices: [
          C('File it and fund the doubt instead', 'Institutes, op-eds, a retired professor', (s) => { s.cash -= 120; addGreen(-6); s.flags.buried = 1; logMsg('The memo is filed. The research budget moves to communications.', ''); }, { cost: 120 }),
          C('Publish it and start a solar division', 'Thirty years early', (s) => { s.cash -= 500; addGreen(-8); s.flags.published = 1; logMsg('You published the memo. History will be strange about this.', 'gold'); }, { cost: 500 })
        ]
      };
    }
  },
  {
    id: 'science', w: 8, cond: (s) => s.temp > 0.6 && s.year > 1985,
    make(s) {
      return {
        eyebrow: 'Science', title: 'The Assessment Report',
        text: `Two thousand scientists say, in careful language, that your product is changing the climate. Warming stands at ${s.temp.toFixed(2)}C. Your own people said this in the seventies and you have the memo in a drawer.`,
        choices: [
          C('Fund the uncertainty', 'The science is never settled enough', () => { s.cash -= 260; addGreen(-5); }, { cost: 260 }),
          C('Announce a net zero pledge', 'For a year in which you will be dead', () => { s.cash -= 180; addGreen(-4); }, { cost: 180 }),
          C('No comment', '', () => { addGreen(4); })
        ]
      };
    }
  },
  {
    id: 'embargo', w: 8, cond: (s) => s.year > 1968,
    make() {
      return {
        eyebrow: 'Geopolitics', title: 'Embargo',
        text: 'A producer bloc has cut exports to punish a war you had nothing to do with, which is a novelty. There are queues at the filling stations and your traders are shouting into two phones each.',
        choices: [
          C('Hold back shipments', 'Let the price climb', (s) => { scar(s, 1.3); addGreen(3); s.popularity = clamp(s.popularity - 8, 0, 100); }),
          C('Open the taps for the public good', 'And say so on television', (s) => { scar(s, 1.04); addGreen(-4); s.popularity = clamp(s.popularity + 10, 0, 100); })
        ]
      };
    }
  },
  {
    id: 'recession', w: 7, cond: (s) => s.year > 1957,
    make() {
      return {
        eyebrow: 'Economy', title: 'Demand Falls Off A Cliff',
        text: 'Credit froze, the factories idled, and nobody is driving to work because there is no work. Your product is piling up in tanks.',
        choices: [
          C('Cut costs hard', 'Twelve thousand jobs', (s) => { s.gdpMod = -0.05; addGreen(2); logMsg('Twelve thousand jobs cut. The share price liked it.', ''); }),
          C('Ride it out', '', (s) => { s.gdpMod = -0.05; })
        ]
      };
    }
  },
  {
    id: 'pandemic', w: 12, once: 1, cond: (s) => s.year >= 2019,
    make() {
      return {
        eyebrow: 'The World', title: 'Everything Stops',
        text: 'A respiratory virus has grounded the aviation industry and emptied the motorways. Storage is full everywhere on Earth and the front month traded below zero for an afternoon, which your traders describe as "interesting".',
        choices: [
          C('Shut in the expensive wells', '', (s) => { s.addiction = clamp(s.addiction - 0.08, 0.05, 2); s.gdpMod = -0.05; scar(s, 0.78); }),
          C('Keep pumping for market share', '', (s) => { s.addiction = clamp(s.addiction - 0.04, 0.05, 2); s.gdpMod = -0.05; scar(s, 0.62); })
        ]
      };
    }
  },
  {
    id: 'ev', w: 7, cond: (s) => s.year > 2004,
    make() {
      return {
        eyebrow: 'Technology', title: 'A Car That Burns Nothing',
        text: 'A California manufacturer has a battery sedan with a waiting list. Your analysts call it a toy for dentists. Your analysts called the mobile telephone a toy for dentists.',
        choices: [
          C('Buy a controlling stake', 'Own the thing that replaces you', (s) => { s.cash -= 1600; addGreen(-5); logMsg('You own a quarter of the company that will replace you.', 'gold'); }, { cost: 1600 }),
          C('Lobby against the subsidies', '', (s) => { s.cash -= 360; s.addiction = clamp(s.addiction + 0.03, 0, 2); }, { cost: 360 }),
          C('Laugh', 'Out loud, in the meeting', () => { })
        ]
      };
    }
  },
  {
    id: 'gusher', w: 9, cond: (s) => s.stats.rigs > 2,
    make(s) {
      const p = pick(open(s));
      return {
        eyebrow: 'Geology', title: 'Deeper Than Expected',
        text: `A sidetrack at ${p.name} punched into a second pay zone that nobody had mapped. The geologist who said it was there in 1961 has been promoted at last.`,
        choices: [C('Excellent', '', () => {
          const sc = s.places[p.id].scene;
          const live = sc.pools.filter(pl => pl.oil > 0);
          if (live.length) { const pl = pick(live); const add = Math.round(pl.oil0 * 0.7 + 120); pl.oil += add; pl.oil0 += add; logMsg('A pool at ' + p.name + ' gained ' + num(add, 0) + ' Mbbl.', 'good'); }
          else s.cash += 200;
        })]
      };
    }
  },
  {
    id: 'caribou', w: 7, cond: (s) => s.places.alaska.open && s.places.alaska.prod > 0,
    make(s) {
      return {
        eyebrow: 'Kuvik', title: 'The Herd Did Not Come Back',
        text: 'The calving ground moved sixty kilometres, the subsistence hunt failed, and a village has filed suit. The photographs are devastating and the calves are on the front page in four countries.',
        choices: [
          C('Sign a royalty-sharing agreement', 'Costly and durable', () => { s.places.alaska.royaltyMod = (s.places.alaska.royaltyMod || 0) + 0.04; addGreen(-4); }),
          C('Fly in a public relations team', '', () => { s.cash -= 220; addGreen(1); }, { cost: 220 }),
          C('Have the injunction lifted', '', () => { s.cash -= 120; addGreen(8); }, { cost: 120 })
        ]
      };
    }
  },
  {
    id: 'audit', w: 7, cond: (s) => s.cash > 1500,
    make(s) {
      const owed = Math.round(s.cash * 0.08);
      return {
        eyebrow: 'Revenue Service', title: 'Transfer Pricing Audit',
        text: 'The revenue service has noticed that your Caribbean marketing subsidiary buys crude at a remarkable discount and sells it at a remarkable premium, and that it employs one person, part time, in a building that is a post box.',
        choices: [
          C('Settle the assessment', money(owed), () => { s.cash -= owed; }),
          C('Litigate for nine years', '', () => {
            s.cash -= 150;
            if (chance(0.5)) logMsg('The assessment is vacated.', 'good');
            else { s.cash -= owed * 1.6; addGreen(2); }
          }, { cost: 150 })
        ]
      };
    }
  },
  {
    id: 'summit', w: 7, cond: (s) => s.temp > 1.1,
    make(s) {
      return {
        eyebrow: 'Diplomacy', title: 'The Conference Of Parties',
        text: `One hundred and ninety governments are in a convention centre arguing about a number. Warming is at ${s.temp.toFixed(2)}C. You have eleven people in the building and not one of them is on a delegation.`,
        choices: [
          C('Weaken the text', 'Change "phase out" to "phase down"', () => { s.cash -= 450; addGreen(-4); logMsg('Two words changed in the final text. Worth every dollar.', 'gold'); }, { cost: 450 }),
          C('Sign the voluntary pledge', '', () => { s.cash -= 200; addGreen(-6); s.addiction = clamp(s.addiction - 0.02, 0.05, 2); }, { cost: 200 }),
          C('Stay home', '', () => { addGreen(3); })
        ]
      };
    }
  },
  {
    id: 'burner_news', w: 50, once: 1, cond: (s) => s.flags.burners,
    make() {
      return {
        eyebrow: 'Research Division', title: 'Proposal: Biomass Conversion',
        text: 'With the peak behind us, research has filed a proposal for a small thermal plant that converts low-grade organic feedstock into synthetic crude. Half a derrick of output, buildable anywhere, no pool required. Nobody at the table asks what the feedstock is. The appendix is available on request and nobody requests it.',
        choices: [
          C('Approve the programme', 'Human burners become buildable', () => { addGreen(3); logMsg('The biomass programme is approved. Do not read the appendix.', 'bad'); }),
          C('Approve it without reading the appendix', 'Same thing, cleaner conscience', () => { logMsg('Approved without comment.', 'bad'); })
        ]
      };
    }
  }
];

export function maybeEvent(s) {
  s.flags.lastEvent = s.flags.lastEvent ?? -9;
  const gap = s.year - s.flags.lastEvent;
  if (gap < 2) return;
  let p = 0.36 + Math.min(0.18, s.stats.rigs * 0.012);
  if (gap > 4) p += 0.25;
  if (!chance(p)) return;
  const pool = EVENTS.filter(e => {
    if (e.once && s.flags['ev_' + e.id]) return false;
    if (!e.once && s.flags['ev_' + e.id] && s.year - s.flags['ev_' + e.id] < 7) return false;
    try { return !e.cond || e.cond(s); } catch { return false; }
  });
  if (!pool.length) return;
  const total = pool.reduce((t, e) => t + (e.w || 5), 0);
  let roll = Math.random() * total, chosen = pool[0];
  for (const e of pool) { roll -= (e.w || 5); if (roll <= 0) { chosen = e; break; } }
  let card;
  try { card = chosen.make(s); } catch { return; }
  if (!card) return;
  s.flags['ev_' + chosen.id] = s.year;
  s.flags.lastEvent = s.year;
  bus.emit('event', card);
}
