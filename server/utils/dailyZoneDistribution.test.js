/**
 * Zone-boundary tests. Plain Node, like routeSignature.test.js:
 *
 *   node server/utils/dailyZoneDistribution.test.js
 */

'use strict';

const assert = require('assert');
const { boundariesFrom, zoneForHr } = require('./dailyZoneDistribution');

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

const ascending = (mins) => mins.every((m, i) => i === 0 || m > mins[i - 1]);

console.log('zone boundaries');

test('uses an explicit zone table when the athlete entered one', () => {
  const mins = boundariesFrom({
    zone1: { min: 100 }, zone2: { min: 130 }, zone3: { min: 150 },
    zone4: { min: 165 }, zone5: { min: 175 },
  });
  assert.deepStrictEqual(mins, [100, 130, 150, 165, 175]);
});

test('reads a table with the bottom of Z1 left blank', () => {
  // The zones modal writes undefined for any empty box, and athletes routinely
  // leave Z1's lower bound out because it has no meaningful value. Demanding
  // all five minimums threw away a table that was four-fifths filled in.
  const mins = boundariesFrom({
    zone1: { max: 129 }, zone2: { min: 130, max: 149 }, zone3: { min: 150, max: 164 },
    zone4: { min: 165, max: 174 }, zone5: { min: 175, max: 200 },
  });
  assert.ok(mins && ascending(mins), 'expected a usable table');
  assert.strictEqual(mins[1], 130);
  assert.strictEqual(mins[4], 175);
});

test('infers missing minimums from the previous zone maximum', () => {
  const mins = boundariesFrom({
    zone1: { max: 129 }, zone2: { max: 149 }, zone3: { max: 164 },
    zone4: { max: 174 }, zone5: { max: 200 },
  });
  assert.ok(mins && ascending(mins));
  assert.strictEqual(mins[1], 130, 'Z2 should open one above Z1 max');
});

test('still refuses a table with nothing in it at all', () => {
  assert.strictEqual(boundariesFrom({
    zone1: {}, zone2: {}, zone3: {}, zone4: {}, zone5: {},
  }), null);
});

test('falls back to LT2 when there is no table', () => {
  // This is the case that made every athlete look like they had no heart rate:
  // LaChart counts an LT2 as "zones are set", so reading only an explicit
  // zone1..zone5 block reported the whole week as unmeasured.
  const mins = boundariesFrom({ lt2: 170 });
  assert.ok(mins, 'expected boundaries from LT2 alone');
  assert.ok(ascending(mins));
  // Z4 opens just under threshold, Z5 just above it.
  assert.ok(mins[3] < 170 && mins[3] > 160, `Z4 min ${mins[3]}`);
  assert.ok(mins[4] > 170, `Z5 min ${mins[4]}`);
});

test('prefers a measured LT1 over the assumed one', () => {
  const assumed = boundariesFrom({ lt2: 170 });
  const measured = boundariesFrom({ lt1: 150, lt2: 170 });
  assert.notDeepStrictEqual(assumed, measured);
  assert.ok(measured[2] === 150, `Z3 should open at LT1, got ${measured[2]}`);
});

test('reads the lt2Hr spelling too', () => {
  assert.deepStrictEqual(boundariesFrom({ lt2Hr: 170 }), boundariesFrom({ lt2: 170 }));
});

test('falls back to max heart rate when there is no threshold', () => {
  const mins = boundariesFrom({ maxHeartRate: 190 });
  assert.ok(mins && ascending(mins));
  assert.ok(mins[4] < 190, 'Z5 must open below max, not at it');
});

test('takes max heart rate off the profile when the sport block has none', () => {
  assert.deepStrictEqual(
    boundariesFrom(null, { maxHr: 190 }),
    boundariesFrom({ maxHeartRate: 190 }),
  );
});

test('gives up only when there is genuinely nothing', () => {
  assert.strictEqual(boundariesFrom(null, {}), null);
  assert.strictEqual(boundariesFrom({}, null), null);
  assert.strictEqual(boundariesFrom({ lt2: 0 }, { maxHr: 0 }), null);
});

test('rejects an unordered zone table rather than bucketing nonsense', () => {
  const mins = boundariesFrom({
    zone1: { min: 150 }, zone2: { min: 130 }, zone3: { min: 150 },
    zone4: { min: 165 }, zone5: { min: 175 },
  });
  assert.strictEqual(mins, null);
});

test('falls through to LT2 when the table is incomplete', () => {
  // A half-filled table must not block the derivation.
  const mins = boundariesFrom({ zone1: { min: 100 }, lt2: 170 });
  assert.ok(mins && ascending(mins));
});

console.log('\nbucketing a heart rate');

test('places a reading in the right zone', () => {
  const mins = [100, 130, 150, 165, 175];
  assert.strictEqual(zoneForHr(95, mins), null);
  assert.strictEqual(zoneForHr(100, mins), 1);
  assert.strictEqual(zoneForHr(149, mins), 2);
  assert.strictEqual(zoneForHr(150, mins), 3);
  assert.strictEqual(zoneForHr(170, mins), 4);
  assert.strictEqual(zoneForHr(200, mins), 5);
});

test('ignores missing and impossible readings', () => {
  const mins = [100, 130, 150, 165, 175];
  assert.strictEqual(zoneForHr(0, mins), null);
  assert.strictEqual(zoneForHr(null, mins), null);
  assert.strictEqual(zoneForHr('abc', mins), null);
});

console.log(`\n${passed} passed`);
