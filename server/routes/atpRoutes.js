/**
 * atpRoutes.js — the Annual Training Plan.
 *
 * /api/atp                    list an athlete's seasons
 * /api/atp/:id                one season with all its week rows
 * /api/atp/:id/weeks          bulk week edit (the table saves through here)
 * /api/atp/:id/auto-periodize re-lay the blocks around the current A races
 *
 * Same access rule as the workout planner: a coach may read and write an
 * athlete's plan when that athlete is on their team, everyone else only their
 * own. Reads stay open on the free tier so an athlete can see the season their
 * coach built for them; writing a plan needs plan_workouts.
 */

'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const AnnualTrainingPlan = require('../models/AnnualTrainingPlan');
const RaceEvent = require('../models/RaceEvent');
const { requireFeature } = require('../middleware/featureGate');
const { isCoachLikeRole, athleteHasCoachUser } = require('../utils/athleteCoachAccess');
const {
  buildSeason, resizeSeason, mondayKey, renumberPeriodWeeks, weekTargetTss,
} = require('../utils/atpPeriodization');

const requirePlanWorkouts = requireFeature('plan_workouts');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIODS = AnnualTrainingPlan.PERIODS;

/**
 * Whose plan is this request about? Falls back to the caller. A coach-like user
 * may name an athlete, but only one already on their team.
 */
async function resolveAthlete(req) {
  const userId = String(req.user?.userId || '');
  const param = req.query.athleteId || req.body?.athleteId;
  if (!param || ['null', 'undefined', ''].includes(String(param).trim()) || String(param) === userId) {
    return { ok: true, athleteId: userId };
  }
  if (!mongoose.isValidObjectId(param)) return { ok: false, code: 400, msg: 'Invalid athleteId' };

  const me = await User.findById(userId).select('role admin').lean();
  const coachLike = me && (isCoachLikeRole(me.role) || me.role === 'admin' || me.admin);
  if (!coachLike) return { ok: false, code: 403, msg: 'Not allowed' };

  const athlete = await User.findById(param).select('coachId coachIds').lean();
  if (!athlete) return { ok: false, code: 404, msg: 'Athlete not found' };
  if (!athleteHasCoachUser(athlete, userId) && !me.admin && me.role !== 'admin') {
    return { ok: false, code: 403, msg: 'Athlete not in your team' };
  }
  return { ok: true, athleteId: String(param) };
}

/** Load a plan and confirm the caller may touch it. */
async function loadOwnedPlan(req, id) {
  if (!mongoose.isValidObjectId(id)) return { ok: false, code: 400, msg: 'Invalid plan id' };
  const plan = await AnnualTrainingPlan.findById(id);
  if (!plan) return { ok: false, code: 404, msg: 'Plan not found' };

  const userId = String(req.user?.userId || '');
  if (String(plan.athleteId) === userId) return { ok: true, plan };

  const me = await User.findById(userId).select('role admin').lean();
  const coachLike = me && (isCoachLikeRole(me.role) || me.role === 'admin' || me.admin);
  if (!coachLike) return { ok: false, code: 403, msg: 'Not allowed' };

  const athlete = await User.findById(plan.athleteId).select('coachId coachIds').lean();
  if (!athlete) return { ok: false, code: 404, msg: 'Athlete not found' };
  if (!athleteHasCoachUser(athlete, userId) && !me.admin && me.role !== 'admin') {
    return { ok: false, code: 403, msg: 'Athlete not in your team' };
  }
  return { ok: true, plan };
}

/** A races bound the season; used to anchor the auto-periodizer. */
async function racesInSeason(athleteId, startDate, endDate) {
  const from = new Date(`${startDate}T00:00:00`);
  const to = new Date(`${endDate}T23:59:59`);
  const races = await RaceEvent.find({
    athleteId: String(athleteId),
    date: { $gte: from, $lte: to },
  }).select('name date priority sport').sort({ date: 1 }).lean();
  return races;
}

/** Keep only the fields a client is allowed to set on a week row. */
function sanitizeWeek(raw) {
  if (!raw || !DATE_RE.test(String(raw.weekStart || ''))) return null;
  const period = raw.period && PERIODS.includes(raw.period) ? raw.period : null;
  const tss = Number(raw.targetTss);
  const hours = raw.targetHours == null || raw.targetHours === '' ? null : Number(raw.targetHours);
  return {
    weekStart: mondayKey(raw.weekStart),
    period,
    periodWeek: null, // recomputed below — never trusted from the client
    targetTss: Number.isFinite(tss) && tss >= 0 ? Math.round(tss) : 0,
    targetHours: Number.isFinite(hours) && hours >= 0 ? hours : null,
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 500) : '',
    // Marker, stripped before saving: no targetTss sent means "use the pattern".
    _autoTss: raw.targetTss == null || raw.targetTss === '',
  };
}

// ═══════════════════════════════════════════════════════════════════════════

/** GET /api/atp — the athlete's seasons, newest first. */
router.get('/', verifyToken, async (req, res) => {
  try {
    const who = await resolveAthlete(req);
    if (!who.ok) return res.status(who.code).json({ error: who.msg });

    const plans = await AnnualTrainingPlan.find({ athleteId: who.athleteId })
      .sort({ startDate: -1 })
      .lean();
    res.json(plans);
  } catch (e) {
    console.error('[ATP] GET / error:', e);
    res.status(500).json({ error: 'Failed to load training plans' });
  }
});

/** GET /api/atp/:id — one season, with the races that fall inside it. */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const owned = await loadOwnedPlan(req, req.params.id);
    if (!owned.ok) return res.status(owned.code).json({ error: owned.msg });

    const plan = owned.plan.toObject();
    plan.races = await racesInSeason(plan.athleteId, plan.startDate, plan.endDate);
    res.json(plan);
  } catch (e) {
    console.error('[ATP] GET /:id error:', e);
    res.status(500).json({ error: 'Failed to load training plan' });
  }
});

/**
 * POST /api/atp — start a season.
 * Body: { name, startDate, endDate, peakWeeklyTss, sport, autoPeriodize }
 * With autoPeriodize (the default) the blocks are laid out around the athlete's
 * A races straight away, so the plan opens with something to edit.
 */
router.post('/', verifyToken, requirePlanWorkouts, async (req, res) => {
  try {
    const who = await resolveAthlete(req);
    if (!who.ok) return res.status(who.code).json({ error: who.msg });

    const { name, startDate, endDate, peakWeeklyTss, sport, autoPeriodize = true } = req.body || {};
    if (!DATE_RE.test(String(startDate || '')) || !DATE_RE.test(String(endDate || ''))) {
      return res.status(400).json({ error: 'startDate and endDate (YYYY-MM-DD) are required' });
    }
    const start = mondayKey(startDate);
    if (endDate <= start) return res.status(400).json({ error: 'endDate must be after startDate' });

    const peak = Number(peakWeeklyTss) > 0 ? Math.round(Number(peakWeeklyTss)) : 700;
    const races = autoPeriodize ? await racesInSeason(who.athleteId, start, endDate) : [];
    const weeks = autoPeriodize
      ? buildSeason({ startDate: start, endDate, races, peakWeeklyTss: peak })
      : resizeSeason({ startDate: start, endDate, weeks: [], peakWeeklyTss: peak });

    const plan = await AnnualTrainingPlan.create({
      athleteId: who.athleteId,
      createdBy: req.user.userId,
      name: (name && String(name).trim()) || `ATP ${new Date(`${start}T12:00:00`).getFullYear()}`,
      startDate: start,
      endDate,
      peakWeeklyTss: peak,
      sport: sport || 'bike',
      weeks,
    });

    const out = plan.toObject();
    out.races = races;
    res.status(201).json(out);
  } catch (e) {
    console.error('[ATP] POST / error:', e);
    res.status(500).json({ error: 'Failed to create training plan' });
  }
});

/**
 * PUT /api/atp/:id — season settings.
 * Moving the dates resizes the week list, keeping every week still in range.
 * Changing peakWeeklyTss rescales only the weeks the athlete has not edited,
 * which is why targetTss carries no "was this hand-set" flag: a week counts as
 * hand-set once its value stops matching what the pattern would produce.
 */
router.put('/:id', verifyToken, requirePlanWorkouts, async (req, res) => {
  try {
    const owned = await loadOwnedPlan(req, req.params.id);
    if (!owned.ok) return res.status(owned.code).json({ error: owned.msg });
    const { plan } = owned;

    const { name, startDate, endDate, peakWeeklyTss, sport, isActive, rescaleTss } = req.body || {};
    const oldPeak = plan.peakWeeklyTss;

    if (name !== undefined) plan.name = String(name).trim() || plan.name;
    if (sport !== undefined) plan.sport = String(sport);
    if (isActive !== undefined) plan.isActive = !!isActive;
    if (peakWeeklyTss !== undefined && Number(peakWeeklyTss) > 0) {
      plan.peakWeeklyTss = Math.round(Number(peakWeeklyTss));
    }

    const nextStart = startDate !== undefined && DATE_RE.test(String(startDate))
      ? mondayKey(startDate) : plan.startDate;
    const nextEnd = endDate !== undefined && DATE_RE.test(String(endDate)) ? endDate : plan.endDate;
    if (nextEnd <= nextStart) return res.status(400).json({ error: 'endDate must be after startDate' });

    if (nextStart !== plan.startDate || nextEnd !== plan.endDate) {
      plan.weeks = resizeSeason({
        startDate: nextStart,
        endDate: nextEnd,
        weeks: plan.weeks.map((w) => w.toObject?.() || w),
        peakWeeklyTss: plan.peakWeeklyTss,
      });
      plan.startDate = nextStart;
      plan.endDate = nextEnd;
    }

    // Rescale weeks still sitting at their generated value; leave edits alone.
    if (rescaleTss !== false && plan.peakWeeklyTss !== oldPeak) {
      for (const w of plan.weeks) {
        if (!w.period) continue;
        const wasAuto = w.targetTss === weekTargetTss(w.period, w.periodWeek, oldPeak);
        if (wasAuto) w.targetTss = weekTargetTss(w.period, w.periodWeek, plan.peakWeeklyTss);
      }
    }

    await plan.save();
    const out = plan.toObject();
    out.races = await racesInSeason(plan.athleteId, plan.startDate, plan.endDate);
    res.json(out);
  } catch (e) {
    console.error('[ATP] PUT /:id error:', e);
    res.status(500).json({ error: 'Failed to update training plan' });
  }
});

/**
 * PUT /api/atp/:id/weeks — replace week rows.
 * Accepts either the whole season or a subset; anything not sent is left as is,
 * so a single-cell edit in the table is one small request.
 */
router.put('/:id/weeks', verifyToken, requirePlanWorkouts, async (req, res) => {
  try {
    const owned = await loadOwnedPlan(req, req.params.id);
    if (!owned.ok) return res.status(owned.code).json({ error: owned.msg });
    const { plan } = owned;

    const incoming = Array.isArray(req.body?.weeks) ? req.body.weeks : null;
    if (!incoming) return res.status(400).json({ error: 'weeks[] is required' });

    const patches = new Map();
    for (const raw of incoming) {
      const w = sanitizeWeek(raw);
      if (w) patches.set(w.weekStart, w);
    }
    if (!patches.size) return res.status(400).json({ error: 'No valid weeks in request' });

    const merged = plan.weeks.map((w) => {
      const patch = patches.get(w.weekStart);
      if (!patch) return w.toObject?.() || w;
      patches.delete(w.weekStart);
      return {
        weekStart: w.weekStart,
        period: patch.period,
        periodWeek: null,
        targetTss: patch.targetTss,
        targetHours: patch.targetHours,
        notes: patch.notes,
        _autoTss: patch._autoTss,
      };
    });

    // A week outside the stored range is out of season — ignore rather than 400,
    // so a stale tab editing last season's row can't corrupt this one.
    const inRange = merged.filter((w) => w.weekStart >= plan.startDate && w.weekStart <= plan.endDate);
    inRange.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    renumberPeriodWeeks(inRange);

    // A row whose period changed but whose TSS was left blank gets the pattern value.
    for (const w of inRange) {
      if (w._autoTss && w.period) w.targetTss = weekTargetTss(w.period, w.periodWeek, plan.peakWeeklyTss);
      delete w._autoTss;
    }

    plan.weeks = inRange;
    await plan.save();
    res.json(plan.toObject());
  } catch (e) {
    console.error('[ATP] PUT /:id/weeks error:', e);
    res.status(500).json({ error: 'Failed to save plan weeks' });
  }
});

/**
 * POST /api/atp/:id/auto-periodize — re-lay the blocks around the current races.
 * Notes and hour targets survive; periods and TSS targets are regenerated.
 */
router.post('/:id/auto-periodize', verifyToken, requirePlanWorkouts, async (req, res) => {
  try {
    const owned = await loadOwnedPlan(req, req.params.id);
    if (!owned.ok) return res.status(owned.code).json({ error: owned.msg });
    const { plan } = owned;

    const races = await racesInSeason(plan.athleteId, plan.startDate, plan.endDate);
    plan.weeks = buildSeason({
      startDate: plan.startDate,
      endDate: plan.endDate,
      races,
      peakWeeklyTss: plan.peakWeeklyTss,
      existingWeeks: plan.weeks.map((w) => w.toObject?.() || w),
    });
    await plan.save();

    const out = plan.toObject();
    out.races = races;
    res.json(out);
  } catch (e) {
    console.error('[ATP] POST /:id/auto-periodize error:', e);
    res.status(500).json({ error: 'Failed to rebuild the season' });
  }
});

/** DELETE /api/atp/:id */
router.delete('/:id', verifyToken, requirePlanWorkouts, async (req, res) => {
  try {
    const owned = await loadOwnedPlan(req, req.params.id);
    if (!owned.ok) return res.status(owned.code).json({ error: owned.msg });
    await AnnualTrainingPlan.deleteOne({ _id: owned.plan._id });
    res.json({ ok: true });
  } catch (e) {
    console.error('[ATP] DELETE /:id error:', e);
    res.status(500).json({ error: 'Failed to delete training plan' });
  }
});

module.exports = router;
