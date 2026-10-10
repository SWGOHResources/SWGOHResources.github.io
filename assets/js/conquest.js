/* CONQUEST PLANNER — pick the feats you'll do, see which crate that earns.
   Page script for conquest.html. Depends on config.js + time.js globals
   (conquest detection, day counts, countdown phrasing). Data comes from
   assets/data/conquest-planner.json (feat text synced from gamedata via
   `npm run conquest:pull`). Pure math is global so tests can load this
   file without a DOM. */

/* Cache token for images built at runtime (assets/js/asseturl.js). Keeps a
   replaced PNG from being served from an old cache entry. */
const withAssetV = (typeof assetUrl === 'function') ? assetUrl : (p => p);

const NOTE_CLOCK_SVG = '<svg class="cq-note-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="6.3"/><path d="M8 4.4V8l2.5 1.7"/></svg>';

const CQ_PLAN_KEY = 'swgoh-cq-plan';
// Kept outside renderPlanner: switching tabs rebuilds the panel, and the
// not-doing box should stay as the reader left it.
let cqSkipsOpen = false;
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

/* Feat art is the RELATED unit portrait, not the feat itself — the shared
   conquest-keycard.png is a currency placeholder, so those feats get the
   CSS disc instead of an <img>. */
function featArt(feat){
  const a = feat && typeof feat.art === 'string' ? feat.art.trim() : '';
  if(!a || a.includes('conquest-keycard')) return null;
  return withAssetV('assets/img/' + a.replace(/^\/*/, ''));
}

/* Genuine conquest chest art (chest_gc_01..07, backgrounds keyed out).
   The ladder is numbered by tier (Reward Crate Tier 1-7) but the art is
   still filed by the old colour set, matched to the tier in bundle
   order: tier 1 = the carbon chest … tier 7 = the red one. The colour
   keys stay so an older snapshot still finds its art. Falls back to a
   CSS dot. */
const CRATE_ART = {
  'tier 1': 'live/crate-carbon.png',
  'tier 2': 'live/crate-bronze.png',
  'tier 3': 'live/crate-black.png',
  'tier 4': 'live/crate-steel.png',
  'tier 5': 'live/crate-silver.png',
  'tier 6': 'live/crate-gold.png',
  'tier 7': 'live/crate-red.png',
  carbon: 'live/crate-carbon.png',
  bronze: 'live/crate-bronze.png',
  black: 'live/crate-black.png',
  steel: 'live/crate-steel.png',
  silver: 'live/crate-silver.png',
  gold: 'live/crate-gold.png',
  red: 'live/crate-red.png',
};
/* Lookup key for a crate name: "Reward Crate Tier 6" → "tier 6",
   legacy "Gold Crate" → "gold". */
function crateKey(name){
  return String(name || '')
    .replace(/^\s*reward\s*crate\s*/i, '')
    .replace(/\s*Crate\s*$/i, '')
    .toLowerCase();
}
function crateArt(name){
  return CRATE_ART[crateKey(name)] ? withAssetV('assets/img/' + CRATE_ART[crateKey(name)]) : null;
}
/* Compact label for the ladder chips and inline sentences — the tier is
   what the game shows on the reward track, so "Tier 6" beats
   "Reward Crate Tier 6" in a 366px panel. Full name stays in tooltips
   and accessible names. */
function shortName(name){
  const m = /^\s*reward crate tier\s*(\d+)\s*$/i.exec(String(name || ''));
  return m ? `Tier ${m[1]}` : String(name || '').replace(/\s*Crate\s*$/, '');
}

const KIND_TITLES = { sector: 'Sector feats', miniboss: 'Mini Boss', boss: 'Boss' };
function featKind(feat){
  const k = feat && feat.kind;
  return KIND_TITLES[k] ? k : 'sector';
}

/* UI sprites the page can't source from gamedata. The Conquest KEYCARD
   (the crate-ladder currency) is `icon_points_pathofconquest` — verified
   against live localization, where CONQUEST_POINTS_DETAIL_TITLE reads
   "Conquest Keycards" (the credits icon, `icon_currency_pathofconquest`,
   is a different currency). The battle STAR has no standalone texture in
   the extractor — it only exists as a sprite inside the game's UI atlases
   (`conquestui_atlas`, the battle/TB atlas), which swgoh-ae2 downloads as
   bundles but does not export per-sprite (verified: atlas names 500 on
   /Asset/single in every assetOS bucket, and no star-named standalone
   texture exists in the 11,400-asset manifest). The star below is a
   user-supplied export of that sprite (cross-checked against the white
   base sprite at battleui_view_rgba_atlas ~(1391,654,34x33), which the
   game tints gold at runtime); the SVG stand-in remains as the
   fallback. Drop PNGs in assets/img/live/ and name them in
   UI_SPRITES; the row/button render them only once set, so nothing wrong
   can ship in the meantime.
   (assets/img/live/conquest-keycard.png is the Conquest CREDITS icon, not
   a keycard — don't use it for crate progress.) */
const UI_SPRITES = { keycard: 'conquest-points.png', star: 'conquest-battle-star.png' };
/* Stand-in for the battle star until a real sprite lands in UI_SPRITES:
   a gold 5-point star with a dark outline, drawn to match the in-game
   battle star. Used via `||` so a real PNG takes over automatically. */
const STAR_SVG = '<svg class="cq-star-svg" viewBox="0 0 24 24" aria-hidden="true">'
  + '<defs><linearGradient id="cqStarGold" x1="0" y1="0" x2="0" y2="1">'
  + '<stop offset="0" stop-color="#ffd968"/><stop offset="0.55" stop-color="#f5b301"/>'
  + '<stop offset="1" stop-color="#d18f00"/></linearGradient></defs>'
  + '<polygon points="12,1 14.7,8.3 22.5,8.6 16.4,13.4 18.5,20.9 12,16.6 5.5,20.9 7.6,13.4 1.5,8.6 9.3,8.3"'
  + ' fill="url(#cqStarGold)" stroke="#6b4500" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const sprite = (name, cls, title) => UI_SPRITES[name]
  ? `<img class="${cls}" src="${withAssetV('assets/img/live/' + UI_SPRITES[name])}" alt="" title="${esc(title)}">`
  : '';
/* Feat rewards are usually a datadisk for the featured character; titles
   (and any future holo reward) are the exception and stay a text chip. */
function featRewardDisk(reward){
  return /title|holo/i.test(String(reward || '')) ? null : (reward || null);
}
/* Datadisk glyph — the repo has no datadisk art, so the feat row draws a
   hexagon disc in the accent colour. Kept aria-hidden: the wrapper names it. */
const DATA_DISK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">'
  + '<polygon points="12,2.4 20.6,7.2 20.6,16.8 12,21.6 3.4,16.8 3.4,7.2"/>'
  + '<circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.5"/></svg>';

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
  // Read the shared plan once. Re-reading it on every re-render would undo
  // any edit the player makes after the page loaded.
  const shared = decodePlanHash();
  renderPlanner(app, sel, nowMs, shared);
}

function renderPlanner(app, sel, nowMs, shared){
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

  // A shared link wins over what's stored on this device, but it isn't
  // written back — opening someone else's plan shouldn't overwrite your own.
  if(shared){
    if(CQ_DIFFICULTIES.includes(shared.d)) difficulty = shared.d;
    if(Number.isFinite(Number(shared.s))) stars = Number(shared.s);
    if(typeof shared.t === 'string' || shared.t === null) target = shared.t;
    if(Array.isArray(shared.f)) picked = new Set(shared.f.map(String));
    if(typeof shared.g === 'string' && groupNames.includes(shared.g)) tab = shared.g;
  }

  const persist = () => savePlans({ ...loadPlans(), [entry.id]: { feats: [...picked], stars, target, difficulty, tab } });

  // Status line from the site engine when this is the live conquest;
  // falls back to the window itself so the hero always says something.
  let statusLine = '';
  try {
    if(typeof fmtDayMonthUTC === 'function'){
      if(sel.state === 'active'){
        if(typeof getGameStatus === 'function' && typeof conquestInfoForDay === 'function'){
          const st = getGameStatus(nowMs);
          const cq = conquestInfoForDay(st.episode, st.dayInEp);
          if(cq) statusLine = `Day ${cq.day} of ${cq.total} · closes ${fmtDayMonthUTC(sel.closeMs)}`;
        }
        if(!statusLine && typeof formatGacUntil === 'function'){
          statusLine = `Closes ${formatGacUntil(nowMs, sel.closeMs)} · ${fmtDayMonthUTC(sel.closeMs)}`;
        }
        if(!statusLine) statusLine = `Live now · closes ${fmtDayMonthUTC(sel.closeMs)}`;
      } else if(sel.state === 'upcoming'){
        const until = typeof formatGacUntil === 'function' ? formatGacUntil(nowMs, sel.openMs) : '';
        statusLine = `Opens ${until ? `${until} · ` : ''}${fmtDayMonthUTC(sel.openMs)}`;
      } else {
        statusLine = `Ended ${fmtDayMonthUTC(sel.closeMs)}`;
      }
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
    return { t, earned, next, remaining, toTarget, topAt, pct };
  }

  function paint(){
    const s = summary();
    const set = (key, text) => { const el = app.querySelector(`[data-cq="${key}"]`); if(el) el.textContent = text; };
    set('total', `${s.t.total}`);
    set('max-total', `${s.t.maxTotal}`);
    set('earned', s.earned ? crateLabel(s.earned.name) : 'No crate yet');
    set('next', s.next ? `${s.remaining} more to ${crateLabel(s.next.name)}` : 'Top crate earned');
    set('target', target == null ? '' : s.toTarget === 0
      ? `${crateLabel(target)} secured`
      : `${s.toTarget} more to reach ${crateLabel(target)}`);
    set('stars', `${stars}`);
    // 1 star = 1 keycard, so the stars line says how much of the total
    // they carry — the cheapest keycards in the game.
    set('stars-from', stars > 0 ? `${stars} of your keycards come from stars` : '');
    // Spare keycards beyond the currently earned crate.
    const spare = s.earned ? s.t.total - s.earned.at : 0;
    set('spare', s.earned
      ? (spare > 0 ? `${spare} spare beyond ${crateLabel(s.earned.name)}` : `${crateLabel(s.earned.name)} exactly — every keycard counts`)
      : '');
    const fillEl = app.querySelector('[data-cq="fill"]');
    if(fillEl) fillEl.style.width = s.pct + '%';
    const youEl = app.querySelector('[data-cq="you"]');
    if(youEl) youEl.style.left = s.pct + '%';
    // Ladder ticks and crate chips share the earned/target states.
    app.querySelectorAll('[data-at]').forEach(node => {
      const at = Number(node.getAttribute('data-at')) || 0;
      const isTarget = node.getAttribute('data-crate') === target;
      node.classList.toggle('earned', at <= s.t.total);
      node.classList.toggle('is-target', isTarget);
      if(node.tagName === 'BUTTON') node.setAttribute('aria-pressed', isTarget ? 'true' : 'false');
    });
    const skip = skippableToTop(diff, crates, entry.maxStars);
    const topName = crateLabel((crates[crates.length - 1] || {}).name);
    set('skip', skip > 0
      ? `You can skip ${skip} keycards and still hit ${topName || 'the top crate'}`
      : '');
    // Per-group progress: bar, caption, tab counters, toggle-all label.
    const grp = activeGroup();
    const gp = groupProgress(grp);
    set('gp-text', `${gp.pick} of ${gp.tot} keycards in ${grp.name}`);
    const gpFill = app.querySelector('[data-cq="gp-fill"]');
    if(gpFill) gpFill.style.width = (gp.tot > 0 ? Math.min(100, (gp.pick / gp.tot) * 100) : 0) + '%';
    app.querySelectorAll('[data-tab]').forEach(btn => {
      const g = groupByName(btn.getAttribute('data-tab'));
      if(!g) return;
      const numEl = btn.querySelector('.cq-tab-num');
      if(!numEl) return;
      const p = groupProgress(g);
      numEl.textContent = `${p.on}/${p.n}`;
      numEl.setAttribute('data-state', p.all ? 'full' : p.maxed ? 'maxed' : p.on ? 'part' : 'none');
      numEl.setAttribute('title', tabCounterTitle(p, g));
    });
    const toggleAllBtn = app.querySelector('[data-toggle-all]');
    if(toggleAllBtn) toggleAllBtn.textContent = gp.all ? 'None' : 'All';
    paintSkips();
    syncHash(entry, picked, stars, target, difficulty);
  }

  /* The "not doing" list: EVERY feat left unticked in this difficulty,
     grouped by the tab it lives on. It's the answer to "which of these do I
     actually have to do?" — once the plan clears a target crate, this is
     the whole remainder you can safely ignore, and the cheapest things to
     drop first sit at the top of each group. Each row carries the same
     detail as a real feat row plus where it comes from ("Mini Boss" in the
     Sector 4 section). Read-only on purpose: it is there so you can see —
     and show someone else — exactly what your plan skips. */
  let renderedSkipIds = '';
  function paintSkips(){
    const wrap = app.querySelector('[data-cq="skips-wrap"]');
    const sumEl = app.querySelector('[data-cq="skips-summary"]');
    const listEl = app.querySelector('[data-cq="skips"]');
    if(!wrap || !sumEl || !listEl) return;
    let n = 0, lost = 0;
    const sections = (diff.groups || []).map(g => {
      const skipped = ((g && g.feats) || [])
        .filter(f => !picked.has(f.id))
        .sort((a, b) => (Number(b.keycards) || 0) - (Number(a.keycards) || 0));
      if(!skipped.length) return '';
      const gLost = skipped.reduce((n2, f) => n2 + (Number(f.keycards) || 0), 0);
      n += skipped.length; lost += gLost;
      // Only worth labelling when the group really is split into kinds.
      const kinds = ['sector', 'miniboss', 'boss'].filter(k => skipped.some(f => featKind(f) === k));
      const showKind = kinds.length > 1;
      return `<div class="cq-skip-group">`
        + `<div class="cq-skip-grouphead">`
        + `<span class="cq-skip-groupname">${esc(g.name)}</span>`
        + `<span class="cq-skip-groupcount">${skipped.length} feat${skipped.length === 1 ? '' : 's'} · ${gLost} keycards</span>`
        + `</div>`
        + skipped.map(f => {
          const kc = Number(f.keycards) || 0;
          const desc = featDesc(f, difficulty);
          const art = featArt(f);
          const icon = art
            ? `<span class="cq-fi"><img src="${withAssetV('assets/img/' + f.art)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>`
            : '';
          const kind = featKind(f);
          // "Sector" not "Sector feats" — the group header already says Sector 1.
          const kindChip = { sector: 'Sector', miniboss: 'Mini Boss', boss: 'Boss' }[kind];
          // Display only: this box is a read-only view of what the plan
          // leaves out, so people can compare plans — not a control.
          return `<div class="cq-skip" data-feat-id="${esc(f.id)}">`
            + icon
            + `<span class="cq-skip-text">`
            + `<span class="cq-skip-top"><span class="cq-skip-name">${esc(f.title)}</span>`
            + (showKind && kindChip ? `<span class="cq-skip-where">${esc(kindChip)}</span>` : '')
            + `</span>`
            + `<span class="cq-skip-desc">${esc(desc)}</span></span>`
            + `<span class="cq-skip-val${kc > 0 ? '' : ' is-free'}">${kc > 0 ? `+${kc}` : 'no keycards'}</span>`
            + `</div>`;
        }).join('')
        + `</div>`;
    }).join('');
    sumEl.textContent = n
      ? `${n} feat${n === 1 ? '' : 's'} · ${lost} keycards across ${(diff.groups || []).length} groups`
      : `Nothing left — every feat in ${difficulty} is ticked`;
    // Collapsed unless the reader opened it: this box holds every unpicked
    // feat in the difficulty, which is far too tall to show by default.
    listEl.hidden = !cqSkipsOpen || !n;
    // Rebuilding 49 rows (and re-laying their icons) on every star or crate
    // click is wasted work: the set only changes when a pick changes.
    const sig = `${n}|${lost}|${sections.length}`;
    if (sig === renderedSkipIds) return;
    renderedSkipIds = sig;
    listEl.innerHTML = sections;
  }

  const diffNames = CQ_DIFFICULTIES.filter(d => diffs[d]);
  const diffPills = diffNames.map(d =>
    `<button type="button" class="sf-pill${d === difficulty ? ' active' : ''}" data-diff="${d}" aria-pressed="${d === difficulty}">${d.charAt(0).toUpperCase() + d.slice(1)}</button>`
  ).join('');

  const groupTotal = g => (g.feats || []).reduce((n, f) => n + (Number(f.keycards) || 0), 0);
  const groupByName = name => (diff.groups || []).find(g => g && g.name === name) || null;
  /* Picked keycards / group total, plus whether the whole group is on —
     drives the group bar, the tab counters and the toggle-all label. */
  const groupProgress = g => {
    const feats = (g && g.feats) || [];
    const on = feats.filter(f => picked.has(f.id));
    // A feat worth no keycards is a bonus, not a requirement, so a group
    // counts as maxed once every keycard-bearing feat in it is ticked —
    // otherwise the tab counter would nag about feats nobody needs.
    const worth = feats.filter(f => (Number(f.keycards) || 0) > 0);
    const worthOn = worth.filter(f => picked.has(f.id));
    return {
      pick: on.reduce((n, f) => n + (Number(f.keycards) || 0), 0),
      tot: groupTotal(g || { feats: [] }),
      n: feats.length,
      on: on.length,
      all: feats.length > 0 && on.length === feats.length,
      maxed: worth.length > 0 && worthOn.length === worth.length,
      free: feats.length - worth.length,
      freeOn: feats.length - worth.length - (on.length - worthOn.length),
    };
  };
  // Crates read "Tier 6 (Gold)" / "Tier 7 (Red)": those are the names
  // players actually use, and the planner should speak their language.
  const crateLabel = name => {
    const c = (diff.crates || []).find(x => x && x.name === name);
    const base = shortName(name);
    return c && c.colloquial ? `${base} (${c.colloquial})` : base;
  };
  const tabCounterTitle = (p, g) => {
    if(p.all) return `Every feat ticked in ${g.name}`;
    if(p.maxed) return p.freeOn > 0
      ? `All keycard feats ticked in ${g.name} — ${p.freeOn} bonus feat${p.freeOn === 1 ? '' : 's'} left (worth no keycards)`
      : `All keycard feats ticked in ${g.name}`;
    const left = p.n - p.on;
    return `${p.on} of ${p.n} feats ticked in ${g.name} — ${left} left`;
  };

  const tabRow = (diff.groups || []).map(g => {
    const p = groupProgress(g);
    return `<button type="button" class="sf-pill${g.name === tab ? ' active' : ''}" data-tab="${esc(g.name)}" aria-pressed="${g.name === tab}">${esc(g.name)}`
      + `<span class="cq-tab-num" data-state="${p.all ? 'full' : p.maxed ? 'maxed' : p.on ? 'part' : 'none'}"`
      + ` title="${tabCounterTitle(p, g)}">${p.on}/${p.n}</span></button>`;
  }).join('');
  // A function, not a constant: switching tabs swaps the feat list in place
  // instead of re-rendering the whole planner (hero, ladder, stars and the
  // not-doing box all stay exactly as they are).
  const activeGroup = () => (diff.groups || []).find(g => g.name === tab) || diff.groups[0] || { name: '', feats: [] };
  const featRow = f => {
    const on = picked.has(f.id);
    const v = Number(f.keycards) || 0;
    const desc = featDesc(f, difficulty);
    const gate = ('requires' in f && f.requires !== undefined) ? f.requires : chainRequires(desc);
    // The game's own icon for the feat (unit portrait, faction/role badge or
    // status icon — see artAsset in the planner data). No art, no box: a
    // drawn placeholder would only clash with the real ones.
    const art = featArt(f);
    const icon = art
      ? `<span class="cq-fi"><img src="${esc(art)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>`
      : '';
    const disk = featRewardDisk(f.reward);
    const reward = f.reward
      ? (disk
        ? `<span class="cq-disk" role="img" tabindex="0" aria-label="${esc(disk)} datadisk">${DATA_DISK_SVG}`
          + `<span class="cq-tip" role="tooltip"><span class="cq-tip-title">${esc(disk)}</span>`
          + `<span class="cq-tip-note">Feature datadisk</span></span></span>`
        : `<span class="cq-reward">${esc(f.reward)}</span>`)
      : '';
    return `<label class="cq-feat${on ? ' on' : ''}">`
      + `<input type="checkbox" data-feat="${esc(f.id)}"${on ? ' checked' : ''}>`
      + icon
      + `<span class="cq-feat-text"><span class="cq-feat-name">${esc(f.title)}`
      + `${gate ? `<span class="cq-chain">Needs ${esc(gate)}</span>` : ''}</span>`
      + `<span class="cq-feat-desc">${esc(desc)}</span></span>`
      + `<span class="cq-feat-side">`
      // A feat worth no keycards gets no value chip at all: an empty circle
      // read as a broken icon rather than "nothing here".
      + (v > 0 ? `<span class="cq-feat-val">+${v}</span>` + sprite('keycard', 'cq-kc', 'Keycards') : '')
      + `${reward}</span></label>`;
  };
  // Sector tabs split like the feat sheet: Sector feats, then Mini
  // Boss, then Boss. Single-kind groups render flat. This must be computed
  // from the current tab on every call: the tab buttons swap the list
  // in place without rebuilding the planner.
  const kindsPresent = () => ['sector', 'miniboss', 'boss'].filter(k => (activeGroup().feats || []).some(f => featKind(f) === k));
  const kindFeats = k => (activeGroup().feats || []).filter(f => featKind(f) === k);
  const activeFeatsHtml = () => {
    const kinds = kindsPresent();
    return (kinds.length > 1
      ? kinds.map(k =>
        `<div class="cq-subhead"><span>${KIND_TITLES[k]}</span><span class="cq-group-total">${
          kindFeats(k).reduce((n, f) => n + (Number(f.keycards) || 0), 0)
        } keycards</span></div>`
        + kindFeats(k).map(featRow).join('')
        ).join('')
      : (activeGroup().feats || []).map(featRow).join(''));
  };

  /* The open tab's feat list, rebuilt on demand. */
  const renderFeats = () => {
    const el = app.querySelector('.cq-feats');
    if(el) el.innerHTML = activeFeatsHtml();
  };
  const markActiveTab = () => {
    app.querySelectorAll('[data-tab]').forEach(btn => {
      const on = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };

  const s = summary();
  const partial = entry.status === 'preliminary';
  const incomplete = s.topAt > 0 && s.t.maxTotal < s.topAt;
  // Crate ladder split in two: ticks mark the thresholds on the progress
  // rail, and the chips below are the tappable ladder (tap to target).
  const units = entry.shardUnits || {};
  const shardImg = u => (u && u.art)
    ? `<img class="cq-shard" src="${withAssetV('assets/img/' + u.art)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : '';
  const topCrate = crates[crates.length - 1] || {};
  const tickPct = at => s.topAt > 0 ? Math.min(100, Math.max(0, (at / s.topAt) * 100)) : 0;
  const crateTip = c => (c.shards && (units.primary || units.secondary))
    ? `<span class="cq-tip" role="tooltip"><span class="cq-tip-title">${esc(c.name)} · ${c.at}</span>`
      + (units.primary ? `<span class="cq-tip-row">${shardImg(units.primary)}<b>${c.shards.primary ?? '—'}</b> ${esc(units.primary.name)}</span>` : '')
      + (units.secondary ? `<span class="cq-tip-row">${shardImg(units.secondary)}<b>${c.shards.secondary ?? '—'}</b> ${esc(units.secondary.name)}</span>` : '')
      + `<span class="cq-tip-note">Highest crate only</span></span>`
    : '';
  const ticks = crates.map(c => {
    const at = Number(c.at) || 0;
    return `<span class="cq-tick" style="left:${tickPct(at)}%" data-crate="${esc(c.name)}" data-at="${at}" aria-hidden="true"></span>`;
  }).join('');
  const ladder = crates.map(c => {
    const at = Number(c.at) || 0;
    const art = crateArt(c.name);
    const icon = art
      ? `<img class="cq-crate" src="${art}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
      : `<span class="cq-dot"></span>`;
    return `<button type="button" class="cq-node cq-chip" data-crate="${esc(c.name)}" data-at="${at}" aria-pressed="false"`
      + ` aria-label="Target ${esc(c.name)}, ${at} keycards" title="${esc(c.name)} · ${at} — tap to target">`
      + `${icon}${crateTip(c)}<span class="cq-nm">${esc(crateLabel(c.name))}</span>`
      + `<span class="cq-at">${at}</span></button>`;
  }).join('');

  const unitImg = entry.unitArt
    ? `<div class="cq-hero-img"><img src="${withAssetV('assets/img/' + entry.unitArt)}" alt="${esc(entry.unit || 'Conquest unit')}" loading="eager" decoding="async" onerror="this.remove()"></div>` : '';
  const namedUnit = entry.unit && entry.unit !== 'TBD' ? entry.unit : 'TBD';
  const winStart = Date.parse(String(entry.starts || '') + 'T00:00:00Z');
  const winEnd = Date.parse(String(entry.ends || '') + 'T00:00:00Z');
  const window = Number.isFinite(winStart) && Number.isFinite(winEnd) && typeof fmtDayMonthUTC === 'function'
    ? `${fmtDayMonthUTC(winStart)} – ${fmtDayMonthUTC(winEnd)}` : '—';
  const featCount = (diff.groups || []).reduce((n, g) => n + (g.feats || []).length, 0);

  app.innerHTML = `
    <div class="cq-layout">
      <div class="cq-main">
      <section class="status-card purple-card cq-hero" aria-label="Conquest status">
        <div class="sc-header">
          <h3 class="sc-title cq-hero-title">${esc(entry.title)}</h3>
          <span class="sc-badge ${sel.state === 'active' ? 'purple' : 'off'}">${sel.state === 'active' ? 'ACTIVE' : sel.state.toUpperCase()}</span>
        </div>
        <div class="uw-body">
          ${unitImg}
          <div class="uw-text">
            <div class="cq-state">${sel.state === 'active' ? '<span class="cq-live" aria-hidden="true"></span>' : ''}<span>${esc(statusLine || (sel.state === 'active' ? 'Live now' : sel.state === 'upcoming' ? 'Not started yet' : 'Finished'))}</span></div>
            <p class="cq-lede">${featCount} feats to choose from — your plan is saved on this device.</p>
            <div class="cq-meta">
              <div><span>Window</span><strong>${esc(window)}</strong></div>
              <div><span>Reward unit</span><strong>${esc(namedUnit)}</strong></div>
              <div><span>Volume</span><strong>${entry.volume ? esc(entry.volume) : '—'}</strong></div>
            </div>
          </div>
        </div>
      </section>


      <section class="cq-work" aria-label="Feat selection">
        ${partial ? `<p class="cq-note" role="note">${NOTE_CLOCK_SVG}<span>This conquest <b>hasn't started yet</b> — be wary that some feats may change.</span></p>` : ''}
        <div class="sched-filters cq-tabs" role="group" aria-label="Feat groups">${tabRow}</div>
        <div class="cq-tabhead">
          <div class="cq-gp">
            <div class="cq-gp-bar"><div class="cq-gp-fill" data-cq="gp-fill"></div></div>
            <span class="cq-group-total" data-cq="gp-text"></span>
          </div>
          <div class="cq-tabhead-actions">
            <button type="button" class="cq-toggle" data-toggle-all="1" title="Tick or untick every feat in this group">All</button>
            <button type="button" class="cq-toggle" data-reset-plan="1" title="Clear every pick in every group, your stars and your target">Reset whole plan</button>
            <button type="button" class="cq-toggle" data-copy-link="1" title="Copy a link to your whole plan — every tab's picks, your stars and your target">Copy whole plan</button>
          </div>
        </div>
        <div class="cq-feats" role="group" aria-label="Feats">${activeFeatsHtml()}</div>
      </section>
      </div>

      <div class="cq-side">
      <aside class="status-card cq-panel" aria-label="Crate progress">
        <div class="sc-header"><span class="sc-title">Crate progress</span><span class="sc-badge purple" data-cq="earned"></span></div>
        ${diffNames.length > 1
          ? `<div class="cq-diff"><span class="cq-diff-label">Difficulty</span><span class="cq-diffs">${diffPills}</span></div>` : ''}
        <div class="cq-headline">
          <span class="cq-total-num" data-cq="total">0</span><span class="cq-total-unit">keycards</span>
          <span class="cq-total-of">of <b data-cq="max-total">0</b> available</span>
        </div>
        <p class="cq-next" data-cq="next"></p>
        <div class="cq-track">
          <div class="cq-track-rail">
            <div class="cq-track-fill" data-cq="fill"></div>
            <div class="cq-you" data-cq="you" title="Your keycards"></div>
            ${ticks}
          </div>
          <div class="cq-scale"><span>0</span><span>${esc(crateLabel(topCrate.name))} · ${topCrate.at || 0}</span></div>
        </div>
        <div class="cq-ladder" role="group" aria-label="Crate ladder — pick a crate to target it">${ladder}</div>
        <div class="cq-facts">
          <p class="cq-fact is-target" data-cq="target"></p>
          <p class="cq-fact" data-cq="spare"></p>
          <p class="cq-fact insight" data-cq="skip"></p>
        </div>
        ${incomplete ? '<p class="cq-flag">More feats are still being added to this conquest, so your totals will go up as they land.</p>' : ''}
        <div class="cq-stars">
          <div class="cq-stars-head"><span class="cq-label">Battle stars</span><span class="cq-stars-read"><b data-cq="stars">0</b> of ${entry.maxStars || 0}</span></div>
          <div class="cq-stars-ctl">
            <button type="button" class="cq-step-btn" data-stars="-1" aria-label="One star fewer">−</button>
            <button type="button" class="cq-step-btn" data-stars="1" aria-label="One star more">+</button>
            <button type="button" data-stars="max" title="Max out every battle">${sprite('star', 'cq-star', 'Battle star') || STAR_SVG}All 3</button>
            <button type="button" data-stars="0" title="No battle stars at all">None</button>
          </div>
          <p class="cq-stars-note">Every star is worth 1 keycard. <span data-cq="stars-from"></span></p>
        </div>
        <p class="cq-hint">Only your highest crate pays out — hover a crate to see what it pays.</p>
      </aside>

      <section class="cq-skips" data-cq="skips-wrap" aria-label="Feats you are not doing">
        <button type="button" class="cq-skips-head" data-skips-toggle="1" aria-expanded="${cqSkipsOpen}">
          <span class="cq-skips-caret" aria-hidden="true"></span>
          <span class="cq-skips-titles">
            <span class="cq-skips-title">Not doing</span>
            <span class="cq-skips-count" data-cq="skips-summary">—</span>
          </span>
        </button>
        <div class="cq-skip-list" data-cq="skips"${cqSkipsOpen ? '' : ' hidden'}></div>
      </section>
      </div>
    </div>`;

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
      const next = btn.getAttribute('data-tab');
      if(next === tab) return;
      tab = next;
      persist();
      markActiveTab();
      renderFeats();
      paint();
    });
  });
  const toggleAllBtn = app.querySelector('[data-toggle-all]');
  if(toggleAllBtn) toggleAllBtn.addEventListener('click', () => {
    const ids = (activeGroup().feats || []).map(f => f.id);
    const allOn = ids.length > 0 && ids.every(id => picked.has(id));
    ids.forEach(id => allOn ? picked.delete(id) : picked.add(id));
    persist();
    renderPlanner(app, sel, Date.now());
  });
  const resetBtn = app.querySelector('[data-reset-plan]');
  if(resetBtn) resetBtn.addEventListener('click', () => {
    // Stars and target back to zero; difficulty and open tab are kept so
    // the reset doesn't throw away the view the player was looking at.
    savePlans({ ...loadPlans(), [entry.id]: { feats: [], stars: 0, target: null, difficulty, tab } });
    renderPlanner(app, sel, Date.now());
  });
  const skipsToggle = app.querySelector('[data-skips-toggle]');
  if(skipsToggle) skipsToggle.addEventListener('click', () => {
    cqSkipsOpen = !cqSkipsOpen;
    const list = app.querySelector('[data-cq="skips"]');
    if(list) list.hidden = !cqSkipsOpen;
    skipsToggle.setAttribute('aria-expanded', cqSkipsOpen ? 'true' : 'false');
  });
  const copyBtn = app.querySelector('[data-copy-link]');
  if(copyBtn) copyBtn.addEventListener('click', () => {
    const url = location.href;
    const done = ok => {
      copyBtn.textContent = ok ? 'Whole plan copied' : 'Press Ctrl+C';
      copyBtn.classList.toggle('done', !!ok);
      setTimeout(() => { copyBtn.textContent = 'Copy whole plan'; copyBtn.classList.remove('done'); }, 1800);
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
    } else done(false);
  });
  syncHash(entry, picked, stars, target, difficulty, tab);
  paint();
}

/* The plan lives in the URL hash so a link always reproduces the view.
   Kept out of the stored plan on purpose: sharing shouldn't overwrite
   whatever this device had already picked. */
let hashQueued = false;
function syncHash(entry, picked, stars, target, difficulty, tab){
  if(typeof location === 'undefined' || !location.href) return;
  // replaceState is not free and there is no point doing two in a frame.
  if(hashQueued) return;
  hashQueued = true;
  const run = () => { hashQueued = false; writeHash(entry, picked, stars, target, difficulty, tab); };
  if(typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else run();
}

function writeHash(entry, picked, stars, target, difficulty, tab){
  const payload = { d: difficulty, s: stars, t: target, g: tab, f: [...picked].sort() };
  const next = '#p=' + b64urlEncode(JSON.stringify(payload));
  if(location.hash === next) return;
  try { history.replaceState(null, '', next); } catch(e) { /* file:// */ }
}

function b64urlEncode(str){
  if(typeof btoa === 'function'){
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return '';
}

function decodePlanHash(){
  if(typeof location === 'undefined' || !location.hash) return null;
  const m = location.hash.match(/[#&]p=([A-Za-z0-9\-_]+)/);
  if(!m) return null;
  try {
    const raw = typeof atob === 'function'
      ? decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))
      : '';
    if(!raw) return null;
    const p = JSON.parse(raw);
    return (p && typeof p === 'object') ? p : null;
  } catch(e) { return null; }
}

if(typeof document !== 'undefined' && typeof document.getElementById === 'function' && document.getElementById('cqApp')){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initConquestPage);
  else initConquestPage();
}
