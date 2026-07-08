/**
 * Automated 3-step re-engagement drip for registered web-only users.
 *
 *   Step 1 — Download the iPhone app (App Store)
 *   Step 2 — Connect Strava (auto-import, TSS, calendar) — skipped if already linked
 *   Step 3 — Plan & track training (workout planner, Form / Fitness / Fatigue)
 *
 * English-only, modern HTML, Zoho-safe pacing via appReengagementScheduler.js.
 * One step per user at a time; 7-day gap between steps; respects marketing opt-out.
 */

const crypto = require('crypto');
const User = require('../models/UserModel');
const { createEmailTransporter } = require('../utils/createEmailTransporter');
const { getClientUrl } = require('../utils/emailTemplate');

const APP_STORE_URL = 'https://apps.apple.com/cz/app/lachart/id6764768876?l=cs';
const UTM_CAMPAIGN = '2026-07-app-reengagement';
const STEP_KEYS = {
  1: 'appReengagementStep1Sent',
  2: 'appReengagementStep2Sent',
  3: 'appReengagementStep3Sent',
};

const MS_DAY = 24 * 60 * 60 * 1000;

const BRAND = {
  primary: '#767EB5',
  primaryDark: '#5E6590',
  primaryTint: '#E9ECF6',
  accent: '#FF6B4A',
  ink: '#0A0E1A',
  text: '#1D2C4C',
  muted: '#6B7280',
  bg: '#F3F4F6',
  surface: '#FFFFFF',
  border: '#E5E7EB',
};

const STEPS = {
  1: {
    subject: 'Your training brain fits in your pocket — LaChart for iPhone',
    pill: 'Step 1 of 3 · iPhone app',
    heroTitle: 'Train smarter from your home screen',
    heroBody:
      'LaChart for iPhone is free on the App Store. Sign in with your existing account — your tests, zones and calendar are already there.',
    cta: 'Download on the App Store',
    ctaUrl: APP_STORE_URL,
    secondaryCta: 'Open web dashboard',
    features: [
      { icon: '📊', title: 'Form / Fitness / Fatigue widget', body: 'Today\'s load plus a 14-day Form sparkline — right next to your weather and calendar.' },
      { icon: '🏃', title: 'Today\'s training at a glance', body: 'Completed and planned sessions in one list, sorted by sport and training stress.' },
      { icon: '❤️', title: 'Apple Health sync', body: 'Heart rate, distance and duration flow in automatically after your workouts.' },
      { icon: '🔔', title: 'Push notifications', body: 'Strava imports, lactate reminders and race countdowns — without opening the browser.' },
    ],
    footerNote: 'Requires iOS 16+. Same LaChart account on web and iPhone. Android is on the roadmap.',
  },
  2: {
    subject: 'Connect Strava — your training calendar fills itself',
    pill: 'Step 2 of 3 · Strava sync',
    heroTitle: 'Stop copy-pasting workouts',
    heroBody:
      'Link Strava once and LaChart imports your rides, runs and swims — calculates TSS from your zones and builds your Form / Fitness chart automatically.',
    cta: 'Connect Strava in Settings',
    ctaUrl: null, // filled at render
    secondaryCta: 'Open training calendar',
    features: [
      { icon: '⚡', title: 'Automatic import', body: 'New Strava activities appear in your calendar within minutes — no manual upload.' },
      { icon: '📈', title: 'Training Stress (TSS)', body: 'Power, pace and heart-rate TSS from your saved LT1/LT2 zones — not generic estimates.' },
      { icon: '🔄', title: 'Up to 1 year of history', body: 'First connect pulls your recent season so Form / Fitness starts accurate on day one.' },
      { icon: '📅', title: 'One calendar for everything', body: 'Strava activities, planned workouts and lactate tests in a single TrainingPeaks-style view.' },
    ],
    footerNote: 'Strava connection is optional and can be removed anytime in Settings → Integrations.',
  },
  3: {
    subject: 'Plan your week like a pro — Form, Fitness & Fatigue included',
    pill: 'Step 3 of 3 · Workout planning',
    heroTitle: 'Your TrainingPeaks-style command centre',
    heroBody:
      'Plan sessions in the calendar, compare planned vs completed load, and watch Form / Fitness / Fatigue update every day — on web or iPhone.',
    cta: 'Open training calendar',
    ctaUrl: null,
    secondaryCta: 'Plan a workout',
    features: [
      { icon: '📝', title: 'Workout planner', body: 'Drag-and-drop planned rides, runs and swims with duration, distance and target TSS.' },
      { icon: '🎯', title: 'Planned vs completed', body: 'See whether you hit the week\'s load — green when on track, amber when under, red when over.' },
      { icon: '📉', title: 'Form / Fitness / Fatigue', body: 'CTL, ATL and TSB from your real zones — the same numbers as the iPhone widget.' },
      { icon: '🗓️', title: 'Weekly load chart', body: 'Bar chart of daily TSS with an optimal-load band — know when to push and when to recover.' },
    ],
    footerNote: 'Workout planning is included in your LaChart account. Open Calendar → + Plan to get started.',
  },
};

/* ─── helpers ─────────────────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function utmQs() {
  return `utm_source=email&utm_medium=lifecycle&utm_campaign=${encodeURIComponent(UTM_CAMPAIGN)}`;
}

function appendUtm(url) {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${utmQs()}`;
}

function unsubscribeTokenFor(userId) {
  const secret = process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'lachart-unsub';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 24);
}

function unsubscribeUrlFor(userId) {
  const base = (process.env.SERVER_PUBLIC_URL || 'https://lachart.onrender.com').replace(/\/+$/, '');
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeTokenFor(userId)}`;
}

function verifyUnsubscribeToken(userId, token) {
  if (!userId || !token) return false;
  const expected = unsubscribeTokenFor(userId);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

function hasMobileApp(user) {
  const pushCount = Array.isArray(user?.expoPushTokens) ? user.expoPushTokens.length : 0;
  return !!(user?.mobileApp?.lastSeenAt || pushCount > 0);
}

function hasStrava(user) {
  return !!(user?.strava?.athleteId);
}

function getStep1Anchor(user) {
  const re = user?.retentionEmails || {};
  return re.appReengagementStep1Sent
    || re.iosLaunchJun2026Sent
    || user?.appDownloadEmail?.lastSent
    || null;
}

function daysSince(date) {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / MS_DAY;
}

function lastReengagementSend(user) {
  const re = user?.retentionEmails || {};
  const dates = [
    re.appReengagementStep1Sent,
    re.appReengagementStep2Sent,
    re.appReengagementStep3Sent,
  ].filter(Boolean).map((d) => new Date(d).getTime());
  return dates.length ? new Date(Math.max(...dates)) : null;
}

function stepGapDays() {
  return Number(process.env.APP_REENGAGEMENT_STEP_GAP_DAYS || 7);
}

function minGapBetweenSendsDays() {
  return Number(process.env.APP_REENGAGEMENT_MIN_GAP_DAYS || 6);
}

function isEligibleBase(user) {
  if (!user?.email) return false;
  if (user.isActive === false) return false;
  if (user.notifications?.emailNotifications === false) return false;
  if (user.notifications?.marketingEmails === false) return false;
  if (hasMobileApp(user)) return false;
  return true;
}

/**
 * Returns 1, 2, 3, or null (drip complete).
 */
function determineNextStep(user) {
  const re = user?.retentionEmails || {};
  const anchor = getStep1Anchor(user);

  if (!anchor) return 1;
  if (!hasStrava(user) && !re.appReengagementStep2Sent) return 2;
  if (!re.appReengagementStep3Sent) return 3;
  return null;
}

function isStepReady(user, step) {
  const re = user?.retentionEmails || {};
  const gap = stepGapDays();
  const minGap = minGapBetweenSendsDays();
  const lastSend = lastReengagementSend(user);
  if (lastSend && daysSince(lastSend) < minGap) return false;

  const anchor = getStep1Anchor(user);

  if (step === 1) {
    if (anchor) return false;
    return true;
  }

  if (step === 2) {
    if (!anchor || re.appReengagementStep2Sent) return false;
    if (hasStrava(user)) return false;
    return daysSince(anchor) >= gap;
  }

  if (step === 3) {
    if (re.appReengagementStep3Sent) return false;
    if (hasStrava(user)) {
      return daysSince(anchor) >= gap;
    }
    if (!re.appReengagementStep2Sent) return false;
    return daysSince(re.appReengagementStep2Sent) >= gap;
  }

  return false;
}

function resolveStepUrls(step) {
  const clientUrl = getClientUrl();
  const copy = { ...STEPS[step] };
  if (step === 1) {
    copy.ctaUrl = appendUtm(APP_STORE_URL);
    copy.secondaryUrl = appendUtm(`${clientUrl}/dashboard`);
  } else if (step === 2) {
    copy.ctaUrl = appendUtm(`${clientUrl}/settings?tab=integrations`);
    copy.secondaryUrl = appendUtm(`${clientUrl}/training-calendar`);
  } else {
    copy.ctaUrl = appendUtm(`${clientUrl}/training-calendar`);
    copy.secondaryUrl = appendUtm(`${clientUrl}/dashboard`);
  }
  return copy;
}

function renderHtml(step, { firstName, unsubscribeUrl }) {
  const t = resolveStepUrls(step);
  const greet = firstName
    ? `Hi ${escapeHtml(firstName)},`
    : 'Hi there,';

  const featureRows = t.features.map((f) => `
    <tr>
      <td valign="top" style="width:32px;padding:10px 0;font-size:20px;line-height:1;">${f.icon}</td>
      <td valign="top" style="padding:10px 0;font-size:14px;line-height:1.55;color:${BRAND.text};">
        <strong style="color:${BRAND.ink};font-size:15px;">${escapeHtml(f.title)}</strong><br/>
        <span style="color:${BRAND.muted};">${escapeHtml(f.body)}</span>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(t.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND.text};-webkit-font-smoothing:antialiased;">
  <div style="max-width:580px;margin:0 auto;padding:28px 16px 56px;">
    <div style="text-align:center;margin-bottom:20px;">
      <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${BRAND.primary};color:#fff;font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">
        ${escapeHtml(t.pill)}
      </span>
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(10,14,26,0.06);">
      <tr>
        <td style="padding:0;background:linear-gradient(135deg,${BRAND.primaryTint} 0%,#fff 55%);">
          <div style="padding:36px 32px 24px;">
            <h1 style="margin:0 0 12px;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;color:${BRAND.ink};">
              ${escapeHtml(t.heroTitle)}
            </h1>
            <p style="margin:0;font-size:16px;line-height:1.6;color:${BRAND.muted};">
              ${greet}<br/>${escapeHtml(t.heroBody)}
            </p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 32px 28px;text-align:center;">
          <a href="${t.ctaUrl}" style="display:inline-block;background:${BRAND.accent};color:#fff;text-decoration:none;padding:15px 28px;border-radius:12px;font-weight:700;font-size:16px;box-shadow:0 2px 8px rgba(255,107,74,0.35);">
            ${escapeHtml(t.cta)}
          </a>
          <br/>
          <a href="${t.secondaryUrl}" style="display:inline-block;margin-top:14px;color:${BRAND.primaryDark};font-size:14px;font-weight:600;text-decoration:none;">
            ${escapeHtml(t.secondaryCta)} →
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 32px 36px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${featureRows}
          </table>
        </td>
      </tr>
    </table>

    <p style="text-align:center;margin-top:22px;font-size:12px;color:#9CA3AF;line-height:1.65;">
      ${escapeHtml(t.footerNote)}<br/>
      <a href="${unsubscribeUrl}" style="color:#9CA3AF;text-decoration:underline;">Unsubscribe from product emails</a>
      &nbsp;·&nbsp;
      <a href="${appendUtm(getClientUrl() + '/settings?tab=notifications')}" style="color:#9CA3AF;text-decoration:underline;">Notification settings</a>
    </p>
  </div>
</body>
</html>`;
}

async function sendStep(user, step, { dryRun = false, track = true, preview = false } = {}) {
  if (!isEligibleBase(user) && !preview) {
    return { sent: false, reason: 'not_eligible' };
  }
  if (!preview) {
    if (determineNextStep(user) !== step) {
      return { sent: false, reason: 'wrong_step' };
    }
    if (!isStepReady(user, step)) {
      return { sent: false, reason: 'not_ready' };
    }
  }

  const key = STEP_KEYS[step];
  if (!preview && user.retentionEmails?.[key]) {
    return { sent: false, reason: 'already_sent' };
  }

  const html = renderHtml(step, {
    firstName: user.name || null,
    unsubscribeUrl: unsubscribeUrlFor(user._id),
  });
  const subject = STEPS[step].subject;

  if (dryRun) {
    return { sent: false, reason: 'dry_run', step, subject };
  }

  const transporter = createEmailTransporter();
  if (!transporter) {
    return { sent: false, reason: 'transporter_unavailable' };
  }

  try {
    const sendInfo = await transporter.sendMail({
      from: { name: 'LaChart', address: process.env.EMAIL_USER },
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
    if (!wasAccepted || rejected.length) {
      return { sent: false, reason: 'relay_rejected', smtp: { accepted, rejected } };
    }

    if (track) {
      await User.updateOne(
        { _id: user._id },
        { $set: { [`retentionEmails.${key}`]: new Date() } },
      );
    }

    console.log(`[appReengagement] step ${step} sent to ${user.email}`);
    return { sent: true, step, subject };
  } catch (e) {
    console.error(`[appReengagement] step ${step} failed for ${user.email}:`, e?.message || e);
    return { sent: false, reason: 'send_failed', message: e?.message };
  }
}

function webOnlyQuery() {
  return {
    $and: [
      {
        $or: [
          { 'mobileApp.lastSeenAt': { $exists: false } },
          { 'mobileApp.lastSeenAt': null },
        ],
      },
      {
        $or: [
          { expoPushTokens: { $exists: false } },
          { expoPushTokens: null },
          { expoPushTokens: { $size: 0 } },
        ],
      },
    ],
  };
}

async function findReadyCandidates(limit = 50) {
  const users = await User.find({
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
    ...webOnlyQuery(),
  })
    .select('_id email name surname isActive notifications retentionEmails strava mobileApp expoPushTokens appDownloadEmail createdAt')
    .sort({ createdAt: 1 })
    .limit(Math.max(limit * 4, 200))
    .lean();

  const ready = [];
  for (const user of users) {
    if (!isEligibleBase(user)) continue;
    const step = determineNextStep(user);
    if (!step) continue;
    if (!isStepReady(user, step)) continue;
    ready.push({ user, step });
  }

  ready.sort((a, b) => {
    if (a.step !== b.step) return a.step - b.step;
    return new Date(a.user.createdAt) - new Date(b.user.createdAt);
  });

  return ready.slice(0, limit);
}

async function getCampaignStats() {
  const base = {
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
  };
  const webOnly = {
    ...base,
    ...webOnlyQuery(),
  };

  const [eligible, step1Sent, step2Sent, step3Sent, readyNow] = await Promise.all([
    User.countDocuments(webOnly),
    User.countDocuments({ ...webOnly, 'retentionEmails.appReengagementStep1Sent': { $ne: null, $exists: true } }),
    User.countDocuments({ ...webOnly, 'retentionEmails.appReengagementStep2Sent': { $ne: null, $exists: true } }),
    User.countDocuments({ ...webOnly, 'retentionEmails.appReengagementStep3Sent': { $ne: null, $exists: true } }),
    findReadyCandidates(500),
  ]);

  const readyByStep = { 1: 0, 2: 0, 3: 0 };
  for (const r of readyNow) readyByStep[r.step] += 1;

  return {
    eligibleWebOnly: eligible,
    step1Sent,
    step2Sent,
    step3Sent,
    readyNow: readyNow.length,
    readyByStep,
    stepGapDays: stepGapDays(),
    minGapDays: minGapBetweenSendsDays(),
  };
}

module.exports = {
  STEPS,
  STEP_KEYS,
  sendStep,
  findReadyCandidates,
  getCampaignStats,
  determineNextStep,
  isStepReady,
  isEligibleBase,
  renderHtml,
  verifyUnsubscribeToken,
  hasMobileApp,
};
