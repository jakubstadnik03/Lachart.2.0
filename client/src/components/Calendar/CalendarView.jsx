import React, { useMemo, useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
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
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import { formatDistanceForUser } from '../../utils/unitsConverter';
import { useCategories, hexToRgba } from '../../context/CategoryContext';
import { motion, AnimatePresence } from 'framer-motion';

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

// Sport icon component with SVG icons
const SportIcon = ({ sport, className = "w-4 h-4" }) => {
  if (!sport) return null;
  const s = String(sport).toLowerCase();

  if (s.includes('run')) {
    return (
      <div className={`${className} rounded-full bg-orange-100 p-0.5 flex items-center justify-center`}>
        <img src="/icon/run.svg" alt="Run" className="w-3 h-3" />
      </div>
    );
  }
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) {
    return (
      <div className={`${className} rounded-full bg-blue-100 p-0.5 flex items-center justify-center`}>
        <img src="/icon/bike.svg" alt="Bike" className="w-3 h-3" />
      </div>
    );
  }
  if (s.includes('swim')) {
    return (
      <div className={`${className} rounded-full bg-cyan-100 p-0.5 flex items-center justify-center`}>
        <img src="/icon/swim.svg" alt="Swim" className="w-3 h-3" />
      </div>
    );
  }
  if (s.includes('gym') || s.includes('weight') || s.includes('strength')) {
    return (
      <div className={`${className} rounded-full bg-primary/10 p-0.5 flex items-center justify-center`}>
        <BoltIcon className="w-3 h-3 text-primary" />
      </div>
    );
  }
  return (
    <div className={`${className} rounded-full bg-gray-100 p-0.5 flex items-center justify-center`}>
      <BoltIcon className="w-3 h-3 text-gray-600" />
    </div>
  );
};

// ─── Sport color helper ───────────────────────────────────────────────────────
function sportColor(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run')) return '#f97316';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) return '#3b82f6';
  if (s.includes('swim')) return '#06b6d4';
  return '#8b5cf6';
}

// ─── Planned workout card (desktop) ──────────────────────────────────────────
function PlannedWorkoutCard({ pw, onSelect, onStart, compact = false, onDragStart, onDragEnd, isDragging = false }) {
  const sport = (pw.sport || 'bike').toLowerCase();
  const color = SPORT_PLAN_COLORS[sport] || '#767EB5';
  const duration = planStepTotalSecs(pw.steps);
  const isCompleted = pw.status === 'completed';
  const isSkipped   = pw.status === 'skipped';

  if (compact) {
    // tiny card for desktop month cell
    return (
      <div
        className="relative group/plan w-full max-w-full"
        style={{ minWidth: 0, opacity: isDragging ? 0.4 : 1, transition: 'opacity 0.15s' }}
        draggable={!isCompleted && !isSkipped}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <button
          onClick={() => onSelect && onSelect(pw)}
          className="w-full max-w-full text-left text-[10px] md:text-[11px] px-2 md:px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1.5"
          style={{
            borderStyle: 'dashed',
            borderColor: color + '80',
            backgroundColor: color + '10',
            color: isSkipped ? '#9ca3af' : color,
            opacity: isSkipped ? 0.5 : 1,
            minWidth: 0,
            overflow: 'hidden',
            cursor: (!isCompleted && !isSkipped) ? 'grab' : 'pointer',
          }}
          title={pw.title}
        >
          {isCompleted
            ? <CheckCircleIcon className="w-3 h-3 flex-shrink-0" style={{ color }} />
            : <PlayIcon className="w-3 h-3 flex-shrink-0 opacity-70" />}
          <span className="truncate min-w-0 flex-1 font-medium" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {pw.title || 'Planned'}
          </span>
          {duration > 0 && <span className="flex-shrink-0 opacity-60 text-[9px]">{fmtPlanDuration(duration)}</span>}
        </button>
        {!isCompleted && !isSkipped && onStart && (
          <button
            onClick={e => { e.stopPropagation(); onStart(pw); }}
            title="Start workout"
            className="absolute top-0.5 right-0.5 hidden group-hover/plan:flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold border leading-none z-10"
            style={{ backgroundColor: color + '20', color, borderColor: color + '60' }}
          >
            <PlayIcon className="w-2 h-2" /> Start
          </button>
        )}
      </div>
    );
  }

  // full card for mobile selected-day view
  return (
    <div
      className="w-full rounded-xl border-2 p-3 transition-all"
      style={{ borderStyle: 'dashed', borderColor: color + '80', backgroundColor: color + '08' }}
    >
      <div className="flex items-start gap-3">
        {pw.sport && SPORT_PLAN_COLORS[pw.sport.toLowerCase()] && (
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '20' }}>
            <img src={`/icon/${sport}.svg`} alt={sport} className="w-4 h-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-900 truncate">{pw.title || 'Planned workout'}</span>
            {isCompleted && <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />}
            {isSkipped && <span className="text-xs text-gray-400">skipped</span>}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {duration > 0 && <span>{fmtPlanDuration(duration)}</span>}
            {pw.steps?.length > 0 && <span>{pw.steps.filter(s => !s.isGroupHeader).length} steps</span>}
          </div>
          {pw.steps?.length > 0 && (
            <div className="mt-2">
              <PlanMiniChart steps={pw.steps} color={color} width={120} height={20} />
            </div>
          )}
        </div>
      </div>
      {!isCompleted && !isSkipped && onStart && (
        <button
          onClick={() => onStart(pw)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: color + '20', color, border: `1px solid ${color}60` }}
        >
          <PlayIcon className="w-4 h-4" /> Start Workout
        </button>
      )}
    </div>
  );
}

// ─── Week view activity card (richer, TrainingPeaks style) ───────────────────
function WeekActivityCard({ a, isSelected, onSelect, onActivityClick, onAddLactate, catBadgeStyle, catLabel }) {
  const title = a.title || a.name || a.originalFileName || 'Activity';

  // Duration formatting
  const dur = a.duration || a.elapsed_time || a.movingTime || 0;
  const durStr = dur > 0 ? `${Math.floor(dur/3600)}:${String(Math.floor((dur%3600)/60)).padStart(2,'0')}` : null;

  // Distance
  const dist = a.distance || a.totalDistance || 0;
  const distStr = dist > 0 ? (dist > 1000 ? `${(dist/1000).toFixed(1)} km` : `${Math.round(dist)} m`) : null;

  // TSS
  const tss = a.tss || a.trainingLoad || 0;

  // Power & HR
  const power = a.normalizedPower || a.avgPower || a.average_watts || 0;
  const hr = a.averageHeartRate || a.average_heartrate || 0;

  // Color based on sport
  const color = sportColor(a.sport);

  const handleClick = (e) => {
    if (onActivityClick) {
      onActivityClick(a, e);
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
        </div>
        {/* Duration + Distance */}
        {(durStr || distStr) && (
          <div className="flex items-center gap-2 text-[10px] flex-wrap">
            {durStr && <span className={isSelected ? 'text-white/80' : 'text-gray-500'}>{durStr}</span>}
            {distStr && <><span className={isSelected ? 'text-white/40' : 'text-gray-300'}>·</span><span className={isSelected ? 'text-white/80' : 'text-gray-500'}>{distStr}</span></>}
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
        {/* Power & HR secondary row */}
        {(power > 0 || hr > 0) && (
          <div className="flex items-center gap-2 text-[10px] flex-wrap mt-0.5">
            {power > 0 && (
              <span className={isSelected ? 'text-white/70' : 'text-gray-400'}>
                {Math.round(power)}W
              </span>
            )}
            {hr > 0 && (
              <span className={isSelected ? 'text-white/70' : 'text-gray-400'}>
                ♥ {Math.round(hr)} bpm
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
}

// ─── Activity Detail Popup ────────────────────────────────────────────────────
function ActivityDetailPopup({ activity, anchorRect, onClose, onSelectActivity }) {
  const popupRef = useRef(null);
  const a = activity;

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

  // Position: right of element if space, else left; always inside viewport
  const POPUP_W = 288; // w-72
  const POPUP_H = 380; // estimated max height
  const MARGIN = 8;
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;

  let left, top;
  if (anchorRect) {
    // Try right side
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

  // Data extraction
  const title = a.title || a.name || a.originalFileName || 'Activity';
  const color = sportColor(a.sport);

  const dur = a.duration || a.elapsed_time || a.movingTime || a.totalTimerTime || 0;
  const durStr = dur > 0
    ? `${Math.floor(dur/3600)}:${String(Math.floor((dur%3600)/60)).padStart(2,'0')}:${String(Math.floor(dur%60)).padStart(2,'0')}`
    : '-';

  const dist = a.distance || a.totalDistance || 0;
  const distStr = dist > 0 ? (dist >= 1000 ? `${(dist/1000).toFixed(2)} km` : `${Math.round(dist)} m`) : '-';

  const tss = Number(a.tss || a.trainingLoad || 0);
  const hrTss = Number(a.hrTSS || a.hrTss || 0);
  const power = a.normalizedPower || a.avgPower || a.average_watts || 0;
  const hr = a.averageHeartRate || a.average_heartrate || 0;
  const elevation = a.totalElevationGain || a.elevationGain || a.total_elevation_gain || 0;
  const ftp = null; // could be passed in from userProfile, skip IF for now
  const np = a.normalizedPower || 0;
  const ifVal = (np > 0 && ftp) ? (np / ftp).toFixed(2) : null;

  // Date formatting
  const actDate = a.date || a.timestamp || a.startDate || a.start_time;
  const dateStr = actDate
    ? new Date(actDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const notes = a.description || a.notes || '';

  const stats = [
    { label: 'Duration', value: durStr },
    { label: 'Distance', value: distStr },
    { label: 'TSS', value: tss > 0 ? Math.round(tss) : '-' },
    { label: 'hrTSS', value: (hrTss > 0 && hrTss !== tss) ? Math.round(hrTss) : '-' },
    { label: 'Avg Power', value: power > 0 ? `${Math.round(power)} W` : '-' },
    { label: 'IF', value: ifVal || '-' },
    { label: 'Avg HR', value: hr > 0 ? `${Math.round(hr)} bpm` : '-' },
    { label: 'Elevation', value: elevation > 0 ? `${Math.round(elevation)} m` : '-' },
  ];

  return ReactDOM.createPortal(
    <div
      ref={popupRef}
      className="fixed z-[10000] w-72 max-w-xs bg-white rounded-2xl shadow-2xl overflow-hidden"
      style={{ left, top, maxHeight: '90vh', overflowY: 'auto' }}
    >
      {/* Colored top accent bar */}
      <div className="h-1.5 w-full" style={{ backgroundColor: color }} />

      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-start gap-2">
        <SportIcon sport={a.sport} className="w-7 h-7 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-900 truncate">{title}</div>
          {dateStr && <div className="text-[10px] text-gray-400 mt-0.5">{dateStr}</div>}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Stats grid */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {stats.map(({ label, value }) => (
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

      {/* Footer */}
      <div className="px-4 pb-4">
        <button
          onClick={() => { if (onSelectActivity) onSelectActivity(a); onClose(); }}
          className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: color }}
        >
          Open Activity
        </button>
      </div>
    </div>,
    document.body
  );
}

// ─── Richer Summary Column ────────────────────────────────────────────────────
function WeekSummaryCell({ weekSummary, formatHours, formatKm, user }) {
  if (!weekSummary) return <div className="bg-gray-50 p-2 min-h-[130px] min-w-[140px]" />;

  const { totalSeconds, totalTSS, runSeconds, bikeSeconds, swimSeconds, strengthSeconds,
    distanceRun, distanceBike, distanceSwim, tssRun, tssBike, tssSwim, tssStrength,
    volumeChange } = weekSummary;

  // TSS distribution bar segments
  const totalTssForBar = tssRun + tssBike + tssSwim + tssStrength;
  const bikeRatio = totalTssForBar > 0 ? tssBike / totalTssForBar : 0;
  const runRatio  = totalTssForBar > 0 ? tssRun  / totalTssForBar : 0;
  const swimRatio = totalTssForBar > 0 ? tssSwim / totalTssForBar : 0;

  const sports = [
    { key: 'bike', icon: '/icon/bike.svg', seconds: bikeSeconds, dist: distanceBike, tss: tssBike, color: '#3b82f6' },
    { key: 'run',  icon: '/icon/run.svg',  seconds: runSeconds,  dist: distanceRun,  tss: tssRun,  color: '#f97316' },
    { key: 'swim', icon: '/icon/swim.svg', seconds: swimSeconds, dist: distanceSwim, tss: tssSwim, color: '#06b6d4' },
  ].filter(s => s.seconds > 0 || s.dist > 0);

  return (
    <div className="bg-gray-50 p-2 border-l-4 border-primary/30 min-h-[130px] min-w-[140px] flex flex-col gap-1.5">
      {/* Total time + TSS at top */}
      <div className="flex items-start justify-between gap-1">
        <div>
          <div className="text-base font-extrabold text-gray-900 leading-tight">{formatHours(totalSeconds)}</div>
          {totalTSS > 0 && (
            <div className="flex items-center gap-0.5 mt-0.5">
              <FireIcon className="w-3 h-3 text-primary" />
              <span className="text-xs font-bold text-primary">{Math.round(totalTSS)}</span>
              <span className="text-[9px] text-gray-400">TSS</span>
            </div>
          )}
        </div>
        {volumeChange && (
          <span className="mt-0.5">
            {volumeChange === 'up' && <ArrowUpIcon className="w-4 h-4 text-green-500" />}
            {volumeChange === 'down' && <ArrowDownIcon className="w-4 h-4 text-red-500" />}
            {volumeChange === 'same' && <MinusIcon className="w-4 h-4 text-gray-400" />}
          </span>
        )}
      </div>

      {/* TSS distribution bar */}
      {totalTssForBar > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
          {bikeRatio > 0 && <div style={{ width: `${bikeRatio*100}%`, backgroundColor: '#3b82f6' }} className="rounded-full" />}
          {runRatio  > 0 && <div style={{ width: `${runRatio*100}%`,  backgroundColor: '#f97316' }} className="rounded-full" />}
          {swimRatio > 0 && <div style={{ width: `${swimRatio*100}%`, backgroundColor: '#06b6d4' }} className="rounded-full" />}
          {(1 - bikeRatio - runRatio - swimRatio) > 0.01 && (
            <div style={{ flex: 1, backgroundColor: '#8b5cf6' }} className="rounded-full" />
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
  /** Called with (id, newDateStr) when a workout is moved via drag */
  onMovePlannedWorkout = null,
  /** Called with (pw, newDateStr) when a workout is copied via Alt+drag */
  onCopyPlannedWorkout = null,
  /** Optional: called with (activity, element) to open custom popup */
  onActivityClick = null,
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

  // Initialize sportFilter from localStorage or default to 'all'
  const getInitialSportFilter = () => {
    const saved = localStorage.getItem('calendarView_sportFilter');
    return saved || 'all';
  };

  const [sportFilter, setSportFilter] = useState(getInitialSportFilter);
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  // Optimistic selection — marks activity immediately on click, before parent updates selectedActivityId
  const [optimisticSelectedId, setOptimisticSelectedId] = useState(null);

  // User profile data for TSS calculation
  const [userProfile, setUserProfile] = useState(null);

  // Drag & drop state for planned workout rescheduling
  const [draggedPw, setDraggedPw] = useState(null); // { pw, isCopy }
  const [dragOverKey, setDragOverKey] = useState(null); // date key being hovered

  // Activity detail popup state: { activity, rect }
  const [activityPopup, setActivityPopup] = useState(null);

  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

  // Notify parent about the stats period (week on desktop week view, otherwise calendar month)
  useEffect(() => {
    if (!onVisiblePeriodChange) return;
    const useWeek = !isMobile && view === 'week';
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

  // Auto-expand the day containing the selected activity
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
      }
    }
  }, [effectiveSelectedId, activities]);

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
  const handleSelectActivity = (a) => {
    const id = a.id || a._id;
    if (id) setOptimisticSelectedId(String(id));
    if (onSelectActivity) onSelectActivity(a);
  };

  // Activity click handler: show popup and also select
  const handleActivityClick = (a, e) => {
    if (onActivityClick) {
      onActivityClick(a, e.currentTarget);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setActivityPopup({ activity: a, rect });
      // Also select the activity
      handleSelectActivity(a);
    }
  };

  const filteredActivities = useMemo(() => {
    if (sportFilter === 'all') return activities;
    return activities.filter(a => sportToBucket(a.sport) === sportFilter);
  }, [activities, sportFilter]);

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
    return map;
  }, [filteredActivities]);

  // Map planned workouts by local date string
  const plannedByDay = useMemo(() => {
    const map = new Map();
    plannedWorkouts.forEach(pw => {
      if (!pw.date) return;
      // date is stored as YYYY-MM-DD string — use as-is (no timezone conversion needed)
      const key = String(pw.date).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(pw);
    });
    return map;
  }, [plannedWorkouts]);

  const days = useMemo(() => {
    if (view === 'week' && !isMobile) {
      // Desktop week view
      const start = startOfWeek(anchorDate);
      return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
    }
    // Mobile: always show month, Desktop: show month or week based on view
    const start = startOfWeek(startOfMonth(anchorDate));
    return Array.from({ length: 42 }).map((_, i) => addDays(start, i));
  }, [view, anchorDate, isMobile]);

  const prev = () => {
    setDirection(-1);
    if (isMobile && view === 'week') {
      setAnchorDate(d => addDays(d, -7));
    } else if (view === 'week' && !isMobile) {
      setAnchorDate(d => addDays(d, -7));
    } else {
      setAnchorDate(d => new Date(d.getFullYear(), d.getMonth()-1, 1));
    }
  };
  const next = () => {
    setDirection(1);
    if (isMobile && view === 'week') {
      setAnchorDate(d => addDays(d, 7));
    } else if (view === 'week' && !isMobile) {
      setAnchorDate(d => addDays(d, 7));
    } else {
      setAnchorDate(d => new Date(d.getFullYear(), d.getMonth()+1, 1));
    }
  };
  const today = () => setAnchorDate(new Date());

  const [selectedDay, setSelectedDay] = useState(null); // YYYY-MM-DD key of selected day on mobile
  const [direction, setDirection] = useState(0); // -1 = going back, 1 = going forward
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Handle day click on mobile - select day and show activities below
  const handleDayClick = (dayDate) => {
    if (isMobile) {
      const key = getLocalDateString(dayDate);
      setSelectedDay(prev => prev === key ? null : key); // toggle
    }
  };

  // Weekly summary (last 4 weeks)
  // Weekly summary only for weeks currently visible in the calendar grid
  // In week view, show only the current week
  const weeklySummary = useMemo(() => {
    if (!days || days.length === 0) return [];

    // In week view, only show the current week
    let visibleWeekKeys;
    if (isMobile && view === 'week') {
      // Only the current week
      const currentWeekStart = startOfWeek(anchorDate);
      visibleWeekKeys = new Set([currentWeekStart.toISOString().slice(0,10)]);
    } else {
    // Which week starts are visible in the current grid
      visibleWeekKeys = new Set(
      days.map(d => startOfWeek(d).toISOString().slice(0,10))
    );
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

    const sorted = Object.values(summary)
      .sort((a, b) => b.weekStart - a.weekStart);

    // Add comparison with previous week
    return sorted.map((week, index) => {
      const prevWeek = index < sorted.length - 1 ? sorted[index + 1] : null;
      let volumeChange = null; // 'up', 'down', 'same', or null

      if (prevWeek) {
        if (week.totalSeconds > prevWeek.totalSeconds) {
          volumeChange = 'up';
        } else if (week.totalSeconds < prevWeek.totalSeconds) {
          volumeChange = 'down';
        } else {
          volumeChange = 'same';
        }
      }

      return {
        ...week,
        volumeChange,
        prevWeekTotalSeconds: prevWeek?.totalSeconds || null
      };
    });
  }, [filteredActivities, days, userProfile, isMobile, view, anchorDate]);

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className={`${isFullscreen ? 'fixed inset-0 z-[9998] bg-white flex flex-col p-4 md:p-5' : (isMobile ? 'bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-3' : 'bg-white rounded-2xl border border-gray-200 shadow-sm p-4 md:p-5 mb-4 md:mb-6')} overflow-hidden`}>
      {/* Header */}
      {isMobile ? (
        <div className="flex items-center justify-between mb-2 px-1">
          <button onClick={prev} className="p-1.5 rounded-full active:bg-gray-100 transition-colors touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
            <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
          </button>
          <button onClick={today} className="text-sm font-bold text-gray-900 uppercase tracking-wide active:text-primary transition-colors touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
            {anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </button>
          <button onClick={next} className="p-1.5 rounded-full active:bg-gray-100 transition-colors touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
            <ChevronRightIcon className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      ) : (
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
          {anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
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
          <button
            onClick={() => setView('week')}
            className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border shadow-sm transition-colors text-xs md:text-sm ${view==='week'?'bg-primary text-white border-primary hover:bg-primary-dark':'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`}
          >
            Week
          </button>
          <button
            onClick={() => setView('month')}
            className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border shadow-sm transition-colors text-xs md:text-sm ${view==='month'?'bg-primary text-white border-primary hover:bg-primary-dark':'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`}
          >
            Month
          </button>
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

      {/* Mobile: Strava-like compact month grid */}
      {isMobile ? (
        <div>
          {/* Compact month grid */}
          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={anchorDate.toISOString().slice(0, 7)}
            initial={{ opacity: 0, x: direction * 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -30 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="grid grid-cols-7 gap-0"
          >
            {/* Day name headers */}
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
            ))}
            {/* Day cells */}
            {days.map((dayDate, dayIdx) => {
              const key = getLocalDateString(dayDate);
              const isCurrentMonth = dayDate.getMonth() === anchorDate.getMonth();
              const acts = activitiesByDay.get(key) || [];
              const mobilePlanned = plannedByDay.get(key) || [];
              const isToday = isSameDay(dayDate, new Date());
              const isSelected = selectedDay === key;

              const sportDots = acts.slice(0, 4).map(a => {
                const s = (a.sport || '').toLowerCase();
                if (s.includes('run')) return '#f97316';
                if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) return '#3b82f6';
                if (s.includes('swim')) return '#06b6d4';
                if (s.includes('strength') || s.includes('gym') || s.includes('weight')) return '#8b5cf6';
                return '#9ca3af';
              });

              return (
                <motion.button
                  key={dayIdx}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.18, delay: dayIdx * 0.008 }}
                  onClick={() => {
                    handleDayClick(dayDate);
                    if (acts.length === 1) {
                      handleSelectActivity(acts[0]);
                    }
                  }}
                  className={`flex flex-col items-center py-1.5 touch-manipulation transition-colors relative ${
                    !isCurrentMonth ? 'opacity-30' : ''
                  } ${isSelected ? 'bg-primary/10 rounded-lg' : ''}`}
                  style={{ WebkitTapHighlightColor: 'transparent', minHeight: '44px' }}
                >
                  <span className={`text-xs font-medium leading-none ${
                    isToday
                      ? 'bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center font-bold'
                      : isSelected
                        ? 'text-primary font-bold'
                        : 'text-gray-800'
                  }`}>
                    {dayDate.getDate()}
                  </span>
                  {/* Activity dots */}
                  {(sportDots.length > 0 || mobilePlanned.length > 0) && (
                    <div className="flex items-center gap-[3px] mt-1 flex-wrap justify-center">
                      {sportDots.map((color, i) => (
                        <div key={i} className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: color }} />
                      ))}
                      {mobilePlanned.map((pw, i) => {
                        const sport = (pw.sport || 'bike').toLowerCase();
                        const c = SPORT_PLAN_COLORS[sport] || '#767EB5';
                        return (
                          <div key={`pd-${i}`} className="w-[5px] h-[5px] rounded-full border" style={{ borderColor: c, backgroundColor: 'transparent' }} />
                        );
                      })}
                    </div>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
          </AnimatePresence>

          {/* Selected day activities + planned workouts - show below calendar */}
          {selectedDay && (() => {
            const dayActs = activitiesByDay.get(selectedDay) || [];
            const dayPlanned = plannedByDay.get(selectedDay) || [];
            if (dayActs.length === 0 && dayPlanned.length === 0) return null;
            const dayDate = new Date(selectedDay + 'T12:00:00');
            const dayLabel = dayDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

            return (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="mt-3 space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{dayLabel}</div>
                  {onPlanWorkout && (
                    <button
                      onClick={() => onPlanWorkout(new Date(selectedDay + 'T12:00:00'))}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-primary/40 text-primary text-xs font-semibold hover:bg-primary/5 transition-colors"
                    >
                      <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" d="M8 3v10M3 8h10" />
                      </svg>
                      Plan workout
                    </button>
                  )}
                </div>
                {/* Planned workouts */}
                {dayPlanned.map((pw, pi) => (
                  <PlannedWorkoutCard
                    key={`mplan-${pi}`}
                    pw={pw}
                    onSelect={onSelectPlannedWorkout}
                    onStart={onStartWorkout}
                  />
                ))}
                {dayActs.map((a, i) => {
                  const activityId = a.id || a._id;
                  const isActSelected = effectiveSelectedId && String(activityId) === String(effectiveSelectedId);
                  const title = a.title || a.name || a.originalFileName || 'Activity';
                  const duration = Number(a.totalTimerTime || a.moving_time || a.movingTime || a.totalElapsedTime || a.elapsedTime || a.duration || 0);
                  const distance = Number(a.distance || 0);
                  const durationStr = duration > 0
                    ? `${Math.floor(duration / 3600)}:${String(Math.floor((duration % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(duration % 60)).padStart(2, '0')}`
                    : '';
                  const distanceStr = distance > 0 ? formatKm(distance) : '';
                  const tss = Number(a.tss || a.TSS || a.totalTSS || 0);

                  return (
                    <div key={i} className="w-full">
                      <button
                        onClick={() => handleSelectActivity(a)}
                        className={`w-full text-left rounded-xl border p-3 transition-all touch-manipulation ${
                          isActSelected
                            ? 'border-primary bg-primary/5 shadow-md ring-1 ring-primary/20'
                            : 'border-gray-200 bg-white shadow-sm active:bg-gray-50'
                        }`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <div className="flex items-center gap-3">
                          <SportIcon sport={a.sport} className="w-8 h-8" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {durationStr && <span className="text-xs text-gray-500">{durationStr}</span>}
                              {distanceStr && <><span className="text-xs text-gray-300">•</span><span className="text-xs text-gray-500">{distanceStr}</span></>}
                              {tss > 0 && <><span className="text-xs text-gray-300">•</span><span className="text-xs text-gray-500">{Math.round(tss)} TSS</span></>}
                            </div>
                          </div>
                          {(commentCounts[String(a._id || a.id)] || 0) > 0 && (
                            <span className="text-xs text-gray-400 flex-shrink-0">💬 {commentCounts[String(a._id || a.id)]}</span>
                          )}
                          <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        </div>
                        {a.category && (
                          <div
                            className="mt-2 inline-block text-[10px] px-2 py-0.5 rounded-full border font-semibold"
                            style={catBadgeStyle(a.category)}
                          >
                            {catLabel(a.category)}
                          </div>
                        )}
                      </button>
                      {onAddLactate && a.type === 'strava' && (
                        <button
                          onClick={() => onAddLactate(a)}
                          className="mt-1 w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-xs font-semibold active:bg-violet-100 touch-manipulation"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                          <span className="text-base leading-none">+</span> Add Lactate
                        </button>
                      )}
                    </div>
                  );
                })}
              </motion.div>
            );
          })()}
        </div>
      ) : (
        /* Desktop: Original grid layout */
        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={anchorDate.toISOString().slice(0, 7)}
          initial={{ opacity: 0, x: direction * 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -30 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className={`grid gap-px bg-gray-100 rounded-xl overflow-hidden ${isFullscreen ? 'overflow-y-auto flex-1' : ''}`}
          style={{ gridTemplateColumns: view==='week' ? 'repeat(7, 1fr) minmax(140px,180px)' : 'repeat(7, 1fr) minmax(140px,180px)' }}
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
                const acts = activitiesByDay.get(key) || [];
                const isToday = isSameDay(dayDate, new Date());
                const isExpanded = expandedDays.has(key);
                const hasOverflow = acts.length > 3;
                const visibleActs = isExpanded
                  ? acts
                  : (hasOverflow ? acts.slice(0, 2) : acts.slice(0, 3));
                const remainingCount = hasOverflow ? (acts.length - 2) : 0;

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
                const plannedForDay = plannedByDay.get(key) || [];
                const isDragTarget = dragOverKey === key && draggedPw && draggedPw.pw.date !== key;
                return (
                  <motion.div
                    key={`day-${weekIdx}-${dayIdx}`}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.18, delay: cellIdx * 0.008 }}
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
                    <div className="space-y-1 w-full" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                      {/* Planned workouts first (dashed) */}
                      {plannedForDay.map((pw, pi) => (
                        <PlannedWorkoutCard
                          key={`plan-${pi}`}
                          pw={pw}
                          compact
                          onSelect={onSelectPlannedWorkout}
                          onStart={onStartWorkout}
                          isDragging={draggedPw?.pw?._id === pw._id}
                          onDragStart={e => { e.dataTransfer.effectAllowed = 'copyMove'; setDraggedPw({ pw, isCopy: e.altKey }); }}
                          onDragEnd={() => { setDraggedPw(null); setDragOverKey(null); }}
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
                              onClick={(e) => handleActivityClick(a, e)}
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
                                borderLeftWidth: a.category ? '3px' : undefined,
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
                                {a.category && (
                                  <div
                                    className="text-[8px] px-1 py-0.5 rounded flex-shrink-0 font-semibold border"
                                    style={catBadgeStyle(a.category)}
                                  >
                                    {catLabel(a.category).substring(0, 4)}
                                  </div>
                                )}
                              </div>
                              {/* Duration + distance second line */}
                              {(durStr || distStr) && (
                                <div className={`flex items-center gap-1.5 text-[9px] ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
                                  {durStr && <span>{durStr}</span>}
                                  {durStr && distStr && <span>·</span>}
                                  {distStr && <span>{distStr}</span>}
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
                          className="w-full text-left text-[10px] md:text-[11px] px-2 md:px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-sm transition-all font-medium flex items-center gap-1.5"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronDownIcon className="w-3 h-3 flex-shrink-0 text-gray-500" />
                              <span className="text-gray-600">Show less</span>
                            </>
                          ) : (
                            <>
                              <span className="text-primary font-bold">+</span>
                              <span className="text-gray-600">{remainingCount} more</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              }),
              // Week summary column — richer redesign
              <WeekSummaryCell
                key={`summary-${weekIdx}`}
                weekSummary={weekSummary}
                formatHours={formatHours}
                formatKm={formatKm}
                user={user}
              />
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
        />
      )}
    </motion.div>
  );
  return isFullscreen ? ReactDOM.createPortal(calendarContent, document.body) : calendarContent;
}
