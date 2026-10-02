/**
 * A run warm-up written as "3 km building to LT2".
 *
 * It came back as five steps of 151 seconds at 150–250 WATTS: the kilometres
 * thrown away for an estimated duration, and a power target on a sport nobody
 * measures in watts. Both because the ramp interpolated watts whatever the
 * sport and the distance was converted on the way in.
 */
import { materializeParsedWorkout, recipeToItems, buildRampSteps, addStepAfter, targetTypesFor } from './WorkoutBuilder';

// LT1 3:58/km, LT2 3:20/km — the profile the screenshots came from.
const RUN = {
  sport: 'run',
  runningZones: {
    lt1: 238, lt2: 200,
    zone1: { min: 476, max: 264 }, zone2: { min: 264, max: 238 },
    zone3: { min: 238, max: 200 }, zone4: { min: 200, max: 192 }, zone5: { min: 192, max: 154 },
  },
  ftp: 250,
};
const BIKE = { sport: 'bike', ftp: 250, lt1Power: 190, lt2Power: 250 };
const build = (ctx) => materializeParsedWorkout(
  recipeToItems({
    warm: { on: true, qty: 3, unit: 'km', build: true, buildTo: 'lt2' },
    sets: [{ reps: 10, qty: 800, unit: 'm', target: 'lt2', recQty: 1, recUnit: 'min', recTarget: 'zone1' }],
    cool: { on: false },
  }),
  { context: ctx, nextId: () => `s${Math.random()}` },
);

describe('a run warm-up written in kilometres', () => {
  const steps = build(RUN);
  const warm = steps.filter((s) => s.stepType === 'warmup');

  it('stays in kilometres', () => {
    expect(warm.every((s) => s.durationType === 'distance')).toBe(true);
    expect(warm.reduce((a, s) => a + s.distanceMeters, 0)).toBe(3000);
  });

  it('is targeted in pace, not watts', () => {
    expect(warm.every((s) => s.powerTarget.type === 'pace')).toBe(true);
  });

  it('ramps up to the threshold it was pointed at', () => {
    // LT2 is 200 s/km. The last step of the build is the one that reaches it.
    expect(warm[warm.length - 1].powerTarget.value).toBe(200);
    expect(warm[0].powerTarget.value).toBeGreaterThan(warm[warm.length - 1].powerTarget.value);
  });

  it('leaves the main set alone — 800 m at LT2 is 3:20', () => {
    const work = steps.find((s) => s.stepType === 'work');
    expect(work.distanceMeters).toBe(800);
    expect(work.durationSeconds).toBe(160);
    expect(work.powerTarget).toEqual({ type: 'lt2' });
  });
});

describe('the bike is untouched', () => {
  it('still ramps in watts', () => {
    const warm = build(BIKE).filter((s) => s.stepType === 'warmup');
    expect(warm.every((s) => s.powerTarget.type === 'watts')).toBe(true);
  });

  it('still measures a time ramp in seconds', () => {
    const steps = buildRampSteps(
      { rampType: 'warmup', count: 4, durationSeconds: 180, from: { type: 'zone', value: 1 }, to: { type: 'lt2' } },
      BIKE,
    );
    expect(steps.every((s) => s.durationSeconds === 180)).toBe(true);
  });
});

describe('the exact-value target follows the sport', () => {
  it('offers pace to a runner and watts to a rider', () => {
    const keys = (sport) => targetTypesFor(sport).map((t) => t.value);
    expect(keys('run')).toContain('pace');
    expect(keys('run')).not.toContain('watts');
    expect(keys('bike')).toContain('watts');
    expect(keys('bike')).not.toContain('pace');
  });
});

describe('add after', () => {
  const list = [
    { clientId: 'a', stepType: 'work', durationType: 'distance', distanceMeters: 800, powerTarget: { type: 'lt2' }, notes: 'hard' },
  ];

  it('starts blank rather than carrying the interval it followed', () => {
    const next = addStepAfter(list, 0, () => 'b');
    expect(next).toHaveLength(2);
    expect(next[1].notes).toBeUndefined();
    expect(next[1].stepType).toBe('recovery');
  });

  it('keeps the neighbour’s units so the next thing typed is a number', () => {
    expect(addStepAfter(list, 0, () => 'b')[1].durationType).toBe('distance');
    const timed = [{ clientId: 'a', stepType: 'work', durationSeconds: 300, powerTarget: { type: 'lt2' } }];
    expect(addStepAfter(timed, 0, () => 'b')[1].durationSeconds).toBe(300);
  });

  it('stays inside the repeat block it was added in', () => {
    const grouped = [{ clientId: 'a', stepType: 'work', durationSeconds: 60, groupId: 'g1', powerTarget: {} }];
    expect(addStepAfter(grouped, 0, () => 'b')[1].groupId).toBe('g1');
  });
});
