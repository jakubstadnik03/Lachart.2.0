/**
 * Plain Node, no jest — run with: node server/controllers/invoiceSubscriptionId.test.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only';
const assert = require('assert');
const { invoiceSubscriptionId } = require('./subscriptionController');

let passed = 0;
const t = (name, fn) => { fn(); passed += 1; console.log(`  ok  ${name}`); };

t('reads the pre-2025 shape', () => assert.strictEqual(invoiceSubscriptionId({ subscription: 'sub_1' }), 'sub_1'));
t('reads the basil shape', () => assert.strictEqual(
  invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_2' } } }), 'sub_2'));
t('reads an expanded subscription', () => assert.strictEqual(invoiceSubscriptionId({ subscription: { id: 'sub_3' } }), 'sub_3'));
t('a one-off invoice has none', () => assert.strictEqual(invoiceSubscriptionId({}), null));
console.log(`\n${passed} passed`);
process.exit(0);
