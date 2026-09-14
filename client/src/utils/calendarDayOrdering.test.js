/**
 * Merging two records that are really one session is safe; merging two
 * genuinely different sessions makes one disappear with nothing on screen to
 * show it went. So most of these tests are about what must NOT merge.
 */
import {
  looksLikeSameSession,
  dedupeCalendarActivities,
  planSportMatchesActivity,
  planActivityFit,
  pairPlannedWithActivities,
  plannedForActivity,
  buildChronologicalDayItems,
} from './calendarDayOrdering';
import fs from 'fs';
import path from 'path';

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

  it('matches a stop-heavy ride whose providers disagree on the clock', () => {
    // A real pair: one ride through Prague, arriving from both accounts.
    // Strava counts the traffic lights (elapsed 8948s), Garmin does not
    // (8062s) — 886s apart, and the two were listed as separate rides all
    // week. Strava's own moving time, 8147s, is 85s from Garmin's.
    const strava = {
      id: 'strava-19727285709', source: 'strava', sport: 'Ride',
      date: '2026-08-13T15:42:14.000Z',
      distance: 77171.2, elapsedTime: 8948, movingTime: 8147,
      avgHeartRate: 123.8, avgPower: 231.4,
    };
    const garmin = {
      id: 'garmin-23964136116', source: 'garmin', sport: 'cycling',
      date: '2026-08-13T13:42:14.000Z',
      distance: 77174.87, elapsedTime: 8062, movingTime: 8062,
      avgHeartRate: 124,
    };
    expect(looksLikeSameSession(strava, garmin)).toBe(true);
  });

  it('refuses two records from the same provider whatever the numbers say', () => {
    // Strava never returns one ride twice, so a second Strava row is a second
    // ride. Merging it would delete a session with nothing on screen to show.
    const twin = ride({ id: 'strava-2', stravaId: 2 });
    expect(looksLikeSameSession(ride(), twin)).toBe(false);
  });

  it('refuses a different distance when the clocks cannot vouch for the pair', () => {
    // 77.17 km against 79 km. Nothing here says these two records belong
    // together except that they fall on one day, so the distance has to carry
    // the decision alone and 2.4% is not close enough.
    const other = ride({ id: 'fit-b', stravaId: undefined, distance: 79000, date: '2026-08-13T13:20:00' });
    expect(looksLikeSameSession(ride(), other)).toBe(false);
  });

  it('accepts that drift when both records start at the same minute', () => {
    // Same minute, same sport, same duration, same heart rate, same power —
    // one athlete cannot begin two sessions at once, so the start time is the
    // evidence and a device that lost GPS for two kilometres is not a reason
    // to list the ride twice. This is the rule the server has always used.
    const other = ride({ id: 'fit-b', stravaId: undefined, distance: 79000 });
    expect(looksLikeSameSession(ride(), other)).toBe(true);
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

describe('planSportMatchesActivity', () => {
  // The planner stores every gym-ish plan as 'strength'; Strava, Garmin and
  // Apple Health all name the same session something else. Each of these was a
  // session showing up twice on the dashboard week — once as the plan, once as
  // the activity.
  it.each([
    ['strength', 'Workout'],            // Strava's name for a gym session
    ['strength', 'WeightTraining'],
    ['strength', 'Strength Training'],
    ['strength', 'Crossfit'],
    ['strength', 'Yoga'],
  ])('pairs a %s plan with a %s activity', (plan, activity) => {
    expect(planSportMatchesActivity(plan, activity)).toBe(true);
  });

  it('keeps sports that are genuinely different apart', () => {
    expect(planSportMatchesActivity('strength', 'Ride')).toBe(false);
    expect(planSportMatchesActivity('swim', 'Run')).toBe(false);
    // Two unrecognised sports are not the same session just because neither maps.
    expect(planSportMatchesActivity('kitesurf', 'Paddling')).toBe(false);
  });
});

describe('pairPlannedWithActivities', () => {
  // Monday 17 August 2026, straight from the athlete's own week.
  const planned = [
    { _id: 'p-core', title: 'Core + zadek', sport: 'strength', duration: 2700 },
    { _id: 'p-bike', title: 'Heat training', sport: 'bike', duration: 2700 },
  ];
  const acts = [
    { id: 'strava-19776176858', stravaId: 19776176858, sport: 'Workout', date: '2026-08-17T11:48:32', duration: 2707, distance: 0 },
    { id: 'strava-19778686078', stravaId: 19778686078, sport: 'VirtualRide', date: '2026-08-17T14:05:37', duration: 2894, distance: 31730 },
  ];

  it('claims the gym session for the strength plan', () => {
    const { pwToAct } = pairPlannedWithActivities(planned, acts);
    expect(pwToAct.get('p-core')?.id).toBe('strava-19776176858');
    expect(pwToAct.get('p-bike')?.id).toBe('strava-19778686078');
  });

  it('leaves the day with one card per session, not two', () => {
    const { items } = buildChronologicalDayItems(planned, acts, pairPlannedWithActivities);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === 'pair')).toBe(true);
  });

  it('honours an explicit link to a prefixed id', () => {
    // completedTrainingId is stored as 'strava-<id>' once a plan is ticked off.
    const linked = [{ _id: 'p-swim', sport: 'swim', completedTrainingId: 'strava-19789798017' }];
    const swim = [{ id: 'strava-19789798017', stravaId: 19789798017, sport: 'Swim', date: '2026-08-18T09:00:00' }];
    const { pwToAct } = pairPlannedWithActivities(linked, swim);
    expect(pwToAct.get('p-swim')?.id).toBe('strava-19789798017');
  });

  it('does not hand one activity to two plans', () => {
    const twoCore = [
      { _id: 'p-a', sport: 'strength' },
      { _id: 'p-b', sport: 'strength' },
    ];
    const { pwToAct } = pairPlannedWithActivities(twoCore, [acts[0]]);
    expect(pwToAct.size).toBe(1);
  });

  it('an unpaired plan takes no session, not even one of its sport', () => {
    const { pwToAct } = pairPlannedWithActivities([{ ...planned[1], unpaired: true }], acts);
    expect(pwToAct.size).toBe(0);
  });

  it('an explicit link beats the greedy rule, whichever plan comes first', () => {
    // Two bike plans, two rides; the athlete pointed the second plan at the
    // first ride. The first plan then takes the ride that is left.
    const rides = [
      { id: 'strava-1', stravaId: 1, sport: 'Ride', date: '2026-08-17T08:00:00' },
      { id: 'strava-2', stravaId: 2, sport: 'Ride', date: '2026-08-17T17:00:00' },
    ];
    const plans = [
      { _id: 'p-morning', sport: 'bike' },
      { _id: 'p-evening', sport: 'bike', completedTrainingId: 'strava-1' },
    ];
    const { pwToAct } = pairPlannedWithActivities(plans, rides);
    expect(pwToAct.get('p-evening')?.id).toBe('strava-1');
    expect(pwToAct.get('p-morning')?.id).toBe('strava-2');
  });

  it('finds the plan a session stands for, by the same rule', () => {
    expect(plannedForActivity(planned, acts, acts[1])?._id).toBe('p-bike');
    expect(plannedForActivity([{ ...planned[1], unpaired: true }], acts, acts[1])).toBeNull();
  });
});

describe('which plan gets the session', () => {
  // Saturday 12 September 2026, an athlete's actual day. The coach had left a
  // generic "Běžecký trenink" from earlier in the week and then written the
  // real session — 75 minutes, OV tempo — plus a morning in the gym. The
  // watch logged yoga, weights and a 77-minute run. First-come pairing gave
  // the run to the placeholder and the gym plan nothing, because the watch's
  // strength session was stored as "other".
  const plans = [
    { _id: 'p-generic', title: 'Běžecký trenink', sport: 'run', dayOrder: 0 },
    { _id: 'p-tempo', title: 'OV tempo na 12 min', sport: 'run', plannedDuration: 4500, dayOrder: 1 },
    { _id: 'p-gym', title: 'Ranní posilovna na vrch těla', sport: 'strength', plannedDuration: 3600, dayOrder: 2 },
  ];
  const yoga = { id: 'garmin-1', sport: 'yoga', startDate: '2026-09-12T06:58:39Z', movingTime: 2685, distance: 0 };
  const weights = { id: 'garmin-2', sport: 'strength', startDate: '2026-09-12T07:48:18Z', movingTime: 5401, distance: 0 };
  const run = { id: 'garmin-3', sport: 'running', startDate: '2026-09-12T14:17:29Z', movingTime: 4638, distance: 11231 };
  const acts = [yoga, weights, run];

  it('the run lands on the plan of its length, the weights on the strength plan', () => {
    const { pwToAct } = pairPlannedWithActivities(plans, acts);
    expect(pwToAct.get('p-tempo')?.id).toBe('garmin-3');
    expect(pwToAct.get('p-gym')?.id).toBe('garmin-2');
    expect(pwToAct.has('p-generic')).toBe(false);
  });

  it('leaves the placeholder as a plan and the yoga as its own session', () => {
    const { items } = buildChronologicalDayItems(plans, acts, pairPlannedWithActivities);
    expect(items.map((i) => i.kind).sort()).toEqual(['activity', 'pair', 'pair', 'planned']);
    expect(items.find((i) => i.kind === 'activity').act.id).toBe('garmin-1');
  });

  it('a yoga plan — the planner has no yoga sport, so it is "strength" titled Jóga — takes the yoga', () => {
    const yogaPlan = [{ _id: 'p-yoga', title: 'Jóga', sport: 'strength' }];
    expect(pairPlannedWithActivities(yogaPlan, [weights, yoga]).pwToAct.get('p-yoga')?.id).toBe('garmin-1');
    // And with only weights logged it still pairs, as it always did.
    expect(pairPlannedWithActivities(yogaPlan, [weights]).pwToAct.get('p-yoga')?.id).toBe('garmin-2');
  });

  it('the fit only chooses, it never vetoes', () => {
    // A lone two-hour ride is still the day's one-hour ride plan.
    const plan = [{ _id: 'p-ride', sport: 'bike', plannedDuration: 3600 }];
    const long = [{ id: 'strava-9', sport: 'Ride', movingTime: 7200, distance: 60000 }];
    expect(pairPlannedWithActivities(plan, long).pwToAct.get('p-ride')?.id).toBe('strava-9');
    expect(planActivityFit(plan[0], long[0])).toMatchObject({ tier: 2, fit: 0 });
  });

  it('a plan with no length is a better bet than one the session clearly is not', () => {
    const two = [
      { _id: 'p-short', sport: 'run', plannedDuration: 1800, dayOrder: 0 },
      { _id: 'p-open', sport: 'run', dayOrder: 1 },
    ];
    expect(pairPlannedWithActivities(two, [run]).pwToAct.get('p-open')?.id).toBe('garmin-3');
  });

  it('distance counts as a fit too', () => {
    const plan = [
      { _id: 'p-5k', sport: 'run', plannedDistance: 5000, dayOrder: 0 },
      { _id: 'p-10k', sport: 'run', plannedDistance: 10000, dayOrder: 1 },
    ];
    expect(pairPlannedWithActivities(plan, [run]).pwToAct.get('p-10k')?.id).toBe('garmin-3');
  });

  it('a brick plan allows a ride, but the ride plan is the ride', () => {
    const plan = [
      { _id: 'p-brick', sport: 'brick', dayOrder: 0 },
      { _id: 'p-ride', sport: 'bike', dayOrder: 1 },
    ];
    const rideOnly = [{ id: 'strava-1', sport: 'Ride', movingTime: 3600 }];
    expect(pairPlannedWithActivities(plan, rideOnly).pwToAct.get('p-ride')?.id).toBe('strava-1');
  });
});

describe('one pairing implementation', () => {
  // The dashboard week used to carry its own copy of the matcher. It drifted:
  // the calendar merged plan and activity into one card while the week showed
  // both. Anything that pairs on a calendar day goes through this module.
  const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  it('the dashboard week does not define its own matcher', () => {
    const src = read('components/DashboardPage/WeeklyCalendar.jsx');
    expect(src).not.toMatch(/function\s+planSportMatchesActivity/);
    expect(src).not.toMatch(/function\s+pairPlannedWith/);
    expect(src).toMatch(/pairPlannedWithActivities/);
  });

  it('nor does the daily brief', () => {
    const src = read('utils/dailyCoachCard.js');
    expect(src).not.toMatch(/function\s+planMatchesSession/);
    expect(src).not.toMatch(/function\s+sportBucket/);
    expect(src).toMatch(/pairPlannedWithActivities/);
  });

  it('and the module itself stays free of the icon set, so the brief can import it', () => {
    const src = read('utils/calendarDayOrdering.js');
    expect(src).not.toMatch(/SportIcon/);
  });
});
