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
      // Convert ObjectId to string since athleteId is stored as String in the schema
      const athleteIdStr = athleteId instanceof mongoose.Types.ObjectId ? athleteId.toString() : String(athleteId);
      const trainings = await this.Training.find({ athleteId: athleteIdStr });
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
      
      // If no athlete IDs provided, return empty array
      if (!athleteIds || athleteIds.length === 0) {
        console.log('No athlete IDs provided, returning empty array');
        return [];
      }
      
      // Convert ObjectIds to strings since athleteId is stored as String in the schema
      const athleteIdStrings = athleteIds.map(id => 
        id instanceof mongoose.Types.ObjectId ? id.toString() : String(id)
      );
      const trainings = await this.Training.find({ athleteId: { $in: athleteIdStrings } });
      console.log('Found trainings:', trainings.length);
      return trainings;
    } catch (error) {
      console.error('Error in findByAthleteIds:', error);
      throw error;
    }
  }

  async createTraining(trainingData) {
    try {
      console.log('Creating training with data:', JSON.stringify(trainingData, null, 2));
      
      // Validace dat
      this.validateTrainingData(trainingData);
      
      console.log('After validation:', JSON.stringify(trainingData, null, 2));
      
      const training = new this.Training(trainingData);
      const savedTraining = await training.save();
      
      console.log('Saved training:', JSON.stringify(savedTraining, null, 2));
      
      return savedTraining;
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
      // Validate the update data
      this.validateTrainingData(updateData);
      
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

  async findByTitle(title, userId) {
    try {
      console.log('Finding trainings with title:', title, 'for user:', userId);
      
      // Normalize the search title by removing spaces and special characters
      const normalizedSearchTitle = title.replace(/[\s-:]/g, '').toLowerCase();
      console.log('Normalized search title:', normalizedSearchTitle);
      
      // Convert ObjectId to string since athleteId is stored as String in the schema
      const userIdStr = userId instanceof mongoose.Types.ObjectId ? userId.toString() : String(userId);
      const trainings = await this.Training.find({ 
        athleteId: userIdStr 
      }).sort({ date: -1 });
      
      console.log('All trainings found:', trainings.length);
      console.log('Training titles:', trainings.map(t => t.title));
      
      // Filter trainings by comparing normalized titles
      const filteredTrainings = trainings.filter(training => {
        const normalizedTrainingTitle = training.title.replace(/[\s-:]/g, '').toLowerCase();
        console.log('Comparing:', {
          original: training.title,
          normalized: normalizedTrainingTitle,
          searchTitle: normalizedSearchTitle,
          matches: normalizedTrainingTitle === normalizedSearchTitle
        });
        return normalizedTrainingTitle === normalizedSearchTitle;
      });
      
      console.log('Filtered trainings:', filteredTrainings.length);
      return filteredTrainings;
    } catch (error) {
      console.error('Error in findByTitle:', error);
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
        // Ensure durationType is set
        if (!result.durationType) {
          result.durationType = 'time'; // Set default durationType
        }
        
        // Validate durationType
        if (!['time', 'distance'].includes(result.durationType)) {
          throw new Error(`Invalid durationType for interval ${index + 1}`);
        }
        
        // Ensure duration is set
        if (!result.duration) {
          result.duration = '0'; // Set default duration
        }
      });
    }

    return true;
  }
}

// Exportujeme třídu, ne instanci
module.exports = TrainingDao;
