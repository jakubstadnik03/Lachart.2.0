const express = require("express");
const router = express.Router();
const testAbl = require("../abl/testAbl");
const verifyToken = require("../middleware/verifyToken");

// POST /tests - Create a new test
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

// GET /tests/:athleteId - Get tests for an athlete
router.get("/list/:athleteId", verifyToken, async (req, res) => {
    try {
        const tests = await testAbl.getTestsByAthleteId(req.params.athleteId);
        res.json(tests);
    } catch (error) {
        res.status(error.status || 500).json({ 
            error: error.error || 'Chyba při získávání testů' 
        });
    }
});

// GET /tests/test/:id - Get a specific test
router.get("/:id", verifyToken, async (req, res) => {
    try {
        const test = await testAbl.getTestById(req.params.id);
        if (!test) {
            return res.status(404).json({ error: 'Test nenalezen' });
        }
        res.json(test);
    } catch (error) {
        res.status(500).json({ error: 'Chyba při získávání testu' });
    }
});

// PUT /tests/:id - Update a test
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

// DELETE /tests/:id - Delete a test
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
