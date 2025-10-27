const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const {
  createSession,
  addIntervals,
  addLactateSamples,
  addStreamPoints,
  analyzeSession,
  getSession,
  getSessionAnalysis,
  getAthleteSessions
} = require('../controllers/lactateController');

const {
  predictLactate,
  updateModel,
  getModelPerformance,
  trainModel
} = require('../controllers/lactatePredictionController');

// Apply authentication middleware to all routes
router.use(verifyToken);

// Create new lactate session
router.post('/sessions', createSession);

// Add intervals to session
router.post('/sessions/:sessionId/intervals', addIntervals);

// Add lactate samples to session
router.post('/sessions/:sessionId/lactate-samples', addLactateSamples);

// Add stream points to session
router.post('/sessions/:sessionId/stream-points', addStreamPoints);

// Analyze session and calculate metrics
router.post('/sessions/:sessionId/analyze', analyzeSession);

// Get specific session
router.get('/sessions/:sessionId', getSession);

// Get session analysis
router.get('/sessions/:sessionId/analysis', getSessionAnalysis);

// Get all sessions for an athlete
router.get('/athletes/:athleteId/sessions', getAthleteSessions);

// ML Prediction routes
router.post('/predict', predictLactate);
router.post('/update-model', updateModel);
router.get('/model-performance', getModelPerformance);
router.post('/train/:athleteId', trainModel);

module.exports = router;
