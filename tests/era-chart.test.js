import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('../era-chart.html', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../assets/js/era-chart.js', import.meta.url), 'utf8');
const data = JSON.parse(fs.readFileSync(new URL('../assets/data/era-chart.json', import.meta.url), 'utf8'));
const coliseum = JSON.parse(fs.readFileSync(new URL('../assets/data/era-coliseum.json', import.meta.url), 'utf8'));
const raw = JSON.parse(fs.readFileSync(new URL('../era10-extract/02_era10_coliseum.json', import.meta.url), 'utf8'));
const boxSource = JSON.parse(fs.readFileSync(new URL('../era10-extract/08_coliseum_prize_boxes.json', import.meta.url), 'utf8'));
const ERA = 'ERA_UPGRADE_CURRENCY', GREK = 'era_upgrade_basic_1';
async function setup(t, { stored, legacy, blocked = false, failed = false } = {}) {
  const dom = new JSDOM(html, {url:'https://example.test/era-chart/',runScripts:'outside-only'});
  t.after(() => dom.window.close());
  const w = dom.window, doc = w.document;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  if (stored !== undefined) w.localStorage.setItem('swgoh-era-checklist-v2', JSON.stringify(stored));
  if (legacy !== undefined) w.localStorage.setItem('swgoh-era-plan', JSON.stringify(legacy));
  if (blocked) Object.defineProperty(w,'localStorage',{get(){throw Error('blocked');}});
  w.fetch = async url => ({ok:!failed,json:async()=>url.includes('era-coliseum')?coliseum:data});
  w.eval(source);
  await new Promise(resolve => w.setTimeout(resolve, 0));
  const get = sel => {const el=doc.querySelector(sel);assert.ok(el,sel);return el;};
  const edit = (sel,value,event='input') => {const el=get(sel);el.focus();el.value=value;el.dispatchEvent(new w.Event(event,{bubbles:true}));return el;};
  const click = sel => get(sel).click();
  const amount = (id,kind) => Number(get(`[data-material="${id}"] [data-amount="${kind}"]`).textContent.replaceAll(',',''));
  const boss = (id,field,value) => edit(`[data-boss="${id}"][data-field="${field}"]`,value,'change');
  const state = () => JSON.parse(w.localStorage.getItem('swgoh-era-checklist-v2'));
  return {w,doc,get,edit,click,amount,boss,state};
}

test('gear and relic targets sync both ways using the mini-era conversion bands',async t=>{
  const h=await setup(t);
  assert.equal(h.get('#planGear').value,'75');
  // CG's Mini-Era announcement separates G12's five equipped-piece steps.
  const bands=[[55,55],[56,57],[58,59],[60,61],[62,63],[64,64],[65,65],[66,67],[68,69],[70,70],[71,71],[72,72],[73,73],[74,74],[75,75]];
  const pieces=[56,58,60,62,64];
  pieces.forEach((level,i)=>assert.equal(h.get(`#planGear option[value="${level}"]`).textContent,`G12 +${i+1}`));
  for(const [start,end] of bands){
    h.edit('#planGear',String(start),'change');assert.equal(h.get('#planTgt').value,String(start));
    const expected=data.levels.filter(r=>r.lvl<=start).flatMap(r=>r.costs).filter(r=>r.id===ERA).reduce((n,r)=>n+r.q,0);
    assert.equal(h.amount(ERA,'need'),expected);
    h.edit('#planTgt',String(end));assert.equal(h.get('#planGear').value,String(start));
  }
  h.edit('#planTgt','54');assert.equal(h.get('#planGear').value,'below');
  const savedGear=await setup(t,{stored:{tgt:63}});assert.equal(savedGear.get('#planGear').value,'62');
  h.edit('#planGear','68','change');assert.equal(h.state().tgt,68);
  const saved=await setup(t,{stored:h.state()});assert.equal(saved.get('#planGear').value,'68');
  h.click('#planReset');assert.equal(h.get('#planGear').value,'75');
  assert.deepEqual([...h.doc.querySelectorAll('[data-material]')].slice(0,2).map(r=>r.dataset.material),[ERA,'era_upgrade_special_1']);
});

test('full costs match source levels and units multiply only costs',async t=>{
  const h=await setup(t);
  const totals={};for(const row of data.levels)if(row.lvl<=75)for(const c of row.costs)totals[c.id]=(totals[c.id]||0)+c.q;
  for(const [id,total] of Object.entries(totals))assert.equal(h.amount(id,'need'),total);
  h.click('#planEpFree');h.boss('KRAYTDRAGON','progress','10');
  const ep=h.amount(ERA,'episode'), cq=h.amount(GREK,'coliseum');
  h.click('[data-units="2"]');
  for(const [id,total] of Object.entries(totals))assert.equal(h.amount(id,'need'),total*2);
  assert.equal(h.amount(ERA,'episode'),ep);assert.equal(h.amount(GREK,'coliseum'),cq);
});

test('MK VII and VIII upgrade rows remain visible independently of Coliseum tiers',async t=>{
  const h=await setup(t);
  const vii=['era_upgrade_basic_7','era_upgrade_advanced_7'];
  const viii=['era_upgrade_basic_8','era_upgrade_advanced_8'];
  h.edit('#planTgt','65');
  for(const id of [...vii,...viii]){assert.ok(h.get(`[data-material="${id}"]`));assert.equal(h.amount(id,'need'),0);}
  h.edit('#planTgt','66');for(const id of vii)assert.ok(h.amount(id,'need')>0);
  for(const id of viii)assert.equal(h.amount(id,'need'),0);
  h.edit('#planTgt','71');for(const id of viii)assert.ok(h.amount(id,'need')>0);
  const costs=[...vii,...viii].map(id=>h.amount(id,'need'));
  h.boss('KRAYTDRAGON','tier','8');h.boss('KRAYTDRAGON','progress','100');
  assert.deepEqual([...vii,...viii].map(id=>h.amount(id,'need')),costs);
});

test('four independent bosses count cumulative milestones and earlier tiers once',async t=>{
  const h=await setup(t);
  h.boss('KRAYTDRAGON','progress','10');h.boss('ZEFFOTOMBGUARDIAN','progress','20');h.boss('JOTAZ','progress','30');
  assert.equal(h.amount(GREK,'coliseum'),50+125+375);
  h.boss('KRAYTDRAGON','tier','2');
  assert.equal(h.amount(GREK,'coliseum'),1375+100+125+375);
  assert.equal(h.get('[data-boss="JOTAZ"][data-field="tier"]').value,'1');
  assert.equal(h.get('[data-boss="DRYAX"][data-field="progress"]').value,'0');
  assert.equal(h.amount(GREK,'remaining'),23325-1975);
});

test('milestone boundaries include box contents at the exact threshold',async t=>{
  const h=await setup(t);
  for(const [percent,reward] of [[9,0],[10,50],[19,50],[20,125],[39,375],[40,500],[100,1375]]){
    h.boss('KRAYTDRAGON','progress',String(percent));assert.equal(h.amount(GREK,'coliseum'),reward);
  }
  h.boss('KRAYTDRAGON','tier','8');h.boss('KRAYTDRAGON','progress','100');
  assert.equal(h.amount(ERA,'coliseum'),0);
  assert.equal(h.amount('era_upgrade_advanced_1','coliseum'),315);
  assert.equal(h.amount('era_upgrade_advanced_2','coliseum'),300);
  assert.equal(h.amount('era_upgrade_advanced_3','coliseum'),550);
});

test('derived tables retain exact game rewards for each of the four bosses',()=>{
  assert.equal(coliseum.tiers.length,8);assert.equal(coliseum.bosses.length,4);
  assert.equal(boxSource.boxes.length,32);
  const boxes=new Map(boxSource.boxes.map(box=>[box.id,box]));
  for(const [i,boss] of raw.bossDefinition.entries()){
    assert.equal(coliseum.bosses[i].id,boss.identifier.campaignNodeId);
    for(const [j,tier] of coliseum.tiers.entries()){
      const sourceBands=boss.bossRewardTable[j].bossProgressionRewardPreview;
      for(const [k,band] of tier.bands.entries()){
        assert.equal(band.at,sourceBands[k].rankStart);
        const expected=new Map(), boxIds=[];
        let shipment=0;
        for(const item of sourceBands[k].detailedReward){
          const contents=item.type===14?boxes.get(item.id).previewItem:[item];
          if(item.type===14)boxIds.push(item.id);
          for(const r of contents){
            assert.equal(r.minQuantity,r.maxQuantity);
            const quantity=r.minQuantity*(item.type===14?item.minQuantity:1);
            if(r.id==='ERA_CURRENCY')shipment+=quantity;
            if((j<6||(j===6&&band.at<100))&&(r.id.startsWith('era_upgrade_')||r.id===ERA))expected.set(r.id,(expected.get(r.id)||0)+quantity);
          }
        }
        assert.deepEqual(band.boxes,boxIds);
        assert.deepEqual(band.rewards,[...expected].map(([id,q])=>({id,q})));
        assert.equal(band.shipmentCurrency,shipment);
        assert.ok(band.rewards.every(r=>r.id!=='ERA_CURRENCY'));
      }
    }
  }
});

test('four completed bosses include direct and boxed materials exactly four times',async t=>{
  const h=await setup(t);
  for(const boss of coliseum.bosses){h.boss(boss.id,'tier','8');h.boss(boss.id,'progress','100');}
  for(const [id,total] of Object.entries({era_upgrade_basic_1:28300,era_upgrade_advanced_1:1260,era_upgrade_basic_2:22600,era_upgrade_advanced_2:1200,era_upgrade_basic_3:36400,era_upgrade_advanced_3:2200}))assert.equal(h.amount(id,'coliseum'),total);
  assert.equal(h.amount(ERA,'coliseum'),0);
  // Removing only one boss leaves the other three unchanged.
  h.boss('JOTAZ','progress','0');h.boss('JOTAZ','tier','1');
  assert.equal(h.amount('era_upgrade_advanced_3','coliseum'),1650);
});

test('tier 7 has materials through 90%; its 100% milestone and tier 8 add only Era Currency',async t=>{
  const h=await setup(t),selector='[data-boss-shipment="KRAYTDRAGON"]';
  h.boss('KRAYTDRAGON','tier','6');h.boss('KRAYTDRAGON','progress','100');
  assert.equal(h.get(selector).textContent,'0');
  h.boss('KRAYTDRAGON','tier','7');h.boss('KRAYTDRAGON','progress','50');
  assert.equal(h.get(selector).textContent,'1,200');
  assert.equal(h.amount('era_upgrade_basic_3','coliseum'),5950);
  assert.equal(h.amount('era_upgrade_advanced_3','coliseum'),350);
  h.boss('KRAYTDRAGON','progress','90');
  const materials=[GREK,'era_upgrade_basic_2','era_upgrade_basic_3','era_upgrade_advanced_3'].map(id=>h.amount(id,'coliseum'));
  h.boss('KRAYTDRAGON','progress','100');assert.equal(h.get(selector).textContent,'3,200');
  h.boss('KRAYTDRAGON','tier','8');h.boss('KRAYTDRAGON','progress','40');
  assert.equal(h.get(selector).textContent,'4,800');
  h.boss('KRAYTDRAGON','progress','100');assert.equal(h.get(selector).textContent,'8,350');
  assert.deepEqual([GREK,'era_upgrade_basic_2','era_upgrade_basic_3','era_upgrade_advanced_3'].map(id=>h.amount(id,'coliseum')),materials);
  assert.equal(h.get('[data-boss-shipment="JOTAZ"]').textContent,'0');
  assert.equal(h.amount(ERA,'coliseum'),0);
  assert.match(h.get('.boss-shipment img').src,/icon_currency_coliseum/);
  assert.equal(h.get('.boss-shipment span').textContent,'Era Currency');
});

test('marquee first-clear rewards count once, and daily claims count per tier',async t=>{
  const h=await setup(t),core='era_upgrade_advanced_1';
  h.edit('#planMarqA','4','change');
  assert.equal(h.amount(ERA,'marquee'),4500);
  assert.equal(h.amount(core,'marquee'),65);
  h.click('#marqueeCustomOpen');
  const input=h.edit('[data-marquee-daily="3"]','7');
  assert.equal(h.amount(ERA,'marquee'),13500);
  assert.equal(h.doc.activeElement,input);
  h.edit('[data-marquee-daily="4"]','3');assert.equal(h.amount(core,'marquee'),75);
  assert.equal(h.amount(ERA,'remaining'),318000-13500);
  h.click('[data-units="2"]');assert.equal(h.amount(ERA,'marquee'),13500);
  h.edit('#planMarqA','2','change');
  assert.equal(h.amount(ERA,'marquee'),3000);assert.equal(h.amount(core,'marquee'),10);
  assert.equal(h.doc.querySelector('[data-marquee-daily]'),null);
});

test('daily claims are capped at seven on bulk changes, per-tier edits and saved plans',async t=>{
  const h=await setup(t);
  h.edit('#planMarqA','7','change');h.edit('#planMarqDays','7','change');
  for(const tier of [3,4,5,6,7])assert.equal(h.get(`[data-marquee-daily="${tier}"]`).value,'7');
  assert.equal(h.amount(ERA,'marquee'),3000+(1500+450)*7);
  const input=h.edit('[data-marquee-daily="3"]','99','change');assert.equal(input.value,'7');
  assert.equal(input.max,'7');assert.equal(h.state().marqueeDaily[3],7);
  h.edit('[data-marquee-daily="4"]','2','change');assert.equal(h.get('#planMarqDays').value,'custom');
  h.edit('#planMarqDays','3','change');for(const tier of [3,4,5,6,7])assert.equal(h.state().marqueeDaily[tier],3);
  const loaded=await setup(t,{stored:{tgt:75,marqA:7,marqueeDaily:{3:100,4:-5,5:2.5}}});
  assert.equal(loaded.get('[data-marquee-daily="3"]').value,'7');
  assert.equal(loaded.get('[data-marquee-daily="4"]').value,'0');
  assert.equal(loaded.get('[data-marquee-daily="5"]').value,'2');
  assert.doesNotMatch(h.get('#planMarqA').textContent,/★/);
});

test('episode selection buttons preserve independent rewards and pressed state',async t=>{
  const h=await setup(t);
  h.click('#planEpFree');assert.equal(h.get('#planEpFree').getAttribute('aria-pressed'),'true');
  h.click('#planEpPrem');assert.equal(h.get('#planEpPrem').getAttribute('aria-pressed'),'true');
  h.click('#planEpFree');assert.equal(h.get('#planEpFree').getAttribute('aria-pressed'),'false');
  assert.equal(h.state().epFree,false);assert.equal(h.state().epPrem,true);
  h.click('#planReset');assert.equal(h.get('#planEpPrem').getAttribute('aria-pressed'),'false');
});

test('all first marquee reward types match the extract and the second is unavailable',async t=>{
  const marqueeRaw=JSON.parse(fs.readFileSync(new URL('../era10-extract/06_marquee_adelphiranger_l80_full.json',import.meta.url),'utf8'));
  for(const [i,tier] of data.marquee.ADELPHIRANGER_L80.entries()){
    const mission=marqueeRaw.node.campaignNodeMission[i];
    assert.deepEqual(tier.rewards,mission.firstCompleteRewardPreview.map(r=>({id:r.id,q:r.minQuantity})));
    assert.deepEqual(tier.dailyRewards,mission.rewardPreview.map(r=>({id:r.id,q:r.minQuantity})));
  }
  assert.equal(data.marquee.B1MERCDROID_L80,undefined);
  const h=await setup(t,{legacy:{marqA:1,marqB:7,tgt:75}});
  assert.equal(h.get('#planMarqB').disabled,true);
  assert.equal(h.get('#planMarqB').closest('fieldset').disabled,true);
  assert.equal(h.amount(ERA,'marquee'),3000);
  h.click('#planReset');assert.equal(h.get('#planMarqA').value,'0');assert.equal(h.amount(ERA,'marquee'),0);
});

test('custom view overlays the daily inputs and Finish closes it with focus restored',async t=>{
  const h=await setup(t);
  assert.equal(h.get('#marqueeCustomize').open,false);
  assert.equal(h.get('#marqueeCustomOpen').disabled,true);
  h.edit('#planMarqA','7','change');h.click('#marqueeCustomOpen');
  assert.equal(h.get('#marqueeCustomize').open,true);
  h.edit('[data-marquee-daily="3"]','4','change');h.click('#marqueeCustomFinish');
  assert.equal(h.get('#marqueeCustomize').open,false);
  assert.equal(h.doc.activeElement,h.get('#marqueeCustomOpen'));
  assert.equal(h.get('#planMarqDays').value,'custom');
  assert.equal(h.get('#marqueeCustomize').querySelectorAll('input').length,5);
  assert.equal(h.get('#planMarqB').options.length,h.get('#planMarqA').options.length);
  assert.equal(h.get('#planMarqBDays').disabled,true);
  assert.match(h.get('#planMarqB').closest('fieldset').textContent,/B1 Mercenary Droid/);
  assert.equal(h.doc.querySelector('.marquee-controls summary, .marquee-heading .sc-badge'),null);
});

test('the 40% and 90% boxes contribute cores once per boss',async t=>{
  const h=await setup(t),core='era_upgrade_advanced_1';
  h.boss('KRAYTDRAGON','progress','39');assert.equal(h.amount(core,'coliseum'),0);
  h.boss('KRAYTDRAGON','progress','40');assert.equal(h.amount(core,'coliseum'),50);
  h.boss('KRAYTDRAGON','progress','89');assert.equal(h.amount(core,'coliseum'),50);
  h.boss('KRAYTDRAGON','progress','90');assert.equal(h.amount(core,'coliseum'),65);
  h.boss('ZEFFOTOMBGUARDIAN','progress','40');assert.equal(h.amount(core,'coliseum'),115);
});

test('full episode tracks subtract exactly once and remaining amounts clamp at zero',async t=>{
  const h=await setup(t);
  h.click('#planEpFree');h.click('#planEpPrem');
  for(const id of [ERA,GREK]){
    const reward=[...data.episode.free,...data.episode.premium].filter(r=>r.id===id).reduce((a,r)=>a+r.q,0);
    assert.equal(h.amount(id,'episode'),reward);
  }
  h.edit('#planTgt','1');
  assert.equal(h.amount(ERA,'need'),100);assert.equal(h.amount(ERA,'remaining'),0);
});

test('typing target and percentage preserves input nodes and focus',async t=>{
  const h=await setup(t),sel='[data-boss="KRAYTDRAGON"][data-field="progress"]',input=h.get(sel);
  for(const n of ['1','10','100']){h.edit(sel,n);assert.equal(h.get(sel),input);assert.equal(h.doc.activeElement,input);}
  h.edit('#planTgt','');assert.equal(h.get('#planTgt').value,'');
  h.edit('#planTgt','','change');assert.equal(h.get('#planTgt').value,'0');
  h.boss('KRAYTDRAGON','progress','999');assert.equal(input.value,'100');
});

test('saved bosses remain independent; legacy owned amounts and packs have no effect',async t=>{
  const stored={tgt:50,units:2,epFree:true,bosses:{KRAYTDRAGON:{tier:2,percent:30},JOTAZ:{tier:4,percent:80}}};
  const h=await setup(t,{stored});
  assert.equal(h.get('#planTgt').value,'50');assert.equal(h.get('[data-boss="JOTAZ"][data-field="tier"]').value,'4');
  assert.equal(h.get('[data-boss="DRYAX"][data-field="progress"]').value,'0');
  const legacy=await setup(t,{legacy:{tgt:75,owned:{[ERA]:999999},packs:[{cur:ERA,per:999999,n:99}],cur:70}});
  assert.equal(legacy.amount(ERA,'remaining'),318000);
  legacy.edit('#planTgt','999','change');assert.equal(legacy.get('#planTgt').value,'75');
});

test('reset repeats safely and restores all four boss controls',async t=>{
  const h=await setup(t);
  for(let i=0;i<3;i++){h.boss('DRYAX','tier','8');h.boss('DRYAX','progress','100');h.click('#planReset');}
  h.boss('DRYAX','progress','10');
  assert.equal(h.amount(GREK,'coliseum'),50);assert.equal(h.state().bosses.DRYAX.tier,1);
  assert.equal(h.doc.querySelectorAll('.boss-control').length,4);
});

test('checklist is first, attached controls replace tabs, statuses, owned and packs',async t=>{
  const h=await setup(t);
  assert.equal(h.get('main').firstElementChild.id,'planner');
  assert.equal(h.doc.querySelector('.era-hero, .era-jumps, .plan-summary, [data-owned], [data-pack], #planCur, #packAdd'),null);
  assert.equal(h.doc.querySelector('.era-reference, .era-source, .planner-help'),null);
  assert.ok([...h.doc.querySelectorAll('[data-field="tier"]')].every(el=>el.options.length===8));
  assert.equal(h.doc.querySelectorAll('main h1').length,1);
});

test('storage and network failure report their limits',async t=>{
  const h=await setup(t,{blocked:true});h.edit('#planTgt','1');assert.equal(h.amount(ERA,'need'),100);
  assert.match(h.get('#planSaveStatus').textContent,/Storage unavailable/);
  const failed=await setup(t,{failed:true});assert.match(failed.get('#planNeed').textContent,/could not load/);
  assert.equal(failed.get('#planTgt').disabled,true);
});
