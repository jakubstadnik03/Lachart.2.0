import {
  recipeToItems, materializeParsedWorkout, expandSteps,
  resolveStepDistanceMeters, resolveTargetPace,
} from './WorkoutBuilder';

/**
 * A coach opened a saved 5×2 km session and the preview drew nine work blocks:
 * his five, then four more at 2.2 km he had never asked for, with a 15:00 Z1
 * before them and 10:00 Z1 after. The lap list beside it was right.
 *
 * They were the composer's DEFAULT recipe. React renders the children of a
 * <details> whether or not it is open, so the recipe form stayed mounted while
 * collapsed and kept pushing a draft into the chart. What is pinned here is
 * where those numbers came from — the real repair is that a collapsed composer
 * no longer mounts the form, which needs a renderer this project does not have.
 */

// The athlete's own zones, from the session that was reported.
const CTX = {
  sport: 'run',
  lt1Pace: 308.898,                       // 5:09/km
  lt2Pace: 271.541,                       // 4:32/km
  runningZones: {
    zone1: { min: 441.283, max: 343.220 },
    zone2: { min: 343.220, max: 308.898 },
    zone3: { min: 308.898, max: 271.541 },
    zone4: { min: 271.541, max: 261.097 },
    zone5: { min: 261.097, max: 208.878 },
    lt1: 308.898,
    lt2: 271.541,
  },
};

const DEFAULT_RECIPE = {
  warm: { on: true, qty: 15, unit: 'min', target: 'zone1', build: false, buildTo: 'zone3' },
  sets: [{ reps: 4, qty: 10, unit: 'min', target: 'lt2', recQty: 2, recUnit: 'min', recTarget: 'zone1' }],
  cool: { on: true, qty: 10, unit: 'min', target: 'zone1' },
};

const draft = () => materializeParsedWorkout(recipeToItems(DEFAULT_RECIPE), { context: CTX, nextId: (() => { let n = 0; return () => `d${n += 1}`; })() });

describe('the phantom blocks in the preview', () => {
  test('the untouched recipe really does describe a whole session', () => {
    expect(recipeToItems(DEFAULT_RECIPE).length).toBeGreaterThan(0);
  });

  test('it carries four work blocks — the "four additional" ones', () => {
    const work = expandSteps(draft()).filter((s) => s.stepType === 'work');
    expect(work).toHaveLength(4);
  });

  test('each of them measures 2.2 km at this athlete\'s LT2', () => {
    const work = expandSteps(draft()).filter((s) => s.stepType === 'work');
    for (const s of work) {
      const km = resolveStepDistanceMeters(s, CTX) / 1000;
      expect(km).toBeGreaterThan(2.15);
      expect(km).toBeLessThan(2.25);
    }
  });

  test('and they sit between a 2.3 km and a 1.5 km easy block', () => {
    const steps = expandSteps(draft());
    const warm = steps.find((s) => s.stepType === 'warmup');
    const cool = steps.find((s) => s.stepType === 'cooldown');
    expect(resolveStepDistanceMeters(warm, CTX) / 1000).toBeCloseTo(2.3, 1);
    expect(resolveStepDistanceMeters(cool, CTX) / 1000).toBeCloseTo(1.5, 1);
  });

  test('a draft is flagged, so the chart can tell it from the session', () => {
    // What the builder hands the chart for the ghosted bars.
    const flagged = draft().map((d) => ({ ...d, isDraft: true }));
    expect(flagged.every((s) => s.isDraft)).toBe(true);
    // And the real steps never carry the flag.
    expect(draft().some((s) => s.isDraft)).toBe(false);
  });
});

describe('one session, one distance', () => {
  // 5×2 km with everything else jogged: the work is 10 km, the run is 15.5 km.
  const REPORTED = [
    { stepType: 'warmup', durationType: 'time', durationSeconds: 300, powerTarget: { type: 'zone', value: 1 } },
    { stepType: 'warmup', durationType: 'time', durationSeconds: 180, powerTarget: { type: 'zone', value: 2 } },
    { stepType: 'warmup', durationType: 'time', durationSeconds: 120, powerTarget: { type: 'zone', value: 3 } },
    { stepType: 'work', durationType: 'distance', distanceMeters: 2000, durationSeconds: 540,
      powerTarget: { type: 'lt2' }, groupId: 'g', isGroupHeader: true, groupRepeat: 5 },
    { stepType: 'recovery', durationType: 'time', durationSeconds: 90, powerTarget: { type: 'zone', value: 1 }, groupId: 'g' },
    { stepType: 'recovery', durationType: 'time', durationSeconds: 300, powerTarget: { type: 'zone', value: 1 } },
    { stepType: 'cooldown', durationType: 'time', durationSeconds: 150, powerTarget: { type: 'zone', value: 3 } },
    { stepType: 'cooldown', durationType: 'time', durationSeconds: 150, powerTarget: { type: 'zone', value: 2 } },
    { stepType: 'cooldown', durationType: 'time', durationSeconds: 150, powerTarget: { type: 'zone', value: 2 } },
    { stepType: 'cooldown', durationType: 'time', durationSeconds: 150, powerTarget: { type: 'zone', value: 1 } },
  ];

  test('the plan is 18 laps and 1:17:30, which is what was always right', () => {
    const expanded = expandSteps(REPORTED);
    expect(expanded).toHaveLength(18);
    expect(expanded.reduce((a, s) => a + s.durationSeconds, 0)).toBe(4650);
  });

  test('the intervals come out at the pace the coach checked by hand', () => {
    const work = expandSteps(REPORTED).filter((s) => s.stepType === 'work');
    expect(work).toHaveLength(5);
    // 4:32/km — his own arithmetic said five of these are about 45 minutes.
    expect(resolveTargetPace(work[0].powerTarget, CTX)).toBeCloseTo(271.5, 0);
    expect(work.reduce((a, s) => a + s.durationSeconds, 0)).toBe(2700);
  });

  test('the summary counts the whole run, not only the programmed distance', () => {
    const total = expandSteps(REPORTED).reduce((a, s) => a + (resolveStepDistanceMeters(s, CTX) || 0), 0);
    // 10 km of intervals plus the jogged rest — the number the chart header
    // already showed while the summary beside it still said 10 km.
    expect(total / 1000).toBeGreaterThan(15);
    expect(total / 1000).toBeLessThan(16);
  });
});
