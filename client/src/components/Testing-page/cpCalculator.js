/**
 * Critical Power (CP) calculator.
 *
 * Two-parameter hyperbolic model: P(t) = CP + W' / t
 *
 * Linearisation: W = P × t = CP × t + W'  → least-squares fit (t, W) gives
 * slope = CP and intercept = W'. Works for any number of efforts ≥ 2;
 * accuracy increases with efforts spaced across the work-capacity continuum
 * (typically a "short" 2-5 min effort and a "long" 10-20 min effort).
 *
 * For pace sports the model is the same once we flip the X axis: faster pace
 * = higher intensity, so we work in "speed" (m/s) internally and convert
 * results back to sec/km or sec/100m for display.
 */

/**
 * Fit (CP, W') from a list of efforts.
 *
 * @param {Array<{durationSec: number, value: number}>} efforts
 *   For bike `value` is watts; for run/swim `value` is pace in seconds per km
 *   (run) or per 100 m (swim).
 * @param {'bike' | 'run' | 'swim'} sport
 * @returns {{ cp: number, wPrime: number, valid: boolean, sport: string }}
 *   `cp` in matching units (W for bike, sec/km or sec/100m for pace).
 *   `wPrime` in joules-equivalent (W·s for bike; for pace it's roughly
 *   "seconds gained at CP" — display value mostly).
 */
export function fitCP(efforts, sport = 'bike') {
  const isPace = sport === 'run' || sport === 'swim';
  // Clean + dedupe by duration (keep the strongest effort per duration).
  const seen = new Map();
  for (const e of efforts || []) {
    const t = Number(e?.durationSec);
    const v = Number(e?.value);
    if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(v) || v <= 0) continue;
    // For pace, lower seconds = harder, so the strongest effort is the SMALLEST value.
    const isBetter = !seen.has(t)
      || (isPace ? v < seen.get(t) : v > seen.get(t));
    if (isBetter) seen.set(t, v);
  }
  const pts = [...seen.entries()].map(([t, v]) => ({ t, v }));
  if (pts.length < 2) return { cp: null, wPrime: null, valid: false, sport };

  if (isPace) {
    // For pace sports, convert pace → speed (m/s) so "higher = harder" holds.
    // Bike-equivalent: speed plays the role of power.
    const denom = sport === 'swim' ? 100 : 1000; // sec per 100m or per km
    const xy = pts.map(({ t, v }) => ({ t, v: denom / v })); // v -> m/s
    const fit = lsqCP(xy);
    if (!fit) return { cp: null, wPrime: null, valid: false, sport };
    // Convert speed back to pace (sec / 100 m or sec / km).
    const cpSpeed = fit.cp;
    const cpPace = cpSpeed > 0 ? denom / cpSpeed : null;
    return {
      cp: cpPace,                   // pace seconds at CP
      wPrime: fit.wPrime,           // in metres "above" CP — display only
      cpSpeed,                       // bonus: speed in m/s
      valid: cpPace != null && Number.isFinite(cpPace),
      sport,
    };
  }

  // Bike (watts).
  const fit = lsqCP(pts.map(({ t, v }) => ({ t, v })));
  if (!fit) return { cp: null, wPrime: null, valid: false, sport };
  return {
    cp: fit.cp,
    wPrime: fit.wPrime,
    valid: Number.isFinite(fit.cp) && Number.isFinite(fit.wPrime),
    sport,
  };
}

/**
 * Least-squares fit of W = v × t = cp × t + wPrime in (t, W) space.
 * Returns { cp, wPrime } or null on numerical failure.
 */
function lsqCP(pts) {
  const n = pts.length;
  if (n < 2) return null;
  // Sum needed for slope/intercept via formula.
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const { t, v } of pts) {
    const W = v * t; // work or work-equivalent
    sx += t;
    sy += W;
    sxx += t * t;
    sxy += t * W;
  }
  const mean_x = sx / n;
  const mean_y = sy / n;
  const denom = sxx - n * mean_x * mean_x;
  if (Math.abs(denom) < 1e-9) return null;
  const slope = (sxy - n * mean_x * mean_y) / denom;       // CP
  const intercept = mean_y - slope * mean_x;               // W'
  return { cp: slope, wPrime: intercept };
}

/**
 * Predict sustained value for a given duration from a fit.
 */
export function predictAtDuration(durationSec, fit, sport = 'bike') {
  if (!fit || !fit.valid) return null;
  const t = Number(durationSec);
  if (!Number.isFinite(t) || t <= 0) return null;
  if (sport === 'run' || sport === 'swim') {
    const denom = sport === 'swim' ? 100 : 1000;
    const speed = fit.cpSpeed + (fit.wPrime || 0) / t;
    return speed > 0 ? denom / speed : null;
  }
  return fit.cp + fit.wPrime / t;
}

/**
 * Format CP/pace nicely. For pace returns "M:SS / km" or "M:SS / 100m".
 */
export function formatCpValue(value, sport = 'bike') {
  if (value == null || !Number.isFinite(value)) return '—';
  if (sport === 'bike') return `${Math.round(value)} W`;
  const sec = Math.max(0, Math.round(value));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const unit = sport === 'swim' ? '/100m' : '/km';
  return `${m}:${String(s).padStart(2, '0')} ${unit}`;
}

/**
 * Compare CP vs LT2 from a lactate test. Returns { delta, deltaPct, agreement }.
 * `agreement` is 'excellent' | 'good' | 'fair' | 'poor' — heuristic, helps
 * coaches eyeball whether the two measurements are in line.
 *
 * For bike: delta in watts.
 * For pace: delta in seconds (positive = CP slower than LT2).
 */
export function compareCpToLt2(cp, lt2, sport = 'bike') {
  if (cp == null || lt2 == null || !Number.isFinite(cp) || !Number.isFinite(lt2)) {
    return { delta: null, deltaPct: null, agreement: null };
  }
  const isPace = sport === 'run' || sport === 'swim';
  // For bike, CP is usually slightly ABOVE LT2 (5–15 W). For pace, CP is in
  // SECONDS — faster = smaller seconds, so CP < LT2 (in sec) means CP is the
  // faster pace, which is the expected direction.
  const delta = cp - lt2;
  const deltaPct = (delta / lt2) * 100;
  const absPct = Math.abs(deltaPct);
  let agreement = 'poor';
  if (absPct <= 3) agreement = 'excellent';
  else if (absPct <= 7) agreement = 'good';
  else if (absPct <= 15) agreement = 'fair';
  return { delta, deltaPct, agreement, isPace };
}
