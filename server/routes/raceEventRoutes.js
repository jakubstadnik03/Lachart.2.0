const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const RaceEvent = require('../models/RaceEvent');
const User = require('../models/UserModel');

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
    res.status(201).json(ev);
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

module.exports = router;
