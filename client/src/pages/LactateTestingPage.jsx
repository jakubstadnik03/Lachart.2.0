import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthProvider';
import { useNotification } from '../context/NotificationContext';
import LactateChart from '../components/LactateTesting/LactateChart';
import LiveDashboard from '../components/LactateTesting/LiveDashboard';
import ProtocolEditModal from '../components/LactateTesting/ProtocolEditModal';
import {
  saveLactateSession, getLactateSessions, getLactateSessionById,
  completeLactateSession, downloadLactateSessionFit, addTest,
} from '../services/api';
import deviceConnectivity from '../services/deviceConnectivity';
import { isCapacitorNative } from '../utils/isNativeApp';
import { useTrainer } from '../trainer/react/useTrainer.js';
import { TrainerConnectModal } from '../trainer/react/TrainerConnectModal.jsx';
import useWakeLock from '../hooks/useWakeLock';
import {
  unlockAudio,
  playIntervalEnd,
  playRecoveryEnd,
  playCountdownTick,
  playCountdownGo,
  playWarmupComplete,
  playTestComplete,
  playLactateSaved,
} from '../utils/testAudio';
import {
  PlayIcon, PauseIcon, StopIcon, ChartBarIcon,
  ArrowDownTrayIcon as DownloadIcon, TrashIcon, HeartIcon,
  CheckCircleIcon, Cog6ToothIcon, ArrowPathIcon,
  BeakerIcon, ClipboardDocumentListIcon, FireIcon,
  ExclamationTriangleIcon, WrenchScrewdriverIcon, LinkIcon,
  BoltIcon, FolderIcon, FlagIcon, CpuChipIcon,
  SignalIcon, SunIcon, SparklesIcon, ForwardIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid, BoltIcon as BoltSolid } from '@heroicons/react/24/solid';
import UpgradeModal from '../components/UpgradeModal';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const fmtTime = (s) => {
  if (!s && s !== 0) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const BORG_LABELS = {
  6: 'No exertion', 7: 'Extremely light', 9: 'Very light',
  11: 'Light', 13: 'Somewhat hard', 15: 'Hard',
  17: 'Very hard', 19: 'Extremely hard', 20: 'Maximal',
};

// ─────────────────────────────────────────────────────────────
// TrainerStatusBadge
// ─────────────────────────────────────────────────────────────
const TrainerStatusBadge = ({ status }) => {
  const cfg = {
    disconnected: { bg: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-400',                  label: 'Disconnected' },
    scanning:     { bg: 'bg-blue-100 text-blue-600',   dot: 'bg-blue-400 animate-pulse',    label: 'Scanning…'    },
    connecting:   { bg: 'bg-amber-100 text-amber-600', dot: 'bg-amber-400 animate-pulse',   label: 'Connecting…'  },
    ready:        { bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500',            label: 'Connected'    },
    controlled:   { bg: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500',            label: 'ERG Mode'     },
    erg_active:   { bg: 'bg-green-100 text-green-700', dot: 'bg-green-500 animate-pulse',   label: 'ERG Active'   },
    error:        { bg: 'bg-red-100 text-red-600',     dot: 'bg-red-500',                   label: 'Error'        },
  };
  const c = cfg[status] ?? cfg.disconnected;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────
// StepProgressBar
// ─────────────────────────────────────────────────────────────
const StepProgressBar = ({ steps, currentStep, lactateValues }) => (
  <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
    {steps.map((step, idx) => {
      const done   = idx < currentStep;
      const active = idx === currentStep;
      const lv     = lactateValues.find(l => l.step === idx + 1);
      return (
        <React.Fragment key={idx}>
          <div className={`
            flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all duration-200
            ${active ? 'bg-primary text-white shadow-lg shadow-primary/30 scale-105 ring-2 ring-primary/30'
              : done  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              :         'bg-white/60 text-gray-400 border border-gray-100'}
          `}>
            {done
              ? <CheckCircleSolid className="w-3.5 h-3.5 text-emerald-500" />
              : <span className={`text-xs font-bold leading-none ${active ? 'text-white' : 'text-gray-400'}`}>{idx + 1}</span>
            }
            <span className={`text-[11px] font-semibold leading-none ${active ? 'text-white' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
              {step.targetPower}W
            </span>
            {lv && (
              <span className={`text-[10px] font-medium leading-none ${active ? 'text-white/80' : 'text-emerald-600'}`}>
                {lv.lactate.toFixed(1)}
              </span>
            )}
          </div>
          {idx < steps.length - 1 && (
            <div className={`flex-shrink-0 w-3 h-px mb-3 ${idx < currentStep ? 'bg-emerald-300' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
const LactateTestingPage = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();

  // ── Trainer ───────────────────────────────────────────────
  const trainer = useTrainer();
  const [showTrainerModal, setShowTrainerModal] = useState(false);
  const [showProtocolEdit, setShowProtocolEdit] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // ── Test state ────────────────────────────────────────────
  const [testState,     setTestState]     = useState('idle');
  const [currentStep,   setCurrentStep]   = useState(0);
  const [intervalTimer, setIntervalTimer] = useState(0);
  const [totalTestTime, setTotalTestTime] = useState(0);
  const [phase,         setPhase]         = useState('work');
  const [countdown,     setCountdown]     = useState(0);
  const [recoveryTimer, setRecoveryTimer] = useState(0);

  // ── Warmup / Cooldown state ───────────────────────────────
  const [warmup, setWarmup] = useState({
    enabled:      false,
    type:         'fixed',  // 'fixed' | 'steps'
    duration:     600,      // seconds (fixed)
    power:        100,      // watts  (fixed)
    stepCount:    3,
    stepDuration: 120,
    startPower:   80,
    endPower:     150,
  });
  const [cooldown, setCooldown] = useState({
    enabled:  false,
    duration: 300,
    power:    80,
  });
  const [warmupStep,    setWarmupStep]    = useState(0);   // current warmup step index (step-type)
  const [warmupTimer,   setWarmupTimer]   = useState(0);   // seconds into current warmup step
  const [cooldownTimer, setCooldownTimer] = useState(0);   // seconds into cooldown

  // ── Live watt offset ──────────────────────────────────────
  const [wattOffset, setWattOffset] = useState(0);

  // ── Devices ───────────────────────────────────────────────
  const [devices, setDevices] = useState({
    bikeTrainer: { connected: false, data: null },
    heartRate:   { connected: false, data: null },
    moxy:        { connected: false, data: null },
    coreTemp:    { connected: false, data: null },
    vo2master:   { connected: false, data: null },
  });

  // ── Live data ─────────────────────────────────────────────
  const [liveData, setLiveData] = useState({
    power: 0, cadence: 0, heartRate: 0, smo2: 0, thb: 0,
    coreTemp: 0, vo2: 0, vco2: 0, ventilation: 0, speed: 0,
    timestamp: Date.now(),
  });

  // ── Protocol ──────────────────────────────────────────────
  const [protocol, setProtocol] = useState({
    workDuration: 360, recoveryDuration: 60,
    steps: [], startPower: 100, powerIncrement: 20, maxSteps: 8,
    sport: 'bike',
  });

  // ── Historical & lactate ──────────────────────────────────
  const [historicalData,  setHistoricalData]  = useState([]);
  const [lactateValues,   setLactateValues]   = useState([]);
  const [savedSessionId,  setSavedSessionId]  = useState(null);

  // ── Inline lactate form ───────────────────────────────────
  const [lactateInput, setLactateInput] = useState('');
  const [borgInput,    setBorgInput]    = useState('');
  const lactateInputRef = useRef(null);

  // ── Timer refs ────────────────────────────────────────────
  const intervalTimerRef       = useRef(null);
  const dataCollectionRef      = useRef(null);
  const testTimerRef           = useRef(null);
  const countdownRef           = useRef(null);
  const recoveryTimerRef       = useRef(null);
  const warmupTimerRef         = useRef(null);
  const cooldownTimerRef       = useRef(null);
  const liveDataRef            = useRef(liveData);
  const currentStepRef         = useRef(currentStep);
  const intervalTimerRef2      = useRef(intervalTimer);
  const totalTestTimeRef       = useRef(totalTestTime);
  const testStateRef           = useRef(testState);
  const phaseRef               = useRef(phase);
  const protocolRef            = useRef(protocol);
  const handleStartIntervalRef = useRef(null);

  // Function refs (avoid stale closures in timers)
  const warmupRef           = useRef(warmup);
  const cooldownRef         = useRef(cooldown);
  const wattOffsetRef       = useRef(wattOffset);
  const warmupStepRef       = useRef(warmupStep);
  const startMainTestRef    = useRef(null);
  const startCooldownRef    = useRef(null);
  const advanceWarmupStepRef = useRef(null);
  // Always-current trainer ref so interval callbacks never use a stale closure
  const trainerRef          = useRef(trainer);

  // Landscape detection for mobile (short screen wider than tall)
  const [isLandscape, setIsLandscape] = useState(
    () => typeof window !== 'undefined' && window.innerWidth > window.innerHeight && window.innerHeight < 520
  );
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight && window.innerHeight < 520);
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check); };
  }, []);

  // Fullscreen mode — hides NativeLayout's top bar + bottom tab bar so the
  // training UI gets the full viewport. Auto-enters when the user rotates to
  // landscape (typical "watch the chart" pose); a button in the header lets
  // the user toggle it manually too.
  // eslint-disable-next-line no-unused-vars
  const lastOrientationRef = useRef(isLandscape);
  // (fullscreen body class removed — design uses scrollable layout)

  // ── Screen keep-awake ──────────────────────────────────────
  // Prevents the screen from dimming or locking while a test is active.
  // Uses the WakeLock API (Chrome / Safari 16.4+ / Capacitor WKWebView).
  const isTestActive = testState === 'running' || testState === 'paused';
  useWakeLock(isTestActive);

  // ── Background guard (Capacitor only) ─────────────────────
  // When the user switches away and comes back, local timers keep
  // running in the JS engine (Capacitor does NOT freeze JS like a
  // Safari tab does). We still listen for the appStateChange event
  // so we can reschedule if needed in the future, and to resume the
  // AudioContext (iOS mutes audio when backgrounded).
  useEffect(() => {
    if (!isCapacitorNative()) return;
    let sub;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        sub = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            // App came back to foreground — resume AudioContext so beeps work again
            try {
              unlockAudio();
            } catch (_) {}
          }
        });
      } catch (_) {}
    })();
    return () => { sub?.remove?.(); };
  }, []);

  // Keep refs in sync
  useEffect(() => { liveDataRef.current       = liveData;      }, [liveData]);
  useEffect(() => { currentStepRef.current    = currentStep;   }, [currentStep]);
  useEffect(() => { intervalTimerRef2.current = intervalTimer; }, [intervalTimer]);
  useEffect(() => { totalTestTimeRef.current  = totalTestTime; }, [totalTestTime]);
  useEffect(() => { testStateRef.current      = testState;     }, [testState]);
  useEffect(() => { phaseRef.current          = phase;         }, [phase]);
  useEffect(() => { protocolRef.current       = protocol;      }, [protocol]);
  useEffect(() => { warmupRef.current         = warmup;        }, [warmup]);
  useEffect(() => { cooldownRef.current       = cooldown;      }, [cooldown]);
  useEffect(() => { wattOffsetRef.current     = wattOffset;    }, [wattOffset]);
  useEffect(() => { warmupStepRef.current     = warmupStep;    }, [warmupStep]);
  useEffect(() => { trainerRef.current        = trainer;       }, [trainer]);

  // ── Warmup step power helper ──────────────────────────────
  const getWarmupStepPower = (stepIdx, wu) => {
    const w = wu ?? warmupRef.current;
    if (!w || w.stepCount <= 1) return w?.startPower ?? 0;
    return Math.round(w.startPower + stepIdx * (w.endPower - w.startPower) / Math.max(w.stepCount - 1, 1));
  };

  // ── Initialize protocol steps ─────────────────────────────
  useEffect(() => {
    const steps = Array.from({ length: protocol.maxSteps }, (_, i) => ({
      stepNumber:      i + 1,
      targetPower:     protocol.startPower + i * protocol.powerIncrement,
      duration:        protocol.workDuration,
      recoveryDuration: protocol.recoveryDuration,
    }));
    setProtocol(prev => ({ ...prev, steps }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocol.startPower, protocol.powerIncrement, protocol.maxSteps, protocol.workDuration, protocol.recoveryDuration]);

  // ── Trainer → bikeTrainer device sync ─────────────────────
  useEffect(() => {
    const connected = !!trainer.connectedDevice && trainer.status !== 'disconnected';
    setDevices(prev => ({
      ...prev,
      bikeTrainer: connected
        ? {
            connected: true,
            name: trainer.connectedDevice?.name,
            data: {
              power:   trainer.telemetry?.power   ?? null,
              cadence: trainer.telemetry?.cadence ?? null,
              speed:   trainer.telemetry?.speed   ?? null,
            },
          }
        : { connected: false, data: null },
    }));
  }, [trainer.connectedDevice, trainer.status, trainer.telemetry]);

  // ── Trainer telemetry → liveData ──────────────────────────
  useEffect(() => {
    if (!trainer.telemetry) return;
    const t = trainer.telemetry;
    setLiveData(prev => {
      const upd = { ...prev, timestamp: Date.now() };
      if (phaseRef.current === 'recovery') {
        upd.power = 0; upd.cadence = 0; upd.speed = 0;
      } else {
        if (t.power   != null) upd.power   = t.power;
        if (t.cadence != null) upd.cadence = t.cadence;
        if (t.speed   != null) upd.speed   = t.speed;
      }
      liveDataRef.current = upd;
      return upd;
    });
  }, [trainer.telemetry]);

  // ── Auto-request ERG control when trainer connects ─────────
  useEffect(() => {
    if (trainer.status !== 'ready') return;
    let cancelled = false;
    (async () => {
      try {
        if (trainer.requestControl) await trainer.requestControl();
        if (!cancelled && trainer.start) await trainer.start();
        if (!cancelled) addNotification('Trainer ERG control established', 'success');
      } catch (err) {
        if (!cancelled) console.warn('Trainer control retry failed:', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainer.status]);

  // ── Data collection ────────────────────────────────────────
  const collectDataPoint = useCallback(() => {
    const d = liveDataRef.current;
    setHistoricalData(prev => [...prev, {
      power:        d.power        ?? null,
      cadence:      d.cadence      ?? null,
      speed:        d.speed        ?? null,
      heartRate:    d.heartRate    ?? null,
      smo2:         d.smo2         ?? null,
      thb:          d.thb          ?? null,
      coreTemp:     d.coreTemp     ?? null,
      vo2:          d.vo2          ?? null,
      vco2:         d.vco2         ?? null,
      ventilation:  d.ventilation  ?? null,
      timestamp:    Date.now(),
      step:         currentStepRef.current,
      intervalTime: intervalTimerRef2.current,
      totalTime:    totalTestTimeRef.current,
    }]);
  }, []);

  // ── Recovery timer (auto-started when phase → 'recovery') ──
  useEffect(() => {
    if (phase !== 'recovery' || testState !== 'running') return;
    if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);
    setRecoveryTimer(0);
    setTimeout(() => lactateInputRef.current?.focus(), 300);

    recoveryTimerRef.current = setInterval(() => {
      setRecoveryTimer(prev => {
        const dur = protocolRef.current.recoveryDuration || 60;
        if (prev + 1 >= dur) {
          clearInterval(recoveryTimerRef.current);
          recoveryTimerRef.current = null;
          playRecoveryEnd();
          setTimeout(() => handleStartIntervalRef.current?.(), 100);
          return dur;
        }
        return prev + 1;
      });
    }, 1000);

    return () => {
      if (recoveryTimerRef.current) { clearInterval(recoveryTimerRef.current); recoveryTimerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, testState]);

  // ── Interval timer ─────────────────────────────────────────
  const startIntervalTimer = useCallback(() => {
    if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    let elapsed = 0;
    intervalTimerRef.current = setInterval(() => {
      elapsed += 1;
      const maxTime = protocolRef.current.steps[currentStepRef.current]?.duration || 360;
      if (elapsed >= maxTime) {
        clearInterval(intervalTimerRef.current);
        intervalTimerRef.current = null;
        elapsed = 0;
        // Transition to recovery outside of state updater
        setIntervalTimer(0);
        setPhase('recovery');
        playIntervalEnd();
        // Send 0W to trainer — adapter keeps its own state, no React status check needed
        setTimeout(() => Promise.resolve(trainerRef.current?.setErgWatts?.(0)).catch(e => console.warn('ERG 0W failed:', e)), 100);
      } else {
        setIntervalTimer(elapsed);
      }
    }, 1000);
  }, []);

  // ── Start cooldown phase ───────────────────────────────────
  const startCooldown = useCallback(() => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    setCooldownTimer(0);
    setPhase('cooldown');
    const cd = cooldownRef.current;
    const t0 = trainerRef.current;
    if (t0?.setErgWatts) {
      setTimeout(() => Promise.resolve(t0.setErgWatts(cd.power)).catch(console.error), 100);
    }
    addNotification(`Cooldown: ${cd.power}W for ${fmtTime(cd.duration)}`, 'info');

    cooldownTimerRef.current = setInterval(() => {
      setCooldownTimer(prev => {
        const dur = cooldownRef.current.duration || 300;
        if (prev + 1 >= dur) {
          clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
          setTimeout(() => {
            testStateRef.current = 'completed';
            setTestState('completed');
            setPhase('work');
            playTestComplete();
            const t = trainerRef.current;
            if (t?.setErgWatts) Promise.resolve(t.setErgWatts(0)).catch(console.error);
            addNotification('Cooldown complete. Test finished', 'success');
          }, 100);
          return dur;
        }
        return prev + 1;
      });
    }, 1000);
  }, [addNotification]);
  useEffect(() => { startCooldownRef.current = startCooldown; }, [startCooldown]);

  // ── Advance warmup step (step-type warmup) ─────────────────
  const advanceWarmupStep = useCallback(() => {
    const wu = warmupRef.current;
    const nextStep = warmupStepRef.current + 1;
    if (nextStep >= wu.stepCount) {
      // All warmup steps done
      if (warmupTimerRef.current) { clearInterval(warmupTimerRef.current); warmupTimerRef.current = null; }
      playWarmupComplete();
      addNotification('Warmup complete! Starting main test…', 'success');
      setTimeout(() => startMainTestRef.current?.(), 500);
      return;
    }
    // Advance to next warmup step — the interval keeps running, just reset display timer
    setWarmupStep(nextStep);
    warmupStepRef.current = nextStep;
    const power = getWarmupStepPower(nextStep, wu);
    const t = trainerRef.current;
    if (t?.setErgWatts) {
      Promise.resolve(t.setErgWatts(power)).catch(console.error);
    }
    addNotification(`Warmup step ${nextStep + 1}/${wu.stepCount}: ${power}W`, 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addNotification]);
  useEffect(() => { advanceWarmupStepRef.current = advanceWarmupStep; }, [advanceWarmupStep]);

  // ── Start main test (after warmup or directly) ─────────────
  const startMainTest = useCallback(() => {
    setPhase('work');
    setWattOffset(0); wattOffsetRef.current = 0;
    setCurrentStep(0); currentStepRef.current = 0;
    setIntervalTimer(0); intervalTimerRef2.current = 0;
    startIntervalTimer();
    const firstPower = protocolRef.current.steps[0]?.targetPower ?? protocolRef.current.startPower;
    const t = trainerRef.current;
    if (t?.setErgWatts) {
      setTimeout(() => {
        Promise.resolve(trainerRef.current?.setErgWatts?.(firstPower)).catch(console.error);
        addNotification(`ERG set to ${firstPower}W`, 'info');
      }, 500);
    }
  }, [startIntervalTimer, addNotification]);
  useEffect(() => { startMainTestRef.current = startMainTest; }, [startMainTest]);

  // ── Start next interval (after recovery) ───────────────────
  const handleStartInterval = useCallback(() => {
    if (testStateRef.current !== 'running') return;
    if (recoveryTimerRef.current) { clearInterval(recoveryTimerRef.current); recoveryTimerRef.current = null; }
    if (intervalTimerRef.current) { clearInterval(intervalTimerRef.current); intervalTimerRef.current = null; }
    setRecoveryTimer(0);
    setLactateInput('');
    setBorgInput('');
    setIntervalTimer(0);

    // Detect last step
    const isLastStep = currentStepRef.current + 1 >= protocolRef.current.steps.length;
    if (isLastStep) {
      if (cooldownRef.current?.enabled) {
        startCooldownRef.current?.();
      } else {
        testStateRef.current = 'completed';
        setTestState('completed');
        setPhase('work');
        playTestComplete();
        const t = trainerRef.current;
        if (t?.setErgWatts) Promise.resolve(t.setErgWatts(0)).catch(console.error);
        addNotification('Test complete', 'success');
      }
      return;
    }

    // Reset watt offset for new step
    setWattOffset(0); wattOffsetRef.current = 0;

    // Compute next step NOW so we can show the target during the countdown
    const nextStep = currentStepRef.current + 1 < protocolRef.current.steps.length
      ? currentStepRef.current + 1
      : currentStepRef.current;
    const nextTargetPower = protocolRef.current.steps[nextStep]?.targetPower;

    // Advance step immediately so the target display updates during countdown
    currentStepRef.current = nextStep;
    setCurrentStep(nextStep);

    setPhase('countdown');
    setCountdown(3);
    playCountdownTick(); // first tick at countdown start

    let tick = 3;
    countdownRef.current = setInterval(() => {
      tick -= 1;
      if (tick <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setCountdown(0);
        setPhase('work');
        setIntervalTimer(0);
        playCountdownGo(); // GO beep — interval starts
        startIntervalTimer();

        // Set ERG power for the new step — use ref so we always get the latest trainer
        if (nextTargetPower != null) {
          setTimeout(() => {
            const setErg = trainerRef.current?.setErgWatts;
            console.log('[LactateTest] interval setErgWatts', { step: nextStep + 1, watts: nextTargetPower, hasFn: !!setErg });
            if (setErg) Promise.resolve(setErg(nextTargetPower)).catch(e => console.warn('ERG interval failed:', e));
          }, 100);
        }
      } else {
        setCountdown(tick);
        playCountdownTick(); // tick for each second of countdown
      }
    }, 1000);

    setTimeout(() => addNotification(`Step ${nextStep + 1}: ${nextTargetPower ? `${nextTargetPower}W — ` : ''}Starting in 3…`, 'info'), 0);
  }, [startIntervalTimer, addNotification]);

  useEffect(() => { handleStartIntervalRef.current = handleStartInterval; }, [handleStartInterval]);

  // ── Reactive ERG sync — safety net on top of imperative callbacks ──────
  // The setInterval callbacks already call setErgWatts imperatively, but if
  // the trainer connects AFTER a step has already started, or if the callback
  // fires before the trainerRef updates, the ERG is never sent. This effect
  // picks up those cases by watching (currentStep, phase, trainerStatus).
  useEffect(() => {
    const t = trainerRef.current;
    if (!t?.setErgWatts) return;
    const state = testStateRef.current;
    if (state !== 'running') return; // don't send during idle / completed

    if (phase === 'work') {
      const targetPower = protocolRef.current.steps[currentStepRef.current]?.targetPower;
      if (targetPower != null) {
        const effective = targetPower + (wattOffsetRef.current || 0);
        console.log('[LactateTest] reactive ERG sync → work phase', { step: currentStep + 1, watts: effective });
        Promise.resolve(t.setErgWatts(Math.max(0, effective))).catch(e => console.warn('ERG sync failed:', e));
      }
    } else if (phase === 'recovery' || phase === 'countdown') {
      // During recovery (blood sampling) and countdown, release resistance
      console.log('[LactateTest] reactive ERG sync → rest/countdown phase, sending 0W');
      Promise.resolve(t.setErgWatts(0)).catch(e => console.warn('ERG rest sync failed:', e));
    }
  }, [currentStep, phase, trainer.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live watt adjustment ───────────────────────────────────
  const adjustWatts = useCallback((delta) => {
    const newOffset = wattOffsetRef.current + delta;
    wattOffsetRef.current = newOffset;
    setWattOffset(newOffset);
    const effective = (protocolRef.current.steps[currentStepRef.current]?.targetPower ?? 0) + newOffset;
    const t = trainerRef.current;
    // Let the adapter validate its own state — don't gate on React status which can lag
    if (t?.setErgWatts) {
      Promise.resolve(t.setErgWatts(Math.max(0, effective))).catch(e => console.warn('ERG adjust failed:', e));
    }
  }, []);

  // ── Start test ─────────────────────────────────────────────
  const handleStartTest = () => {
    unlockAudio(); // must be called inside user gesture so iOS allows audio
    setCurrentStep(0); currentStepRef.current = 0;
    setIntervalTimer(0); intervalTimerRef2.current = 0;
    setTotalTestTime(0); totalTestTimeRef.current = 0;
    setHistoricalData([]); setLactateValues([]);
    setCountdown(0);
    setLactateInput(''); setBorgInput('');
    setWattOffset(0); wattOffsetRef.current = 0;
    setWarmupStep(0); warmupStepRef.current = 0;
    setWarmupTimer(0); setCooldownTimer(0);
    testStateRef.current = 'running';
    setTestState('running');

    if (testTimerRef.current) clearInterval(testTimerRef.current);
    testTimerRef.current = setInterval(() => {
      setTotalTestTime(prev => { totalTestTimeRef.current = prev + 1; return prev + 1; });
    }, 1000);

    if (dataCollectionRef.current) clearInterval(dataCollectionRef.current);
    setTimeout(() => collectDataPoint(), 500);
    dataCollectionRef.current = setInterval(() => {
      if (testStateRef.current === 'running') collectDataPoint();
    }, 1000);

    const wu = warmup;
    if (wu.enabled) {
      setPhase('warmup');
      if (wu.type === 'fixed') {
        // Fixed-power warmup — use ref to avoid stale closure
        setTimeout(() => {
          const setErg = trainerRef.current?.setErgWatts;
          if (setErg) {
            console.log('[LactateTest] start (warmup fixed) setErgWatts', wu.power);
            Promise.resolve(setErg(wu.power)).catch(e => console.warn('ERG warmup failed:', e));
          }
        }, 500);
        if (warmupTimerRef.current) clearInterval(warmupTimerRef.current);
        warmupTimerRef.current = setInterval(() => {
          setWarmupTimer(prev => {
            const dur = warmupRef.current.duration || 600;
            if (prev + 1 >= dur) {
              clearInterval(warmupTimerRef.current);
              warmupTimerRef.current = null;
              playWarmupComplete();
              addNotification('Warmup complete! Starting main test…', 'success');
              setTimeout(() => startMainTestRef.current?.(), 500);
              return dur;
            }
            return prev + 1;
          });
        }, 1000);
      } else {
        // Step-type warmup — use ref to avoid stale closure
        const firstPower = getWarmupStepPower(0, wu);
        setTimeout(() => {
          const setErg = trainerRef.current?.setErgWatts;
          if (setErg) {
            console.log('[LactateTest] start (warmup step) setErgWatts', firstPower);
            Promise.resolve(setErg(firstPower)).catch(e => console.warn('ERG warmup step failed:', e));
          }
        }, 500);
        if (warmupTimerRef.current) clearInterval(warmupTimerRef.current);
        warmupTimerRef.current = setInterval(() => {
          setWarmupTimer(prev => {
            const dur = warmupRef.current.stepDuration || 120;
            if (prev + 1 >= dur) {
              setTimeout(() => advanceWarmupStepRef.current?.(), 0);
              return 0;
            }
            return prev + 1;
          });
        }, 1000);
      }
      addNotification('Test started — Warmup phase', 'success');
    } else {
      setPhase('work');
      startIntervalTimer();
      const firstPower = protocol.steps[0]?.targetPower ?? protocol.startPower;
      setTimeout(() => {
        const setErg = trainerRef.current?.setErgWatts;
        if (setErg && firstPower != null) {
          console.log('[LactateTest] start (no warmup) setErgWatts', firstPower);
          Promise.resolve(setErg(firstPower)).catch(e => console.warn('ERG start failed:', e));
          addNotification(`ERG set to ${firstPower}W`, 'info');
        } else {
          console.warn('[LactateTest] start: no setErgWatts on trainerRef or no firstPower', { hasFn: !!setErg, firstPower });
        }
      }, 1000);
      setTimeout(() => addNotification('Test started!', 'success'), 0);
    }
  };

  // ── Skip warmup ────────────────────────────────────────────
  const handleSkipWarmup = () => {
    if (warmupTimerRef.current) { clearInterval(warmupTimerRef.current); warmupTimerRef.current = null; }
    addNotification('Warmup skipped, starting main test…', 'info');
    startMainTestRef.current?.();
  };

  // ── Pause ──────────────────────────────────────────────────
  const handlePauseTest = () => {
    setTestState('paused'); testStateRef.current = 'paused';
    [intervalTimerRef.current, testTimerRef.current, dataCollectionRef.current,
     countdownRef.current, recoveryTimerRef.current, warmupTimerRef.current, cooldownTimerRef.current]
      .forEach(r => { if (r) clearInterval(r); });
    setTimeout(() => addNotification('Test paused', 'info'), 0);
  };

  // ── Resume ─────────────────────────────────────────────────
  const handleResumeTest = () => {
    setTestState('running'); testStateRef.current = 'running';
    const currentPhase = phaseRef.current;

    if (currentPhase === 'work') {
      startIntervalTimer();
    } else if (currentPhase === 'warmup') {
      const wu = warmupRef.current;
      if (warmupTimerRef.current) clearInterval(warmupTimerRef.current);
      warmupTimerRef.current = setInterval(() => {
        setWarmupTimer(prev => {
          const dur = wu.type === 'fixed' ? (wu.duration || 600) : (wu.stepDuration || 120);
          if (prev + 1 >= dur) {
            if (wu.type === 'fixed') {
              clearInterval(warmupTimerRef.current);
              warmupTimerRef.current = null;
              addNotification('Warmup complete! Starting main test…', 'success');
              setTimeout(() => startMainTestRef.current?.(), 500);
              return dur;
            } else {
              setTimeout(() => advanceWarmupStepRef.current?.(), 0);
              return 0;
            }
          }
          return prev + 1;
        });
      }, 1000);
    } else if (currentPhase === 'cooldown') {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = setInterval(() => {
        setCooldownTimer(prev => {
          const dur = cooldownRef.current.duration || 300;
          if (prev + 1 >= dur) {
            clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
            setTimeout(() => {
              testStateRef.current = 'completed';
              setTestState('completed');
              setPhase('work');
              const t = trainerRef.current;
              if (t?.setErgWatts) Promise.resolve(t.setErgWatts(0)).catch(console.error);
              addNotification('Cooldown complete. Test finished', 'success');
            }, 100);
            return dur;
          }
          return prev + 1;
        });
      }, 1000);
    }

    testTimerRef.current = setInterval(() => setTotalTestTime(p => p + 1), 1000);
    dataCollectionRef.current = setInterval(() => {
      if (testStateRef.current === 'running') collectDataPoint();
    }, 1000);
    setTimeout(() => addNotification('Test resumed', 'success'), 0);
  };

  // ── Stop ───────────────────────────────────────────────────
  const handleStopTest = () => {
    setTestState('completed'); testStateRef.current = 'completed';
    setPhase('work');
    [intervalTimerRef.current, testTimerRef.current, dataCollectionRef.current,
     countdownRef.current, recoveryTimerRef.current, warmupTimerRef.current, cooldownTimerRef.current]
      .forEach(r => { if (r) clearInterval(r); });
    playTestComplete();
    if (trainer.setErgWatts) Promise.resolve(trainer.setErgWatts(0)).catch(console.error);
    setTimeout(() => addNotification('Test complete', 'success'), 0);
  };

  // ── End interval early ─────────────────────────────────────
  const handleSkipInterval = () => {
    if (testStateRef.current !== 'running' || phaseRef.current !== 'work') return;
    if (intervalTimerRef.current) { clearInterval(intervalTimerRef.current); intervalTimerRef.current = null; }
    setIntervalTimer(0);
    setPhase('recovery');
    playIntervalEnd();
    if (trainer.setErgWatts) {
      Promise.resolve(trainer.setErgWatts(0)).catch(console.error);
    }
    setTimeout(() => addNotification('Interval ended. Enter lactate.', 'info'), 0);
  };

  // ── Add lactate (inline form) ──────────────────────────────
  const handleAddLactate = () => {
    const val = parseFloat(lactateInput);
    if (!val || isNaN(val) || val <= 0) { addNotification('Enter a valid lactate value', 'error'); return; }
    const sh = historicalData.filter(d => d.step === currentStep);
    const avgPower = sh.length
      ? Math.round(sh.reduce((s, d) => s + (d.power || 0), 0) / sh.length)
      : protocol.steps[currentStep]?.targetPower ?? 0;
    setLactateValues(prev => [...prev, {
      step:    currentStep + 1,
      power:   avgPower,
      lactate: val,
      borg:    borgInput ? parseFloat(borgInput) : null,
      time:    totalTestTime,
    }]);
    playLactateSaved();
    setTimeout(() => addNotification('Lactate recorded', 'success'), 0);
  };

  // ── Clear ──────────────────────────────────────────────────
  const handleClearTest = () => {
    if (!window.confirm('Clear all test data? This cannot be undone.')) return;
    [intervalTimerRef.current, testTimerRef.current, dataCollectionRef.current,
     countdownRef.current, recoveryTimerRef.current, warmupTimerRef.current, cooldownTimerRef.current]
      .forEach(r => { if (r) clearInterval(r); });
    setTestState('idle'); setCurrentStep(0); setIntervalTimer(0); setTotalTestTime(0);
    setPhase('work'); setCountdown(0); setRecoveryTimer(0);
    setHistoricalData([]); setLactateValues([]); setSavedSessionId(null);
    setLactateInput(''); setBorgInput('');
    setWattOffset(0); wattOffsetRef.current = 0;
    setWarmupStep(0); warmupStepRef.current = 0;
    setWarmupTimer(0); setCooldownTimer(0);
    testStateRef.current = 'idle'; currentStepRef.current = 0;
    totalTestTimeRef.current = 0; intervalTimerRef2.current = 0;
    setTimeout(() => addNotification('Test cleared', 'info'), 0);
  };

  // ── Save ───────────────────────────────────────────────────
  const handleSaveTest = async () => {
    if (!user?._id)            { addNotification('Login required', 'error');    return; }
    if (!historicalData.length){ addNotification('No data to save', 'warning'); return; }
    try {
      addNotification('Saving…', 'info');
      const startTime = new Date(Date.now() - totalTestTime * 1000);
      const sessionData = {
        athleteId:    user._id,
        startTime:    startTime.toISOString(),
        endTime:      new Date().toISOString(),
        protocol,     measurements: historicalData,
        lactateValues, testDuration: totalTestTime,
        currentStep,  status: 'completed',
        sport:        protocol.sport || 'bike',
        title:        `Lactate Test – ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      };
      const response  = await saveLactateSession(sessionData);
      const sessionId = response?.data?.session?._id ?? response?.data?._id ?? response?._id;
      if (sessionId) {
        const fitData = {
          sport:            protocol.sport || 'bike',
          totalElapsedTime: totalTestTime,
          records:          historicalData.map((m, i) => ({
            timestamp:    new Date(startTime.getTime() + (m.totalTime ?? i) * 1000),
            power:        m.power,       heartRate: m.heartRate,
            speed:        m.speed,       cadence:   m.cadence,
            smo2:         m.smo2,        thb:       m.thb,
            coreTemp:     m.coreTemp,    vo2:       m.vo2,
            step:         m.step,        intervalTime: m.intervalTime,
            totalTime:    m.totalTime,
          })),
          laps: protocol.steps.map((step, idx) => {
            const sd = historicalData.filter(d => d.step === idx);
            const lv = lactateValues.find(l => l.step === idx + 1);
            return {
              lapNumber:        idx + 1,
              totalElapsedTime: sd.length || protocol.workDuration,
              avgPower:         sd.length ? Math.round(sd.reduce((s, d) => s + (d.power || 0), 0) / sd.length) : step.targetPower,
              avgHeartRate:     sd.filter(d => d.heartRate).length
                ? Math.round(sd.filter(d => d.heartRate).reduce((s, d) => s + d.heartRate, 0) / sd.filter(d => d.heartRate).length)
                : null,
              lactate: lv?.lactate ?? null,
            };
          }),
        };
        await completeLactateSession(sessionId, { fitFileData: fitData });
        setSavedSessionId(sessionId);

        // ── Also save into Testing DB so the lactate curve is visible in /testing ──
        if (lactateValues.length > 0) {
          try {
            const testResults = lactateValues.map((lv) => {
              const stepData = historicalData.filter(d => d.step === lv.step - 1);
              const hrVals   = stepData.map(d => d.heartRate).filter(v => v > 0);
              const avgHR    = hrVals.length ? Math.round(hrVals.reduce((a, b) => a + b, 0) / hrVals.length) : null;
              const vo2Vals  = stepData.map(d => d.vo2).filter(v => v > 0);
              const avgVo2   = vo2Vals.length ? +(vo2Vals.reduce((a, b) => a + b, 0) / vo2Vals.length).toFixed(1) : null;
              return {
                interval:      lv.step,
                power:         lv.power,
                heartRate:     avgHR,
                lactate:       lv.lactate,
                vo2:           avgVo2,
                RPE:           lv.borg   ?? null,
                duration:      protocol.workDuration ?? 360,
                intervalType:  'work',
              };
            });
            await addTest({
              athleteId: user._id,
              sport:     (protocol.sport || 'bike').toLowerCase(),
              title:     `Lactate Test – ${new Date(startTime).toLocaleDateString()}`,
              date:      startTime.toISOString(),
              description: `Auto-saved from Lactate Testing session. Duration: ${Math.round(totalTestTime / 60)} min, ${lactateValues.length} samples.`,
              results:   testResults,
              lactateSessionId: sessionId,   // link back to raw session
            });
            addNotification('Test saved & added to Testing', 'success');
          } catch (testErr) {
            console.warn('[LactateTest] addTest failed (non-critical):', testErr?.message || testErr);
            if (testErr?.response?.status === 403 && testErr?.response?.data?.error === 'FREE_PLAN_LIMIT') {
              addNotification('Free plan limit reached — upgrade to Pro to save unlimited tests', 'error');
              setShowUpgradeModal(true);
            } else {
              addNotification('Test saved (Testing DB link failed)', 'warning');
            }
          }
        } else {
          addNotification('Test saved', 'success');
        }
      }
    } catch (err) {
      console.error('Save error:', err);
      addNotification(err?.response?.data?.message ?? 'Failed to save test', 'error');
    }
  };

  // ── Cleanup on unmount ─────────────────────────────────────
  useEffect(() => () => {
    [intervalTimerRef.current, testTimerRef.current, dataCollectionRef.current,
     countdownRef.current, recoveryTimerRef.current, warmupTimerRef.current, cooldownTimerRef.current]
      .forEach(r => { if (r) clearInterval(r); });
  }, []);

  // ── Other devices ──────────────────────────────────────────
  const connectOtherDevice = async (key, label) => {
    if (!navigator.bluetooth && !isCapacitorNative()) { addNotification('Web Bluetooth is only supported in Chrome or Edge on desktop. Use the mobile app for Bluetooth on iOS.', 'error'); return; }
    try {
      addNotification(`Connecting ${label}…`, 'info');
      await deviceConnectivity.connectWebBluetooth(key, (data) => {
        setDevices(prev => ({ ...prev, [key]: { connected: true, data } }));
        setLiveData(prev => { const upd = { ...prev, ...data, timestamp: Date.now() }; liveDataRef.current = upd; return upd; });
      });
      addNotification(`${label} connected`, 'success');
    } catch (err) { addNotification(`Failed to connect ${label}: ${err.message}`, 'error'); }
  };

  const disconnectOtherDevice = async (key) => {
    try {
      await deviceConnectivity.disconnectDevice(key);
      setDevices(prev => ({ ...prev, [key]: { connected: false, data: null } }));
    } catch (err) { console.error(err); }
  };

  // ── Previous sessions ──────────────────────────────────────
  const [previousSessions, setPreviousSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedSession,   setSelectedSession]   = useState(null);
  const [loadingSessions,   setLoadingSessions]   = useState(false);

  useEffect(() => {
    if (!user?._id) return;
    (async () => {
      try {
        setLoadingSessions(true);
        const resp = await getLactateSessions(user._id);
        const list = Array.isArray(resp.data) ? resp.data : (resp.data?.sessions ?? []);
        setPreviousSessions(list);
        if (list.length) setSelectedSessionId(list[0]._id);
      } catch { setPreviousSessions([]); }
      finally { setLoadingSessions(false); }
    })();
  }, [user?._id]);

  useEffect(() => {
    if (!selectedSessionId) return setSelectedSession(null);
    (async () => {
      try {
        setLoadingSessions(true);
        const resp = await getLactateSessionById(selectedSessionId);
        setSelectedSession(resp.data ?? resp);
      } catch { setSelectedSession(null); }
      finally { setLoadingSessions(false); }
    })();
  }, [selectedSessionId]);

  // ── Derived ────────────────────────────────────────────────
  const currentStepData      = protocol.steps[currentStep] ?? {};
  const targetPower          = currentStepData.targetPower ?? 0;
  const effectiveTargetPower = targetPower + wattOffset;
  const actualPower          = Math.round(liveData.power ?? 0);
  const powerDelta           = actualPower - effectiveTargetPower;
  const trainerConnected     = ['ready', 'controlled', 'erg_active'].includes(trainer.status);
  const ergActive            = ['controlled', 'erg_active'].includes(trainer.status);
  const stepProgress         = Math.min(intervalTimer / (currentStepData.duration || 360), 1);
  const recoveryProgress     = Math.min(recoveryTimer   / (protocol.recoveryDuration   || 60),  1);
  const cooldownProgress     = Math.min(cooldownTimer   / (cooldown.duration || 1), 1);
  const warmupDuration       = warmup.type === 'fixed' ? warmup.duration : warmup.stepDuration;
  const warmupProgress       = Math.min(warmupTimer / (warmupDuration || 1), 1);
  const stepLactateEntered   = lactateValues.some(l => l.step === currentStep + 1);
  const stepHistorical       = historicalData.filter(d => d.step === currentStep);
  const avgStepPower         = stepHistorical.length
    ? Math.round(stepHistorical.reduce((s, d) => s + (d.power || 0), 0) / stepHistorical.length) : null;
  const hrPoints             = stepHistorical.filter(d => d.heartRate && d.heartRate > 0);
  // eslint-disable-next-line no-unused-vars
  const avgStepHR            = hrPoints.length
    ? Math.round(hrPoints.reduce((s, d) => s + d.heartRate, 0) / hrPoints.length) : null;
  const isLastStep           = currentStep + 1 >= protocol.steps.length;

  // ── Estimated total time ───────────────────────────────────
  const estimatedMainTime = protocol.steps.length * (protocol.workDuration + protocol.recoveryDuration);
  const estimatedWarmupTime = warmup.enabled
    ? (warmup.type === 'fixed' ? warmup.duration : warmup.stepCount * warmup.stepDuration)
    : 0;
  const estimatedCooldownTime = cooldown.enabled ? cooldown.duration : 0;
  const estimatedTotal = estimatedMainTime + estimatedWarmupTime + estimatedCooldownTime;

  // ── Warmup power for current warmup step ──────────────────
  const currentWarmupPower = warmup.type === 'fixed' ? warmup.power : getWarmupStepPower(warmupStep, warmup);

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/20 pb-20">

      {/* ── Modals ─────────────────────────────────────────── */}
      {showTrainerModal && (
        <TrainerConnectModal isOpen={showTrainerModal} onClose={() => setShowTrainerModal(false)} trainer={trainer} />
      )}
      {showProtocolEdit && (
        <ProtocolEditModal
          isOpen={showProtocolEdit}
          onClose={() => setShowProtocolEdit(false)}
          protocol={protocol}
          onProtocolUpdate={(p) => { setProtocol(p); setShowProtocolEdit(false); addNotification('Protocol updated', 'success'); }}
          testState={testState}
          currentStep={currentStep}
        />
      )}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        feature="Unlimited Tests"
        requiredPlan="pro"
      />

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ACTIVE TEST VIEW (scrollable white-card)                  */}
      {/* ══════════════════════════════════════════════════════════ */}
      {(testState === 'running' || testState === 'paused') && (
        <div className="w-full px-2 sm:px-4 py-3 space-y-3">

          {/* Sticky header bar */}
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-lg rounded-2xl shadow-md border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                    phase === 'work'      ? (testState === 'paused' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700') :
                    phase === 'recovery'  ? 'bg-sky-100 text-sky-700' :
                    phase === 'warmup'    ? 'bg-amber-100 text-amber-700' :
                    phase === 'cooldown'  ? 'bg-teal-100 text-teal-700' :
                    phase === 'countdown' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {phase === 'work'
                      ? (testState === 'paused' ? '⏸ Paused' : `Step ${currentStep + 1} / ${protocol.steps.length}`)
                      : phase === 'recovery'  ? `Recovery · Step ${currentStep + 1}`
                      : phase === 'warmup'    ? `Warmup${warmup.type === 'steps' ? ` ${warmupStep + 1}/${warmup.stepCount}` : ''}`
                      : phase === 'cooldown'  ? 'Cooldown'
                      : phase === 'countdown' ? 'Get Ready'
                      : phase}
                  </span>
                  <span className="text-sm text-gray-400 tabular-nums font-semibold">{fmtTime(totalTestTime)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {testState === 'running' ? (
                  <button onClick={handlePauseTest}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200 active:bg-amber-100 transition-colors">
                    <PauseIcon className="w-5 h-5" />
                  </button>
                ) : (
                  <button onClick={handleResumeTest}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 active:bg-emerald-100 transition-colors">
                    <PlayIcon className="w-5 h-5" />
                  </button>
                )}
                {phase === 'work' && testState === 'running' && (
                  <button onClick={handleSkipInterval}
                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-orange-50 text-orange-600 border border-orange-200 active:bg-orange-100 transition-colors">
                    <ForwardIcon className="w-5 h-5" />
                  </button>
                )}
                <button onClick={handleStopTest}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-50 text-red-600 border border-red-200 active:bg-red-100 transition-colors">
                  <StopIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Step progress dots */}
            {phase !== 'warmup' && phase !== 'cooldown' && (
              <div className="mt-3">
                <StepProgressBar steps={protocol.steps} currentStep={currentStep} lactateValues={lactateValues} />
              </div>
            )}
          </div>

          {/* Phase content */}
          <AnimatePresence mode="wait">

            {/* WORK */}
            {phase === 'work' && (
              <motion.div key="work"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* ── Live metric strip ── */}
                <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-3">
                  <div className="flex items-stretch gap-3 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>

                    {/* WATTS — actual (+ target as small badge) */}
                    {trainerConnected && (
                      <div className={`flex-shrink-0 flex flex-col items-center justify-center min-w-[90px] px-4 py-3 rounded-xl border transition-colors ${
                        Math.abs(powerDelta) <= 15 ? 'border-emerald-200 bg-emerald-50/60' :
                        Math.abs(powerDelta) <= 30 ? 'border-amber-200 bg-amber-50/60' : 'border-red-200 bg-red-50/60'
                      }`}>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5 flex items-center gap-0.5">
                          <BoltIcon className="w-3 h-3" /> Watts
                        </div>
                        <div className={`text-5xl font-black tabular-nums leading-none ${
                          Math.abs(powerDelta) <= 15 ? 'text-emerald-700' :
                          Math.abs(powerDelta) <= 30 ? 'text-amber-700' : 'text-red-700'
                        }`}>{actualPower}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {effectiveTargetPower != null && (
                            <span className="text-[10px] text-indigo-500 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded-full">
                              target {effectiveTargetPower}W
                            </span>
                          )}
                          {Math.abs(powerDelta) > 5 && (
                            <span className={`text-[10px] font-bold ${powerDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {powerDelta > 0 ? `+${powerDelta}` : powerDelta}W
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* HR */}
                    {devices.heartRate?.connected && (
                      <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[80px] px-4 py-3 rounded-xl border border-rose-100 bg-rose-50/50">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-rose-400 mb-0.5 flex items-center gap-0.5">
                          <HeartIcon className="w-3 h-3" /> HR
                        </div>
                        <div className="text-5xl font-black tabular-nums leading-none text-rose-700">
                          {liveData.heartRate > 0 ? Math.round(liveData.heartRate) : '—'}
                        </div>
                        <div className="text-[10px] text-rose-300 mt-1">bpm</div>
                      </div>
                    )}

                    {/* Cadence */}
                    {trainerConnected && (
                      <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[80px] px-4 py-3 rounded-xl border border-sky-100 bg-sky-50/50">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-sky-400 mb-0.5">CAD</div>
                        <div className="text-5xl font-black tabular-nums leading-none text-sky-700">
                          {liveData.cadence > 0 ? Math.round(liveData.cadence) : '—'}
                        </div>
                        <div className="text-[10px] text-sky-300 mt-1">rpm</div>
                      </div>
                    )}

                    {/* Speed (non-trainer or when no power) */}
                    {devices.bikeTrainer?.connected && !trainerConnected && liveData.speed > 0 && (
                      <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[80px] px-4 py-3 rounded-xl border border-orange-100 bg-orange-50/50">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-orange-400 mb-0.5">SPEED</div>
                        <div className="text-5xl font-black tabular-nums leading-none text-orange-700">
                          {liveData.speed.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-orange-300 mt-1">km/h</div>
                      </div>
                    )}

                    {/* SmO₂ */}
                    {devices.moxy?.connected && liveData.smo2 > 0 && (
                      <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[80px] px-4 py-3 rounded-xl border border-yellow-100 bg-yellow-50/50">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-yellow-500 mb-0.5">SmO₂</div>
                        <div className="text-5xl font-black tabular-nums leading-none text-yellow-700">
                          {liveData.smo2.toFixed(0)}
                        </div>
                        <div className="text-[10px] text-yellow-400 mt-1">%</div>
                      </div>
                    )}

                    {/* THb */}
                    {devices.moxy?.connected && liveData.thb > 0 && (
                      <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[80px] px-4 py-3 rounded-xl border border-orange-100 bg-orange-50/50">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-orange-400 mb-0.5">THb</div>
                        <div className="text-5xl font-black tabular-nums leading-none text-orange-700">
                          {liveData.thb.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-orange-300 mt-1">μM</div>
                      </div>
                    )}

                    {/* VO₂ */}
                    {devices.vo2master?.connected && liveData.vo2 > 0 && (
                      <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[80px] px-4 py-3 rounded-xl border border-purple-100 bg-purple-50/50">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-purple-400 mb-0.5">VO₂</div>
                        <div className="text-4xl font-black tabular-nums leading-none text-purple-700">
                          {liveData.vo2.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-purple-300 mt-1">ml/min/kg</div>
                      </div>
                    )}

                    {/* Core Temp */}
                    {devices.coreTemp?.connected && liveData.coreTemp > 0 && (
                      <div className="flex-shrink-0 flex flex-col items-center justify-center min-w-[80px] px-4 py-3 rounded-xl border border-red-100 bg-red-50/50">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-red-400 mb-0.5">TEMP</div>
                        <div className="text-5xl font-black tabular-nums leading-none text-red-700">
                          {liveData.coreTemp.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-red-300 mt-1">°C</div>
                      </div>
                    )}

                    {/* No devices connected placeholder */}
                    {!trainerConnected && !devices.heartRate?.connected && (
                      <div className="flex-1 flex flex-col items-center justify-center py-4 text-gray-300">
                        <div className="text-sm font-semibold">No devices</div>
                        <div className="text-xs">Connect trainer or HR monitor</div>
                      </div>
                    )}

                    {/* Spacer push + ERG status chip at end */}
                    <div className="flex-1" />
                    <div className="flex-shrink-0 flex flex-col items-center justify-center px-3 py-2 rounded-xl border border-gray-100 bg-white/60 min-w-[64px]">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-0.5">ERG</div>
                      <div className={`text-sm font-black ${ergActive ? 'text-emerald-600' : 'text-gray-300'}`}>
                        {ergActive ? 'ON' : 'OFF'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timer progress */}
                <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-4">
                  <div className="flex justify-between text-sm text-gray-500 mb-2 tabular-nums">
                    <span className="font-semibold text-gray-700">{fmtTime(intervalTimer)}</span>
                    <span>{fmtTime(currentStepData.duration || 360)}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-indigo-500 rounded-full"
                      animate={{ width: `${stepProgress * 100}%` }}
                      transition={{ duration: 0.8, ease: 'linear' }}
                    />
                  </div>
                </div>

                {/* Watt adjust */}
                {ergActive && testState === 'running' && (
                  <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-4">
                    <div className="text-xs font-semibold text-gray-400 mb-3 text-center uppercase tracking-wide">Adjust Target</div>
                    <div className="flex gap-2">
                      {[-20, -10, -5].map(d => (
                        <button key={d} onClick={() => adjustWatts(d)}
                          className="flex-1 py-3 bg-red-50 text-red-600 rounded-xl text-sm font-black active:scale-95 transition-all border border-red-100 hover:bg-red-100">
                          {d}
                        </button>
                      ))}
                      {[5, 10, 20].map(d => (
                        <button key={d} onClick={() => adjustWatts(d)}
                          className="flex-1 py-3 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-black active:scale-95 transition-all border border-emerald-100 hover:bg-emerald-100">
                          +{d}
                        </button>
                      ))}
                      {wattOffset !== 0 && (
                        <button onClick={() => adjustWatts(-wattOffset)}
                          className="flex-shrink-0 px-3 py-3 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold active:scale-95">
                          ↺
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* RECOVERY */}
            {phase === 'recovery' && (
              <motion.div key="recovery"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                {/* Recovery timer */}
                <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-sky-100 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-bold text-sky-600">
                      Interval {currentStep + 1} complete
                      {avgStepPower != null && <span className="text-gray-400 font-normal"> · avg {avgStepPower}W</span>}
                    </div>
                    <div className="text-sm font-black text-sky-700 tabular-nums">
                      {fmtTime(recoveryTimer)} / {fmtTime(protocol.recoveryDuration)}
                    </div>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-sky-400 rounded-full"
                      animate={{ width: `${recoveryProgress * 100}%` }}
                      transition={{ duration: 0.8, ease: 'linear' }}
                    />
                  </div>
                </div>

                {/* Lactate input */}
                {!stepLactateEntered ? (
                  <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-5 space-y-4">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wide text-center">Enter Lactate Value</div>
                    <div className="flex items-center gap-2 justify-center">
                      <input
                        ref={lactateInputRef}
                        type="number" step="0.1" min="0.1" max="25"
                        value={lactateInput}
                        onChange={e => setLactateInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && lactateInput && handleAddLactate()}
                        placeholder="0.0"
                        className="w-40 text-center text-5xl font-black text-primary tabular-nums outline-none border-b-2 border-primary/30 pb-2 focus:border-primary transition-colors bg-transparent"
                      />
                      <span className="text-sm font-bold text-gray-400">mmol/L</span>
                    </div>
                    {/* BORG selector */}
                    <div>
                      <div className="text-xs font-semibold text-gray-400 mb-2 text-center">BORG (optional)</div>
                      <div className="flex gap-1.5 flex-wrap justify-center">
                        {[6, 9, 11, 13, 15, 17, 19, 20].map(b => (
                          <button key={b}
                            onClick={() => setBorgInput(String(borgInput) === String(b) ? '' : String(b))}
                            className={`px-3 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                              String(borgInput) === String(b)
                                ? 'bg-primary text-white'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >{b}</button>
                        ))}
                      </div>
                      {borgInput && BORG_LABELS[borgInput] && (
                        <div className="text-center text-xs text-gray-500 mt-1">{BORG_LABELS[borgInput]}</div>
                      )}
                    </div>
                    <button onClick={handleAddLactate} disabled={!lactateInput}
                      className="w-full py-4 bg-primary text-white rounded-2xl text-base font-black disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-sm shadow-primary/20 flex items-center justify-center gap-2">
                      <CheckCircleIcon className="w-5 h-5" /> Save Lactate
                    </button>
                  </div>
                ) : (
                  <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-emerald-100 p-5 flex flex-col items-center gap-3">
                    <CheckCircleSolid className="w-10 h-10 text-emerald-500" />
                    <div className="text-center">
                      <div className="text-4xl font-black text-emerald-700 tabular-nums">
                        {lactateValues.find(l => l.step === currentStep + 1)?.lactate.toFixed(1)}
                        <span className="text-base font-bold text-emerald-400 ml-1">mmol/L</span>
                      </div>
                      {lactateValues.find(l => l.step === currentStep + 1)?.borg && (
                        <div className="text-sm text-gray-400 mt-1">
                          BORG {lactateValues.find(l => l.step === currentStep + 1)?.borg}
                          {BORG_LABELS[lactateValues.find(l => l.step === currentStep + 1)?.borg] && (
                            <span className="ml-1">· {BORG_LABELS[lactateValues.find(l => l.step === currentStep + 1)?.borg]}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Next interval button */}
                <button onClick={handleStartInterval}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-base font-black active:scale-[0.98] transition-all shadow-sm shadow-emerald-600/20 flex items-center justify-center gap-2">
                  {isLastStep
                    ? cooldown.enabled
                      ? <><SparklesIcon className="w-5 h-5" /> Start Cooldown</>
                      : <><FlagIcon className="w-5 h-5" /> Finish Test</>
                    : <><PlayIcon className="w-5 h-5" /> Next Interval</>
                  }
                </button>
              </motion.div>
            )}

            {/* WARMUP */}
            {phase === 'warmup' && (
              <motion.div key="warmup"
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-amber-100 p-5">
                  <div className="text-center mb-4">
                    <div className="text-xs font-bold text-amber-500 uppercase tracking-wide mb-2">Warmup Target</div>
                    <div className="text-8xl font-black text-amber-700 tabular-nums leading-none">{currentWarmupPower}</div>
                    <div className="text-sm text-amber-500 font-semibold mt-1">watts</div>
                    {trainerConnected && (
                      <div className="text-2xl font-black text-gray-400 tabular-nums mt-2">
                        {actualPower}<span className="text-sm ml-1 font-normal">actual</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5 tabular-nums">
                    <span>{fmtTime(warmupTimer)}</span>
                    <span>{fmtTime(warmup.type === 'fixed' ? warmup.duration : warmup.stepDuration)}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
                    <motion.div className="h-full bg-amber-400 rounded-full"
                      animate={{ width: `${warmupProgress * 100}%` }}
                      transition={{ duration: 0.8, ease: 'linear' }}
                    />
                  </div>
                  <button onClick={handleSkipWarmup}
                    className="w-full py-3 bg-amber-50 text-amber-700 rounded-xl text-sm font-bold border border-amber-200 active:scale-[0.98] transition-all">
                    Skip Warmup →
                  </button>
                </div>
              </motion.div>
            )}

            {/* COOLDOWN */}
            {phase === 'cooldown' && (
              <motion.div key="cooldown"
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-teal-100 p-5">
                  <div className="text-center mb-4">
                    <div className="text-xs font-bold text-teal-500 uppercase tracking-wide mb-2">Cooldown Target</div>
                    <div className="text-8xl font-black text-teal-700 tabular-nums leading-none">{cooldown.power}</div>
                    <div className="text-sm text-teal-500 font-semibold mt-1">watts</div>
                    {trainerConnected && (
                      <div className="text-2xl font-black text-gray-400 tabular-nums mt-2">
                        {actualPower}<span className="text-sm ml-1 font-normal">actual</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5 tabular-nums">
                    <span>{fmtTime(cooldownTimer)}</span>
                    <span>{fmtTime(cooldown.duration)}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
                    <motion.div className="h-full bg-teal-400 rounded-full"
                      animate={{ width: `${cooldownProgress * 100}%` }}
                      transition={{ duration: 0.8, ease: 'linear' }}
                    />
                  </div>
                  <button onClick={handleStopTest}
                    className="w-full py-3 bg-teal-50 text-teal-700 rounded-xl text-sm font-bold border border-teal-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                    <FlagIcon className="w-4 h-4" /> Finish Now
                  </button>
                </div>
              </motion.div>
            )}

            {/* COUNTDOWN */}
            {phase === 'countdown' && (
              <motion.div key="countdown"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <AnimatePresence mode="wait">
                  <motion.div key={countdown}
                    initial={{ scale: 1.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.7, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    className="text-[8rem] font-black text-primary leading-none tabular-nums"
                  >
                    {countdown}
                  </motion.div>
                </AnimatePresence>
                <div className="text-base font-bold text-gray-500 mt-4">Next interval starting…</div>
                <div className="text-sm text-gray-400 mt-1">
                  Step {currentStep + 1}: <span className="text-primary font-bold">{protocol.steps[currentStep]?.targetPower}W</span>
                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* ── CHARTS ROW: Session Metrics + Lactate Curve side-by-side on wide screens ── */}
          {(historicalData.length > 0 || lactateValues.length > 0) && (
            <div className={`grid gap-3 ${
              historicalData.length > 0 && lactateValues.length > 0
                ? 'grid-cols-1 lg:grid-cols-2'
                : 'grid-cols-1'
            }`}>

              {/* Session Metrics (LiveDashboard) */}
              {historicalData.length > 0 && (
                <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-2">
                  <h3 className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5 px-1">
                    <ChartBarIcon className="w-3.5 h-3.5 text-primary" /> Session Metrics
                  </h3>
                  <LiveDashboard
                    liveData={liveData}
                    devices={devices}
                    testState={testState}
                    historicalData={historicalData}
                    intervalTimer={intervalTimer}
                    protocol={protocol}
                    currentStep={currentStep}
                  />
                </div>
              )}

              {/* Lactate Curve (live, updates after each entry) */}
              {lactateValues.length > 0 && (
                <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <BeakerIcon className="w-4 h-4 text-primary" /> Lactate Curve
                  </h3>
                  <LactateChart lactateValues={lactateValues} historicalData={historicalData} embedded />
                </div>
              )}

            </div>
          )}

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SETUP + COMPLETED VIEWS (normal page flow)               */}
      {/* ══════════════════════════════════════════════════════════ */}
      {(testState === 'idle' || testState === 'completed') && (
      <div className="w-full px-2 sm:px-4 py-4 space-y-4">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              <BeakerIcon className="inline w-7 h-7 mr-2 text-primary align-middle" />Lactate Testing
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {testState === 'idle'
                ? 'Configure your step protocol and connect devices'
                : `Test complete · ${fmtTime(totalTestTime)} · ${lactateValues.length} lactate samples`}
            </p>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════ */}
        {/* SETUP VIEW                                        */}
        {/* ══════════════════════════════════════════════════ */}
        {testState === 'idle' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Protocol Setup */}
            <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  <span className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center"><ClipboardDocumentListIcon className="w-4 h-4 text-primary" /></span>
                  Protocol Setup
                </h2>
                {protocol.steps.length > 0 && (
                  <button onClick={() => setShowProtocolEdit(true)}
                    className="text-xs text-primary hover:text-primary/70 flex items-center gap-1 transition-colors">
                    <Cog6ToothIcon className="w-3.5 h-3.5" /> Edit steps
                  </button>
                )}
              </div>

              {/* Sport selector */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Sport</label>
                <div className="flex gap-2">
                  {[
                    { key: 'bike', label: 'Bike', icon: '/icon/bike.svg' },
                    { key: 'run',  label: 'Run',  icon: '/icon/run.svg'  },
                    { key: 'swim', label: 'Swim', icon: '/icon/swim.svg' },
                  ].map(s => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setProtocol(prev => ({ ...prev, sport: s.key }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                        protocol.sport === s.key
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <img src={s.icon} alt={s.label} className="w-4 h-4" />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Start Power',     key: 'startPower',       unit: 'W',   min: 20,  max: 500  },
                  { label: 'Power Increment', key: 'powerIncrement',   unit: 'W',   min: 5,   max: 100  },
                  { label: 'Work Duration',   key: 'workDuration',     unit: 'sec', min: 60,  max: 1200 },
                  { label: 'Recovery',        key: 'recoveryDuration', unit: 'sec', min: 0,   max: 600  },
                  { label: 'Max Steps',       key: 'maxSteps',         unit: '',    min: 1,   max: 20   },
                ].map(({ label, key, unit, min, max }) => (
                  <div key={key} className={key === 'maxSteps' ? 'col-span-2 sm:col-span-1' : ''}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number" min={min} max={max}
                        value={protocol[key]}
                        onChange={e => setProtocol(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                        className="w-full px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                      />
                      {unit && <span className="text-xs text-gray-400 flex-shrink-0">{unit}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Protocol Preview */}
              {protocol.steps.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Preview</div>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {protocol.steps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-3 px-3 py-2 bg-gray-50 hover:bg-gray-100/80 rounded-xl text-sm transition-colors">
                        <span className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{idx + 1}</span>
                        <span className="font-semibold text-gray-800 flex-1">{step.targetPower} W</span>
                        <span className="text-xs text-gray-400">{fmtTime(step.duration)}</span>
                        {idx > 0 && <span className="text-xs text-emerald-600 font-medium">+{protocol.powerIncrement}W</span>}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 text-right mt-1.5">
                    ~{fmtTime(estimatedTotal)} estimated
                    {(warmup.enabled || cooldown.enabled) && (
                      <span className="ml-1 text-primary/60">
                        (incl. {[warmup.enabled && 'warmup', cooldown.enabled && 'cooldown'].filter(Boolean).join(' + ')})
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* ── Warmup Settings ─────────────────────── */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><FireIcon className="w-4 h-4 text-amber-500" />Warmup</h3>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      onClick={() => setWarmup(prev => ({ ...prev, enabled: !prev.enabled }))}
                      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${warmup.enabled ? 'bg-primary' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${warmup.enabled ? 'translate-x-4' : ''}`} />
                    </div>
                    <span className="text-xs text-gray-500">{warmup.enabled ? 'On' : 'Off'}</span>
                  </label>
                </div>

                {warmup.enabled && (
                  <div className="space-y-3 pl-1">
                    {/* Type selector */}
                    <div className="flex gap-2">
                      {[['fixed', 'Fixed Power'], ['steps', 'Step Test']].map(([t, label]) => (
                        <button key={t}
                          onClick={() => setWarmup(prev => ({ ...prev, type: t }))}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                            warmup.type === t ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {warmup.type === 'fixed' ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Duration (sec)</label>
                          <input type="number" min={60} max={3600} value={warmup.duration}
                            onChange={e => setWarmup(prev => ({ ...prev, duration: Number(e.target.value) }))}
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Power (W)</label>
                          <input type="number" min={20} max={500} value={warmup.power}
                            onChange={e => setWarmup(prev => ({ ...prev, power: Number(e.target.value) }))}
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Steps</label>
                          <input type="number" min={2} max={10} value={warmup.stepCount}
                            onChange={e => setWarmup(prev => ({ ...prev, stepCount: Number(e.target.value) }))}
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Step Duration (sec)</label>
                          <input type="number" min={30} max={600} value={warmup.stepDuration}
                            onChange={e => setWarmup(prev => ({ ...prev, stepDuration: Number(e.target.value) }))}
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Start Power (W)</label>
                          <input type="number" min={20} max={400} value={warmup.startPower}
                            onChange={e => setWarmup(prev => ({ ...prev, startPower: Number(e.target.value) }))}
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">End Power (W)</label>
                          <input type="number" min={20} max={500} value={warmup.endPower}
                            onChange={e => setWarmup(prev => ({ ...prev, endPower: Number(e.target.value) }))}
                            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                        </div>
                      </div>
                    )}

                    {/* Warmup preview */}
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                      {warmup.type === 'fixed'
                        ? `Warmup: ${warmup.power}W · ${fmtTime(warmup.duration)}`
                        : `Warmup: ${warmup.stepCount} steps ${warmup.startPower}→${warmup.endPower}W · ${fmtTime(warmup.stepDuration)}/step · ${fmtTime(warmup.stepCount * warmup.stepDuration)} total`
                      }
                    </div>
                  </div>
                )}
              </div>

              {/* ── Cooldown Settings ────────────────────── */}
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><SparklesIcon className="w-4 h-4 text-sky-500" />Cooldown</h3>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      onClick={() => setCooldown(prev => ({ ...prev, enabled: !prev.enabled }))}
                      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${cooldown.enabled ? 'bg-primary' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cooldown.enabled ? 'translate-x-4' : ''}`} />
                    </div>
                    <span className="text-xs text-gray-500">{cooldown.enabled ? 'On' : 'Off'}</span>
                  </label>
                </div>

                {cooldown.enabled && (
                  <div className="space-y-3 pl-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Duration (sec)</label>
                        <input type="number" min={60} max={3600} value={cooldown.duration}
                          onChange={e => setCooldown(prev => ({ ...prev, duration: Number(e.target.value) }))}
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Power (W)</label>
                        <input type="number" min={20} max={300} value={cooldown.power}
                          onChange={e => setCooldown(prev => ({ ...prev, power: Number(e.target.value) }))}
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                      </div>
                    </div>
                    <div className="text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
                      Cooldown: {cooldown.power}W · {fmtTime(cooldown.duration)} after last step
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleStartTest}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
              >
                <PlayIcon className="w-5 h-5" /> Start Test
              </button>

              {!trainerConnected && (
                <p className="text-xs text-amber-600 text-center flex items-center justify-center gap-1"><ExclamationTriangleIcon className="w-3.5 h-3.5" />Connect trainer for automatic ERG control</p>
              )}
            </div>

            {/* Device Connections */}
            <div className="space-y-3">

              {/* Smart Trainer */}
              <div className={`bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border p-5 transition-all duration-300 ${
                ergActive        ? 'border-emerald-300 bg-emerald-50/30' :
                trainerConnected ? 'border-blue-200 bg-blue-50/20'       :
                                   'border-white/60'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0"><CpuChipIcon className="w-5 h-5 text-gray-500" /></div>
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">Smart Trainer</div>
                      <div className="text-xs text-gray-500">Bluetooth FTMS · ERG Mode</div>
                    </div>
                  </div>
                  <TrainerStatusBadge status={trainer.status} />
                </div>

                {trainerConnected && (
                  <div className="mb-3 p-3 bg-white/70 rounded-xl border border-white/50">
                    <div className="text-xs text-gray-500 mb-2 font-medium">
                      {trainer.connectedDevice?.name ?? 'Connected Device'}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: 'Power',   val: trainer.telemetry?.power   != null ? `${Math.round(trainer.telemetry.power)}W`    : '—', color: 'text-primary' },
                        { label: 'Cadence', val: trainer.telemetry?.cadence != null ? `${Math.round(trainer.telemetry.cadence)}`    : '—', color: 'text-gray-700' },
                        { label: 'Speed',   val: trainer.telemetry?.speed   != null ? `${(Math.round(trainer.telemetry.speed * 10) / 10).toFixed(1)}` : '—', color: 'text-gray-700' },
                      ].map(m => (
                        <div key={m.label}>
                          <div className={`text-xl font-black tabular-nums ${m.color}`}>{m.val}</div>
                          <div className="text-[10px] text-gray-400">{m.label}</div>
                        </div>
                      ))}
                    </div>
                    {ergActive && (
                      <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-emerald-700 font-semibold">
                        <BoltSolid className="w-3.5 h-3.5 text-emerald-500" /> ERG control active
                      </div>
                    )}
                  </div>
                )}

                {trainer.error && (
                  <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">{trainer.error}</div>
                )}

                <button
                  onClick={() => setShowTrainerModal(true)}
                  className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                    trainerConnected
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-primary text-white hover:bg-primary/90 shadow-sm shadow-primary/20'
                  }`}
                >
                  {trainerConnected
                    ? <><WrenchScrewdriverIcon className="inline w-4 h-4 mr-1" />Manage Trainer</>
                    : <><LinkIcon className="inline w-4 h-4 mr-1" />Connect Trainer</>
                  }
                </button>
              </div>

              {/* Other sensors */}
              <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Additional Sensors</h3>
                <div className="space-y-2">
                  {[
                    { key: 'heartRate', Icon: HeartIcon,   iconCls: 'text-rose-500',  label: 'Heart Rate Monitor', val: devices.heartRate?.data?.heartRate, unit: 'bpm'         },
                    { key: 'moxy',      Icon: ChartBarIcon, iconCls: 'text-blue-500', label: 'Moxy (SmO₂ / tHb)',  val: devices.moxy?.data?.smo2,          unit: '% SmO₂'       },
                    { key: 'coreTemp',  Icon: SunIcon,      iconCls: 'text-orange-500',label: 'Core Temperature',  val: devices.coreTemp?.data?.coreTemp,  unit: '°C'           },
                    { key: 'vo2master', Icon: SignalIcon,   iconCls: 'text-purple-500',label: 'VO₂ Master',        val: devices.vo2master?.data?.vo2,      unit: 'ml/kg/min'    },
                  ].map(({ key, Icon, iconCls, label, val, unit }) => {
                    const conn = devices[key]?.connected;
                    return (
                      <div key={key} className={`flex items-center justify-between p-2.5 rounded-xl transition-colors ${conn ? 'bg-emerald-50/60 border border-emerald-100' : 'bg-gray-50/60'}`}>
                        <div className="flex items-center gap-2.5">
                          <Icon className={`w-5 h-5 ${iconCls}`} />
                          <div>
                            <div className="text-xs font-medium text-gray-700">{label}</div>
                            {conn && val != null && (
                              <div className="text-xs text-emerald-600 font-semibold">{Math.round(val * 10) / 10} {unit}</div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => conn ? disconnectOtherDevice(key) : connectOtherDevice(key, label)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors flex-shrink-0 ${
                            conn ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          {conn ? 'Disconnect' : 'Connect'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* COMPLETED VIEW                                    */}
        {/* ══════════════════════════════════════════════════ */}
        {testState === 'completed' && (
          <div className="space-y-5">

            <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-5">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Test Complete</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {new Date().toLocaleDateString()} · {fmtTime(totalTestTime)} total
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0 flex-wrap">
                  <button onClick={handleSaveTest}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                    <ChartBarIcon className="w-4 h-4" /> Save
                  </button>
                  {savedSessionId && (
                    <button
                      onClick={async () => {
                        try {
                          const blob = await downloadLactateSessionFit(savedSessionId);
                          const url  = URL.createObjectURL(blob);
                          const a    = document.createElement('a');
                          a.href     = url;
                          a.download = `lachart-${new Date().toISOString().slice(0,10)}.fit`;
                          a.click();
                          URL.revokeObjectURL(url);
                          addNotification('FIT file downloaded', 'success');
                        } catch {
                          addNotification('Failed to download FIT file', 'error');
                        }
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm">
                      <DownloadIcon className="w-4 h-4" /> Export FIT
                    </button>
                  )}
                  <button onClick={handleClearTest}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors">
                    <TrashIcon className="w-4 h-4" /> Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Duration',       val: fmtTime(totalTestTime),                              unit: '' },
                  { label: 'Samples',        val: lactateValues.length,                                 unit: 'lactate' },
                  { label: 'Peak Lactate',   val: lactateValues.length ? Math.max(...lactateValues.map(l => l.lactate)).toFixed(1) : '—', unit: 'mmol/L' },
                  { label: 'Avg Heart Rate', val: hrPoints.length ? Math.round(hrPoints.reduce((s, d) => s + d.heartRate, 0) / hrPoints.length) : '—', unit: 'bpm' },
                ].map(({ label, val, unit }) => (
                  <div key={label} className="bg-gray-50 rounded-2xl p-3 text-center">
                    <div className="text-2xl font-black text-gray-900 tabular-nums leading-none">{val}</div>
                    {unit && <div className="text-xs text-gray-400 mt-0.5">{unit}</div>}
                    <div className="text-xs text-gray-500 mt-1">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Interval table */}
            {lactateValues.length > 0 && (
              <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Interval Summary</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                        <th className="text-left py-2 pr-4">Step</th>
                        <th className="text-right py-2 pr-4">Target</th>
                        <th className="text-right py-2 pr-4">Avg Power</th>
                        <th className="text-right py-2 pr-4">Avg HR</th>
                        <th className="text-right py-2">Lactate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {protocol.steps.map((step, idx) => {
                        const lv = lactateValues.find(l => l.step === idx + 1);
                        const sh = historicalData.filter(d => d.step === idx);
                        const ap = sh.length ? Math.round(sh.reduce((s, d) => s + (d.power || 0), 0) / sh.length) : null;
                        const hh = sh.filter(d => d.heartRate && d.heartRate > 0);
                        const ahr = hh.length ? Math.round(hh.reduce((s, d) => s + d.heartRate, 0) / hh.length) : null;
                        if (!lv && !ap) return null;
                        return (
                          <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                            <td className="py-2.5 pr-4 font-bold text-gray-800">
                              <span className="inline-flex items-center gap-1.5">
                                <CheckCircleSolid className="w-4 h-4 text-emerald-400" /> #{idx + 1}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 text-right text-gray-500">{step.targetPower}W</td>
                            <td className="py-2.5 pr-4 text-right font-semibold text-gray-700">{ap ? `${ap}W` : '—'}</td>
                            <td className="py-2.5 pr-4 text-right text-gray-600">{ahr ? `${ahr} bpm` : '—'}</td>
                            <td className="py-2.5 text-right">
                              {lv
                                ? <span className="font-black text-primary text-base">{lv.lactate.toFixed(1)}<span className="text-xs font-normal text-gray-400 ml-0.5">mmol/L</span></span>
                                : <span className="text-gray-300">—</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Lactate curve + Full session metrics — side by side on wide screens */}
            {(lactateValues.length > 0 || historicalData.length > 0) && (
              <div className={`grid gap-3 ${
                lactateValues.length > 0 && historicalData.length > 0
                  ? 'grid-cols-1 lg:grid-cols-2'
                  : 'grid-cols-1'
              }`}>
                {lactateValues.length > 0 && (
                  <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-3">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <ChartBarIcon className="w-4 h-4 text-primary" /> Lactate Curve Analysis
                    </h3>
                    <LactateChart lactateValues={lactateValues} historicalData={historicalData} embedded />
                  </div>
                )}
                {historicalData.length > 0 && (
                  <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-3">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Session Metrics</h3>
                    <LiveDashboard
                      liveData={liveData}
                      devices={devices}
                      testState="completed"
                      historicalData={historicalData}
                      intervalTimer={0}
                      protocol={protocol}
                      currentStep={currentStep}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* PREVIOUS SESSIONS                                 */}
        {/* ══════════════════════════════════════════════════ */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-sm border border-white/60 p-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <span className="w-6 h-6 bg-gray-100 rounded-lg flex items-center justify-center"><FolderIcon className="w-4 h-4 text-gray-500" /></span>
              Previous Sessions
            </h2>
            {previousSessions.length > 0 && (
              <select
                value={selectedSessionId}
                onChange={e => setSelectedSessionId(e.target.value)}
                className="text-sm px-3 py-1.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none max-w-[240px]"
              >
                {previousSessions.map(s => (
                  <option key={s._id} value={s._id}>
                    {new Date(s.completedAt ?? s.createdAt).toLocaleDateString()} · {s.sport ?? 'test'}
                  </option>
                ))}
              </select>
            )}
          </div>

          {loadingSessions && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
              <ArrowPathIcon className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
          {!loadingSessions && previousSessions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No previous sessions yet.</p>
          )}

          {!loadingSessions && selectedSession && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Sport',    val: selectedSession.sport ?? '—' },
                  { label: 'Duration', val: selectedSession.duration ? `${Math.round(selectedSession.duration / 60)} min` : '—' },
                  { label: 'Date',     val: new Date(selectedSession.completedAt ?? selectedSession.createdAt).toLocaleString() },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 font-medium mb-0.5">{label}</div>
                    <div className="text-sm font-semibold text-gray-800">{val}</div>
                  </div>
                ))}
              </div>

              {selectedSession?._id && (
                <button
                  onClick={async () => {
                    try {
                      const blob     = await downloadLactateSessionFit(selectedSession._id);
                      const url      = URL.createObjectURL(blob);
                      const dateStr  = new Date(selectedSession.completedAt ?? selectedSession.createdAt).toISOString().slice(0,10);
                      const a        = Object.assign(document.createElement('a'), {
                        href:     url,
                        download: `lachart-${selectedSession.sport || 'bike'}-${dateStr}.fit`,
                      });
                      document.body.appendChild(a); a.click();
                      URL.revokeObjectURL(url); document.body.removeChild(a);
                      addNotification('FIT file downloaded', 'success');
                    } catch { addNotification('Download failed', 'error'); }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors w-fit shadow-sm"
                >
                  <DownloadIcon className="w-4 h-4" /> Download FIT File
                </button>
              )}

              {/* Session chart */}
              {(() => {
                const normRec = (r, idx, t0) => {
                  const ts  = r.timestamp ? new Date(r.timestamp).getTime() : (t0 ? t0 + idx * 1000 : Date.now());
                  const toN = v => (v == null || isNaN(Number(v)) ? null : Number(v));
                  return {
                    timestamp: ts,
                    time:      t0 ? Math.max(0, (ts - t0) / 1000) : idx,
                    power: toN(r.power), heartRate: toN(r.heartRate), cadence: toN(r.cadence),
                    speed: toN(r.speed), smo2:      toN(r.smo2),     thb:     toN(r.thb),
                    vo2:   toN(r.vo2),   step:      toN(r.step),
                  };
                };
                let hist = [], lvs = [];
                const fit = selectedSession?.fitFile?.fitData;
                if (fit?.records?.length) {
                  const t0 = fit.records[0]?.timestamp ? new Date(fit.records[0].timestamp).getTime() : null;
                  hist = fit.records.map((r, i) => normRec(r, i, t0));
                  lvs  = (fit.laps ?? []).filter(l => typeof l.lactate === 'number')
                    .map((l, i) => ({ step: l.lapNumber ?? i + 1, power: l.avgPower ?? 0, lactate: l.lactate }));
                } else if (Array.isArray(selectedSession?.measurements) && selectedSession.measurements.length > 0) {
                  hist = selectedSession.measurements.map((m, i) => normRec(m, i, null));
                  lvs  = Array.isArray(selectedSession.lactateValues) ? selectedSession.lactateValues : [];
                }
                if (!lvs.length && !hist.length) return null;
                return <LactateChart lactateValues={lvs} historicalData={hist} embedded />;
              })()}
            </div>
          )}
        </div>

      </div>
      )}
    </div>
  );
};

export default LactateTestingPage;
