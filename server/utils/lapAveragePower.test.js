/**
 * Average power from laps. Plain Node, no jest — run with:
 *
 *   node server/utils/lapAveragePower.test.js
 *
 * Every Garmin ride in prod (2026-11) had averagePower: null while its laps
 * carried watts, so lists that read the summary showed "—".
 */

'use strict';

const assert = require('assert');
const { averagePowerFromLaps } = require('./lapAveragePower');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

console.log('lapAveragePower');

test('weights laps by their length', () => {
  // 20 min at 250 W and 1 min at 400 W is 257.1 W, not the 325 W a plain mean gives.
  const laps = [{ average_watts: 250, moving_time: 1200 }, { average_watts: 400, moving_time: 60 }];
  assert.strictEqual(averagePowerFromLaps(laps), 257.1);
});

test('reads FIT-shaped laps too', () => {
  assert.strictEqual(averagePowerFromLaps([{ avgPower: 200, totalTimerTime: 600 }, { avgPower: 300, totalTimerTime: 600 }]), 250);
});

test('falls back to elapsed time when moving time is missing', () => {
  assert.strictEqual(averagePowerFromLaps([{ average_watts: 240, elapsed_time: 300 }, { average_watts: 260, elapsed_time: 300 }]), 250);
});

test('falls back to a plain mean only when no lap knows its length', () => {
  assert.strictEqual(averagePowerFromLaps([{ average_watts: 200 }, { average_watts: 300 }]), 250);
});

test('ignores laps without power rather than counting them as zero', () => {
  assert.strictEqual(averagePowerFromLaps([{ average_watts: 0, moving_time: 600 }, { average_watts: 280, moving_time: 600 }, { moving_time: 600 }]), 280);
});

test('answers null when there is nothing to average', () => {
  assert.strictEqual(averagePowerFromLaps([]), null);
  assert.strictEqual(averagePowerFromLaps(null), null);
  assert.strictEqual(averagePowerFromLaps([{ average_heartrate: 140, moving_time: 600 }]), null);
});

console.log(`\n${passed} passed`);
