/**
 * Linking an athlete to a coach. Plain Node, no jest — run with:
 *
 *   node server/services/coachAthleteLinkService.test.js
 *
 * The model is replaced with a recorder: what matters here is which fields
 * each update touches, on which side, not what Mongo does with them.
 */

'use strict';

const assert = require('assert');
const mongoose = require('mongoose');
const User = require('../models/UserModel');

const COACH = new mongoose.Types.ObjectId();
const ATHLETE = new mongoose.Types.ObjectId();

let calls = [];
User.updateOne = async (filter, update) => { calls.push({ filter, update }); return { acknowledged: true }; };
User.findById = async (id) => ({ _id: id, claimed: true });

const {
  linkAthleteToCoach, clearStalePendingFlags, claimPreRegisteredStub,
} = require('./coachAthleteLinkService');

let passed = 0;
const test = async (name, fn) => {
  calls = [];
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; }
};

const athleteUpdate = () => calls.find((c) => String(c.filter._id) === String(ATHLETE) && !c.filter.pendingAthleteId);
const coachUpdate = () => calls.find((c) => String(c.filter._id) === String(COACH) && c.update.$addToSet);
const coachSlotUpdate = () => calls.find((c) => String(c.filter._id) === String(COACH) && c.filter.pendingAthleteId);

(async () => {
  console.log('linkAthleteToCoach');

  await test('links both sides and clears the coach’s invitation on the athlete', async () => {
    const a = { _id: ATHLETE, coachIds: [], coachId: null, pendingCoachId: COACH };
    const r = await linkAthleteToCoach(a, COACH);
    assert.strictEqual(r.alreadyLinked, false);
    const au = athleteUpdate().update.$set;
    assert.deepStrictEqual(au.coachIds.map(String), [String(COACH)]);
    assert.strictEqual(String(au.coachId), String(COACH));
    assert.strictEqual(au.pendingCoachId, null);
    assert.strictEqual(au.invitationToken, null);
    const cu = coachUpdate().update;
    assert.strictEqual(String(cu.$addToSet.athletes), String(ATHLETE));
    assert.strictEqual(String(cu.$pull.pendingAthleteIds), String(ATHLETE));
    assert.ok(coachSlotUpdate(), 'the athlete-to-coach slot is checked too');
  });

  await test('leaves another coach’s invitation alone', async () => {
    const OTHER = new mongoose.Types.ObjectId();
    const a = { _id: ATHLETE, coachIds: [], coachId: null, pendingCoachId: OTHER };
    await linkAthleteToCoach(a, COACH);
    const au = athleteUpdate().update.$set;
    assert.strictEqual('pendingCoachId' in au, false);
    assert.strictEqual('invitationToken' in au, false);
  });

  await test('keeps an existing second coach', async () => {
    const OTHER = new mongoose.Types.ObjectId();
    const a = { _id: ATHLETE, coachIds: [OTHER], coachId: OTHER, pendingCoachId: null };
    await linkAthleteToCoach(a, COACH);
    const au = athleteUpdate().update.$set;
    assert.deepStrictEqual(au.coachIds.map(String), [String(OTHER), String(COACH)]);
    assert.strictEqual(String(au.coachId), String(OTHER), 'the first coach stays primary');
  });

  await test('an already linked pair only tidies flags', async () => {
    const a = { _id: ATHLETE, coachIds: [COACH], coachId: COACH, pendingCoachId: COACH };
    const r = await linkAthleteToCoach(a, COACH);
    assert.strictEqual(r.alreadyLinked, true);
    assert.strictEqual(athleteUpdate().update.$set.pendingCoachId, null);
  });

  console.log('clearStalePendingFlags');

  await test('does nothing for a pair that is not linked', async () => {
    await clearStalePendingFlags({ _id: ATHLETE, coachIds: [], pendingCoachId: COACH }, { _id: COACH, pendingAthleteIds: [] });
    assert.strictEqual(calls.length, 0);
  });

  await test('does nothing for a linked pair with no flags', async () => {
    await clearStalePendingFlags({ _id: ATHLETE, coachIds: [COACH], pendingCoachId: null }, { _id: COACH, pendingAthleteIds: [] });
    assert.strictEqual(calls.length, 0);
  });

  await test('clears a linked pair flagged on either side', async () => {
    await clearStalePendingFlags({ _id: ATHLETE, coachIds: [COACH], pendingCoachId: null }, { _id: COACH, pendingAthleteIds: [ATHLETE] });
    assert.ok(coachUpdate(), 'coach side pulled');
    calls = [];
    await clearStalePendingFlags({ _id: ATHLETE, coachIds: [COACH], pendingCoachId: COACH }, { _id: COACH, pendingAthleteIds: [] });
    assert.strictEqual(athleteUpdate().update.$set.pendingCoachId, null);
  });

  console.log('claimPreRegisteredStub');

  await test('fills the stub in, marks it real, and links the inviting coach', async () => {
    const stub = { _id: ATHLETE, isPreRegistered: true, name: '', surname: '', pendingCoachId: COACH, coachIds: [] };
    await claimPreRegisteredStub(stub, { name: 'Jan', surname: 'Novák', password: 'hash', signupMethod: 'email', emailVerified: undefined });
    const claim = calls[0].update.$set;
    assert.strictEqual(claim.isPreRegistered, false);
    assert.strictEqual(claim.isRegistrationComplete, true);
    assert.strictEqual(claim.name, 'Jan');
    assert.strictEqual(claim.invitationToken, null);
    assert.strictEqual('emailVerified' in claim, false, 'undefined fields are not written');
    assert.ok(coachUpdate(), 'the coach link is made');
  });

  await test('a stub linked at invitation time links through coachId', async () => {
    const stub = { _id: ATHLETE, isPreRegistered: true, name: '', surname: '', pendingCoachId: null, coachId: COACH, coachIds: [COACH] };
    await claimPreRegisteredStub(stub, { googleId: 'g1', name: undefined, surname: undefined });
    const claim = calls[0].update.$set;
    assert.strictEqual(claim.name, 'Athlete', 'a provider with no name still yields a valid record');
    assert.ok(coachUpdate());
  });

  console.log(`\n${passed} passed${process.exitCode ? ', with failures' : ''}`);
  process.exit(process.exitCode || 0);
})();
