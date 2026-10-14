import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
const source=fs.readFileSync(new URL('../assets/js/conquest.js',import.meta.url),'utf8');
const original=JSON.parse(fs.readFileSync(new URL('../assets/data/conquest-planner.json',import.meta.url),'utf8'));
async function fixture(data=structuredClone(original)){
  let now=Date.parse('2026-10-12T17:59:00Z'),tick;
  const dom=new JSDOM('<div id="cqApp"></div>',{url:'https://example.test/conquest/',runScripts:'outside-only'}),w=dom.window;
  Object.defineProperty(w.document,'readyState',{value:'complete'});
  Object.defineProperty(w.document,'hidden',{value:false});
  w.Date.now=()=>now;w.stdHour=()=>18;w.scrollTo=()=>{};
  w.setInterval=(fn,ms)=>{assert.equal(ms,60000);tick=fn;return 1;};w.clearInterval=()=>{};
  w.fetch=async()=>({ok:true,json:async()=>data});
  w.eval(source);await new Promise(resolve=>setTimeout(resolve,0));
  const app=w.document.getElementById('cqApp');
  return{dom,w,app,clock:key=>app.querySelector(`[data-clock="${key}"]`).textContent,
    advance:(date,resume=false)=>{now=Date.parse(date);if(resume)w.document.dispatchEvent(new w.Event('visibilitychange'));else tick();}};
}
test('an open page rolls from active to break and back without resetting a plan',async()=>{
  const data=structuredClone(original);
  data.conquests[0].difficulties.normal=structuredClone(data.conquests[0].difficulties.hard);
  const h=await fixture(data);try{
    assert.equal(h.clock('day'),'14');assert.equal(h.clock('remaining'),'1h');
    const input=h.app.querySelector('[data-missed-input]');input.value='12';input.dispatchEvent(new h.w.Event('input',{bubbles:true}));
    h.app.querySelector('[data-map-feat="hot"]').dispatchEvent(new h.w.MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}));
    const saved=h.w.localStorage.getItem('swgoh-cq-plan'),hash=h.w.location.hash;
    h.advance('2026-10-12T18:00:00Z');
    assert.equal(h.clock('label'),'Starts in');assert.equal(h.clock('remaining'),'14d 0h');assert.equal(h.clock('day'),'0');assert.equal(h.clock('run'),'2 of 3');
    assert.match(h.clock('boundary'),/26 Oct 2026 at 18:00 UTC/);
    h.advance('2026-10-26T18:00:00Z',true);
    assert.equal(h.clock('label'),'Time remaining');assert.equal(h.clock('remaining'),'14d 0h');assert.equal(h.clock('day'),'1');
    assert.match(h.clock('boundary'),/9 Nov 2026 at 18:00 UTC/);
    assert.equal(h.w.localStorage.getItem('swgoh-cq-plan'),saved);assert.equal(h.w.location.hash,hash);assert.equal(input.value,'12');
    h.app.querySelector('[data-diff="normal"]').click();
    assert.equal(h.clock('day'),'1');assert.equal(h.clock('label'),'Time remaining');
  }finally{h.dom.window.close();}
});
test('a new volume keeps the schedule running and marks the older feat sheet',async()=>{
  const h=await fixture();try{
    h.advance('2026-12-21T18:00:00Z');assert.equal(h.clock('volume'),'26');assert.equal(h.clock('run'),'1 of 3');
    assert.equal(h.clock('primary'),'Awaiting updated data');
    const notice=h.app.querySelector('[data-cq="notice"]');assert.equal(notice.hidden,false);assert.match(notice.textContent,/Volume 26.*Volume 25/);
  }finally{h.dom.window.close();}
});
test('known next-run data is selected automatically and existing run plans remain stored',async()=>{
  const data=structuredClone(original),next=structuredClone(data.conquests[0]);
  next.id='cq-2026-10-26-c2';next.starts='2026-10-26';next.ends='2026-11-09';next.run=2;data.conquests.push(next);
  const h=await fixture(data);try{
    const input=h.app.querySelector('[data-missed-input]');input.value='8';input.dispatchEvent(new h.w.Event('input',{bubbles:true}));
    const before=JSON.parse(h.w.localStorage.getItem('swgoh-cq-plan')).plans[data.conquests[0].id];
    h.advance('2026-10-12T18:00:00Z');assert.equal(h.clock('run'),'2 of 3');
    const link=JSON.parse(h.w.atob(h.w.location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/')));assert.equal(link.c,next.id);
    assert.deepEqual(JSON.parse(h.w.localStorage.getItem('swgoh-cq-plan')).plans[data.conquests[0].id],before);
  }finally{h.dom.window.close();}
});
