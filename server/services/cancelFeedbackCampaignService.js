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
 * Two segments, because the same sentence cannot be put to both:
 *   • churned        — reached a subscription and stopped it. The question
 *                      leads, the offer is underneath.
 *   • never-started  — registered and never began even a trial. Telling them
 *                      "your subscription has ended" would be a lie in the
 *                      first line, so the offer leads and the question is the
 *                      postscript. There are twenty times as many of them and
 *                      nearly all have had a win-back mail already, so they
 *                      drain through a scheduler rather than going out at once.
 *
 * State: retentionEmails.cancelFeedbackSent (Date) + cancelFeedbackSegment.
 * One send per user, ever.
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
const SEGMENT_KEY = 'cancelFeedbackSegment';
/** Don't put a second offer in front of someone who just had one. */
const RECENT_CAMPAIGN_GAP_DAYS = Number(process.env.CANCEL_FEEDBACK_RECENT_GAP_DAYS || 14);
const MS_DAY = 24 * 60 * 60 * 1000;

/** Replies have to reach a human, or the question is decoration. */
const REPLY_TO = process.env.CANCEL_FEEDBACK_REPLY_TO || process.env.EMAIL_USER;

const BRAND = {
  primary: '#767EB5', primaryDark: '#5E6590', primaryTint: '#E9ECF6',
  accent: '#FF6B4A', ink: '#0A0E1A', text: '#1D2C4C', muted: '#6B7280',
  bg: '#F3F4F6', surface: '#FFFFFF', border: '#E5E7EB',
};

const CTA_PATH = '/settings?tab=subscription';

const SEGMENTS = {
  churned: {
    subject: 'What was missing?',
    cta: 'Use the code',
    lead: [
      'You started a LaChart subscription a while back and it has since ended. '
      + 'I am not writing to talk you back into it — I would just like to know what was missing.',
      'Was it a feature that was not there? Something that did not work? Too expensive, '
      + 'or simply not the right time? <strong>Hit reply and tell me in one sentence.</strong> '
      + 'It goes straight to me, and I read every one.',
      'And in case two weeks was never going to be long enough to see a training block through: '
      + 'here are two months on me, no charge. A lactate curve only means something once you have '
      + 'trained against it for a while.',
    ],
    offerLabel: 'Two months free with the code',
    offerNote: 'Enter it at checkout. Cancel any time — if it is still not for you, that is an answer too.',
    tail: 'Either way, thanks for giving it a go.',
  },
  'never-started': {
    subject: 'Two months of LaChart, on me',
    cta: 'Use the code',
    lead: [
      'You have an account with LaChart but have never run it as a paid plan — not even the trial. '
      + 'So rather than sell you anything: here are two months, no charge.',
      'Two weeks is not really enough to judge this. A lactate curve only tells you something once '
      + 'you have trained against it for a few weeks and watched it move — which is why the offer is '
      + 'two months and not another fortnight.',
      'And if you have already decided it is not for you, that is useful too. '
      + '<strong>Hit reply and tell me what is missing</strong> — one sentence is plenty, and it comes '
      + 'straight to me.',
    ],
    offerLabel: 'Two months free with the code',
    offerNote: 'Enter it at checkout. Cancel any time, and nothing is charged before then.',
    tail: 'Either way, thanks for signing up in the first place.',
  },
};

const COPY = SEGMENTS.churned;

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

/**
 * Everyone the subscription collection knows about, split two ways.
 *
 * `churned` reached a subscription and stopped it. `anySub` is everyone with a
 * subscription row at all, and it is the one the second segment has to be
 * measured against — "not churned" is NOT the same as "never started", and
 * reading it that way put a hundred paying subscribers in a queue for a mail
 * telling them they had never paid, with a 100%-off code attached.
 */
async function subscriptionAudience() {
  const rows = await Subscription.find({}, { userId: 1, status: 1, cancelAtPeriodEnd: 1 }).lean();
  const churned = new Set();
  const anySub = new Set();
  for (const r of rows) {
    const id = String(r.userId || '');
    if (!id) continue;
    anySub.add(id);
    if (r.status === 'canceled' || r.cancelAtPeriodEnd) churned.add(id);
  }
  return { churned: [...churned], anySub: [...anySub] };
}

async function churnedUserIds() {
  return (await subscriptionAudience()).churned;
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
function renderHtml({ firstName, unsubscribeUrl, segment = 'churned' }) {
  const t = SEGMENTS[segment] || SEGMENTS.churned;
  const clientUrl = getClientUrl();
  const ctaUrl = appendUtm(`${clientUrl}${CTA_PATH}`);
  const greet = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi,';
  // The paragraphs carry their own <strong>; everything interpolated into them
  // is static copy from this file, never anything a user supplied.
  const body = t.lead.map((para) => `<p style="margin:0 0 18px;">${para}</p>`).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(t.subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.text};-webkit-font-smoothing:antialiased;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px 56px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:16px;">
      <tr><td style="padding:32px 30px 28px;font-size:16px;line-height:1.65;">
        <p style="margin:0 0 18px;">${greet}</p>

        ${body}

        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;background:${BRAND.primaryTint};border-radius:12px;margin:2px 0 20px;">
          <tr><td style="padding:18px 20px;text-align:center;">
            <div style="font-size:13px;color:${BRAND.muted};margin-bottom:6px;">${escapeHtml(t.offerLabel)}</div>
            <div style="font-size:24px;font-weight:800;letter-spacing:0.04em;color:${BRAND.ink};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(PROMO_CODE)}</div>
            <div style="font-size:12px;color:${BRAND.muted};margin-top:8px;">${escapeHtml(t.offerNote)}</div>
          </td></tr>
        </table>

        <p style="margin:0 0 24px;text-align:center;">
          <a href="${ctaUrl}" style="display:inline-block;background:${BRAND.accent};color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;font-size:15px;">${escapeHtml(t.cta)}</a>
        </p>

        <p style="margin:0;color:${BRAND.muted};">
          ${escapeHtml(t.tail)}<br/>
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

function daysSince(date) {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / MS_DAY;
}

/** The most recent thing any other campaign sent this user. */
function lastLifecycleSend(user) {
  const re = user?.retentionEmails || {};
  const dates = Object.entries(re)
    .filter(([k, v]) => k !== SENT_KEY && k !== SEGMENT_KEY && v)
    .map(([, v]) => (v instanceof Date || typeof v === 'string' ? new Date(v) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()));
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}

/** Which of the two mails this user should get, or null for neither. */
async function segmentFor(user, audience = null) {
  if (!isEligibleBase(user)) return null;
  const { churned, anySub } = audience || (await subscriptionAudience());
  const id = String(user._id);
  if (churned.includes(id)) return 'churned';
  // A live subscriber is neither. They are paying right now, and the second
  // mail opens by telling the reader they never have.
  if (anySub.includes(id)) return null;
  // Everyone else gets the softer one — but not on the heels of another
  // campaign. Nearly all of them have had a win-back mail offering a trial,
  // and a second offer a week later reads as pestering rather than generosity.
  if (daysSince(lastLifecycleSend(user)) < RECENT_CAMPAIGN_GAP_DAYS) return null;
  return 'never-started';
}

async function isEligible(user) {
  return (await segmentFor(user)) !== null;
}

async function sendCancelFeedback(user, { dryRun = false, track = true, preview = false, segment = null } = {}) {
  let seg = segment;
  if (!preview) {
    seg = seg || (await segmentFor(user));
    if (!seg) return { sent: false, reason: 'not_eligible' };
  }
  seg = seg || 'churned';
  const subject = (SEGMENTS[seg] || SEGMENTS.churned).subject;
  const html = renderHtml({ firstName: user.name || null, unsubscribeUrl: unsubscribeUrlFor(user._id), segment: seg });
  if (dryRun) return { sent: false, reason: 'dry_run', subject, segment: seg };

  const transporter = createCampaignTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_unavailable' };

  try {
    const info = await transporter.sendMail({
      from: { ...campaignSender(), name: 'Jakub at LaChart' },
      replyTo: REPLY_TO,
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
      await User.updateOne({ _id: user._id }, {
        $set: { [`retentionEmails.${SENT_KEY}`]: new Date(), [`retentionEmails.${SEGMENT_KEY}`]: seg },
      });
    }
    console.log(`[cancelFeedback] sent ${seg} to ${user.email}`);
    return { sent: true, subject, segment: seg };
  } catch (e) {
    if (e?.skipped || e?.permanent) return { sent: false, reason: e.reason || 'unreachable' };
    console.error(`[cancelFeedback] failed for ${user.email}:`, e?.message || e);
    return { sent: false, reason: 'send_failed', message: e?.message };
  }
}

async function findReadyCandidates(limit = 50, { segment = null } = {}) {
  const audience = await subscriptionAudience();
  const { churned: ids, anySub } = audience;
  const base = {
    email: { $exists: true, $nin: [null, ''] },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
    [`retentionEmails.${SENT_KEY}`]: { $in: [null, undefined], $exists: false },
  };

  const take = async (want, match) => {
    if (want <= 0) return [];
    const pool = await User.find({ ...base, ...match })
      .select('_id email name surname isActive notifications retentionEmails createdAt')
      .sort({ createdAt: 1 })
      .limit(Math.max(want * 4, 200))
      .lean();
    const out = [];
    for (const user of pool) {
      if (out.length >= want) break;
      const seg = await segmentFor(user, audience);
      if (!seg) continue;
      out.push({ user, segment: seg });
    }
    return out;
  };

  // The churned handful goes first and in full. There are two dozen of them,
  // they are the ones with something to say, and queued behind five hundred
  // others by signup date they would be asked in December about a July
  // cancellation. Only once they are exhausted does the long tail start.
  if (segment === 'churned') return take(limit, { _id: { $in: ids } });
  // The long tail is "no subscription row at all", not "not churned".
  if (segment === 'never-started') return take(limit, { _id: { $nin: anySub } });

  const churned = await take(limit, { _id: { $in: ids } });
  const rest = await take(limit - churned.length, { _id: { $nin: anySub } });
  return [...churned, ...rest];
}

async function getCampaignStats() {
  const { churned: ids } = await subscriptionAudience();
  const optedIn = {
    email: { $exists: true, $nin: [null, ''] },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
  };
  const [sent, churnedReady, neverReady] = await Promise.all([
    User.countDocuments({ ...optedIn, [`retentionEmails.${SENT_KEY}`]: { $ne: null, $exists: true } }),
    findReadyCandidates(1000, { segment: 'churned' }),
    findReadyCandidates(2000, { segment: 'never-started' }),
  ]);
  return {
    subscriptionsEnded: ids.length,
    alreadySent: sent,
    readyNow: { churned: churnedReady.length, 'never-started': neverReady.length },
    recentCampaignGapDays: RECENT_CAMPAIGN_GAP_DAYS,
  };
}

function renderPreview(user = {}, segment = 'churned') {
  return renderHtml({
    firstName: user.name || null,
    unsubscribeUrl: unsubscribeUrlFor(user._id || 'preview'),
    segment,
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
  SEGMENTS,
  segmentFor,
  SENT_KEY,
  SEGMENT_KEY,
  UTM_CAMPAIGN,
  PROMO_CODE,
};
