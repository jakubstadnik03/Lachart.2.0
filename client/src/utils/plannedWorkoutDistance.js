/**
 * PlannedWorkout.plannedDistance is stored in metres on the server.
 * Legacy clients sometimes saved bike/run distance as km (values < 100).
 * Swim distances are always metres (e.g. 3000 m, 26 000 m).
 */
export function plannedDistanceMetres(plannedWorkout) {
  const n = Number(plannedWorkout?.plannedDistance ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;

  const sport = String(plannedWorkout?.sport || '').toLowerCase();
  if (sport.includes('swim')) return n;

  if (n < 100) return n * 1000;
  return n;
}

/** Display string for a planned distance (metres in → "X km" / "X m"). */
export function formatPlannedDistanceMetres(metres, sport) {
  const m = Number(metres);
  if (!Number.isFinite(m) || m <= 0) return null;
  const sp = String(sport || '').toLowerCase();
  if (sp.includes('swim') || m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
}
