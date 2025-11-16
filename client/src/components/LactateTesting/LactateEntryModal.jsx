import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';

const LactateEntryModal = ({ isOpen, onClose, onSubmit, currentStep, suggestedPower, onCompleteInterval, currentHeartRate, recoveryTime, onStartNextInterval, testState, phase }) => {
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
            className="fixed inset-0 bg-black bg-opacity-50 z-[9998]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: '-50%', y: '-50%' }}
            animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
            exit={{ opacity: 0, scale: 0.9, x: '-50%', y: '-50%' }}
            className="fixed top-1/2 left-1/2 bg-white/70 backdrop-blur-lg rounded-2xl p-6 max-w-md w-[90%] sm:w-full z-[9999] shadow-xl border border-white/40"
            style={{ 
              position: 'fixed',
              top: '50%',
              left: '50%',
              maxWidth: '28rem'
            }}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Add Lactate Value</h2>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700"
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
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-600 mb-1">Current Heart Rate</div>
                      <div className="text-lg font-semibold text-blue-700">
                        {currentHeartRate ? `${Math.round(currentHeartRate)} bpm` : 'N/A'}
                      </div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="text-xs text-gray-600 mb-1">Recovery Time</div>
                      <div className="text-lg font-semibold text-green-700">
                        {recoveryTime ? `${Math.floor(recoveryTime / 60)}:${String(recoveryTime % 60).padStart(2, '0')}` : '0:00'}
                      </div>
                    </div>
                  </div>
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
                    className="w-full px-4 py-2 border border-white/40 bg-white/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
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
                      className="w-full px-4 py-2 border border-white/40 bg-white/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
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

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2 bg-white/70 text-gray-700 rounded-xl hover:bg-white border border-white/40 shadow"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 shadow"
                  >
                    Add Values
                  </button>
                </div>
                {testState === 'running' && phase === 'recovery' && onStartNextInterval && (
                  <button
                    type="button"
                    onClick={() => {
                      onSubmit(lactateValue || '0', borgValue || null);
                      onStartNextInterval();
                    }}
                    disabled={!lactateValue || isNaN(parseFloat(lactateValue)) || parseFloat(lactateValue) <= 0}
                    className="w-full px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 shadow disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Add Values & Start Next Interval
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default LactateEntryModal;

