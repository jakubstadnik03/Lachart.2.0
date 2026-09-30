/**
 * What Stripe says, written back over what we think.
 *
 * Local Subscription rows drift: a webhook that never landed leaves a status of
 * "trialing" on a trial that ended in July, or an "active" row with no
 * currentPeriodEnd at all. The second kind matters most, because
 * subscriptionRecordIsActive only rejects a period end that EXISTS and is past
 * — a missing one sails through, and the account keeps premium on the strength
 * of a subscription nobody has checked since it was created.
 *
 * This runs where the live Stripe key is. It cannot be run from a laptop: the
 * key in server/.env is sk_test, and every live subscription id returns
 * resource_missing against it — including ones known to be paying. Reconciling
 * from there would have "discovered" that every subscriber had vanished.
 *
 * Read-only unless apply is passed. A row whose subscription Stripe does not
 * know is reported and left alone rather than cancelled: the id being absent
 * proves nothing on its own — a key from the wrong mode produces exactly the
 * same answer, and that is not a reason to cut off a paying customer.
 */

'use strict';

const Subscription = require('../models/SubscriptionModel');
const User = require('../models/UserModel');

/** Stripe moved the period end onto the item in recent API versions. */
function periodEndOf(sub) {
  if (sub?.current_period_end) return sub.current_period_end;
  return sub?.items?.data?.[0]?.current_period_end || null;
}

async function reconcileSubscriptions({ apply = false, onlyMissingPeriodEnd = true } = {}) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { error: 'STRIPE_SECRET_KEY not set' };
  }
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const mode = process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'live' : 'test';

  const query = {
    status: { $in: ['active', 'trialing'] },
    stripeSubscriptionId: { $exists: true, $ne: null },
  };
  if (onlyMissingPeriodEnd) {
    query.$or = [{ currentPeriodEnd: null }, { currentPeriodEnd: { $exists: false } }];
  }

  const rows = await Subscription.find(query).lean();
  const report = { mode, apply, checked: rows.length, updated: 0, unknownToStripe: 0, rows: [] };

  for (const row of rows) {
    const user = row.userId
      // eslint-disable-next-line no-await-in-loop
      ? await User.findById(row.userId).select('email').lean()
      : null;
    const entry = {
      email: user?.email || null,
      localStatus: row.status,
      plan: row.plan,
      stripeStatus: null,
      periodEnd: null,
      action: 'none',
    };

    let live = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      live = await stripe.subscriptions.retrieve(row.stripeSubscriptionId);
    } catch (e) {
      entry.stripeStatus = e?.code || e?.message || 'error';
      entry.action = 'left alone — Stripe does not know this id';
      report.unknownToStripe += 1;
      report.rows.push(entry);
      // eslint-disable-next-line no-continue
      continue;
    }

    const pe = periodEndOf(live);
    entry.stripeStatus = live.status;
    entry.periodEnd = pe ? new Date(pe * 1000).toISOString() : null;
    entry.cancelAtPeriodEnd = !!live.cancel_at_period_end;

    if (apply) {
      const set = { status: live.status, cancelAtPeriodEnd: !!live.cancel_at_period_end };
      if (pe) set.currentPeriodEnd = new Date(pe * 1000);
      if (live.canceled_at) set.canceledAt = new Date(live.canceled_at * 1000);
      // eslint-disable-next-line no-await-in-loop
      await Subscription.updateOne({ _id: row._id }, { $set: set });
      entry.action = 'updated from Stripe';
      report.updated += 1;
    } else {
      entry.action = 'would update from Stripe';
    }
    report.rows.push(entry);
  }

  return report;
}

module.exports = { reconcileSubscriptions, periodEndOf };
