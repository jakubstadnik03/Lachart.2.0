/**
 * LactateReportPdf.jsx
 * Frontend PDF report using @react-pdf/renderer.
 * Replaces the server-side jsPDF generation with a modern, magazine-quality layout.
 */
import React from 'react';
import {
  Document, Page, View, Text, Svg, Path, Line, Rect, Circle,
  StyleSheet, pdf,
} from '@react-pdf/renderer';

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
    paddingHorizontal: 32, paddingTop: 24, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: C.lightGray },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary, marginRight: 6 },
  headerName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.dark, letterSpacing: 0.5 },
  headerSub:  { fontSize: 7.5, color: C.gray, letterSpacing: 1, marginTop: 1 },
  headerDate: { fontSize: 8, color: C.gray },

  // Footer
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 32, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: C.lightGray },
  footerText: { fontSize: 7.5, color: C.gray },

  // Body
  body: { paddingHorizontal: 32, paddingTop: 20 },

  // Cover
  coverBand: { backgroundColor: C.primary, paddingHorizontal: 32, paddingVertical: 36 },
  coverTitle: { fontSize: 26, fontFamily: 'Helvetica-Bold', color: C.white, marginBottom: 6 },
  coverSub:   { fontSize: 11, color: '#C7CBE8', letterSpacing: 0.5 },
  coverMeta:  { flexDirection: 'row', gap: 24, marginTop: 28 },
  coverPill:  { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6 },
  coverPillLabel: { fontSize: 7, color: 'rgba(255,255,255,0.7)', marginBottom: 2, letterSpacing: 0.8 },
  coverPillValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.white },

  // Athlete card
  athleteCard: { flexDirection: 'row', marginTop: 24, marginBottom: 0, gap: 12 },
  infoCard: { flex: 1, borderWidth: 1, borderColor: C.midGray, borderRadius: 8, padding: 14 },
  cardLabel: { fontSize: 7.5, color: C.gray, letterSpacing: 0.8, marginBottom: 6,
    textTransform: 'uppercase' },
  cardRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  cardKey:   { fontSize: 8.5, color: C.gray },
  cardVal:   { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 22 },
  sectionLine:   { flex: 1, height: 1, backgroundColor: C.lightGray, marginLeft: 8 },
  sectionTitle:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.primary,
    letterSpacing: 1, textTransform: 'uppercase' },

  // Results table
  table:      { borderWidth: 1, borderColor: C.midGray, borderRadius: 6, overflow: 'hidden' },
  tableHead:  { flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 7,
    paddingHorizontal: 10 },
  tableHeadT: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, flex: 1,
    textAlign: 'center' },
  tableRow:   { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10,
    borderTopWidth: 1, borderTopColor: C.lightGray },
  tableRowAlt:{ backgroundColor: '#F9FAFB' },
  tableCell:  { fontSize: 8.5, color: C.dark, flex: 1, textAlign: 'center' },
  tableCellB: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark, flex: 1, textAlign: 'center' },

  // Threshold table
  thrRow:   { flexDirection: 'row', paddingVertical: 5.5, paddingHorizontal: 10,
    borderTopWidth: 1, borderTopColor: C.lightGray },
  thrMethod:{ fontSize: 8.5, color: C.dark, flex: 2 },
  thrVal:   { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.primary, flex: 1.5, textAlign: 'right' },
  thrHr:    { fontSize: 8.5, color: C.gray, flex: 1.5, textAlign: 'right' },
  thrLa:    { fontSize: 8.5, color: C.red, flex: 1.5, textAlign: 'right' },

  // Zone row
  zoneRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
    paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.lightGray },
  zoneDot:  { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  zoneLabel:{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.dark, width: 40 },
  zoneName: { fontSize: 8, color: C.gray, flex: 1.5 },
  zoneVal:  { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark, flex: 2, textAlign: 'right' },
  zoneHr:   { fontSize: 8.5, color: C.gray, flex: 2, textAlign: 'right' },

  // Recommendations
  recCard:  { borderRadius: 8, padding: 14, marginBottom: 10,
    borderLeftWidth: 3, borderLeftColor: C.primary, backgroundColor: '#F5F6FC' },
  recTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.primary, marginBottom: 4 },
  recBody:  { fontSize: 8.5, color: C.dark, lineHeight: 1.5 },

  // Comparison delta
  deltaPositive: { color: C.green, fontFamily: 'Helvetica-Bold' },
  deltaNegative: { color: C.red,   fontFamily: 'Helvetica-Bold' },
  deltaLabel:    { fontSize: 7.5, color: C.gray, marginBottom: 2 },
  deltaBig:      { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  deltaCards:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  deltaCard:     { flex: 1, borderWidth: 1, borderColor: C.midGray, borderRadius: 8,
    padding: 12, alignItems: 'center' },
});

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('cs-CZ', { day:'2-digit', month:'2-digit', year:'numeric' }); } catch { return '—'; } };
const sportLabel = (s) => ({ bike:'Cycling', run:'Running', swim:'Swimming' }[s] || s || 'Sport');
const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

function fmtPace(secs) {
  if (!secs || !Number.isFinite(Number(secs))) return '—';
  const s = Number(secs);
  const m = Math.floor(s / 60);
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

// ── Lactate Curve SVG ──────────────────────────────────────────────────────────
function LattateCurveSvg({ results = [], sport, inputMode, thresholds }) {
  const W = 500, H = 160;
  const PAD = { top: 10, right: 20, bottom: 30, left: 40 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const pts = results
    .map(r => ({ x: Number(r.power), la: Number(r.lactate), hr: Number(r.heartRate) }))
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.la) && p.x > 0);

  if (pts.length < 2) return null;

  const xMin = Math.min(...pts.map(p => p.x));
  const xMax = Math.max(...pts.map(p => p.x));
  const laMax = Math.max(...pts.map(p => p.la), 6);
  const hrPts = pts.filter(p => Number.isFinite(p.hr) && p.hr > 50);
  const hasHr = hrPts.length >= 2;
  const hrMin = hasHr ? Math.min(...hrPts.map(p => p.hr)) - 10 : 0;
  const hrMax = hasHr ? Math.max(...hrPts.map(p => p.hr)) + 10 : 200;

  const sx = (x) => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * cw;
  const sla = (la) => PAD.top + ch - (la / laMax) * ch;
  const shr = (hr) => PAD.top + ch - ((hr - hrMin) / (hrMax - hrMin || 1)) * ch;

  const laPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${sla(p.la).toFixed(1)}`).join(' ');
  const hrPath = hasHr ? hrPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x).toFixed(1)} ${shr(p.hr).toFixed(1)}`).join(' ') : '';

  // LT2 vertical line
  const lt2 = thresholds?.['LTP2'];
  const lt1 = thresholds?.['LTP1'];

  // X axis ticks
  const xTicks = [xMin, ...pts.slice(1,-1).map(p=>p.x), xMax];

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* Grid lines */}
      {[0, 2, 4, 6].map(la => (
        <Line key={la}
          x1={PAD.left} y1={sla(la).toFixed(1)}
          x2={W - PAD.right} y2={sla(la).toFixed(1)}
          stroke={C.lightGray} strokeWidth={0.5} />
      ))}

      {/* LT1 line */}
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

      {/* LT2 line */}
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

      {/* Lactate curve */}
      <Path d={laPath} stroke={C.red} strokeWidth={2} fill="none" strokeLinejoin="round" />

      {/* Data points */}
      {pts.map((p, i) => (
        <Circle key={i} cx={sx(p.x).toFixed(1)} cy={sla(p.la).toFixed(1)} r={3}
          fill={C.white} stroke={C.red} strokeWidth={1.5} />
      ))}

      {/* X axis */}
      <Line x1={PAD.left} y1={PAD.top + ch} x2={W - PAD.right} y2={PAD.top + ch}
        stroke={C.midGray} strokeWidth={0.5} />
      {xTicks.map((x, i) => (
        <Text key={i} style={{ fontSize: 6.5, fill: C.gray }}
          x={sx(x).toFixed(1)} y={PAD.top + ch + 10} textAnchor="middle">
          {sport === 'bike' ? Math.round(x) : fmtPace(x)}
        </Text>
      ))}

      {/* Y axis label */}
      <Text style={{ fontSize: 6.5, fill: C.red }} x={2} y={PAD.top + ch / 2} textAnchor="middle">
        La
      </Text>
      {[0, 2, 4, 6].map(la => (
        <Text key={la} style={{ fontSize: 6, fill: C.gray }}
          x={PAD.left - 4} y={sla(la) + 2} textAnchor="end">{la}</Text>
      ))}

      {/* Legend */}
      <Rect x={W - PAD.right - 80} y={PAD.top} width={80} height={hasHr ? 28 : 14} rx={3}
        fill="white" stroke={C.lightGray} strokeWidth={0.5} />
      <Line x1={W - PAD.right - 74} y1={PAD.top + 7}
        x2={W - PAD.right - 62} y2={PAD.top + 7} stroke={C.red} strokeWidth={2} />
      <Text style={{ fontSize: 6.5, fill: C.dark }} x={W - PAD.right - 58} y={PAD.top + 9}>
        Lactate
      </Text>
      {hasHr && <>
        <Line x1={W - PAD.right - 74} y1={PAD.top + 19}
          x2={W - PAD.right - 62} y2={PAD.top + 19} stroke={C.secondary} strokeWidth={1.5} />
        <Text style={{ fontSize: 6.5, fill: C.dark }} x={W - PAD.right - 58} y={PAD.top + 21}>
          Heart Rate
        </Text>
      </>}
    </Svg>
  );
}

// ── Header / Footer ─────────────────────────────────────────────────────────────
const Header = ({ title, date }) => (
  <View style={s.header} fixed>
    <View style={s.headerBrand}>
      <View style={s.headerDot} />
      <View>
        <Text style={s.headerName}>LaChart</Text>
        <Text style={s.headerSub}>LACTATE ANALYSIS PLATFORM</Text>
      </View>
    </View>
    <Text style={s.headerDate}>{title} · {date}</Text>
  </View>
);

const Footer = ({ athlete }) => (
  <View style={s.footer} fixed>
    <Text style={s.footerText}>lachart.net · Advanced lactate testing &amp; analysis</Text>
    <Text style={s.footerText}
      render={({ pageNumber, totalPages }) => `${athlete || ''} · Page ${pageNumber} / ${totalPages}`} />
  </View>
);

// ── Section header ──────────────────────────────────────────────────────────────
const SectionHeader = ({ title }) => (
  <View style={s.sectionHeader}>
    <Text style={s.sectionTitle}>{title}</Text>
    <View style={s.sectionLine} />
  </View>
);

// ── Main Document ───────────────────────────────────────────────────────────────
export default function LactateReportPdf({ test, athlete, thresholds, zones, prevTest, prevThresholds }) {
  if (!test) return null;

  const sport     = test.sport || 'bike';
  const inputMode = test.inputMode || 'pace';
  const unitSys   = test.unitSystem || 'metric';
  const results   = Array.isArray(test.results) ? test.results : [];
  const athleteName = athlete ? `${athlete.name || ''} ${athlete.surname || ''}`.trim() : 'Athlete';
  const testDate  = fmtDate(test.date);
  const isBike    = sport === 'bike';

  // Key thresholds
  const lt1 = thresholds?.['LTP1'];
  const lt2 = thresholds?.['LTP2'];
  const obla = thresholds?.['OBLA 3.0'];
  const lt1Hr = thresholds?.heartRates?.['LTP1'];
  const lt2Hr = thresholds?.heartRates?.['LTP2'];

  // Previous test comparison
  const prevLt2 = prevThresholds?.['LTP2'];
  const prevLt1 = prevThresholds?.['LTP1'];
  const hasPrev = prevTest && prevLt2 != null;

  // Zones
  const zoneData = zones?.power || zones?.pace || null;
  const zoneHr   = zones?.heartRate || null;
  const hasZones = zoneData != null;

  // Threshold methods to show
  const thrMethods = ['LTP1','LTP2','OBLA 2.0','OBLA 2.5','OBLA 3.0','OBLA 3.5','Log-log','IAT','Bsln + 0.5','Bsln + 1.0'];
  const zoneNames  = ['Recovery','Aerobic','Tempo','Threshold','VO2max'];

  return (
    <Document title={`Lactate Report · ${athleteName} · ${testDate}`} author="LaChart">

      {/* ── PAGE 1: Cover + Curve ── */}
      <Page size="A4" style={s.page}>
        <Header title={`${sportLabel(sport)} · Lactate Report`} date={testDate} />

        {/* Cover band */}
        <View style={s.coverBand}>
          <Text style={s.coverTitle}>{test.title || 'Lactate Test Report'}</Text>
          <Text style={s.coverSub}>{sportLabel(sport)} · {testDate}</Text>
          <View style={s.coverMeta}>
            {[
              { label: 'ATHLETE',   value: athleteName },
              { label: 'SPORT',     value: sportLabel(sport) },
              { label: 'LT1',       value: fmtIntensity(lt1, sport, inputMode) },
              { label: 'LT2',       value: fmtIntensity(lt2, sport, inputMode) },
              { label: 'BASE La',   value: test.baseLactate ? `${Number(test.baseLactate).toFixed(2)} mmol/L` : '—' },
            ].map(item => (
              <View key={item.label} style={s.coverPill}>
                <Text style={s.coverPillLabel}>{item.label}</Text>
                <Text style={s.coverPillValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.body}>
          {/* Athlete + Test info */}
          <View style={s.athleteCard}>
            <View style={s.infoCard}>
              <Text style={s.cardLabel}>Athlete</Text>
              {[
                ['Name',   athleteName],
                ['Email',  athlete?.email || '—'],
                ['Sport',  sportLabel(athlete?.sport || sport)],
                ['Weight', athlete?.weight ? `${athlete.weight} kg` : '—'],
                ['Height', athlete?.height ? `${athlete.height} cm` : '—'],
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
          {results.length >= 2
            ? <LattateCurveSvg results={results} sport={sport} inputMode={inputMode} thresholds={thresholds} />
            : <Text style={{ fontSize: 8.5, color: C.gray }}>Not enough data points to render curve.</Text>
          }

          {/* Results table */}
          <SectionHeader title="Stage Results" />
          <View style={s.table}>
            <View style={s.tableHead}>
              {['Stage', isBike ? 'Power (W)' : 'Pace', 'HR (bpm)', 'Lactate (mmol/L)', 'RPE'].map(h => (
                <Text key={h} style={s.tableHeadT}>{h}</Text>
              ))}
            </View>
            {results.map((r, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
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

        <Footer athlete={athleteName} />
      </Page>

      {/* ── PAGE 2: Thresholds + Zones ── */}
      <Page size="A4" style={s.page}>
        <Header title={`${sportLabel(sport)} · Lactate Report`} date={testDate} />

        <View style={s.body}>
          {/* Key thresholds highlight */}
          <SectionHeader title="Key Thresholds" />
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'LT1 · Aerobic Threshold',    val: fmtIntensity(lt1, sport, inputMode), hr: lt1Hr, color: C.primary },
              { label: 'LT2 · Anaerobic Threshold',  val: fmtIntensity(lt2, sport, inputMode), hr: lt2Hr, color: C.red },
              { label: 'OBLA 3.0',                   val: fmtIntensity(obla, sport, inputMode), hr: thresholds?.heartRates?.['OBLA 3.0'], color: C.secondary },
            ].map(item => (
              <View key={item.label} style={{ flex: 1, borderRadius: 8, borderWidth: 1.5,
                borderColor: item.color, padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 7, color: item.color, letterSpacing: 0.8,
                  textTransform: 'uppercase', marginBottom: 6 }}>{item.label}</Text>
                <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: item.color,
                  marginBottom: 4 }}>{item.val}</Text>
                {item.hr && <Text style={{ fontSize: 8, color: C.gray }}>{Math.round(item.hr)} bpm</Text>}
              </View>
            ))}
          </View>

          {/* All thresholds table */}
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
                  <Text style={[s.thrMethod, (method === 'LTP1' || method === 'LTP2') ? { fontFamily: 'Helvetica-Bold' } : {}]}>
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

          {/* Previous test comparison */}
          {hasPrev && <>
            <SectionHeader title={`Comparison · Previous Test (${fmtDate(prevTest.date)})`} />
            <View style={s.deltaCards}>
              {[
                { label: 'LT1 change', cur: lt1, prev: prevLt1, better: isBike },
                { label: 'LT2 change', cur: lt2, prev: prevLt2, better: isBike },
                { label: 'LT2 HR',     cur: lt2Hr, prev: prevThresholds?.heartRates?.['LTP2'], better: false },
              ].map(item => {
                const diff = (Number(item.cur) - Number(item.prev));
                const sign = diff > 0 ? '+' : '';
                const st   = diff === 0 ? {} : (item.better ? (diff > 0 ? s.deltaPositive : s.deltaNegative) : (diff < 0 ? s.deltaPositive : s.deltaNegative));
                return (
                  <View key={item.label} style={s.deltaCard}>
                    <Text style={s.deltaLabel}>{item.label}</Text>
                    <Text style={[s.deltaBig, st]}>
                      {sign}{isBike ? Math.round(diff) : fmtPace(Math.abs(diff))} {isBike ? 'W' : ''}
                    </Text>
                    <Text style={{ fontSize: 7.5, color: C.gray }}>
                      {fmtIntensity(item.prev, sport, inputMode)} → {fmtIntensity(item.cur, sport, inputMode)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>}
        </View>

        <Footer athlete={athleteName} />
      </Page>
    </Document>
  );
}

// ── Download helper ─────────────────────────────────────────────────────────────
export async function downloadLactateReportPdf({ test, athlete, thresholds, zones, prevTest, prevThresholds }) {
  const doc = (
    <LactateReportPdf
      test={test}
      athlete={athlete}
      thresholds={thresholds}
      zones={zones}
      prevTest={prevTest}
      prevThresholds={prevThresholds}
    />
  );
  const blob = await pdf(doc).toBlob();
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = test?.date ? new Date(test.date).toISOString().slice(0,10) : 'report';
  link.href = url;
  link.setAttribute('download', `lachart-report-${date}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
