/**
 * The comparison table printed every change as power or pace: LT1 lactate
 * 1.90 → 1.41 mmol/L came out as "↓ −0 s", and heart rate in seconds too.
 */
// The component pulls in services/api, which imports axios as an ES module.
jest.mock('../../services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

// eslint-disable-next-line import/first
import { fmtChange } from './TestComparisonPanel';

describe('fmtChange', () => {
  test('lactate changes in mmol/L, to two decimals', () => {
    expect(fmtChange(1.41 - 1.90, 'run', 'lactate')).toBe('−0.49 mmol/L');
    expect(fmtChange(0.3, 'bike', 'lactate')).toBe('+0.30 mmol/L');
  });

  test('a lactate change is not rounded away', () => {
    expect(fmtChange(-0.04, 'run', 'lactate')).toBe('−0.04 mmol/L');
    expect(fmtChange(0.001, 'run', 'lactate')).toBe('0');
  });

  test('heart rate changes in bpm', () => {
    expect(fmtChange(-6, 'run', 'hr')).toBe('−6 bpm');
    expect(fmtChange(3.4, 'bike', 'hr')).toBe('+3 bpm');
  });

  test('power and pace keep their units', () => {
    expect(fmtChange(12, 'bike')).toBe('+12 W');
    expect(fmtChange(9, 'run')).toBe('+9 s');
    expect(fmtChange(75, 'run')).toBe('+1:15');
  });
});
