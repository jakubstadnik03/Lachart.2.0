/**
 * Generate lactate test report PDF (no Puppeteer – works on Render.com).
 * Uses getReportData, sharp (SVG→PNG for curve), jspdf + jspdf-autotable for layout.
 */
const { getReportData } = require('./lactateTestReportEmailService');
const { formatPace } = require('../utils/lactateZones');

let sharp;
let jsPDF;
try {
  sharp = require('sharp');
  const jspdfModule = require('jspdf');
  jsPDF = jspdfModule.jsPDF;
  require('jspdf-autotable'); // patches jsPDF prototype with autoTable
} catch (e) {
  console.warn('[LactateTestPdfService] Optional deps missing (sharp/jspdf/jspdf-autotable):', e.message);
}

function formatDateShort(dateLike, locale = 'cs-CZ') {
  try {
    return new Date(dateLike).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
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

/**
 * Generate PDF buffer for the given test.
 * @returns {{ pdf: Buffer, title: string }} or {{ error: true, reason: string, message?: string }}
 */
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
    let y = 14;
    const left = 14;
    const right = pageW - 14;

    // Title
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(baseTitle, left, y);
    y += 10;

    // Athlete block
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Athlete', left, y);
    y += 6;
    doc.setFont(undefined, 'normal');
    const athleteName = `${athlete?.name || ''} ${athlete?.surname || ''}`.trim() || '—';
    doc.text(athleteName, left, y);
    y += 5;
    doc.setFontSize(9);
    const dob = athlete?.dateOfBirth ? formatDateShort(athlete.dateOfBirth) : '—';
    const hw = [Number.isFinite(athlete?.height) ? `${athlete.height} cm` : null, Number.isFinite(athlete?.weight) ? `${athlete.weight} kg` : null].filter(Boolean).join(' • ') || '—';
    doc.text(`Email: ${athlete?.email || '—'}  |  DOB: ${dob}  |  ${hw}  |  Sport: ${athlete?.sport || '—'}`, left, y);
    y += 10;

    // Test info
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Test', left, y);
    y += 6;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(`Title: ${test.title || '—'}  |  Date: ${formatDateShort(test.date)}  |  Baseline lactate: ${Number(test.baseLactate || 0).toFixed(2)}`, left, y);
    y += 10;

    // Lactate curve image (SVG → PNG via sharp)
    if (lactateSvg && lactateSvg.length > 0) {
      try {
        const pngBuffer = await sharp(Buffer.from(lactateSvg, 'utf8'))
          .resize(520)
          .png()
          .toBuffer();
        const base64 = pngBuffer.toString('base64');
        const imgW = 180;
        const imgH = (260 / 560) * imgW;
        doc.addImage(base64, 'PNG', left, y, imgW, imgH);
        y += imgH + 8;
      } catch (imgErr) {
        console.warn('[LactateTestPdfService] SVG to image failed:', imgErr.message);
        y += 5;
      }
    }

    // Zones table
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Zones (calculated from this test)', left, y);
    y += 7;
    const mainHeader = sport === 'bike' ? 'Power' : 'Pace';
    const zoneRows = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'].map((z, idx) => {
      const zn = idx + 1;
      const hr = curZones?.heartRate?.[z];
      const main = (sport === 'bike') ? curZones?.power?.[z] : curZones?.pace?.[z];
      const mainText = sport === 'bike'
        ? `${main?.min ?? '—'}–${main?.max ?? '—'} W`
        : `${main?.min ?? '—'}–${main?.max ?? '—'}`;
      const hrText = hr ? `${hr.min}–${hr.max}` : '—';
      return [`Z${zn}`, mainText, hrText];
    });
    doc.autoTable({
      startY: y,
      head: [['Zone', mainHeader, 'HR']],
      body: zoneRows,
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [107, 114, 128] }
    });
    y = doc.lastAutoTable.finalY + 8;

    // Thresholds table
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Thresholds', left, y);
    y += 7;
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
      head: [['Method', 'Value', 'HR', 'La']],
      body: thrRows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [107, 114, 128] }
    });
    y = doc.lastAutoTable.finalY + 8;

    // Stage results
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Stage results', left, y);
    y += 7;
    const resultRows = (test.results || []).map((r, idx) => {
      const stage = r.interval ?? (idx + 1);
      const p = formatIntensity(Number(r.power), { sport, unitSystem, inputMode });
      const hr = Number.isFinite(Number(r.heartRate)) ? Math.round(Number(r.heartRate)) : '—';
      const la = Number.isFinite(Number(r.lactate)) ? Number(r.lactate).toFixed(2) : '—';
      const rpe = Number.isFinite(Number(r.RPE)) ? Number(r.RPE) : '—';
      return [String(stage), p, String(hr), la, String(rpe)];
    });
    doc.autoTable({
      startY: y,
      head: [['Stage', 'Intensity', 'HR', 'La', 'RPE']],
      body: resultRows.length ? resultRows : [['—', '—', '—', '—', '—']],
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [107, 114, 128] }
    });
    y = doc.lastAutoTable.finalY + 8;

    // Comparison (if previous test)
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Comparison', left, y);
    y += 7;
    if (prevTest && curThr && prevThr) {
      const curLt1 = Number(curThr['LTP1'] || 0);
      const curLt2 = Number(curThr['LTP2'] || 0);
      const prevLt1 = Number(prevThr['LTP1'] || 0);
      const prevLt2 = Number(prevThr['LTP2'] || 0);
      const isPace = sport === 'run' || sport === 'swim';
      const pct1 = prevLt1 ? Math.round(((isPace ? prevLt1 - curLt1 : curLt1 - prevLt1) / prevLt1) * 100) : 0;
      const pct2 = prevLt2 ? Math.round(((isPace ? prevLt2 - curLt2 : curLt2 - prevLt2) / prevLt2) * 100) : 0;
      const compRows = [
        ['LTP1', formatIntensity(curLt1, { sport, unitSystem, inputMode }), formatIntensity(prevLt1, { sport, unitSystem, inputMode }), `${pct1 > 0 ? '+' : ''}${pct1}%`],
        ['LTP2', formatIntensity(curLt2, { sport, unitSystem, inputMode }), formatIntensity(prevLt2, { sport, unitSystem, inputMode }), `${pct2 > 0 ? '+' : ''}${pct2}%`]
      ];
      doc.autoTable({
        startY: y,
        head: [['Metric', 'Current', 'Previous', 'Change']],
        body: compRows,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [107, 114, 128] }
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      doc.text('No previous test to compare.', left, y);
      y += 10;
    }

    // What to focus on
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('What to focus on', left, y);
    y += 7;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    (focus || []).forEach(f => {
      if (y > 270) { doc.addPage(); y = 14; }
      doc.setFont(undefined, 'bold');
      doc.text(f.title || '', left, y);
      y += 5;
      doc.setFont(undefined, 'normal');
      const lines = doc.splitTextToSize(f.body || '', right - left);
      doc.text(lines, left, y);
      y += lines.length * 5 + 4;
    });
    if (!focus || focus.length === 0) {
      doc.text('Use these zones for 3–6 weeks, then re-test to measure progress.', left, y);
      y += 8;
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text('LaChart – Advanced lactate testing and analysis', left, doc.internal.pageSize.getHeight() - 10);
    doc.text('Generated ' + new Date().toLocaleString(), right - 40, doc.internal.pageSize.getHeight() - 10);

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
