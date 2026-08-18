/**
 * Turning a planned session into an actual workout.
 *
 * The block generator produces a title, a duration and a target load. That is
 * enough to draw a week, and not enough to train: "Threshold 4x8min" on a
 * Tuesday still leaves the athlete to build the intervals themselves, and the
 * planner already knows what it meant.
 *
 * The step vocabulary is the builder's, not a second one. buildPresetSteps is
 * what the template library uses, so a session this file generates and a
 * template dragged onto the same day produce the same shape — including the
 * threshold-relative targets that scale to each athlete's own numbers.
 */
import { buildPresetSteps } from '../components/WorkoutPlanner/WorkoutBuilder';

/** Which preset says what each generated session meant. */
const PRESET_BY_SESSION = {
  bike: {
    easy: 'zone2',
    long: 'zone2',
    tempo: 'tempo',
    threshold: 'threshold_intervals',
    vo2: 'vo2max',
    recovery: 'zone2',
  },
  run: {
    easy: 'run_easy',
    long: 'run_long',
    tempo: 'run_tempo',
    threshold: 'run_threshold',
    vo2: 'run_vo2max',
    recovery: 'run_easy',
  },
  swim: {
    easy: 'swim_endurance',
    long: 'swim_endurance',
    tempo: 'swim_threshold',
    threshold: 'swim_threshold',
    vo2: 'swim_threshold',
    recovery: 'swim_endurance',
  },
};

/** A steady block is never trimmed below this — shorter is not a session. */
const MIN_STEADY_SECONDS = 600;

/**
 * How long a workout runs for.
 *
 * A repeat group's members all repeat with its header, so the count belongs to
 * the group rather than to the one step that declares it: reading it per-step
 * counts a 5×(8min + 3min) set as 40 minutes of work and 3 of rest.
 */
export function stepsTotalSeconds(steps) {
  if (!Array.isArray(steps)) return 0;
  const groups = new Map();
  let plain = 0;
  for (const s of steps) {
    const dur = Number(s?.durationSeconds) || 0;
    if (!s?.groupId) { plain += dur; continue; }
    const g = groups.get(s.groupId) || { reps: 1, seconds: 0 };
    if (s.isGroupHeader) g.reps = Math.max(1, Number(s.groupRepeat) || 1);
    g.seconds += dur;
    groups.set(s.groupId, g);
  }
  let grouped = 0;
  for (const g of groups.values()) grouped += g.seconds * g.reps;
  return plain + grouped;
}

/** The steady work step a session can grow or shrink without losing its shape. */
function steadyIndex(steps) {
  let best = -1;
  let longest = 0;
  steps.forEach((s, i) => {
    if (s?.groupId || s?.stepType !== 'work') return;
    const dur = Number(s.durationSeconds) || 0;
    if (dur > longest) { longest = dur; best = i; }
  });
  return best;
}

/**
 * Make a preset last about as long as the session was planned for.
 *
 * Interval sets are left alone: 5×8min at threshold is the session, and a
 * planner that quietly turns it into 5×6min to hit a round number has changed
 * the training rather than fitted it. So the steady block absorbs the
 * difference, and when there is no steady block to absorb it the workout keeps
 * its own length — the caller is expected to believe the structure over the
 * estimate.
 *
 * @returns {{ steps: Array<object>, seconds: number }}
 */
export function fitStepsToDuration(steps, targetSeconds) {
  const list = Array.isArray(steps) ? steps.map((s) => ({ ...s })) : [];
  const target = Math.max(0, Math.round(Number(targetSeconds) || 0));
  if (list.length === 0 || target === 0) {
    return { steps: list, seconds: stepsTotalSeconds(list) };
  }

  const current = stepsTotalSeconds(list);
  const gap = target - current;
  if (Math.abs(gap) < 60) return { steps: list, seconds: current };

  const idx = steadyIndex(list);
  if (idx === -1) return { steps: list, seconds: current };

  const steady = Number(list[idx].durationSeconds) || 0;
  const next = Math.max(MIN_STEADY_SECONDS, steady + gap);
  list[idx] = { ...list[idx], durationSeconds: Math.round(next) };
  return { steps: list, seconds: stepsTotalSeconds(list) };
}

/**
 * Build the workout a planned session was describing.
 *
 * @param {{ sport: string, key: string, plannedDuration: number, targetTss: number, title: string }} session
 * @returns {{ steps: Array<object>, plannedDuration: number, targetTss: number } | null}
 *   null when the session has no preset to build from, so the caller keeps the
 *   title-and-duration version rather than inventing structure.
 */
export function buildSessionSteps(session) {
  if (!session) return null;
  const preset = PRESET_BY_SESSION[session.sport]?.[session.key];
  if (!preset) return null;

  const base = buildPresetSteps(preset);
  if (!Array.isArray(base) || base.length === 0) return null;

  const { steps, seconds } = fitStepsToDuration(base, session.plannedDuration);
  if (seconds <= 0) return null;

  // The duration and the structure have to agree, or the week's hours and the
  // load estimate describe a session that is not the one on the calendar. The
  // structure wins, and the numbers are re-derived from it.
  const plannedSeconds = Number(session.plannedDuration) || seconds;
  const scale = plannedSeconds > 0 ? seconds / plannedSeconds : 1;

  return {
    steps,
    plannedDuration: seconds,
    targetTss: Math.max(1, Math.round((Number(session.targetTss) || 0) * scale)),
  };
}

/**
 * Attach structure to every session that has a preset behind it.
 *
 * @param {Array<object>} plannedWorkouts rows from draftToPlannedWorkouts
 * @returns {Array<object>} the same rows, with steps where one could be built
 */
export function attachStepsToPlannedWorkouts(plannedWorkouts) {
  return (Array.isArray(plannedWorkouts) ? plannedWorkouts : []).map((p) => {
    const built = buildSessionSteps(p);
    if (!built) return p;
    return {
      ...p,
      steps: built.steps,
      plannedDuration: built.plannedDuration,
      targetTss: built.targetTss,
    };
  });
}

export default attachStepsToPlannedWorkouts;
