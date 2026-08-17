/**
 * One real week, exactly as it sits in the database, for an athlete whose
 * account is connected to both Strava and Garmin.
 *
 * Four of these rides reached the app twice — once from each provider — and
 * the calendar drew all four twice, so the week's hours and TSS counted them
 * twice too. The numbers below are copied unchanged from the stored documents,
 * including the two things that made the pairs so hard to see:
 *
 *  - Strava's startDate is a local wall clock in a UTC-shaped field, Garmin's
 *    is real UTC, so the two records of one ride are 2h apart.
 *  - Strava's elapsedTime counts the stops and Garmin's duration does not, so
 *    the Prague ride reads 8948s against 8062s.
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
import { dedupeCalendarActivities } from './calendarDayOrdering';
// eslint-disable-next-line import/first
import { dedupeMergedCalendarActivities } from './dedupeMergedCalendarActivities';

const STRAVA = [
  { stravaId: 19657614621, sport: 'Workout', name: 'Evening Workout', startDate: '2026-08-08T18:27:03.000Z', elapsedTime: 1820, movingTime: 1820, distance: 0, averageHeartRate: 61.3 },
  { stravaId: 19671259850, sport: 'Workout', name: 'Afternoon Workout', startDate: '2026-08-09T17:59:56.000Z', elapsedTime: 2119, movingTime: 2119, distance: 0, averageHeartRate: 68.8 },
  { stravaId: 19677813252, sport: 'Yoga', name: 'Morning Yoga', startDate: '2026-08-10T09:33:50.000Z', elapsedTime: 2662, movingTime: 2662, distance: 0, averageHeartRate: 66.2 },
  { stravaId: 19679064930, sport: 'Ride', name: 'Zase se cítit jako člověk 🧍', startDate: '2026-08-10T11:02:08.000Z', elapsedTime: 4790, movingTime: 4790, distance: 34960, averageHeartRate: 121.1, averagePower: 231.1 },
  { stravaId: 19682471231, sport: 'Swim', name: 'Afternoon Swim', startDate: '2026-08-10T14:53:59.000Z', elapsedTime: 3802, movingTime: 3802, distance: 4000, averageHeartRate: 133 },
  { stravaId: 19691026641, sport: 'Run', name: 'Morning Run', startDate: '2026-08-11T07:30:27.000Z', elapsedTime: 3068, movingTime: 3068, distance: 10010, averageHeartRate: 132.2 },
  { stravaId: 19695174273, sport: 'Ride', name: 'Ještěd ze všech stran', startDate: '2026-08-11T10:32:46.000Z', elapsedTime: 9554, movingTime: 9389, distance: 71777.5, averageHeartRate: 135.2, averagePower: 267.8 },
  { stravaId: 19698461081, sport: 'Swim', name: 'Afternoon Swim', startDate: '2026-08-11T16:27:02.000Z', elapsedTime: 5578, movingTime: 5578, distance: 6000, averageHeartRate: 129.3 },
  { stravaId: 19722395373, sport: 'Swim', name: '30x100 a zbytek', startDate: '2026-08-12T10:00:00.000Z', elapsedTime: 5520, movingTime: 5520, distance: 6000 },
  { stravaId: 19711205010, sport: 'Run', name: 'Afternoon Run', startDate: '2026-08-12T14:34:38.000Z', elapsedTime: 3123, movingTime: 3047, distance: 10180.4, averageHeartRate: 128.6 },
  { stravaId: 19722400988, sport: 'Swim', name: '4x800', startDate: '2026-08-13T08:04:00.000Z', elapsedTime: 5520, movingTime: 5520, distance: 6000 },
  { stravaId: 19727285709, sport: 'Ride', name: 'Praha 🤮', startDate: '2026-08-13T15:42:14.000Z', elapsedTime: 8948, movingTime: 8147, distance: 77171.2, averageHeartRate: 123.8, averagePower: 231.4 },
  { stravaId: 19736361327, sport: 'Ride', name: 'Párkrát jsem si z těch kamionů ucvrnkl 💦', startDate: '2026-08-14T09:09:52.000Z', elapsedTime: 8989, movingTime: 8899, distance: 95811.8, averageHeartRate: 140.1, averagePower: 285.8 },
  { stravaId: 19747629106, sport: 'Run', name: 'Morning Run', startDate: '2026-08-15T08:05:35.000Z', elapsedTime: 3520, movingTime: 3516, distance: 13159.1, averageHeartRate: 139.6 },
];

const GARMIN = [
  { garminId: '23921079498', sport: 'cycling', name: 'Simonovice Cycling', startDate: '2026-08-10T09:02:08.000Z', elapsedTime: 4793, movingTime: 4793, distance: 34960.83, averageHeartRate: 121 },
  { garminId: '23935470199', sport: 'cycling', name: 'Simonovice Cycling', startDate: '2026-08-11T08:32:46.000Z', elapsedTime: 9386, movingTime: 9386, distance: 71782.74, averageHeartRate: 135 },
  { garminId: '23964136116', sport: 'cycling', name: 'Prague Cycling', startDate: '2026-08-13T13:42:14.000Z', elapsedTime: 8062, movingTime: 8062, distance: 77174.87, averageHeartRate: 124 },
  { garminId: '23972163595', sport: 'cycling', name: 'Prague Road Cycling', startDate: '2026-08-14T07:09:52.000Z', elapsedTime: 8913, movingTime: 8913, distance: 95811.96, averageHeartRate: 140 },
  { garminId: '23989232053', sport: 'cycling', name: 'Prague Road Cycling', startDate: '2026-08-15T15:15:15.000Z', elapsedTime: 5914, movingTime: 5914, distance: 55010, averageHeartRate: 124 },
  { garminId: '23997545752', sport: 'cycling', name: 'Prague Road Cycling', startDate: '2026-08-16T06:43:41.000Z', elapsedTime: 17022, movingTime: 17022, distance: 159466.55, averageHeartRate: 128 },
];

/** The shape the calendar builds from an /activities row. */
const toCalendarRow = (a) => {
  const source = a.garminId != null ? 'garmin' : 'strava';
  return {
    _id: a.stravaId ?? a.garminId,
    id: source === 'garmin' ? `garmin-${a.garminId}` : `strava-${a.stravaId}`,
    stravaId: a.stravaId ?? null,
    garminId: a.garminId ?? null,
    source,
    type: source,
    date: a.startDate,
    title: a.name,
    sport: a.sport,
    distance: a.distance,
    totalElapsedTime: a.elapsedTime || a.movingTime,
    totalTime: a.elapsedTime || a.movingTime,
    movingTime: a.movingTime || a.elapsedTime,
    avgHeartRate: a.averageHeartRate ?? null,
    avgPower: a.averagePower ?? null,
  };
};

const WEEK = [...STRAVA, ...GARMIN].map(toCalendarRow);

// The four rides that arrived from both providers, by Strava id.
const PAIRED = [19679064930, 19695174273, 19727285709, 19736361327];
// The Garmin rides with no Strava twin — they must survive untouched.
const GARMIN_ONLY = ['23989232053', '23997545752'];

describe.each([
  ['dedupeCalendarActivities (calendar days and week totals)', dedupeCalendarActivities],
  ['dedupeMergedCalendarActivities (dashboard and training load)', dedupeMergedCalendarActivities],
])('%s', (_name, dedupe) => {
  const out = dedupe(WEEK);

  it('collapses each ride that arrived from both providers', () => {
    expect(out).toHaveLength(WEEK.length - PAIRED.length);
    for (const stravaId of PAIRED) {
      const rows = out.filter((r) => r.stravaId === stravaId || r.garminId != null);
      expect(rows.filter((r) => r.stravaId === stravaId)).toHaveLength(1);
    }
  });

  it('keeps every session that only one provider knows about', () => {
    for (const garminId of GARMIN_ONLY) {
      expect(out.filter((r) => r.garminId === garminId)).toHaveLength(1);
    }
    // Nothing Strava-only disappeared either: 14 Strava rows in, 14 sessions
    // still carrying a Strava id out.
    expect(out.filter((r) => r.stravaId != null)).toHaveLength(STRAVA.length);
  });

  it('leaves the two swims of equal length on separate days alone', () => {
    // 6000m in 5520s on the 12th and again on the 13th — identical numbers,
    // two real sessions. Only the day tells them apart.
    expect(out.filter((r) => r.stravaId === 19722395373 || r.stravaId === 19722400988))
      .toHaveLength(2);
  });
});
