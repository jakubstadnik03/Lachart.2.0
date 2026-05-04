import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  FireIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  PlayIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { Bike, Dumbbell, Footprints, WavesLadder, Zap as ZapIcon } from 'lucide-react';
import TrainingStats from '../FitAnalysis/TrainingStats';
import LapsTable from '../FitAnalysis/LapsTable';
import { getFitTraining, getStravaActivityDetail, updateFitTraining, updateStravaActivity } from '../../services/api';
import api from '../../services/api';
import { useAuth } from '../../context/AuthProvider';
import { formatDistanceForUser, resolveDistanceUnitSystem } from '../../utils/unitsConverter';
import { useCategories, hexToRgba } from '../../context/CategoryContext';

function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && 
         a.getMonth() === b.getMonth() && 
         a.getDate() === b.getDate();
}

function getLocalDateString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Inline runner figure — lucide has no person-running icon
const RunnerSvg = ({ className = '', strokeWidth = 2 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
       className={className}>
    <circle cx="16" cy="4" r="1.6" fill="currentColor" stroke="none" />
    <path d="M14.5 7.5 L11.5 11 L13.5 13.5" />
    <path d="M13.5 13.5 L17.5 14.5" />
    <path d="M11.5 11 L8.5 9" />
    <path d="M13.5 13.5 L13 18 L10.5 22" />
    <path d="M13 18 L18 19" />
  </svg>
);

function SportIcon({ sport, className = 'w-4 h-4' }) {
  if (!sport) return null;
  const s = String(sport).toLowerCase();
  if (s.includes('run') || s.includes('hike') || s.includes('trail'))
    return <RunnerSvg className={`${className} text-orange-500 flex-shrink-0`} strokeWidth={2} />;
  if (s.includes('walk'))
    return <Footprints className={`${className} text-orange-400 flex-shrink-0`} strokeWidth={2} />;
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual'))
    return <Bike className={`${className} text-blue-500 flex-shrink-0`} strokeWidth={2} />;
  if (s.includes('swim'))
    return <WavesLadder className={`${className} text-cyan-500 flex-shrink-0`} strokeWidth={2} />;
  if (s.includes('gym') || s.includes('weight') || s.includes('strength'))
    return <Dumbbell className={`${className} text-purple-500 flex-shrink-0`} strokeWidth={2} />;
  return <ZapIcon className={`${className} text-gray-400 flex-shrink-0`} strokeWidth={2} />;
}

/** Local calendar day key — must match grouping in `activitiesByDay`. */
function activityCalendarDateKey(act) {
  const raw = act?.date ?? act?.timestamp ?? act?.startDate;
  if (raw == null) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return getLocalDateString(d);
}

function readExplicitTss(act) {
  const v =
    act?.tss ??
    act?.TSS ??
    act?.totalTSS ??
    act?.total_tss ??
    act?.trainingStressScore ??
    act?.training_stress_score ??
    act?.totalTss ??
    act?.totalTssValue ??
    act?.icu_training_load ??
    act?.load;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Same heuristics as server `calculateActivityTSS` (weeklyReport / fitness metrics). */
function estimateTssFromActivity(act, userProfile) {
  try {
    const seconds = Number(
      act?.movingTime ??
        act?.elapsedTime ??
        act?.totalElapsedTime ??
        act?.totalTimerTime ??
        act?.duration ??
        act?.totalTime ??
        0
    );
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;

    const ftp =
      userProfile?.powerZones?.cycling?.lt2 ||
      userProfile?.powerZones?.cycling?.zone5?.min ||
      userProfile?.ftp ||
      250;

    const thresholdPace =
      userProfile?.powerZones?.running?.lt2 || userProfile?.runningZones?.lt2 || null;

    const thresholdSwimPace = userProfile?.powerZones?.swimming?.lt2 || null;

    const sport = String(act?.sport || '').toLowerCase();

    if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike') || sport === 'cycling') {
      const avgPower = Number(
        act?.averagePower ?? act?.avgPower ?? act?.average_watts ?? act?.weighted_average_watts ?? 0
      );
      if (avgPower > 0 && ftp > 0) {
        const np = avgPower;
        return Math.round(((seconds * np * np) / (ftp * ftp * 3600)) * 100);
      }
      const kj = Number(act?.kilojoules ?? act?.raw?.kilojoules ?? 0);
      if (kj > 0) {
        return Math.round(kj * 0.84);
      }
    }

    if (sport.includes('run') || sport.includes('walk') || sport.includes('hike') || sport === 'running') {
      const avgSpeed = Number(act?.averageSpeed ?? act?.avgSpeed ?? act?.average_speed ?? 0);
      if (avgSpeed > 0) {
        const avgPaceSeconds = Math.round(1000 / avgSpeed);
        let referencePace = thresholdPace;
        if (!referencePace || referencePace <= 0) referencePace = avgPaceSeconds;
        const intensityRatio = referencePace / avgPaceSeconds;
        return Math.round(((seconds * intensityRatio * intensityRatio) / 3600) * 100);
      }
    }

    if (sport.includes('swim') || sport === 'swimming') {
      const avgSpeed = Number(act?.averageSpeed ?? act?.avgSpeed ?? act?.average_speed ?? 0);
      if (avgSpeed > 0) {
        const avgPaceSeconds = Math.round(100 / avgSpeed);
        let referencePace = thresholdSwimPace;
        if (!referencePace || referencePace <= 0) referencePace = avgPaceSeconds;
        const intensityRatio = referencePace / avgPaceSeconds;
        return Math.round(((seconds * intensityRatio * intensityRatio) / 3600) * 100);
      }
    }

    return 0;
  } catch {
    return 0;
  }
}

function activityTssResolved(act, userProfile) {
  const explicit = readExplicitTss(act);
  if (explicit > 0) return explicit;
  return estimateTssFromActivity(act, userProfile);
}

function activityDurationSec(act) {
  const v = act?.totalTime ?? act?.totalElapsedTime ?? act?.totalTimerTime ?? act?.movingTime ?? act?.elapsedTime;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function activityDistanceMeters(act) {
  const v = act?.distance ?? act?.totalDistance;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatWeekDurationSeconds(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** Decimal hours like 0.3h / 6.8h (matches weekly summary badges). */
function formatDecimalHours(totalSec) {
  const sec = Number(totalSec);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const h = sec / 3600;
  return `${h.toFixed(1)}h`;
}

function normalizeSport(sport) {
  const s = String(sport || '').toLowerCase().trim();
  if (s.includes('run') || s.includes('walk') || s.includes('hike') || s.includes('trail')) return 'Running';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual')) return 'Cycling';
  if (s.includes('swim')) return 'Swimming';
  if (s.includes('gym') || s.includes('weight') || s.includes('strength') || s.includes('workout')) return 'Strength';
  if (!s) return 'Other';
  return 'Other';
}


function WeekSummaryColumn({ summary, user, prevWeekTss, compact }) {
  const { totalTss, totalSec, bySport } = summary;
  const tssRounded = Math.round(totalTss);
  const prevRounded = prevWeekTss != null ? Math.round(Number(prevWeekTss)) : null;
  const showTrend = prevRounded != null && prevRounded > 0 && tssRounded !== prevRounded;

  const totalTssForBar = bySport.reduce((s, r) => s + r.tss, 0);
  const sportColors = { cycling: '#3b82f6', running: '#f97316', swimming: '#06b6d4', strength: '#8b5cf6' };

  const hoursStr = totalSec > 0
    ? (() => { const h = Math.floor(totalSec / 3600); const m = Math.floor((totalSec % 3600) / 60); return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`; })()
    : null;

  return (
    <div
      className={`flex flex-col rounded-lg border border-gray-200 bg-gray-50 border-l-4 border-l-primary/40 text-left ${
        compact ? 'p-2 min-w-[120px]' : 'p-2.5 min-w-0'
      }`}
      data-testid="weekly-calendar-summary"
    >
      {/* Header: total time + TSS + trend */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <div>
          <div className={`font-extrabold text-gray-900 leading-tight tabular-nums ${compact ? 'text-sm' : 'text-base'}`}>
            {hoursStr || '—'}
          </div>
          {tssRounded > 0 && (
            <div className="flex items-center gap-0.5 mt-0.5">
              <FireIcon className={`text-primary shrink-0 ${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} />
              <span className={`font-bold text-primary tabular-nums ${compact ? 'text-[9px]' : 'text-xs'}`}>{tssRounded}</span>
              <span className={`text-gray-400 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>TSS</span>
            </div>
          )}
        </div>
        {showTrend && (
          <span className={`mt-0.5 flex-shrink-0 ${tssRounded > prevRounded ? 'text-green-500' : 'text-red-400'}`}>
            {tssRounded > prevRounded
              ? <ArrowTrendingUpIcon className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
              : <ArrowTrendingDownIcon className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
          </span>
        )}
      </div>

      {/* TSS distribution bar */}
      {totalTssForBar > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden gap-px mb-1.5">
          {bySport.map(row => {
            const ratio = row.tss / totalTssForBar;
            if (ratio <= 0) return null;
            const s = String(row.sport || '').toLowerCase();
            const color = sportColors[s.toLowerCase()] || '#8b5cf6';
            return <div key={row.sport} style={{ width: `${ratio * 100}%`, backgroundColor: color }} className="rounded-full" />;
          })}
        </div>
      )}

      {/* Per-sport rows */}
      <div className="space-y-1">
        {bySport.length === 0 ? (
          <div className={`text-gray-400 italic ${compact ? 'text-[9px]' : 'text-[10px]'}`}>—</div>
        ) : (
          bySport.map((row) => {
            const timePart = row.sec > 0 ? formatDecimalHours(row.sec) || formatWeekDurationSeconds(row.sec) : '—';
            return (
              <div key={row.sport} className="flex items-center gap-1">
                <SportIcon sport={row.sport} className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                <span className={`font-semibold text-gray-700 flex-1 tabular-nums ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{timePart}</span>
                {row.dist > 0 && (
                  <span className={`text-gray-400 flex-shrink-0 tabular-nums ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
                    {formatDistanceForUser(row.dist, user)}
                  </span>
                )}
                {row.tss > 0 && (
                  <span className={`font-bold text-primary flex-shrink-0 tabular-nums ${compact ? 'text-[8px]' : 'text-[9px]'}`}>
                    {Math.round(row.tss)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function planStepTotalSecs(steps) {
  if (!Array.isArray(steps)) return 0;
  let total = 0;
  for (const s of steps) {
    const dur = Number(s.durationSeconds || s.duration || 0);
    const reps = Number(s.repeat || s.repeatCount || 1);
    total += dur * (reps > 0 ? reps : 1);
  }
  return total;
}

function secsToHMShort(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  return `${m}m`;
}


function PlannedMiniCard({ pw, onSelect, onStart, onCopy, onDelete, onRepeat }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (!e.target.closest('[data-planned-menu]')) {
        setMenuOpen(false);
        setRepeatOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const openMenu = (e) => {
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setMenuOpen(v => !v);
    setRepeatOpen(false);
  };

  const secs = planStepTotalSecs(pw.steps) || pw.plannedDuration || 0;
  const durStr = secsToHMShort(secs);
  const isCompleted = pw.status === 'completed';

  const dropdown = menuOpen ? ReactDOM.createPortal(
    <div
      data-planned-menu
      style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
      className="w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 text-xs overflow-hidden"
    >
      {onSelect && (
        <button onClick={() => { setMenuOpen(false); onSelect(pw); }}
          className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 flex items-center gap-2">
          <PencilIcon className="w-3.5 h-3.5" /> Edit
        </button>
      )}
      {onCopy && (
        <button onClick={() => { setMenuOpen(false); onCopy(pw, pw.date); }}
          className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 flex items-center gap-2">
          <DocumentDuplicateIcon className="w-3.5 h-3.5" /> Copy
        </button>
      )}
      {onRepeat && (
        <>
          <button onClick={() => setRepeatOpen(v => !v)}
            className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <ArrowPathIcon className="w-3.5 h-3.5" /> Repeat ›
          </button>
          {repeatOpen && (
            <div className="px-3 pb-2">
              <p className="text-[9px] text-gray-400 py-1">Next N weeks</p>
              <div className="grid grid-cols-3 gap-1">
                {[2,3,4,6,8,12].map(n => (
                  <button key={n}
                    onClick={() => { setMenuOpen(false); setRepeatOpen(false); onRepeat(pw, n); }}
                    className="text-gray-700 text-xs py-1 rounded hover:bg-gray-50 font-medium">
                    {n}×
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {onStart && !isCompleted && (
        <button onClick={() => { setMenuOpen(false); onStart(pw); }}
          className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-50 flex items-center gap-2">
          <PlayIcon className="w-3.5 h-3.5" /> Start
        </button>
      )}
      {onDelete && (
        <button onClick={() => { setMenuOpen(false); onDelete(pw); }}
          className="w-full text-left px-3 py-1.5 text-red-500 hover:bg-red-50 flex items-center gap-2">
          <TrashIcon className="w-3.5 h-3.5" /> Delete
        </button>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative group">
      <button
        onClick={() => onSelect && onSelect(pw)}
        className={`w-full text-left px-1.5 py-1 rounded border transition-colors text-[10px] ${
          isCompleted
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-indigo-50 border-indigo-200 text-indigo-800 hover:bg-indigo-100'
        }`}
      >
        <div className="flex items-center gap-1">
          <SportIcon sport={pw.sport} className="w-3 h-3" />
          <span className="truncate font-medium flex-1">{pw.title || 'Planned workout'}</span>
          {durStr && <span className="text-[9px] opacity-70 flex-shrink-0">{durStr}</span>}
        </div>
      </button>
      <button
        ref={btnRef}
        onClick={openMenu}
        className="absolute right-0.5 top-0.5 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded hover:bg-black/10 transition-opacity"
      >
        <EllipsisVerticalIcon className="w-3 h-3" />
      </button>
      {dropdown}
    </div>
  );
}

function actSportColor(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run') || s.includes('walk') || s.includes('hike')) return '#f97316';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike')) return '#3b82f6';
  if (s.includes('swim')) return '#06b6d4';
  return '#8b5cf6';
}

function WeekActCard({ act, isSelected, onClick, catBadgeStyle, catLabel, compact = false }) {
  const title = act.title || act.name || act.originalFileName || 'Activity';
  const dur = act.duration || act.elapsed_time || act.movingTime || act.totalTimerTime || act.totalElapsedTime || 0;
  const durStr = dur > 0 ? `${Math.floor(dur / 3600)}:${String(Math.floor((dur % 3600) / 60)).padStart(2, '0')}` : null;
  const dist = act.distance || act.totalDistance || 0;
  const distStr = dist > 0 ? (dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`) : null;
  const tss = act.tss || act.trainingLoad || 0;
  const power = act.normalizedPower || act.avgPower || act.average_watts || 0;
  const hr = act.averageHeartRate || act.average_heartrate || 0;
  const color = catBadgeStyle && act.category
    ? (catBadgeStyle(act.category).borderColor || actSportColor(act.sport))
    : actSportColor(act.sport);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border transition-all flex flex-col gap-1 ${
        compact ? 'p-1.5' : 'p-2'
      } ${
        isSelected
          ? 'bg-gradient-to-br from-primary to-primary-dark shadow-md ring-2 ring-primary/20 border-transparent'
          : 'bg-white hover:bg-gray-50 shadow-sm hover:shadow-md border-gray-200'
      }`}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
      title={title}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <SportIcon sport={act.sport} className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span className={`font-bold truncate flex-1 ${compact ? 'text-[10px]' : 'text-[11px]'} ${isSelected ? 'text-white' : 'text-gray-800'}`}>
          {title}
        </span>
        {act.category && !compact && (
          <span className="text-[8px] px-1 py-0.5 rounded flex-shrink-0 border font-semibold" style={catBadgeStyle?.(act.category)}>
            {catLabel?.(act.category)?.substring(0, 4)}
          </span>
        )}
      </div>
      {!compact && (durStr || distStr) && (
        <div className="flex items-center gap-2 flex-wrap">
          {durStr && <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{durStr}</span>}
          {distStr && <><span className={isSelected ? 'text-white/40' : 'text-gray-300'}>·</span><span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{distStr}</span></>}
        </div>
      )}
      {!compact && tss > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (tss / 150) * 100)}%`, backgroundColor: tss > 100 ? '#ef4444' : tss > 70 ? '#f59e0b' : '#22c55e' }} />
          </div>
          <span className={`text-[9px] font-bold flex-shrink-0 ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{Math.round(tss)} TSS</span>
        </div>
      )}
      {!compact && (power > 0 || hr > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {power > 0 && <span className={`text-[10px] ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>{Math.round(power)}W</span>}
          {hr > 0 && <span className={`text-[10px] ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>♥ {Math.round(hr)}</span>}
        </div>
      )}
    </button>
  );
}

const WeeklyCalendar = ({
  activities = [],
  onSelectActivity,
  selectedActivityId,
  selectedAthleteId = null,
  onActivityUpdate = null,
  plannedWorkouts = [],
  onPlanWorkout = null,
  onSelectPlannedWorkout = null,
  onStartWorkout = null,
  onCopyPlannedWorkout = null,
  onDeletePlannedWorkout = null,
}) => {
  const { user } = useAuth();
  const { getCategory } = useCategories();

  const catBadgeStyle = (catId) => {
    const cat = getCategory(catId);
    if (!cat) return { backgroundColor: '#f3f4f6', color: '#6b7280', borderColor: '#d1d5db' };
    return { backgroundColor: hexToRgba(cat.color, 0.15), color: cat.color, borderColor: hexToRgba(cat.color, 0.35) };
  };
  const catLabel = (catId) => {
    const cat = getCategory(catId);
    return cat ? cat.label : (catId ? catId.charAt(0).toUpperCase() + catId.slice(1) : 'Uncategorized');
  };
  const stravaDetailAthleteId = useMemo(() => {
    const role = String(user?.role || '').toLowerCase();
    if (!['coach', 'tester', 'testing'].includes(role)) return null;
    return selectedAthleteId ?? null;
  }, [user?.role, selectedAthleteId]);
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date()));
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [trainingDetail, setTrainingDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedLapNumber, setSelectedLapNumber] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [cachedActivities, setCachedActivities] = useState([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(true);
  const [showLeftScrollNoTraining, setShowLeftScrollNoTraining] = useState(false);
  const [showRightScrollNoTraining, setShowRightScrollNoTraining] = useState(true);
  const scrollContainerRef = useRef(null);
  const scrollContainerNoTrainingRef = useRef(null);

  // If Strava doesn't provide explicit swim laps, generate swim splits from stream records.
  // This keeps the Interval tabs/table usable for swimming too.
  const generateSwimLapsFromRecords = (records = []) => {
    if (!Array.isArray(records) || records.length < 2) return [];

    const unitSystem = resolveDistanceUnitSystem(user, 'metric');
    const stepMeters = unitSystem === 'imperial' ? 91.44 : 100; // 100yd vs 100m
    const MOVING_SPEED_THRESHOLD_MPS = 0.06; // swim speed can be low; use a small threshold

    const getDistance = (r) => {
      const d = Number(r?.distance ?? 0);
      return Number.isFinite(d) ? d : 0;
    };
    const getSpeedMps = (r) => {
      const s = Number(r?.speed ?? 0);
      return Number.isFinite(s) ? s : 0;
    };
    const getHr = (r) => {
      const hr = Number(r?.heartRate ?? r?.heartrate ?? 0);
      return Number.isFinite(hr) && hr > 0 ? hr : 0;
    };
    const getCadence = (r) => {
      // For swim this is typically strokes/min in Strava streams
      const c = Number(r?.cadence ?? r?.avgCadence ?? r?.average_cadence ?? r?.averageCadence ?? 0);
      return Number.isFinite(c) && c > 0 ? c : 0;
    };
    const getTs = (r) => {
      const ts = r?.timestamp ? new Date(r.timestamp).getTime() : NaN;
      return Number.isFinite(ts) ? ts : null;
    };

    const hasDistanceStream = records.some((r) => getDistance(r) > 0);
    const hasSpeedStream = records.some((r) => getSpeedMps(r) > 0);
    let estimatedDistance = 0;
    let lastDistanceValue = 0;
    let prevBoundaryDistance = 0; // cumulative distance at the start of the current split

    const computeSegmentStats = (seg) => {
      if (!seg || seg.length < 2) {
        return { movingTimeSec: 0, avgSpeedMps: 0, avgHeartRate: 0, avgCadence: 0 };
      }

      let movingTimeSec = 0;
      for (let i = 1; i < seg.length; i++) {
        const prev = seg[i - 1];
        const curr = seg[i];

        const prevTs = getTs(prev);
        const currTs = getTs(curr);
        const dt = prevTs != null && currTs != null ? (currTs - prevTs) / 1000 : 1;
        if (!Number.isFinite(dt) || dt <= 0) continue;

        const prevSpeed = getSpeedMps(prev);
        const currSpeed = getSpeedMps(curr);
        if (prevSpeed >= MOVING_SPEED_THRESHOLD_MPS || currSpeed >= MOVING_SPEED_THRESHOLD_MPS) {
          movingTimeSec += dt;
        }
      }

      const moving = seg.filter((r) => getSpeedMps(r) >= MOVING_SPEED_THRESHOLD_MPS);
      const speeds = moving.map((r) => getSpeedMps(r)).filter((v) => v > 0);
      const hrs = moving.map((r) => getHr(r)).filter((v) => v > 0);
      const cads = moving.map((r) => getCadence(r)).filter((v) => v > 0);

      const avgSpeedMps = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
      const avgHeartRate = hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : 0;
      const avgCadence = cads.length > 0 ? Math.round(cads.reduce((a, b) => a + b, 0) / cads.length) : 0;

      return { movingTimeSec, avgSpeedMps, avgHeartRate, avgCadence };
    };

    const laps = [];
    let lapNumber = 1;
    let lastProcessedDistance = 0;
    let currentSegment = [];
    let distanceStreamOffset = 0;
    let prevDistanceStream = 0;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];

      let distanceNow = 0;
      if (!hasSpeedStream) {
        // No reliable speed stream -> fall back to distance stream (if present).
        const dRaw = hasDistanceStream ? getDistance(record) : 0;
        if (i === 0) {
          prevDistanceStream = dRaw;
          distanceStreamOffset = 0;
        } else {
          // Some streams reset (e.g. per-length). If we detect a reset, accumulate an offset.
          if (dRaw > 0 && dRaw < prevDistanceStream) {
            distanceStreamOffset += prevDistanceStream;
          }
          prevDistanceStream = dRaw;
        }
        distanceNow = distanceStreamOffset + dRaw;
      } else {
        // If we don't have distance in stream data, estimate distance by integrating speed over time.
        if (i === 0) {
          distanceNow = 0;
        } else {
          const prevRecord = records[i - 1];
          const prevTs = getTs(prevRecord);
          const currTs = getTs(record);
          const dt = prevTs != null && currTs != null ? (currTs - prevTs) / 1000 : 1;

          const prevSpeed = getSpeedMps(prevRecord);
          const currSpeed = getSpeedMps(record);
          const speedAvg = (prevSpeed + currSpeed) / 2;

          if (Number.isFinite(dt) && dt > 0 && speedAvg > 0) {
            estimatedDistance += speedAvg * dt;
          }
          distanceNow = estimatedDistance;
        }
      }

      if (!Number.isFinite(distanceNow) || distanceNow < 0) continue;
      lastDistanceValue = distanceNow;

      const splitEndTarget = lapNumber * stepMeters;
      if (distanceNow >= splitEndTarget && distanceNow > lastProcessedDistance) {
        if (currentSegment.length > 0) {
          const stats = computeSegmentStats(currentSegment);
          laps.push({
            lapNumber,
            // Use per-split distance so chart/table widths & display are correct.
            distance: stepMeters,
            totalDistance: stepMeters,
            elapsed_time: stats.movingTimeSec,
            moving_time: stats.movingTimeSec,
            totalElapsedTime: stats.movingTimeSec,
            totalTimerTime: stats.movingTimeSec,
            average_speed: stats.avgSpeedMps, // m/s
            avgSpeed: stats.avgSpeedMps, // m/s (LapsTable expects m/s in swim mode)
            average_heartrate: stats.avgHeartRate,
            avgHeartRate: stats.avgHeartRate,
            average_cadence: stats.avgCadence,
            avgCadence: stats.avgCadence
          });
        }

        lastProcessedDistance = distanceNow;
        prevBoundaryDistance = splitEndTarget;
        lapNumber += 1;
        currentSegment = [record];
      } else {
        currentSegment.push(record);
      }
    }

    // Add incomplete last segment if it contains enough distance
    if (currentSegment.length > 10) {
      const lastDistance = hasDistanceStream ? getDistance(currentSegment[currentSegment.length - 1]) : lastDistanceValue;
      const incompleteDistance = Math.max(0, lastDistance - prevBoundaryDistance);
      const minIncomplete = stepMeters * 0.45;
      if (incompleteDistance >= minIncomplete && incompleteDistance > 0) {
        const stats = computeSegmentStats(currentSegment);
        laps.push({
          lapNumber,
          distance: incompleteDistance,
          totalDistance: incompleteDistance,
          elapsed_time: stats.movingTimeSec,
          moving_time: stats.movingTimeSec,
          totalElapsedTime: stats.movingTimeSec,
          totalTimerTime: stats.movingTimeSec,
          average_speed: stats.avgSpeedMps,
          avgSpeed: stats.avgSpeedMps,
          average_heartrate: stats.avgHeartRate,
          avgHeartRate: stats.avgHeartRate,
          average_cadence: stats.avgCadence,
          avgCadence: stats.avgCadence
        });
      }
    }

    // Last-resort fallback: if we failed to generate any splits, still return 1 lap
    // so the UI doesn't show an empty table for swim activities.
    if (laps.length === 0) {
      const stats = computeSegmentStats(records);
      const distanceEst = lastDistanceValue > 0 ? lastDistanceValue : stepMeters;
      if (stats.movingTimeSec > 0 || stats.avgSpeedMps > 0) {
        laps.push({
          lapNumber: 1,
          distance: distanceEst,
          totalDistance: distanceEst,
          elapsed_time: stats.movingTimeSec,
          moving_time: stats.movingTimeSec,
          totalElapsedTime: stats.movingTimeSec,
          totalTimerTime: stats.movingTimeSec,
          average_speed: stats.avgSpeedMps,
          avgSpeed: stats.avgSpeedMps,
          average_heartrate: stats.avgHeartRate,
          avgHeartRate: stats.avgHeartRate,
          average_cadence: stats.avgCadence,
          avgCadence: stats.avgCadence
        });
      }
    }

    return laps;
  };
  
  // Ref to store handleActivityClick function for event listener
  const handleActivityClickRef = useRef(null);
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentWeek);
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [currentWeek]);

  // Load activities from localStorage on mount
  useEffect(() => {
    const loadCachedActivities = () => {
      try {
        const cached = localStorage.getItem('weeklyCalendar_activities');
        if (cached) {
          const parsed = JSON.parse(cached);
          // Check if cache is not too old (e.g., 1 hour)
          const cacheTime = localStorage.getItem('weeklyCalendar_cacheTime');
          if (cacheTime && Date.now() - parseInt(cacheTime) < 3600000) {
            setCachedActivities(parsed);
          }
        }
      } catch (error) {
        console.error('Error loading cached activities:', error);
      }
    };
    loadCachedActivities();
  }, []);

  // Save activities to localStorage when they change
  useEffect(() => {
    if (activities && activities.length > 0) {
      try {
        // Match dashboard calendar cap so week navigation into history still has data offline
        const limited = activities.slice(0, 2000);
        localStorage.setItem('weeklyCalendar_activities', JSON.stringify(limited));
        localStorage.setItem('weeklyCalendar_cacheTime', Date.now().toString());
        setCachedActivities(limited);
      } catch (error) {
        console.error('Error saving activities to cache:', error);
      }
    }
  }, [activities]);

  // Use activities prop directly (don't use cache if activities are provided)
  // Cache is only used as fallback when activities prop is empty
  const effectiveActivities = activities && activities.length > 0 ? activities : cachedActivities;

  // Debug logging removed to keep console clean in dev

  const activitiesByDay = useMemo(() => {
    const map = new Map();
    if (effectiveActivities && Array.isArray(effectiveActivities)) {
    effectiveActivities.forEach(act => {
        try {
      const d = new Date(act.date || act.timestamp || act.startDate || Date.now());
          if (isNaN(d.getTime())) {
            console.warn('[WeeklyCalendar] Invalid date for activity:', act);
            return;
          }
      const key = getLocalDateString(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(act);
        } catch (e) {
          console.warn('[WeeklyCalendar] Error processing activity:', e, act);
        }
    });
    }
    return map;
  }, [effectiveActivities]);

  const plannedByDay = useMemo(() => {
    const map = new Map();
    plannedWorkouts.forEach(pw => {
      if (!pw.date) return;
      const key = pw.date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(pw);
    });
    return map;
  }, [plannedWorkouts]);

  const handleRepeatWorkout = useCallback((pw, weeks) => {
    if (!onCopyPlannedWorkout || !pw.date) return;
    const dateOnly = String(pw.date).slice(0, 10);
    const base = new Date(`${dateOnly}T12:00:00`);
    if (isNaN(base.getTime())) return;
    for (let i = 1; i <= weeks; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + 7 * i);
      onCopyPlannedWorkout(pw, d.toISOString().slice(0, 10));
    }
  }, [onCopyPlannedWorkout]);

  const weekRangeMeta = useMemo(() => {
    if (!weekDays?.length) return { primary: '', secondary: '' };
    const start = weekDays[0];
    const end = weekDays[6];
    const fmt = (d, o) => d.toLocaleDateString(undefined, o);
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const primary = sameMonth
      ? `${fmt(start, { weekday: 'short', day: 'numeric' })} – ${fmt(end, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}`
      : `${fmt(start, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(end, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`;
    const secondary = sameMonth
      ? fmt(start, { month: 'long', year: 'numeric' })
      : `${fmt(start, { month: 'long', year: 'numeric' })} → ${fmt(end, { month: 'long', year: 'numeric' })}`;
    return { primary, secondary };
  }, [weekDays]);

  const { weekSummary, prevWeekSummary } = useMemo(() => {
    const empty = { sessions: 0, totalTss: 0, totalSec: 0, totalDist: 0, bySport: [] };
    if (!weekDays?.length) {
      return { weekSummary: empty, prevWeekSummary: { totalTss: 0 } };
    }

    const weekKeys = new Set(weekDays.map((d) => getLocalDateString(d)));
    const prevMonday = addDays(weekDays[0], -7);
    const prevWeekKeys = new Set(
      Array.from({ length: 7 }, (_, i) => getLocalDateString(addDays(prevMonday, i)))
    );

    let sessions = 0;
    let totalTss = 0;
    let totalSec = 0;
    let totalDist = 0;
    const sportMap = new Map();
    let prevTotalTss = 0;

    (effectiveActivities || []).forEach((act) => {
      const key = activityCalendarDateKey(act);
      if (!key) return;

      const inCurrent = weekKeys.has(key);
      const inPrev = prevWeekKeys.has(key);
      if (!inCurrent && !inPrev) return;

      const tss = activityTssResolved(act, userProfile);
      const sec = activityDurationSec(act);
      const dist = activityDistanceMeters(act);

      if (inPrev) {
        prevTotalTss += tss;
      }

      if (inCurrent) {
        sessions += 1;
        totalTss += tss;
        totalSec += sec;
        totalDist += dist;

        const label = normalizeSport(act.sport);
        if (!sportMap.has(label)) {
          sportMap.set(label, { sport: label, count: 0, tss: 0, sec: 0, dist: 0 });
        }
        const row = sportMap.get(label);
        row.count += 1;
        row.tss += tss;
        row.sec += sec;
        row.dist += dist;
      }
    });

    const bySport = Array.from(sportMap.values()).sort((a, b) => b.tss - a.tss || b.count - a.count);
    return {
      weekSummary: { sessions, totalTss, totalSec, totalDist, bySport },
      prevWeekSummary: { totalTss: prevTotalTss }
    };
  }, [effectiveActivities, weekDays, userProfile]);

  // Store handleActivityClick in ref whenever it changes
  useEffect(() => {
    handleActivityClickRef.current = handleActivityClick;
  });

  // Check scroll position for mobile scroll indicators (with selectedTraining)
  useEffect(() => {
    if (!isMobile || !scrollContainerRef.current) return;
    
    const checkScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) return;
      
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftScroll(scrollLeft > 10);
      setShowRightScroll(scrollLeft < scrollWidth - clientWidth - 10);
    };
    
    const container = scrollContainerRef.current;
    container.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll(); // Initial check
    
    // Also check on resize
    window.addEventListener('resize', checkScroll);
    
    return () => {
      container.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [isMobile, weekDays, selectedTraining]);

  // Check scroll position for mobile scroll indicators (without selectedTraining)
  useEffect(() => {
    if (!isMobile || !scrollContainerNoTrainingRef.current) return;
    
    const checkScroll = () => {
      const container = scrollContainerNoTrainingRef.current;
      if (!container) return;
      
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setShowLeftScrollNoTraining(scrollLeft > 10);
      setShowRightScrollNoTraining(scrollLeft < scrollWidth - clientWidth - 10);
    };
    
    const container = scrollContainerNoTrainingRef.current;
    container.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll(); // Initial check
    
    // Also check on resize
    window.addEventListener('resize', checkScroll);
    
    return () => {
      container.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [isMobile, weekDays, selectedTraining]);

  // Listen for activity selection from TrainingTable
  useEffect(() => {
    const handleSelectActivity = (event) => {
      const activity = event.detail;
      if (activity && handleActivityClickRef.current) {
        // Set the week to show the activity's date
        const activityDate = new Date(activity.date || activity.startDate || activity.timestamp || Date.now());
        setCurrentWeek(startOfWeek(activityDate));
        // Trigger activity click to show details after week is set
        setTimeout(() => {
          if (handleActivityClickRef.current) {
            // Reset selected lap when switching activity from external table
            setSelectedLapNumber(null);
            handleActivityClickRef.current(activity);
          }
        }, 200);
      }
    };

    window.addEventListener('selectCalendarActivity', handleSelectActivity);
    return () => window.removeEventListener('selectCalendarActivity', handleSelectActivity);
  }, []); // Only set up listener once

  // Load user profile (zones, units) for training detail / stats when coach views an athlete
  useEffect(() => {
    const loadProfile = async () => {
      try {
        // If coach is viewing an athlete's trainings, load athlete's profile (with zones)
        if (user?.role === 'coach' && selectedAthleteId && selectedAthleteId !== user._id) {
          const response = await api.get(`/user/athlete/${selectedAthleteId}/profile`);
          if (response && response.data) {
            setUserProfile(response.data);
          }
        } else {
          // Otherwise load current user's profile
          const response = await api.get('/user/profile');
          if (response && response.data) {
            setUserProfile(response.data);
          }
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    loadProfile();
  }, [user, selectedAthleteId]);

  // Sync editing values with trainingDetail
  useEffect(() => {
    if (trainingDetail) {
      setEditingTitle(trainingDetail.title || trainingDetail.titleManual || trainingDetail.titleAuto || trainingDetail.name || '');
      setEditingCategory(trainingDetail.category || '');
    }
  }, [trainingDetail]);

  const handleActivityClick = async (activity) => {
    setSelectedTraining(activity);
    setLoadingDetail(true);
    setTrainingDetail(null);
    
    if (onSelectActivity) {
      onSelectActivity(activity);
    }

    // Load detailed training data if it's a FIT or Strava activity
    try {
      if (activity.type === 'fit' && activity._id) {
        // FIT training - get full detail with records
        const trainingId = activity._id;
        if (!trainingId) {
          console.error('FIT training missing _id:', activity);
          setTrainingDetail(activity);
          return;
        }
        const detail = await getFitTraining(trainingId);
        // Ensure we have stream records when present (for downstream charts)
        if (detail && (!detail.records || detail.records.length === 0)) {
          console.warn('FIT training has no records:', trainingId);
        }
        setTrainingDetail({ ...detail, type: 'fit' });
      } else if (activity.type === 'strava' && (activity.stravaId || activity.id)) {
        // Strava activity
        const stravaId = activity.stravaId || activity.id;
        if (!stravaId) {
          console.error('Strava activity missing stravaId:', activity);
          setTrainingDetail(activity);
          return;
        }
        const detail = await getStravaActivityDetail(stravaId, stravaDetailAthleteId);
        // Convert Strava detail to training format (same as FitAnalysisPage)
        if (detail.detail && detail.streams) {
          const startDate = new Date(detail.detail.start_date);
          
          // Handle streams format - can be { time: { data: [...] } } or { time: [...] }
          const timeArray = detail.streams.time?.data || detail.streams.time || [];
          const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
          const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
          const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
          const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
          const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
          
          // Ensure all arrays are actually arrays
          if (!Array.isArray(timeArray)) {
            console.error('Time array is not an array:', timeArray);
            setTrainingDetail(activity);
            return;
          }
          
          const records = timeArray.map((t, i) => ({
            timestamp: new Date(startDate.getTime() + (t * 1000)),
            power: wattsArray[i] || null,
            heartRate: heartrateArray[i] || null,
            speed: velocityArray[i] || null,
            cadence: cadenceArray[i] || null,
            distance: distanceArray[i] || null
          }));

          const sportLower = String(activity?.sport || detail?.detail?.type || '').toLowerCase();
          const isSwim = sportLower.includes('swim');
          let laps = Array.isArray(detail.laps) ? detail.laps : [];
          if (isSwim && laps.length === 0) {
            laps = generateSwimLapsFromRecords(records);
          }
          
          const trainingData = {
            ...activity,
            type: 'strava',
            records,
            laps,
            totalElapsedTime: detail.detail.elapsed_time || 0,
            totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
            totalDistance: detail.detail.distance || 0,
            avgPower: detail.detail.average_watts || null,
            maxPower: detail.detail.max_watts || null,
            avgHeartRate: detail.detail.average_heartrate || null,
            maxHeartRate: detail.detail.max_heartrate || null,
            avgSpeed: detail.detail.average_speed || null,
            maxSpeed: detail.detail.max_speed || null,
            avgCadence: detail.detail.average_cadence || null,
            maxCadence: detail.detail.max_cadence || null,
            sport: activity.sport || detail.detail.type || 'cycling',
            // Use linked training title if available, otherwise use activity title, otherwise use Strava name
            title: activity.linkedTrainingTitle || activity.title || detail.detail.name || '',
            linkedTrainingTitle: activity.linkedTrainingTitle || null,
            category: detail.category || activity.category || ''
          };
          setTrainingDetail(trainingData);
        } else {
          setTrainingDetail(activity);
        }
      } else {
        // Regular training - use as is
        setTrainingDetail(activity);
      }
    } catch (error) {
      // Handle rate limiting (429) errors gracefully
      if (error.response?.status === 429) {
        console.warn('Strava API rate limit exceeded. Please try again in a few minutes.');
        // Show basic activity data without streams
        setTrainingDetail(activity);
        // Optionally show a notification to the user
        // You can add a toast notification here if you have one
      } else {
      console.error('Error loading training detail:', error);
      setTrainingDetail(activity); // Fallback to basic activity data
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const prevWeek = () => setCurrentWeek(d => addDays(d, -7));
  const nextWeek = () => setCurrentWeek(d => addDays(d, 7));
  const today = () => setCurrentWeek(startOfWeek(new Date()));

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const weekSummaryAside = (compact) => (
    <div className={compact ? 'min-w-[112px] flex-shrink-0 self-stretch' : 'min-h-0 min-w-0 h-full self-stretch'}>
      <WeekSummaryColumn summary={weekSummary} user={user} prevWeekTss={prevWeekSummary.totalTss} compact={compact} />
    </div>
  );

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-2 sm:mb-3">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-text">Weekly Calendar</h3>
          {weekRangeMeta.primary && (
            <p className="text-xs sm:text-sm text-lighterText mt-0.5 truncate" title={weekRangeMeta.primary}>
              {weekRangeMeta.primary}
            </p>
          )}
          {weekRangeMeta.secondary && (
            <p className="text-[10px] sm:text-xs text-lighterText/90 truncate" title={weekRangeMeta.secondary}>
              {weekRangeMeta.secondary}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 self-end sm:self-start flex-shrink-0">
          <button
            onClick={prevWeek}
            className="p-1 sm:p-1.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 shadow-sm transition-colors"
          >
            <ChevronLeftIcon className="w-3 h-3 sm:w-4 sm:h-4 text-text" />
          </button>
          <button
            onClick={today}
            className="px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs bg-white hover:bg-gray-50 text-gray-700 rounded-lg border border-gray-200 shadow-sm transition-colors font-medium"
          >
            Today
          </button>
          <button
            onClick={nextWeek}
            className="p-1 sm:p-1.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-200 shadow-sm transition-colors"
          >
            <ChevronRightIcon className="w-3 h-3 sm:w-4 sm:h-4 text-text" />
          </button>
        </div>
      </div>

      {selectedTraining ? (
        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-6'} gap-3 sm:gap-4`}>
          {/* Calendar - Mobile: Horizontal scroll, Desktop: Vertical Layout */}
          {isMobile ? (
            <div className="relative">
              {/* Left scroll indicator */}
              {showLeftScroll && (
                <button
                  onClick={() => {
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                    }
                  }}
                  className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white/80 via-white/40 to-transparent z-10 flex items-center justify-start pl-2"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                    <ChevronLeftIcon className="w-4 h-4 text-primary" />
                  </div>
                </button>
              )}
              
              {/* Right scroll indicator */}
              {showRightScroll && (
                <button
                  onClick={() => {
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                    }
                  }}
                  className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white/80 via-white/40 to-transparent z-10 flex items-center justify-end pr-2"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                    <ChevronRightIcon className="w-4 h-4 text-primary" />
                  </div>
                </button>
              )}
              
              <div 
                ref={scrollContainerRef}
                className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0" 
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
              >
                <div className="flex gap-2 min-w-max">
                {weekDays.map((day, idx) => {
                  const key = getLocalDateString(day);
                  const dayActivities = activitiesByDay.get(key) || [];
                  const dayPlanned = plannedByDay.get(key) || [];
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div
                      key={idx}
                      className={`group bg-white rounded-xl border p-2 min-w-[110px] flex-shrink-0 shadow-sm ${
                        isToday ? 'border-primary/30 ring-1 ring-primary/20' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <div className={`text-xs font-bold leading-none ${isToday ? 'text-primary' : 'text-gray-700'}`}>
                            {day.getDate()}
                          </div>
                          <div className="text-[9px] text-gray-400 mt-0.5">
                            {dayNames[idx].substring(0, 3)}
                          </div>
                        </div>
                        {onPlanWorkout && (
                          <button onClick={() => onPlanWorkout(day)}
                            className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all opacity-0 group-hover:opacity-100"
                            title="Plan workout">
                            <PlusIcon className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        {dayPlanned.map((pw, i) => (
                          <PlannedMiniCard key={`pw-${i}`} pw={pw}
                            onSelect={onSelectPlannedWorkout}
                            onStart={onStartWorkout}
                            onCopy={onCopyPlannedWorkout}
                            onDelete={onDeletePlannedWorkout}
                            onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                          />
                        ))}
                        {dayActivities.slice(0, 2).map((act, i) => {
                          const activityId = act.id || act._id;
                          const isActSelected = selectedTraining && (
                            (selectedTraining.id && String(activityId) === String(selectedTraining.id)) ||
                            (selectedTraining._id && String(activityId) === String(selectedTraining._id))
                          );
                          return (
                            <WeekActCard key={i} act={act} isSelected={isActSelected}
                              onClick={() => handleActivityClick(act)}
                              catBadgeStyle={catBadgeStyle} catLabel={catLabel}
                              compact={true} />
                          );
                        })}
                        {dayActivities.length > 2 && (
                          <div className="text-[8px] text-gray-400 text-center">+{dayActivities.length - 2}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {weekSummaryAside(true)}
                </div>
              </div>
            </div>
          ) : (
          <div className="flex flex-col gap-2 lg:col-span-1 w-full max-w-[min(100%,520px)] min-w-0">
            {weekDays.map((day, idx) => {
              const key = getLocalDateString(day);
              const dayActivities = activitiesByDay.get(key) || [];
              const dayPlanned = plannedByDay.get(key) || [];
              const isToday = isSameDay(day, new Date());

              const dayCard = (
                <div
                  className={`group bg-white rounded-xl border p-1.5 shadow-sm ${
                    isToday ? 'border-primary/30 ring-1 ring-primary/20' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <div className={`text-sm font-bold leading-none ${isToday ? 'text-primary' : 'text-gray-700'}`}>
                        {day.getDate()}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {dayNames[idx].substring(0, 3)}
                      </div>
                    </div>
                    {onPlanWorkout && (
                      <button onClick={() => onPlanWorkout(day)}
                        className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all opacity-0 group-hover:opacity-100"
                        title="Plan workout">
                        <PlusIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {dayPlanned.map((pw, i) => (
                      <PlannedMiniCard key={`pw-${i}`} pw={pw}
                        onSelect={onSelectPlannedWorkout}
                        onStart={onStartWorkout}
                        onCopy={onCopyPlannedWorkout}
                        onDelete={onDeletePlannedWorkout}
                        onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                      />
                    ))}
                    {dayActivities.slice(0, 2).map((act, i) => {
                      const activityId = act.id || act._id;
                      const isActSelected = selectedTraining && (
                        (selectedTraining.id && String(activityId) === String(selectedTraining.id)) ||
                        (selectedTraining._id && String(activityId) === String(selectedTraining._id))
                      );
                      return (
                        <WeekActCard key={i} act={act} isSelected={isActSelected}
                          onClick={() => handleActivityClick(act)}
                          catBadgeStyle={catBadgeStyle} catLabel={catLabel}
                          compact={true} />
                      );
                    })}
                    {dayActivities.length > 2 && (
                      <div className="text-[9px] text-gray-400 text-center">+{dayActivities.length - 2} more</div>
                    )}
                  </div>
                </div>
              );

              if (idx === 6) {
                return (
                  <div key="sun-summary-row" className="flex flex-row gap-2 w-full min-w-0 items-stretch">
                    <div className="min-w-0 flex-1">{dayCard}</div>
                    <div className="w-[min(200px,44%)] shrink-0 self-stretch">{weekSummaryAside(false)}</div>
                  </div>
                );
              }

              return (
                <div key={idx}>
                  {dayCard}
                </div>
              );
            })}
          </div>
          )}

          {/* Training Details - Right Side - Much Wider */}
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 shadow-md p-2 sm:p-3 md:p-4 ${isMobile ? 'w-full mt-3' : 'lg:col-span-5'}`}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 flex-1">
                  {isEditingTitle ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="flex-1 px-3 py-2 border-2 border-white/30 rounded-lg text-base font-semibold focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent bg-white/10 backdrop-blur-md text-text shadow-sm"
                        autoFocus
                      />
                      <button
                        onClick={async () => {
                          try {
                            setSaving(true);
                            const title = editingTitle.trim();
                            if (trainingDetail.type === 'fit' && trainingDetail._id) {
                              await updateFitTraining(trainingDetail._id, { title });
                              // Reload FIT training detail
                              const detail = await getFitTraining(trainingDetail._id);
                              setTrainingDetail({ ...detail, type: 'fit' });
                              // Update selectedTraining to reflect the new title
                              setSelectedTraining(prev => prev ? { ...prev, title: title, titleManual: title } : null);
                              // Notify parent component about the update
                              if (onActivityUpdate) {
                                onActivityUpdate({
                                  type: 'fit',
                                  _id: trainingDetail._id,
                                  id: `fit-${trainingDetail._id}`,
                                  title: title,
                                  titleManual: title
                                });
                              }
                            } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                              await updateStravaActivity(trainingDetail.id, { title });
                              // Reload Strava activity detail
                              const detail = await getStravaActivityDetail(trainingDetail.id, stravaDetailAthleteId);
                              // Convert Strava detail to training format
                              if (detail.detail && detail.streams) {
                                const startDate = new Date(detail.detail.start_date);
                                const timeArray = detail.streams.time?.data || detail.streams.time || [];
                                const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
                                const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
                                const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
                                const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
                                const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
                                
                                if (Array.isArray(timeArray)) {
                                  const records = timeArray.map((t, i) => ({
                                    timestamp: new Date(startDate.getTime() + (t * 1000)),
                                    power: wattsArray[i] || null,
                                    heartRate: heartrateArray[i] || null,
                                    speed: velocityArray[i] || null,
                                    cadence: cadenceArray[i] || null,
                                    distance: distanceArray[i] || null
                                  }));
                                
                                const sportLower = String(trainingDetail?.sport || detail?.detail?.type || '').toLowerCase();
                                const isSwim = sportLower.includes('swim');
                                let laps = Array.isArray(detail.laps) ? detail.laps : [];
                                if (isSwim && laps.length === 0) {
                                  laps = generateSwimLapsFromRecords(records);
                                }
                                  
                                  setTrainingDetail({
                                    ...selectedTraining,
                                    type: 'strava',
                                    records,
                                    laps,
                                    totalElapsedTime: detail.detail.elapsed_time || 0,
                                    totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                    totalDistance: detail.detail.distance || 0,
                                    avgPower: detail.detail.average_watts || null,
                                    maxPower: detail.detail.max_watts || null,
                                    avgHeartRate: detail.detail.average_heartrate || null,
                                    maxHeartRate: detail.detail.max_heartrate || null,
                                    avgSpeed: detail.detail.average_speed || null,
                                    maxSpeed: detail.detail.max_speed || null,
                                    avgCadence: detail.detail.average_cadence || null,
                                    maxCadence: detail.detail.max_cadence || null,
                                    sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                    // Preserve linked training title if it exists, otherwise use saved title or Strava name
                                    title: selectedTraining?.linkedTrainingTitle || title || detail.detail.name || '',
                                    linkedTrainingTitle: selectedTraining?.linkedTrainingTitle || null,
                                    category: detail.category || trainingDetail.category || ''
                                  });
                                } else {
                                  setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                                }
                              } else {
                                setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                              }
                              // Update selectedTraining to reflect the new title
                              setSelectedTraining(prev => prev ? { ...prev, title: title, titleManual: title, name: title } : null);
                              // Notify parent component about the update
                              if (onActivityUpdate) {
                                onActivityUpdate({
                                  type: 'strava',
                                  id: trainingDetail.id,
                                  stravaId: trainingDetail.id,
                                  title: title,
                                  titleManual: title,
                                  name: title
                                });
                              }
                            }
                            setIsEditingTitle(false);
                          } catch (error) {
                            console.error('Error saving title:', error);
                            alert('Error saving title');
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving}
                        className="p-1.5 bg-white/30 backdrop-blur-md text-text rounded-lg hover:bg-white/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm border border-white/20"
                        title="Save title"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingTitle(false);
                          setEditingTitle(trainingDetail?.title || trainingDetail?.name || '');
                        }}
                        className="p-1.5 bg-white/20 backdrop-blur-md text-text rounded-lg hover:bg-white/30 transition-all shadow-sm border border-white/15"
                        title="Cancel"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 group">
                      <h4 
                        className="text-base font-semibold text-text flex-1 cursor-pointer"
                        onClick={() => {
                          setEditingTitle(trainingDetail?.title || trainingDetail?.name || '');
                          setIsEditingTitle(true);
                        }}
                      >
                        {trainingDetail?.linkedTrainingTitle || trainingDetail?.title || trainingDetail?.name || selectedTraining?.linkedTrainingTitle || selectedTraining?.title || selectedTraining?.name || 'Training Details'}
                      </h4>
                      <button
                        onClick={() => {
                          setEditingTitle(trainingDetail?.title || trainingDetail?.name || '');
                          setIsEditingTitle(true);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-lighterText hover:text-text hover:bg-white/20 rounded-lg transition-all"
                        title="Edit title"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  
                  {/* Category */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isEditingCategory ? (
                      <>
                        <select
                          value={editingCategory}
                          onChange={(e) => setEditingCategory(e.target.value)}
                          className="px-2 py-1.5 border border-white/20 rounded-lg bg-white/10 backdrop-blur-md text-xs text-text focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent"
                          autoFocus
                        >
                          <option value="">None</option>
                          <option value="endurance">Endurance</option>
                          <option value="tempo">Tempo</option>
                          <option value="threshold">Threshold</option>
                          <option value="vo2max">VO2max</option>
                          <option value="anaerobic">Anaerobic</option>
                          <option value="recovery">Recovery</option>
                        </select>
                        <button
                          onClick={async () => {
                            try {
                              setSaving(true);
                              const category = editingCategory || null;
                              if (trainingDetail.type === 'fit' && trainingDetail._id) {
                                await updateFitTraining(trainingDetail._id, { category });
                                // Reload FIT training detail
                                const detail = await getFitTraining(trainingDetail._id);
                                setTrainingDetail({ ...detail, type: 'fit' });
                                // Notify parent component about the update
                                if (onActivityUpdate) {
                                  onActivityUpdate({
                                    type: 'fit',
                                    _id: trainingDetail._id,
                                    id: `fit-${trainingDetail._id}`,
                                    category: category
                                  });
                                }
                              } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                                await updateStravaActivity(trainingDetail.id, { category: category || null });
                                // Reload Strava activity detail
                                const detail = await getStravaActivityDetail(trainingDetail.id, stravaDetailAthleteId);
                                // Convert Strava detail to training format
                                if (detail.detail && detail.streams) {
                                  const startDate = new Date(detail.detail.start_date);
                                  const timeArray = detail.streams.time?.data || detail.streams.time || [];
                                  const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
                                  const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
                                  const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
                                  const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
                                  const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
                                  
                                  if (Array.isArray(timeArray)) {
                                    const records = timeArray.map((t, i) => ({
                                      timestamp: new Date(startDate.getTime() + (t * 1000)),
                                      power: wattsArray[i] || null,
                                      heartRate: heartrateArray[i] || null,
                                      speed: velocityArray[i] || null,
                                      cadence: cadenceArray[i] || null,
                                      distance: distanceArray[i] || null
                                    }));

                                    const sportLower = String(trainingDetail?.sport || detail?.detail?.type || '').toLowerCase();
                                    const isSwim = sportLower.includes('swim');
                                    let laps = Array.isArray(detail.laps) ? detail.laps : [];
                                    if (isSwim && laps.length === 0) {
                                      laps = generateSwimLapsFromRecords(records);
                                    }
                                    
                                    setTrainingDetail({
                                      ...selectedTraining,
                                      type: 'strava',
                                      records,
                                      laps,
                                      totalElapsedTime: detail.detail.elapsed_time || 0,
                                      totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                      totalDistance: detail.detail.distance || 0,
                                      avgPower: detail.detail.average_watts || null,
                                      maxPower: detail.detail.max_watts || null,
                                      avgHeartRate: detail.detail.average_heartrate || null,
                                      maxHeartRate: detail.detail.max_heartrate || null,
                                      avgSpeed: detail.detail.average_speed || null,
                                      maxSpeed: detail.detail.max_speed || null,
                                      avgCadence: detail.detail.average_cadence || null,
                                      maxCadence: detail.detail.max_cadence || null,
                                      sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                      // Preserve linked training title if it exists, otherwise use trainingDetail title or Strava name
                                      title: trainingDetail.linkedTrainingTitle || trainingDetail.title || detail.detail.name || '',
                                      linkedTrainingTitle: trainingDetail.linkedTrainingTitle || null,
                                      category: detail.category || category || null
                                    });
                                  } else {
                                    setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                                  }
                                } else {
                                  setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                                }
                              }
                              // Notify parent component about the update
                              if (onActivityUpdate) {
                                onActivityUpdate({
                                  type: 'strava',
                                  id: trainingDetail.id,
                                  stravaId: trainingDetail.id,
                                  category: category
                                });
                              }
                              // Dispatch event to notify other components (e.g., CalendarView) about the update
                              window.dispatchEvent(new CustomEvent('activityUpdated', {
                                detail: {
                                  type: 'strava',
                                  id: trainingDetail.id,
                                  stravaId: trainingDetail.id,
                                  category: category
                                }
                              }));
                              setIsEditingCategory(false);
                            } catch (error) {
                              console.error('Error saving category:', error);
                              alert('Error saving category');
                            } finally {
                              setSaving(false);
                            }
                          }}
                          disabled={saving}
                          className="p-1.5 bg-white/30 backdrop-blur-md text-text rounded-lg hover:bg-white/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm border border-white/20"
                          title="Save category"
                        >
                          <CheckIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingCategory(false);
                            setEditingCategory(trainingDetail?.category || '');
                          }}
                          className="p-1.5 bg-white/20 backdrop-blur-md text-text rounded-lg hover:bg-white/30 transition-all shadow-sm border border-white/15"
                          title="Cancel"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <span
                          className="px-2.5 py-1 rounded-lg text-xs font-medium border"
                          style={catBadgeStyle(trainingDetail?.category)}
                        >
                          {trainingDetail?.category ? catLabel(trainingDetail.category) : 'Category'}
                        </span>
                        <button
                          onClick={() => {
                            setEditingCategory(trainingDetail?.category || '');
                            setIsEditingCategory(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-lighterText hover:text-text hover:bg-white/20 rounded-lg transition-all"
                          title="Edit category"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Close button */}
                <button
                  onClick={() => {
                    setSelectedTraining(null);
                    setTrainingDetail(null);
                    setIsEditingTitle(false);
                    setIsEditingCategory(false);
                  }}
                  className="text-lighterText hover:text-text p-1.5 rounded-lg hover:bg-white/20 flex-shrink-0 transition-all"
                  title="Close"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {loadingDetail ? (
                <div className="flex items-center justify-center py-8 sm:py-12">
                  <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary"></div>
                </div>
              ) : trainingDetail ? (
                <div className="space-y-3 sm:space-y-4">
                  {/* Training Stats */}
                  <TrainingStats 
                    training={trainingDetail} 
                    user={user}
                    onUpdate={async () => {
                      // Reload detail if needed
                      try {
                        if (trainingDetail.type === 'fit' && trainingDetail._id) {
                          const detail = await getFitTraining(trainingDetail._id);
                          setTrainingDetail({ ...detail, type: 'fit' });
                        } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                          const detail = await getStravaActivityDetail(trainingDetail.id, stravaDetailAthleteId);
                          // Convert Strava detail to training format
                          if (detail.detail && detail.streams) {
                            const startDate = new Date(detail.detail.start_date);
                            const timeArray = detail.streams.time?.data || detail.streams.time || [];
                            const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
                            const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
                            const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
                            const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
                            const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
                            
                            if (Array.isArray(timeArray)) {
                              const records = timeArray.map((t, i) => ({
                                timestamp: new Date(startDate.getTime() + (t * 1000)),
                                power: wattsArray[i] || null,
                                heartRate: heartrateArray[i] || null,
                                speed: velocityArray[i] || null,
                                cadence: cadenceArray[i] || null,
                                distance: distanceArray[i] || null
                              }));

                              const sportLower = String(trainingDetail?.sport || detail?.detail?.type || '').toLowerCase();
                              const isSwim = sportLower.includes('swim');
                              let laps = Array.isArray(detail.laps) ? detail.laps : [];
                              if (isSwim && laps.length === 0) {
                                laps = generateSwimLapsFromRecords(records);
                              }
                              
                              setTrainingDetail({
                                ...selectedTraining,
                                type: 'strava',
                                records,
                                laps,
                                totalElapsedTime: detail.detail.elapsed_time || 0,
                                totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                totalDistance: detail.detail.distance || 0,
                                avgPower: detail.detail.average_watts || null,
                                maxPower: detail.detail.max_watts || null,
                                avgHeartRate: detail.detail.average_heartrate || null,
                                maxHeartRate: detail.detail.max_heartrate || null,
                                avgSpeed: detail.detail.average_speed || null,
                                maxSpeed: detail.detail.max_speed || null,
                                avgCadence: detail.detail.average_cadence || null,
                                maxCadence: detail.detail.max_cadence || null,
                                sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                // Preserve linked training title if it exists, otherwise use trainingDetail title or Strava name
                                title: trainingDetail.linkedTrainingTitle || trainingDetail.title || detail.detail.name || '',
                                linkedTrainingTitle: trainingDetail.linkedTrainingTitle || null,
                                category: detail.category || trainingDetail.category || ''
                              });
                            } else {
                              setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                            }
                          } else {
                            setTrainingDetail({ ...selectedTraining, type: 'strava', ...detail });
                          }
                        }
                      } catch (error) {
                        console.error('Error reloading training detail:', error);
                      }
                    }}
                  />

                  {/* Laps section */}
                  {(trainingDetail.records && trainingDetail.records.length > 0) ||
                   (trainingDetail.laps && trainingDetail.laps.length > 0) ? (
                    <div className="mt-4 sm:mt-6">
                      {/* Laps Table */}
                      {trainingDetail.laps && trainingDetail.laps.length > 0 && (
                        <div className="mt-3 sm:mt-4">
                          <LapsTable 
                            training={trainingDetail}
                            onUpdate={async () => {
                              // Reload detail if needed
                              try {
                                if (trainingDetail.type === 'fit' && trainingDetail._id) {
                                  const detail = await getFitTraining(trainingDetail._id);
                                  setTrainingDetail({ ...detail, type: 'fit' });
                                } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                                  const detail = await getStravaActivityDetail(trainingDetail.id, stravaDetailAthleteId);
                                  if (detail.detail && detail.streams) {
                                    const startDate = new Date(detail.detail.start_date);
                                    const timeArray = detail.streams.time?.data || detail.streams.time || [];
                                    const wattsArray = detail.streams.watts?.data || detail.streams.watts || [];
                                    const heartrateArray = detail.streams.heartrate?.data || detail.streams.heartrate || [];
                                    const velocityArray = detail.streams.velocity_smooth?.data || detail.streams.velocity_smooth || [];
                                    const cadenceArray = detail.streams.cadence?.data || detail.streams.cadence || [];
                                    const distanceArray = detail.streams.distance?.data || detail.streams.distance || [];
                                    
                                    if (Array.isArray(timeArray)) {
                                      const records = timeArray.map((t, i) => ({
                                        timestamp: new Date(startDate.getTime() + (t * 1000)),
                                        power: wattsArray[i] || null,
                                        heartRate: heartrateArray[i] || null,
                                        speed: velocityArray[i] || null,
                                        cadence: cadenceArray[i] || null,
                                        distance: distanceArray[i] || null
                                      }));

                                      const sportLower = String(trainingDetail?.sport || detail?.detail?.type || '').toLowerCase();
                                      const isSwim = sportLower.includes('swim');
                                      let laps = Array.isArray(detail.laps) ? detail.laps : [];
                                      if (isSwim && laps.length === 0) {
                                        laps = generateSwimLapsFromRecords(records);
                                      }
                                      
                                      setTrainingDetail({
                                        ...selectedTraining,
                                        type: 'strava',
                                        records,
                                        laps,
                                        totalElapsedTime: detail.detail.elapsed_time || 0,
                                        totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                        totalDistance: detail.detail.distance || 0,
                                        avgPower: detail.detail.average_watts || null,
                                        maxPower: detail.detail.max_watts || null,
                                        avgHeartRate: detail.detail.average_heartrate || null,
                                        maxHeartRate: detail.detail.max_heartrate || null,
                                        avgSpeed: detail.detail.average_speed || null,
                                        maxSpeed: detail.detail.max_speed || null,
                                        avgCadence: detail.detail.average_cadence || null,
                                        maxCadence: detail.detail.max_cadence || null,
                                        sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                        title: trainingDetail.linkedTrainingTitle || trainingDetail.title || detail.detail.name || '',
                                        linkedTrainingTitle: trainingDetail.linkedTrainingTitle || null,
                                        category: detail.category || trainingDetail.category || ''
                                      });
                                    }
                                  }
                                }
                              } catch (error) {
                                console.error('Error reloading training detail:', error);
                              }
                            }}
                            user={user}
                            selectedLapNumber={selectedLapNumber}
                            onSelectLapNumber={setSelectedLapNumber}
                            disableZoom={true}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-lighterText text-center py-8 bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                      Training has no data to display charts (no records or laps)
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-lighterText text-center py-8">
                  Loading training details...
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        /* Calendar - Mobile: Horizontal scroll, Desktop: Grid Layout */
        isMobile ? (
          <div className="relative">
            {/* Left scroll indicator */}
            {showLeftScrollNoTraining && (
              <button
                onClick={() => {
                  if (scrollContainerNoTrainingRef.current) {
                    scrollContainerNoTrainingRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                  }
                }}
                className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white/80 via-white/40 to-transparent z-10 flex items-center justify-start pl-2"
              >
                <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                  <ChevronLeftIcon className="w-4 h-4 text-primary" />
                </div>
              </button>
            )}
            
            {/* Right scroll indicator */}
            {showRightScrollNoTraining && (
              <button
                onClick={() => {
                  if (scrollContainerNoTrainingRef.current) {
                    scrollContainerNoTrainingRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                  }
                }}
                className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white/80 via-white/40 to-transparent z-10 flex items-center justify-end pr-2"
              >
                <div className="w-6 h-6 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center">
                  <ChevronRightIcon className="w-4 h-4 text-primary" />
                </div>
              </button>
            )}
            
            <div 
              ref={scrollContainerNoTrainingRef}
              className="overflow-x-auto -mx-2 sm:mx-0 px-2 sm:px-0" 
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
            >
              <div className="flex gap-2 min-w-max">
          {weekDays.map((day, idx) => {
            const key = getLocalDateString(day);
            const dayActivities = activitiesByDay.get(key) || [];
            const dayPlanned = plannedByDay.get(key) || [];
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={idx}
                className={`group bg-white rounded-xl border p-2 min-w-[130px] flex-shrink-0 shadow-sm ${
                  isToday ? 'border-primary/30 ring-1 ring-primary/20' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <div className={`text-sm font-bold leading-none ${isToday ? 'text-primary' : 'text-gray-700'}`}>
                      {day.getDate()}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {dayNames[idx].substring(0, 3)}
                    </div>
                  </div>
                  {onPlanWorkout && (
                    <button onClick={() => onPlanWorkout(day)}
                      className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all opacity-0 group-hover:opacity-100"
                      title="Plan workout">
                      <PlusIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {dayPlanned.map((pw, i) => (
                    <PlannedMiniCard key={`pw-${i}`} pw={pw}
                      onSelect={onSelectPlannedWorkout}
                      onStart={onStartWorkout}
                      onCopy={onCopyPlannedWorkout}
                      onDelete={onDeletePlannedWorkout}
                      onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                    />
                  ))}
                  {dayActivities.slice(0, 2).map((act, i) => (
                    <WeekActCard key={i} act={act} isSelected={false}
                      onClick={() => handleActivityClick(act)}
                      catBadgeStyle={catBadgeStyle} catLabel={catLabel}
                      compact={true} />
                  ))}
                  {dayActivities.length > 2 && (
                    <div className="text-[8px] text-gray-400 text-center">+{dayActivities.length - 2}</div>
                  )}
                </div>
              </div>
            );
          })}
              {weekSummaryAside(true)}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-2 sm:gap-3">
            {weekDays.map((day, idx) => {
              const key = getLocalDateString(day);
              const dayActivities = activitiesByDay.get(key) || [];
              const dayPlanned = plannedByDay.get(key) || [];
              const isToday = isSameDay(day, new Date());

              return (
                <div
                  key={idx}
                  className={`group bg-white rounded-xl border p-2 min-w-0 shadow-sm ${
                    isToday ? 'border-primary/30 ring-1 ring-primary/20' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className={`text-base font-bold leading-none ${isToday ? 'text-primary' : 'text-gray-700'}`}>
                        {day.getDate()}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                        {dayNames[idx].substring(0, 3)}
                      </div>
                    </div>
                    {onPlanWorkout && (
                      <button
                        onClick={() => onPlanWorkout(day)}
                        className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all opacity-0 group-hover:opacity-100"
                        title="Plan workout"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {dayPlanned.map((pw, i) => (
                      <PlannedMiniCard
                        key={`pw-${i}`}
                        pw={pw}
                        onSelect={onSelectPlannedWorkout}
                        onStart={onStartWorkout}
                        onCopy={onCopyPlannedWorkout}
                        onDelete={onDeletePlannedWorkout}
                        onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                      />
                    ))}
                    {dayActivities.map((act, i) => (
                      <WeekActCard key={i} act={act} isSelected={false}
                        onClick={() => handleActivityClick(act)}
                        catBadgeStyle={catBadgeStyle} catLabel={catLabel}
                        compact={false} />
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="min-w-0 flex flex-col justify-start">{weekSummaryAside(false)}</div>
          </div>
        )
      )}
    </div>
  );
};

export default WeeklyCalendar;
