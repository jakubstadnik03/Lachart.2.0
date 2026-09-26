/**
 * How long a plan asks for, in seconds.
 *
 * On its own so the pairing code can weigh a session against a plan without
 * importing planCompliance, which imports the pairing code. planCompliance
 * re-exports it; the graders keep importing from there.
 */

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
    // A typed duration wins, even when the steps add up to more.
    //
    // It used to lose to the longer step total, which made the number in the
    // editor and the number in the summary disagree with no way to reconcile
    // them: you could type 2:30, save it, reopen the editor and see 2:30, and
    // the summary would still say 2:57:57 — the steps' total — as though the
    // edit had not saved. Somebody who types a duration is saying what the
    // session is for; the step total is what to show when nobody said.
    return healLegacyPlannedDurationSecs(explicit, completedSecs);
  }
  return fromSteps;
}
