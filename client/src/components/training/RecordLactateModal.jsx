import React, { useState } from 'react';
import { BeakerIcon } from '@heroicons/react/24/outline';
import BottomSheet from '../shared/BottomSheet';

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
    <BottomSheet
      open
      onClose={onClose}
      title="Record Lactate"
      icon={<BeakerIcon className="w-4 h-4 text-violet-600" />}
      maxWidth="sm:max-w-sm"
    >
      <div className="px-5 pt-4 pb-2 space-y-4">
        {/* Value input — big and prominent */}
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
            Blood Lactate (mmol/L)
          </label>
          <div className="flex items-center gap-2 mt-1.5">
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
              className="flex-1 text-3xl font-bold text-center rounded-2xl border border-gray-200 bg-white py-3 px-4 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
            />
            <span className="text-base font-semibold text-gray-400 flex-shrink-0">mmol/L</span>
          </div>
        </div>

        {/* Time */}
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Time</label>
          <input
            type="datetime-local"
            value={recordedAt}
            onChange={e => setRecordedAt(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Notes (optional)</label>
          <input
            type="text"
            placeholder="e.g. after interval 3, feeling good"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving || !value}
          className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-50 active:scale-[0.98]"
          style={{ backgroundColor: '#7c3aed' }}
        >
          {saving ? 'Saving…' : 'Save Measurement'}
        </button>
      </div>
    </BottomSheet>
  );
}
