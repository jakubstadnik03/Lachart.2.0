import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PencilIcon, CheckIcon, XMarkIcon, ChevronLeftIcon, SparklesIcon } from '@heroicons/react/24/outline';
import AutoClassifyModal from '../components/FitAnalysis/AutoClassifyModal';
import { useCategories } from '../context/CategoryContext';
import { getFitTrainings, getFitTraining, deleteFitTraining, createLap, getTrainingCommentCounts } from '../services/api';
import TrainingComments from '../components/TrainingComments';
import { motion } from 'framer-motion';
import CalendarView, { DayPlanEditSheet, PeriodEditSheet } from '../components/Calendar/CalendarView';
import { Skeleton, SkeletonCard } from '../components/common/Skeleton';
import { buildActivityMatcher, metricsPatchFromDetail, upsertPlannedWorkoutList } from '../utils/activityEventPatches';
import IntervalChart from '../components/FitAnalysis/IntervalChart';
import { getIntegrationStatus } from '../services/api';
import { listExternalActivities } from '../services/api';
import { getStravaActivityDetail, updateStravaActivity, getAllTitles, createStravaLap, deleteStravaLap, getTrainingById, addTraining, updateTraining } from '../services/api';
import api from '../services/api';
import { getPlannedWorkouts, createPlannedWorkout, updatePlannedWorkout, deletePlannedWorkout, getWorkoutTemplates, getDayPlans, setDayPlan as apiSetDayPlan, deleteDayPlan as apiDeleteDayPlan, getPeriods, savePeriod as apiSavePeriod, deletePeriod as apiDeletePeriod } from '../services/workoutPlannerApi';
import WorkoutPlanModal from '../components/WorkoutPlanner/WorkoutPlanModal';
import WorkoutCompareModal from '../components/WorkoutPlanner/WorkoutCompareModal';
import TrainingStats from '../components/FitAnalysis/TrainingStats';
import CalendarPeriodStats from '../components/FitAnalysis/CalendarPeriodStats';
import LapsTable from '../components/FitAnalysis/LapsTable';
import { useAuth } from '../context/AuthProvider';
import { useNotification } from '../context/NotificationContext';
import UpgradeModal from '../components/UpgradeModal';
import { usePremium } from '../hooks/usePremium';
import SimilarWorkoutsPanel from '../components/FitAnalysis/SimilarWorkoutsPanel';
import TrainingForm from '../components/TrainingForm';
import TrainingChart from '../components/FitAnalysis/TrainingChart';
import { prepareTrainingChartData, formatDuration, formatDistance, normalizeStravaLapDistanceRaw, lapSpeedMpsForChart } from '../utils/fitAnalysisUtils';
import { resolveDistanceUnitSystem } from '../utils/unitsConverter';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Calls map.invalidateSize() after mount + after a short delay — fixes blank map on mobile */
function MapInvalidator({ positions }) {
  const map = useMap();

  // Fit map to the full route. Robust against:
  //   1. Container being 0×0 at first paint (mobile, tab switches)
  //   2. The map's `center`/`zoom` props "winning" against fitBounds on initial mount
  //   3. Layout reflow after fonts / surrounding content settles
  React.useEffect(() => {
    if (!Array.isArray(positions) || positions.length < 2) return;
    let bounds;
    try {
      bounds = L.latLngBounds(positions);
      if (!bounds.isValid()) return;
    } catch (_) { return; }

    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      try {
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [22, 22], animate: false });
      } catch (_) { /* ignore */ }
    };

    // Run several times, escalating, so we cover slow layouts on mobile.
    // Using rAF + delayed timeouts catches ~99% of paint-timing edge cases.
    const r1 = requestAnimationFrame(fit);
    const t1 = setTimeout(fit, 60);
    const t2 = setTimeout(fit, 250);
    const t3 = setTimeout(fit, 600);
    const t4 = setTimeout(fit, 1200);

    // Re-fit whenever the map container actually resizes (covers tab switches,
    // safe-area insets settling, etc.) — only do this for ~3 seconds after mount
    // so it doesn't interfere with user pan/zoom afterwards.
    const container = map.getContainer();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      ro = new ResizeObserver(() => fit());
      ro.observe(container);
      setTimeout(() => { if (ro) { ro.disconnect(); ro = null; } }, 3000);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4);
      if (ro) ro.disconnect();
    };
  }, [map, positions]);

  return null;
}

// Fix Leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

/** Odpověď z API / localStorage cache může být objekt místo pole — zabrání data.forEach crash */
function normalizeApiList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.trainings)) return payload.trainings;
  if (payload && Array.isArray(payload.activities)) return payload.activities;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

const deduplicateStravaLaps = (laps = []) => {
  if (!Array.isArray(laps) || laps.length === 0) return [];

  const seen = new Map();
  const unique = [];

  const normalizeTime = (timeStr) => {
    if (!timeStr) return null;
    try {
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return null;
      // Round to nearest second to handle small differences
      return Math.floor(date.getTime() / 1000);
    } catch {
      return null;
    }
  };

  const buildKey = (lap, index, cumulativeTime = 0) => {
    // Priority 1: startTime or start_date (most reliable for identifying duplicates)
    const startTime = lap.startTime || lap.start_date;
    const normalizedTime = normalizeTime(startTime);
    if (normalizedTime !== null) {
      return `time_${normalizedTime}`;
    }
    
    // Priority 2: lapNumber (fallback when timestamp is unavailable)
    if (lap.lapNumber !== undefined && lap.lapNumber !== null) {
      return `lap_${lap.lapNumber}`;
    }
    
    // Priority 3: Combination of elapsed_time, distance, and power
    // Match backend key format: fallback_t${elapsedTime}_d${distance}_p${power}
    // Don't use cumulative time or hr/cadence to match backend deduplication
    const elapsedTime = Math.round(lap.elapsed_time || 0);
    const distance = Math.round((lap.distance || 0) * 10) / 10; // Round to 1 decimal
    const power = Math.round((lap.average_watts || 0) * 10) / 10; // Round to 1 decimal
    return `fallback_t${elapsedTime}_d${distance}_p${power}`;
  };

  let cumulativeTime = 0;
  laps.forEach((lap, index) => {
    const enriched = { ...lap };
    if (enriched.__sourceIndex === undefined || enriched.__sourceIndex === null) {
      enriched.__sourceIndex = index;
    }

    // Calculate cumulative time for this lap (before adding current lap duration)
    const key = buildKey(enriched, index, cumulativeTime);
    const hasLactate = enriched.lactate !== null && enriched.lactate !== undefined;

    if (seen.has(key)) {
      const existingIdx = seen.get(key);
      const existingLap = unique[existingIdx];
      const existingHasLactate = existingLap?.lactate !== null && existingLap?.lactate !== undefined;

      // Prefer lap with lactate, or keep the first one if both have or both don't have lactate
      if (hasLactate && !existingHasLactate) {
        unique[existingIdx] = enriched;
        // Update cumulative time even when replacing
        cumulativeTime += enriched.elapsed_time || 0;
      }
      // Don't update cumulative time for skipped duplicates
    } else {
      seen.set(key, unique.length);
      unique.push(enriched);
      // Update cumulative time for next lap
      cumulativeTime += enriched.elapsed_time || 0;
    }
  });


  return unique;
};

// Deduplicate FIT training laps
const deduplicateFitTrainingLaps = (laps = []) => {
  if (!Array.isArray(laps) || laps.length === 0) return [];

  const seen = new Map();
  const unique = [];

  const normalizeTime = (timeStr) => {
    if (!timeStr) return null;
    try {
      const date = new Date(timeStr);
      if (isNaN(date.getTime())) return null;
      // Round to nearest second to handle small differences
      return Math.floor(date.getTime() / 1000);
    } catch {
      return null;
    }
  };

  laps.forEach((lap, index) => {
    // Strategy 1: Use _id if available (MongoDB ObjectId)
    if (lap._id) {
      const idStr = lap._id.toString();
      if (seen.has(`id_${idStr}`)) {
        console.log(`Deduplicate FIT: Skipping duplicate lap by _id at index ${index}`);
        return;
      }
      seen.set(`id_${idStr}`, true);
      unique.push(lap);
      return;
    }
    
    // Strategy 2: Use startTime or start_date as primary identifier
    const startTime = lap.startTime || lap.start_time || lap.start_date;
    if (startTime) {
      const normalizedTime = normalizeTime(startTime);
      if (normalizedTime !== null) {
        const key = `time_${normalizedTime}`;
        if (seen.has(key)) {
          return;
        }
        seen.set(key, true);
        unique.push(lap);
        return;
      }
    }
    
    // Strategy 3: Use combination of properties
    const elapsedTime = Math.round(lap.totalElapsedTime || lap.total_elapsed_time || lap.elapsed_time || 0);
    const distance = Math.round((lap.totalDistance || lap.total_distance || lap.distance || 0) * 10) / 10;
    const power = Math.round((lap.avgPower || lap.avg_power || lap.average_watts || 0) * 10) / 10;
    const hr = Math.round((lap.average_heartrate ?? lap.avgHeartRate ?? lap.avg_heart_rate ?? 0) * 10) / 10;
    
    const key = `t${elapsedTime}_d${distance}_p${power}_hr${hr}`;
    
    if (seen.has(key)) {
      return;
    }
    seen.set(key, index);
    unique.push(lap);
  });


  return unique;
};

// eslint-disable-next-line no-unused-vars
const INTERVAL_SENSITIVITY_CONFIG = {
  high: {
    label: 'High',
    changeThreshold: 0.035, // More sensitive: 3.5% (between 3% and 4.5%) - detects smaller changes
    stabilityWindow: 1.2, // More sensitive: 1.2 seconds (between 1s and 1.5s) - faster detection
    minIntervalDuration: 4, // More sensitive: 4 seconds (catches shorter intervals)
    mergeThreshold: 5, // More sensitive: 5 seconds (smaller gaps)
    smoothingMultiplier: 0.32, // More sensitive: 0.32 (less smoothing, more sensitivity)
    smoothingMin: 1
  },
  medium: {
    label: 'Medium',
    changeThreshold: 0.06, // Reduced from 0.1 to 0.06
    stabilityWindow: 2, // Reduced from 3 to 2 seconds
    minIntervalDuration: 6, // Reduced from 8 to 6 seconds
    mergeThreshold: 10, // Reduced from 15 to 10 seconds
    smoothingMultiplier: 0.5, // Reduced from 0.6
    smoothingMin: 2
  },
  low: {
    label: 'Low',
    changeThreshold: 0.12, // Reduced from 0.18 to 0.12
    stabilityWindow: 3, // Reduced from 4 to 3 seconds
    minIntervalDuration: 10, // Reduced from 12 to 10 seconds
    mergeThreshold: 20, // Reduced from 25 to 20 seconds
    smoothingMultiplier: 0.7, // Reduced from 0.8
    smoothingMin: 3
  }
};

// Same palette as LactateStatistics.jsx POWER_ZONES (power bars)
const LACTATE_STATS_STYLE_POWER_ZONES = [
  { zone: 1, description: 'Recovery', color: '#2596be' },
  { zone: 2, description: 'Aerobic', color: '#1e7a9a' },
  { zone: 3, description: 'Tempo', color: '#185e7a' },
  { zone: 4, description: 'Threshold', color: '#0f425a' },
  { zone: 5, description: 'VO2max', color: '#08263a' },
];

// Strava Laps Table Component
const StravaLapsTable = ({ selectedStrava, selectedStravaStreams = null, stravaChartRef, maxTime, loadStravaDetail, loadExternalActivities, onExportToTraining, onAddLactate = null, user = null, userProfile = null, selectedLapNumber = null, onSelectLapNumber = null }) => {
  const [saving, setSaving] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [editingMode, setEditingMode] = useState(false); // Mode for selecting intervals to merge
  const [selectedLapIndices, setSelectedLapIndices] = useState(new Set()); // Selected lap indices for merging
  const [isMobileTable, setIsMobileTable] = useState(window.innerWidth < 768);
  const lapRefs = useRef({});
  const [zonesView, setZonesView] = useState('heartrate'); // 'heartrate' | 'power'
  const [zoneTooltipData, setZoneTooltipData] = useState(null); // { x, y, content } — LactateStatistics-style

  /** Laps list/table only — scroll inside so Activity Intervals + Time in zones stay usable on one screen */
  const lapsScrollShellClass =
    'overflow-x-auto overflow-y-auto max-h-[min(34dvh,19rem)] sm:max-h-[min(38dvh,23rem)] md:max-h-[min(42dvh,28rem)] rounded-xl border border-gray-200 bg-white overscroll-y-contain touch-pan-y';

  // Detect mobile (must be before early return)
  useEffect(() => {
    const handleResize = () => {
      setIsMobileTable(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // When selectedLapNumber changes (from chart click), scroll the list to that lap on mobile
  useEffect(() => {
    if (selectedLapNumber == null) return;
    const el = lapRefs.current[selectedLapNumber];
    if (el && el.scrollIntoView) {
      // Scroll the nearest scrollable parent (desktop list container) to keep graph + row visible.
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedLapNumber]);

  // Use laps passed from selectedStrava (already deduplicated during load)
  const uniqueLaps = React.useMemo(() => selectedStrava?.laps || [], [selectedStrava?.laps]);
  const cumulativeLapStartTimes = React.useMemo(() => {
    let total = 0;
    return uniqueLaps.map((lap) => {
      const start = total;
      total += Number(lap?.elapsed_time || 0);
      return start;
    });
  }, [uniqueLaps]);

  const zoneKeys = React.useMemo(() => ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'], []);
  // HR bars: single red theme (like LactateStatistics HR screenshot)
  const hrRedColor = 'rgba(239, 68, 68, 0.95)';

  const getPowerBarColor = (zKey) => {
    const n = parseInt(String(zKey).replace('zone', ''), 10);
    const row = LACTATE_STATS_STYLE_POWER_ZONES.find((z) => z.zone === n);
    return row?.color || '#2596be';
  };

  const stravaSportType = React.useMemo(() => {
    const s = (selectedStrava?.sport || selectedStrava?.sport_type || selectedStrava?.type || '').toLowerCase();
    if (s.includes('swim')) return 'swimming';
    if (s.includes('run') || s.includes('walk') || s.includes('hike')) return 'running';
    return 'cycling';
  }, [selectedStrava]);

  const powerZonesForSport = React.useMemo(
    () => userProfile?.powerZones?.[stravaSportType] || {},
    [userProfile, stravaSportType]
  );
  const hrZonesForSport = React.useMemo(
    () => userProfile?.heartRateZones?.[stravaSportType] || {},
    [userProfile, stravaSportType]
  );

  const parseZoneNumber = useCallback((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const cleaned = v.trim().toLowerCase();
    if (!cleaned) return null;
    if (cleaned === '∞' || cleaned.includes('inf')) return Infinity;
    const n = Number(cleaned.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }, []);

  const formatPaceSeconds = (sec) => {
    const n = Number(sec);
    if (!Number.isFinite(n) || n <= 0) return '-';
    const minutes = Math.floor(n / 60);
    const seconds = Math.max(0, Math.round(n % 60));
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const findZoneKeyForValue = useCallback((value, zonesObj) => {
    const val = Number(value);
    if (!Number.isFinite(val)) return null;

    // Build normalised boundaries: if a zone has no min, inherit it from the previous zone's max
    // so gaps between zones don't silently swallow data.
    let prevMax = null;
    let lastValidKey = null;
    let lastValidMax = null; // highest defined max across all zones

    for (const zKey of zoneKeys) {
      const def = zonesObj?.[zKey];
      if (!def) continue;

      let min = parseZoneNumber(def?.min);
      const max = def?.max === undefined ? null : parseZoneNumber(def?.max);

      // Auto-fill missing min from previous zone's max
      if (min === null && prevMax !== null) min = prevMax;
      if (min === null) { prevMax = max ?? prevMax; continue; }

      // Pace zones can be stored in reverse order (slower->faster), so match by normalised range.
      if (max === null || max === Infinity) {
        if (val >= min) return zKey;
        prevMax = min;
        continue;
      }
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      if (val >= low && val <= high) return zKey;

      prevMax = high;
      lastValidKey = zKey;
      if (lastValidMax === null || high > lastValidMax) lastValidMax = high;
    }

    // Catch-all: value is above all defined zone maxes → assign to the last zone
    if (lastValidKey !== null && lastValidMax !== null && val > lastValidMax) {
      return lastValidKey;
    }

    return null;
  }, [zoneKeys, parseZoneNumber]);

  const getPowerMetricFromLap = useCallback((lap) => {
    if (!lap) return null;
    if (stravaSportType === 'cycling') {
      const p = Number(lap.average_watts ?? lap.avgPower ?? lap.average_power ?? lap.power ?? 0);
      return Number.isFinite(p) && p > 0 ? p : null;
    }

    // For run/swim: derive pace seconds from speed (lap.average_speed is in m/s in this file)
    const speedMps = Number(lap.average_speed ?? lap.avgSpeed ?? lap.speed ?? 0);
    if (!Number.isFinite(speedMps) || speedMps <= 0) return null;
    if (stravaSportType === 'running') return 1000 / speedMps; // sec/km
    return 100 / speedMps; // sec/100m (swimming)
  }, [stravaSportType]);

  const getHrMetricFromLap = useCallback((lap) => {
    const hr = Number(lap.average_heartrate ?? lap.avgHeartRate ?? lap.heartRate ?? 0);
    return Number.isFinite(hr) && hr > 0 ? hr : null;
  }, []);

  const timeInZones = React.useMemo(() => {
    const powerTimes = Object.fromEntries(zoneKeys.map((k) => [k, 0]));
    const hrTimes = Object.fromEntries(zoneKeys.map((k) => [k, 0]));
    const powerWeighted = Object.fromEntries(zoneKeys.map((k) => [k, 0]));
    const hrWeighted = Object.fromEntries(zoneKeys.map((k) => [k, 0]));
    let powerTotal = 0;
    let hrTotal = 0;

    const streamTime = selectedStravaStreams?.time?.data || selectedStravaStreams?.time || [];
    const streamSpeed = selectedStravaStreams?.velocity_smooth?.data || selectedStravaStreams?.velocity_smooth || [];
    const streamPower = selectedStravaStreams?.watts?.data || selectedStravaStreams?.watts || [];
    const streamHr = selectedStravaStreams?.heartrate?.data || selectedStravaStreams?.heartrate || [];

    const hasTimeStream = Array.isArray(streamTime) && streamTime.length > 1;
    if (hasTimeStream) {
      for (let i = 1; i < streamTime.length; i++) {
        const dt = Number(streamTime[i]) - Number(streamTime[i - 1]);
        if (!Number.isFinite(dt) || dt <= 0 || dt > 30) continue;

        let pMetric = null;
        if (stravaSportType === 'cycling') {
          const watts = Number(streamPower[i]);
          pMetric = Number.isFinite(watts) && watts > 0 ? watts : null;
        } else {
          const speedMps = Number(streamSpeed[i]);
          if (Number.isFinite(speedMps) && speedMps > 0) {
            pMetric = stravaSportType === 'running' ? 1000 / speedMps : 100 / speedMps;
          }
        }

        if (pMetric != null) {
          powerTotal += dt;
          const pZone = findZoneKeyForValue(pMetric, powerZonesForSport);
          if (pZone) {
            powerTimes[pZone] += dt;
            powerWeighted[pZone] += pMetric * dt;
          }
        }

        const hrMetric = Number(streamHr[i]);
        if (Number.isFinite(hrMetric) && hrMetric > 0) {
          hrTotal += dt;
          const hrZone = findZoneKeyForValue(hrMetric, hrZonesForSport);
          if (hrZone) {
            hrTimes[hrZone] += dt;
            hrWeighted[hrZone] += hrMetric * dt;
          }
        }
      }
    } else {
      // Fallback for activities where Strava stream data are unavailable.
      for (const lap of uniqueLaps) {
        const sec = Number(lap?.elapsed_time ?? lap?.elapsedTime ?? 0);
        if (!Number.isFinite(sec) || sec <= 0) continue;

        const pMetric = getPowerMetricFromLap(lap);
        if (pMetric != null) {
          powerTotal += sec;
          const pZone = findZoneKeyForValue(pMetric, powerZonesForSport);
          if (pZone) {
            powerTimes[pZone] += sec;
            powerWeighted[pZone] += pMetric * sec;
          }
        }

        const hrMetric = getHrMetricFromLap(lap);
        if (hrMetric != null) {
          hrTotal += sec;
          const hrZone = findZoneKeyForValue(hrMetric, hrZonesForSport);
          if (hrZone) {
            hrTimes[hrZone] += sec;
            hrWeighted[hrZone] += hrMetric * sec;
          }
        }
      }
    }

    const toPercent = (secInZone, totalSec) => {
      if (!Number.isFinite(totalSec) || totalSec <= 0) return 0;
      return (secInZone / totalSec) * 100;
    };

    const powerPercents = Object.fromEntries(zoneKeys.map((k) => [k, toPercent(powerTimes[k], powerTotal)]));
    const hrPercents = Object.fromEntries(zoneKeys.map((k) => [k, toPercent(hrTimes[k], hrTotal)]));

    const avgPowerByZone = Object.fromEntries(
      zoneKeys.map((k) => {
        const t = powerTimes[k];
        return [k, t > 0 ? powerWeighted[k] / t : 0];
      })
    );
    const avgHrByZone = Object.fromEntries(
      zoneKeys.map((k) => {
        const t = hrTimes[k];
        return [k, t > 0 ? hrWeighted[k] / t : 0];
      })
    );

    return {
      powerTimes,
      hrTimes,
      powerTotal,
      hrTotal,
      powerPercents,
      hrPercents,
      avgPowerByZone,
      avgHrByZone,
    };
  }, [selectedStravaStreams, stravaSportType, uniqueLaps, powerZonesForSport, hrZonesForSport, findZoneKeyForValue, getPowerMetricFromLap, getHrMetricFromLap, zoneKeys]);

  const formatPowerZoneRange = (zKey) => {
    const def = powerZonesForSport?.[zKey];
    if (!def) return '-';
    let min = parseZoneNumber(def?.min);
    const max = parseZoneNumber(def?.max);

    // If min is not set, inherit from the previous zone's max
    if (min === null) {
      const idx = zoneKeys.indexOf(zKey);
      for (let i = idx - 1; i >= 0; i--) {
        const prevDef = powerZonesForSport?.[zoneKeys[i]];
        const prevMax = parseZoneNumber(prevDef?.max);
        if (prevMax !== null && prevMax !== Infinity) { min = prevMax; break; }
      }
    }
    if (min === null) return '-';

    if (stravaSportType === 'cycling') {
      if (max === null || max === Infinity) return `>${Math.round(min)} W`;
      return `${Math.round(min)}-${Math.round(max)} W`;
    }

    const unit = stravaSportType === 'running' ? '/km' : '/100m';
    if (max === null || max === Infinity) return `>${formatPaceSeconds(min)} ${unit}`;
    return `${formatPaceSeconds(min)}-${formatPaceSeconds(max)} ${unit}`;
  };

  const formatHrZoneRange = (zKey) => {
    const def = hrZonesForSport?.[zKey];
    if (!def) return '-';
    const min = parseZoneNumber(def?.min);
    const max = parseZoneNumber(def?.max);
    if (min === null) return '-';
    if (max === null || max === Infinity) return `>${Math.round(min)} bpm`;
    return `${Math.round(min)}-${Math.round(max)} bpm`;
  };

  const hasHrZoneDefs = React.useMemo(() => {
    return zoneKeys.some((zKey) => {
      const def = hrZonesForSport?.[zKey];
      if (!def) return false;
      return (def?.min !== '' && def?.min !== undefined) || (def?.max !== '' && def?.max !== undefined);
    });
  }, [hrZonesForSport, zoneKeys]);

  const hasPowerZoneDefs = React.useMemo(() => {
    return zoneKeys.some((zKey) => {
      const def = powerZonesForSport?.[zKey];
      if (!def) return false;
      return (def?.min !== '' && def?.min !== undefined) || (def?.max !== '' && def?.max !== undefined);
    });
  }, [powerZonesForSport, zoneKeys]);

  useEffect(() => {
    if (!hasHrZoneDefs && hasPowerZoneDefs) setZonesView('power');
    else if (hasHrZoneDefs && !hasPowerZoneDefs) setZonesView('heartrate');
  }, [hasHrZoneDefs, hasPowerZoneDefs]);

  const zoneLabelForPower = (zKey) => {
    const desc = powerZonesForSport?.[zKey]?.description;
    if (desc && String(desc).trim()) return String(desc).trim();
    const n = parseInt(String(zKey).replace('zone', ''), 10);
    const row = LACTATE_STATS_STYLE_POWER_ZONES.find((z) => z.zone === n);
    return row?.description || zKey.replace('zone', 'Zone ');
  };

  const zoneLabelForHr = (zKey) => {
    const desc = hrZonesForSport?.[zKey]?.description;
    if (desc && String(desc).trim()) return String(desc).trim();
    return zKey.replace('zone', 'Zone ');
  };

  const renderZoneTooltipPortal = () =>
    zoneTooltipData ? (
      <div
        className="fixed bg-white/95 backdrop-blur-sm rounded-lg shadow-xl border border-gray-200 p-3 z-[100] pointer-events-none text-xs"
        style={{
          left: `${zoneTooltipData.x + 15}px`,
          top: `${zoneTooltipData.y - 10}px`,
          transform: 'translateY(-100%)',
          minWidth: '180px',
        }}
      >
        {zoneTooltipData.content}
      </div>
    ) : null;

  const renderTimeInZonesBlock = () => {
    if (!userProfile) return null;
    if (!hasHrZoneDefs && !hasPowerZoneDefs) return null;

    const effectiveView =
      !hasHrZoneDefs ? 'power' : !hasPowerZoneDefs ? 'heartrate' : zonesView;

    const showHr = effectiveView === 'heartrate' && hasHrZoneDefs;
    const showPower = effectiveView === 'power' && hasPowerZoneDefs;

    return (
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {hasHrZoneDefs && hasPowerZoneDefs && (
            <div className="flex gap-1.5 rounded-lg border border-white/20 bg-white/10 p-1 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setZonesView('heartrate')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  effectiveView === 'heartrate'
                    ? 'bg-white/30 backdrop-blur-md text-gray-900 shadow-sm border border-white/30'
                    : 'bg-white/5 text-gray-700 hover:bg-white/15 border border-transparent'
                }`}
              >
                Heart rate
              </button>
              <button
                type="button"
                onClick={() => setZonesView('power')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  effectiveView === 'power'
                    ? 'bg-white/30 backdrop-blur-md text-gray-900 shadow-sm border border-white/30'
                    : 'bg-white/5 text-gray-700 hover:bg-white/15 border border-transparent'
                }`}
              >
                {stravaSportType === 'cycling' ? 'Power' : 'Pace'}
              </button>
            </div>
          )}
        </div>

        {showHr && (
          <div className={`bg-white/10 backdrop-blur-xl rounded-lg border border-white/20 shadow-md ${isMobileTable ? 'p-2' : 'p-2'}`}>
            <h4 className={`font-semibold text-gray-900 ${isMobileTable ? 'text-[11px] mb-1.5' : 'text-xs sm:text-sm mb-2'}`}>Time in Heart Rate Zone</h4>
            <div className={isMobileTable ? 'space-y-1.5' : 'space-y-2'}>
              {zoneKeys.map((zKey) => {
                const percent = timeInZones.hrPercents[zKey] ?? 0;
                const barWidth = percent > 0 ? percent : 5;
                const zoneTimeSec = timeInZones.hrTimes?.[zKey] ?? 0;
                const avgHr = timeInZones.avgHrByZone?.[zKey] ?? 0;
                const zoneLabel = zoneLabelForHr(zKey);
                const tooltipContent = (
                  <div className="space-y-1">
                    <div className="font-semibold text-gray-900">{zoneLabel}</div>
                    <div className="text-gray-600">Time: {formatDuration(zoneTimeSec)}</div>
                    {avgHr > 0 && (
                      <div className="text-red-500 font-medium">Avg HR: {Math.round(avgHr)} bpm</div>
                    )}
                    <div className="text-gray-600">Percentage: {percent.toFixed(1)}%</div>
                  </div>
                );
                const barTrack = (
                  <div
                    className={`relative w-full ${isMobileTable ? 'h-3' : 'h-8 flex-1'}`}
                    onMouseEnter={(e) => setZoneTooltipData({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                    onMouseMove={(e) => setZoneTooltipData({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                    onMouseLeave={() => setZoneTooltipData(null)}
                  >
                    <div className="h-full bg-white/10 backdrop-blur-md rounded overflow-hidden border border-white/15">
                      <div
                        className="h-full transition-all duration-500 cursor-pointer"
                        style={{
                          width: `${Math.min(100, barWidth)}%`,
                          backgroundColor: hrRedColor,
                          opacity: percent > 0 ? 0.95 : 0.22,
                        }}
                      />
                    </div>
                  </div>
                );

                return isMobileTable ? (
                  <div key={zKey} className="flex items-center gap-2"
                    onMouseEnter={(e) => setZoneTooltipData({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                    onMouseMove={(e) => setZoneTooltipData({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                    onMouseLeave={() => setZoneTooltipData(null)}
                  >
                    <div className="w-6 shrink-0 text-xs font-bold text-gray-700">{zKey.replace('zone', 'Z')}</div>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, barWidth)}%`, backgroundColor: hrRedColor, opacity: percent > 0 ? 0.9 : 0.2 }}
                      />
                    </div>
                    <div className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-800">{percent.toFixed(0)}%</div>
                    <div className="w-20 shrink-0 text-right text-xs text-gray-400 leading-tight">{formatHrZoneRange(zKey)}</div>
                  </div>
                ) : (
                  <div key={zKey} className="flex items-center gap-3">
                    <div className="w-8 shrink-0 text-left text-sm font-semibold text-gray-900">{zKey.replace('zone', 'Z')}</div>
                    {barTrack}
                    <div className="w-14 shrink-0 text-right text-sm font-semibold text-gray-900">{percent.toFixed(0)}%</div>
                    <div className="w-40 shrink-0 text-right text-xs text-gray-500">{formatHrZoneRange(zKey)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showPower && (
          <div className={`bg-white/10 backdrop-blur-xl rounded-lg border border-white/20 shadow-md ${isMobileTable ? 'p-2' : 'p-2'}`}>
            <h4 className={`font-semibold text-gray-900 ${isMobileTable ? 'text-[11px] mb-1.5' : 'text-xs sm:text-sm mb-2'}`}>
              Time in {stravaSportType === 'cycling' ? 'Power' : 'Pace'} Zone
            </h4>
            <div className={isMobileTable ? 'space-y-1.5' : 'space-y-2'}>
              {zoneKeys.map((zKey) => {
                const percent = timeInZones.powerPercents[zKey] ?? 0;
                const barWidth = percent > 0 ? percent : 5;
                const zoneTimeSec = timeInZones.powerTimes?.[zKey] ?? 0;
                const avgP = timeInZones.avgPowerByZone?.[zKey] ?? 0;
                const zoneLabel = zoneLabelForPower(zKey);
                const paceUnit = stravaSportType === 'running' ? '/km' : '/100m';
                const tooltipContent = (
                  <div className="space-y-1">
                    <div className="font-semibold text-gray-900">{zoneLabel}</div>
                    <div className="text-gray-600">Time: {formatDuration(zoneTimeSec)}</div>
                    {stravaSportType === 'cycling' && avgP > 0 && (
                      <div className="text-purple-600 font-medium">Avg Power: {Math.round(avgP)} W</div>
                    )}
                    {(stravaSportType === 'running' || stravaSportType === 'swimming') && avgP > 0 && (
                      <div className="text-blue-600 font-medium">
                        Avg Pace: {formatPaceSeconds(avgP)} {paceUnit}
                      </div>
                    )}
                    <div className="text-gray-600">Percentage: {percent.toFixed(1)}%</div>
                  </div>
                );
                const barTrack = (
                  <div
                    className={`relative w-full ${isMobileTable ? 'h-3' : 'h-8 flex-1'}`}
                    onMouseEnter={(e) => setZoneTooltipData({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                    onMouseMove={(e) => setZoneTooltipData({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                    onMouseLeave={() => setZoneTooltipData(null)}
                  >
                    <div className="h-full bg-white/10 backdrop-blur-md rounded overflow-hidden border border-white/15">
                      <div
                        className="h-full transition-all duration-500 cursor-pointer"
                        style={{
                          width: `${Math.min(100, barWidth)}%`,
                          backgroundColor: getPowerBarColor(zKey),
                          opacity: percent > 0 ? 0.85 : 0.25,
                        }}
                      />
                    </div>
                  </div>
                );

                return isMobileTable ? (
                  <div key={zKey} className="flex items-center gap-2"
                    onMouseEnter={(e) => setZoneTooltipData({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                    onMouseMove={(e) => setZoneTooltipData({ x: e.clientX, y: e.clientY, content: tooltipContent })}
                    onMouseLeave={() => setZoneTooltipData(null)}
                  >
                    <div className="w-6 shrink-0 text-xs font-bold text-gray-700">{zKey.replace('zone', 'Z')}</div>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, barWidth)}%`, backgroundColor: getPowerBarColor(zKey), opacity: percent > 0 ? 0.85 : 0.2 }}
                      />
                    </div>
                    <div className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-800">{percent.toFixed(0)}%</div>
                    <div className="w-20 shrink-0 text-right text-xs text-gray-400 leading-tight">{formatPowerZoneRange(zKey)}</div>
                  </div>
                ) : (
                  <div key={zKey} className="flex items-center gap-3">
                    <div className="w-8 shrink-0 text-left text-sm font-semibold text-gray-900">{zKey.replace('zone', 'Z')}</div>
                    {barTrack}
                    <div className="w-14 shrink-0 text-right text-sm font-semibold text-gray-900">{percent.toFixed(0)}%</div>
                    <div className="w-40 shrink-0 text-right text-xs text-gray-500">{formatPowerZoneRange(zKey)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };


  const handleDeleteLap = async (lapIndex) => {
    if (!window.confirm('Are you sure you want to delete this interval? This action cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      const uniqueLap = uniqueLaps[lapIndex];
      
      // Find the correct index in the original laps array
      // Use the same matching logic as deduplication
      const originalLaps = selectedStrava?.laps || [];
      let indexToDelete = -1;
      
      // Try to find by __sourceIndex first (if available and valid)
      if (uniqueLap?.__sourceIndex !== undefined && uniqueLap?.__sourceIndex !== null) {
        const sourceIdx = uniqueLap.__sourceIndex;
        if (sourceIdx >= 0 && sourceIdx < originalLaps.length) {
          // Verify it's the same lap by comparing key properties
          const sourceLap = originalLaps[sourceIdx];
          const matches = (
            (uniqueLap.startTime && sourceLap.startTime && uniqueLap.startTime === sourceLap.startTime) ||
            (uniqueLap.start_date && sourceLap.start_date && uniqueLap.start_date === sourceLap.start_date) ||
            (Math.abs((uniqueLap.elapsed_time || 0) - (sourceLap.elapsed_time || 0)) < 0.1 &&
             Math.abs((uniqueLap.distance || 0) - (sourceLap.distance || 0)) < 0.1 &&
             Math.abs((uniqueLap.average_watts || 0) - (sourceLap.average_watts || 0)) < 0.1)
          );
          if (matches) {
            indexToDelete = sourceIdx;
          }
        }
      }
      
      // If __sourceIndex didn't work, find by matching properties
      if (indexToDelete === -1) {
        for (let i = 0; i < originalLaps.length; i++) {
          const originalLap = originalLaps[i];
          
          // Match by startTime or start_date (most reliable)
          if (uniqueLap.startTime && originalLap.startTime && uniqueLap.startTime === originalLap.startTime) {
            indexToDelete = i;
            break;
          }
          if (uniqueLap.start_date && originalLap.start_date && uniqueLap.start_date === originalLap.start_date) {
            indexToDelete = i;
            break;
          }
          
          // Match by elapsed_time, distance, and power (fallback)
          const timeMatch = Math.abs((uniqueLap.elapsed_time || 0) - (originalLap.elapsed_time || 0)) < 0.1;
          const distanceMatch = Math.abs((uniqueLap.distance || 0) - (originalLap.distance || 0)) < 0.1;
          const powerMatch = Math.abs((uniqueLap.average_watts || 0) - (originalLap.average_watts || 0)) < 0.1;
          
          if (timeMatch && distanceMatch && powerMatch) {
            indexToDelete = i;
            break;
          }
        }
      }
      
      // Final fallback: use lapIndex if we couldn't find a match
      if (indexToDelete === -1) {
        console.warn('Could not find matching lap in original array, using index:', lapIndex);
        indexToDelete = lapIndex;
      }
      
      console.log('Deleting lap:', {
        uniqueIndex: lapIndex,
        originalIndex: indexToDelete,
        uniqueLap: {
          startTime: uniqueLap.startTime,
          elapsed_time: uniqueLap.elapsed_time,
          distance: uniqueLap.distance,
          average_watts: uniqueLap.average_watts
        }
      });
      
      await deleteStravaLap(selectedStrava.id, indexToDelete);
      await loadStravaDetail(selectedStrava.id);
      await loadExternalActivities(); // Reload to update calendar
      alert('Interval deleted successfully!');
    } catch (error) {
      console.error('Error deleting lap:', error);
      alert('Error deleting interval: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllLaps = async () => {
    if (!window.confirm(`Are you sure you want to delete ALL ${uniqueLaps.length} intervals? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingAll(true);
      // Collect all indices to delete, using originalIndex if available
      const indicesToDelete = uniqueLaps.map((lap, idx) => {
        const originalIndex = lap?.__sourceIndex;
        return (originalIndex !== undefined && originalIndex !== null) ? originalIndex : idx;
      });
      
      // Sort in descending order to avoid index shifting issues
      indicesToDelete.sort((a, b) => b - a);
      
      let deletedCount = 0;
      let errorCount = 0;

      // Delete from highest index to lowest to avoid index shifting
      for (const indexToDelete of indicesToDelete) {
        try {
          await deleteStravaLap(selectedStrava.id, indexToDelete);
          deletedCount++;
        } catch (error) {
          console.error('Error deleting lap at index', indexToDelete, ':', error);
          errorCount++;
        }
      }

      await loadStravaDetail(selectedStrava.id);
      await loadExternalActivities(); // Reload to update calendar
      
      if (errorCount > 0) {
        alert(`Deleted ${deletedCount} intervals. ${errorCount} intervals could not be deleted.`);
      } else {
        alert(`Successfully deleted all ${deletedCount} intervals!`);
      }
    } catch (error) {
      console.error('Error deleting all laps:', error);
      alert('Error deleting intervals: ' + (error.response?.data?.error || error.message));
    } finally {
      setDeletingAll(false);
    }
  };

  const handleToggleLapSelection = (lapIndex) => {
    setSelectedLapIndices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lapIndex)) {
        newSet.delete(lapIndex);
      } else {
        newSet.add(lapIndex);
      }
      return newSet;
    });
  };

  const handleMergeSelectedLaps = async () => {
    if (selectedLapIndices.size < 2) {
      alert('Please select at least 2 intervals to merge.');
      return;
    }

    const mergeCount = selectedLapIndices.size; // Save count before resetting
    if (!window.confirm(`Are you sure you want to merge ${mergeCount} intervals into one? This action cannot be undone.`)) {
      return;
    }

    try {
      setSaving(true);

      // Get activity start time (same logic as in graph rendering)
      const activityStartDateStr = selectedStrava?.start_date_local || 
                                   selectedStrava?.start_date || 
                                   selectedStrava?.raw?.start_date || 
                                   selectedStrava?.startDate;
      const activityStartDate = activityStartDateStr ? new Date(activityStartDateStr) : new Date();
      const activityStartTimeMs = activityStartDate.getTime();

      // Calculate start and end times for selected laps
      const selectedLaps = [];

      uniqueLaps.forEach((lap, idx) => {
        if (selectedLapIndices.has(idx)) {
          let startTimeSeconds = 0;
          
          // Use same logic as graph rendering to calculate startTime
          if (lap.startTime && typeof lap.startTime === 'string') {
            const lapStartTimeMs = new Date(lap.startTime).getTime();
            startTimeSeconds = (lapStartTimeMs - activityStartTimeMs) / 1000;
          } else if (lap.start_date) {
            const lapStartTimeMs = new Date(lap.start_date).getTime();
            startTimeSeconds = (lapStartTimeMs - activityStartTimeMs) / 1000;
          } else {
            // Fallback: calculate cumulative time
            startTimeSeconds = cumulativeLapStartTimes[idx] || 0;
          }
          
          // Ensure startTime is not negative
          if (startTimeSeconds < 0) {
            startTimeSeconds = 0;
          }
          
          const duration = lap.elapsed_time || 0;
          const endTimeSeconds = startTimeSeconds + duration;
          
          selectedLaps.push({
            index: idx,
            startTime: startTimeSeconds,
            endTime: endTimeSeconds,
            originalIndex: lap?.__sourceIndex ?? idx
          });
        }
      });

      // Find min start and max end time
      if (selectedLaps.length === 0) {
        alert('No valid intervals found to merge.');
        return;
      }

      const minStartTime = Math.min(...selectedLaps.map(l => l.startTime));
      const maxEndTime = Math.max(...selectedLaps.map(l => l.endTime));

      // Validate time range
      if (minStartTime < 0 || maxEndTime <= minStartTime) {
        alert('Invalid time range for merged interval. Please try again.');
        return;
      }

      console.log('Merging intervals:', {
        selectedLaps: selectedLaps.length,
        minStartTime,
        maxEndTime,
        duration: maxEndTime - minStartTime
      });

      // Delete selected laps in reverse order (from highest index to lowest)
      const indicesToDelete = selectedLaps.map(l => l.originalIndex).sort((a, b) => b - a);
      
      for (const indexToDelete of indicesToDelete) {
        try {
          await deleteStravaLap(selectedStrava.id, indexToDelete);
        } catch (error) {
          console.error('Error deleting lap at index', indexToDelete, ':', error);
          throw error;
        }
      }

      // Small delay to ensure backend has processed deletions
      await new Promise(resolve => setTimeout(resolve, 200));

      // Create merged interval
      const createResult = await createStravaLap(selectedStrava.id, {
        startTime: minStartTime,
        endTime: maxEndTime
      });

      console.log('Created merged interval:', createResult);

      // Reload data to get updated intervals
      await loadStravaDetail(selectedStrava.id);
      await loadExternalActivities(); // Reload to update calendar
      
      setEditingMode(false);
      setSelectedLapIndices(new Set());
      alert(`Successfully merged ${mergeCount} intervals into one!`);
    } catch (error) {
      console.error('Error merging laps:', error);
      alert('Error merging intervals: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  if (!selectedStrava?.laps || uniqueLaps.length === 0) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-4">Intervals</h3>
        <p className="text-sm text-gray-600">No intervals available</p>
      </div>
    );
  }

  // Mobile card layout
  if (isMobileTable) {
    const mobileSportRaw = (selectedStrava?.sport || selectedStrava?.sport_type || selectedStrava?.type || '').toLowerCase();
    const isStravaRun = mobileSportRaw.includes('run') || mobileSportRaw === 'walk' || mobileSportRaw === 'hike';
    const isStravaSwim = mobileSportRaw.includes('swim');
    const unitSystem = resolveDistanceUnitSystem(user, 'metric');
    const stravaPaceFmt = (spd) => {
      if (!spd || spd <= 0) return null;
      const seconds = isStravaSwim
        ? (unitSystem === 'imperial' ? Math.round(109.361 / spd) : Math.round(100 / spd))
        : Math.round(1000 / spd);
      const suffix = isStravaSwim ? (unitSystem === 'imperial' ? ' /100y' : ' /100m') : ' /km';
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}${suffix}`;
    };

    return (
      <>
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-bold text-gray-900">Laps</h3>
          <div className="flex gap-1.5">
            {onAddLactate && (
              <button
                onClick={() => onAddLactate(selectedStrava)}
                className="px-2.5 py-1 bg-primary text-white rounded-lg text-xs shadow-sm active:bg-primary-dark"
              >
                + Lactate
              </button>
            )}
            {onExportToTraining && (
              <button onClick={() => onExportToTraining()} className="px-2.5 py-1 bg-greenos text-white rounded-lg text-xs shadow-sm active:opacity-90">Export</button>
            )}
          </div>
        </div>

        <div className={lapsScrollShellClass}>
        <div className="divide-y divide-gray-100 pr-0.5">
          {uniqueLaps.map((lap, index) => {
            const startTime = cumulativeLapStartTimes[index] || 0;
            const endTime = startTime + (lap.elapsed_time || 0);
            const lapNumber = lap?.lapNumber ?? (index + 1);
            const isActive = selectedLapNumber != null && String(lapNumber) === String(selectedLapNumber);
            const elevationGain = lap.total_elevation_gain ?? lap.elevation_gain ?? lap.totalAscent ?? lap.total_ascent ?? null;
            const elevationLoss = lap.total_descent ?? lap.elevation_loss ?? lap.descent ?? null;
            let elevation = null;
            if (Number.isFinite(Number(elevationGain)) && Number.isFinite(Number(elevationLoss))) {
              elevation = Math.round(Number(elevationGain) - Number(elevationLoss));
            } else if (Number.isFinite(Number(elevationGain))) {
              elevation = Math.round(Number(elevationGain));
            } else if (Number.isFinite(Number(elevationLoss))) {
              elevation = -Math.round(Math.abs(Number(elevationLoss)));
            }
            const selectedStyle = isActive
              ? { borderLeftColor: 'rgb(118 126 181 / var(--tw-border-opacity, 1))' }
              : {};
            return (
              <button
                key={index}
                ref={el => { lapRefs.current[lapNumber] = el; }}
                onClick={() => {
                  if (onSelectLapNumber) {
                    onSelectLapNumber(isActive ? null : lapNumber);
                  }
                  if (!stravaChartRef || !stravaChartRef.current) return;
                  if (isActive) {
                    stravaChartRef.current.getEchartsInstance().dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
                    return;
                  }
                  const chart = stravaChartRef.current.getEchartsInstance();
                  const maxTimeMin = maxTime / 60;
                  const startPercent = ((startTime / 60) / maxTimeMin) * 100;
                  const endPercent = ((endTime / 60) / maxTimeMin) * 100;
                  const padding = Math.max(5, (endPercent - startPercent) * 0.1);
                  chart.dispatchAction({ type: 'dataZoom', start: Math.max(0, startPercent - padding), end: Math.min(100, endPercent + padding) });
                }}
                className={`w-full text-left py-2.5 px-1 flex items-center gap-3 transition-colors touch-manipulation ${
                  isActive ? 'bg-primary/10 border-l-[3px] border-primary' : lap.lactate ? 'bg-primary/5' : lap.exportedToTraining ? 'bg-primary/3' : 'active:bg-gray-50'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent', ...selectedStyle }}
              >
                <div className="w-7 text-center">
                  <span className={`text-xs font-bold ${isActive ? 'text-primary' : 'text-gray-400'}`}>{index + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 whitespace-nowrap overflow-x-auto overflow-y-hidden scrollbar-hide">
                    {normalizeStravaLapDistanceRaw(lap, { swim: isStravaSwim }) > 0 && (
                      <span className="text-sm font-semibold text-gray-900 shrink-0">
                        {formatDistance(normalizeStravaLapDistanceRaw(lap, { swim: isStravaSwim }), user, {
                          swim: isStravaSwim,
                          assumeMeters: true,
                        })}
                      </span>
                    )}
                    <span className="text-sm text-gray-600 shrink-0">{formatDuration(lap.elapsed_time)}</span>
                    {lapSpeedMpsForChart(lap) > 0 && (
                      <span className="text-xs text-gray-500 shrink-0">
                        {(isStravaRun || isStravaSwim)
                          ? stravaPaceFmt(lapSpeedMpsForChart(lap))
                          : `${(lapSpeedMpsForChart(lap) * 3.6).toFixed(1)} km/h`}
                      </span>
                    )}
                    {lap.average_heartrate && <span className="text-[13px] text-red-500 shrink-0">{Math.round(lap.average_heartrate)} bpm</span>}
                    {lap.average_watts > 0 && <span className="text-[13px] text-purple-600 shrink-0">{Math.round(lap.average_watts)} W</span>}
                    {elevation !== null && elevation !== 0 && (
                      <span className="text-[13px] text-emerald-600 shrink-0">{elevation > 0 ? '+' : ''}{elevation} m</span>
                    )}
                    {lap.lactate && <span className="text-[13px] font-semibold text-primary shrink-0">{lap.lactate.toFixed(1)} mmol/L</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={handleDeleteAllLaps} disabled={deletingAll || saving || uniqueLaps.length === 0} className="flex-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs border border-red-200 active:bg-red-100 disabled:opacity-50">
            {deletingAll ? 'Deleting...' : 'Delete All'}
          </button>
        </div>
        {renderTimeInZonesBlock()}
      </div>
      {renderZoneTooltipPortal()}
    </>
    );
  }

  return (
    <>
    <div>
      <div className="flex sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h3 className="text-base sm:text-lg font-semibold">Intervals</h3>
        <div className="flex gap-1.5 sm:gap-2 w-full sm:w-auto flex-wrap">
        {onAddLactate && (
          <button
            onClick={() => onAddLactate(selectedStrava)}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-primary text-white rounded-xl hover:bg-primary-dark shadow-md transition-colors w-full sm:w-auto"
          >
            Add Lactate
          </button>
        )}
     
        {editingMode && selectedLapIndices.size >= 2 && (
          <button
            onClick={handleMergeSelectedLaps}
            disabled={saving}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-colors w-full sm:w-auto"
          >
            {saving ? 'Merging...' : `Merge ${selectedLapIndices.size} Selected`}
          </button>
        )}
        <button
          onClick={handleDeleteAllLaps}
          disabled={deletingAll || saving || uniqueLaps.length === 0 || editingMode}
          className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-colors w-full sm:w-auto"
        >
          {deletingAll ? 'Deleting...' : 'Delete All Intervals'}
        </button>
        {onExportToTraining && (
          <button
            onClick={() => onExportToTraining()}
            disabled={editingMode}
            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-greenos text-white rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-colors w-full sm:w-auto"
          >
            Export to Training
          </button>
        )}
        </div>
      </div>
      <div className={`${lapsScrollShellClass} -mx-2 sm:mx-0`}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
            <tr>
              {editingMode && (
                <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                  <input
                    type="checkbox"
                    checked={selectedLapIndices.size === uniqueLaps.length && uniqueLaps.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedLapIndices(new Set(uniqueLaps.map((_, idx) => idx)));
                      } else {
                        setSelectedLapIndices(new Set());
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer"
                  />
                </th>
              )}
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Distance</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {(() => {
                  const sportRaw = (selectedStrava?.sport || selectedStrava?.sport_type || selectedStrava?.type || '').toLowerCase();
                  const isSwim = sportRaw.includes('swim');
                  const isRun = sportRaw.includes('run') || sportRaw === 'walk' || sportRaw === 'hike';
                  return (isRun || isSwim) ? 'Avg Pace' : 'Avg Speed';
                })()}
              </th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg HR</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Power</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Elevation</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Lactate</th>
              <th className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {uniqueLaps.map((lap, index) => {
              const sportRawLaps = (selectedStrava?.sport || selectedStrava?.sport_type || selectedStrava?.type || '').toLowerCase();
              const isSwimLapsRow = sportRawLaps.includes('swim');
              const startTime = cumulativeLapStartTimes[index] || 0;
              const endTime = startTime + (lap.elapsed_time || 0);
              const lapNumber = lap?.lapNumber ?? (index + 1);
              const isActive = selectedLapNumber != null && String(lapNumber) === String(selectedLapNumber);
              const elevationGain = lap.total_elevation_gain ?? lap.elevation_gain ?? lap.totalAscent ?? lap.total_ascent ?? null;
              const elevationLoss = lap.total_descent ?? lap.elevation_loss ?? lap.descent ?? null;
              let elevation = null;
              if (Number.isFinite(Number(elevationGain)) && Number.isFinite(Number(elevationLoss))) {
                elevation = Math.round(Number(elevationGain) - Number(elevationLoss));
              } else if (Number.isFinite(Number(elevationGain))) {
                elevation = Math.round(Number(elevationGain));
              } else if (Number.isFinite(Number(elevationLoss))) {
                elevation = -Math.round(Math.abs(Number(elevationLoss)));
              }

              return (
                <tr 
                  key={index}
                  ref={(el) => { lapRefs.current[lapNumber] = el; }}
                  onClick={(e) => {
                    if (editingMode && e.target.type === 'checkbox') return;
                    if (e.target.closest('button')) return;
                    if (!stravaChartRef.current || editingMode) return;

                    if (onSelectLapNumber) {
                      onSelectLapNumber(isActive ? null : lapNumber);
                    }
                    
                    const chart = stravaChartRef.current.getEchartsInstance();
                    const startTimeMin = startTime / 60;
                    const endTimeMin = endTime / 60;
                    const maxTimeMin = maxTime / 60;
                    
                    const startPercent = (startTimeMin / maxTimeMin) * 100;
                    const endPercent = (endTimeMin / maxTimeMin) * 100;
                    
                    const padding = Math.max(5, (endPercent - startPercent) * 0.1);
                    const zoomStart = Math.max(0, startPercent - padding);
                    const zoomEnd = Math.min(100, endPercent + padding);
                    
                    chart.dispatchAction({
                      type: 'dataZoom',
                      start: zoomStart,
                      end: zoomEnd
                    });
                  }}
                  className={[
                    isActive ? 'bg-primary/10' : '',
                    lap.lactate ? 'bg-purple-50' : '',
                  !lap.lactate && lap.exportedToTraining ? 'bg-primary/5' : '',
                    selectedLapIndices.has(index) ? 'bg-blue-100' : '',
                    !editingMode ? 'cursor-pointer hover:bg-gray-50' : '',
                  ].join(' ')}
                >
                  {editingMode && (
                    <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedLapIndices.has(index)}
                        onChange={() => handleToggleLapSelection(index)}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">{index + 1}</td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">{formatDuration(lap.elapsed_time)}</td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    {formatDistance(normalizeStravaLapDistanceRaw(lap, { swim: isSwimLapsRow }), user, {
                      swim: isSwimLapsRow,
                      assumeMeters: true,
                    })}
                  </td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    {(() => {
                      const sportRaw = (selectedStrava?.sport || selectedStrava?.sport_type || selectedStrava?.type || '').toLowerCase();
                      const isSwim = sportRaw.includes('swim');
                      const isRun = sportRaw.includes('run') || sportRaw === 'walk' || sportRaw === 'hike';
                      const unitSystem = resolveDistanceUnitSystem(user, 'metric');
                      const spd = Number(lap.average_speed || 0);
                      if (!Number.isFinite(spd) || spd <= 0) return '-';

                      if (isSwim) {
                        const sec = unitSystem === 'imperial' ? Math.round(109.361 / spd) : Math.round(100 / spd);
                        const mm = Math.floor(sec / 60);
                        const ss = Math.max(0, Math.round(sec % 60));
                        return `${mm}:${String(ss).padStart(2, '0')} ${unitSystem === 'imperial' ? '/100y' : '/100m'}`;
                      }

                      if (isRun) {
                        const sec = unitSystem === 'imperial' ? Math.round(1609.34 / spd) : Math.round(1000 / spd);
                        const mm = Math.floor(sec / 60);
                        const ss = Math.max(0, Math.round(sec % 60));
                        return `${mm}:${String(ss).padStart(2, '0')} ${unitSystem === 'imperial' ? '/mi' : '/km'}`;
                      }

                      return `${(spd * 3.6).toFixed(1)} km/h`;
                    })()}
                  </td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">{lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : '-'}</td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">{lap.average_watts ? `${Math.round(lap.average_watts)} W` : '-'}</td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    {elevation !== null && elevation !== 0 ? `${elevation > 0 ? '+' : ''}${elevation} m` : '-'}
                  </td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-primary">
                    {lap.lactate ? `${lap.lactate.toFixed(1)} mmol/L` : '-'}
                  </td>
                  <td className="px-2 sm:px-3 md:px-4 py-2 sm:py-3 text-xs sm:text-sm" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDeleteLap(index)}
                      disabled={saving}
                      className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
                      title="Delete interval"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {renderTimeInZonesBlock()}
    </div>
    {renderZoneTooltipPortal()}
    </>
  );
};

const FitAnalysisPage = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const { categories, getCategoryStyle } = useCategories();
  const { isPremium, gate, UpgradeModalProps } = usePremium();
  const location = useLocation();
  const navigate = useNavigate();
  const { activityId, athleteId: athleteIdParam } = useParams();
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);
  const [pendingAthleteIds, setPendingAthleteIds] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [commentCounts, setCommentCounts] = useState({});
  const [regularTrainings, setRegularTrainings] = useState([]); // Trainings from /training route
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedLapNumber, setSelectedLapNumber] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [highlightMetric, setHighlightMetric] = useState(null);
  const [radarWatts, setRadarWatts] = useState(null);

  // Listen for activity title renames so charts/lists update without refetch.
  // Also patch the trainings localStorage cache (10-min TTL) so the change
  // survives a page reload — otherwise the next mount hydrates from stale
  // data and the user thinks "nothing saved".
  useEffect(() => {
    const cachePatch = (matcher, patcher) => {
      try {
        Object.keys(localStorage).forEach(key => {
          if (!key.startsWith('athleteTrainings_v3_') && !key.startsWith('calendarData_')) return;
          const raw = localStorage.getItem(key);
          if (!raw) return;
          try {
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return;
            let changed = false;
            const next = arr.map(t => { if (matcher(t)) { changed = true; return patcher(t); } return t; });
            if (changed) localStorage.setItem(key, JSON.stringify(next));
          } catch { /* ignore */ }
        });
      } catch { /* ignore */ }
    };
    const buildMatcher = (id) => {
      const rawId = String(id).replace(/^(strava-|fit-|regular-|training-)/, '');
      return (t) => String(t._id) === rawId || String(t.id) === rawId
                 || String(t.stravaId) === rawId || `strava-${t.stravaId}` === String(id)
                 || `fit-${t._id}` === String(id) || `regular-${t._id}` === String(id);
    };

    const onTitleUpdated = (e) => {
      const { id, title } = e?.detail || {};
      if (!id || !title) return;
      const matches = buildMatcher(id);
      const patch = (t) => ({ ...t, title, titleManual: title });
      setTrainings(prev => prev.map(t => matches(t) ? patch(t) : t));
      cachePatch(matches, patch);
    };
    const onCategoryUpdated = (e) => {
      const { id, category } = e?.detail || {};
      if (!id) return;
      const matches = buildMatcher(id);
      const patch = (t) => ({ ...t, category: category || null });
      // Patch all three lists — calendarMergedActivities is derived from all of them.
      setTrainings(prev => prev.map(t => matches(t) ? patch(t) : t));
      setRegularTrainings(prev => prev.map(t => matches(t) ? patch(t) : t));
      setExternalActivities(prev => prev.map(t => matches(t) ? patch(t) : t));
      cachePatch(matches, patch);
    };
    const onMetricsUpdated = (e) => {
      const detail = e?.detail || {};
      const { id } = detail;
      if (!id) return;
      const matches = buildActivityMatcher(id);
      const patch = metricsPatchFromDetail(detail);
      if (!Object.keys(patch).length) return;
      setTrainings(prev => prev.map(t => matches(t) ? { ...t, ...patch } : t));
      setRegularTrainings(prev => prev.map(t => matches(t) ? { ...t, ...patch } : t));
      setExternalActivities(prev => prev.map(t => matches(t) ? { ...t, ...patch } : t));
      cachePatch(matches, patch);
    };
    const onPlannedUpdated = (e) => {
      const planned = e?.detail?.planned;
      if (!planned?._id) return;
      setPlannedWorkoutsCalendar(prev => upsertPlannedWorkoutList(prev, planned));
    };
    window.addEventListener('activityTitleUpdated', onTitleUpdated);
    window.addEventListener('activityCategoryUpdated', onCategoryUpdated);
    window.addEventListener('activityMetricsUpdated', onMetricsUpdated);
    window.addEventListener('plannedWorkoutUpdated', onPlannedUpdated);
    return () => {
      window.removeEventListener('activityTitleUpdated', onTitleUpdated);
      window.removeEventListener('activityCategoryUpdated', onCategoryUpdated);
      window.removeEventListener('activityMetricsUpdated', onMetricsUpdated);
      window.removeEventListener('plannedWorkoutUpdated', onPlannedUpdated);
    };
  }, []);
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Read highlightMetric + radarWatts from query string (e.g. coming from Power Radar / SpiderChart)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const metric = searchParams.get('highlightMetric');
    const watts = searchParams.get('radarWatts');
    setHighlightMetric(metric || null);
    setRadarWatts(watts ? Number(watts) : null);
  }, [location.search]);

  // Reset selected lap when training changes
  useEffect(() => {
    setSelectedLapNumber(null);
  }, [selectedTraining?._id]);
  
  // Training chart hover state
  const [hoveredTrainingRecord, setHoveredTrainingRecord] = useState(null);
  const [trainingTooltipPosition, setTrainingTooltipPosition] = useState({ x: 0, y: 0 });
  const trainingChartRef = useRef(null);
  // Prevents auto-loading the saved Strava selection more than once per session
  const stravaAutoLoadAttempted = useRef(false);
  
  // Zoom state for training chart
  const [trainingZoom, setTrainingZoom] = useState({ min: 0, max: 1, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, time: 0 });
  const [dragEnd, setDragEnd] = useState({ x: 0, time: 0 });
  const [showCreateLapButton, setShowCreateLapButton] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState({ start: 0, end: 0 });
  const [selectionStats, setSelectionStats] = useState(null);
  const dragStateRef = useRef({ isActive: false, start: { x: 0, time: 0 }, end: { x: 0, time: 0 } });
  const [showAutoClassify, setShowAutoClassify] = useState(false);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [, setGarminConnected] = useState(false);
  const [externalActivities, setExternalActivities] = useState([]);
  const [externalActivitiesLoading, setExternalActivitiesLoading] = useState(false);
  const [externalActivitiesError, setExternalActivitiesError] = useState(null);
  const [plannedWorkoutsCalendar, setPlannedWorkoutsCalendar] = useState([]);
  // Day-level themes (e.g. "Threshold day", "Recovery") — distinct from
  // planned workouts. Loaded alongside planned workouts so the calendar
  // can render the theme badge / mini-grid dot for each day in one pass.
  const [dayPlans, setDayPlans] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [planModal, setPlanModal] = useState(null); // { date: Date, workout: obj|null }
  // Quick day-theme / period editors opened from the "Add a workout" modal tiles.
  const [quickTheme, setQuickTheme] = useState(null);   // { date: 'YYYY-MM-DD', preset }
  const [quickPeriod, setQuickPeriod] = useState(null); // { defaultDate: 'YYYY-MM-DD' }
  const [compareModal, setCompareModal] = useState(null); // PlannedWorkout object with executionData
  const [mobileStravaTab, setMobileStravaTab] = useState('summary'); // 'summary' | 'laps'
  const [planTemplates, setPlanTemplates] = useState([]);
  const [planContext, setPlanContext] = useState({ ftp: 250, lt1Power: null, lt2Power: null });
  const [selectedStrava, setSelectedStrava] = useState(null);
  const [selectedStravaStreams, setSelectedStravaStreams] = useState(null);

  // When the URL carries an activity id, scroll the page down to the rich
  // detail block once it's rendered (so users landing from the dashboard's
  // 'open in calendar' action don't have to scroll past the calendar).
  const detailSectionRef = useRef(null);
  const pendingScrollToDetailRef = useRef(false);
  useEffect(() => {
    if (!pendingScrollToDetailRef.current) return;
    if (!selectedStrava && !selectedTraining) return;
    // Wait one frame so the detail block is mounted
    const id = requestAnimationFrame(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      pendingScrollToDetailRef.current = false;
    });
    return () => cancelAnimationFrame(id);
  }, [selectedStrava, selectedTraining]);
  const getLinkedStravaActivityId = useCallback((training) => {
    if (!training || typeof training !== 'object') return null;
    const candidate =
      training.sourceStravaActivityId ??
      training.sourceStravaId ??
      training.stravaActivityId ??
      training.stravaId ??
      training.externalActivityId ??
      null;
    return candidate == null ? null : String(candidate);
  }, []);
  const stravaChartRef = useRef(null);
  const formatDateTime = useCallback((dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch (e) {
      return dateStr;
    }
  }, []);
  const stravaActivityDate = selectedStrava?.start_date_local || selectedStrava?.start_date || selectedStrava?.startDate;
  const stravaActivitySport = selectedStrava?.sport_type || selectedStrava?.type || selectedStrava?.sport;
  const stravaActivityDuration = selectedStrava?.moving_time || selectedStrava?.elapsed_time || null;
  const stravaElevationGain = selectedStrava?.total_elevation_gain;
  const hasStravaElevation = stravaElevationGain !== null && stravaElevationGain !== undefined && stravaElevationGain > 0;
  
  // Strava metrics
  const stravaAvgPower = selectedStrava?.average_watts || selectedStrava?.avg_power || null;
  const stravaAvgCadence = selectedStrava?.average_cadence || selectedStrava?.avg_cadence || null;
  const stravaNormalizedPower = selectedStrava?.weighted_average_watts || selectedStrava?.normalized_power || null;
  const stravaMaxPower = selectedStrava?.max_watts || selectedStrava?.max_power || null;
  const stravaMaxSpeed = selectedStrava?.max_speed || selectedStrava?.maxSpeed || null;
  
  // Calculate TSS for Strava activity
  //
  // userProfile is the source of truth for zones / weight / FTP used by every
  // calculation on this page (TSS, lap zones, calendar period stats, etc.).
  //
  // Previously this only fetched once on mount, so editing zones in Settings
  // didn't propagate here — calendar kept colour-coding by the old zones
  // until a full page reload. We now also listen for the 'userUpdated'
  // window event that AuthProvider broadcasts whenever the user document
  // changes, and refetch in response. Same channel that keeps WeeklyCalendar
  // in sync — using it here closes the gap between Dashboard and FIT views.
  const [userFTP, setUserFTP] = React.useState(null);
  const [userProfile, setUserProfile] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    // Coach viewing an athlete? Fetch *that athlete's* zones — otherwise
    // Period Summary / per-activity zone bucketing reuses the coach's
    // power & HR thresholds and every Z2/Z3 ride collapses into Z1
    // because the athlete's avg watts sit well below the coach's FTP.
    // Self-view falls through to /user/profile.
    const role = String(user?.role || '').toLowerCase();
    const isCoachLike = ['coach', 'admin', 'tester', 'testing'].includes(role);
    const viewingOtherAthlete = isCoachLike && selectedAthleteId
      && String(selectedAthleteId) !== String(user?._id || user?.id || '');
    const loadUserProfile = async () => {
      try {
        const url = viewingOtherAthlete
          ? `/user/athlete/${selectedAthleteId}/profile`
          : '/user/profile';
        const response = await api.get(url);
        if (cancelled) return;
        const profileData = response.data;
        setUserProfile(profileData);
        const ftp = profileData.powerZones?.cycling?.lt2 ||
                   profileData.powerZones?.cycling?.zone5?.min ||
                   null;
        setUserFTP(ftp);
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };
    loadUserProfile();

    // Re-apply when AuthProvider broadcasts a user refresh. The event detail
    // carries the freshly-fetched profile, so we skip an extra HTTP round-trip
    // when it's available.
    const onUserUpdated = (e) => {
      const fresh = e?.detail;
      if (cancelled) return;
      // The 'userUpdated' event always carries the logged-in user (the coach).
      // While viewing another athlete we must NOT overwrite the athlete's
      // profile with the coach's — that reintroduces the Z1-collapse bug.
      // Refetch the athlete's profile instead.
      if (viewingOtherAthlete) {
        loadUserProfile();
        return;
      }
      if (fresh && typeof fresh === 'object') {
        setUserProfile(fresh);
        const ftp = fresh.powerZones?.cycling?.lt2 ||
                   fresh.powerZones?.cycling?.zone5?.min ||
                   null;
        setUserFTP(ftp);
      } else {
        // Fallback: detail missing — refetch from the API ourselves.
        loadUserProfile();
      }
    };
    window.addEventListener('userUpdated', onUserUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('userUpdated', onUserUpdated);
    };
    // Re-run when the coach switches to a different athlete — otherwise the
    // zones panel keeps using the previously-loaded profile and the new
    // athlete's avg power lands in the wrong bucket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAthleteId, user?._id, user?.role]);

  // Check if Strava activity is running
  const stravaSport = selectedStrava?.sport || selectedStrava?.sport_type || selectedStrava?.type || '';
  const isStravaRun = stravaSport.toLowerCase().includes('run') || stravaSport.toLowerCase() === 'walk' || stravaSport.toLowerCase() === 'hike';
  const stravaAvgSpeed = selectedStrava?.average_speed || selectedStrava?.avgSpeed || null;

  // Strava speeds are typically in m/s -> display km/h
  const stravaAvgSpeedKmh = stravaAvgSpeed != null && Number.isFinite(Number(stravaAvgSpeed))
    ? (Number(stravaAvgSpeed) * 3.6).toFixed(1)
    : null;
  const stravaMaxSpeedKmh = stravaMaxSpeed != null && Number.isFinite(Number(stravaMaxSpeed))
    ? (Number(stravaMaxSpeed) * 3.6).toFixed(1)
    : null;

  // Extra Strava summary metrics (cycling-oriented)
  const stravaAvgHeartRate = selectedStrava?.average_heartrate || null;
  const stravaNp = stravaNormalizedPower || stravaAvgPower || null;

  const stravaWeightKg = userProfile?.weight != null
    ? Number(String(userProfile.weight).replace(',', '.'))
    : null;

  const stravaWorkKj = React.useMemo(() => {
    const direct =
      selectedStrava?.kilojoules ??
      selectedStrava?.workout_kilojoules ??
      selectedStrava?.work_kilojoules ??
      null;

    if (direct != null && Number.isFinite(Number(direct))) return Number(direct);

    // Fallback: Work ~= avg power * duration
    if (stravaAvgPower && stravaActivityDuration && Number(stravaActivityDuration) > 0) {
      return (Number(stravaAvgPower) * Number(stravaActivityDuration)) / 1000; // seconds -> kJ
    }
    return null;
  }, [selectedStrava?.kilojoules, selectedStrava?.workout_kilojoules, selectedStrava?.work_kilojoules, stravaAvgPower, stravaActivityDuration]);

  const stravaWkg = React.useMemo(() => {
    if (!stravaAvgPower || !stravaWeightKg || !Number.isFinite(Number(stravaWeightKg))) return null;
    return (Number(stravaAvgPower) / Number(stravaWeightKg));
  }, [stravaAvgPower, stravaWeightKg]);

  const stravaVI = React.useMemo(() => {
    if (!stravaNp || !stravaAvgPower || !Number(stravaAvgPower)) return null;
    return Number(stravaNp) / Number(stravaAvgPower);
  }, [stravaNp, stravaAvgPower]);

  const stravaEF = React.useMemo(() => {
    if (!stravaNp || !stravaAvgHeartRate || !Number(stravaAvgHeartRate)) return null;
    return Number(stravaNp) / Number(stravaAvgHeartRate);
  }, [stravaNp, stravaAvgHeartRate]);

  // Power to Heart Rate (approximation for "Pw:Hr %" style)
  const stravaPwHrPct = React.useMemo(() => {
    // Uses FTP to scale into percent-like value: (AvgPower / AvgHR) / (FTP/1000)
    if (!stravaAvgPower || !stravaAvgHeartRate || !userFTP) return null;
    const denom = Number(stravaAvgHeartRate) * Number(userFTP);
    if (!Number.isFinite(denom) || denom <= 0) return null;
    return (Number(stravaAvgPower) * 1000) / denom;
  }, [stravaAvgPower, stravaAvgHeartRate, userFTP]);

  const calculateStravaTSS = React.useMemo(() => {
    if (!stravaActivityDuration) return null;
    const seconds = stravaActivityDuration;
    if (seconds === 0) return null;
    
    // For running: calculate TSS from pace
    if (isStravaRun && stravaAvgSpeed && stravaAvgSpeed > 0) {
      const avgPaceSeconds = Math.round(1000 / stravaAvgSpeed); // seconds per km
      const thresholdPace = userProfile?.powerZones?.running?.lt2 || null; // Threshold pace in seconds per km
      let referencePace = thresholdPace;
      // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
      if (!referencePace || referencePace <= 0) {
        referencePace = avgPaceSeconds;
      }
      // Running TSS formula: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
      // Faster pace (lower seconds) = higher intensity = higher TSS
      const intensityRatio = referencePace / avgPaceSeconds; // > 1 if faster than reference
      const tss = Math.round((seconds * Math.pow(intensityRatio, 2)) / 3600 * 100);
      return { value: tss, estimated: !thresholdPace };
    }
    
    // For cycling: calculate TSS from power
    if (!stravaAvgPower) return null;
    const ftp = userFTP || 250; // Use estimated FTP if not available
    const np = stravaNormalizedPower || stravaAvgPower; // Use NP if available, otherwise avg power
    const tss = (seconds * Math.pow(np, 2)) / (Math.pow(ftp, 2) * 3600) * 100;
    return { value: Math.round(tss), estimated: !userFTP };
  }, [userFTP, userProfile, stravaAvgPower, stravaNormalizedPower, stravaActivityDuration, isStravaRun, stravaAvgSpeed]);
  
  const calculateStravaIF = React.useMemo(() => {
    // For running: calculate IF from pace
    if (isStravaRun && stravaAvgSpeed && stravaAvgSpeed > 0) {
      const avgPaceSeconds = Math.round(1000 / stravaAvgSpeed);
      const thresholdPace = userProfile?.powerZones?.running?.lt2 || avgPaceSeconds;
      const ifValue = thresholdPace / avgPaceSeconds; // > 1 if faster than threshold
      return ifValue.toFixed(2);
    }
    
    // For cycling: calculate IF from power
    if (!stravaAvgPower) return null;
    const ftp = userFTP || 250;
    const np = stravaNormalizedPower || stravaAvgPower;
    const ifValue = np / ftp;
    return ifValue.toFixed(2);
  }, [userFTP, userProfile, stravaAvgPower, stravaNormalizedPower, isStravaRun, stravaAvgSpeed]);
  
  // Strava interval creation state
  // eslint-disable-next-line no-unused-vars
  const [stravaIsDragging, setStravaIsDragging] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [stravaDragStart, setStravaDragStart] = useState({ x: 0, time: 0 });
  // eslint-disable-next-line no-unused-vars
  const [stravaDragEnd, setStravaDragEnd] = useState({ x: 0, time: 0 });
  const [showStravaCreateLapButton, setShowStravaCreateLapButton] = useState(false);
  const [stravaSelectedTimeRange, setStravaSelectedTimeRange] = useState({ start: 0, end: 0 });
  const [stravaSelectionStats, setStravaSelectionStats] = useState(null);
  const stravaDragStateRef = useRef({ isActive: false, start: { x: 0, time: 0 }, end: { x: 0, time: 0 } });
  // Smoothness state
  const [smoothingWindow] = useState(5); // seconds
  
  // Export to Training state
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [trainingFormData, setTrainingFormData] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  // Manual add / edit training
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualFormInitialData, setManualFormInitialData] = useState(null); // null → new, object → edit
  const [manualFormSubmitting, setManualFormSubmitting] = useState(false);
  const [manualFormError, setManualFormError] = useState(null);

  // Calendar "Add Lactate" loading/error state (while fetching Strava detail)
  const [calendarLactateLoading, setCalendarLactateLoading] = useState(false);
  const [calendarLactateError, setCalendarLactateError] = useState(null);
  
  // Helper function to get GPS data from training or Strava
  const getGpsData = React.useMemo(() => {
    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const maybeConvertSemicircles = (v) => {
      // Garmin FIT sometimes stores coordinates in semicircles.
      // If value is outside valid degree range, convert.
      if (v == null) return null;
      return Math.abs(v) > 180 ? (v / 11930464.711111111) : v;
    };

    const extractLatLngFromRecord = (r) => {
      if (!r || typeof r !== 'object') return null;

      const rawLat = toNumber(
        r.positionLat ?? r.position_lat ?? r.lat ?? r.latitude ?? r.gpsLat ?? r.gps_lat
      );
      const rawLng = toNumber(
        r.positionLong ?? r.position_long ?? r.lng ?? r.lon ?? r.longitude ?? r.gpsLng ?? r.gps_lng
      );

      if (rawLat == null || rawLng == null) return null;

      const lat = maybeConvertSemicircles(rawLat);
      const lng = maybeConvertSemicircles(rawLng);
      if (lat == null || lng == null) return null;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return [lat, lng];
    };

    const latlngArray = selectedStravaStreams?.latlng?.data || selectedStravaStreams?.latlng || [];
    if ((selectedStrava || getLinkedStravaActivityId(selectedTraining)) && latlngArray.length > 0) {
      // Get GPS from Strava latlng stream
      return latlngArray.map(([lat, lng]) => [lat, lng]).filter(p => p[0] != null && p[1] != null);
    }

    if (selectedTraining && selectedTraining.records) {
      // Get GPS from FIT/regular training records (supports multiple field names).
      const fromRecords = selectedTraining.records
        .map(extractLatLngFromRecord)
        .filter(Boolean);
      if (fromRecords.length > 0) return fromRecords;
    }

    // Fallbacks: some payloads expose route/coordinates arrays directly.
    const fallbackPoints =
      selectedTraining?.gpsData ||
      selectedTraining?.route ||
      selectedTraining?.coordinates ||
      selectedTraining?.polylinePoints ||
      [];

    if (Array.isArray(fallbackPoints) && fallbackPoints.length > 0) {
      const fromFallback = fallbackPoints
        .map((p) => {
          if (Array.isArray(p) && p.length >= 2) return extractLatLngFromRecord({ lat: p[0], lng: p[1] });
          if (p && typeof p === 'object') return extractLatLngFromRecord(p);
          return null;
        })
        .filter(Boolean);
      if (fromFallback.length > 0) return fromFallback;
    }

    return [];
  }, [selectedStrava, selectedStravaStreams, selectedTraining, getLinkedStravaActivityId]);

  useEffect(() => {
    let cancelled = false;

    const linkedStravaId = getLinkedStravaActivityId(selectedTraining);
    if (!selectedTraining || !linkedStravaId || selectedStrava) return undefined;

    const role = String(user?.role || '').toLowerCase();
    const athleteId = ['coach', 'tester', 'testing'].includes(role)
      ? (role === 'coach' ? (selectedAthleteId || user?._id) : selectedAthleteId)
      : null;

    const loadLinkedStravaStreams = async () => {
      try {
        const data = await getStravaActivityDetail(linkedStravaId, athleteId);
        const streamsPayload = data?.streams && typeof data.streams === 'object' ? data.streams : {};
        if (!cancelled) {
          setSelectedStravaStreams(streamsPayload);
        }
      } catch (_error) {
        if (!cancelled) {
          setSelectedStravaStreams(null);
        }
      }
    };

    loadLinkedStravaStreams();

    return () => {
      cancelled = true;
    };
  }, [selectedTraining, selectedStrava, selectedAthleteId, user?.role, user?._id, getLinkedStravaActivityId]);
  
  // Smoothing function
  const smoothData = React.useCallback((data, windowSizeSeconds, timeArray) => {
    if (!data || data.length === 0 || windowSizeSeconds <= 0) return data;
    if (!timeArray || timeArray.length !== data.length) return data;
    
    const smoothed = [];
    for (let i = 0; i < data.length; i++) {
      const currentTime = timeArray[i];
      const windowStart = currentTime - windowSizeSeconds / 2;
      const windowEnd = currentTime + windowSizeSeconds / 2;
      
      const valuesInWindow = [];
      for (let j = 0; j < data.length; j++) {
        if (timeArray[j] >= windowStart && timeArray[j] <= windowEnd) {
          const val = data[j];
          if (val != null && !isNaN(val) && val > 0) {
            valuesInWindow.push(val);
          }
        }
      }
      
      smoothed.push(valuesInWindow.length > 0 
        ? valuesInWindow.reduce((a, b) => a + b, 0) / valuesInWindow.length 
        : data[i]);
    }
    return smoothed;
  }, []);

  useEffect(() => {
    // Guard: don't fire API calls if auth token is missing (avoids spurious 401 → logout).
    const hasToken = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!hasToken) return;

    // Always load trainings first, then check for trainingId in URL params
    const params = new URLSearchParams(window.location.search);
    const trainingId = params.get('trainingId');
    const fitTrainingId = params.get('fitTrainingId');
    const stravaId = params.get('stravaId');

    const openFromActivityId = (rawId) => {
      if (!rawId) return;
      const id = String(rawId);
      if (id.startsWith('strava-')) {
        loadStravaDetail(id.replace('strava-', ''));
        return;
      }
      if (id.startsWith('regular-')) {
        loadRegularTrainingDetail(id.replace('regular-', ''));
        return;
      }
      if (id.startsWith('fit-')) {
        loadTrainingDetail(id.replace('fit-', ''));
        return;
      }
      if (id.startsWith('training-')) {
        loadTrainingFromTrainingModel(id.replace('training-', ''));
        return;
      }
      // Backwards-compat (old links might be just raw FitTraining _id)
      loadTrainingDetail(id);
    };
    
    const initialize = async () => {
      // When URL is /training-calendar/:athleteId/:activityId (coach view), set athlete first so loads use correct data
      if (athleteIdParam) {
        setSelectedAthleteId(athleteIdParam);
        localStorage.setItem('trainingCalendar_selectedAthleteId', athleteIdParam);
      }
      const initialAthleteId = athleteIdParam || selectedAthleteId || user?._id || null;
      await Promise.all([
        loadTrainings(initialAthleteId),
        loadRegularTrainings(initialAthleteId),
        loadExternalActivities(initialAthleteId),
      ]);

      // Canonical path: /training-calendar/:activityId or .../:athleteId/:activityId
      if (activityId) {
        pendingScrollToDetailRef.current = true;
        setTimeout(() => {
          openFromActivityId(activityId);
        }, 200);
        return;
      }
      
    if (trainingId) {
        // Wait a bit for trainings to be loaded before loading specific training
        setTimeout(() => {
          // Move to canonical URL with id at the end
          navigate(`/training-calendar/${encodeURIComponent(`training-${trainingId}`)}`, { replace: true });
          openFromActivityId(`training-${trainingId}`);
        }, 200);
      } else if (fitTrainingId) {
        // Open a FitTraining directly
        setTimeout(() => {
          navigate(`/training-calendar/${encodeURIComponent(`fit-${fitTrainingId}`)}`, { replace: true });
          openFromActivityId(`fit-${fitTrainingId}`);
        }, 200);
      } else if (stravaId) {
        // Wait a bit for activities to be loaded before loading specific Strava activity
        setTimeout(() => {
          navigate(`/training-calendar/${encodeURIComponent(`strava-${stravaId}`)}`, { replace: true });
          openFromActivityId(`strava-${stravaId}`);
        }, 200);
    }
    };
    
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, athleteIdParam]);

  useEffect(() => {
    // Guard: don't fire protected API calls if there is no auth token yet.
    // ProtectedRoute normally ensures we only render when authenticated, but a
    // belt-and-suspenders check here avoids any transient 401 that could trigger
    // app-wide logout if the token hasn't fully propagated to localStorage.
    const hasToken = localStorage.getItem('token') || localStorage.getItem('authToken');
    if (!hasToken) return;

    const checkStatus = async () => {
      try {
        const status = await getIntegrationStatus();
        setStravaConnected(Boolean(status.stravaConnected));
        setGarminConnected(Boolean(status.garminConnected));
      } catch (e) {
        // ignore if not logged
      }
    };
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'connected') {
      checkStatus();
      loadExternalActivities();
      const url = window.location.pathname;
      window.history.replaceState({}, '', url);
    } else {
      checkStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStravaDetail = useCallback(async (id, { overrideTitle = null, mergeResults = null } = {}) => {
    try {
      setDetailLoading(true);
      const role = String(user?.role || '').toLowerCase();
      const athleteId = ['coach', 'tester', 'testing'].includes(role)
        ? (role === 'coach' ? (selectedAthleteId || user?._id) : selectedAthleteId)
        : null;
      const data = await getStravaActivityDetail(id, athleteId);
      
      const rawLaps = Array.isArray(data.laps) ? data.laps : [];

    
      
      // Deduplicate laps before setting state using the same function as elsewhere
      let uniqueLaps = deduplicateStravaLaps(rawLaps);
      
      console.log('After deduplication:', uniqueLaps.length);
      
      // Check if there's a linked training for this Strava activity (if regularTrainings is available);
      // fall back to mergeResults passed by the caller (loadTrainingFromTrainingModel) when state isn't ready yet.
      const linkedFromState = (regularTrainings || []).find(t => String(t?.sourceStravaActivityId) === String(id));
      const linkedTraining = linkedFromState
        || (Array.isArray(mergeResults) ? { results: mergeResults, title: overrideTitle, sourceStravaActivityId: id } : null);
      const linkedTitle = linkedTraining?.title || overrideTitle;

      // Merge lactate values from linked Training model into Strava laps (if user entered
      // lactate during export but it wasn't saved to the Strava activity itself)
      if (linkedTraining?.results && Array.isArray(linkedTraining.results)) {
        const exportedLapIndices = new Set(
          linkedTraining.results
            .map((result, idx) => {
              const sourceIndex = result?.sourceLapIndex;
              return Number.isInteger(sourceIndex) ? sourceIndex : idx;
            })
            .filter((idx) => Number.isInteger(idx) && idx >= 0)
        );

        uniqueLaps = uniqueLaps.map((lap, idx) => {
          const originalIndex = lap?.__sourceIndex ?? idx;
          const isExported = exportedLapIndices.has(originalIndex);
          if (lap.lactate != null) return isExported ? { ...lap, exportedToTraining: true } : lap; // already has lactate
          const linkedResult = linkedTraining.results[idx];
          if (linkedResult?.lactate != null) {
            return { ...lap, lactate: Number(linkedResult.lactate), exportedToTraining: isExported };
          }
          return isExported ? { ...lap, exportedToTraining: true } : lap;
        });
      }
      
      // Merge titleManual, description, and category into detail object
      const detailWithMeta = {
        ...data.detail,
        titleManual: data.titleManual,
        description: data.description,
        category: data.category || null,
        laps: uniqueLaps,
        rawLaps
      };

      // Allow overriding title from Training model (without mutating Strava activity in DB)
      if (linkedTitle && typeof linkedTitle === 'string' && linkedTitle.trim()) {
        detailWithMeta.titleManual = linkedTitle.trim();
        detailWithMeta.linkedTrainingTitle = linkedTitle.trim(); // Store linked training title separately
      }
      
      // Streams can be empty if Strava rejects stream keys for this activity; still show detail & laps
      const streamsPayload =
        data.streams && typeof data.streams === 'object' ? data.streams : {};
      console.log('[Map debug] streams keys:', Object.keys(streamsPayload));
      console.log('[Map debug] latlng length:', streamsPayload?.latlng?.data?.length ?? streamsPayload?.latlng?.length ?? 'N/A');
      setSelectedStrava(detailWithMeta);
      setSelectedStravaStreams(streamsPayload);
      setSelectedTraining(null);
      // Persist selection to localStorage
      localStorage.setItem('fitAnalysis_selectedStravaId', String(id));
      localStorage.removeItem('fitAnalysis_selectedTrainingId');
      localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
      setDetailLoading(false);
    } catch (e) {
      // Handle 429 (Too Many Requests) specifically - don't log as error
      if (e.response?.status === 429 || (e.code === 'ERR_BAD_REQUEST' && e.response?.status === 429)) {
        console.warn('Strava API rate limit exceeded. Please try again in a few minutes.');
        // Don't clear state on rate limit - keep what we have
        return;
      }
      
      // Handle 401 / 400 (Strava OAuth token expired or Strava API error)
      // Clear the saved activity ID so the page doesn't auto-retry on every load.
      if (e.response?.status === 401 || e.response?.status === 400) {
        localStorage.removeItem('fitAnalysis_selectedStravaId');
        const d = e.response?.data;
        const serverMsg =
          (typeof d?.message === 'string' && d.message) ||
          (typeof d?.error === 'string' && d.error) ||
          null;
        const msg = serverMsg
          || (e.response?.status === 401
            ? 'Strava token expired. Please reconnect your Strava account in Settings.'
            : 'Strava request failed. Try reconnecting Strava in Settings.');
        addNotification(msg, 'error');
        setDetailLoading(false);
        return;
      }
      
      // Only log non-429/401 errors
      console.error('Error loading Strava detail:', e);
      
      // Remove invalid ID from localStorage
      localStorage.removeItem('fitAnalysis_selectedStravaId');
      // Clear state on error
      setSelectedStrava(null);
      setSelectedStravaStreams(null);
      setDetailLoading(false);
    }
  }, [selectedAthleteId, user?.role, user?._id, addNotification, regularTrainings]);

  const loadExternalActivities = useCallback(async (athleteIdOverride = null) => {
    setExternalActivitiesLoading(true);
    setExternalActivitiesError(null);
    try {
      const role = String(user?.role || '').toLowerCase();
      // Athlete: own data without query param. Coach: explicit athlete or self (own Strava/FIT).
      const athleteId =
        athleteIdOverride ||
        (role === 'athlete'
          ? null
          : role === 'coach'
            ? (selectedAthleteId || user?._id)
            : selectedAthleteId);

      if (role === 'coach' && !athleteId) {
        setExternalActivities([]);
        return;
      }
      if (
        role === 'coach' &&
        athleteId &&
        String(athleteId) !== String(user?._id || '') &&
        pendingAthleteIds.includes(String(athleteId))
      ) {
        setExternalActivities([]);
        return;
      }

      const params = athleteId ? { athleteId, summaryOnly: true, limit: 2000 } : { summaryOnly: true, limit: 2000 };
      const acts = normalizeApiList(await listExternalActivities(params));
      setExternalActivities(acts);
      
      // Restore the last-selected Strava activity — one-shot only.
      // The ref prevents React StrictMode's double-invocation and concurrent calls
      // from firing multiple API requests for the same saved activity.
      if (!stravaAutoLoadAttempted.current) {
        const savedStravaId = localStorage.getItem('fitAnalysis_selectedStravaId');
        if (savedStravaId) {
          const activityExists = acts.some(a => String(a.stravaId) === savedStravaId);
          if (activityExists) {
            if (!selectedStrava || String(selectedStrava.id) !== savedStravaId) {
              stravaAutoLoadAttempted.current = true;
              // Clear the saved ID *before* the async load so a concurrent invocation
              // won't fire a second request. loadStravaDetail sets it back on success.
              localStorage.removeItem('fitAnalysis_selectedStravaId');
              loadStravaDetail(savedStravaId);
            }
          } else {
            localStorage.removeItem('fitAnalysis_selectedStravaId');
          }
        }
      }
    } catch (e) {
      // Handle rate limit errors gracefully
      if (e.response?.status === 429) {
        console.warn('Rate limit exceeded when loading external activities. Please wait a moment.');
        setExternalActivitiesError('Strava API rate limit is active. Try again in a few minutes.');
        return;
      }
      console.error('Error loading external activities:', e);
      setExternalActivitiesError('Calendar activities could not be loaded. Please try again.');
    }
    finally {
      setExternalActivitiesLoading(false);
    }
  }, [selectedAthleteId, user?.role, user?._id, selectedStrava, loadStravaDetail, pendingAthleteIds]);

  /** Load planned workouts + templates + athlete power context for the calendar overlay */
  // ── Helper: build planContext from profile powerZones ─────────────────────
  const buildContextFromProfile = useCallback((pz) => {
    if (!pz) return null;
    const cyclingZones  = pz.cycling  || null;
    const runningZones  = pz.running  || null;
    const swimmingZones = pz.swimming || null;
    // LT2/LT1 directly from profile fields; fall back to zone4/zone3 boundaries
    const lt2Power = cyclingZones?.lt2 || cyclingZones?.zone4?.min || null;
    const lt1Power = cyclingZones?.lt1 || cyclingZones?.zone3?.min || null;
    const lt2Pace  = runningZones?.lt2  || runningZones?.zone4?.min  || null;
    const lt1Pace  = runningZones?.lt1  || runningZones?.zone3?.min  || null;
    const lt2Swim  = swimmingZones?.lt2 || swimmingZones?.zone4?.min || null;
    const lt1Swim  = swimmingZones?.lt1 || swimmingZones?.zone3?.min || null;
    return { ftp: lt2Power || 250, lt2Power, lt1Power, lt2Pace, lt1Pace, lt2Swim, lt1Swim, cyclingZones, runningZones, swimmingZones };
  }, []);

  // ── When userProfile loads/changes, push zone data into planContext ────────
  useEffect(() => {
    if (!userProfile) return;
    const ctx = buildContextFromProfile(userProfile.powerZones);
    if (!ctx) return;
    setPlanContext(prev => ({ ...prev, ...ctx }));
  }, [userProfile, buildContextFromProfile]);

  const loadPlannedWorkoutsForCalendar = useCallback(async () => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const opts = {};
      if (isCoachLike && selectedAthleteId) opts.athleteId = selectedAthleteId;

      const targetId = selectedAthleteId || user?._id;

      const [data, tpls, dps, ps] = await Promise.all([
        getPlannedWorkouts(opts),
        getWorkoutTemplates().catch(() => []),
        // Day-level theme labels ("Threshold day", "Recovery", …) — drives
        // the badge in the mobile calendar's day-list header and the
        // colour-coded dot in the mini month grid.
        getDayPlans(opts).catch(() => []),
        // Multi-day periods (Vacation, Training camp, …) — colored bands.
        getPeriods(opts).catch(() => []),
      ]);
      setPlannedWorkoutsCalendar(Array.isArray(data) ? data : []);
      setPlanTemplates(Array.isArray(tpls) ? tpls : []);
      setDayPlans(Array.isArray(dps) ? dps : []);
      setPeriods(Array.isArray(ps) ? ps : []);

      // Enrich planContext with latest test-derived thresholds (zones come from userProfile effect above)
      if (targetId) {
        try {
          const testRes = await api.get(`/test/list/${targetId}`).catch(() => ({ data: [] }));
          const tests = Array.isArray(testRes.data) ? testRes.data : [];
          const withPower = tests
            .filter(t => t.lt2?.power || t.thresholds?.lt2Power || t.lt2Power)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
          if (withPower.length > 0) {
            const t = withPower[0];
            // Merge test thresholds on top of profile zones (profile zones stay)
            setPlanContext(prev => {
              const lt2Power = t.lt2?.power || t.thresholds?.lt2Power || t.lt2Power || prev.lt2Power;
              const lt1Power = t.lt1?.power || t.thresholds?.lt1Power || t.lt1Power || prev.lt1Power;
              return {
                ...prev,
                ftp:      t.ftp || t.thresholds?.ftp || lt2Power || prev.ftp,
                lt2Power: lt2Power || prev.lt2Power,
                lt1Power: lt1Power || prev.lt1Power,
              };
            });
          }
        } catch (_) {}
      }
    } catch (_) {
      setPlannedWorkoutsCalendar([]);
      setDayPlans([]);
      setPeriods([]);
    }
  }, [selectedAthleteId, user?.role, user?._id]);

  // Load planned workouts once when athlete changes
  useEffect(() => {
    loadPlannedWorkoutsForCalendar();
  }, [loadPlannedWorkoutsForCalendar]);

  /** Day-plan handlers — used by CalendarView's mobile + button menu. */
  const handleDayPlanSave = useCallback(async (dateStr, payload) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;
      // Empty payload → server treats it as delete (returns {deleted: true});
      // either way we re-sync local cache against the response.
      const result = await apiSetDayPlan(dateStr, payload || {}, coachAthleteId);
      setDayPlans(prev => {
        const without = prev.filter(p => p.date !== dateStr);
        if (result?.deleted) return without;
        return [...without, result];
      });
      return result;
    } catch (e) {
      console.error('[DayPlan] save failed', e);
      return null;
    }
  }, [selectedAthleteId, user?.role]);

  const handleDayPlanDelete = useCallback(async (dateStr) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;
      await apiDeleteDayPlan(dateStr, coachAthleteId);
      setDayPlans(prev => prev.filter(p => p.date !== dateStr));
    } catch (_) {}
  }, [selectedAthleteId, user?.role]);

  // ── Calendar period save / delete ─────────────────────────────────────────
  const handlePeriodSave = useCallback(async (payload) => {
    const role = String(user?.role || '').toLowerCase();
    const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
    const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;
    const result = await apiSavePeriod(payload, coachAthleteId);
    setPeriods(prev => {
      const without = prev.filter(p => String(p._id) !== String(result._id));
      return [...without, result];
    });
    return result;
  }, [selectedAthleteId, user?.role]);

  const handlePeriodDelete = useCallback(async (periodId) => {
    const role = String(user?.role || '').toLowerCase();
    const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
    const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;
    await apiDeletePeriod(periodId, coachAthleteId);
    setPeriods(prev => prev.filter(p => String(p._id) !== String(periodId)));
  }, [selectedAthleteId, user?.role]);

  /** CRUD for planned workouts from the calendar */
  const handlePlanSave = useCallback(async (data) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;

      if (planModal?.workout?._id) {
        const updated = await updatePlannedWorkout(planModal.workout._id, data, coachAthleteId);
        setPlannedWorkoutsCalendar(prev => prev.map(p => p._id === updated._id ? updated : p));
      } else {
        const created = await createPlannedWorkout(data, coachAthleteId);
        setPlannedWorkoutsCalendar(prev => [...prev, created]);
      }
      setPlanModal(null);
    } catch (_) {}
  }, [planModal, selectedAthleteId, user?.role]);

  const handlePlanDelete = useCallback(async (pw) => {
    if (!window.confirm('Delete this planned workout?')) return;
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;
      await deletePlannedWorkout(pw._id, coachAthleteId);
      setPlannedWorkoutsCalendar(prev => prev.filter(p => p._id !== pw._id));
      setPlanModal(null);
    } catch (_) {}
  }, [selectedAthleteId, user?.role]);

  const handleMovePlannedWorkout = useCallback(async (id, newDateStr) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;
      const updated = await updatePlannedWorkout(id, { date: newDateStr }, coachAthleteId);
      setPlannedWorkoutsCalendar(prev => prev.map(p => p._id === id ? { ...p, date: newDateStr, ...updated } : p));
    } catch (_) {}
  }, [selectedAthleteId, user?.role]);

  const handleCopyPlannedWorkout = useCallback(async (pw, newDateStr) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['coach', 'tester', 'testing', 'admin'].includes(role);
      const coachAthleteId = isCoachLike && selectedAthleteId ? selectedAthleteId : null;
      const { _id, status, executionData, ...rest } = pw;
      const created = await createPlannedWorkout({ ...rest, date: newDateStr, status: 'planned' }, coachAthleteId);
      setPlannedWorkoutsCalendar(prev => [...prev, created]);
    } catch (_) {}
  }, [selectedAthleteId, user?.role]);

  // Training chart zoom and drag handlers - must be at top level (not conditionally rendered)
  useEffect(() => {
    const container = trainingChartRef.current;
    if (!container || !selectedTraining || !selectedTraining.records || selectedTraining.records.length === 0) return;

    const chartData = prepareTrainingChartData(selectedTraining);
    if (!chartData) return;

    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const graphWidth = 800 - padding.left - padding.right;

    // Convert screen X to time value - exposed to component scope
    window.screenXToTime = (screenX) => {
      const containerRect = container.getBoundingClientRect();
      const relativeX = screenX - containerRect.left - padding.left;
      const normalizedX = Math.max(0, Math.min(1, relativeX / graphWidth));
      const zoomedMinTime = chartData.maxTime * trainingZoom.min;
      const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
      const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
      const time = zoomedMinTime + (normalizedX * zoomedTimeRange);
      return Math.max(0, Math.min(chartData.maxTime, time));
    };

    const screenXToTime = window.screenXToTime;

    // Use ref for dragState so it can be accessed from overlay div handlers
    if (!dragStateRef.current || !dragStateRef.current.isActive) {
      dragStateRef.current = { isActive: false, start: { x: 0, time: 0 }, end: { x: 0, time: 0 } };
    }

    const wheelHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const delta = e.deltaY > 0 ? 1.1 : 0.9;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - padding.left;
      const mouseRatio = Math.max(0, Math.min(1, mouseX / graphWidth));
      
      setTrainingZoom(prev => {
        const currentRange = prev.max - prev.min;
        const newRange = Math.max(0.05, Math.min(1, currentRange * delta));
        
        if (newRange !== currentRange) {
          const centerTimeRatio = prev.min + currentRange * mouseRatio;
          const newMin = Math.max(0, centerTimeRatio - newRange * mouseRatio);
          const newMax = Math.min(1, newMin + newRange);
          
          return {
            min: newMin,
            max: newMax,
            scale: 1 / newRange
          };
        }
        return prev;
      });
    };
    
    const mouseDownHandler = (e) => {
      if (e.button !== 0) return;
      
      // Don't interfere if clicking on buttons or other interactive elements
      const target = e.target;
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        return;
      }
      
      // Check if click is inside the container
      const containerRect = container.getBoundingClientRect();
      const clickX = e.clientX - containerRect.left;
      const clickY = e.clientY - containerRect.top;
      
      // Allow drag if clicking in the graph area (not on buttons or other UI elements)
      if (clickX < padding.left || clickX > containerRect.width - padding.right || 
          clickY < padding.top || clickY > containerRect.height - padding.bottom) {
        return;
      }
      
      const startTime = screenXToTime(e.clientX);
      dragStateRef.current.isActive = true;
      dragStateRef.current.start = { x: clickX, time: startTime };
      dragStateRef.current.end = { x: clickX, time: startTime };
      setIsDragging(true);
      setDragStart({ x: dragStateRef.current.start.x, time: startTime });
      setDragEnd({ x: dragStateRef.current.end.x, time: startTime });
      e.preventDefault();
      e.stopPropagation();
    };
    
    const mouseLeaveHandler = () => {
      if (dragStateRef.current.isActive) {
        dragStateRef.current.isActive = false;
        dragStateRef.current.start = { x: 0, time: 0 };
        dragStateRef.current.end = { x: 0, time: 0 };
        setIsDragging(false);
        setDragStart({ x: 0, time: 0 });
        setDragEnd({ x: 0, time: 0 });
      }
    };
    
    const mouseMoveGlobalHandler = (e) => {
      if (!dragStateRef.current.isActive) return;
      
      const endTime = screenXToTime(e.clientX);
      const containerRect = container.getBoundingClientRect();
      const endX = e.clientX - containerRect.left;
      dragStateRef.current.end = { x: endX, time: endTime };
      setDragEnd({ x: endX, time: endTime });
    };
    
    const mouseUpGlobalHandler = (e) => {
      if (!dragStateRef.current.isActive) return;
      
      const startTime = Math.min(dragStateRef.current.start.time, dragStateRef.current.end.time);
      const endTime = Math.max(dragStateRef.current.start.time, dragStateRef.current.end.time);
      const timeRange = Math.abs(endTime - startTime);
      
      // If user wants to create a lap (hold Shift), show create lap button instead of zooming
      if (e.shiftKey && timeRange > chartData.maxTime * 0.01) {
        setSelectedTimeRange({ start: startTime, end: endTime });
        setShowCreateLapButton(true);
      } else if (timeRange > chartData.maxTime * 0.01) {
        // Normal zoom behavior
        const newMin = startTime / chartData.maxTime;
        const newMax = endTime / chartData.maxTime;
        const newScale = 1 / (newMax - newMin);
        
        setTrainingZoom({
          min: newMin,
          max: newMax,
          scale: newScale
        });
      }
      
      dragStateRef.current.isActive = false;
      dragStateRef.current.start = { x: 0, time: 0 };
      dragStateRef.current.end = { x: 0, time: 0 };
      setIsDragging(false);
      setDragStart({ x: 0, time: 0 });
      setDragEnd({ x: 0, time: 0 });
    };
    
    container.addEventListener('wheel', wheelHandler, { passive: false });
    // Keep container mousedown for fallback, but overlay div will handle most drags
    container.addEventListener('mousedown', mouseDownHandler);
    container.addEventListener('mouseleave', mouseLeaveHandler);
    document.addEventListener('mousemove', mouseMoveGlobalHandler);
    document.addEventListener('mouseup', mouseUpGlobalHandler);
    
    return () => {
      container.removeEventListener('wheel', wheelHandler);
      container.removeEventListener('mousedown', mouseDownHandler);
      container.removeEventListener('mouseleave', mouseLeaveHandler);
      document.removeEventListener('mousemove', mouseMoveGlobalHandler);
      document.removeEventListener('mouseup', mouseUpGlobalHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTraining?._id, trainingZoom, isDragging]);

  // Strava chart drag selection handlers
  useEffect(() => {
    if (!selectedStrava || !selectedStravaStreams) return;
    
    const container = document.getElementById('strava-chart-container');
    if (!container) return;
    
    // Get time array - could be time.data or time array directly
    const timeArray = selectedStravaStreams.time?.data || selectedStravaStreams.time || [];
    const maxTime = timeArray.length > 0 ? timeArray[timeArray.length - 1] : 0;
    
    if (maxTime === 0) {
      return;
    }
    
    const chartLeft = 60;
    const chartRight = 50;
    const chartTop = 60;
    const chartBottom = 80;
    
    // Helper function to get current maxTime from streams
    const getMaxTime = () => {
      const currentTimeArray = selectedStravaStreams?.time?.data || selectedStravaStreams?.time || [];
      return currentTimeArray.length > 0 ? currentTimeArray[currentTimeArray.length - 1] : 0;
    };
    
    const mouseDownHandler = (e) => {
      if (e.button !== 0) return;
      
      // Don't interfere if clicking on buttons
      const target = e.target;
      if (target.tagName === 'BUTTON' || target.closest('button')) return;
      
      const chartRect = container.getBoundingClientRect();
      const clickX = e.clientX - chartRect.left;
      const clickY = e.clientY - chartRect.top;
      
      if (clickX < chartLeft || clickX > chartRect.width - chartRight ||
          clickY < chartTop || clickY > chartRect.height - chartBottom) {
        return;
      }
      
      const currentMaxTime = getMaxTime();
      if (currentMaxTime === 0) {
        return;
      }
      
      const chartWidth = chartRect.width - chartLeft - chartRight;
      const relativeX = clickX - chartLeft;
      const normalizedX = Math.max(0, Math.min(1, relativeX / chartWidth));
      
      // Get zoom state from chart if available
      let timeInSeconds = normalizedX * currentMaxTime;
      if (stravaChartRef.current) {
        try {
          const chart = stravaChartRef.current.getEchartsInstance();
          const option = chart.getOption();
          const dataZoom = option.dataZoom?.[0];
          if (dataZoom && dataZoom.start !== undefined && dataZoom.end !== undefined) {
            // Chart is zoomed - adjust time calculation
            const zoomStart = dataZoom.start / 100; // Convert percentage to ratio
            const zoomEnd = dataZoom.end / 100;
            const zoomRange = zoomEnd - zoomStart;
            const zoomedMinTime = currentMaxTime * zoomStart;
            timeInSeconds = zoomedMinTime + (normalizedX * zoomRange * currentMaxTime);
          }
        } catch (e) {
          // Fallback to original calculation if chart access fails
          timeInSeconds = normalizedX * currentMaxTime;
        }
      }
      
      stravaDragStateRef.current.isActive = true;
      stravaDragStateRef.current.start = { x: clickX, time: timeInSeconds };
      stravaDragStateRef.current.end = { x: clickX, time: timeInSeconds };
      
      setStravaIsDragging(true);
      setStravaDragStart({ x: clickX, time: timeInSeconds });
      setStravaDragEnd({ x: clickX, time: timeInSeconds });
      
      e.preventDefault();
      e.stopPropagation();
    };
    
    const mouseMoveGlobalHandler = (e) => {
      if (!stravaDragStateRef.current.isActive) return;
      
      const chartRect = container.getBoundingClientRect();
      const clickX = e.clientX - chartRect.left;
      const currentMaxTime = getMaxTime();
      const chartWidth = chartRect.width - chartLeft - chartRight;
      const relativeX = clickX - chartLeft;
      const normalizedX = Math.max(0, Math.min(1, relativeX / chartWidth));
      
      // Get zoom state from chart if available
      let timeInSeconds = normalizedX * currentMaxTime;
      if (stravaChartRef.current) {
        try {
          const chart = stravaChartRef.current.getEchartsInstance();
          const option = chart.getOption();
          const dataZoom = option.dataZoom?.[0];
          if (dataZoom && dataZoom.start !== undefined && dataZoom.end !== undefined) {
            // Chart is zoomed - adjust time calculation
            const zoomStart = dataZoom.start / 100; // Convert percentage to ratio
            const zoomEnd = dataZoom.end / 100;
            const zoomRange = zoomEnd - zoomStart;
            const zoomedMinTime = currentMaxTime * zoomStart;
            timeInSeconds = zoomedMinTime + (normalizedX * zoomRange * currentMaxTime);
          }
        } catch (e) {
          // Fallback to original calculation if chart access fails
          timeInSeconds = normalizedX * currentMaxTime;
        }
      }
      
      stravaDragStateRef.current.end = { x: clickX, time: timeInSeconds };
      setStravaDragEnd({ x: clickX, time: timeInSeconds });
    };
    
    const mouseUpGlobalHandler = (e) => {
      if (!stravaDragStateRef.current.isActive) return;
      
      const currentMaxTime = getMaxTime();
      const startTime = Math.min(stravaDragStateRef.current.start.time, stravaDragStateRef.current.end.time);
      const endTime = Math.max(stravaDragStateRef.current.start.time, stravaDragStateRef.current.end.time);
      const timeRange = Math.abs(endTime - startTime);
      
      if (e.shiftKey && timeRange > currentMaxTime * 0.01) {
        if (stravaChartRef.current) {
          const chart = stravaChartRef.current.getEchartsInstance();
          const startPercent = (startTime / currentMaxTime) * 100;
          const endPercent = (endTime / currentMaxTime) * 100;
          chart.dispatchAction({
            type: 'dataZoom',
            start: startPercent,
            end: endPercent
          });
        }
      } else if (timeRange > currentMaxTime * 0.01) {
        setStravaSelectedTimeRange({ start: startTime, end: endTime });
        const calculateStats = (sTime, eTime) => {
          const time = timeArray;
          const speed = selectedStravaStreams.velocity_smooth?.data || selectedStravaStreams.velocity_smooth || [];
          const hr = selectedStravaStreams.heartrate?.data || selectedStravaStreams.heartrate || [];
          const power = selectedStravaStreams.watts?.data || selectedStravaStreams.watts || [];
          
          const selectedIndices = [];
          for (let i = 0; i < time.length; i++) {
            if (time[i] >= sTime && time[i] <= eTime) {
              selectedIndices.push(i);
            }
          }
          
          if (selectedIndices.length === 0) return null;
          
          const speeds = selectedIndices.map(i => speed[i]).filter(v => v && v > 0);
          const heartRates = selectedIndices.map(i => hr[i]).filter(v => v && v > 0);
          const powers = selectedIndices.map(i => power[i]).filter(v => v && v > 0);
          
          const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
          const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;
          const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null;
          const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : null;
          const avgPower = powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null;
          const maxPower = powers.length > 0 ? Math.max(...powers) : null;
          const totalDistance = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) * (eTime - sTime) / selectedIndices.length : null;

    return {
            duration: eTime - sTime,
            totalDistance,
            avgSpeed: avgSpeed ? (avgSpeed * 3.6).toFixed(1) : null,
            maxSpeed: maxSpeed ? (maxSpeed * 3.6).toFixed(1) : null,
            avgHeartRate,
            maxHeartRate,
            avgPower,
            maxPower
          };
        };
        const stats = calculateStats(startTime, endTime);
        setStravaSelectionStats(stats);
        setShowStravaCreateLapButton(true);
      }
      
      stravaDragStateRef.current.isActive = false;
      stravaDragStateRef.current.start = { x: 0, time: 0 };
      stravaDragStateRef.current.end = { x: 0, time: 0 };
      setStravaIsDragging(false);
      setStravaDragStart({ x: 0, time: 0 });
      setStravaDragEnd({ x: 0, time: 0 });
    };
    
    container.addEventListener('mousedown', mouseDownHandler);
    document.addEventListener('mousemove', mouseMoveGlobalHandler);
    document.addEventListener('mouseup', mouseUpGlobalHandler);
    
    return () => {
      container.removeEventListener('mousedown', mouseDownHandler);
      document.removeEventListener('mousemove', mouseMoveGlobalHandler);
      document.removeEventListener('mouseup', mouseUpGlobalHandler);
    };
  }, [selectedStrava, selectedStravaStreams]);

  const loadTrainings = useCallback(async (athleteIdOverride = null) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const athleteId =
        athleteIdOverride ||
        (role === 'athlete'
          ? null
          : role === 'coach'
            ? (selectedAthleteId || user?._id)
            : selectedAthleteId);

      if (role === 'coach' && !athleteId) {
        setTrainings([]);
        return;
      }
      if (
        role === 'coach' &&
        athleteId &&
        String(athleteId) !== String(user?._id || '') &&
        pendingAthleteIds.includes(String(athleteId))
      ) {
        setTrainings([]);
        return;
      }

      const raw = await getFitTrainings(athleteId);
      const data = normalizeApiList(raw);
      if (raw != null && !Array.isArray(raw) && data.length === 0) {
        console.warn('[FitAnalysis] getFitTrainings returned non-array; using empty list.', raw);
      }
      
      // Remove duplicates based on _id before setting
      const uniqueTrainings = [];
      const seenIds = new Set();
      
      data.forEach(training => {
        if (training._id && !seenIds.has(training._id.toString())) {
          seenIds.add(training._id.toString());
          uniqueTrainings.push(training);
        }
      });
      
      
      setTrainings(uniqueTrainings);

      // Fetch comment counts for all trainings
      const ids = uniqueTrainings.filter(t => t._id).map(t => String(t._id));
      if (ids.length > 0) {
        getTrainingCommentCounts(ids).then(r => setCommentCounts(r.data || {})).catch(() => {});
      }

      // Check if we should restore training selection
      const savedTrainingId = localStorage.getItem('fitAnalysis_selectedTrainingId');
      const savedTrainingModelId = localStorage.getItem('fitAnalysis_selectedTrainingModelId');
      
      if (savedTrainingId && !selectedTraining) {
        // Verify the training still exists
        const trainingExists = uniqueTrainings?.some(t => t._id === savedTrainingId);
        if (trainingExists) {
          loadTrainingDetail(savedTrainingId);
        } else {
          // Training no longer exists, remove from localStorage
          localStorage.removeItem('fitAnalysis_selectedTrainingId');
        }
      } else if (savedTrainingModelId && !selectedTraining) {
        // Try to restore Training model selection
        loadTrainingFromTrainingModel(savedTrainingModelId);
      }
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.response?.status === 429) {
        console.warn('Rate limit exceeded when loading trainings. Please wait a moment.');
        // Don't show error to user, just log it
        return;
      }
      console.error('Error loading trainings:', error);
      setTrainings([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAthleteId, user?.role, user?._id, selectedTraining, pendingAthleteIds]);

  // Load regular trainings from /training route
  const loadRegularTrainings = useCallback(async (athleteIdOverride = null) => {
    try {
      const role = String(user?.role || '').toLowerCase();
      const athleteId =
        athleteIdOverride ||
        (role === 'athlete'
          ? user._id
          : role === 'coach'
            ? (selectedAthleteId || user._id)
            : selectedAthleteId);

      if (role === 'coach' && !athleteId) {
        setRegularTrainings([]);
        return;
      }
      if (
        role === 'coach' &&
        athleteId &&
        String(athleteId) !== String(user?._id || '') &&
        pendingAthleteIds.includes(String(athleteId))
      ) {
        setRegularTrainings([]);
        return;
      }

      if (!athleteId) {
        return;
      }
      
      const response = await api.get(`/user/athlete/${athleteId}/trainings`);
      if (response && response.data) {
        setRegularTrainings(response.data);
      }
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.response?.status === 429) {
        console.warn('Rate limit exceeded when loading regular trainings. Please wait a moment.');
        // Don't show error to user, just log it
        return;
      }
      console.error('Error loading regular trainings:', error);
    }
  }, [selectedAthleteId, user?.role, user?._id, pendingAthleteIds]);

  // Load regular training detail from /training route
  const loadRegularTrainingDetail = useCallback(async (id) => {
    try {
      const response = await api.get(`/api/training/${id}`);
      if (response && response.data) {
        const data = response.data;
        const sportRaw = (data.sport || '').toLowerCase();
        const sportMapped = sportRaw === 'bike' ? 'cycling' : sportRaw === 'run' ? 'running' : sportRaw === 'swim' ? 'swimming' : 'generic';

        const trainingData = {
          ...data,
          sport: sportMapped,
          titleManual: data.title || data.titleManual,
          titleAuto: data.title || data.titleAuto,
          timestamp: data.date ? new Date(data.date) : new Date(),
          totalElapsedTime: data.results?.reduce((s, r) => s + (r.durationSeconds || parseDurationToSeconds(r.duration) || 0), 0) || 0,
          laps: (data.results || []).map((result, index) => {
            const durationSec = result.durationSeconds || parseDurationToSeconds(result.duration) || 0;
            return {
              lapNumber: index + 1,
              totalElapsedTime: durationSec,
              totalTimerTime: durationSec,
              avgPower: result.power || null,
              maxPower: result.power || null,
              avgHeartRate: result.heartRate || null,
              maxHeartRate: result.heartRate || null,
              lactate: result.lactate || null,
            };
          }),
          records: [],
          isRegularTraining: true
        };
        setSelectedTraining(trainingData);
        setSelectedStrava(null);
        setSelectedStravaStreams(null);
        localStorage.setItem('fitAnalysis_selectedRegularTrainingId', id);
        localStorage.removeItem('fitAnalysis_selectedTrainingId');
        localStorage.removeItem('fitAnalysis_selectedStravaId');
        localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
      }
    } catch (error) {
      console.error('Error loading regular training detail:', error);
    }
  }, []);

  const loadTrainingDetail = useCallback(async (id) => {
    if (!gate('FIT Training Analysis', 'pro')) return;
    try {
      setDetailLoading(true);
      const data = await getFitTraining(id);
      
      // Debug: Check what data we have
      if (data.records && data.records.length > 0) {
        const firstRecord = data.records[0];
        console.log('First record from backend:', {
          hasCadence: firstRecord.cadence !== null && firstRecord.cadence !== undefined,
          hasAltitude: firstRecord.altitude !== null && firstRecord.altitude !== undefined,
          cadence: firstRecord.cadence,
          altitude: firstRecord.altitude,
          allKeys: Object.keys(firstRecord)
        });
        
        // Check if cadence/altitude are in different fields
        const recordsWithCadence = data.records.filter(r => r.cadence !== null && r.cadence !== undefined && r.cadence > 0);
        const recordsWithAltitude = data.records.filter(r => r.altitude !== null && r.altitude !== undefined && r.altitude > 0);
        console.log('Records with cadence:', recordsWithCadence.length, 'Records with altitude:', recordsWithAltitude.length);
      }
      
      // Check for duplicate laps and deduplicate if needed
      if (data.laps && Array.isArray(data.laps)) {
        data.laps = deduplicateFitTrainingLaps(data.laps);
      }
      
      // Check for duplicate records and deduplicate if needed
      if (data.records && Array.isArray(data.records)) {
        const seenRecords = new Map();
        const uniqueRecords = [];
        
        data.records.forEach((record) => {
          // Use timestamp as primary identifier
          const timestamp = record.timestamp ? new Date(record.timestamp).getTime() : null;
          if (timestamp) {
            const key = `time_${timestamp}`;
            if (seenRecords.has(key)) {
              return;
            }
            seenRecords.set(key, true);
            uniqueRecords.push(record);
            return;
          }
          
          // Fallback: Use combination of properties if no timestamp
          const distance = Math.round((record.distance || 0) * 100) / 100;
          const power = Math.round((record.power || 0) * 10) / 10;
          const hr = Math.round((record.heartRate || 0) * 10) / 10;
          const speed = Math.round((record.speed || 0) * 1000) / 1000;
          const key = `d${distance}_p${power}_hr${hr}_s${speed}`;
          
          if (seenRecords.has(key)) {
            return;
          }
          seenRecords.set(key, true);
          uniqueRecords.push(record);
        });
        
        data.records = uniqueRecords;
      }
      
      setSelectedTraining(data);
      setSelectedStravaStreams(null);
      // Persist selection to localStorage
      localStorage.setItem('fitAnalysis_selectedTrainingId', id);
      localStorage.removeItem('fitAnalysis_selectedStravaId');
      localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
      setDetailLoading(false);
      
      // Don't reload trainings here - it's expensive and usually not needed
      // Only reload if training was deleted or modified externally
    } catch (error) {
      console.error('Error loading training detail:', error);
      // Remove invalid ID from localStorage
      localStorage.removeItem('fitAnalysis_selectedTrainingId');
      setDetailLoading(false);
    }
  }, [gate]);

  // Load training from Training model (from TrainingTable)
  const loadTrainingFromTrainingModel = useCallback(async (trainingId) => {
    try {
      // Ensure regularTrainings are loaded first so calendar can find the activity
      await loadRegularTrainings();
      
      let response;
      try {
        response = await getTrainingById(trainingId);
      } catch (apiError) {
        // Some stale IDs in localStorage may point to a removed Training model item.
        // Try FIT fallback before giving up, then clear stale storage keys.
        if (apiError?.response?.status === 404) {
          try {
            const fitTraining = await getFitTraining(trainingId);
            if (fitTraining?.laps && Array.isArray(fitTraining.laps)) {
              fitTraining.laps = deduplicateFitTrainingLaps(fitTraining.laps);
            }
            setSelectedTraining(fitTraining);
            setSelectedStrava(null);
            setSelectedStravaStreams(null);
            localStorage.setItem('fitAnalysis_selectedTrainingId', trainingId);
            localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
            localStorage.removeItem('fitAnalysis_selectedStravaId');
            return;
          } catch (fitFallbackError) {
            localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
            localStorage.removeItem('fitAnalysis_selectedTrainingId');
            console.warn('Training not found in both Training and FIT models; cleared stale selection.');
            return;
          }
        }
        throw apiError;
      }
      const data = response.data || response; // Handle both response formats
      
      if (!data) {
        console.error('No training data received');
        return;
      }
      
      // Helper: copy lactate (and other user-entered values) from the parent
      // Training.results onto the source FIT/Strava laps, so the intervals
      // table on the detail page shows them.
      const mergeLactateFromResults = (laps, results) => {
        if (!Array.isArray(laps) || !Array.isArray(results) || results.length === 0) return laps;
        return laps.map((lap, idx) => {
          const r = results.find(x => Number.isFinite(x?.sourceLapIndex) && x.sourceLapIndex === idx)
                 || results[idx]; // fallback: positional match
          if (!r) return lap;
          const next = (typeof lap.toObject === 'function') ? lap.toObject() : { ...lap };
          if (r.lactate != null && next.lactate == null) next.lactate = r.lactate;
          if (r.RPE != null && next.RPE == null) next.RPE = r.RPE;
          return next;
        });
      };

      // Try to load original FitTraining or StravaActivity if reference exists
      if (data.sourceFitTrainingId) {
        try {
          const fitTraining = await getFitTraining(data.sourceFitTrainingId);

          // Check for duplicate laps and deduplicate if needed
          if (fitTraining.laps && Array.isArray(fitTraining.laps)) {
            fitTraining.laps = deduplicateFitTrainingLaps(fitTraining.laps);
            fitTraining.laps = mergeLactateFromResults(fitTraining.laps, data.results);
          }

          setSelectedTraining(fitTraining);
          setSelectedStrava(null);
          setSelectedStravaStreams(null);
          localStorage.setItem('fitAnalysis_selectedTrainingId', data.sourceFitTrainingId);
          localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
          localStorage.removeItem('fitAnalysis_selectedStravaId');
          
          // Clean URL params
          const url = new URL(window.location.href);
          url.searchParams.delete('trainingId');
          url.searchParams.delete('title');
          window.history.replaceState({}, '', url);
          return;
        } catch (fitError) {
          console.error('Error loading FitTraining, falling back to Training model:', fitError);
        }
      } else if (data.sourceStravaActivityId) {
        try {
          // Use the same loader as when selecting from calendar, so selectedStrava has the expected shape
          // and CalendarView can highlight/anchor correctly.
          await loadStravaDetail(data.sourceStravaActivityId, { overrideTitle: data.title || null, mergeResults: data.results || null });
          
          // Clean URL params
          const url = new URL(window.location.href);
          url.searchParams.delete('trainingId');
          url.searchParams.delete('title');
          window.history.replaceState({}, '', url);
          return;
        } catch (stravaError) {
          console.error('Error loading StravaActivity, falling back to Training model:', stravaError);
        }
      }
      
      // Fallback: Convert Training model to format compatible with FitAnalysisPage
      // Training model has results array, not records/laps like FitTraining
      const convertedTraining = {
        _id: data._id,
        titleManual: data.title,
        titleAuto: data.title,
        originalFileName: data.title,
        description: data.description || '',
        sport: data.sport === 'bike' ? 'cycling' : (data.sport === 'run' ? 'running' : (data.sport === 'swim' ? 'swimming' : 'generic')),
        timestamp: new Date(data.date),
        totalElapsedTime: data.results?.reduce((sum, r) => sum + (r.durationSeconds || parseDurationToSeconds(r.duration) || 0), 0) || 0,
        totalTimerTime: data.results?.reduce((sum, r) => sum + (r.durationSeconds || parseDurationToSeconds(r.duration) || 0), 0) || 0,
        // Convert results to laps format for display
        laps: data.results?.map((result, index) => {
          // Get duration in seconds - use durationSeconds if available, otherwise parse from duration string
          const durationSec = result.durationSeconds || parseDurationToSeconds(result.duration) || 0;

    return {
            lapNumber: index + 1,
            totalElapsedTime: durationSec,
            totalTimerTime: durationSec,
            avgPower: result.power || null,
            maxPower: result.power || null,
            avgHeartRate: result.heartRate || null,
            maxHeartRate: result.heartRate || null,
            lactate: result.lactate || null,
            // Note: Training model doesn't have records, so we can't show detailed chart
          };
        }) || [],
        records: [], // Training model doesn't have records, so no detailed chart
        isFromTrainingModel: true // Flag to indicate this is from Training model
      };
      
      // Add converted training to trainings array if not already present
      // Use a Set to track IDs to prevent duplicates
      setTrainings(prev => {
        const seenIds = new Set(prev.map(t => t._id?.toString()));
        const exists = seenIds.has(convertedTraining._id?.toString());
        if (!exists) {
          // Also check for duplicates in the new array
          const newTrainings = [...prev, convertedTraining];
          const uniqueTrainings = [];
          const newSeenIds = new Set();
          newTrainings.forEach(t => {
            const id = t._id?.toString();
            if (id && !newSeenIds.has(id)) {
              newSeenIds.add(id);
              uniqueTrainings.push(t);
            }
          });
          return uniqueTrainings;
        }
        return prev;
      });
      
      setSelectedTraining(convertedTraining);
      setSelectedStrava(null);
      setSelectedStravaStreams(null);
      // Persist selection to localStorage
      localStorage.setItem('fitAnalysis_selectedTrainingModelId', trainingId);
      localStorage.removeItem('fitAnalysis_selectedTrainingId');
      localStorage.removeItem('fitAnalysis_selectedStravaId');
      
      // Clean URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('trainingId');
      url.searchParams.delete('title');
      window.history.replaceState({}, '', url);
    } catch (error) {
      console.error('Error loading training from Training model:', error);
      console.error('Error details:', error.response?.data || error.message);
      localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
      alert('Error loading training: ' + (error.response?.data?.error || error.message));
    }
  }, [loadRegularTrainings, loadStravaDetail]);
  
  // Helper function to parse duration string (MM:SS or HH:MM:SS) to seconds
  const parseDurationToSeconds = (durationStr) => {
    if (!durationStr || typeof durationStr !== 'string') return 0;
    const parts = durationStr.split(':');
    if (parts.length === 2) {
      // MM:SS format
      const minutes = parseInt(parts[0], 10) || 0;
      const seconds = parseInt(parts[1], 10) || 0;
      return minutes * 60 + seconds;
    } else if (parts.length === 3) {
      // HH:MM:SS format
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      const seconds = parseInt(parts[2], 10) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  };


  const handleDeleteTraining = async (trainingId) => {
    if (!window.confirm('Are you sure you want to delete this training? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteFitTraining(trainingId);
      await loadTrainings();
      if (selectedTraining?._id === trainingId) {
        setSelectedTraining(null);
        localStorage.removeItem('fitAnalysis_selectedTrainingId');
      }
      alert('Training deleted successfully');
    } catch (error) {
      console.error('Error deleting training:', error);
      alert('Error deleting training');
    }
  };




  // Initialize selectedAthleteId on mount for coach/admin or when returning to page
  useEffect(() => {
    const isCoachLike = ['coach', 'admin', 'tester', 'testing'].includes(user?.role) ||
      (user?.admin === true && user?.role !== 'athlete');
    if (isCoachLike) {
      // Prefer the app-wide selection (global_selectedAthleteId) set on Home /
      // dashboard so the calendar follows the athlete chosen elsewhere. The
      // calendar's own key is only a fallback (it's bridged via window events
      // while mounted, but a fresh mount must read the global key — otherwise
      // a coach who picks an athlete on Home lands on stale/own data here).
      const globalAthleteId = localStorage.getItem('global_selectedAthleteId');
      const savedAthleteId  = localStorage.getItem('trainingCalendar_selectedAthleteId');
      const resolved = globalAthleteId || savedAthleteId || user._id;
      setSelectedAthleteId(resolved);
      localStorage.setItem('trainingCalendar_selectedAthleteId', resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.pathname]); // Run when user changes or when pathname changes (returning to page)

  // Listen for athlete selection from any source (native bar, desktop Menu, desktop CoachAthleteBar)
  useEffect(() => {
    const handleAthleteSelected = (event) => {
      const { athleteId } = event.detail;
      if (athleteId && athleteId !== selectedAthleteId) {
        setSelectedAthleteId(athleteId);
        localStorage.setItem('trainingCalendar_selectedAthleteId', athleteId);
      }
    };

    // 3 event names used across different dispatchers — listen to all of them
    window.addEventListener('athleteSelected', handleAthleteSelected);      // native NativeLayout
    window.addEventListener('athleteChanged', handleAthleteSelected);       // desktop Menu
    window.addEventListener('globalAthleteChanged', handleAthleteSelected); // desktop CoachAthleteBar
    return () => {
      window.removeEventListener('athleteSelected', handleAthleteSelected);
      window.removeEventListener('athleteChanged', handleAthleteSelected);
      window.removeEventListener('globalAthleteChanged', handleAthleteSelected);
    };
  }, [selectedAthleteId]);

  useEffect(() => {
    const loadCoachAthletes = async () => {
      const role = String(user?.role || '').toLowerCase();
      const isCoachLike = ['admin', 'coach', 'tester', 'testing'].includes(role) ||
        (user?.admin === true && role !== 'athlete');
      if (!isCoachLike) return;
      try {
        const response = await api.get('/user/coach/athletes');
        const list = Array.isArray(response?.data) ? response.data : [];
        const pendingIds = list
          .filter((a) => a?.invitationPending || a?.coachLinkStatus === 'pending')
          .map((a) => String(a._id));
        setPendingAthleteIds(pendingIds);
      } catch (e) {
        console.warn('Failed to load coach athletes for pending-state checks:', e?.message || e);
      }
    };
    loadCoachAthletes();
  }, [user?.role, user?.admin]);

  useEffect(() => {
    const role = String(user?.role || '').toLowerCase();
    if (role !== 'coach') return;
    if (!selectedAthleteId) return;
    const isPendingSelection =
      String(selectedAthleteId) !== String(user?._id || '') &&
      pendingAthleteIds.includes(String(selectedAthleteId));
    if (!isPendingSelection) return;

    const fallbackAthleteId = String(user?._id || '');
    if (!fallbackAthleteId) return;
    setSelectedAthleteId(fallbackAthleteId);
    localStorage.setItem('trainingCalendar_selectedAthleteId', fallbackAthleteId);
    setSelectedTraining(null);
    setSelectedStrava(null);
  }, [selectedAthleteId, pendingAthleteIds, user?._id, user?.role]);

  // Reload data when selectedAthleteId changes (debounced to prevent multiple calls)
  useEffect(() => {
    if (user && selectedAthleteId) {
      // Use a small timeout to debounce rapid changes
      const timeoutId = setTimeout(() => {
        loadTrainings();
        loadExternalActivities();
        loadRegularTrainings();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [selectedAthleteId, user, loadTrainings, loadExternalActivities, loadRegularTrainings]);

  // Live refresh on Strava sync (2026-05). Without this, a webhook-delivered
  // activity or a manual /strava/auto-sync click only shows up after the
  // user hard-reloads the page — exactly the bug Honza reported. The custom
  // event is dispatched from services/api.js (manual sync) and from the
  // NotificationBell (when a 'strava_import' bell notif arrives via polling).
  // Both paths funnel here so the calendar updates in seconds, not on reload.
  useEffect(() => {
    if (!user) return;
    const onStravaSynced = () => {
      // Refresh the three collections any Strava-imported activity might
      // land in. Cheaper than a full route remount and preserves the user's
      // current scroll / selected day in the calendar.
      loadExternalActivities();
      loadRegularTrainings();
      loadTrainings();
    };
    window.addEventListener('strava:synced', onStravaSynced);
    return () => window.removeEventListener('strava:synced', onStravaSynced);
  }, [user, loadExternalActivities, loadRegularTrainings, loadTrainings]);


  const [calendarPeriod, setCalendarPeriod] = useState(null);
  const handleCalendarPeriodChange = useCallback((info) => {
    setCalendarPeriod(info);
  }, []);

  // Stable no-op callback — CalendarView's "month changed" effect compares
  // the function identity in its deps array, so if we passed an inline
  // function (or worse, a `useCallback(...)` evaluated INSIDE JSX, which
  // is a Rules-of-Hooks violation) the effect re-runs every render, calls
  // setState in the parent, and spins into a "Maximum update depth
  // exceeded" loop that breaks month navigation entirely. Defining this
  // at component top means the identity is stable across renders.
  const handleCalendarMonthChange = useCallback((info) => {
    // Data is loaded for the whole period at once — no API call needed
    // on month change; this is purely an info hook the calendar fires.
    console.log('Month changed to:', info, '- data already loaded, no API call needed');
  }, []);

  const handleCalendarActivitySelect = useCallback(
    (a) => {
      if (!a?.id) return;
      const rid = String(a.id);
      setSelectedTraining(null);
      setSelectedStrava(null);
      setSelectedStravaStreams(null);
      setSelectedLapNumber(null);
      setDetailLoading(true);
      navigate(`/training-calendar/${encodeURIComponent(rid)}`);

      if (rid.startsWith('strava-')) {
        const sid = rid.replace('strava-', '');
        loadStravaDetail(sid, { overrideTitle: a?.linkedTrainingTitle || null });
      } else if (rid.startsWith('regular-')) {
        loadRegularTrainingDetail(rid.replace('regular-', ''));
      } else if (rid.startsWith('fit-')) {
        loadTrainingDetail(rid.replace('fit-', ''));
      } else if (rid.startsWith('training-')) {
        loadTrainingFromTrainingModel(rid.replace('training-', ''));
      } else {
        loadTrainingDetail(rid);
      }
    },
    [navigate, loadStravaDetail, loadRegularTrainingDetail, loadTrainingDetail, loadTrainingFromTrainingModel]
  );

  const calendarMergedActivities = React.useMemo(() => {
    const trainingByStravaId = new Map();
    (regularTrainings || []).forEach((t) => {
      const sid = t?.sourceStravaActivityId;
      if (sid) trainingByStravaId.set(String(sid), t);
    });
    const hrFrom = (o) =>
      o?.avgHeartRate ??
      o?.averageHeartRate ??
      o?.average_heartrate ??
      o?.averageHeartrate ??
      null;
    return [
      ...trainings.map((t) => ({
        id: `fit-${t._id}`,
        // Some older FIT imports may have missing `timestamp`; fall back to uploadDate/date
        // so CalendarView doesn't drop the activity as "missing date".
        date: t.timestamp || t.uploadDate || t.date,
        title: t.titleManual || t.titleAuto || t.originalFileName || 'Untitled Training',
        sport: t.sport,
        category: t.category || null,
        type: 'fit',
        distance: t.totalDistance || t.distance,
        // FIT files store time as numeric seconds; convert any string fallback just in case.
        totalElapsedTime: t.totalElapsedTime || t.totalTimerTime || t.movingTime || t.totalTime
          || parseDurationToSeconds(t.duration) || 0,
        totalTime: t.totalElapsedTime || t.totalTimerTime || t.movingTime || t.totalTime
          || parseDurationToSeconds(t.duration) || 0,
        tss: t.trainingStressScore || t.tss || t.totalTSS,
        avgPower: t.avgPower || t.averagePower || null,
        avgSpeed: t.avgSpeed || t.averageSpeed || null,
        avgHeartRate: hrFrom(t),
      })),
      ...regularTrainings
        .filter((t) => !t?.sourceStravaActivityId)
        .map((t) => ({
          id: `regular-${t._id}`,
          date: t.date || t.timestamp,
          title: t.title || 'Untitled Training',
          sport: t.sport,
          category: t.category || null,
          type: 'regular',
          distance: t.totalDistance || t.distance,
          // Training model stores duration as a String ("H:MM:SS") — parse to seconds
          // so CalendarPeriodStats can sum it correctly.
          totalElapsedTime: t.totalElapsedTime || t.totalTimerTime || t.movingTime || t.totalTime
            || parseDurationToSeconds(t.duration) || 0,
          totalTime: t.totalElapsedTime || t.totalTimerTime || t.movingTime || t.totalTime
            || parseDurationToSeconds(t.duration) || 0,
          tss: t.trainingStressScore || t.tss || t.totalTSS,
          avgPower: t.avgPower || t.averagePower || null,
          avgSpeed: t.avgSpeed || t.averageSpeed || null,
          avgHeartRate: hrFrom(t),
        })),
      ...externalActivities.map((a) => {
        const linked = trainingByStravaId.get(String(a.stravaId));
        const source = a.source || (a.stravaId != null ? 'strava' : a.garminId != null ? 'garmin' : 'strava');
        const extId = source === 'garmin'
          ? `garmin-${a.garminId}`
          : source === 'apple_health'
            ? `apple-${a.healthKitId || a.sourceId}`
            : `strava-${a.stravaId}`;
        return {
          _id: a._id,
          stravaId: a.stravaId ?? null,
          garminId: a.garminId ?? null,
          source,
          id: extId,
          date: a.startDate,
          title: linked?.title || a.titleManual || a.name || 'Untitled Activity',
          linkedTrainingTitle: linked?.title || null,
          sport: a.sport,
          category: a.category || linked?.category || null,
          type: source === 'garmin' ? 'garmin' : source === 'apple_health' ? 'apple_health' : 'strava',
          distance: a.distance,
          totalElapsedTime: a.movingTime || a.elapsedTime || a.totalTime,
          totalTime: a.movingTime || a.elapsedTime || a.totalTime,
          movingTime: a.movingTime || a.elapsedTime,
          tss: a.manualTss ?? a.tss ?? a.totalTSS,
          avgPower: a.averagePower || a.average_watts || null,
          avgSpeed: a.averageSpeed || a.average_speed || null,
          avgHeartRate: hrFrom(a),
        };
      }),
    ];
  }, [trainings, regularTrainings, externalActivities]);

  const handleCloseTrainingDetail = useCallback(() => {
    setSelectedTraining(null);
    setSelectedStrava(null);
    setSelectedStravaStreams(null);
    setSelectedLapNumber(null);
    setDetailLoading(false);
    localStorage.removeItem('fitAnalysis_selectedTrainingId');
    localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
    localStorage.removeItem('fitAnalysis_selectedRegularTrainingId');
    localStorage.removeItem('fitAnalysis_selectedStravaId');
    navigate('/training-calendar');
  }, [navigate]);

  /** Find a previously saved Training row linked to this Strava activity. */
  const findSavedTrainingForStrava = (strava, sport) => {
    const stravaId = String(strava?.id || strava?.stravaId || '').replace(/^strava-/i, '');
    const actDate = new Date(strava?.start_date_local || strava?.start_date || strava?.startDate || Date.now());
    const actStart = Number.isNaN(actDate.getTime()) ? 0 : actDate.getTime();
    return (regularTrainings || []).find((t) => {
      if (!t) return false;
      if (stravaId && String(t.sourceStravaActivityId || '').replace(/^strava-/i, '') === stravaId) return true;
      if (stravaId && String(t.stravaId || '').replace(/^strava-/i, '') === stravaId) return true;
      const tStart = new Date(t.date).getTime();
      return actStart && tStart && Math.abs(tStart - actStart) < 90_000 && String(t.sport) === String(sport);
    }) || null;
  };

  /** Keep user's lap types (work/rest/warmup/cooldown) when re-opening the form. */
  const mergeSavedResultsWithFreshLaps = (savedResults, freshResults) => {
    if (!Array.isArray(savedResults) || savedResults.length === 0) return freshResults;
    if (!Array.isArray(freshResults) || freshResults.length === 0) return savedResults;
    if (savedResults.length !== freshResults.length) return savedResults;
    return savedResults.map((saved, i) => {
      const fresh = freshResults[i] || {};
      return {
        ...fresh,
        ...saved,
        intervalType: saved.intervalType || fresh.intervalType,
        isRecovery: saved.isRecovery ?? fresh.isRecovery,
        isSelected: saved.isSelected ?? fresh.isSelected,
        lactate: saved.lactate != null && saved.lactate !== '' ? saved.lactate : fresh.lactate,
        RPE: saved.RPE ?? fresh.RPE,
        power: saved.power || fresh.power,
        heartRate: saved.heartRate || fresh.heartRate,
        duration: saved.duration || fresh.duration,
        durationSeconds: saved.durationSeconds || fresh.durationSeconds,
        sourceLapIndex: saved.sourceLapIndex ?? fresh.sourceLapIndex ?? i,
      };
    });
  };

  // Convert Strava laps to Training format
  const convertLapsToTrainingFormat = (laps, isRecoveryMap = new Map(), durationTypePreference = 'auto', sportTypeHint = null) => {
    // Determine sport type
    const sportType = sportTypeHint || selectedStrava?.sport_type || selectedStrava?.sport || 'bike';
    const isRun = sportType.toLowerCase().includes('run');
    const isSwim = sportType.toLowerCase().includes('swim');
    
    return laps.map((lap, idx) => {
      const isRecovery = isRecoveryMap.get(idx) || false;
      const duration = lap.moving_time ?? lap.elapsed_time ?? 0;
      const power = lap.average_watts || lap.average_power || null;
      const heartRate = lap.average_heartrate ?? lap.avgHeartRate ?? lap.avg_heart_rate ?? null;
      const lactate = lap.lactate || null;
      const distance = lap.distance || null; // distance in meters
      const elevationGain = lap.total_elevation_gain ?? lap.elevation_gain ?? lap.total_ascent ?? null;
      const elevationLoss = lap.total_descent ?? lap.elevation_loss ?? lap.descent ?? null;
      let elevation = null;
      if (Number.isFinite(Number(elevationGain)) && Number.isFinite(Number(elevationLoss))) {
        elevation = Number(elevationGain) - Number(elevationLoss);
      } else if (Number.isFinite(Number(elevationGain))) {
        elevation = Number(elevationGain);
      } else if (Number.isFinite(Number(elevationLoss))) {
        elevation = -Math.abs(Number(elevationLoss));
      } else if (Number.isFinite(Number(lap.elevation))) {
        elevation = Number(lap.elevation);
      }
      
      // For run/swim, convert pace from speed to MM:SS format
      let powerValue = '';
      if (isRun || isSwim) {
        // Convert speed (m/s) to pace (seconds per km for run, seconds per 100m for swim)
        const effectiveSpeed = (lap.average_speed && lap.average_speed > 0.05)
          ? lap.average_speed
          : (distance > 0 && duration > 0 ? distance / duration : 0);
        if (effectiveSpeed > 0.05) {
          const paceSeconds = isRun
            ? Math.round(1000 / effectiveSpeed)   // sec/km
            : Math.round(100 / effectiveSpeed);   // sec/100m
          const minutes = Math.floor(paceSeconds / 60);
          const seconds = paceSeconds % 60;
          powerValue = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
      } else {
        // For bike, use power directly
        powerValue = power ? power.toString() : '';
      }
      
      // Format distance if available (convert meters to km for display, or keep as meters for swim)
      let useDistance = false;
      
      // Determine if we should use distance based on preference
      if (durationTypePreference === 'distance') {
        // Force distance if available
        useDistance = distance && distance > 0;
      } else if (durationTypePreference === 'time') {
        // Force time
        useDistance = false;
      } else {
        // Auto: use distance if available
        useDistance = distance && distance > 0;
      }
      
      if (useDistance && distance && distance > 0) {
        if (isSwim) {
          // For swim, show in meters (e.g., "400m", "50m")
          if (distance >= 1000) {
          } else {
          }
        } else {
          // For bike/run, show in km (e.g., "1 km", "5.2 km")
          if (distance >= 1000) {
          } else {
            // If less than 1km, show in meters
          }
        }
      }
      
      const distanceMetersNum = distance && distance > 0 ? Math.round(distance) : undefined;

      return {
        interval: idx + 1,
        sourceLapIndex: lap?.__sourceIndex ?? idx,
        power: powerValue,
        heartRate: heartRate ? heartRate.toString() : '',
        lactate: lactate ? lactate.toString() : '',
        RPE: '',
        elevation: elevation != null && Number.isFinite(Number(elevation)) ? Math.round(Number(elevation)).toString() : '',
        duration: formatDuration(duration), // always MM:SS time
        durationSeconds: duration || 0,     // raw seconds for card header + submit conversion
        durationType: 'time',
        distanceMeters: distanceMetersNum,  // raw meters for Distance field
        repeatCount: 1,
        isRecovery: isRecovery,
        isSelected: !isRecovery,
        intervalType: lap.intervalType || (isRecovery ? 'recovery' : undefined),
      };
    });
  };

  // Detect if lap is a recovery/rest interval (should be excluded by default)
  const isRecoveryInterval = (lap, lapIndex, sportType, allLaps = []) => {
    const isRun = sportType.toLowerCase().includes('run');
    const isSwim = sportType.toLowerCase().includes('swim');
    const isBike = !isRun && !isSwim;
    
    // Check duration - very short intervals (< 10s) are likely artifacts
    const duration = lap.elapsed_time || 0;
    if (duration < 10) {
      return true;
    }
    
    // Get current lap power/speed
    let currentPower = 0;
    let currentSpeed = 0;
    if (isBike) {
      currentPower = lap.average_watts || lap.average_power || 0;
    } else {
      currentSpeed = lap.average_speed || 0;
    }
    
    // Compare with neighboring intervals (more accurate than global average)
    const prevLap = lapIndex > 0 ? allLaps[lapIndex - 1] : null;
    const nextLap = lapIndex < allLaps.length - 1 ? allLaps[lapIndex + 1] : null;
    
    let prevPower = 0, nextPower = 0;
    let prevSpeed = 0, nextSpeed = 0;
    
    if (prevLap) {
      if (isBike) {
        prevPower = prevLap.average_watts || prevLap.average_power || 0;
      } else {
        prevSpeed = prevLap.average_speed || 0;
      }
    }
    
    if (nextLap) {
      if (isBike) {
        nextPower = nextLap.average_watts || nextLap.average_power || 0;
      } else {
        nextSpeed = nextLap.average_speed || 0;
      }
    }
    
    // Check if current interval is significantly lower than neighbors (recovery between work intervals)
    if (isBike) {
      // If both neighbors exist and are significantly higher, this is likely recovery
      if (prevPower > 0 && nextPower > 0) {
        const avgNeighborPower = (prevPower + nextPower) / 2;
        const powerDiff = avgNeighborPower - currentPower;
        // If current power is less than 80% of average neighbor power AND difference is at least 50W, it's likely recovery
        // Example: 300W neighbors, 240W current = 60W diff, 240W < 240W (80% of 300W) = true
        // This catches cases like 3x30min 300W with 2min 240W recovery between them
        if (currentPower > 0 && currentPower < avgNeighborPower * 0.80 && powerDiff >= 50 && avgNeighborPower > 150) {
          return true;
        }
      }
      // Also check if one neighbor is significantly higher
      if (prevPower > 0 && currentPower > 0 && prevPower > currentPower * 1.2 && (prevPower - currentPower) >= 50 && prevPower > 150) {
        // Previous was work, current is lower
        if (nextPower === 0 || nextPower > currentPower * 1.2) {
          // Next is also work or doesn't exist, so current is recovery
          return true;
        }
      }
      if (nextPower > 0 && currentPower > 0 && nextPower > currentPower * 1.2 && (nextPower - currentPower) >= 50 && nextPower > 150) {
        // Next is work, current is lower
        if (prevPower === 0 || prevPower > currentPower * 1.2) {
          // Previous was also work or doesn't exist, so current is recovery
          return true;
        }
      }
      
      // Global average check (fallback)
      let avgPower = 0;
      let powerCount = 0;
      allLaps.forEach(l => {
        const p = l.average_watts || l.average_power || 0;
        if (p > 0) {
          avgPower += p;
          powerCount++;
        }
      });
      if (powerCount > 0) avgPower = avgPower / powerCount;
      
      // If power is very low (< 50W) or significantly below average (< 30% of avg), it's likely recovery
      if (currentPower < 50 || (avgPower > 0 && currentPower < avgPower * 0.3)) {
        return true;
      }
    }
    
    // Check speed for run/swim
    if (isRun || isSwim) {
      // Similar logic for speed
      if (prevSpeed > 0 && nextSpeed > 0) {
        const avgNeighborSpeed = (prevSpeed + nextSpeed) / 2;
        if (currentSpeed > 0 && currentSpeed < avgNeighborSpeed * 0.85 && avgNeighborSpeed > 1) {
          return true;
        }
      }
      
      // Global average check
      let avgSpeed = 0;
      let speedCount = 0;
      allLaps.forEach(l => {
        const s = l.average_speed || 0;
        if (s > 0) {
          avgSpeed += s;
          speedCount++;
        }
      });
      if (speedCount > 0) avgSpeed = avgSpeed / speedCount;
      
      const absoluteThreshold = isRun ? 2 : 0.5;
      const relativeThreshold = avgSpeed > 0 ? avgSpeed * 0.4 : absoluteThreshold;
      const threshold = Math.max(absoluteThreshold, relativeThreshold);
      
      if (currentSpeed < threshold) {
        return true;
      }
    }
    
    // Check heart rate - if HR is very low compared to average, might be recovery
    const avgHR = lap.average_heartrate ?? lap.avgHeartRate ?? lap.avg_heart_rate ?? null;
    if (avgHR && avgHR < 100) {
      // Very low HR might indicate recovery, but not always
      // Only mark as recovery if combined with low power/speed
      if (isBike && currentPower < 30) {
        return true;
      }
      if ((isRun || isSwim) && currentSpeed < 1) {
        return true;
      }
    }
    
    return false;
  };

  // Handle export to training - show duration type selection modal first
  const handleExportToTraining = () => {
    if (!selectedStrava || !selectedStrava.laps || selectedStrava.laps.length === 0) {
      alert('No intervals available to export');
      return;
    }
    performExportToTraining('auto');
  };

  // Perform the actual export with selected duration type.
  // stravaActivityOverride: optional activity object (used when opening from calendar "+ La").
  const performExportToTraining = (durationType = 'auto', stravaActivityOverride = null) => {
    const strava = stravaActivityOverride || selectedStrava;
    if (!strava || !strava.laps || strava.laps.length === 0) {
      return;
    }

    const uniqueLaps = deduplicateStravaLaps(strava.laps || []);

    // Determine sport type
    const sportType = strava?.sport_type || strava?.sport || 'bike';
    let sport = 'bike';
    if (sportType.toLowerCase().includes('run')) {
      sport = 'run';
    } else if (sportType.toLowerCase().includes('swim')) {
      sport = 'swim';
    }

    // Mark recovery intervals (but keep all intervals)
    const isRecoveryMap = new Map();
    uniqueLaps.forEach((lap, index) => {
      isRecoveryMap.set(index, isRecoveryInterval(lap, index, sportType, uniqueLaps));
    });

    // Convert all laps to training format (including recovery) with duration type preference
    const results = convertLapsToTrainingFormat(uniqueLaps, isRecoveryMap, durationType, sportType);

    // Check if we have at least some work intervals
    const workIntervals = results.filter(r => !r.isRecovery && r.intervalType !== 'recovery');
    if (workIntervals.length === 0) {
      alert('No work intervals found. All intervals appear to be recovery periods.');
      return;
    }

    // Format date safely (avoid RangeError: Invalid time value)
    const activityDate = strava?.start_date_local ||
                       strava?.start_date ||
                       strava?.startDate ||
                       new Date();
    const parsedActivityDate = new Date(activityDate);
    const safeActivityDate = Number.isNaN(parsedActivityDate.getTime()) ? new Date() : parsedActivityDate;
    const dateStr = safeActivityDate.toISOString().slice(0, 16);

    const savedTraining = findSavedTrainingForStrava(strava, sport);
    const mergedResults = savedTraining?.results?.length
      ? mergeSavedResultsWithFreshLaps(savedTraining.results, results)
      : results;

    // Prepare form data with all intervals (user can edit/remove in form)
    const formData = {
      sport: sport,
      type: 'interval',
      category: savedTraining?.category || strava?.category || '',
      title: savedTraining?.title || strava?.titleManual || strava?.name || 'Untitled Training',
      customTitle: '',
      description: savedTraining?.description || strava?.description || '',
      date: dateStr,
      ...(savedTraining?._id ? { _id: savedTraining._id } : {}),
      // Link back to Strava so we can merge calendar entries and keep Strava data as the source of truth
      sourceStravaActivityId: String(strava.id || strava.stravaId || ''),
      specifics: savedTraining?.specifics || {
        specific: '',
        weather: '',
        customSpecific: '',
        customWeather: ''
      },
      results: mergedResults,
    };

    setTrainingFormData(formData);
    setShowTrainingForm(true);
  };

  // Handle training form submission
  const handleTrainingFormSubmit = async (formData) => {
    try {
      setIsExporting(true);
      
      // Filter out unselected intervals (recovery intervals the user didn't
      // select). Never drop a lap that's been classified as work/warmup/cooldown
      // though — only genuine recovery laps may be deselected.
      const selectedResults = formData.results.filter(result =>
        result.isSelected !== false ||
        (result.intervalType && result.intervalType !== 'recovery')
      );
      
      // Remove internal flags and convert lactate/power/heartRate to proper types
      const cleanedResults = selectedResults.map(result => {
        const { isRecovery, isSelected, ...cleanedResult } = result;
        if (cleanedResult.lactate !== undefined && cleanedResult.lactate !== null && cleanedResult.lactate !== '') {
          cleanedResult.lactate = parseFloat(cleanedResult.lactate);
          if (isNaN(cleanedResult.lactate)) delete cleanedResult.lactate;
        } else {
          delete cleanedResult.lactate;
        }
        return cleanedResult;
      });
      
      const targetId = user?.role === 'athlete' ? user._id : (selectedAthleteId || user._id);
      
      const trainingData = {
        ...formData,
        results: cleanedResults,
        athleteId: targetId,
        coachId: user?.role === 'coach' ? user._id : undefined,
        // Persist source links if present (used to merge calendar entries)
        sourceStravaActivityId: formData?.sourceStravaActivityId || undefined,
        sourceFitTrainingId: formData?.sourceFitTrainingId || undefined
      };
      
      // Check if training already exists (by Strava activity ID first, then title+date)
      const existingTrainingsResponse = await api.get(`/user/athlete/${targetId}/trainings`);
      const allTrainings = existingTrainingsResponse.data || [];

      const existing = allTrainings.find(t =>
        // Primary match: same source Strava activity → always overwrite (handles lactate re-export)
        (formData.sourceStravaActivityId &&
          t.sourceStravaActivityId &&
          String(t.sourceStravaActivityId) === String(formData.sourceStravaActivityId)) ||
        // Fallback: same title + same date
        (t.title === formData.title &&
         new Date(t.date).toDateString() === new Date(formData.date).toDateString())
      );
      
      // Calculate average power/pace for similarity detection
      const calculateAvgValue = (results, sport) => {
        if (!results || results.length === 0) return 0;
        if (sport === 'bike') {
          const powers = results.map(r => Number(r.power)).filter(p => !isNaN(p) && p > 0);
          return powers.length > 0 ? powers.reduce((sum, p) => sum + p, 0) / powers.length : 0;
        } else {
          // For run/swim, parse pace
          const parsePace = (paceValue) => {
            if (typeof paceValue === 'number') return paceValue;
            if (typeof paceValue === 'string' && paceValue.includes(':')) {
              const [min, sec] = paceValue.split(':').map(Number);
              return !isNaN(min) && !isNaN(sec) ? min * 60 + sec : 0;
            }
            return Number(paceValue) || 0;
          };
          const paces = results.map(r => parsePace(r.power)).filter(p => p > 0);
          return paces.length > 0 ? paces.reduce((sum, p) => sum + p, 0) / paces.length : 0;
        }
      };
      
      const calculateTotalTime = (results) => {
        if (!results || results.length === 0) return 0;
        return results.reduce((sum, r) => {
          const duration = r.durationSeconds || (r.duration ? parseDurationToSeconds(r.duration) : 0);
          return sum + (duration || 0);
        }, 0);
      };
      
      const newAvgValue = calculateAvgValue(cleanedResults, formData.sport);
      const newTotalTime = calculateTotalTime(cleanedResults);
      
      // Find similar trainings (within 10% power/pace difference and 20% time difference)
      const similarTrainings = allTrainings.filter(t => {
        if (t._id === existing?._id) return false; // Exclude the existing one if updating
        if (t.sport !== formData.sport) return false; // Same sport only
        
        const tAvgValue = calculateAvgValue(t.results || [], t.sport);
        const tTotalTime = calculateTotalTime(t.results || []);
        
        if (newAvgValue === 0 || tAvgValue === 0) return false;
        if (newTotalTime === 0 || tTotalTime === 0) return false;
        
        const valueDiff = Math.abs(newAvgValue - tAvgValue) / Math.max(newAvgValue, tAvgValue);
        const timeDiff = Math.abs(newTotalTime - tTotalTime) / Math.max(newTotalTime, tTotalTime);
        
        // Similar if value difference < 10% and time difference < 20%
        return valueDiff < 0.10 && timeDiff < 0.20;
      });
      
      let savedTrainingId = null;

      if (existing) {
        // Update existing training
        await updateTraining(existing._id, trainingData);
        savedTrainingId = existing._id;
        if (similarTrainings.length > 0) {
          alert(`Training updated successfully! Found ${similarTrainings.length} similar training(s) with similar power/pace and duration.`);
        } else {
        alert('Training updated successfully!');
        }
      } else {
        // Create new training
        const resp = await addTraining(trainingData);
        savedTrainingId = resp?.data?._id || null;
        if (similarTrainings.length > 0) {
          const similarList = similarTrainings.map(t => 
            `${t.title} (${new Date(t.date).toLocaleDateString('cs-CZ')})`
          ).join(', ');
          alert(`Training created successfully! Found ${similarTrainings.length} similar training(s): ${similarList}`);
        } else {
        alert('Training created successfully!');
        }
      }
      
      // Notify other components (e.g. LactateStatistics) that training data changed
      window.dispatchEvent(new Event('trainingAdded'));

      // Reload regular trainings to update calendar
      await loadRegularTrainings();

      // Auto-select the saved training so user sees it with lactate values
      if (savedTrainingId) {
        const stravaLink = formData?.sourceStravaActivityId;
        if (stravaLink) {
          // Training is linked to a Strava activity → reload Strava detail (which will merge lactate)
          loadStravaDetail(stravaLink);
          navigate(`/training-calendar/${encodeURIComponent(`strava-${stravaLink}`)}`);
        } else {
          loadRegularTrainingDetail(savedTrainingId);
          navigate(`/training-calendar/${encodeURIComponent(`regular-${savedTrainingId}`)}`);
        }
      }
      
      setShowTrainingForm(false);
      setTrainingFormData(null);
    } catch (error) {
      console.error('Error saving training:', error);
      alert('Error saving training: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsExporting(false);
    }
  };

  // Calendar "Add Lactate" handlers
  const handleCalendarAddLactate = useCallback(async (activity, lapIndex = null) => {
    // Extract Strava numeric ID from calendar activity (id is "strava-<numericId>")
    const rawId = String(activity.id || activity.stravaId || '');
    const stravaNumericId = rawId.replace(/^strava-/i, '');
    if (!stravaNumericId) {
      setCalendarLactateError('Lactate entry is only available for Strava activities.');
      return;
    }
    setCalendarLactateError(null);
    setCalendarLactateLoading(true);
    try {
      const integAthleteId = selectedAthleteId && user && String(selectedAthleteId) !== String(user._id)
        ? String(selectedAthleteId)
        : null;
      // Load full Strava activity detail (same as clicking it in the calendar)
      const data = await getStravaActivityDetail(stravaNumericId, integAthleteId);
      const stravaActivity = {
        ...data.detail,
        id: data.detail?.id || data.detail?.stravaId || stravaNumericId,
        stravaId: data.detail?.stravaId || stravaNumericId,
        titleManual: data.titleManual,
        description: data.description,
        category: data.category || null,
        laps: data.laps || [],
      };
      if (!stravaActivity.laps || stravaActivity.laps.length === 0) {
        setCalendarLactateError('No intervals found for this activity.');
        return;
      }
      // Open the same full export form, optionally scroll to a specific lap
      performExportToTraining('auto', stravaActivity);
      if (lapIndex != null) {
        setTrainingFormData(prev => prev ? { ...prev, _initialSelectedLap: lapIndex + 1 } : prev);
      }
    } catch (err) {
      setCalendarLactateError(
        err.response?.data?.message || err.response?.data?.error || err.message || 'Could not open form'
      );
    } finally {
      setCalendarLactateLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- performExportToTraining is intentionally not memoized
  }, [selectedAthleteId, user]);

  // Open TrainingForm for lightweight editing (title + session lactate/RPE) from calendar modal
  const handleCalendarEditActivity = useCallback((activity) => {
    const rawSport = (activity.sport || activity.type || 'bike').toLowerCase().replace(/^strava$/, 'bike');
    const sport = rawSport.includes('run') ? 'run' : rawSport.includes('swim') ? 'swim' : rawSport.includes('ride') || rawSport.includes('cycle') || rawSport.includes('bike') || rawSport.includes('virtual') ? 'bike' : rawSport;
    const rawId = String(activity.id || activity._id || '');
    const isStrava = rawId.startsWith('strava-');
    const dbId = !isStrava && rawId && !rawId.startsWith('strava-') ? rawId : (activity._id || undefined);
    const initData = {
      ...(dbId ? { _id: dbId } : {}),
      title: activity.titleManual || activity.title || activity.name || '',
      date: activity.date ? String(activity.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
      sport,
      description: activity.description || '',
      rpe: activity.rpe != null ? String(activity.rpe) : '',
      lactate: activity.lactate != null ? String(activity.lactate) : '',
      results: Array.isArray(activity.results) ? activity.results : [],
      steps: [],
    };
    setManualFormInitialData(initData);
    setManualFormError(null);
    setShowManualForm(true);
  }, []);

  // Open TrainingForm for lactate entry from FIT training LapsTable
  const handleFitOpenLactateForm = useCallback((lapIndex) => {
    if (!selectedTraining || !selectedTraining.laps?.length) return;
    const sport = (selectedTraining.sport || selectedTraining.sportType || selectedTraining.sport_type || 'bike').toLowerCase();
    const sportKey = sport.includes('run') ? 'run' : sport.includes('swim') ? 'swim' : 'bike';
    const isRun = sportKey === 'run';
    const isSwim = sportKey === 'swim';

    if (selectedTraining.laps[0]) {
      console.log('[FitLactate] first lap keys:', Object.keys(selectedTraining.laps[0]));
      console.log('[FitLactate] first lap speed fields:', {
        avgSpeed: selectedTraining.laps[0].avgSpeed,
        average_speed: selectedTraining.laps[0].average_speed,
        avg_speed: selectedTraining.laps[0].avg_speed,
        enhancedAvgSpeed: selectedTraining.laps[0].enhancedAvgSpeed,
        enhanced_avg_speed: selectedTraining.laps[0].enhanced_avg_speed,
        speed: selectedTraining.laps[0].speed,
        distance: selectedTraining.laps[0].distance,
        moving_time: selectedTraining.laps[0].moving_time,
      });
    }

    const results = (Array.isArray(selectedTraining.results) && selectedTraining.results.length > 0)
      ? selectedTraining.results
      : selectedTraining.laps.map((lap, idx) => {
      const duration = lap.moving_time ?? lap.totalTimerTime ?? lap.totalElapsedTime ?? lap.elapsed_time ?? 0;
      const distance = Number(lap.distance ?? lap.totalDistance ?? lap.distanceMeters ?? 0);
      const rawSpeed = lap.avgSpeed ?? lap.average_speed ?? lap.avg_speed ?? lap.enhancedAvgSpeed ?? lap.enhanced_avg_speed ?? lap.speed ?? 0;
      const effectiveSpeed = rawSpeed > 0.05 ? rawSpeed : (distance > 0 && duration > 0 ? distance / duration : 0);
      const power = lap.avgPower ?? lap.avg_power ?? lap.average_watts ?? null;
      const hr = lap.average_heartrate ?? lap.avgHeartRate ?? lap.avg_heart_rate ?? null;
      const lactate = lap.lactate ?? null;

      let powerValue = '';
      if (isRun || isSwim) {
        if (effectiveSpeed > 0.05) {
          const paceSeconds = isRun ? Math.round(1000 / effectiveSpeed) : Math.round(100 / effectiveSpeed);
          powerValue = `${Math.floor(paceSeconds / 60).toString().padStart(2, '0')}:${(paceSeconds % 60).toString().padStart(2, '0')}`;
        }
      } else {
        powerValue = power ? power.toString() : '';
      }

      const mins = Math.floor(duration / 60);
      const secs = Math.round(duration % 60);
      const durationStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

      return {
        interval: idx + 1,
        power: powerValue,
        heartRate: hr ? hr.toString() : '',
        lactate: lactate ? lactate.toString() : '',
        RPE: '',
        elevation: '',
        duration: durationStr,
        durationSeconds: duration,
        durationType: 'time',
        distanceMeters: distance > 0 ? Math.round(distance) : undefined,
        repeatCount: 1,
        isRecovery: lap.isRecovery || false,
        isSelected: lap.isSelected !== false,
        intervalType: lap.intervalType || undefined,
      };
    });

    const date = selectedTraining.timestamp || selectedTraining.date || selectedTraining.startDate || new Date().toISOString();
    const formData = {
      _id: selectedTraining._id,
      sport: sportKey,
      type: 'interval',
      category: selectedTraining.category || '',
      title: selectedTraining.titleManual || selectedTraining.titleAuto || '',
      description: selectedTraining.description || '',
      date: (() => { const d = new Date(date); return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 16); })(),
      results,
    };
    setTrainingFormData({ ...formData, _initialSelectedLap: lapIndex != null ? lapIndex + 1 : null });
    setShowTrainingForm(true);
  }, [selectedTraining]);

  // ── Manual add / edit training ─────────────────────────────────────────────
  const handleOpenAddTraining = () => {
    setManualFormInitialData(null);
    setManualFormError(null);
    setShowManualForm(true);
  };

  const handleOpenEditTraining = () => {
    if (!selectedTraining) return;
    // Pass the raw training data; TrainingForm normalises sport/date internally
    const initData = {
      ...selectedTraining,
      // Resolve the MongoDB _id (may be on _id or via localStorage for regular trainings)
      _id: selectedTraining._id || localStorage.getItem('fitAnalysis_selectedRegularTrainingId') || localStorage.getItem('fitAnalysis_selectedTrainingModelId'),
      title: selectedTraining.titleManual || selectedTraining.title || selectedTraining.titleAuto || '',
      date: (() => {
        const d = new Date(selectedTraining.timestamp || selectedTraining.date || Date.now());
        return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 16);
      })(),
      results: Array.isArray(selectedTraining.results) ? selectedTraining.results : [],
    };
    setManualFormInitialData(initData);
    setManualFormError(null);
    setShowManualForm(true);
  };

  const handleManualFormSubmit = async (formData) => {
    try {
      setManualFormSubmitting(true);
      setManualFormError(null);
      const athleteId = selectedAthleteId || user._id;
      const payload = { ...formData, athleteId };
      if (formData._id) {
        await updateTraining(formData._id, payload);
      } else {
        await addTraining(payload);
      }
      setShowManualForm(false);
      setManualFormInitialData(null);
      // Reload trainings so the calendar reflects the change
      await loadTrainings();
      // If we were editing, refresh the detail view
      if (formData._id && selectedTraining) {
        await loadRegularTrainingDetail(formData._id);
      }
    } catch (err) {
      setManualFormError(err.response?.data?.error || err.message || 'Save failed');
    } finally {
      setManualFormSubmitting(false);
    }
  };


  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className={`${isMobile ? 'min-h-full flex flex-col p-0' : 'min-h-screen px-2 sm:px-4 py-4 md:p-6'}`}>
      <UpgradeModal {...UpgradeModalProps} />
      {showAutoClassify && (
        <AutoClassifyModal
          onClose={() => setShowAutoClassify(false)}
          onApplied={() => { loadExternalActivities(); }}
        />
      )}
      {/* Workout plan modal — portal to body, opens when clicking a day or a planned card */}
      {planModal && (
        <WorkoutPlanModal
          date={planModal.date}
          workout={planModal.workout}
          context={planContext}
          templates={planTemplates}
          onSave={handlePlanSave}
          onDelete={handlePlanDelete}
          onClose={() => setPlanModal(null)}
          onAddDayTheme={(iso, preset) => { setPlanModal(null); setQuickTheme({ date: iso, preset: preset || null }); }}
          onAddPeriod={(iso) => { setPlanModal(null); setQuickPeriod({ defaultDate: iso }); }}
        />
      )}
      {quickTheme && (
        <DayPlanEditSheet
          date={quickTheme.date}
          plan={dayPlans.find(p => p.date === quickTheme.date) || (quickTheme.preset ? { title: quickTheme.preset } : undefined)}
          onClose={() => setQuickTheme(null)}
          onSave={async (payload, dates) => {
            const list = Array.isArray(dates) && dates.length ? dates : [quickTheme.date];
            for (const d of list) { await handleDayPlanSave(d, payload); }
            setQuickTheme(null);
          }}
          onDelete={async () => { await handleDayPlanDelete(quickTheme.date); setQuickTheme(null); }}
        />
      )}
      {quickPeriod && (
        <PeriodEditSheet
          defaultDate={quickPeriod.defaultDate}
          onClose={() => setQuickPeriod(null)}
          onSave={async (payload) => { await handlePeriodSave(payload); setQuickPeriod(null); }}
          onDelete={null}
        />
      )}
      {/* Planned vs Actual comparison modal — opens for completed workouts with executionData */}
      {compareModal && (
        <WorkoutCompareModal
          pw={compareModal}
          onClose={() => setCompareModal(null)}
        />
      )}
      <div className={isMobile ? 'w-full flex flex-col flex-1 min-h-0' : 'max-w-[1600px] mx-auto'}>
        {!isMobile && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }} className="flex items-center justify-between mb-4 md:mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Training Calendar</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAutoClassify(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-all shadow-sm"
                title="Auto-categorize activities"
              >
                <SparklesIcon className="w-4 h-4 text-primary" />
                Auto-categorize
              </button>
              <button
                onClick={() => navigate('/workout-planner')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-primary/30 text-primary text-sm font-semibold rounded-xl hover:bg-primary/5 transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                Plan workout
              </button>
              <button
                onClick={handleOpenAddTraining}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add Training
              </button>
            </div>
          </motion.div>
        )}
        {isMobile && !(selectedTraining || selectedStrava) && (
          <div className="flex-shrink-0 px-4 pt-4 pb-2 flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Training Calendar</h1>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowAutoClassify(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-all shadow-sm"
                title="Auto-categorize activities"
              >
                <SparklesIcon className="w-3.5 h-3.5 text-primary" />
              </button>
              <button
                onClick={() => navigate('/workout-planner')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-primary/30 text-primary text-xs font-semibold rounded-lg hover:bg-primary/5 transition-all shadow-sm"
                title="Plan workout"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </button>
              <button
                onClick={handleOpenAddTraining}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-all shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add
              </button>
            </div>
          </div>
        )}

        {/* Athlete selection is handled globally by CoachAthleteBar in Layout */}
        {user?.role === 'coach' &&
          selectedAthleteId &&
          String(selectedAthleteId) !== String(user?._id || '') &&
          pendingAthleteIds.includes(String(selectedAthleteId)) && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This athlete is waiting for invitation confirmation. Training history and integrations will be available after acceptance.
            </div>
          )}

        {/* Calendar Section - hidden on mobile when training detail is open */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }} className={`${isMobile && (selectedTraining || selectedStrava) ? 'hidden' : ''} ${isMobile ? 'flex-1 min-h-0' : ''}`}>
        {externalActivitiesLoading && calendarMergedActivities.length === 0 && (
          <div className="mb-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm" aria-busy="true">
            <div className="mb-4 flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
              <Skeleton className="h-9 w-24 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {Array.from({ length: 7 }).map((_, idx) => (
                <div key={idx} className="rounded-xl border border-gray-100 p-3">
                  <Skeleton className="mb-3 h-3 w-14" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ))}
            </div>
          </div>
        )}
        {externalActivitiesError && calendarMergedActivities.length === 0 && (
          <div className="mb-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span>{externalActivitiesError}</span>
            </div>
            <button
              type="button"
              onClick={() => loadExternalActivities(selectedAthleteId || user?._id || null)}
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              Retry
            </button>
          </div>
        )}
        {!externalActivitiesLoading && !externalActivitiesError && calendarMergedActivities.length === 0 && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="font-semibold">No calendar activities loaded yet</div>
              <div className="text-xs mt-0.5">
                {stravaConnected
                  ? 'Strava is connected. Try refreshing activities if a new upload is missing.'
                  : 'Connect Strava or upload a FIT file to populate the analysis calendar.'}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => loadExternalActivities(selectedAthleteId || user?._id || null)}
                className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                Refresh
              </button>
              {!stravaConnected && (
                <button
                  type="button"
                  onClick={() => navigate('/settings?tab=integrations')}
                  className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700"
                >
                  Connect Strava
                </button>
              )}
            </div>
          </div>
        )}
        <CalendarView
          activities={calendarMergedActivities}
          selectedActivityId={
            (selectedTraining
              ? (selectedTraining?.isFromTrainingModel
                  ? `training-${selectedTraining?._id}`
                  : (selectedTraining?.isRegularTraining
                      ? `regular-${selectedTraining?._id}`
                      : `fit-${selectedTraining?._id}`))
              : null) ||
            (selectedTraining?.isFromTrainingModel ? `training-${localStorage.getItem('fitAnalysis_selectedTrainingModelId')}` : null) ||
            (selectedTraining?.isRegularTraining ? `regular-${localStorage.getItem('fitAnalysis_selectedRegularTrainingId')}` : null) ||
            (localStorage.getItem('fitAnalysis_selectedTrainingId') ? `fit-${localStorage.getItem('fitAnalysis_selectedTrainingId')}` : null) ||
            (selectedStrava ? `strava-${selectedStrava.id || selectedStrava.stravaId}` : null) ||
            (localStorage.getItem('fitAnalysis_selectedStravaId') ? `strava-${localStorage.getItem('fitAnalysis_selectedStravaId')}` : null)
          }
          // When the page is opened via a deep-link path (notification tap,
          // shared URL) auto-open the matching ActivityFullModal so the user
          // sees the same modal as when they tap a training in the calendar
          // — instead of just highlighting the row in the side panel.
          autoOpenSelectedActivity={!!activityId}
          initialAnchorDate={selectedTraining?.timestamp ? new Date(selectedTraining.timestamp) : null}
          onSelectActivity={handleCalendarActivitySelect}
          onAddLactate={handleCalendarAddLactate}
          onEditActivity={handleCalendarEditActivity}
          onMonthChange={handleCalendarMonthChange}
          onVisiblePeriodChange={handleCalendarPeriodChange}
          user={user}
          commentCounts={commentCounts}
          plannedWorkouts={plannedWorkoutsCalendar}
          dayPlans={dayPlans}
          onDayPlanSave={handleDayPlanSave}
          onDayPlanDelete={handleDayPlanDelete}
          periods={periods}
          onPeriodSave={handlePeriodSave}
          onPeriodDelete={handlePeriodDelete}
          onActivityUpdate={(updated) => {
            setExternalActivities(prev => prev.map(a => {
              const aId = String(a.stravaId || a.id || a._id || '');
              const uId = String(updated.stravaId || updated.id || updated._id || '');
              if (aId && aId === uId) return { ...a, titleManual: updated.titleManual, name: updated.title, title: updated.title };
              return a;
            }));
          }}
          onActivityDeleted={({ type, id }) => {
            if (type !== 'strava') return;
            setExternalActivities(prev => prev.filter(a => {
              const matchId = String(a.id || '').replace(/^strava-/, '') === String(id);
              const matchSid = String(a.stravaId || '') === String(id);
              return !(a.type === 'strava' && (matchId || matchSid));
            }));
          }}
          onSelectPlannedWorkout={(pw) => {
            if (!isPremium) { gate('Workout Planning', 'pro'); return; }
            if (pw.status === 'completed' && pw.executionData) {
              setCompareModal(pw);
            } else {
              // pw.date may already be a full ISO datetime string ("2026-05-04T00:00:00.000Z")
              // or a date-only "YYYY-MM-DD". Normalise to date-only first, then add noon time
              // so the Date parses to a local-noon Date object regardless of timezone.
              const dateOnly = String(pw.date || '').slice(0, 10);
              const d = dateOnly ? new Date(`${dateOnly}T12:00:00`) : new Date();
              setPlanModal({ date: isNaN(d.getTime()) ? new Date() : d, workout: pw });
            }
          }}
          onStartWorkout={(pw) => navigate(`/workout-execution/${pw._id}${selectedAthleteId ? `?athleteId=${selectedAthleteId}` : ''}`)}
          onPlanWorkout={(date) => setPlanModal({ date, workout: null })}
          onMovePlannedWorkout={handleMovePlannedWorkout}
          onCopyPlannedWorkout={handleCopyPlannedWorkout}
          onDeletePlannedWorkout={handlePlanDelete}
          onOpenActivity={handleCalendarActivitySelect}
          onPlannedSaved={(saved) => setPlannedWorkoutsCalendar(prev => upsertPlannedWorkoutList(prev, saved))}
          onCompletedSaved={(detail) => {
            if (!detail?.id) return;
            const matches = buildActivityMatcher(detail.id);
            const patch = metricsPatchFromDetail(detail);
            if (!Object.keys(patch).length) return;
            setTrainings((prev) => prev.map((t) => (matches(t) ? { ...t, ...patch } : t)));
            setRegularTrainings((prev) => prev.map((t) => (matches(t) ? { ...t, ...patch } : t)));
            setExternalActivities((prev) => prev.map((t) => (matches(t) ? { ...t, ...patch } : t)));
          }}
          athleteId={selectedAthleteId || null}
          mobileChartsContent={calendarPeriod ? (
            <CalendarPeriodStats
              activities={calendarMergedActivities}
              period={calendarPeriod}
              user={user}
              userProfile={userProfile}
              isMobile={true}
              onSelectActivity={handleCalendarActivitySelect}
              athleteId={selectedAthleteId || user?._id || null}
            />
          ) : null}
        />
        </motion.div>

        {!isMobile && !selectedTraining && !selectedStrava && !detailLoading && calendarPeriod && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
            <CalendarPeriodStats
              activities={calendarMergedActivities}
              period={calendarPeriod}
              user={user}
              userProfile={userProfile}
              isMobile={false}
              onSelectActivity={handleCalendarActivitySelect}
              athleteId={selectedAthleteId || user?._id || null}
            />
          </motion.div>
        )}

        {/* Training Detail and Charts - Full Width */}
        {(detailLoading && !selectedTraining && !selectedStrava) && (
          <div className="w-full mt-4">
            <SkeletonCard lines={5} />
          </div>
        )}
        {selectedTraining && (
          <motion.div
            ref={detailSectionRef}
            initial={isMobile ? { y: '100%', opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className={`w-full ${isMobile ? 'mt-0' : 'mt-4 md:mt-6'}`}>
            {/* Back button bar — sticky on mobile */}
            {isMobile ? (
              <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-3 py-2.5 flex items-center justify-between gap-2 shadow-sm">
                <button
                  type="button"
                  onClick={handleCloseTrainingDetail}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-600 active:text-primary transition-colors touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                  <span>Calendar</span>
                </button>
                {selectedTraining.isRegularTraining && (
                  <button
                    type="button"
                    onClick={handleOpenEditTraining}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-primary border border-primary/30 bg-primary/5 rounded-lg active:bg-primary/10 touch-manipulation"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Edit
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 mb-4">
                <button
                  type="button"
                  onClick={handleCloseTrainingDetail}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm transition-colors"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                  Back to Calendar
                </button>
                <div className="flex items-center gap-2">
                  {selectedTraining.isRegularTraining && (
                    <button
                      type="button"
                      onClick={handleOpenEditTraining}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 shadow-sm transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      Edit Training
                    </button>
                  )}
                </div>
              </div>
            )}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, type: 'spring', stiffness: 280, damping: 25 }}
                  className={`bg-white ${isMobile ? 'rounded-none border-0' : 'rounded-2xl border border-gray-200 shadow-sm'} ${isMobile ? 'p-4' : 'p-5 md:p-8'} ${isMobile ? 'space-y-4' : 'space-y-5 md:space-y-8'}`}
                >
                  {/* Header Stats */}
              <TrainingStats
                training={selectedTraining}
                onDelete={handleDeleteTraining}
                onUpdate={async (id) => {
                  await loadTrainingDetail(id);
                  await loadTrainings();
                }}
                user={user}
                isMobile={isMobile}
              />

                  {/* Training Comments — right below stats */}
                  <TrainingComments
                    trainingId={selectedTraining?.isFromTrainingModel
                      ? (localStorage.getItem('fitAnalysis_selectedTrainingModelId') || String(selectedTraining._id))
                      : String(selectedTraining._id)}
                    trainingType={selectedTraining?.isRegularTraining ? 'training' : 'fitTraining'}
                    isMobile={isMobile}
                  />

                  {/* Route Map for FIT/regular training when GPS is available */}
                  {getGpsData.length > 0 && (
                    <div className={`${isMobile ? '-mx-4' : ''}`}>
                      <div className={`relative overflow-hidden ${isMobile ? '' : 'rounded-2xl'} ${isMobile ? 'h-[220px]' : 'h-[320px] md:h-[400px]'}`}>
                        <MapContainer
                          key={`fit-map-${getGpsData[0]?.[0]}-${getGpsData[0]?.[1]}`}
                          center={getGpsData[Math.floor(getGpsData.length / 2)]}
                          zoom={13}
                          style={{ height: '100%', width: '100%', zIndex: 0 }}
                          scrollWheelZoom={true}
                          zoomControl={false}
                          attributionControl={false}
                        >
                          <MapInvalidator positions={getGpsData} />
                          <TileLayer
                            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                          />
                          <Polyline
                            positions={getGpsData}
                            pathOptions={{ color: '#6366f1', weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
                          />
                          <CircleMarker
                            center={getGpsData[0]}
                            radius={7}
                            pathOptions={{ color: '#fff', weight: 2.5, fillColor: '#22c55e', fillOpacity: 1 }}
                          >
                            <Tooltip permanent direction="top" offset={[0, -10]} className="leaflet-tooltip-clean">Start</Tooltip>
                          </CircleMarker>
                          <CircleMarker
                            center={getGpsData[getGpsData.length - 1]}
                            radius={7}
                            pathOptions={{ color: '#fff', weight: 2.5, fillColor: '#ef4444', fillOpacity: 1 }}
                          >
                            <Tooltip permanent direction="top" offset={[0, -10]} className="leaflet-tooltip-clean">Finish</Tooltip>
                          </CircleMarker>
                        </MapContainer>
                        {/* subtle vignette */}
                        <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_30px_rgba(0,0,0,0.06)]" />
                      </div>
                    </div>
                  )}

                  {highlightMetric && (
                    <div className="mb-3 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50/70 px-4 py-2 text-sm text-indigo-800">
                      <span>
                        <span className="font-semibold">From Power Radar</span>
                        {radarWatts > 0 && (
                          <span className="ml-2">
                            — Best {highlightMetric === 'sprint5s' ? '5s' : highlightMetric === 'attack1min' ? '1min' : highlightMetric === 'vo2max5min' ? '5min' : highlightMetric === 'threshold20min' ? '20min' : '60min'}: <span className="font-bold">{radarWatts} W</span>
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => {
                          setHighlightMetric(null);
                          setRadarWatts(null);
                          const url = new URL(window.location);
                          url.searchParams.delete('highlightMetric');
                          url.searchParams.delete('radarWatts');
                          window.history.replaceState({}, '', url.toString());
                        }}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-900 underline underline-offset-2"
                      >
                        Clear highlight
                      </button>
                    </div>
                  )}

                  {/* Training Chart - Modern SVG Version */}
                  {selectedTraining && selectedTraining.records && selectedTraining.records.length > 0 && (
                    <div className={`${isMobile ? 'mb-2' : 'mb-4 md:mb-6'}`}>
                      {/* Statistics - hidden on mobile (already shown in TrainingStats above) */}
                      <h3 className={`${isMobile ? 'text-sm' : 'text-base font-semibold'} font-semibold text-gray-800 ${isMobile ? 'mb-2' : 'mb-3'}`}>Training Overview</h3>
                      <div className={`${isMobile ? '-mx-4' : ''}`}>
                        <TrainingChart
                          training={selectedTraining}
                          userProfile={userProfile}
                          onHover={(point) => {
                            // Optional: handle hover events
                          }}
                          onLeave={() => {
                            // Optional: handle leave events
                          }}
                          user={user}
                          highlightMetric={highlightMetric}
                          radarWatts={radarWatts}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Legacy Training Chart - Full Time SVG Version (commented out, can be removed) */}
                  {false && selectedTraining && selectedTraining.records && selectedTraining.records.length > 0 && (() => {
                    const chartData = prepareTrainingChartData(selectedTraining);
                    if (!chartData) return null;

                    const chartHeight = 300;
                    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
                    const svgWidth = 800;
                    const svgHeight = chartHeight;
                    const graphWidth = svgWidth - padding.left - padding.right;
                    const graphHeight = svgHeight - padding.top - padding.bottom;

                    // Scale functions
                    const speedYScale = (speed) => padding.top + graphHeight - ((speed / chartData.maxSpeed) * graphHeight);
                    const hrYScale = (hr) => padding.top + graphHeight - ((hr / chartData.maxHeartRate) * graphHeight);
                    const powerYScale = (power) => padding.top + graphHeight - ((power / chartData.maxPower) * graphHeight);

                    // Sample data for performance (show every Nth point for long trainings)
                    const sampleRate = chartData.records.length > 5000 ? 10 : chartData.records.length > 2000 ? 5 : 1;
                    const sampledRecords = chartData.records.filter((_, i) => i % sampleRate === 0 || i === chartData.records.length - 1);

                    // Zoom calculations
                    const zoomedMinTime = chartData.maxTime * trainingZoom.min;
                    const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
                    const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
                    const zoomedXScale = (time) => {
                      if (time < zoomedMinTime || time > zoomedMaxTime) return null;
                      const normalizedTime = (time - zoomedMinTime) / zoomedTimeRange;
                      return padding.left + normalizedTime * graphWidth;
                    };

                    const handleTrainingChartHover = (record, event) => {
                      if (isDragging) return; // Don't show tooltip while dragging
                      
                      setHoveredTrainingRecord(record);
                      
                      const container = trainingChartRef.current;
                      if (!container) return;
                      
                      // Calculate X position based on record time
                      const x = zoomedXScale(record.timeFromStart);
                      if (x === null) return;
                      
                      // Calculate Y position - average of all visible metrics at this point
                      let avgY = 0;
                      let count = 0;
                      
                      if (record.speed) {
                        avgY += speedYScale(record.speed);
                        count++;
                      }
                      if (record.heartRate) {
                        avgY += hrYScale(record.heartRate);
                        count++;
                      }
                      if (record.power) {
                        avgY += powerYScale(record.power);
                        count++;
                      }
                      
                      const tooltipY = count > 0 ? avgY / count : padding.top + graphHeight / 2;
                      
                      // Get SVG element to calculate scale
                      const svgElement = container.querySelector('svg');
                      if (!svgElement) return;
                      const svgRect = svgElement.getBoundingClientRect();
                      const scaleX = svgRect.width / svgWidth;
                      const scaleY = svgRect.height / svgHeight;
                      
                      // Calculate position relative to container
                      const svgX = x * scaleX;
                      const svgY = tooltipY * scaleY;
                      
                      setTrainingTooltipPosition({
                        x: svgX,
                        y: svgY - 10 // Offset above the point
                      });
                    };

                    const handleTrainingChartLeave = () => {
                      if (!isDragging) {
                        setHoveredTrainingRecord(null);
                      }
                    };

                    const handleResetZoom = () => {
                      setTrainingZoom({ min: 0, max: 1, scale: 1 });
                      setIsDragging(false);
                      setDragStart({ x: 0, time: 0 });
                      setDragEnd({ x: 0, time: 0 });
                      setShowCreateLapButton(false);
                      setSelectedTimeRange({ start: 0, end: 0 });
                      setSelectionStats(null);
                    };

                    const calculateSelectionStats = (startTime, endTime) => {
                      if (!selectedTraining?.records || selectedTraining.records.length === 0) return null;
                      
                      const trainingStartTime = selectedTraining.records[0]?.timestamp 
                        ? new Date(selectedTraining.records[0].timestamp).getTime() 
                        : selectedTraining.timestamp 
                          ? new Date(selectedTraining.timestamp).getTime() 
                          : Date.now();
                      
                      // Find records in the selected time range
                      const selectedRecords = selectedTraining.records.filter(record => {
                        if (!record.timestamp) return false;
                        const recordTime = new Date(record.timestamp).getTime();
                        const timeFromStart = (recordTime - trainingStartTime) / 1000;
                        return timeFromStart >= startTime && timeFromStart <= endTime;
                      });
                      
                      if (selectedRecords.length === 0) return null;
                      
                      // Calculate statistics
                      // Notes:
                      // - For some inputs (run/swim) speed can be stored under different keys or be null.
                      // - Units can be m/s or already km/h depending on source (FIT vs Strava conversion).
                      const rawSpeeds = selectedRecords
                        .map(r => {
                          const v = r?.speed ?? r?.avgSpeed ?? r?.average_speed ?? r?.averageSpeed ?? null;
                          const n = Number(v);
                          return Number.isFinite(n) && n > 0 ? n : null;
                        })
                        .filter((v) => v !== null);

                      const speeds = rawSpeeds;
                      const heartRates = selectedRecords.map(r => r.heartRate).filter(v => v && v > 0);
                      const powers = selectedRecords.map(r => r.power).filter(v => v && v > 0);
                      const cadences = selectedRecords.map(r => r.cadence).filter(v => v && v > 0);
                      
                      const avgSpeedRaw = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
                      const maxSpeedRaw = speeds.length > 0 ? Math.max(...speeds) : null;

                      // Heuristic unit detection:
                      // - m/s rarely exceeds ~10 in real data; km/h commonly exceeds 20.
                      const isKmH = Number.isFinite(maxSpeedRaw) ? maxSpeedRaw > 20 : false;
                      const toKmH = (v) => (isKmH ? v : v * 3.6);

                      const avgSpeed = avgSpeedRaw != null ? toKmH(avgSpeedRaw) : null;
                      const maxSpeed = maxSpeedRaw != null ? toKmH(maxSpeedRaw) : null;
                      const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null;
                      const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : null;
                      const avgPower = powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null;
                      const maxPower = powers.length > 0 ? Math.max(...powers) : null;
                      const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : null;
                      
                      // Calculate distance
                      const firstRecord = selectedRecords[0];
                      const lastRecord = selectedRecords[selectedRecords.length - 1];
                      const totalDistance = lastRecord.distance && firstRecord.distance 
                        ? lastRecord.distance - firstRecord.distance 
                        : null;
                      
                      const duration = endTime - startTime;
                      
                      return {
                        duration,
                        totalDistance,
                        avgSpeed: avgSpeed != null ? avgSpeed.toFixed(1) : null, // km/h
                        maxSpeed: maxSpeed != null ? maxSpeed.toFixed(1) : null,
                        avgHeartRate,
                        maxHeartRate,
                        avgPower,
                        maxPower,
                        avgCadence
                      };
                    };

                    const handleCreateLap = async () => {
                      try {
                        const { start, end } = selectedTimeRange;
                        await createLap(selectedTraining._id, {
                          startTime: Math.min(start, end),
                          endTime: Math.max(start, end)
                        });
                        await loadTrainingDetail(selectedTraining._id);
                        setShowCreateLapButton(false);
                        setSelectedTimeRange({ start: 0, end: 0 });
                        setSelectionStats(null);
                      } catch (error) {
                        console.error('Error creating lap:', error);
                        alert('Error creating interval: ' + (error.response?.data?.error || error.message));
                      }
                    };

                    return (
                      <div className="mb-4 md:mb-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                          <h3 className="text-lg md:text-xl font-semibold text-gray-900">Training Overview</h3>
                          <div className="flex gap-2 items-center">
                            <button
                              onClick={handleResetZoom}
                              className="px-4 py-2 text-sm bg-primary text-white rounded-xl shadow-md transition-colors hover:bg-primary-dark"
                            >
                              Reset Zoom
                            </button>
                          </div>
                        </div>
                        {showCreateLapButton && selectionStats && (
                          <div className={`mb-4 bg-gradient-to-r from-primary/10 to-secondary/10 backdrop-blur-sm border-2 border-primary/30 rounded-2xl shadow-lg ${isMobile ? 'p-2.5' : 'p-4 md:p-6'}`}>
                            <div className="flex items-center justify-between mb-3 md:mb-4">
                              <h4 className="text-base md:text-lg font-semibold text-gray-900">Selected Interval Statistics</h4>
                              <button
                                onClick={() => {
                                  setShowCreateLapButton(false);
                                  setSelectedTimeRange({ start: 0, end: 0 });
                                  setSelectionStats(null);
                                }}
                                className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                            <div className={`grid ${isMobile ? 'grid-cols-3 gap-1.5' : 'grid-cols-2 md:grid-cols-4 gap-3 md:gap-4'}`}>
                              <div className={`bg-white/80 backdrop-blur-sm border border-primary/30 shadow-sm ${isMobile ? 'rounded-lg p-2' : 'rounded-xl p-3 md:p-4'}`}>
                                <div className={`text-gray-600 ${isMobile ? 'text-xs mb-0.5' : 'text-xs md:text-sm mb-1'}`}>Duration</div>
                                <div className={`font-bold text-primary ${isMobile ? 'text-xs' : 'text-base md:text-lg'}`}>{formatDuration(selectionStats.duration)}</div>
                              </div>
                              {selectionStats.totalDistance && (
                                <div className={`bg-white/80 backdrop-blur-sm border border-primary/30 shadow-sm ${isMobile ? 'rounded-lg p-2' : 'rounded-xl p-3 md:p-4'}`}>
                                  <div className={`text-gray-600 ${isMobile ? 'text-xs mb-0.5' : 'text-xs md:text-sm mb-1'}`}>Distance</div>
                                  <div className={`font-bold text-primary ${isMobile ? 'text-xs' : 'text-base md:text-lg'}`}>{formatDistance(selectionStats.totalDistance, user)}</div>
                                </div>
                              )}
                              {selectionStats.avgSpeed != null && (
                                <div className={`bg-white/80 backdrop-blur-sm border border-primary/30 shadow-sm ${isMobile ? 'rounded-lg p-2' : 'rounded-xl p-3 md:p-4'}`}>
                                  <div className={`text-gray-600 ${isMobile ? 'text-xs mb-0.5' : 'text-xs md:text-sm mb-1'}`}>Avg Speed</div>
                                  <div className={`font-bold text-primary ${isMobile ? 'text-xs' : 'text-base md:text-lg'}`}>{selectionStats.avgSpeed} km/h</div>
                                  {selectionStats.maxSpeed != null && (
                                    <div className={`text-gray-500 ${isMobile ? 'text-[11px] mt-0.5' : 'text-xs mt-1'}`}>Max: {selectionStats.maxSpeed} km/h</div>
                                  )}
                                </div>
                              )}
                              {selectionStats.avgHeartRate && (
                                <div className={`bg-white/80 backdrop-blur-sm border border-primary/30 shadow-sm ${isMobile ? 'rounded-lg p-2' : 'rounded-xl p-3 md:p-4'}`}>
                                  <div className={`text-gray-600 ${isMobile ? 'text-xs mb-0.5' : 'text-xs md:text-sm mb-1'}`}>Avg HR</div>
                                  <div className={`font-bold text-red-600 ${isMobile ? 'text-xs' : 'text-base md:text-lg'}`}>{selectionStats.avgHeartRate} bpm</div>
                                  {selectionStats.maxHeartRate && (
                                    <div className={`text-gray-500 ${isMobile ? 'text-[11px] mt-0.5' : 'text-xs mt-1'}`}>Max: {selectionStats.maxHeartRate} bpm</div>
                                  )}
                                </div>
                              )}
                              {selectionStats.avgPower && (
                                <div className={`bg-white/80 backdrop-blur-sm border border-primary/30 shadow-sm ${isMobile ? 'rounded-lg p-2' : 'rounded-xl p-3 md:p-4'}`}>
                                  <div className={`text-gray-600 ${isMobile ? 'text-xs mb-0.5' : 'text-xs md:text-sm mb-1'}`}>Avg Power</div>
                                  <div className={`font-bold text-primary-dark ${isMobile ? 'text-xs' : 'text-base md:text-lg'}`}>{selectionStats.avgPower} W</div>
                                  {selectionStats.maxPower && (
                                    <div className={`text-gray-500 ${isMobile ? 'text-[11px] mt-0.5' : 'text-xs mt-1'}`}>Max: {selectionStats.maxPower} W</div>
                                  )}
                                </div>
                              )}
                              {selectionStats.avgCadence && (
                                <div className={`bg-white/80 backdrop-blur-sm border border-primary/30 shadow-sm ${isMobile ? 'rounded-lg p-2' : 'rounded-xl p-3 md:p-4'}`}>
                                  <div className={`text-gray-600 ${isMobile ? 'text-xs mb-0.5' : 'text-xs md:text-sm mb-1'}`}>Avg Cadence</div>
                                  <div className={`font-bold text-greenos ${isMobile ? 'text-xs' : 'text-base md:text-lg'}`}>{selectionStats.avgCadence} rpm</div>
                                </div>
                              )}
                            </div>
                            <div className="mt-4 flex justify-end">
                              <button
                                onClick={handleCreateLap}
                                className="px-5 md:px-6 py-2 bg-primary text-white rounded-xl font-semibold shadow-md transition-colors flex items-center gap-2 hover:bg-primary-dark"
                              >
                                <span>✓</span> Create Interval
                              </button>
                            </div>
                          </div>
                        )}
                        {!showCreateLapButton && (
                          <div className="mb-2 text-xs md:text-sm text-gray-500 italic rounded-lg p-2 border border-primary/30 bg-primary/10">
                            💡 Tip: Click and drag to select an interval, or hold <kbd className="px-1.5 py-0.5 bg-white/80 rounded text-xs font-mono border border-gray-300">Shift</kbd> while dragging to zoom
                          </div>
                        )}
                        <div 
                          ref={trainingChartRef}
                          className="relative border border-white/40 rounded-2xl bg-white/70 backdrop-blur-sm p-3 md:p-4 select-none shadow-lg" 
                          style={{ height: `${chartHeight}px`, cursor: isDragging ? 'crosshair' : 'default' }}
                        >
                          {/* Drag selection rectangle */}
                          {isDragging && dragStart.x !== dragEnd.x && (
                            <>
                            <div
                              className="absolute border-2 border-primary bg-primary/20 pointer-events-none z-40"
                              style={{
                                left: `${Math.min(dragStart.x, dragEnd.x) + padding.left}px`,
                                top: `${padding.top}px`,
                                width: `${Math.abs(dragEnd.x - dragStart.x)}px`,
                                height: `${graphHeight}px`
                              }}
                            />
                              {/* Show hint text when dragging */}
                              <div
                                className="absolute pointer-events-none z-50 text-xs text-primary-dark bg-primary/30 px-2 py-1 rounded"
                                style={{
                                  left: `${(Math.min(dragStart.x, dragEnd.x) + Math.max(dragStart.x, dragEnd.x)) / 2 + padding.left}px`,
                                  top: `${padding.top + 5}px`,
                                  transform: 'translateX(-50%)'
                                }}
                              >
                                {(() => {
                                  const startTime = Math.min(dragStart.time, dragEnd.time);
                                  const endTime = Math.max(dragStart.time, dragEnd.time);
                                  const duration = endTime - startTime;
                                  return `${formatDuration(duration)} - Release to create interval`;
                                })()}
                              </div>
                            </>
                          )}
                          
                          {/* Invisible overlay div for drag selection - positioned above SVG */}
                          <div
                            className="absolute drag-overlay"
                            style={{
                              left: `${padding.left}px`,
                              top: `${padding.top}px`,
                              width: `${graphWidth}px`,
                              height: `${graphHeight}px`,
                              cursor: isDragging ? 'crosshair' : 'default',
                              zIndex: 10,
                              pointerEvents: 'auto'
                            }}
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.preventDefault();
                              e.stopPropagation();
                              
                              const container = trainingChartRef.current;
                              if (!container) return;
                              
                              const containerRect = container.getBoundingClientRect();
                              const clickX = e.clientX - containerRect.left;
                              
                              // Calculate start time using the same logic as in useEffect
                              const relativeX = clickX - padding.left;
                              const normalizedX = Math.max(0, Math.min(1, relativeX / graphWidth));
                              const zoomedMinTime = chartData.maxTime * trainingZoom.min;
                              const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
                              const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
                              const startTime = zoomedMinTime + (normalizedX * zoomedTimeRange);
                              
                              // Use the dragStateRef from component scope
                              dragStateRef.current.isActive = true;
                              dragStateRef.current.start = { x: clickX, time: startTime };
                              dragStateRef.current.end = { x: clickX, time: startTime };
                              
                              setIsDragging(true);
                              setDragStart({ x: clickX, time: startTime });
                              setDragEnd({ x: clickX, time: startTime });
                            }}
                            onMouseMove={(e) => {
                              if (!dragStateRef.current.isActive) return;
                              
                              const container = trainingChartRef.current;
                              if (!container) return;
                              
                              const containerRect = container.getBoundingClientRect();
                              const clickX = e.clientX - containerRect.left;
                              
                              // Calculate end time
                              const relativeX = clickX - padding.left;
                              const normalizedX = Math.max(0, Math.min(1, relativeX / graphWidth));
                              const zoomedMinTime = chartData.maxTime * trainingZoom.min;
                              const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
                              const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
                              const endTime = zoomedMinTime + (normalizedX * zoomedTimeRange);
                              
                              dragStateRef.current.end = { x: clickX, time: endTime };
                              setDragEnd({ x: clickX, time: endTime });
                            }}
                            onMouseUp={(e) => {
                              if (!dragStateRef.current.isActive) return;
                              
                              const startTime = Math.min(dragStateRef.current.start.time, dragStateRef.current.end.time);
                              const endTime = Math.max(dragStateRef.current.start.time, dragStateRef.current.end.time);
                              const timeRange = Math.abs(endTime - startTime);
                              
                              // If user wants to zoom (hold Shift), do zoom instead of showing create button
                              if (e.shiftKey && timeRange > chartData.maxTime * 0.01) {
                                // Zoom behavior when Shift is held
                                const newMin = startTime / chartData.maxTime;
                                const newMax = endTime / chartData.maxTime;
                                const newScale = 1 / (newMax - newMin);
                                
                                setTrainingZoom({
                                  min: newMin,
                                  max: newMax,
                                  scale: newScale
                                });
                              } else if (timeRange > chartData.maxTime * 0.01) {
                                // Show create interval button and stats (normal behavior)
                                setSelectedTimeRange({ start: startTime, end: endTime });
                                const stats = calculateSelectionStats(startTime, endTime);
                                setSelectionStats(stats);
                                setShowCreateLapButton(true);
                              }
                              
                              dragStateRef.current.isActive = false;
                              dragStateRef.current.start = { x: 0, time: 0 };
                              dragStateRef.current.end = { x: 0, time: 0 };
                              setIsDragging(false);
                              setDragStart({ x: 0, time: 0 });
                              setDragEnd({ x: 0, time: 0 });
                            }}
                            onMouseLeave={(e) => {
                              // Continue tracking mouse even when leaving overlay
                              if (dragStateRef.current.isActive) {
                                // Keep dragging active, mouseMoveGlobalHandler will handle it
                              }
                            }}
                          />
                          
                          <svg 
                            width="100%" 
                            height={svgHeight} 
                            viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
                            className="overflow-visible" 
                            style={{ cursor: isDragging ? 'crosshair' : 'default', pointerEvents: 'none', position: 'relative', zIndex: 1 }}
                          >
                            {/* Grid lines - based on zoom */}
                            {(() => {
                              const numGridLines = 5;
                              const gridValues = [];
                              for (let i = 0; i <= numGridLines; i++) {
                                const ratio = i / numGridLines;
                                const time = zoomedMinTime + (zoomedTimeRange * ratio);
                                gridValues.push({ time, x: zoomedXScale(time) });
                              }
                              return gridValues.map(({ time, x }, i) => {
                                if (x === null) return null;
                                return (
                                  <line
                                    key={`grid-x-${i}`}
                                    x1={x}
                                    y1={padding.top}
                                    x2={x}
                                    y2={padding.top + graphHeight}
                                    stroke="rgba(240, 240, 250, 0.8)"
                                    strokeWidth="1"
                                    strokeDasharray="2,2"
                                  />
                                );
                              });
                            })()}

                            {/* Interval Bars - Background bars showing intervals */}
                            {(() => {
                              if (!selectedTraining?.laps || selectedTraining.laps.length === 0) return null;
                              
                              // Deduplicate laps before processing
                              const uniqueLaps = deduplicateFitTrainingLaps(selectedTraining.laps);
                              if (uniqueLaps.length === 0) return null;
                              
                              // Get training start time from first record
                              const trainingStartTime = chartData.records[0]?.timestamp 
                                ? new Date(chartData.records[0].timestamp).getTime() 
                                : Date.now();
                              
                              // Calculate time positions for each lap
                              let cumulativeTime = 0;
                              const allIntervalBars = uniqueLaps.map((lap, index) => {
                                let startTime = cumulativeTime;
                                if (lap.startTime) {
                                  const lapStartTime = new Date(lap.startTime).getTime();
                                  startTime = (lapStartTime - trainingStartTime) / 1000;
                                }
                                
                                const duration = lap.totalElapsedTime || lap.totalTimerTime || 0;
                                const endTime = startTime + duration;
                                cumulativeTime = endTime;
                                
                                const power = lap.avgPower || lap.maxPower || 0;
                                
                                return {
                                  index,
                                  startTime,
                                  endTime,
                                  duration,
                                  power
                                };
                              });
                              
                              const intervalBars = allIntervalBars.filter(bar => bar.power > 0 && bar.duration > 0);
                              
                              if (intervalBars.length === 0) return null;
                              
                              const maxIntervalPower = intervalBars.length > 0 
                                ? Math.max(...intervalBars.map(b => b.power))
                                : chartData.maxPower || 100;
                              const effectiveMaxPower = chartData.maxPower > 0 ? chartData.maxPower : maxIntervalPower;
                              
                              return intervalBars.map((bar) => {
                                if (bar.endTime < zoomedMinTime || bar.startTime > zoomedMaxTime) return null;
                                
                                const xStart = zoomedXScale(Math.max(bar.startTime, zoomedMinTime));
                                const xEnd = zoomedXScale(Math.min(bar.endTime, zoomedMaxTime));
                                
                                if (xStart === null || xEnd === null) return null;
                                
                                const barX = xStart;
                                const barWidth = Math.max(2, xEnd - xStart);
                                
                                const barTop = effectiveMaxPower > 0 
                                  ? padding.top + graphHeight - ((bar.power / effectiveMaxPower) * graphHeight)
                                  : padding.top + graphHeight;
                                const barBottom = padding.top + graphHeight;
                                const barHeight = Math.max(2, barBottom - barTop);
                                
                                const powerRatio = effectiveMaxPower > 0 ? bar.power / effectiveMaxPower : 0;
                                const baseR = 200;
                                const baseG = 180;
                                const baseB = 255;
                                const r = Math.round(baseR - (powerRatio * 60));
                                const g = Math.round(baseG - (powerRatio * 100));
                                const b = Math.round(baseB - (powerRatio * 50));
                                
                                return (
                                  <rect
                                    key={`interval-bar-${bar.index}`}
                                    x={barX}
                                    y={barTop}
                                    width={barWidth}
                                    height={barHeight}
                                    fill={`rgba(${r}, ${g}, ${b}, 0.35)`}
                                    stroke={`rgba(${r}, ${g}, ${b}, 0.6)`}
                                    strokeWidth="1"
                                    rx="2"
                                    ry="2"
                                    style={{ pointerEvents: 'none' }}
                                  />
                                );
                              }).filter(bar => bar !== null);
                            })()}

                            {/* Speed line - lighter blue */}
                            {sampledRecords.map((record, index) => {
                              if (index === 0 || !record.speed) return null;
                              const prevRecord = sampledRecords[index - 1];
                              if (!prevRecord.speed) return null;
                              
                              // Check if within zoom range
                              if (record.timeFromStart < zoomedMinTime || record.timeFromStart > zoomedMaxTime) return null;
                              if (prevRecord.timeFromStart < zoomedMinTime || prevRecord.timeFromStart > zoomedMaxTime) return null;
                              
                              const x1 = zoomedXScale(prevRecord.timeFromStart);
                              const x2 = zoomedXScale(record.timeFromStart);
                              
                              if (x1 === null || x2 === null) return null;
                              
                              return (
                                <line
                                  key={`speed-${index}`}
                                  x1={x1}
                                  y1={speedYScale(prevRecord.speed)}
                                  x2={x2}
                                  y2={speedYScale(record.speed)}
                                  stroke="rgba(120, 180, 255, 0.7)"
                                  strokeWidth="1.5"
                                  onMouseEnter={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseMove={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseLeave={handleTrainingChartLeave}
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'none' }}
                                />
                              );
                            })}

                            {/* Heart Rate line - lighter red */}
                            {sampledRecords.map((record, index) => {
                              if (index === 0 || !record.heartRate) return null;
                              const prevRecord = sampledRecords[index - 1];
                              if (!prevRecord.heartRate) return null;
                              
                              if (record.timeFromStart < zoomedMinTime || record.timeFromStart > zoomedMaxTime) return null;
                              if (prevRecord.timeFromStart < zoomedMinTime || prevRecord.timeFromStart > zoomedMaxTime) return null;
                              
                              const x1 = zoomedXScale(prevRecord.timeFromStart);
                              const x2 = zoomedXScale(record.timeFromStart);
                              
                              if (x1 === null || x2 === null) return null;
                              
                              return (
                                <line
                                  key={`hr-${index}`}
                                  x1={x1}
                                  y1={hrYScale(prevRecord.heartRate)}
                                  x2={x2}
                                  y2={hrYScale(record.heartRate)}
                                  stroke="rgba(255, 120, 140, 0.7)"
                                  strokeWidth="1.5"
                                  onMouseEnter={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseMove={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseLeave={handleTrainingChartLeave}
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'none' }}
                                />
                              );
                            })}

                            {/* Power line - lighter orange/purple */}
                            {sampledRecords.map((record, index) => {
                              if (index === 0 || !record.power) return null;
                              const prevRecord = sampledRecords[index - 1];
                              if (!prevRecord.power) return null;
                              
                              if (record.timeFromStart < zoomedMinTime || record.timeFromStart > zoomedMaxTime) return null;
                              if (prevRecord.timeFromStart < zoomedMinTime || prevRecord.timeFromStart > zoomedMaxTime) return null;
                              
                              const x1 = zoomedXScale(prevRecord.timeFromStart);
                              const x2 = zoomedXScale(record.timeFromStart);
                              
                              if (x1 === null || x2 === null) return null;
                              
                              return (
                                <line
                                  key={`power-${index}`}
                                  x1={x1}
                                  y1={powerYScale(prevRecord.power)}
                                  x2={x2}
                                  y2={powerYScale(record.power)}
                                  stroke="rgba(200, 140, 220, 0.7)"
                                  strokeWidth="1.5"
                                  onMouseEnter={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseMove={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseLeave={handleTrainingChartLeave}
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'none' }}
                                />
                              );
                            })}

                            {/* Axis lines */}
                            <line
                              x1={padding.left}
                              y1={padding.top}
                              x2={padding.left}
                              y2={padding.top + graphHeight}
                              stroke="rgba(180, 160, 220, 0.6)"
                              strokeWidth="2"
                            />
                            <line
                              x1={padding.left}
                              y1={padding.top + graphHeight}
                              x2={padding.left + graphWidth}
                              y2={padding.top + graphHeight}
                              stroke="rgba(180, 160, 220, 0.6)"
                              strokeWidth="2"
                            />

                            {/* X-axis labels (Time) - based on zoom */}
                            {(() => {
                              const numLabels = 5;
                              const labels = [];
                              for (let i = 0; i <= numLabels; i++) {
                                const ratio = i / numLabels;
                                const time = zoomedMinTime + (zoomedTimeRange * ratio);
                                labels.push({ time, x: zoomedXScale(time) });
                              }
                              return labels.map(({ time, x }, i) => {
                                if (x === null) return null;
                                const totalSeconds = Math.floor(time);
                                const hours = Math.floor(totalSeconds / 3600);
                                const minutes = Math.floor((totalSeconds % 3600) / 60);
                                // Formát h:m (hodiny:minuty)
                                const timeStr = hours > 0 
                                  ? `${hours}:${minutes}`
                                  : `${minutes}`;
                                
                                return (
                                  <g key={`x-label-${i}`}>
                                    <line
                                      x1={x}
                                      y1={padding.top + graphHeight}
                                      x2={x}
                                      y2={padding.top + graphHeight + 5}
                                      stroke="rgba(200, 180, 220, 0.6)"
                                      strokeWidth="1"
                                    />
                                    <text
                                      x={x}
                                      y={padding.top + graphHeight + 20}
                                      textAnchor="middle"
                                      fontSize="11"
                                      fill="rgba(120, 90, 160, 0.8)"
                                      fontWeight="500"
                                    >
                                      {timeStr}
                                    </text>
                                  </g>
                                );
                              });
                            })()}


                            {/* Axis labels */}
                            <text
                              x={padding.left + graphWidth / 2}
                              y={svgHeight - 5}
                              textAnchor="middle"
                              fontSize="13"
                              fill="rgba(120, 90, 160, 0.9)"
                              fontWeight="600"
                            >
                              Time
                            </text>
                          </svg>
                          
                          {/* Training Chart Tooltip */}
                          {hoveredTrainingRecord && trainingTooltipPosition.x > 0 && trainingTooltipPosition.y > 0 && (
                            <div
                              className="absolute pointer-events-none z-50"
                              style={{
                                left: `${trainingTooltipPosition.x}px`,
                                top: `${trainingTooltipPosition.y}px`,
                                transform: 'translate(-50%, -100%)',
                                marginTop: '-10px',
                                minWidth: '200px',
                                maxWidth: '250px'
                              }}
                            >
                              <div
                                style={{
                                  background: 'rgba(255, 255, 255, 0.85)',
                                  backdropFilter: 'blur(10px) saturate(180%)',
                                  WebkitBackdropFilter: 'blur(10px) saturate(180%)',
                                  borderRadius: '12px',
                                  padding: '12px 16px',
                                  boxShadow: '0 8px 32px rgba(139, 69, 190, 0.2), 0 0 1px rgba(139, 69, 190, 0.3) inset',
                                  border: '1px solid rgba(255, 255, 255, 0.3)'
                                }}
                              >
                                <div className="font-bold mb-2 text-primary-dark">Training Data</div>
                                <div className="text-sm space-y-1 text-gray-700">
                                  {hoveredTrainingRecord.speed && (
                                    <div className="font-medium">Speed: <span className="text-primary">{hoveredTrainingRecord.speed.toFixed(1)} km/h</span></div>
                                  )}
                                  {hoveredTrainingRecord.heartRate && (
                                    <div className="font-medium">Heart Rate: <span className="text-red">{Math.round(hoveredTrainingRecord.heartRate)} bpm</span></div>
                                  )}
                                  {hoveredTrainingRecord.power && (
                                    <div className="font-medium">Power: <span className="text-primary-dark">{Math.round(hoveredTrainingRecord.power)} W</span></div>
                                  )}
                                  <div className="font-medium">Time: <span className="text-primary-dark">{formatDuration(hoveredTrainingRecord.timeFromStart)}</span></div>
                                </div>
                              </div>
                              {/* Arrow */}
                              <div
                                style={{
                                  position: 'absolute',
                                  left: '50%',
                                  top: '100%',
                                  transform: 'translateX(-50%)',
                                  width: 0,
                                  height: 0,
                                  borderLeft: '8px solid transparent',
                                  borderRight: '8px solid transparent',
                                  borderTop: '8px solid rgba(255, 255, 255, 0.85)',
                                  filter: 'drop-shadow(0 2px 4px rgba(139, 69, 190, 0.2))'
                                }}
                              />
                            </div>
                          )}
                          
                          {/* Zoom indicator */}
                          {trainingZoom.scale > 1 && (
                            <div className="absolute top-2 right-2 text-xs text-gray-600 bg-white bg-opacity-80 px-2 py-1 rounded">
                              Zoom: {trainingZoom.scale.toFixed(1)}x
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div className={`flex flex-col gap-3 min-h-0 ${isMobile ? '' : 'gap-4 md:gap-6'}`}>
                  {/* Interval Chart (FIT) - linked with LapsTable row clicks */}
                  {selectedTraining && selectedTraining.laps && selectedTraining.laps.length > 0 && (
                    <div className="shrink-0">
                      <IntervalChart
                        laps={selectedTraining.laps}
                        sport={selectedTraining.sport || 'cycling'}
                        records={selectedTraining.records || []}
                        user={user}
                        selectedLapNumber={selectedLapNumber}
                        onSelectLapNumber={setSelectedLapNumber}
                        highlightMetric={highlightMetric}
                      />
                    </div>
                  )}

                  {/* Laps/Intervals — table body scrolls inside LapsTable */}
                  <div className="min-h-0">
                  <LapsTable
                    training={selectedTraining}
                    onUpdate={loadTrainingDetail}
                    user={user}
                    selectedLapNumber={selectedLapNumber}
                    onSelectLapNumber={setSelectedLapNumber}
                    onOpenLactateForm={handleFitOpenLactateForm}
                    hideChart={true}
                    highlightMetric={highlightMetric}
                    radarWatts={radarWatts}
                  />
                  </div>

                  {/* Similar workouts panel — only for FIT trainings with laps */}
                  {selectedTraining?.laps?.length > 0 && !selectedTraining?.isRegularTraining && (
                    <SimilarWorkoutsPanel
                      training={selectedTraining}
                      isMobile={isMobile}
                      onSelectWorkout={(id) => loadTrainingDetail(id)}
                    />
                  )}
                  </div>
            </motion.div>
                        </motion.div>
        )}

        {/* Strava Activity Detail */}
        {selectedStrava && (
          <motion.div
            ref={detailSectionRef}
            initial={isMobile ? { y: '100%', opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className={`w-full ${isMobile ? 'mt-0' : 'mt-4 md:mt-6'}`}>
            {/* Back button bar — sticky on mobile */}
            {isMobile ? (
              <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
                <div className="px-3 py-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCloseTrainingDetail}
                    className="flex items-center gap-1 text-sm font-medium text-gray-600 active:text-primary touch-manipulation"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                    <span>Calendar</span>
                  </button>
                  <div className="ml-auto flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isPremium) { gate('Workout Planning', 'pro'); return; }
                        const dateStr = selectedStrava?.start_date_local || selectedStrava?.start_date || selectedStrava?.startDate;
                        const d = dateStr ? new Date(dateStr) : new Date();
                        const sportRaw = (selectedStrava?.sport_type || selectedStrava?.type || selectedStrava?.sport || '').toLowerCase();
                        const sport = sportRaw.includes('run') || sportRaw.includes('walk') || sportRaw.includes('hike') ? 'run'
                                     : sportRaw.includes('swim') ? 'swim' : 'bike';
                        const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                        const matchPw = (plannedWorkoutsCalendar || []).find(pw => {
                          const pwDate = typeof pw.date === 'string' ? pw.date.slice(0,10) : '';
                          return pwDate === dayKey && pw.sport === sport;
                        }) || null;
                        setPlanModal({ date: d, workout: matchPw });
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-semibold text-blue-600 active:bg-blue-50"
                    >
                      <PencilIcon className="w-4 h-4" /> Edit plan
                    </button>
                  </div>
                </div>
                <div className="flex border-t border-gray-100">
                  {['summary','laps'].map(t => (
                    <button
                      key={t}
                      onClick={() => setMobileStravaTab(t)}
                      className={`flex-1 py-2 text-sm font-semibold border-b-2 transition-colors ${
                        mobileStravaTab === t ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400'
                      }`}
                    >
                      {t === 'summary' ? 'Summary' : 'Laps'}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 mb-4">
                <button
                  type="button"
                  onClick={handleCloseTrainingDetail}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm transition-colors"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                  Back to Calendar
                </button>
              </div>
            )}
            {!selectedStravaStreams ? (
              <div className={`${isMobile ? 'p-2' : 'p-4 md:p-6'} bg-yellow-50/80 backdrop-blur-sm border border-yellow-200/60 ${isMobile ? 'rounded-lg' : 'rounded-2xl'} shadow-md`}>
                <div className="space-y-3" aria-busy="true">
                  <Skeleton className="h-4 w-44 bg-yellow-200/80" />
                  <Skeleton className={`${isMobile ? 'h-40' : 'h-64'} w-full bg-yellow-100`} />
                  <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-3 bg-yellow-200/80" />
                    <Skeleton className="h-3 bg-yellow-200/80" />
                    <Skeleton className="h-3 bg-yellow-200/80" />
                  </div>
                </div>
              </div>
            ) : (() => {
          const time = selectedStravaStreams?.time?.data || [];
          const maxTime = time.length > 0 ? time[time.length-1] : 0;
          
          // Get unique laps (deduplicated) - used in deduplicateStravaLaps call
          deduplicateStravaLaps(selectedStrava?.laps || []);

          // Strava Title and Description Editor Component
          const StravaTitleEditor = ({ onExportToTraining }) => {
            const [isEditingTitle, setIsEditingTitle] = useState(false);
            const [isEditingDescription, setIsEditingDescription] = useState(false);
            const [isEditingCategory, setIsEditingCategory] = useState(false);
            const [title, setTitle] = useState(selectedStrava?.titleManual || selectedStrava?.name || '');
            const [description, setDescription] = useState(selectedStrava?.description || '');
            const [category, setCategory] = useState(selectedStrava?.category || '');
            const [saving, setSaving] = useState(false);
            const [allTitles, setAllTitles] = useState([]);
            const [showSuggestions, setShowSuggestions] = useState(false);
            const [filteredTitles, setFilteredTitles] = useState([]);
            const titleInputRef = useRef(null);
            const suggestionsRef = useRef(null);

            useEffect(() => {
              if (selectedStrava) {
                setTitle(selectedStrava?.titleManual || selectedStrava?.name || '');
                setDescription(selectedStrava?.description || '');
                setCategory(selectedStrava?.category || '');
              }
            // eslint-disable-next-line react-hooks/exhaustive-deps
            }, [selectedStrava?.id, selectedStrava?.category]);

            // Load all titles when editing starts
            useEffect(() => {
              if (isEditingTitle) {
                getAllTitles().then(titles => {
                  setAllTitles(titles);
                  setFilteredTitles(titles); // Zobrazit všechny titles na začátku
                  setShowSuggestions(titles.length > 0); // Zobrazit dropdown hned
                }).catch(err => console.error('Error loading titles:', err));
              }
            }, [isEditingTitle]);

            // Filter titles based on input
            useEffect(() => {
              if (title.trim() === '') {
                setFilteredTitles(allTitles);
                setShowSuggestions(allTitles.length > 0);
              } else {
                const filtered = allTitles.filter(t => 
                  t.toLowerCase().includes(title.toLowerCase())
                );
                setFilteredTitles(filtered);
                setShowSuggestions(filtered.length > 0);
              }
            }, [title, allTitles]);

            // Handle click outside to close suggestions
            useEffect(() => {
              const handleClickOutside = (event) => {
                if (
                  suggestionsRef.current &&
                  !suggestionsRef.current.contains(event.target) &&
                  titleInputRef.current &&
                  !titleInputRef.current.contains(event.target)
                ) {
                  setShowSuggestions(false);
                }
              };

              if (isEditingTitle) {
                document.addEventListener('mousedown', handleClickOutside);
                return () => document.removeEventListener('mousedown', handleClickOutside);
              }
            }, [isEditingTitle]);

            const handleSaveTitle = async () => {
              try {
                setSaving(true);
                const newTitle = title.trim();
                await updateStravaActivity(selectedStrava.id, { title: newTitle || null });
                setIsEditingTitle(false);
                await loadStravaDetail(selectedStrava.id);
                
                // Update externalActivities immediately to reflect the change in CalendarView
                setExternalActivities(prev => prev.map(a => {
                  if (String(a.stravaId || a.id) === String(selectedStrava.id)) {
                    return {
                      ...a,
                      titleManual: newTitle,
                      name: newTitle,
                      title: newTitle
                    };
                  }
                  return a;
                }));
                
                await loadExternalActivities(); // Reload to update calendar (will override the immediate update with fresh data)
                
                // Dispatch event to notify other components (e.g., WeeklyCalendar) about the update
                window.dispatchEvent(new CustomEvent('activityUpdated', {
                  detail: {
                    type: 'strava',
                    id: selectedStrava.id,
                    stravaId: selectedStrava.id,
                    title: newTitle,
                    titleManual: newTitle,
                    name: newTitle
                  }
                }));
                // Show export dialog after saving title (with small delay to ensure data is loaded)
                if (onExportToTraining) {
                  setTimeout(() => {
                    onExportToTraining();
                  }, 500);
                }
                      } catch (error) {
                console.error('Error saving title:', error);
                alert('Error saving title');
              } finally {
                setSaving(false);
              }
            };

            const handleSaveDescription = async () => {
              try {
                setSaving(true);
                await updateStravaActivity(selectedStrava.id, { description: description.trim() || null });
                setIsEditingDescription(false);
                await loadStravaDetail(selectedStrava.id);
              } catch (error) {
                console.error('Error saving description:', error);
                alert('Error saving description');
              } finally {
                setSaving(false);
              }
            };

            const handleSaveCategory = async (catId) => {
              // catId may be passed directly (from pill click) or fall back to state
              const valueToSave = catId !== undefined ? catId : category;
              try {
                setSaving(true);
                await updateStravaActivity(selectedStrava.id, { category: valueToSave || null });
                setIsEditingCategory(false);
                await loadStravaDetail(selectedStrava.id);
                await loadExternalActivities(); // Reload to update calendar
                // Dispatch event to notify other components (e.g., WeeklyCalendar) about the update
                window.dispatchEvent(new CustomEvent('activityUpdated', {
                  detail: {
                    type: 'strava',
                    id: selectedStrava.id,
                    stravaId: selectedStrava.id,
                    category: valueToSave
                  }
                }));
              } catch (error) {
                console.error('Error saving category:', error);
                alert('Error saving category');
              } finally {
                setSaving(false);
              }
            };

            // Use linked training title if available, otherwise use titleManual or name
            const displayTitle = selectedStrava?.linkedTrainingTitle || selectedStrava?.titleManual || selectedStrava?.name || 'Untitled Activity';
            const stravaSport = selectedStrava?.sport_type || selectedStrava?.sport || selectedStrava?.type || '';
            const stravaDate = selectedStrava?.start_date || selectedStrava?.startDate || null;
            const getSportEmoji = (s) => {
              const sl = (s || '').toLowerCase();
              if (sl.includes('run')) return '🏃';
              if (sl.includes('swim')) return '🏊';
              if (sl.includes('walk')) return '🚶';
              if (sl.includes('hike')) return '🥾';
              if (sl.includes('ski')) return '⛷️';
              if (sl.includes('row')) return '🚣';
              return '🚴';
            };
            const formatStravaDate = (d) => {
              if (!d) return '';
              try {
                const date = new Date(d);
                if (isNaN(date.getTime())) return '';
                return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
              } catch { return ''; }
            };

                    return (
              <>
                {/* Activity Header */}
                <div className={`${isMobile ? 'mb-3 pb-3' : 'mb-5 pb-4'} border-b border-gray-100`}>
                  {/* Sport + Date + Category row */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-lg leading-none">{getSportEmoji(stravaSport)}</span>
                    <span className={`${isMobile ? 'text-[11px]' : 'text-xs'} text-gray-400 font-medium`}>
                      {formatStravaDate(stravaDate)}
                    </span>
                    {/* Category badge — click to edit */}
                    {(() => {
                      // SVG icons matching TrainingForm / AutoClassifyModal
                      const CatSvg = ({ children, size = 10 }) => (
                        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          {children}
                        </svg>
                      );
                      const CATEGORY_ICONS = {
                        endurance: <CatSvg><path d="M2 12 C5.5 6 8.5 6 12 12 C15.5 18 18.5 18 22 12" /></CatSvg>,
                        lt1: <CatSvg><polyline points="3,19 9,16 14,10 20,5" /><circle cx="14" cy="10" r="2.2" fill="currentColor" stroke="none" /></CatSvg>,
                        tempo: <CatSvg><circle cx="12" cy="13" r="8" /><polyline points="12,9 12,13 15,15" /><line x1="9" y1="2" x2="15" y2="2" /><line x1="12" y1="2" x2="12" y2="5" /></CatSvg>,
                        lt2: <CatSvg><polyline points="3,19 7,18 10,15 13,9 19,4" /><circle cx="13" cy="9" r="2.2" fill="currentColor" stroke="none" /></CatSvg>,
                        zone2: <CatSvg strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /><polyline points="8,12 10,10 11,14 13,10 14,12" strokeWidth="1.2" /></CatSvg>,
                        vo2max: <CatSvg><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5,12 12,5 19,12" /></CatSvg>,
                        hills: <CatSvg><polyline points="2,20 7,10 11,15 15,8 19,13 22,20" /><line x1="2" y1="20" x2="22" y2="20" /></CatSvg>,
                      };
                      return isEditingCategory ? (
                        <div className="relative">
                          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-2 min-w-[220px]">
                            <div className="grid grid-cols-2 gap-1 mb-1.5">
                              {/* None option */}
                              <button
                                onClick={() => { setCategory(''); handleSaveCategory(''); }}
                                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${!category ? 'bg-gray-100 border-gray-400 text-gray-700' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}
                              >
                                <span>✕</span> None
                              </button>
                              {categories.map(cat => {
                                const isActive = category === cat.id;
                                const icon = CATEGORY_ICONS[cat.id] || null;
                                return (
                                  <button
                                    key={cat.id}
                                    onClick={() => { setCategory(cat.id); handleSaveCategory(cat.id); setIsEditingCategory(false); }}
                                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[13px] font-semibold border transition-all hover:opacity-90"
                                    style={isActive
                                      ? { backgroundColor: cat.color, color: '#fff', borderColor: cat.color }
                                      : { backgroundColor: `${cat.color}18`, color: cat.color, borderColor: `${cat.color}40` }
                                    }
                                  >
                                    {icon && <span className="flex-shrink-0">{icon}</span>}
                                    <span>{cat.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              onClick={() => { setIsEditingCategory(false); setCategory(selectedStrava?.category || ''); }}
                              className="w-full text-xs text-gray-400 hover:text-gray-600 py-0.5 text-center"
                            >
                              Cancel
                            </button>
                          </div>
                          {/* backdrop */}
                          <div className="fixed inset-0 z-40" onClick={() => { setIsEditingCategory(false); setCategory(selectedStrava?.category || ''); }} />
                        </div>
                      ) : (
                        <button onClick={() => setIsEditingCategory(true)} title="Click to set category" className="flex items-center gap-1">
                          <span
                            className="px-2 py-0.5 text-xs rounded-md font-medium border transition-opacity hover:opacity-80 flex items-center gap-1"
                            style={getCategoryStyle(category)}
                          >
                            {category && CATEGORY_ICONS[category] && (
                              <span className="flex-shrink-0">{CATEGORY_ICONS[category]}</span>
                            )}
                            {category
                              ? (categories.find(c => c.id === category)?.label || category)
                              : '+ Category'}
                          </span>
                        </button>
                      );
                    })()}
                  </div>

                  {/* Editable title */}
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                  {isEditingTitle ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="relative flex-1">
                            <input
                              ref={titleInputRef}
                              type="text"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              onFocus={() => {
                                if (allTitles.length > 0) {
                                  setShowSuggestions(true);
                                }
                              }}
                            className={`w-full ${isMobile ? 'text-base' : 'text-xl'} font-bold border-2 border-primary/50 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary bg-white/90 shadow-sm`}
                              placeholder="Enter title..."
                              autoFocus
                            />
                            {showSuggestions && filteredTitles.length > 0 && (
                              <div
                                ref={suggestionsRef}
                              className="absolute top-full left-0 right-0 mt-1 bg-white/95 backdrop-blur-sm border border-gray-300 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto"
                              >
                                {filteredTitles.map((suggestion, index) => (
                                  <div
                                    key={index}
                                    onClick={() => {
                                      setTitle(suggestion);
                                      setShowSuggestions(false);
                                    }}
                                  className="px-3 py-2 bg-primary/10 hover:bg-primary/20 cursor-pointer text-sm transition-colors"
                                  >
                                    {suggestion}
                                    </div>
                                ))}
                              </div>
                            )}
                          </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={handleSaveTitle}
                            disabled={saving}
                            className="p-1.5 bg-emerald-500 text-white rounded-md hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
                            title="Save title"
                          >
                            <CheckIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                            setIsEditingTitle(false);
                            setTitle(displayTitle);
                          }}
                          className="p-1.5 bg-gray-400 text-white rounded-md hover:bg-gray-500 transition-all shadow-sm hover:shadow-md"
                            title="Cancel"
                          >
                            <XMarkIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      ) : (
                      <div className="flex items-center gap-2 flex-1 group">
                        <h1 className={`${isMobile ? 'text-base' : 'text-xl md:text-2xl'} font-bold text-gray-900 flex-1 leading-tight`}>{displayTitle}</h1>
                        <button
                          onClick={() => setIsEditingTitle(true)}
                          className={`${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all flex-shrink-0`}
                          title="Edit title"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      </div>
                      )}
                  </div>
                </div>
                
                {/* Description */}
                <div className={`${isMobile ? 'mb-2 p-2' : 'mb-0 p-3'} bg-gray-50 rounded-xl border border-gray-100`}>
                  <div className={`flex items-start ${isMobile ? 'flex-col' : ''} gap-2`}>
                    {isEditingDescription ? (
                      <>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className={`flex-1 ${isMobile ? 'px-2 py-1.5 text-xs min-h-[60px]' : 'px-3 py-2 text-sm min-h-[80px]'} border border-gray-300 ${isMobile ? 'rounded-md' : 'rounded-lg'} bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y`}
                          placeholder="Enter description..."
                          autoFocus
                        />
                        <div className={`flex ${isMobile ? 'flex-row gap-1.5 w-full' : 'flex-col gap-1.5'} flex-shrink-0`}>
                        <button
                            onClick={handleSaveDescription}
                            disabled={saving}
                            className={`${isMobile ? 'p-1.5' : 'p-2'} bg-emerald-500 text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md`}
                            title="Save description"
                          >
                            <CheckIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                        </button>
                          <button
                            onClick={() => {
                              setIsEditingDescription(false);
                              setDescription(selectedStrava?.description || '');
                            }}
                            className={`${isMobile ? 'p-1.5' : 'p-2'} bg-gray-400 text-white ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-gray-500 transition-all shadow-sm hover:shadow-md`}
                            title="Cancel"
                          >
                            <XMarkIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-start gap-2 w-full group">
                        <div className="flex-1">
                          {description ? (
                            <p className={`text-gray-800 whitespace-pre-wrap leading-relaxed ${isMobile ? 'text-xs' : 'text-sm'}`}>{description}</p>
                          ) : (
                          <button
                              onClick={() => setIsEditingDescription(true)}
                              className={`text-gray-400 hover:text-gray-600 w-full text-left py-1 transition-colors ${isMobile ? 'text-xs' : 'text-sm'}`}
                          >
                              Click to add description...
                          </button>
                          )}
                        </div>
                        <button
                          onClick={() => setIsEditingDescription(true)}
                          className={`${isMobile ? 'opacity-100 p-1' : 'opacity-0 group-hover:opacity-100 p-1.5'} text-gray-500 hover:text-gray-700 hover:bg-gray-200 ${isMobile ? 'rounded-md' : 'rounded-lg'} transition-all flex-shrink-0`}
                          title="Edit description"
                        >
                          <PencilIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                        </button>
                    </div>
                  )}
          </div>
                </div>
              </>
            );
          };

          return (
            <div className={`bg-white ${isMobile ? 'rounded-none border-0' : 'rounded-2xl border border-gray-200 shadow-sm'} ${isMobile ? 'p-4' : 'p-5 md:p-8'} ${isMobile ? 'space-y-4' : 'space-y-5 md:space-y-8'}`}>
              <div className={isMobile && mobileStravaTab !== 'summary' ? 'hidden' : 'contents'}>
              {/* Title and Description */}
              <StravaTitleEditor onExportToTraining={handleExportToTraining} />

              {/* Map Section */}
              {getGpsData.length > 0 && (
                <div className={`${isMobile ? '-mx-4' : ''}`}>
                  <div className={`relative overflow-hidden ${isMobile ? '' : 'rounded-2xl'} ${isMobile ? 'h-[220px]' : 'h-[320px] md:h-[400px]'}`}>
                    <MapContainer
                      key={`strava-map-${getGpsData[0]?.[0]}-${getGpsData[0]?.[1]}`}
                      center={getGpsData[Math.floor(getGpsData.length / 2)]}
                      zoom={13}
                      style={{ height: '100%', width: '100%', zIndex: 0 }}
                      scrollWheelZoom={true}
                      zoomControl={false}
                      attributionControl={false}
                    >
                      <MapInvalidator positions={getGpsData} />
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                      />
                      <Polyline
                        positions={getGpsData}
                        pathOptions={{ color: '#6366f1', weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
                      />
                      <CircleMarker
                        center={getGpsData[0]}
                        radius={7}
                        pathOptions={{ color: '#fff', weight: 2.5, fillColor: '#22c55e', fillOpacity: 1 }}
                      >
                        <Tooltip permanent direction="top" offset={[0, -10]} className="leaflet-tooltip-clean">Start</Tooltip>
                      </CircleMarker>
                      <CircleMarker
                        center={getGpsData[getGpsData.length - 1]}
                        radius={7}
                        pathOptions={{ color: '#fff', weight: 2.5, fillColor: '#ef4444', fillOpacity: 1 }}
                      >
                        <Tooltip permanent direction="top" offset={[0, -10]} className="leaflet-tooltip-clean">Finish</Tooltip>
                      </CircleMarker>
                    </MapContainer>
                    {/* subtle vignette */}
                    <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-[inset_0_0_30px_rgba(0,0,0,0.06)]" />
                  </div>
                </div>
              )}

              {/* Header Stats + Toggles */}
              {(() => {
                const formatPace = (speedMps) => {
                  if (!speedMps || speedMps <= 0) return null;
                  const paceSeconds = Math.round(1000 / speedMps);
                  const minutes = Math.floor(paceSeconds / 60);
                  const seconds = paceSeconds % 60;
                  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
                };
                
                const avgPace = isStravaRun && stravaAvgSpeed ? formatPace(stravaAvgSpeed) : null;
                const maxPace = isStravaRun && selectedStrava.max_speed ? formatPace(selectedStrava.max_speed) : null;
                const maxHR = selectedStrava.max_heartrate ? Math.round(selectedStrava.max_heartrate) : null;
                const elevation = stravaElevationGain ? Math.round(stravaElevationGain) : null;
                
                if (isMobile) {
                  const items = [
                    { label: 'Distance', value: formatDistance(selectedStrava.distance, user) },
                    { label: 'Duration', value: formatDuration(selectedStrava.elapsed_time) },
                    ...(avgPace ? [] : !isStravaRun && stravaAvgSpeedKmh ? [{
                      label: 'Avg Speed',
                      value: `${stravaAvgSpeedKmh} km/h`,
                      sub: stravaMaxSpeedKmh ? `Max ${stravaMaxSpeedKmh} km/h` : null
                    }] : []),
                    ...(avgPace ? [{ label: 'Avg Pace', value: `${avgPace} /100m`, sub: maxPace ? `Max ${maxPace}` : null }] : []),
                    ...(selectedStrava.average_heartrate ? [{ label: 'Avg Heart Rate', value: `${Math.round(selectedStrava.average_heartrate)} bpm`, sub: maxHR ? `Max ${maxHR} bpm` : null }] : []),
                    ...(selectedStrava.average_watts ? [{ label: 'Avg Power', value: `${Math.round(selectedStrava.average_watts)} W` }] : []),
                    ...(!isStravaRun && stravaWorkKj != null ? [{ label: 'Work', value: `${Math.round(stravaWorkKj)} kJ` }] : []),
                    ...(!isStravaRun && stravaNp != null ? [{ label: 'NP', value: `${Math.round(stravaNp)} W` }] : []),
                    ...(!isStravaRun && stravaPwHrPct != null ? [{ label: 'Pw:Hr', value: `${Number(stravaPwHrPct).toFixed(2)}%` }] : []),
                    ...(!isStravaRun && stravaWkg != null ? [{ label: 'W/kg', value: `${Number(stravaWkg).toFixed(2)} W/kg` }] : []),
                    ...(!isStravaRun && stravaVI != null ? [{ label: 'VI', value: `${Number(stravaVI).toFixed(2)}` }] : []),
                    ...(!isStravaRun && stravaEF != null ? [{ label: 'EF', value: `${Number(stravaEF).toFixed(2)}` }] : []),
                    ...(elevation && elevation > 0 ? [{ label: 'Elevation', value: `+${elevation} m` }] : []),
                    ...(stravaAvgCadence ? [{ label: 'Cadence', value: `${Math.round(stravaAvgCadence)} rpm` }] : []),
                    ...(calculateStravaTSS ? [{ label: 'TSS', value: String(calculateStravaTSS.value), sub: calculateStravaIF ? `IF ${calculateStravaIF}` : null }] : []),
                  ];
                  return (
                    <div>
                      <div className="grid w-full grid-cols-3 gap-2">
                        {items.map((item, idx) => (
                          <div
                            key={idx}
                            className="min-w-0 rounded-xl border border-gray-100 bg-gray-50 px-2 py-2"
                          >
                            <div className="truncate text-xs font-medium leading-tight text-gray-500 mb-0.5" title={item.label}>{item.label}</div>
                            <div className="text-sm font-bold leading-tight text-gray-900">{item.value}</div>
                            {item.sub && <div className="truncate text-[11px] leading-tight text-gray-400 mt-0.5">{item.sub}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                
                if (isStravaRun) {
                  // On desktop the single 'Detailed Statistics' row shows everything.
                  if (!isMobile) return null;
                  return (
                    <div className="flex flex-nowrap gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
                      <div className="shrink-0 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm">
                        <div className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Duration</div>
                        <div className="text-sm font-bold text-gray-900">{formatDuration(selectedStrava.elapsed_time)}</div>
                      </div>
                      <div className="shrink-0 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm">
                        <div className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Distance</div>
                        <div className="text-sm font-bold text-gray-900">{formatDistance(selectedStrava.distance, user)}</div>
                      </div>
                      {avgPace && (
                        <div className="shrink-0 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm">
                          <div className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Avg Pace</div>
                          <div className="text-sm font-bold text-gray-900">{avgPace} /km</div>
                          <div className="text-[10px] text-gray-400">{maxPace ? `Max ${maxPace} /km` : '\u00A0'}</div>
                        </div>
                      )}
                      <div className="shrink-0 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm">
                        <div className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Avg Heart Rate</div>
                        <div className="text-sm font-bold text-gray-900">{selectedStrava.average_heartrate ? `${Math.round(selectedStrava.average_heartrate)} bpm` : '-'}</div>
                        <div className="text-[10px] text-gray-400">{maxHR ? `Max ${maxHR} bpm` : '\u00A0'}</div>
                      </div>
                      {elevation && elevation > 0 && (
                        <div className="shrink-0 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm">
                          <div className="text-[10px] font-semibold text-gray-500 uppercase mb-0.5">Elevation</div>
                          <div className="text-sm font-bold text-gray-900">+{elevation} m</div>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Detailed Statistics - hidden on mobile (already shown above) */}
              {selectedStrava && !isMobile && (
                <div className="w-full">
                  <div className="flex flex-nowrap gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
                    {/* Core stats — always shown */}
                    <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Duration</div>
                      <div className="text-sm font-semibold text-gray-900">{formatDuration(selectedStrava.elapsed_time)}</div>
                    </div>
                    <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Distance</div>
                      <div className="text-sm font-semibold text-gray-900">{formatDistance(selectedStrava.distance, user)}</div>
                    </div>
                    {isStravaRun && stravaAvgSpeed > 0 && (() => {
                      const fmtP = (s) => { if (!s || s <= 0) return null; const sec = Math.round(1000/s); return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`; };
                      const ap = fmtP(stravaAvgSpeed);
                      const mp = fmtP(selectedStrava?.max_speed);
                      return ap ? (
                        <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                          <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Avg Pace</div>
                          <div className="text-sm font-semibold text-gray-900">{ap} /km</div>
                          {mp && <div className="text-xs text-gray-400 mt-0.5">Max {mp} /km</div>}
                        </div>
                      ) : null;
                    })()}
                    <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Avg HR</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {selectedStrava.average_heartrate ? `${Math.round(selectedStrava.average_heartrate)} bpm` : '-'}
                      </div>
                      {selectedStrava.max_heartrate && <div className="text-xs text-gray-400 mt-0.5">Max {Math.round(selectedStrava.max_heartrate)} bpm</div>}
                    </div>
                    {isStravaRun && (hasStravaElevation) && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Elevation</div>
                        <div className="text-sm font-semibold text-gray-900">+{Math.round(stravaElevationGain)} m</div>
                      </div>
                    )}
                    {/* Date & Sport — always shown */}
                    <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Date</div>
                      <div className="text-sm font-semibold text-gray-900">{formatDateTime(stravaActivityDate)}</div>
                    </div>
                    <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Sport</div>
                      <div className="text-sm font-semibold text-gray-900">{stravaActivitySport || '-'}</div>
                    </div>
                    {/* Bike-specific stats */}
                    {!isStravaRun && stravaAvgSpeedKmh && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Avg Speed</div>
                        <div className="text-sm font-semibold text-gray-900">{stravaAvgSpeedKmh} km/h</div>
                        {stravaMaxSpeedKmh && <div className="text-xs text-gray-400 mt-0.5">Max: {stravaMaxSpeedKmh} km/h</div>}
                      </div>
                    )}
                    {!isStravaRun && stravaWorkKj != null && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Work</div>
                        <div className="text-sm font-semibold text-gray-900">{Math.round(stravaWorkKj)} kJ</div>
                      </div>
                    )}
                    {!isStravaRun && stravaPwHrPct != null && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Pw:Hr</div>
                        <div className="text-sm font-semibold text-gray-900">{Number(stravaPwHrPct).toFixed(2)}%</div>
                      </div>
                    )}
                    {!isStravaRun && stravaWkg != null && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">W/kg</div>
                        <div className="text-sm font-semibold text-gray-900">{Number(stravaWkg).toFixed(2)} W/kg</div>
                      </div>
                    )}
                    {!isStravaRun && stravaVI != null && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">VI</div>
                        <div className="text-sm font-semibold text-gray-900">{Number(stravaVI).toFixed(2)}</div>
                      </div>
                    )}
                    {!isStravaRun && stravaEF != null && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">EF</div>
                        <div className="text-sm font-semibold text-gray-900">{Number(stravaEF).toFixed(2)}</div>
                      </div>
                    )}
                    {stravaAvgPower && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Avg Power</div>
                        <div className="text-sm font-semibold text-gray-900">{Math.round(stravaAvgPower)} W</div>
                        {stravaMaxPower && <div className="text-xs text-gray-400 mt-0.5">Max: {Math.round(stravaMaxPower)} W</div>}
                      </div>
                    )}
                    {stravaAvgCadence && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Avg Cadence</div>
                        <div className="text-sm font-semibold text-gray-900">{Math.round(stravaAvgCadence)} rpm</div>
                      </div>
                    )}
                    {stravaNormalizedPower && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">NP</div>
                        <div className="text-sm font-semibold text-gray-900">{Math.round(stravaNormalizedPower)} W</div>
                      </div>
                    )}
                    {calculateStravaTSS && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1 flex items-center gap-1">TSS{calculateStravaTSS.estimated && <span className="text-xs text-gray-400">*</span>}</div>
                        <div className="text-sm font-semibold text-gray-900">{calculateStravaTSS.value}</div>
                        {calculateStravaIF && <div className="text-xs text-gray-400 mt-0.5">IF: {calculateStravaIF}</div>}
                      </div>
                    )}
                    {!isStravaRun && hasStravaElevation && (
                      <div className="shrink-0 px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Elevation</div>
                        <div className="text-sm font-semibold text-gray-900">{Math.round(stravaElevationGain)} m</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {highlightMetric && (
                <div className="mb-3 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50/70 px-4 py-2 text-sm text-indigo-800">
                  <span>
                    <span className="font-semibold">From Power Radar</span>
                    {radarWatts > 0 && (
                      <span className="ml-2">
                        — Best {highlightMetric === 'sprint5s' ? '5s' : highlightMetric === 'attack1min' ? '1min' : highlightMetric === 'vo2max5min' ? '5min' : highlightMetric === 'threshold20min' ? '20min' : '60min'}: <span className="font-bold">{radarWatts} W</span>
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => {
                      setHighlightMetric(null);
                      setRadarWatts(null);
                      const url = new URL(window.location);
                      url.searchParams.delete('highlightMetric');
                      url.searchParams.delete('radarWatts');
                      window.history.replaceState({}, '', url.toString());
                    }}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-900 underline underline-offset-2"
                  >
                    Clear highlight
                  </button>
                </div>
              )}

              {/* Training Comments — right below stats */}
              <TrainingComments
                trainingId={String(selectedStrava?.id || selectedStrava?._id)}
                trainingType="strava"
                isMobile={isMobile}
              />
              </div>

              <div className={isMobile && mobileStravaTab !== 'laps' ? 'hidden' : 'contents'}>
              {/* Training Chart - Modern SVG Version for Strava */}
              {(() => {
                // Convert Strava streams to records format
                if (!selectedStrava || !selectedStravaStreams) return null;
                
                const timeArray = selectedStravaStreams?.time?.data || selectedStravaStreams?.time || [];
                if (timeArray.length === 0) return null;
                
                const speedArray = selectedStravaStreams?.velocity_smooth?.data || selectedStravaStreams?.velocity_smooth || [];
                const hrArray = selectedStravaStreams?.heartrate?.data || selectedStravaStreams?.heartrate || [];
                const powerArray = selectedStravaStreams?.watts?.data || selectedStravaStreams?.watts || [];
                const distanceArray = selectedStravaStreams?.distance?.data || selectedStravaStreams?.distance || [];
                const cadenceArray = selectedStravaStreams?.cadence?.data || selectedStravaStreams?.cadence || [];
                const altitudeArray = selectedStravaStreams?.altitude?.data || selectedStravaStreams?.altitude || [];
                
                // Get activity start time
                const activityStartDate = selectedStrava?.start_date_local || 
                  selectedStrava?.start_date || 
                  selectedStrava?.raw?.start_date || 
                  selectedStrava?.startDate;
                const parsedStartTime = activityStartDate ? new Date(activityStartDate).getTime() : NaN;
                const activityStartTime = Number.isFinite(parsedStartTime) ? parsedStartTime : Date.now();
                
                // Convert streams to records
                const records = timeArray.map((time, index) => {
                  const timestamp = new Date(activityStartTime + (time * 1000));
                  const distance = distanceArray[index] || (index > 0 ? distanceArray[index - 1] : 0);
                  
                  return {
                    timestamp: Number.isNaN(timestamp.getTime()) ? new Date(activityStartTime).toISOString() : timestamp.toISOString(),
                    timeFromStart: time,
                    distance: distance,
                    speed: speedArray[index] || null,
                    heartRate: hrArray[index] || null,
                    power: powerArray[index] || null,
                    cadence: cadenceArray[index] || null,
                    altitude: altitudeArray[index] || null
                  };
                });
                
                const trainingData = {
                  _id: selectedStrava.id || selectedStrava.stravaId,
                  titleManual: selectedStrava.titleManual || selectedStrava.name,
                  sport: selectedStrava.sport || selectedStrava.sport_type || 'cycling',
                  timestamp: new Date(activityStartTime),
                  totalElapsedTime: timeArray[timeArray.length - 1] || 0,
                  totalDistance: distanceArray[distanceArray.length - 1] || selectedStrava.distance || 0,
                  records: records,
                  laps: selectedStrava.laps || []
                };
                
                if (trainingData.records && trainingData.records.length > 0) {
                  return (
                    <div className={`${isMobile ? 'mb-2' : 'mb-3 sm:mb-4 md:mb-6'}`}>
                      <h3 className={`${isMobile ? 'text-sm' : 'text-base sm:text-lg md:text-xl'} font-semibold text-gray-900 ${isMobile ? 'mb-2' : 'mb-3 sm:mb-4'}`}>Training Chart</h3>
                      <div className=" -mx-2 sm:-mx-3 md:mx-0 px-2 sm:px-3 md:px-0">
                      <TrainingChart
                        training={trainingData}
                        userProfile={userProfile}
                        onHover={(point) => {
                          // Optional: handle hover events
                        }}
                        onLeave={() => {
                          // Optional: handle leave events
                        }}
                        user={user}
                        highlightMetric={highlightMetric}
                        radarWatts={radarWatts}
                      />
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              <div className={`flex flex-col min-h-0 ${isMobile ? 'gap-2' : 'gap-3 md:gap-4'}`}>
              {/* Streams Chart (ECharts) */}
              {(() => {
                // Extract time, speed, hr, power arrays from streams
                // Handle both formats: {time: {data: [...]}} and {time: [...]}
                const timeArray = selectedStravaStreams?.time?.data || selectedStravaStreams?.time || [];
                const speedArray = selectedStravaStreams?.velocity_smooth?.data || selectedStravaStreams?.velocity_smooth || [];
                const hrArray = selectedStravaStreams?.heartrate?.data || selectedStravaStreams?.heartrate || [];
                const powerArray = selectedStravaStreams?.watts?.data || selectedStravaStreams?.watts || [];
                const altitudeArray = selectedStravaStreams?.altitude?.data || selectedStravaStreams?.altitude || [];
                
                const time = timeArray;
                // Apply smoothing if enabled
                const speed = smoothData(speedArray, smoothingWindow, time);
                smoothData(hrArray, smoothingWindow, time);
                smoothData(powerArray, smoothingWindow, time);
                // eslint-disable-next-line no-unused-vars
                const altitude = altitudeArray; // Don't smooth altitude
                
                // Determine sport type
                const sportType = selectedStrava?.sport_type || selectedStrava?.sport || selectedStrava?.type || '';
                const isRun = sportType.toLowerCase().includes('run');
                const isSwim = sportType.toLowerCase().includes('swim');
                const usePace = isRun || isSwim;
                
                // Calculate pace from speed (in seconds per unit)
                // For run: pace in seconds per km (1000 / speed)
                // For swim: pace in seconds per 100m (100 / speed)
                const calculatePace = (speedMps) => {
                  if (!speedMps || speedMps <= 0) return null;
                  if (isRun) {
                    return 1000 / speedMps; // seconds per km
                  } else if (isSwim) {
                    return 100 / speedMps; // seconds per 100m
                  }
                  return null;
                };
                
                // Calculate pace array from speed
                const pace = usePace ? speed.map(s => calculatePace(s)).filter(p => p !== null && p > 0 && !isNaN(p)) : null;
                
                // Calculate pace range for Y-axis
                // For run: dynamically calculate from data with padding
                // For swim: 2:00/100m (120s) at bottom, 1:20/100m (80s) at top (with padding)
                // eslint-disable-next-line no-unused-vars
                let paceYAxisMin, paceYAxisMax;
                if (usePace) {
                  if (isRun) {
                    // Find min and max pace from data
                    const validPaces = pace.filter(p => p && p > 0 && !isNaN(p));
                    if (validPaces.length > 0) {
                      const minPace = Math.min(...validPaces); // Nejrychlejší pace (nejmenší hodnota v sekundách)
                      const maxPace = Math.max(...validPaces); // Nejpomalejší pace (největší hodnota v sekundách)
                      
                      // Přidat mezeru: min o něco pomalejší (větší hodnota), max o něco rychlejší (menší hodnota)
                      // Ale protože osa je invertovaná, min je nahoře (rychlejší) a max je dole (pomalejší)
                      // Takže paceYAxisMin (nahoře) = minPace - padding (ještě rychlejší)
                      // A paceYAxisMax (dole) = maxPace + padding (ještě pomalejší)
                      const padding = Math.max(10, (maxPace - minPace) * 0.1); // 10% nebo minimálně 10 sekund
                      // Pace axis min/max calculated but not used in current implementation
                      Math.max(120, Math.floor(minPace - padding)); // Minimálně 2:00/km
                      Math.min(600, Math.ceil(maxPace + padding)); // Maximálně 10:00/km
                    } else {
                      // Fallback pokud nejsou data - paceYAxisMin/Max not used
                      // eslint-disable-next-line no-unused-vars
                      const paceYAxisMin = 200; // 3:20/km
                      // eslint-disable-next-line no-unused-vars
                      const paceYAxisMax = 300; // 5:00/km
                    }
                  } else { // swim
                    // Find min and max pace from data (similar to run)
                    const validPaces = pace.filter(p => p && p > 0 && !isNaN(p));
                    if (validPaces.length > 0) {
                      const minPace = Math.min(...validPaces); // Nejrychlejší pace (nejmenší hodnota v sekundách)
                      const maxPace = Math.max(...validPaces); // Nejpomalejší pace (největší hodnota v sekundách)
                      
                      // Přidat mezeru: min o něco pomalejší (větší hodnota), max o něco rychlejší (menší hodnota)
                      // Ale protože osa je invertovaná, min je nahoře (rychlejší) a max je dole (pomalejší)
                      // Takže paceYAxisMin (nahoře) = minPace - padding (ještě rychlejší)
                      // A paceYAxisMax (dole) = maxPace + padding (ještě pomalejší)
                      const padding = Math.max(5, (maxPace - minPace) * 0.1); // 10% nebo minimálně 5 sekund
                      // eslint-disable-next-line no-unused-vars
                      const paceYAxisMin = Math.max(30, Math.floor(minPace - padding)); // Minimálně 0:30/100m
                      // eslint-disable-next-line no-unused-vars
                      const paceYAxisMax = Math.min(300, Math.ceil(maxPace + padding)); // Maximálně 5:00/100m
                    } else {
                      // Fallback pokud nejsou data - paceYAxisMin/Max not used
                    }
                  }
                }
                
                // Get unique laps (deduplicated) for interval chart
                const originalLaps = selectedStrava?.laps || [];
                const uniqueLaps = deduplicateStravaLaps(originalLaps);
                
                // Get records from trainingData if available (for km intervals in running)
                let trainingRecords = [];
                if (selectedStravaStreams) {
                  const timeArray = selectedStravaStreams?.time?.data || selectedStravaStreams?.time || [];
                  const speedArray = selectedStravaStreams?.velocity_smooth?.data || selectedStravaStreams?.velocity_smooth || [];
                  const hrArray = selectedStravaStreams?.heartrate?.data || selectedStravaStreams?.heartrate || [];
                  const powerArray = selectedStravaStreams?.watts?.data || selectedStravaStreams?.watts || [];
                  const distanceArray = selectedStravaStreams?.distance?.data || selectedStravaStreams?.distance || [];
                  const cadenceArray = selectedStravaStreams?.cadence?.data || selectedStravaStreams?.cadence || [];
                  
                  const activityStartDate = selectedStrava?.start_date_local || 
                    selectedStrava?.start_date || 
                    selectedStrava?.raw?.start_date || 
                    selectedStrava?.startDate;
                  const parsedStartTime = activityStartDate ? new Date(activityStartDate).getTime() : NaN;
                  const activityStartTime = Number.isFinite(parsedStartTime) ? parsedStartTime : Date.now();
                  
                  trainingRecords = timeArray.map((time, index) => {
                    const timestamp = new Date(activityStartTime + (time * 1000));
                    const distance = distanceArray[index] || (index > 0 ? distanceArray[index - 1] : 0);
                    
                    return {
                      timestamp: Number.isNaN(timestamp.getTime()) ? new Date(activityStartTime).toISOString() : timestamp.toISOString(),
                      timeFromStart: time,
                      distance: distance,
                      // Strava velocity_smooth is m/s — keep m/s so IntervalChart / lap math match FIT records and TrainingChart streams
                      speed: speedArray[index] != null && speedArray[index] !== '' ? Number(speedArray[index]) : null,
                      heartRate: hrArray[index] || null,
                      power: powerArray[index] || null,
                      cadence: cadenceArray[index] || null
                    };
                  });
                }

                // For running, always show interval chart if we have records (to create km intervals)
                const isRunning = (selectedStrava?.sport || '').toLowerCase().includes('run');
                const shouldShowIntervalChart = (uniqueLaps && uniqueLaps.length > 0) || 
                  (isRunning && trainingRecords && trainingRecords.length > 0) ||
                  (trainingRecords && trainingRecords.length > 0);

                return shouldShowIntervalChart ? (
                  <div className="shrink-0 -mx-2 sm:-mx-3 md:mx-0 px-2 sm:px-3 md:px-0">
                    <IntervalChart
                      laps={uniqueLaps || []}
                      sport={selectedStrava?.sport || selectedStrava?.sport_type || selectedStrava?.type || 'cycling'}
                      records={trainingRecords || []}
                      user={user}
                      selectedLapNumber={selectedLapNumber}
                      onSelectLapNumber={setSelectedLapNumber}
                      highlightMetric={highlightMetric}
                      lapTimeSource="strava"
                    />
                  </div>
                ) : null;
              })()}

              {/* Strava Interval Creation Stats */}
              {showStravaCreateLapButton && stravaSelectionStats && (
                <div className={`${isMobile ? 'mt-2' : 'mt-3 sm:mt-4'} bg-gradient-to-r from-primary/10 to-secondary/10 backdrop-blur-sm border-2 border-primary/30 ${isMobile ? 'rounded-lg' : 'rounded-xl sm:rounded-2xl'} ${isMobile ? 'p-1.5' : 'p-2 sm:p-3 md:p-4 lg:p-6'} shadow-lg`}>
                  <div className={`flex items-center justify-between ${isMobile ? 'mb-1.5' : 'mb-2 sm:mb-3 md:mb-4'}`}>
                    <h4 className={`${isMobile ? 'text-[10px]' : 'text-xs sm:text-sm md:text-base lg:text-lg'} font-semibold text-gray-900`}>Selected Interval Statistics</h4>
                    <button
                      onClick={() => {
                        setShowStravaCreateLapButton(false);
                        setStravaSelectedTimeRange({ start: 0, end: 0 });
                        setStravaSelectionStats(null);
                      }}
                      className={`text-gray-500 hover:text-gray-700 ${isMobile ? 'p-0.5' : 'p-1'} ${isMobile ? 'rounded-md' : 'rounded-lg'} hover:bg-gray-100 transition-colors`}
                    >
                      ✕
                    </button>
                </div>
                  <div className={`grid ${isMobile ? 'grid-cols-3 gap-1' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3'}`}>
                    <div className={`bg-white/90 border border-primary/20 ${isMobile ? 'rounded-md p-1.5' : 'rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4'} shadow-sm`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Duration</div>
                          <div className={`${isMobile ? 'text-[10px]' : 'text-sm sm:text-base md:text-lg lg:text-xl'} font-bold text-primary`}>{formatDuration(stravaSelectionStats.duration)}</div>
                        </div>
                        <div className={`${isMobile ? 'text-sm' : 'text-lg sm:text-xl md:text-2xl'}`}>⏱️</div>
                      </div>
                    </div>
                    {stravaSelectionStats.totalDistance && (
                      <div className={`bg-white/90 border border-primary/20 ${isMobile ? 'rounded-md p-1.5' : 'rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4'} shadow-sm`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Distance</div>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm sm:text-base md:text-lg lg:text-xl'} font-bold text-primary`}>{formatDistance(stravaSelectionStats.totalDistance, user)}</div>
                          </div>
                          <div className={`${isMobile ? 'text-sm' : 'text-lg sm:text-xl md:text-2xl'}`}>📏</div>
                        </div>
                      </div>
                    )}
                    {stravaSelectionStats.avgSpeed != null && (
                      <div className={`bg-white/90 border border-primary/20 ${isMobile ? 'rounded-md p-1.5' : 'rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4'} shadow-sm`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Avg Speed</div>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm sm:text-base md:text-lg lg:text-xl'} font-bold text-primary`}>{stravaSelectionStats.avgSpeed} km/h</div>
                        {stravaSelectionStats.maxSpeed != null && (
                          <div className={`${isMobile ? 'text-[7px]' : 'text-[9px] sm:text-[10px] md:text-xs'} text-gray-500 ${isMobile ? 'mt-0.5' : 'mt-0.5 sm:mt-1'}`}>Max: {stravaSelectionStats.maxSpeed} km/h</div>
                        )}
                          </div>
                          <div className={`${isMobile ? 'text-sm' : 'text-lg sm:text-xl md:text-2xl'}`}>⚡</div>
                        </div>
                </div>
                    )}
                    {stravaSelectionStats.avgHeartRate && (
                      <div className={`bg-white/90 border border-rose-200 ${isMobile ? 'rounded-md p-1.5' : 'rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4'} shadow-sm`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Avg HR</div>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm sm:text-base md:text-lg lg:text-xl'} font-bold text-rose-500`}>{stravaSelectionStats.avgHeartRate} bpm</div>
                        {stravaSelectionStats.maxHeartRate && (
                          <div className={`${isMobile ? 'text-[7px]' : 'text-[9px] sm:text-[10px] md:text-xs'} text-gray-500 ${isMobile ? 'mt-0.5' : 'mt-0.5 sm:mt-1'}`}>Max: {stravaSelectionStats.maxHeartRate} bpm</div>
                        )}
                          </div>
                          <div className={`${isMobile ? 'text-sm' : 'text-lg sm:text-xl md:text-2xl'} text-rose-400`}>❤️</div>
                        </div>
              </div>
                    )}
                    {stravaSelectionStats.avgPower && (
                      <div className={`bg-white/90 border border-indigo-200 ${isMobile ? 'rounded-md p-1.5' : 'rounded-xl sm:rounded-2xl p-2 sm:p-3 md:p-4'} shadow-sm`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className={`${isMobile ? 'text-[8px]' : 'text-[9px] sm:text-[10px] md:text-[11px]'} uppercase tracking-wide text-gray-500`}>Avg Power</div>
                            <div className={`${isMobile ? 'text-[10px]' : 'text-sm sm:text-base md:text-lg lg:text-xl'} font-bold text-indigo-600`}>{stravaSelectionStats.avgPower} W</div>
                        {stravaSelectionStats.maxPower && (
                          <div className={`${isMobile ? 'text-[7px]' : 'text-[9px] sm:text-[10px] md:text-xs'} text-gray-500 ${isMobile ? 'mt-0.5' : 'mt-0.5 sm:mt-1'}`}>Max: {stravaSelectionStats.maxPower} W</div>
                        )}
                          </div>
                          <div className={`${isMobile ? 'text-sm' : 'text-lg sm:text-xl md:text-2xl'} text-indigo-500`}>⚙️</div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={`${isMobile ? 'mt-2' : 'mt-3 sm:mt-4'} flex justify-end`}>
                    <button
                      onClick={async () => {
                        try {
                          const { start, end } = stravaSelectedTimeRange;
                          await createStravaLap(selectedStrava.id, {
                            startTime: Math.min(start, end),
                            endTime: Math.max(start, end)
                          });
                          await loadStravaDetail(selectedStrava.id);
                          await loadExternalActivities(); // Reload Strava activities to update calendar
                          setShowStravaCreateLapButton(false);
                          setStravaSelectedTimeRange({ start: 0, end: 0 });
                          setStravaSelectionStats(null);
                          alert('Interval created successfully!');
                        } catch (error) {
                          console.error('Error creating Strava lap:', error);
                          alert('Error creating interval: ' + (error.response?.data?.error || error.message));
                        }
                      }}
                      className={`${isMobile ? 'px-2.5 py-1.5 text-xs w-full' : 'px-3 sm:px-4 md:px-5 lg:px-6 py-1.5 sm:py-2 text-xs sm:text-sm md:text-base w-full sm:w-auto'} bg-primary text-white ${isMobile ? 'rounded-md' : 'rounded-lg sm:rounded-xl'} font-semibold shadow-md transition-colors flex items-center justify-center gap-2 hover:bg-primary-dark`}
                    >
                      <span>✓</span> Create Interval
                    </button>
                  </div>
                </div>
              )}
              

              {/* Strava Laps/Intervals (+ Time in zones — must stay mounted on mobile; laps list is compact there) */}
              <div className="min-h-0">
                <StravaLapsTable
                  selectedStrava={selectedStrava}
                  selectedStravaStreams={selectedStravaStreams}
                  stravaChartRef={stravaChartRef}
                  maxTime={maxTime}
                  loadStravaDetail={loadStravaDetail}
                  loadExternalActivities={loadExternalActivities}
                  onExportToTraining={handleExportToTraining}
                  onAddLactate={handleCalendarAddLactate}
                  user={user}
                  userProfile={userProfile}
                  selectedLapNumber={selectedLapNumber}
                  onSelectLapNumber={setSelectedLapNumber}
                />
              </div>

              </div>
              </div>
            </div>
          );
        })()}
          </motion.div>
        )}

          </div>

      {/* Manual Add / Edit Training Modal */}
      {showManualForm && ReactDOM.createPortal(
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[1001] p-0 sm:p-4"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="w-full sm:max-w-2xl">
            {manualFormError && (
              <div className="mb-2 mx-4 sm:mx-0 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                {manualFormError}
              </div>
            )}
            <TrainingForm
              key={manualFormInitialData?._id || 'new'}
              onClose={() => { setShowManualForm(false); setManualFormInitialData(null); setManualFormError(null); }}
              onSubmit={handleManualFormSubmit}
              initialData={manualFormInitialData}
              isEditing={!!manualFormInitialData?._id}
              isLoading={manualFormSubmitting}
            />
          </div>
        </motion.div>,
        document.getElementById('app-modal-root') || document.body
      )}

      {/* Training Form Modal - Export to training */}
      {showTrainingForm && trainingFormData && ReactDOM.createPortal(
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[1001] p-0 sm:p-4"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="w-full sm:max-w-2xl">
            <TrainingForm
              onClose={() => {
                setShowTrainingForm(false);
                setTrainingFormData(null);
              }}
              onSubmit={handleTrainingFormSubmit}
              initialData={trainingFormData}
              isEditing={false}
              isLoading={isExporting}
              initialSelectedLap={trainingFormData?._initialSelectedLap ?? null}
            />
          </div>
        </motion.div>,
        document.getElementById('app-modal-root') || document.body
      )}

      {/* Calendar "Add Lactate" loading indicator */}
      {calendarLactateLoading && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1050]">
          <div className="bg-white rounded-xl p-6 flex items-center gap-3 shadow-xl">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
            <span className="text-sm text-gray-700">Loading lactate form…</span>
          </div>
        </div>
      )}

      {/* Calendar "Add Lactate" error banner */}
      {calendarLactateError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1060] flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg text-sm text-red-900">
          <span>{calendarLactateError}</span>
          <button onClick={() => setCalendarLactateError(null)} className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-900 hover:bg-red-100">✕</button>
        </div>
      )}

    </motion.div>
  );
};

export default FitAnalysisPage;


