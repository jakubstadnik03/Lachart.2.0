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
const {
  resolveTargetWatts, resolveTargetRange, buildTcx, buildZwo,
  resolveTargetPaceSecPerKm, resolveTargetSwimPaceSecPer100m,
} = require('./workoutExporters');
const { zoneTargetFromThresholds, TOP_FACTOR } = require('./trainingZoneBounds');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}

const ctx = { ftp: 400, lt1Power: 332, lt2Power: 384 };

// What Z3 resolves to is the zone model's business, not this test's: it was
// pinned here as a literal and went stale the moment the zone shape moved,
// failing a test about overrides for a reason that had nothing to do with them.
const zone3 = Math.round(zoneTargetFromThresholds(3, {
  lt1: ctx.lt1Power, lt2: ctx.lt2Power, ascending: true, topFactor: TOP_FACTOR.power,
}));
const step = (powerTarget) => ({ stepType: 'work', durationSeconds: 300, powerTarget });
const wo = (powerTarget) => ({ title: 't', sport: 'bike', steps: [step(powerTarget)] });

console.log('the number the athlete typed is the number that travels');

test('a pinned value beats the zone calculation', () => {
  assert.strictEqual(resolveTargetWatts({ type: 'zone', value: 3 }, ctx), zone3);
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
  assert.strictEqual(resolveTargetWatts({ type: 'zone', value: 3 }, ctx), zone3);
  assert.strictEqual(resolveTargetWatts({ type: 'watts', value: 350 }, ctx), 350);
});

test('a junk override is ignored rather than trusted', () => {
  for (const junk of [0, -5, 'abc', null]) {
    assert.strictEqual(resolveTargetWatts({ type: 'zone', value: 3, override: junk }, ctx), zone3,
      `override ${JSON.stringify(junk)} is not a number to send to a watch`);
  }
});

test('an open step stays open whatever is pinned on it', () => {
  assert.strictEqual(resolveTargetWatts({ type: 'open', override: 300 }, ctx), null);
});

console.log('\nand the zone fallback has to be reachable for any of it to matter');

// The helper's require was once inserted into this file's opening block
// comment, so the binding did not exist: an athlete with no zones of their own
// got a ReferenceError instead of a workout on their watch, for every sport.
test('a zone target resolves for an athlete with no zones of their own', () => {
  for (let z = 1; z <= 5; z += 1) {
    const w = resolveTargetWatts({ type: 'zone', value: z }, ctx);
    assert.ok(Number.isFinite(w) && w > 0, `bike Z${z} resolved to ${w}`);
    const run = resolveTargetPaceSecPerKm({ type: 'zone', value: z }, { lt1Pace: 238, lt2Pace: 200 });
    assert.ok(Number.isFinite(run) && run > 0, `run Z${z} resolved to ${run}`);
    const swim = resolveTargetSwimPaceSecPer100m({ type: 'zone', value: z }, { lt1Swim: 110, lt2Swim: 95 });
    assert.ok(Number.isFinite(swim) && swim > 0, `swim Z${z} resolved to ${swim}`);
  }
});

test('watts and pace name the same zone, so the watch matches the builder', () => {
  // Both read the shared bounds now; the bike was left on a frozen table that
  // put Z2 at LT1 exactly, while the same zone in pace sat well below it.
  const z2w = resolveTargetWatts({ type: 'zone', value: 2 }, ctx);
  assert.ok(z2w < ctx.lt1Power,
    `Z2 is endurance, below the aerobic threshold — got ${z2w} against LT1 ${ctx.lt1Power}`);
  const z4w = resolveTargetWatts({ type: 'zone', value: 4 }, ctx);
  assert.ok(z4w >= ctx.lt1Power && z4w <= Math.round(ctx.lt2Power * 1.05),
    `Z4 sits at the second threshold — got ${z4w} against LT2 ${ctx.lt2Power}`);
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
