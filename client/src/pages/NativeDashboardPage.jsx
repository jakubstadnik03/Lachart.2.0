import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import StatusHeroCard    from '../components/NativeDashboard/StatusHeroCard';
import WeekStrip         from '../components/NativeDashboard/WeekStrip';
import WeeklySummaryCard from '../components/NativeDashboard/WeeklySummaryCard';
import LastTestCard      from '../components/NativeDashboard/LastTestCard';
import ZoneDistCard      from '../components/NativeDashboard/ZoneDistCard';

// ─── helpers ──────────────────────────────────────────────────────────────────

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function fmtDuration(secs) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function getSportEmoji(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycle')) return '🚴';
  if (s.includes('run'))  return '🏃';
  if (s.includes('swim')) return '🏊';
  return '⚡';
}

function getSportColor(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycle')) return '#767EB5';
  if (s.includes('run'))  return '#F59E0B';
  if (s.includes('swim')) return '#3B82F6';
  return '#767EB5';
}

// ─── Day activities card ───────────────────────────────────────────────────────
function DayActivitiesCard({ date, activities, plannedWorkouts, onOpenActivity }) {
  const dateStr = toLocalDateStr(date);
  const today   = new Date();
  const isToday = isSameLocalDay(date, today);

  const dayActs = activities.filter(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    return isSameLocalDay(d, date);
  });

  const dayPlanned = plannedWorkouts.filter(p => {
    const key = String(p.date || '').slice(0, 10);
    return key === dateStr;
  });

  const hasContent = dayActs.length > 0 || dayPlanned.length > 0;

  const label = isToday
    ? 'Today'
    : date.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#0A0E1A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        {hasContent && (
          <span style={{ fontSize: 10.5, color: '#6B7280', fontWeight: 600 }}>
            {dayActs.length} session{dayActs.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Activities */}
      {dayActs.map((act, i) => {
        const id    = act._id || act.id;
        const sport = act.sport || '';
        const color = getSportColor(sport);
        const title = act.title || act.name || act.titleManual || 'Training';
        const dur   = fmtDuration(Number(act.duration || act.movingTime || act.elapsed_time || act.totalTimerTime || 0));
        const dist  = Number(act.distance || act.totalDistance || 0);
        const distStr = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : dist > 0 ? `${Math.round(dist)} m` : null;
        const pwr   = Number(act.avgPower || act.average_watts || 0);

        return (
          <button
            key={id || i}
            onClick={() => id && onOpenActivity(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              padding: '10px 10px',
              borderRadius: 12,
              background: 'rgba(255,255,255,.55)',
              border: `1px solid rgba(255,255,255,.6)`,
              borderLeft: `3px solid ${color}`,
              marginBottom: i < dayActs.length - 1 || dayPlanned.length > 0 ? 6 : 0,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            {/* Emoji */}
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{getSportEmoji(sport)}</span>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0E1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                {[dur, distStr, pwr > 0 ? `${Math.round(pwr)} W` : null].filter(Boolean).join(' · ') || 'Completed'}
              </div>
            </div>

            {/* Arrow */}
            <span style={{ fontSize: 14, color: '#9CA3AF', flexShrink: 0 }}>›</span>
          </button>
        );
      })}

      {/* Planned workouts */}
      {dayPlanned.map((pw, i) => {
        const sport = pw.sport || '';
        const color = getSportColor(sport);
        const title = pw.title || pw.name || 'Planned workout';
        const planDur = pw.plannedDuration
          ? fmtDuration(pw.plannedDuration)
          : null;

        return (
          <div
            key={pw._id || `plan-${i}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 10px',
              borderRadius: 12,
              background: color + '08',
              border: `1px dashed ${color}55`,
              borderLeft: `3px dashed ${color}`,
              marginBottom: i < dayPlanned.length - 1 ? 6 : 0,
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, opacity: 0.6 }}>{getSportEmoji(sport)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                {[planDur, pw.targetTss ? `${pw.targetTss} TSS` : null].filter(Boolean).join(' · ') || 'Planned'}
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999, background: color + '18', color }}>Plan</span>
          </div>
        );
      })}

      {!hasContent && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>
          Rest day
        </div>
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function NativeDashboardPage({
  activities      = [],
  plannedWorkouts = [],
  tests           = [],
  todayMetrics    = {},
  sparklineData   = [],
  loading         = false,
  user            = null,
}) {
  const navigate      = useNavigate();
  const today         = new Date();
  const [selectedDate, setSelectedDate] = useState(today);

  const openActivity = (id) => {
    navigate(`/training-calendar/${id}`);
  };

  return (
    <div style={styles.page}>
      {/* ── Compact greeting — no extra safe-area padding (NativeLayout handles that) ── */}
      <div style={styles.greeting}>
        <div>
          <div style={styles.greetingText}>
            {getGreeting()}, {user?.firstName || user?.name?.split(' ')[0] || 'Athlete'} 👋
          </div>
          <div style={styles.dateText}>
            {today.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {/* ── Scrollable card stack ── */}
      <div style={styles.body}>

        {/* 1 · Week strip */}
        <WeekStrip
          activities={activities}
          plannedWorkouts={plannedWorkouts}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {/* 2 · Selected day activities (replaces the old TodayCard) */}
        <DayActivitiesCard
          date={selectedDate}
          activities={activities}
          plannedWorkouts={plannedWorkouts}
          onOpenActivity={openActivity}
        />

        {/* 3 · Status hero (CTL/ATL/TSB ring + sparkline) */}
        <StatusHeroCard
          todayMetrics={todayMetrics}
          sparklineData={sparklineData}
          loading={loading}
        />

        {/* 4 · Weekly summary */}
        <WeeklySummaryCard
          activities={activities}
          plannedWorkouts={plannedWorkouts}
        />

        {/* 5 · Zone distribution */}
        <ZoneDistCard activities={activities} />

        {/* 6 · Last lab test */}
        <LastTestCard tests={tests} />

        {/* Safe-area bottom spacer */}
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const cardStyle = {
  background: 'rgba(255,255,255,.65)',
  backdropFilter: 'blur(22px) saturate(170%)',
  WebkitBackdropFilter: 'blur(22px) saturate(170%)',
  border: '1px solid rgba(255,255,255,.7)',
  boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
  borderRadius: 18,
  padding: '14px 14px',
};

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    background: 'linear-gradient(160deg, #EEF0F4 0%, #E8EAF0 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
  },
  greeting: {
    padding: '14px 18px 4px',
  },
  greetingText: {
    fontSize: 19,
    fontWeight: 800,
    color: '#0A0E1A',
    letterSpacing: '-0.02em',
    lineHeight: 1.25,
  },
  dateText: {
    fontSize: 12,
    fontWeight: 600,
    color: '#6B7280',
    marginTop: 2,
  },
  body: {
    flex: 1,
    padding: '8px 14px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
};
