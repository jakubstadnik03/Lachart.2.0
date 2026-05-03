/**
 * Workout Planner Routes
 * ─────────────────────
 * /api/workout-planner/templates   – CRUD for reusable workout templates
 * /api/workout-planner/planned     – CRUD for planned workouts (calendar)
 */
const express    = require('express');
const router     = express.Router();
const verifyToken = require('../middleware/verifyToken');
const WorkoutTemplate = require('../models/WorkoutTemplate');
const PlannedWorkout  = require('../models/PlannedWorkout');
const User       = require('../models/UserModel');

// ── Helper: is requester a coach/admin who may manage athlete data? ──────────
function isCoachLike(user) {
  const role = String(user?.role || '').toLowerCase();
  return ['coach', 'tester', 'testing', 'admin'].includes(role) || user?.admin === true;
}

async function resolveAthleteId(req) {
  // If a ?athleteId query param is passed AND requester is coach-like, use that.
  // Otherwise fall back to the authenticated user.
  const me = await User.findById(req.user.userId).lean();
  if (req.query.athleteId && isCoachLike(me)) {
    return { athleteId: String(req.query.athleteId), me };
  }
  return { athleteId: String(req.user.userId), me };
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKOUT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/workout-planner/templates  – list own + public templates */
router.get('/templates', verifyToken, async (req, res) => {
  try {
    const userId = String(req.user.userId);
    const sport  = req.query.sport;
    const query  = { $or: [{ createdBy: userId }, { isPublic: true }] };
    if (sport) query.sport = sport;

    const templates = await WorkoutTemplate.find(query)
      .sort({ createdAt: -1 })
      .lean();
    res.json(templates);
  } catch (e) {
    console.error('[WorkoutPlanner] GET /templates error:', e);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

/** GET /api/workout-planner/templates/:id */
router.get('/templates/:id', verifyToken, async (req, res) => {
  try {
    const tpl = await WorkoutTemplate.findById(req.params.id).lean();
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    // Only own or public
    if (String(tpl.createdBy) !== String(req.user.userId) && !tpl.isPublic) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(tpl);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load template' });
  }
});

/** POST /api/workout-planner/templates */
router.post('/templates', verifyToken, async (req, res) => {
  try {
    const { name, sport, description, tags, steps, isPublic } = req.body;
    if (!name || !sport) return res.status(400).json({ error: 'name and sport are required' });

    const tpl = await WorkoutTemplate.create({
      createdBy:   String(req.user.userId),
      name, sport, description, tags, steps,
      isPublic:    Boolean(isPublic),
    });
    res.status(201).json(tpl);
  } catch (e) {
    console.error('[WorkoutPlanner] POST /templates error:', e);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/** PUT /api/workout-planner/templates/:id */
router.put('/templates/:id', verifyToken, async (req, res) => {
  try {
    const tpl = await WorkoutTemplate.findById(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    if (String(tpl.createdBy) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { name, sport, description, tags, steps, isPublic } = req.body;
    if (name)        tpl.name        = name;
    if (sport)       tpl.sport       = sport;
    if (description !== undefined) tpl.description = description;
    if (tags)        tpl.tags        = tags;
    if (steps)       tpl.steps       = steps;
    if (isPublic !== undefined) tpl.isPublic = Boolean(isPublic);
    await tpl.save();
    res.json(tpl);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

/** DELETE /api/workout-planner/templates/:id */
router.delete('/templates/:id', verifyToken, async (req, res) => {
  try {
    const tpl = await WorkoutTemplate.findById(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    if (String(tpl.createdBy) !== String(req.user.userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await tpl.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PLANNED WORKOUTS
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/workout-planner/planned?from=YYYY-MM-DD&to=YYYY-MM-DD&athleteId= */
router.get('/planned', verifyToken, async (req, res) => {
  try {
    const { athleteId } = await resolveAthleteId(req);
    const from = req.query.from ? new Date(req.query.from) : null;
    const to   = req.query.to   ? new Date(req.query.to)   : null;

    const query = { athleteId };
    if (from || to) {
      query.date = {};
      if (from) { from.setHours(0,0,0,0); query.date.$gte = from; }
      if (to)   { to.setHours(23,59,59,999); query.date.$lte = to; }
    }

    const planned = await PlannedWorkout.find(query)
      .sort({ date: 1 })
      .lean();
    res.json(planned);
  } catch (e) {
    console.error('[WorkoutPlanner] GET /planned error:', e);
    res.status(500).json({ error: 'Failed to load planned workouts' });
  }
});

/** GET /api/workout-planner/planned/:id */
router.get('/planned/:id', verifyToken, async (req, res) => {
  try {
    const pw = await PlannedWorkout.findById(req.params.id).lean();
    if (!pw) return res.status(404).json({ error: 'Planned workout not found' });
    const { athleteId } = await resolveAthleteId(req);
    if (String(pw.athleteId) !== athleteId) return res.status(403).json({ error: 'Forbidden' });
    res.json(pw);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load planned workout' });
  }
});

/** POST /api/workout-planner/planned */
router.post('/planned', verifyToken, async (req, res) => {
  try {
    const { athleteId } = await resolveAthleteId(req);
    const { date, sport, title, description, templateId, steps,
            coachNotes, targetTss } = req.body;

    if (!date || !sport || !title) {
      return res.status(400).json({ error: 'date, sport and title are required' });
    }

    const pw = await PlannedWorkout.create({
      athleteId,
      createdBy: String(req.user.userId),
      date: new Date(date),
      sport, title, description,
      templateId: templateId || null,
      steps: steps || [],
      coachNotes, targetTss,
      status: 'planned',
    });
    res.status(201).json(pw);
  } catch (e) {
    console.error('[WorkoutPlanner] POST /planned error:', e);
    res.status(500).json({ error: 'Failed to create planned workout' });
  }
});

/** PUT /api/workout-planner/planned/:id */
router.put('/planned/:id', verifyToken, async (req, res) => {
  try {
    const { athleteId } = await resolveAthleteId(req);
    const pw = await PlannedWorkout.findById(req.params.id);
    if (!pw) return res.status(404).json({ error: 'Not found' });
    if (String(pw.athleteId) !== athleteId) return res.status(403).json({ error: 'Forbidden' });

    const fields = ['date','sport','title','description','steps','status',
                    'completedTrainingId','coachNotes','targetTss'];
    fields.forEach(f => { if (req.body[f] !== undefined) pw[f] = req.body[f]; });
    if (req.body.date) pw.date = new Date(req.body.date);

    await pw.save();
    res.json(pw);
  } catch (e) {
    console.error('[WorkoutPlanner] PUT /planned/:id error:', e);
    res.status(500).json({
      error: 'Failed to update planned workout',
      message: e?.message,
      ...(e?.errors && { validation: Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v.message])) }),
    });
  }
});

/** DELETE /api/workout-planner/planned/:id */
router.delete('/planned/:id', verifyToken, async (req, res) => {
  try {
    const { athleteId } = await resolveAthleteId(req);
    const pw = await PlannedWorkout.findById(req.params.id);
    if (!pw) return res.status(404).json({ error: 'Not found' });
    if (String(pw.athleteId) !== athleteId) return res.status(403).json({ error: 'Forbidden' });
    await pw.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete planned workout' });
  }
});

module.exports = router;
