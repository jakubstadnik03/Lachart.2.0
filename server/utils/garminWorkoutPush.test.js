/**
 * Garmin Training API workout builder. Plain Node, no jest — run with:
 *
 *   node server/utils/garminWorkoutPush.test.js
 *
 * Only the pure builders are tested (no network, no database).
 */

'use strict';

const assert = require('assert');
const { buildGarminWorkout, buildGarminSteps, garminPushEligible } = require('./garminWorkoutPush');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

const ctx = { ftp: 300, lt1Power: 220, lt2Power: 290 };

test('flat steps map to WorkoutStep with power ranges in watts', () => {
  const steps = buildGarminSteps([
    { stepType: 'warmup', durationSeconds: 600, powerTarget: { type: 'percent_ftp', value: 60 } },
    { stepType: 'work', durationSeconds: 1200, powerTarget: { type: 'watts', value: 250 } },
    { stepType: 'cooldown', durationSeconds: 300, powerTarget: { type: 'open' } },
  ], ctx);
  assert.strictEqual(steps.length, 3);
  assert.strictEqual(steps[0].type, 'WorkoutStep');
  assert.strictEqual(steps[0].intensity, 'WARMUP');
  assert.strictEqual(steps[0].durationType, 'TIME');
  assert.strictEqual(steps[0].durationValue, 600);
  // 60 % of 300 W = 180 W, ±5 %
  assert.strictEqual(steps[0].targetType, 'POWER');
  assert.strictEqual(steps[0].targetValueLow, 171);
  assert.strictEqual(steps[0].targetValueHigh, 189);
  assert.strictEqual(steps[1].intensity, 'INTERVAL');
  assert.strictEqual(steps[2].targetType, 'OPEN');
});

test('grouped repeats become a native WorkoutRepeatStep (header included)', () => {
  const steps = buildGarminSteps([
    { stepType: 'warmup', durationSeconds: 600 },
    { groupId: 'G', isGroupHeader: true, groupRepeat: 5, stepType: 'work', durationSeconds: 480,
      powerTarget: { type: 'watts', value: 260 } },
    { groupId: 'G', stepType: 'recovery', durationSeconds: 120 },
    { stepType: 'cooldown', durationSeconds: 300 },
  ], ctx);
  assert.strictEqual(steps.length, 3);
  const rep = steps[1];
  assert.strictEqual(rep.type, 'WorkoutRepeatStep');
  assert.strictEqual(rep.repeatValue, 5);
  assert.strictEqual(rep.steps.length, 2);
  // The header IS the work interval — it must not be dropped.
  assert.strictEqual(rep.steps[0].intensity, 'INTERVAL');
  assert.strictEqual(rep.steps[0].durationValue, 480);
  assert.strictEqual(rep.steps[1].intensity, 'RECOVERY');
});

test('pinned override wins over the calculated zone', () => {
  const steps = buildGarminSteps([
    { stepType: 'work', durationSeconds: 60, powerTarget: { type: 'percent_ftp', value: 80, override: 333 } },
  ], ctx);
  assert.strictEqual(steps[0].targetValueLow, Math.round(333 * 0.95));
  assert.strictEqual(steps[0].targetValueHigh, Math.round(333 * 1.05));
});

test('workout payload carries sport, duration (repeats expanded) and source id', () => {
  const pw = {
    _id: 'abc123',
    title: 'Threshold 5×8',
    sport: 'bike',
    date: new Date('2026-09-01'),
    steps: [
      { stepType: 'warmup', durationSeconds: 600 },
      { groupId: 'G', isGroupHeader: true, groupRepeat: 5, stepType: 'work', durationSeconds: 480 },
      { groupId: 'G', stepType: 'recovery', durationSeconds: 120 },
      { stepType: 'cooldown', durationSeconds: 300 },
    ],
  };
  const w = buildGarminWorkout(pw, ctx);
  assert.strictEqual(w.sport, 'CYCLING');
  assert.strictEqual(w.workoutProvider, 'LaChart');
  assert.strictEqual(w.workoutSourceId, 'abc123');
  // 600 + 5×(480+120) + 300
  assert.strictEqual(w.estimatedDurationInSecs, 600 + 5 * 600 + 300);
});

test('eligibility: OAuth + steps + planned status required; permissions gate honoured', () => {
  const pw = { steps: [{ stepType: 'work', durationSeconds: 60 }], status: 'planned', date: new Date() };
  const oauthUser = { garmin: { accessToken: 'a', refreshToken: 'r' } };
  assert.strictEqual(garminPushEligible(oauthUser, pw), true);
  // credentials-only connection → no Training API
  assert.strictEqual(garminPushEligible({ garmin: { accessToken: 'a' } }, pw), false);
  // known permissions without WORKOUT_IMPORT → skip
  assert.strictEqual(
    garminPushEligible({ garmin: { accessToken: 'a', refreshToken: 'r', permissions: ['ACTIVITY_EXPORT'] } }, pw),
    false
  );
  assert.strictEqual(
    garminPushEligible({ garmin: { accessToken: 'a', refreshToken: 'r', permissions: ['WORKOUT_IMPORT'] } }, pw),
    true
  );
  // no structured steps → nothing to push
  assert.strictEqual(garminPushEligible(oauthUser, { ...pw, steps: [] }), false);
  assert.strictEqual(garminPushEligible(oauthUser, { ...pw, status: 'completed' }), false);
});

console.log(passed + ' passed');
