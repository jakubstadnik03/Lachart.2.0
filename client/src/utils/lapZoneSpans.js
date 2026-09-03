/**
 * Time in zones, read lap by lap.
 *
 * Lives apart from the period-summary component so it can be tested without
 * dragging a chart library and a page of icons in behind it.
 */

const ZONE_KEYS = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];

/** Zone bounds are stored as numbers or as "4:30" pace strings. */
export function parseZoneNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const str = String(v).trim();
  const mmss = str.match(/^(\d+):(\d{1,2})$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

/**
 * Which of the five zones a value falls in.
 *
 * Zone tables have gaps and ends. A coach's cycling table might open at 200 W,
 * and every second spent coasting, soft-pedalling or rolling downhill is below
 * it; the same table closes somewhere, and a sprint is above that. Returning
 * null for those threw the time away — which is why a month of riding could
 * report no Z1 at all, and why the totals here came out at a third of what the
 * sport split said had been ridden. Nobody's easy spinning stops counting as
 * easy because it fell off the bottom of a table.
 *
 * So a value under the lowest band belongs to it, and one over the highest
 * belongs to that. Pace tables run the other way — smaller seconds are faster,
 * Z1 holds the largest numbers — so the direction is read off the table rather
 * than assumed.
 */
export function findZoneKeyForValue(value, zonesObj) {
  const val = Number(value);
  if (!Number.isFinite(val)) return null;

  const bands = [];
  for (const zKey of ZONE_KEYS) {
    const def = zonesObj?.[zKey];
    if (!def) continue;
    const min = parseZoneNumber(def?.min);
    const max = def?.max === undefined || def?.max === null || def?.max === ''
      ? null
      : parseZoneNumber(def?.max);
    if (min === null && max === null) continue;
    bands.push({ zKey, min, max });
  }
  if (!bands.length) return null;

  // Exact hit first — inside a band as the table defines it.
  for (const { zKey, min, max } of bands) {
    const lo = min === null ? -Infinity : min;
    const hi = max === null ? Infinity : max;
    if (val >= lo && val <= hi) return zKey;
  }

  // Otherwise the nearest band, which for a value off either end is the end
  // itself. Distance to a band is zero inside it and the gap outside.
  let best = null;
  let bestGap = Infinity;
  for (const band of bands) {
    const lo = band.min === null ? -Infinity : band.min;
    const hi = band.max === null ? Infinity : band.max;
    const gap = val < lo ? lo - val : val > hi ? val - hi : 0;
    if (gap < bestGap) { bestGap = gap; best = band.zKey; }
  }
  return best;
}

/** A lap's duration, whichever vocabulary it arrived in. */
export function lapDurationSec(lap) {
  return Number(
    lap?.d ?? lap?.totalTimerTime ?? lap?.totalElapsedTime ?? lap?.moving_time
    ?? lap?.elapsed_time ?? lap?.durationSeconds ?? lap?.duration ?? 0,
  ) || 0;
}

/**
 * Time in zones for one activity, read lap by lap.
 *
 * An average is not a distribution. A 4x25min at 355W with easy spinning
 * between averages 323W, and charging the whole two-and-three-quarter hours to
 * whichever zone that single number lands in reported the session as 100% Z2 —
 * a threshold workout filed as endurance. Every activity in the period was
 * being reduced the same way, so the card could only ever show as many zones
 * as it had activities.
 *
 * Laps are not per-second either, but they are what a structured session is
 * made of: the reps land in the zone they were ridden at and the recoveries in
 * theirs. Where an activity has no usable laps this still falls back to the
 * activity average, which is all there is.
 *
 * @returns {Array<{ zoneKey, sec }>} one entry per lap that could be placed
 */
export function zoneSpansForActivity(act, profileSport, zones, metricOf) {
  const laps = [act?.savedAutoLaps, act?.lapProfile, act?.laps, act?.results]
    .find((l) => Array.isArray(l) && l.length >= 2) || null;
  if (!laps) return null;

  const spans = [];
  let placed = 0;
  for (const lap of laps) {
    const sec = lapDurationSec(lap);
    if (!(sec > 0)) continue;
    const value = metricOf(lap, profileSport);
    if (value == null) continue;
    const zk = findZoneKeyForValue(value, zones);
    if (!zk) continue;
    spans.push({ zoneKey: zk, sec });
    placed += sec;
  }
  // A handful of laps carrying the channel is not a distribution of the
  // session — rather than draw a fifth of a ride as if it were all of it, hand
  // back nothing and let the average stand in.
  const total = laps.reduce((s, l) => s + lapDurationSec(l), 0);
  if (!(total > 0) || placed < total * 0.6) return null;
  return spans;
}

/** A lap's power, or its pace in sec/km (run) or sec/100m (swim). */
export function lapPowerOrPaceMetric(lap, profileSport) {
  if (profileSport === 'cycling') {
    const p = Number(lap.w ?? lap.avgPower ?? lap.average_watts ?? lap.averagePower ?? lap.power ?? 0);
    return Number.isFinite(p) && p > 0 ? p : null;
  }
  let speed = Number(lap.s ?? lap.avgSpeed ?? lap.average_speed ?? lap.averageSpeed ?? 0);
  if (!(speed > 0)) {
    const dist = Number(lap.m ?? lap.totalDistance ?? lap.distance ?? lap.distanceMeters ?? 0) || 0;
    const dur = lapDurationSec(lap);
    speed = dist > 0 && dur > 0 ? dist / dur : 0;
  }
  if (!(speed > 0)) return null;
  if (profileSport === 'running') return 1000 / speed;
  if (profileSport === 'swimming') return 100 / speed;
  return null;
}

/** A lap's average heart rate. */
export function lapHeartRate(lap) {
  const hr = Number(lap.h ?? lap.avgHeartRate ?? lap.average_heartrate ?? lap.averageHeartRate ?? lap.heartRate ?? 0);
  return Number.isFinite(hr) && hr > 0 ? hr : null;
}
