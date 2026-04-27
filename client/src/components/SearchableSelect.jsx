import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";

/**
 * Searchable dropdown selector — pill button that opens a filterable list.
 * The dropdown renders via a React portal so it is never clipped by
 * overflow:hidden ancestors. It auto-flips left/right based on available
 * screen space so it never overflows the viewport edge.
 *
 * Props:
 *   value       — currently selected value
 *   options     — [{ value, label }]
 *   onChange    — (value) => void
 *   placeholder — string shown when nothing is selected
 */
export function SearchableSelect({ value, options, onChange, placeholder = "Select…" }) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, alignRight: false });
  const btnRef   = useRef(null);
  const panelRef = useRef(null);

  const DROPDOWN_W = 256; // px — matches w-64
  const MARGIN     = 8;

  /* close on outside click or any scroll */
  useEffect(() => {
    if (!open) return;
    const onMouse = (e) => {
      if (
        btnRef.current   && !btnRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onMouse);
    window.addEventListener('scroll', onScroll, true); // capture phase catches nested scrollers too
    return () => {
      document.removeEventListener('mousedown', onMouse);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  /* reposition whenever it opens — auto-flip left vs right */
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const dropW = Math.max(r.width, DROPDOWN_W);

    // Would left-aligned overflow the right edge?
    const wouldOverflowRight = r.left + dropW > window.innerWidth - MARGIN;

    let left;
    if (wouldOverflowRight) {
      // Right-align: anchor to button's right edge
      left = r.right + window.scrollX - dropW;
    } else {
      left = r.left + window.scrollX;
    }

    setDropPos({
      top:  r.bottom + window.scrollY + 4,
      left: Math.max(MARGIN + window.scrollX, left),
      width: dropW,
    });
  }, [open]);

  const filtered = options.filter(o =>
    !query || o.label.toLowerCase().includes(query.toLowerCase())
  );
  const selected = options.find(o => o.value === value);

  const dropdown = open ? ReactDOM.createPortal(
    <div
      ref={panelRef}
      className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{
        position: 'absolute',
        top:    dropPos.top,
        left:   dropPos.left,
        width:  dropPos.width,
        zIndex: 99999,
      }}
    >
      <div className="p-2 border-b border-gray-100">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search…"
          className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-primary/30 placeholder-gray-400"
        />
      </div>
      <div className="overflow-y-auto max-h-52 py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-gray-400 text-center">No results</div>
        ) : filtered.map(o => (
          <button
            key={o.value}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
            className={`w-full text-left px-3 py-2 text-xs transition-colors ${
              o.value === value
                ? 'font-semibold text-primary bg-primary/5'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => { setOpen(o => !o); setQuery(''); }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 max-w-[200px] transition-colors"
      >
        <span className="truncate">{selected?.label || placeholder}</span>
        <svg className="w-3 h-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {dropdown}
    </div>
  );
}
