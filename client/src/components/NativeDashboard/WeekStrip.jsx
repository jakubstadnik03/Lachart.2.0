import React from 'react';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekDays() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Monday = 0
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
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDotType(activities, date, plannedWorkouts) {
  const dayActs = activities.filter(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    return isSameDay(d, date);
  });
  const dayPlan = (plannedWorkouts || []).filter(p => {
    const key = String(p.date || '').slice(0, 10);
    return key === toLocalDateStr(date);
  });

  const hasLac = dayActs.some(a => Array.isArray(a.results) && a.results.some(r => r.lactate != null || r.mmol != null || r.lac != null));
  if (hasLac)              return 'lac';
  if (dayActs.length > 0) return 'done';
  if (dayPlan.length > 0) return 'plan';
  return 'rest';
}

function getSportColor(activities, date) {
  const act = activities.find(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    return isSameDay(d, date);
  });
  if (!act) return null;
  const s = String(act.sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycle')) return '#767EB5';
  if (s.includes('run'))  return '#F59E0B';
  if (s.includes('swim')) return '#3B82F6';
  return '#767EB5';
}

export default function WeekStrip({ activities = [], plannedWorkouts = [], selectedDate, onSelectDate }) {
  const weekDays = getWeekDays();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div style={styles.card}>
      {weekDays.map((d, i) => {
        const isToday    = isSameDay(d, today);
        const isSelected = selectedDate && isSameDay(d, selectedDate);
        const dotType    = getDotType(activities, d, plannedWorkouts);
        const isRest     = dotType === 'rest';
        const sportColor = getSportColor(activities, d);

        const dotColor =
          dotType === 'lac'  ? '#FF6B4A' :
          dotType === 'done' ? (sportColor || '#4BA87D') :
          dotType === 'plan' ? 'rgba(118,126,181,.5)' :
          'transparent';

        return (
          <button
            key={i}
            onClick={() => onSelectDate && onSelectDate(d)}
            style={{
              ...styles.day,
              ...(isToday || isSelected ? styles.dayActive : {}),
            }}
          >
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: isToday || isSelected ? 'rgba(255,255,255,.8)' : '#6B7280' }}>
              {DOW[i][0]}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: isToday || isSelected ? '#fff' : isRest ? 'rgba(10,14,26,.3)' : '#0A0E1A' }}>
              {d.getDate()}
            </span>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: isToday || isSelected ? '#fff' : dotColor, marginTop: 1, display: 'block' }} />
          </button>
        );
      })}
    </div>
  );
}

const styles = {
  card: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 4,
    padding: 6,
    background: 'rgba(255,255,255,.65)',
    backdropFilter: 'blur(22px) saturate(170%)',
    WebkitBackdropFilter: 'blur(22px) saturate(170%)',
    border: '1px solid rgba(255,255,255,.7)',
    boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
    borderRadius: 16,
  },
  day: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '8px 0',
    borderRadius: 11,
    background: 'transparent',
    border: '1px solid transparent',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all .2s',
  },
  dayActive: {
    background: 'linear-gradient(160deg,#5E6590,#767EB5)',
    boxShadow: '0 6px 16px -6px rgba(94,101,144,.5)',
    border: '1px solid transparent',
  },
};
