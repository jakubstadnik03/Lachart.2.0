/**
 * Admin recognition. Plain Node, no jest — run with:
 *
 *   node server/utils/isAdminUser.test.js
 */

'use strict';

const assert = require('assert');
const { isAdminUser } = require('./isAdminUser');

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

console.log('isAdminUser');

// The shape every real administrator in this database actually has: the
// boolean set, the role left as whatever they train as.
test('admin: true with role athlete is an admin', () => {
  assert.strictEqual(isAdminUser({ admin: true, role: 'athlete' }), true);
});

test('role admin is an admin even without the flag', () => {
  assert.strictEqual(isAdminUser({ role: 'admin' }), true);
});

test('role matching ignores case', () => {
  assert.strictEqual(isAdminUser({ role: 'Admin' }), true);
  assert.strictEqual(isAdminUser({ role: 'ADMIN' }), true);
});

test('a coach is not an admin', () => {
  assert.strictEqual(isAdminUser({ role: 'coach' }), false);
});

test('an athlete is not an admin', () => {
  assert.strictEqual(isAdminUser({ role: 'athlete' }), false);
});

test('a truthy-but-not-true flag does not count', () => {
  // Guards against a stray string sneaking someone past the gate.
  assert.strictEqual(isAdminUser({ admin: 'yes' }), false);
  assert.strictEqual(isAdminUser({ admin: 1 }), false);
});

test('missing user is not an admin', () => {
  assert.strictEqual(isAdminUser(null), false);
  assert.strictEqual(isAdminUser(undefined), false);
  assert.strictEqual(isAdminUser({}), false);
});

console.log(`\n${passed} passed`);
