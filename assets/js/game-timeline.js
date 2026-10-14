import { cadence, periodLabel, releaseDay } from './timeline-model.js';
const $ = id => document.getElementById(id);
const node = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const fmt = n => n.toFixed(2);
let data;
function selectedPeriods() { return data.periods.filter(p => $('year').value === 'all' || String(p.year) === $('year').value); }
const names = {marquee:'Marquees', conquest:'Conquest', journey:'Journey Guide'};
const colors = {marquee:'#56b8ad', conquest:'#aa99f0', journey:'#e0a552'};
function groupsFor(periods) {
  const mode=$('group').value;
  if(mode==='period') return periods.map(p=>({label:periodLabel(p),short:p.era?p.label:p.label.slice(0,3),periods:[p]}));
  const groups=new Map();
  for(const p of periods){
    if(mode==='era' && !p.era) continue;
    const key=mode==='year'?String(p.year):p.era;
    if(!groups.has(key))groups.set(key,{label:key,short:key.replace(/^Era of /,''),periods:[]});
    groups.get(key).periods.push(p);
  }
  return [...groups.values()];
}
function drawAnalysis() {
  const periods=selectedPeriods(), groups=groupsFor(periods), metric=$('metric').value;
  const tracks=[...document.querySelectorAll('[data-series][aria-pressed="true"]')].map(e=>e.dataset.series);
  const chart=$('chart');chart.replaceChildren();$('graph-detail').replaceChildren();
  if(!groups.length){chart.append(node('p','graph-empty','No eras in this year. Choose months & episodes to see its releases.'));return;}
  if(!tracks.length){chart.append(node('p','graph-empty','Select a release type to show it on the graph.'));return;}
  const values=groups.map(g=>Object.fromEntries(tracks.map(t=>[t,cadence(data,g.periods,t)])));
  const max=Math.max(3,...values.flatMap(v=>tracks.map(t=>v[t][metric])));
  const step=max>12?Math.ceil(max/6):max>6?2:1, ymax=Math.ceil(max/step)*step;
  const W=1080,H=390,left=66,right=25,top=30,bottom=70,pw=W-left-right,ph=H-top-bottom;
  const x=i=>left+(groups.length===1?pw/2:i*pw/(groups.length-1));
  const y=v=>top+ph*(1-v/ymax);
  const svgNode=(tag,attrs={},text)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;};
  const svg=svgNode('svg',{viewBox:`0 0 ${W} ${H}`,class:'release-graph',role:'group','aria-label':`${metric==='rate'?'Units per 28 days':'Unit count'} by ${$('group').selectedOptions[0].textContent.toLowerCase()}`});
  const ylabel=metric==='rate'?'Units per 28 days':'Unit count';
  svg.append(svgNode('text',{x:left,y:15,class:'axis-title'},ylabel));
  for(let v=0;v<=ymax;v+=step){svg.append(svgNode('line',{x1:left,x2:W-right,y1:y(v),y2:y(v),class:'graph-grid'}),svgNode('text',{x:left-12,y:y(v)+5,'text-anchor':'end',class:'axis-tick'},String(v)));}
  svg.append(svgNode('line',{x1:left,x2:W-right,y1:y(0),y2:y(0),class:'graph-axis'}));
  let ticks=[];
  if($('group').value==='period' && $('year').value==='all'){
    for(const year of [...new Set(periods.map(p=>p.year))]){const first=groups.findIndex(g=>g.periods[0].year===year),last=groups.findLastIndex(g=>g.periods[0].year===year);ticks.push({index:(first+last)/2,label:String(year)});if(first>0)svg.append(svgNode('line',{x1:x(first-.5),x2:x(first-.5),y1:top,y2:y(0),class:'year-divider'}));}
  }else{
    const every=Math.max(1,Math.ceil(groups.length/9));ticks=groups.map((g,i)=>({index:i,label:$('group').value==='period'?(g.periods[0].era?`${g.periods[0].era.replace(/^Era of /,'')} E${g.periods[0].label.replace('Episode ','')}`:g.short):g.short})).filter((g,i)=>i%every===0||i===groups.length-1);
  }
  for(const tick of ticks){let label=tick.label;if(label.length>23)label=label.slice(0,21)+'…';svg.append(svgNode('text',{x:x(tick.index),y:H-bottom+25,'text-anchor':'middle',class:'axis-tick'},label));}
  svg.append(svgNode('text',{x:left+pw/2,y:H-10,'text-anchor':'middle',class:'axis-title'},$('group').value==='period'?'Month / 28-day episode':$('group').value==='year'?'Year':'Era'));
  const indicator=svgNode('line',{y1:top,y2:y(0),class:'graph-indicator',visibility:'hidden'});
  svg.append(indicator);
  for(const t of tracks){
    svg.append(svgNode('polyline',{points:values.map((v,i)=>`${x(i)},${y(v[t][metric])}`).join(' '),fill:'none',stroke:colors[t],'stroke-width':2.5,'stroke-linejoin':'round','stroke-linecap':'round'}));
    values.forEach((v,i)=>svg.append(svgNode('circle',{cx:x(i),cy:y(v[t][metric]),r:groups.length>35?2.8:4,fill:colors[t],stroke:'var(--void1)','stroke-width':1.5})));
  }
  function show(i){
    indicator.setAttribute('x1',x(i));indicator.setAttribute('x2',x(i));indicator.setAttribute('visibility','visible');
    const g=groups[i],detail=$('graph-detail');detail.replaceChildren(node('strong','detail-period',g.label));
    for(const t of tracks){const a=values[i][t],row=node('div','detail-series');const key=node('span',`series-key ${t}`);row.append(key,node('span','',`${names[t]}: ${a.count} units · ${fmt(a.rate)} per 28 days`));detail.append(row);}
    const unitNames=data.entries.filter(e=>tracks.includes(e.track)&&g.periods.some(p=>p.id===e.periods[0])).map(e=>e.name);
    detail.append(node('span','detail-units',unitNames.join(' · ')||'No releases recorded'));
  }
  for(let i=0;i<groups.length;i++){
    const width=groups.length===1?pw:pw/(groups.length-1);
    const hit=svgNode('rect',{x:Math.max(left,x(i)-width/2),y:top,width:Math.min(width,W-right-Math.max(left,x(i)-width/2)),height:ph,fill:'transparent',tabindex:0,role:'button','aria-label':`${groups[i].label}: ${tracks.map(t=>`${names[t]} ${metric==='rate'?fmt(values[i][t].rate):values[i][t].count}`).join(', ')}`});
    hit.addEventListener('mouseenter',()=>show(i));hit.addEventListener('focus',()=>show(i));hit.addEventListener('click',()=>show(i));hit.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show(i);}});svg.append(hit);
  }
  chart.append(svg);show(groups.length-1);
}
function drawArchive() {
  const q = $('search').value.trim().toLocaleLowerCase();
  const periods = selectedPeriods();
  const allowed = new Set(periods.map(p => p.id));
  const matches = data.entries.filter(e => e.periods.some(id => allowed.has(id)) && (!q || `${e.name} ${e.periods.map(id => periodLabel(data.periods[id])).join(' ')}`.toLocaleLowerCase().includes(q)));
  $('result-count').textContent = `(${matches.length})`;
  const archive = $('archive'); archive.replaceChildren();
  if (!matches.length && q) {archive.append(node('p', 'empty', 'No matching entries. Try another name or reset the filters.')); return;}
  let lastYear, lastEra, grid;
  for (const p of periods) {
    const entries = matches.filter(e => e.periods.find(id => allowed.has(id)) === p.id);
    if (q && !entries.length) continue;
    if (p.year !== lastYear) {
      archive.append(node('h3', 'year-heading', String(p.year))); lastYear=p.year; lastEra=undefined;
      const table=node('table','gt-timeline');table.append(node('caption','sr-only',`Unit releases in ${p.year}`));
      const head=node('thead'),tr=node('tr');for(const name of ['Period','Marquees','Conquest','Journey Guide']){const th=node('th','',name);th.scope='col';tr.append(th);}head.append(tr);table.append(head);
      grid=node('tbody');table.append(grid);archive.append(table);
    }
    if(p.era && p.era!==lastEra){const er=node('tr','era-row'),td=node('th');td.colSpan=4;td.scope='rowgroup';const eps=data.periods.filter(x=>x.era===p.era);td.textContent=`${p.era} · ${eps.length} episodes / ${eps.length*28} days`;er.append(td);grid.append(er);}
    lastEra=p.era;
    const card=node('tr','period-row');card.id=`period-${p.id}`;card.tabIndex=-1;
    const heading=node('th','period-heading');heading.scope='row';heading.append(node('strong','',p.label),node('span','',`${p.days} days`));card.append(heading);
    for(const [track,label] of [['marquee','Marquees'],['conquest','Conquest'],['journey','Journey Guide']]){
      const cell=node('td',`release-cell ${track}`);cell.dataset.label=label;
      const list=entries.filter(e=>e.track===track).sort((a,b)=>a.sourceRow-b.sourceRow);
      if(!list.length)cell.append(node('span','empty','—'));
      for(const e of list){
        const item=node('div','release');item.append(node('strong','unit-name',e.name));
        const start=data.periods[e.periods[0]],end=data.periods[e.periods.at(-1)];
        if(e.periods.length>1)item.append(node('span','span-note',`${periodLabel(start)} → ${periodLabel(end)}`));
        const day=releaseDay(e,start);if(day)item.append(node('span','day-label',`Day ${day}`));
        if(e.units>1)item.append(node('span','day-label',`${e.units} units`));
        cell.append(item);
      }
      card.append(cell);
    }
    grid.append(card);
  }
}
try {
  const response = await fetch('/assets/data/game-timeline.json'); if (!response.ok) throw new Error('Timeline data unavailable'); data = await response.json();
  [...new Set(data.periods.map(p => p.year))].forEach(year => {const o = node('option','',String(year)); o.value=String(year); $('year').append(o);});
  $('year').addEventListener('change', () => {drawAnalysis();drawArchive();});
  $('group').addEventListener('change',drawAnalysis); $('metric').addEventListener('change',drawAnalysis);
  document.querySelectorAll('[data-series]').forEach(button=>button.addEventListener('click',()=>{button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));drawAnalysis();}));
  $('search').addEventListener('input',drawArchive);
  $('reset').addEventListener('click', () => {$('search').value='';drawArchive();});
  drawAnalysis(); drawArchive();
} catch(error) { $('archive').replaceChildren(node('p','empty','The timeline could not load. Please refresh or download the release data.')); console.error(error); }
