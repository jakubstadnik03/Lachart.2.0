/**
 * PlannedWorkout.plannedDistance is stored in metres on the server.
 * Legacy clients sometimes saved bike/run distance as km (values < 100).
 * Swim distances are always metres (e.g. 3000 m, 26 000 m).
 */

import { formatDistance, resolveDistanceUnitSystem } from './unitsConverter';

/** Sum distanceMeters from structured workout steps (respects interval repeats). */
export function planStepTotalMetres(steps) {
  if (!Array.isArray(steps)) return 0;
  const visited = new Set();
  let total = 0;
  steps.forEach((s) => {
    if (!s.groupId) {
      total += Number(s.distanceMeters || 0);
      return;
    }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter((x) => x.groupId === s.groupId);
    const reps = (group.find((x) => x.isGroupHeader)?.groupRepeat) || 1;
    group.forEach((gs) => { total += Number(gs.distanceMeters || 0) * reps; });
  });
  return total;
}

export function plannedDistanceMetres(plannedWorkout) {
  const n = Number(plannedWorkout?.plannedDistance ?? 0);
  if (Number.isFinite(n) && n > 0) {
    const sport = String(plannedWorkout?.sport || '').toLowerCase();
    if (sport.includes('swim')) return n;
    if (n < 100) return n * 1000;
    return n;
  }
  return planStepTotalMetres(plannedWorkout?.steps);
}

/** Display string for a planned distance (metres in → user units). */
export function formatPlannedDistanceMetres(metres, sport, user = null) {
  const m = Number(metres);
  if (!Number.isFinite(m) || m <= 0) return null;
  const unitSystem = resolveDistanceUnitSystem(user);
  const sp = String(sport || '').toLowerCase();
  if (sp.includes('swim') && m < 1000) return `${Math.round(m)} m`;
  return formatDistance(m, unitSystem).formatted;
}
