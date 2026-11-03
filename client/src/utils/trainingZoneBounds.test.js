/**
 * Zone edges from a lactate test: power/pace from the thresholds, heart rate
 * from the test's own HR curve. The cases are the ones that used to come out
 * as one-beat or one-watt zones.
 */
import {
  ltZoneBounds, heartRateZoneBoundsFromTest, TOP_FACTOR, MIN_HR_ZONE_BPM,
} from './trainingZoneBounds';
import {
  analyzeLactateTest, heartRateCurvePoints, heartRateAtIntensity,
} from './lactateThresholdEngine';

const bikeStages = (rows) => rows.map(([power, lactate, heartRate]) => ({ power, lactate, heartRate }));
const pace = (s) => { const [m, ss] = s.split(':').map(Number); return m * 60 + ss; };
const runStages = (rows) => rows.map(([p, lactate, heartRate]) => ({ power: pace(p), lactate, heartRate }));

const TESTS = {
  typical: { sport: 'bike', baseLactate: 1.0, stages: bikeStages([[150, 1.1, 118], [175, 1.0, 126], [200, 1.2, 134], [225, 1.5, 142], [250, 2.1, 151], [275, 3.2, 161], [300, 5.4, 171]]) },
  hrPlateau: { sport: 'bike', baseLactate: 1.0, stages: bikeStages([[140, 1.0, 122], [170, 1.1, 133], [200, 1.4, 143], [230, 2.0, 151], [260, 3.1, 156], [290, 5.0, 158], [320, 8.2, 159]]) },
  hrNotMonotone: { sport: 'bike', baseLactate: 1.0, stages: bikeStages([[150, 1.2, 140], [180, 1.3, 138], [210, 1.6, 146], [240, 2.4, 150], [270, 3.8, 149], [300, 6.1, 160]]) },
  coarseAdjacent: { sport: 'bike', baseLactate: 1.0, stages: bikeStages([[120, 1.0, 110], [160, 1.1, 124], [200, 1.3, 138], [240, 3.6, 152], [280, 7.0, 166]]) },
  noisyFirst: { sport: 'bike', baseLactate: 1.3, stages: bikeStages([[100, 2.6, 105], [130, 1.2, 114], [160, 1.1, 124], [190, 1.2, 133], [220, 1.4, 142], [250, 2.2, 152], [280, 3.9, 162], [310, 6.3, 171]]) },
  lowPower: { sport: 'bike', baseLactate: 1.0, stages: bikeStages([[60, 1.0, 104], [75, 1.1, 110], [90, 1.3, 118], [105, 2.0, 128], [120, 3.9, 139], [135, 6.8, 150]]) },
  fourSteps: { sport: 'bike', baseLactate: 1.0, stages: bikeStages([[150, 1.3, 128], [200, 1.9, 145], [250, 3.4, 160], [300, 6.9, 174]]) },
  run: { sport: 'run', baseLactate: 1.0, stages: runStages([['6:00', 1.2, 132], ['5:30', 1.3, 140], ['5:00', 1.6, 148], ['4:40', 2.2, 155], ['4:20', 3.4, 163], ['4:00', 5.9, 172]]) },
  runHrFlat: { sport: 'run', baseLactate: 1.0, stages: runStages([['6:00', 1.1, 140], ['5:40', 1.2, 147], ['5:20', 1.5, 153], ['5:00', 2.3, 156], ['4:40', 3.6, 158], ['4:20', 6.0, 160]]) },
};

/** The zone set exactly as calculateZonesFromTest builds it, from the engine alone. */
function zonesFor(test) {
  const e = analyzeLactateTest(test);
  const bike = test.sport === 'bike';
  const opts = { lt1: e.lt1.value, lt2: e.lt2.value, ascending: bike, topFactor: bike ? TOP_FACTOR.power : TOP_FACTOR.pace };
  const intensity = ltZoneBounds({ ...opts, round: false });
  const maxHr = Math.max(...test.stages.map((s) => s.heartRate));
  const hr = heartRateZoneBoundsFromTest({
    intensityBounds: intensity, lt1: e.lt1.value, lt2: e.lt2.value, sport: test.sport, hrCurve: e.heartRateCurve, top: maxHr,
  });
  return { e, intensity, rounded: ltZoneBounds(opts), hr };
}

const widths = (b) => b.slice(1).map((v, i) => v - b[i]);

describe('power and pace zones', () => {
  it('keep the shape they had on a normal test', () => {
    expect(ltZoneBounds({ lt1: 235, lt2: 280, ascending: true, topFactor: TOP_FACTOR.power }))
      .toEqual([165, 188, 235, 272, 288, 420]);
  });

  it('give Z3 at least two thirds of the LT1–LT2 gap when the thresholds sit close', () => {
    // LT2 4 % above LT1 — what the engine produces when the stages were too
    // coarse. 0.97 x LT2 used to land at 202 W: Z3 was 200–202.
    const b = ltZoneBounds({ lt1: 200, lt2: 208, ascending: true, topFactor: TOP_FACTOR.power });
    expect(b[3] - b[2]).toBeGreaterThanOrEqual(5);
    expect(b[3]).toBeLessThan(208);
    expect(b[4]).toBeGreaterThan(208);
  });

  it('are strictly monotone and contiguous for every LT2/LT1 ratio, power and pace', () => {
    for (let ratio = 1.02; ratio <= 1.6; ratio += 0.01) {
      const p = ltZoneBounds({ lt1: 200, lt2: 200 * ratio, ascending: true, topFactor: TOP_FACTOR.power, round: false });
      widths(p).forEach((w) => expect(w).toBeGreaterThan(0));
      expect(p[3] - p[2]).toBeGreaterThanOrEqual((2 / 3) * (p[2] * ratio - p[2]) - 1e-9);
      const s = ltZoneBounds({ lt1: 300, lt2: 300 / ratio, ascending: false, topFactor: TOP_FACTOR.pace, round: false });
      widths(s).forEach((w) => expect(w).toBeLessThan(0));
    }
  });
});

describe('the HR curve', () => {
  it('pools a stage whose HR dipped instead of reading a slower heart into it', () => {
    const pts = heartRateCurvePoints([{ u: 150, hr: 140 }, { u: 180, hr: 138 }, { u: 210, hr: 146 }]);
    expect(pts.map((p) => p.hr)).toEqual([139, 139, 146]);
  });

  it('carries on along the end slope outside the stages, and never invents a rise on a plateau', () => {
    const pts = heartRateCurvePoints([{ u: 100, hr: 110 }, { u: 150, hr: 120 }, { u: 200, hr: 130 }, { u: 250, hr: 150 }, { u: 300, hr: 150 }]);
    expect(heartRateAtIntensity(pts, 50)).toBeCloseTo(100, 6);
    expect(heartRateAtIntensity(pts, 175)).toBeCloseTo(125, 6);
    expect(heartRateAtIntensity(pts, 350)).toBeCloseTo(150, 6);
  });

  it('is what the engine reads the threshold heart rates from', () => {
    const { e } = zonesFor(TESTS.hrNotMonotone);
    // Raw interpolation put LT2 at 149 bpm: below the 150 measured a stage earlier.
    expect(e.lt2.heartRate).toBeGreaterThanOrEqual(150);
    expect(e.lt2.heartRate).toBeGreaterThanOrEqual(e.lt1.heartRate);
  });
});

describe('HR zones from a test', () => {
  // HR rose 3 bpm from LT1 to LT2 in these two — see the test further down.
  const FLAT_HR = ['hrNotMonotone', 'runHrFlat'];

  it.each(FLAT_HR)('%s: no HR zones, and the reason instead', (name) => {
    const { hr } = zonesFor(TESTS[name]);
    expect(hr.bounds).toBeNull();
    expect(hr.note).toMatch(/too little to tell the zones apart/);
  });

  it.each(Object.keys(TESTS).filter((k) => !FLAT_HR.includes(k)))('%s: monotone, contiguous, no zone under the minimum', (name) => {
    const { e, hr } = zonesFor(TESTS[name]);
    expect(hr.bounds).not.toBeNull();
    const w = widths(hr.bounds);
    w.forEach((x) => expect(x).toBeGreaterThan(0));
    [1, 2, 3].forEach((i) => expect(w[i]).toBeGreaterThanOrEqual(MIN_HR_ZONE_BPM - 1)); // rounding
    // Z2/Z3 is the LT1 heart rate the table shows; LT2 HR sits inside Z4.
    expect(hr.bounds[2]).toBe(e.lt1.heartRate);
    expect(hr.bounds[3]).toBeLessThanOrEqual(e.lt2.heartRate);
    expect(hr.bounds[4]).toBeGreaterThanOrEqual(e.lt2.heartRate);
  });

  it('follow the power zones: each edge is the HR measured at that wattage', () => {
    const { intensity, hr } = zonesFor(TESTS.typical);
    // 188 W (Z1/Z2) sits 13/25 of the way from 175 W @ 126 to 200 W @ 134.
    expect(Math.abs(hr.bounds[1] - (126 + (8 * (intensity[1] - 175)) / 25))).toBeLessThanOrEqual(0.5);
    // 272 W (Z3/Z4) between 250 W @ 151 and 275 W @ 161.
    expect(Math.abs(hr.bounds[3] - (151 + (10 * (intensity[3] - 250)) / 25))).toBeLessThanOrEqual(0.5);
    expect(hr.note).toBeNull();
  });

  it('no longer collapse Z3 when HR plateaus near the top (the trial user’s case)', () => {
    const { hr } = zonesFor(TESTS.hrPlateau);
    // Before: Z3 149–151 bpm.
    expect(hr.bounds[3] - hr.bounds[2]).toBeGreaterThanOrEqual(MIN_HR_ZONE_BPM);
    expect(hr.note).toMatch(/LT2 HR ±2 bpm/);
  });

  it('say so instead of drawing zones when HR barely moved between LT1 and LT2', () => {
    const { hr } = zonesFor(TESTS.runHrFlat);
    expect(hr.bounds).toBeNull();
    expect(hr.note).toMatch(/Train Z2–Z4 by pace/);
    expect(zonesFor(TESTS.hrNotMonotone).hr.note).toMatch(/by power/);
  });

  it('run tests read pace edges on the same curve', () => {
    const { hr, rounded } = zonesFor(TESTS.run);
    expect(rounded[0]).toBeGreaterThan(rounded[5]); // pace edges descend
    widths(hr.bounds).forEach((x) => expect(x).toBeGreaterThan(0));
    // Z1/Z2 is ~6:07/km, slower than the first stage (6:00 @ 132): read on
    // along the first stages' slope, not pinned to 132.
    expect(hr.bounds[1]).toBeLessThan(132);
    expect(hr.bounds[1]).toBeGreaterThan(124);
  });

  it('return null when the test has no heart rate at all', () => {
    const test = { ...TESTS.typical, stages: TESTS.typical.stages.map((s) => ({ ...s, heartRate: null })) };
    const e = analyzeLactateTest(test);
    expect(e.heartRateCurve).toBeNull();
    expect(heartRateZoneBoundsFromTest({
      intensityBounds: [1, 2, 3, 4, 5, 6], lt1: e.lt1.value, lt2: e.lt2.value, sport: 'bike', hrCurve: e.heartRateCurve,
    })).toBeNull();
  });
});
