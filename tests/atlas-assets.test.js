import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

test('named atlas exports match their declared Unity rectangles and checksums', () => {
  const root = new URL('../assets/img/atlases/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('index.json', root), 'utf8'));
  assert.equal(manifest.coordinates, 'top-left pixels');
  const paths = new Set();
  let count = 0;
  for (const source of manifest.sources) {
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    for (const sprite of source.sprites) {
      assert.ok(sprite.name && sprite.atlas && sprite.texture);
      assert.equal(sprite.name, sprite.metadata.name);
      assert.ok(!sprite.path.includes('..'), 'sprite path must stay inside the atlas library');
      const key = sprite.path.toLowerCase();
      assert.ok(!paths.has(key), `case-insensitive path collision: ${sprite.path}`);
      paths.add(key);
      const png = fs.readFileSync(new URL(sprite.path, root));
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(png.readUInt32BE(16), sprite.metadata.width, sprite.path);
      assert.equal(png.readUInt32BE(20), sprite.metadata.height, sprite.path);
      assert.equal(createHash('sha256').update(png).digest('hex'), sprite.sha256, sprite.path);
      count++;
    }
  }
  assert.ok(count > 0, 'no atlas sprites exported');
});
