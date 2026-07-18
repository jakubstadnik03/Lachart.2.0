import React, { useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import TrainingFormComponent from '../TrainingForm';
import SessionProgressChart from '../training/SessionProgressChart';
import TimeInZonesBar from '../training/TimeInZonesBar';
import ActivityPeaksTab from '../training/ActivityPeaksTab';
import RunSplitsTable from '../training/RunSplitsTable';
import ActivityShareSheet from '../sharing/ActivityShareSheet';
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
  FlagIcon,
} from '@heroicons/react/24/outline';
import SportIcon from '../shared/SportIcon';
import { DurationPickerField, DurationPickerSheet } from '../shared/DurationWheelPicker.jsx';
import api, { getSimilarActivities, getRaceEvents } from '../../services/api';
import {
  formatDistance,
  formatDistanceFieldDisplay,
  formatDistanceForUser,
  formatDistanceInputFromMetres,
  formatElevation,
  distanceInputPlaceholder,
  distanceInputUnitLabel,
  formatPaceFromDistanceAndDuration,
  formatPaceFromSpeedMps,
  formatPaceMMSS,
  formatSpeed,
  getUserUnits,
  parseDistanceInputToMetres,
  paceSecondsToDisplaySeconds,
  paceUnitShort,
  resolveDistanceUnitSystem,
} from '../../utils/unitsConverter';
import { distinctiveTitleTokens, isGenericTitle, titleTokens } from '../../utils/compareSimilarity';
import {
  buildActivityMatcher,
  getActivityAppId,
  metricsPatchFromDetail,
  patchCalendarCache,
  resolveActivityCaloriesKcal,
  resolveActivitySaveKind,
} from '../../utils/activityEventPatches';
import { sanitizeDecimalInput, parseLactateValue } from '../../utils/lactateInput';
import { useAuth } from '../../context/AuthProvider';
import { useCategories, hexToRgba } from '../../context/CategoryContext';
import { DAY_THEME_PRESETS, dayThemePresetColor, PERIOD_TYPES, periodColor, buildPeriodsByDate } from '../../utils/calendarThemes';
import { computePowerTss, computeHrTss, canToggleTss, resolveActivityTss, getAvailableTssModes, getActivityTssDisplayMode, cycleTssMode, tssModeLabel, tssToggleDisabledReason } from '../../utils/computeTss';
import { compareActivitiesChronologically, buildChronologicalDayItems, matchesCalendarSportFilter, activitySportBucket, plannedSportBucket, sportFilterChip, sortPlannedWorkoutsForDay, reorderPlannedWorkoutIds, pairPlannedWithActivities, planSportMatchesActivity } from '../../utils/calendarDayOrdering';
import { stravaHalfCadenceToSpm, cadenceDisplayUnit } from '../../utils/cadenceDisplay';
import { notifyTssDisplayModeChanged, clearFormFitnessCache } from '../../utils/uiPrefs';
import { motion, AnimatePresence } from 'framer-motion';
import TrainingComments from '../TrainingComments';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip as LeafletTooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import TrainingChart from '../FitAnalysis/TrainingChart';
import RaceDetailModal from './RaceDetailModal';

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

/** Prefer explicit plannedDuration (simple editor) over structured step sum. */
function healLegacyPlannedDurationSecs(stored, completedSecs = 0) {
  const s = Number(stored) || 0;
  // Legacy bug: "1:20" (1h20m) was saved as h*60+m seconds (80s).
  if (s < 60 || s >= 3600) return s;
  const h = Math.floor(s / 60);
  const m = s % 60;
  if (h <= 0 || m >= 60) return s;
  const healed = h * 3600 + m * 60;
  if (completedSecs > 0 && completedSecs / s > 4 && completedSecs / healed <= 1.5) return healed;
  return s;
}

function plannedWorkoutDurationSecs(pw, completedSecs = 0) {
  if (!pw) return 0;
  const explicit = Number(pw.plannedDuration || 0);
  const fromSteps = planStepTotalSecs(pw.steps) || 0;
  if (explicit > 0) {
    const healed = healLegacyPlannedDurationSecs(explicit, completedSecs);
    if (fromSteps > healed) return fromSteps;
    return healed;
  }
  return fromSteps;
}

function fmtPlanDuration(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h${m}m` : `${h}h`;
  return `${m}m`;
}

/** Longhand borders only — avoids React warning when mixing border + borderLeft*. */
function outlineBorder({ color, leftColor, leftWidth = 2, width = 1, style = 'solid' }) {
  const lc = leftColor ?? color;
  return {
    borderTopWidth: width,
    borderRightWidth: width,
    borderBottomWidth: width,
    borderLeftWidth: leftWidth,
    borderTopStyle: style,
    borderRightStyle: style,
    borderBottomStyle: style,
    borderLeftStyle: 'solid',
    borderTopColor: color,
    borderRightColor: color,
    borderBottomColor: color,
    borderLeftColor: lc,
  };
}

/** Resolve display unit system — prefers auth user / localStorage units over API profile. */
function userUnitSystem(user) {
  return resolveDistanceUnitSystem({ units: getUserUnits(user) });
}

/** Split distance into table { val, unit } for planned/completed rows. */
function distDisplayParts(meters, unitSystem) {
  if (!meters || meters <= 0) return { val: null, unit: '' };
  const { value, unit } = formatDistance(meters, unitSystem);
  let val;
  if (unit === 'mi') val = value >= 10 ? value.toFixed(1) : value.toFixed(2);
  else if (unit === 'km') val = value % 1 === 0 ? String(value) : value.toFixed(1);
  else val = String(Math.round(value));
  return { val, unit };
}

/** Compact completed line: time · distance · avg power/pace · TSS. */
function activityCompletedStats(activity, profile = null) {
  if (!activity) return null;
  const dur = Number(
    activity.movingTime || activity.moving_time || activity.duration
    || activity.elapsed_time || activity.totalTimerTime || activity.totalElapsedTime || 0,
  );
  const dist = Number(activity.distance || activity.totalDistance || 0);
  const power = Number(
    activity.normalizedPower || activity.avgPower || activity.average_watts || activity.averagePower || 0,
  );
  const s = String(activity.sport || activity.type || '').toLowerCase();
  const isSwim = s.includes('swim');
  const isRun = s.includes('run') || s.includes('hike') || s.includes('walk') || s.includes('trail');
  const isBike = s.includes('ride') || s.includes('cycl') || s.includes('bike') || s.includes('virtual');

  const unitSystem = userUnitSystem(profile);
  const durStr = dur > 0 ? fmtPlanDuration(dur) : null;
  const distStr = dist > 0 ? formatDistance(dist, unitSystem).formatted : null;

  let paceOrPower = null;
  if (isBike && power > 0) {
    paceOrPower = `${Math.round(power)} W`;
  } else if (isSwim || isRun) {
    const avgSpeed = Number(activity.avgSpeed || activity.average_speed || 0);
    const sport = activity.sport || activity.type || '';
    if (avgSpeed > 0) {
      paceOrPower = formatPaceFromSpeedMps(avgSpeed, unitSystem, sport);
    } else if (dist > 0 && dur > 0) {
      paceOrPower = formatPaceFromDistanceAndDuration(dist, dur, unitSystem, sport);
    }
  }

  const tssVal = profile
    ? resolveActivityTss(activity, profile, { user: profile })
    : Number(activity.tss || activity.trainingStressScore || activity.trainingLoad || activity.manualTss || 0);
  const tssStr = tssVal > 0 ? `${Math.round(tssVal)} TSS` : null;

  const parts = [durStr, distStr, paceOrPower, tssStr].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function plannedWorkoutPreviewStats(pw, sportKey) {
  if (!pw) return null;
  const dur = plannedWorkoutDurationSecs(pw);
  const distM = (() => {
    const n = Number(pw.plannedDistance || 0);
    return n > 0 && n < 100 ? n * 1000 : n;
  })();
  const sp = String(sportKey || pw.sport || '').toLowerCase();
  const distStr = distM > 0
    ? (sp.includes('swim') || distM < 1000 ? `${Math.round(distM)} m` : `${(distM / 1000).toFixed(1)} km`)
    : null;
  const parts = [dur > 0 ? fmtPlanDuration(dur) : null, distStr, Number(pw.targetTss) > 0 ? `${Math.round(Number(pw.targetTss))} TSS` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

// Tiny inline SVG power profile for planned workout cards
function PlanMiniChart({ steps, color, width = 60, height = 16 }) {
  if (!steps?.length) return null;
  const STEP_COLORS = { warmup:'#fbbf24', work:'#767EB5', recovery:'#6ee7b7', cooldown:'#38bdf8', rest:'#d1d5db' };
  const FLOOR = 0.12;

  // Build segment list: individual steps stay as-is; repeat groups become one
  // "compressed" segment that renders a capped number of visible cycles so the
  // chart stays readable even in a 60px-wide thumbnail.
  const segments = []; // { kind:'step', step } | { kind:'group', workDur, recDur, reps, totalDur }
  const visited = new Set();
  steps.forEach(s => {
    if (!s.groupId) { segments.push({ kind:'step', step:s }); return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const header = group.find(x => x.isGroupHeader);
    const reps = header?.groupRepeat || 1;
    const workDur = header?.durationSeconds || 0;
    const recDur  = group.filter(x => !x.isGroupHeader).reduce((a, g) => a + (g.durationSeconds || 0), 0);
    segments.push({ kind:'group', workDur, recDur, reps, totalDur:(workDur + recDur) * reps });
  });

  const total = segments.reduce((s, seg) =>
    s + (seg.kind === 'step' ? (seg.step.durationSeconds || 30) : seg.totalDur), 0);
  if (!total) return null;

  const elems = [];
  let cx = 0;

  segments.forEach((seg, si) => {
    if (seg.kind === 'step') {
      const s = seg.step;
      const w  = Math.max(1.5, (s.durationSeconds || 30) / total * width);
      const intensity = s.stepType==='work' ? 1 : s.stepType==='warmup' ? 0.55 : s.stepType==='cooldown' ? 0.4 : s.stepType==='recovery' ? 0.3 : 0.15;
      const bh = Math.max(FLOOR * height, intensity * height);
      const bw = Math.max(1, w - 0.5);
      const fill = STEP_COLORS[s.stepType] || color || '#767EB5';
      const sx = cx; cx += w;
      if (s.isRamp && s.stepType === 'warmup') {
        elems.push(<polygon key={si} points={`${sx},${height} ${sx+bw},${height-bh} ${sx+bw},${height}`} fill={fill} opacity={0.85}/>);
      } else if (s.isRamp && s.stepType === 'cooldown') {
        elems.push(<polygon key={si} points={`${sx},${height-bh} ${sx},${height} ${sx+bw},${height}`} fill={fill} opacity={0.85}/>);
      } else {
        elems.push(<rect key={si} x={sx} y={height-bh} width={bw} height={bh} fill={fill} rx={1} opacity={0.85}/>);
      }
    } else {
      // Repeat group — render as a compressed "comb" of work/recovery stripes.
      // Limit visible cycles so each stripe is at least 2px wide.
      const { workDur, recDur, reps, totalDur } = seg;
      const gw = Math.max(6, totalDur / total * width);
      const sx = cx; cx += gw;
      const cycleTotalDur = workDur + (recDur || 0);
      // How many cycles fit given minimum stripe width of 2px
      const maxCycles = Math.max(1, Math.floor(gw / 2));
      const visCycles = Math.min(reps, maxCycles);
      const cycleW    = gw / visCycles;
      const workFrac  = cycleTotalDur > 0 ? workDur / cycleTotalDur : 1;
      const workW     = cycleW * workFrac;
      const recW      = cycleW * (1 - workFrac);
      const workH     = height; // full height
      const recH      = Math.max(FLOOR * height, 0.32 * height);

      for (let r = 0; r < visCycles; r++) {
        const x0 = sx + r * cycleW;
        // Work stripe
        const ww = Math.max(1, workW - 0.5);
        elems.push(<rect key={`${si}w${r}`} x={x0} y={0} width={ww} height={workH} fill={STEP_COLORS.work} rx={r===0&&visCycles===1?1:0} opacity={0.85}/>);
        // Recovery stripe
        if (recW >= 1 && recDur > 0) {
          const rw = Math.max(1, recW - 0.5);
          elems.push(<rect key={`${si}r${r}`} x={x0 + workW} y={height - recH} width={rw} height={recH} fill={STEP_COLORS.recovery} rx={0} opacity={0.80}/>);
        }
      }
    }
  });

  return (
    <svg width={width} height={height} style={{ display:'block', flexShrink:0 }}>
      {elems}
    </svg>
  );
}

// Coerce any input to a *valid* Date. A bad activity/plan date (null, '',
// malformed string) otherwise yields an Invalid Date whose .toISOString()
// throws "RangeError: Invalid time value" and takes down the whole calendar.
function safeDate(date, fallback = new Date()) {
  const d = new Date(date);
  return isNaN(d.getTime()) ? new Date(fallback) : d;
}

function startOfWeek(date) {
  const d = safeDate(date);
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}

function startOfMonth(date) {
  const d = safeDate(date);
  d.setDate(1);
  d.setHours(0,0,0,0);
  return d;
}

function endOfMonth(date) {
  const d = safeDate(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDays(date, n) { const d = safeDate(date); d.setDate(d.getDate()+n); return d; }
function addMonths(date, n) {
  const d = safeDate(date);
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function isSameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

/** Month grid with only the weeks that contain days from `anchorDate`'s month (4–6 rows, never a trailing all-grey week). */
function getCompactMonthDays(anchorDate, { skipLeadingWeek = false } = {}) {
  const monthEnd = endOfMonth(anchorDate);
  let weekStart = startOfWeek(startOfMonth(anchorDate));
  const result = [];
  let isFirstWeek = true;
  while (true) {
    if (!(skipLeadingWeek && isFirstWeek)) {
      for (let i = 0; i < 7; i++) result.push(addDays(weekStart, i));
    }
    if (addDays(weekStart, 6) >= monthEnd) break;
    weekStart = addDays(weekStart, 7);
    isFirstWeek = false;
  }
  return result;
}

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
  if (s.includes('ride') || s.includes('cycl') || s.includes('bike')) return '#3b82f6';
  if (s.includes('swim')) return '#06b6d4';
  if (s.includes('elliptical') || s.includes('cross-trainer') || s.includes('crosstrainer')) return '#a855f7';
  return '#8b5cf6';
}

// ─── Compliance helpers ────────────────────────────────────────────────────────
function getCompliance(plannedSecs, actualSecs) {
  if (!plannedSecs || !actualSecs) return null;
  const r = actualSecs / plannedSecs;
  // Green from 0.85 so it matches the compliance gauge's green band (~86%+):
  // when the marker is green, the rows and calendar read green too.
  if (r >= 0.85) return { color: '#22c55e', bg: '#f0fdf4', label: 'On target',  ring: '#22c55e' };
  if (r >= 0.75) return { color: '#eab308', bg: '#fefce8', label: 'Good',        ring: '#eab308' };
  if (r >= 0.55) return { color: '#f97316', bg: '#fff7ed', label: 'Short',       ring: '#f97316' };
  return           { color: '#ef4444', bg: '#fef2f2', label: 'Missed',       ring: '#ef4444' };
}

/** Table cell colour — aligned with the duration compliance gauge (rounded %). */
function getMetricComparisonColor(planned, actual, { durationCompliancePct = null, isDuration = false } = {}) {
  if (!(planned > 0) || !(actual > 0)) return null;
  if (isDuration && durationCompliancePct != null && durationCompliancePct >= 85) {
    return '#059669';
  }
  const tier = getCompliance(planned, actual);
  if (!tier) return null;
  const TIER_TEXT = {
    '#22c55e': '#059669',
    '#eab308': '#ca8a04',
    '#f97316': '#ea580c',
    '#ef4444': '#dc2626',
  };
  // Gauge shows rounded duration % — when it's in the green band, don't flag rows red.
  if (durationCompliancePct != null && durationCompliancePct >= 85) {
    if (tier.color === '#ef4444' || tier.color === '#f97316') return '#6b7280';
    return TIER_TEXT[tier.color] || tier.color;
  }
  return TIER_TEXT[tier.color] || tier.color;
}

function findCompliance(pw, acts) {
  if (!acts || acts.length === 0) return null;
  const plannedSecs = plannedWorkoutDurationSecs(pw);
  if (!plannedSecs) return null;
  const match = acts.find(a => planSportMatchesActivity(pw.sport, a.sport || a.type || ''));
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
  const matched = (acts || []).some(a => planSportMatchesActivity(pw.sport, a.sport || a.type || ''));
  if (matched) return 'completed';
  const pwDateStr = String(pw.date || '').slice(0, 10);
  if (!pwDateStr) return null;
  if (pwDateStr < todayDateStr) return 'missed';
  return null;
}

// ─── Planned workout card (desktop) ──────────────────────────────────────────
function PlannedWorkoutCard({ pw, onSelect, onStart, compact = false, onDragStart, onDragEnd, isDragging = false, compliance = null, pairingState = null, linkedActivity = null, onSelectLinked = null, onDuplicate = null, onDelete = null, onRepeat = null, onReorderDragOver = null, onReorderDrop = null, reorderHint = null }) {
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
  const plannedDur = plannedWorkoutDurationSecs(pw);
  const isCompleted = pw.status === 'completed';
  const isSkipped   = pw.status === 'skipped';

  // When merged with an actual activity, prefer real metrics for the card
  const actSecs = Number(linkedActivity?.duration || linkedActivity?.moving_time
                || linkedActivity?.elapsed_time || linkedActivity?.movingTime
                || linkedActivity?.totalTimerTime || linkedActivity?.totalElapsedTime || 0);
  const sport = linkedActivity ? (linkedActivity.sport || linkedActivity.type || plannedSport) : plannedSport;
  const duration = linkedActivity ? actSecs : plannedDur;
  // Category: prefer linked activity's category (user may set it after completing)
  // over the planned workout's category
  const effectiveCategory = linkedActivity?.category || pw.category || null;
  const completedStats = linkedActivity ? activityCompletedStats(linkedActivity) : null;
  const plannedStats = !linkedActivity ? plannedWorkoutPreviewStats(pw, sport) : null;

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
        onDragOver={onReorderDragOver || undefined}
        onDrop={onReorderDrop || undefined}
        title={!isCompleted && !isSkipped && onReorderDragOver
          ? 'Drag to another day to move · drop on another workout to reorder'
          : undefined}
      >
        {reorderHint === 'before' && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10 pointer-events-none rounded-full" />
        )}
        {reorderHint === 'after' && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-10 pointer-events-none rounded-full" />
        )}
        <button
          onClick={() => {
            if (linkedActivity && onSelectLinked) onSelectLinked(linkedActivity);
            else if (onSelect) onSelect(pw);
          }}
          className="w-full max-w-full text-left rounded-lg transition-all px-2 py-1.5 flex flex-col gap-1 hover:brightness-95"
          style={{
            backgroundColor: cardBgColor,
            ...outlineBorder({ color: cardBorderColor, leftColor: color, leftWidth: 2, style: cardBorderStyle }),
            minWidth: 0, overflow: 'hidden',
            cursor: (!isCompleted && !isSkipped) ? 'grab' : 'pointer',
          }}
          title={pw.title}
        >
          <div className="flex items-center gap-1 min-w-0">
            <SportIcon sport={sport} className="w-3.5 h-3.5 flex-shrink-0" />
            <span
              className="text-[11px] font-bold truncate flex-1 leading-tight"
              style={{ color: isCompletedPair ? '#166534' : isMissedPair ? '#991b1b' : isSkipped ? '#9ca3af' : isPurelyPlanned ? color : '#1e293b' }}
            >
              {pw.title || 'Planned'}
            </span>
            {effectiveCategory && getCategory(effectiveCategory) && (
              <span
                className="text-[8px] uppercase tracking-wide px-1 py-0 rounded font-bold border leading-none flex-shrink-0 max-w-[64px] truncate"
                style={getCatStyle(effectiveCategory)}
                title={getCategory(effectiveCategory)?.label}
              >
                {getCategory(effectiveCategory)?.label}
              </span>
            )}
          </div>
          {(completedStats || plannedStats) && (
            <div className={`text-[10px] leading-tight truncate tabular-nums ${isCompletedPair ? 'text-green-800' : 'text-gray-500'}`}>
              {completedStats || plannedStats}
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
function WeekActivityCard({ a, isSelected, onSelect, onActivityClick, onAddLactate, catBadgeStyle, catLabel, userProfile = null }) {
  const title = a.title || a.name || a.originalFileName || 'Activity';
  const statsLine = activityCompletedStats(a, userProfile);
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
        className={`w-full text-left rounded-lg transition-all px-2 py-1.5 flex flex-col gap-1 ${
          isSelected
            ? 'bg-gradient-to-br from-primary to-primary-dark text-white shadow-md ring-2 ring-primary/20'
            : 'bg-white hover:bg-gray-50 text-gray-800 shadow-sm hover:shadow-md'
        }`}
        style={outlineBorder({ color: isSelected ? 'transparent' : '#e5e7eb', leftColor: color, leftWidth: 2 })}
      >
        <div className="flex items-center gap-1 min-w-0">
          <SportIcon sport={a.sport} className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[11px] font-bold truncate flex-1 leading-tight">{title}</span>
          {a.category && catBadgeStyle && catLabel && (
            <span
              className="text-[8px] font-bold uppercase tracking-wide px-1 py-0 rounded border flex-shrink-0 leading-none max-w-[64px] truncate"
              style={isSelected
                ? { backgroundColor: 'rgba(255,255,255,.18)', color: '#fff', borderColor: 'rgba(255,255,255,.35)' }
                : catBadgeStyle(a.category)}
              title={catLabel(a.category)}
            >
              {catLabel(a.category)}
            </span>
          )}
        </div>
        {statsLine && (
          <div className={`text-[10px] leading-tight truncate tabular-nums ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
            {statsLine}
          </div>
        )}
      </button>
      {onAddLactate && a.type === 'strava' && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddLactate(a); }}
          title="Add lactate"
          className="absolute top-0.5 right-0.5 hidden group-hover/act:flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-700 hover:bg-violet-200 border border-violet-200 leading-none z-10"
        >
          + La
        </button>
      )}
    </div>
  );
}

// ─── Lap Chart ────────────────────────────────────────────────────────────────
function LapChart({ laps, color, isBike, isRun, isSwim, unitSystem = 'metric', selectedLap, onSelectLap, chartScrollRef, onScrollCenter, scaleOverride = null, records = null }) {
  const CHART_H   = 200;
  const Y_AXIS_W  = 38;
  const X_LABEL_H = 16;

  // X-axis zoom: enable horizontal scroll when a lap is selected so the
  // selected bar gets more breathing room. Threshold = 0 means zoom always
  // activates on selection. On deselect the chart snaps back to full-width.
  const ZOOM_THRESHOLD = 0;
  // Target: when zoomed, roughly TARGET_VISIBLE_LAPS show on screen at
  // once — wide enough to read the focused lap clearly, narrow enough to
  // give the neighbours context. Honza's feedback (2026-05): when a
  // 5×10min workout had one short 0:40 reset lap alongside a 24-minute
  // endurance block, the old "MIN_BAR_PX × longest/shortest" formula made
  // the container so wide that only ONE lap was visible after zoom. New
  // formula sizes the container so the AVERAGE lap takes 1/TARGET_VISIBLE
  // of the viewport, with capped weights so a single huge lap can't
  // monopolise the row.
  const TARGET_VISIBLE_LAPS = 16;
  // Bar widths are STRICTLY proportional to weight (distance for swim/run,
  // duration for bike). A 2-km lap renders 4× as wide as a 500-m lap, no
  // capping. Honza's feedback (2026-05): "vždy at je to poměrově prostě"
  // — capping made dominant endurance laps fit a bit better but it broke
  // the "scale read" of the chart for swim sets where everyone expects
  // each interval bar to be proportional to actual distance.
  //
  // When a single lap really is dominant (e.g. a 4-hour ride with one
  // 1-min sprint), it still gets scrolled into view via the zoom logic
  // below — just no longer compressed to a fake size.

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

  // ── Strict-proportional weights (2026-05) ─────────────────────────────────
  // No capping: bar widths are 1:1 proportional to weight (distance for
  // swim/run, duration for bike). `capWeight` is kept as an identity
  // function so scroll-to-lap math reads from the same helper and stays
  // self-consistent if we ever re-introduce capping in the future.
  const capWeight   = (w) => Math.max(w, 1);
  const totalWeight = entries.reduce((a, e) => a + capWeight(e.weight), 0) || 1;

  // ── Zoom-width calculation ────────────────────────────────────────────────
  // Old formula: container = (totalWeight / shortestLapWeight) × MIN_BAR_PX
  // → broke badly when shortestLapWeight was tiny (a rest or stop lap),
  //   producing a container 30-60× wider than the viewport so only one
  //   bar fit at a time after zoom.
  // New formula: viewport-driven. Sized so the average non-pause lap takes
  // 1 / TARGET_VISIBLE_LAPS of the visible width. Falls back to 360 px (a
  // typical phone width) when we don't have a measured container yet —
  // the auto-scroll useEffect below re-measures once mounted.
  const viewportEstimate = Math.max(chartScrollRef?.current?.clientWidth || 360, 280);
  // entries.length / TARGET_VISIBLE_LAPS = number of viewport-widths to
  // span the whole row. Multiply by viewport to get total container width.
  const zoomedTotalW = isZoomed
    ? Math.round(Math.max(1, entries.length / TARGET_VISIBLE_LAPS) * viewportEstimate)
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
    // Use the CAPPED weight here too — layout flex uses capWeight() per bar,
    // so a cumulative-sum of raw weights would land the scroll on the wrong
    // pixel for any row where capping kicked in. Both numerator and
    // denominator must come from the same scale.
    const cumW       = entries.slice(0, selectedLap).reduce((a, e) => a + capWeight(e.weight), 0);
    // Bars are offset right by the Y_AXIS_W spacer; the weighted area spans the
    // remaining width. Account for both so the selected lap centres accurately.
    const barsW      = Math.max(1, innerW - Y_AXIS_W);
    const barCenterX = Y_AXIS_W + (cumW + capWeight(entries[selectedLap].weight) / 2) / totalWeight * barsW;
    container.scrollTo({ left: Math.max(0, barCenterX - containerW / 2), behavior: 'smooth' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLap, isZoomed]);

  const nonZero = entries.filter(e => !e.isPause && e.value > 0).map(e => e.value);
  if (!nonZero.length) return null;

  const isInverted = isRun || isSwim; // lower pace value = faster = taller bar

  // ── Build the y-axis range ──
  // Fast (top) edge: work laps only — keeps the quickest intervals readable.
  // Slow (bottom) edge: all plausible laps incl. warmup/recovery/rest so an
  // easy jog at 8–10 min/km still fits; only drop GPS junk (short segments or
  // >20 min/km standing still).
  const isPaceEligible = (e) => {
    if (e.isPause || !e.value || e.value <= 0) return false;
    if (isRun || isSwim) {
      if ((e.dur || 0) < 30) return false;
      if ((e.dist || 0) < 100) return false;
      if (isRun && e.value > 1200) return false;  // > 20:00/km — GPS glitch only
      if (isSwim && e.value > 900) return false;
    }
    return true;
  };

  const scaleEntries = entries.filter((e, i) => {
    if (!isPaceEligible(e)) return false;
    const lapType = laps[i]?.intervalType;
    if (lapType && lapType !== 'work') return false;
    return true;
  }).map(e => e.value);

  const slowScaleEntries = entries.filter(isPaceEligible).map(e => e.value);

  // IQR-based outlier clamp: removes recovery/cooldown laps whose pace
  // would collapse the scale (e.g. 2:00/100m when all intervals are 1:14–1:46).
  let scaleValues = scaleEntries.length > 0 ? scaleEntries : slowScaleEntries;
  if (scaleValues.length >= 4) {
    const sorted = [...scaleValues].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    const filtered = scaleValues.filter(v => v >= lo && v <= hi);
    if (filtered.length >= 2) scaleValues = filtered;
  }

  let slowScaleValues = slowScaleEntries.length > 0 ? slowScaleEntries : scaleValues;
  if (slowScaleValues.length >= 4) {
    const sorted = [...slowScaleValues].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lo = q1 - 2 * iqr;
    const hi = q3 + 2 * iqr;
    const filtered = slowScaleValues.filter(v => v >= lo && v <= hi);
    if (filtered.length >= 2) slowScaleValues = filtered;
  }

  const maxVal   = Math.max(...scaleValues);
  const minVal   = Math.min(...scaleValues);
  // Y-axis range — centre the chart around the AVERAGE of the filtered
  // values so the "typical" bar sits at the middle line and the spread
  // above/below is visible at a glance. Range is symmetric around the
  // centre, sized from the actual max-deviation in the data plus a 40 %
  // padding factor (gives bars some headroom without leaving the top of
  // the chart visibly empty).
  //
  // Tuning history (2026-05):
  //   - Original: `spread = max(IQR × 1.5, centre × 6%)` — too generous,
  //     swim test ended up with chart range 1:11 ↔ 1:23 while real data
  //     only covered 1:14–1:20. Honza: "nahoře byl nesmysl".
  //   - First fix: anchored on filtered min/max + 15 % pad — too tight,
  //     lost the centred-on-average feel. Honza: "chci větší range".
  //   - Current: centre + max-deviation × 1.4 — keeps avg in the middle,
  //     bars use ~70 % of the chart height, with ~15 % padding above and
  //     below the actual data extremes for clean readability.
  // Session average (distance-weighted for run/swim, time-weighted for bike) —
  // drawn as a dashed reference line, like Strava's "Workout Analysis".
  const valuedEntries = entries.filter(e => !e.isPause && e.value > 0);
  const weightTot = valuedEntries.reduce((a, e) => a + (e.weight || 0), 0) || 1;
  const avgValue = valuedEntries.length
    ? valuedEntries.reduce((a, e) => a + e.value * (e.weight || 0), 0) / weightTot
    : scaleValues.reduce((a, b) => a + b, 0) / (scaleValues.length || 1);

  const avgForScale = scaleValues.length
    ? scaleValues.reduce((a, b) => a + b, 0) / scaleValues.length
    : avgValue;

  let chartMin, chartMax;
  if (scaleOverride) {
    chartMin = scaleOverride.min;
    chartMax = scaleOverride.max;
  } else {
    // Size the Y-axis from work laps (scaleValues), not every raw segment.
    // Outlier / pause laps still render — getBarH clamps them to the edge.
    // Work laps → top edge; all plausible laps (incl. rest) → bottom edge.
    const maxSlowCap = isSwim ? 600 : 720;

    if (isInverted) {
      const globalFast = Math.min(...scaleValues);
      const globalSlow = Math.max(...slowScaleValues);
      const fastPad = isSwim ? 3 : 8;
      const slowPad = isSwim ? 5 : 15;

      // Top edge: just a few seconds faster than the quickest work lap.
      chartMin = Math.max(isSwim ? 25 : 60, globalFast - fastPad);
      chartMin = Math.floor(chartMin / 5) * 5;

      // Bottom edge: follows the slowest real lap in this session (rest/jog OK).
      chartMax = Math.min(maxSlowCap, globalSlow + slowPad);
      chartMax = Math.ceil(chartMax / 5) * 5;
      chartMax = Math.max(chartMax, chartMin + 30);
    } else {
      const maxDev = Math.max(...scaleValues.map(v => Math.abs(v - avgForScale)), avgForScale * 0.03);
      const spread = maxDev * 1.1;
      chartMin = Math.max(0, avgForScale - spread);
      chartMax = avgForScale + spread;
    }
  }
  const range    = chartMax - chartMin || 1;

  // Y-position (px from top) of the dashed session-average reference line.
  const avgLineTop = isInverted
    ? ((avgValue - chartMin) / range) * CHART_H
    : ((chartMax - avgValue) / range) * CHART_H;
  const showAvgLine = !scaleOverride && avgValue > 0 && avgLineTop > 4 && avgLineTop < CHART_H - 4;

  const getBarH = (val) => {
    if (!val) return 3;
    const h = isInverted
      ? ((chartMax - val) / range) * CHART_H
      : ((val - chartMin) / range) * CHART_H;
    // Clamp both ends — outlier laps outside [minVal, maxVal] would otherwise
    // produce negative heights or overflow the chart.
    return Math.max(3, Math.min(CHART_H, h));
  };

  // Intensity 0..1: 1 = fastest / most power, 0 = slowest / least power.
  // CLAMP to [0,1] — minVal/maxVal come from the work laps only, so a slow
  // warm-up/recovery lap sits OUTSIDE that band and would otherwise produce a
  // negative intensity → negative alpha → an invalid colour → an invisible bar
  // (the lap looked "missing" until a re-render flipped it to the dimmed alpha).
  const getIntensity = (val) => {
    if (!val || maxVal === minVal) return 0.5;
    const raw = isInverted ? (maxVal - val) / (maxVal - minVal) : (val - minVal) / (maxVal - minVal);
    return Math.max(0, Math.min(1, raw));
  };

  const fmtTick = (v) => {
    if (isBike) return `${Math.round(v)}`;
    let sec = v;
    if (isRun && unitSystem === 'imperial') {
      sec = paceSecondsToDisplaySeconds(v, { sport: 'run', unitSystem: 'imperial' });
    } else if (isSwim && unitSystem === 'imperial') {
      sec = paceSecondsToDisplaySeconds(v, { sport: 'swim', unitSystem: 'imperial' });
    }
    const m = Math.floor(sec / 60), s = Math.round(sec % 60);
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  };
  const unitLabel = isSwim ? paceUnitShort(unitSystem, 'swim') : isRun ? paceUnitShort(unitSystem, 'run') : 'W';
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

  // The denominator for ALL x-positions must be the SAME total the bars use
  // (sum of lap weights = total distance for run/swim, total duration for bike).
  // Using the raw max of the record axis instead would stretch/shift the
  // elevation relative to the bars whenever record time ≠ Σ lap durations.
  const totalElevW = entries.reduce((s, e) => s + (e.weight || 0), 0) || 1;

  let elevPathD = null;

  // ── Preferred: detailed elevation from raw records, mapped through the SAME
  //    cumulative-weight x-axis as the bars so the terrain sits under the right
  //    laps (and shows real within-lap shape, not just straight lines).
  if (Array.isArray(records) && records.length > 0) {
    const altRecs = records.filter(r => r.altitude != null);
    if (altRecs.length >= 4) {
      const altValues = altRecs.map(r => r.altitude);
      const altMin = Math.min(...altValues);
      const altMax = Math.max(...altValues);
      if (altMax - altMin >= 1) {
        // Inflate the range by 35% so the highest peak sits ~74% up the chart
        // instead of touching the top edge — gives the terrain visible headroom.
        const altRange = (altMax - altMin) * 1.35;
        // Bars are laid out by DISTANCE for run/swim, by TIME for bike — match it.
        // Records carry `timeFromStart` (older shape) OR an ISO `timestamp`; the
        // current record builder only sets `timestamp`, so derive seconds from
        // start when timeFromStart is absent. Without this the bike branch fell
        // through to distance while the denominator stayed time-based, piling the
        // whole elevation onto the far-right edge.
        const t0ms = altRecs[0].timestamp != null ? new Date(altRecs[0].timestamp).getTime() : NaN;
        const getTimeSec = altRecs[0].timeFromStart != null
          ? (r) => r.timeFromStart
          : (!isNaN(t0ms) ? (r) => (new Date(r.timestamp).getTime() - t0ms) / 1000 : null);
        const hasTime = getTimeSec != null;
        const hasDist = altRecs.some(r => r.distance != null);
        const preferDist = (isRun || isSwim) && hasDist;
        const getX = preferDist
          ? (r) => r.distance
          : hasTime
            ? getTimeSec
            : hasDist
              ? (r) => r.distance
              : (_, i) => i;
        const step = Math.max(1, Math.floor(altRecs.length / 300));
        const sampled = altRecs.filter((_, i) => i % step === 0 || i === altRecs.length - 1);
        const clamp = (v) => Math.max(0, Math.min(100, v));
        // Normalise x by the records' OWN extent so the terrain ALWAYS spans the
        // full chart width — never cropped to the right. Using the bars' total
        // weight as the denominator looked right only when the record span ==
        // Σ lap weights; with synthesised/moving-time records (common on mobile)
        // the last point landed well short of 100% and the elevation appeared
        // chopped off. The record stream is uniform over the activity, so the
        // bars' total and the record extent line up to the same shape anyway.
        const rawXs = sampled.map((r, si) => getX(r, si * step));
        const xMin = Math.min(...rawXs, 0);
        const xMax = Math.max(...rawXs);
        const xSpan = (xMax - xMin) || 1;
        const pts = sampled.map((r, si) => {
          const xv = rawXs[si];
          const x = clamp(((xv - xMin) / xSpan) * 100).toFixed(1);
          const y = ((1 - (r.altitude - altMin) / altRange) * (CHART_H - 8) + 4).toFixed(1);
          return `${x},${y}`;
        });
        const firstX = pts[0].split(',')[0];
        const lastX = pts[pts.length - 1].split(',')[0];
        elevPathD = `M ${pts[0]} ${pts.slice(1).map(p => `L ${p}`).join(' ')} L ${lastX},${CHART_H} L ${firstX},${CHART_H} Z`;
      }
    }
  }

  // ── Fallback: coarse lap-level elevation (one point per lap) when records
  //    aren't available. Already aligned (uses the same cumulative weight).
  if (!elevPathD && hasElevation) {
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
      let cumW = 0;
      const pts = alts.map((alt, i) => {
        const x = (cumW / totalElevW * 100).toFixed(1);
        if (i < entries.length) cumW += entries[i].weight;
        const y = ((1 - (alt - altMin) / altRange) * (CHART_H - 8) + 4).toFixed(1);
        return `${x},${y}`;
      });
      const lastX = (cumW / totalElevW * 100).toFixed(1);
      elevPathD = `M ${pts[0]} ${pts.slice(1).map(p => `L ${p}`).join(' ')} L ${lastX},${CHART_H} L 0,${CHART_H} Z`;
    }
  }

  // Selected header data
  const sel       = selectedLap != null ? laps[selectedLap] : null;
  const selEnt    = selectedLap != null ? entries[selectedLap] : null;
  const selPace   = selEnt?.value ? `${fmtTick(selEnt.value)} ${unitLabel}` : null;
  const selLapNum = sel ? (sel.lapNumber ?? (selectedLap + 1)) : null;
  const selDistStr = selEnt && selEnt.dist > 0
    ? formatDistance(selEnt.dist, unitSystem).formatted
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
              {isSwim ? `Laps · pace ${paceUnitShort(unitSystem, 'swim')}` : isRun ? `Laps · pace ${paceUnitShort(unitSystem, 'run')}` : isBike ? 'Laps · power' : 'Laps'}
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

      <div className="relative">
        {/* Bars — full width; scroll horizontally when zoomed. The Y-axis
            labels float on top (rendered after this block) so the bars stay
            full-width and slide BEHIND the labels as you scroll — like Strava. */}
        <div
          ref={chartScrollRef}
          className="w-full"
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
            {/* Dashed session-average reference line (Strava-style) */}
            {showAvgLine && (
              <div style={{
                position: 'absolute', left: 0, right: 0,
                top: avgLineTop, height: 0,
                borderTop: `1.5px dashed ${color}99`,
                zIndex: 3, pointerEvents: 'none',
              }} />
            )}
            {/* Elevation background — emerald green fill behind bars */}
            {elevPathD && (
              <svg
                viewBox={`0 0 100 ${CHART_H}`}
                preserveAspectRatio="none"
                /* Offset by the Y-axis spacer so the elevation lines up with the
                   bars (which start after that spacer), not 38px to the left. */
                style={{ position: 'absolute', top: 0, left: Y_AXIS_W, width: `calc(100% - ${Y_AXIS_W}px)`, height: CHART_H, pointerEvents: 'none', zIndex: 1, opacity: 0.55 }}
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
            {/* Left spacer = Y-axis label width, so the first lap clears the
                floating axis labels and can be scrolled fully into view when
                zoomed (otherwise lap 1 hides behind the labels). */}
            <div style={{ flex: `0 0 ${Y_AXIS_W}px`, height: 1 }} />
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

              // Use the CAPPED weight for layout so one giant lap can't push
              // the rest of the row into a 2-pixel hairline. Raw `ent.weight`
              // is still preserved for tooltips, scroll-to-lap math (above)
              // and any downstream consumers that care about actual time/dist.
              const layoutWeight = capWeight(ent.weight);
              // STRICTLY proportional: flex-basis 0 + flex-grow = weight means
              // bar width is purely proportional to distance (a 200 m lap is 4×
              // a 50 m lap). A small minWidth keeps zero-distance / pause laps
              // from vanishing — those carry no distance so they'd otherwise be
              // sub-pixel.
              const itemStyle = { flex: `${layoutWeight} 0 0px`, minWidth: ent.isPause ? 4 : 2, height: CHART_H + X_LABEL_H, transition: 'flex-basis 0.25s ease' };

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
                      // Softly rounded top — moderate, not full-pill.
                      borderRadius: '5px 5px 0 0',
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
        </div>{/* end scroll container */}
        {/* Y-axis labels — float above the scrolling bars (Strava-style). A
            soft white gradient keeps them legible over the bars underneath. */}
        <div
          className="absolute left-0 top-0 pointer-events-none"
          style={{
            width: Y_AXIS_W, height: CHART_H + X_LABEL_H, zIndex: 5,
            background: 'linear-gradient(to right, rgba(255,255,255,0.9) 55%, rgba(255,255,255,0))',
          }}
        >
          {yTicks.map((v, i) => (
            <span key={i} className="absolute left-0 text-[9px] text-gray-400 leading-none select-none"
              style={{ top: `${(i / 4) * CHART_H}px`, transform: 'translateY(-50%)' }}>
              {fmtTick(v)}
            </span>
          ))}
          <span className="absolute left-0 text-[9px] text-gray-400 leading-none select-none" style={{ top: CHART_H + 2 }}>{unitLabel}</span>
        </div>
      </div>{/* end relative wrapper */}
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

// Stable row shell for Planned | Completed grid — must live at module scope so
// React doesn't remount inputs on every parent re-render (mobile keyboard drop).
function PlannedVsCompletedRow({ label, labelCol, plannedInput, children, accent, compact = false }) {
  return (
    <div
      className={`grid items-center ${compact ? 'gap-1 py-0.5' : 'gap-2 py-1.5'}`}
      style={{ gridTemplateColumns: `${labelCol} 1fr 1fr` }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide leading-tight" style={{ color: accent || '#6b7280' }}>{label}</div>
      <div>{plannedInput || <div className="text-sm text-gray-300 text-right pr-1">—</div>}</div>
      <div>{children}</div>
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
        className="inline-flex items-center gap-1 px-2 md:px-2.5 py-1 md:py-1.5 rounded-lg md:rounded-xl text-sm font-semibold border transition-all bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
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

function CompareLapTable({ laps, isBike, isRun, isSwim, workOnly, unitSystem = 'metric' }) {
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
    return formatDistance(d, unitSystem).formatted;
  };
  const fmtPace = lap => {
    const elapsed = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
    const moving  = Number(lap.moving_time || lap.movingTime || lap.totalMovingTime || 0) || elapsed;
    const dist = Number(lap.distance || lap.totalDistance || 0);
    const pow  = Number(lap.average_watts || lap.avgPower || 0);
    if (isBike) return pow > 0 ? `${Math.round(pow)} W` : '—';
    if (isRun && dist > 0 && moving > 0) return formatPaceFromDistanceAndDuration(dist, moving, unitSystem, 'run');
    if (isSwim && dist > 0 && moving > 0) return formatPaceFromDistanceAndDuration(dist, moving, unitSystem, 'swim');
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

function WorkLapCompareTable({ currentLaps, results, isBike, isRun, isSwim, unitSystem = 'metric' }) {
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
    return formatDistance(d, unitSystem).formatted;
  };
  const fmtPace = (lap) => {
    const moving  = Number(lap.moving_time || lap.movingTime || lap.totalMovingTime || 0);
    const elapsed = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
    const dur  = moving || elapsed;
    const dist = Number(lap.distance || lap.totalDistance || 0);
    const pow  = Number(lap.average_watts || lap.avgPower || 0);
    if (isBike) return pow > 0 ? `${Math.round(pow)} W` : null;
    if (isRun && dist > 0 && dur > 0) return formatPaceFromDistanceAndDuration(dist, dur, unitSystem, 'run');
    if (isSwim && dist > 0 && dur > 0) return formatPaceFromDistanceAndDuration(dist, dur, unitSystem, 'swim');
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
  const { user: authUser } = useAuth() || {};
  const unitSystem = userUnitSystem(authUser);
  const hasTitle    = !!(merged?.titleManual || (merged?.title && String(merged.title).trim()));
  const hasCategory = !!(merged?.category);
  const hasLactate  = Number(merged?.lactate) > 0;
  const sport       = String(merged?.sport || '');
  const isBike = /bike|cycling|ride/i.test(sport);
  const isRun  = /run/i.test(sport);
  const isSwim = /swim/i.test(sport);
  const normSport = isBike ? 'bike' : isRun ? 'run' : isSwim ? 'swim' : 'bike';

  const currentTitleStr = String(merged?.titleManual || merged?.title || merged?.name || '').trim();
  const hasDistinctTitle = distinctiveTitleTokens(currentTitleStr).length > 0;
  const hasLapsForCompare = Array.isArray(merged?.laps) && merged.laps.length > 0;

  const [activeFilters, setActiveFilters] = useState(() => {
    const init = [];
    if (hasTitle && hasDistinctTitle) init.push('title');
    if (hasCategory) init.push('category');
    if (hasLactate) init.push('lactate');
    if (hasLapsForCompare || isGenericTitle(currentTitleStr)) init.push('structure');
    return init.length ? init : ['structure'];
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

  // Title token-overlap helper: extracts meaningful words (≥3 chars, lowercased).
  const currentTitle    = currentTitleStr;
  const currentCategory = merged?.category || null;
  const currentTokens   = useMemo(() => titleTokens(currentTitle), [currentTitle]);
  const currentDistM    = Number(merged?.distance || merged?.totalDistance || 0);

  const similarityScore = useCallback((r) => {
    let score = 0;

    // ── Title match — strongest signal that this is the same workout.
    //    Exact match weighted highest, substring next, then token overlap.
    const rTitle = String(r.titleManual || r.title || r.name || '').trim();
    if (currentTitle && rTitle) {
      const a = currentTitle.toLowerCase();
      const b = rTitle.toLowerCase();
      if (a === b) {
        score += 0.40;                                       // exact
      } else if (a.includes(b) || b.includes(a)) {
        score += 0.25;                                       // substring
      } else if (currentTokens.size > 0) {
        const rTok = titleTokens(rTitle);
        let common = 0;
        currentTokens.forEach(t => { if (rTok.has(t)) common += 1; });
        const overlap = common / currentTokens.size;         // 0..1
        if (overlap >= 0.5) score += 0.15 * overlap;         // ≥50% tokens shared
      }
    }

    // ── Category match — second-strongest signal (e.g. both LT2 sessions).
    if (currentCategory && r.category && currentCategory === r.category) {
      score += 0.20;
    }

    // ── Duration similarity.
    const dur = Number(r.duration || r.elapsed_time || r.totalElapsedTime || 0);
    if (currentDurSec > 0 && dur > 0) {
      const durScore = Math.max(0, 1 - Math.abs(currentDurSec - dur) / Math.max(currentDurSec, dur));
      score += durScore * 0.18;
    }

    // ── Distance similarity (endurance rides/runs with similar length).
    const rDist = Number(r.distance || 0);
    if (currentDistM > 0 && rDist > 0) {
      const distScore = Math.max(0, 1 - Math.abs(currentDistM - rDist) / Math.max(currentDistM, rDist));
      score += distScore * 0.15;
    }

    // ── Work-lap-count similarity.
    const laps = Array.isArray(r.laps) ? r.laps : [];
    const wlCount = laps.filter((l, i) => detectLapType(l, i, laps.length) === 'work').length;
    if (currentWorkLapCount > 0 && wlCount > 0) {
      const lapScore = Math.max(0, 1 - Math.abs(currentWorkLapCount - wlCount) / Math.max(currentWorkLapCount, wlCount));
      score += lapScore * 0.15;
    }

    // ── Typical work-lap duration similarity (new). Two "5×10min" workouts
    //    score higher than a "5×10min" + "10×5min" combo even though both
    //    have 5 (or 10) work laps — captures the workout STRUCTURE.
    if (currentWorkLapCount > 0 && wlCount > 0 && currentLaps.length > 0 && laps.length > 0) {
      const avgDur = (arr) => {
        const works = arr.filter((l, i) => detectLapType(l, i, arr.length) === 'work');
        if (works.length === 0) return 0;
        const sum = works.reduce((a, l) => a + Number(l.elapsed_time || l.totalElapsedTime || l.duration || 0), 0);
        return sum / works.length;
      };
      const myAvg = avgDur(currentLaps);
      const rAvg  = avgDur(laps);
      if (myAvg > 0 && rAvg > 0) {
        const avgScore = Math.max(0, 1 - Math.abs(myAvg - rAvg) / Math.max(myAvg, rAvg));
        score += avgScore * 0.10;
      }
    }

    return score;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDurSec, currentWorkLapCount, currentTitle, currentCategory, currentTokens, currentLaps, currentDistM]);

  const matchLabel = (score) => {
    if (score >= 0.65) return 'Strong match';
    if (score >= 0.40) return 'Good match';
    if (score >= 0.22) return 'Similar';
    return 'Weak match';
  };

  useEffect(() => {
    if (activeFilters.length === 0) { setResults([]); return; }
    let cancelled = false;
    setLoading(true); setError(null);
    const params = { athleteId, sport: normSport || undefined, limit: 50 };
    const rawId = merged?.id || merged?._id || merged?.stravaId;
    if (rawId) params.excludeId = String(rawId);

    if (activeFilters.includes('title')) {
      const tokens = distinctiveTitleTokens(currentTitle);
      if (tokens.length > 0) {
        params.titleKeywords = tokens.join(',');
        params.title = tokens.join(' ');
      } else if (currentTitle) {
        params.title = currentTitle;
      }
    }
    if (activeFilters.includes('category') && merged?.category) params.category = merged.category;
    if (activeFilters.includes('lactate') && Number(merged?.lactate) > 0) params.lactate = Number(merged.lactate);
    if (activeFilters.includes('structure')) {
      params.structure = true;
      if (currentDurSec > 0) params.duration = currentDurSec;
      if (currentDistM > 0) params.distance = currentDistM;
      if (currentLaps.length > 0) params.lapCount = currentLaps.length;
    }

    getSimilarActivities(params)
      .then(d => {
        if (cancelled) return;
        const minScore = activeFilters.includes('structure') && !activeFilters.includes('title') ? 0.18 : 0.12;
        const sorted = [...d]
          .map((r) => ({ ...r, _matchScore: similarityScore(r) }))
          .filter((r) => r._matchScore >= minScore)
          .sort((a, b) => {
            const sd = b._matchScore - a._matchScore;
            if (Math.abs(sd) > 0.02) return sd;
            return new Date(b.date) - new Date(a.date);
          });
        setResults(sorted);
        setLoading(false);
      })
      .catch(e => { if (!cancelled) { setError(e?.message || 'Failed'); setLoading(false); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilters, merged?.id, merged?._id, currentDurSec, currentDistM, currentLaps.length]);

  const toggleFilter = id => setActiveFilters(p => p.includes(id) ? p.filter(f => f !== id) : [...p, id]);
  const toggleCard   = id => setExpandedCards(p => ({ ...p, [id]: !p[id] }));

  const fmtSec = s => {
    if (!s || s <= 0) return '—';
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.round(s%60);
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
  };
  const fmtDist = m => (!m || m <= 0) ? '—' : formatDistance(m, unitSystem).formatted;
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
        durationType: distM > 0 && (actIsRun || actIsSwim) ? 'distance' : 'time',
        durationSeconds: durSec,
        distanceMeters: distM || undefined,
        distance: distM ? (distM >= 1000
          ? `${(distM / 1000).toFixed(distM % 1000 === 0 ? 0 : 1)}km`
          : `${Math.round(distM)}m`) : undefined,
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
        {(hasTitle && hasDistinctTitle) && (
          <button onClick={() => toggleFilter('title')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${activeFilters.includes('title') ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
            Same name
          </button>
        )}
        {hasLapsForCompare && (
          <button onClick={() => toggleFilter('structure')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${activeFilters.includes('structure') ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-500 border-gray-200'}`}>
            Similar structure
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
          unitSystem={unitSystem}
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
        <div className="text-xs text-gray-400 py-4 text-center space-y-1">
          <div>No similar sessions found.</div>
          {activeFilters.includes('title') && !activeFilters.includes('structure') && (
            <div className="text-[10px]">Try enabling <span className="font-semibold text-emerald-600">Similar structure</span> for rides with generic titles.</div>
          )}
        </div>
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
          <LapChart laps={currentLaps} color={sportColor} isBike={isBike} isRun={isRun} isSwim={isSwim} unitSystem={unitSystem}
            selectedLap={null} onSelectLap={() => {}} scaleOverride={sharedScale} />
          {expandedCards['__current'] && (
            <div className="px-3 pb-3 border-t border-gray-50 pt-2">
              <CompareLapTable laps={currentLaps} isBike={isBike} isRun={isRun} isSwim={isSwim} workOnly={workOnly} unitSystem={unitSystem} />
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
        const matchScore = act._matchScore ?? similarityScore(act);

        return (
          <div key={act.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            {/* Card header */}
            <div className="px-3 pt-2.5 pb-1 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-gray-400 tabular-nums">{fmtDate(act.date)}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${matchScore >= 0.4 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {Math.round(matchScore * 100)}% · {matchLabel(matchScore)}
                  </span>
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
              <LapChart laps={compLaps} color={actColor} isBike={actIsBike} isRun={actIsRun} isSwim={actIsSwim} unitSystem={unitSystem}
                selectedLap={null} onSelectLap={() => {}} scaleOverride={sharedScale} />
            )}
            {compLaps.length === 0 && (
              <div className="px-3 pb-3 text-[10px] text-gray-400 italic">No laps available</div>
            )}
            {/* Expandable lap detail table */}
            {isExpanded && compLaps.length > 0 && (
              <div className="px-3 pb-3 border-t border-gray-50 pt-2">
                <CompareLapTable laps={compLaps} isBike={actIsBike} isRun={actIsRun} isSwim={actIsSwim} workOnly={workOnly} unitSystem={unitSystem} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Min / avg / max from per-second records. AVG prefers the activity summary
 *  (Strava/FIT header) so it matches the Completed table above. */
function mamFromRecords(recs, key, mult = 1, summaryAvg = null) {
  const vals = recs.map(r => r[key]).filter(v => v != null && v > 0).map(v => v * mult);
  if (vals.length < 3) return null;
  const streamAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    min: Math.min(...vals),
    avg: summaryAvg != null && summaryAvg > 0 ? summaryAvg : streamAvg,
    max: Math.max(...vals),
  };
}

function mamPaceFromRecords(recs, { isSwim, avgSpeed }) {
  const speedVals = recs.map(r => r.speed).filter(v => v != null && v > 0);
  if (speedVals.length < 3) return null;
  const toPace = (s) => (isSwim ? 100 / s : 1000 / s);
  const paces = speedVals.map(toPace);
  const summaryPace = avgSpeed > 0 ? toPace(avgSpeed) : null;
  const streamAvg = paces.reduce((a, b) => a + b, 0) / paces.length;
  return {
    min: Math.min(...paces),
    avg: summaryPace != null && summaryPace > 0 ? summaryPace : streamAvg,
    max: Math.max(...paces),
  };
}

function buildWorkoutMamRows({ recs, isBike, isRun, isSwim, sport, power, hr, cadence, avgSpeed, includeElevation = false, unitSystem = 'metric' }) {
  const rows = [];
  if (isBike) {
    const speedMult = unitSystem === 'imperial' ? 3.6 * 0.621371 : 3.6;
    const summarySpeed = avgSpeed > 0 ? avgSpeed * speedMult : null;
    const d = mamFromRecords(recs, 'speed', speedMult, summarySpeed);
    if (d) rows.push({ label: 'Speed', unit: unitSystem === 'imperial' ? 'mph' : 'km/h', d, dec: 1 });
  } else if (isRun || isSwim) {
    const d = mamPaceFromRecords(recs, { isSwim, avgSpeed });
    if (d) {
      const paceSport = isSwim ? 'swim' : 'run';
      rows.push({
        label: 'Pace',
        unit: paceUnitShort(unitSystem, paceSport),
        d,
        dec: 0,
        format: (totalSec) => {
          const displaySec = paceSecondsToDisplaySeconds(totalSec, {
            sport: paceSport,
            unitSystem,
            testRunPerMileStorage: false,
          });
          return formatPaceMMSS(displaySec) || '—';
        },
      });
    }
  }
  const hrD = mamFromRecords(recs, 'heartRate', 1, hr > 0 ? hr : null);
  if (hrD) rows.push({ label: 'Heart Rate', unit: 'bpm', d: hrD, dec: 0 });
  if (isBike) {
    const d = mamFromRecords(recs, 'power', 1, power > 0 ? power : null);
    if (d) rows.push({ label: 'Power', unit: 'W', d, dec: 0 });
  }
  const cadD = mamFromRecords(recs, 'cadence', 1, cadence > 0 ? cadence : null);
  if (cadD) rows.push({ label: 'Cadence', unit: isSwim ? 'spm' : cadenceDisplayUnit(sport), d: cadD, dec: 0 });
  if (includeElevation) {
    const d = mamFromRecords(recs, 'altitude', 1, null);
    if (d) rows.push({ label: 'Elevation', unit: 'm', d, dec: 0 });
  }
  return rows;
}

function formatMamValue(row, value) {
  if (row.format) return row.format(value);
  return value.toFixed(row.dec);
}

function plannedCommentText(pw) {
  return pw ? String(pw.comment || '').trim() : '';
}

function plannedDescriptionOnly(pw) {
  if (!pw) return '';
  return String(pw.description || pw.coachNotes || pw.notes || '').trim();
}

function resolveCommentsTarget(activity, plannedWorkout) {
  if (plannedWorkout?._id) {
    return { trainingId: String(plannedWorkout._id), trainingType: 'planned' };
  }
  const id = String(activity?.id || activity?._id || '');
  const isStrava = id.startsWith('strava-') || activity?.source === 'strava' || activity?.type === 'strava' || !!activity?.stravaId;
  const isFit = id.startsWith('fit-') || activity?.source === 'fit' || activity?.type === 'fit';
  if (isStrava) {
    const raw = String(activity?.stravaId || id.replace(/^strava-/, ''));
    return { trainingId: raw, trainingType: 'strava' };
  }
  if (isFit) {
    return { trainingId: String(activity?._id || id.replace(/^fit-/, '')), trainingType: 'fitTraining' };
  }
  return { trainingId: id, trainingType: 'training' };
}

export function ActivityFullModal({ activity, plannedWorkout: initialPlannedWorkout, onClose, onEditPlanned, onAddLactate, onPlannedSaved, onCompletedSaved = null, onOpenFull = null, athleteId = null, onDeleted = null, highlightMetric: highlightMetricProp = null, radarWatts: radarWattsProp = null, profile: profileProp = null }) {
  const a = activity;

  // Read highlightMetric + radarWatts from props (passed by SpiderChart navigation) or URL params
  const _urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const highlightMetric = highlightMetricProp || _urlParams.get('highlightMetric') || null;
  const radarWatts = radarWattsProp != null ? radarWattsProp : (Number(_urlParams.get('radarWatts')) || null);

  // Full detail loaded async (for laps)
  const [detail, setDetail] = useState(null);
  // Two-tap delete confirm — first tap turns the icon red and changes the
  // label to "Confirm?", second tap actually runs the delete. Reverts
  // after 4 s if the user moves on.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Deletable imported activities: Strava and Garmin (both keep the source
  // account untouched — we only remove LaChart's local copy).
  const deletableActivity = (() => {
    const raw = String(a?.id || a?._id || '');
    if (raw.startsWith('strava-')) return { type: 'strava', id: raw.replace('strava-', '') };
    if (raw.startsWith('garmin-')) return { type: 'garmin', id: raw.replace('garmin-', '') };
    return null;
  })();
  const stravaIdForDelete = deletableActivity ? deletableActivity.id : null;
  const handleDeleteTap = async () => {
    if (deleting || !deletableActivity) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setDeleting(true);
    try {
      if (deletableActivity.type === 'garmin') {
        const { deleteGarminActivity } = await import('../../services/api.js');
        await deleteGarminActivity(deletableActivity.id, athleteId);
      } else {
        const { deleteStravaActivity } = await import('../../services/api.js');
        await deleteStravaActivity(deletableActivity.id, athleteId);
      }
      if (onDeleted) onDeleted({ type: deletableActivity.type, id: deletableActivity.id });
      onClose();
    } catch (e) {
      console.error('Activity delete failed:', e);
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
  const isBike = sport.includes('ride') || sport.includes('cycl') || sport.includes('bike') || sport === 'cycling';
  const { user: authUser } = useAuth() || {};
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
          data = {
            ...raw.detail,
            laps: raw.laps || [],
            description: raw.description,
            titleManual: raw.titleManual,
            category: raw.category,
            movingTime: raw.movingTime ?? raw.detail?.moving_time ?? raw.detail?.movingTime,
            moving_time: raw.movingTime ?? raw.detail?.moving_time ?? raw.detail?.movingTime,
            distance: raw.distance ?? raw.detail?.distance,
            manualTss: raw.manualTss ?? raw.detail?.manualTss,
            tssDisplayMode: raw.tssDisplayMode ?? raw.detail?.tssDisplayMode,
            tss: raw.manualTss ?? raw.tss ?? raw.detail?.manualTss,
            metricsManualized: raw.metricsManualized ?? false,
            calories: raw.calories ?? raw.detail?.calories ?? null,
            kilojoules: raw.detail?.kilojoules ?? null,
            rpe: raw.rpe ?? null,
            lactate: raw.lactate ?? null,
            savedAutoLaps: raw.savedAutoLaps || [],
          };
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
        } else if (id.startsWith('garmin-')) {
          const { getGarminActivityDetail } = await import('../../services/api.js');
          const raw = await getGarminActivityDetail(id.replace('garmin-', ''), athleteId || null);
          data = {
            ...raw.detail,
            laps: raw.laps || [],
            description: raw.description,
            titleManual: raw.titleManual,
            category: raw.category,
            movingTime: raw.movingTime ?? raw.detail?.moving_time ?? raw.detail?.movingTime,
            moving_time: raw.movingTime ?? raw.detail?.moving_time ?? raw.detail?.movingTime,
            distance: raw.distance ?? raw.detail?.distance,
            manualTss: raw.manualTss ?? raw.detail?.manualTss,
            tssDisplayMode: raw.tssDisplayMode ?? raw.detail?.tssDisplayMode,
            tss: raw.manualTss ?? raw.tss ?? raw.detail?.manualTss,
            lactate: raw.lactate ?? null,
          };
          if (!cancelled && raw.streams && Object.keys(raw.streams).length > 0) {
            setStreams(raw.streams);
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

  // Merge summary + detail. When the user has manually overridden duration /
  // distance / TSS, prefer the detail snapshot (just saved to DB) over the
  // calendar list row — otherwise a stale list entry wins until the parent
  // re-renders and the modal keeps showing Strava's original values.
  const merged = useMemo(() => {
    if (!detail) return a;
    const pickNum = (...vals) => {
      for (const v of vals) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) return n;
      }
      return undefined;
    };
    const pickFrom = (sources, keys) => {
      for (const src of sources) {
        if (!src) continue;
        for (const key of keys) {
          const n = Number(src[key]);
          if (Number.isFinite(n) && n >= 0) return n;
        }
      }
      return undefined;
    };
    const metricsManualized = Boolean(a?.metricsManualized || detail?.metricsManualized);
    const metricSources = metricsManualized ? [detail, a] : [a, detail];
    const timeKeys = [
      'movingTime', 'moving_time', 'totalTimerTime', 'duration',
      'elapsed_time', 'totalElapsedTime', 'elapsedTime', 'totalTime',
    ];
    const moving = pickFrom(metricSources, timeKeys);
    const distVal = pickFrom(metricSources, ['distance', 'totalDistance']);
    const userManualTss = metricsManualized
      ? pickNum(detail.manualTss, a.manualTss)
      : pickNum(a.manualTss, detail.manualTss);
    const fileTss = pickNum(
      a.trainingStressScore, a.trainingLoad, a.tss,
      detail.trainingStressScore, detail.tss,
    );
    const displayTss = userManualTss ?? fileTss;
    const caloriesVal = resolveActivityCaloriesKcal({ ...detail, ...a });
    return {
      ...detail,
      ...a,
      id: getActivityAppId(a),
      stravaId: a.stravaId ?? detail.stravaId,
      garminId: a.garminId ?? detail.garminId,
      source: a.source || detail.source,
      type: a.type || detail.type,
      titleManual: detail.titleManual ?? a.titleManual,
      title: detail.titleManual ?? a.title ?? detail.title ?? detail.name,
      category: detail.category ?? a.category,
      description: detail.description ?? a.description ?? a.notes,
      movingTime: moving,
      moving_time: moving,
      duration: moving,
      elapsed_time: moving,
      totalElapsedTime: moving,
      totalTime: moving,
      distance: distVal,
      totalDistance: distVal,
      manualTss: userManualTss,
      tss: displayTss,
      tssDisplayMode: detail.tssDisplayMode ?? a.tssDisplayMode ?? null,
      trainingStressScore: fileTss ?? userManualTss,
      metricsManualized,
      ...(caloriesVal > 0 ? { calories: caloriesVal, totalCalories: caloriesVal } : {}),
    };
  }, [a, detail]);

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
    const fromStrava = String(merged?.id || merged?._id || a?.id || a?._id || '').startsWith('strava-');
    const normCad = (v) => {
      const n = Number(v);
      if (!(n > 0)) return null;
      return fromStrava ? (stravaHalfCadenceToSpm(n, sport) ?? n) : n;
    };

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
    const startMs   = safeDate(startDate).getTime();

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

        // Same lap-step fallback for cadence when the cadence stream is missing.
        let lapCadBySecond = null;
        const hasLapCad = rawLapsForHr.some(l => Number(l.average_cadence || l.avgCadence || 0) > 0);
        const noStreamCad = cadence.length === 0 || cadence.every(v => !(v > 0));
        if (noStreamCad && hasLapCad) {
          lapCadBySecond = new Float32Array(time.length);
          let lapOffset = 0;
          rawLapsForHr.forEach(lap => {
            const dur = Number(lap.elapsed_time || lap.totalElapsedTime || lap.duration || 0);
            const cad = normCad(Number(lap.average_cadence || lap.avgCadence || 0));
            if (dur > 0 && cad > 0) {
              const lapStart = lapOffset;
              const lapEnd = lapOffset + dur;
              for (let k = 0; k < time.length; k++) {
                if (time[k] >= lapStart && time[k] < lapEnd) lapCadBySecond[k] = cad;
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
      cadence:   cadence[i] > 0 ? normCad(cadence[i])
                : (lapCadBySecond && lapCadBySecond[i] > 0 ? lapCadBySecond[i] : null),
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
    const actStartMs = safeDate(activityStart).getTime();
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
      const cad       = normCad(Number(lap.average_cadence || lap.avgCadence || 0));
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
  }, [merged, streams, sport, a]);

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
  // Smart-detect laps the user has persisted (so the activity reopens with them).
  const [persistedAutoLaps, setPersistedAutoLaps] = useState([]);
  const [savingLapsSet, setSavingLapsSet] = useState(false);
  const didInitAutoLaps = useRef(false);

  // One-shot: when the detail loads, adopt any saved Smart-detect laps so the
  // Laps tab opens showing them. Fresh mount per activity → runs once.
  useEffect(() => {
    if (didInitAutoLaps.current || !detail) return;
    didInitAutoLaps.current = true;
    const saved = Array.isArray(detail.savedAutoLaps) ? detail.savedAutoLaps : [];
    setPersistedAutoLaps(saved);
    if (saved.length >= 2) setAutoLaps(saved);
  }, [detail]);

  // Compact signature so we can tell "current laps differ from what's saved".
  const lapsSig = useCallback((laps) => (Array.isArray(laps) && laps.length
    ? laps.map(l => `${Math.round(l.elapsed_time || 0)}:${Math.round(l.distance || 0)}`).join('|')
    : ''), []);
  const autoLapsUnsaved = !!autoLaps && autoLaps.length >= 2 && lapsSig(autoLaps) !== lapsSig(persistedAutoLaps);

  // Persist / clear the current Smart-detect laps on the right source model.
  const saveAutoLapsSet = useCallback(async (laps) => {
    const id = String(merged?.id || merged?._id || '');
    const payloadLaps = Array.isArray(laps) ? laps.map(l => ({
      lapNumber: l.lapNumber, elapsed_time: l.elapsed_time, moving_time: l.moving_time,
      distance: l.distance, average_watts: l.average_watts,
      average_heartrate: l.average_heartrate, average_speed: l.average_speed,
    })) : [];
    const isStrava = id.startsWith('strava-') || merged?.source === 'strava' || merged?.type === 'strava' || !!merged?.stravaId;
    const isFit = id.startsWith('fit-') || merged?.source === 'fit' || merged?.type === 'fit';
    const isGarmin = id.startsWith('garmin-') || merged?.source === 'garmin' || merged?.type === 'garmin';
    if (isGarmin) throw new Error('Saving laps is not supported for Garmin activities yet.');
    setSavingLapsSet(true);
    try {
      if (isStrava) {
        const { updateStravaActivity } = await import('../../services/api.js');
        const stravaId = String(merged?.stravaId || id.replace(/^strava-/, ''));
        await updateStravaActivity(stravaId, { savedAutoLaps: payloadLaps }, athleteId || null);
      } else if (isFit) {
        const { updateFitTraining } = await import('../../services/api.js');
        await updateFitTraining(String(merged?._id || id.replace(/^fit-/, '')), { savedAutoLaps: payloadLaps });
      } else {
        const { updateTraining } = await import('../../services/api.js');
        await updateTraining(String(merged?._id || id.replace(/^regular-/, '')), { savedAutoLaps: payloadLaps });
      }
      setPersistedAutoLaps(payloadLaps);
    } finally {
      setSavingLapsSet(false);
    }
  }, [merged, athleteId]);

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
  const [peaksFocus, setPeaksFocus] = useState(null);
  const [tssMode, setTssMode] = useState('power');

  useEffect(() => {
    setPeaksFocus(null);
  }, [a?.id, a?._id]);

  // Planned workout editing state
  const [plannedWorkout, setPlannedWorkout] = useState(initialPlannedWorkout || null);
  const [editingPlanned, setEditingPlanned] = useState(!initialPlannedWorkout);

  // Completed metadata edit state
  const [completedForm, setCompletedForm] = useState({ title: '', description: '', distanceKm: '', durationDisplay: '', tss: '', calories: '', rpe: '', lactate: '' });
  const [savingCompleted, setSavingCompleted] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editingCompleted, setEditingCompleted] = useState(false); // desktop inline edit of the completed activity
  const [durationPickerField, setDurationPickerField] = useState(null); // 'planned' | 'completed' | null (mobile wheel)

  useEffect(() => {
    if (mobileView !== 'edit') setDurationPickerField(null);
  }, [mobileView]);

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

  // Swim sessions are entered in metres (pool distances: 1500, 3000…), so a
  // bare number should be read as metres, not kilometres.
  const formSport = String(
    plannedWorkout?.sport || initialPlannedWorkout?.sport || activity?.sport || activity?.type || ''
  ).toLowerCase();
  const isSwimForm = formSport.includes('swim');
  const unitSystem = userUnitSystem(authUser || profileProp);

  const initDurMins = initialPlannedWorkout?.plannedDuration
    ? Math.round(initialPlannedWorkout.plannedDuration / 60) : null;

  // Smart distance parser → metres (respects imperial / swim).
  const parsePlanDistanceToMetres = (raw) => parseDistanceInputToMetres(raw, unitSystem, { isSwim: isSwimForm });

  const planDistanceMetresToDisplay = (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    const metres = n >= 100 ? n : n * 1000;
    return formatDistanceFieldDisplay(metres, unitSystem, { isSwim: isSwimForm });
  };

  const initDistMetres = (() => {
    const n = Number(initialPlannedWorkout?.plannedDistance);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n >= 100 ? n : n * 1000;
  })();

  const [planForm, setPlanForm] = useState({
    title: initialPlannedWorkout?.title || '',
    comment: plannedCommentText(initialPlannedWorkout),
    description: plannedDescriptionOnly(initialPlannedWorkout),
    durationDisplay: initDurMins ? formatMinutes(initDurMins) : '',
    durationMins: initDurMins,
    distanceDisplay: initDistMetres ? formatDistanceFieldDisplay(initDistMetres, unitSystem, { isSwim: isSwimForm }) : '',
    distanceKm: initDistMetres ? formatDistanceInputFromMetres(initDistMetres, unitSystem, { isSwim: isSwimForm }) : '',
    targetTss: initialPlannedWorkout?.targetTss ? String(initialPlannedWorkout.targetTss) : '',
  });
  const [savingPlan, setSavingPlan] = useState(false);

  // Strava-style share sheet — opens from the header arrow-up icon. Carousel
  // of 1080×1920 templates → PNG → Capacitor Share / Web Share API.
  const [shareOpen, setShareOpen] = useState(false);

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
  const [loadedProfile, setLoadedProfile] = useState(null);

  useEffect(() => {
    if (profileProp) {
      setLoadedProfile(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const selfId = String(authUser?._id || authUser?.id || '');
        const aid = String(athleteId || selfId || '');
        const path = aid && aid !== selfId ? `/user/athlete/${aid}/profile` : '/user/profile';
        const { data } = await api.get(path);
        if (!cancelled) setLoadedProfile(data);
      } catch (e) {
        console.warn('ActivityFullModal: profile load failed, using auth user', e);
        if (!cancelled) setLoadedProfile(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [profileProp, athleteId, authUser?._id, authUser?.id]);

  const tssProfile = profileProp || loadedProfile || authUser;
  const title = merged.titleManual || merged.title || merged.name || merged.originalFileName || 'Activity';
  const displayTitle = (() => {
    const fromPlan = String(plannedWorkout?.title || '').trim();
    if (fromPlan) return fromPlan;
    const linked = String(merged.linkedTrainingTitle || '').trim();
    if (linked) return linked;
    return String(title || 'Activity').trim() || 'Activity';
  })();
  // Prefer *moving* time (excludes pauses / auto-stop) over elapsed time so
  // a Strava ride with 30 min of coffee-stop pauses reports the actual saddle
  // time. Falls back to elapsed only when moving is missing (very old uploads,
  // some manually-logged trainings). Matters for pace / TSS / Edit-form prefill.
  const dur = Number(
    merged.movingTime || merged.moving_time || merged.totalTimerTime ||
    merged.duration || merged.elapsed_time || merged.totalElapsedTime || merged.elapsedTime ||
    0
  );
  const dist = Number(merged.distance || merged.totalDistance || 0);
  const powerTss = computePowerTss(merged, tssProfile);
  const hrTss = computeHrTss(merged, tssProfile);
  const availableTssModes = getAvailableTssModes(merged, tssProfile);
  const tssToggleable = canToggleTss(merged, tssProfile);
  const tssLabel = tssModeLabel(tssMode, { isBike, isRun, isSwim, activity: merged });
  const nextTssLabel = tssModeLabel(cycleTssMode(tssMode, availableTssModes), { isBike, isRun, isSwim, activity: merged });
  const tssToggleHint = tssToggleable ? `Switch to ${nextTssLabel}` : tssToggleDisabledReason(merged, tssProfile);
  const tss = resolveActivityTss(merged, tssProfile, { user: tssProfile, mode: tssMode });
  const activityKey = getActivityAppId(a);
  useEffect(() => {
    setTssMode(getActivityTssDisplayMode(merged, tssProfile, tssProfile));
    // Granular deps — avoid resetting mode on every merged object reference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityKey, powerTss, hrTss, merged.tssDisplayMode, merged.manualTss, merged.trainingStressScore, tssProfile?.powerZones, tssProfile?.trainingPreferences?.tssDisplayMode, tssProfile?.trainingPreferences?.tssDisplayModeBySport]);

  const persistTssMode = async (nextMode) => {
    const { kind, externalId } = resolveActivitySaveKind(merged);
    if (!kind || !externalId) return;
    const payload = { tssDisplayMode: nextMode };
    if (kind === 'strava') {
      const { updateStravaActivity } = await import('../../services/api.js');
      await updateStravaActivity(externalId, payload, athleteId);
    } else if (kind === 'garmin') {
      const { updateGarminActivity } = await import('../../services/api.js');
      await updateGarminActivity(externalId, payload, athleteId);
    } else if (kind === 'fit') {
      const { updateFitTraining } = await import('../../services/api.js');
      await updateFitTraining(externalId, payload);
    }
    setDetail((prev) => ({ ...(prev || {}), tssDisplayMode: nextMode }));
  };

  const flipTssMode = () => {
    if (!tssToggleable) return;
    const next = cycleTssMode(tssMode, availableTssModes);
    setTssMode(next);
    clearFormFitnessCache();
    notifyTssDisplayModeChanged(next);
    const appId = getActivityAppId(merged);
    const mergedNext = { ...merged, tssDisplayMode: next };
    const computed = resolveActivityTss(mergedNext, tssProfile, { user: tssProfile, mode: next });
    propagateCompletedSave({
      id: appId,
      tssDisplayMode: next,
      ...(computed > 0 ? { tss: Math.round(computed) } : {}),
    });
    persistTssMode(next).catch((err) => {
      console.error('Failed to save per-workout TSS mode', err);
      setTssMode(tssMode);
    });
  };

  // Keep edit-form TSS in sync when toggling power ↔ hr (computed only, not manual override).
  useEffect(() => {
    if (tssMode === 'manual') return;
    const computed = resolveActivityTss(merged, tssProfile, { user: tssProfile, mode: tssMode });
    if (computed > 0) {
      setCompletedForm((p) => ({ ...p, tss: String(Math.round(computed)) }));
    }
  }, [tssMode, activityKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Use actual average power for `power` — don't fall through to NP, otherwise
  // np === power and the NP label is never shown (the condition below checks ≠).
  const power = Number(merged.avgPower || merged.averagePower || merged.average_watts || 0);
  const np    = Number(merged.normalizedPower || merged.weightedAveragePower || merged.weighted_average_watts || 0);
  const hr    = Number(merged.averageHeartRate || merged.average_heartrate || merged.avgHR || merged.avgHeartRate || 0);
  const maxHR = Number(merged.maxHeartRate || merged.max_heartrate || merged.maxHr || 0);
  const maxPower = Number(merged.maxPower || merged.max_watts || merged.maxWatts || 0);
  const calories = resolveActivityCaloriesKcal(merged);
  const rpe = Number(merged.rpe || merged.RPE || 0);
  const sessionLactate = merged.lactate != null ? Number(merged.lactate) : null;
  const elevation = Number(merged.totalElevationGain || merged.elevationGain || merged.total_elevation_gain || 0);
  const cadence   = Number(merged.averageCadence || merged.average_cadence || merged.avgCadence || 0);
  const avgSpeed  = Number(merged.avgSpeed || merged.averageSpeed || merged.average_speed || 0);
  const actDate   = merged.date || merged.timestamp || merged.startDate || merged.start_time;
  const dateStr   = actDate ? new Date(actDate).toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric' }) : '';
  const notes = merged.description || merged.notes || '';
  const planComment = plannedCommentText(plannedWorkout);
  const planDescription = plannedDescriptionOnly(plannedWorkout);
  const commentsTarget = resolveCommentsTarget(merged, plannedWorkout);

  const fmtDur = (s) => {
    if (!s) return '—';
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
  };
  const fmtDist = (d) => (d > 0 ? formatDistance(d, unitSystem).formatted : '—');
  const fmtElev = (e) => (e > 0 ? formatElevation(e, unitSystem).formatted : '—');
  let paceStr = null;
  if (isRun && avgSpeed > 0) {
    paceStr = formatPaceFromSpeedMps(avgSpeed, unitSystem, 'run');
  } else if (isSwim && avgSpeed > 0) {
    paceStr = formatPaceFromSpeedMps(avgSpeed, unitSystem, 'swim');
  } else if (isRun && dist > 0 && dur > 0) {
    paceStr = formatPaceFromDistanceAndDuration(dist, dur, unitSystem, 'run');
  } else if (isSwim && dist > 0 && dur > 0) {
    paceStr = formatPaceFromDistanceAndDuration(dist, dur, unitSystem, 'swim');
  }

  // Laps
  const laps = Array.isArray(merged.laps) ? merged.laps : [];
  const fmtLapDur = (s) => {
    if (!s) return '—';
    const m = Math.floor(s/60), sec = Math.floor(s%60);
    return `${m}:${String(sec).padStart(2,'0')}`;
  };

  // Planned workout data
  const plannedDur  = plannedWorkout ? plannedWorkoutDurationSecs(plannedWorkout, dur) : 0;
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
      const durSecsFromForm = parseDurationToSeconds(planForm.durationDisplay, 'hm');
      const durMins = planForm.durationMins || parseDurationToMinutes(planForm.durationDisplay);
      // Fall back to re-parsing the display (e.g. user typed "3000" and hit
      // Save before the field blurred) so swim metres still convert to km.
      const distMetresRaw = planForm.distanceKm !== '' && planForm.distanceKm != null
        ? parsePlanDistanceToMetres(String(planForm.distanceKm))
        : parsePlanDistanceToMetres(planForm.distanceDisplay);
      const distMetres = Number.isFinite(distMetresRaw) && distMetresRaw > 0 ? distMetresRaw : null;
      const payload = {
        title: planForm.title || title,
        comment: (planForm.comment || '').trim() || undefined,
        description: planForm.description,
        coachNotes: '',
        sport: sportForPlan,
        date: dateForPlan,
        plannedDuration: (durSecsFromForm != null && durSecsFromForm > 0)
          ? durSecsFromForm
          : (durMins ? Math.round(durMins * 60) : (plannedWorkoutDurationSecs(plannedWorkout) || undefined)),
        ...(distMetres != null && { plannedDistance: Math.round(distMetres) }),
        ...(planForm.targetTss !== '' && { targetTss: Number(planForm.targetTss) || 0 }),
      };
      // Link this plan to the open completed activity so planner/calendar pairing stays stable.
      const activityId = getActivityAppId(merged);
      if (activityId && dur > 0) {
        payload.status = 'completed';
        payload.completedTrainingId = activityId;
        if (merged.stravaId) payload.stravaActivityId = String(merged.stravaId);
        const isFitLink = merged.source === 'fit' || merged.type === 'fit'
          || activityId.startsWith('fit-') || (!!merged.timestamp && !merged.stravaId && merged._id);
        if (isFitLink && merged._id) payload.fitTrainingId = String(merged._id);
      }
      let saved;
      if (plannedWorkout?._id) {
        saved = await updatePlannedWorkout(plannedWorkout._id, payload, athleteId);
      } else {
        saved = await createPlannedWorkout(payload, athleteId);
      }
      setPlannedWorkout(saved);
      setEditingPlanned(false);
      const savedDistDisplay = planDistanceMetresToDisplay(saved.plannedDistance);
      const savedDistMetres = (() => {
        const n = Number(saved.plannedDistance);
        if (!Number.isFinite(n) || n <= 0) return null;
        return n >= 100 ? n : n * 1000;
      })();
      setPlanForm({
        title: saved.title || '',
        comment: plannedCommentText(saved),
        description: plannedDescriptionOnly(saved),
        durationDisplay: saved.plannedDuration ? fmtDur(saved.plannedDuration) : '',
        durationMins: saved.plannedDuration ? saved.plannedDuration / 60 : null,
        distanceKm: savedDistMetres ? formatDistanceInputFromMetres(savedDistMetres, unitSystem, { isSwim: isSwimForm }) : '',
        distanceDisplay: savedDistDisplay || '',
        targetTss: saved.targetTss != null ? String(saved.targetTss) : '',
      });
      if (onPlannedSaved) onPlannedSaved(saved);
      try {
        window.dispatchEvent(new CustomEvent('plannedWorkoutUpdated', { detail: { planned: saved } }));
      } catch { /* ignore */ }
      clearFormFitnessCache();

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
      throw err;
    } finally {
      setSavingPlan(false);
    }
  };

  const planSteps = Array.isArray(plannedWorkout?.steps) ? plannedWorkout.steps : [];

  // ── Seed completed-metadata form when opening a different activity ──
  useEffect(() => {
    const distDisplayVal = dist > 0 ? formatDistanceInputFromMetres(dist, unitSystem, { isSwim: false }) : '';
    const durDisplay = dur > 0 ? fmtDur(dur) : '';
    const formTitle = String(plannedWorkout?.title || '').trim() || title || '';
    setCompletedForm({
      title: formTitle,
      description: notes || '',
      distanceKm: distDisplayVal,
      durationDisplay: durDisplay,
      tss: tss > 0 ? String(Math.round(tss)) : '',
      calories: calories > 0 ? String(Math.round(calories)) : '',
      rpe: rpe > 0 ? String(rpe) : '',
      lactate: sessionLactate != null ? String(sessionLactate) : '',
    });
  }, [activityKey, plannedWorkout?.title, plannedWorkout?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Strava detail (kilojoules, saved calories, rpe) loads after the modal opens —
  // back-fill completed fields when they arrive without clobbering user edits.
  useEffect(() => {
    if (!detail) return;
    const kcal = resolveActivityCaloriesKcal(merged);
    const detailRpe = Number(merged.rpe || merged.RPE || 0);
    const detailLactate = merged.lactate != null ? Number(merged.lactate) : null;
    setCompletedForm((p) => {
      const next = { ...p };
      if (kcal > 0 && p.calories === '') next.calories = String(kcal);
      if (detailRpe > 0 && p.rpe === '') next.rpe = String(detailRpe);
      if (detailLactate != null && Number.isFinite(detailLactate) && p.lactate === '') {
        next.lactate = String(detailLactate);
      }
      return next;
    });
  }, [activityKey, detail, merged]);

  // Persist a category change immediately (no submit button — quick tag).
  const handleCategoryChange = useCallback(async (nextCategory) => {
    try {
      const appId = getActivityAppId(merged);
      const { kind, externalId } = resolveActivitySaveKind(merged);
      const value = nextCategory || null;
      setDetail(prev => ({ ...(prev || {}), category: value }));

      if (!kind || !externalId) return;

      if (kind === 'strava') {
        const { updateStravaActivity } = await import('../../services/api.js');
        await updateStravaActivity(externalId, { category: value }, athleteId);
      } else if (kind === 'garmin') {
        const { updateGarminActivity } = await import('../../services/api.js');
        await updateGarminActivity(externalId, { category: value }, athleteId);
      } else if (kind === 'fit') {
        const { updateFitTraining } = await import('../../services/api.js');
        await updateFitTraining(externalId, { category: value });
      } else if (kind === 'regular') {
        const { updateTraining } = await import('../../services/api.js');
        await updateTraining(externalId, { category: value });
      }
      try {
        window.dispatchEvent(new CustomEvent('activityCategoryUpdated', { detail: { id: appId, category: value } }));
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

  // Accept "1:30:00", "1:30", "90", "90m", "1h30", "1h 30m" → seconds.
  // style 'hm' → H:MM (planned editor). style 'ms' → M:SS (completed under 1h).
  const parseDurationToSeconds = (raw, style = 'auto') => {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (s.includes(':')) {
      const parts = s.split(':').map(p => Number(p.trim()));
      if (parts.some(n => !Number.isFinite(n) || n < 0)) return null;
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) {
        if (style === 'hm') return parts[0] * 3600 + parts[1] * 60;
        if (style === 'ms') return parts[0] * 60 + parts[1];
        // auto: 45:30 → M:SS; 1:20 / 0:45 → H:MM
        if (parts[0] >= 10) return parts[0] * 60 + parts[1];
        if (parts[0] === 0) return parts[1] * 60;
        return parts[0] * 3600 + parts[1] * 60;
      }
      if (parts.length === 1) return parts[0] * 60;
      return null;
    }
    // "1h30" / "1h 30m" / "45m" / "90" (assume minutes).
    const m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m?)?$/i);
    if (m) {
      const h = Number(m[1] || 0);
      const min = Number(m[2] || 0);
      if (h > 0 || min > 0) return h * 3600 + min * 60;
    }
    return null;
  };

  const propagateCompletedSave = (eventDetail) => {
    try {
      window.dispatchEvent(new CustomEvent('activityMetricsUpdated', { detail: eventDetail }));
    } catch { /* ignore */ }
    try {
      const matches = buildActivityMatcher(eventDetail.id);
      const listPatch = metricsPatchFromDetail(eventDetail);
      if (Object.keys(listPatch).length) patchCalendarCache(matches, listPatch);
    } catch { /* ignore */ }
    onCompletedSaved?.(eventDetail);
  };

  const handleSaveCompleted = async () => {
    setSavingCompleted(true);
    try {
      const appId = getActivityAppId(merged);
      const { kind, externalId } = resolveActivitySaveKind(merged);
      const extraFields = {};
      if (completedForm.calories !== '') extraFields.calories = Number(completedForm.calories) || 0;
      if (completedForm.rpe !== '')      extraFields.rpe = Number(completedForm.rpe) || 0;
      if (completedForm.lactate !== '') {
        const la = parseLactateValue(completedForm.lactate);
        if (la != null) extraFields.lactate = la;
      }
      if (completedForm.tss !== '') {
        extraFields.tss = Number(completedForm.tss) || 0;
        extraFields.tssDisplayMode = 'manual';
      }

      if (String(completedForm.durationDisplay || '').trim()) {
        const secs = parseDurationToSeconds(completedForm.durationDisplay, 'ms');
        if (secs == null) throw new Error('Invalid duration — use 1:30:00, 1:30, 90m or 2h30m');
        extraFields.movingTime = secs;
        extraFields.duration = secs;
      }
      if (String(completedForm.distanceKm || '').trim()) {
        const metres = parseDistanceInputToMetres(completedForm.distanceKm, unitSystem, { isSwim: isSwimForm });
        if (metres == null) throw new Error(`Invalid distance — use ${distanceInputUnitLabel(unitSystem, isSwimForm)}, e.g. ${unitSystem === 'imperial' ? '26.2' : '42.2'}`);
        extraFields.distance = Math.round(metres);
      }

      const basePayload = { title: completedForm.title, description: completedForm.description };

      const buildDetailPatch = (fields) => {
        const patch = { titleManual: completedForm.title, title: completedForm.title, description: completedForm.description };
        const secs = fields.movingTime ?? fields.duration;
        if (secs != null) {
          patch.movingTime = secs;
          patch.moving_time = secs;
          patch.duration = secs;
          patch.elapsedTime = secs;
          patch.elapsed_time = secs;
          patch.totalElapsedTime = secs;
          patch.totalTimerTime = secs;
          patch.totalTime = secs;
        }
        if (fields.distance != null) {
          patch.distance = fields.distance;
          patch.totalDistance = fields.distance;
        }
        if (fields.calories != null) {
          patch.calories = fields.calories;
          patch.totalCalories = fields.calories;
        }
        if (fields.tss != null) {
          patch.tss = fields.tss;
          patch.trainingStressScore = fields.tss;
          patch.manualTss = fields.tss;
        }
        if (fields.tssDisplayMode) patch.tssDisplayMode = fields.tssDisplayMode;
        if (fields.rpe != null) patch.rpe = fields.rpe;
        if (fields.lactate != null) patch.lactate = fields.lactate;
        if (
          fields.movingTime != null
          || fields.distance != null
          || fields.tss != null
          || fields.tssDisplayMode === 'manual'
        ) {
          patch.metricsManualized = true;
        }
        return patch;
      };

      if (!kind || !externalId) {
        throw new Error('Could not determine activity type to save');
      }

      let savedResponse = null;
      if (kind === 'strava') {
        const { updateStravaActivity } = await import('../../services/api.js');
        savedResponse = await updateStravaActivity(externalId, { ...basePayload, ...extraFields }, athleteId);
      } else if (kind === 'garmin') {
        const { updateGarminActivity } = await import('../../services/api.js');
        savedResponse = await updateGarminActivity(externalId, { ...basePayload, ...extraFields }, athleteId);
      } else if (kind === 'fit') {
        const { updateFitTraining } = await import('../../services/api.js');
        savedResponse = await updateFitTraining(externalId, { ...basePayload, ...extraFields });
      } else if (kind === 'regular') {
        const { updateTraining } = await import('../../services/api.js');
        const trainingPayload = { ...basePayload, ...extraFields };
        if (extraFields.movingTime != null) {
          trainingPayload.duration = fmtDur(extraFields.movingTime);
        }
        savedResponse = await updateTraining(externalId, trainingPayload);
      }

      const savedAct = savedResponse?.activity || savedResponse || {};
      const savedMoving = savedAct.movingTime ?? savedAct.totalElapsedTime ?? savedAct.totalTimerTime ?? extraFields.movingTime;
      const savedDist = savedAct.distance ?? savedAct.totalDistance ?? extraFields.distance;
      const savedTss = savedAct.manualTss ?? savedAct.trainingStressScore ?? savedAct.tss ?? extraFields.tss;

      const detailPatch = buildDetailPatch({
        ...extraFields,
        movingTime: savedMoving,
        distance: savedDist,
        tss: savedTss,
      });
      setDetail((prev) => ({ ...(prev || {}), ...detailPatch }));
      if (savedMoving != null) {
        setCompletedForm((p) => ({
          ...p,
          durationDisplay: fmtDur(savedMoving),
        }));
      }
      if (savedDist != null) {
        setCompletedForm((p) => ({
          ...p,
          distanceKm: formatDistanceInputFromMetres(savedDist, unitSystem, { isSwim: isSwimForm }),
        }));
      }
      if (savedTss != null && Number.isFinite(Number(savedTss)) && Number(savedTss) > 0) {
        setCompletedForm((p) => ({
          ...p,
          tss: String(Math.round(Number(savedTss))),
        }));
      }

      const effectiveMode = savedAct.tssDisplayMode
        ?? (extraFields.tss != null ? 'manual' : merged.tssDisplayMode);
      const eventDetail = {
        id: appId,
        stravaId: merged.stravaId ?? (kind === 'strava' ? externalId : null),
        garminId: merged.garminId ?? (kind === 'garmin' ? externalId : null),
        _id: kind === 'fit' || kind === 'regular' ? externalId : merged._id || null,
        title: completedForm.title,
        description: completedForm.description,
        movingTime: savedMoving,
        duration: savedMoving,
        distance: savedDist,
        tssDisplayMode: effectiveMode,
        metricsManualized: Boolean(
          savedAct.metricsManualized
          || extraFields.movingTime != null
          || extraFields.distance != null
          || extraFields.tss != null
        ),
        calories: savedAct.calories ?? extraFields.calories,
        rpe: savedAct.rpe ?? extraFields.rpe,
        lactate: savedAct.lactate ?? extraFields.lactate,
      };
      if (extraFields.tss != null) {
        eventDetail.tss = savedTss;
        eventDetail.manualTss = savedTss;
      } else {
        const patchedForTss = { ...merged, ...metricsPatchFromDetail(eventDetail) };
        const computed = resolveActivityTss(patchedForTss, tssProfile, {
          user: tssProfile,
          mode: effectiveMode || tssMode,
        });
        if (computed > 0) eventDetail.tss = Math.round(computed);
      }
      propagateCompletedSave(eventDetail);
      clearFormFitnessCache();
      if (extraFields.tssDisplayMode === 'manual') setTssMode('manual');
      notifyTssDisplayModeChanged(effectiveMode || tssMode);
      if (completedForm.title) {
        try {
          window.dispatchEvent(new CustomEvent('activityTitleUpdated', { detail: { id: appId, title: completedForm.title } }));
        } catch { /* ignore */ }
      }

      const completedTitle = (completedForm.title || '').trim();
      if (plannedWorkout?._id && completedTitle && completedTitle !== plannedWorkout.title) {
        try {
          const { updatePlannedWorkout } = await import('../../services/workoutPlannerApi.js');
          const planSaved = await updatePlannedWorkout(plannedWorkout._id, { title: completedTitle }, athleteId);
          setPlannedWorkout(planSaved);
          if (onPlannedSaved) onPlannedSaved(planSaved);
        } catch (planErr) {
          console.error('Failed to mirror title to planned workout', planErr);
        }
      }
    } catch (err) {
      console.error('Failed to save completed metadata', err);
      throw err;
    } finally {
      setSavingCompleted(false);
    }
  };

  // Shared Planned | Completed editor (mobile Edit tab + desktop inline edit).
  const renderPlannedVsCompletedEditor = ({ mobile = false, onCancel, onSaved } = {}) => {
    const inputCls = mobile
      ? 'w-full px-2 py-1.5 rounded-md border border-gray-200 text-[13px] bg-white text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500'
      : 'w-full px-2.5 py-1.5 rounded-md border border-gray-200 text-sm bg-white text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500';
    const plannedCls = mobile
      ? 'w-full px-2 py-1.5 rounded-md border border-gray-200 text-[13px] bg-gray-50 text-right tabular-nums text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-400'
      : 'w-full px-2.5 py-1.5 rounded-md border border-gray-200 text-sm bg-gray-50 text-right tabular-nums text-gray-600 focus:outline-none focus:ring-2 focus:ring-slate-400';
    const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isNaN(n) ? null : n; };
    const durMins = (s) => { const m = parseDurationToMinutes(s); return (m != null && m > 0) ? m : null; };
    const ratioColor = (c, p) => {
      if (!(c > 0) || !(p > 0)) return null;
      const r = c / p;
      if (r < 0.9) return '#dc2626';
      if (r > 1.25) return '#d97706';
      return '#059669';
    };
    const durColor = ratioColor(durMins(completedForm.durationDisplay), planForm.durationMins || durMins(planForm.durationDisplay));
    const distColor = ratioColor(
      num(completedForm.distanceKm),
      num(planForm.distanceKm) ?? (parsePlanDistanceToMetres(planForm.distanceDisplay) != null
        ? formatDistanceInputFromMetres(parsePlanDistanceToMetres(planForm.distanceDisplay), unitSystem, { isSwim: isSwimForm })
        : null),
    );
    const tssColor = ratioColor(num(completedForm.tss), num(planForm.targetTss));
    const doneStyle = (c) => (c ? { color: c, fontWeight: 700 } : undefined);
    const labelCol = mobile ? '56px' : '78px';

    const plannedDurationSecs = () => {
      const parsed = parseDurationToSeconds(planForm.durationDisplay, 'hm');
      if (parsed != null && parsed >= 0) return parsed;
      if (planForm.durationMins > 0) return Math.round(planForm.durationMins * 60);
      return 0;
    };
    const completedDurationSecs = () => {
      const parsed = parseDurationToSeconds(completedForm.durationDisplay, 'ms');
      return (parsed != null && parsed >= 0) ? parsed : 0;
    };
    const applyPlannedDurationSecs = (secs) => {
      const s = Math.max(0, Math.floor(secs));
      setPlanForm((p) => ({
        ...p,
        durationDisplay: fmtDur(s),
        durationMins: s / 60,
      }));
    };
    const applyCompletedDurationSecs = (secs) => {
      const s = Math.max(0, Math.floor(secs));
      setCompletedForm((p) => ({ ...p, durationDisplay: fmtDur(s) }));
    };

    const saveAll = async () => {
      setSaveError('');
      const planNeedsCreate = !plannedWorkout?._id && (
        planForm.durationDisplay || planForm.distanceDisplay || planForm.targetTss
        || planForm.title || planForm.description
      );
      const baselineDur = plannedWorkout?.plannedDuration ? fmtDur(plannedWorkout.plannedDuration) : '';
      const baselineDistKm = (() => {
        const n = Number(plannedWorkout?.plannedDistance || 0);
        const metres = n > 0 && n < 100 ? n * 1000 : n;
        return metres > 0 ? formatDistanceInputFromMetres(metres, unitSystem, { isSwim: isSwimForm }) : '';
      })();
      const planDirty = Boolean(plannedWorkout?._id && (
        (planForm.title || '') !== (plannedWorkout.title || '')
        || (planForm.comment || '') !== plannedCommentText(plannedWorkout)
        || (planForm.description || '') !== plannedDescriptionOnly(plannedWorkout)
        || (planForm.durationDisplay || '') !== baselineDur
        || (planForm.distanceKm || '') !== baselineDistKm
        || (planForm.targetTss !== '' && Number(planForm.targetTss) !== Number(plannedWorkout.targetTss || 0))
      ));
      try {
        await handleSaveCompleted();
        if (planDirty || planNeedsCreate) {
          try {
            await handleSavePlan();
          } catch (planErr) {
            console.error('Failed to save planned workout (completed was saved)', planErr);
          }
        }
        onSaved?.();
      } catch (err) {
        const msg = err?.response?.data?.error || err?.message || 'Save failed';
        setSaveError(String(msg));
        throw err;
      }
    };

    return (
      <>
      <div className={mobile ? 'px-4 py-3 space-y-2.5' : 'px-5 py-4 border-b border-gray-100 bg-gray-50/60'}>
        {!mobile && (
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Edit activity</div>
        )}

        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Title</div>
          <input
            type="text"
            value={completedForm.title}
            onChange={(e) => {
              const v = e.target.value;
              setCompletedForm((p) => ({ ...p, title: v }));
              setPlanForm((p) => ({ ...p, title: v }));
            }}
            placeholder="Activity title"
            className={`w-full px-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${mobile ? 'py-2' : 'py-2.5'}`}
          />
        </div>

        <div className={`rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 ${mobile ? 'px-2 py-0.5' : 'px-3 py-1'}`}>
          <div className={`grid ${mobile ? 'gap-1 pb-0.5 pt-0.5' : 'gap-2 pb-1.5 pt-1'}`} style={{ gridTemplateColumns: `${labelCol} 1fr 1fr` }}>
            <div />
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide text-right pr-1">Planned</div>
            <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wide text-right pr-1">Completed</div>
          </div>
          <PlannedVsCompletedRow
            labelCol={labelCol}
            label="Duration"
            compact={mobile}
            plannedInput={mobile ? (
              <DurationPickerField
                value={planForm.durationDisplay}
                placeholder="0:00"
                active={durationPickerField === 'planned'}
                onOpen={() => setDurationPickerField('planned')}
                className={plannedCls}
              />
            ) : (
              <input
                type="text"
                value={planForm.durationDisplay}
                onChange={(e) => setPlanForm((p) => ({ ...p, durationDisplay: e.target.value, durationMins: null }))}
                onBlur={() => {
                  const mins = parseDurationToMinutes(planForm.durationDisplay);
                  if (mins != null && mins > 0) setPlanForm((p) => ({ ...p, durationMins: mins, durationDisplay: formatMinutes(mins) }));
                }}
                placeholder="1:30"
                className={plannedCls}
              />
            )}
          >
            {mobile ? (
              <DurationPickerField
                value={completedForm.durationDisplay}
                placeholder="0:00"
                active={durationPickerField === 'completed'}
                onOpen={() => setDurationPickerField('completed')}
                className={inputCls}
                style={doneStyle(durColor)}
              />
            ) : (
              <input
                type="text"
                value={completedForm.durationDisplay}
                onChange={(e) => setCompletedForm((p) => ({ ...p, durationDisplay: e.target.value }))}
                onBlur={() => {
                  const secs = parseDurationToSeconds(completedForm.durationDisplay, 'ms');
                  if (secs != null && secs > 0) {
                    setCompletedForm((p) => ({ ...p, durationDisplay: fmtDur(secs) }));
                  }
                }}
                placeholder="3:34:53"
                className={inputCls}
                style={doneStyle(durColor)}
              />
            )}
          </PlannedVsCompletedRow>
          <PlannedVsCompletedRow
            labelCol={labelCol}
            label="Distance"
            compact={mobile}
            plannedInput={(
              <input
                type="text"
                value={planForm.distanceDisplay}
                onChange={(e) => setPlanForm((p) => ({ ...p, distanceDisplay: e.target.value, distanceKm: null }))}
                onBlur={() => {
                  const metres = parsePlanDistanceToMetres(planForm.distanceDisplay);
                  if (metres != null && metres > 0) {
                    setPlanForm((p) => ({
                      ...p,
                      distanceKm: formatDistanceInputFromMetres(metres, unitSystem, { isSwim: isSwimForm }),
                      distanceDisplay: formatDistanceFieldDisplay(metres, unitSystem, { isSwim: isSwimForm }),
                    }));
                  }
                }}
                placeholder={distanceInputPlaceholder(unitSystem, isSwimForm)}
                className={plannedCls}
              />
            )}
          >
            <input
              type="text"
              inputMode="decimal"
              value={completedForm.distanceKm}
              onChange={(e) => setCompletedForm((p) => ({ ...p, distanceKm: sanitizeDecimalInput(e.target.value) }))}
              placeholder={distanceInputUnitLabel(unitSystem, isSwimForm)}
              className={inputCls}
              style={doneStyle(distColor)}
            />
          </PlannedVsCompletedRow>
          <PlannedVsCompletedRow
            labelCol={labelCol}
            label={(
              tssToggleable ? (
                <button
                  type="button"
                  onClick={flipTssMode}
                  className="text-left text-[10px] font-semibold uppercase tracking-wide text-blue-600 active:opacity-70"
                  title={`Switch to ${nextTssLabel}`}
                >
                  {tssLabel} ⇄
                </button>
              ) : (
                <span>{tssLabel}</span>
              )
            )}
            compact={mobile}
            plannedInput={(
              <input
                type="number"
                inputMode="numeric"
                value={planForm.targetTss}
                onChange={(e) => setPlanForm((p) => ({ ...p, targetTss: e.target.value }))}
                placeholder="—"
                min="0"
                className={plannedCls}
              />
            )}
          >
            <input
              type="number"
              inputMode="numeric"
              value={completedForm.tss}
              onChange={(e) => setCompletedForm((p) => ({ ...p, tss: e.target.value }))}
              placeholder="—"
              min="0"
              className={inputCls}
              style={doneStyle(tssColor)}
            />
          </PlannedVsCompletedRow>
          <PlannedVsCompletedRow labelCol={labelCol} label="Calories" compact={mobile}>
            <input
              type="number"
              inputMode="numeric"
              value={completedForm.calories}
              onChange={(e) => setCompletedForm((p) => ({ ...p, calories: e.target.value }))}
              placeholder="kcal"
              className={inputCls}
            />
          </PlannedVsCompletedRow>
          <PlannedVsCompletedRow labelCol={labelCol} label="RPE" compact={mobile}>
            <input
              type="number"
              inputMode="numeric"
              value={completedForm.rpe}
              onChange={(e) => setCompletedForm((p) => ({ ...p, rpe: e.target.value }))}
              placeholder="1–10"
              min="1"
              max="10"
              className={inputCls}
            />
          </PlannedVsCompletedRow>
          <PlannedVsCompletedRow labelCol={labelCol} label="Lactate" accent="#7c3aed" compact={mobile}>
            <input
              type="text"
              inputMode="decimal"
              value={completedForm.lactate}
              onChange={(e) => setCompletedForm((p) => ({ ...p, lactate: sanitizeDecimalInput(e.target.value) }))}
              placeholder="mmol/L"
              className={inputCls}
            />
          </PlannedVsCompletedRow>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${mobile ? 'gap-2' : 'gap-3'}`}>
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Comment · calendar card</div>
            <textarea
              value={planForm.comment}
              onChange={(e) => setPlanForm((p) => ({ ...p, comment: e.target.value }))}
              rows={mobile ? 2 : 2}
              placeholder="Short note shown on the calendar…"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Planned description</div>
            <textarea
              value={planForm.description}
              onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))}
              rows={mobile ? 2 : 3}
              placeholder="Workout plan, intervals, coach instructions…"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50 resize-none focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wide mb-1">Completed notes</div>
          <textarea
            value={completedForm.description}
            onChange={(e) => setCompletedForm((p) => ({ ...p, description: e.target.value }))}
            rows={mobile ? 2 : 3}
            placeholder="How did it go?"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {!mobile && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Category</span>
            <CategoryPicker value={merged.category || null} onChange={handleCategoryChange} />
          </div>
        )}

        <div className={`flex gap-2 ${mobile ? '' : 'mt-1'}`}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className={`${mobile ? 'flex-1 py-2.5' : 'px-4 py-2'} rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 active:bg-gray-50`}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={saveAll}
            disabled={savingCompleted || savingPlan}
            className={`${mobile ? 'flex-[2] py-2.5' : 'px-5 py-2'} rounded-xl text-sm font-bold text-white disabled:opacity-50`}
            style={{ backgroundColor: color }}
          >
            {(savingCompleted || savingPlan) ? 'Saving…' : 'Save changes'}
          </button>
        </div>
        {stravaIdForDelete && (
          <div className={`${mobile ? 'mt-4 pt-4' : 'mt-3 pt-3'} border-t border-gray-100`}>
            <button
              type="button"
              onClick={handleDeleteTap}
              disabled={deleting}
              className={`w-full flex items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors ${
                confirmDelete
                  ? 'border-red-500 bg-red-500 text-white active:bg-red-600'
                  : 'border-red-200 bg-red-50 text-red-600 active:bg-red-100'
              } ${deleting ? 'opacity-60 pointer-events-none' : ''}`}
              style={{ padding: mobile ? '10px 12px' : '8px 12px' }}
            >
              <TrashIcon className="w-4 h-4" />
              {deleting ? 'Deleting…' : confirmDelete ? 'Tap again to confirm delete' : 'Delete activity from LaChart'}
            </button>
            <p className={`text-[10px] text-gray-400 mt-1.5 ${mobile ? 'text-center' : ''}`}>
              Removes this workout from LaChart only — it stays on Strava.
            </p>
          </div>
        )}
        {saveError && (
          <div className={`text-xs text-red-600 font-medium ${mobile ? 'mt-2' : 'mt-1'}`}>
            {saveError}
          </div>
        )}
      </div>

      {mobile && (
        <DurationPickerSheet
          open={!!durationPickerField}
          title={durationPickerField === 'planned' ? 'Planned duration' : 'Completed duration'}
          seconds={durationPickerField === 'planned' ? plannedDurationSecs() : completedDurationSecs()}
          onChange={durationPickerField === 'planned' ? applyPlannedDurationSecs : applyCompletedDurationSecs}
          onClose={() => setDurationPickerField(null)}
        />
      )}
      </>
    );
  };

  // ── Compare tab visibility ──
  const hasCategory  = !!(merged?.category);
  const hasTitle     = !!(merged?.titleManual || (merged?.title && String(merged.title).trim()));
  const hasLactateVal = Number(merged?.lactate) > 0;
  const hasLapsCompare = Array.isArray(merged?.laps) && merged.laps.length > 0;
  const showCompare  = hasCategory || hasTitle || hasLactateVal || hasLapsCompare;

  // ── MOBILE LAYOUT ──
  if (isMobile) {
    const hasLaps = laps.length > 0;

    const mobilePortal = ReactDOM.createPortal(
      // When the share sheet is open we disable pointer-events on the
      // underlying activity modal — iOS WKWebView occasionally lets the
      // touch hit-test land on the lower of two stacked position:fixed
      // overlays even when the higher one has a bigger z-index, which
      // was making Copy/Save/Share buttons unresponsive.
      <div className="fixed inset-0 z-[10001] bg-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', pointerEvents: shareOpen ? 'none' : 'auto' }}>
        {/* Header — title + actions kept together on one top row */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <div className="flex items-center gap-2">
            <SportIcon sport={a.sport} className="w-6 h-6 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 text-base leading-snug truncate">{displayTitle}</div>
              <div className="text-xs text-gray-400 mt-0.5 truncate">{dateStr}</div>
            </div>
            {detailLoading && (
              <svg className="w-4 h-4 animate-spin text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            )}
            {onAddLactate && hasLaps && (
              <button onClick={() => { onAddLactate(merged); onClose(); }}
                title="Add lactate"
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg border-2 text-xs font-bold flex-shrink-0 active:opacity-70"
                style={{ borderColor: '#7c3aed', color: '#7c3aed', backgroundColor: '#f5f3ff' }}>
                <BeakerIcon className="w-4 h-4" />
                <span>Lactate</span>
              </button>
            )}
            {/* Edit — opens the Planned | Completed editor (Edit tab; not on tab bar) */}
            <button
              type="button"
              onClick={() => {
                if (mobileView === 'edit') {
                  setDurationPickerField(null);
                  setMobileView('summary');
                  setEditingPlanned(false);
                } else {
                  setEditingPlanned(true);
                  setMobileView('edit');
                }
              }}
              title="Edit activity"
              className={`p-2 rounded-lg active:bg-gray-200 flex-shrink-0 hover:bg-gray-100 touch-manipulation ${
                mobileView === 'edit' ? 'bg-blue-50 text-blue-700' : 'text-gray-500'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShareOpen(true)}
              title="Share activity"
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 active:bg-gray-200 flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
            <button onClick={onClose} className="p-2 -mr-1 rounded-lg hover:bg-gray-100 text-gray-500 active:bg-gray-200 flex-shrink-0">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab bar — Summary · Map/Graph · Laps · Peaks (edit via pencil only) */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {[
            { id: 'summary', label: 'Summary' },
            ...((gpsData.length > 0 || chartTraining?.records?.length > 0) ? [{ id: 'mapgraph', label: 'Map/Graph' }] : []),
            ...(hasLaps ? [{ id: 'laps', label: 'Laps' }] : []),
            ...((chartTraining?.records?.length > 10) ? [{ id: 'peaks', label: 'Peaks' }] : []),
            ...(showCompare ? [{ id: 'compare', label: 'Compare' }] : []),
          ].map(tab => (
            <button key={tab.id} onClick={() => setMobileView(tab.id)}
              className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors whitespace-nowrap ${mobileView === tab.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── SUMMARY TAB ── */}
        {mobileView === 'summary' && (
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>

            {/* Stats — TrainingPeaks-style Planned | Completed comparison */}
            <div className="px-4 pt-3 pb-3 space-y-3 border-b border-gray-50">
              {(() => {
                const elapsedTime = Number(merged.elapsed_time || merged.totalElapsedTime || merged.elapsedTime || merged.totalTimerTime || 0);
                const plDur  = plannedWorkout ? Number(plannedDur || 0) : 0;
                const plDist = plannedWorkout ? Number(plannedDist || 0) : 0;
                const plTss  = plannedWorkout ? Number(plannedTss || 0) : 0;
                // IF derived from TSS: TSS = IF² × hours × 100  ⇒  IF = √(TSS / (100·h))
                const hrs    = dur > 0 ? dur / 3600 : 0;
                const ifVal  = (tss > 0 && hrs > 0) ? Math.sqrt(tss / (100 * hrs)) : 0;
                const plHrs  = plDur > 0 ? plDur / 3600 : 0;
                const plIf   = (plTss > 0 && plHrs > 0) ? Math.sqrt(plTss / (100 * plHrs)) : 0;
                const workKj = Number(merged.kilojoules || merged.work || 0) || (power > 0 && dur > 0 ? (power * dur / 1000) : 0);

                const deltaPct = (c, p) => (c > 0 && p > 0) ? Math.round((c / p - 1) * 100) : null;
                const compliancePct = (plDur > 0 && dur > 0) ? Math.round(dur / plDur * 100) : null;
                const durCompliant = compliancePct != null && compliancePct >= 85;
                const rowColor = (c, p, isDuration = false) => getMetricComparisonColor(p, c, { durationCompliancePct: compliancePct, isDuration });

                const paceTable = paceStr
                  ? {
                      co: paceStr.replace(/\s*\/\s*\S+$/, '').trim(),
                      unit: (paceStr.match(/(\/\S+)\s*$/) || [])[1] || '',
                    }
                  : { co: null, unit: '' };

                const distPl = distDisplayParts(plDist, unitSystem);
                const distCo = distDisplayParts(dist, unitSystem);
                const elevCo = elevation > 0 ? formatElevation(elevation, unitSystem) : null;
                const speedCo = isBike && avgSpeed > 0 ? formatSpeed(avgSpeed, unitSystem) : null;

                // Planned pace = planned distance ÷ planned duration (run/swim
                // only, mirroring the completed-pace logic above), so the
                // Planned column shows a real target instead of a bare "—".
                const plPaceSport = isRun ? 'run' : isSwim ? 'swim' : null;
                const plPaceFull = (plPaceSport && plDist > 0 && plDur > 0)
                  ? formatPaceFromDistanceAndDuration(plDist, plDur, unitSystem, plPaceSport)
                  : null;
                const plPaceVal = plPaceFull ? plPaceFull.replace(/\s*\/\s*\S+$/, '').trim() : null;
                const plPaceUnit = plPaceFull ? ((plPaceFull.match(/(\/\S+)\s*$/) || [])[1] || '') : '';

                const speedRow = isBike
                  ? { label: 'Avg Speed', pl: null, co: speedCo ? speedCo.value.toFixed(1) : null, unit: speedCo?.unit || '' }
                  : { label: 'Avg Pace', pl: plPaceVal, co: paceTable.co, unit: paceTable.unit || plPaceUnit };

                const rows = [
                  { label: 'Duration', pl: plDur > 0 ? fmtDur(plDur) : null, co: dur > 0 ? fmtDur(dur) : null, unit: 'h:m:s', color: rowColor(dur, plDur, true), delta: deltaPct(dur, plDur) },
                  (elapsedTime > 0 && Math.abs(elapsedTime - dur) > 1) ? { label: 'Total Time', pl: null, co: fmtDur(elapsedTime), unit: 'h:m:s' } : null,
                  { label: 'Distance', pl: distPl.val, co: distCo.val, unit: distCo.unit || distPl.unit || '', color: rowColor(dist, plDist), delta: deltaPct(dist, plDist) },
                  (speedRow.co || speedRow.pl) ? { label: speedRow.label, pl: speedRow.pl, co: speedRow.co, unit: speedRow.unit } : null,
                  calories > 0 ? { label: 'Calories', pl: null, co: Math.round(calories), unit: 'kcal' } : null,
                  elevCo ? { label: 'El. Gain', pl: null, co: Math.round(elevCo.value).toLocaleString(), unit: elevCo.unit } : null,
                  { label: tssLabel, pl: plTss > 0 ? Math.round(plTss) : null, co: tss > 0 ? Math.round(tss) : null, unit: 'TSS', color: rowColor(tss, plTss), delta: deltaPct(tss, plTss), tssToggle: true },
                  (ifVal > 0 || plIf > 0) ? { label: 'IF', pl: plIf > 0 ? plIf.toFixed(2) : null, co: ifVal > 0 ? ifVal.toFixed(2) : null, unit: '', color: rowColor(ifVal, plIf), delta: deltaPct(ifVal, plIf) } : null,
                  (isBike && np > 0) ? { label: 'N. Power', pl: null, co: Math.round(np), unit: 'W' } : null,
                  (isBike && power > 0) ? { label: 'Avg Power', pl: null, co: Math.round(power), unit: 'W' } : null,
                  (isBike && workKj > 0) ? { label: 'Work', pl: null, co: Math.round(workKj).toLocaleString(), unit: 'kJ' } : null,
                ].filter(Boolean).filter(r => r.co != null || r.pl != null);

                // ── Min / Avg / Max from per-second records ──
                const recs = chartTraining?.records || [];
                const mamRows = buildWorkoutMamRows({
                  recs, isBike, isRun, isSwim, sport, power, hr, cadence, avgSpeed, unitSystem,
                });

                const hasPlanned = rows.some(r => r.pl != null);
                // Compliance bar marker: 50%→left, 150%→right (100% centred).
                const markerLeft = compliancePct != null ? Math.max(2, Math.min(98, (compliancePct - 50) / 100 * 100)) : null;
                // Show Normalized Power as a 4th KPI on the top strip (bikes only).
                const showNp = isBike && np > 0;
                const kpiNum = showNp ? 'text-[17px]' : 'text-[19px]';

                return (
                  <>
                    {/* Top KPI strip: Duration (green when on plan) · Distance · hrTSS · NP */}
                    <div className={`grid ${showNp ? 'grid-cols-4' : 'grid-cols-3'} items-start gap-2 pt-1`}>
                      <div>
                        <span className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-lg tabular-nums"
                          style={durCompliant ? { backgroundColor: '#dcfce7', border: '1px solid #86efac' } : {}}>
                          <span className={`${kpiNum} font-extrabold`} style={{ color: durCompliant ? '#15803d' : '#1f2937' }}>{fmtDur(dur)}</span>
                        </span>
                      </div>
                      <div className="text-center">
                        <span className={`${kpiNum} font-extrabold text-gray-900 tabular-nums`}>{dist > 0 ? fmtDist(dist) : '—'}</span>
                      </div>
                      <div className={showNp ? 'text-center' : 'text-right'}>
                        <button
                          type="button"
                          onClick={flipTssMode}
                          disabled={!tssToggleable}
                          className={`${showNp ? 'text-center' : 'text-right'} ${tssToggleable ? 'cursor-pointer active:opacity-70' : 'cursor-default'}`}
                          title={tssToggleHint || undefined}
                        >
                          <span className={`${kpiNum} font-extrabold text-gray-900 tabular-nums`}>{tss > 0 ? Math.round(tss) : '—'}</span>
                          <span className={`text-[11px] font-semibold ml-1 ${tssToggleable ? 'text-blue-600' : 'text-gray-400'}`}>
                            {tssLabel}{tssToggleable ? ' ⇄' : ''}
                          </span>
                        </button>
                      </div>
                      {showNp && (
                        <div className="text-right">
                          <span className={`${kpiNum} font-extrabold text-gray-900 tabular-nums`}>{Math.round(np)}</span>
                          <span className="text-[11px] font-semibold ml-1 text-gray-400">NP</span>
                        </div>
                      )}
                    </div>
                    {!tssToggleable && tssToggleHint && (
                      <p className="text-[10px] text-gray-400 text-right leading-snug">{tssToggleHint}</p>
                    )}

                    {/* Compliance bar — TrainingPeaks gauge */}
                    {compliancePct != null && (
                      <div className="pt-1 pb-0.5">
                        <div className="relative">
                          <div className="flex gap-1 h-2.5">
                            <div className="rounded-l-full" style={{ flex: 1, backgroundColor: '#f97316' }} />
                            <div style={{ flex: 1, backgroundColor: '#fbbf24' }} />
                            <div style={{ flex: 1.5, backgroundColor: '#22c55e' }} />
                            <div style={{ flex: 1, backgroundColor: '#fbbf24' }} />
                            <div className="rounded-r-full" style={{ flex: 1, backgroundColor: '#f97316' }} />
                          </div>
                          <div className="absolute top-[-3px] w-[3px] h-[17px] rounded-full bg-gray-900"
                            style={{ left: `${markerLeft}%`, transform: 'translateX(-50%)' }} />
                        </div>
                        <div className="text-center mt-1.5">
                          <div className="text-2xl font-extrabold text-gray-900 leading-none">{compliancePct}%</div>
                          <div className="text-[11px] font-semibold text-gray-400 mt-0.5">Based on Duration</div>
                        </div>
                      </div>
                    )}

                    {/* Planned vs Completed table — hide Planned column when no plan */}
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      {hasPlanned ? (
                        <>
                          <div className="grid grid-cols-[1fr_58px_62px_24px_42px] items-center px-3 py-1.5 bg-gray-50/80">
                            <div />
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wide text-right">Planned</div>
                            <div className="text-[9px] font-bold text-blue-500 uppercase tracking-wide text-right">Completed</div>
                            <div />
                            <div />
                          </div>
                          {rows.map((r, i) => (
                            <div key={r.label} className={`grid grid-cols-[1fr_58px_62px_24px_42px] items-center px-3 py-1.5 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                              <div className="text-[12px] font-semibold text-gray-700">
                                {r.tssToggle ? (
                                  <button type="button" onClick={flipTssMode} disabled={!tssToggleable}
                                    className={`text-left ${tssToggleable ? 'text-blue-600 active:opacity-70' : 'text-gray-700'}`}>
                                    {r.label}{tssToggleable ? ' ⇄' : ''}
                                  </button>
                                ) : r.label}
                              </div>
                              <div className="text-[13px] font-medium text-gray-400 tabular-nums text-right">{r.pl != null ? r.pl : '—'}</div>
                              <div className="text-[13px] font-bold tabular-nums text-right" style={{ color: r.color || '#1f2937' }}>{r.co != null ? r.co : '—'}</div>
                              <div className="text-[9px] text-gray-400 font-medium pl-1">{r.unit}</div>
                              <div className="text-[11px] font-bold tabular-nums text-right" style={{
                                color: r.delta == null ? 'transparent'
                                  : r.delta >= 0 ? (r.color || '#059669')
                                  : (r.color === '#dc2626' ? '#dc2626' : (r.color || '#9ca3af')),
                              }}>
                                {r.delta != null ? `${r.delta >= 0 ? '+' : ''}${r.delta}%` : ''}
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-[1fr_auto_28px] items-center px-3 py-1.5 bg-gray-50/80">
                            <div />
                            <div className="text-[9px] font-bold text-blue-500 uppercase tracking-wide text-right">Completed</div>
                            <div />
                          </div>
                          {rows.map((r, i) => (
                            <div key={r.label} className={`grid grid-cols-[1fr_auto_28px] items-center px-3 py-1.5 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                              <div className="text-[12px] font-semibold text-gray-700">
                                {r.tssToggle ? (
                                  <button type="button" onClick={flipTssMode} disabled={!tssToggleable}
                                    className={`text-left ${tssToggleable ? 'text-blue-600 active:opacity-70' : 'text-gray-700'}`}>
                                    {r.label}{tssToggleable ? ' ⇄' : ''}
                                  </button>
                                ) : r.label}
                              </div>
                              <div className="text-[13px] font-bold tabular-nums text-right text-gray-900">{r.co != null ? r.co : '—'}</div>
                              <div className="text-[9px] text-gray-400 font-medium pl-1">{r.unit}</div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>

                    {/* Workout Metrics — Min / Avg / Max */}
                    {mamRows.length > 0 && (
                      <div>
                        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1 px-1">Workout Metrics</div>
                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                          <div className="grid grid-cols-[1fr_52px_52px_52px_30px] items-center px-3 py-1.5 bg-gray-50/80">
                            <div></div>
                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide text-right">Min</div>
                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide text-right">Avg</div>
                            <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide text-right">Max</div>
                            <div></div>
                          </div>
                          {mamRows.map((r, i) => (
                            <div key={r.label} className={`grid grid-cols-[1fr_52px_52px_52px_30px] items-center px-3 py-1.5 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                              <div className="text-[12px] font-semibold text-gray-700">{r.label}</div>
                              <div className="text-[13px] font-medium text-gray-600 tabular-nums text-right">{formatMamValue(r, r.d.min)}</div>
                              <div className="text-[13px] font-bold text-gray-800 tabular-nums text-right">{formatMamValue(r, r.d.avg)}</div>
                              <div className="text-[13px] font-medium text-gray-600 tabular-nums text-right">{formatMamValue(r, r.d.max)}</div>
                              <div className="text-[9px] text-gray-400 font-medium pl-1">{r.unit}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* RPE + Lactate chips */}
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
                  </>
                );
              })()}

              {/* Category */}
              <div className="flex items-center gap-2 px-1 pt-0.5">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Category</span>
                <CategoryPicker value={merged.category || null} onChange={handleCategoryChange} />
              </div>
            </div>

            {/* Map · Training Overview · Time-in-zones moved → Map/Graph tab */}

            {/* Description / notes */}
            {(notes || planComment || planDescription) && (
              <div className="px-4 py-3 space-y-2 border-b border-gray-50">
                {planComment && (
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Comment</div>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{planComment}</p>
                  </div>
                )}
                {planDescription && (
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Planned description</div>
                    <p className="text-sm text-gray-600 whitespace-pre-line">{planDescription}</p>
                  </div>
                )}
                {notes && (
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Completed notes</div>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Comments */}
            {commentsTarget.trainingId && (
            <div className="px-4 py-4 border-b border-gray-100">
              <TrainingComments
                trainingId={commentsTarget.trainingId}
                trainingType={commentsTarget.trainingType}
                isMobile={true}
              />
            </div>
            )}

            {/* Planned section moved → Edit tab. Quick "Add planned" shortcut
                when there's no plan yet, so Summary doesn't lose discoverability. */}
            {!plannedWorkout && (
              <div className="px-4 py-3 border-t border-gray-100">
                <button onClick={() => { setEditingPlanned(true); setMobileView('edit'); }}
                  className="w-full text-sm font-semibold px-4 py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-500 active:bg-gray-50">
                  + Add planned workout
                </button>
              </div>
            )}

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

        {/* ── MAP / GRAPH TAB ── */}
        {mobileView === 'mapgraph' && (
          <div className="flex-1 min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Route Map */}
            {gpsData.length > 0 && (
              <div className="border-b border-gray-50">
                <div className="relative overflow-hidden" style={{ height: 260 }}>
                  <MapContainer
                    key={`modal-map-mg-${gpsData[0]?.[0]}-${gpsData[0]?.[1]}`}
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

            {/* Graph */}
            {detailLoading ? (
              <div className="px-4 py-3 border-b border-gray-50">
                <div className="rounded-xl bg-gray-100 animate-pulse" style={{ height: 160 }} />
              </div>
            ) : chartTraining?.records?.length > 0 ? (
              <div className="px-4 py-3 border-b border-gray-50">
                {peaksFocus && (
                  <div className="mb-2 flex items-center justify-between px-3 py-2 rounded-xl bg-violet-50 border border-violet-100">
                    <span className="text-[12px] text-violet-800">
                      Peak at <strong>{peaksFocus.label}</strong>
                    </span>
                    <button type="button" onClick={() => setPeaksFocus(null)} className="text-[11px] font-semibold text-violet-600 px-3 py-1 rounded-lg hover:bg-violet-100 active:bg-violet-200" style={{ touchAction: 'manipulation' }}>
                      Dismiss
                    </button>
                  </div>
                )}
                {isSyntheticData && (
                  <div className="flex justify-end mb-2">
                    <button onClick={refreshStreams} disabled={streamsRefreshing}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 border border-amber-200 text-amber-700 active:bg-amber-100 disabled:opacity-60">
                      <svg className={`w-3 h-3 ${streamsRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      {streamsRefreshing ? 'Loading…' : 'Reload streams'}
                    </button>
                  </div>
                )}
                <TrainingChart
                  training={chartTraining}
                  user={null}
                  userProfile={null}
                  onHover={() => {}}
                  onLeave={() => {}}
                  highlightMetric={highlightMetric}
                  radarWatts={radarWatts}
                  focusTimeSec={peaksFocus?.focusTimeSec ?? null}
                  focusWindowSec={peaksFocus?.focusWindowSec ?? null}
                  focusLabel={peaksFocus?.label ?? null}
                  focusMetric={peaksFocus?.metric ?? null}
                  onFocusDismiss={() => setPeaksFocus(null)}
                />
              </div>
            ) : laps.length > 0 ? (
              <div className="px-4 py-3 border-b border-gray-50">
                <LapChart laps={laps} color={color} isBike={isBike} isRun={isRun} isSwim={isSwim} unitSystem={unitSystem} selectedLap={null} onSelectLap={() => {}} chartScrollRef={{ current: null }} onScrollCenter={() => {}} records={chartTraining?.records} />
              </div>
            ) : (
              <div className="px-4 py-10 text-center text-sm text-gray-400">No graph data available</div>
            )}

            {isRun && (
              <RunSplitsTable
                laps={laps}
                records={chartTraining?.records || []}
                lapTimeSource={isStravaActivity ? 'strava' : 'fit'}
                unitSystem={unitSystem}
              />
            )}

            {/* Time in zones */}
            {chartTraining?.records?.length > 30 && (
              <TimeInZonesBar records={chartTraining.records} sport={merged?.sport} authUser={authUser} />
            )}

            {/* Entire Workout — extended stats + Min/Avg/Max */}
            {chartTraining?.records?.length > 5 && (() => {
              const recs = chartTraining.records;
              const hrs = dur > 0 ? dur / 3600 : 0;
              const ifVal = (tss > 0 && hrs > 0) ? Math.sqrt(tss / (100 * hrs)) : 0;
              const workKj = Number(merged.kilojoules || merged.work || 0) || (power > 0 && dur > 0 ? (power * dur / 1000) : 0);
              // Elevation gain/loss from altitude record deltas.
              let gain = 0, loss = 0;
              for (let i = 1; i < recs.length; i++) {
                const a0 = recs[i - 1].altitude, a1 = recs[i].altitude;
                if (a0 != null && a1 != null) { const d = a1 - a0; if (d > 0) gain += d; else loss -= d; }
              }
              if (gain < 1 && elevation > 0) gain = elevation;
              const mamRows = buildWorkoutMamRows({
                recs, isBike, isRun, isSwim, sport, power, hr, cadence, avgSpeed, includeElevation: true, unitSystem,
              });
              const facts = [
                workKj > 0 ? { k: 'Work', v: `${Math.round(workKj).toLocaleString()} kJ` } : null,
                ifVal > 0 ? { k: 'IF', v: ifVal.toFixed(2) } : null,
                gain > 0 ? { k: 'El. Gain', v: formatElevation(gain, unitSystem).formatted } : null,
                loss > 0 ? { k: 'El. Loss', v: formatElevation(loss, unitSystem).formatted } : null,
              ].filter(Boolean);
              return (
                <div className="px-4 py-3">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Entire Workout</div>
                  {facts.length > 0 && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
                      {facts.map(f => (
                        <div key={f.k} className="flex items-baseline justify-between border-b border-gray-50 pb-1">
                          <span className="text-[12px] text-gray-500">{f.k}</span>
                          <span className="text-[13px] font-bold text-gray-800 tabular-nums">{f.v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {mamRows.length > 0 && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="grid grid-cols-[1fr_52px_52px_52px_30px] items-center px-3 py-1.5 bg-gray-50/80">
                        <div></div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase text-right">Min</div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase text-right">Avg</div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase text-right">Max</div>
                        <div></div>
                      </div>
                      {mamRows.map((r, i) => (
                        <div key={r.label} className={`grid grid-cols-[1fr_52px_52px_52px_30px] items-center px-3 py-1.5 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                          <div className="text-[12px] font-semibold text-gray-700">{r.label}</div>
                          <div className="text-[13px] font-medium text-gray-600 tabular-nums text-right">{formatMamValue(r, r.d.min)}</div>
                          <div className="text-[13px] font-bold text-gray-800 tabular-nums text-right">{formatMamValue(r, r.d.avg)}</div>
                          <div className="text-[13px] font-medium text-gray-600 tabular-nums text-right">{formatMamValue(r, r.d.max)}</div>
                          <div className="text-[9px] text-gray-400 font-medium pl-1">{r.unit}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── PEAKS TAB ── */}
        {mobileView === 'peaks' && chartTraining?.records?.length > 10 && (
          <ActivityPeaksTab
            records={chartTraining.records}
            sport={merged?.sport || sport}
            authUser={authUser}
            durationSec={dur}
            onPeakFocus={(sel) => {
              if (sel?.type === 'peak' && sel.focusTimeSec != null) {
                setPeaksFocus({
                  focusTimeSec: sel.focusTimeSec,
                  focusWindowSec: sel.seconds,
                  metric: sel.metric,
                  label: sel.label,
                });
              } else {
                setPeaksFocus(null);
              }
            }}
            onNavigateToGraph={(sel) => {
              if (sel?.type === 'peak' && sel.focusTimeSec != null) {
                setPeaksFocus({
                  focusTimeSec: sel.focusTimeSec,
                  focusWindowSec: sel.seconds,
                  metric: sel.metric,
                  label: sel.label,
                });
                setMobileView('mapgraph');
              }
            }}
          />
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
                      {autoLapsUnsaved ? (
                        <button
                          disabled={savingLapsSet}
                          onClick={async () => {
                            try { await saveAutoLapsSet(autoLaps); }
                            catch (e) {
                              console.error('Save auto-lap set failed:', e);
                              // eslint-disable-next-line no-alert
                              window.alert(e?.response?.data?.error || e?.message || 'Could not save laps.');
                            }
                          }}
                          className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white active:bg-emerald-700 disabled:opacity-50 touch-manipulation flex items-center gap-1"
                          style={{ WebkitTapHighlightColor: 'transparent' }}>
                          {savingLapsSet ? 'Saving…' : 'Save laps'}
                        </button>
                      ) : (persistedAutoLaps.length >= 2 && (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">✓ Saved</span>
                      ))}
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
                        disabled={savingLapsSet}
                        onClick={async () => {
                          setAutoLaps(null); setSelectedLap(null); setAutoLapLactates({}); setAutoLapLaInput(null);
                          // If a saved set exists, clear it too so the activity
                          // reverts to its device laps on the next open.
                          if (persistedAutoLaps.length) {
                            try { await saveAutoLapsSet([]); }
                            catch (e) { console.error('Clear saved laps failed:', e); }
                          }
                        }}
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-gray-200 bg-white text-gray-400 active:bg-gray-100 disabled:opacity-50 flex items-center gap-0.5">
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
              <LapChart laps={autoLaps ?? laps} color={color} isBike={isBike} isRun={isRun} isSwim={isSwim} unitSystem={unitSystem}
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
                  const paceHeader = isBike ? 'Pwr' : paceUnitShort(unitSystem, isSwim ? 'swim' : 'run');
                  return (
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="grid text-[11px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 px-3 py-2 border-b border-gray-100"
                        style={{ gridTemplateColumns: cols }}>
                        <span>#</span>
                        <span className="text-right">Time</span>
                        <span className="text-right">Dist</span>
                        {(hasPower || hasPace) && <span className="text-right">{paceHeader}</span>}
                        <span className="text-right">HR</span>
                        {hasCadence && <span className="text-right">{isSwim ? 'SPM' : cadenceDisplayUnit(sport)}</span>}
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
                          const lapCadRaw = Number(lap.average_cadence || lap.avgCadence || lap.avg_cadence || 0);
                          const lapCad = lapCadRaw > 0
                            ? (isStravaActivity ? (stravaHalfCadenceToSpm(lapCadRaw, sport) ?? Math.round(lapCadRaw)) : Math.round(lapCadRaw))
                            : 0;
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
                            if (spd > 0) lapPaceStr = formatPaceFromSpeedMps(spd, unitSystem, 'swim');
                          } else if (isRun && lapDist > 0 && lapMoving > 0) {
                            lapPaceStr = formatPaceFromDistanceAndDuration(lapDist, lapMoving, unitSystem, 'run');
                            const secPerKm = lapMoving / (lapDist / 1000);
                            if (isRestLap && secPerKm > 480) paceIsNormal = false;
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
                              <span className="text-right tabular-nums text-gray-500">{lapDist > 0 ? formatDistance(lapDist, unitSystem).formatted : '—'}</span>
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
            {renderPlannedVsCompletedEditor({
              mobile: true,
              onCancel: () => { setDurationPickerField(null); setMobileView('summary'); },
              onSaved: () => { setDurationPickerField(null); setMobileView('summary'); },
            })}
            <div className="px-4 pb-6">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Category</div>
              <CategoryPicker value={merged.category || null} onChange={handleCategoryChange} />
            </div>
          </div>
        )}

      </div>,
      document.getElementById('app-modal-root') || document.body
    );
    return <>
      {mobilePortal}
      <ActivityShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        activity={merged}
        gpsPoints={gpsData}
        laps={laps}
        records={chartTraining?.records}
        accent={color}
      />
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
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" style={{ pointerEvents: shareOpen ? 'none' : 'auto' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <SportIcon sport={a.sport} className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-900 text-base leading-snug break-words">{displayTitle}</div>
            <div className="text-xs text-gray-400 mt-0.5">{dateStr}</div>
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
          {/* Edit the completed activity (title / distance / duration / TSS …) */}
          <button
            onClick={() => setEditingCompleted(v => !v)}
            title="Edit activity details"
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex-shrink-0 transition-colors ${
              editingCompleted ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}>
            <PencilIcon className="w-4 h-4" />
            <span>Edit</span>
          </button>
          {onOpenFull && (
            <button onClick={onOpenFull} title="Open full activity" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
              <ArrowTopRightOnSquareIcon className="w-5 h-5" />
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
            {/* TSS — tap to switch Power / hr when both are available */}
            <button
              type="button"
              onClick={flipTssMode}
              disabled={!tssToggleable}
              className={`rounded-xl bg-gray-50 px-3 py-2 flex flex-col text-left ${tssToggleable ? 'hover:bg-gray-100 active:bg-gray-200' : ''}`}
              title={tssToggleHint || undefined}
            >
              <span className={`text-[9px] font-bold uppercase tracking-wide leading-none ${tssToggleable ? 'text-blue-600' : 'text-gray-400'}`}>
                {tssLabel}{tssToggleable ? ' ⇄' : ''}
              </span>
              <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{tss > 0 ? Math.round(tss) : '—'}</span>
            </button>
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
                <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{formatSpeed(avgSpeed, unitSystem).formatted}</span>
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
                <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{fmtElev(elevation)}</span>
              </div>
            )}
            {cadence > 0 && (
              <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">{isSwim ? 'SPM' : 'Cad'}</span>
                <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{Math.round(cadence)}</span>
              </div>
            )}
            {calories > 0 && (
              <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col">
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">Calories</span>
                <span className="text-sm font-bold text-gray-800 tabular-nums mt-0.5">{Math.round(calories).toLocaleString()}<span className="text-[10px] font-semibold text-gray-400 ml-0.5">kcal</span></span>
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

          {/* ── Inline edit panel (completed activity) ── */}
          {editingCompleted && renderPlannedVsCompletedEditor({
            onCancel: () => setEditingCompleted(false),
            onSaved: () => setEditingCompleted(false),
          })}

          {/* ── Description + notes ── */}
          {(notes || planComment || planDescription) && (
            <div className="px-5 py-3 border-b border-gray-50 flex flex-wrap gap-4">
              {planComment && (
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Comment</div>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{planComment}</p>
                </div>
              )}
              {planDescription && (
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Planned description</div>
                  <p className="text-sm text-gray-600 whitespace-pre-line">{planDescription}</p>
                </div>
              )}
              {notes && (
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Completed notes</div>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{notes}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Comments ── */}
          {commentsTarget.trainingId && (
          <div className="px-5 py-4 border-b border-gray-100">
            <TrainingComments
              trainingId={commentsTarget.trainingId}
              trainingType={commentsTarget.trainingType}
            />
          </div>
          )}

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
                focusTimeSec={peaksFocus?.focusTimeSec ?? null}
                focusWindowSec={peaksFocus?.focusWindowSec ?? null}
                focusLabel={peaksFocus?.label ?? null}
                focusMetric={peaksFocus?.metric ?? null}
                onFocusDismiss={() => setPeaksFocus(null)}
              />
            </div>
          ) : null}

          {isRun && (
            <RunSplitsTable
              laps={laps}
              records={chartTraining?.records || []}
              lapTimeSource={isStravaActivity ? 'strava' : 'fit'}
              unitSystem={unitSystem}
              className="px-5"
            />
          )}

          {/* ── Lap chart — sticky on desktop so the bars stay visible
              while the user scrolls through the laps table below. Mobile
              keeps natural flow (sticky steals too much height). ── */}
          {laps.length > 1 && (
            <div className="border-b border-gray-50 md:sticky md:top-0 md:z-10 bg-white">
              <LapChart
                laps={laps} color={color} isBike={isBike} isRun={isRun} isSwim={isSwim} unitSystem={unitSystem}
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
                const paceHeader = isBike ? 'Pwr' : paceUnitShort(unitSystem, isSwim ? 'swim' : 'run');
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
                          if (spd > 0) lapPaceStr = formatPaceFromSpeedMps(spd, unitSystem, 'swim');
                        } else if (isRun) {
                          if (lapDist > 0 && lapDur > 0) {
                            lapPaceStr = formatPaceFromDistanceAndDuration(lapDist, lapDur, unitSystem, 'run');
                            const secPerKm = lapDur / (lapDist / 1000);
                            if (isRestLap && secPerKm > 480) paceIsNormal = false;
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
                            <span className="text-gray-500 text-right tabular-nums">{lapDist > 0 ? formatDistance(lapDist, unitSystem).formatted : '—'}</span>
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
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{plannedWorkout && !editingPlanned && dur > 0 ? 'Planned vs Completed' : 'Planned'}</span>
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
                      onBlur={() => {
                        const metres = parsePlanDistanceToMetres(planForm.distanceDisplay);
                        if (metres != null && metres > 0) {
                          setPlanForm(p => ({
                            ...p,
                            distanceKm: formatDistanceInputFromMetres(metres, unitSystem, { isSwim: isSwimForm }),
                            distanceDisplay: formatDistanceFieldDisplay(metres, unitSystem, { isSwim: isSwimForm }),
                          }));
                        }
                      }}
                      placeholder={dist > 0 ? formatDistance(dist, unitSystem).formatted : distanceInputPlaceholder(unitSystem, isSwimForm)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Planned description</label>
                  <textarea value={planForm.description} onChange={e => setPlanForm(p => ({ ...p, description: e.target.value }))} placeholder="Workout plan, intervals, coach instructions…" rows={3}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 resize-none" />
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
                  {/* Planned vs Completed comparison — TrainingPeaks-style two
                      columns so the athlete/coach sees target vs actual at a glance. */}
                  {(() => {
                    const fmtPaceDD = (distM, durS) => {
                      if (!(distM > 0 && durS > 0)) return '—';
                      const full = formatPaceFromDistanceAndDuration(distM, durS, unitSystem, isSwim ? 'swim' : 'run');
                      return full ? full.replace(/\s*\/\s*\S+$/, '').trim() : '—';
                    };
                    const stripUnit = (s) => (s ? s.replace(/\s*\/\s*\S+$/, '').trim() : '—');
                    const rows = [];
                    rows.push(['Duration', plannedDur > 0 ? fmtDur(plannedDur) : '—', dur > 0 ? fmtDur(dur) : '—']);
                    if (plannedDist > 0 || dist > 0) {
                      rows.push(['Distance', plannedDist > 0 ? fmtDist(plannedDist) : '—', dist > 0 ? fmtDist(dist) : '—']);
                    }
                    if (isBike) {
                      if (power > 0) rows.push(['Avg Power', '—', `${Math.round(power)} W`]);
                    } else if (isRun || isSwim) {
                      rows.push([`Pace ${paceUnitShort(unitSystem, isSwim ? 'swim' : 'run')}`, fmtPaceDD(plannedDist, plannedDur), stripUnit(paceStr)]);
                    }
                    if (plannedTss > 0 || tss > 0) {
                      rows.push(['TSS', plannedTss > 0 ? String(Math.round(plannedTss)) : '—', tss > 0 ? String(Math.round(tss)) : '—']);
                    }
                    if (hr > 0) rows.push(['Avg HR', '—', `${Math.round(hr)} bpm`]);
                    return (
                      <div className="w-full sm:w-auto sm:min-w-[280px] rounded-xl border border-gray-100 overflow-hidden">
                        <div className="grid grid-cols-[1fr_5.5rem_5.5rem] bg-gray-50 border-b border-gray-100 text-[9px] font-bold uppercase tracking-wide text-gray-400">
                          <span className="px-3 py-1.5">&nbsp;</span>
                          <span className="px-3 py-1.5 text-right">Planned</span>
                          <span className="px-3 py-1.5 text-right text-emerald-600">Completed</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {rows.map(([label, p, c]) => (
                            <div key={label} className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center text-[11px]">
                              <span className="px-3 py-2 text-gray-500 font-medium">{label}</span>
                              <span className="px-3 py-2 text-right tabular-nums text-gray-500">{p}</span>
                              <span className="px-3 py-2 text-right tabular-nums font-bold text-gray-800">{c}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
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
    <ActivityShareSheet
      open={shareOpen}
      onClose={() => setShareOpen(false)}
      activity={merged}
      gpsPoints={gpsData}
      laps={laps}
      records={chartTraining?.records}
      accent={color}
    />
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
  const { user: authUser } = useAuth() || {};
  const unitSystem = userUnitSystem(authUser);
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

  // Duration first — plannedDur heal needs completed seconds.
  const dur = Number(
    a.duration || a.elapsed_time || a.movingTime || a.moving_time ||
    a.totalTimerTime || a.totalElapsedTime || a.elapsedTime || 0
  );

  // Planned vs completed — computed early so POPUP_W/H can depend on hasPlanned
  const plannedDur = plannedWorkout ? plannedWorkoutDurationSecs(plannedWorkout, dur) : 0;
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
  const isBike = sport.includes('ride') || sport.includes('cycl') || sport.includes('bike');

  const fmtDur = (s) => s > 0
    ? `${Math.floor(s/3600)}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`
    : '-';
  const durStr = fmtDur(dur);

  const dist = Number(a.distance || a.totalDistance || 0);
  const distStr = dist > 0 ? formatDistance(dist, unitSystem).formatted : '-';

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
    paceStr = formatPaceFromSpeedMps(avgSpeed, unitSystem, 'run');
  } else if (isSwim && avgSpeed > 0) {
    paceStr = formatPaceFromSpeedMps(avgSpeed, unitSystem, 'swim');
  } else if (isRun && dist > 0 && dur > 0) {
    paceStr = formatPaceFromDistanceAndDuration(dist, dur, unitSystem, 'run');
  } else if (isSwim && dist > 0 && dur > 0) {
    paceStr = formatPaceFromDistanceAndDuration(dist, dur, unitSystem, 'swim');
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
    ...(elevation > 0 ? [{ label: 'Elevation', value: formatElevation(elevation, unitSystem).formatted }] : []),
    ...(cadence > 0   ? [{ label: isSwim ? 'Strokes/min' : 'Cadence', value: `${Math.round(cadence)}` }] : []),
  ];

  const fmtDurShort = (s) => {
    if (!s) return '—';
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}` : `${m}m`;
  };

  const complianceRow = hasPlanned && plannedDur < 24 * 3600 && dur > 0 ? getCompliance(plannedDur, dur) : null;
  const plannedDistFmt = plannedDist > 0 ? distDisplayParts(plannedDist, unitSystem) : { val: null, unit: '' };
  const completedDistFmt = dist > 0 ? distDisplayParts(dist, unitSystem) : { val: null, unit: '' };
  const compRows = hasPlanned ? [
    { label: 'Duration', planned: fmtDurShort(plannedDur), completed: fmtDurShort(dur), unit: 'h:mm' },
    ...(plannedDist > 0 || dist > 0 ? [{ label: 'Distance', planned: plannedDistFmt.val || '—', completed: completedDistFmt.val || '—', unit: completedDistFmt.unit || plannedDistFmt.unit || '' }] : []),
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

function AddCompletedSheet({ date, onClose, onSaved, athleteId, onPlanWorkout, initialStep = null, onAddDayTheme = null, onAddPeriod = null, user = null }) {
  const sheetUnitSystem = userUnitSystem(user);
  // step: 'menu' (when plan option available) | 'pick' | 'manual' | 'fit' | 'race'
  const [step, setStep]     = useState(initialStep || (onPlanWorkout ? 'menu' : 'pick'));
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

  // ── Race / goal event form (from the day "+" → Plan a race, or header + Race)
  const [raceForm, setRaceForm] = useState({ name: '', date: dateStr || '', sport: 'run', priority: 'A', targetCTL: '' });
  const handleRaceSubmit = async () => {
    if (!raceForm.name || !raceForm.date) return;
    setSaving(true);
    try {
      const { createRaceEvent } = await import('../../services/api.js');
      await createRaceEvent({
        name: raceForm.name.trim(),
        date: raceForm.date,
        sport: raceForm.sport,
        priority: raceForm.priority,
        targetCTL: raceForm.targetCTL ? Number(raceForm.targetCTL) : null,
      }, athleteId || undefined);
      onSaved?.();
      onClose();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

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
      const dist = parseDistanceInputToMetres(form.distanceKm, sheetUnitSystem, { isSwim: String(form.sport).includes('swim') }) || 0;
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
                <button
                  onClick={() => setStep('race')}
                  className="flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 bg-gray-50 active:bg-gray-100 touch-manipulation text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21V5a2 2 0 012-2h11l-2 4 2 4H5" /></svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">Plan a race</div>
                    <div className="text-[11px] text-gray-400">Add a race / goal event to this day</div>
                  </div>
                </button>
                {onAddDayTheme && (
                  <button
                    onClick={() => { onClose(); setTimeout(() => onAddDayTheme(dateStr), 50); }}
                    className="flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 bg-gray-50 active:bg-gray-100 touch-manipulation text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 text-lg">🎯</div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">Day theme</div>
                      <div className="text-[11px] text-gray-400">Tag this day (LT2, Recovery, …)</div>
                    </div>
                  </button>
                )}
                {onAddPeriod && (
                  <button
                    onClick={() => { onClose(); setTimeout(() => onAddPeriod(dateStr), 50); }}
                    className="flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 bg-gray-50 active:bg-gray-100 touch-manipulation text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0 text-lg">🏝️</div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">Period</div>
                      <div className="text-[11px] text-gray-400">Vacation, training camp, work trip…</div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step: race ── */}
          {step === 'race' && (
            <div className="px-5 pb-8 pt-2">
              <div className="flex items-center justify-between mb-1">
                <button onClick={() => setStep('menu')} className="text-xs text-gray-400 flex items-center gap-1">
                  <ChevronLeftIcon className="w-3.5 h-3.5" />Back
                </button>
                <h2 className="text-base font-bold text-gray-800">Plan a race</h2>
                <div className="w-10" />
              </div>
              <p className="text-xs text-gray-400 mb-4">{date?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              <div className="flex flex-col gap-3">
                <input
                  autoFocus placeholder="Race name" value={raceForm.name}
                  onChange={e => setRaceForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 outline-none focus:border-primary/40"
                />
                <input
                  type="date" value={raceForm.date}
                  onChange={e => setRaceForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 outline-none focus:border-primary/40"
                />
                <div className="flex gap-3">
                  <select value={raceForm.sport} onChange={e => setRaceForm(f => ({ ...f, sport: e.target.value }))}
                    className="flex-1 text-sm px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 outline-none">
                    {['run', 'bike', 'swim', 'triathlon', 'hyrox', 'other'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={raceForm.priority} onChange={e => setRaceForm(f => ({ ...f, priority: e.target.value }))}
                    className="flex-1 text-sm px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 outline-none">
                    <option value="A">A — goal</option>
                    <option value="B">B race</option>
                    <option value="C">C race</option>
                  </select>
                </div>
                <input
                  type="number" placeholder="Target CTL (optional)" value={raceForm.targetCTL}
                  onChange={e => setRaceForm(f => ({ ...f, targetCTL: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 outline-none focus:border-primary/40"
                />
                <button
                  onClick={handleRaceSubmit}
                  disabled={saving || !raceForm.name}
                  className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Add race'}
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
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">
                    Distance ({distanceInputUnitLabel(sheetUnitSystem, String(form.sport).includes('swim'))})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.distanceKm}
                    onChange={e => set('distanceKm', sanitizeDecimalInput(e.target.value))}
                    placeholder="0.0"
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

function WeekSummaryCell({ weekSummary, formatHours, formatKm, user, tab = 'done', weekPlannedWorkouts = [], large = false }) {
  if (!weekSummary) return <div className="bg-gray-50 p-2.5 min-h-[145px] min-w-[150px]" />;

  const { totalSeconds, totalTSS, runSeconds, bikeSeconds, swimSeconds, strengthSeconds,
    distanceRun, distanceBike, distanceSwim, tssRun, tssBike, tssSwim, tssStrength,
    volumeChange, plannedSeconds, plannedTSS } = weekSummary;

  const hasPlan = plannedSeconds > 0;
  const completionPct = hasPlan ? Math.min(100, Math.round((totalSeconds / plannedSeconds) * 100)) : null;

  // `large` = full-width mobile Calendar tab → bigger, more readable text.
  // Default (false) keeps the compact sizes used in the narrow desktop grid.
  const L = large;
  const cls = {
    pad:    L ? 'p-4'         : 'p-2.5',
    gap:    L ? 'gap-2.5'     : 'gap-2',
    big:    L ? 'text-3xl'    : 'text-lg',
    prefix: L ? 'text-base'   : 'text-xs',
    tss:    L ? 'text-lg'     : 'text-sm',
    micro:  L ? 'text-xs'     : 'text-[10px]',
    label:  L ? 'text-sm'     : 'text-[11px]',
    rowH:   L ? 'text-base'   : 'text-[11px]',
    rowSub: L ? 'text-sm'     : 'text-[10px]',
    icon:   L ? 'w-5 h-5'     : 'w-4 h-4',
    rows:   L ? 'space-y-2.5' : 'space-y-1',
    bar:    L ? 'h-2.5'       : 'h-2',
    fire:   L ? 'w-4 h-4'     : 'w-3.5 h-3.5',
    arrow:  L ? 'w-6 h-6'     : 'w-5 h-5',
    sportW: L ? 'w-16'        : 'w-16',
  };

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
      bySport[sport].secs += plannedWorkoutDurationSecs(pw);
      bySport[sport].dist += pw.plannedDistance || 0;
      bySport[sport].tss  += pw.targetTss || 0;
    });

    const sportRows = Object.entries(bySport).filter(([, v]) => v.secs > 0 || v.dist > 0);
    const totalSecs = sportRows.reduce((s, [, v]) => s + v.secs, 0);
    const totalTssP = sportRows.reduce((s, [, v]) => s + v.tss, 0);

    return (
      <div className={`bg-gray-50 ${cls.pad} border-l-4 border-primary/30 ${L ? 'min-h-[240px]' : 'min-h-[145px]'} min-w-[150px] flex flex-col ${cls.gap}`}>
        {/* Totals */}
        <div className="flex items-baseline gap-1.5 leading-tight">
          <span className={`${cls.big} font-extrabold text-gray-900`}>{formatHours(totalSecs || plannedSeconds)}</span>
          {totalTssP > 0 && (
            <span className={`${cls.label} font-bold text-primary`}>{Math.round(totalTssP)} TSS</span>
          )}
        </div>
        {sportRows.length === 0 ? (
          <span className={`${cls.label} text-gray-400 flex-1 flex items-center`}>No plan</span>
        ) : (
          <div className={`${cls.rows} flex-1`}>
            {sportRows.map(([sport, v]) => {
              const meta = SPORT_META[sport] || SPORT_META.other;
              return (
                <div key={sport} className="flex items-center gap-2">
                  <SportIcon sport={sport} className={`${cls.icon} flex-shrink-0`} />
                  <span className={`${cls.label} font-semibold text-gray-500 ${cls.sportW} shrink-0 truncate`}>{meta.label}</span>
                  <span className={`${cls.rowH} font-bold text-gray-800 flex-1`}>{formatHours(v.secs)}</span>
                  {v.dist > 0 && <span className={`${cls.rowSub} text-gray-400 shrink-0`}>{formatKm(v.dist)}</span>}
                  {v.tss > 0 && <span className={`${cls.rowSub} font-bold shrink-0`} style={{ color: meta.color }}>{Math.round(v.tss)}</span>}
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
    <div className={`bg-gray-50 ${cls.pad} border-l-4 border-primary/30 ${L ? 'min-h-[240px]' : 'min-h-[145px]'} min-w-[150px] flex flex-col ${cls.gap}`}>
      {/* Total time: actual vs planned */}
      <div className="flex items-start justify-between gap-1">
        <div>
          {hasPlan ? (
            <div className="flex items-baseline gap-1.5 leading-tight">
              <span className={`${cls.prefix} font-medium text-gray-400`}>{formatHours(plannedSeconds)}</span>
              <span className={`${cls.big} font-extrabold text-gray-900`}>{formatHours(totalSeconds)}</span>
            </div>
          ) : (
            <div className={`${cls.big} font-extrabold text-gray-900 leading-tight`}>{formatHours(totalSeconds)}</div>
          )}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {totalTSS > 0 && (
              <div className="flex items-center gap-0.5">
                <FireIcon className={`${cls.fire} text-primary`} />
                <span className={`${cls.tss} font-bold text-primary`}>{Math.round(totalTSS)}</span>
                {plannedTSS > 0 && <span className={`${cls.micro} text-gray-400`}>/{Math.round(plannedTSS)}</span>}
                <span className={`${cls.micro} text-gray-400`}>TSS</span>
              </div>
            )}
            {completionPct !== null && (
              <span className={`${cls.micro} font-bold px-1.5 py-0.5 rounded-full ${completionPct >= 100 ? 'bg-green-100 text-green-600' : completionPct >= 70 ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-400'}`}>
                {completionPct}%
              </span>
            )}
          </div>
        </div>
        {volumeChange && (
          <span className="mt-0.5 flex-shrink-0">
            {volumeChange === 'up' && <ArrowUpIcon className={`${cls.arrow} text-green-500`} />}
            {volumeChange === 'down' && <ArrowDownIcon className={`${cls.arrow} text-red-500`} />}
            {volumeChange === 'same' && <MinusIcon className={`${cls.arrow} text-gray-400`} />}
          </span>
        )}
      </div>

      {/* Progress bar: actual / planned */}
      {hasPlan && (
        <div className={`${cls.bar} bg-gray-200 rounded-full overflow-hidden`}>
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
        <div className={`flex ${cls.bar} rounded-full overflow-hidden gap-px`}>
          {bikeRatio > 0 && <div style={{ width: `${bikeRatio*100}%`, backgroundColor: SPORT_COLORS_CELL.bike }} className="rounded-full" />}
          {runRatio  > 0 && <div style={{ width: `${runRatio*100}%`,  backgroundColor: SPORT_COLORS_CELL.run }} className="rounded-full" />}
          {swimRatio > 0 && <div style={{ width: `${swimRatio*100}%`, backgroundColor: SPORT_COLORS_CELL.swim }} className="rounded-full" />}
          {(1 - bikeRatio - runRatio - swimRatio) > 0.01 && (
            <div style={{ flex: 1, backgroundColor: '#9ca3af' }} className="rounded-full" />
          )}
        </div>
      )}

      {/* Per-sport rows */}
      <div className={`${cls.rows} flex-1`}>
        {sports.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <SportIcon sport={s.key} className={`${cls.icon} flex-shrink-0`} />
            <span className={`${cls.rowH} font-semibold text-gray-700 flex-1 truncate`}>{formatHours(s.seconds)}</span>
            {s.dist > 0 && <span className={`${cls.rowSub} text-gray-400 flex-shrink-0`}>{formatKm(s.dist)}</span>}
            {s.tss > 0 && <span className={`${cls.rowSub} font-bold text-primary flex-shrink-0`}>{Math.round(s.tss)}</span>}
          </div>
        ))}
        {strengthSeconds > 0 && (
          <div className="flex items-center gap-2">
            <SportIcon sport="strength" className={`${cls.icon} flex-shrink-0`} />
            <span className={`${cls.rowH} font-semibold text-gray-700 flex-1`}>{formatHours(strengthSeconds)}</span>
            {tssStrength > 0 && <span className={`${cls.rowSub} font-bold text-primary flex-shrink-0`}>{Math.round(tssStrength)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DayPlanEditSheet — bottom sheet to assign / clear a day-level theme ───
// Lightweight (no FIT pickers, no steps), portal'd so it sits above the
// activity modal stack. Used by the mobile day-list header.
export function DayPlanEditSheet({ date, plan, onClose, onSave, onDelete }) {
  const { categories } = useCategories();
  const [title, setTitle]       = useState(plan?.title || '');
  const [category, setCategory] = useState(plan?.category || null);
  const [notes, setNotes]       = useState(plan?.notes || '');
  // Weekly repeat: 0 = this day only. >0 = also apply to the same weekday for
  // the next N weeks (materialised as individual day-plans, no schema rule).
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  // Drag-to-dismiss state — same pattern as ActivityShareSheet.
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false); // true while finger is down (disables transition so the sheet tracks the finger)
  const dragRef = useRef({ y: 0, active: false });

  const dateObj = useMemo(() => {
    const [y, m, d] = String(date).split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [date]);
  const niceDate = dateObj.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const weekdayName = dateObj.toLocaleDateString(undefined, { weekday: 'long' });

  // Build the list of YYYY-MM-DD target dates: the base day plus one per week
  // for `repeatWeeks` weeks ahead (same weekday).
  const buildTargetDates = () => {
    const fmt = (dt) => {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    const dates = [date];
    for (let i = 1; i <= repeatWeeks; i++) {
      const dt = new Date(dateObj);
      dt.setDate(dt.getDate() + 7 * i);
      dates.push(fmt(dt));
    }
    return dates;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = { title: title.trim(), category: category || null, notes: notes.trim() };
      const targetDates = buildTargetDates();
      console.log('[DayPlan] saving', { dates: targetDates, ...payload });
      // onSave receives (payload, datesArray) — the parent upserts each date.
      const result = await onSave(payload, targetDates);
      console.log('[DayPlan] save result', result);
    } catch (e) {
      // Surface API errors inline so the user knows WHY nothing changed
      // instead of just watching the sheet stay open.
      console.error('[DayPlan] save failed', e);
      setError(e?.response?.data?.error || e?.message || 'Failed to save day theme');
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async () => {
    setSaving(true);
    setError(null);
    try { await onDelete(); }
    catch (e) {
      console.error('[DayPlan] delete failed', e);
      setError(e?.response?.data?.error || e?.message || 'Failed to delete day theme');
    }
    finally { setSaving(false); }
  };

  // Swipe-down-to-close. Past the threshold the sheet animates fully off-screen
  // (slide-down "close" effect) before unmounting, instead of vanishing.
  const onDragStart = (e) => {
    const t = e.touches?.[0]; if (!t) return;
    dragRef.current = { y: t.clientY, active: true };
    setDragging(true);
  };
  const onDragMove = (e) => {
    const s = dragRef.current; if (!s.active) return;
    const t = e.touches?.[0]; if (!t) return;
    const dy = t.clientY - s.y;
    if (dy > 0) setDragY(dy);
  };
  const onDragEnd = (e) => {
    const s = dragRef.current; if (!s.active) return;
    s.active = false;
    setDragging(false);
    const t = e.changedTouches?.[0];
    const dy = t ? t.clientY - s.y : dragY;
    if (dy > 120) {
      // Animate the sheet sliding down off-screen, then close.
      setDragY(typeof window !== 'undefined' ? window.innerHeight : 800);
      setTimeout(() => onClose(), 260);
      return;
    }
    setDragY(0); // snap back
  };

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        // Force the sheet above EVERYTHING — the calendar uses position:fixed
        // headers/sticky elements that iOS WKWebView occasionally hit-tests
        // before the portal layer, swallowing taps that should land on the
        // sheet. pointerEvents + touchAction are explicit so iOS routes
        // touches here directly without the synthesised-click 300 ms delay.
        position: 'fixed', inset: 0, zIndex: 2147483646,
        pointerEvents: 'auto',
        background: 'rgba(0,0,0,.55)', WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        touchAction: 'manipulation',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-t-3xl flex flex-col"
        style={{
          padding: '14px 0 calc(28px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '90vh',
          fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
          pointerEvents: 'auto',
          touchAction: 'manipulation',
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform .28s cubic-bezier(.22,1,.36,1)',
        }}
      >
        {/* Drag handle — swipe down to close */}
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          style={{
            alignSelf: 'stretch', display: 'flex', justifyContent: 'center',
            paddingTop: 4, paddingBottom: 8, cursor: 'grab',
            touchAction: 'none',
          }}
        >
          <div className="w-11 h-[5px] rounded-full bg-gray-300" />
        </div>
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          className="px-5 pb-3 border-b border-gray-100 flex items-center justify-between"
          style={{ touchAction: 'none' }}
        >
          <button onClick={onClose} className="text-sm font-semibold text-gray-700">Cancel</button>
          <div className="text-center">
            <div className="text-base font-bold text-gray-900">Day theme</div>
            <div className="text-xs text-gray-400">{niceDate}</div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm font-bold text-primary disabled:opacity-50"
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
        {error && (
          <div className="mx-5 mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Theme</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {DAY_THEME_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTitle(preset)}
                  className={`text-[11px] uppercase tracking-wide px-2.5 py-1 rounded-md font-bold border leading-none ${title === preset ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'}`}
                >{preset}</button>
              ))}
            </div>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. LT2, Threshold, Easy spin, Long run"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Category</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategory(null)}
                className={`text-[11px] uppercase tracking-wide px-2.5 py-1 rounded-md font-bold border leading-none ${category === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'}`}
              >None</button>
              {(categories || []).filter(c => c && c.id).map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className="text-[11px] uppercase tracking-wide px-2.5 py-1 rounded-md font-bold border leading-none"
                  style={category === c.id ? { background: c.color, color: '#fff', borderColor: c.color } : { background: hexToRgba(c.color, 0.1), color: c.color, borderColor: hexToRgba(c.color, 0.3) }}
                >{c.label || c.id}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Notes <span className="text-gray-300 normal-case font-medium">(optional)</span></div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Focus, intent, coach instructions…"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Repeat weekly</div>
            <div className="flex flex-wrap gap-1.5">
              {[{ w: 0, label: 'No' }, { w: 4, label: '4 wks' }, { w: 8, label: '8 wks' }, { w: 12, label: '12 wks' }].map(opt => (
                <button
                  key={opt.w}
                  type="button"
                  onClick={() => setRepeatWeeks(opt.w)}
                  className={`text-[11px] uppercase tracking-wide px-2.5 py-1 rounded-md font-bold border leading-none ${repeatWeeks === opt.w ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'}`}
                >{opt.label}</button>
              ))}
            </div>
            {repeatWeeks > 0 && (
              <div className="mt-1.5 text-[11px] text-gray-400">
                Also applied to every {weekdayName} for the next {repeatWeeks} weeks.
              </div>
            )}
          </div>

          {plan && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="w-full py-2.5 text-sm font-semibold text-red-500 rounded-xl border border-red-200 bg-red-50/50 active:bg-red-50 disabled:opacity-50"
            >Remove day theme</button>
          )}
        </div>
      </div>
    </div>,
    document.getElementById('app-modal-root') || document.body
  );
}

// ─── PeriodEditSheet — create/edit a multi-day calendar period ───────────────
// (Vacation, Training camp, Work trip, Illness, Race week). Bottom-sheet UI
// mirroring DayPlanEditSheet. onSave receives a single payload object with
// { _id?, startDate, endDate, type, color, notes }.
export function PeriodEditSheet({ period, defaultDate, onClose, onSave, onDelete }) {
  const initialStart = period?.startDate || defaultDate || '';
  const initialEnd   = period?.endDate   || defaultDate || '';
  const [type, setType]           = useState(period?.type || PERIOD_TYPES[0].type);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate]     = useState(initialEnd);
  const [notes, setNotes]         = useState(period?.notes || '');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);
  // Swipe-down-to-close (same pattern as DayPlanEditSheet).
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ y: 0, active: false });
  const onDragStart = (e) => { const t = e.touches?.[0]; if (!t) return; dragRef.current = { y: t.clientY, active: true }; setDragging(true); };
  const onDragMove = (e) => { const s = dragRef.current; if (!s.active) return; const t = e.touches?.[0]; if (!t) return; const dy = t.clientY - s.y; if (dy > 0) setDragY(dy); };
  const onDragEnd = (e) => {
    const s = dragRef.current; if (!s.active) return;
    s.active = false; setDragging(false);
    const t = e.changedTouches?.[0];
    const dy = t ? t.clientY - s.y : dragY;
    if (dy > 120) { setDragY(typeof window !== 'undefined' ? window.innerHeight : 800); setTimeout(() => onClose(), 260); return; }
    setDragY(0);
  };

  const selectedColor = (PERIOD_TYPES.find(p => p.type === type) || PERIOD_TYPES[0]).color;

  const handleSave = async () => {
    if (!startDate || !endDate) { setError('Pick a start and end date.'); return; }
    setSaving(true);
    setError(null);
    try {
      // Keep start <= end.
      const s = startDate <= endDate ? startDate : endDate;
      const e = startDate <= endDate ? endDate : startDate;
      await onSave({
        ...(period?._id ? { _id: period._id } : {}),
        startDate: s, endDate: e, type, color: selectedColor, notes: notes.trim(),
      });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to save period');
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async () => {
    if (!period?._id || !onDelete) return;
    setSaving(true); setError(null);
    try { await onDelete(period._id); }
    catch (err) { setError(err?.response?.data?.error || err?.message || 'Failed to delete period'); }
    finally { setSaving(false); }
  };

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4"
      style={{
        zIndex: 2147483646, pointerEvents: 'auto',
        background: 'rgba(0,0,0,.55)', WebkitBackdropFilter: 'blur(4px)', backdropFilter: 'blur(4px)',
        touchAction: 'manipulation',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{
          padding: '14px 0 calc(28px + env(safe-area-inset-bottom, 0px))', maxHeight: '90vh',
          fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif', pointerEvents: 'auto',
          transform: `translateY(${dragY}px)`,
          transition: dragging ? 'none' : 'transform .28s cubic-bezier(.22,1,.36,1)',
        }}
      >
        <div
          className="sm:hidden"
          onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
          style={{ alignSelf: 'stretch', display: 'flex', justifyContent: 'center', paddingTop: 4, paddingBottom: 8, touchAction: 'none' }}
        >
          <div style={{ width: 44, height: 5, borderRadius: 999, background: '#d1d5db' }} />
        </div>
        <div
          onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
          style={{ touchAction: 'none' }}
          className="px-5 pb-3 border-b border-gray-100 flex items-center justify-between"
        >
          <button onClick={onClose} className="text-sm font-semibold text-gray-700">Cancel</button>
          <div className="text-base font-bold text-gray-900">{period ? 'Edit period' : 'Add period'}</div>
          <button onClick={handleSave} disabled={saving} className="text-sm font-bold text-primary disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {error && (
          <div className="mx-5 mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[11px] font-semibold text-red-700">{error}</div>
        )}

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Type</div>
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_TYPES.map(pt => (
                <button
                  key={pt.type}
                  type="button"
                  onClick={() => setType(pt.type)}
                  className="text-[11px] uppercase tracking-wide px-2.5 py-1 rounded-md font-bold border leading-none"
                  style={type === pt.type
                    ? { background: pt.color, color: '#fff', borderColor: pt.color }
                    : { background: hexToRgba(pt.color, 0.1), color: pt.color, borderColor: hexToRgba(pt.color, 0.3) }}
                >{pt.label}</button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">From</div>
              <input
                type="date" value={startDate}
                onChange={e => { setStartDate(e.target.value); if (!endDate || e.target.value > endDate) setEndDate(e.target.value); }}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">To</div>
              <input
                type="date" value={endDate} min={startDate || undefined}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Notes <span className="text-gray-300 normal-case font-medium">(optional)</span></div>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="e.g. Sierra Nevada camp, client visit…"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {period && onDelete && (
            <button
              onClick={handleDelete} disabled={saving}
              className="w-full py-2.5 text-sm font-semibold text-red-500 rounded-xl border border-red-200 bg-red-50/50 active:bg-red-50 disabled:opacity-50"
            >Remove period</button>
          )}
        </div>
      </div>
    </div>,
    document.getElementById('app-modal-root') || document.body
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
  /** Array of DayPlan objects: { _id, date (YYYY-MM-DD), title, category, notes }
   *  Day-level themes ("Threshold day", "Recovery") rendered as a small
   *  badge next to the day header. Independent of planned workouts so
   *  a coach can outline the week before filling in specific sessions. */
  dayPlans = [],
  /** Called with (dateStr, { title, category, notes }) to upsert the day theme. */
  onDayPlanSave = null,
  /** Called with dateStr to remove the day theme. */
  onDayPlanDelete = null,
  /** Array of CalendarPeriod objects: { _id, startDate, endDate, type, color, notes }
   *  Multi-day spans (Vacation, Training camp, …) rendered as colored bands. */
  periods = [],
  /** Called with a payload { _id?, startDate, endDate, type, color, notes } to upsert a period. */
  onPeriodSave = null,
  /** Called with periodId to remove a period. */
  onPeriodDelete = null,
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
  /** Called with (dateKey, orderedIds) when workouts are reordered within one day */
  onReorderPlannedWorkouts = null,
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
  /** Called with the saved PlannedWorkout after edits in ActivityFullModal. */
  onPlannedSaved = null,
  /** Called after completed metrics are saved — parent should patch its activity list. */
  onCompletedSaved = null,
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

  const plannedEffectiveCategory = (pw, act) => act?.category || pw?.category || null;

  const renderCategoryBadge = (catId, className = 'text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md flex-shrink-0 font-bold border leading-none') => {
    if (!catId) return null;
    return (
      <span className={className} style={catBadgeStyle(catId)} title={catLabel(catId)}>
        {catLabel(catId)}
      </span>
    );
  };

  // Initialize anchorDate from localStorage, initialAnchorDate prop, or today
  const getInitialAnchorDate = () => {
    // safeDate guards against an Invalid Date prop (truthy but unusable) that
    // would otherwise crash every anchorDate.toISOString() downstream.
    if (initialAnchorDate) return safeDate(initialAnchorDate);
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
  const [mobileHeaderHeight, setMobileHeaderHeight] = useState(0);
  const selectedMobileDayRef = useRef(selectedMobileDay);

  // Switching the mobile Calendar/Charts tab → jump the scroll container back
  // to the very top so the new tab opens at the top (Charts especially, which
  // is otherwise inherited at whatever scroll the calendar list was left at).
  useEffect(() => {
    if (!isMobile) return;
    const header = mobileStickyHeaderRef.current;
    let el = header ? header.parentElement : null;
    while (el) {
      const oy = (typeof getComputedStyle !== 'undefined') ? getComputedStyle(el).overflowY : '';
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
        el.scrollTo({ top: 0, behavior: 'auto' });
        return;
      }
      el = el.parentElement;
    }
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, [mobileTab, isMobile]);
  const isAutoScrollingRef = useRef(false);
  const monthSentinelBottomRef = useRef(null);
  const monthSentinelTopRef = useRef(null);
  const miniCalScrollRef = useRef(null);
  const miniCalScrollLockRef = useRef(false);
  const miniCalCenterPanelRef = useRef(null);
  const [miniCalPanelHeight, setMiniCalPanelHeight] = useState(0);
  const miniCalScrollTimerRef = useRef(null);
  const [weekSummaryTab, setWeekSummaryTab] = useState('done');
  // Day-theme editor — open by tapping the badge area in the day header
  // (or via the "+" menu when no theme is set yet). Holds the date string
  // that's being edited; null means closed.
  const [dayPlanEditDate, setDayPlanEditDate] = useState(null);
  // Lookup: dateStr (YYYY-MM-DD) → dayPlan object. Built once per dayPlans
  // change so each day-header render is O(1).
  const dayPlanByDate = useMemo(() => {
    const m = new Map();
    (dayPlans || []).forEach(p => { if (p?.date) m.set(p.date, p); });
    return m;
  }, [dayPlans]);
  // Period editor state: holds { period } when editing, { defaultDate } when
  // creating, or null when closed.
  const [periodEdit, setPeriodEdit] = useState(null);
  // Lookup: dateStr → array of periods covering that day (for the band).
  const periodsByDate = useMemo(() => buildPeriodsByDate(periods), [periods]);

  // Thin colored band(s) for any periods covering `key` (YYYY-MM-DD). Clicking
  // a segment opens the period editor. Returns null when no period applies.
  const renderPeriodBand = (key, { height = 4, showLabel = false } = {}) => {
    const ps = periodsByDate.get(key);
    if (!ps || !ps.length) return null;
    // Label only on the day a period STARTS, so the name reads once at the
    // left edge of the band (notes/destination if set, else the type).
    const starting = showLabel ? ps.filter(p => p.startDate === key) : [];
    return (
      <div className="mb-1">
        <div
          className="flex gap-px"
          style={{ height }}
          title={ps.map(p => `${p.type}${p.notes ? ` — ${p.notes}` : ''}`).join(', ')}
        >
          {ps.slice(0, 3).map((p, i) => (
            <div
              key={p._id || i}
              onClick={onPeriodSave ? (e) => { e.stopPropagation(); setPeriodEdit({ period: p }); } : undefined}
              style={{ flex: 1, background: periodColor(p), borderRadius: 2, cursor: onPeriodSave ? 'pointer' : 'default' }}
            />
          ))}
        </div>
        {starting.map(p => (
          <div
            key={`lbl-${p._id}`}
            onClick={onPeriodSave ? (e) => { e.stopPropagation(); setPeriodEdit({ period: p }); } : undefined}
            className="mt-0.5 text-[10px] font-bold uppercase tracking-wide leading-none truncate pl-3"
            style={{ color: periodColor(p), cursor: onPeriodSave ? 'pointer' : 'default' }}
            title={`${p.type}${p.notes ? ` — ${p.notes}` : ''}`}
          >
            {(p.notes && p.notes.trim()) || p.type}
          </div>
        ))}
      </div>
    );
  };
  // Compact period indicator for the mini month grid — a short colored
  // underline (one segment per period, up to 2) so an illness / camp / travel
  // block is visible at a glance, not just in the agenda list below.
  const renderMiniPeriodBar = (key) => {
    const ps = periodsByDate.get(key);
    if (!ps || !ps.length) return null;
    return (
      <span className="flex gap-px mt-0.5" style={{ width: 16, height: 2 }} title={ps.map(p => `${p.type}${p.notes ? ` — ${p.notes}` : ''}`).join(', ')}>
        {ps.slice(0, 2).map((p, i) => (
          <span key={p._id || i} style={{ flex: 1, background: periodColor(p), borderRadius: 2 }} />
        ))}
      </span>
    );
  };

  // Renders the day-theme chip for `key` (or null).
  const renderDayThemeChip = (key) => {
    const dp = dayPlanByDate.get(key);
    if (!dp || (!dp.title && !dp.category)) return null;
    const tc = dayThemePresetColor(dp.title);
    const catColor = dp.category ? (getCategory(dp.category)?.color) : null;
    const color = tc || catColor || '#5E6590';
    const open = (e) => { e.stopPropagation(); if (onDayPlanSave) setDayPlanEditDate(key); };
    return (
      <button
        onClick={open}
        title={dp.notes || dp.title || catLabel(dp.category)}
        className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-bold border leading-none truncate max-w-[90px]"
        style={{ background: hexToRgba(color, 0.12), color, borderColor: hexToRgba(color, 0.35), cursor: onDayPlanSave ? 'pointer' : 'default' }}
      >
        {dp.title || catLabel(dp.category)}
      </button>
    );
  };

  // ── Race events (existing race-planning system) — loaded here and rendered
  // as a big badge on the race day in every calendar layout. ─────────────────
  const [races, setRaces] = useState([]);
  const reloadRaces = useCallback(() => {
    getRaceEvents(athleteId || undefined, { from: '2000-01-01' })
      .then(({ data }) => setRaces(Array.isArray(data) ? data : []))
      .catch(() => setRaces([]));
  }, [athleteId]);
  useEffect(() => { reloadRaces(); }, [reloadRaces]);
  const racesByDate = useMemo(() => {
    const m = new Map();
    (races || []).forEach(r => {
      const d = String(r.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(r);
    });
    return m;
  }, [races]);
  const RACE_PRIORITY_COLOR = { A: '#dc2626', B: '#ea580c', C: '#d97706' };
  // Big, prominent race badge for a given day key (or null).
  const renderRaceBadge = (key, { big = false } = {}) => {
    const rs = racesByDate.get(key);
    if (!rs || !rs.length) return null;
    return (
      <div className="flex flex-col gap-0.5 mb-1">
        {rs.map((r, i) => {
          const color = RACE_PRIORITY_COLOR[r.priority] || '#dc2626';
          return (
            <button
              key={r._id || i}
              type="button"
              title={`${r.name}${r.priority ? ` (${r.priority} race)` : ''} — tap for Form chart`}
              onClick={(e) => { e.stopPropagation(); setSelectedRace(r); }}
              className={`inline-flex items-center gap-1 rounded-md font-extrabold uppercase tracking-wide leading-none text-white truncate max-w-full cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all text-left ${big ? 'px-2 py-1 text-[13px]' : 'px-1.5 py-0.5 text-[11px]'}`}
              style={{ background: color }}
            >
              <FlagIcon className={`shrink-0 ${big ? 'w-3.5 h-3.5' : 'w-3 h-3'}`} aria-hidden />
              <span className="truncate">{r.name}</span>
            </button>
          );
        })}
      </div>
    );
  };

  // "+ theme" affordance for empty days (desktop parity with mobile).
  const renderAddThemeBtn = (key, { className = '' } = {}) => {
    if (!onDayPlanSave || dayPlanByDate.get(key)) return null;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setDayPlanEditDate(key); }}
        className={`text-[10px] font-bold uppercase tracking-wide text-gray-300 hover:text-primary px-1 ${className}`}
        title="Add day theme"
      >+ theme</button>
    );
  };

  // Add completed workout sheet
  const [addCompletedDate, setAddCompletedDate] = useState(null); // Date | null
  const [addRaceOpen, setAddRaceOpen] = useState(false);          // header "+ Race" → race form
  const [selectedRace, setSelectedRace] = useState(null);       // click race badge → detail modal

  // User profile data for TSS calculation
  const [userProfile, setUserProfile] = useState(null);
  const [tssRecalcTick, setTssRecalcTick] = useState(0);

  useEffect(() => {
    const onTssModeChange = () => setTssRecalcTick((t) => t + 1);
    window.addEventListener('lachart:tssDisplayModeChanged', onTssModeChange);
    return () => window.removeEventListener('lachart:tssDisplayModeChanged', onTssModeChange);
  }, []);

  // Drag & drop state for planned workout rescheduling
  const [draggedPw, setDraggedPw] = useState(null); // { pw, isCopy }
  const [dragOverKey, setDragOverKey] = useState(null); // date key being hovered
  const [reorderDrop, setReorderDrop] = useState(null); // { targetId, position: 'before'|'after' }

  const handlePlanReorderDragOver = useCallback((e, targetPw, dateKey) => {
    if (!draggedPw || draggedPw.isCopy) return;
    const drag = draggedPw.pw;
    const dragDate = String(drag?.date || '').slice(0, 10);
    if (dragDate !== dateKey) return;
    if (String(drag._id) === String(targetPw._id)) return;
    if (drag.status === 'completed' || drag.status === 'skipped') return;
    if (targetPw.status === 'completed' || targetPw.status === 'skipped') return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const position = e.clientY >= rect.top + rect.height / 2 ? 'after' : 'before';
    setReorderDrop({ targetId: String(targetPw._id), position });
  }, [draggedPw]);

  const handlePlanReorderDrop = useCallback((e, targetPw, dateKey, dayPlanned) => {
    e.preventDefault();
    e.stopPropagation();
    const drop = reorderDrop;
    setReorderDrop(null);
    if (!draggedPw || draggedPw.isCopy || !onReorderPlannedWorkouts) return;
    const drag = draggedPw.pw;
    const dragDate = String(drag?.date || '').slice(0, 10);
    if (dragDate !== dateKey) return;
    const position = drop?.targetId === String(targetPw._id) ? drop.position : 'before';
    const orderedIds = reorderPlannedWorkoutIds(dayPlanned, drag._id, targetPw._id, position);
    onReorderPlannedWorkouts(dateKey, orderedIds);
    setDraggedPw(null);
    setDragOverKey(null);
  }, [draggedPw, reorderDrop, onReorderPlannedWorkouts]);

  const planReorderProps = useCallback((pw, dateKey, dayPlanned) => {
    if (!onReorderPlannedWorkouts) return {};
    const targetId = String(pw._id);
    const hint = reorderDrop?.targetId === targetId ? reorderDrop.position : null;
    return {
      reorderHint: hint,
      onReorderDragOver: (e) => handlePlanReorderDragOver(e, pw, dateKey),
      onReorderDrop: (e) => handlePlanReorderDrop(e, pw, dateKey, dayPlanned),
    };
  }, [onReorderPlannedWorkouts, reorderDrop, handlePlanReorderDragOver, handlePlanReorderDrop]);

  const endPlanDrag = useCallback(() => {
    setDraggedPw(null);
    setDragOverKey(null);
    setReorderDrop(null);
  }, []);

  // Activity detail popup state: { activity, rect }
  const [activityPopup, setActivityPopup] = useState(null);
  // Full activity modal state: { activity, plannedWorkout }
  const [activityModal, setActivityModal] = useState(null);

  // Keep the open modal's activity snapshot in sync after Completed edits.
  useEffect(() => {
    const onMetrics = (e) => {
      const detail = e?.detail || {};
      if (!detail.id) return;
      const matches = buildActivityMatcher(detail.id);
      const patch = metricsPatchFromDetail(detail);
      if (!Object.keys(patch).length) return;
      setActivityModal((prev) => {
        if (!prev?.activity || !matches(prev.activity)) return prev;
        return { ...prev, activity: { ...prev.activity, ...patch } };
      });
    };
    window.addEventListener('activityMetricsUpdated', onMetrics);
    return () => window.removeEventListener('activityMetricsUpdated', onMetrics);
  }, []);

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

    const restoreScrollToDay = (dayKey) => {
      const el = dayRefs.current[dayKey];
      if (!el) return;
      const headerEl = mobileStickyHeaderRef.current;
      const headerBottom = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
      const offset = el.getBoundingClientRect().top - headerBottom - 12;
      let s = el.parentElement;
      while (s && s !== document.documentElement) {
        const cs = getComputedStyle(s);
        if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
          s.scrollBy({ top: offset, behavior: 'auto' });
          return;
        }
        s = s.parentElement;
      }
      window.scrollBy({ top: offset, behavior: 'auto' });
    };

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
        const bestD = new Date(`${best}T12:00:00`);
        if (!Number.isNaN(bestD.getTime())) {
          const anchorMonthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
          const bestMonthStart = new Date(bestD.getFullYear(), bestD.getMonth(), 1);
          const nextMonthStart = addMonths(anchorMonthStart, 1);
          if (
            bestMonthStart.getTime() === nextMonthStart.getTime()
            && bestMonthStart.getTime() !== anchorMonthStart.getTime()
          ) {
            isAutoScrollingRef.current = true;
            setAnchorDate(bestMonthStart);
            requestAnimationFrame(() => {
              restoreScrollToDay(best);
              setTimeout(() => { isAutoScrollingRef.current = false; }, 500);
            });
          }
        }
      }
    };

    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollTarget.removeEventListener('scroll', onScroll);
  }, [isMobile, mobileTab, anchorDate]);

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

  // Track sticky header height for scroll-margin and scrollToEl offsets.
  useLayoutEffect(() => {
    if (!isMobile) return;
    const headerEl = mobileStickyHeaderRef.current;
    if (!headerEl) return;
    const measure = () => setMobileHeaderHeight(headerEl.offsetHeight || 0);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(headerEl);
    return () => ro?.disconnect();
  }, [isMobile, mobileTab, showMiniCal, showMiniCalCharts]);

  const mobileScrollMargin = mobileHeaderHeight > 0 ? mobileHeaderHeight + 12 : undefined;

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
    const offset = elTop - headerBottom - 12;
    scrollEl.scrollBy({ top: offset, behavior: 'smooth' });
  }, []);

  const scrollToTodayCard = useCallback(() => {
    const today = new Date();
    const todayKey = getLocalDateString(today);
    setAnchorDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setMobileTab('calendar');
    setSelectedMobileDay(todayKey);
    setShowMiniCal(true);
    isAutoScrollingRef.current = true;
    const tryScroll = (attempt = 0) => {
      const el = dayRefs.current[todayKey];
      if (el) {
        scrollToEl(el);
        setTimeout(() => { isAutoScrollingRef.current = false; }, 700);
        return;
      }
      if (attempt < 15) setTimeout(() => tryScroll(attempt + 1), 60);
      else isAutoScrollingRef.current = false;
    };
    requestAnimationFrame(() => tryScroll());
  }, [scrollToEl]);

  const handleWeekSummaryTabChange = useCallback((tabId, weekKey) => {
    setWeekSummaryTab(tabId);
    isAutoScrollingRef.current = true;
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = weekSummaryRefs.current[weekKey];
        if (el) scrollToEl(el);
        setTimeout(() => { isAutoScrollingRef.current = false; }, 500);
      }, 0);
    });
  }, [scrollToEl]);

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

  // Native bottom bar: scroll to today when Calendar tab is tapped.
  useEffect(() => {
    const onNavigated = (e) => {
      if (e?.detail?.key === 'calendar') scrollToTodayCard();
    };
    window.addEventListener('nl-tab-navigated', onNavigated);
    return () => window.removeEventListener('nl-tab-navigated', onNavigated);
  }, [scrollToTodayCard]);

  // Auto-scroll to today on first mobile-calendar render (e.g. deep-link).
  const didInitialScrollToTodayRef = useRef(false);
  useEffect(() => {
    if (!isMobile || mobileTab !== 'calendar') return;
    if (didInitialScrollToTodayRef.current) return;
    didInitialScrollToTodayRef.current = true;
    scrollToTodayCard();
  }, [isMobile, mobileTab, scrollToTodayCard]);

  // Save anchorDate to localStorage when it changes (but not when initialAnchorDate prop changes)
  // Also detect month change and notify parent
  useEffect(() => {
    const safeAnchor = safeDate(anchorDate);
    if (!initialAnchorDate) {
      // Only save if we're not being controlled by initialAnchorDate prop
      localStorage.setItem('calendarView_anchorDate', safeAnchor.toISOString());
    }

    // Check if month changed and notify parent
    const currentMonth = `${safeAnchor.getFullYear()}-${safeAnchor.getMonth()}`;
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
      // An Invalid Date is still a truthy object, so coerce it — otherwise
      // .toISOString() throws "RangeError: Invalid time value" and the
      // ErrorBoundary blanks the whole calendar (e.g. opening an activity
      // whose date is corrupt passes Invalid Date in as initialAnchorDate).
      const d = safeDate(initialAnchorDate);
      setAnchorDate(d);
      // Also save to localStorage when navigating to specific training
      localStorage.setItem('calendarView_anchorDate', d.toISOString());
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

  const uniqueSportBuckets = useMemo(() => {
    const set = new Set();
    activities.forEach((a) => set.add(sportFilterChip(activitySportBucket(a))));
    plannedWorkouts.forEach((pw) => set.add(sportFilterChip(plannedSportBucket(pw))));
    return ['all', ...['bike', 'run', 'swim', 'other'].filter((b) => set.has(b))];
  }, [activities, plannedWorkouts]);

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

  const [direction, setDirection] = useState(0); // -1 = going back, 1 = going forward
  const [isFullscreen, setIsFullscreen] = useState(false);

  const filteredActivities = useMemo(() => {
    let list = activities;
    if (sportFilter !== 'all') list = list.filter((a) => matchesCalendarSportFilter(a, sportFilter));
    if (categoryFilter && categoryFilter !== 'all') {
      list = list.filter(a => a.category === categoryFilter);
    }
    return list;
  }, [activities, sportFilter, categoryFilter]);

  const filteredPlannedWorkouts = useMemo(() => {
    let list = plannedWorkouts;
    if (sportFilter !== 'all') {
      list = list.filter((pw) => sportFilterChip(plannedSportBucket(pw)) === sportFilter);
    }
    if (categoryFilter && categoryFilter !== 'all') {
      list = list.filter((pw) => pw.category === categoryFilter);
    }
    return list;
  }, [plannedWorkouts, sportFilter, categoryFilter]);

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
    map.forEach((arr) => arr.sort(compareActivitiesChronologically));
    return map;
  }, [filteredActivities]);

  // Map planned workouts by local date string. Honours the same sport +
  // category filters as activities.
  const plannedByDay = useMemo(() => {
    const map = new Map();
    filteredPlannedWorkouts.forEach(pw => {
      if (!pw.date) return;
      // date is stored as YYYY-MM-DD string — use as-is (no timezone conversion needed)
      const key = String(pw.date).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(pw);
    });
    map.forEach((arr, key) => map.set(key, sortPlannedWorkoutsForDay(arr)));
    return map;
  }, [filteredPlannedWorkouts]);

  // `rectOrEvent` can be a DOMRect (from WeekActivityCard) or a React event (from month-view inline buttons)
  const handleActivityClick = (a, rectOrEvent) => {
    if (onActivityClick) {
      const el = rectOrEvent instanceof Element ? rectOrEvent : null;
      onActivityClick(a, el);
    } else {
      const actDate = a.date || a.timestamp || a.startDate || a.start_time;
      const dayKey = actDate ? getLocalDateString(new Date(actDate)) : null;
      const dayPws = dayKey ? (plannedByDay.get(dayKey) || []) : [];
      const matchPw = dayPws.find(pw => planSportMatchesActivity(pw.sport, a.sport || a.type || '')) || null;
      setActivityModal({ activity: a, plannedWorkout: matchPw });
    }
  };

  const renderMobileMiniCalMonth = (monthDate, variant = 'calendar', skipLeadingWeek = false) => {
    const gridDays = getCompactMonthDays(monthDate, { skipLeadingWeek });
    const monthIdx = monthDate.getMonth();
    const monthYear = monthDate.getFullYear();
    const dotColors = { run: '#f97316', bike: '#3b82f6', swim: '#06b6d4', elliptical: '#a855f7', other: '#8b5cf6' };

    return (
      <div className="grid grid-cols-7">
        {gridDays.map((dayDate) => {
          const key = getLocalDateString(dayDate);
          const isCurrentMonth = dayDate.getMonth() === monthIdx && dayDate.getFullYear() === monthYear;
          const isToday = isSameDay(dayDate, new Date());
          const isSelected = variant === 'calendar' && key === selectedMobileDay;
          const acts = activitiesByDay.get(key) || [];
          const planned = plannedByDay.get(key) || [];
          const dots = [...new Set(acts.map((a) => {
            const s = (a.sport || '').toLowerCase();
            if (s.includes('run') || s.includes('walk')) return 'run';
            if (s.includes('ride') || s.includes('bike') || s.includes('cycl') || s.includes('virtual')) return 'bike';
            if (s.includes('swim')) return 'swim';
            if (s.includes('elliptical') || s.includes('cross-trainer') || s.includes('crosstrainer')) return 'elliptical';
            return 'other';
          }))].slice(0, 3);
          const hasPlanOnly = planned.length > 0 && acts.length === 0;
          const isSunday = dayDate.getDay() === 0;
          const weekKey = startOfWeek(dayDate).toISOString().slice(0, 10);

          return (
            <button
              key={`${monthYear}-${monthIdx}-${key}`}
              onClick={() => {
                if (variant === 'charts') {
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
                  return;
                }
                if (!isCurrentMonth) {
                  setAnchorDate(new Date(dayDate.getFullYear(), dayDate.getMonth(), 1));
                }
                setSelectedMobileDay(key);
                isAutoScrollingRef.current = true;
                setTimeout(() => {
                  const targetEl = (isSunday && weekSummaryRefs.current[weekKey])
                    ? weekSummaryRefs.current[weekKey]
                    : dayRefs.current[key];
                  scrollToEl(targetEl);
                  setTimeout(() => { isAutoScrollingRef.current = false; }, 700);
                }, isCurrentMonth ? 50 : 150);
              }}
              className="flex flex-col items-center py-px touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <span className={`w-6 h-6 flex items-center justify-center text-[11px] font-semibold rounded-full transition-all ${
                isToday && isSelected ? 'bg-primary text-white ring-2 ring-primary/30 ring-offset-1' :
                isToday ? 'bg-primary text-white' :
                isSelected ? 'bg-gray-200 text-gray-900' :
                isCurrentMonth ? 'text-gray-700' : 'text-gray-400'
              }`}>
                {dayDate.getDate()}
              </span>
              {renderMiniPeriodBar(key)}
              <div className="flex gap-0.5 h-1 mt-px items-center">
                {hasPlanOnly && <span className="w-1 h-1 rounded-full bg-gray-300" />}
                {dots.map((sport, si) => (
                  <span key={si} className="w-1 h-1 rounded-full" style={{ backgroundColor: dotColors[sport] }} />
                ))}
                {isSunday && isCurrentMonth && (
                  <span className="w-1 h-1 rounded-full" style={{ backgroundColor: '#8b5cf6' }} />
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

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
    const matchPw = dayPws.find(pw => planSportMatchesActivity(pw.sport, match.sport || match.type || '')) || null;
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
    return getCompactMonthDays(anchorDate);
  }, [view, anchorDate, isMobile]);

  // Mobile day list: current month + full next month so the user can keep
  // scrolling into July while June is still the header month (header syncs via scroll spy).
  const mobileCalendarListDays = useMemo(() => {
    if (!isMobile) {
      return days.filter((d) => d.getMonth() === anchorDate.getMonth());
    }
    const start = startOfMonth(anchorDate);
    const end = endOfMonth(addMonths(anchorDate, 1));
    const result = [];
    let d = new Date(start);
    while (d <= end) {
      result.push(new Date(d));
      d = addDays(d, 1);
    }
    return result;
  }, [anchorDate, isMobile, days]);

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

  const miniCalScrollMonths = useMemo(() => {
    const center = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    return [addMonths(center, -1), center, addMonths(center, 1)];
  }, [anchorDate]);

  const miniCalViewportRows = useMemo(
    () => Math.ceil(getCompactMonthDays(anchorDate).length / 7),
    [anchorDate],
  );

  // Keep the scroll stack centred on the middle (current) month panel.
  useLayoutEffect(() => {
    if (!isMobile) return;
    const calVisible = (mobileTab === 'calendar' && showMiniCal) || (mobileTab === 'charts' && showMiniCalCharts);
    if (!calVisible) return;
    const el = miniCalScrollRef.current;
    const center = miniCalCenterPanelRef.current;
    if (center) setMiniCalPanelHeight(center.offsetHeight);
    if (!el?.children?.[0]) return;
    miniCalScrollLockRef.current = true;
    el.scrollTop = el.children[0].offsetHeight;
    requestAnimationFrame(() => { miniCalScrollLockRef.current = false; });
  }, [anchorDate, isMobile, mobileTab, showMiniCal, showMiniCalCharts]);

  const handleMiniCalScroll = useCallback(() => {
    if (miniCalScrollLockRef.current) return;
    const el = miniCalScrollRef.current;
    if (!el || el.children.length < 3) return;
    if (miniCalScrollTimerRef.current) clearTimeout(miniCalScrollTimerRef.current);
    miniCalScrollTimerRef.current = setTimeout(() => {
      if (miniCalScrollLockRef.current) return;
      const prevH = el.children[0].offsetHeight;
      const curH = el.children[1].offsetHeight;
      const st = el.scrollTop;
      if (st <= 12) {
        setDirection(-1);
        setAnchorDate((d) => addMonths(d, -1));
      } else if (st >= prevH + curH - 12) {
        setDirection(1);
        setAnchorDate((d) => addMonths(d, 1));
      }
    }, 100);
  }, []);

  useEffect(() => () => {
    if (miniCalScrollTimerRef.current) clearTimeout(miniCalScrollTimerRef.current);
  }, []);

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

  // Weekly summary (last 4 weeks)
  // Weekly summary only for weeks currently visible in the calendar grid
  // In week view, show only the current week
  const weeklySummary = useMemo(() => {
    void tssRecalcTick; // bust cache when per-workout TSS mode changes
    if (!days || days.length === 0) return [];

    let visibleWeekKeys;
    if (view === 'week') {
      const currentWeekStart = startOfWeek(anchorDate);
      visibleWeekKeys = new Set([currentWeekStart.toISOString().slice(0,10)]);
    } else {
      visibleWeekKeys = new Set(days.map(d => startOfWeek(d).toISOString().slice(0,10)));
      fullscreenWeeks.forEach(wk => visibleWeekKeys.add(startOfWeek(wk[0]).toISOString().slice(0,10)));
      mobileWeeks.forEach(wk => visibleWeekKeys.add(startOfWeek(wk[0]).toISOString().slice(0,10)));
      if (isMobile) {
        mobileCalendarListDays.forEach((d) => visibleWeekKeys.add(startOfWeek(d).toISOString().slice(0, 10)));
      }
    }

    // Get FTP and threshold pace from user profile — used by resolveActivityTss
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

      const tssVal = resolveActivityTss(act, userProfile, { user: userProfile });

      entry.totalSeconds += duration;
      if (sport.includes('run') || sport.includes('walk') || sport.includes('hike')) {
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
      } else if (sport.includes('ride') || sport.includes('cycl') || sport.includes('bike')) {
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
      } else if (!isNaN(tssVal) && tssVal > 0) {
        entry.totalTSS += tssVal;
      }
      if (!isNaN(tssVal) && tssVal > 0) {
        entry.hasTss = true;
      }
      return acc;
    }, {});

    // Planned totals per week
    const plannedByWeek = {};
    filteredPlannedWorkouts.forEach(pw => {
      if (!pw.date) return;
      const d = new Date(pw.date);
      if (isNaN(d.getTime())) return;
      const weekStart = startOfWeek(d);
      const key = weekStart.toISOString().slice(0, 10);
      // Only count weeks the calendar is currently rendering — keeps the
      // summary fast and matches what the user can see.
      if (!visibleWeekKeys.has(key)) return;
      if (!plannedByWeek[key]) plannedByWeek[key] = { weekStart, plannedSeconds: 0, plannedTSS: 0 };
      const secs = plannedWorkoutDurationSecs(pw);
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
  }, [
    filteredActivities,
    filteredPlannedWorkouts,
    days,
    mobileCalendarListDays,
    fullscreenWeeks,
    mobileWeeks,
    userProfile,
    view,
    anchorDate,
    isMobile,
    tssRecalcTick,
  ]);

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
            className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm transition-colors text-sm md:text-base"
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
        <div className="text-base md:text-lg lg:text-xl font-semibold text-gray-900">
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
                  className={`inline-flex items-center gap-1 px-2 md:px-2.5 py-1 md:py-1.5 rounded-lg md:rounded-xl text-sm font-semibold border transition-all ${
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
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border shadow-sm transition-colors text-sm md:text-base ${view==='week'?'bg-primary text-white border-primary hover:bg-primary-dark':'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`}
            >
              Week
            </button>
          )}
          {!isFullscreen && (
            <button
              onClick={() => setView('month')}
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border shadow-sm transition-colors text-sm md:text-base ${view==='month'?'bg-primary text-white border-primary hover:bg-primary-dark':'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`}
            >
              Month
            </button>
          )}
          {onPeriodSave && (
            <button
              onClick={() => setPeriodEdit({ defaultDate: getLocalDateString(new Date()) })}
              title="Add a multi-day period (vacation, training camp, …)"
              className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border shadow-sm transition-colors text-xs md:text-sm bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
            >
              + Period
            </button>
          )}
          <button
            onClick={() => setAddRaceOpen(true)}
            title="Plan a race / goal event"
            className="px-2 md:px-3 py-1 md:py-1.5 rounded-lg md:rounded-xl border shadow-sm transition-colors text-xs md:text-sm bg-white border-red-200 hover:bg-red-50 text-red-600"
          >
            + Race
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
                <div className="px-3 pb-2">
                  <div className="grid grid-cols-7 mb-0.5">
                    {['M','T','W','T','F','S','S'].map((d, i) => (
                      <div key={i} className="text-[10px] font-bold text-gray-400 text-center py-0.5">{d}</div>
                    ))}
                  </div>
                  <div
                    ref={miniCalScrollRef}
                    onScroll={handleMiniCalScroll}
                    onTouchStart={handleCalSwipeStart}
                    onTouchEnd={handleCalSwipeEnd}
                    className="overflow-y-auto overscroll-contain touch-pan-y"
                    style={{
                      maxHeight: miniCalPanelHeight > 0
                        ? `${miniCalPanelHeight + 38}px`
                        : `${(miniCalViewportRows + 1) * 38 + 4}px`,
                      scrollSnapType: 'y mandatory',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    {miniCalScrollMonths.map((monthDate, i) => (
                      <div
                        key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`}
                        ref={i === 1 ? miniCalCenterPanelRef : undefined}
                        className="snap-start snap-always"
                      >
                        {renderMobileMiniCalMonth(monthDate, 'calendar', i > 0)}
                      </div>
                    ))}
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
                <div className="px-3 pb-2">
                  <div className="grid grid-cols-7 mb-0.5">
                    {['M','T','W','T','F','S','S'].map((d, i) => (
                      <div key={i} className="text-[10px] font-bold text-gray-400 text-center py-0.5">{d}</div>
                    ))}
                  </div>
                  <div
                    ref={miniCalScrollRef}
                    onScroll={handleMiniCalScroll}
                    onTouchStart={handleCalSwipeStart}
                    onTouchEnd={handleCalSwipeEnd}
                    className="overflow-y-auto overscroll-contain touch-pan-y"
                    style={{
                      maxHeight: miniCalPanelHeight > 0
                        ? `${miniCalPanelHeight + 38}px`
                        : `${(miniCalViewportRows + 1) * 38 + 4}px`,
                      scrollSnapType: 'y mandatory',
                      WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    {miniCalScrollMonths.map((monthDate, i) => (
                      <div
                        key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`}
                        ref={i === 1 ? miniCalCenterPanelRef : undefined}
                        className="snap-start snap-always"
                      >
                        {renderMobileMiniCalMonth(monthDate, 'charts', i > 0)}
                      </div>
                    ))}
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

          {/* ── Calendar tab: day list (page scrolls) ──
              Swipe left/right on the list to flip months — same gesture as
              the mini grid above, so the user doesn't have to scroll back
              up to navigate when they're deep in a long day list. */}
          {mobileTab === 'calendar' && (
            <div
              ref={dayListRef}
              className="px-3 pt-2 pb-24"
              onTouchStart={handleCalSwipeStart}
              onTouchEnd={handleCalSwipeEnd}
            >
              {mobileCalendarListDays.map((dayDate, dayIdx) => {
                const key = getLocalDateString(dayDate);
                const acts = activitiesByDay.get(key) || [];
                const planned = plannedByDay.get(key) || [];
                const isToday = isSameDay(dayDate, new Date());
                const isSelected = key === selectedMobileDay;
                const isCurrentMonth = dayDate.getMonth() === anchorDate.getMonth() && dayDate.getFullYear() === anchorDate.getFullYear();
                const hasItems = acts.length > 0 || planned.length > 0;
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const isSunday = dayDate.getDay() === 0;
                const weekKey = startOfWeek(dayDate).toISOString().slice(0, 10);
                const wkSummary = isSunday ? weeklySummary.find(w => w.weekStart.toISOString().slice(0, 10) === weekKey) : null;
                const showMonthHeader = dayIdx === 0
                  || dayDate.getMonth() !== mobileCalendarListDays[dayIdx - 1].getMonth()
                  || dayDate.getFullYear() !== mobileCalendarListDays[dayIdx - 1].getFullYear();
                return (
                  <React.Fragment key={key}>
                  {showMonthHeader && (
                    <div className="flex items-center gap-2 py-2 mt-1 mb-0.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-primary">
                        {dayDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                      </span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                  )}
                  <div
                    ref={el => { dayRefs.current[key] = el; }}
                    className={`mb-1.5 rounded-xl border overflow-hidden ${isSelected ? 'border-primary/40 shadow-sm' : isToday ? 'border-primary/20' : isCurrentMonth ? 'border-gray-100' : 'border-gray-100/80'}`}
                    style={mobileScrollMargin ? { scrollMarginTop: mobileScrollMargin } : undefined}
                    onClick={() => setSelectedMobileDay(key)}
                  >
                    {/* Period band(s) — colored stripe across the top */}
                    {renderPeriodBand(key, { height: 5, showLabel: true })}
                    {/* Race day — big badge */}
                    <div className="px-3">{renderRaceBadge(key, { big: true })}</div>
                    {/* Day header (compact — bigger info goes on the
                        trainings inside, not the date strip).
                        The day-theme badge ("Threshold", "Recovery", …) sits
                        next to the date and is tappable to edit. Tapping
                        the empty area opens the theme editor too. */}
                    {(() => { const _dayPlan = dayPlanByDate.get(key); return (
                    <div className={`flex items-center justify-between px-3 py-2 ${isToday ? 'bg-primary/5' : 'bg-gray-50/80'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-bold ${isToday ? 'text-primary' : isCurrentMonth ? 'text-gray-400' : 'text-gray-300'}`}>{dayNames[dayDate.getDay()]}</span>
                        <span className={`text-base font-extrabold ${isToday ? 'text-primary' : isCurrentMonth ? 'text-gray-800' : 'text-gray-500'}`}>{dayDate.getDate()}</span>
                        {isToday && <span className="text-[9px] bg-primary text-white px-1.5 py-0.5 rounded-full font-bold">Today</span>}
                        {renderDayThemeChip(key, { big: true })}
                        {!_dayPlan && onDayPlanSave && (
                          <button
                            onClick={e => { e.stopPropagation(); setDayPlanEditDate(key); }}
                            className="text-[10px] text-gray-300 active:text-primary touch-manipulation px-1"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                            title="Add day theme"
                          >+ theme</button>
                        )}
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
                    ); })()}
                    {/* Content */}
                    {hasItems ? (
                      <div className="px-3 pb-2.5 pt-1.5 flex flex-col gap-1.5">
                        {(() => {
                          // Use the shared pairPlannedWithActivities() so we get:
                          // 1) completedTrainingId respected (explicit links win)
                          // 2) greedy first-match on sport for the rest
                          // 3) consistent key logic with the rest of the calendar
                          const { items: dayItems } = buildChronologicalDayItems(planned, acts, pairPlannedWithActivities);

                          return (
                            <>
                              {dayItems.map((item, pi) => {
                                if (item.kind === 'activity') {
                                  const a = item.act;
                                  const activityId = a.id || a._id;
                                  const isActSelected = effectiveSelectedId && String(activityId) === String(effectiveSelectedId);
                                  const color = sportColor(a.sport);
                                  const title = a.title || a.name || a.originalFileName || 'Activity';
                                  const statsLine = activityCompletedStats(a, userProfile);
                                  return (
                                    <button key={`act-${pi}`}
                                      onClick={e => { e.stopPropagation(); const r = e.currentTarget?.getBoundingClientRect() || null; handleActivityClick(a, r); }}
                                      className={`w-full text-left flex flex-col gap-1 px-3 py-2.5 rounded-xl border transition-all touch-manipulation ${isActSelected ? 'bg-primary/10 border-primary/30' : 'bg-white border-gray-100 active:bg-gray-50'}`}
                                      style={{ borderLeftColor: color, borderLeftWidth: 4, WebkitTapHighlightColor: 'transparent' }}>
                                      <div className="flex items-center gap-2 min-w-0">
                                        <SportIcon sport={a.sport} className="w-5 h-5 flex-shrink-0" />
                                        <span className="text-sm font-bold text-gray-800 flex-1 truncate min-w-0">{title}</span>
                                        {a.category && (
                                          <span
                                            className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md flex-shrink-0 font-bold border leading-none"
                                            style={catBadgeStyle(a.category)}
                                            title={catLabel(a.category)}
                                          >
                                            {catLabel(a.category)}
                                          </span>
                                        )}
                                      </div>
                                      {statsLine && (
                                        <div className="text-[12px] text-gray-600 font-semibold pl-7 truncate tabular-nums">
                                          {statsLine}
                                        </div>
                                      )}
                                    </button>
                                  );
                                }

                                const pw = item.pw;
                                const act = item.act;
                                const pwSport = (pw.sport || 'bike').toLowerCase();
                                const planColor = SPORT_PLAN_COLORS[pwSport] || '#767EB5';
                                const pwCategory = plannedEffectiveCategory(pw, act);
                                const isSkipped = pw.status === 'skipped';
                                const compliance = act ? findCompliance(pw, [act]) : null;

                                if (act) {
                                  const actStats = activityCompletedStats(act, userProfile);
                                  const cc = compliance || { color: '#22c55e', bg: '#f0fdf4', label: 'Done' };
                                  return (
                                    <button key={`pw-${pi}`}
                                      onClick={e => { e.stopPropagation(); handleActivityClick(act, null); }}
                                      className="w-full text-left flex flex-col px-3 py-2.5 rounded-xl touch-manipulation active:opacity-70 gap-1.5"
                                      style={{
                                        ...outlineBorder({ color: cc.color, leftColor: planColor, leftWidth: 4 }),
                                        backgroundColor: cc.bg,
                                        WebkitTapHighlightColor: 'transparent',
                                      }}>
                                      <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cc.color }} />
                                        <span className="text-sm font-bold flex-1 truncate" style={{ color: planColor }}>{pw.title || 'Planned workout'}</span>
                                        <span className="text-[11px] font-bold flex-shrink-0" style={{ color: cc.color }}>{cc.label}</span>
                                      </div>
                                      <div className="flex items-center gap-2 pl-0.5">
                                        <SportIcon sport={act.sport || pwSport} className="w-4 h-4 flex-shrink-0" />
                                        {actStats && (
                                          <div className="text-[12px] text-gray-600 font-semibold flex-1 min-w-0 truncate tabular-nums">
                                            {actStats}
                                          </div>
                                        )}
                                        {renderCategoryBadge(pwCategory)}
                                      </div>
                                    </button>
                                  );
                                }

                                const isMissed = !isSkipped && !isToday && dayDate < new Date();
                                const plannedPreview = plannedWorkoutPreviewStats(pw, pwSport);
                                return (
                                  <button key={`pw-${pi}`}
                                    onClick={e => { e.stopPropagation(); onSelectPlannedWorkout && onSelectPlannedWorkout(pw); }}
                                    className="w-full text-left flex flex-col gap-1.5 px-3 py-2.5 rounded-xl touch-manipulation active:opacity-70"
                                    style={{
                                      ...outlineBorder({
                                        color: isMissed ? '#fca5a5' : planColor + '55',
                                        leftColor: isMissed ? '#ef4444' : (pwCategory ? (catBorderColor(pwCategory) || planColor) : planColor),
                                        leftWidth: 4,
                                        style: isMissed ? 'solid' : 'dashed',
                                      }),
                                      backgroundColor: isMissed ? '#fef2f2' : planColor + '10',
                                      WebkitTapHighlightColor: 'transparent'
                                    }}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <SportIcon sport={pwSport} className="w-4 h-4 flex-shrink-0 opacity-80" style={{ color: isMissed ? '#ef4444' : planColor }} />
                                      <span className="text-sm font-bold flex-1 truncate" style={{ color: isSkipped ? '#9ca3af' : isMissed ? '#991b1b' : planColor }}>{pw.title || 'Planned workout'}</span>
                                      {renderCategoryBadge(pwCategory, 'text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-md flex-shrink-0 font-bold border leading-none max-w-[88px] truncate')}
                                      {isMissed && (
                                        <span className="text-[11px] font-bold flex-shrink-0" style={{ color: '#ef4444' }}>Missed</span>
                                      )}
                                      {!isMissed && pw.steps?.length > 0 && <PlanMiniChart steps={pw.steps} color={planColor} width={42} height={14} />}
                                    </div>
                                    {plannedPreview && (
                                      <div className="text-[12px] font-semibold pl-0.5 truncate tabular-nums" style={{ color: isMissed ? '#ef444488' : planColor + 'bb' }}>
                                        {plannedPreview}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-300">Rest day</div>
                    )}
                  </div>
                  {/* Weekly summary card — shown after each Sunday */}
                  {isSunday && (
                    <div
                      ref={el => { weekSummaryRefs.current[weekKey] = el; }}
                      className="mb-3 rounded-xl border border-primary/20 overflow-hidden"
                      style={mobileScrollMargin ? { scrollMarginTop: mobileScrollMargin } : undefined}
                    >
                      <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5">
                        <span className="text-base font-bold text-primary">Week summary</span>
                        {wkSummary?.plannedSeconds > 0 && (
                          <div className="flex bg-white rounded-lg p-0.5 gap-0.5 border border-primary/20">
                            {[['done', 'Done'], ['plan', 'Plan']].map(([tabId, lbl]) => (
                              <button
                                key={tabId}
                                onClick={e => { e.stopPropagation(); handleWeekSummaryTabChange(tabId, weekKey); }}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all touch-manipulation ${weekSummaryTab === tabId ? 'bg-primary text-white shadow-sm' : 'text-gray-500'}`}
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
                        large
                        weekPlannedWorkouts={filteredPlannedWorkouts.filter(pw => {
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
          <div className="sticky top-0 z-20 grid gap-px bg-gray-200 shadow-sm" style={{ gridTemplateColumns: 'repeat(7, 1fr) minmax(145px,185px)' }}>
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun','Summary'].map(d => (
              <div key={d} className="bg-gray-50 text-xs font-semibold text-center py-2.5 text-gray-500">{d}</div>
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
                <div className={`flex items-center gap-3 px-4 py-2 text-sm ${isCurrentWeek ? 'bg-primary/5' : 'bg-gray-50'}`}>
                  <span className={`font-bold ${isCurrentWeek ? 'text-primary' : 'text-gray-500'}`}>{weekLabel}</span>
                  {isCurrentWeek && <span className="bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">Now</span>}
                  {wkSummary && wkSummary.totalSeconds > 0 && (
                    <div className="flex items-center gap-2 ml-auto text-gray-500">
                      <span className="font-semibold text-gray-700">{formatHours(wkSummary.totalSeconds)}</span>
                      {wkSummary.totalTSS > 0 && (
                        <span className="flex items-center gap-0.5 text-primary font-bold">
                          <FireIcon className="w-3.5 h-3.5" />{Math.round(wkSummary.totalTSS)} TSS
                        </span>
                      )}
                      {wkSummary.volumeChange === 'up' && <ArrowUpIcon className="w-3 h-3 text-green-500" />}
                      {wkSummary.volumeChange === 'down' && <ArrowDownIcon className="w-3 h-3 text-red-500" />}
                    </div>
                  )}
                </div>

                {/* Day columns */}
                <div className="grid gap-px bg-gray-100" style={{ gridTemplateColumns: 'repeat(7, 1fr) minmax(145px,185px)' }}>
                  {weekDays.map((dayDate, dayIdx) => {
                    const key = getLocalDateString(dayDate);
                    const allActs = activitiesByDay.get(key) || [];
                    const planned = plannedByDay.get(key) || [];
                    const { items: dayItems, pwToAct } = buildChronologicalDayItems(planned, allActs, pairPlannedWithActivities);
                    const isToday = isSameDay(dayDate, new Date());
                    const isDragTarget = dragOverKey === key && draggedPw && draggedPw.pw.date !== key;

                    return (
                      <div
                        key={key}
                        className={`bg-white p-2.5 min-h-[210px] flex flex-col gap-1.5 group/day ${isToday ? 'ring-2 ring-primary/30 ring-inset bg-primary/5' : 'hover:bg-gray-50/60'} ${isDragTarget ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
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
                        {/* Period band(s) — colored stripe across the top */}
                        {renderPeriodBand(key, { height: 4, showLabel: true })}
                        {renderRaceBadge(key, { big: true })}
                        {/* Day number */}
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-sm font-bold leading-none ${isToday ? 'w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[11px]' : 'text-gray-700'}`}>
                              {dayDate.getDate()}
                            </span>
                            {renderDayThemeChip(key)}
                            {renderAddThemeBtn(key, { className: 'opacity-0 group-hover/day:opacity-100 transition-opacity' })}
                          </div>
                          {isDragTarget && <span className="text-[10px] font-semibold text-primary/70">{draggedPw?.isCopy ? 'Copy' : 'Move'}</span>}
                          {!isDragTarget && onPlanWorkout && (
                            <button
                              onClick={e => { e.stopPropagation(); onPlanWorkout(dayDate); }}
                              className="opacity-0 group-hover/day:opacity-100 w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10 transition-all"
                            >
                              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M8 3v10M3 8h10" /></svg>
                            </button>
                          )}
                        </div>

                        {dayItems.map((item, pi) => {
                          if (item.kind === 'pair' || item.kind === 'planned') {
                            const pw = item.pw;
                            return (
                              <PlannedWorkoutCard
                                key={`fs-plan-${pi}`}
                                pw={pw}
                                compact
                                onSelect={onSelectPlannedWorkout}
                                onStart={onStartWorkout}
                                isDragging={draggedPw?.pw?._id === pw._id}
                                onDragStart={e => { e.dataTransfer.effectAllowed = 'copyMove'; setDraggedPw({ pw, isCopy: e.altKey }); }}
                                onDragEnd={endPlanDrag}
                                compliance={findCompliance(pw, allActs)}
                                pairingState={pairingStateFor(pw, allActs, getLocalDateString(new Date()))}
                                linkedActivity={item.act || pwToAct.get(String(pw._id)) || null}
                                onSelectLinked={(act) => handleActivityClick(act, null)}
                                onDuplicate={onCopyPlannedWorkout ? (p) => onCopyPlannedWorkout(p, p.date) : null}
                                onDelete={onDeletePlannedWorkout}
                                onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                                {...planReorderProps(pw, key, planned)}
                              />
                            );
                          }

                          const a = item.act;
                          const activityId = a.id || a._id;
                          const isSelected = effectiveSelectedId && String(activityId) === String(effectiveSelectedId);
                          return (
                            <WeekActivityCard
                              key={`fs-act-${pi}`}
                              a={a}
                              isSelected={isSelected}
                              onSelect={handleSelectActivity}
                              onActivityClick={handleActivityClick}
                              onAddLactate={onAddLactate}
                              catBadgeStyle={catBadgeStyle}
                              catLabel={catLabel}
                              userProfile={userProfile}
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
                              className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${weekSummaryTab === tabId ? 'bg-primary text-white shadow-sm' : 'text-gray-500'}`}
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
                      weekPlannedWorkouts={filteredPlannedWorkouts.filter(pw => {
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
          style={{ gridTemplateColumns: 'repeat(7, 1fr) minmax(155px,195px)' }}
        >
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun', 'Summary'].map((d) => (
          <div key={d} className="bg-gray-50 text-sm md:text-base font-medium p-1.5 md:p-3 text-center text-gray-600">{d}</div>
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
                const { items: dayItems, pwToAct } = buildChronologicalDayItems(plannedForDay, allActs, pairPlannedWithActivities);
                const isToday = isSameDay(dayDate, new Date());
                const isExpanded = expandedDays.has(key);
                const maxCollapsedItems = view === 'month' ? 3 : Number.POSITIVE_INFINITY;
                const totalDayItems = dayItems.length;
                const hasOverflow = view === 'month' && totalDayItems > maxCollapsedItems;
                const visibleItems = isExpanded ? dayItems : dayItems.slice(0, maxCollapsedItems);
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
                    className={`bg-white p-1.5 md:p-3 ${view === 'week' ? 'min-h-[175px]' : 'min-h-[150px]'} transition-all group ${isCurrentMonth ? '' : 'opacity-40'} ${isToday ? 'ring-2 ring-primary/30 ring-inset bg-primary/5' : 'hover:bg-gray-50'} ${isDragTarget ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
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
                    {/* Period band(s) — colored stripe across the top */}
                    {renderPeriodBand(key, { height: 4, showLabel: true })}
                    {renderRaceBadge(key, { big: true })}
                    <div className={`flex items-center justify-between mb-1.5`}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-sm md:text-base font-semibold ${isToday ? 'text-primary font-bold' : 'text-gray-700'}`}>
                          {view === 'week' ? `${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][dayIdx]} ${dayDate.getDate()}` : dayDate.getDate()}
                        </span>
                        {renderDayThemeChip(key)}
                        {renderAddThemeBtn(key, { className: 'opacity-0 group-hover:opacity-100 transition-opacity hidden md:inline-block' })}
                      </div>
                      {isDragTarget && (
                        <span className="text-[10px] font-semibold text-primary/70 ml-1">{draggedPw?.isCopy ? 'Copy here' : 'Move here'}</span>
                      )}
                      {!isDragTarget && onPlanWorkout && (
                        <button
                          onClick={e => { e.stopPropagation(); onPlanWorkout(dayDate); }}
                          title="Plan workout"
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10"
                        >
                          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
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
                      {visibleItems.map((item, pi) => {
                        if (item.kind === 'pair' || item.kind === 'planned') {
                          const pw = item.pw;
                          return (
                            <PlannedWorkoutCard
                              key={`plan-${pi}`}
                              pw={pw}
                              compact
                              onSelect={onSelectPlannedWorkout}
                              onStart={onStartWorkout}
                              isDragging={draggedPw?.pw?._id === pw._id}
                              onDragStart={e => { e.dataTransfer.effectAllowed = 'copyMove'; setDraggedPw({ pw, isCopy: e.altKey }); }}
                              onDragEnd={endPlanDrag}
                              compliance={findCompliance(pw, allActs)}
                              pairingState={pairingStateFor(pw, allActs, getLocalDateString(new Date()))}
                              linkedActivity={item.act || pwToAct.get(String(pw._id)) || null}
                              onSelectLinked={(act) => handleActivityClick(act, null)}
                              onDuplicate={onCopyPlannedWorkout ? (p) => onCopyPlannedWorkout(p, p.date) : null}
                              onDelete={onDeletePlannedWorkout}
                              onRepeat={onCopyPlannedWorkout ? handleRepeatWorkout : null}
                              {...planReorderProps(pw, key, plannedForDay)}
                            />
                          );
                        }

                        const a = item.act;
                        const activityId = a.id || a._id;
                        const isSelected = effectiveSelectedId && String(activityId) === String(effectiveSelectedId);
                        const activityTitle = a.title || a.name || a.originalFileName || 'Activity';
                        if (view === 'week') {
                          return (
                            <WeekActivityCard
                              key={pi}
                              a={a}
                              isSelected={isSelected}
                              onSelect={handleSelectActivity}
                              onActivityClick={handleActivityClick}
                              onAddLactate={onAddLactate}
                              catBadgeStyle={catBadgeStyle}
                              catLabel={catLabel}
                              userProfile={userProfile}
                            />
                          );
                        }
                        // Month view card — enriched with duration + distance + TSS
                        const dur = a.duration || a.elapsed_time || a.movingTime || 0;
                        const durStr = dur > 0 ? `${Math.floor(dur/3600)}:${String(Math.floor((dur%3600)/60)).padStart(2,'0')}` : null;
                        const dist = a.distance || a.totalDistance || 0;
                        const distStr = dist > 0 ? formatDistanceForUser(dist, user) : null;
                        const tssVal = Number(a.tss || a.trainingLoad || 0);

                        return (
                          <div key={pi} className="relative group/act w-full max-w-full" style={{ minWidth: 0 }}>
                            <button
                              onClick={(e) => { const r = e.currentTarget?.getBoundingClientRect() || null; handleActivityClick(a, r); }}
                              className={`w-full max-w-full text-left text-[11px] md:text-xs px-2 md:px-2.5 py-2 rounded-lg transition-all flex flex-col gap-1 ${
                                isSelected
                                  ? 'bg-gradient-to-r from-primary to-primary-dark text-white shadow-md hover:shadow-lg ring-2 ring-primary/20'
                                  : 'bg-white hover:bg-gray-50 text-gray-800 shadow-sm hover:shadow-md'
                              }`}
                              style={{
                                minWidth: 0,
                                overflow: 'hidden',
                                ...outlineBorder({
                                  color: a.category
                                    ? (catBorderColor(a.category) || '#e5e7eb')
                                    : (isSelected ? 'transparent' : '#e5e7eb'),
                                  leftColor: a.category ? (catBorderColor(a.category) || sportColor(a.sport)) : sportColor(a.sport),
                                  leftWidth: 3,
                                }),
                              }}
                              title={activityTitle}
                            >
                              {/* Title row */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <SportIcon sport={a.sport} className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate min-w-0 flex-1 font-semibold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activityTitle}</span>
                                {tssVal > 0 && (
                                  <span className={`flex-shrink-0 text-[10px] font-bold ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>{Math.round(tssVal)}</span>
                                )}
                              </div>
                              {/* Category + duration + distance row — category gets its
                                  own breathing room here so it's readable in narrow month cells. */}
                              {(a.category || durStr || distStr) && (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {a.category && (
                                    <span
                                      className="text-[10px] uppercase tracking-wide px-1.5 py-[1px] rounded-md flex-shrink-0 font-bold border leading-tight"
                                      style={isSelected
                                        ? { backgroundColor: 'rgba(255,255,255,.20)', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }
                                        : catBadgeStyle(a.category)}
                                      title={catLabel(a.category)}
                                    >
                                      {catLabel(a.category)}
                                    </span>
                                  )}
                                  {(durStr || distStr) && (
                                    <span className={`text-[10px] truncate ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
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
                                className="absolute top-0.5 right-0.5 hidden group-hover/act:flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-700 hover:bg-violet-200 border border-violet-200 leading-none z-10"
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
                          className="w-full text-left text-[11px] md:text-xs px-2 md:px-2.5 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 shadow-sm transition-all font-medium flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                          className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all ${weekSummaryTab === tabId ? 'bg-primary text-white shadow-sm' : 'text-gray-500'}`}
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
                  weekPlannedWorkouts={filteredPlannedWorkouts.filter(pw => {
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
          profile={userProfile}
          onClose={() => setActivityModal(null)}
          onEditPlanned={onSelectPlannedWorkout}
          onAddLactate={onAddLactate}
          onPlannedSaved={(saved) => {
            setActivityModal(prev => prev ? { ...prev, plannedWorkout: saved } : prev);
            onPlannedSaved?.(saved);
          }}
          onCompletedSaved={(detail) => {
            setActivityModal((prev) => {
              if (!prev?.activity) return prev;
              const patch = metricsPatchFromDetail(detail);
              return { ...prev, activity: { ...prev.activity, ...patch } };
            });
            onCompletedSaved?.(detail);
          }}
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
          user={user}
          onPlanWorkout={onPlanWorkout}
          onAddDayTheme={onDayPlanSave ? (d) => { setAddCompletedDate(null); setDayPlanEditDate(d); } : null}
          onAddPeriod={onPeriodSave ? (d) => { setAddCompletedDate(null); setPeriodEdit({ defaultDate: d }); } : null}
          onClose={() => setAddCompletedDate(null)}
          onSaved={() => {
            setAddCompletedDate(null);
            onAddCompletedWorkout?.();
            reloadRaces();
          }}
        />
      )}
      {addRaceOpen && (
        <AddCompletedSheet
          date={new Date()}
          athleteId={athleteId}
          user={user}
          initialStep="race"
          onClose={() => setAddRaceOpen(false)}
          onSaved={() => {
            setAddRaceOpen(false);
            onAddCompletedWorkout?.();
            reloadRaces();
          }}
        />
      )}
      {/* Day-theme editor (mobile) */}
      {dayPlanEditDate && onDayPlanSave && (
        <DayPlanEditSheet
          date={dayPlanEditDate}
          plan={dayPlanByDate.get(dayPlanEditDate)}
          onClose={() => setDayPlanEditDate(null)}
          onSave={async (payload, dates) => {
            // `dates` includes the base day plus any weekly-repeat occurrences.
            const list = Array.isArray(dates) && dates.length ? dates : [dayPlanEditDate];
            let result = null;
            for (const d of list) {
              result = await onDayPlanSave(d, payload);
            }
            setDayPlanEditDate(null);
            return result;
          }}
          onDelete={async () => {
            if (onDayPlanDelete) await onDayPlanDelete(dayPlanEditDate);
            setDayPlanEditDate(null);
          }}
        />
      )}
      {/* Calendar period editor */}
      {periodEdit && onPeriodSave && (
        <PeriodEditSheet
          period={periodEdit.period || null}
          defaultDate={periodEdit.defaultDate || null}
          onClose={() => setPeriodEdit(null)}
          onSave={async (payload) => {
            const result = await onPeriodSave(payload);
            setPeriodEdit(null);
            return result;
          }}
          onDelete={onPeriodDelete ? async (id) => {
            await onPeriodDelete(id);
            setPeriodEdit(null);
          } : null}
        />
      )}

      {selectedRace && (
        <RaceDetailModal
          race={selectedRace}
          activities={activities}
          plannedWorkouts={plannedWorkouts}
          userProfile={userProfile}
          user={user}
          onClose={() => setSelectedRace(null)}
        />
      )}
    </>
  );
}
