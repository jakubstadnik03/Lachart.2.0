const testAbl = require('../abl/testAbl');

const testController = {
    // Get all tests for the authenticated user
    getTests: async (req, res) => {
        try {
            const tests = await testAbl.getTestsByAthleteId(req.user.userId);
            res.json(tests);
        } catch (error) {
            res.status(error.status || 500).json({ 
                error: error.error || 'Error fetching tests' 
            });
        }
    },

    // Get a specific test by ID
    getTestById: async (req, res) => {
        try {
            const test = await testAbl.getTestById(req.params.id);
            if (!test) {
                return res.status(404).json({ error: 'Test not found' });
            }
            res.json(test);
        } catch (error) {
            res.status(500).json({ error: 'Error fetching test' });
        }
    },

    // Create a new test
    createTest: async (req, res) => {
        try {
            const test = await testAbl.createTest(req.body);
            res.status(201).json(test);
        } catch (error) {
            res.status(error.status || 400).json({ 
                error: error.error || 'Error creating test' 
            });
        }
    },

    // Update a test
    updateTest: async (req, res) => {
        try {
            const updatedTest = await testAbl.updateTest(req.params.id, req.body);
            if (!updatedTest) {
                return res.status(404).json({ error: 'Test not found' });
            }
            res.json(updatedTest);
        } catch (error) {
            res.status(500).json({ error: 'Error updating test' });
        }
    },

    // Delete a test
    deleteTest: async (req, res) => {
        try {
            const result = await testAbl.deleteTest(req.params.id);
            if (!result) {
                return res.status(404).json({ error: 'Test not found' });
            }
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error: 'Error deleting test' });
        }
    }
};

module.exports = testController; 