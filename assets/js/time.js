/* TIME ENGINE — pure date/math helpers. Depends on config.js globals. No DOM. */

/* Positive modulo: JS % keeps the sign of the dividend, which breaks
   day math for pre-era / pre-season timestamps. posMod always wraps
   into [0, m). */
function posMod(n, m){
  return ((n % m) + m) % m;
}

function parseDateOnlyMs(value){
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const [year, month, day] = value.split('-').map(Number);
  const dateMs = Date.UTC(year, month - 1, day);
  const date = new Date(dateMs);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? dateMs : NaN;
}

/* Config accessors with safe fallbacks so a missing / mistyped config
   key degrades to the long-standing defaults instead of NaN-poisoning
   every date on the page. */
function stdHour(){
  return (typeof STD_CHANGEOVER_HOUR_UTC !== 'undefined'
    && Number.isInteger(STD_CHANGEOVER_HOUR_UTC)
    && STD_CHANGEOVER_HOUR_UTC >= 0 && STD_CHANGEOVER_HOUR_UTC < 24)
    ? STD_CHANGEOVER_HOUR_UTC : 18;
}

function gacHour(){
  return (typeof GAC_CHANGEOVER_HOUR_UTC !== 'undefined'
    && Number.isInteger(GAC_CHANGEOVER_HOUR_UTC)
    && GAC_CHANGEOVER_HOUR_UTC >= 0 && GAC_CHANGEOVER_HOUR_UTC < 24)
    ? GAC_CHANGEOVER_HOUR_UTC : 21;
}

function conquestStartDay(){
  return (typeof CONQUEST_START_DAY_IN_EP !== 'undefined') ? CONQUEST_START_DAY_IN_EP : 7;
}

function conquestEndDay(){
  return (typeof CONQUEST_END_DAY_IN_EP !== 'undefined') ? CONQUEST_END_DAY_IN_EP : 20;
}

function conquestLockOffsetDays(){
  return (typeof CONQUEST_ROSTER_LOCK_OFFSET_DAYS !== 'undefined'
    && Number.isInteger(CONQUEST_ROSTER_LOCK_OFFSET_DAYS)
    && CONQUEST_ROSTER_LOCK_OFFSET_DAYS >= 0)
    ? CONQUEST_ROSTER_LOCK_OFFSET_DAYS : 2;
}

function eraLockOffsetDays(){
  return (typeof ERA_ROSTER_LOCK_OFFSET_DAYS !== 'undefined'
    && Number.isInteger(ERA_ROSTER_LOCK_OFFSET_DAYS)
    && ERA_ROSTER_LOCK_OFFSET_DAYS >= 0)
    ? ERA_ROSTER_LOCK_OFFSET_DAYS : 1;
}

function getMonthlyEvents(dateMs){
  if(typeof MONTHLY_EVENTS === 'undefined' || !MONTHLY_EVENTS) return [];
  const d = new Date(dateMs);
  const dom = d.getUTCDate();
  const lastDom = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return MONTHLY_EVENTS
    .filter(m => m.lastDayOfMonth ? dom === lastDom : dom === m.dayOfMonth)
    .map(m => ev(m.icon, m.label));
}

/* =========================================================
 GAC CYCLE (7-Day Setup)
  Day 1 (Tue): Signup
  Day 2 (Wed): R1 Defense
  Day 3 (Thu): R1 Offense
  Day 4 (Fri): R2 Defense
  Day 5 (Sat): R2 Offense
  Day 6 (Sun): R3 Defense
  Day 7 (Mon): R3 Offense
  ========================================================= */

function gacInfoForTimestamp(timestampMs){
  const [gy, gm, gd] = (typeof GAC_CYCLE_START_DATE !== 'undefined' ? GAC_CYCLE_START_DATE : '').split('-').map(Number);
  const gacStartMs = Date.UTC(gy, gm - 1, gd, gacHour(), 0, 0);
  if(!Number.isFinite(gacStartMs) || !Number.isFinite(timestampMs)){
    return { cycleDay: 1, cycleNum: 0, format: '5v5', rawDays: 0 };
  }
  const diffMs = timestampMs - gacStartMs;

  const rawDays = Math.floor(diffMs / 86400000);
  const cycleDay = posMod(rawDays, 28) + 1;
  const cycleNum = Math.floor(rawDays / 28);

  const format = (posMod(cycleNum, 2) === 0) ? '5v5' : '3v3';
  return { cycleDay, cycleNum, format, rawDays };
}

function gacInfoForDate(dateMs){
  return gacInfoForTimestamp(dateMs + (gacHour() * 3600000));
}

function getGacRoundInfo(cycleDay){
  const week = Math.ceil(cycleDay / 7);
  const dayInWeek = ((cycleDay - 1) % 7) + 1;

  if (week > 3) return { phase: 'off', round: null, week: null };

  if (dayInWeek === 1) return { phase: 'signup', round: null, week };
  if (dayInWeek === 2) return { phase: 'defense', round: 1, week };
  if (dayInWeek === 3) return { phase: 'offense', round: 1, week };
  if (dayInWeek === 4) return { phase: 'defense', round: 2, week };
  if (dayInWeek === 5) return { phase: 'offense', round: 2, week };
  if (dayInWeek === 6) return { phase: 'defense', round: 3, week };
  if (dayInWeek === 7) return { phase: 'offense', round: 3, week };
  
  return { phase: 'off', round: null, week: null };
}

function gacEventsForDate(dateMs){
  const info = gacInfoForDate(dateMs);
  const rnd = getGacRoundInfo(info.cycleDay);
  
  if (rnd.week && rnd.week <= 3) {
    // Signup opens Tuesday; rosters lock when Round 1 defense starts Wednesday.
    if (rnd.phase === 'signup') return [ev('gac_signup', `GAC Week ${rnd.week} Signup`)];
    if (rnd.phase === 'defense' && rnd.round === 1) return [ev('gac_defense', `GAC Round 1 Defense & Roster Lock (Week ${rnd.week})`)];
    if (rnd.phase === 'defense') return [ev('gac_defense', `GAC Round ${rnd.round} Defense (Week ${rnd.week})`)];
    if (rnd.phase === 'offense') return [ev('gac_attack', `GAC Round ${rnd.round} Attack (Week ${rnd.week})`)];
  }
  return [];
}

function assetFor(icon){
  const cat = categoryFor(icon);
  return EVENT_ICONS[icon] || CATEGORY_ICONS[cat] || null;
}

function categoryFor(icon){
  if(icon.startsWith('gac')) return 'gac';
  if(icon.startsWith('conquest') || icon === 'proving_ground') return 'conquest';
  if(icon.startsWith('tw') || icon === 'rote' || icon === 'tb_ends' || icon === 'smugglersrun') return 'guild';
  if(icon.startsWith('fleet')) return 'fleet';
  return 'era'; 
}

/* Card tag: per-event override when the display name differs from the
   owning category, otherwise the category label/glyph. */
function tagFor(icon){
  const override = (typeof TAG_OVERRIDES !== 'undefined' && TAG_OVERRIDES[icon]) || null;
  if(override) return override;
  const meta = CATEGORY_META[categoryFor(icon)];
  return { label: meta.label, glyph: meta.glyph };
}

/* =========================================================
 TERRITORY BATTLE ROTATION + GUILD CHOICE
  Side flips every TB run (runs start day 7 & 21 of each
  episode, 14 days apart). Parity is anchored to a known
  Light-side run; TB_SIDE_ANCHOR_SIDE='light' so even
  instance indexes are Light. The guild's pick (1 of the
  side's 2 TBs + Rise of the Empire) persists in
  localStorage and defaults to Rise of the Empire.
  ========================================================= */

function tbOptionsForSide(side){
  const ids = side === 'dark'
    ? ['imperial_retaliation', 'separatist_might', 'rote']
    : ['rebel_assault', 'republic_offensive', 'rote'];
  return ids.map(id => ({ id, ...TB_DEFS[id] }));
}

function tbSideForPhase1(phase1Ms){
  const anchor = parseDateOnlyMs(typeof TB_SIDE_ANCHOR_DATE !== 'undefined' ? TB_SIDE_ANCHOR_DATE : null);
  const idx = Math.round((phase1Ms - anchor) / (TB_RUN_GAP_DAYS * 86400000));
  const even = (((idx % 2) + 2) % 2) === 0;
  if(TB_SIDE_ANCHOR_SIDE === 'light') return even ? 'light' : 'dark';
  return even ? 'dark' : 'light';
}

/* Phase-1 day-in-episode for the run containing dayInEp (7 or
   21), or null outside a run (runs span day 7-13 & 21-27). */
function tbPhase1DayInEp(dayInEp){
  if(dayInEp >= 7 && dayInEp <= 13) return 7;
  if(dayInEp >= 21 && dayInEp <= 27) return 21;
  return null;
}

function tbRunContext(dateMs, episode, dayInEp){
  const p1 = tbPhase1DayInEp(dayInEp);
  if(p1 == null) return null;
  const phase1Ms = dateMs - ((dayInEp - p1) * 86400000);
  const side = tbSideForPhase1(phase1Ms);
  return { phase1Ms, side, options: tbOptionsForSide(side), offset: dayInEp - p1 };
}

function tbChoiceKeyForSide(side){
  return `${TB_CHOICE_STORAGE_KEY}-${side}`;
}

/* Per-side memory: each rotation side remembers its own guild pick,
   so changing the Dark pick on a future day never disturbs the
   active Light run (and vice versa). Falls back to the legacy
   global key once (migrating it), then to Rise of the Empire. */
function tbStoredChoiceId(side){
  const ids = side ? tbOptionsForSide(side).map(o => o.id) : Object.keys(TB_DEFS);
  const valid = v => v && TB_DEFS[v] && ids.includes(v);
  try {
    if(side){
      const v = localStorage.getItem(tbChoiceKeyForSide(side));
      if(valid(v)) return v;
    }
    const legacy = localStorage.getItem(TB_CHOICE_STORAGE_KEY);
    if(valid(legacy)){
      if(side){ try { localStorage.setItem(tbChoiceKeyForSide(side), legacy); } catch(e){} }
      return legacy;
    }
  } catch(e){}
  return null;
}

function tbChoiceForRun(runCtx){
  if(!runCtx) return { id: 'rote', ...TB_DEFS.rote };
  const stored = tbStoredChoiceId(runCtx.side);
  if(stored) return { id: stored, ...TB_DEFS[stored] };
  return { id: 'rote', ...TB_DEFS.rote };
}

function tbSetChoice(id, side){
  if(!TB_DEFS[id]) return false;
  try {
    if(side === 'light' || side === 'dark'){
      if(!tbOptionsForSide(side).some(o => o.id === id)) return false;
      localStorage.setItem(tbChoiceKeyForSide(side), id);
    } else {
      localStorage.setItem(TB_CHOICE_STORAGE_KEY, id);
    }
  } catch(e){}
  return true;
}

/* Phase index (1-based) + whether a new phase starts at this
   day's 18:00 UTC marker. offset 0-5 across the 6-day run.
   24h TBs start a phase daily; 36h TBs start one every 1.5
   days (offsets 1 and 4 continue the current phase). */
function tbPhaseAtOffset(def, offset){
  if(def.hoursPerPhase === 24) return { phase: offset + 1, starts: true };
  const phase = Math.min(def.phases, Math.floor((24 * offset) / def.hoursPerPhase) + 1);
  const prev = offset === 0 ? 0 : Math.min(def.phases, Math.floor((24 * (offset - 1)) / def.hoursPerPhase) + 1);
  return { phase, starts: offset === 0 || phase !== prev };
}

function tbPhaseLabel(def, offset){
  const { phase, starts } = tbPhaseAtOffset(def, offset);
  return `${def.name} Phase ${phase} ${starts ? 'Starts' : 'Continues'}`;
}

/* Exact window of a tier-2 (36h) phase. phase1Ms is midnight UTC of
   the Phase-1 day; the run opens 18:00 that day. idx is 0-based,
   so mid-phase markers render the true span (e.g. Wed 06:00 →
   Thu 18:00) instead of implying a changeover at 18:00. */
function tbPhaseWindow(def, phase1Ms, idx){
  const startMs = phase1Ms + (stdHour() * 3600000) + (idx * def.hoursPerPhase * 3600000);
  return { startMs, endMs: startMs + (def.hoursPerPhase * 3600000) };
}

function fmtPhaseMoment(ms){
  const d = new Date(dms(ms));
  const zone = tz();
  const date = withOrdinal(d.toLocaleDateString('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }));
  const time = d.toLocaleTimeString('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} ${time}`;
}

/* Rewrite the static rote/tb_ends labels for the run's guild
   choice. Non-TB days pass through untouched. On 36h TBs, a day
   whose phase boundary falls at 06:00 emits two cards — the old
   phase ending and the new phase starting at that time — instead
   of one confusing 18:00 marker. */
function applyTbLabels(items, runCtx){
  if(!runCtx) return items;
  const def = tbChoiceForRun(runCtx);
  return items.flatMap(it => {
    if(it.icon === 'rote' && def.hoursPerPhase === 36 && runCtx.offset > 0){
      const { phase } = tbPhaseAtOffset(def, runCtx.offset);
      // Moment the current phase began (= previous phase ended).
      const transMs = runCtx.phase1Ms + (stdHour() * 3600000) + ((phase - 1) * def.hoursPerPhase * 3600000);
      if(new Date(transMs).getUTCHours() === 6 && phase > 1){
        return [
          { icon: it.icon, label: `${def.name} Phase ${phase - 1} Ends`, tbEndMoment: transMs },
          { icon: it.icon, label: `${def.name} Phase ${phase} Starts` },
        ];
      }
      return [{ icon: it.icon, label: tbPhaseLabel(def, runCtx.offset) }];
    }
    if(it.icon === 'rote') return [{ icon: it.icon, label: tbPhaseLabel(def, runCtx.offset) }];
    if(it.icon === 'tb_ends') return [{ icon: it.icon, label: `${def.name} Ends` }];
    return [it];
  });
}

/* nowMsInput is an optional override (used by tests). When omitted the
   live clock is used. preEra is true before the era's first changeover;
   the hero clamps to Day 1 but surfaces daysUntilEra so the UI can say
   "starts in N days" instead of pretending Day 1 is live. */
function getGameStatus(nowMsInput){
  const nowMs = (typeof nowMsInput === 'number' && Number.isFinite(nowMsInput))
    ? nowMsInput
    : new Date().getTime();
  const msPerDay = 86400000;

  const configuredEraStartMs = parseDateOnlyMs(typeof ERA_START_DATE !== 'undefined' ? ERA_START_DATE : null);
  const eraStartMs = Number.isFinite(configuredEraStartMs)
    ? configuredEraStartMs : Date.UTC(2026, 6, 28);
  const eraStartDate = new Date(eraStartMs);
  const y = eraStartDate.getUTCFullYear();
  const m = eraStartDate.getUTCMonth() + 1;
  const d = eraStartDate.getUTCDate();

  // 1) Standard Event Changeover (STD_CHANGEOVER_HOUR_UTC)
  const stdStartMs = Date.UTC(y, m - 1, d, stdHour(), 0, 0);
  const diffMs = nowMs - stdStartMs;
  const preEra = diffMs < 0;
  let rawDayIndex = Math.floor(diffMs / msPerDay) + 1;
  if(preEra) rawDayIndex = 1;

  // Calendar days from today until the era's first calendar day (0 =
  // it starts today at the changeover). Wall-clock ceil() would say "2
  // days" 30 hours out, which reads wrong — calendar math matches how
  // players talk about reset days.
  let daysUntilEra = 0;
  if(preEra){
    const nd = new Date(nowMs);
    const startOfToday = Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate());
    daysUntilEra = Math.max(0, Math.round((Date.UTC(y, m - 1, d) - startOfToday) / msPerDay));
  }

  const eraDay = posMod(rawDayIndex - 1, ERA_LENGTH_DAYS) + 1;
  const cycleNum = Math.floor((rawDayIndex - 1) / ERA_LENGTH_DAYS);

  const episode = Math.floor((eraDay - 1) / EPISODE_LENGTH_DAYS) + 1;
  const dayInEp = posMod(eraDay - 1, EPISODE_LENGTH_DAYS) + 1;
  const week = Math.floor((dayInEp - 1) / 7) + 1;

  // Active Calendar Day associated with current changeover.
  // Weekday is rendered in the display timezone (game-day model stays UTC).
  const currentDayStartMs = Date.UTC(y, m - 1, d, 0, 0, 0) + ((rawDayIndex - 1) * msPerDay);
  const activeDayParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz(), weekday: 'long'
  }).formatToParts(new Date(dms(currentDayStartMs + (stdHour() * 3600000))));
  const weekdayName = activeDayParts.find(p => p.type === 'weekday').value;

  // 2) GAC Cycle — independent 28-day cycle, own reference date, own changeover.
  // Use the live timestamp so GAC remains on the previous phase between the
  // daily era reset and its own later reset.
  const gacInfo = gacInfoForTimestamp(nowMs);

  return {
    nowMs,
    rawDayIndex,
    bossDayIndex: rawDayIndex,
    bossEraDay: eraDay,
    eraDay,
    episode,
    dayInEp,
    week,
    weekdayName,
    preEra,
    daysUntilEra,
    currentEraStartMs: Date.UTC(y, m - 1, d, 0, 0, 0) + (cycleNum * ERA_LENGTH_DAYS * msPerDay),
    eraBaseStartMs: Date.UTC(y, m - 1, d, 0, 0, 0),
    currentDayStartMs,
    cycleNum,
    gacCycleDay: gacInfo.cycleDay,
    gacFormat: gacInfo.format
  };
}

/* =========================================================
   UNLOCK WINDOW MATH
   ========================================================= */

function nextOccurrenceAbs(offsetsInCycle, fromAbsDay, cycleLen){
  // Guard: an empty offset list used to spin forever. Return the input
  // day so callers degrade to "today" instead of hanging the page.
  if(!Array.isArray(offsetsInCycle) || offsetsInCycle.length === 0) return fromAbsDay;
  if(!Number.isFinite(cycleLen) || cycleLen <= 0) return fromAbsDay;
  const sorted = offsetsInCycle
    .filter(offset => Number.isInteger(offset) && offset >= 1 && offset <= cycleLen)
    .sort((a, b) => a - b);
  if(!sorted.length) return fromAbsDay;
  let k = Math.floor((fromAbsDay - 1) / cycleLen);
  while(true){
    for(const o of sorted){
      const abs = k * cycleLen + o;
      if(abs >= fromAbsDay) return abs;
    }
    k++;
  }
}

function absDayToInfo(absDay, eraBaseStartMs){
  const eraDay = posMod(absDay - 1, ERA_LENGTH_DAYS) + 1;
  const episode = Math.floor((eraDay - 1) / EPISODE_LENGTH_DAYS) + 1;
  const dayInEp = posMod(eraDay - 1, EPISODE_LENGTH_DAYS) + 1;
  const week = Math.floor((dayInEp - 1) / 7) + 1;
  const dateMs = eraBaseStartMs + (absDay - 1) * 86400000;
  return { eraDay, episode, dayInEp, week, dateMs };
}

function dateMsToEraInfo(dateMs, eraBaseStartMs){
  const absDay = Math.floor((dateMs - eraBaseStartMs) / 86400000) + 1;
  return absDayToInfo(absDay, eraBaseStartMs);
}

/* =========================================================
   DATACRON EXPIRATION HELPERS
   ========================================================= */

// Returns the datacron set that is next/currently expiring (soonest
// expires date that hasn't passed yet). Falls back to the last set
// in the config if every set's expiration has already passed —
// update DATACRON_SETS with the next set(s) when that happens.
// Returns null when no sets are configured. The result carries an
// allExpired flag so the UI can show EXPIRED instead of a stale set.
function getCurrentDatacronSet(nowMs){
  if(typeof DATACRON_SETS === 'undefined' || !Array.isArray(DATACRON_SETS) || DATACRON_SETS.length === 0) return null;
  const withMs = DATACRON_SETS.filter(s => s && typeof s.expires === 'string').map(s => ({
    ...s,
    expiresMs: parseDateOnlyMs(s.expires) + (stdHour() * 3600000)
  })).filter(s => Number.isFinite(s.expiresMs)).sort((a, b) => a.expiresMs - b.expiresMs);

  if(!withMs.length) return null;

  const upcoming = withMs.find(s => s.expiresMs >= nowMs);
  if(upcoming) return { ...upcoming, allExpired: false };
  return { ...withMs[withMs.length - 1], allExpired: true };
}

// A datacron set can only ever be equipped/used for Territory War and
// GAC — never Territory Battle, Conquest, etc. This finds the most recent
// usable event for each mode independently because TW and GAC can end at
// different times.
function getLastUsableGuildEvent(expiresMs, eraBaseStartMs){
  const firstAbsDay = Math.floor((expiresMs - eraBaseStartMs) / 86400000) + 1;
  const lastUsable = { tw: null, gac: null };
  for(let offset = -ERA_LENGTH_DAYS; offset <= 1; offset++){
    const absDay = firstAbsDay + offset;
    const info = absDayToInfo(absDay, eraBaseStartMs);
    const dayStartMs = eraBaseStartMs + ((absDay - 1) * 86400000);
    const items = getEventsForDay(dayStartMs, info.episode, info.dayInEp);
    items.forEach(item => {
      if(!item.icon.startsWith('tw_') && !item.icon.startsWith('gac_')) return;
      const startHour = item.icon.startsWith('gac_') ? gacHour() : stdHour();
      const itemStartMs = dayStartMs + (startHour * 3600000);
      let usableFromMs = itemStartMs;

      if(item.icon.endsWith('_attack') || item.icon.endsWith('_offense')){
        const previousDayMs = dayStartMs - 86400000;
        const previousInfo = absDayToInfo(absDay - 1, eraBaseStartMs);
        const previousItems = getEventsForDay(previousDayMs, previousInfo.episode, previousInfo.dayInEp);
        const defense = previousItems.find(previousItem =>
          previousItem.icon === item.icon.replace(/_(attack|offense)$/, '_defense')
        );
        if(defense){
          const defenseHour = defense.icon.startsWith('gac_') ? gacHour() : stdHour();
          usableFromMs = previousDayMs + (defenseHour * 3600000);
        }
      }

      const mode = item.icon.startsWith('tw_') ? 'tw' : 'gac';
      if(usableFromMs < expiresMs && (!lastUsable[mode] || itemStartMs > lastUsable[mode].startMs)){
        lastUsable[mode] = {
          item,
          dateMs: dayStartMs,
          startMs: itemStartMs,
        };
      }
    });
  }
  return lastUsable.tw || lastUsable.gac ? lastUsable : null;
}

function getDayEvents(episode, dayInEp){
  const o = EPISODE_OVERRIDES[episode] && EPISODE_OVERRIDES[episode][dayInEp];
  return o || COMMON_DAYS[dayInEp] || [];
}

function getEventsForDay(dateMs, episode, dayInEp){
  const runCtx = tbRunContext(dateMs, episode, dayInEp);
  return applyTbLabels([...getDayEvents(episode, dayInEp), ...gacEventsForDate(dateMs), ...getMonthlyEvents(dateMs)], runCtx);
}

function ordinal(n){
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* "Monday 2 September" → "Monday 2nd September". Only touches a 1–2
   digit day directly before a month name; counts ("14 days") and years
   are left alone. */
const MONTH_RE = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Sept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
function withOrdinal(str){
  return str.replace(new RegExp(`\\b(\\d{1,2})(?= ${MONTH_RE}\\b)`, 'g'), m => ordinal(Number(m)));
}

/* =========================================================
 DISPLAY TIMEZONE
  Game logic (changeovers, cycles) always runs on UTC — this only
  controls how dates/times are rendered. Defaults to the device's
  timezone; the user can pin UTC (or another zone) via the header
  picker. Persisted in localStorage.
  ========================================================= */

function deviceTimeZone(){
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch(e){ return 'UTC'; }
}

function validTimeZone(z){
  try { new Intl.DateTimeFormat('en-GB', { timeZone: z }); return true; }
  catch(e){ return false; }
}

/* Stored setting: 'local' (default), an IANA zone, or a manual
   offset like 'UTC+05:30'. Offsets are validated to real-world
   range (-12:00 to +14:00, :00/:15/:30/:45 minutes). */
function tzOffsetMinutes(v){
  const m = /^UTC([+-])(\d{2}):(\d{2})$/.exec(v || '');
  if(!m) return null;
  const mins = parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  if(parseInt(m[2], 10) > 14 || ![0, 15, 30, 45].includes(parseInt(m[3], 10))) return null;
  const total = m[1] === '-' ? -mins : mins;
  if(total < -12 * 60 || total > 14 * 60) return null;
  return total;
}

function getTimeZoneSetting(){
  try {
    const v = localStorage.getItem(TZ_STORAGE_KEY);
    if(!v || v === 'local') return 'local';
    if(tzOffsetMinutes(v) != null) return v;
    if(validTimeZone(v)) return v;
  } catch(e){}
  return 'local';
}

/* Resolved IANA zone used by every display formatter. Manual
   offsets render through UTC (see dms below). */
function tz(){
  const s = getTimeZoneSetting();
  if(s === 'local'){
    const dz = deviceTimeZone();
    return validTimeZone(dz) ? dz : 'UTC';
  }
  if(tzOffsetMinutes(s) != null) return 'UTC';
  return s;
}

/* Display instant: manual offsets shift the moment so formatting it
   in UTC yields the offset wall-clock. One absolute changeover
   (18:00 UTC) for everyone — only the label moves. */
function dms(ms){
  const s = getTimeZoneSetting();
  const off = tzOffsetMinutes(s);
  return off != null ? ms + (off * 60000) : ms;
}

function tzDisplayName(){
  const s = getTimeZoneSetting();
  if(s === 'local') return `local time (${tz()})`;
  return s === 'UTC' ? 'UTC (game time)' : s;
}

function setTimeZone(v){
  if(v !== 'local' && tzOffsetMinutes(v) == null && !validTimeZone(v)) return false;
  try { localStorage.setItem(TZ_STORAGE_KEY, v); } catch(e){}
  return true;
}

/* Weekday-short + day-number of an instant in the display zone
   (for the explorer day pills). */
function tzDayParts(ms){
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz(), weekday: 'short', day: 'numeric' }).formatToParts(new Date(dms(ms)));
  let dow = '', num = '';
  for(const p of parts){
    if(p.type === 'weekday') dow = p.value;
    if(p.type === 'day') num = p.value;
  }
  return { dow, num };
}

function fmtDateUTC(ms){
  const d = new Date(dms(ms));
  return withOrdinal(d.toLocaleDateString('en-GB', { timeZone: tz(), weekday: 'short', day: 'numeric', month: 'short' }));
}

function fmtDateLongUTC(ms){
  const d = new Date(dms(ms));
  return withOrdinal(d.toLocaleDateString('en-GB', { timeZone: tz(), weekday: 'long', day: 'numeric', month: 'long' }));
}

function fmtDayMonthUTC(ms){
  const d = new Date(dms(ms));
  return withOrdinal(d.toLocaleDateString('en-GB', { timeZone: tz(), day: 'numeric', month: 'short' }));
}

/* Relative day label vs the active (today) changeover day */
function relativeDayLabel(diffDays){
  if(diffDays === 0) return 'Now';
  if(diffDays === 1) return 'In 1 day';
  if(diffDays === -1) return 'Yesterday';
  if(diffDays > 1) return `In ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}

/* How long a changeover marker lasts. GAC/TW phases and TB phases run
  24 hours until the next 18:00 UTC changeover; Conquest runs Day 7→20
  (14 days); Journey Rerun 1 lasts one week and Journey Rerun 2 lasts one month. */
const DAY_LONG_EVENTS = new Set([
  'gac_signup', 'gac_defense', 'gac_attack',
  'tw_signup', 'tw_defense', 'tw_offense',
  'rote', 'smugglersrun'
]);

function eventDateRangeLabel(item, dateMs, tbCtx){
  if(item.icon === 'conquest_start'){
    const dur = (typeof CONQUEST_DURATION_DAYS !== 'undefined') ? CONQUEST_DURATION_DAYS : 14;
    const endMs = dateMs + ((dur - 1) * 86400000);
    return `${fmtDayMonthUTC(dateMs)} → ${fmtDayMonthUTC(endMs)} · ${dur} days`;
  }
  const start = fmtDateLongUTC(dateMs);
  if(item.icon === 'journey_rerun_1'){
    const endMs = dateMs + (6 * 86400000);
    return `${fmtDayMonthUTC(dateMs)} → ${fmtDayMonthUTC(endMs)} · 7 days`;
  }
  if(item.icon === 'journey_rerun_2'){
    const endMs = new Date(dateMs);
    const originalDay = endMs.getUTCDate();
    endMs.setUTCDate(1);
    endMs.setUTCMonth(endMs.getUTCMonth() + 1);
    const daysInEndMonth = new Date(Date.UTC(endMs.getUTCFullYear(), endMs.getUTCMonth() + 1, 0)).getUTCDate();
    endMs.setUTCDate(Math.min(originalDay, daysInEndMonth));
    return `${fmtDayMonthUTC(dateMs)} → ${fmtDayMonthUTC(endMs.getTime())} · 1 month`;
  }
  // 36-hour TB phases (Separatist Might / Republic Offensive): phase
  // boundaries fall at 18:00 and 06:00 alternating, so mid-phase
  // markers render the phase's exact window instead of implying a
  // changeover at 18:00.
  if(item.icon === 'rote' && tbCtx && tbCtx.def.hoursPerPhase === 36 && tbCtx.phase1Ms != null){
    // Mid-day boundary card: the old phase ends at an exact moment.
    if(item.tbEndMoment != null) return fmtPhaseMoment(item.tbEndMoment);
    const { phase } = tbPhaseAtOffset(tbCtx.def, tbCtx.offset);
    const w = tbPhaseWindow(tbCtx.def, tbCtx.phase1Ms, phase - 1);
    return `${fmtPhaseMoment(w.startMs)} → ${fmtPhaseMoment(w.endMs)} · 36 hours`;
  }
  return DAY_LONG_EVENTS.has(item.icon) ? `${start} · 24 hours` : start;
}

function getGacStatus(st){
  const format = st.gacFormat;
  const nextFormat = format === '5v5' ? '3v3' : '5v5';
  const info = getGacRoundInfo(st.gacCycleDay);

  if(info.phase === 'off'){
     const daysUntilNext = 29 - st.gacCycleDay;
     const untilPhrase = daysUntilNext === 1 ? 'in 1 day' : `in ${daysUntilNext} days`;
     return {
        status: 'OFF-WEEK',
        badgeClass: 'off',
        title: `Grand Arena (${format})`,
        main: 'Post-Season Off Week',
        sub: `Next Signup opens ${untilPhrase} (${nextFormat})`,
        round: null,
        roundPhase: null
     };
  }

  const untilPhrase = 'in 1 day'; 

  if(info.phase === 'signup'){
    return {
      status: `WEEK ${info.week} · SIGNUP`,
      badgeClass: 'red',
      title: `Grand Arena (${format})`,
      main: `Week ${info.week} Signup Phase Open`,
      sub: `Roster locks and Defense Phase starts ${untilPhrase}`,
      round: null,
      roundPhase: null
    };
  }

  if(info.phase === 'defense'){
    return {
      status: `WEEK ${info.week} · ROUND ${info.round} DEFENSE`,
      badgeClass: 'red',
      title: `Grand Arena (${format})`,
      main: `Round ${info.round} of 3 — Defense Phase`,
      sub: info.round === 1
        ? `Roster lock-in · Round 1 Attack Phase begins ${untilPhrase}`
        : `Round ${info.round} Attack Phase begins ${untilPhrase}`,
      round: info.round,
      roundPhase: 'defense'
    };
  }

  if(info.phase === 'offense'){
    const isLastRound = info.round === 3;
    const subStr = isLastRound 
       ? (info.week === 3 ? `Season ends ${untilPhrase}!` : `Week ${info.week} ends ${untilPhrase}`)
       : `Round ${info.round + 1} Defense Phase begins ${untilPhrase}`;
    return {
      status: `WEEK ${info.week} · ROUND ${info.round} ATTACK`,
      badgeClass: 'red',
      title: `Grand Arena (${format})`,
      main: `Round ${info.round} of 3 — Attack Phase`,
      sub: subStr,
      round: info.round,
      roundPhase: 'offense'
    };
  }
}

/* Conquest info for any explorer day (not just today). Returns null
   when no run is active that day. Runs span day 7-20 of each episode
   (14 days); Ep 1 = Chapter 2, Ep 2 = Chapter 3 (Final),
   Ep 3 = Chapter 1 of a new Volume. */
/* Episode → conquest chapter. Ep 1 = 2nd of volume, Ep 2 = 3rd (final),
   Ep 3 = 1st of a new volume. Single source of truth for the dashboard,
   the explorer badge and the unlock-card title. */
function conquestChapterForEpisode(episode){
  if(episode === 1) return { cNum: 2, note: 'Event 2 of Volume' };
  if(episode === 2) return { cNum: 3, note: 'Event 3 of Volume (Final)' };
  return { cNum: 1, note: 'Event 1 of New Volume' };
}

function conquestOrdinal(cNum){
  return cNum === 1 ? '1st' : cNum === 2 ? '2nd' : cNum === 3 ? '3rd' : `${cNum}th`;
}

function conquestInfoForDay(episode, dayInEp){
  const start = conquestStartDay(), end = conquestEndDay();
  if(dayInEp < start || dayInEp > end) return null;
  const { cNum, note } = conquestChapterForEpisode(episode);
  const total = (typeof CONQUEST_DURATION_DAYS !== 'undefined') ? CONQUEST_DURATION_DAYS : (end - start + 1);
  return { active: true, day: dayInEp - start + 1, total, cNum, note, finalDay: dayInEp === end };
}

function getConquestStatus(st){
  const start = conquestStartDay(), end = conquestEndDay();
  const total = (typeof CONQUEST_DURATION_DAYS !== 'undefined') ? CONQUEST_DURATION_DAYS : (end - start + 1);
  const episodeCount = Math.ceil(ERA_LENGTH_DAYS / EPISODE_LENGTH_DAYS);
  let targetEp = st.episode;
  let targetDay = st.dayInEp;
  let isUpcomingNextEp = false;

  // If we are past the Proving Grounds day, the current episode's
  // conquest is over. Point the dashboard at the NEXT episode's run.
  const overDay = end + 1;
  if (targetDay > overDay) {
    targetEp = targetEp >= episodeCount ? 1 : targetEp + 1;
    isUpcomingNextEp = true;
  }

  // Map the Episode to the correct Conquest Chapter Number
  const { cNum, note: titleNote } = conquestChapterForEpisode(targetEp);

  if (isUpcomingNextEp) {
    const daysUntil = (EPISODE_LENGTH_DAYS - st.dayInEp) + start;
    return {
      status: 'UPCOMING', badgeClass: 'purple', title: titleNote,
      main: `Starts in ${daysUntil} days`,
      sub: `Conquest Run ${cNum} will begin.`,
      cNum: cNum
    };
  } else if (targetDay < start) {
    return {
      status: 'UPCOMING', badgeClass: 'purple', title: titleNote,
      main: `Starts in ${start - targetDay} days`,
      sub: `Event ${cNum} Starts`,
      cNum: cNum
    };
  } else if (targetDay >= start && targetDay <= end) {
    const cqDay = targetDay - start + 1;
    const remaining = end - targetDay;
    return {
      status: remaining === 0 ? 'FINAL DAY' : 'ACTIVE',
      badgeClass: 'purple', title: titleNote,
      main: `Conquest Day ${cqDay} of ${total}`,
      sub: remaining === 0 ? 'Proving Grounds starts in 1 day' : `Ends in ${remaining} days`,
      cNum: cNum
    };
  } else if (targetDay === overDay) {
    return {
      status: 'EVENT OVER', badgeClass: 'purple', title: titleNote,
      main: 'Proving Grounds Active',
      sub: 'Conquest has ended! Unit is now claimable.',
      cNum: cNum
    };
  }
}

function getGuildEventSummary(episode, dayInEp, dateMs){
  const items = dateMs != null ? getEventsForDay(dateMs, episode, dayInEp) : getDayEvents(episode, dayInEp);

  const tw = items.find(i => i.icon.startsWith('tw_'));
  if(tw) return `TW ${tw.label}`;

  const tbEnd = items.find(i => i.icon === 'tb_ends');
  if(tbEnd) return tbEnd.label;

  // Last match: on 36h boundary days the day holds both a
  // "Phase X Ends" and a "Phase Y Starts" card — Now means the one
  // that just started.
  const roteItems = items.filter(i => i.icon === 'rote');
  if(roteItems.length) return roteItems[roteItems.length - 1].label;

  return 'Guild Intermission';
}

function scanBackwardForGuildEvents(st, maxDays){
  maxDays = maxDays || 28;
  let twFound = null, tbFound = null;
  for(let back = 0; back <= maxDays; back++){
    const absDay = st.rawDayIndex - back;
    if(absDay < 1) break;
    const info = absDayToInfo(absDay, st.eraBaseStartMs);
    const items = getDayEvents(info.episode, info.dayInEp);

    if(!twFound){
      const twItem = items.find(i => i.icon.startsWith('tw_'));
      if(twItem) twFound = { daysAgo: back, icon: twItem.icon };
    }
    if(!tbFound){
      const tbItem = items.find(i => i.icon === 'rote' || i.icon === 'tb_ends');
      if(tbItem){
        // Resolve the actual phase for the run's guild choice (36h
        // TBs have 4 phases, Hoth/RotE have 6).
        const cursorMs = st.eraBaseStartMs + (absDay - 1) * 86400000;
        const rc = tbRunContext(cursorMs, info.episode, info.dayInEp);
        const df = tbChoiceForRun(rc);
        let phaseNum = null;
        if(tbItem.icon === 'rote' && rc){
          phaseNum = tbPhaseAtOffset(df, rc.offset).phase;
        } else {
          const m = tbItem.label.match(/Phase (\d+)/);
          phaseNum = m ? parseInt(m[1], 10) : null;
        }
        tbFound = { daysAgo: back, icon: tbItem.icon, phaseNum, phases: df.phases };
      }
    }
    if(twFound && tbFound) break;
  }
  return { tw: twFound, tb: tbFound };
}

/* Maintainer aid: checks config.js for the mistakes that silently break
   the schedule (bad dates, empty lists, out-of-range days). Returns an
   array of human-readable issue strings — empty means healthy. app.js
   logs these to the console on load. */
function validateScheduleConfig(){
  const issues = [];
  const isDateStr = v => Number.isFinite(parseDateOnlyMs(v));
  const eraLength = typeof ERA_LENGTH_DAYS !== 'undefined' ? ERA_LENGTH_DAYS : null;
  const episodeLength = typeof EPISODE_LENGTH_DAYS !== 'undefined' ? EPISODE_LENGTH_DAYS : null;
  const tbRunGap = typeof TB_RUN_GAP_DAYS !== 'undefined' ? TB_RUN_GAP_DAYS : null;
  const conquestLockOffset = typeof CONQUEST_ROSTER_LOCK_OFFSET_DAYS !== 'undefined'
    ? CONQUEST_ROSTER_LOCK_OFFSET_DAYS : null;
  const eraLockOffset = typeof ERA_ROSTER_LOCK_OFFSET_DAYS !== 'undefined'
    ? ERA_ROSTER_LOCK_OFFSET_DAYS : null;
  const datacronSets = typeof DATACRON_SETS !== 'undefined' ? DATACRON_SETS : null;
  const conquestEndOffsets = typeof CONQUEST_END_OFFSETS !== 'undefined' ? CONQUEST_END_OFFSETS : null;
  const eraStartOffsets = typeof ERA_START_OFFSETS !== 'undefined' ? ERA_START_OFFSETS : null;

  if(!isDateStr(typeof ERA_START_DATE !== 'undefined' ? ERA_START_DATE : null))
    issues.push('ERA_START_DATE is missing or not YYYY-MM-DD.');
  if(!Number.isInteger(eraLength) || eraLength <= 0)
    issues.push('ERA_LENGTH_DAYS must be a positive integer.');
  if(!Number.isInteger(episodeLength) || episodeLength <= 0)
    issues.push('EPISODE_LENGTH_DAYS must be a positive integer.');
  if(Number.isInteger(eraLength) && Number.isInteger(episodeLength) && episodeLength > eraLength)
    issues.push('EPISODE_LENGTH_DAYS is longer than ERA_LENGTH_DAYS.');
  if(!isDateStr(typeof GAC_CYCLE_START_DATE !== 'undefined' ? GAC_CYCLE_START_DATE : null))
    issues.push('GAC_CYCLE_START_DATE is missing or not YYYY-MM-DD.');
  if(!isDateStr(typeof TB_SIDE_ANCHOR_DATE !== 'undefined' ? TB_SIDE_ANCHOR_DATE : null))
    issues.push('TB_SIDE_ANCHOR_DATE is missing or not YYYY-MM-DD.');
  if(!(tbRunGap > 0))
    issues.push('TB_RUN_GAP_DAYS must be positive.');
  if(typeof CONQUEST_ROSTER_LOCK_OFFSET_DAYS !== 'undefined'
    && (!Number.isInteger(conquestLockOffset) || conquestLockOffset < 0))
    issues.push('CONQUEST_ROSTER_LOCK_OFFSET_DAYS must be a nonnegative integer.');
  if(typeof ERA_ROSTER_LOCK_OFFSET_DAYS !== 'undefined'
    && (!Number.isInteger(eraLockOffset) || eraLockOffset < 0))
    issues.push('ERA_ROSTER_LOCK_OFFSET_DAYS must be a nonnegative integer.');

  if(typeof STD_CHANGEOVER_HOUR_UTC !== 'undefined'
    && (stdHour() === 18 && STD_CHANGEOVER_HOUR_UTC !== 18))
    issues.push('STD_CHANGEOVER_HOUR_UTC must be an integer from 0 to 23.');
  if(typeof GAC_CHANGEOVER_HOUR_UTC !== 'undefined'
    && (gacHour() === 21 && GAC_CHANGEOVER_HOUR_UTC !== 21))
    issues.push('GAC_CHANGEOVER_HOUR_UTC must be an integer from 0 to 23.');

  if(!Array.isArray(datacronSets) || datacronSets.length === 0){
    issues.push('DATACRON_SETS is empty — the datacron card has nothing to show.');
  } else {
    const colors = (typeof CRON_COLOR_META !== 'undefined') ? Object.keys(CRON_COLOR_META) : [];
    datacronSets.forEach((s, i) => {
      if(!s || !s.name) issues.push(`DATACRON_SETS[${i}] is missing a name.`);
      if(colors.length && !colors.includes(s.color)) issues.push(`DATACRON_SETS[${i}] has unknown color "${s.color}".`);
      if(!isDateStr(s && s.expires)) issues.push(`DATACRON_SETS[${i}] has a bad expires date.`);
    });
  }

  if(!Array.isArray(conquestEndOffsets) || conquestEndOffsets.length === 0)
    issues.push('CONQUEST_END_OFFSETS is empty — the conquest unlock card degrades to today.');
  if(!Array.isArray(eraStartOffsets) || eraStartOffsets.length === 0)
    issues.push('ERA_START_OFFSETS is empty — the era unlock card degrades to today.');

  const checkOffsets = (name, offsets) => {
    if(!Array.isArray(offsets) || !Number.isInteger(eraLength) || eraLength <= 0) return;
    offsets.forEach((offset, i) => {
      if(!Number.isInteger(offset) || offset < 1 || offset > eraLength)
        issues.push(`${name}[${i}] must be an integer from 1 to ERA_LENGTH_DAYS.`);
    });
  };
  checkOffsets('CONQUEST_END_OFFSETS', conquestEndOffsets);
  checkOffsets('ERA_START_OFFSETS', eraStartOffsets);

  const cs = conquestStartDay(), ce = conquestEndDay();
  if(!(cs >= 1 && ce >= cs && ce <= episodeLength))
    issues.push('Conquest days must satisfy 1 <= START <= END <= EPISODE_LENGTH_DAYS.');

  if(typeof TB_DEFS === 'undefined' || !TB_DEFS || Object.keys(TB_DEFS).length === 0){
    issues.push('TB_DEFS is empty — Territory Battle labels cannot resolve.');
  } else {
    Object.entries(TB_DEFS).forEach(([id, def]) => {
      if(!def || !(def.phases > 0) || !(def.hoursPerPhase > 0))
        issues.push(`TB_DEFS["${id}"] needs positive phases and hoursPerPhase.`);
    });
  }

  return issues;
}

function getGuildPhaseInfo(st){
  const scan = scanBackwardForGuildEvents(st, 28);
  const tw = scan.tw, tb = scan.tb;

  let active = null;
  if(tw && (!tb || tw.daysAgo <= tb.daysAgo)) active = { type: 'tw', info: tw };
  else if(tb) active = { type: 'tb', info: tb };
  if(!active) return null;

  if(active.type === 'tw'){
    if(active.info.icon === 'tw_payout') return { type: 'tw', complete: true };
    const idx = TW_PHASE_ICONS.indexOf(active.info.icon);
    return { type: 'tw', phaseIndex: idx };
  } else {
    if(active.info.icon === 'tb_ends') return { type: 'tb', complete: true, phases: active.info.phases || 6 };
    return { type: 'tb', phaseIndex: Math.max(0, (active.info.phaseNum || 1) - 1), phases: active.info.phases || 6 };
  }
}
