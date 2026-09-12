/**
 * The list of compared sessions, behind one button.
 *
 * Twenty-one date pills under the chart pushed the lap table off the screen
 * and said nothing about which session was which. Now a single row names
 * the count, and the list itself — title, date, the headline numbers — opens
 * as a sheet on the phone or a panel on the desktop. Tapping a session
 * highlights it in the chart; the eye hides it.
 */
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

export function sessionTitle(s) {
  return String(s?.titleManual || s?.title || s?.name || '').trim() || 'Training';
}

const fmtDay = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
};

function EyeIcon({ off }) {
  return off ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * @param sessions      chart order: this session first, then the compared ones
 * @param currentId     id of this session (never hideable)
 * @param hidden        Set of hidden ids
 * @param highlightId   id highlighted in the chart, or null
 * @param describe      (session) => "1:32:10 · 48.2 km · 231 W"
 * @param onToggleHidden(id) / onShowAll() / onHideOthers() / onHighlight(id|null)
 */
export default function CompareSessionsMenu({
  sessions, currentId, hidden, highlightId, describe,
  onToggleHidden, onShowAll, onHideOthers, onHighlight,
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const idOf = (s) => String(s?.id || s?._id || '');
  const others = sessions.filter((s) => idOf(s) !== String(currentId));
  const hiddenCount = others.filter((s) => hidden.has(idOf(s))).length;
  const highlighted = highlightId ? sessions.find((s) => idOf(s) === String(highlightId)) : null;
  const isPhone = typeof window !== 'undefined' && window.innerWidth < 768;

  const openMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r && !isPhone) {
      const width = 340;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const below = window.innerHeight - r.bottom - 12;
      const top = below >= 260 ? r.bottom + 6 : Math.max(8, r.top - Math.min(420, r.top - 8) - 6);
      setAnchor({ left, top, width, maxHeight: Math.max(220, Math.min(420, below >= 260 ? below : r.top - 14)) });
    } else {
      setAnchor(null);
    }
    setOpen(true);
  };

  // Escape closes; so does a click anywhere outside the desktop panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => {
      if (isPhone) return;
      if (panelRef.current && !panelRef.current.contains(e.target) && !triggerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open, isPhone]);

  const list = (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-gray-900">Compared sessions</div>
          <div className="text-[11px] text-gray-400">Tap one to highlight it in the chart · the eye hides it</div>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close"
          className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      {others.length > 0 && (
        <div className="flex items-center gap-2 px-4 pb-2 text-[11px] font-semibold">
          <span className="text-gray-400">{others.length} compared{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}</span>
          <span className="flex-1" />
          {hiddenCount > 0 && (
            <button type="button" onClick={onShowAll} className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">Show all</button>
          )}
          {hiddenCount < others.length && (
            <button type="button" onClick={onHideOthers} className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">Hide all</button>
          )}
        </div>
      )}
      <div className="overflow-y-auto min-h-0 border-t border-gray-100" style={{ WebkitOverflowScrolling: 'touch' }}>
        {sessions.map((s, i) => {
          const sid = idOf(s);
          const isRef = sid === String(currentId);
          const isHidden = !isRef && hidden.has(sid);
          const isHi = highlightId != null && String(highlightId) === sid;
          const stats = describe ? describe(s) : '';
          return (
            <div key={sid || i}
              className={`flex items-center gap-2 pl-4 pr-2 border-b border-gray-50 last:border-0 ${isHi ? 'bg-violet-50' : ''}`}
              style={{ opacity: isHidden ? 0.45 : 1, boxShadow: isHi ? 'inset 3px 0 0 rgb(109,88,217)' : 'none' }}>
              <button type="button"
                onClick={() => { if (isHidden) { onToggleHidden(sid); return; } onHighlight(isHi ? null : sid); setOpen(false); }}
                className="flex-1 min-w-0 flex items-center gap-2.5 py-2.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-gray-800 truncate">
                    {isRef && <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600 mr-1.5">This</span>}
                    {sessionTitle(s)}
                  </span>
                  <span className="block text-[10.5px] text-gray-400 tabular-nums truncate">
                    {[fmtDay(s.date || s.startDate || s.start_date), stats].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
              {!isRef && (
                <button type="button" onClick={() => onToggleHidden(sid)}
                  aria-label={isHidden ? 'Show session' : 'Hide session'}
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isHidden ? 'text-gray-400' : 'text-gray-500'}`}>
                  <EyeIcon off={isHidden} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const portal = !open ? null : isPhone ? ReactDOM.createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div ref={panelRef} className="relative bg-white rounded-t-2xl shadow-2xl flex flex-col min-h-0" style={{ maxHeight: '80vh' }}>
        <div className="flex justify-center pt-2.5 pb-0.5"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>
        {list}
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </div>
    </div>,
    document.body,
  ) : ReactDOM.createPortal(
    <div ref={panelRef}
      className="fixed z-[10000] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col min-h-0"
      style={{ left: anchor?.left ?? 16, top: anchor?.top ?? 80, width: anchor?.width ?? 340, maxHeight: anchor?.maxHeight ?? 420 }}>
      {list}
    </div>,
    document.body,
  );

  return (
    <div className="flex items-center gap-2 px-3 pb-2.5 flex-wrap">
      <button ref={triggerRef} type="button" onClick={openMenu}
        className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-full border border-gray-200 bg-white text-[11px] font-bold text-gray-700 active:bg-gray-50">
        <span className="w-2 h-2 rounded-full" style={{ background: 'rgb(109,88,217)' }} />
        {others.length === 0 ? 'No compared sessions' : `${others.length} compared`}
        {hiddenCount > 0 && <span className="text-gray-400 font-semibold">· {hiddenCount} hidden</span>}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {highlighted && (
        <button type="button" onClick={() => onHighlight(null)}
          className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full text-[11px] font-bold text-white flex-1 min-w-0 max-w-max"
          style={{ background: 'rgb(109,88,217)' }}>
          <span className="truncate">{sessionTitle(highlighted)} · {fmtDay(highlighted.date || highlighted.startDate || highlighted.start_date)}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="flex-shrink-0"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      )}
      {portal}
    </div>
  );
}
