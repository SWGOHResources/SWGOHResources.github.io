import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const source = fs.readFileSync(new URL('../assets/js/conquest.js',import.meta.url),'utf8');
const data = JSON.parse(fs.readFileSync(new URL('../assets/data/conquest-planner.json',import.meta.url),'utf8'));
function setup({ shared = null, stored = null, blocked = false, entry = data.conquests[0], now = Date.now() } = {}){
  const dom = new JSDOM('<div id="fixture"></div>',{url:'https://example.test/conquest.html',runScripts:'outside-only'});
  const w = dom.window;
  if(stored) w.localStorage.setItem('swgoh-cq-plan',JSON.stringify({plans:{[entry.id]:stored}}));
  if(blocked) Object.defineProperty(w,'localStorage',{get(){throw new Error('blocked');}});
  w.eval(source);
  const app = w.document.getElementById('fixture');
  w.renderPlanner(app,{entry,state:'active'},now,shared);
  const click = selector => { const el = app.querySelector(selector); assert.ok(el,selector); if(el.click) el.click(); else el.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); };
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
test('projected crate collapses from its heading and selections update its compact total', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  h.click('[data-crate="Reward Crate Tier 7"]');
  h.click('[data-projection-toggle]');
  assert.equal(h.app.querySelector('#cqProjectionBody').hidden,true);
  assert.equal(h.app.querySelector('[data-projection-toggle]').getAttribute('aria-expanded'),'false');
  h.change('[data-feat="hot"]',true);
  assert.equal(h.app.querySelector('[data-cq="collapsed-total"]').textContent,'15 keycards');
  h.click('[data-projection-toggle]');
  assert.equal(h.app.querySelector('#cqProjectionBody').hidden,false);
  assert.match(h.app.querySelector('[data-cq="target"]').textContent,/615 more/);
  assert.equal(h.app.querySelector('[data-settings-toggle]'),null);
  h.click('[data-crate="Reward Crate Tier 7"]'); assert.equal(h.plan().t,null);
});
test('skipped feats and keycard totals track edits, group selection, and reset', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  const skipped = () => Number(h.app.querySelector('[data-cq="skipped-total"]').textContent);
  const skipRow = id => h.app.querySelector('[data-cq="skipped-groups"] [data-jump-feat="'+id+'"]');
  assert.equal(skipped(),334); assert.ok(skipRow('hot'));
  assert.equal(h.app.querySelector('[data-filter]'),null);
  h.change('[data-feat="hot"]',true); assert.equal(skipped(),319); assert.equal(skipRow('hot'),null);
  h.click('[data-toggle-all]'); assert.equal(skipped(),242);
  h.click('[data-reset-plan]'); assert.equal(skipped(),334); assert.ok(skipRow('hot'));
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
  for(const [id,texture] of [['challenge250','01'],['retribution','03']]){
    // The game artifactDefinition texture field, not the generic WIP glyph.
    const row = h.app.querySelector(`[data-feat="${id}"]`)?.closest('.cq-feat');
    assert.ok(row?.querySelector(`.cq-reward img[src*="icon_conquest_artifact_${texture}"]`),id);
  }
  assert.equal(h.app.querySelectorAll('.cq-wheel svg').length,1);
  for(const disk of h.app.querySelectorAll('.cq-disk')){
    assert.ok(disk.querySelector('.cq-disk-frame'));
    assert.ok(disk.querySelector('.cq-disk-emblem'));
    assert.ok(disk.querySelector('.cq-disk-power'));
  }
  h.click('[data-crate="Reward Crate Tier 7"]');
  assert.ok(h.app.querySelector('.cq-shard.dark .cq-shard-background[src*="ShardIcon"]'));
  assert.ok(h.app.querySelector('.cq-shard.light .cq-shard-background[src*="ShardIcon"]'));
  const cooling = h.app.querySelector('[data-feat="badbaby"]').closest('.cq-feat');
  assert.match(cooling.textContent,/Deployable Cooling Systems · Consumable/);
  assert.equal(cooling.querySelector('.cq-disk'),null);
  assert.ok(cooling.querySelector('.cq-consumable-icon[src*="icon_conquest_consumable_tech"]'));
  assert.match(h.app.querySelector('[data-feat="learncontrol"]').closest('.cq-feat').textContent,/Requires the consumable from Bad Baby!/);
  for(const img of h.app.querySelectorAll('img')) assert.ok(fs.existsSync(new URL('../'+img.getAttribute('src'),import.meta.url)),img.src);
});

test('every feat retains an icon column and bonus rewards align within the description column', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  for(const g of data.conquests[0].difficulties.hard.groups){
    h.click('[data-tab="'+g.name+'"]');
    for(const row of h.app.querySelectorAll('.cq-feat')){
      assert.ok(row.querySelector('.cq-fi img'),row.textContent);
      const reward = row.querySelector('.cq-reward');
      if(reward) assert.equal(reward.parentElement.className,'cq-feat-text');
    }
  }
});

test('custom star stepper respects limits and reset restores feat selections', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  assert.equal(h.app.querySelector('[data-stars-step="-1"]').disabled,true);
  h.click('[data-stars-step="1"]'); assert.equal(h.total(),1); assert.equal(h.plan().s,1);
  h.click('[data-stars-max]'); assert.equal(h.total(),330);
  assert.equal(h.app.querySelector('[data-stars-step="1"]').disabled,true);
  h.click('[data-stars-step="-1"]'); assert.equal(h.total(),329);
  h.click('[data-reset-plan]');
  assert.equal(h.app.querySelectorAll('[data-feat]').length,9);
});

test('coverage groups repeated requirements and lets players plan and find exact feats', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  assert.equal(h.app.querySelectorAll('[data-map-feat]').length,49);
  assert.equal(h.app.querySelector('[data-category="survival"]').getAttribute('aria-pressed'),'true');
  const grogu = [...h.app.querySelectorAll('.cq-requirement')].find(r=>r.querySelector('strong').textContent === 'Grogu & Anzellans');
  assert.equal(grogu.querySelectorAll('[data-review-feat]').length,2);
  h.click('[data-cq="coverage-detail"] [data-review-feat="thechild"]');
  assert.equal(h.total(),4); assert.deepEqual(h.plan().f,['thechild']);
  assert.equal(h.app.querySelector('[data-map-feat="thechild"]').classList.contains('planned'),true);
  h.click('[data-cq="coverage-detail"] [data-jump-feat="thechild"]');
  assert.equal(h.plan().g,'Sector 4');
  assert.equal(h.w.document.activeElement.dataset.feat,'thechild');
  assert.equal(h.app.querySelector('[data-feat="thechild"]').checked,true);
  h.click('[data-cq="coverage-detail"] [data-review-feat="thechild"]'); assert.equal(h.total(),0);
  h.click('[data-category="debuff"]');
  assert.match(h.app.querySelector('[data-cq="coverage-detail"]').textContent,/Stun/);
  h.click('[data-map-feat="stun"]'); assert.equal(h.plan().g,'Sector 1');
  assert.equal(h.w.document.activeElement.dataset.feat,'stun');
});

test('keycard completion lights a sector even with an optional bonus feat unselected', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  for(const f of data.conquests[0].difficulties.hard.groups[0].feats.filter(f=>f.keycards > 0)) h.change('[data-feat="'+f.id+'"]',true);
  const tab = h.app.querySelector('[data-tab="Global feats"]');
  assert.equal(tab.classList.contains('complete'),true);
  assert.equal(h.app.querySelector('[data-feat="unlikely"]').checked,false);
  assert.equal(tab.querySelector('.cq-tab-num').textContent,'✓ 8/8');
  h.change('[data-feat="hot"]',false); assert.equal(tab.classList.contains('complete'),false);
  h.click('[data-reset-plan]'); assert.equal(tab.classList.contains('complete'),false);
});

test('warning is clear before launch and disappears at the exact opening time', t => {
  const entry = {...data.conquests[0],status:'preliminary'};
  const h = setup({entry,now:Date.parse(entry.starts+'T17:59:00Z')}); t.after(()=>h.dom.window.close());
  const notice = h.app.querySelector('[data-cq="notice"]');
  assert.equal(notice.hidden,false); assert.match(notice.textContent,/may change before/);
  h.w.paintConquestTiming(h.app,entry,Date.parse(entry.starts+'T18:00:00Z'));
  assert.equal(notice.hidden,true);
  assert.doesNotMatch(h.app.textContent,/One keycard per battle star/);
  assert.match(h.app.querySelector('.cq-requires').textContent,/Conquest Pass\+$/);
});
