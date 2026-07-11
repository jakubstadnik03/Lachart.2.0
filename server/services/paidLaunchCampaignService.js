/**
 * "LaChart is moving to paid plans" — July 2026 announcement.
 *
 * English-only lifecycle email for existing users. Same paced-send pattern
 * as iosLaunchCampaignService (small batches + sleeps). State lives on
 * user.retentionEmails.paidLaunchJul2026Sent.
 */

const crypto = require('crypto');
const { createEmailTransporter } = require('../utils/createEmailTransporter');
const User = require('../models/UserModel');

const CAMPAIGN_KEY = 'paidLaunchJul2026Sent';
const CLIENT_URL = (process.env.CLIENT_URL || 'https://lachart.net').replace(/\/+$/, '');
const SUBSCRIPTION_URL = `${CLIENT_URL}/settings?tab=subscription`;
const UTM_CAMPAIGN = '2026-07-paid-launch';
const REPLY_TO = 'jakub.stadnik@lachart.net';

const ATHLETE_PRICE = '€6.99';
const COACH_PRICE = '€14.99';
/** Stripe promotion code for users who registered before paid plans launched. */
const EXISTING_USER_COUPON = '3MONTHSOFF';

const SUBJECT = {
  en: 'LaChart is moving to paid plans — here\u2019s what\u2019s included',
};

/* ────────────────────── HTML template ─────────────────────────────────── */

function renderHtml({ firstName, unsubscribeUrl }) {
  const t = COPY.en;
  const greet = firstName ? `${t.greetingHi} ${escapeHtml(firstName)},` : t.greetingHey;
  const ctaHref = appendUtm(SUBSCRIPTION_URL);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(t.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ECEDF1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Hind Vadodara,Roboto,sans-serif;color:#1D2C4C;-webkit-font-smoothing:antialiased;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px 48px;">
    <div style="text-align:center;margin-bottom:18px;">
      <div style="display:inline-block;padding:5px 12px;border-radius:999px;background:#5E6590;color:#fff;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">
        ${t.pill}
      </div>
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff;border:1px solid #E5E7EB;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(10,14,26,0.06);">
      <tr>
        <td style="padding:32px 28px 8px;">
          <h1 style="margin:0 0 10px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;color:#0A0E1A;">
            ${t.heroTitle}
          </h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:#4B5563;">
            ${greet}<br/><br/>
            ${t.heroBody}
          </p>
        </td>
      </tr>

      <!-- Pricing -->
      <tr>
        <td style="padding:20px 28px 8px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td width="50%" style="padding-right:6px;vertical-align:top;">
                <div style="background:#F8F9FC;border:1px solid #E5E7EB;border-radius:12px;padding:16px;text-align:center;">
                  <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#5E6590;">Athlete</div>
                  <div style="font-size:24px;font-weight:800;color:#0A0E1A;margin:6px 0 2px;">${ATHLETE_PRICE}</div>
                  <div style="font-size:12px;color:#6B7280;">per month</div>
                </div>
              </td>
              <td width="50%" style="padding-left:6px;vertical-align:top;">
                <div style="background:#F0F1F8;border:1px solid #D8DBEA;border-radius:12px;padding:16px;text-align:center;">
                  <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#5E6590;">Coach</div>
                  <div style="font-size:24px;font-weight:800;color:#0A0E1A;margin:6px 0 2px;">${COACH_PRICE}</div>
                  <div style="font-size:12px;color:#6B7280;">per month</div>
                </div>
              </td>
            </tr>
          </table>
          <p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#6B7280;text-align:center;">
            ${t.trialNote}
          </p>
        </td>
      </tr>

      <!-- Existing-user coupon -->
      <tr>
        <td style="padding:8px 28px 16px;">
          <div style="background:#F0F4FF;border:2px dashed #5E6590;border-radius:14px;padding:20px 18px;text-align:center;">
            <div style="font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#5E6590;margin-bottom:6px;">
              ${t.couponLabel}
            </div>
            <div style="font-size:30px;font-weight:800;letter-spacing:0.08em;color:#0A0E1A;font-family:ui-monospace,monospace;">
              ${EXISTING_USER_COUPON}
            </div>
            <p style="margin:10px 0 0;font-size:13px;line-height:1.55;color:#4B5563;">
              ${t.couponBody}
            </p>
            <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#6B7280;">
              ${t.couponHowTo}
            </p>
          </div>
        </td>
      </tr>

      <tr>
        <td style="padding:8px 28px 8px;text-align:center;">
          <a href="${ctaHref}" style="display:inline-block;background:#5E6590;color:#fff;text-decoration:none;padding:14px 26px;border-radius:12px;font-weight:700;font-size:15.5px;letter-spacing:-0.005em;">
            ${t.ctaPrimary}
          </a>
        </td>
      </tr>

      <!-- Athlete features -->
      <tr>
        <td style="padding:24px 28px 8px;">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#5E6590;margin-bottom:10px;">
            ${t.athleteSectionTitle}
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${t.athleteFeatures.map((f) => featureRow(f)).join('')}
          </table>
        </td>
      </tr>

      <!-- Coach features -->
      <tr>
        <td style="padding:8px 28px 24px;">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#5E6590;margin-bottom:10px;">
            ${t.coachSectionTitle}
          </div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${t.coachFeatures.map((f) => featureRow(f)).join('')}
          </table>
        </td>
      </tr>

      <!-- Personal sign-off -->
      <tr>
        <td style="padding:8px 28px 32px;border-top:1px solid #F3F4F6;">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4B5563;">
            ${t.questionsBody}
          </p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#1D2C4C;">
            ${t.signoff}<br/>
            <strong style="color:#0A0E1A;">${t.signoffName}</strong><br/>
            <span style="color:#6B7280;">${t.signoffRole}</span>
          </p>
        </td>
      </tr>
    </table>

    <div style="text-align:center;margin-top:22px;font-size:12px;color:#9CA3AF;line-height:1.6;">
      ${t.footerNote}<br/>
      <a href="${unsubscribeUrl}" style="color:#9CA3AF;text-decoration:underline;">${t.unsubscribe}</a>
      &nbsp;&middot;&nbsp;
      <a href="${appendUtm(`${CLIENT_URL}/about`)}" style="color:#9CA3AF;text-decoration:underline;">lachart.net</a>
    </div>
  </div>
</body>
</html>`;
}

function featureRow(f) {
  return `
    <tr>
      <td valign="top" style="width:28px;padding:8px 0;font-size:18px;line-height:1;">${f.icon}</td>
      <td valign="top" style="padding:8px 0;font-size:14px;line-height:1.5;color:#1D2C4C;">
        <strong style="color:#0A0E1A;">${f.title}</strong><br/>
        <span style="color:#6B7280;">${f.body}</span>
      </td>
    </tr>`;
}

const COPY = {
  en: {
    subject: SUBJECT.en,
    pill: 'Important update',
    greetingHi: 'Hi',
    greetingHey: 'Hi there,',
    heroTitle: 'LaChart is moving to paid plans',
    heroBody:
      "I've been building LaChart to help athletes and coaches get more from lactate testing and training data. To keep improving the platform sustainably, I'm introducing paid plans.<br/><br/>" +
      "Because you already have a LaChart account, you get an exclusive thank-you: <strong>3 months free</strong> on Athlete or Coach when you subscribe — see the code below.",
    trialNote: 'Works on Athlete or Coach · cancel anytime before billing starts',
    couponLabel: 'Your exclusive code — early users only',
    couponBody: '<strong>3 months free</strong> on Athlete or Coach. This code is only for people who registered before paid plans went live.',
    couponHowTo: 'Go to Settings → Subscription, pick a plan, and enter <strong>3MONTHSOFF</strong> on the Stripe checkout page.',
    ctaPrimary: 'See plans & redeem your code',
    athleteSectionTitle: 'Athlete plan',
    athleteFeatures: [
      {
        icon: '🧪',
        title: 'Create your own lactate tests',
        body: 'Design step tests, log samples, and get LT1/LT2 thresholds with zone charts.',
      },
      {
        icon: '📅',
        title: 'Plan workouts in your calendar',
        body: 'Schedule sessions, set targets, and keep your week organised in one place.',
      },
      {
        icon: '📈',
        title: 'Analyze your training',
        body: 'Review pace, heart rate, power and lactate overlays on completed sessions.',
      },
      {
        icon: '⏱️',
        title: 'Add and edit laps',
        body: 'Log interval splits manually or refine laps imported from Strava.',
      },
    ],
    coachSectionTitle: 'Coach plan — everything in Athlete, plus',
    coachFeatures: [
      {
        icon: '👥',
        title: 'Manage your athletes',
        body: 'Onboard athletes, keep their profiles in one roster, and work from a single dashboard.',
      },
      {
        icon: '🔬',
        title: 'Run lactate tests for athletes',
        body: 'Create and conduct lactate step tests on behalf of the athletes you coach.',
      },
      {
        icon: '📄',
        title: 'Branded PDF reports',
        body: 'Customise report templates with your logo, contact details and coaching information.',
      },
      {
        icon: '🗓️',
        title: 'Plan workouts into athletes\u2019 calendars',
        body: 'Schedule training directly into each athlete\u2019s calendar from your coach view.',
      },
      {
        icon: '📊',
        title: 'Analyze athlete training',
        body: 'Review session history, trends and lactate data across your entire squad.',
      },
    ],
    questionsBody:
      'Have questions about which plan fits you, or how the <strong>3MONTHSOFF</strong> code works? Just <strong>reply to this email</strong> — I read every message. Happy to help, and we can also book a short video call to walk through your setup.',
    signoff: 'Thanks for being part of LaChart,',
    signoffName: 'Jakub Stadnik',
    signoffRole: 'Founder, LaChart',
    footerNote: 'You received this because you have a LaChart account.',
    unsubscribe: 'Unsubscribe',
  },
};

/* ────────────────────── helpers ───────────────────────────────────────── */

function appendUtm(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${utmQs()}`;
}
function utmQs() {
  return `utm_source=email&utm_medium=lifecycle&utm_campaign=${encodeURIComponent(UTM_CAMPAIGN)}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function unsubscribeTokenFor(userId) {
  const secret = process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'lachart-unsub';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 24);
}
function unsubscribeUrlFor(userId) {
  const base = (process.env.SERVER_PUBLIC_URL || 'https://lachart.onrender.com').replace(/\/+$/, '');
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeTokenFor(userId)}`;
}

/* ────────────────────── send + run ────────────────────────────────────── */

async function sendOne(user, { dryRun = false } = {}) {
  if (!user || !user.email) return { sent: false, reason: 'no_email' };
  if (user.isActive === false) return { sent: false, reason: 'inactive' };
  if (user.notifications?.emailNotifications === false) return { sent: false, reason: 'opted_out' };
  if (user.notifications?.marketingEmails === false) return { sent: false, reason: 'marketing_opted_out' };
  if (user.retentionEmails && user.retentionEmails[CAMPAIGN_KEY]) return { sent: false, reason: 'already_sent' };

  const html = renderHtml({
    firstName: user.name || null,
    unsubscribeUrl: unsubscribeUrlFor(user._id),
  });
  const subject = SUBJECT.en;

  if (dryRun) return { sent: false, reason: 'dry_run', lang: 'en', subject };

  const transporter = createEmailTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_unavailable' };

  try {
    const sendInfo = await transporter.sendMail({
      from: { name: 'Jakub from LaChart', address: process.env.EMAIL_USER },
      replyTo: REPLY_TO,
      to: user.email,
      subject,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrlFor(user._id)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    const accepted = Array.isArray(sendInfo?.accepted) ? sendInfo.accepted : [];
    const rejected = Array.isArray(sendInfo?.rejected) ? sendInfo.rejected : [];
    const wasAccepted = accepted.some((a) => String(a).toLowerCase() === user.email.toLowerCase());
    const wasRejected = rejected.some((r) => String(r).toLowerCase() === user.email.toLowerCase());
    if (!wasAccepted || wasRejected) {
      const reason = `relay did not accept recipient — accepted=[${accepted.join(',')}] rejected=[${rejected.join(',')}] response="${sendInfo?.response || ''}"`;
      console.error(`[paidLaunchCampaign] ${user.email}: ${reason}`);
      return { sent: false, reason, smtp: { accepted, rejected, response: sendInfo?.response, messageId: sendInfo?.messageId } };
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { [`retentionEmails.${CAMPAIGN_KEY}`]: new Date() } }
    );

    console.log(`[paidLaunchCampaign] sent to ${user.email}`, {
      messageId: sendInfo?.messageId, response: sendInfo?.response, accepted, rejected,
    });
    return { sent: true, lang: 'en', smtp: { accepted, rejected, response: sendInfo?.response, messageId: sendInfo?.messageId } };
  } catch (e) {
    const reason = (e && (e.message || e.reason || String(e))) || 'send_failed';
    console.error(`[paidLaunchCampaign] failed to send to ${user.email}:`, reason, e?.code || '');
    return { sent: false, reason, smtp: { code: e?.code, command: e?.command, response: e?.response } };
  }
}

async function findPendingUsers(limit) {
  return User.find({
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
    $or: [
      { [`retentionEmails.${CAMPAIGN_KEY}`]: { $exists: false } },
      { [`retentionEmails.${CAMPAIGN_KEY}`]: null },
    ],
  })
    .select('_id email name surname isActive notifications retentionEmails')
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
}

async function getPendingCount() {
  return User.countDocuments({
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
    $or: [
      { [`retentionEmails.${CAMPAIGN_KEY}`]: { $exists: false } },
      { [`retentionEmails.${CAMPAIGN_KEY}`]: null },
    ],
  });
}

async function runCampaign({
  batchSize = 1,
  batchIntervalMs = 5 * 60 * 1000,
  maxBatches = 1000,
  maxEmailsPerRun = 20,
  dryRun = false,
  onProgress,
} = {}) {
  const stats = { totalAttempted: 0, sent: 0, skipped: 0, failed: 0, byReason: {} };
  let batchIndex = 0;

  while (batchIndex < maxBatches) {
    if (maxEmailsPerRun != null && stats.sent >= maxEmailsPerRun) {
      console.log(`[paidLaunchCampaign] reached maxEmailsPerRun=${maxEmailsPerRun}, pausing`);
      break;
    }
    const slotsLeft = maxEmailsPerRun != null ? Math.max(0, maxEmailsPerRun - stats.sent) : batchSize;
    const fetchLimit = Math.min(batchSize, slotsLeft || batchSize);
    const users = await findPendingUsers(fetchLimit);
    if (users.length === 0) break;

    const results = await Promise.allSettled(users.map((u) => sendOne(u, { dryRun })));

    for (const r of results) {
      stats.totalAttempted += 1;
      const v = r.status === 'fulfilled' ? r.value : { sent: false, reason: 'thrown:' + (r.reason?.message || 'unknown') };
      if (v.sent) stats.sent += 1;
      else if (v.reason === 'send_failed' || String(v.reason).startsWith('thrown:')) stats.failed += 1;
      else stats.skipped += 1;
      stats.byReason[v.reason || 'sent'] = (stats.byReason[v.reason || 'sent'] || 0) + 1;
    }

    batchIndex += 1;
    if (typeof onProgress === 'function') {
      try { onProgress({ batchIndex, batchSize: users.length, stats }); } catch {}
    }
    console.log(`[paidLaunchCampaign] batch ${batchIndex}: attempted=${users.length} sent=${stats.sent} skipped=${stats.skipped} failed=${stats.failed}`);

    if (dryRun) break;
    await new Promise((resolve) => setTimeout(resolve, batchIntervalMs));
  }

  console.log('[paidLaunchCampaign] finished:', stats);
  return stats;
}

module.exports = {
  sendOne,
  runCampaign,
  findPendingUsers,
  getPendingCount,
  renderHtml,
  CAMPAIGN_KEY,
  SUBJECT,
  REPLY_TO,
  EXISTING_USER_COUPON,
};
