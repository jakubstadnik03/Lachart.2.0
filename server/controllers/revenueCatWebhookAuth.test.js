/**
 * The webhook's front door. These paths all return before anything touches
 * the database, which is what makes them testable without one — and they are
 * the paths where a mistake is a hole rather than a bug.
 */

// The controller pulls in models and mailers at require time; none of them run
// on the paths under test, but they need an env to load against.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only';

const controller = require('./subscriptionController');

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const reqWith = (auth, body = {}) => ({
  get: (h) => (h.toLowerCase() === 'authorization' ? auth : undefined),
  body,
});

describe('authenticating a RevenueCat delivery', () => {
  const SECRET = 'whsec_lachart_example_value';
  let saved;

  beforeEach(() => { saved = process.env.REVENUECAT_WEBHOOK_SECRET; });
  afterEach(() => {
    if (saved === undefined) delete process.env.REVENUECAT_WEBHOOK_SECRET;
    else process.env.REVENUECAT_WEBHOOK_SECRET = saved;
  });

  test('refuses everything while no secret is configured', async () => {
    delete process.env.REVENUECAT_WEBHOOK_SECRET;
    const res = mockRes();
    await controller.revenueCatWebhook(reqWith(SECRET), res);
    // Open by default would mean anybody who found the URL could grant
    // themselves premium.
    expect(res.statusCode).toBe(503);
  });

  test('rejects a wrong secret', async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
    const res = mockRes();
    await controller.revenueCatWebhook(reqWith('wrong_value_entirely'), res);
    expect(res.statusCode).toBe(401);
  });

  test('rejects a missing header', async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
    const res = mockRes();
    await controller.revenueCatWebhook(reqWith(undefined), res);
    expect(res.statusCode).toBe(401);
  });

  test('rejects a prefix of the secret', async () => {
    // Lengths differ, so this must be refused before any byte comparison.
    process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
    const res = mockRes();
    await controller.revenueCatWebhook(reqWith(SECRET.slice(0, -1)), res);
    expect(res.statusCode).toBe(401);
  });

  test('accepts the configured value, bare or as a Bearer token', async () => {
    process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
    for (const header of [SECRET, `Bearer ${SECRET}`, `bearer ${SECRET}`]) {
      const res = mockRes();
      // An event with no type gets past auth and is declined on its merits.
      await controller.revenueCatWebhook(reqWith(header, { event: {} }), res);
      expect(res.statusCode).toBe(200);
      expect(res.body.applied).toBe(false);
    }
  });
});

describe('answering RevenueCat', () => {
  const SECRET = 'whsec_lachart_example_value';
  beforeEach(() => { process.env.REVENUECAT_WEBHOOK_SECRET = SECRET; });

  test('an event we decline still gets a 200', async () => {
    // A non-2xx is retried for hours, and retrying an unmappable product
    // will never make it mappable.
    const res = mockRes();
    await controller.revenueCatWebhook(reqWith(SECRET, {
      event: { type: 'TEST', app_user_id: 'u1', store: 'APP_STORE', environment: 'PRODUCTION' },
    }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ received: true, applied: false });
  });

  test('a sandbox purchase is declined, not applied', async () => {
    const res = mockRes();
    await controller.revenueCatWebhook(reqWith(SECRET, {
      event: {
        type: 'INITIAL_PURCHASE', app_user_id: 'u1', store: 'APP_STORE',
        environment: 'SANDBOX', entitlement_ids: ['athlete'],
      },
    }), res);
    expect(res.body).toMatchObject({ applied: false, reason: 'sandbox' });
  });
});
