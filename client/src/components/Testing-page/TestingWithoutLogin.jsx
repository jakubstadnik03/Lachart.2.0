import React, { useState } from 'react';
import { motion } from 'framer-motion';
import LactateCurveCalculator from './LactateCurveCalculator';

const TestingWithoutLogin = () => {
  const [mockData, setMockData] = useState({
    date: new Date().toISOString(),
    sport: 'bike',
    baseLactate: 1.5,
    results: [
      { power: 100, heartRate: 120, lactate: 1.8 },
      { power: 150, heartRate: 140, lactate: 2.2 },
      { power: 200, heartRate: 160, lactate: 2.8 },
      { power: 250, heartRate: 180, lactate: 3.5 },
      { power: 300, heartRate: 200, lactate: 4.2 }
    ]
  });

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-lg shadow-lg p-6"
          >
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Testing Interface (Demo Mode)</h1>
            <LactateCurveCalculator mockData={mockData} />
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default TestingWithoutLogin; 