const TrainingAbl = require('../abl/trainingAbl');

const trainingController = {
    // Get all training sessions for the authenticated user
    getTrainings: async (req, res) => {
        try {
            const trainings = await TrainingAbl.getTrainingsByAthlete(req.user.userId);
            res.json(trainings);
        } catch (error) {
            res.status(500).json({ error: 'Error fetching trainings' });
        }
    },

    // Get a specific training session by ID
    getTrainingById: async (req, res) => {
        try {
            const training = await TrainingAbl.getTrainingById(req.params.id);
            if (!training) {
                return res.status(404).json({ error: 'Training not found' });
            }
            res.json(training);
        } catch (error) {
            res.status(500).json({ error: 'Error fetching training' });
        }
    },

    // Create a new training session
    createTraining: async (req, res) => {
        try {
            if (typeof req.body === 'string') {
                req.body = JSON.parse(req.body);
            }

            // Validate required fields
            const requiredFields = ['athleteId', 'sport', 'title', 'date'];
            const missingFields = requiredFields.filter(field => !req.body[field]);
            
            if (missingFields.length > 0) {
                return res.status(400).json({
                    error: `Missing required fields: ${missingFields.join(', ')}`
                });
            }

            // Format date
            if (req.body.date) {
                req.body.date = new Date(req.body.date);
            }

            const newTraining = await TrainingAbl.createTraining(req.body);
            res.status(201).json(newTraining);
        } catch (error) {
            res.status(400).json({ 
                error: 'Invalid data format',
                details: error.message 
            });
        }
    },

    // Update a training session
    updateTraining: async (req, res) => {
        try {
            const updatedTraining = await TrainingAbl.updateTraining(req.params.id, req.body);
            if (!updatedTraining) {
                return res.status(404).json({ error: 'Training not found' });
            }
            res.json(updatedTraining);
        } catch (error) {
            res.status(500).json({ error: 'Error updating training' });
        }
    },

    // Delete a training session
    deleteTraining: async (req, res) => {
        try {
            const result = await TrainingAbl.deleteTraining(req.params.id);
            if (!result) {
                return res.status(404).json({ error: 'Training not found' });
            }
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error: 'Error deleting training' });
        }
    }
};

module.exports = trainingController; 