/**
 * The manual LT1/LT2 panel's units. Pace is typed and shown in the athlete's
 * display units (min/km, min/mile, /100 yd) but stored the way the test was
 * saved, so every value crosses these two functions on its way in and out.
 */

export const M_PER_YARD = 0.9144;
export const KM_PER_MILE = 1.609344;

/** A typed threshold: mm:ss → seconds, or a plain number (watts). */
export const parseLtInput = (v) => {
  const s = String(v || '').trim();
  if (!s) return null;
  const mmssParts = s.match(/^(\d+):(\d{1,2})$/);
  if (mmssParts) return Number(mmssParts[1]) * 60 + Number(mmssParts[2]);
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Seconds suitable for MM:SS labels on the chart / tooltips.
 * - Swim imperial: canonical sec/100m → sec/100yd.
 * - Run: `unitSystem` is resolved display (user + test); `testRunPerMileStorage` is how `power` was saved.
 *   When display is imperial but test stored sec/km → multiply. When display metric but test stored sec/mile → divide.
 */
export const paceSecondsToDisplaySeconds = (
  seconds,
  { isSwimming, unitSystem, testRunPerMileStorage = false }
) => {
  if (seconds == null || !Number.isFinite(Number(seconds))) return seconds;
  const s = Number(seconds);
  const displayImperial = unitSystem === 'imperial';
  if (isSwimming) {
    if (!displayImperial) return s;
    return s * M_PER_YARD;
  }
  if (displayImperial && !testRunPerMileStorage) return s * KM_PER_MILE;
  if (!displayImperial && testRunPerMileStorage) return s / KM_PER_MILE;
  return s;
};

/** The way back: a pace typed in display units → how this test stores it. */
export const displaySecondsToPaceSeconds = (
  seconds,
  { isSwimming, unitSystem, testRunPerMileStorage = false }
) => {
  if (seconds == null || !Number.isFinite(Number(seconds))) return seconds;
  const s = Number(seconds);
  const displayImperial = unitSystem === 'imperial';
  if (isSwimming) return displayImperial ? s / M_PER_YARD : s;
  if (displayImperial && !testRunPerMileStorage) return s / KM_PER_MILE;
  if (!displayImperial && testRunPerMileStorage) return s * KM_PER_MILE;
  return s;
};
