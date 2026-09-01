/**
 * How long a planned session is, in seconds.
 *
 * Three screens ask this — the training calendar, the dashboard's week strip
 * and the week totals — and two of them used to answer it with a private copy
 * that had drifted. The dashboard's copy trusted `plannedDuration` blindly, so
 * a plan carrying the legacy "1:20 saved as 80 seconds" bug read as eighty
 * seconds there and as an hour and twenty minutes on the calendar next to it.
 */

export function planStepTotalSecs(steps) {
  if (!Array.isArray(steps)) return 0;
  const visited = new Set();
  let total = 0;
  steps.forEach(s => {
    if (!s.groupId) { total += s.durationSeconds || 0; return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const reps = (group.find(x => x.isGroupHeader)?.groupRepeat) || 1;
    group.forEach(gs => { total += (gs.durationSeconds || 0) * reps; });
  });
  return total;
}

/** Prefer explicit plannedDuration (simple editor) over structured step sum. */
export function healLegacyPlannedDurationSecs(stored, completedSecs = 0) {
  const s = Number(stored) || 0;
  // Legacy bug: "1:20" (1h20m) was saved as h*60+m seconds (80s).
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
