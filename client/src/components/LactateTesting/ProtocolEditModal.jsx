import React, { useState, useEffect } from 'react';
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import Modal from '../Modal';

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
      [field]:
        typeof value === 'string' &&
        (field === 'targetPower' || field === 'duration' || field === 'recoveryDuration')
          ? parseInt(value) || 0
          : value,
    };
    setEditedSteps(updated);
  };

  const handleAddStep = () => {
    const lastStep = editedSteps[editedSteps.length - 1];
    const newPower = lastStep
      ? lastStep.targetPower + protocol.powerIncrement
      : protocol.startPower;
    setEditedSteps([
      ...editedSteps,
      {
        stepNumber: editedSteps.length + 1,
        targetPower: newPower,
        phase: 'work',
        duration: protocol.workDuration,
        recoveryDuration: protocol.recoveryDuration,
      },
    ]);
  };

  const handleRemoveStep = (index) => {
    if (editedSteps.length <= 1) return;
    setEditedSteps(
      editedSteps
        .filter((_, i) => i !== index)
        .map((step, i) => ({ ...step, stepNumber: i + 1 }))
    );
  };

  const handleSave = () => {
    onProtocolUpdate({ ...protocol, steps: editedSteps, maxSteps: editedSteps.length });
    onClose();
  };

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Protocol Steps">
      <div className="space-y-3">
        {editedSteps.map((step, index) => {
          const completed = testState === 'running' && index < currentStep;
          const active = testState === 'running' && index === currentStep;

          return (
            <div
              key={index}
              className={`rounded-xl border p-3 sm:p-4 ${
                active
                  ? 'border-orange-200 bg-orange-50'
                  : completed
                  ? 'border-gray-200 bg-gray-50 opacity-60'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {/* Step header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">
                    Step {step.stepNumber}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      step.phase === 'work'
                        ? 'border border-rose-200 bg-rose-50 text-rose-700'
                        : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {step.phase === 'work' ? 'Work' : 'Recovery'}
                  </span>
                </div>
                {editedSteps.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveStep(index)}
                    className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                    style={{ touchAction: 'manipulation' }}
                    aria-label="Remove step"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Fields */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">
                    Power (W)
                  </label>
                  <input
                    type="number"
                    value={step.targetPower}
                    onChange={(e) => handleStepChange(index, 'targetPower', e.target.value)}
                    disabled={completed}
                    className={inputClass}
                  />
                  {completed && (
                    <p className="text-xs text-gray-400">Completed</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">
                    Work (s)
                  </label>
                  <input
                    type="number"
                    value={step.duration}
                    onChange={(e) => handleStepChange(index, 'duration', e.target.value)}
                    disabled={completed}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-gray-600">
                    Recovery (s)
                  </label>
                  <input
                    type="number"
                    value={step.recoveryDuration}
                    onChange={(e) =>
                      handleStepChange(index, 'recoveryDuration', e.target.value)
                    }
                    disabled={completed}
                    className={inputClass}
                  />
                </div>
              </div>

              {active && (
                <p className="mt-2 text-xs text-orange-600">
                  ⚠️ Current step — changes affect the active interval
                </p>
              )}
            </div>
          );
        })}

        {/* Add step */}
        <button
          type="button"
          onClick={handleAddStep}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 py-2.5 text-sm font-semibold text-emerald-700 transition-all hover:border-emerald-400 hover:bg-emerald-50"
          style={{ touchAction: 'manipulation' }}
        >
          <PlusIcon className="h-4 w-4" />
          Add Step
        </button>

        {/* Footer */}
        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-3 sm:flex-row sm:justify-end sm:gap-3 sm:pt-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 sm:w-auto sm:px-6 sm:py-3"
            style={{ touchAction: 'manipulation' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-primary-dark hover:shadow-lg sm:w-auto sm:px-6 sm:py-3"
            style={{ touchAction: 'manipulation' }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ProtocolEditModal;
