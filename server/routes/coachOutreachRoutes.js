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

const SEGMENTS = ['coach', 'coach-solo', 'athlete', 'untested', 'others'];
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

// POST /api/admin/coach-outreach/send-to-user/:userId — same letter, reached
// from the user list instead of the Coach Leads tabs. There you have a person
// and no segment, so resolve it first and let the pitch follow the person.
// Deliberately not folded into /send/:userId: that route's segment comes from
// the tab you are looking at, and silently overriding it would make the preview
// you just read stop matching what goes out.
router.post('/send-to-user/:userId', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const match = await outreach.findSegmentForUser(req.params.userId);
    // No segment is not a refusal here. The four segments exist to aim a batch;
    // one admin clicking Send on one named row has already done the aiming, so
    // fall back to the catch-all letter — same plan and feature rundown, worded
    // for whatever the account actually has.
    const person = match ? match.person : await outreach.buildFallbackPerson(req.params.userId);
    if (!person) return res.status(404).json({ sent: false, reason: 'user_not_found' });

    const result = await outreach.sendToPerson(person, { force: req.body?.force === true });
    const body = { ...result, segment: person.segment, matchedSegment: Boolean(match) };
    if (!result.sent) return res.status(409).json(body);
    res.json(body);
  } catch (e) {
    console.error('[CoachOutreach] send-to-user failed:', e);
    res.status(500).json({ error: 'Send failed', message: e.message });
  }
});

// POST /api/admin/coach-outreach/send-batch — { segment, userIds[] }
// Sends to an explicitly chosen list, spaced out, server-side so it keeps
// going after the admin closes the tab. One run at a time.
router.post('/send-batch', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    const ids = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
    if (!ids.length) return res.status(400).json({ error: 'No recipients selected' });
    const job = outreach.startBatch(segmentOf(req), ids, {
      gapMs: req.body?.gapMs ? Number(req.body.gapMs) : undefined,
    });
    if (job.error === 'already_running') {
      return res.status(409).json({ error: 'A batch is already running', ...job });
    }
    res.json(job);
  } catch (e) {
    console.error('[CoachOutreach] batch start failed:', e);
    res.status(500).json({ error: 'Failed to start batch', message: e.message });
  }
});

// GET /api/admin/coach-outreach/batch-status — progress of the current run.
router.get('/batch-status', verifyToken, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;
    res.json(outreach.batchSnapshot());
  } catch (e) {
    res.status(500).json({ error: 'Failed to read batch status', message: e.message });
  }
});

module.exports = router;
