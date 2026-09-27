/* CONQUEST PLANNER — pick the feats you'll do, see which crate that earns.
   Page script for conquest.html. Depends on config.js + time.js globals
   (conquest detection, day counts, countdown phrasing). Data comes from
   assets/data/conquest-planner.json (feat text synced from gamedata via
   `npm run conquest:pull`). Pure math is global so tests can load this
   file without a DOM. */

const CQ_PLAN_KEY = 'swgoh-cq-plan';
const CQ_DIFFICULTIES = ['hard', 'normal', 'easy'];

/* Sum keycards for picked feats + battle stars. diff is one difficulty
   entry {groups}; maxStars caps the star input. Returns
   { featTotal, maxFeatTotal, total, maxTotal }. */
function planTotals(diff, pickedIds, stars, maxStars){
  const picked = new Set(Array.isArray(pickedIds) ? pickedIds : []);
  let featTotal = 0, maxFeatTotal = 0;
  for(const g of (diff && diff.groups) || []){
    for(const f of (g && g.feats) || []){
      const v = Number(f && f.keycards) || 0;
      maxFeatTotal += v;
      if(f && picked.has(f.id)) featTotal += v;
    }
  }
  const cap = Math.max(0, Number(maxStars) || 0);
  const starCount = Math.min(cap, Math.max(0, Number(stars) || 0));
  return {
    featTotal, maxFeatTotal,
    total: starCount + featTotal,
    maxTotal: cap + maxFeatTotal,
  };
}

/* Crate earned at total + next crate up (ladder sorted ascending by at).
   Returns { earned, next, remaining } — remaining is keycards to next
   (0 when the top crate is earned). */
function crateFor(crates, total){
  const ladder = ((Array.isArray(crates) ? crates : [])
    .filter(c => c && Number.isFinite(Number(c.at)))
    .map(c => ({ name: String(c.name), at: Number(c.at), ...(c.shards ? { shards: c.shards } : {}) })))
    .sort((a, b) => a.at - b.at);
  let earned = null, next = null;
  for(const c of ladder){
    if(total >= c.at) earned = c;
    else { next = c; break; }
  }
  return { earned, next, remaining: next ? Math.max(0, next.at - total) : 0 };
}

/* Keycards this conquest can afford to skip and still hit the top crate. */
function skippableToTop(diff, crates, maxStars){
  const ladder = (Array.isArray(crates) ? crates : []).map(c => Number(c && c.at)).filter(Number.isFinite);
  if(!ladder.length) return 0;
  const top = Math.max(...ladder);
  const max = planTotals(diff, null, maxStars, maxStars).maxTotal;
  return Math.max(0, max - top);
}

/* Description for the active difficulty (falls back across variants —
   some feats share one text for every difficulty). */
function featDesc(feat, difficulty){
  const d = (feat && feat.desc) || {};
  if(typeof d === 'string') return d;
  return d[difficulty] || d.hard || d.normal || d.easy || '';
}

/* Chain gate named in a feat description ("Complete the X feat...") —
   rendered as an explicit requirement chip. Pure and unit-tested. */
function chainRequires(desc){
  const m = /Complete the "([^"]+)" feat/i.exec(desc || '');
  return m ? m[1] : null;
}

/* Pick the planner entry for nowMs: the one whose window holds today,
   else the nearest upcoming, else the most recent past. Windows are
   changeover-anchored (conquests open/close at the daily changeover).
   Returns { entry, state: 'active'|'upcoming'|'past' }. */
function findConquestEntry(data, nowMs){
  const list = (data && Array.isArray(data.conquests) ? data.conquests : [])
    .filter(e => e && typeof e.starts === 'string' && typeof e.ends === 'string');
  if(!list.length || !Number.isFinite(nowMs)) return { entry: null, state: 'past' };
  const hourMs = (typeof stdHour === 'function' ? stdHour() : 18) * 3600000;
  const win = e => {
    const s = Date.parse(e.starts + 'T00:00:00Z');
    const t = Date.parse(e.ends + 'T00:00:00Z');
    if(!Number.isFinite(s) || !Number.isFinite(t)) return null;
    return { openMs: s + hourMs, closeMs: t + hourMs };
  };
  let upcoming = null, past = null;
  for(const e of list){
    const w = win(e);
    if(!w) continue;
    if(nowMs >= w.openMs && nowMs < w.closeMs) return { entry: e, state: 'active', ...w };
    if(nowMs < w.openMs && (!upcoming || w.openMs < upcoming.w.openMs)) upcoming = { e, w };
    if(nowMs >= w.closeMs && (!past || w.closeMs > past.w.closeMs)) past = { e, w };
  }
  if(upcoming) return { entry: upcoming.e, state: 'upcoming', ...upcoming.w };
  if(past) return { entry: past.e, state: 'past', ...past.w };
  return { entry: null, state: 'past' };
}

function loadPlans(){
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CQ_PLAN_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : null;
    if(parsed && typeof parsed === 'object' && parsed.plans) return parsed.plans;
  } catch(e){}
  return {};
}

function savePlans(plans){
  try {
    if(typeof localStorage !== 'undefined') localStorage.setItem(CQ_PLAN_KEY, JSON.stringify({ version: 1, plans }));
  } catch(e){}
}

function esc(s){
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function featArt(feat){
  const a = feat && typeof feat.art === 'string' && feat.art ? feat.art : 'events/conquest.png';
  return 'assets/img/' + a.replace(/^\/*/, '');
}

/* Genuine conquest chest art (chest_gc_01..07, backgrounds keyed out),
   mapped Carbon→01 … Red→07 in bundle order. Falls back to a CSS dot. */
const CRATE_ART = {
  Carbon: 'live/crate-carbon.png',
  Bronze: 'live/crate-bronze.png',
  Black: 'live/crate-black.png',
  Steel: 'live/crate-steel.png',
  Silver: 'live/crate-silver.png',
  Gold: 'live/crate-gold.png',
  Red: 'live/crate-red.png',
};
function crateArt(name){
  const short = String(name || '').replace(/\s*Crate\s*$/, '');
  return CRATE_ART[short] ? 'assets/img/' + CRATE_ART[short] : null;
}

const KIND_TITLES = { sector: 'Sector feats', miniboss: 'Mini Boss', boss: 'Boss' };
function featKind(feat){
  const k = feat && feat.kind;
  return KIND_TITLES[k] ? k : 'sector';
}

/* ---- page wiring (conquest.html only) ---- */
async function initConquestPage(){
  const app = document.getElementById('cqApp');
  if(!app) return;
  let data = null;
  try {
    const res = await fetch('assets/data/conquest-planner.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch(e){
    app.innerHTML = '<p class="empty-note">Planner data unavailable offline — reconnect and reload.</p>';
    return;
  }
  const nowMs = Date.now();
  const sel = findConquestEntry(data, nowMs);
  if(!sel.entry){
    app.innerHTML = '<p class="empty-note">No conquest scheduled yet.</p>';
    return;
  }
  renderPlanner(app, sel, nowMs);
}

function renderPlanner(app, sel, nowMs){
  const entry = sel.entry;
  const diffs = entry.difficulties || {};
  const plans = loadPlans();
  const saved = plans[entry.id] || {};
  let difficulty = CQ_DIFFICULTIES.includes(saved.difficulty) ? saved.difficulty
    : CQ_DIFFICULTIES.includes(entry.difficulty) ? entry.difficulty : 'hard';
  if(!diffs[difficulty]) difficulty = Object.keys(diffs)[0] || 'hard';
  const diff = diffs[difficulty] || { crates: [], groups: [] };
  let stars = Number.isFinite(Number(saved.stars)) ? Number(saved.stars) : (entry.maxStars || 0);
  let picked = new Set(Array.isArray(saved.feats) ? saved.feats : []);
  let target = typeof saved.target === 'string' ? saved.target : null;
  const groupNames = (diff.groups || []).map(g => g.name);
  let tab = groupNames.includes(saved.tab) ? saved.tab : groupNames[0];

  const persist = () => savePlans({ ...loadPlans(), [entry.id]: { feats: [...picked], stars, target, difficulty, tab } });

  // Status line from the site engine when this is the live conquest.
  let statusLine = '';
  try {
    if(sel.state === 'active' && typeof getGameStatus === 'function' && typeof conquestInfoForDay === 'function'){
      const st = getGameStatus(nowMs);
      const cq = conquestInfoForDay(st.episode, st.dayInEp);
      if(cq) statusLine = `Day ${cq.day} of ${cq.total} · closes ${fmtDayMonthUTC(sel.closeMs)}`;
    } else if(sel.state === 'upcoming' && typeof formatGacUntil === 'function'){
      statusLine = `Opens ${formatGacUntil(nowMs, sel.openMs)} · ${fmtDayMonthUTC(sel.openMs)}`;
    } else if(sel.state === 'past'){
      statusLine = `Ended ${fmtDayMonthUTC(sel.closeMs)}`;
    }
  } catch(e){}

  const crates = Array.isArray(diff.crates) ? diff.crates : [];
  if(!target || !crates.some(c => c.name === target)) target = crates.length ? crates[crates.length - 1].name : null;

  const totals = () => planTotals(diff, [...picked], stars, entry.maxStars);

  function summary(){
    const t = totals();
    const { earned, next, remaining } = crateFor(crates, t.total);
    const targetAt = (crates.find(c => c.name === target) || {}).at;
    const toTarget = targetAt != null ? Math.max(0, targetAt - t.total) : null;
    const topAt = crates.length ? Math.max(...crates.map(c => Number(c.at) || 0)) : 0;
    const pct = topAt > 0 ? Math.min(100, (t.total / topAt) * 100) : 0;
    return { t, earned, next, remaining, toTarget, pct, topAt };
  }

  function paint(){
    const s = summary();
    const set = (key, text) => { const el = app.querySelector(`[data-cq="${key}"]`); if(el) el.textContent = text; };
    set('total', `${s.t.total} keycards`);
    set('earned', s.earned ? s.earned.name : 'No crate yet');
    set('next', s.next ? `${s.remaining} more to ${s.next.name}` : 'Top crate earned');
    set('target', target == null ? '—' : s.toTarget === 0 ? `${target} secured` : `${s.toTarget} more to ${target}`);
    set('stars', `${stars}`);
    // Spare keycards beyond the currently earned crate.
    const spare = s.earned ? s.t.total - s.earned.at : 0;
    set('spare', s.earned
      ? (spare > 0 ? `+${spare} spare beyond ${s.earned.name}` : `${s.earned.name} exactly — every keycard counts`)
      : '');
    const shEl = app.querySelector('[data-cq="shards"]');
    if(shEl){
      if(s.earned && s.earned.shards){
        const un = entry.shardUnits || {};
        const row = (u, n) => u ? `${shardImg(u)}<b>${n ?? '—'}</b> ${esc(u.name)}` : '';
        shEl.innerHTML = `${row(un.primary, s.earned.shards.primary)}<span class="cq-plus">+</span>${row(un.secondary, s.earned.shards.secondary)}<span> shards</span>`;
      } else shEl.innerHTML = '';
    }
    const fillEl = app.querySelector('[data-cq="fill"]');
    if(fillEl) fillEl.style.width = s.pct + '%';
    const youEl = app.querySelector('[data-cq="you"]');
    if(youEl) youEl.style.left = s.pct + '%';
    app.querySelectorAll('.cq-node').forEach(node => {
      const at = Number(node.getAttribute('data-at')) || 0;
      node.classList.toggle('earned', at <= s.t.total);
      node.classList.toggle('is-target', node.getAttribute('data-crate') === target);
    });
    const skipEl = app.querySelector('[data-cq="skip"]');
    if(skipEl){
      const skip = skippableToTop(diff, crates, entry.maxStars);
      skipEl.textContent = skip > 0 ? `You can skip ${skip} keycards and still hit ${(crates[crates.length - 1] || {}).name || 'the top crate'}` : '';
    }
  }

  const diffNames = CQ_DIFFICULTIES.filter(d => diffs[d]);
  const diffPills = diffNames.map(d =>
    `<button type="button" class="sf-pill${d === difficulty ? ' active' : ''}" data-diff="${d}" aria-pressed="${d === difficulty}">${d.charAt(0).toUpperCase() + d.slice(1)}</button>`
  ).join('');
  const diffRow = diffNames.length > 1
    ? `<div class="sc-footer"><span class="cq-diff-label">Difficulty</span><span class="cq-diffs">${diffPills}</span></div>`
    : '';

  const groupTotal = g => (g.feats || []).reduce((n, f) => n + (Number(f.keycards) || 0), 0);
  const tabRow = (diff.groups || []).map(g =>
    `<button type="button" class="sf-pill${g.name === tab ? ' active' : ''}" data-tab="${esc(g.name)}" aria-pressed="${g.name === tab}">${esc(g.name)} · ${groupTotal(g)}</button>`
  ).join('');
  const activeGroup = (diff.groups || []).find(g => g.name === tab) || diff.groups[0] || { name: '', feats: [] };
  const featRow = f => {
    const on = picked.has(f.id);
    const v = Number(f.keycards) || 0;
    const desc = featDesc(f, difficulty);
    const gate = ('requires' in f && f.requires !== undefined) ? f.requires : chainRequires(desc);
    const reward = f.reward ? `<span class="cq-reward">${esc(f.reward)}</span>` : '';
    return `<label class="cq-feat${on ? ' on' : ''}">`
      + `<input type="checkbox" data-feat="${esc(f.id)}"${on ? ' checked' : ''}>`
      + `<img src="${esc(featArt(f))}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
      + `<span class="cq-feat-text"><span class="cq-feat-name">${esc(f.title)}`
      + `${reward}${gate ? `<span class="cq-chain">Needs ${esc(gate)}</span>` : ''}</span>`
      + `<span class="cq-feat-desc">${esc(desc)}</span></span>`
      + `<span class="cq-feat-val">${v > 0 ? `+${v}` : '○'}</span></label>`;
  };
  // Sector tabs split like the feat sheet: Sector feats, then Mini
  // Boss, then Boss. Single-kind groups render flat.
  const kindsPresent = ['sector', 'miniboss', 'boss'].filter(k => (activeGroup.feats || []).some(f => featKind(f) === k));
  const activeFeats = (kindsPresent.length > 1
    ? kindsPresent.map(k =>
      `<div class="cq-subhead"><span>${KIND_TITLES[k]}</span><span class="cq-group-total">${
        (activeGroup.feats || []).filter(f => featKind(f) === k).reduce((n, f) => n + (Number(f.keycards) || 0), 0)
      } keycards</span></div>`
      + (activeGroup.feats || []).filter(f => featKind(f) === k).map(featRow).join('')
      ).join('')
    : (activeGroup.feats || []).map(featRow).join(''));

  const s = summary();
  const partial = entry.status === 'preliminary';
  const incomplete = s.topAt > 0 && s.t.maxTotal < s.topAt;
  // Crate ladder merged into the projection: nodes sit on the progress
  // line at their threshold; tapping one targets that crate.
  const shortName = n => String(n || '').replace(/\s*Crate\s*$/, '');
  const units = entry.shardUnits || {};
  const shardImg = u => (u && u.art)
    ? `<img class="cq-shard" src="assets/img/${esc(u.art)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : '';
  const trackNodes = crates.map(c => {
    const at = Number(c.at) || 0;
    const pct = s.topAt > 0 ? Math.min(97, Math.max(3, (at / s.topAt) * 100)) : 0;
    const art = crateArt(c.name);
    const icon = art
      ? `<img class="cq-crate" src="${art}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
      : `<span class="cq-dot"></span>`;
    const tip = (c.shards && (units.primary || units.secondary))
      ? `<span class="cq-tip" role="tooltip"><span class="cq-tip-title">${esc(c.name)} · ${at}</span>`
        + (units.primary ? `<span class="cq-tip-row">${shardImg(units.primary)}<b>${c.shards.primary ?? '—'}</b> ${esc(units.primary.name)}</span>` : '')
        + (units.secondary ? `<span class="cq-tip-row">${shardImg(units.secondary)}<b>${c.shards.secondary ?? '—'}</b> ${esc(units.secondary.name)}</span>` : '')
        + `<span class="cq-tip-note">Highest crate only</span></span>`
      : '';
    return `<button type="button" class="cq-node" style="left:${pct}%" data-crate="${esc(c.name)}" data-at="${at}"`
      + ` aria-label="Target ${esc(c.name)}, ${at} keycards" title="${esc(c.name)} · ${at} — tap to target">`
      + `${icon}${tip}<span class="cq-nm">${esc(shortName(c.name))}</span>`
      + `<span class="cq-at">${at}</span></button>`;
  }).join('');

  const unitImg = entry.unitArt
    ? `<div class="cq-hero-img"><img src="assets/img/${esc(entry.unitArt)}" alt="${esc(entry.unit || 'Conquest unit')}" loading="eager" decoding="async" onerror="this.remove()"></div>` : '';

  app.innerHTML = `
    ${partial ? `<div class="explorer-note" role="note"><span class="en-dot" aria-hidden="true">!</span>`
      + `<p>Preliminary feat list: text synced from gamedata, but sectors and keycard values confirm against the feat post at conquest start.</p></div>` : ''}
    <div class="status-card purple-card cq-hero">
      <div class="sc-header"><span class="sc-title">${esc(entry.title)}</span>`
      + `<span class="sc-badge ${sel.state === 'active' ? 'purple' : 'off'}">${sel.state === 'active' ? 'ACTIVE' : sel.state.toUpperCase()}</span></div>
      <div class="uw-body" style="--accent:var(--purple);--accent-dim:var(--purple-dim);--accent-border:var(--purple-border)">
        ${unitImg}
        <div class="uw-text">
          <div class="sc-main"><div class="sc-val">${esc(statusLine || entry.unit || '')}</div>
          <div class="uw-date">${entry.unit && entry.unit !== 'TBD' ? 'Reward unit: ' + esc(entry.unit) : ''}${entry.unit && entry.unit !== 'TBD' && entry.volume ? ' · ' : ''}${entry.volume ? 'Volume ' + esc(entry.volume) : ''}</div>
          <div class="sc-sub">Tick the feats you'll attempt — totals update against the crate ladder.</div></div>
          ${diffRow}
        </div>
      </div>
    </div>
    <div class="status-card" style="border-color:var(--purple-border)">
      <div class="sc-header"><span class="sc-title">Crate projection</span><span class="sc-badge purple" data-cq="earned"></span></div>
      <div class="sc-main"><div class="sc-val" data-cq="total"></div>
      <div class="sc-sub" data-cq="next"></div>
      <div class="sc-sub" data-cq="target"></div>
      <div class="sc-sub" data-cq="spare"></div>
      <div class="sc-sub cq-shardline" data-cq="shards"></div></div>
      <div class="cq-track" role="group" aria-label="Crate ladder — tap a crate to target it">
        <div class="cq-track-rail">
          <div class="cq-track-fill" data-cq="fill"></div>
          <div class="cq-you" data-cq="you" title="Your keycards"></div>
          ${trackNodes}
        </div>
      </div>
      <p class="cq-hint">Tap a crate to target it · you earn the highest crate only · hover a crate for its shards</p>
      <div class="cq-stars"><span>Battle stars</span>
        <button type="button" data-stars="-3" aria-label="Fewer stars">−</button>
        <strong data-cq="stars"></strong>
        <button type="button" data-stars="3" aria-label="More stars">+</button>
        <button type="button" data-stars="max">3★ all</button>
        <button type="button" data-stars="0">Clear</button></div>
      <p class="cq-skip" data-cq="skip"></p>
      ${incomplete ? '<p class="cq-skip">Feat list still incomplete — totals will rise as remaining feats land.</p>' : ''}
    </div>
    <div class="sched-filters cq-tabs" role="tablist" aria-label="Feat groups">${tabRow}</div>
    <div class="cq-tabhead"><span class="cq-group-total">${groupTotal(activeGroup)} keycards in ${esc(activeGroup.name)}</span>
    <button type="button" class="cq-toggle" data-toggle-all="1">Toggle all</button></div>
    <div class="cq-feats" role="tabpanel">${activeFeats}</div>`;

  app.querySelectorAll('[data-diff]').forEach(btn => {
    btn.addEventListener('click', () => {
      const plansNow = loadPlans();
      savePlans({ ...plansNow, [entry.id]: { ...(plansNow[entry.id] || {}), difficulty: btn.getAttribute('data-diff') } });
      renderPlanner(app, sel, Date.now());
    });
  });
  app.querySelectorAll('[data-stars]').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = btn.getAttribute('data-stars');
      const cap = entry.maxStars || 0;
      if(op === 'max') stars = cap;
      else if(op === '0') stars = 0;
      else stars = Math.min(cap, Math.max(0, stars + (Number(op) || 0)));
      persist(); paint();
    });
  });
  app.querySelectorAll('.cq-node').forEach(node => {
    node.addEventListener('click', () => {
      target = node.getAttribute('data-crate');
      persist(); paint();
    });
  });
  app.querySelectorAll('[data-feat]').forEach(box => {
    box.addEventListener('change', () => {
      const id = box.getAttribute('data-feat');
      if(box.checked) picked.add(id); else picked.delete(id);
      box.closest('.cq-feat').classList.toggle('on', box.checked);
      persist(); paint();
    });
  });
  app.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      tab = btn.getAttribute('data-tab');
      persist();
      renderPlanner(app, sel, Date.now());
    });
  });
  const toggleAllBtn = app.querySelector('[data-toggle-all]');
  if(toggleAllBtn) toggleAllBtn.addEventListener('click', () => {
    const ids = (activeGroup.feats || []).map(f => f.id);
    const allOn = ids.every(id => picked.has(id));
    ids.forEach(id => allOn ? picked.delete(id) : picked.add(id));
    persist();
    renderPlanner(app, sel, Date.now());
  });
  paint();
}

if(typeof document !== 'undefined' && typeof document.getElementById === 'function' && document.getElementById('cqApp')){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initConquestPage);
  else initConquestPage();
}
