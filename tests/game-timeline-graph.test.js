import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import * as model from '../assets/js/timeline-model.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('game-timeline.html');
const source=read('assets/js/game-timeline.js').replace(/^import[^\n]+\r?\n/,'');
const data=JSON.parse(read('assets/data/game-timeline.json'));
test('timeline uses the homepage footer and shared navigation without overriding chrome colours',()=>{
  const timeline=new JSDOM(html), home=new JSDOM(read('index.html')), conquest=new JSDOM(read('conquest.html'));
  try{
    assert.equal(timeline.window.document.querySelector('footer').outerHTML,home.window.document.querySelector('footer').outerHTML);
    const links=doc=>[...doc.querySelectorAll('.topbar-tabs a')].map(a=>[a.textContent.trim(),a.getAttribute('href')]);
    assert.deepEqual(links(timeline.window.document),links(conquest.window.document));
    for(const page of [timeline,home,conquest])assert.equal(page.window.document.querySelector('a[href="/game-timeline/"]'),null);
    assert.equal(timeline.window.document.querySelector('a[href$=".pdf"]'),null);
    assert.ok(!read('assets/css/game-timeline.css').includes('.gt-shell *{'));
  }finally{timeline.window.close();home.window.close();conquest.window.close();}
});
async function fixture(){
  const dom=new JSDOM(html,{url:'https://example.test/game-timeline/',runScripts:'outside-only'}),w=dom.window;
  const errors=[];w.console.error=e=>errors.push(e);Object.assign(w,model);
  w.fetch=async()=>({ok:true,json:async()=>structuredClone(data)});
  await w.eval(`(async()=>{${source}\n})()`);
  assert.deepEqual(errors,[]);
  const change=(id,value)=>{const e=w.document.getElementById(id);e.value=value;e.dispatchEvent(new w.Event('change'));};
  return{dom,w,doc:w.document,change};
}
test('graph renders all categories against numeric axes and retains every source entry',async()=>{
  const f=await fixture();try{
    assert.equal(f.doc.querySelectorAll('.release-graph polyline').length,3);
    for(const line of f.doc.querySelectorAll('.release-graph polyline'))assert.equal(line.getAttribute('points').split(' ').length,69);
    assert.ok([...f.doc.querySelectorAll('.axis-tick')].some(e=>e.textContent==='0'));
    assert.match(f.doc.querySelector('.axis-title').textContent,/Units per 28 days/);
    assert.equal(f.doc.querySelectorAll('#archive .release').length,161);
    assert.equal(f.doc.querySelector('.gt-help'),null);assert.equal(f.doc.querySelector('#stats'),null);
  }finally{f.dom.window.close();}
});
test('year grouping uses weighted calendar durations and count measure changes plotted values',async()=>{
  const f=await fixture();try{
    f.change('group','year');
    const points=f.doc.querySelector('polyline').getAttribute('points').split(' ');
    assert.equal(points.length,6);
    assert.match(f.doc.querySelector('#graph-detail').textContent,/2026/);
    const expected=model.cadence(data,data.periods.filter(p=>p.year===2026),'marquee');
    assert.match(f.doc.querySelector('#graph-detail').textContent,new RegExp(`Marquees: ${expected.count} units`));
    f.change('metric','count');
    assert.equal(f.doc.querySelector('.axis-title').textContent,'Unit count');
    assert.notEqual(f.doc.querySelector('polyline').getAttribute('points'),points.join(' '));
  }finally{f.dom.window.close();}
});
test('series toggles and era filtering handle empty years without errors',async()=>{
  const f=await fixture();try{
    f.doc.querySelector('[data-series="conquest"]').click();assert.equal(f.doc.querySelectorAll('polyline').length,2);
    f.change('year','2021');f.change('group','era');assert.match(f.doc.querySelector('#chart').textContent,/No eras in this year/);
    f.change('year','all');assert.equal(f.doc.querySelector('polyline').getAttribute('points').split(' ').length,9);
    f.doc.querySelector('[data-series="marquee"]').click();f.doc.querySelector('[data-series="journey"]').click();assert.match(f.doc.querySelector('#chart').textContent,/Select a release type/);
  }finally{f.dom.window.close();}
});
test('search preserves repeated names and clear search restores the selected year',async()=>{
  const f=await fixture();try{
    const search=f.doc.getElementById('search');search.value='Mara Jade';search.dispatchEvent(new f.w.Event('input'));
    assert.equal(f.doc.querySelectorAll('#archive .release').length,2);
    f.change('year','2026');assert.equal(f.doc.querySelectorAll('#archive .release').length,1);
    f.doc.getElementById('reset').click();assert.equal(f.doc.getElementById('year').value,'2026');
    assert.equal(f.doc.querySelectorAll('#archive .release').length,data.entries.filter(e=>e.periods.some(id=>data.periods[id].year===2026)).length);
  }finally{f.dom.window.close();}
});
