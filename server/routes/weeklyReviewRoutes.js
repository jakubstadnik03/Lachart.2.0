/**
 * weeklyReviewRoutes.js
 *
 * An athlete's write-up of a training week, surfaced on that week's Sunday in
 * the calendar. Coaches on the athlete's team can read and add to it — the
 * Friday review request comes from a coach, so the reply has to be visible to
 * them.
 */

'use strict';

const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const WeeklyReview = require('../models/WeeklyReview');

/** Same access rule as race events: yourself, or an athlete on your team. */
async function resolveAthleteId(req) {
  const userId = String(req.user?.userId || '');
  const param = req.query.athleteId || req.body?.athleteId;
  if (!param || ['null', 'undefined', ''].includes(String(param).trim()) || String(param) === userId) {
    return { ok: true, athleteId: userId, viewerIsCoach: false };
  }
  const me = await User.findById(userId).select('role admin').lean();
  const isCoachLike = me && (['coach', 'tester', 'testing', 'admin'].includes(me.role) || me.admin);
  if (!isCoachLike) return { ok: false, code: 403, msg: 'Not allowed' };
  const athlete = await User.findById(param).select('coachId coachIds').lean();
  if (!athlete) return { ok: false, code: 404, msg: 'Athlete not found' };
  const coaches = [
    ...(Array.isArray(athlete.coachIds) ? athlete.coachIds.map(String) : []),
    ...(athlete.coachId ? [String(athlete.coachId)] : []),
  ];
  if (!coaches.includes(userId)) return { ok: false, code: 403, msg: 'Athlete not in your team' };
  return { ok: true, athleteId: String(param), viewerIsCoach: true };
}

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/weekly-reviews?athleteId=&from=&to=
// Range fetch so the calendar can load a month in one request.
router.get('/', verifyToken, async (req, res) => {
  try {
    const r = await resolveAthleteId(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });

    const q = { athleteId: r.athleteId };
    const { from, to } = req.query;
    if (WEEK_RE.test(String(from || '')) || WEEK_RE.test(String(to || ''))) {
      q.weekStart = {};
      if (WEEK_RE.test(String(from || ''))) q.weekStart.$gte = String(from);
      if (WEEK_RE.test(String(to || ''))) q.weekStart.$lte = String(to);
    }
    const reviews = await WeeklyReview.find(q).sort({ weekStart: -1 }).lean();
    res.json(reviews);
  } catch (e) {
    console.error('[WeeklyReview] list failed:', e);
    res.status(500).json({ error: 'Failed to load weekly reviews', message: e.message });
  }
});

// PUT /api/weekly-reviews/:weekStart — upsert. One review per athlete per week.
router.put('/:weekStart', verifyToken, async (req, res) => {
  try {
    const { weekStart } = req.params;
    if (!WEEK_RE.test(String(weekStart))) {
      return res.status(400).json({ error: 'weekStart must be YYYY-MM-DD (Monday)' });
    }
    const r = await resolveAthleteId(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });

    const text = String(req.body?.text ?? '').slice(0, 5000);
    const ratingRaw = req.body?.rating;
    const rating = ratingRaw == null || ratingRaw === ''
      ? null
      : Math.min(5, Math.max(1, Number(ratingRaw))) || null;

    // Empty text with no rating means "delete" — otherwise clearing a note
    // would leave an empty bubble sitting on the calendar forever.
    if (!text.trim() && rating == null) {
      await WeeklyReview.deleteOne({ athleteId: r.athleteId, weekStart });
      return res.json({ deleted: true, weekStart });
    }

    const review = await WeeklyReview.findOneAndUpdate(
      { athleteId: r.athleteId, weekStart },
      {
        $set: {
          text,
          rating,
          authorId: req.user.userId,
          authorRole: r.viewerIsCoach ? 'coach' : 'athlete',
        },
        $setOnInsert: { athleteId: r.athleteId, weekStart },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    res.json(review);
  } catch (e) {
    console.error('[WeeklyReview] save failed:', e);
    res.status(500).json({ error: 'Failed to save weekly review', message: e.message });
  }
});

// DELETE /api/weekly-reviews/:weekStart
router.delete('/:weekStart', verifyToken, async (req, res) => {
  try {
    const r = await resolveAthleteId(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });
    await WeeklyReview.deleteOne({ athleteId: r.athleteId, weekStart: req.params.weekStart });
    res.json({ deleted: true });
  } catch (e) {
    console.error('[WeeklyReview] delete failed:', e);
    res.status(500).json({ error: 'Failed to delete weekly review', message: e.message });
  }
});

module.exports = router;
