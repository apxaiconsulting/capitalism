/* ============================================================
   Capitalism - content
   A turn is one year. Oil is Mbbl. Money is $ millions.
   Deliberately small: six places, four things to build,
   one Congress, one number that can get you fired.
   ============================================================ */

export const VERSION = '3.0.0';
export const START_YEAR = 1946;
export const END_YEAR = 2051;

export const DIFFICULTY = {
  intern: { id: 'intern', name: 'Intern', blurb: 'Five dry years before they fire you.', cash: 900, patience: 5, green: 0.7 },
  exec: { id: 'exec', name: 'Executive', blurb: 'The intended way to ruin a planet.', cash: 650, patience: 4, green: 1 },
  tycoon: { id: 'tycoon', name: 'Tycoon', blurb: 'Loud activists, thin patience.', cash: 480, patience: 3, green: 1.3 },
  oligarch: { id: 'oligarch', name: 'Oligarch', blurb: 'Miss the line twice and you are gone.', cash: 380, patience: 2, green: 1.6 }
};

/* ---------------- what you can do on the ground ---------------- */
export const ACTIONS = {
  explore: {
    name: 'Exploration crew', ic: '\u{1FA82}', cost: 70, verb: 'Survey here',
    desc: 'Parachutes in, shoots the seismic, and tells you what is under a stretch of ground.'
  },
  derrick: {
    name: 'Oil derrick', ic: '⛏', cost: 120, rate: 60, on: 'land', verb: 'Drill here',
    desc: 'Drills straight down. If there is a pool under it, it pumps 60 a year. If there is not, you have bought a hole.'
  },
  rig: {
    name: 'Offshore rig', ic: '\u{1F6E2}', cost: 330, rate: 95, on: 'sea', verb: 'Drill at sea',
    desc: 'For the water. Three times the price, half again the oil, and the spills are televised.'
  },
  merc: {
    name: 'Mercenaries', ic: '\u{1F3AF}', cost: 160, upkeep: 42, on: 'land', verb: 'Deploy here',
    desc: 'Keeps the locals away from the wellheads. Nobody publishes the number.'
  },
  burner: {
    name: 'Human burner', ic: '\u{1F480}', cost: 95, rate: 30, on: 'land', locked: 'burners', verb: 'Build the burner',
    desc: 'Converts low-grade organic feedstock into synthetic crude. Half a derrick, needs no pool, and the appendix on feedstock is three paragraphs with no nouns in it.'
  },
  demolish: { name: 'Demolish', ic: '\u{1F4A3}', cost: 0, verb: 'Tear it down', desc: 'Scrap it and get a quarter of your money back.' }
};

/* ---------------- the world ---------------- */
/* terrain: land | sea | ice | forest | town | village | park        */
export const PLACES = [
  {
    id: 'texas', name: 'Texas', sub: 'United States', ic: '\u{1F920}', x: 0.22, y: 0.42,
    cols: 26, pools: { n: 5, min: 180, max: 520 }, sky: ['#cfe3f2', '#f2e6c8'], earth: ['#8a6a3c', '#6d5230'],
    mix: { land: 0.72, forest: 0.14, town: 0.08, park: 0.06 },
    royalty: 0.14, cost: 1, unlock: null, green: 0.6,
    blurb: 'Where your grandfather started, and where you will meet the peak first.'
  },
  {
    id: 'alaska', name: 'Kuvik Refuge', sub: 'Alaska', ic: '\u{1F43B}‍❄', x: 0.13, y: 0.17,
    cols: 26, pools: { n: 5, min: 420, max: 1100 }, sky: ['#b9cfdd', '#e7f1f6'], earth: ['#6f6a62', '#4e4a44'],
    mix: { ice: 0.46, land: 0.26, park: 0.2, sea: 0.08 },
    royalty: 0.12, cost: 1.25, unlock: { act: 'alaska_leasing', cash: 400 }, green: 3.2,
    blurb: 'Caribou, permafrost, and the last big onshore prize in North America. Protected until it is not.'
  },
  {
    id: 'venezuela', name: 'Rio Verde', sub: 'Venezuela', ic: '\u{1F332}', x: 0.3, y: 0.62,
    cols: 26, pools: { n: 6, min: 380, max: 1000 }, sky: ['#bfe0e8', '#e9f3d9'], earth: ['#7a5f3a', '#5d472b'],
    mix: { forest: 0.38, land: 0.26, sea: 0.18, village: 0.12, park: 0.06 },
    royalty: 0.2, cost: 1.05, unlock: { cash: 700 }, green: 2.4, nationalise: 1,
    blurb: 'Heavy crude, and an assembly that keeps remembering the oil belongs to the nation.'
  },
  {
    id: 'nigeria', name: 'Okun Delta', sub: 'Nigeria', ic: '\u{1F6E2}', x: 0.52, y: 0.56,
    cols: 26, pools: { n: 7, min: 400, max: 1100 }, sky: ['#dfe4c8', '#f3dfae'], earth: ['#6a5c33', '#4d4225'],
    mix: { land: 0.34, forest: 0.24, village: 0.22, sea: 0.2 },
    royalty: 0.09, cost: 0.78, unlock: { cash: 850 }, green: 1.6, militia: 1,
    blurb: 'Cheap concessions, flares over the mangroves, and blockades that begin politely.'
  },
  {
    id: 'iraq', name: 'Al-Dhahir', sub: 'Iraq', ic: '\u{1F42A}', x: 0.6, y: 0.37,
    cols: 26, pools: { n: 6, min: 900, max: 2400 }, sky: ['#e8d7a8', '#f6e9bd'], earth: ['#9a7c47', '#786036'],
    mix: { land: 0.62, village: 0.18, sea: 0.12, town: 0.08 },
    royalty: 0.1, cost: 0.8, unlock: { op: 'liberation', cash: 500 }, green: 2.2, insurgents: 1,
    blurb: 'More light sweet crude ten metres down than anywhere on Earth. The regime does not like you.'
  },
  {
    id: 'titan', name: 'Ligeia Mare', sub: 'Titan', ic: '\u{1FA90}', x: 0.86, y: 0.2,
    cols: 26, pools: { n: 6, min: 4000, max: 12000 }, sky: ['#5b4a63', '#c9a46a'], earth: ['#4a3f52', '#352c3b'],
    mix: { sea: 0.56, ice: 0.34, land: 0.1 },
    royalty: 0, cost: 2.2, unlock: { peak: 1, cash: 9000 }, green: 0,
    blurb: 'A sea of liquid methane on a moon of Saturn. Nobody owns it yet. The shareholders wept.'
  }
];
export const PLACE = Object.fromEntries(PLACES.map(p => [p.id, p]));

/* ---------------- Congress ---------------- */
export const REP_NAMES = ['Hollis', 'Mabry', 'Deeds', 'Vance', 'Pike', 'Garrity', 'Okafor', 'Lindqvist', 'Arroyo', 'Whitlock'];

export const ACTS = [
  /* the ones you want */
  { id: 'highway_act', pro: 1, repeat: 1, name: 'National Highway Program', ic: '\u{1F6E3}', effect: { addiction: 0.09 }, blurb: 'Concrete from sea to sea. Raises national oil addiction for good.' },
  { id: 'suburbia', pro: 1, repeat: 1, name: 'Homestead Mortgage Act', ic: '\u{1F3D8}', effect: { addiction: 0.07, gdp: 0.01 }, blurb: 'Cheap credit for houses forty minutes from anything.' },
  { id: 'depletion', pro: 1, repeat: 1, name: 'Depletion Allowance', ic: '\u{1F4B5}', effect: { tax: -0.06 }, blurb: 'Write the oil off as it leaves the ground. Cuts your tax.' },
  { id: 'alaska_leasing', pro: 1, name: 'New Jobs For Caribou Act', ic: '\u{1F43B}‍❄', effect: { open: 'alaska' }, blurb: 'Opens the Kuvik Refuge to drilling. The caribou get the jobs.' },
  { id: 'public_lands', pro: 1, name: 'Public Lands Transfer Act', ic: '\u{1F3DE}', effect: { parks: 1 }, blurb: 'Hands protected land to private operators. Every park becomes drillable.' },
  { id: 'deregulate', pro: 1, name: 'Energy Deregulation Act', ic: '\u{1F513}', effect: { green: 2, cheaper: 0.15 }, blurb: 'Guts inspection and liability. Everything gets cheaper and uglier.' },
  { id: 'bailout', pro: 1, repeat: 1, cond: (s) => s.cash < 200, name: 'Energy Stabilisation Loan', ic: '\u{1F6A8}', effect: { cash: 1200, green: 2 }, blurb: 'Public money, because you are too important to fail.' },

  /* the ones you pay to kill */
  { id: 'carbon_levy', pro: 0, repeat: 1, name: 'Carbon Levy', ic: '\u{1F32B}', effect: { tax: 0.1, addiction: -0.05 }, blurb: 'A tax on every tonne you sell.' },
  { id: 'cafe', pro: 0, repeat: 1, name: 'Fuel Economy Standards', ic: '\u{1F697}', effect: { addiction: -0.08 }, blurb: 'Efficient engines. Bleeds your market for decades.' },
  { id: 'transit', pro: 0, repeat: 1, name: 'Mass Transit Act', ic: '\u{1F687}', effect: { addiction: -0.07, green: -1 }, blurb: 'Trains. Trains do not burn your product.' },
  { id: 'windfall', pro: 0, cond: (s) => s.cash > 8000, name: 'Windfall Profits Tax', ic: '\u{1F4B8}', effect: { cashPct: -0.12 }, blurb: 'Takes an eighth of everything you are holding.' },
  { id: 'ev_mandate', pro: 0, repeat: 1, cond: (s) => s.year > 2000, name: 'Electrification Mandate', ic: '⚡', effect: { addiction: -0.12 }, blurb: 'The beginning of the end of your market.' },
  { id: 'nationalise', pro: 0, cond: (s) => s.green > 72, name: 'Energy Nationalisation Act', ic: '\u{1F6A9}', effect: { seizeHome: 1 }, blurb: 'You would lose Texas itself.' }
];
export const ACT = Object.fromEntries(ACTS.map(a => [a.id, a]));

/* ---------------- the room below the White House ---------------- */
export const OPS = [
  { id: 'enemy', name: 'The Enemy Of My Enemy', ic: '\u{1F91D}', cost: 300, sets: 'enemy', desc: 'Arm the regime in Al-Dhahir against its neighbour. They will owe you, briefly.' },
  { id: 'messing', name: 'Messing Up Their Economy', ic: '\u{1F4C9}', cost: 420, req: ['enemy'], sets: 'messing', desc: 'Collapse the currency, encourage the border dispute, and wait for the invasion.' },
  { id: 'desert_storm', name: 'Operation Desert Storm', ic: '⚔', cost: 900, req: ['kuwait'], sets: 'liberation', war: 1, desc: 'A coalition, a ground war, a reconstruction contract. Al-Dhahir opens for business.' },
  { id: 'wmd', name: 'The Dossier', ic: '\u{1F4C4}', cost: 700, req: ['terror'], sets: 'liberation', war: 1, desc: 'Supply the intelligence that justifies the second war. The weapons need not exist.' },
  { id: 'prevent_nat', name: 'Prevent Nationalisation', ic: '\u{1F5F3}', cost: 350, where: 'venezuela', effect: 'calm', desc: 'Fund the opposition, the strike committee and three newspapers.' },
  { id: 'coup', name: 'Regime Change', ic: '\u{1F3DB}', cost: 800, where: 'venezuela', effect: 'coup', desc: 'A colonel, a radio station and a Tuesday morning. Royalties are renegotiated downward.' },
  { id: 'crush', name: 'Crush The Revolt', ic: '\u{1F6A8}', cost: 300, anywhere: 1, effect: 'crush', desc: 'Federal troops clear the blockade. The casualty figure is never agreed on.' },
  { id: 'remove', name: 'Remove The Organisers', ic: '\u{1F576}', cost: 260, anywhere: 1, effect: 'remove', desc: 'The leaders are tried on Monday and hanged on Friday. Expect armed successors.' },
  { id: 'spin', name: 'Discredit The Scientists', ic: '\u{1F3AD}', cost: 450, effect: 'denial', desc: 'Nine op-eds, two institutes and one retired professor. The public calms down.' }
];
export const OP = Object.fromEntries(OPS.map(o => [o.id, o]));

/* ---------------- achievements ---------------- */
export const ACHS = [
  { id: 'first_oil', ic: '\u{1F6E2}', name: 'First Oil', desc: 'Strike your first pool.' },
  { id: 'dry', ic: '\u{1F573}', name: 'A Hole In The Ground', desc: 'Drill where there is nothing. It happens.' },
  { id: 'rich', ic: '\u{1F4B0}', name: 'Comfortable', desc: 'Hold $10B.' },
  { id: 'trillion', ic: '\u{1F451}', name: 'Trillionaire', desc: 'Hold $1T.' },
  { id: 'oiled', ic: '\u{1F6E2}', name: 'Oiled', desc: 'Put your own president in the White House.' },
  { id: 'congress', ic: '\u{1F4DC}', name: 'Wholly Owned', desc: 'Hold seven oiled representatives at once.' },
  { id: 'warhawk', ic: '⚔', name: 'Liberators', desc: 'Open Al-Dhahir by force.' },
  { id: 'coup', ic: '\u{1F5F3}', name: 'Tuesday Morning', desc: 'Run a successful regime change.' },
  { id: 'arctic', ic: '❄', name: 'Caribou Problem', desc: 'Pump a barrel out of the refuge.' },
  { id: 'burner', ic: '\u{1F480}', name: 'Feedstock', desc: 'Build a human burner. Do not read the appendix.' },
  { id: 'titan', ic: '\u{1FA90}', name: 'Interplanetary', desc: 'Pump hydrocarbon on another world.' },
  { id: 'peak', ic: '⛰', name: 'Peak', desc: 'Live to see world output roll over.' },
  { id: 'century', ic: '\u{1F570}', name: 'The Oil Century', desc: 'Still in the chair in 2051.' },
  { id: 'clean', ic: '\u{1F54A}', name: 'Clean Hands', desc: 'Reach 1990 without buying a single representative.' }
];

export const HELP = {
  how: `<h2>How to play</h2>
<p>One number decides your career: <b>national demand</b>. The bar on the right is what the country wants this year against what you can pump. Stay level with it. Miss it too many years running and the board finds somebody hungrier.</p>
<p><b>ACTIONS.</b> Pick a crew or a rig, then click the ground. An <b>exploration crew</b> shows you the pools under a stretch of land. A <b>derrick</b> drills straight down: if a pool is under it, it pumps; if not, you have bought a hole. Pools run dry, and the flow falls away once one is half empty. That is the peak, in miniature.</p>
<p><b>The globe</b> in the corner takes you to Washington and to the other places. In Washington, ten representatives decide your laws: <span class="amb">oiled</span> ones vote your way, <span class="pos">green</span> ones never do, gray ones flip a coin. Six votes carry a bill. You can buy the gray ones.</p>
<p>Every ten years there is an election. Fund a runner. Fund the winner enough and the presidency is <b>oiled</b>, which opens the room below the White House, where wars are arranged. Al-Dhahir opens no other way.</p>
<p>Pro-oil laws raise the country's <b>addiction</b>, which raises demand, which is both your market and your sentence. At <b>$300 a barrel</b> the world stops being a market, and that is one of the endings.</p>`,
  credits: `<h2>Credits</h2>
<p><b>Capitalism</b> is an original game written as a tribute to <i>Oiligarchy</i> (2008) by <b>Molleindustria</b> (Paolo Pedercini): the demand line, the oiled Congress, the room below the White House and the human burners are its ideas, followed on purpose.</p>
<p>No code or art from that game is used here. Every place, politician and company is fictional.</p>
<p>Vanilla JavaScript, one canvas, no libraries. Plays offline.</p>`
};
