import { buildPlannerWeekSummary, startOfWeek, addDays, toLocalDateStr } from './plannerWeekUtils';

export function isCurrentWeek(weekStart, today = new Date()) {
  const ws = startOfWeek(weekStart);
  const we = addDays(ws, 6);
  const t = new Date(today);
  t.setHours(12, 0, 0, 0);
  return t >= ws && t <= we;
}

export function isFutureWeek(weekStart, today = new Date()) {
  const ws = startOfWeek(weekStart);
  const t = startOfWeek(today);
  return ws > t;
}

export function buildWeeklyProgressPoints({
  weekStarts = [],
  planned = [],
  trainings = [],
  context = {},
  user = null,
  userProfile = null,
  today = new Date(),
}) {
  const points = weekStarts.map((ws) => {
    const summary = buildPlannerWeekSummary({
      planned,
      trainings,
      weekStart: ws,
      context,
      user,
      userProfile,
    });
    const { done, planned: plan } = summary;
    return {
      weekStart: ws,
      weekKey: toLocalDateStr(ws),
      weekLabel: ws.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      planHours: (plan.totalSec || 0) / 3600,
      doneHours: (done.totalSec || 0) / 3600,
      planTss: plan.totalTss || 0,
      doneTss: done.totalTss || 0,
      planBySport: plan.bySport || [],
      doneBySport: done.bySport || [],
      isCurrent: isCurrentWeek(ws, today),
      isFuture: isFutureWeek(ws, today),
    };
  });

  return points.map((pt, i) => {
    const prev = i > 0 ? points[i - 1] : null;
    const refHours = prev ? (prev.isFuture ? prev.planHours : prev.doneHours || prev.planHours) : 0;
    const curHours = pt.isFuture ? pt.planHours : pt.doneHours || pt.planHours;
    const refTss = prev ? (prev.isFuture ? prev.planTss : prev.doneTss || prev.planTss) : 0;
    const curTss = pt.isFuture ? pt.planTss : pt.doneTss || pt.planTss;

    let volumeChange = null;
    if (prev && refHours > 0 && curHours > 0) {
      if (curHours > refHours * 1.02) volumeChange = 'up';
      else if (curHours < refHours * 0.98) volumeChange = 'down';
      else volumeChange = 'same';
    }

    const hoursDelta = prev ? curHours - refHours : null;
    const tssDelta = prev ? curTss - refTss : null;

    return { ...pt, volumeChange, hoursDelta, tssDelta };
  });
}

/** End-of-week PMC values sampled from extended series. */
export function samplePmcByWeek(series = [], weekStarts = []) {
  if (!series.length || !weekStarts.length) return [];
  const byDate = new Map(series.map((p) => [String(p.date).slice(0, 10), p]));

  return weekStarts.map((ws) => {
    const end = addDays(startOfWeek(ws), 6);
    const endKey = toLocalDateStr(end);
    let pt = byDate.get(endKey);
    if (!pt) {
      for (let d = 6; d >= 0 && !pt; d -= 1) {
        pt = byDate.get(toLocalDateStr(addDays(ws, d)));
      }
    }
    return {
      weekKey: toLocalDateStr(ws),
      weekLabel: ws.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      fitness: pt?.Fitness ?? null,
      fatigue: pt?.Fatigue ?? null,
      form: pt?.Form ?? null,
      projected: !!pt?.projected,
    };
  });
}
