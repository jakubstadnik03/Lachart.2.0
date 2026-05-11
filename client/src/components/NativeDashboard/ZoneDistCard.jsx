import React, { useState } from 'react';

// ─── Zone definitions ─────────────────────────────────────────────────────────

const ZONES = [
  { key: 'z1', label: 'Z1', name: 'Recovery',  color: '#60A5FA' },
  { key: 'z2', label: 'Z2', name: 'Endurance', color: '#34D399' },
  { key: 'z3', label: 'Z3', name: 'Tempo',     color: '#FBBF24' },
  { key: 'z4', label: 'Z4', name: 'Threshold', color: '#F97316' },
  { key: 'z5', label: 'Z5', name: 'VO2max',    color: '#F43F5E' },
];

// ─── Ported from ZoneDistributionChart.jsx ────────────────────────────────────

const INTENSITY_MAP = {
  recovery: 'z1', 'very easy': 'z1', warmup: 'z1', cooldown: 'z1',
  easy: 'z2', base: 'z2', aerobic: 'z2', endurance: 'z2', long: 'z2', low: 'z2', zone2: 'z2', z2: 'z2',
  tempo: 'z3', zone3: 'z3', z3: 'z3', moderate: 'z2', steady: 'z3',
  threshold: 'z4', hard: 'z4', lt: 'z4', lt2: 'z4', 'lactate threshold': 'z4', zone4: 'z4', z4: 'z4', ftp: 'z4',
  vo2: 'z5', vo2max: 'z5', 'vo2 max': 'z5', max: 'z5', sprint: 'z5', zone5: 'z5', z5: 'z5', anaerobic: 'z5',
};

function intensityToZone(val) {
  return val ? (INTENSITY_MAP[(val + '').toLowerCase().trim()] || null) : null;
}

function normalizeSport(t) {
  if (!t) return null;
  const s = (t.sport || t.sport_type || t.type || '').toLowerCase();
  if (s.includes('run'))                               return 'run';
  if (s.includes('ride') || s.includes('bike') || s.includes('cycl')) return 'bike';
  if (s.includes('swim'))                              return 'swim';
  return null;
}

function parseDuration(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  const s = String(v);
  const parts = s.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(s) || 0;
}

function totalTrainingSecs(t) {
  return Number(
    t.totalTime || t.duration || t.movingTime || t.moving_time ||
    t.elapsedTime || t.elapsed_time || t.totalTimerTime || 0
  );
}

function estimateTestThresholds(test) {
  if (!test) return { lt1Hr: null, lt2Hr: null, lt1Power: null, lt2Power: null };
  const ov = test.thresholdOverrides || {};
  let lt1Hr    = ov.LTP1_hr != null ? Number(ov.LTP1_hr) : null;
  let lt2Hr    = ov.LTP2_hr != null ? Number(ov.LTP2_hr) : null;
  let lt1Power = ov.LTP1    != null ? Number(ov.LTP1)    : null;
  let lt2Power = ov.LTP2    != null ? Number(ov.LTP2)    : null;

  const stages = Array.isArray(test.results)
    ? test.results.filter(r => r.lactate != null && !Number.isNaN(Number(r.lactate)))
    : [];

  if (stages.length >= 2 && (lt2Hr == null || lt2Power == null)) {
    const minLac = Math.min(...stages.map(s => Number(s.lactate)));
    for (const stage of stages) {
      if (Number(stage.lactate) >= 4.0) {
        if (lt2Hr    == null) lt2Hr    = Number(stage.heartRate) || null;
        if (lt2Power == null) lt2Power = Number(stage.power) || Number(stage.interval) || null;
        break;
      }
    }
    if (lt2Hr == null && lt2Power == null) {
      for (let i = 1; i < stages.length; i++) {
        const prev = Number(stages[i-1].lactate), curr = Number(stages[i].lactate);
        if (prev > 0 && (curr - prev) / prev > 0.5) {
          if (lt2Hr    == null) lt2Hr    = Number(stages[i].heartRate) || null;
          if (lt2Power == null) lt2Power = Number(stages[i].power) || Number(stages[i].interval) || null;
          break;
        }
      }
    }
    for (const stage of stages) {
      if (Number(stage.lactate) > minLac + 1.0) {
        if (lt1Hr    == null) lt1Hr    = Number(stage.heartRate) || null;
        if (lt1Power == null) lt1Power = Number(stage.power) || Number(stage.interval) || null;
        break;
      }
    }
  }
  return { lt1Hr, lt2Hr, lt1Power, lt2Power };
}

function computeThresholds(tests, sport) {
  if (!Array.isArray(tests) || tests.length === 0 || !sport) return null;
  const matching = tests.filter(t => t && t.sport === sport)
    .sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0));
  if (matching.length === 0) return null;
  const th = estimateTestThresholds(matching[0]);
  if (!th.lt2Hr && !th.lt2Power) return null;
  return th;
}

function classifyByThreshold(hr, power, th) {
  const { lt1Hr, lt2Hr, lt1Power, lt2Power } = th;
  if (hr > 30 && lt2Hr > 0) {
    if (hr >= lt2Hr * 1.03) return 'z5';
    if (hr >= lt2Hr * 0.97) return 'z4';
    if (lt1Hr > 0 && hr >= lt1Hr)        return 'z3';
    if (lt1Hr > 0 && hr >= lt1Hr * 0.88) return 'z2';
    return 'z1';
  }
  if (power > 10 && lt2Power > 0) {
    if (power >= lt2Power * 1.10) return 'z5';
    if (power >= lt2Power * 0.97) return 'z4';
    if (lt1Power > 0 && power >= lt1Power)        return 'z3';
    if (lt1Power > 0 && power >= lt1Power * 0.88) return 'z2';
    return 'z1';
  }
  return null;
}

function extractZones(training, thresholds) {
  if (!training) return null;
  const empty = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };

  // 1. Structured zone arrays
  for (const field of ['zones', 'timeInZone', 'timeInZones', 'zoneTimes']) {
    const arr = training?.[field];
    if (Array.isArray(arr) && arr.length > 0) {
      const result = { ...empty };
      const zeroBased = arr.some(z => Number(z.zone ?? z.zoneNumber ?? z.id) === 0);
      arr.forEach(z => {
        let idx = Number(z.zone ?? z.zoneNumber ?? z.id);
        if (!Number.isFinite(idx)) return;
        if (zeroBased && idx >= 0 && idx <= 4) idx += 1;
        const t = Number(z.time || z.seconds || z.duration || z.value || 0);
        if (idx >= 1 && idx <= 5) result[`z${idx}`] += t;
      });
      if (Object.values(result).reduce((a, b) => a + b, 0) > 0) return result;
    }
  }

  // 2. Structured zone objects
  for (const field of ['heartRateZones', 'powerZones']) {
    const obj = training[field];
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const result = { ...empty };
      for (let i = 1; i <= 5; i++) {
        result[`z${i}`] += Number(obj[`zone${i}`] || obj[`z${i}`] || obj[`Zone${i}`] || obj[i] || 0);
      }
      if (Object.values(result).reduce((a, b) => a + b, 0) > 0) return result;
    }
  }

  // 3. Interval results[]
  if (Array.isArray(training.results) && training.results.length > 0) {
    const result = { ...empty };
    let attributed = 0;
    const INTERVAL_TYPE_ZONE = { warmup: 'z1', cooldown: 'z1', recovery: 'z1', work: 'z4' };
    training.results.forEach(iv => {
      const zone = intensityToZone(iv.intensity || iv.category) || INTERVAL_TYPE_ZONE[iv.intervalType] || null;
      const secs = parseDuration(iv.duration || iv.durationSeconds);
      if (zone && secs > 0) { result[zone] += secs; attributed += secs; }
    });
    if (attributed > 0) return result;
  }

  // 4. Top-level intensity
  const zone = intensityToZone(training.intensity);
  const secs = totalTrainingSecs(training);
  if (zone && secs > 0) {
    const result = { ...empty };
    result[zone] = secs;
    return result;
  }

  // 5. Threshold-based fallback (lap-by-lap or whole workout)
  if (thresholds) {
    const lapResult = { ...empty };
    let lapAttr = 0;
    if (Array.isArray(training.laps) && training.laps.length > 1) {
      training.laps.forEach(lap => {
        const lapSecs = Number(lap.moving_time || lap.elapsed_time || 0);
        if (lapSecs <= 0) return;
        const z = classifyByThreshold(
          Number(lap.average_heartrate || 0),
          Number(lap.average_watts || 0),
          thresholds
        );
        if (z) { lapResult[z] += lapSecs; lapAttr += lapSecs; }
      });
    }
    if (lapAttr > 0) return lapResult;

    // Whole workout
    const avgHr  = Number(training.avgHeartRate || training.averageHeartRate || training.average_heartrate || 0);
    const avgPwr = Number(training.weightedAveragePower || training.avgPower || training.averagePower || training.average_watts || 0);
    const wz = classifyByThreshold(avgHr, avgPwr, thresholds);
    if (wz && secs > 0) {
      const result = { ...empty };
      result[wz] = secs;
      return result;
    }
  }

  return null;
}

// ─── date filtering ───────────────────────────────────────────────────────────

function isSameWeek(date, ref) {
  const dow = (ref.getDay() + 6) % 7;
  const mon = new Date(ref);
  mon.setDate(ref.getDate() - dow);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return date >= mon && date <= sun;
}

function isSameMonth(date, ref) {
  return date.getFullYear() === ref.getFullYear() && date.getMonth() === ref.getMonth();
}

function fmtDuration(secs) {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── sport icon paths (matches CalendarView) ──────────────────────────────────
const SPORT_ICONS = {
  bike: '/icon/bike.svg',
  run:  '/icon/run.svg',
  swim: '/icon/swim.svg',
};

// Sport tint colours — same palette as WeekStrip
const SPORT_TINT = {
  bike: '#3b82f6',
  run:  '#f97316',
  swim: '#06b6d4',
};

// ─── component ────────────────────────────────────────────────────────────────

export default function ZoneDistCard({ activities = [], tests = [] }) {
  const [range, setRange] = useState('week');
  const [sport, setSport] = useState('all');
  const today = new Date();

  // Filter activities by time range
  const inRange = activities.filter(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    if (range === 'week')  return isSameWeek(d, today);
    if (range === 'month') return isSameMonth(d, today);
    const cutoff = new Date(today);
    cutoff.setDate(today.getDate() - 28);
    return d >= cutoff;
  });

  // Detect which sports have data in the selected range (for sport toggle)
  const sportsAvailable = new Set();
  inRange.forEach(a => {
    const s = normalizeSport(a);
    if (s) sportsAvailable.add(s);
  });

  // Apply sport filter
  const filtered = sport === 'all'
    ? inRange
    : inRange.filter(a => normalizeSport(a) === sport);

  // Aggregate zones using threshold-based classification
  const totals = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  let hasData = false;
  const threshCache = {};

  filtered.forEach(t => {
    const tSport = normalizeSport(t);
    if (!(tSport in threshCache)) {
      threshCache[tSport] = computeThresholds(tests, tSport);
    }
    const z = extractZones(t, threshCache[tSport]);
    if (z) {
      hasData = true;
      Object.keys(totals).forEach(k => { totals[k] += z[k] || 0; });
    }
  });

  const totalSecs = Object.values(totals).reduce((s, v) => s + v, 0);
  const maxSecs   = Math.max(...Object.values(totals), 1);

  // Distribution label
  let distLabel = null;
  if (totalSecs > 0) {
    const pct = {};
    Object.keys(totals).forEach(k => { pct[k] = (totals[k] / totalSecs) * 100; });
    if (pct.z1 + pct.z5 >= 80)         distLabel = { text: 'Polarized',       color: '#6366f1' };
    else if (pct.z2 >= 60)              distLabel = { text: 'Zone 2 Focus',    color: '#22c55e' };
    else if (pct.z3 + pct.z4 >= 50)    distLabel = { text: 'Threshold-heavy', color: '#f97316' };
    else if (pct.z1 > pct.z2 && pct.z2 > pct.z3) distLabel = { text: 'Pyramidal', color: '#f59e0b' };
  }

  // Sport toggle items (always show All; show sport buttons only if data exists)
  const sportToggles = [
    { key: 'all',  label: 'All',  icon: null },
    { key: 'bike', label: 'Bike', icon: SPORT_ICONS.bike },
    { key: 'run',  label: 'Run',  icon: SPORT_ICONS.run  },
    { key: 'swim', label: 'Swim', icon: SPORT_ICONS.swim },
  ].filter(t => t.key === 'all' || sportsAvailable.has(t.key));

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={styles.sectionLabel}>Time in Zones</span>
          {distLabel && (
            <span
              key={distLabel.text}
              style={{
                fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 9999,
                background: distLabel.color + '18', color: distLabel.color,
                whiteSpace: 'nowrap',
                animation: 'ndPopIn .5s .25s cubic-bezier(.22,1.4,.36,1) both',
                transition: 'background .25s ease, color .25s ease',
              }}
            >
              {distLabel.text}
            </span>
          )}
        </div>
        <div style={styles.seg}>
          {[['week', 'Wk'], ['4w', '4w'], ['month', 'Mo']].map(([val, lbl]) => (
            <button
              key={val}
              style={{
                ...styles.segBtn,
                ...(range === val ? styles.segBtnOn : {}),
                transition: 'background .25s ease, color .25s ease, box-shadow .25s ease, transform .12s ease',
              }}
              onClick={() => setRange(val)}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
              onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
              onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
              onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
              onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Sport toggle row — only show if more than one sport in range */}
      {sportToggles.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 11, flexWrap: 'wrap' }}>
          {sportToggles.map(({ key, label, icon }, idx) => {
            const on = sport === key;
            return (
              <button
                key={key}
                onClick={() => setSport(key)}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
                onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
                onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: icon ? '4px 9px 4px 6px' : '4px 10px',
                  borderRadius: 9999,
                  border: on ? '1px solid #5E6590' : '1px solid rgba(118,126,181,.18)',
                  background: on ? '#5E6590' : 'rgba(255,255,255,.5)',
                  color: on ? '#fff' : '#6B7280',
                  fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'background .25s ease, color .25s ease, border-color .25s ease, transform .12s ease',
                  animation: `ndPopIn .35s ${idx * 50}ms cubic-bezier(.22,1.4,.36,1) both`,
                }}
              >
                {icon && (
                  <span
                    aria-label={label}
                    style={{
                      width: 13, height: 13, display: 'block', flexShrink: 0,
                      background: on ? '#fff' : (SPORT_TINT[key] || '#6B7280'),
                      WebkitMaskImage: `url(${icon})`,
                      maskImage:       `url(${icon})`,
                      WebkitMaskRepeat: 'no-repeat',
                      maskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskPosition: 'center',
                      WebkitMaskSize: 'contain',
                      maskSize: 'contain',
                    }}
                  />
                )}
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* No data state */}
      {!hasData ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          {/* Bar-chart icon — empty zones state */}
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6 }}>
            <line x1="12" y1="20" x2="12" y2="10" />
            <line x1="18" y1="20" x2="18" y2="4" />
            <line x1="6"  y1="20" x2="6"  y2="14" />
            <line x1="3"  y1="20" x2="21" y2="20" />
          </svg>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>No zone data</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
            {sport === 'all'
              ? 'Add a lactate test to enable threshold-based classification'
              : `No ${sport} data in this range`}
          </div>
        </div>
      ) : (
        <>
          <div
            key={`zones-${range}-${sport}`}
            style={{ display: 'flex', flexDirection: 'column', gap: 7 }}
          >
            {ZONES.map(({ key, name, color }, idx) => {
              const secs = totals[key];
              const pct  = totalSecs > 0 ? (secs / totalSecs) * 100 : 0;
              const barW = (secs / maxSecs) * 100;
              const barDelay = idx * 60;

              return (
                <div
                  key={key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '88px 1fr 60px',
                    alignItems: 'center',
                    gap: 8,
                    animation: `ndFadeIn .4s ${barDelay}ms cubic-bezier(.22,1,.36,1) both`,
                  }}>
                  {/* Label: zone pill + name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, color,
                      width: 22, textAlign: 'center',
                      padding: '2px 0', borderRadius: 4,
                      background: color + '18',
                      flexShrink: 0,
                    }}>
                      {key.toUpperCase()}
                    </span>
                    <span style={{
                      fontSize: 10.5, fontWeight: 600, color: '#374151',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {name}
                    </span>
                  </div>

                  {/* Bar track — bar slides right from 0 width */}
                  <div style={{ position: 'relative', height: 7, borderRadius: 4, background: 'rgba(118,126,181,.1)', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${barW}%`, borderRadius: 4,
                      background: color,
                      opacity: secs > 0 ? 1 : 0,
                      transformOrigin: 'left center',
                      transition: 'width .55s cubic-bezier(.22,1,.36,1), background .25s ease',
                      animation: secs > 0 ? `ndBarWidthIn .8s ${barDelay + 60}ms cubic-bezier(.22,1,.36,1) both` : 'none',
                      '--nd-bar-w': `${barW}%`,
                    }} />
                  </div>

                  {/* Time + percentage — right-aligned, fixed width */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
                  }}>
                    <span style={{
                      fontSize: 10.5, fontWeight: 700,
                      color: secs > 0 ? '#0A0E1A' : '#D1D5DB',
                    }}>
                      {fmtDuration(secs)}
                    </span>
                    <span style={{
                      fontSize: 9, color: secs > 0 ? '#9CA3AF' : 'transparent', fontWeight: 600,
                      minHeight: 11,
                    }}>
                      {secs > 0 ? `${pct.toFixed(0)}%` : '·'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div style={{ borderTop: '1px solid rgba(118,126,181,.12)', marginTop: 10, paddingTop: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(totalSecs)}</span>
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
    borderRadius: 18,
    padding: '13px 14px',
  },
  sectionLabel: { fontSize: 10.5, fontWeight: 700, color: '#0A0E1A', textTransform: 'uppercase', letterSpacing: '0.06em' },
  seg:      { display: 'inline-flex', padding: 2, borderRadius: 9, background: 'rgba(118,126,181,.12)' },
  segBtn:   { border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 10, fontWeight: 700, color: '#6B7280', padding: '3px 7px', borderRadius: 7, cursor: 'pointer' },
  segBtnOn: { background: '#5E6590', color: '#fff', boxShadow: '0 2px 6px -2px rgba(94,101,144,.5)' },
};
