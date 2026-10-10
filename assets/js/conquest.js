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

// Equal spacing gives each crate a usable hover/tap target. Fill still
// interpolates the actual keycard thresholds between successive crates.
function crateTrackProgress(crates,total){
  const ladder = [...(crates || [])].sort((a,b)=>a.at-b.at);
  if(!ladder.length) return 0;
  let previous = 0;
  for(let i=0;i<ladder.length;i++){
    const at = Number(ladder[i].at);
    if(total < at) return (i+Math.max(0,(total-previous)/Math.max(1,at-previous)))/ladder.length*100;
    previous = at;
  }
  return 100;
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

const CQ_CATEGORIES = [
  {id:'buff', label:'Buffs', color:'#66ba8a'},
  {id:'debuff', label:'Debuffs', color:'#da7883'},
  {id:'survival', label:'Survival', color:'#70b7db'},
  {id:'squad', label:'Squads', color:'#b39ade'},
  {id:'faction', label:'Factions', color:'#58b9b0'},
  {id:'other', label:'Other', color:'#d2a667'},
];

// Each feat belongs to one objective so the chart never double-counts
// keycards. Repeated requirements (e.g. Grogu surviving) share a branch.
function conquestCoverage(diff, pickedIds){
  const picked = new Set(pickedIds || []);
  const categories = CQ_CATEGORIES.map(c => ({...c, requirements:[], feats:[], keycards:0, planned:0}));
  for(const group of diff.groups || []) for(const feat of group.feats || []){
    if(!Number(feat.keycards) && /title/i.test(feat.reward || '')) continue;
    const objective = feat.coverage || {category:'other', requirement:feat.title};
    const category = categories.find(c => c.id === objective.category) || categories[categories.length-1];
    const item = {feat, group:group.name, picked:picked.has(feat.id), keycards:Number(feat.keycards) || 0, ...featLinks(diff,feat)};
    let requirement = category.requirements.find(r => r.name === objective.requirement);
    if(!requirement){ requirement = {name:objective.requirement, feats:[], keycards:0, planned:0}; category.requirements.push(requirement); }
    for(const owner of [category, requirement]){
      owner.feats.push(item); owner.keycards += item.keycards;
      if(item.picked) owner.planned += item.keycards;
    }
  }
  return categories.filter(c => c.feats.length);
}

// Curated gates take precedence over generic gate names in game descriptions.
function featLinks(diff, feat){
  const all = (diff.groups || []).flatMap(g => g.feats || []);
  const clean = value => String(value || '').replace(/\s*\(\d+\)\s*$/, '').trim().toLowerCase();
  const gate = feat.requires || chainRequires(featDesc(feat,'hard'));
  const source = gate ? all.find(f => f.id !== feat.id && clean(f.title) === clean(gate)) : null;
  const unlocks = all.filter(f => f.id !== feat.id && clean(f.requires || chainRequires(featDesc(f,'hard'))) === clean(feat.title));
  return {source:source || null, unlocks};
}

function sectorComplete(group, pickedIds){
  const scored = (group.feats || []).filter(f => Number(f.keycards) > 0);
  const picked = new Set(pickedIds || []);
  return scored.length > 0 && scored.every(f => picked.has(f.id));
}

function coverageArc(inner, outer, start, end){
  const point = (r,a) => [200+r*Math.sin(a),200-r*Math.cos(a)].map(n => n.toFixed(3)).join(' ');
  const large = end-start > Math.PI ? 1 : 0;
  return `M ${point(outer,start)} A ${outer} ${outer} 0 ${large} 1 ${point(outer,end)} L ${point(inner,end)} A ${inner} ${inner} 0 ${large} 0 ${point(inner,start)} Z`;
}

function coverageWheel(categories, active){
  const count = categories.reduce((n,c) => n+c.feats.length,0);
  const selected = categories.reduce((n,c) => n+c.feats.filter(f => f.picked).length,0);
  const skipped = count-selected;
  if(!count) return '';
  const step = Math.PI*2/count, gap = .006;
  let cursor = 0;
  const paths = categories.map(c => {
    const start = cursor, end = start+c.feats.length*step;
    const dim = active !== 'all' && active !== c.id ? ' dim' : '';
    let html = `<g class="cq-map-branch${dim}" style="--branch:${c.color}"><path class="cq-map-category" data-map-category="${c.id}" role="button" tabindex="0" aria-label="Filter ${esc(c.label)}" d="${coverageArc(59,111,start+gap,end-gap)}"></path>`;
    for(const r of c.requirements){
      for(const item of r.feats){
        html += `<path class="cq-map-feat${item.picked ? ' planned' : ''}${item.feat.reward ? ' grants-reward' : ''}${item.source ? ' uses-reward' : ''}" data-map-feat="${esc(item.feat.id)}" role="button" tabindex="0" aria-label="${esc(item.feat.title)}, ${esc(item.group)}, ${item.picked ? 'planned' : 'skipped'}" aria-pressed="${item.picked}" d="${coverageArc(114,193,cursor+gap,cursor+step-gap)}"></path>`;
        const middle = cursor+step/2, sector = /Sector (\d+)/.test(item.group) ? 'S'+/Sector (\d+)/.exec(item.group)[1] : 'GL';
        /* Badge spins with its segment so it reads as part of the tile. */
        const bdeg = (middle*180/Math.PI).toFixed(1), bx = (200+179*Math.sin(middle)).toFixed(2), by = (200-179*Math.cos(middle)).toFixed(2);
        html += `<text class="cq-map-sector${item.picked ? ' planned' : ''}" x="${200+151*Math.sin(middle)}" y="${200-151*Math.cos(middle)}" text-anchor="middle" dominant-baseline="middle">${sector}</text>${(item.feat.reward || item.source?.reward) ? '<g class="cq-map-reward-badge '+(item.source ? 'uses-reward' : 'grants-reward')+'" transform="rotate('+bdeg+' '+bx+' '+by+')"><rect x="'+(200+179*Math.sin(middle)-9)+'" y="'+(200-179*Math.cos(middle)-11)+'" width="18" height="22" rx="4"/><image class="cq-map-reward" href="'+withAssetV(featReward(item.feat.reward || item.source.reward).art)+'" x="'+(200+179*Math.sin(middle)-7)+'" y="'+(200-179*Math.cos(middle)-9)+'" width="14" height="18"/></g>' : ''}`;
        cursor += step;
      }
    }
    const mid = (start+end)/2;
    html += `<text x="${200+85*Math.sin(mid)}" y="${200-85*Math.cos(mid)}" text-anchor="middle" dominant-baseline="middle">${esc(c.label)}</text></g>`;
    return html;
  }).join('');
  return `<svg viewBox="0 0 400 400" role="group" aria-label="Conquest coverage: ${skipped} of ${count} feats skipped; ${selected} planned. Rings show objective types and individual feats.">${paths}<circle class="cq-map-center" cx="200" cy="200" r="54"/><text class="cq-map-count" x="200" y="197" text-anchor="middle">${skipped}<tspan class="cq-map-of"> / ${count}</tspan></text><text class="cq-map-caption" x="200" y="218" text-anchor="middle">feats skipped</text></svg>`;
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
  if(['hot','evasionup','retribution','defenseup','buffs100'].includes(feat?.id)) return 'buff';
  if(['bombs','stagger-s1','stun','defensedown','dot300','knockemdead','expose','onthemove','potencydown','evasiondown'].includes(feat?.id)) return 'debuff';
  return 'neutral';
}
/* The ISB emblem texture is mostly transparent padding (emblem fills ~50%
   of the frame vs 80%+ for the other faction textures), so its icon gets
   a zoom class to render at the same visual size. */
function featEmblem(feat){ return feat?.id === 'isfinest' ? 'isb-emblem' : ''; }
function featArt(feat){
  const dedicated = {
    challenge250:'atlases/conquestui_atlas/combat_gl_selectable.png',
    isfinest:'live/datacronui_affix_isb.png', newrepublic:'live/datacronui_affix_newrepublic.png',
    imprem:'live/datacronui_affix_imperialremnant.png', crimesyndicate:'live/datacronui_affix_huttcartel.png',
    mercenary:'live/datacronui_affix_mercenary.png', finalwatch:'atlases/homebase_ui_standard_atlas/icon_squad.png',
    'flawless-5':'atlases/homebase_ui_standard_atlas/icon_squad.png',
    lsds:'atlases/standard_atlas/icon_alignment_light.png',
    unlikely:'atlases/standard_rgba_atlas/icon_copy_squads.png',
    buffs100:'atlases/battleui_view_rgba_atlas/icon_buff_generic.png',
    followlead:'atlases/standard_rgba_atlas/icon_conquest_artifact_03.png',
  };
  if(dedicated[feat?.id]) return withAssetV('assets/img/'+dedicated[feat.id]);
  if(feat?.id === 'learncontrol') return withAssetV('assets/img/atlases/standard_rgba_atlas/icon_conquest_consumable_tech.png');
  if(feat?.id === 'lightside-boss' || feat?.id === 'darkside-mini') return withAssetV('assets/img/atlases/standard_atlas/icon_alignment_'+(feat.id === 'lightside-boss' ? 'light' : 'dark')+'.png');
  const named = FEAT_ICONS[feat?.id];
  if(named) return withAssetV('assets/img/atlases/battleui_view_rgba_atlas/'+named+'.png');
  const art = typeof feat?.art === 'string' ? feat.art.trim() : '';
  if(art && !art.includes('conquest-keycard')) return withAssetV('assets/img/'+art.replace(/^\/*/,''));
  return withAssetV('assets/img/atlases/homebase_ui_standard_atlas/icon_squad.png');
}
function featRewardDisk(reward){ return /title|holo|^DCS$|Deployable Cooling Systems/i.test(String(reward || '')) ? null : (reward || null); }
// The shard sprite is the background, with the portrait over it. Its tint
// follows the unit's alignment; it is not a badge on a portrait frame.
function shardArt(unit){
  return `<span class="cq-shard ${unit.alignment === 'dark' ? 'dark' : 'light'}" aria-hidden="true"><img class="cq-shard-background" src="${withAssetV('assets/img/atlases/standard_rgba_atlas/ShardIcon.png')}" alt=""><img class="cq-shard-unit" src="${withAssetV('assets/img/'+unit.art)}" alt=""></span>`;
}
// Disk rewards use the original purple disk texture without added layers.
function featReward(reward){
  if(!reward) return null;
  const title = /title/i.test(reward);
  const consumable = /^(DCS|Deployable Cooling Systems)$/i.test(reward);
  return {
    type: title ? 'title' : consumable ? 'consumable' : 'disk',
    name: title ? String(reward).replace(/\s*title$/i,'') : consumable ? 'Deployable Cooling Systems' : String(reward),
    kind: title ? 'Title' : consumable ? 'Consumable' : 'Data disk',
    art: title ? 'assets/img/atlases/standard_rgba_atlas/icon_questreward_title.png' : consumable ? 'assets/img/atlases/standard_rgba_atlas/icon_conquest_consumable_tech.png' : 'assets/img/atlases/standard_rgba_atlas/icon_conquest_artifact_rarity_04.png',
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
  const set = (key, text) => { app.querySelectorAll('[data-clock="'+key+'"]').forEach(el=>{ el.textContent = text; }); };
  set('day',timing.day); set('remaining',timing.remaining);
  set('label',timing.state === 'upcoming' ? 'Starts in' : timing.state === 'active' ? 'Time remaining' : 'Conquest complete');
  const boundaryDate = new Date((timing.state === 'upcoming' ? entry.starts : entry.ends)+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  set('boundary',(timing.state === 'upcoming' ? 'Opens ' : 'Closes ')+boundaryDate+' at '+(typeof stdHour === 'function' ? stdHour() : 18)+':00 UTC');
  const bar = app.querySelector('[data-clock="progress"]'); if(bar) bar.style.width = timing.progress+'%';
  const notice = app.querySelector('[data-cq="notice"]');
  if(notice) notice.hidden = entry.status !== 'preliminary' || timing.state !== 'upcoming';
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
  document.documentElement.classList.remove('cq-modal-open'); document.body.classList.remove('cq-modal-open');
  const entry = sel.entry, diffs = entry.difficulties || {};
  const saved = loadPlans()[entry.id] || {};
  const incoming = shared && (!shared.c || shared.c === entry.id) ? shared : null;
  let difficulty = incoming?.d || saved.difficulty || entry.difficulty;
  if(!diffs[difficulty]) difficulty = Object.keys(diffs)[0];
  const diff = diffs[difficulty] || { groups: [], crates: [] };
  const groups = diff.groups || [], crates = [...(diff.crates || [])].sort((a,b) => a.at-b.at);
  const cap = Math.max(0, Number(entry.maxStars) || 0);
  const clampStars = value => Math.min(cap, Math.max(0, Math.trunc(Number(value) || 0)));
  let stars = clampStars(incoming ? incoming.s : (saved.stars ?? cap));
  const validIds = new Set(groups.flatMap(g => g.feats.map(f => f.id)));
  const rawIds = incoming ? incoming.f : saved.feats;
  let picked = new Set((Array.isArray(rawIds) ? rawIds : []).filter(id => validIds.has(id)));
  const rawTarget = incoming ? incoming.t : saved.target;
  let target = crates.some(c => c.name === rawTarget) ? rawTarget : null;
  let tab = incoming?.g || saved.tab;
  if(!groups.some(g => g.name === tab)) tab = groups[0]?.name;
  let coverageActive = 'all';
  let previewState = null;
  let previewScroll = null;
  const view = 'coverage';
  const persist = () => savePlans({ ...loadPlans(), [entry.id]: { difficulty, stars, target, tab, feats: [...picked] } });
  const label = name => {
    const c = crates.find(c => c.name === name);
    return shortName(name) + (c?.colloquial ? ` (${c.colloquial})` : '');
  };
  const top = Math.max(0, ...crates.map(c => c.at));
  const units = entry.shardUnits || {};
  const dateLabel = value => new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  const timing = conquestTiming(entry, nowMs);
  const conquestHeader = () => `<header class="merged-hero cq-hero cq-status" aria-labelledby="cqTitle"><div class="cq-run-heading"><h1 id="cqTitle">Conquest Status</h1><div class="cq-run-day">Day <strong data-clock="day">${timing.day}</strong><span>/ ${timing.duration}</span></div></div><dl class="cq-run-meta"><div><dt>Volume</dt><dd>${esc(entry.volume || '—')}</dd></div><div><dt>Difficulty</dt><dd>${esc(difficulty[0].toUpperCase()+difficulty.slice(1))}</dd></div><div class="cq-run-units"><dt>Primary Reward</dt><dd>${esc(entry.unit || 'Conquest rewards')}</dd></div></dl><div class="cq-countdown"><span data-clock="label">${timing.state === 'upcoming' ? 'Starts in' : timing.state === 'active' ? 'Time remaining' : 'Conquest complete'}</span><strong data-clock="remaining">${timing.remaining}</strong><small data-clock="boundary">${timing.state === 'upcoming' ? 'Opens' : 'Closes'} ${esc(dateLabel(timing.state === 'upcoming' ? entry.starts : entry.ends))}</small></div></header>`;
  app.innerHTML = `
    <div class="cq-page-layout"><aside class="cq-context" aria-label="Conquest information">
    ${conquestHeader()}
    <section class="cq-guide"><h2>Teams &amp; video guides</h2><p>Plan your feats here. For team compositions and video guides, visit BitDynasty’s site.</p><a href="https://swgoh4.life/conquest/" target="_blank" rel="noopener">SWGOH 4 Life <span aria-hidden="true">↗</span></a></section>
    <details class="cq-interaction-help"><summary>How to use the planner</summary><dl><dt>Desktop diagram &amp; crates</dt><dd>Left click for details. Right click a feat to plan or skip it; right click a crate to set your target. Hover to preview.</dd><dt>Mobile &amp; touch</dt><dd>Tap for details, then use Plan feat, Skip feat or Set target crate in the popup.</dd><dt>Keyboard</dt><dd>Press Enter or Space for details. Use the popup buttons to change your plan.</dd></dl></details>
    </aside><div class="cq-page-content">
    <p class="cq-notice" data-cq="notice" role="status"${entry.status === 'preliminary' && timing.state === 'upcoming' ? '' : ' hidden'}><strong>Upcoming Conquest · provisional feats</strong><span>Requirements and keycard values may change before the Conquest starts.</span></p>

    ${Object.keys(diffs).length > 1 ? `<div class="cq-difficulty" role="group" aria-label="Difficulty">${Object.keys(diffs).map(d => `<button type="button" class="sf-pill" data-diff="${esc(d)}" aria-pressed="${d === difficulty}">${esc(d)}</button>`).join('')}</div>` : ''}
    <div id="cqCoverageView">
      <section class="cq-report explorer" aria-label="Conquest plan">
        <div class="cq-analysis">
          <section class="cq-coverage" aria-labelledby="cqCoverageTitle">
            <div class="section-head"><h2 id="cqCoverageTitle">Conquest coverage</h2><span class="rule"></span><div class="cq-actions cq-head-actions"><button class="gear-btn" type="button" data-copy-link>Copy plan</button><button class="gear-btn" type="button" data-reset-plan>Reset</button></div></div>
            <div class="cq-diagram-totals" data-cq="diagram-totals" aria-live="polite"></div><div class="cq-map-visual"><div class="cq-wheel" data-cq="wheel"></div><div class="cq-map-key"><span class="planned">Planned</span><span class="skipped">Skipped</span><span class="reward"><img src="${withAssetV('assets/img/atlases/standard_rgba_atlas/icon_conquest_artifact_rarity_04.png')}" alt="">Data disk</span><span class="reward"><img src="${withAssetV('assets/img/atlases/standard_rgba_atlas/icon_conquest_consumable_tech.png')}" alt="">Consumable</span><span class="grant-key">Earns reward</span><span class="use-key">Needs reward</span><div class="cq-sector-key"><span><b>GL</b>Global feats</span><span><b>S1–S5</b>Sectors</span></div></div></div>

            <section class="cq-diagram-projection" aria-label="Projected crate"><div class="cq-report-rewards" data-cq="report-rewards"></div>
            <div class="cq-missed"><div class="cq-missed-entry"><label for="cqMissed">Battle keycards missed</label><div class="cq-missed-field"><input id="cqMissed" type="number" inputmode="numeric" min="0" max="${cap}" step="1" value="${cap-stars}" aria-describedby="cqMissedHint" data-missed-input><span>/ ${cap}</span></div></div><div class="cq-battle-earned"><span>Earned from battles</span><strong data-cq="battle-keycards"></strong></div><small id="cqMissedHint">Enter keycards you expect to lose from battles.</small></div></section>
          </section>
          <section class="cq-skips" aria-labelledby="cqSkipTitle">
            <div class="section-head"><h2 id="cqSkipTitle">Skipped feats</h2><span class="rule"></span></div>
            <div class="cq-skip-total"><strong data-cq="skipped-total"></strong>${sprite('keycard','cq-kc','Skipped keycards')}<span data-cq="skipped-count"></span></div>
            <p class="cq-skip-budget" data-cq="skip-budget"></p>
            <div class="cq-skipped-grid" data-cq="skipped-groups"></div>
          </section>
        </div>

      </section>
    </div></div></div><dialog class="cq-chart-dialog" aria-labelledby="cqChartTitle"><button class="gear-btn" type="button" data-chart-close aria-label="Close">×</button><div data-cq="chart-preview"></div></dialog><div class="cq-chart-tooltip" role="tooltip" data-cq="chart-tooltip" hidden></div><p class="cq-feedback" role="status" data-cq="feedback"></p><p class="cq-feedback" role="status" data-cq="save-note"></p>`;

  function rewardTile(reward, caption, related = null){
    const r = featReward(reward); if(!r) return '';
    const content = `<img class="cq-${r.type}-icon" src="${withAssetV(r.art)}" alt=""><span><small>${esc(caption)}</small><strong>${esc(r.name)}</strong></span>`;
    return related ? `<button class="cq-linked-reward uses-reward" type="button" data-preview-feat="${esc(related.id)}">${content}<span class="cq-related-name">From ${esc(related.title)}</span></button>` : `<div class="cq-linked-reward grants-reward"> ${content}<span class="cq-related-name">${esc(r.kind)}</span></div>`;
  }
  function relatedMarkup(feat, compact = false){
    const {source,unlocks} = featLinks(diff,feat);
    return (feat.reward ? rewardTile(feat.reward,'Also earns') : '') +
      (source?.reward ? rewardTile(source.reward,'Requires',source) : '') +
      (!compact && unlocks.length ? '<div class="cq-unlocks"><span>Makes completable</span>'+unlocks.map(f=>`<button type="button" data-preview-feat="${esc(f.id)}">${esc(f.title)}</button>`).join('')+'</div>' : '') +
      (!compact && source ? '<p class="cq-gate-note">Available from '+esc(source.title)+' or Conquest Pass+</p>' : '');
  }

  function paintReview(t){
    const categories = conquestCoverage(diff,[...picked]);
    if(coverageActive !== 'all' && !categories.some(c => c.id === coverageActive)) coverageActive = 'all';
    app.querySelector('[data-cq="wheel"]').innerHTML = coverageWheel(categories,coverageActive);
    const projected = crateFor(crates,t.total).earned;
    const targetCrate = crates.find(c=>c.name === target);
    const visibleFeats = categories.flatMap(c=>c.feats);
    app.querySelector('[data-cq="diagram-totals"]').innerHTML = '<strong>'+t.featTotal+' / '+t.maxFeatTotal+'</strong><span>feat keycards</span><b>'+visibleFeats.filter(f=>!f.picked).length+' feats skipped</b>';
    app.querySelector('[data-cq="report-rewards"]').innerHTML = `<div class="cq-report-result"><div class="cq-report-total"><strong data-cq="total">${t.total}</strong>${sprite('keycard','cq-kc','Planned keycards')}<span>planned keycards</span></div><strong>${projected ? esc(label(projected.name))+' projected' : 'No crate reached'}</strong></div><div class="cq-crate-rail"><div class="cq-rail-track"><div class="cq-rail-fill" role="progressbar" aria-label="Diagram plan keycards toward the top crate" aria-valuemin="0" aria-valuemax="${top}" aria-valuenow="${Math.min(top,t.total)}" style="width:${crateTrackProgress(crates,t.total)}%"></div>${crates.map((c,index)=>`<button type="button" class="cq-report-crate${c.at <= t.total ? ' earned' : ''}${projected?.name === c.name ? ' projected' : ''}${target === c.name ? ' target' : ''}" style="left:${(index+1)/crates.length*100}%" data-report-crate="${esc(c.name)}" aria-label="${esc(c.name)}, ${c.at} keycards${projected?.name === c.name ? ', projected' : ''}"><img src="${crateArt(c.name)}" alt=""><span>${c.at}</span></button>`).join('')}</div></div><p class="cq-rail-gap">${targetCrate ? (t.total >= targetCrate.at ? esc(label(target))+' target reached' : (targetCrate.at-t.total)+' more keycards to '+esc(label(target))) : (crateFor(crates,t.total).next ? crateFor(crates,t.total).remaining+' more keycards to '+esc(label(crateFor(crates,t.total).next.name)) : 'Top crate reached')}</p>`;
    const isSkipped = f => !picked.has(f.id) && (Number(f.keycards) > 0 || !/title/i.test(f.reward || ''));
    const skipped = groups.flatMap(g=>g.feats).filter(isSkipped);
    app.querySelector('[data-cq="skipped-total"]').textContent = t.maxFeatTotal-t.featTotal;
    app.querySelector('[data-cq="skipped-count"]').textContent = `keycards from ${skipped.length} ${skipped.length === 1 ? 'feat' : 'feats'}`;
    const wanted = crates.find(c=>c.name === target) || crates[crates.length-1];
    const allowance = wanted ? t.maxFeatTotal+stars-wanted.at : 0;
    const budget = app.querySelector('[data-cq="skip-budget"]');
    budget.textContent = wanted ? (allowance >= 0 ? `${label(wanted.name)} skip allowance: ${allowance} keycards` : `${label(wanted.name)} needs at least ${Math.max(0,wanted.at-t.maxFeatTotal)} battle keycards`) : '';
    budget.classList.toggle('reached',allowance >= t.maxFeatTotal-t.featTotal);
    const skipList = app.querySelector('[data-cq="skipped-groups"]');
    skipList.innerHTML = skipped.length ? groups.map(g => {
      const missing = g.feats.filter(isSkipped);
      if(!missing.length) return '';
      const value = missing.reduce((n,f)=>n+(Number(f.keycards)||0),0);
      return `<section class="cq-skip-group" data-skip-group="${esc(g.name)}"><h3><span>${esc(g.name)}</span><b>${value}${sprite('keycard','cq-kc','Keycards')}</b></h3>${missing.map(f=>`<div class="cq-skipped-feat${f.reward ? ' grants-reward' : ''}${featLinks(diff,f).source ? ' uses-reward' : ''}"><button class="cq-feat-link" type="button" data-preview-feat="${esc(f.id)}"><span class="cq-fi ${featStatusTone(f)} ${featEmblem(f)} portrait" aria-hidden="true"><img src="${esc(featArt(f))}" alt="" loading="lazy"></span><span class="cq-skipped-text"><strong>${esc(f.title)}</strong><small>${esc(featDesc(f,difficulty).replace(/\s*\(Complete the .*?\)\s*$/i,''))}</small></span></button><span class="cq-skipped-value">${f.keycards ? f.keycards : 'Bonus'}</span>${(f.reward || featLinks(diff,f).source) ? '<div class="cq-feat-extras">'+relatedMarkup(f,true)+'</div>' : ''}</div>`).join('')}</section>`;
    }).join('') : '<p class="cq-empty">No feats skipped.</p>';
  }
  function paint(editingMissed = false){
    if(!editingMissed) app.querySelector('[data-missed-input]').value = cap-stars;
    app.querySelector('[data-cq="battle-keycards"]').textContent = stars+' / '+cap;
    syncHash(entry,picked,stars,target,difficulty,tab,view);
    paintReview(planTotals(diff,[...picked],stars,cap));
    syncSkipsHeight();
  }
  /* Pin the skipped list to the coverage column's height on wide screens
     so both card columns always end flush — CSS alone can't cap a grid
     row to its sibling, so the row would keep following the list. */
  function syncSkipsHeight(){
    const skips = app.querySelector('.cq-skips'), coverage = app.querySelector('.cq-coverage');
    if(!skips || !coverage) return;
    const wide = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 1200px)').matches;
    skips.style.maxHeight = wide ? Math.max(0, coverage.offsetHeight)+'px' : '';
  }
  function changed(editingMissed = false){
    app.querySelector('[data-cq="feedback"]').textContent = '';
    persist(); paint(editingMissed);
    // Storage can be unavailable in private modes; the URL remains shareable.
    try { if(localStorage.getItem(CQ_PLAN_KEY) === null) app.querySelector('[data-cq="save-note"]').textContent = 'Device storage unavailable. Copy your plan link to keep it.'; } catch(e){ app.querySelector('[data-cq="save-note"]').textContent = 'Device storage unavailable. Copy your plan link to keep it.'; }
  }
  // Delegate to the stable app: replacement rows after repainted chart changes
  // use the same handlers. Assigning these replaces previous render handlers.
  app.oninput = event => {
    if(event.target.matches('[data-missed-input]')){
      stars = cap-clampStars(event.target.value); changed(true);
    }
  };
  app.onchange = event => {
    if(event.target.matches('[data-missed-input]')){
      stars = cap-clampStars(event.target.value); changed();
    }
  };
  app.onmousedown = event=>{ if(event.target.closest('[data-map-feat],[data-map-category]')) event.preventDefault(); };
  app.oncontextmenu = event => {
    const feat = event.target.closest('[data-map-feat]');
    const crate = event.target.closest('[data-report-crate]');
    if(!feat && !crate) return;
    event.preventDefault();
    const position = {top:window.scrollY,left:window.scrollX,behavior:'instant'};
    if(feat){
      const id = feat.dataset.mapFeat; if(!validIds.has(id)) return;
      picked.has(id) ? picked.delete(id) : picked.add(id);
    } else {
      target = crate.dataset.reportCrate;
    }
    app.querySelector('[data-cq="chart-tooltip"]').hidden = true;
    changed();
    window.scrollTo?.(position);
  };
  app.onclick = async event => {
    const mapFeat = event.target.closest('[data-map-feat]'), mapCategory = event.target.closest('[data-map-category]');
    if(mapFeat){
      const position = {top:window.scrollY,left:window.scrollX,behavior:'instant'};
      const id = mapFeat.dataset.mapFeat;
      previewChart('feat',id,position); return;
    }
    if(mapCategory){ coverageActive = coverageActive === mapCategory.dataset.mapCategory ? 'all' : mapCategory.dataset.mapCategory; paintReview(planTotals(diff,[...picked],stars,cap)); app.querySelector('[data-map-category="'+mapCategory.dataset.mapCategory+'"]').focus({preventScroll:true}); return; }
    const modal = app.querySelector('.cq-chart-dialog');
    if(event.target === modal){
      const rect = modal.getBoundingClientRect();
      if(event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeChart();
      return;
    }
    const button = event.target.closest('button'); if(!button || !app.contains(button)) return;
    if(button.matches('[data-chart-close]')){
      closeChart();
    }
    else if(button.matches('[data-preview-feat]')){ previewChart('feat',button.dataset.previewFeat); }
    else if(button.matches('[data-report-crate]')){ previewChart('crate',button.dataset.reportCrate); }
    else if(button.matches('[data-preview-target]')){ target = target === button.dataset.previewTarget ? null : button.dataset.previewTarget; changed(); previewChart('crate',button.dataset.previewTarget); }
    else if(button.matches('[data-review-feat]')){
      const id = button.dataset.reviewFeat; if(!validIds.has(id)) return;
      picked.has(id) ? picked.delete(id) : picked.add(id); changed();
      if(previewState){ previewChart(previewState.kind,previewState.id); app.querySelector('[data-review-feat="'+id+'"]').focus({preventScroll:true}); }
    }
    else if(button.matches('[data-diff]')){ persist(); renderPlanner(app,sel,nowMs,{ c: entry.id, d: button.dataset.diff, s: cap, t: null, f: [], g: null }); }
    else if(button.matches('[data-reset-plan]')){
      picked.clear(); stars = cap; target = null;
      changed();
      app.querySelector('[data-cq="feedback"]').textContent = 'Plan reset. Feats and target cleared; battle keycards set to full.';
    } else if(button.matches('[data-copy-link]')){
      // Write the current snapshot before copying, including rapid edits.
      writeHash(entry,picked,stars,target,difficulty,tab,view);
      try { await navigator.clipboard.writeText(location.href); app.querySelector('[data-cq="feedback"]').textContent = 'Plan link copied.'; }
      catch(e){
        const feedback = app.querySelector('[data-cq="feedback"]');
        feedback.innerHTML = '<label>Copy this plan link <input class="cq-copy-fallback" readonly aria-label="Plan link" value="'+esc(location.href)+'"></label>';
        const input = feedback.querySelector('input'); input.focus(); input.select();
      }
    }
  };
  function chartPreview(kind,id){
    const categories = conquestCoverage(diff,[...picked]);
    let items = [], title = '';
    if(kind === 'crate'){
      const crate = crates.find(c=>c.name === id); if(!crate) return;
      return {title:label(crate.name),items:[],crate};
    }
    if(kind === 'category'){
      const category = categories.find(c=>c.id === id); if(!category) return;
      title = category.label; items = category.feats;
    } else {
      const item = categories.flatMap(c=>c.feats).find(item=>item.feat.id === id); if(!item) return;
      title = item.feat.title; items = [item];
    }
    return {title,items};
  }
  function previewMarkup(detail,titleId,editable = false){
    const {title,items,crate} = detail;
    if(crate) return `<div class="cq-preview-heading"><img class="cq-crate" src="${crateArt(crate.name)}" alt=""><h2 id="${titleId}">${esc(title)}</h2>${editable ? '<button class="cq-plan-toggle" type="button" data-preview-target="'+esc(crate.name)+'">'+(target === crate.name ? 'Clear target' : 'Set target')+'</button>' : ''}</div>${editable ? `<div class="cq-crate-preview-status"><strong>${crate.at} keycards</strong><span>${planTotals(diff,[...picked],stars,cap).total >= crate.at ? 'Reached by your plan' : (crate.at-planTotals(diff,[...picked],stars,cap).total)+' keycards away'}</span></div>` : ''}${crate.shards ? '<div class="cq-report-payout">'+['primary','secondary'].filter(k=>units[k]).map(k=>`<span>${shardArt(units[k])}<b>${crate.shards[k] ?? 0}</b> ${esc(units[k].name)} shards</span>`).join('')+'</div>' : ''}`;

    const icon = items.length === 1 ? `<span class="cq-fi ${featStatusTone(items[0].feat)} ${featEmblem(items[0].feat)} portrait" aria-hidden="true"><img src="${esc(featArt(items[0].feat))}" alt=""></span>` : '';
    /* Plan/Skip lives in the heading so it sits in a fixed spot above the
       variable-length reward tiles instead of orphaned below them. */
    const headAction = (item) => editable
      ? '<button type="button" class="cq-plan-toggle" data-review-feat="'+esc(item.feat.id)+'" aria-pressed="'+item.picked+'">'+(item.picked ? 'Skip feat' : 'Plan feat')+'</button>' : '';
    if(items.length === 1 && editable){
      const item = items[0];
      return `<div class="cq-preview-heading">${icon}<h2 id="${titleId}">${esc(title)}</h2>${headAction(item)}</div><article class="cq-preview-feat"><div class="cq-preview-meta"><span><b class="cq-sector-badge">${esc(item.group)}</b><span class="cq-hover-kc">${sprite('keycard','cq-kc','Keycards')}${item.keycards ? item.keycards+(item.keycards === 1 ? ' keycard' : ' keycards') : 'Bonus'}</span></span><strong class="${item.picked ? 'planned' : 'skipped'}">${item.picked ? 'Planned' : 'Skipped'}</strong></div><p>${esc(featDesc(item.feat,difficulty).replace(/\s*\(Complete the .*?\)\s*$/i,''))}</p>${relatedMarkup(item.feat)}</article>`;
    }
    return `<div class="cq-preview-heading">${icon}<h2 id="${titleId}">${esc(title)}</h2></div>${items.map(item=>`<article class="cq-preview-feat"><div class="cq-preview-meta"><span><b class="cq-sector-badge">${esc(item.group)}</b><span class="cq-hover-kc">${sprite('keycard','cq-kc','Keycards')}${item.keycards ? item.keycards+(item.keycards === 1 ? ' keycard' : ' keycards') : 'Bonus'}</span></span><strong class="${item.picked ? 'planned' : 'skipped'}">${item.picked ? 'Planned' : 'Skipped'}</strong></div>${items.length > 1 ? '<h3>'+esc(item.feat.title)+'</h3>' : ''}<p>${esc(featDesc(item.feat,difficulty).replace(/\s*\(Complete the .*?\)\s*$/i,''))}</p>${relatedMarkup(item.feat)}${editable ? '<button type="button" class="cq-plan-toggle" data-review-feat="'+esc(item.feat.id)+'" aria-pressed="'+item.picked+'">'+(item.picked ? 'Skip feat' : 'Plan feat')+'</button>' : ''}</article>`).join('')}`;
  }
  /* Hover is a quick-scan card: same reward tiles as the skipped-feat
     list (icon + name, non-interactive), no nav buttons or gate notes. */
  function hoverRewardTile(reward, caption, fromName = null){
    const r = featReward(reward); if(!r) return '';
    return `<div class="cq-linked-reward ${fromName ? 'uses-reward' : 'grants-reward'}"><img class="cq-${r.type}-icon" src="${withAssetV(r.art)}" alt=""><span><small>${esc(caption)}</small><strong>${esc(r.name)}</strong></span><span class="cq-related-name">${fromName ? 'From '+esc(fromName) : esc(r.kind)}</span></div>`;
  }
  function hoverMarkup(detail){
    if(detail.crate){
      const found = detail.crate;
      return `<div class="cq-preview-heading"><img class="cq-crate" src="${crateArt(found.name)}" alt=""><h2>${esc(detail.title)}</h2></div><p class="cq-hover-threshold">${found.at} keycards</p>${found.shards ? '<div class="cq-report-payout cq-hover-payout">'+['primary','secondary'].filter(k=>units[k]).map(k=>`<span>${shardArt(units[k])}<b>${found.shards[k] ?? 0}</b> ${esc(units[k].name)} shards</span>`).join('')+'</div>' : ''}`;
    }
    const item = detail.items[0]; if(!item) return '';
    const tiles = (item.feat.reward ? hoverRewardTile(item.feat.reward, 'Also earns') : '')
      + (item.source?.reward ? hoverRewardTile(item.source.reward, 'Requires', item.source.title) : '');
    return `<div class="cq-preview-heading"><span class="cq-fi ${featStatusTone(item.feat)} ${featEmblem(item.feat)} portrait" aria-hidden="true"><img src="${esc(featArt(item.feat))}" alt=""></span><h2>${esc(item.feat.title)}</h2></div><div class="cq-preview-meta"><span><b class="cq-sector-badge">${esc(item.group)}</b><span class="cq-hover-kc">${sprite('keycard','cq-kc','Keycards')}${item.keycards ? item.keycards+(item.keycards === 1 ? ' keycard' : ' keycards') : 'Bonus'}</span></span><strong class="${item.picked ? 'planned' : 'skipped'}">${item.picked ? 'Planned' : 'Skipped'}</strong></div><p class="cq-hover-desc">${esc(featDesc(item.feat,difficulty).replace(/\s*\(Complete the .*?\)\s*$/i,''))}</p>${tiles}<p class="cq-hover-hint">${item.picked ? 'Right-click to remove from plan' : 'Right-click to add to plan'} · Click for details</p>`;
  }
  function previewChart(kind,id,position = null){
    const detail = chartPreview(kind,id); if(!detail) return;
    previewState = {kind,id};
    const existing = app.querySelector('.cq-chart-dialog').open;
    if(!existing) previewScroll = position || {top:window.scrollY,left:window.scrollX,behavior:'instant'};
    document.documentElement.classList.add('cq-modal-open'); document.body.classList.add('cq-modal-open');
    const dialog = app.querySelector('.cq-chart-dialog');
    app.querySelector('[data-cq="chart-tooltip"]').hidden = true;
    setWheelHover(null);
    dialog.querySelector('[data-cq="chart-preview"]').innerHTML = previewMarkup(detail,'cqChartTitle',true);
    if(typeof dialog.showModal === 'function'){ if(!dialog.open) dialog.showModal(); } else dialog.setAttribute('open','');
    dialog.querySelector('[data-chart-close]').focus({preventScroll:true});
    if(previewScroll) window.scrollTo?.(previewScroll);
  }
  function unlockChart(){
    document.documentElement.classList.remove('cq-modal-open'); document.body.classList.remove('cq-modal-open');
    if(previewScroll) window.scrollTo?.(previewScroll);
  }
  function closeChart(){
    const dialog = app.querySelector('.cq-chart-dialog');
    if(typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
    unlockChart();
  }
  app.querySelector('.cq-chart-dialog').onclose = unlockChart;
  /* Hovering a feat spotlights its branch the way the category filter
     does: other sections dim, the hovered feat gets extra emphasis.
     Skipped when a filter is already active (it owns the dimming). */
  function setWheelHover(el){
    const wheel = app.querySelector('[data-cq="wheel"]');
    if(!wheel) return;
    wheel.classList.remove('hovering');
    wheel.querySelectorAll('.hover-branch').forEach(b => b.classList.remove('hover-branch'));
    wheel.querySelectorAll('.cq-map-feat.hover').forEach(f => f.classList.remove('hover'));
    if(!el) return;
    const feat = el.closest ? (el.closest('[data-map-feat]') || el) : el;
    feat.classList.add('hover');
    if(coverageActive !== 'all') return;
    const branch = feat.closest ? feat.closest('.cq-map-branch') : null;
    const cat = el.closest ? el.closest('[data-map-category]') : null;
    const target = branch || (cat ? cat.closest('.cq-map-branch') : null);
    if(!target) return;
    wheel.classList.add('hovering');
    target.classList.add('hover-branch');
  }
  app.onpointerover = event=>{
    if(event.pointerType === 'touch' || app.querySelector('.cq-chart-dialog').open) return;
    const segment = event.target.closest('[data-map-feat],[data-map-category],[data-report-crate]'); if(!segment) return;
    setWheelHover(segment.closest('[data-map-feat],[data-map-category]'));
    const detail = chartPreview((segment.dataset.reportCrate) ? 'crate' : segment.dataset.mapFeat ? 'feat' : 'category',segment.dataset.reportCrate || segment.dataset.mapFeat || segment.dataset.mapCategory); if(!detail) return;
    const tooltip = app.querySelector('[data-cq="chart-tooltip"]');
    tooltip.innerHTML = (detail.crate || detail.items.length === 1) ? hoverMarkup(detail) : `<h2>${esc(detail.title)}</h2><p>${detail.items.filter(item=>!item.picked).length} / ${detail.items.length} feats skipped · ${detail.items.filter(item=>!item.picked).reduce((n,item)=>n+item.keycards,0)} keycards</p>`;
    tooltip.hidden = false; positionTooltip(event);
  };
  app.onpointermove = event=>{ if(!app.querySelector('[data-cq="chart-tooltip"]').hidden) positionTooltip(event); };
  app.onpointerout = event=>{
    if(event.target.closest('[data-map-feat],[data-map-category],[data-report-crate]')){ app.querySelector('[data-cq="chart-tooltip"]').hidden = true; setWheelHover(null); }
  };
  app.onfocusin = event=>{
    const segment = event.target.closest ? event.target.closest('[data-map-feat],[data-map-category]') : null;
    if(segment) setWheelHover(segment);
  };
  app.onfocusout = () => setWheelHover(null);
  function positionTooltip(event){
    const tooltip = app.querySelector('[data-cq="chart-tooltip"]'), rect = tooltip.getBoundingClientRect();
    tooltip.style.left = Math.max(12,Math.min(event.clientX+16,window.innerWidth-rect.width-12))+'px';
    tooltip.style.top = Math.max(12,Math.min(event.clientY+16,window.innerHeight-rect.height-12))+'px';
  }
  app.onkeydown = event=>{
    const segment = event.target.closest('[data-map-feat],[data-map-category]');
    if(segment && ['Enter',' '].includes(event.key)){
      event.preventDefault(); segment.dispatchEvent(new MouseEvent('click',{bubbles:true})); return;
    }
  };
  if(app._cqRO && app._cqRO.disconnect) app._cqRO.disconnect();
  if(app._cqResize && typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('resize', app._cqResize);
  app._cqResize = () => syncSkipsHeight();
  if(typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', app._cqResize);
  if(typeof ResizeObserver !== 'undefined'){
    const coverageEl = app.querySelector('.cq-coverage');
    if(coverageEl){ app._cqRO = new ResizeObserver(() => syncSkipsHeight()); app._cqRO.observe(coverageEl); }
  }
  paint();
  paintConquestTiming(app,entry,nowMs);
}

/* URL writes are cheap for this small plan. Keep each edit synchronous so a
   reset, a second edit and Copy link can never serialize an old snapshot. */
function syncHash(entry,picked,stars,target,difficulty,tab,view = 'planner'){
  if(typeof location !== 'undefined' && location.href) writeHash(entry,picked,stars,target,difficulty,tab,view);
}

function writeHash(entry, picked, stars, target, difficulty, tab, view = 'planner'){
  const payload = { c: entry.id, d: difficulty, s: stars, t: target, g: tab, f: [...picked].sort() };
  if(view === 'coverage') payload.v = view;
  const next = '#p=' + b64urlEncode(JSON.stringify(payload));
  if(location.hash === next) return;
  try { history.replaceState(null, '', location.pathname + location.search + next); } catch(e) { /* file:// */ }
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
