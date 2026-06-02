/**
 * "LaChart is on the App Store" — June 2026 launch announcement.
 *
 * Same paced-send pattern as whatsNewCampaignService (small batches with
 * sleeps between them so Zoho throughput / anti-spam heuristics stay
 * happy). State lives on user.retentionEmails.iosLaunchJun2026Sent so the
 * campaign is exactly-once per user across restarts.
 *
 * The template is inlined here rather than living in /templates because:
 *   • It's a single, short announcement (no hero gallery like whatsNew).
 *   • It uses the App Store link as the only CTA — no per-recipient
 *     personalisation beyond first-name interpolation.
 *   • Less moving parts → faster to ship for a launch-day blast.
 */

const crypto = require('crypto');
const { createEmailTransporter } = require('../utils/createEmailTransporter');
const User = require('../models/UserModel');

const CAMPAIGN_KEY = 'iosLaunchJun2026Sent';
const APP_STORE_URL = 'https://apps.apple.com/cz/app/lachart/id6764768876?l=cs';
const UTM_CAMPAIGN = '2026-06-ios-launch';

const SUBJECT = {
  en: 'LaChart for iPhone is live on the App Store 📱',
  cz: 'LaChart pro iPhone je v App Store 📱',
};

/* ────────────────────── HTML template ─────────────────────────────────── */

function renderHtml({ firstName, lang, unsubscribeUrl }) {
  const t = lang === 'cz' ? COPY.cz : COPY.en;
  const greet = firstName ? `${t.greetingHi} ${escapeHtml(firstName)},` : t.greetingHey;
  const ctaHref = appendUtm(APP_STORE_URL);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t.subject}</title>
</head>
<body style="margin:0;padding:0;background:#ECEDF1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Hind Vadodara,Roboto,sans-serif;color:#1D2C4C;-webkit-font-smoothing:antialiased;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px 48px;">
    <!-- Logo + pill -->
    <div style="text-align:center;margin-bottom:18px;">
      <div style="display:inline-block;padding:5px 12px;border-radius:999px;background:#5E6590;color:#fff;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">
        ${t.pillJustLaunched}
      </div>
    </div>

    <!-- Hero card -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff;border:1px solid #E5E7EB;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(10,14,26,0.06);">
      <tr>
        <td style="padding:32px 28px 8px;">
          <h1 style="margin:0 0 10px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;color:#0A0E1A;">
            ${t.heroTitle}
          </h1>
          <p style="margin:0;font-size:15px;line-height:1.55;color:#4B5563;">
            ${greet}<br/>${t.heroBody}
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 28px 8px;text-align:center;">
          <!-- App Store button -->
          <a href="${ctaHref}" style="display:inline-block;background:#000;color:#fff;text-decoration:none;padding:14px 26px;border-radius:12px;font-weight:700;font-size:15.5px;letter-spacing:-0.005em;">
            ${t.ctaPrimary}
          </a>
        </td>
      </tr>

      <!-- Feature list -->
      <tr>
        <td style="padding:24px 28px 32px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${t.features.map(f => `
              <tr>
                <td valign="top" style="width:28px;padding:8px 0;font-size:18px;line-height:1;">${f.icon}</td>
                <td valign="top" style="padding:8px 0;font-size:14px;line-height:1.5;color:#1D2C4C;">
                  <strong style="color:#0A0E1A;">${f.title}</strong><br/>
                  <span style="color:#6B7280;">${f.body}</span>
                </td>
              </tr>
            `).join('')}
          </table>
        </td>
      </tr>
    </table>

    <!-- Footer -->
    <div style="text-align:center;margin-top:22px;font-size:12px;color:#9CA3AF;line-height:1.6;">
      ${t.footerNote}<br/>
      <a href="${unsubscribeUrl}" style="color:#9CA3AF;text-decoration:underline;">${t.unsubscribe}</a>
      &nbsp;·&nbsp;
      <a href="https://lachart.net/about?${utmQs()}" style="color:#9CA3AF;text-decoration:underline;">lachart.net</a>
    </div>
  </div>
</body>
</html>`;
}

const COPY = {
  en: {
    subject: SUBJECT.en,
    pillJustLaunched: 'Just launched',
    greetingHi: 'Hi',
    greetingHey: 'Hi there,',
    heroTitle: 'LaChart for iPhone is live',
    heroBody:
      "the iOS app is on the App Store today. Same account, free download — and a home-screen widget that puts your Form / Fitness / Fatigue right next to your weather and calendar.",
    ctaPrimary: 'Download on the App Store',
    features: [
      { icon: '📊', title: 'Form / Fitness / Fatigue widget', body: 'Today\'s training plus a 14-day TSB sparkline on your home screen.' },
      { icon: '🏃', title: "Today's training at a glance", body: 'Completed and planned workouts in one tidy list, sorted by sport and load.' },
      { icon: '❤️', title: 'Apple Health sync', body: 'Heart rate, distance and training load flow in automatically.' },
      { icon: '🔔', title: 'Push notifications', body: 'Lactate-test reminders and Strava-import notifications without the browser.' },
    ],
    footerNote:
      'Requires iOS 16 or later. Sign in with your existing LaChart account. Android is next on the roadmap.',
    unsubscribe: 'Unsubscribe',
  },
  cz: {
    subject: SUBJECT.cz,
    pillJustLaunched: 'Právě spuštěno',
    greetingHi: 'Ahoj',
    greetingHey: 'Ahoj,',
    heroTitle: 'LaChart pro iPhone je venku',
    heroBody:
      'iOS aplikace je dnes v App Store. Stejný účet, zdarma ke stažení — a widget na domovskou obrazovku, který ti ukáže Form / Fitness / Fatigue hned vedle počasí a kalendáře.',
    ctaPrimary: 'Stáhnout v App Store',
    features: [
      { icon: '📊', title: 'Widget Form / Fitness / Fatigue', body: 'Dnešní trénink + 14denní TSB sparkline přímo na domovské obrazovce.' },
      { icon: '🏃', title: 'Dnešní tréninky na jednom místě', body: 'Splněné i naplánované tréninky v jednom přehledném seznamu.' },
      { icon: '❤️', title: 'Apple Health sync', body: 'Tep, vzdálenost a tréninková zátěž se nahrávají automaticky.' },
      { icon: '🔔', title: 'Push notifikace', body: 'Připomenutí laktátových testů a importy ze Stravy bez prohlížeče.' },
    ],
    footerNote:
      'Vyžaduje iOS 16 nebo novější. Přihlaš se svým stávajícím LaChart účtem. Android už chystáme.',
    unsubscribe: 'Odhlásit odběr',
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

function pickLanguage(user) {
  const email = String(user.email || '').toLowerCase();
  const name = `${user.name || ''} ${user.surname || ''}`.toLowerCase();
  if (email.endsWith('.cz') || email.endsWith('.sk')) return 'cz';
  if (/[áčďéěíňóřšťúůýž]/i.test(name)) return 'cz';
  return 'en';
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
  } catch { return false; }
}

/* ────────────────────── send + run ────────────────────────────────────── */

async function sendOne(user, { dryRun = false } = {}) {
  if (!user || !user.email) return { sent: false, reason: 'no_email' };
  if (user.isActive === false) return { sent: false, reason: 'inactive' };
  if (user.notifications?.emailNotifications === false) return { sent: false, reason: 'opted_out' };
  if (user.retentionEmails && user.retentionEmails[CAMPAIGN_KEY]) return { sent: false, reason: 'already_sent' };

  const lang = pickLanguage(user);
  const html = renderHtml({
    firstName: user.name || null,
    lang,
    unsubscribeUrl: unsubscribeUrlFor(user._id),
  });
  const subject = SUBJECT[lang];

  if (dryRun) return { sent: false, reason: 'dry_run', lang, subject };

  const transporter = createEmailTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_unavailable' };

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
    const wasRejected = rejected.some((r) => String(r).toLowerCase() === user.email.toLowerCase());
    if (!wasAccepted || wasRejected) {
      const reason = `relay did not accept recipient — accepted=[${accepted.join(',')}] rejected=[${rejected.join(',')}] response="${sendInfo?.response || ''}"`;
      console.error(`[iosLaunchCampaign] ${user.email}: ${reason}`);
      return { sent: false, reason, smtp: { accepted, rejected, response: sendInfo?.response, messageId: sendInfo?.messageId } };
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { [`retentionEmails.${CAMPAIGN_KEY}`]: new Date() } }
    );

    console.log(`[iosLaunchCampaign] sent to ${user.email}`, {
      messageId: sendInfo?.messageId, response: sendInfo?.response, accepted, rejected,
    });
    return { sent: true, lang, smtp: { accepted, rejected, response: sendInfo?.response, messageId: sendInfo?.messageId } };
  } catch (e) {
    const reason = (e && (e.message || e.reason || String(e))) || 'send_failed';
    console.error(`[iosLaunchCampaign] failed to send to ${user.email}:`, reason, e?.code || '');
    return { sent: false, reason, smtp: { code: e?.code, command: e?.command, response: e?.response } };
  }
}

async function findPendingUsers(limit) {
  return User.find({
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
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
      console.log(`[iosLaunchCampaign] reached maxEmailsPerRun=${maxEmailsPerRun}, pausing`);
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
    console.log(`[iosLaunchCampaign] batch ${batchIndex}: attempted=${users.length} sent=${stats.sent} skipped=${stats.skipped} failed=${stats.failed}`);

    if (dryRun) break;
    await new Promise((resolve) => setTimeout(resolve, batchIntervalMs));
  }

  console.log('[iosLaunchCampaign] finished:', stats);
  return stats;
}

module.exports = {
  sendOne,
  runCampaign,
  findPendingUsers,
  getPendingCount,
  verifyUnsubscribeToken,
  renderHtml,            // exposed for the preview script + admin sanity-check
  CAMPAIGN_KEY,
  APP_STORE_URL,
};
