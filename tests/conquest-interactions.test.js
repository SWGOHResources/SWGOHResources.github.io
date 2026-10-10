import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../assets/js/conquest.js',import.meta.url),'utf8');
const data = JSON.parse(fs.readFileSync(new URL('../assets/data/conquest-planner.json',import.meta.url),'utf8'));
function setup({ shared = null, stored = null, blocked = false, entry = data.conquests[0] } = {}){
  const dom = new JSDOM('<div id="fixture"></div>',{url:'https://example.test/conquest.html',runScripts:'outside-only'});
  const w = dom.window;
  if(stored) w.localStorage.setItem('swgoh-cq-plan',JSON.stringify({plans:{[entry.id]:stored}}));
  if(blocked) Object.defineProperty(w,'localStorage',{get(){throw new Error('blocked');}});
  w.eval(source);
  const app = w.document.getElementById('fixture');
  w.renderPlanner(app,{entry,state:'active'},Date.now(),shared);
  const click = selector => { const el = app.querySelector(selector); assert.ok(el,selector); el.click(); };
  const change = (selector,value) => {
    const el = app.querySelector(selector); assert.ok(el,selector);
    if(el.type === 'checkbox') el.checked = value; else el.value = value;
    el.dispatchEvent(new w.Event('change',{bubbles:true}));
  };
  const total = () => Number(app.querySelector('[data-cq="total"]').textContent);
  const plan = () => JSON.parse(w.atob(w.location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/')));
  return {dom,w,app,click,change,total,plan};
}
test('reset then change tabs, select and deselect updates total, storage and link', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  h.change('[data-feat="hot"]',true);
  h.click('[data-stars-max]'); assert.equal(h.total(),345);
  h.click('[data-reset-plan]'); assert.equal(h.total(),0); assert.equal(h.plan().t,null);
  h.click('[data-tab="Sector 1"]');
  h.change('[data-feat="stun"]',true); assert.equal(h.total(),5);
  assert.deepEqual(h.plan().f,['stun']); assert.equal(h.plan().g,'Sector 1');
  h.change('[data-feat="stun"]',false); assert.equal(h.total(),0);
  h.click('[data-tab="Global feats"]');
  h.change('[data-feat="hot"]',true); assert.equal(h.total(),15);
  const saved = JSON.parse(h.w.localStorage.getItem('swgoh-cq-plan')).plans[data.conquests[0].id];
  assert.deepEqual(saved.feats,['hot']);
});
test('rapid edits and copy serialize the latest complete plan', async t => {
  const h = setup(); t.after(()=>h.dom.window.close()); let copied;
  Object.defineProperty(h.w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
  h.click('[data-reset-plan]'); h.change('[data-feat="hot"]',true);
  h.change('[data-stars-input]','200'); h.click('[data-crate="Reward Crate Tier 7"]');
  h.click('[data-tab="Sector 2"]'); h.change('[data-feat="dot300"]',true);
  h.click('[data-copy-link]'); await Promise.resolve();
  assert.equal(copied,h.w.location.href);
  assert.equal(h.plan().s,200); assert.equal(h.plan().g,'Sector 2');
  assert.deepEqual(h.plan().f,['dot300','hot']); assert.equal(h.total(),220);
  const loaded = setup({shared:h.plan()}); t.after(()=>loaded.dom.window.close());
  assert.equal(loaded.total(),220); assert.equal(loaded.app.querySelector('[data-tab="Sector 2"]').getAttribute('aria-pressed'),'true');
});
test('select group and clear group keep other groups and rebuilt rows working', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  h.change('[data-feat="hot"]',true); h.click('[data-tab="Sector 1"]');
  h.click('[data-toggle-all]'); assert.equal(h.total(),45);
  h.click('[data-toggle-all]'); assert.equal(h.total(),15);
  h.change('[data-feat="stun"]',true); assert.equal(h.total(),20);
});
test('target gap stays visible with mobile settings collapsed and a second tap clears it', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  h.app.querySelector('.cq-settings').open = false;
  h.click('[data-crate="Reward Crate Tier 7"]');
  const target = h.app.querySelector('[data-cq="target"]');
  assert.equal(target.closest('details'),null); assert.equal(target.hidden,false);
  assert.match(target.textContent,/630 more/);
  h.click('[data-crate="Reward Crate Tier 7"]'); assert.equal(h.plan().t,null); assert.equal(target.hidden,true);
});
test('filtered replacement rows remain selectable and reset restores the list', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  h.change('[data-filter]','unselected'); h.change('[data-feat="hot"]',true);
  assert.equal(h.total(),15); assert.equal(h.app.querySelector('[data-feat="hot"]'),null);
  h.change('[data-filter]','selected'); h.change('[data-feat="hot"]',false); assert.equal(h.total(),0);
  h.click('[data-reset-plan]'); assert.equal(h.app.querySelectorAll('[data-feat]').length,9);
  h.change('[data-feat="hot"]',true); assert.equal(h.total(),15);
});
test('reset and selection work when localStorage throws', t => {
  const h = setup({blocked:true}); t.after(()=>h.dom.window.close());
  h.change('[data-feat="hot"]',true); h.click('[data-reset-plan]');
  h.change('[data-feat="evasionup"]',true); assert.equal(h.total(),15);
  assert.deepEqual(h.plan().f,['evasionup']);
  assert.match(h.app.querySelector('[data-cq="save-note"]').textContent,/unavailable/);
});
test('invalid saved values are clamped and unknown feats and targets discarded', t => {
  const h = setup({stored:{stars:9999,feats:['missing','hot','hot'],target:'missing',tab:'missing'}}); t.after(()=>h.dom.window.close());
  assert.equal(h.total(),345); assert.deepEqual(h.plan().f,['hot']); assert.equal(h.plan().t,null);
  h.change('[data-stars-input]','-5'); assert.equal(h.total(),15);
  h.change('[data-stars-input]','12.9'); assert.equal(h.total(),27);
});
test('typing stars updates totals and the shared link before blur without replacing the input', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  const input = h.app.querySelector('[data-stars-input]');
  input.value = '200'; input.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  assert.equal(h.total(),200); assert.equal(h.plan().s,200); assert.equal(input.value,'200');
  input.value = '999'; input.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  assert.equal(h.total(),330); assert.equal(input.value,'999');
  input.dispatchEvent(new h.w.Event('change',{bubbles:true})); assert.equal(input.value,'330');
});
test('shared difficulty determines its groups and math before rendering', t => {
  const entry = {...data.conquests[0],difficulties:{...data.conquests[0].difficulties,normal:{crates:[{name:'Normal crate',at:2}],groups:[{name:'Normal group',feats:[{id:'normal',title:'Normal feat',desc:'Test',keycards:2,kind:'global'}]}]}}};
  const h = setup({entry,shared:{d:'normal',s:0,f:['normal'],g:'Normal group'}}); t.after(()=>h.dom.window.close());
  assert.equal(h.total(),2); assert.equal(h.app.querySelectorAll('[data-tab]').length,1);
  assert.match(h.app.textContent,/Normal feat/);
});
test('shared plan from a different conquest cannot import obsolete selections', t => {
  const h = setup({shared:{c:'older',d:'hard',s:330,f:['hot']}}); t.after(()=>h.dom.window.close());
  assert.equal(h.total(),0); assert.equal(h.plan().c,data.conquests[0].id);
});
test('re-rendering does not accumulate handlers and title and disk rewards use atlas assets', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  h.w.renderPlanner(h.app,{entry:data.conquests[0],state:'active'},Date.now(),null);
  h.change('[data-feat="hot"]',true); assert.equal(h.total(),15);
  assert.ok(h.app.querySelector('.cq-reward img[src*="icon_questreward_title"]'));
  assert.ok(h.app.querySelector('.cq-reward img[src*="icon_conquest_artifact"]'));
  for(const [id,texture] of [['challenge250','01'],['retribution','03'],['badbaby','02']]){
    // The game artifactDefinition texture field, not the generic WIP glyph.
    const row = h.app.querySelector(`[data-feat="${id}"]`)?.closest('.cq-feat');
    assert.ok(row?.querySelector(`.cq-reward img[src*="icon_conquest_artifact_${texture}"]`),id);
  }
  assert.equal(h.app.querySelectorAll('svg').length,0);
  for(const img of h.app.querySelectorAll('img')) assert.ok(fs.existsSync(new URL('../'+img.getAttribute('src'),import.meta.url)),img.src);
});
