import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';

const LactateEntryModal = ({ isOpen, onClose, onSubmit, currentStep, suggestedPower, onCompleteInterval }) => {
  const [lactateValue, setLactateValue] = useState('');
  const [borgValue, setBorgValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (lactateValue && !isNaN(parseFloat(lactateValue)) && parseFloat(lactateValue) > 0) {
      onSubmit(lactateValue, borgValue || null);
      setLactateValue('');
      setBorgValue('');
      if (onCompleteInterval) {
        onCompleteInterval();
      }
    }
  };

  // BORG Scale reference
  const borgScale = [
    { value: 6, label: '6 - No exertion' },
    { value: 7, label: '7 - Extremely light' },
    { value: 8, label: '8' },
    { value: 9, label: '9 - Very light' },
    { value: 10, label: '10' },
    { value: 11, label: '11 - Light' },
    { value: 12, label: '12' },
    { value: 13, label: '13 - Somewhat hard' },
    { value: 14, label: '14' },
    { value: 15, label: '15 - Hard' },
    { value: 16, label: '16' },
    { value: 17, label: '17 - Very hard' },
    { value: 18, label: '18' },
    { value: 19, label: '19 - Extremely hard' },
    { value: 20, label: '20 - Maximal exertion' }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg p-6 max-w-md w-full mx-4 z-50 shadow-xl"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Add Lactate Value</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Step {currentStep}
                  </label>
                  <div className="text-sm text-gray-600 mb-4">
                    Suggested Power: {suggestedPower} W
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lactate Value (mmol/L) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={lactateValue}
                    onChange={(e) => setLactateValue(e.target.value)}
                    placeholder="e.g., 2.5"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    autoFocus
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Enter the blood lactate concentration measured after this interval.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    BORG Intensity (RPE) - Optional
                  </label>
                  <div className="space-y-2">
                    <select
                      value={borgValue}
                      onChange={(e) => setBorgValue(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select BORG value...</option>
                      {borgScale.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500">
                      Rate your perceived exertion during this interval (6-20 scale).
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Add Values & Continue
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default LactateEntryModal;

