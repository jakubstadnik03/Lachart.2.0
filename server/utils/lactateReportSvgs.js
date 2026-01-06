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

function formatPace(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function paceUnitLabel({ sport, unitSystem }) {
  if (sport === 'swim') return unitSystem === 'imperial' ? 'min/100yd' : 'min/100m';
  return unitSystem === 'imperial' ? 'min/mile' : 'min/km';
}

function formatIntensityTick(value, { sport, unitSystem, inputMode }) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '—';
  if (sport === 'bike') return String(Math.round(v));

  // For run/swim we store pace as seconds (per km/mile or per 100m/100yd depending on unitSystem).
  // Even if inputMode was "speed", we still label the axis with pace for consistency in the report.
  if (sport === 'run' || sport === 'swim') return formatPace(v);

  // Fallback
  return inputMode === 'speed' ? v.toFixed(1) : String(Math.round(v));
}

function buildLactateCurveSvg({ results, sportLabel, xLabel, sport, unitSystem, inputMode }) {
  const pts = (Array.isArray(results) ? results : [])
    .map(r => ({ x: Number(r.power), y: Number(r.lactate) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (pts.length < 2) return '';

  const coreSport = (sport === 'run' || sport === 'swim' || sport === 'bike') ? sport : null;
  const isPaceSport = coreSport === 'run' || coreSport === 'swim';
  // For pace sports we want slower (bigger seconds) on the left, faster on the right.
  const reverseX = Boolean(isPaceSport);

  // Calculate min/max BEFORE sorting (we need original range)
  const minX = Math.min(...pts.map(p => p.x));
  const maxX = Math.max(...pts.map(p => p.x));
  const minY = 0;
  const maxY = Math.max(6, Math.ceil(Math.max(...pts.map(p => p.y)) + 0.5));

  // Sort for a natural left-to-right line direction
  // For pace: sort descending (biggest first = slowest first = left side)
  // For power: sort ascending (smallest first = left side)
  pts.sort((a, b) => reverseX ? (b.x - a.x) : (a.x - b.x));

  const W = 560, H = 260;
  const padL = 44, padR = 18, padT = 18, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const sx = (x) => {
    const denom = (maxX - minX || 1);
    // For pace sports: map maxX (slowest) to left (0), minX (fastest) to right (1)
    // For power sports: map minX (lowest) to left (0), maxX (highest) to right (1)
    const t = reverseX ? ((maxX - x) / denom) : ((x - minX) / denom);
    return padL + t * innerW;
  };
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

  // For x-axis ticks, we want them in the correct visual order (left to right)
  // For pace sports: show from slowest (left, biggest seconds) to fastest (right, smallest seconds)
  // For power sports: show from lowest (left) to highest (right)
  // Create a sorted copy of all unique x values for ticks
  const uniqueXValues = [...new Set(pts.map(p => p.x))].sort((a, b) => reverseX ? (b - a) : (a - b));
  const tickEvery = uniqueXValues.length > 12 ? 2 : 1;
  const xTicks = uniqueXValues
    .filter((_, idx) => idx % tickEvery === 0)
    .map(x => {
      const xx = sx(x).toFixed(1);
      const label = formatIntensityTick(x, { sport: coreSport, unitSystem, inputMode });
      return `
        <g>
          <line x1="${xx}" y1="${H - padB}" x2="${xx}" y2="${H - padB + 6}" stroke="#9CA3AF" stroke-width="1"/>
          <text x="${xx}" y="${H - 18}" text-anchor="middle" font-size="11" fill="#6B7280">${escapeHtml(label)}</text>
        </g>
      `.trim();
    })
    .join('');

  const effectiveXLabel = xLabel || (coreSport === 'bike'
    ? 'Power (W)'
    : (coreSport === 'run' || coreSport === 'swim')
      ? `Pace (${paceUnitLabel({ sport: coreSport, unitSystem })})`
      : 'Intensity');

  return `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Lactate curve">
    <rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="#FFFFFF" stroke="#EEF2F7"/>
    ${yGrid.join('')}
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    ${yTicks.join('')}
    ${xTicks}
    <polyline points="${linePoints}" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${circles}
    <text x="${padL}" y="${padT - 4}" font-size="12" fill="#111827" font-weight="700">${escapeHtml(sportLabel || 'Test')}</text>
    <text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#6B7280">${escapeHtml(effectiveXLabel)}</text>
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

  const xTicks = rows.map(r => {
    const xx = sx(r.i).toFixed(1);
    const label = formatIntensityTick(r.power, { sport, unitSystem, inputMode });
    return `
      <g>
        <line x1="${xx}" y1="${H - padB}" x2="${xx}" y2="${H - padB + 6}" stroke="#9CA3AF" stroke-width="1"/>
        <text x="${xx}" y="${H - 20}" text-anchor="middle" font-size="9" fill="#9CA3AF">${escapeHtml(String(r.i))}</text>
        <text x="${xx}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#6B7280">${escapeHtml(label)}</text>
      </g>
    `.trim();
  }).join('');

  const intensityLabel = (sport === 'bike')
    ? 'Power (W)'
    : (sport === 'run' || sport === 'swim')
      ? `Pace (${paceUnitLabel({ sport, unitSystem })})`
      : 'Intensity';

  return `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Test stages">
    <rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="#FFFFFF" stroke="#EEF2F7"/>
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    <polyline points="${pLine}" fill="none" stroke="#3B82F6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <polyline points="${hLine}" fill="none" stroke="#111827" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>
    ${xTicks}
    <text x="${padL}" y="${padT - 4}" font-size="12" fill="#111827" font-weight="700">Stages</text>
    <text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#6B7280">Intensity</text>
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


