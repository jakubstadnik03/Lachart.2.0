/**
 * Training Timeline — the shape of a training block, three ways.
 *
 * Flow    · daily load with a true rolling 7-day line over it
 * Balance · where the time actually went, by heart-rate zone
 * vs Plan · what was planned against what happened
 *
 * The rolling window is the point of the Flow view. A "this week" total that
 * resets on Monday makes every Sunday look like a peak and every Monday like a
 * rest week — an artefact of the calendar, not of the training. A 7-day window
 * that moves with the athlete shows the load they are actually carrying.
 */
import { resolveActivityTss } from './computeTss';
import { enrichProfileForTss } from './inferThresholdsFromActivities';
import { activityCalendarDateKey, localCalendarDateKey } from './calendarDateKeys';

export const TIMELINE_VIEWS = [
  { id: 'flow', label: 'Flow', hint: 'Daily load and the 7-day total you are carrying' },
  { id: 'balance', label: 'Balance', hint: 'Where the time went, by heart-rate zone' },
  { id: 'plan', label: 'vs Plan', hint: 'Planned against actual' },
];

export const SPORT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'bike', label: 'Bike' },
  { id: 'run', label: 'Run' },
  { id: 'swim', label: 'Swim' },
];

export const ZONE_META = [
  { key: 'z1', label: 'Z1', name: 'Recovery', color: '#93C5FD' },
  { key: 'z2', label: 'Z2', name: 'Aerobic', color: '#34D399' },
  { key: 'z3', label: 'Z3', name: 'Tempo', color: '#FBBF24' },
  { key: 'z4', label: 'Z4', name: 'Threshold', color: '#FB923C' },
  { key: 'z5', label: 'Z5', name: 'VO2max', color: '#F43F5E' },
];

const SPORT_PATTERNS = {
  bike: /ride|bike|cycl|virtual|mtb/i,
  run: /run|walk|hike|treadmill/i,
  swim: /swim/i,
};

export function matchesSport(sport, filter) {
  if (filter === 'all') return true;
  const pattern = SPORT_PATTERNS[filter];
  return pattern ? pattern.test(String(sport || '')) : true;
}

function dayKeyOffset(days, ref) {
  const d = new Date(ref);
  d.setDate(d.getDate() + days);
  return localCalendarDateKey(d);
}

/** Every day in the window, oldest first — gaps included, so rest days are visible. */
function dayRange(days, endRef) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(dayKeyOffset(-i, endRef));
  return out;
}

function planDateKey(pw) {
  return String(pw?.date || '').slice(0, 10);
}

/** Planned TSS for a session, estimated from duration when not set explicitly. */
export function plannedTssFor(pw) {
  const explicit = Number(pw?.targetTss || 0);
  if (explicit > 0) return explicit;
  let secs = Number(pw?.plannedDuration || 0);
  if (!secs && Array.isArray(pw?.steps)) {
    const seen = new Set();
    secs = pw.steps.reduce((total, s) => {
      if (!s.groupId) return total + (Number(s.durationSeconds) || 0);
      if (seen.has(s.groupId)) return total;
      seen.add(s.groupId);
      const group = pw.steps.filter((x) => x.groupId === s.groupId);
      const reps = group.find((x) => x.isGroupHeader)?.groupRepeat || 1;
      return total + group.reduce((g, gs) => g + (Number(gs.durationSeconds) || 0) * reps, 0);
    }, 0);
  }
  // ~50 TSS/h is the endurance rule of thumb; better than showing a blank bar.
  return secs > 0 && secs < 24 * 3600 ? (secs / 3600) * 50 : 0;
}

/**
 * @param {object} opts
 * @param {Array}  opts.activities      calendar activities
 * @param {Array}  opts.plannedWorkouts
 * @param {Array}  opts.zoneDays        [{ date, zones:{z1..z5}, totalSec, unmeasuredSec }]
 * @param {object} opts.userProfile
 * @param {number} opts.days            window length
 * @param {string} opts.sportFilter
 * @returns {object} timeline model
 */
export function buildTrainingTimeline({
  activities = [],
  plannedWorkouts = [],
  zoneDays = [],
  userProfile = null,
  user = null,
  days = 42,
  sportFilter = 'all',
  now = new Date(),
} = {}) {
  const acts = Array.isArray(activities) ? activities : [];
  const profile = userProfile ? enrichProfileForTss(userProfile, acts) : null;
  const tssUser = user || userProfile;

  const keys = dayRange(days, now);
  const keySet = new Set(keys);

  // ── Actual load per day ──
  const actualByDay = new Map();
  const sessionsByDay = new Map();
  for (const act of acts) {
    if (!matchesSport(act?.sport, sportFilter)) continue;
    const dk = activityCalendarDateKey(act);
    if (!dk || !keySet.has(dk)) continue;
    const tss = resolveActivityTss(act, profile, { user: tssUser }) || 0;
    actualByDay.set(dk, (actualByDay.get(dk) || 0) + tss);
    if (!sessionsByDay.has(dk)) sessionsByDay.set(dk, []);
    sessionsByDay.get(dk).push({
      title: act?.title || 'Session',
      sport: act?.sport || 'other',
      tss: Math.round(tss),
    });
  }

  // ── Planned load per day ──
  const plannedByDay = new Map();
  for (const pw of Array.isArray(plannedWorkouts) ? plannedWorkouts : []) {
    if (pw?.status === 'skipped') continue;
    if (!matchesSport(pw?.sport, sportFilter)) continue;
    const dk = planDateKey(pw);
    if (!dk || !keySet.has(dk)) continue;
    plannedByDay.set(dk, (plannedByDay.get(dk) || 0) + plannedTssFor(pw));
  }

  const zoneByDay = new Map((zoneDays || []).map((d) => [d.date, d]));
  const todayKey = localCalendarDateKey(now);

  // ── Rolling 7-day totals ──
  // Computed over the raw day list, so the first days of the window are marked
  // incomplete rather than drawn as a misleading ramp from zero.
  const points = keys.map((key, i) => {
    const windowKeys = keys.slice(Math.max(0, i - 6), i + 1);
    const rollingActual = windowKeys.reduce((sum, k) => sum + (actualByDay.get(k) || 0), 0);
    const rollingPlanned = windowKeys.reduce((sum, k) => sum + (plannedByDay.get(k) || 0), 0);
    const zone = zoneByDay.get(key) || null;

    const date = new Date(`${key}T12:00:00`);
    const actual = Math.round(actualByDay.get(key) || 0);
    const planned = Math.round(plannedByDay.get(key) || 0);

    return {
      date: key,
      label: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
      isToday: key === todayKey,
      isFuture: key > todayKey,
      isWeekStart: date.getDay() === 1,

      actual,
      planned,
      /** Positive = did more than planned. Only meaningful in the past. */
      delta: key <= todayKey ? actual - planned : 0,
      sessions: sessionsByDay.get(key) || [],

      rolling7: Math.round(rollingActual),
      rolling7Planned: Math.round(rollingPlanned),
      /** The window is only a true 7 days once we have 7 days of it. */
      rolling7Complete: i >= 6,

      zones: zone?.zones || null,
      zoneTotalSec: zone?.totalSec || 0,
      unmeasuredSec: zone?.unmeasuredSec || 0,
    };
  });

  const past = points.filter((p) => !p.isFuture);

  // ── Zone totals across the window ──
  const zoneTotals = ZONE_META.reduce((acc, z) => ({ ...acc, [z.key]: 0 }), {});
  let measuredSec = 0;
  let unmeasuredSec = 0;
  for (const p of points) {
    if (!p.zones) { unmeasuredSec += p.unmeasuredSec; continue; }
    for (const z of ZONE_META) zoneTotals[z.key] += p.zones[z.key] || 0;
    measuredSec += p.zoneTotalSec;
    unmeasuredSec += p.unmeasuredSec;
  }

  // Easy/hard split on the LT-based reading: Z1–Z2 is below the first
  // threshold, Z4–Z5 above the second, Z3 the grey zone in between. Reported
  // as three numbers rather than a single "polarisation score", which would
  // hide the very thing an athlete needs to see.
  const easySec = zoneTotals.z1 + zoneTotals.z2;
  const greySec = zoneTotals.z3;
  const hardSec = zoneTotals.z4 + zoneTotals.z5;
  const split = measuredSec > 0
    ? {
        easyPct: Math.round((easySec / measuredSec) * 100),
        greyPct: Math.round((greySec / measuredSec) * 100),
        hardPct: Math.round((hardSec / measuredSec) * 100),
      }
    : null;

  const totalActual = past.reduce((s, p) => s + p.actual, 0);
  const totalPlanned = past.reduce((s, p) => s + p.planned, 0);
  const latest = points[points.length - 1] || null;
  const weekAgo = points.length >= 8 ? points[points.length - 8] : null;

  return {
    points,
    days,
    sportFilter,
    maxDailyTss: Math.max(10, ...points.map((p) => Math.max(p.actual, p.planned))),
    maxRolling: Math.max(10, ...points.map((p) => Math.max(p.rolling7, p.rolling7Planned))),

    rolling7: latest?.rolling7 ?? 0,
    /** Change in the rolling total vs a week ago — the honest "are you ramping?" */
    rolling7Change: latest && weekAgo && weekAgo.rolling7 > 0
      ? Math.round(((latest.rolling7 - weekAgo.rolling7) / weekAgo.rolling7) * 100)
      : null,

    zoneTotals,
    split,
    coverage: {
      measuredSec: Math.round(measuredSec),
      unmeasuredSec: Math.round(unmeasuredSec),
      pct: measuredSec + unmeasuredSec > 0
        ? Math.round((measuredSec / (measuredSec + unmeasuredSec)) * 100)
        : 0,
    },

    compliance: totalPlanned > 0
      ? {
          plannedTss: Math.round(totalPlanned),
          actualTss: Math.round(totalActual),
          pct: Math.round((totalActual / totalPlanned) * 100),
          missedDays: past.filter((p) => p.planned > 0 && p.actual === 0).length,
          extraDays: past.filter((p) => p.planned === 0 && p.actual > 0).length,
        }
      : null,
  };
}

export function formatHours(seconds) {
  const s = Number(seconds) || 0;
  if (s <= 0) return '0h';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
