import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';

import StatusHeroCard    from '../components/NativeDashboard/StatusHeroCard';
import TodayCard         from '../components/NativeDashboard/TodayCard';
import WeekStrip         from '../components/NativeDashboard/WeekStrip';
import WeeklySummaryCard from '../components/NativeDashboard/WeeklySummaryCard';
import LastTestCard      from '../components/NativeDashboard/LastTestCard';
import ZoneDistCard      from '../components/NativeDashboard/ZoneDistCard';

import { getFormFitnessData, getTodayMetrics } from '../services/api';
import api from '../services/api';

// ─── helpers ──────────────────────────────────────────────────────────────────

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function normalizeApiList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.trainings)) return data.trainings;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function NativeDashboardPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();

  const athleteId = user?._id;

  // ── state ──────────────────────────────────────────────────────────────────
  const [todayMetrics,    setTodayMetrics]    = useState({});
  const [sparklineData,   setSparklineData]   = useState([]);
  const [activities,      setActivities]      = useState([]);
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [tests,           setTests]           = useState([]);
  const [selectedDate,    setSelectedDate]    = useState(new Date());
  const [loading,         setLoading]         = useState(true);

  // ── loaders ────────────────────────────────────────────────────────────────

  const loadMetrics = useCallback(async () => {
    if (!athleteId) return;
    try {
      const [todayRes, sparkRes] = await Promise.all([
        getTodayMetrics(athleteId),
        getFormFitnessData(athleteId, 90, 'all'),
      ]);
      if (todayRes?.data) setTodayMetrics(todayRes.data);
      if (sparkRes?.data) {
        const raw = Array.isArray(sparkRes.data) ? sparkRes.data : sparkRes.data?.data || [];
        setSparklineData(raw);
      }
    } catch (err) {
      console.error('[NativeDashboard] metrics error', err);
    }
  }, [athleteId]);

  const loadActivities = useCallback(async () => {
    if (!athleteId) return;
    try {
      const cacheKey = `nativeDash_acts_${athleteId}`;
      const cacheTs  = `nativeDash_acts_ts_${athleteId}`;
      const TTL      = 5 * 60 * 1000;
      const cached   = localStorage.getItem(cacheKey);
      const ts       = Number(localStorage.getItem(cacheTs) || 0);

      if (cached && Date.now() - ts < TTL) {
        setActivities(JSON.parse(cached));
      }

      // Always refresh in background
      const res = await api.get(`/user/athlete/${athleteId}/trainings`);
      const data = normalizeApiList(res.data);
      setActivities(data);
      localStorage.setItem(cacheKey, JSON.stringify(data));
      localStorage.setItem(cacheTs, String(Date.now()));
    } catch (err) {
      console.error('[NativeDashboard] activities error', err);
    }
  }, [athleteId]);

  const loadCalendar = useCallback(async () => {
    if (!athleteId) return;
    try {
      const res = await api.get(`/user/athlete/${athleteId}/calendar`);
      const raw = Array.isArray(res.data) ? res.data : res.data?.events || [];
      const planned = raw.filter(e => e.type === 'planned' || e.plannedWorkout || e.targetTss != null);
      setPlannedWorkouts(planned);
    } catch (err) {
      console.error('[NativeDashboard] calendar error', err);
    }
  }, [athleteId]);

  const loadTests = useCallback(async () => {
    if (!athleteId) return;
    try {
      const res = await api.get(`/user/athlete/${athleteId}/tests`);
      const data = Array.isArray(res.data) ? res.data : [];
      setTests(data);
    } catch (err) {
      console.error('[NativeDashboard] tests error', err);
    }
  }, [athleteId]);

  // ── boot ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!athleteId) return;
    setLoading(true);
    Promise.all([
      loadMetrics(),
      loadActivities(),
      loadCalendar(),
      loadTests(),
    ]).finally(() => setLoading(false));
  }, [athleteId, loadMetrics, loadActivities, loadCalendar, loadTests]);

  // ── derived: today's activity + planned ────────────────────────────────────

  const today = new Date();
  const todayStr = toLocalDateStr(today);

  const todayActivity = activities.find(a => {
    const d = new Date(a.date || a.startDate || a.timestamp || 0);
    return isSameLocalDay(d, today);
  }) || null;

  const todayPlanned = plannedWorkouts.find(p => {
    const key = String(p.date || '').slice(0, 10);
    return key === todayStr;
  }) || null;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      {/* ── Top bar ── */}
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

      {/* ── Scrollable body ── */}
      <div style={styles.body}>
        {/* 1. Week strip */}
        <WeekStrip
          activities={activities}
          plannedWorkouts={plannedWorkouts}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />

        {/* 2. Status hero (CTL/ATL/TSB ring + sparkline) */}
        <StatusHeroCard
          todayMetrics={todayMetrics}
          sparklineData={sparklineData}
          loading={loading}
        />

        {/* 3. Today's training */}
        <TodayCard
          todayActivity={todayActivity}
          todayPlanned={todayPlanned}
          onLogLactate={(intervalId, mmol) => {
            // TODO: persist via API when endpoint available
            console.log('[NativeDashboard] logLactate', intervalId, mmol);
          }}
        />

        {/* 4. Weekly summary */}
        <WeeklySummaryCard
          activities={activities}
          plannedWorkouts={plannedWorkouts}
        />

        {/* 5. Zone distribution */}
        <ZoneDistCard activities={activities} />

        {/* 6. Last lab test */}
        <LastTestCard tests={tests} />

        {/* Bottom safe area spacer */}
        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
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
    padding: '56px 20px 8px',   // 56px top = status bar safe area
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
    letterSpacing: '0.01em',
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
  },
};
