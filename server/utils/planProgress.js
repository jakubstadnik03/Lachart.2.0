/**
 * What an athlete does WITH a plan, as opposed to writing one: ticking it
 * off, skipping it, pairing it with the session that was it, a note about
 * how it went.
 *
 * A coached athlete on the Free plan reads the plans their trainer wrote —
 * GET is open — and has to be able to answer them, or the calendar is a list
 * of sessions that can never be done. A PUT that touches only these fields
 * passes without plan_workouts; anything else — the date, the steps, the
 * title, the target — is planning and keeps the gate.
 */
const PLAN_PROGRESS_FIELDS = new Set([
  'status', 'completedTrainingId', 'unpaired', 'stravaActivityId', 'fitTrainingId',
  'executionData', 'comment',
]);

function isPlanProgressUpdate(body) {
  const keys = Object.keys(body || {}).filter((k) => body[k] !== undefined);
  return keys.length > 0 && keys.every((k) => PLAN_PROGRESS_FIELDS.has(k));
}

module.exports = { PLAN_PROGRESS_FIELDS, isPlanProgressUpdate };
