/**
 * healthRoutes.js — injury and illness episodes, symptom check-ins, and the
 * daily return-to-training verdict.
 *
 * Access differs from the rest of the app in one important way: health data is
 * a sensitive category, so a coach sees an athlete's episode ONLY when the
 * athlete has set isVisibleToCoach, and `notesPrivate` is stripped for every
 * viewer who is not the athlete themselves.
 */

'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const HealthEpisode = require('../models/HealthEpisode');
const HealthCheckIn = require('../models/HealthCheckIn');
const CalendarPeriod = require('../models/CalendarPeriod');
const {
  CATALOG, BODY_SITES, FUNCTIONAL_TESTS, getCatalogEntry,
} = require('../data/injuryCatalog');
const { evaluateHealthGate, currentStage } = require('../utils/healthGate');
const {
  captureBaseline, currentWeekLoad, buildLoadSummary,
} = require('../services/healthBaselineService');
const { isCoachLikeRole, athleteHasCoachUser } = require('../utils/athleteCoachAccess');
const { stageCaps } = require('../utils/healthGate');
const AppleHealthWellness = require('../models/AppleHealthWellness');
const GarminWellness = require('../models/GarminWellness');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Same team rule as weekly reviews and race events, with one addition: a coach
 * gets read access to the athlete, but individual episodes still filter on
 * isVisibleToCoach below.
 */
async function resolveAthlete(req) {
  const userId = String(req.user?.userId || '');
  const param = req.query.athleteId || req.body?.athleteId;
  if (!param || ['null', 'undefined', ''].includes(String(param).trim()) || String(param) === userId) {
    return { ok: true, athleteId: userId, viewerIsCoach: false };
  }
  const me = await User.findById(userId).select('role admin').lean();
  const coachLike = me && (isCoachLikeRole(me.role) || me.role === 'admin' || me.admin);
  if (!coachLike) return { ok: false, code: 403, msg: 'Not allowed' };
  const athlete = await User.findById(param).select('coachId coachIds').lean();
  if (!athlete) return { ok: false, code: 404, msg: 'Athlete not found' };
  if (!athleteHasCoachUser(athlete, userId)) {
    return { ok: false, code: 403, msg: 'Athlete not in your team' };
  }
  return { ok: true, athleteId: String(param), viewerIsCoach: true };
}

/** Private notes never leave the athlete's own session. */
function shapeEpisode(episode, viewerIsAthlete) {
  if (!episode) return episode;
  const out = { ...episode };
  if (!viewerIsAthlete) delete out.notesPrivate;
  return out;
}

/** Sport the caps are expressed in — running for anything below the waist. */
function primarySportFor(entry) {
  if (!entry) return 'run';
  if ((entry.sports || []).includes('run')) return 'run';
  if ((entry.sports || []).includes('swim')) return 'swim';
  if ((entry.sports || []).includes('bike')) return 'bike';
  return 'run';
}

// ── Catalogue ──────────────────────────────────────────────────────────────
// Static reference data. The client renders the picker and the check-in form
// straight from this, so the rules live in exactly one place.
router.get('/catalog', verifyToken, (req, res) => {
  res.json({ catalog: CATALOG, bodySites: BODY_SITES, functionalTests: FUNCTIONAL_TESTS });
});

// ── Episodes ───────────────────────────────────────────────────────────────

// GET /api/health/episodes?athleteId=&status=active,returning
router.get('/episodes', verifyToken, async (req, res) => {
  try {
    const r = await resolveAthlete(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });

    const q = { athleteId: r.athleteId };
    const statuses = String(req.query.status || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length) q.status = { $in: statuses };
    if (r.viewerIsCoach) q.isVisibleToCoach = true;

    const episodes = await HealthEpisode.find(q).sort({ startDate: -1 }).lean();
    res.json(episodes.map((e) => shapeEpisode(e, !r.viewerIsCoach)));
  } catch (e) {
    console.error('[Health] list episodes failed:', e);
    res.status(500).json({ error: 'Failed to load episodes', message: e.message });
  }
});

// POST /api/health/episodes
router.post('/episodes', verifyToken, async (req, res) => {
  try {
    const r = await resolveAthlete(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });

    const { catalogId, bodySite, side, startDate } = req.body || {};
    const entry = getCatalogEntry(catalogId);
    if (!entry) return res.status(400).json({ error: 'Unknown catalogId' });

    const start = DATE_RE.test(String(startDate || '')) ? String(startDate) : todayKey();

    // A previous episode at the same site is the strongest predictor of the
    // next one, so we look it up at creation and tighten the protocol.
    const previous = await HealthEpisode.findOne({
      athleteId: r.athleteId,
      bodySite: bodySite || entry.bodySites?.[0] || null,
      side: side || 'n/a',
    }).sort({ startDate: -1 }).lean();

    const baseline = await captureBaseline(r.athleteId, start);

    const restrictions = [];
    const allowed = new Set(entry.crossTraining?.allowed || []);
    for (const sport of ['run', 'bike', 'swim', 'strength']) {
      if (entry.loadResponse === 'rest' && !allowed.has(sport)) {
        restrictions.push({ sport, allowed: false, note: 'Not allowed in the current stage' });
      }
    }

    const firstStage = entry.stages?.[0] || null;

    const episode = await HealthEpisode.create({
      athleteId: r.athleteId,
      createdBy: req.user.userId,
      catalogId: entry.id,
      kind: entry.kind || 'injury',
      tissue: entry.tissue || null,
      tendonSubtype: entry.tendonSubtype || null,
      loadResponse: entry.loadResponse,
      bodySite: bodySite || entry.bodySites?.[0] || null,
      side: side || 'n/a',
      diagnosis: String(req.body?.diagnosis || '').slice(0, 500),
      diagnosedBy: ['self', 'physio', 'doctor', 'imaging'].includes(req.body?.diagnosedBy)
        ? req.body.diagnosedBy : 'self',
      severity: Math.min(4, Math.max(1, Number(req.body?.severity) || 2)),
      muscleGrade: req.body?.muscleGrade || undefined,
      startDate: start,
      expectedReturnDate: DATE_RE.test(String(req.body?.expectedReturnDate || ''))
        ? req.body.expectedReturnDate : null,
      status: 'active',
      currentStageId: firstStage?.id || null,
      currentStageIndex: 0,
      stageStartedAt: start,
      restrictions,
      baseline,
      previousEpisodeId: previous?._id || null,
      isRecurrence: Boolean(previous),
      requiresMedicalClearance: Boolean(entry.requiresMedicalClearance),
      notes: String(req.body?.notes || '').slice(0, 2000),
      notesPrivate: String(req.body?.notesPrivate || '').slice(0, 2000),
      isVisibleToCoach: Boolean(req.body?.isVisibleToCoach),
    });

    // Mirror it onto the calendar so the existing month/week views show the
    // episode without knowing anything about this feature.
    try {
      const period = await CalendarPeriod.create({
        athleteId: r.athleteId,
        createdBy: req.user.userId,
        startDate: start,
        endDate: episode.expectedReturnDate || start,
        type: 'Illness',
        notes: entry.shortLabel || entry.label,
      });
      episode.calendarPeriodId = period._id;
      await episode.save();
    } catch (e) {
      console.error('[Health] calendar period create failed:', e.message);
    }

    res.status(201).json(shapeEpisode(episode.toObject(), !r.viewerIsCoach));
  } catch (e) {
    console.error('[Health] create episode failed:', e);
    res.status(500).json({ error: 'Failed to create episode', message: e.message });
  }
});

/** Load an episode and check the caller may see it. */
async function loadEpisode(req, res) {
  const userId = String(req.user?.userId || '');
  // A malformed id is a missing episode, not a server fault — without this,
  // Mongoose throws a CastError and every handler answers 500.
  if (!mongoose.Types.ObjectId.isValid(String(req.params.id || ''))) {
    res.status(404).json({ error: 'Episode not found' });
    return null;
  }
  const episode = await HealthEpisode.findById(req.params.id).lean();
  if (!episode) {
    res.status(404).json({ error: 'Episode not found' });
    return null;
  }
  const isAthlete = String(episode.athleteId) === userId;
  if (isAthlete) return { episode, isAthlete: true };

  const me = await User.findById(userId).select('role admin').lean();
  const coachLike = me && (isCoachLikeRole(me.role) || me.role === 'admin' || me.admin);
  const athlete = await User.findById(episode.athleteId).select('coachId coachIds').lean();
  if (!coachLike || !athleteHasCoachUser(athlete, userId) || !episode.isVisibleToCoach) {
    res.status(403).json({ error: 'Not allowed' });
    return null;
  }
  return { episode, isAthlete: false };
}

// GET /api/health/episodes/:id
router.get('/episodes/:id', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    const entry = getCatalogEntry(loaded.episode.catalogId);
    return res.json({
      episode: shapeEpisode(loaded.episode, loaded.isAthlete),
      catalogEntry: entry,
    });
  } catch (e) {
    console.error('[Health] get episode failed:', e);
    return res.status(500).json({ error: 'Failed to load episode', message: e.message });
  }
});

// PATCH /api/health/episodes/:id — athlete-editable fields only.
router.patch('/episodes/:id', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    if (!loaded.isAthlete) {
      return res.status(403).json({ error: 'Only the athlete can edit an episode' });
    }

    const patch = {};
    const b = req.body || {};
    if (b.diagnosis != null) patch.diagnosis = String(b.diagnosis).slice(0, 500);
    if (b.notes != null) patch.notes = String(b.notes).slice(0, 2000);
    if (b.notesPrivate != null) patch.notesPrivate = String(b.notesPrivate).slice(0, 2000);
    if (b.isVisibleToCoach != null) patch.isVisibleToCoach = Boolean(b.isVisibleToCoach);
    if (b.severity != null) patch.severity = Math.min(4, Math.max(1, Number(b.severity) || 2));
    if (b.diagnosedBy && ['self', 'physio', 'doctor', 'imaging'].includes(b.diagnosedBy)) {
      patch.diagnosedBy = b.diagnosedBy;
    }
    if (b.expectedReturnDate === null || DATE_RE.test(String(b.expectedReturnDate || ''))) {
      patch.expectedReturnDate = b.expectedReturnDate || null;
    }
    if (b.endDate === null || DATE_RE.test(String(b.endDate || ''))) {
      patch.endDate = b.endDate || null;
    }
    if (b.status && ['active', 'returning', 'resolved', 'recurred'].includes(b.status)) {
      patch.status = b.status;
    }
    if (b.muscleGrade) patch.muscleGrade = b.muscleGrade;
    if (Array.isArray(b.restrictions)) patch.restrictions = b.restrictions;
    // Clearance is a statement that a clinician has seen this, so it is recorded
    // with a timestamp rather than as a silent boolean flip.
    if (b.medicalClearance === true) patch.medicalClearanceAt = new Date();
    if (b.medicalClearance === false) patch.medicalClearanceAt = null;

    const updated = await HealthEpisode.findByIdAndUpdate(
      req.params.id, { $set: patch }, { new: true },
    ).lean();

    if (updated?.calendarPeriodId && (patch.endDate || patch.expectedReturnDate)) {
      await CalendarPeriod.updateOne(
        { _id: updated.calendarPeriodId },
        { $set: { endDate: updated.endDate || updated.expectedReturnDate || updated.startDate } },
      ).catch(() => { /* the band is cosmetic — never fail the update over it */ });
    }

    return res.json(shapeEpisode(updated, true));
  } catch (e) {
    console.error('[Health] patch episode failed:', e);
    return res.status(500).json({ error: 'Failed to update episode', message: e.message });
  }
});

// DELETE /api/health/episodes/:id — removes its check-ins and calendar band too.
router.delete('/episodes/:id', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    if (!loaded.isAthlete) {
      return res.status(403).json({ error: 'Only the athlete can delete an episode' });
    }
    await HealthCheckIn.deleteMany({ episodeId: loaded.episode._id });
    if (loaded.episode.calendarPeriodId) {
      await CalendarPeriod.deleteOne({ _id: loaded.episode.calendarPeriodId }).catch(() => {});
    }
    await HealthEpisode.deleteOne({ _id: loaded.episode._id });
    return res.json({ deleted: true });
  } catch (e) {
    console.error('[Health] delete episode failed:', e);
    return res.status(500).json({ error: 'Failed to delete episode', message: e.message });
  }
});

// ── Check-ins ──────────────────────────────────────────────────────────────

// GET /api/health/episodes/:id/check-ins?days=60
router.get('/episodes/:id/check-ins', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 90));
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const rows = await HealthCheckIn.find({
      episodeId: loaded.episode._id,
      date: { $gte: since },
    }).sort({ date: 1 }).lean();
    return res.json(rows);
  } catch (e) {
    console.error('[Health] list check-ins failed:', e);
    return res.status(500).json({ error: 'Failed to load check-ins', message: e.message });
  }
});

// PUT /api/health/episodes/:id/check-ins — upsert one (date, trigger) report.
router.put('/episodes/:id/check-ins', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    if (!loaded.isAthlete) {
      return res.status(403).json({ error: 'Only the athlete can submit a check-in' });
    }
    const { episode } = loaded;
    const entry = getCatalogEntry(episode.catalogId);

    const b = req.body || {};
    const date = DATE_RE.test(String(b.date || '')) ? String(b.date) : todayKey();
    const trigger = ['daily', 'post_session', 'next_morning', 'weekly', 'manual'].includes(b.trigger)
      ? b.trigger : 'daily';

    const clamp = (v) => (v == null || v === '' ? null : Math.min(10, Math.max(0, Number(v))));

    const doc = await HealthCheckIn.findOneAndUpdate(
      { athleteId: episode.athleteId, episodeId: episode._id, date, trigger },
      {
        $set: {
          hallmarkKey: entry?.hallmark?.key || null,
          hallmarkValue: b.hallmarkValue == null || b.hallmarkValue === ''
            ? null : Number(b.hallmarkValue),
          painNow: clamp(b.painNow),
          painDuringSession: clamp(b.painDuringSession),
          painNextMorning: clamp(b.painNextMorning),
          stiffnessMinutes: b.stiffnessMinutes == null ? null : Number(b.stiffnessMinutes),
          limping: Boolean(b.limping),
          swelling: Boolean(b.swelling),
          nightPain: Boolean(b.nightPain),
          painAtRest: Boolean(b.painAtRest),
          redFlagsReported: Array.isArray(b.redFlagsReported) ? b.redFlagsReported : [],
          functionalTests: Array.isArray(b.functionalTests) ? b.functionalTests : [],
          confidence: b.confidence == null ? null : Math.min(5, Math.max(1, Number(b.confidence))),
          symptoms: Array.isArray(b.symptoms) ? b.symptoms : [],
          temperatureC: b.temperatureC == null || b.temperatureC === '' ? null : Number(b.temperatureC),
          aboveNeckOnly: b.aboveNeckOnly == null ? null : Boolean(b.aboveNeckOnly),
          trainingId: b.trainingId || null,
          note: String(b.note || '').slice(0, 1000),
        },
        $setOnInsert: { athleteId: episode.athleteId, episodeId: episode._id, date, trigger },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
    );

    // findOneAndUpdate skips pre('save'), so symmetry would stay null. A plain
    // re-save runs the hook that fills it.
    if (doc.functionalTests?.length) await doc.save();

    // Re-evaluate immediately so the client gets the verdict in the same
    // round-trip the check-in was submitted in.
    const gate = await evaluateForEpisode(episode, entry);
    await HealthEpisode.updateOne({ _id: episode._id }, {
      $set: {
        'lastGate.light': gate.light,
        'lastGate.evaluatedAt': new Date(),
        'lastGate.reasons': gate.reasons,
      },
    }).catch(() => {});

    return res.json({ checkIn: doc.toObject(), gate });
  } catch (e) {
    console.error('[Health] save check-in failed:', e);
    return res.status(500).json({ error: 'Failed to save check-in', message: e.message });
  }
});

// ── Gate ───────────────────────────────────────────────────────────────────

/** Shared evaluation: pulls check-ins, wellness and load, then runs the gate. */
async function evaluateForEpisode(episode, entry) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const sport = primarySportFor(entry);

  const [checkIns, appleWellness, garminWellness, actual] = await Promise.all([
    HealthCheckIn.find({ episodeId: episode._id, date: { $gte: since } }).sort({ date: 1 }).lean(),
    AppleHealthWellness.find({ userId: episode.athleteId, date: { $gte: since } })
      .sort({ date: 1 }).lean().catch(() => []),
    GarminWellness.find({ userId: episode.athleteId, date: { $gte: since } })
      .sort({ date: 1 }).lean().catch(() => []),
    currentWeekLoad(episode.athleteId, sport).catch(() => null),
  ]);

  // Either source will do; prefer whichever has more rows.
  const wellness = (garminWellness.length > appleWellness.length ? garminWellness : appleWellness)
    .map((w) => ({ date: w.date, hrvMs: w.hrvMs, restingHeartRate: w.restingHeartRate }));

  const caps = stageCaps(episode, entry, sport);
  const loadSummary = buildLoadSummary(caps, actual);

  const baseWeekly = episode.baseline?.weeklyDistanceBySport?.[sport];
  const volumePctOfBaseline = baseWeekly > 0 && actual?.distanceM != null
    ? (actual.distanceM / baseWeekly) * 100
    : null;

  const gate = evaluateHealthGate(episode, entry, checkIns, {
    wellness,
    loadSummary,
    sport,
    volumePctOfBaseline,
  });

  return {
    ...gate,
    sport,
    actual,
    volumePctOfBaseline: volumePctOfBaseline != null ? Math.round(volumePctOfBaseline) : null,
    checkInCount: checkIns.length,
  };
}

// GET /api/health/episodes/:id/gate
router.get('/episodes/:id/gate', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    const entry = getCatalogEntry(loaded.episode.catalogId);
    if (!entry) return res.status(400).json({ error: 'Unknown catalogId on episode' });
    const gate = await evaluateForEpisode(loaded.episode, entry);
    return res.json(gate);
  } catch (e) {
    console.error('[Health] gate failed:', e);
    return res.status(500).json({ error: 'Failed to evaluate', message: e.message });
  }
});

// GET /api/health/today?athleteId= — everything the dashboard card needs.
router.get('/today', verifyToken, async (req, res) => {
  try {
    const r = await resolveAthlete(req);
    if (!r.ok) return res.status(r.code).json({ error: r.msg });

    const q = { athleteId: r.athleteId, status: { $in: ['active', 'returning'] } };
    if (r.viewerIsCoach) q.isVisibleToCoach = true;
    const episodes = await HealthEpisode.find(q).sort({ startDate: -1 }).lean();

    const items = [];
    for (const episode of episodes) {
      const entry = getCatalogEntry(episode.catalogId);
      if (!entry) continue;
      const gate = await evaluateForEpisode(episode, entry);
      const today = todayKey();
      const existing = await HealthCheckIn.countDocuments({ episodeId: episode._id, date: today });
      items.push({
        episode: shapeEpisode(episode, !r.viewerIsCoach),
        catalogEntry: entry,
        gate,
        checkedInToday: existing > 0,
      });
    }
    return res.json({ items });
  } catch (e) {
    console.error('[Health] today failed:', e);
    return res.status(500).json({ error: 'Failed to load', message: e.message });
  }
});

// ── Stage transitions ──────────────────────────────────────────────────────

// POST /api/health/episodes/:id/advance — next stage, gate permitting.
router.post('/episodes/:id/advance', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    if (!loaded.isAthlete) return res.status(403).json({ error: 'Only the athlete can advance a stage' });

    const { episode } = loaded;
    const entry = getCatalogEntry(episode.catalogId);
    if (!entry) return res.status(400).json({ error: 'Unknown catalogId' });

    const gate = await evaluateForEpisode(episode, entry);
    // `force` exists because a physio may clear something the app cannot see.
    // It is recorded rather than hidden, so the coach view can show it.
    const force = req.body?.force === true;
    if (!gate.canAdvance && !force) {
      return res.status(409).json({
        error: 'Stage gate not met',
        conditions: gate.stageGate?.conditions || [],
      });
    }

    const nextIndex = Math.min(episode.currentStageIndex + 1, entry.stages.length - 1);
    const nextStage = entry.stages[nextIndex];
    const isFinal = nextIndex === entry.stages.length - 1;

    const updated = await HealthEpisode.findByIdAndUpdate(episode._id, {
      $set: {
        currentStageIndex: nextIndex,
        currentStageId: nextStage.id,
        stageStartedAt: todayKey(),
        // 'returning' means the protocol is done but the re-injury window is not.
        status: isFinal ? 'returning' : episode.status,
        ...(force ? { notes: `${episode.notes || ''}\n[${todayKey()}] Stage advanced manually.`.trim() } : {}),
      },
    }, { new: true }).lean();

    return res.json(shapeEpisode(updated, true));
  } catch (e) {
    console.error('[Health] advance failed:', e);
    return res.status(500).json({ error: 'Failed to advance stage', message: e.message });
  }
});

// POST /api/health/episodes/:id/step-back — what a red light triggers.
router.post('/episodes/:id/step-back', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    if (!loaded.isAthlete) return res.status(403).json({ error: 'Only the athlete can step back' });

    const { episode } = loaded;
    const entry = getCatalogEntry(episode.catalogId);
    if (!entry) return res.status(400).json({ error: 'Unknown catalogId' });

    const prevIndex = Math.max(0, episode.currentStageIndex - 1);
    const prevStage = entry.stages[prevIndex];
    const reason = String(req.body?.reason || '').slice(0, 300);

    const updated = await HealthEpisode.findByIdAndUpdate(episode._id, {
      $set: {
        currentStageIndex: prevIndex,
        currentStageId: prevStage.id,
        stageStartedAt: todayKey(),
        status: 'active',
      },
      $inc: { stepBackCount: 1 },
      ...(reason ? { $push: { 'lastGate.reasons': { id: 'step_back', title: 'Stepped back', body: reason } } } : {}),
    }, { new: true }).lean();

    return res.json(shapeEpisode(updated, true));
  } catch (e) {
    console.error('[Health] step back failed:', e);
    return res.status(500).json({ error: 'Failed to step back', message: e.message });
  }
});

// POST /api/health/episodes/:id/speed-cleared — muscle protocols only.
// Records that the athlete tolerated the next step of the speed progression.
router.post('/episodes/:id/speed-cleared', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    if (!loaded.isAthlete) return res.status(403).json({ error: 'Not allowed' });

    const { episode } = loaded;
    const entry = getCatalogEntry(episode.catalogId);
    const stage = currentStage(episode, entry);
    const ladder = stage?.speedProgression;
    if (!ladder?.length) return res.status(400).json({ error: 'This stage has no speed progression' });

    const current = Number(episode.speedPctReached) || 0;
    const next = ladder.find((v) => v > current) || ladder[ladder.length - 1];

    const updated = await HealthEpisode.findByIdAndUpdate(
      episode._id, { $set: { speedPctReached: next } }, { new: true },
    ).lean();
    return res.json(shapeEpisode(updated, true));
  } catch (e) {
    console.error('[Health] speed cleared failed:', e);
    return res.status(500).json({ error: 'Failed to update', message: e.message });
  }
});

module.exports = router;
