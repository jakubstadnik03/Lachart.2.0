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
import { plannedCardAppearance } from './plannedCardAppearance';

/**
 * Both calendars colour a card by what happened to the plan. The rule now lives
 * in one place; this pins it so the dashboard and the calendar page cannot
 * drift apart again.
 */
describe('plannedCardAppearance', () => {
  test('done and graded takes the compliance colours', () => {
    const a = plannedCardAppearance({ isCompleted: true, compliance: { color: '#22c55e', bg: '#f0fdf4' } });
    expect(a).toEqual({ bg: '#f0fdf4', borderColor: '#22c55e', borderStyle: 'solid', accent: '#22c55e' });
  });

  test('done but ungraded is still green, not "no opinion"', () => {
    const a = plannedCardAppearance({ isCompleted: true, compliance: null });
    expect(a.borderStyle).toBe('solid');
    expect(a.bg).toBe('#f0fdf4');
  });

  test('a session graded amber keeps its own grade', () => {
    const a = plannedCardAppearance({ isCompleted: true, compliance: { color: '#f59e0b', bg: '#fffbeb' } });
    expect(a.borderColor).toBe('#f59e0b');
  });

  test('missed reads red', () => {
    const a = plannedCardAppearance({ isMissed: true });
    expect(a.bg).toBe('#fef2f2');
    expect(a.borderStyle).toBe('solid');
  });

  test('still ahead is dashed and barely tinted — it has not happened', () => {
    const a = plannedCardAppearance({ isPlanned: true, sport: 'bike' });
    expect(a.borderStyle).toBe('dashed');
    expect(a.bg).toMatch(/^#[0-9a-f]{6}10$/i);
  });

  test('the plan tint follows the sport', () => {
    const bike = plannedCardAppearance({ isPlanned: true, sport: 'bike' });
    const run = plannedCardAppearance({ isPlanned: true, sport: 'run' });
    expect(bike.bg).not.toBe(run.bg);
  });

  test('an activity with no plan behind it stays plain', () => {
    const a = plannedCardAppearance({});
    expect(a).toEqual({ bg: '#ffffff', borderColor: '#e5e7eb', borderStyle: 'solid', accent: '#e5e7eb' });
  });

  test('done beats missed if both are somehow set', () => {
    expect(plannedCardAppearance({ isCompleted: true, isMissed: true }).bg).toBe('#f0fdf4');
  });

  test('no arguments at all does not throw', () => {
    expect(() => plannedCardAppearance()).not.toThrow();
  });
});
