import { resolveActivityTss } from '../../utils/computeTss';
import { formatDistanceForUser } from '../../utils/unitsConverter';
import { computeEstTSS } from './WorkoutBuilder';
import { plannerSportKey, stepTotalSecs } from './WorkoutPlanModal';

export function toLocalDateStr(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function plannedWorkoutSecs(pw) {
  return (stepTotalSecs(pw?.steps) || 0) || Number(pw?.plannedDuration) || 0;
}

export function plannedWorkoutDistM(pw) {
  const direct = Number(pw?.plannedDistance);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (!Array.isArray(pw?.steps)) return 0;
  return pw.steps.reduce((sum, s) => {
    if (s?.durationType === 'distance') return sum + (Number(s.distanceMeters) || 0);
    return sum;
  }, 0);
}

export function plannedWorkoutTss(pw, context) {
  const direct = Number(pw?.targetTss);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (Array.isArray(pw?.steps) && pw.steps.length) return computeEstTSS(pw.steps, context) || 0;
  return 0;
}

export function completedSecs(t) {
  const v = t?.totalTimerTime || t?.moving_time || t?.movingTime
    || t?.totalElapsedTime || t?.elapsedTime || t?.elapsed_time || t?.duration || t?.durationSeconds;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function completedDistM(t) {
  const d = t?.distance ?? t?.totalDistance ?? t?.total_distance;
  if (d == null) return 0;
  if (typeof d === 'string') {
    const s = d.trim().toLowerCase();
    const km = s.match(/^([\d.]+)\s*km$/);
    if (km) return parseFloat(km[1]) * 1000;
    const m = s.match(/^([\d.]+)\s*m$/);
    if (m) return parseFloat(m[1]);
  }
  const n = Number(d);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 500 ? n : n * 1000;
}

export function completedTss(t, userProfile, user) {
  return resolveActivityTss(t, userProfile, { user }) || Number(t?.tss || t?.TSS || t?.totalTSS) || 0;
}

const SPORT_COLORS = { bike: '#767EB5', run: '#f97316', swim: '#38bdf8', other: '#94a3b8' };

export function sportColorForSummary(sport) {
  const sk = plannerSportKey(sport);
  return SPORT_COLORS[sk] || SPORT_COLORS.other;
}

export function formatWeekDurationSeconds(sec) {
  if (!sec || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  return `${m}m`;
}

export function formatDecimalHours(sec) {
  if (!sec || sec <= 0) return null;
  return `${(sec / 3600).toFixed(1)}h`;
}

export function filterItemsForWeek(items, weekStart, dateField = 'date') {
  const ws = startOfWeek(weekStart);
  const we = addDays(ws, 7);
  return (items || []).filter((item) => {
    const raw = item?.[dateField] || item?.startDate || item?.start_date;
    const d = new Date(raw);
    return d >= ws && d < we;
  });
}

/** Build done + planned week summary (calendar-style). */
export function buildPlannerWeekSummary({
  planned = [],
  trainings = [],
  weekStart,
  context = {},
  userProfile = null,
  user = null,
  prevWeekTrainings = [],
}) {
  const weekPlanned = filterItemsForWeek(planned, weekStart);
  const weekDone = filterItemsForWeek(trainings, weekStart);

  const sportMap = new Map();
  let totalTss = 0;
  let totalSec = 0;
  let totalDist = 0;

  weekDone.forEach((t) => {
    const tss = completedTss(t, userProfile, user);
    const sec = completedSecs(t);
    const dist = completedDistM(t);
    totalTss += tss;
    totalSec += sec;
    totalDist += dist;
    const label = plannerSportKey(t.sport || t.sport_type || t.type);
    if (!sportMap.has(label)) sportMap.set(label, { sport: label, tss: 0, sec: 0, dist: 0, count: 0 });
    const row = sportMap.get(label);
    row.tss += tss;
    row.sec += sec;
    row.dist += dist;
    row.count += 1;
  });

  const plannedBySport = new Map();
  let plannedTotalSec = 0;
  let plannedTotalTss = 0;
  let plannedTotalDist = 0;

  weekPlanned.forEach((pw) => {
    const sec = plannedWorkoutSecs(pw);
    const tss = plannedWorkoutTss(pw, context);
    const dist = plannedWorkoutDistM(pw);
    plannedTotalSec += sec;
    plannedTotalTss += tss;
    plannedTotalDist += dist;
    const label = plannerSportKey(pw.sport);
    if (!plannedBySport.has(label)) plannedBySport.set(label, { sport: label, sec: 0, tss: 0, dist: 0, count: 0 });
    const row = plannedBySport.get(label);
    row.sec += sec;
    row.tss += tss;
    row.dist += dist;
    row.count += 1;
  });

  let prevTotalTss = 0;
  (prevWeekTrainings || []).forEach((t) => {
    prevTotalTss += completedTss(t, userProfile, user);
  });

  return {
    weekPlanned,
    weekDone,
    done: {
      sessions: weekDone.length,
      totalTss,
      totalSec,
      totalDist,
      bySport: Array.from(sportMap.values()).sort((a, b) => b.tss - a.tss || b.sec - a.sec),
    },
    planned: {
      count: weekPlanned.length,
      totalTss: plannedTotalTss,
      totalSec: plannedTotalSec,
      totalDist: plannedTotalDist,
      bySport: Array.from(plannedBySport.values()).sort((a, b) => b.tss - a.tss || b.sec - a.sec),
    },
    prevTotalTss,
  };
}

export function fmtDistShort(meters, user) {
  if (!meters || meters <= 0) return null;
  return formatDistanceForUser(meters, user);
}
