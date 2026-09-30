/**
 * One-shot campaign: you have a lactate test, but no Strava / Garmin / Apple
 * Health — so the zones sit unused. Same shape as winBack (HTML, List-
 * Unsubscribe, Zoho-safe drain via trackerConnectScheduler).
 *
 * Audience (~250 free reachable accounts on 2026-09-30): ≥1 saved test, no
 * tracker linked, marketing opted-in. Not a Pro upsell — paywall is not the
 * bottleneck; missing activity data is.
 *
 * State: retentionEmails.trackerConnectSent (Date). One send per user, ever.
 */

'use strict';

const crypto = require('crypto');
const { emailLinkBase } = require('../utils/emailLinkBase');
const User = require('../models/UserModel');
const Test = require('../models/test');
const { createCampaignTransporter, campaignSender } = require('../utils/createEmailTransporter');
const { getClientUrl } = require('../utils/emailTemplate');

const UTM_CAMPAIGN = '2026-09-tracker-connect';
const SENT_KEY = 'trackerConnectSent';
const MS_DAY = 24 * 60 * 60 * 1000;
// Don't mail brand-new accounts still finishing onboarding.
const MIN_ACCOUNT_AGE_DAYS = 2;
// Skip anyone who got another lifecycle blast in the last N days — the base
// already has median ~9 sends; stacking this on top of win-back / app drip
// would be the weakest possible next mail.
const RECENT_CAMPAIGN_GAP_DAYS = Number(process.env.TRACKER_CONNECT_RECENT_GAP_DAYS || 14);

const BRAND = {
  primary: '#767EB5', primaryDark: '#5E6590', primaryTint: '#E9ECF6',
  accent: '#FF6B4A', ink: '#0A0E1A', text: '#1D2C4C', muted: '#6B7280',
  bg: '#F3F4F6', surface: '#FFFFFF', border: '#E5E7EB',
};

const COPY = {
  subject: 'Your zones are ready — connect Strava, Garmin or Apple Health',
  pill: 'Next step',
  heroTitle: 'Your lactate zones are ready',
  heroBody:
    'You already ran a test. Without a tracker, those zones never meet a real run or ride — so Form, TSS and zone time stay empty. Connect Strava, Garmin or Apple Health.',
  cta: 'Connect a tracker',
  ctaPath: '/settings?tab=integrations',
  secondaryCta: 'Open your latest test',
  secondaryPath: '/testing',
  features: [
    {
      icon: '🔗',
      title: 'Strava or Garmin',
      body: 'Link once — rides, runs and swims land in your calendar with no uploads. Garmin also sends planned workouts to your watch.',
    },
    {
      icon: '❤️',
      title: 'Apple Health (iPhone)',
      body: 'Sleep, resting HR and HRV for recovery — next to the workouts from Strava or Garmin.',
    },
    {
      icon: '🎯',
      title: 'Zones on real workouts',
      body: 'See time in LT1/LT2 zones from your own thresholds, not generic percentages.',
    },
    {
      icon: '📈',
      title: 'Form / Fitness starts counting',
      body: 'TSS from your zones fills Form / Fitness / Fatigue from day one.',
    },
  ],
  footerNote: 'Optional. Disconnect anytime in Settings → Integrations.',
};

/* ─── helpers ─────────────────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function utmQs() { return `utm_source=email&utm_medium=lifecycle&utm_campaign=${encodeURIComponent(UTM_CAMPAIGN)}`; }
function appendUtm(url) { if (!url) return url; const sep = url.includes('?') ? '&' : '?'; return `${url}${sep}${utmQs()}`; }

function unsubscribeTokenFor(userId) {
  const secret = process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'lachart-unsub';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 24);
}
function unsubscribeUrlFor(userId) {
  const base = emailLinkBase();
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeTokenFor(userId)}`;
}

function daysSince(date) {
  return date ? (Date.now() - new Date(date).getTime()) / MS_DAY : Infinity;
}

function hasTracker(user) {
  return !!(user?.strava?.athleteId || user?.garmin?.accessToken || user?.appleHealth?.connectedAt);
}

/** Latest date among one-shot / drip campaign stamps — used as a fatigue gate. */
function lastLifecycleSend(user) {
  const re = user?.retentionEmails || {};
  const dates = [
    re.trackerConnectSent,
    re.winBackSent,
    re.predictedCurveSent,
    re.savedCurveSent,
    re.whatsNewMay2026Sent,
    re.iosLaunchJun2026Sent,
    re.paidLaunchJul2026Sent,
    re.appReengagementStep1Sent,
    re.appReengagementStep2Sent,
    re.appReengagementStep3Sent,
    re.reengagementLastSent,
    // App-download one-off lives outside retentionEmails on some accounts.
    user?.appDownloadEmail?.lastSent,
  ].filter(Boolean);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((d) => new Date(d).getTime())));
}

function isEligibleBase(user) {
  if (!user?.email) return false;
  if (user.isActive === false) return false;
  if (user.notifications?.emailNotifications === false) return false;
  if (user.notifications?.marketingEmails === false) return false;
  if (user.retentionEmails?.[SENT_KEY]) return false;
  if (daysSince(user.createdAt) < MIN_ACCOUNT_AGE_DAYS) return false;
  if (hasTracker(user)) return false;
  const last = lastLifecycleSend(user);
  if (last && daysSince(last) < RECENT_CAMPAIGN_GAP_DAYS) return false;
  return true;
}

function renderHtml({ firstName, unsubscribeUrl }) {
  const t = COPY;
  const clientUrl = getClientUrl();
  const ctaUrl = appendUtm(`${clientUrl}${t.ctaPath}`);
  const secondaryUrl = appendUtm(`${clientUrl}${t.secondaryPath}`);
  const greet = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi there,';
  const featureRows = t.features.map((f) => `
    <tr>
      <td valign="top" style="width:32px;padding:10px 0;font-size:20px;line-height:1;">${f.icon}</td>
      <td valign="top" style="padding:10px 0;font-size:14px;line-height:1.55;color:${BRAND.text};">
        <strong style="color:${BRAND.ink};font-size:15px;">${escapeHtml(f.title)}</strong><br/>
        <span style="color:${BRAND.muted};">${escapeHtml(f.body)}</span>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(t.subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.text};-webkit-font-smoothing:antialiased;">
  <div style="max-width:580px;margin:0 auto;padding:28px 16px 56px;">
    <div style="text-align:center;margin-bottom:20px;">
      <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${BRAND.primary};color:#fff;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(t.pill)}</span>
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(10,14,26,0.06);">
      <tr><td style="padding:0;background:linear-gradient(135deg,${BRAND.primaryTint} 0%,#fff 55%);">
        <div style="padding:36px 32px 24px;">
          <h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;color:${BRAND.ink};">${escapeHtml(t.heroTitle)}</h1>
          <p style="margin:0;font-size:16px;line-height:1.6;color:${BRAND.muted};">${greet}<br/>${escapeHtml(t.heroBody)}</p>
        </div>
      </td></tr>
      <tr><td style="padding:8px 32px 28px;text-align:center;">
        <a href="${ctaUrl}" style="display:inline-block;background:${BRAND.accent};color:#fff;text-decoration:none;padding:15px 28px;border-radius:12px;font-weight:700;font-size:16px;box-shadow:0 2px 8px rgba(255,107,74,0.35);">${escapeHtml(t.cta)}</a>
        <br/>
        <a href="${secondaryUrl}" style="display:inline-block;margin-top:14px;color:${BRAND.primaryDark};font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(t.secondaryCta)} →</a>
      </td></tr>
      <tr><td style="padding:8px 32px 36px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${featureRows}</table>
      </td></tr>
    </table>
    <p style="text-align:center;margin-top:22px;font-size:12px;color:#9CA3AF;line-height:1.65;">
      ${escapeHtml(t.footerNote)}<br/>
      <a href="${unsubscribeUrl}" style="color:#9CA3AF;text-decoration:underline;">Unsubscribe from product emails</a>
      &nbsp;·&nbsp;
      <a href="${appendUtm(getClientUrl() + '/settings?tab=notifications')}" style="color:#9CA3AF;text-decoration:underline;">Notification settings</a>
    </p>
  </div>
</body></html>`;
}

async function isEligible(user) {
  if (!isEligibleBase(user)) return false;
  const testCount = await Test.countDocuments({ athleteId: String(user._id) });
  return testCount >= 1;
}

async function sendTrackerConnect(user, { dryRun = false, track = true, preview = false } = {}) {
  if (!preview) {
    const ok = await isEligible(user);
    if (!ok) return { sent: false, reason: 'not_eligible' };
  }
  const subject = COPY.subject;
  const html = renderHtml({ firstName: user.name || null, unsubscribeUrl: unsubscribeUrlFor(user._id) });

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
      await User.updateOne(
        { _id: user._id },
        { $set: { [`retentionEmails.${SENT_KEY}`]: new Date() } },
      );
    }
    console.log(`[trackerConnect] sent to ${user.email}`);
    return { sent: true, subject };
  } catch (e) {
    if (e?.skipped || e?.permanent) {
      return { sent: false, reason: e.reason || 'unreachable' };
    }
    console.error(`[trackerConnect] failed for ${user.email}:`, e?.message || e);
    return { sent: false, reason: 'send_failed', message: e?.message };
  }
}

async function findReadyCandidates(limit = 20) {
  const pool = await User.find({
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
    'retentionEmails.trackerConnectSent': { $in: [null, undefined], $exists: false },
    $and: [
      { $or: [{ 'strava.athleteId': { $exists: false } }, { 'strava.athleteId': null }] },
      { $or: [{ 'garmin.accessToken': { $exists: false } }, { 'garmin.accessToken': null }] },
      { $or: [{ 'appleHealth.connectedAt': { $exists: false } }, { 'appleHealth.connectedAt': null }] },
    ],
  })
    .select('_id email name surname isActive notifications retentionEmails strava garmin appleHealth createdAt appDownloadEmail')
    .sort({ createdAt: 1 })
    .limit(Math.max(limit * 10, 400))
    .lean();

  const ready = [];
  for (const user of pool) {
    if (ready.length >= limit) break;
    if (!(await isEligible(user))) continue;
    ready.push({ user });
  }
  return ready;
}

async function getCampaignStats() {
  const optedIn = {
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
  };
  const [sent, ready] = await Promise.all([
    User.countDocuments({ ...optedIn, 'retentionEmails.trackerConnectSent': { $ne: null, $exists: true } }),
    findReadyCandidates(1000),
  ]);
  return { alreadySent: sent, readyNow: ready.length };
}

function renderPreview(user = {}) {
  return renderHtml({
    firstName: user.name || null,
    unsubscribeUrl: unsubscribeUrlFor(user._id || 'preview'),
  });
}

module.exports = {
  sendTrackerConnect,
  findReadyCandidates,
  getCampaignStats,
  renderPreview,
  isEligible,
  unsubscribeUrlFor,
  COPY,
  SENT_KEY,
  UTM_CAMPAIGN,
};
