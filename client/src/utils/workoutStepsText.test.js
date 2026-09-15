import { stepsToLines, fmtStepSize } from './workoutStepsText';

const step = (stepType, durationSeconds, powerTarget, extra = {}) => ({ clientId: `${stepType}-${durationSeconds}`, stepType, durationSeconds, powerTarget, ...extra });

describe('stepsToLines', () => {
  it('reads a session the way a coach says it, repeats folded', () => {
    const steps = [
      step('warmup', 900, { type: 'zone', value: 1 }),
      step('work', 480, { type: 'lt2' }, { groupId: 'g1', isGroupHeader: true, groupRepeat: 5 }),
      step('recovery', 240, { type: 'zone', value: 1 }, { groupId: 'g1' }),
      step('cooldown', 600, { type: 'zone', value: 1 }),
    ];
    expect(stepsToLines(steps).map((l) => l.text)).toEqual([
      '15:00 warm-up Z1',
      '5 × (8:00 work LT2 + 4:00 recovery Z1)',
      '10:00 cool-down Z1',
    ]);
  });

  it('shows distance steps in metres or kilometres and open targets without one', () => {
    expect(fmtStepSize({ durationType: 'distance', distanceMeters: 400 })).toBe('400 m');
    expect(fmtStepSize({ durationType: 'distance', distanceMeters: 1500 })).toBe('1.5 km');
    expect(fmtStepSize({ durationSeconds: 3900 })).toBe('1:05:00');
    expect(stepsToLines([step('rest', 30, { type: 'open' })])[0].text).toBe('0:30 rest');
  });

  it('folds a stepped warm-up into one line and does not repeat a target the label names', () => {
    const ramp = [1, 2, 2, 3].map((z, i) => step('warmup', 300, { type: 'zone', value: z }, { clientId: `w${i}`, blockId: 'b1', blockKind: 'warmup' }));
    const lines = stepsToLines([...ramp, step('work', 300, { type: 'zone', value: 1 }, { label: 'Easy Z1' })]).map((l) => l.text);
    expect(lines).toEqual(['20:00 warm-up Z1 → Z3 (4 steps)', '5:00 Easy Z1']);
  });

  it('is empty for nothing', () => {
    expect(stepsToLines(null)).toEqual([]);
    expect(stepsToLines([])).toEqual([]);
  });
});
