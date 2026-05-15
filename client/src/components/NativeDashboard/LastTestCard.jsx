import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { calculateZonesFromTest } from '../Testing-page/zoneCalculator';
// Reuse the exact threshold algorithm DataTable / LactateCurveCalculator use
// on desktop so the LT1/LT2 stat above matches the zone table below it (the
// zone table already routes through resolveLtAnchorsFromTest → calculateThresholds).
import { calculateThresholds as desktopCalculateThresholds } from '../Testing-page/DataTable';

// ─── zone metadata (shared with NativeTestingPage) ────────────────────────────
const ZONE_DEFS = [
  { key: 'z1', zoneKey: 'zone1', name: 'Recovery',  color: '#60A5FA' },
  { key: 'z2', zoneKey: 'zone2', name: 'Endurance', color: '#34D399' },
  { key: 'z3', zoneKey: 'zone3', name: 'Tempo',     color: '#FBBF24' },
  { key: 'z4', zoneKey: 'zone4', name: 'Threshold', color: '#F97316' },
  { key: 'z5', zoneKey: 'zone5', name: 'VO2max',    color: '#F43F5E' },
];

// ─── sport metadata ───────────────────────────────────────────────────────────

function normSport(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('bike') || v.includes('cycl') || v.includes('ride')) return 'bike';
  if (v.includes('run'))  return 'run';
  if (v.includes('swim')) return 'swim';
  return 'other';
}

function isPaceSport(sport) {
  return sport === 'run' || sport === 'swim';
}

function fmtPace(secPerKm) {
  if (!secPerKm || !Number.isFinite(secPerKm) || secPerKm <= 0) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

function fmtPower(w) {
  if (w == null || !Number.isFinite(w)) return '—';
  return `${Math.round(w)} W`;
}

function fmtVal(v, sport) {
  return isPaceSport(sport) ? fmtPace(v) : fmtPower(v);
}

function fmtMmol(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${Number(v).toFixed(1)} mmol`;
}

// ─── threshold extraction (mirrors ThresholdHistory.jsx logic) ────────────────
// 1. Use server `thresholdOverrides.LTP1 / LTP2` if present (manually set values)
// 2. Otherwise interpolate from results: LT1 ≈ baseLactate + 1.5 mmol, LT2 ≥ 4 mmol
function extractThresholds(test) {
  if (!test) return null;
  const sport = normSport(test.sport);
  const isPace = isPaceSport(sport);
  const ov = test.thresholdOverrides || {};

  // Manual overrides take precedence
  let ltp1Power   = ov.LTP1         != null ? Number(ov.LTP1)         : null;
  let ltp2Power   = ov.LTP2         != null ? Number(ov.LTP2)         : null;
  let ltp1Lactate = ov.LTP1_lactate != null ? Number(ov.LTP1_lactate) : null;
  let ltp2Lactate = ov.LTP2_lactate != null ? Number(ov.LTP2_lactate) : null;
  let ltp1Hr      = ov.LTP1_hr      != null ? Number(ov.LTP1_hr)      : null;
  let ltp2Hr      = ov.LTP2_hr      != null ? Number(ov.LTP2_hr)      : null;

  // Build interpolation if we still need values
  const pts = (Array.isArray(test.results) ? test.results : [])
    .map(r => ({
      x:  Number(String(r.power      ?? r.interval ?? '').replace(',', '.')),
      y:  Number(String(r.lactate    ?? '').replace(',', '.')),
      hr: Number(String(r.heartRate  ?? '').replace(',', '.')),
    }))
    .filter(p => Number.isFinite(p.x) && p.x > 0 && Number.isFinite(p.y) && p.y > 0);

  // Primary path: desktop calculateThresholds (D-max + IAT + sport-specific
  // guards + polynomial snap). Matches what the test page itself shows and
  // what calculateZonesFromTest uses below for the Z1–Z5 strip.
  try {
    const thr = desktopCalculateThresholds(test);
    if (thr) {
      const dLt1   = Number(thr.LTP1);
      const dLt2   = Number(thr.LTP2);
      const dLt1La = Number(thr.lactates?.LTP1);
      const dLt2La = Number(thr.lactates?.LTP2);
      const dLt1Hr = Number(thr.heartRates?.LTP1);
      const dLt2Hr = Number(thr.heartRates?.LTP2);
      if (ltp1Power   == null && Number.isFinite(dLt1)   && dLt1   > 0) ltp1Power   = dLt1;
      if (ltp2Power   == null && Number.isFinite(dLt2)   && dLt2   > 0) ltp2Power   = dLt2;
      if (ltp1Lactate == null && Number.isFinite(dLt1La) && dLt1La > 0) ltp1Lactate = dLt1La;
      if (ltp2Lactate == null && Number.isFinite(dLt2La) && dLt2La > 0) ltp2Lactate = dLt2La;
      if (ltp1Hr      == null && Number.isFinite(dLt1Hr) && dLt1Hr > 0) ltp1Hr      = Math.round(dLt1Hr);
      if (ltp2Hr      == null && Number.isFinite(dLt2Hr) && dLt2Hr > 0) ltp2Hr      = Math.round(dLt2Hr);
    }
  } catch {
    // Degenerate test — fall through to the old simple interpolation below
    // so the card still shows something.
  }

  // Fallback: simple linear interpolation at base + 1.5 / max(4.0, base + 3.0)
  // when the desktop helper returned nothing for this test.
  if ((ltp1Power == null || ltp2Power == null) && pts.length >= 3) {
    pts.sort((a, b) => isPace ? b.x - a.x : a.x - b.x);
    const base = Number(test.baseLactate) || pts[0]?.y || 1.0;
    const lt1Target = base + 1.5;
    const lt2Target = Math.max(4.0, base + 3.0);

    const interp = (target) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if ((a.y - target) * (b.y - target) <= 0) {
          const t = (target - a.y) / (b.y - a.y || 1);
          const x = a.x + t * (b.x - a.x);
          const hr = (Number.isFinite(a.hr) && Number.isFinite(b.hr))
            ? Math.round(a.hr + t * (b.hr - a.hr)) : null;
          return { value: Math.round(x * 10) / 10, hr, lactate: target };
        }
      }
      return null;
    };

    if (ltp1Power == null) {
      const r = interp(lt1Target);
      if (r) { ltp1Power = r.value; ltp1Hr = ltp1Hr ?? r.hr; ltp1Lactate = ltp1Lactate ?? r.lactate; }
    }
    if (ltp2Power == null) {
      const r = interp(lt2Target) || interp(4.0);
      if (r) { ltp2Power = r.value; ltp2Hr = ltp2Hr ?? r.hr; ltp2Lactate = ltp2Lactate ?? r.lactate; }
    }
  }

  return {
    sport, isPace,
    ltp1: { power: ltp1Power, lactate: ltp1Lactate, hr: ltp1Hr },
    ltp2: { power: ltp2Power, lactate: ltp2Lactate, hr: ltp2Hr },
    baseLactate: Number(test.baseLactate) || (pts[0]?.y ?? null),
    peakLactate: pts.length ? Math.max(...pts.map(p => p.y)) : null,
    points: pts,                      // for the curve
    stagesCount: pts.length,
  };
}

// ─── delta pill ───────────────────────────────────────────────────────────────

function DeltaPill({ value, sport }) {
  if (value == null || !Number.isFinite(value) || value === 0) return null;
  const isPace = isPaceSport(sport);
  // For pace sports, lower value is better → flip sign for display
  const isImprovement = isPace ? value < 0 : value > 0;
  const bg = isImprovement ? '#ECFDF5' : '#FEF2F2';
  const fg = isImprovement ? '#047857' : '#B84238';
  const sign = isImprovement ? '▲' : '▼';
  const display = isPace
    ? `${Math.abs(Math.round(value))}s`
    : `${value > 0 ? '+' : ''}${Math.round(value)}`;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      padding: '2px 7px', borderRadius: 9999,
      background: bg, color: fg,
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <span style={{ fontSize: 8 }}>{sign}</span>{display}
    </span>
  );
}

// ─── trend mini sparkline (SVG) ───────────────────────────────────────────────

function MiniSpark({ values, color, height = 36, width = 130, fillOpacity = 0.18 }) {
  const valid = values.filter(v => v != null && Number.isFinite(v));
  if (valid.length < 2) {
    return (
      <div style={{ height, color: '#D1D5DB', fontSize: 9.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Not enough data
      </div>
    );
  }
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const pad = 3;
  const pts = valid.map((v, i) => {
    const x = pad + (i / (valid.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const linePath = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const fillPath = `${linePath} L ${pts[pts.length - 1][0]},${height} L ${pts[0][0]},${height} Z`;
  const gradId = `mini-${color.replace('#','')}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} style={{ animation: 'ndFadeIn .55s ease both' }} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 600,
          strokeDashoffset: 600,
          animation: 'ndDrawLine 1s cubic-bezier(.22,1,.36,1) forwards',
        }}
      />
    </svg>
  );
}

// ─── lactate curve chart (SVG) — used in "Last lactate test" card ─────────────

function LactateCurve({ thresholds }) {
  if (!thresholds || !thresholds.points || thresholds.points.length < 2) {
    return <div style={{ height: 130, color: '#9CA3AF', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No curve data</div>;
  }
  const W = 320, H = 130, padX = 14, padY = 12;

  // For PACE sports: SLOWER (higher seconds/km) on the LEFT, FASTER on the RIGHT.
  // For POWER sports: lower watts on the LEFT, higher on the RIGHT.
  // We sort the source points so the SVG line connects smoothly left→right.
  const pts = [...thresholds.points].sort((a, b) =>
    thresholds.isPace ? b.x - a.x : a.x - b.x
  );
  const xMin = Math.min(...pts.map(p => p.x));
  const xMax = Math.max(...pts.map(p => p.x));
  const yMin = 0;
  const yMax = Math.max(...pts.map(p => p.y), 5) * 1.1;

  // For pace: invert the x mapping so bigger seconds (slower) → LEFT side
  const px = (x) => thresholds.isPace
    ? padX + ((xMax - x) / (xMax - xMin || 1)) * (W - padX * 2)
    : padX + ((x - xMin) / (xMax - xMin || 1)) * (W - padX * 2);
  const py = (y) => H - padY - ((y - yMin) / (yMax - yMin || 1)) * (H - padY * 2);

  // Smooth curve via cubic Bezier
  const xy = pts.map(p => [px(p.x), py(p.y)]);
  const linePath = xy.reduce((acc, [x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px0, py0] = xy[i - 1];
    const cx = (px0 + x) / 2;
    return `${acc} C${cx},${py0} ${cx},${y} ${x},${y}`;
  }, '');
  const fillPath = `${linePath} L ${xy[xy.length - 1][0]},${H - padY} L ${xy[0][0]},${H - padY} Z`;

  const lt1X = thresholds.ltp1?.power != null ? px(thresholds.ltp1.power) : null;
  const lt2X = thresholds.ltp2?.power != null ? px(thresholds.ltp2.power) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
      style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        <linearGradient id="curve-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5E6590" stopOpacity=".18" />
          <stop offset="1" stopColor="#5E6590" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* X baseline */}
      <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY}
        stroke="rgba(118,126,181,.18)" />

      {/* Threshold vertical guides */}
      {lt1X != null && (
        <line x1={lt1X} y1={padY} x2={lt1X} y2={H - padY}
          stroke="#4BA87D" strokeWidth="1.2" strokeDasharray="3 4"
          style={{ animation: 'ndFadeIn .4s .25s ease both' }} />
      )}
      {lt2X != null && (
        <line x1={lt2X} y1={padY} x2={lt2X} y2={H - padY}
          stroke="#E05347" strokeWidth="1.2" strokeDasharray="3 4"
          style={{ animation: 'ndFadeIn .4s .35s ease both' }} />
      )}

      {/* Curve fill + stroke */}
      <path d={fillPath} fill="url(#curve-fill)"
        style={{ animation: 'ndFadeIn .55s ease both' }} />
      <path
        d={linePath}
        fill="none"
        stroke="#5E6590"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 1200,
          strokeDashoffset: 1200,
          animation: 'ndDrawLine 1s cubic-bezier(.22,1,.36,1) forwards',
        }}
      />

      {/* Data points */}
      {xy.map(([x, y], i) => (
        <circle
          key={i}
          cx={x} cy={y} r="3"
          fill="#fff" stroke="#5E6590" strokeWidth="1.5"
          style={{ animation: `ndPopIn .35s ${300 + i * 40}ms cubic-bezier(.22,1.4,.36,1) both` }}
        />
      ))}
    </svg>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function LastTestCard({ tests = [] }) {
  const navigate = useNavigate();

  // Group tests by sport, sorted newest-first
  const testsBySport = useMemo(() => {
    const m = {};
    for (const t of tests) {
      if (!t) continue;                  // guard against undefined entries
      const sp = normSport(t.sport);
      if (!m[sp]) m[sp] = [];
      m[sp].push(t);
    }
    Object.keys(m).forEach(sp => {
      m[sp].sort((a, b) => new Date(b?.date || b?.testDate || 0) - new Date(a?.date || a?.testDate || 0));
    });
    return m;
  }, [tests]);

  const sportsAvailable = Object.keys(testsBySport).filter(sp => sp !== 'other');

  // Default: sport with most-recent test overall
  const defaultSport = useMemo(() => {
    let best = null, bestDate = -Infinity;
    for (const sp of sportsAvailable) {
      const d = new Date(testsBySport[sp][0]?.date || testsBySport[sp][0]?.testDate || 0).getTime();
      if (d > bestDate) { bestDate = d; best = sp; }
    }
    return best || 'bike';
  }, [sportsAvailable, testsBySport]);

  const [selectedSport, setSelectedSport] = useState(defaultSport);
  const activeSport = sportsAvailable.includes(selectedSport) ? selectedSport : defaultSport;

  // Parse all tests for the active sport (newest → oldest)
  const parsed = useMemo(
    () => {
      const sportTests = testsBySport[activeSport] || [];
      // Filter on extracted (not the raw spread) so a null extract doesn't slip through
      return sportTests
        .map(t => {
          const ex = extractThresholds(t);
          return ex ? { raw: t, ...ex } : null;
        })
        .filter(Boolean);
    },
    [testsBySport, activeSport]
  );

  const last = parsed[0] || null;
  const prev = parsed[1] || null;

  // Empty state
  if (!last) {
    return (
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={styles.sectionTitle}>Last Lab Test</span>
        </div>
        <div style={{ textAlign: 'center', padding: '18px 0', color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>
          No tests recorded yet
        </div>
      </div>
    );
  }

  // ── Trends (only sub-cards) ─────────────────────────────────────────────────
  const lt2Series = parsed.slice().reverse().map(p => p.ltp2.power);
  const lt1Series = parsed.slice().reverse().map(p => p.ltp1.power);

  const lt2Delta = (last.ltp2.power != null && prev?.ltp2.power != null)
    ? last.ltp2.power - prev.ltp2.power : null;
  const lt1Delta = (last.ltp1.power != null && prev?.ltp1.power != null)
    ? last.ltp1.power - prev.ltp1.power : null;

  // Trend % over last 90 days
  const trendStats = (() => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const within = parsed.filter(p => new Date(p.raw.date || p.raw.testDate || 0).getTime() >= cutoff);
    if (within.length < 2) return null;
    const newest = within[0]?.ltp2?.power;
    const oldest = within[within.length - 1]?.ltp2?.power;
    if (!newest || !oldest) return null;
    const pct = ((newest - oldest) / oldest) * 100;
    return { count: within.length, pct };
  })();

  const testId = last.raw._id || last.raw.id;
  const openFullCurve = () => testId && navigate(`/testing?testId=${encodeURIComponent(testId)}`);

  // ── Date / stages line for the bottom card ─────────────────────────────────
  const testDate = new Date(last.raw.date || last.raw.testDate || 0);
  const dateStr  = testDate.toLocaleDateString('en', { day: 'numeric', month: 'short' });
  const stagesCount = last.stagesCount;
  const xMin = last.points.length ? Math.min(...last.points.map(p => p.x)) : null;
  const xMax = last.points.length ? Math.max(...last.points.map(p => p.x)) : null;
  const rangeStr = (xMin != null && xMax != null)
    ? (last.isPace
        ? `${fmtPace(xMax)}→${fmtPace(xMin)}`
        : `${Math.round(xMin)}→${Math.round(xMax)} W`)
    : null;
  const isReviewed = !!(last.raw.thresholdOverrides && (last.raw.thresholdOverrides.LTP1 || last.raw.thresholdOverrides.LTP2));

  // Show sport toggle only if multiple sports have tests
  const showToggle = sportsAvailable.length > 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ─────────────  Card 1 · Threshold trend  ───────────── */}
      <div style={styles.card}>
        {/* Header: title + sport toggle */}
        <div style={styles.headerRow}>
          <div>
            <div style={styles.sectionTitle}>Threshold trend</div>
            <div style={styles.subtitle}>LT1 &amp; LT2 over time</div>
          </div>
          {showToggle && (
            <div style={styles.seg}>
              {sportsAvailable.map(sp => {
                const on = activeSport === sp;
                return (
                  <button
                    key={sp}
                    onClick={() => setSelectedSport(sp)}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
                    onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                    onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                    onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
                    onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                    style={{
                      ...styles.segBtn,
                      ...(on ? styles.segBtnOn : {}),
                      transition: 'background .25s ease, color .25s ease, box-shadow .25s ease, transform .12s ease',
                    }}
                  >
                    {sp.charAt(0).toUpperCase() + sp.slice(1)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Two threshold sub-cards */}
        <div
          key={`thr-${activeSport}`}
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 11 }}
        >
          {/* LT2 — Threshold (red) */}
          <div style={{
            ...styles.subCard,
            animation: 'ndPopIn .45s 60ms cubic-bezier(.22,1.4,.36,1) both',
          }}>
            <div style={styles.subCardLabel}>
              <span style={{ color: '#E05347' }}>LT2</span>
              <span style={{ color: '#9CA3AF' }}>·</span>
              <span style={{ color: '#9CA3AF' }}>THRESHOLD</span>
            </div>
            <div style={styles.subCardValueRow}>
              <span style={styles.subCardValue}>
                {fmtVal(last.ltp2.power, last.sport)}
              </span>
              <DeltaPill value={lt2Delta} sport={last.sport} />
            </div>
            <div style={{ marginTop: 6 }}>
              <MiniSpark values={lt2Series} color="#5E6590" />
            </div>
          </div>

          {/* LT1 — Aerobic (green) */}
          <div style={{
            ...styles.subCard,
            animation: 'ndPopIn .45s 130ms cubic-bezier(.22,1.4,.36,1) both',
          }}>
            <div style={styles.subCardLabel}>
              <span style={{ color: '#4BA87D' }}>LT1</span>
              <span style={{ color: '#9CA3AF' }}>·</span>
              <span style={{ color: '#9CA3AF' }}>AEROBIC</span>
            </div>
            <div style={styles.subCardValueRow}>
              <span style={styles.subCardValue}>
                {fmtVal(last.ltp1.power, last.sport)}
              </span>
              <DeltaPill value={lt1Delta} sport={last.sport} />
            </div>
            <div style={{ marginTop: 6 }}>
              <MiniSpark values={lt1Series} color="#3b82f6" />
            </div>
          </div>
        </div>

        {/* Footer line */}
        {trendStats && (
          <div style={styles.trendFooter}>
            Last {trendStats.count} test{trendStats.count !== 1 ? 's' : ''}
            {' · '}
            <span style={{ color: trendStats.pct >= 0 ? '#047857' : '#B84238', fontWeight: 700 }}>
              {trendStats.pct >= 0 ? '+' : ''}{trendStats.pct.toFixed(1)}%
            </span>
            {' LT2 over 90 days'}
          </div>
        )}
      </div>

      {/* ─────────────  Card 2 · Last lactate test  ───────────── */}
      <div style={styles.card}>
        {/* Header: title + Reviewed badge */}
        <div style={styles.headerRow}>
          <div>
            <div style={styles.sectionTitle}>Last lactate test</div>
            <div style={styles.subtitle}>
              {dateStr}
              {stagesCount ? ` · ${stagesCount} stages` : ''}
              {rangeStr ? ` · ${rangeStr}` : ''}
            </div>
          </div>
          {isReviewed && (
            <span style={{
              fontSize: 10.5, fontWeight: 700,
              padding: '4px 10px', borderRadius: 9999,
              background: '#ECFDF5', color: '#047857',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              animation: 'ndPopIn .5s .3s cubic-bezier(.22,1.4,.36,1) both',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Reviewed
            </span>
          )}
        </div>

        {/* Lactate curve chart */}
        <div style={{ marginTop: 10, marginBottom: 10 }}>
          <LactateCurve thresholds={last} />
        </div>

        {/* LT1 / LT2 — rich tiles with lactate (mmol) + HR (bpm) sub-info */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
          marginBottom: 6,
        }}>
          {[
            {
              lbl: 'LT1',
              val: fmtVal(last.ltp1.power, last.sport),
              col: '#4BA87D',
              lac: last.ltp1.lactate,
              hr:  last.ltp1.hr,
            },
            {
              lbl: 'LT2',
              val: fmtVal(last.ltp2.power, last.sport),
              col: '#E05347',
              lac: last.ltp2.lactate,
              hr:  last.ltp2.hr,
            },
          ].map(({ lbl, val, col, lac, hr }, idx) => (
            <div key={lbl} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
              padding: '8px 10px', borderRadius: 11,
              background: col + '0F',
              border: `1px solid ${col}26`,
              animation: `ndPopIn .45s ${idx * 70}ms cubic-bezier(.22,1.4,.36,1) both`,
            }}>
              <span style={{
                fontSize: 9, fontWeight: 800, color: col,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>{lbl}</span>
              <span style={{
                fontSize: 16, fontWeight: 800, color: '#0A0E1A',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
                letterSpacing: '-0.01em',
              }}>{val}</span>
              {(lac != null || hr != null) && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  marginTop: 2, fontSize: 10, fontWeight: 600, color: '#6B7280',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {lac != null && (
                    <span>
                      <span style={{ color: col, fontWeight: 700 }}>{Number(lac).toFixed(1)}</span>
                      <span style={{ color: '#9CA3AF' }}> mmol</span>
                    </span>
                  )}
                  {lac != null && hr != null && (
                    <span style={{ color: '#D1D5DB' }}>·</span>
                  )}
                  {hr != null && (
                    <span>
                      <span style={{ color: '#0A0E1A', fontWeight: 700 }}>{hr}</span>
                      <span style={{ color: '#9CA3AF' }}> bpm</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Base LA · Peak LA — small secondary chips */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
          marginBottom: 12,
        }}>
          {[
            { lbl: 'Base LA', val: fmtMmol(last.baseLactate) },
            { lbl: 'Peak LA', val: fmtMmol(last.peakLactate) },
          ].map(({ lbl, val }, idx) => (
            <div key={lbl} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
              padding: '6px 10px', borderRadius: 9,
              background: 'rgba(255,255,255,.5)',
              border: '1px solid rgba(118,126,181,.12)',
              animation: `ndPopIn .4s ${(idx + 2) * 70}ms cubic-bezier(.22,1.4,.36,1) both`,
            }}>
              <span style={{
                fontSize: 9, fontWeight: 800, color: '#9CA3AF',
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>{lbl}</span>
              <span style={{
                fontSize: 12, fontWeight: 800, color: '#0A0E1A',
                fontVariantNumeric: 'tabular-nums',
              }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Training zones — derived from this test's thresholds */}
        {(() => {
          const zones = calculateZonesFromTest(last.raw);
          if (!zones) return null;
          const root = last.isPace ? zones.pace : zones.power;
          const hr = zones.heartRate;
          if (!root && !hr) return null;
          const primaryHeader = last.isPace ? 'Pace' : 'Power';
          // Compact 5-row zones strip — sized to fit on screen alongside the
          // curve + LT tiles + Open button (no inner scroll needed).
          return (
            <div style={{
              marginTop: 6, marginBottom: 8,
              padding: '6px 8px',
              borderRadius: 10,
              background: 'rgba(255,255,255,.5)',
              border: '1px solid rgba(118,126,181,.12)',
            }}>
              {/* Header row: title + Edit pill */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 3,
              }}>
                <span style={{
                  fontSize: 9.5, fontWeight: 800, color: '#0A0E1A',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  Zones · {primaryHeader} · HR
                </span>
                <button
                  onClick={() => testId && navigate(`/testing?testId=${encodeURIComponent(testId)}&full=1#zones`)}
                  onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
                  onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                  onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                  onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
                  onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    padding: '2px 7px', borderRadius: 9999,
                    background: 'rgba(124,58,237,.12)', color: '#7C3AED',
                    border: 'none', fontFamily: 'inherit',
                    fontSize: 9, fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'background .2s ease, transform .12s ease',
                    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </button>
              </div>
              {/* 5 zone rows — single line, no header row, ~16px tall each */}
              {ZONE_DEFS.map((z, i) => {
                const primary = root && root[z.zoneKey]
                  ? (last.isPace
                    ? `${root[z.zoneKey].min}–${root[z.zoneKey].max}`
                    : `${root[z.zoneKey].min}–${root[z.zoneKey].max} W`)
                  : '—';
                const hrCell = hr && hr[z.zoneKey]
                  ? `${hr[z.zoneKey].min}–${hr[z.zoneKey].max}`
                  : '—';
                return (
                  <div key={z.key} style={{
                    display: 'grid',
                    gridTemplateColumns: '38px 1fr 64px',
                    gap: 4, alignItems: 'center',
                    padding: '2px 0',
                    borderTop: i === 0 ? '1px solid rgba(118,126,181,.1)' : 'none',
                    borderBottom: i < ZONE_DEFS.length - 1
                      ? '1px solid rgba(118,126,181,.07)'
                      : 'none',
                  }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: 9.5, fontWeight: 800, color: z.color,
                    }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: z.color, flexShrink: 0,
                      }} />
                      Z{i + 1}
                    </span>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, color: '#0A0E1A',
                      fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                    }}>{primary}</span>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, color: '#B84238',
                      fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                    }}>{hrCell}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Open full test button */}
        <button
          onClick={openFullCurve}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.985)'; }}
          onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
          onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
          onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.985)'; }}
          onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
          style={styles.openBtn}
        >
          Open full test
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = {
  card: {
    background: 'rgba(255,255,255,.65)',
    backdropFilter: 'blur(22px) saturate(170%)',
    WebkitBackdropFilter: 'blur(22px) saturate(170%)',
    border: '1px solid rgba(255,255,255,.7)',
    boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
    borderRadius: 18,
    padding: '14px 14px',
  },
  headerRow: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
  },
  sectionTitle: {
    fontSize: 15, fontWeight: 800, color: '#0A0E1A',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    fontSize: 11, fontWeight: 600, color: '#6B7280',
    marginTop: 1,
  },
  seg: {
    display: 'inline-flex', padding: 2, borderRadius: 10,
    background: 'rgba(118,126,181,.12)',
  },
  segBtn: {
    border: 'none', background: 'transparent', fontFamily: 'inherit',
    fontSize: 11, fontWeight: 700, color: '#6B7280',
    padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  },
  segBtnOn: {
    background: '#5E6590', color: '#fff',
    boxShadow: '0 2px 6px -2px rgba(94,101,144,.5)',
  },
  subCard: {
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: '10px 11px', borderRadius: 13,
    background: 'rgba(255,255,255,.6)',
    border: '1px solid rgba(118,126,181,.14)',
  },
  subCardLabel: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
  },
  subCardValueRow: {
    display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4,
  },
  subCardValue: {
    fontSize: 22, fontWeight: 800, color: '#0A0E1A',
    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
  },
  trendFooter: {
    fontSize: 11, color: '#6B7280', fontWeight: 600,
    marginTop: 11,
    paddingTop: 10,
    borderTop: '1px solid rgba(118,126,181,.12)',
  },
  openBtn: {
    width: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '11px 16px', borderRadius: 12,
    background: 'rgba(255,255,255,.55)',
    border: '1.5px solid #767EB5',
    color: '#5E6590',
    fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
    transition: 'transform .12s ease, background .15s ease',
  },
};
