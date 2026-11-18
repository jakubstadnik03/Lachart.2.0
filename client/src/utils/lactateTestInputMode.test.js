/**
 * Run and swim loads typed as km/h: the thresholds only read pace seconds, and
 * the athlete keeps seeing the unit they typed. The ladders under SAVED_KMH and
 * LOST_SECONDS are real saved tests, load → lactate, as they sit in the database.
 */
import { calculateThresholds } from '../components/Testing-page/DataTable';
import { formatThresholdIntensity } from './extractLactateThresholds';
import {
  getEffectiveLactateInputMode,
  getLactateDisplayMode,
  speedLoadsAsPaceSeconds,
  withPaceSecondLoads,
} from './lactateTestInputMode';

jest.mock('../services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const makeTest = (rows, extra = {}) => ({
  sport: 'run',
  baseLactate: 1.0,
  results: rows.map(([power, lactate, heartRate], i) => ({ interval: i + 1, power, lactate, heartRate })),
  ...extra,
});

const SAVED_KMH = [
  [[8, 1.1], [10, 1.2], [11, 1.5], [12, 1.8], [13, 2.4], [14, 3.8], [15, 5.2], [16, 8.1], [17, 10.5]],
  [[7, 0.8], [8.6, 0.8], [10.2, 1], [11.8, 2.1], [13.4, 3.1], [15, 8.3], [16.6, 10]],
  [[7, 2.2], [9, 3.2], [10, 4.2], [11, 9.8]],
  [[12, 2], [13, 1.4], [14, 1.3], [15, 1.5], [16, 1.8], [17, 2.8], [18, 4.9], [19, 7.7], [20, 11]],
  [[7.5, 1.2], [8.6, 1.1], [9.7, 1.1], [10.8, 2.1], [11.9, 2.4], [13, 3.4], [14.1, 5.4], [15.2, 8]],
];

const LOST_SECONDS = [
  [[9, 1.59], [8, 2.9], [7, 3.2], [7, 3.9], [7, 4.5], [6, 5.3], [6, 5.9]],
  [[5, 2.5], [5, 1.5], [4, 2.6], [4, 3], [4, 4.5], [4, 6.7]],
  [[5, 0.9], [4, 0.7], [4, 0.7], [4, 0.9], [4, 1.3], [4, 2.3], [3, 2.6], [3, 5], [3, 7.1]],
  [[8, 1.7], [7, 1.8], [6, 1.7], [5, 1.6], [5, 2.5], [4, 3.8], [4, 5.3], [4, 7.7]],
  [[7, 1.7], [6, 2.3], [6, 3.3], [5, 4], [5, 6.3], [4, 7.5], [4, 7.9]],
  [[8, 1.2], [7, 0.9], [6, 2.5], [5, 1.7], [4, 1.8], [4, 2.6], [3, 3.3], [3, 5.9], [3, 7.5]],
];

const LADDER_KMH = [[10, 1.1, 130], [11, 1.2, 138], [12, 1.5, 146], [13, 2.1, 154], [14, 3.2, 162], [15, 4.9, 170], [16, 7.4, 177]];

describe('speedLoadsAsPaceSeconds', () => {
  it('converts a test the form flagged as speed', () => {
    expect(speedLoadsAsPaceSeconds(makeTest([[12, 1.2], [15, 2]], { inputMode: 'speed' }))).toEqual([300, 240]);
  });

  it('converts swim km/h to seconds per 100 m', () => {
    expect(speedLoadsAsPaceSeconds(makeTest([[3, 1.2], [4, 2]], { sport: 'swim', inputMode: 'speed' }))).toEqual([120, 90]);
  });

  it('reads an imperial run test as mph, which the form saves as seconds per mile', () => {
    expect(speedLoadsAsPaceSeconds(makeTest([[6, 1.2], [8, 2]], { inputMode: 'speed', unitSystem: 'imperial' }))).toEqual([600, 450]);
  });

  it('keeps rows that have no load yet', () => {
    expect(speedLoadsAsPaceSeconds(makeTest([[12, 1.2], [0, 0], [15, 2]], { inputMode: 'speed' }))).toEqual([300, 0, 240]);
  });

  it.each(SAVED_KMH.map((rows) => [rows.map((r) => r[0]).join(' '), rows]))('finds the saved km/h test %s, whatever its flag says', (_, rows) => {
    for (const inputMode of ['pace', undefined]) {
      const seconds = speedLoadsAsPaceSeconds(makeTest(rows, { inputMode }));
      expect(seconds).toEqual(rows.map(([kmh]) => 3600 / kmh));
    }
  });

  it.each(LOST_SECONDS.map((rows) => [rows.map((r) => r[0]).join(' '), rows]))('does not take the whole-minute paces %s for km/h', (_, rows) => {
    expect(getEffectiveLactateInputMode(makeTest(rows))).toBe('speed');
    expect(speedLoadsAsPaceSeconds(makeTest(rows))).toBeNull();
  });

  it('leaves tests already in seconds, bike tests and empty tests alone', () => {
    expect(speedLoadsAsPaceSeconds(makeTest([[300, 1.2], [240, 2]], { inputMode: 'speed' }))).toBeNull();
    expect(speedLoadsAsPaceSeconds(makeTest([[300, 1.2], [240, 2]], { inputMode: 'pace' }))).toBeNull();
    expect(speedLoadsAsPaceSeconds(makeTest([[20, 1.2], [30, 2]], { sport: 'bike', inputMode: 'speed' }))).toBeNull();
    expect(speedLoadsAsPaceSeconds(makeTest([], { inputMode: 'speed' }))).toBeNull();
    expect(speedLoadsAsPaceSeconds(makeTest([[9, 2.28]]))).toBeNull();
  });
});

describe('withPaceSecondLoads', () => {
  it('flags the converted test as speed and does not touch the original', () => {
    const typed = makeTest([[12, 1.2], [15, 2]], { inputMode: 'pace' });
    const out = withPaceSecondLoads(typed);
    expect(out.inputMode).toBe('speed');
    expect(out.results.map((r) => r.power)).toEqual([300, 240]);
    expect(typed.results.map((r) => r.power)).toEqual([12, 15]);
  });

  it('returns the same object when there is nothing to convert, and does not convert twice', () => {
    const paced = makeTest([[300, 1.2], [240, 2]], { inputMode: 'pace' });
    expect(withPaceSecondLoads(paced)).toBe(paced);
    const once = withPaceSecondLoads(makeTest([[12, 1.2], [15, 2]], { inputMode: 'speed' }));
    expect(withPaceSecondLoads(once)).toBe(once);
  });
});

describe('thresholds from km/h', () => {
  it('are the ones the same test gets when it is typed as pace', () => {
    const typedAsKmh = calculateThresholds(withPaceSecondLoads(makeTest(LADDER_KMH, { inputMode: 'speed' })));
    const typedAsPace = calculateThresholds(makeTest(
      LADDER_KMH.map(([kmh, lactate, hr]) => [3600 / kmh, lactate, hr]),
      { inputMode: 'pace' },
    ));
    expect(typedAsKmh.LTP1).toBeGreaterThan(typedAsKmh.LTP2);
    expect(typedAsKmh.LTP1).toBeCloseTo(typedAsPace.LTP1, 6);
    expect(typedAsKmh.LTP2).toBeCloseTo(typedAsPace.LTP2, 6);
  });

  it('are missing without the conversion, which is the reported bug', () => {
    expect(calculateThresholds(makeTest(LADDER_KMH, { inputMode: 'speed' })).LTP2).toBeUndefined();
  });

  it.each(SAVED_KMH.map((rows) => [rows.map((r) => r[0]).join(' '), rows]))('come out plausible for the saved test %s', (_, rows) => {
    const th = calculateThresholds(withPaceSecondLoads(makeTest(rows, { inputMode: 'pace' })));
    const kmhAt = (seconds) => 3600 / seconds;
    const [slowest, fastest] = [rows[0][0], rows[rows.length - 1][0]];
    expect(kmhAt(th.LTP1)).toBeGreaterThanOrEqual(slowest);
    expect(kmhAt(th.LTP2)).toBeLessThanOrEqual(fastest);
    expect(kmhAt(th.LTP1)).toBeLessThan(kmhAt(th.LTP2));
  });
});

describe('getLactateDisplayMode', () => {
  const typedAsKmh = withPaceSecondLoads(makeTest(LADDER_KMH, { inputMode: 'speed' }));
  const typedAsPace = makeTest([[300, 1.2], [240, 2]], { inputMode: 'pace' });
  const prefers = (paceDisplay) => ({ trainingPreferences: { paceDisplay } });

  it('keeps a test typed as km/h in km/h, even though it is stored as seconds', () => {
    expect(getEffectiveLactateInputMode(typedAsKmh)).toBe('pace');
    expect(getLactateDisplayMode(typedAsKmh, null)).toBe('speed');
    expect(getLactateDisplayMode(typedAsKmh, prefers('minpkm'))).toBe('speed');
    expect(getLactateDisplayMode(typedAsKmh, prefers('kmh'))).toBe('speed');
  });

  it('lets the preference decide for a test typed as pace', () => {
    expect(getLactateDisplayMode(typedAsPace, null)).toBe('pace');
    expect(getLactateDisplayMode(typedAsPace, prefers('minpkm'))).toBe('pace');
    expect(getLactateDisplayMode(typedAsPace, prefers('kmh'))).toBe('speed');
  });

  it('does not read a stray speed flag on a bike test', () => {
    const bike = makeTest([[150, 1.2], [200, 2]], { sport: 'bike', inputMode: 'speed' });
    expect(getLactateDisplayMode(bike, prefers('minpkm'))).toBe('pace');
  });
});

describe('formatThresholdIntensity', () => {
  it('prints a test typed as km/h in km/h, and one typed as pace in pace', () => {
    const typedAsKmh = withPaceSecondLoads(makeTest(LADDER_KMH, { inputMode: 'speed' }));
    expect(formatThresholdIntensity(300, typedAsKmh)).toBe('12.0 km/h');
    expect(formatThresholdIntensity(300, makeTest([[300, 1.2], [240, 2]], { inputMode: 'pace' }))).toBe('5:00/km');
  });
});
