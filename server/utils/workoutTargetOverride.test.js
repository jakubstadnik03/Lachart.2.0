/**
 * A pinned intensity has to survive the round trip. Plain Node, no jest:
 *
 *   node server/utils/workoutTargetOverride.test.js
 *
 * Two separate failures sat behind "I overwrite the intensity and it doesn't
 * save": the field was missing from the Mongoose schema, so it was dropped on
 * write, and the exporters recomputed the zone instead of reading it — so even
 * a saved override would not have reached the watch.
 */

'use strict';

const assert = require('assert');
const { resolveTargetWatts, resolveTargetRange, buildTcx, buildZwo } = require('./workoutExporters');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}

const ctx = { ftp: 400, lt1Power: 332, lt2Power: 384 };
const step = (powerTarget) => ({ stepType: 'work', durationSeconds: 300, powerTarget });
const wo = (powerTarget) => ({ title: 't', sport: 'bike', steps: [step(powerTarget)] });

console.log('the number the athlete typed is the number that travels');

test('a pinned value beats the zone calculation', () => {
  assert.strictEqual(resolveTargetWatts({ type: 'zone', value: 3 }, ctx), 332);
  assert.strictEqual(resolveTargetWatts({ type: 'zone', value: 3, override: 355 }, ctx), 355);
});

test('it beats a percentage too', () => {
  assert.strictEqual(resolveTargetWatts({ type: 'percent_ftp', value: 50, override: 300 }, ctx), 300);
});

test('and an LT target', () => {
  assert.strictEqual(resolveTargetWatts({ type: 'lt2', override: 400 }, ctx), 400);
});

test('the TCX range is centred on the pinned value', () => {
  const r = resolveTargetRange({ type: 'zone', value: 3, override: 355 }, ctx);
  assert.ok(r.low < 355 && r.high > 355, `expected a band around 355, got ${JSON.stringify(r)}`);
  assert.strictEqual(Math.round((r.low + r.high) / 2), 355);
});

test('TCX carries the pinned band, not the calculated one', () => {
  const tcx = buildTcx(wo({ type: 'zone', value: 3, override: 355 }), ctx);
  assert.ok(/<Value>337<\/Value>/.test(tcx), 'expected the pinned low bound');
  assert.ok(!/<Value>315<\/Value>/.test(tcx), 'calculated bound must not appear');
});

test('ZWO carries the pinned fraction of FTP', () => {
  const zwo = buildZwo(wo({ type: 'zone', value: 3, override: 355 }), ctx);
  assert.ok(/Power="0\.89"/.test(zwo), `355/400 = 0.89, got: ${zwo.match(/Power="[^"]+"/)}`);
});

console.log('and nothing changes when nothing was pinned');

test('no override leaves the calculation alone', () => {
  assert.strictEqual(resolveTargetWatts({ type: 'zone', value: 3 }, ctx), 332);
  assert.strictEqual(resolveTargetWatts({ type: 'watts', value: 350 }, ctx), 350);
});

test('a junk override is ignored rather than trusted', () => {
  assert.strictEqual(resolveTargetWatts({ type: 'zone', value: 3, override: 0 }, ctx), 332);
  assert.strictEqual(resolveTargetWatts({ type: 'zone', value: 3, override: -5 }, ctx), 332);
  assert.strictEqual(resolveTargetWatts({ type: 'zone', value: 3, override: 'abc' }, ctx), 332);
  assert.strictEqual(resolveTargetWatts({ type: 'zone', value: 3, override: null }, ctx), 332);
});

test('an open step stays open whatever is pinned on it', () => {
  assert.strictEqual(resolveTargetWatts({ type: 'open', override: 300 }, ctx), null);
});

console.log('\nthe schema must keep the field, or none of the above is reachable');

test('override is declared on both step-target schemas', () => {
  const fs = require('fs');
  for (const m of ['PlannedWorkout', 'WorkoutTemplate']) {
    const src = fs.readFileSync(`${__dirname}/../models/${m}.js`, 'utf8');
    const target = src.slice(src.indexOf('stepTargetSchema'), src.indexOf('workoutStepSchema'));
    assert.ok(/override:\s*Number/.test(target), `${m}: stepTargetSchema is missing override`);
  }
});

console.log(`\n${passed} passed`);
