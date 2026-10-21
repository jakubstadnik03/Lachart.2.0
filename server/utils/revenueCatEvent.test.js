const { mapRevenueCatEvent } = require('./revenueCatEvent');

/**
 * This is the only thing standing between a webhook body and somebody's
 * premium access, so the cases that matter are the ones where getting it wrong
 * either gives the product away or takes it from a paying customer.
 */

const HOUR = 3600e3;
const now = Date.now();

const purchase = (over = {}) => ({
  type: 'INITIAL_PURCHASE',
  app_user_id: '507f1f77bcf86cd799439011',
  store: 'APP_STORE',
  environment: 'PRODUCTION',
  entitlement_ids: ['athlete'],
  product_id: 'net.lachart.athlete.monthly',
  period_type: 'NORMAL',
  purchased_at_ms: now,
  expiration_at_ms: now + 30 * 24 * HOUR,
  original_transaction_id: '2000000123456789',
  ...over,
});

describe('a purchase that should grant access', () => {
  test('App Store, athlete product, production', () => {
    const r = mapRevenueCatEvent(purchase());
    expect(r.action).toBe('upsert');
    expect(r.provider).toBe('apple');
    expect(r.userId).toBe('507f1f77bcf86cd799439011');
    expect(r.patch.plan).toBe('pro');
    expect(r.patch.status).toBe('active');
    expect(r.patch.appleOriginalTransactionId).toBe('2000000123456789');
    expect(r.patch.currentPeriodEnd.getTime()).toBe(now + 30 * 24 * HOUR);
  });

  test('the coach entitlement is the coach plan', () => {
    const r = mapRevenueCatEvent(purchase({
      entitlement_ids: ['coach'], product_id: 'net.lachart.coach.monthly',
    }));
    expect(r.patch.plan).toBe('coach');
  });

  test('Play Store lands as google with its token', () => {
    const r = mapRevenueCatEvent(purchase({ store: 'PLAY_STORE', transaction_id: 'tok_abc' }));
    expect(r.provider).toBe('google');
    expect(r.patch.googlePurchaseToken).toBe('tok_abc');
    expect(r.patch.appleOriginalTransactionId).toBeUndefined();
  });

  test('a trial is trialing, not active', () => {
    // resolvePremiumAccess treats both as premium, but the difference is what
    // the win-back and the trial-ending email key on.
    const r = mapRevenueCatEvent(purchase({ period_type: 'TRIAL' }));
    expect(r.patch.status).toBe('trialing');
    expect(r.patch.trialEnd.getTime()).toBe(now + 30 * 24 * HOUR);
  });

  test('a renewal moves the period end out', () => {
    const r = mapRevenueCatEvent(purchase({ type: 'RENEWAL', expiration_at_ms: now + 60 * 24 * HOUR }));
    expect(r.patch.status).toBe('active');
    expect(r.patch.currentPeriodEnd.getTime()).toBe(now + 60 * 24 * HOUR);
  });
});

describe('losing access, in the right order', () => {
  test('cancelling keeps what was paid for until it runs out', () => {
    // Cutting access the moment somebody cancels takes away time they bought,
    // and closes the only window a win-back has.
    const r = mapRevenueCatEvent(purchase({ type: 'CANCELLATION' }));
    expect(r.patch.status).toBe('active');
    expect(r.patch.cancelAtPeriodEnd).toBe(true);
    expect(r.patch.canceledAt).toBeInstanceOf(Date);
  });

  test('expiry is where access actually ends', () => {
    const r = mapRevenueCatEvent(purchase({ type: 'EXPIRATION' }));
    expect(r.patch.status).toBe('canceled');
  });

  test('a billing problem is past_due, not cancelled', () => {
    // The stores retry for days. Treating a retry as a cancellation throws
    // out a customer who is still paying.
    const r = mapRevenueCatEvent(purchase({ type: 'BILLING_ISSUE' }));
    expect(r.patch.status).toBe('past_due');
  });

  test('uncancelling puts it back', () => {
    const r = mapRevenueCatEvent(purchase({ type: 'UNCANCELLATION' }));
    expect(r.patch.status).toBe('active');
    expect(r.patch.cancelAtPeriodEnd).toBe(false);
  });

  test('a paused Play subscription runs to the end of the period', () => {
    const r = mapRevenueCatEvent(purchase({ type: 'SUBSCRIPTION_PAUSED', store: 'PLAY_STORE' }));
    expect(r.patch.cancelAtPeriodEnd).toBe(true);
  });
});

describe('what must never grant access', () => {
  test('a sandbox purchase, which is free and anyone can make', () => {
    expect(mapRevenueCatEvent(purchase({ environment: 'SANDBOX' })))
      .toMatchObject({ action: 'ignore', reason: 'sandbox' });
  });

  test('…unless a test rig says so', () => {
    const r = mapRevenueCatEvent(purchase({ environment: 'SANDBOX' }), { allowSandbox: true });
    expect(r.action).toBe('upsert');
  });

  test('a product nobody mapped', () => {
    // A typo in App Store Connect must not hand out premium.
    const r = mapRevenueCatEvent(purchase({
      entitlement_ids: [], product_id: 'net.lachart.athlete.montly',
    }));
    expect(r.action).toBe('reject');
    expect(r.reason).toContain('unknown_product');
  });

  test('a purchase made before anyone logged in', () => {
    const r = mapRevenueCatEvent(purchase({ app_user_id: '$RCAnonymousID:9c7e' }));
    expect(r).toMatchObject({ action: 'reject', reason: 'anonymous_app_user_id' });
    expect(mapRevenueCatEvent(purchase({ app_user_id: '' })).action).toBe('reject');
  });

  test('a transfer between accounts is surfaced, not guessed', () => {
    const r = mapRevenueCatEvent(purchase({ type: 'TRANSFER' }));
    expect(r).toMatchObject({ action: 'reject', reason: 'transfer_needs_review' });
  });

  test('garbage', () => {
    expect(mapRevenueCatEvent(null).action).toBe('reject');
    expect(mapRevenueCatEvent({}).action).toBe('reject');
  });
});

describe('what is deliberately left alone', () => {
  test('Stripe relayed through RevenueCat — our own webhook owns those rows', () => {
    // Two writers on one row is how they drift apart.
    expect(mapRevenueCatEvent(purchase({ store: 'STRIPE' })))
      .toMatchObject({ action: 'ignore', reason: 'stripe_owned_by_its_own_webhook' });
  });

  test('test events and one-off purchases', () => {
    expect(mapRevenueCatEvent(purchase({ type: 'TEST' })).action).toBe('ignore');
    expect(mapRevenueCatEvent(purchase({ type: 'NON_RENEWING_PURCHASE' })).action).toBe('ignore');
  });

  test('a store we do not sell through', () => {
    expect(mapRevenueCatEvent(purchase({ store: 'AMAZON' })).action).toBe('ignore');
  });

  test('an event type RevenueCat adds later', () => {
    // Unknown is ignored rather than rejected: a new event type is not an
    // error, and must not page anybody at 3am.
    expect(mapRevenueCatEvent(purchase({ type: 'SOMETHING_NEW_IN_2027' })).action).toBe('ignore');
  });
});

describe('the plan map override', () => {
  test('env JSON extends the defaults', () => {
    const r = mapRevenueCatEvent(purchase({ entitlement_ids: ['team'], product_id: 'x' }), {
      planMapRaw: '{"team":"team"}',
    });
    expect(r.patch.plan).toBe('team');
  });

  test('malformed JSON falls back instead of rejecting every purchase', () => {
    const r = mapRevenueCatEvent(purchase(), { planMapRaw: '{not json' });
    expect(r.action).toBe('upsert');
    expect(r.patch.plan).toBe('pro');
  });
});
