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

/**
 * GET /api/test/population-stats
 * Get population statistics for LT1, LT2, and LT1/LT2 ratio by gender and sport
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
            
            // Generate normal distribution points for bell curve
            const generateBellCurve = (mean, sd, min, max, numPoints = 100) => {
                const points = [];
                const step = (max - min) / numPoints;
                for (let i = 0; i <= numPoints; i++) {
                    const x = min + i * step;
                    const y = (1 / (sd * Math.sqrt(2 * Math.PI))) * 
                             Math.exp(-0.5 * Math.pow((x - mean) / sd, 2));
                    points.push({ x, y });
                }
                return points;
            };
            
            return {
                count,
                mean: Math.round(mean * 10) / 10,
                median: Math.round(median * 10) / 10,
                sd: Math.round(sd * 10) / 10,
                min: Math.round(min * 10) / 10,
                max: Math.round(max * 10) / 10,
                p25: Math.round(p25 * 10) / 10,
                p75: Math.round(p75 * 10) / 10,
                distribution: generateBellCurve(mean, sd, min, max)
            };
        };
        
        // Extract values by sport
        const extractValues = (sportType) => {
            const lt1Values = [];
            const lt2Values = [];
            const ratioValues = [];
            const lt1WkgValues = [];
            const lt2WkgValues = [];
            
            athletes.forEach(athlete => {
                const zones = athlete.powerZones?.[sportType];
                if (zones?.lt1 && zones?.lt2 && zones.lt1 > 0 && zones.lt2 > 0) {
                    lt1Values.push(zones.lt1);
                    lt2Values.push(zones.lt2);
                    const ratio = (zones.lt1 / zones.lt2) * 100;
                    if (ratio > 0 && ratio <= 100) {
                        ratioValues.push(ratio);
                    }
                    
                    // Calculate W/kg if weight is available (only for bike)
                    if (sportType === 'cycling' && athlete.weight && athlete.weight > 0) {
                        const lt1Wkg = zones.lt1 / athlete.weight;
                        const lt2Wkg = zones.lt2 / athlete.weight;
                        if (lt1Wkg > 0 && lt1Wkg < 10) { // Reasonable range check
                            lt1WkgValues.push(lt1Wkg);
                        }
                        if (lt2Wkg > 0 && lt2Wkg < 10) { // Reasonable range check
                            lt2WkgValues.push(lt2Wkg);
                        }
                    }
                }
            });
            
            return { lt1Values, lt2Values, ratioValues, lt1WkgValues, lt2WkgValues };
        };
        
        const results = {};
        
        // Bike stats
        if (!sport || sport === 'bike') {
            const { lt1Values, lt2Values, ratioValues, lt1WkgValues, lt2WkgValues } = extractValues('cycling');
            results.bike = {
                lt1: calculateStats(lt1Values),
                lt2: calculateStats(lt2Values),
                lt1Lt2Ratio: calculateStats(ratioValues),
                lt1Wkg: calculateStats(lt1WkgValues),
                lt2Wkg: calculateStats(lt2WkgValues)
            };
        }
        
        // Run stats
        if (!sport || sport === 'run') {
            const { lt1Values, lt2Values, ratioValues } = extractValues('running');
            results.run = {
                lt1: calculateStats(lt1Values),
                lt2: calculateStats(lt2Values),
                lt1Lt2Ratio: calculateStats(ratioValues)
            };
        }
        
        res.json(results);
    } catch (error) {
        console.error('Error fetching population stats:', error);
        res.status(500).json({ error: 'Failed to fetch population statistics' });
    }
});

module.exports = router;
