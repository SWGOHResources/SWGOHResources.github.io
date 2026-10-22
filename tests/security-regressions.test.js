import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function worker({failWrites=false}={}) {
  const handlers={}, entries=new Map(), deleted=[];
  let body='first', offline=false, fetches=0, status=200;
  const key=req=>typeof req==='string'?req:req.url;
  const cache={match:async req=>entries.get(key(req))?.clone(),put:async(req,res)=>{if(failWrites)throw Error('quota');entries.set(key(req),res);}};
  const context=vm.createContext({URL,Response,
    self:{location:{origin:'https://example.test'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>{handlers[name]=fn;}},
    caches:{open:async()=>cache,keys:async()=>['another-app','swgoh-schedule-v9','swgoh-schedule-v10','swgoh-schedule-v11'],delete:async name=>deleted.push(name)},
    fetch:async()=>{fetches++;if(offline)throw Error('offline');return new Response(body,{status});}
  });
  vm.runInContext(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),context);
  return {entries,deleted,handlers,set:options=>{({body=body,offline=offline,status=status}=options);},get fetches(){return fetches;},
    async request(path,{headers={},mode='cors'}={}) {
      let pending;const lifetime=[];
      handlers.fetch({request:{method:'GET',url:new URL(path,'https://example.test').href,headers:new Headers(headers),mode},respondWith:p=>{pending=p;},waitUntil:p=>lifetime.push(p)});
      if(!pending)return null;
      const res=await pending;await Promise.all(lifetime);return res;
    }
  };
}

test('activation deletes only caches owned by this app',async()=>{
  const h=worker();let pending;h.handlers.activate({waitUntil:p=>{pending=p;}});await pending;
  assert.deepEqual(h.deleted,['swgoh-schedule-v9','swgoh-schedule-v10']);
});
test('partial model requests and unrelated external requests bypass app caching',async()=>{
  const h=worker();
  assert.equal(await h.request('/assets/models/pack.bin',{headers:{Range:'bytes=10-19'}}),null);
  assert.equal(await h.request('https://third-party.test/personal-data'),null);
  assert.equal(h.fetches,0);assert.equal(h.entries.size,0);
});
test('every stable module revalidates and remains available offline',async()=>{
  const h=worker();
  for(const name of ['timeline-model','squad-model-view','squad-model','squad-export']){
    const path='/assets/js/'+name+'.js';h.set({body:'first',offline:false});
    assert.equal(await(await h.request(path)).text(),'first');h.set({body:'second'});
    assert.equal(await(await h.request(path)).text(),'second');h.set({offline:true});
    assert.equal(await(await h.request(path)).text(),'second');
  }
});
test('failed navigation cannot overwrite the last working offline page',async()=>{
  const h=worker();const path='/conquest/';
  assert.equal(await(await h.request(path,{mode:'navigate'})).text(),'first');
  h.set({body:'unavailable',status:503});assert.equal((await h.request(path,{mode:'navigate'})).status,503);
  h.set({offline:true});assert.equal(await(await h.request(path,{mode:'navigate'})).text(),'first');
  assert.equal((await h.request('/missing/',{mode:'navigate'})).type,'error');
});
test('cache quota errors do not prevent successful network responses',async()=>{
  const h=worker({failWrites:true});assert.equal(await(await h.request('/assets/data/live-events.json')).text(),'first');
});
test('unversioned font requests refresh in the background and keep an offline copy',async()=>{
  const h=worker();const url='https://fonts.googleapis.com/css2?family=Inter';
  assert.equal(await(await h.request(url)).text(),'first');h.set({body:'second'});
  assert.equal(await(await h.request(url)).text(),'first');h.set({offline:true});
  assert.equal(await(await h.request(url)).text(),'second');
});

function modelContext(fetch=async()=>{throw Error('unused');}) {
  const source=fs.readFileSync(new URL('../assets/js/squad-model-view.js',import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace('export async function','async function');
  const context=vm.createContext({fetch,AbortSignal,GLTFLoader:class{},matchMedia:()=>({matches:false})});
  vm.runInContext(source,context);return context;
}
test('model pack fallback cache stays within 16 MiB and evicts the least recent pack',()=>{
  const ctx=modelContext();
  vm.runInContext("for(let i=0;i<5;i++)rememberPack(String(i),new ArrayBuffer(4*1024*1024));",ctx);
  assert.equal(vm.runInContext('fullPacks.size',ctx),4);
  assert.equal(vm.runInContext("fullPacks.has('0')",ctx),false);
  vm.runInContext("rememberPack('1',fullPacks.get('1'));rememberPack('5',new ArrayBuffer(4*1024*1024));",ctx);
  assert.equal(vm.runInContext("fullPacks.has('1') && !fullPacks.has('2')",ctx),true);
  vm.runInContext("rememberPack('large',new ArrayBuffer(17*1024*1024));",ctx);
  assert.equal(vm.runInContext("fullPacks.has('large')",ctx),false);
});
test('a failed model catalog request can recover on the next attempt',async()=>{
  let attempts=0;const ctx=modelContext(async()=>{if(!attempts++)throw Error('offline');return {ok:true,json:async()=>({models:{}})};});
  await assert.rejects(vm.runInContext('modelCatalog()',ctx),/offline/);
  assert.deepEqual(await vm.runInContext('modelCatalog()',ctx),{models:{}});assert.equal(attempts,2);
});
