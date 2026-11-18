/**
 * A pinned LT1/LT2 is typed in the athlete's units and stored in the test's.
 * Saving used to skip the conversion, so an imperial runner's 7:30/mile was
 * stored as 7:30/km.
 */
import { parseLtInput, paceSecondsToDisplaySeconds, displaySecondsToPaceSeconds } from './ltOverrideInput';

const CASES = [
  ['metric run, stored per km', { isSwimming: false, unitSystem: 'metric', testRunPerMileStorage: false }],
  ['imperial display, stored per km', { isSwimming: false, unitSystem: 'imperial', testRunPerMileStorage: false }],
  ['metric display, stored per mile', { isSwimming: false, unitSystem: 'metric', testRunPerMileStorage: true }],
  ['imperial run, stored per mile', { isSwimming: false, unitSystem: 'imperial', testRunPerMileStorage: true }],
  ['swim, /100 m', { isSwimming: true, unitSystem: 'metric' }],
  ['swim, /100 yd', { isSwimming: true, unitSystem: 'imperial' }],
];

describe('manual threshold input', () => {
  it('reads mm:ss, plain numbers and decimal commas', () => {
    expect(parseLtInput('05:08')).toBe(308);
    expect(parseLtInput('4:31')).toBe(271);
    expect(parseLtInput('285')).toBe(285);
    expect(parseLtInput('1,5')).toBe(1.5);
    expect(parseLtInput('')).toBeNull();
    expect(parseLtInput('abc')).toBeNull();
  });

  it.each(CASES)('%s: what is typed is what comes back on screen', (_, opts) => {
    const stored = displaySecondsToPaceSeconds(308, opts);
    expect(paceSecondsToDisplaySeconds(stored, opts)).toBeCloseTo(308, 9);
  });

  it('stores 7:30/mile as ~4:40/km on a test saved per km', () => {
    const opts = { isSwimming: false, unitSystem: 'imperial', testRunPerMileStorage: false };
    expect(displaySecondsToPaceSeconds(450, opts)).toBeCloseTo(279.6, 1);
  });
});
