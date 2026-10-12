// Convert the public Comlink game-data mirror into a small browser snapshot.
// Uses game enums and English localization; no hand-maintained faction/kit list.
export const OMICRON_MODES = {
  1: 'All modes', 2: 'PvE', 3: 'PvP', 4: 'Raids',
  5: 'Territory Battles · combat', 6: 'Territory Battles · special missions',
  7: 'Territory Battles', 8: 'Territory Wars', 9: 'Grand Arena',
  10: 'Squad Arena', 11: 'Conquest', 12: 'Galactic Challenges',
  13: 'PvE events', 14: 'Grand Arena · 3v3', 15: 'Grand Arena · 5v5',
  16: 'Galactic Challenges · 3v3', 17: 'Galactic Challenges · 5v5',
};

export function cleanText(value) {
  return String(value ?? '').replace(/\\n/g, '\n')
    .replace(/\[(?:\/?[a-z]+|[0-9a-f]{6}|-)\]/gi, '')
    .replace(/\r/g, '').trim();
}

export function buildSquadData(raw, sourceCommit, generatedAt = new Date().toISOString()) {
  const collections = ['units', 'ability', 'skill', 'category'];
  if (new Set(collections.map(k => raw[k].version)).size !== 1) {
    throw new Error('Game-data collections have different versions; keep the previous snapshot.');
  }
  const loc = key => cleanText(raw.loc.data[key] ?? '');
  const skills = new Map(raw.skill.data.map(s => [s.id, s]));
  const abilities = new Map(raw.ability.data.map(a => [a.id, a]));
  const categories = raw.category.data.filter(c => c.visible && c.uiFilter.includes(1)
    && !c.id.startsWith('role_') && !c.id.startsWith('raid_'));
  const units = [...new Map(raw.units.data
    .filter(u => u.combatType === 1 && u.rarity === 7 && u.obtainable && u.obtainableTime === '0')
    .map(u => [u.baseId, u])).values()].sort((a, b) => a.baseId.localeCompare(b.baseId));
  const characters = units.map((u, portrait) => {
    const relevant = u.skillReference.map(r => skills.get(r.skillId)).filter(Boolean)
      .filter(s => s.id.startsWith('leaderskill_') || s.tier.some(t => t.isOmicronTier));
    const kit = relevant.map(s => {
      const a = abilities.get(s.abilityReference);
      if (!a) throw new Error('Missing ability: ' + s.abilityReference);
      const omi = s.tier.findIndex(t => t.isOmicronTier);
      const finalText = loc(a.tier.at(-1)?.descKey || a.descKey);
      const baseText = omi < 0 ? finalText : loc(a.tier[omi - 1]?.descKey || a.descKey);
      if (!loc(a.nameKey) || !finalText || !baseText) throw new Error('Missing localized kit: ' + a.id);
      const type = s.id.startsWith('leaderskill_') ? 'Leader' : s.id.startsWith('uniqueskill_') ? 'Unique' : 'Special';
      return { id: s.id, name: loc(a.nameKey), type, baseText,
        zeta: s.tier.some(t => t.isZetaTier),
        ...(omi >= 0 ? { omicron: { mode: s.omicronMode,
          label: OMICRON_MODES[s.omicronMode] || 'Unmapped mode · check kit', text: finalText } } : {}) };
    });
    const name = loc(u.nameKey);
    if (!name) throw new Error('Missing character name: ' + u.baseId);
    return { id: u.baseId, name, portrait, texture: u.thumbnailName,
      alignment: u.forceAlignment === 2 ? 'Light Side' : u.forceAlignment === 3 ? 'Dark Side' : 'Neutral',
      role: loc(raw.category.data.find(c => c.id.startsWith('role_') && c.id !== 'role_leader' && u.categoryId.includes(c.id))?.descKey),
      factions: categories.filter(c => u.categoryId.includes(c.id)).map(c => c.id),
      zetaCount: u.skillReference.filter(r => skills.get(r.skillId)?.tier.some(t => t.isZetaTier)).length,
      galacticLegend: !!u.legend, abilities: kit };
  });
  if (characters.length < 300) throw new Error('Incomplete character collection.');
  return { schema: 1, generatedAt, gameVersion: raw.units.version, localeVersion: raw.loc.version, sourceCommit,
    source: 'https://github.com/swgoh-utils/gamedata',
    portraitSource: 'https://game-assets.swgoh.gg/textures/',
    atlas: { path: '/assets/img/squads/portraits.webp', columns: 20, size: 128,
      rows: Math.ceil(characters.length / 20) },
    factions: categories.filter(c => characters.some(u => u.factions.includes(c.id)))
      .map(c => ({ id: c.id, name: loc(c.descKey) })).sort((a, b) => a.name.localeCompare(b.name)), characters };
}
