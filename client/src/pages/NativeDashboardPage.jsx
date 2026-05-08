import React, { useState, useRef, useEffect } from 'react';
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

// Mirror of CalendarView's sportMatches
function sportMatches(pwSport, actSport) {
  const p = (pwSport  || '').toLowerCase();
  const a = (actSport || '').toLowerCase();
  if (p === 'bike' && (a.includes('ride') || a.includes('bike') || a.includes('cycle') || a.includes('virtual'))) return true;
  if (p === 'run'  && a.includes('run'))  return true;
  if (p === 'swim' && a.includes('swim')) return true;
  if (p === 'walk' && a.includes('walk')) return true;
  if (p === 'strength' && (a.includes('weight') || a.includes('strength') || a.includes('gym'))) return true;
  return p === a;
}

// Mirror of CalendarView's getCompliance
function getCompliance(plannedSecs, actualSecs) {
  if (!plannedSecs || !actualSecs) return null;
  const r = actualSecs / plannedSecs;
  if (r >= 0.9)  return { color: '#22c55e', bg: '#f0fdf4', label: 'On target' };
  if (r >= 0.75) return { color: '#eab308', bg: '#fefce8', label: 'Good' };
  if (r >= 0.55) return { color: '#f97316', bg: '#fff7ed', label: 'Short' };
  return           { color: '#ef4444', bg: '#fef2f2', label: 'Missed' };
}

// Mirror of CalendarView's pairPlannedWithActivities
function pairActivities(plannedForDay, acts) {
  const pwToAct = new Map();
  const claimed = new Set();
  if (!plannedForDay?.length || !acts?.length) return { pwToAct, claimed };
  const actKey = (a) => String(a?._id ?? a?.id ?? '');
  for (const pw of plannedForDay) {
    if (!pw?._id) continue;
    const prelinked = pw.completedTrainingId
      ? acts.find(a => actKey(a) === String(pw.completedTrainingId))
      : null;
    const match = prelinked
      || acts.find(a => !claimed.has(actKey(a)) && sportMatches(pw.sport, a.sport || a.type || ''));
    if (match) {
      pwToAct.set(String(pw._id), match);
      claimed.add(actKey(match));
    }
  }
  return { pwToAct, claimed };
}

// ─── Animated wrapper ─────────────────────────────────────────────────────────
// CSS keyframe animation — no framer-motion dependency needed
const SLIDE_IN_STYLE = `
@keyframes ndSlideIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

function AnimatedCard({ children, animKey }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.animation = 'none';
    // eslint-disable-next-line no-unused-expressions
    el.offsetHeight; // force reflow
    el.style.animation = 'ndSlideIn .22s cubic-bezier(.22,1,.36,1) forwards';
  }, [animKey]);

  return (
    <div ref={ref} style={{ animationFillMode: 'both' }}>
      {children}
    </div>
  );
}

// ─── Day activities card ───────────────────────────────────────────────────────
// onOpenActivity receives the full activity object so the caller can build the right URL
function DayActivitiesCard({ date, activities, plannedWorkouts, onOpenActivity }) {
  const dateStr = toLocalDateStr(date);
  const today   = new Date();
  const isToday = isSameLocalDay(date, today);

  // Activities and planned for this day
  const dayActs = activities.filter(a =>
    isSameLocalDay(new Date(a.date || a.startDate || a.timestamp || 0), date)
  );
  const dayPlanned = plannedWorkouts.filter(p =>
    String(p.date || '').slice(0, 10) === dateStr
  );

  // Pair planned ↔ activities (same logic as CalendarView)
  const { pwToAct, claimed } = pairActivities(dayPlanned, dayActs);

  // Unclaimed standalone activities
  const unclaimedActs = dayActs.filter(a => !claimed.has(String(a._id ?? a.id ?? '')));

  const hasContent = dayActs.length > 0 || dayPlanned.length > 0;
  const label = isToday
    ? 'Today'
    : date.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasContent ? 10 : 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#0A0E1A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        {dayActs.length > 0 && (
          <span style={{ fontSize: 10.5, color: '#6B7280', fontWeight: 600 }}>
            {dayActs.length} session{dayActs.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Paired planned+activity (green merged card like calendar) ── */}
      {dayPlanned.map((pw, pi) => {
        const linkedAct = pwToAct.get(String(pw._id));
        const isPaired  = !!linkedAct;
        const today2    = new Date();
        const isMissed  = !isPaired && new Date(pw.date) < today2;

        const sport     = pw.sport || linkedAct?.sport || '';
        const color     = getSportColor(sport);
        const actTitle  = linkedAct?.title || linkedAct?.name || linkedAct?.titleManual || null;
        const pwTitle   = pw.title || pw.name || 'Planned workout';

        // Compliance
        const pwSecs = pw.plannedDuration || 0;
        const actSecs = linkedAct
          ? Number(linkedAct.duration || linkedAct.movingTime || linkedAct.elapsed_time || linkedAct.elapsedTime || linkedAct.totalTimerTime || 0)
          : 0;
        const compliance = isPaired ? getCompliance(pwSecs, actSecs) : null;

        // Style by state
        const bg     = isPaired ? '#f0fdf4' : isMissed ? '#fef2f2' : color + '08';
        const border = isPaired ? '#bbf7d0' : isMissed ? '#fecaca' : color + '44';
        const leftC  = isPaired ? '#22c55e' : isMissed ? '#ef4444' : color;
        const titleC = isPaired ? '#14532d' : isMissed ? '#991b1b' : color;

        const dur     = fmtDuration(pwSecs);
        const actDur  = linkedAct ? fmtDuration(actSecs) : null;
        const dist    = linkedAct ? Number(linkedAct.distance || linkedAct.totalDistance || 0) : 0;
        const distStr = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : dist > 0 ? `${Math.round(dist)} m` : null;

        return (
          <button
            key={pw._id || `pw-${pi}`}
            onClick={() => { if (linkedAct) onOpenActivity(linkedAct); }}
            disabled={!linkedAct}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              width: '100%',
              padding: '10px 11px',
              borderRadius: 13,
              background: bg,
              border: `1px solid ${border}`,
              borderLeft: `3px solid ${leftC}`,
              marginBottom: pi < dayPlanned.length - 1 || unclaimedActs.length > 0 ? 6 : 0,
              cursor: linkedAct ? 'pointer' : 'default',
              textAlign: 'left',
              fontFamily: 'inherit',
              position: 'relative',
            }}
          >
            {/* Emoji */}
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
              {getSportEmoji(sport)}
            </span>

            {/* Info column */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Title */}
              <div style={{ fontSize: 13, fontWeight: 700, color: titleC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {actTitle || pwTitle}
              </div>

              {/* Stats row */}
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2, fontVariantNumeric: 'tabular-nums', display: 'flex', flexWrap: 'wrap', gap: '0 6px' }}>
                {isPaired && actDur && <span>✓ {actDur}</span>}
                {isPaired && distStr && <span>{distStr}</span>}
                {!isPaired && dur   && <span>Plan: {dur}</span>}
                {pw.targetTss > 0   && <span>{pw.targetTss} TSS</span>}
              </div>
            </div>

            {/* Right side: compliance badge or status */}
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
              {isPaired && compliance && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700,
                  padding: '2px 7px', borderRadius: 9999,
                  background: compliance.color + '22',
                  color: compliance.color,
                }}>
                  {compliance.label}
                </span>
              )}
              {isPaired && !compliance && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700,
                  padding: '2px 7px', borderRadius: 9999,
                  background: '#dcfce7', color: '#16a34a',
                }}>
                  Done ✓
                </span>
              )}
              {!isPaired && !isMissed && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700,
                  padding: '2px 7px', borderRadius: 9999,
                  background: color + '18', color,
                }}>
                  Plan
                </span>
              )}
              {isMissed && (
                <span style={{
                  fontSize: 9.5, fontWeight: 700,
                  padding: '2px 7px', borderRadius: 9999,
                  background: '#fee2e2', color: '#dc2626',
                }}>
                  Missed
                </span>
              )}
              {linkedAct && <span style={{ fontSize: 13, color: '#9CA3AF' }}>›</span>}
            </div>
          </button>
        );
      })}

      {/* ── Standalone activities (not claimed by any planned) ── */}
      {unclaimedActs.map((act, i) => {
        const id      = act._id || act.id;
        const sport   = act.sport || '';
        const color   = getSportColor(sport);
        const title   = act.title || act.name || act.titleManual || 'Training';
        const secs    = Number(act.duration || act.movingTime || act.elapsed_time || act.elapsedTime || act.totalTimerTime || 0);
        const dur     = fmtDuration(secs);
        const dist    = Number(act.distance || act.totalDistance || 0);
        const distStr = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : dist > 0 ? `${Math.round(dist)} m` : null;
        const pwr     = Number(act.avgPower || act.average_watts || 0);

        return (
          <button
            key={id || `act-${i}`}
            onClick={() => onOpenActivity(act)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '10px 11px', borderRadius: 13,
              background: 'rgba(255,255,255,.55)',
              border: '1px solid rgba(255,255,255,.6)',
              borderLeft: `3px solid ${color}`,
              marginBottom: i < unclaimedActs.length - 1 ? 6 : 0,
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{getSportEmoji(sport)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0E1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                {[dur, distStr, pwr > 0 ? `${Math.round(pwr)} W` : null].filter(Boolean).join(' · ') || 'Completed'}
              </div>
            </div>
            <span style={{ fontSize: 13, color: '#9CA3AF', flexShrink: 0 }}>›</span>
          </button>
        );
      })}

      {/* Empty */}
      {!hasContent && (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>
          Rest day 😴
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

  // Key for animation trigger — changes on date select
  const [animKey, setAnimKey] = useState(0);

  const handleSelectDate = (d) => {
    setSelectedDate(d);
    setAnimKey(k => k + 1);
  };

  // Build the canonical URL just like TrainingTable does
  const openActivity = (actOrId) => {
    // If called with a raw id string (legacy), fall back gracefully
    if (typeof actOrId === 'string') {
      navigate(`/training-calendar/${encodeURIComponent(actOrId)}`);
      return;
    }
    const a = actOrId;
    if (a.type === 'fit' && a._id) {
      navigate(`/training-calendar/${encodeURIComponent(`fit-${a._id}`)}`);
    } else if ((a.type === 'strava' || a.stravaId || a.source === 'strava') && (a.stravaId || a.id)) {
      navigate(`/training-calendar/${encodeURIComponent(`strava-${a.stravaId || a.id}`)}`);
    } else if (a.type === 'regular' && a._id) {
      navigate(`/training-calendar/${encodeURIComponent(`regular-${a._id}`)}`);
    } else if (a._id) {
      navigate(`/training-calendar/${encodeURIComponent(`training-${a._id}`)}`);
    }
  };

  return (
    <>
      {/* Inject keyframe once */}
      <style>{SLIDE_IN_STYLE}</style>

      <div style={styles.page}>
        {/* ── Greeting ── */}
        <div style={styles.greetingRow}>
          <div style={styles.greetingText}>
            {getGreeting()}, {user?.firstName || user?.name?.split(' ')[0] || 'Athlete'} 👋
          </div>
          <div style={styles.dateText}>
            {today.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        {/* ── Cards ── */}
        <div style={styles.body}>

          {/* 1 · Week strip */}
          <WeekStrip
            activities={activities}
            plannedWorkouts={plannedWorkouts}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
          />

          {/* 2 · Day activities — animated on date change */}
          <AnimatedCard animKey={animKey}>
            <DayActivitiesCard
              date={selectedDate}
              activities={activities}
              plannedWorkouts={plannedWorkouts}
              onOpenActivity={openActivity}
            />
          </AnimatedCard>

          {/* 3 · Status hero */}
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
          <ZoneDistCard activities={activities} tests={tests} />

          {/* 6 · Last lab test */}
          <LastTestCard tests={tests} />

          <div style={{ height: 16 }} />
        </div>
      </div>
    </>
  );
}

// ─── shared card style ────────────────────────────────────────────────────────

const cardStyle = {
  background: 'rgba(255,255,255,.65)',
  backdropFilter: 'blur(22px) saturate(170%)',
  WebkitBackdropFilter: 'blur(22px) saturate(170%)',
  border: '1px solid rgba(255,255,255,.7)',
  boxShadow: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 24px -10px rgba(10,14,26,.08)',
  borderRadius: 18,
  padding: '13px 13px',
};

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    background: 'linear-gradient(160deg, #EEF0F4 0%, #E8EAF0 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
  },
  greetingRow: {
    padding: '12px 18px 4px',
  },
  greetingText: {
    fontSize: 19, fontWeight: 800, color: '#0A0E1A',
    letterSpacing: '-0.02em', lineHeight: 1.25,
  },
  dateText: {
    fontSize: 12, fontWeight: 600, color: '#6B7280', marginTop: 2,
  },
  body: {
    flex: 1,
    padding: '8px 14px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
};
