/**
 * Pool-swim lap distances from a FIT file. Plain Node, no jest — run with:
 *
 *   node server/utils/fitPoolSwimLaps.test.js
 *
 * The session these are built from is real: 2700 m over 108 active lengths in
 * a 25 m pool, sixteen laps, which arrived from Garmin's Health API with every
 * lap distance empty because a pool has no GPS to sample.
 */

'use strict';

const assert = require('assert');
const { poolSwimLapDistances, resolvePoolLength } = require('./fitPoolSwimLaps');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

/** 400 warm-up, 8×100 with rests between, 200 down — as the watch would write it. */
function buildSwim({ statePoolLength = true, lapDistances = false } = {}) {
  const lengths = [];
  const laps = [];
  let t = 0;
  let idx = 0;

  // messageIndex is 0-based in FIT, and firstLengthIndex points at the first
  // of the run — so the index is assigned before it advances, not after.
  const swim = (metres, secPer25) => {
    const first = idx;
    for (let i = 0; i < metres / 25; i += 1) {
      lengths.push({ messageIndex: idx, startTime: t, lengthType: 'active', totalElapsedTime: secPer25 });
      idx += 1;
      t += secPer25;
    }
    return { first, count: metres / 25 };
  };
  const rest = (sec) => {
    const first = idx;
    lengths.push({ messageIndex: idx, startTime: t, lengthType: 'idle', totalElapsedTime: sec });
    idx += 1;
    t += sec;
    return { first, count: 1 };
  };
  const lap = (start, dur, run, active, metres) => {
    const l = {
      startTime: start,
      totalElapsedTime: dur,
      firstLengthIndex: run.first,
      numLengths: run.count,
      numActiveLengths: active,
    };
    if (lapDistances) l.totalDistance = metres;
    laps.push(l);
  };

  let s = t; let r = swim(400, 25); lap(s, t - s, r, 16, 400);
  for (let i = 0; i < 8; i += 1) {
    s = t; r = swim(100, 21); lap(s, t - s, r, 4, 100);
    s = t; r = rest(20);      lap(s, t - s, r, 0, 0);
  }
  s = t; r = swim(200, 25); lap(s, t - s, r, 8, 200);

  const session = {
    totalDistance: 1400,
    ...(statePoolLength ? { poolLength: 25 } : {}),
  };
  return { sessionMesgs: [session], lapMesgs: laps, lengthMesgs: lengths };
}

console.log('fitPoolSwimLaps');

test('reads the distance the watch itself recorded', () => {
  const out = poolSwimLapDistances(buildSwim({ lapDistances: true }));
  assert.strictEqual(out.length, 18);
  assert.strictEqual(out[0].distance, 400);
  assert.strictEqual(out[1].distance, 100);
  assert.strictEqual(out[2].distance, 0, 'a rest covers nothing');
  assert.strictEqual(out[17].distance, 200);
});

test('counts lengths when the lap records no distance', () => {
  const out = poolSwimLapDistances(buildSwim({ lapDistances: false }));
  assert.strictEqual(out[0].distance, 400);
  assert.strictEqual(out[1].distance, 100);
  assert.strictEqual(out[2].distance, 0);
  const total = out.reduce((a, l) => a + (l.distance || 0), 0);
  assert.strictEqual(total, 1400, `laps must add to the session, got ${total}`);
});

test('falls back to the length index range when the count is missing', () => {
  const swim = buildSwim({ lapDistances: false });
  swim.lapMesgs.forEach((l) => { delete l.numActiveLengths; });
  const out = poolSwimLapDistances(swim);
  assert.strictEqual(out[0].distance, 400);
  assert.strictEqual(out[1].distance, 100);
  assert.strictEqual(out[2].distance, 0);
});

test('falls back to matching lengths by time when the lap names none', () => {
  const swim = buildSwim({ lapDistances: false });
  swim.lapMesgs.forEach((l) => {
    delete l.numActiveLengths; delete l.firstLengthIndex; delete l.numLengths;
  });
  const out = poolSwimLapDistances(swim);
  assert.strictEqual(out[0].distance, 400);
  assert.strictEqual(out[1].distance, 100);
  assert.strictEqual(out[2].distance, 0);
});

test('works out the pool from the totals when the session does not state it', () => {
  // 2700 m over 108 active lengths is a 25 m pool, exactly.
  assert.strictEqual(
    resolvePoolLength({ totalDistance: 2700 }, Array.from({ length: 108 }, () => ({ lengthType: 'active' }))),
    25,
  );
  const out = poolSwimLapDistances(buildSwim({ statePoolLength: false, lapDistances: false }));
  assert.strictEqual(out[0].distance, 400);
});

test('reads the other parser\'s spelling too', () => {
  const out = poolSwimLapDistances({
    sessions: [{ pool_length: 25, total_distance: 100 }],
    laps: [{ total_distance: 100, num_active_lengths: 4 }],
    lengths: Array.from({ length: 4 }, (_, i) => ({ message_index: i, length_type: 1 })),
  });
  assert.strictEqual(out[0].distance, 100);
});

test('says nothing rather than inventing a number', () => {
  assert.deepStrictEqual(poolSwimLapDistances(null), []);
  assert.deepStrictEqual(poolSwimLapDistances({ lapMesgs: [] }), []);
  // A lap with no distance, no counts and no times cannot be placed.
  const out = poolSwimLapDistances({ sessionMesgs: [{}], lapMesgs: [{}], lengthMesgs: [] });
  assert.strictEqual(out[0].distance, null);
});

console.log(`\n${passed} passed`);
