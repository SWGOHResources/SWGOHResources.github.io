import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('every planner character has an intact, independently loadable original rig', async () => {
  const catalog = JSON.parse(await readFile(new URL('assets/data/game-models.json', root)));
  const planner = JSON.parse(await readFile(new URL('assets/data/squad-planner.json', root)));
  assert.deepEqual(Object.keys(catalog.models).sort(), planner.characters.map(u => u.id).sort());
  const covered = new Set();
  for (const pack of catalog.packs) {
    const bytes = await readFile(new URL(pack.path.slice(1), root));
    assert.equal(bytes.length, pack.bytes);
    assert.equal(sha(bytes), pack.sha256);
    const entries = Object.entries(catalog.models).filter(([, entry]) => entry.pack === pack.path)
      .sort(([, a], [, b]) => a.offset - b.offset);
    let offset = 0;
    for (const [id, entry] of entries) {
      assert.equal(entry.offset, offset, id + ': contiguous range');
      const model = bytes.subarray(entry.offset, entry.offset + entry.bytes);
      assert.equal(model.length, entry.bytes, id);
      assert.equal(sha(model), entry.sha256, id);
      assert.equal(model.readUInt32LE(0), 0x46546c67, id + ': GLB magic');
      assert.equal(model.readUInt32LE(4), 2, id + ': GLB version');
      assert.equal(model.readUInt32LE(8), model.length, id + ': complete GLB');
      assert.equal(model.readUInt32LE(16), 0x4e4f534a, id + ': JSON chunk');
      const scene = JSON.parse(model.subarray(20, 20 + model.readUInt32LE(12)).toString());
      assert.ok(scene.meshes.length && scene.skins.length && scene.images.length, id + ': rig and textures');
      assert.ok((scene.animations || []).length <= 1, id + ': only preview animation');
      for (const mesh of scene.meshes) for (const primitive of mesh.primitives) {
        assert.equal(primitive.attributes.COLOR_0, undefined, id + ': shader mask excluded');
      }
      covered.add(id); offset += entry.bytes;
    }
    assert.equal(offset, bytes.length, 'No unused bytes in pack');
  }
  assert.equal(covered.size, planner.characters.length);
});
