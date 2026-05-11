// dao/trainingDao.js
const mongoose = require('mongoose');
const Training = require("../models/training");

class TrainingDao {
  constructor() {
    this.Training = Training;
  }

  async findByAthleteId(athleteId) {
    try {
      if (process.env.NODE_ENV !== 'production') {
      console.log('Finding trainings for athlete:', athleteId);
      }
      // Convert ObjectId to string since athleteId is stored as String in the schema
      const athleteIdStr = athleteId instanceof mongoose.Types.ObjectId ? athleteId.toString() : String(athleteId);
      const trainings = await this.Training.find({ athleteId: athleteIdStr })
        // Return all fields. The earlier .select() projection dropped
        // `type`, `description`, top-level `lactate`/`rpe`, and `createdAt`
        // — which the client uses to render exported lactate trainings.
        // Performance is fine without it: per-athlete docs are small and
        // few thousand at most.
        .lean();
      if (process.env.NODE_ENV !== 'production') {
      console.log('Found trainings:', trainings.length);
      }
      return trainings;
    } catch (error) {
      console.error('Error in findByAthleteId:', error);
      throw error;
    }
  }

  async findByAthleteIds(athleteIds) {
    try {
      if (process.env.NODE_ENV !== 'production') {
      console.log('Finding trainings for athletes:', athleteIds);
      }
      
      // If no athlete IDs provided, return empty array
      if (!athleteIds || athleteIds.length === 0) {
        console.log('No athlete IDs provided, returning empty array');
        return [];
      }
      
      // Convert ObjectIds to strings since athleteId is stored as String in the schema
      const athleteIdStrings = athleteIds.map(id => 
        id instanceof mongoose.Types.ObjectId ? id.toString() : String(id)
      );
      const trainings = await this.Training.find({ athleteId: { $in: athleteIdStrings } })
        // Return all fields. The earlier .select() projection dropped
        // `type`, `description`, top-level `lactate`/`rpe`, and `createdAt`
        // — which the client uses to render exported lactate trainings.
        // Performance is fine without it: per-athlete docs are small and
        // few thousand at most.
        .lean();
      if (process.env.NODE_ENV !== 'production') {
      console.log('Found trainings:', trainings.length);
      }
      return trainings;
    } catch (error) {
      console.error('Error in findByAthleteIds:', error);
      throw error;
    }
  }

  async countByAthleteIds(athleteIds) {
    try {
      if (!athleteIds || athleteIds.length === 0) return 0;
      const athleteIdStrings = athleteIds.map(id => String(id));
      const count = await this.Training.countDocuments({ athleteId: { $in: athleteIdStrings } });
      return count;
    } catch (error) {
      console.error('Error in countByAthleteIds:', error);
      throw error;
    }
  }

  // Returns a Map: athleteId (string) -> count of trainings
  async countByAthleteIdsGrouped(athleteIds) {
    try {
      if (!athleteIds || athleteIds.length === 0) return new Map();
      const athleteIdStrings = athleteIds.map(id => String(id));
      const rows = await this.Training.aggregate([
        { $match: { athleteId: { $in: athleteIdStrings } } },
        { $group: { _id: '$athleteId', count: { $sum: 1 } } }
      ]);
      return new Map((rows || []).map(r => [String(r._id), Number(r.count || 0)]));
    } catch (error) {
      console.error('Error in countByAthleteIdsGrouped:', error);
      throw error;
    }
  }

  async createTraining(trainingData) {
    try {
      if (process.env.NODE_ENV !== 'production') {
      console.log('Creating training with data:', JSON.stringify(trainingData, null, 2));
      }
      
      // Validace dat
      this.validateTrainingData(trainingData);
      
      if (process.env.NODE_ENV !== 'production') {
      console.log('After validation:', JSON.stringify(trainingData, null, 2));
      }
      
      const training = new this.Training(trainingData);
      const savedTraining = await training.save();
      
      if (process.env.NODE_ENV !== 'production') {
      console.log('Saved training:', JSON.stringify(savedTraining, null, 2));
      }
      
      return savedTraining;
    } catch (error) {
      console.error('Error in createTraining:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      return await this.Training.findById(id).lean();
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
      if (process.env.NODE_ENV !== 'production') {
      console.log('Finding trainings with title:', title, 'for user:', userId);
      }
      
      // Normalize the search title by removing spaces and special characters
      const normalizedSearchTitle = title.replace(/[\s-:]/g, '').toLowerCase();
      if (process.env.NODE_ENV !== 'production') {
      console.log('Normalized search title:', normalizedSearchTitle);
      }
      
      // Convert ObjectId to string since athleteId is stored as String in the schema
      const userIdStr = userId instanceof mongoose.Types.ObjectId ? userId.toString() : String(userId);
      const trainings = await this.Training.find({ 
        athleteId: userIdStr 
      })
      .sort({ date: -1 })
      .lean();
      
      if (process.env.NODE_ENV !== 'production') {
      console.log('All trainings found:', trainings.length);
      console.log('Training titles:', trainings.map(t => t.title));
      }
      
      // Filter trainings by comparing normalized titles
      const filteredTrainings = trainings.filter(training => {
        const normalizedTrainingTitle = training.title.replace(/[\s-:]/g, '').toLowerCase();
        if (process.env.NODE_ENV !== 'production') {
        console.log('Comparing:', {
          original: training.title,
          normalized: normalizedTrainingTitle,
          searchTitle: normalizedSearchTitle,
          matches: normalizedTrainingTitle === normalizedSearchTitle
        });
        }
        return normalizedTrainingTitle === normalizedSearchTitle;
      });
      
      if (process.env.NODE_ENV !== 'production') {
      console.log('Filtered trainings:', filteredTrainings.length);
      }
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
        
        // Ensure duration is set (should be a number in seconds)
        if (result.duration === undefined || result.duration === null) {
          // If durationSeconds exists, use it; otherwise default to 0
          const fromSec =
            result.durationSeconds !== undefined && result.durationSeconds !== null
              ? typeof result.durationSeconds === 'number'
                ? result.durationSeconds
                : parseFloat(result.durationSeconds) || 0
              : 0;
          result.duration = Math.round(fromSec);
        } else {
          // Convert duration to number if it's a string
          const d =
            typeof result.duration === 'number'
              ? result.duration
              : parseFloat(result.duration) || 0;
          result.duration = Math.round(d);
        }
        
        // Ensure durationSeconds matches duration
        if (result.durationSeconds === undefined || result.durationSeconds === null) {
          result.durationSeconds = result.duration;
        } else {
          const ds =
            typeof result.durationSeconds === 'number'
              ? result.durationSeconds
              : parseFloat(result.durationSeconds) || 0;
          result.durationSeconds = Math.round(ds);
        }
        
        // Ensure rest is set (should be a number in seconds)
        if (result.rest === undefined || result.rest === null) {
          // If restSeconds exists, use it; otherwise default to 0
          result.rest = result.restSeconds !== undefined && result.restSeconds !== null 
            ? (typeof result.restSeconds === 'number' ? result.restSeconds : parseFloat(result.restSeconds) || 0)
            : 0;
        } else {
          const r =
            typeof result.rest === 'number' ? result.rest : parseFloat(result.rest) || 0;
          result.rest = Math.round(r);
        }
        
        // Ensure restSeconds matches rest
        if (result.restSeconds === undefined || result.restSeconds === null) {
          result.restSeconds = result.rest;
        } else {
          const rs =
            typeof result.restSeconds === 'number'
              ? result.restSeconds
              : parseFloat(result.restSeconds) || 0;
          result.restSeconds = Math.round(rs);
        }

        if (
          result.elevation !== undefined &&
          result.elevation !== null &&
          result.elevation !== ''
        ) {
          const e = parseFloat(result.elevation);
          if (Number.isFinite(e)) {
            result.elevation = Math.round(e);
          } else {
            delete result.elevation;
          }
        } else {
          delete result.elevation;
        }
      });
    }

    return true;
  }
}

// Exportujeme třídu, ne instanci
module.exports = TrainingDao;
