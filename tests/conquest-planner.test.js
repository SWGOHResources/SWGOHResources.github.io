import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

/* conquest.js skips page wiring without a #cqApp element, leaving the
   pure planner math globals available. Engine fns used by
   findConquestEntry are stubbed (changeover hour only). */
const source = fs.readFileSync(new URL('../assets/js/conquest.js', import.meta.url), 'utf8');
const context = { console, Date, Math, Number, String, Object, Array, JSON, stdHour: () => 18 };
vm.createContext(context);
vm.runInContext(source, context);
const run = src => vm.runInContext(src, context);
const js = (src) => JSON.parse(run(`JSON.stringify(${src})`));

const diff = {
  crates: [
    { name: 'Carbon Crate', at: 100 },
    { name: 'Gold Crate', at: 530 },
    { name: 'Red Crate', at: 630 },
  ],
  groups: [
    { name: 'Global feats', feats: [{ id: 'g1', title: 'Win 40 battles', desc: { hard: 'Win 40 battles' }, keycards: 15 }, { id: 'g2', title: 'Easy one', desc: { hard: 'Easy one' }, keycards: 1 }] },
    { name: 'Sector 1', feats: [{ id: 's1', title: 'Stagger 60 times', desc: { hard: 'Stagger 60 times' }, keycards: 5 }] },
  ],
};

test('plan totals add picked feats to battle stars', () => {
  assert.deepEqual(js(`planTotals(${JSON.stringify(diff)}, ['g1', 's1'], 210, 210)`), {
    featTotal: 20, maxFeatTotal: 21, total: 230, maxTotal: 231,
  });
  assert.deepEqual(js(`planTotals(${JSON.stringify(diff)}, [], 0, 210)`), {
    featTotal: 0, maxFeatTotal: 21, total: 0, maxTotal: 231,
  });
});

test('stars clamp to zero and maxStars', () => {
  assert.equal(run(`planTotals(${JSON.stringify(diff)}, [], 999, 210).total`), 210);
  assert.equal(run(`planTotals(${JSON.stringify(diff)}, [], -5, 210).total`), 0);
});

test('crate lookup finds earned crate and distance to next', () => {
  const crates = JSON.stringify(diff.crates);
  assert.deepEqual(js(`crateFor(${crates}, 50)`), {
    earned: null, next: { name: 'Carbon Crate', at: 100 }, remaining: 50,
  });
  assert.deepEqual(js(`crateFor(${crates}, 600)`), {
    earned: { name: 'Gold Crate', at: 530 }, next: { name: 'Red Crate', at: 630 }, remaining: 30,
  });
  assert.deepEqual(js(`crateFor(${crates}, 700)`), {
    earned: { name: 'Red Crate', at: 630 }, next: null, remaining: 0,
  });
});

test('skippable counts keycards above the top crate', () => {
  assert.equal(run(`skippableToTop(${JSON.stringify(diff)}, ${JSON.stringify(diff.crates)}, 210)`), 0);
  assert.equal(run(`skippableToTop(${JSON.stringify(diff)}, ${JSON.stringify(diff.crates)}, 700)`), 91);
});

test('hard groups follow the feat sheet 4/2/2 split', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../assets/data/conquest-planner.json', import.meta.url), 'utf8'));
  const hard = data.conquests[0].difficulties.hard;
  const kinds = g => g.feats.map(f => f.kind);
  for (const g of hard.groups) {
    if (g.name === 'Global feats') {
      assert.ok(g.feats.every(f => f.kind === 'global'));
    } else {
      assert.deepEqual(kinds(g).filter(k => k === 'sector').length, 4, `${g.name} sector feats`);
      assert.deepEqual(kinds(g).filter(k => k === 'miniboss').length, 2, `${g.name} miniboss feats`);
      assert.deepEqual(kinds(g).filter(k => k === 'boss').length, 2, `${g.name} boss feats`);
    }
  }
});

test('every crate tier has genuine chest art on disk', () => {
  const art = run('CRATE_ART');
  for (const tier of ['Carbon', 'Bronze', 'Black', 'Steel', 'Silver', 'Gold', 'Red']) {
    assert.ok(art[tier], `${tier} mapped`);
    assert.ok(
      fs.existsSync(new URL(`../assets/img/${art[tier]}`, import.meta.url)),
      `missing crate art: ${art[tier]}`,
    );
  }
});

test('doing everything hits the expected max total per difficulty', () => {
  // Pinned end amounts: all feats + max battle stars. Hard matches the
  // published feat sheet plus 330 battle stars (22 battles x 3 stars x 5
  // sectors: 20 combat + mini + boss per sector). If the feat list or
  // values change, update these numbers deliberately.
  const expected = { hard: 664 };
  const data = JSON.parse(fs.readFileSync(new URL('../assets/data/conquest-planner.json', import.meta.url), 'utf8'));
  const cq = data.conquests[0];
  for (const [name, want] of Object.entries(expected)) {
    const dd = cq.difficulties[name];
    const ids = dd.groups.flatMap(g => g.feats.map(f => f.id));
    const t = js(`planTotals(${JSON.stringify(dd)}, ${JSON.stringify(ids)}, ${cq.maxStars}, ${cq.maxStars})`);
    assert.equal(t.total, want, `${name} max total`);
    assert.equal(t.total, t.maxTotal, `${name} total is the max`);
  }
});

test('chain gates parse out of feat descriptions', () => {
  assert.equal(run(`chainRequires('Attempt this (Complete the "Stand Your Ground" feat or buy Pass+)')`), 'Stand Your Ground');
  assert.equal(run(`chainRequires('Win 10 battles, no gate here')`), null);
  assert.equal(run(`chainRequires(null)`), null);
});

test('feat descriptions resolve per difficulty with fallback', () => {
  assert.equal(run(`featDesc({ desc: { easy: 'E', hard: 'H' } }, 'easy')`), 'E');
  assert.equal(run(`featDesc({ desc: { hard: 'H' } }, 'normal')`), 'H');
  assert.equal(run(`featDesc({ desc: {} }, 'hard')`), '');
  assert.equal(run(`featDesc(null, 'hard')`), '');
});

test('entry selection follows the changeover-anchored window', () => {
  const data = {
    conquests: [
      { id: 'past', starts: '2026-08-31', ends: '2026-09-13', crates: [], groups: [] },
      { id: 'live', starts: '2026-09-28', ends: '2026-10-11', crates: [], groups: [] },
    ],
  };
  const d = JSON.stringify(data);
  assert.equal(run(`findConquestEntry(${d}, Date.parse('2026-10-01T12:00:00Z')).entry.id`), 'live');
  assert.equal(run(`findConquestEntry(${d}, Date.parse('2026-10-01T12:00:00Z')).state`), 'active');
  assert.equal(run(`findConquestEntry(${d}, Date.parse('2026-09-20T12:00:00Z')).entry.id`), 'live');
  assert.equal(run(`findConquestEntry(${d}, Date.parse('2026-09-20T12:00:00Z')).state`), 'upcoming');
  assert.equal(run(`findConquestEntry(${d}, Date.parse('2026-10-20T12:00:00Z')).entry.id`), 'live');
  assert.equal(run(`findConquestEntry(${d}, Date.parse('2026-10-20T12:00:00Z')).state`), 'past');
});

test('shipped planner data is sound on every difficulty', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../assets/data/conquest-planner.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(data.conquests) && data.conquests.length > 0);
  for (const c of data.conquests) {
    assert.ok(c.shardUnits?.primary?.name && c.shardUnits?.secondary?.name, 'shard units named');
    for (const u of [c.shardUnits.primary, c.shardUnits.secondary]) {
      assert.ok(fs.existsSync(new URL(`../assets/img/${u.art}`, import.meta.url)), `missing shard art: ${u.art}`);
    }
    assert.ok(c.id && c.title && c.starts && c.ends);
    assert.ok(Date.parse(c.starts + 'T00:00:00Z') < Date.parse(c.ends + 'T00:00:00Z'));
    assert.ok(c.difficulties && c.difficulties.hard, 'hard difficulty required');
    for (const [name, dd] of Object.entries(c.difficulties)) {
      const ats = dd.crates.map(k => k.at);
      assert.deepEqual(ats, [...ats].sort((a, b) => a - b), `${name} ladder sorted`);
      assert.ok(ats.length > 0 && ats[ats.length - 1] >= 630, `${name} tops at Red`);
      const ids = [];
      for (const g of dd.groups) {
        assert.ok(g.name && Array.isArray(g.feats), `${name} group shape`);
        for (const f of g.feats) {
          assert.ok(f.id && f.title, `${name} feat shape`);
          assert.ok(Number.isFinite(Number(f.keycards)) && Number(f.keycards) >= 0, `${f.id} keycards`);
          const text = f.desc?.[name] ?? f.desc?.hard ?? Object.values(f.desc ?? {})[0];
          assert.ok(typeof text === 'string' && text.length > 0, `${f.id} has ${name} text`);
          if (f.art) {
            assert.ok(
              fs.existsSync(new URL(`../assets/img/${f.art}`, import.meta.url)),
              `missing art file: ${f.art}`,
            );
          }
          ids.push(f.id);
        }
      }
      assert.deepEqual(ids, [...new Set(ids)], `${name} feat ids unique`);
      for (const c of dd.crates) {
        assert.ok(Number.isFinite(Number(c.shards?.primary)) && Number.isFinite(Number(c.shards?.secondary)), `${c.name} shard payout`);
      }
      for (const f of dd.groups.flatMap(g => g.feats)) {
        assert.ok(['global', 'sector', 'miniboss', 'boss'].includes(f.kind), `${f.id} has a kind`);
      }
    }
  }
});
