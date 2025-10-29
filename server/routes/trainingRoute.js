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
router.get("/athlete/:athleteId", verifyToken, async (req, res) => {
  try {
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

module.exports = router;
