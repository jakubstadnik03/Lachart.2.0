// dao/TestingDAO.js
const Training = require("../models/training");

class TrainingDao {
  async findByAthleteId(athleteId) {
    try {
      return await Training.find({ athleteId: athleteId });
    } catch (error) {
      console.error('Error in findByAthleteId:', error);
      throw error;
    }
  }

  async create(trainingData) {
    try {
      const training = new Training(trainingData);
      return await training.save();
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      return await Training.findById(id);
    } catch (error) {
      console.error('Error in findById:', error);
      throw error;
    }
  }

  async update(id, updateData) {
    try {
      return await Training.findByIdAndUpdate(id, updateData, { new: true });
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  }

  async delete(id) {
    try {
      return await Training.findByIdAndDelete(id);
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  }
}

module.exports = TrainingDao;
