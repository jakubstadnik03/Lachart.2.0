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

test('workout payload wraps steps in a single segment (Training API v2 shape)', () => {
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
  // Spec caps provider/sourceId at 20 chars — a Mongo _id must NOT be used.
  assert.ok(w.workoutSourceId.length <= 20);
  assert.ok(!('steps' in w), 'steps must not be top-level');
  assert.strictEqual(w.segments.length, 1);
  assert.strictEqual(w.segments[0].segmentOrder, 1);
  assert.strictEqual(w.segments[0].sport, 'CYCLING');
  assert.strictEqual(w.segments[0].steps.length, 3);
  assert.strictEqual(w.segments[0].steps[1].type, 'WorkoutRepeatStep');
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

// ── Run: distance steps + pace targets (the TrainingPeaks-style 10×1 km) ──

const runCtx = {
  ...ctx,
  sport: 'run',
  lt1Pace: 285,  // 4:45/km
  lt2Pace: 250,  // 4:10/km
  runningZones: { lt1: 285, lt2: 250 },
};

test('run 10×1 km → DISTANCE laps in metres with PACE target in m/s', () => {
  const steps = buildGarminSteps([
    { stepType: 'warmup', durationSeconds: 600 },
    { groupId: 'R', isGroupHeader: true, groupRepeat: 10, stepType: 'work',
      durationType: 'distance', distanceMeters: 1000, durationSeconds: 250,
      powerTarget: { type: 'lt2' } },
    { groupId: 'R', stepType: 'recovery', durationSeconds: 90 },
    { stepType: 'cooldown', durationSeconds: 600 },
  ], runCtx);
  const rep = steps[1];
  assert.strictEqual(rep.type, 'WorkoutRepeatStep');
  assert.strictEqual(rep.repeatValue, 10);
  const km = rep.steps[0];
  assert.strictEqual(km.durationType, 'DISTANCE');
  assert.strictEqual(km.durationValue, 1000);
  assert.strictEqual(km.durationValueType, 'METER');
  assert.strictEqual(km.targetType, 'PACE');
  // LT2 = 250 s/km = 4.0 m/s, ±5 %
  assert.ok(Math.abs(km.targetValueLow - 3.8) < 0.01, `low=${km.targetValueLow}`);
  assert.ok(Math.abs(km.targetValueHigh - 4.2) < 0.01, `high=${km.targetValueHigh}`);
  assert.ok(km.targetValueLow < km.targetValueHigh);
  // Recovery jog has no target → OPEN, stays TIME
  assert.strictEqual(rep.steps[1].targetType, 'OPEN');
  assert.strictEqual(rep.steps[1].durationType, 'TIME');
});

test('run without pace zones falls back to OPEN, never emits bike watts', () => {
  const steps = buildGarminSteps([
    { stepType: 'work', durationType: 'distance', distanceMeters: 1000,
      durationSeconds: 250, powerTarget: { type: 'lt2' } },
  ], { ...ctx, sport: 'run' }); // ftp present, but no run pace context
  assert.strictEqual(steps[0].targetType, 'OPEN');
  assert.strictEqual(steps[0].durationType, 'DISTANCE');
});

test('run workout payload maps sport RUNNING with PACE target in the segment', () => {
  const w = buildGarminWorkout({
    _id: 'r1', title: '10×1 km', sport: 'run', date: new Date('2026-09-02'),
    steps: [{ stepType: 'work', durationType: 'distance', distanceMeters: 1000,
      durationSeconds: 250, powerTarget: { type: 'lt2' } }],
  }, runCtx);
  assert.strictEqual(w.sport, 'RUNNING');
  assert.strictEqual(w.segments[0].steps[0].targetType, 'PACE');
});

test('swim steps keep targetType null and rests use FIXED_REST', () => {
  const steps = buildGarminSteps([
    { stepType: 'work', durationType: 'distance', distanceMeters: 100, durationSeconds: 120,
      powerTarget: { type: 'lt2' } },
    { stepType: 'rest', durationSeconds: 20 },
  ], { sport: 'swim', lt2Swim: 90, swimmingZones: { lt2: 90 } });
  assert.strictEqual(steps[0].targetType, null);
  assert.strictEqual(steps[0].durationValueType, 'METER');
  assert.strictEqual(steps[1].durationType, 'FIXED_REST');
  assert.strictEqual(steps[1].durationValue, 20);
});

console.log(passed + ' passed');
