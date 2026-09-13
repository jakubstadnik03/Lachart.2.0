/**
 * From a typed session to the steps the builder edits.
 */
import { materializeParsedWorkout, expandSteps } from './WorkoutBuilder';
import { parseWorkoutText } from '../../utils/workoutText';

const ids = () => { let n = 0; return () => `id-${++n}`; };

describe('materializeParsedWorkout', () => {
  it('turns the whiteboard line into a warm-up ramp, a repeat block and a cool-down', () => {
    const { items } = parseWorkoutText('5x3min build, 5min easy, 4x10min LT2 2min rec, 10min CD');
    const steps = materializeParsedWorkout(items, { context: { ftp: 300, lt1Power: 225, lt2Power: 300 }, nextId: ids() });
    // 5 ramp steps + easy + (work, rec) + cooldown
    expect(steps).toHaveLength(9);
    const ramp = steps.slice(0, 5);
    expect(ramp[0].isGroupHeader).toBe(true);
    expect(ramp[0].rampSpec).toMatchObject({ count: 5, durationSeconds: 180 });
    expect(ramp.every((s) => s.groupId === ramp[0].groupId && s.stepType === 'warmup' && s.durationSeconds === 180)).toBe(true);
    expect(ramp[4].powerTarget.value).toBeGreaterThan(ramp[0].powerTarget.value);
    const block = steps.slice(6, 8);
    expect(block[0]).toMatchObject({ stepType: 'work', durationSeconds: 600, powerTarget: { type: 'lt2' }, isGroupHeader: true, groupRepeat: 4 });
    expect(block[1]).toMatchObject({ stepType: 'recovery', durationSeconds: 120, groupId: block[0].groupId });
    expect(block[1].isGroupHeader).toBeUndefined();
    expect(steps[8]).toMatchObject({ stepType: 'cooldown', durationSeconds: 600 });
    // The builder counts it as 15 + 5 + 4×12 + 10 = 78 minutes.
    expect(expandSteps(steps).reduce((a, s) => a + s.durationSeconds, 0)).toBe(78 * 60);
  });

  it('gives a distance step the time it would take', () => {
    const { items } = parseWorkoutText('400m easy');
    const [step] = materializeParsedWorkout(items, { context: {}, nextId: ids() });
    expect(step.durationType).toBe('distance');
    expect(step.distanceMeters).toBe(400);
    expect(step.durationSeconds).toBeGreaterThan(0);
  });
});
