/** Infer integration source from activity payload (listExternalActivities shape). */
export function inferExternalSource(a) {
  if (a?.source) return a.source;
  if (a?.garminId != null) return 'garmin';
  if (a?.healthKitId != null) return 'apple_health';
  if (a?.stravaId != null) return 'strava';
  return 'strava';
}

function hrFrom(o) {
  return o?.avgHeartRate
    ?? o?.averageHeartRate
    ?? o?.average_heartrate
    ?? o?.averageHR
    ?? null;
}

/**
 * Garmin docs store sport as 'cycling' / 'running' / 'swimming', but most of
 * the app's sport checks are tuned to Strava vocabulary ('Ride' / 'Run' /
 * 'Swim') — e.g. the old `includes('cycle')` check did NOT match 'cycling', so Garmin
 * activities rendered with the generic bolt icon. Normalize at this single
 * mapping point instead of patching every icon/color helper.
 */
const GARMIN_SPORT_TO_CALENDAR = {
  cycling: 'Ride',
  running: 'Run',
  swimming: 'Swim',
};
function normalizeGarminSport(sportRaw) {
  const key = String(sportRaw || '').toLowerCase();
  return GARMIN_SPORT_TO_CALENDAR[key] || sportRaw || null;
}

/** Map one external activity (Strava / Garmin / Apple Health) to calendar row shape. */
export function mapExternalActivityToCalendar(a, trainingByStravaId = new Map()) {
  const source = inferExternalSource(a);
  const stravaId = a.stravaId ?? null;
  const garminId = a.garminId ?? null;
  const linkedTraining = stravaId ? trainingByStravaId.get(String(stravaId)) : null;

  const extId = source === 'garmin'
    ? `garmin-${garminId || a.sourceId}`
    : source === 'apple_health'
      ? `apple-${a.healthKitId || a.sourceId}`
      : `strava-${stravaId || a.id}`;

  const calendarType = source === 'garmin'
    ? 'garmin'
    : source === 'apple_health'
      ? 'apple_health'
      : 'strava';

  return {
    ...a,
    _id: a._id,
    stravaId,
    garminId,
    source,
    id: extId,
    type: calendarType,
    date: a.startDate || a.date,
    title: linkedTraining?.title || a.titleManual || a.name || a.title || 'Untitled Activity',
    linkedTrainingTitle: linkedTraining?.title || null,
    sport: source === 'garmin'
      ? normalizeGarminSport(a.sport || a.sport_type || a.sportType)
      : (a.sport || a.sport_type || a.sportType || null),
    category: a.category || linkedTraining?.category || null,
    avgPower: a.averagePower || a.average_watts || a.avgPower,
    weightedAveragePower: a.weightedAveragePower ?? a.weighted_average_watts ?? null,
    avgSpeed: a.averageSpeed || a.average_speed || a.avgSpeed,
    maxPower: a.maxPower || a.max_watts,
    avgHeartRate: hrFrom(a),
    maxHeartRate: a.maxHeartRate || a.max_heartrate,
    totalTime: a.movingTime || a.elapsedTime || a.totalTime,
    movingTime: a.movingTime || a.elapsedTime,
    metricsManualized: a.metricsManualized ?? false,
    distance: a.distance,
    tss:
      a.manualTss
      ?? (linkedTraining?.tss
        || linkedTraining?.totalTSS
        || a.tss
        || a.totalTSS
        || a.total_tss
        || null),
    tssDisplayMode: a.tssDisplayMode ?? linkedTraining?.tssDisplayMode ?? null,
    kilojoules: a.kilojoules ?? a.raw?.kilojoules,
  };
}

export function buildTrainingByStravaIdMap(regTrainings) {
  const trainingByStravaId = new Map();
  (regTrainings || []).forEach((t) => {
    const sid = t?.sourceStravaActivityId;
    if (sid) trainingByStravaId.set(String(sid), t);
  });
  return trainingByStravaId;
}

export function mapExternalActivitiesToCalendar(activities, regTrainings) {
  const trainingByStravaId = buildTrainingByStravaIdMap(regTrainings);
  return (activities || []).map((a) => mapExternalActivityToCalendar(a, trainingByStravaId));
}
