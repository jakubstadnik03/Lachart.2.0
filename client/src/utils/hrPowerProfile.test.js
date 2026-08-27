import {
  analyseSession,
  buildDriftHistory,
  gradeFactor,
  compareToTestCurve,
  lactateCurveShift,
  localSlopeAt,
  projectThresholdShift,
  projectThresholdTimeline,
  sessionCloud,
  steadyBlocks,
  testHrCurve,
  testHrSlope,
  testLactateCurve,
  thresholdToDemand,
  toSeries,
  zoneAgreement,
} from './hrPowerProfile';

// ── A synthetic athlete with a known truth ─────────────────────────────────
// Test day: LT1 210 W @ 145 bpm, LT2 280 W @ 170 bpm.
// That fixes the HR–power line at slope 25/70 bpm per watt, offset 70 bpm.
const B = 25 / 70;
const A_TEST = 145 - B * 210;

const bikeAnchor = {
  sport: 'bike',
  isPace: false,
  storageMode: 'pace',
  lt1: 210,
  lt2: 280,
  lt1Hr: 145,
  lt2Hr: 170,
  points: [150, 180, 210, 240, 270, 300].map((p, i) => ({
    x: p,
    y: 1 + i * 0.7,
    hr: A_TEST + B * p,
  })),
};

/**
 * Build a ride for an athlete whose LT2 has moved by `gainW` since the test,
 * recorded with a realistic HR lag, cardiac drift and sensor noise.
 * Blocks are [durationSeconds, watts].
 */
function ride(blocks, { gainW, drift = 3, lag = 30, noise = 3, seed = 11, tempBumpBpm = 0 } = {}) {
  const offsetNow = 170 - B * (280 + gainW);
  let rnd = seed;
  const rand = () => {
    rnd = (rnd * 1103515245 + 12345) % 2147483648;
    return rnd / 2147483648 - 0.5;
  };
  const watts = [];
  for (const [dur, w] of blocks) for (let k = 0; k < dur; k += 1) watts.push(w);
  const t0 = Date.parse('2026-06-01T08:00:00Z');
  return watts.map((p, i) => ({
    timestamp: new Date(t0 + i * 1000).toISOString(),
    power: p + noise * 2 * rand(),
    heartRate:
      offsetNow + B * watts[Math.max(0, i - lag)] + drift * (i / 3600) + tempBumpBpm + noise * rand(),
  }));
}

const WARMUP = [600, 120];
/** Mixed endurance ride — spans enough watts for a free (self-slope) fit. */
const MIXED = [WARMUP, ...[200, 232, 251, 215, 268, 226, 245, 258, 209, 240].map((w) => [480, w])];
/** Flat Z2 ride — 4 % of LT2 of range, so only the anchored fit can read it. */
const NARROW = [WARMUP, ...[205, 212, 208, 215, 203, 210, 214, 206].map((w) => [600, w])];

describe('testHrSlope', () => {
  it('recovers the HR–power slope from the test stages', () => {
    const fit = testHrSlope(bikeAnchor);
    expect(fit.slope).toBeCloseTo(B, 4);
    expect(fit.r2).toBeCloseTo(1, 3);
  });

  it('refuses a test whose stages carry no heart rate', () => {
    const noHr = { ...bikeAnchor, points: bikeAnchor.points.map((p) => ({ ...p, hr: 0 })) };
    expect(testHrSlope(noHr)).toBeNull();
  });
});

describe('analyseSession — recovering a known threshold shift', () => {
  it.each([
    ['improved', 15],
    ['unchanged', 0],
    ['detrained', -20],
  ])('reads a %s athlete off a mixed ride to within 1 W', (_label, gainW) => {
    const r = analyseSession({ records: ride(MIXED, { gainW }), sport: 'bike', anchor: bikeAnchor });
    expect(r.ok).toBe(true);
    expect(r.fit.mode).toBe('free');
    expect(r.deltaDemand).toBeCloseTo(gainW, 0);
  });

  it.each([
    ['improved', 15],
    ['unchanged', 0],
    ['detrained', -20],
  ])('reads a %s athlete off a narrow Z2 ride using the test slope', (_label, gainW) => {
    const r = analyseSession({ records: ride(NARROW, { gainW }), sport: 'bike', anchor: bikeAnchor });
    expect(r.ok).toBe(true);
    // Too little range to fit a slope — it must borrow the test's.
    expect(r.fit.mode).toBe('anchored');
    expect(r.rangeOfLt2).toBeLessThan(0.1);
    expect(r.deltaDemand).toBeCloseTo(gainW, 0);
  });

  it('separates within-session cardiac drift from the threshold estimate', () => {
    const r = analyseSession({
      records: ride(MIXED, { gainW: 15, drift: 5 }),
      sport: 'bike',
      anchor: bikeAnchor,
    });
    expect(r.fit.drift).toBeCloseTo(5, 0);
    expect(r.deltaDemand).toBeCloseTo(15, 0);
  });

  it('recovers the same answer whether or not HR lags power', () => {
    const noLag = analyseSession({ records: ride(MIXED, { gainW: 15, lag: 0 }), sport: 'bike', anchor: bikeAnchor });
    const lagged = analyseSession({ records: ride(MIXED, { gainW: 15, lag: 45 }), sport: 'bike', anchor: bikeAnchor });
    expect(lagged.lagSec).toBeGreaterThan(0);
    expect(lagged.deltaDemand).toBeCloseTo(noLag.deltaDemand, 0);
  });

  it('reports both directions of the same finding', () => {
    const r = analyseSession({ records: ride(MIXED, { gainW: 15 }), sport: 'bike', anchor: bikeAnchor });
    // Higher power at the test's LT2 HR, and lower HR at the test's LT2 power.
    expect(r.deltaDemand).toBeGreaterThan(0);
    expect(r.deltaHr).toBeLessThan(0);
  });
});

describe('analyseSession — confounders', () => {
  it('does not read a hot ride as a fitness collapse', () => {
    const opts = { gainW: 15, tempBumpBpm: 0.6 * (31 - 20) };
    const corrected = analyseSession({ records: ride(MIXED, opts), sport: 'bike', anchor: bikeAnchor, tempC: 31 });
    const ignored = analyseSession({ records: ride(MIXED, opts), sport: 'bike', anchor: bikeAnchor });
    expect(corrected.deltaDemand).toBeCloseTo(15, 0);
    // Without the correction the same ride looks like lost fitness.
    expect(ignored.deltaDemand).toBeLessThan(0);
    expect(corrected.tempAdjustBpm).toBeGreaterThan(5);
  });
});

describe('analyseSession — sessions that must not produce a number', () => {
  const rejected = (records, sport = 'bike', anchor = bikeAnchor) =>
    analyseSession({ records, sport, anchor }).reason;

  it('rejects an interval session — no plateau to read', () => {
    const intervals = [WARMUP, ...Array.from({ length: 5 }, () => [[240, 330], [240, 110]]).flat()];
    expect(rejected(ride(intervals, { gainW: 15 }))).toBe('not-enough-steady-state');
  });

  it('rejects a recovery spin held far below LT1', () => {
    expect(rejected(ride([WARMUP, [1200, 150]], { gainW: 15 }))).toBe('not-enough-steady-state');
  });

  it('rejects a session with no heart rate', () => {
    const noHr = ride(NARROW, { gainW: 15 }).map((r) => ({ ...r, heartRate: null }));
    expect(rejected(noHr)).toBe('not-enough-steady-state');
  });

  it('rejects a test that never recorded HR at LT2', () => {
    expect(rejected(ride(NARROW, { gainW: 15 }), 'bike', { ...bikeAnchor, lt2Hr: null })).toBe('no-lt2-hr');
  });

  it('rejects swimming outright', () => {
    expect(rejected(ride(NARROW, { gainW: 15 }), 'swim')).toBe('swim-unsupported');
  });
});

// ── Running: the same read, on grade-adjusted pace ─────────────────────────

describe('analyseSession — running', () => {
  // LT1 4:45/km @ 148 bpm, LT2 4:00/km @ 172 bpm.
  const LT2_SEC = 240;
  const bRun = (172 - 148) / (1000 / LT2_SEC - 1000 / 285);
  const aRun = 148 - bRun * (1000 / 285);
  const runAnchor = {
    sport: 'run',
    isPace: true,
    storageMode: 'pace',
    lt1: 285,
    lt2: LT2_SEC,
    lt1Hr: 148,
    lt2Hr: 172,
    points: [330, 300, 285, 262, 240, 225].map((s, i) => ({
      x: s,
      y: 1 + i * 0.7,
      hr: aRun + bRun * (1000 / s),
    })),
  };

  /** `hilly` rolls the gradient through ±5 % while holding the metabolic cost constant. */
  function run({ gainSecPerKm, hilly, drift = 4, lag = 30, noise = 2, seed = 5 }) {
    const offsetNow = 172 - bRun * (1000 / (LT2_SEC - gainSecPerKm));
    let rnd = seed;
    const rand = () => {
      rnd = (rnd * 1103515245 + 12345) % 2147483648;
      return rnd / 2147483648 - 0.5;
    };
    const flatSpeeds = [];
    for (let k = 0; k < 600; k += 1) flatSpeeds.push(2.6);
    for (const s of [3.45, 3.6, 3.52, 3.68, 3.4, 3.58]) for (let k = 0; k < 480; k += 1) flatSpeeds.push(s);

    const t0 = Date.parse('2026-06-02T07:00:00Z');
    const recs = [];
    let dist = 0;
    let alt = 100;
    for (let i = 0; i < flatSpeeds.length; i += 1) {
      const grade = hilly ? 0.05 * Math.sin(i / 240) : 0;
      // Same metabolic cost, slower over the ground when it points uphill.
      const actual = flatSpeeds[i] / gradeFactor(grade);
      dist += actual;
      alt += actual * grade;
      recs.push({
        timestamp: new Date(t0 + i * 1000).toISOString(),
        speed: actual,
        distance: dist,
        altitude: alt,
        heartRate:
          offsetNow + bRun * flatSpeeds[Math.max(0, i - lag)] + drift * (i / 3600) + noise * rand(),
      });
    }
    return recs;
  }

  it('reports the new threshold pace in seconds per km', () => {
    const r = analyseSession({ records: run({ gainSecPerKm: 8, hilly: false }), sport: 'run', anchor: runAnchor });
    expect(r.ok).toBe(true);
    expect(r.thresholdAtLt2Hr).toBeCloseTo(LT2_SEC - 8, 0);
  });

  it('reads a hilly run the same as the flat one — grade is adjusted out', () => {
    const flat = analyseSession({ records: run({ gainSecPerKm: 8, hilly: false }), sport: 'run', anchor: runAnchor });
    const hilly = analyseSession({ records: run({ gainSecPerKm: 8, hilly: true }), sport: 'run', anchor: runAnchor });
    expect(hilly.thresholdAtLt2Hr).toBeCloseTo(flat.thresholdAtLt2Hr, 0);
  });

  it('converts pace thresholds into metres per second', () => {
    expect(thresholdToDemand(240, { kind: 'run', storageMode: 'pace' })).toBeCloseTo(1000 / 240, 6);
    expect(thresholdToDemand(15, { kind: 'run', storageMode: 'speed' })).toBeCloseTo(15 / 3.6, 6);
  });
});

describe('sessionCloud', () => {
  it('describes a session the drift fit refuses to read', () => {
    const intervals = [WARMUP, ...Array.from({ length: 5 }, () => [[240, 330], [240, 110]]).flat()];
    const records = ride(intervals, { gainW: 15 });
    const result = analyseSession({ records, sport: 'bike', anchor: bikeAnchor });

    // The fit gives up — but the session still has to be showable.
    expect(result.ok).toBe(false);
    expect(result.cloud.length).toBeGreaterThan(20);
    // Both the work and the recovery survive as distinct clusters.
    const demands = result.cloud.map((p) => p.demand);
    expect(Math.max(...demands)).toBeGreaterThan(300);
    expect(Math.min(...demands)).toBeLessThan(150);
  });

  it('bins away the sample count without losing the shape', () => {
    const series = toSeries(ride(MIXED, { gainW: 0 }), 'bike');
    const cloud = sessionCloud(series, { binSec: 30 });
    expect(cloud.length).toBeLessThan(series.n / 20);
    expect(cloud.every((p) => Number.isFinite(p.demand) && Number.isFinite(p.hr))).toBe(true);
  });

  it('skips bins that are mostly gap', () => {
    const sparse = ride(MIXED, { gainW: 0 }).map((r, i) => (i % 60 < 55 ? { ...r, heartRate: null } : r));
    const cloud = sessionCloud(toSeries(sparse, 'bike'), { binSec: 30 });
    expect(cloud.length).toBe(0);
  });
});

describe('testLactateCurve', () => {
  const curve = () => testLactateCurve(bikeAnchor);

  it('reads lactate off the test between measured stages', () => {
    // Stages 210 W → 2.4 and 240 W → 3.1, so halfway is 2.75.
    expect(curve().at(225)).toBeCloseTo(2.75, 2);
  });

  it('returns a measured stage exactly', () => {
    expect(curve().at(240)).toBeCloseTo(3.1, 6);
  });

  it('refuses to extrapolate past the tested range', () => {
    // Above the last stage the real curve turns exponential; guessing there
    // would make any sprint lap look wildly below expectation.
    expect(curve().at(400)).toBeNull();
    expect(curve().at(80)).toBeNull();
  });

  it('gives up on a test with too few usable stages', () => {
    expect(testLactateCurve({ ...bikeAnchor, points: bikeAnchor.points.slice(0, 2) })).toBeNull();
    expect(testLactateCurve(null)).toBeNull();
  });
});

describe('testHrCurve', () => {
  // Fixture stages: 150,180,210,240,270,300 W at 123.6…177.1 bpm on a straight line.
  it('reads the test heart rate at an intensity between two stages', () => {
    const at = testHrCurve(bikeAnchor).at(225);
    expect(at).toBeCloseTo(A_TEST + B * 225, 4);
  });

  it('refuses to answer outside the stages the test actually rode', () => {
    expect(testHrCurve(bikeAnchor).at(400)).toBeNull();
    expect(testHrCurve(bikeAnchor).at(100)).toBeNull();
  });

  it('needs three stages with a heart rate on them', () => {
    expect(testHrCurve({ ...bikeAnchor, points: bikeAnchor.points.map((p) => ({ ...p, hr: 0 })) })).toBeNull();
    expect(testHrCurve(null)).toBeNull();
  });
});

describe('steadyBlocks', () => {
  const bin = (demand, hr, sec = 30) => ({ demand, hr, sec, t: 0 });

  it('merges a drifting block into one statement rather than forty', () => {
    // 12 bins = 6 min, wandering 240→260 W.
    const cloud = Array.from({ length: 12 }, (_, i) => bin(240 + i * 1.8, 140));
    const [b] = steadyBlocks(cloud);
    expect(b.sec).toBe(360);
    expect(b.demand).toBeGreaterThan(240);
    expect(b.demand).toBeLessThan(260);
  });

  it('splits when the effort genuinely changes', () => {
    const cloud = [
      ...Array.from({ length: 12 }, () => bin(200, 130)),
      ...Array.from({ length: 12 }, () => bin(320, 170)),
    ];
    const blocks = steadyBlocks(cloud);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => Math.round(b.demand)).sort((a, b2) => a - b2)).toEqual([200, 320]);
  });

  it('drops stretches too short to describe', () => {
    expect(steadyBlocks(Array.from({ length: 4 }, () => bin(200, 130)))).toEqual([]);
  });

  it('returns the longest block first', () => {
    const cloud = [
      ...Array.from({ length: 11 }, () => bin(200, 130)),
      ...Array.from({ length: 30 }, () => bin(300, 165)),
    ];
    expect(Math.round(steadyBlocks(cloud)[0].demand)).toBe(300);
  });
});

describe('compareToTestCurve', () => {
  const bin = (demand, hr, sec = 30) => ({ demand, hr, sec, t: 0 });
  /** 20 min held at 250 W with a heart rate of 120. */
  const easyRide = Array.from({ length: 40 }, () => bin(250, 120));

  it('answers the question an easy ride actually raises', () => {
    const r = compareToTestCurve(easyRide, bikeAnchor);
    const [b] = r.blocks;
    expect(b.sec).toBe(1200);
    expect(Math.round(b.demand)).toBe(250);
    expect(Math.round(b.hr)).toBe(120);
    // The test measured 250 W directly — no extrapolation involved.
    expect(b.testHr).toBeCloseTo(A_TEST + B * 250, 4);
    expect(b.deltaHr).toBeLessThan(0);
    expect(r.fromAverage).toBe(false);
  });

  it('answers a Z1 ride, which the threshold fit refuses outright', () => {
    // 160 W sits below LT1, so the threshold engine will not extrapolate from
    // it — the band it accepts starts just under the aerobic threshold.
    const asSession = analyseSession({ records: ride([WARMUP, [1800, 160]], { gainW: 0 }), sport: 'bike', anchor: bikeAnchor });
    expect(asSession.ok).toBe(false);
    expect(asSession.reason).toBe('not-enough-steady-state');

    // But the test rode a 150 W stage, so it knows what 160 W cost that day.
    const z1 = Array.from({ length: 40 }, () => bin(160, 105));
    const r = compareToTestCurve(z1, bikeAnchor);
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].testHr).toBeCloseTo(A_TEST + B * 160, 4);
    expect(Math.round(r.blocks[0].deltaHr)).toBe(Math.round(105 - (A_TEST + B * 160)));
  });

  it('falls back to the session average when nothing held still', () => {
    const wandering = Array.from({ length: 40 }, (_, i) => bin(200 + (i % 2 ? 90 : 0), 140));
    const r = compareToTestCurve(wandering, bikeAnchor);
    expect(r.fromAverage).toBe(true);
    expect(r.blocks).toHaveLength(1);
  });

  it('reports several blocks, longest first, and caps the list', () => {
    const cloud = [
      ...Array.from({ length: 40 }, () => bin(250, 120)),
      ...Array.from({ length: 20 }, () => bin(180, 105)),
      ...Array.from({ length: 30 }, () => bin(290, 150)),
    ];
    const r = compareToTestCurve(cloud, bikeAnchor);
    expect(r.blocks.length).toBeGreaterThanOrEqual(3);
    expect(r.blocks.length).toBeLessThanOrEqual(4);
    expect(r.blocks[0].sec).toBeGreaterThanOrEqual(r.blocks[1].sec);
  });

  it('takes the heat correction off the measured heart rate, not the test', () => {
    const plain = compareToTestCurve(easyRide, bikeAnchor);
    const hot = compareToTestCurve(easyRide, bikeAnchor, { tempAdjustBpm: 6 });
    expect(hot.blocks[0].hr).toBeCloseTo(plain.blocks[0].hr - 6, 4);
    expect(hot.blocks[0].testHr).toBeCloseTo(plain.blocks[0].testHr, 6);
  });

  it('says nothing when the ride sat outside the tested range', () => {
    const tooHard = Array.from({ length: 40 }, () => bin(420, 180));
    expect(compareToTestCurve(tooHard, bikeAnchor)).toBeNull();
  });

  it('gives up without a usable test or cloud', () => {
    expect(compareToTestCurve(easyRide, null)).toBeNull();
    expect(compareToTestCurve([], bikeAnchor)).toBeNull();
  });
});

describe('localSlopeAt', () => {
  const curve = () => testHrCurve(bikeAnchor);

  it('reads the curve\u2019s steepness where it is asked, not on average', () => {
    // The fixture is a straight line, so every local slope is the same one.
    expect(localSlopeAt(curve(), 225)).toBeCloseTo(B, 6);
  });

  it('follows a curve that steepens, rather than averaging it away', () => {
    const bent = {
      ...bikeAnchor,
      points: [
        { x: 150, y: 1, hr: 100 }, { x: 200, y: 1.4, hr: 110 },
        { x: 250, y: 2.0, hr: 122 }, { x: 300, y: 3.4, hr: 145 },
      ],
    };
    const shallow = localSlopeAt(testHrCurve(bent), 175);
    const steep = localSlopeAt(testHrCurve(bent), 275);
    expect(steep).toBeGreaterThan(shallow * 1.8);
  });

  it('will not answer outside the tested range', () => {
    expect(localSlopeAt(curve(), 500)).toBeNull();
    expect(localSlopeAt(null, 250)).toBeNull();
  });
});

describe('projectThresholdShift', () => {
  const DAY = 86400000;
  const NOW = Date.parse('2026-08-27T00:00:00Z');

  /**
   * n sessions whose heart rate is lower than the test by exactly the amount a
   * right-shift of `shiftW` watts would produce at each intensity.
   */
  const sessionsShiftedBy = (shiftW, { intensities, n = 8, sec = 1200 }) => {
    const curve = testHrCurve(bikeAnchor);
    return Array.from({ length: n }, (_, i) => ({
      date: new Date(NOW - (i + 1) * 3 * DAY).toISOString(),
      blocks: intensities.map((d) => ({
        demand: d,
        sec,
        deltaHr: -localSlopeAt(curve, d) * shiftW,
      })),
    }));
  };

  it('recovers a threshold that has moved, in watts', () => {
    // LT1 210 W, LT2 280 W. Ride near both, 15 W fitter.
    const r = projectThresholdShift(
      sessionsShiftedBy(15, { intensities: [205, 215, 275, 285] }), bikeAnchor, { now: NOW },
    );
    expect(r.lt1.to).toBeCloseTo(225, 0);
    expect(r.lt2.to).toBeCloseTo(295, 0);
    expect(r.lt1.shift).toBeCloseTo(15, 0);
  });

  it('separates a lifted LT1 from a static LT2 — the base-training signature', () => {
    const curve = testHrCurve(bikeAnchor);
    const sessions = Array.from({ length: 8 }, (_, i) => ({
      date: new Date(NOW - (i + 1) * 3 * DAY).toISOString(),
      blocks: [
        // +20 W around LT1 …
        ...[205, 215].map((d) => ({ demand: d, sec: 1800, deltaHr: -localSlopeAt(curve, d) * 20 })),
        // … and nothing at all around LT2.
        ...[275, 285].map((d) => ({ demand: d, sec: 900, deltaHr: 0 })),
      ],
    }));
    const r = projectThresholdShift(sessions, bikeAnchor, { now: NOW });
    expect(r.lt1.shift).toBeCloseTo(20, 0);
    expect(Math.abs(r.lt2.shift)).toBeLessThan(2);
  });

  it('reads a detrained athlete as a threshold that has moved down', () => {
    const r = projectThresholdShift(
      sessionsShiftedBy(-18, { intensities: [275, 285] }), bikeAnchor, { now: NOW },
    );
    expect(r.lt2.shift).toBeCloseTo(-18, 0);
    expect(r.lt2.to).toBeLessThan(r.lt2.from);
  });

  it('leaves a threshold null when nothing was ridden near it', () => {
    const r = projectThresholdShift(
      sessionsShiftedBy(15, { intensities: [275, 285] }), bikeAnchor, { now: NOW },
    );
    expect(r.lt2).not.toBeNull();
    expect(r.lt1).toBeNull();
  });

  it('is not decided by one wild session', () => {
    const good = sessionsShiftedBy(10, { intensities: [275, 285], n: 8 });
    const rogue = {
      date: new Date(NOW - DAY).toISOString(),
      blocks: [{ demand: 280, sec: 3600, deltaHr: -40 }],
    };
    const r = projectThresholdShift([...good, rogue], bikeAnchor, { now: NOW });
    expect(r.lt2.shift).toBeGreaterThan(8);
    expect(r.lt2.shift).toBeLessThan(14);
  });

  it('leans on recent sessions over old ones', () => {
    const curve = testHrCurve(bikeAnchor);
    const at = (days, shiftW) => Array.from({ length: 6 }, (_, i) => ({
      date: new Date(NOW - (days + i) * DAY).toISOString(),
      blocks: [275, 285].map((d) => ({ demand: d, sec: 1800, deltaHr: -localSlopeAt(curve, d) * shiftW })),
    }));
    // Two months ago the athlete was +2 W; this month they are +20 W.
    const r = projectThresholdShift([...at(60, 2), ...at(2, 20)], bikeAnchor, { now: NOW });
    expect(r.lt2.shift).toBeGreaterThan(12);
  });

  it('will not project from a handful of blocks', () => {
    const thin = [{ date: new Date(NOW - DAY).toISOString(), blocks: [{ demand: 280, sec: 600, deltaHr: -4 }] }];
    expect(projectThresholdShift(thin, bikeAnchor, { now: NOW })).toBeNull();
  });

  it('refuses a shift too large to be fitness', () => {
    // A footpod a few percent out, divided by a shallow slope, produces these.
    const r = projectThresholdShift(
      sessionsShiftedBy(90, { intensities: [275, 285] }), bikeAnchor, { now: NOW },
    );
    expect(r).toBeNull();
  });

  it('marks a large but survivable shift as a hint, not a number', () => {
    const r = projectThresholdShift(
      sessionsShiftedBy(45, { intensities: [275, 285] }), bikeAnchor, { now: NOW },
    );
    expect(r.lt2.confidence).toBe('low');
    expect(r.lt2.shift).toBeCloseTo(45, 0);
  });

  it('gives up without a usable test or any sessions', () => {
    expect(projectThresholdShift([], bikeAnchor)).toBeNull();
    expect(projectThresholdShift([{ date: new Date().toISOString(), blocks: [] }], null)).toBeNull();
  });
});

describe('projectThresholdTimeline', () => {
  const DAY = 86400000;
  const NOW = Date.parse('2026-08-27T00:00:00Z');
  const curve = () => testHrCurve(bikeAnchor);

  /** Sessions every other day, whose implied shift follows `shiftAtDay`. */
  const season = (days, shiftAtDay) => {
    const out = [];
    for (let d = days; d >= 0; d -= 2) {
      const w = shiftAtDay(days - d);
      out.push({
        date: new Date(NOW - d * DAY).toISOString(),
        blocks: [275, 285].map((dem) => ({
          demand: dem, sec: 1800, deltaHr: -localSlopeAt(curve(), dem) * w,
        })),
      });
    }
    return out;
  };

  it('draws a rising threshold as a rising line', () => {
    // +0.15 W a day over 120 days — about +18 W across the block.
    const t = projectThresholdTimeline(season(120, (day) => day * 0.15), bikeAnchor, { now: NOW });
    expect(t.length).toBeGreaterThan(8);
    expect(t[t.length - 1].lt2).toBeGreaterThan(t[0].lt2 + 8);
  });

  it('holds flat when nothing is changing', () => {
    const t = projectThresholdTimeline(season(120, () => 6), bikeAnchor, { now: NOW });
    const values = t.map((p) => p.lt2).filter(Number.isFinite);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(4);
  });

  it('turns over when the athlete does', () => {
    // Up for two months, then back down.
    const t = projectThresholdTimeline(
      season(120, (day) => (day < 60 ? day * 0.3 : (120 - day) * 0.3)), bikeAnchor, { now: NOW },
    );
    const peak = Math.max(...t.map((p) => p.lt2));
    expect(peak).toBeGreaterThan(t[0].lt2);
    expect(t[t.length - 1].lt2).toBeLessThan(peak - 5);
  });

  it('never lets a point see the future', () => {
    // Nothing happens for two months, then a big jump. Early points must not
    // know about it — a line fitted with hindsight is not a line anyone could
    // have acted on.
    const sessions = [
      ...season(120, () => 0).filter((x) => new Date(x.date).getTime() < NOW - 60 * DAY),
      ...season(50, () => 30).filter((x) => new Date(x.date).getTime() > NOW - 50 * DAY),
    ];
    const t = projectThresholdTimeline(sessions, bikeAnchor, { now: NOW });
    const early = t.find((p) => new Date(p.date).getTime() < NOW - 70 * DAY);
    expect(early.lt2).toBeCloseTo(280, 0);
  });

  it('steps at the interval it is asked for', () => {
    const weekly = projectThresholdTimeline(season(120, () => 5), bikeAnchor, { now: NOW });
    const fortnightly = projectThresholdTimeline(season(120, () => 5), bikeAnchor, { now: NOW, stepDays: 14 });
    expect(fortnightly.length).toBeLessThan(weekly.length);
  });

  it('says nothing when there is nothing to say', () => {
    expect(projectThresholdTimeline([], bikeAnchor)).toEqual([]);
    expect(projectThresholdTimeline(season(4, () => 5), bikeAnchor, { now: NOW })).toEqual([]);
  });
});

describe('zoneAgreement', () => {
  const DEMAND = [100, 160, 210, 250, 280, 340];
  const HR = [90, 125, 145, 158, 170, 195];
  const bin = (demand, hr, sec = 30) => ({ demand, hr, sec, t: 0 });

  it('splits the same session across both metrics', () => {
    const r = zoneAgreement([bin(180, 135), bin(180, 135), bin(265, 165)], { demandBounds: DEMAND, hrBounds: HR });
    expect(r.totalSec).toBe(90);
    expect(r.demandSec[1]).toBe(60);   // 180 W is Z2
    expect(r.hrSec[1]).toBe(60);       // 135 bpm is Z2
    expect(r.demandSec[3]).toBe(30);   // 265 W is Z4
  });

  it('spots a heart rate running hotter than the power', () => {
    // Z2 power all session, but the heart is a zone above it throughout.
    const cloud = Array.from({ length: 20 }, () => bin(180, 150));
    const r = zoneAgreement(cloud, { demandBounds: DEMAND, hrBounds: HR });
    expect(r.verdict).toBe('hr-higher');
    expect(r.agreeSec).toBe(0);
  });

  it('spots a heart rate lagging the power, as short intervals look', () => {
    const cloud = Array.from({ length: 20 }, () => bin(300, 130));
    expect(zoneAgreement(cloud, { demandBounds: DEMAND, hrBounds: HR }).verdict).toBe('hr-lower');
  });

  it('calls a session aligned when the two agree', () => {
    const cloud = Array.from({ length: 20 }, () => bin(180, 135));
    const r = zoneAgreement(cloud, { demandBounds: DEMAND, hrBounds: HR });
    expect(r.verdict).toBe('aligned');
    expect(r.agreeSec).toBe(r.totalSec);
  });

  it('does not call a lean on a handful of boundary bins', () => {
    // Nine tenths aligned, one bin over the line — not a story.
    const cloud = [...Array.from({ length: 18 }, () => bin(180, 135)), bin(180, 150), bin(180, 135)];
    expect(zoneAgreement(cloud, { demandBounds: DEMAND, hrBounds: HR }).verdict).toBe('aligned');
  });

  it('clamps values outside the zone range instead of dropping them', () => {
    const r = zoneAgreement([bin(40, 60), bin(500, 210)], { demandBounds: DEMAND, hrBounds: HR });
    expect(r.demandSec[0]).toBe(30);
    expect(r.demandSec[4]).toBe(30);
    expect(r.totalSec).toBe(60);
  });

  it('gives up without usable bounds', () => {
    expect(zoneAgreement([bin(180, 135)], { demandBounds: [1, 2, 3], hrBounds: HR })).toBeNull();
    expect(zoneAgreement([], { demandBounds: DEMAND, hrBounds: HR })).toBeNull();
  });
});

describe('lactateCurveShift', () => {
  // The fixture curve: 150→1.0, 180→1.7, 210→2.4, 240→3.1, 270→3.8, 300→4.5.
  const shiftOf = (samples) => lactateCurveShift(bikeAnchor, samples);

  it('reads a right-shifted curve out of blood values', () => {
    // Test needed 240 W for 3.1 mmol; the athlete now hits 3.1 at 265 W.
    const r = shiftOf([{ demand: 265, lactate: 3.1 }]);
    expect(r.shift).toBeCloseTo(25, 1);
    expect(r.samples[0].expectedDemand).toBeCloseTo(240, 6);
  });

  it('reads a left-shifted curve as lost fitness', () => {
    const r = shiftOf([{ demand: 220, lactate: 3.1 }]);
    expect(r.shift).toBeCloseTo(-20, 1);
  });

  it('also reports what the test expected at the measured intensity', () => {
    const r = shiftOf([{ demand: 240, lactate: 2.4 }]);
    // 240 W was a 3.1 mmol stage; the sample came in a full 0.7 lower.
    expect(r.samples[0].expectedLactate).toBeCloseTo(3.1, 6);
    expect(r.shift).toBeGreaterThan(0);
  });

  it('agrees with itself across several samples and calls that confident', () => {
    const r = shiftOf([
      { demand: 235, lactate: 1.7 },   // test: 180 → +55? no: 1.7 is the 180 W stage
      { demand: 265, lactate: 3.1 },
      { demand: 295, lactate: 3.8 },
    ]);
    expect(r.n).toBe(3);
    // Two of the three agree at +25; the median must not be dragged by the outlier.
    expect(r.shift).toBeCloseTo(25, 0);
  });

  it('will not invert a lactate outside the tested range', () => {
    expect(shiftOf([{ demand: 300, lactate: 9.5 }])).toBeNull();
    expect(shiftOf([{ demand: 150, lactate: 0.4 }])).toBeNull();
  });

  it('will not invert a flat rung of the curve', () => {
    const flat = {
      ...bikeAnchor,
      points: [150, 180, 210, 240, 270, 300].map((p) => ({ x: p, y: 2.0, hr: 140 })),
    };
    expect(lactateCurveShift(flat, [{ demand: 240, lactate: 2.0 }])).toBeNull();
  });

  it('treats a single sample as an anecdote', () => {
    expect(shiftOf([{ demand: 265, lactate: 3.1 }]).confidence).toBe('low');
    const agreeing = shiftOf([
      { demand: 265, lactate: 3.1 },
      { demand: 295, lactate: 3.8 },
      { demand: 235, lactate: 2.4 },
    ]);
    expect(agreeing.confidence).toBe('high');
  });

  it('is unmoved by samples it cannot place', () => {
    const r = shiftOf([{ demand: 265, lactate: 3.1 }, { demand: 300, lactate: 12 }]);
    expect(r.n).toBe(1);
  });

  it('gives up without a usable test', () => {
    expect(lactateCurveShift(null, [{ demand: 265, lactate: 3.1 }])).toBeNull();
    expect(lactateCurveShift(bikeAnchor, [])).toBeNull();
  });
});

describe('gradeFactor', () => {
  it('costs more uphill and less downhill', () => {
    expect(gradeFactor(0)).toBeCloseTo(1, 3);
    expect(gradeFactor(0.05)).toBeGreaterThan(1.2);
    expect(gradeFactor(-0.05)).toBeLessThan(0.9);
  });

  it('clamps gradients beyond the range the cost curve was measured over', () => {
    expect(gradeFactor(5)).toBe(gradeFactor(0.3));
    expect(gradeFactor(-5)).toBe(gradeFactor(-0.3));
  });
});

// ── History ────────────────────────────────────────────────────────────────

describe('buildDriftHistory', () => {
  /** Twelve weeks at +1.6 W/week, three sessions a week, with day-to-day wobble. */
  const twelveWeeks = () => {
    const out = [];
    for (let wk = 0; wk < 12; wk += 1) {
      for (let s = 0; s < 3; s += 1) {
        out.push({
          date: new Date(Date.now() - (84 - wk * 7 - s * 2) * 86400000).toISOString(),
          title: `Endurance ${wk}.${s}`,
          result: analyseSession({
            records: ride(NARROW, { gainW: wk * 1.6 + [4, -5, 2][s], seed: wk * 10 + s }),
            sport: 'bike',
            anchor: bikeAnchor,
          }),
        });
      }
    }
    return out;
  };

  it('tracks the underlying trend rather than the last session', () => {
    const { series, latest } = buildDriftHistory(twelveWeeks(), {
      testDate: new Date(Date.now() - 84 * 86400000),
    });
    expect(series).toHaveLength(36);
    // The rolling median lags the noisy per-session value but climbs with it.
    expect(latest.trendDelta).toBeGreaterThan(12);
    expect(latest.trendDelta).toBeLessThan(latest.deltaDemand);
    expect(series[0].trendDelta).toBeLessThan(latest.trendDelta);
  });

  it('asks for a retest once the trend is large, repeated and the test is old', () => {
    const { retest } = buildDriftHistory(twelveWeeks(), {
      testDate: new Date(Date.now() - 84 * 86400000),
    });
    expect(retest).toMatchObject({ direction: 'up' });
    expect(retest.trendPct).toBeGreaterThan(3);
    expect(retest.sessions).toBeGreaterThanOrEqual(3);
  });

  it('stays quiet when the test is only days old', () => {
    const { retest } = buildDriftHistory(twelveWeeks(), { testDate: new Date() });
    expect(retest).toBeNull();
  });

  it('stays quiet on a session that could not be read', () => {
    const { series, latest, retest } = buildDriftHistory(
      [{ date: new Date().toISOString(), result: { ok: false, reason: 'not-enough-steady-state' } }],
      { testDate: new Date(Date.now() - 84 * 86400000) },
    );
    expect(series).toHaveLength(0);
    expect(latest).toBeNull();
    expect(retest).toBeNull();
  });
});
