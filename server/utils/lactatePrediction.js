/**
 * Machine Learning model for lactate prediction
 * Based on real-time training data and historical patterns
 */

class LactatePredictor {
  constructor() {
    this.model = null;
    this.features = [
      'power_avg_30s', 'hr_avg_30s', 'previous_lactate_1', 'time_in_interval_s', 'interval_id'
    ];
    this.isTrained = false;
  }

  /**
   * Extract features from current training data
   * @param {Object} currentData - Current training state
   * @param {Array} historicalData - Previous lactate measurements
   * @returns {Array} Feature vector
   */
  extractFeatures(currentData, historicalData = []) {
    const features = {};

    // Basic features only
    features.power_avg_30s = this.getAveragePower(currentData.powerData, 30);
    features.hr_avg_30s = this.getAverageHR(currentData.hrData, 30);
    features.time_in_interval_s = currentData.timeInIntervalS || 0;
    features.interval_id = currentData.intervalId || 0;

    // Previous lactate
    const recentLactates = historicalData.slice(-1);
    features.previous_lactate_1 = recentLactates[0]?.valueMmolL || 0;

    return this.features.map(feature => features[feature] || 0);
  }

  /**
   * Train the model with historical data
   * @param {Array} trainingData - Array of {features, lactate} objects
   */
  train(trainingData) {
    if (trainingData.length < 5) {
      console.warn('Not enough training data for reliable model');
      return;
    }

    console.log(`🧠 Training with ${trainingData.length} data points`);

    // Extract features and lactate values
    const X = trainingData.map(d => d.features);
    const y = trainingData.map(d => d.lactate);

    try {
      // Simple linear regression with regularization
      const coefficients = this.simpleLinearRegression(X, y);
      
      console.log(`🎯 Coefficients received:`, coefficients);
      
      if (!coefficients || coefficients.length === 0) {
        throw new Error('No coefficients returned from regression');
      }
      
      // Calculate performance metrics
      const mse = this.calculateMSE(X, y, coefficients);
      const r2 = this.calculateRSquared(X, y, coefficients);
      
      this.model = {
        coefficients,
        meanSquaredError: mse,
        rSquared: r2
      };
    } catch (error) {
      console.error('❌ Error in training:', error);
      // Fallback to simple model
      this.model = {
        coefficients: [1.5, 0.001, 0.01, 0.0, 0.0, 0.0], // bias + 5 features
        meanSquaredError: 1.0,
        rSquared: 0.1
      };
    }

    this.isTrained = true;
    console.log('✅ Lactate prediction model trained:', {
      mse: this.model.meanSquaredError,
      r2: this.model.rSquared,
      features: X[0]?.length || 0
    });
  }

  /**
   * Predict lactate based on current features
   * @param {Object} currentData - Current training state
   * @param {Array} historicalData - Previous lactate measurements
   * @returns {Object} Prediction with confidence
   */
  predict(currentData, historicalData = []) {
    if (!this.isTrained) {
      return {
        predictedLactate: 0,
        confidence: 0,
        error: 'Model not trained'
      };
    }

    const features = this.extractFeatures(currentData, historicalData);
    
    const predictedLactate = this.model.coefficients.reduce((sum, coef, i) => {
      return sum + (coef * (features[i] || 0));
    }, this.model.coefficients[0]); // bias term

    // Calculate confidence based on feature quality and model performance
    const confidence = this.calculateConfidence(features, historicalData);

    return {
      predictedLactate: Math.max(0, Math.min(20, predictedLactate)), // Clamp to reasonable range
      confidence: Math.min(1, Math.max(0, confidence)),
      features: this.features.reduce((acc, feature, i) => {
        acc[feature] = features[i];
        return acc;
      }, {}),
      timestamp: new Date()
    };
  }

  /**
   * Online learning - update model with new measurement
   * @param {Object} currentData - Current training state
   * @param {number} actualLactate - Measured lactate value
   * @param {Array} historicalData - Previous lactate measurements
   */
  updateModel(currentData, actualLactate, historicalData = []) {
    const features = this.extractFeatures(currentData, historicalData);
    
    // Add new training example
    const newExample = { features, lactate: actualLactate };
    
    // Simple online learning: adjust coefficients based on prediction error
    const prediction = this.predict(currentData, historicalData);
    const error = actualLactate - prediction.predictedLactate;
    
    // Update coefficients with learning rate
    const learningRate = 0.01;
    this.model.coefficients = this.model.coefficients.map((coef, i) => {
      return coef + (learningRate * error * (features[i] || 0));
    });

    console.log('Model updated with new measurement:', {
      actual: actualLactate,
      predicted: prediction.predictedLactate,
      error: error.toFixed(3)
    });
  }

  /**
   * Get training recommendations based on prediction
   * @param {Object} prediction - Prediction result
   * @param {Object} targets - Target lactate zones
   * @returns {Array} Recommendations
   */
  getRecommendations(prediction, targets) {
    const recommendations = [];
    const { predictedLactate, confidence } = prediction;

    if (confidence < 0.5) {
      recommendations.push('Low confidence prediction - measure lactate soon');
    }

    if (predictedLactate > targets.max) {
      recommendations.push(`Predicted lactate ${predictedLactate.toFixed(1)} > target ${targets.max} - reduce intensity`);
    } else if (predictedLactate < targets.min) {
      recommendations.push(`Predicted lactate ${predictedLactate.toFixed(1)} < target ${targets.min} - can increase intensity`);
    } else {
      recommendations.push(`Predicted lactate ${predictedLactate.toFixed(1)} in target zone - maintain intensity`);
    }

    // Time to target calculation
    if (predictedLactate > targets.max) {
      const timeToTarget = this.calculateTimeToTarget(predictedLactate, targets.max);
      recommendations.push(`Estimated ${timeToTarget.toFixed(0)}s to reach target zone`);
    }

    return recommendations;
  }

  // Helper methods
  getAveragePower(powerData, windowSeconds) {
    if (!powerData || powerData.length === 0) return 0;
    const recent = powerData.slice(-windowSeconds);
    return recent.reduce((sum, p) => sum + p, 0) / recent.length;
  }

  getAverageHR(hrData, windowSeconds) {
    if (!hrData || hrData.length === 0) return 0;
    const recent = hrData.slice(-windowSeconds);
    return recent.reduce((sum, hr) => sum + hr, 0) / recent.length;
  }

  getHRDrift(hrData, windowSeconds) {
    if (!hrData || hrData.length < windowSeconds) return 0;
    const recent = hrData.slice(-windowSeconds);
    const first = recent[0];
    const last = recent[recent.length - 1];
    return (last - first) / windowSeconds; // HR drift per second
  }

  getAverageCadence(cadenceData, windowSeconds) {
    if (!cadenceData || cadenceData.length === 0) return 0;
    const recent = cadenceData.slice(-windowSeconds);
    return recent.reduce((sum, c) => sum + c, 0) / recent.length;
  }

  calculateLactateTrend(lactateData) {
    if (lactateData.length < 2) return 0;
    const first = lactateData[0].valueMmolL;
    const last = lactateData[lactateData.length - 1].valueMmolL;
    return last - first;
  }

  calculateClearanceRate(historicalData) {
    // Find last rest period and calculate clearance rate
    const restPeriods = historicalData.filter(d => d.intervalType === 'rest');
    if (restPeriods.length < 2) return 0;
    
    const lastRest = restPeriods[restPeriods.length - 1];
    const prevRest = restPeriods[restPeriods.length - 2];
    
    return (prevRest.valueMmolL - lastRest.valueMmolL) / 
           ((lastRest.timestamp - prevRest.timestamp) / 60000); // per minute
  }

  calculateConfidence(features, historicalData) {
    // Confidence based on:
    // 1. Amount of historical data
    // 2. Recency of last measurement
    // 3. Feature quality (non-zero values)
    
    const dataRecency = historicalData.length > 0 ? 
      (Date.now() - new Date(historicalData[historicalData.length - 1].timestamp)) / 60000 : 999;
    
    const featureQuality = features.filter(f => f !== 0).length / features.length;
    const dataAmount = Math.min(1, historicalData.length / 10);
    
    return (featureQuality * 0.4 + dataAmount * 0.3 + (dataRecency < 5 ? 0.3 : 0)) * this.model.rSquared;
  }

  calculateTimeToTarget(currentLactate, targetLactate) {
    // Simple linear approximation
    const clearanceRate = 0.1; // mmol/L per minute (typical)
    return ((currentLactate - targetLactate) / clearanceRate) * 60; // seconds
  }

  // Simple linear regression with regularization
  simpleLinearRegression(X, y) {
    const numFeatures = X[0].length;
    const numSamples = X.length;
    
    console.log(`🔧 Training with ${numFeatures} features, ${numSamples} samples`);
    
    // Initialize coefficients with small random values
    const coefficients = [Math.random() * 0.1]; // bias term
    
    for (let i = 0; i < numFeatures; i++) {
      coefficients.push(Math.random() * 0.1);
    }
    
    console.log(`🎯 Initial coefficients:`, coefficients);
    
    // Gradient descent with regularization
    const learningRate = 0.01;
    const regularization = 0.01;
    const iterations = 100;
    
    for (let iter = 0; iter < iterations; iter++) {
      let totalError = 0;
      
      for (let i = 0; i < numSamples; i++) {
        // Calculate prediction
        let prediction = coefficients[0]; // bias
        for (let j = 0; j < numFeatures; j++) {
          prediction += coefficients[j + 1] * X[i][j];
        }
        
        const error = prediction - y[i];
        totalError += error * error;
        
        // Update bias
        coefficients[0] -= learningRate * error;
        
        // Update feature coefficients with regularization
        for (let j = 0; j < numFeatures; j++) {
          coefficients[j + 1] -= learningRate * (error * X[i][j] + regularization * coefficients[j + 1]);
        }
      }
      
      // Early stopping if error is small
      if (totalError / numSamples < 0.1) break;
    }
    
    console.log(`✅ Final coefficients:`, coefficients);
    return coefficients;
  }

  // Linear regression implementation
  linearRegression(X, y) {
    // Add bias term (1) to each feature vector
    const XWithBias = X.map(x => [1, ...x]);
    
    // Calculate (X^T * X)^-1 * X^T * y
    const XT = this.transpose(XWithBias);
    const XTX = this.matrixMultiply(XT, XWithBias);
    const XTXInv = this.matrixInverse(XTX);
    const XTy = this.matrixVectorMultiply(XT, y);
    
    return this.matrixVectorMultiply(XTXInv, XTy);
  }

  calculateMSE(X, y, coefficients) {
    const predictions = X.map(x => {
      let prediction = coefficients[0]; // bias
      for (let i = 0; i < x.length; i++) {
        prediction += coefficients[i + 1] * x[i];
      }
      return prediction;
    });
    
    const errors = predictions.map((pred, i) => pred - y[i]);
    return errors.reduce((sum, err) => sum + err * err, 0) / errors.length;
  }

  calculateRSquared(X, y, coefficients) {
    const predictions = X.map(x => {
      let prediction = coefficients[0]; // bias
      for (let i = 0; i < x.length; i++) {
        prediction += coefficients[i + 1] * x[i];
      }
      return prediction;
    });
    
    const yMean = y.reduce((sum, val) => sum + val, 0) / y.length;
    const ssRes = predictions.reduce((sum, pred, i) => sum + Math.pow(pred - y[i], 2), 0);
    const ssTot = y.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
    
    return ssTot === 0 ? 0 : 1 - (ssRes / ssTot);
  }

  // Feature normalization
  normalizeFeatures(X) {
    const numFeatures = X[0].length;
    this.featureMeans = [];
    this.featureStds = [];
    
    // Calculate means and standard deviations
    for (let j = 0; j < numFeatures; j++) {
      const values = X.map(row => row[j]);
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance) || 1; // Avoid division by zero
      
      this.featureMeans[j] = mean;
      this.featureStds[j] = std;
    }
    
    // Normalize features
    return X.map(row => 
      row.map((val, j) => (val - this.featureMeans[j]) / this.featureStds[j])
    );
  }

  // Select most important features to prevent overfitting
  selectImportantFeatures(X, y) {
    const numFeatures = X[0].length;
    const correlations = [];
    
    // Calculate correlation with lactate for each feature
    for (let j = 0; j < numFeatures; j++) {
      const featureValues = X.map(row => row[j]);
      const correlation = this.calculateCorrelation(featureValues, y);
      correlations.push({ index: j, correlation: Math.abs(correlation) });
    }
    
    // Sort by correlation strength and select top 5 features
    correlations.sort((a, b) => b.correlation - a.correlation);
    const selectedIndices = correlations.slice(0, 5).map(c => c.index);
    
    console.log(`📊 Selected features: ${selectedIndices.map(i => this.features[i]).join(', ')}`);
    
    return X.map(row => selectedIndices.map(i => row[i]));
  }

  calculateCorrelation(x, y) {
    const n = x.length;
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
    const sumY2 = y.reduce((sum, val) => sum + val * val, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  // Matrix operations (simplified)
  transpose(matrix) {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
  }

  matrixMultiply(A, B) {
    const result = [];
    for (let i = 0; i < A.length; i++) {
      result[i] = [];
      for (let j = 0; j < B[0].length; j++) {
        result[i][j] = 0;
        for (let k = 0; k < B.length; k++) {
          result[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return result;
  }

  matrixInverse(matrix) {
    // Simplified 2x2 inverse for demonstration
    // In production, use a proper matrix library
    if (matrix.length === 2 && matrix[0].length === 2) {
      const det = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
      return [
        [matrix[1][1] / det, -matrix[0][1] / det],
        [-matrix[1][0] / det, matrix[0][0] / det]
      ];
    }
    return matrix; // Fallback
  }

  matrixVectorMultiply(matrix, vector) {
    return matrix.map(row => 
      row.reduce((sum, val, i) => sum + val * vector[i], 0)
    );
  }
}

module.exports = LactatePredictor;
