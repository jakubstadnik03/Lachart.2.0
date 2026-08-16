/**
 * Merging two records that are really one session is safe; merging two
 * genuinely different sessions makes one disappear with nothing on screen to
 * show it went. So most of these tests are about what must NOT merge.
 */
// calendarDayOrdering imports resolveSportKey from SportIcon, which pulls in
// lucide-react — ESM that jest will not transform inside node_modules. Only the
// sport-key mapping is needed here.
jest.mock('../components/shared/SportIcon', () => ({
  resolveSportKey: (s) => {
    const v = String(s || '').toLowerCase();
    if (/ride|bike|cycl/.test(v)) return 'bike';
    if (/run|walk|hike/.test(v)) return 'run';
    if (/swim/.test(v)) return 'swim';
    if (/gym|workout|strength|weight/.test(v)) return 'gym';
    return 'other';
  },
}));

// eslint-disable-next-line import/first
import { looksLikeSameSession, dedupeCalendarActivities } from './calendarDayOrdering';

const ride = (over = {}) => ({
  id: 'strava-1',
  stravaId: 1,
  sport: 'Ride',
  date: '2026-08-13T09:00:00',
  distance: 77170,
  duration: 8040,          // 2h14m
  avgHeartRate: 141,
  avgPower: 231,
  ...over,
});

describe('looksLikeSameSession', () => {
  it('matches the real pair this was built for', () => {
    // 2h14m from a FIT file against 2h15m from Strava, same ride.
    const fit = ride({ id: 'fit-a', stravaId: undefined, duration: 8100 });
    expect(looksLikeSameSession(ride(), fit)).toBe(true);
  });

  it('refuses two laps of the same loop on one day', () => {
    // Same distance, but nobody rides an identical loop twice within 3 minutes.
    const second = ride({ id: 'fit-b', stravaId: undefined, duration: 9600 });
    expect(looksLikeSameSession(ride(), second)).toBe(false);
  });

  it('refuses a different distance', () => {
    const other = ride({ id: 'fit-b', stravaId: undefined, distance: 79000 });
    expect(looksLikeSameSession(ride(), other)).toBe(false);
  });

  it('refuses a different day', () => {
    const other = ride({ id: 'fit-b', stravaId: undefined, date: '2026-08-14T09:00:00' });
    expect(looksLikeSameSession(ride(), other)).toBe(false);
  });

  it('refuses a different sport', () => {
    const other = ride({ id: 'fit-b', stravaId: undefined, sport: 'Run' });
    expect(looksLikeSameSession(ride(), other)).toBe(false);
  });

  it('lets heart rate veto a match the distance and time would allow', () => {
    // Two riders' files, or two different efforts that happen to line up.
    const other = ride({ id: 'fit-b', stravaId: undefined, avgHeartRate: 160 });
    expect(looksLikeSameSession(ride(), other)).toBe(false);
  });

  it('lets power veto one too', () => {
    const other = ride({ id: 'fit-b', stravaId: undefined, avgPower: 290 });
    expect(looksLikeSameSession(ride(), other)).toBe(false);
  });

<<<<<<< HEAD
  it('tolerates the drift between two devices recording one ride', () => {
    // Averages from two head units over the same session are close but not
    // equal — they smooth differently and start and stop seconds apart. Tight
    // tolerances here vetoed real pairs, which is how duplicates survived.
    const other = ride({
      id: 'fit-b', stravaId: undefined, duration: 8100,
      avgHeartRate: 149, avgPower: 246,
    });
    expect(looksLikeSameSession(ride(), other)).toBe(true);
  });

=======
>>>>>>> origin/main
  it('abstains when only one side carries heart rate', () => {
    // A missing value is not evidence of a mismatch.
    const other = ride({ id: 'fit-b', stravaId: undefined, avgHeartRate: 0, duration: 8100 });
    expect(looksLikeSameSession(ride(), other)).toBe(true);
  });

  it('never merges sessions without distance', () => {
    // Two 45-minute gym sessions in a day are as likely to be two real ones.
    const gymA = { id: 'a', sport: 'Workout', date: '2026-08-13T07:00:00', duration: 2700, distance: 0 };
    const gymB = { id: 'b', sport: 'Workout', date: '2026-08-13T18:00:00', duration: 2700, distance: 0 };
    expect(looksLikeSameSession(gymA, gymB)).toBe(false);
  });
});

describe('dedupeCalendarActivities', () => {
  it('collapses the Garmin/Strava pair and keeps the richer record', () => {
    const fit = ride({ id: 'fit-a', stravaId: undefined, duration: 8100 });
    const out = dedupeCalendarActivities([fit, ride()]);
    expect(out).toHaveLength(1);
    // The Strava record scores higher, so it survives.
    expect(out[0].id).toBe('strava-1');
  });

  it('leaves two genuinely different rides alone', () => {
    const other = ride({ id: 'fit-b', stravaId: undefined, distance: 42000, duration: 5000 });
    expect(dedupeCalendarActivities([ride(), other])).toHaveLength(2);
  });

  it('still collapses on a shared id, whatever the numbers say', () => {
    // The lactate Training links back by sourceStravaActivityId; that link
    // outranks any comparison of the values.
    const training = { id: 'regular-x', sourceStravaActivityId: 1, sport: 'Ride', date: '2026-08-13T09:00:00' };
    expect(dedupeCalendarActivities([ride(), training])).toHaveLength(1);
  });
});
