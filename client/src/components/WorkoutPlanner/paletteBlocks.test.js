import { buildPaletteSteps } from './WorkoutBuilder';
import { expandSteps, computeEstTSS } from './WorkoutBuilder';

/**
 * The palette must produce steps in the model everything downstream already
 * reads — WorkoutExecutionPage runs them, the .zwo / .tcx exports write them.
 * A block that looked right but carried a new shape of step would break those
 * quietly, so what is pinned here is the shape, not the picture.
 */
describe('buildPaletteSteps', () => {
  test('a warm-up arrives as four steps, not one bar to split', () => {
    expect(buildPaletteSteps('warmup')).toHaveLength(4);
  });

  test('the step count can be asked for', () => {
    expect(buildPaletteSteps('warmup', 'bike', 6)).toHaveLength(6);
    expect(buildPaletteSteps('rampup', 'bike', 2)).toHaveLength(2);
  });

  test('every step carries which block it came from', () => {
    const steps = buildPaletteSteps('rampup');
    const ids = new Set(steps.map((s) => s.blockId));
    expect(ids.size).toBe(1);
    expect(steps.every((s) => s.blockKind === 'rampup')).toBe(true);
  });

  test('every palette block produces steps', () => {
    ['warmup', 'steady', 'intervals', 'rampup', 'rampdown', 'cooldown'].forEach((key) => {
      expect(buildPaletteSteps(key).length).toBeGreaterThan(0);
    });
  });

  test('an unknown key produces nothing rather than a broken step', () => {
    expect(buildPaletteSteps('nope')).toEqual([]);
  });

  test('every step has the fields the builder and the exports need', () => {
    ['warmup', 'steady', 'intervals', 'rampup', 'rampdown', 'cooldown'].forEach((key) => {
      buildPaletteSteps(key).forEach((s) => {
        expect(typeof s.clientId).toBe('string');
        expect(typeof s.stepType).toBe('string');
        expect(s.durationSeconds).toBeGreaterThan(0);
        expect(s.powerTarget).toBeTruthy();
      });
    });
  });

  test('client ids are unique — React keys and reorder ids depend on it', () => {
    const all = ['warmup', 'steady', 'intervals', 'rampup', 'rampdown', 'cooldown']
      .flatMap((k) => buildPaletteSteps(k))
      .map((s) => s.clientId);
    expect(new Set(all).size).toBe(all.length);
  });

  test('a ramp climbs and its mirror descends', () => {
    const up = buildPaletteSteps('rampup').map((s) => s.powerTarget.value);
    expect(up).toEqual([...up].sort((a, b) => a - b));
    const down = buildPaletteSteps('rampdown').map((s) => s.powerTarget.value);
    expect(down).toEqual([...down].sort((a, b) => b - a));
  });

  test('intervals build one repeat group, not loose steps', () => {
    const steps = buildPaletteSteps('intervals');
    const gids = new Set(steps.map((s) => s.groupId));
    expect(gids.size).toBe(1);
    expect([...gids][0]).toBeTruthy();

    const headers = steps.filter((s) => s.isGroupHeader);
    expect(headers).toHaveLength(1);
    expect(headers[0].groupRepeat).toBeGreaterThan(1);
  });

  test('the repeat group actually repeats when expanded', () => {
    const steps = buildPaletteSteps('intervals');
    const reps = steps.find((s) => s.isGroupHeader).groupRepeat;
    expect(expandSteps(steps)).toHaveLength(steps.length * reps);
  });

  test('a built block costs TSS rather than returning NaN', () => {
    const ctx = { ftp: 300, lt1Power: 240, lt2Power: 300 };
    const tss = computeEstTSS(buildPaletteSteps('intervals'), ctx);
    expect(Number.isFinite(tss)).toBe(true);
    expect(tss).toBeGreaterThan(0);
  });
});
