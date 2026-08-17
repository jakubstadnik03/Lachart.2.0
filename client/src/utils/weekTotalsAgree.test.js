/**
 * The calendar's week summary and the dashboard's weekly calendar read the
 * same seven days and printed different numbers: 24:27 against 24:08, 15:20 of
 * riding against 15:03. Neither was wrong about the activities — they agreed
 * on all fourteen — they disagreed about which clock a session is measured by,
 * because each page built its own rows from the same API response.
 *
 * The activities below are one real week from an account connected to both
 * Strava and Garmin, exactly as /activities returns them. What this file pins
 * down is that one mapping and one duration answer serve both views.
 */
jest.mock('../components/shared/SportIcon', () => ({
  resolveSportKey: (s) => {
    const v = String(s || '').toLowerCase();
    if (/ride|bike|cycl/.test(v)) return 'bike';
    if (/run|walk|hike/.test(v)) return 'run';
    if (/swim/.test(v)) return 'swim';
    if (/gym|workout|strength|weight|yoga/.test(v)) return 'gym';
    return 'other';
  },
}));

// eslint-disable-next-line import/first
import { mapExternalActivitiesToCalendar } from './mapExternalActivityToCalendar';
// eslint-disable-next-line import/first
import { buildCalendarActivitiesFromTrainings } from './calendarActivitiesFromTrainings';
// eslint-disable-next-line import/first
import { dedupeCalendarActivities } from './calendarDayOrdering';
// eslint-disable-next-line import/first
import { completedSecs } from './completedSessionStats';

/** /activities rows for 10–16 August, four of them synced from both providers. */
const WEEK = [
  { stravaId: 19677813252, source: 'strava', sport: 'Yoga', name: 'Morning Yoga', startDate: '2026-08-10T09:33:50.000Z', elapsedTime: 2662, movingTime: 2662, distance: 0, averageHeartRate: 66.2 },
  { stravaId: 19679064930, source: 'strava', sport: 'Ride', name: 'Zase se citit', startDate: '2026-08-10T11:02:08.000Z', elapsedTime: 4790, movingTime: 4790, distance: 34960, averageHeartRate: 121.1, averagePower: 231.1 },
  { stravaId: 19682471231, source: 'strava', sport: 'Swim', name: 'Afternoon Swim', startDate: '2026-08-10T14:53:59.000Z', elapsedTime: 3802, movingTime: 3802, distance: 4000, averageHeartRate: 133 },
  { stravaId: 19691026641, source: 'strava', sport: 'Run', name: 'Morning Run', startDate: '2026-08-11T07:30:27.000Z', elapsedTime: 3068, movingTime: 3068, distance: 10010, averageHeartRate: 132.2 },
  { stravaId: 19695174273, source: 'strava', sport: 'Ride', name: 'Jested', startDate: '2026-08-11T10:32:46.000Z', elapsedTime: 9554, movingTime: 9389, distance: 71777.5, averageHeartRate: 135.2, averagePower: 267.8 },
  { stravaId: 19698461081, source: 'strava', sport: 'Swim', name: 'Afternoon Swim', startDate: '2026-08-11T16:27:02.000Z', elapsedTime: 5578, movingTime: 5578, distance: 6000, averageHeartRate: 129.3 },
  { stravaId: 19722395373, source: 'strava', sport: 'Swim', name: '30x100', startDate: '2026-08-12T10:00:00.000Z', elapsedTime: 5520, movingTime: 5520, distance: 6000 },
  { stravaId: 19711205010, source: 'strava', sport: 'Run', name: 'Afternoon Run', startDate: '2026-08-12T14:34:38.000Z', elapsedTime: 3123, movingTime: 3047, distance: 10180.4, averageHeartRate: 128.6 },
  { stravaId: 19722400988, source: 'strava', sport: 'Swim', name: '4x800', startDate: '2026-08-13T08:04:00.000Z', elapsedTime: 5520, movingTime: 5520, distance: 6000 },
  { stravaId: 19727285709, source: 'strava', sport: 'Ride', name: 'Praha', startDate: '2026-08-13T15:42:14.000Z', elapsedTime: 8948, movingTime: 8147, distance: 77171.2, averageHeartRate: 123.8, averagePower: 231.4 },
  { stravaId: 19736361327, source: 'strava', sport: 'Ride', name: 'Kamiony', startDate: '2026-08-14T09:09:52.000Z', elapsedTime: 8989, movingTime: 8899, distance: 95811.8, averageHeartRate: 140.1, averagePower: 285.8 },
  { stravaId: 19747629106, source: 'strava', sport: 'Run', name: 'Morning Run', startDate: '2026-08-15T08:05:35.000Z', elapsedTime: 3520, movingTime: 3516, distance: 13159.1, averageHeartRate: 139.6 },
  { garminId: '23921079498', source: 'garmin', sport: 'cycling', name: 'Simonovice Cycling', startDate: '2026-08-10T09:02:08.000Z', elapsedTime: 4793, movingTime: 4793, distance: 34960.83, averageHeartRate: 121 },
  { garminId: '23935470199', source: 'garmin', sport: 'cycling', name: 'Simonovice Cycling', startDate: '2026-08-11T08:32:46.000Z', elapsedTime: 9386, movingTime: 9386, distance: 71782.74, averageHeartRate: 135 },
  { garminId: '23964136116', source: 'garmin', sport: 'cycling', name: 'Prague Cycling', startDate: '2026-08-13T13:42:14.000Z', elapsedTime: 8062, movingTime: 8062, distance: 77174.87, averageHeartRate: 124 },
  { garminId: '23972163595', source: 'garmin', sport: 'cycling', name: 'Prague Road Cycling', startDate: '2026-08-14T07:09:52.000Z', elapsedTime: 8913, movingTime: 8913, distance: 95811.96, averageHeartRate: 140 },
  { garminId: '23989232053', source: 'garmin', sport: 'cycling', name: 'Prague Road Cycling', startDate: '2026-08-15T15:15:15.000Z', elapsedTime: 5914, movingTime: 5914, distance: 55010, averageHeartRate: 124 },
  { garminId: '23997545752', source: 'garmin', sport: 'cycling', name: 'Prague Road Cycling', startDate: '2026-08-16T06:43:41.000Z', elapsedTime: 17022, movingTime: 17022, distance: 159466.55, averageHeartRate: 128 },
];

const week = () => dedupeCalendarActivities(mapExternalActivitiesToCalendar(WEEK, []));

describe('what a week of activities adds up to', () => {
  it('counts each session once, whichever providers sent it', () => {
    // Eighteen rows in, four of them a second copy of a ride already there.
    expect(week()).toHaveLength(14);
  });

  it('measures a session by the whole session, not the moving part', () => {
    // The Prague ride: 8948s from door to door, 8147s of it moving. Filling
    // totalTime from the moving clock is what cost the dashboard 19 minutes a
    // week, silently, because every total downstream asks that field first.
    const praha = week().find((a) => a.stravaId === 19727285709);
    expect(completedSecs(praha)).toBe(8948);
  });

  it('adds up to the hours the calendar prints', () => {
    const total = week().reduce((sum, a) => sum + completedSecs(a), 0);
    expect(total).toBe(88010); // 24h 26m 50s — "24:27" on screen
  });

  it('gives the dashboard the same week as the calendar', () => {
    // The dashboard re-uses the trainings it already fetched rather than
    // asking again, so the same activities reach it down a second path. That
    // path had its own copy of the mapping, and the copy still measured a ride
    // by its moving time: 24h07m here against 24h27m there, twice over, in two
    // different files. One number, whichever way the rows arrive.
    const viaTrainings = dedupeCalendarActivities(
      buildCalendarActivitiesFromTrainings(WEEK, []),
    );
    const secs = (rows) => rows.reduce((sum, a) => sum + completedSecs(a), 0);

    expect(viaTrainings).toHaveLength(week().length);
    expect(secs(viaTrainings)).toBe(secs(week()));
  });
});
