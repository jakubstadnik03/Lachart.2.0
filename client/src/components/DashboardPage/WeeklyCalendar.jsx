import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  CheckIcon,
  CheckCircleIcon,
  XMarkIcon,
  FireIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  PlayIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { exportPlannedWorkout } from '../../services/workoutPlannerApi';
import SportIcon from '../shared/SportIcon';
import { useNavigate } from 'react-router-dom';
import TrainingStats from '../FitAnalysis/TrainingStats';
import LapsTable from '../FitAnalysis/LapsTable';
import { ActivityFullModal } from '../Calendar/CalendarView';
import { getFitTraining, getStravaActivityDetail, updateFitTraining, updateStravaActivity, createFieldLactateMeasurement } from '../../services/api';
import api from '../../services/api';
import RecordLactateModal from '../training/RecordLactateModal';
import { useAuth } from '../../context/AuthProvider';
import { formatDistanceForUser, resolveDistanceUnitSystem } from '../../utils/unitsConverter';
import { useCategories, hexToRgba } from '../../context/CategoryContext';
import { dayThemePresetColor, periodColor, buildPeriodsByDate } from '../../utils/calendarThemes';

// ─── Planned workout helpers (mirrors CalendarView) ──────────────────────────

const SPORT_PLAN_COLORS = { bike: '#767EB5', cycling: '#767EB5', run: '#f97316', swim: '#38bdf8' };

function planSportColor(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run') || s.includes('walk') || s.includes('trail')) return '#f97316';
  if (s.includes('ride') || s.includes('cycl') || s.includes('bike')) return '#767EB5';
  if (s.includes('swim')) return '#38bdf8';
  return SPORT_PLAN_COLORS[s] || '#767EB5';
}

/** Tiny inline SVG power/step profile for planned workout cards */
function PlanMiniChart({ steps, color, width = 80, height = 14 }) {
  if (!steps?.length) return null;
  const STEP_COLORS = { warmup: '#fbbf24', work: '#767EB5', recovery: '#6ee7b7', cooldown: '#38bdf8', rest: '#d1d5db' };
  const FLOOR = 0.12;

  const segments = [];
  const visited = new Set();
  steps.forEach(s => {
    if (!s.groupId) { segments.push({ kind: 'step', step: s }); return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const header = group.find(x => x.isGroupHeader);
    const reps = header?.groupRepeat || 1;
    const workDur = header?.durationSeconds || 0;
    const recDur  = group.filter(x => !x.isGroupHeader).reduce((a, g) => a + (g.durationSeconds || 0), 0);
    segments.push({ kind: 'group', workDur, recDur, reps, totalDur: (workDur + recDur) * reps });
  });

  const total = segments.reduce((s, seg) =>
    s + (seg.kind === 'step' ? (seg.step.durationSeconds || 30) : seg.totalDur), 0);
  if (!total) return null;

  const elems = [];
  let cx = 0;

  segments.forEach((seg, si) => {
    if (seg.kind === 'step') {
      const s = seg.step;
      const w  = Math.max(1.5, (s.durationSeconds || 30) / total * width);
      const intensity = s.stepType === 'work' ? 1 : s.stepType === 'warmup' ? 0.55 : s.stepType === 'cooldown' ? 0.4 : s.stepType === 'recovery' ? 0.3 : 0.15;
      const bh = Math.max(FLOOR * height, intensity * height);
      const bw = Math.max(1, w - 0.5);
      const fill = STEP_COLORS[s.stepType] || color || '#767EB5';
      const sx = cx; cx += w;
      if (s.isRamp && s.stepType === 'warmup') {
        elems.push(<polygon key={si} points={`${sx},${height} ${sx+bw},${height-bh} ${sx+bw},${height}`} fill={fill} opacity={0.85} />);
      } else if (s.isRamp && s.stepType === 'cooldown') {
        elems.push(<polygon key={si} points={`${sx},${height-bh} ${sx},${height} ${sx+bw},${height}`} fill={fill} opacity={0.85} />);
      } else {
        elems.push(<rect key={si} x={sx} y={height - bh} width={bw} height={bh} fill={fill} rx={1} opacity={0.85} />);
      }
    } else {
      const { workDur, recDur, reps, totalDur } = seg;
      const gw = Math.max(6, totalDur / total * width);
      const sx = cx; cx += gw;
      const cycleTotalDur = workDur + (recDur || 0);
      const maxCycles = Math.max(1, Math.floor(gw / 2));
      const visCycles = Math.min(reps, maxCycles);
      const cycleW   = gw / visCycles;
      const workFrac = cycleTotalDur > 0 ? workDur / cycleTotalDur : 1;
      const workW    = cycleW * workFrac;
      const recW     = cycleW * (1 - workFrac);
      const workH    = height;
      const recH     = Math.max(FLOOR * height, 0.32 * height);

      for (let r = 0; r < visCycles; r++) {
        const x0 = sx + r * cycleW;
        const ww = Math.max(1, workW - 0.5);
        elems.push(<rect key={`${si}w${r}`} x={x0} y={0} width={ww} height={workH} fill={STEP_COLORS.work} rx={0} opacity={0.85} />);
        if (recW >= 1 && recDur > 0) {
          const rw = Math.max(1, recW - 0.5);
          elems.push(<rect key={`${si}r${r}`} x={x0 + workW} y={height - recH} width={rw} height={recH} fill={STEP_COLORS.recovery} rx={0} opacity={0.80} />);
        }
      }
    }
  });

  return (
    <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
      {elems}
    </svg>
  );
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && 
         a.getMonth() === b.getMonth() && 
         a.getDate() === b.getDate();
}

function getLocalDateString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


/** Local calendar day key — must match grouping in `activitiesByDay`. */
function activityCalendarDateKey(act) {
  const raw = act?.date ?? act?.timestamp ?? act?.startDate;
  if (raw == null) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return getLocalDateString(d);
}

function readExplicitTss(act) {
  const v =
    act?.tss ??
    act?.TSS ??
    act?.totalTSS ??
    act?.total_tss ??
    act?.trainingStressScore ??
    act?.training_stress_score ??
    act?.totalTss ??
    act?.totalTssValue ??
    act?.icu_training_load ??
    act?.load;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Same heuristics as server `calculateActivityTSS` (weeklyReport / fitness metrics). */
function estimateTssFromActivity(act, userProfile) {
  try {
    const seconds = Number(
      act?.movingTime ??
        act?.elapsedTime ??
        act?.totalElapsedTime ??
        act?.totalTimerTime ??
        act?.duration ??
        act?.totalTime ??
        0
    );
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;

    const ftp =
      userProfile?.powerZones?.cycling?.lt2 ||
      userProfile?.powerZones?.cycling?.zone5?.min ||
      userProfile?.ftp ||
      250;

    const thresholdPace =
      userProfile?.powerZones?.running?.lt2 || userProfile?.runningZones?.lt2 || null;

    const thresholdSwimPace = userProfile?.powerZones?.swimming?.lt2 || null;

    const sport = String(act?.sport || '').toLowerCase();

    if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike') || sport === 'cycling') {
      const avgPower = Number(
        act?.averagePower ?? act?.avgPower ?? act?.average_watts ?? act?.weighted_average_watts ?? 0
      );
      if (avgPower > 0 && ftp > 0) {
        const np = avgPower;
        return Math.round(((seconds * np * np) / (ftp * ftp * 3600)) * 100);
      }
      const kj = Number(act?.kilojoules ?? act?.raw?.kilojoules ?? 0);
      if (kj > 0) {
        return Math.round(kj * 0.84);
      }
    }

    if (sport.includes('run') || sport.includes('walk') || sport.includes('hike') || sport === 'running') {
      const avgSpeed = Number(act?.averageSpeed ?? act?.avgSpeed ?? act?.average_speed ?? 0);
      if (avgSpeed > 0) {
        const avgPaceSeconds = Math.round(1000 / avgSpeed);
        let referencePace = thresholdPace;
        if (!referencePace || referencePace <= 0) referencePace = avgPaceSeconds;
        const intensityRatio = referencePace / avgPaceSeconds;
        return Math.round(((seconds * intensityRatio * intensityRatio) / 3600) * 100);
      }
    }

    if (sport.includes('swim') || sport === 'swimming') {
      const avgSpeed = Number(act?.averageSpeed ?? act?.avgSpeed ?? act?.average_speed ?? 0);
      if (avgSpeed > 0) {
        const avgPaceSeconds = Math.round(100 / avgSpeed);
        let referencePace = thresholdSwimPace;
        if (!referencePace || referencePace <= 0) referencePace = avgPaceSeconds;
        const intensityRatio = referencePace / avgPaceSeconds;
        return Math.round(((seconds * intensityRatio * intensityRatio) / 3600) * 100);
      }
    }

    return 0;
  } catch {
    return 0;
  }
}

function activityTssResolved(act, userProfile) {
  const explicit = readExplicitTss(act);
  if (explicit > 0) return explicit;
  return estimateTssFromActivity(act, userProfile);
}

function activityDurationSec(act) {
  const v = act?.totalTime ?? act?.totalElapsedTime ?? act?.totalTimerTime ?? act?.movingTime ?? act?.elapsedTime;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function activityDistanceMeters(act) {
  const v = act?.distance ?? act?.totalDistance;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatWeekDurationSeconds(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Decimal hours like 0.3h / 6.8h (matches weekly summary badges). */
function formatDecimalHours(totalSec) {
  const sec = Number(totalSec);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const h = sec / 3600;
  return `${h.toFixed(1)}h`;
}

function normalizeSport(sport) {
  const s = String(sport || '').toLowerCase().trim();
  if (s.includes('run') || s.includes('walk') || s.includes('hike') || s.includes('trail')) return 'Running';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual')) return 'Cycling';
  if (s.includes('swim')) return 'Swimming';
  if (s.includes('gym') || s.includes('weight') || s.includes('strength') || s.includes('workout')) return 'Strength';
  if (!s) return 'Other';
  return 'Other';
}


const SPORT_COLORS_SUMMARY = { bike: '#767EB5', run: '#f97316', swim: '#599FD0', other: '#9ca3af' };

function sportColorForSummary(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual')) return SPORT_COLORS_SUMMARY.bike;
  if (s.includes('run') || s.includes('walk') || s.includes('hike')) return SPORT_COLORS_SUMMARY.run;
  if (s.includes('swim')) return SPORT_COLORS_SUMMARY.swim;
  return SPORT_COLORS_SUMMARY.other;
}

function WeekSummaryColumn({ summary, user, prevWeekTss, compact, weekPlannedWorkouts = [], weekStart = null, tab = 'done', onTabChange }) {
  const { totalTss, totalSec, bySport } = summary;
  const tssRounded = Math.round(totalTss);
  const prevRounded = prevWeekTss != null ? Math.round(Number(prevWeekTss)) : null;
  const showTrend = prevRounded != null && prevRounded > 0 && tssRounded !== prevRounded;

  // Planned totals from weekPlannedWorkouts
  const plannedTotalSec = weekPlannedWorkouts.reduce((s, pw) => s + (planStepTotalSecs(pw.steps) || pw.plannedDuration || 0), 0);
  const hasPlan = plannedTotalSec > 0;
  const completionPct = hasPlan && totalSec > 0 ? Math.min(100, Math.round((totalSec / plannedTotalSec) * 100)) : null;

  const totalTssForBar = bySport.reduce((s, r) => s + r.tss, 0);

  const hoursStr = totalSec > 0 ? formatWeekDurationSeconds(totalSec) : null;
  const plannedHoursStr = plannedTotalSec > 0 ? formatWeekDurationSeconds(plannedTotalSec) : null;

  // Plan tab — planned workouts by day
  if (tab === 'plan') {
    const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const ws = weekStart ? new Date(weekStart) : null;
    const byDay = ws ? Array.from({ length: 7 }, (_, i) => {
      const day = new Date(ws);
      day.setDate(ws.getDate() + i);
      const dayKey = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
      const pws = weekPlannedWorkouts.filter(pw => String(pw.date || '').slice(0, 10) === dayKey);
      return { dow: DOW[i], dayKey, pws };
    }).filter(d => d.pws.length > 0) : [];

    return (
      <div
        className={`flex flex-col rounded-lg border border-gray-200 bg-gray-50 border-l-4 border-l-primary/40 text-left ${compact ? 'p-2 min-w-[130px]' : 'p-2.5 min-w-0'}`}
        data-testid="weekly-calendar-summary"
      >
        {/* Tab switcher */}
        <div className="flex gap-0.5 mb-1.5 bg-gray-200 rounded-md p-0.5">
          {['done', 'plan'].map(t => (
            <button key={t} onClick={() => onTabChange?.(t)}
              style={{ touchAction: 'manipulation' }}
              className={`flex-1 text-[11px] font-bold py-0.5 rounded transition-all ${tab === t ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t === 'done' ? 'Done' : 'Plan'}
            </button>
          ))}
        </div>
        {/* Planned total */}
        <div className="flex items-baseline gap-1 leading-tight mb-1">
          <span className={`font-extrabold text-gray-900 tabular-nums ${compact ? 'text-sm' : 'text-base'}`}>{plannedHoursStr || '—'}</span>
        </div>
        {byDay.length === 0 ? (
          <span className={`text-gray-400 italic flex-1 flex items-center ${compact ? 'text-[11px]' : 'text-xs'}`}>No plan</span>
        ) : (
          <div className="space-y-1 flex-1 overflow-hidden">
            {byDay.map(({ dow, pws }) => (
              <div key={dow} className="flex items-start gap-1">
                <span className={`font-bold text-gray-400 w-5 shrink-0 mt-0.5 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{dow}</span>
                <div className="flex-1 min-w-0 space-y-0.5">
                  {pws.map((pw, i) => {
                    const color = sportColorForSummary(pw.sport || 'bike');
                    const secs = planStepTotalSecs(pw.steps) || pw.plannedDuration || 0;
                    return (
                      <div key={i} className="flex items-center gap-1 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className={`text-gray-700 font-medium truncate flex-1 ${compact ? 'text-[11px]' : 'text-xs'}`}>{pw.title || 'Workout'}</span>
                        {secs > 0 && <span className={`text-gray-400 shrink-0 tabular-nums ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{secsToHMShort(secs)}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Done tab
  return (
    <div
      className={`flex flex-col rounded-lg border border-gray-200 bg-gray-50 border-l-4 border-l-primary/40 text-left ${
        compact ? 'p-2 min-w-[130px]' : 'p-2.5 min-w-0'
      }`}
      data-testid="weekly-calendar-summary"
    >
      {/* Tab switcher */}
      <div className="flex gap-0.5 mb-1.5 bg-gray-200 rounded-md p-0.5">
        {['done', 'plan'].map(t => (
          <button key={t} onClick={() => onTabChange?.(t)}
            style={{ touchAction: 'manipulation' }}
            className={`flex-1 text-[11px] font-bold py-0.5 rounded transition-all ${tab === t ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'done' ? 'Done' : 'Plan'}
          </button>
        ))}
      </div>

      {/* Header: actual vs planned time + TSS + trend */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <div>
          {hasPlan ? (
            <div className="flex items-baseline gap-1 leading-tight">
              <span className={`font-medium text-gray-400 tabular-nums ${compact ? 'text-xs' : 'text-[13px]'}`}>{plannedHoursStr}</span>
              <span className={`font-extrabold text-gray-900 tabular-nums ${compact ? 'text-sm' : 'text-base'}`}>{hoursStr || '—'}</span>
            </div>
          ) : (
            <div className={`font-extrabold text-gray-900 leading-tight tabular-nums ${compact ? 'text-sm' : 'text-base'}`}>
              {hoursStr || '—'}
            </div>
          )}
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {tssRounded > 0 && (
              <div className="flex items-center gap-0.5">
                <FireIcon className={`text-primary shrink-0 ${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
                <span className={`font-bold text-primary tabular-nums ${compact ? 'text-[11px]' : 'text-xs'}`}>{tssRounded}</span>
                <span className={`text-gray-400 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>TSS</span>
              </div>
            )}
            {completionPct !== null && (
              <span className={`text-[11px] font-bold px-1 py-0.5 rounded-full ${completionPct >= 100 ? 'bg-green-100 text-green-600' : completionPct >= 70 ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-500'}`}>
                {completionPct}%
              </span>
            )}
          </div>
        </div>
        {showTrend && (
          <span className={`mt-0.5 flex-shrink-0 ${tssRounded > prevRounded ? 'text-green-500' : 'text-red-400'}`}>
            {tssRounded > prevRounded
              ? <ArrowTrendingUpIcon className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
              : <ArrowTrendingDownIcon className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
          </span>
        )}
      </div>

      {/* Completion progress bar (when there's a plan) */}
      {hasPlan && (
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, (totalSec / plannedTotalSec) * 100)}%`, backgroundColor: completionPct >= 100 ? '#22c55e' : completionPct >= 70 ? '#f59e0b' : '#767EB5' }} />
        </div>
      )}

      {/* TSS distribution bar (when no plan) */}
      {!hasPlan && totalTssForBar > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden gap-px mb-1">
          {bySport.map(row => {
            const ratio = row.tss / totalTssForBar;
            if (ratio <= 0) return null;
            return <div key={row.sport} style={{ width: `${ratio * 100}%`, backgroundColor: sportColorForSummary(row.sport) }} className="rounded-full" />;
          })}
        </div>
      )}

      {/* Per-sport rows */}
      <div className="space-y-1">
        {bySport.length === 0 ? (
          <div className={`text-gray-400 italic ${compact ? 'text-[11px]' : 'text-xs'}`}>—</div>
        ) : (
          bySport.map((row) => {
            const timePart = row.sec > 0 ? formatDecimalHours(row.sec) || formatWeekDurationSeconds(row.sec) : '—';
            return (
              <div key={row.sport} className="flex items-center gap-1">
                <SportIcon sport={row.sport} className={compact ? 'w-3.5 h-3.5 text-gray-500' : 'w-4 h-4 text-gray-500'} />
                <span className={`font-semibold text-gray-700 flex-1 tabular-nums ${compact ? 'text-[11px]' : 'text-xs'}`}>{timePart}</span>
                {row.dist > 0 && (
                  <span className={`text-gray-400 flex-shrink-0 tabular-nums ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                    {formatDistanceForUser(row.dist, user)}
                  </span>
                )}
                {row.tss > 0 && (
                  <span className={`font-bold text-primary flex-shrink-0 tabular-nums ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                    {Math.round(row.tss)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function planStepTotalSecs(steps) {
  if (!Array.isArray(steps)) return 0;
  // Group-aware: each group is counted once with its repeat multiplier.
  // Non-grouped steps are added directly. This matches CalendarView.jsx.
  const visited = new Set();
  let total = 0;
  steps.forEach(s => {
    if (!s.groupId) {
      total += Number(s.durationSeconds || s.duration || 0);
      return;
    }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const reps = (group.find(x => x.isGroupHeader)?.groupRepeat) || 1;
    group.forEach(gs => { total += Number(gs.durationSeconds || gs.duration || 0) * reps; });
  });
  return total;
}

function secsToHMShort(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  return `${m}m`;
}


// Local sport-match helper (mirrors CalendarView.sportMatches)
function planSportMatchesActivity(pwSport, actSport) {
  const p = String(pwSport || '').toLowerCase();
  const a = String(actSport || '').toLowerCase();
  if (!p || !a) return false;
  if (p === 'run'  && (a.includes('run') || a.includes('walk') || a.includes('hike'))) return true;
  if (p === 'bike' && (a.includes('ride') || a.includes('cycle') || a.includes('bike') || a.includes('virtual'))) return true;
  if (p === 'swim' && a.includes('swim')) return true;
  if (p === 'strength' && (a.includes('weight') || a.includes('strength') || a.includes('gym'))) return true;
  return p === a;
}

// Pair planned workouts with same-sport activities for one day.
// Returns { pwToAct: Map<pw_id, activity>, claimedKeys: Set<activityKey> }
function pairPlannedWithDayActivities(planned, activities) {
  const pwToAct = new Map();
  const claimedKeys = new Set();
  if (!planned?.length || !activities?.length) return { pwToAct, claimedKeys };
  const actKey = (a) => String(a?.id ?? a?._id ?? '');
  for (const pw of planned) {
    if (!pw?._id) continue;
    const explicit = pw.completedTrainingId
      ? activities.find(a => actKey(a) === String(pw.completedTrainingId))
      : null;
    const candidate = explicit
      || activities.find(a => !claimedKeys.has(actKey(a)) && planSportMatchesActivity(pw.sport, a.sport || a.type || ''));
    if (candidate) {
      pwToAct.set(String(pw._id), candidate);
      claimedKeys.add(actKey(candidate));
    }
  }
  return { pwToAct, claimedKeys };
}

function PlannedMiniCard({ pw, onSelect, onStart, onCopy, onDelete, onRepeat, pairingState = null, linkedActivity = null, onSelectLinked = null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  // Export-format triggers (ZWO / TCX / FIT). Failure shown via window.alert
  // — the card sits inside many host components that don't share a
  // notification context, so a plain alert is the safest fallback.
  const handleExport = async (format) => {
    if (!pw?._id) return;
    setExportBusy(true);
    try {
      await exportPlannedWorkout(pw._id, {
        format,
        athleteId: pw.athleteId,
        suggestedName: (pw.title || 'workout').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 50),
      });
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Export failed';
      // eslint-disable-next-line no-alert
      alert(`Export failed: ${msg}`);
    } finally {
      setExportBusy(false);
      setExportOpen(false);
      setMenuOpen(false);
    }
  };
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const { getCategory, getCategoryStyle: getCatStyle } = useCategories();

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (!e.target.closest('[data-planned-menu]')) {
        setMenuOpen(false);
        setRepeatOpen(false);
      }
    };
    // Touch listener (iOS / Android) AND mousedown (desktop). Without
    // touchstart the menu would stay open after a tap-outside on mobile.
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [menuOpen]);

  const openMenu = (e) => {
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setMenuOpen(v => !v);
    setRepeatOpen(false);
  };

  // ── Long-press handler ────────────────────────────────────────────────────
  // The desktop ⋯ button is hidden on touch (no hover), so on iOS/Android the
  // menu was unreachable. Holding the whole card for ~450 ms now opens the
  // same dropdown — same UX pattern as iOS home-screen icons, Mac trackpad
  // long-press, etc. Cancelled on scroll / move to keep tap-through working.
  const longPressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);
  const longPressStartRef = useRef({ x: 0, y: 0 });
  const cardRef = useRef(null);
  const startLongPress = (e) => {
    longPressFiredRef.current = false;
    const t = e.touches ? e.touches[0] : e;
    longPressStartRef.current = { x: t.clientX, y: t.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      // Position the menu over the card so it feels anchored to where the
      // finger is, not floating in space.
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) {
        const right = Math.max(8, window.innerWidth - rect.right);
        const top = Math.min(window.innerHeight - 220, rect.bottom + 6);
        setMenuPos({ top, right });
      }
      setMenuOpen(true);
      setRepeatOpen(false);
      // Haptic feedback on iOS — if available it gives a subtle nudge when
      // the menu pops, just like native long-press.
      try { window?.navigator?.vibrate?.(15); } catch (_) {}
    }, 450);
  };
  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const moveLongPress = (e) => {
    if (!longPressTimerRef.current) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - longPressStartRef.current.x;
    const dy = t.clientY - longPressStartRef.current.y;
    if (Math.hypot(dx, dy) > 8) cancelLongPress();
  };

  const plannedSecs = planStepTotalSecs(pw.steps) || pw.plannedDuration || 0;
  const isCompletedPair = pw.status === 'completed' || pairingState === 'completed';
  const isMissedPair    = pairingState === 'missed' && !isCompletedPair;
  const isPurelyPlanned = !isCompletedPair && !isMissedPair && !linkedActivity;
  const isCompleted = isCompletedPair; // keeps existing menu logic working

  // When merged with an actual activity, prefer real time/distance/sport/category
  const actSecs = Number(linkedActivity?.duration || linkedActivity?.moving_time
                || linkedActivity?.elapsed_time || linkedActivity?.movingTime
                || linkedActivity?.totalTimerTime || linkedActivity?.totalElapsedTime || 0);
  const actDistMeters = Number(linkedActivity?.distance || linkedActivity?.totalDistance || 0);
  const actSport = linkedActivity?.sport || linkedActivity?.type || pw.sport;
  const fmtDist = (m) => m >= 1000 ? `${(m/1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${Math.round(m)} m`;
  const displaySport = linkedActivity ? actSport : pw.sport;
  const displayDurStr = linkedActivity && actSecs > 0 ? secsToHMShort(actSecs) : secsToHMShort(plannedSecs);
  const displayDistStr = linkedActivity && actDistMeters > 0 ? fmtDist(actDistMeters) : '';
  // Prefer activity category (user may add it after completion) over planned workout category
  const effectiveCategory = linkedActivity?.category || pw.category || null;

  // Sport-tinted color for ghost (purely planned) style
  const planColor = planSportColor(displaySport);

  // Card appearance — mirrors CalendarView PlannedWorkoutCard logic
  let cardBg, cardBorderColor, cardBorderStyle;
  if (isCompletedPair) {
    cardBg = '#f0fdf4'; cardBorderColor = '#bbf7d0'; cardBorderStyle = 'solid';
  } else if (isMissedPair) {
    cardBg = '#fef2f2'; cardBorderColor = '#fecaca'; cardBorderStyle = 'solid';
  } else if (isPurelyPlanned) {
    cardBg = planColor + '10';        // ~6% opacity tint
    cardBorderColor = planColor + '55'; // ~33% opacity
    cardBorderStyle = 'dashed';
  } else {
    cardBg = '#ffffff'; cardBorderColor = '#e5e7eb'; cardBorderStyle = 'solid';
  }

  const dropdown = menuOpen ? ReactDOM.createPortal(
    <div
      data-planned-menu
      style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
      className="w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 text-xs overflow-hidden"
    >
      {onSelect && (
        <button onClick={() => { setMenuOpen(false); onSelect(pw); }}
          className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 flex items-center gap-2">
          <PencilIcon className="w-3.5 h-3.5" /> Edit
        </button>
      )}
      {onCopy && (
        <button onClick={() => { setMenuOpen(false); onCopy(pw, pw.date); }}
          className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 flex items-center gap-2">
          <DocumentDuplicateIcon className="w-3.5 h-3.5" /> Copy
        </button>
      )}
      {onRepeat && (
        <>
          <button onClick={() => setRepeatOpen(v => !v)}
            className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <ArrowPathIcon className="w-3.5 h-3.5" /> Repeat ›
          </button>
          {repeatOpen && (
            <div className="px-3 pb-2">
              <p className="text-[11px] text-gray-400 py-1">Next N weeks</p>
              <div className="grid grid-cols-3 gap-1">
                {[2,3,4,6,8,12].map(n => (
                  <button key={n}
                    onClick={() => { setMenuOpen(false); setRepeatOpen(false); onRepeat(pw, n); }}
                    className="text-gray-700 text-xs py-1 rounded hover:bg-gray-50 font-medium">
                    {n}×
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {onStart && !isCompleted && (
        <button onClick={() => { setMenuOpen(false); onStart(pw); }}
          className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 flex items-center gap-2">
          <PlayIcon className="w-3.5 h-3.5" /> Start
        </button>
      )}
      {/* Export — only meaningful when the workout has structured steps */}
      {Array.isArray(pw.steps) && pw.steps.length > 0 && (
        <>
          <button
            onClick={() => setExportOpen((v) => !v)}
            className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            disabled={exportBusy}
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Export ›
          </button>
          {exportOpen && (
            <div className="px-3 pb-2 space-y-0.5">
              <button onClick={() => handleExport('zwo')} disabled={exportBusy}
                className="w-full text-left text-[13px] py-1 px-1.5 rounded hover:bg-gray-50 text-gray-600 font-medium">
                ZWO <span className="text-gray-400">· Zwift / TrainerRoad</span>
              </button>
              <button onClick={() => handleExport('tcx')} disabled={exportBusy}
                className="w-full text-left text-[13px] py-1 px-1.5 rounded hover:bg-gray-50 text-gray-600 font-medium">
                TCX <span className="text-gray-400">· Garmin / TrainingPeaks</span>
              </button>
            </div>
          )}
        </>
      )}
      {onDelete && (
        <button onClick={() => { setMenuOpen(false); onDelete(pw); }}
          className="w-full text-left px-3 py-1.5 text-red-500 hover:bg-red-50 flex items-center gap-2">
          <TrashIcon className="w-3.5 h-3.5" /> Delete
        </button>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative group">
      <button
        ref={cardRef}
        onClick={() => {
          // Long-press path opened the menu — swallow the synthetic click
          // that fires when the finger lifts so we don't also open the editor.
          if (longPressFiredRef.current) {
            longPressFiredRef.current = false;
            return;
          }
          if (linkedActivity && onSelectLinked) onSelectLinked(linkedActivity);
          else if (onSelect) onSelect(pw);
        }}
        onTouchStart={startLongPress}
        onTouchMove={moveLongPress}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
        onContextMenu={(e) => {
          // Desktop right-click → same menu as long-press, same as ⋯ button.
          e.preventDefault();
          openMenu(e);
        }}
        className="w-full text-left rounded-xl border transition-colors p-2 flex flex-col gap-1"
        style={{
          backgroundColor: cardBg,
          borderColor: cardBorderColor,
          borderStyle: cardBorderStyle,
          borderLeftColor: planColor,
          borderLeftWidth: 3,
          borderLeftStyle: 'solid',
          WebkitTouchCallout: 'none',
        }}
        title={pw.title}
      >
        {/* Title row — sport icon (with tiny check overlay when completed) + chart */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="relative flex-shrink-0">
            <SportIcon sport={displaySport} className="w-3.5 h-3.5" style={{ color: isPurelyPlanned ? planColor : undefined }} />
            {isCompletedPair && (
              <CheckCircleIcon className="absolute -bottom-1 -right-1 w-2.5 h-2.5 text-green-600 bg-white rounded-full" />
            )}
          </span>
          <span
            className="text-[13px] font-bold truncate flex-1"
            style={{ color: isCompletedPair ? '#166534' : isMissedPair ? '#991b1b' : isPurelyPlanned ? planColor : '#1e293b' }}
          >
            {pw.title || 'Planned workout'}
          </span>
          {/* Mini step chart — right-aligned in title row */}
          {isPurelyPlanned && pw.steps?.length > 0 && (
            <PlanMiniChart steps={pw.steps} color={planColor} width={72} height={14} />
          )}
        </div>
        {/* Category + stats row */}
        {(effectiveCategory || displayDurStr || displayDistStr) && (
          <div className="flex items-center gap-1.5 text-xs flex-wrap" style={{ color: isPurelyPlanned ? planColor + 'cc' : '#6b7280' }}>
            {effectiveCategory && getCategory(effectiveCategory) && (
              <span
                className="text-[10px] uppercase tracking-wide px-1.5 py-[1px] rounded-md font-bold border leading-tight flex-shrink-0 max-w-full truncate"
                style={getCatStyle(effectiveCategory)}
                title={getCategory(effectiveCategory)?.label}
              >
                {getCategory(effectiveCategory)?.label}
              </span>
            )}
            {displayDurStr && <span className="tabular-nums">{displayDurStr}</span>}
            {displayDurStr && displayDistStr && <span style={{ color: '#d1d5db' }}>·</span>}
            {displayDistStr && <span className="tabular-nums">{displayDistStr}</span>}
          </div>
        )}
      </button>
      <button
        ref={btnRef}
        onClick={openMenu}
        className="absolute right-0.5 top-0.5 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded hover:bg-black/10 transition-opacity"
      >
        <EllipsisVerticalIcon className="w-3 h-3" />
      </button>
      {dropdown}
    </div>
  );
}

function actSportColor(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run') || s.includes('walk') || s.includes('hike')) return '#f97316';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) return '#3b82f6';
  if (s.includes('swim')) return '#06b6d4';
  return '#8b5cf6';
}

function WeekActCard({ act, isSelected, onClick, catBadgeStyle, compact = false }) {
  const title = act.title || act.name || act.originalFileName || 'Activity';
  const color = catBadgeStyle && act.category
    ? (catBadgeStyle(act.category).borderColor || actSportColor(act.sport))
    : actSportColor(act.sport);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border transition-all flex items-center gap-1.5 ${
        compact ? 'p-1.5' : 'px-2 py-1.5'
      } ${
        isSelected
          ? 'bg-gradient-to-br from-primary to-primary-dark shadow-md ring-2 ring-primary/20 border-transparent'
          : 'bg-white hover:bg-gray-50 shadow-sm hover:shadow-md border-gray-200'
      }`}
      style={{ borderLeftColor: color, borderLeftWidth: 3, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
      title={title}
    >
      <SportIcon sport={act.sport} className={`flex-shrink-0 ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
      <span
        className={`font-bold flex-1 min-w-0 truncate leading-tight ${compact ? 'text-xs' : 'text-[13px]'} ${isSelected ? 'text-white' : 'text-gray-800'}`}
      >
        {title}
      </span>
    </button>
  );
}

const WeeklyCalendar = ({
  activities = [],
  onSelectActivity,
  selectedActivityId,
  selectedAthleteId = null,
  onActivityUpdate = null,
  /** Called with { type, id } when the user deletes an activity from the
   *  shared ActivityFullModal — dashboard refreshes its activity feed. */
  onActivityDeleted = null,
  plannedWorkouts = [],
  /** Day-level themes ("Threshold day" etc.) — { date, title, category, notes } */
  dayPlans = [],
  /** Called with (dateStr, { title, category, notes }) to upsert a day theme. */
  onDayPlanSave = null,
  /** Called with dateStr to remove a day theme. */
  onDayPlanDelete = null,
  /** Multi-day periods (Vacation, Training camp, …) — display-only bands here;
   *  edited on the Calendar tab. */
  periods = [],
  onPlanWorkout = null,
  onSelectPlannedWorkout = null,
  onStartWorkout = null,
  onCopyPlannedWorkout = null,
  onDeletePlannedWorkout = null,
  onAddLactate = null,
  onAddTraining = null,
}) => {
  const { user } = useAuth();
  const { getCategory } = useCategories();

  const catBadgeStyle = (catId) => {
    const cat = getCategory(catId);
    if (!cat) return { backgroundColor: '#f3f4f6', color: '#6b7280', borderColor: '#d1d5db' };
    return { backgroundColor: hexToRgba(cat.color, 0.15), color: cat.color, borderColor: hexToRgba(cat.color, 0.35) };
  };
  const catLabel = (catId) => {
    const cat = getCategory(catId);
    return cat ? cat.label : (catId ? catId.charAt(0).toUpperCase() + catId.slice(1) : 'Uncategorized');
  };
  const stravaDetailAthleteId = useMemo(() => {
    const role = String(user?.role || '').toLowerCase();
    if (!['coach', 'tester', 'testing'].includes(role)) return null;
    return selectedAthleteId ?? null;
  }, [user?.role, selectedAthleteId]);
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date()));
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [activityModal, setActivityModal] = useState(null); // { activity, plannedWorkout }
  const navigate = useNavigate();
  const [trainingDetail, setTrainingDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedLapNumber, setSelectedLapNumber] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [cachedActivities, setCachedActivities] = useState([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [weekSummaryTab, setWeekSummaryTab] = useState('done');
  const [showRecordLactate, setShowRecordLactate] = useState(false);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(true);
  const [showLeftScrollNoTraining, setShowLeftScrollNoTraining] = useState(false);
  const [showRightScrollNoTraining, setShowRightScrollNoTraining] = useState(true);
  const scrollContainerRef = useRef(null);
  const scrollContainerNoTrainingRef = useRef(null);

  // If Strava doesn't provide explicit swim laps, generate swim splits from stream records.
  // This keeps the Interval tabs/table usable for swimming too.
  const generateSwimLapsFromRecords = (records = []) => {
    if (!Array.isArray(records) || records.length < 2) return [];

    const unitSystem = resolveDistanceUnitSystem(user, 'metric');
    const stepMeters = unitSystem === 'imperial' ? 91.44 : 100; // 100yd vs 100m
    const MOVING_SPEED_THRESHOLD_MPS = 0.06; // swim speed can be low; use a small threshold

    const getDistance = (r) => {
      const d = Number(r?.distance ?? 0);
      return Number.isFinite(d) ? d : 0;
    };
    const getSpeedMps = (r) => {
      const s = Number(r?.speed ?? 0);
      return Number.isFinite(s) ? s : 0;
    };
    const getHr = (r) => {
      const hr = Number(r?.heartRate ?? r?.heartrate ?? 0);
      return Number.isFinite(hr) && hr > 0 ? hr : 0;
    };
    const getCadence = (r) => {
      // For swim this is typically strokes/min in Strava streams
      const c = Number(r?.cadence ?? r?.avgCadence ?? r?.average_cadence ?? r?.averageCadence ?? 0);
      return Number.isFinite(c) && c > 0 ? c : 0;
    };
    const getTs = (r) => {
      const ts = r?.timestamp ? new Date(r.timestamp).getTime() : NaN;
      return Number.isFinite(ts) ? ts : null;
    };

    const hasDistanceStream = records.some((r) => getDistance(r) > 0);
    const hasSpeedStream = records.some((r) => getSpeedMps(r) > 0);
    let estimatedDistance = 0;
    let lastDistanceValue = 0;
    let prevBoundaryDistance = 0; // cumulative distance at the start of the current split

    const computeSegmentStats = (seg) => {
      if (!seg || seg.length < 2) {
        return { movingTimeSec: 0, avgSpeedMps: 0, avgHeartRate: 0, avgCadence: 0 };
      }

      let movingTimeSec = 0;
      for (let i = 1; i < seg.length; i++) {
        const prev = seg[i - 1];
        const curr = seg[i];

        const prevTs = getTs(prev);
        const currTs = getTs(curr);
        const dt = prevTs != null && currTs != null ? (currTs - prevTs) / 1000 : 1;
        if (!Number.isFinite(dt) || dt <= 0) continue;

        const prevSpeed = getSpeedMps(prev);
        const currSpeed = getSpeedMps(curr);
        if (prevSpeed >= MOVING_SPEED_THRESHOLD_MPS || currSpeed >= MOVING_SPEED_THRESHOLD_MPS) {
          movingTimeSec += dt;
        }
      }

      const moving = seg.filter((r) => getSpeedMps(r) >= MOVING_SPEED_THRESHOLD_MPS);
      const speeds = moving.map((r) => getSpeedMps(r)).filter((v) => v > 0);
      const hrs = moving.map((r) => getHr(r)).filter((v) => v > 0);
      const cads = moving.map((r) => getCadence(r)).filter((v) => v > 0);

      const avgSpeedMps = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
      const avgHeartRate = hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : 0;
      const avgCadence = cads.length > 0 ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : 0;

      return { movingTimeSec, avgSpeedMps, avgHeartRate, avgCadence };
    };

    const laps = [];
    let lapNumber = 1;
    let lastProcessedDistance = 0;
    let currentSegment = [];
    let distanceStreamOffset = 0;
    let prevDistanceStream = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      let distanceNow = 0;
      if (!hasSpeedStream) {
        // No reliable speed stream -> fall back to distance stream (if present).
        const dRaw = hasDistanceStream ? getDistance(record) : 0;
        if (i === 0) {
          prevDistanceStream = dRaw;
          distanceStreamOffset = 0;
        } else {
          // Some streams reset (e.g. per-length). If we detect a reset, accumulate an offset.
          if (dRaw > 0 && dRaw < prevDistanceStream) {
            distanceStreamOffset += prevDistanceStream;
          }
          prevDistanceStream = dRaw;
        }
        distanceNow = distanceStreamOffset + dRaw;
      } else {
        // If we don't have distance in stream data, estimate distance by integrating speed over time.
        if (i === 0) {
          distanceNow = 0;
        } else {
          const prevRecord = records[i - 1];
          const prevTs = getTs(prevRecord);
          const currTs = getTs(record);
          const dt = prevTs != null && currTs != null ? (currTs - prevTs) / 1000 : 1;

          const prevSpeed = getSpeedMps(prevRecord);
          const currSpeed = getSpeedMps(record);
          const speedAvg = (prevSpeed + currSpeed) / 2;

          if (Number.isFinite(dt) && dt > 0 && speedAvg > 0) {
            estimatedDistance += speedAvg * dt;
          }
          distanceNow = estimatedDistance;
        }
      }

      if (!Number.isFinite(distanceNow) || distanceNow < 0) continue;
      lastDistanceValue = distanceNow;

      const splitEndTarget = lapNumber * stepMeters;
      if (distanceNow >= splitEndTarget && distanceNow > lastProcessedDistance) {
        if (currentSegment.length > 0) {
          const stats = computeSegmentStats(currentSegment);
          laps.push({
            lapNumber,
            // Use per-split distance so chart/table widths & display are correct.
            distance: stepMeters,
            totalDistance: stepMeters,
            elapsed_time: stats.movingTimeSec,
            moving_time: stats.movingTimeSec,
            totalElapsedTime: stats.movingTimeSec,
            totalTimerTime: stats.movingTimeSec,
            average_speed: stats.avgSpeedMps, // m/s
            avgSpeed: stats.avgSpeedMps, // m/s (LapsTable expects m/s in swim mode)
            average_heartrate: stats.avgHeartRate,
            avgHeartRate: stats.avgHeartRate,
            average_cadence: stats.avgCadence,
            avgCadence: stats.avgCadence
          });
        }

        lastProcessedDistance = distanceNow;
        prevBoundaryDistance = splitEndTarget;
        lapNumber += 1;
        currentSegment = [record];
      } else {
        currentSegment.push(record);
      }
    }

    // Add incomplete last segment if it contains enough distance
    if (currentSegment.length > 10) {
      const lastDistance = hasDistanceStream ? getDistance(currentSegment[currentSegment.length - 1]) : lastDistanceValue;
      const incompleteDistance = Math.max(0, lastDistance - prevBoundaryDistance);
      const minIncomplete = stepMeters * 0.45;
      if (incompleteDistance >= minIncomplete && incompleteDistance > 0) {
        const stats = computeSegmentStats(currentSegment);
        laps.push({
          lapNumber,
          distance: incompleteDistance,
          totalDistance: incompleteDistance,
          elapsed_time: stats.movingTimeSec,
          moving_time: stats.movingTimeSec,
          totalElapsedTime: stats.movingTimeSec,
          totalTimerTime: stats.movingTimeSec,
          average_speed: stats.avgSpeedMps,
          avgSpeed: stats.avgSpeedMps,
          average_heartrate: stats.avgHeartRate,
          avgHeartRate: stats.avgHeartRate,
          average_cadence: stats.avgCadence,
          avgCadence: stats.avgCadence
        });
      }
    }

    // Last-resort fallback: if we failed to generate any splits, still return 1 lap
    // so the UI doesn't show an empty table for swim activities.
    if (laps.length === 0) {
      const stats = computeSegmentStats(records);
      const distanceEst = lastDistanceValue > 0 ? lastDistanceValue : stepMeters;
      if (stats.movingTimeSec > 0 || stats.avgSpeedMps > 0) {
        laps.push({
          lapNumber: 1,
          distance: distanceEst,
          totalDistance: distanceEst,
          elapsed_time: stats.movingTimeSec,
          moving_time: stats.movingTimeSec,
          totalElapsedTime: stats.movingTimeSec,
          totalTimerTime: stats.movingTimeSec,
          average_speed: stats.avgSpeedMps,
          avgSpeed: stats.avgSpeedMps,
          average_heartrate: stats.avgHeartRate,
          avgHeartRate: stats.avgHeartRate,
          average_cadence: stats.avgCadence,
          avgCadence: stats.avgCadence
        });
      }
    }

    return laps;
  };
  
  // Ref to store handleActivityClick function for event listener
  const handleActivityClickRef = useRef(null);
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // dateStr → dayPlan lookup — drives the small theme chip rendered in each
  // day cell. Falls back to empty Map when dayPlans is undefined so the
  // component doesn't crash on web where the parent hasn't wired it yet.
  const dayPlanByDate = useMemo(() => {
    const m = new Map();
    (dayPlans || []).forEach(p => { if (p?.date) m.set(p.date, p); });
    return m;
  }, [dayPlans]);
  const periodsByDate = useMemo(() => buildPeriodsByDate(periods), [periods]);
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentWeek);
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [currentWeek]);

  // Load activities from localStorage on mount
  useEffect(() => {
    const loadCachedActivities = () => {
      try {
        const cached = localStorage.getItem('weeklyCalendar_activities');
        if (cached) {
          const parsed = JSON.parse(cached);
          // Check if cache is not too old (e.g., 1 hour)
          const cacheTime = localStorage.getItem('weeklyCalendar_cacheTime');
          if (cacheTime && Date.now() - parseInt(cacheTime) < 3600000) {
            setCachedActivities(parsed);
          }
        }
      } catch (error) {
        console.error('Error loading cached activities:', error);
      }
    };
    loadCachedActivities();
  }, []);

  // Save activities to localStorage when they change
  useEffect(() => {
    if (activities && activities.length > 0) {
      try {
        // Match dashboard calendar cap so week navigation into history still has data offline
        const limited = activities.slice(0, 2000);
        localStorage.setItem('weeklyCalendar_activities', JSON.stringify(limited));
        localStorage.setItem('weeklyCalendar_cacheTime', Date.now().toString());
        setCachedActivities(limited);
      } catch (error) {
        console.error('Error saving activities to cache:', error);
      }
    }
  }, [activities]);

  // Use activities prop directly (don't use cache if activities are provided)
  // Cache is only used as fallback when activities prop is empty
  const effectiveActivities = activities && activities.length > 0 ? activities : cachedActivities;

  // Debug logging removed to keep console clean in dev

  const activitiesByDay = useMemo(() => {
    const map = new Map();
    if (effectiveActivities && Array.isArray(effectiveActivities)) {
      effectiveActivities.forEach(act => {
        try {
          const d = new Date(act.date || act.timestamp || act.startDate || Date.now());
          if (isNaN(d.getTime())) {
            console.warn('[WeeklyCalendar] Invalid date for activity:', act);
            return;
          }
          const key = getLocalDateString(d);
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(act);
        } catch (e) {
          console.warn('[WeeklyCalendar] Error processing activity:', e, act);
        }
      });
    }
    // Sort each day's activities chronologically (earliest first) so that the
    // pairing logic always claims the FIRST activity of the day for that sport.
    map.forEach(arr =>
      arr.sort((a, b) => {
        const ta = new Date(a.date || a.timestamp || a.startDate || 0).getTime();
        const tb = new Date(b.date || b.timestamp || b.startDate || 0).getTime();
        return ta - tb;
      })
    );
    return map;
  }, [effectiveActivities]);

  const plannedByDay = useMemo(() => {
    const map = new Map();
    plannedWorkouts.forEach(pw => {
      if (!pw.date) return;
      // pw.date is normally an ISO string from the API ("2026-05-15T00:00:00.000Z")
      // but optimistic-update paths can leave it as a Date object — coerce to
      // string first so .slice doesn't throw and silently break the whole map.
      const key = String(pw.date).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(pw);
    });
    return map;
  }, [plannedWorkouts]);

  const handleRepeatWorkout = useCallback((pw, weeks) => {
    if (!onCopyPlannedWorkout || !pw.date) return;
    const dateOnly = String(pw.date).slice(0, 10);
    const base = new Date(`${dateOnly}T12:00:00`);
    if (isNaN(base.getTime())) return;
    for (let i = 1; i <= weeks; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + 7 * i);
      onCopyPlannedWorkout(pw, d.toISOString().slice(0, 10));
    }
  }, [onCopyPlannedWorkout]);

  const weekRangeMeta = useMemo(() => {
    if (!weekDays?.length) return { primary: '', secondary: '' };
    const start = weekDays[0];
    const end = weekDays[6];
    const fmt = (d, o) => d.toLocaleDateString(undefined, o);
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const primary = sameMonth
      ? `${fmt(start, { weekday: 'short', day: 'numeric' })} – ${fmt(end, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}`
      : `${fmt(start, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(end, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`;
    const secondary = sameMonth
      ? fmt(start, { month: 'long', year: 'numeric' })
      : `${fmt(start, { month: 'long', year: 'numeric' })} → ${fmt(end, { month: 'long', year: 'numeric' })}`;
    return { primary, secondary };
  }, [weekDays]);

  const { weekSummary, prevWeekSummary } = useMemo(() => {
    const empty = { sessions: 0, totalTss: 0, totalSec: 0, totalDist: 0, bySport: [] };
    if (!weekDays?.length) {
      return { weekSummary: empty, prevWeekSummary: { totalTss: 0 } };
    }

    const weekKeys = new Set(weekDays.map((d) => getLocalDateString(d)));
    const prevMonday = addDays(weekDays[0], -7);
    const prevWeekKeys = new Set(
      Array.from({ length: 7 }, (_, i) => getLocalDateString(addDays(prevMonday, i)))
    );

    let sessions = 0;
    let totalTss = 0;
    let totalSec = 0;
    let totalDist = 0;
    const sportMap = new Map();
    let prevTotalTss = 0;

    (effectiveActivities || []).forEach((act) => {
      const key = activityCalendarDateKey(act);
      if (!key) return;

      const inCurrent = weekKeys.has(key);
      const inPrev = prevWeekKeys.has(key);
      if (!inCurrent && !inPrev) return;

      const tss = activityTssResolved(act, userProfile);
      const sec = activityDurationSec(act);
      const dist = activityDistanceMeters(act);

      if (inPrev) {
        prevTotalTss += tss;
      }

      if (inCurrent) {
        sessions += 1;
        totalTss += tss;
        totalSec += sec;
        totalDist += dist;

        const label = normalizeSport(act.sport);
        if (!sportMap.has(label)) {
          sportMap.set(label, { sport: label, count: 0, tss: 0, sec: 0, dist: 0 });
        }
        const row = sportMap.get(label);
        row.count += 1;
        row.tss += tss;
        row.sec += sec;
        row.dist += dist;
      }
    });

    const bySport = Array.from(sportMap.values()).sort((a, b) => b.tss - a.tss || b.count - a.count);
    return {
      weekSummary: { sessions, totalTss, totalSec, totalDist, bySport },
      prevWeekSummary: { totalTss: prevTotalTss }
    };
  }, [effectiveActivities, weekDays, userProfile]);

  // Store handleActivityClick in ref whenever it changes
  useEffect(() => {
    handleActivityClickRef.current = handleActivityClick;
  });

  // Check scroll position for mobile scroll indicators (with selectedTraining)
  useEffect(() => {
    if (!isMobile || !scrollContainerRef.current) return;
    
    const checkScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) return;
      
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftScroll(scrollLeft > 10);
      setShowRightScroll(scrollLeft < scrollWidth - clientWidth - 10);
    };
    
    const container = scrollContainerRef.current;
    container.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll(); // Initial check
    
    // Also check on resize
    window.addEventListener('resize', checkScroll);
    
    return () => {
      container.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [isMobile, weekDays, selectedTraining]);

  // Check scroll position for mobile scroll indicators (without selectedTraining)
  useEffect(() => {
    if (!isMobile || !scrollContainerNoTrainingRef.current) return;
    
    const checkScroll = () => {
      const container = scrollContainerNoTrainingRef.current;
      if (!container) return;
      
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftScrollNoTraining(scrollLeft > 10);
      setShowRightScrollNoTraining(scrollLeft < scrollWidth - clientWidth - 10);
    };
    
    const container = scrollContainerNoTrainingRef.current;
    container.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll(); // Initial check
    
    // Also check on resize
    window.addEventListener('resize', checkScroll);
    
    return () => {
      container.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [isMobile, weekDays, selectedTraining]);

  // Listen for activity selection from TrainingTable
  useEffect(() => {
    const handleSelectActivity = (event) => {
      const activity = event.detail;
      if (activity && handleActivityClickRef.current) {
        // Set the week to show the activity's date
        const activityDate = new Date(activity.date || activity.startDate || activity.timestamp || Date.now());
        setCurrentWeek(startOfWeek(activityDate));
        // Trigger activity click to show details after week is set
        setTimeout(() => {
          if (handleActivityClickRef.current) {
            // Reset selected lap when switching activity from external table
            setSelectedLapNumber(null);
            handleActivityClickRef.current(activity);
          }
        }, 200);
      }
    };

    window.addEventListener('selectCalendarActivity', handleSelectActivity);
    return () => window.removeEventListener('selectCalendarActivity', handleSelectActivity);
  }, []); // Only set up listener once

  // Load user profile (zones, units) for training detail / stats when coach views an athlete
  useEffect(() => {
    const loadProfile = async () => {
      try {
        // If coach is viewing an athlete's trainings, load athlete's profile (with zones)
        if (user?.role === 'coach' && selectedAthleteId && selectedAthleteId !== user._id) {
          const response = await api.get(`/user/athlete/${selectedAthleteId}/profile`);
          if (response && response.data) {
            setUserProfile(response.data);
          }
        } else {
          // Otherwise load current user's profile
          const response = await api.get('/user/profile');
          if (response && response.data) {
            setUserProfile(response.data);
          }
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    loadProfile();
  }, [user, selectedAthleteId]);

  // Sync editing values with trainingDetail
  useEffect(() => {
    if (trainingDetail) {
      setEditingTitle(trainingDetail.title || trainingDetail.titleManual || trainingDetail.titleAuto || trainingDetail.name || '');
      setEditingCategory(trainingDetail.category || '');
    }
  }, [trainingDetail]);

  const handleActivityClick = async (activity) => {
    // Delegate fully to the parent when it supplies onSelectActivity. The
    // dashboard's own ActivityFullModal opening here clashed with the
    // weekly-summary aside (mismatched heights, mis-aligned grid) — the
    // parent can route the click however it wants (navigate to the
    // training calendar, etc.) without breaking this layout.
    if (onSelectActivity) {
      onSelectActivity(activity);
      return;
    }
    // Fallback: only open the internal modal when no parent handler exists.
    const actDateRaw = activity?.date || activity?.timestamp || activity?.startDate || activity?.start_time;
    const dayKey = actDateRaw ? getLocalDateString(new Date(actDateRaw)) : null;
    const matchPw = dayKey
      ? (plannedWorkouts || []).find(pw => {
          const pwDay = String(pw?.date || '').slice(0, 10);
          if (pwDay !== dayKey) return false;
          return planSportMatchesActivity(pw.sport, activity?.sport || activity?.type || '');
        }) || null
      : null;
    setActivityModal({ activity, plannedWorkout: matchPw });

    if (isMobile) {
      // On mobile just open the modal — no inline detail panel
      return;
    }

    setSelectedTraining(activity);
    setLoadingDetail(true);
    setTrainingDetail(null);

    if (onSelectActivity) {
      onSelectActivity(activity);
    }

    // Load detailed training data if it's a FIT or Strava activity
    try {
      if (activity.type === 'fit' && activity._id) {
        // FIT training - get full detail with records
        const trainingId = activity._id;
        if (!trainingId) {
          console.error('FIT training missing _id:', activity);
          setTrainingDetail(activity);
          return;
        }
        const detail = await getFitTraining(trainingId);
        // Ensure we have stream records when present (for downstream charts)
        if (detail && (!detail.records || detail.records.length === 0)) {
          console.warn('FIT training has no records:', trainingId);
        }
        setTrainingDetail({ ...detail, type: 'fit' });
      } else if (activity.type === 'strava' && (activity.stravaId || activity.id)) {
        // Strava activity
        const stravaId = activity.stravaId || activity.id;
        if (!stravaId) {
          console.error('Strava activity missing stravaId:', activity);
          setTrainingDetail(activity);
          return;
        }
        const detail = await getStravaActivityDetail(stravaId, stravaDetailAthleteId);
        // Convert Strava detail to training format (same as FitAnalysisPage)
        if (detail.detail && detail.streams) {
          const startDate = new Date(detail.detail.start_date);
          
          // Handle streams format - can be { time: { data: [...] } } or { time: [...] }
          const timeArray = detail.streams.time?.data || detail.streams.time || [];
          const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
          const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
          const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
          const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
          const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
          
          // Ensure all arrays are actually arrays
          if (!Array.isArray(timeArray)) {
            console.error('Time array is not an array:', timeArray);
            setTrainingDetail(activity);
            return;
          }
          
          const records = timeArray.map((t, i) => ({
            timestamp: new Date(startDate.getTime() + (t * 1000)),
            power: wattsArray[i] || null,
            heartRate: heartrateArray[i] || null,
            speed: velocityArray[i] || null,
            cadence: cadenceArray[i] || null,
            distance: distanceArray[i] || null
          }));

          const sportLower = String(activity?.sport || detail?.detail?.type || '').toLowerCase();
          const isSwim = sportLower.includes('swim');
          let laps = Array.isArray(detail.laps) ? detail.laps : [];
          if (isSwim && laps.length === 0) {
            laps = generateSwimLapsFromRecords(records);
          }
          
          const trainingData = {
            ...activity,
            type: 'strava',
            records,
            laps,
            totalElapsedTime: detail.detail.elapsed_time || 0,
            totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
            totalDistance: detail.detail.distance || 0,
            avgPower: detail.detail.average_watts || null,
            maxPower: detail.detail.max_watts || null,
            avgHeartRate: detail.detail.average_heartrate || null,
            maxHeartRate: detail.detail.max_heartrate || null,
            avgSpeed: detail.detail.average_speed || null,
            maxSpeed: detail.detail.max_speed || null,
            avgCadence: detail.detail.average_cadence || null,
            maxCadence: detail.detail.max_cadence || null,
            sport: activity.sport || detail.detail.type || 'cycling',
            // Use linked training title if available, otherwise use activity title, otherwise use Strava name
            title: activity.linkedTrainingTitle || activity.title || detail.detail.name || '',
            linkedTrainingTitle: activity.linkedTrainingTitle || null,
            category: detail.category || activity.category || ''
          };
          setTrainingDetail(trainingData);
        } else {
          setTrainingDetail(activity);
        }
      } else {
        // Regular training - use as is
        setTrainingDetail(activity);
      }
    } catch (error) {
      // Handle rate limiting (429) errors gracefully
      if (error.response?.status === 429) {
        console.warn('Strava API rate limit exceeded. Please try again in a few minutes.');
        // Show basic activity data without streams
        setTrainingDetail(activity);
        // Optionally show a notification to the user
        // You can add a toast notification here if you have one
      } else {
      console.error('Error loading training detail:', error);
      setTrainingDetail(activity); // Fallback to basic activity data
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const prevWeek = () => setCurrentWeek(d => addDays(d, -7));
  const nextWeek = () => setCurrentWeek(d => addDays(d, 7));
  const today = () => setCurrentWeek(startOfWeek(new Date()));

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const weekPlannedWorkouts = useMemo(() => {
    const start = startOfWeek(currentWeek);
    const keys = new Set(Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }));
    return (plannedWorkouts || []).filter(pw => keys.has(String(pw.date || '').slice(0, 10)));
  }, [plannedWorkouts, currentWeek]);

  const weekSummaryAside = (compact) => (
    <div className={compact ? 'min-w-[138px] flex-shrink-0 self-stretch' : 'min-h-0 min-w-0 h-full self-stretch'}>
      <WeekSummaryColumn
        summary={weekSummary}
        user={user}
        prevWeekTss={prevWeekSummary.totalTss}
        compact={compact}
        weekPlannedWorkouts={weekPlannedWorkouts}
        weekStart={startOfWeek(currentWeek)}
        tab={weekSummaryTab}
        onTabChange={setWeekSummaryTab}
      />
    </div>
  );

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg">
      <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
        <div className="min-w-0">
          {weekRangeMeta.primary && (
            <p className="text-xs sm:text-sm font-medium text-text truncate" title={weekRangeMeta.primary}>
              {weekRangeMeta.primary}
            </p>
          )}
          {weekRangeMeta.secondary && (
            <p className="text-xs sm:text-sm text-lighterText/90 truncate" title={weekRangeMeta.secondary}>
              {weekRangeMeta.secondary}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          <button
            onClick={prevWeek}
            className="p-1 sm:p-1.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 shadow-sm transition-colors"
          >
            <ChevronLeftIcon className="w-3 h-3 sm:w-4 sm:h-4 text-text" />
          </button>
          <button
            onClick={today}
            className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs sm:text-sm bg-white hover:bg-gray-50 text-gray-700 rounded-lg border border-gray-200 shadow-sm transition-colors font-medium"
          >
            Today
          </button>
          <button
            onClick={nextWeek}
            className="p-1 sm:p-1.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 shadow-sm transition-colors"
          >
            <ChevronRightIcon className="w-3 h-3 sm:w-4 sm:h-4 text-text" />
          </button>
          <button
            onClick={() => setShowRecordLactate(true)}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 text-xs sm:text-sm bg-primary text-white rounded-lg shadow-sm transition-colors font-semibold active:opacity-80 touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <PlusIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            Training
          </button>
        </div>
      </div>

      {selectedTraining ? (
        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-6'} gap-3 sm:gap-4`}>
          {/* Calendar - Mobile: Horizontal scroll, Desktop: Vertical Layout */}
          {isMobile ? (
            <div className="relative">
              {/* Left scroll indicator */}
              {showLeftScroll && (
                <button
                  onClick={() => {
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                    }
                  }}
                  className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white/80 via-white/40 to-transparent z-10 flex items-center justify-start pl-2"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                    <ChevronLeftIcon className="w-4 h-4 text-primary" />
                  </div>
                </button>
              )}
              
              {/* Right scroll indicator */}
              {showRightScroll && (
                <button
                  onClick={() => {
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                    }
                  }}
                  className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white/80 via-white/40 to-transparent z-10 flex items-center justify-end pr-2"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                    <ChevronRightIcon className="w-4 h-4 text-primary" />
                  </div>
                </button>
              )}
              
              <div 
                ref={scrollContainerRef}
                className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
              >
                <div className="flex gap-2 min-w-max">
                {weekDays.map((day, idx) => {
                  const key = getLocalDateString(day);
                  const allActivities = activitiesByDay.get(key) || [];
                  const dayPlanned = plannedByDay.get(key) || [];
                  const { pwToAct, claimedKeys } = pairPlannedWithDayActivities(dayPlanned, allActivities);
                  const dayActivities = allActivities.filter(a => !claimedKeys.has(String(a?.id ?? a?._id ?? '')));
                  const todayDateStr = getLocalDateString(new Date());
                  const dayDateStr = key;
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div
                      key={idx}
                      className={`group bg-white rounded-xl border p-2 min-w-[110px] flex-shrink-0 shadow-sm ${
                        isToday ? 'border-primary/30 ring-1 ring-primary/20' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <div className={`text-xs font-bold leading-none ${isToday ? 'text-primary' : 'text-gray-700'}`}>
                            {day.getDate()}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {dayNames[idx].substring(0, 3)}
                          </div>
                        </div>
                        {onPlanWorkout && (
                          <button onClick={() => onPlanWorkout(day)}
                            className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all opacity-0 group-hover:opacity-100"
                            title="Plan workout">
                            <PlusIcon className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        {dayPlanned.map((pw, i) => {
                          const linked = pwToAct.get(String(pw._id)) || null;
                          const matched = !!linked || pw.status === 'completed';
                          const ps = matched ? 'completed' : (dayDateStr < todayDateStr ? 'missed' : null);
                          return (
                            <PlannedMiniCard key={`pw-${i}`} pw={pw}
                              onSelect={onSelectPlannedWorkout}
                              onStart={onStartWorkout}
                              onCopy={onCopyPlannedWorkout}
                              onDelete={onDeletePlannedWorkout}
                              onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                              pairingState={ps}
                              linkedActivity={linked}
                              onSelectLinked={(act) => handleActivityClick(act)}
                            />
                          );
                        })}
                        {dayActivities.slice(0, 2).map((act, i) => {
                          const activityId = act.id || act._id;
                          const isActSelected = selectedTraining && (
                            (selectedTraining.id && String(activityId) === String(selectedTraining.id)) ||
                            (selectedTraining._id && String(activityId) === String(selectedTraining._id))
                          );
                          return (
                            <WeekActCard key={i} act={act} isSelected={isActSelected}
                              onClick={() => handleActivityClick(act)}
                              catBadgeStyle={catBadgeStyle} catLabel={catLabel}
                              compact={true} />
                          );
                        })}
                        {dayActivities.length > 2 && (
                          <div className="text-[10px] text-gray-400 text-center">+{dayActivities.length - 2}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!activityModal && weekSummaryAside(true)}
                </div>
              </div>
            </div>
          ) : (
          <div className="flex flex-col gap-2 lg:col-span-1 w-full max-w-[min(100%,520px)] min-w-0">
            {weekDays.map((day, idx) => {
              const key = getLocalDateString(day);
              const allActivities = activitiesByDay.get(key) || [];
              const dayPlanned = plannedByDay.get(key) || [];
              const { pwToAct, claimedKeys } = pairPlannedWithDayActivities(dayPlanned, allActivities);
              const dayActivities = allActivities.filter(a => !claimedKeys.has(String(a?.id ?? a?._id ?? '')));
              const todayDateStr = getLocalDateString(new Date());
              const dayDateStr = key;
              const isToday = isSameDay(day, new Date());

              const dayCard = (
                <div
                  className={`group bg-white rounded-xl border p-1.5 shadow-sm ${
                    isToday ? 'border-primary/30 ring-1 ring-primary/20' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <div className={`text-sm font-bold leading-none ${isToday ? 'text-primary' : 'text-gray-700'}`}>
                        {day.getDate()}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {dayNames[idx].substring(0, 3)}
                      </div>
                    </div>
                    {onPlanWorkout && (
                      <button onClick={() => onPlanWorkout(day)}
                        className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all opacity-0 group-hover:opacity-100"
                        title="Plan workout">
                        <PlusIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayPlanned.map((pw, i) => {
                      const linked = pwToAct.get(String(pw._id)) || null;
                      const matched = !!linked || pw.status === 'completed';
                      const ps = matched ? 'completed' : (dayDateStr < todayDateStr ? 'missed' : null);
                      return (
                        <PlannedMiniCard key={`pw-${i}`} pw={pw}
                          onSelect={onSelectPlannedWorkout}
                          onStart={onStartWorkout}
                          onCopy={onCopyPlannedWorkout}
                          onDelete={onDeletePlannedWorkout}
                          onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                          pairingState={ps}
                          linkedActivity={linked}
                          onSelectLinked={(act) => handleActivityClick(act)}
                        />
                      );
                    })}
                    {dayActivities.slice(0, 2).map((act, i) => {
                      const activityId = act.id || act._id;
                      const isActSelected = selectedTraining && (
                        (selectedTraining.id && String(activityId) === String(selectedTraining.id)) ||
                        (selectedTraining._id && String(activityId) === String(selectedTraining._id))
                      );
                      return (
                        <WeekActCard key={i} act={act} isSelected={isActSelected}
                          onClick={() => handleActivityClick(act)}
                          catBadgeStyle={catBadgeStyle} catLabel={catLabel}
                          compact={true} />
                      );
                    })}
                    {dayActivities.length > 2 && (
                      <div className="text-[11px] text-gray-400 text-center">+{dayActivities.length - 2} more</div>
                    )}
                  </div>
                </div>
              );

              if (idx === 6) {
                // Hide the weekly summary aside when an activity has been
                // tapped — the modal overlay + an "always-on" summary card
                // next to a possibly-tiny Sunday card produced a visually
                // broken row (summary much taller than the day, with the
                // expanded training pulling layout further out of alignment).
                if (activityModal) {
                  return <div key="sun-only-row">{dayCard}</div>;
                }
                return (
                  <div key="sun-summary-row" className="flex flex-row gap-2 w-full min-w-0 items-stretch">
                    <div className="min-w-0 flex-1">{dayCard}</div>
                    <div className="w-[min(200px,44%)] shrink-0 self-stretch">{weekSummaryAside(false)}</div>
                  </div>
                );
              }

              return (
                <div key={idx}>
                  {dayCard}
                </div>
              );
            })}
          </div>
          )}

          {/* Training Details - Right Side - Much Wider */}
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 shadow-md p-2 sm:p-3 md:p-4 ${isMobile ? 'w-full mt-3' : 'lg:col-span-5'}`}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 flex-1">
                  {isEditingTitle ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="flex-1 px-3 py-2 border-2 border-white/30 rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent bg-white/10 backdrop-blur-md text-text shadow-sm"
                        autoFocus
                      />
                      <button
                        onClick={async () => {
                          try {
                            setSaving(true);
                            const title = editingTitle.trim();
                            if (trainingDetail.type === 'fit' && trainingDetail._id) {
                              await updateFitTraining(trainingDetail._id, { title });
                              // Reload FIT training detail
                              const detail = await getFitTraining(trainingDetail._id);
                              setTrainingDetail({ ...detail, type: 'fit' });
                              // Update selectedTraining to reflect the new title
                              setSelectedTraining(prev => prev ? { ...prev, title: title, titleManual: title } : null);
                              // Notify parent component about the update
                              if (onActivityUpdate) {
                                onActivityUpdate({
                                  type: 'fit',
                                  _id: trainingDetail._id,
                                  id: `fit-${trainingDetail._id}`,
                                  title: title,
                                  titleManual: title
                                });
                              }
                            } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                              await updateStravaActivity(trainingDetail.id, { title });
                              // Reload Strava activity detail
                              const detail = await getStravaActivityDetail(trainingDetail.id, stravaDetailAthleteId);
                              // Convert Strava detail to training format
                              if (detail.detail && detail.streams) {
                                const startDate = new Date(detail.detail.start_date);
                                const timeArray = detail.streams.time?.data || detail.streams.time || [];
                                const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
                                const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
                                const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
                                const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
                                const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
                                
                                if (Array.isArray(timeArray)) {
                                  const records = timeArray.map((t, i) => ({
                                    timestamp: new Date(startDate.getTime() + (t * 1000)),
                                    power: wattsArray[i] || null,
                                    heartRate: heartrateArray[i] || null,
                                    speed: velocityArray[i] || null,
                                    cadence: cadenceArray[i] || null,
                                    distance: distanceArray[i] || null
                                  }));
                                
                                const sportLower = String(trainingDetail?.sport || detail?.detail?.type || '').toLowerCase();
                                const isSwim = sportLower.includes('swim');
                                let laps = Array.isArray(detail.laps) ? detail.laps : [];
                                if (isSwim && laps.length === 0) {
                                  laps = generateSwimLapsFromRecords(records);
                                }
                                  
                                  setTrainingDetail({
                                    ...selectedTraining,
                                    type: 'strava',
                                    records,
                                    laps,
                                    totalElapsedTime: detail.detail.elapsed_time || 0,
                                    totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                    totalDistance: detail.detail.distance || 0,
                                    avgPower: detail.detail.average_watts || null,
                                    maxPower: detail.detail.max_watts || null,
                                    avgHeartRate: detail.detail.average_heartrate || null,
                                    maxHeartRate: detail.detail.max_heartrate || null,
                                    avgSpeed: detail.detail.average_speed || null,
                                    maxSpeed: detail.detail.max_speed || null,
                                    avgCadence: detail.detail.average_cadence || null,
                                    maxCadence: detail.detail.max_cadence || null,
                                    sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                    // Preserve linked training title if it exists, otherwise use saved title or Strava name
                                    title: selectedTraining?.linkedTrainingTitle || title || detail.detail.name || '',
                                    linkedTrainingTitle: selectedTraining?.linkedTrainingTitle || null,
                                    category: detail.category || trainingDetail.category || ''
                                  });
                                } else {
                                  setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                                }
                              } else {
                                setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                              }
                              // Update selectedTraining to reflect the new title
                              setSelectedTraining(prev => prev ? { ...prev, title: title, titleManual: title, name: title } : null);
                              // Notify parent component about the update
                              if (onActivityUpdate) {
                                onActivityUpdate({
                                  type: 'strava',
                                  id: trainingDetail.id,
                                  stravaId: trainingDetail.id,
                                  title: title,
                                  titleManual: title,
                                  name: title
                                });
                              }
                            }
                            setIsEditingTitle(false);
                          } catch (error) {
                            console.error('Error saving title:', error);
                            alert('Error saving title');
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                        className="p-1.5 bg-white/30 backdrop-blur-md text-text rounded-lg hover:bg-white/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm border border-white/20"
                        title="Save title"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingTitle(false);
                          setEditingTitle(trainingDetail?.title || trainingDetail?.name || '');
                        }}
                        className="p-1.5 bg-white/20 backdrop-blur-md text-text rounded-lg hover:bg-white/30 transition-all shadow-sm border border-white/15"
                        title="Cancel"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 group">
                      <h4 
                        className="text-base font-semibold text-text flex-1 cursor-pointer"
                        onClick={() => {
                          setEditingTitle(trainingDetail?.title || trainingDetail?.name || '');
                          setIsEditingTitle(true);
                        }}
                      >
                        {trainingDetail?.linkedTrainingTitle || trainingDetail?.title || trainingDetail?.name || selectedTraining?.linkedTrainingTitle || selectedTraining?.title || selectedTraining?.name || 'Training Details'}
                      </h4>
                      <button
                        onClick={() => {
                          setEditingTitle(trainingDetail?.title || trainingDetail?.name || '');
                          setIsEditingTitle(true);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-lighterText hover:text-text hover:bg-white/20 rounded-lg transition-all"
                        title="Edit title"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  
                  {/* Category */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isEditingCategory ? (
                      <>
                        <select
                          value={editingCategory}
                          onChange={(e) => setEditingCategory(e.target.value)}
                          className="px-2 py-1.5 border border-white/20 rounded-lg bg-white/10 backdrop-blur-md text-xs text-text focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent"
                          autoFocus
                        >
                          <option value="">None</option>
                          <option value="endurance">Endurance</option>
                          <option value="tempo">Tempo</option>
                          <option value="threshold">Threshold</option>
                          <option value="vo2max">VO2max</option>
                          <option value="anaerobic">Anaerobic</option>
                          <option value="recovery">Recovery</option>
                        </select>
                        <button
                          onClick={async () => {
                            try {
                              setSaving(true);
                              const category = editingCategory || null;
                              if (trainingDetail.type === 'fit' && trainingDetail._id) {
                                await updateFitTraining(trainingDetail._id, { category });
                                // Reload FIT training detail
                                const detail = await getFitTraining(trainingDetail._id);
                                setTrainingDetail({ ...detail, type: 'fit' });
                                // Notify parent component about the update
                                if (onActivityUpdate) {
                                  onActivityUpdate({
                                    type: 'fit',
                                    _id: trainingDetail._id,
                                    id: `fit-${trainingDetail._id}`,
                                    category: category
                                  });
                                }
                              } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                                await updateStravaActivity(trainingDetail.id, { category: category || null });
                                // Reload Strava activity detail
                                const detail = await getStravaActivityDetail(trainingDetail.id, stravaDetailAthleteId);
                                // Convert Strava detail to training format
                                if (detail.detail && detail.streams) {
                                  const startDate = new Date(detail.detail.start_date);
                                  const timeArray = detail.streams.time?.data || detail.streams.time || [];
                                  const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
                                  const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
                                  const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
                                  const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
                                  const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
                                  
                                  if (Array.isArray(timeArray)) {
                                    const records = timeArray.map((t, i) => ({
                                      timestamp: new Date(startDate.getTime() + (t * 1000)),
                                      power: wattsArray[i] || null,
                                      heartRate: heartrateArray[i] || null,
                                      speed: velocityArray[i] || null,
                                      cadence: cadenceArray[i] || null,
                                      distance: distanceArray[i] || null
                                    }));

                                    const sportLower = String(trainingDetail?.sport || detail?.detail?.type || '').toLowerCase();
                                    const isSwim = sportLower.includes('swim');
                                    let laps = Array.isArray(detail.laps) ? detail.laps : [];
                                    if (isSwim && laps.length === 0) {
                                      laps = generateSwimLapsFromRecords(records);
                                    }
                                    
                                    setTrainingDetail({
                                      ...selectedTraining,
                                      type: 'strava',
                                      records,
                                      laps,
                                      totalElapsedTime: detail.detail.elapsed_time || 0,
                                      totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                      totalDistance: detail.detail.distance || 0,
                                      avgPower: detail.detail.average_watts || null,
                                      maxPower: detail.detail.max_watts || null,
                                      avgHeartRate: detail.detail.average_heartrate || null,
                                      maxHeartRate: detail.detail.max_heartrate || null,
                                      avgSpeed: detail.detail.average_speed || null,
                                      maxSpeed: detail.detail.max_speed || null,
                                      avgCadence: detail.detail.average_cadence || null,
                                      maxCadence: detail.detail.max_cadence || null,
                                      sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                      // Preserve linked training title if it exists, otherwise use trainingDetail title or Strava name
                                      title: trainingDetail.linkedTrainingTitle || trainingDetail.title || detail.detail.name || '',
                                      linkedTrainingTitle: trainingDetail.linkedTrainingTitle || null,
                                      category: detail.category || category || null
                                    });
                                  } else {
                                    setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                                  }
                                } else {
                                  setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                                }
                              }
                              // Notify parent component about the update
                              if (onActivityUpdate) {
                                onActivityUpdate({
                                  type: 'strava',
                                  id: trainingDetail.id,
                                  stravaId: trainingDetail.id,
                                  category: category
                                });
                              }
                              // Dispatch event to notify other components (e.g., CalendarView) about the update
                              window.dispatchEvent(new CustomEvent('activityUpdated', {
                                detail: {
                                  type: 'strava',
                                  id: trainingDetail.id,
                                  stravaId: trainingDetail.id,
                                  category: category
                                }
                              }));
                              setIsEditingCategory(false);
                            } catch (error) {
                              console.error('Error saving category:', error);
                              alert('Error saving category');
                            } finally {
                              setSaving(false);
                            }
                          }}
                          disabled={saving}
                          className="p-1.5 bg-white/30 backdrop-blur-md text-text rounded-lg hover:bg-white/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm border border-white/20"
                          title="Save category"
                        >
                          <CheckIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingCategory(false);
                            setEditingCategory(trainingDetail?.category || '');
                          }}
                          className="p-1.5 bg-white/20 backdrop-blur-md text-text rounded-lg hover:bg-white/30 transition-all shadow-sm border border-white/15"
                          title="Cancel"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <span
                          className="px-2.5 py-1 rounded-lg text-xs font-medium border"
                          style={catBadgeStyle(trainingDetail?.category)}
                        >
                          {trainingDetail?.category ? catLabel(trainingDetail.category) : 'Category'}
                        </span>
                        <button
                          onClick={() => {
                            setEditingCategory(trainingDetail?.category || '');
                            setIsEditingCategory(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-lighterText hover:text-text hover:bg-white/20 rounded-lg transition-all"
                          title="Edit category"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Close button */}
                <button
                  onClick={() => {
                    setSelectedTraining(null);
                    setTrainingDetail(null);
                    setIsEditingTitle(false);
                    setIsEditingCategory(false);
                  }}
                  className="text-lighterText hover:text-text p-1.5 rounded-lg hover:bg-white/20 flex-shrink-0 transition-all"
                  title="Close"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {loadingDetail ? (
                <div className="flex items-center justify-center py-8 sm:py-12">
                  <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary"></div>
                </div>
              ) : trainingDetail ? (
                <div className="space-y-3 sm:space-y-4">
                  {/* Training Stats */}
                  <TrainingStats 
                    training={trainingDetail} 
                    user={user}
                    onUpdate={async () => {
                      // Reload detail if needed
                      try {
                        if (trainingDetail.type === 'fit' && trainingDetail._id) {
                          const detail = await getFitTraining(trainingDetail._id);
                          setTrainingDetail({ ...detail, type: 'fit' });
                        } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                          const detail = await getStravaActivityDetail(trainingDetail.id, stravaDetailAthleteId);
                          // Convert Strava detail to training format
                          if (detail.detail && detail.streams) {
                            const startDate = new Date(detail.detail.start_date);
                            const timeArray = detail.streams.time?.data || detail.streams.time || [];
                            const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
                            const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
                            const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
                            const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
                            const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
                            
                            if (Array.isArray(timeArray)) {
                              const records = timeArray.map((t, i) => ({
                                timestamp: new Date(startDate.getTime() + (t * 1000)),
                                power: wattsArray[i] || null,
                                heartRate: heartrateArray[i] || null,
                                speed: velocityArray[i] || null,
                                cadence: cadenceArray[i] || null,
                                distance: distanceArray[i] || null
                              }));

                              const sportLower = String(trainingDetail?.sport || detail?.detail?.type || '').toLowerCase();
                              const isSwim = sportLower.includes('swim');
                              let laps = Array.isArray(detail.laps) ? detail.laps : [];
                              if (isSwim && laps.length === 0) {
                                laps = generateSwimLapsFromRecords(records);
                              }
                              
                              setTrainingDetail({
                                ...selectedTraining,
                                type: 'strava',
                                records,
                                laps,
                                totalElapsedTime: detail.detail.elapsed_time || 0,
                                totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                totalDistance: detail.detail.distance || 0,
                                avgPower: detail.detail.average_watts || null,
                                maxPower: detail.detail.max_watts || null,
                                avgHeartRate: detail.detail.average_heartrate || null,
                                maxHeartRate: detail.detail.max_heartrate || null,
                                avgSpeed: detail.detail.average_speed || null,
                                maxSpeed: detail.detail.max_speed || null,
                                avgCadence: detail.detail.average_cadence || null,
                                maxCadence: detail.detail.max_cadence || null,
                                sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                // Preserve linked training title if it exists, otherwise use trainingDetail title or Strava name
                                title: trainingDetail.linkedTrainingTitle || trainingDetail.title || detail.detail.name || '',
                                linkedTrainingTitle: trainingDetail.linkedTrainingTitle || null,
                                category: detail.category || trainingDetail.category || ''
                              });
                            } else {
                              setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                            }
                          } else {
                            setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                          }
                        }
                      } catch (error) {
                        console.error('Error reloading training detail:', error);
                      }
                    }}
                  />

                  {/* Laps section */}
                  {(trainingDetail.records && trainingDetail.records.length > 0) ||
                   (trainingDetail.laps && trainingDetail.laps.length > 0) ? (
                    <div className="mt-4 sm:mt-6">
                      {/* Laps Table */}
                      {trainingDetail.laps && trainingDetail.laps.length > 0 && (
                        <div className="mt-3 sm:mt-4">
                          <LapsTable 
                            training={trainingDetail}
                            onUpdate={async () => {
                              // Reload detail if needed
                              try {
                                if (trainingDetail.type === 'fit' && trainingDetail._id) {
                                  const detail = await getFitTraining(trainingDetail._id);
                                  setTrainingDetail({ ...detail, type: 'fit' });
                                } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                                  const detail = await getStravaActivityDetail(trainingDetail.id, stravaDetailAthleteId);
                                  if (detail.detail && detail.streams) {
                                    const startDate = new Date(detail.detail.start_date);
                                    const timeArray = detail.streams.time?.data || detail.streams.time || [];
                                    const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
                                    const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
                                    const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
                                    const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
                                    const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
                                    
                                    if (Array.isArray(timeArray)) {
                                      const records = timeArray.map((t, i) => ({
                                        timestamp: new Date(startDate.getTime() + (t * 1000)),
                                        power: wattsArray[i] || null,
                                        heartRate: heartrateArray[i] || null,
                                        speed: velocityArray[i] || null,
                                        cadence: cadenceArray[i] || null,
                                        distance: distanceArray[i] || null
                                      }));

                                      const sportLower = String(trainingDetail?.sport || detail?.detail?.type || '').toLowerCase();
                                      const isSwim = sportLower.includes('swim');
                                      let laps = Array.isArray(detail.laps) ? detail.laps : [];
                                      if (isSwim && laps.length === 0) {
                                        laps = generateSwimLapsFromRecords(records);
                                      }
                                      
                                      setTrainingDetail({
                                        ...selectedTraining,
                                        type: 'strava',
                                        records,
                                        laps,
                                        totalElapsedTime: detail.detail.elapsed_time || 0,
                                        totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                        totalDistance: detail.detail.distance || 0,
                                        avgPower: detail.detail.average_watts || null,
                                        maxPower: detail.detail.max_watts || null,
                                        avgHeartRate: detail.detail.average_heartrate || null,
                                        maxHeartRate: detail.detail.max_heartrate || null,
                                        avgSpeed: detail.detail.average_speed || null,
                                        maxSpeed: detail.detail.max_speed || null,
                                        avgCadence: detail.detail.average_cadence || null,
                                        maxCadence: detail.detail.max_cadence || null,
                                        sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                        title: trainingDetail.linkedTrainingTitle || trainingDetail.title || detail.detail.name || '',
                                        linkedTrainingTitle: trainingDetail.linkedTrainingTitle || null,
                                        category: detail.category || trainingDetail.category || ''
                                      });
                                    }
                                  }
                                }
                              } catch (error) {
                                console.error('Error reloading training detail:', error);
                              }
                            }}
                            user={user}
                            selectedLapNumber={selectedLapNumber}
                            onSelectLapNumber={setSelectedLapNumber}
                            disableZoom={true}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-lighterText text-center py-8 bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                      Training has no data to display charts (no records or laps)
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-lighterText text-center py-8">
                  Loading training details...
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        /* Calendar - Mobile: Horizontal scroll, Desktop: Grid Layout */
        isMobile ? (
          <div className="relative">
            {/* Left scroll indicator */}
            {showLeftScrollNoTraining && (
              <button
                onClick={() => {
                  if (scrollContainerNoTrainingRef.current) {
                    scrollContainerNoTrainingRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                  }
                }}
                className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white/80 via-white/40 to-transparent z-10 flex items-center justify-start pl-2"
              >
                <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                  <ChevronLeftIcon className="w-4 h-4 text-primary" />
                </div>
              </button>
            )}
            
            {/* Right scroll indicator */}
            {showRightScrollNoTraining && (
              <button
                onClick={() => {
                  if (scrollContainerNoTrainingRef.current) {
                    scrollContainerNoTrainingRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                  }
                }}
                className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white/80 via-white/40 to-transparent z-10 flex items-center justify-end pr-2"
              >
                <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                  <ChevronRightIcon className="w-4 h-4 text-primary" />
                </div>
              </button>
            )}
            
            <div 
              ref={scrollContainerNoTrainingRef}
              className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
            >
              <div className="flex gap-2 min-w-max">
          {weekDays.map((day, idx) => {
            const key = getLocalDateString(day);
            const allActivities = activitiesByDay.get(key) || [];
            const dayPlanned = plannedByDay.get(key) || [];
            const { pwToAct, claimedKeys } = pairPlannedWithDayActivities(dayPlanned, allActivities);
            const dayActivities = allActivities.filter(a => !claimedKeys.has(String(a?.id ?? a?._id ?? '')));
            const todayDateStr = getLocalDateString(new Date());
            const dayDateStr = key;
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={idx}
                className={`group bg-white rounded-xl border p-2 min-w-[130px] flex-shrink-0 shadow-sm ${
                  isToday ? 'border-primary/30 ring-1 ring-primary/20' : 'border-gray-200'
                }`}
              >
                {(() => {
                  const ps = periodsByDate.get(key);
                  if (!ps || !ps.length) return null;
                  const starting = ps.filter(p => p.startDate === key);
                  return (
                    <div className="mb-1">
                      <div className="flex gap-px" style={{ height: 4 }} title={ps.map(p => `${p.type}${p.notes ? ` — ${p.notes}` : ''}`).join(', ')}>
                        {ps.slice(0, 3).map((p, i) => (
                          <div key={p._id || i} style={{ flex: 1, background: periodColor(p), borderRadius: 2 }} />
                        ))}
                      </div>
                      {starting.map(p => (
                        <div key={`lbl-${p._id}`} className="mt-0.5 text-[9px] font-bold uppercase tracking-wide leading-none truncate"
                          style={{ color: periodColor(p) }} title={`${p.type}${p.notes ? ` — ${p.notes}` : ''}`}>
                          {(p.notes && p.notes.trim()) || p.type}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div>
                      <div className={`text-sm font-bold leading-none ${isToday ? 'text-primary' : 'text-gray-700'}`}>
                        {day.getDate()}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {dayNames[idx].substring(0, 3)}
                      </div>
                    </div>
                    {(() => {
                      const dp = dayPlanByDate.get(key);
                      if (!dp || (!dp.title && !dp.category)) return null;
                      const cat = dp.category ? getCategory(dp.category) : null;
                      const tc = dayThemePresetColor(dp.title);
                      // Display-only chip on Dashboard. Editing happens on the
                      // Calendar tab where the full DayPlanEditSheet lives.
                      const style = tc
                        ? { background: hexToRgba(tc, 0.12), color: tc, borderColor: hexToRgba(tc, 0.35) }
                        : (cat ? { background: hexToRgba(cat.color, 0.12), color: cat.color, borderColor: hexToRgba(cat.color, 0.35) } : { background: 'rgba(118,126,181,.12)', color: '#5E6590', borderColor: 'rgba(118,126,181,.25)' });
                      return (
                        <span
                          className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded font-bold border leading-none truncate max-w-[80px]"
                          style={style}
                          title={dp.notes || dp.title || (cat?.label || dp.category)}
                        >
                          {dp.title || cat?.label || dp.category}
                        </span>
                      );
                    })()}
                  </div>
                  {onPlanWorkout && (
                    <button onClick={() => onPlanWorkout(day)}
                      className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all opacity-0 group-hover:opacity-100"
                      title="Plan workout">
                      <PlusIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {dayPlanned.map((pw, i) => {
                    const linked = pwToAct.get(String(pw._id)) || null;
                    const matched = !!linked || pw.status === 'completed';
                    const ps = matched ? 'completed' : (dayDateStr < todayDateStr ? 'missed' : null);
                    return (
                      <PlannedMiniCard key={`pw-${i}`} pw={pw}
                        onSelect={onSelectPlannedWorkout}
                        onStart={onStartWorkout}
                        onCopy={onCopyPlannedWorkout}
                        onDelete={onDeletePlannedWorkout}
                        onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                        pairingState={ps}
                        linkedActivity={linked}
                        onSelectLinked={(act) => handleActivityClick(act)}
                      />
                    );
                  })}
                  {dayActivities.slice(0, 2).map((act, i) => (
                    <WeekActCard key={i} act={act} isSelected={false}
                      onClick={() => handleActivityClick(act)}
                      catBadgeStyle={catBadgeStyle} catLabel={catLabel}
                      compact={true} />
                  ))}
                  {dayActivities.length > 2 && (
                    <div className="text-[10px] text-gray-400 text-center">+{dayActivities.length - 2}</div>
                  )}
                </div>
              </div>
            );
          })}
              {weekSummaryAside(true)}
              </div>
            </div>
          </div>
        ) : (
          /* 7 day columns + 1 stats column. The previous grid-cols-8 gave
             the stats column the same width as a day column, which wasn't
             enough room for "163.37 km · 182" rows — those forced the row
             to overflow and the dashboard card scrolled horizontally. New
             template: each day column collapses freely [minmax 0 to 1fr],
             stats column gets a 158px floor plus a 1.25fr growth weight. */
          <div
            className="grid gap-2 sm:gap-3"
            style={{
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr)) minmax(158px, 1.25fr)',
            }}
          >
            {weekDays.map((day, idx) => {
              const key = getLocalDateString(day);
              const allActivities = activitiesByDay.get(key) || [];
              const dayPlanned = plannedByDay.get(key) || [];
              const { pwToAct, claimedKeys } = pairPlannedWithDayActivities(dayPlanned, allActivities);
              const dayActivities = allActivities.filter(a => !claimedKeys.has(String(a?.id ?? a?._id ?? '')));
              const todayDateStr = getLocalDateString(new Date());
              const dayDateStr = key;
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={idx}
                  className={`group bg-white rounded-xl border p-2 min-w-0 shadow-sm ${
                    isToday ? 'border-primary/30 ring-1 ring-primary/20' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className={`text-base font-bold leading-none ${isToday ? 'text-primary' : 'text-gray-700'}`}>
                        {day.getDate()}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">
                        {dayNames[idx].substring(0, 3)}
                      </div>
                    </div>
                    {onPlanWorkout && (
                      <button
                        onClick={() => onPlanWorkout(day)}
                        className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all opacity-0 group-hover:opacity-100"
                        title="Plan workout"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {dayPlanned.map((pw, i) => {
                      const linked = pwToAct.get(String(pw._id)) || null;
                      const matched = !!linked || pw.status === 'completed';
                      const ps = matched ? 'completed' : (dayDateStr < todayDateStr ? 'missed' : null);
                      return (
                        <PlannedMiniCard
                          key={`pw-${i}`}
                          pw={pw}
                          onSelect={onSelectPlannedWorkout}
                          onStart={onStartWorkout}
                          onCopy={onCopyPlannedWorkout}
                          onDelete={onDeletePlannedWorkout}
                          onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                          pairingState={ps}
                          linkedActivity={linked}
                          onSelectLinked={(act) => handleActivityClick(act)}
                        />
                      );
                    })}
                    {dayActivities.map((act, i) => (
                      <WeekActCard key={i} act={act} isSelected={false}
                        onClick={() => handleActivityClick(act)}
                        catBadgeStyle={catBadgeStyle} catLabel={catLabel}
                        compact={false} />
                    ))}
                  </div>
                </div>
              );
            })}
            {!activityModal && (
              <div className="min-w-0 flex flex-col justify-start">{weekSummaryAside(false)}</div>
            )}
          </div>
        )
      )}

      {/* Shared activity modal — same UI as Training Calendar */}
      {activityModal && (
        <ActivityFullModal
          activity={activityModal.activity}
          plannedWorkout={activityModal.plannedWorkout}
          onClose={() => setActivityModal(null)}
          onAddLactate={
            onAddLactate
              ? (a, lapIndex) => { setActivityModal(null); onAddLactate(a, lapIndex); }
              : (a) => {
                  const rawId = String(a?.id ?? a?._id ?? '');
                  const id = rawId.startsWith('strava-') || rawId.startsWith('fit-') || rawId.startsWith('training-') || rawId.startsWith('regular-')
                    ? rawId : `strava-${rawId}`;
                  setActivityModal(null);
                  navigate(`/training-calendar/${id}`);
                }
          }
          onOpenFull={() => {
            const a = activityModal.activity;
            const rawId = String(a?.id ?? a?._id ?? '');
            let prefix = '';
            if (a?.type === 'strava' || a?.stravaId) prefix = 'strava-';
            else if (a?.type === 'fit') prefix = 'fit-';
            else prefix = 'training-';
            // If id already prefixed (CalendarView merges activities with prefix), skip
            const id = rawId.startsWith('strava-') || rawId.startsWith('fit-') || rawId.startsWith('training-') || rawId.startsWith('regular-')
              ? rawId
              : `${prefix}${rawId}`;
            setActivityModal(null);
            navigate(`/training-calendar/${id}`);
          }}
          athleteId={selectedAthleteId}
          onDeleted={onActivityDeleted}
        />
      )}

      {showRecordLactate && ReactDOM.createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'auto' }}>
          <RecordLactateModal
            onClose={() => setShowRecordLactate(false)}
            onSave={async (data) => {
              await createFieldLactateMeasurement({
                ...data,
                athleteId: selectedAthleteId || user?._id || undefined,
              });
              setShowRecordLactate(false);
            }}
          />
        </div>,
        document.getElementById('app-modal-root') || document.body
      )}
    </div>
  );
};

export default WeeklyCalendar;
