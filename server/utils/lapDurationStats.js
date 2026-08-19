'use strict';

/**
 * How evenly timed a session's laps were, as a coefficient of variation
 * (population standard deviation / mean).
 *
 * This is the signal that separates "5x5min at threshold" from "a two-hour ride
 * someone happened to lap four times": repeats come out near 0, a ride lapped at
 * random comes out high. Two callers now need it — the /strava/pending-lactate
 * feed behind the "Intervals?" badge, and the activities list that tells the
 * dashboard which imports are worth charting — so it lives here rather than
 * being written twice and drifting into two different definitions of the same
 * word.
 *
 * @param {Array<number|string|null|undefined>} durations lap durations in seconds
 * @returns {number|null} rounded to 3dp, or null when fewer than two usable laps
 */
function lapDurationCv(durations) {
  if (!Array.isArray(durations)) return null;

  const usable = durations
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (usable.length < 2) return null;

  const mean = usable.reduce((sum, v) => sum + v, 0) / usable.length;
  if (mean <= 0) return null;

  const variance = usable.reduce((sum, v) => sum + (v - mean) ** 2, 0) / usable.length;
  return +(Math.sqrt(variance) / mean).toFixed(3);
}

/** Pull a lap's duration out of whichever field the provider used. */
function lapDurationSeconds(lap) {
  if (!lap || typeof lap !== 'object') return 0;
  const v = lap.moving_time ?? lap.totalTimerTime ?? lap.totalElapsedTime ?? lap.elapsed_time ?? 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

module.exports = { lapDurationCv, lapDurationSeconds };
