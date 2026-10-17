import {
  formatPaceFromDistanceAndDuration,
  formatPaceFromSpeedMps,
} from './unitsConverter';

/**
 * Average pace for a run or swim, as shown beside that activity's distance and
 * duration.
 *
 * The rule is: when we have both a distance and a duration, the pace is those
 * two divided. Only when one of them is missing does the device's recorded
 * average speed stand in.
 *
 * This used to be the other way round, and for an untouched activity it made
 * no difference — `avgSpeed` is a moving average and the duration shown here is
 * moving time, so the two agree. It came apart the moment someone corrected a
 * distance by hand: the stored `avgSpeed` still described the old distance, so
 * the card displayed a pace that its own duration and distance contradicted.
 * A 16 km run in 1:02:18 was showing 4:33/km, which is 13.7 km in that time —
 * the distance it had before the edit.
 *
 * Deriving it means the three numbers on the card always agree with each other,
 * which matters more than the last decimal of a figure the watch computed from
 * the same two values anyway.
 *
 * @param {object} o
 * @param {string} o.sport        'run' | 'swim' | anything else returns null
 * @param {number} [o.avgSpeed]   m/s, as recorded
 * @param {number} [o.distance]   metres
 * @param {number} [o.durationSec] seconds, moving time where available
 * @param {string} [o.unitSystem] 'metric' | 'imperial'
 * @returns {string|null} formatted pace, e.g. "3:54 /km", or null
 */
export function resolveAvgPace({
  sport,
  avgSpeed = 0,
  distance = 0,
  durationSec = 0,
  unitSystem = 'metric',
} = {}) {
  const s = String(sport || '').toLowerCase();
  const kind = s.includes('swim') ? 'swim' : (s.includes('run') ? 'run' : null);
  if (!kind) return null;

  const d = Number(distance) || 0;
  const t = Number(durationSec) || 0;
  if (d > 0 && t > 0) {
    return formatPaceFromDistanceAndDuration(d, t, unitSystem, kind);
  }

  const v = Number(avgSpeed) || 0;
  return v > 0 ? formatPaceFromSpeedMps(v, unitSystem, kind) : null;
}

/**
 * The average speed implied by a distance and a duration, for writing back
 * when either has been edited by hand. Leaving the old `avgSpeed` in place is
 * what made the pace disagree with the card in the first place, and it is read
 * by more than the one view.
 *
 * @returns {number|null} m/s, or null when either input is missing
 */
export function avgSpeedFrom(distanceMetres, durationSec) {
  const d = Number(distanceMetres) || 0;
  const t = Number(durationSec) || 0;
  if (d <= 0 || t <= 0) return null;
  return d / t;
}
