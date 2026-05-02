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
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import { BoltIcon as BoltSolid } from '@heroicons/react/24/solid';
import { motion, AnimatePresence } from 'framer-motion';
import { getPlannedWorkout, updatePlannedWorkout } from '../services/workoutPlannerApi';
import useBluetoothTrainer from '../hooks/useBluetoothTrainer';
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

  const timerRef = useRef(null);
  const ergSentRef = useRef(null); // last sent power target (to avoid redundant writes)
  // Power tracking for planned vs actual comparison
  const stepPowerRef = useRef({}); // { [stepIdx]: { sum, count } }
  const currentStepIdxRef = useRef(0); // mirror of currentStepIdx for closure access

  // Bluetooth
  const trainer = useBluetoothTrainer();

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

  // ── Sync step index ref ──────────────────────────────────────────────────────
  useEffect(() => {
    currentStepIdxRef.current = currentStepIdx;
  }, [currentStepIdx]);

  // ── ERG power sending ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ergMode || trainer.status !== 'connected') return;
    if (currentTargetWatts == null) return;
    if (ergSentRef.current === currentTargetWatts) return;
    ergSentRef.current = currentTargetWatts;
    trainer.setPower(currentTargetWatts);
  }, [ergMode, currentTargetWatts, trainer.status]); // eslint-disable-line

  // ── Accumulate actual power per step ─────────────────────────────────────────
  useEffect(() => {
    if (!isRunning || trainer.data.power == null) return;
    const idx = currentStepIdxRef.current;
    const prev = stepPowerRef.current[idx] || { sum: 0, count: 0 };
    stepPowerRef.current[idx] = { sum: prev.sum + trainer.data.power, count: prev.count + 1 };
  }, [trainer.data.power, isRunning]); // eslint-disable-line

  // ── Timer tick ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isRunning || isFinished) {
      clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setStepElapsed(prev => {
        const next = prev + 1;
        // Auto-advance step when duration reached (but not for open/0-duration steps)
        if (stepDuration > 0 && next >= stepDuration) {
          setCurrentStepIdx(idx => {
            const nextIdx = idx + 1;
            if (nextIdx >= expandedSteps.length) {
              setIsRunning(false);
              setIsFinished(true);
              return idx;
            }
            ergSentRef.current = null; // force re-send for next step
            return nextIdx;
          });
          return 0; // reset elapsed for new step
        }
        return next;
      });
      setTotalElapsed(t => t + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [isRunning, isFinished, stepDuration, expandedSteps.length]);

  // ── Controls ─────────────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    if (isFinished) return;
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
          return {
            stepType: s.stepType,
            label: s.label || s.stepType,
            durationSeconds: s.durationSeconds,
            targetWatts: s.powerTarget ? resolveTargetWatts(s.powerTarget, context) : null,
            actualAvgWatts: p && p.count > 0 ? Math.round(p.sum / p.count) : null,
          };
        }),
      };
      await updatePlannedWorkout(plannedWorkoutId, { status: 'completed', executionData });
      addNotification('Workout completed! Great job!', 'success');
    } catch (_) {}
    if (trainer.status === 'connected') trainer.disconnect();
    navigate(athleteId ? `/workout-planner?athleteId=${athleteId}` : '/workout-planner');
  }, [plannedWorkoutId, athleteId, trainer, navigate, addNotification, totalElapsed, expandedSteps, context]);

  // ── Abandon ──────────────────────────────────────────────────────────────────
  const handleAbandon = useCallback(() => {
    if (trainer.status === 'connected') trainer.disconnect();
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
      style={{ zIndex: 9999 }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button onClick={handleAbandon} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 text-center">
          <h1 className="text-sm font-bold truncate px-4">{workout.title || 'Workout'}</h1>
          <p className="text-xs text-gray-400">{fmtTime(totalElapsed)} / {fmtTime(totalDuration)}</p>
        </div>
        {/* ERG toggle */}
        <button
          onClick={() => setErgMode(e => !e)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            ergMode ? 'bg-primary border-primary text-white' : 'border-white/20 text-gray-400 hover:bg-white/10'
          }`}
        >
          <BoltSolid className="w-3.5 h-3.5" />
          ERG
        </button>
      </div>

      {/* ── Step mini-map ───────────────────────────────────────────────────── */}
      <div className="px-4 py-2">
        <StepMiniMap expandedSteps={expandedSteps} currentIdx={currentStepIdx} context={context} />
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
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
            <p className="text-gray-400 mb-8">{expandedSteps.length} steps completed</p>
            <button
              onClick={handleFinish}
              className="px-8 py-3 bg-primary rounded-2xl text-white font-bold text-lg hover:bg-primary/80 transition-colors"
            >
              Save & Finish
            </button>
          </motion.div>
        ) : (
          <>
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

                {/* Countdown */}
                <div className="text-7xl font-black tabular-nums leading-none mb-2"
                  style={{ color: stepRemaining <= 10 && stepRemaining > 0 ? '#ef4444' : col.bg }}
                >
                  {stepDuration > 0 ? fmtTime(stepRemaining) : fmtTime(stepElapsed)}
                </div>
                {stepDuration > 0 && (
                  <p className="text-gray-500 text-sm mb-4">of {fmtTime(stepDuration)}</p>
                )}

                {/* Power target */}
                {currentTargetWatts != null && (
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <BoltSolid className="w-5 h-5" style={{ color: col.bg }} />
                    <span className="text-2xl font-bold" style={{ color: col.bg }}>
                      {currentTargetWatts} W
                    </span>
                    <span className="text-gray-500 text-sm">
                      {resolveTargetLabel(currentStep?.powerTarget, context)}
                    </span>
                  </div>
                )}
                {currentStep?.powerTarget?.useRange && (
                  <p className="text-gray-500 text-sm">
                    {currentStep.powerTarget.rangeMin}–{currentStep.powerTarget.rangeMax} W
                  </p>
                )}
              </motion.div>
            </AnimatePresence>

            {/* ── Power Gauge (Bluetooth) ── */}
            {trainer.status === 'connected' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-xs">
                <PowerGauge
                  actual={trainer.data.power}
                  target={currentTargetWatts}
                  size={220}
                />
                <div className="flex justify-center gap-6 mt-1 text-xs text-gray-500">
                  {trainer.data.cadence != null && (
                    <span>{Math.round(trainer.data.cadence)} rpm</span>
                  )}
                  {trainer.data.heartRate != null && (
                    <span>♥ {trainer.data.heartRate} bpm</span>
                  )}
                  {powerDiff != null && Math.abs(powerDiff) > 5 && (
                    <span style={{ color: powerDiff > 0 ? '#ef4444' : '#22c55e' }}>
                      {powerDiff > 0 ? '+' : ''}{Math.round(powerDiff)} W
                    </span>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Next step preview ── */}
            {nextStep && (
              <div className="text-center text-sm text-gray-500">
                Next: <span className="text-gray-300 font-medium">
                  {nextStep.label || nextStep.stepType}
                </span>
                {nextStep.durationSeconds > 0 && (
                  <span className="ml-1">· {fmtTime(nextStep.durationSeconds)}</span>
                )}
                {nextStep.powerTarget && resolveTargetWatts(nextStep.powerTarget, context) && (
                  <span className="ml-1 text-gray-400">
                    @ {resolveTargetWatts(nextStep.powerTarget, context)} W
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Controls ────────────────────────────────────────────────────────── */}
      {!isFinished && (
        <div className="px-6 pb-8 pt-4 border-t border-white/10">
          <div className="flex items-center justify-center gap-6">
            {/* Prev step */}
            <button
              onClick={handlePrevStep}
              disabled={currentStepIdx === 0 && stepElapsed === 0}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors"
            >
              <BackwardIcon className="w-6 h-6" />
            </button>

            {/* Play/Pause */}
            <button
              onClick={handlePlayPause}
              className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold shadow-lg transition-all active:scale-95"
              style={{ backgroundColor: col.bg, boxShadow: `0 0 30px ${col.bg}55` }}
            >
              {isRunning
                ? <PauseIcon className="w-9 h-9" />
                : <PlayIcon className="w-9 h-9 ml-1" />
              }
            </button>

            {/* Next step */}
            <button
              onClick={handleNextStep}
              disabled={currentStepIdx >= expandedSteps.length - 1}
              className="p-3 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors"
            >
              <ForwardIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Bluetooth connect button */}
          <div className="flex justify-center mt-4">
            {trainer.status === 'disconnected' || trainer.status === 'error' ? (
              <button
                onClick={trainer.connect}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 text-sm text-gray-300 hover:bg-white/10 transition-colors"
              >
                <SignalIcon className="w-4 h-4" />
                Connect Trainer
              </button>
            ) : trainer.status === 'connecting' ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="w-4 h-4 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                Connecting…
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={trainer.disconnect}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-green-500/40 bg-green-500/10 text-sm text-green-400 hover:bg-green-500/20 transition-colors"
                >
                  <SignalIcon className="w-4 h-4" />
                  {trainer.deviceName || 'Trainer Connected'}
                </button>
              </div>
            )}
            {trainer.error && (
              <p className="text-xs text-red-400 mt-1 text-center">{trainer.error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
