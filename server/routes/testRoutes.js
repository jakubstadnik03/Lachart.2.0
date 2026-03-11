const express = require("express");
const router = express.Router();
const testAbl = require("../abl/testAbl");
const verifyToken = require("../middleware/verifyToken");
const testController = require('../controllers/testController');

/**
 * @swagger
 * /api/tests:
 *   get:
 *     summary: Get all tests for the authenticated user
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tests
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Test'
 *       401:
 *         description: Unauthorized
 */
router.get('/', verifyToken, testController.getTests);

/**
 * GET /api/test/population-stats
 * Get population statistics for LT1, LT2, and LT1/LT2 ratio by gender and sport
 * IMPORTANT: This must be defined BEFORE /:id route to avoid matching "population-stats" as an ID
 */
router.get("/population-stats", verifyToken, async (req, res) => {
    try {
        const User = require('../models/UserModel');
        const { gender, sport } = req.query; // gender: 'male' | 'female', sport: 'bike' | 'run'
        
        // Build filter
        const filter = { 
            role: 'athlete',
            isActive: { $ne: false }
        };
        if (gender) {
            filter.gender = gender;
        }
        
        // Get all athletes with powerZones and weight
        const athletes = await User.find(filter).select('powerZones gender weight');
        
        // Helper function to calculate statistics
        const calculateStats = (values) => {
            if (!values || values.length === 0) return null;
            
            const sorted = [...values].sort((a, b) => a - b);
            const count = sorted.length;
            const sum = sorted.reduce((a, b) => a + b, 0);
            const mean = sum / count;
            
            // Standard deviation
            const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
            const sd = Math.sqrt(variance);
            
            // Percentiles
            const percentile = (arr, p) => {
                const index = (p / 100) * (arr.length - 1);
                const lower = Math.floor(index);
                const upper = Math.ceil(index);
                const weight = index - lower;
                if (lower === upper) return arr[lower];
                return arr[lower] * (1 - weight) + arr[upper] * weight;
            };
            
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            const median = percentile(sorted, 50);
            const p25 = percentile(sorted, 25);
            const p75 = percentile(sorted, 75);
            
            // Bell curve distribution (for visualization)
            const bins = 20;
            const binWidth = (max - min) / bins;
            const distribution = Array(bins).fill(0);
            sorted.forEach(val => {
                const binIndex = Math.min(Math.floor((val - min) / binWidth), bins - 1);
                distribution[binIndex]++;
            });
            
            return {
                count,
                mean: Number(mean.toFixed(2)),
                median: Number(median.toFixed(2)),
                sd: Number(sd.toFixed(2)),
                min: Number(min.toFixed(2)),
                max: Number(max.toFixed(2)),
                p25: Number(p25.toFixed(2)),
                p75: Number(p75.toFixed(2)),
                distribution: distribution.map(count => Number((count / sorted.length * 100).toFixed(1)))
            };
        };
        
        // Extract data for bike and run
        const bikeData = {
            lt1: [],
            lt2: [],
            lt1Lt2Ratio: [],
            lt1Wkg: [],
            lt2Wkg: []
        };
        
        const runData = {
            lt1: [],
            lt2: [],
            lt1Lt2Ratio: []
        };
        
        athletes.forEach(athlete => {
            // Bike data
            if (athlete.powerZones?.cycling) {
                const cycling = athlete.powerZones.cycling;
                if (cycling.lt1 && cycling.lt2) {
                    bikeData.lt1.push(cycling.lt1);
                    bikeData.lt2.push(cycling.lt2);
                    bikeData.lt1Lt2Ratio.push(cycling.lt1 / cycling.lt2);
                    
                    // W/kg calculations (only if weight is available)
                    if (athlete.weight && athlete.weight > 0) {
                        bikeData.lt1Wkg.push(cycling.lt1 / athlete.weight);
                        bikeData.lt2Wkg.push(cycling.lt2 / athlete.weight);
                    }
                }
            }
            
            // Run data
            if (athlete.powerZones?.running) {
                const running = athlete.powerZones.running;
                if (running.lt1 && running.lt2) {
                    runData.lt1.push(running.lt1);
                    runData.lt2.push(running.lt2);
                    runData.lt1Lt2Ratio.push(running.lt1 / running.lt2);
                }
            }
        });
        
        // Filter by sport if specified
        const result = {};
        if (!sport || sport === 'bike') {
            result.bike = {
                lt1: calculateStats(bikeData.lt1),
                lt2: calculateStats(bikeData.lt2),
                lt1Lt2Ratio: calculateStats(bikeData.lt1Lt2Ratio),
                lt1Wkg: calculateStats(bikeData.lt1Wkg),
                lt2Wkg: calculateStats(bikeData.lt2Wkg)
            };
        }
        if (!sport || sport === 'run') {
            result.run = {
                lt1: calculateStats(runData.lt1),
                lt2: calculateStats(runData.lt2),
                lt1Lt2Ratio: calculateStats(runData.lt1Lt2Ratio)
            };
        }
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching population stats:', error);
        res.status(500).json({ error: 'Error fetching population statistics' });
    }
});

/**
 * @swagger
 * /api/tests/{id}:
 *   get:
 *     summary: Get a specific test by ID
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Test ID
 *     responses:
 *       200:
 *         description: Test details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Test'
 *       404:
 *         description: Test not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', verifyToken, testController.getTestById);

/**
 * Send a lactate test report to email (HTML + inline SVG)
 * POST /test/:id/send-report-email
 */
router.post('/:id/send-report-email', verifyToken, testController.sendTestReportEmail);

/**
 * Download lactate test report as PDF (same content as email, incl. previous test comparison)
 * GET /test/:id/report-pdf
 */
router.get('/:id/report-pdf', verifyToken, testController.getTestReportPdf);

/**
 * Send demo test results to email (no authentication required)
 * POST /test/send-demo-email
 */
router.post('/send-demo-email', testController.sendDemoTestEmail);

// Compatibility alias: GET /test/list/:athleteId to fetch tests by athlete
router.get('/list/:athleteId', verifyToken, async (req, res) => {
    try {
        const User = require('../models/UserModel');
        const Test = require('../models/test');
        const user = await User.findById(req.user.userId);
        
        // Pouze tester vidí všechny testy; admin/coach/athlete jen svoje (resp. coach i testy atletů)
        const role = String(user?.role || '').toLowerCase();
        if (user && role === 'tester') {
            const allTests = await Test.find({}).sort({ date: -1 });
            return res.status(200).json(allTests);
        }
        
        const { athleteId } = req.params;
        const tests = await testAbl.getTestsByAthleteId(athleteId);
        res.status(200).json(tests);
    } catch (error) {
        console.error('Error fetching athlete tests (alias):', error);
        res.status(error.status || 500).json({ 
            error: error.error || 'Error fetching athlete tests' 
        });
    }
});

/**
 * @swagger
 * /api/tests:
 *   post:
 *     summary: Create a new test
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Test'
 *     responses:
 *       201:
 *         description: Test created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Test'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post("/", verifyToken, async (req, res) => {
    try {
        const User = require('../models/UserModel');
        const user = await User.findById(req.user.userId).select('role');
        const payload = { ...req.body };
        // Athletes can only create tests for themselves (ensures test is saved to current user after register+send)
        if (user && String(user.role || '').toLowerCase() === 'athlete') {
            payload.athleteId = String(req.user.userId);
        }
        // Normalize date so Mongoose accepts it (ISO string or Date)
        if (payload.date) {
            const d = new Date(payload.date);
            if (!isNaN(d.getTime())) payload.date = d;
        }
        const test = await testAbl.createTest(payload);
        console.log(`[Test] Test saved for user ${req.user.userId} → testId=${test._id}, sport=${test.sport}, title="${test.title}"`);
        res.status(201).json(test);
    } catch (error) {
        console.error(`[Test] Failed to save test for user ${req.user?.userId}:`, error.error || error.message);
        res.status(error.status || 400).json({ 
            error: error.error || 'Chyba při vytváření testu' 
        });
    }
});

/**
 * @swagger
 * /api/tests/{id}:
 *   put:
 *     summary: Update a test
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Test ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Test'
 *     responses:
 *       200:
 *         description: Test updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Test'
 *       404:
 *         description: Test not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", verifyToken, async (req, res) => {
    try {
        const updatedTest = await testAbl.updateTest(req.params.id, req.body);
        if (!updatedTest) {
            return res.status(404).json({ error: 'Test nenalezen' });
        }
        res.json(updatedTest);
    } catch (error) {
        res.status(500).json({ error: 'Chyba při aktualizaci testu' });
    }
});

/**
 * @swagger
 * /api/tests/{id}:
 *   delete:
 *     summary: Delete a test
 *     tags: [Tests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Test ID
 *     responses:
 *       200:
 *         description: Test deleted successfully
 *       404:
 *         description: Test not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", verifyToken, async (req, res) => {
    try {
        const result = await testAbl.deleteTest(req.params.id);
        if (!result) {
            return res.status(404).json({ error: 'Test nenalezen' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Chyba při mazání testu' });
    }
});

module.exports = router;
