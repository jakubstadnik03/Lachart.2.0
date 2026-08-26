/**
 * A category an athlete invented must be storable. Plain Node, no jest:
 *
 *   node server/models/activityCategory.test.js
 *
 * Categories are user-defined: CategoryContext ships seven built-ins and
 * addCategory() lets an athlete add their own. Three models pinned the field to
 * an enum anyway — and to three *different* enums — so saving a ride tagged
 * "heat" threw a ValidationError, which reached the browser as a 500 on the
 * whole update. Mongoose validates without a database, so this needs no
 * connection.
 */

'use strict';

const assert = require('assert');
const mongoose = require('mongoose');

const StravaActivity = require('./StravaActivity');
const GarminActivity = require('./GarminActivity');
const FitTraining = require('./fitTraining');
const PlannedWorkout = require('./PlannedWorkout');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (err) { console.error(`FAIL  ${name}\n      ${err.message}`); process.exitCode = 1; }
}

const oid = () => new mongoose.Types.ObjectId();

/** Just enough of each model to reach category validation. */
const makers = {
  StravaActivity: (category) => new StravaActivity({ userId: oid(), stravaId: 1, category }),
  GarminActivity: (category) => new GarminActivity({ userId: oid(), garminId: 'g1', category }),
  FitTraining:    (category) => new FitTraining({ athleteId: String(oid()), category }),
  PlannedWorkout: (category) => new PlannedWorkout({
    athleteId: String(oid()), createdBy: String(oid()), date: new Date(),
    sport: 'bike', title: 't', category,
  }),
};

/** The error for the category path only — other required fields may be absent. */
const categoryError = (doc) => {
  const err = doc.validateSync();
  return err && err.errors && err.errors.category ? err.errors.category.message : null;
};

console.log('every model accepts the categories the app actually ships');

// The seven built-ins from client/src/context/CategoryContext.jsx
['endurance', 'lt1', 'tempo', 'lt2', 'zone2', 'vo2max', 'hills'].forEach((cat) => {
  test(`built-in "${cat}" is accepted everywhere`, () => {
    Object.entries(makers).forEach(([name, make]) => {
      const msg = categoryError(make(cat));
      assert.strictEqual(msg, null, `${name} rejected "${cat}": ${msg}`);
    });
  });
});

console.log('and the ones an athlete invents');

['heat', 'my-own-thing', 'Zimní objem', 'brick-day'].forEach((cat) => {
  test(`custom "${cat}" is accepted everywhere`, () => {
    Object.entries(makers).forEach(([name, make]) => {
      const msg = categoryError(make(cat));
      assert.strictEqual(msg, null, `${name} rejected "${cat}": ${msg}`);
    });
  });
});

console.log('no category is still no category');

test('null is accepted, not coerced into a string', () => {
  Object.entries(makers).forEach(([name, make]) => {
    const doc = make(null);
    assert.strictEqual(categoryError(doc), null, `${name} rejected null`);
    assert.ok(doc.category == null, `${name} turned null into ${JSON.stringify(doc.category)}`);
  });
});

test('an omitted category does not fail validation', () => {
  Object.entries(makers).forEach(([name, make]) => {
    assert.strictEqual(categoryError(make(undefined)), null, `${name} rejected an absent category`);
  });
});

console.log(`\n${passed} passed`);
