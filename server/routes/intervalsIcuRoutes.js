/**
 * /api/integrations/intervals-icu
 *
 * Connect an athlete's intervals.icu account so LaChart can push planned
 * workouts there — and, via intervals.icu's own Garmin and Zwift connections,
 * onward to their watch. See services/intervalsIcuClient.js for why this
 * indirection is necessary.
 */
const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const { requireFeature } = require('../middleware/featureGate');
const User = require('../models/UserModel');
const { encryptSecret, isSecretBoxConfigured } = require('../utils/secretBox');
const { verifyKey, describeError } = require('../services/intervalsIcuClient');
const { pushWindow } = require('../services/intervalsIcuPushService');

const requirePlanWorkouts = requireFeature('plan_workouts');

/** GET /status — is this athlete connected, and did the last push work? */
router.get('/status', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('intervalsIcu').lean();
    const cfg = user?.intervalsIcu || {};
    res.json({
      connected: Boolean(cfg.apiKey),
      athleteId: cfg.athleteId || null,
      autoPush: cfg.autoPush !== false,
      connectedAt: cfg.connectedAt || null,
      lastPushAt: cfg.lastPushAt || null,
      lastPushError: cfg.lastPushError || null,
      // Without a configured key we cannot store the credential at all.
      canConnect: isSecretBoxConfigured(),
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read intervals.icu status' });
  }
});

/** POST /connect { apiKey } — verify the key, then store it encrypted. */
router.post('/connect', verifyToken, requirePlanWorkouts, async (req, res) => {
  const apiKey = String(req.body?.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'apiKey is required' });

  if (!isSecretBoxConfigured()) {
    return res.status(503).json({
      error: 'Secret storage is not configured on the server (SECRET_BOX_KEY). '
           + 'Refusing to store your API key unencrypted.',
    });
  }

  // Verify before storing — a typo'd key should fail here, not silently at the
  // first workout push.
  let profile;
  try {
    profile = await verifyKey(apiKey);
  } catch (err) {
    return res.status(400).json({ error: describeError(err) });
  }

  try {
    await User.findByIdAndUpdate(req.user.userId, {
      $set: {
        'intervalsIcu.apiKey': encryptSecret(apiKey),
        'intervalsIcu.athleteId': profile.athleteId || null,
        'intervalsIcu.autoPush': true,
        'intervalsIcu.connectedAt': new Date(),
        'intervalsIcu.lastPushError': null,
      },
    });
    res.json({ connected: true, athleteId: profile.athleteId, name: profile.name });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save intervals.icu connection' });
  }
});

/** PUT /auto-push { enabled } */
router.put('/auto-push', verifyToken, async (req, res) => {
  try {
    const enabled = req.body?.enabled !== false;
    await User.findByIdAndUpdate(req.user.userId, {
      $set: { 'intervalsIcu.autoPush': enabled },
    });
    res.json({ autoPush: enabled });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

/** POST /sync — push the coming weeks now (also used right after connecting). */
router.post('/sync', verifyToken, requirePlanWorkouts, async (req, res) => {
  try {
    const result = await pushWindow(req.user.userId, {
      from: req.body?.from,
      to: req.body?.to,
    });
    if (result.skipped === 'not_connected') {
      return res.status(400).json({ error: 'intervals.icu is not connected' });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to sync to intervals.icu' });
  }
});

/** POST /disconnect */
router.post('/disconnect', verifyToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, {
      $set: {
        'intervalsIcu.apiKey': null,
        'intervalsIcu.athleteId': null,
        'intervalsIcu.connectedAt': null,
        'intervalsIcu.lastPushAt': null,
        'intervalsIcu.lastPushError': null,
      },
    });
    res.json({ connected: false });
  } catch (e) {
    res.status(500).json({ error: 'Failed to disconnect intervals.icu' });
  }
});

module.exports = router;
