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

// Get all trainings for an athlete
router.get("/athlete/:athleteId", verifyToken, async (req, res) => {
  try {
    const trainings = await TrainingAbl.getTrainingsByAthlete(req.params.athleteId);
    res.status(200).json(trainings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all training titles
router.get("/titles", verifyToken, async (req, res) => {
  try {
    console.log('User from token:', req.user);
    if (!req.user || !req.user.userId) {
      console.error('No user ID found in token');
      return res.status(401).json({ error: 'No user ID found in token' });
    }
    const titles = await TrainingAbl.getTrainingTitles(req.user.userId);
    res.status(200).json(titles);
  } catch (error) {
    console.error('Error in /training/titles:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
});

// Get trainings by title
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

// Update a training
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const updatedTraining = await TrainingAbl.updateTraining(req.params.id, req.body);
    if (!updatedTraining) {
      return res.status(404).json({ error: "Trénink nenalezen" });
    }
    res.status(200).json(updatedTraining);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a training
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const deletedTraining = await TrainingAbl.deleteTraining(req.params.id);
    if (!deletedTraining) {
      return res.status(404).json({ error: "Trénink nenalezen" });
    }
    res.status(200).json({ message: "Trénink smazán" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
