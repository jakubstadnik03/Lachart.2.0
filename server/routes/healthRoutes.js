/**
 * healthRoutes.js - injury and illness episodes, symptom check-ins, and the
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
  captureBaseline, currentWeekLoad, buildLoadSummary, primarySportFor,
} = require('../services/healthBaselineService');
const { weeklyProgress } = require('../services/healthProgressService');
const { isCoachLikeRole, athleteHasCoachUser } = require('../utils/athleteCoachAccess');
const { stageCaps } = require('../utils/healthGate');
const AppleHealthWellness = require('../models/AppleHealthWellness');
const GarminWellness = require('../models/GarminWellness');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** The regex alone accepts 2026-02-31, so the value is round-tripped as well. */
function isDateKey(value) {
  const s = String(value == null ? '' : value).trim();
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

function addDaysKey(key, n) {
  const d = new Date(`${String(key).slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The latest day a human may legitimately claim to be "today".
 *
 * The server clock is UTC and the athlete's is not: at 10:00 in Auckland it is
 * still yesterday in UTC, so a strict `date <= todayKey()` would reject the
 * genuine same-day check-in of everyone east of the meridian. One day of slack
 * accepts every real timezone while still refusing the typo this guards
 * against, which is an entry years out of place.
 */
function maxLoggableDay() {
  return addDaysKey(todayKey(), 1);
}

/**
 * A check-in only means something inside its episode's window, and the gate
 * walks backwards from the newest date it can see: painFreeStreak,
 * symptomFreeStreak and hallmarkStreak all start at the latest check-in and
 * count back day by day. One row dated 1970 or next year therefore does not
 * just look wrong in a list, it silently changes today's verdict. So a supplied
 * date is checked rather than trusted; an absent one still means today.
 */
function validateCheckInDate(raw, { startDate, today, maxDay }) {
  if (raw == null || String(raw).trim() === '') return { ok: true, date: today };
  const date = String(raw).trim();
  if (!isDateKey(date)) {
    return { ok: false, message: 'Check-in date must be a real calendar day in YYYY-MM-DD form' };
  }
  if (date > maxDay) return { ok: false, message: 'A check-in cannot be dated in the future' };
  if (startDate && date < startDate) {
    return {
      ok: false,
      message: `A check-in cannot be dated before the episode started (${startDate})`,
    };
  }
  return { ok: true, date };
}

/** Same rules for the onset day itself, plus the end of the episode as a bound. */
function validateEpisodeStartDate(raw, { endDate, maxDay }) {
  const date = String(raw == null ? '' : raw).trim();
  if (!isDateKey(date)) {
    return { ok: false, message: 'startDate must be a real calendar day in YYYY-MM-DD form' };
  }
  if (date > maxDay) return { ok: false, message: 'startDate cannot be in the future' };
  if (endDate && isDateKey(endDate) && date > endDate) {
    return { ok: false, message: `startDate cannot be after the end date (${endDate})` };
  }
  return { ok: true, date };
}

/**
 * The stage log as plain rows, seeded from the episode itself when it predates
 * the stageHistory field so callers never have to special-case an empty log.
 */
function normalizeStageHistory(episode) {
  const rows = (Array.isArray(episode.stageHistory) ? episode.stageHistory : [])
    .map((h) => ({
      stageId: h.stageId || null,
      stageIndex: Number(h.stageIndex) || 0,
      from: h.from,
      to: h.to || null,
    }))
    .filter((h) => h.from)
    .sort((a, b) => (a.from < b.from ? -1 : 1));

  if (rows.length) return rows;
  if (!episode.startDate) return [];
  return [{
    stageId: episode.currentStageId || null,
    stageIndex: Number(episode.currentStageIndex) || 0,
    from: episode.startDate,
    to: null,
  }];
}

/**
 * Move the log to a corrected onset day.
 *
 * The first stage started when the episode did, so changing startDate without
 * moving it would leave a gap (or an overlap) that the progress chart reads as
 * "no stage covered this week". Later boundaries are dragged forward only if
 * the new onset overtakes them, which keeps every row ordered and touching:
 * from <= to, and each row starting where the previous one ended.
 */
function rebaseStageHistory(history, newStart) {
  const rows = (Array.isArray(history) ? history : []).map((h) => ({ ...h }));
  if (!rows.length) return rows;

  rows[0].from = newStart;
  let cursor = newStart;
  for (const row of rows) {
    if (row.from < cursor) row.from = cursor;
    if (row.to != null && row.to < row.from) row.to = row.from;
    cursor = row.to != null ? row.to : row.from;
  }
  return rows;
}

/**
 * null for a value that is not a number at all; otherwise inside the protocol.
 * null and '' are refused explicitly because Number() turns both into 0, and a
 * request that forgot to send stageIndex must not read as "back to stage one".
 */
function clampStageIndex(value, stageCount) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const last = Math.max(0, (Number(stageCount) || 0) - 1);
  return Math.min(last, Math.max(0, Math.trunc(n)));
}

/**
 * Stamp a manual intervention onto the shared notes.
 *
 * Anything a human overrode has to be visible to whoever reads the episode
 * later, otherwise the stage log looks like the protocol's own verdict. Capped
 * at the same 2000 characters the PATCH handler allows, and trimmed from the
 * FRONT so a long-running episode loses its oldest annotations rather than
 * refusing the newest one.
 */
function appendNote(existing, line) {
  const joined = `${String(existing || '').trim()}\n${line}`.trim();
  return joined.length <= 2000 ? joined : joined.slice(joined.length - 2000);
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

/**
 * Record a stage transition so a past week can still be judged against the
 * ceiling that was in force at the time. Episodes created before stageHistory
 * existed get seeded from episode.startDate first, so the log stays contiguous
 * instead of starting in the middle of the episode.
 */
function appendStageHistory(episode, nextStage, nextIndex, on) {
  const history = normalizeStageHistory(episode);

  const open = history[history.length - 1];
  // Ranges are half-open, so the closing date is also the new stage's start.
  if (open && open.to == null) open.to = on < open.from ? open.from : on;

  history.push({
    stageId: nextStage?.id || null,
    stageIndex: nextIndex,
    from: on,
    to: null,
  });
  return history;
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
      // Opened here so the progress chart never has to guess at stage one.
      stageHistory: [{ stageId: firstStage?.id || null, stageIndex: 0, from: start, to: null }],
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
  // A malformed id is a missing episode, not a server fault - without this,
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

// PATCH /api/health/episodes/:id - athlete-editable fields only.
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

    const { episode } = loaded;

    /**
     * Onset day. An episode logged a week late is stuck with the wrong day, and
     * the wrong day is not cosmetic: "Day N", the earliest legal check-in date,
     * the pre-injury band on the progress chart and the baseline itself are all
     * measured from it.
     */
    if (b.startDate != null && String(b.startDate).trim() !== '') {
      const endDate = patch.endDate !== undefined ? patch.endDate : episode.endDate;
      const v = validateEpisodeStartDate(b.startDate, { endDate, maxDay: maxLoggableDay() });
      if (!v.ok) return res.status(400).json({ error: v.message });

      if (v.date !== episode.startDate) {
        // Moving onset LATER can strand check-ins before it, which is exactly
        // the state the check-in validator refuses to create. Rather than
        // silently leaving rows outside their own episode, say what is in the
        // way so the athlete can delete them first.
        const stranded = await HealthCheckIn.findOne({
          episodeId: episode._id, date: { $lt: v.date },
        }).sort({ date: 1 }).select('date').lean();
        if (stranded) {
          return res.status(400).json({
            error: `A check-in already exists on ${stranded.date}, before the new start date. `
              + 'Delete it first, or pick an earlier start date.',
          });
        }

        patch.startDate = v.date;
        /**
         * The baseline is DEFINED as the 8 weeks before onset, so a different
         * onset is a different window and the frozen numbers no longer describe
         * the athlete before this injury. Every stage ceiling, the progress
         * chart's pctOfBaseline and the muscle speed caps are percentages of
         * those numbers, so leaving them alone would quietly score the whole
         * return against the wrong reference. Recapture rather than keep.
         */
        patch.baseline = await captureBaseline(episode.athleteId, v.date);
        patch.stageHistory = rebaseStageHistory(normalizeStageHistory(episode), v.date);
        const open = patch.stageHistory[patch.stageHistory.length - 1];
        if (open) patch.stageStartedAt = open.from;
      }
    }

    const updated = await HealthEpisode.findByIdAndUpdate(
      req.params.id, { $set: patch }, { new: true },
    ).lean();

    if (updated?.calendarPeriodId
      && (patch.endDate || patch.expectedReturnDate || patch.startDate)) {
      await CalendarPeriod.updateOne(
        { _id: updated.calendarPeriodId },
        {
          $set: {
            startDate: updated.startDate,
            endDate: updated.endDate || updated.expectedReturnDate || updated.startDate,
          },
        },
      ).catch(() => { /* the band is cosmetic - never fail the update over it */ });
    }

    return res.json(shapeEpisode(updated, true));
  } catch (e) {
    console.error('[Health] patch episode failed:', e);
    return res.status(500).json({ error: 'Failed to update episode', message: e.message });
  }
});

// DELETE /api/health/episodes/:id - removes its check-ins and calendar band too.
router.delete('/episodes/:id', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    if (!loaded.isAthlete) {
      return res.status(403).json({ error: 'Only the athlete can delete an episode' });
    }
    const removed = await HealthCheckIn.deleteMany({ episodeId: loaded.episode._id });
    // The band is a mirror, not the record: an episode whose period was already
    // deleted by hand from the calendar must still be deletable here.
    if (loaded.episode.calendarPeriodId) {
      await CalendarPeriod.deleteOne({ _id: loaded.episode.calendarPeriodId })
        .catch((err) => console.error('[Health] calendar period delete failed:', err.message));
    }
    await HealthEpisode.deleteOne({ _id: loaded.episode._id });
    return res.json({ deleted: true, deletedCheckIns: removed?.deletedCount || 0 });
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

// PUT /api/health/episodes/:id/check-ins - upsert one (date, trigger) report.
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
    // Backdating is supported on purpose (someone fills in a missed day), but an
    // unchecked date silently rewrites today's verdict. See validateCheckInDate.
    const when = validateCheckInDate(b.date, {
      startDate: episode.startDate,
      today: todayKey(),
      maxDay: maxLoggableDay(),
    });
    if (!when.ok) return res.status(400).json({ error: when.message });
    const { date } = when;
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
    const gate = await reevaluateAndCache(episode, entry);

    return res.json({ checkIn: doc.toObject(), gate });
  } catch (e) {
    console.error('[Health] save check-in failed:', e);
    return res.status(500).json({ error: 'Failed to save check-in', message: e.message });
  }
});

// DELETE /api/health/episodes/:id/check-ins/:checkInId - remove one report.
// Needed because a mistyped pain score is not just a wrong row in a list: the
// gate reads the worst value it can see, so a bad entry keeps the light red.
router.delete('/episodes/:id/check-ins/:checkInId', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    if (!loaded.isAthlete) {
      return res.status(403).json({ error: 'Only the athlete can delete a check-in' });
    }
    // Same reasoning as loadEpisode: a malformed id is a missing row, not a
    // CastError and a 500.
    const checkInId = String(req.params.checkInId || '');
    if (!mongoose.Types.ObjectId.isValid(checkInId)) {
      return res.status(404).json({ error: 'Check-in not found' });
    }

    const { episode } = loaded;
    // Scoped to the episode, so a valid id belonging to someone else's episode
    // is a 404 rather than a deletion.
    const removed = await HealthCheckIn.findOneAndDelete({
      _id: checkInId, episodeId: episode._id,
    }).lean();
    if (!removed) return res.status(404).json({ error: 'Check-in not found' });

    // The cached verdict was computed with the row that just went away, so
    // leaving it would show a red light with no reason behind it.
    const entry = getCatalogEntry(episode.catalogId);
    const gate = entry ? await reevaluateAndCache(episode, entry) : null;

    return res.json({ deleted: true, checkInId, gate });
  } catch (e) {
    console.error('[Health] delete check-in failed:', e);
    return res.status(500).json({ error: 'Failed to delete check-in', message: e.message });
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

/**
 * Re-run the gate and cache the verdict on the episode.
 *
 * Every write that changes what the gate can see (a new check-in, a deleted
 * one) has to do this, because the dashboard reads lastGate rather than
 * recomputing: a stale cache is a red light the athlete cannot clear.
 */
async function reevaluateAndCache(episode, entry) {
  const gate = await evaluateForEpisode(episode, entry);
  await HealthEpisode.updateOne({ _id: episode._id }, {
    $set: {
      'lastGate.light': gate.light,
      'lastGate.evaluatedAt': new Date(),
      'lastGate.reasons': gate.reasons,
    },
  }).catch(() => {});
  return gate;
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

// GET /api/health/episodes/:id/progress?weeks=8
// The chart series: actual weekly load against the frozen baseline and against
// the stage ceiling that applied at the time. `weeks` is how much pre-injury
// context to include before onset (default 8, the baseline window).
router.get('/episodes/:id/progress', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    const entry = getCatalogEntry(loaded.episode.catalogId);
    if (!entry) return res.status(400).json({ error: 'Unknown catalogId on episode' });
    // A junk ?weeks= falls back to the default rather than to zero context.
    const asked = Number(req.query.weeks);
    const series = await weeklyProgress(loaded.episode, entry, {
      weeks: Number.isFinite(asked) ? asked : undefined,
    });
    return res.json(series);
  } catch (e) {
    console.error('[Health] progress failed:', e);
    return res.status(500).json({ error: 'Failed to build progress', message: e.message });
  }
});

// GET /api/health/today?athleteId= - everything the dashboard card needs.
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

// POST /api/health/episodes/:id/advance - next stage, gate permitting.
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
    const on = todayKey();

    const updated = await HealthEpisode.findByIdAndUpdate(episode._id, {
      $set: {
        currentStageIndex: nextIndex,
        currentStageId: nextStage.id,
        stageStartedAt: on,
        stageHistory: appendStageHistory(episode, nextStage, nextIndex, on),
        // 'returning' means the protocol is done but the re-injury window is not.
        status: isFinal ? 'returning' : episode.status,
        ...(force ? { notes: appendNote(episode.notes, `[${on}] Stage advanced manually.`) } : {}),
      },
    }, { new: true }).lean();

    return res.json(shapeEpisode(updated, true));
  } catch (e) {
    console.error('[Health] advance failed:', e);
    return res.status(500).json({ error: 'Failed to advance stage', message: e.message });
  }
});

// POST /api/health/episodes/:id/step-back - what a red light triggers.
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
    const on = todayKey();

    const updated = await HealthEpisode.findByIdAndUpdate(episode._id, {
      $set: {
        currentStageIndex: prevIndex,
        currentStageId: prevStage.id,
        stageStartedAt: on,
        // A step back is a stage change like any other: the weeks spent in the
        // stage that was too much still have to be scored against its ceiling.
        stageHistory: appendStageHistory(episode, prevStage, prevIndex, on),
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

// POST /api/health/episodes/:id/set-stage - put the episode on a given stage.
//
// Backfill needs this. Someone who logs an injury four weeks after it happened
// is not on stage one, and walking them forward with /advance would both lie
// about when each stage started and demand gate evidence they never recorded.
// Unlike /advance this asks the gate nothing, so it is annotated in the notes
// the same way a forced advance is.
router.post('/episodes/:id/set-stage', verifyToken, async (req, res) => {
  try {
    const loaded = await loadEpisode(req, res);
    if (!loaded) return undefined;
    if (!loaded.isAthlete) {
      return res.status(403).json({ error: 'Only the athlete can set a stage' });
    }

    const { episode } = loaded;
    const entry = getCatalogEntry(episode.catalogId);
    if (!entry) return res.status(400).json({ error: 'Unknown catalogId' });

    const stages = entry.stages || [];
    const index = clampStageIndex(req.body?.stageIndex, stages.length);
    if (index == null) return res.status(400).json({ error: 'stageIndex must be a number' });
    if (!stages.length) return res.status(400).json({ error: 'This protocol has no stages' });

    const stage = stages[index];
    const on = todayKey();

    // Re-selecting the current stage would otherwise append a zero-length row
    // and reset stageStartedAt, which reads as a transition that never happened.
    if (index === episode.currentStageIndex) {
      return res.json(shapeEpisode(episode, true));
    }

    const isFinal = index === stages.length - 1;
    let { status } = episode;
    if (isFinal && status === 'active') status = 'returning';
    // Coming back off the last stage means the protocol is running again.
    if (!isFinal && status === 'returning') status = 'active';

    const updated = await HealthEpisode.findByIdAndUpdate(episode._id, {
      $set: {
        currentStageIndex: index,
        currentStageId: stage.id,
        stageStartedAt: on,
        stageHistory: appendStageHistory(episode, stage, index, on),
        status,
        notes: appendNote(
          episode.notes,
          `[${on}] Stage set manually to ${stage.name} (step ${index + 1} of ${stages.length}).`,
        ),
      },
    }, { new: true }).lean();

    return res.json(shapeEpisode(updated, true));
  } catch (e) {
    console.error('[Health] set stage failed:', e);
    return res.status(500).json({ error: 'Failed to set stage', message: e.message });
  }
});

// POST /api/health/episodes/:id/speed-cleared - muscle protocols only.
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

/**
 * The date and stage-history rules above are pure, and they are the part of
 * this file that can corrupt data rather than just return a wrong page: a bad
 * check-in date rewrites every streak the gate walks, and a broken rebase
 * leaves a gap the progress chart reads as "no stage covered this week".
 * There is no test runner on the server, so they are hung off the router for
 * scripts/checkHealthGate.js to exercise without a database. Route handlers
 * are not exported and are not meant to be called from outside.
 */
module.exports._internals = {
  isDateKey,
  addDaysKey,
  validateCheckInDate,
  validateEpisodeStartDate,
  normalizeStageHistory,
  rebaseStageHistory,
  appendStageHistory,
  clampStageIndex,
  appendNote,
};
