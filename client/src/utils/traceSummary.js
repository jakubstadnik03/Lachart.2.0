/**
 * The headline numbers of a session, read off its per-second trace.
 *
 * Strava stores them on the activity (average watts, normalized power, the
 * climb). A Garmin summary often does not, even when the trace the chart is
 * drawn from has every sample. The panel then showed a duration and a heart
 * rate beside a chart that clearly had power, cadence and elevation in it.
 */

function nums(records, read) {
  const out = [];
  for (const r of records || []) {
    const n = Number(read(r));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Coggan normalized power: 30s rolling mean, then the fourth-root of the mean fourth power. */
export function normalizedPower(watts) {
  const vals = (watts || []).map((w) => {
    const n = Number(w);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  if (!vals.length) return 0;
  const window = 30;
  if (vals.length < window) {
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    return avg > 0 ? Math.round(avg) : 0;
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
  if (!n || !(sum4 > 0)) return 0;
  return Math.round((sum4 / n) ** 0.25);
}

/**
 * Climb, ignoring the sub-metre jitter a barometer reports while you sit still.
 * A rise counts, and the baseline only moves once the trace has actually gone
 * up or down by half a metre.
 */
export function elevationGainMeters(altitudes) {
  const vals = (altitudes || []).map(Number).filter((n) => Number.isFinite(n));
  if (vals.length < 2) return 0;
  let gain = 0;
  let prev = vals[0];
  for (let i = 1; i < vals.length; i += 1) {
    const d = vals[i] - prev;
    if (d >= 0.5) {
      gain += d;
      prev = vals[i];
    } else if (d <= -0.5) {
      prev = vals[i];
    }
  }
  return Math.round(gain);
}

export function summarizeTrace(records) {
  const empty = {
    avgPower: 0, maxPower: 0, normalizedPower: 0,
    elevationGain: 0, avgCadence: 0, maxHeartRate: 0,
  };
  if (!Array.isArray(records) || records.length === 0) return empty;

  const watts = nums(records, (r) => r.power ?? r.watts);
  const wattsForAvg = watts.filter((w) => w >= 0);
  const avgPower = wattsForAvg.length
    ? Math.round(wattsForAvg.reduce((s, v) => s + v, 0) / wattsForAvg.length)
    : 0;
  const maxPower = watts.length ? Math.round(Math.max(...watts)) : 0;

  const cadence = nums(records, (r) => r.cadence).filter((c) => c > 0);
  const avgCadence = cadence.length
    ? Math.round(cadence.reduce((s, v) => s + v, 0) / cadence.length)
    : 0;

  const hrs = nums(records, (r) => r.heartRate ?? r.heartrate).filter((h) => h > 0);
  const maxHeartRate = hrs.length ? Math.round(Math.max(...hrs)) : 0;

  return {
    avgPower,
    maxPower,
    normalizedPower: normalizedPower(watts),
    elevationGain: elevationGainMeters(nums(records, (r) => r.altitude)),
    avgCadence,
    maxHeartRate,
  };
}
