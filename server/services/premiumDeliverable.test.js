process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only';
const { deliverable } = require('./premiumCampaignService');

/**
 * The premium queue spent its first ticks on addresses that can never be
 * delivered to. Two per hour, silently skipped, so it looked from outside
 * exactly like a scheduler that had never been switched on.
 */
describe('deliverable', () => {
  test('an ordinary address', () => {
    expect(deliverable('matt@example.com')).toBe(true);
    expect(deliverable('a.b-c+d@sub.example.co.uk')).toBe(true);
  });

  test('not an Apple Hide My Email forwarder', () => {
    // Apple only forwards from senders registered against the app's Sign in
    // with Apple config. Until that is done these bounce, every time.
    expect(deliverable('d4f2a1@privaterelay.appleid.com')).toBe(false);
  });

  test('not a string with no @ in it', () => {
    // A real row in production: "x00199700".
    expect(deliverable('x00199700')).toBe(false);
  });

  test('not a half-formed address', () => {
    ['a@', '@b.com', 'a@b', 'a b@c.com', '', null, undefined]
      .forEach((e) => expect(deliverable(e)).toBe(false));
  });

  test('surrounding whitespace does not decide it either way', () => {
    expect(deliverable('  matt@example.com  ')).toBe(true);
  });
});
