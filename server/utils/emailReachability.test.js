/**
 * node server/utils/emailReachability.test.js
 *
 * These are the addresses that filled the Zoho inbox with
 * "550 5.1.1 <lachart@lachart.net>: unauthorized sender" — Apple's Hide My
 * Email relay refusing a sender that is not registered against the app's Sign
 * in with Apple configuration. 30 of 826 accounts are on one.
 */

'use strict';

const assert = require('assert');
const { isAppleRelay, isSyntheticAppleAddress, emailReachability } = require('./emailReachability');

// Real relay addresses seen in production.
for (const e of [
  '2sbd4cv96w@privaterelay.appleid.com',
  'ndgtvp82dk@privaterelay.appleid.com',
  'NDGTVP82DK@PrivateRelay.AppleId.Com',
]) {
  assert.strictEqual(isAppleRelay(e), true, e);
  assert.strictEqual(emailReachability(e).reachable, false, e);
  assert.strictEqual(emailReachability(e).reason, 'apple-relay-unregistered');
}

// The placeholder this app invents when Apple returns no address at all —
// never deliverable, and distinguishable so it can be reported separately.
assert.strictEqual(isSyntheticAppleAddress('apple_001234.abc@privaterelay.appleid.com'), true);
assert.strictEqual(emailReachability('apple_001234.abc@privaterelay.appleid.com').reason, 'apple-relay-placeholder');
assert.strictEqual(isSyntheticAppleAddress('2sbd4cv96w@privaterelay.appleid.com'), false);

// Everything else is reachable as far as this check is concerned.
for (const e of ['jakub.stadnik@seznam.cz', 'a@b.co', 'someone@icloud.com', 'x@apple.com']) {
  assert.strictEqual(emailReachability(e).reachable, true, e);
}

assert.strictEqual(emailReachability('').reachable, false);
assert.strictEqual(emailReachability(null).reason, 'no-address');

// A lookalike domain must not be swept up with the real relay.
assert.strictEqual(isAppleRelay('me@notprivaterelay.appleid.com.example'), false);

console.log('emailReachability: Apple relay detected, placeholders separated');
