/**
 * One email to everyone who started a subscription and stopped — asking why.
 *
 * It is not the win-back drip. That one goes to people who never subscribed at
 * all and sells the product; this one goes to people who got as far as the
 * checkout and left, and its job is to get a sentence back out of them. The
 * offer is there so the mail has something to give rather than only ask, but
 * the question comes first and the reply address is a person.
 *
 * Who actually leaves, as of October 2026: of twenty-six, twenty-four never
 * paid a cent — they cancelled inside the free trial. "Why did you cancel your
 * subscription" would be the wrong question put to almost everyone who gets
 * this, so the copy talks about the trial running out instead, which is true
 * for both groups.
 *
 * State: retentionEmails.cancelFeedbackSent (Date). One send per user, ever.
 */

const crypto = require('crypto');
const { emailLinkBase } = require('../utils/emailLinkBase');
const User = require('../models/UserModel');
const Subscription = require('../models/SubscriptionModel');
const { createCampaignTransporter, campaignSender } = require('../utils/createEmailTransporter');
const { getClientUrl } = require('../utils/emailTemplate');

const UTM_CAMPAIGN = '2026-10-cancel-feedback';
const SENT_KEY = 'cancelFeedbackSent';
const PROMO_CODE = '2MonthsOFF';

/** Replies have to reach a human, or the question is decoration. */
const REPLY_TO = process.env.CANCEL_FEEDBACK_REPLY_TO || process.env.EMAIL_USER;

const BRAND = {
  primary: '#767EB5', primaryDark: '#5E6590', primaryTint: '#E9ECF6',
  accent: '#FF6B4A', ink: '#0A0E1A', text: '#1D2C4C', muted: '#6B7280',
  bg: '#F3F4F6', surface: '#FFFFFF', border: '#E5E7EB',
};

const COPY = {
  subject: 'What was missing?',
  heroTitle: 'What was missing?',
  cta: 'Use the code',
  ctaPath: '/settings?tab=subscription',
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function utmQs() { return `utm_source=email&utm_medium=lifecycle&utm_campaign=${encodeURIComponent(UTM_CAMPAIGN)}`; }
function appendUtm(url) { if (!url) return url; const sep = url.includes('?') ? '&' : '?'; return `${url}${sep}${utmQs()}`; }

function unsubscribeTokenFor(userId) {
  const secret = process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET || 'lachart';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 32);
}

function unsubscribeUrlFor(userId) {
  const base = emailLinkBase();
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeTokenFor(userId)}`;
}

/** Anyone who reached a subscription and then stopped it, however far they got. */
async function churnedUserIds() {
  const rows = await Subscription.find(
    { $or: [{ status: 'canceled' }, { cancelAtPeriodEnd: true }] },
    { userId: 1 },
  ).lean();
  return [...new Set(rows.map((r) => String(r.userId)).filter(Boolean))];
}

function isEligibleBase(user) {
  if (!user?.email) return false;
  if (user.isActive === false) return false;
  if (user.notifications?.emailNotifications === false) return false;
  if (user.notifications?.marketingEmails === false) return false;
  if (user.retentionEmails?.[SENT_KEY]) return false;
  return true;
}

/**
 * Plain, short, and a question before an offer.
 *
 * The other campaigns open with a feature grid, which is the right shape for
 * selling and the wrong one for asking: a designed brochure that ends in
 * "tell me what went wrong" reads as a form letter, and nobody writes back to
 * a form letter. This one is a note with a discount at the bottom.
 */
function renderHtml({ firstName, unsubscribeUrl }) {
  const clientUrl = getClientUrl();
  const ctaUrl = appendUtm(`${clientUrl}${COPY.ctaPath}`);
  const greet = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi,';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(COPY.subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.text};-webkit-font-smoothing:antialiased;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px 56px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;">
      <tr><td style="padding:32px 30px 28px;font-size:16px;line-height:1.65;">
        <p style="margin:0 0 18px;">${greet}</p>

        <p style="margin:0 0 18px;">
          You started a LaChart subscription a while back and it has since ended.
          I am not writing to talk you back into it — I would just like to know what was missing.
        </p>

        <p style="margin:0 0 18px;">
          Was it a feature that was not there? Something that did not work? Too expensive,
          or simply not the right time? <strong style="color:${BRAND.ink};">Hit reply and tell me in one sentence.</strong>
          It goes straight to me, and I read every one.
        </p>

        <p style="margin:0 0 20px;">
          And in case two weeks was never going to be long enough to see a training block through:
          here are two months on me, no charge. A lactate curve only means something once you have
          trained against it for a while.
        </p>

        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;background:${BRAND.primaryTint};border-radius:12px;margin:0 0 20px;">
          <tr><td style="padding:18px 20px;text-align:center;">
            <div style="font-size:13px;color:${BRAND.muted};margin-bottom:6px;">Two months free with the code</div>
            <div style="font-size:24px;font-weight:800;letter-spacing:0.04em;color:${BRAND.ink};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(PROMO_CODE)}</div>
            <div style="font-size:12px;color:${BRAND.muted};margin-top:8px;">Enter it at checkout. Cancel any time — if it is still not for you, that is an answer too.</div>
          </td></tr>
        </table>

        <p style="margin:0 0 24px;text-align:center;">
          <a href="${ctaUrl}" style="display:inline-block;background:${BRAND.accent};color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;font-size:15px;">${escapeHtml(COPY.cta)}</a>
        </p>

        <p style="margin:0;color:${BRAND.muted};">
          Either way, thanks for giving it a go.<br/>
          — Jakub, LaChart
        </p>
      </td></tr>
    </table>
    <p style="text-align:center;margin-top:20px;font-size:12px;color:#9CA3AF;line-height:1.65;">
      <a href="${unsubscribeUrl}" style="color:#9CA3AF;text-decoration:underline;">Unsubscribe from product emails</a>
      &nbsp;·&nbsp;
      <a href="${appendUtm(`${clientUrl}/settings?tab=notifications`)}" style="color:#9CA3AF;text-decoration:underline;">Notification settings</a>
    </p>
  </div>
</body></html>`;
}

async function isEligible(user) {
  if (!isEligibleBase(user)) return false;
  const ids = await churnedUserIds();
  return ids.includes(String(user._id));
}

async function sendCancelFeedback(user, { dryRun = false, track = true, preview = false } = {}) {
  if (!preview) {
    const ok = await isEligible(user);
    if (!ok) return { sent: false, reason: 'not_eligible' };
  }
  const html = renderHtml({ firstName: user.name || null, unsubscribeUrl: unsubscribeUrlFor(user._id) });
  if (dryRun) return { sent: false, reason: 'dry_run', subject: COPY.subject };

  const transporter = createCampaignTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_unavailable' };

  try {
    const info = await transporter.sendMail({
      from: { ...campaignSender(), name: 'Jakub at LaChart' },
      replyTo: REPLY_TO,
      to: user.email,
      subject: COPY.subject,
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
      await User.updateOne({ _id: user._id }, { $set: { [`retentionEmails.${SENT_KEY}`]: new Date() } });
    }
    console.log(`[cancelFeedback] sent to ${user.email}`);
    return { sent: true, subject: COPY.subject };
  } catch (e) {
    if (e?.skipped || e?.permanent) return { sent: false, reason: e.reason || 'unreachable' };
    console.error(`[cancelFeedback] failed for ${user.email}:`, e?.message || e);
    return { sent: false, reason: 'send_failed', message: e?.message };
  }
}

async function findReadyCandidates(limit = 50) {
  const ids = await churnedUserIds();
  if (!ids.length) return [];
  const pool = await User.find({
    _id: { $in: ids },
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
    [`retentionEmails.${SENT_KEY}`]: { $in: [null, undefined], $exists: false },
  })
    .select('_id email name surname isActive notifications retentionEmails createdAt')
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
  return pool.map((user) => ({ user }));
}

async function getCampaignStats() {
  const ids = await churnedUserIds();
  const optedIn = {
    _id: { $in: ids },
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
  };
  const [churned, sent, ready] = await Promise.all([
    User.countDocuments({ _id: { $in: ids } }),
    User.countDocuments({ ...optedIn, [`retentionEmails.${SENT_KEY}`]: { $ne: null, $exists: true } }),
    findReadyCandidates(1000),
  ]);
  return { churnedAccounts: churned, subscriptionsEnded: ids.length, alreadySent: sent, readyNow: ready.length };
}

function renderPreview(user = {}) {
  return renderHtml({
    firstName: user.name || null,
    unsubscribeUrl: unsubscribeUrlFor(user._id || 'preview'),
  });
}

module.exports = {
  sendCancelFeedback,
  findReadyCandidates,
  getCampaignStats,
  renderPreview,
  isEligible,
  unsubscribeUrlFor,
  COPY,
  SENT_KEY,
  UTM_CAMPAIGN,
  PROMO_CODE,
};
