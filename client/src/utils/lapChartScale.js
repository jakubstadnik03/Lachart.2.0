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

/** Pace axis (run, swim): lower value = faster = taller bar, so min is the top. */
export function paceAxisBounds({ work, plausible = [], isSwim = false, avgForScale = null }) {
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
  max = Math.min(isSwim ? 600 : 720, max);
  max = Math.ceil(max / 5) * 5;
  max = Math.max(max, min + 30);

  return { min, max };
}

/** Power axis (bike): higher value = taller bar, so max is the top. */
export function powerAxisBounds({ work, plausible = [], avgForScale = null }) {
  const workVals = (work || []).filter((v) => Number.isFinite(v) && v > 0);
  if (!workVals.length) return null;
  const drawn = (plausible || []).filter((v) => Number.isFinite(v) && v > 0);

  const avg = Number.isFinite(avgForScale)
    ? avgForScale
    : workVals.reduce((a, b) => a + b, 0) / workVals.length;

  const maxDev = Math.max(...workVals.map((v) => Math.abs(v - avg)), avg * 0.03);
  const spread = maxDev * 1.1;
  const min = Math.max(0, avg - spread);
  let max = avg + spread;

  // Same guarantee as the pace axis, at the end that means "hardest".
  const drawnHigh = drawn.length ? Math.max(...drawn) : max;
  if (drawnHigh > max) max = drawnHigh + (drawnHigh - min) * 0.08;

  return { min, max };
}
