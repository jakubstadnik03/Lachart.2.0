/** Normalize category string to lowercase id (matches CategoryContext ids). */
export function normalizeCategoryKey(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === 'zone 2' || s === 'z2') return 'zone2';
  if (s === 'vo2max' || s === 'vo₂max' || s === 'vo2 max') return 'vo2max';
  return s;
}

/**
 * Build lookup map: linked activity id → category (from Strava/FIT/Garmin rows).
 */
export function buildActivityCategoryCatalog(allTrainings) {
  const catalog = new Map();
  if (!Array.isArray(allTrainings)) return catalog;

  for (const t of allTrainings) {
    const cat = normalizeCategoryKey(t?.category);
    if (!cat) continue;

    const keys = new Set();
    if (t.stravaId) keys.add(String(t.stravaId).replace(/^strava-/i, ''));
    if (t.sourceStravaActivityId) keys.add(String(t.sourceStravaActivityId).replace(/^strava-/i, ''));
    if (t.sourceFitTrainingId) keys.add(String(t.sourceFitTrainingId).replace(/^fit-/i, ''));
    if (t.garminId) keys.add(String(t.garminId));

    const idStr = String(t.id || '');
    if (idStr.startsWith('strava-')) keys.add(idStr.slice(7));
    if (idStr.startsWith('fit-')) keys.add(idStr.slice(4));

    if (t._id) keys.add(String(t._id));

    for (const k of keys) {
      if (k && !catalog.has(k)) catalog.set(k, cat);
    }
  }
  return catalog;
}

/**
 * Category for a training row: own field, else linked Strava/FIT activity from calendar.
 */
export function resolveTrainingCategory(training, catalog) {
  if (!training) return null;

  const direct = normalizeCategoryKey(training.category);
  if (direct) return direct;
  if (!catalog?.size) return null;

  const lookupKeys = [];
  if (training.sourceStravaActivityId) {
    lookupKeys.push(String(training.sourceStravaActivityId).replace(/^strava-/i, ''));
  }
  if (training.stravaId) {
    lookupKeys.push(String(training.stravaId).replace(/^strava-/i, ''));
  }
  if (training.sourceFitTrainingId) {
    lookupKeys.push(String(training.sourceFitTrainingId).replace(/^fit-/i, ''));
  }
  const idStr = String(training.id || '');
  if (idStr.startsWith('strava-')) lookupKeys.push(idStr.slice(7));
  if (idStr.startsWith('fit-')) lookupKeys.push(idStr.slice(4));
  if (training._id) lookupKeys.push(String(training._id));

  for (const k of lookupKeys) {
    const cat = catalog.get(k);
    if (cat) return cat;
  }
  return null;
}

/** Attach resolved category from calendar/integrations onto chart trainings. */
export function enrichTrainingsWithCategory(trainings, catalogSource) {
  if (!Array.isArray(trainings) || !trainings.length) return trainings || [];
  const catalog = buildActivityCategoryCatalog(catalogSource || trainings);

  return trainings.map((t) => {
    const category = resolveTrainingCategory(t, catalog);
    if (!category || category === t.category) return t;
    return { ...t, category };
  });
}
