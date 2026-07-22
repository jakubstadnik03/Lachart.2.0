/**
 * Builds a descriptive workout title from the detected interval structure,
 * e.g. "5×8min", "8×30s + 4×3min", optionally suffixed with a category label
 * ("5×8min LT2"). Returns null when there's no clear repeated work structure.
 * Uses the shared intensity-based lap classifier.
 */
import { classifyLaps } from './lapClassify';

const lapDurSec = (l) =>
  Number(l?.elapsed_time || l?.totalElapsedTime || l?.durationSeconds || l?.duration || l?.moving_time || 0) || 0;

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
 * @param {Array} laps
 * @param {{ categoryLabel?: string|null }} [opts]
 * @returns {string|null}
 */
export function buildStructureTitle(laps, opts = {}) {
  if (!Array.isArray(laps) || laps.length < 3) return null;
  const types = classifyLaps(laps, opts.sport || 'bike');
  const workDurs = laps
    .map((l, i) => ({ type: types[i], s: lapDurSec(l) }))
    .filter((x) => x.type === 'work' && x.s > 0)
    .map((x) => x.s);
  if (workDurs.length < 2) return null;

  // Group work laps by rounded duration (±15% tolerance).
  const groups = [];
  workDurs.map(roundDur).forEach((d) => {
    const g = groups.find((grp) => Math.abs(grp.dur - d) <= 0.15 * Math.max(grp.dur, d));
    if (g) { g.count += 1; g.sum += d; g.dur = Math.round(g.sum / g.count); }
    else groups.push({ dur: d, count: 1, sum: d });
  });

  // Keep groups of ≥2 reps; if none repeat, it's not a structured session.
  const parts = groups
    .filter((g) => g.count >= 2 || groups.length === 1)
    .sort((a, b) => b.count - a.count)
    .map((g) => `${g.count}×${fmtDur(g.dur)}`);
  if (parts.length === 0) return null;

  let title = parts.join(' + ');
  if (opts.categoryLabel) title += ` ${opts.categoryLabel}`;
  return title;
}

export default buildStructureTitle;
