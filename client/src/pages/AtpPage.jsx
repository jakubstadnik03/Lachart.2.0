/**
 * AtpPage — the Annual Training Plan.
 *
 * A season-length view that sits above the workout planner: the planner asks
 * what Tuesday looks like, this asks whether week 14 is the right size and what
 * the whole block does to fitness by race day.
 *
 * Everything below the header is derived from two editable columns — the
 * period each week belongs to and its TSS target. Fitness, form, ramp rate and
 * the chart all recompute from those, which is why a week edit saves the plan
 * and then re-projects the entire season rather than patching one row.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon, Cog6ToothIcon, SparklesIcon, TrashIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthProvider';
import { useAthleteSelection } from '../context/AthleteSelectionContext';
import { useNotification } from '../context/NotificationContext';
import api from '../services/api';
import {
  getAtpPlans, getAtpPlan, createAtpPlan, updateAtpPlan,
  updateAtpWeeks, autoPeriodizeAtp, deleteAtpPlan,
} from '../services/atpApi';
import { getPlannedWorkouts, createPlannedWorkout } from '../services/workoutPlannerApi';
import { getTestingsByAthleteId } from '../services/api';
import { extractLactateThresholds, formatThresholdIntensity, normLactateSport } from '../utils/extractLactateThresholds';
import {
  fetchCalendarActivitiesForPmc, readCalendarActivitiesCache,
} from '../utils/calendarActivitiesForPmc';
import { mergeProfileZones } from '../utils/inferThresholdsFromActivities';
import {
  buildActualDailyTss, buildPlannedDailyTss, projectAtpSeason, mondayKeyOf,
  buildWeeklySportTotals, buildWeeklyTests,
} from '../utils/atpProjection';
import AtpChart from '../components/ATP/AtpChart';
import AtpTable from '../components/ATP/AtpTable';
import AtpSetupModal from '../components/ATP/AtpSetupModal';
import { PERIOD_META, suggestedWeekTss } from '../components/ATP/atpPeriods';

const COACH_ROLES = ['coach', 'tester', 'testing', 'admin'];

function StatBlock({ label, value, suffix = 'TSS', tone = 'text-slate-800' }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${tone}`}>
        {Number(value || 0).toLocaleString('en-US')}
      </span>
      <span className="text-[10px] text-slate-400">{suffix}</span>
    </div>
  );
}

export default function AtpPage() {
  const { user } = useAuth();
  const { selectedAthleteId } = useAthleteSelection();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  const isCoachLike = COACH_ROLES.includes(String(user?.role || '').toLowerCase());
  const coachAthleteId = isCoachLike && selectedAthleteId && selectedAthleteId !== user?._id
    ? selectedAthleteId : null;
  const athleteId = coachAthleteId || user?._id;

  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState(null);
  const [activities, setActivities] = useState([]);
  const [plannedWorkouts, setPlannedWorkouts] = useState([]);
  const [tests, setTests] = useState([]);
  const [chartMode, setChartMode] = useState('load');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [editSettings, setEditSettings] = useState(false);

  // ── Season list, and the one being shown ─────────────────────────────────
  const loadPlans = useCallback(async () => {
    if (!athleteId) return;
    setLoading(true);
    try {
      const list = await getAtpPlans(coachAthleteId);
      setPlans(list);
      if (list.length) {
        const full = await getAtpPlan(list[0]._id, coachAthleteId);
        setPlan(full);
      } else {
        setPlan(null);
      }
    } catch (e) {
      addNotification(e?.response?.data?.error || 'Could not load the training plan', 'error');
    } finally {
      setLoading(false);
    }
  }, [athleteId, coachAthleteId, addNotification]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  // ── The load history the projection runs on ──────────────────────────────
  useEffect(() => {
    if (!athleteId) { setActivities([]); return; }
    const cached = readCalendarActivitiesCache(athleteId);
    if (cached.length) setActivities(cached);
    fetchCalendarActivitiesForPmc(api, athleteId)
      .then((acts) => { if (acts.length) setActivities(acts); })
      .catch(() => { /* the cache is good enough to paint with */ });
  }, [athleteId]);

  useEffect(() => {
    if (!athleteId) return;
    api.get(`/user/athlete/${athleteId}/profile`)
      .then((r) => setProfile(r.data || null))
      .catch(() => setProfile(null));
  }, [athleteId]);

  // Planned workouts across the season so the Actual line follows what is
  // already on the calendar rather than decaying from today.
  useEffect(() => {
    if (!plan?.startDate) { setPlannedWorkouts([]); return; }
    getPlannedWorkouts({
      from: plan.startDate,
      to: plan.endDate,
      ...(coachAthleteId ? { athleteId: coachAthleteId } : {}),
    })
      .then((list) => setPlannedWorkouts(Array.isArray(list) ? list : []))
      .catch(() => setPlannedWorkouts([]));
  }, [plan?.startDate, plan?.endDate, coachAthleteId]);

  // Lactate tests, so the season can show when the zones it is written in
  // were last measured — and when they are due to be measured again.
  useEffect(() => {
    if (!athleteId) { setTests([]); return; }
    getTestingsByAthleteId(athleteId)
      .then((list) => setTests(Array.isArray(list) ? list : []))
      .catch(() => setTests([]));
  }, [athleteId]);

  // ── Projection ───────────────────────────────────────────────────────────
  const tssProfile = useMemo(
    () => mergeProfileZones(profile, user) || profile || user,
    [profile, user],
  );

  const actualDailyTss = useMemo(
    () => buildActualDailyTss(activities, tssProfile, { tssUser: user }),
    [activities, tssProfile, user],
  );

  const plannedDailyTss = useMemo(
    () => buildPlannedDailyTss(plannedWorkouts),
    [plannedWorkouts],
  );

  const sportsByWeek = useMemo(
    () => buildWeeklySportTotals({ activities, plannedWorkouts }),
    [activities, plannedWorkouts],
  );

  const testsByWeek = useMemo(
    () => buildWeeklyTests({
      tests,
      plannedWorkouts,
      // What the test found, through the same pipeline the testing page and
      // the zone tables use — so the number in the season plan is the number
      // the athlete's zones were actually built from.
      describe: (t) => {
        try {
          const th = extractLactateThresholds(t);
          if (!th || th.lt2 == null) return null;
          return `LT2 ${formatThresholdIntensity(th.lt2, t, normLactateSport(t?.sport))}`;
        } catch {
          return null;
        }
      },
    }),
    [tests, plannedWorkouts],
  );

  const { rows, totals } = useMemo(() => projectAtpSeason({
    weeks: plan?.weeks || [],
    actualDailyTss,
    plannedDailyTss,
    races: plan?.races || [],
    sportsByWeek,
    testsByWeek,
  }), [plan?.weeks, plan?.races, actualDailyTss, plannedDailyTss, sportsByWeek, testsByWeek]);

  /** Biggest week the athlete has actually done — the honest starting point. */
  const suggestedPeakTss = useMemo(() => {
    const byWeek = {};
    for (const [day, tss] of Object.entries(actualDailyTss)) {
      const wk = mondayKeyOf(day);
      if (wk) byWeek[wk] = (byWeek[wk] || 0) + tss;
    }
    const vals = Object.values(byWeek);
    if (!vals.length) return null;
    return Math.round(Math.max(...vals) / 10) * 10;
  }, [actualDailyTss]);

  /**
   * A test in the table opens where it can be read: a finished one on the
   * testing page, a pencilled-in one on the calendar week it sits in — which
   * is where it would be moved or filled in.
   */
  /**
   * Put a lactate test in a week of the plan.
   *
   * It lands as a planned session with the sport "lactate", which is the shape
   * the calendar already understands — so it shows up there to be moved to the
   * right day, and comes back to this table as a pencilled-in test. Monday,
   * because a week has to start somewhere and dragging it is one gesture.
   */
  const handlePlanTest = useCallback(async (row) => {
    if (!row?.weekStart) return;
    try {
      const saved = await createPlannedWorkout({
        sport: 'lactate',
        title: 'Lactate test',
        date: row.weekStart,
        plannedDuration: 3600,
      }, coachAthleteId);
      setPlannedWorkouts((prev) => [...prev, saved]);
      addNotification('Test added to the plan', 'success');
    } catch (e) {
      addNotification(e?.response?.data?.error || 'Could not add the test', 'error');
    }
  }, [coachAthleteId, addNotification]);

  const handleOpenTest = useCallback((t) => {
    if (!t) return;
    if (t.done && t.id) navigate(`/testing?testId=${encodeURIComponent(t.id)}`);
    else if (t.date) navigate(`/training-calendar?date=${encodeURIComponent(t.date)}`);
  }, [navigate]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const handleCreate = async (payload) => {
    setSaving(true);
    try {
      const created = await createAtpPlan(payload, coachAthleteId);
      setPlans((prev) => [created, ...prev]);
      setPlan(created);
      setShowSetup(false);
      addNotification('Training plan created', 'success');
    } finally {
      setSaving(false);
    }
  };

  const handleSettings = async (payload) => {
    if (!plan?._id) return;
    setSaving(true);
    try {
      const updated = await updateAtpPlan(plan._id, payload, coachAthleteId);
      setPlan(updated);
      setPlans((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
      setEditSettings(false);
      addNotification('Season updated', 'success');
    } finally {
      setSaving(false);
    }
  };

  /**
   * A week edit is applied locally first so the table and chart move under the
   * cursor, then saved. The server's answer replaces the optimistic state
   * because it also renumbers the period weeks the edit may have shifted.
   */
  const handleWeekChange = useCallback(async (weekStart, patch) => {
    if (!plan?._id) return;
    const before = plan;

    // targetTss: undefined is the "use the pattern" signal. Locally that means
    // showing what the pattern would give, so the cell does not blink to empty
    // while the save is in flight.
    const resetTss = 'targetTss' in patch && patch.targetTss === undefined;

    const optimistic = {
      ...plan,
      weeks: plan.weeks.map((w) => {
        if (w.weekStart !== weekStart) return w;
        const next = { ...w, ...patch };
        if (resetTss) next.targetTss = suggestedWeekTss(next.period, next.periodWeek, plan.peakWeeklyTss);
        return next;
      }),
    };
    setPlan(optimistic);

    try {
      const week = optimistic.weeks.find((w) => w.weekStart === weekStart);
      const payload = {
        weekStart,
        period: week.period,
        targetHours: week.targetHours,
        notes: week.notes,
        // Omitting targetTss asks the server to re-derive it from the period.
        ...(resetTss ? {} : { targetTss: week.targetTss }),
      };
      const saved = await updateAtpWeeks(plan._id, [payload], coachAthleteId);
      setPlan((cur) => ({ ...cur, ...saved, races: cur?.races || [] }));
    } catch (e) {
      setPlan(before);
      addNotification(e?.response?.data?.error || 'Could not save that week', 'error');
    }
  }, [plan, coachAthleteId, addNotification]);

  const handleAutoPeriodize = async () => {
    if (!plan?._id) return;
    if (!window.confirm('Rebuild the blocks around your A races? Periods and TSS targets are regenerated; your notes stay.')) return;
    setSaving(true);
    try {
      const updated = await autoPeriodizeAtp(plan._id, coachAthleteId);
      setPlan(updated);
      addNotification('Season rebuilt around your races', 'success');
    } catch (e) {
      addNotification(e?.response?.data?.error || 'Could not rebuild the season', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!plan?._id) return;
    if (!window.confirm(`Delete "${plan.name}"? This cannot be undone.`)) return;
    try {
      await deleteAtpPlan(plan._id, coachAthleteId);
      addNotification('Plan deleted', 'success');
      await loadPlans();
    } catch (e) {
      addNotification(e?.response?.data?.error || 'Could not delete the plan', 'error');
    }
  };

  const switchPlan = async (id) => {
    setLoading(true);
    try {
      setPlan(await getAtpPlan(id, coachAthleteId));
    } catch {
      addNotification('Could not load that plan', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading && !plan) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-400">
        Loading your season…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-slate-800">Annual Training Plan</h1>
        <p className="text-sm text-slate-500 mt-2 mb-6">
          Lay out the whole season week by week — periods, weekly TSS targets, and what
          they add up to as fitness on race day. Add your A races first and the blocks
          build themselves backwards from them.
        </p>
        <button
          type="button"
          onClick={() => setShowSetup(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark"
        >
          <PlusIcon className="w-4 h-4" /> Build my season
        </button>
        <AtpSetupModal
          isOpen={showSetup}
          onClose={() => setShowSetup(false)}
          onSave={handleCreate}
          suggestedPeakTss={suggestedPeakTss}
          saving={saving}
        />
      </div>
    );
  }

  const completionPct = totals.atpTss > 0
    ? Math.round((totals.completedTss / totals.atpTss) * 100) : 0;

  return (
    <div className="px-3 sm:px-5 py-4 max-w-[1700px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <h1 className="text-lg font-bold text-slate-800">{plan.name}</h1>

        {plans.length > 1 && (
          <select
            value={plan._id}
            onChange={(e) => switchPlan(e.target.value)}
            className="text-xs rounded-lg border border-slate-300 px-2 py-1 bg-white"
          >
            {plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button" onClick={handleAutoPeriodize} disabled={saving}
            title="Rebuild the blocks around your A races"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            <SparklesIcon className="w-4 h-4" /> Auto-periodize
          </button>
          <button
            type="button" onClick={() => setEditSettings(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            <Cog6ToothIcon className="w-4 h-4" /> Settings
          </button>
          <button
            type="button" onClick={() => setShowSetup(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <PlusIcon className="w-4 h-4" /> New season
          </button>
          <button
            type="button" onClick={handleDelete}
            title="Delete this plan"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red hover:bg-red/10"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Season totals + legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 pb-3 border-b border-slate-200">
        <StatBlock label="ATP TSS" value={totals.atpTss} />
        <StatBlock label="Planned" value={totals.plannedTss} tone="text-slate-500" />
        <StatBlock label="Completed" value={totals.completedTss} tone="text-primary" />
        <span className="text-[11px] text-slate-400">
          {completionPct}% of the season's target load logged
        </span>

        <div className="flex flex-wrap items-center gap-3 ml-auto text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-2.5 rounded-sm bg-slate-200" /> Plan TSS
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2.5 rounded-sm bg-blue-800" /> Completed
          </span>
          <span className="font-semibold text-blue-600 ml-1">Fitness (CTL)</span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2.5 rounded-sm" style={{ background: 'rgba(147,197,253,.75)' }} /> ATP
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-blue-700" /> Actual
          </span>
          <span className="font-semibold text-amber-600 ml-1">Form (TSB)</span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2.5 rounded-sm" style={{ background: 'rgba(234,179,8,.45)' }} /> ATP
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-0.5 bg-orange-500" /> Actual
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl ring-1 ring-slate-200 bg-white p-2 mb-4">
        {/* The same season, measured two ways. Load asks whether each week is
            the right size; volume asks what it is made of, which is the
            question a base block gets judged on. */}
        <div className="flex justify-end px-1 pb-1">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {[['load', 'Load'], ['volume', 'Volume']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setChartMode(id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  chartMode === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <AtpChart rows={rows} totals={totals} mode={chartMode} />
      </div>

      {/* Period key */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {Object.entries(PERIOD_META).map(([id, meta]) => (
          <span
            key={id}
            className="text-[10px] font-semibold rounded px-1.5 py-0.5"
            style={{ backgroundColor: meta.color, color: meta.text }}
          >
            {meta.label}
          </span>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
        <AtpTable
          rows={rows}
          peakWeeklyTss={plan.peakWeeklyTss}
          onWeekChange={handleWeekChange}
          onOpenTest={handleOpenTest}
          onPlanTest={handlePlanTest}
        />
      </div>

      <p className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
        <ArrowPathIcon className="w-3.5 h-3.5" />
        Edit the period or TSS of any week and the whole projection updates. Clear a TSS
        box to hand that week back to the periodization pattern.
      </p>

      <AtpSetupModal
        isOpen={showSetup}
        onClose={() => setShowSetup(false)}
        onSave={handleCreate}
        suggestedPeakTss={suggestedPeakTss}
        saving={saving}
      />
      <AtpSetupModal
        isOpen={editSettings}
        onClose={() => setEditSettings(false)}
        onSave={handleSettings}
        plan={plan}
        suggestedPeakTss={suggestedPeakTss}
        saving={saving}
      />
    </div>
  );
}
