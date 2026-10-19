import { resolveWidgetWorkoutLists, dayStamp } from './widgetWorkoutLists';

/**
 * The widget lost today's workouts whenever a background Strava sync landed
 * while the user was on any tab but Home: the cheap writer sent empty arrays,
 * and the native side overwrites the whole cache.
 */
const DAY = new Date('2026-10-19T10:00:00');
const NEXT_DAY = new Date('2026-10-20T07:00:00');

const full = {
  todayCompleted: [{ title: 'Morning ride' }],
  todayPlanned: [{ title: 'Bike rege' }, { title: 'Evening run' }],
  tomorrowPlanned: [{ title: 'Long ride' }],
};

describe('resolveWidgetWorkoutLists', () => {
  test('a caller that looked up the lists sends them', () => {
    const { lists } = resolveWidgetWorkoutLists(null, full, DAY);
    expect(lists).toEqual(full);
  });

  test('a caller that did not look them up resends the last ones', () => {
    // syncWidgetFromApi after the dashboard has written: this is the whole bug.
    const first = resolveWidgetWorkoutLists(null, full, DAY);
    const { lists } = resolveWidgetWorkoutLists(first.remembered, { fitness: 177 }, DAY);
    expect(lists.todayPlanned).toEqual(full.todayPlanned);
    expect(lists.todayCompleted).toEqual(full.todayCompleted);
    expect(lists.tomorrowPlanned).toEqual(full.tomorrowPlanned);
  });

  test('an explicit empty list still empties the widget', () => {
    // Deleting the last planned workout has to reach the widget.
    const first = resolveWidgetWorkoutLists(null, full, DAY);
    const { lists } = resolveWidgetWorkoutLists(
      first.remembered, { ...full, todayPlanned: [] }, DAY,
    );
    expect(lists.todayPlanned).toEqual([]);
  });

  test('yesterday is not resent after midnight', () => {
    const first = resolveWidgetWorkoutLists(null, full, DAY);
    const { lists } = resolveWidgetWorkoutLists(first.remembered, { fitness: 177 }, NEXT_DAY);
    expect(lists.todayCompleted).toEqual([]);
    expect(lists.todayPlanned).toEqual([]);
    expect(lists.tomorrowPlanned).toEqual([]);
  });

  test('nothing remembered yet means nothing sent', () => {
    const { lists } = resolveWidgetWorkoutLists(null, { fitness: 177 }, DAY);
    expect(lists).toEqual({ todayCompleted: [], todayPlanned: [], tomorrowPlanned: [] });
  });

  test('each list is carried independently', () => {
    const first = resolveWidgetWorkoutLists(null, full, DAY);
    const { lists } = resolveWidgetWorkoutLists(
      first.remembered, { todayCompleted: [{ title: 'New ride' }] }, DAY,
    );
    expect(lists.todayCompleted).toEqual([{ title: 'New ride' }]);
    expect(lists.todayPlanned).toEqual(full.todayPlanned);
  });

  test('what is carried forward survives another hop', () => {
    const a = resolveWidgetWorkoutLists(null, full, DAY);
    const b = resolveWidgetWorkoutLists(a.remembered, { fitness: 1 }, DAY);
    const c = resolveWidgetWorkoutLists(b.remembered, { fitness: 2 }, DAY);
    expect(c.lists.todayPlanned).toEqual(full.todayPlanned);
  });
});

describe('dayStamp', () => {
  test('is the local day, not UTC', () => {
    // 00:30 local on the 19th is still the 19th wherever the test runs.
    expect(dayStamp(new Date(2026, 9, 19, 0, 30))).toBe('2026-10-19');
    expect(dayStamp(new Date(2026, 9, 19, 23, 30))).toBe('2026-10-19');
  });

  test('a bad date does not match any day', () => {
    expect(dayStamp(new Date('nope'))).toBe('');
  });
});
