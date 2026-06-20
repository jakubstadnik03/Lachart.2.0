import React, { useState } from 'react';
import FormFitnessHelpSheet from '../shared/FormFitnessHelpSheet';

// ─── date helpers ─────────────────────────────────────────────────────────────

function getWeekBounds(refDate) {
  const dow = (refDate.getDay() + 6) % 7;
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function getWeekDays(refDate) {
  const { monday } = getWeekBounds(refDate);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function inWeek(date, monday, sunday) {
  return date >= monday && date <= sunday;
}

// ─── value extractors ─────────────────────────────────────────────────────────

// Use the normalized totalTime field first (set by DashboardPage for all activity types)
function actSecs(a) {
  if (!a) return 0;
  return Number(
    a.totalTime ||
    a.duration  || a.movingTime || a.moving_time ||
    a.elapsedTime || a.elapsed_time ||
    a.totalTimerTime || 0
  );
}

function actDist(a) {
  if (!a) return 0;
  return Number(a.distance || a.totalDistance || 0);
}

function actTss(a) {
  if (!a) return 0;
  return Number(a.tss || a.trainingLoad || a.totalTSS || a.hrTSS || a.hrTss || 0);
}

// ─── client-side TSS fallback (mirrors server `calculateActivityTSS`) ─────────
// Used when activities don't have stored TSS (typical for Strava activities).
// `thresholds` is { bike: { lt2Power }, run: { lt2Pace }, swim: { lt2Pace } }

function normalizeSportKey(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('ride') || v.includes('cycle') || v.includes('bike') || v.includes('virtual')) return 'bike';
  if (v.includes('run')  || v.includes('walk')  || v.includes('hike')) return 'run';
  if (v.includes('swim')) return 'swim';
  return null;
}

// Extract LT2 thresholds per sport from lactate tests (most recent test per sport)
function extractThresholds(tests) {
  const out = { bike: null, run: null, swim: null };
  if (!Array.isArray(tests) || !tests.length) return out;
  const bySport = {};
  tests.forEach(t => {
    if (!t) return;                      // guard against undefined entries
    const sp = normalizeSportKey(t.sport || t.testType);
    if (!sp) return;
    if (!bySport[sp]) bySport[sp] = [];
    bySport[sp].push(t);
  });
  Object.keys(bySport).forEach(sp => {
    bySport[sp].sort((a, b) => new Date(b?.date || b?.testDate || 0) - new Date(a?.date || a?.testDate || 0));
    const t = bySport[sp][0];
    if (!t) return;                      // guard against empty bucket
    const ov = t.thresholdOverrides || {};
    // For bike: LTP2 = power (Watts). For run/swim: LTP2 = pace (sec/km or sec/100m)
    const ltp2 = Number(ov.LTP2) || null;
    out[sp] = {
      lt2Power: sp === 'bike' ? ltp2 : null,
      lt2Pace:  sp !== 'bike' ? ltp2 : null,
      lt2Hr:    Number(ov.LTP2_hr) || null,
    };
    // Fallback: derive from results array (find first stage at lactate >= 4)
    if (Array.isArray(t.results)) {
      const stage = t.results.find(r => Number(r.lactate) >= 4);
      if (stage) {
        if (sp === 'bike' && !out[sp].lt2Power) {
          out[sp].lt2Power = Number(stage.power) || Number(stage.interval) || null;
        } else if (sp !== 'bike' && !out[sp].lt2Pace) {
          // For run/swim: `interval` field on a stage is the pace
          out[sp].lt2Pace = Number(stage.interval) || Number(stage.pace) || null;
        }
        out[sp].lt2Hr = out[sp].lt2Hr || Number(stage.heartRate) || null;
      }
    }
  });
  return out;
}

// Compute TSS for an activity. Returns 0 if not computable.
function computeActivityTSS(a, thresholds) {
  if (!a) return 0;
  const sport = normalizeSportKey(a.sport);
  const secs  = actSecs(a);
  if (!sport || secs <= 0) return 0;
  const th = thresholds?.[sport];

  // ─── Bike: power-based TSS ────────────────────────────────────────────────
  if (sport === 'bike') {
    const np  = Number(a.weightedAveragePower || a.normalizedPower || a.avgPower || a.averagePower || a.average_watts || 0);
    const ftp = Number(th?.lt2Power || 0);
    if (np > 0 && ftp > 0) {
      return Math.round((secs * np * np) / (ftp * ftp * 3600) * 100);
    }
    // hrTSS fallback: use HR with LT2 HR if available
    const avgHr = Number(a.avgHeartRate || a.averageHeartRate || a.average_heartrate || 0);
    const lthr  = Number(th?.lt2Hr || 0);
    if (avgHr > 0 && lthr > 0) {
      const ratio = avgHr / lthr;
      return Math.round((secs * ratio * ratio) / 3600 * 100);
    }
  }

  // ─── Run: pace-based TSS ──────────────────────────────────────────────────
  if (sport === 'run') {
    const speed = Number(a.avgSpeed || a.averageSpeed || a.average_speed || 0); // m/s
    const refPace = Number(th?.lt2Pace || 0); // sec/km
    if (speed > 0 && refPace > 0) {
      const avgPace = 1000 / speed; // sec/km
      const ratio = refPace / avgPace; // >1 if faster than reference
      return Math.round((secs * ratio * ratio) / 3600 * 100);
    }
    // hrTSS fallback
    const avgHr = Number(a.avgHeartRate || a.averageHeartRate || a.average_heartrate || 0);
    const lthr  = Number(th?.lt2Hr || 0);
    if (avgHr > 0 && lthr > 0) {
      const ratio = avgHr / lthr;
      return Math.round((secs * ratio * ratio) / 3600 * 100);
    }
  }

  // ─── Swim: pace-based TSS (per 100 m) ─────────────────────────────────────
  if (sport === 'swim') {
    const speed = Number(a.avgSpeed || a.averageSpeed || a.average_speed || 0); // m/s
    const refPace = Number(th?.lt2Pace || 0); // sec / 100m
    if (speed > 0 && refPace > 0) {
      const avgPace = 100 / speed;
      const ratio = refPace / avgPace;
      return Math.round((secs * ratio * ratio) / 3600 * 100);
    }
  }

  return 0;
}

// TSS for an activity: stored value if present, else computed
function tssOrCompute(a, thresholds) {
  const stored = actTss(a);
  if (stored > 0) return stored;
  return computeActivityTSS(a, thresholds);
}

// Planned workout accessors
function pwSecs(p) {
  // planStepTotalSecs equivalent: sum steps durations or use plannedDuration
  if (Array.isArray(p.steps) && p.steps.length > 0) {
    const sum = p.steps.reduce((s, st) => {
      const d = st.durationSeconds || st.duration || 0;
      return s + Number(d);
    }, 0);
    if (sum > 0) return sum;
  }
  return Number(p.plannedDuration || 0);
}

function pwDist(p) {
  return Number(p.plannedDistance || 0) * 1000; // km → m
}

function pwTss(p) {
  return Number(p.targetTss || 0);
}

// ─── formatters ───────────────────────────────────────────────────────────────

function fmtDuration(secs) {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDist(m) {
  if (!m) return '0';
  return m >= 1000 ? `${(m / 1000).toFixed(0)} km` : `${Math.round(m)} m`;
}

// ─── component ────────────────────────────────────────────────────────────────

const DOW_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const METRICS = ['TSS', 'Time', 'Distance'];

// Square chevron button used by the week navigator at the top of the card.
const navBtnStyle = {
  width: 28, height: 28, borderRadius: 8,
  background: 'rgba(118,126,181,.12)', border: 'none',
  color: '#5E6590', cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, flexShrink: 0,
  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
};

export default function WeeklySummaryCard({ activities = [], plannedWorkouts = [], sparklineData = [], tests = [] }) {
  const [metric, setMetric] = useState('TSS');
  const [ffHelpOpen, setFfHelpOpen] = useState(false);
  // Week offset: 0 = current, +1 = next, -1 = previous, etc. Lets the user
  // peek at next-week planned totals without leaving the dashboard.
  const [weekOffset, setWeekOffset] = useState(0);
  // Horizontal swipe → change week. Threshold 45px and vertical lock so
  // it doesn't fight with vertical page scroll.
  const swipeRef = React.useRef({ x: 0, y: 0, active: false });
  const onTouchStart = (e) => {
    const t = e.touches?.[0]; if (!t) return;
    swipeRef.current = { x: t.clientX, y: t.clientY, active: true };
  };
  const onTouchEnd = (e) => {
    const s = swipeRef.current; if (!s.active) return;
    const t = e.changedTouches?.[0]; if (!t) { s.active = false; return; }
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    s.active = false;
    if (Math.abs(dx) < 45 || Math.abs(dy) > Math.abs(dx)) return; // not a horizontal swipe
    setWeekOffset(w => w + (dx < 0 ? 1 : -1));
  };
  const today    = new Date();
  const refDate  = new Date(today);
  refDate.setDate(today.getDate() + weekOffset * 7);
  const { monday, sunday } = getWeekBounds(refDate);
  const weekDays = getWeekDays(refDate);
  const isCurrentWeek = weekOffset === 0;

  // Threshold map for client-side TSS fallback
  const thresholds = extractThresholds(tests);

  // ── filter this week ───────────────────────────────────────────────────────
  const weekActs = activities.filter(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    return inWeek(d, monday, sunday);
  });

  const weekPlanned = (plannedWorkouts || []).filter(p => {
    const d = new Date(p.date || 0);
    return inWeek(d, monday, sunday);
  });

  // ── TSS from sparklineData (backend-computed, authoritative) ───────────────
  // sparklineData points have { date: 'YYYY-MM-DD', TSS: number }
  // Build a map: dateStr → TSS for fast lookup
  const sparkleTssMap = {};
  for (const pt of sparklineData) {
    if (pt.date && pt.TSS != null) {
      sparkleTssMap[pt.date.slice(0, 10)] = Number(pt.TSS);
    }
  }

  // Sum TSS for each day in this week from sparklineData
  const weekSparkTss = weekDays.reduce((sum, d) => {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return sum + (sparkleTssMap[key] || 0);
  }, 0);

  // Per-day TSS from sparkline (for bars)
  const daySparkTss = weekDays.map(d => {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return sparkleTssMap[key] || 0;
  });

  // ── Form / Fitness / Fatigue snapshot for the selected week ────────────────
  // Use the *last* day of the week that has data (capped at today for the
  // current week — future days have no data yet). Delta is vs the day before
  // the week started, so users can see how the week shifted things.
  const sparkByDate = {};
  for (const pt of sparklineData) {
    if (pt?.date) sparkByDate[pt.date.slice(0, 10)] = pt;
  }
  const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  // Walk back from Sunday (or today, whichever is sooner) until we hit a date with data
  const cutoff = sunday < today ? sunday : today;
  let endSnap = null;
  for (let i = 0; i < 14; i++) {
    const probe = new Date(cutoff);
    probe.setDate(cutoff.getDate() - i);
    const s = sparkByDate[dateKey(probe)];
    if (s) { endSnap = s; break; }
  }
  // Reference snapshot: day before this week's Monday
  const refProbe = new Date(monday);
  refProbe.setDate(monday.getDate() - 1);
  let startSnap = null;
  for (let i = 0; i < 14; i++) {
    const p = new Date(refProbe);
    p.setDate(refProbe.getDate() - i);
    const s = sparkByDate[dateKey(p)];
    if (s) { startSnap = s; break; }
  }
  const ffStats = endSnap ? {
    fitness: Math.round(endSnap.Fitness || 0),
    fatigue: Math.round(endSnap.Fatigue || 0),
    form:    Math.round(endSnap.Form    || 0),
    dFitness: startSnap ? Math.round((endSnap.Fitness || 0) - (startSnap.Fitness || 0)) : 0,
    dFatigue: startSnap ? Math.round((endSnap.Fatigue || 0) - (startSnap.Fatigue || 0)) : 0,
    dForm:    startSnap ? Math.round((endSnap.Form    || 0) - (startSnap.Form    || 0)) : 0,
  } : null;

  // ── totals ─────────────────────────────────────────────────────────────────
  const totalSecs    = weekActs.reduce((s, a) => s + actSecs(a), 0);
  const totalDist    = weekActs.reduce((s, a) => s + actDist(a), 0);
  // Use sparkline TSS when available (has Strava TSS, FIT TSS, all computed server-side)
  // Fall back to activity-level tss field, then client-side computed TSS using lactate-test thresholds
  const activityTss  = weekActs.reduce((s, a) => s + tssOrCompute(a, thresholds), 0);
  const totalTss     = weekSparkTss > 0 ? weekSparkTss : activityTss;
  const sessions     = weekActs.length;

  const plannedTotalTss  = weekPlanned.reduce((s, p) => s + pwTss(p), 0);
  const plannedTotalSecs = weekPlanned.reduce((s, p) => s + pwSecs(p), 0);
  const plannedTotalDist = weekPlanned.reduce((s, p) => s + pwDist(p), 0);

  // ── per-day values ─────────────────────────────────────────────────────────
  const getVal = (a) => metric === 'TSS' ? actTss(a) : metric === 'Time' ? actSecs(a) : actDist(a);
  const getPw  = (p) => metric === 'TSS' ? pwTss(p)  : metric === 'Time' ? pwSecs(p)  : pwDist(p);

  const dayCompleted = weekDays.map((d, i) => {
    if (metric === 'TSS') {
      // Use sparkline TSS when available (more accurate — includes server-computed values)
      if (daySparkTss[i] > 0) return daySparkTss[i];
      // Fall back to stored or client-computed activity TSS
      return weekActs
        .filter(a => isSameLocalDay(new Date(a.date || a.startDate || a.timestamp || 0), d))
        .reduce((s, a) => s + tssOrCompute(a, thresholds), 0);
    }
    return weekActs
      .filter(a => isSameLocalDay(new Date(a.date || a.startDate || a.timestamp || 0), d))
      .reduce((s, a) => s + getVal(a), 0);
  });
  const dayPlanned = weekDays.map(d =>
    weekPlanned.filter(p => isSameLocalDay(new Date(p.date || 0), d))
               .reduce((s, p) => s + getPw(p), 0)
  );

  // Bar height reference = max of (completed, planned) across the week
  const maxVal = Math.max(...dayCompleted, ...dayPlanned, 1);

  // ── KPI values depending on metric ────────────────────────────────────────
  const completedLabel = metric === 'TSS' ? Math.round(totalTss) || '—'
    : metric === 'Time' ? fmtDuration(totalSecs)
    : fmtDist(totalDist);

  const plannedLabel = metric === 'TSS'
    ? (plannedTotalTss > 0 ? Math.round(plannedTotalTss) : null)
    : metric === 'Time'
    ? (plannedTotalSecs > 0 ? fmtDuration(plannedTotalSecs) : null)
    : (plannedTotalDist > 0 ? fmtDist(plannedTotalDist) : null);

  // Progress % for current metric
  const progressPct = (() => {
    if (metric === 'TSS'      && plannedTotalTss  > 0) return Math.min(100, (totalTss  / plannedTotalTss)  * 100);
    if (metric === 'Time'     && plannedTotalSecs > 0) return Math.min(100, (totalSecs / plannedTotalSecs) * 100);
    if (metric === 'Distance' && plannedTotalDist > 0) return Math.min(100, (totalDist / plannedTotalDist) * 100);
    return null;
  })();

  // Label for the current week selection (shown in the navigator)
  const weekLabel = (() => {
    if (weekOffset === 0)  return 'This week';
    if (weekOffset === 1)  return 'Next week';
    if (weekOffset === -1) return 'Last week';
    const fmt = (d) => `${d.getDate()}.${d.getMonth()+1}.`;
    return `${fmt(monday)}–${fmt(sunday)}`;
  })();

  return (
    <div
      style={styles.card}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Week navigator ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, gap: 6,
      }}>
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          aria-label="Previous week"
          style={navBtnStyle}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: 12, fontWeight: 800, color: '#0A0E1A',
            letterSpacing: '-0.01em', whiteSpace: 'nowrap',
          }}>
            {weekLabel}
          </span>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekOffset(0)}
              style={{
                fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 9999,
                background: 'rgba(118,126,181,.12)', color: '#5E6590', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '0.04em', textTransform: 'uppercase',
                WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
              }}
            >
              Today
            </button>
          )}
        </div>

        <button
          onClick={() => setWeekOffset(w => w + 1)}
          aria-label="Next week"
          style={navBtnStyle}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginBottom: 12 }}>
        {[
          { label: 'Time',     value: fmtDuration(totalSecs) },
          { label: 'TSS',      value: totalTss > 0 ? Math.round(totalTss) : '—' },
          { label: 'Distance', value: fmtDist(totalDist) },
          { label: 'Sessions', value: sessions },
        ].map(({ label, value }, idx) => (
          <div
            key={label}
            style={{
              ...styles.kpi,
              animation: `ndPopIn .5s ${idx * 60}ms cubic-bezier(.22,1.4,.36,1) both`,
            }}
          >
            <span style={styles.kpiLabel}>{label}</span>
            <span
              key={`${label}-${value}`}
              style={{
                ...styles.kpiValue,
                animation: 'ndFadeIn .35s cubic-bezier(.22,1,.36,1) both',
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* ── Form / Fitness / Fatigue snapshot for this week ── */}
      {ffStats && (
        <div key={`ff-${weekOffset}`} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF' }}>
              Training balance
            </span>
            <button
              type="button"
              onClick={() => setFfHelpOpen(true)}
              aria-label="What do Form, Fitness and Fatigue mean?"
              style={{
                border: 'none', background: 'transparent', padding: '2px 4px',
                fontSize: 10, fontWeight: 700, color: '#5E6590', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              What is this?
            </button>
          </div>
          <div
            style={{
              display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7,
              animation: 'ndFadeIn .35s cubic-bezier(.22,1,.36,1) both',
            }}
          >
          {[
            { label: 'Form',    value: ffStats.form,    delta: ffStats.dForm,    accent: ffStats.form >= 0 ? '#15803D' : '#B45309' },
            { label: 'Fitness', value: ffStats.fitness, delta: ffStats.dFitness, accent: '#5E6590' },
            { label: 'Fatigue', value: ffStats.fatigue, delta: ffStats.dFatigue, accent: '#B84238' },
          ].map(({ label, value, delta, accent }) => {
            // Delta tinting:
            //  - Fitness ↑ = good (green), ↓ = warn (amber)
            //  - Fatigue ↑ = warn (red),   ↓ = good (green)
            //  - Form    ↑ = green,        ↓ = red
            const deltaGood =
              label === 'Fatigue' ? delta < 0 :
              label === 'Form'    ? delta >= 0 :
                                    delta >= 0;
            const deltaCol = delta === 0 ? '#9CA3AF' : (deltaGood ? '#15803D' : '#B91C1C');
            const sign = delta > 0 ? '+' : '';
            return (
              <div
                key={label}
                style={{
                  ...styles.kpi,
                  padding: '7px 8px',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                <span style={{ ...styles.kpiLabel, color: accent }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ ...styles.kpiValue, color: accent }}>
                    {label === 'Form' && value > 0 ? `+${value}` : value}
                  </span>
                  {delta !== 0 && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, color: deltaCol,
                      fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
                    }}>
                      {sign}{delta}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      <FormFitnessHelpSheet open={ffHelpOpen} onClose={() => setFfHelpOpen(false)} />

      {/* ── Divider + toggle ── */}
      <div style={{ borderTop: '1px solid rgba(118,126,181,.14)', paddingTop: 10 }}>
        {/* Title row + toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: plannedLabel ? 9 : 8 }}>
          <span style={styles.sectionLabel}>Daily {metric}</span>

          {/* Metric toggle */}
          <div style={styles.seg}>
            {METRICS.map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.94)'; }}
                onMouseUp={(e)   => { e.currentTarget.style.transform = ''; }}
                onMouseLeave={(e)=> { e.currentTarget.style.transform = ''; }}
                onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.94)'; }}
                onTouchEnd={(e)  => { e.currentTarget.style.transform = ''; }}
                style={{
                  ...styles.segBtn,
                  ...(metric === m ? styles.segBtnOn : {}),
                  transition: 'background .25s ease, color .25s ease, box-shadow .25s ease, transform .12s ease',
                }}
              >
                {m === 'Distance' ? 'Dist' : m}
              </button>
            ))}
          </div>
        </div>

        {/* Modern planned vs completed indicator (only when target exists) */}
        {plannedLabel && (() => {
          const pct = progressPct ?? 0;
          // Status palette by progress state
          const status = pct >= 100
            ? { label: 'Achieved',    fg: '#15803D', bg: '#DCFCE7', grad: ['#4ade80','#22c55e'], track: 'rgba(34,197,94,.12)' }
            : pct >= 90
            ? { label: 'On target',   fg: '#15803D', bg: '#DCFCE7', grad: ['#4ade80','#22c55e'], track: 'rgba(34,197,94,.12)' }
            : pct >= 60
            ? { label: 'Building',    fg: '#9A3412', bg: '#FFEDD5', grad: ['#fbbf24','#f59e0b'], track: 'rgba(245,158,11,.12)' }
            : pct > 0
            ? { label: 'Below target',fg: '#991B1B', bg: '#FEE2E2', grad: ['#f87171','#ef4444'], track: 'rgba(239,68,68,.12)' }
            : { label: 'Not started', fg: '#6B7280', bg: '#F3F4F6', grad: ['#9CA3AF','#6B7280'], track: 'rgba(156,163,175,.12)' };

          const fillW = Math.max(0, Math.min(100, pct));

          return (
            <div
              key={`prog-${metric}`}
              style={{
                marginBottom: 10,
                animation: 'ndFadeIn .4s cubic-bezier(.22,1,.36,1) both',
              }}
            >
              {/* Stat row: completed · / planned · status pill */}
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 8, marginBottom: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
                  <span style={{
                    fontSize: 18, fontWeight: 800, color: '#0A0E1A',
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                    letterSpacing: '-0.02em',
                  }}>
                    {completedLabel}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: '#9CA3AF',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    / {plannedLabel}
                  </span>
                </div>

                {/* Status pill */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 9999,
                  background: status.bg, color: status.fg,
                  fontSize: 9.5, fontWeight: 800,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: `linear-gradient(160deg, ${status.grad[0]}, ${status.grad[1]})`,
                  }} />
                  {Math.round(pct)}% · {status.label}
                </span>
              </div>

              {/* Modern progress bar — taller, rounded, gradient fill, soft shadow */}
              <div style={{
                position: 'relative',
                height: 7, borderRadius: 9999,
                background: status.track,
                overflow: 'hidden',
                boxShadow: 'inset 0 1px 1px rgba(10,14,26,.04)',
              }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${fillW}%`,
                  borderRadius: 9999,
                  background: `linear-gradient(90deg, ${status.grad[0]}, ${status.grad[1]})`,
                  boxShadow: `0 0 0 1px rgba(255,255,255,.4) inset, 0 1px 4px -1px ${status.grad[1]}66`,
                  transition: 'width .55s cubic-bezier(.22,1,.36,1), background .25s ease',
                  transformOrigin: 'left center',
                  animation: fillW > 0 ? `ndBarWidthIn .8s cubic-bezier(.22,1,.36,1) both` : 'none',
                  '--nd-bar-w': `${fillW}%`,
                }} />
              </div>
            </div>
          );
        })()}

        {/* ── Daily bars (re-key on metric switch to retrigger grow animation) ── */}
        <div key={`bars-${metric}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, alignItems: 'flex-end' }}>
          {weekDays.map((d, i) => {
            const comp   = dayCompleted[i];
            const plan   = dayPlanned[i];
            const isToday = isSameLocalDay(d, today);
            const isPast  = d < today && !isToday;

            const compH = comp > 0 ? Math.max(5, (comp / maxVal) * 54) : 0;
            const planH = plan > 0 ? Math.max(5, (plan / maxVal) * 54) : 0;

            // Clean monochrome bars in the brand colour — per-day compliance is
            // already shown by the height vs the planned ghost bar behind, so we
            // skip the green/amber/red rainbow. Today gets a slightly brighter
            // tint for emphasis.
            const compColor = comp > 0
              ? (isToday
                ? 'linear-gradient(180deg,#9AA1D4,#6B73A6)'
                : 'linear-gradient(180deg,#868DC4,#5E6590)')
              : null;

            const dayDelay = i * 35; // staggered by weekday

            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                {/* Bar column */}
                <div style={{ width: '100%', height: 64, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative', gap: 2 }}>

                  {/* Planned ghost bar (behind) — grows from 0 height */}
                  {plan > 0 && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: '50%',
                      transform: 'translateX(-50%)',
                      width: 18, height: planH, borderRadius: '4px 4px 2px 2px',
                      background: 'rgba(118,126,181,.15)',
                      border: '1px dashed rgba(118,126,181,.35)',
                      transformOrigin: 'bottom center',
                      animation: `ndBarGrow .55s ${dayDelay}ms cubic-bezier(.22,1,.36,1) both`,
                      transition: 'height .35s ease',
                    }} />
                  )}

                  {/* Completed bar (on top) — grows from 0 height */}
                  {comp > 0 && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: '50%',
                      transform: 'translateX(-50%)',
                      width: 14, height: compH, borderRadius: '4px 4px 2px 2px',
                      background: compColor,
                      boxShadow: isToday ? '0 2px 8px -2px rgba(94,101,144,.45)' : 'none',
                      transformOrigin: 'bottom center',
                      animation: `ndBarGrow .65s ${dayDelay + 80}ms cubic-bezier(.22,1,.36,1) both`,
                      transition: 'height .35s ease, background .25s ease',
                    }} />
                  )}

                  {/* Empty placeholder */}
                  {comp === 0 && plan === 0 && (
                    <div style={{
                      width: 14, height: 4, borderRadius: 2,
                      background: 'rgba(118,126,181,.15)',
                      opacity: isPast ? 0.7 : 0.35,
                    }} />
                  )}
                </div>

                {/* Day label */}
                <span style={{
                  fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: isToday ? '#5E6590' : '#9CA3AF',
                }}>
                  {DOW_SHORT[i]}
                </span>

                {/* Value */}
                <span style={{ fontSize: 9, fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums', minHeight: 12 }}>
                  {comp > 0
                    ? (metric === 'TSS' ? Math.round(comp)
                      : metric === 'Time' ? fmtDuration(comp)
                      : fmtDist(comp))
                    : '·'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legend (only when there's planned data) */}
        {weekPlanned.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>
              <span style={{ width: 10, height: 3, borderRadius: 1, background: 'rgba(118,126,181,.4)', display: 'inline-block', border: '1px dashed rgba(118,126,181,.5)' }} />
              Planned
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>
              <span style={{ width: 10, height: 3, borderRadius: 1, background: '#767EB5', display: 'inline-block' }} />
              Completed
            </span>
          </div>
        )}
      </div>
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
  kpi: {
    display: 'flex', flexDirection: 'column', gap: 1,
    padding: '7px 5px', borderRadius: 10,
    background: 'rgba(255,255,255,.45)', border: '1px solid rgba(255,255,255,.5)',
  },
  kpiLabel: { fontSize: 9, fontWeight: 700, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase' },
  kpiValue: { fontSize: 13.5, fontWeight: 700, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' },
  sectionLabel: { fontSize: 10.5, fontWeight: 700, color: '#0A0E1A', textTransform: 'uppercase', letterSpacing: '0.06em' },
  seg:      { display: 'inline-flex', padding: 2, borderRadius: 9, background: 'rgba(118,126,181,.12)' },
  segBtn:   { border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 10, fontWeight: 700, color: '#6B7280', padding: '3px 7px', borderRadius: 7, cursor: 'pointer' },
  segBtnOn: { background: '#5E6590', color: '#fff', boxShadow: '0 2px 6px -2px rgba(94,101,144,.5)' },
};
