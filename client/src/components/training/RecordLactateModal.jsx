import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { BeakerIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function RecordLactateModal({ onClose, onSave }) {
  const now = new Date();
  // Format date/time for display as two separate fields (datetime-local crashes iOS native)
  const pad = (n) => String(n).padStart(2, '0');
  const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const [value, setValue]       = useState('');
  const [dateVal, setDateVal]   = useState(defaultDate);
  const [timeVal, setTimeVal]   = useState(defaultTime);
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  // ── Swipe-to-close ─────────────────────────────────────────────────────────
  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 280], [1, 0]);
  const startYRef = useRef(null);
  const isDraggingRef = useRef(false);

  const onTouchStart = useCallback((e) => {
    startYRef.current = e.touches[0].clientY;
    isDraggingRef.current = true;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!isDraggingRef.current || startYRef.current == null) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy > 0) {
      y.set(dy);
      // Prevent page scroll while dragging sheet down
      e.preventDefault();
    }
  }, [y]);

  const onTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (y.get() > 100) {
      animate(y, 400, { duration: 0.2, onComplete: onClose });
    } else {
      animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
    startYRef.current = null;
  }, [y, onClose]);

  // ESC key + body-scroll lock
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);

    // Lock body scroll so the underlying page doesn't steal touch events
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const handleSave = async () => {
    const v = parseFloat(String(value).replace(',', '.'));
    if (!v || isNaN(v) || v <= 0 || v > 30) {
      setError('Enter a valid lactate value (0.1 – 30 mmol/L)');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const recordedAt = new Date(`${dateVal}T${timeVal}:00`).toISOString();
      await onSave({ value: v, recordedAt, notes });
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Save failed');
      setSaving(false);
    }
  };

  return ReactDOM.createPortal(
    /* The outer div must capture ALL pointer/touch events so nothing reaches
       the underlying page.  pointer-events:auto + explicit handlers on the
       backdrop guarantee this on both iOS Capacitor and web. */
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 99999, pointerEvents: 'auto' }}
      /* Swallow every touch on the backdrop area */
      onTouchStart={e => e.stopPropagation()}
      onTouchMove={e => { e.stopPropagation(); e.preventDefault(); }}
      onTouchEnd={e => e.stopPropagation()}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop — visual dim + close on tap */}
      <motion.div
        className="absolute inset-0 bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ pointerEvents: 'auto' }}
        onTouchStart={e => { e.stopPropagation(); }}
        onTouchEnd={e => { e.stopPropagation(); onClose(); }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        className="relative w-full sm:max-w-sm bg-white rounded-t-3xl shadow-2xl flex flex-col z-10 select-none"
        style={{ y, opacity, maxHeight: '90vh', touchAction: 'none', pointerEvents: 'auto' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onTouchStart={e => { e.stopPropagation(); onTouchStart(e); }}
        onTouchMove={e => { e.stopPropagation(); onTouchMove(e); }}
        onTouchEnd={e => { e.stopPropagation(); onTouchEnd(); }}
      >
        {/* Drag handle — larger tap target */}
        <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-[5px] rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
              <BeakerIcon className="w-5 h-5 text-violet-600" />
            </div>
            <h2 className="text-[15px] font-bold text-gray-900">Record Lactate</h2>
          </div>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 active:bg-gray-200 transition-colors"
            style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body — allow scroll inside */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={e => e.stopPropagation()}
          onTouchMove={e => e.stopPropagation()}
        >
          <div className="px-5 pt-4 pb-6 space-y-4">
            {/* Value */}
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                Blood Lactate (mmol/L)
              </label>
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0.1"
                  max="30"
                  placeholder="e.g. 3.2"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  className="flex-1 text-3xl font-bold text-center rounded-2xl border border-gray-200 bg-white py-3 px-4 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                  style={{ touchAction: 'manipulation' }}
                />
                <span className="text-base font-semibold text-gray-400 flex-shrink-0">mmol/L</span>
              </div>
            </div>

            {/* Date + Time — split so iOS native handles them correctly */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Date</label>
                <input
                  type="date"
                  value={dateVal}
                  onChange={e => setDateVal(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                  style={{ touchAction: 'manipulation' }}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Time</label>
                <input
                  type="time"
                  value={timeVal}
                  onChange={e => setTimeVal(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                  style={{ touchAction: 'manipulation' }}
                />
              </div>
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
                style={{ touchAction: 'manipulation' }}
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={handleSave}
              disabled={saving || !value}
              className="w-full py-4 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-50 active:scale-[0.98]"
              style={{ backgroundColor: '#7c3aed', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            >
              {saving ? 'Saving…' : 'Save Measurement'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.getElementById('app-modal-root') || document.body
  );
}
