// routes/testingRoutes.js
const express = require("express");
const router = express.Router();
const TrainingAbl = require("../abl/trainingAbl");
const verifyToken = require("../middleware/verifyToken");
const trainingController = require('../controllers/trainingController');

/**
 * @swagger
 * /api/training:
 *   get:
 *     summary: Get all training sessions for the authenticated user
 *     tags: [Training]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of training sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Training'
 *       401:
 *         description: Unauthorized
 */
router.get('/', verifyToken, trainingController.getTrainings);

// Get all training titles - MUST be before /:id route
router.get("/titles", verifyToken, async (req, res) => {
  try {
    console.log('User from token:', req.user);
    if (!req.user || !req.user.userId) {
      console.error('No user ID found in token');
      return res.status(401).json({ error: 'No user ID found in token' });
    }
    console.log('Calling TrainingAbl.getTrainingTitles with userId:', req.user.userId);
    const titles = await TrainingAbl.getTrainingTitles(req.user.userId);
    console.log('Successfully retrieved titles:', titles.length);
    res.status(200).json(titles);
  } catch (error) {
    console.error('Error in /training/titles:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
});

// Get trainings by title - MUST be before /:id route
router.get("/title/:title", verifyToken, async (req, res) => {
  try {
    const decodedTitle = decodeURIComponent(req.params.title);
    const trainings = await TrainingAbl.getTrainingsByTitle(decodedTitle, req.user.userId);
    res.status(200).json(trainings);
  } catch (error) {
    console.error('Error in /training/title:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all trainings for an athlete - MUST be before /:id route
// H3 — only self, coach, or admin may fetch another user's trainings
router.get("/athlete/:athleteId", verifyToken, async (req, res) => {
  try {
    const requesterId  = String(req.user.userId);
    const targetId     = String(req.params.athleteId);
    const User         = require('../models/UserModel');
    const requester    = await User.findById(requesterId).lean();
    const role         = String(requester?.role || '').toLowerCase();
    const isPrivileged = ['admin', 'coach', 'tester', 'testing'].includes(role) || requester?.admin === true;

    if (!isPrivileged && requesterId !== targetId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const trainings = await TrainingAbl.getTrainingsByAthlete(req.params.athleteId);
    res.status(200).json(trainings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/training/{id}:
 *   get:
 *     summary: Get a specific training session by ID
 *     tags: [Training]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Training session ID
 *     responses:
 *       200:
 *         description: Training session details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Training'
 *       404:
 *         description: Training session not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', verifyToken, trainingController.getTrainingById);

/**
 * @swagger
 * /api/training:
 *   post:
 *     summary: Create a new training session
 *     tags: [Training]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Training'
 *     responses:
 *       201:
 *         description: Training session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Training'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('/', verifyToken, trainingController.createTraining);

/**
 * @swagger
 * /api/training/{id}:
 *   put:
 *     summary: Update a training session
 *     tags: [Training]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Training session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Training'
 *     responses:
 *       200:
 *         description: Training session updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Training'
 *       404:
 *         description: Training session not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', verifyToken, trainingController.updateTraining);

/**
 * @swagger
 * /api/training/{id}:
 *   delete:
 *     summary: Delete a training session
 *     tags: [Training]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Training session ID
 *     responses:
 *       200:
 *         description: Training session deleted successfully
 *       404:
 *         description: Training session not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', verifyToken, trainingController.deleteTraining);

/**
 * POST /training/from-watch
 *
 * Receives a workout payload posted by the iPhone WebView after the
 * LaChart Apple Watch app finishes a session. Idempotent: re-POSTing the
 * same `sourceWatchActivityId` updates the existing record rather than
 * creating a duplicate. This is important because WCSession occasionally
 * delivers the same transfer twice when the iPhone wakes mid-handoff.
 *
 * Body matches the shape built by `watchWorkoutSync.js`:
 *   title, sport, date, duration, distance, avgHR, maxHR, avgPower,
 *   calories, elevation, avgPace, zoneDistribution, laps,
 *   lactateReadings, aiInsight, coreTempSeries, strydSeries, hsiPeak,
 *   sourceWatchActivityId
 */
router.post('/from-watch', verifyToken, async (req, res) => {
    try {
        const Training = require('../models/training');
        const athleteId = String(req.user?.userId || req.user?._id || '');
        if (!athleteId) return res.status(401).json({ error: 'No athlete id on token' });

        const body = req.body || {};
        const wid  = String(body.sourceWatchActivityId || '').trim();
        if (!wid) {
            return res.status(400).json({ error: 'sourceWatchActivityId is required' });
        }

        // Build the patch we'll apply — explicit field-by-field so unknown
        // properties in the watch payload can't accidentally overwrite
        // protected schema fields.
        const patch = {
            athleteId,
            sport:     body.sport     || 'run',
            title:     body.title     || 'Watch workout',
            date:      body.date ? new Date(body.date) : new Date(),
            duration:  String(body.duration ?? ''),  // string per existing schema
            avgHR:     Number(body.avgHR)     || 0,
            maxHR:     Number(body.maxHR)     || 0,
            avgPower:  Number(body.avgPower)  || 0,
            avgPace:   Number(body.avgPace)   || 0,
            calories:  Number(body.calories)  || 0,
            elevation: Number(body.elevation) || 0,
            distance:  Number(body.distance)  || 0,
            zoneDistribution: (body.zoneDistribution && typeof body.zoneDistribution === 'object')
                ? body.zoneDistribution : undefined,
            laps:            Array.isArray(body.laps)            ? body.laps            : [],
            coreTempSeries:  Array.isArray(body.coreTempSeries)  ? body.coreTempSeries  : [],
            strydSeries:     Array.isArray(body.strydSeries)     ? body.strydSeries     : [],
            hsiPeak:         Number(body.hsiPeak) || 0,
            aiInsight:       body.aiInsight || null,
            sourceWatchActivityId: wid,
        };

        // Upsert by (athleteId, sourceWatchActivityId). `new: true` returns
        // the post-update doc so the JS layer can patch its local cache.
        const saved = await Training.findOneAndUpdate(
            { athleteId, sourceWatchActivityId: wid },
            { $set: patch },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // Best-effort notify so coaches see the new session in their feed
        // without a full refresh. Fire-and-forget — never blocks the POST.
        try {
            const { notifyCoachesOfAthlete } = require('../utils/notificationHelper');
            notifyCoachesOfAthlete(athleteId, {
                type: 'training_from_watch',
                title: 'New watch workout',
                body: `${saved.title} · ${Math.round((saved.distance || 0) / 100) / 10} km`,
                resourceType: 'training',
                resourceId: String(saved._id),
            }).catch(() => {});
        } catch (_) { /* notification helper optional */ }

        return res.status(200).json(saved);
    } catch (err) {
        console.error('[training/from-watch] error:', err.message);
        return res.status(500).json({ error: 'Failed to save watch workout', details: err.message });
    }
});

module.exports = router;
