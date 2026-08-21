/**
 * Manual LaChart trainings must carry load. Plain Node, no jest — run with:
 *
 *   node server/utils/trainingLoadTss.test.js
 *
 * Both fitness surfaces mapped these to tss: 0, so a hand-entered session
 * counted as a rest day and the dashboard (which computes client-side) drifted
 * away from the Training Calendar (which reads the server).
 */

'use strict';

const assert = require('assert');
const { resolveActivityTss, dedupeActivitiesForLoad } = require('./activityTss');
const {
  trainingDurationSeconds,
  mapTrainingToLoad,
} = require('../controllers/fitnessMetricsController');

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

const profile = {
  powerZones: { cycling: { lt2: 300 } },
  ftp: 300,
  maxHeartRate: 190,
  restingHeartRate: 50,
  lthr: 165,
};

/** Mirrors mapTrainingToLoad's shaping in fitnessMetricsController. */
const shape = (t) => ({
  sport: t.sport,
  movingTime: t.movingTime,
  distance: t.distance,
  avgPower: t.avgPower,
  averageHeartRate: t.avgHR,
  avgHeartRate: t.avgHR,
  maxHeartRate: t.maxHR,
  tss: t.tss,
  tssDisplayMode: t.tssDisplayMode,
});

console.log('a manual training is not a rest day');

test('a typed TSS is used as typed', () => {
  const tss = resolveActivityTss(shape({ sport: 'bike', movingTime: 3600, tss: 88 }), profile);
  assert.strictEqual(tss, 88);
});

test('no typed TSS: derived from power rather than dropped', () => {
  const tss = resolveActivityTss(shape({ sport: 'bike', movingTime: 3600, avgPower: 300 }), profile);
  assert.ok(tss > 0, `expected a positive TSS, got ${tss}`);
});

test('no power: derived from heart rate', () => {
  const tss = resolveActivityTss(shape({ sport: 'run', movingTime: 3600, avgHR: 160 }), profile);
  assert.ok(tss > 0, `expected a positive TSS, got ${tss}`);
});

test('an explicit hr mode is honoured over power', () => {
  const base = { sport: 'bike', movingTime: 3600, avgPower: 300, avgHR: 130 };
  const asPower = resolveActivityTss(shape({ ...base, tssDisplayMode: 'power' }), profile);
  const asHr = resolveActivityTss(shape({ ...base, tssDisplayMode: 'hr' }), profile);
  assert.notStrictEqual(asPower, asHr);
  assert.ok(asHr > 0 && asPower > 0);
});

test('a session with nothing to go on is still zero — no invented load', () => {
  assert.strictEqual(resolveActivityTss(shape({ sport: 'bike' }), profile), 0);
});

console.log('and it does not get counted twice');

test('a training mirroring a synced ride collapses into one, keeping the larger TSS', () => {
  const day = new Date('2026-08-20T09:00:00');
  const merged = dedupeActivitiesForLoad([
    { date: day, sport: 'Ride', tss: 95, movingTime: 3600 },
    { date: day, sport: 'bike', tss: 88, movingTime: 3600 },
  ]);
  assert.strictEqual(merged.length, 1, 'should have collapsed to one entry');
  assert.strictEqual(merged[0].tss, 95);
});

test('two genuinely different sessions on one day both survive', () => {
  const merged = dedupeActivitiesForLoad([
    { date: new Date('2026-08-20T07:00:00'), sport: 'bike', tss: 60, movingTime: 3600 },
    { date: new Date('2026-08-20T17:00:00'), sport: 'bike', tss: 40, movingTime: 1800 },
  ]);
  assert.strictEqual(merged.length, 2);
});

test('a swim and a ride on one day are not merged', () => {
  const day = new Date('2026-08-20T09:00:00');
  const merged = dedupeActivitiesForLoad([
    { date: day, sport: 'swim', tss: 50, movingTime: 3600 },
    { date: day, sport: 'bike', tss: 70, movingTime: 3600 },
  ]);
  assert.strictEqual(merged.length, 2);
});

console.log('reading the duration Training actually stores');

// `duration` on the Training model is an "H:MM:SS" string, not seconds. Feeding
// that straight to the TSS maths yields NaN, which reads as "no duration" and
// silently drops the session back to zero — the bug wearing a different hat.
[
  [{ movingTime: 3600, duration: '9:99:99' }, 3600, 'movingTime wins over the text'],
  [{ duration: '1:30:00' }, 5400, 'H:MM:SS'],
  [{ duration: '45:00' }, 2700, 'MM:SS'],
  [{ duration: 1800 }, 1800, 'plain seconds'],
  [{ duration: '1800' }, 1800, 'seconds as a string'],
  [{ movingTime: 0, duration: '0:20:00' }, 1200, 'a zero movingTime falls through'],
  [{}, 0, 'nothing to read'],
  [{ duration: 'abc' }, 0, 'junk'],
  [{ duration: 'a:b:c' }, 0, 'junk that looks like a clock'],
  [null, 0, 'no training at all'],
].forEach(([input, want, name]) => {
  test(name, () => assert.strictEqual(trainingDurationSeconds(input), want));
});

test('an "H:MM:SS" training still earns a TSS end to end', () => {
  const row = mapTrainingToLoad(
    { date: new Date('2026-08-20'), sport: 'bike', duration: '1:00:00', avgPower: 300 },
    profile,
  );
  assert.ok(row.tss > 0, `expected a positive TSS, got ${row.tss}`);
  assert.strictEqual(row.movingTime, 3600, 'duration must travel for the dedupe to match on length');
});

console.log(`\n${passed} passed`);
