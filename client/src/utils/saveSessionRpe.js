/**
 * Save a session RPE, whichever source the session came from.
 *
 * Activities reach the calendar from three places — Strava/Garmin, uploaded FIT
 * files, and manual entries — and each has its own update endpoint. Callers
 * shouldn't have to know which; they have an activity and a number.
 */
import { updateFitTraining, updateStravaActivity, updateTraining } from '../services/api';

/** Mirrors the kind detection the dashboard uses when routing to a detail page. */
export function detectActivityKind(activity) {
  const id = String(activity?._id || activity?.id || '');
  if (activity?.type === 'fit' || activity?.source === 'fit' || id.startsWith('fit-')) {
    return { kind: 'fit', id: String(activity?._id || id).replace(/^fit-/, '') };
  }
  if (activity?.type === 'strava' || activity?.source === 'strava' || activity?.stravaId || id.startsWith('strava-')) {
    return { kind: 'strava', id: String(activity?.stravaId || id.replace(/^strava-/, '')) };
  }
  if (activity?.type === 'regular' || id.startsWith('regular-')) {
    return { kind: 'regular', id: String(activity?._id || id).replace(/^regular-/, '') };
  }
  return { kind: null, id: null };
}

/**
 * @param {object} activity
 * @param {number} rpe 1–10
 * @param {string|null} athleteId  set when a coach is logging for an athlete
 * @returns {Promise<void>}
 */
export async function saveSessionRpe(activity, rpe, athleteId = null) {
  const value = Number(rpe);
  if (!Number.isFinite(value) || value < 1 || value > 10) {
    throw new Error('RPE must be between 1 and 10');
  }

  const { kind, id } = detectActivityKind(activity);
  if (!kind || !id) throw new Error('Unknown activity type');

  if (kind === 'fit') return updateFitTraining(id, { rpe: value });
  if (kind === 'strava') return updateStravaActivity(id, { rpe: value }, athleteId);
  // Manual trainings store it capitalised, matching the per-interval field.
  return updateTraining(id, { RPE: value });
}
