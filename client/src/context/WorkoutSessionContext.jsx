/**
 * WorkoutSessionContext
 * ─────────────────────
 * Global, single-instance workout-execution state.
 *
 * The previous architecture kept ALL workout state (timer, BLE hooks,
 * samples buffer, step counters, ERG bias) local to the
 * WorkoutExecutionPage component. That meant the moment the athlete
 * navigated away from /workout-execution/:id (e.g. tapped the back
 * arrow, switched a tab, opened a deep link), every BLE connection
 * tore down, the timer interval cleared, and the samples buffer was
 * GC'd. There was no "background recording" — you couldn't even
 * check the Strava feed mid-warmup.
 *
 * This provider hoists everything to a single instance mounted at the
 * app root. As long as a session is active, the timer keeps ticking,
 * the trainer / HR / CORE BLE hooks keep receiving notifications, and
 * the samples buffer keeps growing. The WorkoutExecutionPage becomes
 * a thin consumer that just renders the current state.
 *
 * Floating ResumeBanner (rendered in NativeLayout / regular Layout)
 * appears on every OTHER route while a session is active, with a
 * single-tap "Resume" button that navigates back to the execution
 * screen. The session also persists a minimal snapshot in
 * localStorage so a hard reload restores the timer / step index /
 * elapsed counters (BLE has to be re-paired manually after a reload —
 * a Capacitor / WKWebView limitation).
 */
import React, {
  createContext, useContext, useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import useBluetoothTrainer from '../hooks/useBluetoothTrainer';
import useBluetoothHeartRate from '../hooks/useBluetoothHeartRate';
import useBluetoothCoreTemp from '../hooks/useBluetoothCoreTemp';
import useWakeLock from '../hooks/useWakeLock';
import * as audioCoach from '../utils/audioCoach';

const Ctx = createContext(null);

const ERG_BIAS_STEP = 0.05;
const ERG_BIAS_MIN  = 0.50;
const ERG_BIAS_MAX  = 1.50;
const STALL_THRESHOLD = 10;
const STALL_POWER = 30;
const STALL_CADENCE = 30;
const RESUME_POWER = 50;
const RESUME_CADENCE = 40;

const SNAPSHOT_KEY = 'lachart_active_workout';

function resolveTargetWatts(target, ctx = {}) {
  if (!target || target.type === 'open') return null;
  const { ftp = 250, lt1Power = null, lt2Power = null } = ctx;
  if (target.type === 'watts')       return target.useRange ? Math.round((target.rangeMin + target.rangeMax) / 2) : (target.value || 0);
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

/** Expand grouped repeat blocks into a flat list of execution steps.
 *  Header is a real step (typically the work interval). See
 *  WorkoutExecutionPage.expandSteps for the rationale. */
function expandSteps(steps) {
  if (!Array.isArray(steps)) return [];
  const out = [];
  const visited = new Set();
  steps.forEach((s) => {
    if (!s.groupId) { out.push({ ...s }); return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter((x) => x.groupId === s.groupId);
    const reps = (group.find((x) => x.isGroupHeader)?.groupRepeat) || 1;
    for (let r = 0; r < reps; r++) {
      group.forEach((gs) => out.push({
        ...gs, isGroupHeader: false,
        _repeatIdx: r + 1, _totalReps: reps, _groupId: gs.groupId,
      }));
    }
  });
  return out;
}

export function WorkoutSessionProvider({ children }) {
  // ── Session metadata ────────────────────────────────────────────────────
  const [plannedWorkoutId, setPlannedWorkoutId] = useState(null);
  const [athleteId, setAthleteId] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [expandedSteps, setExpandedSteps] = useState([]);
  const [context, setContext] = useState({ ftp: 250, lt1Power: null, lt2Power: null });

  // ── Execution state ─────────────────────────────────────────────────────
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [stepElapsed, setStepElapsed] = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [autoPausedAt, setAutoPausedAt] = useState(null);

  // ── ERG ────────────────────────────────────────────────────────────────
  const [ergMode, setErgMode] = useState(false);
  const [ergBias, setErgBias] = useState(1.0);

  // ── Feature toggles (mirrored to localStorage) ─────────────────────────
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
  useEffect(() => { audioCoach.setEnabled(audioEnabled); try { localStorage.setItem('wo_audio', audioEnabled ? '1' : '0'); } catch {} }, [audioEnabled]);
  useEffect(() => { audioCoach.setVoiceEnabled(voiceEnabled); try { localStorage.setItem('wo_voice', voiceEnabled ? '1' : '0'); } catch {} }, [voiceEnabled]);
  useEffect(() => { try { localStorage.setItem('wo_wakelock', wakeLockEnabled ? '1' : '0'); } catch {} }, [wakeLockEnabled]);
  useEffect(() => { try { localStorage.setItem('wo_autopause', autoPauseEnabled ? '1' : '0'); } catch {} }, [autoPauseEnabled]);

  // ── BLE hooks live HERE so notifications keep arriving while the user is
  //    on other routes. Disconnect only happens via endSession() / explicit
  //    user tap in the settings sheet. ───────────────────────────────────
  const trainer = useBluetoothTrainer();
  const hrStrap = useBluetoothHeartRate();
  const coreTemp = useBluetoothCoreTemp();

  const liveHr = hrStrap.status === 'connected' && hrStrap.data.heartRate != null
    ? hrStrap.data.heartRate
    : trainer.data.heartRate;
  const liveData = useMemo(() => ({ ...trainer.data, heartRate: liveHr }), [trainer.data, liveHr]);

  // Screen-on lock while running.
  useWakeLock(wakeLockEnabled && isRunning && !isFinished);

  // ── Sample + accumulator refs ──────────────────────────────────────────
  const samplesRef = useRef([]);
  const stepPowerRef = useRef({});
  const stepHrRef = useRef({});
  const lactateLogRef = useRef([]);
  const stallSecRef = useRef(0);
  const currentStepIdxRef = useRef(0);
  const timerRef = useRef(null);
  const ergSentRef = useRef(null);
  useEffect(() => { currentStepIdxRef.current = currentStepIdx; }, [currentStepIdx]);

  // Mirror "live" data into refs so the interval below can read them
  // without rebuilding every BLE notification.
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

  // hasStarted latches true once isRunning ever flips on.
  useEffect(() => { if (isRunning) setHasStarted(true); }, [isRunning]);

  // ── Per-tick accumulators ──────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning || trainer.data.power == null) return;
    const idx = currentStepIdxRef.current;
    const prev = stepPowerRef.current[idx] || { sum: 0, count: 0 };
    stepPowerRef.current[idx] = { sum: prev.sum + trainer.data.power, count: prev.count + 1 };
  }, [trainer.data.power, isRunning]);
  useEffect(() => {
    if (!isRunning || liveHr == null) return;
    const idx = currentStepIdxRef.current;
    const prev = stepHrRef.current[idx] || { sum: 0, count: 0 };
    stepHrRef.current[idx] = { sum: prev.sum + liveHr, count: prev.count + 1 };
  }, [liveHr, isRunning]);

  // ── Derived values ──────────────────────────────────────────────────────
  const currentStep = expandedSteps[currentStepIdx] || null;
  const currentTargetWatts = useMemo(
    () => (currentStep?.powerTarget ? resolveTargetWatts(currentStep.powerTarget, context) : null),
    [currentStep, context],
  );
  const stepDuration = currentStep?.durationSeconds || 0;
  const totalDuration = useMemo(
    () => expandedSteps.reduce((s, st) => s + (st.durationSeconds || 0), 0),
    [expandedSteps],
  );
  const effectiveErgWatts = useMemo(() => {
    if (currentTargetWatts == null) return null;
    return Math.max(0, Math.round(currentTargetWatts * ergBias));
  }, [currentTargetWatts, ergBias]);

  // ── ERG send ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ergMode || trainer.status !== 'connected') return;
    if (effectiveErgWatts == null) return;
    if (ergSentRef.current === effectiveErgWatts) return;
    ergSentRef.current = effectiveErgWatts;
    trainer.setPower(effectiveErgWatts);
  }, [ergMode, effectiveErgWatts, trainer.status]); // eslint-disable-line

  // ── Timer tick ─────────────────────────────────────────────────────────
  // Wall-clock based: each tick computes how many seconds elapsed since
  // the previous tick and advances counters by that delta. In the
  // foreground delta is typically 1 (matches the 1Hz interval). When
  // the tab/app is backgrounded the browser may throttle the interval
  // (or, on Capacitor, suspend JS entirely); on resume the very next
  // tick observes a large delta and catches everything up so the timer
  // and the chart's t-axis don't drift behind the real workout time.
  const lastTickAtRef = useRef(0);
  useEffect(() => {
    if (!isRunning || isFinished) {
      clearInterval(timerRef.current);
      return;
    }
    lastTickAtRef.current = Date.now();
    const tick = () => {
      const now = Date.now();
      let delta = Math.round((now - lastTickAtRef.current) / 1000);
      if (delta < 1) delta = 1;
      // Cap to a sane bound so a multi-hour suspend (laptop sleep)
      // doesn't dump 10 000 samples into the buffer in one shot.
      if (delta > 600) delta = 600;
      lastTickAtRef.current = now;

      const tr = trainerRef.current;
      const cn = contextRef.current;
      const xs = expandedStepsRef.current;

      // Auto-pause detection — only sensible at 1s resolution. If we
      // just caught up from a background suspend (delta > 1), reset
      // the stall counter — we have no idea what happened off-screen.
      if (delta > 1) stallSecRef.current = 0;
      else if (autoPauseEnabledRef.current && tr.status === 'connected') {
        const pw = tr.data.power;
        const cd = tr.data.cadence;
        const stalled = (pw == null || pw < STALL_POWER) && (cd == null || cd < STALL_CADENCE);
        if (stalled) {
          stallSecRef.current += 1;
          if (stallSecRef.current >= STALL_THRESHOLD) {
            setIsRunning(false);
            setAutoPausedAt(Date.now());
            stallSecRef.current = 0;
            return;
          }
        } else {
          stallSecRef.current = 0;
        }
      }

      // Apply `delta` seconds of progress in a single state update.
      for (let i = 0; i < delta; i++) {
      setStepElapsed((prev) => {
        const next = prev + 1;
        const sd = xs[currentStepIdxRef.current]?.durationSeconds || 0;
        if (sd > 0) {
          const remaining = sd - next;
          if (remaining === 3 || remaining === 2 || remaining === 1) audioCoach.beep(880, 80);
        }
        if (sd > 0 && next >= sd) {
          setCurrentStepIdx((idx) => {
            const nextIdx = idx + 1;
            if (nextIdx >= xs.length) {
              setIsRunning(false);
              setIsFinished(true);
              audioCoach.cues.finished();
              return idx;
            }
            ergSentRef.current = null;
            const ns = xs[nextIdx];
            if (ns) {
              const nsT = ns.powerTarget ? resolveTargetWatts(ns.powerTarget, cn) : null;
              const m = Math.floor((ns.durationSeconds || 0) / 60);
              const s = (ns.durationSeconds || 0) % 60;
              const dur = m > 0 ? (s > 0 ? `${m} minute${m > 1 ? 's' : ''} ${s} seconds` : `${m} minute${m > 1 ? 's' : ''}`) : `${s} seconds`;
              audioCoach.beep(1320, 180, 0.5);
              audioCoach.speak(`${ns.label || ns.stepType || 'next step'}, ${dur}${nsT ? ` at ${nsT} watts` : ''}`);
            }
            return nextIdx;
          });
          return 0;
        }
        return next;
      });
      setTotalElapsed((t) => {
        const next = t + 1;
        const trNow = trainerRef.current;
        const hrNow = liveHrRef.current;
        const ctNow = coreTempRef.current;
        samplesRef.current.push({
          t: next,
          power: trNow.data.power != null ? Math.round(trNow.data.power) : null,
          hr: hrNow != null ? Math.round(hrNow) : null,
          coreTemp: ctNow.data?.coreTemp != null ? Number(ctNow.data.coreTemp.toFixed(2)) : null,
          hsi: ctNow.data?.hsi != null ? Number(ctNow.data.hsi.toFixed(1)) : null,
          stepIdx: currentStepIdxRef.current,
        });
        return next;
      });
      } // close the `for (let i = 0; i < delta; i++)` loop
    };
    timerRef.current = setInterval(tick, 1000);
    // Catch-up tick when tab/app becomes visible again. This is what
    // makes the timer survive Capacitor app backgrounding on iOS: when
    // the WebView resumes JS, the visibility event fires and we run a
    // single tick which observes the large wall-clock delta and
    // fast-forwards stepElapsed / totalElapsed / samples buffer.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isRunning, isFinished]);

  // ── Auto-resume from auto-pause ────────────────────────────────────────
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

  // ── Persist a minimal snapshot so a hard reload doesn't lose context.
  //    BLE has to be re-paired manually after reload (Capacitor limitation),
  //    but timer / step / elapsed restore so the user picks up where they
  //    left off. ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!plannedWorkoutId || isFinished) return;
    try {
      const snap = {
        plannedWorkoutId, athleteId,
        currentStepIdx, stepElapsed, totalElapsed,
        isRunning, hasStarted,
        ergMode, ergBias,
        lactateLog: lactateLogRef.current.slice(0, 100),
        savedAt: Date.now(),
      };
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
    } catch {}
  }, [plannedWorkoutId, athleteId, currentStepIdx, stepElapsed, totalElapsed, isRunning, hasStarted, ergMode, ergBias, isFinished]);

  // ── Actions ────────────────────────────────────────────────────────────
  const startSession = useCallback((opts) => {
    const { workout: w, expandedSteps: ex, context: ctx, plannedWorkoutId: pid, athleteId: aid } = opts || {};
    setPlannedWorkoutId(pid || null);
    setAthleteId(aid || null);
    setWorkout(w || null);
    setExpandedSteps(ex || []);
    if (ctx) setContext(ctx);
    // Reset everything else for a fresh start.
    setCurrentStepIdx(0);
    setStepElapsed(0);
    setTotalElapsed(0);
    setIsRunning(false);
    setIsFinished(false);
    setHasStarted(false);
    setAutoPausedAt(null);
    samplesRef.current = [];
    stepPowerRef.current = {};
    stepHrRef.current = {};
    lactateLogRef.current = [];
    stallSecRef.current = 0;
    ergSentRef.current = null;
  }, []);

  const endSession = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (trainer.status === 'connected') trainer.disconnect();
    if (hrStrap.status === 'connected') hrStrap.disconnect();
    if (coreTemp.status === 'connected') coreTemp.disconnect();
    setIsRunning(false);
    setIsFinished(false);
    setHasStarted(false);
    setPlannedWorkoutId(null);
    setAthleteId(null);
    setWorkout(null);
    setExpandedSteps([]);
    setCurrentStepIdx(0);
    setStepElapsed(0);
    setTotalElapsed(0);
    setAutoPausedAt(null);
    samplesRef.current = [];
    stepPowerRef.current = {};
    stepHrRef.current = {};
    lactateLogRef.current = [];
    try { localStorage.removeItem(SNAPSHOT_KEY); } catch {}
  }, [trainer, hrStrap, coreTemp]);

  const playPause = useCallback(() => {
    if (isFinished) return;
    audioCoach.unlock();
    setAutoPausedAt(null);
    stallSecRef.current = 0;
    setIsRunning((r) => !r);
  }, [isFinished]);

  const nextStep = useCallback(() => {
    if (currentStepIdx >= expandedSteps.length - 1) return;
    ergSentRef.current = null;
    setCurrentStepIdx((i) => i + 1);
    setStepElapsed(0);
  }, [currentStepIdx, expandedSteps.length]);

  const prevStep = useCallback(() => {
    if (currentStepIdx === 0) { setStepElapsed(0); return; }
    ergSentRef.current = null;
    setCurrentStepIdx((i) => i - 1);
    setStepElapsed(0);
  }, [currentStepIdx]);

  const jumpToStep = useCallback((i) => {
    if (i < 0 || i >= expandedSteps.length) return;
    ergSentRef.current = null;
    setCurrentStepIdx(i);
    setStepElapsed(0);
  }, [expandedSteps.length]);

  const recordLactate = useCallback(({ value, note = '' }) => {
    if (!Number.isFinite(value)) return null;
    const idx = currentStepIdxRef.current;
    const power = trainer.data.power != null ? Math.round(trainer.data.power) : null;
    const hr = liveHr != null ? Math.round(liveHr) : null;
    const ts = new Date().toISOString();
    const entry = { value, ts, tElapsed: totalElapsed, stepIdx: idx, power, hr, note };
    lactateLogRef.current.push(entry);
    return entry;
  }, [trainer.data, liveHr, totalElapsed]);

  const bumpErgBias = useCallback((delta) => {
    setErgBias((b) => {
      const next = Math.round((b + delta) * 100) / 100;
      return Math.max(ERG_BIAS_MIN, Math.min(ERG_BIAS_MAX, next));
    });
    ergSentRef.current = null;
  }, []);

  const value = useMemo(() => ({
    // metadata
    plannedWorkoutId, athleteId, workout, expandedSteps, context,
    // state
    currentStep, currentStepIdx, stepElapsed, totalElapsed, totalDuration,
    isRunning, isFinished, hasStarted, autoPausedAt,
    currentTargetWatts, effectiveErgWatts,
    // BLE
    trainer, hrStrap, coreTemp, liveHr, liveData,
    // ERG
    ergMode, ergBias, ergStep: ERG_BIAS_STEP, ergMin: ERG_BIAS_MIN, ergMax: ERG_BIAS_MAX,
    // toggles
    audioEnabled, setAudioEnabled,
    voiceEnabled, setVoiceEnabled,
    wakeLockEnabled, setWakeLockEnabled,
    autoPauseEnabled, setAutoPauseEnabled,
    // refs (read-only access for caller — same object identity all session)
    samplesRef, stepPowerRef, stepHrRef, lactateLogRef,
    // actions
    startSession, endSession, playPause, nextStep, prevStep, jumpToStep,
    recordLactate, setErgMode, setErgBias, bumpErgBias,
    setCurrentStepIdx, setStepElapsed,
    setIsRunning, setIsFinished, setAutoPausedAt,
    setContext, setWorkout, setExpandedSteps, setPlannedWorkoutId,
  }), [
    plannedWorkoutId, athleteId, workout, expandedSteps, context,
    currentStep, currentStepIdx, stepElapsed, totalElapsed, totalDuration,
    isRunning, isFinished, hasStarted, autoPausedAt,
    currentTargetWatts, effectiveErgWatts,
    trainer, hrStrap, coreTemp, liveHr, liveData,
    ergMode, ergBias,
    audioEnabled, voiceEnabled, wakeLockEnabled, autoPauseEnabled,
    startSession, endSession, playPause, nextStep, prevStep, jumpToStep,
    recordLactate, bumpErgBias,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkoutSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useWorkoutSession must be used within WorkoutSessionProvider');
  return c;
}

/** True when there's an active (started, not yet finished) session — used
 *  by the resume banner to decide whether to render. */
export function useHasActiveSession() {
  const c = useContext(Ctx);
  if (!c) return null;
  if (!(c.hasStarted && !c.isFinished && c.plannedWorkoutId)) return null;
  return {
    plannedWorkoutId: c.plannedWorkoutId,
    athleteId: c.athleteId,
    totalElapsed: c.totalElapsed,
    isRunning: c.isRunning,
    // Live metrics so the floating pill can show actual numbers
    // while the user is on another route — proves to the athlete the
    // workout is still recording.
    power: c.trainer?.data?.power ?? null,
    heartRate: c.liveHr ?? null,
    cadence: c.trainer?.data?.cadence ?? null,
    autoPausedAt: c.autoPausedAt,
    endSession: c.endSession,
    playPause: c.playPause,
  };
}

export { expandSteps, resolveTargetWatts };
