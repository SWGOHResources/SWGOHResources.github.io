/* RENDER — DOM builders. Depends on config.js + time.js globals. */

// A datacron set can only ever be equipped/used for Territory War and
// GAC — never Territory Battle, Conquest, etc. This scans backward day
// by day from the set's expiry date to find the most recent TW or GAC
// event, so we can tell players the last event they'll actually get to
// use the set in before it's removed.

function renderUnlockWindows(st){
  const el = document.getElementById('unlockWindows');
  if(!el) return;

  // --- CONQUEST UNIT ---
  // Finds the NEXT conquest-end day (End of Episode 2 / Monday)
  const cqAbs = nextOccurrenceAbs(CONQUEST_END_OFFSETS, st.rawDayIndex, eraLengthDays());
  const cqInf = absDayToInfo(cqAbs, st.eraBaseStartMs);
  const cqChapter = conquestChapterForEpisode(cqInf.episode);
  const cqDateMs = cqInf.dateMs;
  
  const cqDays = Math.round((cqDateMs - st.currentDayStartMs) / 86400000);
  const cqUnlocked = cqAbs <= st.rawDayIndex || cqDays <= 0;
  const cqUnlockMs = cqDateMs + (stdHour() * 3600000);
  // The unit itself is never in the data feed — once its conquest ends
  // the name is still unannounced, so never claim it is playable.
  const cqBadge = cqUnlocked ? 'TBA' : 'UPCOMING';
  const cqBadgeClass = cqUnlocked ? 'off' : 'purple';
  const cqMain = cqUnlocked
    ? 'Unit yet to be announced'
    : subDayCount(st.nowMs, cqUnlockMs, `In ${cqDays} day${cqDays === 1 ? '' : 's'}`);
  const cqDateLine = fmtDateLongUTC(gameDayDisplayMs(cqDateMs));
  const cqSub = cqUnlocked
    ? 'Conquest over — new unit yet to be announced'
    : 'The new conquest unit becomes playable';

  // Roster locks at the configured defense-phase offset.
  const cqNextSignupDate = cqDateMs + (86400000 * conquestLockOffsetDays());
  const cqGacInfo = gacInfoForDate(cqNextSignupDate);
  const cqGac = gacUsableWeek(cqGacInfo.cycleDay, cqGacInfo.format);
  const cqGacWeek = cqGac.week;

  // --- ERA UNIT ---
  // Finds the NEXT era-start day (Era Changeover / Tuesday)
  const nextEraFromDay = st.preEra ? st.rawDayIndex : st.rawDayIndex + 1;
  const eraAbs = nextOccurrenceAbs(ERA_START_OFFSETS, nextEraFromDay, eraLengthDays());
  const eraInf = absDayToInfo(eraAbs, st.eraBaseStartMs);
  const eraDateMs = eraInf.dateMs;
  
  const eraDays = Math.round((eraDateMs - st.currentDayStartMs) / 86400000);
  // Before launch the era hasn't started: count down to it instead of
  // claiming THIS ERA. daysUntilEra already counts display-zone days.
  const eraUnlockMs = eraDateMs + (stdHour() * 3600000);
  const eraCountLabel = st.preEra
    ? (st.daysUntilEra <= 0 ? 'Today' : `In ${st.daysUntilEra} day${st.daysUntilEra === 1 ? '' : 's'}`)
    : (eraAbs <= st.rawDayIndex || eraDays <= 0 ? 'Live now' : subDayCount(st.nowMs, eraUnlockMs, `In ${eraDays} day${eraDays === 1 ? '' : 's'}`));
  const eraBadge = st.preEra ? 'UPCOMING' : (eraDays <= 7 ? 'ENDING' : 'ACTIVE');
  const eraMain = eraCountLabel;
  const eraDateLine = fmtDateLongUTC(gameDayDisplayMs(eraDateMs));
  const eraSub = st.preEra ? 'The new era begins' : 'Current era ends, units enter legacy modes';

  // Roster locks at the configured defense-phase offset.
  const eraNextSignupDate = eraDateMs + (86400000 * eraLockOffsetDays());
  const eraGacInfo = gacInfoForDate(eraNextSignupDate);
  const eraGac = gacUsableWeek(eraGacInfo.cycleDay, eraGacInfo.format);
  const eraGacWeek = eraGac.week;

  // --- DATACRON EXPIRATIONS ---
  const cron = getCurrentDatacronSet(st.nowMs);
  const cronMeta = (cron && CRON_COLOR_META[cron.color]) || CRON_COLOR_META.orange;
  // Truncated like the other dashboard counts: 28d 23h out reads
  // "Expires in 28 days".
  const daysLeft = cron ? Math.floor((cron.expiresMs - st.nowMs) / 86400000) : 0;
  const cronCountLabel = !cron ? ''
    : cron.allExpired ? 'Expired'
    : subDayCount(st.nowMs, cron.expiresMs, daysLeft <= 0 ? 'Expires today' : `In ${daysLeft} day${daysLeft === 1 ? '' : 's'}`);
  const cronBadge = !cron ? 'NONE' : cron.allExpired ? 'EXPIRED' : 'ACTIVE';
  const cronBadgeClass = (!cron || cron.allExpired) ? 'off' : 'orange';
  const cronMain = cron ? cronCountLabel : 'No set configured';
  const cronDateLine = cron ? fmtDateLongUTC(cron.expiresMs) : '';
  const cronSub = !cron ? 'Add the next set to DATACRON_SETS in config.js'
    : cron.allExpired ? `${cron.name} has expired, add the next set to DATACRON_SETS`
    : `${cron.name}${cron.hasFDC ? ' + FDC' : ''} expires to inbox`;
  const lastUsable = cron ? getLastUsableGuildEvent(cron.expiresMs, st.eraBaseStartMs) : null;
  let lastUsableLabel = '—';
  if(lastUsable){
    const labels = [];
    if(lastUsable.gac){
      const gacInfo = gacInfoForTimestamp(lastUsable.gac.startMs);
      const usable = gacUsableWeek(gacInfo.cycleDay, gacInfo.format);
      labels.push(`GAC Week ${usable.week} (${usable.format})`);
    }
    if(lastUsable.tw) labels.push(lastUsable.tw.twNumber ? `TW ${lastUsable.tw.twNumber}` : 'TW');
    lastUsableLabel = labels.join(' + ');
  }

  el.innerHTML = `
    <div class="status-card purple-card">
      <div class="sc-header"><span class="sc-title">Conquest Unit (${conquestOrdinal(cqChapter.cNum)} of Volume)</span><span class="sc-badge ${cqBadgeClass}">${cqBadge}</span></div>
      <div class="uw-body" style="--accent:var(--purple);--accent-dim:var(--purple-dim);--accent-border:var(--purple-border)">
        <div class="uw-img"><div class="art-badge">CQ</div><img src="${IMG_BASE}${CONQUEST_UNIT_IMAGE}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main"><div class="sc-val">${cqMain}</div><div class="uw-date">${cqDateLine}</div><div class="sc-sub">${cqSub}</div></div>
          <div class="sc-footer" style="flex-direction:column;align-items:flex-start;gap:2px;">
            <span>Usable in GAC: <span class="highlight">Week ${cqGacWeek} (${cqGac.format})</span></span>
            <span>Roster locks: ${fmtDayMonthUTC(gameDayDisplayMs(cqNextSignupDate))} (Defense Starts)</span>
          </div>
        </div>
      </div>
    </div>
    <div class="status-card orange-card">
      <div class="sc-header"><span class="sc-title">End of Current Era</span><span class="sc-badge orange">${eraBadge}</span></div>
      <div class="uw-body" style="--accent:var(--orange);--accent-dim:var(--orange-dim);--accent-border:var(--orange-border)">
        <div class="uw-img"><div class="art-badge">ERA</div><img src="${IMG_BASE}${ERA_UNIT_IMAGE}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main"><div class="sc-val">${eraMain}</div><div class="uw-date">${eraDateLine}</div><div class="sc-sub">${eraSub}</div></div>
          <div class="sc-footer" style="flex-direction:column;align-items:flex-start;gap:2px;">
            <span>Usable in GAC: <span class="highlight">Week ${eraGacWeek} (${eraGac.format})</span></span>
            <span>Roster locks: ${fmtDayMonthUTC(gameDayDisplayMs(eraNextSignupDate))} (Defense Starts)</span>
          </div>
        </div>
      </div>
    </div>
    <div class="status-card" style="border-color:${cronMeta.border}">
      <div class="sc-header"><span class="sc-title">Datacron Expirations</span><span class="sc-badge ${cronBadgeClass}">${cronBadge}</span></div>
      <div class="uw-body" style="--accent:${cronMeta.accent};--accent-dim:${cronMeta.dim};--accent-border:${cronMeta.border}">
        <div class="uw-img"><div class="art-badge">${cronMeta.label.slice(0,3).toUpperCase()}</div><img src="${IMG_BASE}${cronMeta.asset}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main">
            <div class="sc-val">${cronMain}</div>
            ${cron ? `<div class="uw-date">${cronDateLine}</div>` : ''}
            <div class="sc-sub">${cronSub}</div>
          </div>
          <div class="sc-footer" style="flex-direction:column;align-items:flex-start;gap:2px;">
            <span>Last usable: <span class="highlight">${lastUsableLabel}</span></span>
            <span>Tip: dismantle unused datacrons manually</span>
          </div>
        </div>
      </div>
    </div>`;
}

function gacRoundTrackerHTML(gac){
  // Always render the same-height rail so the card doesn't collapse /
  // jump when no round is live (signup / off-week). Empty segments keep
  // the layout identical to defense / offense phases.
  if(!gac.round){
    return `<div class="gac-track"><div class="gac-track-bar"><span class="seg"></span><span class="seg"></span><span class="seg"></span></div><div class="gac-track-labels"><span>R1</span><span>R2</span><span>R3</span></div></div>`;
  }

  let segs = '';
  let labels = '';
  for(let r = 1; r <= 3; r++){
    let segCls = '';
    let labelCls = '';
    if(r < gac.round){ segCls = 'done'; labelCls = 'done'; }
    else if(r === gac.round){ segCls = `current phase-${gac.roundPhase}`; labelCls = 'current'; }
    segs += `<span class="seg ${segCls}"></span>`;
    labels += `<span class="${labelCls}">R${r}</span>`;
  }
  return `<div class="gac-track"><div class="gac-track-bar">${segs}</div><div class="gac-track-labels">${labels}</div></div>`;
}

function conquestVolumeTrackerHTML(cNum){
  let segs = '';
  let labels = '';
  const labelText = ['C1', 'C2', 'C3'];
  for(let i = 1; i <= 3; i++){
    let segCls = '';
    let labelCls = '';
    if(i < cNum){ segCls = 'done'; labelCls = 'done'; }
    else if(i === cNum){ segCls = 'done'; labelCls = 'current'; }
    
    segs += `<span class="seg ${segCls}" style="${i <= cNum ? 'background:var(--purple)' : ''}"></span>`;
    labels += `<span class="${labelCls}" style="${i === cNum ? 'color:var(--purple)' : ''}">${labelText[i-1]}</span>`;
  }
  return `<div class="pip-track"><div class="pip-track-bar">${segs}</div><div class="pip-track-labels">${labels}</div></div>`;
}

function guildPhaseTrackerHTML(st){
  const gp = getGuildPhaseInfo(st);
  if(!gp) return '';

  if(gp.type === 'tw'){
    let segs = '', labels = '';
    for(let i = 0; i < 3; i++){
      const isDone = gp.complete || i < gp.phaseIndex;
      const isCurrent = !gp.complete && i === gp.phaseIndex;
      segs += `<span class="seg ${isDone || isCurrent ? 'done' : ''}" style="${isDone || isCurrent ? 'background:var(--amber)' : ''}"></span>`;
      labels += `<span class="${isCurrent ? 'current' : (isDone ? 'done' : '')}" style="${isCurrent ? 'color:var(--amber)' : ''}">${TW_PHASE_LABELS[i]}</span>`;
    }
    return `<div class="pip-track"><div class="pip-track-bar">${segs}</div><div class="pip-track-labels">${labels}</div></div>`;
  } else {
    // TB tracker length follows the tracked TB (6 phases for
    // Hoth/RotE, 4 for Separatist Might / Republic Offensive).
    const n = gp.phases || 6;
    const capped = Math.min(gp.complete ? n : gp.phaseIndex, n - 1);
    let segs = '', labels = '';
    for(let i = 0; i < n; i++){
      const isDone = gp.complete || i < capped;
      const isCurrent = !gp.complete && i === capped;
      segs += `<span class="seg ${isDone || isCurrent ? 'done' : ''}" style="${isDone || isCurrent ? 'background:var(--amber)' : ''}"></span>`;
      labels += `<span class="${isCurrent ? 'current' : (isDone ? 'done' : '')}" style="${isCurrent ? 'color:var(--amber)' : ''}">P${i+1}</span>`;
    }
    return `<div class="pip-track"><div class="pip-track-bar">${segs}</div><div class="pip-track-labels">${labels}</div></div>`;
  }
}

/* =========================================================
   STATUS DASHBOARD & MERGED HERO BUILDER
   ========================================================= */

/* Static per-config labels (era name, day counts, changeover hour).
   Re-applied on every render so a config edit or era rollover never
   leaves stale hardcoded text behind. Missing elements are skipped so
   this stays safe on pages with partial markup. */
function renderStaticMeta(){
  const setText = (id, text) => { const el = document.getElementById(id); if(el) el.textContent = text; };
  if(typeof ERA_NAME !== 'undefined') setText('eraTitle', `Event Schedule for ${ERA_NAME}`);
  setText('mhOfVal', `/ ${eraLengthDays()}`);
  setText('fullScheduleCount', `All ${eraLengthDays()} days of the current Era baseline.`);
  const h = (typeof stdHour === 'function') ? stdHour() : 18;
  setText('cbLabel', `Next Changeover (${h}:00 UTC)`);
  const tzNote = `Changeovers happen at the same moment worldwide (${h}:00 UTC) — this only changes how times are shown`;
  ['tzSelect', 'tzSelectMobile'].forEach(id => {
    const sel = document.getElementById(id);
    if(sel) sel.title = tzNote;
  });
}

function renderMergedHero(st){
  if(!document.getElementById('mhDayVal')) return;
  const episodeCount = Math.ceil(eraLengthDays() / episodeLengthDays());
  const weeksPerEpisode = Math.ceil(episodeLengthDays() / 7);
  document.getElementById('mhDayVal').textContent = st.bossEraDay;
  document.getElementById('mhEpVal').textContent = `${st.episode} of ${episodeCount}`;
  document.getElementById('mhWeekVal').textContent = `${st.week} of ${weeksPerEpisode}`;
  document.getElementById('mhWeekdayVal').textContent = st.weekdayName;

  const fillPct = Math.min(100, Math.max(0, (st.bossEraDay / eraLengthDays()) * 100));
  document.getElementById('mhFill').style.width = fillPct + '%';

  const eraEndMs = st.currentEraStartMs + ((eraLengthDays() - 1) * 86400000);
  document.getElementById('mhStartDate').textContent = fmtDateUTC(gameDayDisplayMs(st.currentEraStartMs));
  document.getElementById('mhEndDate').textContent = fmtDateUTC(gameDayDisplayMs(eraEndMs));
  document.getElementById('mhDaysRemaining').textContent = st.preEra
    ? (st.daysUntilEra <= 0 ? 'Era starts today' : `Era starts in ${st.daysUntilEra} day${st.daysUntilEra === 1 ? '' : 's'}`)
    : `${eraLengthDays() - st.bossEraDay} days remaining`;

  // Stale-era banner: the engine rolls into a phantom next cycle once the
  // configured era ends. Anchor staleness to the configured BASE era
  // (not the rolling cycle, which would hide the banner again after
  // rollover): any now past the base era's final changeover means the
  // config is outdated. Hidden again once ERA_START_DATE is updated.
  const staleBanner = document.getElementById('staleBanner');
  if(staleBanner){
    const baseEndMs = st.eraBaseStartMs + ((eraLengthDays() - 1) * 86400000);
    const baseOverMs = baseEndMs + 86400000 + (stdHour() * 3600000);
    const stale = !st.preEra && st.nowMs >= baseOverMs;
    staleBanner.hidden = !stale;
    if(stale){
      const endLabel = fmtDateLongUTC(gameDayDisplayMs(baseEndMs));
      const eraName = (typeof ERA_NAME !== 'undefined' && ERA_NAME) ? ERA_NAME : 'This era';
      const textEl = document.getElementById('staleBannerText');
      if(textEl) textEl.innerHTML = `<strong>${escHTML(eraName)}</strong> ended ${endLabel} — dates below are the old rotation until the schedule is updated.`;
    }
  }
}

function renderStatusDashboard(st){
  const container = document.getElementById('statusDashboard');
  if(!container) return;

  const gac = getGacStatus(st);
  const conq = getConquestStatus(st);

  const tmrwDayIndex = (st.eraDay % eraLengthDays()) + 1;
  const tmrwEpisode = Math.floor((tmrwDayIndex - 1) / episodeLengthDays()) + 1;
  const tmrwDayInEp = ((tmrwDayIndex - 1) % episodeLengthDays()) + 1;
  const todayGuildSummary = getGuildEventSummary(st.episode, st.dayInEp, st.currentDayStartMs, st.nowMs);
  const tmrwGuildSummary = getGuildEventSummary(tmrwEpisode, tmrwDayInEp, st.currentDayStartMs + 86400000, st.nowMs);

  const isGuildActive = getDayEvents(st.episode, st.dayInEp)
    .some(i => (i.icon.startsWith('tw_') && i.icon !== 'tw_payout') || i.icon === 'rote' || i.icon === 'tb_ends');

  // TB picker on the status card too, so the guild can set their TB
  // without scrolling to the schedule. Only during a TB week.
  const todayRunCtx = tbRunContext(st.currentDayStartMs, st.episode, st.dayInEp);
  const todayTbDef = todayRunCtx ? tbChoiceForRun(todayRunCtx) : null;
  const todayTbCtx = todayRunCtx ? {
    def: todayTbDef, offset: todayRunCtx.offset, side: todayRunCtx.side,
    phase1Ms: todayRunCtx.phase1Ms, options: todayRunCtx.options,
    art: todayTbDef.art, showPicker: true
  } : null;

  container.innerHTML = `
    <div class="status-card red-card">
      <div class="sc-header"><span class="sc-title">${gac.title}</span><span class="sc-badge ${gac.badgeClass}">${gac.status}</span></div>
      <div class="sc-main" style="margin-bottom:0"><div class="sc-val">${gac.main}</div><div class="sc-sub">${gac.sub}</div></div>
      ${gacRoundTrackerHTML(gac)}
    </div>

    <div class="status-card purple-card">
      <div class="sc-header"><span class="sc-title">${conq.title}</span><span class="sc-badge ${conq.badgeClass}">${conq.status}</span></div>
      <div class="sc-main" style="margin-bottom:0"><div class="sc-val">${conq.main}</div><div class="sc-sub">${conq.sub}</div></div>
      ${conquestVolumeTrackerHTML(conq.cNum)}
    </div>

    <div class="status-card amber-card">
      <div class="sc-header"><span class="sc-title">Guild Events</span><span class="sc-badge ${isGuildActive ? 'amber' : 'off'}">${isGuildActive ? 'ACTIVE' : 'IDLE'}</span></div>
      <div class="sc-main" style="margin-bottom:0">
        <div class="sc-val" style="font-size:15px;margin-bottom:2px">Today: <span style="color:var(--text);font-weight:600">${todayGuildSummary}</span></div>
        <div class="sc-sub" style="font-size:12px">Tomorrow: <span style="color:var(--amber)">${tmrwGuildSummary}</span></div>
      </div>
      ${guildPhaseTrackerHTML(st)}
      ${tbPickerHTML(todayTbCtx, true)}
    </div>
  `;
}

/* =========================================================
   LIVE IN-GAME EVENTS (Comlink game data)
   assets/data/live-events.json is written by
   scripts/pull-live-events.mjs (`npm run events:pull`). Loaded once on
   startup so a missing/slow file never blocks renderAll(); re-rendered
   from cache on later renderAll() calls (e.g. timezone changes).
   ========================================================= */

let liveEventsCache = null;

/* Short zone tag for live card times ("UTC", "BST", "GMT+1"…),
   resolved in the display zone and cached per zone so cards don't
   each construct an Intl formatter. Times render in the display
   zone, so the tag names it — no silent UTC assumption. */
let liveTzAbbrCache = { zone: null, abbr: '' };
function liveTzAbbr(){
  const zone = (typeof tz === 'function') ? tz() : 'UTC';
  if(liveTzAbbrCache.zone !== zone){
    let abbr = zone;
    try {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date());
      const tzPart = parts.find(p => p.type === 'timeZoneName');
      if(tzPart && tzPart.value) abbr = tzPart.value;
    } catch(e){}
    liveTzAbbrCache = { zone, abbr };
  }
  return liveTzAbbrCache.abbr;
}

function liveEventTimeLabel(ms){
  try {
    return withOrdinal(__formatter('day|monS|hhmm').format(new Date(dms(ms)))) + ' ' + liveTzAbbr();
  } catch(e){
    return new Date(ms).toUTCString();
  }
}

/* Card art per live kind. Marquee / era-challenge events reuse the
   matching unit portrait from MARQUEE_NAMES (by unit id or name);
   everything else maps to the closest existing event art. */
function liveCardMarqueeNum(e){
  // Compare alphanumeric-only so unit ids ("STORMTROOPERCONCEPT") match
  // display names ("Stormtrooper (Concept)") and vice versa.
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hay = norm(`${e.unit || ''} ${e.name || ''}`);
  if(typeof MARQUEE_NAMES !== 'object' || !hay) return null;
  for(const [key, name] of Object.entries(MARQUEE_NAMES)){
    const m = /^marquee_(\d+)$/.exec(key);
    const needle = norm(name);
    if(m && needle && hay.includes(needle)) return m[1];
  }
  return null;
}

/* Closest rotation icon for a live event, so live cards reuse the exact
   art, accent, tag and badge of their hardcoded counterparts —
   assetFor / categoryFor / tagFor stay the single source of truth.
   Null when the family has no rotation card (assault/omega). */
function liveRotationIcon(e){
  if(e.kind === 'marquee' || e.kind === 'era-challenge'){
    const n = liveCardMarqueeNum(e);
    if(n) return e.kind === 'marquee' ? `marquee_${n}` : `era_challenge_${n}`;
    return null;
  }
  switch(e.kind){
    case 'gac': return 'gac_attack';
    case 'conquest': return 'conquest_start';
    case 'fleet': {
      const id = String(e.id || '').toUpperCase();
      if(id.includes('LEVIATHAN')) return 'fleet_leviathan';
      if(id.includes('PROFUNDITY')) return 'fleet_profundity';
      return 'fleet_executor';
    }
    case 'smugglers-run':
    case 'credit-heist': return 'smugglersrun';
    case 'daily-challenge':
    case 'proving-grounds': return 'proving_ground';
    case 'journey': return 'journey_guide';
    default: return null;
  }
}

function liveCardMeta(e){
  const icon = liveRotationIcon(e);
  const cat = icon ? categoryFor(icon) : 'era';
  const glyph = icon ? tagFor(icon).glyph : CATEGORY_META.era.glyph;
  const label = icon ? tagFor(icon).label : CATEGORY_META.era.label;
  const art = (icon && assetFor(icon)) || 'events/eraicon.png';
  return { cat, glyph, label, art };
}

/* Display art for a live event. Conquest always wears the CONQUEST
   banner — the pulled promo art (conquest pass ads) is the wrong
   image on every schedule surface. */
function liveDisplayArt(e, meta){
  if(e && e.kind === 'conquest') return meta.art;
  return (e && e.art) || meta.art;
}

/* Live events render exactly like rotation cards (same art frame,
   badge and body) — only the art is the pulled game texture and the
   title/dates come from live data. The timing pill is the viewed day's
   relative label, identical to hardcoded cards on the same day. */
function liveCardHTML(e, relLabel){
  const meta = liveCardMeta(e);
  const catMeta = (typeof CATEGORY_META !== 'undefined' && CATEGORY_META[meta.cat]) || {};
  const style = `--accent:${catMeta.accent || 'var(--text3)'};--accent-dim:${catMeta.dim || 'transparent'};--accent-border:${catMeta.border || 'var(--border)'}`;
  const art = liveDisplayArt(e, meta);
  const relCls = relLabel === 'Now' ? 'xcard-rel is-today'
    : relLabel === 'Expired' ? 'xcard-rel is-expired' : 'xcard-rel';
  return `<article class="xcard" style="${style}">
    <div class="xcard-art">
      <div class="art-badge">${escHTML(meta.glyph)}</div>
      <img src="${IMG_BASE}${art}" alt="" loading="lazy" fetchpriority="low" decoding="async" onerror="this.remove()">
      <div class="xcard-shade"></div>
      <div class="xcard-art-meta">
        <span class="${relCls}">${relLabel}</span>
      </div>
    </div>
    <div class="xcard-body">
      <div class="xcard-kicker">${escHTML(meta.label)}</div>
      <h4>${escHTML(e.name)}</h4>
      <div class="xcard-date">${escHTML(liveEventTimeLabel(e.startMs))} → ${escHTML(liveEventTimeLabel(e.endMs))}</div>
    </div>
  </article>`;
}

/* Warm the pulled live art into the browser cache right after the
   snapshot lands, so live cards don't flash fallback badges on first
   paint. Mirrors preloadCardAssets for rotation art. */
function preloadLiveArt(){
  try {
    if(typeof Image !== 'function') return;
    if(!liveEventsCache || !Array.isArray(liveEventsCache.events)) return;
    const base = (typeof IMG_BASE !== 'undefined' && IMG_BASE) || 'assets/img/';
    liveEventsCache.events.forEach(e => {
      const art = liveDisplayArt(e, liveCardMeta(e) || {});
      if(typeof art !== 'string' || !art) return;
      const im = new Image();
      im.decoding = 'async';
      im.src = base + art;
    });
  } catch(e){}
}

async function loadLiveEvents(){
  // Fills the cache the day-by-day explorer overlays. No section of its
  // own — without a snapshot the explorer simply shows the rotation.
  if(typeof fetch !== 'function') return;
  try {
    const res = await fetch('assets/data/live-events.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    liveEventsCache = await res.json();
    preloadLiveArt();
    if(typeof renderAll === 'function') renderAll({ preserveFocus: true });
  } catch(e){
    if(typeof console !== 'undefined' && console.warn) console.warn('[swgoh-schedule] live events unavailable:', e.message);
  }
}

/* =========================================================
   SCHEDULE EXPLORER (day-by-day wide cards)
   ========================================================= */

let explorerOffset = 0;
const EXPLORER_WINDOW = 7;
const EXPLORER_PILL_WIDTH = 44;
const EXPLORER_GAP = 4;

function explorerBoundsFor(st){
  return {
    minOffset: -(st.eraDay - 1),
    maxOffset: eraLengthDays() - st.eraDay
  };
}

function explorerWindowSize(strip){
  return EXPLORER_WINDOW;
}

function explorerDayAt(st, offset){
  const dMs = st.currentDayStartMs + (offset * 86400000);
  const dIdx = ((st.eraDay - 1 + offset) % eraLengthDays() + eraLengthDays()) % eraLengthDays() + 1;
  const ep = Math.floor((dIdx - 1) / episodeLengthDays()) + 1;
  const dayInEp = ((dIdx - 1) % episodeLengthDays()) + 1;
  const week = Math.floor((dayInEp - 1) / 7) + 1;
  return { offset, dMs, dIdx, ep, dayInEp, week, items: getEventsForDay(dMs, ep, dayInEp) };
}

function shiftExplorer(delta){
  const bounds = explorerBoundsFor(getGameStatus());
  explorerOffset = Math.min(bounds.maxOffset, Math.max(bounds.minOffset, explorerOffset + delta));
  syncDayHash();
  renderAll();
}

function jumpExplorer(offset){
  const bounds = explorerBoundsFor(getGameStatus());
  explorerOffset = Math.min(bounds.maxOffset, Math.max(bounds.minOffset, offset));
  syncDayHash();
  renderAll();
}

/* Shareable day links: every explorer move publishes #day-N (absolute
   era day) via replaceState — no history spam, and the URL is always
   copy-pasteable. app.js reads it on load and on hashchange. */
function syncDayHash(){
  try {
    if(typeof location === 'undefined' || typeof history === 'undefined') return;
    const st = getGameStatus();
    const want = '#day-' + (st.eraDay + explorerOffset);
    if(location.hash !== want) history.replaceState(null, '', want);
  } catch(e){}
}

/* Jump selects carry absolute era days and reset to their placeholder
   after jumping — they are pure jump controls, never a mirror of the
   currently selected day. */
function onJumpSelect(select){
  if(!select || select.value === '') return;
  const st = getGameStatus();
  jumpExplorer(Number(select.value) - st.eraDay);
  select.value = '';
}

/* Guild TB picker. Always-visible 3-button row (explorer Phase-1
   cards and the dashboard status card alike): no collapsing, no
   wrapping sub-lines, so the row is a constant height and nothing
   around it shifts when the pick changes. tbCtx comes from
   tbRunContext for the relevant day; null off-TB weeks. The active
   button carries a ✓. */
function tbPickerHTML(tbCtx, compact){
  if(!tbCtx) return '';
  const guildAccent = CATEGORY_META.guild;
  const pickerStyle = `--accent:${guildAccent.accent};--accent-dim:${guildAccent.dim};--accent-border:${guildAccent.border}`;
  const btns = tbCtx.options.map(o => {
    const active = o.id === tbCtx.def.id;
    const selectedLabel = active ? ', selected' : '';
    return `<button type="button" class="tb-pick-btn${active ? ' active' : ''}" onclick="setTbChoice('${o.id}','${tbCtx.side}')" aria-pressed="${active}" aria-label="${o.name}${selectedLabel}" title="${o.short || o.name}${active ? ' — selected' : ''}">${active ? '<span class="tb-pick-check" aria-hidden="true">✓</span>' : ''}<span>${o.tag}</span></button>`;
  }).join('');
  const label = compact ? `TB: <strong>${tbCtx.def.name}</strong>` : 'Select your current TB:';
  return `<div class="tb-pick" style="${pickerStyle}" role="group" aria-label="Select your current TB"><span class="tb-pick-label">${label}</span><div class="tb-pick-btns">${btns}</div></div>`;
}

function explorerCardHTML(item, dateMs, relLabel, tbCtx, nowMs){
  const cat = categoryFor(item.icon);
  const meta = CATEGORY_META[cat];
  const tag = tagFor(item.icon);
  const isTbCard = tbCtx && (item.icon === 'rote' || item.icon === 'tb_ends');
  const asset = isTbCard ? tbCtx.art : assetFor(item.icon);
  const style = `--accent:${meta.accent};--accent-dim:${meta.dim};--accent-border:${meta.border}`;
  const imgTag = asset ? `<img src="${IMG_BASE}${asset}" alt="" loading="lazy" fetchpriority="low" decoding="async" onerror="this.remove()">` : '';
  // Contained sources (transparent subjects, square scenes) render over
  // a blurred fill of themselves: uniform card size, whole image
  // visible, nothing stretched, nothing sliced. See FIT_ART_ICONS.
  const fillTag = (asset && isFitArt(item.icon))
    ? `<div class="art-fill" aria-hidden="true" style="background-image:url(&quot;${IMG_BASE}${asset}&quot;)"></div>` : '';
  const relCls = relLabel === 'Now' ? 'xcard-rel is-today' : 'xcard-rel';
  const title = tenseByStart(getFullScheduleLabel(item), item, dateMs, nowMs);

  // Guild TB picker: on Phase-1 days the guild picks which of the
  // run's 3 TBs (side's 2 + Neutral RotE) they are running. The
  // choice persists and drives the art + phase labels everywhere.
  const picker = (tbCtx && tbCtx.showPicker && item.icon === 'rote') ? tbPickerHTML(tbCtx) : '';

  return `<article class="xcard" style="${style}">
    <div class="xcard-art${isFitArt(item.icon) ? ' fit' : ''}">
      <div class="art-badge">${tag.glyph}</div>
      ${fillTag}
      ${imgTag}
      <div class="xcard-shade"></div>
      <div class="xcard-art-meta">
        <span class="${relCls}">${relLabel}</span>
      </div>
    </div>
    <div class="xcard-body">
      <div class="xcard-kicker">${escHTML(tag.label)}</div>
      <h4>${title}</h4>
      <div class="xcard-date">${eventDateRangeLabel(item, eventDisplayMs(item, dateMs), isTbCard ? tbCtx : null)}</div>
      ${picker}
    </div>
  </article>`;
}

/* Live snapshot overlay for the day-by-day explorer: every event from
   live-events.json whose window touches the viewed UTC calendar day.
   GAC is skipped even if present — Comlink has no round info, the
   hardcoded per-round GAC cards cover it. Empty (no snapshot yet)
   means "expected rotation only". */
function liveEventsForDay(dayStartMs){
  if(!liveEventsCache || !Array.isArray(liveEventsCache.events)) return [];
  const dayEndMs = dayStartMs + 86400000;
  return liveEventsCache.events
    .filter(e => e.kind !== 'gac' && e.startMs < dayEndMs && e.endMs > dayStartMs)
    .sort((a, b) => a.startMs - b.startMs);
}

/* A day shows full cards only for what happens on it: events starting
   (or ending) that day. Longer runners (over 24h) also get a persistent
   badge in the indicators row — same shape as the coliseum boss, with
   their pulled art and a "Day X of Y" caption. */
function splitLiveDay(dayEvents, dayStartMs){
  const dayEndMs = dayStartMs + 86400000;
  return {
    starting: dayEvents.filter(e => e.startMs >= dayStartMs && e.startMs < dayEndMs),
    ongoing: dayEvents.filter(e => !(e.startMs >= dayStartMs && e.startMs < dayEndMs)),
  };
}

/* Rotation icons a live starting card already covers — the hardcoded
   rotation entry for the same happening is suppressed so a day never
   shows both (e.g. live Smuggler's Run + rotation Smuggler's Run).
   Reuses liveRotationIcon so display and suppression agree — except
   Credit Heist, which shares smuggling-run art but is a different
   event and must not suppress it. */
function liveCoveredIcons(starting){
  const covered = new Set();
  for(const e of starting){
    // Credit Heist shares smuggling-run art but is a different event;
    // GAC live entries carry no round info, so the precise hardcoded
    // round cards always win. Neither suppresses rotation.
    if(e.kind === 'credit-heist' || e.kind === 'gac') continue;
    const icon = liveRotationIcon(e);
    if(icon) covered.add(icon);
    if(e.kind === 'conquest') covered.add('conquest_end');
  }
  return covered;
}
function liveDayTotal(e){
  return Math.max(1, Math.round((e.endMs - e.startMs) / 86400000));
}

function liveDayNum(e, dayStartMs){
  const d = new Date(e.startMs);
  const startDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((dayStartMs - startDay) / 86400000) + 1;
}

function liveBadgesHTML(ongoing, dayStartMs){
  const badges = ongoing
    .filter(e => e.endMs - e.startMs > 24 * 3600000)
    .map(e => {
      const meta = liveCardMeta(e);
      const art = liveDisplayArt(e, meta);
      const total = liveDayTotal(e);
      const day = Math.min(Math.max(liveDayNum(e, dayStartMs), 1), total);
      const kindCls = e.kind === 'conquest' ? ' day-live-cq' : '';
      return `<div class="day-boss day-live${kindCls}" title="${escHTML(e.name)}, day ${day} of ${total}">`
        + `<img src="${IMG_BASE}${art}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
        + `<div class="db-text"><span class="db-label">Day ${day} of ${total}</span>`
        + `<span class="db-name">${escHTML(e.name)}</span></div></div>`;
    }).join('');
  return badges;
}

/* Indicator-row badges for multi-day rotation windows (marquee, era
   challenges, journey guides) covering the viewed day — the hardcoded
   counterpart of the live "Day X of Y" badges above. Skipped when a
   live event of the same family touches the day (its badge wins). */
function rotationWindowKind(icon){
  if(icon.startsWith('marquee_')) return 'marquee';
  if(icon.startsWith('era_challenge_')) return 'era-challenge';
  if(icon === 'journey_guide') return 'journey';
  return null;
}
function rotationWindowName(icon){
  const names = (typeof MARQUEE_NAMES !== 'undefined' && MARQUEE_NAMES) || {};
  let m = /^marquee_(\d+)$/.exec(icon || '');
  if(m && names[`marquee_${m[1]}`]) return `${names[`marquee_${m[1]}`]} Marquee`;
  m = /^era_challenge_(\d+)$/.exec(icon || '');
  if(m && names[`marquee_${m[1]}`]) return `${names[`marquee_${m[1]}`]} Era Challenge`;
  if(icon === 'journey_guide'){
    const unit = (typeof JOURNEY_GUIDE_UNIT !== 'undefined' && JOURNEY_GUIDE_UNIT) || 'Journey';
    return `${unit} Journey Guide`;
  }
  return icon;
}
function rotationBadgesHTML(windows, dayLive){
  const liveKinds = new Set((dayLive || []).map(e => e && e.kind).filter(Boolean));
  // A live event of the same family already badges the day (or shows
  // its own card), so the rotation window stays out of the way.
  return (windows || [])
    .filter(w => {
      const kind = rotationWindowKind(w.icon);
      return !!kind && !liveKinds.has(kind);
    })
    .map(w => {
      const icon = w.icon;
      const cat = categoryFor(icon);
      const meta = (typeof CATEGORY_META !== 'undefined' && CATEGORY_META[cat]) || {};
      const art = (typeof assetFor === 'function' && assetFor(icon)) || 'events/eraicon.png';
      const name = rotationWindowName(icon);
      const style = `--accent:${meta.accent || 'var(--text3)'};--accent-dim:${meta.dim || 'transparent'};--accent-border:${meta.border || 'var(--border)'}`;
      return `<div class="day-badge" style="${style}" title="${escHTML(name)}, day ${w.day} of ${w.total}">`
        + `<img src="${IMG_BASE}${art}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
        + `<div class="db-text"><span class="db-label">Day ${w.day} of ${w.total}</span>`
        + `<span class="db-name">${escHTML(name)}</span></div></div>`;
    }).join('');
}

function renderExplorer(st){
  const strip = document.getElementById('dayStrip');
  const detail = document.getElementById('dayDetail');
  if(!strip || !detail) return;

  const bounds = explorerBoundsFor(st);
  explorerOffset = Math.min(bounds.maxOffset, Math.max(bounds.minOffset, explorerOffset));
  const windowSize = explorerWindowSize(strip);
  const selectedEraDay = st.eraDay - 1 + explorerOffset;
  const winStart = Math.min(
    Math.floor(selectedEraDay / windowSize) * windowSize,
    eraLengthDays() - windowSize);
  const winEnd = Math.min(eraLengthDays(), winStart + windowSize);
  strip.scrollLeft = 0;
  let pills = '';
  for(let eraDay = winStart; eraDay < winEnd; eraDay++){
    const o = eraDay - (st.eraDay - 1);
    const d = explorerDayAt(st, o);
    const parts = tzDayParts(gameDayDisplayMs(d.dMs));
    const cls = 'day-pill'
      + (o === 0 ? ' is-today' : '')
      + (o === explorerOffset ? ' is-selected' : '')
      + (d.items.length ? ' has-events' : '');
    pills += `<button type="button" class="${cls}" onclick="jumpExplorer(${o})" aria-label="Day ${d.dIdx}, ${fmtDateUTC(gameDayDisplayMs(d.dMs))}${o === 0 ? ', today' : ''}" aria-pressed="${o === explorerOffset}"${o === explorerOffset ? ' aria-current="date"' : ''}>`
      + `<span class="dp-dow">${parts.dow}</span>`
      + `<span class="dp-num">${d.dIdx}</span>`
      + `<span class="dp-date">${parts.num} ${parts.month}</span>`
      + `<span class="dp-dot"></span></button>`;
  }
  strip.innerHTML = pills;

  const dayJump = document.getElementById('dayJump');
  if(dayJump){
    const jumpKey = `${st.eraBaseStartMs}|${eraLengthDays()}|${tz()}`;
    if(dayJump.dataset.scheduleKey !== jumpKey){
      let opts = '<option value="">Select day…</option>';
      for(let idx = 1; idx <= eraLengthDays(); idx++){
        const dMs = st.currentEraStartMs + ((idx - 1) * 86400000);
        opts += `<option value="${idx}">Day ${idx} · ${fmtDateUTC(gameDayDisplayMs(dMs))}</option>`;
      }
      dayJump.innerHTML = opts;
      dayJump.dataset.scheduleKey = jumpKey;
    }
  }

  // Curated event menu: marquee, journey guide, fleet mastery and
  // Proving Grounds occurrences only, grouped by type with the event
  // name first for scannability. Labels tense by each event's start
  // instant; values are absolute era days so the menu never goes stale
  // as days pass (only the tense flips, hence eraDay in the key).
  const eventJump = document.getElementById('eventJump');
  if(eventJump){
    const eventKey = `${st.eraBaseStartMs}|${eraLengthDays()}|${tz()}|${st.eraDay}`;
    if(eventJump.dataset.scheduleKey !== eventKey){
      const epLen = episodeLengthDays();
      const groups = [
        { title: 'Marquee', test: icon => icon.startsWith('marquee_') },
        { title: 'Journey Guide', test: icon => icon === 'journey_guide' },
        { title: 'Fleet Mastery', test: icon => icon.startsWith('fleet_') },
        { title: 'Proving Grounds', test: icon => icon === 'proving_ground' },
      ];
      const hits = groups.map(() => []);
      for(let idx = 1; idx <= eraLengthDays(); idx++){
        const ep = Math.floor((idx - 1) / epLen) + 1;
        const dep = ((idx - 1) % epLen) + 1;
        const dateMs = st.currentEraStartMs + ((idx - 1) * 86400000);
        getEventsForDay(dateMs, ep, dep)
          .filter(it => isJumpToEvent(it.icon))
          .forEach(it => {
            const gi = groups.findIndex(g => g.test(it.icon));
            if(gi >= 0) hits[gi].push(`<option value="${idx}">${escHTML(tenseByStart(it.label, it, dateMs, st.nowMs))} · Day ${idx}</option>`);
          });
      }
      let opts = '<option value="">Select event…</option>';
      groups.forEach((g, gi) => {
        if(hits[gi].length) opts += `<optgroup label="${g.title}">${hits[gi].join('')}</optgroup>`;
      });
      eventJump.innerHTML = opts;
      eventJump.dataset.scheduleKey = eventKey;
    }
  }

  const dayPrev = document.getElementById('dayPrev');
  const dayNext = document.getElementById('dayNext');
  const dayToday = document.getElementById('dayToday');
  if(dayPrev) dayPrev.disabled = explorerOffset <= bounds.minOffset;
  if(dayNext) dayNext.disabled = explorerOffset >= bounds.maxOffset;
  if(dayToday) dayToday.disabled = explorerOffset === 0;

  const cur = explorerDayAt(st, explorerOffset);
  const rel = relativeDayLabel(cur.offset, st.nowMs, st.currentDayStartMs);
  const relCap = rel.charAt(0).toUpperCase() + rel.slice(1);
  const headTitle = cur.offset === 0
    ? `Today: ${fmtDateLongUTC(gameDayDisplayMs(cur.dMs))}`
    : `${relCap}: ${fmtDateLongUTC(gameDayDisplayMs(cur.dMs))}`;
  const bossName = BOSS_LOOP[posMod(st.bossDayIndex - 1 + cur.offset, BOSS_LOOP.length)];
  const bossIcon = BOSS_ICONS[bossName];
  // Conquest indicator (mirrors the boss badge): shown on days 7-20
  // of each episode while a run is active.
  const cq = conquestInfoForDay(cur.ep, cur.dayInEp);
  const cqBadge = cq
    ? `<div class="day-conquest" title="Conquest ${cq.cNum} — ${cq.note}${cq.finalDay ? ' (final day)' : ''}">`
      + `<img src="${IMG_BASE}${CONQUEST_UNIT_IMAGE}" alt="" loading="lazy" fetchpriority="low" decoding="async" onerror="this.remove()">`
      + `<div class="db-text"><span class="db-label">Conquest · C${cq.cNum}</span><span class="db-name">Day ${cq.day} of ${cq.total}${cq.finalDay ? ' — Final' : ''}</span></div>`
      + `</div>`
    : '';
  // TB context for this day: drives the card art, phase labels and
  // the guild picker (shown on Phase-1 days). Null off-TB days.
  const runCtx = tbRunContext(cur.dMs, cur.ep, cur.dayInEp);
  const tbDef = runCtx ? tbChoiceForRun(runCtx) : null;
  const tbCtx = runCtx ? {
    def: tbDef, offset: runCtx.offset, side: runCtx.side,
    phase1Ms: runCtx.phase1Ms, options: runCtx.options, art: tbDef.art,
    showPicker: runCtx.offset === 0
  } : null;
  const dayLive = liveEventsForDay(cur.dMs);
  const { starting, ongoing } = splitLiveDay(dayLive, cur.dMs);
  // Card pills count to each event's own start instant (eventStartMs:
  // GAC at 21:00 UTC, TB transition moments) — not the day's generic
  // changeover. Today and past days keep the shared day wording.
  const cardRel = startMs => cur.offset > 0 ? relForEventStart(startMs, st.nowMs, rel) : rel;
  // An event whose end passed but whose changeover day is still showing
  // is over — "Expired", never "Now".
  const liveRel = e => (Number.isFinite(e.endMs) && Number.isFinite(st.nowMs) && e.endMs <= st.nowMs)
    ? 'Expired' : cardRel(e.startMs);
  const liveCards = starting.map(e => liveCardHTML(e, liveRel(e))).join('');
  const liveBadges = liveBadgesHTML(ongoing, cur.dMs);
  // Live conquest data replaces the rotation estimate — never show both
  // conquest badges side by side.
  const showCqBadge = !dayLive.some(e => e.kind === 'conquest');
  // Multi-day rotation windows (marquee, era challenges, journey
  // guides) covering the day, unless live data already badges them.
  const windowBadges = (typeof rotationWindowsForDay === 'function')
    ? rotationBadgesHTML(rotationWindowsForDay(cur.ep, cur.dayInEp), dayLive) : '';
  const covered = liveCoveredIcons(starting);
  const rotationCards = cur.items
    .filter(it => !covered.has(it.icon))
    .map(it => explorerCardHTML(it, cur.dMs, cardRel(eventStartMs(it, cur.dMs)), tbCtx, st.nowMs)).join('');
  detail.innerHTML = `
    <div class="day-detail-head">
      <div>
        <h3>${headTitle}</h3>
        <p>Day ${cur.dIdx} / ${eraLengthDays()} · Episode ${cur.ep}, Week ${cur.week}</p>
      </div>
      <div class="day-indicators">
        <div class="day-boss" title="Coliseum boss rotates daily at 18:00 UTC">
        <img src="${IMG_BASE}${bossIcon}" alt="" loading="lazy" fetchpriority="low" decoding="async" onerror="this.remove()">
        <div class="db-text"><span class="db-label">Coliseum boss</span><span class="db-name">${bossName}</span></div>
        </div>
        ${showCqBadge ? cqBadge : ''}
        ${windowBadges}
        ${liveBadges}
      </div>
    </div>
    ${liveCards || rotationCards
      ? `<div class="xcard-deck" tabindex="0" role="region" aria-label="Events this day">${liveCards}${rotationCards}</div>`
      : `<p class="empty-note">No changeovers this day — nothing starts or ends.</p>`}`;
}

function getFullScheduleLabel(item){
  // TB labels already carry the full planet-prefixed name
  // (e.g. "Hoth Rebel Assault Phase 1 Starts") — no extra prefix.
  if(item.icon === 'rote' || item.icon === 'tb_ends') return item.label;
  const catLabel = GUILD_SUBLABEL[item.icon] || CATEGORY_META[categoryFor(item.icon)]?.label;
  if(!catLabel) return item.label;
  if(item.label.toUpperCase().startsWith(catLabel.toUpperCase())) return item.label;

  const needsCategory = /\b(Phase|Payout|Signup|Attack|Defense|Offense)\b/i.test(item.label);
  return needsCategory ? `${catLabel} ${item.label}` : item.label;
}

/* =========================================================
   FULL ERA TIMELINE (modal)
   ========================================================= */

const fullScheduleCache = { eraStartMs: null, activeDay: null, tbChoices: null, tzKey: null, cfgKey: null };
let scheduleFilterEp = 0; // 0 = all episodes

function gameDayDisplayMs(dateMs){
  return dateMs + (stdHour() * 3600000);
}

function fullScheduleTbChoiceKey(){
  return ['light', 'dark'].map(side => tbStoredChoiceId(side) || 'rote').join('|');
}

function escAttr(s){
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* Visible-text escaping for labels injected via innerHTML. Config data
   is trusted, but a stray & or < in a future label must not break the
   markup (e.g. "Myths & Legends" must render literally). */
function escHTML(s){
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function timelineChipHTML(item, dateMs, nowMs){
  const meta = CATEGORY_META[categoryFor(item.icon)];
  const base = getFullScheduleLabel(item);
  const startMs = eventStartMs(item, dateMs);
  const label = tensedLabel(base, startMs <= nowMs);
  return `<span class="tl-chip" data-start="${startMs}" data-label="${escAttr(base)}" style="color:${meta.accent};border-color:${meta.border};background:${meta.dim}">${escHTML(label)}</span>`;
}

/* Flip timeline chips between future/past tense as changeovers pass,
   without rebuilding the cached markup (a rebuild would lose the
   modal's scroll position). Only chips whose tense actually flipped
   are touched. */
function refreshTimelineTense(container, nowMs){
  if(!container || typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return;
  const chips = container.querySelectorAll('.tl-chip[data-start][data-label]');
  for(const chip of chips){
    const want = tensedLabel(chip.dataset.label, Number(chip.dataset.start) <= nowMs);
    if(chip.textContent !== want) chip.textContent = want;
  }
}

function renderFullSchedule(st){
  const container = document.getElementById('fullSchedule');
  if(!container) return;
  const tbChoices = fullScheduleTbChoiceKey();
  // Timezone is part of the cache key: every date string in the
  // timeline is rendered in the display zone, so a tz change must
  // rebuild rather than reuse the cached markup. Changeover hours and
  // era/episode lengths also shift every timestamp, so they join the key.
  const tzKey = (typeof getTimeZoneSetting === 'function') ? getTimeZoneSetting() : 'local';
  const cfgKey = [stdHour(), gacHour(), eraLengthDays(), episodeLengthDays()].join('|');
  const sameEra = fullScheduleCache.eraStartMs === st.currentEraStartMs
    && fullScheduleCache.tbChoices === tbChoices
    && fullScheduleCache.tzKey === tzKey
    && fullScheduleCache.cfgKey === cfgKey;

  if(!sameEra){
    let html = '';
    const episodeCount = Math.ceil(eraLengthDays() / episodeLengthDays());
    for(let ep = 1; ep <= episodeCount; ep++){
      const firstDay = ((ep - 1) * episodeLengthDays()) + 1;
      const lastDay = Math.min(ep * episodeLengthDays(), eraLengthDays());
      const epStartMs = st.currentEraStartMs + ((firstDay - 1) * 86400000);
      const epEndMs = st.currentEraStartMs + ((lastDay - 1) * 86400000);
      html += `<div class="tl-ep" data-ep="${ep}">`
        + `<div class="tl-ep-head"><span>Episode ${ep}</span><span class="tl-ep-dates">${fmtDayMonthUTC(gameDayDisplayMs(epStartMs))} → ${fmtDayMonthUTC(gameDayDisplayMs(epEndMs))}</span></div>`;
      const weekCount = Math.ceil((lastDay - firstDay + 1) / 7);
      for(let week = 1; week <= weekCount; week++){
        html += `<div class="tl-week-head">Week ${week}</div>`;
        const daysInWeek = Math.min(7, lastDay - firstDay + 1 - ((week - 1) * 7));
        for(let d = 1; d <= daysInWeek; d++){
          const dayInEp = (week - 1) * 7 + d;
          const idx = (ep - 1) * episodeLengthDays() + dayInEp;
          const dateMs = st.currentEraStartMs + ((idx - 1) * 86400000);
          const items = getEventsForDay(dateMs, ep, dayInEp);
          html += `<div class="tl-day${idx === st.eraDay ? ' is-today' : ''}" data-day="${idx}">`
            + `<span class="tl-daynum">${idx}</span>`
            + `<span class="tl-date">${fmtDateUTC(gameDayDisplayMs(dateMs))}</span>`
            + `<span class="tl-events">${items.length ? items.map(it => timelineChipHTML(it, dateMs, st.nowMs)).join('') : '<span class="tl-none">—</span>'}</span></div>`;
        }
      }
      html += `</div>`;
    }
    container.innerHTML = html;
    fullScheduleCache.eraStartMs = st.currentEraStartMs;
    fullScheduleCache.activeDay = st.eraDay;
    fullScheduleCache.tbChoices = tbChoices;
    fullScheduleCache.tzKey = tzKey;
    fullScheduleCache.cfgKey = cfgKey;
    applyScheduleFilter();
  } else if(fullScheduleCache.activeDay !== st.eraDay){
    const prev = container.querySelector(`.tl-day[data-day="${fullScheduleCache.activeDay}"]`);
    if(prev) prev.classList.remove('is-today');
    const next = container.querySelector(`.tl-day[data-day="${st.eraDay}"]`);
    if(next) next.classList.add('is-today');
    fullScheduleCache.activeDay = st.eraDay;
  }
  refreshTimelineTense(container, st.nowMs);
}

function applyScheduleFilter(){
  const container = document.getElementById('fullSchedule');
  document.querySelectorAll('.sf-pill').forEach(p => {
    const active = Number(p.dataset.ep) === scheduleFilterEp;
    p.classList.toggle('active', active);
    p.setAttribute('aria-pressed', String(active));
  });
  if(!container) return;
  container.querySelectorAll('.tl-ep').forEach(ep => {
    ep.hidden = scheduleFilterEp !== 0 && Number(ep.dataset.ep) !== scheduleFilterEp;
  });
}

function setScheduleFilter(ep){
  scheduleFilterEp = Number(ep) || 0;
  applyScheduleFilter();
}

function scrollScheduleToToday(){
  const container = document.getElementById('fullSchedule');
  if(!container) return;
  if(scheduleFilterEp !== 0){
    const todayEp = Math.floor((fullScheduleCache.activeDay - 1) / episodeLengthDays()) + 1;
    if(todayEp !== scheduleFilterEp) setScheduleFilter(0);
  }
  const row = container.querySelector(`.tl-day[data-day="${fullScheduleCache.activeDay}"]`);
  if(row) row.scrollIntoView({ block: 'center' });
}

/* =========================================================
   CARD ART PRELOAD
   The explorer rebuilds its <img> nodes on every day change.
   Without warming the cache first, each flip re-fetches and
   re-decodes the art, flashing the fallback badge/background
   for a split second. Preloading every possible card asset once
   at startup keeps day changes instant (all local, ~30 files).
   ========================================================= */

let cardAssetsPreloaded = false;

function preloadCardAssets(){
  if(cardAssetsPreloaded) return;
  cardAssetsPreloaded = true;
  try {
    const base = (typeof IMG_BASE !== 'undefined' && IMG_BASE) || 'assets/img/';
    const urls = new Set();
    const add = v => { if(typeof v === 'string' && v) urls.add(base + v); };
    if(typeof EVENT_ICONS !== 'undefined') Object.values(EVENT_ICONS).forEach(add);
    if(typeof CATEGORY_ICONS !== 'undefined') Object.values(CATEGORY_ICONS).forEach(add);
    if(typeof TB_DEFS !== 'undefined') Object.values(TB_DEFS).forEach(d => d && add(d.art));
    if(typeof BOSS_ICONS !== 'undefined') Object.values(BOSS_ICONS).forEach(add);
    if(typeof CRON_COLOR_META !== 'undefined') Object.values(CRON_COLOR_META).forEach(m => m && add(m.asset));
    if(typeof CONQUEST_UNIT_IMAGE !== 'undefined') add(CONQUEST_UNIT_IMAGE);
    if(typeof ERA_UNIT_IMAGE !== 'undefined') add(ERA_UNIT_IMAGE);
    urls.forEach(url => {
      const im = new Image();
      im.decoding = 'async';
      im.src = url;
    });
  } catch(e){}
}

/* =========================================================
   LIVE COUNTDOWN & MASTER RENDER
   ========================================================= */

/* Footer line goes stale if rendered once (tz changes, midnight
   rollovers). Refresh it on every render instead. */
function updateFooterMeta(){
  const el = document.getElementById('footerMeta');
  if(!el || typeof tzDisplayName !== 'function') return;
  const h = (typeof stdHour === 'function') ? stdHour() : 18;
  el.textContent = `Resets ${h}:00 UTC daily · showing ${tzDisplayName()} · loaded ${new Date(dms(Date.now())).toLocaleString('en-GB', { timeZone: tz(), hour12: false })}`;
}

function renderAll(opts){
  // Background ticks (clock/visibility) must not yank keyboard focus:
  // regions rebuilt via innerHTML are skipped while focused inside
  // them and catch up on the next tick after blur. Direct user
  // actions (day jump, TB pick, tz change, changeovers) rebuild fully.
  const preserveFocus = !!(opts && opts.preserveFocus);
  const active = (typeof document !== 'undefined' && document.activeElement) || null;
  const focused = el => !!(preserveFocus && active && el && el.contains(active));
  const st = getGameStatus();
  renderStaticMeta();
  renderMergedHero(st);
  if(!focused(document.getElementById('statusDashboard'))) renderStatusDashboard(st);
  if(!focused(document.getElementById('unlockWindows'))) renderUnlockWindows(st);
  if(!focused(document.getElementById('dayStrip')) && !focused(document.getElementById('dayDetail'))) renderExplorer(st);
  if(!focused(document.getElementById('fullSchedule'))) renderFullSchedule(st);
  updateFooterMeta();
  if(typeof syncTzSelects === 'function') syncTzSelects();
}
