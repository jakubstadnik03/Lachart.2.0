/**
 * Coach ↔ athlete link rules. Plain Node, no jest — run with:
 *
 *   node server/utils/athleteCoachAccess.test.js
 *
 * A coach saw three athletes in the bar and could open none of them: the bar
 * filtered on "linked" and the profile refused on "invited", and two of the
 * three were both. These pin the one rule both now share — linked wins — and
 * the account question the athlete list answers alongside it.
 */

'use strict';

const assert = require('assert');
const {
  hasPendingInviteFromCoach,
  athleteHasOwnAccount,
  coachLinkFields,
} = require('./athleteCoachAccess');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

const COACH = '6aa11b0188d5f41d3ac4071c';
const OTHER = '6aa11b0188d5f41d3ac40000';
const coach = (over = {}) => ({ _id: COACH, pendingAthleteIds: [], ...over });
const athlete = (over = {}) => ({ _id: 'a1', coachId: null, coachIds: [], pendingCoachId: null, ...over });

console.log('hasPendingInviteFromCoach');

test('invited and not linked is pending', () => {
  assert.strictEqual(hasPendingInviteFromCoach(athlete({ pendingCoachId: COACH }), coach()), true);
});

test('listed on the coach side only is still pending', () => {
  assert.strictEqual(hasPendingInviteFromCoach(athlete(), coach({ pendingAthleteIds: ['a1'] })), true);
});

test('linked wins over a stale invitation flag on the athlete', () => {
  const a = athlete({ coachId: COACH, coachIds: [COACH], pendingCoachId: COACH });
  assert.strictEqual(hasPendingInviteFromCoach(a, coach({ pendingAthleteIds: ['a1'] })), false);
});

test('linked through coachIds alone also wins', () => {
  const a = athlete({ coachIds: [COACH], pendingCoachId: COACH });
  assert.strictEqual(hasPendingInviteFromCoach(a, coach()), false);
});

test('a pending invite from another coach is not this coach’s business', () => {
  assert.strictEqual(hasPendingInviteFromCoach(athlete({ pendingCoachId: OTHER }), coach()), false);
});

test('nothing at all is not pending', () => {
  assert.strictEqual(hasPendingInviteFromCoach(athlete(), coach()), false);
  assert.strictEqual(hasPendingInviteFromCoach(null, coach()), false);
  assert.strictEqual(hasPendingInviteFromCoach(athlete(), null), false);
});

console.log('athleteHasOwnAccount');

test('an ordinary email signup has an account even with isRegistrationComplete unset', () => {
  assert.strictEqual(athleteHasOwnAccount({ signupMethod: 'email' }), true);
  assert.strictEqual(athleteHasOwnAccount({ signupMethod: 'google', isRegistrationComplete: true }), true);
});

test('the stub an invitation leaves behind is not an account', () => {
  assert.strictEqual(athleteHasOwnAccount({ isPreRegistered: true, signupMethod: 'coach_invite' }), false);
});

test('a coach-registered athlete has no account until they finish registering', () => {
  assert.strictEqual(athleteHasOwnAccount({ signupMethod: 'coach_invite', isRegistrationComplete: false }), false);
  assert.strictEqual(athleteHasOwnAccount({ signupMethod: 'coach_invite', isRegistrationComplete: true }), true);
});

console.log('coachLinkFields');

test('the linked-but-flagged athlete reads active with an account', () => {
  const a = athlete({ coachId: COACH, coachIds: [COACH], pendingCoachId: COACH, signupMethod: 'google', isRegistrationComplete: true });
  assert.deepStrictEqual(coachLinkFields(a, coach({ pendingAthleteIds: ['a1'] })), {
    invitationPending: false, coachLinkStatus: 'active', hasAccount: true,
  });
});

test('a stub linked at invitation time is active without an account', () => {
  const a = athlete({ coachId: COACH, coachIds: [COACH], isPreRegistered: true, signupMethod: 'coach_invite' });
  assert.deepStrictEqual(coachLinkFields(a, coach()), {
    invitationPending: false, coachLinkStatus: 'active', hasAccount: false,
  });
});

test('an existing athlete who has not answered is pending with an account', () => {
  const a = athlete({ pendingCoachId: COACH, signupMethod: 'email' });
  assert.deepStrictEqual(coachLinkFields(a, coach()), {
    invitationPending: true, coachLinkStatus: 'pending', hasAccount: true,
  });
});

console.log(`\n${passed} passed${process.exitCode ? ', with failures' : ''}`);
