import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import LactatePredictionWidget from '../components/LactateAnalysis/LactatePredictionWidget';

const LactatePredictionDemo = () => {
  const [currentPower, setCurrentPower] = useState(250);
  const [currentHR, setCurrentHR] = useState(150);
  const [currentCadence, setCurrentCadence] = useState(90);
  const [intervalType, setIntervalType] = useState('work');
  const [timeInInterval, setTimeInInterval] = useState(0);
  const [targetLactateMin, setTargetLactateMin] = useState(2.0);
  const [targetLactateMax, setTargetLactateMax] = useState(4.0);
  const [isTraining, setIsTraining] = useState(false);
  const [predictionHistory, setPredictionHistory] = useState([]);

  // Simulate training session
  useEffect(() => {
    let interval;
    
    if (isTraining) {
      interval = setInterval(() => {
        setTimeInInterval(prev => prev + 1);
        
        // Simulate power and HR changes during training
        setCurrentPower(prev => {
          const variation = (Math.random() - 0.5) * 20;
          return Math.max(200, Math.min(400, prev + variation));
        });
        
        setCurrentHR(prev => {
          const variation = (Math.random() - 0.5) * 5;
          return Math.max(120, Math.min(200, prev + variation));
        });
        
        setCurrentCadence(prev => {
          const variation = (Math.random() - 0.5) * 5;
          return Math.max(80, Math.min(120, prev + variation));
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTraining]);

  const handlePredictionUpdate = (prediction) => {
    console.log('🔄 Prediction update received in demo:', prediction);
    setPredictionHistory(prev => [
      ...prev.slice(-9), // Keep last 10 predictions
      {
        ...prediction,
        timestamp: new Date(),
        power: currentPower,
        hr: currentHR
      }
    ]);
  };

  const startTraining = () => {
    console.log('🏃 Starting training simulation');
    setIsTraining(true);
    setTimeInInterval(0);
    setPredictionHistory([]);
  };

  const stopTraining = () => {
    console.log('⏹️ Stopping training simulation');
    setIsTraining(false);
  };

  const resetTraining = () => {
    console.log('🔄 Resetting training simulation');
    setIsTraining(false);
    setTimeInInterval(0);
    setCurrentPower(250);
    setCurrentHR(150);
    setCurrentCadence(90);
    setPredictionHistory([]);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-gray-900">ML Lactate Prediction Demo</h1>
          <p className="mt-2 text-gray-600">
            Real-time lactate prediction using machine learning during training
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Prediction Widget */}
          <div>
            <LactatePredictionWidget
              currentPower={currentPower}
              currentHR={currentHR}
              currentCadence={currentCadence}
              intervalType={intervalType}
              timeInInterval={timeInInterval}
              targetLactateMin={targetLactateMin}
              targetLactateMax={targetLactateMax}
              onPredictionUpdate={handlePredictionUpdate}
            />
          </div>

          {/* Controls */}
          <div className="space-y-6">
            {/* Training Controls */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Training Controls</h3>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={startTraining}
                    disabled={isTraining}
                    className={`px-4 py-2 rounded-md font-medium ${
                      isTraining 
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    Start Training
                  </button>
                  
                  <button
                    onClick={stopTraining}
                    disabled={!isTraining}
                    className={`px-4 py-2 rounded-md font-medium ${
                      !isTraining 
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                        : 'bg-red-500 text-white hover:bg-red-600'
                    }`}
                  >
                    Stop Training
                  </button>
                  
                  <button
                    onClick={resetTraining}
                    className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
                  >
                    Reset
                  </button>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-800">
                    {formatTime(timeInInterval)}
                  </div>
                  <div className="text-sm text-gray-600">Training Time</div>
                </div>
              </div>
            </div>

            {/* Parameter Controls */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Training Parameters</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Power (W): {currentPower}
                  </label>
                  <input
                    type="range"
                    min="200"
                    max="400"
                    value={currentPower}
                    onChange={(e) => setCurrentPower(parseInt(e.target.value))}
                    disabled={isTraining}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Heart Rate (bpm): {currentHR}
                  </label>
                  <input
                    type="range"
                    min="120"
                    max="200"
                    value={currentHR}
                    onChange={(e) => setCurrentHR(parseInt(e.target.value))}
                    disabled={isTraining}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cadence (rpm): {currentCadence}
                  </label>
                  <input
                    type="range"
                    min="80"
                    max="120"
                    value={currentCadence}
                    onChange={(e) => setCurrentCadence(parseInt(e.target.value))}
                    disabled={isTraining}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Interval Type
                  </label>
                  <select
                    value={intervalType}
                    onChange={(e) => setIntervalType(e.target.value)}
                    disabled={isTraining}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="work">Work</option>
                    <option value="rest">Rest</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Target Zones */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Target Lactate Zones</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Min Lactate (mmol/L): {targetLactateMin}
                  </label>
                  <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.1"
                    value={targetLactateMin}
                    onChange={(e) => setTargetLactateMin(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Lactate (mmol/L): {targetLactateMax}
                  </label>
                  <input
                    type="range"
                    min="2.0"
                    max="6.0"
                    step="0.1"
                    value={targetLactateMax}
                    onChange={(e) => setTargetLactateMax(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Prediction History */}
        {predictionHistory.length > 0 && (
          <div className="mt-8">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Prediction History</h3>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Time</th>
                      <th className="text-left py-2">Predicted Lactate</th>
                      <th className="text-left py-2">Confidence</th>
                      <th className="text-left py-2">Power</th>
                      <th className="text-left py-2">HR</th>
                      <th className="text-left py-2">Zone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {predictionHistory.slice(-10).reverse().map((pred, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="py-2">{formatTime(pred.timestamp.getSeconds())}</td>
                        <td className="py-2 font-medium">{pred.predictedLactate?.toFixed(1)} mmol/L</td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            pred.confidence > 0.7 ? 'bg-green-100 text-green-800' :
                            pred.confidence > 0.4 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {(pred.confidence * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-2">{pred.power}W</td>
                        <td className="py-2">{pred.hr} bpm</td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            pred.predictedLactate < targetLactateMin ? 'bg-yellow-100 text-yellow-800' :
                            pred.predictedLactate > targetLactateMax ? 'bg-red-100 text-red-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {pred.predictedLactate < targetLactateMin ? 'Below' :
                             pred.predictedLactate > targetLactateMax ? 'Above' : 'In Zone'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* How it Works */}
        <div className="mt-8">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">How ML Lactate Prediction Works</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-blue-600 font-bold">1</span>
                </div>
                <h4 className="font-semibold text-gray-800 mb-2">Data Collection</h4>
                <p className="text-sm text-gray-600">
                  Collects real-time power, HR, cadence, and environmental data during training
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-green-600 font-bold">2</span>
                </div>
                <h4 className="font-semibold text-gray-800 mb-2">ML Model Training</h4>
                <p className="text-sm text-gray-600">
                  Trains on historical lactate measurements to learn patterns and relationships
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-purple-600 font-bold">3</span>
                </div>
                <h4 className="font-semibold text-gray-800 mb-2">Real-time Prediction</h4>
                <p className="text-sm text-gray-600">
                  Predicts lactate levels and provides training recommendations in real-time
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LactatePredictionDemo;
