/**
 * TrainingInsightsCard — compact daily hint; tap for full + weekly overview.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, useDragControls } from 'framer-motion';
import { getRaceEvents } from '../../services/api';
import { fetchWellness } from '../../services/wellnessData';
import {
  computeDailyInsight,
  computeWeeklyOverview,
  toLocalDateStr,
} from '../../utils/trainingInsights';

const SEVERITY = {
  ok: { bg: '#F8FAFC', border: '#E2E8F0', accent: '#047857', dot: '#22c55e', label: 'OK' },
  watch: { bg: '#FFFBEB', border: '#FDE68A', accent: '#B45309', dot: '#f59e0b', label: 'Watch' },
  warning: { bg: '#FEF2F2', border: '#FECACA', accent: '#B91C1C', dot: '#ef4444', label: 'Recovery' },
};

function dismissKey(athleteId) {
  return `trainingInsightDismissed_${athleteId || 'self'}_${toLocalDateStr()}`;
}

export default function TrainingInsightsCard({
  athleteId = null,
  todayMetrics = {},
  plannedWorkouts = [],
  activities = [],
  tests = [],
  sparklineData = [],
  wellnessDays: wellnessProp = undefined,
  nextRace: nextRaceProp = undefined,
  userProfile = null,
  loading = false,
  compact = false,
}) {
  const [fetchedRace, setFetchedRace] = useState(null);
  const [wellnessDays, setWellnessDays] = useState(wellnessProp || []);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissKey(athleteId)) === '1');
    } catch {
      setDismissed(false);
    }
  }, [athleteId]);

  useEffect(() => {
    if (wellnessProp !== undefined) {
      setWellnessDays(wellnessProp);
      return undefined;
    }
    if (!athleteId) return undefined;
    let cancelled = false;
    fetchWellness(7, athleteId)
      .then((data) => { if (!cancelled) setWellnessDays(data.days || []); })
      .catch(() => { if (!cancelled) setWellnessDays([]); });
    return () => { cancelled = true; };
  }, [athleteId, wellnessProp]);

  useEffect(() => {
    if (nextRaceProp !== undefined || !athleteId) return undefined;
    let cancelled = false;
    const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    getRaceEvents(athleteId, { from: todayIso })
      .then(({ data }) => {
        if (!cancelled) setFetchedRace(Array.isArray(data) && data[0] ? data[0] : null);
      })
      .catch(() => {
        if (!cancelled) setFetchedRace(null);
      });
    return () => { cancelled = true; };
  }, [athleteId, nextRaceProp]);

  const nextRace = nextRaceProp !== undefined ? nextRaceProp : fetchedRace;

  const insightOpts = useMemo(
    () => ({
      todayMetrics,
      plannedWorkouts,
      wellnessDays,
      activities,
      tests,
      sparklineData,
      nextRace,
      userProfile,
    }),
    [todayMetrics, plannedWorkouts, wellnessDays, activities, tests, sparklineData, nextRace, userProfile]
  );

  const insight = useMemo(() => computeDailyInsight(insightOpts), [insightOpts]);
  const weekly = useMemo(() => computeWeeklyOverview(insightOpts), [insightOpts]);
  const style = SEVERITY[insight.severity] || SEVERITY.ok;

  const handleDismiss = (e) => {
    e?.stopPropagation?.();
    setDismissed(true);
    setExpanded(false);
    try {
      localStorage.setItem(dismissKey(athleteId), '1');
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div style={teaserShell(compact)}>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>Loading insight…</span>
      </div>
    );
  }

  if (dismissed) return null;

  const teaser = (
    <div
      style={{
        ...teaserShell(compact),
        background: style.bg,
        borderColor: style.border,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex-1 min-w-0 flex items-center gap-2 text-left active:opacity-80"
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: style.dot }}
          aria-hidden
        />
        <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide text-gray-400">
          Today
        </span>
        <span className="flex-1 min-w-0 text-[12px] font-semibold text-gray-800 truncate leading-tight">
          {insight.headline}
        </span>
        <span
          className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ color: style.accent, background: '#fff', border: `1px solid ${style.border}` }}
        >
          {style.label}
        </span>
        <svg className="flex-shrink-0 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-white/80"
        aria-label="Dismiss insight"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );

  const sheet = expanded && typeof document !== 'undefined'
    ? ReactDOM.createPortal(
        <InsightSheet
          insight={insight}
          weekly={weekly}
          style={style}
          onClose={() => setExpanded(false)}
          onDismiss={handleDismiss}
        />,
        document.body
      )
    : null;

  return (
    <>
      {teaser}
      {sheet}
    </>
  );
}

function InsightSheet({ insight, weekly, style, onClose, onDismiss }) {
  const dragControls = useDragControls();
  const scrollRef = useRef(null);
  const pullRef = useRef({ startY: 0, active: false });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const startSheetDrag = (e) => {
    if (e.target.closest('button')) return;
    dragControls.start(e);
  };

  const onContentTouchStart = (e) => {
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) {
      pullRef.current.active = false;
      return;
    }
    pullRef.current = { startY: e.touches[0].clientY, active: true };
  };

  const onContentTouchMove = (e) => {
    const p = pullRef.current;
    if (!p.active) return;
    const el = scrollRef.current;
    if (el && el.scrollTop > 0) {
      p.active = false;
      return;
    }
    const dy = e.touches[0].clientY - p.startY;
    if (dy > 100) {
      p.active = false;
      onClose();
    }
  };

  const onContentTouchEnd = (e) => {
    const p = pullRef.current;
    if (!p.active) return;
    p.active = false;
    const dy = e.changedTouches[0].clientY - p.startY;
    if (dy > 70) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[10050] flex flex-col justify-end"
      style={{ background: 'rgba(15,23,42,0.45)' }}
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        className="bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="insight-sheet-title"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '110%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0 }}
        dragElastic={{ top: 0, bottom: 0.35 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 450) onClose();
        }}
      >
        <div
          className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: 'none' }}
          onPointerDown={startSheetDrag}
        >
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div
          className="flex items-center justify-between px-4 pb-2 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={startSheetDrag}
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: style.dot }} />
            <h2 id="insight-sheet-title" className="text-sm font-bold text-gray-900">
              Today&apos;s insight
            </h2>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ color: style.accent, background: style.bg, border: `1px solid ${style.border}` }}
            >
              {style.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDismiss}
              className="text-[11px] font-medium text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-100"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="overflow-y-auto px-4 pb-4"
          style={{ WebkitOverflowScrolling: 'touch' }}
          onTouchStart={onContentTouchStart}
          onTouchMove={onContentTouchMove}
          onTouchEnd={onContentTouchEnd}
        >
          <p className="text-base font-bold text-gray-900 leading-snug">{insight.headline}</p>
          {insight.detail && (
            <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{insight.detail}</p>
          )}

          {weekly.stats.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">
                This week
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {weekly.stats.map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2 text-center"
                  >
                    <div className="text-[9px] font-semibold text-gray-400 uppercase">{s.label}</div>
                    <div className="text-sm font-bold text-gray-900 tabular-nums mt-0.5">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {weekly.insights.length > 1 && (
            <div className="mt-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">
                Weekly signals
              </h3>
              <ul className="space-y-2">
                {weekly.insights.map((item) => {
                  const sev = SEVERITY[item.severity] || SEVERITY.ok;
                  return (
                    <li
                      key={`${item.headline}-${item.detail}`}
                      className="rounded-xl border px-3 py-2"
                      style={{ borderColor: sev.border, background: sev.bg }}
                    >
                      <div className="text-[13px] font-semibold text-gray-900">{item.headline}</div>
                      {item.detail && (
                        <div className="text-[12px] text-gray-600 mt-0.5 leading-snug">{item.detail}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function teaserShell(compact) {
  return {
    border: '1px solid #E5E7EB',
    borderRadius: compact ? 14 : 12,
    padding: compact ? '8px 10px' : '10px 12px',
    boxShadow: '0 1px 2px rgba(15,23,42,.03)',
  };
}
