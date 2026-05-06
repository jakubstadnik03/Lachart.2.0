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

// PUT /api/field-lactate/:id/assign — assign to a training lap
router.put('/:id/assign', verifyToken, async (req, res) => {
  try {
    const { trainingId, stravaActivityId, lapIndex, lapNumber, trainingTitle, trainingDate } = req.body;
    const doc = await FieldLactateMeasurement.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    doc.status = 'assigned';
    doc.assignment = { trainingId, stravaActivityId, lapIndex, lapNumber, trainingTitle, trainingDate };
    await doc.save();

    // Write the lactate value into the actual training lap
    if (trainingId && lapIndex != null) {
      try {
        const training = await Training.findById(trainingId);
        if (training && training.results && training.results[lapIndex] != null) {
          training.results[lapIndex].lactate = doc.value;
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
        const sa = await StravaActivity.findOne({ stravaId: stravaActivityId });
        if (sa && sa.laps && sa.laps[lapIndex] != null) {
          sa.laps[lapIndex].lactate = doc.value;
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
