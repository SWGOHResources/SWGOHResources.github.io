/* CONFIG — edit this when a new Era / units / datacrons drop. Data only,
   plus the tiny ev() label factory the tables below are built with (it
   must stay in this file: the tables call it at definition time, before
   time.js loads). No DOM. No logic changes needed elsewhere. */

const ERA_NAME = 'Era of Myths & Legends';
const ERA_START_DATE = '2026-07-28'; // Day 1 baseline (Tuesday, July 28, 2026 -> Ends Oct 20, 2026)

/* Changeover hours (UTC). Game logic runs on UTC; the display timezone
   picker only re-labels these moments. If CG ever moves reset times,
   change them here — every countdown, cycle and label follows. */
const STD_CHANGEOVER_HOUR_UTC = 18; // era-day / TB / conquest changeover
const GAC_CHANGEOVER_HOUR_UTC = 21; // GAC resets 3h after the daily changeover

/* =========================================================
 GAC CONFIGURATION
  GAC runs on its OWN independent 28-day cycle.
  Based on user report: Aug 21 8:41am is Round 1 Attack, Week 2 of 5v5.
  Working backward with the 7-day structure: Week 1 Signup was Aug 11.
  ========================================================= */

const GAC_CYCLE_START_DATE = '2026-08-11'; // Day 1 (Signup) of the 5v5 season

/* =========================================================
 CLIENT UPDATE / DATACRON DROP CADENCE — EDIT ANCHOR IF CG
  SHIFTS THE PATCH DAY
  Generic client updates land every other Wednesday. Anchor is a
  known update Wednesday; the week of 2026-09-02 (Sat 5 Sep 2026)
  had an update, so 2026-09-02 anchors the 14-day cadence.
  Special-case Wednesdays (previous-era shipment shards once per
  era on the Wednesday of era week 2; datacron set the Wednesday
  of the week before each conquest) are derived in time.js — they
  also carry a client update (datacron weeks are off-cadence extras).
  ========================================================= */

const CLIENT_UPDATE_ANCHOR_DATE = '2026-09-02'; // a Wednesday with a client update

/* =========================================================
 DATACRON DROP ROTATION — each Wednesday-before-conquest drop
  adds the next color in this fixed order. Anchor: the 2026-08-26
  drop added the Blue set (previous drop Green, then Pink, then
  Orange, looping). Drops land on Episode Day 2, exactly one
  episode apart, so time.js steps the rotation by whole episodes
  from this anchor. If CG ever breaks the cadence, correct the
  anchor date/color here.
  ========================================================= */

const DATACRON_COLOR_ORDER = ['orange', 'pink', 'green', 'blue'];
const DATACRON_ANCHOR_DATE = '2026-08-26'; // a drop Wednesday that added…
const DATACRON_ANCHOR_COLOR = 'blue'; // …this color

/* =========================================================
 DATACRON SET CONFIGURATION — EDIT WHEN A NEW SET IS ANNOUNCED
  Datacron sets rotate through colors in a fixed order:
    Orange -> Pink -> Green -> Blue -> (repeats)
  A new set is introduced roughly every 28 days, but each individual
  set stays equippable longer than 28 days, so up to 4 sets can be
  active/overlapping at once. "expires" is the date (UTC) the set
  is removed. "added" is the drop Wednesday that introduced the set
  (drives the name on the "New Datacron Set Added" schedule card —
  drops with no matching entry fall back to the color). Set hasFDC:
  true for sets that add Fleet/Faction Datacrons (FDCs) on top of
  the normal set — adjust manually.
  ========================================================= */

const DATACRON_SETS = [
  { name: 'For Old Times',       color: 'orange', added: '2026-06-03', expires: '2026-09-03', hasFDC: false },
  { name: 'Necessary Means',     color: 'pink',   added: '2026-07-01', expires: '2026-10-01', hasFDC: false },
  { name: 'Supremacy Directive', color: 'green',  added: '2026-07-29', expires: '2026-10-29', hasFDC: true  },
  { name: 'Art of Command',      color: 'blue',   added: '2026-08-26', expires: '2026-11-26', hasFDC: false },
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
const ERA_UNIT_IMAGE = 'events/eraicon.png';

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
    1:  [ev('marquee_1'), ev('era_changeover','Era Changeover'), ev('tw_offense','Offense Phase Starts')],
    7:  [ev('rote','Phase 1 Starts'), ev('conquest_start','2nd Conquest of Volume Starts'), ev('smugglersrun',"Smuggler's Run I")],
    8:  [ev('era_challenge_1'), ev('journey_rerun_1','Journey Rerun 1: Maul Hate Fueled Starts'), ev('journey_rerun_2','Journey Rerun 2: Cassian Andor Undercover Starts'), ev('rote','Phase 2 Starts')],
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

/* =========================================================
 JUMP-TO-EVENT MENU — the only icons listed in the explorer's
  "Jump to event" dropdown: marquee events, journey guide
  unlocks, fleet masteries and Proving Grounds. A matcher ending
  in "_" matches a whole family (marquee_1..6); anything else
  must equal the icon exactly.
  ========================================================= */

const JUMP_EVENT_MATCHERS = [
  'marquee_',
  'journey_guide',
  'fleet_executor',
  'fleet_leviathan',
  'fleet_profundity',
  'proving_ground',
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
  update:   { label: 'UPDATE',   glyph: 'UPD', accent: 'var(--steel)',  dim: 'var(--steel-dim)',  border: 'var(--steel-border)' },
};

const CATEGORY_ICONS = {
  gac:      'events/gac.png',
  conquest: 'events/conquest.png',
  guild:    'events/tw.png',
  fleet:    'events/executor.png',
  era:      'events/eraicon.png',
  update:   'events/clientupdate.png',
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
  rote: 'tb/rise-of-the-empire.png',
  tb_ends: 'tb/rise-of-the-empire.png',
  smugglersrun: 'events/smugglersrun.png',
  gac_signup: 'events/gac.png',
  gac_defense: 'events/gac.png',
  gac_attack: 'events/gac.png',
  conquest_start: 'events/conquest.png',
  conquest_end: 'events/conquest.png',
  era_changeover: 'events/eraicon.png',
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
  journey_rerun_1: 'events/journeyrerun1.png',
  journey_rerun_2: 'events/journeyrerun2.png',
  journey_rerun_3: 'events/erajourney.png',
  journey_guide: 'events/erajourney.png',
  fleet_executor: 'events/executor.png',
  fleet_leviathan: 'events/leviathan.png',
  fleet_profundity: 'events/profundity.png',
  client_update: 'events/clientupdate.png',
  shipment_update: 'events/shipmentchange.png',
  datacron_set_orange: 'datacrons/datacron_orange.png',
  datacron_set_pink: 'datacrons/datacron_pink.png',
  datacron_set_green: 'datacrons/datacron_green.png',
  datacron_set_blue: 'datacrons/datacron_blue.png'
};

/* =========================================================
   TIME ENGINE
   ========================================================= */

const ERA_LENGTH_DAYS = 84;

const EPISODE_LENGTH_DAYS = 28;

/* Conquest runs Day 7-20 of each episode (14 days). Keep these two in
   sync with EPISODE_OVERRIDES labels ('conquest_start' / 'conquest_end'). */
const CONQUEST_START_DAY_IN_EP = 7;
const CONQUEST_END_DAY_IN_EP = 20;
const CONQUEST_DURATION_DAYS = 14;

/* Absolute era-days (1-based) within one ERA_LENGTH_DAYS cycle that the
   unlock cards count down to. 49 = Episode 2, day 21 (conquest-end /
   Proving Grounds day); 1 = Era Changeover day. If the conquest timing
   ever moves, update these alongside EPISODE_OVERRIDES. */
const CONQUEST_END_OFFSETS = [49];

const ERA_START_OFFSETS = [1];

/* Roster locks when a GAC defense phase starts. Conquest units unlock
   on a Monday and lock the following Wednesday (+2); era units arrive
   on a Tuesday and lock the next Wednesday (+1). Weekday-relative — if
   the unlock weekday ever shifts, adjust these, not render.js. */
const CONQUEST_ROSTER_LOCK_OFFSET_DAYS = 2;
const ERA_ROSTER_LOCK_OFFSET_DAYS = 1;

const TW_PHASE_LABELS = ['Signup', 'Defense', 'Attack'];

const TW_PHASE_ICONS = ['tw_signup', 'tw_defense', 'tw_offense'];

const GUILD_SUBLABEL = {
  tw_signup: 'TW', tw_defense: 'TW', tw_offense: 'TW', tw_payout: 'TW',
  rote: 'TB', tb_ends: 'TB',
  smugglersrun: 'SR'
};

/* =========================================================
 TERRITORY BATTLE ROTATION (Light / Dark sides alternate)
  A TB run starts on day 7 and day 21 of every episode (6 per
  era). The Light/Dark side flips every run, forever. Anchor:
  the run starting 2026-08-31 (Era day 35) is Light-side.
  Each run a guild picks 1 of 3: the side's two TBs + Rise of
  the Empire (a Neutral TB, selectable on either rotation).
  Hoth TBs + RotE run 6 phases x 24h. Separatist Might /
  Republic Offensive run 4 phases x 36h (same 6-day span); days
  whose 36h boundary falls at 06:00 show two cards (Phase X Ends
  + Phase Y Starts at that time).
  Art lives in assets/img/tb/ (kebab-case .png).
  ========================================================= */

const TB_SIDE_ANCHOR_DATE = '2026-08-31'; // Phase-1 day of a Light-side run
const TB_SIDE_ANCHOR_SIDE = 'light';
const TB_RUN_GAP_DAYS = 14;

const TB_DEFS = {
  rebel_assault:       { name: 'Hoth Rebel Assault',        short: 'Rebel Assault',       tag: 'Hoth', side: 'light',  tier: 'Hoth',    phases: 6, hoursPerPhase: 24, art: 'tb/hoth-rebel-assault.png' },
  imperial_retaliation:{ name: 'Hoth Imperial Retaliation', short: 'Imperial Retaliation',tag: 'Hoth', side: 'dark',   tier: 'Hoth',    phases: 6, hoursPerPhase: 24, art: 'tb/hoth-imperial-retaliation.png' },
  republic_offensive:  { name: 'Geonosis Republic Offensive', short: 'Republic Offensive',tag: 'Geo',  side: 'light',  tier: 'Geonosis',phases: 4, hoursPerPhase: 36, art: 'tb/geonosis-republic-offensive.png' },
  separatist_might:    { name: 'Geonosis Separatist Might', short: 'Separatist Might',    tag: 'Geo',  side: 'dark',   tier: 'Geonosis',phases: 4, hoursPerPhase: 36, art: 'tb/separatist-might.png' },
  rote:                { name: 'Rise of the Empire', short: 'Rise of the Empire', tag: 'ROTE', side: 'neutral', tier: 'Final', phases: 6, hoursPerPhase: 24, art: 'tb/rise-of-the-empire.png' },
};

const TB_CHOICE_STORAGE_KEY = 'swgoh-tb-choice';

/* =========================================================
 DISPLAY TIMEZONE
  Game logic (changeovers, cycles) always runs on UTC. This only
  controls how dates/times are rendered. 'local' (device default)
  unless the user picks a zone; persisted in localStorage.
  ========================================================= */

const TZ_STORAGE_KEY = 'swgoh-tz';

const TIMEZONE_OPTIONS = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

/* Manual UTC offsets for zones not listed above (30-minute steps
   plus the :45 zones). Values look like 'UTC+05:30'. Changeovers
   still happen at one absolute moment (18:00 UTC) for everyone —
   an offset only re-labels that moment, e.g. 18:00 UTC = 23:30
   at UTC+05:30 on the same calendar day. */
const UTC_OFFSET_OPTIONS = (() => {
  const fmt = mins => 'UTC' + (mins < 0 ? '-' : '+') + String(Math.floor(Math.abs(mins) / 60)).padStart(2, '0') + ':' + String(Math.abs(mins) % 60).padStart(2, '0');
  const minutes = [];
  for(let m = -12 * 60; m <= 14 * 60; m += 30) minutes.push(m);
  [5 * 60 + 45, 8 * 60 + 45, 12 * 60 + 45, 13 * 60 + 45].forEach(m => { if(!minutes.includes(m)) minutes.push(m); });
  return minutes.sort((a, b) => a - b).map(fmt);
})();
