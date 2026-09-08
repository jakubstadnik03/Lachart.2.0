/**
 * Recurring "Product update / What's new" newsletter.
 *
 * Unlike the one-off campaigns (whatsNewMay2026, iosLaunch, paidLaunch) which
 * each have a hardcoded state key and a single template baked into the code,
 * this service is ISSUE-based so you can ship a new changelog every release
 * WITHOUT a code or schema change:
 *
 *   • Each issue is a folder under server/templates/productUpdate/<issueId>/
 *     containing en.html, assets/, an optional colors_and_type.css, and an
 *     optional meta.json ({ subject, utmCampaign, date }).
 *   • Idempotency is per-issue: user.retentionEmails.productUpdates is a Map of
 *     issueId → sentAt, so "already got the August issue" never blocks the
 *     September one, and re-running an issue never double-sends it.
 *   • Images are auto-discovered from the issue's assets/ folder and attached
 *     as CIDs (renders inline before the recipient taps "Show images").
 *
 * Everything else (Zoho transport, signed unsubscribe token, List-Unsubscribe
 * headers, marketing opt-out respect, paced batching) mirrors
 * whatsNewCampaignService so deliverability behaviour is identical.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createEmailTransporter } = require('../utils/createEmailTransporter');
const User = require('../models/UserModel');

const ROOT = path.join(__dirname, '..', 'templates', 'productUpdate');
const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const SENT_MAP = 'retentionEmails.productUpdates';

/** Mongoose Map keys can't contain "." or "$"; keep ids filesystem- and URL-safe. */
function isValidIssueId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function issueDir(issueId) {
  return path.join(ROOT, issueId);
}

function issueExists(issueId) {
  return isValidIssueId(issueId) && fs.existsSync(path.join(issueDir(issueId), 'en.html'));
}

function loadMeta(issueId) {
  let meta = {};
  const metaPath = path.join(issueDir(issueId), 'meta.json');
  if (fs.existsSync(metaPath)) {
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { /* fall back to defaults */ }
  }
  return {
    id: issueId,
    subject: meta.subject || "What's new in LaChart",
    utmCampaign: meta.utmCampaign || `product-update-${issueId}`,
    date: meta.date || '',
    ...meta,
    id: issueId, // keep id authoritative even if meta.json disagrees
  };
}

/** All issues that have an en.html, newest first (by meta.date, then id). */
function listIssues() {
  if (!fs.existsSync(ROOT)) return [];
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && issueExists(d.name))
    .map((d) => loadMeta(d.name))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
}

/**
 * The issue the scheduler / "current" admin actions target:
 *   • PRODUCT_UPDATE_ACTIVE_ISSUE env var if it points at a real issue, else
 *   • the newest issue on disk.
 * Returns null when there are no issues yet.
 */
function getActiveIssueId() {
  const env = (process.env.PRODUCT_UPDATE_ACTIVE_ISSUE || '').trim();
  if (env && issueExists(env)) return env;
  const all = listIssues();
  return all.length ? all[0].id : null;
}

/**
 * Which issue the SCHEDULER should send right now — the queue picker that keeps
 * a backlog of issues rolling out one at a time so Zoho never sees a flood:
 *   • PRODUCT_UPDATE_ACTIVE_ISSUE env wins (manual pin), else
 *   • the OLDEST issue whose releaseDate (meta.json, "YYYY-MM-DD") has passed
 *     (or is unset) AND that still has pending recipients.
 * Because it always drains the oldest-still-pending issue first, a newer issue
 * only starts once the previous one is fully delivered — and only after its own
 * releaseDate — so several queued issues send sequentially, not all at once.
 * Returns null when nothing is due. Async: it checks pending counts.
 */
async function getScheduledIssueId(nowIso = new Date().toISOString().slice(0, 10)) {
  const env = (process.env.PRODUCT_UPDATE_ACTIVE_ISSUE || '').trim();
  if (env && issueExists(env)) return env;
  const due = listIssues()
    .filter((m) => !m.releaseDate || String(m.releaseDate) <= nowIso)
    // listIssues() is newest-first; drain oldest-still-pending first.
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  for (const m of due) {
    if ((await getPendingCount(m.id)) > 0) return m.id;
  }
  return null;
}

/** Image filenames in the issue's assets/ folder (become CID attachments). */
function listAssets(issueId) {
  const dir = path.join(issueDir(issueId), 'assets');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => IMG_EXT.has(path.extname(f).toLowerCase()));
}

// Rendered HTML per issue is cached for the process lifetime — templates don't
// change while a campaign is running. Restart the dyno after editing a template.
const templateCache = new Map();
function loadIssueHtml(issueId) {
  if (templateCache.has(issueId)) return templateCache.get(issueId);
  const dir = issueDir(issueId);
  // Inline colors_and_type.css (email clients won't fetch a linked stylesheet).
  // Prefer the issue's own tokens, fall back to the shared newsletter tokens.
  let cssPath = path.join(dir, 'colors_and_type.css');
  if (!fs.existsSync(cssPath)) cssPath = path.join(ROOT, 'colors_and_type.css');
  const tokensCss = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  let html = fs.readFileSync(path.join(dir, 'en.html'), 'utf8');
  html = html.replace(
    /<link\s+rel="stylesheet"\s+href="colors_and_type\.css"\s*\/?>/,
    `<style>${tokensCss}</style>`
  );
  templateCache.set(issueId, html);
  return html;
}

/**
 * Transform issue HTML for a single recipient:
 *   • strip the design-time mock mail-client chrome,
 *   • rewrite src="assets/foo.png" → src="cid:foo.png",
 *   • replace #unsub with the recipient's signed unsubscribe URL,
 *   • append UTM params to outbound lachart.net links.
 */
function prepareHtmlForRecipient(rawHtml, { assets, unsubscribeUrl, utmCampaign }) {
  let html = rawHtml;
  html = html.replace(/<!--\s*Mock mail-client header[\s\S]*?<article class="email">/, '<article class="email">');
  for (const file of assets) {
    html = html.replaceAll(`assets/${file}`, `cid:${file}`);
  }
  html = html.replaceAll('#unsub', unsubscribeUrl);
  const utm = `utm_source=email&utm_medium=lifecycle&utm_campaign=${encodeURIComponent(utmCampaign)}`;
  html = html.replace(/(href="https:\/\/lachart\.net[^"]*?)(")/g, (m, before, after) => {
    if (before.includes('utm_')) return m;
    const sep = before.includes('?') ? '&' : '?';
    return `${before}${sep}${utm}${after}`;
  });
  return html;
}

/** Stable, signed unsubscribe token — identical scheme to whatsNewCampaignService
 *  so the existing GET /api/email/unsubscribe endpoint validates it unchanged. */
function unsubscribeTokenFor(userId) {
  const secret = process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'lachart-unsub';
  return crypto.createHmac('sha256', secret).update(String(userId)).digest('hex').slice(0, 24);
}

function unsubscribeUrlFor(userId) {
  const base = (process.env.SERVER_PUBLIC_URL || 'https://lachart.onrender.com').replace(/\/+$/, '');
  return `${base}/api/email/unsubscribe?u=${encodeURIComponent(String(userId))}&t=${unsubscribeTokenFor(userId)}`;
}

/** Has this (lean) user already received this issue? */
function alreadyGotIssue(user, issueId) {
  const map = user?.retentionEmails?.productUpdates;
  // lean() returns a Mongoose Map as a plain object; guard for either shape.
  if (!map) return false;
  if (typeof map.get === 'function') return !!map.get(issueId);
  return !!map[issueId];
}

/** Send one issue to one user. Returns { sent, reason }. */
async function sendOne(user, issueId, { dryRun = false } = {}) {
  if (!issueExists(issueId)) return { sent: false, reason: 'unknown_issue' };
  if (!user || !user.email) return { sent: false, reason: 'no_email' };
  if (user.isActive === false) return { sent: false, reason: 'inactive' };
  if (user.notifications?.emailNotifications === false) return { sent: false, reason: 'opted_out' };
  if (user.notifications?.marketingEmails === false) return { sent: false, reason: 'marketing_opted_out' };
  if (alreadyGotIssue(user, issueId)) return { sent: false, reason: 'already_sent' };

  const meta = loadMeta(issueId);
  const assets = listAssets(issueId);
  const html = prepareHtmlForRecipient(loadIssueHtml(issueId), {
    assets,
    unsubscribeUrl: unsubscribeUrlFor(user._id),
    utmCampaign: meta.utmCampaign,
  });
  const subject = meta.subject;
  const attachments = assets.map((file) => ({
    filename: file,
    path: path.join(issueDir(issueId), 'assets', file),
    cid: file,
  }));

  if (dryRun) return { sent: false, reason: 'dry_run', subject };

  const transporter = createEmailTransporter();
  if (!transporter) return { sent: false, reason: 'transporter_unavailable' };

  try {
    const sendInfo = await transporter.sendMail({
      from: { name: 'LaChart', address: process.env.EMAIL_USER },
      to: user.email,
      subject,
      html,
      attachments,
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
      console.error(`[productUpdate:${issueId}] ${user.email}: ${reason}`);
      return { sent: false, reason, smtp: { accepted, rejected, response: sendInfo?.response, messageId: sendInfo?.messageId } };
    }

    await User.updateOne(
      { _id: user._id },
      { $set: { [`${SENT_MAP}.${issueId}`]: new Date() } }
    );

    console.log(`[productUpdate:${issueId}] sent to ${user.email}`, {
      messageId: sendInfo?.messageId, response: sendInfo?.response, accepted, rejected,
    });
    return { sent: true, smtp: { accepted, rejected, response: sendInfo?.response, messageId: sendInfo?.messageId } };
  } catch (e) {
    const reason = (e && (e.message || e.reason || String(e))) || 'send_failed';
    console.error(`[productUpdate:${issueId}] failed to send to ${user.email}:`, reason, e?.code || '');
    return { sent: false, reason, smtp: { code: e?.code, command: e?.command, response: e?.response } };
  }
}

/** Mongo filter for users who still need this issue. */
function pendingFilter(issueId) {
  const field = `${SENT_MAP}.${issueId}`;
  return {
    email: { $exists: true, $ne: null, $ne: '' },
    isActive: { $ne: false },
    'notifications.emailNotifications': { $ne: false },
    'notifications.marketingEmails': { $ne: false },
    $or: [{ [field]: { $exists: false } }, { [field]: null }],
  };
}

async function findPendingUsers(issueId, limit) {
  return User.find(pendingFilter(issueId))
    .select('_id email name surname isActive notifications retentionEmails')
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
}

async function getPendingCount(issueId) {
  return User.countDocuments(pendingFilter(issueId));
}

/** Lightweight admin stats for one issue. */
async function getIssueStats(issueId) {
  const field = `${SENT_MAP}.${issueId}`;
  const [sent, pending, totalWithEmail] = await Promise.all([
    User.countDocuments({ [field]: { $ne: null, $exists: true } }),
    getPendingCount(issueId),
    User.countDocuments({ email: { $exists: true, $ne: null, $ne: '' } }),
  ]);
  const eligible = sent + pending;
  return {
    issueId,
    exists: issueExists(issueId),
    meta: issueExists(issueId) ? loadMeta(issueId) : null,
    sent,
    pending,
    eligible,
    totalWithEmail,
    progressPct: eligible > 0 ? Math.round((sent / eligible) * 100) : (sent > 0 ? 100 : 0),
  };
}

/**
 * Paced send of one issue. Same batching / Zoho-safe defaults as
 * whatsNewCampaignService — see that file for the throughput rationale.
 */
async function runCampaign({
  issueId,
  batchSize = 1,
  batchIntervalMs = 5 * 60 * 1000,
  maxBatches = 1000,
  maxEmailsPerRun = 20,
  dryRun = false,
  onProgress,
} = {}) {
  if (!issueExists(issueId)) {
    return { totalAttempted: 0, sent: 0, skipped: 0, failed: 0, byReason: { unknown_issue: 1 }, issueId };
  }
  const stats = { totalAttempted: 0, sent: 0, skipped: 0, failed: 0, byReason: {}, issueId };
  let batchIndex = 0;

  while (batchIndex < maxBatches) {
    if (maxEmailsPerRun != null && stats.sent >= maxEmailsPerRun) {
      console.log(`[productUpdate:${issueId}] reached maxEmailsPerRun=${maxEmailsPerRun}, pausing`);
      break;
    }
    const slotsLeft = maxEmailsPerRun != null ? Math.max(0, maxEmailsPerRun - stats.sent) : batchSize;
    const fetchLimit = Math.min(batchSize, slotsLeft || batchSize);
    const users = await findPendingUsers(issueId, fetchLimit);
    if (users.length === 0) break;

    const results = await Promise.allSettled(users.map((u) => sendOne(u, issueId, { dryRun })));
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
      try { onProgress({ batchIndex, batchSize: users.length, stats }); } catch { /* ignore */ }
    }
    console.log(`[productUpdate:${issueId}] batch ${batchIndex}: attempted=${users.length} sent=${stats.sent} skipped=${stats.skipped} failed=${stats.failed}`);

    if (dryRun) break;
    await new Promise((resolve) => setTimeout(resolve, batchIntervalMs));
  }

  console.log(`[productUpdate:${issueId}] finished:`, stats);
  return stats;
}

/** Clear the sent-marker for one issue (everyone, or a single email) so it can
 *  be re-sent. The "I shipped a typo, redo it" knob — use carefully. */
async function resetIssue(issueId, { email = null } = {}) {
  const field = `${SENT_MAP}.${issueId}`;
  const filter = email ? { email: String(email).toLowerCase().trim() } : {};
  const result = await User.updateMany(filter, { $unset: { [field]: '' } });
  return { issueId, matched: result.matchedCount ?? result.n, modified: result.modifiedCount ?? result.nModified };
}

module.exports = {
  isValidIssueId,
  issueExists,
  listIssues,
  loadMeta,
  listAssets,
  getActiveIssueId,
  getScheduledIssueId,
  sendOne,
  findPendingUsers,
  getPendingCount,
  getIssueStats,
  runCampaign,
  resetIssue,
};
