/**
 * The dashboard's calendar feed, built from the trainings it already fetched.
 *
 * loadTrainings() has just pulled manual trainings, FIT uploads and the
 * integrations feed, so the dashboard re-uses that list instead of asking for
 * the same activities a second time. What it must NOT do is describe them a
 * second time: this lived inside DashboardPage as its own copy of the external
 * mapping, and the copy kept filling totalTime from the moving clock long
 * after the shared mapper stopped. Same week, same activities, 24h07m on the
 * dashboard against 24h27m in the calendar.
 *
 * It lives here, out of the page, so it can be held to that in a test.
 */
import { mapExternalActivityToCalendar, inferExternalSource } from './mapExternalActivityToCalendar';

export function buildCalendarActivitiesFromTrainings(allTrainings, regTrainings) {
  if (!Array.isArray(allTrainings) || allTrainings.length === 0) return [];

  const trainingByStravaId = new Map();
  (regTrainings || []).forEach((t) => {
    const sid = t?.sourceStravaActivityId;
    if (sid) trainingByStravaId.set(String(sid), t);
  });

  const linkedStravaIds = new Set(
    (regTrainings || [])
      .map((t) => t?.sourceStravaActivityId)
      .filter(Boolean)
      .map(String),
  );

  return allTrainings
    .filter((t) => t && !t.sourceStravaActivityId)
    .map((t) => {
      const idStr = String(t.id || '');
      const stravaId = t.stravaId || (idStr.startsWith('strava-') ? idStr.replace(/^strava-/, '') : null);
      const garminId = t.garminId || (idStr.startsWith('garmin-') ? idStr.replace(/^garmin-/, '') : null);
      const source = inferExternalSource(t);
      const isExternal = Boolean(
        source === 'garmin' || source === 'apple_health' || source === 'strava'
        || stravaId || garminId || t.startDate,
      );
      const isFit = Boolean(
        t.type === 'fit' || t.source === 'fit' || idStr.startsWith('fit-')
        || (t.timestamp && (t.originalFileName || t.titleAuto)),
      );
      const isStrava = source === 'strava' || Boolean(t.type === 'strava' || stravaId);
      const isGarmin = source === 'garmin' || Boolean(t.type === 'garmin' || garminId);

      if (isFit && !isExternal) {
        return {
          ...t,
          type: 'fit',
          date: t.timestamp || t.date,
          title: t.titleManual || t.titleAuto || t.originalFileName || t.title || 'Untitled Training',
          sport: t.sport,
          avgPower: t.avgPower,
          maxPower: t.maxPower,
          avgHeartRate: t.avgHeartRate,
          maxHeartRate: t.maxHeartRate,
          totalTime: t.totalElapsedTime || t.totalTimerTime,
          distance: t.totalDistance,
          tss: t.trainingStressScore ?? t.tss ?? t.totalTSS,
          tssDisplayMode: t.tssDisplayMode ?? null,
        };
      }

      // Both integration branches go through the one shared mapper.
      if (isGarmin && garminId) {
        return mapExternalActivityToCalendar({ ...t, garminId, source: 'garmin' }, trainingByStravaId);
      }

      if (isStrava && stravaId) {
        return mapExternalActivityToCalendar(
          { ...t, stravaId, source: 'strava', startDate: t.startDate || t.date || t.timestamp },
          trainingByStravaId,
        );
      }

      if (linkedStravaIds.has(String(t._id))) return null;

      return {
        ...t,
        id: idStr || `regular-${t._id}`,
        type: 'regular',
        date: t.date || t.timestamp,
        title: t.title || t.titleManual || 'Untitled Training',
        sport: t.sport,
        category: t.category || null,
        distance: t.totalDistance || t.distance,
        totalTime: t.totalElapsedTime || t.totalTimerTime || t.duration,
        tss: t.tss || t.totalTSS,
        tssDisplayMode: t.tssDisplayMode ?? null,
        avgPower: t.avgPower || t.averagePower || null,
        avgSpeed: t.avgSpeed || t.averageSpeed || null,
      };
    })
    .filter(Boolean);
}

export default buildCalendarActivitiesFromTrainings;
