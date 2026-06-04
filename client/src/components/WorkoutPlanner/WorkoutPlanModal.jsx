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
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { XMarkIcon, TrashIcon, BookmarkIcon, WrenchScrewdriverIcon, RectangleStackIcon, ArrowRightIcon, ArrowLeftIcon, BellIcon, CheckCircleIcon, PlayIcon } from '@heroicons/react/24/outline';
import { Bike, WavesLadder, Dumbbell, PersonStanding, Repeat2, Sparkles, Waves, TestTube2, MoreHorizontal } from 'lucide-react';
import WorkoutBuilder, { PRESET_CATALOG, buildPresetSteps, computeEstTSS } from './WorkoutBuilder';
import { createWorkoutTemplate, exportPlannedWorkout } from '../../services/workoutPlannerApi';
import { useCategories } from '../../context/CategoryContext';

// ─── Shared helpers ───────────────────────────────────────────────────────────
export const SPORT_ICONS  = { bike: '/icon/bike.svg', run: '/icon/run.svg', swim: '/icon/swim.svg' };
export const SPORT_COLORS = { bike: '#767EB5', run: '#f97316', swim: '#38bdf8' };
const STEP_COLORS = { warmup:'#fbbf24', work:'#767EB5', recovery:'#6ee7b7', cooldown:'#38bdf8', rest:'#d1d5db' };

// ─── Sport SVG icons (lucide-react) ─────────────────────────────────────────
const SPORT_LUCIDE_ICONS = {
  bike:       Bike,
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

// Detailed runner figure — uses path data from /public/icon/run.svg
// Inlined so we can colorize via currentColor / `color` prop.
const RunnerSVG = ({ color, size }) => (
  <svg width={size} height={size} viewBox="0 0 36 38" fill={color} xmlns="http://www.w3.org/2000/svg">
    <path d="M29.0573 7.92361C31.0758 7.92361 32.718 6.28138 32.718 4.26283C32.718 2.24428 31.0759 0.602051 29.0573 0.602051C27.0386 0.602051 25.3965 2.24428 25.3965 4.26283C25.3965 6.28138 27.0387 7.92361 29.0573 7.92361ZM29.0573 1.67888C30.4821 1.67888 31.6412 2.83797 31.6412 4.26283C31.6412 5.68769 30.4821 6.84679 29.0573 6.84679C27.6324 6.84679 26.4733 5.68769 26.4733 4.26283C26.4733 2.83797 27.6325 1.67888 29.0573 1.67888Z"/>
    <path d="M34.4824 16.5063H31.6251C31.3277 16.5063 31.0867 16.7473 31.0867 17.0447C31.0867 17.3421 31.3277 17.5831 31.6251 17.5831H34.4824C34.5239 17.5831 34.5578 17.6168 34.5578 17.6583C34.5578 18.93 33.5231 19.9646 32.2515 19.9646H26.3534C25.5775 19.9646 24.9464 19.3334 24.9464 18.5575V16.2233L26.2083 14.0375C26.6322 13.3033 26.85 12.489 26.853 11.6636C27.1616 12.4179 27.3279 13.2347 27.3279 14.0726V16.9252C27.3279 17.288 27.6229 17.583 27.9857 17.583H29.1125C29.4099 17.583 29.6509 17.342 29.6509 17.0446C29.6509 16.7472 29.4099 16.5062 29.1125 16.5062H28.4047V14.0726C28.4047 11.4177 26.9764 8.94377 24.6771 7.61619C17.1788 3.28763 17.7985 3.64334 17.6201 3.54033C17.1815 3.28713 16.6877 3.17593 16.1935 3.21376H8.63931C8.34197 3.21376 8.1009 3.45475 8.1009 3.75217C8.1009 4.04959 8.34197 4.29059 8.63931 4.29059H14.3268C14.2359 4.42397 14.2171 4.4707 13.7658 5.24832H1.55566C1.29162 5.24832 1.07683 5.03353 1.07683 4.76949C1.07683 4.50538 1.29162 4.29059 1.55566 4.29059H6.12672C6.42406 4.29059 6.66513 4.04959 6.66513 3.75217C6.66513 3.45475 6.42406 3.21376 6.12672 3.21376H1.55566C0.697856 3.21376 0 3.91169 0 4.76949C0 5.62729 0.697856 6.32514 1.55566 6.32514H13.1441C11.3801 9.38053 11.5096 9.15433 11.4673 9.23394H7.45416C6.59636 9.23394 5.8985 9.9318 5.8985 10.7896C5.8985 11.6474 6.59636 12.3453 7.45416 12.3453H11.4398C11.7261 12.9129 12.175 13.4062 12.7655 13.7471C13.3156 14.0647 14.0217 13.8756 14.3392 13.3255L17.1289 8.49359L19.5392 9.88521C18.1881 12.2254 16.3897 15.3404 15.0219 17.7095H3.56236C2.70456 17.7095 2.0067 18.4074 2.0067 19.2652C2.0067 20.123 2.70456 20.8208 3.56236 20.8208H13.2256L11.5558 23.713H5.61084C3.90393 23.713 2.51525 25.1016 2.51525 26.8085C2.51525 27.6023 3.16106 28.2481 3.9549 28.2481H12.0357C13.3547 28.2481 14.5838 27.5385 15.2434 26.3962L17.2122 22.986L17.8964 24.171C18.045 24.4286 18.3745 24.5167 18.6318 24.3681C18.8893 24.2194 18.9776 23.8901 18.8289 23.6326C18.4069 22.9017 17.43 21.2097 17.0186 20.4971C16.2899 19.2349 16.2899 17.6666 17.0186 16.4045L20.7409 9.95728C20.8896 9.69978 20.8014 9.37048 20.5439 9.22181L17.3044 7.3515C16.9883 7.16916 16.5868 7.27871 16.406 7.59235L13.4068 12.787C13.386 12.8229 13.3397 12.8352 13.3039 12.8146C12.2026 12.1788 11.8239 10.7655 12.4598 9.66417C13.1616 8.44872 14.4584 6.20253 15.1596 4.98794C15.5475 4.316 16.4098 4.08499 17.0816 4.47286L23.9142 8.41764C25.695 9.44586 26.3037 11.7185 25.2758 13.499C24.7173 14.4664 21.414 20.1877 20.8663 21.1364C20.6416 21.5255 20.6416 22.0088 20.8663 22.398L23.2183 26.4718C23.6861 27.282 23.686 28.2887 23.2183 29.0989L19.1779 36.097C19.0783 36.2693 18.8609 36.3317 18.693 36.236C17.7203 35.6821 17.3824 34.4437 17.9434 33.4722C18.3119 32.834 20.8906 28.3676 21.0294 28.1271C21.1508 27.9162 21.1508 27.6544 21.0291 27.4432L20.0882 25.8134C19.9395 25.5558 19.6101 25.4678 19.3527 25.6164C19.0952 25.765 19.007 26.0943 19.1557 26.3518L19.9833 27.7854L17.5702 31.9651H7.63657C6.77877 31.9651 6.08092 32.663 6.08092 33.5208C6.08092 34.3786 6.77877 35.0765 7.63657 35.0765H16.6536C16.8263 35.9514 17.3571 36.7146 18.1602 37.1719C18.8407 37.5594 19.7157 37.3191 20.1104 36.6355L24.1508 29.6374C24.8104 28.495 24.8104 27.0757 24.1508 25.9334L21.7988 21.8597C21.7659 21.8027 21.7659 21.732 21.7988 21.675L23.8695 18.0884V18.5575C23.8695 19.9271 24.9838 21.0414 26.3534 21.0414H32.2515C34.1169 21.0414 35.6346 19.5237 35.6346 17.6583C35.6346 17.0231 35.1177 16.5063 34.4824 16.5063ZM3.56236 19.7441C3.29832 19.7441 3.08353 19.5293 3.08353 19.2652C3.08353 19.0012 3.29832 18.7864 3.56236 18.7864H14.4002L13.8473 19.7441H3.56236ZM16.5906 21.9093L14.3109 25.8579C13.8431 26.6681 12.9713 27.1714 12.0358 27.1714H3.95497C3.7549 27.1714 3.59215 27.0086 3.59215 26.8085C3.59215 25.6954 4.49776 24.7899 5.61092 24.7899H11.7825C12.0263 24.7899 12.2534 24.6587 12.3751 24.4476C12.7091 23.8691 15.1465 19.6475 15.4413 19.1368C15.5291 19.7967 15.744 20.4429 16.0863 21.0356L16.5906 21.9093ZM7.45416 11.2684C7.19012 11.2684 6.97533 11.0536 6.97533 10.7896C6.97533 10.5256 7.19012 10.3108 7.45416 10.3108H11.112C11.064 10.6304 11.0627 10.9529 11.1055 11.2684H7.45416ZM7.15774 33.5208C7.15774 33.2567 7.37253 33.0419 7.63657 33.0419H16.9512C16.7912 33.3458 16.6844 33.6687 16.6321 33.9997H7.63657C7.37253 33.9997 7.15774 33.7848 7.15774 33.5208Z"/>
  </svg>
);

const SportSVG = ({ name, color = 'currentColor', size = 22 }) => {
  if (name === 'run') return <RunnerSVG color={color} size={size} />;
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
  // Defensive: fall back to today if d is null/undefined/Invalid Date so we
  // never POST/PUT a "NaN-NaN-NaN" date that the server rejects with 500.
  const safe = (d instanceof Date && !isNaN(d.getTime())) ? d : new Date();
  return `${safe.getFullYear()}-${String(safe.getMonth()+1).padStart(2,'0')}-${String(safe.getDate()).padStart(2,'0')}`;
}

// Mini SVG chart for template cards (with ramp + compressed group support)
export function MiniWorkoutChart({ steps, height = 20, width = 120 }) {
  if (!steps?.length) return null;
  const ZONE_COLORS = ['#93c5fd','#86efac','#fde68a','#fb923c','#f87171'];
  const W = width, H = height;
  const FLOOR = 0.12;

  // Build segments — groups → compressed blocks, others → individual
  const segments = [];
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
    const workPt  = header?.powerTarget;
    segments.push({ kind:'group', workDur, recDur, reps, totalDur:(workDur+recDur)*reps, workPt });
  });

  const total = segments.reduce((s, seg) =>
    s + (seg.kind==='step' ? (seg.step.durationSeconds || 0) : seg.totalDur), 0);
  if (!total) return null;

  let cx = 0;
  const elems = [];

  segments.forEach((seg, si) => {
    if (seg.kind === 'step') {
      const s = seg.step;
      const w = Math.max(1, (s.durationSeconds / total) * W);
      let fill = STEP_COLORS[s.stepType] || '#94a3b8';
      if (s.powerTarget?.type === 'zone') fill = ZONE_COLORS[Math.min((s.powerTarget.value || 1) - 1, 4)];
      const intensity = s.stepType==='work' ? 1 : s.stepType==='warmup'||s.stepType==='cooldown' ? 0.55 : s.stepType==='recovery' ? 0.28 : 0.12;
      const barH = Math.max(FLOOR, intensity) * H;
      const bw = Math.max(1, w - 0.5);
      const x = cx; cx += w;
      let shape;
      if (s.isRamp && s.stepType === 'warmup') {
        shape = <polygon key={si} points={`${x},${H} ${x+bw},${H-barH} ${x+bw},${H}`} fill={fill} opacity={0.85} />;
      } else if (s.isRamp && s.stepType === 'cooldown') {
        shape = <polygon key={si} points={`${x},${H-barH} ${x},${H} ${x+bw},${H}`} fill={fill} opacity={0.85} />;
      } else {
        shape = <rect key={si} x={x} y={H - barH} width={bw} height={barH} fill={fill} rx={1} opacity={0.85} />;
      }
      elems.push(shape);
    } else {
      // Repeat group — compressed comb (same algorithm as PlanMiniChart)
      const { workDur, recDur, reps, totalDur, workPt } = seg;
      const gw = Math.max(6, totalDur / total * W);
      const sx = cx; cx += gw;
      let workFill = STEP_COLORS.work;
      if (workPt?.type === 'zone') workFill = ZONE_COLORS[Math.min((workPt.value || 1) - 1, 4)];
      const cycleTotalDur = workDur + (recDur || 0);
      const maxCycles = Math.max(1, Math.floor(gw / 2));
      const visCycles = Math.min(reps, maxCycles);
      const cycleW   = gw / visCycles;
      const workFrac = cycleTotalDur > 0 ? workDur / cycleTotalDur : 1;
      const workW    = cycleW * workFrac;
      const recW     = cycleW * (1 - workFrac);
      for (let r = 0; r < visCycles; r++) {
        const x0 = sx + r * cycleW;
        elems.push(<rect key={`${si}w${r}`} x={x0} y={0} width={Math.max(1, workW - 0.5)} height={H} fill={workFill} rx={0} opacity={0.85} />);
        if (recW >= 1 && recDur > 0) {
          const recH = Math.max(FLOOR * H, 0.32 * H);
          elems.push(<rect key={`${si}r${r}`} x={x0 + workW} y={H - recH} width={Math.max(1, recW - 0.5)} height={recH} fill={STEP_COLORS.recovery} rx={0} opacity={0.80} />);
        }
      }
    }
  });

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {elems}
    </svg>
  );
}

// ─── Duration string parser (h:mm:ss or mm:ss or bare minutes) ──────────────
function parseDurStr(s) {
  if (!s) return 0;
  const t = String(s).trim().toLowerCase();
  if (t.endsWith('h')) return parseFloat(t) * 3600;
  if (t.endsWith('m')) return parseFloat(t) * 60;
  // Bare integer or decimal → minutes (35 = 35min, 1.5 = 1h30m)
  if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t) * 60;
  const parts = t.split(':').map(Number);
  if (parts.length === 2) {
    const [a, b] = [parts[0] || 0, parts[1] || 0];
    // "1:30" = 1h30m, "35:00" = 35min
    return a >= 10 ? a * 60 + b : a * 3600 + b * 60;
  }
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}
function secsToHMS(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:00` : `${m}:00`;
}

// ─── Main modal ────────────────────────────────────────────────────────────────
export default function WorkoutPlanModal({ date, workout, onSave, onDelete, onClose, context = {}, templates = [], onAddDayTheme = null, onAddPeriod = null }) {
  const isEdit = Boolean(workout?._id);
  const navigate = useNavigate();
  const { categories } = useCategories();
  const dragControls = useDragControls();
  // 'pick' = sport selector (new workouts only), 'build' = full builder
  const [step, setStep]           = useState(isEdit ? 'build' : 'pick');
  const [sport, setSport]         = useState(workout?.sport || 'bike');
  const [title, setTitle]         = useState(workout?.title || '');
  const [desc, setDesc]           = useState(workout?.description || '');
  const [tss, setTss]             = useState(workout?.targetTss || '');
  const [steps, setSteps]         = useState(workout?.steps || []);
  const [category, setCategory]   = useState(workout?.category || '');
  const [saving, setSaving]       = useState(false);
  // Inline "Plan a race" form (opened from the Or-mark-this-day tile).
  const [raceOpen, setRaceOpen]   = useState(false);
  const [raceSaving, setRaceSaving] = useState(false);
  const [raceForm, setRaceForm]   = useState({ name: '', sport: 'run', priority: 'A', targetCTL: '' });
  const submitRace = async () => {
    if (!raceForm.name) return;
    setRaceSaving(true);
    try {
      const { createRaceEvent } = await import('../../services/api');
      await createRaceEvent({
        name: raceForm.name.trim(),
        date: toLocalISO(date),
        sport: raceForm.sport,
        priority: raceForm.priority,
        targetCTL: raceForm.targetCTL ? Number(raceForm.targetCTL) : null,
      }, context?.athleteId || undefined);
      setRaceOpen(false);
      onClose();
    } catch { /* ignore */ }
    finally { setRaceSaving(false); }
  };
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
      category:        category || undefined,
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
        exit={{ y: '110%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="w-full sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '92vh' }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0 }}
        dragElastic={{ top: 0, bottom: 0.35 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 450) onClose?.();
        }}
      >
        {/* ── Drag handle — swipe down to close ─────────────────────────── */}
        <div
          className="flex-shrink-0 pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing select-none sm:hidden"
          style={{ touchAction: 'none' }}
          onPointerDown={e => dragControls.start(e)}
        >
          <div className="w-10 h-[5px] rounded-full bg-gray-300" />
        </div>

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

        {/* ─── Shared header — also acts as extended swipe-down zone ─── */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 shrink-0 sm:touch-auto"
          style={{ touchAction: 'none' }}
          onPointerDown={e => dragControls.start(e)}
        >
          {step === 'build' && !isEdit && (
            <button onClick={() => setStep('pick')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-slate-400 hover:bg-gray-200 transition-all flex-shrink-0">
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
              <h2 className="text-[15px] font-bold text-slate-900 leading-tight">
                {step === 'pick' ? 'Add a workout' : isEdit ? 'Edit planned workout' : `Plan a ${selectedSportMeta?.label || sport} workout`}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-slate-400 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0">
            <XMarkIcon className="w-4 h-4" />
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

              {/* ── Or mark this day — day theme / race / multi-day period ── */}
              {(onAddDayTheme || onAddPeriod) && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Or mark this day</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {onAddDayTheme && (
                      <button
                        onClick={() => { onAddDayTheme(toLocalISO(date), null); onClose(); }}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 border-slate-100 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 active:scale-95 transition-all min-h-[72px] justify-center"
                      >
                        {/* Target — day theme */}
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round">
                          <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="#6366f1" stroke="none" />
                        </svg>
                        <span className="text-[11px] font-semibold text-slate-600 leading-tight text-center">Day theme</span>
                      </button>
                    )}
                    <button
                      onClick={() => setRaceOpen(true)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 border-slate-100 bg-white hover:border-red-300 hover:bg-red-50/40 active:scale-95 transition-all min-h-[72px] justify-center"
                    >
                      {/* Checkered flag — race */}
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 21V4" /><path d="M5 4c3-1.5 6 1.5 9 0s4 0 5 0v9c-1 0-2.5-1.5-5 0s-6-1.5-9 0" />
                      </svg>
                      <span className="text-[11px] font-semibold text-slate-600 leading-tight text-center">Race</span>
                    </button>
                    {onAddPeriod && (
                      <button
                        onClick={() => { onAddPeriod(toLocalISO(date)); onClose(); }}
                        className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 border-slate-100 bg-white hover:border-sky-300 hover:bg-sky-50/40 active:scale-95 transition-all min-h-[72px] justify-center"
                      >
                        {/* Calendar range — multi-day period */}
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4M8 14h8" />
                        </svg>
                        <span className="text-[11px] font-semibold text-slate-600 leading-tight text-center">Period</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

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
                {/* Sport pill + category row */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
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
                  {/* Category picker */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => setCategory('')}
                      className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all ${!category ? 'bg-slate-100 border-slate-300 text-slate-600' : 'border-slate-100 text-slate-400 hover:bg-slate-50'}`}
                    >
                      No category
                    </button>
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setCategory(cat.id === category ? '' : cat.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all"
                        style={category === cat.id
                          ? { backgroundColor: cat.color + '20', borderColor: cat.color + '60', color: cat.color }
                          : { borderColor: 'transparent', color: '#94a3b8' }}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Planned stats table */}
                <div className="grid grid-cols-3 gap-2">
                  {/* Duration — always editable; steps-derived value shown as placeholder */}
                  <div className="bg-slate-50 rounded-xl p-3 min-h-[70px]">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Duration</span>
                    <input
                      type="text"
                      value={plannedDurStr}
                      onChange={e => setPlannedDurStr(e.target.value)}
                      onBlur={() => { const s = parseDurStr(plannedDurStr); if (s > 0) setPlannedDurStr(secsToHMS(s)); else if (!plannedDurStr && stepsDuration > 0) setPlannedDurStr(secsToHMS(stepsDuration)); }}
                      onFocus={() => { if (!plannedDurStr && stepsDuration > 0) setPlannedDurStr(secsToHMS(stepsDuration)); }}
                      placeholder={stepsDuration > 0 ? secsToHMS(stepsDuration) : '35 or 1:30:00'}
                      className="w-full text-base font-bold text-slate-800 bg-transparent border-0 focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                    />
                    <span className="text-[10px] text-slate-400">
                      {stepsDuration > 0 && !plannedDurStr ? 'from steps · click to edit' : 'h:mm:ss or minutes'}
                    </span>
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

              {/* ── Build Workout section — 2-col on lg+ ── */}
              <div className="px-5 py-4 flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6">

                {/* On lg+: comment/desc go in left column, builder in right */}
                <div className="lg:w-72 xl:w-80 shrink-0 flex flex-col gap-3 order-2 lg:order-1">
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

                <div className="flex-1 min-w-0 flex flex-col gap-4 order-1 lg:order-2">
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
                </div>{/* end flex-1 builder column */}
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
              {/* Export — only when editing an already-saved workout. New
                  workouts have no _id yet so there's nothing to export. */}
              {isEdit && steps.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await exportPlannedWorkout(workout._id, {
                          format: 'zwo',
                          athleteId: context?.athleteId,
                          suggestedName: (title || 'workout').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 50),
                        });
                      } catch (err) {
                        // eslint-disable-next-line no-alert
                        alert(`Export failed: ${err?.response?.data?.error || err?.message || 'unknown'}`);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
                    title="Download as Zwift / TrainerRoad workout (.zwo)"
                  >
                    .zwo
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await exportPlannedWorkout(workout._id, {
                          format: 'tcx',
                          athleteId: context?.athleteId,
                          suggestedName: (title || 'workout').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 50),
                        });
                      } catch (err) {
                        // eslint-disable-next-line no-alert
                        alert(`Export failed: ${err?.response?.data?.error || err?.message || 'unknown'}`);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors"
                    title="Download as Garmin / TrainingPeaks workout (.tcx)"
                  >
                    .tcx
                  </button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {/* Start Workout — only when editing an existing saved plan
                  that has structured steps. Saves first, then navigates to
                  the execution screen so unsaved tweaks (like ERG bias prep)
                  aren't lost. Hidden for lactate-test plans because those
                  don't run on the trainer. */}
              {isEdit && steps.length > 0 && sport !== 'lactate' && (
                <button
                  onClick={async () => {
                    try {
                      if (title.trim()) {
                        setSaving(true);
                        await onSave({
                          _id: workout._id, date, sport, title: title.trim(),
                          description: desc, targetTss: Number(tss) || 0,
                          steps, category,
                          plannedDuration: 0, plannedDistance: 0,
                          comment,
                        });
                      }
                    } catch (_) { /* fall through and still navigate */ }
                    finally { setSaving(false); }
                    const qs = context?.athleteId ? `?athleteId=${context.athleteId}` : '';
                    onClose && onClose();
                    navigate(`/workout-execution/${workout._id}${qs}`);
                  }}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold disabled:opacity-40 touch-manipulation min-h-[44px] shadow-sm"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  title="Save and start this workout"
                >
                  <PlayIcon className="w-4 h-4" />
                  Start
                </button>
              )}
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

      {/* Inline "Plan a race" form */}
      {raceOpen && (
        <div
          className="absolute inset-0 z-10 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setRaceOpen(false); }}
        >
          <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl" style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">Plan a race</h3>
              <button onClick={() => setRaceOpen(false)} className="text-sm font-semibold text-slate-400">Cancel</button>
            </div>
            <div className="flex flex-col gap-3">
              <input autoFocus placeholder="Race name" value={raceForm.name}
                onChange={e => setRaceForm(f => ({ ...f, name: e.target.value }))}
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-primary/40" />
              <div className="flex gap-3">
                <select value={raceForm.sport} onChange={e => setRaceForm(f => ({ ...f, sport: e.target.value }))}
                  className="flex-1 text-sm px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 outline-none">
                  {['run', 'bike', 'swim', 'triathlon', 'hyrox', 'other'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={raceForm.priority} onChange={e => setRaceForm(f => ({ ...f, priority: e.target.value }))}
                  className="flex-1 text-sm px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 outline-none">
                  <option value="A">A — goal</option>
                  <option value="B">B race</option>
                  <option value="C">C race</option>
                </select>
              </div>
              <input type="number" placeholder="Target CTL (optional)" value={raceForm.targetCTL}
                onChange={e => setRaceForm(f => ({ ...f, targetCTL: e.target.value }))}
                className="w-full text-sm px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:border-primary/40" />
              <button onClick={submitRace} disabled={raceSaving || !raceForm.name}
                className="w-full py-3 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50">
                {raceSaving ? 'Saving…' : 'Add race'}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>,
    document.body
  );
}
