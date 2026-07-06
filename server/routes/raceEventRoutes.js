const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const RaceEvent = require('../models/RaceEvent');
const User = require('../models/UserModel');
const { notifyAthlete } = require('../utils/notificationHelper');
const { previewTaperForRace, applyTaperForRace } = require('../services/taperPlannerService');

// Resolve which athlete's races the caller may read/write. Athletes get their
// own; coach-like roles get their team athletes'.
async function resolveAthleteId(req) {
  const userId = String(req.user?.userId || '');
  const param = req.query.athleteId || req.body?.athleteId;
  if (!param || ['null', 'undefined', ''].includes(String(param).trim()) || String(param) === userId) {
    return { ok: true, athleteId: userId };
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
  return { ok: true, athleteId: String(param) };
}

// GET /api/race-events?athleteId=&from=&to=  — list upcoming/all races, sorted by date
router.get('/', verifyToken, async (req, res) => {
  try {
    const r = await resolveAthleteId(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });
    const q = { athleteId: r.athleteId };
    if (req.query.from || req.query.to) {
      q.date = {};
      if (req.query.from) q.date.$gte = new Date(req.query.from);
      if (req.query.to) q.date.$lte = new Date(req.query.to);
    }
    const events = await RaceEvent.find(q).sort({ date: 1 }).lean();
    res.json(events);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/race-events  — create a race
router.post('/', verifyToken, async (req, res) => {
  try {
    const r = await resolveAthleteId(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });
    const { name, date, sport, priority, location, targetCTL, notes } = req.body || {};
    if (!name || !date) return res.status(400).json({ error: 'name and date are required' });
    const ev = await RaceEvent.create({
      athleteId: r.athleteId,
      name,
      date,
      sport: sport || null,
      priority: ['A', 'B', 'C'].includes(priority) ? priority : 'A',
      location: location || null,
      targetCTL: targetCTL != null && targetCTL !== '' ? Number(targetCTL) : null,
      notes: notes || null,
      createdBy: String(req.user.userId),
    });

    const creatorId = String(req.user.userId);
    if (creatorId !== String(r.athleteId)) {
      const coach = await User.findById(creatorId).select('name').lean();
      const dateLabel = new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      notifyAthlete(r.athleteId, {
        type: 'race_added',
        title: 'New race from coach',
        body: `${coach?.name || 'Coach'} added ${name} (${dateLabel})`,
        resourceId: String(ev._id),
        resourceType: 'race',
        fromName: coach?.name || null,
        sport: sport || null,
        pushData: {
          raceId: String(ev._id),
          openRace: String(ev._id),
        },
      }).catch(() => {});
    }

    res.status(201).json(ev);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** GET /api/race-events/:id/taper-preview — planned TSS reductions before race */
router.get('/:id/taper-preview', verifyToken, async (req, res) => {
  try {
    const ev = await RaceEvent.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    req.query.athleteId = ev.athleteId;
    const r = await resolveAthleteId(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });
    const result = await previewTaperForRace(req.params.id, r.athleteId);
    if (!result.ok) return res.status(result.code || 400).json({ error: result.error });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/race-events/:id/apply-taper — scale future planned workouts + optional Taper period */
router.post('/:id/apply-taper', verifyToken, async (req, res) => {
  try {
    const ev = await RaceEvent.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    req.query.athleteId = ev.athleteId;
    const r = await resolveAthleteId(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });
    const createPeriod = req.body?.createPeriod !== false;
    const result = await applyTaperForRace(req.params.id, r.athleteId, req.user.userId, { createPeriod });
    if (!result.ok) return res.status(result.code || 400).json({ error: result.error });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/race-events/:id  — update
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const ev = await RaceEvent.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    req.query.athleteId = ev.athleteId;
    const r = await resolveAthleteId(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });
    for (const f of ['name', 'date', 'sport', 'priority', 'location', 'targetCTL', 'notes']) {
      if (f in (req.body || {})) ev[f] = req.body[f];
    }
    await ev.save();
    res.json(ev);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/race-events/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const ev = await RaceEvent.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    req.query.athleteId = ev.athleteId;
    const r = await resolveAthleteId(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });
    await ev.deleteOne();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/race-events/:id/feedback — athlete post-race debrief */
router.post('/:id/feedback', verifyToken, async (req, res) => {
  try {
    const ev = await RaceEvent.findById(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Not found' });
    req.query.athleteId = ev.athleteId;
    const r = await resolveAthleteId(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });
    if (String(r.athleteId) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Only the athlete can submit race feedback' });
    }

    const { rpe, feeling, notes } = req.body || {};
    const rpeNum = rpe != null && rpe !== '' ? Number(rpe) : null;
    if (rpeNum != null && (!Number.isFinite(rpeNum) || rpeNum < 1 || rpeNum > 10)) {
      return res.status(400).json({ error: 'RPE must be between 1 and 10' });
    }

    ev.postRaceFeedback = {
      rpe: rpeNum,
      feeling: feeling ? String(feeling).slice(0, 40) : null,
      notes: notes ? String(notes).slice(0, 2000) : null,
      submittedAt: new Date(),
    };
    await ev.save();
    res.json(ev);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
