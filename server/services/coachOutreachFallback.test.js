/**
 * The fallback recipient: what an admin gets when they click Send on a user
 * no segment claims. Plain Node, no jest — run with:
 *
 *   node server/services/coachOutreachFallback.test.js
 *
 * No database and no SMTP: everything here works on a person object, which is
 * exactly the seam buildFallbackPerson() produces.
 */

'use strict';

// The letter embeds a signed one-click login link, so the module chain reaches
// the JWT config and refuses to load without a secret. Any value works here —
// nothing verifies these tokens.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-used-for-verification';

const assert = require('assert');
const outreach = require('./coachOutreachService');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
    process.exitCode = 1;
  }
}

/** The shape buildFallbackPerson() returns for someone no segment claims. */
const fallbackPerson = (over = {}) => ({
  segment: 'others',
  userId: '6a5d9840584224e739f5af94',
  name: 'Jakub Stadnik',
  email: 'someone@example.com',
  role: 'athlete',
  hasTest: false,
  testCount: 0,
  sources: [],
  createdAt: new Date('2026-01-01'),
  lastLogin: new Date('2026-08-01'),
  alreadySentAt: null,
  optedOut: false,
  ...over,
});

console.log('the general version still sells premium');

test('renders a letter, not an empty shell', () => {
  const { html, subject } = outreach.previewFromPerson(fallbackPerson());
  assert.ok(html.length > 2000, `html was only ${html.length} chars`);
  assert.ok(subject && subject.length > 10, `weak subject: ${subject}`);
});

test('names a paid plan — this is the upgrade pitch', () => {
  const { html } = outreach.previewFromPerson(fallbackPerson());
  assert.ok(/Athlete plan|Coach plan/.test(html), 'no plan named in the letter');
});

test('lists features, not just a greeting', () => {
  const { html } = outreach.previewFromPerson(fallbackPerson());
  const hits = ['LT1', 'LT2', 'zones'].filter((w) => html.includes(w));
  assert.ok(hits.length >= 2, `only found ${JSON.stringify(hits)}`);
});

test('carries an unsubscribe link — it is a marketing email', () => {
  const { html } = outreach.previewFromPerson(fallbackPerson());
  assert.ok(/unsubscribe/i.test(html), 'no unsubscribe link');
});

test('adapts to what the account has, rather than claiming a test', () => {
  const without = outreach.previewFromPerson(fallbackPerson({ hasTest: false })).subject;
  const with_ = outreach.previewFromPerson(fallbackPerson({ hasTest: true })).subject;
  assert.notStrictEqual(without, with_, 'same subject whether or not they tested');
});

test('a nameless account still renders', () => {
  const { html, subject } = outreach.previewFromPerson(fallbackPerson({ name: '' }));
  assert.ok(html.length > 2000);
  assert.ok(subject.length > 10);
});

console.log('refusals that must survive the fallback path');

(async () => {
  const r = await outreach.sendToPerson(fallbackPerson({ optedOut: true }));
  test('opted out is refused, and nothing is sent', () => {
    assert.deepStrictEqual(r, { sent: false, reason: 'opted_out' });
  });

  const sentAt = new Date('2026-08-01');
  const r2 = await outreach.sendToPerson(fallbackPerson({ alreadySentAt: sentAt }));
  test('a repeat send is refused unless forced', () => {
    assert.strictEqual(r2.sent, false);
    assert.strictEqual(r2.reason, 'already_sent');
    assert.strictEqual(r2.alreadySentAt, sentAt);
  });

  const r3 = await outreach.sendToPerson(fallbackPerson({ optedOut: true, alreadySentAt: null }), { force: true });
  test('force does not override opting out', () => {
    assert.strictEqual(r3.reason, 'opted_out');
  });

  console.log(`\n${passed} passed`);
})();
