// Retain original meshes/skin/texture bytes; simplify metadata for unit previews.
export function optimizeGameModel(buffer) {
  if(buffer.readUInt32LE(0)!==0x46546c67)throw new Error('Not a GLB model');
  const size=buffer.readUInt32LE(12),json=JSON.parse(buffer.subarray(20,20+size).toString());
  const clips=json.animations||[];
  const idle=clips.find(a=>/detailscreen.*idle/i.test(a.name))||clips.find(a=>/idle/i.test(a.name)&&!/hurt/i.test(a.name));
  if(idle)json.animations=[idle];else delete json.animations;
  for(const node of json.nodes||[])if(node.mesh!==undefined&&
      /shadow|glow|flare|tendril|impact|smoke|trail|skull|rurcrystal|pointhand/i.test(node.name||'')) {
    delete node.mesh;delete node.skin;
  }
  for(const material of json.materials||[]) {
    material.alphaMode='OPAQUE';delete material.alphaCutoff;material.doubleSided=true;
    if(material.pbrMetallicRoughness) {
      material.pbrMetallicRoughness.metallicFactor=0;
      material.pbrMetallicRoughness.roughnessFactor=.85;
    }
  }
  for(const mesh of json.meshes||[])for(const primitive of mesh.primitives||[])delete primitive.attributes.COLOR_0;
  let encoded=Buffer.from(JSON.stringify(json));
  encoded=Buffer.concat([encoded,Buffer.alloc((4-encoded.length%4)%4,32)]);
  const binary=buffer.subarray(20+size),header=Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);
  header.writeUInt32LE(20+encoded.length+binary.length,8);
  header.writeUInt32LE(encoded.length,12);header.writeUInt32LE(0x4e4f534a,16);
  return Buffer.concat([header,encoded,binary]);
}
