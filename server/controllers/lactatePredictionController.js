const LactatePredictor = require('../utils/lactatePrediction');
const LactateSession = require('../models/LactateSession');
const Test = require('../models/test'); // Import Test model
const Training = require('../models/training'); // Import Training model

// Global predictor instance
const predictor = new LactatePredictor();

/**
 * Load historical data from tests and trainings for ML training
 */
const loadHistoricalData = async (athleteId, sport) => {
  try {
    console.log(`📊 Loading historical data for athlete ${athleteId}, sport: ${sport}`);
    
    // Load tests
    const tests = await Test.find({ 
      athleteId, 
      sport,
      'results.lactate': { $exists: true, $ne: null }
    }).sort({ createdAt: -1 }).limit(20);
    
    console.log(`📈 Found ${tests.length} tests with lactate data`);
    
    // Load trainings
    const trainings = await Training.find({ 
      athleteId,
      sport,
      'results.lactate': { $exists: true, $ne: null }
    }).sort({ createdAt: -1 }).limit(20);
    
    console.log(`🏃 Found ${trainings.length} trainings with lactate data`);
    
    // Convert tests to training data format
    const testData = tests.flatMap(test => {
      return test.results.map((result, index) => ({
        features: {
          power_avg_30s: result.power || 0,
          power_avg_60s: result.power || 0,
          power_avg_90s: result.power || 0,
          hr_avg_30s: result.heartRate || 0,
          hr_avg_60s: result.heartRate || 0,
          hr_avg_90s: result.heartRate || 0,
          hr_drift_30s: 0,
          hr_drift_60s: 0,
          cadence_avg_30s: 0,
          cadence_avg_60s: 0,
          temp_c: 20,
          altitude_m: 0,
          interval_id: index + 1,
          time_in_interval_s: index * 180, // Assume 3min intervals
          previous_lactate_1: index > 0 ? test.results[index - 1].lactate : 0,
          previous_lactate_2: index > 1 ? test.results[index - 2].lactate : 0,
          previous_lactate_3: index > 2 ? test.results[index - 3].lactate : 0,
          lactate_trend: index > 0 ? result.lactate - test.results[index - 1].lactate : 0,
          clearance_rate: 0
        },
        lactate: result.lactate,
        timestamp: test.createdAt,
        source: 'test'
      }));
    });
    
    // Convert trainings to training data format
    const trainingData = trainings.flatMap(training => {
      return training.results.map((result, index) => ({
        features: {
          power_avg_30s: result.power || 0,
          power_avg_60s: result.power || 0,
          power_avg_90s: result.power || 0,
          hr_avg_30s: result.heartRate || 0,
          hr_avg_60s: result.heartRate || 0,
          hr_avg_90s: result.heartRate || 0,
          hr_drift_30s: 0,
          hr_drift_60s: 0,
          cadence_avg_30s: 0,
          cadence_avg_60s: 0,
          temp_c: 20,
          altitude_m: 0,
          interval_id: index + 1,
          time_in_interval_s: index * 60, // Assume 1min intervals
          previous_lactate_1: index > 0 ? training.results[index - 1].lactate : 0,
          previous_lactate_2: index > 1 ? training.results[index - 2].lactate : 0,
          previous_lactate_3: index > 2 ? training.results[index - 3].lactate : 0,
          lactate_trend: index > 0 ? result.lactate - training.results[index - 1].lactate : 0,
          clearance_rate: 0
        },
        lactate: result.lactate,
        timestamp: training.createdAt,
        source: 'training'
      }));
    });
    
    const allData = [...testData, ...trainingData];
    console.log(`📊 Total historical data points: ${allData.length}`);
    
    return allData;
  } catch (error) {
    console.error('Error loading historical data:', error);
    return [];
  }
};

/**
 * Predict lactate based on current training data
 */
const predictLactate = async (req, res) => {
  try {
    const { 
      currentPower, 
      currentHR, 
      currentCadence, 
      intervalType, 
      timeInInterval,
      targetLactateMin,
      targetLactateMax,
      sessionId,
      athleteId,
      sport = 'run'
    } = req.body;

    console.log(`🔮 Predicting lactate for athlete ${athleteId}, sport: ${sport}`);

    // Load historical data from tests and trainings
    const historicalData = await loadHistoricalData(athleteId, sport);
    
    // Also get lactate session data
    const historicalSessions = await LactateSession.find({ athleteId })
      .sort({ startTime: -1 })
      .limit(10);

    // Extract lactate session data
    const sessionData = [];
    historicalSessions.forEach(session => {
      session.lactateSamples.forEach(sample => {
        sessionData.push({
          valueMmolL: sample.valueMmolL,
          timestamp: sample.timestamp,
          intervalType: sample.intervalId ? 'work' : 'rest'
        });
      });
    });

    // Prepare current data for prediction
    const currentData = {
      powerData: [currentPower], // In real app, this would be a rolling window
      hrData: [currentHR],
      cadenceData: [currentCadence || 0],
      envTempC: 20, // Default, should come from session
      altitudeM: 0,
      intervalId: 1,
      timeInIntervalS: timeInInterval
    };

    // Train model if not already trained and we have historical data
    if (!predictor.isTrained && historicalData.length > 5) {
      console.log(`🧠 Training model with ${historicalData.length} historical data points`);
      
      // Convert historical data to training format
      const trainingData = historicalData.map(data => ({
        features: Object.values(data.features),
        lactate: data.lactate
      }));
      
      predictor.train(trainingData);
      console.log('✅ Model trained successfully');
    } else if (historicalData.length <= 5) {
      console.log(`⚠️ Not enough historical data for training: ${historicalData.length} points`);
    }

    // Make prediction
    const prediction = predictor.predict(currentData, sessionData);

    // Generate recommendations
    const recommendations = predictor.getRecommendations(prediction, {
      min: targetLactateMin,
      max: targetLactateMax
    });

    console.log(`🎯 Prediction result: ${prediction.predictedLactate?.toFixed(2)} mmol/L, confidence: ${prediction.confidence?.toFixed(2)}`);

    res.json({
      predictedLactate: prediction.predictedLactate,
      confidence: prediction.confidence,
      recommendations,
      features: prediction.features,
      timestamp: new Date(),
      modelTrained: predictor.isTrained,
      historicalDataPoints: historicalData.length,
      sessionDataPoints: sessionData.length
    });

  } catch (error) {
    console.error('Error predicting lactate:', error);
    res.status(500).json({ error: 'Failed to predict lactate' });
  }
};

/**
 * Update model with new lactate measurement
 */
const updateModel = async (req, res) => {
  try {
    const { 
      sessionId,
      actualLactate,
      currentPower,
      currentHR,
      currentCadence,
      timeInInterval
    } = req.body;

    // Get session data
    const session = await LactateSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Prepare current data
    const currentData = {
      powerData: [currentPower],
      hrData: [currentHR],
      cadenceData: [currentCadence || 0],
      envTempC: session.envTempC || 20,
      altitudeM: session.altitudeM || 0,
      intervalId: 1,
      timeInIntervalS: timeInInterval
    };

    // Get historical data
    const historicalData = session.lactateSamples.map(sample => ({
      valueMmolL: sample.valueMmolL,
      timestamp: sample.timestamp,
      intervalType: sample.intervalId ? 'work' : 'rest'
    }));

    // Update model with new measurement
    predictor.updateModel(currentData, actualLactate, historicalData);

    res.json({
      success: true,
      message: 'Model updated with new measurement',
      modelPerformance: {
        mse: predictor.model?.meanSquaredError,
        r2: predictor.model?.rSquared
      }
    });

  } catch (error) {
    console.error('Error updating model:', error);
    res.status(500).json({ error: 'Failed to update model' });
  }
};

/**
 * Get model performance metrics
 */
const getModelPerformance = async (req, res) => {
  try {
    if (!predictor.isTrained) {
      return res.json({
        trained: false,
        message: 'Model not yet trained'
      });
    }

    res.json({
      trained: true,
      performance: {
        meanSquaredError: predictor.model.meanSquaredError,
        rSquared: predictor.model.rSquared,
        features: predictor.features
      }
    });

  } catch (error) {
    console.error('Error getting model performance:', error);
    res.status(500).json({ error: 'Failed to get model performance' });
  }
};

/**
 * Train model with historical data
 */
const trainModel = async (req, res) => {
  try {
    const { athleteId } = req.params;
    const { sport = 'run' } = req.body;

    console.log(`🧠 Training model for athlete ${athleteId}, sport: ${sport}`);

    // Load historical data from tests and trainings
    const historicalData = await loadHistoricalData(athleteId, sport);

    if (historicalData.length === 0) {
      return res.status(404).json({ error: 'No training data found' });
    }

    // Convert to training format
    const trainingData = historicalData.map(data => ({
      features: Object.values(data.features),
      lactate: data.lactate
    }));

    // Train the model
    predictor.train(trainingData);

    console.log(`✅ Model trained with ${trainingData.length} data points`);

    res.json({
      success: true,
      message: 'Model trained successfully',
      trainingDataPoints: trainingData.length,
      performance: {
        mse: predictor.model?.meanSquaredError,
        r2: predictor.model?.rSquared
      },
      dataSources: {
        tests: historicalData.filter(d => d.source === 'test').length,
        trainings: historicalData.filter(d => d.source === 'training').length
      }
    });

  } catch (error) {
    console.error('Error training model:', error);
    res.status(500).json({ error: 'Failed to train model' });
  }
};

module.exports = {
  predictLactate,
  updateModel,
  getModelPerformance,
  trainModel
};
