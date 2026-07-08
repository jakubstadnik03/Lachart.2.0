/**
 * Mass-mail campaigns + unsubscribe handling.
 *
 * Admin-only triggers for one-off product-update campaigns (currently:
 * "What's new — May 2026"), plus the public unsubscribe endpoint that
 * verifies the signed token from the email's List-Unsubscribe header and
 * flips the user's email-notifications switch off.
 */

const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const {
  runCampaign,
  findPendingUsers,
  getPendingCount,
  sendOne,
  verifyUnsubscribeToken,
  CAMPAIGN_KEY,
} = require('../services/whatsNewCampaignService');

// iOS launch campaign (June 2026) — same shape, separate state key so
// re-running the May campaign doesn't double-send to anyone who already
// got the launch email and vice versa.
const ios = require('../services/iosLaunchCampaignService');
const appReeng = require('../services/appReengagementCampaignService');

async function requireAdmin(req, res) {
  const me = await User.findById(req.user.userId).select('admin role').lean();
  if (!me || !(me.admin === true || String(me.role || '').toLowerCase() === 'admin')) {
    res.status(403).json({ error: 'Admin only' });
    return null;
  }
  return me;
}

// GET /api/email/campaigns/whats-new-2026-05/status
// How many users still pending + how many already received it.
router.get('/campaigns/whats-new-2026-05/status', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const [pending, sent, totalEligible] = await Promise.all([
      getPendingCount(),
      User.countDocuments({ [`retentionEmails.${CAMPAIGN_KEY}`]: { $ne: null, $exists: true } }),
      User.countDocuments({
        email: { $exists: true, $ne: null, $ne: '' },
        isActive: { $ne: false },
        'notifications.emailNotifications': { $ne: false },
      }),
    ]);
    res.json({ pending, sent, totalEligible });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/email/campaigns/whats-new-2026-05/preview
// Send the email to a single recipient (yourself or specified `email`) so you
// can sanity-check the rendered template before mass-blasting. Does NOT mark
// the recipient as sent — the campaign still queues them up.
router.post('/campaigns/whats-new-2026-05/preview', verifyToken, async (req, res) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;
    const targetEmail = (req.body?.email || '').toLowerCase().trim();
    const recipient = targetEmail
      ? await User.findOne({ email: targetEmail }).lean()
      : await User.findById(req.user.userId).lean();
    if (!recipient || !recipient.email) {
      return res.status(404).json({ error: 'No matching user with an email address' });
    }
    // Temporarily clear the sent-marker on a copy so sendOne actually sends.
    const draft = { ...recipient, retentionEmails: { ...(recipient.retentionEmails || {}), [CAMPAIGN_KEY]: null } };
    const result = await sendOne(draft);
    // Roll back the sent-marker the service just wrote — preview shouldn't
    // count toward the campaign.
    if (result.sent) {
      await User.updateOne(
        { _id: recipient._id },
        { $set: { [`retentionEmails.${CAMPAIGN_KEY}`]: null } }
      );
    }
    res.json({ to: recipient.email, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/email/campaigns/whats-new-2026-05/run
// Body: { batchSize?: number, batchIntervalMs?: number, maxBatches?: number, dryRun?: boolean }
// Defaults are conservative — see whatsNewCampaignService for the rationale.
// The request blocks for the duration of the campaign so the admin can
// see the final stats; clients should set a generous timeout.
router.post('/campaigns/whats-new-2026-05/run', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const {
      batchSize = 1,
      batchIntervalMs = 5 * 60 * 1000,
      maxBatches = 1000,
      maxEmailsPerRun = 20,
      dryRun = false,
    } = req.body || {};

    const stats = await runCampaign({
      batchSize: Math.max(1, Math.min(50, Number(batchSize) || 1)),
      batchIntervalMs: Math.max(5_000, Number(batchIntervalMs) || 5 * 60_000),
      maxBatches: Math.max(1, Math.min(10_000, Number(maxBatches) || 1000)),
      maxEmailsPerRun: maxEmailsPerRun === null ? null : Math.max(1, Math.min(1000, Number(maxEmailsPerRun) || 20)),
      dryRun: !!dryRun,
    });
    res.json({ ok: true, stats });
  } catch (e) {
    console.error('[whatsNewCampaign run] error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/email/campaigns/whats-new-2026-05/reset
// Clears the sent-marker for everyone (or a specific email) so the campaign
// can be re-sent. Use carefully — this is the "I made a typo, redo it" knob.
router.post('/campaigns/whats-new-2026-05/reset', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const targetEmail = (req.body?.email || '').toLowerCase().trim();
    const filter = targetEmail ? { email: targetEmail } : {};
    const result = await User.updateMany(filter, {
      $set: { [`retentionEmails.${CAMPAIGN_KEY}`]: null },
    });
    res.json({ matched: result.matchedCount, modified: result.modifiedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── iOS launch campaign (Jun 2026) — admin endpoints ───────────────────────
//
// Mirrors the May-2026 endpoints exactly, just with a different prefix and
// service module. Keep the two sets of routes side-by-side so it's obvious
// which campaign each one drives.

router.get('/campaigns/ios-launch-2026-06/status', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const [pending, sent, totalEligible] = await Promise.all([
      ios.getPendingCount(),
      User.countDocuments({ [`retentionEmails.${ios.CAMPAIGN_KEY}`]: { $ne: null, $exists: true } }),
      User.countDocuments({
        email: { $exists: true, $ne: null, $ne: '' },
        isActive: { $ne: false },
        'notifications.emailNotifications': { $ne: false },
      }),
    ]);
    res.json({ pending, sent, totalEligible });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/campaigns/ios-launch-2026-06/preview', verifyToken, async (req, res) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;
    const targetEmail = (req.body?.email || '').toLowerCase().trim();
    const recipient = targetEmail
      ? await User.findOne({ email: targetEmail }).lean()
      : await User.findById(req.user.userId).lean();
    if (!recipient || !recipient.email) {
      return res.status(404).json({ error: 'No matching user with an email address' });
    }
    const draft = { ...recipient, retentionEmails: { ...(recipient.retentionEmails || {}), [ios.CAMPAIGN_KEY]: null } };
    const result = await ios.sendOne(draft);
    if (result.sent) {
      await User.updateOne(
        { _id: recipient._id },
        { $set: { [`retentionEmails.${ios.CAMPAIGN_KEY}`]: null } }
      );
    }
    res.json({ to: recipient.email, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/campaigns/ios-launch-2026-06/run', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const {
      batchSize = 1,
      batchIntervalMs = 5 * 60 * 1000,
      maxBatches = 1000,
      maxEmailsPerRun = 20,
      dryRun = false,
    } = req.body || {};

    const stats = await ios.runCampaign({
      batchSize: Math.max(1, Math.min(50, Number(batchSize) || 1)),
      batchIntervalMs: Math.max(5_000, Number(batchIntervalMs) || 5 * 60_000),
      maxBatches: Math.max(1, Math.min(10_000, Number(maxBatches) || 1000)),
      maxEmailsPerRun: maxEmailsPerRun === null ? null : Math.max(1, Math.min(1000, Number(maxEmailsPerRun) || 20)),
      dryRun: !!dryRun,
    });
    res.json({ ok: true, stats });
  } catch (e) {
    console.error('[iosLaunchCampaign run] error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/campaigns/ios-launch-2026-06/reset', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const targetEmail = (req.body?.email || '').toLowerCase().trim();
    const filter = targetEmail ? { email: targetEmail } : {};
    const result = await User.updateMany(filter, {
      $set: { [`retentionEmails.${ios.CAMPAIGN_KEY}`]: null },
    });
    res.json({ matched: result.matchedCount, modified: result.modifiedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── App re-engagement drip (automated + admin preview) ─────────────────────

router.get('/campaigns/app-reengagement/status', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const stats = await appReeng.getCampaignStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/campaigns/app-reengagement/preview', verifyToken, async (req, res) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;
    const step = Math.max(1, Math.min(3, Number(req.body?.step) || 1));
    const targetEmail = (req.body?.email || '').toLowerCase().trim();
    const recipient = targetEmail
      ? await User.findOne({ email: targetEmail }).lean()
      : await User.findById(req.user.userId).lean();
    if (!recipient?.email) {
      return res.status(404).json({ error: 'No matching user with an email address' });
    }
    const result = await appReeng.sendStep(recipient, step, { track: false, preview: true });
    res.json({ to: recipient.email, step, preview: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/campaigns/app-reengagement/run-tick', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const { tick } = require('../services/appReengagementScheduler');
    await tick();
    const stats = await appReeng.getCampaignStats();
    res.json({ ok: true, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/campaigns/app-reengagement/reset', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const targetEmail = (req.body?.email || '').toLowerCase().trim();
    const filter = targetEmail ? { email: targetEmail } : {};
    const result = await User.updateMany(filter, {
      $set: {
        'retentionEmails.appReengagementStep1Sent': null,
        'retentionEmails.appReengagementStep2Sent': null,
        'retentionEmails.appReengagementStep3Sent': null,
      },
    });
    res.json({ matched: result.matchedCount, modified: result.modifiedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Public unsubscribe — no auth, only the signed token. ────────────────────
//
// Both GET (clickable link in the email body) and POST (Gmail / Apple Mail
// "List-Unsubscribe-Post: One-Click" header) are wired. Either turns off
// the user's email-notifications flag and renders a confirmation page.
async function handleUnsubscribe(req, res) {
  const userId = req.query?.u || req.body?.u;
  const token = req.query?.t || req.body?.t;
  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return res.status(400).send(`<html><body style="font-family:system-ui,sans-serif;padding:24px;color:#1D2C4C">
      <h2>Invalid unsubscribe link</h2>
      <p>The link is malformed or expired. You can also manage email preferences from LaChart → Settings → Notifications.</p>
    </body></html>`);
  }
  try {
    await User.updateOne(
      { _id: userId },
      { $set: { 'notifications.emailNotifications': false } }
    );
    return res.status(200).send(`<html><body style="font-family:system-ui,sans-serif;padding:24px;color:#1D2C4C;max-width:560px;margin:0 auto">
      <h2 style="margin-top:0">You've been unsubscribed</h2>
      <p>You won't receive LaChart product-update or marketing emails anymore. Transactional emails (password resets, security alerts) will still reach you.</p>
      <p>Change your mind? Re-enable email in LaChart → Settings → Notifications.</p>
    </body></html>`);
  } catch (e) {
    console.error('[unsubscribe] DB error:', e);
    return res.status(500).send('Server error. Try again later.');
  }
}

router.get('/unsubscribe', handleUnsubscribe);
router.post('/unsubscribe', handleUnsubscribe);

module.exports = router;
