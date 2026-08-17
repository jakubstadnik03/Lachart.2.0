/**
 * Apple Health ↔ Strava/Garmin duplicate detection. Plain Node, no jest — the
 * server has no test runner configured, and this module deliberately has no
 * database imports so it can be checked with:
 *
 *   node server/utils/appleHealthDuplicate.test.js
 */

'use strict';

const assert = require('assert');
const { findExternalDuplicate } = require('./appleHealthDuplicate');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

// ── Fixtures ───────────────────────────────────────────────────────
// One 40 km ride at 08:00, as Strava saw it: 4 500 s moving time.

const START = new Date('2026-08-10T08:00:00.000Z');
const startMs = START.getTime();
const MIN = 60 * 1000;

const stravaRide = {
  source: 'strava',
  name: 'Morning Ride',
  startDate: START,
  distance: 40000,
  movingTime: 4500,
  elapsedTime: 4800,
};

const garminRun = {
  source: 'garmin',
  name: 'Evening Run',
  startDate: new Date('2026-08-10T17:30:00.000Z'),
  distance: 10000,
  durationSeconds: 3000,
};

console.log('appleHealthDuplicate');

// ── Start-time window ──────────────────────────────────────────────

test('the same ride from Strava is a duplicate', () => {
  const hit = findExternalDuplicate([stravaRide], {
    startMs,
    distanceMeters: 40100,
    durationSeconds: 4800,
  });
  assert.ok(hit, 'expected a match');
  assert.strictEqual(hit.source, 'strava');
});

test('watch and phone clocks 6 minutes apart still match', () => {
  const hit = findExternalDuplicate([stravaRide], {
    startMs: startMs + 6 * MIN,
    distanceMeters: 40000,
    durationSeconds: 4800,
  });
  assert.ok(hit, 'expected a match inside the 10 min window');
});

test('a session starting 30 minutes later is a different session', () => {
  const hit = findExternalDuplicate([stravaRide], {
    startMs: startMs + 30 * MIN,
    distanceMeters: 40000,
    durationSeconds: 4800,
  });
  assert.strictEqual(hit, null);
});

// ── Distance beats duration ────────────────────────────────────────

test('Apple elapsed vs Strava moving time does not break the match', () => {
  // 4800 s elapsed vs 4500 s moving — 300 s apart, same distance.
  const hit = findExternalDuplicate([stravaRide], {
    startMs,
    distanceMeters: 39900,
    durationSeconds: 4800,
  });
  assert.ok(hit, 'distance should decide when both sides have one');
});

test('a 10% shorter route at the same time is a different activity', () => {
  const hit = findExternalDuplicate([stravaRide], {
    startMs,
    distanceMeters: 36000,
    durationSeconds: 4500,
  });
  assert.strictEqual(hit, null);
});

// ── Duration fallback (indoor / no distance) ───────────────────────

test('indoor sessions without distance fall back to duration', () => {
  const indoor = { source: 'garmin', startDate: START, distance: 0, durationSeconds: 3600 };
  const hit = findExternalDuplicate([indoor], {
    startMs,
    distanceMeters: 0,
    durationSeconds: 3700,
  });
  assert.ok(hit, 'expected a match within the duration tolerance');
});

test('a much longer indoor session is not the same one', () => {
  const indoor = { source: 'garmin', startDate: START, distance: 0, durationSeconds: 3600 };
  const hit = findExternalDuplicate([indoor], {
    startMs,
    distanceMeters: 0,
    durationSeconds: 7200,
  });
  assert.strictEqual(hit, null);
});

test('a stray sub-100 m distance does not count as comparable', () => {
  // Treadmill run reporting 40 m: falls through to the duration check
  // instead of failing the distance comparison against a 10 km run.
  const treadmill = { source: 'strava', startDate: START, distance: 40, movingTime: 1800 };
  const hit = findExternalDuplicate([treadmill], {
    startMs,
    distanceMeters: 60,
    durationSeconds: 1850,
  });
  assert.ok(hit, 'expected the duration fallback to decide');
});

test('nothing comparable at all, same start — treat as the same session', () => {
  const bare = { source: 'strava', startDate: START };
  const hit = findExternalDuplicate([bare], { startMs, distanceMeters: 0, durationSeconds: 0 });
  assert.ok(hit, 'a session at the same minute is not a coincidence');
});

// ── Selection across candidates ────────────────────────────────────

test('picks the matching activity out of the day, not the first one', () => {
  const hit = findExternalDuplicate([garminRun, stravaRide], {
    startMs,
    distanceMeters: 40000,
    durationSeconds: 4800,
  });
  assert.ok(hit);
  assert.strictEqual(hit.name, 'Morning Ride');
});

test('no candidates means importable', () => {
  assert.strictEqual(findExternalDuplicate([], { startMs, distanceMeters: 40000 }), null);
});

test('unusable input never throws', () => {
  assert.strictEqual(findExternalDuplicate(null, { startMs }), null);
  assert.strictEqual(findExternalDuplicate([stravaRide], { startMs: NaN }), null);
  assert.strictEqual(findExternalDuplicate([{ startDate: 'not a date' }], { startMs }), null);
});

console.log(`\n${passed} passed`);
