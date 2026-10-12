import { MODES, unitOptions, leaderText, omicronStatus } from './squad-model.js';

function wrap(ctx, text, width) {
  const lines = []; let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line && ctx.measureText(line + ' ' + word).width > width) { lines.push(line); line = word; }
    else line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return lines;
}
export function drawPlan(ctx, plan, data, atlasImage, sprites) {
  const units = new Map(data.characters.map(u => [u.id, u]));
  const squads = plan.banks[plan.size];
  ctx.font = '14px Inter, sans-serif';
  const rows = squads.map(s => {
    const omicrons = s.slots.flatMap((id, slot) => {
      const u = units.get(id); if (!u) return [];
      return u.abilities.filter(a => a.omicron && unitOptions(plan, u).omicrons.includes(a.id)).map(a => {
        const status = omicronStatus(plan, u, a, slot);
        return `Ω ${u.name}: ${a.name} · ${a.omicron.label} · ${status.kind === 'eligible' ? 'mode applies' : status.label.toLowerCase()}`;
      });
    });
    const lines = omicrons.flatMap(t => wrap(ctx, t, 1060));
    return { squad: s, omiLines: lines, height: 278 + Math.max(1, lines.length) * 22 };
  });
  ctx.font = 'bold 32px Sora, sans-serif';
  const titleLines = wrap(ctx, plan.title || 'My squad plan', 1080);
  const header = 128 + titleLines.length * 38;
  ctx.canvas.width = 1200; ctx.canvas.height = header + rows.reduce((n, r) => n + r.height + 18, 0) + 92;
  const gradient = ctx.createLinearGradient(0, 0, 1200, ctx.canvas.height);
  gradient.addColorStop(0, '#14314a'); gradient.addColorStop(.6, '#0a1728'); gradient.addColorStop(1, '#102337');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#78d4ee'; ctx.font = '12px IBM Plex Mono, monospace'; ctx.fillText('SWGOH::RESOURCES / SQUAD PLANNER', 48, 40);
  ctx.fillStyle = '#edf7ff'; ctx.font = 'bold 32px Sora, sans-serif'; titleLines.forEach((t, i) => ctx.fillText(t, 48, 84 + i * 38));
  ctx.fillStyle = '#9fc9df'; ctx.font = '15px Inter, sans-serif'; ctx.fillText(`${plan.size}v${plan.size}  /  ${MODES[plan.mode]}  /  ${squads.length} ${squads.length === 1 ? 'squad' : 'squads'}`, 48, header - 34);
  let y = header;
  for (let si = 0; si < rows.length; si++) {
    const row = rows[si], s = row.squad;
    ctx.fillStyle = '#0e2032'; ctx.fillRect(36, y, 1128, row.height);
    ctx.strokeStyle = '#2c546e'; ctx.strokeRect(36, y, 1128, row.height);
    ctx.fillStyle = '#193c52'; ctx.fillRect(36, y, 1128, 43);
    ctx.fillStyle = '#dfedf7'; ctx.font = 'bold 16px Inter, sans-serif'; ctx.fillText(`${String(si + 1).padStart(2, '0')} / ${s.name}`, 56, y + 28, 980);
    ctx.fillStyle = '#8fb8d2'; ctx.font = '13px IBM Plex Mono, monospace'; ctx.fillText(`${s.slots.filter(Boolean).length}/${plan.size}`, 1100, y + 28);
    const step = 1080 / plan.size;
    s.slots.forEach((id, i) => {
      const u = units.get(id), cx = 60 + step * (i + .5), cy = y + 124, radius = 57;
      if (u) {
        if (u.galacticLegend) ctx.drawImage(sprites.gl_inventory_bg,cx-70,cy-70,140,140);
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2); ctx.clip();
        const sourceX = u.portrait % data.atlas.columns * data.atlas.size, sourceY = Math.floor(u.portrait / data.atlas.columns) * data.atlas.size;
        ctx.drawImage(atlasImage, sourceX, sourceY, data.atlas.size, data.atlas.size, cx - radius + 3, cy - radius + 3, (radius - 3) * 2, (radius - 3) * 2); ctx.restore();
        const opts = unitOptions(plan, u);
        const side = u.alignment === 'Dark Side' ? 'dark' : u.alignment === 'Neutral' ? 'neutral' : 'light';
        const frame = sprites['TierHighlight13_' + side], badge = sprites[u.galacticLegend ? 'icon_relic_badge_GL' : side === 'dark' ? 'icon_relic_badge_DS' : side === 'light' ? 'icon_relic_badge_LS' : 'icon_relic_badge'];
        ctx.drawImage(frame,cx-70,cy-70,70,140);
        ctx.save(); ctx.translate(cx,cy); ctx.scale(-1,1); ctx.drawImage(frame,-70,-70,70,140); ctx.restore();
        ctx.drawImage(badge,cx-26,cy+27,52,52);
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '600 28px "Barlow Condensed",sans-serif'; ctx.shadowColor='#000'; ctx.shadowBlur=3; ctx.fillText(String(opts.relic),cx,cy+62); ctx.shadowBlur=0;
        if (u.zetaCount) { ctx.drawImage(sprites.zeta,cx-65,cy+25,36,36);ctx.font='600 19px "Barlow Condensed",sans-serif';ctx.fillText(String(u.zetaCount),cx-47,cy+51); }
        if (opts.omicrons.length) {ctx.drawImage(sprites.icon_omicron,cx+29,cy+25,36,36);ctx.font='600 19px "Barlow Condensed",sans-serif';ctx.fillText(String(opts.omicrons.length),cx+47,cy+51);}
        if (i === 0) ctx.drawImage(sprites.leader,cx+36,cy-63,30,30);
        for(let star=0;star<7;star++) ctx.drawImage(sprites[star<opts.stars?'rarity_star':'rarity_star_empty'],cx-56+star*16,y+190,16,18);
        ctx.font = 'bold 13px Inter, sans-serif'; ctx.fillStyle = '#dfedf7'; wrap(ctx, u.name, step - 16).slice(0, 2).forEach((t, n) => ctx.fillText(t, cx, y + 226 + n * 17));
      } else {
        ctx.textAlign = 'center'; ctx.font = '30px sans-serif'; ctx.fillStyle = '#54758b'; ctx.fillText('+', cx, cy + 10);
        ctx.font = '13px Inter, sans-serif'; ctx.fillText(i === 0 ? 'Empty leader slot' : 'Empty slot', cx, y + 226);
      }
      ctx.textAlign = 'left';
    });
    const lead = leaderText(plan, units.get(s.slots[0]));
    ctx.font = '14px Inter, sans-serif'; ctx.fillStyle = '#b6dceb';
    ctx.fillText(`♛ Leadership: ${lead?.ability.name || 'None'}${lead?.useOmicron ? ' · Ω mode applies' : ''}`, 60, y + 264, 1070);
    row.omiLines.forEach((line, i) => { ctx.fillStyle = '#a4bdd1'; ctx.fillText(line, 60, y + 288 + i * 22); });
    y += row.height + 18;
  }
  ctx.fillStyle = '#67bdd7'; ctx.font = '12px IBM Plex Mono, monospace'; ctx.fillText(`swgohresources.github.io/squads/ · Character data ${data.generatedAt.slice(0, 10)}`, 48, y + 45);
}
export async function downloadPlanPng(plan, data) {
  const img = new Image();
  img.src = data.atlas.path;
  await img.decode();
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const names=['TierHighlight13_dark','TierHighlight13_light','TierHighlight13_neutral','icon_relic_badge_DS','icon_relic_badge_LS','icon_relic_badge_GL','icon_relic_badge','icon_omicron','rarity_star','rarity_star_empty','gl_inventory_bg','leader','zeta'];
  const sprites=Object.fromEntries(await Promise.all(names.map(async name=>{
    const image=new Image(); image.src=name==='zeta'?'/assets/img/squads/zeta.svg':'/assets/img/atlases/'+(name==='leader'?'standard_rgba_atlas/icon_synergy_leader':'unit_atlas/'+name)+'.png'; await image.decode(); return [name,image];
  })));
  await document.fonts.ready;
  drawPlan(ctx, plan, data, img, sprites);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'swgoh-squad-plan.png'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
