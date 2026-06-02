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
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  PlayIcon, PauseIcon, ForwardIcon, BackwardIcon,
  SignalIcon, CheckCircleIcon,
  ArrowLeftIcon, BeakerIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { BoltIcon as BoltSolid } from '@heroicons/react/24/solid';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getPlannedWorkout,
  completePlannedWorkout,
  downloadPlannedWorkoutFit,
} from '../services/workoutPlannerApi';
import { getIntegrationStatus } from '../services/api';
import * as audioCoach from '../utils/audioCoach';
import { useWorkoutSession } from '../context/WorkoutSessionContext';
import LiveWorkoutChart from '../components/WorkoutExecution/LiveWorkoutChart';
import StepBarChart from '../components/WorkoutExecution/StepBarChart';
import MetricTile from '../components/WorkoutExecution/MetricTile';
import PreStartHero from '../components/WorkoutExecution/PreStartHero';
import WorkoutSettingsSheet from '../components/WorkoutExecution/WorkoutSettingsSheet';
import MobileSwipeViews from '../components/WorkoutExecution/MobileSwipeViews';
import WorkoutStatsPanel, { getPowerZoneIdx, getHrZoneIdx, POWER_ZONE_DEFS, HR_ZONE_DEFS } from '../components/WorkoutExecution/WorkoutStatsPanel';
import { Swiper, SwiperSlide } from 'swiper/react';
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

function zoneMid(z) {
  if (!z) return null;
  if (z.min != null && z.max != null && isFinite(z.max)) return (z.min + z.max) / 2;
  return z.min ?? null;
}

function resolveTargetWatts(target, ctx) {
  if (!target || target.type === 'open') return null;
  const { ftp = 250, lt1Power = null, lt2Power = null, cyclingZones = null } = ctx;
  if (target.type === 'watts')       return target.useRange ? Math.round((target.rangeMin+target.rangeMax)/2) : (target.value || 0);
  if (target.type === 'percent_ftp') return Math.round(ftp * ((target.value || 80) / 100));
  if (target.type === 'percent_lt1') return Math.round((lt1Power || ftp * 0.75) * ((target.value || 95) / 100));
  if (target.type === 'percent_lt2') return Math.round((lt2Power || ftp) * ((target.value || 90) / 100));
  if (target.type === 'lt1')         return Math.round(lt1Power || ftp * 0.75);
  if (target.type === 'lt2')         return Math.round(lt2Power || ftp);
  if (target.type === 'zone') {
    const z = Math.max(1, Math.min(5, target.value || 1));
    // Use actual profile zone midpoint when available — matches Training Zones screen
    const profileMid = cyclingZones ? zoneMid(cyclingZones[`zone${z}`]) : null;
    if (profileMid != null) return Math.round(profileMid);
    const lt2 = lt2Power || ftp;
    const lt1 = lt1Power || ftp * 0.75;
    return Math.round([lt1 * 0.8, lt1, lt2 * 0.95, lt2, lt2 * 1.1][z - 1]);
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

/** Expand repeat groups into a flat list of steps for execution.
 *
 *  IMPORTANT: in the WorkoutBuilder data model, the group HEADER is itself
 *  a real step (typically the WORK interval). The header just carries the
 *  `groupRepeat` count for the whole block — it is NOT a label-only
 *  container. So a "5 × (8 min work + 2 min recovery)" block is stored as
 *
 *      { groupId:G, isGroupHeader:true,  groupRepeat:5,  stepType:'work',     dur:480 }
 *      { groupId:G, isGroupHeader:false,                  stepType:'recovery', dur:120 }
 *
 *  Filtering the header out (an earlier bug here) made the executed
 *  workout just 5 × recovery — no work intervals at all. We now keep the
 *  header and expand the FULL group N times. `isGroupHeader` is stripped
 *  on each emitted copy so downstream code doesn't accidentally treat
 *  every repeat's first step as still being the header.
 */
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
    for (let r = 0; r < reps; r++) {
      group.forEach(gs => out.push({
        ...gs,
        isGroupHeader: false,
        _repeatIdx: r + 1,
        _totalReps: reps,
        _groupId: gs.groupId,
      }));
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

// StepMiniMap was an inline step-progress bar used in an earlier desktop
// layout iteration. The current layout uses StepBarChart instead, so the
// mini-map function is no longer referenced. Removed to silence the
// unused-no-vars warning; reachable in git history if needed back.

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

  // Viewport detection — under lg (1024 px) we switch to the swipeable
  // 4-page layout designed for one-handed phone use. Re-evaluated on
  // every resize / orientation change so an iPad rotation flips between
  // layouts automatically.
  const [isMobileLayout, setIsMobileLayout] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  ));
  const [isLandscape, setIsLandscape] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false
  ));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      setIsMobileLayout(window.innerWidth < 1024);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // Persist which swipe page the user was on so a tab-hide → re-show
  // (or screen lock cycle) doesn't snap them back to page 0.
  const [mobilePageIdx, setMobilePageIdx] = useState(() => {
    try { return Number(localStorage.getItem('wo_mobile_page')) || 1; } catch { return 1; }
  });
  useEffect(() => {
    try { localStorage.setItem('wo_mobile_page', String(mobilePageIdx)); } catch {}
  }, [mobilePageIdx]);

  // ── Workout session — global context owns ALL execution state ──────────
  // The page used to keep this state locally, which meant navigating away
  // (back arrow, banner tap, browser back) tore everything down: BLE
  // disconnected, timer cleared, samples GC'd. We now read it from the
  // app-root WorkoutSessionContext so the session keeps recording even
  // when the page unmounts. The floating ResumeBanner brings the user
  // back without losing the in-progress workout.
  const session = useWorkoutSession();
  const {
    // metadata + steps
    plannedWorkoutId: ctxPid,
    workout, expandedSteps, context,
    // exec state
    currentStep, currentStepIdx, stepElapsed, totalElapsed, totalDuration,
    isRunning, isFinished, hasStarted, autoPausedAt,
    currentTargetWatts, effectiveErgWatts,
    // BLE
    trainer, hrStrap, coreTemp, liveHr,
    // ERG
    ergMode, ergBias, ergStep: ERG_BIAS_STEP, ergMin: ERG_BIAS_MIN, ergMax: ERG_BIAS_MAX,
    // toggles
    audioEnabled, setAudioEnabled,
    voiceEnabled, setVoiceEnabled,
    wakeLockEnabled, setWakeLockEnabled,
    autoPauseEnabled, setAutoPauseEnabled,
    // refs (read-only — same identity across renders)
    samplesRef, stepPowerRef, stepHrRef, lactateLogRef,
    // actions
    startSession, endSession, playPause, nextStep: nextStepAction, prevStep, jumpToStep,
    recordLactate, setErgMode, bumpErgBias, setIsFinished,
  } = session;
  // Loading is still page-local — the page kicks off the data fetch.
  const [loading, setLoading] = useState(true);
  // Step jump used to live as a useCallback — emulate the old name so the
  // existing handlers below don't need renaming.
  const handlePrevStep = prevStep;
  const handleNextStep = nextStepAction;

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
  const [finishSaving, setFinishSaving] = useState(false);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [uploadToStrava, setUploadToStrava] = useState(false);
  const [savedWorkoutId, setSavedWorkoutId] = useState(null);

  useEffect(() => {
    getIntegrationStatus({ athleteId: athleteId || undefined })
      .then((s) => {
        const on = !!s?.stravaConnected;
        setStravaConnected(on);
        if (on) setUploadToStrava(true);
      })
      .catch(() => {});
  }, [athleteId]);

  // ── Live chart re-render signal ─────────────────────────────────────────
  // The actual 1Hz samples buffer lives in the context (samplesRef from
  // destructuring above). chartTick is just a 1Hz counter that forces the
  // chart component to re-render with the latest samples in the ref.
  const [chartTick, setChartTick] = useState(0);
  const [showChart, setShowChart] = useState(true);
  const [chartLayout, setChartLayout] = useState(() => {
    try { return localStorage.getItem('wo_chart_layout') === 'row' ? 'row' : 'stack'; } catch { return 'stack'; }
  });
  useEffect(() => {
    try { localStorage.setItem('wo_chart_layout', chartLayout); } catch { /* */ }
  }, [chartLayout]);

  // Tick while workout is active — must not depend on trainer.connected (HR strap / CORE only still need charts).
  useEffect(() => {
    if (!hasStarted || isFinished) return;
    const id = setInterval(() => setChartTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [hasStarted, isFinished]);

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

  // Settings + Save-End modal state — UI-only, stays page-local.
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  // Wake-lock indicator (only used to pass `supported` to the settings
  // sheet — actual lock is managed by the context provider).
  const wakeLock = { supported: typeof navigator !== 'undefined' && 'wakeLock' in navigator };

  // Combined live data view (trainer power/cadence + best-source HR) is
  // available via `session.liveData` from the context if a future view
  // needs it. The page itself reads trainer.data / liveHr directly, so
  // the local memo was unused and removed.

  // ── Load workout + athlete context ──────────────────────────────────────────
  // If the context already holds an active session for THIS planned workout
  // (e.g. user navigated away and came back via the resume pill), we don't
  // reload — we just bind to what's already running. Otherwise we fetch
  // fresh data and hand it to `startSession`, which becomes the single
  // source of truth from that point on.
  useEffect(() => {
    if (ctxPid && ctxPid === plannedWorkoutId && workout) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const uid = athleteId || null;
        const [wRes, testRes, profileRes] = await Promise.all([
          getPlannedWorkout(plannedWorkoutId),
          api.get(uid ? `/test/list/${uid}` : '/test').catch(() => ({ data: [] })),
          api.get(uid ? `/user/athlete/${uid}/profile` : '/user/profile').catch(() => ({ data: null })),
        ]);
        const w = wRes.data || wRes;
        const steps = expandSteps(w.steps || []);

        // ── Profile zone ranges (primary source for zone targets) ──────────
        const pz = profileRes.data?.powerZones || {};
        const hz = profileRes.data?.heartRateZones || {};
        const cyclingZones    = pz.cycling  || null;
        const runningZones    = pz.running  || null;
        const swimmingZones   = pz.swimming || null;
        const cyclingHrZones  = hz.cycling  || null;
        const maxHrCycling    = cyclingHrZones?.maxHeartRate
          || profileRes.data?.maxHeartRate
          || null;

        // ── Latest test thresholds (fallback when no profile zones) ────────
        // Test model stores:  LT1 → ltPower,  LT2 → lt2Power
        const tests = Array.isArray(testRes.data) ? testRes.data : [];
        const sorted = [...tests].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest = sorted.find(t =>
          t.lt2Power || t.ltPower || t.lt2?.power || t.thresholdOverrides?.LTP2 || t.ftp
        );

        const lt2Power = cyclingZones?.lt2 || cyclingZones?.zone4?.min
          || latest?.lt2Power || latest?.lt2?.power || latest?.thresholdOverrides?.LTP2 || null;
        const lt1Power = cyclingZones?.lt1 || cyclingZones?.zone3?.min
          || latest?.ltPower  || latest?.lt1Power   || latest?.lt1?.power
          || latest?.thresholdOverrides?.LTP1 || null;

        const ctx = {
          lt2Power,
          lt1Power,
          ftp: lt2Power || latest?.ftp || latest?.ltPower || 250,
          lt2Pace:  runningZones?.lt2  || runningZones?.zone4?.min  || null,
          lt1Pace:  runningZones?.lt1  || runningZones?.zone3?.min  || null,
          cyclingZones,
          runningZones,
          swimmingZones,
          cyclingHrZones,
          maxHrCycling,
        };

        startSession({
          plannedWorkoutId,
          athleteId,
          workout: w,
          expandedSteps: steps,
          context: ctx,
        });
      } catch (err) {
        addNotification('Failed to load workout', 'error');
        navigate(-1);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [plannedWorkoutId, athleteId]); // eslint-disable-line

  // ── Derived per-step values ──────────────────────────────────────────────
  // currentStep / currentTargetWatts / totalDuration come from context
  // (see destructuring above). Page only computes UI-local stepRemaining.
  const stepDuration = currentStep?.durationSeconds || 0;
  const stepRemaining = Math.max(0, stepDuration - stepElapsed);

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

  const liveChartProps = useMemo(
    () => ({
      samples: samplesRef.current.slice(),
      currentT: totalElapsed,
      stepBoundaries,
      lactateMarks,
      currentStepTarget: currentTargetRange,
      windowSec: 300,
      layout: chartLayout,
      showCadence: trainer.status === 'connected',
      showCore: coreTemp.status === 'connected',
    }),
    // chartTick — samples live in a ref; slice() gives a new array when tick updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      chartTick,
      totalElapsed,
      stepBoundaries,
      lactateMarks,
      currentTargetRange,
      chartLayout,
      trainer.status,
      coreTemp.status,
    ],
  );

  // NOTE: ERG sending, per-step power/HR accumulation, step-idx ref sync
  // and effectiveErgWatts now all live in WorkoutSessionContext. Don't
  // re-implement here — that caused double-accumulation when the page
  // owned the state.

  // ── Lactate submit ──────────────────────────────────────────────────────────
  // POSTs the value to /api/field-lactate (immediate persistence so a
  // network blip mid-workout doesn't lose it) and pushes it onto the
  // context's lactate log (so the chart marker + finish payload pick it
  // up). The actual logging into the ref-backed list happens in
  // `recordLactate` on the context.
  const handleLactateSubmit = useCallback(async () => {
    const raw = String(lactateInput || '').trim().replace(',', '.');
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0 || value > 30) {
      addNotification('Enter a value between 0.1 and 30 mmol/L', 'error');
      return;
    }
    setLactateSubmitting(true);
    try {
      const ts = new Date().toISOString();
      const note = lactateNote.trim();
      const idx = currentStepIdx;
      const body = {
        value,
        recordedAt: ts,
        notes: note
          ? `${note} (workout: ${workout?.title || 'Workout'}, step ${idx + 1})`
          : `Workout: ${workout?.title || 'Workout'}, step ${idx + 1}`,
      };
      if (athleteId) body.athleteId = athleteId;
      await api.post('/api/field-lactate', body);

      recordLactate({ value, note, ts });

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
  }, [lactateInput, lactateNote, currentStepIdx, workout, athleteId, addNotification, recordLactate]);

  // Timer tick, auto-pause detection, off-target beep, auto-resume from
  // auto-pause, and the play/pause/next/prev handlers all live in
  // WorkoutSessionContext. Page just consumes `playPause` / `upcomingStep` /
  // `prevStep` from there (aliased at the top of this component).
  const handlePlayPause = playPause;

  // ── Finish ───────────────────────────────────────────────────────────────────
  const buildExecutionPayload = useCallback(() => {
    const completedAt = new Date().toISOString();
    const startedAt = new Date(Date.now() - totalElapsed * 1000).toISOString();
    return {
      totalDuration: totalElapsed,
      completedAt,
      startedAt,
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
  }, [totalElapsed, expandedSteps, context, stepPowerRef, stepHrRef, lactateLogRef, samplesRef]);

  const handleFinish = useCallback(async () => {
    if (!plannedWorkoutId || finishSaving) return;
    setFinishSaving(true);
    try {
      const executionData = buildExecutionPayload();
      const result = await completePlannedWorkout(plannedWorkoutId, {
        executionData,
        uploadToStrava: uploadToStrava && stravaConnected,
        athleteId,
      });
      setSavedWorkoutId(plannedWorkoutId);
      try {
        await downloadPlannedWorkoutFit(plannedWorkoutId, {
          athleteId,
          suggestedName: workout?.title || 'workout',
        });
      } catch (dlErr) {
        console.warn('[workout] FIT download failed:', dlErr);
      }
      if (result?.strava?.activityId) {
        addNotification('Workout saved and uploaded to Strava.', 'success');
      } else if (result?.strava?.error) {
        addNotification(`Saved. Strava upload failed: ${result.strava.error}`, 'warning');
      } else if (uploadToStrava && stravaConnected) {
        addNotification('Workout saved. Strava is processing the upload.', 'success');
      } else {
        addNotification('Workout saved with FIT file (laps included).', 'success');
      }
    } catch (e) {
      console.error('[workout] complete failed:', e);
      addNotification(e?.response?.data?.message || 'Failed to save workout', 'error');
      setFinishSaving(false);
      return;
    }
    endSession();
    navigate(athleteId ? `/workout-planner?athleteId=${athleteId}` : '/workout-planner');
  }, [
    plannedWorkoutId, finishSaving, buildExecutionPayload, uploadToStrava, stravaConnected,
    athleteId, workout?.title, addNotification, endSession, navigate,
  ]);

  const handleDownloadFitOnly = useCallback(async () => {
    const id = savedWorkoutId || plannedWorkoutId;
    if (!id) return;
    try {
      await downloadPlannedWorkoutFit(id, { athleteId, suggestedName: workout?.title || 'workout' });
      addNotification('FIT file downloaded.', 'success');
    } catch {
      addNotification('Could not download FIT file.', 'error');
    }
  }, [savedWorkoutId, plannedWorkoutId, athleteId, workout?.title, addNotification]);

  // ── Abandon ──────────────────────────────────────────────────────────────────
  // "Abandon" ends the session for real (vs. just navigating away, which
  // keeps the session alive and shows the resume pill). Used by the
  // confirm-discard flow in the top-left back button.
  const handleAbandon = useCallback(() => {
    endSession();
    navigate(-1);
  }, [navigate, endSession]);

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
  const upcomingStep = expandedSteps[currentStepIdx + 1] || null;

  // ── Live zone labels ────────────────────────────────────────────────────────
  const livePowerZoneLabel = (() => {
    const w = trainer.data.power;
    if (w == null || w <= 0) return null;
    const zi = getPowerZoneIdx(w, context);
    if (zi < 0) return null;
    return POWER_ZONE_DEFS[zi] ? `${POWER_ZONE_DEFS[zi].id} · ${POWER_ZONE_DEFS[zi].label}` : null;
  })();
  const livePowerZoneColor = (() => {
    const w = trainer.data.power;
    if (w == null) return '#a78bfa';
    const zi = getPowerZoneIdx(w, context);
    return POWER_ZONE_DEFS[zi]?.color || '#a78bfa';
  })();
  const liveHrZoneLabel = (() => {
    if (liveHr == null || liveHr <= 0) return null;
    const zi = getHrZoneIdx(liveHr, context);
    if (zi < 0) return null;
    return HR_ZONE_DEFS[zi] ? `${HR_ZONE_DEFS[zi].id} · ${HR_ZONE_DEFS[zi].label}` : null;
  })();
  const liveHrZoneColor = (() => {
    if (liveHr == null) return '#fb7185';
    const zi = getHrZoneIdx(liveHr, context);
    return HR_ZONE_DEFS[zi]?.color || '#fb7185';
  })();
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
        {/* In landscape + active: show live metric chips instead of centred title */}
        {isMobileLayout && isLandscape && hasStarted && !isFinished ? (
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0 px-1">
            {/* Compact title + timer */}
            <div className="text-center min-w-0 flex-shrink-0 max-w-[120px]">
              <p className="text-[11px] font-bold truncate text-white leading-tight">{workout.title || 'Workout'}</p>
              <p className="text-[10px] text-gray-400 tabular-nums">{fmtTime(totalElapsed)} / {fmtTime(totalDuration)}</p>
            </div>
            {/* Live metric chips */}
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {/* Power */}
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/15 border border-violet-500/30">
                <BoltSolid className="w-3 h-3 text-violet-400" />
                <span className="text-sm font-black tabular-nums text-violet-200 leading-none">
                  {trainer.data.power != null ? Math.round(trainer.data.power) : '—'}
                </span>
                <span className="text-[9px] text-violet-400 font-semibold">W</span>
              </div>
              {/* HR */}
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30">
                <span className="text-rose-400 text-xs leading-none">♥</span>
                <span className="text-sm font-black tabular-nums text-rose-200 leading-none">
                  {liveHr != null ? Math.round(liveHr) : '—'}
                </span>
                <span className="text-[9px] text-rose-400 font-semibold">bpm</span>
              </div>
              {/* Cadence */}
              {trainer.status === 'connected' && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/15 border border-sky-500/30">
                  <span className="text-sky-400 text-[10px] leading-none font-bold">↻</span>
                  <span className="text-sm font-black tabular-nums text-sky-200 leading-none">
                    {trainer.data.cadence != null ? Math.round(trainer.data.cadence) : '—'}
                  </span>
                  <span className="text-[9px] text-sky-400 font-semibold">rpm</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 text-center min-w-0">
            <h1 className="text-sm font-bold truncate px-2">{workout.title || 'Workout'}</h1>
            <p className="text-xs text-gray-400 tabular-nums">{fmtTime(totalElapsed)} / {fmtTime(totalDuration)}</p>
          </div>
        )}
        <div className="flex items-center gap-0.5">
          {/* Chart toggle — 44 × 44 tap target on phones */}
          {!isFinished && showChart && (
            <button
              type="button"
              onClick={() => setChartLayout((l) => (l === 'stack' ? 'row' : 'stack'))}
              aria-label={chartLayout === 'stack' ? 'Charts side by side' : 'Charts stacked'}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:bg-white/10 active:bg-white/15 transition-all"
              style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
              title={chartLayout === 'stack' ? 'Side by side' : 'Stacked'}
            >
              {chartLayout === 'stack' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h7v7H4V5zm9 0h7v7h-7V5zM4 14h7v7H4v-7zm9 0h7v7h-7v-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          )}
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
      {!isFinished && !(isMobileLayout && isLandscape && hasStarted) && (
      <div className="px-3 sm:px-4 pt-1.5 pb-2">
        <StepBarChart
          steps={expandedSteps}
          currentIdx={currentStepIdx}
          stepElapsed={stepElapsed}
          resolveTargetWatts={resolveTargetWatts}
          context={context}
          stepPowerRef={stepPowerRef}
          lactateLogRef={lactateLogRef}
          onStepTap={(i) => jumpToStep(i)}
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
        className={`flex-1 flex flex-col min-h-0 ${
          isMobileLayout && isLandscape && hasStarted && !isFinished
            ? 'overflow-hidden'
            : 'items-center justify-start lg:justify-center px-4 sm:px-6 lg:px-10 gap-3 sm:gap-4 overflow-y-auto py-3 sm:py-4'
        }`}
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
                  {...liveChartProps}
                  currentStepTarget={null}
                  windowSec={-1}
                  height={chartLayout === 'row' ? 220 : 280}
                />
              </div>
            )}

            {stravaConnected && (
              <label className="flex items-center justify-center gap-2 mb-4 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={uploadToStrava}
                  onChange={(e) => setUploadToStrava(e.target.checked)}
                  className="rounded border-white/30"
                />
                Upload to Strava after save
              </label>
            )}

            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {savedWorkoutId && (
                <button
                  type="button"
                  onClick={handleDownloadFitOnly}
                  className="px-6 py-3 rounded-2xl border border-white/20 text-white font-semibold hover:bg-white/10"
                >
                  Download FIT
                </button>
              )}
              <button
                type="button"
                onClick={handleFinish}
                disabled={finishSaving}
                className="px-8 py-3 bg-primary rounded-2xl text-white font-bold text-lg hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                {finishSaving ? 'Saving…' : 'Save & Finish'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-3 max-w-sm mx-auto">
              Saves a .fit with one lap per workout step. You can upload to Garmin, TrainingPeaks, or Strava.
            </p>
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
              if (!isRunning) playPause();
            }}
            onExit={handleAbandon}
            // Settings button on the pre-start hero opens the full Settings
            // sheet (devices + ERG + audio + display toggles), not just ERG
            // — matches what the gear in the header does once the workout
            // is running, so the affordance is consistent end-to-end.
            onSettings={() => setShowSettingsSheet(true)}
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
        ) : isMobileLayout && isLandscape ? (
          /* ── MOBILE LANDSCAPE: side-by-side layout ───────────────────────
              Left column (~175px): step bar chart + countdown + target + controls
              Right column (flex-1): big power number + HR + cadence overview */
          <div className="w-full flex-1 flex flex-row min-h-0">
            {/* ── LEFT: chart, step info, playback controls ── */}
            <div className="flex flex-col gap-1.5 px-3 py-2 border-r border-white/10 min-h-0" style={{ width: 212, flexShrink: 0 }}>
              {/* Step bar chart */}
              <StepBarChart
                steps={expandedSteps}
                currentIdx={currentStepIdx}
                stepElapsed={stepElapsed}
                resolveTargetWatts={resolveTargetWatts}
                context={context}
                stepPowerRef={stepPowerRef}
                lactateLogRef={lactateLogRef}
                onStepTap={(i) => jumpToStep(i)}
                height={44}
              />

              {/* Current step badge + countdown */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStepIdx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  <div
                    className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1"
                    style={{ backgroundColor: col.bg + '33', color: col.bg, border: `1.5px solid ${col.bg}40` }}
                  >
                    {currentStep?.label || currentStep?.stepType || 'Step'}
                    {currentStep?._repeatIdx && (
                      <span className="ml-1 opacity-60">{currentStep._repeatIdx}/{currentStep._totalReps}</span>
                    )}
                  </div>
                  <div
                    className="text-[42px] font-black tabular-nums leading-none"
                    style={{ color: stepRemaining <= 10 && stepRemaining > 0 ? '#ef4444' : col.bg }}
                  >
                    {stepDuration > 0 ? fmtTime(stepRemaining) : fmtTime(stepElapsed)}
                  </div>
                  {stepDuration > 0 && (
                    <p className="text-gray-600 text-[10px] mt-0.5">of {fmtTime(stepDuration)}</p>
                  )}
                  {currentTargetWatts != null && (
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <BoltSolid className="w-3.5 h-3.5" style={{ color: col.bg }} />
                      <span className="text-sm font-bold tabular-nums" style={{ color: col.bg }}>
                        {effectiveErgWatts ?? currentTargetWatts} W
                      </span>
                      <span className="text-[10px] text-gray-500 truncate max-w-[60px]">
                        {resolveTargetLabel(currentStep?.powerTarget, context)}
                      </span>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Auto-pause */}
              {autoPausedAt && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-xl border border-amber-400/50 bg-amber-500/15 text-amber-200">
                  <span className="text-xs">⏸</span>
                  <span className="text-[10px] font-bold">Auto-paused</span>
                </div>
              )}

              {/* ERG badge */}
              {ergMode && trainer.status === 'connected' && effectiveErgWatts != null && (
                <div className="flex items-center justify-center gap-1 px-2 py-0.5 rounded-full border border-violet-400/40 bg-violet-500/15 text-violet-300 text-[10px] font-bold">
                  <BoltSolid className="w-2.5 h-2.5" />
                  <span>ERG · {effectiveErgWatts} W</span>
                </div>
              )}

              <div className="flex-1" />

              {/* Playback controls */}
              <div className="flex items-center justify-center gap-2.5">
                <button
                  onClick={handlePrevStep}
                  disabled={currentStepIdx === 0 && stepElapsed === 0}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/25 disabled:opacity-30 transition-colors"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <BackwardIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={handlePlayPause}
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold shadow-lg transition-all active:scale-95"
                  style={{ backgroundColor: col.bg, boxShadow: `0 0 20px ${col.bg}55`, WebkitTapHighlightColor: 'transparent' }}
                >
                  {isRunning
                    ? <PauseIcon className="w-6 h-6" />
                    : <PlayIcon className="w-6 h-6 ml-0.5" />
                  }
                </button>
                <button
                  onClick={handleNextStep}
                  disabled={currentStepIdx >= expandedSteps.length - 1}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/25 disabled:opacity-30 transition-colors"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <ForwardIcon className="w-5 h-5" />
                </button>
                {!isRunning && (
                  <button
                    onClick={() => setShowSaveModal(true)}
                    className="p-2 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 transition-colors"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Device status pills */}
              <div className="flex justify-center items-center gap-1.5 flex-wrap">
                {trainer.status === 'connected' ? (
                  <button
                    onClick={() => setShowSettingsSheet(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px]"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <SignalIcon className="w-3 h-3" /> Trainer
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSettingsSheet(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full border border-white/15 bg-white/[0.04] text-gray-400 text-[10px]"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <SignalIcon className="w-3 h-3" /> Connect
                  </button>
                )}
                {hrStrap.status === 'connected' && liveHr != null && (
                  <button
                    onClick={() => setShowSettingsSheet(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300 text-[10px]"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    ♥ {Math.round(liveHr)}
                  </button>
                )}
              </div>
            </div>

            {/* ── RIGHT: swipeable pages (Numbers · Chart · Steps · Stats) ── */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {/* Page dots */}
              {(() => {
                const LS_PAGES = [
                  { key: 'numbers', label: 'Numbers' },
                  { key: 'chart',   label: 'Chart'   },
                  { key: 'steps',   label: 'Steps'   },
                  { key: 'stats',   label: 'Stats'   },
                ];
                return (
                  <div className="flex items-center justify-center gap-1.5 py-1.5 flex-shrink-0">
                    {LS_PAGES.map((p, i) => (
                      <button
                        key={p.key}
                        onClick={() => setMobilePageIdx(i)}
                        className="flex flex-col items-center gap-0.5 px-2 py-0.5 rounded"
                        style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                      >
                        <span
                          className="rounded-full transition-all"
                          style={{
                            width: mobilePageIdx === i ? 18 : 5,
                            height: 5,
                            background: mobilePageIdx === i ? '#a78bfa' : 'rgba(255,255,255,0.25)',
                          }}
                        />
                        {mobilePageIdx === i && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-primary">
                            {p.label}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* Swiper */}
              <div className="flex-1 min-h-0">
                <Swiper
                  slidesPerView={1}
                  initialSlide={mobilePageIdx < 3 ? mobilePageIdx : 0}
                  onSlideChange={(sw) => setMobilePageIdx(sw.activeIndex)}
                  style={{ width: '100%', height: '100%' }}
                >
                  {/* Page 0 — Numbers */}
                  <SwiperSlide style={{ overflowY: 'auto' }}>
                    <div className="h-full flex flex-col items-center justify-center px-4 py-2 gap-3">
                      {/* Big power */}
                      <div className="text-center">
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-0.5">Power</div>
                        <div
                          className="font-black tabular-nums leading-none"
                          style={{
                            fontSize: 'clamp(60px, 15vw, 104px)',
                            letterSpacing: '-0.04em',
                            color: (() => {
                              const denom = ergMode && effectiveErgWatts ? effectiveErgWatts : currentTargetWatts;
                              if (!denom || trainer.data.power == null) return 'white';
                              const off = Math.abs(trainer.data.power / denom - 1);
                              return off <= 0.05 ? '#34d399' : off <= 0.15 ? '#fbbf24' : '#fb7185';
                            })(),
                          }}
                        >
                          {trainer.data.power != null ? Math.round(trainer.data.power) : '—'}
                        </div>
                        {/* Live power zone label */}
                        {livePowerZoneLabel && (
                          <div className="text-xs font-bold tabular-nums mt-0.5" style={{ color: livePowerZoneColor }}>
                            {livePowerZoneLabel}
                          </div>
                        )}
                        {currentTargetWatts != null && (
                          <div className="text-sm text-gray-400 tabular-nums mt-0.5">
                            target {effectiveErgWatts ?? currentTargetWatts} W
                            <span className="ml-1.5 text-gray-500 text-xs">
                              {resolveTargetLabel(currentStep?.powerTarget, context)}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* HR + Cadence */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Heart Rate</div>
                          <div className="text-[44px] font-black tabular-nums leading-none mt-0.5" style={{ color: liveHrZoneColor }}>
                            {liveHr != null ? Math.round(liveHr) : '—'}
                          </div>
                          <div className="text-[10px] text-gray-600">bpm</div>
                          {liveHrZoneLabel && (
                            <div className="text-[10px] font-bold mt-0.5" style={{ color: liveHrZoneColor }}>
                              {liveHrZoneLabel}
                            </div>
                          )}
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Cadence</div>
                          <div className="text-[44px] font-black text-sky-400 tabular-nums leading-none mt-0.5">
                            {trainer.data.cadence != null ? Math.round(trainer.data.cadence) : '—'}
                          </div>
                          <div className="text-[10px] text-gray-600">rpm</div>
                        </div>
                      </div>
                      {/* Intensity chip */}
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
                      {/* Next step */}
                      {upcomingStep && (
                        <div className="text-center text-[11px] text-gray-500">
                          Next: <span className="text-gray-300 font-medium">{upcomingStep.label || upcomingStep.stepType}</span>
                          {upcomingStep.durationSeconds > 0 && <span className="ml-1">· {fmtTime(upcomingStep.durationSeconds)}</span>}
                          {upcomingStep.powerTarget && resolveTargetWatts(upcomingStep.powerTarget, context) != null && (
                            <span className="ml-1 text-gray-400 tabular-nums">@ {resolveTargetWatts(upcomingStep.powerTarget, context)} W</span>
                          )}
                        </div>
                      )}
                    </div>
                  </SwiperSlide>

                  {/* Page 1 — Live chart */}
                  <SwiperSlide>
                    <div className="h-full flex flex-col px-2 py-2 gap-1.5">
                      <div className="flex-1 min-h-0 rounded-2xl border border-white/5 bg-white/[0.02] px-1 py-1" data-tick={chartTick}>
                        {samplesRef.current.length > 0 ? (
                          <LiveWorkoutChart {...liveChartProps} height={chartLayout === 'row' ? 340 : 300} />
                        ) : (
                          <div className="flex items-center justify-center text-xs text-gray-500 h-full">
                            Chart starts after the first second of data.
                          </div>
                        )}
                      </div>
                    </div>
                  </SwiperSlide>

                  {/* Page 2 — Steps list */}
                  <SwiperSlide style={{ overflowY: 'auto' }}>
                    <div className="h-full overflow-y-auto px-2 py-2 space-y-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                      {expandedSteps.map((s, i) => {
                        const c = STEP_COLORS[s.stepType] || STEP_COLORS.work;
                        const isCur = i === currentStepIdx;
                        const isPast = i < currentStepIdx;
                        const t = s.powerTarget ? resolveTargetWatts(s.powerTarget, context) : null;
                        const p = stepPowerRef.current[i];
                        const avgP = p && p.count > 0 ? Math.round(p.sum / p.count) : null;
                        return (
                          <button
                            key={i}
                            onClick={() => jumpToStep(i)}
                            className={`w-full text-left rounded-xl px-3 py-2 border transition-colors flex flex-col gap-0.5 ${
                              isCur ? 'bg-white/10 border-white/30' : isPast ? 'bg-white/[0.02] border-white/5 opacity-60' : 'border-white/10'
                            }`}
                            style={{ borderLeftColor: c.bg, borderLeftWidth: 3, WebkitTapHighlightColor: 'transparent' }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-500 tabular-nums w-4 text-right">{i + 1}</span>
                              <span className="text-xs font-bold text-white truncate flex-1">{s.label || s.stepType}</span>
                              {isCur && <span className="text-[9px] font-bold uppercase tracking-wider text-primary">Now</span>}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400 tabular-nums pl-6">
                              <span>{fmtTime(s.durationSeconds)}</span>
                              {t != null && <><span className="text-gray-600">·</span><span className="font-semibold" style={{ color: c.bg }}>{t}W</span></>}
                              {avgP != null && <><span className="text-gray-600">·</span><span className="font-bold text-emerald-400">⌀{avgP}W</span></>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </SwiperSlide>

                  {/* Page 3 — Stats */}
                  <SwiperSlide style={{ overflowY: 'auto' }}>
                    <WorkoutStatsPanel
                      samplesRef={samplesRef}
                      context={context}
                      totalElapsed={totalElapsed}
                      tick={chartTick}
                    />
                  </SwiperSlide>
                </Swiper>
              </div>
            </div>
          </div>

        ) : isMobileLayout ? (
          /* ── MOBILE: 4-page swipeable layout ────────────────────────────
              On phones / portrait tablets the screen is too narrow to show
              metric tiles + countdown + gauge + chart at once. We split
              into 4 swipeable pages instead — flick left/right to switch.
              Page dots + labels at the top double as tap targets. */
          <MobileSwipeViews
            initialIndex={mobilePageIdx}
            onIndexChange={setMobilePageIdx}
            renderNumbers={() => (
              <div className="h-full flex flex-col justify-center items-center px-6 py-4">
                {/* Huge live power — read at arm's length */}
                <div className="text-center mb-4">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Power</div>
                  <div className="font-black text-white tabular-nums leading-none" style={{ letterSpacing: '-0.04em', fontSize: 'clamp(80px, 25vw, 120px)' }}>
                    {trainer.data.power != null ? Math.round(trainer.data.power) : '—'}
                  </div>
                  {/* Live power zone */}
                  {livePowerZoneLabel && (
                    <div className="text-sm font-bold mt-0.5" style={{ color: livePowerZoneColor }}>
                      {livePowerZoneLabel}
                    </div>
                  )}
                  <div className="text-sm text-gray-400 tabular-nums mt-0.5">
                    {currentTargetWatts != null && (
                      <>target {effectiveErgWatts ?? currentTargetWatts} W</>
                    )}
                  </div>
                </div>
                {/* HR + Cadence */}
                <div className="grid grid-cols-2 gap-3 w-full max-w-xs mb-4">
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Heart Rate</div>
                    <div className="text-5xl font-black tabular-nums leading-none mt-1" style={{ color: liveHrZoneColor }}>
                      {liveHr != null ? Math.round(liveHr) : '—'}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">bpm</div>
                    {liveHrZoneLabel && (
                      <div className="text-[11px] font-bold mt-0.5" style={{ color: liveHrZoneColor }}>
                        {liveHrZoneLabel}
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Cadence</div>
                    <div className="text-5xl font-black text-sky-400 tabular-nums leading-none mt-1">
                      {trainer.data.cadence != null ? Math.round(trainer.data.cadence) : '—'}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">rpm</div>
                  </div>
                </div>
                {/* Step + countdown small */}
                <div className="text-center mt-2">
                  <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: col.bg }}>
                    {currentStep?.label || currentStep?.stepType}
                  </div>
                  <div className="text-2xl font-bold text-white tabular-nums mt-1">
                    {stepDuration > 0 ? fmtTime(stepRemaining) : fmtTime(stepElapsed)}
                  </div>
                </div>
              </div>
            )}
            renderWorkout={() => (
              <div className="h-full flex flex-col items-center justify-center px-4 py-2 gap-3">
                {/* Metric tiles strip */}
                <div className="w-full grid grid-cols-4 gap-1.5">
                  <MetricTile compact label="WATT" value={trainer.data.power != null ? Math.round(trainer.data.power) : null} accent="#a78bfa" />
                  <MetricTile compact label="BPM"  value={liveHr != null ? Math.round(liveHr) : null} accent="#fb7185" />
                  <MetricTile compact label="RPM"  value={trainer.data.cadence != null ? Math.round(trainer.data.cadence) : null} accent="#38bdf8" />
                  <MetricTile compact label="KM/H" value={trainer.data.speed != null ? trainer.data.speed.toFixed(1) : null} accent="#34d399" />
                </div>
                {coreTemp.status === 'connected' && coreTemp.data?.coreTemp != null && (
                  <div className="w-full grid grid-cols-2 gap-1.5">
                    <MetricTile compact label="CORE °C" value={coreTemp.data.coreTemp.toFixed(2)} accent="#f97316" trend={coreTemp.data.hsi != null ? `HSI ${coreTemp.data.hsi.toFixed(1)}` : null} />
                    {coreTemp.data.skinTemp != null && (
                      <MetricTile compact label="SKIN °C" value={coreTemp.data.skinTemp.toFixed(2)} accent="#fb923c" />
                    )}
                  </div>
                )}
                {/* Step badge + countdown + gauge */}
                <div className="flex-1 flex flex-col items-center justify-center w-full">
                  <div className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2"
                    style={{ backgroundColor: col.bg + '33', color: col.bg, border: `1.5px solid ${col.bg}40` }}>
                    {currentStep?.label || currentStep?.stepType || 'Step'}
                  </div>
                  <div className="text-7xl font-black tabular-nums leading-none mb-1"
                    style={{ color: stepRemaining <= 10 && stepRemaining > 0 ? '#ef4444' : col.bg }}>
                    {stepDuration > 0 ? fmtTime(stepRemaining) : fmtTime(stepElapsed)}
                  </div>
                  {stepDuration > 0 && <p className="text-gray-500 text-xs mb-3">of {fmtTime(stepDuration)}</p>}
                  {currentTargetWatts != null && (
                    <div className="flex items-center gap-1.5 text-xl font-bold mb-3" style={{ color: col.bg }}>
                      <BoltSolid className="w-4 h-4" />
                      <span className="tabular-nums">{effectiveErgWatts ?? currentTargetWatts} W</span>
                    </div>
                  )}
                  {trainer.status === 'connected' && (
                    <PowerGauge actual={trainer.data.power} target={currentTargetWatts} size={180} />
                  )}
                </div>
              </div>
            )}
            renderChart={() => (
              <div className="h-full flex flex-col px-2 py-3 gap-2">
                {/* Compact metric strip on top so chart-page still shows live numbers */}
                <div className="grid grid-cols-3 gap-1.5 flex-shrink-0">
                  <MetricTile compact label="W"     value={trainer.data.power != null ? Math.round(trainer.data.power) : null} accent="#a78bfa" />
                  <MetricTile compact label="BPM"   value={liveHr != null ? Math.round(liveHr) : null} accent="#fb7185" />
                  <MetricTile compact label="RPM"   value={trainer.data.cadence != null ? Math.round(trainer.data.cadence) : null} accent="#38bdf8" />
                </div>
                <div className="flex-1 min-h-0 rounded-2xl border border-white/5 bg-white/[0.02] px-1 py-1" data-tick={chartTick}>
                  {samplesRef.current.length > 0 ? (
                    <LiveWorkoutChart {...liveChartProps} height={chartLayout === 'row' ? 460 : 420} />
                  ) : (
                    <div className="flex items-center justify-center text-xs text-gray-500 h-full">
                      Chart starts after the first second of data.
                    </div>
                  )}
                </div>
              </div>
            )}
            renderSteps={() => (
              <div className="h-full overflow-y-auto px-3 py-3 space-y-1.5" style={{ WebkitOverflowScrolling: 'touch' }}>
                {expandedSteps.map((s, i) => {
                  const c = STEP_COLORS[s.stepType] || STEP_COLORS.work;
                  const isCur = i === currentStepIdx;
                  const isPast = i < currentStepIdx;
                  const t = s.powerTarget ? resolveTargetWatts(s.powerTarget, context) : null;
                  const p = stepPowerRef.current[i];
                  const h = stepHrRef.current[i];
                  const avgP = p && p.count > 0 ? Math.round(p.sum / p.count) : null;
                  const avgH = h && h.count > 0 ? Math.round(h.sum / h.count) : null;
                  const lac = lactateLogRef.current.filter((l) => l.stepIdx === i);
                  return (
                    <button
                      key={i}
                      onClick={() => jumpToStep(i)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors flex flex-col gap-1 ${
                        isCur ? 'bg-white/10 border-white/30' : isPast ? 'bg-white/[0.02] border-white/5 opacity-70' : 'border-white/10 hover:bg-white/5'
                      }`}
                      style={{ borderLeftColor: c.bg, borderLeftWidth: 3, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-500 tabular-nums w-5 text-right">{i + 1}</span>
                        <span className="text-sm font-bold text-white truncate flex-1">{s.label || s.stepType}</span>
                        {isCur && <span className="text-[9px] font-bold uppercase tracking-wider text-primary">Now</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 tabular-nums">
                        <span>{fmtTime(s.durationSeconds)}</span>
                        {t != null && <><span className="text-gray-600">·</span><span className="font-semibold" style={{ color: c.bg }}>{t}W</span></>}
                        {avgP != null && <><span className="text-gray-600">·</span><span className="font-bold text-emerald-400">⌀{avgP}W</span></>}
                        {avgH != null && <span className="text-rose-400 font-semibold">♥{avgH}</span>}
                      </div>
                      {lac.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {lac.map((l, li) => (
                            <span key={li} className="px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 text-[10px] font-bold tabular-nums">
                              {l.value.toFixed(1)}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            renderStats={() => (
              <WorkoutStatsPanel
                samplesRef={samplesRef}
                context={context}
                totalElapsed={totalElapsed}
                tick={chartTick}
              />
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

            {/* ── ERG active badge — shows when ERG is on so the athlete
                can confirm the trainer is receiving power commands without
                opening the settings sheet. Hidden when ERG is off or
                there's no power target for the current step. */}
            {ergMode && trainer.status === 'connected' && (() => {
              const isFtms = trainer.protocol === 'ftms' || trainer.ergCapable;
              if (!isFtms) {
                return (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-rose-400/40 bg-rose-500/15 text-rose-300 text-xs font-bold">
                    <span>⚠</span>
                    <span>ERG: CPS-only — reconnect for ERG support</span>
                  </div>
                );
              }
              if (effectiveErgWatts == null) {
                return (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-400/40 bg-amber-500/15 text-amber-300 text-xs font-bold">
                    <BoltSolid className="w-3 h-3" />
                    <span>ERG on · open step</span>
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-violet-400/40 bg-violet-500/15 text-violet-300 text-xs font-bold">
                  <BoltSolid className="w-3 h-3" />
                  <span>ERG · {effectiveErgWatts} W</span>
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
                      {...liveChartProps}
                      height={chartLayout === 'row' ? (isNative ? 260 : 320) : (isNative ? 200 : 280)}
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
            {upcomingStep && (
              <div className="text-center text-sm text-gray-500">
                Next: <span className="text-gray-300 font-medium">
                  {upcomingStep.label || upcomingStep.stepType}
                </span>
                {upcomingStep.durationSeconds > 0 && (
                  <span className="ml-1">· {fmtTime(upcomingStep.durationSeconds)}</span>
                )}
                {upcomingStep.powerTarget && resolveTargetWatts(upcomingStep.powerTarget, context) && (() => {
                  const plain = resolveTargetWatts(upcomingStep.powerTarget, context);
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
      {!isFinished && hasStarted && !(isMobileLayout && isLandscape) && (
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

            {/* Save & End — only visible when paused (isRunning === false),
                so a casual mid-workout tap can never accidentally terminate
                the session. Opens a confirmation modal that summarises what
                was actually ridden, then the user commits via that modal's
                button. */}
            {!isRunning && (
              <button
                onClick={() => setShowSaveModal(true)}
                aria-label="Save and end workout"
                className="p-3 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 active:bg-emerald-500/40 border border-emerald-500/40 text-emerald-300 transition-colors"
                style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                title="Save and end workout"
              >
                {/* Stop / square icon */}
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            )}
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
                        jumpToStep(i);
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

      {/* ── Save & End modal — summary + confirm ──────────────────────────
          Shown when the user taps the green stop button while paused.
          Renders the same per-step + lactate summary the real "finish"
          handler would save, plus a big Save & Finish button. Cancel
          just dismisses the modal so they can resume. */}
      <AnimatePresence>
        {showSaveModal && !isFinished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSaveModal(false)}
            className="fixed inset-0 z-[10001] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div
              initial={{ y: '100%', opacity: 0.8 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0.8 }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-gray-900 border border-white/10 rounded-t-3xl sm:rounded-3xl flex flex-col"
              style={{
                maxHeight: '85vh',
                paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
              }}
            >
              <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>
              <div className="flex items-center justify-between px-5 pt-3 pb-2 flex-shrink-0">
                <h3 className="text-base font-bold text-white">End Workout?</h3>
                <button
                  onClick={() => setShowSaveModal(false)}
                  aria-label="Cancel"
                  className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/15 text-white"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="px-5 pb-2 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                <p className="text-xs text-gray-400 mb-3">
                  Saving will close this session and store it under the planned workout. The
                  resulting Training will appear in your history with per-step averages and
                  any lactate samples you recorded.
                </p>

                {/* Headline numbers */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Total time</div>
                    <div className="text-xl font-black text-white tabular-nums mt-1">{fmtTime(totalElapsed)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Steps</div>
                    <div className="text-xl font-black text-white tabular-nums mt-1">
                      {Math.min(currentStepIdx + 1, expandedSteps.length)}<span className="text-sm text-gray-500">/{expandedSteps.length}</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">Lactate</div>
                    <div className="text-xl font-black text-amber-300 tabular-nums mt-1">
                      {lactateLogRef.current.length}
                    </div>
                  </div>
                </div>

                {/* Per-step actuals */}
                <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 mb-2">
                  Per step
                </h4>
                <div className="space-y-1.5 mb-4">
                  {expandedSteps.slice(0, currentStepIdx + 1).map((s, i) => {
                    const p = stepPowerRef.current[i];
                    const h = stepHrRef.current[i];
                    const avgP = p && p.count > 0 ? Math.round(p.sum / p.count) : null;
                    const avgH = h && h.count > 0 ? Math.round(h.sum / h.count) : null;
                    const target = s.powerTarget ? resolveTargetWatts(s.powerTarget, context) : null;
                    const lac = lactateLogRef.current.filter((l) => l.stepIdx === i);
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
                        <span className="text-gray-500 tabular-nums w-4 text-right">{i + 1}</span>
                        <span className="text-white truncate flex-1">{s.label || s.stepType}</span>
                        {target != null && (
                          <span className="text-gray-500 tabular-nums">→ {target}W</span>
                        )}
                        {avgP != null && (
                          <span className={`tabular-nums font-bold ${
                            target == null || Math.abs(avgP - target) / target < 0.07 ? 'text-emerald-400' : 'text-amber-400'
                          }`}>{avgP}W</span>
                        )}
                        {avgH != null && (
                          <span className="text-rose-400 tabular-nums">♥{avgH}</span>
                        )}
                        {lac.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[10px] font-bold tabular-nums">
                            {lac.map((l) => l.value.toFixed(1)).join(', ')}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action row */}
              <div className="px-5 pt-2 flex gap-2 flex-shrink-0 border-t border-white/10">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 py-3 rounded-2xl border border-white/15 text-gray-300 font-semibold text-sm hover:bg-white/5 active:bg-white/10"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                >
                  Resume
                </button>
                <button
                  onClick={() => {
                    setShowSaveModal(false);
                    setIsFinished(true);
                  }}
                  className="flex-[2] py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white font-bold text-sm shadow-lg"
                  style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                >
                  Save &amp; Finish
                </button>
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
        effectiveErgWatts={effectiveErgWatts}
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
