const imageRoot = '/assets/img/';
const referenceCards = [
  { title:'Blade and Bastion', type:'Special Marquee Event', status:'Starts in 46d 13h', art:'marquee/marquee4event.png', caption:'Earn Rewards Daily!', unit:'Stormtrooper (Concept)', portrait:'live/bonus-stormtrooperconcept.png', alignment:'dark' },
  { title:'The Last Command', type:'Special Marquee Event', status:'Starts in 4d 13h', art:'marquee/marquee1event.png', caption:'Earn Rewards Daily!', unit:'Mara Jade Skywalker', portrait:'live/bonus-marajadeskywalker.png', alignment:'light' },
  { title:'A Dark Reflection', type:'Special Marquee Event', status:'Starts in 18d 13h', art:'marquee/marquee2event.png', caption:'Earn Rewards Daily!', unit:'Yoda (Dark Side Vision)', portrait:'live/bonus-yodadsv.png', alignment:'dark' },
  { title:'The Wanderer’s Blade', type:'Special Marquee Event', status:'Starts in 74d 13h', art:'marquee/marquee6event.png', caption:'Earn Rewards Daily!', unit:'The Ronin', portrait:'live/bonus-theronin.png', alignment:'dark' },
];
const episodeCards = ERA_SCHEDULES.flatMap(era=>Array.from({length:Math.ceil(era.lengthDays/28)},(_,index)=>{
  const date = new Date(Date.parse(era.startDate+'T18:00:00Z')+index*28*86400000);
  return { title:index===0 ? era.name.replace(/^Era of /,'') : `Episode ${index+1}`, type:index===0?'Era Release':'Episode Release', status:date.toLocaleDateString('en-GB',{day:'numeric',month:'long',timeZone:'UTC'})+' · 18:00 UTC', art:era.icon, style:'custom era-emblem', caption:`Episode ${index+1} Begins`, eraName:era.name };
}));
const scheduleCards = [
  { title:'Additive Drops', type:'Special Event', art:'atlases/standard_rgba_atlas/icon_gift.png', style:'custom gift', caption:'Bonus Rewards Event!' },
  { title:'Client Update', type:'Game Update', art:'events/clientupdate.png', style:'custom update-icon', caption:'Client Update Expected' },
  { title:'The Legend Codex', type:'Datacron Set', art:'datacrons/datacron_pink.png', style:'custom datacron', caption:'New Datacrons Expected' },
  ...episodeCards.filter(card=>card.art==='eras/mandalorian-and-grogu.png'),
  ...episodeCards.filter(card=>card.art!=='eras/mandalorian-and-grogu.png'),
];
const allCards = [...referenceCards,...scheduleCards];
const bonusWaveData = fetch('/assets/data/live-events.json').then(response=>{
  if(!response.ok) throw new Error('Rewards unavailable');
  return response.json();
}).then(data=>{
  const waves = data.events.filter(event=>Array.isArray(event.units) && event.units.length);
  const now = Date.now();
  return waves.find(event=>event.startMs<=now && event.endMs>now) || waves[0] || null;
}).catch(()=>null);
const escapeText = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function artwork(card) {
  const custom=(card.style || '').includes('custom');
  return `${custom ? '<div class="game-backdrop"></div>' : ''}<img class="${custom ? 'custom-icon' : 'portrait'}" src="${imageRoot+card.art}" alt="" loading="${custom?'eager':'lazy'}">`;
}
function cardHTML(card,index) {
  return `<article class="game-card ${card.style || ''}${card.title.length>22?' long-title':''}" aria-label="${escapeText(card.title)}"><div class="card-inner">
    <div class="card-art">${artwork(card)}</div>
    <header class="game-header"><h2 class="game-title">${escapeText(card.title)}</h2><p class="game-subtitle">${escapeText(card.type)}</p></header>
    ${card.status ? `<p class="countdown">${escapeText(card.status)}</p>` : ''}
    <footer class="game-footer"><p>${escapeText(card.caption)}</p><button class="game-action" type="button" data-detail="${index}" aria-label="Rewards for ${escapeText(card.title)}">REWARDS</button></footer>
  </div></article>`;
}
document.getElementById('reference').innerHTML = referenceCards.map((card,i)=>cardHTML(card,i)).join('');
document.getElementById('schedule').innerHTML = scheduleCards.map((card,i)=>cardHTML(card,i+referenceCards.length)).join('');
const artNames = {
  'tw':'Territory War','gac':'Grand Arena','conquest':'Conquest','clientupdate':'Client Update','shipmentchange':'Shipment Update','provingground':'Proving Grounds — Previous Image','stranger':'Proving Grounds','ultimatejourney':'Ultimate Journey','executor':'Discarded Doctrine','leviathan':'Dark Sovereign','profundity':'Admiral’s Maneuver',
  'smugglersrun':'Smuggler’s Run','erabattle1':'Era Battle 1','erabattle2':'Era Battle 2','eraicon':'Era Unit','journey-maul-hate-fueled':'Journey Rerun 1','journey-cassian-undercover':'Journey Rerun 2','darthjarjar':'Terrible Tings','stormtrooperconcept':'Blade and Bastion','theronin':'The Wanderer’s Blade','jaxxon':'Jaxxon','adelphiranger':'Green Ranger',
  'empirehorde':'Military Might','forestmoon':'Forest Moon','groundwar':'Ground War','rebelassult':'Rebel Roundup','inquisitor-assault-battle':'Fanatical Devotion','nightsisters-assault':'Secrets and Shadows','droid-smuggle':'Training Droid Smuggling','creditheist':'Credit Heist','contrabandcargo':'Contraband Cargo','galacticbounties':'Galactic Bounties I','dathomir-battle':'Defense of Dathomir','ewok-heroic':'Endor Escalation','nightsisters-halloween':'Coven of Shadows','halloween2025':'Halloween Event',
  'marquee1event':'The Last Command','marquee2event':'A Dark Reflection','marquee3event':'Starkiller (Luke Concept)','marquee4event':'Blade and Bastion','marquee5event':'Jaxxon','marquee6event':'The Wanderer’s Blade',
};
fetch('/preview/event-art-reference.2533c4bff5.json',{cache:'no-store'}).then(response=>{
  if(!response.ok) throw new Error('Artwork unavailable');
  return response.json();
}).then(images=>{
  const priority=['live/events-darthjarjar.png','events/journey-maul-hate-fueled.png','events/journey-cassian-undercover.png','live/events-empirehorde.png','live/events-groundwar.png','live/events-rebelassult.png','live/events-galacticbounties.png'];
  const rank=art=>priority.includes(art)?priority.indexOf(art):priority.length;
  images.sort((a,b)=>rank(a.art)-rank(b.art));
  const used = new Set(referenceCards.map(card=>card.art));
  for(const entry of images){
    if(used.has(entry.art)) continue;
    const file=entry.art.split('/').pop().replace(/\.png$/,'');
    const key=file.replace(/^events-/,'');
    const title=artNames[key] || key.replace(/^datacron_/,'Datacron · ').replace(/^events-/,'').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    const style=entry.art.startsWith('datacrons/') ? 'custom datacron' : entry.art.startsWith('eras/') ? 'custom era-emblem' : ['clientupdate','shipmentchange','eraicon','gac'].includes(key) ? 'custom' : entry.width===entry.height ? 'square-scene' : '';
    const card={title,type:entry.art.startsWith('marquee/')?'Special Marquee Event':'Event Artwork',art:entry.art,style,caption:`${entry.width} × ${entry.height}`};
    const index=allCards.push(card)-1;
    document.getElementById('reference').insertAdjacentHTML('beforeend',cardHTML(card,index));
    used.add(entry.art);
  }
  const gift=scheduleCards[0];
  const giftIndex=allCards.push(gift)-1;
  document.getElementById('reference').insertAdjacentHTML('beforeend',cardHTML(gift,giftIndex));
}).catch(()=>{
  const message=document.createElement('p');message.textContent='Event artwork unavailable';document.getElementById('reference').append(message);
}).finally(()=>document.getElementById('reference').setAttribute('aria-busy','false'));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-view]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  document.querySelectorAll('.event-grid').forEach(grid=>grid.hidden=grid.id!==button.dataset.view);
}));
document.querySelectorAll('[data-sizing]').forEach(button=>button.addEventListener('click',()=>{
  document.querySelectorAll('[data-sizing]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  document.body.classList.toggle('original-proportions',button.dataset.sizing==='original');
}));
let rewardRequest = 0;
function shardRewardHTML(card) {
  return `<li class="bdrop-row marquee-reward"><div class="bdrop-unit"><span class="bdrop-shard ${card.alignment}" aria-hidden="true"><img class="bdrop-shard-background" src="${imageRoot}atlases/standard_rgba_atlas/ShardIcon.png" alt=""><img class="bdrop-shard-unit" src="${imageRoot+card.portrait}" alt=""></span><div><h4 class="bdrop-name">${escapeText(card.unit)}</h4><p class="reward-kind">Character shards</p></div></div><dl class="bdrop-details"><div class="bdrop-field"><dt>Earn in</dt><dd>Marquee battles</dd></div></dl></li>`;
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-detail]');
  if(!button) return;
  const card = allCards[Number(button.dataset.detail)];
  const request = ++rewardRequest;
  const eventTitle = document.getElementById('detail-event');
  const rewardList = document.getElementById('detail-rewards');
  const timing = document.getElementById('detail-window');
  const empty = document.getElementById('detail-empty');
  eventTitle.textContent=card.title;
  document.getElementById('detail-type').textContent=card.eraName || card.type;
  timing.hidden=true;
  timing.innerHTML='';
  rewardList.innerHTML='';
  empty.hidden=true;
  document.getElementById('event-details').showModal();
  if(card.unit){
    rewardList.innerHTML=shardRewardHTML(card);
  } else if((card.style || '').includes('gift')){
    empty.hidden=false;
    empty.textContent='Loading rewards…';
    const wave = await bonusWaveData;
    if(request!==rewardRequest) return;
    if(wave){
      eventTitle.textContent=wave.name;
      document.getElementById('detail-type').textContent=`Special Event · ${wave.units.length} units`;
      timing.innerHTML=bonusWaveWindowHTML(wave);
      timing.hidden=false;
      rewardList.innerHTML=bonusWaveRowsHTML(wave);
      empty.hidden=true;
    } else empty.textContent='Reward information unavailable';
  } else {
    empty.hidden=false;
    empty.textContent='No reward details announced';
  }
});
