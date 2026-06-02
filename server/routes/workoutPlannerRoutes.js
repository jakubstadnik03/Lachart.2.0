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
const DayPlan         = require('../models/DayPlan');
const User       = require('../models/UserModel');
const { requireFeature } = require('../middleware/featureGate');

/**
 * Workout planning is a Pro-tier feature. Free users can READ what's been
 * planned for them (e.g. a coach assigned a workout) but can't CREATE or
 * EDIT plans themselves. Coaches planning for athletes need the Coach
 * plan — the same gate is applied because Coach inherits Pro.
 *
 * Reads stay open (GET) so an athlete on a free plan still sees the workout
 * their Pro/Coach trainer assigned them. Writes (POST/PUT/DELETE) require
 * plan_workouts.
 */
const requirePlanWorkouts = requireFeature('plan_workouts');

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
router.post('/templates', verifyToken, requirePlanWorkouts, async (req, res) => {
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
router.put('/templates/:id', verifyToken, requirePlanWorkouts, async (req, res) => {
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
router.delete('/templates/:id', verifyToken, requirePlanWorkouts, async (req, res) => {
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
router.post('/planned', verifyToken, requirePlanWorkouts, async (req, res) => {
  try {
    const { athleteId } = await resolveAthleteId(req);
    const { date, sport, title, description, templateId, steps,
            coachNotes, comment, targetTss,
            plannedDuration, plannedDistance, isLactateTest, category } = req.body;

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
      coachNotes, comment, targetTss,
      plannedDuration, plannedDistance, isLactateTest,
      category: category || undefined,
      status: 'planned',
    });
    res.status(201).json(pw);
  } catch (e) {
    console.error('[WorkoutPlanner] POST /planned error:', e);
    res.status(500).json({
      error: 'Failed to create planned workout',
      message: e?.message,
      ...(e?.errors && { validation: Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v.message])) }),
    });
  }
});

/** PUT /api/workout-planner/planned/:id */
router.put('/planned/:id', verifyToken, requirePlanWorkouts, async (req, res) => {
  try {
    const { athleteId } = await resolveAthleteId(req);
    const pw = await PlannedWorkout.findById(req.params.id);
    if (!pw) return res.status(404).json({ error: 'Not found' });
    if (String(pw.athleteId) !== athleteId) return res.status(403).json({ error: 'Forbidden' });

    const fields = ['date','sport','title','description','steps','status',
                    'completedTrainingId','coachNotes','comment','targetTss',
                    'plannedDuration','plannedDistance','isLactateTest','category',
                    'executionData','fitTrainingId','stravaActivityId'];
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

/**
 * GET /api/workout-planner/planned/:id/export?format=zwo|tcx|fit[&ftp=300]
 *
 * Returns the planned workout as a downloadable file in the requested
 * structured-workout format:
 *
 *   • zwo — Zwift / TrainerRoad / Wahoo SYSTM / Rouvy import
 *   • tcx — Garmin Connect (Workouts → Import) and TrainingPeaks
 *   • fit — not yet implemented (binary encoder pending)
 *
 * FTP / LT1 / LT2 are resolved from the athlete's most recent saved test
 * unless `ftp=NNN` is provided in the query string (lets a coach
 * override on the fly).
 */
router.get('/planned/:id/export', verifyToken, async (req, res) => {
  try {
    const Test = require('../models/test');
    const { buildZwo, buildTcx, buildFit } = require('../utils/workoutExporters');

    const pw = await PlannedWorkout.findById(req.params.id).lean();
    if (!pw) return res.status(404).json({ error: 'Not found' });

    // Authorisation — own data OR coach view of an athlete via ?athleteId.
    const { athleteId } = await resolveAthleteId(req);
    if (String(pw.athleteId) !== athleteId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!Array.isArray(pw.steps) || pw.steps.length === 0) {
      return res.status(400).json({ error: 'Workout has no structured steps to export' });
    }

    // Resolve FTP context. Order:
    //   1. Explicit ?ftp=NNN query (coach override)
    //   2. Most recent test with LT2 / FTP for this athlete
    //   3. Hard fallback 250 W
    let ctx = { ftp: 250, lt1Power: null, lt2Power: null };
    const ftpOverride = Number(req.query.ftp);
    if (Number.isFinite(ftpOverride) && ftpOverride > 0) {
      ctx.ftp = ftpOverride;
    } else {
      try {
        const tests = await Test.find({ userId: pw.athleteId }).sort({ date: -1 }).limit(10).lean();
        const latest = tests.find((t) => t.lt2Power || t.ltPower || t.ftp);
        if (latest) {
          ctx = {
            ftp: Number(latest.lt2Power || latest.ltPower || latest.ftp) || 250,
            lt1Power: latest.ltPower || latest.lt1Power || null,
            lt2Power: latest.lt2Power || latest.ltPower || null,
          };
        }
      } catch (_) { /* keep defaults */ }
    }

    const format = String(req.query.format || 'tcx').toLowerCase();
    const safeName = (pw.title || 'workout')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .slice(0, 50) || 'workout';

    let body; let mime; let ext;
    if (format === 'zwo') {
      body = buildZwo(pw, ctx);
      mime = 'application/xml';
      ext = 'zwo';
    } else if (format === 'tcx') {
      body = buildTcx(pw, ctx);
      mime = 'application/vnd.garmin.tcx+xml';
      ext = 'tcx';
    } else if (format === 'fit') {
      try {
        body = buildFit(pw, ctx);
        mime = 'application/vnd.ant.fit';
        ext = 'fit';
      } catch (e) {
        if (e.code === 'FORMAT_NOT_IMPLEMENTED') {
          return res.status(501).json({ error: e.message });
        }
        throw e;
      }
    } else {
      return res.status(400).json({ error: `Unknown format "${format}". Use one of: zwo, tcx, fit.` });
    }

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${ext}"`);
    res.send(body);
  } catch (e) {
    console.error('[/workout-planner/planned/:id/export]', e);
    res.status(500).json({ error: 'Failed to export workout' });
  }
});

/**
 * POST /api/workout-planner/planned/:id/complete
 * Save execution stats, generate a .fit with laps, create FitTraining for calendar,
 * optional Strava upload.
 */
router.post('/planned/:id/complete', verifyToken, async (req, res) => {
  try {
    const FitTraining = require('../models/fitTraining');
    const { generateWorkoutExecutionFit, buildWorkoutFitData } = require('../utils/fitGenerator');
    const { uploadFitToStrava } = require('../utils/stravaFitUpload');
    const { invalidateFitCacheForUser } = require('../utils/fitRouteCache');

    const { athleteId, me } = await resolveAthleteId(req);
    const pw = await PlannedWorkout.findById(req.params.id);
    if (!pw) return res.status(404).json({ error: 'Not found' });
    if (String(pw.athleteId) !== athleteId) return res.status(403).json({ error: 'Forbidden' });

    const executionData = req.body?.executionData || req.body;
    const uploadToStrava = req.body?.uploadToStrava === true;

    const completedAt = executionData?.completedAt || new Date().toISOString();
    const totalDuration = Number(executionData?.totalDuration) || 0;
    const startedAt = executionData?.startedAt
      || new Date(new Date(completedAt).getTime() - totalDuration * 1000).toISOString();

    const fitPayload = {
      sport: pw.sport,
      startedAt,
      completedAt,
      totalDuration,
      timeSeries: executionData?.timeSeries || [],
      steps: executionData?.steps || [],
    };

    const fitData = buildWorkoutFitData(fitPayload);
    const fitBuffer = generateWorkoutExecutionFit(fitPayload);

    const sportMap = {
      run: 'running', walk: 'running', bike: 'cycling', mtbike: 'cycling',
      swim: 'swimming', rowing: 'generic', other: 'generic',
    };

    const pwrRecs = fitData.records.filter((r) => r.power > 0);
    const hrRecs = fitData.records.filter((r) => r.heartRate > 0);

    const trainingDoc = {
      athleteId: String(pw.athleteId),
      sport: sportMap[pw.sport] || 'cycling',
      timestamp: new Date(startedAt),
      totalElapsedTime: totalDuration || fitData.totalElapsedTime,
      titleManual: pw.title || 'Structured workout',
      description: pw.description || pw.coachNotes || 'Completed in LaChart',
      records: fitData.records.map((r) => ({
        timestamp: r.timestamp,
        power: r.power,
        heartRate: r.heartRate,
        cadence: r.cadence,
      })),
      laps: fitData.laps.map((lap, i) => ({
        lapNumber: lap.lapNumber || i + 1,
        totalElapsedTime: lap.totalElapsedTime,
        avgPower: lap.avgPower,
        maxPower: lap.maxPower,
        avgHeartRate: lap.avgHeartRate,
        maxHeartRate: lap.maxHeartRate,
      })),
      avgPower: pwrRecs.length
        ? Math.round(pwrRecs.reduce((s, r) => s + r.power, 0) / pwrRecs.length)
        : null,
      maxPower: pwrRecs.length ? Math.max(...pwrRecs.map((r) => r.power)) : null,
      avgHeartRate: hrRecs.length
        ? Math.round(hrRecs.reduce((s, r) => s + r.heartRate, 0) / hrRecs.length)
        : null,
      maxHeartRate: hrRecs.length ? Math.max(...hrRecs.map((r) => r.heartRate)) : null,
      analysisComplete: false,
    };

    const fitTraining = await FitTraining.create(trainingDoc);
    invalidateFitCacheForUser(pw.athleteId);

    pw.status = 'completed';
    pw.executionData = executionData;
    pw.fitTrainingId = String(fitTraining._id);
    pw.completedTrainingId = String(fitTraining._id);

    let strava = null;
    if (uploadToStrava) {
      try {
        const user = me || await User.findById(athleteId).lean();
        strava = await uploadFitToStrava(user, fitBuffer, {
          name: pw.title || 'LaChart workout',
          description: `Structured workout · ${Math.round(totalDuration / 60)} min · LaChart`,
        });
        if (strava.activityId) {
          pw.stravaActivityId = String(strava.activityId);
        }
      } catch (e) {
        console.warn('[workout complete] Strava upload failed:', e.message);
        strava = { error: e.message, status: 'failed' };
      }
    }

    await pw.save();

    res.json({
      success: true,
      plannedWorkoutId: String(pw._id),
      fitTrainingId: String(fitTraining._id),
      strava,
    });
  } catch (e) {
    console.error('[workout-planner] POST complete error:', e);
    res.status(500).json({ error: 'Failed to complete workout', message: e.message });
  }
});

/**
 * GET /api/workout-planner/planned/:id/download-fit
 * Download the recorded workout as a binary .fit (laps = steps).
 */
router.get('/planned/:id/download-fit', verifyToken, async (req, res) => {
  try {
    const { generateWorkoutExecutionFit } = require('../utils/fitGenerator');
    const { athleteId } = await resolveAthleteId(req);
    const pw = await PlannedWorkout.findById(req.params.id).lean();
    if (!pw) return res.status(404).json({ error: 'Not found' });
    if (String(pw.athleteId) !== athleteId) return res.status(403).json({ error: 'Forbidden' });
    if (!pw.executionData) {
      return res.status(400).json({ error: 'Workout has no recorded execution data' });
    }

    const ex = pw.executionData;
    const totalDuration = Number(ex.totalDuration) || 0;
    const completedAt = ex.completedAt || pw.updatedAt;
    const startedAt = ex.startedAt
      || new Date(new Date(completedAt).getTime() - totalDuration * 1000).toISOString();

    const fitBuffer = generateWorkoutExecutionFit({
      sport: pw.sport,
      startedAt,
      completedAt,
      totalDuration,
      timeSeries: ex.timeSeries || [],
      steps: ex.steps || [],
    });

    const dateStr = new Date(completedAt).toISOString().slice(0, 10);
    const safeName = (pw.title || 'workout').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="lachart-${safeName}-${dateStr}.fit"`);
    res.setHeader('Content-Length', fitBuffer.length);
    res.send(fitBuffer);
  } catch (e) {
    console.error('[workout-planner] download-fit error:', e);
    res.status(500).json({ error: 'Failed to generate FIT file', message: e.message });
  }
});

/** DELETE /api/workout-planner/planned/:id */
router.delete('/planned/:id', verifyToken, requirePlanWorkouts, async (req, res) => {
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

// ═══════════════════════════════════════════════════════════════════════════
// DAY PLANS — high-level "theme of the day" tags ("Threshold", "Recovery", …)
// distinct from individual planned workouts. One per (athlete, date).
// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/workout-planner/day-plans?from=YYYY-MM-DD&to=YYYY-MM-DD&athleteId= */
router.get('/day-plans', verifyToken, async (req, res) => {
  try {
    const { athleteId } = await resolveAthleteId(req);
    const from = req.query.from || null;
    const to   = req.query.to   || null;
    const query = { athleteId };
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to)   query.date.$lte = to;
    }
    const plans = await DayPlan.find(query).sort({ date: 1 }).lean();
    res.json(plans);
  } catch (e) {
    console.error('[WorkoutPlanner] GET /day-plans error:', e);
    res.status(500).json({ error: 'Failed to load day plans' });
  }
});

/** PUT /api/workout-planner/day-plans/:date  body: { title, category, notes }
 *  Upserts the day plan for YYYY-MM-DD. Pass empty body or `{ clear: true }`
 *  to delete instead (use the DELETE endpoint for clarity though). */
router.put('/day-plans/:date', verifyToken, requirePlanWorkouts, async (req, res) => {
  try {
    const { athleteId } = await resolveAthleteId(req);
    const date = String(req.params.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
    }
    const { title = '', category = null, notes = '' } = req.body || {};
    // Nothing meaningful supplied → drop any existing plan to keep the
    // collection sparse. Saves having to write a separate "clear" call.
    if (!title && !category && !notes) {
      await DayPlan.deleteOne({ athleteId, date });
      return res.json({ ok: true, deleted: true });
    }
    const plan = await DayPlan.findOneAndUpdate(
      { athleteId, date },
      { athleteId, date, title, category, notes, createdBy: req.user.userId },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    res.json(plan);
  } catch (e) {
    console.error('[WorkoutPlanner] PUT /day-plans error:', e);
    res.status(500).json({ error: 'Failed to save day plan' });
  }
});

/** DELETE /api/workout-planner/day-plans/:date */
router.delete('/day-plans/:date', verifyToken, requirePlanWorkouts, async (req, res) => {
  try {
    const { athleteId } = await resolveAthleteId(req);
    const date = String(req.params.date || '');
    await DayPlan.deleteOne({ athleteId, date });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete day plan' });
  }
});

module.exports = router;
