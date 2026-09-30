/**
 * The y-axis of the lap chart.
 *
 * Lifted out of LapChart so it can be tested. Its comment history records three
 * rounds of tuning by eye — "nahoře byl nesmysl", then "chci větší range" — and
 * each round moved numbers no test was watching, so the next regression only
 * surfaced as another screenshot.
 *
 * Two sets of values go in, and the distinction is the whole design:
 *
 *   work       — the laps the scale is built from. Recovery and standing laps
 *                are excluded on purpose: a 12 min/km jog between reps would
 *                otherwise drag the slow edge down and squash every rep into
 *                the top quarter of the chart.
 *   plausible  — every lap that will actually be DRAWN, GPS junk already
 *                dropped by the caller. These do not define the slow edge, but
 *                they must not be clipped at the fast edge.
 *   significant — the laps that carry a real share of the session: a warm-up
 *                block, a long steady effort, anything an athlete would name
 *                if asked what they did. These get a third input of their own
 *                because of the bug below.
 *
 * The easy end has the mirror of that problem, and it is what `significant`
 * is for. The slow edge used to be the slowest work lap plus a token pad —
 * five seconds on a swim axis spanning half a minute. A set that opens with
 * three kilometre blocks at 1:29/100m and then swims fifties at 1:06 put those
 * blocks within a second of the bottom of the frame, so half an hour of
 * swimming — most of the session — drew as three grey stubs a few pixels tall
 * while the fifties filled the chart. Nothing was clipped and nothing was
 * wrong, and the picture still said the opposite of what happened.
 *
 * So the bottom edge is placed to give the slowest lap that matters a bar with
 * a readable height, the way Strava's own workout chart does. Rests and
 * recoveries are still not allowed to define it — they clamp to a stub, which
 * for a sixteen-second float is the truth.
 *
 * That last point is the bug this file was extracted to fix. Bars outside the
 * axis are clamped to the frame, so a rep quicker than the top edge draws as a
 * full-height flat-topped bar — it reads as "this was the fastest" while being
 * the one lap whose value the chart is hiding, and it is the lap the athlete
 * looks at first. It happens whenever the two lap classifiers disagree: smart
 * detect runs k-means over a 20-second smoothed speed trace and can call a
 * genuine rep "recovery", while the table colours it as work from a different
 * classifier entirely.
 */

/**
 * The share of the chart's height the slowest lap that matters keeps.
 *
 * Below about a fifth a bar stops being comparable to its neighbours and
 * starts reading as an absence. A third leaves the working laps the top two
 * thirds of the frame, which is where the detail an athlete is looking for
 * actually lives.
 */
const MIN_SLOW_SHARE = 0.3;

/**
 * How far past the working laps the axis may be stretched to honour that.
 *
 * A twenty-minute walk home is significant by time and still has no business
 * setting the scale of a threshold session. The stretch is bounded by the span
 * the work occupies — but with a floor under that span, or a set of
 * near-identical reps would leave no room to stretch at all and the guarantee
 * above would quietly do nothing.
 */
const MAX_SLOW_STRETCH = 1.6;
/** The narrowest span the stretch is measured against, per metric. */
const STRETCH_FLOOR = { swim: 25, run: 60, power: 0.15 };

/**
 * Where the far edge has to sit for a bar at `value` to keep its share.
 *
 * A bar's height is its distance from the axis edge it grows out of, over the
 * whole range. Fixing that fraction and solving for the other edge is all
 * these two are; they differ only in which end the bars grow from.
 */
/** Pace: bars hang from `max`, so height is (max − value) / (max − min). */
function slowEdgeForVisibleBar(value, min) {
  return (value - MIN_SLOW_SHARE * min) / (1 - MIN_SLOW_SHARE);
}
/** Power: bars rise from `min`, so height is (value − min) / (max − min). */
function lowEdgeForVisibleBar(value, max) {
  return (value - MIN_SLOW_SHARE * max) / (1 - MIN_SLOW_SHARE);
}

/** Pace axis (run, swim): lower value = faster = taller bar, so min is the top. */
export function paceAxisBounds({ work, plausible = [], significant = [], isSwim = false, avgForScale = null }) {
  const workVals = (work || []).filter((v) => Number.isFinite(v) && v > 0);
  if (!workVals.length) return null;
  const drawn = (plausible || []).filter((v) => Number.isFinite(v) && v > 0);

  const globalFast = Math.min(...workVals);
  const workSlow = Math.max(...workVals);
  const avg = Number.isFinite(avgForScale)
    ? avgForScale
    : workVals.reduce((a, b) => a + b, 0) / workVals.length;

  // The quickest lap that gets a bar, whichever set it came from.
  const drawnFast = drawn.length ? Math.min(globalFast, ...drawn) : globalFast;

  // Padding proportional to the spread, with the old fixed value as a floor.
  // Eight seconds on an axis spanning two minutes is six percent — no visible
  // headroom at all, so the quickest rep drew against the frame even when it
  // was inside the scale.
  const spread = Math.max(workSlow - globalFast, isSwim ? 5 : 15);
  const fastPad = Math.max(isSwim ? 3 : 8, spread * 0.15);
  const slowPad = Math.max(isSwim ? 5 : 15, spread * 0.15);

  let min = drawnFast - fastPad;
  min = Math.max(isSwim ? 25 : 60, min);
  min = Math.floor(min / 5) * 5;

  // Slow edge from WORK laps only, placed so the session average lands near the
  // middle. Recovery laps clamp to a stub at the bottom instead of defining it.
  let max = Math.max(workSlow + slowPad, 2 * avg - min);

  // Give the slowest lap that matters a bar somebody can read. Work laps count
  // as significant by definition — the slow end of the work set is exactly
  // what used to collapse against the frame.
  const bigVals = (significant || []).filter((v) => Number.isFinite(v) && v > 0);
  const slowestThatMatters = Math.max(workSlow, ...(bigVals.length ? bigVals : [workSlow]));
  const stretchSpan = Math.max(workSlow - min, isSwim ? STRETCH_FLOOR.swim : STRETCH_FLOOR.run);
  const ceilingForStretch = min + stretchSpan * MAX_SLOW_STRETCH;
  const wanted = slowEdgeForVisibleBar(Math.min(slowestThatMatters, ceilingForStretch), min);
  if (wanted > max) max = wanted;

  max = Math.min(isSwim ? 600 : 720, max);
  max = Math.ceil(max / 5) * 5;
  max = Math.max(max, min + 30);

  return { min, max };
}

/** Power axis (bike): higher value = taller bar, so max is the top. */
export function powerAxisBounds({ work, plausible = [], significant = [], avgForScale = null }) {
  const workVals = (work || []).filter((v) => Number.isFinite(v) && v > 0);
  if (!workVals.length) return null;
  const drawn = (plausible || []).filter((v) => Number.isFinite(v) && v > 0);

  const avg = Number.isFinite(avgForScale)
    ? avgForScale
    : workVals.reduce((a, b) => a + b, 0) / workVals.length;

  const maxDev = Math.max(...workVals.map((v) => Math.abs(v - avg)), avg * 0.03);
  const spread = maxDev * 1.1;
  let min = Math.max(0, avg - spread);
  let max = avg + spread;

  // Same guarantee as the pace axis, at the end that means "hardest".
  const drawnHigh = drawn.length ? Math.max(...drawn) : max;
  if (drawnHigh > max) max = drawnHigh + (drawnHigh - min) * 0.08;

  // And the mirror of the pace axis's slow edge: watts grow upward from `min`,
  // so it is the EASIEST lap that collapses against the frame. An endurance
  // block ridden at 180 W under a set of 300 W efforts is the same half hour
  // of riding the swim blocks were, and it drew the same three stubs.
  const workLow = Math.min(...workVals);
  const bigVals = (significant || []).filter((v) => Number.isFinite(v) && v > 0);
  const easiestThatMatters = Math.min(workLow, ...(bigVals.length ? bigVals : [workLow]));
  const stretchSpan = Math.max(max - workLow, max * STRETCH_FLOOR.power);
  const floorForStretch = max - stretchSpan * MAX_SLOW_STRETCH;
  const wanted = lowEdgeForVisibleBar(Math.max(easiestThatMatters, floorForStretch), max);
  if (wanted < min) min = Math.max(0, wanted);

  return { min, max };
}
