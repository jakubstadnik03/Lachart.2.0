// dao/trainingDao.js
const mongoose = require('mongoose');
const Training = require("../models/training");

class TrainingDao {
  constructor() {
    this.Training = Training;
  }

  async findByAthleteId(athleteId) {
    try {
      console.log('Finding trainings for athlete:', athleteId);
      // Convert string ID to MongoDB ObjectId if needed
      const objectId = mongoose.Types.ObjectId.isValid(athleteId) ? new mongoose.Types.ObjectId(athleteId) : athleteId;
      const trainings = await this.Training.find({ athleteId: objectId });
      console.log('Found trainings:', trainings.length);
      return trainings;
    } catch (error) {
      console.error('Error in findByAthleteId:', error);
      throw error;
    }
  }

  async findByAthleteIds(athleteIds) {
    try {
      console.log('Finding trainings for athletes:', athleteIds);
      // Convert string IDs to MongoDB ObjectIds if needed
      const objectIds = athleteIds.map(id => 
        mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
      );
      const trainings = await this.Training.find({ athleteId: { $in: objectIds } });
      console.log('Found trainings:', trainings.length);
      return trainings;
    } catch (error) {
      console.error('Error in findByAthleteIds:', error);
      throw error;
    }
  }

  async createTraining(trainingData) {
    try {
      // Validace dat
      this.validateTrainingData(trainingData);
      
      const training = new this.Training(trainingData);
      return await training.save();
    } catch (error) {
      console.error('Error in createTraining:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      return await this.Training.findById(id);
    } catch (error) {
      console.error('Error in findById:', error);
      throw error;
    }
  }

  async update(id, updateData) {
    try {
      return await this.Training.findByIdAndUpdate(id, updateData, { new: true });
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  }

  async delete(id) {
    try {
      return await this.Training.findByIdAndDelete(id);
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  }

  validateTrainingData(trainingData) {
    if (!trainingData.athleteId) {
      throw new Error('athleteId is required');
    }
    if (!trainingData.sport) {
      throw new Error('sport is required');
    }
    if (!trainingData.date) {
      throw new Error('date is required');
    }

    // Validace výsledků
    if (trainingData.results && Array.isArray(trainingData.results)) {
      trainingData.results.forEach((result, index) => {
        if (result.duration && !result.durationType) {
          throw new Error(`durationType is required for interval ${index + 1}`);
        }
        if (result.durationType && !['time', 'distance'].includes(result.durationType)) {
          throw new Error(`Invalid durationType for interval ${index + 1}`);
        }
      });
    }

    return true;
  }
}

// Exportujeme třídu, ne instanci
module.exports = TrainingDao;
