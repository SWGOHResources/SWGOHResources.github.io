/* RENDER — DOM builders. Depends on config.js + time.js globals. */

/* Image paths built at runtime carry the site-wide cache token from
   assets/js/asseturl.js: replacing a PNG at the same path must not leave a
   stale copy in a browser or on the CDN. Falls back to the raw path when
   the helper isn't loaded (e.g. unit-tested in isolation). */
const withAssetV = (typeof assetUrl === 'function') ? assetUrl : (p => p);
const imgPath = f => withAssetV(((typeof IMG_BASE !== 'undefined' && IMG_BASE) || 'assets/img/') + f);

function iconCardBackdropHTML(){
  return `<div class="game-backdrop" aria-hidden="true" style="background-image:url(&quot;${imgPath(ICON_CARD_BACKDROP)}&quot;)"></div>`;
}

// A datacron set can only ever be equipped/used for Territory War and
// GAC — never Territory Battle, Conquest, etc. This scans backward day
// by day from the set's expiry date to find the most recent TW or GAC
// event, so we can tell players the last event they'll actually get to
// use the set in before it's removed.

function setClockText(container, key, value){
  const node = container && container.querySelector(`[data-clock="${key}"]`);
  if(node && node.textContent !== value) node.textContent = value;
}

function renderUnlockWindows(st, opts){
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
  // Finds the NEXT era-start day (Start of New Era / Tuesday)
  const nextEraFromDay = st.preEra ? st.rawDayIndex : st.rawDayIndex + 1;
  const eraAbs = st.era ? Math.round((st.era.endMs - st.eraBaseStartMs) / 86400000) + 1
    : nextOccurrenceAbs(ERA_START_OFFSETS, nextEraFromDay, eraLengthDays());
  const eraInf = absDayToInfo(eraAbs, st.eraBaseStartMs);
  const eraDateMs = eraInf.dateMs;
  
  const eraDays = Math.round((eraDateMs - st.currentDayStartMs) / 86400000);
  // Before launch the era hasn't started: count down to it instead of
  // claiming THIS ERA. daysUntilEra already counts display-zone days.
  const eraUnlockMs = eraDateMs + (stdHour() * 3600000);
  const eraCountLabel = st.preEra
    ? (st.daysUntilEra <= 0 ? 'Today' : `In ${st.daysUntilEra} day${st.daysUntilEra === 1 ? '' : 's'}`)
    : (eraAbs <= st.rawDayIndex || eraDays <= 0 ? 'Live now' : subDayCount(st.nowMs, eraUnlockMs, `In ${eraDays} day${eraDays === 1 ? '' : 's'}`));
  const eraBadge = st.eraKnown === false ? 'TBA' : st.preEra ? 'UPCOMING' : (eraDays <= 7 ? 'ENDING' : 'ACTIVE');
  const eraMain = st.eraKnown === false ? 'TBA' : eraCountLabel;
  const eraDateLine = st.eraKnown === false ? '' : fmtDateLongUTC(gameDayDisplayMs(eraDateMs));
  const eraSub = st.eraKnown === false ? '' : st.preEra ? 'The new era begins' : 'Current era ends, units enter legacy modes';

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

  if(opts && opts.clockOnly){
    setClockText(el, 'cq-unlock', cqMain);
    setClockText(el, 'era-end', eraMain);
    setClockText(el, 'cron-expiry', cronMain);
    return;
  }

  el.innerHTML = `
    <div class="status-card purple-card">
      <div class="sc-header"><span class="sc-title">Conquest Unit (${conquestOrdinal(cqChapter.cNum)} of Volume)</span><span class="sc-badge ${cqBadgeClass}">${cqBadge}</span></div>
      <div class="uw-body" style="--accent:var(--purple);--accent-dim:var(--purple-dim);--accent-border:var(--purple-border)">
        <div class="uw-img"><div class="art-badge">CQ</div><img src="${imgPath(CONQUEST_UNIT_IMAGE)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main"><div class="sc-val" data-clock="cq-unlock">${cqMain}</div><div class="uw-date">${cqDateLine}</div><div class="sc-sub">${cqSub}</div></div>
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
        <div class="uw-img"><div class="art-badge">ERA</div><img src="${imgPath(st.era ? st.era.icon : ERA_UNIT_IMAGE)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main"><div class="sc-val" data-clock="era-end">${eraMain}</div><div class="uw-date">${eraDateLine}</div><div class="sc-sub">${eraSub}</div></div>
          <div class="sc-footer" style="flex-direction:column;align-items:flex-start;gap:2px;${st.eraKnown === false ? 'display:none;' : ''}">
            <span>Usable in GAC: <span class="highlight">Week ${eraGacWeek} (${eraGac.format})</span></span>
            <span>Roster locks: ${fmtDayMonthUTC(gameDayDisplayMs(eraNextSignupDate))} (Defense Starts)</span>
          </div>
        </div>
      </div>
    </div>
    <div class="status-card" style="border-color:${cronMeta.border}">
      <div class="sc-header"><span class="sc-title">Datacron Expirations</span><span class="sc-badge ${cronBadgeClass}">${cronBadge}</span></div>
      <div class="uw-body" style="--accent:${cronMeta.accent};--accent-dim:${cronMeta.dim};--accent-border:${cronMeta.border}">
        <div class="uw-img"><div class="art-badge">${cronMeta.label.slice(0,3).toUpperCase()}</div><img src="${imgPath(cronMeta.asset)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main">
            <div class="sc-val" data-clock="cron-expiry">${cronMain}</div>
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
    // TB tracker length follows Rise of the Empire (6 phases).
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
function renderStaticMeta(status){
  const st = status || getGameStatus();
  const setText = (id, text) => { const el = document.getElementById(id); if(el) el.textContent = text; };
  setText('eraTitle', `Event Schedule for ${st.eraName || ERA_NAME}`);
  setText('mhOfVal', st.eraKnown === false ? '' : `/ ${st.eraLength || eraLengthDays()}`);
  setText('fullScheduleCount', `${fmtDateUTC(gameDayDisplayMs(st.currentEraStartMs))} – ${fmtDateUTC(gameDayDisplayMs(st.currentDayStartMs + explorerBoundsFor(st).maxOffset * 86400000))}`);
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
  const length = st.eraLength || eraLengthDays();
  const episodeCount = Math.ceil(length / episodeLengthDays());
  const weeksPerEpisode = Math.ceil(episodeLengthDays() / 7);
  document.getElementById('mhDayVal').textContent = st.bossEraDay;
  document.getElementById('mhEpVal').textContent = `${st.episode} of ${episodeCount}`;
  document.getElementById('mhWeekVal').textContent = `${st.week} of ${weeksPerEpisode}`;
  document.getElementById('mhWeekdayVal').textContent = st.weekdayName;

  const fillPct = Math.min(100, Math.max(0, (st.bossEraDay / length) * 100));
  document.getElementById('mhFill').style.width = fillPct + '%';

  // Rollover day: the era's last game day closes at this changeover
  // (day 84 spans the 19th 18:00 UTC to the 20th 18:00 UTC), matching
  // the Important Dates card and the digest "ends" line.
  const eraEndMs = st.currentEraStartMs + (length * 86400000);
  document.getElementById('mhStartDate').textContent = fmtDateUTC(gameDayDisplayMs(st.currentEraStartMs));
  document.getElementById('mhEndDate').textContent = fmtDateUTC(gameDayDisplayMs(eraEndMs));
  document.getElementById('mhDaysRemaining').textContent = st.preEra
    ? (st.daysUntilEra <= 0 ? 'Era starts today' : `Era starts in ${st.daysUntilEra} day${st.daysUntilEra === 1 ? '' : 's'}`)
    : `${length - st.bossEraDay} days remaining`;
  if(st.eraKnown === false){
    document.getElementById('mhDayVal').textContent = '—';
    document.getElementById('mhEpVal').textContent = 'TBA';
    document.getElementById('mhWeekVal').textContent = 'TBA';
    document.getElementById('mhEndDate').textContent = 'TBA';
    document.getElementById('mhDaysRemaining').textContent = 'Dates TBA';
    document.getElementById('mhFill').style.width = '0%';
  }

  const staleBanner = document.getElementById('staleBanner');
  if(staleBanner){
    const baseLastMs = st.eraBaseStartMs + ((eraLengthDays() - 1) * 86400000);
    const baseOverMs = baseLastMs + 86400000 + (stdHour() * 3600000);
    const stale = !st.preEra && !st.era && st.nowMs >= baseOverMs;
    staleBanner.hidden = !stale;
    if(stale){
      const textEl = document.getElementById('staleBannerText');
      if(textEl) textEl.innerHTML = `Next era: TBA`;
    }
  }
}

function renderStatusDashboard(st, opts){
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

  // Guild Events card shows the RotE run via the Today/Tomorrow
  // summary lines above — no separate TB row needed.

  if(opts && opts.clockOnly){
    setClockText(container, 'gac-sub', gac.sub);
    setClockText(container, 'conquest-main', conq.main);
    setClockText(container, 'conquest-sub', conq.sub);
    setClockText(container, 'guild-today', todayGuildSummary);
    setClockText(container, 'guild-tomorrow', tmrwGuildSummary);
    return;
  }

  container.innerHTML = `
    <div class="status-card purple-card">
      <div class="sc-header"><span class="sc-title">${conq.title}</span><span class="sc-badge ${conq.badgeClass}">${conq.status}</span></div>
      <div class="sc-main" style="margin-bottom:0"><div class="sc-val" data-clock="conquest-main">${conq.main}</div><div class="sc-sub" data-clock="conquest-sub">${conq.sub}</div></div>
      ${conquestVolumeTrackerHTML(conq.cNum)}
    </div>

    <div class="status-card red-card">
      <div class="sc-header"><span class="sc-title">${gac.title}</span><span class="sc-badge ${gac.badgeClass}">${gac.status}</span></div>
      <div class="sc-main" style="margin-bottom:0"><div class="sc-val">${gac.main}</div><div class="sc-sub" data-clock="gac-sub">${gac.sub}</div></div>
      ${gacRoundTrackerHTML(gac)}
    </div>

    <div class="status-card amber-card">
      <div class="sc-header"><span class="sc-title">Guild Events</span><span class="sc-badge ${isGuildActive ? 'amber' : 'off'}">${isGuildActive ? 'ACTIVE' : 'IDLE'}</span></div>
      <div class="sc-main" style="margin-bottom:0">
        <div class="sc-val" style="font-size:15px;margin-bottom:2px">Today: <span data-clock="guild-today" style="color:var(--text);font-weight:600">${todayGuildSummary}</span></div>
        <div class="sc-sub" style="font-size:12px">Tomorrow: <span data-clock="guild-tomorrow" style="color:var(--amber)">${tmrwGuildSummary}</span></div>
      </div>
      ${guildPhaseTrackerHTML(st)}
    </div>
  `;
}

/* =========================================================
   LIVE IN-GAME EVENTS (Comlink game data)
   assets/data/live-events.json is written by
   scripts/pull-live-events.mjs (`npm run events:pull`). Loaded once on
   startup and periodically refreshed without blocking renderAll().
   ========================================================= */

let liveEventsCache = null;
let liveEventsPending = null;
let liveEventsNextAttemptMs = 0;

/* Start + span row for schedule cards: the absolute start instant
   left ("Sat, 12th Sep, 18:00 UTC"), the duration right ("36 hrs",
   "7 days", "1 day 12 hrs"). Duration omitted when the marker has
   no real span. */
function cardWhenRow(startMs, durH){
  const start = escHTML(fmtEventStart(startMs));
  // Moment markers (payouts, updates, era ends…) have no real span —
  // show just the start instead of a meaningless "N/A" duration.
  if(durH == null) return `<div class="xcard-date"><span class="xw-start">${start}</span></div>`;
  const dur = (typeof formatDurationHours === 'function' ? formatDurationHours(durH) : null) ?? 'N/A';
  return `<div class="xcard-date"><span class="xw-start">${start}</span><span class="xw-dur">${dur}</span></div>`;
}

/* Whole-hour span of a live event — null when the window is missing
   or inverted. */
function liveDurationHours(e){
  if(!e || !Number.isFinite(e.startMs) || !Number.isFinite(e.endMs) || e.endMs <= e.startMs) return null;
  return Math.max(1, Math.round((e.endMs - e.startMs) / 3600000));
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

/* Rotation slots that live data can speak for: marquee / era-challenge
   slots carry their MARQUEE_NAMES unit, the journey guide its unit.
   GAC/TW/TB stay fully hardcoded — live data never overrides them. */
function slotNeedleFor(icon){
  const names = (typeof MARQUEE_NAMES !== 'undefined' && MARQUEE_NAMES) || {};
  let m = /^marquee_(\d+)$/.exec(icon || '');
  if(m && names[`marquee_${m[1]}`]) return { name: names[`marquee_${m[1]}`], kinds: ['marquee'] };
  m = /^era_challenge_(\d+)$/.exec(icon || '');
  if(m && names[`marquee_${m[1]}`]) return { name: names[`marquee_${m[1]}`], kinds: ['era-challenge'] };
  // Era battles arrive as plain kind=event entries (Comlink exposes no
  // era-battle family), matched by event name from ERA_BATTLE_NAMES.
  const battles = (typeof ERA_BATTLE_NAMES !== 'undefined' && ERA_BATTLE_NAMES) || {};
  m = /^era_battle_(\d+)$/.exec(icon || '');
  if(m && battles[icon]) return { name: battles[icon], kinds: ['event'] };
  if(icon === 'journey_guide'){
    const unit = (typeof JOURNEY_GUIDE_UNIT !== 'undefined' && JOURNEY_GUIDE_UNIT) || '';
    if(unit) return { name: unit, kinds: ['journey', 'event'] };
  }
  return null;
}

function liveSlotKeys(){
  const names = (typeof MARQUEE_NAMES !== 'undefined' && MARQUEE_NAMES) || {};
  const out = [];
  for(const key of Object.keys(names)){
    const m = /^marquee_(\d+)$/.exec(key);
    if(m){ out.push(`marquee_${m[1]}`); out.push(`era_challenge_${m[1]}`); }
  }
  const battles = (typeof ERA_BATTLE_NAMES !== 'undefined' && ERA_BATTLE_NAMES) || {};
  for(const key of Object.keys(battles)){
    if(/^era_battle_\d+$/.exec(key)) out.push(key);
  }
  if(typeof JOURNEY_GUIDE_UNIT !== 'undefined' && JOURNEY_GUIDE_UNIT) out.push('journey_guide');
  return out;
}

/* Alphanumeric-only containment, the same rule as liveCardMarqueeNum:
   a slot's unit name against a live event's unit + name. Family-gated,
   so a live marquee never claims its unit's era-challenge slot. */
function slotMatchesEvent(slot, e){
  const spec = (typeof slotNeedleFor === 'function') ? slotNeedleFor(slot) : null;
  if(!spec || !e || !spec.kinds.includes(e.kind)) return false;
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const needle = norm(spec.name);
  return !!needle && norm(`${e.unit || ''} ${e.name || ''}`).includes(needle);
}

/* Live events touching the viewed day that describe a rotation slot —
   earliest first. Powers card art/name overrides and dedupe. */
function liveMatchesForSlot(icon, dayStartMs){
  if(!Number.isFinite(dayStartMs) || typeof liveEventsForDay !== 'function') return [];
  return liveEventsForDay(dayStartMs).filter(e => slotMatchesEvent(icon, e));
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
  if(e && (e.kind === 'special' || isDropEvent(e))){
    const meta = CATEGORY_META.special;
    return { cat: 'special', glyph: meta.glyph, label: meta.label, art: CATEGORY_ICONS.special };
  }
  const icon = liveRotationIcon(e);
  if(icon){
    const cat = categoryFor(icon);
    const tag = tagFor(icon);
    return { cat, glyph: tag.glyph, label: tag.label, art: assetFor(icon, e.startMs) || 'events/eraicon.png' };
  }
  const kindTag = (typeof LIVE_KIND_TAG !== 'undefined' && e) ? LIVE_KIND_TAG[e.kind] : null;
  if(kindTag) return { cat: kindTag.cat || 'era', glyph: kindTag.glyph, label: kindTag.label, art: 'events/eraicon.png' };
  // Curated resource names (Training Droids, Bounties, Coven) wear
  // guild-amber + RES like smuggling runs; everything else stays Era.
  if(e && typeof isResourceLiveName === 'function' && isResourceLiveName(e.name)){
    return { cat: 'guild', glyph: 'RES', label: 'Resource', art: 'events/eraicon.png' };
  }
  return { cat: 'era', glyph: CATEGORY_META.era.glyph, label: CATEGORY_META.era.label, art: 'events/eraicon.png' };
}

/* Display art for a live event. Conquest always wears the CONQUEST
   banner — the pulled promo art (conquest pass ads) is the wrong
   image on every schedule surface. */
function isDropEvent(e){
  return !!e && (/^EVENT_BONUS_/i.test(e.id || '')
    || /(?:^|_)(?:ADDITIVE|BONUS|DOUBLE|TRIPLE)_DROPS?(?:_|$)/i.test(e.id || '')
    || /\b(?:additive|bonus|double|triple)[\s-]+drops?\b/i.test(e.name || ''));
}

function liveDisplayArt(e, meta){
  if(isDropEvent(e)) return DROP_EVENT_ART;
  if(e && e.kind === 'conquest') return meta.art;
  return (e && e.art) || meta.art;
}

/* Live events render exactly like rotation cards (same art frame,
   badge and body) — only the art is the pulled game texture and the
   title/dates come from live data. The timing pill is the viewed day's
   relative label, identical to hardcoded cards on the same day. */
function liveDisplayName(e){
  if(e && e.kind === 'conquest' && typeof conquestRunLabel === 'function'){
    const run = (typeof conquestRunForDate === 'function')
      ? conquestRunForDate(Number(e.startMs)) : null;
    return conquestRunLabel(e.name, e.id, run);
  }
  return (e && e.name) || '';
}

const eventRewardDetails = new Map();

function gameEventCopy(icon, title, dateMs, live){
  const caption = title;
  if(live && isDropEvent(live)) return { title, type:'Special Event', caption:'Bonus Rewards Event!' };
  if(icon === 'client_update') return { title:'Client Update', type:'Game Update', caption:'Client Update Expected' };
  if(icon === 'shipment_update') return { title:'Shipment Update', type:'Shipments', caption:'Previous Era Shards Added' };
  if(icon && icon.startsWith('datacron_set')){
    const set = typeof DATACRON_SETS !== 'undefined' && DATACRON_SETS.find(entry=>dateKey(dateMs)===entry.added);
    return { title:set ? set.name : 'New Datacron Set', type:'Datacron Set', caption:'New Datacrons Expected' };
  }
  if(icon === 'era_changeover' || icon === 'era_end'){
    const era = eraForDay(icon === 'era_end' ? dateMs - 86400000 : dateMs);
    return { title:era ? era.name.replace(/^Era of /,'') : title, type:icon === 'era_end'?'Era Ends':'Era Release', caption:icon === 'era_end'?'Era Ends':'Episode 1 Begins' };
  }
  if(icon === 'episode_start'){
    const info = scheduleInfoForDay(dateMs);
    return { title:`Episode ${info.episode}`, type:'Episode Release', caption:`Episode ${info.episode} Begins` };
  }
  if(icon && icon.startsWith('tw_')) return { title:'Territory War', type:'Guild Event', caption:title.replace(/^Territory War\s*/i,'') };
  if(icon && icon.startsWith('gac_')) return { title:'Grand Arena', type:'Grand Arena Championship', caption:title.replace(/^GAC\s*/i,'') };
  if(icon === 'rote' || icon === 'tb_ends') return { title:'Rise of the Empire', type:'Territory Battle', caption:title.replace(/^Rise of the Empire\s*/i,'') };
  if(icon && icon.startsWith('conquest_')) return { title:'Conquest', type:'Conquest', caption };
  if(icon && icon.startsWith('era_battle_')) return { title:ERA_BATTLE_NAMES[icon] || title, type:'Era Battle', caption };
  if(icon && icon.startsWith('era_challenge_')) return { title:MARQUEE_NAMES[icon.replace('era_challenge_','marquee_')] || title, type:'Era Challenge', caption:'Earn Era Currency!' };
  if(icon === 'journey_guide' || icon === 'journey_rerun_3') return { title:'Terrible Tings', type:'Legendary Event', caption:'Earn Darth Jar Jar Shards!' };
  if(icon === 'journey_rerun_1') return { title:'Web of Hate', type:'Legendary Event', caption:'Earn Maul (Hate-Fueled) Shards!' };
  if(icon === 'journey_rerun_2') return { title:'The Price of Hope', type:'Legendary Event', caption:'Earn Cassian Andor (Undercover) Shards!' };
  if((icon && icon.startsWith('marquee_')) || (live && live.kind === 'marquee')) return { title:title.replace(/ Marquee$/i,''), type:'Special Marquee Event', caption:'Earn Rewards Daily!' };
  const liveTypes = { 'era-challenge':'Era Challenge', assault:'Assault Battle', omega:'Omega Battle', fleet:'Fleet Mastery', conquest:'Conquest' };
  return { title, type:live && liveTypes[live.kind] || (icon ? tagFor(icon).label : 'Event'), caption:live && live.details || '' };
}

function gameEventRewardUnit(icon, live){
  const portraits = { marquee_1:'marajadeskywalker', marquee_2:'yodadsv', marquee_3:'lukestarkiller', marquee_4:'stormtrooperconcept', marquee_5:'jaxxon', marquee_6:'theronin' };
  const names = { journey_guide:'Darth Jar Jar', journey_rerun_3:'Darth Jar Jar', journey_rerun_1:'Maul (Hate-Fueled)', journey_rerun_2:'Cassian Andor (Undercover)' };
  const name = names[icon] || (icon && icon.startsWith('marquee_') && MARQUEE_NAMES[icon]);
  if(!name) return null;
  return { name, portrait:portraits[icon] ? `live/bonus-${portraits[icon]}.png` : null };
}

function gameEventCardHTML(model){
  const key = `${model.icon || model.liveId || model.title}|${model.startMs}`;
  if(eventRewardDetails.size > 1000) eventRewardDetails.clear();
  eventRewardDetails.set(key, model);
  const relCls = model.relLabel === 'Now' ? 'xcard-rel is-today' : model.relLabel === 'Expired' ? 'xcard-rel is-expired' : 'xcard-rel';
  const bonus = model.bonusId;
  const action = bonus ? `openBonusWave('${bonus}')` : 'openEventRewards(this.dataset.eventRewards)';
  const facts = cardWhenRow(model.startMs, model.duration);
  const accessibleTiming = `${fmtEventStart(model.startMs)}${model.duration == null ? '' : ' · '+formatDurationHours(model.duration)}`;
  return `<article class="xcard game-event-card${model.copy.title.length > 22 ? ' long-title' : ''}${bonus ? ' is-clickable' : ''}" style="${model.style}" aria-label="${escAttr(model.title)}">
    <div class="xcard-art${model.fit ? ' fit' : ''}${model.shared ? ' icon-art' : ''}${model.drop ? ' drop-art' : ''}${model.era ? ' era-art' : ''}${model.datacron ? ' datacron-art' : ''}${model.icon === 'client_update' ? ' update-art' : ''}">
      ${model.shared ? iconCardBackdropHTML() : `<div class="art-badge" aria-hidden="true">${escHTML(model.glyph)}</div>`}
      ${model.art ? `<img src="${imgPath(model.art)}" alt="" loading="${model.shared ? 'eager' : 'lazy'}" decoding="async" onerror="this.remove()">` : ''}
      <div class="xcard-shade"></div>
      <div class="xcard-art-meta"><span data-clock-start="${model.startMs}"${Number.isFinite(model.endMs) ? ` data-clock-end="${model.endMs}"` : ''} data-timing-kind="${/\d/.test(model.relLabel) ? 'time' : 'status'}" class="${relCls}">${model.relLabel}</span></div>
    </div>
    <div class="xcard-body"><h4>${escHTML(model.copy.title)}</h4><div class="xcard-kicker">${escHTML(model.copy.type)}</div>${model.description ? `<div class="xcard-sub">${escHTML(model.description)}</div>` : ''}<div class="game-event-facts">${facts}</div></div>
    <div class="game-event-footer"><p>${escHTML(model.copy.caption)}</p><button type="button" class="game-event-action" data-event-rewards="${escAttr(key)}"${bonus ? ` data-bonus-wave="${escAttr(bonus)}"` : ''} onclick="${action}" aria-label="Details for ${escAttr(model.title)}" title="${escAttr(accessibleTiming)}">DETAILS</button></div>
  </article>`;
}

function openEventRewards(key){
  const model = eventRewardDetails.get(key);
  if(!model || typeof document === 'undefined') return;
  const body = document.getElementById('bonusWaveBody');
  const modal = document.getElementById('bonusWaveModal');
  if(!body || !modal) return;
  document.getElementById('bonusWaveTitle').textContent = model.title;
  const type = document.getElementById('bonusWaveType');
  if(type) type.textContent = model.copy.type;
  const count = document.getElementById('bonusWaveCount');
  if(count) count.textContent = '';
  document.getElementById('bonusWaveWindow').innerHTML = bonusWaveWindowHTML(model);
  const unit = model.rewardUnit;
  body.innerHTML = unit
    ? `<li class="bdrop-row marquee-reward"><div class="bdrop-unit"><span class="bdrop-shard" aria-hidden="true"><img class="bdrop-shard-background" src="${imgPath('atlases/standard_rgba_atlas/ShardIcon.png')}" alt="">${unit.portrait ? `<img class="bdrop-shard-unit" src="${imgPath(unit.portrait)}" alt="">` : ''}</span><div><h4 class="bdrop-name">${escHTML(unit.name)}</h4><p class="reward-kind">Character shards</p></div></div><dl class="bdrop-details"><div class="bdrop-field"><dt>Event</dt><dd>${escHTML(model.copy.type)}</dd></div></dl></li>`
    : '<li class="reward-empty">Reward details unavailable</li>';
  if(typeof openModal === 'function') openModal(modal);
}

function liveCardHTML(e, relLabel){
  const drop = isDropEvent(e);
  const meta = liveCardMeta(e);
  const catMeta = (typeof CATEGORY_META !== 'undefined' && CATEGORY_META[meta.cat]) || {};
  const style = `--accent:${catMeta.accent || 'var(--text3)'};--accent-dim:${catMeta.dim || 'transparent'};--accent-border:${catMeta.border || 'var(--border)'}`;
  const art = liveDisplayArt(e, meta);
  const relCls = relLabel === 'Now' ? 'xcard-rel is-today'
    : relLabel === 'Expired' ? 'xcard-rel is-expired' : 'xcard-rel';
  // Additive-drop waves open a unit breakdown popup (see openBonusWave).
  const bonus = e && Array.isArray(e.units) && e.units.length ? e : null;
  const bonusId = bonus ? String(bonus.id).replace(/[^A-Z0-9_]/gi, '') : '';
  const icon = liveRotationIcon(e);
  const era = /^eras\//.test(art || '');
  const shared = drop || meta.cat === 'update' || era || art === 'events/eraicon.png' || (icon && icon.startsWith('gac_'));
  const copy = gameEventCopy(icon, liveDisplayName(e), e.startMs, e);
  if(copy.type === 'Event') copy.type = meta.label;
  return gameEventCardHTML({ title:liveDisplayName(e), copy,
    icon, liveId:e.id, art, glyph:meta.glyph, style, fit:shared || !!e.fit, shared, drop, era,
    datacron:!!(icon && icon.startsWith('datacron_set')), startMs:e.startMs, endMs:e.endMs,
    duration:liveDurationHours(e), relLabel, bonusId, description:e.details, rewardUnit:gameEventRewardUnit(icon, e) });
}

/* Additive-drop wave popup: one row per featured unit — shard icon
   and name, then the battles whose drop tables carry its shards with
   the energy icon, then what the unit drops once already at 7 stars.
   Pure and unit-tested via bonusWaveRowsHTML. */
function bonusWaveRowsHTML(entry){
  const units = (entry && Array.isArray(entry.units)) ? entry.units : [];
  return units.map(u => {
    const shard = (u && u.portrait)
      ? `<img class="bdrop-shard-unit" src="${imgPath(u.portrait)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
      : '';
    const energy = (u && u.energy)
      ? `<img class="bdrop-energy" src="${imgPath(u.energy)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
      : '';
    const tint = (u && (u.alignment === 'dark' || u.alignment === 'neutral')) ? u.alignment : 'light';
    const maxed = escHTML((u && u.maxed) || '—');
    const rewardArt = u && BONUS_REWARD_ICONS[u.maxed];
    const rewardIcon = rewardArt
      ? `<img class="bdrop-reward-icon" src="${imgPath(rewardArt)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
      : '';
    const star = `<img class="bdrop-star" src="${imgPath('atlases/standard_rgba_atlas/icon_rendered_star.png')}" alt="" aria-hidden="true">`;
    return `<li class="bdrop-row">`
      + `<div class="bdrop-unit">`
      + `<span class="bdrop-shard ${tint}" aria-hidden="true"><img class="bdrop-shard-background" src="${imgPath('atlases/standard_rgba_atlas/ShardIcon.png')}" alt="">${shard}</span>`
      + `<h4 class="bdrop-name">${escHTML((u && u.name) || '')}</h4></div>`
      + `<dl class="bdrop-details">`
      + `<div class="bdrop-field"><dt>Farm in</dt><dd class="bdrop-nodes">${energy}<span>${escHTML((u && u.details) || '—')}</span></dd></div>`
      + `<div class="bdrop-field bdrop-reward"><dt><span class="bdrop-rarity" aria-label="7 stars">7${star}</span> replacement</dt><dd class="bdrop-maxed">${rewardIcon}<span>${maxed}</span></dd></div>`
      + `</dl></li>`;
  }).join('');
}

function bonusWaveWindowHTML(entry){
  return `<dl class="bdrop-window">` + [['Starts', entry && entry.startMs], ['Ends', entry && entry.endMs]]
    .filter(([, ms]) => Number.isFinite(ms) && Number.isFinite(new Date(ms).getTime()))
    .map(([label, ms]) => `<div><dt>${label}</dt><dd><time datetime="${new Date(ms).toISOString()}">${escHTML(fmtEventStart(ms))}</time></dd></div>`)
    .join('') + `</dl>`;
}

function openBonusWave(id){
  const entry = (typeof liveEventsCache !== 'undefined' && liveEventsCache && Array.isArray(liveEventsCache.events))
    ? liveEventsCache.events.find(e => e && e.id === id) : null;
  if(!entry || typeof document === 'undefined') return;
  const title = document.getElementById('bonusWaveTitle');
  const body = document.getElementById('bonusWaveBody');
  const modal = document.getElementById('bonusWaveModal');
  const timing = document.getElementById('bonusWaveWindow');
  const count = document.getElementById('bonusWaveCount');
  if(!body || !modal) return;
  if(title) title.textContent = liveDisplayName(entry);
  const type = document.getElementById('bonusWaveType');
  if(type) type.textContent = 'Special Event';
  if(timing) timing.innerHTML = bonusWaveWindowHTML(entry);
  if(count){
    const n = Array.isArray(entry.units) ? entry.units.length : 0;
    count.textContent = `${n} unit${n === 1 ? '' : 's'}`;
  }
  body.innerHTML = bonusWaveRowsHTML(entry);
  if(typeof openModal === 'function') openModal(modal);
  else {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
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
      im.src = withAssetV(base + art);
    });
  } catch(e){}
}

function loadLiveEvents(){
  // Fills the cache the day-by-day explorer overlays. No section of its
  // own — without a snapshot the explorer simply shows the rotation.
  if(typeof fetch !== 'function') return Promise.resolve(false);
  if(liveEventsPending) return liveEventsPending;
  if(Date.now() < liveEventsNextAttemptMs) return Promise.resolve(false);
  liveEventsPending = (async () => {
    try {
      const opts = { cache: 'no-store' };
      if(typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') opts.signal = AbortSignal.timeout(15000);
      const res = await fetch('assets/data/live-events.json', opts);
      if(!res.ok) throw new Error('HTTP ' + res.status);
      const next = await res.json();
      if(!next || !Array.isArray(next.events) || !Number.isFinite(next.pulledAt)) throw new Error('Invalid live snapshot');
      const changed = !liveEventsCache || next.gameDataVersion !== liveEventsCache.gameDataVersion
        || JSON.stringify(next.events) !== JSON.stringify(liveEventsCache.events);
      liveEventsCache = next;
      liveEventsNextAttemptMs = Date.now() + 15 * 60000;
      if(changed){
        preloadLiveArt();
        if(typeof renderAll === 'function') renderAll({ preserveFocus: true });
      } else updateFooterMeta();
      return changed;
    } catch(e){
      liveEventsNextAttemptMs = Date.now() + 60000;
      if(typeof console !== 'undefined' && console.warn) console.warn('[swgoh-schedule] live events unavailable:', e.message);
      return false;
    }
  })().finally(() => { liveEventsPending = null; });
  return liveEventsPending;
}

/* =========================================================
   SCHEDULE EXPLORER (day-by-day wide cards)
   ========================================================= */

let explorerOffset = 0;
const EXPLORER_WINDOW = 7;
const EXPLORER_PILL_WIDTH = 44;
const EXPLORER_GAP = 4;

function explorerBoundsFor(st){
  const length = st.eraLength || eraLengthDays();
  const forward = typeof SCHEDULE_LOOKAHEAD_DAYS !== 'undefined' ? SCHEDULE_LOOKAHEAD_DAYS : 42;
  const last = configuredEras().at(-1);
  return {
    minOffset: -(st.eraDay - 1),
    maxOffset: Math.max(length - st.eraDay, forward, last ? Math.ceil((last.endMs - st.currentDayStartMs) / 86400000) - 1 : 0)
  };
}

function explorerWindowSize(strip){
  return EXPLORER_WINDOW;
}

function explorerDayAt(st, offset){
  const dMs = st.currentDayStartMs + (offset * 86400000);
  const info = scheduleInfoForDay(dMs);
  const crossEra = !info.era || !st.era || info.era.id !== st.era.id;
  return { offset, dMs, dIdx: info.eraDay, ep: info.episode, rotationEpisode: info.rotationEpisode, dayInEp: info.dayInEp, week: info.week,
    era: info.era, crossEra, items: getEventsForDay(dMs, info.episode, info.dayInEp) };
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

/* Current-era links use #day-N; dates outside it use #date-YYYY-MM-DD.
   app.js restores either form on load and on hashchange. */
function syncDayHash(){
  try {
    if(typeof location === 'undefined' || typeof history === 'undefined') return;
    const st = getGameStatus();
    const viewed = explorerDayAt(st, explorerOffset);
    const want = viewed.crossEra ? '#date-' + dateKey(viewed.dMs) : '#day-' + (st.eraDay + explorerOffset);
    if(location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
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

function explorerCardHTML(item, dateMs, relLabel, tbCtx, nowMs){
  const cat = categoryFor(item.icon);
  const meta = CATEGORY_META[cat];
  const tag = tagFor(item.icon);
  const isTbCard = tbCtx && (item.icon === 'rote' || item.icon === 'tb_ends');
  const liveMatch = liveMatchesForSlot(item.icon, dateMs)[0] || null;
  const art = isTbCard ? tbCtx.art : item.art || (liveMatch && liveMatch.art) || assetFor(item.icon, dateMs);
  const era = item.icon === 'era_changeover' || item.icon === 'era_end' || item.icon === 'episode_start' || /^eras\//.test(art || '');
  const shared = era || cat === 'update' || item.icon.startsWith('gac_') || art === 'events/eraicon.png';
  const baseItem = liveMatch && liveMatch.kind === 'marquee' && liveMatch.name ? { icon:item.icon, label:liveMatch.name } : item;
  const title = tenseByStart(getFullScheduleLabel(baseItem), baseItem, dateMs, nowMs);
  const startMs = eventStartMs(item, dateMs);
  const duration = eventDurationHours(item, dateMs, isTbCard ? tbCtx : null);
  return gameEventCardHTML({ title, copy:gameEventCopy(item.icon, title, dateMs, liveMatch),
    icon:item.icon, art, glyph:tag.glyph, style:`--accent:${meta.accent};--accent-dim:${meta.dim};--accent-border:${meta.border}`,
    fit:shared || isFitArt(item.icon), shared, era, datacron:item.icon.startsWith('datacron_set'),
    startMs, endMs:duration == null ? null : startMs+duration*3600000, duration, relLabel,
    rewardUnit:gameEventRewardUnit(item.icon, liveMatch) });
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
    if(!e || e.kind === 'credit-heist' || e.kind === 'gac') continue;
    const icon = liveRotationIcon(e);
    if(icon) covered.add(icon);
    if(e.kind === 'conquest') covered.add('conquest_end');
    // Unit/name-level: a starting live marquee covers its rotation
    // marquee slot, an era-challenge its era slot, a journey-ish event
    // the guide slot — even when kinds differ (Terrible Tings vs the
    // Darth Jar Jar guide).
    for(const slot of liveSlotKeys()){
      if(slotMatchesEvent(slot, e)) covered.add(slot);
    }
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
      const kindCls = e.kind === 'conquest' ? ' day-live-cq' : meta.cat === 'special' ? ' day-live-special' : '';
      const badgeName = liveDisplayName(e);
      const badgeTitle = (e && e.details) ? `${badgeName} — ${e.details}` : `${badgeName}`;
      return `<div class="day-boss day-live${kindCls}" title="${escHTML(badgeTitle)}, day ${day} of ${total}">`
        + `<img src="${imgPath(art)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
        + `<div class="db-text"><span class="db-label">Day ${day} of ${total}</span>`
        + `<span class="db-name">${escHTML(badgeName)}</span></div></div>`;
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
function rotationBadgesHTML(windows, dayLive, dayStartMs){
  const liveKinds = new Set((dayLive || []).map(e => e && e.kind).filter(Boolean));
  // A live event of the same family already badges the day (or shows
  // its own card), so the rotation window stays out of the way. Units
  // beat kinds: a journey-ish live event for the guide unit suppresses
  // the guide window even though their kinds differ.
  return (windows || [])
    .filter(w => {
      const kind = rotationWindowKind(w.icon);
      if(!kind || liveKinds.has(kind)) return false;
      if(Number.isFinite(dayStartMs) && liveMatchesForSlot(w.icon, dayStartMs).length) return false;
      return true;
    })
    .map(w => {
      const icon = w.icon;
      const cat = categoryFor(icon);
      const meta = (typeof CATEGORY_META !== 'undefined' && CATEGORY_META[cat]) || {};
      const art = (typeof assetFor === 'function' && assetFor(icon)) || 'events/eraicon.png';
      const name = rotationWindowName(icon);
      const style = `--accent:${meta.accent || 'var(--text3)'};--accent-dim:${meta.dim || 'transparent'};--accent-border:${meta.border || 'var(--border)'}`;
      return `<div class="day-badge" style="${style}" title="${escHTML(name)}, day ${w.day} of ${w.total}">`
        + `<img src="${imgPath(art)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
        + `<div class="db-text"><span class="db-label">Day ${w.day} of ${w.total}</span>`
        + `<span class="db-name">${escHTML(name)}</span></div></div>`;
    }).join('');
}

function rotationEventsForDay(dayStartMs){
  const entries = [];
  for(let ago = 0; ago <= 32; ago++){
    const dateMs = dayStartMs - ago * 86400000;
    const info = scheduleInfoForDay(dateMs);
    const run = tbRunContext(dateMs, info.rotationEpisode, info.dayInEp);
    const def = run ? tbChoiceForRun() : null;
    const tbCtx = run ? { def, offset:run.offset, phase1Ms:run.phase1Ms, art:def.art } : null;
    const sourceCovered = ago ? liveCoveredIcons(liveEventsForDay(dateMs)) : new Set();
    for(const item of getEventsForDay(dateMs, info.episode, info.dayInEp)){
      const startMs = eventStartMs(item, dateMs);
      const duration = eventDurationHours(item, dateMs, tbCtx);
      const endMs = duration == null ? null : startMs + duration * 3600000;
      if(startMs >= dayStartMs + 86400000) continue;
      const repeatsDaily = /^(marquee_|era_challenge_|journey_guide$|journey_rerun_[12]$|conquest_start$)/.test(item.icon);
      if(ago && (!repeatsDaily || duration <= 24 || endMs == null || endMs <= dayStartMs || sourceCovered.has(item.icon))) continue;
      entries.push({ item, dateMs, startMs, endMs, tbCtx });
    }
  }
  return entries;
}

function renderExplorer(st){
  const strip = document.getElementById('dayStrip');
  const detail = document.getElementById('dayDetail');
  if(!strip || !detail) return;

  const bounds = explorerBoundsFor(st);
  explorerOffset = Math.min(bounds.maxOffset, Math.max(bounds.minOffset, explorerOffset));
  const windowSize = explorerWindowSize(strip);
  const selectedEraDay = st.eraDay - 1 + explorerOffset;
  const totalDays = st.eraDay + bounds.maxOffset;
  const winStart = Math.max(0, Math.min(
    Math.floor(selectedEraDay / windowSize) * windowSize,
    totalDays - windowSize));
  const winEnd = Math.min(totalDays, winStart + windowSize);
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
    pills += `<button type="button" class="${cls}" onclick="jumpExplorer(${o})" aria-label="${d.crossEra ? '' : `Day ${d.dIdx}, `}${fmtDateUTC(gameDayDisplayMs(d.dMs))}${o === 0 ? ', today' : ''}" aria-pressed="${o === explorerOffset}"${o === explorerOffset ? ' aria-current="date"' : ''}>`
      + `<span class="dp-dow">${parts.dow}</span>`
      + `<span class="dp-num">${d.crossEra ? parts.num : d.dIdx}</span>`
      + `<span class="dp-date">${d.crossEra ? parts.month + (o > 0 ? ` · +${o}d` : '') : `${parts.num} ${parts.month}`}</span>`
      + `<span class="dp-dot"></span></button>`;
  }
  strip.innerHTML = pills;

  const dayJump = document.getElementById('dayJump');
  if(dayJump){
    const jumpKey = `${st.currentEraStartMs}|${totalDays}|${tz()}`;
    if(dayJump.dataset.scheduleKey !== jumpKey){
      let opts = '<option value="">Select day…</option>';
      for(let idx = 1; idx <= totalDays; idx++){
        const dMs = st.currentEraStartMs + ((idx - 1) * 86400000);
        const era = eraForDay(dMs);
        const same = st.era && era && era.id === st.era.id;
        opts += `<option value="${idx}">${same ? `Day ${idx} · ` : ''}${fmtDateUTC(gameDayDisplayMs(dMs))}${same ? '' : ` · ${escHTML(era ? era.name : 'Upcoming era')}`}</option>`;
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
    const eventKey = `${st.currentEraStartMs}|${totalDays}|${tz()}|${st.eraDay}`;
    if(eventJump.dataset.scheduleKey !== eventKey){
      const epLen = episodeLengthDays();
      const groups = [
        { title: 'Marquee', test: icon => icon.startsWith('marquee_') },
        { title: 'Journey Guide', test: icon => icon === 'journey_guide' },
        { title: 'Fleet Mastery', test: icon => icon.startsWith('fleet_') },
        { title: 'Proving Grounds', test: icon => icon === 'proving_ground' },
      ];
      const hits = groups.map(() => []);
      for(let idx = 1; idx <= totalDays; idx++){
        const ep = Math.floor((idx - 1) / epLen) + 1;
        const dep = ((idx - 1) % epLen) + 1;
        const dateMs = st.currentEraStartMs + ((idx - 1) * 86400000);
        getEventsForDay(dateMs, ep, dep)
          .filter(it => isJumpToEvent(it.icon))
          .forEach(it => {
            const gi = groups.findIndex(g => g.test(it.icon));
            const era = eraForDay(dateMs);
            const same = st.era && era && era.id === st.era.id;
            if(gi >= 0) hits[gi].push(`<option value="${idx}">${escHTML(tenseByStart(it.label, it, dateMs, st.nowMs))} · ${same ? `Day ${idx}` : fmtDateUTC(gameDayDisplayMs(dateMs))}</option>`);
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
  const liveCards = [...starting, ...ongoing.filter(e => e.endMs - e.startMs > 86400000)]
    .map(e => liveCardHTML(e, liveRel(e))).join('');
  const covered = liveCoveredIcons(dayLive);
  const rotationCards = rotationEventsForDay(cur.dMs)
    .filter(entry => !covered.has(entry.item.icon))
    .map(entry => explorerCardHTML(entry.item, entry.dateMs,
      entry.endMs != null && entry.endMs <= st.nowMs ? 'Expired' : cardRel(entry.startMs),
      entry.tbCtx, st.nowMs)).join('');
  detail.innerHTML = `
    <div class="day-detail-head">
      <div>
        <h3>${headTitle}</h3>
        <p>${cur.crossEra ? escHTML(cur.era ? cur.era.name : 'Upcoming era · TBA') : `Day ${cur.dIdx} / ${st.eraLength || eraLengthDays()}`}${cur.era ? ` · Episode ${cur.ep}, Week ${cur.week}` : ''}</p>
      </div>
      <div class="day-indicators">
        <div class="day-boss" title="Coliseum boss rotates daily at 18:00 UTC">
        <img src="${imgPath(bossIcon)}" alt="" loading="lazy" fetchpriority="low" decoding="async" onerror="this.remove()">
        <div class="db-text"><span class="db-label">Coliseum boss</span><span class="db-name">${bossName}</span></div>
        </div>
      </div>
    </div>
    ${liveCards || rotationCards
      ? `<div class="xcard-deck" tabindex="0" role="region" aria-label="Events this day">${liveCards}${rotationCards}</div>`
      : `<p class="empty-note">No events scheduled for this day.</p>`}`;
}

function getFullScheduleLabel(item){
  // TB labels already carry the full name
  // (e.g. "Rise of the Empire Phase 1 Starts") — no extra prefix.
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

const fullScheduleCache = { eraStartMs: null, activeDay: null, tzKey: null, cfgKey: null };
let scheduleFilterEp = 0; // 0 = all episodes

function gameDayDisplayMs(dateMs){
  return dateMs + (stdHour() * 3600000);
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
  // Timezone is part of the cache key: every date string in the
  // timeline is rendered in the display zone, so a tz change must
  // rebuild rather than reuse the cached markup. Changeover hours and
  // era/episode lengths also shift every timestamp, so they join the key.
  const tzKey = (typeof getTimeZoneSetting === 'function') ? getTimeZoneSetting() : 'local';
  const totalDays = st.eraDay + explorerBoundsFor(st).maxOffset;
  const cfgKey = [stdHour(), gacHour(), totalDays, episodeLengthDays(), st.eraName].join('|');
  const sameEra = fullScheduleCache.eraStartMs === st.currentEraStartMs
    && fullScheduleCache.tzKey === tzKey
    && fullScheduleCache.cfgKey === cfgKey;

  if(!sameEra){
    let html = '';
    const episodeCount = Math.ceil(totalDays / episodeLengthDays());
    const filters = document.getElementById('scheduleFilters');
    let filterHTML = `<button type="button" class="sf-pill" data-ep="0" onclick="setScheduleFilter(0)">All</button>`;
    for(let ep = 1; ep <= episodeCount; ep++){
      const firstDay = ((ep - 1) * episodeLengthDays()) + 1;
      const lastDay = Math.min(ep * episodeLengthDays(), totalDays);
      const epStartMs = st.currentEraStartMs + ((firstDay - 1) * 86400000);
      const epEndMs = st.currentEraStartMs + ((lastDay - 1) * 86400000);
      const info = scheduleInfoForDay(epStartMs);
      const same = info.era && st.era && info.era.id === st.era.id;
      const heading = info.era ? `${info.era.name} · Episode ${info.episode}` : 'Upcoming era · TBA';
      filterHTML += `<button type="button" class="sf-pill" data-ep="${ep}" onclick="setScheduleFilter(${ep})">${escHTML(same ? `Ep ${info.episode}` : info.era ? info.era.name.replace(/^Era of /i, '') : 'Upcoming')}</button>`;
      html += `<div class="tl-ep" data-ep="${ep}">`
        + `<div class="tl-ep-head"><span>${escHTML(heading)}</span><span class="tl-ep-dates">${fmtDayMonthUTC(gameDayDisplayMs(epStartMs))} → ${fmtDayMonthUTC(gameDayDisplayMs(epEndMs))}</span></div>`;
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
            + `<span class="tl-daynum">${same ? idx : tzDayParts(gameDayDisplayMs(dateMs)).num}</span>`
            + `<span class="tl-date">${fmtDateUTC(gameDayDisplayMs(dateMs))}</span>`
            + `<span class="tl-events">${items.length ? items.map(it => timelineChipHTML(it, dateMs, st.nowMs)).join('') : '<span class="tl-none">—</span>'}</span></div>`;
        }
      }
      html += `</div>`;
    }
    container.innerHTML = html;
    if(filters) filters.innerHTML = filterHTML + `<button type="button" class="sf-today" id="scheduleTodayBtn" onclick="scrollScheduleToToday()">Today</button>`;
    fullScheduleCache.eraStartMs = st.currentEraStartMs;
    fullScheduleCache.activeDay = st.eraDay;
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
  if(!row) return;
  // Scroll the timeline wrap only: the modal is a fixed overlay, so
  // row.scrollIntoView() would also yank the page behind it.
  const wrap = container.closest('.full-schedule-wrap');
  if(wrap){
    const rowRect = row.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    wrap.scrollTop += (rowRect.top - wrapRect.top) - (wrap.clientHeight / 2) + (rowRect.height / 2);
    return;
  }
  row.scrollIntoView({ block: 'center' });
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
    const add = v => { if(typeof v === 'string' && v) urls.add(withAssetV(base + v)); };
    if(typeof EVENT_ICONS !== 'undefined') Object.values(EVENT_ICONS).forEach(add);
    if(typeof CATEGORY_ICONS !== 'undefined') Object.values(CATEGORY_ICONS).forEach(add);
    if(typeof TB_DEFS !== 'undefined') Object.values(TB_DEFS).forEach(d => d && add(d.art));
    if(typeof BOSS_ICONS !== 'undefined') Object.values(BOSS_ICONS).forEach(add);
    if(typeof CRON_COLOR_META !== 'undefined') Object.values(CRON_COLOR_META).forEach(m => m && add(m.asset));
    if(typeof CONQUEST_UNIT_IMAGE !== 'undefined') add(CONQUEST_UNIT_IMAGE);
    if(typeof ERA_UNIT_IMAGE !== 'undefined') add(ERA_UNIT_IMAGE);
    if(typeof ICON_CARD_BACKDROP !== 'undefined') add(ICON_CARD_BACKDROP);
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
  // Live timings older than the freshness window (see the
  // live-events.json test) are flagged — without this a stale
  // snapshot silently mixes old timings into the explorer.
  let liveNote = '';
  try {
    const pulledAt = liveEventsCache && Number(liveEventsCache.pulledAt);
    if(Number.isFinite(pulledAt) && Date.now() - pulledAt > 48 * 3600000) liveNote = ' · live data stale';
  } catch(e){}
  el.textContent = `Resets ${h}:00 UTC daily · showing ${tzDisplayName()} · loaded ${new Date(dms(Date.now())).toLocaleString('en-GB', { timeZone: tz(), hour12: false })}${liveNote}`;
}

let renderDeferredForFocus = null;

// Update clocks without replacing cards, images or focused controls.
// Changes to the schedule state still use renderAll().
function refreshClockDisplays(st){
  renderStatusDashboard(st, { clockOnly: true });
  renderUnlockWindows(st, { clockOnly: true });
  const detail = document.getElementById('dayDetail');
  if(detail){
    const rel = relativeDayLabel(explorerOffset, st.nowMs, st.currentDayStartMs);
    detail.querySelectorAll('[data-clock-start]').forEach(node => {
      const endMs = Number(node.dataset.clockEnd);
      const label = Number.isFinite(endMs) && endMs <= st.nowMs ? 'Expired'
        : explorerOffset > 0 ? relForEventStart(Number(node.dataset.clockStart), st.nowMs, rel) : rel;
      if(node.textContent !== label) node.textContent = label;
      node.dataset.timingKind = /\d/.test(label) ? 'time' : 'status';
      node.classList.toggle('is-today', label === 'Now');
      node.classList.toggle('is-expired', label === 'Expired');
    });
  }
  const tl = document.getElementById('fullSchedule');
  if(tl) refreshTimelineTense(tl, st.nowMs);
  updateFooterMeta();
}

function renderAll(opts){
  // Background ticks (clock/visibility) must not yank keyboard focus:
  // regions rebuilt via innerHTML are skipped while focused inside
  // them and catch up on the next tick after blur. Direct user
  // actions (day jump, TB pick, tz change, changeovers) rebuild fully.
  const preserveFocus = !!(opts && opts.preserveFocus);
  const active = (typeof document !== 'undefined' && document.activeElement) || null;
  let deferred = false;
  const focused = el => {
    const rewardsOpen = document.getElementById('bonusWaveModal')?.classList.contains('open');
    const skip = !!(preserveFocus && active && el && (el.contains(active)
      || (el.id === 'dayDetail' && rewardsOpen)));
    if(skip) deferred = true;
    return skip;
  };
  const st = getGameStatus();
  renderStaticMeta(st);
  renderMergedHero(st);
  if(!focused(document.getElementById('statusDashboard'))) renderStatusDashboard(st);
  if(!focused(document.getElementById('unlockWindows'))) renderUnlockWindows(st);
  if(!focused(document.getElementById('dayStrip')) && !focused(document.getElementById('dayDetail'))) renderExplorer(st);
  if(!focused(document.getElementById('fullSchedule'))) renderFullSchedule(st);
  updateFooterMeta();
  if(typeof syncTzSelects === 'function') syncTzSelects();
  renderDeferredForFocus = deferred ? active : null;
}
