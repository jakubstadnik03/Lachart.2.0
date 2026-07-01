/**
 * Strava running cadence: streams and lap averages are "strides/min" (one foot
 * per cycle). Strava UI shows steps/min (spm) = 2× that value. Cycling stays rpm.
 * FIT running files already store full spm — do not double those.
 */

export function isRunLikeSport(sport) {
  const s = String(sport || '').toLowerCase();
  return /run|walk|hike|trail/.test(s);
}

/** Convert Strava stream / lap-average cadence to display spm (runs) or rpm (bike). */
export function stravaHalfCadenceToSpm(cadence, sport) {
  const n = Number(cadence);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (isRunLikeSport(sport)) return Math.round(n * 2);
  return Math.round(n);
}

export function cadenceDisplayUnit(sport) {
  return isRunLikeSport(sport) ? 'spm' : 'rpm';
}

export function formatCadenceText(cadence, sport, { fromStravaHalf = false } = {}) {
  const value = fromStravaHalf
    ? stravaHalfCadenceToSpm(cadence, sport)
    : (Number.isFinite(Number(cadence)) && Number(cadence) > 0 ? Math.round(Number(cadence)) : null);
  if (value == null) return null;
  const unit = cadenceDisplayUnit(sport);
  return `${value} ${unit}`;
}
