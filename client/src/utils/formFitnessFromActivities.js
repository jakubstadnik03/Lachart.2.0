/**
 * CTL / ATL / TSB from the same calendar activities + TSS the dashboard displays.
 * Keeps Fitness in sync with weekly TSS totals (resolveActivityTss).
 */
import { resolveActivityTss } from './computeTss';
import { enrichProfileForTss } from './inferThresholdsFromActivities';
import { matchesCalendarSportFilter } from './calendarDayOrdering';

export function localCalendarDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local calendar day for an activity — same field order everywhere (dashboard, calendar, period stats, native app). */
export function activityCalendarDateKey(act) {
  const raw = act?.date ?? act?.timestamp ?? act?.startDate ?? act?.start_time;
  if (raw == null) return null;
  return localCalendarDateKey(raw);
}

/** True when the activity falls on the given local calendar day. */
export function activityOnLocalDay(act, date) {
  const dk = activityCalendarDateKey(act);
  if (!dk) return false;
  return dk === localCalendarDateKey(date);
}

/** Monday of the activity's local calendar week (YYYY-MM-DD). */
export function localWeekStartKey(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return localCalendarDateKey(d);
}

function activityTss(act, profile, tssUser) {
  return resolveActivityTss(act, profile, { user: tssUser || profile }) || 0;
}

/**
 * @returns {{ series: Array, todayMetrics: object|null }}
 */
export function computePmcFromActivities(activities, profile, { displayDays = 90, warmupDays = 252, sportFilter = 'all', tssUser = null } = {}) {
  if (!Array.isArray(activities) || !activities.length || !profile) {
    return { series: [], todayMetrics: null };
  }

  const effectiveProfile = enrichProfileForTss(profile, activities);
  const prefsUser = tssUser || profile;
  const dailyTss = new Map();
  for (const act of activities) {
    if (sportFilter !== 'all' && !matchesCalendarSportFilter(act, sportFilter)) continue;
    const dk = activityCalendarDateKey(act);
    if (!dk) continue;
    const tss = activityTss(act, effectiveProfile, prefsUser);
    if (tss > 0) dailyTss.set(dk, (dailyTss.get(dk) || 0) + tss);
  }
  if (!dailyTss.size) return { series: [], todayMetrics: null };

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const earliestKey = Array.from(dailyTss.keys()).sort()[0];
  const earliest = new Date(`${earliestKey}T12:00:00`);

  const displayStart = new Date(today);
  displayStart.setDate(displayStart.getDate() - displayDays);
  displayStart.setHours(0, 0, 0, 0);

  // Warmup is fixed — chart window (displayDays) must NOT change today's CTL/ATL/TSB.
  const calcStart = new Date(today);
  calcStart.setDate(calcStart.getDate() - warmupDays);
  calcStart.setHours(0, 0, 0, 0);

  const loopStart = earliest < calcStart ? earliest : calcStart;
  loopStart.setHours(0, 0, 0, 0);

  const alphaCTL = 1 / 42;
  const alphaATL = 1 / 7;
  let ctl = 0;
  let atl = 0;
  const series = [];

  const cur = new Date(loopStart);
  while (cur <= today) {
    const dk = localCalendarDateKey(cur);
    const tssToday = dailyTss.get(dk) || 0;
    const form = ctl - atl;
    ctl += alphaCTL * (tssToday - ctl);
    atl += alphaATL * (tssToday - atl);

    if (cur >= displayStart) {
      series.push({
        date: dk,
        dateLabel: cur.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        Fitness: Math.round(ctl),
        Form: Math.round(form),
        Fatigue: Math.round(atl),
        TSS: Math.round(tssToday),
      });
    }
    cur.setDate(cur.getDate() + 1);
  }

  if (!series.length) return { series: [], todayMetrics: null };

  const last = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : last;
  return {
    series,
    todayMetrics: {
      fitness: last.Fitness,
      fatigue: last.Fatigue,
      form: last.Form,
      fitnessChange: last.Fitness - prev.Fitness,
      fatigueChange: last.Fatigue - prev.Fatigue,
      formChange: last.Form - prev.Form,
    },
  };
}

/** Total planned duration in seconds (respects interval-group repeats). */
export function planStepTotalSecs(steps) {
  if (!Array.isArray(steps)) return 0;
  const visited = new Set();
  let total = 0;
  steps.forEach((s) => {
    if (!s.groupId) { total += s.durationSeconds || 0; return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter((x) => x.groupId === s.groupId);
    const reps = (group.find((x) => x.isGroupHeader)?.groupRepeat) || 1;
    group.forEach((gs) => { total += (gs.durationSeconds || 0) * reps; });
  });
  return total;
}

/** Estimate planned TSS when targetTss is not set (~50 TSS/h endurance). */
export function estimatePlannedTss(pw) {
  const explicit = Number(pw?.targetTss || 0);
  if (explicit > 0) return explicit;
  let secs = Number(pw?.plannedDuration || 0);
  if (!secs && Array.isArray(pw?.steps)) secs = planStepTotalSecs(pw.steps) || 0;
  if (secs > 0 && secs < 24 * 3600) return (secs / 3600) * 50;
  return 0;
}

/** Future planned TSS keyed by YYYY-MM-DD (open workouts only). */
export function buildPlannedTssByDate(plannedWorkouts = [], { fromDate = new Date(), maxDays = 56 } = {}) {
  const today = fromDate instanceof Date ? new Date(fromDate) : new Date(fromDate);
  today.setHours(0, 0, 0, 0);
  const todayKey = localCalendarDateKey(today);
  const end = new Date(today);
  end.setDate(end.getDate() + maxDays);

  const map = {};
  for (const pw of plannedWorkouts) {
    if (pw?.status === 'completed' || pw?.status === 'skipped') continue;
    const day = typeof pw?.date === 'string' ? pw.date.slice(0, 10) : '';
    if (!day || day <= todayKey) continue;
    const d = new Date(`${day}T12:00:00`);
    if (Number.isNaN(d.getTime()) || d > end) continue;
    map[day] = (map[day] || 0) + estimatePlannedTss(pw);
  }
  return map;
}

/**
 * Project CTL/ATL/TSB forward from the last actual series point using planned daily TSS.
 * @returns {Array<{ date, dateLabel, Fitness, Form, Fatigue, projected: true, PlannedTSS }>}
 */
export function computePmcProjection(series, plannedTssByDate, { maxDays = 56, endDate = null } = {}) {
  if (!Array.isArray(series) || !series.length) return [];
  const planned = plannedTssByDate || {};
  const days = Object.keys(planned);

  const last = series[series.length - 1];
  let ctl = Number(last.Fitness || 0);
  let atl = Number(last.Fatigue || 0);
  const lastDate = new Date(`${String(last.date).slice(0, 10)}T12:00:00`);
  lastDate.setHours(0, 0, 0, 0);

  let end;
  if (endDate) {
    end = new Date(`${String(endDate).slice(0, 10)}T12:00:00`);
    end.setHours(0, 0, 0, 0);
  } else if (days.length) {
    const maxDay = days.reduce((m, d) => (d > m ? d : m), days[0]);
    end = new Date(`${maxDay}T12:00:00`);
    end.setHours(0, 0, 0, 0);
  } else {
    return [];
  }

  const alphaCTL = 1 / 42;
  const alphaATL = 1 / 7;
  const out = [];
  const d = new Date(lastDate);
  d.setDate(d.getDate() + 1);
  let guard = 0;

  while (d <= end && guard < maxDays) {
    guard += 1;
    const key = localCalendarDateKey(d);
    const tss = plannedTssByDate[key] || 0;
    const form = ctl - atl;
    ctl += alphaCTL * (tss - ctl);
    atl += alphaATL * (tss - atl);
    out.push({
      date: key,
      dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      Fitness: Math.round(ctl),
      Fatigue: Math.round(atl),
      Form: Math.round(form),
      projected: true,
      PlannedTSS: Math.round(tss),
    });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Historical PMC series plus projected tail from planned workouts. */
export function buildExtendedPmcSeries(series, plannedWorkouts, options = {}) {
  if (!Array.isArray(series) || !series.length) return [];
  const plannedTssByDate = buildPlannedTssByDate(plannedWorkouts, options);
  const projection = computePmcProjection(series, plannedTssByDate, options);
  return projection.length ? [...series, ...projection] : series;
}

/**
 * Weekly TSS bars — same activities + resolveActivityTss as the training calendar.
 * @returns {Array<{ weekStart, weekLabel, trainingLoad, optimalLoad }>}
 */
export function computeWeeklyTrainingLoadFromActivities(activities, profile, { months = 3, sportFilter = 'all', tssUser = null } = {}) {
  if (!Array.isArray(activities) || !activities.length || !profile) return [];

  const effectiveProfile = enrichProfileForTss(profile, activities);
  const prefsUser = tssUser || profile;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - months);
  startDate.setHours(0, 0, 0, 0);

  const weeklyData = new Map();

  for (const act of activities) {
    if (sportFilter !== 'all' && !matchesCalendarSportFilter(act, sportFilter)) continue;
    const dk = activityCalendarDateKey(act);
    if (!dk) continue;
    const actDate = new Date(`${dk}T12:00:00`);
    if (Number.isNaN(actDate.getTime()) || actDate < startDate) continue;

    const weekKey = localWeekStartKey(actDate);
    if (!weekKey) continue;

    const tss = activityTss(act, effectiveProfile, prefsUser);
    if (!weeklyData.has(weekKey)) {
      const ws = new Date(`${weekKey}T12:00:00`);
      weeklyData.set(weekKey, {
        weekStart: weekKey,
        weekLabel: ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        tss: 0,
      });
    }
    weeklyData.get(weekKey).tss += tss || 0;
  }

  const data = Array.from(weeklyData.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const optimalForIndex = (index) => {
    if (index < 3) return Math.round(data[index]?.tss || 0);
    const last4 = data.slice(Math.max(0, index - 3), index + 1);
    const avg = last4.reduce((sum, w) => sum + (w.tss || 0), 0) / last4.length;
    return Math.round(avg || 0);
  };

  return data.map((week, index) => ({
    weekStart: week.weekStart,
    weekLabel: week.weekLabel,
    trainingLoad: Math.round(week.tss || 0),
    optimalLoad: optimalForIndex(index),
  }));
}
