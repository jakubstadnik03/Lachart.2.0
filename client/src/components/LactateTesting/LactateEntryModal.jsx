import React, { useState } from 'react';
import Modal from '../Modal';

const BORG_SCALE = [
  { value: 6,  label: '6 – No exertion' },
  { value: 7,  label: '7 – Extremely light' },
  { value: 8,  label: '8' },
  { value: 9,  label: '9 – Very light' },
  { value: 10, label: '10' },
  { value: 11, label: '11 – Light' },
  { value: 12, label: '12' },
  { value: 13, label: '13 – Somewhat hard' },
  { value: 14, label: '14' },
  { value: 15, label: '15 – Hard' },
  { value: 16, label: '16' },
  { value: 17, label: '17 – Very hard' },
  { value: 18, label: '18' },
  { value: 19, label: '19 – Extremely hard' },
  { value: 20, label: '20 – Maximal exertion' },
];

const LactateEntryModal = ({
  isOpen,
  onClose,
  onSubmit,
  currentStep,
  suggestedPower,
  onCompleteInterval,
  currentHeartRate,
  recoveryTime,
  onStartNextInterval,
  testState,
  phase,
}) => {
  const [lactateValue, setLactateValue] = useState('');
  const [borgValue, setBorgValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (lactateValue && !isNaN(parseFloat(lactateValue)) && parseFloat(lactateValue) > 0) {
      onSubmit(lactateValue, borgValue || null);
      setLactateValue('');
      setBorgValue('');
    }
  };

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary';

  const recoveryFormatted = recoveryTime
    ? `${Math.floor(recoveryTime / 60)}:${String(recoveryTime % 60).padStart(2, '0')}`
    : '0:00';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Add Lactate Value — Step ${currentStep}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* At-a-glance stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-blue-50 p-3">
            <div className="mb-1 text-xs text-gray-500">Heart Rate</div>
            <div className="text-lg font-semibold text-blue-700">
              {currentHeartRate ? `${Math.round(currentHeartRate)} bpm` : 'N/A'}
            </div>
          </div>
          <div className="rounded-xl bg-green-50 p-3">
            <div className="mb-1 text-xs text-gray-500">Recovery Time</div>
            <div className="text-lg font-semibold text-green-700">{recoveryFormatted}</div>
          </div>
        </div>

        {suggestedPower != null && (
          <p className="text-sm text-gray-600">
            Suggested Power: <span className="font-semibold">{suggestedPower} W</span>
          </p>
        )}

        {/* Lactate value */}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-gray-700">
            Lactate Value (mmol/L) *
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            value={lactateValue}
            onChange={(e) => setLactateValue(e.target.value)}
            placeholder="e.g. 2.5"
            className={inputClass}
            autoFocus
            required
          />
          <p className="text-xs text-gray-500">
            Blood lactate concentration measured after this interval.
          </p>
        </div>

        {/* BORG RPE */}
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-gray-700">
            BORG Intensity (RPE) — Optional
          </label>
          <select
            value={borgValue}
            onChange={(e) => setBorgValue(e.target.value)}
            className={inputClass}
          >
            <option value="">Select BORG value…</option>
            {BORG_SCALE.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">Rate perceived exertion (6–20 scale).</p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2 border-t border-gray-200 pt-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border-2 border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50"
              style={{ touchAction: 'manipulation' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-primary-dark"
              style={{ touchAction: 'manipulation' }}
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
              className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              style={{ touchAction: 'manipulation' }}
            >
              Add Values &amp; Start Next Interval
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default LactateEntryModal;
