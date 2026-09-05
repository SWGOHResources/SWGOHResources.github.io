/* TIME ENGINE — pure date/math helpers. Depends on config.js globals. No DOM. */

/* Positive modulo: JS % keeps the sign of the dividend, which breaks
   day math for pre-era / pre-season timestamps. posMod always wraps
   into [0, m). */
function posMod(n, m){
  return ((n % m) + m) % m;
}

function utcDateMs(year, monthIndex, day, hour = 0){
  const date = new Date(0);
  date.setUTCHours(hour, 0, 0, 0);
  date.setUTCFullYear(year, monthIndex, day);
  return date.getTime();
}

function parseDateOnlyMs(value){
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const [year, month, day] = value.split('-').map(Number);
  const dateMs = utcDateMs(year, month - 1, day);
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
  return (typeof CONQUEST_START_DAY_IN_EP !== 'undefined'
    && Number.isInteger(CONQUEST_START_DAY_IN_EP)
    && CONQUEST_START_DAY_IN_EP >= 1)
    ? CONQUEST_START_DAY_IN_EP : 7;
}

function conquestEndDay(){
  return (typeof CONQUEST_END_DAY_IN_EP !== 'undefined'
    && Number.isInteger(CONQUEST_END_DAY_IN_EP)
    && CONQUEST_END_DAY_IN_EP >= 1)
    ? CONQUEST_END_DAY_IN_EP : 20;
}

function conquestDurationDays(){
  const start = conquestStartDay(), end = conquestEndDay();
  const expected = end - start + 1;
  return (typeof CONQUEST_DURATION_DAYS !== 'undefined'
    && Number.isInteger(CONQUEST_DURATION_DAYS)
    && CONQUEST_DURATION_DAYS === expected)
    ? CONQUEST_DURATION_DAYS : expected;
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

/* Era/episode lengths with safe fallbacks so a missing / mistyped
   config key degrades to the long-standing 84/28 shape instead of
   NaN-poisoning every era calculation. validateScheduleConfig()
   still reports the bad key. */
function eraLengthDays(){
  return (typeof ERA_LENGTH_DAYS !== 'undefined'
    && Number.isInteger(ERA_LENGTH_DAYS)
    && ERA_LENGTH_DAYS > 0)
    ? ERA_LENGTH_DAYS : 84;
}

function episodeLengthDays(){
  return (typeof EPISODE_LENGTH_DAYS !== 'undefined'
    && Number.isInteger(EPISODE_LENGTH_DAYS)
    && EPISODE_LENGTH_DAYS > 0)
    ? EPISODE_LENGTH_DAYS : 28;
}

function getMonthlyEvents(dateMs){
  const monthly = (typeof MONTHLY_EVENTS !== 'undefined' && Array.isArray(MONTHLY_EVENTS)) ? MONTHLY_EVENTS : [];
  if(monthly.length === 0) return [];
  const d = new Date(dateMs);
  const dom = d.getUTCDate();
  const lastDom = new Date(utcDateMs(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return monthly
    .filter(m => m && typeof m.icon === 'string' && typeof m.label === 'string')
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
  const configuredStartMs = parseDateOnlyMs(typeof GAC_CYCLE_START_DATE !== 'undefined' ? GAC_CYCLE_START_DATE : null);
  const gacStartMs = Number.isFinite(configuredStartMs)
    ? configuredStartMs + (gacHour() * 3600000)
    : NaN;
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

/* GAC week a newly unlocked/locked unit is first usable in. A date
   landing in the off-week (cycle days 22-28, "week 4") rolls into
   Week 1 of the next cycle, whose format flips. */
function gacUsableWeek(cycleDay, format){
  const week = Math.ceil(cycleDay / 7);
  if(week <= 3) return { week, format };
  return { week: 1, format: format === '5v5' ? '3v3' : '5v5' };
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
  // Blue-tinted UPDATE category so the transparent client/shipment
  // art sits on steel-dim instead of the clashing orange ERA dim.
  if(icon === 'client_update' || icon === 'shipment_update') return 'update';
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
  const gapDays = (typeof TB_RUN_GAP_DAYS !== 'undefined'
    && Number.isFinite(TB_RUN_GAP_DAYS)
    && TB_RUN_GAP_DAYS > 0) ? TB_RUN_GAP_DAYS : 14;
  const anchorSide = (typeof TB_SIDE_ANCHOR_SIDE !== 'undefined' && TB_SIDE_ANCHOR_SIDE === 'dark')
    ? 'dark' : 'light';
  if(!Number.isFinite(anchor) || !Number.isFinite(phase1Ms)) return anchorSide;
  const idx = Math.round((phase1Ms - anchor) / (gapDays * 86400000));
  const even = (((idx % 2) + 2) % 2) === 0;
  if(anchorSide === 'light') return even ? 'light' : 'dark';
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
          { icon: it.icon, label: `${def.name} Phase ${phase} Starts`, tbStartMoment: transMs },
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
  const eraLen = eraLengthDays();
  const epLen = episodeLengthDays();

  // 1) Standard Event Changeover (STD_CHANGEOVER_HOUR_UTC)
  const stdStartMs = eraStartMs + (stdHour() * 3600000);
  const diffMs = nowMs - stdStartMs;
  const preEra = diffMs < 0;
  let rawDayIndex = Math.floor(diffMs / msPerDay) + 1;
  if(preEra) rawDayIndex = 1;

  // Calendar days from today until the era's first changeover day (0 =
  // it starts today at the changeover). Counted in the display
  // timezone's calendar — a UTC date would be off by one near midnight
  // for far-offset zones. Wall-clock ceil() would say "2 days" 30
  // hours out, which reads wrong — calendar math matches how players
  // talk about reset days.
  let daysUntilEra = 0;
  if(preEra){
    daysUntilEra = Math.max(0, Math.round((displayDayMarker(stdStartMs) - displayDayMarker(nowMs)) / msPerDay));
  }

  const eraDay = posMod(rawDayIndex - 1, eraLen) + 1;
  const cycleNum = Math.floor((rawDayIndex - 1) / eraLen);

  const episode = Math.floor((eraDay - 1) / epLen) + 1;
  const dayInEp = posMod(eraDay - 1, epLen) + 1;
  const week = Math.floor((dayInEp - 1) / 7) + 1;

  // Active Calendar Day associated with current changeover.
  // Weekday is rendered in the display timezone (game-day model stays UTC).
  const currentDayStartMs = eraStartMs + ((rawDayIndex - 1) * msPerDay);
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
    currentEraStartMs: eraStartMs + (cycleNum * eraLen * msPerDay),
    eraBaseStartMs: eraStartMs,
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
  const eraLen = eraLengthDays();
  const epLen = episodeLengthDays();
  const eraDay = posMod(absDay - 1, eraLen) + 1;
  const episode = Math.floor((eraDay - 1) / epLen) + 1;
  const dayInEp = posMod(eraDay - 1, epLen) + 1;
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
  for(let offset = -eraLengthDays(); offset <= 1; offset++){
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

      let twNumber = null;
      if(modeIsTw(item.icon)){
        const signupOffset = item.icon === 'tw_signup' ? 0 : item.icon === 'tw_defense' ? 1 : item.icon === 'tw_offense' ? 2 : 3;
        const signupStartMs = dayStartMs - (signupOffset * 86400000) + (stdHour() * 3600000);
        let signupCount = 0;
        for(let dayOffset = -7; dayOffset <= 0; dayOffset++){
          const checkDayMs = dayStartMs + (dayOffset * 86400000);
          const checkInfo = absDayToInfo(absDay + dayOffset, eraBaseStartMs);
          const checkItems = getEventsForDay(checkDayMs, checkInfo.episode, checkInfo.dayInEp);
          if(checkItems.some(checkItem => {
            if(checkItem.icon !== 'tw_signup') return false;
            return checkDayMs + (stdHour() * 3600000) <= signupStartMs;
          })) signupCount++;
        }
        twNumber = signupCount || null;
      }

      const mode = item.icon.startsWith('tw_') ? 'tw' : 'gac';
      if(usableFromMs < expiresMs && (!lastUsable[mode] || itemStartMs > lastUsable[mode].startMs)){
        lastUsable[mode] = {
          item,
          dateMs: dayStartMs,
          startMs: itemStartMs,
          twNumber,
        };
      }
    });
  }
  return lastUsable.tw || lastUsable.gac ? lastUsable : null;
}

function modeIsTw(icon){
  return icon.startsWith('tw_');
}

/* A schedule-table entry is usable when it carries a string icon and
   label (renderers call .startsWith/.toUpperCase on both). Malformed
   entries from a bad config edit are dropped instead of crashing the
   page — validateScheduleConfig() reports them. */
function validScheduleItem(item){
  return !!item && typeof item.icon === 'string' && item.icon.length > 0
    && typeof item.label === 'string';
}

/* =========================================================
 CLIENT UPDATES + DATACRON DROPS (Wednesday rules)
  - Shipment update: Wednesday of era week 2 (era days 8-14),
    once per 84-day era. Previous era's shards go to shipments.
    Shown as TWO cards: the regular client update plus a
    separate shipment change card.
  - Datacron drop: Wednesday of the calendar week before a
    conquest starts (any conquest of any volume). Currently
    conquests start Monday (Day 7), so this is the prior
    Wednesday (Day 2). Detected as: Wednesday + next conquest
    start 5-11 days out (Wed+5=Mon .. Wed+11=Sun of next week),
    so it survives conquest-day / era-start moves. It also
    carries a client update (off-cadence extra).
  - Generic: every other Wednesday, 14-day cadence anchored to
    CLIENT_UPDATE_ANCHOR_DATE (2026-09-02 had an update).
  Weekday is UTC calendar day (dateMs is UTC midnight), matching
  the rest of the engine.
  ========================================================= */

function isWednesdayUtc(dateMs){
  return Number.isFinite(dateMs) && new Date(dateMs).getUTCDay() === 3;
}

function clientUpdateAnchorMs(){
  return parseDateOnlyMs(typeof CLIENT_UPDATE_ANCHOR_DATE !== 'undefined' ? CLIENT_UPDATE_ANCHOR_DATE : null);
}

function isBiweeklyClientUpdateDay(dateMs){
  const anchor = clientUpdateAnchorMs();
  if(!Number.isFinite(anchor) || !Number.isFinite(dateMs)) return false;
  if(!isWednesdayUtc(dateMs)) return false;
  const diffDays = Math.round((dateMs - anchor) / 86400000);
  return posMod(diffDays, 14) === 0;
}

function eraDayForEpisode(episode, dayInEp){
  if(!Number.isInteger(episode) || !Number.isInteger(dayInEp)) return NaN;
  return ((episode - 1) * episodeLengthDays()) + dayInEp;
}

function isShipmentUpdateDay(dateMs, eraDay){
  return Number.isInteger(eraDay) && eraDay >= 8 && eraDay <= 14 && isWednesdayUtc(dateMs);
}

function daysUntilNextConquest(eraDay){
  if(!Number.isInteger(eraDay)) return Infinity;
  const eraLen = eraLengthDays();
  const epLen = episodeLengthDays();
  const start = conquestStartDay();
  const episodeCount = Math.ceil(eraLen / epLen);
  let best = Infinity;
  for(let e = 1; e <= episodeCount; e++){
    const s = ((e - 1) * epLen) + start;
    if(s < 1 || s > eraLen) continue;
    const d = posMod(s - eraDay, eraLen);
    if(d < best) best = d;
  }
  return best;
}

function isDatacronDropDay(dateMs, eraDay){
  if(!isWednesdayUtc(dateMs)) return false;
  const d = daysUntilNextConquest(eraDay);
  return d >= 5 && d <= 11;
}

/* Color of the set added by the drop on dateMs. Drops land on
   Episode Day 2 — exactly one episode apart — so the color steps
   through DATACRON_COLOR_ORDER by whole episodes from the anchor
   drop (2026-08-26 added Blue; Jul 29 Green; before that Pink,
   Orange, then looping). Unknown/missing config degrades to the
   rotation's last color instead of a broken icon. */
function datacronColorOrder(){
  const fallback = ['orange', 'pink', 'green', 'blue'];
  const order = (typeof DATACRON_COLOR_ORDER !== 'undefined' && Array.isArray(DATACRON_COLOR_ORDER))
    ? DATACRON_COLOR_ORDER.filter(c => typeof c === 'string' && c.length > 0)
    : [];
  return order.length ? order : fallback;
}

function datacronColorForDrop(dateMs){
  const order = datacronColorOrder();
  const anchor = parseDateOnlyMs(typeof DATACRON_ANCHOR_DATE !== 'undefined' ? DATACRON_ANCHOR_DATE : null);
  const anchorColor = (typeof DATACRON_ANCHOR_COLOR !== 'undefined' && order.includes(DATACRON_ANCHOR_COLOR))
    ? DATACRON_ANCHOR_COLOR : order[order.length - 1];
  if(!Number.isFinite(anchor) || !Number.isFinite(dateMs)) return anchorColor;
  const periods = Math.round((dateMs - anchor) / (episodeLengthDays() * 86400000));
  return order[posMod(order.indexOf(anchorColor) + periods, order.length)];
}

function datacronSetIconForDrop(dateMs){
  const icon = `datacron_set_${datacronColorForDrop(dateMs)}`;
  if(typeof EVENT_ICONS !== 'undefined' && EVENT_ICONS[icon]) return icon;
  return 'datacron_set';
}

/* Name of the set introduced by the drop on dateMs, matched by the
   set's "added" date (and color, guarding against typos). Drops
   with no matching entry — future sets not yet announced — return
   null so the card falls back to the color. */
function datacronNameForDrop(dateMs, color){
  if(!Number.isFinite(dateMs)) return null;
  const sets = (typeof DATACRON_SETS !== 'undefined' && Array.isArray(DATACRON_SETS)) ? DATACRON_SETS : [];
  for(const s of sets){
    if(!s || typeof s.name !== 'string' || !s.name.length || typeof s.added !== 'string') continue;
    if(parseDateOnlyMs(s.added) === dateMs && (!color || s.color === color)) return s.name;
  }
  return null;
}

function getClientUpdateEvents(dateMs, episode, dayInEp){
  const eraDay = eraDayForEpisode(episode, dayInEp);
  if(!Number.isInteger(eraDay) || !Number.isFinite(dateMs)) return [];
  // Single shared client_update card: a day that is both a special
  // Wednesday and a cadence Wednesday must not emit it twice.
  const shipment = isShipmentUpdateDay(dateMs, eraDay);
  const datacron = isDatacronDropDay(dateMs, eraDay);
  const biweekly = isBiweeklyClientUpdateDay(dateMs);
  const out = [];
  if(shipment || datacron || biweekly) out.push(ev('client_update', 'Client Update'));
  if(shipment) out.push(ev('shipment_update', 'Previous Era Shards Added to Shipments'));
  if(datacron){
    const color = datacronColorForDrop(dateMs);
    const name = datacronNameForDrop(dateMs, color);
    const bracket = name || (color.charAt(0).toUpperCase() + color.slice(1));
    out.push(ev(datacronSetIconForDrop(dateMs), `New Datacron Set Added (${bracket})`));
  }
  return out;
}

/* Explorer "Jump to event" menu: only marquee-family icons, journey
   guide unlocks, fleet masteries and Proving Grounds (see
   JUMP_EVENT_MATCHERS — a matcher ending in "_" matches the whole
   family, anything else must equal the icon exactly). */
function isJumpToEvent(icon){
  const matchers = (typeof JUMP_EVENT_MATCHERS !== 'undefined' && Array.isArray(JUMP_EVENT_MATCHERS)) ? JUMP_EVENT_MATCHERS : [];
  if(typeof icon !== 'string' || icon.length === 0) return false;
  return matchers.some(m => typeof m === 'string' && m.length > 0 && (m.endsWith('_') ? icon.startsWith(m) : icon === m));
}

function getDayEvents(episode, dayInEp){
  const overrides = (typeof EPISODE_OVERRIDES !== 'undefined' && EPISODE_OVERRIDES) || {};
  const common = (typeof COMMON_DAYS !== 'undefined' && COMMON_DAYS) || {};
  const epTable = (overrides && overrides[episode]) || {};
  const list = epTable[dayInEp] || common[dayInEp] || [];
  return Array.isArray(list) ? list.filter(validScheduleItem) : [];
}

function getEventsForDay(dateMs, episode, dayInEp){
  const runCtx = tbRunContext(dateMs, episode, dayInEp);
  return applyTbLabels([...getDayEvents(episode, dayInEp), ...getClientUpdateEvents(dateMs, episode, dayInEp), ...gacEventsForDate(dateMs), ...getMonthlyEvents(dateMs)], runCtx);
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

/* UTC-midnight marker for the calendar day an instant falls on in the
   display zone (so day differences match what the user sees). */
function displayDayMarker(ms){
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz(), year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(new Date(dms(ms)));
  let y = 0, m = 0, d = 0;
  for(const p of parts){
    if(p.type === 'year') y = Number(p.value);
    else if(p.type === 'month') m = Number(p.value);
    else if(p.type === 'day') d = Number(p.value);
  }
  return utcDateMs(y, m - 1, d);
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
    const dur = conquestDurationDays();
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
    const daysInEndMonth = new Date(utcDateMs(endMs.getUTCFullYear(), endMs.getUTCMonth() + 1, 0)).getUTCDate();
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

function eventDisplayMs(item, dateMs){
  const hour = item && item.icon && item.icon.startsWith('gac_') ? gacHour() : stdHour();
  return dateMs + (hour * 3600000);
}

/* Start instant of a schedule card: 36h-TB boundary cards carry their
   exact transition moment (tbStartMoment / tbEndMoment); everything
   else starts at its day's changeover (18:00 UTC, 21:00 for GAC). */
function eventStartMs(item, dateMs){
  if(item && Number.isFinite(item.tbStartMoment)) return item.tbStartMoment;
  if(item && Number.isFinite(item.tbEndMoment)) return item.tbEndMoment;
  return eventDisplayMs(item, dateMs);
}

/* Event labels are authored in future tense ("Phase 4 Starts"). Once
   the event's start instant has passed, render past tense ("Phase 4
   Started"). Only the trailing verb flips — names, "Continues"
   (still ongoing) and dateless labels pass through untouched. */
function tensedLabel(label, started){
  if(!started || typeof label !== 'string') return label;
  if(label.endsWith('Starts')) return label.slice(0, -('Starts'.length)) + 'Started';
  if(label.endsWith('Ends')) return label.slice(0, -('Ends'.length)) + 'Ended';
  return label;
}

/* Tense a picked label by its start instant. Without a usable clock
   (no nowMs) or day (no dateMs) the authored tense passes through. */
function tenseByStart(label, item, dateMs, nowMs){
  if(typeof nowMs !== 'number' || !Number.isFinite(nowMs) || dateMs == null) return label;
  return tensedLabel(label, eventStartMs(item, dateMs) <= nowMs);
}

function getGacStatus(st){
  const format = st.gacFormat;
  const nextFormat = format === '5v5' ? '3v3' : '5v5';
  const info = getGacRoundInfo(st.gacCycleDay);
  const gacNow = gacInfoForTimestamp(st.nowMs);
  const configuredStartMs = parseDateOnlyMs(typeof GAC_CYCLE_START_DATE !== 'undefined' ? GAC_CYCLE_START_DATE : null);
  const gacStartMs = Number.isFinite(configuredStartMs)
    ? configuredStartMs : Date.UTC(2026, 7, 11);
  const cycleStartMs = gacStartMs + (gacHour() * 3600000) + (gacNow.cycleNum * 28 * 86400000);
  const nextSignupMs = info.phase === 'off' ? cycleStartMs + (28 * 86400000) : cycleStartMs;
  const nextSignupDate = fmtDayMonthUTC(nextSignupMs);
  const nextTransitionMs = info.phase === 'off'
    ? nextSignupMs
    : gacStartMs + ((gacNow.rawDays + 1) * 86400000) + (gacHour() * 3600000);
  const transitionPhrase = formatGacUntil(st.nowMs, nextTransitionMs);

  if(info.phase === 'off'){
     return {
        status: 'OFF-WEEK',
        badgeClass: 'off',
        title: `Grand Arena (${format})`,
        main: 'Post-Season Off Week',
        sub: `Next Signup opens ${transitionPhrase} (${nextFormat}) · ${nextSignupDate}`,
        round: null,
        roundPhase: null
     };
  }

  if(info.phase === 'signup'){
    const defenseDate = fmtDayMonthUTC(cycleStartMs + 86400000);
    return {
      status: `WEEK ${info.week} · SIGNUP`,
      badgeClass: 'red',
      title: `Grand Arena (${format})`,
      main: `Week ${info.week} Signup Phase Open`,
      sub: `Roster locks and Defense Phase starts ${transitionPhrase} · ${defenseDate}`,
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
        ? `Roster lock-in · Round 1 Attack Phase begins ${transitionPhrase}`
        : `Round ${info.round} Attack Phase begins ${transitionPhrase}`,
      round: info.round,
      roundPhase: 'defense'
    };
  }

  if(info.phase === 'offense'){
    const isLastRound = info.round === 3;
    const subStr = isLastRound 
      ? (info.week === 3 ? `Season ends ${transitionPhrase}!` : `Week ${info.week} ends ${transitionPhrase}`)
      : `Round ${info.round + 1} Defense Phase begins ${transitionPhrase}`;
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
  return ordinal(cNum);
}

/* Countdown phrasing truncates (floor) so counts match how players
   count: 25 hours out reads "in 1 day", not "in 2 days". Sub-minute
   diffs read "in 1 minute" rather than "in 0 minutes". */
function formatGacUntil(nowMs, targetMs){
  const diffMs = targetMs - nowMs;
  if(!Number.isFinite(diffMs) || diffMs <= 0) return 'now';
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if(minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(diffMs / 3600000);
  if(hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(diffMs / 86400000);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

function conquestInfoForDay(episode, dayInEp){
  const start = conquestStartDay(), end = conquestEndDay();
  if(dayInEp < start || dayInEp > end) return null;
  const { cNum, note } = conquestChapterForEpisode(episode);
  const total = conquestDurationDays();
  return { active: true, day: dayInEp - start + 1, total, cNum, note, finalDay: dayInEp === end };
}

function getConquestStatus(st){
  const start = conquestStartDay(), end = conquestEndDay();
  const total = conquestDurationDays();
  const episodeCount = Math.ceil(eraLengthDays() / episodeLengthDays());
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
    const daysUntil = (episodeLengthDays() - st.dayInEp) + start;
    const startDateMs = st.currentDayStartMs + (daysUntil * 86400000) + (stdHour() * 3600000);
    return {
      status: 'UPCOMING', badgeClass: 'purple', title: titleNote,
      main: `Starts in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'} · ${fmtDayMonthUTC(startDateMs)}`,
      sub: `Conquest Run ${cNum} will begin.`,
      cNum: cNum
    };
  } else if (targetDay < start) {
    const daysUntil = start - targetDay;
    const startDateMs = st.currentDayStartMs + (daysUntil * 86400000) + (stdHour() * 3600000);
    return {
      status: 'UPCOMING', badgeClass: 'purple', title: titleNote,
      main: `Starts in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'} · ${fmtDayMonthUTC(startDateMs)}`,
      sub: `Event ${cNum} Starts`,
      cNum: cNum
    };
  } else if (targetDay >= start && targetDay <= end) {
    const cqDay = targetDay - start + 1;
    // Full days left after today: day 5 of 14 reads "Ends in 9 days",
    // matching how players count (the end date alongside stays exact).
    const remaining = end - targetDay;
    const endDateMs = st.currentDayStartMs + ((remaining + 1) * 86400000) + (stdHour() * 3600000);
    return {
      status: remaining === 0 ? 'FINAL DAY' : 'ACTIVE',
      badgeClass: 'purple', title: titleNote,
      main: `Conquest Day ${cqDay} of ${total}`,
      sub: remaining === 0 ? 'Proving Grounds starts in 1 day' : `Ends in ${remaining} ${remaining === 1 ? 'day' : 'days'} · ${fmtDayMonthUTC(endDateMs)}`,
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

/* nowMs is an optional clock override: when given, the picked label
   is tensed by its start instant ("Signup Started" after today's
   changeover, "Signup Starts" before/tomorrow). */
function getGuildEventSummary(episode, dayInEp, dateMs, nowMs){
  const items = dateMs != null ? getEventsForDay(dateMs, episode, dayInEp) : getDayEvents(episode, dayInEp);

  const tw = items.find(i => i.icon.startsWith('tw_'));
  if(tw) return `TW ${tenseByStart(tw.label, tw, dateMs, nowMs)}`;

  const tbEnd = items.find(i => i.icon === 'tb_ends');
  if(tbEnd) return tenseByStart(tbEnd.label, tbEnd, dateMs, nowMs);

  // Last match: on 36h boundary days the day holds both a
  // "Phase X Ends" and a "Phase Y Starts" card — Now means the one
  // that just started.
  const roteItems = items.filter(i => i.icon === 'rote');
  if(roteItems.length) return tenseByStart(roteItems[roteItems.length - 1].label, roteItems[roteItems.length - 1], dateMs, nowMs);

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
  const conquestDuration = typeof CONQUEST_DURATION_DAYS !== 'undefined'
    ? CONQUEST_DURATION_DAYS : null;
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
  if(typeof CLIENT_UPDATE_ANCHOR_DATE !== 'undefined' && !isDateStr(CLIENT_UPDATE_ANCHOR_DATE))
    issues.push('CLIENT_UPDATE_ANCHOR_DATE is missing or not YYYY-MM-DD.');
  if(typeof DATACRON_ANCHOR_DATE !== 'undefined' && !isDateStr(DATACRON_ANCHOR_DATE))
    issues.push('DATACRON_ANCHOR_DATE is missing or not YYYY-MM-DD.');
  if(typeof DATACRON_ANCHOR_COLOR !== 'undefined'
    && !(typeof CRON_COLOR_META !== 'undefined' && DATACRON_ANCHOR_COLOR in CRON_COLOR_META))
    issues.push(`DATACRON_ANCHOR_COLOR "${DATACRON_ANCHOR_COLOR}" is not a known datacron color.`);
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
  if(typeof CONQUEST_DURATION_DAYS !== 'undefined'
    && (!Number.isInteger(conquestDuration) || conquestDuration <= 0))
    issues.push('CONQUEST_DURATION_DAYS must be a positive integer.');

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
      if(s && typeof s.added !== 'undefined' && !isDateStr(s.added)) issues.push(`DATACRON_SETS[${i}] has a bad added date.`);
    });
  }

  const jumpMatchers = (typeof JUMP_EVENT_MATCHERS !== 'undefined') ? JUMP_EVENT_MATCHERS : null;
  if(jumpMatchers != null && (!Array.isArray(jumpMatchers) || !jumpMatchers.every(m => typeof m === 'string' && m.length > 0))){
    issues.push('JUMP_EVENT_MATCHERS must be an array of non-empty icon strings.');
  }

  if(!Array.isArray(conquestEndOffsets) || conquestEndOffsets.length === 0)
    issues.push('CONQUEST_END_OFFSETS is empty — the conquest unlock card degrades to today.');
  if(!Array.isArray(eraStartOffsets) || eraStartOffsets.length === 0)
    issues.push('ERA_START_OFFSETS is empty — the era unlock card degrades to today.');

  /* Schedule tables: every entry must be an {icon, label} object —
     renderers call string methods on both, so a stray string or a
     missing label crashes the page (getDayEvents filters these at
     runtime, but the config should be fixed). */
  const checkEventList = (name, list) => {
    if(!Array.isArray(list)){
      issues.push(`${name} must be an array of {icon, label} events.`);
      return;
    }
    list.forEach((item, i) => {
      if(!item || typeof item.icon !== 'string' || item.icon.length === 0)
        issues.push(`${name}[${i}] needs a string icon.`);
      else if(typeof item.label !== 'string')
        issues.push(`${name}[${i}] needs a string label.`);
    });
  };

  const commonDays = (typeof COMMON_DAYS !== 'undefined') ? COMMON_DAYS : null;
  if(!commonDays || typeof commonDays !== 'object' || Array.isArray(commonDays)){
    issues.push('COMMON_DAYS must be an object mapping days to event lists.');
  } else {
    Object.entries(commonDays).forEach(([day, list]) => {
      if(!Number.isInteger(Number(day)) || Number(day) < 1)
        issues.push(`COMMON_DAYS has invalid day "${day}".`);
      else checkEventList(`COMMON_DAYS[${day}]`, list);
    });
  }

  const episodeOverrides = (typeof EPISODE_OVERRIDES !== 'undefined') ? EPISODE_OVERRIDES : null;
  if(episodeOverrides == null || typeof episodeOverrides !== 'object' || Array.isArray(episodeOverrides)){
    issues.push('EPISODE_OVERRIDES must be an object mapping episodes to day tables.');
  } else {
    Object.entries(episodeOverrides).forEach(([ep, table]) => {
      if(!table || typeof table !== 'object' || Array.isArray(table)){
        issues.push(`EPISODE_OVERRIDES[${ep}] must be an object mapping days to event lists.`);
        return;
      }
      Object.entries(table).forEach(([day, list]) => {
        if(!Number.isInteger(Number(day)) || Number(day) < 1)
          issues.push(`EPISODE_OVERRIDES[${ep}] has invalid day "${day}".`);
        else checkEventList(`EPISODE_OVERRIDES[${ep}][${day}]`, list);
      });
    });
  }

  const monthlyEvents = (typeof MONTHLY_EVENTS !== 'undefined') ? MONTHLY_EVENTS : null;
  if(!Array.isArray(monthlyEvents)){
    issues.push('MONTHLY_EVENTS must be an array.');
  } else {
    monthlyEvents.forEach((m, i) => {
      if(!m || typeof m.icon !== 'string' || !m.icon || typeof m.label !== 'string')
        issues.push(`MONTHLY_EVENTS[${i}] needs a string icon and label.`);
      else if(!m.lastDayOfMonth && (!Number.isInteger(m.dayOfMonth) || m.dayOfMonth < 1 || m.dayOfMonth > 31))
        issues.push(`MONTHLY_EVENTS[${i}] needs a dayOfMonth from 1 to 31 or lastDayOfMonth.`);
    });
  }

  const checkOffsets = (name, offsets) => {
    if(!Array.isArray(offsets) || !Number.isInteger(eraLength) || eraLength <= 0) return;
    offsets.forEach((offset, i) => {
      if(!Number.isInteger(offset) || offset < 1 || offset > eraLength)
        issues.push(`${name}[${i}] must be an integer from 1 to ERA_LENGTH_DAYS.`);
    });
  };
  checkOffsets('CONQUEST_END_OFFSETS', conquestEndOffsets);
  checkOffsets('ERA_START_OFFSETS', eraStartOffsets);

  const configuredConquestStart = typeof CONQUEST_START_DAY_IN_EP !== 'undefined'
    ? CONQUEST_START_DAY_IN_EP : 7;
  const configuredConquestEnd = typeof CONQUEST_END_DAY_IN_EP !== 'undefined'
    ? CONQUEST_END_DAY_IN_EP : 20;
  if(!Number.isInteger(configuredConquestStart)
    || !Number.isInteger(configuredConquestEnd)
    || !(configuredConquestStart >= 1
      && configuredConquestEnd >= configuredConquestStart
      && configuredConquestEnd <= episodeLength))
    issues.push('Conquest days must satisfy 1 <= START <= END <= EPISODE_LENGTH_DAYS.');
  if(Number.isInteger(conquestDuration)
    && conquestDuration > 0
    && Number.isInteger(configuredConquestStart)
    && Number.isInteger(configuredConquestEnd)
    && conquestDuration !== configuredConquestEnd - configuredConquestStart + 1)
    issues.push('CONQUEST_DURATION_DAYS must match the inclusive Conquest start/end day span.');

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
