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

// Once the portal says Verified, the flag reopens the relay — and the
// placeholder addresses stay blocked, because those were never real.
process.env.APPLE_RELAY_SENDER_REGISTERED = 'true';
assert.strictEqual(emailReachability('2sbd4cv96w@privaterelay.appleid.com').reachable, true,
  'a registered sender may use the relay');
assert.strictEqual(emailReachability('apple_1@privaterelay.appleid.com').reachable, false,
  'the invented placeholder is still undeliverable');
delete process.env.APPLE_RELAY_SENDER_REGISTERED;
assert.strictEqual(emailReachability('2sbd4cv96w@privaterelay.appleid.com').reachable, false,
  'and blocking is the default');

assert.strictEqual(emailReachability('').reachable, false);
assert.strictEqual(emailReachability(null).reason, 'no-address');

// A lookalike domain must not be swept up with the real relay.
assert.strictEqual(isAppleRelay('me@notprivaterelay.appleid.com.example'), false);

console.log('emailReachability: Apple relay detected, placeholders separated');

// --- the transporter gate --------------------------------------------------
// Wrapping sendMail rather than each campaign is the point: twenty-one senders
// exist here and a guard any one of them can forget is a guard that gets
// forgotten.
//
// It THROWS rather than resolving. The first version resolved with
// {skipped:true}, which reads as success to anyone who does not inspect the
// result — and most of those senders record "sent" on the very next line. Six
// Apple relay accounts were stamped with a send date for letters that never
// left before this was caught.
const { guardUnreachable } = require('./createEmailTransporter');

(async () => {
  const sent = [];
  const t = guardUnreachable({ sendMail: async (m) => { sent.push(m.to); return { accepted: [m.to] }; } });

  let threw = null;
  try {
    await t.sendMail({ to: 'ndgtvp82dk@privaterelay.appleid.com', subject: 'x' });
  } catch (e) { threw = e; }
  assert.ok(threw, 'an unreachable address must not resolve');
  assert.strictEqual(threw.skipped, true, 'and is marked as a skip, not an SMTP fault');
  assert.strictEqual(threw.permanent, true, 'retrying will never help');
  assert.strictEqual(threw.reason, 'apple-relay-unregistered');
  assert.strictEqual(sent.length, 0, 'and never reaches the transport');

  const ok = await t.sendMail({ to: 'jakub.stadnik@seznam.cz', subject: 'x' });
  assert.ok(ok.accepted, 'a real send still goes and carries its result through');
  assert.strictEqual(sent.length, 1);

  // A mixed list still goes: dropping five recipients because one is a relay
  // would lose four deliverable ones.
  await t.sendMail({ to: ['a@b.co', 'x@privaterelay.appleid.com'], subject: 'x' });
  assert.strictEqual(sent.length, 2, 'mixed lists are not dropped');

  // Wrapping twice must not double-wrap.
  assert.strictEqual(guardUnreachable(t), t);

  console.log('emailReachability: the gate throws, so a skip cannot pass for a send');
})().catch((e) => { console.error(e); process.exit(1); });
