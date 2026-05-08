import React, { useState } from 'react';

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
  return Number(
    a.totalTime ||
    a.duration  || a.movingTime || a.moving_time ||
    a.elapsedTime || a.elapsed_time ||
    a.totalTimerTime || 0
  );
}

function actDist(a) {
  return Number(a.distance || a.totalDistance || 0);
}

function actTss(a) {
  return Number(a.tss || a.trainingLoad || a.totalTSS || 0);
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

export default function WeeklySummaryCard({ activities = [], plannedWorkouts = [] }) {
  const [metric, setMetric] = useState('TSS');
  const today    = new Date();
  const { monday, sunday } = getWeekBounds(today);
  const weekDays = getWeekDays(today);

  // ── filter this week ───────────────────────────────────────────────────────
  const weekActs = activities.filter(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    return inWeek(d, monday, sunday);
  });

  const weekPlanned = (plannedWorkouts || []).filter(p => {
    const d = new Date(p.date || 0);
    return inWeek(d, monday, sunday);
  });

  // ── totals ─────────────────────────────────────────────────────────────────
  const totalSecs    = weekActs.reduce((s, a) => s + actSecs(a), 0);
  const totalDist    = weekActs.reduce((s, a) => s + actDist(a), 0);
  const totalTss     = weekActs.reduce((s, a) => s + actTss(a), 0);
  const sessions     = weekActs.length;

  const plannedTotalTss  = weekPlanned.reduce((s, p) => s + pwTss(p), 0);
  const plannedTotalSecs = weekPlanned.reduce((s, p) => s + pwSecs(p), 0);
  const plannedTotalDist = weekPlanned.reduce((s, p) => s + pwDist(p), 0);

  // ── per-day values ─────────────────────────────────────────────────────────
  const getVal = (a) => metric === 'TSS' ? actTss(a) : metric === 'Time' ? actSecs(a) : actDist(a);
  const getPw  = (p) => metric === 'TSS' ? pwTss(p)  : metric === 'Time' ? pwSecs(p)  : pwDist(p);

  const dayCompleted = weekDays.map(d =>
    weekActs.filter(a => isSameLocalDay(new Date(a.date || a.startDate || a.timestamp || 0), d))
            .reduce((s, a) => s + getVal(a), 0)
  );
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

  return (
    <div style={styles.card}>
      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginBottom: 12 }}>
        {[
          { label: 'Time',     value: fmtDuration(totalSecs) },
          { label: 'TSS',      value: totalTss > 0 ? Math.round(totalTss) : '—' },
          { label: 'Distance', value: fmtDist(totalDist) },
          { label: 'Sessions', value: sessions },
        ].map(({ label, value }) => (
          <div key={label} style={styles.kpi}>
            <span style={styles.kpiLabel}>{label}</span>
            <span style={styles.kpiValue}>{value}</span>
          </div>
        ))}
      </div>

      {/* ── Divider + toggle ── */}
      <div style={{ borderTop: '1px solid rgba(118,126,181,.14)', paddingTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          {/* Section label + planned target */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={styles.sectionLabel}>Daily {metric}</span>
            {plannedLabel && (
              <span style={{ fontSize: 10.5, color: '#6B7280', fontWeight: 600 }}>
                {completedLabel} / {plannedLabel}
                {progressPct != null && (
                  <span style={{ marginLeft: 4, color: progressPct >= 90 ? '#22c55e' : progressPct >= 60 ? '#f59e0b' : '#ef4444' }}>
                    {Math.round(progressPct)}%
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Metric toggle */}
          <div style={styles.seg}>
            {METRICS.map(m => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                style={{ ...styles.segBtn, ...(metric === m ? styles.segBtnOn : {}) }}
              >
                {m === 'Distance' ? 'Dist' : m}
              </button>
            ))}
          </div>
        </div>

        {/* Progress bar (only when planned target exists) */}
        {progressPct != null && (
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(118,126,181,.15)', marginBottom: 10, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2, transition: 'width .4s ease',
              width: `${progressPct}%`,
              background: progressPct >= 90 ? 'linear-gradient(90deg,#4ade80,#22c55e)'
                : progressPct >= 60 ? 'linear-gradient(90deg,#fbbf24,#f59e0b)'
                : 'linear-gradient(90deg,#f87171,#ef4444)',
            }} />
          </div>
        )}

        {/* ── Daily bars ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, alignItems: 'flex-end' }}>
          {weekDays.map((d, i) => {
            const comp   = dayCompleted[i];
            const plan   = dayPlanned[i];
            const isToday = isSameLocalDay(d, today);
            const isPast  = d < today && !isToday;

            const compH = comp > 0 ? Math.max(5, (comp / maxVal) * 54) : 0;
            const planH = plan > 0 ? Math.max(5, (plan / maxVal) * 54) : 0;

            // Compliance color for completed bar
            const compColor = isToday
              ? 'linear-gradient(180deg,#FF8A6E,#E85535)'
              : comp > 0 && plan > 0
              ? (comp / plan >= 0.9 ? 'linear-gradient(180deg,#4ade80,#22c55e)'
                : comp / plan >= 0.6 ? 'linear-gradient(180deg,#fbbf24,#f59e0b)'
                : 'linear-gradient(180deg,#f87171,#ef4444)')
              : comp > 0
              ? 'linear-gradient(180deg,#767EB5,#5E6590)'
              : null;

            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                {/* Bar column */}
                <div style={{ width: '100%', height: 64, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative', gap: 2 }}>

                  {/* Planned ghost bar (behind) */}
                  {plan > 0 && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: '50%',
                      transform: 'translateX(-50%)',
                      width: 18, height: planH, borderRadius: '4px 4px 2px 2px',
                      background: 'rgba(118,126,181,.15)',
                      border: '1px dashed rgba(118,126,181,.35)',
                    }} />
                  )}

                  {/* Completed bar (on top) */}
                  {comp > 0 && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: '50%',
                      transform: 'translateX(-50%)',
                      width: 14, height: compH, borderRadius: '4px 4px 2px 2px',
                      background: compColor,
                      boxShadow: isToday ? '0 2px 6px -2px rgba(255,107,74,.5)' : 'none',
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
