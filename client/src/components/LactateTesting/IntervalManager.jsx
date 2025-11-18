import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cog6ToothIcon, PencilIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

const IntervalManager = ({ protocol, onProtocolSubmit, testState, onEditProtocol }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [draftProtocol, setDraftProtocol] = useState(protocol);

  React.useEffect(() => {
    setDraftProtocol(protocol);
  }, [protocol]);

  const generateSteps = React.useCallback((proto) => {
    const steps = [];
    for (let i = 0; i < proto.maxSteps; i++) {
      steps.push({
        stepNumber: i + 1,
        targetPower: proto.startPower + (i * proto.powerIncrement),
        phase: 'work',
        duration: proto.workDuration,
        recoveryDuration: proto.recoveryDuration
      });
    }
    return steps;
  }, []);

  const previewSteps = React.useMemo(() => {
    return generateSteps(draftProtocol);
  }, [draftProtocol, generateSteps]);
  
  const handleChange = (field, value) => {
    setDraftProtocol(prev => ({
      ...prev,
      [field]: typeof value === 'string' ? parseInt(value, 10) || 0 : value
    }));
  };

  const handleSubmit = () => {
    if (!onProtocolSubmit) return;
    const updatedProtocol = {
      ...draftProtocol,
      steps: generateSteps(draftProtocol)
    };
    onProtocolSubmit(updatedProtocol);
  };

  const isEditable = testState === 'idle';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl overflow-hidden"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Cog6ToothIcon className="w-6 h-6" />
          <h2 className="text-xl font-bold">Interval Protocol</h2>
          {protocol.steps.length > 0 && (
            <span className="px-2 py-0.5 bg-blue-500 text-white text-xs font-semibold rounded-full">
              {protocol.steps.length} steps
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUpIcon className="w-5 h-5 text-gray-600" />
        ) : (
          <ChevronDownIcon className="w-5 h-5 text-gray-600" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Work Duration (s)
            </label>
            <input
              type="number"
              value={draftProtocol.workDuration}
              onChange={(e) => handleChange('workDuration', e.target.value)}
              disabled={!isEditable}
              className="w-full px-3 py-2 border border-white/40 bg-white/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recovery Duration (s)
            </label>
            <input
              type="number"
              value={draftProtocol.recoveryDuration}
              onChange={(e) => handleChange('recoveryDuration', e.target.value)}
              disabled={!isEditable}
              className="w-full px-3 py-2 border border-white/40 bg-white/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Power (W)
            </label>
            <input
              type="number"
              value={draftProtocol.startPower}
              onChange={(e) => handleChange('startPower', e.target.value)}
              disabled={!isEditable}
              className="w-full px-3 py-2 border border-white/40 bg-white/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Power Increment (W)
            </label>
            <input
              type="number"
              value={draftProtocol.powerIncrement}
              onChange={(e) => handleChange('powerIncrement', e.target.value)}
              disabled={!isEditable}
              className="w-full px-3 py-2 border border-white/40 bg-white/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Steps
            </label>
            <input
              type="number"
              value={draftProtocol.maxSteps}
              onChange={(e) => handleChange('maxSteps', e.target.value)}
              disabled={!isEditable}
              className="w-full px-3 py-2 border border-white/40 bg-white/70 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
            />
          </div>
              </div>

              {/* Protocol Preview */}
              <div className="mt-4 pt-4 border-t border-white/40">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">Protocol Preview</h3>
                  <button
                    onClick={onEditProtocol}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white/70 text-primary rounded-xl hover:bg-white border border-white/40 shadow"
                    title="Edit protocol steps"
                  >
                    <PencilIcon className="w-4 h-4" />
                    Edit
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <div className="space-y-2">
                    {previewSteps.map((step, index) => (
                      <div
                        key={index}
                        className="p-2 bg-white/60 backdrop-blur rounded-lg text-sm flex justify-between items-center border border-white/40"
                      >
                        <span className="font-semibold">Step {step.stepNumber}:</span>
                        <span>{step.targetPower}W × {Math.floor(step.duration / 60)}min</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-3 border-t border-white/40">
                <button
                  onClick={handleSubmit}
                  disabled={!isEditable}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold shadow ${
                    isEditable
                      ? 'bg-primary text-white hover:bg-primary/90'
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Apply Protocol
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default IntervalManager;

