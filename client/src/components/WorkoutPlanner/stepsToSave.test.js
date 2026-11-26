/**
 * "Plan it" pressed on a fresh session with the builder open saved
 * `steps: []`, although the chart above the button showed 15 min Z1,
 * 4×10 min LT2 and 10 min Z1 — the composer's pre-filled draft, which only
 * became steps after "Build steps". The athlete got an empty session.
 */
import { stepsToSave, plannedTotals } from './plannedTotals';
import { recipeToItems, materializeParsedWorkout } from './WorkoutBuilder';

const CTX = { sport: 'bike', lt1Power: 318, lt2Power: 402, ftp: 402 };

const DEFAULT_RECIPE = {
  warm: { on: true, qty: 15, unit: 'min', target: 'zone1', build: false, buildTo: 'zone3' },
  sets: [{ reps: 4, qty: 10, unit: 'min', target: 'lt2', recQty: 2, recUnit: 'min', recTarget: 'zone1' }],
  cool: { on: true, qty: 10, unit: 'min', target: 'zone1' },
};

const draft = () => {
  let n = 0;
  return materializeParsedWorkout(recipeToItems(DEFAULT_RECIPE), { context: CTX, nextId: () => `d${n += 1}` });
};

describe('what "Plan it" saves', () => {
  test('nothing built, draft on the chart: the draft is saved', () => {
    const d = draft();
    expect(d.length).toBeGreaterThan(0);
    expect(stepsToSave({ builderOpen: true, steps: [], draft: d })).toBe(d);
  });

  test('the saved draft carries the duration and TSS the chart implied', () => {
    const saved = stepsToSave({ builderOpen: true, steps: [], draft: draft() });
    const totals = plannedTotals({ steps: saved, context: CTX, sport: 'bike' });
    expect(totals.fromSteps).toBe(true);
    // 15 + 4×10 + 3×2 (recoveries between reps) + 10 — at least the 65 min of
    // blocks the chart drew; never the empty session that was saved before.
    expect(totals.durationSecs).toBeGreaterThanOrEqual(65 * 60);
    expect(totals.tss).toBeGreaterThan(0);
  });

  test('steps already built: an extra draft is not appended', () => {
    const built = [{ clientId: 'a', stepType: 'work', durationSeconds: 600, powerTarget: 300 }];
    expect(stepsToSave({ builderOpen: true, steps: built, draft: draft() })).toBe(built);
  });

  test('builder closed ("Remove structure"): nothing structured is saved', () => {
    expect(stepsToSave({ builderOpen: false, steps: [], draft: draft() })).toEqual([]);
  });

  test('no draft: the built steps are saved as they are', () => {
    expect(stepsToSave({ builderOpen: true, steps: [], draft: null })).toEqual([]);
    expect(stepsToSave({ builderOpen: true, steps: undefined, draft: [] })).toEqual([]);
  });
});
