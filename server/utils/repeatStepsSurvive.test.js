/**
 * A repeat block has to reach the watch as the session it is.
 *
 *   node server/utils/repeatStepsSurvive.test.js
 *
 * Measured on a real push before the fix: a 6×3 min VO2max run planned as
 * 1:11:00 was stored by Garmin as a correct warm-up, a correct cool-down, and
 * TWELVE one-second steps with no target where the main set should be — total
 * 35:12. A coach reported the same shape for 5×2 km and read it as "Garmin
 * does not show the individual workout steps".
 *
 * The cause was `{ ...step }` over a Mongoose subdocument, which copies
 * `__parentArray`, `$__`, `_doc` and no data at all. Only group MEMBERS were
 * spread, which is why everything outside a repeat arrived intact — and why a
 * test that loads workouts with .lean() could never see it. So the fake below
 * imitates the one thing that matters: data behind a getter, invisible to a
 * spread, reachable through toObject().
 */

'use strict';

const assert = require('assert');
const { plainStep, plainSteps } = require('./plainSteps');
const { buildGarminWorkout } = require('./garminWorkoutPush');
const { expandSteps } = require('./workoutExporters');

let failures = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  ok  ', name); }
  catch (e) { failures += 1; console.log('  FAIL', name, '\n        ' + e.message); }
};

/** Behaves like a Mongoose subdocument: a spread sees none of the fields. */
function subdoc(data) {
  const d = { __parentArray: [], __index: 0, $__: {}, _doc: data, $isNew: false };
  for (const k of Object.keys(data)) {
    Object.defineProperty(d, k, { get() { return data[k]; }, enumerable: false, configurable: true });
  }
  d.toObject = () => ({ ...data });
  return d;
}

const RUN = [
  { stepType: 'warmup', durationSeconds: 300, powerTarget: { type: 'zone', value: 1 } },
  { stepType: 'work', durationSeconds: 180, powerTarget: { type: 'zone', value: 5 },
    groupId: 'g', isGroupHeader: true, groupRepeat: 6 },
  { stepType: 'recovery', durationSeconds: 180, powerTarget: { type: 'zone', value: 1 }, groupId: 'g' },
  { stepType: 'cooldown', durationSeconds: 150, powerTarget: { type: 'zone', value: 1 } },
];
const CTX = { sport: 'run', lt1Pace: 238, lt2Pace: 200 };

console.log('the fake has to be a fair one');

ok('a spread of it really does lose everything, as Mongoose does', () => {
  const s = subdoc({ durationSeconds: 180, stepType: 'work' });
  assert.strictEqual(s.durationSeconds, 180, 'direct access works');
  assert.strictEqual(({ ...s }).durationSeconds, undefined, 'a spread does not');
});

ok('plainStep recovers it, and leaves a plain object alone', () => {
  assert.strictEqual(plainStep(subdoc({ durationSeconds: 180 })).durationSeconds, 180);
  assert.deepStrictEqual(plainStep({ a: 1 }), { a: 1 });
  assert.strictEqual(plainStep(null), null);
  assert.deepStrictEqual(plainSteps(undefined), []);
});

console.log('\nthe main set survives the trip to the watch');

const build = (steps) => buildGarminWorkout({ title: 'VO2max Run', sport: 'run', steps, _id: 'x' }, CTX)
  .segments[0].steps;

for (const [label, steps] of [['plain objects', RUN], ['Mongoose subdocuments', RUN.map(subdoc)]]) {
  ok(`${label}: every step keeps its own duration`, () => {
    const out = build(steps);
    const blanks = out.filter((s) => s.durationValue === 1 && s.targetType === 'OPEN');
    assert.strictEqual(blanks.length, 0, `${blanks.length} steps arrived as 1-second blanks`);
  });

  ok(`${label}: the repeat arrives six times over, not once`, () => {
    const out = build(steps);
    // 6 × (3:00 work + 3:00 recovery) — the recoveries carry RECOVERY, not
    // ACTIVE, so this counts by duration rather than by intensity.
    assert.strictEqual(out.filter((s) => s.durationValue === 180).length, 12);
    assert.strictEqual(out.length, 2 + 12, 'warm-up and cool-down either side of it');
  });

  ok(`${label}: the total is the plan's total`, () => {
    const total = build(steps)
      .filter((s) => s.durationType === 'TIME')
      .reduce((a, s) => a + s.durationValue, 0);
    // 5:00 warm-up + 6×(3:00 + 3:00) + 2:30 cool-down
    assert.strictEqual(total, 300 + 6 * 360 + 150);
  });

  ok(`${label}: and the targets came with it`, () => {
    assert.strictEqual(build(steps).filter((s) => s.targetType === 'PACE').length, build(steps).length);
  });
}

console.log('\nthe exporters expand the same way');

ok('expandSteps survives subdocuments too', () => {
  const plain = expandSteps(RUN);
  const docs = expandSteps(RUN.map(subdoc));
  assert.strictEqual(docs.length, plain.length);
  assert.strictEqual(docs.reduce((a, s) => a + (s.durationSeconds || 0), 0),
                     plain.reduce((a, s) => a + (s.durationSeconds || 0), 0));
  assert.ok(docs.every((s) => s.durationSeconds > 0), 'no step lost its duration');
});

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
