import React from 'react';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekDays() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function getDotType(activities, date, plannedWorkouts) {
  const dayActs = activities.filter(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    return isSameDay(d, date);
  });
  const dayPlan = (plannedWorkouts || []).filter(p =>
    String(p.date || '').slice(0, 10) === toLocalDateStr(date)
  );

  const hasLac = dayActs.some(a =>
    Array.isArray(a.results) && a.results.some(r => r.lactate != null || r.mmol != null || r.lac != null)
  );
  if (hasLac)              return 'lac';
  if (dayActs.length > 0 && dayPlan.length > 0) return 'paired';   // completed + planned
  if (dayActs.length > 0) return 'done';
  if (dayPlan.length > 0) return 'plan';
  return 'rest';
}

function getSportColor(activities, date) {
  const act = activities.find(a => isSameDay(new Date(a.date || a.startDate || a.timestamp || 0), date));
  if (!act) return null;
  const s = String(act.sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycle')) return '#767EB5';
  if (s.includes('run'))  return '#F59E0B';
  if (s.includes('swim')) return '#3B82F6';
  return '#767EB5';
}

export default function WeekStrip({ activities = [], plannedWorkouts = [], selectedDate, onSelectDate }) {
  const weekDays = getWeekDays();
  const today    = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div style={styles.card}>
      {weekDays.map((d, i) => {
        const isToday    = isSameDay(d, today);
        const isSelected = selectedDate && isSameDay(d, selectedDate);
        const dotType    = getDotType(activities, d, plannedWorkouts);
        const sportColor = getSportColor(activities, d);

        // Dot colour
        const dotColor =
          dotType === 'lac'    ? '#FF6B4A' :
          dotType === 'paired' ? '#22c55e' :
          dotType === 'done'   ? (sportColor || '#4BA87D') :
          dotType === 'plan'   ? 'rgba(118,126,181,.5)' :
          'transparent';

        // Background rules:
        //   selected           → full gradient
        //   today (not sel.)   → very subtle tint, no bold treatment
        //   other              → transparent
        const dayBg = isSelected
          ? 'linear-gradient(160deg,#5E6590,#767EB5)'
          : isToday
          ? 'rgba(118,126,181,.12)'
          : 'transparent';

        const dayBorder = isSelected
          ? '1.5px solid rgba(255,255,255,.3)'
          : isToday
          ? '1.5px solid rgba(118,126,181,.25)'
          : '1.5px solid transparent';

        const dayBoxShadow = isSelected
          ? '0 4px 14px -4px rgba(94,101,144,.55)'
          : 'none';

        const numColor   = isSelected ? '#fff' : isToday ? '#5E6590' : dotType === 'rest' ? 'rgba(10,14,26,.28)' : '#0A0E1A';
        const labelColor = isSelected ? 'rgba(255,255,255,.75)' : isToday ? '#767EB5' : '#9CA3AF';

        // Dot inside active day: white (visible on gradient)
        const renderedDot = isSelected
          ? (dotType !== 'rest' ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.25)')
          : dotColor;

        return (
          <button
            key={i}
            onClick={() => onSelectDate && onSelectDate(d)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '8px 0', borderRadius: 12,
              background: dayBg,
              border: dayBorder,
              boxShadow: dayBoxShadow,
              fontFamily: 'inherit', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
              transition: 'background .18s ease, box-shadow .18s ease',
            }}
          >
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: labelColor, transition: 'color .18s' }}>
              {DOW[i][0]}
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: numColor, transition: 'color .18s' }}>
              {d.getDate()}
            </span>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: renderedDot,
              display: 'block',
              transition: 'background .18s',
            }} />
          </button>
        );
      })}
    </div>
  );
}

const styles = {
  card: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7,1fr)',
    gap: 3,
    padding: '6px 6px',
    background: 'rgba(255,255,255,.65)',
    backdropFilter: 'blur(22px) saturate(170%)',
    WebkitBackdropFilter: 'blur(22px) saturate(170%)',
    border: '1px solid rgba(255,255,255,.7)',
    boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
    borderRadius: 16,
  },
};
