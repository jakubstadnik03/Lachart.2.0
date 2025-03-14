// dao/TestingDAO.js
const Training = require("../models/training");

class TrainingDao {
  async createTraining(data) {
    try {
      console.log('Creating training with data:', data);
      const newTraining = new Training(data);
      return await newTraining.save();
    } catch (error) {
      console.error('Error in createTraining:', error);
      throw error;
    }
  }

  async getTrainingsByAthlete(athleteId) {
    try {
      return await Training.find({ athleteId });
    } catch (error) {
      console.error('Error in getTrainingsByAthlete:', error);
      throw error;
    }
  }

  async getTrainingById(id) {
    try {
      return await Training.findById(id);
    } catch (error) {
      console.error('Error in getTrainingById:', error);
      throw error;
    }
  }

  async updateTraining(id, updateData) {
    try {
      return await Training.findByIdAndUpdate(id, updateData, { 
        new: true,
        runValidators: true 
      });
    } catch (error) {
      console.error('Error in updateTraining:', error);
      throw error;
    }
  }

  async deleteTraining(id) {
    try {
      return await Training.findByIdAndDelete(id);
    } catch (error) {
      console.error('Error in deleteTraining:', error);
      throw error;
    }
  }
}

module.exports = new TrainingDao();
