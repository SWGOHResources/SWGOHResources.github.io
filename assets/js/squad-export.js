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
export function drawPlan(ctx, plan, data, atlasImage) {
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
      const color = u?.alignment === 'Dark Side' ? '#f26777' : u?.alignment === 'Neutral' ? '#e2bf65' : '#66cfff';
      ctx.beginPath(); ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2); ctx.strokeStyle = color + '55'; ctx.lineWidth = 3; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.strokeStyle = u ? color : '#365c75'; ctx.lineWidth = 2; ctx.stroke();
      if (u) {
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2); ctx.clip();
        const sourceX = u.portrait % data.atlas.columns * data.atlas.size, sourceY = Math.floor(u.portrait / data.atlas.columns) * data.atlas.size;
        ctx.drawImage(atlasImage, sourceX, sourceY, data.atlas.size, data.atlas.size, cx - radius + 3, cy - radius + 3, (radius - 3) * 2, (radius - 3) * 2); ctx.restore();
        const opts = unitOptions(plan, u);
        ctx.fillStyle = '#682334'; ctx.fillRect(cx - 18, cy + 42, 36, 23); ctx.strokeStyle = '#e57e89'; ctx.strokeRect(cx - 18, cy + 42, 36, 23);
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffe4df'; ctx.font = 'bold 12px IBM Plex Mono, monospace'; ctx.fillText('R' + opts.relic, cx, cy + 59);
        if (i === 0) { ctx.fillStyle = '#aae9ff'; ctx.font = '21px sans-serif'; ctx.fillText('♛', cx - 53, cy - 37); }
        ctx.fillStyle = '#eac86c'; ctx.font = '15px sans-serif'; ctx.fillText('★'.repeat(opts.stars) + '☆'.repeat(7 - opts.stars), cx, y + 205);
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
    if (!row.omiLines.length) { ctx.fillStyle = '#7795ab'; ctx.fillText('Ω No Omicrons equipped', 60, y + 288); }
    y += row.height + 18;
  }
  ctx.fillStyle = '#8daec4'; ctx.font = '12px Inter, sans-serif'; ctx.fillText('Stars, relics and Omicrons are planned upgrades. Mode eligibility does not confirm all kit conditions.', 48, y + 20);
  ctx.fillStyle = '#67bdd7'; ctx.font = '12px IBM Plex Mono, monospace'; ctx.fillText(`swgohresources.github.io/squads/ · Character data ${data.generatedAt.slice(0, 10)}`, 48, y + 45);
}
export async function downloadPlanPng(plan, data) {
  const img = new Image();
  img.src = data.atlas.path;
  await img.decode();
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  drawPlan(ctx, plan, data, img);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'swgoh-squad-plan.png'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
