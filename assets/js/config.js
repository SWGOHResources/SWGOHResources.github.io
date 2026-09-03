/* CONFIG — edit this when a new Era / units / datacrons drop. No DOM. No logic changes needed elsewhere. */

const ERA_START_DATE = '2026-07-28'; // Day 1 baseline (Tuesday, July 28, 2026 -> Ends Oct 20, 2026)

/* =========================================================
 GAC CONFIGURATION
  GAC runs on its OWN independent 28-day cycle.
  Based on user report: Aug 21 8:41am is Round 1 Attack, Week 2 of 5v5.
  Working backward with the 7-day structure: Week 1 Signup was Aug 11.
  ========================================================= */

const GAC_CYCLE_START_DATE = '2026-08-11'; // Day 1 (Signup) of the 5v5 season

/* =========================================================
 DATACRON SET CONFIGURATION — EDIT WHEN A NEW SET IS ANNOUNCED
  Datacron sets rotate through colors in a fixed order:
    Orange -> Pink -> Green -> Blue -> (repeats)
  A new set is introduced roughly every 28 days, but each individual
  set stays equippable longer than 28 days, so up to 4 sets can be
  active/overlapping at once. "expires" is the date (UTC) the set
  is removed. Set hasFDC: true for sets that add Fleet/Faction
  Datacrons (FDCs) on top of the normal set — adjust manually.
  ========================================================= */

const DATACRON_SETS = [
  { name: 'For Old Times',       color: 'orange', expires: '2026-09-03', hasFDC: false },
  { name: 'Necessary Means',     color: 'pink',    expires: '2026-10-01', hasFDC: false },
  { name: 'Supremacy Directive', color: 'green',   expires: '2026-10-29', hasFDC: true  },
];

const CRON_COLOR_META = {
  orange: { label: 'Orange', accent: 'var(--orange)', dim: 'var(--orange-dim)', border: 'var(--orange-border)', asset: 'datacrons/datacron_orange.png' },
  pink:   { label: 'Pink',   accent: 'var(--magenta)', dim: 'var(--magenta-dim)', border: 'var(--magenta-border)', asset: 'datacrons/datacron_pink.png' },
  green:  { label: 'Green',  accent: 'var(--green)',  dim: 'var(--green-dim)',  border: 'var(--green-border)',  asset: 'datacrons/datacron_green.png' },
  blue:   { label: 'Blue',   accent: 'var(--steel)',  dim: 'var(--steel-dim)',  border: 'var(--steel-border)',  asset: 'datacrons/datacron_blue.png' },
};

/* =========================================================
 EVENT DATA MODEL (EXACT SHEET9 MAPPING)
  ========================================================= */

// Marquee / era-challenge art is full portrait art in-game. The square
// marquee3 and marquee5 images in assets/img/marquee/ are placeholders —
// swap in the real portraits when available (same filenames, no code
// changes needed).
const MARQUEE_NAMES = {
  marquee_1: 'Mara Jade Skywalker',
  marquee_2: 'Yoda (Dark Side Vision)',
  marquee_3: 'Starkiller (Luke Concept)',
  marquee_4: 'Stormtrooper (Concept)',
  marquee_5: 'Jaxxon',
  marquee_6: 'The Ronin',
};

// Journey Guide unlocks (4★→7★) are the same unit each era.
// Update this when a new Era / Journey Guide unit is announced.
const JOURNEY_GUIDE_UNIT = 'Darth Jar Jar';

// Image base + unit tile images (paths relative to IMG_BASE in assets/img/)
const IMG_BASE = 'assets/img/';
const CONQUEST_UNIT_IMAGE = 'events/conquest.png';
const ERA_UNIT_IMAGE = 'events/erajourney.png';

function ev(icon, label){
  if(icon.startsWith('marquee_')) {
    const base = MARQUEE_NAMES[icon] || label || 'Marquee Event';
    label = /marquee/i.test(base) ? base : `${base} Marquee`;
  }

  if(icon.startsWith('era_challenge_')) {
    const match = icon.match(/^era_challenge_(\d+)$/);
    if(match){
      const marqueeKey = `marquee_${match[1]}`;
      const marqueeName = MARQUEE_NAMES[marqueeKey];
      label = marqueeName ? `${marqueeName} Era Challenge Starts` : label || 'Era Challenge Starts';
    }
  }

  return {icon, label};
}

const COMMON_DAYS = {
  2:  [ev('smugglersrun',"Smuggler's Run II"), ev('tw_payout','Payout')],
  3:  [ev('tw_signup','Signup Starts')],
  4:  [ev('smugglersrun',"Smuggler's Run III"), ev('tw_defense','Defense Phase Starts')],
  5:  [ev('tw_offense','Offense Phase Starts')],
  6:  [ev('tw_payout','Payout')],
  9:  [ev('rote','Phase 3 Starts'), ev('era_battle_1','Era Battle 1 (Rotta) Starts')],
  10: [ev('rote','Phase 4 Starts')],
  11: [ev('rote','Phase 5 Starts')],
  12: [ev('rote','Phase 6 Starts')],
  13: [ev('tb_ends','Territory Battle Ends'), ev('tw_signup','Signup Starts')],
  14: [ev('tw_defense','Defense Phase Starts'), ev('era_battle_2','Era Battle 2 (Grogu) Starts')],
  16: [ev('smugglersrun',"Smuggler's Run II"), ev('tw_payout','Payout')],
  17: [ev('tw_signup','Signup Starts')],
  18: [ev('smugglersrun',"Smuggler's Run III"), ev('tw_defense','Defense Phase Starts')],
  19: [ev('tw_offense','Offense Phase Starts')],
  20: [ev('tw_payout','Payout')],
  22: [ev('rote','Phase 2 Starts')],
  23: [ev('era_battle_1','Era Battle 1 (Rotta) Starts'), ev('rote','Phase 3 Starts')],
  24: [ev('rote','Phase 4 Starts')],
  25: [ev('rote','Phase 5 Starts')],
  26: [ev('rote','Phase 6 Starts')],
  27: [ev('tb_ends','Territory Battle Ends'), ev('tw_signup','Signup Starts')],
  28: [ev('era_battle_2','Era Battle 2 (Grogu) Starts'), ev('tw_defense','Defense Phase Starts')],
};

const EPISODE_OVERRIDES = {
  1: {
    1:  [ev('marquee_1'), ev('journey_reruns','Reruns Start'), ev('era_changeover','Era Changeover'), ev('tw_offense','Offense Phase Starts')],
    7:  [ev('rote','Phase 1 Starts'), ev('conquest_start','2nd Conquest of Volume Starts'), ev('smugglersrun',"Smuggler's Run I")],
    8:  [ev('era_challenge_1'), ev('rote','Phase 2 Starts'), ev('journey_reruns','Reruns End')],
    15: [ev('marquee_2'), ev('tw_offense','Offense Phase Starts')],
    21: [ev('conquest_end','2nd Conquest of Volume Ends'), ev('proving_ground','Proving Grounds'), ev('ultimate_journey','Ultimate Journey'), ev('smugglersrun',"Smuggler's Run I"), ev('rote','Phase 1 Starts')],
    22: [ev('era_challenge_2'), ev('rote','Phase 2 Starts')],
  },
  2: {
    1:  [ev('marquee_3'), ev('tw_offense','Offense Phase Starts')],
    7:  [ev('rote','Phase 1 Starts'), ev('conquest_start','3rd Conquest of Volume Starts'), ev('smugglersrun',"Smuggler's Run I")],
    8:  [ev('era_challenge_3'), ev('rote','Phase 2 Starts')],
    15: [ev('marquee_4'), ev('tw_offense','Offense Phase Starts')],
    21: [ev('conquest_end','Conquest Ends (Unit First Playable)'), ev('proving_ground','Proving Grounds'), ev('ultimate_journey','Ultimate Journey'), ev('smugglersrun',"Smuggler's Run I"), ev('rote','Phase 1 Starts')],
    22: [ev('era_challenge_4'), ev('rote','Phase 2 Starts')],
  },
  3: {
    1:  [ev('marquee_5'), ev('journey_guide',`${JOURNEY_GUIDE_UNIT} 4/5★ Guide Unlock`), ev('tw_offense','Offense Phase Starts')],
    7:  [ev('rote','Phase 1 Starts'), ev('conquest_start','1st Conquest of New Volume Starts'), ev('smugglersrun',"Smuggler's Run I")],
    8:  [ev('era_challenge_5'), ev('rote','Phase 2 Starts')],
    15: [ev('marquee_6'), ev('journey_guide',`${JOURNEY_GUIDE_UNIT} 6/7★ Guide Unlock`), ev('tw_offense','Offense Phase Starts')],
    21: [ev('conquest_end','1st Conquest of New Volume Ends'), ev('proving_ground','Proving Grounds'), ev('ultimate_journey','Ultimate Journey'), ev('smugglersrun',"Smuggler's Run I"), ev('rote','Phase 1 Starts')],
    22: [ev('era_challenge_6'), ev('rote','Phase 2 Starts')],
  }
};

/* Recurring Monthly Events */
const MONTHLY_EVENTS = [
  { icon: 'fleet_executor',   label: 'Discarded Doctrine (Executor) Starts',      dayOfMonth: 15 },
  { icon: 'fleet_leviathan',  label: 'Dark Sovereign (Leviathan) Starts',         dayOfMonth: 20 },
  { icon: 'fleet_profundity', label: 'Stardust Transmission (Profundity) Starts', lastDayOfMonth: true },
];

const BOSS_LOOP = [
  'Krayt Dragon',
  'Zeffo Tomb Guardians',
  'Jotaz',
  'Dryax'
];

const BOSS_ICONS = {
  'Krayt Dragon': 'bosses/krayt.png',
  'Zeffo Tomb Guardians': 'bosses/zeffo.png',
  'Jotaz': 'bosses/jotaz.png',
  'Dryax': 'bosses/dryax.png'
};

/* ICON / CATEGORY SYSTEM */
const CATEGORY_META = {
  gac:      { label: 'GAC',      glyph: 'GAC', accent: 'var(--red)',    dim: 'var(--red-dim)',    border: 'var(--red-border)' },
  conquest: { label: 'CONQUEST', glyph: 'CQ',  accent: 'var(--purple)', dim: 'var(--purple-dim)', border: 'var(--purple-border)' },
  guild:    { label: 'GUILD',    glyph: 'GLD', accent: 'var(--amber)',  dim: 'var(--amber-dim)',  border: 'var(--amber-border)' },
  fleet:    { label: 'FLEET',    glyph: 'FLT', accent: 'var(--steel)',  dim: 'var(--steel-dim)',  border: 'var(--steel-border)' },
  era:      { label: 'ERA',      glyph: 'ERA', accent: 'var(--orange)', dim: 'var(--orange-dim)', border: 'var(--orange-border)' },
};

const CATEGORY_ICONS = {
  gac:      'events/gac.png',
  conquest: 'events/conquest.png',
  guild:    'events/tw.png',
  fleet:    'events/executor.png',
  era:      'events/erajourney.png',
};

// Display tags that differ from the owning category (shown on cards).
const TAG_OVERRIDES = {
  smugglersrun:    { label: 'Resource',      glyph: 'RES' },
  ultimate_journey:{ label: 'Resource',      glyph: 'RES' },
  fleet_executor:  { label: 'Fleet Mastery', glyph: 'FLT' },
  fleet_leviathan: { label: 'Fleet Mastery', glyph: 'FLT' },
  fleet_profundity:{ label: 'Fleet Mastery', glyph: 'FLT' },
};

const EVENT_ICONS = {
  tw_signup: 'events/tw.png',
  tw_defense: 'events/tw.png',
  tw_offense: 'events/tw.png',
  tw_payout: 'events/tw.png',
  rote: 'events/tb.png',
  tb_ends: 'events/tb.png',
  smugglersrun: 'events/smugglersrun.png',
  gac_signup: 'events/gac.png',
  gac_defense: 'events/gac.png',
  gac_attack: 'events/gac.png',
  conquest_start: 'events/conquest.png',
  conquest_end: 'events/conquest.png',
  era_changeover: 'events/erajourney.png',
  era_battle_1: 'events/erabattle1.png',
  era_battle_2: 'events/erabattle2.png',
  era_challenge_1: 'marquee/marquee1event.png',
  era_challenge_2: 'marquee/marquee2event.png',
  era_challenge_3: 'marquee/marquee3event.png',
  era_challenge_4: 'marquee/marquee4event.png',
  era_challenge_5: 'marquee/marquee5event.png',
  era_challenge_6: 'marquee/marquee6event.png',
  marquee_1: 'marquee/marquee1event.png',
  marquee_2: 'marquee/marquee2event.png',
  marquee_3: 'marquee/marquee3event.png',
  marquee_4: 'marquee/marquee4event.png',
  marquee_5: 'marquee/marquee5event.png',
  marquee_6: 'marquee/marquee6event.png',
  proving_ground: 'events/provingground.png',
  ultimate_journey: 'events/ultimatejourney.png',
  journey_reruns: 'events/journeyicon.png',
  journey_guide: 'events/journeyicon.png',
  fleet_executor: 'events/executor.png',
  fleet_leviathan: 'events/leviathan.png',
  fleet_profundity: 'events/profundity.png'
};

const WEEKDAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const WEEKDAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* =========================================================
   TIME ENGINE
   ========================================================= */

const ERA_LENGTH_DAYS = 84;

const EPISODE_LENGTH_DAYS = 28;

const CONQUEST_END_OFFSETS = [49];

const ERA_START_OFFSETS = [1];

const TW_PHASE_LABELS = ['Signup', 'Defense', 'Attack'];

const TW_PHASE_ICONS = ['tw_signup', 'tw_defense', 'tw_offense'];

const GUILD_SUBLABEL = {
  tw_signup: 'TW', tw_defense: 'TW', tw_offense: 'TW', tw_payout: 'TW',
  rote: 'TB', tb_ends: 'TB',
  smugglersrun: 'SR'
};
