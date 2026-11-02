/* ============================================================
   Capitalism - yearly event cards
   ============================================================ */
import { REGION, REGIONS, STRUCT, TECH } from './data.js';
import { G, bus, logMsg, addGreen, addHeat, grantAch, hasTech, diff, isOiled } from './state.js';
import { clamp, chance, pick, money, num } from './util.js';
const scar = (s, f) => { s.scarcity = clamp((s.scarcity || 1) * f, 0.45, 3.4); };

const live = (s) => REGIONS.filter(r => s.regions[r.id].unlocked && s.regions[r.id].tiles);
const withKinds = (s, kinds) => live(s).filter(r => s.regions[r.id].tiles.some(t => t.st && kinds.includes(t.st.k)));
const wellsIn = (s, rid, kinds) => s.regions[rid].tiles.filter(t => t.st && (!kinds || kinds.includes(t.st.k)));
function fine(s, amount) {
  const f = Math.max(0, amount * (1 + (s.fineMod || 0)) * (hasTech('lawfirm') ? 0.67 : 1));
  s.cash -= f; return f;
}
function spill(s, rid, tile, severity) {
  s.stats.spills++;
  if (tile && tile.st) tile.st.spill = 1;
  addGreen(severity);
}
const C = (label, sub, run, opt = {}) => Object.assign({ label, sub, run }, opt);

export const EVENTS = [
  {
    id: 'blowout', w: 10, cond: (s) => withKinds(s, ['rig', 'deepwater', 'arctic']).length,
    make(s) {
      const r = pick(withKinds(s, ['rig', 'deepwater', 'arctic']));
      const t = pick(wellsIn(s, r.id, ['rig', 'deepwater', 'arctic']));
      const deep = t.st.k === 'deepwater';
      return {
        eyebrow: 'Accident', title: deep ? 'Blowout At The Riser' : 'Platform Blowout',
        text: `The blowout preventer failed on a platform in ${r.name}. ${deep ? 'Four million' : 'Six hundred thousand'} barrels are already in the water and there are camera boats on the slick.`,
        choices: [
          C('Full containment fleet', 'Pay for all of it, loudly', () => {
            const f = fine(s, deep ? 1400 : 420);
            spill(s, r.id, t, deep ? 4 : 2);
            logMsg('Spill contained in ' + r.name + ' for ' + money(f) + '.', 'bad');
          }),
          C('Minimum response, maximum advertising', 'Cheap, and it shows', () => {
            fine(s, deep ? 320 : 110);
            spill(s, r.id, t, deep ? 13 : 8);
            addHeat(8);
          }),
          C('Blame the contractor', 'Litigate for a decade', () => {
            spill(s, r.id, t, deep ? 9 : 6); addHeat(14);
          })
        ]
      };
    }
  },
  {
    id: 'hurricane', w: 8, cond: (s) => withKinds(s, ['rig', 'deepwater']).length,
    make(s) {
      const r = pick(withKinds(s, ['rig', 'deepwater']));
      return {
        eyebrow: 'Weather', title: 'Category Four',
        text: `A hurricane is forty hours from your platforms in ${r.name}. Evacuating costs you a season of production from that region. Riding it out costs whatever it costs.`,
        choices: [
          C('Evacuate and shut in', 'Lose output, keep the steel', () => {
            s.regions[r.id].tiles.forEach(t => { if (t.st && STRUCT[t.st.k].rate) t.st.shut = 1; });
            s.regions[r.id].unrest = s.regions[r.id].unrest; s.regions[r.id].storm = 1;
            logMsg('Platforms shut in ahead of the storm in ' + r.name + '.', '');
          }),
          C('Keep drilling', 'Gamble on the forecast', () => {
            if (chance(0.55)) {
              const t = pick(wellsIn(s, r.id, ['rig', 'deepwater']));
              if (t) t.st = null;
              spill(s, r.id, null, 5);
              logMsg('A platform was lost in the storm in ' + r.name + '.', 'bad');
            } else logMsg('The storm turned. Production never stopped.', 'good');
          })
        ]
      };
    }
  },
  {
    id: 'kuwait', w: 60, once: 1, cond: (s) => s.ops.messing && !s.ops.liberation,
    make(s) {
      return {
        eyebrow: 'Wire Report', title: 'Al-Dhahir Invades Its Neighbour',
        text: 'The currency collapsed, the border dispute boiled over, and three divisions crossed into the emirate at dawn. The regime you armed is now the villain of the century, which is precisely the point. A coalition is being assembled and the room below the White House is expecting your call.',
        choices: [C('Understood', 'Operation Desert Storm is now available', () => {
          s.flags.kuwait = 1;
          logMsg('The invasion gives you your war. Desert Storm is available in Operations.', 'gold');
        })]
      };
    }
  },
  {
    id: 'terror', w: 30, once: 1, cond: (s) => s.year > 1998 && !s.ops.liberation,
    make(s) {
      return {
        eyebrow: 'Breaking', title: 'Attack On The Mainland',
        text: 'A coordinated attack has killed thousands on American soil. The country wants someone held responsible and is not in a mood to be precise about who. Your analysts note, carefully, that this is an opportunity.',
        choices: [C('A sombre statement from the company', 'The Dossier is now available', () => {
          s.flags.terror = 1;
          s.popularity = clamp(s.popularity + 18, 0, 100);
          addGreen(-4);
          logMsg('The mood in Washington has changed. The Dossier is available in Operations.', '');
        })]
      };
    }
  },
  {
    id: 'ogoni', w: 9, cond: (s) => live(s).some(r => r.militia && s.regions[r.id].unrest),
    make(s) {
      const r = pick(live(s).filter(x => x.militia && s.regions[x.id].unrest));
      return {
        eyebrow: 'Delta', title: 'The Blockade Holds',
        text: `A writers' committee has put nine villages behind one demand at ${r.name}: clean the creeks or stop pumping. They are unarmed, disciplined and photogenic, and your output there is down by a third.`,
        choices: [
          C('Fund a community programme', 'Clinics, a school, quiet', () => {
            s.cash -= 200; s.regions[r.id].unrest = 0; addGreen(-1);
            logMsg('The blockade lifts at ' + r.name + '. For now.', 'good');
          }, { cost: 200 }),
          C('Pay the local authorities', 'They will take care of it', () => {
            s.cash -= 90; s.regions[r.id].unrest = 0; addGreen(2.5); addHeat(5);
            logMsg('The local authorities have cleared the road at ' + r.name + '.', 'bad');
          }, { cost: 90 }),
          C('Wait them out', '', () => { addGreen(1); })
        ]
      };
    }
  },
  {
    id: 'insurgents', w: 9, cond: (s) => live(s).some(r => r.insurgents && s.regions[r.id].unlocked),
    make(s) {
      const r = pick(live(s).filter(x => x.insurgents));
      const guarded = s.regions[r.id].guarded || hasTech('pmc');
      return {
        eyebrow: 'Occupation', title: 'Attacks On The Wellheads',
        text: `Three flow stations in ${r.name} were hit this year with mortars and a truck. ${guarded ? 'Your contractors returned fire and held the perimeter.' : 'You have nobody guarding them.'}`,
        choices: [
          C('Hire more contractors', 'Expensive, effective', () => {
            s.cash -= 260; s.regions[r.id].guarded = 1; s.regions[r.id].armed = 0;
            logMsg('A mercenary camp is now operating in ' + r.name + '.', '');
          }, { cost: 260 }),
          C('Pay the local commanders', 'Protection, of a sort', () => {
            s.cash -= 150; s.regions[r.id].armed = 0; addHeat(6);
          }, { cost: 150 }),
          C('Accept the losses', '', () => {
            const w = wellsIn(s, r.id, null).filter(t => STRUCT[t.st.k].rate);
            if (w.length) { pick(w).st = null; logMsg('A well in ' + r.name + ' was destroyed.', 'bad'); }
          })
        ]
      };
    }
  },
  {
    id: 'nat_warning', w: 8, cond: (s) => live(s).some(r => r.nationalize && s.regions[r.id].natRisk > 0.4),
    make(s) {
      const r = pick(live(s).filter(x => x.nationalize && s.regions[x.id].natRisk > 0.4));
      return {
        eyebrow: 'Caracas', title: 'The Assembly Is Debating Your Concession',
        text: `A nationalisation bill has reached the floor in ${r.place}, and the galleries are full and cheering. Your embassy contact says it will pass within a few years unless something changes.`,
        choices: [
          C('Buy the vote', 'Discreet, expensive, temporary', () => {
            s.cash -= 320; s.regions[r.id].natRisk = 0.15; addHeat(10);
            logMsg('The bill dies in committee in ' + r.place + '.', 'good');
          }, { cost: 320 }),
          C('Arbitration and treaties', 'Lawyers and years', () => {
            s.cash -= 140;
            s.regions[r.id].natRisk = chance(hasTech('lawfirm') ? 0.75 : 0.5) ? 0.3 : 0.8;
          }, { cost: 140 }),
          C('Nothing. Washington will handle it', isOiled() ? 'The president is yours' : 'The president is not yours', () => {
            if (isOiled()) { s.regions[r.id].natRisk = 0.2; logMsg('A quiet word from the State Department.', ''); }
            else { s.regions[r.id].natRisk = 0.9; logMsg('Washington is not interested this year.', 'bad'); }
          })
        ]
      };
    }
  },
  {
    id: 'strike', w: 7, cond: (s) => s.stats.wells > 5,
    make(s) {
      const r = pick(live(s));
      return {
        eyebrow: 'Labour', title: 'Walkout',
        text: `Crews in ${r.name} have stopped work over hours, heat and the man who died in April.`,
        choices: [
          C('Meet the demands', 'Operating costs up 3% for good', () => { s.opexMod = (s.opexMod || 0) + 0.03; addGreen(-1); }),
          C('Hire replacements', '', () => { s.cash -= 160; addGreen(2); addHeat(3); }, { cost: 160 }),
          C('Wait them out', 'Lose a season', () => { s.regions[r.id].storm = 1; addGreen(1); })
        ]
      };
    }
  },
  {
    id: 'whistleblower', w: 6, cond: (s) => s.heat > 25,
    make(s) {
      return {
        eyebrow: 'Internal', title: 'A Box Of Documents',
        text: 'A geologist has taken nine years of internal climate modelling to a journalist. The 1974 memos are in there. The ones that were right.',
        choices: [
          C('Settlement and gag order', '', () => { s.cash -= 320; addHeat(4); }, { cost: 320 }),
          C('Discredit the source', '', () => {
            s.cash -= 130; addHeat(10);
            if (chance(0.55)) addGreen(1); else { addGreen(9); logMsg('The smear was traced back to you.', 'bad'); }
          }, { cost: 130 }),
          C('Say nothing', '', () => { addGreen(5); addHeat(5); })
        ]
      };
    }
  },
  {
    id: 'investigation', w: 11, cond: (s) => s.heat > 55,
    make(s) {
      return {
        eyebrow: 'Justice Department', title: 'Subpoena',
        text: 'A federal grand jury wants eleven years of your political payments, your foreign ledger and three of your vice presidents.',
        choices: [
          C('Full legal defence', '', () => { s.cash -= 600; s.heat = clamp(s.heat - 35, 0, 130); }, { cost: 600 }),
          C('Cooperate and sacrifice a vice president', '', () => {
            s.heat = clamp(s.heat - 55, 0, 130); addGreen(1.5);
            logMsg('A vice president takes the fall. The company is cleared.', '');
          }),
          C('Shred everything', '', () => {
            if (chance(0.5)) s.heat = clamp(s.heat - 25, 0, 130);
            else { addHeat(30); addGreen(6); logMsg('Obstruction charges added.', 'bad'); }
          })
        ]
      };
    }
  },
  {
    id: 'indictment', w: 25, cond: (s) => s.heat > 96,
    make(s) {
      return {
        eyebrow: 'Grand Jury', title: 'Indicted',
        text: 'Seventeen counts: foreign bribery, wire fraud, obstruction. The board has stopped returning calls.',
        choices: [
          C('Spend whatever it takes', 'A third of everything you hold', () => {
            const c = Math.max(900, s.cash * 0.33); s.cash -= c;
            if (chance(hasTech('lawfirm') ? 0.72 : 0.45)) {
              s.heat = 25; grantAch('untouchable');
              logMsg('Acquitted on all counts. ' + money(c) + ' well spent.', 'gold');
            } else { s.over = { k: 'indicted', year: s.year }; bus.emit('gameOver', s.over); }
          }),
          C('Plead and pay the fine', 'Keep the chair, lose the money', () => {
            const c = Math.max(1200, s.cash * 0.5); s.cash -= c; s.heat = 18; addGreen(4);
            logMsg('Deferred prosecution agreement signed. ' + money(c) + ' in penalties.', 'bad');
          })
        ]
      };
    }
  },
  {
    id: 'science', w: 8, cond: (s) => s.temp > 0.6 && s.year > 1985,
    make(s) {
      return {
        eyebrow: 'Science', title: 'The Assessment Report',
        text: `Two thousand scientists have published a synthesis saying, in careful language, that your product is changing the climate. Warming stands at ${s.temp.toFixed(2)}C. Your own researchers said this in the seventies.`,
        choices: [
          C('Fund the uncertainty', 'Op-eds, institutes, experts', () => {
            s.cash -= 260; s.programs.doubt = Math.min(3, (s.programs.doubt || 0) + 1); addGreen(-3); addHeat(3);
          }, { cost: 260 }),
          C('Announce a net zero pledge', 'For a year in which you will be dead', () => {
            s.cash -= 180; addGreen(-5);
          }, { cost: 180 }),
          C('No comment', '', () => { addGreen(4); })
        ]
      };
    }
  },
  {
    id: 'embargo', w: 8, cond: (s) => s.year > 1968,
    make(s) {
      return {
        eyebrow: 'Geopolitics', title: 'Embargo',
        text: 'A producer bloc has cut exports to punish a war you had nothing to do with. There are queues at filling stations and your traders are shouting.',
        choices: [
          C('Sell the stockpile into the panic', num(s.stock, 0) + ' Mbbl on hand', () => {
            const take = s.stock; s.stock = 0;
            const got = take * s.price * 1.7;
            s.cash += got; scar(s, 1.08);
            logMsg('Stockpile sold into the shortage for ' + money(got) + '.', 'gold');
          }, { req: (s) => s.stock > 1 }),
          C('Hold everything back', 'Let the price climb', () => { scar(s, 1.3); addGreen(3); s.popularity = clamp(s.popularity - 8, 0, 100); }),
          C('Open the taps for the public good', '', () => { scar(s, 1.04); addGreen(-4); s.popularity = clamp(s.popularity + 10, 0, 100); })
        ]
      };
    }
  },
  {
    id: 'pandemic', w: 10, once: 1, cond: (s) => s.year >= 2019,
    make(s) {
      return {
        eyebrow: 'The World', title: 'Everything Stops',
        text: 'A respiratory virus has grounded aviation and emptied the motorways. Storage is full everywhere on Earth and the front month traded below zero for an afternoon.',
        choices: [
          C('Shut in the expensive fields', '', () => { s.addiction = clamp(s.addiction - 0.08, 0.05, 2); s.gdpMod = -0.05; scar(s, 0.78); }),
          C('Keep pumping for market share', '', () => { s.addiction = clamp(s.addiction - 0.04, 0.05, 2); s.gdpMod = -0.05; scar(s, 0.62); })
        ]
      };
    }
  },
  {
    id: 'ev', w: 7, cond: (s) => s.year > 2004,
    make(s) {
      return {
        eyebrow: 'Technology', title: 'A Car That Burns Nothing',
        text: 'A California manufacturer has a battery sedan with a waiting list. Your analysts call it a toy for dentists.',
        choices: [
          C('Buy a controlling stake', 'Own the thing that replaces you', () => {
            s.cash -= 1600; s.green_cap += 220; addGreen(-5);
            logMsg('You now own a quarter of the company that will replace you.', 'gold');
          }, { cost: 1600 }),
          C('Lobby against the subsidies', '', () => { s.cash -= 360; addHeat(5); s.addiction = clamp(s.addiction + 0.03, 0, 2); }, { cost: 360 }),
          C('Laugh', '', () => { s.flags.laughedAtEV = 1; })
        ]
      };
    }
  },
  {
    id: 'auction', w: 11, cond: () => true,
    make(s) {
      const locked = REGIONS.filter(r => !s.regions[r.id].unlocked && r.unlock && !r.unlock.act && !r.unlock.op && !r.unlock.tech);
      const r = locked.length ? pick(locked) : pick(live(s));
      const bid = Math.round((r.unlock ? r.unlock.cash * 0.6 : 400) * diff().cost);
      return {
        eyebrow: 'Leasing', title: 'Sealed Bid Round',
        text: `Blocks in ${r.name}, ${r.place} are up. Two majors are in the room and one of them has a friend in the ministry.`,
        choices: [
          C('Bid aggressively', 'Takes the acreage', () => {
            s.cash -= bid;
            if (s.regions[r.id].unlocked) { s.cash += 0; s.regions[r.id].bonusAcreage = 1; revealSome(s, r.id); logMsg('Won adjacent acreage in ' + r.name + ' and surveyed it.', 'good'); }
            else {
              s.regions[r.id].unlocked = true;
              import('./map.js').then(m => m.genRegion(r.id));
              logMsg('Won the block. ' + r.name + ' is yours without the usual entry cost.', 'gold');
            }
          }, { cost: bid }),
          C('Let the rivals have it', '', () => { logMsg('A rival took the ' + r.name + ' block.', ''); })
        ]
      };
    }
  },
  {
    id: 'gusher', w: 9, cond: (s) => s.stats.wells > 2,
    make(s) {
      const r = pick(live(s));
      const cands = s.regions[r.id].tiles.filter(t => t.st && STRUCT[t.st.k].rate && t.oil > 0);
      const t = cands.length ? pick(cands) : null;
      return {
        eyebrow: 'Geology', title: 'Deeper Than Expected',
        text: `A sidetrack in ${r.name} punched into a second pay zone nobody had mapped.`,
        choices: [C('Excellent', '', () => {
          if (t) { const add = Math.round(t.oil0 * 0.7 + 120); t.oil += add; t.oil0 += add; logMsg('A field in ' + r.name + ' gained ' + num(add, 0) + ' Mbbl.', 'good'); }
          else s.cash += 200;
        })]
      };
    }
  },
  {
    id: 'earthquake', w: 7, cond: (s) => withKinds(s, ['frack']).length,
    make(s) {
      const r = pick(withKinds(s, ['frack']));
      return {
        eyebrow: 'Seismicity', title: 'Magnitude 5.1',
        text: `A county near your fracking pads in ${r.name} has had four hundred earthquakes this year, which is four hundred more than before you arrived.`,
        choices: [
          C('Compensate the county', '', () => { fine(s, 240); addGreen(-0.5); }, { cost: 240 }),
          C('Commission a three-year study', '', () => { s.cash -= 90; addGreen(4); addHeat(4); }, { cost: 90 }),
          C('Deny causation', '', () => { addGreen(7); addHeat(7); })
        ]
      };
    }
  },
  {
    id: 'groundwater', w: 6, cond: (s) => withKinds(s, ['frack']).length,
    make(s) {
      const r = pick(withKinds(s, ['frack']));
      return {
        eyebrow: 'Litigation', title: 'The Tap Catches Fire',
        text: `Eleven households near ${r.name} can set their kitchen water alight with a lighter. There is video, a class action and a very good plaintiff's attorney.`,
        choices: [
          C('Settle with non-disclosure', '', () => { s.cash -= 420; addHeat(3); }, { cost: 420 }),
          C('Fight to the state supreme court', '', () => {
            s.cash -= 150;
            if (chance(hasTech('lawfirm') ? 0.65 : 0.4)) logMsg('Dismissed on standing.', 'good');
            else { fine(s, 700); addGreen(6); }
          }, { cost: 150 })
        ]
      };
    }
  },
  {
    id: 'caribou', w: 7, cond: (s) => s.regions.alaska.unlocked && s.regions.alaska.prod > 0,
    make(s) {
      return {
        eyebrow: 'Kuvik', title: 'The Herd Did Not Come Back',
        text: 'The calving ground moved sixty kilometres and the subsistence hunt failed. The village has filed suit and the photographs are devastating.',
        choices: [
          C('Royalty-sharing agreement', 'Costly and durable', () => { const rs = s.regions.alaska; rs.royaltyMod = (rs.royaltyMod || 0) + 0.04; addGreen(-4); }),
          C('Fly in a public relations team', '', () => { s.cash -= 220; addGreen(hasTech('prmachine') ? -1 : 2); }, { cost: 220 }),
          C('Get the injunction lifted', '', () => { s.cash -= 120; addGreen(8); addHeat(6); }, { cost: 120 })
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
        text: 'The revenue service has noticed that your Caribbean marketing subsidiary buys crude at a remarkable discount and sells it at a remarkable premium.',
        choices: [
          C('Settle the assessment', money(owed), () => { s.cash -= owed; }),
          C('Litigate for nine years', '', () => {
            s.cash -= 150; addHeat(6);
            if (chance(hasTech('havens') ? 0.72 : 0.45)) logMsg('The assessment is vacated.', 'good');
            else { s.cash -= owed * 1.6; addGreen(2); }
          }, { cost: 150 })
        ]
      };
    }
  },
  {
    id: 'shareholder', w: 7, cond: (s) => s.year > 1995,
    make(s) {
      return {
        eyebrow: 'Annual Meeting', title: 'Resolution Seven',
        text: 'An activist fund with 4% of your stock wants you to publish your reserve exposure under a two degree scenario. Two pension funds have signalled support.',
        choices: [
          C('Buy out the activist', '', () => { s.cash -= 700; }, { cost: 700 }),
          C('Concede the disclosure', '', () => { addGreen(-6); s.cash -= 60; }, { cost: 60 }),
          C('Vote it down with the proxy machine', '', () => { s.cash -= 180; addGreen(3); addHeat(2); }, { cost: 180 })
        ]
      };
    }
  },
  {
    id: 'summit', w: 7, cond: (s) => s.temp > 1.1,
    make(s) {
      return {
        eyebrow: 'Diplomacy', title: 'The Conference Of Parties',
        text: `One hundred and ninety governments are in a convention centre arguing about a number. Warming is at ${s.temp.toFixed(2)}C and you have eleven people in the building, none of them on a delegation.`,
        choices: [
          C('Weaken the text', 'Change "phase out" to "phase down"', () => {
            s.cash -= 450; addGreen(-4); addHeat(4);
            logMsg('Two words changed in the final text. Worth every dollar.', 'gold');
          }, { cost: 450 }),
          C('Sign the voluntary pledge', '', () => { s.cash -= 200; addGreen(-6); s.addiction = clamp(s.addiction - 0.02, 0.05, 2); }, { cost: 200 }),
          C('Stay home', '', () => { addGreen(3); })
        ]
      };
    }
  },
  {
    id: 'defector', w: 6, cond: (s) => !s.research,
    make(s) {
      const pool = Object.values(TECH).filter(t => !s.techs[t.id] && (!t.req || t.req.every(r => s.techs[r])));
      const t = pool.length ? pick(pool) : null;
      return {
        eyebrow: 'Recruitment', title: 'A Team Wants To Leave Their Employer',
        text: t ? `Nine engineers from a rival will move, with their notebooks, and finish ${t.name} in half the time.`
          : 'Nine engineers from a rival want to move. There is nothing left for them to work on.',
        choices: t ? [
          C('Hire them all', 'Half the cost, half the years', () => {
            const c = Math.round(t.cost * 0.5 * diff().cost);
            if (s.cash < c) { logMsg('Could not afford the hires.', 'bad'); return; }
            s.cash -= c; s.research = { id: t.id, left: Math.max(1, Math.ceil(t.m / 2)), total: t.m }; addHeat(4);
            logMsg('Rival team hired. ' + t.name + ' arrives early.', 'good');
          }),
          C('Report them to their employer', '', () => { })
        ] : [C('Pass', '', () => { })]
      };
    }
  },
  {
    id: 'refinery_fire', w: 6, cond: (s) => s.stats.wells > 6,
    make(s) {
      return {
        eyebrow: 'Accident', title: 'Explosion At The Refinery',
        text: 'A hydrocracker went up at four in the morning. Fifteen contractors were on that unit, and the inspection report recommended replacement.',
        choices: [
          C('Compensate the families generously', '', () => { s.cash -= 420; addGreen(-1); }, { cost: 420 }),
          C('Minimum legal settlement', '', () => { s.cash -= 140; addGreen(8); addHeat(8); }, { cost: 140 }),
          C('Blame the contractor firm', '', () => { addGreen(5); addHeat(11); })
        ]
      };
    }
  },
  {
    id: 'speculate', w: 8, cond: (s) => s.cash > 800 && s.year > 1983,
    make(s) {
      const stake = Math.round(s.cash * 0.2);
      return {
        eyebrow: 'Trading Desk', title: 'The Desk Wants A Position',
        text: `Your traders want ${money(stake)} on crude moving this year. They are very confident, which is what they said last time.`,
        choices: [
          C('Go long', 'Bet the price rises', () => {
            const win = chance(s.shortfall > 0 ? 0.65 : 0.44);
            s.cash += win ? stake * 0.85 : -stake;
            logMsg(win ? 'The long paid ' + money(stake * 0.85) + '.' : 'The long cost ' + money(stake) + '.', win ? 'good' : 'bad');
          }),
          C('Go short', 'Bet the price falls', () => {
            const win = chance(s.surplus > 0 ? 0.6 : 0.4);
            s.cash += win ? stake * 0.9 : -stake;
            logMsg(win ? 'The short paid ' + money(stake * 0.9) + '.' : 'The short cost ' + money(stake) + '.', win ? 'good' : 'bad');
          }),
          C('No position', '', () => { })
        ]
      };
    }
  },
  {
    id: 'memo', w: 8, once: 1, cond: (s) => s.year > 1974 && s.year < 2000,
    make(s) {
      return {
        eyebrow: 'Internal', title: 'The 1977 Memo',
        text: 'Your head of research hands the executive committee a projection: doubling atmospheric carbon raises global temperature two to three degrees, and the company should plan for a world that regulates its product. It is careful, correct and devastating.',
        choices: [
          C('Bury it and fund doubt instead', '', () => {
            s.programs.doubt = Math.min(3, (s.programs.doubt || 0) + 1);
            s.cash -= 120; s.flags.buriedMemo = 1; addGreen(-2);
            logMsg('The memo is filed. The research budget moves to communications.', '');
          }, { cost: 120 }),
          C('Publish it and start a solar division', 'Thirty years early', () => {
            s.cash -= 500; s.green_cap += 90; addGreen(-8); s.flags.publishedMemo = 1;
            logMsg('You published the memo. History will be strange about this.', 'gold');
          }, { cost: 500 })
        ]
      };
    }
  },
  {
    id: 'burner_news', w: 40, once: 1, cond: (s) => s.flags.burners,
    make(s) {
      return {
        eyebrow: 'Research Division', title: 'Proposal: Biomass Conversion',
        text: 'With the peak behind us, your research division has filed a proposal for a small thermal plant that converts low-grade organic feedstock into synthetic crude. The feedstock section of the document is three paragraphs long and uses no nouns of any kind. Half a derrick of output, buildable anywhere, no field required.',
        choices: [
          C('Approve the programme', 'Human Burners become buildable', () => {
            addHeat(6); addGreen(3);
            logMsg('The biomass programme is approved. Do not read the appendix.', 'bad');
          }),
          C('Refuse to read the appendix', 'Approve it anyway', () => { logMsg('Approved without comment.', 'bad'); })
        ]
      };
    }
  }
];

function revealSome(s, rid) {
  const rs = s.regions[rid];
  if (!rs.tiles) return;
  rs.tiles.filter(t => !t.sv).slice(0, 14).forEach(t => t.sv = 1);
}

export function maybeEvent(s) {
  s.flags.lastEvent = s.flags.lastEvent ?? -9;
  const gap = s.year - s.flags.lastEvent;
  if (gap < 2) return;
  let p = 0.38 + Math.min(0.2, s.stats.wells * 0.01);
  if (s.heat > 70) p += 0.12;
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
  card.id = chosen.id;
  bus.emit('event', card);
}
