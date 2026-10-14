import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cadence, releaseDay } from '../assets/js/timeline-model.js';
const data = JSON.parse(fs.readFileSync(new URL('../assets/data/game-timeline.json', import.meta.url)));
test('timeline data retains every entry and valid ordered source periods', () => {
  assert.match(data.sha256,/^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(new URL('../assets/docs/game-timeline-source.pdf',import.meta.url)),false);
  assert.equal(data.entries.length,161); assert.equal(data.periods.length,69);
  assert.equal(data.verification.unmappedGlyphs,0);
  for(const e of data.entries){assert.ok(e.periods.length); assert.equal(e.name,e.sourceText.replace(/\s+/g,' ').trim());for(const id of e.periods)assert.ok(data.periods[id]);}
  assert.equal(data.periods.find(p=>p.year===2024&&p.label==='February').days,29);
  assert.equal(data.entries.find(e=>e.name==='IG-12 and Grogu').units,1);
  assert.equal(data.entries.find(e=>e.name==='000 and BT-1').units,2);
});
test('rates use actual elapsed days and count spanning entries only once', () => {
 const d={periods:[{id:0,days:31},{id:1,days:28}],entries:[{periods:[0,1],track:'conquest',units:1},{periods:[1],track:'marquee',units:2}]};
 const a=cadence(d,d.periods,'all');assert.equal(a.count,3);assert.equal(a.rate,3*28/59);assert.deepEqual(a.rows.map(p=>p.count),[1,2]);
 assert.equal(cadence(d,[d.periods[1]],'conquest').count,0);
 assert.equal(cadence(d,d.periods,'marquee').count,2);
});
test('model days apply only to the two episode main rows, never to calendar months or other tracks',()=>{
 assert.equal(releaseDay({track:'marquee',sourceRow:5},{era:'Era'}),1);
 assert.equal(releaseDay({track:'marquee',sourceRow:6},{era:'Era'}),14);
 assert.equal(releaseDay({track:'marquee',sourceRow:7},{era:'Era'}),null);
 assert.equal(releaseDay({track:'conquest',sourceRow:0},{era:'Era'}),null);
 assert.equal(releaseDay({track:'marquee',sourceRow:5},{era:null}),null);
});
test('constant episode cadence has zero fluctuation and missing entries lower the rate',()=>{
 const p=[{id:0,days:28},{id:1,days:28}];
 const entries=p.map(x=>({periods:[x.id],track:'marquee',units:2}));
 assert.equal(cadence({entries},p).deviation,0);
 assert.equal(cadence({entries:entries.slice(0,1)},p).rate,1);
 assert.equal(cadence({entries:entries.slice(0,1)},p).deviation,1);
});
