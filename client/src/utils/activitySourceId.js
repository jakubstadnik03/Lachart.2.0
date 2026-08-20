/**
 * Which activity a training row should actually open.
 *
 * A logged training is often just the shell: a title, a plan, seven empty lap
 * rows. The session itself — laps, streams, map, heart rate — lives in the
 * Strava, Garmin or FIT record it was created from, and the Training document
 * keeps a reference to it. Opening the shell shows a table of dashes, so
 * follow the reference when there is one.
 *
 * The prefixed id is what ActivityFullModal parses to pick its fetch:
 * 'strava-…', 'garmin-…', 'fit-…', otherwise the training itself.
 */

const clean = (v, prefix) => String(v == null ? '' : v).replace(new RegExp(`^${prefix}-`, 'i'), '').trim();

/**
 * @param {object} t a training or activity row
 * @returns {{kind: 'strava'|'garmin'|'fit'|'regular', id: string, linked: boolean}}
 *   `linked` is true when this points at a source record rather than at the
 *   row itself — the caller keeps the row's own title and planned data.
 */
export function resolveActivitySource(t) {
  if (!t) return { kind: 'regular', id: '', linked: false };

  const strava = clean(t.stravaId || t.sourceStravaActivityId, 'strava');
  if (strava) {
    return { kind: 'strava', id: strava, linked: !t.stravaId && !!t.sourceStravaActivityId };
  }

  const garmin = clean(t.garminActivityId || t.sourceGarminActivityId, 'garmin');
  if (garmin) {
    return { kind: 'garmin', id: garmin, linked: !t.garminActivityId && !!t.sourceGarminActivityId };
  }

  if (t.type === 'fit') {
    const fit = clean(t._id || t.id, 'fit');
    if (fit) return { kind: 'fit', id: fit, linked: false };
  }
  const fitLink = clean(t.sourceFitTrainingId, 'fit');
  if (fitLink) return { kind: 'fit', id: fitLink, linked: true };

  const own = String(t._id || t.id || '').replace(/^(regular|training)-/i, '');
  return { kind: 'regular', id: own, linked: false };
}

/** The id ActivityFullModal fetches by. */
export function prefixedSourceId(t) {
  const { kind, id } = resolveActivitySource(t);
  return id ? `${kind}-${id}` : '';
}

/**
 * What to hand the modal when the row only *points* at the real activity.
 *
 * ActivityFullModal merges as `{ ...fetchedDetail, ...passedActivity }` — the
 * object it is given wins. That is right when the caller has the activity
 * itself, and wrong when the caller has a training shell: its empty lap list,
 * planned intervals and missing averages then overwrite the Garmin or Strava
 * detail that was just fetched, and the session opens half-loaded.
 *
 * So a linked row seeds the modal with identity only, and lets the fetch fill
 * in the session.
 *
 * @returns {object} a slim seed carrying the prefixed id
 */
export function seedForLinkedSource(t, { kind, id }) {
  const seed = { id: `${kind}-${id}`, type: kind };
  // The athlete named the training ("2x30 LT2 + 5x5min"); the source is
  // usually called "Afternoon Ride". Keep the name they gave it.
  if (t?.title) seed.title = t.title;
  if (t?.date) seed.date = t.date;
  if (t?.sport) seed.sport = t.sport;
  // Keep the link back to the training so edits and lactate land on it.
  if (t?._id) seed.trainingId = String(t._id);
  return seed;
}
