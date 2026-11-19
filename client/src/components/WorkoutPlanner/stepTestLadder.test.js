/**
 * "10min WU + 6x4min build 1min rec + 10min CD" came back as a 44-minute
 * session: the six stages had no pauses between them (the "1min rec" was
 * dropped by the parser) and were listed as "Warmup 1…6" in warm-up colours.
 * For a lactate step test the minute between stages is where the blood is
 * drawn, so it has to survive.
 */
import { parseWorkoutText } from '../../utils/workoutText';
import { materializeParsedWorkout, LACTATE_TEST_PROTOCOL_TEXT } from './WorkoutBuilder';
import { stepTotalSecs } from './plannedTotals';

const CTX = { sport: 'bike', lt1Power: 318, lt2Power: 402, ftp: 402 };
const ids = () => { let n = 0; return () => `s${n += 1}`; };
const build = (text, ctx = CTX) => materializeParsedWorkout(parseWorkoutText(text).items, { context: ctx, nextId: ids() });

describe('a build with a recovery is a step ladder', () => {
  test('the parser keeps the recovery on the build', () => {
    const { items } = parseWorkoutText('6x4min build 1min rec');
    expect(items).toHaveLength(1);
    expect(items[0].build.count).toBe(6);
    expect(items[0].build.rec).toMatchObject({ stepType: 'recovery', durationSeconds: 60 });
  });

  test('six stages with five pauses between them, not after the last', () => {
    const steps = build('6x4min build 1min rec');
    expect(steps.filter((s) => s.stepType === 'work')).toHaveLength(6);
    expect(steps.filter((s) => s.stepType === 'recovery')).toHaveLength(5);
    expect(steps[steps.length - 1].stepType).toBe('work');
  });

  test('the whole session is 10 + 6×4 + 5×1 + 10 = 49 minutes', () => {
    const steps = build('10min WU + 6x4min build 1min rec + 10min CD');
    expect(stepTotalSecs(steps)).toBe(49 * 60);
  });

  test('the stages are work stages, labelled as stages, and climb', () => {
    const work = build('6x4min build 1min rec').filter((s) => s.stepType === 'work');
    expect(work.map((s) => s.label)).toEqual(['Stage 1', 'Stage 2', 'Stage 3', 'Stage 4', 'Stage 5', 'Stage 6']);
    const watts = work.map((s) => s.powerTarget.value);
    for (let i = 1; i < watts.length; i += 1) expect(watts[i]).toBeGreaterThan(watts[i - 1]);
  });

  test('a plain build without a recovery is still a warm-up ramp', () => {
    const steps = build('15min build');
    expect(steps.every((s) => s.stepType === 'warmup')).toBe(true);
    expect(steps[0].rampSpec).toBeTruthy();
  });

  test('in a lactate test any build is a ladder of stages', () => {
    const steps = build('5x3min build', { ...CTX, sport: 'lactate' });
    expect(steps.every((s) => s.stepType === 'work')).toBe(true);
  });
});

describe('the default lactate test protocol', () => {
  test('parses without warnings into warm-up, six stages, five pauses and a cool-down', () => {
    const { warnings } = parseWorkoutText(LACTATE_TEST_PROTOCOL_TEXT);
    expect(warnings).toEqual([]);
    const steps = build(LACTATE_TEST_PROTOCOL_TEXT, { ...CTX, sport: 'lactate' });
    expect(steps[0].stepType).toBe('warmup');
    expect(steps[steps.length - 1].stepType).toBe('cooldown');
    expect(steps.filter((s) => s.stepType === 'work')).toHaveLength(6);
    expect(steps.filter((s) => s.stepType === 'recovery')).toHaveLength(5);
  });

  test('the last stage goes above LT2, as a test has to', () => {
    const work = build(LACTATE_TEST_PROTOCOL_TEXT, { ...CTX, sport: 'lactate' }).filter((s) => s.stepType === 'work');
    expect(work[work.length - 1].powerTarget.value).toBeGreaterThan(CTX.lt2Power);
  });
});
