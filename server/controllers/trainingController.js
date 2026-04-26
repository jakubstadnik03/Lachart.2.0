const TrainingAbl = require('../abl/trainingAbl');
const mongoose    = require('mongoose');
const User        = require('../models/UserModel');
const Notification = require('../models/Notification');
// Use the already-compiled model (loaded by trainingDao via ../models/training)
// Avoids Mongoose OverwriteModelError from case-mismatch on macOS module cache
const getTraining = () => mongoose.models.Training || require('../models/training');

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

            // Notify coach(es) that athlete logged a new training (fire-and-forget)
            try {
              const athlete = await User.findById(req.body.athleteId).select('name surname coachIds');
              if (athlete && Array.isArray(athlete.coachIds) && athlete.coachIds.length > 0) {
                const athleteName = `${athlete.name || ''} ${athlete.surname || ''}`.trim() || 'Athlete';
                const sportLabel  = String(req.body.sport || 'training').charAt(0).toUpperCase() + String(req.body.sport || '').slice(1);
                const title       = String(req.body.title || 'New training');
                await Notification.insertMany(
                  athlete.coachIds.map(coachId => ({
                    recipientId:  coachId,
                    type:         'training_logged',
                    title:        `${athleteName} logged a new training`,
                    body:         `${title} · ${sportLabel}`,
                    resourceId:   String(newTraining._id),
                    resourceType: 'training',
                    fromName:     athleteName,
                    read:         false,
                  }))
                );
              }
            } catch (notifErr) {
              console.error('[TrainingNotif] failed to create coach notification:', notifErr.message);
            }
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
            // H2 — ownership check
            const Training = getTraining();
            const training = await Training.findById(req.params.id).lean();
            if (!training) return res.status(404).json({ error: 'Training not found' });

            const requesterId  = String(req.user.userId);
            const ownerId      = String(training.athleteId);
            const requester    = await User.findById(requesterId).lean();
            const role         = String(requester?.role || '').toLowerCase();
            const isPrivileged = ['admin', 'coach', 'tester', 'testing'].includes(role) || requester?.admin === true;

            if (!isPrivileged && requesterId !== ownerId) {
                return res.status(403).json({ error: 'Access denied' });
            }

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
            // H2 — ownership check
            const Training = getTraining();
            const training = await Training.findById(req.params.id).lean();
            if (!training) return res.status(404).json({ error: 'Training not found' });

            const requesterId  = String(req.user.userId);
            const ownerId      = String(training.athleteId);
            const requester    = await User.findById(requesterId).lean();
            const role         = String(requester?.role || '').toLowerCase();
            const isPrivileged = ['admin', 'coach', 'tester', 'testing'].includes(role) || requester?.admin === true;

            if (!isPrivileged && requesterId !== ownerId) {
                return res.status(403).json({ error: 'Access denied' });
            }

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