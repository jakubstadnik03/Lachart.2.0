/**
 * The recurring premium letter.
 *
 * Every other campaign here is a one-shot aimed at a segment. This one comes
 * back: three letters, two months apart, to anybody on the free plan, and then
 * never again. The restraint is the point — 51 of 687 have already opted out,
 * and an offer that follows people around is the one they unsubscribe from.
 *
 * Who it never reaches is decided in utils/premiumPitchEligibility, which is
 * pure and tested. The single rule worth repeating here: paying status is
 * looked up in the Subscription collection and passed in, never inferred, so
 * that a failed lookup reads as "don't know" rather than as "not paying". The
 * one unacceptable outcome is asking a subscriber to subscribe.
 *
 * The letter has two versions of its middle paragraph. Somebody with a saved
 * test is told what premium does with the test they already have; somebody
 * without is told what it would do with their first. Pitching history and
 * trends at an empty account is selling a view of nothing.
 *
 * State: retentionEmails.premiumPitch = { count, lastAt }.
 */

'use strict';

const crypto = require('crypto');
const User = require('../models/UserModel');
const Subscription = require('../models/SubscriptionModel');
const Test = require('../models/test');
const { emailLinkBase } = require('../utils/emailLinkBase');
const { createCampaignTransporter, campaignSender } = require('../utils/createEmailTransporter');
const { getClientUrl } = require('../utils/emailTemplate');
const { shouldPitchPremium, pitchState, STATE_KEY } = require('../utils/premiumPitchEligibility');
const { emailReachability } = require('../utils/emailReachability');

const UTM_CAMPAIGN = 'premium-recurring';
const SENT_KEY = `${STATE_KEY}.lastAt`;

const BRAND = {
  primary: '#767EB5', primaryDark: '#5E6590', primaryTint: '#E9ECF6',
  accent: '#FF6B4A', ink: '#0A0E1A', text: '#1D2C4C', muted: '#6B7280',
  bg: '#F3F4F6', surface: '#FFFFFF', border: '#E5E7EB',
};

const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS || 14);
const ATHLETE_PRICE = '€6.99';
const COACH_PRICE = '€14.99';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function utmQs() {
  return `utm_source=lachart&utm_medium=email&utm_campaign=${encodeURIComponent(UTM_CAMPAIGN)}`;
}
function appendUtm(url) {
  if (!url) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${utmQs()}`;
}

function unsubscribeTokenFor(userId) {
  const secret = process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'lachart-unsub';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 24);
}
function unsubscribeUrlFor(userId) {
  return `${emailLinkBase()}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeTokenFor(userId)}`;
}

const COPY = {
  subject: (hasTest) => (hasTest
    ? 'Your zones are measuring your training. See the rest of it.'
    : `Everything LaChart does once there is a test in it`),
  pill: 'LaChart Premium',
  title: (hasTest) => (hasTest
    ? 'You have the hard part already'
    : 'One test, and the rest follows'),
  body: (hasTest) => (hasTest
    ? 'You have run a lactate test and your zones came out of it. What premium adds is time: every test you ever do side by side, the trend of your thresholds, and your training load measured against them rather than against a guess.'
    : 'LaChart turns one lactate test into training zones you can actually ride and run to. Premium is what happens after the first one — your tests compared over time, your load measured against your own thresholds, and structured workouts sent to your watch.'),
  features: [
    ['📈', 'Your whole test history', 'Every test on one curve. Watch a threshold move instead of guessing whether it did.'],
    ['⚖️', 'Form, fitness and fatigue', 'Training load measured against your own thresholds, not a formula built on somebody else.'],
    ['⌚', 'Workouts on your watch', 'Build a session from your zones and push it to Garmin. No manual entry.'],
    ['📄', 'Reports worth sending', 'A PDF of a test an athlete or a coach can read without you explaining it.'],
  ],
  cta: `Start ${TRIAL_DAYS} days free`,
  ctaPath: '/settings?tab=subscription',
  terms: `${TRIAL_DAYS} days free, then ${ATHLETE_PRICE} a month for athletes or ${COACH_PRICE} for coaches. Cancel any time before it ends and you are not charged.`,
};

function renderHtml({ firstName, hasTest, unsubscribeUrl }) {
  const clientUrl = getClientUrl();
  const ctaUrl = appendUtm(`${clientUrl}${COPY.ctaPath}`);
  const greet = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi there,';
  const features = COPY.features.map(([icon, title, body]) => `
    <tr><td style="padding:10px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="30" valign="top" style="font-size:18px;line-height:22px;">${icon}</td>
        <td style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
          <div style="font-size:14px;font-weight:700;color:${BRAND.ink};">${escapeHtml(title)}</div>
          <div style="font-size:13px;line-height:20px;color:${BRAND.muted};margin-top:2px;">${escapeHtml(body)}</div>
        </td>
      </tr></table>
    </td></tr>`).join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.bg};padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
    <tr><td style="padding:26px 26px 0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
      <div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${BRAND.primary};">${COPY.pill}</div>
      <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;color:${BRAND.ink};">${escapeHtml(COPY.title(hasTest))}</h1>
      <p style="margin:14px 0 0;font-size:14px;line-height:22px;color:${BRAND.text};">${greet}</p>
      <p style="margin:10px 0 0;font-size:14px;line-height:22px;color:${BRAND.text};">${escapeHtml(COPY.body(hasTest))}</p>
    </td></tr>
    <tr><td style="padding:6px 26px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${features}</table>
    </td></tr>
    <tr><td align="center" style="padding:18px 26px 6px;">
      <a href="${ctaUrl}" style="display:inline-block;padding:13px 26px;border-radius:12px;background:${BRAND.primaryDark};color:#fff;text-decoration:none;font-family:system-ui,sans-serif;font-size:15px;font-weight:700;">${escapeHtml(COPY.cta)}</a>
    </td></tr>
    <tr><td style="padding:4px 26px 22px;">
      <p style="margin:0;font-size:11px;line-height:17px;color:${BRAND.muted};text-align:center;">${escapeHtml(COPY.terms)}</p>
    </td></tr>
    <tr><td style="padding:14px 26px;background:${BRAND.primaryTint};border-top:1px solid ${BRAND.border};">
      <p style="margin:0;font-size:11px;line-height:17px;color:${BRAND.muted};text-align:center;font-family:system-ui,sans-serif;">
        — Jakub, LaChart<br>
        <a href="${unsubscribeUrl}" style="color:${BRAND.muted};text-decoration:underline;">Unsubscribe from product emails</a>
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** Active or trialing subscribers — the people this must never reach. */
async function payingUserIds() {
  const rows = await Subscription.find({
    status: { $in: ['active', 'trialing'] },
    plan: { $nin: ['free', null] },
  }).select('userId currentPeriodEnd').lean();
  const now = Date.now();
  return new Set(rows
    .filter((r) => !r.currentPeriodEnd || new Date(r.currentPeriodEnd).getTime() > now)
    .map((r) => String(r.userId)));
}

async function hasSavedTest(userId) {
  return (await Test.countDocuments({ athleteId: userId }).limit(1)) > 0;
}

/**
 * Is this address worth a slot?
 *
 * An address the transporter's reachability guard will refuse is a wasted
 * one: the send throws, the tick counts it as skipped, and at two an hour a
 * queue headed by Apple relay forwarders never reaches anybody real. It was —
 * the first two candidates in production were an Apple Hide My Email
 * forwarder and a string with no @ in it. The guard still has the final say at
 * send time; this only stops the queue filling with addresses it will reject.
 */
function deliverable(email) {
  const e = String(email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return false;
  return emailReachability(e).reachable;
}

/** Everyone who has ever saved a test. One query instead of one per user. */
async function testerIds() {
  const ids = await Test.distinct('athleteId');
  return new Set(ids.filter(Boolean).map(String));
}

async function findReadyCandidates(limit = 20) {
  const paying = await payingUserIds();

  const pool = await User.find({
    email: { $exists: true, $nin: [null, ''] },
    isActive: { $ne: false },
    signupMethod: { $ne: 'coach_invite' },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
    marketingEmails: { $ne: false },
    [`retentionEmails.${STATE_KEY}.count`]: { $not: { $gte: 3 } },
  })
    .select('_id email name surname isActive notifications marketingEmails retentionEmails createdAt appDownloadEmail')
    // Oldest accounts first: they have had the longest to decide and the
    // longest since anybody wrote to them.
    .sort({ createdAt: 1 })
    .limit(Math.max(limit * 20, 500))
    .lean();

  // Someone who has saved a test has seen the product work, and that is who
  // converts: of thirty-three finished trials, twenty-one became paying, and
  // they were not the accounts that never tested. Sorting by age alone put
  // those accounts first, so the campaign would have spent its first two
  // months talking to the people least likely to answer. Testers go first;
  // the rest follow once that queue runs dry.
  // An address the transporter's reachability guard will refuse is a wasted
  // slot: the send throws, the tick counts it as skipped, and at two per hour
  // a queue headed by Apple relay forwarders never reaches anybody real. The
  // guard still has the final say at send time — this only stops the queue
  // being filled with addresses it is going to reject.
  const testers = await testerIds();
  const ready = [];
  for (const hasTest of [true, false]) {
    for (const user of pool) {
      if (ready.length >= limit) break;
      if (testers.has(String(user._id)) !== hasTest) continue;
      if (!deliverable(user.email)) continue;
      const verdict = shouldPitchPremium({ user, isPaying: paying.has(String(user._id)) });
      if (!verdict.ok) continue;
      ready.push({ user, hasTest });
    }
    if (ready.length >= limit) break;
  }
  return ready;
}

async function sendPremiumPitch(user, { dryRun = false, track = true, preview = false, hasTest = null } = {}) {
  let withTest = hasTest;
  if (!preview) {
    const paying = await payingUserIds();
    const verdict = shouldPitchPremium({ user, isPaying: paying.has(String(user._id)) });
    if (!verdict.ok) return { sent: false, reason: verdict.reason };
    if (withTest === null) withTest = await hasSavedTest(user._id);
  }

  const subject = COPY.subject(Boolean(withTest));
  const html = renderHtml({
    firstName: user.name || null,
    hasTest: Boolean(withTest),
    unsubscribeUrl: unsubscribeUrlFor(user._id),
  });
  if (dryRun) return { sent: false, reason: 'dry_run', subject };

  const transporter = createCampaignTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_unavailable' };

  try {
    const info = await transporter.sendMail({
      from: { ...campaignSender(), name: 'LaChart' },
      to: user.email,
      subject,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrlFor(user._id)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info?.rejected) ? info.rejected : [];
    if (!accepted.some((a) => String(a).toLowerCase() === user.email.toLowerCase()) || rejected.length) {
      return { sent: false, reason: 'relay_rejected', smtp: { accepted, rejected } };
    }
    if (track) {
      const { count } = pitchState(user);
      await User.updateOne({ _id: user._id }, {
        $set: {
          [`retentionEmails.${STATE_KEY}.count`]: count + 1,
          [`retentionEmails.${STATE_KEY}.lastAt`]: new Date(),
        },
      });
    }
    console.log(`[premium] sent to ${user.email} (letter ${pitchState(user).count + 1} of 3)`);
    return { sent: true, subject };
  } catch (e) {
    if (e?.skipped || e?.permanent) return { sent: false, reason: e.reason || 'unreachable' };
    console.error(`[premium] failed for ${user.email}:`, e?.message || e);
    return { sent: false, reason: 'send_failed', message: e?.message };
  }
}

async function getCampaignStats() {
  const [everSent, ready, paying] = await Promise.all([
    User.countDocuments({ [`retentionEmails.${STATE_KEY}.count`]: { $gte: 1 } }),
    findReadyCandidates(1000),
    payingUserIds(),
  ]);
  return { everSent, readyNow: ready.length, excludedAsPaying: paying.size };
}

function renderPreview(user = {}, { hasTest = true } = {}) {
  return renderHtml({
    firstName: user.name || null,
    hasTest,
    unsubscribeUrl: unsubscribeUrlFor(user._id || 'preview'),
  });
}

module.exports = {
  sendPremiumPitch, findReadyCandidates, getCampaignStats, renderPreview, deliverable,
  unsubscribeUrlFor, payingUserIds, COPY, STATE_KEY, SENT_KEY, UTM_CAMPAIGN,
};
