import React from 'react';

function isSameWeek(date, refDate) {
  const dow = (refDate.getDay() + 6) % 7;
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return date >= monday && date <= sunday;
}

function isSameLocalDay(date, dayDate) {
  return date.getFullYear() === dayDate.getFullYear()
    && date.getMonth()    === dayDate.getMonth()
    && date.getDate()     === dayDate.getDate();
}

function fmtDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}


function getWeekDays(refDate) {
  const dow = (refDate.getDay() + 6) % 7;
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export default function WeeklySummaryCard({ activities = [], plannedWorkouts = [] }) {
  const today = new Date();

  // Week activities
  const weekActs = activities.filter(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    return isSameWeek(d, today);
  });

  const totalSecs = weekActs.reduce((s, a) => s + Number(a.duration || a.movingTime || a.elapsed_time || a.totalTimerTime || 0), 0);
  const totalDist = weekActs.reduce((s, a) => s + Number(a.distance || a.totalDistance || 0), 0);
  const totalTss  = weekActs.reduce((s, a) => s + Number(a.tss || a.trainingLoad || 0), 0);
  const sessions  = weekActs.length;

  // Planned TSS target for the week
  const weekPlanned = (plannedWorkouts || []).filter(p => {
    const d = new Date(p.date || 0);
    return isSameWeek(d, today);
  });
  const targetTss = weekPlanned.reduce((s, p) => s + Number(p.targetTss || 0), 0);

  // Daily TSS bars (Mon–Sun)
  const weekDays = getWeekDays(today);
  const DOW_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const dayTss = weekDays.map(d => {
    return weekActs
      .filter(a => isSameLocalDay(new Date(a.date || a.startDate || a.timestamp || 0), d))
      .reduce((s, a) => s + Number(a.tss || a.trainingLoad || 0), 0);
  });
  const maxTss = Math.max(...dayTss, 1);

  const stats = [
    { label: 'Time',      value: fmtDuration(totalSecs), delta: null },
    { label: 'TSS',       value: Math.round(totalTss),   delta: null },
    { label: 'Distance',  value: totalDist >= 1000 ? `${(totalDist / 1000).toFixed(0)} km` : `${Math.round(totalDist)} m`, delta: null },
    { label: 'Sessions',  value: sessions,                delta: null },
  ];

  return (
    <div style={styles.card}>
      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
        {stats.map(({ label, value }) => (
          <div key={label} style={styles.kpi}>
            <span style={styles.kpiLabel}>{label}</span>
            <span style={styles.kpiValue}>{value || '—'}</span>
          </div>
        ))}
      </div>

      {/* TSS bars */}
      <div style={{ borderTop: '1px solid rgba(118,126,181,.15)', paddingTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0A0E1A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Daily TSS</span>
          {targetTss > 0 && (
            <span style={{ fontSize: 10.5, color: '#6B7280', fontWeight: 600 }}>
              {Math.round(totalTss)}/{targetTss} {targetTss > 0 && Math.round(totalTss / targetTss * 100) + '%'}
            </span>
          )}
        </div>

        {/* Progress bar if we have target */}
        {targetTss > 0 && (
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(118,126,181,.15)', marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg,#767EB5,#5E6590)', width: `${Math.min(100, (totalTss / targetTss) * 100)}%`, transition: 'width .4s ease' }} />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, alignItems: 'flex-end' }}>
          {weekDays.map((d, i) => {
            const tss = dayTss[i];
            const barH = tss > 0 ? Math.max(4, (tss / maxTss) * 54) : 4;
            const isToday = isSameLocalDay(d, today);
            const isPast  = d < today;
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ width: '100%', height: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <div style={{
                    width: 18, borderRadius: '4px 4px 2px 2px', height: barH,
                    background: isToday
                      ? 'linear-gradient(180deg,#FF8A6E,#E85535)'
                      : tss > 0
                      ? 'linear-gradient(180deg,#767EB5,#5E6590)'
                      : 'rgba(118,126,181,.2)',
                    boxShadow: isToday ? '0 2px 6px -2px rgba(255,107,74,.5)' : 'none',
                    opacity: !isPast && !isToday && tss === 0 ? 0.4 : 1,
                  }} />
                </div>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: isToday ? '#5E6590' : '#9CA3AF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{DOW_SHORT[i]}</span>
                <span style={{ fontSize: 9.5, fontWeight: 600, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>{tss > 0 ? Math.round(tss) : '·'}</span>
              </div>
            );
          })}
        </div>
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
    padding: '14px 16px',
  },
  kpi: { display: 'flex', flexDirection: 'column', gap: 1, padding: '8px 6px', borderRadius: 10, background: 'rgba(255,255,255,.45)', border: '1px solid rgba(255,255,255,.5)' },
  kpiLabel: { fontSize: 9.5, fontWeight: 700, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase' },
  kpiValue: { fontSize: 14, fontWeight: 700, color: '#0A0E1A', fontVariantNumeric: 'tabular-nums' },
};
