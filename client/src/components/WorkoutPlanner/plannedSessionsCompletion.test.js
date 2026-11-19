/**
 * The planner's completion badge is about the planned sessions, not about how
 * many hours the week held. IM Florida week: one planned 52-minute swim, never
 * swum, and seventeen hours of riding and running — the badge said 100 %.
 */
// The modal pulls in icon packages jest cannot parse; these two helpers are
// all the summary needs from it.
jest.mock('./WorkoutPlanModal', () => ({
  plannerSportKey: (s) => String(s || 'other').toLowerCase(),
  stepTotalSecs: (steps) => (Array.isArray(steps) ? steps.reduce((a, x) => a + (Number(x.durationSeconds) || 0), 0) : 0),
}));
jest.mock('./WorkoutBuilder', () => ({ computeEstTSS: () => 0 }));

// eslint-disable-next-line import/first
import { plannedSessionsCompletion } from './plannerWeekUtils';

const plan = (id, date, sport, plannedDuration, extra = {}) => ({ _id: id, date, sport, plannedDuration, status: 'planned', ...extra });
const done = (id, date, sport, movingTime) => ({ _id: id, date, sport, movingTime });

describe('plannedSessionsCompletion', () => {
  it('reads 0 % when the only planned session was missed, however much else was trained', () => {
    const r = plannedSessionsCompletion(
      [plan('swim', '2026-11-07T00:00:00.000Z', 'swim', 3120)],
      [done('ride', '2026-11-07T12:35:00', 'Ride', 14707), done('run', '2026-11-07T16:42:00', 'Run', 9706)],
    );
    expect(r).toEqual({ doneSec: 0, plannedSec: 3120, pct: 0 });
  });

  it('counts a planned session paired with a session of its sport that day', () => {
    const r = plannedSessionsCompletion(
      [plan('a', '2026-11-03T00:00:00.000Z', 'bike', 3600), plan('b', '2026-11-04T00:00:00.000Z', 'run', 1800)],
      [done('r1', '2026-11-03T09:00:00', 'VirtualRide', 3500)],
    );
    expect(r.pct).toBe(67);
  });

  it('counts a session completed in the app', () => {
    const r = plannedSessionsCompletion([plan('a', '2026-11-03T00:00:00.000Z', 'bike', 3600, { status: 'completed' })], []);
    expect(r.pct).toBe(100);
  });

  it('takes skipped sessions out of the plan rather than counting them as missed', () => {
    const r = plannedSessionsCompletion(
      [plan('a', '2026-11-03T00:00:00.000Z', 'bike', 3600), plan('b', '2026-11-04T00:00:00.000Z', 'swim', 1800, { status: 'skipped' })],
      [done('r1', '2026-11-03T09:00:00', 'Ride', 3600)],
    );
    expect(r).toEqual({ doneSec: 3600, plannedSec: 3600, pct: 100 });
  });

  it('pairs one session with one plan: two rides planned, one ridden', () => {
    const r = plannedSessionsCompletion(
      [plan('a', '2026-11-03T00:00:00.000Z', 'bike', 3600), plan('b', '2026-11-03T00:00:00.000Z', 'bike', 3600)],
      [done('r1', '2026-11-03T09:00:00', 'Ride', 3600)],
    );
    expect(r.pct).toBe(50);
  });

  it('says nothing for a week without a plan', () => {
    expect(plannedSessionsCompletion([], [done('r', '2026-11-03T09:00:00', 'Ride', 3600)]).pct).toBeNull();
  });
});
