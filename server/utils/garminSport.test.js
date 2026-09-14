/**
 * Garmin typeKeys → stored sport, and what an old "other" row reads back as.
 */
const assert = require('assert');
const { mapGarminSportType, garminSportOf } = require('./garminSport');

// The gym family — the rows that used to be "other" and so never paired with
// a planned strength session.
assert.strictEqual(mapGarminSportType('STRENGTH_TRAINING'), 'strength');
assert.strictEqual(mapGarminSportType('YOGA'), 'yoga');
assert.strictEqual(mapGarminSportType('PILATES'), 'yoga');
assert.strictEqual(mapGarminSportType('INDOOR_CARDIO'), 'fitness');
assert.strictEqual(mapGarminSportType('HIIT'), 'fitness');
assert.strictEqual(mapGarminSportType('ELLIPTICAL'), 'elliptical');
assert.strictEqual(mapGarminSportType('INDOOR_ROWING'), 'rowing');
assert.strictEqual(mapGarminSportType('CROSS_COUNTRY_SKIING_WS'), 'skiing');
assert.strictEqual(mapGarminSportType('RESORT_SKIING_SNOWBOARDING_WS'), 'skiing');

// What was mapped before still maps the same.
assert.strictEqual(mapGarminSportType('RUNNING'), 'running');
assert.strictEqual(mapGarminSportType('TREADMILL_RUNNING'), 'running');
assert.strictEqual(mapGarminSportType('GRAVEL_CYCLING'), 'cycling');
assert.strictEqual(mapGarminSportType('VIRTUAL_RIDE'), 'cycling');
assert.strictEqual(mapGarminSportType('OPEN_WATER_SWIMMING'), 'swimming');
assert.strictEqual(mapGarminSportType('HIKING'), 'running');
assert.strictEqual(mapGarminSportType(''), 'running');
assert.strictEqual(mapGarminSportType('KITEBOARDING'), 'other');
assert.strictEqual(mapGarminSportType('INLINE_SKATING'), 'other');

// Stored values pass through unchanged, so re-mapping at read time is safe.
for (const v of ['running', 'cycling', 'swimming', 'triathlon', 'strength', 'yoga', 'fitness', 'elliptical', 'rowing', 'skiing', 'other']) {
  assert.strictEqual(mapGarminSportType(v), v, v);
}

// A row synced before the mapping: sport "other", the truth in raw.
assert.strictEqual(garminSportOf({ sport: 'other', raw: { activityType: 'STRENGTH_TRAINING' } }), 'strength');
assert.strictEqual(garminSportOf({ sport: 'other', raw: { activityType: { typeKey: 'yoga' } } }), 'yoga');
// A row an older build stored with the raw typeKey as its sport.
assert.strictEqual(garminSportOf({ sport: 'VIRTUAL_RIDE' }), 'cycling');
// A good row is left alone, whatever raw says.
assert.strictEqual(garminSportOf({ sport: 'cycling', raw: { activityType: 'YOGA' } }), 'cycling');
// Nothing to go on stays "other" — never a default of running.
assert.strictEqual(garminSportOf({ sport: 'other' }), 'other');
assert.strictEqual(garminSportOf({ sport: 'other', raw: { activityType: 'PADDLING' } }), 'other');
assert.strictEqual(garminSportOf({}), 'other');

console.log('garminSport.test.js passed');
