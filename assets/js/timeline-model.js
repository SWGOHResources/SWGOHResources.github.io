export function periodLabel(p) {
  return `${p.year} · ${p.era ? p.era + ' · ' : ''}${p.label}`;
}
export function releaseDay(entry, period) {
  if (!period.era || entry.track !== 'marquee') return null;
  return entry.sourceRow === 5 ? 1 : entry.sourceRow === 6 ? 14 : null;
}
export function cadence(data, periods, track = 'marquee') {
  const rows = periods.map(p => {
    const entries = data.entries.filter(e => e.periods[0] === p.id && (track === 'all' || e.track === track));
    const count = entries.reduce((n, e) => n + e.units, 0);
    return { ...p, count, rate: count * 28 / p.days };
  });
  const days = rows.reduce((n, p) => n + p.days, 0);
  const count = rows.reduce((n, p) => n + p.count, 0);
  const mean = rows.length ? rows.reduce((n, p) => n + p.rate, 0) / rows.length : 0;
  const deviation = rows.length ? Math.sqrt(rows.reduce((n, p) => n + (p.rate - mean) ** 2, 0) / rows.length) : 0;
  return { rows, days, count, rate: days ? count * 28 / days : 0, deviation };
}
