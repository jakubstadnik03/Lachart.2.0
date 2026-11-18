/**
 * wellnessCheckInRoutes.js - the athlete's daily wellness check-in and the
 * coach's view of it.
 *
 * The athlete answers; the athlete's coaches read it and decide how often it
 * is asked. Unlike injury episodes there is no per-report visibility switch:
 * this report exists to be read by the coach, and the form tells the athlete
 * so before they answer.
 *
 * Scores, bands, deltas and the due rule live in utils/wellnessScore.js, so
 * the client only renders what it is given.
 */

'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const WellnessCheckIn = require('../models/WellnessCheckIn');
const { isCoachLikeRole, athleteHasCoachUser, athleteCoachIdSet } = require('../utils/athleteCoachAccess');
const {
  AREA_KEYS, scaleValue, scoreBand, areaDeltas, isDue, normalizeFrequency, daysBetween,
} = require('../utils/wellnessScore');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TREND_DAYS = 14;

function utcTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysKey(key, n) {
  const d = new Date(`${String(key).slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isDateKey(value) {
  const s = String(value == null ? '' : value).trim();
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * The athlete's own "today". The server clock is UTC and the athlete's is not,
 * so the client sends its local date; anything more than a day either side of
 * UTC is a wrong clock, not a timezone, and falls back to UTC.
 */
function viewerToday(raw) {
  const utc = utcTodayKey();
  if (!isDateKey(raw)) return utc;
  const gap = daysBetween(utc, raw);
  return gap != null && Math.abs(gap) <= 1 ? String(raw) : utc;
}

/** Same team rule as healthRoutes: own data, or an athlete on your team. */
async function resolveAthlete(req) {
  const userId = String(req.user?.userId || '');
  const param = req.query.athleteId || req.body?.athleteId;
  if (!param || ['null', 'undefined', ''].includes(String(param).trim()) || String(param) === userId) {
    const self = await User.findById(userId).select('coachId coachIds wellnessCheckIn').lean();
    if (!self) return { ok: false, code: 404, msg: 'User not found' };
    return { ok: true, athleteId: userId, viewerIsCoach: false, athlete: self };
  }
  if (!mongoose.isValidObjectId(param)) return { ok: false, code: 400, msg: 'Invalid athleteId' };
  const me = await User.findById(userId).select('role admin').lean();
  const coachLike = me && (isCoachLikeRole(me.role) || me.role === 'admin' || me.admin);
  if (!coachLike) return { ok: false, code: 403, msg: 'Not allowed' };
  const athlete = await User.findById(param).select('coachId coachIds wellnessCheckIn').lean();
  if (!athlete) return { ok: false, code: 404, msg: 'Athlete not found' };
  if (!athleteHasCoachUser(athlete, userId)) {
    return { ok: false, code: 403, msg: 'Athlete not in your team' };
  }
  return { ok: true, athleteId: String(param), viewerIsCoach: true, athlete };
}

/**
 * Frequency belongs to the coach. An athlete with no coach has nobody to set
 * it for them, so they may set their own.
 */
function maySetFrequency(r) {
  return r.viewerIsCoach || athleteCoachIdSet(r.athlete).size === 0;
}

function shapeFrequency(stored) {
  const { mode, everyDays } = normalizeFrequency(stored);
  return {
    mode,
    everyDays,
    setBy: stored?.setBy ? String(stored.setBy) : null,
    updatedAt: stored?.updatedAt || null,
  };
}

// GET /api/wellness-check-ins/summary?athleteId=&today=YYYY-MM-DD
// Everything the card needs in one round-trip.
router.get('/summary', verifyToken, async (req, res) => {
  try {
    const r = await resolveAthlete(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });

    const today = viewerToday(req.query.today);
    const since = addDaysKey(today, -(TREND_DAYS - 1));

    // The latest two decide "today" and "change since last time" even when the
    // previous one is older than the chart window.
    const [lastTwo, rows] = await Promise.all([
      WellnessCheckIn.find({ athleteId: r.athleteId }).sort({ date: -1 }).limit(2).lean(),
      WellnessCheckIn.find({ athleteId: r.athleteId, date: { $gte: since } }).sort({ date: 1 }).lean(),
    ]);
    const [latest = null, previous = null] = lastTwo;
    const frequency = shapeFrequency(r.athlete.wellnessCheckIn);

    return res.json({
      today,
      trendFrom: since,
      viewerIsCoach: r.viewerIsCoach,
      canSetFrequency: maySetFrequency(r),
      frequency,
      due: isDue(frequency, latest?.date || null, today),
      latest,
      previous,
      band: scoreBand(latest?.score),
      deltas: areaDeltas(latest, previous),
      rows,
    });
  } catch (e) {
    console.error('[Wellness] summary failed:', e);
    return res.status(500).json({ error: 'Failed to load wellness check-ins', message: e.message });
  }
});

// GET /api/wellness-check-ins?athleteId=&days=90 - plain history.
router.get('/', verifyToken, async (req, res) => {
  try {
    const r = await resolveAthlete(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 90));
    const since = addDaysKey(viewerToday(req.query.today), -(days - 1));
    const rows = await WellnessCheckIn.find({ athleteId: r.athleteId, date: { $gte: since } })
      .sort({ date: 1 }).lean();
    return res.json(rows);
  } catch (e) {
    console.error('[Wellness] list failed:', e);
    return res.status(500).json({ error: 'Failed to load wellness check-ins', message: e.message });
  }
});

// PUT /api/wellness-check-ins - the athlete answers for a day (default today).
router.put('/', verifyToken, async (req, res) => {
  try {
    const r = await resolveAthlete(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });
    if (r.viewerIsCoach) {
      return res.status(403).json({ error: 'Only the athlete can submit a wellness check-in' });
    }

    const b = req.body || {};
    const today = viewerToday(b.today);
    const date = b.date == null || b.date === '' ? today : String(b.date).trim();
    if (!isDateKey(date)) {
      return res.status(400).json({ error: 'date must be a real calendar day in YYYY-MM-DD form' });
    }
    if (date > addDaysKey(utcTodayKey(), 1)) {
      return res.status(400).json({ error: 'A check-in cannot be dated in the future' });
    }

    const answers = {};
    for (const key of AREA_KEYS) {
      const v = scaleValue(b[key]);
      if (v == null) return res.status(400).json({ error: `${key} must be a whole number from 1 to 5` });
      answers[key] = v;
    }

    const linked = b.linkedEpisodeId && mongoose.isValidObjectId(b.linkedEpisodeId)
      ? b.linkedEpisodeId : null;

    let doc = await WellnessCheckIn.findOne({ athleteId: r.athleteId, date });
    if (!doc) doc = new WellnessCheckIn({ athleteId: r.athleteId, date });
    Object.assign(doc, answers, {
      pain: Boolean(b.pain),
      illness: Boolean(b.illness),
      note: String(b.note || '').trim().slice(0, 500),
    });
    // Answering again without the hand-off keeps the episode it was linked to.
    if (linked) doc.linkedEpisodeId = linked;
    // save() runs the hook that stores the score; findOneAndUpdate would not.
    await doc.save();

    return res.json({ checkIn: doc.toObject(), band: scoreBand(doc.score) });
  } catch (e) {
    console.error('[Wellness] save failed:', e);
    return res.status(500).json({ error: 'Failed to save wellness check-in', message: e.message });
  }
});

// PATCH /api/wellness-check-ins/:id/episode - link the report to the episode
// the pain/illness hand-off opened or created.
router.patch('/:id/episode', verifyToken, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const episodeId = req.body?.episodeId;
    if (episodeId != null && !mongoose.isValidObjectId(episodeId)) {
      return res.status(400).json({ error: 'Invalid episodeId' });
    }
    const doc = await WellnessCheckIn.findOneAndUpdate(
      { _id: req.params.id, athleteId: req.user?.userId },
      { $set: { linkedEpisodeId: episodeId || null } },
      { new: true },
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Check-in not found' });
    return res.json(doc);
  } catch (e) {
    console.error('[Wellness] link episode failed:', e);
    return res.status(500).json({ error: 'Failed to link episode', message: e.message });
  }
});

// DELETE /api/wellness-check-ins/:id - the athlete removes one of their own.
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const out = await WellnessCheckIn.deleteOne({ _id: req.params.id, athleteId: req.user?.userId });
    if (!out.deletedCount) return res.status(404).json({ error: 'Check-in not found' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[Wellness] delete failed:', e);
    return res.status(500).json({ error: 'Failed to delete wellness check-in', message: e.message });
  }
});

// PUT /api/wellness-check-ins/settings - { athleteId?, mode, everyDays }
router.put('/settings', verifyToken, async (req, res) => {
  try {
    const r = await resolveAthlete(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });
    if (!maySetFrequency(r)) {
      return res.status(403).json({ error: 'Your coach sets how often you check in' });
    }
    const mode = req.body?.mode;
    if (!['off', 'daily', 'interval'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be off, daily or interval' });
    }
    const { everyDays } = normalizeFrequency({ mode, everyDays: req.body?.everyDays });
    const stored = {
      mode,
      everyDays,
      setBy: req.user.userId,
      updatedAt: new Date(),
    };
    await User.updateOne({ _id: r.athleteId }, { $set: { wellnessCheckIn: stored } });
    return res.json({ frequency: shapeFrequency(stored) });
  } catch (e) {
    console.error('[Wellness] settings failed:', e);
    return res.status(500).json({ error: 'Failed to save settings', message: e.message });
  }
});

module.exports = router;
