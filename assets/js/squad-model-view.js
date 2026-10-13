import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();
let catalog;
function modelCatalog() {
  return catalog ??= fetch('/assets/data/game-models.json',{cache:'no-cache'}).then(async response=>{
    if(!response.ok) throw new Error('Model catalog unavailable');
    return response.json();
  });
}
const assets = new Map();
function trimCache() {
  const active = new Set(views.map(view=>view.canvas.dataset.model));
  for(const id of cache.keys()) {
    if(cache.size<=16)break;
    if(active.has(id) || !assets.has(id))continue;
    const model=assets.get(id),disposed=new Set();
    model.scene.traverse(object=>{
      object.geometry?.dispose();
      for(const material of [].concat(object.material||[])) {
        for(const value of Object.values(material)) if(value?.isTexture && !disposed.has(value)) {
          disposed.add(value);value.dispose();value.image?.close?.();
        }
        material.dispose();
      }
    });
    cache.delete(id);assets.delete(id);
  }
}
const fullPacks = new Map();
let renderer, views = [], frame, generation = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function load(id) {
  if (!cache.has(id)) cache.set(id, (async()=>{
    const entry=(await modelCatalog()).models[id];
    if(!entry) throw new Error('No original model for '+id);
    if(!entry.pack) return loader.loadAsync(entry.path);
    let buffer;
    if(fullPacks.has(entry.pack)) buffer=fullPacks.get(entry.pack).slice(entry.offset,entry.offset+entry.bytes);
    else {
      const response=await fetch(entry.pack,{headers:{Range:'bytes='+entry.offset+'-'+(entry.offset+entry.bytes-1)}});
      if(!response.ok) throw new Error('Model download failed');
      const bytes=await response.arrayBuffer();
      if(response.status===206)buffer=bytes;
      else { fullPacks.set(entry.pack,bytes); buffer=bytes.slice(entry.offset,entry.offset+entry.bytes); }
    }
    if(buffer.byteLength!==entry.bytes)throw new Error('Incomplete model data');
    return loader.parseAsync(buffer,'');
  })().then(model=>{assets.set(id,model);trimCache();return model;}).catch(error=>{cache.delete(id);throw error;}));
  const promise=cache.get(id);cache.delete(id);cache.set(id,promise);
  return promise;
}

function draw(time) {
  if(time-(draw.last||0)<32) { frame=requestAnimationFrame(draw);return; }
  const delta = Math.min((time - (draw.last || time)) / 1000, 0.05);
  draw.last = time;
  for (const view of views) {
    if (!view.scene || !view.canvas.isConnected) continue;
    const rect = view.canvas.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || !rect.width) continue;
    const width = Math.round(rect.width), height = Math.round(rect.height);
    if (view.canvas.width !== width || view.canvas.height !== height) {
      view.canvas.width = width; view.canvas.height = height;
    }
    renderer.setSize(width, height, false);
    view.camera.aspect = width / height; view.camera.updateProjectionMatrix();
    if (!reducedMotion.matches) view.mixer?.update(delta);
    renderer.render(view.scene, view.camera);
    view.context.clearRect(0, 0, width, height);
    view.context.drawImage(renderer.domElement, 0, 0);
  }
  if (views.length) frame = requestAnimationFrame(draw);
}

export async function mountModelPreviews(root) {
  generation++; const current = generation;
  views.forEach(view=>view.mixer?.stopAllAction());
  cancelAnimationFrame(frame); views = []; draw.last = 0;
  const canvases = [...root.querySelectorAll('canvas[data-model]')];
  if (!canvases.length) return;
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, powerPreference:'low-power' });
    renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  for (const canvas of canvases) {
    const view = { canvas, context:canvas.getContext('2d') }; views.push(view);
    load(canvas.dataset.model).then(gltf => {
      if (current !== generation || !canvas.isConnected) return;
      // Each character is unique in a formation; its cached rig can be reused.
      const model = gltf.scene;
      model.traverse(object => {
        if (!object.isMesh) return;
        if (/shadow|glow|flare|tendril|impact|smoke|trail|skull|rurcrystal|pointhand/i.test(object.name)) object.visible = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          material.roughness = 0.85; material.metalness = 0;
          // Vertex colors are effect masks, rather than albedo tint, in these shaders.
          material.vertexColors = false;
          // The game uses texture alpha as shader data on opaque unit surfaces.
          material.transparent = false; material.opacity = 1; material.alphaTest = 0;
          material.side = THREE.DoubleSide; material.needsUpdate = true;
        }
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xe4f5ff, 0x203041, 2.8));
      const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(3, 5, 6); scene.add(light);
      scene.add(model); model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3()), height = Math.max(size.y, 0.00001);
      const camera = new THREE.PerspectiveCamera(25, 1, height / 100, height * 30);
      camera.position.set(center.x, bounds.min.y + height * 0.76, center.z + height * 1.45);
      camera.lookAt(center.x, bounds.min.y + height * 0.76, center.z);
      view.scene = scene; view.camera = camera;
      const clip = gltf.animations.find(a => /detailscreen.*idle/i.test(a.name))
        || gltf.animations.find(a => /idle/i.test(a.name));
      if (clip) { view.mixer = new THREE.AnimationMixer(model); view.mixer.clipAction(clip).play(); view.mixer.update(0); }
      canvas.closest('.sp-slot').classList.add('model-ready');
    }).catch(error => { console.error('Model preview',canvas.dataset.model,error); canvas.closest('.sp-slot')?.classList.add('model-unavailable'); });
  }
  frame = requestAnimationFrame(draw);
}
