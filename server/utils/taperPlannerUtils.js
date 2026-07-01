/**
 * Taper TSS scaling before a goal race (simple stepped curve).
 */

function startOfUtcDay(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function daysBetweenUtc(from, to) {
  return Math.round((startOfUtcDay(to) - startOfUtcDay(from)) / 86400000);
}

/** Multiplier for planned TSS / duration by days until race day. */
function taperFactorForDaysUntil(daysUntil) {
  if (daysUntil == null || daysUntil < 0) return 1;
  if (daysUntil === 0) return 0.4;
  if (daysUntil <= 3) return 0.5;
  if (daysUntil <= 7) return 0.67;
  if (daysUntil <= 14) return 0.8;
  if (daysUntil <= 21) return 0.9;
  return 1;
}

function scaleSteps(steps, factor) {
  if (!Array.isArray(steps) || factor >= 0.999) return steps;
  if (factor <= 0) return steps;
  return steps.map((s) => {
    const dur = Number(s.durationSeconds) || 0;
    if (dur <= 0) return s;
    return { ...s, durationSeconds: Math.max(60, Math.round(dur * factor)) };
  });
}

/**
 * Build taper adjustments for future planned workouts before race day.
 * @param {Array} workouts PlannedWorkout lean docs
 * @param {Date} raceDate
 * @param {Date} [fromDate] defaults to today UTC
 */
function buildTaperPlan(workouts, raceDate, fromDate = new Date()) {
  const today = startOfUtcDay(fromDate);
  const raceDay = startOfUtcDay(raceDate);
  const changes = [];
  let totalBefore = 0;
  let totalAfter = 0;

  for (const pw of workouts || []) {
    if (pw.status === 'skipped' || pw.status === 'completed') continue;
    const d = startOfUtcDay(pw.date);
    if (d < today || d >= raceDay) continue;

    const daysUntil = daysBetweenUtc(today, d);
    const factor = taperFactorForDaysUntil(daysUntil);
    if (factor >= 0.999) continue;

    const oldTss = Number(pw.targetTss) || 0;
    const oldDur = Number(pw.plannedDuration) || 0;
    const newTss = oldTss > 0 ? Math.max(10, Math.round(oldTss * factor)) : oldTss;
    const newDur = oldDur > 0 ? Math.max(600, Math.round(oldDur * factor)) : oldDur;
    const newSteps = scaleSteps(pw.steps, factor);

    totalBefore += oldTss;
    totalAfter += newTss || oldTss;

    if (newTss !== oldTss || newDur !== oldDur || newSteps !== pw.steps) {
      changes.push({
        id: String(pw._id),
        date: d.toISOString().slice(0, 10),
        title: pw.title,
        daysUntil,
        factor,
        before: { targetTss: oldTss || null, plannedDuration: oldDur || null },
        after: { targetTss: newTss || null, plannedDuration: newDur || null, steps: newSteps },
      });
    }
  }

  return {
    changes,
    summary: {
      workouts: changes.length,
      tssBefore: Math.round(totalBefore),
      tssAfter: Math.round(totalAfter),
    },
  };
}

function taperPeriodDates(raceDate) {
  const raceDay = startOfUtcDay(raceDate);
  const end = new Date(raceDay);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(raceDay);
  start.setUTCDate(start.getUTCDate() - 14);
  const today = startOfUtcDay(new Date());
  if (start < today) start.setTime(today.getTime());
  if (start > end) return null;
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

module.exports = {
  taperFactorForDaysUntil,
  buildTaperPlan,
  taperPeriodDates,
  daysBetweenUtc,
  startOfUtcDay,
};
