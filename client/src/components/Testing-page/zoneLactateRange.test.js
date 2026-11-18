/**
 * A test with resting lactate 1.3 and LT1 at 1.41 mmol/L showed Zone 2 as
 * "1.5–1.5 mmol/L": zone 1's top was forced to base + 0.2 = 1.5, above LT1,
 * and zone 2 (Z1 top → LT1) collapsed onto it.
 */
// The component pulls in services/api, which imports axios as an ES module.
jest.mock('../../services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

// eslint-disable-next-line import/first
import { zone1TopLactate, fmtLactateRange } from './TrainingZonesGenerator';

describe('zone 1 / zone 2 lactate split', () => {
  test('zone 1 never ends above LT1', () => {
    const top = zone1TopLactate(1.3, 1.41, 0.5);
    expect(top).toBeLessThan(1.41);
    expect(top).toBeGreaterThan(1.3);
  });

  test('with room below LT1 the usual headroom still applies', () => {
    expect(zone1TopLactate(0.9, 2.2, 0.6)).toBeCloseTo(1.6);
  });

  test('a narrow base→LT1 span is shared between zone 1 and zone 2', () => {
    const top = zone1TopLactate(1.3, 1.41, 0.5);
    expect(top).toBeCloseTo(1.355);
  });
});

describe('fmtLactateRange', () => {
  test('one decimal when the ends differ', () => {
    expect(fmtLactateRange(1.3, 1.8)).toBe('1.3–1.8');
  });

  test('two decimals rather than printing the same number twice', () => {
    expect(fmtLactateRange(1.362, 1.41)).toBe('1.36–1.41');
  });

  test('a dash for missing values', () => {
    expect(fmtLactateRange(null, 2)).toBe('-');
  });
});
