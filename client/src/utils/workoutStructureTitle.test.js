import { buildStructureTitle } from './workoutStructureTitle';

/** A lap the classifier will read as work (fast) or as rest (slow). */
const lap = (sec, metres, { hard = false } = {}) => ({
  elapsed_time: sec,
  distance: metres,
  average_watts: hard ? 320 : 150,
});

describe('buildStructureTitle', () => {
  test('a bike session set in time keeps reading in time', () => {
    const laps = [
      lap(600, 4800),
      ...[0, 1, 2, 3, 4].flatMap(() => [lap(478, 3900, { hard: true }), lap(180, 1100)]),
      lap(600, 4600),
    ];
    // 478s of work is an 8-minute effort, whatever the clock says.
    expect(buildStructureTitle(laps, { sport: 'bike' })).toBe('5×8min');
  });

  test('a swim reads in metres, not minutes', () => {
    // 100s of drift either way; the pool wall is the only thing that is exact.
    const laps = [
      lap(300, 200),
      ...[0, 1, 2, 3, 4, 5].flatMap((i) => [
        lap(88 + i, 97 + (i % 3), { hard: true }),
        lap(30, 25),
      ]),
      lap(300, 200),
    ];
    expect(buildStructureTitle(laps, { sport: 'swim' })).toBe('6×100m');
  });

  test('a swim rounds to the pool grid rather than to the metre', () => {
    const laps = [
      lap(600, 400),
      ...[0, 1, 2].flatMap(() => [lap(370, 397, { hard: true }), lap(60, 50)]),
      lap(600, 400),
    ];
    expect(buildStructureTitle(laps, { sport: 'swim' })).toBe('3×400m');
  });

  test('a swimmer counts a 1500 in metres, not kilometres', () => {
    const laps = [
      lap(300, 200),
      ...[0, 1].flatMap(() => [lap(1400, 1496, { hard: true }), lap(240, 100)]),
      lap(300, 200),
    ];
    expect(buildStructureTitle(laps, { sport: 'swim' })).toBe('2×1500m');
  });

  test('a bike set in distance reads in distance, rounded', () => {
    // Distances near-identical, durations drifting — the athlete was riding to
    // a distance, so 2.03 km is a 2 km rep.
    const laps = [
      lap(600, 4800),
      ...[0, 1, 2, 3].flatMap((i) => [lap(300 + i * 25, 2030 + i * 6, { hard: true }), lap(180, 1100)]),
      lap(600, 4600),
    ];
    expect(buildStructureTitle(laps, { sport: 'bike' })).toBe('4×2km');
  });

  test('the category label still rides along', () => {
    const laps = [
      lap(600, 4800),
      ...[0, 1, 2].flatMap(() => [lap(480, 3900, { hard: true }), lap(180, 1100)]),
      lap(600, 4600),
    ];
    expect(buildStructureTitle(laps, { sport: 'bike', categoryLabel: 'LT2' })).toBe('3×8min LT2');
  });

  test('an unstructured ride gets no title', () => {
    expect(buildStructureTitle([lap(1800, 14000), lap(1800, 14000)], { sport: 'bike' })).toBeNull();
    expect(buildStructureTitle(null, { sport: 'bike' })).toBeNull();
  });
});
