import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LactatePredictionWidget = ({ 
  currentPower, 
  currentHR, 
  currentCadence, 
  intervalType, 
  timeInInterval,
  targetLactateMin,
  targetLactateMax,
  onPredictionUpdate 
}) => {
  console.log('🔮 LactatePredictionWidget props:', {
    currentPower,
    currentHR,
    currentCadence,
    intervalType,
    timeInInterval,
    targetLactateMin,
    targetLactateMax
  });
  
  const [prediction, setPrediction] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const [recommendations, setRecommendations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Simulate real-time prediction updates
  useEffect(() => {
    const updatePrediction = async () => {
      if (!currentPower || !currentHR) return;

      setIsLoading(true);
      
      try {
        // Simulate API call to get prediction
        const response = await fetch('/api/lactate/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentPower,
            currentHR,
            currentCadence,
            intervalType,
            timeInInterval,
            targetLactateMin,
            targetLactateMax,
            athleteId: '67ee3f1adb0943b29d8eaa53', // Get from context
            sport: 'run' // Get from context
          })
        });
        
        const data = await response.json();
        console.log('🔮 Prediction data received:', data);
        setPrediction(data.predictedLactate);
        setConfidence(data.confidence);
        setRecommendations(data.recommendations || []);
        
        if (onPredictionUpdate) {
          console.log('📤 Calling onPredictionUpdate with:', data);
          onPredictionUpdate(data);
        }
      } catch (error) {
        console.error('Prediction error:', error);
        // Fallback to simple heuristic
        const heuristicPrediction = calculateHeuristicPrediction();
        setPrediction(heuristicPrediction);
        setConfidence(0.3);
        setRecommendations(['Use heuristic prediction - low confidence']);
      } finally {
        setIsLoading(false);
      }
    };

    // Update prediction every 10 seconds
    const interval = setInterval(updatePrediction, 10000);
    updatePrediction(); // Initial prediction

    return () => clearInterval(interval);
  }, [currentPower, currentHR, currentCadence, intervalType, timeInInterval]);

  const calculateHeuristicPrediction = () => {
    // Simple heuristic based on power and HR
    const powerFactor = currentPower / 300; // Normalize to typical power
    const hrFactor = currentHR / 180; // Normalize to typical max HR
    
    // Base lactate + power contribution + HR contribution
    return 1.0 + (powerFactor * 2.0) + (hrFactor * 1.5);
  };

  const getZoneColor = (lactate) => {
    if (lactate < targetLactateMin) return 'text-yellow-600 bg-yellow-50';
    if (lactate > targetLactateMax) return 'text-red-600 bg-red-50';
    return 'text-green-600 bg-green-50';
  };

  const getZoneText = (lactate) => {
    if (lactate < targetLactateMin) return 'Below Target';
    if (lactate > targetLactateMax) return 'Above Target';
    return 'In Target Zone';
  };

  const getConfidenceColor = (conf) => {
    if (conf > 0.7) return 'text-green-600';
    if (conf > 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceText = (conf) => {
    if (conf > 0.7) return 'High';
    if (conf > 0.4) return 'Medium';
    return 'Low';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-lg shadow-lg p-6 border-l-4 border-blue-500"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Lactate Prediction</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            isLoading ? 'bg-yellow-500 animate-pulse' : 
            confidence > 0.7 ? 'bg-green-500' : 
            confidence > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
          }`}></div>
          <span className="text-sm text-gray-600">
            {isLoading ? 'Updating...' : 'Real-time'}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {prediction !== null ? (
          <motion.div
            key="prediction"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Main Prediction Display */}
            <div className="text-center">
              <div className="text-4xl font-bold text-gray-800 mb-2">
                {prediction.toFixed(1)}
              </div>
              <div className="text-sm text-gray-600 mb-3">mmol/L</div>
              
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getZoneColor(prediction)}`}>
                {getZoneText(prediction)}
              </div>
            </div>

            {/* Confidence Indicator */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Confidence:</span>
              <div className="flex items-center space-x-2">
                <div className="w-16 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${confidence * 100}%` }}
                  ></div>
                </div>
                <span className={`text-sm font-medium ${getConfidenceColor(confidence)}`}>
                  {getConfidenceText(confidence)}
                </span>
              </div>
            </div>

            {/* Target Zone Display */}
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-600 mb-2">Target Zone</div>
              <div className="flex items-center justify-between">
                <span className="text-sm">{targetLactateMin} - {targetLactateMax} mmol/L</span>
                <div className="flex space-x-1">
                  <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                </div>
              </div>
            </div>

            {/* Current Metrics */}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{currentPower}</div>
                <div className="text-xs text-gray-600">Power (W)</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{currentHR}</div>
                <div className="text-xs text-gray-600">HR (bpm)</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{currentCadence || 0}</div>
                <div className="text-xs text-gray-600">Cadence</div>
              </div>
            </div>

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Recommendations:</div>
                {recommendations.map((rec, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start space-x-2 p-2 bg-blue-50 rounded-lg"
                  >
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span className="text-sm text-blue-800">{rec}</span>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
          >
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-2 text-gray-600">Initializing prediction...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interval Info */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Interval: {intervalType}</span>
          <span>Time: {Math.floor(timeInInterval / 60)}:{(timeInInterval % 60).toString().padStart(2, '0')}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default LactatePredictionWidget;
