const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const workoutClusteringController = require('../controllers/workoutClusteringController');

/**
 * @swagger
 * /api/workout-clustering/extract/{workoutId}:
 *   post:
 *     summary: Extract workout pattern from a single workout
 *     tags: [Workout Clustering]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workoutId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ftp:
 *                 type: number
 *                 description: Functional Threshold Power for normalization
 *     responses:
 *       200:
 *         description: Pattern extracted successfully
 */
router.post('/extract/:workoutId', verifyToken, workoutClusteringController.extractPattern);

/**
 * @swagger
 * /api/workout-clustering/cluster:
 *   post:
 *     summary: Cluster all workouts for user
 *     tags: [Workout Clustering]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ftp:
 *                 type: number
 *               eps:
 *                 type: number
 *                 default: 0.25
 *               minPts:
 *                 type: number
 *                 default: 3
 *     responses:
 *       200:
 *         description: Clustering completed successfully
 */
router.post('/cluster', verifyToken, workoutClusteringController.clusterWorkouts);

/**
 * @swagger
 * /api/workout-clustering/clusters:
 *   get:
 *     summary: Get all clusters for user
 *     tags: [Workout Clustering]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Clusters retrieved successfully
 */
router.get('/clusters', verifyToken, workoutClusteringController.getClusters);

/**
 * @swagger
 * /api/workout-clustering/cluster/{clusterId}/title:
 *   put:
 *     summary: Update cluster title
 *     tags: [Workout Clustering]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clusterId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               trainingRouteId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Title updated successfully
 */
router.put('/cluster/:clusterId/title', verifyToken, workoutClusteringController.updateClusterTitle);

/**
 * @swagger
 * /api/workout-clustering/similar/{workoutId}:
 *   get:
 *     summary: Get similar workouts to a given workout
 *     tags: [Workout Clustering]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workoutId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: threshold
 *         schema:
 *           type: number
 *           default: 0.75
 *     responses:
 *       200:
 *         description: Similar workouts retrieved successfully
 */
router.get('/similar/:workoutId', verifyToken, workoutClusteringController.getSimilarWorkouts);

module.exports = router;

