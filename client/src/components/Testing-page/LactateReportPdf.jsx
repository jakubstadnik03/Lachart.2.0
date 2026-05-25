/**
 * LactateReportPdf.jsx
 * Frontend PDF report using @react-pdf/renderer.
 */
import React from 'react';
import {
  Document, Page, View, Text, Svg, Path, Line, Rect, Circle,
  StyleSheet, Image, pdf,
} from '@react-pdf/renderer';
import { formatHeight, formatWeight, resolveDistanceUnitSystem, getUserUnits } from '../../utils/unitsConverter';

// ── Logo URL (client-side, resolved at runtime) ────────────────────────────────
const LOGO_URL = (() => {
  try { return `${window.location.origin}/images/LaChart.png`; }
  catch { return 'https://lachart.net/images/LaChart.png'; }
})();

// ── Brand ──────────────────────────────────────────────────────────────────────
const C = {
  primary:    '#767EB5',
  primaryDark:'#5E6590',
  secondary:  '#599FD0',
  dark:       '#111827',
  gray:       '#6B7280',
  lightGray:  '#F3F4F6',
  midGray:    '#D1D5DB',
  white:      '#FFFFFF',
  red:        '#EF4444',
  green:      '#16A34A',
  zone: ['#22C55E','#84CC16','#FACC15','#F97316','#EF4444'],
};

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', backgroundColor: C.white, paddingBottom: 50 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 32, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.lightGray },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLogo:  { width: 24, height: 24, marginRight: 6 },
  headerName:  { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.primary, letterSpacing: 0.3 },
  headerSub:   { fontSize: 7, color: C.gray, letterSpacing: 1, marginTop: 1 },
  headerDate:  { fontSize: 8, color: C.gray },

  // Footer
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 32, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.lightGray },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerLogo:  { width: 14, height: 14 },
  footerText:  { fontSize: 7.5, color: C.gray },
  footerName:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.primary },

  // Body
  body: { paddingHorizontal: 32, paddingTop: 8 },

  // Cover (compact, single-row layout: logo+brand left, title+date right)
  coverBand: { backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 16 },
  coverTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  coverBrandWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coverLogo: { width: 36, height: 36, objectFit: 'contain' },
  coverBrandName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 0.4 },
  coverBrandSub:  { fontSize: 7.5, color: 'rgba(255,255,255,0.65)', letterSpacing: 1 },
  coverTitleWrap: { alignItems: 'flex-end', flexShrink: 1, maxWidth: '60%' },
  coverTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.white, textAlign: 'right' },
  coverSub:   { fontSize: 9, color: '#C7CBE8', letterSpacing: 0.5, marginTop: 2, textAlign: 'right' },
  coverMeta:  { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  coverPill:  { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 5 },
  coverPillLabel: { fontSize: 6, color: 'rgba(255,255,255,0.7)', marginBottom: 1, letterSpacing: 0.7 },
  coverPillValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.white },

  // Athlete card (tighter — pulled closer to header)
  athleteCard: { flexDirection: 'row', marginTop: 12, marginBottom: 0, gap: 10 },
  infoCard:    { flex: 1, borderWidth: 1, borderColor: C.midGray, borderRadius: 8, padding: 10 },
  cardLabel:   { fontSize: 7, color: C.gray, letterSpacing: 0.7, marginBottom: 4, textTransform: 'uppercase' },
  cardRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  cardKey:     { fontSize: 8, color: C.gray },
  cardVal:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.dark },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 20 },
  sectionLine:   { flex: 1, height: 1, backgroundColor: C.lightGray, marginLeft: 8 },
  sectionTitle:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.primary, letterSpacing: 1, textTransform: 'uppercase' },

  // Results table
  table:      { borderWidth: 1, borderColor: C.midGray, borderRadius: 6, overflow: 'hidden' },
  tableHead:  { flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 7, paddingHorizontal: 10 },
  tableHeadT: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, flex: 1, textAlign: 'center' },
  tableRow:   { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.lightGray },
  tableRowAlt:{ backgroundColor: '#F9FAFB' },
  tableCell:  { fontSize: 8.5, color: C.dark, flex: 1, textAlign: 'center' },
  tableCellB: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark, flex: 1, textAlign: 'center' },

  // Threshold table
  thrRow:    { flexDirection: 'row', paddingVertical: 5.5, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.lightGray },
  thrMethod: { fontSize: 8.5, color: C.dark, flex: 2 },
  thrVal:    { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.primary, flex: 1.5, textAlign: 'right' },
  thrHr:     { fontSize: 8.5, color: C.gray, flex: 1.5, textAlign: 'right' },
  thrLa:     { fontSize: 8.5, color: C.red, flex: 1.5, textAlign: 'right' },

  // Zone row
  zoneRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.lightGray },
  zoneDot:  { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  zoneLabel:{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.dark, width: 40 },
  zoneName: { fontSize: 8, color: C.gray, flex: 1.5 },
  zoneVal:  { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark, flex: 2, textAlign: 'right' },
  zoneHr:   { fontSize: 8.5, color: C.gray, flex: 2, textAlign: 'right' },

  // Pre-test summary chips
  ptChipRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  ptChip:    { flex: 1, borderRadius: 6, padding: 8, alignItems: 'center' },
  ptChipVal: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  ptChipLbl: { fontSize: 6.5, letterSpacing: 0.5 },
  // Zone bar row
  ptZoneRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  ptZoneLbl: { fontSize: 7, color: '#6B7280', width: 18 },
  ptZoneBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#F3F4F6', overflow: 'hidden', marginHorizontal: 6 },
  ptZoneFill:{ height: 8, borderRadius: 4 },
  ptZonePct: { fontSize: 7, color: '#9CA3AF', width: 24, textAlign: 'right' },

  // Delta cards
  deltaPositive: { color: C.green, fontFamily: 'Helvetica-Bold' },
  deltaNegative: { color: C.red,   fontFamily: 'Helvetica-Bold' },
  deltaLabel:    { fontSize: 7.5, color: C.gray, marginBottom: 2 },
  deltaBig:      { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  deltaCards:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  deltaCard:     { flex: 1, borderWidth: 1, borderColor: C.midGray, borderRadius: 8, padding: 12, alignItems: 'center' },

  // Trend table (3-test comparison)
  trendTable:     { borderWidth: 1, borderColor: C.midGray, borderRadius: 6, overflow: 'hidden', marginTop: 14 },
  trendHead:      { flexDirection: 'row', backgroundColor: C.primaryDark, paddingVertical: 6, paddingHorizontal: 10 },
  trendHeadCell:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, flex: 1, textAlign: 'center' },
  trendHeadFirst: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, flex: 1.6 },
  trendRow:       { flexDirection: 'row', paddingVertical: 5.5, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.lightGray },
  trendRowAlt:    { backgroundColor: '#F9FAFB' },
  trendCellDate:  { fontSize: 8, color: C.gray, flex: 1.6 },
  trendCellVal:   { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark, flex: 1, textAlign: 'center' },
  trendBadge:     { fontSize: 6.5, color: C.white, backgroundColor: C.primary, borderRadius: 3,
                    paddingHorizontal: 4, paddingVertical: 1.5, marginLeft: 4 },
});

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString('cs-CZ', { day:'2-digit', month:'2-digit', year:'numeric' }); }
  catch { return '—'; }
};
const sportLabel = (s) => ({ bike:'Cycling', run:'Running', swim:'Swimming' }[s] || s || 'Sport');
const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

function fmtPace(secs) {
  if (!secs || !Number.isFinite(Number(secs))) return '—';
  const s  = Number(secs);
  const m  = Math.floor(s / 60);
  const ss = Math.round(s % 60);
  return `${m}:${String(ss).padStart(2,'0')}`;
}

function fmtIntensity(val, sport, inputMode) {
  if (!Number.isFinite(Number(val))) return '—';
  const v = Number(val);
  if (sport === 'bike') return `${Math.round(v)} W`;
  if (inputMode === 'pace') return `${fmtPace(v)} /km`;
  return `${v.toFixed(1)} km/h`;
}

// ── Shared SVG axis helpers ────────────────────────────────────────────────────
function makePts(results) {
  return results
    .map(r => ({ x: Number(r.power), la: Number(r.lactate), hr: Number(r.heartRate) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.la) && p.x > 0)
    .sort((a, b) => a.x - b.x);
}

/**
 * Build sx() — maps an X value to a pixel position.
 * For pace sports, axis is REVERSED: higher pace (slower) is on the LEFT.
 */
function makeSx(xMin, xMax, padLeft, cw, isPace) {
  return (x) => {
    const ratio = (xMax - xMin) < 0.001 ? 0 : (x - xMin) / (xMax - xMin);
    return isPace
      ? padLeft + (1 - ratio) * cw   // reversed: slow (big) = left
      : padLeft + ratio * cw;         // normal:   low  (sm)  = left
  };
}

/**
 * Cubic-polynomial (degree 3) fit on log(lactate) — same shape the interactive
 * LactateCurveCalculator chart uses. Returns a predictor function f(x) or null
 * when we don't have enough distinct data. Pure JS Gaussian elimination — no
 * mathjs dep, so the PDF bundle stays lean.
 *
 * Why log space: lactate curves are exponential, so fitting on log(la) gives
 * a smoother shape and avoids the U-shape overshoot a raw cubic produces near
 * the endpoints.
 */
function cubicFitLog(pts) {
  if (!Array.isArray(pts) || pts.length < 4) return null;
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.la);
  if (new Set(xs).size < 4) return null;
  const allPos = ys.every(y => y > 0);
  const yfit = allPos ? ys.map(Math.log) : ys;

  // Build normal-equation moments S_k = Σ x^k (k=0..6) and T_k = Σ y * x^k.
  const S = new Array(7).fill(0);
  const T = new Array(4).fill(0);
  for (let i = 0; i < pts.length; i++) {
    let xp = 1;
    for (let k = 0; k <= 6; k++) {
      S[k] += xp;
      if (k <= 3) T[k] += yfit[i] * xp;
      xp *= xs[i];
    }
  }
  // Augmented 4x5 matrix.
  const M = [
    [S[0], S[1], S[2], S[3], T[0]],
    [S[1], S[2], S[3], S[4], T[1]],
    [S[2], S[3], S[4], S[5], T[2]],
    [S[3], S[4], S[5], S[6], T[3]],
  ];
  // Gaussian elimination with partial pivoting.
  for (let i = 0; i < 4; i++) {
    let piv = i;
    for (let r = i + 1; r < 4; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    if (piv !== i) [M[i], M[piv]] = [M[piv], M[i]];
    if (Math.abs(M[i][i]) < 1e-12) return null; // singular
    for (let r = i + 1; r < 4; r++) {
      const f = M[r][i] / M[i][i];
      for (let c = i; c <= 4; c++) M[r][c] -= f * M[i][c];
    }
  }
  // Back-substitution.
  const b = new Array(4);
  for (let i = 3; i >= 0; i--) {
    let s = M[i][4];
    for (let j = i + 1; j < 4; j++) s -= M[i][j] * b[j];
    b[i] = s / M[i][i];
  }
  return (x) => {
    const v = b[0] + b[1] * x + b[2] * x * x + b[3] * x * x * x;
    return allPos ? Math.exp(v) : v;
  };
}

/** Sample a smooth function across [xMin, xMax] and emit an SVG path string. */
function sampledPath(fn, xMin, xMax, samples, sx, sy) {
  if (!fn || xMin === xMax) return '';
  const step = (xMax - xMin) / Math.max(1, samples);
  let d = '';
  for (let i = 0; i <= samples; i++) {
    const x = xMin + i * step;
    const y = fn(x);
    if (!Number.isFinite(y)) continue;
    const px = sx(x).toFixed(1);
    const py = sy(Math.max(0, y)).toFixed(1);
    d += d ? ` L ${px} ${py}` : `M ${px} ${py}`;
  }
  return d;
}

/** Build colored zone band specs from threshold keys.
 *  Returns ordered list of { from, to, fill } in numerical x order.
 *
 *  isPace=true: the x-axis is REVERSED (high seconds = slow pace = LEFT side).
 *  Palette[0]=Recovery(green) must appear on the LEFT, which is the band with
 *  the highest numerical x values (last band in ascending sort).  We therefore
 *  flip the palette index for pace so band N-1 (leftmost visually) gets
 *  palette[0] and band 0 (rightmost visually) gets palette[N-1]. */
function buildZoneBands(thresholds = {}, xMin, xMax, isPace = false) {
  // The five-zone scheme matches what the interactive coach chart uses:
  // Z1 recovery (below LTP1), Z2 aerobic (LTP1→IAT), Z3 tempo (IAT→LTP2),
  // Z4 threshold (LTP2→OBLA 3.0), Z5 VO₂max (above OBLA 3.0).
  const lt1  = numOrNull(thresholds.LTP1);
  const iat  = numOrNull(thresholds.IAT);
  const lt2  = numOrNull(thresholds.LTP2);
  const ob30 = numOrNull(thresholds['OBLA 3.0']);
  // Soft pastel fills — readable when printed, don't fight the data lines.
  // palette[0]=Recovery(green) … palette[4]=VO₂max(purple).
  const palette = ['#dcfce7', '#dbeafe', '#fef3c7', '#fee2e2', '#ede9fe'];
  const boundaries = [xMin, lt1, iat, lt2, ob30, xMax]
    .filter(v => v != null)
    // Clip thresholds to the domain so bands never render outside the chart.
    .map(v => Math.max(xMin, Math.min(xMax, v)))
    .sort((a, b) => a - b)
    // Deduplicate AFTER sort (pre-sort dedup missed out-of-order duplicates).
    .filter((v, i, arr) => i === 0 || v !== arr[i - 1]);
  const numBands = boundaries.length - 1;
  const bands = [];
  for (let i = 0; i < numBands; i++) {
    // For pace the axis is reversed: band 0 (numerically smallest x) sits on
    // the RIGHT (fastest/hardest), so it should get the VO₂max colour.
    // Flipping the index achieves this: band (numBands-1) (leftmost = easiest)
    // gets palette[0] = Recovery green, band 0 (rightmost = hardest) gets
    // palette[numBands-1].
    const pi = isPace ? (numBands - 1 - i) : i;
    bands.push({
      from: boundaries[i],
      to:   boundaries[i + 1],
      fill: palette[Math.min(pi, palette.length - 1)],
    });
  }
  return bands;
}
function numOrNull(v) { return Number.isFinite(Number(v)) ? Number(v) : null; }

// ── Single-test Lactate Curve SVG ──────────────────────────────────────────────
function LattateCurveSvg({ results = [], sport, inputMode, thresholds }) {
  const isPace = sport !== 'bike' && inputMode === 'pace';
  const W = 500, H = 210;
  const PAD = { top: 12, right: 24, bottom: 34, left: 42 };
  const cw  = W - PAD.left - PAD.right;
  const ch  = H - PAD.top  - PAD.bottom;

  const pts = makePts(results);
  if (pts.length < 2) return null;

  const xMin  = Math.min(...pts.map(p => p.x));
  const xMax  = Math.max(...pts.map(p => p.x));
  const laMax = Math.max(...pts.map(p => p.la), 6);

  const hrPts = pts.filter(p => Number.isFinite(p.hr) && p.hr > 50);
  const hasHr = hrPts.length >= 2;
  const hrMin = hasHr ? Math.min(...hrPts.map(p => p.hr)) - 10 : 0;
  const hrMax = hasHr ? Math.max(...hrPts.map(p => p.hr)) + 10 : 200;

  // Add a small margin (~5 % of the data range) on each side so the first and
  // last measurement points are not flush against the axis edges — mirrors
  // the default padding Chart.js applies in the interactive chart.
  const xRange   = xMax - xMin || 1;
  const xPad     = xRange * 0.05;
  const domainMin = xMin - xPad;
  const domainMax = xMax + xPad;

  const sx  = makeSx(domainMin, domainMax, PAD.left, cw, isPace);
  const sla = (la) => PAD.top + ch - (la / laMax) * ch;
  const shr = (hr) => PAD.top + ch - ((hr - hrMin) / (hrMax - hrMin || 1)) * ch;

  const laPath = pts.map((p, i) => `${i===0?'M':'L'} ${sx(p.x).toFixed(1)} ${sla(p.la).toFixed(1)}`).join(' ');
  const hrPath = hasHr ? hrPts.map((p, i) => `${i===0?'M':'L'} ${sx(p.x).toFixed(1)} ${shr(p.hr).toFixed(1)}`).join(' ') : '';

  // Smooth polynomial-3 fit (log-space) — the same curve coaches see in the
  // interactive LactateCurveCalculator. Renders as the primary curve;
  // the raw zigzag connecting raw points is dropped because the smooth curve
  // is what readers should focus on.
  const polyFn = cubicFitLog(pts);
  const polyPath = polyFn ? sampledPath(polyFn, xMin, xMax, 80, sx, sla) : '';

  const lt1 = thresholds?.['LTP1'];
  const lt2 = thresholds?.['LTP2'];

  // Colored zone bands behind the curve. Same five-zone palette as the
  // in-app chart so the printed report matches what the athlete sees.
  // Use the expanded domain so bands fill all the way to the chart edges
  // (including the 5 % margin), and clip any threshold outside the domain.
  // isPace is forwarded so the palette is flipped for reversed axes.
  const zoneBands = buildZoneBands(thresholds || {}, domainMin, domainMax, isPace);

  // Up to 6 X-axis ticks
  const xTicks = [...new Set([xMin, ...pts.map(p => p.x), xMax])];
  const laGridLines = [0, 2, 4, 6];

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Zone bands — painted FIRST so they sit behind grid + curve. The Rect
          spans the full plotting height; x/width are derived via sx() so the
          band orientation works in both normal and reversed (pace) axes. */}
      {zoneBands.map((b, i) => {
        const a = sx(b.from);
        const c = sx(b.to);
        const x = Math.min(a, c);
        const width = Math.abs(c - a);
        if (width < 0.5) return null;
        return (
          <Rect key={i}
            x={x.toFixed(1)} y={PAD.top.toFixed(1)}
            width={width.toFixed(1)} height={ch.toFixed(1)}
            fill={b.fill} opacity={0.55} />
        );
      })}

      {/* Grid */}
      {laGridLines.map(la => (
        <Line key={la}
          x1={PAD.left} y1={sla(la).toFixed(1)}
          x2={W - PAD.right} y2={sla(la).toFixed(1)}
          stroke={C.lightGray} strokeWidth={0.5} />
      ))}

      {/* LT1 dashed */}
      {lt1 && Number.isFinite(lt1) && lt1 >= xMin && lt1 <= xMax && (
        <>
          <Line x1={sx(lt1).toFixed(1)} y1={PAD.top}
            x2={sx(lt1).toFixed(1)} y2={PAD.top + ch}
            stroke={C.primary} strokeWidth={1} strokeDasharray="3,3" />
          <Rect x={sx(lt1) - 14} y={PAD.top + 2} width={28} height={11} rx={3} fill={C.primary} />
          <Text style={{ fontSize: 6, fill: C.white }}
            x={sx(lt1).toFixed(1)} y={PAD.top + 10} textAnchor="middle">LT1</Text>
        </>
      )}

      {/* LT2 dashed */}
      {lt2 && Number.isFinite(lt2) && lt2 >= xMin && lt2 <= xMax && (
        <>
          <Line x1={sx(lt2).toFixed(1)} y1={PAD.top}
            x2={sx(lt2).toFixed(1)} y2={PAD.top + ch}
            stroke={C.red} strokeWidth={1} strokeDasharray="3,3" />
          <Rect x={sx(lt2) - 14} y={PAD.top + 2} width={28} height={11} rx={3} fill={C.red} />
          <Text style={{ fontSize: 6, fill: C.white }}
            x={sx(lt2).toFixed(1)} y={PAD.top + 10} textAnchor="middle">LT2</Text>
        </>
      )}

      {/* HR curve */}
      {hasHr && <Path d={hrPath} stroke={C.secondary} strokeWidth={1.5} fill="none" strokeLinejoin="round" />}

      {/* Lactate curve — prefer the polynomial-3 smooth fit when we have
          enough data; fall back to the raw zigzag (≤3 stages or singular fit)
          so a sparse test still renders something useful. */}
      {polyPath
        ? <Path d={polyPath} stroke={C.red} strokeWidth={2} fill="none" strokeLinejoin="round" />
        : <Path d={laPath}   stroke={C.red} strokeWidth={2} fill="none" strokeLinejoin="round" strokeDasharray="3,2" />
      }

      {/* Data points */}
      {pts.map((p, i) => (
        <Circle key={i}
          cx={sx(p.x).toFixed(1)} cy={sla(p.la).toFixed(1)}
          r={3} fill={C.white} stroke={C.red} strokeWidth={1.5} />
      ))}

      {/* X axis baseline */}
      <Line x1={PAD.left} y1={PAD.top + ch} x2={W - PAD.right} y2={PAD.top + ch}
        stroke={C.midGray} strokeWidth={0.5} />

      {/* X axis ticks + labels */}
      {xTicks.map((x, i) => (
        <Text key={i} style={{ fontSize: 6.5, fill: C.gray }}
          x={sx(x).toFixed(1)} y={PAD.top + ch + 12} textAnchor="middle">
          {sport === 'bike' ? Math.round(x) : fmtPace(x)}
        </Text>
      ))}

      {/* Reversed axis arrow hint for pace sports */}
      {isPace && (
        <>
          <Text style={{ fontSize: 6, fill: C.gray }}
            x={PAD.left} y={PAD.top + ch + 24} textAnchor="start">← slower</Text>
          <Text style={{ fontSize: 6, fill: C.gray }}
            x={W - PAD.right} y={PAD.top + ch + 24} textAnchor="end">faster →</Text>
        </>
      )}

      {/* Y axis labels */}
      <Text style={{ fontSize: 6.5, fill: C.red }} x={6} y={PAD.top + ch / 2 + 2} textAnchor="middle">
        La
      </Text>
      {laGridLines.map(la => (
        <Text key={la} style={{ fontSize: 6, fill: C.gray }}
          x={PAD.left - 4} y={sla(la) + 2} textAnchor="end">{la}</Text>
      ))}

    </Svg>
  );
}

// ── Comparison Curve SVG — both tests overlaid ────────────────────────────────
function ComparisonCurveSvg({ currentResults = [], prevResults = [], sport, inputMode, currentThresholds, prevThresholds, currentDate, prevDate }) {
  const isPace = sport !== 'bike' && inputMode === 'pace';
  const W = 500, H = 180;
  const PAD = { top: 16, right: 24, bottom: 42, left: 42 };
  const cw  = W - PAD.left - PAD.right;
  const ch  = H - PAD.top  - PAD.bottom;

  const curPts  = makePts(currentResults);
  const prevPts = makePts(prevResults);
  if (curPts.length < 2 && prevPts.length < 2) return null;

  // Combined X range across both tests
  const allX  = [...curPts.map(p => p.x), ...prevPts.map(p => p.x)];
  const xMin  = Math.min(...allX);
  const xMax  = Math.max(...allX);

  // Combined La range
  const allLa = [...curPts.map(p => p.la), ...prevPts.map(p => p.la)];
  const laMax  = Math.max(...allLa, 6);

  const sx  = makeSx(xMin, xMax, PAD.left, cw, isPace);
  const sla = (la) => PAD.top + ch - (la / laMax) * ch;

  const pathOf = (pts) =>
    pts.map((p, i) => `${i===0?'M':'L'} ${sx(p.x).toFixed(1)} ${sla(p.la).toFixed(1)}`).join(' ');

  const curPath  = curPts.length  >= 2 ? pathOf(curPts)  : '';
  const prevPath = prevPts.length >= 2 ? pathOf(prevPts) : '';

  const curLT2  = currentThresholds?.['LTP2'];
  const prevLT2 = prevThresholds?.['LTP2'];

  // X-axis ticks (deduplicated, sorted)
  const xTicks = [...new Set([xMin, ...allX, xMax])].sort((a,b) => a-b);
  const laGrid = [0, 2, 4, 6];

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Grid */}
      {laGrid.map(la => (
        <Line key={la}
          x1={PAD.left} y1={sla(la).toFixed(1)}
          x2={W - PAD.right} y2={sla(la).toFixed(1)}
          stroke={C.lightGray} strokeWidth={0.5} />
      ))}

      {/* Previous LT2 */}
      {prevLT2 && Number.isFinite(prevLT2) && prevLT2 >= xMin && prevLT2 <= xMax && (
        <>
          <Line x1={sx(prevLT2).toFixed(1)} y1={PAD.top}
            x2={sx(prevLT2).toFixed(1)} y2={PAD.top + ch}
            stroke={C.gray} strokeWidth={1} strokeDasharray="3,3" />
          <Rect x={sx(prevLT2)-18} y={PAD.top+2} width={36} height={11} rx={3} fill={C.gray} />
          <Text style={{ fontSize: 5.5, fill: C.white }}
            x={sx(prevLT2).toFixed(1)} y={PAD.top+10} textAnchor="middle">LT2 prev</Text>
        </>
      )}

      {/* Current LT2 */}
      {curLT2 && Number.isFinite(curLT2) && curLT2 >= xMin && curLT2 <= xMax && (
        <>
          <Line x1={sx(curLT2).toFixed(1)} y1={PAD.top}
            x2={sx(curLT2).toFixed(1)} y2={PAD.top + ch}
            stroke={C.red} strokeWidth={1} strokeDasharray="3,3" />
          <Rect x={sx(curLT2)-14} y={PAD.top+2} width={28} height={11} rx={3} fill={C.red} />
          <Text style={{ fontSize: 6, fill: C.white }}
            x={sx(curLT2).toFixed(1)} y={PAD.top+10} textAnchor="middle">LT2</Text>
        </>
      )}

      {/* Previous test curve — dashed purple */}
      {prevPath && (
        <>
          <Path d={prevPath} stroke={C.primary} strokeWidth={1.5} fill="none"
            strokeLinejoin="round" strokeDasharray="5,3" />
          {prevPts.map((p, i) => (
            <Circle key={i}
              cx={sx(p.x).toFixed(1)} cy={sla(p.la).toFixed(1)}
              r={2.5} fill={C.white} stroke={C.primary} strokeWidth={1.2} />
          ))}
        </>
      )}

      {/* Current test curve — solid red */}
      {curPath && (
        <>
          <Path d={curPath} stroke={C.red} strokeWidth={2} fill="none" strokeLinejoin="round" />
          {curPts.map((p, i) => (
            <Circle key={i}
              cx={sx(p.x).toFixed(1)} cy={sla(p.la).toFixed(1)}
              r={3} fill={C.white} stroke={C.red} strokeWidth={1.5} />
          ))}
        </>
      )}

      {/* X axis baseline */}
      <Line x1={PAD.left} y1={PAD.top + ch} x2={W - PAD.right} y2={PAD.top + ch}
        stroke={C.midGray} strokeWidth={0.5} />

      {/* X ticks */}
      {xTicks.map((x, i) => (
        <Text key={i} style={{ fontSize: 6, fill: C.gray }}
          x={sx(x).toFixed(1)} y={PAD.top + ch + 11} textAnchor="middle">
          {sport === 'bike' ? Math.round(x) : fmtPace(x)}
        </Text>
      ))}

      {/* Axis arrow hints for pace */}
      {isPace && (
        <>
          <Text style={{ fontSize: 5.5, fill: C.gray }}
            x={PAD.left} y={PAD.top + ch + 22} textAnchor="start">← slower</Text>
          <Text style={{ fontSize: 5.5, fill: C.gray }}
            x={W - PAD.right} y={PAD.top + ch + 22} textAnchor="end">faster →</Text>
        </>
      )}

      {/* Y axis */}
      <Text style={{ fontSize: 6.5, fill: C.red }} x={6} y={PAD.top + ch/2 + 2} textAnchor="middle">
        La
      </Text>
      {laGrid.map(la => (
        <Text key={la} style={{ fontSize: 6, fill: C.gray }}
          x={PAD.left - 4} y={sla(la) + 2} textAnchor="end">{la}</Text>
      ))}

      {/* Legend box */}
      <Rect x={PAD.left + 4} y={PAD.top + 2} width={130} height={prevPath && curPath ? 30 : 16}
        rx={3} fill="white" stroke={C.lightGray} strokeWidth={0.5} />

      {curPath && (
        <>
          <Line x1={PAD.left+10} y1={PAD.top+10} x2={PAD.left+22} y2={PAD.top+10}
            stroke={C.red} strokeWidth={2} />
          <Text style={{ fontSize: 6.5, fill: C.dark }} x={PAD.left+26} y={PAD.top+12}>
            {currentDate ? `Current (${currentDate})` : 'Current test'}
          </Text>
        </>
      )}
      {prevPath && (
        <>
          <Line x1={PAD.left+10} y1={PAD.top+22} x2={PAD.left+22} y2={PAD.top+22}
            stroke={C.primary} strokeWidth={1.5} strokeDasharray="4,2" />
          <Text style={{ fontSize: 6.5, fill: C.dark }} x={PAD.left+26} y={PAD.top+24}>
            {prevDate ? `Previous (${prevDate})` : 'Previous test'}
          </Text>
        </>
      )}
    </Svg>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────
const Header = ({ title, date, branding }) => (
  <View style={s.header} fixed>
    <View style={s.headerBrand}>
      <Image src={branding?.logoUrl || LOGO_URL} style={s.headerLogo} />
      <View>
        <Text style={s.headerName}>{branding?.title || 'LaChart'}</Text>
        <Text style={s.headerSub}>LACTATE ANALYSIS PLATFORM</Text>
      </View>
    </View>
    <Text style={s.headerDate}>{title} · {date}</Text>
  </View>
);

// ── Footer ─────────────────────────────────────────────────────────────────────
const Footer = ({ athlete, creatorEmail, branding }) => (
  <View style={s.footer} fixed>
    <View style={s.footerBrand}>
      <Image src={branding?.logoUrl || LOGO_URL} style={s.footerLogo} />
      <Text style={s.footerName}>{branding?.title || 'LaChart'}</Text>
      {branding?.trademark
        ? <Text style={s.footerText}> · {branding.trademark}</Text>
        : <Text style={s.footerText}> · lachart.net</Text>
      }
      {creatorEmail ? <Text style={s.footerText}> · Contact: {creatorEmail}</Text> : null}
    </View>
    <Text style={s.footerText}
      render={({ pageNumber, totalPages }) => `${athlete || ''} · Page ${pageNumber} / ${totalPages}`} />
  </View>
);

// ── Pre-test training summary section ──────────────────────────────────────────
const PT_ZONE_COLORS = ['#60A5FA', '#34D399', '#FBBF24', '#F97316', '#F43F5E'];

function fmtDurPdf(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function PreTestSection({ preTestSummary }) {
  if (!preTestSummary) return null;
  const { totalTimeSecs, totalSessions, zonePcts, zoneDurs, aerobicPct, highIntensityPct, totalZoneSecs } = preTestSummary;
  if (!totalTimeSecs && !totalSessions) return null;

  const maxZoneSecs = Math.max(...Object.values(zoneDurs || {}), 1);

  return (
    <View wrap={false}>
      {/* chips */}
      <View style={s.ptChipRow}>
        <View style={[s.ptChip, { backgroundColor: '#EFF6FF' }]}>
          <Text style={[s.ptChipVal, { color: '#1D4ED8' }]}>{fmtDurPdf(totalTimeSecs)}</Text>
          <Text style={[s.ptChipLbl, { color: '#3B82F6' }]}>Total time</Text>
        </View>
        <View style={[s.ptChip, { backgroundColor: '#F0FDF4' }]}>
          <Text style={[s.ptChipVal, { color: '#15803D' }]}>{totalSessions}</Text>
          <Text style={[s.ptChipLbl, { color: '#22C55E' }]}>Sessions</Text>
        </View>
        {totalZoneSecs > 0 && (
          <View style={[s.ptChip, { backgroundColor: '#FFFBEB' }]}>
            <Text style={[s.ptChipVal, { color: '#B45309' }]}>{aerobicPct}%</Text>
            <Text style={[s.ptChipLbl, { color: '#F59E0B' }]}>Z1+Z2 aerobic</Text>
          </View>
        )}
        {totalZoneSecs > 0 && (
          <View style={[s.ptChip, { backgroundColor: '#FFF1F2' }]}>
            <Text style={[s.ptChipVal, { color: '#B91C1C' }]}>{highIntensityPct}%</Text>
            <Text style={[s.ptChipLbl, { color: '#F43F5E' }]}>High intensity</Text>
          </View>
        )}
      </View>

      {/* zone bars */}
      {totalZoneSecs > 0 && (
        <View>
          {[1,2,3,4,5].map(z => {
            const key  = `z${z}`;
            const pct  = zonePcts?.[key] || 0;
            const barW = Math.round((zoneDurs?.[key] || 0) / maxZoneSecs * 100);
            return (
              <View key={z} style={s.ptZoneRow}>
                <Text style={s.ptZoneLbl}>Z{z}</Text>
                <View style={s.ptZoneBar}>
                  <View style={[s.ptZoneFill, { width: `${barW}%`, backgroundColor: PT_ZONE_COLORS[z-1] }]} />
                </View>
                <Text style={s.ptZonePct}>{pct}%</Text>
                <Text style={{ fontSize: 7, color: '#9CA3AF', width: 28, textAlign: 'right' }}>
                  {fmtDurPdf(zoneDurs?.[key])}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Section header ──────────────────────────────────────────────────────────────
const SectionHeader = ({ title }) => (
  <View style={s.sectionHeader}>
    <Text style={s.sectionTitle}>{title}</Text>
    <View style={s.sectionLine} />
  </View>
);

// ── Main Document ───────────────────────────────────────────────────────────────
export default function LactateReportPdf({ test, athlete, thresholds, zones, prevTest, prevThresholds, prevTest2, prevThresholds2, customNote, customAnalysis, creatorEmail, preTestSummary, coachBranding }) {
  if (!test) return null;

  const sport       = test.sport || 'bike';
  const inputMode   = test.inputMode || 'pace';
  const unitSys     = test.unitSystem || 'metric';
  const results     = Array.isArray(test.results) ? test.results : [];
  const athleteName = athlete ? `${athlete.name || ''} ${athlete.surname || ''}`.trim() : 'Athlete';
  const testDate    = fmtDate(test.date);
  const isBike      = sport === 'bike';

  // Key thresholds — current
  const lt1   = thresholds?.['LTP1'];
  const lt2   = thresholds?.['LTP2'];
  const obla  = thresholds?.['OBLA 3.0'];
  const lt1Hr = thresholds?.heartRates?.['LTP1'];
  const lt2Hr = thresholds?.heartRates?.['LTP2'];

  // Previous test (primary comparison)
  const prevLt2    = prevThresholds?.['LTP2'];
  const prevLt1    = prevThresholds?.['LTP1'];
  const prevLt2Hr  = prevThresholds?.heartRates?.['LTP2'];
  const hasPrev    = !!(prevTest && prevThresholds && Array.isArray(prevTest.results) && prevTest.results.length >= 2);
  const prevDate   = hasPrev ? fmtDate(prevTest.date) : null;

  // Second comparison test (optional, for 3-test trend)
  const prevLt2_2    = prevThresholds2?.['LTP2'];
  const prevLt1_2    = prevThresholds2?.['LTP1'];
  const hasPrev2     = !!(prevTest2 && prevThresholds2 && Array.isArray(prevTest2.results) && prevTest2.results.length >= 2);
  const prevDate2    = hasPrev2 ? fmtDate(prevTest2.date) : null;

  // Zones
  const zoneData = zones?.power || zones?.pace || null;
  const zoneHr   = zones?.heartRate || null;
  const hasZones = zoneData != null;

  const thrMethods = ['LTP1','LTP2','OBLA 2.0','OBLA 2.5','OBLA 3.0','OBLA 3.5','Log-log','IAT','Bsln + 0.5','Bsln + 1.0'];
  const zoneNames  = ['Recovery','Aerobic','Tempo','Threshold','VO2max'];

  // Check if HR data exists in results
  const hasHrData = results.filter(r => Number.isFinite(Number(r.heartRate)) && Number(r.heartRate) > 50).length >= 2;

  // Build automatic analysis paragraph (used unless caller provides a
  // hand-written customAnalysis override). When `customAnalysis` is set
  // it fully replaces the generated text — coaches often want to add
  // sport-specific or athlete-specific commentary that the generator
  // can't infer from numbers alone.
  const analysisText = (typeof customAnalysis === 'string' && customAnalysis.trim().length > 0)
    ? customAnalysis.trim()
    : (() => {
    const lt2Str   = lt2   ? fmtIntensity(lt2,   sport, inputMode) : null;
    const lt1Str   = lt1   ? fmtIntensity(lt1,   sport, inputMode) : null;
    const lt2HrStr = lt2Hr ? `${Math.round(lt2Hr)} bpm` : null;
    const lt1HrStr = lt1Hr ? `${Math.round(lt1Hr)} bpm` : null;

    let text = `Lactate curve recorded during this ${sportLabel(sport).toLowerCase()} test on ${testDate}. `;

    if (lt1Str) {
      text += `Aerobic threshold (LT1): ${lt1Str}${lt1HrStr ? ` · ${lt1HrStr}` : ''}. Below this point lactate remains stable and aerobic metabolism dominates. `;
    }
    if (lt2Str) {
      text += `Anaerobic threshold (LT2): ${lt2Str}${lt2HrStr ? ` · ${lt2HrStr}` : ''}. Above this intensity lactate accumulates faster than it can be cleared — the upper limit of sustainable race efforts. `;
    }
    if (hasPrev && prevLt2 && lt2) {
      const diff = Number(lt2) - Number(prevLt2);
      const improved = isBike ? diff > 0 : diff < 0;
      const diffStr  = isBike ? `${Math.abs(Math.round(diff))} W` : fmtPace(Math.abs(diff));
      text += improved
        ? `vs. previous test (${prevDate}): LT2 improved by ${diffStr} — positive training adaptation. `
        : (diff === 0 ? `vs. previous test (${prevDate}): LT2 remained stable. ` : `vs. previous test (${prevDate}): LT2 shifted by ${diffStr} — monitor training load and recovery. `);
    }
    text += `Training in the zones derived from these thresholds will support aerobic base development and overall endurance performance.`;
    return text;
  })();

  return (
    <Document title={`Lactate Report · ${athleteName} · ${testDate}`} author="LaChart">

      {/* ── PAGE 1: Cover + Lactate Curve + Stage Results ── */}
      <Page size="A4" style={s.page}>
        {/* No Header on page 1 — cover band already shows logo + title */}

        {/* Cover band — single compact row: brand left, title right */}
        <View style={s.coverBand}>
          <View style={s.coverTopRow}>
            <View style={s.coverBrandWrap}>
              <Image src={coachBranding?.logoUrl || LOGO_URL} style={s.coverLogo} />
              <View>
                <Text style={s.coverBrandName}>{coachBranding?.title || 'LaChart'}</Text>
                <Text style={s.coverBrandSub}>LACTATE ANALYSIS PLATFORM</Text>
              </View>
            </View>
            <View style={s.coverTitleWrap}>
              <Text style={s.coverTitle}>{test.title || 'Lactate Test Report'}</Text>
              <Text style={s.coverSub}>{sportLabel(sport)} · {testDate}</Text>
            </View>
          </View>

          <View style={s.coverMeta}>
            {[
              { label: 'ATHLETE', value: athleteName },
              { label: 'SPORT',   value: sportLabel(sport) },
              { label: 'LT1',     value: fmtIntensity(lt1, sport, inputMode) },
              { label: 'LT2',     value: fmtIntensity(lt2, sport, inputMode) },
              { label: 'BASE La', value: test.baseLactate ? `${Number(test.baseLactate).toFixed(2)} mmol/L` : '—' },
            ].map(item => (
              <View key={item.label} style={s.coverPill}>
                <Text style={s.coverPillLabel}>{item.label}</Text>
                <Text style={s.coverPillValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.body}>
          {/* Athlete + Test info cards */}
          <View style={s.athleteCard}>
            <View style={s.infoCard}>
              <Text style={s.cardLabel}>Athlete</Text>
              {[
                ['Name',   athleteName],
                ['Email',  athlete?.email || '—'],
                ['Sport',  sportLabel(athlete?.sport || sport)],
                // Prefer the weight captured at test time (testers commonly weigh in
                // before each lab session) and fall back to the athlete's profile.
                // Height isn't recorded per-test, so it comes from the profile only.
                ['Weight',
                  (test?.weight != null && Number.isFinite(Number(test.weight)) && Number(test.weight) > 0)
                    ? formatWeight(Number(test.weight), getUserUnits(athlete).weight).formatted
                    : (athlete?.weight
                        ? formatWeight(athlete.weight, getUserUnits(athlete).weight).formatted
                        : '—')],
                ['Height', athlete?.height ? formatHeight(athlete.height, resolveDistanceUnitSystem(athlete)) : '—'],
              ].map(([k,v]) => (
                <View key={k} style={s.cardRow}>
                  <Text style={s.cardKey}>{k}</Text>
                  <Text style={s.cardVal}>{v}</Text>
                </View>
              ))}
            </View>
            <View style={s.infoCard}>
              <Text style={s.cardLabel}>Test Info</Text>
              {[
                ['Date',         testDate],
                ['Title',        test.title || '—'],
                ['Base lactate', test.baseLactate ? `${Number(test.baseLactate).toFixed(2)} mmol/L` : '—'],
                ['Unit system',  capitalize(unitSys)],
                ['Stages',       results.length],
              ].map(([k,v]) => (
                <View key={k} style={s.cardRow}>
                  <Text style={s.cardKey}>{k}</Text>
                  <Text style={s.cardVal}>{String(v)}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Lactate curve */}
          <SectionHeader title="Lactate Curve" />

          {/* Legend above chart */}
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 20, height: 2, backgroundColor: C.red }} />
              <Text style={{ fontSize: 7.5, color: C.dark }}>Lactate (mmol/L)</Text>
            </View>
            {hasHrData && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 20, height: 2, backgroundColor: C.secondary }} />
                <Text style={{ fontSize: 7.5, color: C.dark }}>Heart Rate (bpm)</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 10, height: 1, backgroundColor: C.primary, marginRight: 2 }} />
              <View style={{ width: 3, height: 1, backgroundColor: C.primary, marginRight: 2 }} />
              <View style={{ width: 5, height: 1, backgroundColor: C.primary }} />
              <Text style={{ fontSize: 7.5, color: C.dark }}>LT1</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 10, height: 1, backgroundColor: C.red, marginRight: 2 }} />
              <View style={{ width: 3, height: 1, backgroundColor: C.red, marginRight: 2 }} />
              <View style={{ width: 5, height: 1, backgroundColor: C.red }} />
              <Text style={{ fontSize: 7.5, color: C.dark }}>LT2</Text>
            </View>
          </View>

          {/* Zone band legend — explains what the colored backgrounds in the
              chart represent. Mirrors the five-zone palette in buildZoneBands. */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            {[
              { fill: '#dcfce7', label: 'Recovery (<LT1)' },
              { fill: '#dbeafe', label: 'Aerobic (LT1→IAT)' },
              { fill: '#fef3c7', label: 'Tempo (IAT→LT2)' },
              { fill: '#fee2e2', label: 'Threshold (LT2→3.0)' },
              { fill: '#ede9fe', label: 'VO₂max (>3.0)' },
            ].map((z) => (
              <View key={z.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 10, height: 8, backgroundColor: z.fill, borderRadius: 1 }} />
                <Text style={{ fontSize: 6.5, color: C.gray }}>{z.label}</Text>
              </View>
            ))}
          </View>

          <View wrap={false}>
            {results.length >= 2
              ? <LattateCurveSvg results={results} sport={sport} inputMode={inputMode} thresholds={thresholds} />
              : <Text style={{ fontSize: 8.5, color: C.gray }}>Not enough data points to render curve.</Text>
            }
          </View>

          {/* Analysis paragraph */}
          <View wrap={false} style={{ marginTop: 10, padding: 12, backgroundColor: C.lightGray, borderRadius: 6 }}>
            <Text style={{ fontSize: 7.5, color: C.gray, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 5, fontFamily: 'Helvetica-Bold' }}>
              Analysis
            </Text>
            <Text style={{ fontSize: 8.5, color: C.dark, lineHeight: 1.6 }}>
              {analysisText}
            </Text>
            {customNote ? (
              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.midGray }}>
                <Text style={{ fontSize: 7.5, color: C.gray, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 4, fontFamily: 'Helvetica-Bold' }}>
                  Coach / Athlete Notes
                </Text>
                <Text style={{ fontSize: 8.5, color: C.dark, lineHeight: 1.6 }}>{customNote}</Text>
              </View>
            ) : null}
          </View>

          {/* Stage results table — wrap={false} on the outer View keeps the
              section header + every row on the same page. If the table is too
              tall for the remaining space on page 1 the renderer moves the
              entire block to page 2 as a unit rather than orphaning the last
              few rows. Individual rows still carry wrap={false} as a belt-and-
              suspenders guard for unusually long tests (>~15 stages) where the
              table itself may need to span pages. */}
          <View wrap={false}>
            <SectionHeader title="Stage Results" />
            <View style={s.table}>
              <View style={s.tableHead}>
                {['Stage', isBike ? 'Power (W)' : 'Pace', 'HR (bpm)', 'Lactate (mmol/L)', 'RPE'].map(h => (
                  <Text key={h} style={s.tableHeadT}>{h}</Text>
                ))}
              </View>
              {results.map((r, i) => (
                <View key={i} wrap={false} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={s.tableCellB}>{r.interval ?? i + 1}</Text>
                  <Text style={s.tableCell}>{fmtIntensity(r.power, sport, inputMode)}</Text>
                  <Text style={s.tableCell}>{r.heartRate || '—'}</Text>
                  <Text style={[s.tableCell, { color: Number(r.lactate) >= 4 ? C.red : C.dark }]}>
                    {r.lactate != null ? Number(r.lactate).toFixed(2) : '—'}
                  </Text>
                  <Text style={s.tableCell}>{r.RPE || '—'}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <Footer athlete={athleteName} creatorEmail={creatorEmail} branding={coachBranding} />
      </Page>

      {/* ── PAGE 2: Thresholds + Zones + Comparison ── */}
      <Page size="A4" style={s.page}>
        <Header title={`${sportLabel(sport)} · Lactate Report`} date={testDate} branding={coachBranding} />

        <View style={s.body}>
          {/* Key threshold highlight cards — now include lactate value */}
          <SectionHeader title="Key Thresholds" />
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'LT1 · Aerobic Threshold',  val: fmtIntensity(lt1,  sport, inputMode), hr: lt1Hr, la: thresholds?.lactates?.['LTP1'],     color: C.primary   },
              { label: 'LT2 · Anaerobic Threshold', val: fmtIntensity(lt2,  sport, inputMode), hr: lt2Hr, la: thresholds?.lactates?.['LTP2'],     color: C.red       },
              { label: 'OBLA 3.0',                  val: fmtIntensity(obla, sport, inputMode), hr: thresholds?.heartRates?.['OBLA 3.0'], la: thresholds?.lactates?.['OBLA 3.0'] ?? 3.0, color: C.secondary },
            ].map(item => (
              <View key={item.label} style={{ flex: 1, borderRadius: 8, borderWidth: 1.5,
                borderColor: item.color, padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 7, color: item.color, letterSpacing: 0.8,
                  textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</Text>
                <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: item.color,
                  marginBottom: 4 }}>{item.val}</Text>
                {item.hr && <Text style={{ fontSize: 8, color: C.gray }}>{Math.round(item.hr)} bpm</Text>}
                {Number.isFinite(Number(item.la)) && (
                  <Text style={{ fontSize: 8, color: C.gray, marginTop: 1 }}>
                    {Number(item.la).toFixed(2)} mmol/L
                  </Text>
                )}
              </View>
            ))}
          </View>

          {/* All threshold methods */}
          <SectionHeader title="All Threshold Methods" />
          <View style={s.table}>
            <View style={s.tableHead}>
              {['Method', isBike ? 'Power' : 'Pace', 'HR (bpm)', 'La (mmol/L)'].map(h => (
                <Text key={h} style={s.tableHeadT}>{h}</Text>
              ))}
            </View>
            {thrMethods.map((method, i) => {
              const val = thresholds?.[method];
              const hr  = thresholds?.heartRates?.[method];
              const la  = thresholds?.lactates?.[method];
              if (!Number.isFinite(Number(val))) return null;
              return (
                <View key={method} style={[s.thrRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={[s.thrMethod, (method==='LTP1'||method==='LTP2') ? { fontFamily:'Helvetica-Bold' } : {}]}>
                    {method}
                  </Text>
                  <Text style={s.thrVal}>{fmtIntensity(val, sport, inputMode)}</Text>
                  <Text style={s.thrHr}>{hr ? `${Math.round(hr)} bpm` : '—'}</Text>
                  <Text style={s.thrLa}>{la ? `${Number(la).toFixed(2)}` : '—'}</Text>
                </View>
              );
            })}
          </View>

          {/* Training zones */}
          {hasZones && <>
            <SectionHeader title="Training Zones" />
            <View style={s.table}>
              <View style={s.tableHead}>
                {['Zone', 'Name', isBike ? 'Power (W)' : 'Pace', 'Heart Rate'].map(h => (
                  <Text key={h} style={s.tableHeadT}>{h}</Text>
                ))}
              </View>
              {[1,2,3,4,5].map((z, i) => {
                const zKey = `zone${z}`;
                const zd   = zoneData[zKey];
                const zh   = zoneHr?.[zKey];
                const color = C.zone[i];
                if (!zd) return null;
                const valStr = isBike
                  ? `${Math.round(zd.min ?? 0)} – ${Math.round(zd.max ?? 0)} W`
                  : `${zd.min || '—'} – ${zd.max || '—'} /km`;
                const hrStr = zh
                  ? `${Math.round(zh.min ?? 0)} – ${Math.round(zh.max ?? 0)} bpm`
                  : '—';
                return (
                  <View key={z} style={[s.zoneRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                    <View style={[s.zoneDot, { backgroundColor: color }]} />
                    <Text style={s.zoneLabel}>Z{z}</Text>
                    <Text style={s.zoneName}>{zoneNames[i]}</Text>
                    <Text style={s.zoneVal}>{valStr}</Text>
                    <Text style={s.zoneHr}>{hrStr}</Text>
                  </View>
                );
              })}
            </View>
          </>}

          {/* ── Pre-test training context ── */}
          {preTestSummary && (
            <>
              <SectionHeader title="Pre-test Training · 8 weeks" />
              <PreTestSection preTestSummary={preTestSummary} />
            </>
          )}

          {/* ── Comparison with previous test ── */}
          {hasPrev && <>
            <SectionHeader title={hasPrev2 ? `Progress Trend · ${prevDate2} → ${prevDate} → ${testDate}` : `Comparison vs Previous Test · ${prevDate}`} />

            {/* Overlaid dual-curve chart (primary comparison only) */}
            <ComparisonCurveSvg
              currentResults={results}
              prevResults={prevTest.results}
              sport={sport}
              inputMode={inputMode}
              currentThresholds={thresholds}
              prevThresholds={prevThresholds}
              currentDate={testDate}
              prevDate={prevDate}
            />

            {/* Delta cards (current vs primary comparison) */}
            <View style={[s.deltaCards, { marginTop: 12 }]}>
              {[
                { label: 'LT1 change', cur: lt1,   prev: prevLt1,   unit: isBike ? 'W' : 's', better: isBike },
                { label: 'LT2 change', cur: lt2,   prev: prevLt2,   unit: isBike ? 'W' : 's', better: isBike },
                { label: 'LT2 HR',     cur: lt2Hr, prev: prevLt2Hr, unit: 'bpm', better: false },
              ].map(item => {
                const diff = Number(item.cur) - Number(item.prev);
                const sign = diff > 0 ? '+' : '';
                const good = item.better ? diff > 0 : diff < 0;
                const st   = diff === 0 ? {} : good ? s.deltaPositive : s.deltaNegative;
                const valStr = item.unit === 'bpm'
                  ? `${sign}${Math.round(diff)} bpm`
                  : isBike
                    ? `${sign}${Math.round(diff)} W`
                    : `${sign}${fmtPace(Math.abs(diff))}`;
                return (
                  <View key={item.label} style={s.deltaCard}>
                    <Text style={s.deltaLabel}>{item.label}</Text>
                    <Text style={[s.deltaBig, st]}>{Number.isFinite(diff) ? valStr : '—'}</Text>
                    <Text style={{ fontSize: 7.5, color: C.gray }}>
                      {fmtIntensity(item.prev, sport, inputMode)} → {fmtIntensity(item.cur, sport, inputMode)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* ── 3-test trend table (shown when a second comparison test is also selected) ── */}
            {hasPrev2 && (
              <View style={s.trendTable}>
                {/* Header */}
                <View style={s.trendHead}>
                  <Text style={s.trendHeadFirst}>Test date</Text>
                  <Text style={s.trendHeadCell}>LT1</Text>
                  <Text style={s.trendHeadCell}>LT2</Text>
                  <Text style={s.trendHeadCell}>LT2 HR</Text>
                </View>
                {/* Oldest comparison test */}
                <View style={[s.trendRow, s.trendRowAlt]}>
                  <Text style={s.trendCellDate}>{prevDate2}</Text>
                  <Text style={s.trendCellVal}>{fmtIntensity(prevLt1_2, sport, inputMode)}</Text>
                  <Text style={s.trendCellVal}>{fmtIntensity(prevLt2_2, sport, inputMode)}</Text>
                  <Text style={s.trendCellVal}>{prevThresholds2?.heartRates?.['LTP2'] ? `${Math.round(prevThresholds2.heartRates['LTP2'])} bpm` : '—'}</Text>
                </View>
                {/* More recent comparison test */}
                <View style={s.trendRow}>
                  <Text style={s.trendCellDate}>{prevDate}</Text>
                  <Text style={s.trendCellVal}>{fmtIntensity(prevLt1, sport, inputMode)}</Text>
                  <Text style={s.trendCellVal}>{fmtIntensity(prevLt2, sport, inputMode)}</Text>
                  <Text style={s.trendCellVal}>{prevLt2Hr ? `${Math.round(prevLt2Hr)} bpm` : '—'}</Text>
                </View>
                {/* Current test (highlighted) */}
                <View style={[s.trendRow, { backgroundColor: '#EEF0FA' }]}>
                  <View style={{ flex: 1.6, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[s.trendCellDate, { color: C.primary, fontFamily: 'Helvetica-Bold' }]}>{testDate}</Text>
                    <Text style={s.trendBadge}>NOW</Text>
                  </View>
                  <Text style={[s.trendCellVal, { color: C.primary }]}>{fmtIntensity(lt1, sport, inputMode)}</Text>
                  <Text style={[s.trendCellVal, { color: C.primary }]}>{fmtIntensity(lt2, sport, inputMode)}</Text>
                  <Text style={[s.trendCellVal, { color: C.primary }]}>{lt2Hr ? `${Math.round(lt2Hr)} bpm` : '—'}</Text>
                </View>
              </View>
            )}
          </>}
        </View>

        <Footer athlete={athleteName} creatorEmail={creatorEmail} branding={coachBranding} />
      </Page>
    </Document>
  );
}

// ── Download helper ─────────────────────────────────────────────────────────────
export async function generatePdfBlob({ test, athlete, thresholds, zones, prevTest, prevThresholds, prevTest2, prevThresholds2, customNote, customAnalysis, creatorEmail, preTestSummary, coachBranding }) {
  const doc = (
    <LactateReportPdf
      test={test}
      athlete={athlete}
      thresholds={thresholds}
      zones={zones}
      prevTest={prevTest}
      prevThresholds={prevThresholds}
      prevTest2={prevTest2}
      prevThresholds2={prevThresholds2}
      customNote={customNote}
      customAnalysis={customAnalysis}
      creatorEmail={creatorEmail}
      preTestSummary={preTestSummary}
      coachBranding={coachBranding}
    />
  );
  return pdf(doc).toBlob();
}

export async function downloadLactateReportPdf({ test, athlete, thresholds, zones, prevTest, prevThresholds, prevTest2, prevThresholds2, customNote, customAnalysis, creatorEmail, preTestSummary, coachBranding }) {
  const blob = await generatePdfBlob({ test, athlete, thresholds, zones, prevTest, prevThresholds, prevTest2, prevThresholds2, customNote, customAnalysis, creatorEmail, preTestSummary, coachBranding });
  const date = test?.date ? new Date(test.date).toISOString().slice(0,10) : 'report';
  const fileName = `lachart-report-${date}.pdf`;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // iOS Capacitor: use native Web Share API with file — opens share sheet
  // (Save to Files, AirDrop, Mail, etc.) without needing popup windows.
  if (isIOS) {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'LaChart Report' });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return; // user dismissed — not an error
        console.warn('[downloadLactateReportPdf] share failed, falling back', e);
      }
    }
    // Fallback: data URL in same window (last resort)
    const reader = new FileReader();
    reader.onloadend = () => { window.location.href = reader.result; };
    reader.readAsDataURL(blob);
    return;
  }

  // Desktop / Android: standard <a download> trigger
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
