/**
 * WorkoutExecutionPage
 * ─────────────────────
 * Full-screen workout execution view.
 *
 * Features:
 *  • Step-by-step countdown timer
 *  • Power target display (resolved from FTP/LT1/LT2 context)
 *  • Live power readout from Bluetooth smart trainer
 *  • ERG mode — automatically sends target power to trainer via FTMS
 *  • Step mini-map (scrolling workout overview)
 *  • Manual skip / back step controls
 *  • Saves completed workout on finish
 *
 * Route: /workout-execution/:plannedWorkoutId
 * Also accepts query param ?athleteId= for coach view
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  PlayIcon, PauseIcon, ForwardIcon, BackwardIcon,
  SignalIcon, CheckCircleIcon,
  ArrowLeftIcon, BeakerIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { BoltIcon as BoltSolid } from '@heroicons/react/24/solid';
import { motion, AnimatePresence } from 'framer-motion';
import { getPlannedWorkout, updatePlannedWorkout } from '../services/workoutPlannerApi';
import useBluetoothTrainer from '../hooks/useBluetoothTrainer';
import useBluetoothHeartRate from '../hooks/useBluetoothHeartRate';
import useBluetoothCoreTemp from '../hooks/useBluetoothCoreTemp';
import useWakeLock from '../hooks/useWakeLock';
import * as audioCoach from '../utils/audioCoach';
import LiveWorkoutChart from '../components/WorkoutExecution/LiveWorkoutChart';
import StepBarChart from '../components/WorkoutExecution/StepBarChart';
import MetricTile from '../components/WorkoutExecution/MetricTile';
import PreStartHero from '../components/WorkoutExecution/PreStartHero';
import WorkoutSettingsSheet from '../components/WorkoutExecution/WorkoutSettingsSheet';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { isCapacitorNative } from '../utils/isNativeApp';
import api from '../services/api';
import { useNotification } from '../context/NotificationContext';

// ─── Colours (matching WorkoutBuilder palette) ───────────────────────────────
const STEP_COLORS = {
  warmup:   { bg: '#fbbf24', light: '#fef3c7', text: '#92400e', ring: '#f59e0b' },
  work:     { bg: '#767EB5', light: '#ede9fe', text: '#4c1d95', ring: '#7c3aed' },
  recovery: { bg: '#6ee7b7', light: '#d1fae5', text: '#065f46', ring: '#10b981' },
  cooldown: { bg: '#38bdf8', light: '#e0f2fe', text: '#0c4a6e', ring: '#0ea5e9' },
  rest:     { bg: '#d1d5db', light: '#f3f4f6', text: '#374151', ring: '#9ca3af' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtTime(secs) {
  if (!secs && secs !== 0) return '--:--';
  const abs = Math.abs(Math.round(secs));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const sign = secs < 0 ? '-' : '';
  if (h > 0) return `${sign}${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${sign}${m}:${String(s).padStart(2,'0')}`;
}

function resolveTargetWatts(target, ctx) {
  if (!target || target.type === 'open') return null;
  const { ftp = 250, lt1Power = null, lt2Power = null } = ctx;
  if (target.type === 'watts')       return target.useRange ? Math.round((target.rangeMin+target.rangeMax)/2) : (target.value || 0);
  if (target.type === 'percent_ftp') return Math.round(ftp * ((target.value || 80) / 100));
  if (target.type === 'percent_lt1') return Math.round((lt1Power || ftp * 0.75) * ((target.value || 95) / 100));
  if (target.type === 'percent_lt2') return Math.round((lt2Power || ftp) * ((target.value || 90) / 100));
  if (target.type === 'lt1')         return Math.round(lt1Power || ftp * 0.75);
  if (target.type === 'lt2')         return Math.round(lt2Power || ftp);
  if (target.type === 'zone') {
    const zoneIdx = Math.max(0, Math.min(4, (target.value || 1) - 1));
    const zonePcts = [0.55, 0.68, 0.83, 0.97, 1.10];
    return Math.round(ftp * zonePcts[zoneIdx]);
  }
  return null;
}

function resolveTargetLabel(target, ctx) {
  if (!target || target.type === 'open') return 'Open';
  if (target.type === 'watts')       return target.useRange ? `${target.rangeMin}–${target.rangeMax} W` : `${target.value} W`;
  if (target.type === 'percent_ftp') return `${target.value}% FTP`;
  if (target.type === 'percent_lt1') return `${target.value}% LT1`;
  if (target.type === 'percent_lt2') return `${target.value}% LT2`;
  if (target.type === 'lt1')         return 'LT1';
  if (target.type === 'lt2')         return 'LT2';
  if (target.type === 'zone')        return `Zone ${target.value}`;
  return '';
}

/** Expand repeat groups into flat list for execution */
function expandSteps(steps) {
  if (!Array.isArray(steps)) return [];
  const out = [];
  const visited = new Set();
  steps.forEach(s => {
    if (!s.groupId) { out.push({ ...s }); return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const reps = (group.find(x => x.isGroupHeader)?.groupRepeat) || 1;
    const nonHeaders = group.filter(x => !x.isGroupHeader);
    for (let r = 0; r < reps; r++) {
      nonHeaders.forEach(gs => out.push({ ...gs, _repeatIdx: r + 1, _totalReps: reps, _groupId: gs.groupId }));
    }
  });
  return out;
}

// ─── Power gauge arc ─────────────────────────────────────────────────────────
function PowerGauge({ actual, target, size = 200 }) {
  const r = (size / 2) - 14;
  const cx = size / 2, cy = size / 2;
  const circumference = Math.PI * r; // half circle
  const pct = target > 0 ? Math.min(2, (actual || 0) / target) : 0;
  const dash = circumference * Math.min(1, pct);
  const color = pct < 0.9 ? '#767EB5' : pct < 1.05 ? '#22c55e' : '#ef4444';

  return (
    <svg width={size} height={size / 2 + 20} className="overflow-visible">
      {/* Background track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="#e5e7eb" strokeWidth={10} strokeLinecap="round"
      />
      {/* Filled arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        style={{ transition: 'stroke-dasharray 0.3s ease, stroke 0.3s ease' }}
      />
      {/* Actual power number */}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={size * 0.2} fontWeight="700" fill={color}>
        {actual != null ? Math.round(actual) : '--'}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={size * 0.07} fill="#9ca3af">
        W actual
      </text>
      {target > 0 && (
        <text x={cx} y={cy - size * 0.28} textAnchor="middle" fontSize={size * 0.07} fill="#6b7280">
          target {target} W
        </text>
      )}
    </svg>
  );
}

// ─── Step mini-map bar ────────────────────────────────────────────────────────
function StepMiniMap({ expandedSteps, currentIdx, context }) {
  const total = expandedSteps.reduce((s, st) => s + (st.durationSeconds || 30), 0);
  if (!total) return null;
  return (
    <div className="flex h-6 rounded overflow-hidden w-full gap-px">
      {expandedSteps.map((step, i) => {
        const w = ((step.durationSeconds || 30) / total) * 100;
        const col = STEP_COLORS[step.stepType]?.bg || '#9ca3af';
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        return (
          <div
            key={i}
            style={{
              width: `${w}%`,
              backgroundColor: col,
              opacity: isDone ? 0.35 : isActive ? 1 : 0.6,
              transition: 'opacity 0.3s',
              minWidth: 2,
              outline: isActive ? '2px solid white' : 'none',
              outlineOffset: -1,
            }}
            title={step.label || step.stepType}
          />
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WorkoutExecutionPage() {
  const { plannedWorkoutId } = useParams();
  const [searchParams] = useSearchParams();
  const athleteId = searchParams.get('athleteId');
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  // Mobile-native (Capacitor) gets safe-area padding and slightly tighter
  // typography. Evaluated once on mount — the env doesn't change at runtime.
  const isNative = isCapacitorNative();

  // Workout data
  const [workout, setWorkout] = useState(null);
  const [expandedSteps, setExpandedSteps] = useState([]);
  const [context, setContext] = useState({ ftp: 250, lt1Power: null, lt2Power: null });
  const [loading, setLoading] = useState(true);

  // Execution state
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [stepElapsed, setStepElapsed] = useState(0); // seconds into current step
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [ergMode, setErgMode] = useState(false);
  // ERG bias — multiplier applied to the planned target wattage before
  // sending to the trainer. 1.00 = ride exactly as prescribed, 1.10 = +10 %,
  // 0.90 = −10 %. Useful when the athlete wants a slightly harder/easier
  // session without rebuilding the planned workout. Persists for the entire
  // workout (does not reset on step change).
  const [ergBias, setErgBias] = useState(1.0);
  const ERG_BIAS_STEP = 0.05; // ±5 %
  const ERG_BIAS_MIN  = 0.50;
  const ERG_BIAS_MAX  = 1.50;
  const bumpErgBias = useCallback((delta) => {
    setErgBias((b) => {
      const next = Math.round((b + delta) * 100) / 100;
      return Math.max(ERG_BIAS_MIN, Math.min(ERG_BIAS_MAX, next));
    });
    // Force a re-send on the next ERG effect tick.
    ergSentRef.current = null;
  }, []);
  // Tracks whether the user ever pressed Start. `isRunning` flips to false
  // every time they pause; this flag stays true so we know to show the
  // "active" UI (metrics grid, live chart, etc.) instead of the pre-start
  // hero card.
  const [hasStarted, setHasStarted] = useState(false);
  useEffect(() => {
    if (isRunning) setHasStarted(true);
  }, [isRunning]);

  const timerRef = useRef(null);
  const ergSentRef = useRef(null); // last sent power target (to avoid redundant writes)
  // Power + HR tracking for planned vs actual comparison
  const stepPowerRef = useRef({}); // { [stepIdx]: { sum, count } }
  const stepHrRef    = useRef({}); // { [stepIdx]: { sum, count } }
  const currentStepIdxRef = useRef(0); // mirror of currentStepIdx for closure access

  // ── Lactate input ─────────────────────────────────────────────────────────
  // Inline mid-workout lactate entry. Pressing the "+ Lac" button opens a
  // bottom sheet, the user types a mmol/L value, and we POST it to
  // /api/field-lactate immediately with a timestamp + the current HR/power
  // snapshot + the current step's lap index. Lactate measurements also stack
  // locally so the laps sidebar can show them and they're sent again on
  // finish (linked to the resulting Training doc).
  const [showLactateSheet, setShowLactateSheet] = useState(false);
  const [lactateInput, setLactateInput] = useState('');
  const [lactateNote, setLactateNote] = useState('');
  const [lactateSubmitting, setLactateSubmitting] = useState(false);
  const lactateLogRef = useRef([]); // { value, ts, stepIdx, power, hr, note }

  // ── Live chart sample buffer ──────────────────────────────────────────────
  // 1Hz time-series of {t, power, hr, stepIdx}. Stored in a ref so the
  // common case (pushing a sample each second) doesn't trigger a render
  // for every other state. `chartTick` (1Hz) is the re-render signal for
  // the chart component itself.
  const samplesRef = useRef([]);  // [{ t, power, hr, stepIdx }]
  const [chartTick, setChartTick] = useState(0);
  const [showChart, setShowChart] = useState(true);
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setChartTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  // Sidebar panel showing all laps with running averages. Toggle-driven so
  // mobile users with small screens can hide it; auto-shown on first render
  // for desktop.
  const [showLapsSidebar, setShowLapsSidebar] = useState(false);
  // A bumping counter forces re-render when stepPowerRef / stepHrRef /
  // lactateLogRef mutate (refs alone don't trigger React re-renders, but
  // the sidebar needs to refresh as averages tick forward).
  const [sidebarTick, setSidebarTick] = useState(0);
  useEffect(() => {
    if (!showLapsSidebar || !isRunning) return;
    const t = setInterval(() => setSidebarTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [showLapsSidebar, isRunning]);

  // Bluetooth: trainer + independent HR strap. Many real setups use a
  // dedicated HR strap (Polar/Wahoo/Garmin) even when on a trainer, because
  // strap HR is more accurate than the optional HR field in FTMS Indoor Bike
  // Data. Outdoor/running uses HR-only with no trainer at all.
  const trainer = useBluetoothTrainer();
  const hrStrap = useBluetoothHeartRate();
  const coreTemp = useBluetoothCoreTemp();
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);

  // ── Audio coach + wake lock + auto-pause preferences ──────────────────────
  // All three persist across workouts via localStorage so the athlete sets
  // them once and they stick. Defaults are friendly: audio on, voice on,
  // wake lock on, auto-pause on. The toggles live in the Settings sheet.
  const [audioEnabled, setAudioEnabled] = useState(() => {
    try { return localStorage.getItem('wo_audio') !== '0'; } catch { return true; }
  });
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try { return localStorage.getItem('wo_voice') !== '0'; } catch { return true; }
  });
  const [wakeLockEnabled, setWakeLockEnabled] = useState(() => {
    try { return localStorage.getItem('wo_wakelock') !== '0'; } catch { return true; }
  });
  const [autoPauseEnabled, setAutoPauseEnabled] = useState(() => {
    try { return localStorage.getItem('wo_autopause') !== '0'; } catch { return true; }
  });
  // Mirror preference into the audio module + persist.
  useEffect(() => { audioCoach.setEnabled(audioEnabled); try { localStorage.setItem('wo_audio', audioEnabled ? '1' : '0'); } catch {} }, [audioEnabled]);
  useEffect(() => { audioCoach.setVoiceEnabled(voiceEnabled); try { localStorage.setItem('wo_voice', voiceEnabled ? '1' : '0'); } catch {} }, [voiceEnabled]);
  useEffect(() => { try { localStorage.setItem('wo_wakelock', wakeLockEnabled ? '1' : '0'); } catch {} }, [wakeLockEnabled]);
  useEffect(() => { try { localStorage.setItem('wo_autopause', autoPauseEnabled ? '1' : '0'); } catch {} }, [autoPauseEnabled]);

  // Screen-on hold — active only while the workout is running. Released on
  // finish, pause, or unmount. Re-acquires after a tab-hide → re-show.
  const wakeLock = useWakeLock(wakeLockEnabled && isRunning && !isFinished);

  // ── Auto-pause state ──────────────────────────────────────────────────────
  // Counts the seconds the athlete has been visibly coasting (power < 30W
  // AND cadence < 30 rpm). After STALL_THRESHOLD seconds we flip isRunning
  // off automatically. Activity resumes on the next pedal turn.
  const STALL_THRESHOLD = 10;
  const STALL_POWER = 30;
  const STALL_CADENCE = 30;
  const RESUME_POWER = 50;
  const RESUME_CADENCE = 40;
  const stallSecRef = useRef(0);
  const [autoPausedAt, setAutoPausedAt] = useState(null); // timestamp ms when paused

  // Live HR: prefer the standalone strap when connected (more accurate),
  // fall back to trainer-reported HR. Wrapping `trainer.data` so the rest
  // of the page can read `liveData.heartRate` without caring about source.
  const liveHr = hrStrap.status === 'connected' && hrStrap.data.heartRate != null
    ? hrStrap.data.heartRate
    : trainer.data.heartRate;
  const liveData = useMemo(
    () => ({ ...trainer.data, heartRate: liveHr }),
    [trainer.data, liveHr],
  );

  // ── Load workout + athlete context ──────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [wRes, profileRes] = await Promise.all([
          getPlannedWorkout(plannedWorkoutId),
          api.get(athleteId ? `/test/list/${athleteId}` : '/test').catch(() => ({ data: [] })),
        ]);
        const w = wRes.data || wRes;
        setWorkout(w);
        const steps = expandSteps(w.steps || []);
        setExpandedSteps(steps);

        // Find latest test with power data
        const tests = Array.isArray(profileRes.data) ? profileRes.data : [];
        const sorted = [...tests].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest = sorted.find(t => t.lt2Power || t.ltPower || t.ftp);
        if (latest) {
          setContext({
            ftp: latest.lt2Power || latest.ltPower || latest.ftp || 250,
            lt1Power: latest.lt1Power || null,
            lt2Power: latest.lt2Power || latest.ltPower || null,
          });
        }
      } catch (err) {
        addNotification('Failed to load workout', 'error');
        navigate(-1);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [plannedWorkoutId, athleteId]); // eslint-disable-line

  // ── Current step ─────────────────────────────────────────────────────────────
  const currentStep = expandedSteps[currentStepIdx] || null;
  const currentTargetWatts = useMemo(() =>
    currentStep?.powerTarget ? resolveTargetWatts(currentStep.powerTarget, context) : null,
    [currentStep, context]);

  const stepDuration = currentStep?.durationSeconds || 0;
  const stepRemaining = Math.max(0, stepDuration - stepElapsed);

  // Total workout duration
  const totalDuration = useMemo(() =>
    expandedSteps.reduce((s, st) => s + (st.durationSeconds || 0), 0),
    [expandedSteps]);

  // ── Live-chart auxiliary data ───────────────────────────────────────────
  // Cumulative time offset at the start of each step → vertical lines.
  const stepBoundaries = useMemo(() => {
    const out = [];
    let acc = 0;
    for (let i = 0; i < expandedSteps.length; i++) {
      out.push({ t: acc, label: expandedSteps[i].label || expandedSteps[i].stepType });
      acc += expandedSteps[i].durationSeconds || 0;
    }
    return out;
  }, [expandedSteps]);

  // Lactate sample markers — re-derived from the ref each render (cheap;
  // arrays stay tiny). chartTick is in the deps so the chart updates
  // immediately after a new sample is submitted.
  const lactateMarks = useMemo(
    () => lactateLogRef.current.map((l) => ({ t: l.tElapsed ?? 0, value: l.value })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartTick, isFinished],
  );

  // Target band for the current step (used by the chart to draw a coloured
  // horizontal band). Falls back to a ±5% range when the step uses a single
  // target value rather than a range.
  const currentTargetRange = useMemo(() => {
    const t = currentStep?.powerTarget;
    if (!t || t.type === 'open') return null;
    const center = resolveTargetWatts(t, context);
    if (center == null) return null;
    if (t.useRange) return { min: t.rangeMin || center - 10, max: t.rangeMax || center + 10 };
    return { min: Math.round(center * 0.95), max: Math.round(center * 1.05) };
  }, [currentStep, context]);

  // ── Sync step index ref ──────────────────────────────────────────────────────
  useEffect(() => {
    currentStepIdxRef.current = currentStepIdx;
  }, [currentStepIdx]);

  // ── ERG power sending ─────────────────────────────────────────────────────
  // Effective target = plan × ergBias. So when the athlete taps + to bump to
  // 110 %, the trainer immediately gets the new wattage; when they jump to the
  // next step the new step's target is also biased. `ergSentRef` stores the
  // last value we wrote, so a redundant write is skipped (cheap deduplication).
  const effectiveErgWatts = useMemo(() => {
    if (currentTargetWatts == null) return null;
    return Math.max(0, Math.round(currentTargetWatts * ergBias));
  }, [currentTargetWatts, ergBias]);

  useEffect(() => {
    if (!ergMode || trainer.status !== 'connected') return;
    if (effectiveErgWatts == null) return;
    if (ergSentRef.current === effectiveErgWatts) return;
    ergSentRef.current = effectiveErgWatts;
    trainer.setPower(effectiveErgWatts);
  }, [ergMode, effectiveErgWatts, trainer.status]); // eslint-disable-line

  // ── Accumulate actual power per step ─────────────────────────────────────────
  useEffect(() => {
    if (!isRunning || trainer.data.power == null) return;
    const idx = currentStepIdxRef.current;
    const prev = stepPowerRef.current[idx] || { sum: 0, count: 0 };
    stepPowerRef.current[idx] = { sum: prev.sum + trainer.data.power, count: prev.count + 1 };
  }, [trainer.data.power, isRunning]); // eslint-disable-line

  // ── Accumulate actual HR per step (from whichever source is live) ─────────
  useEffect(() => {
    if (!isRunning || liveHr == null) return;
    const idx = currentStepIdxRef.current;
    const prev = stepHrRef.current[idx] || { sum: 0, count: 0 };
    stepHrRef.current[idx] = { sum: prev.sum + liveHr, count: prev.count + 1 };
  }, [liveHr, isRunning]); // eslint-disable-line

  // ── Lactate submit ──────────────────────────────────────────────────────────
  const handleLactateSubmit = useCallback(async () => {
    const raw = String(lactateInput || '').trim().replace(',', '.');
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || value > 30) {
      addNotification('Enter a value between 0.1 and 30 mmol/L', 'error');
      return;
    }
    setLactateSubmitting(true);
    try {
      // Snapshot context at the moment of measurement
      const idx = currentStepIdxRef.current;
      const power = trainer.data.power != null ? Math.round(trainer.data.power) : null;
      const hr = liveHr != null ? Math.round(liveHr) : null;
      const ts = new Date().toISOString();
      const note = lactateNote.trim();

      // Persist immediately to /api/field-lactate so a network blip mid-workout
      // doesn't lose the measurement.
      const body = {
        value,
        recordedAt: ts,
        notes: note
          ? `${note} (workout: ${workout?.title || 'Workout'}, step ${idx + 1})`
          : `Workout: ${workout?.title || 'Workout'}, step ${idx + 1}`,
      };
      if (athleteId) body.athleteId = athleteId;
      await api.post('/api/field-lactate', body);

      // Track locally too so the laps sidebar (next phase) can render and the
      // finish handler can attach it to the resulting Training. `tElapsed`
      // is workout-elapsed seconds at the moment of submission — used by
      // the live chart to position the marker on the time axis.
      lactateLogRef.current.push({
        value,
        ts,
        tElapsed: totalElapsed,
        stepIdx: idx,
        power,
        hr,
        note,
      });

      setLactateInput('');
      setLactateNote('');
      setShowLactateSheet(false);
      addNotification(`Lactate ${value.toFixed(1)} mmol/L saved`, 'success');
    } catch (e) {
      console.error('[lactate] save failed', e);
      addNotification('Failed to save lactate — try again', 'error');
    } finally {
      setLactateSubmitting(false);
    }
  }, [lactateInput, lactateNote, trainer, liveHr, workout, athleteId, addNotification]);

  // ── Live-data refs read inside the timer interval ──────────────────────────
  // Reading these objects directly inside the timer interval was crashing
  // the ticker: putting `trainer` / `liveHr` / `coreTemp` / `context` into
  // the effect's dependency array caused the interval to be torn down and
  // recreated every time the BLE hook re-rendered (which happens on every
  // sensor packet — many times per second). The interval never had time
  // to fire its 1000 ms callback. Result: the on-screen timer stayed at
  // 5:00 even though `isRunning` was true and the pause icon was showing.
  //
  // Fix: mirror the live values into refs that update on every render but
  // don't trigger effect re-runs. The interval reads from the refs and the
  // dependency list is reduced to primitives that legitimately should
  // restart the interval (isRunning, isFinished, stepDuration, etc.).
  const trainerRef = useRef(trainer);
  const liveHrRef = useRef(liveHr);
  const coreTempRef = useRef(coreTemp);
  const contextRef = useRef(context);
  const autoPauseEnabledRef = useRef(autoPauseEnabled);
  const expandedStepsRef = useRef(expandedSteps);
  useEffect(() => { trainerRef.current = trainer; }, [trainer]);
  useEffect(() => { liveHrRef.current = liveHr; }, [liveHr]);
  useEffect(() => { coreTempRef.current = coreTemp; }, [coreTemp]);
  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { autoPauseEnabledRef.current = autoPauseEnabled; }, [autoPauseEnabled]);
  useEffect(() => { expandedStepsRef.current = expandedSteps; }, [expandedSteps]);

  // ── Timer tick ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning || isFinished) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      const trainerNow = trainerRef.current;
      const liveHrNow = liveHrRef.current;
      const coreTempNow = coreTempRef.current;
      const contextNow = contextRef.current;
      const expandedStepsNow = expandedStepsRef.current;
      // ── Auto-pause check ──────────────────────────────────────────────
      // Detects coasting / stop. We tally seconds where both metrics sit
      // below the floor, then flip running off after STALL_THRESHOLD.
      // Skipped when the trainer isn't streaming data (no live source ⇒
      // can't tell coasting from a regular outdoor lull).
      if (autoPauseEnabledRef.current && trainerNow.status === 'connected') {
        const pw = trainerNow.data.power;
        const cd = trainerNow.data.cadence;
        const stalled =
          (pw == null || pw < STALL_POWER) &&
          (cd == null || cd < STALL_CADENCE);
        if (stalled) {
          stallSecRef.current += 1;
          if (stallSecRef.current >= STALL_THRESHOLD) {
            // Pause now — keep the elapsed counters frozen by returning
            // BEFORE the increments below.
            setIsRunning(false);
            setAutoPausedAt(Date.now());
            stallSecRef.current = 0;
            return;
          }
        } else {
          stallSecRef.current = 0;
        }
      }

      setStepElapsed(prev => {
        const next = prev + 1;
        // ── Audio cues: 3-2-1 countdown to end of step ──
        if (stepDuration > 0) {
          const remaining = stepDuration - next;
          if (remaining === 3 || remaining === 2 || remaining === 1) {
            audioCoach.beep(880, 80);
          }
        }
        // Auto-advance step when duration reached
        if (stepDuration > 0 && next >= stepDuration) {
          setCurrentStepIdx(idx => {
            const nextIdx = idx + 1;
            if (nextIdx >= expandedStepsNow.length) {
              setIsRunning(false);
              setIsFinished(true);
              audioCoach.cues.finished();
              return idx;
            }
            ergSentRef.current = null; // force re-send for next step
            // ── Audio: voice prompt for the upcoming step ──
            const ns = expandedStepsNow[nextIdx];
            if (ns) {
              const nsTarget = ns.powerTarget ? resolveTargetWatts(ns.powerTarget, contextNow) : null;
              const min = Math.floor((ns.durationSeconds || 0) / 60);
              const sec = (ns.durationSeconds || 0) % 60;
              const durPhrase = min > 0
                ? (sec > 0 ? `${min} minute${min > 1 ? 's' : ''} ${sec} seconds` : `${min} minute${min > 1 ? 's' : ''}`)
                : `${sec} seconds`;
              const label = ns.label || ns.stepType || 'next step';
              const targetPhrase = nsTarget ? ` at ${nsTarget} watts` : '';
              audioCoach.beep(1320, 180, 0.5);                       // step-start chime
              audioCoach.speak(`${label}, ${durPhrase}${targetPhrase}`);
            }
            return nextIdx;
          });
          return 0; // reset elapsed for new step
        }
        return next;
      });
      setTotalElapsed(t => {
        const next = t + 1;
        // Push a sample into the live-chart buffer for this second.
        // Power may legitimately be 0 (coasting), so use `?? null` not `|| null`.
        samplesRef.current.push({
          t: next,
          power: trainerNow.data.power != null ? Math.round(trainerNow.data.power) : null,
          hr: liveHrNow != null ? Math.round(liveHrNow) : null,
          // Optional CORE body-temp + heat-strain index, captured only when
          // the sensor is paired. Two-decimal °C precision matches CORE's
          // native granularity.
          coreTemp: coreTempNow.data?.coreTemp != null ? Number(coreTempNow.data.coreTemp.toFixed(2)) : null,
          hsi: coreTempNow.data?.hsi != null ? Number(coreTempNow.data.hsi.toFixed(1)) : null,
          stepIdx: currentStepIdxRef.current,
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // Only primitives in deps — see "Live-data refs read inside the timer
    // interval" comment above for why we read trainer/liveHr/coreTemp via refs.
  }, [isRunning, isFinished, stepDuration, expandedSteps.length]);

  // ── Off-target beep ──────────────────────────────────────────────────────
  // Separate effect (not inside the 1-second timer) so we can sample power at
  // its own native cadence and throttle to one beep per 5 s. Only fires when
  // the workout is running, the target is non-open, and a trainer is live.
  const lastOffTargetBeepRef = useRef(0);
  useEffect(() => {
    if (!isRunning || isFinished) return;
    if (!audioEnabled) return;
    if (trainer.status !== 'connected') return;
    if (trainer.data.power == null) return;
    const t = effectiveErgWatts != null ? effectiveErgWatts : currentTargetWatts;
    if (!t) return;
    const off = (trainer.data.power - t) / t;
    if (Math.abs(off) < 0.2) return;
    const now = Date.now();
    if (now - lastOffTargetBeepRef.current < 5000) return;
    lastOffTargetBeepRef.current = now;
    if (off > 0) audioCoach.cues.overTarget();
    else         audioCoach.cues.underTarget();
  }, [trainer.data.power, isRunning, isFinished, audioEnabled, trainer.status, effectiveErgWatts, currentTargetWatts]);

  // ── Auto-resume from auto-pause ──────────────────────────────────────────
  // When auto-paused, watch for the athlete starting to pedal again. Power
  // OR cadence past their resume floors flips isRunning back on — no manual
  // tap needed. Also clears the auto-pause indicator.
  useEffect(() => {
    if (!autoPausedAt || isRunning || isFinished) return;
    const pw = trainer.data.power;
    const cd = trainer.data.cadence;
    if ((pw != null && pw >= RESUME_POWER) || (cd != null && cd >= RESUME_CADENCE)) {
      setIsRunning(true);
      setAutoPausedAt(null);
      stallSecRef.current = 0;
    }
  }, [trainer.data.power, trainer.data.cadence, autoPausedAt, isRunning, isFinished]);

  // ── Controls ─────────────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    if (isFinished) return;
    // First Play tap is the canonical user-gesture for iOS audio unlock.
    audioCoach.unlock();
    // Manual pause/resume also clears any auto-pause overlay so a tap
    // brings the athlete straight back into the workout.
    setAutoPausedAt(null);
    stallSecRef.current = 0;
    setIsRunning(r => !r);
  }, [isFinished]);

  const handleNextStep = useCallback(() => {
    if (currentStepIdx >= expandedSteps.length - 1) return;
    ergSentRef.current = null;
    setCurrentStepIdx(i => i + 1);
    setStepElapsed(0);
  }, [currentStepIdx, expandedSteps.length]);

  const handlePrevStep = useCallback(() => {
    if (currentStepIdx === 0) { setStepElapsed(0); return; }
    ergSentRef.current = null;
    setCurrentStepIdx(i => i - 1);
    setStepElapsed(0);
  }, [currentStepIdx]);

  // ── Finish ───────────────────────────────────────────────────────────────────
  const handleFinish = useCallback(async () => {
    try {
      const executionData = {
        totalDuration: totalElapsed,
        completedAt: new Date().toISOString(),
        steps: expandedSteps.map((s, i) => {
          const p = stepPowerRef.current[i];
          const h = stepHrRef.current[i];
          // Lactate values recorded *during* this step (might be more than one
          // per step if the athlete sampled at multiple points).
          const lactates = lactateLogRef.current
            .filter((l) => l.stepIdx === i)
            .map((l) => ({ value: l.value, ts: l.ts, power: l.power, hr: l.hr, note: l.note }));
          return {
            stepType: s.stepType,
            label: s.label || s.stepType,
            durationSeconds: s.durationSeconds,
            targetWatts: s.powerTarget ? resolveTargetWatts(s.powerTarget, context) : null,
            actualAvgWatts: p && p.count > 0 ? Math.round(p.sum / p.count) : null,
            actualAvgHr: h && h.count > 0 ? Math.round(h.sum / h.count) : null,
            lactates,
          };
        }),
        lactateMeasurements: lactateLogRef.current.slice(),
        // 1Hz time-series — power + HR per second. Downsampled to 5 s
        // intervals before storage if the buffer is large (>1800 points =
        // 30 min) so the planned-workout doc doesn't balloon. Anyone who
        // needs full 1Hz can build a Training doc separately later.
        timeSeries: (() => {
          const arr = samplesRef.current;
          if (!arr.length) return [];
          const stride = arr.length > 1800 ? 5 : 1;
          const out = [];
          for (let i = 0; i < arr.length; i += stride) out.push(arr[i]);
          if (arr.length && (arr.length - 1) % stride !== 0) out.push(arr[arr.length - 1]);
          return out;
        })(),
      };
      await updatePlannedWorkout(plannedWorkoutId, { status: 'completed', executionData });
      addNotification('Workout completed! Great job!', 'success');
    } catch (_) {}
    if (trainer.status === 'connected') trainer.disconnect();
    if (hrStrap.status === 'connected') hrStrap.disconnect();
    if (coreTemp.status === 'connected') coreTemp.disconnect();
    navigate(athleteId ? `/workout-planner?athleteId=${athleteId}` : '/workout-planner');
  }, [plannedWorkoutId, athleteId, trainer, hrStrap, navigate, addNotification, totalElapsed, expandedSteps, context]);

  // ── Abandon ──────────────────────────────────────────────────────────────────
  const handleAbandon = useCallback(() => {
    if (trainer.status === 'connected') trainer.disconnect();
    if (hrStrap.status === 'connected') hrStrap.disconnect();
    if (coreTemp.status === 'connected') coreTemp.disconnect();
    navigate(-1);
  }, [trainer, navigate]);

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading workout…</p>
        </div>
      </div>
    );
  }

  if (!workout || expandedSteps.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-white">
        <div className="text-center">
          <p className="text-gray-400 mb-4">No steps found in this workout.</p>
          <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-lg bg-primary text-white">Go back</button>
        </div>
      </div>
    );
  }

  const col = STEP_COLORS[currentStep?.stepType] || STEP_COLORS.work;
  const nextStep = expandedSteps[currentStepIdx + 1] || null;
  const powerDiff = (trainer.data.power != null && currentTargetWatts != null)
    ? trainer.data.power - currentTargetWatts : null;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 flex flex-col bg-gray-950 text-white overflow-hidden select-none"
      style={{
        zIndex: 9999,
        // Capacitor: honour the notch / home-indicator. The native layout
        // already hides its top + bottom bars on this route, so the page
        // owns the entire viewport including the safe areas.
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* ── Header — wide tap targets (44 × 44 minimum on phones) ───────── */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-white/10 gap-1">
        <button
          onClick={handleAbandon}
          aria-label="Exit workout"
          className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-white/10 active:bg-white/15 transition-colors"
          style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
        >
          <ArrowLeftIcon className="w-6 h-6" />
        </button>
        <div className="flex-1 text-center min-w-0">
          <h1 className="text-sm font-bold truncate px-2">{workout.title || 'Workout'}</h1>
          <p className="text-xs text-gray-400 tabular-nums">{fmtTime(totalElapsed)} / {fmtTime(totalDuration)}</p>
        </div>
        <div className="flex items-center gap-0.5">
          {/* Chart toggle — 44 × 44 tap target on phones */}
          {!isFinished && (
            <button
              onClick={() => setShowChart((s) => !s)}
              aria-label={showChart ? 'Hide live chart' : 'Show live chart'}
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-all ${
                showChart
                  ? 'bg-primary/20 text-primary'
                  : 'text-gray-400 hover:bg-white/10 active:bg-white/15'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
              title={showChart ? 'Hide live chart' : 'Show live chart'}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 7-7" />
              </svg>
            </button>
          )}
          {/* Laps sidebar toggle */}
          {!isFinished && (
            <button
              onClick={() => setShowLapsSidebar((s) => !s)}
              aria-label="Show all steps"
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-all ${
                showLapsSidebar
                  ? 'bg-primary/20 text-primary'
                  : 'text-gray-400 hover:bg-white/10 active:bg-white/15'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
              title="Show all steps"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          {/* Lactate sample button — opens bottom sheet */}
          {!isFinished && (
            <button
              onClick={() => setShowLactateSheet(true)}
              aria-label="Record a lactate sample"
              className="h-11 min-w-11 flex items-center justify-center gap-1 px-2 rounded-lg border border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 active:bg-amber-400/30 transition-all"
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
              title="Record a lactate sample"
            >
              <BeakerIcon className="w-4 h-4" />
              <span className="text-xs font-bold hidden xs:inline">+ Lac</span>
              {lactateLogRef.current.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0 rounded-full bg-amber-400/30 text-[10px] font-bold">
                  {lactateLogRef.current.length}
                </span>
              )}
            </button>
          )}
          {/* Settings — opens bottom sheet with devices + ERG + display
              toggles. Replaces the old inline ERG pill which crowded the
              header on phones. ERG state still surfaces visually: when
              ERG is on we recolour the gear so the user can see it without
              opening the sheet. */}
          {!isFinished && (
            <button
              onClick={() => setShowSettingsSheet(true)}
              aria-label="Workout settings"
              className={`w-11 h-11 flex items-center justify-center rounded-lg transition-all relative ${
                ergMode
                  ? 'bg-primary/20 text-primary'
                  : 'text-gray-400 hover:bg-white/10 active:bg-white/15'
              }`}
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
              title="Settings · devices · ERG"
            >
              <Cog6ToothIcon className="w-6 h-6" />
              {ergMode && (
                <span className="absolute -top-0.5 -right-0.5 text-[8px] font-black tabular-nums bg-primary text-white rounded-full px-1 leading-tight">
                  {Math.round(ergBias * 100)}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Workout profile bar chart ───────────────────────────────────────
          Replaces the old uniform-colour mini-map. Bar HEIGHT communicates
          interval intensity (target watts), bar WIDTH communicates duration
          — so the user instantly sees the workout shape (warm-up ramp,
          sprint blocks, cool-down) and where they are in it.
          Hidden on the finished screen — the summary chart below covers that. */}
      {!isFinished && (
      <div className="px-3 sm:px-4 pt-1.5 pb-2">
        <StepBarChart
          steps={expandedSteps}
          currentIdx={currentStepIdx}
          stepElapsed={stepElapsed}
          resolveTargetWatts={resolveTargetWatts}
          context={context}
          stepPowerRef={stepPowerRef}
          lactateLogRef={lactateLogRef}
          onStepTap={(i) => {
            ergSentRef.current = null;
            setCurrentStepIdx(i);
            setStepElapsed(0);
          }}
          height={isNative ? 78 : 90}
        />
      </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────────
          Phone portrait: vertical stack (tiles → step → gauge → chart).
          Tablet / landscape (md+): the chart breaks out into a wider
          panel via its own `md:max-w-3xl`, while the centred column with
          countdown + gauge stays compact. The grid layout below keeps it
          simple by relying on flex centring + max-widths instead of a
          true two-column grid that would over-engineer the small-screen
          case. */}
      <div
        className="flex-1 flex flex-col items-center justify-start lg:justify-center px-4 sm:px-6 lg:px-10 gap-3 sm:gap-4 overflow-y-auto py-3 sm:py-4"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {isFinished ? (
          /* ── Finished screen ── */
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <CheckCircleIcon className="w-20 h-20 text-green-400 mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-2">Workout Complete!</h2>
            <p className="text-gray-400 mb-2">Total time: {fmtTime(totalElapsed)}</p>
            <p className="text-gray-400 mb-6">{expandedSteps.length} steps completed</p>

            {/* Summary chart of the entire workout */}
            {samplesRef.current.length > 0 && (
              <div className="w-full max-w-2xl lg:max-w-4xl mx-auto mb-6 rounded-2xl border border-white/5 bg-white/[0.02] px-2 py-2">
                <LiveWorkoutChart
                  samples={samplesRef.current}
                  currentT={totalElapsed}
                  stepBoundaries={stepBoundaries}
                  lactateMarks={lactateMarks}
                  currentStepTarget={null}
                  windowSec={-1}
                  height={170}
                />
              </div>
            )}

            <button
              onClick={handleFinish}
              className="px-8 py-3 bg-primary rounded-2xl text-white font-bold text-lg hover:bg-primary/80 transition-colors"
            >
              Save & Finish
            </button>
          </motion.div>
        ) : !hasStarted ? (
          /* ── PRE-START SCREEN — Tacx-style hero card + metric tiles ──── */
          <PreStartHero
            firstStep={expandedSteps[0]}
            targetWatts={expandedSteps[0]?.powerTarget ? resolveTargetWatts(expandedSteps[0].powerTarget, context) : null}
            targetLabel={resolveTargetLabel(expandedSteps[0]?.powerTarget, context)}
            workoutTitle={workout?.title}
            workoutDuration={totalDuration}
            onStart={() => {
              // Unlock audio on the first user gesture — iOS Safari /
              // WKWebView keep the AudioContext suspended until then.
              audioCoach.unlock();
              setIsRunning(true);
            }}
            onExit={handleAbandon}
            onSettings={() => setErgMode((e) => !e)}
            stepColors={{
              warmup:   { bar: '#fbbf24', edge: '#f59e0b' },
              work:     { bar: '#a78bfa', edge: '#7c3aed' },
              recovery: { bar: '#22c55e', edge: '#16a34a' },
              cooldown: { bar: '#38bdf8', edge: '#0ea5e9' },
              rest:     { bar: '#9ca3af', edge: '#6b7280' },
            }}
            metricsSlot={(
              <div className="grid grid-cols-2 gap-2.5 h-full">
                <MetricTile
                  label="WATT"
                  value={trainer.data.power != null ? Math.round(trainer.data.power) : null}
                  icon={<BoltSolid className="w-3.5 h-3.5" />}
                  accent="#a78bfa"
                />
                <MetricTile
                  label="BPM"
                  value={liveHr != null ? Math.round(liveHr) : null}
                  icon={<span className="text-base leading-none">♥</span>}
                  accent="#fb7185"
                />
                <MetricTile
                  label="RPM"
                  value={trainer.data.cadence != null ? Math.round(trainer.data.cadence) : null}
                  accent="#38bdf8"
                />
                <MetricTile
                  label="KM/H"
                  value={trainer.data.speed != null ? trainer.data.speed.toFixed(1) : null}
                  accent="#34d399"
                />
              </div>
            )}
          />
        ) : (
          <>
            {/* ── METRIC TILES ROW (live) ─────────────────────────────────
                Compact horizontal strip at the top of the active view —
                4 always-on readings the athlete glances at most. Stays at
                the top of the column so it doesn't shift when the live
                chart resizes underneath. */}
            <div className="w-full max-w-2xl lg:max-w-4xl grid grid-cols-4 gap-2 mb-1">
              <MetricTile
                compact
                label="WATT"
                value={trainer.data.power != null ? Math.round(trainer.data.power) : null}
                icon={<BoltSolid className="w-3 h-3" />}
                accent="#a78bfa"
                trend={(() => {
                  const denom = ergMode && effectiveErgWatts ? effectiveErgWatts : currentTargetWatts;
                  if (denom == null || trainer.data.power == null || denom === 0) return null;
                  return `${Math.round((trainer.data.power / denom) * 100)}% target`;
                })()}
                trendColor={(() => {
                  const denom = ergMode && effectiveErgWatts ? effectiveErgWatts : currentTargetWatts;
                  if (denom == null || trainer.data.power == null || denom === 0) return null;
                  const off = Math.abs(trainer.data.power / denom - 1);
                  return off <= 0.05 ? '#34d399' : off <= 0.15 ? '#fbbf24' : '#fb7185';
                })()}
              />
              <MetricTile
                compact
                label="BPM"
                value={liveHr != null ? Math.round(liveHr) : null}
                icon={<span className="text-sm leading-none">♥</span>}
                accent="#fb7185"
              />
              <MetricTile
                compact
                label="RPM"
                value={trainer.data.cadence != null ? Math.round(trainer.data.cadence) : null}
                accent="#38bdf8"
              />
              <MetricTile
                compact
                label="KM/H"
                value={trainer.data.speed != null ? trainer.data.speed.toFixed(1) : null}
                accent="#34d399"
              />
            </div>

            {/* Extra CORE row when the sensor is connected. Kept out of the
                main 4-tile strip so phones without the sensor don't waste
                vertical space on a permanent --. */}
            {coreTemp.status === 'connected' && coreTemp.data?.coreTemp != null && (
              <div className="w-full max-w-2xl lg:max-w-4xl grid grid-cols-2 sm:grid-cols-3 gap-2 mb-1">
                <MetricTile
                  compact
                  label="CORE °C"
                  value={coreTemp.data.coreTemp.toFixed(2)}
                  accent="#f97316"
                  trend={coreTemp.data.hsi != null ? `HSI ${coreTemp.data.hsi.toFixed(1)}` : null}
                />
                {coreTemp.data.skinTemp != null && (
                  <MetricTile
                    compact
                    label="SKIN °C"
                    value={coreTemp.data.skinTemp.toFixed(2)}
                    accent="#fb923c"
                  />
                )}
              </div>
            )}

            {/* ── Active workout main grid ──────────────────────────────────
                Desktop landscape (lg+): two columns — left is the countdown
                + power gauge + targets, right is the live chart taking full
                column height. Phones / tablets portrait stack vertically.
                Goal: see every metric + the chart without scrolling on a
                normal laptop / iPad screen. */}
            <div className="w-full max-w-5xl xl:max-w-6xl grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-4 lg:gap-6 items-start">
            <div className="flex flex-col items-center gap-3 sm:gap-4 min-w-0">
            {/* ── Current step badge ── */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStepIdx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="text-center w-full max-w-sm"
              >
                <div
                  className="inline-block px-4 py-1 rounded-full text-sm font-bold mb-3 uppercase tracking-wider"
                  style={{ backgroundColor: col.bg + '33', color: col.bg, border: `1.5px solid ${col.bg}40` }}
                >
                  {currentStep?.label || currentStep?.stepType || 'Step'}
                  {currentStep?._repeatIdx && (
                    <span className="ml-2 opacity-60">Rep {currentStep._repeatIdx}/{currentStep._totalReps}</span>
                  )}
                </div>

                {/* Countdown — 6xl on phones (saves vertical space when both
                    the chart and the power gauge are visible), 7xl on
                    tablets+. Cap at 7xl on desktop too — going larger pushes
                    the power gauge below the fold. */}
                <div
                  className={`font-black tabular-nums leading-none mb-2 text-6xl sm:text-7xl`}
                  style={{ color: stepRemaining <= 10 && stepRemaining > 0 ? '#ef4444' : col.bg }}
                >
                  {stepDuration > 0 ? fmtTime(stepRemaining) : fmtTime(stepElapsed)}
                </div>
                {stepDuration > 0 && (
                  <p className="text-gray-500 text-xs sm:text-sm mb-3">of {fmtTime(stepDuration)}</p>
                )}

                {/* Power target — when ERG bias is non-100 %, show the new
                    value bold + the original prescribed wattage struck-through
                    next to it, so the athlete sees both numbers at a glance.
                    "240 ⚡ 264 W · 95% LT2  +10%" reads as
                    "the plan said 240, you're biased to 264, that's +10%". */}
                {currentTargetWatts != null && (() => {
                  const isBiased = ergMode && Math.abs(ergBias - 1) > 1e-3 && effectiveErgWatts != null;
                  const biasUp = ergBias > 1;
                  return (
                    <div className="flex items-center justify-center gap-2 mb-1 flex-wrap">
                      {isBiased && (
                        <span className="text-sm font-semibold text-gray-500 line-through tabular-nums">
                          {currentTargetWatts}
                        </span>
                      )}
                      <BoltSolid className="w-5 h-5" style={{ color: col.bg }} />
                      <span className="text-2xl font-bold tabular-nums" style={{ color: col.bg }}>
                        {isBiased ? effectiveErgWatts : currentTargetWatts} W
                      </span>
                      <span className="text-gray-500 text-sm">
                        {resolveTargetLabel(currentStep?.powerTarget, context)}
                      </span>
                      {isBiased && (
                        <span
                          className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-md"
                          style={{
                            color: biasUp ? '#fb7185' : '#34d399',
                            background: (biasUp ? '#fb7185' : '#34d399') + '22',
                          }}
                        >
                          {biasUp ? '+' : ''}{Math.round((ergBias - 1) * 100)}%
                        </span>
                      )}
                    </div>
                  );
                })()}
                {currentStep?.powerTarget?.useRange && (
                  <p className="text-gray-500 text-sm">
                    {currentStep.powerTarget.rangeMin}–{currentStep.powerTarget.rangeMax} W
                  </p>
                )}
              </motion.div>
            </AnimatePresence>

            {/* ── Intensity % chip — quick read of "how hard am I going relative to target" ──
                When ERG bias ≠ 100 %, compare against the biased target so the
                chip shows compliance with the modified ride, not the original plan. */}
            {trainer.status === 'connected' && trainer.data.power != null && currentTargetWatts != null && currentTargetWatts > 0 && (() => {
              const denom = ergMode && effectiveErgWatts ? effectiveErgWatts : currentTargetWatts;
              const pct = Math.round((trainer.data.power / denom) * 100);
              const off = Math.abs(pct - 100);
              const tone = off <= 5
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                : off <= 15
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                  : 'bg-rose-500/25 text-rose-300 border-rose-400/40';
              return (
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold tabular-nums ${tone}`}>
                  <span>{pct}%</span>
                  <span className="opacity-60">of target</span>
                </div>
              );
            })()}

            {/* ── Auto-pause indicator — small badge between the intensity
                chip and the power gauge so it never blocks the gauge but
                is impossible to miss. Disappears the moment power /
                cadence cross the resume floor. */}
            {autoPausedAt && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-amber-400/50 bg-amber-500/15 text-amber-200"
              >
                <span className="text-base">⏸</span>
                <span className="text-xs font-bold uppercase tracking-wider">Auto-paused</span>
                <span className="text-[11px] opacity-70">— pedal to resume</span>
              </motion.div>
            )}

            {/* ── Power Gauge (Bluetooth) ── */}
            {trainer.status === 'connected' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-xs">
                <PowerGauge
                  actual={trainer.data.power}
                  target={currentTargetWatts}
                  size={isNative ? 180 : 220}
                />
                <div className="flex justify-center gap-6 mt-1 text-xs text-gray-500">
                  {trainer.data.cadence != null && (
                    <span>{Math.round(trainer.data.cadence)} rpm</span>
                  )}
                  {liveHr != null && (
                    <span className={hrStrap.status === 'connected' ? 'text-rose-300' : ''}>
                      ♥ {Math.round(liveHr)} bpm
                    </span>
                  )}
                  {powerDiff != null && Math.abs(powerDiff) > 5 && (
                    <span style={{ color: powerDiff > 0 ? '#ef4444' : '#22c55e' }}>
                      {powerDiff > 0 ? '+' : ''}{Math.round(powerDiff)} W
                    </span>
                  )}
                </div>
              </motion.div>
            )}

            </div>{/* end LEFT column */}

            {/* ── RIGHT column: Live chart (power + HR over time) ──
                Always rendered on desktop (placeholder when no samples yet)
                so the right column reserves its space and the left column
                doesn't shift after the first second of recording. On phones
                the chart stacks below the gauge as before. */}
            <div className="w-full min-w-0">
              {showChart && (
                <div
                  className="w-full rounded-2xl border border-white/5 bg-white/[0.02] px-2 py-2"
                  data-tick={chartTick}
                  style={{ minHeight: 180 }}
                >
                  {samplesRef.current.length > 0 ? (
                    <LiveWorkoutChart
                      samples={samplesRef.current}
                      currentT={totalElapsed}
                      stepBoundaries={stepBoundaries}
                      lactateMarks={lactateMarks}
                      currentStepTarget={currentTargetRange}
                      windowSec={300}
                      height={isNative ? 200 : 280}
                    />
                  ) : (
                    <div className="flex items-center justify-center text-xs text-gray-500" style={{ height: 180 }}>
                      Live chart will appear after the first second of data.
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>{/* end main grid */}

            {/* ── Next step preview ── */}
            {nextStep && (
              <div className="text-center text-sm text-gray-500">
                Next: <span className="text-gray-300 font-medium">
                  {nextStep.label || nextStep.stepType}
                </span>
                {nextStep.durationSeconds > 0 && (
                  <span className="ml-1">· {fmtTime(nextStep.durationSeconds)}</span>
                )}
                {nextStep.powerTarget && resolveTargetWatts(nextStep.powerTarget, context) && (() => {
                  const plain = resolveTargetWatts(nextStep.powerTarget, context);
                  const biased = ergMode && Math.abs(ergBias - 1) > 1e-3
                    ? Math.round(plain * ergBias)
                    : null;
                  return (
                    <span className="ml-1 text-gray-400 tabular-nums">
                      @
                      {biased != null && (
                        <span className="line-through opacity-70 mx-1">{plain}</span>
                      )}
                      <span className={biased != null ? 'text-gray-200 font-semibold' : ''}>
                        {biased ?? plain}
                      </span>
                      <span className="ml-0.5">W</span>
                    </span>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────────
          Hidden on the pre-start screen because the hero card already has its
          own big Start Now / Exit / Settings cluster. Reappears once the
          athlete is in active or paused mode. */}
      {!isFinished && hasStarted && (
        <div className={`px-4 sm:px-6 ${isNative ? 'pb-4 pt-3' : 'pb-6 pt-4'} border-t border-white/10`}>
          <div className="flex items-center justify-center gap-5 sm:gap-6">
            {/* Prev step */}
            <button
              onClick={handlePrevStep}
              disabled={currentStepIdx === 0 && stepElapsed === 0}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/25 disabled:opacity-30 transition-colors"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <BackwardIcon className="w-6 h-6" />
            </button>

            {/* Play/Pause — smaller on phone (saves space for chart) */}
            <button
              onClick={handlePlayPause}
              className={`${isNative ? 'w-16 h-16' : 'w-20 h-20'} rounded-full flex items-center justify-center text-white font-bold shadow-lg transition-all active:scale-95`}
              style={{ backgroundColor: col.bg, boxShadow: `0 0 30px ${col.bg}55`, WebkitTapHighlightColor: 'transparent' }}
            >
              {isRunning
                ? <PauseIcon className={isNative ? 'w-7 h-7' : 'w-9 h-9'} />
                : <PlayIcon className={`${isNative ? 'w-7 h-7' : 'w-9 h-9'} ml-1`} />
              }
            </button>

            {/* Next step */}
            <button
              onClick={handleNextStep}
              disabled={currentStepIdx >= expandedSteps.length - 1}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/25 disabled:opacity-30 transition-colors"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <ForwardIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Compact device summary — shows which devices are connected
              without crowding the control area. Tap any pill (or the
              "Connect devices" link) to jump straight into the settings
              sheet where everything is connectable. */}
          <div className="flex justify-center items-center gap-2 mt-3 flex-wrap text-xs">
            {trainer.status === 'connected' && (
              <button onClick={() => setShowSettingsSheet(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                style={{ WebkitTapHighlightColor: 'transparent' }}>
                <SignalIcon className="w-3.5 h-3.5" /> Trainer
              </button>
            )}
            {hrStrap.status === 'connected' && (
              <button onClick={() => setShowSettingsSheet(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300"
                style={{ WebkitTapHighlightColor: 'transparent' }}>
                <span>♥</span> {liveHr != null && <span className="font-bold tabular-nums">{Math.round(liveHr)}</span>}
              </button>
            )}
            {coreTemp.status === 'connected' && (
              <button onClick={() => setShowSettingsSheet(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-orange-500/40 bg-orange-500/10 text-orange-300"
                style={{ WebkitTapHighlightColor: 'transparent' }}>
                CORE {coreTemp.data?.coreTemp != null && <span className="font-bold tabular-nums">{coreTemp.data.coreTemp.toFixed(1)}°</span>}
              </button>
            )}
            {/* "Connect devices" only when at least one device is not yet
                connected. Clear, single-tap entry into the settings sheet. */}
            {(trainer.status !== 'connected' || hrStrap.status !== 'connected' || coreTemp.status !== 'connected') && (
              <button
                onClick={() => setShowSettingsSheet(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.04] text-gray-300 hover:bg-white/10 active:bg-white/15 transition-colors"
                style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
              >
                <SignalIcon className="w-3.5 h-3.5" />
                Connect devices
              </button>
            )}
          </div>
          {(trainer.error || hrStrap.error || coreTemp.error) && (
            <p className="text-xs text-red-400 mt-1 text-center">
              {trainer.error || hrStrap.error || coreTemp.error}
            </p>
          )}
        </div>
      )}

      {/* ── Laps sidebar ─────────────────────────────────────────────────────
          Slide-in from the right, lists all expanded steps with planned target,
          actual averages (power + HR) accumulated so far, and any lactate
          measurements recorded during that step. Tapping a row jumps the
          workout to that step. */}
      <AnimatePresence>
        {showLapsSidebar && !isFinished && (
          <motion.div
            data-tick={sidebarTick}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLapsSidebar(false)}
            className="fixed inset-0 z-[9998] bg-black/40 flex justify-end"
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm h-full bg-gray-900 border-l border-white/10 overflow-y-auto flex flex-col"
              style={{
                WebkitOverflowScrolling: 'touch',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}
            >
              {/* Header sits BELOW the notch — the close button must be tappable.
                  paddingTop on the sticky header pushes content down by the
                  safe-area amount but keeps the bar's background painted up
                  to the top of the viewport (covering the status bar nicely). */}
              <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur px-3 pb-2.5 border-b border-white/10 flex items-center justify-between"
                style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}
              >
                <h3 className="text-sm font-bold text-white pl-1">All Steps</h3>
                <button
                  onClick={() => setShowLapsSidebar(false)}
                  aria-label="Close steps list"
                  className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 text-white"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
              <div className="px-2 py-2 space-y-1">
                {expandedSteps.map((s, i) => {
                  const c = STEP_COLORS[s.stepType] || STEP_COLORS.work;
                  const isCurrent = i === currentStepIdx;
                  const isPast = i < currentStepIdx;
                  const target = s.powerTarget ? resolveTargetWatts(s.powerTarget, context) : null;
                  const biasedTarget = target != null && ergMode && Math.abs(ergBias - 1) > 1e-3
                    ? Math.round(target * ergBias)
                    : null;
                  const p = stepPowerRef.current[i];
                  const h = stepHrRef.current[i];
                  const avgP = p && p.count > 0 ? Math.round(p.sum / p.count) : null;
                  const avgH = h && h.count > 0 ? Math.round(h.sum / h.count) : null;
                  const stepLactates = lactateLogRef.current.filter((l) => l.stepIdx === i);
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        ergSentRef.current = null;
                        setCurrentStepIdx(i);
                        setStepElapsed(0);
                        setShowLapsSidebar(false);
                      }}
                      className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors ${
                        isCurrent
                          ? 'bg-white/10 border-white/30'
                          : isPast
                            ? 'bg-white/[0.02] border-white/5 opacity-70'
                            : 'border-white/10 hover:bg-white/5'
                      }`}
                      style={{ borderLeftColor: c.bg, borderLeftWidth: 3 }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-gray-500 tabular-nums">{i + 1}.</span>
                            <span className="text-xs font-bold text-white truncate">
                              {s.label || s.stepType}
                            </span>
                            {s._repeatIdx && (
                              <span className="text-[9px] text-gray-500">
                                {s._repeatIdx}/{s._totalReps}
                              </span>
                            )}
                            {isCurrent && (
                              <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-primary">
                                Now
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 tabular-nums">
                            <span>{fmtTime(s.durationSeconds)}</span>
                            {target != null && (
                              <>
                                <span className="text-gray-600">·</span>
                                {biasedTarget != null && (
                                  <span className="text-gray-500 line-through mr-0.5 tabular-nums">{target}</span>
                                )}
                                <span className="font-semibold tabular-nums" style={{ color: c.bg }}>
                                  {biasedTarget ?? target} W
                                </span>
                              </>
                            )}
                          </div>
                          {/* Actual averages — only show when we have data */}
                          {(avgP != null || avgH != null) && (
                            <div className="flex items-center gap-3 mt-1 text-[10px] tabular-nums">
                              {avgP != null && (
                                <span className={`font-semibold ${
                                  target != null && Math.abs(avgP - target) > target * 0.07
                                    ? 'text-orange-400'
                                    : 'text-emerald-400'
                                }`}>
                                  ⌀ {avgP} W
                                </span>
                              )}
                              {avgH != null && (
                                <span className="text-rose-400 font-semibold">♥ {avgH}</span>
                              )}
                            </div>
                          )}
                          {/* Lactate samples in this step */}
                          {stepLactates.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {stepLactates.map((l, li) => (
                                <span key={li} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 text-[10px] font-bold tabular-nums">
                                  <BeakerIcon className="w-2.5 h-2.5" />
                                  {l.value.toFixed(1)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Workout settings bottom sheet — devices + ERG + display ──────── */}
      <WorkoutSettingsSheet
        open={showSettingsSheet}
        onClose={() => setShowSettingsSheet(false)}
        trainer={trainer}
        hrStrap={hrStrap}
        coreTemp={coreTemp}
        liveHr={liveHr}
        ergMode={ergMode}
        setErgMode={setErgMode}
        ergBias={ergBias}
        bumpErgBias={bumpErgBias}
        ergStep={ERG_BIAS_STEP}
        ergMin={ERG_BIAS_MIN}
        ergMax={ERG_BIAS_MAX}
        showChart={showChart}
        setShowChart={setShowChart}
        showLapsSidebar={showLapsSidebar}
        setShowLapsSidebar={setShowLapsSidebar}
        audioEnabled={audioEnabled}
        setAudioEnabled={setAudioEnabled}
        voiceEnabled={voiceEnabled}
        setVoiceEnabled={setVoiceEnabled}
        wakeLockEnabled={wakeLockEnabled}
        setWakeLockEnabled={setWakeLockEnabled}
        wakeLockSupported={wakeLock.supported}
        autoPauseEnabled={autoPauseEnabled}
        setAutoPauseEnabled={setAutoPauseEnabled}
      />

      {/* ── Lactate bottom sheet ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showLactateSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !lactateSubmitting && setShowLactateSheet(false)}
            className="fixed inset-0 z-[10000] bg-black/60 flex items-end justify-center"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-gray-900 border border-white/10 rounded-t-3xl p-5 pb-[max(20px,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Record Lactate</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Step {currentStepIdx + 1} · {fmtTime(totalElapsed)}
                  </p>
                </div>
                <button
                  onClick={() => setShowLactateSheet(false)}
                  disabled={lactateSubmitting}
                  className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 disabled:opacity-50"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Snapshot of current power / HR — what the value will be tagged with */}
              <div className="flex items-center gap-4 mb-4 px-3 py-2 rounded-xl bg-white/5 text-xs text-gray-400">
                {trainer.data.power != null && (
                  <span>
                    <BoltSolid className="w-3 h-3 inline -mt-0.5 text-amber-400" /> {Math.round(trainer.data.power)} W
                  </span>
                )}
                {liveHr != null && (
                  <span>♥ {Math.round(liveHr)} bpm</span>
                )}
                {(trainer.data.power == null && liveHr == null) && (
                  <span>No live data — value will be saved with current time only.</span>
                )}
              </div>

              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Lactate (mmol/L)
              </label>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={lactateInput}
                onChange={(e) => setLactateInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleLactateSubmit(); }}
                placeholder="e.g. 2.4"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-2xl font-bold text-white text-center placeholder-gray-600 focus:outline-none focus:border-amber-400/60 focus:bg-white/10 tabular-nums"
              />

              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-3 mb-1.5">
                Note (optional)
              </label>
              <input
                type="text"
                value={lactateNote}
                onChange={(e) => setLactateNote(e.target.value)}
                placeholder="e.g. end of 3rd interval"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-400/40"
              />

              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setShowLactateSheet(false)}
                  disabled={lactateSubmitting}
                  className="flex-1 py-3 rounded-xl border border-white/15 text-gray-300 font-semibold text-sm hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLactateSubmit}
                  disabled={lactateSubmitting || !lactateInput.trim()}
                  className="flex-2 py-3 px-6 rounded-xl bg-amber-500 text-white font-bold text-sm hover:bg-amber-400 disabled:opacity-50 transition-colors"
                  style={{ flex: 2 }}
                >
                  {lactateSubmitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
