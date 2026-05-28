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
import { useTrainer } from '../trainer/react/useTrainer';
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

function zoneMid(z) {
  if (!z) return null;
  if (z.min != null && z.max != null && isFinite(z.max)) return (z.min + z.max) / 2;
  return z.min ?? null;
}

function resolveTargetWatts(target, ctx = {}) {
  if (!target || target.type === 'open') return null;
  const { ftp = 250, lt1Power = null, lt2Power = null, cyclingZones = null } = ctx;
  if (target.type === 'watts')       return target.useRange ? Math.round((target.rangeMin + target.rangeMax) / 2) : (target.value || 0);
  if (target.type === 'percent_ftp') return Math.round(ftp * ((target.value || 80) / 100));
  if (target.type === 'percent_lt1') return Math.round((lt1Power || ftp * 0.75) * ((target.value || 95) / 100));
  if (target.type === 'percent_lt2') return Math.round((lt2Power || ftp) * ((target.value || 90) / 100));
  if (target.type === 'lt1')         return Math.round(lt1Power || ftp * 0.75);
  if (target.type === 'lt2')         return Math.round(lt2Power || ftp);
  if (target.type === 'zone') {
    const z = Math.max(1, Math.min(5, target.value || 1));
    const profileMid = cyclingZones ? zoneMid(cyclingZones[`zone${z}`]) : null;
    if (profileMid != null) return Math.round(profileMid);
    const lt2 = lt2Power || ftp;
    const lt1 = lt1Power || ftp * 0.75;
    return Math.round([lt1 * 0.8, lt1, lt2 * 0.95, lt2, lt2 * 1.1][z - 1]);
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
  //
  // useTrainer is the same robust adapter stack used by LactateTestingPage:
  //   • Rich state machine (disconnected → scanning → connecting → ready →
  //     controlled → erg_active)
  //   • Auto requestControl before the first ERG write
  //   • Debounced setErgWatts with retry on control loss
  //   • Works on Web Bluetooth (desktop Chrome) and Capacitor native (iOS/Android)
  //
  // A thin compatibility shim below maps useTrainer's interface to the shape
  // that every downstream consumer (WorkoutSettingsSheet, ERG effects, sample
  // accumulator) already expects — so nothing else in this file needs changing.
  const trainerHook = useTrainer();

  // ── useTrainer → useBluetoothTrainer compatibility shim ──────────────
  const trainerConnected = ['ready', 'controlled', 'erg_active'].includes(trainerHook.status);
  const trainer = useMemo(() => ({
    // ── Status ────────────────────────────────────────────────────────
    // Map the rich useTrainer states to the binary connected/connecting/…
    // that downstream effects check.
    status: trainerConnected ? 'connected'
      : trainerHook.status === 'scanning' || trainerHook.status === 'connecting' ? 'connecting'
      : trainerHook.status === 'error' ? 'error'
      : 'disconnected',

    // ── Device info ───────────────────────────────────────────────────
    deviceName: trainerHook.connectedDevice?.name ?? null,

    // ── Live sensor data ──────────────────────────────────────────────
    data: {
      power:     trainerHook.telemetry?.power   ?? null,
      cadence:   trainerHook.telemetry?.cadence ?? null,
      speed:     trainerHook.telemetry?.speed   ?? null,
      heartRate: trainerHook.telemetry?.hr      ?? null,
    },

    // ── ERG capability ────────────────────────────────────────────────
    // useTrainer.capabilities.erg is true when the adapter confirmed the
    // FTMS Control Point is writable (same signal as useBluetoothTrainer's
    // protocol === 'ftms').
    protocol: trainerConnected
      ? (trainerHook.capabilities?.erg ? 'ftms' : 'cps-readonly')
      : null,
    ergCapable: trainerHook.capabilities?.erg === true,

    // ── Actions ───────────────────────────────────────────────────────
    // connect() — opens the native Bluetooth picker, scans for FTMS / CPS
    // devices, and auto-connects to the one the user selects.  requestControl
    // + start are handled by setErgWatts the first time it fires, so we don't
    // need to call them explicitly here.
    connect: async () => {
      try {
        const found = await trainerHook.scan();
        if (!found || found.length === 0) return false;
        await trainerHook.connect(found[0].id);
        // Request control so the trainer is ready for ERG writes immediately.
        if (trainerHook.requestControl) {
          try { await trainerHook.requestControl(); } catch (_) { /* non-fatal */ }
        }
        return true;
      } catch (e) {
        console.warn('[trainer/shim] connect error:', e?.message || e);
        return false;
      }
    },
    disconnect: trainerHook.disconnect,

    // setPower(w) — delegates to setErgWatts which auto-requests control if
    // needed and debounces rapid calls (e.g. step-change + bias change
    // arriving in the same tick).  Returns a Promise<true> to match the
    // useBluetoothTrainer.setPower(w) → Promise<bool> contract.
    setPower: async (w) => {
      try {
        await trainerHook.setErgWatts(w);
        return true;
      } catch {
        return false;
      }
    },

    error: trainerHook.error,

    // Expose raw hook so WorkoutSettingsSheet can open TrainerConnectModal
    // for a richer connection UX (device list, ERG test button, etc.).
    _hook: trainerHook,
  }), [ // eslint-disable-line react-hooks/exhaustive-deps
    trainerConnected,
    trainerHook.status,
    trainerHook.connectedDevice,
    trainerHook.telemetry,
    trainerHook.capabilities,
    trainerHook.scan,
    trainerHook.connect,
    trainerHook.requestControl,
    trainerHook.disconnect,
    trainerHook.setErgWatts,
    trainerHook.error,
  ]);

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
  // stepDuration was computed here historically but the timer effect reads
  // it from expandedStepsRef.current directly, so the value is unused at
  // the provider level. Consumers that need it derive it from currentStep.
  const totalDuration = useMemo(
    () => expandedSteps.reduce((s, st) => s + (st.durationSeconds || 0), 0),
    [expandedSteps],
  );
  const effectiveErgWatts = useMemo(() => {
    if (currentTargetWatts == null) return null;
    return Math.max(0, Math.round(currentTargetWatts * ergBias));
  }, [currentTargetWatts, ergBias]);

  // ── Auto-enable ERG when trainer supports it + workout has power targets ──
  // Riders kept asking "why doesn't the trainer change resistance?" and the
  // answer was always "you need to flip ERG on in Settings". Default that
  // toggle to ON when the conditions are met: FTMS-capable trainer connected
  // + workout has at least one power-target step. CPS-only trainers (no FTMS
  // Control Point) can't accept setPower so we leave ergMode off there.
  const ergAutoEnabledRef = useRef(false);
  useEffect(() => {
    if (ergAutoEnabledRef.current) return;
    if (trainer.status !== 'connected') return;
    if (trainer.protocol !== 'ftms') return;
    if (!Array.isArray(expandedSteps) || expandedSteps.length === 0) return;
    const hasPowerTarget = expandedSteps.some((s) => s?.powerTarget && s.powerTarget.type !== 'open');
    if (!hasPowerTarget) return;
    ergAutoEnabledRef.current = true;
    setErgMode(true);
    console.log('[ERG] auto-enabled — FTMS trainer + workout has power targets');
  }, [trainer.status, trainer.protocol, expandedSteps]);

  // ── ERG send ───────────────────────────────────────────────────────────
  // Fires when ergMode is on AND effectiveErgWatts changes. Also fires on
  // ergMode 0→1 transition (we clear ergSentRef so the same wattage gets
  // re-sent — needed because toggling ERG off mid-workout typically leaves
  // the trainer in its last ERG state).
  const prevErgModeRef = useRef(ergMode);
  useEffect(() => {
    // ergMode transitioned off→on: force resend the target.
    if (ergMode && !prevErgModeRef.current) {
      ergSentRef.current = null;
    }
    // ergMode transitioned on→off: release the trainer from ERG by sending
    // setPower(0). Some trainers interpret 0 W as "free spin" (Wahoo Kickr,
    // Saris H3 do); others stay in their last state but visibly drop the
    // resistance. Better than leaving the rider stuck on the last target.
    if (!ergMode && prevErgModeRef.current) {
      if (trainer.status === 'connected' && trainer.protocol === 'ftms') {
        trainer.setPower(0).catch(() => { /* swallow — trainer may be in fault */ });
        console.log('[ERG] disabled — released trainer with setPower(0)');
      }
      ergSentRef.current = null;
    }
    prevErgModeRef.current = ergMode;

    if (!ergMode || trainer.status !== 'connected') return;
    if (trainer.protocol !== 'ftms') {
      // CPS-only — log once so the dev can see why ERG silently does nothing.
      if (ergSentRef.current !== 'cps-noop') {
        console.warn('[ERG] trainer is CPS-only (read-only power), ERG writes will be no-ops. Connect via FTMS for ERG support.');
        ergSentRef.current = 'cps-noop';
      }
      return;
    }

    // Step has no power target (warmup, cool-down, free-ride, rest) —
    // release the trainer from its previous ERG hold so resistance drops.
    // Only send the 0 W if we previously held a non-zero target (avoids
    // a redundant write when two consecutive free steps follow each other).
    if (effectiveErgWatts == null) {
      if (ergSentRef.current != null && ergSentRef.current !== 0 && ergSentRef.current !== 'cps-noop') {
        console.log('[ERG] no power target for this step — releasing trainer with setPower(0)');
        ergSentRef.current = 0;
        trainer.setPower(0).catch(() => {});
      }
      return;
    }

    if (ergSentRef.current === effectiveErgWatts) return;
    ergSentRef.current = effectiveErgWatts;
    console.log(`[ERG] setPower(${effectiveErgWatts}) — bias ${Math.round(ergBias * 100)} %`);
    trainer.setPower(effectiveErgWatts).then((ok) => {
      if (!ok) {
        console.warn('[ERG] setPower returned false — write may have failed; will retry on next target change.');
        // Reset so a subsequent same-value change still tries to write.
        ergSentRef.current = null;
      }
    }).catch((e) => {
      console.warn('[ERG] setPower threw:', e?.message || e);
      ergSentRef.current = null;
    });
  }, [ergMode, effectiveErgWatts, trainer.status, trainer.protocol]); // eslint-disable-line

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
    ergAutoEnabledRef.current = false; // allow auto-enable to re-fire on the new session
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
