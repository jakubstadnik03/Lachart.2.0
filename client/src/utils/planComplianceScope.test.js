// The real resolver buckets provider vocabularies (Strava "Ride" -> bike).
// A naive lowercase stub silently breaks every sport match downstream.
jest.mock('../components/shared/SportIcon', () => ({
  resolveSportKey: (s) => {
    const v = String(s || '').toLowerCase();
    if (/ride|bike|cycl/.test(v)) return 'bike';
    if (/run|walk|hike/.test(v)) return 'run';
    if (/swim/.test(v)) return 'swim';
    return 'other';
  },
}));

// eslint-disable-next-line import/first
import { findCompliance } from './planCompliance';
// eslint-disable-next-line import/first
import { pairPlannedWithActivities } from './calendarDayOrdering';

/**
 * A planned session is graded against the ride it was paired with — not
 * against everything that happened that day.
 *
 * findCompliance takes a list and matches the first activity of the same sport,
 * so handing it the whole day answers "did any bike ride happen" rather than
 * "did this one get done". A planned "Bike heat" nobody rode came out graded,
 * and therefore green, because an unrelated "Bike LT2" shared the date.
 */
const plan = (over = {}) => ({ sport: 'bike', plannedDuration: 3000, ...over });
const ride = (secs, over = {}) => ({ sport: 'Ride', moving_time: secs, ...over });

describe('the scope a plan is graded against', () => {
  test('graded against its own ride, it gets a verdict', () => {
    expect(findCompliance(plan(), [ride(3000)])).toBeTruthy();
  });

  test('an unpaired plan gets no verdict — the caller must pass nothing', () => {
    expect(findCompliance(plan(), [])).toBeNull();
    expect(findCompliance(plan(), null)).toBeNull();
  });

  test('handed the whole day, an unrelated ride of the same sport grades it', () => {
    // This is the trap: the plan was never done, but a different bike ride was.
    const verdict = findCompliance(plan(), [ride(7000, { title: 'Bike LT2' })]);
    expect(verdict).toBeTruthy();
  });

  test('a different sport does not grade it', () => {
    expect(findCompliance(plan({ sport: 'swim' }), [ride(3000)])).toBeNull();
  });

  test('the grade reflects how close the paired ride came', () => {
    const onTarget = findCompliance(plan(), [ride(3000)]);
    const cutShort = findCompliance(plan(), [ride(1500)]);
    expect(onTarget.label).toBe('On target');
    expect(cutShort.label).not.toBe('On target');
  });

  test('overshooting is not penalised — there is no upper bound', () => {
    // Recorded rather than asserted as desirable: three times the planned
    // duration still reads "On target", which is existing behaviour.
    expect(findCompliance(plan(), [ride(9000)]).label).toBe('On target');
  });
});

/**
 * Two bike sessions planned for one day, one of them actually ridden. The
 * pairing has to hand the ride to exactly one of them, or both read as done.
 */
describe('two plans, one ride', () => {
  const planned = [
    { _id: 'p1', sport: 'bike', plannedDuration: 3000, date: '2026-08-25' },
    { _id: 'p2', sport: 'bike', plannedDuration: 3000, date: '2026-08-25' },
  ];
  const acts = [{ id: 'a1', sport: 'Ride', moving_time: 3000 }];

  test('the ride is claimed by one plan only', () => {
    const { pwToAct } = pairPlannedWithActivities(planned, acts);
    expect(pwToAct.get('p1')).toBeTruthy();
    expect(pwToAct.get('p2')).toBeFalsy();
  });

  test('so only the ridden one can be graded', () => {
    const { pwToAct } = pairPlannedWithActivities(planned, acts);
    const gradeFor = (pw) => {
      const linked = pwToAct.get(String(pw._id)) || null;
      return linked ? findCompliance(pw, [linked]) : null;
    };
    expect(gradeFor(planned[0])).toBeTruthy();
    expect(gradeFor(planned[1])).toBeNull();
  });

  test('handing the whole day to both is what made both green', () => {
    // The old call. Both plans get a verdict from the single ride.
    expect(findCompliance(planned[0], acts)).toBeTruthy();
    expect(findCompliance(planned[1], acts)).toBeTruthy();
  });

  test('an explicit link wins over first-come', () => {
    const withLink = [
      { _id: 'p1', sport: 'bike', plannedDuration: 3000 },
      { _id: 'p2', sport: 'bike', plannedDuration: 3000, completedTrainingId: 'a1' },
    ];
    const { pwToAct } = pairPlannedWithActivities(withLink, [{ _id: 'a1', sport: 'Ride', moving_time: 3000 }]);
    expect(pwToAct.get('p2')).toBeTruthy();
  });
});
