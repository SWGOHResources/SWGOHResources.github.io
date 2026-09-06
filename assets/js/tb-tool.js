/* TB TOOL — battle select → full-page battle map → planet map →
   mission teams. Data-driven from tb-data.js (TB_TOOL_DATA). Loaded as
   a classic script, so top-level function declarations are global for
   the inline onclick handlers. */

function tbEsc(s){
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Image tag with graceful fallback: a missing asset removes itself and
   the styled placeholder underneath shows through. */
function tbImg(src, cls, alt){
  if(!src) return '';
  return `<img class="${cls}" src="${tbEsc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`;
}

/* Route: #/ (select) → #/<tb> (map) → #/<tb>/<planet>[/<mission>].
   Unknown ids fall back outward (bad mission → planet, bad planet →
   map, bad tb → select). */
function tbRoute(){
  const parts = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const all = (typeof TB_TOOL_DATA !== 'undefined' && TB_TOOL_DATA) || {};
  const tb = all[parts[0]] || null;
  const planet = (tb && tb.planets && tb.planets[parts[1]]) || null;
  const mission = (planet && planet.missions.find(m => m.id === parts[2])) || null;
  return { tb, planet, mission };
}

function tbGo(hash){
  try { location.hash = hash; } catch(e){}
  tbRender();
}

function tbOpenBattle(tbId){
  tbGo('#/' + tbId);
}

function tbOpenPlanet(tbId, planetId){
  tbGo('#/' + tbId + '/' + planetId);
}

function tbOpenMission(tbId, planetId, missionId){
  tbGo('#/' + tbId + '/' + planetId + '/' + missionId);
}

function tbTitle(base, extra){
  try { document.title = extra ? `${extra} | ${base}` : base; } catch(e){}
}

function tbRender(){
  const app = document.getElementById('tbApp');
  if(!app) return;
  const route = tbRoute();
  if(!route || !route.tb){
    tbTitle('TB Tool — Choose Your Battle | SWGOH Resources');
    const all = (typeof TB_TOOL_DATA !== 'undefined' && TB_TOOL_DATA) || {};
    const ids = Object.keys(all);
    if(!ids.length){
      app.innerHTML = '<p class="tb-empty">No battle data configured yet — see <code>assets/js/tb-data.js</code>.</p>';
      return;
    }
    app.innerHTML = `<div class="tb-select-grid">`
      + ids.map(id => tbSelectTileHTML(all[id])).join('')
      + `</div>`;
    return;
  }
  const { tb, planet } = route;
  let { mission } = route;
  if(!planet){
    tbTitle(`${tb.name} — Battle Map | SWGOH Resources`);
    app.innerHTML = tbMapHTML(tb);
    return;
  }
  if(!mission && planet.missions.length) mission = planet.missions[0];
  tbTitle(`${planet.name} — ${tb.name} | SWGOH Resources`);
  app.innerHTML = tbPlanetHTML(tb, planet, mission);
}

function tbSelectTileHTML(tb){
  return `<button type="button" class="tb-select-tile" onclick="tbOpenBattle('${tbEsc(tb.id)}')" aria-label="Open ${tbEsc(tb.name)} tool">`
    + `<span class="tb-select-art">${tbImg(tb.image, 'tb-select-img')}<span class="tb-select-badge">${tbEsc(tb.name)}</span></span>`
    + `<span class="tb-select-body"><span class="tb-select-name">${tbEsc(tb.name)}</span>`
    + (tb.description ? `<span class="tb-select-desc">${tbEsc(tb.description)}</span>` : '')
    + `</span></button>`;
}

function tbMapHTML(tb){
  const cols = (tb.map && tb.map.cols) || 3;
  const sectors = (tb.map && tb.map.sectors) || [];
  const cells = sectors.map(sec => {
    const p = sec.planet ? (tb.planets || {})[sec.planet] : null;
    const body = p
      ? `<button type="button" class="tb-planet" onclick="tbOpenPlanet('${tbEsc(tb.id)}','${tbEsc(p.id)}')" aria-label="Open ${tbEsc(p.name)}">${tbImg(p.image, 'tb-planet-img')}<span>${tbEsc(p.name)}</span></button>`
      : `<span class="tb-sector-empty">No planet</span>`;
    return `<div class="tb-sector">${tbImg(sec.background, 'tb-sector-bg')}<span class="tb-sector-name">${tbEsc(sec.name)}</span>${body}</div>`;
  }).join('');
  return `<div class="tb-crumb">`
    + `<button type="button" class="gear-btn" onclick="tbGo('#/')" aria-label="Back to battle select">← Battles</button>`
    + `<span class="tb-crumb-name">${tbEsc(tb.name)}</span></div>`
    + `<div class="tb-map-scroll"><div class="tb-map" role="group" aria-label="${tbEsc(tb.name)} map" style="grid-template-columns:repeat(${cols},1fr)">${cells}</div></div>`;
}

function tbPlanetHTML(tb, planet, mission){
  const missions = planet.missions || [];
  const placed = [], flow = [];
  missions.forEach(m => {
    const hasXY = Number.isFinite(m.x) && Number.isFinite(m.y);
    (hasXY ? placed : flow).push(m);
  });
  const nodeInner = m => `${tbImg(m.image, 'tb-mission-img')}<span>${tbEsc(m.name)}<small>${tbEsc(m.type || 'Mission')}</small></span>`;
  const nodeHTML = m => `<button type="button" class="tb-mission${mission && m.id === mission.id ? ' active' : ''}"`
    + ` style="left:${m.x}%;top:${m.y}%" onclick="tbOpenMission('${tbEsc(tb.id)}','${tbEsc(planet.id)}','${tbEsc(m.id)}')"`
    + ` aria-pressed="${mission && m.id === mission.id}">${nodeInner(m)}</button>`;
  const flowHTML = m => `<button type="button" class="tb-mission${mission && m.id === mission.id ? ' active' : ''}"`
    + ` onclick="tbOpenMission('${tbEsc(tb.id)}','${tbEsc(planet.id)}','${tbEsc(m.id)}')"`
    + ` aria-pressed="${mission && m.id === mission.id}">${nodeInner(m)}</button>`;
  return `<div class="tb-crumb">`
    + `<button type="button" class="gear-btn" onclick="tbOpenBattle('${tbEsc(tb.id)}')" aria-label="Back to battle map">← Map</button>`
    + `<button type="button" class="gear-btn" onclick="tbGo('#/')" aria-label="Back to battle select">Battles</button>`
    + `<span class="tb-crumb-name">${tbEsc(planet.name)}</span></div>`
    + (planet.briefing ? `<p class="tb-briefing">${tbEsc(planet.briefing)}</p>` : '')
    + `<div class="tb-planetmap" role="group" aria-label="${tbEsc(planet.name)} missions">${tbImg(planet.image, 'tb-planetmap-img')}<div class="tb-planetmap-disc" aria-hidden="true"></div>`
    + placed.map(nodeHTML).join('') + `</div>`
    + (flow.length ? `<div class="tb-missions-row">${flow.map(flowHTML).join('')}</div>` : '')
    + tbTeamsHTML(mission);
}

function tbTeamsHTML(mission){
  if(!mission){
    return `<div class="tb-teams"><div class="tb-teams-head"><h3>Missions</h3></div>`
      + `<p class="tb-empty">No missions on this planet yet — add them to <code>tb-data.js</code>.</p></div>`;
  }
  const teams = Array.isArray(mission.teams) ? mission.teams : [];
  const teamHTML = teams.map(t => {
    const members = Array.isArray(t.members) ? t.members.slice(0, 5) : [];
    return `<div class="tb-team"><div class="tb-team-name">${tbEsc(t.name || 'Unnamed comp')}`
      + (t.req ? `<span class="tb-req">${tbEsc(t.req)}</span>` : '') + `</div>`
      + (members.length ? `<div class="tb-members">${members.map(u => `<span class="tb-member">${tbEsc(u)}</span>`).join('')}</div>` : '')
      + (t.notes ? `<p class="tb-notes">${tbEsc(t.notes)}</p>` : '') + `</div>`;
  }).join('');
  return `<div class="tb-teams" id="tbTeams"><div class="tb-teams-head"><h3>${tbEsc(mission.name)}</h3>`
    + `<span class="tb-type">${tbEsc(mission.type || 'Mission')}</span></div>`
    + (teamHTML || `<p class="tb-empty">No recommended teams yet. SWGOH comps are 5 units — add them in <code>tb-data.js</code> as<br>`
      + `<code>{ name: 'Comp name', members: ['Leader', 'Attacker', 'Support', 'Tank', 'Flex'], req: 'Relic 7+', notes: '...' }</code></p>`)
    + `</div>`;
}

if(typeof window !== 'undefined' && typeof window.addEventListener === 'function'){
  window.addEventListener('hashchange', tbRender);
  window.addEventListener('DOMContentLoaded', tbRender);
}
