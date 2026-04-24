import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, CheckIcon, XMarkIcon, FireIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';
import TrainingStats from '../FitAnalysis/TrainingStats';
import LapsTable from '../FitAnalysis/LapsTable';
import { getFitTraining, getStravaActivityDetail, updateFitTraining, updateStravaActivity, updateTraining, addTraining } from '../../services/api';
import api from '../../services/api';
import { useAuth } from '../../context/AuthProvider';
import { formatDistanceForUser, resolveDistanceUnitSystem } from '../../utils/unitsConverter';
import { useCategories, hexToRgba } from '../../context/CategoryContext';
import TrainingForm from '../TrainingForm';

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

function sportBadge(sport) {
  if (!sport) return '';
  const s = String(sport).toLowerCase();
  if (s.includes('run') || s === 'running') return '🏃‍♂️';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike') || s === 'cycling') return '🚴‍♂️';
  if (s.includes('swim') || s === 'swimming') return '🏊‍♂️';
  return '🏋️';
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

function WeekSummaryColumn({ summary, user, prevWeekTss, compact }) {
  const { totalTss, totalSec, bySport } = summary;
  const hoursStr = formatDecimalHours(totalSec);
  const tssRounded = Math.round(totalTss);
  const prevRounded = prevWeekTss != null ? Math.round(Number(prevWeekTss)) : null;
  const showTrend =
    prevRounded != null && prevRounded > 0 && tssRounded !== prevRounded;

  return (
    <div
      className={`flex h-full flex-col rounded-xl border border-gray-100 bg-custom-gray text-left shadow-sm ${
        compact ? 'min-w-[118px] p-2' : 'min-h-0 min-w-0 p-2 sm:p-2.5'
      }`}
      data-testid="weekly-calendar-summary"
    >
      {!compact && (
        <p className="-mt-[35px] mb-2 text-[10px] font-semibold uppercase tracking-wide text-primary">Week summary</p>
      )}
      <div className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
        {hoursStr ? (
          <span
            className={`rounded-full border border-primary/25 bg-white font-semibold tabular-nums text-primary-dark shadow-sm ${
              compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-xs'
            }`}
          >
            {hoursStr}
          </span>
        ) : null}
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-primary/25 bg-white font-semibold tabular-nums text-primary-dark shadow-sm ${
            compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-xs'
          }`}
          title="Total TSS"
        >
          <FireIcon className={compact ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} aria-hidden />
          {tssRounded}
        </span>
        {showTrend ? (
          <span
            className={`inline-flex items-center rounded-full border border-gray-100 bg-white px-1.5 py-0.5 ${tssRounded > prevRounded ? 'text-greenos' : 'text-red'}`}
            title={tssRounded > prevRounded ? 'Up vs previous week' : 'Down vs previous week'}
          >
            {tssRounded > prevRounded ? (
              <ArrowTrendingUpIcon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            ) : (
              <ArrowTrendingDownIcon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            )}
          </span>
        ) : null}
      </div>
      <div
        className={`mt-2 border-t border-gray-200/80 pt-2 ${
          compact ? 'max-h-32 space-y-1 text-[9px]' : 'max-h-52 space-y-2 text-xs sm:text-[13px]'
        } overflow-y-auto leading-snug`}
      >
        {bySport.length === 0 ? (
          <div className="text-lighterText italic">—</div>
        ) : (
          bySport.map((row) => {
            const distPart =
              row.dist > 0 ? formatDistanceForUser(row.dist, user) : '—';
            const timePart = row.sec > 0 ? formatDecimalHours(row.sec) || formatWeekDurationSeconds(row.sec) : '—';
            return (
              <div
                key={row.sport}
                className={`flex flex-col rounded-lg border border-gray-100/90 bg-white/80 ${
                  compact ? 'gap-0 px-1.5 py-1' : 'gap-0.5 px-2 py-1.5'
                }`}
              >
                <div className="flex items-center gap-1.5 text-text">
                  <span className="shrink-0 text-sm leading-none">{sportBadge(row.sport)}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-800 sm:text-xs" title={row.sport}>
                    {row.sport}
                  </span>
                </div>
                <div className={`tabular-nums text-lighterText ${compact ? 'pl-6 text-[9px]' : 'pl-7 text-[11px] sm:text-xs'}`}>
                  <span>{distPart}</span>
                  <span className="mx-1 text-gray-300">·</span>
                  <span>{timePart}</span>
                  <span className="mx-1 text-gray-300">·</span>
                  <span className="inline-flex items-center gap-0.5 font-medium text-primary-dark">
                    <FireIcon className={`shrink-0 ${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'}`} aria-hidden />
                    {Math.round(row.tss)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const WeeklyCalendar = ({ activities = [], onSelectActivity, selectedActivityId, selectedAthleteId = null, onActivityUpdate = null }) => {
  const { user } = useAuth();
  const { getCategory } = useCategories();

  const catBadgeStyle = (catId) => {
    const cat = getCategory(catId);
    if (!cat) return { backgroundColor: '#f3f4f6', color: '#6b7280', borderColor: '#d1d5db' };
    return { backgroundColor: hexToRgba(cat.color, 0.15), color: cat.color, borderColor: hexToRgba(cat.color, 0.35) };
  };
  const catBorderColor = (catId) => {
    const cat = getCategory(catId);
    return cat ? cat.color : null;
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
  // Clear stale cache immediately when the viewed athlete changes
  const prevAthleteIdRef = React.useRef(selectedAthleteId);
  if (prevAthleteIdRef.current !== selectedAthleteId) {
    prevAthleteIdRef.current = selectedAthleteId;
    if (cachedActivities.length > 0) setCachedActivities([]);
  }
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingCategory, setEditingCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [lactateFormOpen, setLactateFormOpen] = useState(false);
  const [lactateFormData, setLactateFormData] = useState(null);
  const [lactateFormLoading, setLactateFormLoading] = useState(false);
  const [, setShowLeftScroll] = useState(false);
  const [, setShowRightScroll] = useState(true);
  const [showLeftScrollNoTraining, setShowLeftScrollNoTraining] = useState(false);
  const [showRightScrollNoTraining, setShowRightScrollNoTraining] = useState(true);
  const scrollContainerRef = useRef(null);
  const scrollContainerNoTrainingRef = useRef(null);

  // Open the full TrainingForm for lactate entry
  const handleOpenLactateForm = async (lapIndex) => {
    if (!trainingDetail) return;
    setLactateFormLoading(true);
    try {
      // Use the laps already loaded in trainingDetail — no second API call needed
      const laps = Array.isArray(trainingDetail.laps) ? trainingDetail.laps : [];

      // If no laps cached yet, fetch them now
      let detail = trainingDetail;
      let fetchedLaps = laps;
      if (!fetchedLaps.length) {
        const rawId = trainingDetail.stravaId || trainingDetail.id || '';
        const stravaId = String(rawId).replace(/^strava-/i, '');
        if (!stravaId) return;
        const data = await getStravaActivityDetail(stravaId, stravaDetailAthleteId);
        detail = { ...trainingDetail, ...(data.detail || {}) };
        fetchedLaps = data.laps || [];
      }
      if (!fetchedLaps.length) return;

      const sportType = detail.sport || detail.sport_type || detail.type || 'bike';
      const sportLower = String(sportType).toLowerCase();
      const sport = sportLower.includes('swim') ? 'swim' : sportLower.includes('run') ? 'run' : 'bike';
      const isRun = sport === 'run';
      const isSwim = sport === 'swim';

      const fmtDur = (sec) => {
        const s = Number(sec) || 0;
        const m = Math.floor(s / 60);
        const ss = Math.round(s % 60);
        return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      };

      const results = fetchedLaps.map((lap, idx) => {
        const durationSec = Math.round(lap.moving_time ?? lap.elapsed_time ?? lap.totalTimerTime ?? 0);
        const distM = Math.round(lap.distance ?? lap.totalDistance ?? 0);
        const speed = lap.average_speed ?? lap.avgSpeed ?? lap.avg_speed ?? lap.enhancedAvgSpeed ?? lap.enhanced_avg_speed ?? lap.speed ?? 0;
        const effectiveSpeed = speed > 0.05 ? speed : (distM > 0 && durationSec > 0 ? distM / durationSec : 0);

        let powerValue = '';
        if (isRun || isSwim) {
          if (effectiveSpeed > 0.05) {
            const paceSec = isSwim ? Math.round(100 / effectiveSpeed) : Math.round(1000 / effectiveSpeed);
            powerValue = fmtDur(paceSec);
          }
        } else {
          const w = lap.average_watts ?? lap.average_power ?? lap.avgPower ?? 0;
          powerValue = w > 0 ? String(Math.round(w)) : '';
        }

        const isSwimRest = isSwim && distM < 10;
        return {
          interval: idx + 1,
          power: powerValue,
          heartRate: String(Math.round(lap.average_heartrate ?? lap.avgHeartRate ?? 0) || ''),
          lactate: lap.lactate != null ? String(lap.lactate) : '',
          RPE: '',
          elevation: (() => {
            const g = lap.total_elevation_gain ?? lap.elevation_gain ?? null;
            return g != null && Number.isFinite(Number(g)) ? String(Math.round(Number(g))) : '';
          })(),
          duration: fmtDur(durationSec),
          durationSeconds: durationSec,
          durationType: 'time',
          distanceMeters: distM > 0 ? distM : undefined,
          repeatCount: 1,
          isRecovery: isSwimRest,
          isSelected: !isSwimRest,
        };
      });

      const activityDate = detail.start_date_local || detail.start_date || detail.date || detail.startDate || new Date();
      const parsedDate = new Date(activityDate);
      const dateStr = (Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate).toISOString().slice(0, 16);

      const stravaActId = String(detail.id || detail.stravaId || trainingDetail.stravaId || trainingDetail.id || '').replace(/^strava-/i, '');

      const initialData = {
        sport,
        type: 'interval',
        category: detail.category || trainingDetail.category || '',
        title: detail.linkedTrainingTitle || detail.title || detail.name || 'Untitled Training',
        customTitle: '',
        description: detail.description || '',
        date: dateStr,
        sourceStravaActivityId: stravaActId,
        specifics: { specific: '', weather: '', customSpecific: '', customWeather: '' },
        results,
      };

      setLactateFormData({ initialData, focusLap: lapIndex });
      setLactateFormOpen(true);
    } catch (err) {
      console.error('WeeklyCalendar: failed to open lactate form', err);
    } finally {
      setLactateFormLoading(false);
    }
  };

  const handleLactateFormSubmit = async (formData) => {
    try {
      const athleteId = selectedAthleteId || user?._id;
      const trainingData = { ...formData, athleteId, coachId: user?._id };
      if (formData._id) {
        await updateTraining(formData._id, trainingData);
      } else {
        await addTraining(trainingData);
      }
      setLactateFormOpen(false);
      setLactateFormData(null);
      if (onActivityUpdate) onActivityUpdate();
    } catch (err) {
      console.error('WeeklyCalendar: failed to save lactate form', err);
    }
  };

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

  // Flush in-memory cache when a different user logs in
  useEffect(() => {
    const handleLogout = () => setCachedActivities([]);
    window.addEventListener('userLoggedOut', handleLogout);
    return () => window.removeEventListener('userLoggedOut', handleLogout);
  }, []);

  // Load activities from localStorage on mount (scoped to the current athlete so switching athletes
  // never shows stale data from a different user)
  useEffect(() => {
    const loadCachedActivities = () => {
      try {
        const cacheKey = `weeklyCalendar_activities_${selectedAthleteId || 'self'}`;
        const cacheTimeKey = `weeklyCalendar_cacheTime_${selectedAthleteId || 'self'}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          // Check if cache is not too old (e.g., 1 hour)
          const cacheTime = localStorage.getItem(cacheTimeKey);
          if (cacheTime && Date.now() - parseInt(cacheTime) < 3600000) {
            setCachedActivities(parsed);
          }
        }
      } catch (error) {
        console.error('Error loading cached activities:', error);
      }
    };
    loadCachedActivities();
  }, [selectedAthleteId]); // re-run when athlete switches so we load correct athlete's cache

  // Save activities to localStorage when they change (scoped per athlete)
  useEffect(() => {
    if (activities && activities.length > 0) {
      try {
        const cacheKey = `weeklyCalendar_activities_${selectedAthleteId || 'self'}`;
        const cacheTimeKey = `weeklyCalendar_cacheTime_${selectedAthleteId || 'self'}`;
        // Match dashboard calendar cap so week navigation into history still has data offline
        const limited = activities.slice(0, 2000);
        localStorage.setItem(cacheKey, JSON.stringify(limited));
        localStorage.setItem(cacheTimeKey, Date.now().toString());
        setCachedActivities(limited);
      } catch (error) {
        console.error('Error saving activities to cache:', error);
      }
    }
  }, [activities, selectedAthleteId]);

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

        const rawLabel = String(act.sport || 'Other').trim() || 'Other';
        // Normalise key to lowercase so "Swim" and "swim" merge into one row
        const mapKey = rawLabel.toLowerCase();
        const displayLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
        if (!sportMap.has(mapKey)) {
          sportMap.set(mapKey, { sport: displayLabel, count: 0, tss: 0, sec: 0, dist: 0 });
        }
        const row = sportMap.get(mapKey);
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

  // Load user profile for TrainingChart - if coach viewing athlete, load athlete's profile
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
        // Ensure we have records for TrainingChart
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
    <div
      className={
        compact
          ? 'min-w-[118px] flex-shrink-0 self-stretch'
          : 'h-full min-h-0 w-full min-w-[150px] max-w-[190px] self-stretch sm:min-w-[160px] sm:max-w-[210px]'
      }
    >
      <WeekSummaryColumn summary={weekSummary} user={user} prevWeekTss={prevWeekSummary.totalTss} compact={compact} />
    </div>
  );

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Calendar</p>
          <h3 className="text-sm font-semibold text-gray-800 sm:text-base">Weekly overview</h3>
          {weekRangeMeta.primary && (
            <p className="mt-1 truncate text-xs text-gray-500 sm:text-sm" title={weekRangeMeta.primary}>
              {weekRangeMeta.primary}
            </p>
          )}
          {weekRangeMeta.secondary && (
            <p className="mt-0.5 truncate text-[11px] text-gray-400 sm:text-xs" title={weekRangeMeta.secondary}>
              {weekRangeMeta.secondary}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5 self-end rounded-lg bg-gray-50 p-0.5 sm:self-start">
          <button
            type="button"
            onClick={prevWeek}
            className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-white hover:text-gray-900 hover:shadow-sm"
            aria-label="Previous week"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={today}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-white hover:shadow-sm"
          >
            Today
          </button>
          <button
            type="button"
            onClick={nextWeek}
            className="rounded-md p-1.5 text-gray-600 transition-colors hover:bg-white hover:text-gray-900 hover:shadow-sm"
            aria-label="Next week"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* MOBILE: Always-visible unified day strip */}
      {isMobile && (
        <div className="relative">
          {showLeftScrollNoTraining && (
            <button
              onClick={() => scrollContainerNoTrainingRef.current?.scrollBy({ left: -180, behavior: 'smooth' })}
              className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-white via-white/70 to-transparent z-10 flex items-center justify-start pl-1"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <ChevronLeftIcon className="w-4 h-4 text-primary" />
              </div>
            </button>
          )}
          {showRightScrollNoTraining && (
            <button
              onClick={() => scrollContainerNoTrainingRef.current?.scrollBy({ left: 180, behavior: 'smooth' })}
              className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white via-white/70 to-transparent z-10 flex items-center justify-end pr-1"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <ChevronRightIcon className="w-4 h-4 text-primary" />
              </div>
            </button>
          )}
          <div
            ref={scrollContainerNoTrainingRef}
            className="overflow-x-auto -mx-2 px-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            <div className="flex gap-2 min-w-max pb-1">
              {weekDays.map((day, idx) => {
                const key = getLocalDateString(day);
                const dayActivities = activitiesByDay.get(key) || [];
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={idx}
                    className={`bg-white rounded-xl border p-2.5 min-w-[120px] flex-shrink-0 transition-all ${
                      isToday
                        ? 'border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/15'
                        : 'border-gray-100 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`text-lg font-bold leading-none ${isToday ? 'text-primary' : 'text-gray-800'}`}>
                        {day.getDate()}
                      </div>
                      <div className={`text-[10px] font-semibold uppercase tracking-wide ${isToday ? 'text-primary/60' : 'text-gray-400'}`}>
                        {dayNames[idx].substring(0, 3)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {dayActivities.length === 0 ? (
                        <div className="text-[9px] text-gray-300 italic py-0.5">—</div>
                      ) : (
                        dayActivities.slice(0, 3).map((act, i) => {
                          const activityId = act.id || act._id;
                          const isSelected = selectedTraining && (
                            (selectedTraining.id && String(activityId) === String(selectedTraining.id)) ||
                            (selectedTraining._id && String(activityId) === String(selectedTraining._id))
                          );
                          return (
                            <button
                              key={i}
                              onClick={() => handleActivityClick(act)}
                              className={`w-full text-left px-1.5 py-1 rounded-lg border transition-all ${
                                isSelected
                                  ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/15 shadow-sm'
                                  : 'border-gray-100 bg-gray-50/80 hover:bg-white hover:border-gray-200'
                              }`}
                              style={act.category ? { borderLeftColor: catBorderColor(act.category) || undefined, borderLeftWidth: '3px' } : undefined}
                            >
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-[10px] shrink-0">{sportBadge(act.sport)}</span>
                                <span className="truncate text-[9px] font-medium text-gray-700">{act.title || act.name || act.sport || 'Activity'}</span>
                              </div>
                            </button>
                          );
                        })
                      )}
                      {dayActivities.length > 3 && (
                        <div className="text-[8px] text-gray-400 text-center">+{dayActivities.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {weekSummaryAside(true)}
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP layout: selected training shows left-day-list + right-detail-panel */}
      {!isMobile && (selectedTraining ? (
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* Desktop day list - left column */}
          <div className="flex w-full min-w-0 max-w-[min(100%,640px)] flex-col gap-2 lg:col-span-1">
            {weekDays.map((day, idx) => {
              const key = getLocalDateString(day);
              const dayActivities = activitiesByDay.get(key) || [];
              const isToday = isSameDay(day, new Date());

              const dayCard = (
                <div
                  className={`rounded-xl border border-gray-100 bg-custom-gray p-2 sm:p-2.5 ${
                    isToday ? 'border-primary/35 bg-primary/5 shadow-sm ring-1 ring-primary/20' : ''
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className={`text-sm font-bold ${isToday ? 'text-primary' : 'text-gray-800'}`}>
                        {day.getDate()}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {dayNames[idx].substring(0, 3)}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {dayActivities.length === 0 ? (
                      <div className="text-[10px] italic text-gray-400">-</div>
                    ) : (
                      dayActivities.slice(0, 2).map((act, i) => {
                        const activityId = act.id || act._id;
                        const isSelected = selectedTraining && (
                          (selectedTraining.id && String(activityId) === String(selectedTraining.id)) ||
                          (selectedTraining._id && String(activityId) === String(selectedTraining._id))
                        );
                        return (
                          <button
                            key={i}
                            onClick={() => handleActivityClick(act)}
                            className={`w-full rounded-lg border px-1.5 py-1 text-left transition-colors ${
                              isSelected
                                ? 'border-primary/40 bg-white text-gray-900 shadow-sm ring-1 ring-primary/15'
                                : 'border-gray-100/80 bg-white/90 text-gray-800 hover:border-gray-200 hover:bg-white'
                            }`}
                            style={act.category ? { borderColor: catBorderColor(act.category) || undefined, borderLeftWidth: '3px' } : undefined}
                            title={act.title || act.name || 'Activity'}
                          >
                            <div className="mb-0.5 flex items-center justify-between gap-1">
                              <div className="flex min-w-0 flex-1 items-center gap-1">
                                <span className="text-xs">{sportBadge(act.sport)}</span>
                                <span className="truncate text-[10px] font-medium">{act.title || act.name || 'Activity'}</span>
                              </div>
                              {act.category && (
                                <div className="flex-shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold" style={catBadgeStyle(act.category)}>
                                  {catLabel(act.category).substring(0, 4)}
                                </div>
                              )}
                            </div>
                            {act.description && (
                              <div className={`truncate text-[8px] ${isSelected ? 'text-gray-600' : 'text-gray-400'}`}>
                                {act.description}
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                    {dayActivities.length > 2 && (
                      <div className="text-center text-[9px] text-gray-400">
                        +{dayActivities.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );

              return (
                <div key={idx}>
                  {dayCard}
                </div>
              );
            })}
          </div>

          {/* Training Details - Right Side */}
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 shadow-md p-2 sm:p-3 md:p-4 lg:col-span-5"
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
                    hideCategory
                    hideTitle
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
                            onOpenLactateForm={handleOpenLactateForm}
                          />
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
        /* Desktop no-training: 7-col grid */
        <div className="grid w-full min-w-0 gap-2 sm:gap-3 [grid-template-columns:repeat(7,minmax(0,1fr))_minmax(10.5rem,0.95fr)]">
          {weekDays.map((day, idx) => {
            const key = getLocalDateString(day);
            const dayActivities = activitiesByDay.get(key) || [];
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={idx}
                className={`min-w-0 rounded-xl border border-gray-100 bg-custom-gray p-2 sm:p-2.5 ${
                  isToday ? 'border-primary/35 bg-primary/5 shadow-sm ring-1 ring-primary/20' : ''
                }`}
              >
                <div className="flex flex-col items-center mb-2">
                  <div className={`text-base font-bold ${isToday ? 'text-primary' : 'text-text'}`}>
                    {day.getDate()}
                  </div>
                  <div className="text-xs text-lighterText">
                    {dayNames[idx]}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {dayActivities.length === 0 ? (
                    <div className="text-xs text-lighterText italic text-center">-</div>
                  ) : (
                    dayActivities.map((act, i) => {
                      return (
                        <button
                          key={i}
                          onClick={() => handleActivityClick(act)}
                          className="w-full rounded-lg border border-gray-100/90 bg-white/90 px-2 py-1.5 text-left text-gray-800 transition-colors hover:border-gray-200 hover:bg-white"
                          style={act.category ? { borderColor: catBorderColor(act.category) || undefined, borderLeftWidth: '3px' } : undefined}
                          title={act.title || act.name || 'Activity'}
                        >
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <div className="flex items-center gap-1 flex-1 min-w-0">
                              <span className="text-sm">{sportBadge(act.sport)}</span>
                              <span className="truncate font-medium text-xs">{act.title || act.name || 'Activity'}</span>
                            </div>
                            {act.category && (
                              <div className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 border font-semibold" style={catBadgeStyle(act.category)}>
                                {catLabel(act.category)}
                              </div>
                            )}
                          </div>
                          {act.description && (
                            <div className="text-[9px] text-lighterText truncate">
                              {act.description}
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
          <div className="min-w-0 flex flex-col justify-start">{weekSummaryAside(false)}</div>
        </div>
      ))}

      {/* MOBILE: Training detail bottom-sheet portal */}
      {isMobile && selectedTraining && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setSelectedTraining(null);
              setTrainingDetail(null);
              setIsEditingTitle(false);
              setIsEditingCategory(false);
            }}
          />
          {/* Sheet panel */}
          <div className="relative z-10 bg-white rounded-t-2xl shadow-2xl flex flex-col" style={{ maxHeight: '90dvh' }}>
            {/* Drag handle */}
            <div className="shrink-0 pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            {/* Header */}
            <div className="shrink-0 px-4 pb-3 border-b border-gray-100">
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5 shrink-0">{sportBadge(trainingDetail?.sport || selectedTraining?.sport)}</span>
                <div className="flex-1 min-w-0">
                  {/* Title */}
                  {isEditingTitle ? (
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                        autoFocus
                      />
                      <button
                        onClick={async () => {
                          try {
                            setSaving(true);
                            const title = editingTitle.trim();
                            if (trainingDetail.type === 'fit' && trainingDetail._id) {
                              await updateFitTraining(trainingDetail._id, { title });
                              const detail = await getFitTraining(trainingDetail._id);
                              setTrainingDetail({ ...detail, type: 'fit' });
                              setSelectedTraining(prev => prev ? { ...prev, title, titleManual: title } : null);
                              if (onActivityUpdate) onActivityUpdate({ type: 'fit', _id: trainingDetail._id, id: `fit-${trainingDetail._id}`, title, titleManual: title });
                            } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                              await updateStravaActivity(trainingDetail.id, { title });
                              setSelectedTraining(prev => prev ? { ...prev, title, titleManual: title, name: title } : null);
                              if (onActivityUpdate) onActivityUpdate({ type: 'strava', id: trainingDetail.id, stravaId: trainingDetail.id, title, titleManual: title, name: title });
                            }
                            setIsEditingTitle(false);
                          } catch (error) { console.error('Error saving title:', error); }
                          finally { setSaving(false); }
                        }}
                        disabled={saving}
                        className="shrink-0 p-1.5 text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setIsEditingTitle(false); setEditingTitle(trainingDetail?.title || trainingDetail?.name || ''); }}
                        className="shrink-0 p-1.5 text-gray-400 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <h3
                      className="text-base font-bold text-gray-900 mb-2 cursor-pointer"
                      onClick={() => { setEditingTitle(trainingDetail?.title || trainingDetail?.name || ''); setIsEditingTitle(true); }}
                    >
                      {trainingDetail?.linkedTrainingTitle || trainingDetail?.title || trainingDetail?.name || selectedTraining?.title || selectedTraining?.name || 'Training'}
                    </h3>
                  )}
                  {/* Category */}
                  {isEditingCategory ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={editingCategory}
                        onChange={(e) => setEditingCategory(e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                              const detail = await getFitTraining(trainingDetail._id);
                              setTrainingDetail({ ...detail, type: 'fit' });
                              if (onActivityUpdate) onActivityUpdate({ type: 'fit', _id: trainingDetail._id, id: `fit-${trainingDetail._id}`, category });
                            } else if (trainingDetail.type === 'strava' && trainingDetail.id) {
                              await updateStravaActivity(trainingDetail.id, { category: category || null });
                              if (onActivityUpdate) onActivityUpdate({ type: 'strava', id: trainingDetail.id, stravaId: trainingDetail.id, category });
                            }
                            setIsEditingCategory(false);
                          } catch (error) { console.error('Error saving category:', error); }
                          finally { setSaving(false); }
                        }}
                        disabled={saving}
                        className="shrink-0 p-1.5 text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setIsEditingCategory(false); setEditingCategory(trainingDetail?.category || ''); }}
                        className="shrink-0 p-1.5 text-gray-400 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingCategory(trainingDetail?.category || ''); setIsEditingCategory(true); }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer"
                      style={catBadgeStyle(trainingDetail?.category)}
                    >
                      {trainingDetail?.category ? catLabel(trainingDetail.category) : '+ Category'}
                    </button>
                  )}
                </div>
                {/* Close button */}
                <button
                  onClick={() => {
                    setSelectedTraining(null);
                    setTrainingDetail(null);
                    setIsEditingTitle(false);
                    setIsEditingCategory(false);
                  }}
                  className="shrink-0 p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {loadingDetail ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : trainingDetail ? (
                <div className="p-4 space-y-4">
                  <TrainingStats
                    training={trainingDetail}
                    user={user}
                    hideCategory
                    hideTitle
                    onUpdate={async () => {
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
                              if (isSwim && laps.length === 0) laps = generateSwimLapsFromRecords(records);
                              setTrainingDetail({
                                ...selectedTraining, type: 'strava', records, laps,
                                totalElapsedTime: detail.detail.elapsed_time || 0,
                                totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                totalDistance: detail.detail.distance || 0,
                                avgPower: detail.detail.average_watts || null, maxPower: detail.detail.max_watts || null,
                                avgHeartRate: detail.detail.average_heartrate || null, maxHeartRate: detail.detail.max_heartrate || null,
                                avgSpeed: detail.detail.average_speed || null, maxSpeed: detail.detail.max_speed || null,
                                avgCadence: detail.detail.average_cadence || null, maxCadence: detail.detail.max_cadence || null,
                                sport: trainingDetail.sport || detail.detail.type || 'cycling',
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
                      } catch (error) { console.error('Error reloading training detail:', error); }
                    }}
                  />
                  {trainingDetail.laps && trainingDetail.laps.length > 0 && (
                    <LapsTable
                      training={trainingDetail}
                      onUpdate={async () => {
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
                                if (isSwim && laps.length === 0) laps = generateSwimLapsFromRecords(records);
                                setTrainingDetail({
                                  ...selectedTraining, type: 'strava', records, laps,
                                  totalElapsedTime: detail.detail.elapsed_time || 0,
                                  totalTimerTime: detail.detail.moving_time || detail.detail.elapsed_time || 0,
                                  totalDistance: detail.detail.distance || 0,
                                  avgPower: detail.detail.average_watts || null, maxPower: detail.detail.max_watts || null,
                                  avgHeartRate: detail.detail.average_heartrate || null, maxHeartRate: detail.detail.max_heartrate || null,
                                  avgSpeed: detail.detail.average_speed || null, maxSpeed: detail.detail.max_speed || null,
                                  avgCadence: detail.detail.average_cadence || null, maxCadence: detail.detail.max_cadence || null,
                                  sport: trainingDetail.sport || detail.detail.type || 'cycling',
                                  title: trainingDetail.linkedTrainingTitle || trainingDetail.title || detail.detail.name || '',
                                  linkedTrainingTitle: trainingDetail.linkedTrainingTitle || null,
                                  category: detail.category || trainingDetail.category || ''
                                });
                              }
                            }
                          }
                        } catch (error) { console.error('Error reloading training detail:', error); }
                      }}
                      user={user}
                      selectedLapNumber={selectedLapNumber}
                      onSelectLapNumber={setSelectedLapNumber}
                      fullHeight
                      onOpenLactateForm={handleOpenLactateForm}
                    />
                  )}
                  {/* Lactate form loading overlay */}
                  {lactateFormLoading && (
                    <div className="flex items-center justify-center py-6 gap-2 text-sm text-primary">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                      <span>Opening lactate form…</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 text-sm">Loading training details...</div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* TrainingForm portal for lactate entry — rendered above everything */}
      {lactateFormOpen && lactateFormData && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setLactateFormOpen(false); setLactateFormData(null); }}
          />
          <div className="relative z-10 w-full max-w-2xl">
            <TrainingForm
              key={lactateFormData.initialData?.sourceStravaActivityId || 'wc-lac'}
              initialData={lactateFormData.initialData}
              isEditing={false}
              initialSelectedLap={lactateFormData.focusLap != null ? lactateFormData.focusLap + 1 : null}
              onClose={() => { setLactateFormOpen(false); setLactateFormData(null); }}
              onSubmit={handleLactateFormSubmit}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default WeeklyCalendar;
