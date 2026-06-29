/**
 * CTL / ATL / TSB from the same calendar activities + TSS the dashboard displays.
 * Keeps Fitness in sync with weekly TSS totals (resolveActivityTss).
 */
import { resolveActivityTss } from './computeTss';
import { matchesCalendarSportFilter } from './calendarDayOrdering';

export function localCalendarDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function activityTss(act, profile) {
  return resolveActivityTss(act, profile, { user: profile }) || 0;
}

/**
 * @returns {{ series: Array, todayMetrics: object|null }}
 */
export function computePmcFromActivities(activities, profile, { displayDays = 90, warmupDays = 252, sportFilter = 'all' } = {}) {
  if (!Array.isArray(activities) || !activities.length || !profile) {
    return { series: [], todayMetrics: null };
  }

  const dailyTss = new Map();
  for (const act of activities) {
    if (sportFilter !== 'all' && !matchesCalendarSportFilter(act, sportFilter)) continue;
    const raw = act.date || act.timestamp || act.startDate || act.start_time;
    const dk = localCalendarDateKey(raw);
    if (!dk) continue;
    const tss = activityTss(act, profile);
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

  const calcStart = new Date(today);
  calcStart.setDate(calcStart.getDate() - (displayDays + warmupDays));
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
