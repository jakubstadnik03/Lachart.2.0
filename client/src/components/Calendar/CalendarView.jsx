import React, { useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import TrainingFormComponent from '../TrainingForm';
import SessionProgressChart from '../training/SessionProgressChart';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
  BoltIcon,
  FireIcon,
  PlayIcon,
  CheckCircleIcon,
  XMarkIcon,
  TrashIcon,
  PencilIcon,
  ArrowTopRightOnSquareIcon,
  BeakerIcon,
  HeartIcon,
} from '@heroicons/react/24/outline';
import SportIcon from '../shared/SportIcon';
import api, { getSimilarActivities } from '../../services/api';
import { formatDistanceForUser } from '../../utils/unitsConverter';
import { useCategories, hexToRgba } from '../../context/CategoryContext';
import { useAuth } from '../../context/AuthProvider';
import { computeActivityTss } from '../../utils/computeTss';
import { motion, AnimatePresence } from 'framer-motion';
import TrainingComments from '../TrainingComments';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import TrainingChart from '../FitAnalysis/TrainingChart';

function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => {
      try { map.invalidateSize(); } catch (_) { /* map already destroyed */ }
    }, 100);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

/** Auto-fits the Leaflet map viewport to show every GPS point. */
function FitBoundsToRoute({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (!positions || positions.length < 2) return;
    try {
      map.fitBounds(positions, { padding: [16, 16], maxZoom: 15 });
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);  // run once on mount — positions don't change after load
  return null;
}

// ─── Planned workout helpers ──────────────────────────────────────────────────
const SPORT_PLAN_COLORS = { bike: '#767EB5', run: '#f97316', swim: '#38bdf8' };

function planStepTotalSecs(steps) {
  if (!Array.isArray(steps)) return 0;
  const visited = new Set();
  let total = 0;
  steps.forEach(s => {
    if (!s.groupId) { total += s.durationSeconds || 0; return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const reps = (group.find(x => x.isGroupHeader)?.groupRepeat) || 1;
    group.forEach(gs => { total += (gs.durationSeconds || 0) * reps; });
  });
  return total;
}

function fmtPlanDuration(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Tiny inline SVG power profile for planned workout cards
function PlanMiniChart({ steps, color, width = 60, height = 16 }) {
  if (!steps?.length) return null;
  const STEP_COLORS = { warmup:'#fbbf24', work:'#767EB5', recovery:'#6ee7b7', cooldown:'#38bdf8', rest:'#d1d5db' };
  const expanded = [];
  const visited = new Set();
  steps.forEach(s => {
    if (!s.groupId) { expanded.push(s); return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const reps = (group.find(x => x.isGroupHeader)?.groupRepeat) || 1;
    group.filter(x => !x.isGroupHeader).forEach(gs => {
      for (let r = 0; r < reps; r++) expanded.push(gs);
    });
  });
  const total = expanded.reduce((s, st) => s + (st.durationSeconds || 30), 0);
  if (!total) return null;
  const FLOOR = 0.12;
  let cx = 0;
  return (
    <svg width={width} height={height} style={{ display:'block', flexShrink:0 }}>
      {expanded.map((step, i) => {
        const w = Math.max(1, ((step.durationSeconds || 30) / total) * width);
        const intensity = step.stepType === 'work' ? 1 : step.stepType === 'warmup' ? 0.55 : step.stepType === 'cooldown' ? 0.4 : step.stepType === 'recovery' ? 0.3 : 0.15;
        const bh = Math.max(FLOOR * height, intensity * height);
        const bw = Math.max(1, w - 0.5);
        const fill = STEP_COLORS[step.stepType] || color || '#767EB5';
        const sx = cx; cx += w;
        if (step.isRamp && step.stepType === 'warmup') {
          return <polygon key={i} points={`${sx},${height} ${sx+bw},${height-bh} ${sx+bw},${height}`} fill={fill} opacity={0.85} />;
        } else if (step.isRamp && step.stepType === 'cooldown') {
          return <polygon key={i} points={`${sx},${height-bh} ${sx},${height} ${sx+bw},${height}`} fill={fill} opacity={0.85} />;
        }
        return <rect key={i} x={sx} y={height - bh} width={bw} height={bh} fill={fill} rx={1} opacity={0.85} />;
      })}
    </svg>
  );
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0,0,0,0);
  return d;
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate()+n); return d; }
function isSameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

// Helper function to get local date string (YYYY-MM-DD) without timezone issues
function getLocalDateString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// SportIcon and RunnerSvg are imported from shared/SportIcon

// ─── Sport color helper ───────────────────────────────────────────────────────
function sportColor(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run')) return '#f97316';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) return '#3b82f6';
  if (s.includes('swim')) return '#06b6d4';
  return '#8b5cf6';
}

// ─── Compliance helpers ────────────────────────────────────────────────────────
function sportMatches(pwSport, actSport) {
  const p = (pwSport || '').toLowerCase();
  const a = (actSport || '').toLowerCase();
  if (p === 'bike' && (a.includes('ride') || a.includes('bike') || a.includes('cycle') || a.includes('virtual'))) return true;
  if (p === 'run'  && a.includes('run')) return true;
  if (p === 'swim' && a.includes('swim')) return true;
  if (p === 'walk' && a.includes('walk')) return true;
  if (p === 'strength' && (a.includes('weight') || a.includes('strength') || a.includes('gym'))) return true;
  return p === a;
}

function getCompliance(plannedSecs, actualSecs) {
  if (!plannedSecs || !actualSecs) return null;
  const r = actualSecs / plannedSecs;
  if (r >= 0.9)  return { color: '#22c55e', bg: '#f0fdf4', label: 'On target',  ring: '#22c55e' };
  if (r >= 0.75) return { color: '#eab308', bg: '#fefce8', label: 'Good',        ring: '#eab308' };
  if (r >= 0.55) return { color: '#f97316', bg: '#fff7ed', label: 'Short',       ring: '#f97316' };
  return           { color: '#ef4444', bg: '#fef2f2', label: 'Missed',       ring: '#ef4444' };
}

function findCompliance(pw, acts) {
  if (!acts || acts.length === 0) return null;
  const plannedSecs = planStepTotalSecs(pw.steps) || pw.plannedDuration || 0;
  if (!plannedSecs) return null;
  const match = acts.find(a => sportMatches(pw.sport, a.sport || a.type || ''));
  if (!match) return null;
  const actualSecs = Number(
    match.duration || match.moving_time || match.elapsed_time ||
    match.movingTime || match.totalTimerTime || 0
  );
  return getCompliance(plannedSecs, actualSecs);
}

/** Pairing state for a planned workout vs. the day's recorded activities.
 *  - 'completed' → any same-sport activity recorded today, or pw.status === 'completed'
 *  - 'missed'    → date strictly in the past, no match, status !== 'completed'
 *  - null        → today/future or otherwise neutral
 */
function pairingStateFor(pw, acts, todayDateStr) {
  if (!pw) return null;
  if (pw.status === 'completed') return 'completed';
  const matched = (acts || []).some(a => sportMatches(pw.sport, a.sport || a.type || ''));
  if (matched) return 'completed';
  const pwDateStr = String(pw.date || '').slice(0, 10);
  if (!pwDateStr) return null;
  if (pwDateStr < todayDateStr) return 'missed';
  return null;
}

/** Pair planned workouts with same-sport activities for a single day.
 *  TrainingPeaks-style: each planned workout claims the first unclaimed
 *  matching activity, so the calendar shows ONE merged card instead of
 *  two stacked entries. Returns:
 *    pwToAct: Map<pw_id, activity>
 *    claimed: Set<activityKey> — activity ids that should be hidden
 */
function pairPlannedWithActivities(plannedForDay, acts) {
  const pwToAct = new Map();
  const claimed = new Set();
  if (!plannedForDay?.length || !acts?.length) return { pwToAct, claimed };
  const actKey = (a) => String(a?.id ?? a?._id ?? '');
  for (const pw of plannedForDay) {
    if (!pw?._id) continue;
    const claimedAlready = pw.completedTrainingId ? acts.find(a => actKey(a) === String(pw.completedTrainingId)) : null;
    const candidate = claimedAlready
      || acts.find(a => !claimed.has(actKey(a)) && sportMatches(pw.sport, a.sport || a.type || ''));
    if (candidate) {
      pwToAct.set(String(pw._id), candidate);
      claimed.add(actKey(candidate));
    }
  }
  return { pwToAct, claimed };
}

// ─── Planned workout card (desktop) ──────────────────────────────────────────
function PlannedWorkoutCard({ pw, onSelect, onStart, compact = false, onDragStart, onDragEnd, isDragging = false, compliance = null, pairingState = null, linkedActivity = null, onSelectLinked = null, onDuplicate = null, onDelete = null, onRepeat = null }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [repeatOpen, setRepeatOpen] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState({ top: 0, right: 0 });
  const menuBtnRef = React.useRef(null);
  const { getCategory, getCategoryStyle: getCatStyle } = useCategories();

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (!e.target.closest('[data-pw-menu]')) { setMenuOpen(false); setRepeatOpen(false); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const openMenu = (e) => {
    e.stopPropagation();
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setMenuOpen(v => !v);
    setRepeatOpen(false);
  };

  const plannedSport = (pw.sport || 'bike').toLowerCase();
  const color = SPORT_PLAN_COLORS[plannedSport] || '#767EB5';
  // Fall back to plannedDuration (seconds) when workout has no structured steps
  const plannedDur = planStepTotalSecs(pw.steps) || pw.plannedDuration || 0;
  const isCompleted = pw.status === 'completed';
  const isSkipped   = pw.status === 'skipped';

  // When merged with an actual activity, prefer real metrics for the card
  const actSecs = Number(linkedActivity?.duration || linkedActivity?.moving_time
                || linkedActivity?.elapsed_time || linkedActivity?.movingTime
                || linkedActivity?.totalTimerTime || linkedActivity?.totalElapsedTime || 0);
  const actDistMeters = Number(linkedActivity?.distance || linkedActivity?.totalDistance || 0);
  const sport = linkedActivity ? (linkedActivity.sport || linkedActivity.type || plannedSport) : plannedSport;
  const duration = (linkedActivity && actSecs > 0) ? actSecs : plannedDur;
  const linkedDistStr = (linkedActivity && actDistMeters > 0)
    ? (actDistMeters >= 1000 ? `${(actDistMeters/1000).toFixed(actDistMeters % 1000 === 0 ? 0 : 1)} km` : `${Math.round(actDistMeters)} m`)
    : null;
  // Planned distance (km) — shown when no linked activity yet
  const plannedDistKm = Number(pw.plannedDistance || 0);
  const plannedDistStr = (!linkedActivity && plannedDistKm > 0)
    ? (plannedDistKm >= 1 ? `${plannedDistKm % 1 === 0 ? plannedDistKm : plannedDistKm.toFixed(1)} km` : `${Math.round(plannedDistKm * 1000)} m`)
    : null;

  if (compact) {
    const isCompletedPair = pairingState === 'completed' || isCompleted;
    const isMissedPair    = pairingState === 'missed' && !isCompletedPair;
    const isPurelyPlanned = !isCompletedPair && !isMissedPair && !compliance;

    // ── Card appearance ────────────────────────────────────────────────────
    // completed pair  → green tint, solid border
    // missed          → red tint, solid border
    // pure planned    → very light sport-tint bg, dashed border (ghost style)
    // compliance      → white bg, solid border (legacy)
    let cardBgColor, cardBorderStyle, cardBorderColor;
    if (isCompletedPair) {
      cardBgColor   = '#f0fdf4';
      cardBorderColor = '#bbf7d0';
      cardBorderStyle = 'solid';
    } else if (isMissedPair) {
      cardBgColor   = '#fef2f2';
      cardBorderColor = '#fecaca';
      cardBorderStyle = 'solid';
    } else if (isPurelyPlanned) {
      // Ghost style: very faint sport-color tint + dashed border
      cardBgColor   = color + '10'; // ~6% opacity
      cardBorderColor = color + '55'; // ~33% opacity
      cardBorderStyle = 'dashed';
    } else {
      cardBgColor   = '#ffffff';
      cardBorderColor = '#e5e7eb';
      cardBorderStyle = 'solid';
    }

    return (
      <div
        className="relative group/plan w-full max-w-full"
        style={{ minWidth: 0, opacity: isDragging ? 0.4 : isSkipped ? 0.45 : 1, transition: 'opacity 0.15s' }}
        draggable={!isCompleted && !isSkipped}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <button
          onClick={() => {
            if (linkedActivity && onSelectLinked) onSelectLinked(linkedActivity);
            else if (onSelect) onSelect(pw);
          }}
          className="w-full max-w-full text-left rounded-xl border transition-all p-2 flex flex-col gap-1 hover:brightness-95"
          style={{
            backgroundColor: cardBgColor,
            borderColor: cardBorderColor,
            borderStyle: cardBorderStyle,
            borderLeftColor: color,
            borderLeftWidth: 3,
            borderLeftStyle: 'solid',
            minWidth: 0, overflow: 'hidden',
            cursor: (!isCompleted && !isSkipped) ? 'grab' : 'pointer',
          }}
          title={pw.title}
        >
          {/* Title row — sport icon + title (+ tiny check overlay when completed) */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="relative flex-shrink-0">
              <SportIcon sport={sport} className="w-3.5 h-3.5" />
              {isCompletedPair && (
                <CheckCircleIcon className="absolute -bottom-1 -right-1 w-2.5 h-2.5 text-green-600 bg-white rounded-full" />
              )}
            </span>
            <span
              className="text-[11px] font-bold truncate flex-1"
              style={{ color: isCompletedPair ? '#166534' : isMissedPair ? '#991b1b' : isSkipped ? '#9ca3af' : isPurelyPlanned ? color : '#1e293b' }}
            >
              {pw.title || 'Planned'}
            </span>
            {/* Compliance dot — hidden when card is already tinted */}
            {compliance && !isCompletedPair && !isMissedPair && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: compliance.color }} />
            )}
          </div>
          {/* Category + duration + stats row */}
          {(pw.category || duration > 0 || pw.targetTss > 0 || linkedDistStr || plannedDistStr) && (
            <div className="flex items-center gap-1.5 text-[10px] mt-0.5 flex-wrap">
              {pw.category && getCategory(pw.category) && (
                <span
                  className="text-[9px] uppercase tracking-wide px-1.5 py-[1px] rounded-md font-bold border leading-tight flex-shrink-0"
                  style={getCatStyle(pw.category)}
                  title={getCategory(pw.category)?.label}
                >
                  {getCategory(pw.category)?.label}
                </span>
              )}
              {duration > 0 && (
                <span style={{ color: isPurelyPlanned ? color + 'cc' : '#6b7280' }}>{fmtPlanDuration(duration)}</span>
              )}
              {(linkedDistStr || plannedDistStr) && (
                <>
                  <span style={{ color: '#d1d5db' }}>·</span>
                  <span style={{ color: isPurelyPlanned ? color + 'cc' : '#6b7280' }}>{linkedDistStr || plannedDistStr}</span>
                </>
              )}
              {!(linkedDistStr || plannedDistStr) && pw.targetTss > 0 && (
                <>
                  <span style={{ color: '#d1d5db' }}>·</span>
                  <span style={{ color: isPurelyPlanned ? color + 'cc' : '#6b7280' }}>{pw.targetTss} TSS</span>
                </>
              )}
              {compliance && (
                <span className="ml-auto text-[9px] font-bold" style={{ color: compliance.color }}>
                  {compliance.label}
                </span>
              )}
            </div>
          )}
        </button>
        {/* Three-dot menu */}
        <button
          ref={menuBtnRef}
          onClick={openMenu}
          className="absolute top-0.5 right-0.5 z-20 opacity-0 group-hover/plan:opacity-100 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
            <circle cx="8" cy="3" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="8" cy="13" r="1.3"/>
          </svg>
        </button>
        {menuOpen && ReactDOM.createPortal(
          <div
            data-pw-menu
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
            className="w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 text-sm overflow-hidden"
          >
            {!repeatOpen ? (
              <>
                <button className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700 transition-colors"
                  onClick={e => { e.stopPropagation(); setMenuOpen(false); onSelect?.(pw); }}>
                  <PencilIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> Edit
                </button>
                {onDuplicate && (
                  <button className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700 transition-colors"
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); onDuplicate(pw); }}>
                    <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <rect x="4" y="4" width="9" height="9" rx="1.5"/><path d="M3 12V3h9" strokeLinecap="round"/>
                    </svg>
                    Copy
                  </button>
                )}
                {onRepeat && (
                  <button className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700 transition-colors"
                    onClick={e => { e.stopPropagation(); setRepeatOpen(true); }}>
                    <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8}>
                      <path d="M2 8a6 6 0 1 0 6-6" strokeLinecap="round"/><path d="M2 3v5h5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Repeat
                  </button>
                )}
                {!isCompleted && !isSkipped && onStart && (
                  <button className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2.5 text-gray-700 transition-colors"
                    onClick={e => { e.stopPropagation(); setMenuOpen(false); onStart(pw); }}>
                    <PlayIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> Start
                  </button>
                )}
                {onDelete && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    <button className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2.5 text-red-500 transition-colors"
                      onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(pw); }}>
                      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8}>
                        <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5L11 4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Delete
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="px-3 py-2">
                <button className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 mb-2 transition-colors"
                  onClick={e => { e.stopPropagation(); setRepeatOpen(false); }}>
                  ← Back
                </button>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Repeat for N weeks</div>
                <div className="grid grid-cols-3 gap-1">
                  {[2, 3, 4, 6, 8, 12].map(w => (
                    <button key={w}
                      className="py-1.5 rounded-lg text-xs font-bold text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                      onClick={e => { e.stopPropagation(); setMenuOpen(false); setRepeatOpen(false); onRepeat(pw, w); }}>
                      {w}×
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
      </div>
    );
  }

  // full card for mobile selected-day view — matches activity card style
  const isCompletedFull = pairingState === 'completed' || isCompleted;
  const isMissedFull    = pairingState === 'missed' && !isCompletedFull;
  const isGreenFull = compliance?.color === '#22c55e' || isCompletedFull;
  const leftBorderFull = isGreenFull ? '#22c55e' : isMissedFull ? '#ef4444' : compliance ? compliance.color : color;
  const fullCardBg = isGreenFull ? 'bg-green-50 border-green-200' : isMissedFull ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200';
  return (
    <div
      className={`w-full rounded-xl border overflow-hidden transition-all shadow-sm ${fullCardBg}`}
      style={{ borderLeftColor: leftBorderFull, borderLeftWidth: 4 }}
    >
      {/* Clickable header — opens edit modal */}
      <button
        onClick={() => onSelect && onSelect(pw)}
        className="w-full text-left p-3 flex items-start gap-3 active:bg-black/5 transition-colors touch-manipulation"
        style={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {pw.sport && (
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '20' }}>
            <img src={`/icon/${sport}.svg`} alt={sport} className="w-4 h-4" onError={e => { e.target.style.display='none'; }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-900 truncate flex-1">{pw.title || 'Planned workout'}</span>
            {/* Compliance badge */}
            {compliance && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                style={{ backgroundColor: compliance.color + '20', color: compliance.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: compliance.color }} />
                {compliance.label}
              </span>
            )}
            {!compliance && isCompleted && <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />}
            {isSkipped && <span className="text-xs text-gray-400 flex-shrink-0">skipped</span>}
            {!isCompleted && !isSkipped && (
              <PencilIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-40" style={{ color }} />
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {duration > 0 && <span>{fmtPlanDuration(duration)}</span>}
            {pw.steps?.length > 0 && <span>{pw.steps.filter(s => !s.isGroupHeader).length} steps</span>}
            {pw.targetTss > 0 && <span>{pw.targetTss} TSS</span>}
          </div>
          {pw.steps?.length > 0 && (
            <div className="mt-2">
              <PlanMiniChart steps={pw.steps} color={color} width={160} height={22} />
            </div>
          )}
        </div>
      </button>

      {/* Action buttons row */}
      {!isSkipped && (
        <div className="flex border-t" style={{ borderColor: color + '30' }}>
          {!isCompleted && onSelect && (
            <button
              onClick={() => onSelect(pw)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors touch-manipulation min-h-[44px]"
              style={{ color, backgroundColor: color + '08', WebkitTapHighlightColor: 'transparent' }}
            >
              <PencilIcon className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {isCompleted && onSelect && (
            <button
              onClick={() => onSelect(pw)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors touch-manipulation min-h-[44px]"
              style={{ color, backgroundColor: color + '08', WebkitTapHighlightColor: 'transparent' }}
            >
              <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" /> View Results
            </button>
          )}
          {!isCompleted && !isSkipped && onStart && (
            <button
              onClick={() => onStart(pw)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors touch-manipulation border-l min-h-[44px]"
              style={{ color: '#fff', backgroundColor: color, borderColor: color + '40', WebkitTapHighlightColor: 'transparent' }}
            >
              <PlayIcon className="w-3.5 h-3.5" /> Start
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Week view activity card (richer, TrainingPeaks style) ───────────────────
function WeekActivityCard({ a, isSelected, onSelect, onActivityClick, onAddLactate, catBadgeStyle, catLabel }) {
  const title = a.title || a.name || a.originalFileName || 'Activity';

  const dur  = Number(a.duration || a.elapsed_time || a.movingTime || 0);
  const dist = Number(a.distance || a.totalDistance || 0);
  const tss  = Number(a.tss || a.trainingLoad || 0);
  const hr   = Number(a.averageHeartRate || a.average_heartrate || 0);
  const power = Number(a.normalizedPower || a.avgPower || a.average_watts || 0);

  const s = String(a.sport || '').toLowerCase();
  const isSwim = s.includes('swim');
  const isRun  = s.includes('run') || s.includes('hike') || s.includes('walk') || s.includes('trail');
  const isBike = s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual');

  const durStr = dur > 0 ? `${Math.floor(dur/3600)}h ${String(Math.floor((dur%3600)/60)).padStart(2,'0')}m` : null;
  const distStr = dist > 0 ? (dist >= 1000 ? `${(dist/1000).toFixed(1)} km` : `${Math.round(dist)} m`) : null;

  // Pace: sec/km for run, sec/100m for swim
  const paceStr = (() => {
    if (isSwim && dist > 0 && dur > 0) {
      const sper100 = dur / (dist / 100);
      return `${Math.floor(sper100/60)}:${String(Math.round(sper100%60)).padStart(2,'0')}/100m`;
    }
    if (isRun && dist > 0 && dur > 0) {
      const sperkm = dur / (dist / 1000);
      return `${Math.floor(sperkm/60)}:${String(Math.round(sperkm%60)).padStart(2,'0')}/km`;
    }
    return null;
  })();

  const color = sportColor(a.sport);

  const handleClick = (e) => {
    if (onActivityClick) {
      // Capture rect immediately — React nullifies e.currentTarget after the handler returns
      const rect = e.currentTarget ? e.currentTarget.getBoundingClientRect() : null;
      onActivityClick(a, rect);
    } else {
      onSelect(a);
    }
  };

  return (
    <div className="relative group/act w-full">
      <button
        onClick={handleClick}
        className={`w-full text-left rounded-xl border transition-all p-2 flex flex-col gap-1 ${
          isSelected
            ? 'bg-gradient-to-br from-primary to-primary-dark text-white shadow-md ring-2 ring-primary/20'
            : 'bg-white hover:bg-gray-50 text-gray-800 shadow-sm hover:shadow-md border-gray-200'
        }`}
        style={{ borderLeftColor: color, borderLeftWidth: 3 }}
      >
        {/* Title row */}
        <div className="flex items-center gap-1.5 min-w-0">
          <SportIcon sport={a.sport} className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[11px] font-bold truncate flex-1">{title}</span>
          {a.category && catBadgeStyle && catLabel && (
            <span
              className="text-[8.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md border flex-shrink-0 leading-none"
              style={isSelected
                ? { backgroundColor: 'rgba(255,255,255,.18)', color: '#fff', borderColor: 'rgba(255,255,255,.35)' }
                : catBadgeStyle(a.category)}
              title={catLabel(a.category)}
            >
              {catLabel(a.category)}
            </span>
          )}
        </div>
        {/* Single stats row: duration · distance · pace/power · HR */}
        {(durStr || distStr || paceStr || (isBike && power > 0) || hr > 0) && (
          <div className={`flex items-center gap-1.5 text-[10px] flex-wrap ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
            {durStr && <span>{durStr}</span>}
            {distStr && <><span className={isSelected ? 'text-white/30' : 'text-gray-300'}>·</span><span>{distStr}</span></>}
            {paceStr && <><span className={isSelected ? 'text-white/30' : 'text-gray-300'}>·</span><span className="font-medium">{paceStr}</span></>}
            {isBike && power > 0 && <><span className={isSelected ? 'text-white/30' : 'text-gray-300'}>·</span><span className="font-medium">{Math.round(power)} W</span></>}
            {hr > 0 && <><span className={isSelected ? 'text-white/30' : 'text-gray-300'}>·</span><span>♥ {Math.round(hr)}</span></>}
          </div>
        )}
        {/* TSS bar */}
        {tss > 0 && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (tss/150)*100)}%`, backgroundColor: tss > 100 ? '#ef4444' : tss > 70 ? '#f59e0b' : '#22c55e' }} />
            </div>
            <span className={`text-[9px] font-bold flex-shrink-0 ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{Math.round(tss)} TSS</span>
          </div>
        )}
      </button>
      {onAddLactate && a.type === 'strava' && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddLactate(a); }}
          title="Add lactate"
          className="absolute top-0.5 right-0.5 hidden group-hover/act:flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold bg-violet-100 text-violet-700 hover:bg-violet-200 border border-violet-200 leading-none z-10"
        >
          + La
        </button>
      )}
    </div>
  );
}

// ─── Lap Chart ────────────────────────────────────────────────────────────────
function LapChart({ laps, color, isBike, isRun, isSwim, selectedLap, onSelectLap, chartScrollRef, onScrollCenter, scaleOverride = null, records = null }) {
  const CHART_H   = 200;
  const Y_AXIS_W  = 38;
  const X_LABEL_H = 16;

  // X-axis zoom: enable horizontal scroll when a lap is selected so the
  // selected bar gets more breathing room. Threshold = 0 means zoom always
  // activates on selection. On deselect the chart snaps back to full-width.
  const ZOOM_THRESHOLD = 0;
  const MIN_BAR_PX     = 36; // px per lap when zoomed — bigger = more focused

  const entries = laps.map((lap) => {
    const dur  = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
    // For pace: prefer moving_time (excludes stopped time) so paused laps
    // don't show an artificially slow pace. Fall back to elapsed_time.
    const movingDur = Number(
      lap.moving_time || lap.movingTime || lap.totalMovingTime || 0
    ) || dur;
    const dist = Number(lap.distance || lap.totalDistance || 0);
    const pow  = Number(lap.average_watts || lap.avgPower || 0);
    const lactate = lap.lactate != null ? Number(lap.lactate) : null;
    let value = 0;
    if (isBike)                                   value = pow;
    else if (isRun  && dist > 0 && movingDur > 0) value = movingDur / (dist / 1000);
    else if (isSwim && dist > 0 && movingDur > 0) value = movingDur / (dist / 100);
    // weight = dist for swim/run (proportional to distance), dur for bike
    const weight = isBike ? Math.max(dur, 1) : Math.max(dist, 1);
    return { value, weight, dur, dist, isPause: !isBike && dist <= 0, lactate };
  });

  // Zoom activates only when a lap is selected AND there are many laps.
  // On deselect → isZoomed goes false → bars automatically fit the full width
  // again (proportionally), no scrolling needed.
  const isZoomed = entries.length > ZOOM_THRESHOLD && selectedLap != null;

  // When zoomed, scale the container so that bars remain proportional to their
  // weight (distance / duration) while giving the shortest non-pause lap at
  // least MIN_BAR_PX pixels of width.
  const totalWeight    = entries.reduce((a, e) => a + e.weight, 0) || 1;
  const minNonPauseW   = Math.min(...entries.filter(e => !e.isPause && e.weight > 0).map(e => e.weight)) || 1;
  // Container width = scale factor × MIN_BAR_PX, where scale factor = totalWeight / minLapWeight.
  // This guarantees proportionality: every bar's flex-grow (= weight) / totalWeight × containerW
  // gives the shortest bar exactly MIN_BAR_PX and longer bars proportionally more.
  const zoomedTotalW   = isZoomed
    ? Math.round((totalWeight / minNonPauseW) * MIN_BAR_PX)
    : 0;

  // Auto-scroll: center the selected lap when zoomed.
  // On deselect, reset scroll to 0 before the container shrinks back.
  useEffect(() => {
    if (!chartScrollRef?.current) return;
    const container = chartScrollRef.current;
    if (!isZoomed || selectedLap == null) {
      container.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }
    const containerW = container.clientWidth;
    const innerW     = Math.max(zoomedTotalW, containerW);
    const cumW       = entries.slice(0, selectedLap).reduce((a, e) => a + e.weight, 0);
    const barCenterX = (cumW + entries[selectedLap].weight / 2) / totalWeight * innerW;
    container.scrollTo({ left: Math.max(0, barCenterX - containerW / 2), behavior: 'smooth' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLap, isZoomed]);

  const nonZero = entries.filter(e => !e.isPause && e.value > 0).map(e => e.value);
  if (!nonZero.length) return null;

  const isInverted = isRun || isSwim; // lower pace value = faster = taller bar

  // ── Build the y-axis range from "real" laps only ──
  // Short rests / standing pauses inflate the slowest pace into nonsense
  // (e.g. a 28-metre walking transition = 48:19 /km) and squeeze every real
  // running lap into the top sliver of the chart so the bars all look the
  // same height. Drop laps that are too short OR clearly tagged as
  // warmup/recovery/cooldown when picking min/max; bars for those laps
  // still render — they just clamp to the chart's edge instead of dictating
  // the scale.
  const scaleEntries = entries.filter((e, i) => {
    if (e.isPause || !e.value || e.value <= 0) return false;
    const lap = laps[i];
    const lapType = lap?.intervalType;
    if (lapType && lapType !== 'work') return false;
    // Pace-based heuristic: drop laps shorter than ~30 s or under 100 m for
    // run/swim. For bike (power), short laps are usually fine — keep them.
    if (isRun || isSwim) {
      if ((e.dur || 0) < 30) return false;
      if ((e.dist || 0) < 100) return false;
    }
    return true;
  }).map(e => e.value);

  // IQR-based outlier clamp: removes recovery/cooldown laps whose pace
  // would collapse the scale (e.g. 2:00/100m when all intervals are 1:14–1:46).
  let scaleValues = scaleEntries.length > 0 ? scaleEntries : nonZero;
  if (scaleValues.length >= 4) {
    const sorted = [...scaleValues].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    // Tukey fences — 1.5× IQR is standard; for pace (inverted) the slow
    // outliers are at the HIGH end, for power (non-inverted) at the LOW end.
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    const filtered = scaleValues.filter(v => v >= lo && v <= hi);
    if (filtered.length >= 2) scaleValues = filtered;
  }

  const maxVal   = Math.max(...scaleValues);
  const minVal   = Math.min(...scaleValues);
  // Centre the Y-axis around the average of the scale values so the "typical"
  // bar sits in the middle of the chart and differences between laps are easy
  // to read. We compute the max deviation from the average, add 30 % padding,
  // and use that as a symmetric spread on both sides.
  //   e.g. 8×800 m at 3:06–3:12/km  → avg ≈ 3:09, spread ≈ ±15 s
  //        chart range 2:54 – 3:24  → all bars clearly differentiated
  // Y-axis is fixed regardless of selection — selecting a lap never changes the scale.
  let chartMin, chartMax;
  if (scaleOverride) {
    chartMin = scaleOverride.min;
    chartMax = scaleOverride.max;
  } else {
    const center = scaleValues.reduce((a, b) => a + b, 0) / (scaleValues.length || 1);
    const sorted = [...scaleValues].sort((a, b) => a - b);
    let spread;
    if (sorted.length >= 4) {
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const iqr = q3 - q1;
      spread = Math.max(iqr * 1.5, center * 0.06);
    } else {
      const maxDev = Math.max(...scaleValues.map(v => Math.abs(v - center)));
      spread = (maxDev || center * 0.06) * 1.2;
    }
    chartMin = Math.max(0, center - spread);
    chartMax = center + spread;
  }
  const range    = chartMax - chartMin || 1;

  const getBarH = (val) => {
    if (!val) return 3;
    const h = isInverted
      ? ((chartMax - val) / range) * CHART_H
      : ((val - chartMin) / range) * CHART_H;
    // Clamp both ends — outlier laps outside [minVal, maxVal] would otherwise
    // produce negative heights or overflow the chart.
    return Math.max(3, Math.min(CHART_H, h));
  };

  // Intensity 0..1: 1 = fastest / most power, 0 = slowest / least power
  const getIntensity = (val) => {
    if (!val || maxVal === minVal) return 0.5;
    return isInverted ? (maxVal - val) / (maxVal - minVal) : (val - minVal) / (maxVal - minVal);
  };

  const fmtTick = (v) => {
    if (isBike) return `${Math.round(v)}`;
    const m = Math.floor(v / 60), s = Math.round(v % 60);
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  };
  const unitLabel = isSwim ? '/100m' : isRun ? '/km' : 'W';
  // For bike (non-inverted): high value at top → start from chartMax and step DOWN.
  // For run/swim (inverted): fast pace (low seconds) at top → start from chartMin and step UP.
  const yTicks = Array.from({ length: 5 }, (_, i) =>
    isInverted
      ? chartMin + (range * i) / 4   // run/swim: chartMin (fastest) at top
      : chartMax - (range * i) / 4   // bike:     chartMax (most power) at top
  );

  // ── Elevation outline ────────────────────────────────────────────────────────
  const hasElevation = laps.some(l =>
    Number(l.total_ascent ?? l.totalAscent ?? 0) > 0 ||
    (l.start_altitude != null && !isNaN(Number(l.start_altitude)))
  );

  let elevPathD = null;
  if (hasElevation) {
    let alts;
    const firstSA = Number(laps[0]?.start_altitude ?? NaN);
    if (!isNaN(firstSA)) {
      alts = laps.map(l => Number(l.start_altitude ?? 0));
      alts.push(Number(laps[laps.length - 1]?.end_altitude ?? alts[alts.length - 1]));
    } else {
      let cum = 0;
      alts = [0, ...laps.map(l => {
        cum += Number(l.total_ascent ?? l.totalAscent ?? 0) - Number(l.total_descent ?? l.totalDescent ?? 0);
        return cum;
      })];
    }
    const altMin = Math.min(...alts);
    const altMax = Math.max(...alts);
    if (altMax - altMin >= 2) {
      const altRange = altMax - altMin;
      const totalW = entries.reduce((s, e) => s + e.weight, 0) || 1;
      let cumW = 0;
      const pts = alts.map((alt, i) => {
        const x = (cumW / totalW * 100).toFixed(1);
        if (i < entries.length) cumW += entries[i].weight;
        const y = ((1 - (alt - altMin) / altRange) * (CHART_H - 8) + 4).toFixed(1);
        return `${x},${y}`;
      });
      const lastX = (cumW / totalW * 100).toFixed(1);
      elevPathD = `M ${pts[0]} ${pts.slice(1).map(p => `L ${p}`).join(' ')} L ${lastX},${CHART_H} L 0,${CHART_H} Z`;
    }
  }

  // ── Fallback: build elevation from raw records when lap-level data is missing ──
  if (!elevPathD && Array.isArray(records) && records.length > 0) {
    const altRecs = records.filter(r => r.altitude != null);
    if (altRecs.length >= 4) {
      const altValues = altRecs.map(r => r.altitude);
      const altMin = Math.min(...altValues);
      const altMax = Math.max(...altValues);
      if (altMax - altMin >= 1) {
        const altRange = altMax - altMin;
        // Pick the best x-axis source: timeFromStart (FIT) → distance (Strava)
        // → index (fallback when neither is available)
        const hasTime = altRecs[0].timeFromStart != null;
        const hasDist = altRecs.some(r => r.distance != null);
        const getX = hasTime
          ? (r) => r.timeFromStart
          : hasDist
            ? (r) => r.distance
            : (_, i) => i;
        const xVals = altRecs.map((r, i) => getX(r, i));
        const xMax = Math.max(...xVals) || 1;
        // Downsample to ~300 points to keep the SVG path short
        const step = Math.max(1, Math.floor(altRecs.length / 300));
        const sampled = altRecs.filter((_, i) => i % step === 0 || i === altRecs.length - 1);
        const pts = sampled.map((r, si) => {
          const origIdx = si * step;
          const xv = getX(r, origIdx);
          const x = ((xv / xMax) * 100).toFixed(1);
          const y = ((1 - (r.altitude - altMin) / altRange) * (CHART_H - 8) + 4).toFixed(1);
          return `${x},${y}`;
        });
        elevPathD = `M ${pts[0]} ${pts.slice(1).map(p => `L ${p}`).join(' ')} L 100,${CHART_H} L 0,${CHART_H} Z`;
      }
    }
  }

  // Selected header data
  const sel       = selectedLap != null ? laps[selectedLap] : null;
  const selEnt    = selectedLap != null ? entries[selectedLap] : null;
  const selPace   = selEnt?.value ? `${fmtTick(selEnt.value)} ${unitLabel}` : null;
  const selLapNum = sel ? (sel.lapNumber ?? (selectedLap + 1)) : null;
  const selDistStr = selEnt && selEnt.dist > 0
    ? (selEnt.dist >= 1000 ? `${(selEnt.dist/1000).toFixed(1)} km` : `${Math.round(selEnt.dist)} m`)
    : null;
  const selDurStr = sel ? (() => {
    const d = Number(sel.elapsed_time || sel.totalElapsedTime || sel.duration || 0);
    const m = Math.floor(d / 60), s = Math.round(d % 60);
    return d < 60 ? `${Math.round(d)}s` : `${m}:${String(s).padStart(2, '0')}`;
  })() : null;

  const handleChartScroll = () => {};

  return (
    <div className="px-4 pb-2">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg flex-1 mr-2 min-h-[30px]">
          {sel != null ? (
            <>
              <span className="text-xs font-bold text-gray-900">Lap {selLapNum}</span>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-xs font-semibold text-gray-600">{selDurStr}</span>
              {selDistStr && <><span className="text-gray-300 text-xs">·</span><span className="text-xs text-gray-500">{selDistStr}</span></>}
              {selPace && <><span className="text-gray-300 text-xs">·</span><span className="text-xs font-semibold" style={{ color }}>{selPace}</span></>}
            </>
          ) : (
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
              {isSwim ? 'Laps · pace /100m' : isRun ? 'Laps · pace /km' : isBike ? 'Laps · power' : 'Laps'}
            </span>
          )}
        </div>
        {selectedLap != null && (
          <button
            onClick={() => onSelectLap(null)}
            className="flex-shrink-0 text-[10px] px-2 py-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 font-semibold leading-none transition-colors"
          >
            deselect
          </button>
        )}
      </div>

      <div className="flex gap-1">
        {/* Y-axis */}
        <div className="relative flex-shrink-0" style={{ width: Y_AXIS_W, height: CHART_H + X_LABEL_H }}>
          {yTicks.map((v, i) => (
            <span key={i} className="absolute right-1 text-[9px] text-gray-400 leading-none select-none"
              style={{ top: `${(i / 4) * CHART_H}px`, transform: 'translateY(-50%)' }}>
              {fmtTick(v)}
            </span>
          ))}
          <span className="absolute right-1 bottom-0 text-[9px] text-gray-400 leading-none select-none">{unitLabel}</span>
        </div>

        {/* Bars — scroll horizontally when there are many laps */}
        <div
          ref={chartScrollRef}
          className="flex-1 min-w-0"
          style={{ overflowX: isZoomed ? 'auto' : 'hidden', overflowY: 'hidden' }}
          onScroll={handleChartScroll}
        >
          <div
            style={{
              position: 'relative',
              height: CHART_H + X_LABEL_H,
              /* When zoomed: at least zoomedTotalW px wide so every bar has
                 room; minWidth:100% ensures it still fills the container when
                 there are few laps (non-zoomed path). */
              width: isZoomed ? Math.max(zoomedTotalW, 0) : '100%',
              minWidth: '100%',
            }}
          >
            {/* Horizontal grid lines — one per Y-axis tick, helps visual alignment */}
            {yTicks.map((_, i) => (
              <div key={i} style={{
                position: 'absolute', left: 0, right: 0,
                top: (i / 4) * CHART_H,
                height: 1, backgroundColor: '#F3F4F6', zIndex: 0, pointerEvents: 'none',
              }} />
            ))}
            {/* Elevation background — emerald green fill behind bars */}
            {elevPathD && (
              <svg
                viewBox={`0 0 100 ${CHART_H}`}
                preserveAspectRatio="none"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: CHART_H, pointerEvents: 'none', zIndex: 1, opacity: 0.55 }}
              >
                <defs>
                  <linearGradient id="lapElevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.08" />
                  </linearGradient>
                </defs>
                <path d={elevPathD} fill="url(#lapElevGrad)" />
              </svg>
            )}
            {/* Bars */}
            <div
              className="flex items-end"
              style={{
                height: CHART_H + X_LABEL_H,
                gap: 1,
                width: '100%',
                position: 'relative',
                zIndex: 2,
              }}
            >
            {entries.map((ent, i) => {
              const isSelected = selectedLap === i;
              const barH = getBarH(ent.value);

              // Intensity-based color shading — all bars keep some transparency
              // so the elevation background always shows through.
              const hasLactate = ent.lactate != null && !isNaN(ent.lactate);
              let barBg;
              if (ent.isPause) {
                barBg = isSelected ? color + '55' : '#E5E7EB99';
              } else if (hasLactate) {
                barBg = isSelected ? '#7c3aedcc' : '#a78bfaaa';
              } else {
                const intensity = getIntensity(ent.value);
                const dimmed = selectedLap != null && !isSelected;
                // Selected: ~80% opacity, unselected: 15–75%, dimmed: ~28%
                const alpha = Math.round((
                  isSelected ? 0.80 : dimmed ? 0.28 : (0.15 + intensity * 0.60)
                ) * 255).toString(16).padStart(2, '0');
                barBg = color + alpha;
              }

              const itemStyle = { flex: `${ent.weight} 0 2px`, minWidth: 2, height: CHART_H + X_LABEL_H, transition: 'flex-basis 0.25s ease' };

              return (
                <div
                  key={i}
                  className="flex flex-col cursor-pointer select-none"
                  style={itemStyle}
                  onClick={() => onSelectLap(isSelected ? null : i)}
                >
                  {/* ── Bar area — exactly CHART_H tall, bar grows from the bottom ── */}
                  <div style={{ height: CHART_H, position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {ent.isPause ? (
                      <div style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: barBg, marginBottom: 2 }} />
                  ) : (
                      <div style={{ position: 'relative', width: '100%' }}>
                        {/* Lactate value label above the bar */}
                        {hasLactate && (
                    <div style={{
                            position: 'absolute', bottom: barH + 2, left: 0, right: 0,
                            textAlign: 'center', fontSize: 8, fontWeight: 800,
                            color: '#7c3aed', lineHeight: 1, pointerEvents: 'none',
                          }}>
                            {ent.lactate.toFixed(1)}
                          </div>
                        )}
                        <div style={{
                      width: '100%',
                      height: barH,
                      backgroundColor: barBg,
                      borderRadius: '3px 3px 0 0',
                          boxShadow: isSelected ? `0 0 0 2px ${hasLactate ? '#7c3aed' : color}, 0 2px 8px ${hasLactate ? '#7c3aed' : color}60` : undefined,
                      transition: 'height 0.2s ease, opacity 0.15s ease',
                          position: 'relative', overflow: 'hidden',
                        }}>
                          {/* Violet cap stripe for lactate bars */}
                          {hasLactate && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#5b21b6', borderRadius: '3px 3px 0 0' }} />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* ── X-axis indicator — sits in its own X_LABEL_H strip below ── */}
                  <div className="relative w-full flex items-center justify-center flex-shrink-0" style={{ height: X_LABEL_H }}>
                    {isSelected && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full" style={{ width: 6, height: 3, backgroundColor: color }} />
                    )}
                  </div>
                </div>
              );
            })}
            </div>{/* end flex items-end bars */}
          </div>{/* end relative elevation wrapper */}
        </div>
      </div>
    </div>
  );
}

// ─── Activity Full Modal ──────────────────────────────────────────────────────
// Standalone Category picker — drops into both the desktop and mobile modal.
function CategoryPicker({ value, onChange }) {
  const { categories, getCategoryStyle } = useCategories();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  // `click` (not mousedown) so we run AFTER the option button's onClick has
  // already fired — otherwise on iOS the synthesised mousedown was closing
  // the panel before the tap registered on a child button, and the picked
  // category never made it through.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  const current = categories.find(c => c.id === value);

  // One handler for both mouse and touch so iOS never has to wait for the
  // synthesised click. stopPropagation prevents the outside-click listener
  // above from running before our state updates land.
  const pick = (e, nextValue) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-gray-50"
        style={current ? { ...getCategoryStyle(current.id), borderStyle: 'solid' } : { borderColor: '#e5e7eb', color: '#9ca3af', borderStyle: 'dashed' }}
      >
        {current ? (
          <>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: current.color }} />
            {current.label}
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full border border-gray-300" />
            Set category
          </>
        )}
        <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 right-0 w-44 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
             onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => pick(e, null)}
            onTouchEnd={(e) => pick(e, null)}
            className="w-full px-3 py-2 text-left text-xs text-gray-500 hover:bg-gray-50 flex items-center gap-2 touch-manipulation"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span className="w-2 h-2 rounded-full border border-gray-300" />
            <span>No category</span>
          </button>
          <div className="border-t border-gray-100" />
          {categories.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={(e) => pick(e, c.id)}
              onTouchEnd={(e) => pick(e, c.id)}
              className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-50 touch-manipulation ${value === c.id ? 'bg-gray-50 font-bold' : 'text-gray-700'}`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Small dropdown filter for the calendar toolbar — choose a category and
// hide every activity that isn't tagged with it (or leave "All" to keep them).
function CalendarCategoryFilter({ value, onChange, activities }) {
  const { categories, getCategoryStyle } = useCategories();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const counts = useMemo(() => {
    const m = new Map();
    (activities || []).forEach(a => { if (a.category) m.set(a.category, (m.get(a.category) || 0) + 1); });
    return m;
  }, [activities]);

  const active = value && value !== 'all' ? categories.find(c => c.id === value) : null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-2 md:px-2.5 py-1 md:py-1.5 rounded-lg md:rounded-xl text-xs font-semibold border transition-all bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
        style={active ? { ...getCategoryStyle(active.id), borderStyle: 'solid' } : {}}
      >
        {active ? (
          <>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: active.color }} />
            <span>{active.label}</span>
          </>
        ) : (
          <span>Categories</span>
        )}
        <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-50 w-48 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <button
            type="button"
            onClick={() => { onChange('all'); setOpen(false); }}
            className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-50 ${value === 'all' ? 'bg-gray-50 font-bold text-gray-900' : 'text-gray-600'}`}
          >
            <span>All categories</span>
            <span className="ml-auto text-[10px] text-gray-400">{activities?.length || 0}</span>
          </button>
          <div className="border-t border-gray-100" />
          {categories.map(c => {
            const n = counts.get(c.id) || 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id); setOpen(false); }}
                disabled={n === 0}
                className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2 ${n === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'} ${value === c.id ? 'bg-gray-50 font-bold' : 'text-gray-700'}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                <span>{c.label}</span>
                <span className="ml-auto text-[10px] text-gray-400">{n}</span>
              </button>
            );
          })}
          {/* Settings shortcut — opens the CategoryManager directly so the
              user can add / rename / re-colour categories without hunting
              for the right tab in Settings. Anchor (not Link) because we
              don't import react-router here; full-document navigation is
              fine for a one-shot jump into Settings. */}
          <div className="border-t border-gray-100" />
          <a
            href="/settings?tab=categories"
            onClick={() => setOpen(false)}
            className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-50 text-primary font-medium"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Setup categories</span>
          </a>
        </div>
      )}
    </div>
  );
}

// ─── CompareContent ───────────────────────────────────────────────────────────
const COMPARE_STEP_COLORS = { warmup:'#fbbf24', work:'#767EB5', recovery:'#6ee7b7', cooldown:'#38bdf8', rest:'#d1d5db' };
const COMPARE_STEP_BG     = { warmup:'#fef3c7', work:'#eef0fa', recovery:'#d1fae5', cooldown:'#e0f2fe', rest:'#f3f4f6' };
const COMPARE_STEP_TEXT   = { warmup:'#92400e', work:'#3730a3', recovery:'#065f46', cooldown:'#0369a1', rest:'#4b5563' };
const COMPARE_TYPE_LABELS = { warmup:'Warm-up', work:'Work', recovery:'Recovery', cooldown:'Cool-down', rest:'Rest' };

function detectLapType(lap, index, total) {
  // 1. Explicit interval type tag
  const it = lap?.intervalType;
  if (it && COMPARE_STEP_COLORS[it]) return it;
  // 2. Name-based heuristics
  const name = String(lap?.name || '').toLowerCase();
  if (/warm.?up|rozeh/i.test(name)) return 'warmup';
  if (/cool.?down|zklidn/i.test(name)) return 'cooldown';
  if (/recov|odpoc|rest/i.test(name)) return 'recovery';
  if (/interval|work|int\s*\d/i.test(name)) return 'work';
  // 3. Distance + pace heuristic: very short laps are clearly rest/recovery
  //    (e.g. 31m in 0:57, 75m in 1:00 between 800m intervals)
  const dist = Number(lap?.distance || lap?.totalDistance || 0);
  const dur  = Number(lap?.elapsed_time || lap?.totalElapsedTime || lap?.duration || 0);
  if (dist > 0 && dist < 200) return 'recovery'; // < 200m = clearly a rest/transition
  // Very slow pace for a run lap (> 8:00/km) = walking / recovery jog
  if (dist > 0 && dur > 0) {
    const paceSecKm = dur / (dist / 1000);
    if (paceSecKm > 480) return 'recovery'; // > 8:00/km
  }
  // 4. Position heuristic: first/last = warmup/cooldown, alternating = work/recovery
  if (index === 0 && total > 2) return 'warmup';
  if (index === total - 1 && total > 2) return 'cooldown';
  // Odd-indexed laps in an alternating session → work, even → recovery
  if (total >= 5) return index % 2 === 1 ? 'work' : 'recovery';
  return 'work';
}

function CompareLapTable({ laps, isBike, isRun, isSwim, workOnly }) {
  if (!Array.isArray(laps) || laps.length === 0) return (
    <div className="text-[10px] text-gray-400 italic px-1 py-2">No laps</div>
  );
  const fmtSec = s => {
    if (!s || s <= 0) return '—';
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.round(s%60);
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
  };
  const fmtDistCol = lap => {
    const d = Number(lap.distance || lap.totalDistance || 0);
    if (!d) return '—';
    return d >= 1000 ? `${(d/1000).toFixed(2)} km` : `${Math.round(d)} m`;
  };
  const fmtPace = lap => {
    const elapsed = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
    const moving  = Number(lap.moving_time || lap.movingTime || lap.totalMovingTime || 0) || elapsed;
    const dist = Number(lap.distance || lap.totalDistance || 0);
    const pow  = Number(lap.average_watts || lap.avgPower || 0);
    if (isBike) return pow > 0 ? `${Math.round(pow)} W` : '—';
    if ((isRun || isSwim) && dist > 0 && moving > 0) {
      const pace = isSwim ? moving / (dist / 100) : moving / (dist / 1000);
      const m = Math.floor(pace / 60), s = Math.round(pace % 60);
      return `${m}:${String(s).padStart(2,'0')}${isSwim ? '/100m' : '/km'}`;
    }
    return '—';
  };
  const total = laps.length;
  const rows = laps.map((lap, i) => {
    const type = detectLapType(lap, i, total);
    return { lap, i, type };
  }).filter(({ type }) => !workOnly || type === 'work');

  return (
    <table className="w-full text-[10px] border-collapse">
      <thead>
        <tr className="border-b border-gray-100">
          <th className="text-left font-bold text-gray-400 py-1 pr-1 w-5">#</th>
          <th className="text-left font-bold text-gray-400 py-1 pr-1">Type</th>
          <th className="text-right font-bold text-gray-400 py-1 pr-1">Time</th>
          {(isRun || isSwim) && <th className="text-right font-bold text-gray-400 py-1 pr-1">Dist</th>}
          <th className="text-right font-bold text-gray-400 py-1 pr-1">{isBike ? 'Power' : 'Pace'}</th>
          <th className="text-right font-bold text-gray-400 py-1"><HeartIcon className="w-3 h-3 inline" /></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ lap, i, type }) => {
          const hr = Number(lap.average_heartrate || lap.avgHeartRate || lap.heartRate || 0);
          const dur = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
          const color  = COMPARE_STEP_COLORS[type] || '#6b7280';
          const bg     = COMPARE_STEP_BG[type]     || '#f9fafb';
          const txtCol = COMPARE_STEP_TEXT[type]   || '#374151';
          const label  = COMPARE_TYPE_LABELS[type] || type;
          return (
            <tr key={i} style={{ backgroundColor: bg }} className="border-b border-white">
              <td className="py-0.5 pr-1 font-bold tabular-nums" style={{ color: txtCol }}>{i+1}</td>
              <td className="py-0.5 pr-1">
                <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: txtCol }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: color }} />
                  {label}
                </span>
              </td>
              <td className="py-0.5 pr-1 text-right tabular-nums text-gray-700">{fmtSec(dur)}</td>
              {(isRun || isSwim) && <td className="py-0.5 pr-1 text-right tabular-nums text-gray-600">{fmtDistCol(lap)}</td>}
              <td className="py-0.5 pr-1 text-right tabular-nums font-semibold" style={{ color: txtCol }}>{fmtPace(lap)}</td>
              <td className="py-0.5 text-right tabular-nums text-gray-600">{hr > 0 ? hr : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function WorkLapCompareTable({ currentLaps, results, isBike, isRun, isSwim }) {
  const sessions = [
    { label: 'Tento', laps: currentLaps, isRef: true },
    ...results.map(r => ({
      label: r.date ? (() => { const d = new Date(r.date); return `${d.getDate()}.${d.getMonth()+1}.${String(d.getFullYear()).slice(-2)}`; })() : '?',
      laps: Array.isArray(r.laps) ? r.laps : [], isRef: false, id: r.id,
    })),
  ];

  const fmtTime = (lap) => {
    const moving = Number(lap.moving_time || lap.movingTime || lap.totalMovingTime || 0);
    const elapsed = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
    const s = moving || elapsed;
    if (!s) return null;
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };
  const fmtDist = (lap) => {
    const d = Number(lap.distance || lap.totalDistance || 0);
    if (!d) return null;
    return d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${Math.round(d)} m`;
  };
  const fmtPace = (lap) => {
    const moving  = Number(lap.moving_time || lap.movingTime || lap.totalMovingTime || 0);
    const elapsed = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
    const dur  = moving || elapsed;
    const dist = Number(lap.distance || lap.totalDistance || 0);
    const pow  = Number(lap.average_watts || lap.avgPower || 0);
    if (isBike) return pow > 0 ? `${Math.round(pow)} W` : null;
    if ((isRun || isSwim) && dist > 0 && dur > 0) {
      const pace = isSwim ? dur / (dist / 100) : dur / (dist / 1000);
      const m = Math.floor(pace / 60), s = Math.round(pace % 60);
      return `${m}:${String(s).padStart(2, '0')}${isSwim ? '/100m' : '/km'}`;
    }
    return null;
  };
  const fmtHr = lap => { const h = Number(lap.average_heartrate || lap.avgHeartRate || lap.heartRate || 0); return h > 0 ? `${Math.round(h)}` : null; };

  const sessWorkLaps = sessions.map(s => {
    const total = s.laps.length;
    return s.laps.map((lap, i) => ({ lap, origIdx: i, type: detectLapType(lap, i, total) }))
                 .filter(({ type }) => type === 'work');
  });
  const maxWork = Math.max(...sessWorkLaps.map(w => w.length), 0);
  if (maxWork === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-purple-100 bg-white overflow-hidden">
      <div className="px-3 py-2 bg-purple-50 border-b border-purple-100 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#767EB5]" />
        <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wide">Work Lap Comparison</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse min-w-[320px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-center font-bold text-gray-400 py-1.5 px-2 w-6">W#</th>
              {sessions.map((s, si) => (
                <th key={si} className={`text-center font-bold py-1.5 px-2 ${s.isRef ? 'text-blue-600' : 'text-gray-500'}`}>
                  {s.isRef ? 'This' : s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxWork }, (_, wi) => (
              <tr key={wi} className="border-b border-gray-50" style={{ backgroundColor: wi % 2 === 0 ? '#eef0fa' : '#f5f6fc' }}>
                <td className="text-center font-bold text-[#767EB5] py-1.5 px-2">{wi + 1}</td>
                {sessWorkLaps.map((workLaps, si) => {
                  const entry = workLaps[wi];
                  if (!entry) return <td key={si} className="text-center text-gray-300 py-1.5 px-2">—</td>;
                  const time = fmtTime(entry.lap);
                  const dist = (isRun || isSwim) ? fmtDist(entry.lap) : null;
                  const pace = fmtPace(entry.lap);
                  const hr   = fmtHr(entry.lap);
                  const isRef = sessions[si].isRef;
                  return (
                    <td key={si} className="text-center py-1.5 px-2">
                      {/* time */}
                      {time && <div className="text-gray-500 tabular-nums text-[9px]">{time}</div>}
                      {/* distance (run/swim only) */}
                      {dist && <div className="text-gray-400 tabular-nums text-[9px]">{dist}</div>}
                      {/* pace / power — primary metric */}
                      {pace && <div className={`font-bold tabular-nums ${isRef ? 'text-blue-700' : 'text-gray-700'}`}>{pace}</div>}
                      {/* HR */}
                      {hr && <div className="text-gray-400 tabular-nums flex items-center justify-center gap-0.5">{hr}<HeartIcon className="w-2.5 h-2.5 inline" /></div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareContent({ merged, athleteId, onOpen }) {
  const hasTitle    = !!(merged?.titleManual || (merged?.title && String(merged.title).trim()));
  const hasCategory = !!(merged?.category);
  const hasLactate  = Number(merged?.lactate) > 0;
  const sport       = String(merged?.sport || '');
  const isBike = /bike|cycling|ride/i.test(sport);
  const isRun  = /run/i.test(sport);
  const isSwim = /swim/i.test(sport);
  const normSport = isBike ? 'bike' : isRun ? 'run' : isSwim ? 'swim' : 'bike';

  const [activeFilters, setActiveFilters] = useState(() => {
    const init = [];
    if (hasTitle)    init.push('title');
    if (hasCategory) init.push('category');
    if (hasLactate)  init.push('lactate');
    return init;
  });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [workOnly, setWorkOnly] = useState(true); // hide rest/recovery by default
  const [expandedCards, setExpandedCards] = useState({});
  // Session-progress chart state
  const [metric, setMetric]           = useState('power');
  const [hideWarmCool, setHideWarmCool] = useState(false);
  const [highlightId, setHighlightId]  = useState(null);
  const [hiddenSessions, setHiddenSessions] = useState(new Set());
  // Edit training form
  const [editTarget, setEditTarget]   = useState(null); // training to open in form

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const currentLaps = useMemo(() => Array.isArray(merged?.laps) ? merged.laps : [], [merged?.laps]);

  // Similarity helpers — used to rank fetched results
  const currentDurSec = Number(merged?.duration || merged?.elapsed_time || merged?.totalElapsedTime || 0);
  const currentWorkLapCount = useMemo(() => {
    const n = currentLaps.length;
    return currentLaps.filter((l, i) => detectLapType(l, i, n) === 'work').length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLaps]);

  const similarityScore = useCallback((r) => {
    const dur = Number(r.duration || r.elapsed_time || r.totalElapsedTime || 0);
    const laps = Array.isArray(r.laps) ? r.laps : [];
    const wlCount = laps.filter((l, i) => detectLapType(l, i, laps.length) === 'work').length;
    // Duration score: 1 = identical, 0 = completely different (>2× off)
    const durScore = currentDurSec > 0 && dur > 0
      ? Math.max(0, 1 - Math.abs(currentDurSec - dur) / Math.max(currentDurSec, dur))
      : 0.5;
    // Work-lap-count score
    const lapScore = currentWorkLapCount > 0 && wlCount > 0
      ? Math.max(0, 1 - Math.abs(currentWorkLapCount - wlCount) / Math.max(currentWorkLapCount, wlCount))
      : 0.5;
    return (durScore * 0.6 + lapScore * 0.4);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDurSec, currentWorkLapCount]);

  useEffect(() => {
    if (activeFilters.length === 0) { setResults([]); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    const params = { athleteId, sport: sport || undefined };
    const rawId = merged?.id || merged?._id || merged?.stravaId;
    if (rawId) params.excludeId = String(rawId);
    if (activeFilters.includes('title')) { const t = merged?.titleManual || merged?.title || ''; if (t.trim()) params.title = t.trim(); }
    if (activeFilters.includes('category') && merged?.category) params.category = merged.category;
    if (activeFilters.includes('lactate') && Number(merged?.lactate) > 0) params.lactate = Number(merged.lactate);
    getSimilarActivities(params)
      .then(d => {
        if (cancelled) return;
        // Sort by combined duration + work-lap similarity so the closest
        // structural matches appear first (recent date as tiebreaker).
        const sorted = [...d].sort((a, b) => {
          const sd = similarityScore(b) - similarityScore(a);
          if (Math.abs(sd) > 0.02) return sd;
          return new Date(b.date) - new Date(a.date);
        });
        setResults(sorted);
        setLoading(false);
      })
      .catch(e => { if (!cancelled) { setError(e?.message || 'Failed'); setLoading(false); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters]);

  const toggleFilter = id => setActiveFilters(p => p.includes(id) ? p.filter(f => f !== id) : [...p, id]);
  const toggleCard   = id => setExpandedCards(p => ({ ...p, [id]: !p[id] }));

  const fmtSec = s => {
    if (!s || s <= 0) return '—';
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.round(s%60);
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
  };
  const fmtDist = m => (!m || m <= 0) ? '—' : m >= 1000 ? `${(m/1000).toFixed(1)} km` : `${Math.round(m)} m`;
  const fmtDate = d => { if (!d) return '—'; const dt = new Date(d); return `${dt.getDate()}. ${dt.getMonth()+1}. ${dt.getFullYear()}`; };

  const getLapValue = (lap, b, r, s) => {
    const dur  = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
    const dist = Number(lap.distance || lap.totalDistance || 0);
    const pow  = Number(lap.average_watts || lap.avgPower || 0);
    if (b) return pow;
    if (r && dist > 0 && dur > 0) return dur / (dist / 1000);
    if (s && dist > 0 && dur > 0) return dur / (dist / 100);
    return 0;
  };

  const allValues = useMemo(() => {
    const vals = [];
    [...currentLaps, ...results.flatMap(r => r.laps || [])].forEach(l => {
      const v = getLapValue(l, isBike, isRun, isSwim);
      if (v > 0) vals.push(v);
    });
    return vals;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLaps, results, isBike, isRun, isSwim]);

  const sharedScale = useMemo(() => {
    if (allValues.length < 2) return null;
    const sorted = [...allValues].sort((a,b) => a-b);
    const q1 = sorted[Math.floor(sorted.length*0.25)];
    const q3 = sorted[Math.floor(sorted.length*0.75)];
    const iqr = q3 - q1;
    const filtered = allValues.filter(v => v >= q1-1.5*iqr && v <= q3+1.5*iqr);
    const minV = Math.min(...(filtered.length >= 2 ? filtered : allValues));
    const maxV = Math.max(...(filtered.length >= 2 ? filtered : allValues));
    const pad  = (maxV - minV || maxV*0.1) * 0.08;
    return { min: Math.max(0, minV - pad), max: maxV + pad };
  }, [allValues]);

  const sportColor = isBike ? '#767EB5' : isRun ? '#f97316' : isSwim ? '#38bdf8' : '#6b7280';

  // Build the "current training" as a session object for SessionProgressChart
  const currentSession = useMemo(() => {
    if (!merged) return null;
    return {
      ...merged,
      id: String(merged.id || merged._id || '__current'),
      laps: currentLaps,
      results: Array.isArray(merged.results) ? merged.results : [],
    };
  }, [merged, currentLaps]);

  // All sessions for the chart: current first, then compared (oldest → newest)
  const allSessions = useMemo(() => {
    const compared = [...results].sort((a, b) => new Date(a.date) - new Date(b.date));
    return currentSession ? [currentSession, ...compared] : compared;
  }, [currentSession, results]);

  // Sessions visible in the chart (excluding ones the user has closed)
  const visibleSessions = useMemo(
    () => allSessions.filter(s => !hiddenSessions.has(String(s.id || s._id || ''))),
    [allSessions, hiddenSessions]
  );

  // Build edit target data shape for TrainingForm
  const buildEditTarget = act => {
    // Map normalized laps back to TrainingForm `results` format
    const laps = Array.isArray(act.laps) ? act.laps : [];
    const actSport = String(act.sport || normSport || '').toLowerCase();
    const actIsRun  = /run/.test(actSport);
    const actIsSwim = /swim/.test(actSport);

    const results = Array.isArray(act.results) ? act.results : laps.map(l => {
      const durSec  = Number(l.elapsed_time || l.totalElapsedTime || l.duration || 0);
      const distM   = Number(l.distance || l.totalDistance || l.distanceMeters || 0);

      // For run/swim: derive pace (sec/km or sec/100m) from dist÷elapsed_dur.
      // We use elapsed_time (same value stored in durationSeconds) so the pace
      // shown in TrainingForm is always consistent with the displayed duration.
      // average_speed (Strava) uses moving_time which can differ significantly
      // for Garmin bike-computer activities with auto-pause — causing the form
      // to show e.g. 8:07/km for a lap that elapsed in 2:59 over 921m.
      // Never use average_watts for runs — Strava emits estimated power in watts
      // which TrainingForm would misinterpret as pace seconds.
      let powerValue;
      if (actIsRun || actIsSwim) {
        const unit = actIsSwim ? 100 : 1000; // sec per unit distance
        let secPerUnit = null;
        // 1. Prefer elapsed dist÷dur (consistent with durationSeconds field)
        if (distM > 0 && durSec > 0) secPerUnit = (durSec / distM) * unit;
        // 2. Fallback: from stored average_speed (m/s) when no dist/dur data
        if (!secPerUnit) {
          const spd = Number(l.average_speed || 0);
          if (spd > 0) secPerUnit = unit / spd;
        }
        if (secPerUnit && secPerUnit >= 60 && secPerUnit <= 1800) {
          const m = Math.floor(secPerUnit / 60);
          const s = Math.round(secPerUnit % 60);
          powerValue = `${m}:${String(s).padStart(2, '0')}`;
        }
      } else {
        // Bike: use watts
        const w = Number(l.average_watts || l.avgPower || 0);
        if (w > 0) powerValue = w;
      }

      return {
        intervalType: l.intervalType,
        durationSeconds: durSec,
        distanceMeters: distM || undefined,
        distance: distM || undefined,
        power: powerValue,
        heartRate: Number(l.average_heartrate || l.avgHeartRate || l.heartRate || 0) || undefined,
        lactate: l.lactate != null ? Number(l.lactate) : undefined,
      };
    });
    return {
      _id: act._id || act.id,
      sport: act.sport || normSport,
      title: act.title || act.titleManual,
      titleManual: act.titleManual || act.title,
      category: act.category,
      lactate: act.lactate,
      date: act.date,
      results,
    };
  };

  return (
    <div className="space-y-3">
      {/* TrainingForm edit modal — portaled into app-modal-root (z:99999)
          so it sits above the NativeLayout bottom tab bar */}
      {editTarget && ReactDOM.createPortal(
        <div className="fixed inset-0 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.45)', zIndex: 99999, pointerEvents: 'auto' }}>
          <TrainingFormComponent
            initialData={editTarget}
            isEditing={true}
            onClose={() => setEditTarget(null)}
            onSubmit={async (data) => {
              try {
                const id = editTarget._id;
                if (id) await api.put(`/api/users/athlete/${athleteId}/trainings/${id}`, data);
                setEditTarget(null);
                setResults(prev => prev.map(r => (String(r.id) === String(id) || String(r._id) === String(id)) ? { ...r, ...data } : r));
              } catch (e) { console.warn('save training failed', e); }
            }}
          />
        </div>,
        document.getElementById('app-modal-root') || document.body
      )}

      {/* ── Filter chips ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {hasTitle && (
          <button onClick={() => toggleFilter('title')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${activeFilters.includes('title') ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
            Same name
          </button>
        )}
        {hasCategory && (
          <button onClick={() => toggleFilter('category')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${activeFilters.includes('category') ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
            Same category
          </button>
        )}
        {hasLactate && (
          <button onClick={() => toggleFilter('lactate')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${activeFilters.includes('lactate') ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200'}`}>
            Similar lactate
          </button>
        )}
        {(currentLaps.length > 0 || results.some(r => r.laps?.length)) && (
          <button onClick={() => setWorkOnly(w => !w)}
            className={`ml-auto px-3 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-1 ${workOnly ? 'bg-[#767EB5] text-white border-[#767EB5]' : 'bg-white text-gray-500 border-gray-200'}`}>
            <BoltIcon className="w-3 h-3" />
            Work only
          </button>
        )}
      </div>

      {/* ── SessionProgressChart — all sessions overlaid ── */}
      {allSessions.length >= 2 && visibleSessions.length >= 1 && (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden shadow-sm">
          {/* Metric selector */}
          <div className="flex items-center gap-0 px-3 pt-2.5 pb-0 border-b border-gray-100">
            {[
              { id: 'power',     label: isBike ? 'Power' : 'Pace' },
              { id: 'heartRate', label: 'HR' },
              { id: 'lactate',   label: 'Lac' },
              { id: 'RPE',       label: 'RPE' },
            ].map(m => (
              <button key={m.id} onClick={() => setMetric(m.id)}
                className={`px-3 py-1.5 text-[11px] font-bold border-b-2 transition-colors -mb-px ${metric === m.id ? 'border-[#767EB5] text-[#767EB5]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                {m.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1 pr-1">
              <button onClick={() => setHideWarmCool(h => !h)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-colors ${hideWarmCool ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-400 border-gray-200'}`}>
                {hideWarmCool ? 'WU/CD off' : 'WU/CD'}
              </button>
            </div>
          </div>
          {/* Chart */}
          <div className="px-2 py-2">
            <SessionProgressChart
              sessions={visibleSessions}
              metric={metric}
              sport={normSport}
              highlightId={highlightId}
              onSessionTap={s => onOpen && onOpen(s)}
              onEditSession={s => {
                const id = String(s.id || s._id || '');
                if (id.startsWith('strava-')) { onOpen && onOpen(s); return; }
                setEditTarget(buildEditTarget(s));
              }}
              hideWarmCool={hideWarmCool}
              workOnly={workOnly}
            />
          </div>
          {/* Session legend pills */}
          <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
            {allSessions.map((s, i) => {
              const total = allSessions.length;
              const t = total <= 1 ? 1 : i / (total - 1);
              const lerp = (a, b) => Math.round(a + (b - a) * t);
              const color = `rgb(${lerp(196,109)},${lerp(181,88)},${lerp(253,217)})`;
              const sid = String(s.id || s._id || '');
              const isRef = sid === String(merged?.id || merged?._id || '__current');
              const isHidden = hiddenSessions.has(sid);
              const isHighlighted = highlightId === sid;
              const d = new Date(s.date || s.startDate || s.start_date || 0);
              const label = isRef ? 'This session' : d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: '2-digit' });
              return (
                <span key={i} className="flex items-center rounded-full border text-[10px] font-bold transition-all overflow-hidden"
                  style={{
                    borderColor: color,
                    opacity: isHidden ? 0.4 : 1,
                    background: isHighlighted && !isHidden ? color : 'transparent',
                  }}
                >
                  {/* Highlight toggle */}
                  <button
                    onClick={() => {
                      if (isHidden) return;
                      setHighlightId(h => h === sid ? null : sid);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5"
                    style={{ color: isHighlighted && !isHidden ? '#fff' : color }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isHighlighted && !isHidden ? '#fff' : color }} />
                    {label}
                  </button>
                  {/* × close button (non-reference sessions only) */}
                  {!isRef && (
                    <button
                      onClick={() => {
                        setHiddenSessions(prev => {
                          const next = new Set(prev);
                          if (next.has(sid)) next.delete(sid);
                          else next.add(sid);
                          return next;
                        });
                        // Clear highlight if hiding
                        if (!hiddenSessions.has(sid) && highlightId === sid) setHighlightId(null);
                      }}
                      className="pr-1.5 pl-0.5 py-0.5 flex items-center"
                      style={{ color: isHighlighted && !isHidden ? '#fff' : color }}
                      title={isHidden ? 'Show session' : 'Hide session'}
                    >
                      {isHidden ? (
                        // Eye-slash → show again
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        // × close
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      )}
                    </button>
                  )}
                </span>
              );
            })}
            {/* Reset hidden if any are hidden */}
            {hiddenSessions.size > 0 && (
              <button onClick={() => setHiddenSessions(new Set())}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors">
                Show all
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Work lap comparison matrix ── */}
      {!loading && !error && results.length > 0 && (
        <WorkLapCompareTable
          currentLaps={currentLaps}
          results={results}
          isBike={isBike} isRun={isRun} isSwim={isSwim}
        />
      )}

      {/* ── Loading / error / empty ── */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      )}
      {!loading && error && <div className="text-xs text-red-500 py-2">{error}</div>}
      {!loading && !error && results.length === 0 && activeFilters.length > 0 && (
        <div className="text-xs text-gray-400 py-4 text-center">No similar sessions found.</div>
      )}

      {/* ── Current activity reference card ── */}
      {currentLaps.length > 0 && (
        <div className="rounded-xl border-2 bg-white overflow-hidden" style={{ borderColor: sportColor }}>
          <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: sportColor }}>This session</span>
              <span className="text-[10px] text-gray-400">{fmtDate(merged?.start_date || merged?.startDate || merged?.date)}</span>
            </div>
            <button onClick={() => toggleCard('__current')}
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-0.5">
              {expandedCards['__current'] ? 'hide' : 'laps'}
              <ChevronDownIcon className={`w-3 h-3 transition-transform ${expandedCards['__current'] ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0 px-3 pb-1.5">
            {Number(merged?.distance || merged?.totalDistance || 0) > 0 && <span className="text-[10px] font-semibold text-gray-700">{fmtDist(Number(merged.distance || merged.totalDistance))}</span>}
            {Number(merged?.elapsed_time || merged?.totalElapsedTime || merged?.duration || 0) > 0 && <span className="text-[10px] font-semibold text-gray-700">{fmtSec(Number(merged.elapsed_time || merged.totalElapsedTime || merged.duration))}</span>}
            {Number(merged?.average_watts || merged?.avgPower || 0) > 0 && <span className="text-[10px] font-semibold text-gray-700">{Math.round(merged.average_watts || merged.avgPower)}W</span>}
            {Number(merged?.average_heartrate || merged?.avgHeartRate || 0) > 0 && <span className="text-[10px] font-semibold text-gray-700">{Math.round(merged.average_heartrate || merged.avgHeartRate)} bpm</span>}
            {Number(merged?.lactate) > 0 && <span className="text-[10px] font-bold" style={{ color:'#7c3aed' }}>{Number(merged.lactate).toFixed(1)} mmol</span>}
          </div>
          <LapChart laps={currentLaps} color={sportColor} isBike={isBike} isRun={isRun} isSwim={isSwim}
            selectedLap={null} onSelectLap={() => {}} scaleOverride={sharedScale} />
          {expandedCards['__current'] && (
            <div className="px-3 pb-3 border-t border-gray-50 pt-2">
              <CompareLapTable laps={currentLaps} isBike={isBike} isRun={isRun} isSwim={isSwim} workOnly={workOnly} />
            </div>
          )}
        </div>
      )}

      {/* ── Compared session cards ── */}
      {!loading && !error && results.map(act => {
        const actIsBike = /bike|cycling|ride/i.test(act.sport || '');
        const actIsRun  = /run/i.test(act.sport || '');
        const actIsSwim = /swim/i.test(act.sport || '');
        const actColor  = actIsBike ? '#767EB5' : actIsRun ? '#f97316' : actIsSwim ? '#38bdf8' : '#6b7280';
        const compLaps  = Array.isArray(act.laps) ? act.laps : [];
        const isExpanded = !!expandedCards[act.id];
        const isStrava  = String(act.id || '').startsWith('strava-') || act.type === 'strava';

        return (
          <div key={act.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            {/* Card header */}
            <div className="px-3 pt-2.5 pb-1 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-gray-400 tabular-nums">{fmtDate(act.date)}</span>
                  {act.category && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{act.category}</span>
                  )}
                  {act.lactate > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor:'#f5f3ff', color:'#7c3aed' }}>
                      {Number(act.lactate).toFixed(1)} mmol
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold text-gray-800 truncate mt-0.5">{act.title}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {compLaps.length > 0 && (
                  <button onClick={() => toggleCard(act.id)}
                    className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                    {isExpanded ? 'hide' : 'laps'}
                    <ChevronDownIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
                {/* Edit button — TrainingForm for regular trainings, full modal for Strava */}
                {!isStrava && (
                  <button onClick={() => setEditTarget(buildEditTarget(act))}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors">
                    <PencilIcon className="w-3 h-3" />
                    Edit
                  </button>
                )}
                {onOpen && (
                  <button onClick={() => onOpen(act)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors">
                    <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                    Open
                  </button>
                )}
              </div>
            </div>
            {/* Stats */}
            <div className="flex flex-wrap gap-x-3 gap-y-0 px-3 pb-1.5">
              {act.distance > 0 && <span className="text-[10px] font-semibold text-gray-700">{fmtDist(act.distance)}</span>}
              {act.duration > 0 && <span className="text-[10px] font-semibold text-gray-700">{fmtSec(act.duration)}</span>}
              {act.avgPower > 0 && <span className="text-[10px] font-semibold text-gray-700">{Math.round(act.avgPower)}W</span>}
              {act.avgHr   > 0 && <span className="text-[10px] font-semibold text-gray-700">{Math.round(act.avgHr)} bpm</span>}
            </div>
            {/* LapChart — shared Y-scale */}
            {compLaps.length > 0 && (
              <LapChart laps={compLaps} color={actColor} isBike={actIsBike} isRun={actIsRun} isSwim={actIsSwim}
                selectedLap={null} onSelectLap={() => {}} scaleOverride={sharedScale} />
            )}
            {compLaps.length === 0 && (
              <div className="px-3 pb-3 text-[10px] text-gray-400 italic">No laps available</div>
            )}
            {/* Expandable lap detail table */}
            {isExpanded && compLaps.length > 0 && (
              <div className="px-3 pb-3 border-t border-gray-50 pt-2">
                <CompareLapTable laps={compLaps} isBike={actIsBike} isRun={actIsRun} isSwim={actIsSwim} workOnly={workOnly} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ActivityFullModal({ activity, plannedWorkout: initialPlannedWorkout, onClose, onEditPlanned, onAddLactate, onPlannedSaved, onOpenFull = null, athleteId = null, onDeleted = null, highlightMetric: highlightMetricProp = null, radarWatts: radarWattsProp = null }) {
  const a = activity;

  // Read highlightMetric + radarWatts from props (passed by SpiderChart navigation) or URL params
  const _urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const highlightMetric = highlightMetricProp || _urlParams.get('highlightMetric') || null;
  const radarWatts = radarWattsProp != null ? radarWattsProp : (Number(_urlParams.get('radarWatts')) || null);
  const [highlightCleared, setHighlightCleared] = useState(false);
  const activeHighlight = highlightCleared ? null : highlightMetric;
  const activeRadarWatts = highlightCleared ? null : radarWatts;

  // Full detail loaded async (for laps)
  const [detail, setDetail] = useState(null);
  // Two-tap delete confirm — first tap turns the icon red and changes the
  // label to "Confirm?", second tap actually runs the delete. Reverts
  // after 4 s if the user moves on.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const stravaIdForDelete = (() => {
    const raw = String(a?.id || a?._id || '');
    if (raw.startsWith('strava-')) return raw.replace('strava-', '');
    return null; // delete only supported for Strava in this initial cut
  })();
  const handleDeleteTap = async () => {
    if (deleting || !stravaIdForDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setDeleting(true);
    try {
      const { deleteStravaActivity } = await import('../../services/api.js');
      await deleteStravaActivity(stravaIdForDelete, athleteId);
      if (onDeleted) onDeleted({ type: 'strava', id: stravaIdForDelete });
      onClose();
    } catch (e) {
      console.error('Strava activity delete failed:', e);
      // Reset confirm state on failure so user can retry.
      setConfirmDelete(false);
      // eslint-disable-next-line no-alert
      window.alert(`Failed to delete activity: ${e?.response?.data?.error || e?.message || 'unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  // Resolve sport from BOTH the summary and the freshly-loaded detail. FIT
  // uploads sometimes reach this modal with `a.sport` empty because the
  // dashboard activity-feed assembler doesn't propagate it — but the FIT
  // training document does. Without this fallback the icon shows generic
  // (bolt) and `isBike` checks fail so power/cadence columns hide.
  const sport = String(a.sport || detail?.sport || '').toLowerCase();
  const color = sportColor(sport);
  const isRun  = sport.includes('run') || sport.includes('walk') || sport.includes('hike');
  const isSwim = sport.includes('swim');
  const isBike = sport.includes('ride') || sport.includes('cycle') || sport.includes('bike') || sport === 'cycling';
  const [detailLoading, setDetailLoading] = useState(true);
  const [streams, setStreams] = useState(null);
  const [streamsRefreshing, setStreamsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Reset streams immediately so stale data from a previous activity
    // doesn't bleed into the new one while the async fetch runs.
    setStreams(null);
    const load = async () => {
      setDetailLoading(true);
      try {
        const id = String(a.id || a._id || '');
        let data = null;
        if (id.startsWith('strava-')) {
          const { getStravaActivityDetail } = await import('../../services/api.js');
          const raw = await getStravaActivityDetail(id.replace('strava-', ''), athleteId || null);
          data = { ...raw.detail, laps: raw.laps || [], description: raw.description, titleManual: raw.titleManual, category: raw.category };
          // Helper: any array regardless of whether it's {data:[...]} or a flat array
          const arrLen = a => Array.isArray(a?.data) ? a.data.length : Array.isArray(a) ? a.length : 0;
          // "chart data" = time/distance/heartrate that drives the Training Overview chart
          const chartHasData = s => s && (arrLen(s.time) > 0 || arrLen(s.distance) > 0 || arrLen(s.heartrate) > 0);

          // Always set whatever streams we received — even latlng-only gives the map its GPS track.
          if (!cancelled && raw.streams && Object.keys(raw.streams).length > 0) {
            setStreams(raw.streams);
          }

          // If the cached streams don't have chart data, background-fetch from Strava to get
          // per-second time/power/HR. This runs even if we already set latlng-only streams above.
          if (!cancelled && !chartHasData(raw.streams)) {
            setStreamsRefreshing(true);
            getStravaActivityDetail(id.replace('strava-', ''), athleteId || null, true)
              .then(r => {
                if (!cancelled && chartHasData(r.streams)) {
                  setStreams(r.streams); // upgrade to full streams including latlng
                }
              })
              .catch(e => console.warn('auto-fetch streams failed:', e))
              .finally(() => { if (!cancelled) setStreamsRefreshing(false); });
          }
        } else if (id.startsWith('fit-')) {
          const { getFitTraining } = await import('../../services/api.js');
          data = await getFitTraining(id.replace('fit-', ''));
        } else if (id.startsWith('regular-')) {
          const { getTrainingById } = await import('../../services/api.js');
          data = await getTrainingById(id.replace('regular-', ''));
        } else if (id) {
          const { getFitTraining } = await import('../../services/api.js');
          data = await getFitTraining(id);
        }
        if (!cancelled) setDetail(data);
      } catch (e) {
        console.warn('ActivityFullModal: failed to load detail', e);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [a.id, a._id, athleteId]);

  // Force-refresh Strava streams from Strava API (bypass DB cache)
  const refreshStreams = useCallback(async () => {
    const id = String(a.id || a._id || '');
    if (!id.startsWith('strava-')) return;
    setStreamsRefreshing(true);
    try {
      const { getStravaActivityDetail } = await import('../../services/api.js');
      const raw = await getStravaActivityDetail(id.replace('strava-', ''), athleteId || null, true);
      // Always upgrade streams if we got anything — preserves latlng for map
      if (raw.streams && Object.keys(raw.streams).length > 0) setStreams(raw.streams);
    } catch (e) {
      console.warn('refreshStreams failed:', e);
    } finally {
      setStreamsRefreshing(false);
    }
  }, [a.id, a._id, athleteId]);

  // Merge summary + full detail — detail wins for laps/stats, but preserve
  // the app-level `type` ('strava'|'fit'|'regular') from the original activity
  // because Strava's raw detail has type:'Run'/'Ride' which would overwrite it.
  const merged = useMemo(
    () => (detail ? { ...a, ...detail, type: a.type } : a),
    [a, detail]
  );

  // Build GPS points from streams (Strava) or FIT records
  const gpsData = useMemo(() => {
    const latlngArr = streams?.latlng?.data || streams?.latlng || [];
    if (latlngArr.length > 0) return latlngArr.filter(p => Array.isArray(p) && p[0] != null);
    const records = merged?.records || [];
    const fromRecords = records.map(r => {
      const lat = r.positionLat ?? r.position_lat ?? r.lat ?? r.latitude;
      const lng = r.positionLong ?? r.position_long ?? r.lng ?? r.longitude;
      if (lat == null || lng == null) return null;
      const lt = Math.abs(lat) > 180 ? lat / 11930464.711111111 : lat;
      const ln = Math.abs(lng) > 180 ? lng / 11930464.711111111 : lng;
      return (Math.abs(lt) <= 90 && Math.abs(ln) <= 180) ? [lt, ln] : null;
    }).filter(Boolean);
    return fromRecords;
  }, [merged, streams]);

  // Build records for TrainingChart from Strava streams (or use FIT records directly)
  // Fallback 3: synthesise a step-function time-series from laps so every
  // sport shows the Training Overview curves even without per-second streams.
  const chartTraining = useMemo(() => {
    // Priority 1 — FIT file has per-second records already
    if (merged?.records?.length > 0) return merged;

    // Priority 2 — Strava streams with time-series data
    if (streams) {
      let time = streams.time?.data || streams.time || [];

      // Apple Watch / HealthKit: no `time` key — synthesise from distance.
      if (time.length === 0) {
        const distArrRaw = streams.distance?.data || streams.distance || [];
        const totalDurSec = Number(merged?.elapsed_time || merged?.elapsedTime || merged?.movingTime || 0);
        const totalDistM  = Number(merged?.distance || 0);
        if (distArrRaw.length > 0 && totalDurSec > 0 && totalDistM > 0) {
          time = distArrRaw.map(d => Math.round((d / totalDistM) * totalDurSec));
        }
      }

      // Garmin / partial streams: no `time` and no `distance`, but heartrate exists.
      // Build a 1-second time array from activity total duration.
      if (time.length === 0) {
        const hrArr = streams.heartrate?.data || streams.heartrate || [];
        const totalDurSec = Number(merged?.elapsed_time || merged?.elapsedTime || merged?.movingTime || 0);
        if (hrArr.length > 0 && totalDurSec > 0) {
          // Distribute samples evenly across the activity duration
          const step = hrArr.length > 1 ? Math.round(totalDurSec / (hrArr.length - 1)) : 1;
          time = hrArr.map((_, k) => k * step);
        }
      }

      if (time.length > 0) {
    const watts     = streams.watts?.data || streams.watts || [];
    const heartrate = streams.heartrate?.data || streams.heartrate || [];
        let   velocity  = streams.velocity_smooth?.data || streams.velocity_smooth || [];
    const cadence   = streams.cadence?.data || streams.cadence || [];
    const altitude  = streams.altitude?.data || streams.altitude || [];
    const distArr   = streams.distance?.data || streams.distance || [];
    const startDate = merged?.start_date || merged?.startDate || merged?.date || new Date().toISOString();
    const startMs   = new Date(startDate).getTime();

        // If velocity_smooth is absent (Garmin KEY_SET fallback returned time+heartrate+
        // distance but not speed), derive it from consecutive distance+time samples.
        // Result is in m/s, matching Strava's velocity_smooth unit so the chart
        // conversion (× 3.6 in prepareTrainingChartData) will produce km/h.
        if (velocity.length === 0 && distArr.length > 0 && distArr.length === time.length) {
          velocity = new Array(time.length).fill(0);
          for (let k = 1; k < time.length; k++) {
            const dt = time[k] - time[k - 1];
            const dd = distArr[k] - distArr[k - 1];
            velocity[k] = dt > 0 ? Math.max(0, dd / dt) : 0;
          }
          velocity[0] = velocity[1] || 0; // first point = second point
        }
        // Build a lookup: for each second offset → HR from laps (used as fallback
        // when heartrate stream is missing from cached DB copy).
        let lapHrBySecond = null;
        const rawLapsForHr = Array.isArray(merged?.laps) ? merged.laps : [];
        const hasLapHr = rawLapsForHr.some(l => Number(l.average_heartrate || l.avgHeartRate || 0) > 0);
        const noStreamHr = heartrate.length === 0 || heartrate.every(v => !(v > 0));
        if (noStreamHr && hasLapHr) {
          lapHrBySecond = new Float32Array(time.length); // default 0 = no data
          let lapOffset = 0;
          rawLapsForHr.forEach(lap => {
            const dur = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
            const hr  = Number(lap.average_heartrate || lap.avgHeartRate || 0);
            if (dur > 0 && hr > 0) {
              // Find the indices in the time array that fall within this lap
              const lapStart = lapOffset;
              const lapEnd   = lapOffset + dur;
              for (let k = 0; k < time.length; k++) {
                if (time[k] >= lapStart && time[k] < lapEnd) lapHrBySecond[k] = hr;
              }
            }
            lapOffset += dur;
          });
        }

    const records = time.map((t, i) => ({
      timestamp: new Date(startMs + t * 1000).toISOString(),
          distance:  distArr[i] != null ? distArr[i] : undefined,
      power:     watts[i] > 0 ? watts[i] : null,
          heartRate: heartrate[i] > 0 ? heartrate[i]
                    : (lapHrBySecond && lapHrBySecond[i] > 0 ? lapHrBySecond[i] : null),
      speed:     velocity[i] > 0 ? velocity[i] : null,
      cadence:   cadence[i] > 0 ? cadence[i] : null,
      altitude:  altitude[i] != null ? altitude[i] : null,
    }));
        return { ...merged, records };
      }
    }

    // Priority 3 — synthesise step-function records from laps so every sport
    // (pool swim, indoor bike, manual trainings with laps) shows curves.
    const rawLaps = Array.isArray(merged?.laps) ? merged.laps : [];
    // Need at least one lap with some time-series-able data
    const usableLaps = rawLaps.filter(l => {
      const dur = Number(l.elapsed_time || l.totalElapsedTime || l.duration || 0);
      return dur > 0 && (
        Number(l.average_watts || l.avgPower || 0) > 0 ||
        Number(l.average_heartrate || l.avgHeartRate || 0) > 0 ||
        Number(l.average_speed || l.avgSpeed || 0) > 0
      );
    });
    if (usableLaps.length === 0) return null;

    const activityStart = merged?.start_date || merged?.startDate || merged?.date || new Date().toISOString();
    const actStartMs = new Date(activityStart).getTime();
    const STEP_SEC = 5; // one synthetic record every 5 s — light enough for mobile
    const records = [];
    let cumSec = 0;
    let cumDist = 0;
    let cumAlt = 0; // running altitude estimate built from per-lap elevation gain

    usableLaps.forEach(lap => {
      const durSec    = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
      const power     = Number(lap.average_watts || lap.avgPower || 0) || null;
      const hr        = Number(lap.average_heartrate || lap.avgHeartRate || 0) || null;
      const speedMs   = Number(lap.average_speed || lap.avgSpeed || 0) || null; // m/s
      const cad       = Number(lap.average_cadence || lap.avgCadence || 0) || null;
      const lapDist   = Number(lap.distance || 0);
      // total_elevation_gain is always ≥0 (Strava doesn't expose per-lap descent)
      // We linearly add it across the lap to give a rough altitude profile.
      const elevGain  = Number(lap.total_elevation_gain || lap.elevationGain || 0);
      const altStart  = cumAlt;
      const altEnd    = cumAlt + elevGain;

      for (let t = 0; t < durSec; t += STEP_SEC) {
        const fracDone = t / durSec;
        records.push({
          timestamp: new Date(actStartMs + (cumSec + t) * 1000).toISOString(),
          distance:  lapDist > 0 ? cumDist + lapDist * fracDone : undefined,
          power:     power > 0 ? power : null,
          heartRate: hr > 0 ? hr : null,
          speed:     speedMs > 0 ? speedMs : null,
          cadence:   cad > 0 ? cad : null,
          altitude:  elevGain > 0 ? altStart + elevGain * fracDone : null,
        });
      }
      cumSec  += durSec;
      cumDist += lapDist;
      cumAlt   = altEnd;
    });

    if (records.length === 0) return null;
    return { ...merged, records };
  }, [merged, streams]);

  // Detect when we're showing synthetic (lap-average step-function) data
  // instead of real per-second Strava streams so we can offer a reload button.
  const isStravaActivity = String(a.id || a._id || '').startsWith('strava-');
  // "Real" streams = has chart data (time/distance/heartrate), not just latlng from polyline fallback.
  const _arrLen = a => Array.isArray(a?.data) ? a.data.length : Array.isArray(a) ? a.length : 0;
  const hasRealStreams = isStravaActivity && streams && (
    _arrLen(streams.time) > 0 || _arrLen(streams.distance) > 0 || _arrLen(streams.heartrate) > 0
  );
  const isSyntheticData = isStravaActivity && !hasRealStreams && chartTraining !== null && !merged?.records?.length;


  // Lap selection
  const [selectedLap, setSelectedLap] = useState(null);
  const lapRowRefs = useRef([]);
  const lapChartScrollRef = useRef(null);
  const tableScrollingRef = useRef(false); // true while user is manually scrolling the table
  const tableScrollTimerRef = useRef(null);

  // ── Auto-lap: virtual laps computed from per-second records ──────────────────
  const [autoLaps, setAutoLaps] = useState(null); // null = not active; array = virtual laps
  const [autoLapLactates, setAutoLapLactates] = useState({}); // { [lapIndex]: mmol/L }
  const [autoLapLaInput, setAutoLapLaInput] = useState(null); // index of open inline input
  const [savingAutoLaps, setSavingAutoLaps] = useState(false);

  const computeAutoLaps = useCallback((records, splitMinutes = null) => {
    if (!Array.isArray(records) || records.length < 30) return;
    const recs = records.filter(r => r != null);
    if (recs.length < 30) return;

    // Raw value: power for bike, speed (m/s) for run/swim
    const getVal = (r) => {
      const pw = Number(r.power ?? r.watts ?? 0);
      if (pw > 0) return pw;
      const spd = Number(r.speed ?? r.speed_ms ?? 0);
      return spd > 0 ? spd : 0;
    };

    // Time of a record (seconds from start)
    const getTime = (r, i) => Number(r.timeFromStart ?? r.timestamp ?? i);
    const t0 = getTime(recs[0], 0);

    // ── Fixed-time split ──────────────────────────────────────────────────────
    if (splitMinutes) {
      const splitSec = splitMinutes * 60;
      const tEnd = getTime(recs[recs.length - 1], recs.length - 1) - t0;
      const numSplits = Math.ceil(tEnd / splitSec);
      if (numSplits < 2 || numSplits > 200) return;
      const buckets = Array.from({ length: numSplits }, () => []);
      recs.forEach((r, i) => {
        const bi = Math.min(numSplits - 1, Math.floor((getTime(r, i) - t0) / splitSec));
        buckets[bi].push(r);
      });
      const built = buckets.filter(b => b.length > 5).map((b, bi) => buildLapFromRecs(b, bi));
      if (built.length >= 2) { setAutoLaps(built); return; }
    }

    // ── Smart split: ON/OFF interval detection ────────────────────────────────
    // 1. Smooth with a 20-second rolling window to kill noise
    const WIN = 20;
    const vals = recs.map(getVal);
    const smoothed = vals.map((_, i) => {
      const lo = Math.max(0, i - WIN), hi = Math.min(vals.length - 1, i + WIN);
      let sum = 0, cnt = 0;
      for (let j = lo; j <= hi; j++) { if (vals[j] > 0) { sum += vals[j]; cnt++; } }
      return cnt > 0 ? sum / cnt : 0;
    });

    // 2. k-means(2) on non-zero smoothed values to find work vs rest cluster centers.
    //    Start seeds at P25 and P75 so we always split the distribution.
    const nonZero = smoothed.filter(v => v > 0).sort((a, b) => a - b);
    if (nonZero.length < 30) return;
    let c1 = nonZero[Math.floor(nonZero.length * 0.25)]; // rest center seed
    let c2 = nonZero[Math.floor(nonZero.length * 0.75)]; // work center seed
    for (let iter = 0; iter < 30; iter++) {
      let s1 = 0, n1 = 0, s2 = 0, n2 = 0;
      for (const v of nonZero) {
        if (Math.abs(v - c1) <= Math.abs(v - c2)) { s1 += v; n1++; } else { s2 += v; n2++; }
      }
      const nc1 = n1 > 0 ? s1 / n1 : c1;
      const nc2 = n2 > 0 ? s2 / n2 : c2;
      if (Math.abs(nc1 - c1) < 0.1 && Math.abs(nc2 - c2) < 0.1) break;
      c1 = nc1; c2 = nc2;
    }
    // Ensure c1 < c2 (c1 = rest, c2 = work)
    if (c1 > c2) { const tmp = c1; c1 = c2; c2 = tmp; }
    const threshold = (c1 + c2) / 2;
    const separation = c2 > 0 ? (c2 - c1) / c2 : 0;

    // 3. If the two clusters are very close (< 15% apart) the training is
    //    steady-state — fall back to 10-minute fixed splits.
    if (separation < 0.15) {
      const fallbackMin = 10;
      const splitSec = fallbackMin * 60;
      const tEnd = getTime(recs[recs.length - 1], recs.length - 1) - t0;
      const numSplits = Math.ceil(tEnd / splitSec);
      if (numSplits < 2) return;
      const buckets = Array.from({ length: numSplits }, () => []);
      recs.forEach((r, i) => {
        const bi = Math.min(numSplits - 1, Math.floor((getTime(r, i) - t0) / splitSec));
        buckets[bi].push(r);
      });
      const built = buckets.filter(b => b.length > 5).map((b, bi) => buildLapFromRecs(b, bi));
      if (built.length >= 2) setAutoLaps(built);
      return;
    }

    // 4. Binary classify each second: true = work, false = rest
    const isWork = smoothed.map(v => v >= threshold);

    // 5. Group consecutive same-state seconds into raw segments
    const rawSegs = [];
    let segWork = isWork[0], segStart = 0;
    for (let i = 1; i <= recs.length; i++) {
      const w = i < recs.length ? isWork[i] : !segWork;
      if (w !== segWork) {
        rawSegs.push({ start: segStart, end: i, isWork: segWork });
        segStart = i; segWork = w;
      }
    }

    // 6. Merge short noise segments (< 30 s) into their neighbor
    const MIN_SEG = 30;
    const merged2 = [...rawSegs];
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < merged2.length; i++) {
        if (merged2[i].end - merged2[i].start < MIN_SEG) {
          if (i > 0) {
            merged2[i - 1].end = merged2[i].end;
          } else if (i < merged2.length - 1) {
            merged2[i + 1].start = merged2[i].start;
            merged2[i + 1].isWork = merged2[i + 1].isWork;
          }
          merged2.splice(i, 1);
          changed = true;
          break;
        }
      }
    }

    if (merged2.length < 2) return;

    // 7. Build lap objects
    const built = merged2.map((seg, i) => {
      const segRecs = recs.slice(seg.start, seg.end);
      const lap = buildLapFromRecs(segRecs, i);
      lap.intervalType = seg.isWork ? 'work' : 'recovery';
      return lap;
    });
    if (built.length >= 2) setAutoLaps(built);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBike]);

  // Build a synthetic lap object from a slice of records
  function buildLapFromRecs(segRecs, index) {
    // Parse a record's time value to seconds-from-epoch (or index fallback).
    // Strava records store timestamp as ISO string → Number() = NaN, so we must
    // detect and parse ISO strings explicitly.  FIT records use numeric timeFromStart.
    const getT = (r, i) => {
      if (r.timeFromStart != null) { const v = Number(r.timeFromStart); if (!isNaN(v)) return v; }
      if (r.timestamp != null) {
        const raw = r.timestamp;
        const v = typeof raw === 'string'
          ? new Date(raw).getTime() / 1000          // ISO → unix seconds
          : Number(raw) > 1e10 ? Number(raw) / 1000 // ms  → unix seconds
          : Number(raw);                             // already seconds
        if (!isNaN(v) && v > 0) return v;
      }
      return i; // fallback: record index (assumes ~1 rec/s)
    };
    const t0 = getT(segRecs[0], 0);
    const t1 = getT(segRecs[segRecs.length - 1], segRecs.length - 1);
    const dur = Math.max(1, t1 - t0 + 1);
    // Distance: prefer cumulative distance field diff, fallback to per-record deltas
    const d0 = Number(segRecs[0].distance ?? 0);
    const d1 = Number(segRecs[segRecs.length - 1].distance ?? 0);
    const dist = d1 > d0 ? d1 - d0
      : segRecs.reduce((s, r) => s + Number(r.distance_delta ?? 0), 0);
    const pwr  = segRecs.filter(r => Number(r.power ?? r.watts ?? 0) > 0);
    const hrs  = segRecs.filter(r => Number(r.heartRate ?? r.heart_rate ?? 0) > 0);
    const spds = segRecs.filter(r => Number(r.speed ?? r.speed_ms ?? 0) > 0);
    const avg  = (arr, fn) => arr.length > 0 ? arr.reduce((s, r) => s + fn(r), 0) / arr.length : 0;
    return {
      lapNumber: index + 1,
      elapsed_time: dur,
      moving_time: dur,
      distance: Math.abs(dist),
      average_watts: Math.round(avg(pwr, r => Number(r.power ?? r.watts ?? 0))),
      average_heartrate: Math.round(avg(hrs, r => Number(r.heartRate ?? r.heart_rate ?? 0))),
      average_speed: avg(spds, r => Number(r.speed ?? r.speed_ms ?? 0)),
      _isAutoLap: true,
    };
  }

  // Mobile detection + view tabs (TrainingPeaks-style)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [mobileView, setMobileView] = useState('summary'); // 'summary' | 'laps' | 'edit'

  // Planned workout editing state
  const [plannedWorkout, setPlannedWorkout] = useState(initialPlannedWorkout || null);
  const [editingPlanned, setEditingPlanned] = useState(!initialPlannedWorkout);

  // Completed metadata edit state
  const [completedForm, setCompletedForm] = useState({ title: '', description: '', distanceKm: '', durationDisplay: '', calories: '', rpe: '', lactate: '' });
  const [savingCompleted, setSavingCompleted] = useState(false);

  // Smart duration parser: "2" → 120 min, "2:30" → 150 min, "90" → 90 min, "1:30:00" → 90 min
  const parseDurationToMinutes = (raw) => {
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (s.includes(':')) {
      const parts = s.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0);
      if (parts.length === 3) return parts[0] * 60 + (parts[1] || 0) + Math.round((parts[2] || 0) / 60);
      return null;
    }
    if (s.endsWith('h')) return parseFloat(s) * 60;
    if (s.endsWith('m')) return parseFloat(s);
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    // ≤9 plain number → hours (user typed "2" → 2 h)
    return n <= 9 ? n * 60 : n;
  };
  const formatMinutes = (mins) => {
    if (!mins) return '';
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return `${h}:${String(m).padStart(2, '0')}`;
  };

  // Smart distance parser: "10", "10 km", "4,5", "4.5 km" → km value.
  // "500m" → 0.5 km. Comma decimal handled (Czech / European keyboards).
  const parseDistanceToKm = (raw) => {
    const s = String(raw).trim().toLowerCase().replace(',', '.');
    if (!s) return null;
    if (s.endsWith('km')) return parseFloat(s);
    if (s.endsWith('m')) return parseFloat(s) / 1000;
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    // If > 500 assume metres, else km
    return n > 500 ? n / 1000 : n;
  };

  // Server PlannedWorkout.plannedDistance is documented as metres, but old
  // builds wrote km here, so we normalise on the way out: anything < 100 is
  // almost certainly the legacy km value, anything ≥ 100 is real metres.
  const planDistanceMetresToKm = (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n >= 100 ? n / 1000 : n;
  };

  const initDurMins = initialPlannedWorkout?.plannedDuration
    ? Math.round(initialPlannedWorkout.plannedDuration / 60) : null;
  // Convert stored value to km for the form (handles legacy km storage too).
  const initDistKm = planDistanceMetresToKm(initialPlannedWorkout?.plannedDistance);

  const [planForm, setPlanForm] = useState({
    title: initialPlannedWorkout?.title || '',
    description: initialPlannedWorkout?.description || '',
    durationDisplay: initDurMins ? formatMinutes(initDurMins) : '',
    durationMins: initDurMins,
    distanceDisplay: initDistKm ? String(initDistKm) : '',
    distanceKm: initDistKm,
    targetTss: initialPlannedWorkout?.targetTss ? String(initialPlannedWorkout.targetTss) : '',
    notes: initialPlannedWorkout?.notes || '',
  });
  const [savingPlan, setSavingPlan] = useState(false);

  // Compare panel (desktop)
  const [showCompareDesktop, setShowCompareDesktop] = useState(false);
  const [nestedActivity, setNestedActivity] = useState(null);

  // Escape to close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Activity data (use merged = summary + full detail) ──
  const { user: authUser } = useAuth() || {};
  const title = merged.titleManual || merged.title || merged.name || merged.originalFileName || 'Activity';
  const dur = Number(merged.duration || merged.elapsed_time || merged.movingTime || merged.moving_time || merged.totalTimerTime || merged.totalElapsedTime || merged.elapsedTime || 0);
  const dist = Number(merged.distance || merged.totalDistance || 0);
  // TSS — prefer the stored value (FIT uploads include it), fall back to
  // a client-side calculation using the user's thresholds (FTP / threshold
  // pace) so Strava activities — which never carry TSS — always show
  // something instead of being hidden.
  const explicitTss = Number(merged.tss || merged.trainingLoad || merged.totalTSS || 0);
  const tss = explicitTss > 0 ? explicitTss : computeActivityTss(merged, authUser);
  const hrTss = Number(merged.hrTSS || merged.hrTss || 0);
  // Use actual average power for `power` — don't fall through to NP, otherwise
  // np === power and the NP label is never shown (the condition below checks ≠).
  const power = Number(merged.avgPower || merged.averagePower || merged.average_watts || 0);
  const np    = Number(merged.normalizedPower || merged.weightedAveragePower || merged.weighted_average_watts || 0);
  const hr    = Number(merged.averageHeartRate || merged.average_heartrate || merged.avgHR || merged.avgHeartRate || 0);
  const maxHR = Number(merged.maxHeartRate || merged.max_heartrate || merged.maxHr || 0);
  const maxPower = Number(merged.maxPower || merged.max_watts || merged.maxWatts || 0);
  const calories = Number(merged.calories || merged.totalCalories || merged.kilojoules || 0);
  const rpe = Number(merged.rpe || merged.RPE || 0);
  const sessionLactate = merged.lactate != null ? Number(merged.lactate) : null;
  const elevation = Number(merged.totalElevationGain || merged.elevationGain || merged.total_elevation_gain || 0);
  const cadence   = Number(merged.averageCadence || merged.average_cadence || merged.avgCadence || 0);
  const avgSpeed  = Number(merged.avgSpeed || merged.averageSpeed || merged.average_speed || 0);
  const actDate   = merged.date || merged.timestamp || merged.startDate || merged.start_time;
  const dateStr   = actDate ? new Date(actDate).toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' }) : '';
  const notes = merged.description || merged.notes || '';

  const fmtDur = (s) => {
    if (!s) return '—';
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
  };
  const fmtDist = (d) => d >= 1000 ? `${(d/1000).toFixed(2)} km` : `${Math.round(d)} m`;
  let paceStr = null;
  if (isRun && avgSpeed > 0) {
    const s = 1000/avgSpeed;
    paceStr = `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')} /km`;
  } else if (isSwim && avgSpeed > 0) {
    const s = 100/avgSpeed;
    paceStr = `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')} /100m`;
  }

  // Laps
  const laps = Array.isArray(merged.laps) ? merged.laps : [];
  const fmtLapDur = (s) => {
    if (!s) return '—';
    const m = Math.floor(s/60), sec = Math.floor(s%60);
    return `${m}:${String(sec).padStart(2,'0')}`;
  };

  // Planned workout data
  const plannedDur  = plannedWorkout ? (planStepTotalSecs(plannedWorkout.steps) || plannedWorkout.plannedDuration || 0) : 0;
  const plannedTss  = plannedWorkout ? Number(plannedWorkout.targetTss || 0) : 0;
  // Treat plannedDistance as metres, but heal legacy km-stored values
  // (< 100 means it's km from the old buggy build).
  const plannedDist = plannedWorkout
    ? (() => { const n = Number(plannedWorkout.plannedDistance || 0); return n > 0 && n < 100 ? n * 1000 : n; })()
    : 0;
  // Skip duration-ratio compliance for implausibly long plans (legacy bad data
  // where '30:00' was parsed as 30 hours). The merged-card pairing covers the
  // 'completed' signal already, so we don't want a false 'Missed' here.
  const complianceRow = (plannedDur > 0 && plannedDur < 24 * 3600 && dur > 0)
    ? getCompliance(plannedDur, dur) : null;

  const handleSavePlan = async () => {
    setSavingPlan(true);
    try {
      const { createPlannedWorkout, updatePlannedWorkout } = await import('../../services/workoutPlannerApi.js');
      const dateForPlan = actDate ? new Date(actDate).toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
      const sportForPlan = isBike ? 'bike' : isRun ? 'run' : isSwim ? 'swim' : 'bike';
      const durMins = planForm.durationMins || parseDurationToMinutes(planForm.durationDisplay);
      const payload = {
        title: planForm.title || title,
        description: planForm.description,
        coachNotes: planForm.notes,
        sport: sportForPlan,
        date: dateForPlan,
        plannedDuration: durMins ? durMins * 60 : dur,
        // Server schema is metres — convert from the form's km value.
        ...(planForm.distanceKm > 0 && { plannedDistance: Math.round(planForm.distanceKm * 1000) }),
        targetTss: planForm.targetTss ? Number(planForm.targetTss) : (tss || undefined),
      };
      let saved;
      if (plannedWorkout?._id) {
        saved = await updatePlannedWorkout(plannedWorkout._id, payload, athleteId);
      } else {
        saved = await createPlannedWorkout(payload, athleteId);
      }
      setPlannedWorkout(saved);
      setEditingPlanned(false);
      if (onPlannedSaved) onPlannedSaved(saved);

      // Propagate the title change to the underlying activity (Strava / FIT / regular)
      // so it shows up in TrainingStats, FitAnalysis, calendar lists, etc.
      const newTitle = (planForm.title || '').trim();
      if (newTitle && newTitle !== title) {
        try {
          const id = String(merged.id || merged._id || '');
          // Detect source from multiple signals — bare numeric Strava ids
          // (no "strava-" prefix) used to fall through to updateTraining and
          // 500'd because they aren't valid Mongo ObjectIds.
          const isStrava = !!merged.stravaId || merged.source === 'strava' || merged.type === 'strava' || id.startsWith('strava-');
          const isFit    = merged.source === 'fit' || merged.type === 'fit' || id.startsWith('fit-') || (!!merged.timestamp && !isStrava && !merged._id);
          if (isStrava) {
            const stravaId = String(merged.stravaId || id.replace(/^strava-/, ''));
            const { updateStravaActivity } = await import('../../services/api.js');
            await updateStravaActivity(stravaId, { title: newTitle });
          } else if (isFit) {
            const fitId = String(merged._id || id.replace(/^fit-/, ''));
            const { updateFitTraining } = await import('../../services/api.js');
            await updateFitTraining(fitId, { titleManual: newTitle });
          } else if (merged._id) {
            const { updateTraining } = await import('../../services/api.js');
            await updateTraining(String(merged._id), { title: newTitle });
          }
          setDetail(prev => ({ ...(prev || {}), titleManual: newTitle, title: newTitle }));
          setCompletedForm(p => ({ ...p, title: newTitle }));
          try {
            const evtId = String(merged.id || merged._id || '');
            window.dispatchEvent(new CustomEvent('activityTitleUpdated', { detail: { id: evtId, title: newTitle } }));
          } catch { /* ignore */ }
        } catch (titleErr) {
          console.error('Failed to propagate planned title to activity', titleErr);
        }
      }
    } catch (err) {
      console.error('Failed to save planned workout', err);
    } finally {
      setSavingPlan(false);
    }
  };

  const planSteps = Array.isArray(plannedWorkout?.steps) ? plannedWorkout.steps : [];

  // ── Seed completed-metadata form once activity title/notes are known ──
  useEffect(() => {
    const distKm = dist > 0 ? (dist >= 1000 ? (dist / 1000).toFixed(2) : (dist / 1000).toFixed(3)) : '';
    const durDisplay = dur > 0 ? fmtDur(dur) : '';
    setCompletedForm({
      title: title || '',
      description: notes || '',
      distanceKm: distKm,
      durationDisplay: durDisplay,
      calories: calories > 0 ? String(Math.round(calories)) : '',
      rpe: rpe > 0 ? String(rpe) : '',
      lactate: sessionLactate != null ? String(sessionLactate) : '',
    });
  }, [title, notes, dist, dur, calories, rpe, sessionLactate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist a category change immediately (no submit button — quick tag).
  const handleCategoryChange = useCallback(async (nextCategory) => {
    try {
      const id = String(merged.id || merged._id || '');
      const value = nextCategory || null;
      // Optimistic local update so the badge re-renders right away.
      setDetail(prev => ({ ...(prev || {}), category: value }));

      // Detect the source from multiple signals — the id alone can be a bare
      // numeric Strava id (e.g. "18440432318") without the "strava-" prefix,
      // which previously fell through to updateTraining() and 500'd because
      // Mongo couldn't ObjectId-cast it.
      const isStrava = !!merged.stravaId
        || merged.source === 'strava'
        || merged.type === 'strava'
        || id.startsWith('strava-');
      const isFit = merged.source === 'fit'
        || merged.type === 'fit'
        || id.startsWith('fit-')
        || (!!merged.timestamp && !isStrava && !merged._id);

      if (isStrava) {
        const stravaId = String(merged.stravaId || id.replace(/^strava-/, ''));
        const { updateStravaActivity } = await import('../../services/api.js');
        await updateStravaActivity(stravaId, { category: value });
      } else if (isFit) {
        const fitId = String(merged._id || id.replace(/^fit-/, ''));
        const { updateFitTraining } = await import('../../services/api.js');
        await updateFitTraining(fitId, { category: value });
      } else if (merged._id) {
        const { updateTraining } = await import('../../services/api.js');
        await updateTraining(String(merged._id), { category: value });
      } else {
        return; // nothing to update
      }
      // Let TrainingPage / DashboardPage / FitAnalysisPage refresh their lists
      // so the category badge shows up in calendar cells, dropdowns, etc.
      try {
        window.dispatchEvent(new CustomEvent('activityCategoryUpdated', { detail: { id, category: value } }));
      } catch { /* ignore */ }

      // Mirror the category to the linked planned workout so the plan card
      // and the activity stay in sync. Only sync when the plan's existing
      // category differs to avoid a needless PUT on every save.
      if (plannedWorkout?._id && plannedWorkout.category !== value) {
        try {
          const { updatePlannedWorkout } = await import('../../services/workoutPlannerApi.js');
          const saved = await updatePlannedWorkout(plannedWorkout._id, { category: value }, athleteId);
          setPlannedWorkout(saved);
          if (onPlannedSaved) onPlannedSaved(saved);
        } catch (planErr) {
          console.error('Failed to mirror category to planned workout', planErr);
        }
      }
    } catch (err) {
      console.error('Failed to save category', err);
    }
  }, [merged, plannedWorkout, athleteId, onPlannedSaved]);

  const handleSaveCompleted = async () => {
    setSavingCompleted(true);
    try {
      const id = String(merged.id || merged._id || '');
      const extraFields = {};
      if (completedForm.calories !== '') extraFields.calories = Number(completedForm.calories) || 0;
      if (completedForm.rpe !== '') extraFields.rpe = Number(completedForm.rpe) || 0;
      if (completedForm.lactate !== '') extraFields.lactate = Number(completedForm.lactate) || 0;
      const basePayload = { title: completedForm.title, description: completedForm.description };
      const isStravaC = !!merged.stravaId || merged.source === 'strava' || merged.type === 'strava' || id.startsWith('strava-');
      const isFitC    = merged.source === 'fit' || merged.type === 'fit' || id.startsWith('fit-') || (!!merged.timestamp && !isStravaC && !merged._id);
      if (isStravaC) {
        const stravaId = String(merged.stravaId || id.replace(/^strava-/, ''));
        const { updateStravaActivity } = await import('../../services/api.js');
        await updateStravaActivity(stravaId, basePayload);
      } else if (isFitC) {
        const fitId = String(merged._id || id.replace(/^fit-/, ''));
        const { updateFitTraining } = await import('../../services/api.js');
        await updateFitTraining(fitId, basePayload);
      } else if (merged._id) {
        const { updateTraining } = await import('../../services/api.js');
        await updateTraining(String(merged._id), { ...basePayload, ...extraFields });
      }
      setDetail(prev => ({ ...(prev || {}), titleManual: completedForm.title, description: completedForm.description, ...extraFields }));
      try {
        window.dispatchEvent(new CustomEvent('activityTitleUpdated', { detail: { id, title: completedForm.title } }));
      } catch { /* ignore */ }

      // Mirror the title to the linked planned workout so the plan card on
      // the calendar matches the renamed activity.
      const completedTitle = (completedForm.title || '').trim();
      if (plannedWorkout?._id && completedTitle && completedTitle !== plannedWorkout.title) {
        try {
          const { updatePlannedWorkout } = await import('../../services/workoutPlannerApi.js');
          const saved = await updatePlannedWorkout(plannedWorkout._id, { title: completedTitle }, athleteId);
          setPlannedWorkout(saved);
          if (onPlannedSaved) onPlannedSaved(saved);
        } catch (planErr) {
          console.error('Failed to mirror title to planned workout', planErr);
        }
      }
    } catch (err) {
      console.error('Failed to save completed metadata', err);
    } finally {
      setSavingCompleted(false);
    }
  };

  // ── Compare tab visibility ──
  const hasCategory  = !!(merged?.category);
  const hasTitle     = !!(merged?.titleManual || (merged?.title && String(merged.title).trim()));
  const hasLactateVal = Number(merged?.lactate) > 0;
  const showCompare  = hasCategory || hasTitle || hasLactateVal;

  // ── MOBILE LAYOUT ──
  if (isMobile) {
    const hasLaps = laps.length > 0;

    const mobilePortal = ReactDOM.createPortal(
      <div className="fixed inset-0 z-[10001] bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', pointerEvents: 'auto' }}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <SportIcon sport={a.sport} className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-900 text-base truncate">{title}</div>
            <div className="text-xs text-gray-400">{dateStr}</div>
          </div>
          {detailLoading && (
            <svg className="w-4 h-4 animate-spin text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          )}
          {onAddLactate && hasLaps && (
            <button onClick={() => { onAddLactate(merged); onClose(); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 text-xs font-bold flex-shrink-0 active:opacity-70"
              style={{ borderColor: '#7c3aed', color: '#7c3aed', backgroundColor: '#f5f3ff' }}>
              <BeakerIcon className="w-4 h-4" />
              <span>Lactate</span>
            </button>
          )}
          {stravaIdForDelete && (
            <button
              onClick={handleDeleteTap}
              disabled={deleting}
              title={confirmDelete ? 'Tap again to confirm' : 'Delete activity from LaChart'}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all ${
                confirmDelete
                  ? 'bg-red-500 text-white active:bg-red-600'
                  : 'text-gray-500 hover:bg-red-50 hover:text-red-600 active:bg-red-100'
              } ${deleting ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <TrashIcon className="w-4 h-4" />
              {confirmDelete && <span>Delete?</span>}
            </button>
          )}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 active:bg-gray-200">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {[
            { id: 'summary', label: 'Summary' },
            ...(hasLaps ? [{ id: 'laps', label: 'Laps' }] : []),
            ...(showCompare ? [{ id: 'compare', label: 'Compare' }] : []),
            { id: 'edit', label: 'Edit' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setMobileView(tab.id)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${mobileView === tab.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── SUMMARY TAB ── */}
        {mobileView === 'summary' && (
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>

            {/* Stats grid — compact grouped layout */}
            <div className="px-4 pt-3 pb-3 space-y-1.5 border-b border-gray-50">

              {/* Row 1: Duration + Distance */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Duration</div>
                  <div className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{fmtDur(dur)}</div>
                </div>
                {dist > 0 && (
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Distance</div>
                    <div className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{fmtDist(dist)}</div>
                  </div>
                )}
              </div>

              {/* Power + HR on same row */}
              {(isBike && power > 0) || hr > 0 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {/* Power card (bike) */}
                  {isBike && power > 0 ? (
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Power</div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-sm font-bold text-gray-800 tabular-nums">{Math.round(power)}</span>
                          <span className="text-[10px] text-gray-400 font-semibold">W</span>
                        </div>
                        {np > 0 && (
                          <div className="flex items-baseline gap-0.5">
                            <span className="text-xs font-bold text-gray-600 tabular-nums">{Math.round(np)}</span>
                            <span className="text-[10px] text-gray-400 font-semibold">NP</span>
                          </div>
                        )}
                        {maxPower > 0 && (
                          <div className="flex items-baseline gap-0.5">
                            <span className="text-xs font-bold text-gray-500 tabular-nums">{Math.round(maxPower)}</span>
                            <span className="text-[10px] text-gray-400 font-semibold">max</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Pace card (run/swim) in left slot */
                    (paceStr || (!isBike && avgSpeed > 0)) ? (
                      <div className="rounded-xl bg-gray-50 px-3 py-2">
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Pace</div>
                        <div className="text-sm font-bold text-gray-800 tabular-nums">{paceStr}</div>
                      </div>
                    ) : <div />
                  )}
                  {/* HR card */}
                  {hr > 0 ? (
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Heart Rate</div>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <div className="flex items-baseline gap-0.5">
                          <span className="text-sm font-bold text-gray-800 tabular-nums">{Math.round(hr)}</span>
                          <span className="text-[10px] text-gray-400 font-semibold">bpm</span>
                        </div>
                        {maxHR > 0 && (
                          <div className="flex items-baseline gap-0.5">
                            <span className="text-xs font-bold text-gray-500 tabular-nums">{Math.round(maxHR)}</span>
                            <span className="text-[10px] text-gray-400 font-semibold">max</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : <div />}
                </div>
              ) : null}

              {/* Speed (bike) + TSS row */}
              {(isBike && avgSpeed > 0) || tss > 0 ? (
                <div className="grid grid-cols-2 gap-1.5">
                  {isBike && avgSpeed > 0 ? (
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Speed</div>
                      <div className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{(avgSpeed * 3.6).toFixed(1)} km/h</div>
                    </div>
                  ) : <div />}
                  {tss > 0 ? (
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">TSS</div>
                      <div className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{Math.round(tss)}</div>
                    </div>
                  ) : <div />}
                </div>
              ) : null}

              {/* Secondary metrics: Elev · Cad · Calories in 3-col */}
              {(elevation > 0 || cadence > 0 || calories > 0) && (
                <div className={`grid gap-1.5 ${[elevation > 0, cadence > 0, calories > 0].filter(Boolean).length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {elevation > 0 && (
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Elev</div>
                      <div className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{Math.round(elevation)}m</div>
                    </div>
                  )}
                  {cadence > 0 && (
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{isSwim ? 'SPM' : 'Cad'}</div>
                      <div className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{Math.round(cadence)}</div>
                    </div>
                  )}
                  {calories > 0 && (
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Cal</div>
                      <div className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{Math.round(calories)} kcal</div>
                    </div>
                  )}
                </div>
              )}

              {/* RPE + Lactate */}
              {(rpe > 0 || sessionLactate != null) && (
                <div className="grid grid-cols-2 gap-1.5">
                  {rpe > 0 && (
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">RPE</div>
                      <div className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{rpe} / 10</div>
                    </div>
                  )}
                  {sessionLactate != null && (
                    <div className="rounded-xl bg-gray-50 px-3 py-2">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Lactate</div>
                      <div className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{sessionLactate.toFixed(1)} mmol</div>
                    </div>
                  )}
                </div>
              )}

              {/* Compliance badge */}
              {complianceRow && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: complianceRow.color }} />
                  <span className="text-sm font-bold" style={{ color: complianceRow.color }}>{complianceRow.label}</span>
                </div>
              )}

              {/* Category */}
              <div className="flex items-center gap-2 px-1 pt-0.5">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Category</span>
                <CategoryPicker value={merged.category || null} onChange={handleCategoryChange} />
              </div>
            </div>

            {/* Route Map */}
            {gpsData.length > 0 && (
              <div className="border-b border-gray-50">
                <div className="relative overflow-hidden" style={{ height: 260 }}>
                  <MapContainer
                    key={`modal-map-${gpsData[0]?.[0]}-${gpsData[0]?.[1]}`}
                    center={gpsData[Math.floor(gpsData.length / 2)]}
                    zoom={12}
                    style={{ height: '100%', width: '100%', zIndex: 0 }}
                    scrollWheelZoom={false}
                    zoomControl={true}
                    attributionControl={false}
                  >
                    <MapInvalidator />
                    <FitBoundsToRoute positions={gpsData} />
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                    <Polyline positions={gpsData} pathOptions={{ color, weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
                    <CircleMarker center={gpsData[0]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }}>
                      <LeafletTooltip permanent direction="top" offset={[0, -10]}>Start</LeafletTooltip>
                    </CircleMarker>
                    <CircleMarker center={gpsData[gpsData.length - 1]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }}>
                      <LeafletTooltip permanent direction="top" offset={[0, -10]}>Finish</LeafletTooltip>
                    </CircleMarker>
                  </MapContainer>
                </div>
              </div>
            )}

            {/* Training Overview — always shown:
                • loading → skeleton pulse
                • loaded + records → full TrainingChart (time-series)
                • loaded + no records but has laps → LapChart bar overview */}
            {detailLoading ? (
              <div className="px-4 py-3 border-b border-gray-50">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Training Overview</div>
                <div className="rounded-xl bg-gray-100 animate-pulse" style={{ height: 120 }} />
              </div>
            ) : chartTraining?.records?.length > 0 ? (
              <div className="px-4 py-3 border-b border-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Training Overview</div>
                  {isSyntheticData && (
                    <button
                      onClick={refreshStreams}
                      disabled={streamsRefreshing}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-60"
                    >
                      <svg className={`w-3 h-3 ${streamsRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      {streamsRefreshing ? 'Loading streams…' : 'Reload streams'}
                    </button>
                  )}
                </div>
                {activeHighlight && (
                  <div className="mb-2 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-1.5 text-xs text-indigo-800">
                    <span>
                      <span className="font-semibold">Power Radar highlight</span>
                      {activeRadarWatts > 0 && (
                        <span className="ml-1.5">
                          — Best {activeHighlight === 'sprint5s' ? '5s' : activeHighlight === 'attack1min' ? '1min' : activeHighlight === 'vo2max5min' ? '5min' : activeHighlight === 'threshold20min' ? '20min' : '60min'}: <span className="font-bold">{activeRadarWatts} W</span>
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => {
                        setHighlightCleared(true);
                        const url = new URL(window.location);
                        url.searchParams.delete('highlightMetric');
                        url.searchParams.delete('radarWatts');
                        window.history.replaceState({}, '', url.toString());
                      }}
                      className="ml-3 text-[10px] font-medium text-indigo-600 hover:text-indigo-900 underline underline-offset-2"
                    >
                      Clear
                    </button>
                  </div>
                )}
                <TrainingChart
                  training={chartTraining}
                  user={null}
                  userProfile={null}
                  onHover={() => {}}
                  onLeave={() => {}}
                  highlightMetric={activeHighlight}
                  radarWatts={activeRadarWatts}
                />
              </div>
            ) : laps.length > 0 ? (
              <div className="px-4 py-3 border-b border-gray-50">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Training Overview</div>
                <LapChart
                  laps={laps}
                  color={color}
                  isBike={isBike}
                  isRun={isRun}
                  isSwim={isSwim}
                  selectedLap={null}
                  onSelectLap={() => {}}
                  chartScrollRef={{ current: null }}
                  onScrollCenter={() => {}}
                  records={chartTraining?.records}
                />
              </div>
            ) : null}

            {/* Description / notes */}
            {(notes || plannedWorkout?.description || plannedWorkout?.notes) && (
              <div className="px-4 py-3 space-y-2 border-b border-gray-50">
                {notes && (
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</div>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{notes}</p>
                  </div>
                )}
                {plannedWorkout?.description && (
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Planned description</div>
                    <p className="text-sm text-gray-600 whitespace-pre-line">{plannedWorkout.description}</p>
                  </div>
                )}
                {plannedWorkout?.notes && (
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Coach notes</div>
                    <p className="text-sm text-gray-600 whitespace-pre-line">{plannedWorkout.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Comments */}
            <div className="px-4 py-4 border-b border-gray-100">
              <TrainingComments trainingId={String(a.id || a._id || '')} isMobile={true} />
            </div>

            {/* Planned section */}
            <div className="px-4 py-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Planned</span>
                <div className="flex gap-2">
                  {plannedWorkout && !editingPlanned && (
                    <button onClick={() => setEditingPlanned(true)}
                      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-500 active:bg-gray-50">
                      <PencilIcon className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
              </div>

              {editingPlanned ? (
                <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <div className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase">Title</div>
                  <input type="text" value={planForm.title} onChange={e => setPlanForm(p => ({ ...p, title: e.target.value }))} placeholder={title}
                    className="col-span-2 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Duration</div>
                    <input type="text" value={planForm.durationDisplay}
                      onChange={e => setPlanForm(p => ({ ...p, durationDisplay: e.target.value, durationMins: null }))}
                      onBlur={() => { const mins = parseDurationToMinutes(planForm.durationDisplay); if (mins != null && mins > 0) setPlanForm(p => ({ ...p, durationMins: mins, durationDisplay: formatMinutes(mins) })); }}
                      placeholder="1:30" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2" />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Distance</div>
                    <input type="text" value={planForm.distanceDisplay}
                      onChange={e => setPlanForm(p => ({ ...p, distanceDisplay: e.target.value, distanceKm: null }))}
                      onBlur={() => { const km = parseDistanceToKm(planForm.distanceDisplay); if (km != null && km > 0) setPlanForm(p => ({ ...p, distanceKm: km, distanceDisplay: `${km % 1 === 0 ? km : km.toFixed(2)} km` })); }}
                      placeholder="10 km" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2" />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">TSS</div>
                    <input type="number" value={planForm.targetTss} onChange={e => setPlanForm(p => ({ ...p, targetTss: e.target.value }))} placeholder=""
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2" min="0" />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Description</div>
                  <textarea value={planForm.description} onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))} rows={2}
                    placeholder="Workout description…" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2" />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Coach notes</div>
                  <textarea value={planForm.notes} onChange={e => setPlanForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                    placeholder="Coach notes, instructions…" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2" />
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <div className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase">Completed notes</div>
                  <input type="text" value={completedForm.title} onChange={e => setCompletedForm(p => ({ ...p, title: e.target.value }))} placeholder="Activity title"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2" />
                  <textarea value={completedForm.description} onChange={e => setCompletedForm(p => ({ ...p, description: e.target.value }))} rows={2}
                    placeholder="How did it go?" className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2" />
                </div>
                <div className="flex gap-2 pt-1">
                  {plannedWorkout && (
                    <button onClick={() => setEditingPlanned(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 active:bg-gray-50">Cancel</button>
                  )}
                  <button onClick={async () => { await Promise.all([handleSavePlan(), handleSaveCompleted()]); setEditingPlanned(false); }}
                    disabled={savingPlan || savingCompleted}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: color }}>
                    {(savingPlan || savingCompleted) ? 'Saving…' : plannedWorkout ? 'Save' : 'Add Planned'}
                  </button>
                </div>
              </div>
            ) : (
              plannedWorkout ? (
                <div className="rounded-xl bg-gray-50 p-3 space-y-2">
                  {plannedWorkout?.title && <div className="font-semibold text-sm text-gray-800">{plannedWorkout.title}</div>}
                  <div className="flex flex-wrap gap-3">
                    {plannedDur > 0 && <div><div className="text-[9px] font-bold text-gray-400 uppercase">Duration</div><div className="text-sm font-bold text-gray-800">{fmtDur(plannedDur)}</div></div>}
                    {plannedTss > 0 && <div><div className="text-[9px] font-bold text-gray-400 uppercase">TSS</div><div className="text-sm font-bold text-gray-800">{plannedTss}</div></div>}
                    {plannedDist > 0 && <div><div className="text-[9px] font-bold text-gray-400 uppercase">Distance</div><div className="text-sm font-bold text-gray-800">{fmtDist(plannedDist)}</div></div>}
                  </div>
                </div>
              ) : (
                <button onClick={() => setEditingPlanned(true)}
                  className="w-full text-sm font-semibold px-4 py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-400 active:bg-gray-50">
                  + Add planned workout
                </button>
              )
            )}
          </div>

          {/* Lactate footer — only shown when no laps tab (button moves to header when laps exist) */}
          {onAddLactate && !hasLaps && (
            <div className="px-4 pb-6">
              <button onClick={() => { onAddLactate(merged); onClose(); }}
                className="w-full py-3 rounded-xl text-sm font-semibold border-2"
                style={{ borderColor: '#7c3aed', color: '#7c3aed', backgroundColor: '#f5f3ff' }}>
                + Lactate
              </button>
            </div>
          )}

          </div>
        )}

        {/* ── LAPS TAB ── */}
        {mobileView === 'laps' && hasLaps && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Auto-lap bar — show only when records are available */}
            {chartTraining?.records?.length > 30 && (
              <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/80">
                {autoLaps ? (
                  <>
                    <span className="text-[10px] font-bold text-primary">{autoLaps.length} auto laps</span>
                    <div className="flex gap-1.5 ml-auto items-center">
                      <button
                        onClick={() => { setSelectedLap(null); setAutoLapLactates({}); computeAutoLaps(chartTraining.records, null); }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-primary/40 bg-primary/5 text-primary active:bg-primary/10 flex items-center gap-1">
                        <BoltIcon className="w-3 h-3" />Smart
                      </button>
                      {Object.keys(autoLapLactates).length > 0 && (
                        <button
                          disabled={savingAutoLaps}
                          onClick={async () => {
                            setSavingAutoLaps(true);
                            try {
                              const { createFieldLactateMeasurement } = await import('../../services/api.js');
                              const trainingDate = merged?.date || merged?.startDate || new Date().toISOString();
                              const trainingTitle = merged?.titleManual || merged?.title || 'Activity';
                              const stravaId = merged?.type === 'strava' ? String(merged?.id ?? merged?.stravaId ?? '') : null;
                              const trainingId = merged?.type === 'training' ? (merged?._id ? String(merged._id) : null) : null;
                              await Promise.all(
                                Object.entries(autoLapLactates).map(([idxStr, val]) => {
                                  const idx = Number(idxStr);
                                  return createFieldLactateMeasurement({
                                    value: Number(val),
                                    recordedAt: trainingDate,
                                    notes: `Auto lap ${idx + 1}`,
                                    athleteId: athleteId || undefined,
                                    status: 'assigned',
                                    assignment: {
                                      stravaActivityId: stravaId || undefined,
                                      trainingId: trainingId || undefined,
                                      lapIndex: idx,
                                      lapNumber: idx + 1,
                                      trainingTitle,
                                      trainingDate: new Date(trainingDate).toISOString(),
                                    },
                                  });
                                })
                              );
                              // Mark saved: move lactate values into the autoLaps objects so they display
                              setAutoLaps(prev => prev.map((l, i) =>
                                autoLapLactates[i] != null ? { ...l, lactate: autoLapLactates[i] } : l
                              ));
                              setAutoLapLactates({});
                            } catch (e) {
                              console.error('Save auto-lap lactate failed:', e);
                            } finally {
                              setSavingAutoLaps(false);
                            }
                          }}
                          className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-600 text-white active:bg-violet-700 disabled:opacity-50 touch-manipulation"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          {savingAutoLaps ? 'Saving…' : `Save ${Object.keys(autoLapLactates).length} La`}
                        </button>
                      )}
                      <button
                        onClick={() => { setAutoLaps(null); setSelectedLap(null); setAutoLapLactates({}); setAutoLapLaInput(null); }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-gray-200 bg-white text-gray-400 active:bg-gray-100 flex items-center gap-0.5">
                        <XMarkIcon className="w-3 h-3" />Reset
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-[10px] text-gray-400">Auto laps:</span>
                    <button
                      onClick={() => { setSelectedLap(null); computeAutoLaps(chartTraining.records, null); }}
                      className="px-3 py-1 rounded-full text-[11px] font-bold border border-primary/40 bg-primary/5 text-primary active:bg-primary/10 flex items-center gap-1 touch-manipulation"
                      style={{ WebkitTapHighlightColor: 'transparent' }}>
                      <BoltIcon className="w-3.5 h-3.5" />Smart detect
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* LapChart — sticky at top */}
            <div className="flex-shrink-0 border-b border-gray-100">
              <LapChart laps={autoLaps ?? laps} color={color} isBike={isBike} isRun={isRun} isSwim={isSwim}
                selectedLap={selectedLap}
                chartScrollRef={lapChartScrollRef}
                records={chartTraining?.records}
                onSelectLap={(i) => {
                  setSelectedLap(i);
                  lapRowRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }}
                onScrollCenter={(i) => {
                  setSelectedLap(i);
                  if (!tableScrollingRef.current) {
                    lapRowRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }
                }}
              />
            </div>
            {/* Laps table — scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}
              onScroll={() => {
                // Mark that user is scrolling the table so chart settle doesn't fight back
                tableScrollingRef.current = true;
                clearTimeout(tableScrollTimerRef.current);
                tableScrollTimerRef.current = setTimeout(() => { tableScrollingRef.current = false; }, 400);
              }}
            >
              <div className="px-4 py-3">
                {(() => {
                  const displayLaps = autoLaps ?? laps;
                  const hasLactate = displayLaps.some(l => (l.lactate ?? l.lactateValue) != null)
                    || Object.keys(autoLapLactates).length > 0;
                  const showLactate = hasLactate || !!onAddLactate || !!autoLaps;
                  const hasPower = isBike && displayLaps.some(l => Number(l.average_watts || l.avgPower || l.avg_power || 0) > 0);
                  const showSwimPace = isSwim && displayLaps.some(l => Number(l.distance || 0) > 0);
                  const hasPace = (isRun || showSwimPace) && displayLaps.some(l => Number(l.distance || 0) > 0 && (l.elapsed_time || l.totalElapsedTime || l.duration || 0) > 0);
                  const hasCadence = displayLaps.some(l => Number(l.average_cadence || l.avgCadence || l.avg_cadence || 0) > 0);
                  const colTokens = ['1.5rem', '1fr', '1fr'];
                  if (hasPower || hasPace) colTokens.push('1fr');
                  colTokens.push('1fr');
                  if (hasCadence) colTokens.push('1fr');
                  if (showLactate) colTokens.push('1fr');
                  const cols = colTokens.join(' ');
                  const paceHeader = isBike ? 'Pwr' : isSwim ? '/100m' : 'Pace';
                  return (
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="grid text-[11px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 px-3 py-2 border-b border-gray-100"
                        style={{ gridTemplateColumns: cols }}>
                        <span>#</span>
                        <span className="text-right">Time</span>
                        <span className="text-right">Dist</span>
                        {(hasPower || hasPace) && <span className="text-right">{paceHeader}</span>}
                        <span className="text-right">HR</span>
                        {hasCadence && <span className="text-right">{isSwim ? 'SPM' : 'Cad'}</span>}
                        {showLactate && <span className="text-right">La</span>}
                      </div>
                      <div className="divide-y divide-gray-50">
                        {displayLaps.map((lap, i) => {
                          const lapElapsed = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
                          const lapMoving  = Number(lap.moving_time || lap.movingTime || lap.totalMovingTime || 0) || lapElapsed;
                          const lapDur = lapElapsed; // used for display (time column)
                          const lapDist = Number(lap.distance || lap.totalDistance || 0);
                          const lapSpeed = lap.average_speed || lap.avgSpeed || lap.avg_speed || null;
                          const lapHr = Number(lap.average_heartrate || lap.avgHeartRate || lap.averageHeartRate || lap.avgHR || 0);
                          const lapPower = Number(lap.average_watts || lap.avgPower || lap.avg_power || 0);
                          const lapCad = Number(lap.average_cadence || lap.avgCadence || lap.avg_cadence || 0);
                          const lapLa = lap.lactate ?? lap.lactateValue;
                          const lapNum = lap.lapNumber ?? (i + 1);
                          // Detect lap type for color-coding
                          const lapType = detectLapType(lap, i, displayLaps.length);
                          const isRestLap = lapType === 'recovery' || lapType === 'rest';
                          // Pace — use moving time to exclude stopped time; suppress crazy values
                          let lapPaceStr = '—';
                          let paceIsNormal = true;
                          if (isSwim) {
                            const spd = lapSpeed || (lapDist > 0 && lapMoving > 0 ? lapDist / lapMoving : 0);
                            if (spd > 0) { const s = Math.round(100 / spd); lapPaceStr = s < 60 ? `${s}s` : `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
                          } else if (isRun && lapDist > 0 && lapMoving > 0) {
                            const spk = lapMoving / (lapDist / 1000);
                            lapPaceStr = `${Math.floor(spk/60)}:${String(Math.round(spk%60)).padStart(2,'0')}`;
                            // Show pace for rest/walk laps too, just style it gray
                            if (isRestLap && spk > 480) paceIsNormal = false;
                          } else if (isBike) {
                            lapPaceStr = lapPower > 0 ? `${Math.round(lapPower)}W` : '—';
                          }
                          const isSelected = selectedLap === i;
                          // Type-based row styling
                          const typeDot  = COMPARE_STEP_COLORS[lapType] || '#9ca3af';
                          const typeRowBg = isSelected ? '#EFF6FF'
                            : lapType === 'warmup'   ? '#fffbeb'
                            : lapType === 'cooldown' ? '#f0f9ff'
                            : lapType === 'recovery' || lapType === 'rest' ? '#f9fafb'
                            : undefined; // work = default white
                          const paceColor = isSelected ? '#2563EB'
                            : !paceIsNormal ? '#9ca3af'
                            : isRestLap ? '#9ca3af'
                            : lapType === 'warmup' ? '#d97706'
                            : lapType === 'cooldown' ? '#0284c7'
                            : '#2563EB'; // work = blue
                          return (
                            <div key={i} ref={el => lapRowRefs.current[i] = el}
                              onClick={() => setSelectedLap(isSelected ? null : i)}
                              className="grid items-center px-3 py-3 text-[13px] cursor-pointer"
                              style={{ gridTemplateColumns: cols, backgroundColor: typeRowBg, borderLeft: `3px solid ${isSelected ? '#2563EB' : typeDot}` }}>
                              <span className="font-bold" style={{ color: isSelected ? '#2563EB' : typeDot }}>{lapNum}</span>
                              <span className="text-right tabular-nums font-semibold text-gray-700">{fmtLapDur(lapDur)}</span>
                              <span className="text-right tabular-nums text-gray-500">{lapDist > 0 ? (lapDist >= 1000 ? `${(lapDist/1000).toFixed(1)}km` : `${Math.round(lapDist)}m`) : '—'}</span>
                              {(hasPower || hasPace) && <span className="text-right tabular-nums font-semibold" style={{ color: paceColor }}>{lapPaceStr}</span>}
                              <span className="text-right tabular-nums text-gray-500">{lapHr > 0 ? Math.round(lapHr) : '—'}</span>
                              {hasCadence && <span className="text-right tabular-nums text-gray-500">{lapCad > 0 ? Math.round(lapCad) : '—'}</span>}
                              {showLactate && (() => {
                                // Auto-lap: show inline input when active, saved value when set
                                if (autoLaps) {
                                  const savedInLap = lapLa != null ? Number(lapLa) : null;
                                  const pendingVal = autoLapLactates[i];
                                  const displayVal = savedInLap ?? pendingVal;
                                  if (autoLapLaInput === i) {
                                    return (
                                      <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                                        <input
                                          autoFocus
                                          type="number"
                                          step="0.1"
                                          min="0.1"
                                          max="30"
                                          placeholder="0.0"
                                          defaultValue={displayVal ?? ''}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              const v = parseFloat(e.target.value);
                                              if (!isNaN(v) && v > 0) setAutoLapLactates(p => ({ ...p, [i]: v }));
                                              else setAutoLapLactates(p => { const n = { ...p }; delete n[i]; return n; });
                                              setAutoLapLaInput(null);
                                            }
                                            if (e.key === 'Escape') setAutoLapLaInput(null);
                                          }}
                                          onBlur={e => {
                                            const v = parseFloat(e.target.value);
                                            if (!isNaN(v) && v > 0) setAutoLapLactates(p => ({ ...p, [i]: v }));
                                            else setAutoLapLactates(p => { const n = { ...p }; delete n[i]; return n; });
                                            setAutoLapLaInput(null);
                                          }}
                                          className="w-12 text-center text-[11px] font-bold rounded-lg border border-violet-300 bg-violet-50 px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                                          style={{ color: '#7c3aed' }}
                                        />
                                      </div>
                                    );
                                  }
                                  if (displayVal != null) {
                                    return (
                                      <button
                                        onClick={e => { e.stopPropagation(); setAutoLapLaInput(i); }}
                                        className="text-right tabular-nums font-semibold w-full touch-manipulation"
                                        style={{ color: '#7c3aed', WebkitTapHighlightColor: 'transparent' }}>
                                        {Number(displayVal).toFixed(1)}
                                      </button>
                                    );
                                  }
                                  return (
                                    <button
                                      onClick={e => { e.stopPropagation(); setAutoLapLaInput(i); }}
                                      className="flex items-center justify-center w-6 h-6 rounded-full ml-auto active:opacity-60 touch-manipulation"
                                      style={{ backgroundColor: '#f5f3ff', color: '#7c3aed', WebkitTapHighlightColor: 'transparent' }}>
                                      <span className="text-sm font-bold leading-none">+</span>
                                    </button>
                                  );
                                }
                                // Normal laps
                                if (lapLa != null) {
                                  return <span className="text-right tabular-nums font-semibold" style={{ color: '#7c3aed' }}>{Number(lapLa).toFixed(1)}</span>;
                                }
                                if (onAddLactate) {
                                  return (
                                  <button onClick={e => { e.stopPropagation(); onAddLactate(merged, i); onClose(); }}
                                    className="flex items-center justify-center w-6 h-6 rounded-full ml-auto active:opacity-60 touch-manipulation"
                                    style={{ backgroundColor: '#f5f3ff', color: '#7c3aed', WebkitTapHighlightColor: 'transparent' }}>
                                    <span className="text-sm font-bold leading-none">+</span>
                                  </button>
                                  );
                                }
                                return <span className="text-right tabular-nums text-gray-400">—</span>;
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ── COMPARE TAB ── */}
        {mobileView === 'compare' && showCompare && (
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="px-4 py-4">
              <CompareContent merged={merged} athleteId={athleteId} onOpen={act => setNestedActivity(act)} />
            </div>
          </div>
        )}

        {/* ── EDIT TAB ── */}
        {mobileView === 'edit' && (
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="px-4 py-4 space-y-4">
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Title</div>
                <input type="text" value={completedForm.title}
                  onChange={e => setCompletedForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Activity title"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</div>
                <textarea value={completedForm.description}
                  onChange={e => setCompletedForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="How did it go?"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Distance (km)</div>
                  <input type="number" inputMode="decimal" value={completedForm.distanceKm}
                    onChange={e => setCompletedForm(p => ({ ...p, distanceKm: e.target.value }))}
                    placeholder="e.g. 10.5"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Duration</div>
                  <input type="text" value={completedForm.durationDisplay}
                    onChange={e => setCompletedForm(p => ({ ...p, durationDisplay: e.target.value }))}
                    placeholder="1:30:00"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Calories (kcal)</div>
                  <input type="number" inputMode="numeric" value={completedForm.calories}
                    onChange={e => setCompletedForm(p => ({ ...p, calories: e.target.value }))}
                    placeholder="e.g. 800"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">RPE (1–10)</div>
                  <input type="number" inputMode="numeric" value={completedForm.rpe}
                    onChange={e => setCompletedForm(p => ({ ...p, rpe: e.target.value }))}
                    placeholder="e.g. 7" min="1" max="10"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1" style={{ color: '#7c3aed' }}>Lactate (mmol/L)</div>
                  <input type="number" inputMode="decimal" value={completedForm.lactate}
                    onChange={e => setCompletedForm(p => ({ ...p, lactate: e.target.value }))}
                    placeholder="e.g. 2.4" step="0.1"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': '#7c3aed' }} />
                </div>
              </div>
              <button
                onClick={async () => { await handleSaveCompleted(); setMobileView('summary'); }}
                disabled={savingCompleted}
                className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: color }}>
                {savingCompleted ? 'Saving…' : 'Save Activity'}
              </button>
            </div>
          </div>
        )}

      </div>,
      document.getElementById('app-modal-root') || document.body
    );
    return <>
      {mobilePortal}
      {nestedActivity && (() => {
        const na = nestedActivity;
        const fakeActivity = {
          id: na.id, _id: na.id, type: na.type,
          sport: na.sport || merged?.sport, date: na.date,
          title: na.title, titleManual: na.title,
          category: na.category, lactate: na.lactate,
          distance: na.distance, elapsed_time: na.duration,
          average_heartrate: na.avgHr, average_watts: na.avgPower,
          laps: na.laps || [],
        };
        return <ActivityFullModal activity={fakeActivity} athleteId={athleteId} onClose={() => setNestedActivity(null)} />;
      })()}
    </>;
  }

  const desktopPortal = ReactDOM.createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ pointerEvents: 'auto' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <SportIcon sport={a.sport} className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-900 text-base truncate">{title}</div>
            <div className="text-xs text-gray-400">{dateStr}</div>
          </div>
          {detailLoading && (
            <svg className="w-4 h-4 animate-spin text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          )}
          {onAddLactate && laps.length > 0 && (
            <button onClick={() => { onAddLactate(merged); onClose(); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-2 text-xs font-bold flex-shrink-0 hover:opacity-80 transition-opacity"
              style={{ borderColor: '#7c3aed', color: '#7c3aed', backgroundColor: '#f5f3ff' }}>
              <BeakerIcon className="w-4 h-4" />
              <span>Lactate</span>
            </button>
          )}
          {onOpenFull && (
            <button onClick={onOpenFull} title="Open full activity" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
              <ArrowTopRightOnSquareIcon className="w-5 h-5" />
            </button>
          )}
          {stravaIdForDelete && (
            <button
              onClick={handleDeleteTap}
              disabled={deleting}
              title={confirmDelete ? 'Tap again to confirm' : 'Delete activity from LaChart'}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all ${
                confirmDelete
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'text-gray-400 hover:bg-red-50 hover:text-red-600'
              } ${deleting ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <TrashIcon className="w-4 h-4" />
              {confirmDelete && <span>Delete?</span>}
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body — single scrollable column.
            We deliberately keep the body as the direct sticky parent for the
            LapChart (no extra <div> wrapper) — otherwise the chart unsticks
            as soon as you scroll past the wrapper's bottom, and the user can
            no longer see which lap is selected while skimming the laps table.
            WebkitOverflowScrolling/overscrollBehavior enable iOS native
            momentum scroll and prevent the lap-chart horizontal scroller
            from hijacking vertical touch events on mobile. */}
        <div
          className="flex-1 min-h-0 overflow-y-auto"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}
        >

          {/* ── Stats row — compact grouped ── */}
          <div className="px-5 pt-3 pb-3 flex flex-wrap gap-1.5 items-start border-b border-gray-50">
            {/* Duration */}
            <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">Duration</span>
              <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{fmtDur(dur)}</span>
              </div>
            {/* Distance */}
            {dist > 0 && (
              <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">Distance</span>
                <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{fmtDist(dist)}</span>
              </div>
            )}
            {/* TSS */}
            <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">TSS</span>
              <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{tss > 0 ? Math.round(tss) : '—'}</span>
            </div>
            {hrTss > 0 && hrTss !== tss && (
              <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">hrTSS</span>
                <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{Math.round(hrTss)}</span>
              </div>
            )}
            {/* Pace/Speed */}
            {paceStr && (
              <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">Pace</span>
                <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{paceStr}</span>
              </div>
            )}
            {isBike && avgSpeed > 0 && (
              <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">Speed</span>
                <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{(avgSpeed * 3.6).toFixed(1)} km/h</span>
              </div>
            )}
            {/* Power group — avg + NP + max in one pill */}
            {isBike && power > 0 && (
              <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none mb-1">Power</span>
                <div className="flex items-baseline gap-3">
                  <span className="text-sm font-bold text-gray-800 tabular-nums">{Math.round(power)}<span className="text-[10px] font-semibold text-gray-400 ml-0.5">W avg</span></span>
                  {np > 0 && np !== power && <span className="text-sm font-bold text-gray-600 tabular-nums">{Math.round(np)}<span className="text-[10px] font-semibold text-gray-400 ml-0.5">NP</span></span>}
                  {maxPower > 0 && <span className="text-sm font-bold text-gray-600 tabular-nums">{Math.round(maxPower)}<span className="text-[10px] font-semibold text-gray-400 ml-0.5">max</span></span>}
                </div>
              </div>
            )}
            {/* HR group — avg + max in one pill */}
            {hr > 0 && (
              <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none mb-1">HR</span>
                <div className="flex items-baseline gap-3">
                  <span className="text-sm font-bold text-gray-800 tabular-nums">{Math.round(hr)}<span className="text-[10px] font-semibold text-gray-400 ml-0.5">avg</span></span>
                  {maxHR > 0 && <span className="text-sm font-bold text-gray-600 tabular-nums">{Math.round(maxHR)}<span className="text-[10px] font-semibold text-gray-400 ml-0.5">max</span></span>}
                </div>
              </div>
            )}
            {/* Elev / Cad */}
            {elevation > 0 && (
              <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">Elev</span>
                <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{Math.round(elevation)}m</span>
              </div>
            )}
            {cadence > 0 && (
              <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">{isSwim ? 'SPM' : 'Cad'}</span>
                <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{Math.round(cadence)}</span>
              </div>
            )}
            {/* Category picker + Compliance badge */}
            <div className="ml-auto flex items-center gap-2">
              <CategoryPicker value={merged.category || null} onChange={handleCategoryChange} />
              {complianceRow && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: complianceRow.color }} />
                  <span className="text-xs font-bold" style={{ color: complianceRow.color }}>{complianceRow.label}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Description + notes ── */}
          {(notes || plannedWorkout?.description || plannedWorkout?.notes) && (
            <div className="px-5 py-3 border-b border-gray-50 flex flex-wrap gap-4">
              {notes && (
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</div>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{notes}</p>
                </div>
              )}
              {plannedWorkout?.description && (
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Planned description</div>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{plannedWorkout.description}</p>
                </div>
              )}
              {plannedWorkout?.notes && (
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Coach notes</div>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{plannedWorkout.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Comments ── */}
          <div className="px-5 py-4 border-b border-gray-100">
            <TrainingComments trainingId={String(a.id || a._id || '')} />
          </div>

          {/* ── Route Map ── */}
          {gpsData.length > 0 && (
            <div className="border-b border-gray-50">
              <div className="relative overflow-hidden" style={{ height: 320 }}>
                <MapContainer
                  key={`modal-map-desktop-${gpsData[0]?.[0]}-${gpsData[0]?.[1]}`}
                  center={gpsData[Math.floor(gpsData.length / 2)]}
                  zoom={12}
                  style={{ height: '100%', width: '100%', zIndex: 0 }}
                  scrollWheelZoom={false}
                  zoomControl={true}
                  attributionControl={false}
                >
                  <MapInvalidator />
                  <FitBoundsToRoute positions={gpsData} />
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                  <Polyline positions={gpsData} pathOptions={{ color, weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }} />
                  <CircleMarker center={gpsData[0]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }}>
                    <LeafletTooltip permanent direction="top" offset={[0, -10]}>Start</LeafletTooltip>
                  </CircleMarker>
                  <CircleMarker center={gpsData[gpsData.length - 1]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#ef4444', fillOpacity: 1 }}>
                    <LeafletTooltip permanent direction="top" offset={[0, -10]}>Finish</LeafletTooltip>
                  </CircleMarker>
                </MapContainer>
              </div>
            </div>
          )}

          {/* ── Training Overview (desktop) ── */}
          {detailLoading ? (
            <div className="px-5 py-3 border-b border-gray-50">
              <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-2">Training Overview</div>
              <div className="rounded-xl bg-gray-100 animate-pulse" style={{ height: 120 }} />
            </div>
          ) : chartTraining?.records?.length > 0 ? (
            <div className="px-5 py-3 border-b border-gray-50">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Training Overview</div>
                {isSyntheticData && (
                  streamsRefreshing ? (
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      Loading Strava data…
                    </span>
                  ) : (
                    <button
                      onClick={refreshStreams}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      Load detailed Strava data
                    </button>
                  )
                )}
              </div>
              <TrainingChart
                training={chartTraining}
                user={null}
                userProfile={null}
                onHover={() => {}}
                onLeave={() => {}}
              />
            </div>
          ) : null}

          {/* ── Lap chart — sticky on desktop so the bars stay visible
              while the user scrolls through the laps table below. Mobile
              keeps natural flow (sticky steals too much height). ── */}
          {laps.length > 1 && (
            <div className="border-b border-gray-50 md:sticky md:top-0 md:z-10 bg-white">
              <LapChart
                laps={laps} color={color} isBike={isBike} isRun={isRun} isSwim={isSwim}
                selectedLap={selectedLap}
                chartScrollRef={lapChartScrollRef}
                records={chartTraining?.records}
                onSelectLap={(i) => {
                  setSelectedLap(i);
                  lapRowRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                // Horizontal chart scroll only highlights — does NOT pull the
                // laps table. Auto-scrolling the table while the user is
                // scrolling it themselves caused the jittery "fights me back"
                // behaviour.
                onScrollCenter={(i) => setSelectedLap(i)}
              />
            </div>
          )}

          {/* ── Laps table — full width ── */}
          {laps.length > 0 && (
            <div className="px-5 py-3">
              {(() => {
                const hasLactate = laps.some(l => (l.lactate ?? l.lactateValue) != null);
                const showLactate = hasLactate || !!onAddLactate;
                const showPace = isBike || isRun || isSwim;
                const cols = ['1.5rem', '1fr', '1fr', ...(showPace ? ['1fr'] : []), '1fr', ...(showLactate ? ['1fr'] : [])].join(' ');
                const paceHeader = isBike ? 'Pwr' : isSwim ? '/100m' : 'Pace';
                return (
                  <div className="rounded-xl overflow-hidden border border-gray-100">
                    <div className="grid text-[9px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 px-3 py-1.5 border-b border-gray-100"
                      style={{ gridTemplateColumns: cols }}>
                      <span>#</span>
                      <span className="text-right">Dist</span>
                      <span className="text-right">Time</span>
                      {showPace && <span className="text-right">{paceHeader}</span>}
                      <span className="text-right">HR</span>
                      {showLactate && <span className="text-right">La</span>}
                    </div>
                    <div className="divide-y divide-gray-50">
                      {laps.map((lap, i) => {
                        // Mirror the mobile block: accept both Strava
                        // (snake_case) and FIT (camelCase, e.g. totalDistance,
                        // avgHeartRate) field names so FIT uploads don't
                        // render every column blank.
                        const lapDur   = lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0;
                        const lapDist  = Number(lap.distance || lap.totalDistance || 0);
                        const lapSpeed = lap.average_speed || lap.avgSpeed || lap.avg_speed || null;
                        const lapPower = Number(lap.average_watts || lap.avgPower || 0);
                        const lapHr    = Number(lap.average_heartrate || lap.avgHeartRate || lap.averageHeartRate || lap.avgHR || 0);
                        const lapLa    = lap.lactate ?? lap.lactateValue;
                        const lapNum   = lap.lapNumber ?? (i + 1);
                        // Detect lap type for color-coding
                        const lapType  = detectLapType(lap, i, laps.length);
                        const isRestLap = lapType === 'recovery' || lapType === 'rest';

                        let lapPaceStr = '—';
                        let paceIsNormal = true;
                        if (isSwim) {
                          const spd = lapSpeed || (lapDist > 0 && lapDur > 0 ? lapDist / lapDur : 0);
                          if (spd > 0) {
                            const s = Math.round(100 / spd);
                            lapPaceStr = s < 60 ? `${s}s` : `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
                          }
                        } else if (isRun) {
                          if (lapDist > 0 && lapDur > 0) {
                            const spk = lapDur / (lapDist / 1000);
                            lapPaceStr = `${Math.floor(spk/60)}:${String(Math.round(spk%60)).padStart(2,'0')}`;
                            // Show pace for rest/walk laps too, just style it gray
                            if (isRestLap && spk > 480) paceIsNormal = false;
                          }
                        } else if (isBike) {
                          lapPaceStr = lapPower > 0 ? `${Math.round(lapPower)}W` : '—';
                        }

                        const isSelected = selectedLap === i;
                        const typeDot  = COMPARE_STEP_COLORS[lapType] || '#9ca3af';
                        const typeRowBg = isSelected ? '#EFF6FF'
                          : lapType === 'warmup'   ? '#fffbeb'
                          : lapType === 'cooldown' ? '#f0f9ff'
                          : lapType === 'recovery' || lapType === 'rest' ? '#f9fafb'
                          : undefined;
                        const paceColor = isSelected ? '#2563EB'
                          : !paceIsNormal ? '#9ca3af'
                          : isRestLap ? '#9ca3af'
                          : lapType === 'warmup' ? '#d97706'
                          : lapType === 'cooldown' ? '#0284c7'
                          : '#2563EB';
                        return (
                          <div
                            key={i}
                            ref={el => lapRowRefs.current[i] = el}
                            onClick={() => setSelectedLap(isSelected ? null : i)}
                            className="grid items-center px-3 py-2.5 text-[11px] cursor-pointer transition-colors"
                            style={{
                              gridTemplateColumns: cols,
                              backgroundColor: typeRowBg,
                              borderLeft: `3px solid ${isSelected ? '#2563EB' : typeDot}`,
                            }}
                          >
                            <span className="font-bold" style={{ color: isSelected ? '#2563EB' : typeDot }}>{lapNum}</span>
                            <span className="text-gray-500 text-right tabular-nums">{lapDist > 0 ? (lapDist >= 1000 ? `${(lapDist/1000).toFixed(1)}km` : `${Math.round(lapDist)}m`) : '—'}</span>
                            <span className="font-semibold text-gray-700 text-right tabular-nums">{fmtLapDur(lapDur)}</span>
                            {showPace && <span className="text-right tabular-nums font-semibold" style={{ color: paceColor }}>{lapPaceStr}</span>}
                            <span className="text-gray-500 text-right tabular-nums">{lapHr > 0 ? Math.round(lapHr) : '—'}</span>
                            {showLactate && (
                              lapLa != null ? (
                                <span className="text-right font-semibold tabular-nums" style={{ color: '#7c3aed' }}>{Number(lapLa).toFixed(1)}</span>
                              ) : onAddLactate ? (
                                <div className="flex justify-end">
                                  <button onClick={e => { e.stopPropagation(); onAddLactate(merged, i); onClose(); }}
                                    className="flex items-center justify-center w-5 h-5 rounded-full hover:opacity-80 transition-opacity"
                                    style={{ backgroundColor: '#f5f3ff', color: '#7c3aed' }}
                                    title={`Add lactate for lap ${lapNum}`}>
                                    <span className="text-xs font-bold leading-none">+</span>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-right tabular-nums text-gray-400">—</span>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Compare with past sessions (desktop collapsible) ── */}
          {showCompare && (
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => setShowCompareDesktop(v => !v)}
                className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wide w-full text-left mb-3"
              >
                <span>Compare with past sessions</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showCompareDesktop ? 'rotate-180' : ''}`} />
              </button>
              {showCompareDesktop && <CompareContent merged={merged} athleteId={athleteId} onOpen={act => setNestedActivity(act)} />}
            </div>
          )}

          {/* ── Planned section (edit / view) ── */}
          <div className="border-t border-gray-100 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Planned</span>
              {plannedWorkout && !editingPlanned && (
                <button
                  onClick={() => setEditingPlanned(true)}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <PencilIcon className="w-3 h-3" /> Edit
                </button>
              )}
            </div>

            {editingPlanned ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Title</label>
                    <input type="text" value={planForm.title} onChange={e => setPlanForm(p => ({ ...p, title: e.target.value }))} placeholder={title}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Target TSS</label>
                    <input type="number" value={planForm.targetTss} onChange={e => setPlanForm(p => ({ ...p, targetTss: e.target.value }))} placeholder={tss > 0 ? String(Math.round(tss)) : ''}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2" min="0" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                      Duration {planForm.durationMins > 0 && <span className="font-normal normal-case text-gray-400">({formatMinutes(planForm.durationMins)})</span>}
                    </label>
                    <input type="text" value={planForm.durationDisplay}
                      onChange={e => setPlanForm(p => ({ ...p, durationDisplay: e.target.value, durationMins: null }))}
                      onBlur={() => { const mins = parseDurationToMinutes(planForm.durationDisplay); if (mins != null && mins > 0) setPlanForm(p => ({ ...p, durationMins: mins, durationDisplay: formatMinutes(mins) })); }}
                      placeholder={dur > 0 ? formatMinutes(Math.round(dur/60)) : '1:30'}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Distance</label>
                    <input type="text" value={planForm.distanceDisplay}
                      onChange={e => setPlanForm(p => ({ ...p, distanceDisplay: e.target.value, distanceKm: null }))}
                      onBlur={() => { const km = parseDistanceToKm(planForm.distanceDisplay); if (km != null && km > 0) setPlanForm(p => ({ ...p, distanceKm: km, distanceDisplay: `${km % 1 === 0 ? km : km.toFixed(2)} km` })); }}
                      placeholder={dist > 0 ? `${(dist/1000).toFixed(1)} km` : '10 km'}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</label>
                    <textarea value={planForm.description} onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))} placeholder="Workout description…" rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 resize-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Coach notes</label>
                    <textarea value={planForm.notes} onChange={e => setPlanForm(p => ({ ...p, notes: e.target.value }))} placeholder="Coach notes, instructions…" rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 resize-none" />
                  </div>
                </div>
                <div className="flex gap-2">
                  {plannedWorkout && (
                    <button onClick={() => setEditingPlanned(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
                  )}
                  <button onClick={handleSavePlan} disabled={savingPlan} className="flex-1 py-2 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50" style={{ backgroundColor: color }}>
                    {savingPlan ? 'Saving…' : plannedWorkout ? 'Save' : 'Add Planned'}
                  </button>
                  {plannedWorkout && onEditPlanned && (
                    <button onClick={() => onEditPlanned(plannedWorkout)} className="flex-1 py-2 rounded-xl border text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                      style={{ borderColor: color + '60', color, backgroundColor: color + '08' }}>
                      <PencilIcon className="w-3.5 h-3.5" /> Build Workout
                    </button>
                  )}
                </div>
              </div>
            ) : (
              plannedWorkout ? (
                <div className="flex flex-wrap gap-4 items-start">
                  <div className="rounded-xl bg-gray-50 p-3 flex gap-4 flex-wrap">
                    {plannedDur > 0 && <div><div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Duration</div><div className="text-sm font-bold text-gray-800">{fmtDur(plannedDur)}</div></div>}
                    {plannedTss > 0 && <div><div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">TSS</div><div className="text-sm font-bold text-gray-800">{plannedTss}</div></div>}
                    {plannedDist > 0 && <div><div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Distance</div><div className="text-sm font-bold text-gray-800">{fmtDist(plannedDist)}</div></div>}
                  </div>
                  {planSteps.length > 0 && (
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-2">Intervals</div>
                      <div className="flex flex-wrap gap-1">
                        {planSteps.filter(s => !s.isGroupHeader).map((s, i) => {
                          const stepColor = s.type === 'work' ? color : s.type === 'warmup' ? '#fbbf24' : s.type === 'cooldown' ? '#38bdf8' : '#6ee7b7';
                          return (
                            <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 border-l-2 text-[10px]" style={{ borderLeftColor: stepColor }}>
                              <span className="font-semibold text-gray-700 capitalize">{s.type || 'Step'}{s.groupId ? ` ×${s.groupRepeat || 1}` : ''}</span>
                              <span className="font-bold text-gray-500">{fmtPlanDuration(s.durationSeconds)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => setEditingPlanned(true)} className="text-sm font-semibold px-4 py-2 rounded-xl border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors">
                  + Add planned workout
                </button>
              )
            )}
          </div>

        </div>{/* end single scrollable column */}
      </div>
    </div>,
    document.getElementById('app-modal-root') || document.body
  );

  // ── Nested modal for opening a compared activity ──
  // We render an ActivityFullModal on top when user clicks "Otevřít" in Compare
  // tab, normalising the compare-result shape to the expected activity shape.
  return <>
    {desktopPortal}
    {nestedActivity && (() => {
      const na = nestedActivity;
      const fakeActivity = {
        id:    na.id,
        _id:   na.id,
        type:  na.type,
        sport: na.sport || merged?.sport,
        date:  na.date,
        title: na.title,
        titleManual: na.title,
        category: na.category,
        lactate:  na.lactate,
        distance: na.distance,
        elapsed_time: na.duration,
        average_heartrate: na.avgHr,
        average_watts: na.avgPower,
        laps: na.laps || [],
      };
      return (
        <ActivityFullModal
          activity={fakeActivity}
          athleteId={athleteId}
          onClose={() => setNestedActivity(null)}
        />
      );
    })()}
  </>;
}

// ─── Activity Detail Popup ────────────────────────────────────────────────────
function ActivityDetailPopup({ activity, anchorRect, onClose, onSelectActivity, onAddLactate, plannedWorkout = null, onEditPlanned = null, onOpenFull = null }) {
  const popupRef = useRef(null);
  const a = activity;
  const isMobilePopup = window.innerWidth < 768;

  // Escape key + click outside
  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) onClose();
    };
    // Delay so the click that opened the popup doesn't immediately close it
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClickOutside); };
  }, [onClose]);

  // Planned vs completed — computed early so POPUP_W/H can depend on hasPlanned
  const plannedDur = plannedWorkout ? (planStepTotalSecs(plannedWorkout.steps) || plannedWorkout.plannedDuration || 0) : 0;
  const plannedDist = plannedWorkout
    ? (() => { const n = Number(plannedWorkout.plannedDistance || 0); return n > 0 && n < 100 ? n * 1000 : n; })()
    : 0;
  const plannedTss  = plannedWorkout ? (Number(plannedWorkout.targetTss || 0)) : 0;
  const hasPlanned = !!plannedWorkout && (plannedDur > 0 || plannedTss > 0);

  // Desktop positioning: right of element if space, else left; always inside viewport
  const POPUP_W = hasPlanned ? 320 : 288;
  const POPUP_H = hasPlanned ? 460 : 380;
  const MARGIN = 8;
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;

  let left, top;
  if (!isMobilePopup) {
    if (anchorRect) {
      if (anchorRect.right + POPUP_W + MARGIN <= vpW) {
        left = anchorRect.right + MARGIN;
      } else {
        left = anchorRect.left - POPUP_W - MARGIN;
      }
      left = Math.max(MARGIN, Math.min(left, vpW - POPUP_W - MARGIN));
      top = anchorRect.top;
      top = Math.max(MARGIN, Math.min(top, vpH - POPUP_H - MARGIN));
    } else {
      left = vpW / 2 - POPUP_W / 2;
      top = vpH / 2 - POPUP_H / 2;
    }
  }

  // Data extraction
  const title = a.title || a.name || a.originalFileName || 'Activity';
  const color = sportColor(a.sport);
  const sport = String(a.sport || '').toLowerCase();
  const isRun = sport.includes('run') || sport.includes('walk') || sport.includes('hike');
  const isSwim = sport.includes('swim');
  const isBike = sport.includes('ride') || sport.includes('cycle') || sport.includes('bike');

  // Duration — cover all field name variations from Strava, FIT files, internal
  const dur = Number(
    a.duration || a.elapsed_time || a.movingTime || a.moving_time ||
    a.totalTimerTime || a.totalElapsedTime || a.elapsedTime || 0
  );
  const fmtDur = (s) => s > 0
    ? `${Math.floor(s/3600)}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`
    : '-';
  const durStr = fmtDur(dur);

  const dist = Number(a.distance || a.totalDistance || 0);
  const distStr = dist > 0 ? (dist >= 1000 ? `${(dist/1000).toFixed(2)} km` : `${Math.round(dist)} m`) : '-';

  const tss  = Number(a.tss || a.trainingLoad || 0);
  const hrTss = Number(a.hrTSS || a.hrTss || 0);
  const power = Number(a.avgPower || a.averagePower || a.average_watts || 0);
  const np    = Number(a.normalizedPower || a.weightedAveragePower || a.weighted_average_watts || 0);
  const hr    = Number(a.averageHeartRate || a.average_heartrate || a.avgHR || 0);
  const elevation = Number(a.totalElevationGain || a.elevationGain || a.total_elevation_gain || 0);
  const cadence   = Number(a.averageCadence || a.average_cadence || a.avgCadence || 0);

  // Average pace for run/swim
  const avgSpeed = Number(a.avgSpeed || a.average_speed || 0); // m/s
  let paceStr = null;
  if (isRun && avgSpeed > 0) {
    const secPerKm = 1000 / avgSpeed;
    paceStr = `${Math.floor(secPerKm/60)}:${String(Math.round(secPerKm%60)).padStart(2,'0')} /km`;
  } else if (isSwim && avgSpeed > 0) {
    const secPer100 = 100 / avgSpeed;
    paceStr = `${Math.floor(secPer100/60)}:${String(Math.round(secPer100%60)).padStart(2,'0')} /100m`;
  }

  const actDate = a.date || a.timestamp || a.startDate || a.start_time;
  const dateStr = actDate
    ? new Date(actDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const notes = a.description || a.notes || '';
  const isStrava = a.type === 'strava' || !!a.stravaId || !!a.strava_id;

  // Build stats — only include rows with actual data
  const stats = [
    { label: 'Duration',  value: durStr },
    { label: 'Distance',  value: distStr },
    ...(tss > 0  ? [{ label: 'TSS',      value: Math.round(tss) }] : []),
    ...(hrTss > 0 && hrTss !== tss ? [{ label: 'hrTSS', value: Math.round(hrTss) }] : []),
    ...(paceStr  ? [{ label: 'Avg Pace', value: paceStr }]  : []),
    ...(isBike && power > 0 ? [{ label: 'Avg Power', value: `${Math.round(power)} W` }] : []),
    ...(isBike && np > 0 ? [{ label: 'NP', value: `${Math.round(np)} W` }] : []),
    ...(hr > 0   ? [{ label: 'Avg HR',   value: `${Math.round(hr)} bpm` }] : []),
    ...(elevation > 0 ? [{ label: 'Elevation', value: `${Math.round(elevation)} m` }] : []),
    ...(cadence > 0   ? [{ label: isSwim ? 'Strokes/min' : 'Cadence', value: `${Math.round(cadence)}` }] : []),
  ];

  const fmtDurShort = (s) => {
    if (!s) return '—';
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}` : `${m}m`;
  };

  const complianceRow = hasPlanned && plannedDur < 24 * 3600 && dur > 0 ? getCompliance(plannedDur, dur) : null;
  const compRows = hasPlanned ? [
    { label: 'Duration', planned: fmtDurShort(plannedDur), completed: fmtDurShort(dur), unit: 'h:mm' },
    ...(plannedDist > 0 || dist > 0 ? [{ label: 'Distance', planned: plannedDist > 0 ? `${(plannedDist/1000).toFixed(1)}` : '—', completed: dist > 0 ? `${(dist/1000).toFixed(2)}` : '—', unit: 'km' }] : []),
    ...(plannedTss > 0 || tss > 0 ? [{ label: 'TSS', planned: plannedTss > 0 ? plannedTss : '—', completed: tss > 0 ? Math.round(tss) : '—', unit: '' }] : []),
  ] : [];

  // Shared inner content
  const innerContent = (
    <>
      {/* Colored top accent bar */}
      <div className="h-1.5 w-full flex-shrink-0" style={{ backgroundColor: color }} />

      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <SportIcon sport={a.sport} className="w-7 h-7 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-900 truncate">{title}</div>
          {dateStr && <div className="text-[10px] text-gray-400 mt-0.5">{dateStr}</div>}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors touch-manipulation"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Planned vs Completed comparison — shown when a planned workout matches */}
      {hasPlanned && (
        <div className="mx-4 mb-3 rounded-xl overflow-hidden border border-gray-100">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto] bg-gray-50 px-3 py-1.5 border-b border-gray-100">
            <div />
            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide w-14 text-right">Planned</div>
            <div className="text-[9px] font-bold uppercase tracking-wide w-14 text-right" style={{ color }}>Done</div>
          </div>
          {compRows.map(({ label, planned, completed, unit }) => (
            <div key={label} className="grid grid-cols-[1fr_auto_auto] px-3 py-2 border-b border-gray-50 last:border-0">
              <div className="text-[10px] font-medium text-gray-500">{label}</div>
              <div className="text-[10px] font-semibold text-gray-400 w-14 text-right tabular-nums">{planned}{unit && planned !== '—' ? <span className="text-gray-300 ml-0.5">{unit}</span> : ''}</div>
              <div className="text-[10px] font-bold w-14 text-right tabular-nums" style={{ color: complianceRow?.color || color }}>{completed}{unit && completed !== '—' ? <span className="font-normal ml-0.5" style={{ color: '#d1d5db' }}>{unit}</span> : ''}</div>
            </div>
          ))}
          {/* Compliance summary row */}
          {complianceRow && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: complianceRow.color }} />
              <span className="text-[10px] font-bold" style={{ color: complianceRow.color }}>{complianceRow.label}</span>
              {plannedWorkout?.title && <span className="text-[9px] text-gray-400 truncate flex-1 text-right">{plannedWorkout.title}</span>}
            </div>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div className={`px-4 pb-3 grid grid-cols-2 gap-x-3 gap-y-2.5 ${hasPlanned ? 'pt-1' : ''}`}>
        {stats.filter(s => hasPlanned ? !['Duration','Distance','TSS'].includes(s.label) : true).map(({ label, value }) => (
          <div key={label}>
            <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">{label}</div>
            <div className="text-xs font-bold text-gray-800">{value}</div>
          </div>
        ))}
      </div>

      {/* Notes */}
      {notes && (
        <div className="mx-4 mb-3 p-2.5 bg-gray-50 rounded-xl">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</div>
          <p className="text-xs text-gray-600 line-clamp-3">{notes}</p>
        </div>
      )}

      {/* Footer buttons */}
      <div className="px-4 pb-4 flex flex-col gap-2">
        <button
          onClick={() => { onClose(); if (onOpenFull) onOpenFull(); else if (onSelectActivity) onSelectActivity(a); }}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors touch-manipulation"
          style={{ backgroundColor: color, WebkitTapHighlightColor: 'transparent' }}
        >
          Open Activity
        </button>
        {hasPlanned && onEditPlanned && (
          <button
            onClick={() => { onEditPlanned(plannedWorkout); onClose(); }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border transition-colors touch-manipulation flex items-center justify-center gap-1.5"
            style={{ borderColor: color + '60', color, backgroundColor: color + '08', WebkitTapHighlightColor: 'transparent' }}
          >
            <PencilIcon className="w-3.5 h-3.5" /> Edit Planned Workout
          </button>
        )}
        {isStrava && onAddLactate && (
          <button
            onClick={() => { onAddLactate(a); onClose(); }}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors touch-manipulation"
            style={{ borderColor: '#7c3aed', color: '#7c3aed', backgroundColor: '#f5f3ff', WebkitTapHighlightColor: 'transparent' }}
          >
            + Add Lactate Test
          </button>
        )}
      </div>
    </>
  );

  if (isMobilePopup) {
    // Mobile: bottom sheet with backdrop
    return ReactDOM.createPortal(
      <div className="fixed inset-0 z-[10000] flex flex-col justify-end">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40"
          onClick={onClose}
        />
        {/* Bottom sheet */}
        <div
          ref={popupRef}
          className="relative bg-white rounded-t-2xl shadow-2xl overflow-y-auto"
          style={{ maxHeight: '85vh' }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>
          {innerContent}
          {/* Safe area bottom padding */}
          <div className="h-safe-area-inset-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
        </div>
      </div>,
      document.body
    );
  }

  // Desktop: floating popup
  return ReactDOM.createPortal(
    <div
      ref={popupRef}
      className="fixed z-[10000] w-72 max-w-xs bg-white rounded-2xl shadow-2xl overflow-hidden"
      style={{ left, top, maxHeight: '90vh', overflowY: 'auto' }}
    >
      {innerContent}
    </div>,
    document.body
  );
}

// ─── Add Completed Workout Sheet ──────────────────────────────────────────────
const SPORT_OPTIONS_COMPLETED = [
  { key: 'bike',     label: 'Cycling',   icon: '/icon/bike.svg',   color: '#767EB5' },
  { key: 'run',      label: 'Running',   icon: '/icon/run.svg',    color: '#f97316' },
  { key: 'swim',     label: 'Swimming',  icon: '/icon/swim.svg',   color: '#599FD0' },
  { key: 'strength', label: 'Strength',  icon: null,               color: '#9ca3af' },
  { key: 'other',    label: 'Other',     icon: null,               color: '#9ca3af' },
];

function AddCompletedSheet({ date, onClose, onSaved, athleteId, onPlanWorkout }) {
  // step: 'menu' (when plan option available) | 'pick' | 'manual' | 'fit'
  const [step, setStep]     = useState(onPlanWorkout ? 'menu' : 'pick');
  const [saving, setSaving] = useState(false);
  const [fitError, setFitError] = useState(null);
  const fitInputRef = useRef(null);

  // ── Manual form state ─────────────────────────────────────────────────────
  const dateStr = date ? [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-') : '';

  const [form, setForm] = useState({
    sport: 'bike',
    title: '',
    date: dateStr,
    duration: '',   // hh:mm or mm:ss
    distanceKm: '',
    elevationM: '',
    tss: '',
    avgHr: '',
    notes: '',
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Parse "h:mm:ss", "mm:ss", or plain minutes → seconds
  const parseDuration = (s) => {
    const parts = String(s).trim().split(':').map(Number);
    if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
    if (parts.length === 2) return parts[0]*60  + parts[1];
    return (Number(s) || 0) * 60; // bare number = minutes
  };

  const handleManualSubmit = async () => {
    if (!form.date || !form.sport) return;
    setSaving(true);
    try {
      const { addTraining } = await import('../../services/api.js');
      const durSec = parseDuration(form.duration);
      const dist   = Number(form.distanceKm) * 1000 || 0;
      const payload = {
        date: form.date,
        sport: form.sport,
        title: form.title || (SPORT_OPTIONS_COMPLETED.find(s => s.key === form.sport)?.label ?? form.sport),
        duration: durSec || undefined,
        elapsed_time: durSec || undefined,
        distance: dist || undefined,
        elevationGain: Number(form.elevationM) || undefined,
        tss: Number(form.tss) || undefined,
        averageHeartRate: Number(form.avgHr) || undefined,
        description: form.notes || undefined,
        athleteId: athleteId || undefined,
        source: 'manual',
      };
      await addTraining(payload);
      onSaved?.();
      onClose();
    } catch (e) {
      console.error('Manual workout save error:', e);
      setSaving(false);
    }
  };

  const handleFitChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFitError(null);
    setSaving(true);
    try {
      const { uploadFitFile } = await import('../../services/api.js');
      await uploadFitFile(file);
      onSaved?.();
      onClose();
    } catch (err) {
      setFitError(err?.response?.data?.message || err?.message || 'Upload failed');
      setSaving(false);
    }
  };

  const sportOpt = SPORT_OPTIONS_COMPLETED.find(s => s.key === form.sport) || SPORT_OPTIONS_COMPLETED[0];

  return ReactDOM.createPortal(
    <AnimatePresence>
      <motion.div
        key="add-completed-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex items-end justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="w-full max-w-lg bg-white rounded-t-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 bg-gray-200 rounded-full" />
          </div>

          {/* ── Step: menu (plan vs log) ── */}
          {step === 'menu' && (
            <div className="px-5 pb-8 pt-2">
              <p className="text-xs text-gray-400 mb-5 text-center">{date?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { onClose(); setTimeout(() => onPlanWorkout(date), 50); }}
                  className="flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 bg-gray-50 active:bg-gray-100 touch-manipulation text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Plan workout</div>
                    <div className="text-[11px] text-gray-400">Create a training plan entry</div>
                  </div>
                </button>
                <button
                  onClick={() => setStep('pick')}
                  className="flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 bg-gray-50 active:bg-gray-100 touch-manipulation text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Log completed workout</div>
                    <div className="text-[11px] text-gray-400">Upload FIT or enter manually</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ── Step: pick type ── */}
          {step === 'pick' && (
            <div className="px-5 pb-8 pt-2">
              <div className="flex items-center justify-between mb-1">
                {onPlanWorkout ? (
                  <button onClick={() => setStep('menu')} className="text-xs text-gray-400 flex items-center gap-1">
                    <ChevronLeftIcon className="w-3.5 h-3.5" />Back
                  </button>
                ) : <div />}
                <h2 className="text-base font-bold text-gray-800">Log completed workout</h2>
                <div className="w-10" />
              </div>
              <p className="text-xs text-gray-400 mb-5">{date?.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { setStep('fit'); setTimeout(() => fitInputRef.current?.click(), 50); }}
                  className="flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 bg-gray-50 active:bg-gray-100 touch-manipulation text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 8l-3-3m3 3l3-3" /></svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Upload FIT file</div>
                    <div className="text-[11px] text-gray-400">Import from Garmin, Wahoo, etc.</div>
                  </div>
                </button>

                <button
                  onClick={() => setStep('manual')}
                  className="flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 bg-gray-50 active:bg-gray-100 touch-manipulation text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-6-6l6 6M13 3l4 4-9 9H4v-4l9-9z" /></svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Add manually</div>
                    <div className="text-[11px] text-gray-400">Enter distance, time, TSS…</div>
                  </div>
                </button>
              </div>

              {/* Hidden FIT input */}
              <input
                ref={fitInputRef}
                type="file"
                accept=".fit,.FIT"
                className="hidden"
                onChange={handleFitChange}
              />
              {fitError && <p className="mt-3 text-xs text-red-500">{fitError}</p>}
              {saving && <p className="mt-3 text-xs text-primary text-center">Uploading…</p>}
            </div>
          )}

          {/* ── Step: FIT upload (file picker launched; just show spinner if saving) ── */}
          {step === 'fit' && (
            <div className="px-5 pb-8 pt-2 text-center">
              <h2 className="text-base font-bold text-gray-800 mb-2">Upload FIT file</h2>
              <input
                ref={fitInputRef}
                type="file"
                accept=".fit,.FIT"
                className="hidden"
                onChange={handleFitChange}
              />
              {saving ? (
                <p className="text-sm text-primary py-6">Uploading…</p>
              ) : (
                <>
                  {fitError && <p className="text-xs text-red-500 mb-3">{fitError}</p>}
                  <button
                    onClick={() => fitInputRef.current?.click()}
                    className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold mb-2"
                  >Choose file</button>
                  <button onClick={() => setStep('pick')} className="text-xs text-gray-400">← Back</button>
                </>
              )}
            </div>
          )}

          {/* ── Step: manual form ── */}
          {step === 'manual' && (
            <div className="px-4 pb-6 pt-2 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setStep('pick')} className="text-xs text-gray-400 flex items-center gap-1">
                  <ChevronLeftIcon className="w-3.5 h-3.5" />Back
                </button>
                <h2 className="text-sm font-bold text-gray-800">Manual workout</h2>
                <div className="w-10" />
              </div>

              {/* Sport picker */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {SPORT_OPTIONS_COMPLETED.map(s => (
                  <button
                    key={s.key}
                    onClick={() => set('sport', s.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all touch-manipulation ${form.sport === s.key ? 'text-white border-transparent' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                    style={form.sport === s.key ? { backgroundColor: s.color, borderColor: s.color } : {}}
                  >
                    {s.icon
                      ? <img src={s.icon} alt={s.key} className="w-3.5 h-3.5" style={form.sport === s.key ? { filter: 'brightness(10)' } : { opacity: 0.6 }} />
                      : <BoltIcon className="w-3.5 h-3.5" />
                    }
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Title */}
              <div className="mb-3">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Title (optional)</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder={sportOpt.label + ' workout'}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-primary"
                />
              </div>

              {/* Date */}
              <div className="mb-3">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => set('date', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-primary"
                />
              </div>

              {/* Duration + Distance row */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Duration</label>
                  <input
                    type="text"
                    value={form.duration}
                    onChange={e => set('duration', e.target.value)}
                    placeholder="h:mm:ss"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Distance (km)</label>
                  <input
                    type="number"
                    value={form.distanceKm}
                    onChange={e => set('distanceKm', e.target.value)}
                    placeholder="0.0"
                    step="0.1"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Elevation + TSS row */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Elevation gain (m)</label>
                  <input
                    type="number"
                    value={form.elevationM}
                    onChange={e => set('elevationM', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">TSS</label>
                  <input
                    type="number"
                    value={form.tss}
                    onChange={e => set('tss', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Avg HR */}
              <div className="mb-3">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Avg heart rate (bpm)</label>
                <input
                  type="number"
                  value={form.avgHr}
                  onChange={e => set('avgHr', e.target.value)}
                  placeholder="—"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-primary"
                />
              </div>

              {/* Notes */}
              <div className="mb-5">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="How did it feel?"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <button
                onClick={handleManualSubmit}
                disabled={saving || !form.date}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: sportOpt.color }}
              >
                {saving ? 'Saving…' : 'Save workout'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.getElementById('app-modal-root') || document.body
  );
}

// ─── Richer Summary Column ────────────────────────────────────────────────────
const SPORT_COLORS_CELL = { bike: '#767EB5', run: '#f97316', swim: '#599FD0', other: '#9ca3af' };

function WeekSummaryCell({ weekSummary, formatHours, formatKm, user, tab = 'done', weekPlannedWorkouts = [] }) {
  if (!weekSummary) return <div className="bg-gray-50 p-2 min-h-[130px] min-w-[140px]" />;

  const { totalSeconds, totalTSS, runSeconds, bikeSeconds, swimSeconds, strengthSeconds,
    distanceRun, distanceBike, distanceSwim, tssRun, tssBike, tssSwim, tssStrength,
    volumeChange, plannedSeconds, plannedTSS } = weekSummary;

  const hasPlan = plannedSeconds > 0;
  const completionPct = hasPlan ? Math.min(100, Math.round((totalSeconds / plannedSeconds) * 100)) : null;

  // Plan tab — show planned workouts grouped by sport
  if (tab === 'plan') {
    const SPORT_META = {
      bike:       { label: 'Bike',       icon: '/icon/bike.svg',  color: '#767EB5', isImg: true },
      run:        { label: 'Run',        icon: '/icon/run.svg',   color: '#f97316', isImg: true },
      swim:       { label: 'Swim',       icon: '/icon/swim.svg',  color: '#38bdf8', isImg: true },
      strength:   { label: 'Strength',   icon: null,              color: '#8b5cf6', isImg: false },
      walk:       { label: 'Walk',       icon: null,              color: '#22c55e', isImg: false },
      brick:      { label: 'Brick',      icon: null,              color: '#f59e0b', isImg: false },
      crosstrain: { label: 'Cross',      icon: null,              color: '#ec4899', isImg: false },
      mtbike:     { label: 'MTB',        icon: '/icon/bike.svg',  color: '#a16207', isImg: true },
      rowing:     { label: 'Rowing',     icon: null,              color: '#06b6d4', isImg: false },
      lactate:    { label: 'Lactate',    icon: null,              color: '#ef4444', isImg: false },
      other:      { label: 'Other',      icon: null,              color: '#6b7280', isImg: false },
    };

    // Group by sport
    const bySport = {};
    weekPlannedWorkouts.forEach(pw => {
      const sport = (pw.sport || 'other').toLowerCase();
      if (!bySport[sport]) bySport[sport] = { secs: 0, dist: 0, tss: 0 };
      bySport[sport].secs += planStepTotalSecs(pw.steps) || pw.plannedDuration || 0;
      bySport[sport].dist += pw.plannedDistance || 0;
      bySport[sport].tss  += pw.targetTss || 0;
    });

    const sportRows = Object.entries(bySport).filter(([, v]) => v.secs > 0 || v.dist > 0);
    const totalSecs = sportRows.reduce((s, [, v]) => s + v.secs, 0);
    const totalTssP = sportRows.reduce((s, [, v]) => s + v.tss, 0);

    return (
      <div className="bg-gray-50 p-2 border-l-4 border-primary/30 min-h-[130px] min-w-[140px] flex flex-col gap-1.5">
        {/* Totals */}
        <div className="flex items-baseline gap-1 leading-tight">
          <span className="text-base font-extrabold text-gray-900">{formatHours(totalSecs || plannedSeconds)}</span>
          {totalTssP > 0 && (
            <span className="text-[10px] font-bold text-primary">{Math.round(totalTssP)} TSS</span>
          )}
        </div>
        {sportRows.length === 0 ? (
          <span className="text-xs text-gray-400 flex-1 flex items-center">No plan</span>
        ) : (
          <div className="space-y-1 flex-1">
            {sportRows.map(([sport, v]) => {
              const meta = SPORT_META[sport] || SPORT_META.other;
              return (
                <div key={sport} className="flex items-center gap-1">
                  {meta.isImg && meta.icon
                    ? <img src={meta.icon} alt={sport} className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
                    : <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />
                  }
                  <span className="text-[10px] font-semibold text-gray-500 w-8 shrink-0">{meta.label}</span>
                  <span className="text-[10px] font-bold text-gray-800 flex-1">{formatHours(v.secs)}</span>
                  {v.dist > 0 && <span className="text-[9px] text-gray-400 shrink-0">{formatKm(v.dist)}</span>}
                  {v.tss > 0 && <span className="text-[9px] font-bold shrink-0" style={{ color: meta.color }}>{Math.round(v.tss)}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Done tab — existing view
  const totalTssForBar = tssRun + tssBike + tssSwim + tssStrength;
  const bikeRatio = totalTssForBar > 0 ? tssBike / totalTssForBar : 0;
  const runRatio  = totalTssForBar > 0 ? tssRun  / totalTssForBar : 0;
  const swimRatio = totalTssForBar > 0 ? tssSwim / totalTssForBar : 0;

  const sports = [
    { key: 'bike', icon: '/icon/bike.svg', seconds: bikeSeconds, dist: distanceBike, tss: tssBike, color: SPORT_COLORS_CELL.bike },
    { key: 'run',  icon: '/icon/run.svg',  seconds: runSeconds,  dist: distanceRun,  tss: tssRun,  color: SPORT_COLORS_CELL.run },
    { key: 'swim', icon: '/icon/swim.svg', seconds: swimSeconds, dist: distanceSwim, tss: tssSwim, color: SPORT_COLORS_CELL.swim },
  ].filter(s => s.seconds > 0 || s.dist > 0);

  return (
    <div className="bg-gray-50 p-2 border-l-4 border-primary/30 min-h-[130px] min-w-[140px] flex flex-col gap-1.5">
      {/* Total time: actual vs planned */}
      <div className="flex items-start justify-between gap-1">
        <div>
          {hasPlan ? (
            <div className="flex items-baseline gap-1 leading-tight">
              <span className="text-[11px] font-medium text-gray-400">{formatHours(plannedSeconds)}</span>
              <span className="text-base font-extrabold text-gray-900">{formatHours(totalSeconds)}</span>
            </div>
          ) : (
            <div className="text-base font-extrabold text-gray-900 leading-tight">{formatHours(totalSeconds)}</div>
          )}
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {totalTSS > 0 && (
              <div className="flex items-center gap-0.5">
                <FireIcon className="w-3 h-3 text-primary" />
                <span className="text-xs font-bold text-primary">{Math.round(totalTSS)}</span>
                {plannedTSS > 0 && <span className="text-[9px] text-gray-400">/{Math.round(plannedTSS)}</span>}
                <span className="text-[9px] text-gray-400">TSS</span>
              </div>
            )}
            {completionPct !== null && (
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full ${completionPct >= 100 ? 'bg-green-100 text-green-600' : completionPct >= 70 ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-400'}`}>
                {completionPct}%
              </span>
            )}
          </div>
        </div>
        {volumeChange && (
          <span className="mt-0.5 flex-shrink-0">
            {volumeChange === 'up' && <ArrowUpIcon className="w-4 h-4 text-green-500" />}
            {volumeChange === 'down' && <ArrowDownIcon className="w-4 h-4 text-red-500" />}
            {volumeChange === 'same' && <MinusIcon className="w-4 h-4 text-gray-400" />}
          </span>
        )}
      </div>

      {/* Progress bar: actual / planned */}
      {hasPlan && (
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (totalSeconds / plannedSeconds) * 100)}%`,
              backgroundColor: completionPct >= 100 ? '#22c55e' : completionPct >= 70 ? '#f59e0b' : '#767EB5'
            }}
          />
        </div>
      )}

      {/* TSS distribution bar (only when no plan bar) */}
      {!hasPlan && totalTssForBar > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
          {bikeRatio > 0 && <div style={{ width: `${bikeRatio*100}%`, backgroundColor: SPORT_COLORS_CELL.bike }} className="rounded-full" />}
          {runRatio  > 0 && <div style={{ width: `${runRatio*100}%`,  backgroundColor: SPORT_COLORS_CELL.run }} className="rounded-full" />}
          {swimRatio > 0 && <div style={{ width: `${swimRatio*100}%`, backgroundColor: SPORT_COLORS_CELL.swim }} className="rounded-full" />}
          {(1 - bikeRatio - runRatio - swimRatio) > 0.01 && (
            <div style={{ flex: 1, backgroundColor: '#9ca3af' }} className="rounded-full" />
          )}
        </div>
      )}

      {/* Per-sport rows */}
      <div className="space-y-1 flex-1">
        {sports.map(s => (
          <div key={s.key} className="flex items-center gap-1">
            <img src={s.icon} alt={s.key} className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
            <span className="text-[10px] font-semibold text-gray-700 flex-1 truncate">{formatHours(s.seconds)}</span>
            {s.dist > 0 && <span className="text-[9px] text-gray-400 flex-shrink-0">{formatKm(s.dist)}</span>}
            {s.tss > 0 && <span className="text-[9px] font-bold text-primary flex-shrink-0">{Math.round(s.tss)}</span>}
          </div>
        ))}
        {strengthSeconds > 0 && (
          <div className="flex items-center gap-1">
            <BoltIcon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span className="text-[10px] font-semibold text-gray-700 flex-1">{formatHours(strengthSeconds)}</span>
            {tssStrength > 0 && <span className="text-[9px] font-bold text-primary flex-shrink-0">{Math.round(tssStrength)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CalendarView({
  activities = [],
  onSelectActivity,
  selectedActivityId,
  /** When true, the first time `selectedActivityId` matches an activity
   *  open ActivityFullModal automatically — used by deep-links from
   *  push notifications so tap opens the same modal as a calendar tap. */
  autoOpenSelectedActivity = false,
  initialAnchorDate,
  user = null,
  onMonthChange = null,
  onVisiblePeriodChange = null,
  onAddLactate = null,
  commentCounts = {},
  /** Array of PlannedWorkout objects: { _id, date (YYYY-MM-DD), title, sport, steps, status } */
  plannedWorkouts = [],
  /** Called with the PlannedWorkout object when the user clicks on a planned card */
  onSelectPlannedWorkout = null,
  /** Called with the PlannedWorkout object when the user clicks "Start" */
  onStartWorkout = null,
  /** Called with a Date when the user wants to plan a workout for that day */
  onPlanWorkout = null,
  /** Called (with no args) after a completed workout is saved — parent should refresh */
  onAddCompletedWorkout = null,
  /** Called with (id, newDateStr) when a workout is moved via drag */
  onMovePlannedWorkout = null,
  /** Called with (pw, newDateStr) when a workout is copied via Alt+drag */
  onCopyPlannedWorkout = null,
  /** Called with (pw) to delete a planned workout */
  onDeletePlannedWorkout = null,
  /** Optional: called with (activity, element) to open custom popup */
  onActivityClick = null,
  /** Optional: called with activity object to navigate to full detail page */
  onOpenActivity = null,
  /** Optional: content to render in the mobile Charts tab (replaces built-in simple charts) */
  mobileChartsContent = null,
  /** Optional: athleteId for coach context — forwarded to planned workout API calls */
  athleteId = null,
  /** Optional: called with updated activity object when CalendarView renames an activity */
  onActivityUpdate = null,
  /** Optional: called with { type, id } when the user deletes an activity from
   *  ActivityFullModal — parent should refresh its activity list. */
  onActivityDeleted = null,
}) {
  const { getCategory } = useCategories();

  /** Returns inline style for a category tag badge. */
  const catBadgeStyle = (catId) => {
    const cat = getCategory(catId);
    if (!cat) return { backgroundColor: '#f3f4f6', color: '#6b7280', borderColor: '#d1d5db' };
    return {
      backgroundColor: hexToRgba(cat.color, 0.15),
      color: cat.color,
      borderColor: hexToRgba(cat.color, 0.35),
    };
  };

  /** Returns the border color for an activity card. */
  const catBorderColor = (catId) => {
    const cat = getCategory(catId);
    return cat ? cat.color : null;
  };

  /** Returns the display label for a category. */
  const catLabel = (catId) => {
    const cat = getCategory(catId);
    return cat ? cat.label : (catId ? catId.charAt(0).toUpperCase() + catId.slice(1) : 'Uncategorized');
  };

  // Initialize anchorDate from localStorage, initialAnchorDate prop, or today
  const getInitialAnchorDate = () => {
    if (initialAnchorDate) return initialAnchorDate;
    const saved = localStorage.getItem('calendarView_anchorDate');
    if (saved) {
      const parsed = new Date(saved);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  };

  // Initialize view from localStorage or default to 'month'
  const getInitialView = () => {
    const saved = localStorage.getItem('calendarView_view');
    return (saved === 'week' || saved === 'month') ? saved : 'month';
  };

  const [view, setView] = useState(getInitialView);
  const [anchorDate, setAnchorDate] = useState(getInitialAnchorDate);
  const initialDate = getInitialAnchorDate();
  const lastMonthRef = useRef(`${initialDate.getFullYear()}-${initialDate.getMonth()}`);
  const fullscreenScrollRef = useRef(null);
  const pendingScrollRestore = useRef(null); // { prevScrollHeight } — set before anchor shift, consumed in useLayoutEffect

  // Initialize sportFilter from localStorage or default to 'all'
  const getInitialSportFilter = () => {
    const saved = localStorage.getItem('calendarView_sportFilter');
    return saved || 'all';
  };

  const [sportFilter, setSportFilter] = useState(getInitialSportFilter);
  const [categoryFilter, setCategoryFilter] = useState(() => localStorage.getItem('calendarView_categoryFilter') || 'all');
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  // Optimistic selection — marks activity immediately on click, before parent updates selectedActivityId
  const [optimisticSelectedId, setOptimisticSelectedId] = useState(null);
  // Mobile-specific state
  const [mobileTab, setMobileTab] = useState('calendar');
  const [showMiniCal, setShowMiniCal] = useState(true);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  // In Charts mode the mini-cal is collapsed by default so the chart gets full
  // viewport height; user can pull it open to jump to a date.
  const [showMiniCalCharts, setShowMiniCalCharts] = useState(false);
  const [chartType, setChartType] = useState('volume');
  const [selectedMobileDay, setSelectedMobileDay] = useState(() => getLocalDateString(new Date()));
  const dayListRef = useRef(null);
  const dayRefs = useRef({});
  const weekSummaryRefs = useRef({});
  const mobileStickyHeaderRef = useRef(null);
  const selectedMobileDayRef = useRef(selectedMobileDay);
  const isAutoScrollingRef = useRef(false);
  const monthSentinelBottomRef = useRef(null);
  const monthSentinelTopRef = useRef(null);
  const [weekSummaryTab, setWeekSummaryTab] = useState('done');
  // Add completed workout sheet
  const [addCompletedDate, setAddCompletedDate] = useState(null); // Date | null

  // User profile data for TSS calculation
  const [userProfile, setUserProfile] = useState(null);

  // Drag & drop state for planned workout rescheduling
  const [draggedPw, setDraggedPw] = useState(null); // { pw, isCopy }
  const [dragOverKey, setDragOverKey] = useState(null); // date key being hovered

  // Activity detail popup state: { activity, rect }
  const [activityPopup, setActivityPopup] = useState(null);
  // Full activity modal state: { activity, plannedWorkout }
  const [activityModal, setActivityModal] = useState(null);

  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keep ref in sync so scroll spy closure stays fresh
  useEffect(() => { selectedMobileDayRef.current = selectedMobileDay; }, [selectedMobileDay]);

  // Mobile scroll spy — highlight day in mini-calendar as user scrolls
  useEffect(() => {
    if (!isMobile || mobileTab !== 'calendar') return;
    const listEl = dayListRef.current;
    if (!listEl) return;

    // Find the nearest scrollable ancestor (works for both browser <main> and NativeLayout content area)
    let scrollEl = listEl.parentElement;
    while (scrollEl && scrollEl !== document.documentElement) {
      const cs = getComputedStyle(scrollEl);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') break;
      scrollEl = scrollEl.parentElement;
    }
    const scrollTarget = (scrollEl && scrollEl !== document.documentElement) ? scrollEl : window;

    const onScroll = () => {
      if (isAutoScrollingRef.current) return;
      // Use the sticky header's bottom as a viewport-fixed reference point.
      // As the user scrolls, headerBottom stays constant but each day's top changes.
      const headerEl = mobileStickyHeaderRef.current;
      const headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
      let best = null;
      let bestScore = Infinity;
      Object.entries(dayRefs.current).forEach(([key, el]) => {
        if (!el) return;
        const elTop = el.getBoundingClientRect().top;
        // Consider days whose top is at or below the sticky header
        if (elTop <= headerBottom + 16) {
          const score = Math.abs(elTop - headerBottom);
          if (score < bestScore) { bestScore = score; best = key; }
        }
      });
      if (best && best !== selectedMobileDayRef.current) {
        setSelectedMobileDay(best);
      }
    };

    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollTarget.removeEventListener('scroll', onScroll);
  }, [isMobile, mobileTab]);

  // Scroll-to-bottom/top → advance to next/prev month using IntersectionObserver
  useEffect(() => {
    if (!isMobile || mobileTab !== 'calendar') return;
    const bottomEl = monthSentinelBottomRef.current;
    const topEl    = monthSentinelTopRef.current;
    if (!bottomEl && !topEl) return;

    let lastBottom = Date.now();
    let lastTop    = Date.now();
    const DEBOUNCE = 800; // ms between auto-advances

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || isAutoScrollingRef.current) return;
        const now = Date.now();
        if (entry.target === bottomEl && now - lastBottom > DEBOUNCE) {
          lastBottom = now;
          setAnchorDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
        }
        if (entry.target === topEl && now - lastTop > DEBOUNCE) {
          lastTop = now;
          setAnchorDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
        }
      });
    }, { threshold: 0.5 });

    if (bottomEl) obs.observe(bottomEl);
    if (topEl)    obs.observe(topEl);
    return () => obs.disconnect();
  }, [isMobile, mobileTab]);

  // Scroll to a day or week-summary element accounting for the sticky header height
  const scrollToEl = useCallback((el) => {
    if (!el) return;
    const headerEl = mobileStickyHeaderRef.current;
    // Use .bottom so safe-area-inset and any above-fold space is included
    const headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
    const elTop = el.getBoundingClientRect().top;
    const scrollEl = (() => {
      let s = el.parentElement;
      while (s && s !== document.documentElement) {
        const cs = getComputedStyle(s);
        if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') return s;
        s = s.parentElement;
      }
      return window;
    })();
    const offset = elTop - headerBottom - 8;
    scrollEl.scrollBy({ top: offset, behavior: 'smooth' });
  }, []);

  // Load user profile for FTP and threshold pace
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const response = await api.get('/user/profile');
        setUserProfile(response.data);
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    loadUserProfile();
  }, []);

  useEffect(() => {
    localStorage.setItem('calendarView_categoryFilter', categoryFilter || 'all');
  }, [categoryFilter]);

  // Save sportFilter to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('calendarView_sportFilter', sportFilter);
  }, [sportFilter]);

  // Track Alt key during drag to toggle copy mode
  useEffect(() => {
    if (!draggedPw) return;
    const handleKey = (e) => {
      setDraggedPw(prev => prev ? { ...prev, isCopy: e.altKey } : null);
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, [draggedPw != null]); // eslint-disable-line

  // Tapping the active Calendar tab in the native bottom bar fires
  // `nl-tab-reclicked`. Reset the view to today and scroll to the today card
  // — mirrors the "tap-the-tab-again to go home" pattern on iOS/Android.
  useEffect(() => {
    const onReclick = (e) => {
      if (e?.detail?.key !== 'calendar') return;
      const today = new Date();
      const todayKey = getLocalDateString(today);
      setAnchorDate(today);
      setMobileTab('calendar');
      setSelectedMobileDay(todayKey);
      // Wait for the calendar tab + month to render, then scroll the today
      // card into view (just below the sticky header).
      isAutoScrollingRef.current = true;
      const tryScroll = (attempt = 0) => {
        const el = dayRefs.current[todayKey];
        if (el) {
          scrollToEl(el);
          setTimeout(() => { isAutoScrollingRef.current = false; }, 700);
          return;
        }
        if (attempt < 10) setTimeout(() => tryScroll(attempt + 1), 50);
        else isAutoScrollingRef.current = false;
      };
      requestAnimationFrame(() => tryScroll());
    };
    window.addEventListener('nl-tab-reclicked', onReclick);
    return () => window.removeEventListener('nl-tab-reclicked', onReclick);
  }, [scrollToEl]);

  // Auto-scroll to today on first mobile-calendar render so the user lands on
  // the current day even on initial app open / tab switch. Only fires once
  // per Calendar tab visit.
  const didInitialScrollToTodayRef = useRef(false);
  useEffect(() => {
    if (!isMobile || mobileTab !== 'calendar') {
      didInitialScrollToTodayRef.current = false;
      return;
    }
    if (didInitialScrollToTodayRef.current) return;
    const todayKey = getLocalDateString(new Date());
    isAutoScrollingRef.current = true;
    const tryScroll = (attempt = 0) => {
      const el = dayRefs.current[todayKey];
      if (el) {
        scrollToEl(el);
        didInitialScrollToTodayRef.current = true;
        setTimeout(() => { isAutoScrollingRef.current = false; }, 700);
        return;
      }
      if (attempt < 15) setTimeout(() => tryScroll(attempt + 1), 60);
      else isAutoScrollingRef.current = false;
    };
    requestAnimationFrame(() => tryScroll());
  }, [isMobile, mobileTab, anchorDate, scrollToEl]);

  // Save anchorDate to localStorage when it changes (but not when initialAnchorDate prop changes)
  // Also detect month change and notify parent
  useEffect(() => {
    if (!initialAnchorDate) {
      // Only save if we're not being controlled by initialAnchorDate prop
      localStorage.setItem('calendarView_anchorDate', anchorDate.toISOString());
    }

    // Check if month changed and notify parent
    const currentMonth = `${anchorDate.getFullYear()}-${anchorDate.getMonth()}`;
    if (lastMonthRef.current !== null && lastMonthRef.current !== currentMonth && onMonthChange) {
      console.log('Month changed, calling onMonthChange:', { year: anchorDate.getFullYear(), month: anchorDate.getMonth() });
      onMonthChange({ year: anchorDate.getFullYear(), month: anchorDate.getMonth() });
    }
    lastMonthRef.current = currentMonth;
  }, [anchorDate, initialAnchorDate, onMonthChange]);

  // Notify parent about the stats period (week view or calendar month)
  useEffect(() => {
    if (!onVisiblePeriodChange) return;
    const useWeek = view === 'week';
    let periodStart;
    let periodEnd;
    let label;
    if (useWeek) {
      periodStart = startOfWeek(anchorDate);
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 6);
      periodEnd.setHours(23, 59, 59, 999);
      const endLabel = new Date(periodStart);
      endLabel.setDate(endLabel.getDate() + 6);
      const opt = { month: 'short', day: 'numeric' };
      label = `${periodStart.toLocaleDateString(undefined, opt)} – ${endLabel.toLocaleDateString(undefined, {
        ...opt,
        year: 'numeric',
      })}`;
    } else {
      periodStart = startOfMonth(anchorDate);
      periodEnd = endOfMonth(anchorDate);
      label = anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    }
    onVisiblePeriodChange({
      view: useWeek ? 'week' : 'month',
      periodStart,
      periodEnd,
      label,
    });
  }, [view, anchorDate, isMobile, onVisiblePeriodChange]);

  // Save view to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('calendarView_view', view);
  }, [view]);

  // Update anchorDate when initialAnchorDate changes (e.g., when navigating to a specific training)
  useEffect(() => {
    if (initialAnchorDate) {
      setAnchorDate(initialAnchorDate);
      // Also save to localStorage when navigating to specific training
      localStorage.setItem('calendarView_anchorDate', initialAnchorDate.toISOString());
    }
  }, [initialAnchorDate]);

  // When parent confirms selection, clear the optimistic state
  useEffect(() => {
    if (selectedActivityId) {
      setOptimisticSelectedId(null);
    }
  }, [selectedActivityId]);

  // effectiveSelectedId: use optimistic value immediately, fall back to confirmed prop
  const effectiveSelectedId = optimisticSelectedId ?? selectedActivityId;

  // Auto-expand the day containing the selected activity AND scroll it
  // into view (used when navigating from the dashboard's "open in calendar"
  // button so the user sees their activity without scrolling manually).
  useEffect(() => {
    if (effectiveSelectedId && activities.length > 0) {
      const selectedActivity = activities.find(a => {
        const id = a.id || a._id;
        return String(id) === String(effectiveSelectedId);
      });
      if (selectedActivity) {
        const activityDate = new Date(selectedActivity.date || selectedActivity.timestamp || selectedActivity.startDate || Date.now());
        const dateKey = getLocalDateString(activityDate);
        setExpandedDays(prev => new Set([...prev, dateKey]));
        // Defer to next paint so the day cell is mounted/expanded
        requestAnimationFrame(() => {
          const el = dayRefs.current[dateKey];
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      }
    }
  }, [effectiveSelectedId, activities]);

  // Track of which selected id has already triggered the auto-open below.
  // Lives up here (above plannedByDay declaration) because the effect
  // itself needs to sit after plannedByDay is defined.
  const autoOpenedIdRef = useRef(null);

  function sportToBucket(sport) {
    const s = String(sport || '').toLowerCase();
    if (s.includes('run') || s.includes('walk') || s.includes('hike')) return 'run';
    if (s.includes('swim')) return 'swim';
    if (s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual')) return 'bike';
    return 'other';
  }

  const uniqueSportBuckets = useMemo(() => {
    const set = new Set();
    activities.forEach(a => { if (a?.sport) set.add(sportToBucket(a.sport)); });
    return ['all', ...['bike', 'run', 'swim', 'other'].filter(b => set.has(b))];
  }, [activities]);

  // Optimistic handler — mark selected immediately, then call parent
  const handleRepeatWorkout = useCallback((pw, weeks) => {
    if (!onCopyPlannedWorkout || !pw.date) return;
    const base = new Date(pw.date + 'T12:00:00');
    for (let i = 1; i <= weeks; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + 7 * i);
      const dateStr = d.toISOString().slice(0, 10);
      onCopyPlannedWorkout(pw, dateStr);
    }
  }, [onCopyPlannedWorkout]);

  const handleSelectActivity = (a) => {
    const id = a.id || a._id;
    if (id) setOptimisticSelectedId(String(id));
    if (onSelectActivity) onSelectActivity(a);
  };

  // Activity click handler: show popup and also select
  // `rectOrEvent` can be a DOMRect (from WeekActivityCard) or a React event (from month-view inline buttons)
  const handleActivityClick = (a, rectOrEvent) => {
    if (onActivityClick) {
      // Parent wants to handle it — pass element or null
      const el = rectOrEvent instanceof Element ? rectOrEvent : null;
      onActivityClick(a, el);
    } else {
      // Both desktop and mobile open the same ActivityFullModal so the
      // experience matches WeeklyCalendar (consistent across surfaces).
      const actDate = a.date || a.timestamp || a.startDate || a.start_time;
      const dayKey = actDate ? getLocalDateString(new Date(actDate)) : null;
      const dayPws = dayKey ? (plannedByDay.get(dayKey) || []) : [];
      const matchPw = dayPws.find(pw => sportMatches(pw.sport, a.sport || a.type || '')) || null;
      setActivityModal({ activity: a, plannedWorkout: matchPw });
    }
  };

  const filteredActivities = useMemo(() => {
    let list = activities;
    if (sportFilter !== 'all') list = list.filter(a => sportToBucket(a.sport) === sportFilter);
    if (categoryFilter && categoryFilter !== 'all') {
      list = list.filter(a => a.category === categoryFilter);
    }
    return list;
  }, [activities, sportFilter, categoryFilter]);

  const activitiesByDay = useMemo(() => {
    const map = new Map();
    filteredActivities.forEach(act => {
      const dateValue = act.date || act.timestamp || act.startDate || act.start_time;
      if (!dateValue) {
        console.warn('Activity missing date:', act);
        return;
      }
      const d = new Date(dateValue);
      if (isNaN(d.getTime())) {
        console.warn('Invalid date for activity:', { act, dateValue, parsed: d });
        return;
      }
      // Use local date string instead of ISO to avoid timezone offset issues
      const key = getLocalDateString(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(act);
    });
    // Sort each day's activities chronologically (earliest first) so that the
    // pairing logic always claims the FIRST activity of the day for that sport,
    // matching the user's expectation. Without this the API's newest-first order
    // would cause the LATEST same-sport activity to be paired instead.
    map.forEach(arr =>
      arr.sort((a, b) => {
        const ta = new Date(a.date || a.timestamp || a.startDate || a.start_time || 0).getTime();
        const tb = new Date(b.date || b.timestamp || b.startDate || b.start_time || 0).getTime();
        return ta - tb;
      })
    );
    return map;
  }, [filteredActivities]);

  // Map planned workouts by local date string. Honours the same category
  // filter as activities — picking a category hides every planned workout
  // that isn't tagged with it.
  const plannedByDay = useMemo(() => {
    const map = new Map();
    const filteredPlans = categoryFilter && categoryFilter !== 'all'
      ? plannedWorkouts.filter(pw => pw.category === categoryFilter)
      : plannedWorkouts;
    filteredPlans.forEach(pw => {
      if (!pw.date) return;
      // date is stored as YYYY-MM-DD string — use as-is (no timezone conversion needed)
      const key = String(pw.date).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(pw);
    });
    return map;
  }, [plannedWorkouts, categoryFilter]);

  // Deep-link mode: when called via push-notification deep-link the parent
  // sets `autoOpenSelectedActivity` so we open ActivityFullModal the moment
  // the activity is found in the loaded list. Only fires once per selected
  // id so navigating elsewhere afterwards doesn't reopen the modal.
  useEffect(() => {
    if (!autoOpenSelectedActivity) return;
    if (!effectiveSelectedId || activities.length === 0) return;
    if (autoOpenedIdRef.current === effectiveSelectedId) return;
    const match = activities.find(a => {
      const id = a.id || a._id;
      return String(id) === String(effectiveSelectedId);
    });
    if (!match) return;
    const actDate = match.date || match.timestamp || match.startDate || match.start_time;
    const dayKey  = actDate ? getLocalDateString(new Date(actDate)) : null;
    const dayPws  = dayKey ? (plannedByDay.get(dayKey) || []) : [];
    const matchPw = dayPws.find(pw => sportMatches(pw.sport, match.sport || match.type || '')) || null;
    setActivityModal({ activity: match, plannedWorkout: matchPw });
    autoOpenedIdRef.current = effectiveSelectedId;
  }, [autoOpenSelectedActivity, effectiveSelectedId, activities, plannedByDay]);

  // Auto-rename activities when they get paired with a planned workout
  const autoRenamedRef = useRef(new Set()); // track activity IDs already renamed this session
  const autoCategorizedRef = useRef(new Set()); // and which ones we've also tagged
  useEffect(() => {
    if (!plannedWorkouts.length || !filteredActivities.length) return;
    plannedByDay.forEach((pws, dateKey) => {
      const acts = activitiesByDay.get(dateKey) || [];
      if (!acts.length) return;
      const { pwToAct } = pairPlannedWithActivities(pws, acts);
      pwToAct.forEach((act, pwId) => {
        const pw = pws.find(p => String(p._id) === pwId);
        if (!pw) return;
        const actId = String(act.id || act._id || '');
        if (!actId) return;

        // ── 1. Title auto-rename (existing behaviour) ──
        const needsTitle = !!pw.title && !act.titleManual && !autoRenamedRef.current.has(actId);
        // ── 2. Category propagation (new) — copy planned category to the
        //      paired activity once, only when the activity has no category
        //      set yet. The flag is per-session so a manual unset isn't
        //      auto-re-applied.
        const needsCategory = !!pw.category && !act.category && !autoCategorizedRef.current.has(actId);

        if (!needsTitle && !needsCategory) return;
        if (needsTitle) autoRenamedRef.current.add(actId);
        if (needsCategory) autoCategorizedRef.current.add(actId);
        const newTitle = needsTitle ? pw.title : undefined;
        const newCategory = needsCategory ? pw.category : undefined;
        // Fire-and-forget API patch
        (async () => {
          try {
            if (act.type === 'strava' || act.stravaId) {
              const { updateStravaActivity } = await import('../../services/api.js');
              const rawId = String(act.stravaId || act.id || '').replace(/^strava-/, '');
              const payload = {};
              if (newTitle != null) payload.title = newTitle;
              if (newCategory != null) payload.category = newCategory;
              await updateStravaActivity(rawId, payload);
            } else if (act.type === 'fit' || act._id) {
              const { updateFitTraining } = await import('../../services/api.js');
              const rawId = String(act._id || act.id || '').replace(/^fit-/, '');
              const payload = {};
              if (newTitle != null) payload.titleManual = newTitle;
              if (newCategory != null) payload.category = newCategory;
              await updateFitTraining(rawId, payload);
            }
            // Notify the in-memory list + emit the standard events so every
            // dashboard / list re-renders with the new fields without a refetch.
            if (onActivityUpdate) {
              onActivityUpdate({
                ...act,
                ...(newTitle != null ? { titleManual: newTitle, title: newTitle } : {}),
                ...(newCategory != null ? { category: newCategory } : {}),
              });
            }
            try {
              const evtId = String(act.id || act._id || '');
              if (newTitle != null) window.dispatchEvent(new CustomEvent('activityTitleUpdated', { detail: { id: evtId, title: newTitle } }));
              if (newCategory != null) window.dispatchEvent(new CustomEvent('activityCategoryUpdated', { detail: { id: evtId, category: newCategory } }));
            } catch { /* ignore */ }
          } catch {
            // Non-critical — silently ignore errors but allow retry next render
            if (needsTitle) autoRenamedRef.current.delete(actId);
            if (needsCategory) autoCategorizedRef.current.delete(actId);
          }
        })();
      });
    });
  }, [activitiesByDay, plannedByDay, filteredActivities, plannedWorkouts, onActivityUpdate]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    if (view === 'week' && !isMobile) {
      const start = startOfWeek(anchorDate);
      return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
    }
    const start = startOfWeek(startOfMonth(anchorDate));
    return Array.from({ length: 42 }).map((_, i) => addDays(start, i));
  }, [view, anchorDate, isMobile]);

  // Fullscreen: 16 weeks starting 2 weeks before anchor
  const fullscreenWeeks = useMemo(() => {
    if (isMobile) return [];
    const anchorWeekStart = startOfWeek(anchorDate);
    const start = addDays(anchorWeekStart, -6 * 7); // 6 weeks back from anchor
    return Array.from({ length: 24 }, (_, i) => {   // 24 total = 6 back + 18 forward
      const wStart = addDays(start, i * 7);
      return Array.from({ length: 7 }, (_, j) => addDays(wStart, j));
    });
  }, [anchorDate, isMobile]);

  // Mobile: 10 weeks starting 1 week before anchor
  const mobileWeeks = useMemo(() => {
    if (!isMobile) return [];
    const anchorWeekStart = startOfWeek(anchorDate);
    const start = addDays(anchorWeekStart, -1 * 7);
    return Array.from({ length: 10 }, (_, i) => {
      const wStart = addDays(start, i * 7);
      return Array.from({ length: 7 }, (_, j) => addDays(wStart, j));
    });
  }, [anchorDate, isMobile]);

  const prev = () => {
    setDirection(-1);
    if (isFullscreen) {
      setAnchorDate(d => addDays(d, -4 * 7)); // jump 4 weeks back in fullscreen
    } else if (isMobile && view === 'week') {
      setAnchorDate(d => addDays(d, -7));
    } else if (view === 'week' && !isMobile) {
      setAnchorDate(d => addDays(d, -7));
    } else {
      setAnchorDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1));
    }
  };
  const next = () => {
    setDirection(1);
    if (isFullscreen) {
      setAnchorDate(d => addDays(d, 4 * 7)); // jump 4 weeks forward in fullscreen
    } else if (isMobile && view === 'week') {
      setAnchorDate(d => addDays(d, 7));
    } else if (view === 'week' && !isMobile) {
      setAnchorDate(d => addDays(d, 7));
    } else {
      setAnchorDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1));
    }
  };
  const today = () => setAnchorDate(new Date());

  // Swipe left/right on the mini-calendar grid to navigate months
  const calSwipeTouchRef = useRef({ x: 0, y: 0 });
  const handleCalSwipeStart = (e) => {
    const t = e.touches[0];
    calSwipeTouchRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleCalSwipeEnd = (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - calSwipeTouchRef.current.x;
    const dy = t.clientY - calSwipeTouchRef.current.y;
    // Only fire if horizontal movement dominates and exceeds 40px threshold
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next(); else prev();
    }
  };

  // Fullscreen infinite scroll: restore scroll position after prepending past weeks
  useLayoutEffect(() => {
    if (pendingScrollRestore.current && fullscreenScrollRef.current) {
      const { prevScrollHeight } = pendingScrollRestore.current;
      const newScrollHeight = fullscreenScrollRef.current.scrollHeight;
      fullscreenScrollRef.current.scrollTop += (newScrollHeight - prevScrollHeight);
      pendingScrollRestore.current = null;
    }
  }, [anchorDate]);

  // Scroll handler for fullscreen: auto-extend when near top or bottom
  const handleFullscreenScroll = useCallback(() => {
    if (!fullscreenScrollRef.current || pendingScrollRestore.current) return;
    const { scrollTop, scrollHeight, clientHeight } = fullscreenScrollRef.current;

    if (scrollTop < 400) {
      // Near top → prepend 4 past weeks, then restore scroll position
      pendingScrollRestore.current = { prevScrollHeight: scrollHeight };
      setAnchorDate(d => addDays(d, -4 * 7));
    } else if (scrollTop + clientHeight > scrollHeight - 400) {
      // Near bottom → append 4 future weeks (no position restore needed)
      setAnchorDate(d => addDays(d, 4 * 7));
    }
  }, []);

  const [direction, setDirection] = useState(0); // -1 = going back, 1 = going forward
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Weekly summary (last 4 weeks)
  // Weekly summary only for weeks currently visible in the calendar grid
  // In week view, show only the current week
  const weeklySummary = useMemo(() => {
    if (!days || days.length === 0) return [];

    let visibleWeekKeys;
    if (view === 'week') {
      const currentWeekStart = startOfWeek(anchorDate);
      visibleWeekKeys = new Set([currentWeekStart.toISOString().slice(0,10)]);
    } else {
      visibleWeekKeys = new Set(days.map(d => startOfWeek(d).toISOString().slice(0,10)));
      fullscreenWeeks.forEach(wk => visibleWeekKeys.add(startOfWeek(wk[0]).toISOString().slice(0,10)));
      mobileWeeks.forEach(wk => visibleWeekKeys.add(startOfWeek(wk[0]).toISOString().slice(0,10)));
    }

    // Get FTP and threshold pace from user profile
    const ftp = userProfile?.powerZones?.cycling?.lt2 ||
                userProfile?.powerZones?.cycling?.zone5?.min ||
                250; // Default estimate
    const thresholdPace = userProfile?.runningZones?.lt2 ||
                          userProfile?.powerZones?.running?.lt2 ||
                          null;
    const thresholdSwimPace = userProfile?.powerZones?.swimming?.lt2 || null; // Threshold pace in seconds per 100m

    const summary = filteredActivities.reduce((acc, act) => {
      const actDate = act.date ? new Date(act.date) : null;
      if (!actDate || isNaN(actDate.getTime())) return acc;
      const weekStart = startOfWeek(actDate);
      const key = weekStart.toISOString().slice(0,10);
      if (!visibleWeekKeys.has(key)) return acc; // skip weeks not visible now

      if (!acc[key]) {
        acc[key] = {
          weekStart,
          totalSeconds: 0,
          runSeconds: 0,
          bikeSeconds: 0,
          swimSeconds: 0,
          strengthSeconds: 0,
          distanceRun: 0,
          distanceBike: 0,
          distanceSwim: 0,
          tssRun: 0,
          tssBike: 0,
          tssSwim: 0,
          tssStrength: 0,
          totalTSS: 0,
          hasTss: false
        };
      }

      const entry = acc[key];
      const sport = (act.sport || act.sport_type || act.type || '').toLowerCase();
      const duration = Number(act.totalTimerTime || act.moving_time || act.movingTime || act.totalElapsedTime || act.elapsedTime || act.duration || 0);
      const distance = Number(act.distance || 0);

      // Calculate TSS for this activity
      let tssVal = Number(act.tss || act.TSS || act.totalTSS || 0);

      // If TSS is not available, calculate it based on sport type
      if ((!tssVal || tssVal === 0) && duration > 0) {
        if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike')) {
          // Bike TSS: TSS = (seconds * NP^2) / (FTP^2 * 3600) * 100
          const avgPower = Number(act.avgPower || 0);
          if (avgPower > 0 && ftp > 0) {
            const np = avgPower; // Using avgPower as NP approximation
            tssVal = Math.round((duration * Math.pow(np, 2)) / (Math.pow(ftp, 2) * 3600) * 100);
          }
        } else if (sport.includes('run')) {
          // Running TSS: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
          const avgSpeed = Number(act.avgSpeed || 0); // m/s
          if (avgSpeed > 0) {
            const avgPaceSeconds = Math.round(1000 / avgSpeed); // seconds per km
            let referencePace = thresholdPace;
            // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
            if (!referencePace || referencePace <= 0) {
              referencePace = avgPaceSeconds;
            }
            // Faster pace (lower seconds) = higher intensity = higher TSS
            const intensityRatio = referencePace / avgPaceSeconds; // > 1 if faster than reference
            tssVal = Math.round((duration * Math.pow(intensityRatio, 2)) / 3600 * 100);
          }
        } else if (sport.includes('swim')) {
          // Swimming TSS: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
          // Swimming pace is per 100m (not per km)
          const avgSpeed = Number(act.avgSpeed || 0); // m/s
          if (avgSpeed > 0) {
            const avgPaceSeconds = Math.round(100 / avgSpeed); // seconds per 100m
            let referencePace = thresholdSwimPace;
            // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
            if (!referencePace || referencePace <= 0) {
              referencePace = avgPaceSeconds;
            }
            // Faster pace (lower seconds) = higher intensity = higher TSS
            const intensityRatio = referencePace / avgPaceSeconds; // > 1 if faster than reference
            tssVal = Math.round((duration * Math.pow(intensityRatio, 2)) / 3600 * 100);
          }
        }
      }

      entry.totalSeconds += duration;
      if (sport.includes('run')) {
        entry.runSeconds += duration;
        entry.distanceRun += distance;
        if (!isNaN(tssVal) && tssVal > 0) {
          entry.tssRun += tssVal;
          entry.totalTSS += tssVal;
        }
      } else if (sport.includes('swim')) {
        entry.swimSeconds += duration;
        entry.distanceSwim += distance;
        if (!isNaN(tssVal) && tssVal > 0) {
          entry.tssSwim += tssVal;
          entry.totalTSS += tssVal;
        }
      } else if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike')) {
        entry.bikeSeconds += duration;
        entry.distanceBike += distance;
        if (!isNaN(tssVal) && tssVal > 0) {
          entry.tssBike += tssVal;
          entry.totalTSS += tssVal;
        }
      } else if (
        sport.includes('strength') || sport.includes('gym') || sport.includes('weight') ||
        sport.includes('crossfit') || sport.includes('workout') || sport.includes('yoga') ||
        sport.includes('pilates') || sport.includes('hiit') || sport.includes('elliptical') ||
        sport.includes('rowing') || sport.includes('alpineski') || sport.includes('nordicski') ||
        sport.includes('iceskate') || sport.includes('inlineskate') || sport.includes('skateboard') ||
        sport.includes('soccer') || sport.includes('football') || sport.includes('basketball') ||
        sport.includes('tennis') || sport.includes('volleyball') || sport.includes('handball') ||
        sport.includes('boxing') || sport.includes('martial') || sport.includes('climbing')
      ) {
        entry.strengthSeconds += duration;
        if (!isNaN(tssVal) && tssVal > 0) {
          entry.tssStrength += tssVal;
          entry.totalTSS += tssVal;
        }
      }
      if (!isNaN(tssVal) && tssVal > 0) {
        entry.hasTss = true;
      }
      return acc;
    }, {});

    // Planned totals per week
    const plannedByWeek = {};
    plannedWorkouts.forEach(pw => {
      if (!pw.date) return;
      const d = new Date(pw.date);
      if (isNaN(d.getTime())) return;
      const weekStart = startOfWeek(d);
      const key = weekStart.toISOString().slice(0, 10);
      // Only count weeks the calendar is currently rendering — keeps the
      // summary fast and matches what the user can see.
      if (!visibleWeekKeys.has(key)) return;
      if (!plannedByWeek[key]) plannedByWeek[key] = { weekStart, plannedSeconds: 0, plannedTSS: 0 };
      const secs = planStepTotalSecs(pw.steps) || pw.plannedDuration || 0;
      plannedByWeek[key].plannedSeconds += secs;
      plannedByWeek[key].plannedTSS += Number(pw.targetTss || 0);
    });

    // Seed empty summary entries for visible weeks that have ONLY planned
    // workouts (no activities yet). Without this, future weeks render no
    // weekly-summary column at all even when plans exist.
    Object.keys(plannedByWeek).forEach(key => {
      if (!summary[key]) {
        summary[key] = {
          weekStart: plannedByWeek[key].weekStart,
          totalSeconds: 0,
          runSeconds: 0, bikeSeconds: 0, swimSeconds: 0, strengthSeconds: 0,
          distanceRun: 0, distanceBike: 0, distanceSwim: 0,
          tssRun: 0, tssBike: 0, tssSwim: 0, tssStrength: 0,
          totalTSS: 0, hasTss: false,
        };
      }
    });

    const sorted = Object.values(summary)
      .sort((a, b) => b.weekStart - a.weekStart);

    // Add comparison with previous week + planned totals
    return sorted.map((week, index) => {
      const prevWeek = index < sorted.length - 1 ? sorted[index + 1] : null;
      let volumeChange = null;
      if (prevWeek) {
        if (week.totalSeconds > prevWeek.totalSeconds) volumeChange = 'up';
        else if (week.totalSeconds < prevWeek.totalSeconds) volumeChange = 'down';
        else volumeChange = 'same';
      }
      const wk = week.weekStart.toISOString().slice(0, 10);
      return {
        ...week,
        volumeChange,
        prevWeekTotalSeconds: prevWeek?.totalSeconds || null,
        plannedSeconds: plannedByWeek[wk]?.plannedSeconds || 0,
        plannedTSS: plannedByWeek[wk]?.plannedTSS || 0,
      };
    });
  }, [filteredActivities, plannedWorkouts, days, fullscreenWeeks, mobileWeeks, userProfile, view, anchorDate]);

  const formatHours = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0h';
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  const formatKm = (meters) => {
    if (!meters || isNaN(meters)) return '0 km';
    if (user) {
      return formatDistanceForUser(meters, user);
    }
    // Fallback to metric
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const calendarContent = (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className={`${isFullscreen ? 'fixed inset-0 z-[9998] bg-white flex flex-col p-4 md:p-5' : (isMobile ? 'bg-white' : 'bg-white rounded-2xl border border-gray-200 shadow-sm p-4 md:p-5 mb-4 md:mb-6')} ${isMobile ? '' : 'overflow-hidden'}`}>
      {/* Header — desktop only */}
      {!isMobile && (
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-2 md:gap-3 mb-3 md:mb-4">
        <div className="flex items-center gap-1.5 md:gap-2">
          <button
            onClick={prev}
            className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm transition-colors flex items-center justify-center"
            aria-label="Previous"
          >
            <ChevronLeftIcon className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button
            onClick={today}
            className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm transition-colors text-xs md:text-sm"
          >
            Today
          </button>
          <button
            onClick={next}
            className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm transition-colors flex items-center justify-center"
            aria-label="Next"
          >
            <ChevronRightIcon className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
        <div className="text-sm md:text-base lg:text-lg font-semibold text-gray-900">
          {isFullscreen
            ? (() => {
                const ws = startOfWeek(anchorDate);
                const we = addDays(addDays(ws, -2*7), 16*7 - 1);
                return `${ws.toLocaleDateString(undefined,{month:'short',year:'numeric'})} – ${we.toLocaleDateString(undefined,{month:'short',year:'numeric'})}`;
              })()
            : anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })
          }
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Category filter */}
          <CalendarCategoryFilter value={categoryFilter} onChange={setCategoryFilter} activities={activities} />
          {/* Sport filter pills */}
          <div className="flex items-center gap-1">
            {uniqueSportBuckets.map(bucket => {
              const isActive = sportFilter === bucket;
              const iconMap = { bike: '/icon/bike.svg', run: '/icon/run.svg', swim: '/icon/swim.svg' };
              const labelMap = { all: 'All', bike: 'Bike', run: 'Run', swim: 'Swim', other: 'Other' };
              const icon = iconMap[bucket];
              return (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => setSportFilter(bucket)}
                  className={`inline-flex items-center gap-1 px-2 md:px-2.5 py-1 md:py-1.5 rounded-lg md:rounded-xl text-xs font-semibold border transition-all ${
                    isActive
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {icon ? (
                    <img
                      src={icon}
                      alt={bucket}
                      className={`w-3 h-3 md:w-3.5 md:h-3.5 object-contain ${isActive ? 'invert' : ''}`}
                    />
                  ) : null}
                  <span>{labelMap[bucket]}</span>
                </button>
              );
            })}
          </div>
          {!isFullscreen && (
            <button
              onClick={() => setView('week')}
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border shadow-sm transition-colors text-xs md:text-sm ${view==='week'?'bg-primary text-white border-primary hover:bg-primary-dark':'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`}
            >
              Week
            </button>
          )}
          {!isFullscreen && (
            <button
              onClick={() => setView('month')}
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border shadow-sm transition-colors text-xs md:text-sm ${view==='month'?'bg-primary text-white border-primary hover:bg-primary-dark':'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`}
            >
              Month
            </button>
          )}
          <button
            onClick={() => setIsFullscreen(v => !v)}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="p-1.5 md:p-2 rounded-lg md:rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 shadow-sm transition-colors"
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
            )}
          </button>
        </div>
      </div>
      )}

      {/* Mobile: native app-style layout — mini calendar + scrollable day list */}
      {isMobile ? (
        <div>
          {/* ── Sticky header: tab bar + calendar/charts nav ── */}
          <div ref={mobileStickyHeaderRef} className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
            {/* Tab switcher */}
            <div className="flex bg-gray-100 rounded-xl p-0.5 mx-3 mt-2 mb-2">
              {[['calendar', 'Calendar'], ['charts', 'Charts']].map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all touch-manipulation ${mobileTab === tab ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >{label}</button>
              ))}
            </div>

            {mobileTab === 'calendar' && (<>
              {/* ── Month nav + mini-cal toggle ── */}
              <div className="flex items-center justify-between px-3 mb-1">
                <button onClick={prev} className="p-1.5 rounded-full active:bg-gray-100 touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                  <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
                </button>
                <button
                  onClick={() => { setPickerYear(anchorDate.getFullYear()); setShowMonthPicker(true); }}
                  className="flex items-center gap-1 text-sm font-bold text-primary uppercase tracking-wide touch-manipulation active:opacity-70"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                  <ChevronDownIcon className="w-3.5 h-3.5 text-primary/60" />
                </button>
                <div className="flex items-center gap-1">
                  <button onClick={next} className="p-1.5 rounded-full active:bg-gray-100 touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                    <ChevronRightIcon className="w-5 h-5 text-gray-600" />
                  </button>
                  <button
                    onClick={() => setShowMiniCal(v => !v)}
                    className="p-1.5 rounded-full active:bg-gray-100 touch-manipulation transition-transform"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    title={showMiniCal ? 'Hide calendar' : 'Show calendar'}
                  >
                    <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showMiniCal ? '' : 'rotate-180'}`} />
                  </button>
                </div>
              </div>

              {/* ── Mini month grid (collapsible) ── */}
              {showMiniCal && (
                <div className="px-3 pb-2"
                  onTouchStart={handleCalSwipeStart}
                  onTouchEnd={handleCalSwipeEnd}
                >
                  <div className="grid grid-cols-7 mb-0.5">
                    {['M','T','W','T','F','S','S'].map((d, i) => (
                      <div key={i} className="text-[10px] font-bold text-gray-400 text-center py-0.5">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {days.map(dayDate => {
                      const key = getLocalDateString(dayDate);
                      const isCurrentMonth = dayDate.getMonth() === anchorDate.getMonth();
                      const isToday = isSameDay(dayDate, new Date());
                      const isSelected = key === selectedMobileDay;
                      const acts = activitiesByDay.get(key) || [];
                      const planned = plannedByDay.get(key) || [];
                      const dots = [...new Set(acts.map(a => {
                        const s = (a.sport || '').toLowerCase();
                        if (s.includes('run') || s.includes('walk')) return 'run';
                        if (s.includes('ride') || s.includes('bike') || s.includes('cycle') || s.includes('virtual')) return 'bike';
                        if (s.includes('swim')) return 'swim';
                        return 'other';
                      }))].slice(0, 3);
                      const hasPlanOnly = planned.length > 0 && acts.length === 0;
                      const dotColors = { run: '#f97316', bike: '#3b82f6', swim: '#06b6d4', other: '#8b5cf6' };
                      const isSunday = dayDate.getDay() === 0;
                      const weekKey = startOfWeek(dayDate).toISOString().slice(0, 10);
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            // If tapping a day from an adjacent month, navigate there first
                            if (!isCurrentMonth) {
                              setAnchorDate(new Date(dayDate.getFullYear(), dayDate.getMonth(), 1));
                            }
                            setSelectedMobileDay(key);
                            isAutoScrollingRef.current = true;
                            setTimeout(() => {
                              // On Sunday click, scroll to the weekly summary card
                              const targetEl = (isSunday && weekSummaryRefs.current[weekKey])
                                ? weekSummaryRefs.current[weekKey]
                                : dayRefs.current[key];
                              scrollToEl(targetEl);
                              setTimeout(() => { isAutoScrollingRef.current = false; }, 700);
                            }, isCurrentMonth ? 50 : 150); // extra delay for month change to render
                          }}
                          className="flex flex-col items-center py-0.5 touch-manipulation"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          <span className={`w-7 h-7 flex items-center justify-center text-xs font-semibold rounded-full transition-all ${
                            isToday && isSelected ? 'bg-primary text-white ring-2 ring-primary/30 ring-offset-1' :
                            isToday ? 'bg-primary text-white' :
                            isSelected ? 'bg-gray-200 text-gray-900' :
                            isCurrentMonth ? 'text-gray-700' : 'text-gray-400'
                          }`}>
                            {dayDate.getDate()}
                          </span>
                          <div className="flex gap-0.5 h-1.5 mt-0.5 items-center">
                            {hasPlanOnly && <span className="w-1 h-1 rounded-full bg-gray-300" />}
                            {dots.map((sport, si) => (
                              <span key={si} className="w-1 h-1 rounded-full" style={{ backgroundColor: dotColors[sport] }} />
                            ))}
                            {/* Violet dot on Sundays indicates weekly summary */}
                            {isSunday && isCurrentMonth && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#8b5cf6' }} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>)}

            {mobileTab === 'charts' && (<>
              {/* ── Month nav + mini-cal toggle (matches Calendar tab) ── */}
              <div className="flex items-center justify-between px-3 mb-1">
                <button onClick={prev} className="p-1.5 rounded-full active:bg-gray-100 touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                  <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
                </button>
                <button
                  onClick={() => { setPickerYear(anchorDate.getFullYear()); setShowMonthPicker(true); }}
                  className="flex items-center gap-1 text-sm font-bold text-primary uppercase tracking-wide touch-manipulation active:opacity-70"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                  <ChevronDownIcon className="w-3.5 h-3.5 text-primary/60" />
                </button>
                <div className="flex items-center gap-1">
                  <button onClick={next} className="p-1.5 rounded-full active:bg-gray-100 touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                    <ChevronRightIcon className="w-5 h-5 text-gray-600" />
                  </button>
                  <button
                    onClick={() => setShowMiniCalCharts(v => !v)}
                    className="p-1.5 rounded-full active:bg-gray-100 touch-manipulation transition-transform"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    title={showMiniCalCharts ? 'Hide calendar' : 'Show calendar'}
                  >
                    <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showMiniCalCharts ? '' : 'rotate-180'}`} />
                  </button>
                </div>
              </div>

              {/* ── Mini month grid (collapsed by default in Charts) ── */}
              {showMiniCalCharts && (
                <div className="px-3 pb-2"
                  onTouchStart={handleCalSwipeStart}
                  onTouchEnd={handleCalSwipeEnd}
                >
                  <div className="grid grid-cols-7 mb-0.5">
                    {['M','T','W','T','F','S','S'].map((d, i) => (
                      <div key={i} className="text-[10px] font-bold text-gray-400 text-center py-0.5">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {days.map(dayDate => {
                      const key = getLocalDateString(dayDate);
                      const isCurrentMonth = dayDate.getMonth() === anchorDate.getMonth();
                      const isToday = isSameDay(dayDate, new Date());
                      const acts = activitiesByDay.get(key) || [];
                      const planned = plannedByDay.get(key) || [];
                      const dots = [...new Set(acts.map(a => {
                        const s = (a.sport || '').toLowerCase();
                        if (s.includes('run') || s.includes('walk')) return 'run';
                        if (s.includes('ride') || s.includes('bike') || s.includes('cycle') || s.includes('virtual')) return 'bike';
                        if (s.includes('swim')) return 'swim';
                        return 'other';
                      }))].slice(0, 3);
                      const hasPlanOnly = planned.length > 0 && acts.length === 0;
                      const dotColors = { run: '#f97316', bike: '#3b82f6', swim: '#06b6d4', other: '#8b5cf6' };
                      const isSunday = dayDate.getDay() === 0;
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            // Tapping a day in Charts mode jumps back to Calendar view.
                            // If the day is from an adjacent month, navigate there first.
                            const targetMonth = new Date(dayDate.getFullYear(), dayDate.getMonth(), 1);
                            setAnchorDate(targetMonth);
                            setSelectedMobileDay(key);
                            setMobileTab('calendar');
                            setShowMiniCal(true);
                            isAutoScrollingRef.current = true;
                            setTimeout(() => {
                              const el = dayRefs.current[key];
                              if (el) scrollToEl(el);
                              setTimeout(() => { isAutoScrollingRef.current = false; }, 700);
                            }, 150);
                          }}
                          className="flex flex-col items-center py-0.5 touch-manipulation"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          <span className={`w-7 h-7 flex items-center justify-center text-xs font-semibold rounded-full transition-all ${
                            isToday ? 'bg-primary text-white' :
                            isCurrentMonth ? 'text-gray-700' : 'text-gray-400'
                          }`}>
                            {dayDate.getDate()}
                          </span>
                          <div className="flex gap-0.5 h-1.5 mt-0.5 items-center">
                            {hasPlanOnly && <span className="w-1 h-1 rounded-full bg-gray-300" />}
                            {dots.map((sport, si) => (
                              <span key={si} className="w-1 h-1 rounded-full" style={{ backgroundColor: dotColors[sport] }} />
                            ))}
                            {isSunday && isCurrentMonth && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#8b5cf6' }} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Sub-controls: week/month view + chart type ── */}
              <div className="pb-2">
                <div className="flex items-center justify-center px-3 mb-2">
                  <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                    {[['month', 'Month'], ['week', 'Week']].map(([v, lbl]) => (
                      <button key={v} onClick={() => setView(v)}
                        className={`px-3 py-0.5 text-xs font-semibold rounded-md transition-all touch-manipulation ${view === v ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >{lbl}</button>
                    ))}
                  </div>
                  {view === 'week' && (
                    <span className="ml-2 text-[11px] font-medium text-gray-500">
                      {`${startOfWeek(anchorDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(startOfWeek(anchorDate), 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
                    </span>
                  )}
                </div>
                {/* Chart type switcher */}
                {!mobileChartsContent && (
                  <div className="flex gap-1.5 px-3">
                    {[['volume', 'Volume'], ['tss', 'TSS'], ['sports', 'Sports']].map(([type, label]) => (
                      <button
                        key={type}
                        onClick={() => setChartType(type)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all touch-manipulation ${chartType === type ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-500 border-gray-200 active:bg-gray-50'}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >{label}</button>
                    ))}
                  </div>
                )}
              </div>
            </>)}
          </div>

          {/* ── Calendar tab: day list (page scrolls) ── */}
          {mobileTab === 'calendar' && (
            <div ref={dayListRef} className="px-3 pt-2">
              {days.filter(d => d.getMonth() === anchorDate.getMonth()).map(dayDate => {
                const key = getLocalDateString(dayDate);
                const acts = activitiesByDay.get(key) || [];
                const planned = plannedByDay.get(key) || [];
                const isToday = isSameDay(dayDate, new Date());
                const isSelected = key === selectedMobileDay;
                const hasItems = acts.length > 0 || planned.length > 0;
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const isSunday = dayDate.getDay() === 0;
                const weekKey = startOfWeek(dayDate).toISOString().slice(0, 10);
                const wkSummary = isSunday ? weeklySummary.find(w => w.weekStart.toISOString().slice(0, 10) === weekKey) : null;
                return (
                  <React.Fragment key={key}>
                  <div
                    ref={el => { dayRefs.current[key] = el; }}
                    className={`mb-1.5 rounded-xl border overflow-hidden ${isSelected ? 'border-primary/40 shadow-sm' : isToday ? 'border-primary/20' : 'border-gray-100'}`}
                    onClick={() => setSelectedMobileDay(key)}
                  >
                    {/* Day header */}
                    <div className={`flex items-center justify-between px-3 py-2 ${isToday ? 'bg-primary/5' : 'bg-gray-50/80'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-gray-400'}`}>{dayNames[dayDate.getDay()]}</span>
                        <span className={`text-base font-extrabold ${isToday ? 'text-primary' : 'text-gray-800'}`}>{dayDate.getDate()}</span>
                        {isToday && <span className="text-[9px] bg-primary text-white px-1.5 py-0.5 rounded-full font-bold">Today</span>}
                      </div>
                      {(onPlanWorkout || onAddCompletedWorkout) && (
                        onAddCompletedWorkout ? (
                          /* Show a tiny dropdown when "log completed" is available */
                          <div className="relative" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                // If only one action, skip menu — but we always have both here
                                setAddCompletedDate(dayDate);
                              }}
                              className="w-6 h-6 flex items-center justify-center text-gray-300 active:text-primary text-lg leading-none touch-manipulation"
                              style={{ WebkitTapHighlightColor: 'transparent' }}
                            >+</button>
                          </div>
                        ) : (
                        <button
                          onClick={e => { e.stopPropagation(); onPlanWorkout(dayDate); }}
                          className="w-6 h-6 flex items-center justify-center text-gray-300 active:text-primary text-lg leading-none touch-manipulation"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >+</button>
                        )
                      )}
                    </div>
                    {/* Content */}
                    {hasItems ? (
                      <div className="px-2 pb-1.5 pt-1 flex flex-col gap-1">
                        {(() => {
                          // Use the shared pairPlannedWithActivities() so we get:
                          // 1) completedTrainingId respected (explicit links win)
                          // 2) greedy first-match on sport for the rest
                          // 3) consistent key logic with the rest of the calendar
                          const { pwToAct, claimed } = pairPlannedWithActivities(planned, acts);
                          const pairs = planned.map(pw => ({ pw, act: pwToAct.get(String(pw._id)) || null }));
                          const unmatchedActs = acts.filter(a => !claimed.has(String(a?.id ?? a?._id ?? '')));

                          return (
                            <>
                              {pairs.map(({ pw, act }, pi) => {
                                const pwSport = (pw.sport || 'bike').toLowerCase();
                                const planColor = SPORT_PLAN_COLORS[pwSport] || '#767EB5';
                                // Fall back to plannedDuration when no structured steps exist
                                const duration = planStepTotalSecs(pw.steps) || pw.plannedDuration || 0;
                                const plannedDistKmMobile = Number(pw.plannedDistance || 0);
                                const isSkipped = pw.status === 'skipped';
                                const compliance = act ? findCompliance(pw, [act]) : null;

                                if (act) {
                                  // Linked pair — clicking opens the activity modal
                                  const actDur = Number(act.duration || act.elapsed_time || act.movingTime || act.moving_time || act.totalTimerTime || act.totalElapsedTime || 0);
                                  const actDist = Number(act.distance || act.totalDistance || 0);
                                  const actDurStr  = actDur > 0 ? `${Math.floor(actDur/3600)}h${String(Math.floor((actDur%3600)/60)).padStart(2,'0')}` : null;
                                  const actDistStr = actDist > 0 ? (actDist >= 1000 ? `${(actDist/1000).toFixed(1)}km` : `${Math.round(actDist)}m`) : null;
                                  const actHr    = Number(act.averageHeartRate || act.average_heartrate || 0);
                                  const actPower = Number(act.normalizedPower || act.avgPower || act.average_watts || 0);
                                  const actSport = String(act.sport || pwSport || '').toLowerCase();
                                  const actIsSwim = actSport.includes('swim');
                                  const actIsRun  = actSport.includes('run') || actSport.includes('hike') || actSport.includes('walk') || actSport.includes('trail');
                                  const actIsBike = actSport.includes('ride') || actSport.includes('cycle') || actSport.includes('bike') || actSport.includes('virtual');
                                  const actPaceStr = (() => {
                                    if (actIsSwim && actDist > 0 && actDur > 0) { const s = actDur/(actDist/100); return `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}/100m`; }
                                    if (actIsRun  && actDist > 0 && actDur > 0) { const s = actDur/(actDist/1000); return `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}/km`; }
                                    return null;
                                  })();
                                  const cc = compliance || { color: '#22c55e', bg: '#f0fdf4', label: 'Done' };
                                  return (
                                    <button key={`pw-${pi}`}
                                      onClick={e => { e.stopPropagation(); handleActivityClick(act, null); }}
                                      className="w-full text-left flex flex-col px-2 py-2 rounded-lg border touch-manipulation active:opacity-70 gap-1"
                                      style={{
                                        borderStyle: 'solid',
                                        borderColor: cc.color,          // top/right/bottom = green
                                        borderLeftColor: planColor,     // left = sport color
                                        borderLeftWidth: 3,
                                        backgroundColor: cc.bg,
                                        WebkitTapHighlightColor: 'transparent'
                                      }}>
                                      {/* Row 1: green dot + planned title + Done/compliance badge */}
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cc.color }} />
                                        <span className="text-[10px] font-semibold flex-1 truncate" style={{ color: planColor }}>{pw.title || 'Planned workout'}</span>
                                        <span className="text-[10px] font-bold flex-shrink-0" style={{ color: cc.color }}>{cc.label}</span>
                                      </div>
                                      {/* Row 2: sport icon + stats (dur · dist · pace/power · HR) + category */}
                                      <div className="flex items-center gap-1.5 pl-0.5">
                                        <SportIcon sport={act.sport || pwSport} className="w-3.5 h-3.5 flex-shrink-0" />
                                        <div className="flex items-center gap-1 text-[10px] text-gray-500 flex-1 min-w-0 flex-wrap">
                                          {actDurStr && <span>{actDurStr}</span>}
                                          {actDistStr && <><span className="text-gray-300">·</span><span>{actDistStr}</span></>}
                                          {actPaceStr && <><span className="text-gray-300">·</span><span className="font-medium">{actPaceStr}</span></>}
                                          {actIsBike && actPower > 0 && <><span className="text-gray-300">·</span><span className="font-medium">{Math.round(actPower)}W</span></>}
                                          {actHr > 0 && <><span className="text-gray-300">·</span><span>♥ {Math.round(actHr)}</span></>}
                                        </div>
                                        {act.category && (
                                          <div className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-md flex-shrink-0 font-bold border leading-none"
                                            style={catBadgeStyle(act.category)}
                                            title={catLabel(act.category)}>
                                            {catLabel(act.category)}
                                          </div>
                                        )}
                                      </div>
                                    </button>
                                  );
                                }

                                // Planned only — no matching activity yet
                                const isMissed = !isSkipped && !isToday && dayDate < new Date();
                                return (
                                  <button key={`pw-${pi}`}
                                    onClick={e => { e.stopPropagation(); onSelectPlannedWorkout && onSelectPlannedWorkout(pw); }}
                                    className="w-full text-left flex flex-col gap-1 px-2 py-2 rounded-lg border touch-manipulation active:opacity-70"
                                    style={{
                                      borderStyle: isMissed ? 'solid' : 'dashed',
                                      borderColor: isMissed ? '#fca5a5' : planColor + '55',
                                      borderLeftColor: isMissed ? '#ef4444' : planColor,
                                      borderLeftWidth: 3,
                                      borderLeftStyle: 'solid',
                                      backgroundColor: isMissed ? '#fef2f2' : planColor + '10',
                                      WebkitTapHighlightColor: 'transparent'
                                    }}>
                                    {/* Title row */}
                                    <div className="flex items-center gap-2 min-w-0">
                                      <SportIcon sport={pwSport} className="w-3.5 h-3.5 flex-shrink-0 opacity-80" style={{ color: isMissed ? '#ef4444' : planColor }} />
                                      <span className="text-xs font-semibold flex-1 truncate" style={{ color: isSkipped ? '#9ca3af' : isMissed ? '#991b1b' : planColor }}>{pw.title || 'Planned workout'}</span>
                                      {isMissed && (
                                        <span className="text-[10px] font-bold flex-shrink-0" style={{ color: '#ef4444' }}>Missed</span>
                                      )}
                                      {!isMissed && pw.steps?.length > 0 && <PlanMiniChart steps={pw.steps} color={planColor} width={36} height={12} />}
                                    </div>
                                    {/* Stats row */}
                                    {(duration > 0 || plannedDistKmMobile > 0 || pw.targetTss > 0) && (
                                      <div className="flex items-center gap-1.5 text-[10px] pl-0.5" style={{ color: isMissed ? '#ef444488' : planColor + 'bb' }}>
                                        {duration > 0 && <span>{fmtPlanDuration(duration)}</span>}
                                        {plannedDistKmMobile > 0 && <><span className="opacity-40">·</span><span>{plannedDistKmMobile >= 1 ? `${plannedDistKmMobile % 1 === 0 ? plannedDistKmMobile : plannedDistKmMobile.toFixed(1)} km` : `${Math.round(plannedDistKmMobile * 1000)} m`}</span></>}
                                        {pw.targetTss > 0 && <><span className="opacity-40">·</span><span>{pw.targetTss} TSS</span></>}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}

                              {/* Unmatched activities (no planned workout on this day) */}
                              {unmatchedActs.map((a, i) => {
                                const activityId = a.id || a._id;
                                const isActSelected = effectiveSelectedId && String(activityId) === String(effectiveSelectedId);
                                const color = sportColor(a.sport);
                                const title = a.title || a.name || a.originalFileName || 'Activity';
                                const dur = Number(a.duration || a.elapsed_time || a.movingTime || a.moving_time || a.totalTimerTime || a.totalElapsedTime || 0);
                                const dist = Number(a.distance || a.totalDistance || 0);
                                const tss = Number(a.tss || a.trainingLoad || 0);
                                const mHr = Number(a.averageHeartRate || a.average_heartrate || 0);
                                const mPower = Number(a.normalizedPower || a.avgPower || a.average_watts || 0);
                                const mSport = String(a.sport || '').toLowerCase();
                                const mIsSwim = mSport.includes('swim');
                                const mIsRun  = mSport.includes('run') || mSport.includes('hike') || mSport.includes('walk') || mSport.includes('trail');
                                const mIsBike = mSport.includes('ride') || mSport.includes('cycle') || mSport.includes('bike') || mSport.includes('virtual');
                                const durStr  = dur > 0 ? `${Math.floor(dur/3600)}h${String(Math.floor((dur%3600)/60)).padStart(2,'0')}` : null;
                                const distStr = dist > 0 ? (dist >= 1000 ? `${(dist/1000).toFixed(1)}km` : `${Math.round(dist)}m`) : null;
                                const mPaceStr = (() => {
                                  if (mIsSwim && dist > 0 && dur > 0) { const s = dur/(dist/100); return `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}/100m`; }
                                  if (mIsRun  && dist > 0 && dur > 0) { const s = dur/(dist/1000); return `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}/km`; }
                                  return null;
                                })();
                                return (
                                  <button key={`act-${i}`}
                                    onClick={e => { e.stopPropagation(); const r = e.currentTarget?.getBoundingClientRect() || null; handleActivityClick(a, r); }}
                                    className={`w-full text-left flex flex-col gap-0.5 px-2 py-2 rounded-lg border transition-all touch-manipulation min-h-[40px] ${isActSelected ? 'bg-primary/10 border-primary/30' : 'bg-white border-gray-100 active:bg-gray-50'}`}
                                    style={{ borderLeftColor: color, borderLeftWidth: 3, WebkitTapHighlightColor: 'transparent' }}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <SportIcon sport={a.sport} className="w-4 h-4 flex-shrink-0" />
                                      <span className="text-xs font-semibold text-gray-800 flex-1 truncate min-w-0">{title}</span>
                                      {a.category && (
                                        <span
                                          className="text-[9px] uppercase tracking-wide px-1.5 py-[1px] rounded-md flex-shrink-0 font-bold border leading-tight"
                                          style={catBadgeStyle(a.category)}
                                          title={catLabel(a.category)}
                                        >
                                          {catLabel(a.category)}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-gray-500 pl-6 flex-wrap">
                                      {durStr && <span>{durStr}</span>}
                                      {distStr && <><span className="text-gray-300">·</span><span>{distStr}</span></>}
                                      {mPaceStr && <><span className="text-gray-300">·</span><span className="font-medium">{mPaceStr}</span></>}
                                      {mIsBike && mPower > 0 && <><span className="text-gray-300">·</span><span className="font-medium">{Math.round(mPower)}W</span></>}
                                      {mHr > 0 && <><span className="text-gray-300">·</span><span>♥ {Math.round(mHr)}</span></>}
                                      {tss > 0 && <><span className="text-gray-300">·</span><span className="font-bold text-primary">{Math.round(tss)}</span></>}
                                    </div>
                                  </button>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-xs text-gray-300">Rest day</div>
                    )}
                  </div>
                  {/* Weekly summary card — shown after each Sunday */}
                  {isSunday && (
                    <div
                      ref={el => { weekSummaryRefs.current[weekKey] = el; }}
                      className="mb-3 rounded-xl border border-primary/20 overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-3 py-2 bg-primary/5">
                        <span className="text-xs font-bold text-primary">Week summary</span>
                        {wkSummary?.plannedSeconds > 0 && (
                          <div className="flex bg-white rounded-lg p-0.5 gap-0.5 border border-primary/20">
                            {[['done', 'Done'], ['plan', 'Plan']].map(([tabId, lbl]) => (
                              <button
                                key={tabId}
                                onClick={e => { e.stopPropagation(); setWeekSummaryTab(tabId); }}
                                className={`px-2 py-0.5 text-[10px] font-semibold rounded-md transition-all touch-manipulation ${weekSummaryTab === tabId ? 'bg-primary text-white shadow-sm' : 'text-gray-500'}`}
                                style={{ WebkitTapHighlightColor: 'transparent' }}
                              >{lbl}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <WeekSummaryCell
                        weekSummary={wkSummary}
                        formatHours={formatHours}
                        formatKm={formatKm}
                        user={user}
                        tab={weekSummaryTab}
                        weekPlannedWorkouts={plannedWorkouts.filter(pw => {
                          if (!pw.date) return false;
                          return startOfWeek(new Date(pw.date)).toISOString().slice(0,10) === weekKey;
                        })}
                      />
                    </div>
                  )}
                  </React.Fragment>
                );
              })}
              <div className="h-4" />
            </div>
          )}

          {/* ── Charts tab: content (page scrolls) ── */}
          {mobileTab === 'charts' && (
            <div className="px-3 pt-2">
              {mobileChartsContent ? (
                <div>
                  {mobileChartsContent}
                  <div className="h-4" />
                </div>
              ) : (<>
              {weeklySummary.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-10">No data</div>
              ) : (() => {
                const sorted = [...weeklySummary].reverse();
                const maxVal = chartType === 'tss'
                  ? Math.max(...sorted.map(w => w.totalTSS), 1)
                  : chartType === 'volume'
                  ? Math.max(...sorted.map(w => w.totalSeconds), 1)
                  : 1;

                return (
                  <div>
                    {/* Bar chart area */}
                    {(chartType === 'volume' || chartType === 'tss') && (
                      <div className="bg-white rounded-xl border border-gray-100 p-3 mb-3">
                        <div className="text-xs font-bold text-gray-500 mb-3">
                          {chartType === 'volume' ? 'Weekly volume (hours)' : 'Weekly TSS'}
                        </div>
                        <div className="flex items-end gap-1.5 h-28">
                          {sorted.map(wk => {
                            const weekEnd = addDays(wk.weekStart, 6);
                            const isCurrentWeek = new Date() >= wk.weekStart && new Date() <= weekEnd;
                            const val = chartType === 'tss' ? wk.totalTSS : wk.totalSeconds;
                            const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                            const label = chartType === 'tss'
                              ? (val > 0 ? Math.round(val) : '')
                              : (val > 0 ? `${(val / 3600).toFixed(1)}` : '');
                            return (
                              <div key={wk.weekStart.toISOString()} className="flex-1 flex flex-col items-center gap-0.5">
                                <span className="text-[8px] text-gray-400 font-medium">{label}</span>
                                <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                                  {chartType === 'volume' && wk.totalSeconds > 0 ? (
                                    <div className="w-full rounded-t-sm overflow-hidden flex flex-col-reverse" style={{ height: `${pct}%` }}>
                                      {wk.bikeSeconds > 0 && <div style={{ flex: wk.bikeSeconds, backgroundColor: SPORT_COLORS_CELL.bike }} />}
                                      {wk.runSeconds > 0 && <div style={{ flex: wk.runSeconds, backgroundColor: SPORT_COLORS_CELL.run }} />}
                                      {wk.swimSeconds > 0 && <div style={{ flex: wk.swimSeconds, backgroundColor: SPORT_COLORS_CELL.swim }} />}
                                      {wk.strengthSeconds > 0 && <div style={{ flex: wk.strengthSeconds, backgroundColor: SPORT_COLORS_CELL.other }} />}
                                    </div>
                                  ) : (
                                    <div
                                      className="w-full rounded-t-sm"
                                      style={{ height: `${pct}%`, backgroundColor: isCurrentWeek ? '#767EB5' : '#c7cae8', minHeight: val > 0 ? 3 : 0 }}
                                    />
                                  )}
                                </div>
                                <span className={`text-[8px] font-bold ${isCurrentWeek ? 'text-primary' : 'text-gray-400'}`}>
                                  {wk.weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Sports breakdown */}
                    {chartType === 'sports' && (
                      <div className="bg-white rounded-xl border border-gray-100 p-3 mb-3">
                        <div className="text-xs font-bold text-gray-500 mb-3">Sport distribution (hours)</div>
                        {(() => {
                          const totals = { bike: 0, run: 0, swim: 0, strength: 0 };
                          sorted.forEach(wk => {
                            totals.bike += wk.bikeSeconds;
                            totals.run += wk.runSeconds;
                            totals.swim += wk.swimSeconds;
                            totals.strength += wk.strengthSeconds;
                          });
                          const total = totals.bike + totals.run + totals.swim + totals.strength;
                          const sports = [
                            { key: 'bike', label: 'Bike', color: SPORT_COLORS_CELL.bike, sec: totals.bike },
                            { key: 'run', label: 'Run', color: SPORT_COLORS_CELL.run, sec: totals.run },
                            { key: 'swim', label: 'Swim', color: SPORT_COLORS_CELL.swim, sec: totals.swim },
                            { key: 'strength', label: 'Strength', color: SPORT_COLORS_CELL.other, sec: totals.strength },
                          ].filter(s => s.sec > 0);
                          return (<>
                            <div className="flex h-4 rounded-full overflow-hidden gap-px mb-3">
                              {sports.map(s => (
                                <div key={s.key} style={{ flex: s.sec, backgroundColor: s.color }} />
                              ))}
                            </div>
                            <div className="flex flex-col gap-2">
                              {sports.map(s => (
                                <div key={s.key} className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                                  <span className="text-xs font-semibold text-gray-700 flex-1">{s.label}</span>
                                  <span className="text-xs text-gray-500">{(s.sec / 3600).toFixed(1)}h</span>
                                  <span className="text-xs font-bold text-gray-400">{total > 0 ? Math.round((s.sec / total) * 100) : 0}%</span>
                                </div>
                              ))}
                            </div>
                          </>);
                        })()}
                      </div>
                    )}

                    {/* Weekly summary cards */}
                    {sorted.map(wk => {
                      const weekEnd = addDays(wk.weekStart, 6);
                      const isCurrentWeek = new Date() >= wk.weekStart && new Date() <= weekEnd;
                      const totalDist = wk.distanceBike + wk.distanceRun + wk.distanceSwim;
                      return (
                        <div key={wk.weekStart.toISOString()} className={`mb-2 rounded-xl border p-3 ${isCurrentWeek ? 'border-primary/30' : 'border-gray-100 bg-white'}`}
                          style={{ backgroundColor: isCurrentWeek ? 'rgba(118,126,181,0.04)' : undefined }}>
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs font-bold ${isCurrentWeek ? 'text-primary' : 'text-gray-500'}`}>
                              {wk.weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – {weekEnd.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                            </span>
                            {isCurrentWeek && <span className="text-[9px] bg-primary text-white px-1.5 py-0.5 rounded-full font-bold">This week</span>}
                          </div>
                          <div className="grid grid-cols-3 gap-2 mb-2">
                            {[
                              { label: 'Time', value: formatHours(wk.totalSeconds) },
                              { label: 'Distance', value: formatKm(totalDist) },
                              { label: 'TSS', value: wk.totalTSS > 0 ? Math.round(wk.totalTSS) : '–', highlight: true },
                            ].map(({ label, value, highlight }) => (
                              <div key={label} className="bg-gray-50 rounded-lg p-1.5 text-center">
                                <div className={`text-sm font-bold ${highlight ? 'text-primary' : 'text-gray-800'}`}>{value}</div>
                                <div className="text-[10px] text-gray-400">{label}</div>
                              </div>
                            ))}
                          </div>
                          {wk.totalSeconds > 0 && (
                            <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                              {wk.bikeSeconds > 0 && <div style={{ flex: wk.bikeSeconds, backgroundColor: SPORT_COLORS_CELL.bike }} />}
                              {wk.runSeconds > 0 && <div style={{ flex: wk.runSeconds, backgroundColor: SPORT_COLORS_CELL.run }} />}
                              {wk.swimSeconds > 0 && <div style={{ flex: wk.swimSeconds, backgroundColor: SPORT_COLORS_CELL.swim }} />}
                              {wk.strengthSeconds > 0 && <div style={{ flex: wk.strengthSeconds, backgroundColor: SPORT_COLORS_CELL.other }} />}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="h-4" />
                  </div>
                );
              })()}
              </>)}
              {/* Sentinel: scrolling to the bottom advances to next month */}
              <div ref={monthSentinelBottomRef} className="flex items-center justify-center py-4 gap-2 text-gray-300 text-xs select-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7"/></svg>
                <span>{new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })}</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7"/></svg>
              </div>
            </div>
          )}
        </div>
      ) : isFullscreen ? (
        /* ── Fullscreen: stacked week-by-week layout ── */
        <div ref={fullscreenScrollRef} onScroll={handleFullscreenScroll} className="flex-1 overflow-y-auto -mx-4 md:-mx-5 px-0">
          {/* Sticky column headers */}
          <div className="sticky top-0 z-20 grid gap-px bg-gray-200 shadow-sm" style={{ gridTemplateColumns: 'repeat(7, 1fr) minmax(130px,170px)' }}>
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun','Summary'].map(d => (
              <div key={d} className="bg-gray-50 text-[11px] font-semibold text-center py-2 text-gray-500">{d}</div>
            ))}
          </div>

          {fullscreenWeeks.map((weekDays) => {
            const weekStart = startOfWeek(weekDays[0]);
            const weekEnd = weekDays[6];
            const weekKey = weekStart.toISOString().slice(0, 10);
            const wkSummary = weeklySummary.find(w => w.weekStart.toISOString().slice(0, 10) === weekKey);
            const isCurrentWeek = weekDays.some(d => isSameDay(d, new Date()));
            const weekLabel = `${weekStart.toLocaleDateString(undefined,{day:'numeric',month:'short'})} – ${weekEnd.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}`;

            return (
              <div key={weekKey} className={`border-b border-gray-100 ${isCurrentWeek ? 'border-l-4 border-l-primary' : 'border-l-4 border-l-transparent'}`}>
                {/* Week header */}
                <div className={`flex items-center gap-3 px-4 py-1.5 text-xs ${isCurrentWeek ? 'bg-primary/5' : 'bg-gray-50'}`}>
                  <span className={`font-bold ${isCurrentWeek ? 'text-primary' : 'text-gray-500'}`}>{weekLabel}</span>
                  {isCurrentWeek && <span className="bg-primary text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">Now</span>}
                  {wkSummary && wkSummary.totalSeconds > 0 && (
                    <div className="flex items-center gap-2 ml-auto text-gray-500">
                      <span className="font-semibold text-gray-700">{formatHours(wkSummary.totalSeconds)}</span>
                      {wkSummary.totalTSS > 0 && (
                        <span className="flex items-center gap-0.5 text-primary font-bold">
                          <FireIcon className="w-3 h-3" />{Math.round(wkSummary.totalTSS)} TSS
                        </span>
                      )}
                      {wkSummary.volumeChange === 'up' && <ArrowUpIcon className="w-3 h-3 text-green-500" />}
                      {wkSummary.volumeChange === 'down' && <ArrowDownIcon className="w-3 h-3 text-red-500" />}
                    </div>
                  )}
                </div>

                {/* Day columns */}
                <div className="grid gap-px bg-gray-100" style={{ gridTemplateColumns: 'repeat(7, 1fr) minmax(130px,170px)' }}>
                  {weekDays.map((dayDate, dayIdx) => {
                    const key = getLocalDateString(dayDate);
                    const allActs = activitiesByDay.get(key) || [];
                    const planned = plannedByDay.get(key) || [];
                    const { pwToAct, claimed } = pairPlannedWithActivities(planned, allActs);
                    const acts = allActs.filter(a => !claimed.has(String(a?.id ?? a?._id ?? '')));
                    const isToday = isSameDay(dayDate, new Date());
                    const isDragTarget = dragOverKey === key && draggedPw && draggedPw.pw.date !== key;

                    return (
                      <div
                        key={key}
                        className={`bg-white p-2 min-h-[190px] flex flex-col gap-1 group/day ${isToday ? 'ring-2 ring-primary/30 ring-inset bg-primary/5' : 'hover:bg-gray-50/60'} ${isDragTarget ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
                        onDragOver={e => { if (!draggedPw) return; e.preventDefault(); setDragOverKey(key); }}
                        onDragLeave={() => { if (dragOverKey === key) setDragOverKey(null); }}
                        onDrop={e => {
                          e.preventDefault(); setDragOverKey(null);
                          if (!draggedPw) return;
                          const { pw, isCopy } = draggedPw;
                          if (pw.date === key) return;
                          if (isCopy && onCopyPlannedWorkout) onCopyPlannedWorkout(pw, key);
                          else if (!isCopy && onMovePlannedWorkout) onMovePlannedWorkout(pw._id, key);
                          setDraggedPw(null);
                        }}
                      >
                        {/* Day number */}
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`text-xs font-bold leading-none ${isToday ? 'w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px]' : 'text-gray-700'}`}>
                            {dayDate.getDate()}
                          </span>
                          {isDragTarget && <span className="text-[9px] font-semibold text-primary/70">{draggedPw?.isCopy ? 'Copy' : 'Move'}</span>}
                          {!isDragTarget && onPlanWorkout && (
                            <button
                              onClick={e => { e.stopPropagation(); onPlanWorkout(dayDate); }}
                              className="opacity-0 group-hover/day:opacity-100 w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10 transition-all"
                            >
                              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M8 3v10M3 8h10" /></svg>
                            </button>
                          )}
                        </div>

                        {/* Planned workouts */}
                        {planned.map((pw, pi) => (
                          <PlannedWorkoutCard
                            key={`fs-plan-${pi}`}
                            pw={pw}
                            compact
                            onSelect={onSelectPlannedWorkout}
                            onStart={onStartWorkout}
                            isDragging={draggedPw?.pw?._id === pw._id}
                            onDragStart={e => { e.dataTransfer.effectAllowed = 'copyMove'; setDraggedPw({ pw, isCopy: e.altKey }); }}
                            onDragEnd={() => { setDraggedPw(null); setDragOverKey(null); }}
                            compliance={findCompliance(pw, allActs)}
                            pairingState={pairingStateFor(pw, allActs, getLocalDateString(new Date()))}
                            linkedActivity={pwToAct.get(String(pw._id)) || null}
                            onSelectLinked={(act) => handleActivityClick(act, null)}
                            onDuplicate={onCopyPlannedWorkout ? (p) => onCopyPlannedWorkout(p, p.date) : null}
                            onDelete={onDeletePlannedWorkout}
                            onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                          />
                        ))}

                        {/* Actual activities */}
                        {acts.map((a, i) => {
                          const activityId = a.id || a._id;
                          const isSelected = effectiveSelectedId && String(activityId) === String(effectiveSelectedId);
                          return (
                            <WeekActivityCard
                              key={i}
                              a={a}
                              isSelected={isSelected}
                              onSelect={handleSelectActivity}
                              onActivityClick={handleActivityClick}
                              onAddLactate={onAddLactate}
                              catBadgeStyle={catBadgeStyle}
                              catLabel={catLabel}
                            />
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Summary column */}
                  <div className="flex flex-col">
                    {wkSummary?.plannedSeconds > 0 && (
                      <div className="flex justify-center pt-1 pb-0.5">
                        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                          {[['done', 'Done'], ['plan', 'Plan']].map(([tabId, lbl]) => (
                            <button key={tabId}
                              onClick={() => setWeekSummaryTab(tabId)}
                              className={`px-2 py-0.5 text-[9px] font-semibold rounded-md transition-all ${weekSummaryTab === tabId ? 'bg-primary text-white shadow-sm' : 'text-gray-500'}`}
                            >{lbl}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    <WeekSummaryCell
                      weekSummary={wkSummary}
                      formatHours={formatHours}
                      formatKm={formatKm}
                      user={user}
                      tab={weekSummaryTab}
                      weekPlannedWorkouts={plannedWorkouts.filter(pw => {
                        if (!pw.date) return false;
                        return startOfWeek(new Date(pw.date)).toISOString().slice(0,10) === weekKey;
                      })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop: compact month/week grid */
        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={anchorDate.toISOString().slice(0, 7)}
          initial={{ opacity: 0, x: direction * 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -30 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="grid gap-px bg-gray-100 rounded-xl overflow-hidden"
          style={{ gridTemplateColumns: 'repeat(7, 1fr) minmax(140px,180px)' }}
        >
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun', 'Summary'].map((d) => (
          <div key={d} className="bg-gray-50 text-xs md:text-sm font-medium p-1 md:p-3 text-center text-gray-600">{d}</div>
        ))}
        {(() => {
          // Group days into weeks
          const weeks = [];
          for (let i = 0; i < days.length; i += 7) {
            weeks.push(days.slice(i, i + 7));
          }

          return weeks.flatMap((weekDays, weekIdx) => {
            const weekStart = startOfWeek(weekDays[0]);
            const weekKey = weekStart.toISOString().slice(0, 10);
            const weekSummary = weeklySummary.find(w => w.weekStart.toISOString().slice(0, 10) === weekKey);

            return [
              // Week days
              ...weekDays.map((dayDate, dayIdx) => {
                const key = getLocalDateString(dayDate);
                const isCurrentMonth = dayDate.getMonth() === anchorDate.getMonth();
                const allActs = activitiesByDay.get(key) || [];
                const plannedForDay = plannedByDay.get(key) || [];
                const { pwToAct, claimed } = pairPlannedWithActivities(plannedForDay, allActs);
                const acts = allActs.filter(a => !claimed.has(String(a?.id ?? a?._id ?? '')));
                const isToday = isSameDay(dayDate, new Date());
                const isExpanded = expandedDays.has(key);
                const maxCollapsedItems = view === 'month' ? 3 : Number.POSITIVE_INFINITY;
                const totalDayItems = plannedForDay.length + acts.length;
                const hasOverflow = view === 'month' && totalDayItems > maxCollapsedItems;
                const visiblePlannedForDay = isExpanded
                  ? plannedForDay
                  : plannedForDay.slice(0, maxCollapsedItems);
                const remainingSlots = isExpanded
                  ? Number.POSITIVE_INFINITY
                  : Math.max(0, maxCollapsedItems - visiblePlannedForDay.length);
                const visibleActs = isExpanded ? acts : acts.slice(0, remainingSlots);
                const remainingCount = hasOverflow ? totalDayItems - maxCollapsedItems : 0;

                const toggleExpand = (e) => {
                  e.stopPropagation();
                  setExpandedDays(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(key)) {
                      newSet.delete(key);
                    } else {
                      newSet.add(key);
                    }
                    return newSet;
                  });
                };

                const cellIdx = weekIdx * 7 + dayIdx;
                const isDragTarget = dragOverKey === key && draggedPw && draggedPw.pw.date !== key;
                return (
                  <motion.div
                    key={`day-${weekIdx}-${dayIdx}`}
                    layout
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
                      opacity: { duration: 0.18, delay: cellIdx * 0.008 },
                      scale: { duration: 0.18, delay: cellIdx * 0.008 },
                    }}
                    className={`bg-white p-1 md:p-2.5 ${view === 'week' ? 'min-h-[160px]' : 'min-h-[130px]'} transition-all group ${isCurrentMonth ? '' : 'opacity-40'} ${isToday ? 'ring-2 ring-primary/30 ring-inset bg-primary/5' : 'hover:bg-gray-50'} ${isDragTarget ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
                    style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}
                    onDragOver={e => { if (!draggedPw) return; e.preventDefault(); setDragOverKey(key); }}
                    onDragLeave={e => { if (dragOverKey === key) setDragOverKey(null); }}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverKey(null);
                      if (!draggedPw) return;
                      const { pw, isCopy } = draggedPw;
                      if (pw.date === key) return;
                      if (isCopy && onCopyPlannedWorkout) onCopyPlannedWorkout(pw, key);
                      else if (!isCopy && onMovePlannedWorkout) onMovePlannedWorkout(pw._id, key);
                      setDraggedPw(null);
                    }}
                  >
                    <div className={`flex items-center justify-between mb-1.5`}>
                      <span className={`text-xs md:text-sm font-semibold ${isToday ? 'text-primary font-bold' : 'text-gray-700'}`}>
                        {view === 'week' ? `${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dayIdx]} ${dayDate.getDate()}` : dayDate.getDate()}
                      </span>
                      {isDragTarget && (
                        <span className="text-[9px] font-semibold text-primary/70 ml-1">{draggedPw?.isCopy ? 'Copy here' : 'Move here'}</span>
                      )}
                      {!isDragTarget && onPlanWorkout && (
                        <button
                          onClick={e => { e.stopPropagation(); onPlanWorkout(dayDate); }}
                          title="Plan workout"
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10"
                        >
                          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" d="M8 3v10M3 8h10" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <motion.div
                      layout
                      className="space-y-1 w-full"
                      style={{ maxWidth: '100%', overflow: 'hidden' }}
                      transition={{ layout: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
                    >
                      {/* Planned workouts first (dashed) */}
                      {visiblePlannedForDay.map((pw, pi) => (
                        <PlannedWorkoutCard
                          key={`plan-${pi}`}
                          pw={pw}
                          compact
                          onSelect={onSelectPlannedWorkout}
                          onStart={onStartWorkout}
                          isDragging={draggedPw?.pw?._id === pw._id}
                          onDragStart={e => { e.dataTransfer.effectAllowed = 'copyMove'; setDraggedPw({ pw, isCopy: e.altKey }); }}
                          onDragEnd={() => { setDraggedPw(null); setDragOverKey(null); }}
                          compliance={findCompliance(pw, allActs)}
                          pairingState={pairingStateFor(pw, allActs, getLocalDateString(new Date()))}
                          linkedActivity={pwToAct.get(String(pw._id)) || null}
                          onSelectLinked={(act) => handleActivityClick(act, null)}
                          onDuplicate={onCopyPlannedWorkout ? (p) => onCopyPlannedWorkout(p, p.date) : null}
                          onDelete={onDeletePlannedWorkout}
                          onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                        />
                      ))}
                      {visibleActs.map((a, i) => {
                        const activityId = a.id || a._id;
                        const isSelected = effectiveSelectedId && String(activityId) === String(effectiveSelectedId);
                        const activityTitle = a.title || a.name || a.originalFileName || 'Activity';
                        if (view === 'week') {
                          return (
                            <WeekActivityCard
                              key={i}
                              a={a}
                              isSelected={isSelected}
                              onSelect={handleSelectActivity}
                              onActivityClick={handleActivityClick}
                              onAddLactate={onAddLactate}
                              catBadgeStyle={catBadgeStyle}
                              catLabel={catLabel}
                            />
                          );
                        }
                        // Month view card — enriched with duration + distance + TSS
                        const dur = a.duration || a.elapsed_time || a.movingTime || 0;
                        const durStr = dur > 0 ? `${Math.floor(dur/3600)}:${String(Math.floor((dur%3600)/60)).padStart(2,'0')}` : null;
                        const dist = a.distance || a.totalDistance || 0;
                        const distStr = dist > 0 ? (dist >= 1000 ? `${(dist/1000).toFixed(1)}km` : `${Math.round(dist)}m`) : null;
                        const tssVal = Number(a.tss || a.trainingLoad || 0);

                        return (
                          <div key={i} className="relative group/act w-full max-w-full" style={{ minWidth: 0 }}>
                            <button
                              onClick={(e) => { const r = e.currentTarget?.getBoundingClientRect() || null; handleActivityClick(a, r); }}
                              className={`w-full max-w-full text-left text-[10px] md:text-[11px] px-2 md:px-2.5 py-1.5 rounded-lg border transition-all flex flex-col gap-0.5 ${
                                isSelected
                                  ? 'bg-gradient-to-r from-primary to-primary-dark text-white shadow-md hover:shadow-lg ring-2 ring-primary/20'
                                  : 'bg-white hover:bg-gray-50 text-gray-800 shadow-sm hover:shadow-md'
                              }`}
                              style={{
                                minWidth: 0,
                                overflow: 'hidden',
                                borderColor: a.category
                                  ? (isSelected ? catBorderColor(a.category) || undefined : catBorderColor(a.category) || '#e5e7eb')
                                  : (isSelected ? undefined : '#e5e7eb'),
                                // Always show a sport-color left rail (or category color when assigned)
                                borderLeftColor: a.category ? (catBorderColor(a.category) || sportColor(a.sport)) : sportColor(a.sport),
                                borderLeftWidth: '3px',
                              }}
                              title={activityTitle}
                            >
                              {/* Title row */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <SportIcon sport={a.sport} className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate min-w-0 flex-1 font-semibold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activityTitle}</span>
                                {tssVal > 0 && (
                                  <span className={`flex-shrink-0 text-[9px] font-bold ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{Math.round(tssVal)}</span>
                                )}
                              </div>
                              {/* Category + duration + distance row — category gets its
                                  own breathing room here so it's readable in narrow month cells. */}
                              {(a.category || durStr || distStr) && (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {a.category && (
                                    <span
                                      className="text-[9px] uppercase tracking-wide px-1.5 py-[1px] rounded-md flex-shrink-0 font-bold border leading-tight"
                                      style={isSelected
                                        ? { backgroundColor: 'rgba(255,255,255,.20)', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }
                                        : catBadgeStyle(a.category)}
                                      title={catLabel(a.category)}
                                    >
                                      {catLabel(a.category)}
                                    </span>
                                  )}
                                  {(durStr || distStr) && (
                                    <span className={`text-[9px] truncate ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
                                      {durStr}{durStr && distStr ? ' · ' : ''}{distStr}
                                    </span>
                                  )}
                                </div>
                              )}
                            </button>
                            {onAddLactate && a.type === 'strava' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onAddLactate(a); }}
                                title="Add lactate"
                                className="absolute top-0.5 right-0.5 hidden group-hover/act:flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold bg-violet-100 text-violet-700 hover:bg-violet-200 border border-violet-200 leading-none z-10"
                              >
                                + La
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {hasOverflow && (
                        <button
                          onClick={toggleExpand}
                          className="w-full text-left text-[10px] md:text-[11px] px-2 md:px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-sm transition-all font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronDownIcon className="w-3 h-3 flex-shrink-0 text-gray-500 rotate-180 transition-transform duration-300" />
                              <span className="text-gray-600">Show less</span>
                            </>
                          ) : (
                            <>
                              <span className="text-primary font-bold">+</span>
                              <span className="text-gray-600">Show {remainingCount} more</span>
                            </>
                          )}
                        </button>
                      )}
                    </motion.div>
                  </motion.div>
                );
              }),
              // Week summary column — richer redesign
              <div key={`summary-${weekIdx}`} className="flex flex-col bg-white">
                {weekSummary?.plannedSeconds > 0 && (
                  <div className="flex justify-center pt-1.5 pb-0.5">
                    <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                      {[['done', 'Done'], ['plan', 'Plan']].map(([tabId, lbl]) => (
                        <button key={tabId}
                          onClick={() => setWeekSummaryTab(tabId)}
                          className={`px-2 py-0.5 text-[9px] font-semibold rounded-md transition-all ${weekSummaryTab === tabId ? 'bg-primary text-white shadow-sm' : 'text-gray-500'}`}
                        >{lbl}</button>
                      ))}
                    </div>
                  </div>
                )}
                <WeekSummaryCell
                  weekSummary={weekSummary}
                  formatHours={formatHours}
                  formatKm={formatKm}
                  user={user}
                  tab={weekSummaryTab}
                  weekPlannedWorkouts={plannedWorkouts.filter(pw => {
                    if (!pw.date) return false;
                    return startOfWeek(new Date(pw.date)).toISOString().slice(0,10) === weekKey;
                  })}
                />
              </div>
            ].filter(Boolean);
          });
        })()}
      </motion.div>
      </AnimatePresence>
      )}

      {/* Activity detail popup */}
      {activityPopup && (
        <ActivityDetailPopup
          activity={activityPopup.activity}
          anchorRect={activityPopup.rect}
          onClose={() => setActivityPopup(null)}
          onSelectActivity={onSelectActivity}
          onAddLactate={onAddLactate}
          plannedWorkout={activityPopup.plannedWorkout || null}
          onEditPlanned={onSelectPlannedWorkout}
          onOpenFull={() => setActivityModal({ activity: activityPopup.activity, plannedWorkout: activityPopup.plannedWorkout || null })}
        />
      )}

      {/* Activity full modal */}
      {activityModal && (
        <ActivityFullModal
          activity={activityModal.activity}
          plannedWorkout={activityModal.plannedWorkout}
          athleteId={athleteId}
          onClose={() => setActivityModal(null)}
          onEditPlanned={onSelectPlannedWorkout}
          onAddLactate={onAddLactate}
          onPlannedSaved={(saved) => setActivityModal(prev => prev ? { ...prev, plannedWorkout: saved } : prev)}
          onOpenFull={onOpenActivity ? () => { setActivityModal(null); onOpenActivity(activityModal.activity); } : null}
          onDeleted={onActivityDeleted}
        />
      )}

      {/* ── Month / Year picker modal (mobile) ── */}
      {showMonthPicker && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[10001] flex items-end justify-center"
          style={{ pointerEvents: 'auto', backgroundColor: 'rgba(0,0,0,0.35)' }}
          onClick={() => setShowMonthPicker(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl pb-safe"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Year row */}
            <div className="flex items-center justify-between px-6 py-3">
              <button
                className="p-2 rounded-full active:bg-gray-100 touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                onClick={() => setPickerYear(y => y - 1)}
              >
                <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
              </button>
              <span className="text-base font-bold text-gray-800">{pickerYear}</span>
              <button
                className="p-2 rounded-full active:bg-gray-100 touch-manipulation"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                onClick={() => setPickerYear(y => y + 1)}
              >
                <ChevronRightIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-3 gap-2 px-4 pb-4">
              {Array.from({ length: 12 }, (_, i) => {
                const isSelected = pickerYear === anchorDate.getFullYear() && i === anchorDate.getMonth();
                const isCurrentMonth = pickerYear === new Date().getFullYear() && i === new Date().getMonth();
                const label = new Date(pickerYear, i, 1).toLocaleString(undefined, { month: 'short' });
                return (
                  <button
                    key={i}
                    className={`py-2.5 rounded-xl text-sm font-semibold touch-manipulation active:scale-95 transition-all ${
                      isSelected
                        ? 'bg-primary text-white shadow-sm'
                        : isCurrentMonth
                          ? 'bg-primary/10 text-primary'
                          : 'bg-gray-50 text-gray-700 active:bg-gray-100'
                    }`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                    onClick={() => {
                      setAnchorDate(new Date(pickerYear, i, 1));
                      setShowMonthPicker(false);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.getElementById('app-modal-root') || document.body
      )}
    </motion.div>
  );
  return (
    <>
      {isFullscreen ? ReactDOM.createPortal(calendarContent, document.body) : calendarContent}
      {/* Add completed workout sheet */}
      {addCompletedDate && (
        <AddCompletedSheet
          date={addCompletedDate}
          athleteId={athleteId}
          onPlanWorkout={onPlanWorkout}
          onClose={() => setAddCompletedDate(null)}
          onSaved={() => {
            setAddCompletedDate(null);
            onAddCompletedWorkout?.();
          }}
        />
      )}
    </>
  );
}
