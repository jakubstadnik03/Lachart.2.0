const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const FieldLactateMeasurement = require('../models/FieldLactateMeasurement');
const Training = require('../models/training');

// POST /api/field-lactate — record a new measurement
router.post('/', verifyToken, async (req, res) => {
  try {
    const { value, recordedAt, notes, athleteId } = req.body;
    if (!value || isNaN(Number(value))) {
      return res.status(400).json({ error: 'value is required' });
    }
    const targetAthleteId = athleteId || req.user.userId;
    const doc = await FieldLactateMeasurement.create({
      athleteId: targetAthleteId,
      recordedBy: req.user.userId,
      value: Number(value),
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      notes: notes || '',
      status: 'pending',
    });
    res.json(doc);
  } catch (e) {
    console.error('[field-lactate] POST:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/field-lactate?athleteId=...&status=pending
router.get('/', verifyToken, async (req, res) => {
  try {
    const { athleteId, status } = req.query;
    const targetAthleteId = athleteId || req.user.userId;
    const filter = { athleteId: targetAthleteId };
    if (status) filter.status = status;
    const docs = await FieldLactateMeasurement.find(filter)
      .sort({ recordedAt: -1 })
      .limit(50);
    res.json(docs);
  } catch (e) {
    console.error('[field-lactate] GET:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/field-lactate/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const doc = await FieldLactateMeasurement.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const isOwner = String(doc.athleteId) === String(req.user.userId) ||
                    String(doc.recordedBy) === String(req.user.userId);
    if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
    await doc.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Which row of a training's results stands for a given lap of the ride.
 *
 * `lapIndex` means one thing here — the lap of the source activity — and a
 * training's `results` are not that list. A set with the warm-up dropped, or
 * the recoveries deselected, is shorter and shifted, so using the lap number
 * as a position in `results` wrote the reading onto whatever row happened to
 * sit there. `sourceLapIndex` is each row's own record of the lap it came
 * from; `interval` is the older 1-based form of the same thing.
 *
 * `resultIndex`, when the caller sends it, is that caller saying outright
 * which row it meant, and is trusted first.
 */
function resultRowForLap(results, lapIndex, resultIndex) {
  if (!Array.isArray(results)) return -1;
  if (Number.isInteger(resultIndex) && results[resultIndex] != null) return resultIndex;
  const bySource = results.findIndex((r) => Number(r?.sourceLapIndex) === Number(lapIndex));
  if (bySource >= 0) return bySource;
  const byInterval = results.findIndex((r) => Number(r?.interval) - 1 === Number(lapIndex));
  if (byInterval >= 0) return byInterval;
  // Nothing says otherwise: the results really may be the laps, in order.
  return results[lapIndex] != null ? Number(lapIndex) : -1;
}

// PUT /api/field-lactate/:id/assign — assign to a training lap
router.put('/:id/assign', verifyToken, async (req, res) => {
  try {
    const { trainingId, stravaActivityId, lapIndex, lapNumber, trainingTitle, trainingDate, resultIndex } = req.body;
    const doc = await FieldLactateMeasurement.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const isOwner = String(doc.athleteId) === String(req.user.userId)
      || String(doc.recordedBy) === String(req.user.userId);
    if (!isOwner) return res.status(403).json({ error: 'Forbidden' });

    doc.status = 'assigned';
    doc.assignment = { trainingId, stravaActivityId, lapIndex, lapNumber, trainingTitle, trainingDate };
    await doc.save();

    // Write the lactate value into the actual training lap
    if (trainingId && lapIndex != null) {
      try {
        const training = await Training.findById(trainingId);
        const row = resultRowForLap(training?.results, lapIndex, resultIndex);
        if (row >= 0) {
          training.results[row].lactate = doc.value;
          training.markModified('results');
          await training.save();
        }
      } catch (writeErr) {
        console.warn('[field-lactate] assign: could not write to training lap:', writeErr.message);
      }
    }

    // Write to Strava activity laps in DB if applicable
    if (stravaActivityId && lapIndex != null) {
      try {
        const StravaActivity = require('../models/StravaActivity');
        const mongoose = require('mongoose');
        const raw = String(stravaActivityId).replace(/^strava-/i, '').trim();
        // Two id shapes reach this field, both written by code that is in
        // production: the client stores Strava's numeric id, the server stores
        // the activity's Mongo _id. Scoped to the measurement's own athlete —
        // an unscoped stravaId lookup would happily write onto someone else's
        // ride.
        const scope = { userId: doc.athleteId };
        const sa = (raw.length === 24 && mongoose.Types.ObjectId.isValid(raw))
          ? await StravaActivity.findOne({ ...scope, _id: raw })
          : await StravaActivity.findOne({ ...scope, stravaId: Number(raw) });
        if (sa && sa.laps && sa.laps[lapIndex] != null) {
          sa.laps[lapIndex].lactate = doc.value;
          sa.markModified('laps');
          await sa.save();
        }
      } catch (writeErr) {
        console.warn('[field-lactate] assign: could not write to strava laps:', writeErr.message);
      }
    }

    res.json(doc);
  } catch (e) {
    console.error('[field-lactate] PUT assign:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
