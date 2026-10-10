import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../assets/js/conquest.js',import.meta.url),'utf8');
const data = JSON.parse(fs.readFileSync(new URL('../assets/data/conquest-planner.json',import.meta.url),'utf8'));
function setup({shared=null, stored=null, blocked=false, entry=data.conquests[0], now=Date.parse('2026-10-10T12:00:00Z')}={}){
  const dom = new JSDOM('<div id="fixture"></div>',{url:'https://example.test/conquest/',runScripts:'outside-only'});
  const w=dom.window;
  w.scrollTo=()=>{};
  if(stored) w.localStorage.setItem('swgoh-cq-plan',JSON.stringify({plans:{[entry.id]:stored}}));
  if(blocked) Object.defineProperty(w,'localStorage',{get(){throw Error('blocked');}});
  w.eval(source);
  const app=w.document.getElementById('fixture');
  w.renderPlanner(app,{entry,state:'active'},now,shared);
  const get = selector => { const el=app.querySelector(selector); assert.ok(el,selector); return el; };
  const click = selector => get(selector).dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  const rightClick = selector => { const event=new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}); get(selector).dispatchEvent(event); return event; };
  const change = (value,type='change') => { const input=get('[data-missed-input]'); input.value=value; input.dispatchEvent(new w.Event(type,{bubbles:true})); };
  const total = () => Number(get('[data-cq="total"]').textContent);
  const plan = () => JSON.parse(w.atob(w.location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/')));
  return {dom,w,app,get,click,rightClick,change,total,plan};
}
function use(t,options){ const h=setup(options); t.after(()=>h.dom.window.close()); return h; }

test('all legacy view links preserve selections in the sole diagram planner',t=>{
  for(const v of [undefined,'planner','coverage']){
    const h=use(t,{shared:{v,f:['hot'],s:330,t:'Reward Crate Tier 7',g:'Sector 2'}});
    assert.equal(h.total(),345); assert.equal(h.plan().v,'coverage');
    assert.equal(h.plan().g,'Sector 2'); assert.equal(h.plan().t,'Reward Crate Tier 7');
    assert.equal(h.app.querySelector('[data-view], [data-feat], [role="tablist"]'),null);
    assert.equal(h.get('#cqCoverageView').hidden,false);
    assert.equal(h.app.querySelectorAll('h1').length,1);
  }
});
test('reset then right click and type keeps total, storage and share link in sync',t=>{
  const h=use(t,{shared:{s:330,f:['hot'],t:'Reward Crate Tier 7'}});
  h.click('[data-reset-plan]'); assert.equal(h.total(),330); assert.equal(h.plan().t,'Reward Crate Tier 7');
  h.rightClick('[data-map-feat="stun"]'); assert.equal(h.total(),335);
  h.change('10'); assert.equal(h.total(),325);
  h.rightClick('[data-map-feat="stun"]'); assert.equal(h.total(),320);
  assert.deepEqual(h.plan().f,[]);
  const saved=JSON.parse(h.w.localStorage.getItem('swgoh-cq-plan')).plans[data.conquests[0].id];
  assert.equal(saved.stars,320); assert.deepEqual(saved.feats,[]);
});
test('rapid edits copy the complete current plan and round trip',async t=>{
  const h=use(t); let copied;
  Object.defineProperty(h.w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
  h.rightClick('[data-map-feat="hot"]'); h.change('130');
  h.rightClick('[data-report-crate="Reward Crate Tier 7"]');
  h.rightClick('[data-map-feat="dot300"]'); h.click('[data-copy-link]'); await Promise.resolve();
  assert.equal(copied,h.w.location.href); assert.equal(h.total(),220);
  const loaded=use(t,{shared:h.plan()}); assert.equal(loaded.total(),220);
  assert.equal(loaded.plan().t,'Reward Crate Tier 7');
});
test('unavailable storage and clipboard retain a copyable plan',async t=>{
  const h=use(t,{blocked:true});
  h.rightClick('[data-map-feat="hot"]'); h.click('[data-copy-link]'); await Promise.resolve();
  assert.match(h.get('[data-cq="save-note"]').textContent,/storage unavailable/);
  assert.equal(h.get('.cq-copy-fallback').value,h.w.location.href);
  assert.deepEqual(h.plan().f,['hot']);
});
test('invalid incoming selections and battle keycards are bounded',t=>{
  const h=use(t,{shared:{f:['hot','missing','hot'],s:999,t:'bogus'}});
  assert.equal(h.total(),345); assert.deepEqual(h.plan().f,['hot']); assert.equal(h.plan().t,null);
  h.change('-12'); assert.equal(h.plan().s,330); assert.equal(h.get('[data-missed-input]').value,'0');
  h.change('999'); assert.equal(h.plan().s,0); assert.equal(h.get('[data-missed-input]').value,'330');
  h.change('2.9'); assert.equal(h.plan().s,328); assert.equal(h.get('[data-missed-input]').value,'2');
});
test('typing preserves the input node and typed value until normalization',t=>{
  const h=use(t); const input=h.get('[data-missed-input]');
  h.change('2.9','input'); assert.equal(h.plan().s,328); assert.equal(input.value,'2.9');
  assert.equal(input,h.get('[data-missed-input]')); h.change('2.9');
  assert.equal(input.value,'2'); assert.equal(h.get('[data-cq="battle-keycards"]').textContent,'328 / 330');
});
test('left click opens details only; modal action plans and skips',t=>{
  const h=use(t); h.click('[data-map-feat="hot"]');
  assert.equal(h.total(),330); assert.equal(h.get('.cq-chart-dialog').open,true);
  h.click('[data-review-feat="hot"]'); assert.equal(h.total(),345);
  assert.match(h.get('[data-cq="chart-preview"]').textContent,/Planned/);
  h.click('[data-review-feat="hot"]'); assert.equal(h.total(),330);
});
test('right click toggles once without opening details or scrolling',t=>{
  const h=use(t); let position;
  h.w.scrollTo=value=>{position=value;}; Object.defineProperty(h.w,'scrollY',{value:240});
  assert.equal(h.rightClick('[data-map-feat="hot"]').defaultPrevented,true);
  assert.equal(h.total(),345); assert.equal(h.get('.cq-chart-dialog').open,false);
  assert.equal(position.top,240); h.rightClick('[data-map-feat="hot"]'); assert.equal(h.total(),330);
});
test('touch long-press never toggles the plan; tap opens details only',t=>{
  const h=use(t);
  h.get('[data-map-feat="hot"]').dispatchEvent(new h.w.Event('touchstart',{bubbles:true}));
  assert.equal(h.rightClick('[data-map-feat="hot"]').defaultPrevented,true);
  assert.equal(h.total(),330); assert.deepEqual(h.plan().f,[]);
  assert.equal(h.get('.cq-chart-dialog').open,false);
  h.click('[data-map-feat="hot"]'); assert.equal(h.get('.cq-chart-dialog').open,true);
  assert.equal(h.total(),330);
});
test('skipped-list toggle plans instantly with undo; title still opens details',t=>{
  const h=use(t);
  assert.equal(h.total(),330);
  h.click('[data-plan-feat="hot"]');
  assert.equal(h.total(),345); assert.deepEqual(h.plan().f,['hot']);
  assert.equal(h.app.querySelector('[data-plan-feat="hot"]'),null);
  assert.match(h.get('[data-cq="feedback"]').textContent,/planned/);
  const saved=JSON.parse(h.w.localStorage.getItem('swgoh-cq-plan')).plans[data.conquests[0].id];
  assert.deepEqual(saved.feats,['hot']);
  h.click('[data-undo-plan]');
  assert.equal(h.total(),330); assert.deepEqual(h.plan().f,[]);
  assert.ok(h.get('[data-plan-feat="hot"]'));
  h.click('.cq-skipped-feat [data-preview-feat="stun"]');
  assert.equal(h.get('.cq-chart-dialog').open,true); assert.equal(h.total(),330);
});
test('keyboard opens details and preserves the same planning behavior',t=>{
  const h=use(t);
  h.get('[data-map-feat="stun"]').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  assert.equal(h.get('.cq-chart-dialog').open,true); assert.equal(h.total(),330);
  h.click('[data-review-feat="stun"]'); assert.equal(h.total(),335);
});
test('crate left click previews, right click sets target, modal can clear it',t=>{
  const h=use(t); const selector='[data-report-crate="Reward Crate Tier 7"]';
  h.click(selector); assert.equal(h.plan().t,'Reward Crate Tier 7'); h.click('[data-chart-close]');
  h.rightClick(selector); assert.equal(h.plan().t,'Reward Crate Tier 7');
  assert.equal(h.get('.cq-chart-dialog').open,false);
  h.click(selector); h.click('[data-preview-target]'); assert.equal(h.plan().t,null);
});
test('top crate is the default target for new and reset plans',t=>{
  const h=use(t);
  assert.equal(h.plan().t,'Reward Crate Tier 7');
  h.rightClick('[data-report-crate="Reward Crate Tier 1"]');
  assert.equal(h.plan().t,'Reward Crate Tier 1');
  h.click('[data-reset-plan]');
  assert.equal(h.plan().t,'Reward Crate Tier 7');
});
test('hover gives custom details, touch uses the modal, crate hover stays concise',t=>{
  const h=use(t);
  h.get('[data-map-feat="hot"]').dispatchEvent(new h.w.MouseEvent('pointerover',{bubbles:true}));
  assert.equal(h.get('[data-cq="chart-tooltip"]').hidden,false);
  assert.match(h.get('[data-cq="chart-tooltip"]').textContent,/Global feats/);
  h.get('[data-map-feat="hot"]').dispatchEvent(new h.w.MouseEvent('pointerout',{bubbles:true}));
  const event=new h.w.MouseEvent('pointerover',{bubbles:true}); Object.defineProperty(event,'pointerType',{value:'touch'});
  h.get('[data-map-feat="hot"]').dispatchEvent(event); assert.equal(h.get('[data-cq="chart-tooltip"]').hidden,true);
  h.click('[data-map-feat="hot"]'); assert.equal(h.get('.cq-chart-dialog').open,true); h.click('[data-chart-close]');
  h.get('[data-report-crate="Reward Crate Tier 7"]').dispatchEvent(new h.w.MouseEvent('pointerover',{bubbles:true}));
  const tip=h.get('[data-cq="chart-tooltip"]'); assert.match(tip.textContent,/shards/);
  assert.equal(tip.querySelector('button'),null); assert.doesNotMatch(tip.textContent,/keycards away|Reached/);
});
test('modal locks background scrolling and backdrop closes it without inside clicks doing so',t=>{
  const h=use(t); h.click('[data-map-feat="hot"]');
  assert.ok(h.w.document.body.classList.contains('cq-modal-open'));
  h.get('#cqChartTitle').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));
  assert.equal(h.get('.cq-chart-dialog').open,true);
  h.get('.cq-chart-dialog').dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,clientX:500,clientY:500}));
  assert.equal(h.get('.cq-chart-dialog').open,false);
  assert.equal(h.w.document.body.classList.contains('cq-modal-open'),false);
});
test('category filters neither edit the plan nor open a popup',t=>{
  const h=use(t); h.click('[data-map-category="buff"]');
  assert.equal(h.total(),330); assert.equal(h.get('.cq-chart-dialog').open,false);
  assert.ok(h.app.querySelector('.cq-map-branch.dim'));
  h.click('[data-map-category="buff"]'); assert.equal(h.app.querySelector('.cq-map-branch.dim'),null);
});
test('optional title rewards stay out of skipped totals',t=>{
  const entry=data.conquests[0]; const f=entry.difficulties.hard.groups.flatMap(g=>g.feats).filter(f=>f.keycards>0).map(f=>f.id);
  const h=use(t,{shared:{f,s:330}});
  assert.equal(h.app.querySelector('[data-map-feat="unlikely"]'),null);
  assert.equal(h.app.querySelector('[data-preview-feat="unlikely"]'),null);
  assert.equal(h.get('[data-cq="skipped-total"]').textContent,'0');
  assert.match(h.get('[data-cq="skipped-groups"]').textContent,/No feats skipped/);
});
test('curated reward gates connect the correct source and consumer',t=>{
  const h=use(t); const diff=data.conquests[0].difficulties.hard;
  const feats=diff.groups.flatMap(g=>g.feats);
  const links=h.w.featLinks(diff,feats.find(f=>f.id==='followlead'));
  assert.equal(links.source.id,'retribution');
  assert.equal(h.w.featLinks(diff,feats.find(f=>f.id==='learncontrol')).source.id,'badbaby');
  assert.equal(h.w.featLinks(diff,feats.find(f=>f.id==='retribution')).unlocks[0].id,'followlead');
  assert.ok(h.get('[data-map-feat="retribution"]').classList.contains('grants-reward'));
  assert.ok(h.get('[data-map-feat="followlead"]').classList.contains('uses-reward'));
  assert.equal(h.get('.cq-map-reward').getAttribute('width'),'14');
});
test('reward detail tiles navigate between related feats without changing selections',t=>{
  const h=use(t); h.click('[data-map-feat="followlead"]');
  const detail=h.get('[data-cq="chart-preview"]'); assert.match(detail.textContent,/Requires.*Booming Voice.*From Retribution/s);
  assert.doesNotMatch(detail.textContent,/Stand Your Ground/);
  h.click('.cq-chart-dialog [data-preview-feat="retribution"]');
  assert.match(h.get('[data-cq="chart-preview"]').textContent,/Also earns.*Booming Voice.*Makes completable/s);
  assert.equal(h.total(),330);
  h.click('.cq-chart-dialog [data-preview-feat="followlead"]'); h.click('[data-review-feat="followlead"]');
  assert.deepEqual(h.plan().f,['followlead']); // A pass can unlock the reward; don't silently select the source.
  h.click('[data-chart-close]'); h.click('[data-map-feat="learncontrol"]');
  assert.ok(h.get('.cq-chart-dialog .cq-consumable-icon').src.includes('consumable_tech'));
});
test('skipped reward cards show both keycards and a separate named reward tile',t=>{
  const h=use(t); const card=h.get('.cq-skipped-feat.grants-reward');
  assert.ok(card.querySelector('.cq-skipped-value')); assert.ok(card.querySelector('.cq-linked-reward'));
  assert.match(h.get('.cq-skipped-feat.uses-reward').textContent,/Requires/);
});
test('header gives labelled metadata, a single day count, and a compact countdown',t=>{
  const h=use(t);
  assert.deepEqual([...h.app.querySelectorAll('.cq-run-meta dt')].map(e=>e.textContent),['Volume','Run','Difficulty','Primary Unit','Secondary Unit']);
  const dds=[...h.app.querySelectorAll('.cq-run-meta dd')].map(e=>e.textContent);
  assert.ok(dds.includes('1 of 3')); assert.ok(dds.includes('Embo & Keibu')); assert.ok(dds.includes('Leia (Jedi Training)'));
  assert.equal(h.app.querySelectorAll('[data-clock="day"]').length,1);
  assert.match(h.get('[data-clock="remaining"]').textContent,/^\d+d \d+h$/);
  assert.equal(h.app.querySelector('[data-clock="progress"]'),null);
  assert.ok(h.get('.cq-guide a').href.includes('swgoh4.life/conquest/'));
});
test('preliminary warning only appears before the event starts',t=>{
  const h=use(t,{now:Date.parse('2026-09-27T12:00:00Z')});
  assert.equal(h.get('[data-cq="notice"]').hidden,false);
  h.w.paintConquestTiming(h.app,data.conquests[0],Date.parse('2026-10-10T12:00:00Z'));
  assert.equal(h.get('[data-cq="notice"]').hidden,true);
});
test('old conquest links cannot import another event plan',t=>{
  const h=use(t,{shared:{c:'old-event',s:330,f:['hot']}});
  assert.equal(h.total(),330); assert.deepEqual(h.plan().f,[]);
});
