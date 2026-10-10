/* CONQUEST PLANNER — pick the feats you'll do, see which crate that earns.
   Page script for conquest.html. Depends on config.js + time.js globals
   (conquest detection, day counts, countdown phrasing). Data comes from
   assets/data/conquest-planner.json (feat text synced from gamedata via
   `npm run conquest:pull`). Pure math is global so tests can load this
   file without a DOM. */

/* Cache token for images built at runtime (assets/js/asseturl.js). Keeps a
   replaced PNG from being served from an old cache entry. */
const withAssetV = (typeof assetUrl === 'function') ? assetUrl : (p => p);

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

// Named atlas sprites matched to effect.persistentIcon in current Comlink
// gamedata. Similar names such as icon_stun (a panel texture) and
// icon_evasion (Foresight) are not interchangeable with the status effects.
const FEAT_ICONS = {
  hot: 'icon_recover_health_over_time', evasionup: 'icon_buff_dodge_chance',
  bombs: 'icon_bomb', retribution: 'icon_buff_counter',
  'stagger-s1': 'icon_stagger', noattackers: 'icon_role_attacker', stun: 'icon_paralysis',
  defensedown: 'icon_buff_armor', dot300: 'icon_damage_over_time', knockemdead: 'icon_offbalance',
  defenseup: 'icon_buff_armor', expose: 'icon_expose', onthemove: 'icon_ontherun',
  nosupport: 'icon_role_support', bonusturns: 'icon_extraturn',
  potencydown: 'icon_buff_accuracy', evasiondown: 'icon_buff_dodge_chance', notanks: 'icon_role_tank',
  'empire-mini': 'icon_empire',
};
function featStatusTone(feat){
  if(['hot','evasionup','retribution','defenseup'].includes(feat?.id)) return 'buff';
  if(['bombs','stagger-s1','stun','defensedown','dot300','knockemdead','expose','onthemove','potencydown','evasiondown'].includes(feat?.id)) return 'debuff';
  return '';
}
function featArt(feat){
  if(feat?.id === 'learncontrol') return withAssetV('assets/img/atlases/standard_rgba_atlas/icon_conquest_consumable_tech.png');
  if(feat?.id === 'lightside-boss' || feat?.id === 'darkside-mini') return withAssetV('assets/img/atlases/standard_atlas/icon_alignment_'+(feat.id === 'lightside-boss' ? 'light' : 'dark')+'.png');
  const named = FEAT_ICONS[feat?.id];
  if(named) return withAssetV('assets/img/atlases/battleui_view_rgba_atlas/'+named+'.png');
  const art = typeof feat?.art === 'string' ? feat.art.trim() : '';
  if(art && !art.includes('conquest-keycard') && feat?.id !== 'isfinest' && feat?.id !== 'newrepublic') return withAssetV('assets/img/'+art.replace(/^\/*/,''));
  // Game achievement artwork gives general objectives an icon without
  // borrowing an unrelated faction emblem or unit portrait.
  return withAssetV('assets/img/atlases/standard_atlas/quest_icon_dailyactivities.png');
}
function featRewardDisk(reward){ return /title|holo|^DCS$|Deployable Cooling Systems/i.test(String(reward || '')) ? null : (reward || null); }
// The shard sprite is the background, with the portrait over it. Its tint
// follows the unit's alignment; it is not a badge on a portrait frame.
function shardArt(unit){
  return `<span class="cq-shard ${unit.alignment === 'dark' ? 'dark' : 'light'}" aria-hidden="true"><img class="cq-shard-background" src="${withAssetV('assets/img/atlases/standard_rgba_atlas/ShardIcon.png')}" alt=""><img class="cq-shard-unit" src="${withAssetV('assets/img/'+unit.art)}" alt=""></span>`;
}
// rewardTexture is the artifactDefinition.texture value from Comlink. The
// generic misc_atlas disk glyph is a WIP asset and must not be displayed.
function featReward(reward, texture){
  if(!reward) return null;
  const title = /title/i.test(reward);
  const consumable = /^(DCS|Deployable Cooling Systems)$/i.test(reward);
  return {
    type: title ? 'title' : consumable ? 'consumable' : 'disk',
    frame: title || consumable ? null : 'assets/img/atlases/standard_rgba_atlas/icon_conquest_artifact_rarity_04.png',
    power: title || consumable ? null : 'assets/img/atlases/standard_rgba_atlas/icon_conquest_artifact_power_0'+(reward === 'Booming Voice' ? '4' : '1')+'.png',
    art: title ? 'assets/img/atlases/standard_rgba_atlas/icon_questreward_title.png' : consumable ? 'assets/img/atlases/standard_rgba_atlas/icon_conquest_consumable_tech.png' : 'assets/img/atlases/standard_rgba_atlas/'+(/^icon_conquest_artifact_0[1-5]$/.test(texture) ? texture : 'icon_conquest_artifact_01')+'.png',
    label: title ? String(reward).replace(/\s*title$/i,'')+' · Title' : consumable ? 'Deployable Cooling Systems · Consumable' : reward+' · Data disk',
  };
}

function conquestTiming(entry, nowMs){
  const hour = typeof stdHour === 'function' ? stdHour() : 18;
  const start = Date.parse(entry.starts+'T00:00:00Z')+hour*3600000;
  const end = Date.parse(entry.ends+'T00:00:00Z')+hour*3600000;
  const duration = Math.max(1, Math.round((end-start)/86400000));
  const state = nowMs < start ? 'upcoming' : nowMs < end ? 'active' : 'past';
  const day = state === 'upcoming' ? 0 : Math.min(duration, Math.floor((nowMs-start)/86400000)+1);
  const hours = Math.max(0, Math.ceil(((state === 'upcoming' ? start : end)-nowMs)/3600000));
  return {state, day, duration, progress:Math.min(100,Math.max(0,(nowMs-start)/(end-start)*100)),
    remaining: state === 'past' ? 'Ended' : (hours >= 24 ? Math.floor(hours/24)+'d '+hours%24+'h' : hours+'h')};
}
function paintConquestTiming(app, entry, nowMs){
  const timing = conquestTiming(entry, nowMs);
  const set = (key, text) => { const el = app.querySelector('[data-clock="'+key+'"]'); if(el) el.textContent = text; };
  set('day',timing.day); set('remaining',timing.remaining);
  set('label',timing.state === 'upcoming' ? 'Starts in' : timing.state === 'active' ? 'Time remaining' : 'Conquest complete');
  const bar = app.querySelector('[data-clock="progress"]'); if(bar) bar.style.width = timing.progress+'%';
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
   is a different currency). The gold star is the original
   standard_rgba_atlas/icon_rendered_star sprite, exported using its named
   Unity rectangle. See assets/img/atlases/index.json for source metadata.
   (assets/img/live/conquest-keycard.png is the Conquest CREDITS icon, not
   a keycard — don't use it for crate progress.) */
const UI_SPRITES = {
  keycard: 'assets/img/atlases/standard_rgba_atlas/icon_points_pathofconquest.png',
  star: 'assets/img/atlases/standard_rgba_atlas/icon_rendered_star.png',
};
const sprite = (name, cls, title) => UI_SPRITES[name]
  ? `<img class="${cls}" src="${withAssetV(UI_SPRITES[name])}" alt="" title="${esc(title)}">`
  : '';
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
  setInterval(() => paintConquestTiming(app, sel.entry, Date.now()), 60000);
}

function renderPlanner(app, sel, nowMs, shared){
  const entry = sel.entry, diffs = entry.difficulties || {};
  const saved = loadPlans()[entry.id] || {};
  const incoming = shared && (!shared.c || shared.c === entry.id) ? shared : null;
  let difficulty = incoming?.d || saved.difficulty || entry.difficulty;
  if(!diffs[difficulty]) difficulty = Object.keys(diffs)[0];
  const diff = diffs[difficulty] || { groups: [], crates: [] };
  const groups = diff.groups || [], crates = [...(diff.crates || [])].sort((a,b) => a.at-b.at);
  const cap = Math.max(0, Number(entry.maxStars) || 0);
  const clampStars = value => Math.min(cap, Math.max(0, Math.trunc(Number(value) || 0)));
  let stars = clampStars(incoming ? incoming.s : saved.stars);
  const validIds = new Set(groups.flatMap(g => g.feats.map(f => f.id)));
  const rawIds = incoming ? incoming.f : saved.feats;
  let picked = new Set((Array.isArray(rawIds) ? rawIds : []).filter(id => validIds.has(id)));
  const rawTarget = incoming ? incoming.t : saved.target;
  let target = crates.some(c => c.name === rawTarget) ? rawTarget : null;
  let tab = incoming?.g || saved.tab;
  if(!groups.some(g => g.name === tab)) tab = groups[0]?.name;
  let filter = 'all';
  const activeGroup = () => groups.find(g => g.name === tab) || { name: '', feats: [] };
  const persist = () => savePlans({ ...loadPlans(), [entry.id]: { difficulty, stars, target, tab, feats: [...picked] } });
  const label = name => {
    const c = crates.find(c => c.name === name);
    return shortName(name) + (c?.colloquial ? ` (${c.colloquial})` : '');
  };
  const top = Math.max(0, ...crates.map(c => c.at));
  const units = entry.shardUnits || {};
  const ladder = crates.map(c => `<button type="button" class="cq-chip" data-crate="${esc(c.name)}" data-at="${c.at}" aria-pressed="false" aria-label="Target ${esc(c.name)}, ${c.at} keycards"><img class="cq-crate" src="${crateArt(c.name)}" alt=""><span>${shortName(c.name)}</span><b>${c.at}</b></button>`).join('');
  const partial = entry.status === 'preliminary';
  const settingsOpen = typeof window === 'undefined' || window.innerWidth >= 900;
  const dateLabel = value => new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  const timing = conquestTiming(entry, nowMs);
  app.innerHTML = `
    <section class="merged-hero cq-hero" aria-labelledby="cqTitle">
      <div class="mh-left"><h1 class="mh-tag" id="cqTitle">Conquest planner</h1>
        <div class="mh-title-row"><div class="mh-main-val">Day <span data-clock="day">${timing.day}</span><span class="mh-of">/ ${timing.duration}</span></div></div>
        <p class="mh-sub">Volume <span>${esc(entry.volume || '—')}</span> · <span>${esc(difficulty[0].toUpperCase()+difficulty.slice(1))}</span> difficulty · ${esc(entry.unit || 'Conquest rewards')}</p>
        <div class="mh-progress-wrap"><div class="mh-progress-bar" aria-hidden="true"><div class="mh-progress-fill" data-clock="progress" style="width:${timing.progress}%"></div></div>
          <div class="mh-progress-labels"><time datetime="${esc(entry.starts)}">${esc(dateLabel(entry.starts))}</time><time datetime="${esc(entry.ends)}">${esc(dateLabel(entry.ends))}</time></div>
        </div>
      </div>
      <div class="mh-right"><div class="cb-text"><span class="cb-label" data-clock="label">${timing.state === 'upcoming' ? 'Starts in' : timing.state === 'active' ? 'Time remaining' : 'Conquest complete'}</span><span class="cb-timer" data-clock="remaining">${timing.remaining}</span><span class="cb-sub">${timing.state === 'upcoming' ? 'Opens' : 'Closes'} ${esc(dateLabel(timing.state === 'upcoming' ? entry.starts : entry.ends))} · ${typeof stdHour === 'function' ? stdHour() : 18}:00 UTC</span></div>
      </div>
    </section>
    <div class="cq-page-tools">${partial ? '<p class="cq-note"><strong>Preliminary feat details</strong><span>Check requirements against the current in-game Conquest.</span></p>' : '<p class="cq-note">Choose the feats you plan to complete.</p>'}
      <div class="cq-actions"><button class="gear-btn" type="button" data-copy-link>Copy plan link</button><button class="gear-btn" type="button" data-reset-plan>Reset plan</button></div></div>
    ${Object.keys(diffs).length > 1 ? `<div class="cq-difficulty" role="group" aria-label="Difficulty">${Object.keys(diffs).map(d => `<button type="button" class="sf-pill" data-diff="${esc(d)}" aria-pressed="${d === difficulty}">${esc(d)}</button>`).join('')}</div>` : ''}
    <div class="cq-layout">
      <section class="cq-work explorer" aria-labelledby="cqChoose"><div class="section-head cq-work-head"><h2 id="cqChoose">Feats</h2><span class="rule"></span><span class="sub">Select your planned completions</span></div>
        <div class="cq-tabs" role="group" aria-label="Feat groups">${groups.map(g => `<button class="day-pill" type="button" data-tab="${esc(g.name)}" aria-pressed="false"><span>${esc(g.name)}</span><span class="cq-tab-num"></span></button>`).join('')}</div>
        <div class="cq-list-tools"><span data-cq="group-total"></span><div class="cq-filters" role="group" aria-label="Show feats">${[['all','All'],['selected','Selected'],['unselected','Unselected']].map(([v,text]) => `<button class="sf-pill" type="button" data-filter="${v}" aria-pressed="false">${text}</button>`).join('')}</div><button class="gear-btn" type="button" data-toggle-all>Select group</button></div>
        <div class="cq-feats" role="group" aria-label="Feats"></div>
      </section>
      <aside class="cq-panel status-card purple-card" aria-labelledby="cqProjection">
        <div class="sc-header"><h2 class="sc-title" id="cqProjection">Your projected crate</h2><span class="sc-badge purple">Your plan</span></div>
        <div aria-live="polite" aria-atomic="true"><div class="cq-headline"><strong data-cq="total">0</strong>${sprite('keycard','cq-kc','Keycards')}<span>planned keycards</span></div>
        <p class="cq-earned" data-cq="earned"></p>
        <p class="cq-breakdown" data-cq="breakdown"></p></div>
        <div class="cq-track" role="progressbar" aria-label="Planned keycards toward the top crate" aria-valuemin="0" aria-valuemax="${top}"><div data-cq="fill"></div>${crates.map(c => `<i style="left:${top ? c.at/top*100 : 0}%" aria-hidden="true"></i>`).join('')}</div>
        <p class="cq-next" data-cq="next"></p>
        <p class="cq-target" data-cq="target"></p>
        <button class="cq-settings-toggle gear-btn" type="button" data-settings-toggle aria-expanded="${settingsOpen}" aria-controls="cqSettings">Battle stars &amp; target crate<span class="cq-chevron" aria-hidden="true"></span></button>
        <div class="cq-settings" id="cqSettings"${settingsOpen ? '' : ' hidden'}>
        <h3>Choose a target crate</h3>
        <div class="cq-ladder" role="group" aria-label="Target crate">${ladder}</div>
        <div class="cq-payout" data-cq="payout"></div>
        <div class="cq-stars"><label for="cqStars">Expected battle stars</label><div class="cq-stars-control">${sprite('star','cq-star','Battle star')}<div class="cq-stepper"><button type="button" class="day-arrow" data-stars-step="-1" aria-label="Remove one battle star">−</button><input id="cqStars" type="number" inputmode="numeric" min="0" max="${cap}" step="1" value="${stars}" data-stars-input><button type="button" class="day-arrow" data-stars-step="1" aria-label="Add one battle star">+</button></div><span>/ ${cap}</span><button class="gear-btn" type="button" data-stars-max>Max</button></div><p>One keycard per battle star.</p></div></div>
        <p class="cq-save-note" role="status" data-cq="save-note"></p>
      </aside>
    </div><p class="cq-feedback" role="status" data-cq="feedback"></p>`;

  function featRow(f){
    const rawDesc = featDesc(f, difficulty), art = featArt(f), reward = featReward(f.reward, f.rewardTexture);
    const gate = f.requires || chainRequires(rawDesc);
    const desc = gate ? rawDesc.replace(/\s*\(Complete the .*?\)\s*$/i,'') : rawDesc;
    return `<label class="cq-feat${picked.has(f.id) ? ' on' : ''}"><input type="checkbox" data-feat="${esc(f.id)}"${picked.has(f.id) ? ' checked' : ''}>
      <span class="cq-fi${featStatusTone(f) ? ' '+featStatusTone(f) : ''}${art.includes('/live/conquest-') && !art.includes('/conquest-feat-') ? ' portrait' : ''}${['noattackers','nosupport','notanks'].includes(f.id) ? ' excluded' : ''}" aria-hidden="true"><img src="${esc(art)}" alt="" loading="lazy"></span>
      <span class="cq-feat-text"><strong>${esc(f.title)}</strong><span class="cq-feat-desc">${esc(desc)}</span>
      ${gate ? `<span class="cq-requires">Requires the ${f.id === 'learncontrol' ? 'consumable' : 'disk'} from ${esc(gate)}, or Conquest Pass+.</span>` : ''}
      ${reward ? `<span class="cq-reward"><span class="cq-reward-art">${reward.frame ? `<span class="cq-disk" aria-hidden="true"><img class="cq-disk-frame" src="${withAssetV(reward.frame)}" alt=""><img class="cq-disk-emblem" src="${withAssetV(reward.art)}" alt=""><img class="cq-disk-power" src="${withAssetV(reward.power)}" alt=""></span>` : `<img class="cq-${reward.type}-icon" src="${withAssetV(reward.art)}" alt="">`}</span><span><span class="cq-reward-label">Bonus reward</span>${esc(reward.label)}</span></span>` : ''}</span>
      <span class="cq-feat-value">${f.keycards > 0 ? `+${f.keycards}${sprite('keycard','cq-kc','Keycards')}` : 'Bonus'}</span></label>`;
  }
  function renderFeats(){
    const group = activeGroup();
    const visible = group.feats.filter(f => filter === 'all' || (filter === 'selected' ? picked.has(f.id) : !picked.has(f.id)));
    const kinds = ['global','sector','miniboss','boss'].filter(k => visible.some(f => (f.kind || 'sector') === k));
    app.querySelector('.cq-feats').innerHTML = visible.length ? kinds.map(k =>
      (k === 'global' ? '' : `<h3 class="cq-subhead">${KIND_TITLES[k]}</h3>`) + visible.filter(f => (f.kind || 'sector') === k).map(featRow).join('')).join('') : '<p class="cq-empty">No '+filter+' feats in this group.</p>';
  }
  function paint(editingStars = false){
    const t = planTotals(diff,[...picked],stars,cap), result = crateFor(crates,t.total);
    const set = (key,value) => { app.querySelector(`[data-cq="${key}"]`).textContent = value; };
    set('total',t.total);
    set('earned',result.earned ? label(result.earned.name) : 'No crate reached yet');
    set('breakdown',`${t.featTotal} from feats + ${stars} from battle stars`);
    set('next',result.next ? `${result.remaining} more keycards for ${label(result.next.name)}` : 'Top crate reached');
    app.querySelector('[data-cq="fill"]').style.width = (top ? Math.min(100,t.total/top*100) : 0)+'%';
    app.querySelector('.cq-track').setAttribute('aria-valuenow',Math.min(top,t.total));
    const targetCrate = crates.find(c => c.name === target);
    set('target',targetCrate ? (t.total >= targetCrate.at ? `Your plan reaches ${label(target)}.` : `${targetCrate.at-t.total} more keycards needed for ${label(target)}.`) : 'Tap a crate to set your target and see its shard rewards.');
    app.querySelector('[data-cq="target"]').hidden = !targetCrate;
    app.querySelectorAll('[data-crate]').forEach(button => {
      const on = button.dataset.crate === target;
      button.classList.toggle('is-target',on); button.classList.toggle('earned',Number(button.dataset.at) <= t.total);
      button.setAttribute('aria-pressed',String(on));
    });
    const payout = app.querySelector('[data-cq="payout"]');
    payout.innerHTML = targetCrate?.shards ? `<strong>Target rewards · ${esc(label(target))}</strong>`+['primary','secondary'].filter(k => units[k]).map(k => `<span>${shardArt(units[k])}<b>${targetCrate.shards[k] ?? 0}</b> ${esc(units[k].name)} shards</span>`).join('')+'<small>Only the highest crate reached pays out.</small>' : '';
    payout.hidden = !targetCrate?.shards;
    const group = activeGroup(), selected = group.feats.filter(f => picked.has(f.id));
    set('group-total',`${selected.reduce((n,f) => n+Number(f.keycards),0)} / ${group.feats.reduce((n,f) => n+Number(f.keycards),0)} keycards selected`);
    app.querySelectorAll('[data-tab]').forEach(button => {
      const g = groups.find(g => g.name === button.dataset.tab);
      button.setAttribute('aria-pressed',String(g.name === tab));
      button.querySelector('.cq-tab-num').textContent = `${g.feats.filter(f => picked.has(f.id)).length}/${g.feats.length}`;
    });
    app.querySelector('[data-toggle-all]').textContent = selected.length === group.feats.length && group.feats.length ? 'Clear group' : 'Select group';
    app.querySelectorAll('[data-filter]').forEach(button => {
      const on = button.dataset.filter === filter;
      button.setAttribute('aria-pressed',String(on)); button.classList.toggle('active',on);
    });
    app.querySelectorAll('[data-stars-step]').forEach(button => { button.disabled = Number(button.dataset.starsStep) < 0 ? stars === 0 : stars === cap; });
    if(!editingStars) app.querySelector('[data-stars-input]').value = stars;
    syncHash(entry,picked,stars,target,difficulty,tab);
  }
  function changed(rebuild = false, editingStars = false){
    app.querySelector('[data-cq="feedback"]').textContent = '';
    persist(); if(rebuild) renderFeats(); paint(editingStars);
    // Storage can be unavailable in private modes; the URL remains shareable.
    try { if(localStorage.getItem(CQ_PLAN_KEY) === null) app.querySelector('[data-cq="save-note"]').textContent = 'Device storage unavailable. Copy your plan link to keep it.'; } catch(e){ app.querySelector('[data-cq="save-note"]').textContent = 'Device storage unavailable. Copy your plan link to keep it.'; }
  }
  // Delegate to the stable app: replacement rows after reset/filter/tab changes
  // use the same handlers. Assigning these replaces previous render handlers.
  app.oninput = event => {
    if(event.target.matches('[data-stars-input]')){
      stars = clampStars(event.target.value); changed(false,true);
    }
  };
  app.onchange = event => {
    const input = event.target;
    if(input.matches('[data-feat]')){
      const id = input.dataset.feat;
      if(!validIds.has(id)) return;
      input.checked ? picked.add(id) : picked.delete(id);
      input.closest('.cq-feat').classList.toggle('on',input.checked);
      changed(filter !== 'all');
      if(filter !== 'all') (app.querySelector('[data-feat]') || app.querySelector('[data-filter]')).focus();
    } else if(input.matches('[data-stars-input]')){ stars = clampStars(input.value); changed(); }
  };
  app.onclick = async event => {
    const button = event.target.closest('button'); if(!button || !app.contains(button)) return;
    if(button.matches('[data-tab]')){ tab = button.dataset.tab; renderFeats(); changed(); }
    else if(button.matches('[data-filter]')){ filter = button.dataset.filter; renderFeats(); paint(); }
    else if(button.matches('[data-diff]')){ persist(); renderPlanner(app,sel,nowMs,{ c: entry.id, d: button.dataset.diff, s: 0, t: null, f: [], g: null }); }
    else if(button.matches('[data-settings-toggle]')){
      const panel = app.querySelector('#cqSettings'); panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded',String(!panel.hidden));
    }
    else if(button.matches('[data-stars-step]')){ stars = clampStars(stars + Number(button.dataset.starsStep)); changed(); }
    else if(button.matches('[data-crate]')){ target = target === button.dataset.crate ? null : button.dataset.crate; changed(); }
    else if(button.matches('[data-stars-max]')){ stars = cap; changed(); }
    else if(button.matches('[data-toggle-all]')){
      const ids = activeGroup().feats.map(f => f.id), all = ids.every(id => picked.has(id));
      ids.forEach(id => all ? picked.delete(id) : picked.add(id)); changed(true);
    } else if(button.matches('[data-reset-plan]')){
      picked.clear(); stars = 0; target = null; filter = 'all';
      changed(true);
      app.querySelector('[data-cq="feedback"]').textContent = 'Plan reset. All feats, battle stars and the target have been cleared.';
    } else if(button.matches('[data-copy-link]')){
      // Write the current snapshot before copying, including rapid edits.
      writeHash(entry,picked,stars,target,difficulty,tab);
      try { await navigator.clipboard.writeText(location.href); app.querySelector('[data-cq="feedback"]').textContent = 'Plan link copied.'; }
      catch(e){
        const feedback = app.querySelector('[data-cq="feedback"]');
        feedback.innerHTML = '<label>Copy this plan link <input class="cq-copy-fallback" readonly aria-label="Plan link" value="'+esc(location.href)+'"></label>';
        const input = feedback.querySelector('input'); input.focus(); input.select();
      }
    }
  };
  renderFeats(); paint();
}

/* URL writes are cheap for this small plan. Keep each edit synchronous so a
   reset, a second edit and Copy link can never serialize an old snapshot. */
function syncHash(entry,picked,stars,target,difficulty,tab){
  if(typeof location !== 'undefined' && location.href) writeHash(entry,picked,stars,target,difficulty,tab);
}

function writeHash(entry, picked, stars, target, difficulty, tab){
  const payload = { c: entry.id, d: difficulty, s: stars, t: target, g: tab, f: [...picked].sort() };
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
