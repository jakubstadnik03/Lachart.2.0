import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, PencilIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';

const ProtocolEditModal = ({ isOpen, onClose, protocol, onProtocolUpdate, testState, currentStep = 0 }) => {
  const [editedSteps, setEditedSteps] = useState([]);

  useEffect(() => {
    if (isOpen && protocol.steps) {
      setEditedSteps([...protocol.steps]);
    }
  }, [isOpen, protocol]);

  const handleStepChange = (index, field, value) => {
    const updated = [...editedSteps];
    updated[index] = {
      ...updated[index],
      [field]: typeof value === 'string' ? (field === 'targetPower' || field === 'duration' || field === 'recoveryDuration' ? parseInt(value) || 0 : value) : value
    };
    setEditedSteps(updated);
  };

  const handleAddStep = () => {
    const lastStep = editedSteps[editedSteps.length - 1];
    const newPower = lastStep ? lastStep.targetPower + protocol.powerIncrement : protocol.startPower;
    const newStep = {
      stepNumber: editedSteps.length + 1,
      targetPower: newPower,
      phase: 'work',
      duration: protocol.workDuration,
      recoveryDuration: protocol.recoveryDuration
    };
    setEditedSteps([...editedSteps, newStep]);
  };

  const handleRemoveStep = (index) => {
    if (editedSteps.length <= 1) return; // Keep at least one step
    const updated = editedSteps.filter((_, i) => i !== index).map((step, i) => ({
      ...step,
      stepNumber: i + 1
    }));
    setEditedSteps(updated);
  };

  const handleSave = () => {
    const updatedProtocol = {
      ...protocol,
      steps: editedSteps,
      maxSteps: editedSteps.length
    };
    onProtocolUpdate(updatedProtocol);
    onClose();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Edit Protocol Steps</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-4 mb-4">
            {editedSteps.map((step, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-700">Step {step.stepNumber}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      step.phase === 'work' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {step.phase === 'work' ? 'Work' : 'Recovery'}
                    </span>
                  </div>
                  {editedSteps.length > 1 && (
                    <button
                      onClick={() => handleRemoveStep(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Target Power (W)
                    </label>
                    <input
                      type="number"
                      value={step.targetPower}
                      onChange={(e) => handleStepChange(index, 'targetPower', e.target.value)}
                      disabled={testState === 'running' && index < currentStep}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
                    />
                    {testState === 'running' && index < currentStep && (
                      <p className="text-xs text-gray-500 mt-1">Already completed</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Work Duration (s)
                    </label>
                    <input
                      type="number"
                      value={step.duration}
                      onChange={(e) => handleStepChange(index, 'duration', e.target.value)}
                      disabled={testState === 'running' && index < currentStep}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Recovery Duration (s)
                    </label>
                    <input
                      type="number"
                      value={step.recoveryDuration}
                      onChange={(e) => handleStepChange(index, 'recoveryDuration', e.target.value)}
                      disabled={testState === 'running' && index < currentStep}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-100"
                    />
                  </div>
                </div>
                {testState === 'running' && index === currentStep && (
                  <p className="text-xs text-orange-600 mt-2">⚠️ Current step - changes will affect active interval</p>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-between">
            <button
              onClick={handleAddStep}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
            >
              <PlusIcon className="w-5 h-5" />
              Add Step
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProtocolEditModal;

