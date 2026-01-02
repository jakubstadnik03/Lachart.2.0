/**
 * Minimal inline-SVG generators for lactate test email reports.
 * No external deps; output is safe to inline into HTML emails.
 */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildLactateCurveSvg({ results, sportLabel, xLabel }) {
  const pts = (Array.isArray(results) ? results : [])
    .map(r => ({ x: Number(r.power), y: Number(r.lactate) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (pts.length < 2) return '';

  // Sort by x ascending for curve display (even for pace sports: x is seconds, still OK)
  pts.sort((a, b) => a.x - b.x);

  const W = 560, H = 260;
  const padL = 44, padR = 18, padT = 18, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const minX = Math.min(...pts.map(p => p.x));
  const maxX = Math.max(...pts.map(p => p.x));
  const minY = 0;
  const maxY = Math.max(6, Math.ceil(Math.max(...pts.map(p => p.y)) + 0.5));

  const sx = (x) => padL + ((x - minX) / (maxX - minX || 1)) * innerW;
  const sy = (y) => padT + (1 - ((y - minY) / (maxY - minY || 1))) * innerH;

  const linePoints = pts.map(p => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

  const yGrid = [];
  const yTicks = [];
  for (let y = 0; y <= maxY; y += 1) {
    const yy = sy(y);
    yGrid.push(`<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#E5E7EB" stroke-width="1" />`);
    yTicks.push(`<text x="${padL - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#6B7280">${y}</text>`);
  }

  const circles = pts.map(p => `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.8" fill="#FFFFFF" stroke="#111827" stroke-width="1.2" />`).join('');

  return `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Lactate curve">
    <rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="#FFFFFF" stroke="#EEF2F7"/>
    ${yGrid.join('')}
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    ${yTicks.join('')}
    <polyline points="${linePoints}" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${circles}
    <text x="${padL}" y="${padT - 4}" font-size="12" fill="#111827" font-weight="700">${escapeHtml(sportLabel || 'Test')}</text>
    <text x="${W / 2}" y="${H - 10}" text-anchor="middle" font-size="12" fill="#6B7280">${escapeHtml(xLabel || 'Intensity')}</text>
    <text x="14" y="${H / 2}" text-anchor="middle" font-size="12" fill="#6B7280" transform="rotate(-90 14 ${H / 2})">Lactate (mmol/L)</text>
  </svg>
  `.trim();
}

function buildStagesSvg({ results, sport, unitSystem, inputMode }) {
  const rows = (Array.isArray(results) ? results : [])
    .map((r, idx) => ({
      i: idx + 1,
      power: Number(r.power),
      hr: Number(r.heartRate),
      lactate: Number(r.lactate)
    }))
    .filter(r => Number.isFinite(r.power) && Number.isFinite(r.hr));

  if (rows.length < 2) return '';

  const W = 560, H = 240;
  const padL = 44, padR = 18, padT = 18, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const minX = 1;
  const maxX = rows.length;
  const minP = Math.min(...rows.map(r => r.power));
  const maxP = Math.max(...rows.map(r => r.power));
  const minHr = Math.min(...rows.map(r => r.hr));
  const maxHr = Math.max(...rows.map(r => r.hr));

  const sx = (i) => padL + ((i - minX) / (maxX - minX || 1)) * innerW;
  const syP = (p) => padT + (1 - ((p - minP) / (maxP - minP || 1))) * innerH;
  const syH = (hr) => padT + (1 - ((hr - minHr) / (maxHr - minHr || 1))) * innerH;

  const pLine = rows.map(r => `${sx(r.i).toFixed(1)},${syP(r.power).toFixed(1)}`).join(' ');
  const hLine = rows.map(r => `${sx(r.i).toFixed(1)},${syH(r.hr).toFixed(1)}`).join(' ');

  const xTicks = rows.map(r => `<text x="${sx(r.i).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="#6B7280">${r.i}</text>`).join('');

  const intensityLabel = (sport === 'bike')
    ? 'Power (W)'
    : (inputMode === 'speed')
      ? (unitSystem === 'imperial' ? 'Speed (mph)' : 'Speed (km/h)')
      : 'Pace (sec)';

  return `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Test stages">
    <rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="#FFFFFF" stroke="#EEF2F7"/>
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    <polyline points="${pLine}" fill="none" stroke="#3B82F6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline points="${hLine}" fill="none" stroke="#111827" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>
    ${xTicks}
    <text x="${padL}" y="${padT - 4}" font-size="12" fill="#111827" font-weight="700">Stages</text>
    <text x="${W / 2}" y="${H - 10}" text-anchor="middle" font-size="12" fill="#6B7280">Stage #</text>
    <text x="14" y="${H / 2}" text-anchor="middle" font-size="12" fill="#6B7280" transform="rotate(-90 14 ${H / 2})">${escapeHtml(intensityLabel)} / HR</text>
    <g>
      <circle cx="${W - 170}" cy="${padT + 8}" r="4" fill="#3B82F6"/><text x="${W - 160}" y="${padT + 12}" font-size="12" fill="#374151">Intensity</text>
      <circle cx="${W - 90}" cy="${padT + 8}" r="4" fill="#111827"/><text x="${W - 80}" y="${padT + 12}" font-size="12" fill="#374151">HR</text>
    </g>
  </svg>
  `.trim();
}

module.exports = {
  buildLactateCurveSvg,
  buildStagesSvg,
  escapeHtml,
  clamp
};


