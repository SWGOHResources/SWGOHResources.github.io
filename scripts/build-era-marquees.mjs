// Retain the confirmed first marquee's first-clear and repeatable rewards.
// The second marquee is unreleased; its datamined placeholder rewards are excluded.
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const data = await read('assets/data/era-chart.json');
const raw = await read('era10-extract/06_marquee_adelphiranger_l80_full.json');
function rewards(items) {
  return items.map(item => {
    if (item.minQuantity !== item.maxQuantity) throw Error('Variable marquee reward: ' + item.id);
    return {id:item.id,q:item.minQuantity};
  });
}
data.marquee = {
  ADELPHIRANGER_L80: raw.node.campaignNodeMission.map(mission => ({
    tier: mission.id,
    req: (data.marquee.ADELPHIRANGER_L80.find(tier => tier.tier === mission.id) || {}).req || '',
    rewards: rewards(mission.firstCompleteRewardPreview),
    dailyRewards: rewards(mission.rewardPreview),
  })),
};
data.marqueeAvailability = {ADELPHIRANGER_L80:'confirmed',B1MERCDROID_L80:'unreleased'};
await writeFile(new URL('assets/data/era-chart.json', root), JSON.stringify(data, null, 1) + '\n');
console.log('Built first-clear and daily rewards for Adelphi Ranger; second marquee unavailable.');
