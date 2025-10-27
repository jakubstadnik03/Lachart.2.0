const express = require('express');
const router = express.Router();
const { upload, analyzeFitFile } = require('../controllers/fitAnalyzerController');
const verifyToken = require('../middleware/verifyToken');

// POST /api/fit-analyzer/analyze - Analyze FIT file
router.post('/analyze', verifyToken, upload.single('fitFile'), analyzeFitFile);

module.exports = router;
