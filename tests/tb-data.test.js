import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const tbDataSource = fs.readFileSync(new URL('../assets/js/tb-data.js', import.meta.url), 'utf8');

function loadTbData() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(tbDataSource, context);
  return vm.runInContext('TB_TOOL_DATA', context);
}

test('tb data has at least one battle with a well-formed map', () => {
  const data = loadTbData();
  const ids = Object.keys(data);
  assert.ok(ids.length >= 1);
  for (const id of ids) {
    const tb = data[id];
    assert.equal(tb.id, id);
    assert.ok(tb.name && tb.planets);
    assert.ok(typeof tb.description === 'string' && tb.description.length > 0);
    if (tb.image != null) assert.ok(typeof tb.image === 'string' && tb.image.length > 0);
    const { cols, rows, sectors } = tb.map;
    assert.ok(Number.isInteger(cols) && cols > 0);
    assert.ok(Number.isInteger(rows) && rows > 0);
    assert.equal(sectors.length, cols * rows);
  }
});

test('tb sectors reference existing planets and ids are unique', () => {
  const data = loadTbData();
  for (const tb of Object.values(data)) {
    const sectorIds = new Set();
    for (const sec of tb.map.sectors) {
      assert.ok(sec.id && sec.name);
      assert.ok(!sectorIds.has(sec.id), `duplicate sector ${sec.id}`);
      sectorIds.add(sec.id);
      if (sec.planet != null) assert.ok(tb.planets[sec.planet], `missing planet ${sec.planet}`);
    }
  }
});

test('tb missions have unique ids, valid coords and 5-unit teams', () => {
  const data = loadTbData();
  for (const tb of Object.values(data)) {
    for (const planet of Object.values(tb.planets)) {
      assert.ok(planet.id && planet.name && Array.isArray(planet.missions));
      if (planet.image != null) assert.ok(typeof planet.image === 'string' && planet.image.length > 0);
      const missionIds = new Set();
      for (const m of planet.missions) {
        assert.ok(m.id && m.name);
        assert.ok(!missionIds.has(m.id), `duplicate mission ${m.id}`);
        missionIds.add(m.id);
        if (m.x != null) assert.ok(m.x >= 0 && m.x <= 100);
        if (m.y != null) assert.ok(m.y >= 0 && m.y <= 100);
        if (m.image != null) assert.ok(typeof m.image === 'string' && m.image.length > 0);
        assert.ok(Array.isArray(m.teams));
        for (const t of m.teams) {
          assert.ok(t.name, `team in ${m.id} needs a name`);
          // SWGOH comps are exactly 5 units.
          if (t.members != null) assert.equal(t.members.length, 5, `team "${t.name}" must list 5 units`);
        }
      }
    }
  }
});
