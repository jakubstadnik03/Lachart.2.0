/**
 * Automated win-back campaign — one email per eligible user, drained gradually
 * by winBackScheduler.js (Zoho-safe daily cap). English-only. Respects the
 * marketing opt-out + one-click unsubscribe like the app-reengagement drip.
 *
 * Two segments:
 *   • test-runner — ran ≥1 lactate test but is NOT premium → Pro upsell
 *     (full history, unlimited tests, Form/Fitness).
 *   • inactive    — no test, no planned workout, no integration → activation
 *     nudge ("run your first test").
 *
 * State: retentionEmails.winBackSent (Date). One send per user, ever.
 */

const crypto = require('crypto');
const User = require('../models/UserModel');
const Test = require('../models/test');
const PlannedWorkout = require('../models/PlannedWorkout');
const { createEmailTransporter } = require('../utils/createEmailTransporter');
const { getClientUrl } = require('../utils/emailTemplate');
const { resolvePremiumForUserDocument } = require('../utils/premiumAccess');

const UTM_CAMPAIGN = '2026-07-winback';
const SENT_KEY = 'winBackSent';
const MS_DAY = 24 * 60 * 60 * 1000;
// Don't win-back brand-new signups still in onboarding.
const MIN_ACCOUNT_AGE_DAYS = 3;

const BRAND = {
  primary: '#767EB5', primaryDark: '#5E6590', primaryTint: '#E9ECF6',
  accent: '#FF6B4A', ink: '#0A0E1A', text: '#1D2C4C', muted: '#6B7280',
  bg: '#F3F4F6', surface: '#FFFFFF', border: '#E5E7EB',
};

const SEGMENTS = {
  'test-runner': {
    subject: 'Unlock your full training picture — LaChart Pro',
    pill: 'LaChart Pro',
    heroTitle: 'You ran a lactate test. See the whole story.',
    heroBody:
      'Your test gave you thresholds and zones. Pro turns those into a complete training system — your full history, unlimited tests, and daily Form / Fitness / Fatigue.',
    cta: 'Start your 2-week free trial',
    ctaPath: '/settings?tab=subscription',
    secondaryCta: 'See your dashboard',
    secondaryPath: '/dashboard',
    features: [
      { icon: '📈', title: 'Your full training history', body: 'Free shows the last 30 days. Pro unlocks every session and the load charts that need them.' },
      { icon: '🧪', title: 'Unlimited lactate tests', body: 'Track your curve and thresholds over a whole season, not just one snapshot.' },
      { icon: '📉', title: 'Form / Fitness / Fatigue', body: 'CTL, ATL and TSB from your real zones — know exactly when to push and when to recover.' },
      { icon: '🗓️', title: 'Workout planner', body: 'Plan your week and compare planned vs completed load, TrainingPeaks-style.' },
    ],
    footerNote: '60 days free, then €9.99/month. Cancel anytime in Settings.',
  },
  inactive: {
    subject: 'Your lactate curve is one test away',
    pill: 'Welcome back',
    heroTitle: 'Turn your training data into thresholds',
    heroBody:
      'You signed up but haven\'t run a test yet. In a couple of minutes LaChart draws your lactate curve and eight thresholds — no spreadsheets, no formulas.',
    cta: 'Run your first test',
    ctaPath: '/testing',
    secondaryCta: 'Connect Strava or Garmin',
    secondaryPath: '/settings?tab=integrations',
    features: [
      { icon: '🧪', title: 'Lactate curve in one click', body: 'Paste your step-test values — we draw the curve and surface LT1, LT2, OBLA, D-max and more.' },
      { icon: '🔗', title: 'Auto-import your activities', body: 'Connect Strava, Garmin or Apple Health and your calendar fills itself.' },
      { icon: '🎯', title: 'Training zones from your data', body: 'Power/pace/HR zones built from your own thresholds — not generic percentages.' },
      { icon: '📱', title: 'Free on web & iPhone', body: 'Everything above is free to start. Sign in and pick up where you left off.' },
    ],
    footerNote: 'Free to use. Open LaChart and run your first test whenever you\'re ready.',
  },
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
  const base = (process.env.SERVER_PUBLIC_URL || 'https://lachart.onrender.com').replace(/\/+$/, '');
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeTokenFor(userId)}`;
}

function daysSince(date) { return date ? (Date.now() - new Date(date).getTime()) / MS_DAY : Infinity; }

function isEligibleBase(user) {
  if (!user?.email) return false;
  if (user.isActive === false) return false;
  if (user.notifications?.emailNotifications === false) return false;
  if (user.notifications?.marketingEmails === false) return false;
  if (user.retentionEmails?.[SENT_KEY]) return false; // one win-back ever
  if (daysSince(user.createdAt) < MIN_ACCOUNT_AGE_DAYS) return false;
  return true;
}

function hasIntegration(user) {
  return !!(user?.strava?.athleteId || user?.garmin?.accessToken || user?.appleHealth?.connectedAt);
}

/**
 * Classify a user into a win-back segment, or null if not a target.
 * Async — needs the test count and premium resolution.
 */
async function segmentFor(user) {
  if (!isEligibleBase(user)) return null;

  // Nobody who is paying belongs in a win-back campaign, whatever their usage.
  // This used to be checked only inside the test-runner branch, so a paying
  // user with no test and no integration fell through to 'inactive' and would
  // have been told their "lactate curve is one test away" as if they were a
  // lapsed free account. Caught in a pre-send audit: 1 leak per 60 candidates.
  const { isPremium } = await resolvePremiumForUserDocument(user).catch(() => ({ isPremium: false }));
  if (isPremium) return null;

  const testCount = await Test.countDocuments({ athleteId: String(user._id) });
  if (testCount >= 1) return 'test-runner';

  // No test — is the account genuinely dormant?
  if (hasIntegration(user)) return null;
  const plannedCount = await PlannedWorkout.countDocuments({ athleteId: String(user._id) }).catch(() => 0);
  if (plannedCount > 0) return null;
  return 'inactive';
}

function renderHtml(segment, { firstName, unsubscribeUrl }) {
  const t = SEGMENTS[segment];
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

async function sendWinBack(user, segment, { dryRun = false, track = true, preview = false } = {}) {
  if (!preview) {
    const seg = segment || await segmentFor(user);
    if (!seg) return { sent: false, reason: 'not_eligible' };
    segment = seg;
  }
  const subject = SEGMENTS[segment].subject;
  const html = renderHtml(segment, { firstName: user.name || null, unsubscribeUrl: unsubscribeUrlFor(user._id) });

  if (dryRun) return { sent: false, reason: 'dry_run', segment, subject };

  const transporter = createEmailTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_unavailable' };

  try {
    const info = await transporter.sendMail({
      from: { name: 'LaChart', address: process.env.EMAIL_USER },
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
        { $set: { [`retentionEmails.${SENT_KEY}`]: new Date(), 'retentionEmails.winBackSegment': segment } },
      );
    }
    console.log(`[winBack] ${segment} sent to ${user.email}`);
    return { sent: true, segment, subject };
  } catch (e) {
    console.error(`[winBack] failed for ${user.email}:`, e?.message || e);
    return { sent: false, reason: 'send_failed', message: e?.message };
  }
}

async function findReadyCandidates(limit = 20) {
  // Pool of never-win-backed, opted-in users; classify each.
  const pool = await User.find({
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
    'retentionEmails.winBackSent': { $in: [null, undefined], $exists: false },
  })
    // subscriptionId is REQUIRED here: premium is linked through it, not by a
    // userId back-reference, so a projection without it makes
    // resolvePremiumForUserDocument report every paying user as free — and a
    // subscriber would receive a win-back email. Verified by audit before the
    // first send.
    .select('_id email name surname isActive notifications retentionEmails strava garmin appleHealth createdAt subscriptionId premium')
    .sort({ createdAt: 1 })
    .limit(Math.max(limit * 8, 300))
    .lean();

  const ready = [];
  for (const user of pool) {
    if (ready.length >= limit) break;
    const segment = await segmentFor(user);
    if (segment) ready.push({ user, segment });
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
    User.countDocuments({ ...optedIn, 'retentionEmails.winBackSent': { $ne: null, $exists: true } }),
    findReadyCandidates(1000),
  ]);
  const bySegment = { 'test-runner': 0, inactive: 0 };
  for (const r of ready) bySegment[r.segment] += 1;
  return { alreadySent: sent, readyNow: ready.length, readyBySegment: bySegment };
}

/** Rendered HTML for an admin browser preview (no send, no tracking). */
function renderPreview(segment, user = {}) {
  const seg = SEGMENTS[segment] ? segment : 'test-runner';
  return renderHtml(seg, { firstName: user.name || null, unsubscribeUrl: unsubscribeUrlFor(user._id || 'preview') });
}

module.exports = { sendWinBack, segmentFor, findReadyCandidates, getCampaignStats, renderPreview, SEGMENTS, unsubscribeUrlFor };
