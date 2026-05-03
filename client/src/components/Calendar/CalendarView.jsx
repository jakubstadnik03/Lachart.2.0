import React, { useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
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
  PencilIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { Bike, Dumbbell, Footprints, WavesLadder, Zap as ZapIcon } from 'lucide-react';
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

const SportIcon = ({ sport, className = "w-4 h-4" }) => {
  if (!sport) return null;
  const s = String(sport).toLowerCase();
  if (s.includes('run') || s.includes('walk') || s.includes('hike') || s.includes('trail'))
    return <Footprints className={`${className} text-orange-500 flex-shrink-0`} strokeWidth={2} />;
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual'))
    return <Bike className={`${className} text-blue-500 flex-shrink-0`} strokeWidth={2} />;
  if (s.includes('swim'))
    return <WavesLadder className={`${className} text-cyan-500 flex-shrink-0`} strokeWidth={2} />;
  if (s.includes('gym') || s.includes('weight') || s.includes('strength'))
    return <Dumbbell className={`${className} text-purple-500 flex-shrink-0`} strokeWidth={2} />;
  return <ZapIcon className={`${className} text-gray-400 flex-shrink-0`} strokeWidth={2} />;
};

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

// ─── Planned workout card (desktop) ──────────────────────────────────────────
function PlannedWorkoutCard({ pw, onSelect, onStart, compact = false, onDragStart, onDragEnd, isDragging = false, compliance = null, onDuplicate = null, onDelete = null, onRepeat = null }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [repeatOpen, setRepeatOpen] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState({ top: 0, right: 0 });
  const menuBtnRef = React.useRef(null);

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

  const sport = (pw.sport || 'bike').toLowerCase();
  const color = SPORT_PLAN_COLORS[sport] || '#767EB5';
  const duration = planStepTotalSecs(pw.steps);
  const isCompleted = pw.status === 'completed';
  const isSkipped   = pw.status === 'skipped';

  if (compact) {
    // ── Match WeekActivityCard visual style ──
    // planned  → white bg, solid left border in sport color, sport icon, title, duration
    // compliance hit → left border turns compliance color, subtle tinted bg
    // completed green → filled green gradient (like selected activity card)
    const isGreen = compliance?.color === '#22c55e' || (isCompleted && !compliance);
    const leftBorderColor = isGreen ? '#22c55e' : compliance ? compliance.color : color;

    return (
      <div
        className="relative group/plan w-full max-w-full"
        style={{ minWidth: 0, opacity: isDragging ? 0.4 : isSkipped ? 0.45 : 1, transition: 'opacity 0.15s' }}
        draggable={!isCompleted && !isSkipped}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <button
          onClick={() => onSelect && onSelect(pw)}
          className={`w-full max-w-full text-left rounded-xl border transition-all p-2 flex flex-col gap-1 ${
            isGreen
              ? 'bg-gradient-to-br from-green-500 to-green-600 border-transparent shadow-md'
              : compliance
                ? 'bg-white border-gray-200 shadow-sm hover:bg-gray-50'
                : 'bg-white border-gray-200 shadow-sm hover:bg-gray-50 hover:shadow-md'
          }`}
          style={{
            borderLeftColor: leftBorderColor,
            borderLeftWidth: 3,
            minWidth: 0, overflow: 'hidden',
            cursor: (!isCompleted && !isSkipped) ? 'grab' : 'pointer',
          }}
          title={pw.title}
        >
          {/* Title row — sport icon + title */}
          <div className="flex items-center gap-1.5 min-w-0">
            {isGreen
              ? <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0 text-white" />
              : <SportIcon sport={sport} className="w-3.5 h-3.5 flex-shrink-0" />
            }
            <span
              className="text-[11px] font-bold truncate flex-1"
              style={{ color: isGreen ? '#fff' : isSkipped ? '#9ca3af' : '#1e293b' }}
            >
              {pw.title || 'Planned'}
            </span>
            {/* Compliance dot for non-green matches */}
            {compliance && !isGreen && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: compliance.color }} />
            )}
          </div>
          {/* Duration + stats row */}
          {(duration > 0 || pw.targetTss > 0) && (
            <div className="flex items-center gap-2 text-[10px] mt-0.5">
              {duration > 0 && (
                <span style={{ color: isGreen ? 'rgba(255,255,255,0.85)' : '#6b7280' }}>
                  {fmtPlanDuration(duration)}
                </span>
              )}
              {pw.targetTss > 0 && (
                <>
                  <span style={{ color: isGreen ? 'rgba(255,255,255,0.4)' : '#d1d5db' }}>·</span>
                  <span style={{ color: isGreen ? 'rgba(255,255,255,0.85)' : '#6b7280' }}>{pw.targetTss} TSS</span>
                </>
              )}
              {compliance && (
                <span className="ml-auto text-[9px] font-bold" style={{ color: isGreen ? 'rgba(255,255,255,0.9)' : compliance.color }}>
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
  const isGreenFull = compliance?.color === '#22c55e' || (isCompleted && !compliance);
  const leftBorderFull = isGreenFull ? '#22c55e' : compliance ? compliance.color : color;
  return (
    <div
      className="w-full rounded-xl border border-gray-200 overflow-hidden transition-all bg-white shadow-sm"
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

// ─── Lap Chart ───────────────────────────────────────────────────────────────
function LapChart({ laps, color, isBike, isRun, selectedLap, onSelectLap }) {
  const W = 600, H = 100, PAD = { t: 14, b: 18, l: 4, r: 4 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const GAP = 2;

  // Lap durations — bar widths are proportional to elapsed time
  const durations = laps.map(l => l.elapsed_time || l.totalElapsedTime || l.duration || 0);
  const totalDur  = durations.reduce((s, d) => s + d, 0) || 1;

  // Primary metric per lap (height)
  const primary = laps.map((lap, i) => {
    const dur = durations[i];
    const d   = Number(lap.distance || 0);
    if (isBike) return Number(lap.average_watts || lap.avgPower || 0);
    if (isRun && d > 0 && dur > 0) return dur / (d / 1000); // sec/km — lower is faster
    return dur;
  });

  const hrVals = laps.map(l => Number(l.average_heartrate || l.averageHeartRate || l.avgHR || 0));
  const hasHr  = hrVals.some(v => v > 0);
  const hasLa  = laps.some(l => l.lactate != null || l.lactateValue != null);

  const validP = primary.filter(Boolean);
  const pMax = Math.max(...validP, 1);
  const pMin = isRun ? Math.min(...validP, pMax) : 0;
  const pRange = pMax - pMin || 1;

  const hrMax = hasHr ? Math.max(...hrVals.filter(Boolean), 1) : 1;
  const hrMin = hasHr ? Math.min(...hrVals.filter(Boolean), hrMax) : 0;
  const hrRange = hrMax - hrMin || 1;

  const laVals = hasLa ? laps.map(l => { const v = l.lactate ?? l.lactateValue; return v != null ? Number(v) : null; }) : [];
  const laMax  = hasLa ? Math.max(...laVals.filter(v => v != null), 1) : 1;
  const laMin  = hasLa ? Math.min(...laVals.filter(v => v != null), laMax) : 0;
  const laRange = laMax - laMin || 1;

  // Compute x-position and width for each bar
  const totalGapW = GAP * (laps.length - 1);
  const availW = innerW - totalGapW;
  const barXW = laps.map((_, i) => {
    const bw = (durations[i] / totalDur) * availW;
    const x  = PAD.l + laps.slice(0, i).reduce((s, _, j) => s + (durations[j] / totalDur) * availW + GAP, 0);
    return { x, bw };
  });

  // Bar height: for run/pace, lower sec/km = faster → taller bar (invert)
  const barH = (val) => {
    if (!val) return 3;
    const norm = isRun ? (pMax - val) / pRange : (val - pMin) / pRange;
    return Math.max(3, norm * innerH);
  };
  const yBar = (val) => PAD.t + innerH - barH(val);

  // HR line
  const hrY = (v) => v > 0 ? PAD.t + innerH - ((v - hrMin) / hrRange) * innerH : null;
  const hrPoints = laps.map((_, i) => {
    const { x, bw } = barXW[i];
    const cy = hrY(hrVals[i]);
    return cy != null ? `${x + bw / 2},${cy}` : null;
  }).filter(Boolean).join(' ');

  const laY = (v) => v != null ? PAD.t + innerH - ((v - laMin) / laRange) * innerH : null;

  const fmtPrimary = (val) => {
    if (!val) return '';
    if (isBike) return `${Math.round(val)}W`;
    if (isRun) { const m = Math.floor(val / 60); return `${m}:${String(Math.round(val % 60)).padStart(2, '0')}`; }
    return '';
  };

  return (
    <div className="px-4 pb-3">
      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-3">
        <span>{isBike ? 'Power per lap (width = duration)' : isRun ? 'Pace per lap (width = duration)' : 'Laps (width = duration)'}</span>
        {hasHr && <span className="text-red-400">— HR</span>}
        {hasLa && <span style={{ color: '#7c3aed' }}>· La</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 100 }}>
        {laps.map((lap, i) => {
          const { x, bw } = barXW[i];
          const val = primary[i];
          const bh  = barH(val);
          const by  = yBar(val);
          const sel = selectedLap === i;
          const lapNum = lap.lapNumber ?? (i + 1);
          return (
            <g key={i} style={{ cursor: 'pointer' }} onClick={() => onSelectLap(i)}>
              {/* Bar */}
              <rect
                x={x} y={by} width={Math.max(bw, 1)} height={bh}
                rx={2}
                fill={sel ? color : color + '70'}
              />
              {/* Full-height click zone */}
              <rect x={x} y={PAD.t} width={Math.max(bw, 1)} height={innerH} rx={2} fill="transparent" />
              {/* Value label above bar (when selected or wide enough) */}
              {val > 0 && (bw > 28 || sel) && (
                <text
                  x={x + bw / 2} y={by - 2}
                  textAnchor="middle" fontSize={sel ? 8 : 7}
                  fill={sel ? color : color + 'cc'} fontWeight={sel ? 'bold' : 'normal'}
                >
                  {fmtPrimary(val)}
                </text>
              )}
              {/* Lap number — only if wide enough */}
              {bw > 14 && (
                <text
                  x={x + bw / 2} y={H - 4}
                  textAnchor="middle" fontSize={7}
                  fill={sel ? color : '#9ca3af'}
                  fontWeight={sel ? 'bold' : 'normal'}
                >
                  {lapNum}
                </text>
              )}
            </g>
          );
        })}
        {/* HR line */}
        {hasHr && hrPoints && (
          <polyline points={hrPoints} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeLinejoin="round" opacity={0.8} />
        )}
        {/* HR dots */}
        {hasHr && hrVals.map((v, i) => {
          const { x, bw } = barXW[i];
          const cy = hrY(v);
          if (!cy) return null;
          return <circle key={i} cx={x + bw / 2} cy={cy} r={selectedLap === i ? 3 : 2} fill="#ef4444" opacity={0.9} style={{ cursor: 'pointer' }} onClick={() => onSelectLap(i)} />;
        })}
        {/* Lactate dots */}
        {hasLa && laVals.map((v, i) => {
          if (v == null) return null;
          const { x, bw } = barXW[i];
          const cy = laY(v);
          return (
            <g key={i} style={{ cursor: 'pointer' }} onClick={() => onSelectLap(i)}>
              <circle cx={x + bw / 2} cy={cy} r={selectedLap === i ? 3.5 : 2.5} fill="#7c3aed" opacity={0.9} />
              {selectedLap === i && (
                <text x={x + bw / 2 + 4} y={cy - 2} fontSize={7} fill="#7c3aed" fontWeight="bold">{v.toFixed(1)}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Activity Full Modal ──────────────────────────────────────────────────────
function ActivityFullModal({ activity, plannedWorkout: initialPlannedWorkout, onClose, onEditPlanned, onAddLactate, onPlannedSaved, onOpenFull = null }) {
  const a = activity;
  const color = sportColor(a.sport);
  const sport = String(a.sport || '').toLowerCase();
  const isRun  = sport.includes('run') || sport.includes('walk') || sport.includes('hike');
  const isSwim = sport.includes('swim');
  const isBike = sport.includes('ride') || sport.includes('cycle') || sport.includes('bike');

  // Full detail loaded async (for laps)
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setDetailLoading(true);
      try {
        const id = String(a.id || a._id || '');
        let data = null;
        if (id.startsWith('strava-')) {
          const { getStravaActivityDetail } = await import('../../services/api.js');
          const raw = await getStravaActivityDetail(id.replace('strava-', ''));
          data = { ...raw.detail, laps: raw.laps || [], description: raw.description, titleManual: raw.titleManual };
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
  }, [a.id, a._id]);

  // Merge summary + full detail — detail wins for laps/stats when available
  const merged = detail ? { ...a, ...detail } : a;

  // Lap selection
  const [selectedLap, setSelectedLap] = useState(null);
  const lapRowRefs = useRef([]);

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

  // Completed metadata edit state (title/description — works for FIT/Strava/regular)
  const [completedForm, setCompletedForm] = useState({ title: '', description: '' });
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

  // Smart distance parser: "10" → "10 km", "500m" → "0.5 km"
  const parseDistanceToKm = (raw) => {
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (s.endsWith('km')) return parseFloat(s);
    if (s.endsWith('m')) return parseFloat(s) / 1000;
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    // If > 500 assume metres, else km
    return n > 500 ? n / 1000 : n;
  };

  const initDurMins = initialPlannedWorkout?.plannedDuration
    ? Math.round(initialPlannedWorkout.plannedDuration / 60) : null;
  const initDistKm = initialPlannedWorkout?.plannedDistance
    ? Number(initialPlannedWorkout.plannedDistance) : null;

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

  // Escape to close
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Activity data (use merged = summary + full detail) ──
  const title = merged.titleManual || merged.title || merged.name || merged.originalFileName || 'Activity';
  const dur = Number(merged.duration || merged.elapsed_time || merged.movingTime || merged.moving_time || merged.totalTimerTime || merged.totalElapsedTime || merged.elapsedTime || 0);
  const dist = Number(merged.distance || merged.totalDistance || 0);
  const tss  = Number(merged.tss || merged.trainingLoad || merged.totalTSS || 0);
  const hrTss = Number(merged.hrTSS || merged.hrTss || 0);
  const power = Number(merged.normalizedPower || merged.avgPower || merged.averagePower || merged.average_watts || 0);
  const np    = Number(merged.normalizedPower || 0);
  const hr    = Number(merged.averageHeartRate || merged.average_heartrate || merged.avgHR || merged.avgHeartRate || 0);
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
  const plannedDist = plannedWorkout ? Number(plannedWorkout.plannedDistance || 0) : 0;
  const complianceRow = (plannedDur > 0 && dur > 0) ? getCompliance(plannedDur, dur) : null;

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
        ...(planForm.distanceKm > 0 && { plannedDistance: planForm.distanceKm }),
        targetTss: planForm.targetTss ? Number(planForm.targetTss) : (tss || undefined),
      };
      let saved;
      if (plannedWorkout?._id) {
        saved = await updatePlannedWorkout(plannedWorkout._id, payload);
      } else {
        saved = await createPlannedWorkout(payload);
      }
      setPlannedWorkout(saved);
      setEditingPlanned(false);
      if (onPlannedSaved) onPlannedSaved(saved);
    } catch (err) {
      console.error('Failed to save planned workout', err);
    } finally {
      setSavingPlan(false);
    }
  };

  const planSteps = Array.isArray(plannedWorkout?.steps) ? plannedWorkout.steps : [];

  // ── Seed completed-metadata form once activity title/notes are known ──
  useEffect(() => {
    setCompletedForm({ title: title || '', description: notes || '' });
  }, [title, notes]);

  const handleSaveCompleted = async () => {
    setSavingCompleted(true);
    try {
      const id = String(merged.id || merged._id || '');
      const payload = { title: completedForm.title, description: completedForm.description };
      if (id.startsWith('strava-')) {
        const { updateStravaActivity } = await import('../../services/api.js');
        await updateStravaActivity(id.replace('strava-', ''), payload);
      } else if (id.startsWith('fit-')) {
        const { updateFitTraining } = await import('../../services/api.js');
        await updateFitTraining(id.replace('fit-', ''), payload);
      } else if (id.startsWith('regular-') || id) {
        const { updateTraining } = await import('../../services/api.js');
        await updateTraining(id.replace('regular-', ''), payload);
      }
      setDetail(prev => ({ ...(prev || {}), titleManual: completedForm.title, description: completedForm.description }));
    } catch (err) {
      console.error('Failed to save completed metadata', err);
    } finally {
      setSavingCompleted(false);
    }
  };

  // ── Compliance helpers (TrainingPeaks-style) ──
  const compliancePct = (planned, actual) => (planned > 0 && actual > 0) ? Math.round((actual / planned) * 100) : null;
  const complianceColorPct = (pct) => {
    if (pct == null) return '#9ca3af';
    if (pct >= 95 && pct <= 105) return '#22c55e'; // green
    if (pct >= 80 && pct <= 120) return '#eab308'; // yellow
    return '#f97316'; // orange
  };
  const durPct  = compliancePct(plannedDur, dur);
  const distPct = compliancePct(plannedDist * 1000, dist); // plannedDistance is in km
  const tssPct  = compliancePct(plannedTss, tss);

  // ── MOBILE LAYOUT (TrainingPeaks-style) ──
  if (isMobile) {
    const hasPlanned = !!plannedWorkout && (plannedDur > 0 || plannedDist > 0 || plannedTss > 0);
    const TabBtn = ({ id, label }) => (
      <button
        onClick={() => setMobileView(id)}
        className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
          mobileView === id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400'
        }`}
      >
        {label}
      </button>
    );
    const ComplianceBar = ({ pct }) => {
      if (pct == null) return null;
      const c = complianceColorPct(pct);
      const widthPct = Math.max(8, Math.min(100, pct));
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${widthPct}%`, backgroundColor: c }} />
          </div>
          <span className="text-xs font-bold tabular-nums w-12 text-right" style={{ color: c }}>{pct}%</span>
        </div>
      );
    };

    return ReactDOM.createPortal(
      <div className="fixed inset-0 z-[10001] bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <SportIcon sport={a.sport} className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-900 text-base truncate">{title}</div>
            <div className="text-xs text-gray-400">{dateStr}</div>
          </div>
          {mobileView !== 'edit' && (
            <button
              onClick={() => setMobileView('edit')}
              title="Edit"
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 active:bg-gray-200"
            >
              <PencilIcon className="w-5 h-5" />
            </button>
          )}
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 active:bg-gray-200">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs (hidden in edit mode) */}
        {mobileView !== 'edit' && (
          <div className="flex border-b border-gray-100 flex-shrink-0">
            <TabBtn id="summary" label="Summary" />
            {laps.length > 0 && <TabBtn id="laps" label={`Laps (${laps.length})`} />}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {mobileView === 'summary' && (
            <div className="px-4 py-4 space-y-4">
              {/* Big completed stats */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Duration', value: fmtDur(dur) },
                  ...(dist > 0 ? [{ label: 'Distance', value: fmtDist(dist) }] : []),
                  ...(paceStr ? [{ label: 'Pace', value: paceStr }] : []),
                  ...(hr > 0 ? [{ label: 'HR', value: `${Math.round(hr)} bpm` }] : []),
                  ...(isBike && power > 0 ? [{ label: 'Power', value: `${Math.round(power)} W` }] : []),
                  ...(tss > 0 ? [{ label: 'TSS', value: Math.round(tss) }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl bg-gray-50 px-3 py-2">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{label}</div>
                    <div className="text-base font-bold text-gray-800 tabular-nums mt-0.5">{value}</div>
                  </div>
                ))}
              </div>

              {/* Compliance — only if planned exists */}
              {hasPlanned && (
                <div className="rounded-xl border border-gray-100 p-3 space-y-3">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wide">Compliance</div>
                  {plannedDur > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-semibold text-gray-600">Duration</span>
                        <span className="text-gray-400 tabular-nums">{fmtDur(plannedDur)} → {fmtDur(dur)}</span>
                      </div>
                      <ComplianceBar pct={durPct} />
                    </div>
                  )}
                  {plannedDist > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-semibold text-gray-600">Distance</span>
                        <span className="text-gray-400 tabular-nums">{fmtDist(plannedDist * 1000)} → {fmtDist(dist)}</span>
                      </div>
                      <ComplianceBar pct={distPct} />
                    </div>
                  )}
                  {plannedTss > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-semibold text-gray-600">TSS</span>
                        <span className="text-gray-400 tabular-nums">{plannedTss} → {Math.round(tss) || '—'}</span>
                      </div>
                      <ComplianceBar pct={tssPct} />
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              {notes && (
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</div>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{notes}</p>
                </div>
              )}

              {/* Planned details (description / intervals) */}
              {hasPlanned && plannedWorkout?.description && (
                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Planned description</div>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{plannedWorkout.description}</p>
                </div>
              )}
            </div>
          )}

          {mobileView === 'laps' && laps.length > 0 && (
            <div className="px-4 py-3">
              {laps.length > 1 && (
                <div className="mb-3">
                  <LapChart laps={laps} color={color} isBike={isBike} isRun={isRun} selectedLap={selectedLap} onSelectLap={setSelectedLap} />
                </div>
              )}
              {(() => {
                const hasLactate = laps.some(l => (l.lactate ?? l.lactateValue) != null);
                const hasPower = isBike && laps.some(l => Number(l.average_watts || l.avgPower || l.avg_power || 0) > 0);
                const hasPace = isRun && laps.some(l => Number(l.distance || 0) > 0 && (l.elapsed_time || l.totalElapsedTime || l.duration || 0) > 0);
                const hasCadence = laps.some(l => Number(l.average_cadence || l.avgCadence || l.avg_cadence || 0) > 0);
                const colTokens = ['1.5rem', '1fr', '1fr'];
                if (hasPower) colTokens.push('1fr');
                if (hasPace)  colTokens.push('1fr');
                colTokens.push('1fr'); // HR
                if (hasCadence) colTokens.push('1fr');
                if (hasLactate) colTokens.push('1fr');
                const cols = colTokens.join(' ');
                return (
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <div className="grid text-[10px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 px-3 py-2 border-b border-gray-100"
                      style={{ gridTemplateColumns: cols }}>
                      <span>#</span>
                      <span className="text-right">Time</span>
                      <span className="text-right">Dist</span>
                      {hasPower && <span className="text-right">Pwr</span>}
                      {hasPace && <span className="text-right">Pace</span>}
                      <span className="text-right">HR</span>
                      {hasCadence && <span className="text-right">{isSwim ? 'SPM' : 'Cad'}</span>}
                      {hasLactate && <span className="text-right">La</span>}
                    </div>
                    <div className="divide-y divide-gray-50">
                      {laps.map((lap, i) => {
                        const lapDur = lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0;
                        const lapDist = Number(lap.distance || 0);
                        const lapHr = Number(lap.average_heartrate || lap.averageHeartRate || lap.avgHR || 0);
                        const lapPower = Number(lap.average_watts || lap.avgPower || lap.avg_power || 0);
                        const lapCad = Number(lap.average_cadence || lap.avgCadence || lap.avg_cadence || 0);
                        const lapLa = lap.lactate ?? lap.lactateValue;
                        const lapNum = lap.lapNumber ?? (i + 1);
                        let lapPaceStr = '—';
                        if (isRun && lapDist > 0 && lapDur > 0) {
                          const spk = lapDur / (lapDist / 1000);
                          lapPaceStr = `${Math.floor(spk/60)}:${String(Math.round(spk%60)).padStart(2,'0')}`;
                        } else if (isSwim && lapDist > 0 && lapDur > 0) {
                          const sp100 = lapDur / (lapDist / 100);
                          lapPaceStr = `${Math.floor(sp100/60)}:${String(Math.round(sp100%60)).padStart(2,'0')}`;
                        }
                        return (
                          <div key={i} className="grid items-center px-3 py-2 text-xs"
                            style={{ gridTemplateColumns: cols }}>
                            <span className="font-bold text-gray-400">{lapNum}</span>
                            <span className="text-right tabular-nums font-semibold text-gray-700">{fmtLapDur(lapDur)}</span>
                            <span className="text-right tabular-nums text-gray-500">{lapDist > 0 ? (lapDist >= 1000 ? `${(lapDist/1000).toFixed(2)}` : `${Math.round(lapDist)}m`) : '—'}</span>
                            {hasPower && <span className="text-right tabular-nums font-semibold" style={{ color }}>{lapPower > 0 ? `${Math.round(lapPower)}W` : '—'}</span>}
                            {hasPace && <span className="text-right tabular-nums font-semibold" style={{ color }}>{lapPaceStr}</span>}
                            <span className="text-right tabular-nums text-gray-500">{lapHr > 0 ? Math.round(lapHr) : '—'}</span>
                            {hasCadence && <span className="text-right tabular-nums text-gray-500">{lapCad > 0 ? Math.round(lapCad) : '—'}</span>}
                            {hasLactate && <span className="text-right tabular-nums font-semibold" style={{ color: '#7c3aed' }}>{lapLa != null ? Number(lapLa).toFixed(1) : '—'}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {mobileView === 'edit' && (
            <div className="px-4 py-4 space-y-5">
              <div className="grid grid-cols-2 gap-x-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <div>Planned</div>
                <div>Completed</div>
              </div>

              {/* Title row */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase">Title</div>
                <input
                  type="text"
                  value={planForm.title}
                  onChange={e => setPlanForm(p => ({ ...p, title: e.target.value }))}
                  placeholder={title}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2"
                />
                <input
                  type="text"
                  value={completedForm.title}
                  onChange={e => setCompletedForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2"
                />
              </div>

              {/* Duration */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase">Duration</div>
                <input
                  type="text"
                  value={planForm.durationDisplay}
                  onChange={e => setPlanForm(p => ({ ...p, durationDisplay: e.target.value, durationMins: null }))}
                  onBlur={() => {
                    const mins = parseDurationToMinutes(planForm.durationDisplay);
                    if (mins != null && mins > 0) setPlanForm(p => ({ ...p, durationMins: mins, durationDisplay: formatMinutes(mins) }));
                  }}
                  placeholder="1:30"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2"
                />
                <div className="px-3 py-2 rounded-lg bg-gray-50 text-sm text-gray-700 tabular-nums">{fmtDur(dur)}</div>
              </div>

              {/* Distance */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase">Distance</div>
                <input
                  type="text"
                  value={planForm.distanceDisplay}
                  onChange={e => setPlanForm(p => ({ ...p, distanceDisplay: e.target.value, distanceKm: null }))}
                  onBlur={() => {
                    const km = parseDistanceToKm(planForm.distanceDisplay);
                    if (km != null && km > 0) setPlanForm(p => ({ ...p, distanceKm: km, distanceDisplay: `${km % 1 === 0 ? km : km.toFixed(2)} km` }));
                  }}
                  placeholder="10 km"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2"
                />
                <div className="px-3 py-2 rounded-lg bg-gray-50 text-sm text-gray-700 tabular-nums">{dist > 0 ? fmtDist(dist) : '—'}</div>
              </div>

              {/* TSS */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase">TSS</div>
                <input
                  type="number"
                  value={planForm.targetTss}
                  onChange={e => setPlanForm(p => ({ ...p, targetTss: e.target.value }))}
                  placeholder=""
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2"
                  min="0"
                />
                <div className="px-3 py-2 rounded-lg bg-gray-50 text-sm text-gray-700 tabular-nums">{tss > 0 ? Math.round(tss) : '—'}</div>
              </div>

              {/* Description */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div className="col-span-2 text-[10px] font-semibold text-gray-400 uppercase">Description</div>
                <textarea
                  value={planForm.description}
                  onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  placeholder="Workout description…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2"
                />
                <textarea
                  value={completedForm.description}
                  onChange={e => setCompletedForm(p => ({ ...p, description: e.target.value }))}
                  rows={3}
                  placeholder="How did it go?"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2"
                />
              </div>

              {/* Coach notes (planned only) */}
              <div>
                <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Coach notes (planned)</div>
                <textarea
                  value={planForm.notes}
                  onChange={e => setPlanForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  placeholder="Coach notes, instructions…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer for edit mode */}
        {mobileView === 'edit' && (
          <div className="flex gap-2 px-4 py-3 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={() => setMobileView('summary')}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 active:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await Promise.all([handleSavePlan(), handleSaveCompleted()]);
                setMobileView('summary');
              }}
              disabled={savingPlan || savingCompleted}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: color }}
            >
              {(savingPlan || savingCompleted) ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>,
      document.body
    );
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <SportIcon sport={a.sport} className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-900 text-base truncate">{title}</div>
            <div className="text-xs text-gray-400">{dateStr}</div>
          </div>
          {onOpenFull && (
            <button
              onClick={onOpenFull}
              title="Open full activity"
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <ArrowTopRightOnSquareIcon className="w-5 h-5" />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body — two columns */}
        <div className="flex flex-1 min-h-0 overflow-hidden divide-x divide-gray-100">

          {/* ── LEFT: Planned workout ── */}
          <div className="w-2/5 flex-shrink-0 flex flex-col overflow-y-auto">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2 flex-shrink-0">
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
              <div className="px-4 pb-4 flex flex-col gap-3 flex-1">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Title</label>
                  <input
                    type="text"
                    value={planForm.title}
                    onChange={e => setPlanForm(p => ({ ...p, title: e.target.value }))}
                    placeholder={title}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                      Duration
                      {planForm.durationMins > 0 && <span className="ml-1 font-normal normal-case text-gray-400">({formatMinutes(planForm.durationMins)})</span>}
                    </label>
                    <input
                      type="text"
                      value={planForm.durationDisplay}
                      onChange={e => setPlanForm(p => ({ ...p, durationDisplay: e.target.value, durationMins: null }))}
                      onBlur={() => {
                        const mins = parseDurationToMinutes(planForm.durationDisplay);
                        if (mins != null && mins > 0) {
                          setPlanForm(p => ({ ...p, durationMins: mins, durationDisplay: formatMinutes(mins) }));
                        }
                      }}
                      placeholder={dur > 0 ? formatMinutes(Math.round(dur/60)) : '1:30'}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                    />
                    <div className="text-[9px] text-gray-400 mt-0.5">2 = 2h · 1:30 = 1h30m · 90 = 90min</div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Distance</label>
                    <input
                      type="text"
                      value={planForm.distanceDisplay}
                      onChange={e => setPlanForm(p => ({ ...p, distanceDisplay: e.target.value, distanceKm: null }))}
                      onBlur={() => {
                        const km = parseDistanceToKm(planForm.distanceDisplay);
                        if (km != null && km > 0) {
                          setPlanForm(p => ({ ...p, distanceKm: km, distanceDisplay: `${km % 1 === 0 ? km : km.toFixed(2)} km` }));
                        }
                      }}
                      placeholder={dist > 0 ? `${(dist/1000).toFixed(1)} km` : '10 km'}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                    />
                    <div className="text-[9px] text-gray-400 mt-0.5">10 = 10 km · 500m = 0.5 km</div>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Target TSS</label>
                  <input
                    type="number"
                    value={planForm.targetTss}
                    onChange={e => setPlanForm(p => ({ ...p, targetTss: e.target.value }))}
                    placeholder={tss > 0 ? String(Math.round(tss)) : ''}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</label>
                  <textarea
                    value={planForm.description}
                    onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Workout description…"
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</label>
                  <textarea
                    value={planForm.notes}
                    onChange={e => setPlanForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Coach notes, instructions…"
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 resize-none"
                  />
                </div>
                <div className="flex gap-2 mt-auto pt-2">
                  {plannedWorkout && (
                    <button
                      onClick={() => setEditingPlanned(false)}
                      className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={handleSavePlan}
                    disabled={savingPlan}
                    className="flex-1 py-2 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: color }}
                  >
                    {savingPlan ? 'Saving…' : plannedWorkout ? 'Save' : 'Add Planned'}
                  </button>
                </div>
                {plannedWorkout && onEditPlanned && (
                  <button
                    onClick={() => onEditPlanned(plannedWorkout)}
                    className="w-full py-2 rounded-xl border text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                    style={{ borderColor: color + '60', color, backgroundColor: color + '08' }}
                  >
                    <PencilIcon className="w-3.5 h-3.5" /> Build Workout
                  </button>
                )}
              </div>
            ) : (
              <div className="px-4 pb-4 flex flex-col gap-3">
                {/* Planned stats */}
                <div className="rounded-xl bg-gray-50 p-3 space-y-2">
                  {plannedWorkout?.title && (
                    <div className="font-semibold text-sm text-gray-800">{plannedWorkout.title}</div>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {plannedDur > 0 && (
                      <div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Duration</div>
                        <div className="text-sm font-bold text-gray-800">{fmtDur(plannedDur)}</div>
                      </div>
                    )}
                    {plannedTss > 0 && (
                      <div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">TSS</div>
                        <div className="text-sm font-bold text-gray-800">{plannedTss}</div>
                      </div>
                    )}
                    {plannedDist > 0 && (
                      <div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Distance</div>
                        <div className="text-sm font-bold text-gray-800">{fmtDist(plannedDist)}</div>
                      </div>
                    )}
                  </div>
                  {complianceRow && (
                    <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: complianceRow.color }} />
                      <span className="text-xs font-bold" style={{ color: complianceRow.color }}>{complianceRow.label}</span>
                    </div>
                  )}
                </div>

                {/* Description / notes */}
                {(plannedWorkout?.description || plannedWorkout?.notes) && (
                  <div className="rounded-xl bg-gray-50 p-3 space-y-2">
                    {plannedWorkout?.description && (
                      <div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Description</div>
                        <p className="text-xs text-gray-600 whitespace-pre-line">{plannedWorkout.description}</p>
                      </div>
                    )}
                    {plannedWorkout?.notes && (
                      <div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Notes</div>
                        <p className="text-xs text-gray-600 whitespace-pre-line">{plannedWorkout.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Steps / intervals */}
                {planSteps.length > 0 && (
                  <div>
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-2">Intervals</div>
                    <div className="space-y-1">
                      {planSteps.filter(s => !s.isGroupHeader).map((s, i) => {
                        const stepColor = s.type === 'work' ? color : s.type === 'warmup' ? '#fbbf24' : s.type === 'cooldown' ? '#38bdf8' : '#6ee7b7';
                        return (
                          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border-l-2" style={{ borderLeftColor: stepColor }}>
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] font-semibold text-gray-700 capitalize">{s.type || 'Step'} {s.groupId ? `(×${s.groupRepeat || 1})` : ''}</div>
                              {s.targetPower > 0 && <div className="text-[10px] text-gray-500">{s.targetPower}W</div>}
                            </div>
                            <div className="text-[10px] font-bold text-gray-600 flex-shrink-0">{fmtPlanDuration(s.durationSeconds)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: Completed activity ── */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

            {/* ── STICKY TOP: header + stats + chart ── */}
            <div className="flex-shrink-0 border-b border-gray-100">
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Completed</span>
                {detailLoading && (
                  <svg className="w-3.5 h-3.5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                )}
              </div>

              {/* Key stats — compact horizontal row */}
              <div className="px-4 pb-3 flex flex-wrap gap-2">
                {[
                  { label: 'Duration',  value: fmtDur(dur) },
                  { label: 'Distance',  value: dist > 0 ? fmtDist(dist) : null },
                  ...(tss > 0  ? [{ label: 'TSS', value: Math.round(tss) }] : []),
                  ...(hrTss > 0 && hrTss !== tss ? [{ label: 'hrTSS', value: Math.round(hrTss) }] : []),
                  ...(paceStr  ? [{ label: 'Pace', value: paceStr }] : []),
                  ...(isBike && power > 0 ? [{ label: 'Pwr', value: `${Math.round(power)}W` }] : []),
                  ...(isBike && np > 0 && np !== power ? [{ label: 'NP', value: `${Math.round(np)}W` }] : []),
                  ...(hr > 0   ? [{ label: 'HR', value: `${Math.round(hr)} bpm` }] : []),
                  ...(elevation > 0 ? [{ label: 'Elev', value: `${Math.round(elevation)}m` }] : []),
                  ...(cadence > 0   ? [{ label: isSwim ? 'SPM' : 'Cad', value: `${Math.round(cadence)}` }] : []),
                ].filter(s => s.value != null).map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-gray-50 px-2.5 py-1.5 flex flex-col">
                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wide leading-none">{label}</span>
                    <span className="text-xs font-bold text-gray-800 tabular-nums mt-0.5">{value}</span>
                  </div>
                ))}
              </div>

              {/* Lap chart */}
              {laps.length > 1 && <LapChart laps={laps} color={color} isBike={isBike} isRun={isRun} selectedLap={selectedLap} onSelectLap={(i) => {
                setSelectedLap(i);
                lapRowRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }} />}

              {notes && (
                <div className="mx-4 mb-3 p-3 bg-gray-50 rounded-xl">
                  <p className="text-xs text-gray-600 whitespace-pre-line line-clamp-3">{notes}</p>
                </div>
              )}
            </div>

            {/* ── SCROLLABLE: laps table ── */}
            <div className="flex-1 overflow-y-auto">
              {laps.length > 0 && (
                <div className="px-4 py-3">
                  {(() => {
                    const hasLactate = merged.laps?.[0]?.lactate != null || merged.laps?.[0]?.lactateValue != null;
                    const cols = ['1.5rem', '1fr', ...(dist > 0 ? ['1fr'] : []), ...((isBike || isRun) ? ['1fr'] : []), '1fr', ...(hasLactate ? ['1fr'] : [])].join(' ');
                    return (
                      <div className="rounded-xl overflow-hidden border border-gray-100">
                        {/* Header */}
                        <div className="grid text-[9px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 px-3 py-1.5 border-b border-gray-100 sticky top-0 z-10"
                          style={{ gridTemplateColumns: cols }}>
                          <span>#</span>
                          <span className="text-right">Time</span>
                          {dist > 0 && <span className="text-right">Dist</span>}
                          {(isBike || isRun) && <span className="text-right">{isBike ? 'Pwr' : 'Pace'}</span>}
                          <span className="text-right">HR</span>
                          {hasLactate && <span className="text-right">La</span>}
                        </div>
                        {/* Rows */}
                        <div className="divide-y divide-gray-50">
                          {laps.map((lap, i) => {
                            const lapDur   = lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0;
                            const lapDist  = Number(lap.distance || 0);
                            const lapPower = Number(lap.average_watts || lap.avgPower || 0);
                            const lapHr    = Number(lap.average_heartrate || lap.averageHeartRate || lap.avgHR || 0);
                            const lapLa    = lap.lactate ?? lap.lactateValue;
                            const lapNum   = lap.lapNumber ?? (i + 1);
                            let lapPaceStr = null;
                            if (isRun && lapDist > 0 && lapDur > 0) {
                              const spk = lapDur / (lapDist / 1000);
                              lapPaceStr = `${Math.floor(spk/60)}:${String(Math.round(spk%60)).padStart(2,'0')}`;
                            }
                            const isSelected = selectedLap === i;
                            return (
                              <div
                                key={i}
                                ref={el => lapRowRefs.current[i] = el}
                                onClick={() => setSelectedLap(isSelected ? null : i)}
                                className="grid items-center px-3 py-2 text-[11px] cursor-pointer transition-colors"
                                style={{
                                  gridTemplateColumns: cols,
                                  backgroundColor: isSelected ? color + '18' : undefined,
                                  borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
                                }}
                              >
                                <span className="font-bold" style={{ color: isSelected ? color : '#9ca3af' }}>{lapNum}</span>
                                <span className="font-semibold text-gray-700 text-right tabular-nums">{fmtLapDur(lapDur)}</span>
                                {dist > 0 && <span className="text-gray-500 text-right tabular-nums">{lapDist > 0 ? (lapDist >= 1000 ? `${(lapDist/1000).toFixed(2)}` : `${Math.round(lapDist)}m`) : '—'}</span>}
                                {(isBike || isRun) && (
                                  <span className="text-right tabular-nums font-semibold" style={{ color }}>
                                    {isBike ? (lapPower > 0 ? `${Math.round(lapPower)}W` : '—') : (lapPaceStr || '—')}
                                  </span>
                                )}
                                <span className="text-gray-500 text-right tabular-nums">{lapHr > 0 ? Math.round(lapHr) : '—'}</span>
                                {hasLactate && (
                                  <span className="text-right font-semibold tabular-nums" style={{ color: '#7c3aed' }}>
                                    {lapLa != null ? Number(lapLa).toFixed(1) : '—'}
                                  </span>
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

              {/* Footer */}
              <div className="px-4 pb-4 flex gap-2">
                {onAddLactate && merged.type === 'strava' && (
                  <button
                    onClick={() => { onAddLactate(merged); onClose(); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors"
                    style={{ borderColor: '#7c3aed', color: '#7c3aed', backgroundColor: '#f5f3ff' }}
                  >
                    + Lactate
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
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
  const plannedDist = plannedWorkout ? (Number(plannedWorkout.plannedDistance || 0)) : 0;
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
  const power = Number(a.normalizedPower || a.avgPower || a.average_watts || 0);
  const np    = Number(a.normalizedPower || 0);
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
    ...(isBike && np > 0 && np !== power ? [{ label: 'NP', value: `${Math.round(np)} W` }] : []),
    ...(hr > 0   ? [{ label: 'Avg HR',   value: `${Math.round(hr)} bpm` }] : []),
    ...(elevation > 0 ? [{ label: 'Elevation', value: `${Math.round(elevation)} m` }] : []),
    ...(cadence > 0   ? [{ label: isSwim ? 'Strokes/min' : 'Cadence', value: `${Math.round(cadence)}` }] : []),
  ];

  const fmtDurShort = (s) => {
    if (!s) return '—';
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}` : `${m}m`;
  };

  const complianceRow = hasPlanned && dur > 0 ? getCompliance(plannedDur, dur) : null;
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

// ─── Richer Summary Column ────────────────────────────────────────────────────
function WeekSummaryCell({ weekSummary, formatHours, formatKm, user }) {
  if (!weekSummary) return <div className="bg-gray-50 p-2 min-h-[130px] min-w-[140px]" />;

  const { totalSeconds, totalTSS, runSeconds, bikeSeconds, swimSeconds, strengthSeconds,
    distanceRun, distanceBike, distanceSwim, tssRun, tssBike, tssSwim, tssStrength,
    volumeChange, plannedSeconds, plannedTSS } = weekSummary;

  const hasPlan = plannedSeconds > 0;
  const completionPct = hasPlan ? Math.min(100, Math.round((totalSeconds / plannedSeconds) * 100)) : null;

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
  /** Called with (pw) to delete a planned workout */
  onDeletePlannedWorkout = null,
  /** Optional: called with (activity, element) to open custom popup */
  onActivityClick = null,
  /** Optional: called with activity object to navigate to full detail page */
  onOpenActivity = null,
  /** Optional: content to render in the mobile Charts tab (replaces built-in simple charts) */
  mobileChartsContent = null,
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
  const [expandedDays, setExpandedDays] = useState(new Set());
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  // Optimistic selection — marks activity immediately on click, before parent updates selectedActivityId
  const [optimisticSelectedId, setOptimisticSelectedId] = useState(null);
  // Mobile-specific state
  const [mobileTab, setMobileTab] = useState('calendar');
  const [showMiniCal, setShowMiniCal] = useState(true);
  const [chartType, setChartType] = useState('volume');
  const [selectedMobileDay, setSelectedMobileDay] = useState(() => getLocalDateString(new Date()));
  const dayListRef = useRef(null);
  const dayRefs = useRef({});
  const selectedMobileDayRef = useRef(selectedMobileDay);
  const isAutoScrollingRef = useRef(false);

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

  // Mobile scroll spy — highlight day in mini-calendar as user scrolls day list
  useEffect(() => {
    if (!isMobile || mobileTab !== 'calendar') return;
    const container = dayListRef.current;
    if (!container) return;

    const onScroll = () => {
      if (isAutoScrollingRef.current) return;
      const containerTop = container.getBoundingClientRect().top;
      let best = null;
      let bestScore = Infinity;
      Object.entries(dayRefs.current).forEach(([key, el]) => {
        if (!el) return;
        const relTop = el.getBoundingClientRect().top - containerTop;
        // Pick day whose top is closest to 0 from above (i.e. just entering the top)
        if (relTop <= 16) {
          const score = Math.abs(relTop);
          if (score < bestScore) { bestScore = score; best = key; }
        }
      });
      if (best && best !== selectedMobileDayRef.current) {
        setSelectedMobileDay(best);
      }
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [isMobile, mobileTab]);

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
      // On mobile, skip the modal — let the parent page render its full
      // detail view (chart, stats, laps, comments) which the modal would
      // otherwise hide.
      if (isMobile) {
        handleSelectActivity(a);
        return;
      }
      // Find the matching planned workout for this day/sport
      const actDate = a.date || a.timestamp || a.startDate || a.start_time;
      const dayKey = actDate ? getLocalDateString(new Date(actDate)) : null;
      const dayPws = dayKey ? (plannedByDay.get(dayKey) || []) : [];
      const matchPw = dayPws.find(pw => sportMatches(pw.sport, a.sport || a.type || '')) || null;
      setActivityModal({ activity: a, plannedWorkout: matchPw });
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
      const key = startOfWeek(d).toISOString().slice(0, 10);
      if (!plannedByWeek[key]) plannedByWeek[key] = { plannedSeconds: 0, plannedTSS: 0 };
      const secs = planStepTotalSecs(pw.steps) || pw.plannedDuration || 0;
      plannedByWeek[key].plannedSeconds += secs;
      plannedByWeek[key].plannedTSS += Number(pw.targetTss || 0);
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className={`${isFullscreen ? 'fixed inset-0 z-[9998] bg-white flex flex-col p-4 md:p-5' : (isMobile ? 'bg-white flex flex-col' : 'bg-white rounded-2xl border border-gray-200 shadow-sm p-4 md:p-5 mb-4 md:mb-6')} ${isMobile ? '' : 'overflow-hidden'}`}>
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
        <div className="flex flex-col" style={{ height: 'calc(100svh - 56px)' }}>
          {/* ── Tab bar ── */}
          <div className="flex bg-gray-100 rounded-xl p-0.5 mb-3 mx-3 flex-shrink-0">
            {[['calendar', 'Calendar'], ['charts', 'Charts']].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all touch-manipulation ${mobileTab === tab ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >{label}</button>
            ))}
          </div>

          {mobileTab === 'calendar' ? (<>
            {/* ── Month nav + mini-cal toggle ── */}
            <div className="flex items-center justify-between px-3 mb-1 flex-shrink-0">
              <button onClick={prev} className="p-1.5 rounded-full active:bg-gray-100 touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
              </button>
              <button onClick={today} className="text-sm font-bold text-primary uppercase tracking-wide touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                {anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
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
              <div className="flex-shrink-0 px-3 mb-2">
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
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          setSelectedMobileDay(key);
                          isAutoScrollingRef.current = true;
                          setTimeout(() => {
                            if (dayRefs.current[key]) {
                              dayRefs.current[key].scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                            setTimeout(() => { isAutoScrollingRef.current = false; }, 700);
                          }, 50);
                        }}
                        className="flex flex-col items-center py-0.5 touch-manipulation"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <span className={`w-7 h-7 flex items-center justify-center text-xs font-semibold rounded-full transition-all ${
                          isToday && isSelected ? 'bg-primary text-white ring-2 ring-primary/30 ring-offset-1' :
                          isToday ? 'bg-primary text-white' :
                          isSelected ? 'bg-gray-200 text-gray-900' :
                          isCurrentMonth ? 'text-gray-700' : 'text-gray-300'
                        }`}>
                          {dayDate.getDate()}
                        </span>
                        <div className="flex gap-0.5 h-1.5 mt-0.5 items-center">
                          {hasPlanOnly && <span className="w-1 h-1 rounded-full bg-gray-300" />}
                          {dots.map((sport, si) => (
                            <span key={si} className="w-1 h-1 rounded-full" style={{ backgroundColor: dotColors[sport] }} />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Scrollable day list ── */}
            <div ref={dayListRef} className="flex-1 overflow-y-auto px-3" style={{ WebkitOverflowScrolling: 'touch' }}>
              {days.filter(d => d.getMonth() === anchorDate.getMonth()).map(dayDate => {
                const key = getLocalDateString(dayDate);
                const acts = activitiesByDay.get(key) || [];
                const planned = plannedByDay.get(key) || [];
                const isToday = isSameDay(dayDate, new Date());
                const isSelected = key === selectedMobileDay;
                const hasItems = acts.length > 0 || planned.length > 0;
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                return (
                  <div
                    key={key}
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
                      {onPlanWorkout && (
                        <button
                          onClick={e => { e.stopPropagation(); onPlanWorkout(dayDate); }}
                          className="w-6 h-6 flex items-center justify-center text-gray-300 active:text-primary text-lg leading-none touch-manipulation"
                          style={{ WebkitTapHighlightColor: 'transparent' }}
                        >+</button>
                      )}
                    </div>
                    {/* Content */}
                    {hasItems ? (
                      <div className="px-2 pb-1.5 pt-1 flex flex-col gap-1">
                        {planned.map((pw, pi) => {
                          const pwSport = (pw.sport || 'bike').toLowerCase();
                          const color = SPORT_PLAN_COLORS[pwSport] || '#767EB5';
                          const duration = planStepTotalSecs(pw.steps);
                          const isCompleted = pw.status === 'completed';
                          const isSkipped = pw.status === 'skipped';
                          const compliance = findCompliance(pw, acts);
                          return (
                            <button key={pi}
                              onClick={e => { e.stopPropagation(); onSelectPlannedWorkout && onSelectPlannedWorkout(pw); }}
                              className="w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg border touch-manipulation active:opacity-70 min-h-[40px]"
                              style={{ borderStyle: compliance ? 'solid' : 'dashed', borderColor: compliance ? compliance.color : color + '60', backgroundColor: compliance ? compliance.bg : color + '0d', WebkitTapHighlightColor: 'transparent' }}>
                              {compliance
                                ? <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: compliance.color }} />
                                : isCompleted
                                  ? <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />
                                  : <PlayIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-60" style={{ color }} />}
                              <span className="text-xs font-semibold flex-1 truncate" style={{ color: isSkipped ? '#9ca3af' : color }}>{pw.title || 'Planned workout'}</span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {compliance
                                  ? <span className="text-[10px] font-bold" style={{ color: compliance.color }}>{compliance.label}</span>
                                  : <>{pw.steps?.length > 0 && <PlanMiniChart steps={pw.steps} color={color} width={36} height={12} />}{duration > 0 && <span className="text-[10px] opacity-70" style={{ color }}>{fmtPlanDuration(duration)}</span>}</>}
                              </div>
                            </button>
                          );
                        })}
                        {acts.map((a, i) => {
                          const activityId = a.id || a._id;
                          const isActSelected = effectiveSelectedId && String(activityId) === String(effectiveSelectedId);
                          const color = sportColor(a.sport);
                          const title = a.title || a.name || a.originalFileName || 'Activity';
                          const dur = Number(a.duration || a.elapsed_time || a.movingTime || a.moving_time || a.totalTimerTime || a.totalElapsedTime || 0);
                          const durStr = dur > 0 ? `${Math.floor(dur / 3600)}h${String(Math.floor((dur % 3600) / 60)).padStart(2, '0')}` : null;
                          const dist = Number(a.distance || a.totalDistance || 0);
                          const distStr = dist > 0 ? (dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`) : null;
                          const tss = Number(a.tss || a.trainingLoad || 0);
                          return (
                            <button key={i}
                              onClick={e => { e.stopPropagation(); const r = e.currentTarget?.getBoundingClientRect() || null; handleActivityClick(a, r); }}
                              className={`w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg border transition-all touch-manipulation min-h-[40px] ${isActSelected ? 'bg-primary/10 border-primary/30' : 'bg-white border-gray-100 active:bg-gray-50'}`}
                              style={{ borderLeftColor: color, borderLeftWidth: 3, WebkitTapHighlightColor: 'transparent' }}>
                              <SportIcon sport={a.sport} className="w-4 h-4 flex-shrink-0" />
                              <span className="text-xs font-semibold text-gray-800 flex-1 truncate min-w-0">{title}</span>
                              <div className="flex items-center gap-1.5 text-[10px] flex-shrink-0">
                                {durStr && <span className="font-medium text-gray-600">{durStr}</span>}
                                {distStr && <span className="text-gray-400">{distStr}</span>}
                                {tss > 0 && <span className="font-bold text-primary">{Math.round(tss)}</span>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-3 py-2 text-xs text-gray-300">Rest day</div>
                    )}
                  </div>
                );
              })}
              <div className="h-4" />
            </div>
          </>) : (
            /* ── Charts tab ── */
            <div className="flex flex-col flex-1 min-h-0">
              {/* ── Period nav + Month/Week toggle ── */}
              <div className="flex items-center justify-between px-3 mb-2 flex-shrink-0">
                <button onClick={prev} className="p-1.5 rounded-full active:bg-gray-100 touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                  <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-sm font-bold text-gray-900">
                    {view === 'week'
                      ? `${startOfWeek(anchorDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(startOfWeek(anchorDate), 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : anchorDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                  </span>
                  <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                    {[['month', 'Month'], ['week', 'Week']].map(([v, lbl]) => (
                      <button key={v} onClick={() => setView(v)}
                        className={`px-3 py-0.5 text-xs font-semibold rounded-md transition-all touch-manipulation ${view === v ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                      >{lbl}</button>
                    ))}
                  </div>
                </div>
                <button onClick={next} className="p-1.5 rounded-full active:bg-gray-100 touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>
                  <ChevronRightIcon className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {mobileChartsContent ? (
                <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {mobileChartsContent}
                  <div className="h-4" />
                </div>
              ) : (<>
              {/* Chart type switcher */}
              <div className="flex gap-1.5 px-3 mb-3 flex-shrink-0">
                {[['volume', 'Volume'], ['tss', 'TSS'], ['sports', 'Sports']].map(([type, label]) => (
                  <button
                    key={type}
                    onClick={() => setChartType(type)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all touch-manipulation ${chartType === type ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-500 border-gray-200 active:bg-gray-50'}`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >{label}</button>
                ))}
              </div>

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
                  <div className="flex-1 overflow-y-auto px-3" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                                      {wk.bikeSeconds > 0 && <div style={{ flex: wk.bikeSeconds, backgroundColor: '#3b82f6' }} />}
                                      {wk.runSeconds > 0 && <div style={{ flex: wk.runSeconds, backgroundColor: '#f97316' }} />}
                                      {wk.swimSeconds > 0 && <div style={{ flex: wk.swimSeconds, backgroundColor: '#06b6d4' }} />}
                                      {wk.strengthSeconds > 0 && <div style={{ flex: wk.strengthSeconds, backgroundColor: '#8b5cf6' }} />}
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
                            { key: 'bike', label: 'Bike', color: '#3b82f6', sec: totals.bike },
                            { key: 'run', label: 'Run', color: '#f97316', sec: totals.run },
                            { key: 'swim', label: 'Swim', color: '#06b6d4', sec: totals.swim },
                            { key: 'strength', label: 'Strength', color: '#8b5cf6', sec: totals.strength },
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
                              {wk.bikeSeconds > 0 && <div style={{ flex: wk.bikeSeconds, backgroundColor: '#3b82f6' }} />}
                              {wk.runSeconds > 0 && <div style={{ flex: wk.runSeconds, backgroundColor: '#f97316' }} />}
                              {wk.swimSeconds > 0 && <div style={{ flex: wk.swimSeconds, backgroundColor: '#06b6d4' }} />}
                              {wk.strengthSeconds > 0 && <div style={{ flex: wk.strengthSeconds, backgroundColor: '#8b5cf6' }} />}
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
                    const acts = activitiesByDay.get(key) || [];
                    const planned = plannedByDay.get(key) || [];
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
                            compliance={findCompliance(pw, acts)}
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
                  <WeekSummaryCell
                    weekSummary={wkSummary}
                    formatHours={formatHours}
                    formatKm={formatKm}
                    user={user}
                  />
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
                          compliance={findCompliance(pw, visibleActs)}
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
          onClose={() => setActivityModal(null)}
          onEditPlanned={onSelectPlannedWorkout}
          onAddLactate={onAddLactate}
          onPlannedSaved={(saved) => setActivityModal(prev => prev ? { ...prev, plannedWorkout: saved } : prev)}
          onOpenFull={onOpenActivity ? () => { setActivityModal(null); onOpenActivity(activityModal.activity); } : null}
        />
      )}
    </motion.div>
  );
  return isFullscreen ? ReactDOM.createPortal(calendarContent, document.body) : calendarContent;
}
