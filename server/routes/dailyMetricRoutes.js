/**
 * dailyMetricRoutes.js — the athlete's own daily numbers.
 *
 * Weight, morning pulse, sleep, hours at work, steps, how the day felt. What a
 * device cannot know, or knows worse than the person does.
 */

'use strict';

const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const DailyMetric = require('../models/DailyMetric');
const { isCoachLikeRole, athleteHasCoachUser } = require('../utils/athleteCoachAccess');

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400;

/**
 * Whose log is being read or written.
 *
 * An athlete only ever reaches their own. A coach reaches an athlete on their
 * own team and nobody else's — checked against the link, not against the role,
 * because a coach is not an admin.
 */
async function resolveAthlete(req, res) {
  const viewer = await User.findById(req.user.userId).select('role coachId coaches coachIds');
  if (!viewer) { res.status(401).json({ error: 'User not found' }); return null; }

  const requested = String(req.query.athleteId || req.body?.athleteId || '').trim();
  const self = String(viewer._id);
  if (!requested || requested === self) return self;

  if (!isCoachLikeRole(viewer.role)) { res.status(403).json({ error: 'Access denied' }); return null; }
  const athlete = await User.findById(requested).select('coachId coaches coachIds');
  if (!athlete) { res.status(404).json({ error: 'Athlete not found' }); return null; }
  if (!athleteHasCoachUser(athlete, self)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return requested;
}

/** Only the fields this log owns, and only when they were actually sent. */
function sanitize(body) {
  const out = {};
  const num = (key, min, max) => {
    if (!(key in body)) return;
    const raw = body[key];
    if (raw === null || raw === '') { out[key] = null; return; }
    const n = Number(raw);
    // Out of range is a typo, not a measurement — 705 kg is a slipped decimal
    // point, and storing it would poison every average drawn from this log.
    if (Number.isFinite(n) && n >= min && n <= max) out[key] = n;
  };

  num('weightKg', 20, 300);
  num('morningPulse', 20, 140);
  num('sleepMinutes', 0, 1440);
  num('workMinutes', 0, 1440);
  num('steps', 0, 200000);
  num('systolic', 50, 260);
  num('diastolic', 30, 200);
  num('cycleDay', 1, 60);

  if ('feeling' in body) {
    const v = body.feeling;
    out.feeling = ['great', 'good', 'ok', 'tired', 'bad'].includes(v) ? v : null;
  }
  if ('notes' in body) out.notes = String(body.notes ?? '').slice(0, 2000);

  return out;
}

/** GET /api/daily-metrics?athleteId&start=YYYY-MM-DD&end=YYYY-MM-DD */
router.get('/', verifyToken, async (req, res) => {
  try {
    const athleteId = await resolveAthlete(req, res);
    if (!athleteId) return undefined;

    const start = String(req.query.start || '').slice(0, 10);
    const end = String(req.query.end || '').slice(0, 10);
    if (!DAY.test(start) || !DAY.test(end) || end < start) {
      return res.status(400).json({ error: 'Invalid start/end' });
    }
    const span = (new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000;
    if (span > MAX_RANGE_DAYS) return res.status(400).json({ error: `Range exceeds ${MAX_RANGE_DAYS} days` });

    const rows = await DailyMetric.find({ athleteId, date: { $gte: start, $lte: end } })
      .sort({ date: 1 })
      .lean();
    return res.json(rows);
  } catch (error) {
    console.error('Error reading daily metrics:', error);
    return res.status(500).json({ error: 'Failed to read daily metrics' });
  }
});

/**
 * PUT /api/daily-metrics/:date
 *
 * An upsert rather than a create: the same morning written twice is an edit.
 * Only the fields present in the body are touched, so a card that offers three
 * of them cannot blank the other four.
 */
router.put('/:date', verifyToken, async (req, res) => {
  try {
    const date = String(req.params.date || '').slice(0, 10);
    if (!DAY.test(date)) return res.status(400).json({ error: 'Invalid date' });

    const athleteId = await resolveAthlete(req, res);
    if (!athleteId) return undefined;

    const $set = sanitize(req.body || {});
    if (!Object.keys($set).length) return res.status(400).json({ error: 'Nothing to save' });
    $set.enteredBy = req.user.userId;

    const saved = await DailyMetric.findOneAndUpdate(
      { athleteId, date },
      { $set, $setOnInsert: { athleteId, date } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return res.json(saved);
  } catch (error) {
    console.error('Error saving daily metric:', error);
    return res.status(500).json({ error: 'Failed to save daily metric' });
  }
});

/** DELETE /api/daily-metrics/:date — an entry made by mistake. */
router.delete('/:date', verifyToken, async (req, res) => {
  try {
    const date = String(req.params.date || '').slice(0, 10);
    if (!DAY.test(date)) return res.status(400).json({ error: 'Invalid date' });
    const athleteId = await resolveAthlete(req, res);
    if (!athleteId) return undefined;
    await DailyMetric.deleteOne({ athleteId, date });
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting daily metric:', error);
    return res.status(500).json({ error: 'Failed to delete daily metric' });
  }
});

module.exports = router;
