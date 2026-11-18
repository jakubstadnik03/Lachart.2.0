/**
 * The thresholds engine, on the tests that shaped it.
 */
import {
  analyzeLactateTest, isotonic, monotoneCubic, firstCrossing, dmaxOnCurve,
  logLogBreakpoint, toIntensity, fromIntensity, dropOutOfOrderStages,
  shortenedLastLevel, withShortenedLastLevel, shortenedLevelNote,
} from './lactateThresholdEngine';

const mph = (secPerMile) => 3600 / secPerMile;
const runStages = (rows) => rows.map(([power, lactate, heartRate]) => ({ power, lactate, heartRate }));

describe('the curve', () => {
  it('pools a dip in the readings instead of reading a recovery into it', () => {
    // A runner's first five stages: 1.7, 1.0, 1.3, 1.4, 1.2 — one floor.
    expect(isotonic([1.7, 1.0, 1.3, 1.4, 1.2, 2.9, 3.2]).map((v) => Number(v.toFixed(2))))
      .toEqual([1.32, 1.32, 1.32, 1.32, 1.32, 2.9, 3.2]);
  });

  it('interpolates without overshooting between stages', () => {
    const f = monotoneCubic([100, 200, 300, 400], [1, 1.1, 2.5, 6]);
    for (let x = 100; x <= 400; x += 5) {
      expect(f(x)).toBeGreaterThanOrEqual(f(x - 5) - 1e-9);
      expect(f(x)).toBeLessThanOrEqual(6 + 1e-9);
    }
    expect(f(200)).toBeCloseTo(1.1, 6);
    expect(firstCrossing(f, 100, 400, 4)).toBeGreaterThan(300);
    expect(firstCrossing(f, 100, 400, 7)).toBeNull();
  });

  it('D-max finds the knee of a convex curve', () => {
    const f = monotoneCubic([100, 150, 200, 250, 300, 350], [1, 1, 1.1, 1.3, 2.4, 5]);
    const x = dmaxOnCurve(f, 100, 350);
    expect(x).toBeGreaterThan(240);
    expect(x).toBeLessThan(310);
  });

  it('log-log needs a knee that bends upward', () => {
    expect(logLogBreakpoint([100, 150, 200, 250, 300, 350], [1, 1, 1.1, 1.3, 2.4, 5])).toBeGreaterThan(200);
    expect(logLogBreakpoint([100, 150, 200], [1, 1.2, 1.4])).toBeNull();
  });

  it('pace becomes speed and back', () => {
    expect(toIntensity(300, 'run')).toBeGreaterThan(toIntensity(360, 'run'));
    expect(fromIntensity(toIntensity(312.5, 'swim'), 'swim')).toBeCloseTo(312.5, 9);
    expect(toIntensity(250, 'bike')).toBe(250);
  });

  it('drops a stage typed out of order', () => {
    const kept = dropOutOfOrderStages([{ u: 100 }, { u: 150 }, { u: 200 }, { u: 196 }, { u: 250 }, { u: 300 }]);
    expect(kept.map((s) => s.u)).toEqual([100, 150, 200, 250, 300]);
  });
});

describe('a runner whose lactate jumped in one stage', () => {
  // 4.5 → 8.5 mph on a treadmill, pace in s/mile; 1.2 at 6.5 mph, 2.9 at 7.0.
  const test = {
    sport: 'run', baseLactate: 1.3,
    stages: runStages([[800, 1.7, 112], [720, 1.0, 114], [654.5, 1.3, 120], [600, 1.4, 127], [553.8, 1.2, 134],
      [514.3, 2.9, 145], [480, 3.2, 149], [450, 4.8, 155], [423.5, 6.3, 159]]),
  };
  const r = analyzeLactateTest(test);

  it('puts LT1 where the floor ends and LT2 a mile an hour later — not both inside the jump', () => {
    expect(mph(r.lt1.value)).toBeGreaterThan(6.5);
    expect(mph(r.lt1.value)).toBeLessThan(6.8);
    expect(r.lt1.lactate).toBeGreaterThanOrEqual(1.4);
    expect(r.lt1.lactate).toBeLessThanOrEqual(1.8);
    expect(mph(r.lt2.value)).toBeGreaterThan(7.4);
    expect(mph(r.lt2.value)).toBeLessThan(7.8);
    expect(r.lt2.lactate).toBeGreaterThanOrEqual(3.0);
    expect(r.lt2.lactate).toBeLessThanOrEqual(3.6);
    expect(r.ratio).toBeGreaterThan(1.1);
  });

  it('says which methods agreed and how sure it is', () => {
    expect(r.lt2.voters).toEqual(expect.arrayContaining(['obla4', 'modifiedDmax', 'iat']));
    expect(r.lt2.fallback).toBeNull();
    expect(r.confidence).toBeGreaterThanOrEqual(60);
    expect(r.lt1.heartRate).toBeGreaterThan(130);
    expect(r.lt2.heartRate).toBeGreaterThan(r.lt1.heartRate);
  });
});

describe('a classic bike curve', () => {
  const r = analyzeLactateTest({
    sport: 'bike', baseLactate: 1.0,
    stages: runStages([[100, 1.0, 100], [150, 1.1, 115], [200, 1.3, 130], [250, 1.8, 145], [300, 2.6, 158], [350, 4.1, 168], [400, 7.0, 178]]),
  });
  it('reads LT1 around 2 mmol/L and LT2 around 4', () => {
    expect(r.lt1.value).toBeGreaterThan(240);
    expect(r.lt1.value).toBeLessThan(280);
    // Between IAT (LT1 + 1.5 → 3.5 mmol/L) and OBLA 4.0 — the methods agree
    // to within a stage, and the median sits between them.
    expect(r.lt2.value).toBeGreaterThan(315);
    expect(r.lt2.value).toBeLessThan(355);
    expect(r.lt2.lactate).toBeGreaterThan(3.0);
    expect(r.lt2.lactate).toBeLessThan(4.3);
    expect(r.confidence).toBeGreaterThanOrEqual(75);
  });
});

describe('a runner whose rest sample was cold', () => {
  // 1.5 at rest, then a steady 2.4 → 2.4 before the rise, and an all-out
  // last stage at 10.5 mmol/L (pace in s/mile).
  const rows = [['9:23', 150, 2.4], ['8:57', 153, 2.4], ['8:42', 158, 3.1], ['8:20', 163, 3.4], ['8:00', 164, 4.6], ['7:42', 168, 5.1], ['7:19', 171, 4.7], ['6:59', 175, 10.5]];
  const stages = rows.map(([p, heartRate, lactate]) => { const [m, sec] = p.split(':').map(Number); return { power: m * 60 + sec, heartRate, lactate }; });
  const r = analyzeLactateTest({ sport: 'run', baseLactate: 1.5, stages });
  const pace = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  it('takes the steady early stages as the floor, not the cold rest sample', () => {
    expect(r.baseline).toBe(2.4);
    expect(r.notes.join(' ')).toMatch(/resting sample/);
    expect(r.lt1.clamped || '').not.toMatch(/first stage/);
    expect(pace(r.lt1.value) >= '8:40' && pace(r.lt1.value) <= '8:52').toBe(true);
  });

  it('keeps the all-out last stage and still reads LT2 near 4 mmol/L', () => {
    expect(r.stagesUsed).toBe(8);
    expect(r.notes.join(' ')).toMatch(/exploded/);
    expect(pace(r.lt2.value) >= '8:05' && pace(r.lt2.value) <= '8:15').toBe(true);
    expect(r.lt2.lactate).toBeGreaterThan(3.7);
    expect(r.lt2.lactate).toBeLessThan(4.3);
  });
});

describe('edges', () => {
  it('a test that never reached 2.5 mmol/L says so and gives the last stage as a bound', () => {
    const r = analyzeLactateTest({ sport: 'bike', baseLactate: 1.0, stages: runStages([[100, 1.0], [150, 1.1], [200, 1.3], [250, 1.6], [300, 2.0]]) });
    expect(r.lt2.fallback).toBe('last stage');
    expect(r.lt2.value).toBe(300);
    expect(r.confidence).toBeLessThan(50);
  });

  it('an exploding last stage does not drag LT2 to it', () => {
    const calm = analyzeLactateTest({ sport: 'bike', baseLactate: 1.0, stages: runStages([[150, 1.0], [200, 1.2], [250, 1.8], [300, 2.8], [350, 4.0], [400, 5.2]]) });
    const exploded = analyzeLactateTest({ sport: 'bike', baseLactate: 1.0, stages: runStages([[150, 1.0], [200, 1.2], [250, 1.8], [300, 2.8], [350, 4.0], [400, 11.5]]) });
    expect(exploded.notes.join(' ')).toMatch(/exploded/);
    // The 11.5 reading moved LT2 by less than a stage; without the trim the
    // D-max chord would swing to it.
    expect(Math.abs(exploded.lt2.value - calm.lt2.value)).toBeLessThan(25);
  });

  it('a test that started above the aerobic threshold says so', () => {
    const r = analyzeLactateTest({ sport: 'bike', baseLactate: 2.6, stages: runStages([[120, 3.2], [150, 3.6], [180, 5.8], [210, 10.9]]) });
    expect(r.lt1.value).toBe(120);
    expect(r.lt1.clamped).toMatch(/first stage/);
  });

  it('lactate falling with intensity is not a step test', () => {
    // Pace in seconds: 360 s/km is the slowest stage, and it has the most lactate.
    expect(analyzeLactateTest({ sport: 'run', stages: runStages([[300, 1.5], [320, 2.5], [340, 4.0], [360, 6.0]]) })).toBeNull();
    expect(analyzeLactateTest({ sport: 'bike', stages: runStages([[100, 1.0], [200, 2.0]]) })).toBeNull();
  });

  it('a first stage still carrying the warm-up is left out', () => {
    const r = analyzeLactateTest({ sport: 'bike', baseLactate: 1.0, stages: runStages([[100, 3.5], [150, 1.1], [200, 1.3], [250, 1.8], [300, 2.6], [350, 4.1], [400, 7.0]]) });
    expect(r.notes.join(' ')).toMatch(/warm-up/);
    expect(r.stagesUsed).toBe(6);
  });
});

describe('what real tests in the database read as', () => {
  // Ten anonymised tests, the answers this engine gave when it was tuned. A
  // change here is a change every athlete would see — meant to be deliberate.
  const fixture = [
  { sport: "bike", baseLactate: 2.2, stages: [[100, 2, 106], [130, 1.8, 116], [160, 1.6, 126], [190, 1.6, 133], [220, 1.8, 144], [250, 2.2, 153], [280, 3.5, 162], [310, 6.1, 171], [340, 11.7, 177]],
    expect: {"lt1":254.8,"lt2":286,"lt1La":2.32,"lt2La":3.88,"confidence":89} },
  { sport: "bike", baseLactate: 2.2, stages: [[170, 2, 147], [195, 3, 150], [220, 3.6, 153], [245, 6.4, 167], [270, 8.9, 176], [295, 14, 186]],
    expect: {"lt1":195,"lt2":225.7,"lt1La":3,"lt2La":4,"confidence":83} },
  { sport: "bike", baseLactate: 1, stages: [[150, 1.2, 126], [170, 1.8, 136], [190, 2.6, 143], [205, 3.7, 151], [210, 4.7, 156]],
    expect: {"lt1":176.2,"lt2":203.3,"lt1La":2.01,"lt2La":3.51,"confidence":81} },
  { sport: "run", baseLactate: 0.7, stages: [[5, 0.9, 134], [4, 0.7, 142], [4, 0.7, 146], [4, 0.9, 155], [4, 1.3, 167], [4, 2.3, 170], [3, 2.6, 180], [3, 5, 188], [3, 7.1, 192]],
    expect: {"lt1":4.1,"lt2":3.4,"lt1La":1.5,"lt2La":3.49,"confidence":57} },
  { sport: "run", baseLactate: 1, stages: [[360, 1, 100], [330, 1.2, 110], [300, 1.5, 120], [270, 1.8, 130], [240, 2, 140], [210, 3.5, 150], [180, 7, 160]],
    expect: {"lt1":259.2,"lt2":207.9,"lt1La":1.87,"lt2La":3.66,"confidence":83} },
  { sport: "run", baseLactate: 0.7, stages: [[989, 1.1, 111], [900, 1.4, 116], [841, 2.1, 125], [794, 2.7, 133], [763, 4.1, 140], [742, 3.7, 141], [718, 5, 151], [698, 6.7, 155], [679, 10.5, 164], [665, 11.5, 170]],
    expect: {"lt1":851.4,"lt2":736,"lt1La":1.96,"lt2La":4,"confidence":84} },
  { sport: "run", baseLactate: 1.8, stages: [[270, 3.7, 157], [250, 1.4, 171], [230, 3.3, 178], [220, 5.6, 183], [210, 6.5, 189], [200, 9.2, 198]],
    expect: {"lt1":236.8,"lt2":226.7,"lt1La":2.5,"lt2La":4,"confidence":55} },
  { sport: "bike", baseLactate: 1, stages: [[120, 1, 114], [140, 0.9, 125], [160, 1.2, 137], [180, 1.6, 147], [200, 2.1, 156], [220, 3.3, 165], [225, 4.7, 166], [240, 5.1, 173]],
    expect: {"lt1":186.1,"lt2":219.4,"lt1La":1.73,"lt2La":3.23,"confidence":89} },
  { sport: "run", baseLactate: 1, stages: [[328, 2.2, 150], [311, 2, 151], [294, 1.6, 155], [285, 1.2, 158], [273, 1.4, 163], [263, 1.6, 169], [254, 1.9, 171], [249, 2.2, 174], [243, 2.9, 178], [234, 4.4, 184], [227, 6.8, 186]],
    expect: {"lt1":255.9,"lt2":237.9,"lt1La":1.83,"lt2La":3.64,"confidence":66} },
  { sport: "run", baseLactate: 1, stages: [[360, 1.5, 142], [340, 1, 140], [320, 0.9, 148], [300, 1.1, 161], [280, 1.4, 169], [260, 1.6, 175], [240, 4.5, 185], [220, 10.6, 192]],
    expect: {"lt1":258.7,"lt2":244.6,"lt1La":1.64,"lt2La":3.57,"confidence":56} },
  ];
  it.each(fixture.map((t, i) => [i, t]))('test #%i', (_, t) => {
    const r = analyzeLactateTest({ sport: t.sport, baseLactate: t.baseLactate, stages: runStages(t.stages) });
    expect(Math.round(r.lt1.value * 10) / 10).toBeCloseTo(t.expect.lt1, 0);
    expect(Math.round(r.lt2.value * 10) / 10).toBeCloseTo(t.expect.lt2, 0);
    expect(r.lt1.lactate).toBeCloseTo(t.expect.lt1La, 1);
    expect(r.lt2.lactate).toBeCloseTo(t.expect.lt2La, 1);
    expect(r.confidence).toBe(t.expect.confidence);
  });
});

describe('a last level stopped early', () => {
  const kmh = (v) => 3600 / v;
  // [km/h, lactate, seconds]
  const treadmill = (rows, extra = {}) => ({
    sport: 'run',
    ...extra,
    results: rows.map(([speed, lactate, duration]) => ({ power: 3600 / speed, lactate, duration })),
  });
  const threeMinute = (last) => treadmill([[13, 1.5, 180], [14, 2.0, 180], [15, 3.1, 180], [16, 5.0, 180], [17, 7.0, last]]);

  it('counts 1:40 of a 3:00 level at the last finished speed plus that share of the step', () => {
    const s = shortenedLastLevel(threeMinute(100));
    expect(kmh(s.power)).toBeCloseTo(16.56, 1);
    expect(kmh(s.targetPower)).toBeCloseTo(17, 6);
    expect(s).toMatchObject({ index: 4, measure: 'duration', completed: 100, planned: 180 });
  });

  it('prorates watts linearly on a real bike test: 60 s of a 300 s level, 380 to 420 W', () => {
    const results = [100, 140, 180, 220, 260, 300, 340, 380].map((power) => ({ power, lactate: 2, duration: 300 }));
    results.push({ power: 420, lactate: 12, duration: 60 });
    expect(shortenedLastLevel({ sport: 'bike', stageDurationSec: 300, results }).power).toBe(388);
  });

  it('takes the planned length from the test setting when only the last level has a Dur', () => {
    const rows = [[14, 2], [15, 3], [16, 5]].map(([speed, lactate]) => [speed, lactate, undefined]);
    const test = treadmill([...rows, [17, 7, 100]], { stageDurationSec: '180' });
    expect(kmh(shortenedLastLevel(test).power)).toBeCloseTo(16.56, 1);
  });

  it('reads durations still typed as M:SS in the form', () => {
    const s = shortenedLastLevel(treadmill([[14, 2, '03:00'], [15, 3, '03:00'], [16, 5, '03:00'], [17, 7, '1:40']]));
    expect(s).toMatchObject({ completed: 100, planned: 180 });
  });

  it('prorates a level cut short by distance', () => {
    const results = [[12, 2], [13, 3], [14, 5]].map(([speed, lactate]) => ({ power: 3600 / speed, lactate, distanceMeters: 800 }));
    results.push({ power: 3600 / 15, lactate: 7, distanceMeters: 400 });
    const s = shortenedLastLevel({ sport: 'run', results });
    expect(s.measure).toBe('distance');
    expect(kmh(s.power)).toBeCloseTo(14.5, 1);
  });

  it('skips a recovery sample logged after the level', () => {
    const test = threeMinute(100);
    test.results.push({ power: 3600 / 8, lactate: 6, duration: 180, intervalType: 'recovery' });
    expect(shortenedLastLevel(test).index).toBe(4);
  });

  // Each of these is a pattern from saved tests that must keep what was typed.
  it.each([
    ['fixed distance: each level takes less time than the last',
      treadmill([[12.9, 1, 560], [13.6, 1.2, 530], [14.6, 1.6, 495], [15.7, 2.2, 460], [16.5, 3, 435], [17.7, 4.5, 410], [18.9, 7, 380]])],
    ['a test setting that the levels contradict',
      { sport: 'bike', stageDurationSec: 600, results: [125, 150, 175, 200, 225, 250].map((power, i) => ({ power, lactate: 1 + i, duration: i ? 360 : 600 })) }],
    ['every level shorter than the test setting',
      treadmill([[13, 1, 300], [14, 2, 300], [15, 3, 300], [16, 5, 300]], { stageDurationSec: 400 })],
    ['a last level within 10 % of its length', threeMinute(170)],
    ['a level that ran its full length', threeMinute(180)],
    ['a last level with no Dur', threeMinute(undefined)],
    ['no way to tell the planned length', treadmill([[14, 2], [15, 3], [16, 5], [17, 7, 100]])],
    ['a last level that is not the hardest',
      treadmill([[14, 2, 180], [15, 3, 180], [16, 5, 180], [15.5, 4, 100]])],
    ['loads stored as km/h',
      { sport: 'run', results: [14, 15, 16].map((power, i) => ({ power, lactate: 2 + i, duration: 180 })).concat({ power: 17, lactate: 7, duration: 100 }) }],
  ])('leaves alone %s', (_, test) => {
    expect(shortenedLastLevel(test)).toBeNull();
    expect(withShortenedLastLevel(test)).toBe(test.results);
  });

  it('leaves mixed short levels of distance alone', () => {
    const results = [1200, 1200, 400, 400].map((distanceMeters, i) => ({ power: 300 - i * 20, lactate: 1 + i, distanceMeters }));
    expect(shortenedLastLevel({ sport: 'run', results })).toBeNull();
  });

  it('changes a copy, and only once', () => {
    const test = threeMinute(100);
    const typed = test.results[4].power;
    const once = withShortenedLastLevel(test);
    expect(test.results[4].power).toBe(typed);
    expect(once[4].targetPower).toBe(typed);
    expect(once[4].duration).toBe(100);
    const twice = withShortenedLastLevel({ ...test, results: once });
    expect(twice[4].power).toBe(once[4].power);
  });

  it('keeps the fields of a Mongoose subdocument', () => {
    class Subdoc {
      constructor(fields) { this.$fields = fields; }
      get power() { return this.$fields.power; }
      get lactate() { return this.$fields.lactate; }
      get duration() { return this.$fields.duration; }
      toObject() { return { ...this.$fields }; }
    }
    const results = threeMinute(100).results.map((r) => new Subdoc({ ...r, heartRate: 170 }));
    const [last] = withShortenedLastLevel({ sport: 'run', results }).slice(-1);
    expect(last).toMatchObject({ lactate: 7, duration: 100, heartRate: 170 });
    expect(kmh(last.power)).toBeCloseTo(16.56, 1);
  });

  it('explains itself in the reader\'s units', () => {
    const note = shortenedLevelNote(shortenedLastLevel(threeMinute(100)), (v) => `${kmh(v).toFixed(1)} km/h`);
    expect(note).toBe('Last level stopped at 1:40 of 3:00: counted at 16.6 km/h instead of 17.0 km/h in the curve and thresholds.');
  });
});
