const assert = require('assert');
const { isPlanProgressUpdate } = require('./planProgress');

// Answering a plan: free.
assert.strictEqual(isPlanProgressUpdate({ status: 'completed' }), true);
assert.strictEqual(isPlanProgressUpdate({ status: 'skipped', comment: 'Sick.' }), true);
assert.strictEqual(isPlanProgressUpdate({
  completedTrainingId: 'garmin-1', unpaired: false, status: 'completed', stravaActivityId: null, fitTrainingId: null,
}), true);
assert.strictEqual(isPlanProgressUpdate({ completedTrainingId: null, unpaired: true, status: 'planned' }), true);
// A field the client sends as undefined does not count as touched.
assert.strictEqual(isPlanProgressUpdate({ status: 'completed', title: undefined }), true);

// Writing a plan: gated.
assert.strictEqual(isPlanProgressUpdate({ status: 'completed', title: 'Renamed' }), false);
assert.strictEqual(isPlanProgressUpdate({ date: '2026-09-20' }), false);
assert.strictEqual(isPlanProgressUpdate({ steps: [] }), false);
assert.strictEqual(isPlanProgressUpdate({ plannedDuration: 3600 }), false);
assert.strictEqual(isPlanProgressUpdate({ coachNotes: 'x' }), false);
// Nothing at all is not progress either.
assert.strictEqual(isPlanProgressUpdate({}), false);
assert.strictEqual(isPlanProgressUpdate(null), false);

console.log('planProgress.test.js passed');
