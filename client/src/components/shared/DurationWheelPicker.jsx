import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';

const ITEM_HEIGHT = 40;
const PAD_ROWS = 2;

/** Format total seconds as H:MM:SS or M:SS (matches activity modal). */
export function formatDurationHMS(totalSeconds) {
  const secs = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function WheelColumn({ min, max, value, onChange, formatLabel }) {
  const values = useMemo(() => {
    const arr = [];
    for (let i = min; i <= max; i += 1) arr.push(i);
    return arr;
  }, [min, max]);

  const scrollerRef = useRef(null);
  const scrollEndTimer = useRef(null);
  const syncingRef = useRef(false);

  const scrollToValue = useCallback((v, smooth = false) => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(values.length - 1, v - min));
    el.scrollTo({ top: idx * ITEM_HEIGHT, behavior: smooth ? 'smooth' : 'auto' });
  }, [min, values.length]);

  useEffect(() => {
    if (syncingRef.current) return;
    scrollToValue(value);
  }, [value, scrollToValue]);

  const handleScroll = () => {
    clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(values.length - 1, idx));
      const newVal = values[clamped];
      if (el.scrollTop !== clamped * ITEM_HEIGHT) {
        syncingRef.current = true;
        el.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: 'smooth' });
        requestAnimationFrame(() => { syncingRef.current = false; });
      }
      if (newVal !== value) onChange(newVal);
    }, 60);
  };

  return (
    <div className="relative flex-1 h-[200px] overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto scrollbar-hide"
        style={{
          scrollSnapType: 'y mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingTop: ITEM_HEIGHT * PAD_ROWS,
          paddingBottom: ITEM_HEIGHT * PAD_ROWS,
        }}
      >
        {values.map((v) => (
          <div
            key={v}
            style={{ height: ITEM_HEIGHT, scrollSnapAlign: 'center' }}
            className="flex items-center justify-center text-[17px] tabular-nums text-gray-900 select-none"
          >
            {formatLabel(v)}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * iOS-style scroll wheel for duration (hours / minutes / seconds).
 * `seconds` is total duration; `onChange` receives updated total seconds.
 */
export default function DurationWheelPicker({
  seconds = 0,
  onChange,
  maxHours = 23,
  className = '',
}) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;

  const setPart = (nh, nm, ns) => {
    onChange?.(nh * 3600 + nm * 60 + ns);
  };

  return (
    <div className={`relative ${className}`}>
      <div
        className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 h-10 rounded-lg bg-gray-100/90 border border-gray-200/80 z-0"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-white via-white/80 to-transparent z-10" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white via-white/80 to-transparent z-10" aria-hidden />
      <div className="relative z-[1] flex items-stretch">
        <WheelColumn
          min={0}
          max={maxHours}
          value={h}
          onChange={(nh) => setPart(nh, m, sec)}
          formatLabel={(v) => `${String(v).padStart(2, '0')} hours`}
        />
        <WheelColumn
          min={0}
          max={59}
          value={m}
          onChange={(nm) => setPart(h, nm, sec)}
          formatLabel={(v) => `${String(v).padStart(2, '0')} min`}
        />
        <WheelColumn
          min={0}
          max={59}
          value={sec}
          onChange={(ns) => setPart(h, m, ns)}
          formatLabel={(v) => `${String(v).padStart(2, '0')} sec`}
        />
      </div>
    </div>
  );
}

/** Bottom sheet modal for duration wheel (mobile). */
export function DurationPickerSheet({
  open = false,
  title = 'Duration',
  seconds = 0,
  onChange,
  onClose,
}) {
  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100050] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative w-full bg-white rounded-t-2xl shadow-2xl px-4 pt-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 12px), 12px)' }}
      >
        <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-2" />
        <div className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">
          {title}
        </div>
        <DurationWheelPicker seconds={seconds} onChange={onChange} />
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-2.5 rounded-xl bg-gray-100 text-sm font-semibold text-gray-700 active:bg-gray-200"
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Read-only field that opens the wheel picker (no keyboard). */
export function DurationPickerField({
  value,
  placeholder = '0:00',
  active = false,
  onOpen,
  className = '',
  style,
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${className} touch-manipulation ${active ? 'ring-2 ring-blue-500 border-blue-300' : ''}`}
      style={{ WebkitTapHighlightColor: 'transparent', ...style }}
    >
      {value || placeholder}
    </button>
  );
}
