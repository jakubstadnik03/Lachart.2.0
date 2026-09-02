/**
 * lapDetailStats — everything a lap recorded, beyond the one number it is drawn from.
 *
 * The lap chart's header used to stop at duration, distance and the metric the
 * bars are sized by, so a 25-minute block at 355 W said nothing about what it
 * cost in heart rate, what cadence held it together, or how hard it was against
 * threshold. All of that is already on the lap; it just had nowhere to go.
 *
 * Only what the file actually contains comes back. Strava laps carry no
 * normalized power, so that entry is absent on a Strava ride rather than being
 * invented from the average — a made-up NP is worse than a missing one.
 */

import { formatSpeed, formatElevation } from './unitsConverter';
import { stravaHalfCadenceToSpm, cadenceDisplayUnit } from './cadenceDisplay';

/** First positive number among the aliases a lap might use for one field. */
function pick(lap, ...keys) {
  for (const k of keys) {
    const v = Number(lap?.[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

/**
 * @param {Object} lap                     one lap, in either the Strava or the FIT shape
 * @param {Object} opts
 * @param {number} opts.movingSecs         the lap's moving time, already resolved by the caller
 * @param {string} opts.unitSystem         'metric' | 'imperial'
 * @param {string} opts.sport              used for the cadence unit (rpm vs spm)
 * @param {boolean} opts.isStravaActivity  Strava halves run cadence; FIT does not
 * @param {boolean} opts.isRun
 * @param {boolean} opts.isSwim
 * @returns {Array<[string, string]>} label/value pairs, in reading order
 */
export function lapDetailStats(lap, {
  movingSecs = 0, unitSystem = 'metric', sport = '',
  isStravaActivity = false, isRun = false, isSwim = false,
} = {}) {
  if (!lap) return [];
  const out = [];
  const dist = pick(lap, 'distance', 'totalDistance', 'distanceMeters');

  // Speed carries a ride; a run or a swim is already read as pace in the
  // headline, and printing the same thing as km/h next to it only adds noise.
  if (!isRun && !isSwim) {
    const spd = pick(lap, 'average_speed', 'avgSpeed', 'avg_speed', 'speed', 'speed_ms')
      || (dist > 0 && movingSecs > 0 ? dist / movingSecs : 0);
    if (spd > 0) out.push(['speed', formatSpeed(spd, unitSystem).formatted]);
  }

  const np = pick(lap, 'normalizedPower', 'normalized_power', 'weightedAveragePower', 'weighted_average_watts');
  if (np > 0) out.push(['NP', `${Math.round(np)} W`]);

  const maxW = pick(lap, 'max_watts', 'maxPower', 'max_power', 'maxWatts');
  if (maxW > 0) out.push(['max', `${Math.round(maxW)} W`]);

  const hr = pick(lap, 'average_heartrate', 'avgHeartRate', 'averageHeartRate', 'avgHR', 'heartRate');
  const hrMax = pick(lap, 'max_heartrate', 'maxHeartRate', 'max_heart_rate');
  if (hr > 0) {
    out.push(['HR', hrMax > 0 ? `${Math.round(hr)} / ${Math.round(hrMax)} bpm` : `${Math.round(hr)} bpm`]);
  }

  const cadRaw = pick(lap, 'average_cadence', 'avgCadence', 'avg_cadence', 'cadence');
  if (cadRaw > 0) {
    // Strava reports run cadence per leg. The laps table doubles it, and the
    // header sits directly above that table — the two have to agree.
    const cad = isStravaActivity
      ? (stravaHalfCadenceToSpm(cadRaw, sport) ?? Math.round(cadRaw))
      : Math.round(cadRaw);
    out.push(['cad', `${cad} ${isSwim ? 'spm' : cadenceDisplayUnit(sport)}`]);
  }

  const elev = pick(lap, 'total_elevation_gain', 'totalAscent', 'total_ascent');
  if (elev > 0) out.push(['elev', formatElevation(elev, unitSystem).formatted]);

  const ifVal = Number(lap.intensityFactor || lap.intensity_factor || 0);
  if (ifVal > 0) out.push(['IF', ifVal.toFixed(2)]);

  const lapTss = pick(lap, 'trainingStressScore', 'training_stress_score');
  if (lapTss > 0) out.push(['TSS', String(Math.round(lapTss))]);

  const la = lap.lactate ?? lap.lactateValue;
  if (la != null && Number(la) > 0) out.push(['La', `${Number(la).toFixed(1)} mmol`]);

  return out;
}
