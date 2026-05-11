import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import StatusHeroCard    from '../components/NativeDashboard/StatusHeroCard';
import WeekStrip         from '../components/NativeDashboard/WeekStrip';
import WeeklySummaryCard from '../components/NativeDashboard/WeeklySummaryCard';
import LastTestCard      from '../components/NativeDashboard/LastTestCard';
import ZoneDistCard      from '../components/NativeDashboard/ZoneDistCard';
import PlannedWorkoutEditor from '../components/NativeDashboard/PlannedWorkoutEditor';
import { NATIVE_DASHBOARD_KEYFRAMES, cardEntry } from '../components/NativeDashboard/animations';

// Lazy-load ActivityFullModal: it lives in CalendarView (4k+ lines) and pulling
// it eagerly into the dashboard chunk caused a webpack-split circular dep that
// surfaced as "Cannot access 'ae' before initialization" at runtime.
const ActivityFullModal = lazy(() =>
  import('../components/Calendar/CalendarView').then(m => ({ default: m.ActivityFullModal }))
);

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

// Sport colours — mirrors CalendarView SPORT_COLORS_CELL
const SPORT_COLORS = {
  bike:  '#767EB5',
  run:   '#f97316',
  swim:  '#38bdf8',
  walk:  '#22c55e',
  other: '#8b5cf6',
};

// Sport icon paths — same as CalendarView
const SPORT_ICONS = {
  bike: '/icon/bike.svg',
  run:  '/icon/run.svg',
  swim: '/icon/swim.svg',
};

function normSport(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycle') || s.includes('virtual')) return 'bike';
  if (s.includes('run'))  return 'run';
  if (s.includes('swim')) return 'swim';
  if (s.includes('walk')) return 'walk';
  return 'other';
}

function getSportColor(sport) {
  return SPORT_COLORS[normSport(sport)] || SPORT_COLORS.other;
}

function SportIcon({ sport, size = 22, color }) {
  const key = normSport(sport);
  const src = SPORT_ICONS[key];
  const tint = color || getSportColor(sport);
  if (src) {
    // Tint SVG by using it as a CSS mask + colored background
    return (
      <span
        aria-label={key}
        style={{
          width: size, height: size, display: 'block', flexShrink: 0,
          background: tint,
          WebkitMaskImage: `url(${src})`,
          maskImage:       `url(${src})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
    );
  }
  // Fallback coloured circle for unknown sports — small lightning bolt SVG
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      background: tint + '22',
    }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill={tint} stroke="none">
        <path d="M13 2L4.5 13h6L9 22l9-12h-6z" />
      </svg>
    </span>
  );
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
// onOpenActivity receives the full activity object so the caller can build the right URL.
// onOpenPlanned receives the planned workout (with optional `linkedActivity`) for editing.
function DayActivitiesCard({ date, activities, plannedWorkouts, onOpenActivity, onOpenPlanned }) {
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
        // "Missed" = unpaired AND the planned date is *strictly before today*.
        // Compare by calendar day only — otherwise a workout planned for today
        // shows as missed the moment it's past midnight, because `new Date()`
        // carries the current time-of-day.
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const pwDay = new Date(pw.date);
        pwDay.setHours(0, 0, 0, 0);
        const isMissed  = !isPaired && pwDay < todayMidnight;

        const sport     = pw.sport || linkedAct?.sport || '';
        const color     = getSportColor(sport);
        const actTitle  = linkedAct?.title || linkedAct?.name || linkedAct?.titleManual || null;
        const pwTitle   = pw.title || pw.name || 'Planned workout';

        // Compliance
        const pwSecs = pw.plannedDuration || 0;
        const actSecs = linkedAct
          ? Number(linkedAct.totalTime || linkedAct.duration || linkedAct.movingTime || linkedAct.elapsed_time || linkedAct.elapsedTime || linkedAct.totalTimerTime || 0)
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
            onClick={() => onOpenPlanned && onOpenPlanned(pw, linkedAct)}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.98)'; }}
            onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e)=> { e.currentTarget.style.transform = 'scale(1)'; }}
            onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.98)'; }}
            onTouchEnd={(e)  => { e.currentTarget.style.transform = 'scale(1)'; }}
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
              animation: `ndFadeIn .35s ${pi * 50}ms cubic-bezier(.22,1,.36,1) both`,
              transition: 'transform .15s ease',
              position: 'relative',
            }}
          >
            {/* Sport icon */}
            <SportIcon sport={sport} size={22} />

            {/* Info column */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Title */}
              <div style={{ fontSize: 13, fontWeight: 700, color: titleC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {actTitle || pwTitle}
              </div>

              {/* Stats row */}
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2, fontVariantNumeric: 'tabular-nums', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 6px' }}>
                {isPaired && actDur && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {/* Check SVG — replaces ✓ char */}
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {actDur}
                  </span>
                )}
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
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}>
                  Done
                  {/* Check SVG — replaces ✓ */}
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
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
        const secs    = Number(act.totalTime || act.duration || act.movingTime || act.elapsed_time || act.elapsedTime || act.totalTimerTime || 0);
        const dur     = fmtDuration(secs);
        const dist    = Number(act.distance || act.totalDistance || 0);
        const distStr = dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : dist > 0 ? `${Math.round(dist)} m` : null;
        const pwr     = Number(act.avgPower || act.average_watts || 0);

        return (
          <button
            key={id || `act-${i}`}
            onClick={() => onOpenActivity(act)}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(.98)'; }}
            onMouseUp={(e)   => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e)=> { e.currentTarget.style.transform = 'scale(1)'; }}
            onTouchStart={(e)=> { e.currentTarget.style.transform = 'scale(.98)'; }}
            onTouchEnd={(e)  => { e.currentTarget.style.transform = 'scale(1)'; }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '10px 11px', borderRadius: 13,
              background: 'rgba(255,255,255,.55)',
              border: '1px solid rgba(255,255,255,.6)',
              borderLeft: `3px solid ${color}`,
              marginBottom: i < unclaimedActs.length - 1 ? 6 : 0,
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              animation: `ndFadeIn .35s ${(dayPlanned.length + i) * 50}ms cubic-bezier(.22,1,.36,1) both`,
              transition: 'transform .15s ease',
            }}
          >
            <SportIcon sport={sport} size={22} />
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

      {/* Empty — moon icon for rest day */}
      {!hasContent && (
        <div style={{
          textAlign: 'center', padding: '12px 0', color: '#9CA3AF', fontSize: 12, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
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
  onPlannedWorkoutChanged,        // (updatedOrDeletedId) => void — for parent to refresh
  athleteId       = null,         // selected athlete id (coach view) or own id
}) {
  const navigate      = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const today         = new Date();
  const [selectedDate, setSelectedDate] = useState(today);

  // Key for animation trigger — changes on date select
  const [animKey, setAnimKey] = useState(0);

  const handleSelectDate = (d) => {
    setSelectedDate(d);
    setAnimKey(k => k + 1);
  };

  // ── Scroll-snap on the NativeLayout scroll container ──────────────────────
  // Walks up the DOM from our <div ref={pageRef}> to find the scrollable parent
  // and applies `scroll-snap-type: y proximity`. Restores on unmount so the
  // setting doesn't leak to other pages.
  const pageRef = useRef(null);
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = window.getComputedStyle(node);
      const oy = cs.overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      node = node.parentElement;
    }
    if (!node || node === document.body) return;
    const prev = {
      snapType:    node.style.scrollSnapType,
      padding:     node.style.scrollPaddingTop,
      behavior:    node.style.scrollBehavior,
    };
    node.style.scrollSnapType    = 'y proximity';
    node.style.scrollPaddingTop  = '8px';
    node.style.scrollBehavior    = 'smooth';
    // Always start the dashboard scrolled to the very top so the greeting is visible
    node.scrollTop = 0;
    return () => {
      node.style.scrollSnapType    = prev.snapType    || '';
      node.style.scrollPaddingTop  = prev.padding     || '';
      node.style.scrollBehavior    = prev.behavior    || '';
    };
  }, []);

  // Snap style applied to each card so it stops at viewport top
  const snapStyle = {
    scrollSnapAlign: 'start',
    scrollSnapStop:  'normal',
  };

  // Build the canonical URL just like TrainingTable does
  // ── Activity full modal ─────────────────────────────────────────────────
  // Tap on a training row → opens the same rich mobile modal that CalendarView
  // uses (Summary / Laps / Edit tabs, stats grid, route map, training chart,
  // notes, lactate button). Falls back to navigation when called with a raw id.
  const [activityModal, setActivityModal] = useState(null); // { activity, plannedWorkout }
  const openActivity = (actOrId, plannedWorkout = null) => {
    if (typeof actOrId === 'string') {
      navigate(`/training-calendar/${encodeURIComponent(actOrId)}`);
      return;
    }
    if (actOrId) setActivityModal({ activity: actOrId, plannedWorkout });
  };
  const closeActivityModal = () => setActivityModal(null);

  // Deep-link from a push notification: `?openActivity=<prefix>-<id>` opens
  // the activity in the modal so the user can immediately add lactate.
  // Looks the activity up in the loaded `activities` list and waits until it
  // arrives if needed (covers the cold-start case after a notification tap).
  useEffect(() => {
    const param = searchParams.get('openActivity');
    if (!param) return;

    // Expect format `<prefix>-<id>` — but accept a bare id too
    const dashIdx = param.indexOf('-');
    const prefix  = dashIdx > 0 ? param.slice(0, dashIdx) : null;
    const rawId   = dashIdx > 0 ? param.slice(dashIdx + 1) : param;

    const found = activities.find(a => {
      if (prefix === 'strava' && (String(a.stravaId) === rawId || String(a.id) === rawId)) return true;
      if (prefix === 'fit'    && String(a._id) === rawId) return true;
      if (prefix === 'regular'&& String(a._id) === rawId) return true;
      if (String(a._id) === rawId || String(a.id) === rawId || String(a.stravaId) === rawId) return true;
      return false;
    });

    if (found) {
      setActivityModal({ activity: found, plannedWorkout: null });
      // Strip the param so refreshing or back-navigation doesn't re-open the modal
      const next = new URLSearchParams(searchParams);
      next.delete('openActivity');
      setSearchParams(next, { replace: true });
    }
    // If not found yet (activities still loading), the effect will re-run when
    // activities update because `activities` is a dependency.
  }, [searchParams, activities, setSearchParams]);

  // ── Planned-workout editor (bottom sheet) ────────────────────────────────
  const [editingPlanned, setEditingPlanned] = useState(null); // { pw, linkedAct }
  const openPlanned = (pw, linkedAct) => setEditingPlanned({ pw, linkedAct });
  const closePlanned = () => setEditingPlanned(null);

  return (
    <>
      {/* Inject keyframes once (shared across all native dashboard components) */}
      <style>{SLIDE_IN_STYLE + NATIVE_DASHBOARD_KEYFRAMES}</style>

      <div ref={pageRef} style={styles.page}>
        {/* ── Greeting — title slides in, wave-icon animates on cycle ── */}
        <div style={{ ...styles.greetingRow, ...cardEntry(0), ...snapStyle }}>
          <div style={styles.greetingText}>
            {getGreeting()}, {user?.firstName || user?.name?.split(' ')[0] || 'Athlete'}{' '}
            {/* Hand-wave SVG icon — replaces 👋 emoji */}
            <span style={{
              display: 'inline-flex',
              verticalAlign: '-0.18em',
              transformOrigin: '50% 70%',
              animation: 'ndWave 1.6s 0.6s ease-in-out 2',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5E6590" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 11V5.5a1.5 1.5 0 0 0-3 0V13" />
                <path d="M11 13V3.5a1.5 1.5 0 0 0-3 0v10.5" />
                <path d="M8 13.5V7.5a1.5 1.5 0 0 0-3 0v8c0 4.5 3 8 7.5 8a8 8 0 0 0 8-8V9a1.5 1.5 0 0 0-3 0v3" />
                <path d="M14 13V4.5a1.5 1.5 0 1 1 3 0V13" />
              </svg>
            </span>
          </div>
          <div style={styles.dateText}>
            {today.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        {/* ── Cards (staggered fade-in) ── */}
        <div style={styles.body}>

          {/* 1 · Week strip */}
          <div style={{ ...cardEntry(1), ...snapStyle }}>
            <WeekStrip
              activities={activities}
              plannedWorkouts={plannedWorkouts}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
            />
          </div>

          {/* 2 · Day activities — re-animates on date change */}
          <div style={snapStyle}>
            <AnimatedCard animKey={animKey}>
              <DayActivitiesCard
                date={selectedDate}
                activities={activities}
                plannedWorkouts={plannedWorkouts}
                onOpenActivity={openActivity}
                onOpenPlanned={(pw, linkedAct) => {
                  // If the planned workout is paired with a completed activity,
                  // open the rich activity modal (with planned context inside).
                  // Otherwise open the planned-only editor sheet.
                  if (linkedAct) openActivity(linkedAct, pw);
                  else openPlanned(pw, linkedAct);
                }}
              />
            </AnimatedCard>
          </div>

          {/* 3 · Status hero */}
          <div style={{ ...cardEntry(3), ...snapStyle }}>
            <StatusHeroCard
              todayMetrics={todayMetrics}
              sparklineData={sparklineData}
              loading={loading}
            />
          </div>

          {/* 4 · Weekly summary */}
          <div style={{ ...cardEntry(4), ...snapStyle }}>
            <WeeklySummaryCard
              activities={activities}
              plannedWorkouts={plannedWorkouts}
              sparklineData={sparklineData}
              tests={tests}
            />
          </div>

          {/* 5 · Zone distribution */}
          <div style={{ ...cardEntry(5), ...snapStyle }}>
            <ZoneDistCard activities={activities} tests={tests} />
          </div>

          {/* 6 · Last lab test */}
          <div style={{ ...cardEntry(6), ...snapStyle }}>
            <LastTestCard tests={tests} />
          </div>

          <div style={{ height: 16 }} />
        </div>
      </div>

      {/* Bottom-sheet editor for planned-only workouts (no linked activity yet) */}
      {editingPlanned && (
        <PlannedWorkoutEditor
          plannedWorkout={editingPlanned.pw}
          linkedActivity={editingPlanned.linkedAct}
          athleteId={athleteId || user?._id || user?.id}
          onClose={closePlanned}
          onOpenLinkedActivity={(act) => { closePlanned(); openActivity(act); }}
          onSaved={(updated) => {
            onPlannedWorkoutChanged && onPlannedWorkoutChanged({ type: 'updated', planned: updated });
          }}
          onDeleted={(id) => {
            onPlannedWorkoutChanged && onPlannedWorkoutChanged({ type: 'deleted', id });
          }}
        />
      )}

      {/* Rich activity modal — lazy-loaded (lives in CalendarView, ~4k lines)
          so the dashboard chunk stays small. Tabs: Summary / Laps / Edit. */}
      {activityModal && (
        <Suspense fallback={null}>
        <ActivityFullModal
          activity={activityModal.activity}
          plannedWorkout={activityModal.plannedWorkout}
          athleteId={athleteId || user?._id || user?.id}
          onClose={closeActivityModal}
          onPlannedSaved={(saved) => {
            setActivityModal(prev => prev ? { ...prev, plannedWorkout: saved } : prev);
            onPlannedWorkoutChanged && onPlannedWorkoutChanged({ type: 'updated', planned: saved });
          }}
          // Quick lactate add (no-op stub here — modal also has its own inline form)
          onAddLactate={() => { /* opens lactate flow inside the modal */ }}
          // "Open in full editor" → fall back to FitAnalysisPage if user wants more
          onOpenFull={() => {
            const a = activityModal.activity;
            closeActivityModal();
            if (a.type === 'fit' && a._id) {
              navigate(`/training-calendar/${encodeURIComponent(`fit-${a._id}`)}`);
            } else if ((a.type === 'strava' || a.stravaId) && (a.stravaId || a.id)) {
              navigate(`/training-calendar/${encodeURIComponent(`strava-${a.stravaId || a.id}`)}`);
            } else if (a.type === 'regular' && a._id) {
              navigate(`/training-calendar/${encodeURIComponent(`regular-${a._id}`)}`);
            } else if (a._id) {
              navigate(`/training-calendar/${encodeURIComponent(`training-${a._id}`)}`);
            }
          }}
        />
        </Suspense>
      )}
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
    // Extra top padding so the greeting clears the NativeLayout top bar
    padding: '20px 18px 6px',
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
