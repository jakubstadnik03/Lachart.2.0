/**
 * WorkoutPlannerPage
 * ──────────────────
 * Weekly calendar view showing:
 *   • Planned workouts (with workout structure)
 *   • Completed trainings from the same week
 * Plus: create/edit planned workouts with WorkoutBuilder
 */
import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon,
         TrashIcon, CheckCircleIcon, PlayIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthProvider';
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import { useNotification } from '../context/NotificationContext';
import WorkoutPlanModal, {
  SPORT_COLORS, stepTotalSecs, fmtDuration, toLocalISO, MiniWorkoutChart,
  PlannerSportIcon, plannerSportColor, plannerSportKey, sportMatchesPlanner,
} from '../components/WorkoutPlanner/WorkoutPlanModal';
import {
  getPlannedWorkouts, createPlannedWorkout, updatePlannedWorkout,
  deletePlannedWorkout, getWorkoutTemplates,
} from '../services/workoutPlannerApi';
import api from '../services/api';
import WorkoutTemplateLibrary from '../components/WorkoutPlanner/WorkoutTemplateLibrary';
import { buildPresetSteps } from '../components/WorkoutPlanner/WorkoutBuilder';
// Lazy — ActivityFullModal lives in the 8k-line CalendarView; don't pull it
// into the planner chunk unless an activity is actually opened.
const ActivityFullModal = lazy(() =>
  import('../components/Calendar/CalendarView').then(m => ({ default: m.ActivityFullModal }))
);

// Starter workout templates shown in the library when the user hasn't saved
// any of their own yet — so the planner isn't empty on day one. Built from the
// same presets the WorkoutBuilder uses, so dragging one onto a day creates a
// fully-structured planned workout. Power targets are zone/threshold-relative,
// so they scale to each athlete's profile.
const DEFAULT_TEMPLATE_DEFS = [
  { name: 'Endurance ride · Z2 60′',     sport: 'bike',  preset: 'zone2' },
  { name: 'Sweet Spot · 3×15′',          sport: 'bike',  preset: 'sweet_spot' },
  { name: 'Threshold · 5×8′ LT2',        sport: 'bike',  preset: 'threshold_intervals' },
  { name: 'VO₂max · 6×4′',               sport: 'bike',  preset: 'vo2max' },
  { name: 'Over/Under · 3 sets',         sport: 'bike',  preset: 'over_under' },
  { name: 'Tempo · 2×20′',               sport: 'bike',  preset: 'tempo' },
  { name: 'Easy run · 45′',              sport: 'run',   preset: 'run_easy' },
  { name: 'Long run · 90′',              sport: 'run',   preset: 'run_long' },
  { name: 'Run threshold · 2×15′',       sport: 'run',   preset: 'run_threshold' },
  { name: 'Run VO₂max · 6×3′',           sport: 'run',   preset: 'run_vo2max' },
  { name: 'Fartlek · 10×1′',             sport: 'run',   preset: 'run_fartlek' },
  { name: 'Swim endurance · 1.6 km',     sport: 'swim',  preset: 'swim_endurance' },
  { name: 'Swim threshold · 10×100',     sport: 'swim',  preset: 'swim_threshold' },
];

// ─── Date helpers (local, not re-exported from modal) ────────────────────────
function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function isSameDay(a, b) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// Pull a sensible duration (seconds) out of a completed-activity object whose
// shape varies across Strava / FIT / manual sources.
function completedSecs(t) {
  const v = t.totalTimerTime || t.moving_time || t.movingTime
    || t.totalElapsedTime || t.elapsedTime || t.elapsed_time || t.duration || t.durationSeconds;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ─── Planned Workout Card (inside calendar cell) ─────────────────────────────
function PlannedCard({ pw, onEdit, onDelete, onComplete, onStart, isMissed = false }) {
  const col = isMissed ? '#ef4444' : plannerSportColor(pw.sport);
  const dur = stepTotalSecs(pw.steps);
  const isSkipped = pw.status === 'skipped';
  const cardRing = isMissed ? 'ring-red-200' : 'ring-slate-200/70';
  const cardBg = isMissed ? 'bg-red-50' : 'bg-white';
  const borderStyle = isMissed ? 'solid' : 'dashed';
  const borderColor = isMissed ? '#fecaca' : col + '55';

  return (
    <div
      className={`group relative rounded-xl ${cardBg} ring-1 ${cardRing} shadow-sm cursor-pointer overflow-hidden transition-all hover:shadow-md
        ${isSkipped ? 'opacity-40' : ''}`}
      style={{ borderWidth: 1, borderStyle, borderColor }}
      onClick={() => onEdit(pw)}
    >
      {/* Left sport accent bar */}
      <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: col }} />
      <div className="pl-3 pr-2.5 py-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="flex items-center justify-center w-5 h-5 rounded-md shrink-0"
            style={{ backgroundColor: (isMissed ? '#ef4444' : col) + '1a' }}
          >
            <PlannerSportIcon sport={pw.sport} size={12} color={isMissed ? '#ef4444' : col} />
          </span>
          <span
            className="text-xs font-semibold truncate flex-1 leading-tight"
            style={{ color: isMissed ? '#991b1b' : isSkipped ? '#9ca3af' : '#334155' }}
          >
            {pw.title}
          </span>
          {isMissed && (
            <span className="text-[9px] font-bold uppercase tracking-wide text-red-500 shrink-0">Missed</span>
          )}
        </div>
        {pw.steps?.length > 0 && <MiniWorkoutChart steps={pw.steps} />}
        {(dur > 0 || pw.targetTss) && (
          <div className="flex items-center gap-1.5 mt-1.5">
            {dur > 0 && (
              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5 tabular-nums">
                {fmtDuration(dur)}
              </span>
            )}
            {pw.targetTss && (
              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 rounded-md px-1.5 py-0.5 tabular-nums">
                {pw.targetTss} TSS
              </span>
            )}
          </div>
        )}
      </div>
      {/* Hover actions */}
      {pw.status === 'planned' && !isMissed && (
        <div className="hidden group-hover:flex items-center gap-1 px-2 pb-2 pl-3">
          {onStart && (
            <button
              onClick={e=>{e.stopPropagation();onStart(pw)}}
              className="flex items-center gap-0.5 text-[10px] text-white rounded-md px-2 py-1 font-semibold shadow-sm hover:opacity-90 transition-opacity"
              style={{ backgroundColor: col }}
            >
              <PlayIcon className="w-2.5 h-2.5" /> Start
            </button>
          )}
          <button onClick={e=>{e.stopPropagation();onComplete(pw)}}
            className="flex-1 flex items-center justify-center gap-0.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-md px-1.5 py-1 transition-colors">
              <CheckCircleIcon className="w-3 h-3" /> Done</button>
          <button onClick={e=>{e.stopPropagation();onDelete(pw)}}
            title="Delete"
            className="text-red-400 hover:text-red-500 hover:bg-red-50 rounded-md p-1 transition-colors">
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Completed Training Card (inside calendar cell) ──────────────────────────
function CompletedCard({ training, onOpen, paired = false }) {
  const sport = training.sport || training.type;
  const col = paired ? plannerSportColor(sport) : '#94a3b8';
  const title = training.title || training.name || training.titleManual || 'Activity';
  const secs = completedSecs(training);

  const shellClass = paired
    ? 'bg-emerald-50/40 ring-emerald-200/60 hover:ring-emerald-300'
    : 'bg-slate-50 ring-slate-200/70 hover:ring-slate-300';
  const titleClass = paired ? 'text-slate-700' : 'text-slate-500';
  const durClass = paired
    ? 'text-emerald-700/80 bg-emerald-100/70'
    : 'text-slate-500 bg-slate-100/80';
  const checkClass = paired ? 'text-emerald-500' : 'text-slate-400';

  return (
    <div
      className={`group relative rounded-xl ring-1 overflow-hidden transition-all ${shellClass} ${onOpen ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={onOpen ? () => onOpen(training) : undefined}
      title={onOpen ? 'Open activity' : undefined}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: col }} />
      <div className="pl-3 pr-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center w-5 h-5 rounded-md shrink-0" style={{ backgroundColor: col + '1a' }}>
            <PlannerSportIcon sport={sport} size={12} color={col} />
          </span>
          <span className={`text-xs font-medium truncate flex-1 leading-tight ${titleClass}`}>{title}</span>
          <CheckCircleIcon className={`w-4 h-4 shrink-0 ${checkClass}`} />
        </div>
        {secs > 0 && (
          <div className="mt-1.5 pl-[26px]">
            <span className={`text-[10px] font-medium rounded-md px-1.5 py-0.5 tabular-nums ${durClass}`}>
              {fmtDuration(secs)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WorkoutPlannerPage
// ═══════════════════════════════════════════════════════════════════════════
export default function WorkoutPlannerPage() {
  const { user } = useAuth();
  const { selectedAthleteId: globalAthleteId } = useAthleteSelection();
  const { addNotification } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const urlAthleteId = searchParams.get('athleteId');

  const isCoachLike = ['coach','tester','testing','admin'].includes(String(user?.role||'').toLowerCase());
  const athleteId   = urlAthleteId || (isCoachLike ? (globalAthleteId || user?._id) : user?._id);
  const coachAthleteId = isCoachLike && globalAthleteId && globalAthleteId !== user?._id ? globalAthleteId : null;

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [planned,   setPlanned]   = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [templates, setTemplates] = useState([]);
  // Built once — starter templates to fall back on when the athlete has none.
  const defaultTemplates = useMemo(
    () => DEFAULT_TEMPLATE_DEFS.map((d, i) => ({
      _id: `default-${i}`,
      name: d.name,
      sport: d.sport,
      steps: buildPresetSteps(d.preset),
      isDefault: true,
    })),
    []
  );
  // What the library shows: the athlete's own templates, or the starters when
  // they haven't saved any yet.
  const displayTemplates = templates.length > 0 ? templates : defaultTemplates;
  const [loading,   setLoading]   = useState(false);
  const [dragOverDay, setDragOverDay] = useState(null);   // dateStr currently hovered with a template drag

  // Mobile vs desktop: on phones we stack the planner into a vertical day list
  // and drop the drag-only template sidebar (HTML5 DnD doesn't work on touch).
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    window.addEventListener('orientationchange', h);
    return () => { window.removeEventListener('resize', h); window.removeEventListener('orientationchange', h); };
  }, []);
  const [modal, setModal] = useState(null); // { date, workout? }
  const [activityModal, setActivityModal] = useState(null); // { activity, plannedWorkout } — completed detail
  const [context, setContext] = useState({ ftp: 250, lt1Power: null, lt2Power: null });

  // Open the edit modal when navigated here with { editWorkout } state
  // (e.g. from PlannedWorkoutEditor's "Edit in Planner" button)
  useEffect(() => {
    const editWorkout = location.state?.editWorkout;
    if (!editWorkout) return;
    setModal({ date: editWorkout.date ? new Date(editWorkout.date) : new Date(), workout: editWorkout });
    // Clear the state so a back-nav doesn't re-open the modal
    navigate(location.pathname + location.search, { replace: true, state: {} });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.editWorkout]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // ── Load athlete context: latest test thresholds + profile zone ranges ──────
  // The WorkoutBuilder uses `cyclingZones` (from the profile) as the primary
  // source for zone wattage so targets match what the athlete sees on their
  // Training Zones screen. Test-derived lt1Power/lt2Power are a fallback.
  useEffect(() => {
    if (!athleteId) return;
    const load = async () => {
      try {
        const [testRes, profileRes] = await Promise.all([
          api.get(`/test/list/${athleteId}`).catch(() => ({ data: [] })),
          api.get(`/user/athlete/${athleteId}/profile`).catch(() => ({ data: null })),
        ]);

        // ── Test-derived thresholds ───────────────────────────────────────────
        const tests = Array.isArray(testRes.data) ? testRes.data : [];
        const withPower = tests
          .filter(t => t.lt2Power || t.ltPower || t.lt2?.power || t.thresholds?.lt2Power || t.ftp)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        const latestTest = withPower[0];

        // ── Profile zone ranges ───────────────────────────────────────────────
        const pz = profileRes.data?.powerZones || {};
        const cyclingZones  = pz.cycling  || null;
        const runningZones  = pz.running  || null;
        const swimmingZones = pz.swimming || null;

        // LT2/LT1: prefer profile fields, fall back to test
        const lt2Power = cyclingZones?.lt2 || cyclingZones?.zone4?.min
          || latestTest?.lt2Power || latestTest?.lt2?.power || null;
        const lt1Power = cyclingZones?.lt1 || cyclingZones?.zone3?.min
          || latestTest?.ltPower  || latestTest?.lt1Power   || latestTest?.lt1?.power || null;
        const lt2Pace  = runningZones?.lt2  || runningZones?.zone4?.min  || null;
        const lt1Pace  = runningZones?.lt1  || runningZones?.zone3?.min  || null;

        setContext({
          ftp: lt2Power || latestTest?.ftp || 250,
          lt2Power,
          lt1Power,
          lt2Pace,
          lt1Pace,
          cyclingZones,
          runningZones,
          swimmingZones,
          athleteId,
        });
      } catch { /* ignore */ }
    };
    load();
  }, [athleteId]);

  // ── Load planned workouts + completed trainings for visible week ──────────
  const loadWeek = useCallback(async (start) => {
    if (!athleteId) return;
    setLoading(true);
    try {
      const from = toLocalISO(start);
      const to   = toLocalISO(addDays(start, 6));
      const params = { from, to };
      if (isCoachLike && globalAthleteId && globalAthleteId !== user?._id) {
        params.athleteId = globalAthleteId;
      }
      const [pw, tplResp, trainResp, extResp] = await Promise.all([
        getPlannedWorkouts(params),
        getWorkoutTemplates(),
        // Manually-logged trainings.
        api.get(`/user/athlete/${athleteId}/trainings`).catch(() => ({ data: [] })),
        // Strava / FIT activities — the "completed" most athletes actually have.
        api.get('/api/integrations/activities', {
          params: { athleteId, summaryOnly: true, limit: 300 },
          cacheTtlMs: 60000,
        }).catch(() => ({ data: [] })),
      ]);
      setPlanned(Array.isArray(pw) ? pw : []);
      setTemplates(Array.isArray(tplResp) ? tplResp : []);

      // Merge completed from both sources (manual + Strava/FIT), dedupe, then
      // filter to the visible week.
      const extList = Array.isArray(extResp.data) ? extResp.data
                    : (extResp.data?.activities || extResp.data?.data || []);
      const merged = [
        ...(Array.isArray(trainResp.data) ? trainResp.data : []),
        ...extList,
      ];
      const seen = new Set();
      const weekTrainings = merged.filter(t => {
        const id = String(t._id || t.id || t.stravaId || '');
        if (id) { if (seen.has(id)) return false; seen.add(id); }
        const d = new Date(t.date || t.startDate || t.start_date);
        return d >= start && d <= addDays(start, 7);
      });
      setTrainings(weekTrainings);
    } catch (e) {
      addNotification('Failed to load workout plan', 'error');
    } finally {
      setLoading(false);
    }
  }, [athleteId, globalAthleteId, isCoachLike, user?._id, addNotification]);

  useEffect(() => { loadWeek(weekStart); }, [weekStart, loadWeek]);

  // ── CRUD handlers ─────────────────────────────────────────────────────────
  const handleSave = async (data) => {
    try {
      if (modal.workout?._id) {
        const updated = await updatePlannedWorkout(modal.workout._id, data, coachAthleteId);
        setPlanned(prev => prev.map(p => p._id === updated._id ? updated : p));
      } else {
        const created = await createPlannedWorkout(data, coachAthleteId);
        setPlanned(prev => [...prev, created]);
      }
      setModal(null);
      addNotification(modal.workout?._id ? 'Workout updated' : 'Workout planned', 'success');
    } catch {
      addNotification('Failed to save workout', 'error');
    }
  };

  // Drag-and-drop a template onto a day → save it straight away, no modal.
  const saveTemplateOnDay = async (day, tpl) => {
    try {
      const payload = {
        date: toLocalISO(day),
        sport: tpl.sport,
        title: tpl.name,
        steps: tpl.steps,
        plannedDuration: stepTotalSecs(tpl.steps) || undefined,
      };
      const created = await createPlannedWorkout(payload, coachAthleteId);
      setPlanned(prev => [...prev, created]);
      addNotification('Workout planned', 'success');
    } catch {
      addNotification('Failed to plan workout', 'error');
    }
  };

  const handleDelete = async (pw) => {
    if (!window.confirm('Delete this planned workout?')) return;
    try {
      await deletePlannedWorkout(pw._id, coachAthleteId);
      setPlanned(prev => prev.filter(p => p._id !== pw._id));
      setModal(null);
      addNotification('Deleted', 'success');
    } catch {
      addNotification('Failed to delete', 'error');
    }
  };

  // Resolve the prefixed activity id the detail modal needs to load Strava /
  // FIT / manual sources (same scheme the Training Calendar uses).
  const resolveActivityId = (t) => {
    let id = String(t.id || '');
    if (/^(strava|fit|training|regular|garmin)-/.test(id)) return id;
    const src = String(t.source || '').toLowerCase();
    if (t.stravaId) return `strava-${t.stravaId}`;
    if (src.includes('strava') && t.sourceId) return `strava-${t.sourceId}`;
    if (src.includes('garmin') && t.sourceId) return `garmin-${t.sourceId}`;
    if (t._id) return `training-${t._id}`;
    return id;
  };

  // Open a completed activity in the full (editable) detail modal — IN PLACE,
  // without leaving the planner. When it fulfils a planned workout, pass that
  // plan too so the modal shows planned + completed together (one box → one
  // combined modal).
  const openCompleted = (t, pw = null) => {
    const id = resolveActivityId(t);
    if (!id) return;
    setActivityModal({ activity: { ...t, id }, plannedWorkout: pw || null });
  };

  const handleComplete = async (pw) => {
    try {
      const updated = await updatePlannedWorkout(pw._id, { status: 'completed' }, coachAthleteId);
      setPlanned(prev => prev.map(p => p._id === updated._id ? updated : p));
      addNotification('Marked as completed', 'success');
    } catch {
      addNotification('Failed to update', 'error');
    }
  };

  // ── Week summary (planned + completed totals, per-sport breakdown) ────────
  const weekSummary = useMemo(() => {
    const sportKey = (s) => plannerSportKey(s);
    const sec = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

    const plannedTotals = { sec: 0, tss: 0, run: 0, bike: 0, swim: 0, other: 0 };
    planned.forEach(pw => {
      const s = (stepTotalSecs(pw.steps) || 0) || sec(pw.plannedDuration);
      plannedTotals.sec += s;
      plannedTotals.tss += sec(pw.targetTss);
      const sk = sportKey(pw.sport);
      if (sk === 'run' || sk === 'swim' || sk === 'bike') plannedTotals[sk] += s;
      else plannedTotals.other += s;
    });

    const doneTotals = { sec: 0, tss: 0, run: 0, bike: 0, swim: 0, other: 0 };
    trainings.forEach(t => {
      const s = sec(t.totalTimerTime || t.moving_time || t.movingTime || t.totalElapsedTime || t.elapsedTime || t.duration);
      doneTotals.sec += s;
      doneTotals.tss += sec(t.tss || t.TSS || t.totalTSS);
      const sk = sportKey(t.sport || t.sport_type || t.type);
      if (sk === 'run' || sk === 'swim' || sk === 'bike') doneTotals[sk] += s;
      else doneTotals.other += s;
    });

    return { planned: plannedTotals, done: doneTotals };
  }, [planned, trainings]);

  const fmtHours = (s) => (s > 0 ? `${(s / 3600).toFixed(1)}h` : '0h');
  const completionPct = weekSummary.planned.sec > 0
    ? Math.min(100, Math.round((weekSummary.done.sec / weekSummary.planned.sec) * 100))
    : null;

  // ── Render ────────────────────────────────────────────────────────────────
  const today = new Date();

  return (
    <div className="min-h-full bg-slate-50 flex">
      {/* Left: draggable template library — desktop only (drag-and-drop is a
          mouse affordance; on phones the planner goes full-width). */}
      {!isMobile && (
        <WorkoutTemplateLibrary
          templates={displayTemplates}
          onOpenTemplate={(tpl) => setModal({
            date: today,
            workout: { title: tpl.name, sport: tpl.sport, steps: tpl.steps },
          })}
        />
      )}

      {/* Right: planner */}
      <div className="flex-1 p-4 sm:p-6 min-w-0">
      {/* Header */}
      <div className={`mb-4 ${isMobile ? 'flex flex-col items-start gap-3' : 'flex items-end justify-between gap-4'}`}>
        <div className="min-w-0">
          <h1 className={`font-bold text-slate-900 leading-tight ${isMobile ? 'text-xl' : 'text-2xl'}`}>Workout Planner</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm font-medium text-slate-500">
              {weekStart.toLocaleDateString('en-GB', { day:'numeric', month:'short' })} –{' '}
              {addDays(weekStart, 6).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
            </p>
            {loading && <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
          </div>
        </div>
        {/* Week nav — segmented pill */}
        <div className="flex items-center gap-0.5 bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-1 self-start">
          <button onClick={() => setWeekStart(d => startOfWeek(addDays(d,-7)))}
            aria-label="Previous week"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors">
            Today
          </button>
          <button onClick={() => setWeekStart(d => startOfWeek(addDays(d, 7)))}
            aria-label="Next week"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Summary + athlete context ────────────────────────────────────── */}
      {(weekSummary.planned.sec > 0 || weekSummary.done.sec > 0 || context.ftp || context.lt2Power) && (
        <div className="mb-4 p-4 rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
            {/* Total time — Done / Planned */}
            {(weekSummary.planned.sec > 0 || weekSummary.done.sec > 0) && (
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Time</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-slate-900 tabular-nums">{fmtHours(weekSummary.done.sec)}</span>
                  {weekSummary.planned.sec > 0 && (
                    <span className="text-xs font-semibold text-slate-400 tabular-nums">/ {fmtHours(weekSummary.planned.sec)}</span>
                  )}
                </div>
              </div>
            )}

            {/* TSS — Done / Planned */}
            {(weekSummary.planned.tss > 0 || weekSummary.done.tss > 0) && (
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">TSS</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold text-slate-900 tabular-nums">{Math.round(weekSummary.done.tss)}</span>
                  {weekSummary.planned.tss > 0 && (
                    <span className="text-xs font-semibold text-slate-400 tabular-nums">/ {Math.round(weekSummary.planned.tss)}</span>
                  )}
                </div>
              </div>
            )}

            {/* Per-sport hours (planned, since this is a planner) */}
            {weekSummary.planned.sec > 0 && (
              <div className="flex items-center gap-3">
                {weekSummary.planned.bike > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SPORT_COLORS.bike }} /> {fmtHours(weekSummary.planned.bike)}
                  </span>
                )}
                {weekSummary.planned.run > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SPORT_COLORS.run }} /> {fmtHours(weekSummary.planned.run)}
                  </span>
                )}
                {weekSummary.planned.swim > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SPORT_COLORS.swim }} /> {fmtHours(weekSummary.planned.swim)}
                  </span>
                )}
                {weekSummary.planned.other > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <span className="w-2 h-2 rounded-full bg-slate-400" /> {fmtHours(weekSummary.planned.other)}
                  </span>
                )}
              </div>
            )}

            {/* Athlete context chips (FTP / LT1 / LT2) — pushed to the right */}
            {(context.ftp || context.lt1Power || context.lt2Power) && (
              <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                {context.ftp && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    FTP {Math.round(context.ftp)} W
                  </span>
                )}
                {context.lt1Power && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                    LT1 {Math.round(context.lt1Power)} W
                  </span>
                )}
                {context.lt2Power && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">
                    LT2 {Math.round(context.lt2Power)} W
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Progress bar — done vs planned */}
          {completionPct != null && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Completed</span>
                <span className="text-[10px] font-bold text-slate-500 tabular-nums">{completionPct}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    completionPct >= 100 ? 'bg-emerald-500' : completionPct >= 70 ? 'bg-amber-500' : 'bg-primary'
                  }`}
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7-day grid */}
      <div className={isMobile ? 'flex flex-col gap-2.5' : 'grid grid-cols-7 gap-3 items-stretch'}>
        {days.map((day, di) => {
          const dateStr  = toLocalISO(day);
          const isToday  = isSameDay(day, today);
          const dayPlanned   = planned.filter(p => {
            const d = new Date(p.date);
            return isSameDay(d, day);
          });
          const dayCompleted = trainings.filter(t => {
            const d = new Date(t.date || t.startDate || t.start_date);
            return isSameDay(d, day);
          });

          // Pair planned ↔ completed (TrainingPeaks-style, like the calendar):
          // each completed activity claims one same-sport plan, so a finished
          // workout shows ONCE as a green "done" card instead of appearing
          // twice (planned + completed).
          const todayStr = toLocalISO(today);
          const isPastDay = dateStr < todayStr;

          const ckey = (t) => String(t._id || t.id || t.stravaId || '');
          const claimedDone = new Set();
          const planMatch = new Map(); // pw._id → matched completed training
          for (const pw of dayPlanned) {
            let m = dayCompleted.find(t => !claimedDone.has(ckey(t)) && pw.completedTrainingId && String(pw.completedTrainingId) === ckey(t));
            if (!m) m = dayCompleted.find(t => !claimedDone.has(ckey(t)) && sportMatchesPlanner(pw.sport, t.sport || t.type));
            if (m) { claimedDone.add(ckey(m)); planMatch.set(pw._id, m); }
          }
          const standaloneCompleted = dayCompleted.filter(t => !claimedDone.has(ckey(t)));
          const isWeekend = di >= 5;
          const isEmpty = dayPlanned.length === 0 && dayCompleted.length === 0;

          return (
            <div
              key={dateStr}
              onDragOver={(e) => {
                if (Array.from(e.dataTransfer.types).includes('application/x-lachart-template')) {
                  e.preventDefault();
                  if (dragOverDay !== dateStr) setDragOverDay(dateStr);
                }
              }}
              onDragLeave={() => setDragOverDay(d => (d === dateStr ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverDay(null);
                const raw = e.dataTransfer.getData('application/x-lachart-template');
                if (!raw) return;
                try {
                  const tpl = JSON.parse(raw);
                  // Drop = plan it straight onto this day (no modal). Click the
                  // template in the library instead to open & edit first.
                  saveTemplateOnDay(day, tpl);
                } catch { /* ignore malformed payload */ }
              }}
              className={`group/day flex flex-col gap-2 rounded-2xl transition-all ${
                isMobile
                  ? 'ring-1 ring-slate-200/70 bg-white p-3 shadow-sm'
                  : `p-2 min-h-[180px] ring-1 ${
                      isToday
                        ? 'bg-primary/5 ring-primary/30'
                        : isWeekend
                          ? 'bg-slate-50/60 ring-slate-200/60'
                          : 'bg-white ring-slate-200/70'
                    } shadow-sm`
              } ${dragOverDay === dateStr ? 'ring-2 ring-primary/60 bg-primary/5' : ''}`}
            >
              {/* Day header — weekday left, date right (circled when today) */}
              <div className="flex items-center justify-between px-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-primary' : 'text-slate-400'}`}>
                  {DAYS[di]}
                </span>
                <span className={`flex items-center justify-center text-sm font-bold tabular-nums ${
                  isToday ? 'text-white bg-primary w-6 h-6 rounded-full' : 'text-slate-600'
                }`}>
                  {day.getDate()}
                </span>
              </div>

              {/* Planned workouts — a plan that's been completed (paired with a
                  recorded activity) renders as the single green "done" card. */}
              {dayPlanned.map(pw => {
                const matched = planMatch.get(pw._id);
                if (matched) {
                  return (
                    <CompletedCard
                      key={pw._id}
                      training={matched}
                      paired
                      onOpen={(tr) => openCompleted(tr, pw)}
                    />
                  );
                }
                const isMissed = isPastDay && pw.status !== 'completed' && pw.status !== 'skipped';
                return (
                  <PlannedCard
                    key={pw._id}
                    pw={pw}
                    isMissed={isMissed}
                    onEdit={pw => setModal({ date: day, workout: pw })}
                    onDelete={handleDelete}
                    onComplete={handleComplete}
                    onStart={pw => navigate(`/workout-execution/${pw._id}${urlAthleteId ? `?athleteId=${urlAthleteId}` : ''}`)}
                  />
                );
              })}

              {/* Completed activities not tied to any plan — grey cards */}
              {standaloneCompleted.map(t => (
                <CompletedCard key={ckey(t)} training={t} onOpen={openCompleted} />
              ))}

              {/* Empty day → "Rest day" affordance that doubles as the add button.
                  Non-empty day → compact add button at the bottom. */}
              {isEmpty && !isMobile ? (
                <button
                  onClick={() => setModal({ date: day, workout: null })}
                  className="flex-1 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 text-slate-300 hover:border-primary/40 hover:text-primary/70 hover:bg-primary/5 transition-all py-3"
                >
                  <span className="text-[11px] font-medium text-slate-400">Rest day</span>
                  <span className="flex items-center gap-1 text-[10px] opacity-0 group-hover/day:opacity-100 transition-opacity">
                    <PlusIcon className="w-3 h-3" /> Add workout
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => setModal({ date: day, workout: null })}
                  className={`flex items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 text-slate-400 hover:border-primary/40 hover:text-primary/70 hover:bg-primary/5 transition-all ${isMobile ? 'py-2 text-xs' : 'py-1.5 text-[11px] mt-auto'}`}
                >
                  <PlusIcon className={isMobile ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
                  <span className={isMobile ? '' : 'hidden sm:inline'}>Add</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Plan modal (shared component) */}
      {modal && (
        <WorkoutPlanModal
          date={modal.date}
          workout={modal.workout}
          context={context}
          templates={displayTemplates}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}

      {/* Completed-activity detail — opens in place over the planner. Passing
          plannedWorkout shows the planned + completed together. */}
      {activityModal && (
        <Suspense fallback={null}>
          <ActivityFullModal
            activity={activityModal.activity}
            plannedWorkout={activityModal.plannedWorkout}
            athleteId={coachAthleteId || athleteId}
            onClose={() => { setActivityModal(null); loadWeek(weekStart); }}
            onDeleted={() => { setActivityModal(null); loadWeek(weekStart); }}
            onPlannedSaved={() => { setActivityModal(null); loadWeek(weekStart); }}
          />
        </Suspense>
      )}
      </div>
    </div>
  );
}
