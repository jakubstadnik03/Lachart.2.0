/**
 * Which ping callback URLs the Garmin webhook may fetch. Plain Node — run with:
 *
 *   node server/utils/garminCallbackUrl.test.js
 */

'use strict';

const assert = require('assert');
const { isGarminCallbackUrl } = require('./garminCallbackUrl');

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

test("Garmin's own callback hosts", () => {
  assert.strictEqual(isGarminCallbackUrl('https://apis.garmin.com/wellness-api/rest/dailies?uploadStartTimeInSeconds=1'), true);
  assert.strictEqual(isGarminCallbackUrl('https://healthapi.garmin.com/x'), true);
});

test('anything else is refused', () => {
  assert.strictEqual(isGarminCallbackUrl('https://attacker.example/x'), false);
  assert.strictEqual(isGarminCallbackUrl('https://garmin.com.attacker.example/x'), false);
  assert.strictEqual(isGarminCallbackUrl('https://evilgarmin.com/x'), false);
  assert.strictEqual(isGarminCallbackUrl('http://apis.garmin.com/x'), false);
  assert.strictEqual(isGarminCallbackUrl('https://user:pw@apis.garmin.com/x'), false);
  assert.strictEqual(isGarminCallbackUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.strictEqual(isGarminCallbackUrl('not a url'), false);
  assert.strictEqual(isGarminCallbackUrl(undefined), false);
});

console.log(`${passed} passed`);
