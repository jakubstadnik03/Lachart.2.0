/**
 * Server side of the threshold-drift read. Plain Node, no jest — run with:
 *
 *   node server/services/thresholdDrift.test.js
 *
 * The engine's own maths is covered by client/src/utils/hrPowerProfile.test.js
 * and the server copy is generated from that same source, so what is tested
 * here is only what the server adds: turning three storage shapes into records,
 * pulling an anchor out of a Test document, and agreeing with the client to the
 * watt on identical input.
 */

'use strict';

const assert = require('assert');
const { extractAnchor } = require('../utils/lactateAnchor');
const { analyseSession, testHrSlope } = require('../utils/hrPowerProfile');
const { recordsFromStreams } = require('./thresholdDriftService');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
    process.exitCode = 1;
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const TEST_DOC = {
  _id: 'test-1',
  sport: 'bike',
  date: new Date('2026-06-12'),
  baseLactate: 1.0,
  results: [150, 180, 210, 240, 270, 300].map((p, i) => ({
    interval: i + 1,
    power: p,
    lactate: [0.9, 1.1, 1.5, 2.2, 3.6, 5.8][i],
    heartRate: [124, 134, 145, 156, 166, 177][i],
  })),
};

const START = '2026-07-01T08:00:00.000Z';

/** A ride whose LT2 has moved by `gainW`, in the units streams arrive in. */
function streamRide({ gainW, slope, lag = 30, drift = 3 }) {
  const blocks = [[600, 120], ...[200, 232, 251, 215, 268, 226, 245, 258].map((w) => [480, w])];
  const watts = [];
  for (const [dur, w] of blocks) for (let k = 0; k < dur; k += 1) watts.push(w);
  // Offset that puts the athlete's LT2 at (lt2 + gainW) for the given LT2 HR.
  // These are TEST_DOC's own LT2 and LT2 HR — keep them in step with the
  // assertions below, or the ride is built around a threshold the anchor does
  // not hold and every deltaDemand carries that gap as a silent bias.
  const lt2 = 269.89482996386636;
  const lt2Hr = 166;
  const a = lt2Hr - slope * (lt2 + gainW);
  const time = watts.map((_, i) => i);
  const heartrate = watts.map((_, i) => a + slope * watts[Math.max(0, i - lag)] + drift * (i / 3600));
  return { time, watts, heartrate };
}

// ── recordsFromStreams ─────────────────────────────────────────────────────

test('reads the wrapped stream shape the Strava sync stores', () => {
  const recs = recordsFromStreams(
    { time: { data: [0, 1, 2] }, watts: { data: [200, 205, 210] }, heartrate: { data: [140, 141, 142] } },
    START,
  );
  assert.strictEqual(recs.length, 3);
  assert.strictEqual(recs[1].power, 205);
  assert.strictEqual(recs[1].heartRate, 141);
  assert.strictEqual(recs[0].timestamp, START);
});

test('reads the bare stream shape the backfill stores', () => {
  const recs = recordsFromStreams(
    { time: [0, 1, 2], watts: [200, 205, 210], heartrate: [140, 141, 142] },
    START,
  );
  assert.strictEqual(recs.length, 3);
  assert.strictEqual(recs[2].power, 210);
});

test('carries the channels a run needs, and nulls the zeros', () => {
  const recs = recordsFromStreams(
    {
      time: [0, 1],
      heartrate: [150, 151],
      velocity_smooth: [3.4, 0],
      altitude: [220, 221],
      distance: [0, 3.4],
      watts: [],
    },
    START,
  );
  assert.strictEqual(recs[0].speed, 3.4);
  assert.strictEqual(recs[1].speed, null, 'a zero speed sample is a stop, not a speed');
  assert.strictEqual(recs[0].altitude, 220);
  assert.strictEqual(recs[1].distance, 3.4);
  assert.strictEqual(recs[0].power, null);
});

test('returns nothing when the stream has no time channel', () => {
  assert.deepStrictEqual(recordsFromStreams({ watts: [1, 2, 3] }, START), []);
  assert.deepStrictEqual(recordsFromStreams(null, START), []);
});

test('returns nothing when the start date is unusable', () => {
  assert.deepStrictEqual(recordsFromStreams({ time: [0, 1] }, 'not-a-date'), []);
});

// ── extractAnchor ──────────────────────────────────────────────────────────

// The four numbers below moved in c711211f ("One engine for LT1 and LT2, read
// off a monotone curve"), which replaced the stage-picking pipeline this file
// was written against. The old answers snapped to measured stages: LT1 was
// stage 2's load (180 W) and its HR (134), LT2 was the OBLA 3.5 pick. On this
// fixture 180 W is where lactate reads 1.1 against a 0.9 floor — still the
// baseline, not a threshold, and LT1/LT2 = 0.67, far wider than an athlete
// produces. The engine now reads both off a Fritsch-Carlson curve through the
// stages: LT1 = 0.7 x the crossing at baseline + 0.8 mmol/L (220.59 W) + 0.3 x
// the median of the log-log and segmented bend points (226.20 W) = 222.27 W,
// where lactate is 1.74 mmol/L, and LT2 = 269.89 W at 3.59 mmol/L -- ratio
// 0.82. Both HRs follow from the test's own HR curve read at those loads.
test('derives LT1/LT2 and their heart rates from a test', () => {
  const a = extractAnchor(TEST_DOC);
  assert.ok(a, 'anchor should exist');
  assert.ok(Math.abs(a.lt1 - 222.27) < 0.1, `lt1 was ${a.lt1}`);
  assert.ok(Math.abs(a.lt2 - 269.89) < 0.1, `lt2 was ${a.lt2}`);
  assert.strictEqual(a.lt1Hr, 149);
  assert.strictEqual(a.lt2Hr, 166);
  assert.strictEqual(a.points.length, 6);
});

test('a pinned threshold beats the calculated one', () => {
  const a = extractAnchor({ ...TEST_DOC, thresholdOverrides: { LTP2: 285, LTP2_hr: 172 } });
  assert.strictEqual(a.lt2, 285);
  assert.strictEqual(a.lt2Hr, 172);
  assert.ok(Math.abs(a.lt1 - 222.27) < 0.1, `an LT2 override must not disturb LT1; lt1 was ${a.lt1}`);
});

test('an absent override does not read as a threshold of zero', () => {
  // Number('') is 0 and Number.isFinite(0) is true, so the naive numeric parse
  // reports every missing override as a real zero and skips the curve entirely.
  const a = extractAnchor({ ...TEST_DOC, thresholdOverrides: {} });
  assert.ok(a.lt2 > 200, `lt2 fell back to ${a && a.lt2}`);
});

test('gives up on a test with too few stages instead of guessing', () => {
  assert.strictEqual(extractAnchor({ sport: 'bike', results: [] }), null);
  assert.strictEqual(extractAnchor(null), null);
});

test('excludes cool-down samples flagged as recovery from the slope points', () => {
  const withRecovery = {
    ...TEST_DOC,
    results: [...TEST_DOC.results, { interval: 7, power: 100, lactate: 4.2, heartRate: 120, intervalType: 'recovery' }],
  };
  assert.strictEqual(extractAnchor(withRecovery).points.length, 6);
});

// ── End to end, on the server's own copy of the engine ─────────────────────

test('recovers a known threshold shift from streams alone', () => {
  const anchor = extractAnchor(TEST_DOC);
  const slope = testHrSlope(anchor).slope;
  for (const gainW of [15, 0, -20]) {
    const streams = streamRide({ gainW, slope });
    const records = recordsFromStreams(streams, START);
    const r = analyseSession({ records, sport: 'bike', anchor, slopeFit: testHrSlope(anchor) });
    assert.ok(r.ok, `session should read (${r.reason})`);
    assert.ok(
      Math.abs(r.deltaDemand - gainW) < 1.5,
      `expected ~${gainW} W, got ${r.deltaDemand.toFixed(1)} W`,
    );
  }
});

test('still refuses an interval session when fed through the stream path', () => {
  const anchor = extractAnchor(TEST_DOC);
  const watts = [];
  for (let k = 0; k < 600; k += 1) watts.push(120);
  for (let rep = 0; rep < 5; rep += 1) {
    for (let k = 0; k < 240; k += 1) watts.push(330);
    for (let k = 0; k < 240; k += 1) watts.push(110);
  }
  const slope = testHrSlope(anchor).slope;
  const records = recordsFromStreams(
    {
      time: watts.map((_, i) => i),
      watts,
      heartrate: watts.map((_, i) => 60 + slope * watts[Math.max(0, i - 30)]),
    },
    START,
  );
  const r = analyseSession({ records, sport: 'bike', anchor });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'not-enough-steady-state');
});

console.log(`\n${passed} passed`);
