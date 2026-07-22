/**
 * Intensity-based lap classification (shared by Compare chart, lap tables and
 * the auto-title generator).
 *
 * The old heuristic classified work laps by ODD/EVEN position, which badly
 * misfires on real rides (a 24-min tempo block or a 47-second soft-pedal both
 * landed on an "odd index" and were called Work). This instead compares each
 * lap's intensity to the session's time-weighted average: a lap that is
 * clearly HARDER than the session average is work; the softer bits are
 * warm-up (first), cool-down (last) or recovery. Explicit interval tags and
 * name hints still win. Falls back to the positional heuristic only when a lap
 * has no usable intensity signal.
 *
 * @returns {Array<'work'|'recovery'|'warmup'|'cooldown'>}
 */

const lapDur = (l) =>
  Number(l?.elapsed_time || l?.totalElapsedTime || l?.durationSeconds || l?.duration || l?.moving_time || 0) || 0;
const lapDist = (l) => Number(l?.distance || l?.totalDistance || l?.distanceMeters || 0) || 0;

/** Higher = harder. Bike → power; run/swim → speed (dist/time). */
function lapIntensity(l, sport) {
  if (sport === 'run' || sport === 'swim') {
    const d = lapDist(l);
    const t = lapDur(l);
    return d > 0 && t > 0 ? d / t : 0;
  }
  const p = Number(l?.power ?? l?.average_watts ?? l?.avgPower ?? l?.averagePower ?? l?.watts);
  return Number.isFinite(p) && p > 0 ? p : 0;
}

export function classifyLaps(laps, sport = 'bike') {
  const n = Array.isArray(laps) ? laps.length : 0;
  const out = new Array(n).fill('work');
  if (n === 0) return out;

  const intens = laps.map((l) => lapIntensity(l, sport));
  const durs = laps.map((l) => lapDur(l) || 1);
  const totalT = durs.reduce((a, b) => a + b, 0) || 1;
  const positive = intens.filter((v) => v > 0);
  const haveIntensity = positive.length >= 2;
  const avg = haveIntensity ? laps.reduce((a, l, i) => a + intens[i] * durs[i], 0) / totalT : 0;
  const maxI = positive.length ? Math.max(...positive) : 0;
  // Steady ride (little spread above the mean) → no distinct intervals; call
  // everything work except an easy first/last lap.
  const steady = haveIntensity && avg > 0 && (maxI - avg) / avg < 0.12;

  for (let i = 0; i < n; i++) {
    const l = laps[i];
    const it = String(l?.intervalType || '').toLowerCase();
    if (it === 'work' || it === 'recovery' || it === 'warmup' || it === 'cooldown') { out[i] = it; continue; }
    if (l?.isRecovery === true) { out[i] = 'recovery'; continue; }
    const name = String(l?.name || '').toLowerCase();
    if (/warm.?up|rozeh/.test(name)) { out[i] = 'warmup'; continue; }
    if (/cool.?down|zklidn/.test(name)) { out[i] = 'cooldown'; continue; }
    if (/recov|odpoc|rest/.test(name)) { out[i] = 'recovery'; continue; }
    if (/interval|work|int\s*\d/.test(name)) { out[i] = 'work'; continue; }

    // Intensity-based (the real classification).
    if (haveIntensity && avg > 0) {
      if (steady) {
        out[i] = i === 0 && n > 2 ? 'warmup' : i === n - 1 && n > 2 ? 'cooldown' : 'work';
      } else if (intens[i] >= avg * 1.02) {
        out[i] = 'work';
      } else if (i === 0 && n > 2) {
        out[i] = 'warmup';
      } else if (i === n - 1 && n > 2) {
        out[i] = 'cooldown';
      } else {
        out[i] = 'recovery';
      }
      continue;
    }

    // No intensity data — fall back to distance/pace + position.
    const dist = lapDist(l);
    const dur = lapDur(l);
    if (dist > 0 && dist < 200) { out[i] = 'recovery'; continue; }
    if (dist > 0 && dur > 0 && dur / (dist / 1000) > 480) { out[i] = 'recovery'; continue; }
    if (i === 0 && n > 2) { out[i] = 'warmup'; continue; }
    if (i === n - 1 && n > 2) { out[i] = 'cooldown'; continue; }
    out[i] = n >= 5 ? (i % 2 === 1 ? 'work' : 'recovery') : 'work';
  }
  return out;
}

/** Convenience: type of a single lap given the whole session. */
export function lapTypeAt(laps, index, sport = 'bike') {
  return classifyLaps(laps, sport)[index] || 'work';
}

export default classifyLaps;
