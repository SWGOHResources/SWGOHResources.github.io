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
  w.scrollTo = ()=>{};
  w.eval(source);
  const app = w.document.getElementById('fixture');
  w.renderPlanner(app,{entry,state:'active'},now,shared);
  const click = selector => { const el = app.querySelector(selector); assert.ok(el,selector); if(el.click) el.click(); else el.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); };
  const rightClick = selector => {
    const el = app.querySelector(selector); assert.ok(el,selector);
    const event = new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2});
    el.dispatchEvent(event); return event;
  };
  const change = (selector,value) => {
    const el = app.querySelector(selector); assert.ok(el,selector);
    if(el.type === 'checkbox') el.checked = value; else el.value = value;
    el.dispatchEvent(new w.Event('change',{bubbles:true}));
  };
  const total = () => Number(app.querySelector('[data-cq="total"]').textContent);
  const plan = () => JSON.parse(w.atob(w.location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/')));
  return {dom,w,app,click,rightClick,change,total,plan};
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
  h.change('[data-stars-input]','200'); h.rightClick('[data-crate="Reward Crate Tier 7"]');
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
  h.rightClick('[data-crate="Reward Crate Tier 7"]');
  h.click('[data-projection-toggle]');
  assert.equal(h.app.querySelector('#cqProjectionBody').hidden,true);
  assert.equal(h.app.querySelector('[data-projection-toggle]').getAttribute('aria-expanded'),'false');
  h.change('[data-feat="hot"]',true);
  assert.equal(h.app.querySelector('[data-cq="collapsed-total"]').textContent,'15 keycards');
  h.click('[data-projection-toggle]');
  assert.equal(h.app.querySelector('#cqProjectionBody').hidden,false);
  assert.match(h.app.querySelector('[data-cq="target"]').textContent,/615 more/);
  assert.equal(h.app.querySelector('[data-settings-toggle]'),null);
  h.click('[data-crate="Reward Crate Tier 7"]'); h.click('[data-preview-target]'); h.click('[data-chart-close]'); assert.equal(h.plan().t,null);
});
test('skipped feats and keycard totals track edits, group selection, and reset', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  const skipped = () => Number(h.app.querySelector('[data-cq="skipped-total"]').textContent);
  const skipRow = id => h.app.querySelector('[data-cq="skipped-groups"] [data-preview-feat="'+id+'"]');
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
  for(const id of ['challenge250','retribution']){
    const row = h.app.querySelector(`[data-feat="${id}"]`)?.closest('.cq-feat');
    assert.ok(row?.querySelector('.cq-reward img[src*="icon_conquest_artifact_rarity_04"]'),id);
    assert.equal(row.querySelectorAll('.cq-reward img').length,1);
  }
  assert.equal(h.app.querySelectorAll('.cq-wheel svg').length,1);
  assert.equal(h.app.querySelector('.cq-disk-emblem'),null);
  assert.equal(h.app.querySelector('.cq-disk-power'),null);
  assert.equal(h.app.querySelector('.cq-fi.disk-emblem'),null);
  h.rightClick('[data-crate="Reward Crate Tier 7"]');
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

test('left-click and keyboard open feat details, right-click toggles once, and popup edits stay synchronized', t => {
  const h = setup({shared:{v:'coverage',s:330,f:[]}}); t.after(()=>h.dom.window.close());
  assert.equal(h.app.querySelectorAll('[data-map-feat]').length,48);
  assert.equal(h.app.querySelector('.cq-requirement-explorer'),null);
  assert.equal(h.app.querySelector('.mh-progress-wrap'),null);
  const hashBefore = h.w.location.hash, storageBefore = h.w.localStorage.getItem('swgoh-cq-plan');
  h.click('[data-map-feat="thechild"]');
  const dialog = h.app.querySelector('.cq-chart-dialog');
  assert.equal(dialog.hasAttribute('open'),true);
  assert.match(dialog.textContent,/Sector 4.*4 keycards.*Skipped.*Grogu/s);
  assert.equal(h.total(),330); assert.deepEqual(h.plan().f,[]);
  assert.equal(h.w.location.hash,hashBefore); assert.equal(h.w.localStorage.getItem('swgoh-cq-plan'),storageBefore);
  h.click('[data-review-feat="thechild"]'); assert.equal(h.total(),334);
  assert.match(dialog.textContent,/Planned/); assert.equal(dialog.hasAttribute('open'),true);
  assert.equal(h.app.querySelector('.cq-skipped-grid [data-preview-feat="thechild"]'),null);
  h.click('[data-review-feat="thechild"]'); assert.equal(h.total(),330);
  h.click('[data-chart-close]');
  assert.equal(h.rightClick('[data-map-feat="thechild"]').defaultPrevented,true);
  assert.equal(dialog.hasAttribute('open'),false);
  assert.equal(h.total(),334); assert.deepEqual(h.plan().f,['thechild']);
  assert.equal(h.plan().v,'coverage');
  assert.equal(h.app.querySelector('[data-map-feat="thechild"]').classList.contains('planned'),true);
  assert.deepEqual(JSON.parse(h.w.localStorage.getItem('swgoh-cq-plan')).plans[data.conquests[0].id].feats,['thechild']);
  h.rightClick('[data-map-feat="thechild"]'); assert.equal(h.total(),330);
  h.click('[data-map-category="debuff"]'); assert.equal(dialog.hasAttribute('open'),false);
  const segment = h.app.querySelector('[data-map-feat="stun"]');
  segment.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  assert.equal(dialog.querySelectorAll('.cq-preview-feat').length,1); assert.equal(h.total(),330);
  h.click('[data-review-feat="stun"]'); assert.equal(h.total(),335);
  h.click('[data-chart-close]'); h.click('[data-view="planner"]'); h.click('[data-tab="Sector 1"]');
  assert.equal(h.app.querySelector('[data-feat="stun"]').checked,true);
  h.click('[data-reset-plan]'); h.click('[data-view="coverage"]');
  assert.equal(h.app.querySelectorAll('.cq-map-feat.planned').length,0);
  assert.equal(h.app.querySelectorAll('.cq-map-requirement').length,0);
  assert.equal(h.app.querySelector('.cq-ring-key'),null);
  assert.equal(h.rightClick('.cq-sector-key b').defaultPrevented,false);
});

test('crates open details on left-click and set a target on right-click in either view', t => {
  const h = setup({shared:{v:'coverage',s:330,f:[],t:'Reward Crate Tier 7'}}); t.after(()=>h.dom.window.close());
  const dialog = h.app.querySelector('.cq-chart-dialog');
  const targetBefore = h.plan().t;
  h.click('[data-report-crate="Reward Crate Tier 3"] img');
  assert.equal(dialog.hasAttribute('open'),true); assert.equal(h.plan().t,targetBefore);
  assert.match(dialog.textContent,/Tier 3.*Reached by your plan/s);
  h.click('[data-preview-target]'); assert.equal(h.plan().t,'Reward Crate Tier 3');
  h.click('[data-chart-close]');
  assert.equal(h.rightClick('[data-report-crate="Reward Crate Tier 4"] img').defaultPrevented,true);
  assert.equal(dialog.hasAttribute('open'),false); assert.equal(h.plan().t,'Reward Crate Tier 4');
  h.rightClick('[data-report-crate="Reward Crate Tier 4"]'); assert.equal(h.plan().t,'Reward Crate Tier 4');
  h.click('[data-view="planner"]'); h.click('[data-crate="Reward Crate Tier 2"]');
  assert.equal(dialog.hasAttribute('open'),true); assert.equal(h.plan().t,'Reward Crate Tier 4');
  h.click('[data-chart-close]'); h.rightClick('[data-crate="Reward Crate Tier 2"] img');
  assert.equal(dialog.hasAttribute('open'),false); assert.equal(h.plan().t,'Reward Crate Tier 2');
  const saved = JSON.parse(h.w.localStorage.getItem('swgoh-cq-plan')).plans[data.conquests[0].id];
  assert.equal(saved.target,'Reward Crate Tier 2'); assert.equal(h.total(),330);
});

test('crate hover shows just its name and shard rewards, without a target action or keycard status', t => {
  const h = setup({shared:{v:'coverage',s:330,f:[]}}); t.after(()=>h.dom.window.close());
  const img = h.app.querySelector('[data-report-crate="Reward Crate Tier 3"] img');
  img.dispatchEvent(new h.w.MouseEvent('pointerover',{bubbles:true,clientX:50,clientY:70}));
  const tooltip = h.app.querySelector('[data-cq="chart-tooltip"]');
  assert.equal(tooltip.hidden,false); assert.match(tooltip.textContent,/Tier 3.*shards/s);
  assert.equal(tooltip.querySelector('.cq-crate-preview-status'),null);
  assert.equal(tooltip.querySelector('button'),null);
  assert.equal(tooltip.querySelectorAll('.cq-report-payout b').length,2);
  h.rightClick('[data-report-crate="Reward Crate Tier 3"] img'); assert.equal(tooltip.hidden,true);
});

test('coverage is a separate shareable tab with every skipped feat visible', async t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  const planner = h.app.querySelector('#cqPlannerView'), report = h.app.querySelector('#cqCoverageView');
  assert.equal(planner.hidden,false); assert.equal(report.hidden,true);
  h.change('[data-feat="hot"]',true);
  const storageBefore = h.w.localStorage.getItem('swgoh-cq-plan');
  h.click('[data-view="coverage"]');
  assert.equal(planner.hidden,true); assert.equal(report.hidden,false);
  assert.equal(h.plan().v,'coverage'); assert.deepEqual(h.plan().f,['hot']);
  assert.equal(h.w.localStorage.getItem('swgoh-cq-plan'),storageBefore);
  assert.equal(report.querySelectorAll('.cq-skipped-feat').length,47);
  assert.equal(report.querySelector('[data-cq="skipped-groups"] details'),null);
  assert.equal(report.querySelector('[data-cq="skipped-groups"] [data-review-feat]'),null);
  assert.match(report.querySelector('.cq-map-count').textContent,/47.*48/);
  assert.match(report.querySelector('.cq-map-caption').textContent,/skipped/);
  assert.equal(h.app.querySelector('[data-reset-plan]').hidden,false);
  assert.equal(h.app.querySelector('[data-copy-link]').closest('.cq-view-toolbar'),h.app.querySelector('.cq-view-toolbar'));
  assert.equal(h.app.querySelector('.cq-page-tools'),null);
  let copied;
  Object.defineProperty(h.w.navigator,'clipboard',{value:{writeText:async value=>{copied=value;}}});
  h.click('[data-copy-link]'); await Promise.resolve(); assert.equal(copied,h.w.location.href);
  const loaded = setup({shared:h.plan()}); t.after(()=>loaded.dom.window.close());
  assert.equal(loaded.app.querySelector('#cqCoverageView').hidden,false);
  h.app.querySelector('[data-view="coverage"]').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  assert.equal(planner.hidden,false); assert.equal(report.hidden,true);
  assert.equal(h.w.document.activeElement.dataset.view,'planner');
  assert.equal(h.plan().v,undefined); assert.equal(h.total(),15);
});

test('chart hover uses a custom readable preview and touch opens only the modal', t => {
  const h = setup({shared:{v:'coverage',f:[],s:0}}); t.after(()=>h.dom.window.close());
  const segment = h.app.querySelector('[data-map-feat="stun"]');
  const tooltip = h.app.querySelector('[data-cq="chart-tooltip"]');
  assert.equal(h.app.querySelector('.cq-wheel title'),null);
  const hover = type => { const event = new h.w.MouseEvent('pointerover',{bubbles:true,clientX:50,clientY:70}); Object.defineProperty(event,'pointerType',{value:type}); segment.dispatchEvent(event); };
  hover('touch'); assert.equal(tooltip.hidden,true);
  hover('mouse'); assert.equal(tooltip.hidden,false);
  assert.match(tooltip.textContent,/Stun.*Sector 1.*5 keycards.*Skipped.*Attempt to Stun/s);
  segment.dispatchEvent(new h.w.MouseEvent('pointerout',{bubbles:true})); assert.equal(tooltip.hidden,true);
  hover('mouse'); h.click('[data-map-feat="stun"]'); assert.equal(tooltip.hidden,true);
  assert.equal(h.app.querySelector('.cq-chart-dialog').hasAttribute('open'),true);
  assert.equal(h.plan().v,'coverage'); assert.equal(h.plan().s,0); assert.deepEqual(h.plan().f,[]);
});

test('report projects the earned crate and its rewards rather than the target payout', t => {
  const h = setup({shared:{s:330,f:[],t:'Reward Crate Tier 7',v:'coverage'}}); t.after(()=>h.dom.window.close());
  const rewards = h.app.querySelector('[data-cq="report-rewards"]');
  assert.match(rewards.textContent,/Tier 3.*projected/);
  assert.match(rewards.textContent,/300 more keycards to Tier 7/);
  assert.equal(rewards.querySelectorAll('.cq-report-crate.projected').length,1);
  assert.equal(rewards.querySelectorAll('.cq-report-crate.earned').length,3);
  const earned = data.conquests[0].difficulties.hard.crates.find(c=>c.name === 'Reward Crate Tier 3');
  assert.equal(rewards.querySelector('.cq-report-payout'),null);
  assert.equal(rewards.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'330');
  h.click('[data-report-crate="Reward Crate Tier 3"]');
  assert.deepEqual([...h.app.querySelectorAll('.cq-chart-dialog .cq-report-payout b')].map(el=>Number(el.textContent)),[earned.shards.primary,earned.shards.secondary]);
  h.click('[data-chart-close]');
  h.click('[data-view="planner"]'); h.click('[data-reset-plan]'); h.click('[data-view="coverage"]');
  assert.match(rewards.textContent,/No crate reached/);
  assert.equal(rewards.querySelector('.cq-report-payout'),null);
  assert.equal(rewards.querySelector('.cq-report-crate.projected'),null);
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

test('missed battle keycards update the same stars, saved plan and shared link without replacing the input', t => {
  const h = setup({shared:{v:'coverage',s:330,f:['hot']}}); t.after(()=>h.dom.window.close());
  const input = h.app.querySelector('[data-missed-input]');
  assert.equal(input.value,'0'); assert.equal(h.total(),345);
  input.value='12'; input.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  assert.equal(h.app.querySelector('[data-missed-input]'),input);
  assert.equal(h.plan().s,318); assert.equal(h.total(),333);
  assert.equal(h.app.querySelector('[data-stars-input]').value,'318');
  assert.equal(JSON.parse(h.w.localStorage.getItem('swgoh-cq-plan')).plans[data.conquests[0].id].stars,318);
  h.change('[data-missed-input]','999'); assert.equal(h.plan().s,0); assert.equal(input.value,'330');
  h.change('[data-missed-input]','-5'); assert.equal(h.plan().s,330); assert.equal(input.value,'0');
  assert.equal(h.app.querySelector('[data-missed-step]'),null);
  assert.equal(h.app.querySelector('[data-cq="battle-keycards"]').textContent,'330 / 330 keycards');
  h.click('[data-reset-plan]'); assert.equal(input.value,'330');
  h.click('[data-map-feat="hot"]'); assert.equal(h.total(),0);
  h.click('[data-review-feat="hot"]'); assert.equal(h.total(),15); h.click('[data-chart-close]');
  assert.equal(h.app.querySelector('.cq-hero').hidden,false);
  h.click('[data-view="planner"]'); assert.equal(h.app.querySelector('.cq-hero').hidden,false);
});

test('views share a persistent timer and guide panel with desktop and touch instructions', t => {
  const h = setup(); t.after(()=>h.dom.window.close());
  const context = h.app.querySelector('.cq-context'), header = h.app.querySelector('.cq-hero');
  assert.equal(h.app.querySelector('[data-view="planner"]').textContent,'Basic Planner');
  assert.equal(h.app.querySelector('[data-view="coverage"]').textContent,'Advanced View');
  assert.equal(h.app.querySelectorAll('[data-clock="remaining"]').length,1);
  assert.match(context.textContent,/Left click.*Right click.*Mobile.*Tap for details/s);
  assert.equal(context.querySelector('a').href,'https://swgoh4.life/conquest/');
  h.click('[data-view="coverage"]');
  assert.equal(h.app.querySelector('.cq-context'),context);
  assert.equal(header.hidden,false);
  const shortcut = new h.w.KeyboardEvent('keydown',{key:'Home',ctrlKey:true,bubbles:true,cancelable:true});
  h.app.querySelector('[data-view="coverage"]').dispatchEvent(shortcut);
  assert.equal(shortcut.defaultPrevented,false);
  assert.equal(h.plan().v,'coverage');
  assert.equal(h.app.querySelector('#cqCoverageView .merged-hero'),null);
  assert.equal(h.app.querySelector('[data-missed-input]').getAttribute('aria-describedby'),'cqMissedHint');
  h.change('[data-missed-input]','12');
  h.click('[data-view="planner"]');
  assert.equal(h.app.querySelector('.cq-context'),context);
  assert.equal(h.app.querySelector('[data-stars-input]').value,'318');
  assert.equal(h.app.querySelector('.cq-view-toolbar').parentElement.className,'cq-page-content');
});

test('diagram labels sectors and bonus rewards, popups show original reward art, and title feats stay in the main planner', t => {
  const h = setup({shared:{v:'coverage',s:0,f:[]}}); t.after(()=>h.dom.window.close());
  assert.equal(h.app.querySelector('[data-preview-feat="unlikely"]'),null);
  assert.equal(h.app.querySelector('[data-map-feat="unlikely"]'),null);
  assert.ok(h.app.querySelector('[data-feat="unlikely"]'));
  assert.equal(h.app.querySelectorAll('.cq-map-sector').length,48);
  assert.ok([...h.app.querySelectorAll('.cq-map-sector')].every(el=>/^(GL|S[1-5])$/.test(el.textContent)));
  assert.ok(h.app.querySelectorAll('.cq-map-reward').length > 0);
  h.click('[data-map-feat="retribution"]');
  assert.match(h.app.querySelector('.cq-chart-dialog .cq-sector-badge').textContent,/Global/);
  assert.ok(h.app.querySelector('.cq-chart-dialog .cq-preview-reward img[src*="rarity_04"]'));
  h.click('[data-chart-close]'); h.click('[data-map-feat="badbaby"]');
  assert.match(h.app.querySelector('.cq-chart-dialog .cq-preview-reward').textContent,/Cooling Systems.*Consumable/);
});

test('popup locks background scrolling, ignores inside clicks and closes on backdrop or Close', t => {
  const h = setup({shared:{v:'coverage',s:330,f:[]}}); t.after(()=>h.dom.window.close());
  h.click('[data-map-feat="stun"]');
  const dialog = h.app.querySelector('.cq-chart-dialog');
  assert.equal(h.w.document.body.classList.contains('cq-modal-open'),true);
  assert.equal(h.w.document.documentElement.classList.contains('cq-modal-open'),true);
  dialog.getBoundingClientRect = ()=>({left:20,top:20,right:300,bottom:300});
  dialog.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,clientX:100,clientY:100}));
  assert.equal(dialog.hasAttribute('open'),true);
  dialog.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,clientX:5,clientY:5}));
  assert.equal(dialog.hasAttribute('open'),false); assert.equal(h.w.document.body.classList.contains('cq-modal-open'),false);
  h.click('[data-map-feat="stun"]'); h.click('[data-chart-close]');
  assert.equal(h.w.document.documentElement.classList.contains('cq-modal-open'),false);
  h.click('[data-map-category="faction"]'); assert.equal(dialog.hasAttribute('open'),false);
  assert.equal(h.app.querySelector('.cq-coverage-categories'),null);
  assert.ok(h.app.querySelectorAll('.cq-map-branch.dim').length > 0);
  h.click('[data-map-category="faction"]'); assert.equal(h.app.querySelectorAll('.cq-map-branch.dim').length,0);
});

test('segment activation preserves the page scroll position and the shared header', t => {
  const h = setup({shared:{v:'coverage',s:330,f:[]}}); t.after(()=>h.dom.window.close());
  Object.defineProperty(h.w,'scrollY',{value:240}); let lastScroll;
  h.w.scrollTo = position=>{ lastScroll=position; };
  const segment = h.app.querySelector('[data-map-feat="stun"]');
  const mouse = new h.w.MouseEvent('mousedown',{bubbles:true,cancelable:true});
  segment.dispatchEvent(mouse); assert.equal(mouse.defaultPrevented,true);
  h.click('[data-map-feat="stun"]'); assert.deepEqual(JSON.parse(JSON.stringify(lastScroll)),{top:240,left:0,behavior:'instant'});
  h.click('[data-chart-close]'); assert.deepEqual(JSON.parse(JSON.stringify(lastScroll)),{top:240,left:0,behavior:'instant'});
  h.rightClick('[data-map-feat="stun"]'); assert.deepEqual(JSON.parse(JSON.stringify(lastScroll)),{top:240,left:0,behavior:'instant'});
  assert.equal(h.app.querySelector('.cq-hero').hidden,false);
  h.click('[data-view="planner"]'); assert.equal(h.app.querySelector('.cq-hero').hidden,false);
});
