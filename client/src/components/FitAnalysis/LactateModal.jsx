import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { XMarkIcon, BeakerIcon } from '@heroicons/react/24/outline';
import { updateLactateValues } from '../../services/api';
import { formatDuration, formatDistance, formatPace } from '../../utils/fitAnalysisUtils';

/**
 * LactateModal
 * Opens when user clicks "Add Lactate" — shows all laps with existing lactate
 * pre-filled, let user enter/update values, then saves all at once.
 *
 * Props:
 *   isOpen      — boolean
 *   onClose     — () => void
 *   training    — training object (needs laps, _id, sport)
 *   user        — user object (for unit preferences)
 *   onSaved     — (trainingId) => void — called after successful save
 */
export default function LactateModal({ isOpen, onClose, training, user, onSaved, initialLapIndex = null }) {
  const [inputs, setInputs] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const lapRefs = useRef({});
  const scrollRef = useRef(null);

  const laps = training?.laps || [];
  const sportLower = (training?.sport || '').toLowerCase();
  const isRun = sportLower.includes('run') || sportLower === 'walk' || sportLower === 'hike';

  // Pre-fill inputs from existing lactate values whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    const initial = {};
    laps.forEach((lap, i) => {
      if (lap.lactate != null && lap.lactate > 0) {
        initial[`lap-${i}`] = String(lap.lactate);
      }
    });
    setInputs(initial);
    setSaved(false);
    setError(null);
    // Scroll to the initially clicked lap after render
    if (initialLapIndex != null) {
      requestAnimationFrame(() => {
        const el = lapRefs.current[initialLapIndex];
        const container = scrollRef.current;
        if (el && container) {
          const elRect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const offset = elRect.top - containerRect.top - container.clientHeight / 2 + elRect.height / 2;
          container.scrollBy({ top: offset, behavior: 'smooth' });
        }
      });
    }
  }, [isOpen, training?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const handleSave = async () => {
    const lactateValues = Object.entries(inputs)
      .map(([key, value]) => {
        const [, index] = key.split('-');
        const parsed = parseFloat(value);
        return { type: 'lap', index: parseInt(index), lactate: parsed };
      })
      .filter(lv => lv.lactate > 0 && !isNaN(lv.lactate));

    setSaving(true);
    setError(null);
    try {
      await updateLactateValues(training._id, lactateValues);
      if (onSaved) await onSaved(training._id);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Error saving lactate:', err);
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key, value) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const filledCount = Object.values(inputs).filter(v => v && parseFloat(v) > 0).length;

  return ReactDOM.createPortal(
    /* Backdrop */
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: 'calc(90vh - env(safe-area-inset-top, 0px))' }}
      >

        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-2.5 pb-0 sm:hidden shrink-0" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <BeakerIcon className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Add Lactate</h2>
              <p className="text-xs text-gray-400">
                {laps.length} laps · {filledCount} filled
                {saved && <span className="text-green-600 font-medium ml-2">✓ Saved!</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[2.5rem_1fr_1fr_5rem] gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100 shrink-0">
          <span className="text-[10px] font-semibold text-gray-400 uppercase">#</span>
          <span className="text-[10px] font-semibold text-gray-400 uppercase">Time / Distance</span>
          <span className="text-[10px] font-semibold text-gray-400 uppercase">
            {isRun ? 'Pace' : 'Power / HR'}
          </span>
          <span className="text-[10px] font-semibold text-gray-400 uppercase text-right">La (mmol/L)</span>
        </div>

        {/* Lap rows */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 overscroll-contain">
          {laps.map((lap, i) => {
            const key = `lap-${i}`;
            const lapNumber = lap?.lapNumber ?? (i + 1);
            const duration = formatDuration(
              lap.moving_time ?? lap.totalTimerTime ?? lap.totalElapsedTime ?? lap.elapsed_time
            );
            const distM = lap.totalDistance ?? lap.total_distance ?? lap.distance ?? 0;
            const dist = formatDistance(distM, user, { assumeMeters: true });

            const power = lap.avgPower ?? lap.avg_power ?? lap.average_watts ?? 0;
            const hr = lap.avgHeartRate ?? lap.avg_heart_rate ?? lap.average_heartrate ?? 0;
            const speedMps = lap.avgSpeed ?? lap.average_speed ?? null;
            const pace = isRun && speedMps ? formatPace(speedMps) : null;

            const inputVal = inputs[key] ?? '';
            const hasValue = inputVal && parseFloat(inputVal) > 0;

            const isInitial = initialLapIndex === i;
            return (
              <div
                key={i}
                ref={el => { lapRefs.current[i] = el; }}
                className={`grid grid-cols-[2.5rem_1fr_1fr_5rem] gap-2 items-center px-5 py-3 border-b border-gray-50 transition-colors ${
                  isInitial ? 'bg-primary/10 ring-1 ring-primary/30' : hasValue ? 'bg-primary/5' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`text-xs font-bold ${hasValue ? 'text-primary' : 'text-gray-400'}`}>
                  {lapNumber}
                </span>

                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{duration}</p>
                  {dist && dist !== '0 m' && (
                    <p className="text-xs text-gray-400 truncate">{dist}</p>
                  )}
                </div>

                <div className="min-w-0">
                  {pace ? (
                    <p className="text-sm text-gray-700">{pace}</p>
                  ) : (
                    <>
                      {power > 0 && (
                        <p className="text-sm text-purple-600 font-medium">{Math.round(power)} W</p>
                      )}
                      {hr > 0 && (
                        <p className="text-xs text-red-500">{Math.round(hr)} bpm</p>
                      )}
                    </>
                  )}
                </div>

                {/* Lactate input */}
                <div className="flex justify-end">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="30"
                    placeholder="—"
                    value={inputVal}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className={`w-16 text-right px-2 py-1.5 rounded-lg border text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                      hasValue
                        ? 'border-primary/40 bg-primary/5 text-primary'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="px-5 border-t border-gray-100 shrink-0 flex flex-col gap-2"
          style={{ paddingTop: '1rem', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || filledCount === 0}
              className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium shadow-md hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            >
              {saving ? 'Saving…' : saved ? '✓ Saved!' : `Save ${filledCount > 0 ? `(${filledCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
