import { MODES, STORAGE_KEY, MAX_SQUADS, newPlan, blankSquad, unitOptions, assignUnit,
  changeSize, changeMode, normalizePlan, encodePlan, decodePlan, omicronStatus, leaderText, plannedPower } from './squad-model.js?v=454195d7d9';
import { downloadPlanPng } from './squad-export.js';

const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let data, units, plan = newPlan(), selected = { squad: 0, slot: 0 }, history = [], screenshot = false, detailUnit = null;
let faction = '', search = '', hideAssigned = false, role = '', storageFailed = false;
let expandedSquad = 0;
const squads = () => plan.banks[plan.size];
const assigned = () => new Set(squads().flatMap(s => s.slots).filter(Boolean));
const powerOf = unit => plannedPower(plan, unit, data.power);
const formatPower = power => new Intl.NumberFormat('en-GB').format(power);
const powerHint = 'Planned GP: level 85, gear XIII, six level-15 6E mods, maximum base abilities and selected upgrades.';
let statusTimer;
function announce(message) { clearTimeout(statusTimer); $('status').textContent = message; statusTimer=setTimeout(()=>{ $('status').textContent=''; },4000); }
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); storageFailed = false; }
  catch { storageFailed = true; }
  // After editing a shared plan, reload the saved copy rather than the
  // original plan still encoded in the address bar.
  if (new URLSearchParams(location.hash.slice(1)).has('plan')) window.history.replaceState(window.history.state, '', location.pathname + location.search);
  $('saveState').textContent = storageFailed ? 'Storage unavailable · export to keep your plan' : 'Saved on this device';
}
function mutate(fn, message = '') {
  history.push(JSON.stringify(plan)); if (history.length > 30) history.shift();
  fn(); persist(); render(); if (message) announce(message);
}
function portrait(unit, leader = false) {
  const opts = unitOptions(plan, unit), atlas = data.atlas;
  const x = unit.portrait % atlas.columns / (atlas.columns - 1) * 100;
  const y = Math.floor(unit.portrait / atlas.columns) / (atlas.rows - 1) * 100;
  const side = unit.alignment === 'Dark Side' ? 'dark' : unit.alignment === 'Neutral' ? 'neutral' : 'light';
  return `<span class="sp-portrait ${side} ${unit.galacticLegend ? 'galactic-legend' : ''}" aria-hidden="true"><span class="sp-face" style="background-image:url('${escape(data.atlas.path)}');background-position:${x}% ${y}%;background-size:${atlas.columns * 100}% ${atlas.rows * 100}%"></span><span class="sp-relic-frame"></span><span class="sp-relic-frame mirror"></span>${leader ? '<span class="sp-lead-icon"></span>' : ''}<span class="sp-relic"><span class="sr-only">R</span>${opts.relic}</span>${unit.zetaCount ? `<span class="sp-zeta-badge" title="Max-tier Zetas">${unit.zetaCount}</span>` : ''}${opts.omicrons.length ? `<span class="sp-omi-badge">${opts.omicrons.length}</span>` : ''}</span>`;
}
function stars(unit) {
  const n = unitOptions(plan, unit).stars;
  return `<span class="sp-stars" aria-label="${n} planned stars">${Array.from({length:7}, (_,i) => `<i class="${i < n ? '' : 'sp-unlit'}"></i>`).join('')}</span>`;
}
function renderRoster() {
  const used = assigned();
  const matching = data.characters.filter(u => (!faction || u.factions.includes(faction))
    && (!search || u.name.toLowerCase().includes(search)) && (!hideAssigned || !used.has(u.id))
    && (!role || (role === 'Leader' ? u.abilities.some(a => a.type === 'Leader') : role === 'Omicron' ? u.abilities.some(a => a.omicron) : u.role === role)))
    .sort((a, b) => powerOf(b) - powerOf(a) || a.name.localeCompare(b.name));
  const total = data.characters.filter(u => !faction || u.factions.includes(faction)).length;
  $('rosterTitle').textContent = data.factions.find(f => f.id === faction)?.name || 'All characters';
  $('rosterTotal').textContent = total;
  $('rosterSummary').textContent = `${matching.length} shown · ${matching.filter(u => !used.has(u.id)).length} available`;
  $('unitRoster').innerHTML = matching.length ? matching.map(u => {
    const owner = squads().findIndex(s => s.slots.includes(u.id));
    const hint = used.has(u.id) ? `Assigned to ${squads()[owner].name}. Choose to swap or move.` : 'Choose to assign to the selected slot.';
    return `<button type="button" class="sp-roster-unit ${used.has(u.id) ? 'assigned' : ''}" data-unit="${escape(u.id)}" draggable="true" aria-label="${escape(u.name + '. ' + hint)}" title="${escape(u.name + '. ' + hint + ' ' + powerHint)}">${portrait(u)}${stars(u)}<span class="sp-unit-power" title="${powerHint}">Pwr ${formatPower(powerOf(u))}</span><span class="sp-roster-unit-name">${escape(u.name)}</span></button>`;
  }).join('') : '<p class="sp-empty">No characters match these filters. Try another faction, role or name.</p>';
}
function slotMarkup(squad, si, index, interactive = true, modelPreview = false) {
  const u = units.get(squad.slots[index]);
  const active = interactive && selected.squad === si && selected.slot === index;
  const label = u ? `${u.name}, ${index === 0 ? 'leader' : 'slot ' + (index + 1)}. Select to swap.` : `Empty ${index === 0 ? 'leader' : 'slot ' + (index + 1)}. Select to add a character.`;
  return `<div class="sp-slot ${u ? 'sp-filled-slot' : 'sp-empty-slot'} ${active ? 'selected' : ''}" data-slot-container="${si}:${index}">
    ${interactive ? `<button type="button" class="sp-slot-button" data-slot="${si}:${index}" aria-label="${escape(squad.name + ': ' + label)}" aria-pressed="${active}"></button>` : ''}
    <span class="sp-slot-index">${index === 0 ? 'LEADER' : '0' + (index + 1)}</span>
    ${u ? `${modelPreview ? `<canvas class="sp-model" data-model="${escape(u.id)}" aria-label="3D preview of ${escape(u.name)}"></canvas>` : ''}${portrait(u, index === 0)}${stars(u)}<span class="sp-slot-name">${escape(u.name)}</span><span class="sp-slot-role">${escape(u.role)}</span>${interactive ? `<span class="sp-slot-tools"><button type="button" class="sp-icon-btn" data-detail="${escape(u.id)}" aria-label="Details and upgrades for ${escape(u.name)}" title="Details & upgrades">ⓘ</button><button type="button" class="sp-icon-btn" data-remove="${si}:${index}" aria-label="Remove ${escape(u.name)}" title="Remove character">×</button></span>` : ''}`
      : '<span class="sp-slot-plus" aria-hidden="true"></span><span class="sp-slot-name">' + (index === 0 ? 'Select leader' : 'Select character') + '</span>'}
    </div>`;
}
function leaderMarkup(squad) {
  const u = units.get(squad.slots[0]), lead = leaderText(plan, u);
  if (!lead) return u ? '<div class="sp-leader-panel sr-only">This character has no leader ability.</div>' : '';
  const summary = lead?.text.split('\n').find(Boolean) || (u ? 'This character has no leader ability.' : '');
  return `<div class="sp-leader-panel" title="${escape(summary)}"><span class="sp-lead-emblem" aria-hidden="true"></span><p class="sp-eyebrow">LEADER ABILITY</p><h3>${escape(lead.ability.name)}</h3><span class="sp-ability-badge ${lead.useOmicron ? 'eligible' : ''}">${lead.useOmicron ? 'Omicron mode applies' : 'MAXED'}</span><p class="sr-only">${escape(summary)}</p><button class="sp-text-btn" type="button" data-detail="${escape(u.id)}" aria-label="${escape(lead.ability.name)} details">Ability details</button></div>`;
}
function omiMarkup(squad) {
  const chips = squad.slots.flatMap((id, slot) => {
    const u = units.get(id); if (!u) return [];
    return u.abilities.filter(a => a.omicron && unitOptions(plan, u).omicrons.includes(a.id)).map(a => {
      const s = omicronStatus(plan, u, a, slot);
      return `<span class="sp-ability-badge ${s.kind}" title="${escape(a.name + ': ' + s.label)}"><i class="sp-omi-icon" aria-hidden="true"></i> ${escape(u.name)} · ${escape(a.name)} · ${escape(a.omicron.label)}${s.kind === 'eligible' ? ' · mode applies' : s.label === 'Requires leader slot' ? ' · needs leader' : ' · inactive'}</span>`;
    });
  });
  return chips.length ? `<div class="sp-omicron-strip">${chips.join('')}</div>` : '';
}
function renderBoard() {
  $('boardCount').textContent = `${assigned().size} / ${squads().length * plan.size} assigned`;
  $('rosterLeader').innerHTML = leaderMarkup(squads()[expandedSquad ?? selected.squad]);
  $('squadBoard').innerHTML = squads().map((s, si) => {
    const expanded = expandedSquad === si;
    return `<article class="sp-squad ${expanded ? 'is-expanded' : 'is-collapsed'}"><div class="sp-squad-header"><div class="sp-squad-title"><span class="sp-squad-number">${String(si + 1).padStart(2, '0')}</span><input class="sp-squad-name" maxlength="80" value="${escape(s.name)}" data-name="${si}" aria-label="Squad ${si + 1} name"></div><div class="sp-squad-actions"><span class="sp-squad-power" title="${powerHint}">Power: ${formatPower(s.slots.reduce((sum, id) => sum + (id ? powerOf(units.get(id)) : 0), 0))}</span><span class="sp-squad-fill">${s.slots.filter(Boolean).length}/${plan.size}</span><button type="button" class="sp-icon-btn" data-expand="${si}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${escape(s.name)}" aria-expanded="${expanded}" title="${expanded ? 'Collapse squad' : 'Expand squad'}">${expanded ? '▾' : '▸'}</button>${squads().length > 1 ? `<button type="button" class="sp-icon-btn" data-delete="${si}" aria-label="Delete ${escape(s.name)}" title="Delete squad">×</button>` : ''}</div></div>
      <div class="${expanded ? 'sp-formation ' + (plan.size === 3 ? 'sp-formation-three' : '') : 'sp-compact-row'}" style="--slots:${plan.size}">${s.slots.map((_, i) => slotMarkup(s, si, i, true, expanded)).join('')}</div>
      <div class="sr-only">${omiMarkup(s)}</div></article>`;
  }).join('');
  const target = squads()[selected.squad], current = units.get(target?.slots[selected.slot]);
  $('selectionHint').textContent = `${target?.name || 'Squad'} · ${selected.slot === 0 ? 'leader slot' : 'slot ' + (selected.slot + 1)} selected${current ? ' (' + current.name + ')' : ''}. Choose a character to ${current ? 'swap' : 'assign'}, or drag one into any slot.`;
  $('addSquad').disabled = squads().length >= MAX_SQUADS;
  const modelFallback = () => $('squadBoard').querySelectorAll('canvas[data-model]').forEach(canvas => canvas.closest('.sp-slot').classList.add('model-unavailable'));
  if (typeof window.WebGLRenderingContext !== 'undefined') import('./squad-model-view.js').then(m => m.mountModelPreviews($('squadBoard'))).catch(modelFallback);
  else modelFallback();
}
function compactLeader(squad) {
  const lead = leaderText(plan, units.get(squad.slots[0]));
  return `<div class="sp-compact-leader">Leadership: <strong>${escape(lead?.ability.name || 'None')}</strong>${lead?.useOmicron ? ' · Ω mode applies' : ''}</div>`;
}
function renderCapture() {
  $('screenshotBoard').innerHTML = `<div class="sp-capture-head"><div><p class="sp-eyebrow">SWGOH::RESOURCES / SQUAD PLAN</p><h2>${escape(plan.title || 'My squad plan')}</h2><p>${plan.size}v${plan.size} · ${escape(MODES[plan.mode])} · ${squads().length} ${squads().length === 1 ? 'squad' : 'squads'}</p></div><span class="sp-count">${assigned().size} characters assigned</span></div>${squads().map((s, si) => `<article class="sp-squad"><div class="sp-squad-header"><span>${String(si + 1).padStart(2, '0')} / ${escape(s.name)}</span><span class="sp-squad-fill">${s.slots.filter(Boolean).length}/${plan.size}</span></div><div class="sp-compact-row" style="--slots:${plan.size}">${s.slots.map((_, i) => slotMarkup(s, si, i, false)).join('')}</div>${compactLeader(s)}${omiMarkup(s)}</article>`).join('')}<p class="sp-capture-footer">swgohresources.github.io/squads/ · Character data ${escape(data.generatedAt.slice(0, 10))}</p>`;
}
function render() {
  if (!data) return;
  if (!squads()[selected.squad]) selected = { squad: 0, slot: 0 };
  if (selected.slot >= plan.size) selected.slot = 0;
  if (expandedSquad !== null && !squads()[expandedSquad]) expandedSquad = selected.squad;
  $('planTitle').value = plan.title;
  $('battleMode').value = plan.mode;
  document.querySelectorAll('[data-size]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === plan.size)));
  $('undoChange').disabled = history.length === 0;
  renderRoster(); renderBoard(); renderCapture(); enhanceSelects();
}
function setTarget(si, slot) {
  selected = { squad: si, slot }; expandedSquad = si; renderBoard();
  if (innerWidth <= 640 && innerHeight > innerWidth) {
    document.body.classList.add('sp-roster-open');
    $('rosterToggle').setAttribute('aria-expanded', 'true');
  }
}
function place(id, si = selected.squad, slot = selected.slot) {
  if (!units.has(id)) return;
  expandedSquad = si;
  mutate(() => {
    assignUnit(plan, id, si, slot);
    const next = squads()[si].slots.findIndex((v, i) => !v && i > slot);
    selected = { squad: si, slot: next >= 0 ? next : slot };
  }, `${units.get(id).name} assigned to ${squads()[si].name}.`);
}
async function confirm(title, text, action = 'Clear') {
  const d = $('confirmAction'); $('confirmTitle').textContent = title; $('confirmText').textContent = text;
  d.querySelector('[value="confirm"]').textContent = action; d.returnValue = ''; d.showModal();
  return new Promise(resolve => d.addEventListener('close', () => resolve(d.returnValue === 'confirm'), { once: true }));
}
function details(id, open = true) {
  const u = units.get(id); if (!u) return;
  detailUnit = id;
  const opts = unitOptions(plan, u), slot = squads().find(s => s.slots.includes(id))?.slots.indexOf(id) ?? -1;
  const currentScroll = $('unitDetails').scrollTop;
  $('detailsContent').innerHTML = `<div class="sp-detail-head"><div><p class="sp-eyebrow">CHARACTER DETAILS / PLANNED UPGRADES</p><h2 id="detailsTitle">${escape(u.name)}</h2></div><button type="button" class="sp-icon-btn" data-close aria-label="Close character details">×</button></div><p class="sp-detail-tags">${escape([u.alignment, u.role, ...u.factions.map(id => data.factions.find(f => f.id === id)?.name)].filter(Boolean).join(' · '))}</p><div class="sp-upgrades"><label><span class="sp-label">PLANNED RELIC</span><select id="detailRelic">${Array.from({ length: 11 }, (_, i) => `<option value="${i}" ${opts.relic === i ? 'selected' : ''}>Relic ${i}</option>`).join('')}</select></label><label><span class="sp-label">PLANNED STARS</span><select id="detailStars">${Array.from({ length: 7 }, (_, i) => `<option value="${i + 1}" ${opts.stars === i + 1 ? 'selected' : ''}>${i + 1} stars</option>`).join('')}</select></label></div>
    ${u.abilities.map(a => {
      const status = a.omicron ? omicronStatus(plan, u, a, slot) : null;
      const label = a.type === 'Leader' ? (slot === 0 ? 'Active leadership' : 'Leadership · requires first slot') : a.type;
      const base = `<p class="sp-ability-text">${escape(a.baseText)}</p>`;
      return `<section class="sp-detail-ability"><p class="sp-eyebrow">${escape(label)}</p><h3>${escape(a.name)}${a.zeta ? ' <img class="sp-zeta-icon" src="/assets/img/squads/zeta.svg" alt="Zeta">' : ''}</h3>${a.omicron ? `<span class="sp-ability-badge"><i class="sp-omi-icon" aria-hidden="true"></i> ${escape(a.omicron.label)}</span><label class="sp-omi-toggle"><input type="checkbox" data-omicron="${escape(a.id)}" ${opts.omicrons.includes(a.id) ? 'checked' : ''}>Equip this Omicron in the plan</label><span class="sp-ability-badge ${status.kind}">${escape(slot < 0 && status.kind === 'eligible' ? 'Mode applies · character unassigned' : status.label)}</span><details><summary class="sp-text-btn">Read base ability</summary>${base}</details><p class="sp-ability-text">${escape(a.omicron.text)}</p>` : base}</section>`;
    }).join('') || '<p class="sp-detail-note">This character has no leadership or Omicron upgrades.</p>'}<p class="sp-detail-note">${plan.size}v${plan.size} · ${escape(MODES[plan.mode])}. Zetas are shown at maximum tier. Mode eligibility checks the battle mode and leader slot. Other squad, enemy, mission and battle conditions are described in the kit above and are not simulated.</p><div class="sp-dialog-actions"><button type="button" class="sp-btn" data-close>Done</button></div>`;
  enhanceSelects();
  if (open) $('unitDetails').showModal(); else $('unitDetails').scrollTop = currentScroll;
}
function downloadFile(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportJson() { downloadFile('swgoh-squad-plan.json', JSON.stringify(plan, null, 2), 'application/json'); announce('Plan file downloaded. It includes both formations and your planned upgrades.'); }
function bind() {
  $('rosterToggle').addEventListener('click', () => {
    const open = document.body.classList.toggle('sp-roster-open');
    $('rosterToggle').setAttribute('aria-expanded', String(open));
  });
  $('rosterLeader').addEventListener('click', e => { const b = e.target.closest('[data-detail]'); if (b) details(b.dataset.detail); });
  $('planTitle').addEventListener('change', e => mutate(() => { plan.title = e.target.value.trim() || 'My squad plan'; }));
  document.querySelectorAll('[data-size]').forEach(b => b.addEventListener('click', () => {
    if (plan.size === Number(b.dataset.size)) return;
    mutate(() => { changeSize(plan, Number(b.dataset.size)); selected = { squad: 0, slot: 0 }; }, 'Formation changed.');
  }));
  $('battleMode').addEventListener('change', e => mutate(() => changeMode(plan, e.target.value), e.target.value !== 'gac' && e.target.value !== 'other' ? 'This battle mode uses 5v5 squads.' : 'Battle mode updated.'));
  $('factionFilter').addEventListener('change', e => { faction = e.target.value; renderRoster(); });
  $('unitSearch').addEventListener('input', e => { search = e.target.value.trim().toLowerCase(); renderRoster(); });
  $('hideAssigned').addEventListener('change', e => { hideAssigned = e.target.checked; renderRoster(); });
  $('roleFilter').addEventListener('change', e => { role = e.target.value; renderRoster(); });
  $('unitRoster').addEventListener('click', e => { const b = e.target.closest('[data-unit]'); if (b) place(b.dataset.unit); });
  $('unitRoster').addEventListener('dragstart', e => { const b = e.target.closest('[data-unit]'); if (b) { e.dataTransfer.setData('text/plain', b.dataset.unit); e.dataTransfer.effectAllowed = 'move'; } });
  $('squadBoard').addEventListener('dragstart', e => { if (e.target.closest('.sp-slot')) e.preventDefault(); });
  $('squadBoard').addEventListener('dragover', e => { if (e.target.closest('[data-slot-container]')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
  $('squadBoard').addEventListener('drop', e => { const slot = e.target.closest('[data-slot-container]'); if (!slot) return; e.preventDefault(); const [si, i] = slot.dataset.slotContainer.split(':').map(Number); place(e.dataTransfer.getData('text/plain'), si, i); });
  $('squadBoard').addEventListener('change', e => { const b = e.target.closest('[data-name]'); if (b) mutate(() => { squads()[Number(b.dataset.name)].name = b.value.trim() || 'Squad'; }); });
  $('squadBoard').addEventListener('click', async e => {
    let b = e.target.closest('button');
    if (!b && !e.target.closest('input')) b = e.target.closest('.sp-squad-header')?.querySelector('[data-expand]');
    if (!b) return;
    if (b.dataset.slot) { const [si, i] = b.dataset.slot.split(':').map(Number); setTarget(si, i); }
    if (b.dataset.expand !== undefined) {
      const si = Number(b.dataset.expand);
      expandedSquad = expandedSquad === si ? null : si;
      if (expandedSquad !== null) selected = { squad: si, slot: 0 };
      renderBoard();
    }
    if (b.dataset.detail) details(b.dataset.detail);
    if (b.dataset.remove) { const [si, i] = b.dataset.remove.split(':').map(Number); mutate(() => { squads()[si].slots[i] = null; selected = { squad: si, slot: i }; }, 'Character removed.'); }
    if (b.dataset.delete !== undefined) {
      const i = Number(b.dataset.delete);
      if (await confirm('Delete ' + squads()[i].name + '?', 'Its characters will be available again. You can undo this change.', 'Delete squad')) mutate(() => { squads().splice(i, 1); selected = { squad: 0, slot: 0 }; }, 'Squad deleted.');
    }
  });
  $('addSquad').addEventListener('click', () => {
    if (squads().length >= MAX_SQUADS) return;
    mutate(() => { squads().push(blankSquad(plan.size, 'Squad ' + (squads().length + 1))); selected = { squad: squads().length - 1, slot: 0 }; expandedSquad = selected.squad; }, 'Squad added. Choose a leader.');
  });
  $('undoChange').addEventListener('click', () => { if (!history.length) return; plan = normalizePlan(JSON.parse(history.pop()), data.characters); selected = { squad: 0, slot: 0 }; persist(); render(); announce('Last change undone.'); });
  $('clearPlan').addEventListener('click', async () => { if (await confirm(`Clear your ${plan.size}v${plan.size} formation?`, 'This clears these squads. The other formation and your planned upgrades are kept. You can undo this change.')) mutate(() => { plan.banks[plan.size] = [blankSquad(plan.size, 'Squad 1')]; selected = { squad: 0, slot: 0 }; }, 'Formation cleared.'); });
  $('loadExample').addEventListener('click', async () => {
    if (assigned().size && !(await confirm('Load the Doctor Aphra example?', 'This replaces the current formation. You can undo to restore it.', 'Load example'))) return;
    mutate(() => {
      const ids = ['DOCTORAPHRA', 'BT1', 'TRIPLEZERO', 'IG90', 'B2SUPERBATTLEDROID'].filter(id => units.has(id)).slice(0, plan.size);
      plan.banks[plan.size] = [{ name: 'Doctor Aphra · example', slots: Array.from({ length: plan.size }, (_, i) => ids[i] || null) }];
      ids.forEach(id => { const u = units.get(id); plan.options[id] = { relic: 7, stars: 7, omicrons: u.abilities.filter(a => a.omicron).map(a => a.id) }; });
      selected = { squad: 0, slot: 0 }; faction = 'species_droid'; $('factionFilter').value = faction;
    }, 'Example loaded.');
  });
  $('detailsContent').addEventListener('click', e => { if (e.target.closest('[data-close]')) $('unitDetails').close(); });
  $('detailsContent').addEventListener('change', e => {
    const u = units.get(detailUnit); if (!u) return;
    const opts = { ...unitOptions(plan, u), omicrons: [...unitOptions(plan, u).omicrons] };
    if (e.target.id === 'detailRelic') opts.relic = Number(e.target.value);
    else if (e.target.id === 'detailStars') opts.stars = Number(e.target.value);
    else if (e.target.dataset.omicron) opts.omicrons = e.target.checked ? [...new Set([...opts.omicrons, e.target.dataset.omicron])] : opts.omicrons.filter(id => id !== e.target.dataset.omicron);
    else return;
    mutate(() => { plan.options[u.id] = opts; }); details(u.id, false);
  });
  $('unitDetails').addEventListener('close', () => { detailUnit = null; });
  $('screenshotToggle').addEventListener('click', () => {
    screenshot = !screenshot; renderCapture(); document.body.classList.toggle('sp-screenshot', screenshot);
    $('screenshotBoard').hidden = !screenshot; $('screenshotToggle').setAttribute('aria-pressed', String(screenshot)); $('screenshotToggle').textContent = screenshot ? 'Back to builder' : 'Screenshot view';
  });
  const savePng = async e => {
    const button = e.currentTarget; button.disabled = true; button.textContent = 'Preparing…';
    try { await document.fonts?.ready; await downloadPlanPng(plan, data); announce('Squad board saved as a PNG.'); }
    catch { announce('Image export failed. Use Screenshot view, or export a plan file to keep your work.'); }
    finally { button.disabled = false; button.textContent = 'Save PNG'; }
  };
  $('downloadPng').addEventListener('click', savePng);
  $('captureDownload').addEventListener('click', savePng);
  $('sharePlan').addEventListener('click', async () => {
    const url = new URL('/squads/', location.href); url.hash = 'plan=' + encodePlan(plan);
    if (url.href.length > 8000) { exportJson(); announce('This plan is too large for a reliable share link. Share the exported plan file instead.'); return; }
    try { await navigator.clipboard.writeText(url.href); announce('Share link copied. It includes both formations and your planned upgrades.'); }
    catch {
      detailUnit = null; $('detailsContent').innerHTML = `<div class="sp-detail-head"><h2 id="detailsTitle">Share your plan</h2><button class="sp-icon-btn" data-close aria-label="Close share link">×</button></div><p class="sp-detail-note">Copy this link to share both formations and planned upgrades.</p><textarea id="shareUrl" readonly rows="5" style="width:100%;padding:12px;background:#0a1521;color:#c4eaff;border:1px solid #436278"></textarea><div class="sp-dialog-actions"><button class="sp-btn" data-close>Done</button></div>`; $('shareUrl').value = url.href; $('unitDetails').showModal(); $('shareUrl').select();
    }
  });
  $('exportJson').addEventListener('click', exportJson);
  $('importJson').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      if (f.size > 100000) throw new Error('Plan files must be smaller than 100 KB.');
      const incoming = normalizePlan(JSON.parse(await f.text()), data.characters);
      if (await confirm('Import this squad plan?', 'This replaces both formations and planned upgrades on this device. You can undo this change.', 'Import plan')) mutate(() => { plan = incoming; selected = { squad: 0, slot: 0 }; }, 'Plan imported.');
    } catch (err) { announce('Could not import this file. ' + err.message); }
    finally { e.target.value = ''; }
  });
  window.addEventListener('beforeprint', renderCapture);
  window.addEventListener('hashchange', () => {
    const encoded = new URLSearchParams(location.hash.slice(1)).get('plan');
    if (!encoded) return;
    try {
      const incoming = decodePlan(encoded, data.characters);
      history.push(JSON.stringify(plan)); if (history.length > 30) history.shift();
      plan = incoming; selected = { squad: 0, slot: 0 }; render();
      $('saveState').textContent = 'Shared plan · saved when edited';
      announce('Shared plan loaded. Edit it to save a copy on this device.');
    } catch { announce('That share link is invalid. Your current plan has been kept.'); }
  });
}
// Keep native selects as the state/event interface; render their options with atlas controls.
function enhanceSelects() {
  document.querySelectorAll('.sp-wrap select,.sp-dialog select').forEach(select => {
    if (select.parentElement.classList.contains('sp-custom-select')) {
      select.parentElement.querySelector('button').textContent = select.selectedOptions[0]?.textContent || '';
      return;
    }
    const wrapper = document.createElement('div'); wrapper.className = 'sp-custom-select';
    select.before(wrapper); wrapper.append(select); select.tabIndex = -1; select.setAttribute('aria-hidden','true');
    const trigger = document.createElement('button'); trigger.type = 'button';
    trigger.textContent = select.selectedOptions[0]?.textContent || '';
    trigger.setAttribute('aria-label', (select.closest('label')?.querySelector('.sp-label,.sr-only')?.textContent || select.id) + ': ' + trigger.textContent);
    trigger.setAttribute('aria-haspopup','listbox'); trigger.setAttribute('aria-expanded','false');
    wrapper.append(trigger);
    let closing = false;
    const close = () => { if(closing) return; closing=true; wrapper.querySelector('.sp-select-menu')?.remove(); trigger.setAttribute('aria-expanded','false'); closing=false; };
    select.addEventListener('change', () => { trigger.textContent = select.selectedOptions[0]?.textContent || ''; trigger.setAttribute('aria-label', (select.closest('label')?.querySelector('.sp-label,.sr-only')?.textContent || select.id) + ': ' + trigger.textContent); });
    trigger.addEventListener('click', () => {
      if (wrapper.querySelector('.sp-select-menu')) { close(); return; }
      const menu = document.createElement('div'); menu.className = 'sp-select-menu'; menu.setAttribute('role','listbox');
      menu.setAttribute('aria-label',trigger.getAttribute('aria-label')); trigger.setAttribute('aria-expanded','true');
      [...select.options].forEach(option => {
        const item = document.createElement('button'); item.type='button'; item.textContent=option.textContent;
        item.setAttribute('role','option'); item.setAttribute('aria-selected',String(option.selected));
        item.addEventListener('click', () => { select.value=option.value; close(); select.dispatchEvent(new Event('change',{bubbles:true})); trigger.focus(); });
        menu.append(item);
      });
      menu.addEventListener('keydown', event => {
        const items=[...menu.children], index=items.indexOf(document.activeElement);
        if (event.key==='Escape') { event.preventDefault(); close(); trigger.focus(); }
        else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
          event.preventDefault(); items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
        } else if(event.key.length===1 && !event.ctrlKey && !event.metaKey) {
          const match=items.find((item,i)=>i>index && item.textContent.toLowerCase().startsWith(event.key.toLowerCase())) || items.find(item=>item.textContent.toLowerCase().startsWith(event.key.toLowerCase()));
          match?.focus();
        }
      });
      wrapper.append(menu); (menu.querySelector('[aria-selected=true]') || menu.firstElementChild)?.focus();
    });
    wrapper.addEventListener('focusout', event => { if(!wrapper.contains(event.relatedTarget)) close(); });
  });
}
async function init() {
  try {
    const response = await fetch('/assets/data/squad-planner.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    data = await response.json();
    if (data.schema !== 1 || !Array.isArray(data.characters) || !data.characters.length || !data.atlas) throw new Error('Invalid character snapshot');
    const zetaResponse = await fetch('/assets/data/squad-zetas.json');
    if (!zetaResponse.ok) throw new Error('Zeta snapshot unavailable');
    const zetaCounts = await zetaResponse.json();
    data.characters.forEach(u => { u.zetaCount = u.zetaCount ?? zetaCounts[u.id] ?? 0; });
    const powerResponse = await fetch('/assets/data/squad-power.json');
    if (!powerResponse.ok) throw new Error('Power snapshot unavailable');
    data.power = await powerResponse.json();
    units = new Map(data.characters.map(u => [u.id, u]));
    let message = '';
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) plan = normalizePlan(JSON.parse(saved), data.characters); }
    catch { message = 'Saved plan could not be loaded. Export or import a plan file to keep your work.'; storageFailed = true; }
    const shared = new URLSearchParams(location.hash.slice(1)).get('plan');
    if (shared) {
      try { plan = decodePlan(shared, data.characters); message = 'Shared plan loaded. Edit it to save a copy on this device.'; }
      catch { message = 'That share link is invalid. Your saved plan has been kept.'; }
    }
    $('factionFilter').innerHTML = '<option value="">All characters</option>' + data.factions.map(f => `<option value="${escape(f.id)}">${escape(f.name)}</option>`).join('');
    $('dataStamp').textContent = 'Updated ' + new Date(data.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
    $('saveState').textContent = storageFailed ? 'Storage unavailable · export to keep your plan' : shared ? 'Shared plan · saved when edited' : 'Saved on this device';
    $('workspace').setAttribute('aria-busy', 'false'); bind(); render(); if (message) announce(message);
  } catch {
    $('workspace').setAttribute('aria-busy', 'false');
    $('unitRoster').innerHTML = '<p class="sp-empty">Character data could not load. Check your connection, then reload.</p>';
    $('squadBoard').innerHTML = '<p class="sp-empty">The planner needs its character snapshot to open your squads. Your saved plan is still on this device.</p>';
    ['addSquad','loadExample','clearPlan','sharePlan','downloadPng','screenshotToggle','exportJson'].forEach(id => { $(id).disabled = true; });
    announce('Unable to load character data. Reload to try again.');
  }
}
init();
