// Rebuild web models from the original Windows bundles.
// Usage: node scripts/prepare-game-models.mjs --work <temporary folder>
//   --exporter <AssetStudioModCLI.exe> --converter <FBX2glTF.exe>
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { brotliDecompressSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packGameModels } from './pack-game-models.mjs';
import { optimizeGameModel } from './optimize-game-model.mjs';

const args = new Map();
for (let i=2;i<process.argv.length;i+=2) args.set(process.argv[i],process.argv[i+1]);
for (const key of args.keys()) if (!['--work','--exporter','--converter'].includes(key)) throw new Error('Unknown argument: '+key);
const work=args.get('--work'), exporter=args.get('--exporter'), converter=args.get('--converter');
if (!work || !exporter || !converter) throw new Error('Supply --work, --exporter and --converter.');
const root=fileURLToPath(new URL('../',import.meta.url)), snapshot=JSON.parse(await readFile(path.join(root,'assets/data/squad-planner.json'),'utf8'));
const version=JSON.parse(await readFile(path.join(root,'assets/data/client-version.json'),'utf8')).server.asset;
const base='https://eaassets-a.akamaihd.net/assetssw.capitalgames.com/PROD/'+version+'/Windows/ETC/';
async function get(url) { const r=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error(url+': '+r.status);return Buffer.from(await r.arrayBuffer()); }
function fields(bytes) {
  let cursor=0;
  function varint() {let value=0n,shift=0n;while(cursor<bytes.length){const b=bytes[cursor++];value|=BigInt(b&127)<<shift;if(!(b&128))return value;shift+=7n;}throw new Error('Truncated manifest');}
  const out=[];
  while(cursor<bytes.length){const tag=Number(varint()),wire=tag&7;let value;
    if(wire===0)value=varint();
    else if(wire===2){const n=Number(varint());value=bytes.subarray(cursor,cursor+n);cursor+=n;}
    else if(wire===1)cursor+=8;else if(wire===5)cursor+=4;else throw new Error('Unsupported protobuf wire type');
    out.push([tag>>3,value]);
  }return out;
}
const manifestBytes=await get(base+'manifest.data'), records=fields(manifestBytes).filter(([n])=>n===2).map(([,b])=>{
  const f=fields(b);return {name:f.find(([n])=>n===1)[1].toString(),dependencies:f.filter(([n])=>n===9).map(([,v])=>v.toString())};
});
const byName=new Map(records.map(r=>[r.name.toLowerCase(),r]));
const raw=JSON.parse(brotliDecompressSync(await get('https://raw.githubusercontent.com/swgoh-utils/gamedata/'+snapshot.sourceCommit+'/units.json.br')));
const rawUnits=new Map(raw.data.filter(u=>u.rarity===7).map(u=>[u.baseId,u]));
const units=snapshot.characters.map(u=>{
  const name=rawUnits.get(u.id).unitPrefab.replace(/^unit\./,'');const record=byName.get(name.toLowerCase());
  if(!record)throw new Error('Missing model bundle: '+name);return {id:u.id,bundle:record.name};
});
const names=new Set();
function include(name) { const record=byName.get(name.toLowerCase());if(!record)throw new Error('Missing dependency: '+name);if(names.has(record.name))return;names.add(record.name);record.dependencies.forEach(include); }
units.forEach(u=>include(u.bundle));
const input=path.join(work,'models-input'), fbx=path.join(work,'models-fbx'), output=path.join(work,'models-glb');
await Promise.all([mkdir(input,{recursive:true}),mkdir(output,{recursive:true})]);
let cursor=0;
await Promise.all(Array.from({length:4},async()=>{
  const list=[...names];while(cursor<list.length){const name=list[cursor++],file=path.join(input,name+'.bundle');
    try{await readFile(file);}catch{await writeFile(file,await get(base+name+'.bundle'));}
  }
}));
function run(exe,argv) { return new Promise((resolve,reject)=>{const child=spawn(exe,argv,{stdio:'ignore',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(path.basename(exe)+' exited '+code)));}); }
await run(exporter,[input,'-m','animator','--filter-by-name','^(unit\\.)?char_','--filter-with-regex','--fbx-animation','auto','--max-export-tasks','2','-o',fbx]);
async function walk(dir) {const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())result.push(...await walk(file));else if(e.name.endsWith('.fbx'))result.push(file);}return result;}
const files=await walk(fbx), entries={};
for (const unit of units) {
  const source=files.find(f=>path.basename(f,'.fbx').toLowerCase()==='unit.'+unit.bundle.toLowerCase()) ||
    files.find(f=>path.basename(f,'.fbx').toLowerCase()===unit.bundle.toLowerCase());
  if(!source)throw new Error('No exported rig for '+unit.id);
  const target=path.join(output,unit.id);
  await run(converter,['-i',source,'-o',target,'-b','--no-khr-lights-punctual']);
  const bytes=optimizeGameModel(await readFile(target+'.glb'));
  await writeFile(target+'.glb',bytes);
  entries[unit.id]={path:'/assets/models/units/'+unit.id+'.glb',bundle:unit.bundle,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  console.log(unit.id,bytes.length);
}
const packed=await packGameModels({schema:1,assetVersion:version,sourceCommit:snapshot.sourceCommit,models:entries},output,path.join(root,'assets/models/packs'));
await writeFile(path.join(root,'assets/data/game-models.json'),JSON.stringify(packed)+'\n');
