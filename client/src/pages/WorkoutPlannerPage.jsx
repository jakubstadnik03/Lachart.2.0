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
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthProvider';
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import { useNotification } from '../context/NotificationContext';
import WorkoutPlanModal, { stepTotalSecs, toLocalISO } from '../components/WorkoutPlanner/WorkoutPlanModal';
import PlannerWeekRow from '../components/WorkoutPlanner/PlannerWeekRow';
import PlannerProgressPanel from '../components/WorkoutPlanner/PlannerProgressPanel';
import { startOfWeek, addDays, filterItemsForWeek } from '../components/WorkoutPlanner/plannerWeekUtils';
import {
  getPlannedWorkouts, createPlannedWorkout, updatePlannedWorkout,
  deletePlannedWorkout, getWorkoutTemplates,
} from '../services/workoutPlannerApi';
import api from '../services/api';
import {
  fetchCalendarActivitiesForPmc,
  readCalendarActivitiesCache,
} from '../utils/calendarActivitiesForPmc';
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

const VISIBLE_WEEKS = 8;
const NAV_SHIFT_WEEKS = 4;

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

  const [anchorWeek, setAnchorWeek] = useState(() => startOfWeek(new Date()));
  const [planned,   setPlanned]   = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [calendarActivities, setCalendarActivities] = useState([]);
  const [chartActivities, setChartActivities] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
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

  // Same calendar activity list as Dashboard — needed for matching CTL/ATL/TSB.
  useEffect(() => {
    if (!athleteId) {
      setCalendarActivities([]);
      return;
    }
    const cached = readCalendarActivitiesCache(athleteId);
    if (cached.length) setCalendarActivities(cached);
    fetchCalendarActivitiesForPmc(api, athleteId)
      .then((acts) => { if (acts.length) setCalendarActivities(acts); })
      .catch(() => { /* keep cache */ });
  }, [athleteId]);

  const weekStarts = useMemo(
    () => Array.from({ length: VISIBLE_WEEKS }, (_, i) => addDays(anchorWeek, i * 7)),
    [anchorWeek],
  );
  const rangeEnd = addDays(anchorWeek, VISIBLE_WEEKS * 7 - 1);

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
        setUserProfile(profileRes.data || null);
      } catch { /* ignore */ }
    };
    load();
  }, [athleteId]);

  // ── Load planned workouts + completed trainings for visible range ─────────
  const loadRange = useCallback(async (start) => {
    if (!athleteId) return;
    setLoading(true);
    try {
      const fetchStart = addDays(start, -7);
      const fetchEnd = addDays(start, VISIBLE_WEEKS * 7 - 1);
      const from = toLocalISO(fetchStart);
      const to = toLocalISO(fetchEnd);
      const params = { from, to };
      if (isCoachLike && globalAthleteId && globalAthleteId !== user?._id) {
        params.athleteId = globalAthleteId;
      }
      const [pw, tplResp, trainResp, extResp] = await Promise.all([
        getPlannedWorkouts(params),
        getWorkoutTemplates(),
        api.get(`/user/athlete/${athleteId}/trainings`).catch(() => ({ data: [] })),
        api.get('/api/integrations/activities', {
          params: { athleteId, summaryOnly: true, limit: 500 },
          cacheTtlMs: 60000,
        }).catch(() => ({ data: [] })),
      ]);
      setPlanned(Array.isArray(pw) ? pw : []);
      setTemplates(Array.isArray(tplResp) ? tplResp : []);

      const extList = Array.isArray(extResp.data) ? extResp.data
                    : (extResp.data?.activities || extResp.data?.data || []);
      const merged = [
        ...(Array.isArray(trainResp.data) ? trainResp.data : []),
        ...extList,
      ];
      const seen = new Set();
      const rangeEndExclusive = addDays(fetchStart, VISIBLE_WEEKS * 7 + 7);
      const chartCutoff = addDays(new Date(), -120);
      const rangeTrainings = [];
      const chartList = [];
      merged.forEach((t) => {
        const id = String(t._id || t.id || t.stravaId || '');
        if (id && seen.has(id)) return;
        if (id) seen.add(id);
        const d = new Date(t.date || t.startDate || t.start_date);
        if (d >= fetchStart && d < rangeEndExclusive) rangeTrainings.push(t);
        if (d >= chartCutoff) chartList.push(t);
      });
      setTrainings(rangeTrainings);
      setChartActivities(chartList);
    } catch {
      addNotification('Failed to load workout plan', 'error');
    } finally {
      setLoading(false);
    }
  }, [athleteId, globalAthleteId, isCoachLike, user?._id, addNotification]);

  useEffect(() => { loadRange(anchorWeek); }, [anchorWeek, loadRange]);

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

      {/* Planner + progress charts */}
      <div className={`flex-1 min-w-0 ${isMobile ? '' : 'flex'}`}>
      <div className="flex-1 p-4 sm:p-6 min-w-0">
      {/* Header */}
      <div className={`mb-4 ${isMobile ? 'flex flex-col items-start gap-3' : 'flex items-end justify-between gap-4'}`}>
        <div className="min-w-0">
          <h1 className={`font-bold text-slate-900 leading-tight ${isMobile ? 'text-xl' : 'text-2xl'}`}>Workout Planner</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-sm font-medium text-slate-500 tabular-nums">
              {anchorWeek.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} –{' '}
              {rangeEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            <span className="text-xs text-slate-400">· {VISIBLE_WEEKS} weeks</span>
            {loading && <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
          </div>
        </div>
        <div className="flex items-center gap-0.5 bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-1 self-start">
          <button
            type="button"
            onClick={() => setAnchorWeek((d) => startOfWeek(addDays(d, -NAV_SHIFT_WEEKS * 7)))}
            aria-label="Previous weeks"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchorWeek(startOfWeek(new Date()))}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setAnchorWeek((d) => startOfWeek(addDays(d, NAV_SHIFT_WEEKS * 7)))}
            aria-label="Next weeks"
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Athlete context chips */}
      {(context.ftp || context.lt1Power || context.lt2Power) && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
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

      {/* Stacked weeks — each row: 7-day grid + right summary column */}
      {weekStarts.map((ws) => (
        <PlannerWeekRow
          key={ws.toISOString()}
          weekStart={ws}
          planned={planned}
          trainings={trainings}
          prevWeekTrainings={filterItemsForWeek(trainings, addDays(ws, -7))}
          context={context}
          user={user}
          userProfile={userProfile}
          isMobile={isMobile}
          today={today}
          dragOverDay={dragOverDay}
          setDragOverDay={setDragOverDay}
          onEdit={(day, pw) => setModal({ date: day, workout: pw })}
          onDelete={handleDelete}
          onComplete={handleComplete}
          onStart={(pw) => navigate(`/workout-execution/${pw._id}${urlAthleteId ? `?athleteId=${urlAthleteId}` : ''}`)}
          onOpenCompleted={openCompleted}
          onAddDay={(day) => setModal({ date: day, workout: null })}
          onDropTemplate={saveTemplateOnDay}
        />
      ))}

      {isMobile && (
        <PlannerProgressPanel
          weekStarts={weekStarts}
          planned={planned}
          trainings={trainings}
          calendarActivities={calendarActivities}
          chartActivities={chartActivities}
          context={context}
          user={user}
          userProfile={userProfile}
          compact
        />
      )}

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
            onClose={() => { setActivityModal(null); loadRange(anchorWeek); }}
            onDeleted={() => { setActivityModal(null); loadRange(anchorWeek); }}
            onPlannedSaved={() => { setActivityModal(null); loadRange(anchorWeek); }}
          />
        </Suspense>
      )}
      </div>

      {!isMobile && (
        <PlannerProgressPanel
          weekStarts={weekStarts}
          planned={planned}
          trainings={trainings}
          calendarActivities={calendarActivities}
          chartActivities={chartActivities}
          context={context}
          user={user}
          userProfile={userProfile}
        />
      )}
      </div>
    </div>
  );
}
