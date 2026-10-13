import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Packs contain unmodified, self-contained GLB records. GitHub Pages supports
// byte ranges, so a five-unit squad still downloads only its five models.
export async function packGameModels(catalog,input,output,targetBytes=4*1024*1024) {
  await mkdir(output,{recursive:true});
  const models={},packs=[];let bytes=[],size=0,index=0,pending=[];
  async function flush() {
    if(!pending.length)return;
    const buffer=Buffer.concat(bytes),sha=createHash('sha256').update(buffer).digest('hex');
    const name=String(index++).padStart(3,'0')+'-'+sha.slice(0,12)+'.bin';
    await writeFile(path.join(output,name),buffer);
    const url='/assets/models/packs/'+name;
    for(const {id,entry,offset} of pending)models[id]={...entry,pack:url,offset,path:undefined};
    packs.push({path:url,bytes:buffer.length,sha256:sha});
    bytes=[];size=0;pending=[];
  }
  for(const [id,entry] of Object.entries(catalog.models).sort(([a],[b])=>a.localeCompare(b))) {
    const buffer=await readFile(path.join(input,id+'.glb'));
    if(buffer.readUInt32LE(0)!==0x46546c67 || buffer.readUInt32LE(8)!==buffer.length)throw new Error('Invalid GLB: '+id);
    if(createHash('sha256').update(buffer).digest('hex')!==entry.sha256)throw new Error('Model checksum mismatch: '+id);
    if(size && size+buffer.length>targetBytes)await flush();
    pending.push({id,entry,offset:size});bytes.push(buffer);size+=buffer.length;
  }
  await flush();
  return {...catalog,packFormat:'GLB byte ranges',models,packs};
}
