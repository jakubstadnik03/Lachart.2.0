import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { BeakerIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import BottomSheet from '../shared/BottomSheet';

const SPORT_LABELS = { bike: 'Bike', run: 'Run', swim: 'Swim' };

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function QuickAddLactateModal({ isOpen, onClose, trainings = [], onSave }) {
  const [lactateValue, setLactateValue] = useState('');
  const [blockTitle, setBlockTitle] = useState('');
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
  const [selectedIntervalIdx, setSelectedIntervalIdx] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const lactateInputRef = useRef(null);

  const sortedTrainings = [...trainings]
    .filter(t => t._id)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 50);

  const selectedTraining = sortedTrainings.find(t => t._id === selectedTrainingId);
  const intervals = selectedTraining?.results || [];

  useEffect(() => {
    if (isOpen) setTimeout(() => lactateInputRef.current?.focus(), 120);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setLactateValue('');
      setBlockTitle('');
      setSelectedTrainingId('');
      setSelectedIntervalIdx('');
      setError('');
      setIsSaving(false);
    }
  }, [isOpen]);

  useEffect(() => { setSelectedIntervalIdx(''); }, [selectedTrainingId]);

  const handleSave = async () => {
    if (!lactateValue || isNaN(parseFloat(lactateValue))) {
      setError('Please enter a valid lactate value.');
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      await onSave({
        lactateValue: parseFloat(lactateValue),
        blockTitle: blockTitle.trim(),
        trainingId: selectedTrainingId || null,
        intervalIndex: selectedIntervalIdx !== '' ? parseInt(selectedIntervalIdx) : null,
      });
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) handleSave();
    if (e.key === 'Escape') onClose();
  };

  return (
    <BottomSheet
      open={isOpen}
      onClose={onClose}
      title="Quick Add Lactate"
      icon={<BeakerIcon className="w-4 h-4 text-primary" />}
      maxWidth="sm:max-w-md"
    >
      <div className="px-5 py-4 space-y-4" onKeyDown={handleKeyDown}>
        {/* Lactate value */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Lactate value <span className="text-red-400">*</span>
            <span className="ml-1 font-normal text-gray-400">(mmol/L)</span>
          </label>
          <div className="relative">
            <input
              ref={lactateInputRef}
              type="number"
              step="0.1"
              min="0"
              max="30"
              placeholder="e.g. 2.5"
              value={lactateValue}
              onChange={e => setLactateValue(e.target.value)}
              className="w-full h-12 px-4 text-lg font-semibold rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-gray-50 focus:bg-white"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400">mmol/L</span>
          </div>
        </div>

        {/* Block / interval title */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Block / interval name
            <span className="ml-1 font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Z2 steady, Warm-up, Interval 3…"
            value={blockTitle}
            onChange={e => setBlockTitle(e.target.value)}
            className="w-full h-10 px-3.5 text-sm rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-gray-50 focus:bg-white"
          />
        </div>

        {/* Training selector */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
            Assign to training
            <span className="ml-1 font-normal text-gray-400">(optional)</span>
          </label>
          <div className="relative">
            <select
              value={selectedTrainingId}
              onChange={e => setSelectedTrainingId(e.target.value)}
              className="w-full h-10 pl-3.5 pr-8 text-sm rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-gray-50 focus:bg-white appearance-none cursor-pointer"
            >
              <option value="">— No training selected —</option>
              {sortedTrainings.map(t => (
                <option key={t._id} value={t._id}>
                  {SPORT_LABELS[t.sport] || t.sport} &nbsp;
                  {t.title || 'Untitled'} &nbsp;·&nbsp; {formatDate(t.date)}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Interval selector */}
        {selectedTraining && intervals.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Assign to interval
              <span className="ml-1 font-normal text-gray-400">(optional — leave blank to add new)</span>
            </label>
            <div className="relative">
              <select
                value={selectedIntervalIdx}
                onChange={e => setSelectedIntervalIdx(e.target.value)}
                className="w-full h-10 pl-3.5 pr-8 text-sm rounded-2xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-gray-50 focus:bg-white appearance-none cursor-pointer"
              >
                <option value="">+ Add as new interval</option>
                {intervals.map((r, idx) => (
                  <option key={idx} value={idx}>
                    Interval {r.interval || idx + 1}
                    {r.lactate ? ` (current: ${r.lactate} mmol/L)` : ''}
                    {r.duration ? ` · ${r.duration}` : ''}
                    {r.power ? ` · ${r.power}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pb-2">
          <button
            onClick={onClose}
            className="flex-1 h-11 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            disabled={isSaving || !lactateValue}
            className="flex-[2] h-11 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <BeakerIcon className="w-4 h-4" />
                Save Lactate
              </>
            )}
          </motion.button>
        </div>
      </div>
    </BottomSheet>
  );
}
