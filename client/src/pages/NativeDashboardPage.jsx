import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import StatusHeroCard    from '../components/NativeDashboard/StatusHeroCard';
import TodayCard         from '../components/NativeDashboard/TodayCard';
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

// ─── page ─────────────────────────────────────────────────────────────────────

/**
 * Pure display component — all data is loaded by DashboardPage and passed as props.
 * This avoids duplicate API calls and keeps a single source of truth.
 */
export default function NativeDashboardPage({
  activities      = [],   // calendarData from DashboardPage
  plannedWorkouts = [],   // plannedWorkouts from DashboardPage
  tests           = [],   // tests from DashboardPage
  todayMetrics    = {},   // { fitness, fatigue, form, fitnessChange, fatigueChange, formChange }
  sparklineData   = [],   // array of { date, fitness, fatigue, form } points
  loading         = false,
  user            = null,
}) {
  const navigate      = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());

  const today    = new Date();
  const todayStr = toLocalDateStr(today);

  // Today's completed activity (from calendarData)
  const todayActivity = activities.find(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    return isSameLocalDay(d, today);
  }) || null;

  // Today's planned workout
  const todayPlanned = plannedWorkouts.find(p => {
    const key = String(p.date || '').slice(0, 10);
    return key === todayStr;
  }) || null;

  return (
    <div style={styles.page}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={styles.topBar}>
        <div>
          <div style={styles.greeting}>
            {getGreeting()}, {user?.firstName || user?.name?.split(' ')[0] || 'Athlete'} 👋
          </div>
          <div style={styles.dateLabel}>
            {today.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <button
          onClick={() => navigate('/profile')}
          style={styles.avatarBtn}
          aria-label="Profile"
        >
          {user?.profilePicture
            ? <img src={user.profilePicture} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            : <span style={{ fontSize: 17 }}>{(user?.firstName || user?.name || '?')[0].toUpperCase()}</span>
          }
        </button>
      </div>

      {/* ── Scrollable card stack ────────────────────────────────────────── */}
      <div style={styles.body}>

        {/* 1 · Week strip */}
        <WeekStrip
          activities={activities}
          plannedWorkouts={plannedWorkouts}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {/* 2 · Status hero (CTL/ATL/TSB ring + sparkline) */}
        <StatusHeroCard
          todayMetrics={todayMetrics}
          sparklineData={sparklineData}
          loading={loading}
        />

        {/* 3 · Today's training */}
        <TodayCard
          todayActivity={todayActivity}
          todayPlanned={todayPlanned}
          onLogLactate={(intervalId, mmol) => {
            console.log('[NativeDashboard] logLactate', intervalId, mmol);
          }}
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
        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: '100dvh',
    background: 'linear-gradient(160deg, #EEF0F4 0%, #E8EAF0 100%)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    // 56px top = iOS status-bar safe area; fallback env() for devices with notch
    padding: 'max(56px, env(safe-area-inset-top, 56px)) 20px 8px',
  },
  greeting: {
    fontSize: 20,
    fontWeight: 800,
    color: '#0A0E1A',
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#6B7280',
    marginTop: 3,
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'linear-gradient(135deg,#767EB5,#5E6590)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
    overflow: 'hidden',
    flexShrink: 0,
    boxShadow: '0 4px 12px -4px rgba(94,101,144,.5)',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    WebkitOverflowScrolling: 'touch',
    paddingBottom: 'env(safe-area-inset-bottom, 16px)',
  },
};
