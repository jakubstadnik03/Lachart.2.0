/**
 * A pace target has to survive the round trip to a watch.
 *
 * `pace` was added to the builder — and the run warm-up ramp now produces
 * nothing else — without being added to the schema enum, so saving a planned
 * run failed with a 500 and a validation error the athlete could do nothing
 * about. The exporters had the same gap one step further on: they would have
 * stored it and then sent a zone midpoint to the watch.
 *
 *   node server/utils/paceTargetExport.test.js
 */

'use strict';

const assert = require('assert');
const { resolveTargetPaceSecPerKm, resolveTargetSwimPaceSecPer100m, resolveTargetWatts } =
  require('./workoutExporters');
const PlannedWorkout = require('../models/PlannedWorkout');
const WorkoutTemplate = require('../models/WorkoutTemplate');

const RUN = { lt1Pace: 238, lt2Pace: 200 };
const SWIM = { lt1Swim: 100, lt2Swim: 90 };

// The schemas accept it.
for (const [name, Model] of [['PlannedWorkout', PlannedWorkout], ['WorkoutTemplate', WorkoutTemplate]]) {
  const path = Model.schema.path('steps').schema.path('powerTarget').schema.path('type');
  assert.ok(path.enumValues.includes('pace'), `${name} accepts a pace target`);
}

// It exports as the number that was typed, not as a zone midpoint.
assert.strictEqual(resolveTargetPaceSecPerKm({ type: 'pace', value: 251 }, RUN), 251,
  'a run pace target exports the pace it was given');
assert.strictEqual(resolveTargetSwimPaceSecPer100m({ type: 'pace', value: 95 }, SWIM), 95,
  'a swim pace target exports the pace it was given');

// And it does not leak into the watts side.
assert.strictEqual(resolveTargetWatts({ type: 'pace', value: 251 }, { ftp: 250 }), null,
  'a pace target is not turned into watts');

// The thresholds still resolve as before.
assert.strictEqual(resolveTargetPaceSecPerKm({ type: 'lt2' }, RUN), 200, 'LT2 unchanged');

console.log('paceTargetExport: all passed');
