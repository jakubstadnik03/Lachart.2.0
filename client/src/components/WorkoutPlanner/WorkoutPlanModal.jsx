/**
 * WorkoutPlanModal
 * ─────────────────
 * Portable portal-modal for creating / editing a planned workout.
 * Used from both the Training Calendar (FitAnalysisPage) and the
 * standalone WorkoutPlannerPage.
 *
 * Props:
 *  date        Date     – the day being planned
 *  workout     object?  – existing planned workout (edit mode) or null (create)
 *  context     { ftp, lt1Power, lt2Power }
 *  templates   array    – list of saved templates
 *  onSave(data)         – called with { date, sport, title, description, targetTss, steps }
 *  onDelete(workout)    – called when user deletes an existing workout
 *  onClose()            – close the modal
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, TrashIcon, BookmarkIcon, WrenchScrewdriverIcon, RectangleStackIcon, ArrowRightIcon, ArrowLeftIcon, BellIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Bike, Footprints, WavesLadder, Dumbbell, PersonStanding, Repeat2, Sparkles, Waves, TestTube2, MoreHorizontal } from 'lucide-react';
import WorkoutBuilder, { PRESET_CATALOG, buildPresetSteps, computeEstTSS } from './WorkoutBuilder';
import { createWorkoutTemplate } from '../../services/workoutPlannerApi';

// ─── Shared helpers ───────────────────────────────────────────────────────────
export const SPORT_ICONS  = { bike: '/icon/bike.svg', run: '/icon/run.svg', swim: '/icon/swim.svg' };
export const SPORT_COLORS = { bike: '#767EB5', run: '#f97316', swim: '#38bdf8' };
const STEP_COLORS = { warmup:'#fbbf24', work:'#767EB5', recovery:'#6ee7b7', cooldown:'#38bdf8', rest:'#d1d5db' };

// ─── Sport SVG icons (lucide-react) ─────────────────────────────────────────
const SPORT_LUCIDE_ICONS = {
  bike:       Bike,
  run:        Footprints,
  swim:       WavesLadder,
  strength:   Dumbbell,
  walk:       PersonStanding,
  brick:      Repeat2,
  crosstrain: Sparkles,
  mtbike:     Bike,
  rowing:     Waves,
  lactate:    TestTube2,
  other:      MoreHorizontal,
};

const SportSVG = ({ name, color = 'currentColor', size = 22 }) => {
  const Icon = SPORT_LUCIDE_ICONS[name];
  if (!Icon) return null;
  return <Icon size={size} color={color} strokeWidth={1.8} />;
};

// ─── Sport picker options ────────────────────────────────────────────────────
const SPORT_OPTIONS = [
  { key: 'bike',       label: 'Bike',         color: '#767EB5', svgName: 'bike' },
  { key: 'run',        label: 'Run',          color: '#f97316', svgName: 'run' },
  { key: 'swim',       label: 'Swim',         color: '#38bdf8', svgName: 'swim' },
  { key: 'strength',   label: 'Strength',     color: '#8b5cf6', svgName: 'strength' },
  { key: 'walk',       label: 'Walk',         color: '#22c55e', svgName: 'walk' },
  { key: 'brick',      label: 'Brick',        color: '#f59e0b', svgName: 'brick' },
  { key: 'crosstrain', label: 'Cross-train',  color: '#ec4899', svgName: 'crosstrain' },
  { key: 'mtbike',     label: 'MTB',          color: '#a16207', svgName: 'mtbike' },
  { key: 'rowing',     label: 'Rowing',       color: '#06b6d4', svgName: 'rowing' },
  { key: 'lactate',    label: 'Lactate Test', color: '#ef4444', svgName: 'lactate', isTest: true },
  { key: 'other',      label: 'Other',        color: '#6b7280', svgName: 'other' },
];

// Helper: render sport icon (img or svg)
function SportOptIcon({ opt, size = 22, className = '' }) {
  if (opt?.img) return <img src={opt.img} alt={opt.label} style={{ width: size, height: size }} className={className} />;
  if (opt?.svgName) return <SportSVG name={opt.svgName} color={opt.color} size={size} />;
  return null;
}

export function stepTotalSecs(steps) {
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

export function fmtDuration(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function toLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Mini SVG chart for template cards (with ramp support)
export function MiniWorkoutChart({ steps, height = 20, width = 120 }) {
  if (!steps?.length) return null;
  const expanded = [];
  const visited = new Set();
  steps.forEach(s => {
    if (!s.groupId) { expanded.push(s); return; }
    if (visited.has(s.groupId)) return;
    visited.add(s.groupId);
    const group = steps.filter(x => x.groupId === s.groupId);
    const reps = (group.find(x => x.isGroupHeader)?.groupRepeat) || 1;
    for (let r = 0; r < reps; r++) group.filter(x => !x.isGroupHeader).forEach(gs => expanded.push(gs));
  });
  const total = expanded.reduce((s, x) => s + (x.durationSeconds || 0), 0);
  if (!total) return null;
  const ZONE_COLORS = ['#93c5fd','#86efac','#fde68a','#fb923c','#f87171'];
  const W = width, H = height;
  const FLOOR = 0.12; // minimum bar height as fraction
  // Compute step heights
  const stepIntensities = expanded.map(s => {
    const type = s.stepType;
    if (type === 'work') return 1;
    if (type === 'warmup' || type === 'cooldown') return 0.55;
    if (type === 'recovery') return 0.28;
    if (type === 'rest') return 0.12;
    return 0.4;
  });
  let cx = 0;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {expanded.map((s, i) => {
        const w = Math.max(1, (s.durationSeconds / total) * W);
        let fill = STEP_COLORS[s.stepType] || '#94a3b8';
        if (s.powerTarget?.type === 'zone') fill = ZONE_COLORS[Math.min((s.powerTarget.value || 1) - 1, 4)];
        const pct = Math.max(FLOOR, stepIntensities[i]);
        const barH = pct * H;
        const bw = Math.max(1, w - 0.5);
        const x = cx; cx += w;
        let shape;
        if (s.isRamp && s.stepType === 'warmup') {
          shape = <polygon key={i} points={`${x},${H} ${x+bw},${H-barH} ${x+bw},${H}`} fill={fill} opacity={0.85} />;
        } else if (s.isRamp && s.stepType === 'cooldown') {
          shape = <polygon key={i} points={`${x},${H-barH} ${x},${H} ${x+bw},${H}`} fill={fill} opacity={0.85} />;
        } else {
          shape = <rect key={i} x={x} y={H - barH} width={bw} height={barH} fill={fill} rx={1} opacity={0.85} />;
        }
        return shape;
      })}
    </svg>
  );
}

// ─── Duration string parser (h:mm:ss or mm:ss or minutes) ───────────────────
function parseDurStr(s) {
  if (!s) return 0;
  const t = String(s).trim().toLowerCase();
  if (t.endsWith('h')) return parseFloat(t) * 3600;
  if (t.endsWith('m')) return parseFloat(t) * 60;
  if (/^\d+(\.\d+)?$/.test(t)) {
    const n = parseFloat(t);
    // bare number ≤ 9 → hours (e.g. "2" = 2h), larger → minutes (e.g. "90" = 90min)
    return n <= 9 ? n * 3600 : n * 60;
  }
  const parts = t.split(':').map(Number);
  if (parts.length === 2) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60;
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}
function secsToHMS(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:00` : `${m}:00`;
}

// ─── Main modal ────────────────────────────────────────────────────────────────
export default function WorkoutPlanModal({ date, workout, onSave, onDelete, onClose, context = {}, templates = [] }) {
  const isEdit = Boolean(workout?._id);
  // 'pick' = sport selector (new workouts only), 'build' = full builder
  const [step, setStep]           = useState(isEdit ? 'build' : 'pick');
  const [sport, setSport]         = useState(workout?.sport || 'bike');
  const [title, setTitle]         = useState(workout?.title || '');
  const [desc, setDesc]           = useState(workout?.description || '');
  const [tss, setTss]             = useState(workout?.targetTss || '');
  const [steps, setSteps]         = useState(workout?.steps || []);
  const [saving, setSaving]       = useState(false);
  const [tab, setTab]             = useState('builder');
  const [presetSport, setPresetSport] = useState(workout?.sport || 'bike');
  // Build workout section: collapsed until user clicks "Build Workout"
  const [showBuilder, setShowBuilder] = useState(isEdit && (workout?.steps?.length > 0));
  // Planned manual stats (used when no builder steps)
  const [plannedDurStr, setPlannedDurStr] = useState(
    workout?.plannedDuration ? secsToHMS(workout.plannedDuration) : ''
  );
  const [plannedDistStr, setPlannedDistStr] = useState(
    workout?.plannedDistance ? String((workout.plannedDistance / 1000).toFixed(1)) : ''
  );
  // Coach comment (visible note shown on calendar card)
  const [comment, setComment] = useState(workout?.comment || '');
  // Lactate test saved notification
  const [lactateSaved, setLactateSaved] = useState(false);

  const pickSport = (s) => {
    setSport(s);
    setPresetSport(s);
    setStep('build');
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const stepsDur = steps.length > 0 ? stepTotalSecs(steps) : 0;
    const estTss   = steps.length > 0 ? computeEstTSS(steps, { ...context, sport }) : null;
    await onSave({
      date: toLocalISO(date),
      sport,
      title: title.trim(),
      description: desc,
      comment: comment.trim() || undefined,
      targetTss:       tss ? Number(tss) : (estTss || undefined),
      steps,
      plannedDuration: stepsDur || parseDurStr(plannedDurStr) || undefined,
      plannedDistance: plannedDistStr ? parseFloat(plannedDistStr) * 1000 : undefined,
      isLactateTest:   sport === 'lactate' || undefined,
    });
    setSaving(false);
    // Show in-app notification for lactate test
    if (sport === 'lactate') {
      setLactateSaved(true);
    } else {
      onClose();
    }
  };

  const loadTemplate = (tpl) => {
    const newSteps = tpl.steps || [];
    setSteps(newSteps);
    if (!title) setTitle(tpl.name);
    const newSport = tpl.sport || sport || 'bike';
    if (!sport) setSport(newSport);
    if (tpl.targetTss) {
      setTss(String(tpl.targetTss));
    } else if (newSteps.length > 0) {
      const est = computeEstTSS(newSteps, { ...context, sport: newSport });
      if (est > 0) setTss(String(est));
    }
    setShowBuilder(true);
    setTab('builder');
  };

  // Auto-compute TSS when steps change
  const stepsDuration = steps.length > 0 ? stepTotalSecs(steps) : 0;
  const estTssFromSteps = steps.length > 0 ? computeEstTSS(steps, { ...context, sport }) : null;

  const selectedSportMeta = SPORT_OPTIONS.find(o => o.key === sport);

  return ReactDOM.createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ zIndex: 99998 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        {/* ─── Lactate saved notification screen ─── */}
        {lactateSaved ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
              <BellIcon className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Lactate Test Scheduled!</h3>
              <p className="text-sm text-slate-500">
                {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-sm text-slate-500 mt-3 max-w-xs leading-relaxed">
                Prepare your lactate analyzer and recording sheet. We recommend testing fasted or 3+ hours after your last meal.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-xl text-xs text-red-700 font-medium">
                <CheckCircleIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                Test saved to calendar
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-xl text-xs text-amber-700 font-medium">
                <BellIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                Reminder shown the day before
              </div>
            </div>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity min-h-[44px] w-full sm:w-auto"
            >
              Done
            </button>
          </div>
        ) : (<>

        {/* ─── Shared header ─── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 shrink-0">
          {step === 'build' && !isEdit && (
            <button onClick={() => setStep('pick')} className="p-1.5 -ml-1 rounded-xl hover:bg-slate-100 text-slate-400">
              <ArrowLeftIcon className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {step === 'build' && selectedSportMeta && (
              <span className="w-5 h-5 flex-shrink-0">
                <SportOptIcon opt={selectedSportMeta} size={20} />
              </span>
            )}
            <div>
              <p className="text-[11px] text-slate-400 font-medium">
                {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {step === 'pick' ? 'Add a workout' : isEdit ? 'Edit planned workout' : `Plan a ${selectedSportMeta?.label || sport} workout`}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {/* ─── STEP 1: Sport picker ─── */}
          {step === 'pick' && (
            <motion.div
              key="pick"
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18 }}
              className="overflow-y-auto flex-1 p-5 flex flex-col gap-5"
            >
              {/* Sport grid */}
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Choose sport</p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                  {SPORT_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => pickSport(opt.key)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 border-slate-100 bg-white active:scale-95 transition-all touch-manipulation min-h-[72px] justify-between"
                      onMouseEnter={e => { e.currentTarget.style.borderColor = opt.color + '60'; e.currentTarget.style.backgroundColor = opt.color + '0d'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.backgroundColor = ''; }}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: opt.color + '18' }}
                      >
                        <SportOptIcon opt={opt} size={22} />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-600 leading-tight text-center">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Templates shortcut */}
              {templates.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">My templates</p>
                  <div className="flex flex-col gap-2">
                    {templates.slice(0, 4).map(tpl => {
                      const opt = SPORT_OPTIONS.find(o => o.key === tpl.sport) || SPORT_OPTIONS[SPORT_OPTIONS.length - 1];
                      return (
                        <button
                          key={tpl._id}
                          onClick={() => { setSport(tpl.sport); setPresetSport(tpl.sport); loadTemplate(tpl); setStep('build'); }}
                          className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:border-primary/40 hover:bg-primary/5 transition-all text-left min-h-[52px]"
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: opt.color + '18' }}>
                            <SportOptIcon opt={opt} size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{tpl.name}</p>
                            <p className="text-[11px] text-slate-400">{fmtDuration(stepTotalSecs(tpl.steps))}</p>
                          </div>
                          {tpl.steps?.length > 0 && (
                            <MiniWorkoutChart steps={tpl.steps} width={60} height={14} />
                          )}
                          <ArrowRightIcon className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ─── STEP 2: Builder ─── */}
          {step === 'build' && (
            <motion.div
              key="build"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.18 }}
              className="overflow-y-auto flex-1 flex flex-col"
            >
              {/* ── Big title input ── */}
              <div className="px-5 pt-5 pb-3">
                <input
                  type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Untitled Workout"
                  className="w-full text-xl font-bold text-slate-900 border-0 border-b-2 border-slate-100 pb-2 focus:border-primary focus:outline-none bg-transparent placeholder:text-slate-300 transition-colors"
                  autoFocus={step === 'build'}
                />
              </div>

              {/* ── Sport + planned stats row ── */}
              <div className="px-5 py-3 border-b border-slate-100">
                {/* Sport pill row */}
                <div className="flex items-center gap-2 mb-3">
                  {!isEdit ? (
                    <button
                      onClick={() => setStep('pick')}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all hover:opacity-80"
                      style={{ borderColor: selectedSportMeta?.color + '50', color: selectedSportMeta?.color, backgroundColor: selectedSportMeta?.color + '12' }}
                    >
                      <SportOptIcon opt={selectedSportMeta} size={13} />
                      {selectedSportMeta?.label}
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold"
                      style={{ borderColor: selectedSportMeta?.color + '50', color: selectedSportMeta?.color, backgroundColor: selectedSportMeta?.color + '12' }}>
                      <SportOptIcon opt={selectedSportMeta} size={13} />
                      {selectedSportMeta?.label}
                    </div>
                  )}
                </div>

                {/* Planned stats table */}
                <div className="grid grid-cols-3 gap-2">
                  {/* Duration */}
                  <div className="bg-slate-50 rounded-xl p-3 min-h-[70px]">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Duration</span>
                    {stepsDuration > 0 ? (
                      <span className="text-base font-bold text-slate-800">{secsToHMS(stepsDuration)}</span>
                    ) : (
                      <input
                        type="text" value={plannedDurStr} onChange={e => setPlannedDurStr(e.target.value)}
                        onBlur={() => { const s = parseDurStr(plannedDurStr); if (s > 0) setPlannedDurStr(secsToHMS(s)); }}
                        placeholder="h:mm:ss"
                        className="w-full text-base font-bold text-slate-800 bg-transparent border-0 focus:outline-none placeholder:text-slate-300 placeholder:font-normal"
                      />
                    )}
                    <span className="text-[10px] text-slate-400">h:mm:ss</span>
                  </div>

                  {/* Distance */}
                  <div className="bg-slate-50 rounded-xl p-3 min-h-[70px]">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Distance</span>
                    <div className="flex items-baseline gap-1">
                      <input
                        type="text" value={plannedDistStr} onChange={e => setPlannedDistStr(e.target.value)}
                        placeholder="--"
                        className="w-full text-base font-bold text-slate-800 bg-transparent border-0 focus:outline-none placeholder:text-slate-300 placeholder:font-normal"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">km</span>
                  </div>

                  {/* TSS */}
                  <div className="bg-slate-50 rounded-xl p-3 min-h-[70px]">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">TSS</span>
                    {estTssFromSteps ? (
                      <span className="text-base font-bold text-primary">{Math.round(estTssFromSteps)}</span>
                    ) : (
                      <input
                        type="number" value={tss} onChange={e => setTss(e.target.value)}
                        placeholder="--"
                        className="w-full text-base font-bold text-slate-800 bg-transparent border-0 focus:outline-none placeholder:text-slate-300 placeholder:font-normal"
                      />
                    )}
                    <span className="text-[10px] text-slate-400">TSS</span>
                  </div>
                </div>
              </div>

              {/* ── Build Workout section ── */}
              <div className="px-5 py-4 flex-1 flex flex-col gap-4">

                {!showBuilder ? (
                  /* Collapsed: big dashed button */
                  <button
                    onClick={() => setShowBuilder(true)}
                    className="w-full flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all group"
                  >
                    <svg className="w-8 h-8 opacity-50 group-hover:opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <rect x="2" y="16" width="4" height="6" rx="1" />
                      <rect x="7" y="11" width="4" height="11" rx="1" />
                      <rect x="12" y="7" width="4" height="15" rx="1" />
                      <rect x="17" y="3" width="4" height="19" rx="1" />
                    </svg>
                    <span className="text-sm font-semibold">Build Workout</span>
                    <span className="text-[11px] text-slate-300">Add intervals, warmup, cooldown…</span>
                  </button>
                ) : (
                  /* Expanded: tabs + builder/templates */
                  <div className="flex flex-col gap-3">
                    {/* Tab bar */}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {[
                          { k: 'builder',   label: 'Builder',   Icon: WrenchScrewdriverIcon },
                          { k: 'templates', label: 'Templates',  Icon: RectangleStackIcon },
                        ].map(({ k, label, Icon }) => (
                          <button key={k} onClick={() => setTab(k)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors touch-manipulation min-h-[36px] ${tab === k ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                          </button>
                        ))}
                      </div>
                      {/* Collapse button */}
                      <button
                        onClick={() => { setShowBuilder(false); setSteps([]); }}
                        className="text-xs text-slate-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50 touch-manipulation"
                      >
                        Remove structure
                      </button>
                    </div>

                    {tab === 'builder' && (
                      <WorkoutBuilder initialSteps={steps} context={context} sport={sport} onChange={setSteps} />
                    )}

                    {tab === 'templates' && (
                      <div className="flex flex-col gap-4">
                        {/* Sport switcher */}
                        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl">
                          {['bike','run','swim'].map(s => {
                            const lbl = { bike: 'Bike', run: 'Run', swim: 'Swim' };
                            const clr = { bike: '#767EB5', run: '#f97316', swim: '#38bdf8' };
                            const isActive = presetSport === s;
                            return (
                              <button key={s} onClick={() => setPresetSport(s)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${isActive ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                style={isActive ? { color: clr[s] } : {}}>
                                <img src={SPORT_ICONS[s]} alt={s} className="w-3.5 h-3.5" />
                                {lbl[s]}
                              </button>
                            );
                          })}
                        </div>

                        {/* Built-in presets */}
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Built-in workouts</p>
                          <div className="grid grid-cols-2 gap-2">
                            {PRESET_CATALOG.filter(p => p.sport === presetSport).map(preset => {
                              const pSteps = buildPresetSteps(preset.key);
                              return (
                                <button key={preset.key}
                                  onClick={() => { setSport(preset.sport); loadTemplate({ name: preset.name, sport: preset.sport, steps: pSteps }); }}
                                  className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all text-left group"
                                  style={{ borderLeftColor: preset.color, borderLeftWidth: 3 }}>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-slate-800 leading-tight">{preset.name}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{preset.desc}</p>
                                    <div className="mt-1.5"><MiniWorkoutChart steps={pSteps} width={100} height={16} /></div>
                                  </div>
                                  <ArrowRightIcon className="w-3 h-3 text-slate-300 group-hover:text-slate-600 shrink-0 mt-0.5 transition-colors" />
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* My saved templates */}
                        {(() => {
                          const myTpls = templates.filter(t => t.sport === presetSport);
                          return myTpls.length > 0 ? (
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">My templates</p>
                              <div className="flex flex-col gap-2">
                                {myTpls.map(tpl => (
                                  <button key={tpl._id} onClick={() => { setSport(tpl.sport); loadTemplate(tpl); }}
                                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:border-primary/50 hover:bg-primary/5 transition-all text-left">
                                    <img src={SPORT_ICONS[tpl.sport] || SPORT_ICONS.bike} alt={tpl.sport} className="w-6 h-6 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-slate-800">{tpl.name}</p>
                                      <p className="text-[11px] text-slate-400">{fmtDuration(stepTotalSecs(tpl.steps))}</p>
                                      {tpl.steps?.length > 0 && <div className="mt-1"><MiniWorkoutChart steps={tpl.steps} /></div>}
                                    </div>
                                    <span className="flex items-center gap-0.5 text-xs text-primary font-semibold shrink-0">Use <ArrowRightIcon className="w-3 h-3" /></span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Comment + Description ── */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">
                      Comment <span className="normal-case font-normal text-slate-300">· shown on calendar card</span>
                    </label>
                    <textarea
                      rows={2} value={comment} onChange={e => setComment(e.target.value)}
                      placeholder="Short note shown on the calendar card…"
                      className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Description / Coach notes</label>
                    <textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)}
                      placeholder="Focus, context, feel…"
                      className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Footer (only in build step) ─── */}
        {step === 'build' && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 shrink-0 bg-white">
            <div className="flex gap-2">
              {isEdit && (
                <button onClick={() => onDelete(workout)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-500 text-sm hover:bg-red-50 transition-colors min-h-[44px]">
                  <TrashIcon className="w-4 h-4" />
                </button>
              )}
              {steps.length > 0 && (
                <button
                  onClick={async () => {
                    const name = window.prompt('Template name:', title);
                    if (!name) return;
                    try { await createWorkoutTemplate({ name, sport, steps, description: desc }); } catch (_) {}
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
                  <BookmarkIcon className="w-4 h-4" />
                  Save as template
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors touch-manipulation min-h-[44px]">
                Cancel
              </button>
              <button onClick={handleSave} disabled={!title.trim() || saving}
                className={`px-5 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 touch-manipulation min-h-[44px] ${sport === 'lactate' ? 'bg-red-500' : 'bg-primary'}`}>
                {saving ? 'Saving…' : isEdit ? 'Update' : sport === 'lactate' ? 'Plan lactate test' : 'Plan it'}
              </button>
            </div>
          </div>
        )}
        </>)}
      </motion.div>
    </motion.div>,
    document.body
  );
}
