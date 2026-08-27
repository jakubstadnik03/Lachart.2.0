/**
 * The test, reduced to the handful of numbers the drift engine anchors on.
 *
 * Server-side counterpart of client/src/utils/extractLactateThresholds.js.
 * That module cannot be shared — it pulls calculateThresholds out of a React
 * component — but the server has its own twin of the same curve pipeline in
 * utils/lactateThresholds.js, so both sides reach the same LT1/LT2 by the same
 * methods. What is assembled here is only the shape the engine reads:
 * thresholds, the heart rates measured at them, and the raw stage points that
 * give the HR-demand line its slope.
 *
 * A manual override always wins. When a coach has pinned LT2 by hand, that is
 * the number the athlete's zones are built from, and reading drift against a
 * different one would compare training to a threshold nobody trains by.
 */

'use strict';

const { calculateThresholds } = require('./lactateThresholds');
const { getEffectiveLactateInputMode, normalizeLactateSport } = require('./lactateTestInputMode');

/**
 * A missing value must come back as null, not zero. Number('') is 0 and
 * Number.isFinite(0) is true, so the obvious version reports "override present,
 * value 0" for every test that has no override — which reads as a real
 * threshold of zero and skips the curve calculation entirely.
 */
function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} test  a Test document
 * @returns {null | {sport, isPace, storageMode, lt1, lt2, lt1Hr, lt2Hr, points}}
 */
function extractAnchor(test) {
  if (!test) return null;
  const sport = normalizeLactateSport(test.sport);
  const storageMode = getEffectiveLactateInputMode(test);
  const override = test.thresholdOverrides || {};

  let lt1 = num(override.LTP1);
  let lt2 = num(override.LTP2);
  let lt1Hr = num(override.LTP1_hr);
  let lt2Hr = num(override.LTP2_hr);

  if (lt1 == null || lt2 == null || lt1Hr == null || lt2Hr == null) {
    try {
      const thr = calculateThresholds(test);
      if (thr) {
        if (lt1 == null) lt1 = num(thr.LTP1);
        if (lt2 == null) lt2 = num(thr.LTP2);
        if (lt1Hr == null) lt1Hr = num(thr.heartRates?.LTP1);
        if (lt2Hr == null) lt2Hr = num(thr.heartRates?.LTP2);
      }
    } catch {
      // A test the curve pipeline cannot read yields no anchor, which the
      // caller reports as "no LT2" rather than guessing one.
    }
  }

  const points = (Array.isArray(test.results) ? test.results : [])
    .filter((r) => r?.intervalType !== 'recovery')
    .map((r) => ({ x: num(r.power ?? r.interval), y: num(r.lactate), hr: num(r.heartRate) }))
    .filter((p) => p.x > 0 && p.y > 0);

  if (!(lt2 > 0)) return null;

  return {
    sport,
    isPace: sport === 'run' || sport === 'swim',
    storageMode,
    lt1,
    lt2,
    lt1Hr: lt1Hr != null ? Math.round(lt1Hr) : null,
    lt2Hr: lt2Hr != null ? Math.round(lt2Hr) : null,
    points,
  };
}

module.exports = { extractAnchor };
