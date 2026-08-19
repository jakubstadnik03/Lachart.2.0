/**
 * Lap-regularity signal behind the "Intervals?" badge and the dashboard's
 * decision to chart an imported session. Plain Node, no jest — run with:
 *
 *   node server/utils/lapDurationStats.test.js
 */

'use strict';

const assert = require('assert');
const { lapDurationCv, lapDurationSeconds } = require('./lapDurationStats');

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

console.log('lapDurationCv');

test('identical repeats have no variation', () => {
  assert.strictEqual(lapDurationCv([300, 300, 300, 300]), 0);
});

test('near-identical repeats stay under the structured threshold (0.12)', () => {
  const cv = lapDurationCv([300, 305, 298, 302]);
  assert.ok(cv < 0.12, `expected < 0.12, got ${cv}`);
});

test('a randomly lapped ride lands well above it', () => {
  const cv = lapDurationCv([120, 3600, 240, 1800]);
  assert.ok(cv > 0.25, `expected > 0.25, got ${cv}`);
});

test('fewer than two usable laps is null, not zero — zero would read as perfect structure', () => {
  assert.strictEqual(lapDurationCv([300]), null);
  assert.strictEqual(lapDurationCv([]), null);
  assert.strictEqual(lapDurationCv([0, 0, 0]), null);
});

test('non-arrays and junk entries do not throw', () => {
  assert.strictEqual(lapDurationCv(null), null);
  assert.strictEqual(lapDurationCv(undefined), null);
  assert.strictEqual(lapDurationCv('nope'), null);
  assert.strictEqual(lapDurationCv([300, null, undefined, NaN, 300]), 0);
});

test('numeric strings are accepted — Mongo can hand these back as strings', () => {
  assert.strictEqual(lapDurationCv(['300', '300']), 0);
});

test('rounded to 3dp', () => {
  const cv = lapDurationCv([100, 200]);
  assert.strictEqual(cv, +cv.toFixed(3));
});

test('matches the textbook definition (population sd / mean)', () => {
  // [100, 300]: mean 200, population sd 100 -> cv 0.5
  assert.strictEqual(lapDurationCv([100, 300]), 0.5);
});

console.log('lapDurationSeconds');

test('prefers moving time, then the elapsed clocks', () => {
  assert.strictEqual(lapDurationSeconds({ moving_time: 290, elapsed_time: 300 }), 290);
  assert.strictEqual(lapDurationSeconds({ elapsed_time: 300 }), 300);
  assert.strictEqual(lapDurationSeconds({ totalTimerTime: 280 }), 280);
  assert.strictEqual(lapDurationSeconds({ totalElapsedTime: 310 }), 310);
});

test('a lap with no usable clock is zero, not NaN', () => {
  assert.strictEqual(lapDurationSeconds({}), 0);
  assert.strictEqual(lapDurationSeconds(null), 0);
  assert.strictEqual(lapDurationSeconds({ moving_time: 'abc' }), 0);
});

console.log(`\n${passed} passed`);
