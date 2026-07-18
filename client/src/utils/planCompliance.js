import { planSportMatchesActivity } from './calendarDayOrdering';

export const SPORT_PLAN_COLORS = { bike: '#767EB5', run: '#f97316', swim: '#38bdf8' };

function planStepTotalSecs(steps) {
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

function healLegacyPlannedDurationSecs(stored, completedSecs = 0) {
  const s = Number(stored) || 0;
  if (s < 60 || s >= 3600) return s;
  const h = Math.floor(s / 60);
  const m = s % 60;
  if (h <= 0 || m >= 60) return s;
  const healed = h * 3600 + m * 60;
  if (completedSecs > 0 && completedSecs / s > 4 && completedSecs / healed <= 1.5) return healed;
  return s;
}

export function plannedWorkoutDurationSecs(pw, completedSecs = 0) {
  if (!pw) return 0;
  const explicit = Number(pw.plannedDuration || 0);
  const fromSteps = planStepTotalSecs(pw.steps) || 0;
  if (explicit > 0) {
    const healed = healLegacyPlannedDurationSecs(explicit, completedSecs);
    if (fromSteps > healed) return fromSteps;
    return healed;
  }
  return fromSteps;
}

export function getCompliance(plannedSecs, actualSecs) {
  if (!plannedSecs || !actualSecs) return null;
  const r = actualSecs / plannedSecs;
  // Green from 0.85 so it matches the compliance gauge's green band (which
  // starts at ~86%): if the marker sits in green, rows and calendar dots agree.
  if (r >= 0.85) return { color: '#22c55e', bg: '#f0fdf4', label: 'On target', ring: '#22c55e' };
  if (r >= 0.75) return { color: '#eab308', bg: '#fefce8', label: 'Good', ring: '#eab308' };
  if (r >= 0.55) return { color: '#f97316', bg: '#fff7ed', label: 'Short', ring: '#f97316' };
  return { color: '#ef4444', bg: '#fef2f2', label: 'Missed', ring: '#ef4444' };
}

export function findCompliance(pw, acts) {
  if (!acts?.length) return null;
  const match = acts.find((a) => planSportMatchesActivity(pw.sport, a.sport || a.type || ''));
  if (!match) return null;
  const actualSecs = Number(
    match.duration || match.moving_time || match.elapsed_time
    || match.movingTime || match.totalTimerTime || match.totalElapsedTime || 0,
  );
  const plannedSecs = plannedWorkoutDurationSecs(pw, actualSecs);
  if (!plannedSecs) return null;
  return getCompliance(plannedSecs, actualSecs);
}

export function planSportColor(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run') || s.includes('walk') || s.includes('hike')) return SPORT_PLAN_COLORS.run;
  if (s.includes('swim')) return SPORT_PLAN_COLORS.swim;
  if (s.includes('ride') || s.includes('cycl') || s.includes('bike')) return SPORT_PLAN_COLORS.bike;
  return SPORT_PLAN_COLORS.bike;
}

/** Longhand borders — avoids React warning when mixing border + borderLeft*. */
export function outlineBorder({ color, leftColor, leftWidth = 2, width = 1, style = 'solid' }) {
  const lc = leftColor ?? color;
  return {
    borderTopWidth: width,
    borderRightWidth: width,
    borderBottomWidth: width,
    borderLeftWidth: leftWidth,
    borderTopStyle: style,
    borderRightStyle: style,
    borderBottomStyle: style,
    borderLeftStyle: 'solid',
    borderTopColor: color,
    borderRightColor: color,
    borderBottomColor: color,
    borderLeftColor: lc,
  };
}
