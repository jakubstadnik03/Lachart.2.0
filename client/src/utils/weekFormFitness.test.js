import { weekContainsToday, resolveWeekEndValues } from './weekFormFitness';

/**
 * The home screen prints Fitness / Fatigue / Form twice — status card and week
 * card — and they disagreed because they read different sources. What has to
 * hold is that the current week's tiles use the server's numbers, the same ones
 * the status card shows, while a past week still comes from the series.
 */

/** Week bounds exactly as getWeekBounds builds them. */
const weekOf = (iso) => {
  const d = new Date(iso);
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
};

const SERVER = { fitness: 181, fatigue: 201, form: -49 };
const SNAP = { Fitness: 167, Fatigue: 181, Form: -40 };

describe('weekContainsToday', () => {
  const { monday, sunday } = weekOf('2026-10-14T12:00:00');

  test('a weekday inside the week', () => {
    expect(weekContainsToday(monday, sunday, new Date('2026-10-15T09:30:00'))).toBe(true);
  });

  test('Monday at midnight is in', () => {
    expect(weekContainsToday(monday, sunday, new Date(monday))).toBe(true);
  });

  test('Sunday evening is still in', () => {
    // The boundary that a midnight-to-midnight range would have dropped: on
    // Sunday after 00:00 the week card would silently fall back to the series
    // and disagree with the status card for a whole day.
    expect(weekContainsToday(monday, sunday, new Date('2026-10-18T22:45:00'))).toBe(true);
  });

  test('the Monday after is out', () => {
    expect(weekContainsToday(monday, sunday, new Date('2026-10-19T00:00:01'))).toBe(false);
  });

  test('the Sunday before is out', () => {
    expect(weekContainsToday(monday, sunday, new Date('2026-10-11T23:59:59'))).toBe(false);
  });

  test('nonsense in, false out — never a throw', () => {
    expect(weekContainsToday(null, sunday, new Date())).toBe(false);
    expect(weekContainsToday(monday, null, new Date())).toBe(false);
    expect(weekContainsToday(monday, sunday, new Date('nope'))).toBe(false);
    expect(weekContainsToday(new Date('nope'), sunday, new Date())).toBe(false);
  });
});

describe('resolveWeekEndValues', () => {
  const current = weekOf('2026-10-17T10:00:00');
  const past = weekOf('2026-09-20T10:00:00');
  const today = new Date('2026-10-17T10:00:00');

  test('the current week shows what the status card shows', () => {
    expect(resolveWeekEndValues({ ...current, today, todayMetrics: SERVER, endSnap: SNAP }))
      .toEqual({ Fitness: 181, Fatigue: 201, Form: -49 });
  });

  test('a past week keeps its own snapshot', () => {
    // Today's numbers say nothing about a week that ended a month ago.
    expect(resolveWeekEndValues({ ...past, today, todayMetrics: SERVER, endSnap: SNAP }))
      .toEqual(SNAP);
  });

  test('falls back to the series when the server has not answered', () => {
    expect(resolveWeekEndValues({ ...current, today, todayMetrics: null, endSnap: SNAP }))
      .toEqual(SNAP);
    expect(resolveWeekEndValues({ ...current, today, todayMetrics: {}, endSnap: SNAP }))
      .toEqual(SNAP);
  });

  test('zeros are an answer, not a missing one', () => {
    // An athlete with no training yet reads 0 / 0 / 0, and that is a real
    // answer. Testing for truthiness instead of presence would send them back
    // to the series and print numbers from somewhere else on a fresh account.
    expect(resolveWeekEndValues({
      ...current, today, todayMetrics: { fitness: 0, fatigue: 0, form: 0 }, endSnap: SNAP,
    })).toEqual({ Fitness: 0, Fatigue: 0, Form: 0 });
  });

  test('a single zero among real numbers is kept as zero', () => {
    expect(resolveWeekEndValues({
      ...current, today, todayMetrics: { fitness: 90, fatigue: 90, form: 0 }, endSnap: SNAP,
    })).toEqual({ Fitness: 90, Fatigue: 90, Form: 0 });
  });

  test('a partial server answer still wins, with the rest at zero', () => {
    expect(resolveWeekEndValues({
      ...current, today, todayMetrics: { form: -12 }, endSnap: SNAP,
    })).toEqual({ Fitness: 0, Fatigue: 0, Form: -12 });
  });

  test('nothing anywhere means nothing to show', () => {
    expect(resolveWeekEndValues({ ...current, today, todayMetrics: null, endSnap: null })).toBeNull();
    expect(resolveWeekEndValues()).toBeNull();
  });
});
