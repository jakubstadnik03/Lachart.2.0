/**
 * Builds a descriptive workout title from the detected interval structure,
 * e.g. "5×8min", "8×30s + 4×3min", optionally suffixed with a category label
 * ("5×8min LT2"). Returns null when there's no clear repeated work structure.
 * Uses the shared intensity-based lap classifier.
 *
 * Some sessions are set in time and some in distance, and the title has to say
 * which. A swimmer swims 6×100 m and a cyclist rides 5×8 min — calling the
 * swim "6×1.5min" is not a rounding problem, it is the wrong unit, and no
 * swimmer would recognise their own session in it. So the axis is chosen per
 * session: whichever of duration and distance the reps agree on more closely
 * is the one the athlete was actually holding, with swimming defaulting to
 * distance because a pool leaves no other choice.
 *
 * Distances are rounded to what someone would have written on the plan —
 * 97.4 m of GPS drift is a 100, and 2.03 km is 2 km.
 */
import { classifyLaps } from './lapClassify';

const lapDurSec = (l) =>
  Number(l?.elapsed_time || l?.totalElapsedTime || l?.durationSeconds || l?.duration || l?.moving_time || 0) || 0;

const lapDistM = (l) =>
  Number(l?.distance || l?.totalDistance || l?.distanceMeters || 0) || 0;

/** Round a work-lap duration to a clean value so 478s reads as "8min". */
function roundDur(s) {
  if (s < 90) return Math.round(s / 5) * 5;      // nearest 5s
  return Math.round(s / 30) * 30;                // nearest 30s
}

function fmtDur(s) {
  if (s < 60) return `${Math.round(s)}s`;
  const m = s / 60;
  return Number.isInteger(m) ? `${m}min` : `${Math.round(m * 2) / 2}min`;
}

/**
 * Round a work-lap distance to the number the session was set in.
 *
 * Pool lengths make swimming a 25 m grid all the way up; on land the grid
 * opens out with the distance, because nobody sets a rep at 2.15 km.
 */
function roundDist(m, isSwim) {
  if (isSwim) return Math.max(25, Math.round(m / 25) * 25);
  if (m < 2000) return Math.max(50, Math.round(m / 50) * 50);
  if (m < 10000) return Math.round(m / 500) * 500;
  return Math.round(m / 1000) * 1000;
}

function fmtDist(m, isSwim) {
  // Swimmers count in metres well past a kilometre — a 1500 is a 1500, not a
  // 1.5 km. On land the switch happens at the kilometre.
  if (isSwim ? m < 2000 : m < 1000) return `${Math.round(m)}m`;
  const km = m / 1000;
  return `${Number.isInteger(km) ? km : Math.round(km * 10) / 10}km`;
}

/** Coefficient of variation — how tightly a set of numbers agrees. */
function cv(values) {
  const usable = values.filter((v) => v > 0);
  if (usable.length < 2) return Infinity;
  const mean = usable.reduce((a, b) => a + b, 0) / usable.length;
  if (!(mean > 0)) return Infinity;
  const variance = usable.reduce((a, b) => a + (b - mean) ** 2, 0) / usable.length;
  return Math.sqrt(variance) / mean;
}

/**
 * Group values that are within 15% of each other, keeping a running mean.
 * @returns {Array<{ value: number, count: number }>}
 */
function groupSimilar(values) {
  const groups = [];
  values.forEach((v) => {
    const g = groups.find((grp) => Math.abs(grp.value - v) <= 0.15 * Math.max(grp.value, v));
    if (g) { g.count += 1; g.sum += v; g.value = Math.round(g.sum / g.count); }
    else groups.push({ value: v, count: 1, sum: v });
  });
  return groups;
}

/**
 * @param {Array} laps
 * @param {{ categoryLabel?: string|null, sport?: string }} [opts]
 * @returns {string|null}
 */
export function buildStructureTitle(laps, opts = {}) {
  if (!Array.isArray(laps) || laps.length < 3) return null;
  const sport = String(opts.sport || 'bike').toLowerCase();
  const isSwim = sport.includes('swim');
  const types = classifyLaps(laps, opts.sport || 'bike');

  const work = laps
    .map((l, i) => ({ type: types[i], s: lapDurSec(l), m: lapDistM(l) }))
    .filter((x) => x.type === 'work' && x.s > 0);
  if (work.length < 2) return null;

  const durs = work.map((x) => x.s);
  const dists = work.map((x) => x.m);
  const haveDistance = dists.filter((m) => m > 0).length >= work.length * 0.6;

  // Which did the athlete hold constant? A set of 400s comes back as four
  // near-identical distances and four drifting times; a set of 8-minute
  // efforts is the other way round. Swimming skips the question — a pool is
  // measured in lengths whatever the clock says.
  const byDistance = haveDistance
    && (isSwim || cv(dists) < cv(durs) * 0.8);

  const values = byDistance
    ? dists.map((m) => roundDist(m, isSwim))
    : durs.map(roundDur);
  const fmt = byDistance ? (v) => fmtDist(v, isSwim) : fmtDur;

  const groups = groupSimilar(values);

  // Keep groups of ≥2 reps; if none repeat, it's not a structured session.
  const parts = groups
    .filter((g) => g.count >= 2 || groups.length === 1)
    .sort((a, b) => b.count - a.count)
    .map((g) => `${g.count}×${fmt(byDistance ? roundDist(g.value, isSwim) : g.value)}`);
  if (parts.length === 0) return null;

  let title = parts.join(' + ');
  if (opts.categoryLabel) title += ` ${opts.categoryLabel}`;
  return title;
}

export default buildStructureTitle;
