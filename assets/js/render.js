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
  const cqAbs = nextOccurrenceAbs(CONQUEST_END_OFFSETS, st.rawDayIndex, ERA_LENGTH_DAYS);
  const cqInf = absDayToInfo(cqAbs, st.eraBaseStartMs);
  const cqDateMs = cqInf.dateMs;
  
  const cqDays = Math.round((cqDateMs - st.currentDayStartMs) / 86400000);
  const cqBadge = cqAbs <= st.rawDayIndex || cqDays <= 0 ? 'UNLOCKED' : `IN ${cqDays} DAY${cqDays === 1 ? '' : 'S'}`;

  // Roster locks at the Start of Defense Phase, which is Wednesday (+2 Days)
  const cqNextSignupDate = cqDateMs + (86400000 * 2); 
  const cqGac = gacInfoForDate(cqNextSignupDate);
  const cqGacWeek = Math.ceil(cqGac.cycleDay / 7);

  // --- ERA UNIT ---
  // Finds the NEXT era-start day (Era Changeover / Tuesday)
  const eraAbs = nextOccurrenceAbs(ERA_START_OFFSETS, st.rawDayIndex, ERA_LENGTH_DAYS);
  const eraInf = absDayToInfo(eraAbs, st.eraBaseStartMs);
  const eraDateMs = eraInf.dateMs;
  
  const eraDays = Math.round((eraDateMs - st.currentDayStartMs) / 86400000);
  const eraBadge = eraAbs <= st.rawDayIndex || eraDays <= 0 ? 'THIS ERA' : `IN ${eraDays} DAY${eraDays === 1 ? '' : 'S'}`;

  // Roster locks at the Start of Defense Phase, which is Wednesday (+1 Day)
  const eraNextSignupDate = eraDateMs + 86400000;
  const eraGac = gacInfoForDate(eraNextSignupDate);
  const eraGacWeek = Math.ceil(eraGac.cycleDay / 7);

  // --- DATACRON EXPIRATIONS ---
  const cron = getCurrentDatacronSet(st.nowMs);
  const cronMeta = CRON_COLOR_META[cron.color] || CRON_COLOR_META.orange;
  const daysLeft = Math.ceil((cron.expiresMs - st.nowMs) / 86400000);
  const cronBadgeLabel = daysLeft <= 0 ? 'FINAL DAY' : `${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT`;
  const lastUsable = getLastUsableGuildEvent(cron.expiresMs, st.eraBaseStartMs);
  let lastUsableLabel = '—';
  if(lastUsable){
    lastUsableLabel = getFullScheduleLabel(lastUsable.item);
    if(lastUsable.item.icon.startsWith('gac_')){
      const lastUsableFormat = gacInfoForDate(lastUsable.dateMs).format;
      lastUsableLabel = `${lastUsableFormat} ${lastUsableLabel}`;
    }
  }

  el.innerHTML = `
    <div class="status-card purple-card">
      <div class="sc-header"><span class="sc-title">Conquest Unit (3rd of Volume)</span><span class="sc-badge purple">${cqBadge}</span></div>
      <div class="uw-body" style="--accent:var(--purple);--accent-dim:var(--purple-dim);--accent-border:var(--purple-border)">
        <div class="uw-img"><div class="art-badge">CQ</div><img src="${IMG_BASE}${CONQUEST_UNIT_IMAGE}" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main"><div class="sc-val">Unlocks ${withOrdinal(new Date(dms(cqDateMs)).toLocaleDateString('en-GB',{timeZone: tz(),day:'numeric',month:'short'}))}</div><div class="sc-sub">Conquest Unit can be unlocked</div></div>
          <div class="sc-footer" style="flex-direction:column;align-items:flex-start;gap:2px;">
            <span>Usable in GAC: <span class="highlight">Week ${cqGacWeek} (${cqGac.format})</span></span>
            <span>Roster Locks: ${withOrdinal(new Date(dms(cqNextSignupDate)).toLocaleDateString('en-GB',{timeZone: tz(),day:'numeric',month:'short'}))} (Defense Starts)</span>
          </div>
        </div>
      </div>
    </div>
    <div class="status-card orange-card">
      <div class="sc-header"><span class="sc-title">Era Units Available in Legacy Modes</span><span class="sc-badge orange">${eraBadge}</span></div>
      <div class="uw-body" style="--accent:var(--orange);--accent-dim:var(--orange-dim);--accent-border:var(--orange-border)">
        <div class="uw-img"><div class="art-badge">ERA</div><img src="${IMG_BASE}${ERA_UNIT_IMAGE}" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main"><div class="sc-val">Starts ${withOrdinal(new Date(dms(eraDateMs)).toLocaleDateString('en-GB',{timeZone: tz(),day:'numeric',month:'short'}))}</div><div class="sc-sub">Era Units can be used in Legacy Gamemodes</div></div>
          <div class="sc-footer" style="flex-direction:column;align-items:flex-start;gap:2px;">
             <span>Usable in GAC: <span class="highlight">Week ${eraGacWeek} (${eraGac.format})</span></span>
             <span>Roster Locks: ${withOrdinal(new Date(dms(eraNextSignupDate)).toLocaleDateString('en-GB',{timeZone: tz(),day:'numeric',month:'short'}))} (Defense Starts)</span>
          </div>
        </div>
      </div>
    </div>
    <div class="status-card" style="border-color:${cronMeta.border}">
      <div class="sc-header"><span class="sc-title">Datacron Expirations</span><span class="sc-badge" style="background:${cronMeta.dim};color:${cronMeta.accent};border:1px solid ${cronMeta.border}">${cronBadgeLabel}</span></div>
      <div class="uw-body" style="--accent:${cronMeta.accent};--accent-dim:${cronMeta.dim};--accent-border:${cronMeta.border}">
        <div class="uw-img"><div class="art-badge">${cronMeta.label.slice(0,3).toUpperCase()}</div><img src="${IMG_BASE}${cronMeta.asset}" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main">
            <div class="sc-val">${cron.name}${cron.hasFDC ? ' <span style="color:var(--text3);font-size:11px;font-weight:600;">+ FDC</span>' : ''}</div>
            <div class="sc-sub">This Datacron Set will expire to your inbox</div>
          </div>
          <div class="sc-footer" style="flex-direction:column;align-items:flex-start;gap:2px;">
            <span>Expires: <span class="highlight">${withOrdinal(new Date(dms(cron.expiresMs)).toLocaleDateString('en-GB',{timeZone: tz(),day:'numeric',month:'short',year:'numeric'}))}</span></span>
            <span>Last usable: <span class="highlight">${lastUsableLabel}</span></span>
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

function renderMergedHero(st){
  document.getElementById('mhDayVal').textContent = st.bossEraDay;
  document.getElementById('mhEpVal').textContent = `${st.episode} / 3`;
  document.getElementById('mhWeekVal').textContent = `${st.week} / 4`;
  document.getElementById('mhWeekdayVal').textContent = st.weekdayName;

  const fillPct = Math.min(100, Math.max(0, (st.bossEraDay / 84) * 100));
  document.getElementById('mhFill').style.width = fillPct + '%';

  const eraEndMs = st.currentEraStartMs + (83 * 86400000);
  document.getElementById('mhStartDate').textContent = fmtDateUTC(st.currentEraStartMs);
  document.getElementById('mhEndDate').textContent = fmtDateUTC(eraEndMs);
  document.getElementById('mhDaysRemaining').textContent = `${84 - st.bossEraDay} days remaining`;
}

function renderStatusDashboard(st){
  const container = document.getElementById('statusDashboard');

  const gac = getGacStatus(st);
  const conq = getConquestStatus(st);

  const tmrwDayIndex = (st.eraDay % 84) + 1;
  const tmrwEpisode = Math.floor((tmrwDayIndex - 1) / 28) + 1;
  const tmrwDayInEp = ((tmrwDayIndex - 1) % 28) + 1;
  const todayGuildSummary = getGuildEventSummary(st.episode, st.dayInEp, st.currentDayStartMs);
  const tmrwGuildSummary = getGuildEventSummary(tmrwEpisode, tmrwDayInEp, st.currentDayStartMs + 86400000);

  const isGuildActive = getDayEvents(st.episode, st.dayInEp)
    .some(i => i.icon.startsWith('tw_') || i.icon === 'rote' || i.icon === 'tb_ends');

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
        <div class="sc-val" style="font-size:15px;margin-bottom:2px">Now: <span style="color:var(--text);font-weight:600">${todayGuildSummary}</span></div>
        <div class="sc-sub" style="font-size:12px">Upcoming: <span style="color:var(--amber)">${tmrwGuildSummary}</span></div>
      </div>
      ${guildPhaseTrackerHTML(st)}
      ${tbPickerHTML(todayTbCtx)}
    </div>
  `;
}

/* =========================================================
   SCHEDULE EXPLORER (day-by-day wide cards)
   ========================================================= */

let explorerOffset = 0;
const EXPLORER_WINDOW = 14;
const EXPLORER_RANGE = 84; // browse the full era ahead of today

function explorerDayAt(st, offset){
  const dMs = st.currentDayStartMs + (offset * 86400000);
  const dIdx = ((st.eraDay - 1 + offset) % 84) + 1;
  const ep = Math.floor((dIdx - 1) / 28) + 1;
  const dayInEp = ((dIdx - 1) % 28) + 1;
  const week = Math.floor((dayInEp - 1) / 7) + 1;
  return { offset, dMs, dIdx, ep, dayInEp, week, items: getEventsForDay(dMs, ep, dayInEp) };
}

function shiftExplorer(delta){
  explorerOffset = Math.min(EXPLORER_RANGE - 1, Math.max(0, explorerOffset + delta));
  renderAll();
}

function jumpExplorer(offset){
  explorerOffset = Math.min(EXPLORER_RANGE - 1, Math.max(0, offset));
  renderAll();
}

/* Guild TB picker (shared by the dashboard status card and the
   explorer Phase-1 cards). tbCtx comes from tbRunContext for the
   relevant day; null off-TB weeks. */
function tbPickerHTML(tbCtx){
  if(!tbCtx) return '';
  const btns = tbCtx.options.map(o =>
    `<button type="button" class="tb-pick-btn${o.id === tbCtx.def.id ? ' active' : ''}" onclick="setTbChoice('${o.id}','${tbCtx.side}')" aria-pressed="${o.id === tbCtx.def.id}" title="${o.short || o.name}">${o.tag}</button>`
  ).join('');
  return `<div class="tb-pick" role="group" aria-label="Select your current TB"><span class="tb-pick-label">Select your current TB:</span><div class="tb-pick-btns">${btns}</div></div>`;
}

function explorerCardHTML(item, dateMs, relLabel, tbCtx){
  const cat = categoryFor(item.icon);
  const meta = CATEGORY_META[cat];
  const tag = tagFor(item.icon);
  const isTbCard = tbCtx && (item.icon === 'rote' || item.icon === 'tb_ends');
  const asset = isTbCard ? tbCtx.art : assetFor(item.icon);
  const style = `--accent:${meta.accent};--accent-dim:${meta.dim};--accent-border:${meta.border}`;
  const imgTag = asset ? `<img src="${IMG_BASE}${asset}" alt="" loading="lazy" onerror="this.remove()">` : '';
  const relCls = relLabel === 'Now' ? 'xcard-rel is-today' : 'xcard-rel';

  // Guild TB picker: on Phase-1 days the guild picks which of the
  // run's 3 TBs (side's 2 + Neutral RotE) they are running. The
  // choice persists and drives the art + phase labels everywhere.
  const picker = (tbCtx && tbCtx.showPicker && item.icon === 'rote') ? tbPickerHTML(tbCtx) : '';

  return `<article class="xcard" style="${style}">
    <div class="xcard-art">
      <div class="art-badge">${tag.glyph}</div>
      ${imgTag}
      <div class="xcard-shade"></div>
      <span class="xcard-cat">${tag.label}</span>
      <span class="${relCls}">${relLabel}</span>
    </div>
    <div class="xcard-body">
      <h4>${getFullScheduleLabel(item)}</h4>
      <div class="xcard-date">${eventDateRangeLabel(item, dateMs, isTbCard ? tbCtx : null)}</div>
      ${picker}
    </div>
  </article>`;
}

function renderExplorer(st){
  const strip = document.getElementById('dayStrip');
  const detail = document.getElementById('dayDetail');
  if(!strip || !detail) return;

  const winStart = Math.max(0, Math.min(explorerOffset - 6, EXPLORER_RANGE - EXPLORER_WINDOW));
  let pills = '';
  for(let o = winStart; o < winStart + EXPLORER_WINDOW; o++){
    const d = explorerDayAt(st, o);
    const parts = tzDayParts(d.dMs);
    const cls = 'day-pill'
      + (o === 0 ? ' is-today' : '')
      + (o === explorerOffset ? ' is-selected' : '')
      + (d.items.length ? ' has-events' : '');
    pills += `<button type="button" class="${cls}" onclick="jumpExplorer(${o})" aria-label="${fmtDateUTC(d.dMs)}${o === 0 ? ', today' : ''}">`
      + `<span class="dp-dow">${parts.dow}</span>`
      + `<span class="dp-num">${parts.num}</span>`
      + `<span class="dp-dot"></span></button>`;
  }
  strip.innerHTML = pills;

  document.getElementById('dayPrev').disabled = explorerOffset <= 0;
  document.getElementById('dayNext').disabled = explorerOffset >= EXPLORER_RANGE - 1;

  const cur = explorerDayAt(st, explorerOffset);
  const rel = relativeDayLabel(cur.offset);
  const headTitle = cur.offset === 0
    ? `Now: ${fmtDateLongUTC(cur.dMs)}`
    : `Upcoming ${rel.charAt(0).toLowerCase() + rel.slice(1)}: ${fmtDateLongUTC(cur.dMs)}`;
  const bossName = BOSS_LOOP[(st.bossDayIndex - 1 + cur.offset) % BOSS_LOOP.length];
  const bossIcon = BOSS_ICONS[bossName];
  // TB context for this day: drives the card art, phase labels and
  // the guild picker (shown on Phase-1 days). Null off-TB days.
  const runCtx = tbRunContext(cur.dMs, cur.ep, cur.dayInEp);
  const tbDef = runCtx ? tbChoiceForRun(runCtx) : null;
  const tbCtx = runCtx ? {
    def: tbDef, offset: runCtx.offset, side: runCtx.side,
    phase1Ms: runCtx.phase1Ms, options: runCtx.options, art: tbDef.art,
    showPicker: runCtx.offset === 0
  } : null;
  detail.innerHTML = `
    <div class="day-detail-head">
      <div>
        <h3>${headTitle}</h3>
        <p>Day ${cur.dIdx} / 84 · Episode ${cur.ep}, Week ${cur.week}</p>
      </div>
      <div class="day-boss" title="Coliseum boss rotates daily at 18:00 UTC">
        <img src="${IMG_BASE}${bossIcon}" alt="" loading="lazy" onerror="this.remove()">
        <div class="db-text"><span class="db-label">Coliseum boss</span><span class="db-name">${bossName}</span></div>
      </div>
    </div>
    ${cur.items.length
      ? `<div class="xcard-deck">${cur.items.map(it => explorerCardHTML(it, cur.dMs, rel, tbCtx)).join('')}</div>`
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

const fullScheduleCache = { eraStartMs: null, activeDay: null };
let scheduleFilterEp = 0; // 0 = all episodes

function timelineChipHTML(item){
  const meta = CATEGORY_META[categoryFor(item.icon)];
  return `<span class="tl-chip" style="color:${meta.accent};border-color:${meta.border};background:${meta.dim}">${getFullScheduleLabel(item)}</span>`;
}

function renderFullSchedule(st){
  const container = document.getElementById('fullSchedule');
  if(!container) return;
  const sameEra = fullScheduleCache.eraStartMs === st.currentEraStartMs;

  if(!sameEra){
    let html = '';
    for(let ep = 1; ep <= 3; ep++){
      const epStartMs = st.currentEraStartMs + ((ep - 1) * 28 * 86400000);
      const epEndMs = epStartMs + (27 * 86400000);
      html += `<div class="tl-ep" data-ep="${ep}">`
        + `<div class="tl-ep-head"><span>Episode ${ep}</span><span class="tl-ep-dates">${fmtDayMonthUTC(epStartMs)} → ${fmtDayMonthUTC(epEndMs)}</span></div>`;
      for(let week = 1; week <= 4; week++){
        html += `<div class="tl-week-head">Week ${week}</div>`;
        for(let d = 1; d <= 7; d++){
          const dayInEp = (week - 1) * 7 + d;
          const idx = (ep - 1) * 28 + dayInEp;
          const dateMs = st.currentEraStartMs + ((idx - 1) * 86400000);
          const items = getEventsForDay(dateMs, ep, dayInEp);
          html += `<div class="tl-day${idx === st.eraDay ? ' is-today' : ''}" data-day="${idx}">`
            + `<span class="tl-daynum">${idx}</span>`
            + `<span class="tl-date">${fmtDateUTC(dateMs)}</span>`
            + `<span class="tl-events">${items.length ? items.map(timelineChipHTML).join('') : '<span class="tl-none">—</span>'}</span></div>`;
        }
      }
      html += `</div>`;
    }
    container.innerHTML = html;
    fullScheduleCache.eraStartMs = st.currentEraStartMs;
    fullScheduleCache.activeDay = st.eraDay;
    applyScheduleFilter();
  } else if(fullScheduleCache.activeDay !== st.eraDay){
    const prev = container.querySelector(`.tl-day[data-day="${fullScheduleCache.activeDay}"]`);
    if(prev) prev.classList.remove('is-today');
    const next = container.querySelector(`.tl-day[data-day="${st.eraDay}"]`);
    if(next) next.classList.add('is-today');
    fullScheduleCache.activeDay = st.eraDay;
  }
}

function applyScheduleFilter(){
  const container = document.getElementById('fullSchedule');
  document.querySelectorAll('.sf-pill').forEach(p => {
    p.classList.toggle('active', Number(p.dataset.ep) === scheduleFilterEp);
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
    const todayEp = Math.floor((fullScheduleCache.activeDay - 1) / 28) + 1;
    if(todayEp !== scheduleFilterEp) setScheduleFilter(0);
  }
  const row = container.querySelector(`.tl-day[data-day="${fullScheduleCache.activeDay}"]`);
  if(row) row.scrollIntoView({ block: 'center' });
}

/* =========================================================
   LIVE COUNTDOWN & MASTER RENDER
   ========================================================= */

function renderAll(){
  const st = getGameStatus();
  renderMergedHero(st);
  renderStatusDashboard(st);
  renderUnlockWindows(st);
  renderExplorer(st);
  renderFullSchedule(st);
  if(typeof syncTzSelects === 'function') syncTzSelects();
}
