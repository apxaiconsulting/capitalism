/* ============================================================
   Capitalism - static game content
   A turn is ONE YEAR. Oil is Mbbl/year. Money is $ millions.
   Faithful to Oiligarchy's model: demand line vs your production,
   oiled/gray/green Congress, 10-year elections, covert operations.
   ============================================================ */

export const VERSION = '2.0.0';
export const START_YEAR = 1946;

export const DIFFICULTY = {
  intern: { id: 'intern', name: 'Intern', blurb: 'Five crisis years before they fire you. Learn the machine.', cash: 900, patience: 5, heat: 0.6, cost: 0.85, green: 0.7, addiction: 1.04 },
  exec: { id: 'exec', name: 'Executive', blurb: 'The intended way to ruin a planet.', cash: 650, patience: 4, heat: 1, cost: 1, green: 1, addiction: 1 },
  tycoon: { id: 'tycoon', name: 'Tycoon', blurb: 'Hungry shareholders, loud activists, thin margins.', cash: 480, patience: 3, heat: 1.3, cost: 1.15, green: 1.3, addiction: 0.97 },
  oligarch: { id: 'oligarch', name: 'Oligarch', blurb: 'Miss the demand line twice and you are gone.', cash: 380, patience: 2, heat: 1.6, cost: 1.3, green: 1.6, addiction: 0.94 }
};

/* ---------------- terrain ---------------- */
export const TERRAIN = {
  plain: { name: 'Plains', build: 1 },
  desert: { name: 'Desert', build: 1 },
  tundra: { name: 'Tundra', build: 1 },
  forest: { name: 'Forest', build: 1, clear: { cost: 40, green: 1.5 } },
  swamp: { name: 'Mangrove', build: 1, clear: { cost: 55, green: 2 } },
  jungle: { name: 'Rainforest', build: 1, clear: { cost: 70, green: 3 } },
  water: { name: 'Shelf Water', build: 1, wet: 1 },
  deep: { name: 'Deep Water', build: 1, wet: 1 },
  ice: { name: 'Pack Ice', build: 1, wet: 1 },
  lake: { name: 'Methane Lake', build: 1, wet: 1 },
  village: { name: 'Village', build: 0, note: 'People live here. The local authorities can be persuaded.' },
  town: { name: 'Township', build: 0, note: 'People live here. Buy them out first.' },
  mountain: { name: 'Ridge', build: 0, note: 'Unworkable terrain.' },
  rock: { name: 'Regolith', build: 0, note: 'Barren rock.' },
  park: { name: 'Protected Land', build: 0, note: 'Federally protected. It takes an act of Congress.' },
  derelict: { name: 'Abandoned Pad', build: 1, note: 'Somebody drilled here before you.' }
};

/* ---------------- what you can build ---------------- */
export const STRUCT = {
  derrick: {
    name: 'Oil Derrick', ic: '⛏', cost: 120, opex: 18, rate: 60,
    on: ['plain', 'desert', 'tundra', 'forest', 'swamp', 'jungle', 'derelict'],
    desc: 'Land rig. 60 Mbbl a year while the field holds out.'
  },
  rig: {
    name: 'Offshore Rig', ic: '\u{1F6E2}', cost: 330, opex: 48, rate: 95, on: ['water'], tech: 'sonar',
    desc: 'Shelf platform found by side-sweep sonar. 95 Mbbl a year.'
  },
  deepwater: {
    name: 'Deepwater Platform', ic: '\u{1F6A2}', cost: 760, opex: 115, rate: 185, on: ['deep'], tech: 'deepwater',
    desc: 'Enormous flow. Enormous blowouts.'
  },
  arctic: {
    name: 'Arctic Rig', ic: '❄', cost: 560, opex: 88, rate: 125, on: ['ice'], tech: 'arctic',
    desc: 'Ice-class drilling, for places nobody is watching.'
  },
  frack: {
    name: 'Fracking Pad', ic: '\u{1F4A5}', cost: 280, opex: 46, rate: 75, revive: 0.5,
    on: ['plain', 'desert', 'tundra', 'derelict'], tech: 'fracking',
    desc: 'Shatters the rock for one more decade. Refills a dead field by half.'
  },
  burner: {
    name: 'Human Burner', ic: '\u{1F480}', cost: 95, opex: 15, rate: 30, flagged: 'burners',
    on: ['plain', 'desert', 'tundra', 'forest', 'swamp', 'jungle', 'derelict'], noOil: 1,
    desc: 'Biomass conversion. Half a derrick, and it can be built anywhere. Nobody asks what the biomass is.'
  },
  cryo: {
    name: 'Cryo Skimmer', ic: '\u{1F6F8}', cost: 2400, opex: 300, rate: 420, on: ['lake'], tech: 'space',
    desc: 'Skims liquid hydrocarbon at -180C. Absurd. Profitable.'
  },
  merc: {
    name: 'Mercenary Camp', ic: '\u{1F3AF}', cost: 160, opex: 42, guard: 1,
    on: ['plain', 'desert', 'tundra', 'forest', 'swamp', 'jungle', 'derelict'],
    desc: 'Guards every well in this region against insurgents and sabotage.'
  },
  refinery: {
    name: 'Refinery', ic: '\u{1F3ED}', cost: 300, opex: 40, margin: 0.12,
    on: ['plain', 'desert', 'tundra', 'derelict'],
    desc: '+12% on every barrel this region sells. One is enough.'
  },
  storage: {
    name: 'Tank Farm', ic: '\u{1F6E2}', cost: 190, opex: 22, store: 120,
    on: ['plain', 'desert', 'tundra', 'derelict'],
    desc: '+120 Mbbl of stockpile. Hold barrels back and sell them into a shortage.'
  }
};

/* ---------------- regions ---------------- */
export const REGIONS = [
  {
    id: 'texas', name: 'Texas', place: 'United States', ic: '\u{1F920}', w: 13, h: 9,
    gen: 'texas', clusters: { n: 5, min: 180, max: 520, spread: 1.7 },
    royalty: 0.14, opexMult: 1, costMult: 1, instability: 0, unlock: null, green: 0.6,
    blurb: 'Where your grandfather started and where you will first feel the peak. Shallow, picked over, and home.'
  },
  {
    id: 'alaska', name: 'Kuvik Refuge', place: 'Alaska', ic: '\u{1F43B}‍❄', w: 13, h: 10,
    gen: 'alaska', clusters: { n: 5, min: 420, max: 1100, spread: 1.9 },
    royalty: 0.12, opexMult: 1.3, costMult: 1.25, instability: 0.03,
    unlock: { act: 'alaska_leasing', cash: 400, text: 'Protected by law. Congress has to open it.' }, green: 3.2,
    blurb: 'Caribou, permafrost and the last big onshore prize in North America. Protected until it is not.'
  },
  {
    id: 'venezuela', name: 'Rio Verde', place: 'Venezuela', ic: '\u{1F332}', w: 14, h: 10,
    gen: 'venezuela', clusters: { n: 6, min: 380, max: 1000, spread: 2 },
    royalty: 0.2, opexMult: 0.95, costMult: 1.05, instability: 0.2, nationalize: 1,
    unlock: { cash: 700, text: 'A stable, friendly government. For now.' }, green: 2.4,
    blurb: 'Land and ocean, heavy crude, and a congress that periodically remembers the oil belongs to the nation.'
  },
  {
    id: 'nigeria', name: 'Okun Delta', place: 'Nigeria', ic: '\u{1F6E2}', w: 13, h: 10,
    gen: 'nigeria', clusters: { n: 7, min: 400, max: 1100, spread: 2 },
    royalty: 0.09, opexMult: 0.7, costMult: 0.78, instability: 0.3, militia: 1, bribe: 1,
    unlock: { cash: 850, text: 'Cheap concessions and officials who can be taken care of.' }, green: 1.6,
    blurb: 'Cheap labour, cheaper regulation, flares over the mangroves. The blockades start peaceful.'
  },
  {
    id: 'iraq', name: 'Al-Dhahir', place: 'Iraq', ic: '\u{1F42A}', w: 14, h: 10,
    gen: 'iraq', clusters: { n: 6, min: 900, max: 2400, spread: 2.6 },
    royalty: 0.1, opexMult: 0.55, costMult: 0.8, instability: 0.35, insurgents: 1,
    unlock: { op: 'liberation', cash: 500, text: 'Closed to you. It takes a war.' }, green: 2.2,
    blurb: 'Light sweet crude ten metres down, more of it than anywhere on Earth. The regime does not like you.'
  },
  {
    id: 'gulf', name: 'Gulf Shelf', place: 'Gulf of Mexico', ic: '\u{1F30A}', w: 14, h: 10,
    gen: 'gulf', clusters: { n: 6, min: 300, max: 900, spread: 2.1 },
    royalty: 0.18, opexMult: 1.15, costMult: 1.1, instability: 0,
    unlock: { cash: 600, tech: 'sonar', text: 'Needs sonar survey and a federal lease round.' }, green: 1.1,
    blurb: 'Warm water, thick sediment, hurricane alley. Every spill here is on the evening news.'
  },
  {
    id: 'caspian', name: 'Caspian Basin', place: 'Central Asia', ic: '\u{1F3DC}', w: 15, h: 10,
    gen: 'caspian', clusters: { n: 6, min: 500, max: 1400, spread: 2.2 },
    royalty: 0.16, opexMult: 1.05, costMult: 1, instability: 0.14,
    unlock: { cash: 1400, text: 'Enormous, landlocked, and surrounded by new republics.' }, green: 1.2,
    blurb: 'Five governments, four pipelines on paper, and a sea nobody can legally define.'
  },
  {
    id: 'antarctic', name: 'Weddell Shelf', place: 'Antarctica', ic: '\u{1F427}', w: 14, h: 10,
    gen: 'antarctic', clusters: { n: 5, min: 1200, max: 3000, spread: 2.3 },
    royalty: 0.06, opexMult: 1.7, costMult: 1.5, instability: 0.05,
    unlock: { act: 'treaty_exit', cash: 2600, text: 'Banned by treaty until the treaty is withdrawn from.' }, green: 4,
    blurb: 'The last continent. No natives to relocate, no press corps, and ice that eats equipment.'
  },
  {
    id: 'titan', name: 'Ligeia Mare', place: 'Titan, moon of Saturn', ic: '\u{1FA90}', w: 14, h: 10,
    gen: 'titan', clusters: { n: 6, min: 4000, max: 12000, spread: 2.8 },
    royalty: 0, opexMult: 2.4, costMult: 2.2, instability: 0,
    unlock: { tech: 'space', cash: 9000, text: 'Lakes of liquid methane. Nobody owns them yet.' }, green: 0,
    blurb: 'More hydrocarbon in one sea than Earth ever held. The shareholders wept with joy.'
  }
];
export const REGION = Object.fromEntries(REGIONS.map(r => [r.id, r]));

/* ---------------- technology ---------------- */
export const BRANCHES = {
  explore: { name: 'Exploration', ic: '\u{1F50E}' },
  extract: { name: 'Extraction', ic: '⚙' },
  influence: { name: 'Influence', ic: '\u{1F3DB}' },
  corporate: { name: 'Corporate', ic: '\u{1F454}' },
  future: { name: 'Futures', ic: '\u{1F52C}' }
};

export const TECHS = [
  { id: 'seismic', b: 'explore', name: 'Seismic Imaging', cost: 180, m: 3, ic: '\u{1F30D}', desc: 'Exploration crews cover a wider area and cost half as much.' },
  { id: 'sonar', b: 'explore', name: 'Side-Sweep Sonar', cost: 360, m: 4, ic: '\u{1F6A4}', desc: 'Finds oil under water and lets you build Offshore Rigs. Opens the Gulf Shelf.' },
  { id: 'satellite', b: 'explore', name: 'Satellite Spectrometry', cost: 620, m: 5, req: ['seismic'], ic: '\u{1F6F0}', desc: 'Every new region arrives fully surveyed.' },
  { id: 'arctic', b: 'explore', name: 'Ice-Class Drilling', cost: 820, m: 6, req: ['sonar'], ic: '❄', desc: 'Build Arctic Rigs on pack ice.' },
  { id: 'deepwater', b: 'explore', name: 'Deepwater Riser', cost: 1250, m: 7, req: ['sonar'], ic: '\u{1F30A}', desc: 'Build Deepwater Platforms in the abyss.' },

  { id: 'eor', b: 'extract', name: 'Enhanced Recovery', cost: 420, m: 4, ic: '\u{1F4A7}', desc: '+12% output from every well you own.' },
  { id: 'horizontal', b: 'extract', name: 'Horizontal Drilling', cost: 700, m: 5, req: ['eor'], ic: '↔', desc: '+15% output, and new fields give up 20% more oil.' },
  { id: 'fracking', b: 'extract', name: 'Hydraulic Fracturing', cost: 1100, m: 6, req: ['horizontal'], ic: '\u{1F4A5}', desc: 'Build Fracking Pads, which bring exhausted fields back. Groundwater will notice.' },
  { id: 'automation', b: 'extract', name: 'Remote Automation', cost: 860, m: 5, req: ['eor'], ic: '\u{1F916}', desc: 'Operating costs cut 25% everywhere.' },
  { id: 'refining', b: 'extract', name: 'Integrated Refining', cost: 640, m: 4, ic: '\u{1F3ED}', desc: '+8% on every barrel sold, worldwide.' },

  { id: 'kstreet', b: 'influence', name: 'K Street Office', cost: 300, m: 3, ic: '\u{1F4BC}', desc: 'Buying a representative costs 25% less.' },
  { id: 'thinktank', b: 'influence', name: 'Institute for Energy Freedom', cost: 720, m: 5, req: ['kstreet'], ic: '\u{1F393}', desc: 'Public environmental consciousness rises half as fast.' },
  { id: 'astroturf', b: 'influence', name: 'Grassroots Division', cost: 560, m: 4, req: ['kstreet'], ic: '\u{1F33F}', desc: 'Grassroots initiatives against you fizzle out on their own.' },
  { id: 'media', b: 'influence', name: 'Media Holdings', cost: 1300, m: 6, req: ['thinktank'], ic: '\u{1F4FA}', desc: 'Your money counts double in every election.' },
  { id: 'superpac', b: 'influence', name: 'Dark Money Vehicle', cost: 1800, m: 7, req: ['media'], ic: '\u{1F311}', desc: 'Buying representatives and running operations generates almost no scandal.' },

  { id: 'lawfirm', b: 'corporate', name: 'White-Shoe Counsel', cost: 480, m: 3, ic: '⚖', desc: 'Scandal cools twice as fast and fines are cut by a third.' },
  { id: 'havens', b: 'corporate', name: 'Offshore Structures', cost: 900, m: 5, req: ['lawfirm'], ic: '\u{1F3DD}', desc: 'Tax and royalty burden cut by 30%.' },
  { id: 'prmachine', b: 'corporate', name: 'Reputation Management', cost: 540, m: 4, ic: '\u{1F4E3}', desc: 'Public relations spending works twice as well.' },
  { id: 'greenwash', b: 'corporate', name: 'Greenwashing Suite', cost: 980, m: 5, req: ['prmachine'], ic: '\u{1F343}', desc: 'Environmental consciousness drops a little every year, whatever you do.' },
  { id: 'pmc', b: 'corporate', name: 'Private Military Division', cost: 760, m: 4, ic: '\u{1F6E1}', desc: 'Insurgents and militias are handled offscreen, everywhere.' },

  { id: 'solar', b: 'future', name: 'Solar Division', cost: 1200, m: 6, ic: '☀', desc: 'Begins your clean portfolio: +12 green capacity a year.' },
  { id: 'battery', b: 'future', name: 'Grid Storage', cost: 1700, m: 7, req: ['solar'], ic: '\u{1F50B}', desc: '+25 green capacity a year, and the public notices.' },
  { id: 'ccs', b: 'future', name: 'Carbon Capture', cost: 2000, m: 7, ic: '\u{1F32B}', desc: 'Cuts your reported emissions by a third. Reported.' },
  { id: 'fusion', b: 'future', name: 'Fusion Prototype', cost: 4200, m: 9, req: ['battery', 'ccs'], ic: '⚛', desc: '+70 green capacity a year. The board is confused but impressed.' },
  { id: 'space', b: 'future', name: 'Orbital Logistics', cost: 7000, m: 10, req: ['fusion'], ic: '\u{1F680}', desc: 'Unlocks the methane lakes of Titan. Yes, really.' }
];
export const TECH = Object.fromEntries(TECHS.map(t => [t.id, t]));

/* ---------------- congress ---------------- */
/* 10 seats. Reps are 'oiled', 'gray' or 'green'. */
export const REP_NAMES = [
  'Hollis', 'Mabry', 'Deeds', 'Vance', 'Pike', 'Garrity', 'Okafor', 'Lindqvist',
  'Arroyo', 'Whitlock', 'Benedetti', 'Sowell', 'Krieger', 'Nakamura', 'Dupree', 'Ashworth'
];

export const ACTS = [
  /* pro-oil: proposed when the administration is oily */
  { id: 'highway_act', pro: 1, repeat: 1, name: 'National Highway Program', ic: '\u{1F6E3}', desc: 'Concrete from sea to sea and nothing else funded.', effect: { addiction: 0.09 }, blurb: 'Permanently raises oil addiction.' },
  { id: 'suburbia', pro: 1, repeat: 1, name: 'Homestead Mortgage Act', ic: '\u{1F3D8}', desc: 'Cheap credit for houses forty minutes from anything.', effect: { addiction: 0.07, gdp: 0.01 }, blurb: 'More addiction, a little more growth.' },
  { id: 'depletion', pro: 1, name: 'Depletion Allowance', ic: '\u{1F4B5}', repeat: 1, desc: 'Lets you write the oil off as it leaves the ground.', effect: { tax: -0.06 }, blurb: 'Cuts your tax rate for good.' },
  { id: 'subsidy', pro: 1, name: 'Domestic Energy Security Act', ic: '\u{1F6E2}', repeat: 1, desc: 'A direct payment per domestic barrel.', effect: { subsidy: 1.1 }, blurb: 'Pays you per barrel pumped at home.' },
  { id: 'alaska_leasing', pro: 1, name: 'New Jobs For Caribou Act', ic: '\u{1F43B}‍❄', desc: 'Opens the Kuvik Refuge to leasing.', effect: { unlock: 'alaska' }, blurb: 'Required before Alaska can be opened.' },
  { id: 'public_lands', pro: 1, name: 'Public Lands Transfer Act', ic: '\u{1F3DE}', desc: 'Hands protected federal land to private operators.', effect: { parks: 1 }, blurb: 'Every protected tile becomes drillable.' },
  { id: 'offshore_lease', pro: 1, name: 'Outer Shelf Expansion', ic: '\u{1F30A}', desc: 'Cheap federal water leases.', effect: { costCut: { gulf: 0.25, antarctic: 0.15 } }, blurb: 'Offshore construction a quarter cheaper.' },
  { id: 'deregulate', pro: 1, name: 'Energy Deregulation Act', ic: '\u{1F513}', desc: 'Guts spill liability and well inspection.', effect: { opex: -0.12, fine: -0.5, green: 1.5 }, blurb: 'Cheaper operations, uglier accidents.' },
  { id: 'treaty_exit', pro: 1, name: 'Antarctic Treaty Withdrawal', ic: '\u{1F427}', desc: 'Leaves the mineral protocol.', effect: { unlock: 'antarctic' }, blurb: 'Opens the last continent.' },
  { id: 'spr_buy', pro: 1, name: 'Strategic Reserve Purchase', ic: '\u{1F3DB}', repeat: 1, desc: 'The government buys crude at a premium.', effect: { sprBuy: 1 }, blurb: 'Buys 150 Mbbl of your stockpile at +40%.' },
  { id: 'bailout', pro: 1, name: 'Energy Stabilisation Loan', ic: '\u{1F6A8}', repeat: 1, cond: (s) => s.cash < 150, desc: 'An emergency federal loan on generous terms.', effect: { cash: 1200, green: 2 }, blurb: 'Money when you are nearly dead.' },

  /* oil-unfriendly: proposed during supply crises and as consciousness rises */
  { id: 'carbon_levy', pro: 0, repeat: 1, name: 'Carbon Levy', ic: '\u{1F32B}', desc: 'A tax on every tonne of carbon sold.', effect: { tax: 0.1, addiction: -0.05 }, blurb: 'Kill it in committee.' },
  { id: 'cafe', pro: 0, repeat: 1, name: 'Fuel Economy Standards', ic: '\u{1F697}', desc: 'Mandates efficiency in new vehicles.', effect: { addiction: -0.08 }, blurb: 'Bleeds your market for decades.' },
  { id: 'transit', pro: 0, repeat: 1, name: 'Mass Transit Act', ic: '\u{1F687}', desc: 'Funds rail and buses in every metro.', effect: { addiction: -0.07, green: -1 }, blurb: 'Trains do not burn your product.' },
  { id: 'moratorium', pro: 0, name: 'Offshore Moratorium', ic: '\u{1F6AB}', desc: 'Suspends new offshore permits for five years.', effect: { ban: ['gulf', 'antarctic'] }, blurb: 'No new water drilling.' },
  { id: 'windfall', pro: 0, name: 'Windfall Profits Tax', ic: '\u{1F4B8}', cond: (s) => s.cash > 8000, desc: 'A one-off levy on excess profit.', effect: { cashPct: -0.12 }, blurb: 'Takes a eighth of everything you hold.' },
  { id: 'superfund', pro: 0, repeat: 1, name: 'Polluter Liability Act', ic: '⚖', desc: 'Full retroactive cleanup liability.', effect: { fine: 1, opex: 0.08 }, blurb: 'Every accident costs double.' },
  { id: 'renewables', pro: 0, repeat: 1, name: 'Renewable Portfolio Standard', ic: '☀', cond: (s) => s.year > 1990, desc: 'Obliges utilities to buy clean power.', effect: { addiction: -0.06, green: -1 }, blurb: 'The first real competition you have had.' },
  { id: 'ev_mandate', pro: 0, repeat: 1, name: 'Electrification Mandate', ic: '⚡', cond: (s) => s.year > 2000, desc: 'Phases out combustion sales.', effect: { addiction: -0.12 }, blurb: 'The beginning of the end of your market.' },
  { id: 'nationalise', pro: 0, name: 'Energy Nationalisation Act', ic: '\u{1F6A9}', cond: (s) => s.green > 70, desc: 'Takes the domestic industry into public hands.', effect: { seizeHome: 1 }, blurb: 'You would lose Texas itself.' }
];
export const ACT = Object.fromEntries(ACTS.map(a => [a.id, a]));

/* ---------------- covert operations (the room below the White House) ---------------- */
export const OPS = [
  {
    id: 'enemy', name: 'The Enemy Of My Enemy', ic: '\u{1F91D}', cost: 300, heat: 4,
    desc: 'Arm and fund the regime in Al-Dhahir against its neighbour. They will owe you, briefly.',
    sets: 'enemy'
  },
  {
    id: 'messing', name: 'Messing Up Their Economy', ic: '\u{1F4C9}', cost: 420, heat: 6, req: ['enemy'],
    desc: 'Collapse the currency, encourage the border dispute, and wait for the invasion of Kuwait.',
    sets: 'messing'
  },
  {
    id: 'desert_storm', name: 'Operation Desert Storm', ic: '⚔', cost: 900, heat: 8, req: ['messing'],
    desc: 'A coalition, a ground war and a reconstruction contract. Al-Dhahir opens for business.',
    sets: 'liberation', war: 1
  },
  {
    id: 'wmd', name: 'The Dossier', ic: '\u{1F4C4}', cost: 700, heat: 10, cond: (s) => s.flags.terror,
    desc: 'Supply the intelligence that justifies the second war. The weapons do not have to exist.',
    sets: 'liberation', war: 1
  },
  {
    id: 'prevent_nat', name: 'Prevent Nationalisation', ic: '\u{1F5F3}', cost: 350, heat: 5,
    desc: 'Fund the opposition, the strike committee and three newspapers in Venezuela.',
    region: 'venezuela', effect: 'calm'
  },
  {
    id: 'coup', name: 'Regime Change', ic: '\u{1F3DB}', cost: 800, heat: 14,
    desc: 'A colonel, a radio station and a Tuesday morning. Royalties are renegotiated downward.',
    region: 'venezuela', effect: 'coup'
  },
  {
    id: 'crush', name: 'Crush The Revolt', ic: '\u{1F6A8}', cost: 300, heat: 9,
    desc: 'The federal troops will clear the blockade. Nobody will publish the number.',
    anyRegion: 1, effect: 'crush'
  },
  {
    id: 'assassinate', name: 'Remove The Activists', ic: '\u{1F576}', cost: 260, heat: 20,
    desc: 'The leaders of the movement are tried on Monday and hanged on Friday. Expect armed successors.',
    anyRegion: 1, effect: 'assassinate'
  },
  {
    id: 'spin', name: 'Discredit The Scientists', ic: '\u{1F3AD}', cost: 450, heat: 7,
    desc: 'Nine op-eds, two institutes and a retired professor. Environmental consciousness falls.',
    effect: 'denial'
  }
];

/* ---------------- addiction programmes (HQ) ---------------- */
export const PROGRAMS = [
  { id: 'suv', name: 'Light Truck Campaign', ic: '\u{1F699}', cost: 320, scale: 2, max: 4, addiction: 0.035, green: 0.5, desc: 'Sell the family a two-tonne vehicle for the school run.' },
  { id: 'transit_kill', name: 'Streetcar Acquisition', ic: '\u{1F68B}', cost: 480, scale: 2.2, max: 3, addiction: 0.045, green: 1.2, desc: 'Buy the tram lines. Pave them over. Sell the buses.' },
  { id: 'plastics', name: 'Plastics Everywhere', ic: '\u{1F964}', cost: 420, scale: 2.1, max: 4, addiction: 0.032, green: 0.8, desc: 'A petrochemical skin for every object on Earth.' },
  { id: 'aviation', name: 'Cheap Aviation', ic: '✈', cost: 560, scale: 2.2, max: 3, addiction: 0.04, green: 0.6, desc: 'Weekend flights priced below a bus ticket.' },
  { id: 'agro', name: 'Petro-Agriculture', ic: '\u{1F69C}', cost: 500, scale: 2.1, max: 3, addiction: 0.036, green: 0.4, desc: 'Fertiliser, pesticide, diesel. Food as a fuel product.' },
  { id: 'doubt', name: 'Manufactured Doubt', ic: '❓', cost: 600, scale: 2.4, max: 3, addiction: 0.01, green: -2.2, desc: 'Fund the uncertainty. The science is never settled enough.' }
];

/* ---------------- achievements ---------------- */
export const ACHS = [
  { id: 'first_oil', ic: '\u{1F6E2}', name: 'First Oil', desc: 'Drill your first well.' },
  { id: 'met_demand', ic: '\u{1F4CF}', name: 'Above The Line', desc: 'Cover national demand for ten straight years.' },
  { id: 'rich', ic: '\u{1F4B0}', name: 'Comfortable', desc: 'Hold $10B in cash.' },
  { id: 'richer', ic: '\u{1F48E}', name: 'Serious Money', desc: 'Hold $250B in cash.' },
  { id: 'trillion', ic: '\u{1F451}', name: 'Trillionaire', desc: 'Hold $1T in cash.' },
  { id: 'six_regions', ic: '\u{1F30D}', name: 'Everywhere At Once', desc: 'Operate in six regions.' },
  { id: 'fifty_wells', ic: '⛏', name: 'Pincushion', desc: 'Run fifty producing wells at once.' },
  { id: 'oiled', ic: '\u{1F6E2}', name: 'Oiled', desc: 'Get a president of your own into the White House.' },
  { id: 'dynasty', ic: '\u{1F3AF}', name: 'Dynasty', desc: 'Keep the presidency oiled through three administrations.' },
  { id: 'warhawk', ic: '⚔', name: 'Liberators', desc: 'Open Al-Dhahir by force.' },
  { id: 'congress', ic: '\u{1F4DC}', name: 'Wholly Owned', desc: 'Hold seven oiled representatives at once.' },
  { id: 'arctic_open', ic: '❄', name: 'Caribou Problem', desc: 'Pump a barrel out of the Kuvik Refuge.' },
  { id: 'antarctica', ic: '\u{1F427}', name: 'Last Continent', desc: 'Pump a barrel out of Antarctica.' },
  { id: 'titan', ic: '\u{1FA90}', name: 'Interplanetary', desc: 'Produce hydrocarbon on Titan.' },
  { id: 'burner', ic: '\u{1F480}', name: 'Biomass', desc: 'Build a Human Burner. Do not think about it.' },
  { id: 'frack_all', ic: '\u{1F4A5}', name: 'Second Helping', desc: 'Bring five dead fields back with fracking.' },
  { id: 'spiller', ic: '\u{1F41F}', name: 'Act Of God', desc: 'Cause three major spills and blame the weather.' },
  { id: 'coup', ic: '\u{1F5F3}', name: 'Tuesday Morning', desc: 'Run a successful regime change.' },
  { id: 'price100', ic: '\u{1F4C8}', name: 'Triple Digits', desc: 'See crude above $100.' },
  { id: 'peak', ic: '⛰', name: 'Peak', desc: 'Live to see world production roll over.' },
  { id: 'green_turn', ic: '☀', name: 'Conversion', desc: 'Build 800 green capacity.' },
  { id: 'untouchable', ic: '⚖', name: 'Untouchable', desc: 'Beat an indictment.' },
  { id: 'clean', ic: '\u{1F54A}', name: 'Clean Hands', desc: 'Reach 1990 without buying a single representative.' },
  { id: 'century', ic: '\u{1F570}', name: 'The Oil Century', desc: 'Still in the chair in 2050.' }
];

export const HELP = {
  how: `<h2>How to play</h2>
<p>It is 1946. You run a private oil major, and one number decides your career: <b>national demand</b>. The red line is what the country wants; the black bar is what you can pump. <b>Stay at or above the line.</b> Miss it for too many years in a row and the board replaces you.</p>
<p><b>Field.</b> Each region is a map you cannot see into. Send an <b>exploration crew</b> to scan an area, then build a derrick on a field it finds. Every field declines once it is half empty - that is the peak, in miniature, and it will happen to the whole world too.</p>
<p><b>Washington.</b> Ten representatives sit in Congress: <span class="amb">oiled</span> ones vote for you, <span class="pos">green</span> ones vote against you, gray ones flip a coin. You can buy the gray ones. Pro-oil acts raise the country's <b>oil addiction</b>, which raises demand, which is both your market and your sentence.</p>
<p><b>Elections every ten years.</b> Fund a party's runner during the race. Give enough to the winner and the president is <b>oiled</b> - which opens the room below the White House, where wars are arranged. Al-Dhahir only opens that way.</p>
<p><b>The crisis.</b> When you cannot meet demand, Congress proposes something that hurts you, the public turns, and the price climbs. Price is your profit and your doom: at <b>$300 a barrel</b> the world stops being a market.</p>
<p>There are seven endings. Most of them are good for you and bad for everyone else.</p>`,
  credits: `<h2>Credits</h2>
<p><b>Capitalism</b> is an original game built as a much larger tribute to <i>Oiligarchy</i> (2008) by <b>Molleindustria</b>, whose design - the demand line, the oiled Congress, the room below the White House, the human burners - this follows deliberately and expands.</p>
<p>No code or art from that game is used here. All regions, politicians and companies are fictional.</p>
<p>Vanilla JavaScript, one canvas, no dependencies. Plays offline, installs on iPhone, iPad and desktop.</p>`
};
