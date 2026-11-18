/**
 * Self-chosen sign-up roles. Plain Node, no jest — run with:
 *
 *   node server/utils/signupRole.test.js
 */

'use strict';

const assert = require('assert');
const { normalizeSignupRole } = require('./signupRole');

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

test('keeps the roles the sign-up form offers', () => {
  assert.strictEqual(normalizeSignupRole('athlete'), 'athlete');
  assert.strictEqual(normalizeSignupRole('coach'), 'coach');
  assert.strictEqual(normalizeSignupRole('tester'), 'tester');
});

test('never grants the internal testing role or admin', () => {
  assert.strictEqual(normalizeSignupRole('testing'), 'athlete');
  assert.strictEqual(normalizeSignupRole('TESTING'), 'athlete');
  assert.strictEqual(normalizeSignupRole('admin'), 'athlete');
});

test('falls back to athlete for anything else', () => {
  assert.strictEqual(normalizeSignupRole(undefined), 'athlete');
  assert.strictEqual(normalizeSignupRole(['coach']), 'athlete');
  assert.strictEqual(normalizeSignupRole(' Coach '), 'coach');
});

console.log(`${passed} passed`);
