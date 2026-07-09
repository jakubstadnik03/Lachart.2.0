/**
 * "What's new — May 2026" re-engagement campaign.
 *
 * Mass-sends the designed HTML email (English only) to every registered
 * user who hasn't opted out of marketing emails. The campaign runs PACED —
 * a small batch every interval — so:
 *   • Zoho's SMTP throughput limits aren't tripped (free tier ~30/h sustained;
 *     paid ~200/h burst).
 *   • Our Render dyno isn't overwhelmed building HTML for hundreds of users
 *     in parallel.
 *   • Anti-spam heuristics on receiving mail servers don't flag the
 *     campaign as a flood (Gmail/Outlook scrutinise sender velocity).
 *
 * State lives on the user document (retentionEmails.whatsNewMay2026Sent) so
 * a restart, redeploy or scheduler tick re-checks "what's left to send"
 * exactly once per user — no double-sending.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEmailTransporter } = require('../utils/createEmailTransporter');
const User = require('../models/UserModel');

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'whatsNewMay2026');
const ASSETS_DIR = path.join(TEMPLATE_DIR, 'assets');
const CAMPAIGN_KEY = 'whatsNewMay2026Sent';

// The image filenames referenced by the templates as `src="assets/<file>"`.
// Each becomes a CID attachment so the email renders inline even when
// recipients haven't tapped "Show images" — far higher first-impression
// conversion than absolute-URL images.
const ASSETS = [
  'lachart-logo-horizontal.png',
  'lactate-curve.png',
  'zones-generator.png',
  'lactate-pdf-report.jpg',
  'training-log-lactate.png',
  'workout-planner.png',
  'training-calendar.png',
];

const SUBJECT = {
  en: "What's new in LaChart — iPhone app, workout planner & more",
};

// Templates are read once on first send and cached for the lifetime of the
// process — they don't change while a campaign is running.
let cachedTemplates = null;
function loadTemplates() {
  if (cachedTemplates) return cachedTemplates;
  // The design handoff loads tokens via <link rel="stylesheet"
  // href="colors_and_type.css"> — email clients won't fetch that, so we
  // inline the file into a <style> block during template prep.
  const tokensCss = fs.readFileSync(path.join(TEMPLATE_DIR, 'colors_and_type.css'), 'utf8');
  const inlineTokens = (html) =>
    html.replace(
      /<link\s+rel="stylesheet"\s+href="colors_and_type\.css"\s*\/?>/,
      `<style>${tokensCss}</style>`
    );
  const en = inlineTokens(fs.readFileSync(path.join(TEMPLATE_DIR, 'en.html'), 'utf8'));
  cachedTemplates = { en };
  return cachedTemplates;
}

/**
 * Transform a template HTML for actual sending:
 *   • Drop the mock mail-client chrome (design-time only).
 *   • Rewrite `src="assets/foo.png"` → `src="cid:foo.png"`.
 *   • Replace `#unsub` with the real unsubscribe URL for this recipient.
 *   • Append UTM params to the CTA / footer links.
 */
function prepareHtmlForRecipient(rawHtml, { unsubscribeUrl, utmCampaign }) {
  let html = rawHtml;

  // 1. Strip the mock mail-client header (between the comment and <article class="email">).
  html = html.replace(/<!--\s*Mock mail-client header[\s\S]*?<article class="email">/, '<article class="email">');

  // 2. Convert asset references to CIDs.
  for (const file of ASSETS) {
    const cid = file; // use filename as CID for clarity
    html = html.replaceAll(`assets/${file}`, `cid:${cid}`);
  }

  // 3. Unsubscribe URL replacement (only place the design uses #unsub).
  html = html.replaceAll('#unsub', unsubscribeUrl);

  // 4. Append UTM params to outbound lachart.net links so we can attribute
  // re-engagement traffic in analytics. Skip if already present.
  const utm = `utm_source=email&utm_medium=lifecycle&utm_campaign=${encodeURIComponent(utmCampaign)}`;
  html = html.replace(/(href="https:\/\/lachart\.net[^"]*?)(")/g, (m, before, after) => {
    if (before.includes('utm_')) return m;
    const sep = before.includes('?') ? '&' : '?';
    return `${before}${sep}${utm}${after}`;
  });

  return html;
}

/** Stable, signed unsubscribe token so we don't have to write back to the DB just to generate the link. */
function unsubscribeTokenFor(userId) {
  const secret = process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'lachart-unsub';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 24);
}

function unsubscribeUrlFor(userId) {
  const base = (process.env.SERVER_PUBLIC_URL || 'https://lachart.onrender.com').replace(/\/+$/, '');
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeTokenFor(userId)}`;
}

/** All recipients receive the English template. */
function pickLanguage(_user) {
  return 'en';
}

/** Send the email to a single user. Returns { sent, reason }. */
async function sendOne(user, { dryRun = false } = {}) {
  if (!user || !user.email) return { sent: false, reason: 'no_email' };
  if (user.isActive === false) return { sent: false, reason: 'inactive' };
  if (user.notifications?.emailNotifications === false) return { sent: false, reason: 'opted_out' };
  if (user.notifications?.marketingEmails === false) return { sent: false, reason: 'marketing_opted_out' };
  if (user.retentionEmails && user.retentionEmails[CAMPAIGN_KEY]) return { sent: false, reason: 'already_sent' };

  const lang = pickLanguage(user);
  const templates = loadTemplates();
  const html = prepareHtmlForRecipient(templates[lang], {
    unsubscribeUrl: unsubscribeUrlFor(user._id),
    utmCampaign: '2026-05-whats-new',
  });

  const subject = SUBJECT[lang] + ' 🟣';
  const attachments = ASSETS.map((file) => ({
    filename: file,
    path: path.join(ASSETS_DIR, file),
    cid: file,
  }));

  if (dryRun) {
    return { sent: false, reason: 'dry_run', lang, subject };
  }

  const transporter = createEmailTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_unavailable' };

  try {
    // Capture nodemailer's full response so callers can diagnose
    // "transporter said OK but the email never arrived" situations
    // (Zoho silently dropping after hourly cap, recipient on a deny
    // list, etc.). nodemailer returns:
    //   messageId — set by SMTP
    //   accepted  — recipients the relay accepted
    //   rejected  — recipients the relay rejected
    //   response  — final SMTP server response string
    const sendInfo = await transporter.sendMail({
      from: { name: 'LaChart', address: process.env.EMAIL_USER },
      to: user.email,
      subject,
      html,
      attachments,
      // Standard one-click unsubscribe header — Gmail / Apple Mail surface
      // this as a native "Unsubscribe" link above the message body and it's
      // a strong positive signal for sender reputation.
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrlFor(user._id)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    // Defence against the relay silently dropping the recipient: if the
    // address ended up in `rejected` (or didn't make it into `accepted`),
    // treat it as a non-sent so the UI can show the reason instead of a
    // false "sent" toast.
    const accepted = Array.isArray(sendInfo?.accepted) ? sendInfo.accepted : [];
    const rejected = Array.isArray(sendInfo?.rejected) ? sendInfo.rejected : [];
    const wasAccepted = accepted.some((a) => String(a).toLowerCase() === user.email.toLowerCase());
    const wasRejected = rejected.some((r) => String(r).toLowerCase() === user.email.toLowerCase());
    if (!wasAccepted || wasRejected) {
      const reason = `relay did not accept recipient — accepted=[${accepted.join(',')}] rejected=[${rejected.join(',')}] response="${sendInfo?.response || ''}"`;
      console.error(`[whatsNewCampaign] ${user.email}: ${reason}`);
      return { sent: false, reason, smtp: { accepted, rejected, response: sendInfo?.response, messageId: sendInfo?.messageId } };
    }

    // Mark sent so a retry doesn't double-deliver. We write only the
    // campaign timestamp, no full document overwrite, to avoid race
    // conditions with login/profile updates happening concurrently.
    await User.updateOne(
      { _id: user._id },
      { $set: { [`retentionEmails.${CAMPAIGN_KEY}`]: new Date() } }
    );

    console.log(`[whatsNewCampaign] sent to ${user.email}`, {
      messageId: sendInfo?.messageId,
      response: sendInfo?.response,
      accepted, rejected,
    });

    return {
      sent: true,
      lang,
      smtp: {
        accepted,
        rejected,
        response: sendInfo?.response,
        messageId: sendInfo?.messageId,
      },
    };
  } catch (e) {
    const reason = (e && (e.message || e.reason || String(e))) || 'send_failed';
    console.error(`[whatsNewCampaign] failed to send to ${user.email}:`, reason, e?.code || '');
    return { sent: false, reason, smtp: { code: e?.code, command: e?.command, response: e?.response } };
  }
}

/** Find the next batch of users who still need the email. */
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
    .sort({ createdAt: 1 }) // oldest accounts first — most likely to re-engage
    .limit(limit)
    .lean();
}

/** How many users are still on the to-do list? Cheap, used by the admin GET. */
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

/**
 * Run the campaign. Sends `batchSize` users in parallel, sleeps
 * `batchIntervalMs`, repeats until either:
 *   • the pending queue is empty,
 *   • `maxBatches` is reached (safety cap),
 *   • `dryRun=true` (then it just logs counts and returns).
 *
 * Designed to be invoked once per scheduler tick OR via an admin HTTP call
 * with a generous timeout. Returns when the campaign is done OR paused.
 *
 * Pacing guidance:
 *   • Zoho Mail (paid): ~200 emails/h sustained, 1000/day cap. Default
 *     batchSize=5 every 60s = 300/h → safely under burst, well under cap.
 *   • Zoho Mail (free): 1000/day, looser per-hour. Same defaults work.
 *   • For a 100-user list this completes in ~20 minutes. For 1000, ~3.3 h.
 */
async function runCampaign({
  // Conservative defaults tuned for Zoho Mail FREE (≈25/day to new external
  // addresses, 200/day mixed). 1 email every 5 minutes = 12/h = 250/day
  // worst case — still below the free-tier soft throttle, and most actual
  // runs complete well inside the window.
  batchSize = 1,
  batchIntervalMs = 5 * 60 * 1000,
  maxBatches = 1000,
  // Hard cap on emails sent in this single run. Useful for "send 20 today,
  // 20 tomorrow" cadence on Zoho free — set to 20 by default. Pass null to
  // let the run drain the whole pending queue.
  maxEmailsPerRun = 20,
  dryRun = false,
  onProgress,
} = {}) {
  const stats = { totalAttempted: 0, sent: 0, skipped: 0, failed: 0, byReason: {} };
  let batchIndex = 0;

  while (batchIndex < maxBatches) {
    // Respect the per-run cap (Zoho-free safety).
    if (maxEmailsPerRun != null && stats.sent >= maxEmailsPerRun) {
      console.log(`[whatsNewCampaign] reached maxEmailsPerRun=${maxEmailsPerRun}, pausing`);
      break;
    }
    const slotsLeft = maxEmailsPerRun != null ? Math.max(0, maxEmailsPerRun - stats.sent) : batchSize;
    const fetchLimit = Math.min(batchSize, slotsLeft || batchSize);
    const users = await findPendingUsers(fetchLimit);
    if (users.length === 0) break; // queue empty → campaign done

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
    console.log(`[whatsNewCampaign] batch ${batchIndex}: attempted=${users.length} sent=${stats.sent} skipped=${stats.skipped} failed=${stats.failed}`);

    if (dryRun) break; // dry-run does one batch and bails

    // Sleep between batches — give Zoho + receiving servers headroom.
    await new Promise((resolve) => setTimeout(resolve, batchIntervalMs));
  }

  console.log('[whatsNewCampaign] finished:', stats);
  return stats;
}

/** Validate a token for the GET /api/email/unsubscribe endpoint. */
function verifyUnsubscribeToken(userId, token) {
  if (!userId || !token) return false;
  const expected = unsubscribeTokenFor(userId);
  // Constant-time compare to avoid timing attacks (not load-bearing here,
  // but cheap and consistent with the rest of the codebase).
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

module.exports = {
  sendOne,
  runCampaign,
  findPendingUsers,
  getPendingCount,
  verifyUnsubscribeToken,
  CAMPAIGN_KEY,
};
