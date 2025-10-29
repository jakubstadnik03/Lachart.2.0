import React from 'react';
import { motion } from 'framer-motion';
import { Cog6ToothIcon, PencilIcon } from '@heroicons/react/24/outline';

const IntervalManager = ({ protocol, onProtocolChange, testState, onEditProtocol }) => {
  const handleChange = (field, value) => {
    onProtocolChange(prev => ({
      ...prev,
      [field]: typeof value === 'string' ? parseInt(value) || 0 : value
    }));
  };

  const isEditable = testState === 'idle';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-md p-6"
    >
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Cog6ToothIcon className="w-6 h-6" />
        Interval Protocol
      </h2>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Work Duration (s)
            </label>
            <input
              type="number"
              value={protocol.workDuration}
              onChange={(e) => handleChange('workDuration', e.target.value)}
              disabled={!isEditable}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recovery Duration (s)
            </label>
            <input
              type="number"
              value={protocol.recoveryDuration}
              onChange={(e) => handleChange('recoveryDuration', e.target.value)}
              disabled={!isEditable}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Power (W)
            </label>
            <input
              type="number"
              value={protocol.startPower}
              onChange={(e) => handleChange('startPower', e.target.value)}
              disabled={!isEditable}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Power Increment (W)
            </label>
            <input
              type="number"
              value={protocol.powerIncrement}
              onChange={(e) => handleChange('powerIncrement', e.target.value)}
              disabled={!isEditable}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Steps
            </label>
            <input
              type="number"
              value={protocol.maxSteps}
              onChange={(e) => handleChange('maxSteps', e.target.value)}
              disabled={!isEditable}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
            />
          </div>
        </div>

        {/* Protocol Preview */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Protocol Preview</h3>
            <button
              onClick={onEditProtocol}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
              title="Edit protocol steps"
            >
              <PencilIcon className="w-4 h-4" />
              Edit
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            <div className="space-y-2">
              {protocol.steps.map((step, index) => (
                <div
                  key={index}
                  className="p-2 bg-purple-50 rounded text-sm flex justify-between items-center"
                >
                  <span className="font-semibold">Step {step.stepNumber}:</span>
                  <span>{step.targetPower}W × {Math.floor(step.duration / 60)}min</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default IntervalManager;

