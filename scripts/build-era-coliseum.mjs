// Regenerate the checklist's tier 1–8 rewards from the retained game extracts.
// Preview entries for these 32 milestone boxes have fixed quantities.
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const raw = await read('era10-extract/02_era10_coliseum.json');
const sourceBoxes = await read('era10-extract/08_coliseum_prize_boxes.json');
const boxes = new Map(sourceBoxes.boxes.map(box => [box.id, box]));
const names = ['Krayt Dragon', 'Zeffo Tomb Guardian', 'Jotaz', 'Dryax'];
const icons = ['krayt.png', 'zeffo.png', 'jotaz.png', 'dryax.png'];
const isUpgrade = id => id.startsWith('era_upgrade_') || id === 'ERA_UPGRADE_CURRENCY';
function quantity(item) {
  if (item.minQuantity !== item.maxQuantity) throw Error('Variable reward requires a range: ' + item.id);
  return item.minQuantity;
}
function tiersFor(boss) {
  return boss.bossRewardTable.slice(0, 8).map((table, index) => ({
    tier: index + 1,
    bands: table.bossProgressionRewardPreview.map(band => {
      const rewards = new Map(), boxIds = [];
      let shipmentCurrency = 0;
      const add = (item, multiplier = 1) => {
        if (item.id === 'ERA_CURRENCY') shipmentCurrency += quantity(item) * multiplier;
        // Tier 7's 100% milestone and all of tier 8 give currency only.
        const materialMilestone = index < 6 || (index === 6 && band.rankStart < 100);
        if (materialMilestone && isUpgrade(item.id)) rewards.set(item.id, (rewards.get(item.id) || 0) + quantity(item) * multiplier);
      };
      // detailedReward contains each box once; primaryReward duplicates its preview.
      for (const item of band.detailedReward) {
        if (item.type === 14) {
          const box = boxes.get(item.id);
          if (!box) throw Error('Missing prize box: ' + item.id);
          boxIds.push(item.id);
          for (const content of box.previewItem) add(content, quantity(item));
        } else add(item);
      }
      return { at: band.rankStart, boxes: boxIds, shipmentCurrency, rewards: [...rewards].map(([id, q]) => ({ id, q })) };
    }),
  }));
}
const tiers = tiersFor(raw.bossDefinition[0]);
for (const boss of raw.bossDefinition.slice(1)) {
  if (JSON.stringify(tiersFor(boss)) !== JSON.stringify(tiers)) throw Error('Boss tables differ');
}
const data = {
  source: 'era10-extract/02_era10_coliseum.json',
  boxSource: 'era10-extract/08_coliseum_prize_boxes.json',
  gameVersion: sourceBoxes.gameVersion,
  excludedCurrencyIds: ['ERA_CURRENCY'],
  materialTiers: [1,2,3,4,5,6,7],
  currencyOnlyMilestones: {7:[100],8:'all'},
  bosses: raw.bossDefinition.map((boss, i) => ({id:boss.identifier.campaignNodeId,name:names[i],icon:'assets/img/bosses/'+icons[i]})),
  tiers,
};
await writeFile(new URL('assets/data/era-coliseum.json', root), JSON.stringify(data, null, 2) + '\n');
console.log('Built boss rewards; tier 7 at 100% and tier 8 give Era Currency only.');
