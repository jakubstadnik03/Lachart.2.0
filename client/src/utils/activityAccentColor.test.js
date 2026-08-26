import { activityAccentColor, sportColor } from './activityAccentColor';

/**
 * The dashboard week strip and the calendar page coloured activities by
 * different rules, so "Bike heat" — a category the athlete made and coloured
 * red — was red on one screen and blue on the other.
 */
const CATEGORIES = {
  lt2: { id: 'lt2', label: 'LT2', color: '#8b5cf6' },
  heat: { id: 'heat', label: 'Heat', color: '#ef4444' },
};
const getCategory = (id) => CATEGORIES[id] || null;

describe('activityAccentColor', () => {
  test('a category wins over the sport — it is the deliberate statement', () => {
    expect(activityAccentColor({ category: 'heat', sport: 'Ride' }, getCategory)).toBe('#ef4444');
    expect(activityAccentColor({ category: 'lt2', sport: 'Swim' }, getCategory)).toBe('#8b5cf6');
  });

  test('the same session gets the same colour whatever its sport', () => {
    const bike = activityAccentColor({ category: 'heat', sport: 'Ride' }, getCategory);
    const run = activityAccentColor({ category: 'heat', sport: 'Run' }, getCategory);
    expect(bike).toBe(run);
  });

  test('no category falls back to the sport', () => {
    expect(activityAccentColor({ sport: 'Run' }, getCategory)).toBe(sportColor('Run'));
    expect(activityAccentColor({ sport: 'Ride' }, getCategory)).toBe(sportColor('Ride'));
    expect(activityAccentColor({ sport: 'Swim' }, getCategory)).toBe(sportColor('Swim'));
  });

  test('a category that no longer exists falls back rather than going blank', () => {
    expect(activityAccentColor({ category: 'deleted-one', sport: 'Run' }, getCategory))
      .toBe(sportColor('Run'));
  });

  test('works without a category getter at all', () => {
    expect(activityAccentColor({ category: 'heat', sport: 'Run' })).toBe(sportColor('Run'));
    expect(activityAccentColor({ category: 'heat', sport: 'Run' }, null)).toBe(sportColor('Run'));
  });

  test('reads the sport from `type` when there is no `sport`', () => {
    expect(activityAccentColor({ type: 'Swim' }, getCategory)).toBe(sportColor('Swim'));
  });

  test('an unknown or missing sport still returns a colour', () => {
    expect(activityAccentColor({}, getCategory)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(activityAccentColor(null, getCategory)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('walks and hikes are coloured as running, not as "other"', () => {
    expect(sportColor('Walk')).toBe(sportColor('Run'));
    expect(sportColor('Hike')).toBe(sportColor('Run'));
  });
});
