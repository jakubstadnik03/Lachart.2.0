/**
 * Write the lactate a training just recorded back onto the activity it came from.
 *
 * The calendar renders the *activity's* laps, not the training's results, so a
 * reading that only reaches the Training collection shows up in one view and
 * not the other. Three pages did this by hand for Strava and none of them did
 * it for Garmin, which is why lactate typed against a Garmin ride appeared to
 * save and then wasn't there.
 *
 * Failures are swallowed on purpose: the training itself is already saved, and
 * losing the mirror is better than failing the save the athlete just made.
 */
import { updateGarminLactateValues, updateStravaLactateValues } from '../services/api';

/** Which lap a result row came from — explicit index first, 1-based interval second. */
function lapIndexOf(result) {
  if (Number.isInteger(result?.sourceLapIndex)) return result.sourceLapIndex;
  const interval = Number(result?.interval);
  return interval > 0 ? interval - 1 : null;
}

/**
 * @param {object} formData the saved training, carrying its source link
 * @param {Array<object>} results the training's result rows
 * @returns {Promise<{ mirrored: 'strava'|'garmin'|null, count: number }>}
 */
export async function mirrorLactateToSource(formData, results) {
  if (!formData || !Array.isArray(results)) return { mirrored: null, count: 0 };

  const lactateValues = results
    .map((r) => {
      const lapIndex = lapIndexOf(r);
      if (lapIndex == null || !Number.isFinite(Number(r?.lactate))) return null;
      return { lapIndex, lactate: Number(r.lactate) };
    })
    .filter(Boolean);
  if (lactateValues.length === 0) return { mirrored: null, count: 0 };

  const stravaId = formData.sourceStravaActivityId;
  const garminId = formData.sourceGarminActivityId
    || (formData.source === 'garmin' || formData.type === 'garmin' ? formData.garminId : null);

  try {
    if (stravaId) {
      await updateStravaLactateValues(stravaId, lactateValues);
      return { mirrored: 'strava', count: lactateValues.length };
    }
    if (garminId) {
      await updateGarminLactateValues(garminId, lactateValues);
      return { mirrored: 'garmin', count: lactateValues.length };
    }
  } catch (err) {
    console.warn('[lactate] mirror to source activity failed (non-blocking):', err?.message);
  }
  return { mirrored: null, count: 0 };
}

export default mirrorLactateToSource;
