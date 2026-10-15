/**
 * The numbers a Garmin activity summary already has, plus power from its trace.
 *
 * The wellness summary records calories, the climb, cadence and max heart
 * rate, and says nothing about watts. Those live only on the per-second
 * samples. The activity panel reads one flat object, the same fields Strava
 * fills in, so this is where the two are brought together.
 */

'use strict';

const { channel } = require('./streamChannel');

function positive(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function firstPositive(...vals) {
  for (const v of vals) {
    const n = positive(v);
    if (n != null) return n;
  }
  return null;
}

/** 30-second rolling normalized power. Constant power comes back as itself. */
function normalizedPower(watts) {
  const vals = (watts || []).map((w) => {
    const n = Number(w);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  if (!vals.length) return null;
  const window = 30;
  if (vals.length < window) {
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    return avg > 0 ? Math.round(avg) : null;
  }
  let roll = 0;
  for (let i = 0; i < window; i += 1) roll += vals[i];
  let sum4 = 0;
  let n = 0;
  for (let i = window - 1; i < vals.length; i += 1) {
    if (i >= window) roll += vals[i] - vals[i - window];
    const avg = roll / window;
    sum4 += avg ** 4;
    n += 1;
  }
  if (!n || !(sum4 > 0)) return null;
  return Math.round((sum4 / n) ** 0.25);
}

function powerFromTrace(streams) {
  const watts = channel(streams, 'watts').map((w) => {
    const n = Number(w);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  if (!watts.length) return { avg: null, max: null, np: null };
  const avg = watts.reduce((s, v) => s + v, 0) / watts.length;
  const max = Math.max(...watts);
  return {
    avg: avg > 0 ? Math.round(avg) : null,
    max: max > 0 ? Math.round(max) : null,
    np: normalizedPower(watts),
  };
}

/**
 * @param {object} activity  a GarminActivity document
 * @param {object} streams   unpacked streams, or null
 * @returns {object} fields the activity panel already reads on a Strava ride
 */
function garminHeadline(activity, streams) {
  const raw = activity?.raw || {};
  const power = powerFromTrace(streams);
  return {
    average_watts: positive(activity?.averagePower) || power.avg,
    weighted_average_watts: power.np,
    max_watts: power.max,
    max_heartrate: positive(raw.maxHeartRateInBeatsPerMinute),
    average_cadence: firstPositive(
      raw.averageBikeCadenceInRoundsPerMinute,
      raw.averageRunCadenceInStepsPerMinute,
      raw.averageSwimCadenceInStrokesPerMinute,
    ),
    total_elevation_gain: positive(raw.totalElevationGainInMeters),
    calories: positive(raw.activeKilocalories),
    kilojoules: power.avg && positive(activity?.movingTime || activity?.elapsedTime)
      ? Math.round(power.avg * (activity.movingTime || activity.elapsedTime) / 1000)
      : null,
  };
}

module.exports = { garminHeadline, normalizedPower };
