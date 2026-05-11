/**
 * WorkoutPlannerPage
 * ──────────────────
 * Weekly calendar view showing:
 *   • Planned workouts (with workout structure)
 *   • Completed trainings from the same week
 * Plus: create/edit planned workouts with WorkoutBuilder
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon,
         TrashIcon, CheckCircleIcon, PlayIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthProvider';
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import { useNotification } from '../context/NotificationContext';
import WorkoutPlanModal, {
  SPORT_ICONS, SPORT_COLORS, stepTotalSecs, fmtDuration, toLocalISO, MiniWorkoutChart,
} from '../components/WorkoutPlanner/WorkoutPlanModal';
import {
  getPlannedWorkouts, createPlannedWorkout, updatePlannedWorkout,
  deletePlannedWorkout, getWorkoutTemplates,
} from '../services/workoutPlannerApi';
import api from '../services/api';

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

// ─── Planned Workout Card (inside calendar cell) ─────────────────────────────
function PlannedCard({ pw, onEdit, onDelete, onComplete, onStart }) {
  const col = SPORT_COLORS[pw.sport] || '#94a3b8';
  const dur = stepTotalSecs(pw.steps);
  return (
    <div
      className={`rounded-lg border bg-white cursor-pointer hover:shadow-sm transition-shadow overflow-hidden group
        ${pw.status === 'completed' ? 'opacity-60' : ''}
        ${pw.status === 'skipped' ? 'opacity-40' : ''}`}
      style={{ borderStyle: 'dashed', borderColor: col + '80', borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: col }}
      onClick={() => onEdit(pw)}
    >
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-1.5 mb-1">
          <img src={SPORT_ICONS[pw.sport] || '/icon/default.svg'} alt={pw.sport} className="w-3 h-3 opacity-80" />
          <span className="text-[11px] font-semibold text-slate-700 truncate flex-1">{pw.title}</span>
          {pw.status === 'completed' && <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
        </div>
        {pw.steps?.length > 0 && <MiniWorkoutChart steps={pw.steps} />}
        <div className="flex items-center justify-between mt-1">
          {dur > 0 && <span className="text-[10px] text-slate-400">{fmtDuration(dur)}</span>}
          {pw.targetTss && <span className="text-[10px] text-slate-400">{pw.targetTss} TSS</span>}
        </div>
      </div>
      {/* Hover actions */}
      <div className="hidden group-hover:flex items-center gap-1 px-1.5 pb-1.5">
        {pw.status === 'planned' && onStart && (
          <button
            onClick={e=>{e.stopPropagation();onStart(pw)}}
            className="flex items-center gap-0.5 text-[10px] text-white rounded px-1.5 py-0.5 font-semibold"
            style={{ backgroundColor: col }}
          >
            <PlayIcon className="w-2.5 h-2.5" /> Start
          </button>
        )}
        {pw.status === 'planned' && (
          <button onClick={e=>{e.stopPropagation();onComplete(pw)}}
            className="flex-1 flex items-center justify-center gap-0.5 text-[10px] text-emerald-600 hover:bg-emerald-50 rounded px-1 py-0.5">
              <CheckCircleIcon className="w-3 h-3" /> Done</button>
        )}
        <button onClick={e=>{e.stopPropagation();onDelete(pw)}}
          className="text-[10px] text-red-400 hover:bg-red-50 rounded px-1 py-0.5">
          <TrashIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Completed Training Card (inside calendar cell) ──────────────────────────
function CompletedCard({ training }) {
  const sport = training.sport || 'bike';
  const col = SPORT_COLORS[sport] || '#94a3b8';
  return (
    <div className="rounded-lg border bg-slate-50 overflow-hidden"
      style={{ borderColor: col + '40', borderLeftWidth: 2, borderLeftColor: col }}>
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <img src={SPORT_ICONS[sport] || '/icon/default.svg'} alt={sport} className="w-3 h-3 opacity-60" />
          <span className="text-[11px] text-slate-500 truncate">{training.title || 'Untitled'}</span>
          <CheckCircleIcon className="w-3 h-3 text-emerald-400 shrink-0 ml-auto" />
        </div>
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
  const [searchParams] = useSearchParams();
  const urlAthleteId = searchParams.get('athleteId');

  const isCoachLike = ['coach','tester','testing','admin'].includes(String(user?.role||'').toLowerCase());
  const athleteId   = urlAthleteId || (isCoachLike ? (globalAthleteId || user?._id) : user?._id);
  const coachAthleteId = isCoachLike && globalAthleteId && globalAthleteId !== user?._id ? globalAthleteId : null;

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [planned,   setPlanned]   = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [modal, setModal] = useState(null); // { date, workout? }
  const [context, setContext] = useState({ ftp: 250, lt1Power: null, lt2Power: null });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // ── Load athlete context (FTP / LT thresholds from latest test) ───────────
  useEffect(() => {
    if (!athleteId) return;
    const load = async () => {
      try {
        const res = await api.get(`/test/list/${athleteId}`);
        const tests = Array.isArray(res.data) ? res.data : [];
        // Latest test with power data
        const withPower = tests
          .filter(t => t.lt2?.power || t.thresholds?.lt2Power)
          .sort((a,b) => new Date(b.date) - new Date(a.date));
        if (withPower.length > 0) {
          const t = withPower[0];
          setContext({
            ftp:      t.ftp || t.thresholds?.ftp || t.lt2?.power || 250,
            lt2Power: t.lt2?.power || t.thresholds?.lt2Power || null,
            lt1Power: t.lt1?.power || t.thresholds?.lt1Power || null,
          });
        }
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
      const [pw, tplResp, trainResp] = await Promise.all([
        getPlannedWorkouts(params),
        getWorkoutTemplates(),
        api.get(`/user/athlete/${athleteId}/trainings`).catch(() => ({ data: [] })),
      ]);
      setPlanned(Array.isArray(pw) ? pw : []);
      setTemplates(Array.isArray(tplResp) ? tplResp : []);

      // Filter trainings to this week
      const weekTrainings = (trainResp.data || []).filter(t => {
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
    const sportKey = (s) => {
      const x = String(s || '').toLowerCase();
      if (x.includes('run')) return 'run';
      if (x.includes('swim')) return 'swim';
      if (x.includes('ride') || x.includes('cycle') || x.includes('bike') || x.includes('virtual')) return 'bike';
      return 'other';
    };
    const sec = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

    const plannedTotals = { sec: 0, tss: 0, run: 0, bike: 0, swim: 0, other: 0 };
    planned.forEach(pw => {
      const s = (stepTotalSecs(pw.steps) || 0) || sec(pw.plannedDuration);
      plannedTotals.sec += s;
      plannedTotals.tss += sec(pw.targetTss);
      plannedTotals[sportKey(pw.sport)] += s;
    });

    const doneTotals = { sec: 0, tss: 0, run: 0, bike: 0, swim: 0, other: 0 };
    trainings.forEach(t => {
      const s = sec(t.totalTimerTime || t.moving_time || t.movingTime || t.totalElapsedTime || t.elapsedTime || t.duration);
      doneTotals.sec += s;
      doneTotals.tss += sec(t.tss || t.TSS || t.totalTSS);
      doneTotals[sportKey(t.sport || t.sport_type || t.type)] += s;
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
    <div className="min-h-full bg-gray-50 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workout Planner</h1>
          <p className="text-sm text-slate-400 mt-0.5">Plan structured workouts for your calendar</p>
        </div>
        {/* Week nav */}
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(d => startOfWeek(addDays(d,-7)))}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors">
            Today
          </button>
          <button onClick={() => setWeekStart(d => startOfWeek(addDays(d, 7)))}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 transition-colors">
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Week label */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-slate-700">
          {weekStart.toLocaleDateString('en-GB', { day:'numeric', month:'long' })} –{' '}
          {addDays(weekStart, 6).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}
        </span>
        {loading && <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
      </div>

      {/* Context bar (FTP / LT1 / LT2) */}
      {(context.ftp || context.lt2Power) && (
        <div className="flex flex-wrap gap-2 mb-4">
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

      {/* ── Week summary ─────────────────────────────────────────────────── */}
      {(weekSummary.planned.sec > 0 || weekSummary.done.sec > 0) && (
        <div className="mb-3 p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* Total time — Done / Planned */}
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Time</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-slate-900 tabular-nums">{fmtHours(weekSummary.done.sec)}</span>
                {weekSummary.planned.sec > 0 && (
                  <span className="text-xs font-semibold text-slate-400 tabular-nums">/ {fmtHours(weekSummary.planned.sec)}</span>
                )}
              </div>
            </div>

            {/* TSS — Done / Planned */}
            {(weekSummary.planned.tss > 0 || weekSummary.done.tss > 0) && (
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">TSS</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-slate-900 tabular-nums">{Math.round(weekSummary.done.tss)}</span>
                  {weekSummary.planned.tss > 0 && (
                    <span className="text-xs font-semibold text-slate-400 tabular-nums">/ {Math.round(weekSummary.planned.tss)}</span>
                  )}
                </div>
              </div>
            )}

            {/* Per-sport hours (planned, since this is a planner) */}
            {weekSummary.planned.sec > 0 && (
              <div className="flex items-center gap-3 ml-auto">
                {weekSummary.planned.bike > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {fmtHours(weekSummary.planned.bike)}
                  </span>
                )}
                {weekSummary.planned.run > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-orange-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> {fmtHours(weekSummary.planned.run)}
                  </span>
                )}
                {weekSummary.planned.swim > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-cyan-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> {fmtHours(weekSummary.planned.swim)}
                  </span>
                )}
                {weekSummary.planned.other > 0 && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {fmtHours(weekSummary.planned.other)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Progress bar — done vs planned */}
          {completionPct != null && (
            <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  completionPct >= 100 ? 'bg-emerald-500' : completionPct >= 70 ? 'bg-amber-500' : 'bg-primary'
                }`}
                style={{ width: `${completionPct}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-2">
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

          return (
            <div key={dateStr} className="flex flex-col gap-1.5 min-h-[120px]">
              {/* Day header */}
              <div className={`flex flex-col items-center py-1 rounded-xl mb-0.5 ${isToday ? 'bg-primary' : 'bg-white border border-slate-100'}`}>
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? 'text-white/80' : 'text-slate-400'}`}>
                  {DAYS[di]}
                </span>
                <span className={`text-base font-bold leading-tight ${isToday ? 'text-white' : 'text-slate-700'}`}>
                  {day.getDate()}
                </span>
              </div>

              {/* Planned workouts */}
              {dayPlanned.map(pw => (
                <PlannedCard
                  key={pw._id}
                  pw={pw}
                  onEdit={pw => setModal({ date: day, workout: pw })}
                  onDelete={handleDelete}
                  onComplete={handleComplete}
                  onStart={pw => navigate(`/workout-execution/${pw._id}${urlAthleteId ? `?athleteId=${urlAthleteId}` : ''}`)}
                />
              ))}

              {/* Completed trainings */}
              {dayCompleted.map(t => (
                <CompletedCard key={t._id} training={t} />
              ))}

              {/* Add button */}
              <button
                onClick={() => setModal({ date: day, workout: null })}
                className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-slate-200 text-slate-300 hover:border-primary/40 hover:text-primary/60 transition-colors text-[11px] mt-auto"
              >
                <PlusIcon className="w-3 h-3" />
                <span className="hidden sm:inline">Add</span>
              </button>
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
          templates={templates}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
