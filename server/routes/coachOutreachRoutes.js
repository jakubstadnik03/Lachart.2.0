/**
 * coachOutreachRoutes.js
 *
 * Admin-only tooling for personally emailing coaches who are already past the
 * free plan's athlete limit. Every send is one explicit click on one named
 * person, after the admin has seen the exact rendered email.
 *
 * There is deliberately no batch endpoint: this list is the most qualified
 * group in the database and a blast would burn the one chance to convert them.
 */

'use strict';

const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const outreach = require('../services/coachOutreachService');

async function requireAdmin(req, res) {
  const me = await User.findById(req.user.userId).select('admin role email').lean();
  if (!me || !(me.admin === true || String(me.role || '').toLowerCase() === 'admin')) {
    res.status(403).json({ error: 'Admin only' });
    return null;
  }
  return me;
}

const SEGMENTS = ['coach', 'athlete', 'untested'];
/** Anything unrecognised falls back to coach. */
function segmentOf(req) {
  const s = String(req.query.segment || req.body?.segment || 'coach');
  return SEGMENTS.includes(s) ? s : 'coach';
}

// GET /api/admin/coach-outreach/candidates?segment=coach|athlete
router.get('/candidates', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const segment = segmentOf(req);
    const minAthletes = req.query.minAthletes ? Number(req.query.minAthletes) : undefined;
    const [people, stats] = await Promise.all([
      outreach.findCandidates(segment, minAthletes ? { minAthletes } : {}),
      outreach.getOutreachStats(segment),
    ]);
    // `coaches` kept alongside `people` so an older cached bundle keeps working.
    res.json({ segment, stats, people, coaches: people });
  } catch (e) {
    console.error('[CoachOutreach] candidates failed:', e);
    res.status(500).json({ error: 'Failed to load candidates', message: e.message });
  }
});

// GET /api/admin/coach-outreach/preview/:userId — exact HTML that would be sent.
router.get('/preview/:userId', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const preview = await outreach.renderPreview(segmentOf(req), req.params.userId);
    if (!preview) return res.status(404).json({ error: 'Not a qualified recipient' });
    res.json(preview);
  } catch (e) {
    console.error('[CoachOutreach] preview failed:', e);
    res.status(500).json({ error: 'Failed to render preview', message: e.message });
  }
});

// POST /api/admin/coach-outreach/test/:userId — send that coach's email to the
// admin's own inbox, so the real thing can be checked before a coach sees it.
// Does not mark the coach as contacted.
router.post('/test/:userId', verifyToken, async (req, res) => {
  try {
    const me = await requireAdmin(req, res);
    if (!me) return;
    const result = await outreach.sendOutreach(segmentOf(req), req.params.userId, { overrideEmail: me.email, force: true });
    res.json({ ...result, testTo: me.email });
  } catch (e) {
    console.error('[CoachOutreach] test send failed:', e);
    res.status(500).json({ error: 'Test send failed', message: e.message });
  }
});

// POST /api/admin/coach-outreach/send/:userId — the real send, one coach.
router.post('/send/:userId', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const result = await outreach.sendOutreach(segmentOf(req), req.params.userId, { force: req.body?.force === true });
    if (!result.sent) return res.status(409).json(result);
    res.json(result);
  } catch (e) {
    console.error('[CoachOutreach] send failed:', e);
    res.status(500).json({ error: 'Send failed', message: e.message });
  }
});

module.exports = router;
