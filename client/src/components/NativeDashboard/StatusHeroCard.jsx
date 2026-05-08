import React, { useState } from 'react';

// TSB → status label + color
function getTsbStatus(tsb) {
  if (tsb > 25)  return { label: 'Detraining',   color: '#599FD0' };
  if (tsb > 5)   return { label: 'Fresh',         color: '#4BA87D' };
  if (tsb > -10) return { label: 'Optimal',       color: '#5E6590' };
  if (tsb > -30) return { label: 'Productive',    color: '#F59E0B' };
  return          { label: 'Overreaching',         color: '#E05347' };
}

function DeltaPill({ value }) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  const isUp   = n > 0;
  const isDown = n < 0;
  const bg    = isUp ? '#ECFDF5' : isDown ? '#FEF2F2' : '#F3F4F6';
  const color = isUp ? '#047857' : isDown ? '#B84238' : '#6B7280';
  const sign  = isUp ? '▲' : isDown ? '▼' : '—';
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, padding: '1px 5px',
      borderRadius: 9999, background: bg, color, display: 'inline-block', marginLeft: 3,
    }}>
      {sign} {Math.abs(Math.round(n))}
    </span>
  );
}

// Build SVG path string from array of numbers
function sparklinePath(values, w, h, pad = 4) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return 'M' + pts.join(' L');
}

export default function StatusHeroCard({ todayMetrics = {}, sparklineData = [], loading = false }) {
  const [heroView, setHeroView] = useState('status');
  const [formRange, setFormRange] = useState('14d');

  const fitness = Math.round(todayMetrics.fitness || 0);
  const fatigue = Math.round(todayMetrics.fatigue || 0);
  const form    = Math.round(todayMetrics.form    || 0);
  const fitnessDelta = todayMetrics.fitnessChange;
  const fatigueDelta = todayMetrics.fatigueChange;
  const formDelta    = todayMetrics.formChange;

  const status = getTsbStatus(form);

  // Build sparkline arrays from chartData
  const rangeMap = { '14d': 14, '6w': 42, '3m': 90 };
  const pts = sparklineData.slice(-rangeMap[formRange]);
  const tsbSeries = pts.map(d => d.form  ?? d.tsb  ?? 0);
  const ctlSeries = pts.map(d => d.fitness ?? d.ctl ?? 0);
  const atlSeries = pts.map(d => d.fatigue ?? d.atl ?? 0);

  // ring fill % — clamp TSB to -40..+40 range, map to 0–100%
  const ringPct = Math.min(1, Math.max(0, (form + 40) / 80));
  const r = 38;
  const circ = 2 * Math.PI * r;
  const dash = ringPct * circ * 0.82; // 82% of circumference = full

  const W = 320, H_SPARK = 48, H_FORM = 130;

  if (loading) {
    return (
      <div style={styles.card}>
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={styles.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      {/* Header row */}
      <div style={styles.headerRow}>
        <span style={styles.eyebrow}>Today · {new Date().toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <div style={styles.seg}>
          {['status', 'form'].map(v => (
            <button key={v} style={{ ...styles.segBtn, ...(heroView === v ? styles.segBtnOn : {}) }}
              onClick={() => setHeroView(v)}>
              {v === 'status' ? 'Status' : 'Form chart'}
            </button>
          ))}
        </div>
      </div>

      {heroView === 'status' ? (
        <>
          {/* Ring + stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 14, alignItems: 'center', marginBottom: 10 }}>
            {/* Ring */}
            <div style={{ position: 'relative', width: 92, height: 92 }}>
              <svg width="92" height="92" viewBox="0 0 92 92">
                <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(118,126,181,.12)" strokeWidth="8" />
                <circle cx="46" cy="46" r={r} fill="none" stroke={status.color} strokeWidth="8"
                  strokeDasharray={`${dash} 999`} strokeLinecap="round"
                  transform="rotate(-90 46 46)" style={{ transition: 'stroke-dasharray .4s ease' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em' }}>
                  {form >= 0 ? `+${form}` : form}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', letterSpacing: '0.08em', marginTop: 2 }}>TSB</span>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Status pill */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999, background: status.color + '1f', alignSelf: 'flex-start' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color, display: 'inline-block' }} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: status.color }}>{status.label}</span>
              </div>

              {/* CTL / ATL */}
              <div style={{ display: 'flex', gap: 14 }}>
                {[
                  { label: 'Fitness', val: fitness, delta: fitnessDelta },
                  { label: 'Fatigue', val: fatigue, delta: fatigueDelta },
                ].map(({ label, val, delta }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                    <DeltaPill value={delta} />
                  </div>
                ))}
              </div>

              {/* Form delta */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Form</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' }}>{form >= 0 ? `+${form}` : form}</span>
                <DeltaPill value={formDelta} />
              </div>
            </div>
          </div>

          {/* TSB Sparkline */}
          {tsbSeries.length >= 2 && (
            <svg viewBox={`0 0 ${W} ${H_SPARK}`} preserveAspectRatio="none" style={{ width: '100%', height: H_SPARK, display: 'block', marginTop: 4 }}>
              <defs>
                <linearGradient id="ndtsb-g" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={status.color} stopOpacity=".22" />
                  <stop offset="1" stopColor={status.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={sparklinePath(tsbSeries, W, H_SPARK) + ` L ${W} ${H_SPARK} L 0 ${H_SPARK} Z`} fill="url(#ndtsb-g)" />
              <path d={sparklinePath(tsbSeries, W, H_SPARK)} fill="none" stroke={status.color} strokeWidth="1.8" />
            </svg>
          )}
        </>
      ) : (
        <>
          {/* Form chart */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              {[{ l: 'CTL', v: fitness, c: '#5E6590' }, { l: 'ATL', v: fatigue, c: '#FF6B4A' }, { l: 'TSB', v: form, c: '#4BA87D' }].map(({ l, v, c }) => (
                <div key={l} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 9.5, color: '#6B7280', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{l}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums' }}>{l === 'TSB' && v >= 0 ? `+${v}` : v}</span>
                </div>
              ))}
            </div>
            <div style={styles.seg}>
              {['14d', '6w', '3m'].map(r2 => (
                <button key={r2} style={{ ...styles.segBtnSm, ...(formRange === r2 ? styles.segBtnOn : {}) }}
                  onClick={() => setFormRange(r2)}>{r2}</button>
              ))}
            </div>
          </div>

          {ctlSeries.length >= 2 && (
            <svg viewBox={`0 0 ${W} ${H_FORM}`} preserveAspectRatio="none" style={{ width: '100%', height: H_FORM, display: 'block' }}>
              <defs>
                <linearGradient id="ndtsb2" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#4BA87D" stopOpacity=".22" />
                  <stop offset="1" stopColor="#4BA87D" stopOpacity="0" />
                </linearGradient>
              </defs>
              <line x1="0" y1={H_FORM / 2} x2={W} y2={H_FORM / 2} stroke="rgba(10,14,26,.06)" strokeDasharray="2 3" />
              <path d={sparklinePath(tsbSeries, W, H_FORM, 12) + ` L ${W} ${H_FORM} L 0 ${H_FORM} Z`} fill="url(#ndtsb2)" />
              <path d={sparklinePath(ctlSeries, W, H_FORM, 12)} fill="none" stroke="#5E6590" strokeWidth="2" />
              <path d={sparklinePath(atlSeries, W, H_FORM, 12)} fill="none" stroke="#FF6B4A" strokeWidth="1.8" strokeDasharray="3 3" />
              <path d={sparklinePath(tsbSeries, W, H_FORM, 12)} fill="none" stroke="#4BA87D" strokeWidth="2.2" />
            </svg>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            {[['#5E6590', 'CTL'], ['#FF6B4A', 'ATL'], ['#4BA87D', 'TSB']].map(([c, l]) => (
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: '#6B7280', fontWeight: 600 }}>
                <span style={{ display: 'inline-block', width: 10, height: 2, borderRadius: 1, background: c }} />
                {l}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: 'rgba(255,255,255,.65)',
    backdropFilter: 'blur(22px) saturate(170%)',
    WebkitBackdropFilter: 'blur(22px) saturate(170%)',
    border: '1px solid rgba(255,255,255,.7)',
    boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
    borderRadius: 22,
    padding: '14px 16px',
    marginBottom: 0,
  },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 },
  eyebrow: { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B7280' },
  seg: { display: 'inline-flex', padding: 3, borderRadius: 10, background: 'rgba(118,126,181,.12)' },
  segBtn: { border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: '#6B7280', padding: '4px 10px', borderRadius: 8, cursor: 'pointer' },
  segBtnSm: { border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700, color: '#6B7280', padding: '4px 9px', borderRadius: 8, cursor: 'pointer' },
  segBtnOn: { background: '#5E6590', color: '#fff', boxShadow: '0 2px 6px -2px rgba(94,101,144,.5)' },
  spinner: { width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(118,126,181,.2)', borderTopColor: '#767EB5', animation: 'spin 0.8s linear infinite' },
};
