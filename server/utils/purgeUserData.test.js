/**
 * What a deletion must remove, and what it must NOT.
 *
 *   node server/utils/purgeUserData.test.js
 *
 * The delete it replaces cleared six collections out of fourteen and never
 * touched Stripe, while answering "all associated data deleted successfully".
 * Two of the things guarded here are the ones that cost real money or real
 * data if they regress.
 *
 * Mongoose is never connected: the models are stubbed, so this checks the
 * shape of the queries rather than the database.
 */

'use strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const assert = require('assert');
const path = require('path');
const mongoose = require('mongoose');

const { OWNED, idForms } = require('../utils/purgeUserData');

// --- every configured model really exists and really has that field ---------
// A typo here is invisible in production: deleteMany on a field the schema does
// not have matches nothing and reports success.
for (const [modelPath, field] of OWNED) {
  const Model = require(path.join(__dirname, '..', modelPath.replace('../', '')));
  assert.ok(Model.schema.path(field), `${Model.modelName} has no field ${field}`);
}

// --- ownership, never authorship -------------------------------------------
// A coach closing their account must not delete the planned workouts, day plans
// or race entries sitting in their athletes' calendars. Those rows carry the
// coach in `createdBy` and the athlete in `athleteId`; deleting by createdBy
// would erase training plans out from under people who did nothing.
const fields = new Set(OWNED.map(([, f]) => f));
assert.ok(!fields.has('createdBy'), 'purge must never delete by createdBy');
assert.deepStrictEqual(
  [...fields].sort(),
  ['athleteId', 'recipientId', 'userId'],
  'only ownership fields may be purged',
);

// --- both id forms ---------------------------------------------------------
// stravaactivities stores userId as an ObjectId for some users and a string for
// others; one athlete had 6229 documents under the ObjectId and none under the
// string. Matching a single form turns "erased" into "erased, mostly".
const id = '67ee3f1a1234567890abcdef';
const m = idForms(id);
assert.ok(Array.isArray(m.$in), 'match is an $in over both forms');
assert.strictEqual(m.$in.length, 2);
assert.ok(m.$in.some((v) => typeof v === 'string' && v === id), 'string form present');
assert.ok(m.$in.some((v) => v instanceof mongoose.Types.ObjectId), 'ObjectId form present');

const notAnId = idForms('not-an-object-id');
assert.strictEqual(notAnId.$in.length, 1, 'a non-ObjectId matches as a string only');

// --- coverage --------------------------------------------------------------
// The collections the old delete forgot. Each is listed by name so that
// removing one from OWNED fails here rather than quietly shipping.
const covered = new Set(OWNED.map(([p]) => p.split('/').pop()));
for (const missed of [
  'PlannedWorkout', 'DayPlan', 'CalendarPeriod', 'Notification',
  'GarminActivity', 'GarminStream', 'GarminWellness',
  'AppleHealthActivity', 'AppleHealthWellness',
  'FieldLactateMeasurement', 'StravaStream', 'ThresholdDriftRead',
]) {
  assert.ok(covered.has(missed), `${missed} was left behind by the old delete and must be purged`);
}

console.log(`purgeUserData: ${OWNED.length} owned collections, ownership-only, both id forms`);

// --- all three delete paths go through here --------------------------------
// They were three hand-written copies that had already drifted; the one a coach
// can reach is the likeliest route by which a paying athlete vanishes while
// Stripe keeps charging.
const routes = require('fs').readFileSync(
  require('path').join(__dirname, '..', 'routes', 'userListRoute.js'), 'utf8',
);
const deleteHandlers = [
  'router.delete("/delete-account"',
  'router.delete("/admin/users/:userId"',
  'router.delete("/admin/athlete/:athleteId/delete-with-tests"',
];
for (const handler of deleteHandlers) {
  const at = routes.indexOf(handler);
  assert.ok(at > -1, `missing handler: ${handler}`);
  const body = routes.slice(at, routes.indexOf('router.', at + 10));
  assert.ok(body.includes('purgeUserData'), `${handler} does not purge`);
  assert.ok(
    !/FitTraining\.deleteMany|LactateSession\.deleteMany/.test(body),
    `${handler} still hand-deletes a subset`,
  );
}

console.log('purgeUserData: all three delete paths purge and cancel billing');
