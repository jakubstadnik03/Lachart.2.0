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
import { getEffectiveLactateInputMode, normalizeLactateSport } from '../../utils/lactateTestInputMode';

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
  headerLogo:  { height: 24, maxWidth: 90, objectFit: 'contain', marginRight: 6 },
  headerName:  { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.primary, letterSpacing: 0.3 },
  headerSub:   { fontSize: 7, color: C.gray, letterSpacing: 1, marginTop: 1 },
  headerDate:  { fontSize: 8, color: C.gray },

  // Footer
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 32, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.lightGray },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerLogo:  { height: 14, maxWidth: 52, objectFit: 'contain' },
  footerText:  { fontSize: 7.5, color: C.gray },
  footerName:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.primary },

  // Body
  body: { paddingHorizontal: 32, paddingTop: 8 },

  // Cover (compact, single-row layout: logo+brand left, title+date right)
  coverBand: { backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 16 },
  coverTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  coverBrandWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coverLogo: { height: 36, maxWidth: 130, objectFit: 'contain' },
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
  // tableHeadT (four/five equal, centred cells) only lines up with the stage
  // results table, where every body cell is flex:1 too. The threshold and zone
  // tables use weighted, mixed-alignment columns, so their headers need to
  // mirror those weights — otherwise "Name" floats over the wrong column.
  thrHeadMethod: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, flex: 2 },
  thrHeadVal:    { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, flex: 1.5, textAlign: 'right' },
  zoneHeadSpacer:{ width: 16 },
  zoneHeadZone:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, flex: 2 },
  zoneHeadVal:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, flex: 2, textAlign: 'right' },
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
  zoneLabelWrap: { flexDirection: 'row', alignItems: 'baseline', flex: 2 },
  zoneLabel:{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.dark, width: 20 },
  zoneName: { fontSize: 8, color: C.gray },
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

/** Darken a hex color by `amount` (0–1). Returns original on parse error. */
function darkenHex(hex, amount = 0.15) {
  try {
    const h = hex.replace('#', '');
    const r = Math.max(0, Math.round(parseInt(h.slice(0,2),16) * (1-amount)));
    const g = Math.max(0, Math.round(parseInt(h.slice(2,4),16) * (1-amount)));
    const b = Math.max(0, Math.round(parseInt(h.slice(4,6),16) * (1-amount)));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  } catch { return hex; }
}
const sportLabel = (s) => ({ bike:'Cycling', run:'Running', swim:'Swimming' }[s] || s || 'Sport');
const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

/**
 * The report uses @react-pdf's built-in Helvetica, which is written out in
 * WinAnsi. Any code point outside cp1252 gets truncated to its low byte, so
 * "VO₂max" printed as "VO‚max" and "LT1→IAT" as "LT1’IAT". Nothing is broken in
 * the data — the glyphs simply don't exist in the font.
 *
 * ARROW / DASH below are the safe stand-ins used throughout the document, and
 * `pdfSafe` scrubs the same characters out of free text a coach may have pasted
 * into a note or an analysis override.
 */
const ARROW = '->';
const UNSAFE_CHARS = [
  [/[→⇒➡]/g, '->'],
  [/[←⇐]/g, '<-'],
  [/₂/g, '2'],   // subscript two, as in VO₂max
  [/₁/g, '1'],
  [/₃/g, '3'],
  [/≤/g, '<='],
  [/≥/g, '>='],
  [/[•●]/g, '·'],
];
// Everything WinAnsi can actually draw: printable ASCII, the Latin-1 supplement
// and the handful of typographic characters PDFKit remaps into the C1 range.
const WIN_ANSI_OK = /[ -~ -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/;
function pdfSafe(text) {
  if (text == null) return text;
  let out = String(text);
  for (const [re, sub] of UNSAFE_CHARS) out = out.replace(re, sub);
  return out.replace(/./gu, (ch) => {
    if (WIN_ANSI_OK.test(ch)) return ch;
    // Czech / Polish letters (č, ř, ł …) aren't in WinAnsi either. Strip the
    // accent rather than the whole letter so a name stays readable.
    const folded = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return WIN_ANSI_OK.test(folded) ? folded : '';
  });
}

function fmtPace(secs) {
  if (!secs || !Number.isFinite(Number(secs))) return '—';
  const s  = Number(secs);
  const m  = Math.floor(s / 60);
  const ss = Math.round(s % 60);
  return `${m}:${String(ss).padStart(2,'0')}`;
}

// ── Units ──────────────────────────────────────────────────────────────────────
/**
 * Loads for run/swim are stored as PACE SECONDS (sec/km, sec/100m) regardless of
 * what `inputMode` says — `inputMode` is a *display* preference (a coach who sets
 * paceDisplay=kmh in Settings gets inputMode:'speed' on a pace-stored test).
 * Conflating the two is what printed "301.0 km/h" for a 5:01/km stage and left
 * the axis running fast→slow.
 *
 * `makeUnits` resolves the two independently and returns every conversion and
 * formatter the report needs, so a value is converted exactly once, at the point
 * it is displayed.
 */
function makeUnits(test) {
  const sport       = normalizeLactateSport(test?.sport);
  const unitSystem  = test?.unitSystem || 'metric';
  const isBike      = sport === 'bike';
  const isSwim      = sport === 'swim';
  const isPaceSport = !isBike;

  // How the numbers in test.results / thresholds are actually stored.
  const storageMode = isPaceSport ? getEffectiveLactateInputMode(test) : 'power';
  // How the reader wants them shown. Speed-stored tests can only be shown as speed.
  const displayMode = !isPaceSport
    ? 'power'
    : (storageMode === 'speed' || String(test?.inputMode || '').toLowerCase() === 'speed' ? 'speed' : 'pace');

  const imperial  = unitSystem === 'imperial';
  const paceUnit  = isSwim ? (imperial ? '/100yd' : '/100m') : (imperial ? '/mile' : '/km');
  const speedUnit = imperial ? 'mph' : 'km/h';
  // Distance units covered per hour: 3600 s/h for a per-km (or per-mile) pace,
  // 360 for a per-100 m pace (10 x 100 m = 1 km).
  const SEC_PER_HOUR = isSwim ? 360 : 3600;

  /** Stored load → pace seconds (sec/km, sec/mile or sec/100m). */
  const toPaceSeconds = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    return storageMode === 'speed' ? SEC_PER_HOUR / n : n;
  };
  /** Stored load → speed in the display unit. */
  const toSpeed = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    return storageMode === 'speed' ? n : SEC_PER_HOUR / n;
  };

  /**
   * Stored load → the number the X axis is plotted in. Bike keeps watts, speed
   * display keeps km/h, pace display keeps seconds. In every case a *larger*
   * display value means harder except pace seconds, hence `reverseX`.
   */
  const toDisplayX = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return NaN;
    if (!isPaceSport) return n;
    return displayMode === 'speed' ? toSpeed(n) : toPaceSeconds(n);
  };

  /** Full label for a stored load, e.g. "5:01 /km", "12.0 km/h", "245 W". */
  const fmtIntensity = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    if (!isPaceSport) return `${Math.round(n)} W`;
    if (displayMode === 'speed') {
      const sp = toSpeed(n);
      return Number.isFinite(sp) ? `${sp.toFixed(1)} ${speedUnit}` : '—';
    }
    const sec = toPaceSeconds(n);
    return Number.isFinite(sec) ? `${fmtPace(sec)} ${paceUnit}` : '—';
  };

  /** Short, unit-less axis tick for a *display-space* value. */
  const fmtTick = (displayX) => {
    const n = Number(displayX);
    if (!Number.isFinite(n)) return '';
    if (!isPaceSport) return String(Math.round(n));
    return displayMode === 'speed' ? n.toFixed(1) : fmtPace(n);
  };

  return {
    sport, isBike, isSwim, isPaceSport, unitSystem,
    storageMode, displayMode,
    paceUnit, speedUnit,
    // Pace seconds run backwards (bigger = slower), so the axis has to be flipped
    // to keep "slower on the left, faster on the right".
    reverseX: isPaceSport && displayMode === 'pace',
    axisLabel: isBike ? 'Power (W)' : (displayMode === 'speed' ? `Speed (${speedUnit})` : `Pace (min${paceUnit})`),
    columnLabel: isBike ? 'Power (W)' : (displayMode === 'speed' ? `Speed (${speedUnit})` : `Pace (min${paceUnit})`),
    toPaceSeconds, toSpeed, toDisplayX, fmtIntensity, fmtTick,
  };
}

// ── Shared SVG axis helpers ────────────────────────────────────────────────────
/** Raw results → points in *display* X space, sorted low→high display value. */
function makePts(results, U) {
  return (Array.isArray(results) ? results : [])
    .map(r => ({ x: U.toDisplayX(r.power), la: Number(r.lactate), hr: Number(r.heartRate) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.la) && p.x > 0)
    .sort((a, b) => a.x - b.x);
}

/**
 * Build sx() — maps a display-space X value to a pixel position.
 * When `reverse` is set (pace display) the axis runs slow→fast, left→right.
 */
function makeSx(xMin, xMax, padLeft, cw, reverse) {
  return (x) => {
    const ratio = (xMax - xMin) < 0.001 ? 0 : (x - xMin) / (xMax - xMin);
    return reverse
      ? padLeft + (1 - ratio) * cw   // reversed: slow (big seconds) = left
      : padLeft + ratio * cw;         // normal:   low value          = left
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
 *  `thresholds` are raw stored values; they are converted into display space
 *  with U.toDisplayX so the bands line up with the plotted points.
 *  Returns an ordered list of { from, to, fill } in numerical x order.
 *
 *  When the axis is reversed (pace display) high seconds = slow pace = LEFT.
 *  Palette[0]=Recovery(green) must appear on the LEFT, which is the band with
 *  the highest numerical x values (last band in ascending sort). We therefore
 *  flip the palette index so band N-1 (leftmost visually) gets palette[0] and
 *  band 0 (rightmost visually) gets palette[N-1]. */
function buildZoneBands(thresholds = {}, xMin, xMax, U) {
  // The five-zone scheme matches what the interactive coach chart uses:
  // Z1 recovery (below LTP1), Z2 aerobic (LTP1->IAT), Z3 tempo (IAT->LTP2),
  // Z4 threshold (LTP2->OBLA 3.0), Z5 VO2max (above OBLA 3.0).
  const dx   = (v) => { const n = numOrNull(v); return n == null ? null : numOrNull(U.toDisplayX(n)); };
  const lt1  = dx(thresholds.LTP1);
  const iat  = dx(thresholds.IAT);
  const lt2  = dx(thresholds.LTP2);
  const ob30 = dx(thresholds['OBLA 3.0']);
  // Soft pastel fills — readable when printed, don't fight the data lines.
  // palette[0]=Recovery(green) … palette[4]=VO2max(purple).
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
    // On a reversed axis band 0 (numerically smallest x = fastest pace) sits on
    // the RIGHT, so it should get the VO2max colour. Flipping the index gives
    // band (numBands-1) (leftmost = easiest) palette[0] = Recovery green.
    const pi = U.reverseX ? (numBands - 1 - i) : i;
    bands.push({
      from: boundaries[i],
      to:   boundaries[i + 1],
      fill: palette[Math.min(pi, palette.length - 1)],
    });
  }
  return bands;
}
function numOrNull(v) { return Number.isFinite(Number(v)) ? Number(v) : null; }

/** Lactate gridlines every 2 mmol/L, always reaching the top of the plotted data. */
function laAxisTicks(laMax) {
  const step = laMax > 12 ? 4 : 2;
  const ticks = [];
  for (let v = 0; v <= laMax + 1e-9; v += step) ticks.push(v);
  return ticks;
}

/**
 * Drop X ticks that would be printed on top of each other. A comparison chart
 * overlays two tests, so the combined stage list can easily produce labels
 * closer together than they are wide. The first and last tick always survive.
 */
function thinTicks(values, sx, minGap = 18) {
  const sorted = [...new Set(values)].sort((a, b) => sx(a) - sx(b));
  if (sorted.length < 2) return sorted;
  const kept = [sorted[0]];
  for (let i = 1; i < sorted.length - 1; i++) {
    if (sx(sorted[i]) - sx(kept[kept.length - 1]) >= minGap) kept.push(sorted[i]);
  }
  const last = sorted[sorted.length - 1];
  // Keep the fast end of the axis even if it crowds the tick before it.
  while (kept.length > 1 && sx(last) - sx(kept[kept.length - 1]) < minGap) kept.pop();
  kept.push(last);
  return kept;
}

/** "Nice" tick values for the heart-rate axis — multiples of 10 inside the domain. */
function hrAxisTicks(minHr, maxHr) {
  const span = maxHr - minHr;
  const step = span > 80 ? 20 : 10;
  const first = Math.ceil(minHr / step) * step;
  const ticks = [];
  for (let v = first; v <= maxHr; v += step) ticks.push(v);
  return ticks;
}

// ── Single-test Lactate Curve SVG ──────────────────────────────────────────────
function LattateCurveSvg({ results = [], U, thresholds, primary = C.primary }) {
  const W = 500, H = 220;
  // Room on the right for the heart-rate scale; without it the HR curve had no
  // readable units at all and could only be judged by shape.
  const hrPtsAll = makePts(results, U).filter(p => Number.isFinite(p.hr) && p.hr > 50);
  const hasHr    = hrPtsAll.length >= 2;
  const PAD = { top: 12, right: hasHr ? 40 : 24, bottom: 38, left: 42 };
  const cw  = W - PAD.left - PAD.right;
  const ch  = H - PAD.top  - PAD.bottom;

  const pts = makePts(results, U);
  if (pts.length < 2) return null;

  const xMin  = Math.min(...pts.map(p => p.x));
  const xMax  = Math.max(...pts.map(p => p.x));
  const laMax = Math.max(...pts.map(p => p.la), 6);

  const hrPts = hrPtsAll;
  // Snap the HR domain to round tens so the printed axis reads 130/140/150…
  const hrMin = hasHr ? Math.floor((Math.min(...hrPts.map(p => p.hr)) - 8) / 10) * 10 : 0;
  const hrMax = hasHr ? Math.ceil((Math.max(...hrPts.map(p => p.hr)) + 8) / 10) * 10 : 200;

  // Add a small margin (~5 % of the data range) on each side so the first and
  // last measurement points are not flush against the axis edges — mirrors
  // the default padding Chart.js applies in the interactive chart.
  const xRange   = xMax - xMin || 1;
  const xPad     = xRange * 0.05;
  const domainMin = xMin - xPad;
  const domainMax = xMax + xPad;

  const sx  = makeSx(domainMin, domainMax, PAD.left, cw, U.reverseX);
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

  // Thresholds are stored values — plot them in display space like everything else.
  const lt1 = numOrNull(U.toDisplayX(thresholds?.['LTP1']));
  const lt2 = numOrNull(U.toDisplayX(thresholds?.['LTP2']));

  // Colored zone bands behind the curve. Same five-zone palette as the
  // in-app chart so the printed report matches what the athlete sees.
  // Use the expanded domain so bands fill all the way to the chart edges
  // (including the 5 % margin), and clip any threshold outside the domain.
  const zoneBands = buildZoneBands(thresholds || {}, domainMin, domainMax, U);

  const xTicks = thinTicks([xMin, ...pts.map(p => p.x), xMax], sx);
  const laGridLines = laAxisTicks(laMax);
  const hrTicks = hasHr ? hrAxisTicks(hrMin, hrMax) : [];

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
      {lt1 != null && lt1 >= domainMin && lt1 <= domainMax && (
        <>
          <Line x1={sx(lt1).toFixed(1)} y1={PAD.top}
            x2={sx(lt1).toFixed(1)} y2={PAD.top + ch}
            stroke={primary} strokeWidth={1} strokeDasharray="3,3" />
          <Rect x={sx(lt1) - 14} y={PAD.top + 2} width={28} height={11} rx={3} fill={primary} />
          <Text style={{ fontSize: 6, fill: C.white }}
            x={sx(lt1).toFixed(1)} y={PAD.top + 10} textAnchor="middle">LT1</Text>
        </>
      )}

      {/* LT2 dashed */}
      {lt2 != null && lt2 >= domainMin && lt2 <= domainMax && (
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
      {hasHr && <Path d={hrPath} stroke={C.secondary} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeDasharray="4,2" />}
      {hasHr && hrPts.map((p, i) => (
        <Circle key={`hr${i}`}
          cx={sx(p.x).toFixed(1)} cy={shr(p.hr).toFixed(1)}
          r={2} fill={C.white} stroke={C.secondary} strokeWidth={1.2} />
      ))}

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
          {U.fmtTick(x)}
        </Text>
      ))}

      {/* Axis caption + direction hint. Intensity always rises to the right,
          including on the reversed pace axis. */}
      <Text style={{ fontSize: 6.5, fill: C.gray }}
        x={PAD.left + cw / 2} y={PAD.top + ch + 24} textAnchor="middle">{U.axisLabel}</Text>
      {U.isPaceSport && (
        <>
          <Text style={{ fontSize: 6, fill: C.gray }}
            x={PAD.left} y={PAD.top + ch + 24} textAnchor="start">{'<- slower'}</Text>
          <Text style={{ fontSize: 6, fill: C.gray }}
            x={W - PAD.right} y={PAD.top + ch + 24} textAnchor="end">{'faster ->'}</Text>
        </>
      )}

      {/* Lactate axis (left) */}
      <Text style={{ fontSize: 6.5, fill: C.red }} x={6} y={PAD.top + ch / 2 + 2} textAnchor="middle">
        La
      </Text>
      {laGridLines.map(la => (
        <Text key={la} style={{ fontSize: 6, fill: C.gray }}
          x={PAD.left - 4} y={sla(la) + 2} textAnchor="end">{la}</Text>
      ))}

      {/* Heart-rate axis (right) — the HR curve is on its own bpm scale, so
          without these ticks it could not be read off the lactate axis. */}
      {hasHr && (
        <>
          <Line x1={W - PAD.right} y1={PAD.top} x2={W - PAD.right} y2={PAD.top + ch}
            stroke={C.secondary} strokeWidth={0.5} />
          {hrTicks.map(hr => (
            <React.Fragment key={hr}>
              <Line x1={W - PAD.right} y1={shr(hr).toFixed(1)}
                x2={W - PAD.right + 3} y2={shr(hr).toFixed(1)}
                stroke={C.secondary} strokeWidth={0.5} />
              <Text style={{ fontSize: 6, fill: C.secondary }}
                x={W - PAD.right + 5} y={shr(hr) + 2} textAnchor="start">{hr}</Text>
            </React.Fragment>
          ))}
          <Text style={{ fontSize: 6.5, fill: C.secondary }}
            x={W - PAD.right + 5} y={PAD.top - 4} textAnchor="start">bpm</Text>
        </>
      )}

    </Svg>
  );
}

// ── Comparison Curve SVG — both tests overlaid ────────────────────────────────
function ComparisonCurveSvg({ currentResults = [], prevResults = [], U, currentThresholds, prevThresholds, currentDate, prevDate, primary = C.primary }) {
  const W = 500, H = 200;
  // Extra bottom room: the threshold badges now sit under the plot instead of
  // at the top, where the legend box used to paint over them.
  const PAD = { top: 34, right: 24, bottom: 56, left: 42 };
  const cw  = W - PAD.left - PAD.right;
  const ch  = H - PAD.top  - PAD.bottom;

  const curPts  = makePts(currentResults, U);
  const prevPts = makePts(prevResults, U);
  if (curPts.length < 2 && prevPts.length < 2) return null;

  // Combined X range across both tests
  const allX  = [...curPts.map(p => p.x), ...prevPts.map(p => p.x)];
  const xMin  = Math.min(...allX);
  const xMax  = Math.max(...allX);

  // Combined La range
  const allLa = [...curPts.map(p => p.la), ...prevPts.map(p => p.la)];
  const laMax  = Math.max(...allLa, 6);

  const sx  = makeSx(xMin, xMax, PAD.left, cw, U.reverseX);
  const sla = (la) => PAD.top + ch - (la / laMax) * ch;

  const pathOf = (pts) =>
    pts.map((p, i) => `${i===0?'M':'L'} ${sx(p.x).toFixed(1)} ${sla(p.la).toFixed(1)}`).join(' ');

  const curPath  = curPts.length  >= 2 ? pathOf(curPts)  : '';
  const prevPath = prevPts.length >= 2 ? pathOf(prevPts) : '';

  const curLT2  = numOrNull(U.toDisplayX(currentThresholds?.['LTP2']));
  const prevLT2 = numOrNull(U.toDisplayX(prevThresholds?.['LTP2']));
  const inDomain = (v) => v != null && v >= xMin && v <= xMax;

  // X-axis ticks (deduplicated, sorted)
  const xTicks = thinTicks(allX, sx);
  const laGrid = laAxisTicks(laMax);

  // Legend sits above the plot area in its own strip, so it can never cover the
  // curves or the threshold markers.
  const legendY = 12;

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Grid */}
      {laGrid.map(la => (
        <Line key={la}
          x1={PAD.left} y1={sla(la).toFixed(1)}
          x2={W - PAD.right} y2={sla(la).toFixed(1)}
          stroke={C.lightGray} strokeWidth={0.5} />
      ))}

      {/* Threshold markers. Labelled below the axis so the badge text is always
          legible; the previous test's marker is offset onto a second row when
          the two thresholds are close enough to collide. */}
      {inDomain(prevLT2) && (
        <>
          <Line x1={sx(prevLT2).toFixed(1)} y1={PAD.top}
            x2={sx(prevLT2).toFixed(1)} y2={PAD.top + ch}
            stroke={C.gray} strokeWidth={1} strokeDasharray="3,3" />
          <Rect x={sx(prevLT2) - 22} y={PAD.top + ch + 26} width={44} height={11} rx={3} fill={C.gray} />
          <Text style={{ fontSize: 6, fill: C.white }}
            x={sx(prevLT2).toFixed(1)} y={PAD.top + ch + 34} textAnchor="middle">LT2 prev</Text>
        </>
      )}
      {inDomain(curLT2) && (
        <>
          <Line x1={sx(curLT2).toFixed(1)} y1={PAD.top}
            x2={sx(curLT2).toFixed(1)} y2={PAD.top + ch}
            stroke={C.red} strokeWidth={1} strokeDasharray="3,3" />
          <Rect x={sx(curLT2) - 22} y={PAD.top + ch + 13} width={44} height={11} rx={3} fill={C.red} />
          <Text style={{ fontSize: 6, fill: C.white }}
            x={sx(curLT2).toFixed(1)} y={PAD.top + ch + 21} textAnchor="middle">LT2 now</Text>
        </>
      )}

      {/* Previous test curve — dashed purple */}
      {prevPath && (
        <>
          <Path d={prevPath} stroke={primary} strokeWidth={1.5} fill="none"
            strokeLinejoin="round" strokeDasharray="5,3" />
          {prevPts.map((p, i) => (
            <Circle key={i}
              cx={sx(p.x).toFixed(1)} cy={sla(p.la).toFixed(1)}
              r={2.5} fill={C.white} stroke={primary} strokeWidth={1.2} />
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
          x={sx(x).toFixed(1)} y={PAD.top + ch + 10} textAnchor="middle">
          {U.fmtTick(x)}
        </Text>
      ))}

      {/* Axis caption + direction hint */}
      <Text style={{ fontSize: 6, fill: C.gray }}
        x={PAD.left + cw / 2} y={H - 3} textAnchor="middle">{U.axisLabel}</Text>
      {U.isPaceSport && (
        <>
          <Text style={{ fontSize: 5.5, fill: C.gray }}
            x={PAD.left} y={H - 3} textAnchor="start">{'<- slower'}</Text>
          <Text style={{ fontSize: 5.5, fill: C.gray }}
            x={W - PAD.right} y={H - 3} textAnchor="end">{'faster ->'}</Text>
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

      {/* Legend — own strip above the plot, every swatch labelled */}
      {curPath && (
        <>
          <Line x1={PAD.left} y1={legendY} x2={PAD.left + 12} y2={legendY}
            stroke={C.red} strokeWidth={2} />
          <Text style={{ fontSize: 6.5, fill: C.dark }} x={PAD.left + 16} y={legendY + 2}>
            {currentDate ? `Current test (${currentDate})` : 'Current test'}
          </Text>
        </>
      )}
      {prevPath && (
        <>
          <Line x1={PAD.left} y1={legendY + 11} x2={PAD.left + 12} y2={legendY + 11}
            stroke={primary} strokeWidth={1.5} strokeDasharray="4,2" />
          <Text style={{ fontSize: 6.5, fill: C.dark }} x={PAD.left + 16} y={legendY + 13}>
            {prevDate ? `Previous test (${prevDate})` : 'Previous test'}
          </Text>
        </>
      )}
      {(inDomain(curLT2) || inDomain(prevLT2)) && (
        <>
          <Line x1={PAD.left + 180} y1={legendY} x2={PAD.left + 192} y2={legendY}
            stroke={C.red} strokeWidth={1} strokeDasharray="3,3" />
          <Text style={{ fontSize: 6.5, fill: C.dark }} x={PAD.left + 196} y={legendY + 2}>
            LT2 this test
          </Text>
          <Line x1={PAD.left + 180} y1={legendY + 11} x2={PAD.left + 192} y2={legendY + 11}
            stroke={C.gray} strokeWidth={1} strokeDasharray="3,3" />
          <Text style={{ fontSize: 6.5, fill: C.dark }} x={PAD.left + 196} y={legendY + 13}>
            LT2 previous test
          </Text>
        </>
      )}
    </Svg>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────
const Header = ({ title, date, branding }) => {
  const pc       = branding?.primaryColor || C.primary;
  const name     = branding?.title    || 'LaChart';
  const tagline  = branding?.subtitle || (branding?.title ? '' : 'LACTATE ANALYSIS PLATFORM');
  return (
    <View style={s.header} fixed>
      <View style={s.headerBrand}>
        <Image src={branding?.logoUrl || LOGO_URL} style={s.headerLogo} />
        <View>
          <Text style={[s.headerName, { color: pc }]}>{pdfSafe(name)}</Text>
          {tagline ? <Text style={s.headerSub}>{pdfSafe(tagline.toUpperCase())}</Text> : null}
        </View>
      </View>
      <Text style={s.headerDate}>{title} · {date}</Text>
    </View>
  );
};

// ── Footer ─────────────────────────────────────────────────────────────────────
const Footer = ({ athlete, creatorEmail, branding }) => {
  const pc       = branding?.primaryColor || C.primary;
  const name     = branding?.title || 'LaChart';
  const hasCustom = !!(branding?.title);

  // Build contact detail fragments: prefer branding contact, fall back to LaChart defaults
  const web      = branding?.web      || (!hasCustom ? 'lachart.net'            : null);
  const email    = branding?.email    || (!hasCustom ? creatorEmail             : null);
  const phone    = branding?.phone    || null;
  const trademark= branding?.trademark|| null;

  // Assemble up to 3 short pieces separated by · so the footer doesn't overflow
  const contactParts = [trademark, web, email, phone].filter(Boolean).slice(0, 3);

  return (
    <View style={s.footer} fixed>
      <View style={s.footerBrand}>
        <Image src={branding?.logoUrl || LOGO_URL} style={s.footerLogo} />
        <Text style={[s.footerName, { color: pc }]}>{pdfSafe(name)}</Text>
        {contactParts.map((part, i) => (
          <Text key={i} style={s.footerText}> · {pdfSafe(part)}</Text>
        ))}
      </View>
      <Text style={s.footerText}
        render={({ pageNumber, totalPages }) => `${athlete || ''} · Page ${pageNumber} / ${totalPages}`} />
    </View>
  );
};

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
const SectionHeader = ({ title, color }) => (
  <View style={s.sectionHeader}>
    <Text style={[s.sectionTitle, color ? { color } : {}]}>{title}</Text>
    <View style={s.sectionLine} />
  </View>
);

// ── Main Document ───────────────────────────────────────────────────────────────
export default function LactateReportPdf({ test, athlete, thresholds, zones, prevTest, prevThresholds, prevTest2, prevThresholds2, customNote, customAnalysis, creatorEmail, preTestSummary, coachBranding }) {
  if (!test) return null;

  // Brand colour — use coach's custom primary if set, fall back to LaChart default
  const brandPrimary     = coachBranding?.primaryColor || C.primary;
  const brandPrimaryDark = darkenHex(brandPrimary);

  // Single source of truth for units: how the loads are stored vs how they are
  // shown. Every intensity in the report is formatted through U.fmtIntensity so
  // pace seconds can never leak out labelled as km/h.
  const U           = makeUnits(test);
  const sport       = U.sport;
  const unitSys     = test.unitSystem || 'metric';
  const results     = Array.isArray(test.results) ? test.results : [];
  const athleteName = pdfSafe(athlete ? `${athlete.name || ''} ${athlete.surname || ''}`.trim() : 'Athlete');
  const testDate    = fmtDate(test.date);
  const isBike      = U.isBike;
  const fmtInt      = U.fmtIntensity;

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

  /**
   * Change in a threshold between two tests, in the unit the reader expects.
   * Pace differences are computed on seconds (never on a stored km/h value) and
   * "improved" means harder: more watts, or fewer seconds per km.
   */
  const ltDelta = (cur, prev) => {
    if (!Number.isFinite(Number(cur)) || !Number.isFinite(Number(prev))) return null;
    if (isBike) {
      const d = Math.round(Number(cur) - Number(prev));
      return { improved: d > 0, same: d === 0, magnitude: `${Math.abs(d)} W`, signed: `${d > 0 ? '+' : d < 0 ? '-' : ''}${Math.abs(d)} W` };
    }
    const cs = U.toPaceSeconds(cur);
    const ps = U.toPaceSeconds(prev);
    if (!Number.isFinite(cs) || !Number.isFinite(ps)) return null;
    const d = Math.round(cs - ps);   // negative = faster = better
    return {
      improved: d < 0,
      same: d === 0,
      magnitude: `${fmtPace(Math.abs(d))} ${U.paceUnit}`,
      signed: `${d > 0 ? '+' : d < 0 ? '-' : ''}${fmtPace(Math.abs(d))} ${U.paceUnit}`,
    };
  };

  // Build automatic analysis paragraph (used unless caller provides a
  // hand-written customAnalysis override). When `customAnalysis` is set
  // it fully replaces the generated text — coaches often want to add
  // sport-specific or athlete-specific commentary that the generator
  // can't infer from numbers alone.
  const analysisText = (typeof customAnalysis === 'string' && customAnalysis.trim().length > 0)
    ? customAnalysis.trim()
    : (() => {
    const lt2Str   = lt2   ? fmtInt(lt2) : null;
    const lt1Str   = lt1   ? fmtInt(lt1) : null;
    const lt2HrStr = lt2Hr ? `${Math.round(lt2Hr)} bpm` : null;
    const lt1HrStr = lt1Hr ? `${Math.round(lt1Hr)} bpm` : null;

    let text = `Lactate curve recorded during this ${sportLabel(sport).toLowerCase()} test on ${testDate}. `;

    if (lt1Str) {
      text += `Aerobic threshold (LT1): ${lt1Str}${lt1HrStr ? ` · ${lt1HrStr}` : ''}. Below this point lactate remains stable and aerobic metabolism dominates. `;
    }
    if (lt2Str) {
      text += `Anaerobic threshold (LT2): ${lt2Str}${lt2HrStr ? ` · ${lt2HrStr}` : ''}. Above this intensity lactate accumulates faster than it can be cleared — the upper limit of sustainable race efforts. `;
    }
    const d = hasPrev ? ltDelta(lt2, prevLt2) : null;
    if (d) {
      text += d.same
        ? `vs. previous test (${prevDate}): LT2 remained stable. `
        : d.improved
          ? `vs. previous test (${prevDate}): LT2 improved by ${d.magnitude} — positive training adaptation. `
          : `vs. previous test (${prevDate}): LT2 shifted by ${d.magnitude} — monitor training load and recovery. `;
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
        <View style={[s.coverBand, { backgroundColor: brandPrimary }]}>
          <View style={s.coverTopRow}>
            <View style={s.coverBrandWrap}>
              <Image src={coachBranding?.logoUrl || LOGO_URL} style={s.coverLogo} />
              <View>
                <Text style={s.coverBrandName}>{pdfSafe(coachBranding?.title || 'LaChart')}</Text>
                <Text style={s.coverBrandSub}>
                  {coachBranding?.subtitle
                    ? pdfSafe(coachBranding.subtitle.toUpperCase())
                    : (coachBranding?.title ? '' : 'LACTATE ANALYSIS PLATFORM')}
                </Text>
              </View>
            </View>
            <View style={s.coverTitleWrap}>
              <Text style={s.coverTitle}>{pdfSafe(test.title || 'Lactate Test Report')}</Text>
              <Text style={s.coverSub}>{sportLabel(sport)} · {testDate}</Text>
            </View>
          </View>

          <View style={s.coverMeta}>
            {[
              { label: 'ATHLETE', value: athleteName },
              { label: 'SPORT',   value: sportLabel(sport) },
              { label: 'LT1',     value: fmtInt(lt1) },
              { label: 'LT2',     value: fmtInt(lt2) },
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
                ['Email',  pdfSafe(athlete?.email) || '—'],
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
                ['Title',        pdfSafe(test.title) || '—'],
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

          {/* Protocol & conditions card (2026-05) ─────────────────────────
              Surfaces the optional "Protocol & pre/post values" section the
              athlete or coach filled in on TestingForm. We render two
              side-by-side columns only when at least one field has a value
              — otherwise the card is suppressed entirely to avoid pages
              full of em-dashes.

              Pre/post values: resting HR, pre-load HR, max HR, max lactate,
              recovery HR @3min, recovery lactate @3min.
              Protocol: stage duration, stage distance, rest between, plus
              environmental conditions (specifics + weather).

              Helper `fmt(n, unit)` keeps every entry consistent: trims, drops
              empties, prepends the unit. Null/blank values cause the row to
              be skipped via .filter(Boolean). */}
          {(() => {
            const rawFmt = (val, unit) => {
              if (val == null) return null;
              const s = String(val).trim();
              if (!s) return null;
              return unit ? `${pdfSafe(s)} ${unit}` : pdfSafe(s);
            };
            // Stage duration is stored as seconds — render as MM:SS so it
            // matches what the user typed in TestingForm.
            const fmtStageDur = (sec) => {
              const n = Number(sec);
              if (!Number.isFinite(n) || n <= 0) return null;
              const m = Math.floor(n / 60);
              const ss = Math.round(n % 60);
              return `${m}:${String(ss).padStart(2, '0')} (${n}s)`;
            };

            const pre = [
              ['Resting HR',           rawFmt(test.restingHR, 'bpm')],
              ['Pre-load HR',          rawFmt(test.preLoadHR, 'bpm')],
              ['Max HR',               rawFmt(test.maxHR, 'bpm')],
              ['Max lactate',          rawFmt(test.maxLactate, 'mmol/L')],
              ['Recovery HR (+3min)',  rawFmt(test.recoveryHR3min, 'bpm')],
              ['Recovery La (+3min)',  rawFmt(test.recoveryLactate3min, 'mmol/L')],
            ].filter(([, v]) => v != null);

            const proto = [
              ['Stage duration',  fmtStageDur(test.stageDurationSec)],
              ['Stage distance',  rawFmt(test.stageDistance, 'm')],
              ['Rest between',    fmtStageDur(test.restBetweenStagesSec)],
              ['Conditions',      rawFmt(test.specifics?.specific)],
              ['Weather',         rawFmt(test.specifics?.weather)],
            ].filter(([, v]) => v != null);

            // Render nothing if BOTH columns are empty — the section just
            // would be visual noise (a header with two empty cards).
            if (pre.length === 0 && proto.length === 0) return null;

            const renderColumn = (title, rows) => (
              <View style={s.infoCard}>
                <Text style={s.cardLabel}>{title}</Text>
                {rows.length > 0 ? rows.map(([k, v]) => (
                  <View key={k} style={s.cardRow}>
                    <Text style={s.cardKey}>{k}</Text>
                    <Text style={s.cardVal}>{v}</Text>
                  </View>
                )) : (
                  // Helvetica-Bold has no italic face in @react-pdf — use the
                  // regular Helvetica family so the oblique resolves.
                  <Text style={[s.cardVal, { fontFamily: 'Helvetica', color: '#9ca3af', fontStyle: 'italic' }]}>—</Text>
                )}
              </View>
            );

            return (
              <View style={[s.athleteCard, { marginTop: 8 }]}>
                {renderColumn('Pre / Post Values', pre)}
                {renderColumn('Protocol & Conditions', proto)}
              </View>
            );
          })()}

          {/* Lactate curve */}
          <SectionHeader title="Lactate Curve" color={brandPrimary} />

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
              <View style={{ width: 10, height: 1, backgroundColor: brandPrimary, marginRight: 2 }} />
              <View style={{ width: 3, height: 1, backgroundColor: brandPrimary, marginRight: 2 }} />
              <View style={{ width: 5, height: 1, backgroundColor: brandPrimary }} />
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
              { fill: '#dbeafe', label: `Aerobic (LT1${ARROW}IAT)` },
              { fill: '#fef3c7', label: `Tempo (IAT${ARROW}LT2)` },
              { fill: '#fee2e2', label: `Threshold (LT2${ARROW}3.0)` },
              { fill: '#ede9fe', label: 'VO2max (>3.0)' },
            ].map((z) => (
              <View key={z.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 10, height: 8, backgroundColor: z.fill, borderRadius: 1 }} />
                <Text style={{ fontSize: 6.5, color: C.gray }}>{z.label}</Text>
              </View>
            ))}
          </View>

          <View wrap={false}>
            {results.length >= 2
              ? <LattateCurveSvg results={results} U={U} thresholds={thresholds} primary={brandPrimary} />
              : <Text style={{ fontSize: 8.5, color: C.gray }}>Not enough data points to render curve.</Text>
            }
          </View>

          {/* Analysis paragraph */}
          <View wrap={false} style={{ marginTop: 10, padding: 12, backgroundColor: C.lightGray, borderRadius: 6 }}>
            <Text style={{ fontSize: 7.5, color: C.gray, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 5, fontFamily: 'Helvetica-Bold' }}>
              Analysis
            </Text>
            <Text style={{ fontSize: 8.5, color: C.dark, lineHeight: 1.6 }}>
              {pdfSafe(analysisText)}
            </Text>
            {customNote ? (
              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.midGray }}>
                <Text style={{ fontSize: 7.5, color: C.gray, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 4, fontFamily: 'Helvetica-Bold' }}>
                  Coach / Athlete Notes
                </Text>
                <Text style={{ fontSize: 8.5, color: C.dark, lineHeight: 1.6 }}>{pdfSafe(customNote)}</Text>
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
            <SectionHeader title="Stage Results" color={brandPrimary} />
            <View style={s.table}>
              <View style={[s.tableHead, { backgroundColor: brandPrimary }]}>
                {['Stage', U.columnLabel, 'HR (bpm)', 'Lactate (mmol/L)', 'RPE'].map(h => (
                  <Text key={h} style={s.tableHeadT}>{h}</Text>
                ))}
              </View>
              {results.map((r, i) => (
                <View key={i} wrap={false} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={s.tableCellB}>{r.interval ?? i + 1}</Text>
                  <Text style={s.tableCell}>{fmtInt(r.power)}</Text>
                  <Text style={s.tableCell}>{r.heartRate || '—'}</Text>
                  <Text style={s.tableCell}>
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
          <SectionHeader title="Key Thresholds" color={brandPrimary} />
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'LT1 · Aerobic Threshold',  val: fmtInt(lt1), hr: lt1Hr, la: thresholds?.lactates?.['LTP1'],     color: brandPrimary },
              { label: 'LT2 · Anaerobic Threshold', val: fmtInt(lt2), hr: lt2Hr, la: thresholds?.lactates?.['LTP2'],     color: C.red       },
              { label: 'OBLA 3.0',                  val: fmtInt(obla), hr: thresholds?.heartRates?.['OBLA 3.0'], la: thresholds?.lactates?.['OBLA 3.0'] ?? 3.0, color: C.secondary },
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
          <SectionHeader title="All Threshold Methods" color={brandPrimary} />
          <View style={s.table}>
            <View style={[s.tableHead, { backgroundColor: brandPrimary }]}>
              <Text style={s.thrHeadMethod}>Method</Text>
              <Text style={s.thrHeadVal}>{U.columnLabel}</Text>
              <Text style={s.thrHeadVal}>HR (bpm)</Text>
              <Text style={s.thrHeadVal}>La (mmol/L)</Text>
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
                  <Text style={[s.thrVal, { color: brandPrimary }]}>{fmtInt(val)}</Text>
                  <Text style={s.thrHr}>{hr ? `${Math.round(hr)} bpm` : '—'}</Text>
                  <Text style={s.thrLa}>{la ? `${Number(la).toFixed(2)}` : '—'}</Text>
                </View>
              );
            })}
          </View>

          {/* Training zones */}
          {hasZones && <>
            <SectionHeader title="Training Zones" color={brandPrimary} />
            <View style={s.table}>
              <View style={[s.tableHead, { backgroundColor: brandPrimary }]}>
                {/* Spacer stands in for the colour dot on each body row. */}
                <View style={s.zoneHeadSpacer} />
                <Text style={s.zoneHeadZone}>Zone</Text>
                <Text style={s.zoneHeadVal}>{U.columnLabel}</Text>
                <Text style={s.zoneHeadVal}>Heart Rate</Text>
              </View>
              {[1,2,3,4,5].map((z, i) => {
                const zKey = `zone${z}`;
                const zd   = zoneData[zKey];
                const zh   = zoneHr?.[zKey];
                const color = C.zone[i];
                if (!zd) return null;
                // Zone bounds come out of the zone calculator as "M:SS" pace
                // strings (or watts for bike) — parse back to seconds so both
                // the pace and speed renderings come from one number.
                const zoneSeconds = (v) => {
                  if (v == null || v === '') return null;
                  const str = String(v);
                  if (str.includes(':')) {
                    const [m, sec] = str.split(':').map(Number);
                    return Number.isFinite(m) && Number.isFinite(sec) ? m * 60 + sec : null;
                  }
                  const n = Number(str);
                  return Number.isFinite(n) && n > 0 ? n : null;
                };
                const secMin = isBike ? null : zoneSeconds(zd.min);
                const secMax = isBike ? null : zoneSeconds(zd.max);
                const speedOf = (sec) => (sec > 0 ? (U.isSwim ? 360 : 3600) / sec : null);
                const paceRange = (secMin && secMax)
                  ? `${fmtPace(secMin)} – ${fmtPace(secMax)} ${U.paceUnit}`
                  : `${zd.min || '—'} – ${zd.max || '—'}`;
                const speedRange = (secMin && secMax)
                  ? `${speedOf(secMin).toFixed(1)} – ${speedOf(secMax).toFixed(1)} ${U.speedUnit}`
                  : null;
                // Lead with whatever the reader picked; keep the other as a
                // subline so the table serves both kinds of athlete.
                const valStr = isBike
                  ? `${Math.round(zd.min ?? 0)} – ${Math.round(zd.max ?? 0)} W`
                  : (U.displayMode === 'speed' ? (speedRange || paceRange) : paceRange);
                const speedStr = isBike
                  ? null
                  : (U.displayMode === 'speed' ? (speedRange ? paceRange : null) : speedRange);
                const hrStr = zh
                  ? `${Math.round(zh.min ?? 0)} – ${Math.round(zh.max ?? 0)} bpm`
                  : '—';
                return (
                  <View key={z} style={[s.zoneRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                    <View style={[s.zoneDot, { backgroundColor: color }]} />
                    {/* Number and name are one column — "Z1" and "Recovery" in
                        separate columns just said the same thing twice. */}
                    <View style={s.zoneLabelWrap}>
                      <Text style={s.zoneLabel}>Z{z}</Text>
                      <Text style={s.zoneName}>{zoneNames[i]}</Text>
                    </View>
                    <View style={[s.zoneVal, { alignItems: 'flex-end' }]}>
                      <Text>{valStr}</Text>
                      {speedStr && <Text style={{ fontSize: 6.5, color: C.gray }}>{speedStr}</Text>}
                    </View>
                    <Text style={s.zoneHr}>{hrStr}</Text>
                  </View>
                );
              })}
            </View>
          </>}

          {/* ── Pre-test training context ── */}
          {preTestSummary && (
            <>
              <SectionHeader title="Pre-test Training · 8 weeks" color={brandPrimary} />
              <PreTestSection preTestSummary={preTestSummary} />
            </>
          )}

          {/* ── Comparison with previous test ──
              Header + chart share a wrap={false} block so the heading can never
              be left stranded at the foot of a page with the chart overleaf. */}
          {hasPrev && <>
            <View wrap={false}>
              <SectionHeader title={hasPrev2 ? `Progress Trend · ${prevDate2} ${ARROW} ${prevDate} ${ARROW} ${testDate}` : `Comparison vs Previous Test · ${prevDate}`} color={brandPrimary} />

              {/* Overlaid dual-curve chart (primary comparison only) */}
              <ComparisonCurveSvg
                currentResults={results}
                prevResults={prevTest.results}
                U={U}
                currentThresholds={thresholds}
                prevThresholds={prevThresholds}
                currentDate={testDate}
                prevDate={prevDate}
                primary={brandPrimary}
              />
            </View>

            {/* Delta cards (current vs primary comparison) */}
            <View style={[s.deltaCards, { marginTop: 12 }]}>
              {[
                { label: 'LT1 change', cur: lt1,   prev: prevLt1,   kind: 'intensity' },
                { label: 'LT2 change', cur: lt2,   prev: prevLt2,   kind: 'intensity' },
                // Heart rate is bpm — it must never be run through the intensity
                // formatter, which is what printed "170.0 km/h -> 167.0 km/h".
                { label: 'LT2 HR',     cur: lt2Hr, prev: prevLt2Hr, kind: 'hr' },
              ].map(item => {
                const isHr = item.kind === 'hr';
                const finite = Number.isFinite(Number(item.cur)) && Number.isFinite(Number(item.prev));
                let valStr = '—';
                let st = {};
                if (finite && isHr) {
                  const d = Math.round(Number(item.cur) - Number(item.prev));
                  valStr = `${d > 0 ? '+' : ''}${d} bpm`;
                  // A lower HR at the same threshold is the favourable direction.
                  st = d === 0 ? {} : d < 0 ? s.deltaPositive : s.deltaNegative;
                } else if (finite) {
                  const d = ltDelta(item.cur, item.prev);
                  if (d) {
                    valStr = d.signed;
                    st = d.same ? {} : d.improved ? s.deltaPositive : s.deltaNegative;
                  }
                }
                const fmtSide = isHr
                  ? (v) => (Number.isFinite(Number(v)) ? `${Math.round(Number(v))} bpm` : '—')
                  : fmtInt;
                return (
                  <View key={item.label} style={s.deltaCard}>
                    <Text style={s.deltaLabel}>{item.label}</Text>
                    <Text style={[s.deltaBig, st]}>{valStr}</Text>
                    <Text style={{ fontSize: 7.5, color: C.gray }}>
                      {fmtSide(item.prev)} {ARROW} {fmtSide(item.cur)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* ── 3-test trend table (shown when a second comparison test is also selected) ── */}
            {hasPrev2 && (
              <View style={s.trendTable}>
                {/* Header */}
                <View style={[s.trendHead, { backgroundColor: brandPrimaryDark }]}>
                  <Text style={s.trendHeadFirst}>Test date</Text>
                  <Text style={s.trendHeadCell}>LT1</Text>
                  <Text style={s.trendHeadCell}>LT2</Text>
                  <Text style={s.trendHeadCell}>LT2 HR</Text>
                </View>
                {/* Oldest comparison test */}
                <View style={[s.trendRow, s.trendRowAlt]}>
                  <Text style={s.trendCellDate}>{prevDate2}</Text>
                  <Text style={s.trendCellVal}>{fmtInt(prevLt1_2)}</Text>
                  <Text style={s.trendCellVal}>{fmtInt(prevLt2_2)}</Text>
                  <Text style={s.trendCellVal}>{prevThresholds2?.heartRates?.['LTP2'] ? `${Math.round(prevThresholds2.heartRates['LTP2'])} bpm` : '—'}</Text>
                </View>
                {/* More recent comparison test */}
                <View style={s.trendRow}>
                  <Text style={s.trendCellDate}>{prevDate}</Text>
                  <Text style={s.trendCellVal}>{fmtInt(prevLt1)}</Text>
                  <Text style={s.trendCellVal}>{fmtInt(prevLt2)}</Text>
                  <Text style={s.trendCellVal}>{prevLt2Hr ? `${Math.round(prevLt2Hr)} bpm` : '—'}</Text>
                </View>
                {/* Current test (highlighted) */}
                <View style={[s.trendRow, { backgroundColor: '#EEF0FA' }]}>
                  <View style={{ flex: 1.6, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[s.trendCellDate, { color: brandPrimary, fontFamily: 'Helvetica-Bold' }]}>{testDate}</Text>
                    <Text style={[s.trendBadge, { backgroundColor: brandPrimary }]}>NOW</Text>
                  </View>
                  <Text style={[s.trendCellVal, { color: brandPrimary }]}>{fmtInt(lt1)}</Text>
                  <Text style={[s.trendCellVal, { color: brandPrimary }]}>{fmtInt(lt2)}</Text>
                  <Text style={[s.trendCellVal, { color: brandPrimary }]}>{lt2Hr ? `${Math.round(lt2Hr)} bpm` : '—'}</Text>
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

// ── Logo pre-fetch helper ───────────────────────────────────────────────────────
// @react-pdf/renderer fetches Image src internally and CORS blocks most CDN / 3rd-party
// hosts. Converting to a base64 data URL first sidesteps the restriction entirely.
async function fetchLogoDataUrl(url) {
  if (!url || url.startsWith('data:')) return url; // already base64 or empty
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result || null);
      reader.onerror  = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null; // CORS failure → fall back to LaChart logo in the component
  }
}

// ── Download helper ─────────────────────────────────────────────────────────────
export async function generatePdfBlob({ test, athlete, thresholds, zones, prevTest, prevThresholds, prevTest2, prevThresholds2, customNote, customAnalysis, creatorEmail, preTestSummary, coachBranding }) {
  // Pre-fetch the coach logo so the PDF renderer never has to make a cross-origin request
  let resolvedBranding = coachBranding;
  if (coachBranding?.logoUrl) {
    const dataUrl = await fetchLogoDataUrl(coachBranding.logoUrl);
    resolvedBranding = { ...coachBranding, logoUrl: dataUrl || null };
  }

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
      coachBranding={resolvedBranding}
    />
  );
  return pdf(doc).toBlob();
}

export async function downloadLactateReportPdf({ test, athlete, thresholds, zones, prevTest, prevThresholds, prevTest2, prevThresholds2, customNote, customAnalysis, creatorEmail, preTestSummary, coachBranding }) {
  try {
    const { trackPdfReportExported } = await import('../../utils/analytics');
    trackPdfReportExported({ branded: Boolean(coachBranding?.logoUrl || coachBranding?.title) });
  } catch { /* analytics only */ }
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
