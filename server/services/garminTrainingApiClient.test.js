/**
 * Payload tests for the Garmin Training API workout serializer.
 *
 * This is the part worth testing hard: it has to be correct BEFORE Garmin
 * grants access, because once credentials arrive the failure mode is a 400
 * from a partner API with an opaque message.
 *
 * Run: node server/services/garminTrainingApiClient.test.js
 */
const assert = require('assert');
const { buildWorkoutPayload, scheduleDate } = require('./garminTrainingApiClient');
const { resolveTargetRange } = require('../utils/workoutExporters');

const CTX = { ftp: 300, lt1Power: 225, lt2Power: 300 };
const deps = { resolveRange: resolveTargetRange, ctx: CTX };

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
}

console.log('buildWorkoutPayload');

// NOTE: the nesting asserted here is an UNVERIFIED assumption — the Garmin
// schema shows no `steps` array on WorkoutRepeatStep. See the header of
// garminTrainingApiClient.js. Update this test once workout-inspect settles it.
test('repeat groups become a native WorkoutRepeatStep, not 20 flat steps [ASSUMED nesting]', () => {
  const pw = {
    _id: 'abc', title: '10x3 VO2', sport: 'bike',
    steps: [
      { stepType: 'warmup', durationSeconds: 600, powerTarget: { type: 'percent_ftp', value: 60 } },
      { groupId: 'G', isGroupHeader: true, groupRepeat: 10, stepType: 'work', durationSeconds: 180,
        powerTarget: { type: 'percent_ftp', useRange: true, rangeMin: 105, rangeMax: 115 } },
      { groupId: 'G', stepType: 'recovery', durationSeconds: 120, powerTarget: { type: 'zone', value: 1 } },
      { stepType: 'cooldown', durationSeconds: 300, powerTarget: { type: 'percent_ftp', value: 55 } },
    ],
  };
  const p = buildWorkoutPayload(pw, deps);
  const steps = p.steps;
  assert.strictEqual(steps.length, 3, 'warmup + repeat + cooldown');
  const repeat = steps[1];
  assert.strictEqual(repeat.type, 'WorkoutRepeatStep');
  assert.strictEqual(repeat.repeatValue, 10);
  assert.strictEqual(repeat.steps.length, 2);
  assert.strictEqual(repeat.repeatType, 'REPEAT_UNTIL_STEPS_CMPLT');
});

test('power targets resolve to absolute watts', () => {
  const pw = {
    _id: 'abc', title: 'T', sport: 'bike',
    steps: [{ stepType: 'work', durationSeconds: 480,
      powerTarget: { type: 'percent_ftp', useRange: true, rangeMin: 88, rangeMax: 94 } }],
  };
  const s = buildWorkoutPayload(pw, deps).steps[0];
  assert.strictEqual(s.targetType, 'POWER');
  assert.strictEqual(s.targetValueLow, 264);   // 88 % of 300
  assert.strictEqual(s.targetValueHigh, 282);  // 94 % of 300
});

test('a step with no target is OPEN, not dropped', () => {
  const pw = { _id: 'a', title: 'T', sport: 'bike',
    steps: [{ stepType: 'work', durationSeconds: 300, powerTarget: { type: 'open' } }] };
  const s = buildWorkoutPayload(pw, deps).steps[0];
  assert.strictEqual(s.targetType, 'OPEN');
  assert.strictEqual(s.durationValue, 300);
});

test('stepOrder is unique and monotonic across nested repeat children', () => {
  const pw = {
    _id: 'a', title: 'T', sport: 'bike',
    steps: [
      { stepType: 'warmup', durationSeconds: 600 },
      { groupId: 'G', isGroupHeader: true, groupRepeat: 3, stepType: 'work', durationSeconds: 60 },
      { groupId: 'G', stepType: 'recovery', durationSeconds: 60 },
      { stepType: 'cooldown', durationSeconds: 300 },
    ],
  };
  const steps = buildWorkoutPayload(pw, deps).steps;
  const orders = [];
  for (const s of steps) {
    orders.push(s.stepOrder);
    if (s.steps) for (const c of s.steps) orders.push(c.stepOrder);
  }
  assert.deepStrictEqual(orders, [...orders].sort((a, b) => a - b), 'monotonic');
  assert.strictEqual(new Set(orders).size, orders.length, 'unique');
});

test('estimated duration multiplies repeats', () => {
  const pw = {
    _id: 'a', title: 'T', sport: 'bike',
    steps: [
      { groupId: 'G', isGroupHeader: true, groupRepeat: 5, stepType: 'work', durationSeconds: 100 },
      { groupId: 'G', stepType: 'recovery', durationSeconds: 100 },
    ],
  };
  // 5 x (100 + 100)
  assert.strictEqual(buildWorkoutPayload(pw, deps).estimatedDurationInSecs, 1000);
});

test('a single-iteration group is flattened rather than wrapped', () => {
  const pw = { _id: 'a', title: 'T', sport: 'bike',
    steps: [{ groupId: 'G', isGroupHeader: true, groupRepeat: 1, stepType: 'work', durationSeconds: 60 }] };
  const steps = buildWorkoutPayload(pw, deps).steps;
  assert.strictEqual(steps[0].type, 'WorkoutStep');
});

test('sport maps and a stepless workout yields null', () => {
  assert.strictEqual(buildWorkoutPayload({ _id: 'a', title: 'T', sport: 'run', steps: [] }, deps), null);
  const run = buildWorkoutPayload({ _id: 'a', title: 'T', sport: 'run',
    steps: [{ stepType: 'work', durationSeconds: 60 }] }, deps);
  assert.strictEqual(run.sport, 'RUNNING');
  assert.strictEqual(run.workoutSourceId, 'a');
  assert.strictEqual(run.workoutProvider, 'LaChart');
});

console.log('\nscheduleDate');
test('a UTC-midnight date keeps its calendar day', () => {
  assert.strictEqual(scheduleDate('2026-08-14T00:00:00.000Z'), '2026-08-14');
});
test('an invalid date is null rather than throwing', () => {
  assert.strictEqual(scheduleDate('nonsense'), null);
});

console.log(`\n${passed} passed`);

console.log('\nconfirmed-schema fields');

test('cadence rides as a SECONDARY target when power holds the primary slot', () => {
  const pw = { _id: 'a', title: 'T', sport: 'bike', steps: [
    { stepType: 'work', durationSeconds: 300, cadenceMin: 90, cadenceMax: 100,
      powerTarget: { type: 'percent_ftp', value: 90 } },
  ]};
  const s = buildWorkoutPayload(pw, deps).steps[0];
  assert.strictEqual(s.targetType, 'POWER');
  assert.strictEqual(s.secondaryTargetType, 'CADENCE');
  assert.strictEqual(s.secondaryTargetValueLow, 90);
  assert.strictEqual(s.secondaryTargetValueHigh, 100);
});

test('cadence takes the primary slot when there is no power target', () => {
  const pw = { _id: 'a', title: 'T', sport: 'bike', steps: [
    { stepType: 'work', durationSeconds: 300, cadenceMin: 90 },
  ]};
  const s = buildWorkoutPayload(pw, deps).steps[0];
  assert.strictEqual(s.targetType, 'CADENCE');
  assert.strictEqual(s.secondaryTargetType, undefined);
});

test('swim workouts declare a pool length', () => {
  const pw = { _id: 'a', title: 'T', sport: 'swim', steps: [
    { stepType: 'work', durationSeconds: 300 },
  ]};
  const p = buildWorkoutPayload(pw, deps);
  assert.strictEqual(p.sport, 'LAP_SWIMMING');
  assert.strictEqual(p.poolLength, 25);
  assert.strictEqual(p.poolLengthUnit, 'METER');
  assert.strictEqual(p.steps.length, 1);
});

console.log(`\n${passed} passed`);

console.log('\nV1 payload shape (POST /workout)');

test('steps sit directly on the workout — no segments wrapper', () => {
  const pw = { _id: 'a', title: 'T', sport: 'bike',
    steps: [{ stepType: 'work', durationSeconds: 300 }] };
  const p = buildWorkoutPayload(pw, deps);
  assert.ok(Array.isArray(p.steps), 'steps is a top-level array');
  assert.strictEqual(p.segments, undefined, 'must NOT send segments to POST /workout');
});

console.log(`\n${passed} passed`);
