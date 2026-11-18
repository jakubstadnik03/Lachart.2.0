/**
 * A last level stopped early, end to end: typing its time into Dur has to give
 * the same LT1, LT2 and zones as typing the proportional speed by hand.
 */
import { calculateThresholds } from './DataTable';
import { calculateZonesFromTest } from './zoneCalculator';
import { shortenedLastLevel, shortenedLevelNote } from '../../utils/lactateThresholdEngine';
import { withPaceSecondLoads } from '../../utils/lactateTestInputMode';

jest.mock('../../services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const rows = [[12, 1.2, 140], [13, 1.4, 148], [14, 1.9, 156], [15, 3.0, 165], [16, 5.0, 174]];
const treadmill = (lastSpeed, lastDuration) => ({
  sport: 'run',
  baseLactate: 1.0,
  stageDurationSec: 180,
  results: [
    ...rows.map(([speed, lactate, heartRate]) => ({ power: 3600 / speed, lactate, heartRate, duration: 180 })),
    { power: 3600 / lastSpeed, lactate: 8.1, heartRate: 182, duration: lastDuration },
  ],
});

describe('a last level stopped early', () => {
  it('reads thresholds and zones as if the proportional speed had been typed', () => {
    const stopped = treadmill(17, 100);
    const proportional = treadmill(16 + 100 / 180, 180);
    const thr = calculateThresholds(stopped);
    expect(thr.LTP1).toBeCloseTo(calculateThresholds(proportional).LTP1, 0);
    expect(thr.LTP2).toBeCloseTo(calculateThresholds(proportional).LTP2, 0);
    expect(calculateZonesFromTest(stopped).pace).toEqual(calculateZonesFromTest(proportional).pace);
  });

  it('does not touch a level that ran its full length', () => {
    expect(calculateThresholds(treadmill(17, 180)).LTP2)
      .toBe(calculateThresholds({ ...treadmill(17, 180), stageDurationSec: undefined }).LTP2);
  });
});

describe('a last level stopped early, typed as km/h on the public calculator', () => {
  // What the public page hands the calculator before converting: km/h as typed, Dur as typed.
  const typedAsKmh = (lastDuration) => ({
    sport: 'run',
    baseLactate: 1.0,
    inputMode: 'speed',
    stageDurationSec: 180,
    results: [
      ...rows.map(([speed, lactate, heartRate]) => ({ power: speed, lactate, heartRate, duration: 180 })),
      { power: 17, lactate: 8.1, heartRate: 182, duration: lastDuration },
    ],
  });
  const kmh = (seconds) => `${(3600 / seconds).toFixed(1)} km/h`;

  it.each([[100], ['1:40']])('counts it at 16.6 km/h in the note, the curve and the thresholds (Dur %p)', (lastDuration) => {
    const typed = typedAsKmh(lastDuration);
    // The rule only reads pace seconds, so km/h as typed would be ignored.
    expect(shortenedLastLevel(typed)).toBeNull();

    const read = withPaceSecondLoads(typed);
    const shortened = shortenedLastLevel(read);
    expect(shortenedLevelNote(shortened, kmh))
      .toBe('Last level stopped at 1:40 of 3:00: counted at 16.6 km/h instead of 17.0 km/h in the curve and thresholds.');

    const byHand = calculateThresholds(treadmill(16 + 100 / 180, 180));
    const thr = calculateThresholds(read);
    expect(thr.LTP1).toBeCloseTo(byHand.LTP1, 0);
    expect(thr.LTP2).toBeCloseTo(byHand.LTP2, 0);
  });
});
