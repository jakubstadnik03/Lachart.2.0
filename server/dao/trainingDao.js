// dao/trainingDao.js
const Training = require("../models/training");

class TrainingDao {
  constructor() {
    this.Training = Training;
  }

  async findByAthleteId(athleteId) {
    try {
      return await this.Training.find({ athleteId: athleteId });
    } catch (error) {
      console.error('Error in findByAthleteId:', error);
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
    return true;
  }
}

// Exportujeme třídu, ne instanci
module.exports = TrainingDao;
