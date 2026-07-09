/**
 * Calendar activities for PMC (CTL/ATL/TSB) — same shape & sources as Dashboard calendar.
 * Keeps Workout Planner fitness metrics aligned with Dashboard / FormFitnessChart.
 */
import { mapExternalActivitiesToCalendar } from './mapExternalActivityToCalendar';

const MAX_CALENDAR_ACTIVITIES = 2000;

/** Fired when dashboard (or any page) refreshes the shared calendarData_* cache. */
export const CALENDAR_DATA_EVENT = 'lachart:calendarDataUpdated';

export function notifyCalendarDataUpdated(athleteId) {
  if (!athleteId || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CALENDAR_DATA_EVENT, { detail: { athleteId: String(athleteId) } }));
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (data?.activities) return data.activities;
  if (data?.data) return Array.isArray(data.data) ? data.data : [];
  return [];
}

/** Instant paint from dashboard calendar cache. */
export function readCalendarActivitiesCache(athleteId) {
  if (!athleteId) return [];
  try {
    const raw = localStorage.getItem(`calendarData_${athleteId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [];
  } catch {
    return [];
  }
}

/** Build combined calendar list — mirrors DashboardPage loadCalendarData mapping. */
export function buildCombinedCalendarActivities(regTrainings, fitData, externalData) {
  const combined = [
    ...(fitData || []).map((t) => ({
      ...t,
      type: 'fit',
      date: t.timestamp,
      title: t.titleManual || t.titleAuto || t.originalFileName || 'Untitled Training',
      sport: t.sport,
      avgPower: t.avgPower,
      maxPower: t.maxPower,
      avgHeartRate: t.avgHeartRate,
      maxHeartRate: t.maxHeartRate,
      totalTime: t.totalElapsedTime || t.totalTimerTime,
      distance: t.totalDistance,
      tss: t.trainingStressScore ?? t.tss ?? t.totalTSS,
      tssDisplayMode: t.tssDisplayMode ?? null,
    })),
    ...(regTrainings || [])
      .filter((t) => !t?.sourceStravaActivityId)
      .map((t) => ({
        ...t,
        id: `regular-${t._id}`,
        type: 'regular',
        date: t.date || t.timestamp,
        title: t.title || 'Untitled Training',
        sport: t.sport,
        category: t.category || null,
        distance: t.totalDistance || t.distance,
        totalTime: t.totalElapsedTime || t.totalTimerTime || t.duration,
        tss: t.tss || t.totalTSS,
        tssDisplayMode: t.tssDisplayMode ?? null,
        avgPower: t.avgPower || t.averagePower || null,
        avgSpeed: t.avgSpeed || t.averageSpeed || null,
      })),
    ...mapExternalActivitiesToCalendar(externalData, regTrainings),
  ];

  const tMs = (a) => new Date(a.date || a.startDate || a.timestamp || 0).getTime();
  return [...combined].sort((a, b) => tMs(b) - tMs(a)).slice(0, MAX_CALENDAR_ACTIVITIES);
}

/** Fetch & merge calendar activities (same endpoints as Dashboard). */
export async function fetchCalendarActivitiesForPmc(api, athleteId) {
  if (!athleteId || !api) return [];

  const [trainResp, fitResp, externalResp] = await Promise.all([
    api.get(`/user/athlete/${athleteId}/trainings`, { cacheTtlMs: 60000 }).catch(() => ({ data: [] })),
    api.get('/api/fit/trainings', { params: { athleteId }, cacheTtlMs: 60000 }).catch(() => ({ data: [] })),
    api.get('/api/integrations/activities', {
      params: { athleteId, summaryOnly: true, limit: MAX_CALENDAR_ACTIVITIES },
      cacheTtlMs: 60000,
    }).catch(() => ({ data: [] })),
  ]);

  return buildCombinedCalendarActivities(
    normalizeList(trainResp.data),
    normalizeList(fitResp.data),
    normalizeList(externalResp.data),
  );
}
