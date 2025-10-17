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

// Compatibility alias: GET /test/list/:athleteId to fetch tests by athlete
router.get('/list/:athleteId', verifyToken, async (req, res) => {
    try {
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
        const test = await testAbl.createTest(req.body);
        res.status(201).json(test);
    } catch (error) {
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
