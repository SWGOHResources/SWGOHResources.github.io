/* TIME ENGINE — pure date/math helpers. Depends on config.js globals. No DOM. */

function getMonthlyEvents(dateMs){
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

function gacInfoForDate(dateMs){
  const [gy, gm, gd] = GAC_CYCLE_START_DATE.split('-').map(Number);
  const gacStartMs = Date.UTC(gy, gm - 1, gd, 21, 0, 0); 
  const alignedMs = dateMs + (21 * 3600000); 
  const diffMs = alignedMs - gacStartMs;
  
  const rawDays = Math.floor(diffMs / 86400000);
  const cycleDay = ((rawDays % 28) + 28) % 28 + 1;
  const cycleNum = Math.floor(rawDays / 28);
  
  const format = (cycleNum % 2 === 0) ? '5v5' : '3v3'; 
  return { cycleDay, cycleNum, format, rawDays };
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
    if (rnd.phase === 'signup') return [ev('gac_signup', `GAC Week ${rnd.week} Signup & Roster Lock`)];
    if (rnd.phase === 'defense') return [ev('gac_defense', `GAC Round ${rnd.round} Defense (Week ${rnd.week})`)];
    if (rnd.phase === 'offense') return [ev('gac_attack', `GAC Round ${rnd.round} Attack (Week ${rnd.week})`)];
  }
  return [];
}

// Next date (UTC midnight) on/after dateMs on which a GAC Signup Phase opens

// Next date (UTC midnight) on/after dateMs on which a GAC Signup Phase opens
function nextGacSignupOnOrAfter(dateMs){
  let d = dateMs;
  while(true){
    const info = gacInfoForDate(d);
    const dayInWeek = ((info.cycleDay - 1) % 7) + 1;
    const week = Math.ceil(info.cycleDay / 7);
    if (week <= 3 && dayInWeek === 1) {
      return { dateMs: d, format: info.format, gacWeek: week };
    }
    d += 86400000;
  }
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

function getGameStatus(){
  const now = new Date();
  const nowMs = now.getTime();
  const msPerDay = 86400000;

  const [y, m, d] = ERA_START_DATE.split('-').map(Number);

  // 1) Standard Event Changeover (18:00 UTC)
  const stdStartMs = Date.UTC(y, m - 1, d, 18, 0, 0);
  let diffMs = nowMs - stdStartMs;
  let rawDayIndex = Math.floor(diffMs / msPerDay) + 1;
  if(diffMs < 0) rawDayIndex = 1;

  const eraDay = ((rawDayIndex - 1) % 84) + 1;
  const cycleNum = Math.floor((rawDayIndex - 1) / 84);

  const episode = Math.floor((eraDay - 1) / 28) + 1;
  const dayInEp = ((eraDay - 1) % 28) + 1;
  const week = Math.floor((dayInEp - 1) / 7) + 1;

  // Active Calendar Day associated with current 18:00 UTC changeover
  const currentDayStartMs = Date.UTC(y, m - 1, d, 0, 0, 0) + ((rawDayIndex - 1) * msPerDay);
  const activeDayObj = new Date(currentDayStartMs);
  const weekdayName = WEEKDAY_NAMES[activeDayObj.getUTCDay()];

  // 2) GAC Cycle — independent 28-day cycle, own reference date, own changeover (21:00 UTC)
  const gacInfo = gacInfoForDate(currentDayStartMs);

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
    currentEraStartMs: Date.UTC(y, m - 1, d, 0, 0, 0) + (cycleNum * 84 * msPerDay),
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
  const sorted = [...offsetsInCycle].sort((a, b) => a - b);
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
  const eraDay = ((absDay - 1) % ERA_LENGTH_DAYS) + 1;
  const episode = Math.floor((eraDay - 1) / EPISODE_LENGTH_DAYS) + 1;
  const dayInEp = ((eraDay - 1) % EPISODE_LENGTH_DAYS) + 1;
  const week = Math.floor((dayInEp - 1) / 7) + 1;
  const dateMs = eraBaseStartMs + (absDay - 1) * 86400000;
  return { eraDay, episode, dayInEp, week, dateMs };
}

function dateMsToEraInfo(dateMs, eraBaseStartMs){
  const absDay = Math.round((dateMs - eraBaseStartMs) / 86400000) + 1;
  return absDayToInfo(absDay, eraBaseStartMs);
}

function getConquestLabel(){
  return 'Conquest Unit (3rd of Volume)';
}

/* =========================================================
   DATACRON EXPIRATION HELPERS
   ========================================================= */

// Returns the datacron set that is next/currently expiring (soonest
// expires date that hasn't passed yet). Falls back to the last set
// in the config if every set's expiration has already passed —
// update DATACRON_SETS with the next set(s) when that happens.

// Returns the datacron set that is next/currently expiring (soonest
// expires date that hasn't passed yet). Falls back to the last set
// in the config if every set's expiration has already passed —
// update DATACRON_SETS with the next set(s) when that happens.
function getCurrentDatacronSet(nowMs){
  const withMs = DATACRON_SETS.map(s => ({
    ...s,
    expiresMs: Date.parse(s.expires + 'T18:00:00Z')
  })).sort((a, b) => a.expiresMs - b.expiresMs);

  const upcoming = withMs.find(s => s.expiresMs >= nowMs);
  return upcoming || withMs[withMs.length - 1];
}

// A datacron set can only ever be equipped/used for Territory War and
// GAC — never Territory Battle, Conquest, etc. This scans backward day
// by day from the set's expiry date to find the most recent TW or GAC
// event, so we can tell players the last event they'll actually get to
// use the set in before it's removed.
function getLastUsableGuildEvent(expiresMs, eraBaseStartMs){
  let cursorMs = expiresMs;
  for(let back = 0; back <= 84; back++){
    const info = dateMsToEraInfo(cursorMs, eraBaseStartMs);
    const items = getEventsForDay(cursorMs, info.episode, info.dayInEp);
    const usableItem = items.find(i => i.icon.startsWith('tw_') || i.icon.startsWith('gac_'));
    if(usableItem) return { item: usableItem, dateMs: cursorMs };
    cursorMs -= 86400000;
  }
  return null;
}

function getUnlockWindows(st){
  const conquestEndAbs = nextOccurrenceAbs(CONQUEST_END_OFFSETS, st.rawDayIndex, ERA_LENGTH_DAYS);
  const conquestEndInfo = absDayToInfo(conquestEndAbs, st.eraBaseStartMs);
  
  // Search for the first signup strictly after the unlock to ensure roster lock captures it
  const conquestSignup = nextGacSignupOnOrAfter(conquestEndInfo.dateMs + 86400000);
  conquestSignup.eraInfo = dateMsToEraInfo(conquestSignup.dateMs, st.eraBaseStartMs);

  const eraStartAbs = nextOccurrenceAbs(ERA_START_OFFSETS, st.rawDayIndex, ERA_LENGTH_DAYS);
  const eraStartInfo = absDayToInfo(eraStartAbs, st.eraBaseStartMs);
  
  const eraSignup = nextGacSignupOnOrAfter(eraStartInfo.dateMs + 86400000);
  eraSignup.eraInfo = dateMsToEraInfo(eraSignup.dateMs, st.eraBaseStartMs);

  return {
    conquestLabel: getConquestLabel(),
    conquestEndInfo, conquestSignupInfo: conquestSignup,
    eraStartInfo, eraSignupInfo: eraSignup,
    conquestAlreadyUnlocked: conquestEndAbs <= st.rawDayIndex,
    eraAlreadyStarted: eraStartAbs <= st.rawDayIndex
  };
}

function getDayEvents(episode, dayInEp){
  const o = EPISODE_OVERRIDES[episode] && EPISODE_OVERRIDES[episode][dayInEp];
  return o || COMMON_DAYS[dayInEp] || [];
}

function getEventsForDay(dateMs, episode, dayInEp){
  return [...getDayEvents(episode, dayInEp), ...gacEventsForDate(dateMs), ...getMonthlyEvents(dateMs)];
}

function fmtDateUTC(ms){
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
}

function getGacStatus(st){
  const format = st.gacFormat;
  const nextFormat = format === '5v5' ? '3v3' : '5v5';
  const info = getGacRoundInfo(st.gacCycleDay);

  if(info.phase === 'off'){
     const daysUntilNext = 29 - st.gacCycleDay;
     const untilPhrase = daysUntilNext === 1 ? 'tomorrow' : `in ${daysUntilNext} days`;
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

  const daysUntilNextPhase = 1; 
  const untilPhrase = 'tomorrow'; 

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
      sub: `Round ${info.round} Attack Phase begins ${untilPhrase}`,
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

function getConquestStatus(st){
  let targetEp = st.episode;
  let targetDay = st.dayInEp;
  let isUpcomingNextEp = false;
  
  // If we are past Day 21, the current episode's conquest is over.
  // We point the dashboard to the NEXT episode's conquest.
  if (targetDay > 21) {
    targetEp = targetEp === 3 ? 1 : targetEp + 1;
    isUpcomingNextEp = true;
  }

  // Map the Episode to the correct Conquest Chapter Number
  // Ep 1 = Chapter 2 | Ep 2 = Chapter 3 | Ep 3 = Chapter 1
  let cNum = 1;
  let titleNote = '';
  if (targetEp === 1) { cNum = 2; titleNote = 'Event 2 of Volume'; }
  else if (targetEp === 2) { cNum = 3; titleNote = 'Event 3 of Volume (Final)'; }
  else if (targetEp === 3) { cNum = 1; titleNote = 'Event 1 of New Volume'; }

  if (isUpcomingNextEp) {
    const daysUntil = (28 - st.dayInEp) + 7;
    return {
      status: 'UPCOMING', badgeClass: 'purple', title: titleNote,
      main: `Starts in ${daysUntil} days`,
      sub: `Conquest Run ${cNum} will begin.`,
      cNum: cNum
    };
  } else if (targetDay < 7) {
    return {
      status: 'UPCOMING', badgeClass: 'purple', title: titleNote,
      main: `Starts in ${7 - targetDay} days`,
      sub: `Event ${cNum} Starts`,
      cNum: cNum
    };
  } else if (targetDay >= 7 && targetDay <= 20) {
    const cqDay = targetDay - 6;
    const remaining = 20 - targetDay;
    return {
      status: remaining === 0 ? 'ENDING TODAY' : 'ACTIVE',
      badgeClass: 'purple', title: titleNote,
      main: `Conquest Day ${cqDay} of 14`,
      sub: remaining === 0 ? 'Proving Grounds starts tomorrow' : `Ends in ${remaining} days`,
      cNum: cNum
    };
  } else if (targetDay === 21) {
    return {
      status: 'EVENT OVER', badgeClass: 'purple', title: titleNote,
      main: 'Proving Grounds Active',
      sub: 'Conquest has ended! Unit is now claimable.',
      cNum: cNum
    };
  }
}

function getGuildEventSummary(episode, dayInEp){
  const items = getDayEvents(episode, dayInEp);

  const tw = items.find(i => i.icon.startsWith('tw_'));
  if(tw) return `TW ${tw.label}`;

  const tbEnd = items.find(i => i.icon === 'tb_ends');
  if(tbEnd) return 'Territory Battle Ends';

  const rote = items.find(i => i.icon === 'rote');
  if(rote) return `ROTE ${rote.label}`;

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
        const m = tbItem.label.match(/Phase (\d+)/);
        tbFound = { daysAgo: back, icon: tbItem.icon, phaseNum: m ? parseInt(m[1], 10) : null };
      }
    }
    if(twFound && tbFound) break;
  }
  return { tw: twFound, tb: tbFound };
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
    if(active.info.icon === 'tb_ends') return { type: 'tb', complete: true };
    return { type: 'tb', phaseIndex: (active.info.phaseNum || 1) - 1 };
  }
}
