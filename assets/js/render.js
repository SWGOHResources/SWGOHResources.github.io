/* RENDER — DOM builders. Depends on config.js + time.js globals. */

function datacronOrderHTML(currentColor){
  return CRON_COLOR_ORDER.map((c, i) => {
    const meta = CRON_COLOR_META[c];
    const isCurrent = c === currentColor;
    const dot = `<span style="width:8px;height:8px;border-radius:50%;display:inline-block;background:${isCurrent ? meta.accent : 'var(--void3)'};border:1px solid ${isCurrent ? meta.accent : 'var(--border2)'};flex:0 0 auto;"></span>`;
    const arrow = i < CRON_COLOR_ORDER.length - 1 ? `<span style="color:var(--text3);font-size:10px;">→</span>` : '';
    return dot + arrow;
  }).join('');
}

// A datacron set can only ever be equipped/used for Territory War and
// GAC — never Territory Battle, Conquest, etc. This scans backward day
// by day from the set's expiry date to find the most recent TW or GAC
// event, so we can tell players the last event they'll actually get to
// use the set in before it's removed.

function renderUnlockWindows(st){
  const el = document.getElementById('unlockWindows');
  if(!el) return;

  // --- CONQUEST UNIT ---
  // Finds the NEXT Day 49 (End of Episode 2 / Monday)
  const cqAbs = nextOccurrenceAbs([49], st.rawDayIndex, 84);
  const cqInf = absDayToInfo(cqAbs, st.eraBaseStartMs);
  const cqDateMs = cqInf.dateMs;
  
  // Roster locks at the Start of Defense Phase, which is Wednesday (+2 Days)
  const cqNextSignupDate = cqDateMs + (86400000 * 2); 
  const cqGac = gacInfoForDate(cqNextSignupDate);
  const cqGacWeek = Math.ceil(cqGac.cycleDay / 7);

  // --- ERA UNIT ---
  // Finds the NEXT Day 1 (Era Changeover / Tuesday)
  const eraAbs = nextOccurrenceAbs([1], st.rawDayIndex, 84);
  const eraInf = absDayToInfo(eraAbs, st.eraBaseStartMs);
  const eraDateMs = eraInf.dateMs;
  
  // Roster locks at the Start of Defense Phase, which is Wednesday (+1 Day)
  const eraNextSignupDate = eraDateMs + 86400000;
  const eraGac = gacInfoForDate(eraNextSignupDate);
  const eraGacWeek = Math.ceil(eraGac.cycleDay / 7);

  // --- DATACRON EXPIRATIONS ---
  const cron = getCurrentDatacronSet(st.nowMs);
  const cronMeta = CRON_COLOR_META[cron.color] || CRON_COLOR_META.orange;
  const daysLeft = Math.ceil((cron.expiresMs - st.nowMs) / 86400000);
  const cronBadgeLabel = daysLeft <= 0 ? 'EXPIRES TODAY' : `${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT`;
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
      <div class="sc-header"><span class="sc-title">Conquest Unit (3rd of Volume)</span><span class="sc-badge purple">${cqAbs <= st.rawDayIndex ? 'UNLOCKED' : 'UPCOMING'}</span></div>
      <div class="uw-body" style="--accent:var(--purple);--accent-dim:var(--purple-dim);--accent-border:var(--purple-border)">
        <div class="uw-img"><div class="art-badge">CQ</div><img src="assets/schedule/${CONQUEST_UNIT_IMAGE}" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main"><div class="sc-val">Unlocks ${new Date(cqDateMs).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div><div class="sc-sub">Current Conquest Unit is now available in Legacy Modes</div></div>
          <div class="sc-footer" style="flex-direction:column;align-items:flex-start;gap:2px;">
            <span>Usable in GAC: <span class="highlight">Week ${cqGacWeek} (${cqGac.format})</span></span>
            <span>Roster Locks: ${new Date(cqNextSignupDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} (Defense Starts)</span>
          </div>
        </div>
      </div>
    </div>
    <div class="status-card orange-card">
      <div class="sc-header"><span class="sc-title">Era Units Available in Legacy Modes</span><span class="sc-badge orange">${eraAbs <= st.rawDayIndex ? 'THIS ERA' : 'NEXT ERA'}</span></div>
      <div class="uw-body" style="--accent:var(--orange);--accent-dim:var(--orange-dim);--accent-border:var(--orange-border)">
        <div class="uw-img"><div class="art-badge">ERA</div><img src="assets/schedule/${ERA_UNIT_IMAGE}" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main"><div class="sc-val">Starts ${new Date(eraDateMs).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div><div class="sc-sub">End of Era Changeover</div></div>
          <div class="sc-footer" style="flex-direction:column;align-items:flex-start;gap:2px;">
             <span>Usable in GAC: <span class="highlight">Week ${eraGacWeek} (${eraGac.format})</span></span>
             <span>Roster Locks: ${new Date(eraNextSignupDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} (Defense Starts)</span>
          </div>
        </div>
      </div>
    </div>
    <div class="status-card" style="border-color:${cronMeta.border}">
      <div class="sc-header"><span class="sc-title">Datacron Expirations</span><span class="sc-badge" style="background:${cronMeta.dim};color:${cronMeta.accent};border:1px solid ${cronMeta.border}">${cronBadgeLabel}</span></div>
      <div class="uw-body" style="--accent:${cronMeta.accent};--accent-dim:${cronMeta.dim};--accent-border:${cronMeta.border}">
        <div class="uw-img"><div class="art-badge">${cronMeta.label.slice(0,3).toUpperCase()}</div><img src="assets/schedule/${cronMeta.asset}" onerror="this.remove()"></div>
        <div class="uw-text">
          <div class="sc-main">
            <div class="sc-val">${cron.name}${cron.hasFDC ? ' <span style="color:var(--text3);font-size:11px;font-weight:600;">+ FDC</span>' : ''}</div>
            <div class="sc-sub">Expires ${new Date(cron.expiresMs).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
          </div>
          <div class="sc-footer" style="flex-direction:column;align-items:flex-start;gap:6px;">
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
    let segs = '', labels = '';
    for(let i = 0; i < 6; i++){
      const isDone = gp.complete || i < gp.phaseIndex;
      const isCurrent = !gp.complete && i === gp.phaseIndex;
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
  const todayGuildSummary = getGuildEventSummary(st.episode, st.dayInEp);
  const tmrwGuildSummary = getGuildEventSummary(tmrwEpisode, tmrwDayInEp);

  const isGuildActive = todayGuildSummary.includes('ROTE') || todayGuildSummary.includes('TW');

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
    </div>
  `;
}

/* =========================================================
   CARDS & TABLES RENDERERS
   ========================================================= */

function cardHTML(item, extraClass){
  const cls = extraClass || '';
  const cat = categoryFor(item.icon);
  const meta = CATEGORY_META[cat];
  const asset = assetFor(item.icon);
  const style = `--accent:${meta.accent};--accent-dim:${meta.dim};--accent-border:${meta.border}`;

  const fallbackBadge = `<div class="art-badge"><span class="glyph">${meta.glyph}</span><span class="cat">${meta.label}</span></div>`;
  const imgTag = asset ? `<img src="assets/schedule/${asset}" alt="" onerror="this.remove()">` : '';

  return `<figure class="ecard ${cls}" style="${style}">
    <div class="art">
      ${fallbackBadge}
      ${imgTag}
    </div>
    <div class="cat-tag">${meta.label}</div>
    <figcaption>${item.label}</figcaption>
  </figure>`;
}

function renderCards(el, items, extraClass){
  el.innerHTML = items.length
    ? items.map(i=>cardHTML(i, extraClass)).join('')
    : `<p class="empty-note">— No event changeovers scheduled for this day —</p>`;
}

function getFullScheduleLabel(item){
  const catLabel = GUILD_SUBLABEL[item.icon] || CATEGORY_META[categoryFor(item.icon)]?.label;
  if(!catLabel) return item.label;
  if(item.label.toUpperCase().startsWith(catLabel.toUpperCase())) return item.label;

  const needsCategory = /\b(Phase|Payout|Signup|Attack|Defense|Offense)\b/i.test(item.label);
  return needsCategory ? `${catLabel} ${item.label}` : item.label;
}

const fullScheduleCache = { eraStartMs: null, activeDay: null };

function renderFullSchedule(st){
  const tbody = document.getElementById('fullSchedule');
  const sameEra = fullScheduleCache.eraStartMs === st.currentEraStartMs;

  if(!sameEra){
    const rows = [];
    for(let idx = 1; idx <= 84; idx++){
      const ep = Math.floor((idx - 1) / 28) + 1;
      const dayInEp = ((idx - 1) % 28) + 1;
      const week = Math.floor((dayInEp - 1) / 7) + 1;
      const dateMs = st.currentEraStartMs + ((idx - 1) * 86400000);
      const items = getEventsForDay(dateMs, ep, dayInEp);

      rows.push(`<tr data-day="${idx}" class="${idx === st.eraDay ? 'active' : ''}">
        <td><strong>Day ${idx}</strong></td>
        <td>${fmtDateUTC(dateMs)}</td>
        <td>Ep ${ep}.${week}</td>
        <td>${items.length ? items.map(it => `<span class="event-tag">${getFullScheduleLabel(it)}</span>`).join('') : '—'}</td>
      </tr>`);
    }
    tbody.innerHTML = rows.join('');
    fullScheduleCache.eraStartMs = st.currentEraStartMs;
    fullScheduleCache.activeDay = st.eraDay;
  } else if(fullScheduleCache.activeDay !== st.eraDay){
    const prevRow = tbody.querySelector(`tr[data-day="${fullScheduleCache.activeDay}"]`);
    if(prevRow) prevRow.classList.remove('active');
    const nextRow = tbody.querySelector(`tr[data-day="${st.eraDay}"]`);
    if(nextRow) nextRow.classList.add('active');
    fullScheduleCache.activeDay = st.eraDay;
  }
}

function renderMainFeed(st){
  // Today Events
  const todayDateMs = st.currentDayStartMs;
  const todayEvents = getEventsForDay(todayDateMs, st.episode, st.dayInEp);

  document.getElementById('todayHeading').textContent = `Today — ${st.weekdayName}`;
  document.getElementById('todaySub').textContent = fmtDateUTC(todayDateMs);
  renderCards(document.getElementById('todayCards'), todayEvents);

  // Tomorrow Events
  const tmrwDayIndex = (st.eraDay % 84) + 1;
  const tmrwEp = Math.floor((tmrwDayIndex - 1) / 28) + 1;
  const tmrwDayInEp = ((tmrwDayIndex - 1) % 28) + 1;
  const tmrwDateMs = todayDateMs + 86400000;
  const tmrwEvents = getEventsForDay(tmrwDateMs, tmrwEp, tmrwDayInEp);

  const tmrwWeekday = WEEKDAY_NAMES[new Date(tmrwDateMs).getUTCDay()];

  document.getElementById('tmrwHeading').textContent = `Tomorrow — ${tmrwWeekday}`;
  document.getElementById('tmrwSub').textContent = fmtDateUTC(tmrwDateMs);
  renderCards(document.getElementById('tmrwCards'), tmrwEvents);

  // 7-Day Forecast
  const forecastEl = document.getElementById('forecastRow');
  forecastEl.innerHTML = '';
  for(let i = 0; i < 7; i++){
    const dMs = todayDateMs + (i * 86400000);
    const dIdx = ((st.eraDay - 1 + i) % 84) + 1;
    const ep = Math.floor((dIdx - 1) / 28) + 1;
    const dayInEp = ((dIdx - 1) % 28) + 1;
    const items = getEventsForDay(dMs, ep, dayInEp);

    const chip = document.createElement('div');
    chip.className = 'fchip' + (i === 0 ? ' today' : '');
    chip.innerHTML = `
      <div class="day">${WEEKDAY_SHORT[new Date(dMs).getUTCDay()]}${i === 0 ? ' · Today' : ''}</div>
      <div class="date">${new Date(dMs).toLocaleDateString('en-GB',{ timeZone: 'UTC', day: 'numeric', month: 'short' })}</div>
      <ul>${items.length ? items.map(it=>`<li>${getFullScheduleLabel(it)}</li>`).join('') : '<li>—</li>'}</ul>
    `;
    forecastEl.appendChild(chip);
  }

  // Coliseum Boss Loop
  const bossEl = document.getElementById('bossStrip');
  bossEl.innerHTML = '';

  const activeBossIndex = (st.bossDayIndex - 1) % 4;

  BOSS_LOOP.forEach((bossName, index) => {
    const isActive = index === activeBossIndex;
    const iconFile = BOSS_ICONS[bossName];
    const cell = document.createElement('div');
    cell.className = 'bcell' + (isActive ? ' active' : '');
    cell.innerHTML = `
      <div class="bcell-img">
        <div class="art-badge">BOSS</div>
        <img src="assets/schedule/${iconFile}" alt="" onerror="this.remove()">
      </div>
      <div class="step">Boss ${index + 1} of 4</div>
      <div class="name">${bossName}</div>
      ${isActive ? '<div class="active-tag">ACTIVE TODAY</div>' : ''}
    `;
    bossEl.appendChild(cell);
  });
}

/* =========================================================
   LIVE COUNTDOWN & MASTER RENDER
   ========================================================= */

function renderAll(){
  const st = getGameStatus();
  renderMergedHero(st);
  renderStatusDashboard(st);
  renderUnlockWindows(st);
  renderMainFeed(st);
  renderFullSchedule(st);
}

/* =========================================================
 MODALS, FOCUS TRAPPING & DISCORD COPY
  ========================================================= */
