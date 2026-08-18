/**
 * What this block would do to the athlete's fitness.
 *
 * A block preview shows the shape of the work — six bars, taller here, a
 * recovery week there. It does not answer the question the athlete is actually
 * asking: where does this leave me. Fitness climbing to what, fatigue peaking
 * when, and am I fresh for the thing at the end or buried by it.
 *
 * The model is the dashboard's, not a second one: the same 42-day and 7-day
 * exponential averages, seeded from the athlete's real series so the first
 * projected day continues the line they already know rather than starting from
 * zero.
 */
import { computePmcProjection } from './formFitnessFromActivities';
import { draftToPlannedWorkouts, weekSummary } from './planDraft';

/** TSS per day, from the draft rather than from saved planned workouts. */
export function draftDailyTss(draft) {
  const map = {};
  for (const s of draftToPlannedWorkouts(draft)) {
    if (!s?.date) continue;
    map[s.date] = (map[s.date] || 0) + (Number(s.targetTss) || 0);
  }
  return map;
}

/**
 * Project the block forward from where the athlete is now.
 *
 * @param {object} draft
 * @param {Array<{date: string, Fitness: number, Fatigue: number, Form: number}>} series
 *   the athlete's actual PMC series — the projection continues from its last point
 * @returns {{
 *   days: Array<object>,
 *   start: { fitness: number, fatigue: number, form: number } | null,
 *   end: { fitness: number, fatigue: number, form: number } | null,
 *   peakFitness: number, lowestForm: number, fitnessGain: number,
 * } | null}
 */
export function projectBlock(draft, series) {
  if (!draft?.weeks?.length) return null;
  if (!Array.isArray(series) || series.length === 0) return null;

  const daily = draftDailyTss(draft);
  const dayKeys = Object.keys(daily).sort();
  if (dayKeys.length === 0) return null;

  const last = series[series.length - 1];
  // A block can be planned to start weeks out; the projection has to cover the
  // gap between today and its last session, not just the block's own length.
  const lastActual = String(last.date).slice(0, 10);
  const spanDays = Math.ceil(
    (new Date(`${dayKeys[dayKeys.length - 1]}T12:00:00`) - new Date(`${lastActual}T12:00:00`)) / 86400000,
  );
  if (!Number.isFinite(spanDays) || spanDays <= 0) return null;

  const days = computePmcProjection(series, daily, {
    maxDays: Math.max(1, spanDays) + 1,
    endDate: dayKeys[dayKeys.length - 1],
  });
  if (days.length === 0) return null;

  const first = days[0];
  const final = days[days.length - 1];
  const peakFitness = Math.max(...days.map((d) => d.Fitness));
  const lowestForm = Math.min(...days.map((d) => d.Form));

  return {
    days,
    start: {
      fitness: Math.round(Number(last.Fitness) || 0),
      fatigue: Math.round(Number(last.Fatigue) || 0),
      form: Math.round(Number(last.Form) || 0),
    },
    end: { fitness: final.Fitness, fatigue: final.Fatigue, form: final.Form },
    peakFitness,
    lowestForm,
    fitnessGain: final.Fitness - (Math.round(Number(last.Fitness) || 0)),
    firstDay: first.date,
    lastDay: final.date,
  };
}

/**
 * Week-by-week totals for the volume chart — hours as well as load.
 *
 * The shape chart has always drawn TSS. Hours are the number an athlete
 * actually plans their life around, and the two do not rise together: a peak
 * week can carry more load in fewer hours.
 */
export function weeklyTotals(draft) {
  return (draft?.weeks || []).map((week, i) => {
    const s = weekSummary(week);
    return {
      index: i,
      startDate: week.startDate,
      phase: week.phase,
      isRecovery: week.isRecovery,
      label: week.label,
      tss: s.tss,
      hours: s.hours,
      sessions: s.sessions,
      hardCount: s.hardCount,
      intensityPct: s.intensityPct,
      /** Hours per sport, so a triathlete can see the mix and not just the total. */
      bySport: (week.sessions || []).reduce((acc, x) => {
        const sport = x.sport || 'other';
        acc[sport] = Math.round(((acc[sport] || 0) + (Number(x.plannedDuration) || 0) / 3600) * 10) / 10;
        return acc;
      }, {}),
    };
  });
}

export default projectBlock;
