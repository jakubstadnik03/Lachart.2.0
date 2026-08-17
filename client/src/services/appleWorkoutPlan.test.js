/**
 * Payload-shape tests for the Apple Watch (WorkoutKit) bridge.
 *
 * These cover the parts that cannot be checked on a device without a long
 * manual loop: how LaChart repeat groups become IntervalBlocks, how warmup /
 * cooldown are lifted into their dedicated CustomWorkout slots, and how power
 * targets resolve to alert ranges.
 */
jest.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
  registerPlugin: () => ({}),
}));

const {
  buildWorkoutPlanPayload,
  planIdForWorkout,
  scheduleDateIso,
  plannedLocalDayKey,
} = require('./appleWorkoutPlan');

const CTX = { ftp: 300, lt1Power: 225, lt2Power: 300 };

const workout = (steps) => ({ _id: '507f1f77bcf86cd799439011', title: 'T', sport: 'bike', steps });

describe('buildWorkoutPlanPayload', () => {
  it('turns a repeat group into ONE block with native iterations', () => {
    const p = buildWorkoutPlanPayload(workout([
      { stepType: 'warmup', durationSeconds: 600, powerTarget: { type: 'percent_ftp', value: 60 } },
      { groupId: 'G', isGroupHeader: true, groupRepeat: 5, stepType: 'work', durationSeconds: 480, powerTarget: { type: 'percent_ftp', useRange: true, rangeMin: 88, rangeMax: 94 } },
      { groupId: 'G', stepType: 'recovery', durationSeconds: 120, powerTarget: { type: 'zone', value: 1 } },
      { stepType: 'cooldown', durationSeconds: 300, powerTarget: { type: 'percent_ftp', value: 55 } },
    ]), CTX);

    expect(p.warmup).toBeTruthy();
    expect(p.cooldown).toBeTruthy();
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].iterations).toBe(5);
    expect(p.blocks[0].steps).toHaveLength(2);
    expect(p.blocks[0].steps.map((s) => s.purpose)).toEqual(['work', 'recovery']);
  });

  it('resolves a percent-FTP range to an absolute watt range', () => {
    const p = buildWorkoutPlanPayload(workout([
      { groupId: 'G', isGroupHeader: true, groupRepeat: 2, stepType: 'work', durationSeconds: 480, powerTarget: { type: 'percent_ftp', useRange: true, rangeMin: 88, rangeMax: 94 } },
    ]), CTX);
    // 88–94 % of 300 W
    expect(p.blocks[0].steps[0].alert).toEqual({ metric: 'power', low: 264, high: 282 });
  });

  it('does not let an ungrouped step get absorbed into a repeat block', () => {
    const p = buildWorkoutPlanPayload(workout([
      { groupId: 'G', isGroupHeader: true, groupRepeat: 1, stepType: 'work', durationSeconds: 60 },
      { stepType: 'work', durationSeconds: 90 },
    ]), CTX);
    expect(p.blocks).toHaveLength(2);
    expect(p.blocks[0].steps).toHaveLength(1);
    expect(p.blocks[1].steps).toHaveLength(1);
  });

  it('never returns zero blocks when the workout is only a warmup', () => {
    const p = buildWorkoutPlanPayload(workout([
      { stepType: 'warmup', durationSeconds: 600 },
    ]), CTX);
    expect(p.blocks.length).toBeGreaterThan(0);
  });

  it('collapses consecutive ungrouped steps into one block', () => {
    const p = buildWorkoutPlanPayload(workout([
      { stepType: 'work', durationSeconds: 60 },
      { stepType: 'work', durationSeconds: 60 },
      { stepType: 'work', durationSeconds: 60 },
    ]), CTX);
    expect(p.blocks).toHaveLength(1);
    expect(p.blocks[0].steps).toHaveLength(3);
    expect(p.blocks[0].iterations).toBe(1);
  });
});

describe('planIdForWorkout', () => {
  it('is a stable UUID derived from the workout id', () => {
    const id = planIdForWorkout({ _id: '507f1f77bcf86cd799439011' });
    expect(id).toBe('507f1f77-bcf8-6cd7-9943-901100000000');
    expect(planIdForWorkout({ _id: '507f1f77bcf86cd799439011' })).toBe(id);
  });

  it('differs between workouts', () => {
    expect(planIdForWorkout({ _id: '507f1f77bcf86cd799439011' }))
      .not.toBe(planIdForWorkout({ _id: '507f1f77bcf86cd799439012' }));
  });
});

describe('scheduleDateIso', () => {
  const now = new Date('2026-08-09T12:00:00');

  it('refuses a slot in the past', () => {
    expect(scheduleDateIso({ date: '2026-08-08T07:00:00' }, now)).toBeNull();
  });

  // The calendar sends "YYYY-MM-DD", which Mongo stores as UTC midnight.
  // Reading that with local getters put the workout on the wrong day for any
  // athlete west of UTC, and skipped the 07:00 default for anyone east of it.
  it('treats a UTC-midnight (date-only) entry as local 07:00 on the intended day', () => {
    const d = new Date(scheduleDateIso({ date: '2026-08-11T00:00:00.000Z' }, now));
    expect(d.getHours()).toBe(7);
    expect(d.getDate()).toBe(11);
    expect(d.getMonth()).toBe(7); // August
  });

  it('keeps the local calendar day regardless of the runner timezone', () => {
    const iso = scheduleDateIso({ date: '2026-08-11T00:00:00.000Z' }, now);
    expect(plannedLocalDayKey({ date: '2026-08-11T00:00:00.000Z' })).toBe('2026-08-11');
    expect(new Date(iso).getDate()).toBe(11);
  });

  it('keeps an explicitly planned time as-is', () => {
    const iso = scheduleDateIso({ date: new Date('2026-08-11T17:30:00') }, now);
    expect(new Date(iso).getHours()).toBe(17);
    expect(new Date(iso).getMinutes()).toBe(30);
  });
});

describe('resolvePowerRange via buildWorkoutPlanPayload', () => {
  it('does not halve a half-filled percent range', () => {
    const p = buildWorkoutPlanPayload(workout([
      { stepType: 'work', durationSeconds: 300, powerTarget: { type: 'percent_ftp', useRange: true, rangeMin: 90 } },
    ]), CTX);
    // 90 % of 300 W = 270 W, ±5 %. The old midpoint maths gave 45 % → 135 W.
    expect(p.blocks[0].steps[0].alert.low).toBeGreaterThan(250);
  });

  it('does not put a cycling-derived watts alert on a run', () => {
    const p = buildWorkoutPlanPayload({
      _id: '507f1f77bcf86cd799439011', title: 'R', sport: 'run',
      steps: [{ stepType: 'work', durationSeconds: 300, powerTarget: { type: 'percent_ftp', value: 90 } }],
    }, CTX);
    expect(p.blocks[0].steps[0].alert).toBeNull();
  });

  it('keeps absolute watts on a non-bike sport', () => {
    const p = buildWorkoutPlanPayload({
      _id: '507f1f77bcf86cd799439011', title: 'Row', sport: 'rowing',
      steps: [{ stepType: 'work', durationSeconds: 300, powerTarget: { type: 'watts', value: 200 } }],
    }, CTX);
    expect(p.blocks[0].steps[0].alert).toEqual({ metric: 'power', low: 190, high: 210 });
  });
});
