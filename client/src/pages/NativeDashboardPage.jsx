import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import ReactDOM from 'react-dom';
import SharedSportIcon, { resolveSportKey, SPORT_ICON_COLORS } from '../components/shared/SportIcon';
import { useNavigate, useSearchParams } from 'react-router-dom';

import StatusHeroCard    from '../components/NativeDashboard/StatusHeroCard';
import WeekStrip         from '../components/NativeDashboard/WeekStrip';
import WeeklySummaryCard from '../components/NativeDashboard/WeeklySummaryCard';
import WeeklySummaryCarousel from '../components/NativeDashboard/WeeklySummaryCarousel';
import LastTestCard      from '../components/NativeDashboard/LastTestCard';
import ZoneDistCard      from '../components/NativeDashboard/ZoneDistCard';
import AppleHealthWellnessCard from '../components/NativeDashboard/AppleHealthWellnessCard';
import TrainingInsightsCard from '../components/DashboardPage/TrainingInsightsCard';
import RaceCountdownCard from '../components/DashboardPage/RaceCountdownCard';
import PostRaceFeedbackCard from '../components/DashboardPage/PostRaceFeedbackCard';
import PlannedWorkoutEditor from '../components/NativeDashboard/PlannedWorkoutEditor';
import StravaConnectModal from '../components/NativeDashboard/StravaConnectModal';
import PremiumLock from '../components/PremiumLock';
import { NATIVE_DASHBOARD_KEYFRAMES, cardEntry } from '../components/NativeDashboard/animations';
import TrainingForm from '../components/TrainingForm';
import { getStravaActivityDetail, addTraining, updateTraining, updateStravaLactateValues } from '../services/api';
import { useCategories, hexToRgba } from '../context/CategoryContext';
import { dayThemePresetColor, periodColor, buildPeriodsByDate } from '../utils/calendarThemes';
import { buildActivityMatcher, metricsPatchFromDetail } from '../utils/activityEventPatches';
import { mergeProfileZones } from '../utils/inferThresholdsFromActivities';
import { resolveActivityTss } from '../utils/computeTss';
import { activityOnLocalDay } from '../utils/formFitnessFromActivities';
import { useAuth } from '../context/AuthProvider';
import { compareActivitiesChronologically, buildChronologicalDayItems, pairPlannedWithActivities, dedupeCalendarActivities } from '../utils/calendarDayOrdering';
import { findCompliance, outlineBorder, planSportColor, SPORT_PLAN_COLORS } from '../utils/planCompliance';
import { plannedDistanceMetres, formatPlannedDistanceMetres } from '../utils/plannedWorkoutDistance';
import {
  activityPaceOrPowerDisplay,
  formatActivityDistance,
} from '../utils/unitsConverter';

// Lazy-load ActivityFullModal: it lives in CalendarView (4k+ lines) and pulling
// it eagerly into the dashboard chunk caused a webpack-split circular dep that
// surfaced as "Cannot access 'ae' before initialization" at runtime.
const ActivityFullModal = lazy(() =>
  import('../components/Calendar/CalendarView').then(m => ({ default: m.ActivityFullModal }))
);
const RaceDetailModal = lazy(() => import('../components/Calendar/RaceDetailModal'));
// Same lazy strategy for the day-theme editor sheet (shared with the calendar).
const DayPlanEditSheet = lazy(() =>
  import('../components/Calendar/CalendarView').then(m => ({ default: m.DayPlanEditSheet }))
);
const PeriodEditSheet = lazy(() =>
  import('../components/Calendar/CalendarView').then(m => ({ default: m.PeriodEditSheet }))
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

function fmtDuration(secs) {
  if (!secs) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Pace for run/swim, watts for bike — respects user unit preference. */
function activityPaceOrPowerStat(act, user) {
  return activityPaceOrPowerDisplay(act, user);
}

// Sport colours — mirrors CalendarView SPORT_COLORS_CELL
const SPORT_COLORS = {
  ...SPORT_ICON_COLORS,
  other: '#8b5cf6',
};

const normSport = resolveSportKey;

function getSportColor(sport) {
  return SPORT_COLORS[normSport(sport)] || SPORT_COLORS.other;
}

function SportIcon({ sport, size = 22 }) {
  // size is always 22 in practice; map to closest Tailwind size
  const cls = size <= 16 ? 'w-4 h-4' : size <= 20 ? 'w-5 h-5' : 'w-[22px] h-[22px]';
  return <SharedSportIcon sport={sport} className={cls} />;
}

// ─── Planned workout mini step-chart (mirrors WeeklyCalendar PlanMiniChart) ───
function PlanMiniChart({ steps, color, width = 88, height = 16 }) {
  if (!steps?.length) return null;
  const STEP_COLORS = { warmup: '#fbbf24', work: '#767EB5', recovery: '#6ee7b7', cooldown: '#38bdf8', rest: '#d1d5db' };
  // Expand groups / repeats into a flat list of steps
  const expanded = [];
  const visited = new Set();
  steps.forEach(s => {
    if (!s.groupId) { expanded.push(s); return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const reps = (group.find(x => x.isGroupHeader)?.groupRepeat) || 1;
    // Header IS the work step — include it; sort header first so each rep renders [work, recovery].
    const ordered = [...group.filter(x => x.isGroupHeader), ...group.filter(x => !x.isGroupHeader)];
    for (let r = 0; r < reps; r++) ordered.forEach(gs => expanded.push(gs));
  });
  const total = expanded.reduce((s, st) => s + (st.durationSeconds || 30), 0);
  if (!total) return null;
  const FLOOR = 0.12;
  let cx = 0;
  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      {expanded.map((step, i) => {
        const w = Math.max(1, ((step.durationSeconds || 30) / total) * width);
        const intensity = step.stepType === 'work' ? 1 : step.stepType === 'warmup' ? 0.55 : step.stepType === 'cooldown' ? 0.4 : step.stepType === 'recovery' ? 0.3 : 0.15;
        const bh = Math.max(FLOOR * height, intensity * height);
        const bw = Math.max(1, w - 0.5);
        const fill = STEP_COLORS[step.stepType] || color || '#767EB5';
        const sx = cx; cx += w;
        if (step.isRamp && step.stepType === 'warmup') {
          return <polygon key={i} points={`${sx},${height} ${sx+bw},${height-bh} ${sx+bw},${height}`} fill={fill} opacity={0.85} />;
        } else if (step.isRamp && step.stepType === 'cooldown') {
          return <polygon key={i} points={`${sx},${height-bh} ${sx},${height} ${sx+bw},${height}`} fill={fill} opacity={0.85} />;
        }
        return <rect key={i} x={sx} y={height - bh} width={bw} height={bh} fill={fill} rx={1} opacity={0.85} />;
      })}
    </svg>
  );
}

// ─── Animated wrapper ─────────────────────────────────────────────────────────
// CSS keyframe animation — no framer-motion dependency needed
const SLIDE_IN_STYLE = `
@keyframes ndSlideIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ndSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
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
function DayActivitiesCard({ date, activities, plannedWorkouts, dayPlans = [], periods = [], races = [], onEditTheme = null, onEditPeriod = null, onOpenActivity, onOpenPlanned, onPlanWorkout, onOpenRace = null, userProfile = null }) {
  const { user } = useAuth() || {};
  const profile = mergeProfileZones(userProfile, user) || userProfile || user;
  const dateStr = toLocalDateStr(date);
  const today   = new Date();
  const isToday = isSameLocalDay(date, today);

  const { getCategory } = useCategories();
  const dayTheme = (dayPlans || []).find(p => p?.date === dateStr) || null;
  const dayPeriods = buildPeriodsByDate(periods).get(dateStr) || [];
  const catStyle = (catId) => {
    const cat = getCategory(catId);
    if (!cat) return null;
    return {
      background: hexToRgba(cat.color, 0.14),
      color: cat.color,
      border: `1px solid ${hexToRgba(cat.color, 0.32)}`,
    };
  };
  const catLabel = (catId) => {
    const cat = getCategory(catId);
    return cat ? cat.label : (catId ? catId.charAt(0).toUpperCase() + catId.slice(1) : null);
  };

  // Activities and planned for this day — sorted chronologically (earliest
  // first) so the pairing always claims the FIRST activity of the day for
  // that sport, not whichever happened to arrive first from the API.
  const dayActs = dedupeCalendarActivities(
    activities.filter(a => activityOnLocalDay(a, date)),
  ).sort(compareActivitiesChronologically);
  const dayPlanned = plannedWorkouts.filter(p =>
    String(p.date || '').slice(0, 10) === dateStr
  );

  const { items: dayItems } = buildChronologicalDayItems(
    dayPlanned,
    dayActs,
    pairPlannedWithActivities,
  );

  // Races on this day — shown as a flag card with the saved post-race
  // reflection (feeling / RPE / note) once the athlete submits it.
  const dayRaces = (races || []).filter((r) => {
    const d = r?.date ? new Date(r.date) : null;
    return d && !Number.isNaN(d.getTime()) && toLocalDateStr(d) === dateStr;
  });
  const FEELING_DISPLAY = {
    great: { emoji: '🔥', label: 'Great' },
    good: { emoji: '👍', label: 'Good' },
    ok: { emoji: '😐', label: 'OK' },
    tough: { emoji: '😓', label: 'Tough' },
    rough: { emoji: '😞', label: 'Bad' },
  };

  const hasContent = dayActs.length > 0 || dayPlanned.length > 0 || dayRaces.length > 0;
  const label = isToday
    ? 'Today'
    : date.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <div style={cardStyle}>
      {/* Header — title on the left, session count + plan-workout shortcut
          on the right. The "+" used to live in the WeekStrip but the tap
          target there was tiny and stuck inside a nested-button anti-
          pattern; here it's a full pill button next to the count, which
          reads as the obvious place to add a workout for this day. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hasContent ? 10 : 4, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#0A0E1A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {label}
          </span>
          {onEditTheme && dayTheme && (dayTheme.title || dayTheme.category) && (
              <button
                type="button"
                onClick={() => onEditTheme(date)}
                title={dayTheme.notes || dayTheme.title || catLabel(dayTheme.category)}
                style={{
                  ...((() => {
                    const tc = dayThemePresetColor(dayTheme.title);
                    if (tc) return { background: hexToRgba(tc, 0.14), color: tc, border: `1px solid ${hexToRgba(tc, 0.32)}` };
                    return catStyle(dayTheme.category) || {
                      background: 'rgba(94,101,144,0.12)', color: '#5E6590',
                      border: '1px solid rgba(94,101,144,0.25)',
                    };
                  })()),
                  fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
                  padding: '3px 7px', borderRadius: 6, lineHeight: 1,
                  maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >{dayTheme.title || catLabel(dayTheme.category)}</button>
          )}
          {/* Period chips (tap to edit) + add-period affordance */}
          {onEditPeriod && dayPeriods.map((p) => (
            <button
              key={p._id}
              type="button"
              onClick={() => onEditPeriod({ period: p })}
              title={`${p.type}${p.notes ? ` — ${p.notes}` : ''}`}
              style={{
                fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
                padding: '3px 7px', borderRadius: 6, lineHeight: 1,
                maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                background: hexToRgba(periodColor(p), 0.14), color: periodColor(p),
                border: `1px solid ${hexToRgba(periodColor(p), 0.32)}`,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >{(p.notes && p.notes.trim()) || p.type}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dayActs.length > 0 && (
            <span style={{ fontSize: 10.5, color: '#6B7280', fontWeight: 600 }}>
              {dayActs.length} session{dayActs.length !== 1 ? 's' : ''}
            </span>
          )}
          {onPlanWorkout && (
            <button
              type="button"
              onClick={() => onPlanWorkout(date)}
              aria-label="Plan workout for this day"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 9px', borderRadius: 999,
                background: 'rgba(94,101,144,0.12)',
                color: '#5E6590',
                border: '1px solid rgba(94,101,144,0.22)',
                fontSize: 11, fontWeight: 800, lineHeight: 1,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1, fontWeight: 800 }}>+</span>
              <span>Plan</span>
            </button>
          )}
        </div>
      </div>

      {dayRaces.map((race) => {
        const fb = race.postRaceFeedback && (race.postRaceFeedback.submittedAt || race.postRaceFeedback.rpe != null || race.postRaceFeedback.feeling)
          ? race.postRaceFeedback : null;
        const feel = fb?.feeling ? FEELING_DISPLAY[fb.feeling] || { emoji: '', label: fb.feeling } : null;
        const isPast = new Date(race.date) < new Date();
        // Same ribbon style as the big calendar's race badge (priority colour).
        const RACE_PRIORITY_COLOR = { A: '#dc2626', B: '#ea580c', C: '#d97706' };
        const color = RACE_PRIORITY_COLOR[race.priority] || '#dc2626';
        return (
          <button
            key={`race-${race._id}`}
            type="button"
            onClick={() => onOpenRace && onOpenRace(race)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              marginBottom: 6, padding: 0, border: 'none', background: 'transparent',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              fontFamily: 'inherit',
            }}
          >
            {/* Calendar-style ribbon on top */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: color, color: '#fff',
              borderRadius: fb || isPast ? '12px 12px 0 0' : 12,
              padding: '8px 12px',
            }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>🚩</span>
              <span style={{
                fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              }}>
                {race.name}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 800, background: 'rgba(255,255,255,0.25)',
                borderRadius: 6, padding: '2px 6px', lineHeight: 1, flexShrink: 0,
              }}>
                {race.priority || 'A'}
              </span>
            </div>
            {/* Reflection summary under the ribbon */}
            {(fb || isPast) && (
              <div style={{
                padding: '8px 12px',
                borderRadius: '0 0 12px 12px',
                background: hexToRgba(color, 0.08),
                border: `1px solid ${hexToRgba(color, 0.25)}`,
                borderTop: 'none',
              }}>
                {fb ? (
                  <>
                    {(fb.finishTime || fb.result || fb.distanceKm != null) && (
                      <div style={{ fontSize: 12, color: '#7c2d12', fontWeight: 800, marginBottom: 2 }}>
                        🏁 {[fb.finishTime, fb.distanceKm != null ? `${fb.distanceKm} km` : null, fb.result].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#7c2d12', fontWeight: 600 }}>
                      {feel && <span>{feel.emoji} {feel.label}</span>}
                      {fb.rpe != null && <span>· RPE {fb.rpe}/10</span>}
                    </div>
                    {fb.notes && (
                      <div style={{ marginTop: 3, fontSize: 12, color: '#78350f', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                        “{fb.notes}”
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: '#b45309' }}>
                    No race reflection yet — add it from the dashboard card.
                  </div>
                )}
              </div>
            )}
          </button>
        );
      })}

      {dayItems.map((item, pi) => {
        if (item.kind === 'activity') {
          const act = item.act;
          const id = act._id || act.id;
          const sport = act.sport || '';
          const color = getSportColor(sport);
          const title = act.title || act.name || act.titleManual || 'Training';
          const secs = Number(act.totalTime || act.duration || act.movingTime || act.elapsed_time || act.elapsedTime || act.totalTimerTime || 0);
          const dur = fmtDuration(secs);
          const dist = Number(act.distance || act.totalDistance || 0);
          const distStr = formatActivityDistance(dist, user);
          const paceOrPowerStr = activityPaceOrPowerStat(act, user);
          const tssVal = resolveActivityTss(act, profile, { user });
          const tssStr = tssVal > 0 ? `${Math.round(tssVal)} TSS` : null;

          return (
            <button
              key={id || `act-${pi}`}
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
                marginBottom: pi < dayItems.length - 1 ? 6 : 0,
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                animation: `ndFadeIn .35s ${pi * 50}ms cubic-bezier(.22,1,.36,1) both`,
                transition: 'transform .15s ease',
              }}
            >
              <SportIcon sport={sport} size={22} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0A0E1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {title}
                  </div>
                  {act.category && catStyle(act.category) && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.04em', padding: '2px 6px', borderRadius: 6,
                      flexShrink: 0, whiteSpace: 'nowrap',
                      ...catStyle(act.category),
                    }}>
                      {catLabel(act.category)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {[dur, distStr, paceOrPowerStr, tssStr].filter(Boolean).join(' · ') || 'Completed'}
                </div>
              </div>
              <span style={{ fontSize: 13, color: '#9CA3AF', flexShrink: 0 }}>›</span>
            </button>
          );
        }

        const pw = item.pw;
        const linkedAct = item.act;
        const isPaired  = !!linkedAct;
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const pwDay = new Date(pw.date);
        pwDay.setHours(0, 0, 0, 0);
        const isMissed  = !isPaired && pwDay < todayMidnight;

        const pwSportKey = (pw.sport || linkedAct?.sport || 'bike').toLowerCase();
        const planColor = SPORT_PLAN_COLORS[pwSportKey] || planSportColor(pwSportKey);
        const sport     = pw.sport || linkedAct?.sport || '';
        const color     = getSportColor(sport);
        const pwTitle   = pw.title || pw.name || 'Planned workout';

        const compliance = linkedAct ? findCompliance(pw, [linkedAct]) : null;
        const cc = compliance || (isPaired ? { color: '#22c55e', bg: '#f0fdf4', label: 'Done' } : null);

        const pwSecs = pw.plannedDuration || 0;
        const actSecs = linkedAct
          ? Number(linkedAct.totalTime || linkedAct.duration || linkedAct.movingTime || linkedAct.elapsed_time || linkedAct.elapsedTime || linkedAct.totalTimerTime || 0)
          : 0;

        const isPurelyPlanned = !isPaired && !isMissed;
        const bg = isPaired && cc ? cc.bg : isMissed ? '#fef2f2' : color + '0d';
        const borderColor = isPaired && cc ? cc.color : isMissed ? '#fecaca' : color + '55';
        const borderStyle = isPurelyPlanned ? 'dashed' : 'solid';
        const titleC = isPaired ? planColor : isMissed ? '#991b1b' : color;
        const hasSteps = isPurelyPlanned && Array.isArray(pw.steps) && pw.steps.length > 0;

        const dur     = fmtDuration(pwSecs);
        const actDur  = linkedAct ? fmtDuration(actSecs) : null;
        const pwDistStr = formatPlannedDistanceMetres(plannedDistanceMetres(pw), sport, user);
        const dist    = linkedAct ? Number(linkedAct.distance || linkedAct.totalDistance || 0) : 0;
        const distStr = formatActivityDistance(dist, user);
        const actTssVal = linkedAct ? resolveActivityTss(linkedAct, profile, { user }) : 0;
        const actTssStr = actTssVal > 0 ? `${Math.round(actTssVal)} TSS` : null;
        const paceStr = linkedAct ? activityPaceOrPowerStat(linkedAct, user) : null;
        const pairedStats = isPaired
          ? [actDur, distStr, paceStr, actTssStr].filter(Boolean).join(' · ')
          : null;

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
              flexDirection: 'column',
              gap: 6,
              width: '100%',
              padding: '10px 11px',
              borderRadius: 13,
              background: bg,
              ...(isPaired && cc
                ? outlineBorder({ color: cc.color, leftColor: planColor, leftWidth: 3 })
                : {
                    border: `1px ${borderStyle} ${borderColor}`,
                    borderLeft: `3px solid ${isMissed ? '#ef4444' : color}`,
                  }),
              marginBottom: pi < dayItems.length - 1 ? 6 : 0,
              cursor: linkedAct ? 'pointer' : 'default',
              textAlign: 'left',
              fontFamily: 'inherit',
              animation: `ndFadeIn .35s ${pi * 50}ms cubic-bezier(.22,1,.36,1) both`,
              transition: 'transform .15s ease',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {isPaired && cc ? (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: cc.color }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: titleC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {pwTitle}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: cc.color, flexShrink: 0 }}>
                    {cc.label}
                  </span>
                </>
              ) : (
                <>
                  <SportIcon sport={sport} size={22} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: titleC, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {pwTitle}
                      </div>
                      {hasSteps && (
                        <PlanMiniChart steps={pw.steps} color={color} width={72} height={14} />
                      )}
                      {(linkedAct?.category || pw.category) && catStyle(linkedAct?.category || pw.category) && !hasSteps && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.04em', padding: '2px 6px', borderRadius: 6,
                          flexShrink: 0, whiteSpace: 'nowrap',
                          ...catStyle(linkedAct?.category || pw.category),
                        }}>
                          {catLabel(linkedAct?.category || pw.category)}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
              {linkedAct && isPaired && cc && (
                <span style={{ fontSize: 13, color: '#9CA3AF', flexShrink: 0 }}>›</span>
              )}
            </div>

            {isPaired && pairedStats && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, paddingLeft: 0 }}>
                <SportIcon sport={sport} size={18} />
                <div style={{ fontSize: 12, color: '#4B5563', fontWeight: 600, fontVariantNumeric: 'tabular-nums', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pairedStats}
                </div>
                {(linkedAct?.category || pw.category) && catStyle(linkedAct?.category || pw.category) && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.04em', padding: '2px 6px', borderRadius: 6,
                    flexShrink: 0, whiteSpace: 'nowrap',
                    ...catStyle(linkedAct?.category || pw.category),
                  }}>
                    {catLabel(linkedAct?.category || pw.category)}
                  </span>
                )}
              </div>
            )}

            {!isPaired && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%' }}>
                {!isPaired && (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {hasSteps && (linkedAct?.category || pw.category) && catStyle(linkedAct?.category || pw.category) && (
                      <div style={{ marginTop: 2 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.04em', padding: '2px 6px', borderRadius: 6,
                          ...catStyle(linkedAct?.category || pw.category),
                        }}>
                          {catLabel(linkedAct?.category || pw.category)}
                        </span>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: isPurelyPlanned ? color + 'cc' : '#6B7280', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                      {[
                        !isPaired && dur ? (isPurelyPlanned ? dur : `Plan: ${dur}`) : null,
                        !isPaired && pwDistStr ? pwDistStr : null,
                        !isPaired && pw.targetTss > 0 ? `${pw.targetTss} TSS` : null,
                      ].filter(Boolean).join(' · ') || null}
                    </div>
                  </div>
                )}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  {isPurelyPlanned && (
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
                </div>
              </div>
            )}
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
  metricsLoading  = false,
  user            = null,
  userProfile     = null,
  onPlannedWorkoutChanged,        // (updatedOrDeletedId) => void — for parent to refresh
  athleteId       = null,         // selected athlete id (coach view) or own id
  stravaConnected = false,        // gates the manual-sync refresh button
  onRequestStravaSync = null,     // () => Promise — full dashboard refresh (+ Strava when connected)
  onPlanWorkout = null,           // (date) => void — opens planned-workout form for that date
  dayPlans = [],                  // [{ date, title, category, notes }] — day-level themes
  onDayPlanSave = null,           // (dateStr, payload) => Promise — upsert a day theme
  onDayPlanDelete = null,         // (dateStr) => Promise — remove a day theme
  periods = [],                   // [{ _id, startDate, endDate, type, color, notes }]
  onPeriodSave = null,            // (payload) => Promise — upsert a period
  onPeriodDelete = null,          // (periodId) => Promise — remove a period
  onTaperApplied = null,          // () => void — refresh plans after taper apply
}) {
  const navigate      = useNavigate();
  const fitnessProfile = useMemo(
    () => mergeProfileZones(userProfile, user) || userProfile || user,
    [userProfile, user],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const today         = new Date();
  const [selectedDate, setSelectedDate] = useState(today);

  // Track viewport width so the phone-first dashboard centres into a
  // comfortable column on iPad instead of stretching its cards (and the
  // fixed-viewBox charts inside them) across the full tablet width.
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 390));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  // ≥700 px (iPad portrait and up): cap the content column and centre it so the
  // cards keep phone-like proportions and the charts don't flatten out.
  const isTablet = vw >= 700;
  const bodyResponsive = isTablet
    ? { width: '100%', maxWidth: 720, margin: '0 auto', padding: '8px 20px 0', boxSizing: 'border-box' }
    : null;

  // Key for animation trigger — changes on date select
  const [animKey, setAnimKey] = useState(0);
  // Day-theme editor: holds the YYYY-MM-DD string of the day being edited.
  const [themeEditDate, setThemeEditDate] = useState(null);
  // Period editor: { period } to edit an existing one, or { defaultDate } to create.
  const [periodEdit, setPeriodEdit] = useState(null);
  // Strava connect prompt — shown when not connected (re-prompts after a week
  // if dismissed, so it nudges without nagging every launch).
  const [showStravaConnect, setShowStravaConnect] = useState(false);
  useEffect(() => {
    if (stravaConnected) { setShowStravaConnect(false); return; }
    let dismissedAt = 0;
    try { dismissedAt = Number(localStorage.getItem('stravaConnectDismissedAt') || 0); } catch (_) {}
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    if (!dismissedAt || (Date.now() - dismissedAt) > WEEK) {
      const t = setTimeout(() => setShowStravaConnect(true), 600); // let the dashboard paint first
      return () => clearTimeout(t);
    }
  }, [stravaConnected]);
  const dismissStravaConnect = useCallback(() => {
    try { localStorage.setItem('stravaConnectDismissedAt', String(Date.now())); } catch (_) {}
    setShowStravaConnect(false);
  }, []);

  const handleSelectDate = (d) => {
    setSelectedDate(d);
    setAnimKey(k => k + 1);
  };

  // ── Scroll-snap on the NativeLayout scroll container ──────────────────────
  // Walks up the DOM from our <div ref={pageRef}> to find the scrollable parent
  // and applies `scroll-snap-type: y proximity`. Restores on unmount so the
  // setting doesn't leak to other pages.
  const pageRef = useRef(null);
  const statusHeroRef = useRef(null);
  const scrollContainerRef = useRef(null); // kept so the tab-reclicked handler can reach it
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
    scrollContainerRef.current = node;
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
      scrollContainerRef.current   = null;
    };
  }, []);

  // ── Tap home tab while already on home → scroll back to top ───────────────
  useEffect(() => {
    const onReclicked = (e) => {
      if (e.detail?.key !== 'dashboard') return;
      const node = scrollContainerRef.current;
      if (node) {
        node.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('nl-tab-reclicked', onReclicked);
    return () => window.removeEventListener('nl-tab-reclicked', onReclicked);
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

  // Keep the open modal's activity snapshot in sync after Completed edits.
  useEffect(() => {
    const onMetrics = (e) => {
      const detail = e?.detail || {};
      if (!detail.id) return;
      const matches = buildActivityMatcher(detail.id);
      const patch = metricsPatchFromDetail(detail);
      if (!Object.keys(patch).length) return;
      setActivityModal((prev) => {
        if (!prev?.activity || !matches(prev.activity)) return prev;
        return { ...prev, activity: { ...prev.activity, ...patch } };
      });
    };
    const onPlanned = (e) => {
      const planned = e?.detail?.planned;
      if (!planned?._id) return;
      setActivityModal((prev) => {
        if (!prev?.plannedWorkout || String(prev.plannedWorkout._id) !== String(planned._id)) return prev;
        return { ...prev, plannedWorkout: planned };
      });
      onPlannedWorkoutChanged && onPlannedWorkoutChanged({ type: 'updated', planned });
    };
    window.addEventListener('activityMetricsUpdated', onMetrics);
    window.addEventListener('plannedWorkoutUpdated', onPlanned);
    return () => {
      window.removeEventListener('activityMetricsUpdated', onMetrics);
      window.removeEventListener('plannedWorkoutUpdated', onPlanned);
    };
  }, [onPlannedWorkoutChanged]);

  // Deep-link from a push notification or in-app toast: `?openActivity=<id>`
  // opens the activity modal. Waits until activities load on cold start.
  const openActivityById = useCallback((param) => {
    if (!param) return;
    const matches = buildActivityMatcher(param);
    const found = activities.find(matches);
    if (found) {
      setActivityModal({ activity: found, plannedWorkout: null });
      return true;
    }
    return false;
  }, [activities]);

  useEffect(() => {
    const param = searchParams.get('openActivity');
    if (!param) return;
    if (openActivityById(param)) {
      const next = new URLSearchParams(searchParams);
      next.delete('openActivity');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, openActivityById, setSearchParams]);

  useEffect(() => {
    const onOpenRequest = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      if (openActivityById(id)) return;
      const next = new URLSearchParams(searchParams);
      next.set('openActivity', id);
      setSearchParams(next, { replace: true });
    };
    window.addEventListener('openActivityRequest', onOpenRequest);
    return () => window.removeEventListener('openActivityRequest', onOpenRequest);
  }, [openActivityById, searchParams, setSearchParams]);

  useEffect(() => {
    const onOpenPlannedRequest = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      const pw = (plannedWorkouts || []).find(
        p => String(p._id) === String(id) || String(p.id) === String(id),
      );
      if (pw) {
        openPlanned(pw, null);
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.set('openPlanned', String(id));
      setSearchParams(next, { replace: true });
    };
    window.addEventListener('openPlannedRequest', onOpenPlannedRequest);
    return () => window.removeEventListener('openPlannedRequest', onOpenPlannedRequest);
  }, [plannedWorkouts, searchParams, setSearchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Planned-workout editor (bottom sheet) ────────────────────────────────
  const [editingPlanned, setEditingPlanned] = useState(null); // { pw, linkedAct }
  const openPlanned = (pw, linkedAct) => setEditingPlanned({ pw, linkedAct });
  const closePlanned = () => setEditingPlanned(null);

  // Deep-link from the home-screen widget: `?openPlanned=<id>` opens the
  // planned-workout editor for that planned session.
  useEffect(() => {
    const param = searchParams.get('openPlanned');
    if (!param) return;
    const pw = (plannedWorkouts || []).find(
      p => String(p._id) === param || String(p.id) === param,
    );
    if (pw) {
      openPlanned(pw, null);
      const next = new URLSearchParams(searchParams);
      next.delete('openPlanned');
      setSearchParams(next, { replace: true });
    }
    // Re-runs when plannedWorkouts arrive (cold-start after a widget tap).
  }, [searchParams, plannedWorkouts, setSearchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const [raceFeedbackFocusId, setRaceFeedbackFocusId] = useState(null);
  useEffect(() => {
    const param = searchParams.get('openRaceFeedback');
    if (!param) return;
    setRaceFeedbackFocusId(param);
    const next = new URLSearchParams(searchParams);
    next.delete('openRaceFeedback');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Races (incl. past ones) — shown as flags in the WeekStrip and as a card
  // in the day view, with the saved post-race reflection. getRaceEvents has a
  // 60s client cache shared with RaceCountdownCard, so this is cheap.
  const [races, setRaces] = useState([]);
  const [selectedRace, setSelectedRace] = useState(null); // day-card ribbon → detail modal
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getRaceEvents } = await import('../services/api');
        const { data } = await getRaceEvents(athleteId || user?._id);
        if (!cancelled) setRaces(Array.isArray(data) ? data : []);
      } catch { /* races are decorative here — ignore */ }
    })();
    return () => { cancelled = true; };
  }, [athleteId, user?._id]);

  // ── + Lactate from activity modal: open TrainingForm prefilled with laps ──
  const [lactateModal, setLactateModal] = useState({ isOpen: false, initialData: null });
  const [lactateSubmitting, setLactateSubmitting] = useState(false);
  const [lactateError, setLactateError] = useState(null);

  const closeLactateModal = useCallback(() => {
    setLactateModal({ isOpen: false, initialData: null });
    setLactateError(null);
  }, []);

  // Helper: build TrainingForm interval rows from Strava/FIT laps. Sport-aware:
  // power for bike, pace for run/swim.
  const lapsToResults = useCallback((laps, sportKey) => {
    const arr = Array.isArray(laps) ? laps : [];
    const isRun = sportKey === 'run';
    const isSwim = sportKey === 'swim';
    const fmtDur = (sec) => {
      const s = Number(sec) || 0;
      const m = Math.floor(s / 60);
      const ss = Math.round(s % 60);
      return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    };
    return arr.map((lap, idx) => {
      const durationSec = Math.round(
        lap.moving_time ?? lap.totalTimerTime ?? lap.totalElapsedTime ?? lap.elapsed_time ?? lap.duration ?? 0
      );
      const distM = Math.round(lap.distance ?? lap.totalDistance ?? lap.distanceMeters ?? 0);
      const speed = lap.average_speed ?? lap.avgSpeed ?? lap.avg_speed ?? lap.enhancedAvgSpeed ?? 0;
      let powerValue = '';
      if (isRun || isSwim) {
        const eff = speed > 0.05 ? speed : (distM > 0 && durationSec > 0 ? distM / durationSec : 0);
        if (eff > 0.05) {
          const paceSec = isSwim ? Math.round(100 / eff) : Math.round(1000 / eff);
          powerValue = fmtDur(paceSec);
        }
      } else {
        const w = lap.average_watts ?? lap.avgPower ?? lap.average_power ?? 0;
        powerValue = w > 0 ? String(Math.round(w)) : '';
      }
      const isSwimRest = isSwim && distM < 10;
      return {
        interval: idx + 1,
        power: powerValue,
        heartRate: String(Math.round(lap.average_heartrate ?? lap.avgHeartRate ?? lap.avg_heart_rate ?? 0) || ''),
        lactate: lap.lactate != null ? String(lap.lactate) : '',
        RPE: '',
        elevation: (() => {
          const g = lap.total_elevation_gain ?? lap.elevation_gain ?? null;
          return g != null && Number.isFinite(Number(g)) ? String(Math.round(Number(g))) : '';
        })(),
        duration: fmtDur(durationSec),
        durationSeconds: durationSec,
        durationType: 'time',
        distanceMeters: distM > 0 ? distM : undefined,
        repeatCount: 1,
        isRecovery: isSwimRest,
        isSelected: !isSwimRest,
      };
    });
  }, []);

  const handleAddLactate = useCallback(async (activity, lapIndex = null) => {
    if (!activity) return;
    setLactateError(null);

    const rawId = String(activity?.id || activity?.stravaId || activity?._id || '');
    const stravaNumericId = rawId.replace(/^strava-/i, '');
    const isStrava = activity?.type === 'strava' || !!activity?.stravaId ||
                     /^strava-/i.test(String(activity?.id || ''));
    const sportRaw = String(activity?.sport || activity?.sport_type || activity?.sportType || 'bike').toLowerCase();
    const sport = sportRaw.includes('swim') ? 'swim' : sportRaw.includes('run') ? 'run' : 'bike';

    // CRITICAL: Open the modal IMMEDIATELY with whatever we have on hand —
    // never wait for the Strava detail fetch to "succeed" before showing
    // anything. Even if the activity carries no laps yet, the form pops
    // open and the user sees the loading/empty state. We then asynchronously
    // enrich it from the Strava detail endpoint (if applicable). Previous
    // behaviour bailed silently when the fetch failed, which looked to the
    // user like "+ Lactate doesn't do anything".
    const baseLaps = Array.isArray(activity.laps) ? activity.laps : [];
    const existingResults = Array.isArray(activity.results) ? activity.results : [];
    const initialResults = existingResults.length > 0 ? existingResults : lapsToResults(baseLaps, sport);
    const activityDate = activity.date || activity.startDate || activity.timestamp || new Date();
    const parsedDate = new Date(activityDate);
    const dateStr = (Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate).toISOString().slice(0, 16);
    const initialData = {
      ...(activity._id && !isStrava ? { _id: activity._id } : {}),
      sport,
      type: 'interval',
      category: activity.category || '',
      title: activity.titleManual || activity.title || activity.name || 'Untitled Training',
      customTitle: '',
      description: activity.description || '',
      date: dateStr,
      ...(isStrava && stravaNumericId ? { sourceStravaActivityId: stravaNumericId } : {}),
      specifics: { specific: '', weather: '', customSpecific: '', customWeather: '' },
      results: initialResults,
      ...(lapIndex != null ? { _initialSelectedLap: lapIndex + 1 } : {}),
    };
    setLactateModal({ isOpen: true, initialData });

    // Enrich with Strava detail if applicable. If this fails or yields no
    // extra data, the modal is already open — the user can still add rows
    // manually. Surface the error softly as a toast, not as a block.
    if (isStrava && stravaNumericId && initialResults.length === 0) {
      try {
        const isCoachViewing = athleteId && user && String(athleteId) !== String(user._id || user.id || '');
        const integAthleteId = isCoachViewing ? String(athleteId) : null;
        const data = await getStravaActivityDetail(stravaNumericId, integAthleteId);
        const detail = data.detail || {};
        const laps = Array.isArray(data.laps) ? data.laps : [];
        if (laps.length === 0) return;
        const detailSport = (detail.sport_type || detail.sport || sport).toLowerCase();
        const finalSport = detailSport.includes('swim') ? 'swim' : detailSport.includes('run') ? 'run' : 'bike';
        const enrichedDate = detail.start_date_local || detail.start_date || activityDate;
        const enrichedParsed = new Date(enrichedDate);
        const enrichedDateStr = (Number.isNaN(enrichedParsed.getTime()) ? parsedDate : enrichedParsed).toISOString().slice(0, 16);
        setLactateModal({
          isOpen: true,
          initialData: {
            ...initialData,
            sport: finalSport,
            category: data.category || initialData.category,
            title: data.titleManual || detail.name || initialData.title,
            description: data.description || detail.description || initialData.description,
            date: enrichedDateStr,
            sourceStravaActivityId: String(detail.id || detail.stravaId || stravaNumericId),
            results: lapsToResults(laps, finalSport),
          },
        });
      } catch (err) {
        // Non-blocking: form is already open with empty rows.
        setLactateError(
          'Couldn\'t load Strava laps automatically — you can add rows manually.'
        );
      }
    }
  }, [athleteId, user, lapsToResults]);

  // ── Pull-to-refresh: swipe down at scrollTop=0 → reload calendar + Form/Fitness ────
  const [refreshing, setRefreshing] = useState(false);
  const handleDashboardRefresh = useCallback(async () => {
    if (refreshing || !onRequestStravaSync) return;
    setRefreshing(true);
    try { await onRequestStravaSync(); } finally { setRefreshing(false); }
  }, [refreshing, onRequestStravaSync]);

  const [pullDist, setPullDist] = useState(0);
  const pullStateRef = useRef({ startY: 0, pulling: false });
  const PULL_THRESHOLD = 70;

  useEffect(() => {
    if (!onRequestStravaSync) return;
    const scroller = pageRef.current?.parentElement;
    if (!scroller) return;

    const onStart = (e) => {
      if (scroller.scrollTop > 0) { pullStateRef.current.pulling = false; return; }
      pullStateRef.current = { startY: e.touches[0].clientY, pulling: true };
    };
    const onMove = (e) => {
      if (!pullStateRef.current.pulling) return;
      if (scroller.scrollTop > 0) { pullStateRef.current.pulling = false; setPullDist(0); return; }
      const dy = e.touches[0].clientY - pullStateRef.current.startY;
      if (dy <= 0) { setPullDist(0); return; }
      setPullDist(Math.min(dy * 0.5, PULL_THRESHOLD * 1.6));
    };
    const onEnd = () => {
      if (!pullStateRef.current.pulling) return;
      pullStateRef.current.pulling = false;
      if (pullDist >= PULL_THRESHOLD && !refreshing) {
        handleDashboardRefresh();
      }
      setPullDist(0);
    };

    scroller.addEventListener('touchstart', onStart, { passive: true });
    scroller.addEventListener('touchmove', onMove, { passive: true });
    scroller.addEventListener('touchend', onEnd, { passive: true });
    scroller.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      scroller.removeEventListener('touchstart', onStart);
      scroller.removeEventListener('touchmove', onMove);
      scroller.removeEventListener('touchend', onEnd);
      scroller.removeEventListener('touchcancel', onEnd);
    };
  }, [onRequestStravaSync, pullDist, refreshing, handleDashboardRefresh]);

  const handleLactateSubmit = useCallback(async (formData) => {
    try {
      setLactateSubmitting(true);
      setLactateError(null);
      const targetId = athleteId || user?._id || user?.id;

      // Normalise lactate strings → Number (mongoose can't always coerce ""
      // cleanly, and downstream code expects numeric lactate values).
      const cleanedResults = Array.isArray(formData.results)
        ? formData.results.map((r) => {
            const out = { ...r };
            if (out.lactate === '' || out.lactate == null) {
              delete out.lactate;
            } else {
              const num = parseFloat(out.lactate);
              if (Number.isFinite(num)) out.lactate = num;
              else delete out.lactate;
            }
            return out;
          })
        : formData.results;

      const payload = {
        ...formData,
        results: cleanedResults,
        athleteId: targetId,
        coachId: user?._id || user?.id,
      };
      if (formData._id) {
        await updateTraining(formData._id, payload);
      } else {
        await addTraining(payload);
      }

      // If this Training is linked to a Strava activity, push lactate values
      // back into the StravaActivity.laps so the calendar view (which renders
      // Strava laps, not Training results) displays them on PC and mobile.
      const stravaId = formData?.sourceStravaActivityId;
      if (stravaId && Array.isArray(cleanedResults)) {
        const lactateValues = cleanedResults
          .map((r) => {
            const lapIdx = Number.isInteger(r?.sourceLapIndex)
              ? r.sourceLapIndex
              : (Number(r?.interval) > 0 ? Number(r.interval) - 1 : null);
            if (lapIdx == null || !Number.isFinite(r?.lactate)) return null;
            return { lapIndex: lapIdx, lactate: r.lactate };
          })
          .filter(Boolean);
        if (lactateValues.length > 0) {
          try {
            await updateStravaLactateValues(stravaId, lactateValues);
          } catch (syncErr) {
            console.warn('[lactate] Strava sync failed (non-blocking):', syncErr?.message);
          }
        }
      }

      closeLactateModal();
    } catch (err) {
      setLactateError(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Save failed'
      );
    } finally {
      setLactateSubmitting(false);
    }
  }, [athleteId, user, closeLactateModal]);

  return (
    <>
      {/* Inject keyframes once (shared across all native dashboard components) */}
      <style>{SLIDE_IN_STYLE + NATIVE_DASHBOARD_KEYFRAMES}</style>

      <div ref={pageRef} style={styles.page}>
        {/* ── Pull-to-refresh indicator — shows while user drags down or syncing ── */}
        {(pullDist > 0 || refreshing) && (
          <div style={{
            position: 'absolute', top: 8, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', pointerEvents: 'none',
            zIndex: 5,
            opacity: refreshing ? 1 : Math.min(pullDist / PULL_THRESHOLD, 1),
            transform: `translateY(${refreshing ? 0 : Math.min(pullDist * 0.4, 18)}px)`,
            transition: refreshing ? 'opacity .2s' : 'none',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 14,
              background: 'rgba(255,255,255,.85)',
              backdropFilter: 'blur(10px) saturate(170%)',
              WebkitBackdropFilter: 'blur(10px) saturate(170%)',
              border: '1px solid rgba(255,255,255,.7)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#5E6590',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                   style={refreshing
                     ? { animation: 'ndSpin 0.9s linear infinite' }
                     : { transform: `rotate(${Math.min(pullDist / PULL_THRESHOLD, 1) * 360}deg)`, transition: 'transform .05s' }}>
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 4v5h-5" />
              </svg>
            </div>
          </div>
        )}

        {/* ── Cards (staggered fade-in) ── */}
        <div style={{ ...styles.body, ...bodyResponsive }}>

          {/* 0 · Weekly summary carousel (swipeable) */}
          <div style={{ ...cardEntry(0), ...snapStyle }}>
            <PremiumLock feature="Performance Insights" plan="pro" minHeight={180}>
              <WeeklySummaryCarousel
                activities={activities}
                plannedWorkouts={plannedWorkouts}
                sparklineData={sparklineData}
                tests={tests}
                todayMetrics={todayMetrics}
                loading={metricsLoading}
                userProfile={fitnessProfile}
                kpis={{ fitness: todayMetrics?.fitness, form: todayMetrics?.form, fatigue: todayMetrics?.fatigue }}
              />
            </PremiumLock>
          </div>

          {/* 0b · Daily training insight */}
          <div style={{ ...cardEntry(0), ...snapStyle, marginTop: -4 }}>
            <TrainingInsightsCard
              athleteId={athleteId || user?._id || user?.id}
              todayMetrics={todayMetrics}
              plannedWorkouts={plannedWorkouts}
              activities={activities}
              tests={tests}
              sparklineData={sparklineData}
              userProfile={fitnessProfile}
              loading={metricsLoading}
              compact
            />
          </div>

          {/* 1 · Week strip */}
          <div style={{ ...cardEntry(1), ...snapStyle }}>
            <WeekStrip
              activities={activities}
              plannedWorkouts={plannedWorkouts}
              dayPlans={dayPlans}
              periods={periods}
              races={races}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              onPlanWorkout={onPlanWorkout}
              userProfile={fitnessProfile}
            />
          </div>


          {/* 2 · Day activities — re-animates on date change */}
          <div style={snapStyle}>
            <AnimatedCard animKey={animKey}>
              <DayActivitiesCard
                date={selectedDate}
                activities={activities}
                plannedWorkouts={plannedWorkouts}
                dayPlans={dayPlans}
                periods={periods}
                races={races}
                onOpenRace={setSelectedRace}
                userProfile={fitnessProfile}
                onEditTheme={onDayPlanSave ? (d) => setThemeEditDate(toLocalDateStr(d)) : null}
                onEditPeriod={onPeriodSave ? (arg) => setPeriodEdit(arg) : null}
                onPlanWorkout={onPlanWorkout}
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
          <div ref={statusHeroRef} style={{ ...cardEntry(3), ...snapStyle }}>
            <PremiumLock feature="Form & Fitness (Status)" plan="pro" minHeight={180}>
              <StatusHeroCard
                activities={activities}
                userProfile={fitnessProfile}
                todayMetrics={todayMetrics}
                sparklineData={sparklineData}
                loading={metricsLoading}
              />
            </PremiumLock>
          </div>

          {/* 3b · Race countdown */}
          <div style={{ ...cardEntry(3), ...snapStyle }}>
            <PremiumLock feature="Upcoming Races" plan="pro" minHeight={120}>
              <RaceCountdownCard
                athleteId={athleteId || user?._id || user?.id}
                currentCTL={todayMetrics?.fitness}
                currentForm={todayMetrics?.form}
                plannedWorkouts={plannedWorkouts}
                activities={activities}
                userProfile={fitnessProfile}
                onTaperApplied={onTaperApplied}
              />
            </PremiumLock>
          </div>

          {/* 3c · Post-race feedback */}
          <div style={{ ...cardEntry(3), ...snapStyle }}>
            <PostRaceFeedbackCard
              athleteId={athleteId || user?._id || user?.id}
              focusRaceId={raceFeedbackFocusId}
              compact
              onSubmitted={(savedRace) => {
                setRaceFeedbackFocusId(null);
                // Reflect the fresh reflection in the WeekStrip/day card
                // immediately (getRaceEvents has a 60s cache).
                if (savedRace?._id) {
                  setRaces((prev) => prev.map((r) =>
                    String(r._id) === String(savedRace._id) ? { ...r, ...savedRace } : r
                  ));
                }
              }}
            />
          </div>

          {/* 4 · Apple Health wellness (iOS, when connected) */}
          <div style={{ ...cardEntry(4), ...snapStyle }}>
            <AppleHealthWellnessCard loading={loading} />
          </div>

          {/* 5 · Weekly summary */}
          <div style={{ ...cardEntry(5), ...snapStyle }}>
            <PremiumLock feature="This Week & Daily TSS" plan="pro" minHeight={180}>
              <WeeklySummaryCard
                activities={activities}
                plannedWorkouts={plannedWorkouts}
                sparklineData={sparklineData}
                tests={tests}
                userProfile={fitnessProfile}
              />
            </PremiumLock>
          </div>

          {/* 6 · Zone distribution */}
          <div style={{ ...cardEntry(6), ...snapStyle }}>
            <ZoneDistCard athleteId={athleteId || null} />
          </div>

          {/* 7 · Last lab test — drop snap-align on the last card so its tail
              isn't clipped by scroll-snap when the content is tall (zones table
              pushes the card past one viewport on smaller phones). */}
          <div style={{ ...cardEntry(7) }}>
            <LastTestCard tests={tests} />
          </div>

          {/* Generous bottom spacer so the very last row isn't hidden behind
              the bottom tab bar + iOS home-indicator on tall layouts. */}
          <div style={{ height: 48 }} />
        </div>
      </div>

      {/* Bottom-sheet editor for planned-only workouts (no linked activity yet) */}
      {editingPlanned && (
        <PlannedWorkoutEditor
          plannedWorkout={editingPlanned.pw}
          linkedActivity={editingPlanned.linkedAct}
          athleteId={athleteId || user?._id || user?.id}
          user={user}
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
          // Quick lactate add: open the prefilled TrainingForm. We DON'T close
          // the ActivityFullModal here — CalendarView's button already calls
          // its own onClose() after onAddLactate. Calling closeActivityModal()
          // here too caused a double-render race that sometimes swallowed
          // the lactateModal state update on slower devices.
          onAddLactate={(a, lapIndex) => {
            handleAddLactate(a, lapIndex);
          }}
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

      {/* Day-theme editor (shared bottom sheet from the calendar) */}
      {themeEditDate && onDayPlanSave && (
        <Suspense fallback={null}>
          <DayPlanEditSheet
            date={themeEditDate}
            plan={(dayPlans || []).find(p => p?.date === themeEditDate)}
            onClose={() => setThemeEditDate(null)}
            onSave={async (payload, dates) => {
              const list = Array.isArray(dates) && dates.length ? dates : [themeEditDate];
              let result = null;
              for (const d of list) { result = await onDayPlanSave(d, payload); }
              setThemeEditDate(null);
              return result;
            }}
            onDelete={async () => {
              if (onDayPlanDelete) await onDayPlanDelete(themeEditDate);
              setThemeEditDate(null);
            }}
          />
        </Suspense>
      )}

      {/* Calendar period editor */}
      {periodEdit && onPeriodSave && (
        <Suspense fallback={null}>
          <PeriodEditSheet
            period={periodEdit.period || null}
            defaultDate={periodEdit.defaultDate || null}
            onClose={() => setPeriodEdit(null)}
            onSave={async (payload) => {
              const result = await onPeriodSave(payload);
              setPeriodEdit(null);
              return result;
            }}
            onDelete={onPeriodDelete ? async (id) => {
              await onPeriodDelete(id);
              setPeriodEdit(null);
            } : null}
          />
        </Suspense>
      )}

      {/* Strava connect prompt (shown when not connected) */}
      <StravaConnectModal open={showStravaConnect && !stravaConnected} onClose={dismissStravaConnect} />

      {/* Race detail — opened from the day-card race ribbon */}
      {selectedRace && (
        <Suspense fallback={null}>
          <RaceDetailModal
            race={selectedRace}
            activities={activities}
            plannedWorkouts={plannedWorkouts}
            userProfile={fitnessProfile}
            user={user}
            onClose={() => setSelectedRace(null)}
            onOpenActivity={openActivity}
            onFeedbackSaved={(updated) => {
              if (!updated?._id) return;
              setRaces((prev) => prev.map((r) =>
                String(r._id) === String(updated._id) ? { ...r, ...updated } : r
              ));
              setSelectedRace((prev) =>
                prev && String(prev._id) === String(updated._id) ? { ...prev, ...updated } : prev
              );
            }}
          />
        </Suspense>
      )}

      {/* Error toast for lactate-from-dashboard failures (no laps, network, etc.) */}
      {lactateError && (
        <div
          role="alert"
          style={{
            position: 'fixed', left: 12, right: 12, bottom: 92, zIndex: 9998,
            background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
            borderRadius: 12, padding: '10px 12px', fontSize: 13,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ flex: 1 }}>{lactateError}</span>
          <button
            type="button"
            onClick={() => setLactateError(null)}
            style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 8, padding: '4px 8px', fontSize: 12, color: '#991b1b' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TrainingForm modal — portaled into #app-modal-root so it sits
          above NativeLayout's bottom tab bar (NativeLayout creates its own
          stacking context, so a fixed-position node rendered inside the
          dashboard ends up *behind* the tab bar). The earlier race with
          AnimatePresence has been avoided by dropping AnimatePresence —
          a plain conditional portal mounts deterministically. */}
      {lactateModal.isOpen && lactateModal.initialData && ReactDOM.createPortal(
        <div
          className="bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            // app-modal-root sets pointerEvents:none on its root so taps fall
            // through when no modal is open. Re-enable for our overlay,
            // otherwise the NativeLayout scroller behind eats every touch
            // and the form is unscrollable.
            pointerEvents: 'auto',
          }}
        >
          <div className="w-full sm:max-w-2xl">
            <TrainingForm
              key={lactateModal.initialData.sourceStravaActivityId || lactateModal.initialData._id || 'native-dash-lac'}
              onClose={closeLactateModal}
              onSubmit={handleLactateSubmit}
              initialData={lactateModal.initialData}
              isEditing={false}
              isLoading={lactateSubmitting}
              initialSelectedLap={lactateModal.initialData?._initialSelectedLap ?? null}
            />
          </div>
        </div>,
        document.getElementById('app-modal-root') || document.body
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
    position: 'relative',
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
    fontSize: 13, fontWeight: 600, color: '#6B7280', letterSpacing: '-0.01em',
  },
  body: {
    flex: 1,
    padding: '8px 14px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
};
