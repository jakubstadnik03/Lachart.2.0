/**
 * Pan, zoom and read-out maths for the shared chart.
 *
 * Kept separate from the component because this is where charts actually go
 * wrong — a zoom that drifts, a pan that escapes the data, a tooltip that
 * reports the wrong sample — and none of that is catchable by looking at a
 * picture. The component below it is only projection and SVG.
 *
 * The window is expressed as a fraction of the full domain ({ start, end } in
 * 0..1) rather than in data units, so the same maths works for a 40-minute
 * interval session and a 6-hour ride without rescaling anything.
 */

/** Never zoom in past this fraction of the data — beyond it you're reading noise. */
export const MIN_WINDOW = 0.005;

export const FULL_WINDOW = { start: 0, end: 1 };

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Keep a window inside 0..1 and no narrower than MIN_WINDOW, preserving its width. */
export function normaliseWindow(win) {
  let start = Number(win?.start);
  let end = Number(win?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ...FULL_WINDOW };
  if (end < start) [start, end] = [end, start];

  let width = clamp(end - start, MIN_WINDOW, 1);
  start = clamp(start, 0, 1 - width);
  end = start + width;

  // Floating-point drift after many gestures would otherwise creep past 1.
  if (end > 1) { end = 1; start = clamp(1 - width, 0, 1); }
  return { start, end };
}

export function isFullWindow(win) {
  const w = normaliseWindow(win);
  return w.start <= 0 && w.end >= 1;
}

/**
 * Zoom about a focal point.
 *
 * The focus is a fraction of the *viewport*, not of the data: zooming with the
 * pointer over the right-hand edge has to keep whatever is under the pointer
 * under the pointer, which is the whole reason a zoom feels attached to the
 * data rather than to the canvas.
 *
 * @param {object} win     current window
 * @param {number} factor  <1 zooms in, >1 zooms out
 * @param {number} focus   0..1 across the current viewport
 */
export function zoomWindow(win, factor, focus = 0.5) {
  const w = normaliseWindow(win);
  const f = clamp(Number(focus) || 0, 0, 1);
  const width = w.end - w.start;
  const anchor = w.start + width * f;

  const nextWidth = clamp(width * (Number(factor) || 1), MIN_WINDOW, 1);
  return normaliseWindow({
    start: anchor - nextWidth * f,
    end: anchor + nextWidth * (1 - f),
  });
}

/**
 * Pan by a fraction of the *viewport* width. Positive moves the view forward
 * through the data (content moves left, as a drag-left would).
 */
export function panWindow(win, deltaFraction) {
  const w = normaliseWindow(win);
  const width = w.end - w.start;
  const shift = width * (Number(deltaFraction) || 0);
  // Clamped as a pair so panning at the edge stops rather than squashing the
  // window, which is what makes a drag feel like it hits a wall.
  const maxStart = 1 - width;
  const start = clamp(w.start + shift, 0, maxStart);
  return { start, end: start + width };
}

/** Data-space x for a viewport fraction. */
export function windowToDomain(win, fraction, domain) {
  const w = normaliseWindow(win);
  const [lo, hi] = domain;
  const at = w.start + (w.end - w.start) * clamp(fraction, 0, 1);
  return lo + (hi - lo) * at;
}

/**
 * The sample nearest a viewport position.
 *
 * Binary search, because a 6-hour ride at 1 Hz is 20 000 points and doing this
 * linearly on every pointer move is what makes a chart feel heavy.
 *
 * @param {Array<number>} xs  ascending x values
 */
export function nearestIndex(xs, targetX) {
  if (!Array.isArray(xs) || !xs.length) return -1;
  let lo = 0;
  let hi = xs.length - 1;
  if (targetX <= xs[lo]) return lo;
  if (targetX >= xs[hi]) return hi;

  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] === targetX) return mid;
    if (xs[mid] < targetX) lo = mid; else hi = mid;
  }
  return targetX - xs[lo] <= xs[hi] - targetX ? lo : hi;
}

/** Index range visible in the window, inclusive. */
export function visibleRange(xs, win, domain) {
  if (!Array.isArray(xs) || !xs.length) return [0, -1];
  const from = windowToDomain(win, 0, domain);
  const to = windowToDomain(win, 1, domain);
  let lo = nearestIndex(xs, from);
  let hi = nearestIndex(xs, to);
  // Include the samples just outside so lines reach the edges rather than
  // stopping short of them.
  if (xs[lo] > from && lo > 0) lo -= 1;
  if (xs[hi] < to && hi < xs.length - 1) hi += 1;
  return [lo, hi];
}

/**
 * Thin a series down to what a canvas of `width` pixels can actually show.
 *
 * Uses min/max buckets rather than plain sampling: dropping every other point
 * hides the spikes, and the spikes are the intervals. Each bucket contributes
 * its extremes, so the envelope survives.
 */
export function downsample(points, width) {
  const target = Math.max(2, Math.floor(width));
  if (!Array.isArray(points) || points.length <= target * 2) return points || [];

  const bucketSize = points.length / target;
  const out = [];
  for (let b = 0; b < target; b += 1) {
    const from = Math.floor(b * bucketSize);
    const to = Math.min(points.length, Math.floor((b + 1) * bucketSize));
    if (to <= from) continue;
    let minI = from;
    let maxI = from;
    for (let i = from; i < to; i += 1) {
      if (points[i].y < points[minI].y) minI = i;
      if (points[i].y > points[maxI].y) maxI = i;
    }
    // Keep chronological order within the bucket.
    if (minI <= maxI) { out.push(points[minI]); if (maxI !== minI) out.push(points[maxI]); }
    else { out.push(points[maxI]); out.push(points[minI]); }
  }
  return out;
}

/** Nice round axis ticks covering [lo, hi]. */
export function niceTicks(lo, hi, count = 4) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [];
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  // Smallest of the conventional 1 / 2 / 2.5 / 5 / 10 ladder that still covers
  // the requested spacing. Leaving 2.5 out of the ladder is what turns a 0–100
  // axis into 0/50/100 — technically round, but half the ticks asked for.
  const step = ([1, 2, 2.5, 5, 10].find((c) => c * mag >= raw) ?? 10) * mag;
  const first = Math.ceil(lo / step) * step;
  const ticks = [];
  for (let v = first; v <= hi + step * 1e-9; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

/** Lap boundaries as viewport fractions, with clean 1-based numbering. */
export function lapBands(laps, domain) {
  if (!Array.isArray(laps) || !laps.length) return [];
  const [lo, hi] = domain;
  const span = hi - lo;
  if (!(span > 0)) return [];
  return laps
    .map((lap, i) => {
      const from = Number(lap?.start);
      const to = Number(lap?.end);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
      return {
        // 1-based, and numbered by position in the session rather than by any
        // id the device happened to assign — devices restart lap numbering
        // after a pause and the athlete does not care.
        number: i + 1,
        label: lap.label || `Lap ${i + 1}`,
        from: (from - lo) / span,
        to: (to - lo) / span,
        hard: !!lap.hard,
      };
    })
    .filter(Boolean);
}
