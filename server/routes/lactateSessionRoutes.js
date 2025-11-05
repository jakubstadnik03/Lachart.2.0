const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const lactateSessionController = require('../controllers/lactateSessionController');

/**
 * @swagger
 * /api/lactate-session:
 *   post:
 *     summary: Create new lactate session
 *     tags: [LactateSession]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               sport:
 *                 type: string
 *                 enum: [run, bike, swim]
 *               baseLactate:
 *                 type: number
 *               weight:
 *                 type: number
 *               specifics:
 *                 type: object
 *               comments:
 *                 type: string
 *     responses:
 *       201:
 *         description: Session created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('/', verifyToken, lactateSessionController.createSession);

/**
 * @swagger
 * /api/lactate-session/athlete/{athleteId}:
 *   get:
 *     summary: Get all lactate sessions for athlete
 *     tags: [LactateSession]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: athleteId
 *         required: true
 *         schema:
 *           type: string
 *         description: Athlete ID
 *     responses:
 *       200:
 *         description: List of lactate sessions
 *       401:
 *         description: Unauthorized
 */
router.get('/athlete/:athleteId', verifyToken, lactateSessionController.getSessions);

/**
 * @swagger
 * /api/lactate-session/{id}:
 *   get:
 *     summary: Get lactate session by ID
 *     tags: [LactateSession]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Lactate session details
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', verifyToken, lactateSessionController.getSessionById);

/**
 * @swagger
 * /api/lactate-session/{id}:
 *   put:
 *     summary: Update lactate session
 *     tags: [LactateSession]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               measurements:
 *                 type: array
 *                 items:
 *                   type: object
 *               status:
 *                 type: string
 *                 enum: [active, paused, completed, cancelled]
 *               thresholds:
 *                 type: object
 *               trainingZones:
 *                 type: array
 *     responses:
 *       200:
 *         description: Session updated successfully
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', verifyToken, lactateSessionController.updateSession);

/**
 * @swagger
 * /api/lactate-session/{id}/complete:
 *   post:
 *     summary: Complete lactate session and save FIT file
 *     tags: [LactateSession]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fitFileData:
 *                 type: object
 *               analysisResults:
 *                 type: object
 *     responses:
 *       200:
 *         description: Session completed successfully
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/complete', verifyToken, lactateSessionController.completeSession);

/**
 * @swagger
 * /api/lactate-session/{id}/mock-fit:
 *   post:
 *     summary: Generate mock FIT file for session
 *     tags: [LactateSession]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Mock FIT file generated successfully
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/mock-fit', verifyToken, lactateSessionController.generateMockFitFile);

/**
 * @swagger
 * /api/lactate-session/{id}/download-fit:
 *   get:
 *     summary: Download FIT file for lactate session
 *     tags: [LactateSession]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: FIT file downloaded successfully
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Session or FIT file not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id/download-fit', verifyToken, lactateSessionController.downloadFitFile);

/**
 * @swagger
 * /api/lactate-session/{id}:
 *   delete:
 *     summary: Delete lactate session
 *     tags: [LactateSession]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Session deleted successfully
 *       404:
 *         description: Session not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', verifyToken, lactateSessionController.deleteSession);

module.exports = router;
