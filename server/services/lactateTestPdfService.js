/**
 * Generate lactate test report PDF (no Puppeteer – works on Render.com).
 * Uses getReportData, sharp (SVG→PNG), jspdf + jspdf-autotable.
 * Professional design with LaChart branding, colors and watermark.
 */
const { getReportData } = require('./lactateTestReportEmailService');
const { formatPace } = require('../utils/lactateZones');
const { escapeHtml } = require('../utils/lactateReportSvgs');
const path = require('path');
const fs = require('fs');

let sharp;
let jsPDF;
try {
  sharp = require('sharp');
  const jspdfModule = require('jspdf');
  jsPDF = jspdfModule.jsPDF;
  require('jspdf-autotable');
} catch (e) {
  console.warn('[LactateTestPdfService] Optional deps missing:', e.message);
}

// Brand colors
const BRAND = {
  primary: [118, 126, 181],     // #767EB5
  primaryDark: [94, 101, 144],  // #5E6590
  accent: [56, 189, 248],       // #38BDF8
  dark: [17, 24, 39],           // #111827
  gray: [107, 114, 128],        // #6B7280
  lightGray: [243, 244, 246],   // #F3F4F6
  white: [255, 255, 255],
  red: [239, 68, 68],           // #EF4444
  green: [22, 163, 74],         // #16A34A
  blue: [59, 130, 246],         // #3B82F6
  zoneColors: [
    [34, 197, 94],    // Z1 green
    [132, 204, 22],   // Z2 lime
    [250, 204, 21],   // Z3 yellow
    [249, 115, 22],   // Z4 orange
    [239, 68, 68],    // Z5 red
  ]
};

function formatDateShort(dateLike) {
  try {
    return new Date(dateLike).toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formatIntensity(value, { sport, unitSystem, inputMode }) {
  if (!Number.isFinite(value)) return '—';
  if (sport === 'bike') return `${Math.round(value)} W`;
  if (inputMode === 'pace' && (sport === 'run' || sport === 'swim')) {
    const pace = formatPace(value);
    return sport === 'swim' ? `${pace}${unitSystem === 'imperial' ? '/100yd' : '/100m'}` : `${pace}${unitSystem === 'imperial' ? '/mile' : '/km'}`;
  }
  return `${Number(value).toFixed(1)} ${unitSystem === 'imperial' ? 'mph' : 'km/h'}`;
}

function formatIntensityTick(value, { sport, unitSystem, inputMode }) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '';
  if (sport === 'bike') return String(Math.round(v));
  if (sport === 'run' || sport === 'swim') return formatPace(v);
  return inputMode === 'speed' ? v.toFixed(1) : String(Math.round(v));
}

function paceUnitLabel({ sport, unitSystem }) {
  if (sport === 'swim') return unitSystem === 'imperial' ? 'min/100yd' : 'min/100m';
  return unitSystem === 'imperial' ? 'min/mile' : 'min/km';
}

/**
 * Build lactate curve SVG with dual Y-axis: lactate (left, red) + heart rate (right, blue).
 */
function buildDualAxisCurveSvg({ results, sport, unitSystem, inputMode }) {
  const pts = (Array.isArray(results) ? results : [])
    .map(r => ({
      x: Number(r.power),
      la: Number(r.lactate),
      hr: Number(r.heartRate)
    }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.la));

  if (pts.length < 2) return '';

  const hasHr = pts.some(p => Number.isFinite(p.hr) && p.hr > 0);
  const coreSport = (sport === 'run' || sport === 'swim' || sport === 'bike') ? sport : null;
  const isPace = coreSport === 'run' || coreSport === 'swim';
  const reverseX = isPace;

  const minX = Math.min(...pts.map(p => p.x));
  const maxX = Math.max(...pts.map(p => p.x));
  const minLa = 0;
  const maxLa = Math.max(6, Math.ceil(Math.max(...pts.map(p => p.la)) + 0.5));

  const hrVals = pts.filter(p => Number.isFinite(p.hr) && p.hr > 0).map(p => p.hr);
  const minHr = hrVals.length ? Math.floor(Math.min(...hrVals) / 10) * 10 - 10 : 60;
  const maxHr = hrVals.length ? Math.ceil(Math.max(...hrVals) / 10) * 10 + 10 : 200;

  pts.sort((a, b) => reverseX ? (b.x - a.x) : (a.x - b.x));

  const W = 700, H = 320;
  const padL = 50, padR = hasHr ? 56 : 20, padT = 24, padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const sx = (x) => {
    const d = maxX - minX || 1;
    const t = reverseX ? ((maxX - x) / d) : ((x - minX) / d);
    return padL + t * innerW;
  };
  const syLa = (la) => padT + (1 - ((la - minLa) / (maxLa - minLa || 1))) * innerH;
  const syHr = (hr) => padT + (1 - ((hr - minHr) / (maxHr - minHr || 1))) * innerH;

  const laLine = pts.map(p => `${sx(p.x).toFixed(1)},${syLa(p.la).toFixed(1)}`).join(' ');
  const laArea = `${sx(pts[0].x).toFixed(1)},${syLa(0).toFixed(1)} ${laLine} ${sx(pts[pts.length - 1].x).toFixed(1)},${syLa(0).toFixed(1)}`;
  const hrPts = hasHr ? pts.filter(p => Number.isFinite(p.hr) && p.hr > 0) : [];
  const hrLine = hrPts.map(p => `${sx(p.x).toFixed(1)},${syHr(p.hr).toFixed(1)}`).join(' ');

  const gridLines = [];
  const laTicksEl = [];
  for (let v = 0; v <= maxLa; v += 1) {
    const yy = syLa(v);
    gridLines.push(`<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="#E5E7EB" stroke-width="0.8"/>`);
    laTicksEl.push(`<text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#EF4444" font-weight="600">${v}</text>`);
  }

  const hrTicksEl = [];
  if (hasHr) {
    const hrStep = (maxHr - minHr) > 80 ? 20 : 10;
    for (let v = minHr; v <= maxHr; v += hrStep) {
      const yy = syHr(v);
      hrTicksEl.push(`<text x="${W - padR + 8}" y="${(yy + 4).toFixed(1)}" text-anchor="start" font-size="11" fill="#3B82F6" font-weight="600">${v}</text>`);
    }
  }

  const laCircles = pts.map(p => {
    const cx = sx(p.x).toFixed(1);
    const cy = syLa(p.la).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="4.5" fill="#FFFFFF" stroke="#EF4444" stroke-width="2"/>
            <text x="${cx}" y="${(Number(cy) - 7).toFixed(1)}" text-anchor="middle" font-size="9" fill="#EF4444" font-weight="700">${p.la.toFixed(1)}</text>`;
  }).join('');

  const hrCircles = hrPts.map(p => {
    const cx = sx(p.x).toFixed(1);
    const cy = syHr(p.hr).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#FFFFFF" stroke="#3B82F6" stroke-width="1.8"/>`;
  }).join('');

  const uniqueX = [...new Set(pts.map(p => p.x))].sort((a, b) => reverseX ? (b - a) : (a - b));
  const tickEvery = uniqueX.length > 12 ? 2 : 1;
  const xTicksEl = uniqueX
    .filter((_, i) => i % tickEvery === 0)
    .map(x => {
      const xx = sx(x).toFixed(1);
      const label = formatIntensityTick(x, { sport: coreSport, unitSystem, inputMode });
      return `<line x1="${xx}" y1="${H - padB}" x2="${xx}" y2="${H - padB + 5}" stroke="#9CA3AF" stroke-width="1"/>
              <text x="${xx}" y="${H - padB + 18}" text-anchor="middle" font-size="11" fill="#6B7280">${escapeHtml(label)}</text>`;
    }).join('');

  const xLabel = coreSport === 'bike' ? 'Power (W)'
    : (coreSport === 'run' || coreSport === 'swim') ? `Pace (${paceUnitLabel({ sport: coreSport, unitSystem })})` : 'Intensity';

  const legendX = padL + 8;
  const legend = `
    <rect x="${legendX}" y="${padT - 2}" width="12" height="3" rx="1.5" fill="#EF4444"/>
    <text x="${legendX + 16}" y="${padT + 2}" font-size="11" fill="#EF4444" font-weight="700">Lactate</text>
    ${hasHr ? `
    <rect x="${legendX + 80}" y="${padT - 2}" width="12" height="3" rx="1.5" fill="#3B82F6"/>
    <text x="${legendX + 96}" y="${padT + 2}" font-size="11" fill="#3B82F6" font-weight="700">Heart Rate</text>` : ''}
  `;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
    <defs>
      <linearGradient id="laGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#EF4444" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#EF4444" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="#FFFFFF" stroke="#EEF2F7"/>
    ${gridLines.join('')}
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    ${hasHr ? `<line x1="${W - padR}" y1="${padT}" x2="${W - padR}" y2="${H - padB}" stroke="#3B82F6" stroke-width="1" opacity="0.4"/>` : ''}
    ${laTicksEl.join('')}
    ${hrTicksEl.join('')}
    ${xTicksEl}
    <polygon points="${laArea}" fill="url(#laGrad)"/>
    <polyline points="${laLine}" fill="none" stroke="#EF4444" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>
    ${hasHr ? `<polyline points="${hrLine}" fill="none" stroke="#3B82F6" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="6,3"/>` : ''}
    ${laCircles}
    ${hrCircles}
    ${legend}
    <text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#6B7280">${escapeHtml(xLabel)}</text>
    <text x="14" y="${H / 2}" text-anchor="middle" font-size="12" fill="#EF4444" font-weight="600" transform="rotate(-90 14 ${H / 2})">Lactate (mmol/L)</text>
    ${hasHr ? `<text x="${W - 10}" y="${H / 2}" text-anchor="middle" font-size="12" fill="#3B82F6" font-weight="600" transform="rotate(90 ${W - 10} ${H / 2})">Heart Rate (bpm)</text>` : ''}
  </svg>`.trim();
}

/**
 * Build comparison SVG overlaying current and previous test lactate curves.
 */
function buildComparisonSvg({ currentTest, prevTest, sport, unitSystem, inputMode }) {
  const parse = (test) => (Array.isArray(test?.results) ? test.results : [])
    .map(r => ({ x: Number(r.power), la: Number(r.lactate), hr: Number(r.heartRate) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.la));

  const curPts = parse(currentTest);
  const prevPts = parse(prevTest);
  if (curPts.length < 2 && prevPts.length < 2) return '';

  const coreSport = (sport === 'run' || sport === 'swim' || sport === 'bike') ? sport : null;
  const isPace = coreSport === 'run' || coreSport === 'swim';
  const reverseX = isPace;

  const allX = [...curPts.map(p => p.x), ...prevPts.map(p => p.x)];
  const allLa = [...curPts.map(p => p.la), ...prevPts.map(p => p.la)];
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const minLa = 0;
  const maxLa = Math.max(6, Math.ceil(Math.max(...allLa) + 0.5));

  curPts.sort((a, b) => reverseX ? (b.x - a.x) : (a.x - b.x));
  prevPts.sort((a, b) => reverseX ? (b.x - a.x) : (a.x - b.x));

  const W = 700, H = 320;
  const padL = 50, padR = 20, padT = 28, padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const sx = (x) => {
    const d = maxX - minX || 1;
    const t = reverseX ? ((maxX - x) / d) : ((x - minX) / d);
    return padL + t * innerW;
  };
  const sy = (la) => padT + (1 - ((la - minLa) / (maxLa - minLa || 1))) * innerH;

  const curLine = curPts.map(p => `${sx(p.x).toFixed(1)},${sy(p.la).toFixed(1)}`).join(' ');
  const prevLine = prevPts.map(p => `${sx(p.x).toFixed(1)},${sy(p.la).toFixed(1)}`).join(' ');

  const curArea = curPts.length >= 2
    ? `${sx(curPts[0].x).toFixed(1)},${sy(0).toFixed(1)} ${curLine} ${sx(curPts[curPts.length - 1].x).toFixed(1)},${sy(0).toFixed(1)}`
    : '';

  const gridLines = [];
  const yTicks = [];
  for (let v = 0; v <= maxLa; v += 1) {
    const yy = sy(v);
    gridLines.push(`<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="#E5E7EB" stroke-width="0.8"/>`);
    yTicks.push(`<text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#6B7280">${v}</text>`);
  }

  const allUniqueX = [...new Set(allX)].sort((a, b) => reverseX ? (b - a) : (a - b));
  const tickEvery = allUniqueX.length > 14 ? 2 : 1;
  const xTicksEl = allUniqueX
    .filter((_, i) => i % tickEvery === 0)
    .map(x => {
      const xx = sx(x).toFixed(1);
      const label = formatIntensityTick(x, { sport: coreSport, unitSystem, inputMode });
      return `<line x1="${xx}" y1="${H - padB}" x2="${xx}" y2="${H - padB + 5}" stroke="#9CA3AF" stroke-width="1"/>
              <text x="${xx}" y="${H - padB + 18}" text-anchor="middle" font-size="11" fill="#6B7280">${escapeHtml(label)}</text>`;
    }).join('');

  const curCircles = curPts.map(p => {
    const cx = sx(p.x).toFixed(1);
    const cy = sy(p.la).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="4.5" fill="#FFFFFF" stroke="#767EB5" stroke-width="2"/>
            <text x="${cx}" y="${(Number(cy) - 7).toFixed(1)}" text-anchor="middle" font-size="9" fill="#767EB5" font-weight="700">${p.la.toFixed(1)}</text>`;
  }).join('');

  const prevCircles = prevPts.map(p => {
    const cx = sx(p.x).toFixed(1);
    const cy = sy(p.la).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#FFFFFF" stroke="#9CA3AF" stroke-width="1.8"/>
            <text x="${cx}" y="${(Number(cy) + 14).toFixed(1)}" text-anchor="middle" font-size="8" fill="#9CA3AF">${p.la.toFixed(1)}</text>`;
  }).join('');

  const xLabel = coreSport === 'bike' ? 'Power (W)'
    : (coreSport === 'run' || coreSport === 'swim') ? `Pace (${paceUnitLabel({ sport: coreSport, unitSystem })})` : 'Intensity';

  const curDate = currentTest?.date ? formatDateShort(currentTest.date) : '';
  const prevDate = prevTest?.date ? formatDateShort(prevTest.date) : '';
  const legendX = padL + 8;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
    <defs>
      <linearGradient id="curGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#767EB5" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#767EB5" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="#FFFFFF" stroke="#EEF2F7"/>
    ${gridLines.join('')}
    <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" stroke="#111827" stroke-width="1.2"/>
    ${yTicks.join('')}
    ${xTicksEl}
    ${curArea ? `<polygon points="${curArea}" fill="url(#curGrad)"/>` : ''}
    ${prevPts.length >= 2 ? `<polyline points="${prevLine}" fill="none" stroke="#9CA3AF" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="8,4"/>` : ''}
    ${curPts.length >= 2 ? `<polyline points="${curLine}" fill="none" stroke="#767EB5" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${prevCircles}
    ${curCircles}
    <rect x="${legendX}" y="${padT - 6}" width="14" height="3.5" rx="1.5" fill="#767EB5"/>
    <text x="${legendX + 18}" y="${padT - 2}" font-size="11" fill="#767EB5" font-weight="700">Current (${escapeHtml(curDate)})</text>
    <rect x="${legendX + 180}" y="${padT - 6}" width="14" height="3.5" rx="1.5" fill="#9CA3AF"/>
    <text x="${legendX + 198}" y="${padT - 2}" font-size="11" fill="#9CA3AF" font-weight="600">Previous (${escapeHtml(prevDate)})</text>
    <text x="${W / 2}" y="${H - 6}" text-anchor="middle" font-size="12" fill="#6B7280">${escapeHtml(xLabel)}</text>
    <text x="14" y="${H / 2}" text-anchor="middle" font-size="12" fill="#6B7280" transform="rotate(-90 14 ${H / 2})">Lactate (mmol/L)</text>
  </svg>`.trim();
}

let _logoBase64 = null;
function getLogoBase64() {
  if (_logoBase64) return _logoBase64;
  try {
    const candidates = [
      path.resolve(__dirname, '../assets/logo192.png'),
      path.resolve(__dirname, '../../client/public/logo192.png')
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        _logoBase64 = fs.readFileSync(p).toString('base64');
        break;
      }
    }
  } catch { /* ignore */ }
  return _logoBase64;
}

function drawHeader(doc, title, pageW) {
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, pageW, 28, 'F');

  const logo = getLogoBase64();
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 10, 4, 20, 20);
    } catch { /* ignore */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...BRAND.white);
  doc.text('LaChart', logo ? 34 : 12, 17);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(title || '', pageW - 14, 17, { align: 'right' });
}

function drawWatermark(doc, pageW, pageH) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(60);
  doc.setTextColor(230, 230, 240);
  const cx = pageW / 2;
  const cy = pageH / 2;
  doc.text('LaChart', cx, cy, { align: 'center', angle: 35 });
}

function drawFooter(doc, pageW, pageH, pageNum) {
  const footerY = pageH - 8;
  doc.setDrawColor(...BRAND.lightGray);
  doc.line(14, footerY - 4, pageW - 14, footerY - 4);
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.gray);
  doc.setFont('helvetica', 'normal');
  doc.text('LaChart – Advanced lactate testing and analysis  |  lachart.net', 14, footerY);
  doc.text(`Page ${pageNum}`, pageW - 14, footerY, { align: 'right' });
}

function drawSectionTitle(doc, text, y, left) {
  doc.setFillColor(...BRAND.primary);
  doc.roundedRect(left, y - 4.5, 3, 6, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND.dark);
  doc.text(text, left + 6, y + 1);
  return y + 8;
}

function ensureSpace(doc, y, needed, pageW, pageH, title, pageNumRef) {
  if (y + needed > pageH - 16) {
    drawFooter(doc, pageW, pageH, pageNumRef.n);
    doc.addPage();
    pageNumRef.n++;
    drawWatermark(doc, pageW, pageH);
    drawHeader(doc, title, pageW);
    drawFooter(doc, pageW, pageH, pageNumRef.n);
    return 34;
  }
  return y;
}

async function generateTestReportPdf(requesterUserId, testId) {
  if (!sharp || !jsPDF) {
    return { error: true, reason: 'pdf_not_available', message: 'PDF dependencies not installed' };
  }

  try {
    const data = await getReportData(requesterUserId, testId, {});
    if (data.error) return { error: true, reason: data.reason };

    const { test, athlete, sport, unitSystem, inputMode, curThr, prevTest, prevThr, curZones, focus, lactateSvg, baseTitle } = data;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const left = 14;
    const right = pageW - 14;
    const contentW = right - left;
    const pageNumRef = { n: 1 };

    drawWatermark(doc, pageW, pageH);
    drawHeader(doc, formatDateShort(test.date), pageW);
    drawFooter(doc, pageW, pageH, pageNumRef.n);

    let y = 34;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...BRAND.dark);
    doc.text(baseTitle, left, y);
    y += 4;
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.8);
    doc.line(left, y, left + 80, y);
    y += 8;

    // ---------- ATHLETE INFO CARD ----------
    y = ensureSpace(doc, y, 28, pageW, pageH, baseTitle, pageNumRef);
    doc.setFillColor(...BRAND.lightGray);
    doc.roundedRect(left, y - 2, contentW, 22, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.primary);
    doc.text('Athlete', left + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.dark);
    const athleteName = `${athlete?.name || ''} ${athlete?.surname || ''}`.trim() || '—';
    doc.text(athleteName, left + 4, y + 11);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.gray);
    const dob = athlete?.dateOfBirth ? formatDateShort(athlete.dateOfBirth) : '—';
    const hw = [Number.isFinite(athlete?.height) ? `${athlete.height} cm` : null, Number.isFinite(athlete?.weight) ? `${athlete.weight} kg` : null].filter(Boolean).join(' / ') || '—';
    doc.text(`Email: ${athlete?.email || '—'}   |   DOB: ${dob}   |   ${hw}   |   Sport: ${(athlete?.sport || '—').toUpperCase()}`, left + 4, y + 17);
    y += 28;

    // ---------- TEST INFO CARD ----------
    y = ensureSpace(doc, y, 22, pageW, pageH, baseTitle, pageNumRef);
    doc.setFillColor(245, 243, 255);
    doc.roundedRect(left, y - 2, contentW, 18, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.primary);
    doc.text('Test', left + 4, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.dark);
    doc.text(`Title: ${test.title || '—'}`, left + 4, y + 11);
    doc.text(`Date: ${formatDateShort(test.date)}   |   Baseline La: ${Number(test.baseLactate || 0).toFixed(2)} mmol/L`, left + 4, y + 15.5);
    y += 24;

    // ---------- LACTATE + HR CURVE (dual axis, 300 DPI) ----------
    const dualSvg = buildDualAxisCurveSvg({
      results: test.results || [],
      sport, unitSystem, inputMode
    });
    if (dualSvg) {
      y = ensureSpace(doc, y, 95, pageW, pageH, baseTitle, pageNumRef);
      y = drawSectionTitle(doc, 'Lactate Curve & Heart Rate', y, left);
      try {
        const pngBuffer = await sharp(Buffer.from(dualSvg, 'utf8'), { density: 300 })
          .png()
          .toBuffer();
        const base64 = pngBuffer.toString('base64');
        const imgW = contentW;
        const imgH = (320 / 700) * imgW;
        doc.addImage(base64, 'PNG', left, y, imgW, imgH);
        y += imgH + 6;
      } catch (imgErr) {
        console.warn('[LactateTestPdfService] Dual-axis SVG render error:', imgErr.message);
        y += 4;
      }
    }

    // ---------- TRAINING ZONES ----------
    y = ensureSpace(doc, y, 55, pageW, pageH, baseTitle, pageNumRef);
    y = drawSectionTitle(doc, 'Training Zones', y, left);

    if (curZones) {
      const mainHeader = sport === 'bike' ? 'Power' : 'Pace';
      const zoneNames = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO2 Max'];
      const zoneRows = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'].map((z, idx) => {
        const hr = curZones.heartRate?.[z];
        const main = (sport === 'bike') ? curZones.power?.[z] : curZones.pace?.[z];
        const mainText = sport === 'bike'
          ? `${main?.min ?? '—'} – ${main?.max ?? '—'} W`
          : `${main?.min ?? '—'} – ${main?.max ?? '—'}`;
        const hrText = hr ? `${hr.min} – ${hr.max} bpm` : '—';
        return [`Z${idx + 1}`, zoneNames[idx], mainText, hrText];
      });
      doc.autoTable({
        startY: y,
        head: [['Zone', 'Name', mainHeader, 'Heart Rate']],
        body: zoneRows,
        theme: 'plain',
        margin: { left, right: 14 },
        styles: { fontSize: 9, cellPadding: 2.5, textColor: BRAND.dark },
        headStyles: {
          fillColor: BRAND.primary,
          textColor: BRAND.white,
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: { lineColor: [230, 230, 240], lineWidth: 0.3 },
        didParseCell: function(data) {
          if (data.section === 'body' && data.column.index === 0) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = BRAND.white;
            data.cell.styles.fillColor = BRAND.zoneColors[data.row.index] || BRAND.gray;
          }
        }
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.gray);
      doc.text('Zones could not be calculated (missing LTP or HR data).', left, y);
      y += 8;
    }

    // ---------- THRESHOLDS ----------
    y = ensureSpace(doc, y, 60, pageW, pageH, baseTitle, pageNumRef);
    y = drawSectionTitle(doc, 'Thresholds', y, left);
    const methods = ['Log-log', 'IAT', 'OBLA 2.0', 'OBLA 2.5', 'OBLA 3.0', 'OBLA 3.5', 'Bsln + 0.5', 'Bsln + 1.0', 'Bsln + 1.5', 'LTP1', 'LTP2', 'LTRatio'];
    const thrRows = methods.map(m => {
      const v = curThr?.[m];
      const hr = curThr?.heartRates?.[m];
      const la = curThr?.lactates?.[m];
      const valueText = (m === 'LTRatio') ? (v ? String(v) : '—') : (v ? formatIntensity(Number(v), { sport, unitSystem, inputMode }) : '—');
      const hrText = (m === 'LTRatio') ? '—' : (hr ? String(Math.round(hr)) : '—');
      const laText = (m === 'LTRatio') ? '—' : (la ? Number(la).toFixed(2) : '—');
      return [m, valueText, hrText, laText];
    });
    doc.autoTable({
      startY: y,
      head: [['Method', 'Value', 'HR (bpm)', 'La (mmol/L)']],
      body: thrRows,
      theme: 'striped',
      margin: { left, right: 14 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND.primary, textColor: BRAND.white, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 248, 255] },
      didParseCell: function(data) {
        if (data.section === 'body') {
          const method = thrRows[data.row.index]?.[0];
          if (method === 'LTP1' || method === 'LTP2') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = method === 'LTP1' ? [220, 252, 231] : [254, 226, 226];
          }
        }
      }
    });
    y = doc.lastAutoTable.finalY + 8;

    // ---------- STAGE RESULTS ----------
    y = ensureSpace(doc, y, 40, pageW, pageH, baseTitle, pageNumRef);
    y = drawSectionTitle(doc, 'Stage Results', y, left);
    const resultRows = (test.results || []).map((r, idx) => {
      const stage = r.interval ?? (idx + 1);
      const p = formatIntensity(Number(r.power), { sport, unitSystem, inputMode });
      const hr = Number.isFinite(Number(r.heartRate)) ? String(Math.round(Number(r.heartRate))) : '—';
      const la = Number.isFinite(Number(r.lactate)) ? Number(r.lactate).toFixed(2) : '—';
      const rpe = Number.isFinite(Number(r.RPE)) ? String(Number(r.RPE)) : '—';
      return [String(stage), p, hr, la, rpe];
    });
    doc.autoTable({
      startY: y,
      head: [['Stage', 'Intensity', 'HR (bpm)', 'La (mmol/L)', 'RPE']],
      body: resultRows.length ? resultRows : [['—', '—', '—', '—', '—']],
      theme: 'striped',
      margin: { left, right: 14 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND.primary, textColor: BRAND.white, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 248, 255] }
    });
    y = doc.lastAutoTable.finalY + 8;

    // ---------- COMPARISON ----------
    y = ensureSpace(doc, y, 35, pageW, pageH, baseTitle, pageNumRef);
    y = drawSectionTitle(doc, 'Comparison with Previous Test', y, left);
    if (prevTest && curThr && prevThr) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.gray);
      doc.text(`Previous test: ${prevTest.title || '—'}  (${formatDateShort(prevTest.date)})`, left, y);
      y += 6;

      // Comparison graph: overlay both curves
      const compSvg = buildComparisonSvg({ currentTest: test, prevTest, sport, unitSystem, inputMode });
      if (compSvg) {
        y = ensureSpace(doc, y, 90, pageW, pageH, baseTitle, pageNumRef);
        try {
          const compPng = await sharp(Buffer.from(compSvg, 'utf8'), { density: 300 })
            .png()
            .toBuffer();
          const compB64 = compPng.toString('base64');
          const gW = contentW;
          const gH = (320 / 700) * gW;
          doc.addImage(compB64, 'PNG', left, y, gW, gH);
          y += gH + 6;
        } catch (compErr) {
          console.warn('[LactateTestPdfService] Comparison SVG render error:', compErr.message);
        }
      }

      // Comparison table
      const curLt1 = Number(curThr['LTP1'] || 0);
      const curLt2 = Number(curThr['LTP2'] || 0);
      const prevLt1 = Number(prevThr['LTP1'] || 0);
      const prevLt2 = Number(prevThr['LTP2'] || 0);
      const isPace = sport === 'run' || sport === 'swim';
      const delta1 = isPace ? prevLt1 - curLt1 : curLt1 - prevLt1;
      const delta2 = isPace ? prevLt2 - curLt2 : curLt2 - prevLt2;
      const pct1 = prevLt1 ? Math.round((delta1 / prevLt1) * 100) : 0;
      const pct2 = prevLt2 ? Math.round((delta2 / prevLt2) * 100) : 0;
      const arrow = (d) => d > 0 ? '+' : d < 0 ? '' : '';
      const compRows = [
        ['LTP1', formatIntensity(curLt1, { sport, unitSystem, inputMode }), formatIntensity(prevLt1, { sport, unitSystem, inputMode }), `${arrow(pct1)}${pct1}%`],
        ['LTP2', formatIntensity(curLt2, { sport, unitSystem, inputMode }), formatIntensity(prevLt2, { sport, unitSystem, inputMode }), `${arrow(pct2)}${pct2}%`]
      ];
      y = ensureSpace(doc, y, 25, pageW, pageH, baseTitle, pageNumRef);
      doc.autoTable({
        startY: y,
        head: [['Metric', 'Current', 'Previous', 'Change']],
        body: compRows,
        theme: 'plain',
        margin: { left, right: 14 },
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: BRAND.primary, textColor: BRAND.white, fontStyle: 'bold' },
        bodyStyles: { lineColor: [230, 230, 240], lineWidth: 0.3 },
        didParseCell: function(cellData) {
          if (cellData.section === 'body' && cellData.column.index === 3) {
            const val = parseFloat(cellData.cell.text?.[0] || '0');
            cellData.cell.styles.textColor = val > 0 ? BRAND.green : val < 0 ? BRAND.red : BRAND.gray;
            cellData.cell.styles.fontStyle = 'bold';
          }
        }
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.gray);
      doc.text('No previous test found for comparison.', left, y);
      y += 10;
    }

    // ---------- RECOMMENDATIONS ----------
    y = ensureSpace(doc, y, 30, pageW, pageH, baseTitle, pageNumRef);
    y = drawSectionTitle(doc, 'Recommendations', y, left);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.dark);
    if (focus && focus.length > 0) {
      focus.forEach(f => {
        y = ensureSpace(doc, y, 16, pageW, pageH, baseTitle, pageNumRef);
        doc.setFillColor(245, 243, 255);
        const bodyLines = doc.splitTextToSize(f.body || '', contentW - 12);
        const boxH = 6 + bodyLines.length * 4.2 + 4;
        doc.roundedRect(left, y - 2, contentW, boxH, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND.primary);
        doc.text(f.title || '', left + 4, y + 3);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...BRAND.dark);
        doc.text(bodyLines, left + 4, y + 8);
        y += boxH + 4;
      });
    } else {
      doc.text('Use these zones for 3–6 weeks, then re-test to measure progress.', left, y);
      y += 8;
    }

    // Final footer on last page
    drawFooter(doc, pageW, pageH, pageNumRef.n);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    return { pdf: pdfBuffer, title: baseTitle };
  } catch (err) {
    console.error('[LactateTestPdfService] Error:', err);
    return { error: true, reason: 'pdf_generation_failed', message: err.message || 'PDF generation failed' };
  }
}

module.exports = {
  generateTestReportPdf
};
