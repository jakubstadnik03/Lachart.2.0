/**
 * One session, one row.
 *
 * The training log is fed from three places at once — the Training
 * collection, FIT uploads, and the imported Strava/Garmin activities — and a
 * single ride can arrive from more than one of them. The athlete sees the
 * same session listed twice, with the numbers split across the copies.
 *
 * Three passes, each catching a pair the previous one cannot see, and every
 * pass keeps whichever copy carries more of the session.
 */

/**
 * How much of the session a row actually holds. Ties keep the earlier row,
 * which is the training — the copy the athlete titles, categorises and
 * comments on.
 *
 * Laps count for one point and no more. They are what an imported ride has
 * instead of results, and without them an empty training beat the very
 * activity it was made from, leaving the log showing a named row with no
 * numbers under it. One point settles that and cannot do anything else: a
 * ninety-lap ride must not outrank a three-interval training, which is what
 * scoring laps by length would have done.
 */
export function trainingRowScore(t) {
  const res = Array.isArray(t?.results) ? t.results : [];
  const laps = Array.isArray(t?.lapProfile) ? t.lapProfile
    : Array.isArray(t?.laps) ? t.laps
      : [];
  return res.length * 10
    + (res.some(r => Number(r.power) > 0) ? 5 : 0)
    + (res.some(r => Number(r.lactate) > 0) || Number(t?.lactate) > 0 ? 3 : 0)
    + (laps.length >= 3 ? 1 : 0);
}

const idOf = (t) => String(t?._id || t?.id || '');

/**
 * Every activity id a row answers to.
 *
 * A training records the ride it was built from; an activity *is* that ride
 * and knows its own ids. Putting both in one bucket is what lets the two
 * recognise each other.
 *
 * Both id shapes are in the database and both are correct: trainings made on
 * the client store the provider's numeric id, trainings the server built from
 * an import store the activity's Mongo `_id`. Listing every id a row has means
 * either shape finds its pair without either side having to be migrated.
 */
export function activityKeysOf(t) {
  const keys = [];
  const add = (v) => { const k = String(v ?? '').trim(); if (k) keys.push(k); };
  add(t?.sourceStravaActivityId);
  add(t?.sourceGarminActivityId);
  add(t?.stravaId);
  add(t?.garminId);
  // Only for rows that ARE an activity. A training's own `_id` is not an
  // activity id, and bucketing by it would join rows that share nothing.
  if (t?.stravaId != null || t?.garminId != null) add(t?._id);
  return keys;
}

export function dedupeTrainingRows(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];

  // Pass 1 — the same document twice, because two feeds both returned it.
  const seenId = new Set();
  const p1 = list.filter((t) => {
    const k = idOf(t);
    if (!k || seenId.has(k)) return false;
    seenId.add(k);
    return true;
  });

  // Pass 2 — a training and the ride it was built from.
  //
  // This is the only pass that can see that pair. Pass 3 compares titles, and
  // renaming the training is exactly what an athlete does — "4x20min" over
  // Strava's "Bike - 20+ 4x15 LT2 + 20 @368" — so one ride was listed twice
  // for no reason other than having been given a better name.
  const bySource = new Map();
  p1.forEach((t) => {
    for (const k of activityKeysOf(t)) {
      const prev = bySource.get(k);
      if (!prev || trainingRowScore(t) > trainingRowScore(prev)) bySource.set(k, t);
    }
  });
  // Dropped as soon as something richer claims ANY of its keys. Sharing a key
  // means sharing an activity id, so the rows really are one session: an
  // activity that keeps its own `stravaId` bucket while losing the `_id`
  // bucket to the training built from it is still the same ride, and
  // "survives if it wins anywhere" would have kept both.
  const p2 = p1.filter((t) => {
    const keys = activityKeysOf(t);
    if (!keys.length) return true;
    return keys.every((k) => idOf(bySource.get(k)) === idOf(t));
  });

  // Pass 3 — same name, same day, no id to link them. The last resort, for
  // copies that were never told about each other.
  const byTitleDay = new Map();
  p2.forEach((t) => {
    const k = `${String(t.title || '').trim()}|${new Date(t.date || 0).toDateString()}`;
    const prev = byTitleDay.get(k);
    if (!prev || trainingRowScore(t) > trainingRowScore(prev)) byTitleDay.set(k, t);
  });
  const winners = new Set([...byTitleDay.values()].map(idOf));
  return p2.filter((t) => winners.has(idOf(t)));
}

export default dedupeTrainingRows;
