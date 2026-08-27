import { buildRampSteps, rampSpecOf } from './WorkoutBuilder';

/**
 * A progressive ramp is four numbers — start, end, how many steps, how long
 * each — but it used to be stored as N independent steps with the watts baked
 * in and no memory of where they came from. Changing "start at Z1" or "make it
 * six" meant editing every step and redoing the interpolation by hand.
 */
const ctx = { ftp: 300, lt1Power: 220, lt2Power: 300 };

const spec = (extra = {}) => ({
  rampType: 'warmup',
  count: 4,
  durationSeconds: 180,
  from: { type: 'watts', value: 100 },
  to: { type: 'watts', value: 250 },
  ...extra,
});

const watts = (steps) => steps.map((s) => s.powerTarget.value);

describe('buildRampSteps', () => {
  it('spreads the watts evenly from start to end, endpoints included', () => {
    expect(watts(buildRampSteps(spec(), ctx))).toEqual([100, 150, 200, 250]);
  });

  it('runs the same line backwards for a cool-down', () => {
    expect(watts(buildRampSteps(spec({ rampType: 'cooldown' }), ctx))).toEqual([250, 200, 150, 100]);
  });

  it('re-interpolates when the step count changes, rather than repeating', () => {
    expect(watts(buildRampSteps(spec({ count: 6 }), ctx))).toEqual([100, 130, 160, 190, 220, 250]);
  });

  it('resolves zones and thresholds, not just raw watts', () => {
    const s = buildRampSteps(spec({ from: { type: 'zone', value: 1 }, to: { type: 'lt2' } }), ctx);
    expect(s[0].powerTarget.value).toBeLessThan(s[3].powerTarget.value);
    expect(s[3].powerTarget.value).toBe(300);   // lt2Power
  });

  it('carries the step type through, so the chart colours it right', () => {
    expect(buildRampSteps(spec({ rampType: 'cooldown' }), ctx).every((s) => s.stepType === 'cooldown')).toBe(true);
  });

  it('gives every step the same duration', () => {
    expect(buildRampSteps(spec({ durationSeconds: 240 }), ctx).every((s) => s.durationSeconds === 240)).toBe(true);
  });

  it('clamps a silly step count instead of producing a silly ramp', () => {
    expect(buildRampSteps(spec({ count: 1 }), ctx)).toHaveLength(2);
    expect(buildRampSteps(spec({ count: 99 }), ctx)).toHaveLength(12);
  });

  it('produces nothing without a duration or endpoints', () => {
    expect(buildRampSteps(spec({ durationSeconds: 0 }), ctx)).toEqual([]);
    expect(buildRampSteps({ ...spec(), from: null }, ctx)).toEqual([]);
    expect(buildRampSteps(null, ctx)).toEqual([]);
  });
});

describe('rampSpecOf', () => {
  /** What the builder stores: the spec on the header, the steps derived. */
  const materialise = (sp) => {
    const built = buildRampSteps(sp, ctx);
    return built.map((s, i) => ({ ...s, clientId: `r${i}`, groupId: 'g1', ...(i === 0 ? { isGroupHeader: true, rampSpec: sp } : {}) }));
  };

  it('recognises a block that still matches its description', () => {
    expect(rampSpecOf(materialise(spec()), ctx)).toMatchObject({ count: 4, rampType: 'warmup' });
  });

  it('reads the count off the block, so adding a step is not a mismatch', () => {
    const six = materialise(spec({ count: 6 }));
    // The stored spec still says 4; the block is the truth.
    six[0].rampSpec = spec({ count: 4 });
    expect(rampSpecOf(six, ctx)).toMatchObject({ count: 6 });
  });

  it('lets go once a step has been edited by hand', () => {
    const members = materialise(spec());
    members[2].powerTarget = { type: 'watts', value: 999 };
    expect(rampSpecOf(members, ctx)).toBeNull();
  });

  it('lets go when a duration has been edited by hand', () => {
    const members = materialise(spec());
    members[1].durationSeconds = 600;
    expect(rampSpecOf(members, ctx)).toBeNull();
  });

  it('lets go when a step has been re-aimed at a zone', () => {
    const members = materialise(spec());
    members[1].powerTarget = { type: 'zone', value: 3 };
    expect(rampSpecOf(members, ctx)).toBeNull();
  });

  it('tolerates a watt of rounding', () => {
    const members = materialise(spec());
    members[1].powerTarget = { ...members[1].powerTarget, value: members[1].powerTarget.value + 1 };
    expect(rampSpecOf(members, ctx)).not.toBeNull();
  });

  it('says nothing about a block that was never a ramp', () => {
    expect(rampSpecOf([{ clientId: 'a', groupId: 'g1', isGroupHeader: true }], ctx)).toBeNull();
    expect(rampSpecOf([], ctx)).toBeNull();
    expect(rampSpecOf(null, ctx)).toBeNull();
  });
});
