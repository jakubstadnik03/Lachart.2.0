import React, { useState } from 'react';
import { BeakerIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function RecordLactateModal({ onClose, onSave }) {
  const now = new Date();
  const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const [value, setValue] = useState('');
  const [recordedAt, setRecordedAt] = useState(localISO);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    const v = parseFloat(value.replace(',', '.'));
    if (!v || isNaN(v) || v <= 0 || v > 30) {
      setError('Enter a valid lactate value (0.1 – 30 mmol/L)');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ value: v, recordedAt: new Date(recordedAt).toISOString(), notes });
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 pb-8 sm:pb-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#f5f3ff' }}>
              <BeakerIcon className="w-4 h-4" style={{ color: '#7c3aed' }} />
            </div>
            <span className="text-sm font-bold text-gray-900">Record Lactate</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <XMarkIcon className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Value input — big and prominent */}
        <div className="mb-4">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
            Blood Lactate (mmol/L)
          </label>
          <div className="flex items-center gap-2 mt-1">
            <input
              autoFocus
              type="number"
              step="0.1"
              min="0.1"
              max="30"
              placeholder="e.g. 3.2"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="flex-1 text-3xl font-bold text-center rounded-xl border border-gray-200 py-3 px-4 focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': '#7c3aed' }}
            />
            <span className="text-lg font-semibold text-gray-400 flex-shrink-0">mmol/L</span>
          </div>
        </div>

        {/* Time */}
        <div className="mb-3">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Time</label>
          <input
            type="datetime-local"
            value={recordedAt}
            onChange={e => setRecordedAt(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': '#7c3aed' }}
          />
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Notes (optional)</label>
          <input
            type="text"
            placeholder="e.g. after interval 3, feeling good"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': '#7c3aed' }}
          />
        </div>

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving || !value}
          className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#7c3aed' }}
        >
          {saving ? 'Saving…' : 'Save Measurement'}
        </button>
      </div>
    </div>
  );
}
