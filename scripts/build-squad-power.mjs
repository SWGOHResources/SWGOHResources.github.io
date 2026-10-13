// Build small planned-GP profiles from the same pinned game-data revision.
export function buildSquadPower(characters, gameData, sourceCommit) {
  const {gpTables:gp,unitData}=gameData.data || gameData;
  const units=Object.fromEntries(characters.map(unit=>{
    let skillPower=0;const omicrons={};
    for(const skill of unitData[unit.id].skills) {
      const hasOmicron=unit.abilities.some(a=>a.id===skill.id&&a.omicron);
      const tier=skill.maxTier-(hasOmicron?1:0);
      const power=level=>gp.abilitySpecialGP[skill.powerOverrideTags[level]]??gp.abilityLevelGP[level]??0;
      skillPower+=power(tier);
      if(hasOmicron)omicrons[skill.id]=power(skill.maxTier)-power(tier);
    }
    return [unit.id,{base:gp.unitLevelGP[85]+gp.gearLevelGP[13]+6*gp.modRarityLevelTierGP[6][15][5]+skillPower+
      (unit.galacticLegend?gp.abilitySpecialGP.ultimate:0),omicrons}];
  }));
  return {schema:1,sourceCommit,level:85,gear:13,mods:'Six level-15 6E mods',
    rarity:gp.unitRarityGP,relic:gp.relicTierGP,relicLevel:gp.relicTierLevelFactor,units};
}
