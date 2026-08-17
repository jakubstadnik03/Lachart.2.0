'use strict';

/**
 * "Is this Apple Health workout the same session LaChart already has from
 * Strava or Garmin?"
 *
 * The watch records the ride once, but it reaches LaChart twice: once through
 * Strava/Garmin, once through HealthKit. Apple reports elapsed time while
 * Strava reports moving time, so duration alone is a poor key — we match on
 * start proximity first, then distance, and fall back to duration only when
 * neither side has a usable distance.
 *
 * Kept free of database imports so it can be unit-tested with
 * `node server/utils/appleHealthDuplicate.test.js`.
 */

/** Two recordings of one session never start more than this far apart. */
const START_TOLERANCE_MS = 10 * 60 * 1000;
/** GPS vs. watch distance drift on the same route. */
const DISTANCE_TOLERANCE_RATIO = 0.035;
/** Below this, "distance" is noise (indoor sessions report a few metres). */
const MIN_COMPARABLE_DISTANCE_M = 100;
/** Elapsed vs. moving time gap on the same session. */
const DURATION_TOLERANCE_RATIO = 0.15;
const MIN_DURATION_TOLERANCE_SEC = 180;

/** Duration in seconds, whichever field the provider happened to fill in. */
function externalDurationSeconds(ext) {
  return Number(ext.movingTime || ext.elapsedTime || ext.duration || ext.durationSeconds) || 0;
}

/**
 * @param {Array<object>} externals Strava/Garmin activities near the workout's start
 * @param {{ startMs: number, distanceMeters?: number, durationSeconds?: number }} workout
 * @returns {object | null} the matching external activity, or null
 */
function findExternalDuplicate(externals, workout) {
  const startMs = Number(workout?.startMs);
  if (!Array.isArray(externals) || !Number.isFinite(startMs)) return null;
  const distMeters = Number(workout.distanceMeters) || 0;
  const durSec = Number(workout.durationSeconds) || 0;

  return externals.find((ext) => {
    const extStart = new Date(ext.startDate).getTime();
    if (!Number.isFinite(extStart) || Math.abs(extStart - startMs) > START_TOLERANCE_MS) return false;

    const extDist = Number(ext.distance) || 0;
    if (distMeters > MIN_COMPARABLE_DISTANCE_M && extDist > MIN_COMPARABLE_DISTANCE_M) {
      return Math.abs(extDist - distMeters) <= DISTANCE_TOLERANCE_RATIO * Math.max(extDist, distMeters);
    }

    const extDur = externalDurationSeconds(ext);
    if (durSec > 0 && extDur > 0) {
      return Math.abs(extDur - durSec)
        <= Math.max(MIN_DURATION_TOLERANCE_SEC, DURATION_TOLERANCE_RATIO * Math.max(extDur, durSec));
    }

    return true; // started within 10 min, no comparable metrics — same session
  }) || null;
}

module.exports = {
  findExternalDuplicate,
  START_TOLERANCE_MS,
  DISTANCE_TOLERANCE_RATIO,
  MIN_COMPARABLE_DISTANCE_M,
  DURATION_TOLERANCE_RATIO,
  MIN_DURATION_TOLERANCE_SEC,
};
