import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newPlan, blankSquad, assignUnit, changeSize, changeMode, normalizePlan,
  encodePlan, decodePlan, modeMatches, leaderText, omicronStatus } from '../assets/js/squad-model.js';
import { buildSquadData, cleanText } from '../scripts/build-squad-data.mjs';

const data = JSON.parse(await readFile(new URL('../assets/data/squad-planner.json', import.meta.url), 'utf8'));
const units = data.characters, find = id => units.find(u => u.id === id);
function withOmicrons(id, size = 5) {
  const p = newPlan(); p.size = size;
  p.options[id] = { relic: 7, stars: 7, omicrons: find(id).abilities.filter(a => a.omicron).map(a => a.id) };
  return p;
}
test('swapping assigned characters across squads preserves both occupants without duplicates', () => {
  const p = newPlan(); p.banks[5].push(blankSquad(5));
  assignUnit(p, 'BT1', 0, 1); assignUnit(p, 'TRIPLEZERO', 1, 0); assignUnit(p, 'BT1', 1, 0);
  assert.equal(p.banks[5][0].slots[1], 'TRIPLEZERO'); assert.equal(p.banks[5][1].slots[0], 'BT1');
  assert.equal(p.banks[5].flatMap(s => s.slots).filter(Boolean).length, 2);
  assignUnit(p, 'BT1', 0, 0);
  assert.equal(p.banks[5][1].slots[0], null); assert.equal(p.banks[5][0].slots[0], 'BT1');
});
test('switching formats preserves the entire five-unit lineup', () => {
  const p = newPlan(); ['DOCTORAPHRA','BT1','TRIPLEZERO','IG90','B2SUPERBATTLEDROID'].forEach((id, i) => assignUnit(p, id, 0, i));
  const original = [...p.banks[5][0].slots]; changeSize(p, 3); assignUnit(p, 'VADER', 0, 0); changeSize(p, 5);
  assert.deepEqual(p.banks[5][0].slots, original); assert.equal(p.banks[3][0].slots[0], 'VADER');
});
test('battle modes keep legal sizes and 3v3 returns to Grand Arena', () => {
  const p = newPlan(); changeSize(p, 3); changeMode(p, 'tw'); assert.equal(p.size, 5);
  changeSize(p, 3); assert.equal(p.mode, 'gac');
});
test('Aphra 5v5 Omicrons and BT-1 3v3 Omicron do not apply in the opposite format', () => {
  const a = find('DOCTORAPHRA').abilities.find(a => a.type === 'Leader'), b = find('BT1').abilities.find(a => a.omicron);
  assert.equal(modeMatches(a.omicron, 'gac', 5), true); assert.equal(modeMatches(a.omicron, 'gac', 3), false);
  assert.equal(modeMatches(b.omicron, 'gac', 3), true); assert.equal(modeMatches(b.omicron, 'gac', 5), false);
  assert.equal(modeMatches(b.omicron, 'tw', 5), false); assert.equal(modeMatches(b.omicron, 'other', 3), false);
});
test('leader Omicrons require the first slot, equipped status and correct mode', () => {
  const u = find('DOCTORAPHRA'), a = u.abilities.find(a => a.type === 'Leader'), p = withOmicrons(u.id);
  assert.equal(omicronStatus(p, u, a, 0).kind, 'eligible');
  assert.equal(omicronStatus(p, u, a, 1).label, 'Requires leader slot');
  assert.equal(leaderText(p, u).text, a.omicron.text);
  p.mode = 'tw'; assert.equal(leaderText(p, u).text, a.baseText);
  p.options[u.id].omicrons = []; assert.equal(omicronStatus(p, u, a, 0).kind, 'off');
  assert.equal(leaderText(p, find('BT1')), null);
});
test('TW/TB/Conquest/Raid modes map from the actual game enums', () => {
  for (const [scope, mode] of [[8,'tw'],[7,'tb'],[11,'conquest'],[4,'raid']]) {
    assert.equal(modeMatches({ mode: scope }, mode, 5), true);
    assert.equal(modeMatches({ mode: scope }, 'gac', 5), false);
  }
  assert.equal(modeMatches({ mode: 999 }, 'other', 5), false);
});
test('full conditional Omicron text is retained rather than promising automatic activation', () => {
  const a = find('MERRIN').abilities.find(a => a.omicron);
  assert.match(a.omicron.text, /there are no Galactic Legends/i);
  const p = withOmicrons('MERRIN'); assert.equal(omicronStatus(p, find('MERRIN'), a, 2).label, 'Mode applies · check kit conditions');
  assert.equal(find('GUNGANPHALANX').abilities.find(a => a.omicron).omicron.mode, 8);
});
test('share links round-trip Unicode, both formats and equipment selections', () => {
  const p = withOmicrons('DOCTORAPHRA'); p.title = 'Dom’s plan ✨'; assignUnit(p, 'DOCTORAPHRA', 0, 0);
  p.banks[3][0].name = 'Îmwe & friends'; p.banks[3][0].slots[0] = 'CHIRRUTIMWE';
  assert.deepEqual(decodePlan(encodePlan(p), units), p);
});
test('import validation bounds input and drops duplicate/unknown characters and upgrades', () => {
  const p = newPlan(); p.banks[5][0].slots = ['BT1','BT1','DOES_NOT_EXIST',null,null];
  p.options.BT1 = { relic: 99, stars: -2, omicrons: ['not-a-skill'] };
  const clean = normalizePlan(p, units);
  assert.deepEqual(clean.banks[5][0].slots, ['BT1',null,null,null,null]);
  assert.deepEqual(clean.options.BT1, { relic:7, stars:7, omicrons:[] });
  assert.throws(() => normalizePlan({ ...p, banks:{3:[],5:[]} }, units));
  assert.throws(() => decodePlan('x'.repeat(100001), units)); assert.throws(() => decodePlan('not a link', units));
});
test('snapshot is complete, localized and uses a unique atlas position per collectible character', () => {
  assert.ok(units.length >= 300); assert.ok(data.factions.length >= 35);
  assert.equal(new Set(units.map(u => u.id)).size, units.length); assert.equal(new Set(units.map(u => u.portrait)).size, units.length);
  for (const u of units) {
    assert.ok(u.name && u.role); assert.ok(u.portrait < data.atlas.columns * data.atlas.rows);
    for (const a of u.abilities) { assert.ok(a.name && a.baseText); assert.doesNotMatch(a.baseText, /\\n|\[c\]|\[\/c\]/); if (a.omicron) assert.ok(a.omicron.label && a.omicron.text); }
  }
  assert.ok(find('DOCTORAPHRA').factions.includes('profession_scoundrel'));
  assert.ok(!find('DOCTORAPHRA').factions.includes('species_droid'));
});
test('data builder rejects mixed game versions and strips formatting without losing paragraphs', () => {
  assert.throws(() => buildSquadData({ units:{version:'a'}, ability:{version:'b'}, skill:{version:'a'}, category:{version:'a'} }, 'test'), /different versions/);
  assert.equal(cleanText('[c][E7E7E7]While in Grand Arenas:[-][/c]\\n\\nText'), 'While in Grand Arenas:\n\nText');
});
