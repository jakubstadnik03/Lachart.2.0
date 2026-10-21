const { shouldPitchPremium, MAX_SENDS, MIN_GAP_DAYS } = require('./premiumPitchEligibility');

const ago = (d) => new Date(Date.now() - d * 864e5);

const free = (over = {}) => ({
  _id: 'u1',
  email: 'a@example.com',
  createdAt: ago(90),
  notifications: { emailNotifications: true, marketingEmails: true },
  retentionEmails: {},
  ...over,
});

const ask = (user, over = {}) => shouldPitchPremium({ user, isPaying: false, ...over });

describe('who gets a premium letter', () => {
  test('a free account that has been around a while', () => {
    expect(ask(free())).toEqual({ ok: true, reason: null });
  });

  test('never somebody who already pays', () => {
    expect(shouldPitchPremium({ user: free(), isPaying: true }))
      .toEqual({ ok: false, reason: 'already_paying' });
  });

  test('never when paying status was not looked up', () => {
    // A missing subscription lookup must not read as "free". This is the one
    // mistake there is no recovering from — the customer sees you asking them
    // to buy what they already bought.
    expect(shouldPitchPremium({ user: free() }).ok).toBe(false);
    expect(shouldPitchPremium({ user: free(), isPaying: undefined }).reason)
      .toBe('paying_status_unknown');
    expect(shouldPitchPremium({ user: free(), isPaying: null }).reason)
      .toBe('paying_status_unknown');
  });

  test('never somebody who unsubscribed, either way of saying it', () => {
    expect(ask(free({ notifications: { emailNotifications: false } })).reason).toBe('unsubscribed');
    expect(ask(free({ notifications: { marketingEmails: false } })).reason).toBe('marketing_opt_out');
    expect(ask(free({ marketingEmails: false })).reason).toBe('marketing_opt_out');
  });

  test('not an account still finishing onboarding', () => {
    expect(ask(free({ createdAt: ago(2) })).reason).toBe('account_too_new');
  });

  test('not a deactivated account', () => {
    expect(ask(free({ isActive: false })).reason).toBe('inactive_account');
  });
});

describe('how often', () => {
  test('a second letter waits two months', () => {
    const user = free({ retentionEmails: { premiumPitch: { count: 1, lastAt: ago(30) } } });
    expect(ask(user).reason).toBe('too_soon');
    const later = free({ retentionEmails: { premiumPitch: { count: 1, lastAt: ago(MIN_GAP_DAYS + 1) } } });
    expect(ask(later).ok).toBe(true);
  });

  test('and it stops after three, for good', () => {
    const user = free({ retentionEmails: { premiumPitch: { count: MAX_SENDS, lastAt: ago(400) } } });
    expect(ask(user).reason).toBe('asked_enough');
  });

  test('not within a fortnight of any other campaign', () => {
    // Including the newsletter, which the old per-campaign lists could not see.
    const user = free({ retentionEmails: { productUpdates: { '2027-01': ago(3) } } });
    expect(ask(user).reason).toBe('another_campaign_recently');
  });

  test('an old campaign does not block it', () => {
    const user = free({ retentionEmails: { winBackSent: ago(200) } });
    expect(ask(user).ok).toBe(true);
  });

  test('its own earlier letter counts as a campaign too', () => {
    // premiumPitch.lastAt is a date under retentionEmails, so the shared
    // throttle sees it without being told about it.
    const user = free({ retentionEmails: { premiumPitch: { count: 1, lastAt: ago(5) } } });
    expect(ask(user).ok).toBe(false);
  });
});

describe('the knobs', () => {
  test('gaps can be widened or narrowed from env', () => {
    const user = free({ retentionEmails: { premiumPitch: { count: 1, lastAt: ago(20) } } });
    expect(ask(user, { minGapDays: 10, quietDays: 1 }).ok).toBe(true);
    expect(ask(user, { minGapDays: 90 }).reason).toBe('too_soon');
  });

  test('rubbish state is treated as never asked', () => {
    expect(ask(free({ retentionEmails: { premiumPitch: 'nonsense' } })).ok).toBe(true);
  });
});
