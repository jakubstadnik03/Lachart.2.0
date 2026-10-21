const {
  providerOf, isLive, canStartCheckout, manageBilling, canBindStoreTransaction,
  STRIPE, APPLE, GOOGLE,
} = require('./billingProvider');

/**
 * Subscription rows are one per user (userId is unique on the schema). Selling
 * the same product through three billing systems therefore needs a rule about
 * which one owns a given user, or a Stripe payer who taps Subscribe in the iOS
 * app overwrites their own row and pays twice.
 */

const live = (over = {}) => ({
  plan: 'pro',
  status: 'active',
  currentPeriodEnd: new Date(Date.now() + 7 * 864e5),
  provider: STRIPE,
  ...over,
});

describe('providerOf', () => {
  test('every row written before this existed is Stripe', () => {
    expect(providerOf({ plan: 'pro', status: 'active' })).toBe(STRIPE);
    expect(providerOf({})).toBe(STRIPE);
    expect(providerOf(null)).toBe(STRIPE);
  });

  test('and an unknown value is not taken at face value', () => {
    expect(providerOf({ provider: 'paypal' })).toBe(STRIPE);
  });

  test('the three we sell through', () => {
    expect(providerOf({ provider: 'apple' })).toBe(APPLE);
    expect(providerOf({ provider: 'GOOGLE' })).toBe(GOOGLE);
  });
});

describe('isLive', () => {
  test('active and trialing both count', () => {
    expect(isLive(live())).toBe(true);
    expect(isLive(live({ status: 'trialing' }))).toBe(true);
  });

  test('free is not a subscription', () => {
    expect(isLive(live({ plan: 'free' }))).toBe(false);
  });

  test('an expired period is not live however active it claims to be', () => {
    expect(isLive(live({ currentPeriodEnd: new Date(Date.now() - 864e5) }))).toBe(false);
  });

  test('cancelled, past due, missing', () => {
    expect(isLive(live({ status: 'canceled' }))).toBe(false);
    expect(isLive(live({ status: 'past_due' }))).toBe(false);
    expect(isLive(null)).toBe(false);
  });
});

describe('canStartCheckout', () => {
  test('a free user may buy anywhere', () => {
    [STRIPE, APPLE, GOOGLE].forEach((p) => {
      expect(canStartCheckout({ subscription: null, provider: p }).allowed).toBe(true);
    });
  });

  test('a lapsed subscriber may buy again, anywhere', () => {
    const lapsed = live({ status: 'canceled' });
    expect(canStartCheckout({ subscription: lapsed, provider: APPLE }).allowed).toBe(true);
  });

  test('a Stripe payer is refused in the App Store', () => {
    // The double-billing case: one row per user, two bills, neither system
    // aware of the other.
    const r = canStartCheckout({ subscription: live(), provider: APPLE });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('active_elsewhere');
    expect(r.activeProvider).toBe(STRIPE);
  });

  test('an App Store subscriber is refused on the web', () => {
    const r = canStartCheckout({ subscription: live({ provider: APPLE }), provider: STRIPE });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('active_elsewhere');
    expect(r.activeProvider).toBe(APPLE);
  });

  test('buying again where you already pay is a plan change, not a checkout', () => {
    const r = canStartCheckout({ subscription: live(), provider: STRIPE });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('already_subscribed');
  });

  test('a legacy row with no provider still blocks the App Store', () => {
    // Every paying customer today has one of these.
    const legacy = { plan: 'pro', status: 'active' };
    expect(canStartCheckout({ subscription: legacy, provider: APPLE })).toEqual({
      allowed: false, reason: 'active_elsewhere', activeProvider: STRIPE,
    });
  });

  test('a provider we do not sell through is refused', () => {
    expect(canStartCheckout({ subscription: null, provider: 'paypal' }).allowed).toBe(false);
    expect(canStartCheckout({ subscription: null }).allowed).toBe(false);
  });
});

describe('manageBilling', () => {
  test('Stripe we can drive ourselves', () => {
    expect(manageBilling(live())).toEqual({
      target: 'stripe_portal', url: null, selfServe: true,
    });
  });

  test('Apple and Google we can only point at', () => {
    // A server cannot cancel either one, which is why the cancel-reason
    // question has to be asked before the user leaves for Settings.
    const apple = manageBilling(live({ provider: APPLE }));
    expect(apple.selfServe).toBe(false);
    expect(apple.url).toContain('apps.apple.com');

    const google = manageBilling(live({ provider: GOOGLE }));
    expect(google.selfServe).toBe(false);
    expect(google.url).toContain('play.google.com');
  });

  test('a legacy row goes to the Stripe portal', () => {
    expect(manageBilling({ plan: 'pro', status: 'active' }).selfServe).toBe(true);
  });
});

describe('canBindStoreTransaction', () => {
  test('a purchase nobody has claimed binds to the buyer', () => {
    expect(canBindStoreTransaction({ existingUserId: null, userId: 'u1' }).allowed).toBe(true);
  });

  test('restoring onto the same account is allowed', () => {
    // Reinstall, second device, new phone.
    expect(canBindStoreTransaction({ existingUserId: 'u1', userId: 'u1' }).allowed).toBe(true);
  });

  test('ObjectId and string forms are the same account', () => {
    const asObjectId = { toString: () => 'u1' };
    expect(canBindStoreTransaction({ existingUserId: asObjectId, userId: 'u1' }).allowed).toBe(true);
  });

  test('one purchase cannot pay for a second account', () => {
    // Without this, lending somebody an Apple ID lends them premium for as
    // many LaChart accounts as they care to make.
    const r = canBindStoreTransaction({ existingUserId: 'u1', userId: 'u2' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('bound_to_another_account');
  });

  test('no account, no binding', () => {
    expect(canBindStoreTransaction({ existingUserId: null, userId: null }).allowed).toBe(false);
    expect(canBindStoreTransaction({}).allowed).toBe(false);
  });
});
