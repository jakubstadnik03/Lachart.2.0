'use strict';

/**
 * Workout steps as plain objects, whatever they arrived as.
 *
 * Spreading a Mongoose subdocument does not copy its data. `{ ...step }` yields
 * `__parentArray`, `__index`, `$__parent`, `$__`, `_doc` and `$isNew` — the
 * document's own plumbing — and every field read off it afterwards is
 * undefined. The values live behind getters on the prototype, which a spread
 * does not walk.
 *
 * This was shipping broken workouts to people's watches. The Garmin builder
 * spread the members of a repeat block and nothing else, so a session's warm-up
 * and cool-down arrived intact while its entire main set turned into one-second
 * steps with no target: `Math.max(1, undefined || 0)` is 1, and a target that
 * resolves from nothing is OPEN. Measured on a real push — a 6×3 min VO2max run
 * planned as 1:11:00 was stored by Garmin as twelve 1-second blips and a total
 * of 35:12, and a coach reported the same for a 5×2 km session. It only looked
 * right in testing because a test loads the workout with .lean(), which hands
 * over plain objects and makes the spread harmless.
 *
 * Correctness must not depend on the caller remembering `.lean()`, so the
 * builders normalise what they are given instead.
 */
function plainStep(step) {
  if (!step || typeof step !== 'object') return step;
  if (typeof step.toObject === 'function') return step.toObject();
  return { ...step };
}

function plainSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map(plainStep);
}

module.exports = { plainStep, plainSteps };
