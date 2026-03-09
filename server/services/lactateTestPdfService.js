/**
 * Generate lactate test report PDF (no Puppeteer – works on Render.com).
 * Uses getReportData, sharp (SVG→PNG), jspdf + jspdf-autotable.
 * Professional design with LaChart branding, colors and watermark.
 */
const { getReportData } = require('./lactateTestReportEmailService');
const { formatPace } = require('../utils/lactateZones');
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

    // ---------- LACTATE CURVE (high quality, 300 DPI) ----------
    if (lactateSvg && lactateSvg.length > 0) {
      y = ensureSpace(doc, y, 90, pageW, pageH, baseTitle, pageNumRef);
      y = drawSectionTitle(doc, 'Lactate Curve', y, left);
      try {
        const styledSvg = lactateSvg.replace(
          '<svg ',
          '<svg font-family="Arial, Helvetica, sans-serif" '
        );
        const pngBuffer = await sharp(Buffer.from(styledSvg, 'utf8'), { density: 300 })
          .png()
          .toBuffer();
        const base64 = pngBuffer.toString('base64');
        const imgW = contentW;
        const imgH = (260 / 560) * imgW;
        doc.addImage(base64, 'PNG', left, y, imgW, imgH);
        y += imgH + 6;
      } catch (imgErr) {
        console.warn('[LactateTestPdfService] SVG render error:', imgErr.message);
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
