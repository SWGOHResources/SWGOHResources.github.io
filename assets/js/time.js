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

/* Transparent-subject icons (see FIT_ART_ICONS in config.js) render
   contained over a blurred fill instead of cover-cropped.
   Pure — safe to test. */
function isFitArt(icon){
  const set = (typeof FIT_ART_ICONS !== 'undefined' && Array.isArray(FIT_ART_ICONS))
    ? FIT_ART_ICONS : [];
  return typeof icon === 'string' && set.includes(icon);
}

function categoryFor(icon){
  if(typeof icon !== 'string') return 'era';
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
 TERRITORY BATTLE — RISE OF THE EMPIRE ONLY
  TB runs start day 7 & 21 of each episode, 14 days apart
  (runs span day 7-13 & 21-27). The guild always runs Rise
  of the Empire: tbChoiceForRun() is hardcoded to RotE —
  no selector, no stored pick, no per-side options.
  ========================================================= */

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
  return { phase1Ms, offset: dayInEp - p1 };
}

/* The guild always runs Rise of the Empire — no selector, no
   stored pick, no per-side options. */
function tbChoiceForRun(){
  return { id: 'rote', ...TB_DEFS.rote };
}

/* TW/TB phase hour (UTC): guild phases go an hour before the daily
   changeover. Configurable via TW_TB_HOUR_UTC. */
function twTbHour(){
  return (typeof TW_TB_HOUR_UTC !== 'undefined'
    && Number.isInteger(TW_TB_HOUR_UTC)
    && TW_TB_HOUR_UTC >= 0 && TW_TB_HOUR_UTC < 24)
    ? TW_TB_HOUR_UTC : 17;
}

/* Phase index (1-based) + whether a new phase starts at this
   day's guild-phase marker. offset 0-5 across the 6-day run.
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
   the Phase-1 day; the run opens at the guild-phase hour that day.
   idx is 0-based, so mid-phase markers render the true span
   (e.g. Wed 05:00 → Thu 17:00) instead of implying a changeover. */
function tbPhaseWindow(def, phase1Ms, idx){
  const startMs = phase1Ms + (twTbHour() * 3600000) + (idx * def.hoursPerPhase * 3600000);
  return { startMs, endMs: startMs + (def.hoursPerPhase * 3600000) };
}

function fmtPhaseMoment(ms){
  const d = new Date(dms(ms));
  const date = withOrdinal(__formatter('wdS|day|monS').format(d));
  const time = __formatter('hhmm').format(d);
  return `${date} ${time}`;
}

/* Rewrite the static rote/tb_ends labels for the run's guild
   choice. Non-TB days pass through untouched. On 36h TBs, a day
   whose phase boundary falls at 05:00 emits two cards — the old
   phase ending and the new phase starting at that time — instead
   of one confusing guild-phase marker. */
function applyTbLabels(items, runCtx){
  if(!runCtx) return items;
  const def = tbChoiceForRun(runCtx);
  return items.flatMap(it => {
    if(it.icon === 'rote' && def.hoursPerPhase === 36 && runCtx.offset > 0){
      const { phase } = tbPhaseAtOffset(def, runCtx.offset);
      // Moment the current phase began (= previous phase ended).
      const transMs = runCtx.phase1Ms + (twTbHour() * 3600000) + ((phase - 1) * def.hoursPerPhase * 3600000);
      if(new Date(transMs).getUTCHours() === 5 && phase > 1){
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
  const activeDayParts = __formatter('wdL').formatToParts(new Date(dms(currentDayStartMs + (stdHour() * 3600000))));
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

/* Memoized: renderUnlockWindows calls this on every render (including
   the 60s background tick), and each call scans ~85 days × event
   lookups plus per-TW-hit 7-day numbering scans. Inputs only change
   when the datacron config, era base or changeover hours
   change, so cache on all of them. */
const _lastUsableCache = { key: null, value: null };

function lastUsableCacheKey(expiresMs, eraBaseStartMs){
  return [expiresMs, eraBaseStartMs, stdHour(), gacHour(), eraLengthDays()].join('|');
}

// A datacron set can only ever be equipped/used for Territory War and
// GAC — never Territory Battle, Conquest, etc. This finds the most recent
// usable event for each mode independently because TW and GAC can end at
// different times.
function getLastUsableGuildEvent(expiresMs, eraBaseStartMs){
  const key = lastUsableCacheKey(expiresMs, eraBaseStartMs);
  if(_lastUsableCache.key === key) return _lastUsableCache.value;
  const value = _getLastUsableGuildEventUncached(expiresMs, eraBaseStartMs);
  _lastUsableCache.key = key;
  _lastUsableCache.value = value;
  return value;
}

function _getLastUsableGuildEventUncached(expiresMs, eraBaseStartMs){
  const firstAbsDay = Math.floor((expiresMs - eraBaseStartMs) / 86400000) + 1;
  const lastUsable = { tw: null, gac: null };
  for(let offset = -eraLengthDays(); offset <= 1; offset++){
    const absDay = firstAbsDay + offset;
    const info = absDayToInfo(absDay, eraBaseStartMs);
    const dayStartMs = eraBaseStartMs + ((absDay - 1) * 86400000);
    const items = getEventsForDay(dayStartMs, info.episode, info.dayInEp);
    items.forEach(item => {
      if(!item.icon.startsWith('tw_') && !item.icon.startsWith('gac_')) return;
      const startHour = item.icon.startsWith('gac_') ? gacHour() : twTbHour();
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
          const defenseHour = defense.icon.startsWith('gac_') ? gacHour() : twTbHour();
          usableFromMs = previousDayMs + (defenseHour * 3600000);
        }
      }

      let twNumber = null;
      if(modeIsTw(item.icon)){
        const signupOffset = item.icon === 'tw_signup' ? 0 : item.icon === 'tw_defense' ? 1 : item.icon === 'tw_offense' ? 2 : 3;
        const signupStartMs = dayStartMs - (signupOffset * 86400000) + (twTbHour() * 3600000);
        let signupCount = 0;
        for(let dayOffset = -7; dayOffset <= 0; dayOffset++){
          const checkDayMs = dayStartMs + (dayOffset * 86400000);
          const checkInfo = absDayToInfo(absDay + dayOffset, eraBaseStartMs);
          const checkItems = getEventsForDay(checkDayMs, checkInfo.episode, checkInfo.dayInEp);
          if(checkItems.some(checkItem => {
            if(checkItem.icon !== 'tw_signup') return false;
            return checkDayMs + (twTbHour() * 3600000) <= signupStartMs;
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

/* Wednesdays with an announced set in DATACRON_SETS always render
   the drop card, even when CG goes off-cadence (Duty and Defiance
   dropped 2026-09-16, twelve days out from conquest). */
function datacronAddedDates(){
  const sets = (typeof DATACRON_SETS !== 'undefined' && Array.isArray(DATACRON_SETS)) ? DATACRON_SETS : [];
  const out = [];
  for(const s of sets){
    const ms = (s && typeof s.added === 'string') ? parseDateOnlyMs(s.added) : NaN;
    if(Number.isFinite(ms)) out.push(ms);
  }
  return out;
}

/* Structural drop Wednesdays CG skipped (DATACRON_SKIP_DATES) never
   render, or the week after an early drop shows a phantom card. */
function datacronSkipDates(){
  const skip = (typeof DATACRON_SKIP_DATES !== 'undefined' && Array.isArray(DATACRON_SKIP_DATES)) ? DATACRON_SKIP_DATES : [];
  const out = [];
  for(const d of skip){
    const ms = (typeof d === 'string') ? parseDateOnlyMs(d) : NaN;
    if(Number.isFinite(ms)) out.push(ms);
  }
  return out;
}

function isDatacronDropDay(dateMs, eraDay){
  if(!isWednesdayUtc(dateMs)) return false;
  if(datacronAddedDates().includes(dateMs)) return true;
  if(datacronSkipDates().includes(dateMs)) return false;
  const d = daysUntilNextConquest(eraDay);
  return d >= 5 && d <= 11;
}

/* Color of the set added by the drop on dateMs. Drops land roughly
   one episode apart, so the color steps through DATACRON_COLOR_ORDER
   by whole episodes from the anchor drop (2026-09-16 added Orange;
   before that Blue, Green, Pink, Orange, looping). Unknown/missing
   config degrades to the rotation's last color instead of a broken
   icon. */
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
  const parts = __formatter('yearN|monN|day').formatToParts(new Date(dms(ms)));
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

/* Short zone tag for event start times ("UTC", "BST", "UTC+05:30").
   Cached per setting; manual offsets echo the setting itself since
   they render shifted through UTC. */
let tzShortCache = { key: null, abbr: '' };
function tzShort(){
  const setting = (typeof getTimeZoneSetting === 'function') ? getTimeZoneSetting() : 'local';
  if(tzShortCache.key !== setting){
    let abbr = setting;
    if(tzOffsetMinutes(setting) == null){
      const zone = (typeof tz === 'function') ? tz() : 'UTC';
      abbr = zone;
      try {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date());
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        if(tzPart && tzPart.value) abbr = tzPart.value;
      } catch(e){}
    }
    tzShortCache = { key: setting, abbr };
  }
  return tzShortCache.abbr;
}

/* Absolute start instant in the display zone: "Sat, 12th Sep, 18:00
   UTC". Card rows + live labels share it — one source of truth. */
function fmtEventStart(ms){
  return `${withOrdinal(__formatter('wdS|day|monS|hhmm').format(new Date(dms(ms))))} ${tzShort()}`;
}

function setTimeZone(v){
  if(v !== 'local' && tzOffsetMinutes(v) == null && !validTimeZone(v)) return false;
  try { localStorage.setItem(TZ_STORAGE_KEY, v); } catch(e){}
  return true;
}

/* Weekday-short + calendar day/month of an instant in the display zone
   (for the explorer day pills: the big number is the era day, the
   caption underneath is the calendar date).
   Perf: every render builds dozens of dates (7 pills + per-card labels
   + 84 timeline rows). Constructing a new Intl.DateTimeFormat per call
   is the hottest per-render cost, so formatters are cached per
   timezone + option set. Output is identical — only the constructor
   call is skipped. */
const __fmtCache = new Map();
function __formatter(opts){
  const zone = tz();
  const key = zone + '|' + opts;
  let f = __fmtCache.get(key);
  if(!f){
    const o = { timeZone: zone };
    if(opts.includes('wdS')){ o.weekday = 'short'; }
    else if(opts.includes('wdL')){ o.weekday = 'long'; }
    if(opts.includes('day')) o.day = 'numeric';
    if(opts.includes('monS')) o.month = 'short';
    else if(opts.includes('monL')) o.month = 'long';
    else if(opts.includes('monN')) o.month = 'numeric';
    if(opts.includes('yearN')) o.year = 'numeric';
    if(opts.includes('hhmm')){ o.hour = '2-digit'; o.minute = '2-digit'; o.hour12 = false; }
    f = new Intl.DateTimeFormat('en-GB', o);
    // Timezone list is tiny (local + a few presets); cap defensively.
    if(__fmtCache.size > 40) __fmtCache.clear();
    __fmtCache.set(key, f);
  }
  return f;
}
function tzDayParts(ms){
  const parts = __formatter('wdS|day|monS').formatToParts(new Date(dms(ms)));
  let dow = '', num = '', month = '';
  for(const p of parts){
    if(p.type === 'weekday') dow = p.value;
    if(p.type === 'day') num = p.value;
    if(p.type === 'month') month = p.value;
  }
  return { dow, num, month };
}

function fmtDateUTC(ms){
  return withOrdinal(__formatter('wdS|day|monS').format(new Date(dms(ms))));
}

function fmtDateLongUTC(ms){
  return withOrdinal(__formatter('wdL|day|monL|yearN').format(new Date(dms(ms))));
}

function fmtDayMonthUTC(ms){
  return withOrdinal(__formatter('day|monS').format(new Date(dms(ms))));
}

/* Relative day label vs the active (today) changeover day.
   Hours-aware when nowMs + dayStartMs are given: tomorrow's game day
   can be hours away (e.g. 3h before the 18:00 UTC changeover), and
   "In 1 day" reads wrong there — so count down in hours/minutes
   under 24h. Called with one arg it keeps the plain day wording. */
function relativeDayLabel(diffDays, nowMs, dayStartMs){
  if(diffDays === 0) return 'Now';
  if(diffDays === -1) return 'Yesterday';
  if(diffDays === 1 && Number.isFinite(nowMs) && Number.isFinite(dayStartMs)){
    const startMs = dayStartMs + 86400000 + (stdHour() * 3600000);
    const msLeft = startMs - nowMs;
    if(msLeft > 0 && msLeft < 24 * 3600000) return `In ${formatHoursMinutes(msLeft)}`;
  }
  if(diffDays === 1) return 'In 1 day';
  if(diffDays > 1) return `In ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}

/* A day counts as "started" when any of its events has started: a
   rotation card whose start instant (per-family hour, GAC 21:00, TB
   transition moments) is past, or a live snapshot event starting
   inside that calendar day whose start is past. */
function dayHasStartedEvent(dateMs, episode, dayInEp, nowMs, liveEvents){
  if(!Number.isFinite(dateMs) || !Number.isFinite(nowMs)) return false;
  try {
    const items = getEventsForDay(dateMs, episode, dayInEp);
    for(const it of items){
      if(eventStartMs(it, dateMs) <= nowMs) return true;
    }
  } catch(e){}
  const dayEndMs = dateMs + 86400000;
  for(const e of liveEvents ?? []){
    const s = Number(e && e.startMs);
    if(!Number.isFinite(s)) continue;
    if(s >= dateMs && s < dayEndMs && s <= nowMs) return true;
  }
  return false;
}

/* Latest offset (never before the in-game day) whose day has a started
   event. In practice this is 0 or 1: after the morning starts (07:00
   fleet, 10:00 smuggling) the next calendar day already has something
   live, so the explorer opens there even though its 18:00 changeover
   is hours away; before those starts it stays on the in-game day.
   liveEvents is the live-events.json event list (or undefined for
   rotation only). */
function latestStartedDayOffset(nowMs, dayStartMs, liveEvents){
  if(!Number.isFinite(nowMs) || !Number.isFinite(dayStartMs)) return 0;
  let eraStartMs = null;
  try {
    const parsed = parseDateOnlyMs(typeof ERA_START_DATE !== 'undefined' ? ERA_START_DATE : null);
    eraStartMs = Number.isFinite(parsed) ? parsed : null;
  } catch(e){ eraStartMs = null; }
  if(eraStartMs == null) return 0;
  const eraLen = eraLengthDays();
  const epLen = episodeLengthDays();
  const rawDayIndex = Math.round((dayStartMs - eraStartMs) / 86400000) + 1;
  if(!Number.isFinite(rawDayIndex) || rawDayIndex < 1) return 0;
  const eraDay = posMod(rawDayIndex - 1, eraLen) + 1;
  const maxOffset = eraLen - eraDay;
  let best = 0;
  for(let off = 0; off <= maxOffset; off++){
    const dMs = dayStartMs + (off * 86400000);
    const dIdx = posMod(eraDay - 1 + off, eraLen) + 1;
    const ep = Math.floor((dIdx - 1) / epLen) + 1;
    const dep = posMod(dIdx - 1, epLen) + 1;
    if(dayHasStartedEvent(dMs, ep, dep, nowMs, liveEvents)) best = off;
  }
  return best;
}

/* Default explorer offset at load: the latest day (never before the
   in-game day) with an event that has started. A shared day link
   (#day-N) always wins over this. liveEvents is optional (rotation
   only when omitted). */
function defaultExplorerOffset(nowMs, dayStartMs, liveEvents){
  return latestStartedDayOffset(nowMs, dayStartMs, liveEvents);
}

/* Card pill for one event's own start instant (pass eventStartMs for
   rotation cards, e.startMs for live ones): already started reads
   "Now", otherwise the truncated duration ("In 3h", "In 30m",
   "In 1 day") — the same phrasing as the GAC dashboard countdown.
   GAC (21:00 UTC) and TB transition moments (06:00 on 36h TBs) flow
   through eventStartMs, so every card counts to its real start
   instead of the day's generic changeover. Falls back to the
   day-level wording without a usable clock. */
function relForEventStart(startMs, nowMs, dayFallback){
  if(!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return dayFallback;
  const left = startMs - nowMs;
  if(left <= 0) return 'Now';
  if(left < 86400000) return `In ${formatHoursMinutes(left)}`;
  const until = formatDayCount(left);
  return until.charAt(0).toUpperCase() + until.slice(1);
}

/* Terse sub-day duration ("2h 45m", "45m", "2h" when exact) so events
   minutes apart never share one label. Floored, like the dashboard's
   truncation convention — never claims sooner than reality. */
function formatHoursMinutes(ms){
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if(h < 1) return `${Math.max(1, m)}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/* Day-count labels that own their rounding ("Important Dates"
   cards): under 24h out, "In 1 day" reads wrong 3h out — count hours
   ("In 2h 45m") or minutes ("In 20m") instead. At 24h+ the duration
   reads "In under/over N days" rather than silently rounding.
   dayLabel is the fallback without a usable clock. */
function subDayCount(nowMs, targetMs, dayLabel){
  if(!Number.isFinite(nowMs) || !Number.isFinite(targetMs)) return dayLabel;
  const left = targetMs - nowMs;
  if(left <= 0) return dayLabel;
  if(left < 86400000) return `In ${formatHoursMinutes(left)}`;
  const until = formatDayCount(left);
  return until.charAt(0).toUpperCase() + until.slice(1);
}

/* Absolute era day (1-based) encoded in the shareable URL hash
   (#day-N), or null when the hash isn't a day link. Bounds-checked
   against the configured era length. Pure parsing — safe to test. */
function dayFromHash(hash){
  const m = /^#day-(\d+)$/.exec(hash || '');
  if(!m) return null;
  const day = Number(m[1]);
  if(!Number.isInteger(day)) return null;
  if(day < 1 || day > eraLengthDays()) return null;
  return day;
}

/* How long a changeover marker lasts. 24 hours each: GAC/TW phases,
   TB phases, fleet masteries, era battles, Proving Grounds and the
   Ultimate Journey — all run until the next daily changeover.
   Conquest runs Day 7→20 (14 days); Journey Rerun 1 lasts one week
   and Journey Rerun 2 lasts one month. */
const DAY_LONG_EVENTS = new Set([
  'gac_signup', 'gac_defense', 'gac_attack',
  'tw_signup', 'tw_defense', 'tw_offense',
  'fleet_executor', 'fleet_leviathan', 'fleet_profundity',
  'era_battle_1', 'era_battle_2',
  'proving_ground', 'ultimate_journey',
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
  // 36-hour TB phase boundaries fall at 18:00 and 06:00 alternating, so mid-phase
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

/* Duration of a rotation card in whole hours — null when the marker
   has no real span (moment markers, updates, payouts…). Marquee /
   era challenges run 7 days, journey guides 14, conquest per config;
   everything in DAY_LONG_EVENTS runs 24 hours; TB phases follow
   their run's hours-per-phase. Powers the card
   "starts X · N hrs" row. */
function eventDurationHours(item, dateMs, tbCtx){
  const icon = item && item.icon;
  if(typeof icon !== 'string') return null;
  if(icon === 'conquest_start') return conquestDurationDays() * 24;
  if(icon === 'journey_rerun_1') return 7 * 24;
  if(icon === 'journey_rerun_2'){
    // Same month-span math as eventDateRangeLabel above.
    const endMs = new Date(dateMs);
    const originalDay = endMs.getUTCDate();
    endMs.setUTCDate(1);
    endMs.setUTCMonth(endMs.getUTCMonth() + 1);
    const daysInEndMonth = new Date(utcDateMs(endMs.getUTCFullYear(), endMs.getUTCMonth() + 1, 0)).getUTCDate();
    endMs.setUTCDate(Math.min(originalDay, daysInEndMonth));
    return Math.max(1, Math.round((endMs.getTime() - dateMs) / 3600000));
  }
  if(icon === 'rote' || icon === 'tb_ends'){
    if(item.tbEndMoment != null) return null;
    const def = tbCtx && tbCtx.def;
    return (def && Number.isFinite(def.hoursPerPhase)) ? def.hoursPerPhase : 24;
  }
  if(icon.startsWith('marquee_') || icon.startsWith('era_challenge_')) return 7 * 24;
  if(icon === 'journey_guide') return 14 * 24;
  if(DAY_LONG_EVENTS.has(icon)) return 24;
  return null;
}

/* Whole hours rendered the way players say them: under a day in
   hours ("24 hrs"), longer spans in days and hours ("7 days",
   "1 day 12 hrs"). Pure — safe to test. */
function formatDurationHours(durH){
  if(!Number.isFinite(durH)) return 'N/A';
  const h = Math.max(1, Math.round(durH));
  if(h <= 24) return `${h} hrs`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  const days = d === 1 ? '1 day' : `${d} days`;
  if(r === 0) return days;
  return `${days} ${r === 1 ? '1 hr' : `${r} hrs`}`;
}

/* Per-family rotation start hour (UTC). GAC keeps its own 21:00
   changeover; smuggling runs / fleet mastery follow their real daily
   times from live game data (10:00 / 07:00), not the 18:00 TW/TB
   changeover everything else uses. Reads EVENT_START_HOURS from
   config.js with built-in fallbacks so older configs keep working. */
function eventStartHourForIcon(icon){
  const table = (typeof EVENT_START_HOURS !== 'undefined' && EVENT_START_HOURS) || {};
  if(icon === 'smugglersrun') return Number.isFinite(table['smugglers-run']) ? table['smugglers-run'] : 10;
  if(icon && icon.startsWith('fleet_')) return Number.isFinite(table.fleet) ? table.fleet : 7;
  if(icon === 'proving_ground') return Number.isFinite(table['proving-grounds']) ? table['proving-grounds'] : 18;
  if(icon === 'rote' || icon === 'tb_ends' || (icon && icon.startsWith('tw_'))) return twTbHour();
  return null;
}

function provingGroundHour(){
  const table = (typeof EVENT_START_HOURS !== 'undefined' && EVENT_START_HOURS) || {};
  return Number.isFinite(table['proving-grounds']) ? table['proving-grounds'] : 18;
}

function eventDisplayMs(item, dateMs){
  const icon = item && item.icon;
  if(icon && icon.startsWith('gac_')) return dateMs + (gacHour() * 3600000);
  const famHour = eventStartHourForIcon(icon);
  return dateMs + ((famHour != null ? famHour : stdHour()) * 3600000);
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
      status: `Week ${info.week}`,
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
      status: `Week ${info.week}, Round ${info.round}`,
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
      status: `Week ${info.week}, Round ${info.round}`,
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

/* Day-count phrasing that owns its rounding: exact days read
   "in N days", rounding up reads "in under N days", rounding down
   reads "in over N days" — a timer never silently rounds. */
function formatDayCount(diffMs){
  const d = diffMs / 86400000;
  const n = Math.max(1, Math.round(d));
  const word = `day${n === 1 ? '' : 's'}`;
  if(Math.abs(d - n) < 1e-9) return `in ${n} ${word}`;
  return n > d ? `in under ${n} ${word}` : `in over ${n} ${word}`;
}

/* Countdown phrasing truncates (floor) below a day so counts match how
   players count: 22 hours out reads "in 22 hours", not "in 1 day".
   Sub-minute diffs read "in 1 minute" rather than "in 0 minutes".
   Day counts own their rounding via formatDayCount. */
function formatGacUntil(nowMs, targetMs){
  const diffMs = targetMs - nowMs;
  if(!Number.isFinite(diffMs) || diffMs <= 0) return 'now';
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if(minutes < 60) return `in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(diffMs / 3600000);
  if(hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  return formatDayCount(diffMs);
}

function conquestInfoForDay(episode, dayInEp){
  const start = conquestStartDay(), end = conquestEndDay();
  if(dayInEp < start || dayInEp > end) return null;
  const { cNum, note } = conquestChapterForEpisode(episode);
  const total = conquestDurationDays();
  return { active: true, day: dayInEp - start + 1, total, cNum, note, finalDay: dayInEp === end };
}

/* Multi-day rotation windows covering (episode, dayInEp), for the
   explorer's indicator row (mirrors the conquest badge + live "Day X
   of Y" badges). Marquee and era challenges run 7 days from their
   start day; journey guide unlocks run 14 days. Start days are read
   from the episode tables (not hardcoded), so rotation edits flow
   through. Returns [{ icon, day, total }]. */
function rotationWindowsForDay(episode, dayInEp){
  const out = [];
  if(!Number.isInteger(episode) || !Number.isInteger(dayInEp)) return out;
  const overrides = (typeof EPISODE_OVERRIDES !== 'undefined' && EPISODE_OVERRIDES) || {};
  const epTable = overrides[episode] || {};
  const starts = {}; // icon -> sorted start days within the episode
  for(const [dStr, list] of Object.entries(epTable)){
    const d = Number(dStr);
    if(!Number.isInteger(d) || !Array.isArray(list)) continue;
    for(const it of list){
      if(!it || typeof it.icon !== 'string') continue;
      if(!/^(marquee_\d+|era_challenge_\d+|journey_guide)$/.test(it.icon)) continue;
      if(!Array.isArray(starts[it.icon])) starts[it.icon] = [];
      if(!starts[it.icon].includes(d)) starts[it.icon].push(d);
    }
  }
  for(const [icon, days] of Object.entries(starts)){
    const total = icon === 'journey_guide' ? 14 : 7;
    for(const s of days.sort((a, b) => a - b)){
      if(dayInEp >= s && dayInEp < s + total){
        out.push({ icon, day: dayInEp - s + 1, total });
        break;
      }
    }
  }
  return out;
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
      main: `Starts ${formatGacUntil(st.nowMs, startDateMs)} · ${fmtDayMonthUTC(startDateMs)}`,
      sub: `Conquest Run ${cNum} will begin.`,
      cNum: cNum
    };
  } else if (targetDay < start) {
    const daysUntil = start - targetDay;
    const startDateMs = st.currentDayStartMs + (daysUntil * 86400000) + (stdHour() * 3600000);
    return {
      status: 'UPCOMING', badgeClass: 'purple', title: titleNote,
      main: `Starts ${formatGacUntil(st.nowMs, startDateMs)} · ${fmtDayMonthUTC(startDateMs)}`,
      sub: `Event ${cNum} Starts`,
      cNum: cNum
    };
  } else if (targetDay >= start && targetDay <= end) {
    const cqDay = targetDay - start + 1;
    // Durations own their rounding: day 5 of 14 (9d23h out) reads
    // "Ends in under 10 days", and a final evening reads
    // "Ends in 5 hours". The end date alongside stays exact.
    const remaining = end - targetDay;
    const endDateMs = st.currentDayStartMs + ((remaining + 1) * 86400000) + (stdHour() * 3600000);
    const pgStartMs = st.currentDayStartMs + 86400000 + (provingGroundHour() * 3600000);
    return {
      status: remaining === 0 ? 'FINAL DAY' : 'ACTIVE',
      badgeClass: 'purple', title: titleNote,
      main: `Conquest Day ${cqDay} of ${total}`,
      sub: remaining === 0 ? `Proving Grounds starts ${formatGacUntil(st.nowMs, pgStartMs)}` : `Ends ${formatGacUntil(st.nowMs, endDateMs)} · ${fmtDayMonthUTC(endDateMs)}`,
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

  // Payout hits the inbox in ~30 seconds — no event is actually running,
  // so it reads as Intermission rather than an active TW.
  const tw = items.find(i => i.icon.startsWith('tw_') && i.icon !== 'tw_payout');
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
        // Resolve the actual phase for Rise of the Empire (6 phases).
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
  if(typeof DATACRON_SKIP_DATES !== 'undefined'){
    if(!Array.isArray(DATACRON_SKIP_DATES)) issues.push('DATACRON_SKIP_DATES must be a list of YYYY-MM-DD dates.');
    else DATACRON_SKIP_DATES.forEach((d, i) => {
      if(!isDateStr(d)) issues.push(`DATACRON_SKIP_DATES[${i}] is not YYYY-MM-DD.`);
    });
  }
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
  if(typeof TW_TB_HOUR_UTC !== 'undefined'
    && (!Number.isInteger(TW_TB_HOUR_UTC) || TW_TB_HOUR_UTC < 0 || TW_TB_HOUR_UTC > 23))
    issues.push('TW_TB_HOUR_UTC must be an integer from 0 to 23.');

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
     runtime, but the config should be fixed). Icons must also exist in
     EVENT_ICONS — every legitimate schedule icon does, so anything else
     is a typo that would render with fallback art (or no tracker). */
  const knownIcons = (typeof EVENT_ICONS !== 'undefined' && EVENT_ICONS)
    ? new Set([...Object.keys(EVENT_ICONS), 'datacron_set'])
    : null;
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
      else if(knownIcons && !knownIcons.has(item.icon))
        issues.push(`${name}[${i}] has unknown icon "${item.icon}".`);
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
    // Unknown TW icon (config typo): no tracker rather than a tracker
    // with no active phase. The label still renders and
    // validateScheduleConfig() reports the bad icon.
    if(idx < 0) return null;
    return { type: 'tw', phaseIndex: idx };
  } else {
    if(active.info.icon === 'tb_ends') return { type: 'tb', complete: true, phases: active.info.phases || 6 };
    return { type: 'tb', phaseIndex: Math.max(0, (active.info.phaseNum || 1) - 1), phases: active.info.phases || 6 };
  }
}
