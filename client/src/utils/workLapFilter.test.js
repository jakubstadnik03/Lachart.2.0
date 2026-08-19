import { filterWorkResults, classifyWorkLaps } from './workLapFilter';

/** Bike interval session: 4 hard efforts with easy spins between them. */
const bikeIntervals = () => [
  { power: 120, moving_time: 600 },  // warm-up spin
  { power: 300, moving_time: 300 },
  { power: 110, moving_time: 180 },
  { power: 305, moving_time: 300 },
  { power: 105, moving_time: 180 },
  { power: 298, moving_time: 300 },
  { power: 100, moving_time: 600 },  // cool-down spin
];

describe('classifyWorkLaps', () => {
  test('keeps every lap — the recoveries are part of the session', () => {
    const laps = bikeIntervals();
    expect(classifyWorkLaps(laps, 'bike')).toHaveLength(laps.length);
  });

  test('preserves order', () => {
    const out = classifyWorkLaps(bikeIntervals(), 'bike');
    expect(out.map(r => r.power)).toEqual([120, 300, 110, 305, 105, 298, 100]);
  });

  test('tags the hard efforts work and the spins recovery', () => {
    const out = classifyWorkLaps(bikeIntervals(), 'bike');
    const types = out.map(r => r.intervalType);
    expect(types[1]).toBe('work');
    expect(types[3]).toBe('work');
    expect(types[5]).toBe('work');
    expect(types[2]).toBe('recovery');
    expect(types[4]).toBe('recovery');
  });

  test('agrees with filterWorkResults — the greyed bar is the excluded lap', () => {
    const laps = bikeIntervals();
    const work = new Set(filterWorkResults(laps, 'bike'));
    classifyWorkLaps(laps, 'bike').forEach((r, i) => {
      expect(r.intervalType === 'work').toBe(work.has(laps[i]));
    });
  });

  test('never overwrites a tag the device or user already set', () => {
    const laps = [
      { power: 120, moving_time: 600, intervalType: 'warmup' },
      { power: 300, moving_time: 300 },
      { power: 110, moving_time: 180 },
      { power: 305, moving_time: 300 },
      { power: 100, moving_time: 600, intervalType: 'cooldown' },
    ];
    const out = classifyWorkLaps(laps, 'bike');
    expect(out[0].intervalType).toBe('warmup');
    expect(out[4].intervalType).toBe('cooldown');
  });

  test('a steady session comes back all work, not all recovery', () => {
    const steady = [
      { power: 200, moving_time: 600 },
      { power: 205, moving_time: 600 },
      { power: 198, moving_time: 600 },
    ];
    expect(classifyWorkLaps(steady, 'bike').map(r => r.intervalType))
      .toEqual(['work', 'work', 'work']);
  });

  test('empty and non-array inputs are passed through', () => {
    expect(classifyWorkLaps([], 'bike')).toEqual([]);
    expect(classifyWorkLaps(null, 'bike')).toEqual([]);
    expect(classifyWorkLaps(undefined, 'bike')).toEqual([]);
  });

  test('does not mutate the caller’s laps', () => {
    const laps = bikeIntervals();
    classifyWorkLaps(laps, 'bike');
    expect(laps.every(r => r.intervalType === undefined)).toBe(true);
  });
});
