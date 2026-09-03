import { resolveActivityTss, estimateTssFromDuration, tssModeLabel } from './computeTss';

// A pool swim off a watch with no strap: an hour, 3.5 km, and no channel the
// load model can read. It was landing in the calendar as zero.
const POOL_SWIM = { sport: 'Swim', totalElapsedTime: 3600, distance: 3500 };

describe('TSS when nothing measured the session', () => {
  it('still gives an hour in the pool a load', () => {
    expect(resolveActivityTss(POOL_SWIM, {})).toBe(40);
  });

  it('gives it to an athlete with zones as readily as one without', () => {
    // Cycling zones do nothing for a swim, and gating the estimate on
    // "thresholds were inferred" meant the athletes with the most set up were
    // the ones whose odd sessions vanished.
    const profile = { powerZones: { cycling: { lt2: 300 } } };
    expect(resolveActivityTss(POOL_SWIM, profile)).toBe(40);
  });

  it('scales with duration', () => {
    expect(estimateTssFromDuration({ sport: 'Ride', totalElapsedTime: 7200 })).toBe(80);
    expect(estimateTssFromDuration({ sport: 'Run', totalElapsedTime: 1800 })).toBe(20);
  });

  it('leaves a short session alone', () => {
    // Twenty minutes is the floor; a ten-minute walk is not training load.
    expect(estimateTssFromDuration({ sport: 'Walk', totalElapsedTime: 600 })).toBe(0);
    expect(estimateTssFromDuration({ sport: 'Swim', totalElapsedTime: 1200 })).toBe(13);
  });

  it('leaves anything that is not an endurance sport alone', () => {
    expect(estimateTssFromDuration({ sport: 'Yoga', totalElapsedTime: 3600 })).toBe(0);
    expect(estimateTssFromDuration({ sport: 'WeightTraining', totalElapsedTime: 3600 })).toBe(0);
  });

  it('never outranks something that was actually measured', () => {
    const profile = { powerZones: { cycling: { lt2: 300 } } };
    const ride = { sport: 'Ride', totalElapsedTime: 3600, average_watts: 300 };
    // An hour at threshold is 100, not the 40 the estimate would have given.
    expect(resolveActivityTss(ride, profile)).toBe(100);
  });

  it('does not outrank a number the athlete typed in', () => {
    const manual = { ...POOL_SWIM, manualTss: 65, tssDisplayMode: 'manual' };
    expect(resolveActivityTss(manual, {})).toBe(65);
  });

  it('says the number is an estimate rather than the file talking', () => {
    expect(tssModeLabel('manual', { activity: POOL_SWIM, isSwim: true })).toBe('TSS (est.)');
    expect(tssModeLabel('manual', { activity: { ...POOL_SWIM, manualTss: 65 } })).toBe('TSS (manual)');
  });
});
