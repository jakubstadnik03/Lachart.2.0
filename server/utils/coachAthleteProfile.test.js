/**
 * What a coach's screens are told about an athlete. Plain Node, no jest — run with:
 *
 *   node server/utils/coachAthleteProfile.test.js
 */

'use strict';

const assert = require('assert');
const { athleteIdentityFields, ATHLETE_IDENTITY_FIELDS } = require('./coachAthleteProfile');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

const debbie = {
  _id: 'a1',
  name: 'Debbie',
  surname: 'Verstelle',
  email: 'debbie@example.com',
  role: 'athlete',
  gender: 'female',
  sport: 'run',
  height: 172,
  weight: 57,
  dateOfBirth: '1983-08-18',
  password: 'hashed',
  invitationToken: 'tok',
};

console.log('\nWhat a coach is told about an athlete\n');

test('carries the athlete\'s gender, which is the whole point of this list', () => {
  // The reported bug: a coach set an athlete to Female, it looked right, and
  // on coming back to her profile she had a man's avatar. The field was never
  // in the endpoint's hand-written list, and the client turns a missing
  // gender into 'male' rather than into nothing.
  assert.strictEqual(athleteIdentityFields(debbie).gender, 'female');
});

test('does not invent a gender for an athlete who has none', () => {
  // A default applied out here is exactly what hid the bug: it makes an
  // absent answer indistinguishable from a given one. The schema has its own
  // default, and the client has its own fallback.
  const { gender, ...rest } = debbie;
  assert.strictEqual(athleteIdentityFields(rest).gender, undefined);
});

test('carries the rest of what the profile screen draws', () => {
  const out = athleteIdentityFields(debbie);
  assert.strictEqual(out.sport, 'run');
  assert.strictEqual(out.height, 172);
  assert.strictEqual(out.weight, 57);
  assert.strictEqual(out.dateOfBirth, '1983-08-18');
  assert.strictEqual(out.email, 'debbie@example.com');
  assert.strictEqual(out.role, 'athlete');
});

test('hands over nothing that is not on the list', () => {
  // The list is a whitelist, so a secret cannot ride along on a document that
  // happens to carry one.
  const out = athleteIdentityFields(debbie);
  assert.deepStrictEqual(Object.keys(out).sort(), [...ATHLETE_IDENTITY_FIELDS].sort());
  assert.ok(!('password' in out), 'password must not be handed to a coach');
  assert.ok(!('invitationToken' in out), 'invitation token must not be handed to a coach');
  // The name is deliberately absent: the routes add it through
  // displayNameForCoach, which decides what a coach may call this athlete.
  assert.ok(!('name' in out), 'the name comes from displayNameForCoach, not from here');
});

test('an empty or missing athlete is an empty answer, not a throw', () => {
  assert.deepStrictEqual(athleteIdentityFields(null), {});
  assert.deepStrictEqual(athleteIdentityFields(undefined), {});
  assert.deepStrictEqual(athleteIdentityFields('nonsense'), {});
});

console.log(`\n${passed} passed\n`);
