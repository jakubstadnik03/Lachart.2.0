/**
 * Regression: the profile's weekly calendar showed one activity where the
 * dashboard showed four, for the same athlete and the same week.
 *
 * The profile mapped every row from /integrations/activities as if it were a
 * Strava row (`id: \`strava-${a.stravaId || a.id}\``). Garmin, Apple Health,
 * Polar and Coros rows carry no stravaId and the lean endpoint sends no `id`,
 * so each of them came out as `strava-undefined` — one dedupe key shared by
 * all of them, and dedupeCalendarActivities collapsed the lot into a single
 * activity. The shared mapper keys each source by its own id.
 */
import { mapExternalActivitiesToCalendar } from './mapExternalActivityToCalendar';
import { dedupeCalendarActivities } from './calendarDayOrdering';

// Mon 12 – Wed 14 October 2026, as the dashboard listed them.
const week = [
  { _id: 'a1', garminId: '19001', name: 'Bike - regeneration', sport: 'cycling',
    startDate: '2026-10-12T09:00:00Z', elapsedTime: 7500, distance: 83520 },
  { _id: 'a2', garminId: '19002', name: 'Bike - LT intervals', sport: 'cycling',
    startDate: '2026-10-13T09:00:00Z', elapsedTime: 9060, distance: 106410 },
  { _id: 'a3', garminId: '19003', name: 'Tacx - Bike', sport: 'cycling',
    startDate: '2026-10-14T07:00:00Z', elapsedTime: 6900, distance: 79350 },
  { _id: 'a4', stravaId: '77004', name: 'Tacx - Bike', sport: 'Ride',
    startDate: '2026-10-14T16:00:00Z', elapsedTime: 2040, distance: 23000 },
];

describe('profile weekly calendar activities', () => {
  it('keeps every activity of the week, whatever synced it', () => {
    const mapped = mapExternalActivitiesToCalendar(week, []);
    expect(mapped.map((a) => a.id)).toEqual([
      'garmin-19001', 'garmin-19002', 'garmin-19003', 'strava-77004',
    ]);
    expect(dedupeCalendarActivities(mapped)).toHaveLength(4);
  });

  it('collapsed to one when every row was mapped as Strava (the old bug)', () => {
    const stravaOnly = week.map((a) => ({
      ...a, type: 'strava', date: a.startDate, stravaId: a.stravaId || a.id,
      id: `strava-${a.stravaId || a.id}`,
    }));
    // Three different rides, one id between them.
    expect(new Set(stravaOnly.map((a) => a.id)).size).toBe(2);
    expect(dedupeCalendarActivities(stravaOnly).length).toBeLessThan(4);
  });
});
