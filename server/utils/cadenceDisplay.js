/** Strava run stream/lap cadence → display spm (×2). See client/src/utils/cadenceDisplay.js */

function isRunLikeSport(sport) {
  const s = String(sport || '').toLowerCase();
  return /run|walk|hike|trail/.test(s);
}

function stravaHalfCadenceToSpm(cadence, sport) {
  const n = Number(cadence);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (isRunLikeSport(sport)) return Math.round(n * 2);
  return Math.round(n);
}

module.exports = { isRunLikeSport, stravaHalfCadenceToSpm };
