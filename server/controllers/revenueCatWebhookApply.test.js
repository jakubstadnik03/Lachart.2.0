/**
 * A purchase must end with the account linked to its subscription row:
 * premium is read through user.subscriptionId, and most accounts have never
 * had one. Without the link, a paying customer stayed on the free plan.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only';

jest.mock('../models/UserModel', () => ({ findById: jest.fn(), countDocuments: jest.fn(async () => 0) }));
jest.mock('../models/SubscriptionModel', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
const User = require('../models/UserModel');
const Subscription = require('../models/SubscriptionModel');
const controller = require('./subscriptionController');

const SECRET = 'whsec_lachart_example_value';
const USER_ID = '507f1f77bcf86cd799439011';
const SUB_ID = '507f1f77bcf86cd799439099';

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const req = (event) => ({ get: () => SECRET, body: { event } });
const purchase = (over = {}) => ({
  type: 'INITIAL_PURCHASE', id: 'evt1', app_user_id: USER_ID, store: 'APP_STORE', environment: 'PRODUCTION',
  entitlement_ids: ['athlete'], product_id: 'net.lachart.athlete.monthly', period_type: 'TRIAL',
  purchased_at_ms: Date.now(), expiration_at_ms: Date.now() + 14 * 864e5, original_transaction_id: '2000000123456789',
  ...over,
});

beforeEach(() => {
  process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
  Subscription.findOne.mockReturnValue({ select: () => ({ lean: async () => null }) });
  Subscription.findOneAndUpdate.mockResolvedValue({ _id: SUB_ID, plan: 'pro', status: 'trialing' });
});

test('links the subscription to an account that never had one', async () => {
  const user = { _id: USER_ID, role: 'athlete', email: 'a@b.c', subscriptionId: undefined, save: jest.fn() };
  User.findById.mockResolvedValue(user);
  const res = mockRes();
  await controller.revenueCatWebhook(req(purchase()), res);
  expect(res.body).toMatchObject({ applied: true });
  expect(String(user.subscriptionId)).toBe(SUB_ID);
  expect(user.save).toHaveBeenCalledTimes(1);
});

test('saves the role when the Coach plan is bought', async () => {
  Subscription.findOneAndUpdate.mockResolvedValue({ _id: SUB_ID, plan: 'coach', status: 'trialing' });
  const user = { _id: USER_ID, role: 'athlete', email: 'a@b.c', subscriptionId: SUB_ID, save: jest.fn() };
  User.findById.mockResolvedValue(user);
  await controller.revenueCatWebhook(req(purchase({ entitlement_ids: ['coach'], product_id: 'net.lachart.coach.monthly' })), mockRes());
  expect(user.role).toBe('coach');
  expect(user.save).toHaveBeenCalledTimes(1);
});

test('does not write the user when nothing about the account changed', async () => {
  const user = { _id: USER_ID, role: 'athlete', email: 'a@b.c', subscriptionId: SUB_ID, save: jest.fn() };
  User.findById.mockResolvedValue(user);
  await controller.revenueCatWebhook(req(purchase({ type: 'RENEWAL' })), mockRes());
  expect(user.save).not.toHaveBeenCalled();
});
