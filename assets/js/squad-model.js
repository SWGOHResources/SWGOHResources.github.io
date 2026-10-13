export const MODES = { gac: 'Grand Arena', tw: 'Territory Wars', tb: 'Territory Battles', conquest: 'Conquest', raid: 'Raids', other: 'Other battles' };
export const STORAGE_KEY = 'swgoh-squad-planner-v1';
export const MAX_SQUADS = 20;

export function blankSquad(size, name = 'New squad') {
  return { name, slots: Array(size).fill(null) };
}
export function newPlan() {
  return { schema: 1, title: 'My squad plan', size: 5, mode: 'gac',
    banks: { 3: [blankSquad(3, 'Squad 1')], 5: [blankSquad(5, 'Squad 1')] }, options: {} };
}
export function unitOptions(plan, unit) {
  const saved = plan.options[unit.id];
  return { relic: saved?.relic ?? 7, stars: saved?.stars ?? 7, omicrons: saved?.omicrons ?? [] };
}
// Planned GP: level 85, gear XIII, six level-15 6E mods and max base skills.
// The game table's relic tier is displayed relic level + 2.
export function plannedPower(plan, unit, powerData) {
  const profile = powerData?.units?.[unit?.id];
  if (!profile) return 0;
  const options = unitOptions(plan, unit), tier = options.relic + 2;
  const upgrades = options.omicrons.reduce((sum, id) => sum + (profile.omicrons[id] || 0), 0);
  const relic = options.relic ? (powerData.relic[tier] || 0) + powerData.level * (powerData.relicLevel[tier] || 0) : 0;
  return Math.floor(1.5 * (profile.base + (powerData.rarity[options.stars] || 0) + relic + upgrades));
}
export function modeMatches(omicron, mode, size) {
  const scope = omicron.mode;
  if (scope === 1) return true;
  if (scope === 2) return ['tb', 'conquest', 'raid'].includes(mode);
  if (scope === 3) return ['gac', 'tw'].includes(mode);
  if (scope === 4) return mode === 'raid';
  if ([5, 6, 7].includes(scope)) return mode === 'tb';
  if (scope === 8) return mode === 'tw';
  if (scope === 9) return mode === 'gac';
  if (scope === 11) return mode === 'conquest';
  if (scope === 14) return mode === 'gac' && size === 3;
  if (scope === 15) return mode === 'gac' && size === 5;
  // "Other" is deliberately not a catch-all for specific game modes.
  return false;
}
export function omicronStatus(plan, unit, ability, slot) {
  if (!unitOptions(plan, unit).omicrons.includes(ability.id)) return { kind: 'off', label: 'Not equipped' };
  if (ability.type === 'Leader' && slot !== 0) return { kind: 'inactive', label: 'Requires leader slot' };
  if (!modeMatches(ability.omicron, plan.mode, plan.size)) return { kind: 'inactive', label: 'Inactive in this mode' };
  return { kind: 'eligible', label: 'Mode applies · check kit conditions' };
}
export function leaderText(plan, unit) {
  const ability = unit?.abilities.find(a => a.type === 'Leader');
  if (!ability) return null;
  const useOmicron = ability.omicron && omicronStatus(plan, unit, ability, 0).kind === 'eligible';
  return { ability, text: useOmicron ? ability.omicron.text : ability.baseText, useOmicron };
}
export function assignUnit(plan, id, squadIndex, slotIndex) {
  const squads = plan.banks[plan.size];
  const target = squads[squadIndex];
  if (!target || slotIndex < 0 || slotIndex >= plan.size) return false;
  const previous = target.slots[slotIndex];
  for (const squad of squads) {
    const found = squad.slots.indexOf(id);
    if (found >= 0) {
      if (squad === target && found === slotIndex) return true;
      squad.slots[found] = previous;
      break;
    }
  }
  target.slots[slotIndex] = id;
  return true;
}
export function changeSize(plan, size) {
  plan.size = size === 3 ? 3 : 5;
  if (plan.size === 3 && plan.mode !== 'gac' && plan.mode !== 'other') plan.mode = 'gac';
}
export function changeMode(plan, mode) {
  if (!Object.hasOwn(MODES, mode)) return;
  plan.mode = mode;
  if (mode !== 'gac' && mode !== 'other') plan.size = 5;
}

// Validate imported/storage data before it can affect the UI. Bound sizes,
// deduplicate each format, discard unavailable units and unknown upgrades.
export function normalizePlan(input, characters) {
  if (!input || input.schema !== 1 || typeof input.title !== 'string' || !input.banks
    || ![3, 5].includes(input.size) || !Object.hasOwn(MODES, input.mode)) throw new Error('This is not a supported squad plan.');
  const units = new Map(characters.map(u => [u.id, u]));
  const out = newPlan();
  out.title = input.title.slice(0, 100);
  out.size = input.size;
  out.mode = input.mode;
  for (const size of [3, 5]) {
    if (!Array.isArray(input.banks[size]) || input.banks[size].length < 1 || input.banks[size].length > MAX_SQUADS) throw new Error('A plan must have 1–20 squads per format.');
    const used = new Set();
    out.banks[size] = input.banks[size].map((s, i) => {
      if (!s || typeof s.name !== 'string' || !Array.isArray(s.slots) || s.slots.length !== size) throw new Error('Invalid squad slots.');
      return { name: s.name.slice(0, 80) || `Squad ${i + 1}`, slots: s.slots.map(id => {
        if (!units.has(id) || used.has(id)) return null;
        used.add(id); return id;
      }) };
    });
  }
  if (input.options && typeof input.options === 'object') {
    for (const [id, value] of Object.entries(input.options)) {
      const u = units.get(id);
      if (!u || !value || typeof value !== 'object') continue;
      const available = new Set(u.abilities.filter(a => a.omicron).map(a => a.id));
      out.options[id] = { relic: Number.isInteger(value.relic) && value.relic >= 0 && value.relic <= 10 ? value.relic : 7,
        stars: Number.isInteger(value.stars) && value.stars >= 1 && value.stars <= 7 ? value.stars : 7,
        omicrons: [...new Set((Array.isArray(value.omicrons) ? value.omicrons : []).filter(a => available.has(a)))] };
    }
  }
  if (out.mode !== 'gac' && out.mode !== 'other') out.size = 5;
  return out;
}
export function encodePlan(plan) {
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodePlan(encoded, characters) {
  if (typeof encoded !== 'string' || encoded.length > 100000 || !/^[\w-]+$/.test(encoded)) throw new Error('Invalid or oversized share link.');
  const raw = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  return normalizePlan(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, c => c.charCodeAt(0)))), characters);
}
