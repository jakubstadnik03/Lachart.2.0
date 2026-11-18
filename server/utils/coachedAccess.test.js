/**
 * Coached access rules. Plain Node, no jest — run with:
 *
 *   node server/utils/coachedAccess.test.js
 *
 * Coaches said their clients would not pay for a second app, so a coach-tier
 * plan now opens the read-only side of Pro in each linked athlete's own
 * login. These pin who counts as "paying for their athletes" and which
 * features that opens — and that nothing which creates work comes with it.
 */

'use strict';

const assert = require('assert');

process.env.SUBSCRIPTION_ENABLED = 'true';
delete process.env.BETA_ALL_PREMIUM;

const {
  COACHED_FEATURES,
  coachPlanCoversAthletes,
  resolveCoachedAccess,
  coachedFeatureAllowed,
  coachedAccessPayload,
} = require('./coachedAccess');

let passed = 0;
const pending = [];
const test = (name, fn) => {
  pending.push(Promise.resolve().then(fn).then(
    () => { passed += 1; console.log(`  ✓ ${name}`); },
    (e) => { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; },
  ));
};

const COACH = '6aa11b0188d5f41d3ac4071c';
const OTHER = '6aa11b0188d5f41d3ac40000';
const future = new Date(Date.now() + 7 * 864e5);
const sub = (over = {}) => ({ plan: 'coach', status: 'active', currentPeriodEnd: future, ...over });
const coach = (over = {}) => ({ _id: COACH, name: 'Anna', surname: 'Berg', premium: false, subscriptionId: sub(), ...over });
const loader = (...coaches) => async (ids) => coaches.filter((c) => ids.includes(String(c._id)));

// ── who pays for their athletes ─────────────────────────────────────────────
test('an active Coach plan covers its athletes', () => {
  assert.strictEqual(coachPlanCoversAthletes(coach(), sub()), true);
});

test('so do Team and Enterprise, and a trial', () => {
  assert.strictEqual(coachPlanCoversAthletes(coach(), sub({ plan: 'team' })), true);
  assert.strictEqual(coachPlanCoversAthletes(coach(), sub({ plan: 'enterprise' })), true);
  assert.strictEqual(coachPlanCoversAthletes(coach(), sub({ status: 'trialing' })), true);
});

test('an Athlete plan does not — it is a solo plan', () => {
  assert.strictEqual(coachPlanCoversAthletes(coach(), sub({ plan: 'pro' })), false);
});

test('a lapsed or canceled coach plan does not', () => {
  assert.strictEqual(coachPlanCoversAthletes(coach(), sub({ status: 'canceled' })), false);
  assert.strictEqual(coachPlanCoversAthletes(coach(), sub({ currentPeriodEnd: new Date(Date.now() - 864e5) })), false);
});

test('a coach with no plan at all does not', () => {
  assert.strictEqual(coachPlanCoversAthletes(coach(), null), false);
});

test('a comped coach (manual premium) does', () => {
  assert.strictEqual(coachPlanCoversAthletes(coach({ premium: true }), null), true);
});

test('the beta bypass is not something athletes inherit through their coach', () => {
  process.env.BETA_ALL_PREMIUM = 'true';
  try {
    assert.strictEqual(coachPlanCoversAthletes(coach(), null), false);
  } finally {
    delete process.env.BETA_ALL_PREMIUM;
  }
});

// ── resolving it for an athlete ─────────────────────────────────────────────
test('an athlete with no coach has no coached access', async () => {
  const r = await resolveCoachedAccess({ _id: 'a1' }, { loadCoaches: loader(coach()) });
  assert.strictEqual(r.active, false);
});

test('an athlete linked to a paying coach gets it, with the coach named', async () => {
  const r = await resolveCoachedAccess({ coachId: COACH }, { loadCoaches: loader(coach()) });
  assert.deepStrictEqual(r, { active: true, coachId: COACH, coachName: 'Anna Berg' });
});

test('any one paying coach is enough when there are several', async () => {
  const unpaid = coach({ _id: OTHER, name: 'Free', surname: 'Coach', subscriptionId: null });
  const r = await resolveCoachedAccess(
    { coachId: OTHER, coachIds: [OTHER, COACH] },
    { loadCoaches: loader(unpaid, coach()) },
  );
  assert.strictEqual(r.active, true);
  assert.strictEqual(r.coachId, COACH);
});

test('a coach id that no longer exists is skipped, not fatal', async () => {
  const r = await resolveCoachedAccess({ coachIds: [OTHER] }, { loadCoaches: loader(coach()) });
  assert.strictEqual(r.active, false);
});

test('a failed lookup leaves the athlete on their own plan', async () => {
  const r = await resolveCoachedAccess({ coachId: COACH }, {
    loadCoaches: async () => { throw new Error('db down'); },
  });
  assert.strictEqual(r.active, false);
});

// ── what it opens ───────────────────────────────────────────────────────────
test('it opens history, full calendar and the analytics charts', () => {
  const on = { active: true };
  ['test_history', 'calendar_full_history', 'advanced_analytics'].forEach((k) => {
    assert.strictEqual(coachedFeatureAllowed(k, on), true, k);
  });
});

test('and nothing that creates work or costs per use', () => {
  const on = { active: true };
  ['plan_workouts', 'unlimited_tests', 'pdf_export', 'population_comparison', 'manage_athletes']
    .forEach((k) => assert.strictEqual(coachedFeatureAllowed(k, on), false, k));
});

test('inactive access opens nothing', () => {
  COACHED_FEATURES.forEach((k) => assert.strictEqual(coachedFeatureAllowed(k, { active: false }), false));
  assert.strictEqual(coachedFeatureAllowed('test_history', null), false);
});

test('every coached feature is a real gate key', () => {
  const { FEATURE_MATRIX } = require('../middleware/featureGate');
  COACHED_FEATURES.forEach((k) => assert.ok(FEATURE_MATRIX[k], k));
});

test('the client payload names the coach only when active', () => {
  assert.deepStrictEqual(coachedAccessPayload({ active: false, coachName: 'x' }), { active: false });
  assert.deepStrictEqual(
    coachedAccessPayload({ active: true, coachId: COACH, coachName: 'Anna Berg' }),
    { active: true, coachName: 'Anna Berg', features: [...COACHED_FEATURES] },
  );
});

Promise.all(pending).then(() => {
  console.log(`${passed}/${pending.length} passed`);
  process.exit(process.exitCode || 0);
});
