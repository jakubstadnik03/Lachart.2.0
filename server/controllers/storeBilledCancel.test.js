/**
 * Apple bills an in-app subscription and only Apple can cancel it. Marking it
 * cancelled here told the subscriber they were done while Apple kept charging,
 * so cancel, reactivate and the Stripe portal must refuse and point to the
 * store instead.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only';

jest.mock('../models/UserModel', () => ({ findById: jest.fn() }));
const User = require('../models/UserModel');
const controller = require('./subscriptionController');

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const userWith = (subscription) => {
  User.findById.mockReturnValue({ populate: () => Promise.resolve({ _id: 'u1', subscriptionId: subscription }) });
};

describe('a subscription billed through the App Store', () => {
  const appleSub = () => ({
    provider: 'apple', plan: 'pro', status: 'active', cancelAtPeriodEnd: false,
    save: jest.fn(),
  });

  test('is not cancelled here', async () => {
    const sub = appleSub();
    userWith(sub);
    const res = mockRes();
    await controller.cancelSubscription({ user: { userId: 'u1' }, body: {} }, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.reason).toBe('managed_by_store');
    expect(res.body.manageUrl).toMatch(/apps\.apple\.com/);
    expect(sub.cancelAtPeriodEnd).toBe(false);
    expect(sub.save).not.toHaveBeenCalled();
  });

  test('is not reactivated here', async () => {
    const sub = appleSub();
    userWith(sub);
    const res = mockRes();
    await controller.reactivateSubscription({ user: { userId: 'u1' }, body: {} }, res);
    expect(res.statusCode).toBe(409);
    expect(sub.save).not.toHaveBeenCalled();
  });
});
