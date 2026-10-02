/**
 * The y-axis of the lap chart, shaped like Strava's workout chart.
 *
 * Pace ticks land on the steps athletes say out loud — 5 s on a swim
 * (1:20, 1:25, 1:30), 15 s on a run — with one tick of air past the fastest
 * and slowest lap that still belongs to the session. A walk home does not
 * move the bottom tick; it clamps to a stub. Power starts at 0 and climbs
 * in round watts.
 *
 *   work        — laps the scale is built from. A standing recovery is left
 *                 out so it cannot squash the reps.
 *   plausible   — every lap that will be drawn. The fastest of these must sit
 *                 inside the axis, or it draws as a flat top and reads as
 *                 "the fastest the scale allows".
 *   significant — long blocks the interval classifier sometimes misses.
 *                 They set the slow edge only while they stay within the
 *                 allowance of the working pace.
 */

/**
 * Tick size, in the axis unit. Swim pace is spoken in 5-second steps
 * (1:20, 1:25, 1:30), run pace in 15-second steps, power in round watts.
 * Strava's workout chart labels those steps and nothing in between — an
 * axis of 1:15, 1:28, 1:40 is the same range cut into five equal pieces,
 * and it does not read as a pace.
 */
const PACE_STEP = { swim: 5, run: 15 };

/** One tick of air past the fastest and slowest lap that belongs on the axis. */
function pacePad(isSwim) {
  return isSwim ? PACE_STEP.swim : PACE_STEP.run;
}

/**
 * How far past the working laps a slower lap may still set the bottom edge.
 *
 * A 1:48 length in a set of 1:25s belongs on the chart — Strava shows it as
 * a short bar, not by throwing the axis away. A walk home does not: it would
 * pin every rep to the ceiling. The allowance is a fixed gap plus the spread
 * the work already occupies, whichever is larger.
 */
function slowAllowance(isSwim, spread) {
  const fixed = isSwim ? 40 : 90;
  return Math.max(fixed, spread * 2);
}

function snapDown(value, step) {
  return Math.floor(value / step) * step;
}

function snapUp(value, step) {
  return Math.ceil(value / step) * step;
}

/** Pace axis (run, swim): lower value = faster = taller bar, so min is the top. */
export function paceAxisBounds({ work, plausible = [], significant = [], isSwim = false }) {
  const workVals = (work || []).filter((v) => Number.isFinite(v) && v > 0);
  if (!workVals.length) return null;
  const drawn = (plausible || []).filter((v) => Number.isFinite(v) && v > 0);

  const globalFast = Math.min(...workVals);
  const workSlow = Math.max(...workVals);
  const step = isSwim ? PACE_STEP.swim : PACE_STEP.run;
  const pad = pacePad(isSwim);

  // The quickest lap that gets a bar, whichever set it came from. It has to
  // sit inside the axis or it draws as a flat top and reads as "the fastest
  // the scale allows" rather than as its own pace.
  const drawnFast = drawn.length ? Math.min(globalFast, ...drawn) : globalFast;

  const spread = Math.max(workSlow - globalFast, step);
  const allowance = slowAllowance(isSwim, spread);
  // Slower laps that are still the same session. A walk is past the allowance
  // and stays a stub; it does not move the bottom tick.
  const inSession = drawn.filter((v) => v <= workSlow + allowance);
  const bigVals = (significant || []).filter((v) => Number.isFinite(v) && v > 0 && v <= workSlow + allowance);
  const slow = Math.max(workSlow, ...(inSession.length ? inSession : [workSlow]), ...(bigVals.length ? bigVals : [workSlow]));

  let min = snapDown(drawnFast - pad, step);
  min = Math.max(isSwim ? 25 : 60, min);
  min = snapDown(min, step);

  let max = snapUp(slow + pad, step);
  max = Math.min(isSwim ? 600 : 720, max);
  max = snapUp(max, step);
  if (max < min + step * 4) max = min + step * 4;

  return { min, max, step };
}

/**
 * Which of those ticks get a label.
 *
 * Every step is a real tick, but a run from 5:00 to 9:15 has one every
 * 15 seconds and they paint on top of each other. Skip ahead by whole
 * multiples of the step until a handful fit, still on the minute where
 * the step allows it.
 */
export function axisLabelValues(min, max, step, { maxLabels = 5 } = {}) {
  const ticks = axisTickValues(min, max, step);
  if (ticks.length <= maxLabels) return ticks;
  let stride = 1;
  while (Math.ceil(ticks.length / stride) > maxLabels) stride *= 2;
  const out = [];
  for (let i = 0; i < ticks.length; i += stride) out.push(ticks[i]);
  const last = ticks[ticks.length - 1];
  if (out[out.length - 1] !== last) {
    const prev = out[out.length - 1];
    if (Math.abs(last - prev) < step * stride * 0.75) out[out.length - 1] = last;
    else out.push(last);
  }
  return out;
}

/** Tick labels from `min` to `max` in `step`s. 1:20, 1:25, 1:30 — not five slices of an awkward range. */
export function axisTickValues(min, max, step) {
  if (!(step > 0) || !(max > min)) return [min, max];
  const out = [];
  const start = snapDown(min, step);
  for (let v = start; v <= max + step * 0.001; v += step) {
    const rounded = Math.round(v);
    if (rounded + 0.001 >= min && rounded - 0.001 <= max) out.push(rounded);
  }
  return out.length ? out : [min, max];
}

/** Power axis (bike): higher value = taller bar, so max is the top. */
export function powerAxisBounds({ work, plausible = [] }) {
  const workVals = (work || []).filter((v) => Number.isFinite(v) && v > 0);
  if (!workVals.length) return null;
  const drawn = (plausible || []).filter((v) => Number.isFinite(v) && v > 0);

  const high = Math.max(...workVals, ...(drawn.length ? drawn : [0]));
  // Strava's power chart starts at 0 and climbs in round watts, so a 180 W
  // block and a 300 W set are different heights on the same ruler.
  const step = high <= 200 ? 25 : high <= 500 ? 50 : 100;
  const max = snapUp(high + step / 2, step);

  return { min: 0, max, step };
}
