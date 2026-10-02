/**
 * The week a test is asking for.
 *
 * The three cards are the recommendation. Clicking one opens a modal: the
 * workout as an intensity profile, and a calendar that already shows what
 * is planned, so the day is chosen against a real week. "Show all trainings"
 * swaps in the rest of that sport's library. Saving onto a day is the paid
 * step. The steps are the planner's own presets, still aimed at LT1 and LT2.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, LockClosedIcon, XMarkIcon } from '@heroicons/react/24/outline';
import TestSection from './TestSection';
import { resolveLtAnchorsFromTest } from './resolveLtAnchorsFromTest';
import { prescribeFromTest, prescriptionDates } from '../../utils/testWorkoutPrescription';
import { sportKind } from '../../utils/hrPowerProfile';
import {
  PRESET_CATALOG, PRESET_CATEGORY_LABELS, buildPresetSteps, expandSteps,
} from '../WorkoutPlanner/WorkoutBuilder';
import { stepsTotalSeconds } from '../../utils/planSessionSteps';
import { addDays, isSameDay, startOfWeek, toLocalDateStr } from '../WorkoutPlanner/plannerWeekUtils';
import { stepsToLines } from '../../utils/workoutStepsText';
import {
  createPlannedWorkout,
  createWorkoutTemplate,
  getPlannedWorkouts,
  getWorkoutTemplates,
} from '../../services/workoutPlannerApi';
import { useNotification } from '../../context/NotificationContext';
import { trackFeatureUsage } from '../../utils/analytics';

const DOT = { warmup: '#fbbf24', work: '#767EB5', recovery: '#34d399', cooldown: '#38bdf8', rest: '#cbd5e1', group: '#767EB5' };
const ZONE_COLORS = ['#93c5fd', '#86efac', '#fde68a', '#fb923c', '#f87171'];
const ZONE_LEVEL = [0.34, 0.52, 0.7, 0.86, 1];

function fmtDuration(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtAnchor(value, sport, imperialRun) {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (sport === 'bike') return `${Math.round(value)} W`;
  const total = Math.round(value);
  const m = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, '0');
  const unit = sport === 'swim' ? '/100m' : imperialRun ? '/mi' : '/km';
  return `${m}:${sec}${unit}`;
}

function dayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function plannedDayKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return toLocalDateStr(d);
}

/** Height follows the target, so a long Z2 block is not a wall and a VO₂ rep stands above its jog. */
function stepLevel(step) {
  const t = step?.powerTarget;
  if (t?.type === 'zone') return ZONE_LEVEL[Math.min((Number(t.value) || 1) - 1, 4)];
  if (t?.type === 'lt1') return 0.58;
  if (t?.type === 'percent_lt1') return Math.min(1, 0.58 * ((Number(t.value) || 100) / 100));
  if (t?.type === 'lt2') return 0.88;
  if (t?.type === 'percent_lt2') return Math.min(1, 0.88 * ((Number(t.value) || 100) / 100));
  if (t?.type === 'percent_ftp') {
    const v = t.useRange ? ((Number(t.rangeMin) + Number(t.rangeMax)) / 2) : (Number(t.value) || 80);
    return Math.min(1, v / 115);
  }
  if (step?.stepType === 'recovery' || step?.stepType === 'rest') return 0.22;
  if (step?.stepType === 'warmup' || step?.stepType === 'cooldown') return 0.4;
  return 0.55;
}

function stepFill(step) {
  const t = step?.powerTarget;
  if (t?.type === 'zone') return ZONE_COLORS[Math.min((Number(t.value) || 1) - 1, 4)];
  if (step?.stepType === 'recovery' || step?.stepType === 'rest') return '#6ee7b7';
  if (step?.stepType === 'warmup') return '#fbbf24';
  if (step?.stepType === 'cooldown') return '#38bdf8';
  return '#767EB5';
}

function ProfileChart({ steps, height = 52 }) {
  const parts = expandSteps(steps)
    .map((s) => ({ dur: Number(s.durationSeconds) || 0, level: stepLevel(s), fill: stepFill(s) }))
    .filter((p) => p.dur > 0);
  const total = parts.reduce((sum, p) => sum + p.dur, 0) || 1;
  const W = 600;
  const H = 80;
  let x = 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none" className="block" aria-hidden="true">
      <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="#e2e8f0" strokeWidth="1" />
      {parts.map((p, i) => {
        const w = (p.dur / total) * W;
        const bw = Math.max(0.6, w - (parts.length > 1 ? 0.8 : 0));
        const bh = Math.max(4, p.level * (H - 8));
        const rect = <rect key={i} x={x} y={H - bh} width={bw} height={bh} rx="1" fill={p.fill} />;
        x += w;
        return rect;
      })}
    </svg>
  );
}

function sessionFromPreset(preset) {
  const steps = buildPresetSteps(preset.key);
  return {
    presetKey: preset.key,
    name: preset.name,
    category: preset.cat || '',
    why: preset.desc || '',
    steps,
    seconds: stepsTotalSeconds(steps),
  };
}

export default function TrainFromTestCard({ test, isPremium, athleteId = null, onUpgrade }) {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [session, setSession] = useState(null);
  const [picked, setPicked] = useState(null);
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));
  const [planned, setPlanned] = useState([]);
  const [planTick, setPlanTick] = useState(0);

  const built = useMemo(() => {
    const anchors = resolveLtAnchorsFromTest(test);
    if (!anchors) return null;
    const prescription = prescribeFromTest({ ...anchors, sport: sportKind(test?.sport) || anchors.sport });
    if (!prescription) return null;
    const dates = prescriptionDates(new Date());
    const sessions = prescription.sessions.map((s, i) => {
      const steps = buildPresetSteps(s.presetKey);
      return { ...s, steps, date: dates[i], seconds: stepsTotalSeconds(steps) };
    });
    return { anchors, prescription, dates, sessions };
  }, [test]);

  const catalog = useMemo(() => {
    if (!built) return [];
    return PRESET_CATALOG
      .filter((p) => p.sport === built.prescription.sport)
      .map(sessionFromPreset);
  }, [built]);

  useEffect(() => {
    if (!open) return undefined;
    let cancel = false;
    const from = toLocalDateStr(cursor);
    const to = toLocalDateStr(addDays(cursor, 27));
    getPlannedWorkouts({ from, to, ...(athleteId ? { athleteId } : {}) })
      .then((rows) => { if (!cancel) setPlanned(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancel) setPlanned([]); });
    return () => { cancel = true; };
  }, [open, cursor, athleteId, planTick]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!built) return null;

  const { anchors, prescription, dates, sessions } = built;
  const imperialRun = ['imperial', 'us', 'mile', 'miles', 'mi', 'mph'].includes(
    String(test?.unitSystem ?? '').trim().toLowerCase(),
  );
  const lt1Text = fmtAnchor(anchors.lt1_value, prescription.sport, imperialRun);
  const lt2Text = fmtAnchor(anchors.lt2_value, prescription.sport, imperialRun);
  const meta = [lt1Text && `LT1 ${lt1Text}`, lt2Text && `LT2 ${lt2Text}`].filter(Boolean).join(' · ');

  const openSession = (next, date) => {
    const day = date ? new Date(date) : new Date();
    setSession(next);
    setPicked(day);
    setCursor(startOfWeek(day));
    setShowAll(false);
    setOpen(true);
  };

  const ensureTemplate = async (item, templates) => {
    const saved = (templates || []).some(
      (t) => t.name === item.name && Array.isArray(t.tags) && t.tags.includes('from-test'),
    );
    if (saved) return false;
    await createWorkoutTemplate({
      name: item.name,
      sport: prescription.sport,
      description: item.why,
      comment: 'From your lactate test. Drag it onto any day.',
      tags: [item.category, 'from-test'].filter(Boolean),
      steps: item.steps,
    });
    return true;
  };

  const addOne = async () => {
    if (!session || !picked) return;
    if (!isPremium) {
      trackFeatureUsage('testing', 'view', { action_detail: 'test_prescription_locked' });
      onUpgrade?.();
      return;
    }
    setBusy('one');
    try {
      const date = toLocalDateStr(picked);
      const [existing, templates] = await Promise.all([
        getPlannedWorkouts({ from: date, to: date, ...(athleteId ? { athleteId } : {}) }),
        getWorkoutTemplates(prescription.sport),
      ]);
      const already = (existing || []).some(
        (p) => p.title === session.name && plannedDayKey(p.date) === date,
      );
      if (!already) {
        await createPlannedWorkout({
          date,
          sport: prescription.sport,
          title: session.name,
          description: session.why,
          comment: 'Prescribed from your lactate test. Targets follow your LT1 and LT2.',
          steps: session.steps,
          plannedDuration: session.seconds,
          category: session.category,
        }, athleteId || null);
      }
      await ensureTemplate(session, templates);
      trackFeatureUsage('testing', 'create', { action_detail: 'test_prescription_one' });
      addNotification(
        already
          ? `${session.name} is already on ${dayLabel(picked)}.`
          : `Added ${session.name} to ${dayLabel(picked)}.`,
        'success',
      );
      setPlanTick((n) => n + 1);
    } catch (err) {
      if (err?.response?.status === 403) onUpgrade?.();
      else addNotification('Could not add the session. Try again in a moment.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const addWeek = async () => {
    if (!isPremium) {
      trackFeatureUsage('testing', 'view', { action_detail: 'test_prescription_locked' });
      onUpgrade?.();
      return;
    }
    setBusy('week');
    try {
      const from = toLocalDateStr(dates[0]);
      const to = toLocalDateStr(dates[dates.length - 1]);
      const [existing, templates] = await Promise.all([
        getPlannedWorkouts({ from, to, ...(athleteId ? { athleteId } : {}) }),
        getWorkoutTemplates(prescription.sport),
      ]);
      const alreadyPlanned = new Set(
        (existing || []).map((p) => `${plannedDayKey(p.date)}|${p.title}`),
      );
      let plannedAdded = 0;
      let templatesAdded = 0;
      let knownTemplates = templates || [];
      for (const item of sessions) {
        const date = toLocalDateStr(item.date);
        if (!alreadyPlanned.has(`${date}|${item.name}`)) {
          await createPlannedWorkout({
            date,
            sport: prescription.sport,
            title: item.name,
            description: item.why,
            comment: 'Prescribed from your lactate test. Targets follow your LT1 and LT2.',
            steps: item.steps,
            plannedDuration: item.seconds,
            category: item.category,
          }, athleteId || null);
          plannedAdded += 1;
        }
        if (await ensureTemplate(item, knownTemplates)) {
          templatesAdded += 1;
          knownTemplates = [...knownTemplates, { name: item.name, tags: ['from-test'] }];
        }
      }
      trackFeatureUsage('testing', 'create', { action_detail: 'test_prescription' });
      addNotification(
        plannedAdded === 0 && templatesAdded === 0
          ? 'That week already has these sessions.'
          : 'Added to your planner, and saved as templates you can reuse.',
        'success',
      );
      const q = athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : '';
      navigate(`/workout-planner${q}`, { state: { fromTest: true, focusDate: from } });
    } catch (err) {
      if (err?.response?.status === 403) onUpgrade?.();
      else addNotification('Could not add the sessions. Try again in a moment.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const byDay = new Map();
  planned.forEach((p) => {
    const key = plannedDayKey(p.date);
    if (!key) return;
    const list = byDay.get(key) || [];
    list.push(p);
    byDay.set(key, list);
  });

  const weeks = [0, 1, 2, 3].map((w) => addDays(cursor, w * 7));
  const lines = session ? stepsToLines(session.steps) : [];
  const today = new Date();
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const catOrder = Object.keys(PRESET_CATEGORY_LABELS);
  const catalogGroups = catOrder
    .map((id) => ({ id, label: PRESET_CATEGORY_LABELS[id], items: catalog.filter((s) => s.category === id) }))
    .filter((g) => g.items.length > 0);

  const modal = open ? createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label={showAll ? 'All trainings' : session?.name || 'Add training'}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-200 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
            {showAll ? 'All trainings' : session?.name}
          </h3>
          {session && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary/5"
            >
              {showAll ? 'Back to this session' : 'Show all trainings'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {showAll ? (
            <div className="space-y-4">
              {catalogGroups.map((group) => (
                <section key={group.id}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.label}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.items.map((item) => (
                      <button
                        key={item.presetKey}
                        type="button"
                        onClick={() => openSession(item, picked)}
                        className={`rounded-xl p-2.5 text-left ring-1 transition-colors ${
                          session?.presetKey === item.presetKey
                            ? 'bg-primary/5 ring-primary'
                            : 'bg-slate-50 ring-slate-200/80 hover:ring-slate-300'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[13px] font-bold text-slate-900">{item.name}</span>
                          <span className="text-[11px] tabular-nums text-slate-400">{fmtDuration(item.seconds)}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">{item.why}</p>
                        <div className="mt-2 overflow-hidden rounded-md bg-white">
                          <ProfileChart steps={item.steps} height={36} />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : session && picked && (
            <>
              <p className="text-[12.5px] leading-snug text-slate-500">{session.why}</p>
              <div className="mt-2 overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200/80">
                <ProfileChart steps={session.steps} height={88} />
              </div>
              {lines.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {lines.map((line, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-600">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: DOT[line.kind] || DOT.work }} />
                      <span className="tabular-nums">{line.text}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-900">{monthLabel}</p>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setCursor((c) => addDays(c, -7))}
                    aria-label="Previous week"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCursor((c) => addDays(c, 7))}
                    aria-label="Next week"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">{d}</div>
                ))}
              </div>
              <div className="mt-1 space-y-1">
                {weeks.map((weekStart) => (
                  <div key={toLocalDateStr(weekStart)} className="grid grid-cols-7 gap-1">
                    {[0, 1, 2, 3, 4, 5, 6].map((n) => {
                      const day = addDays(weekStart, n);
                      const key = toLocalDateStr(day);
                      const items = byDay.get(key) || [];
                      const active = isSameDay(day, picked);
                      const isToday = isSameDay(day, today);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setPicked(new Date(day))}
                          aria-pressed={active}
                          className={`flex min-h-[4.5rem] flex-col rounded-lg px-1 py-1 text-left ring-1 transition-colors ${
                            active
                              ? 'bg-primary/10 ring-primary'
                              : 'bg-white ring-slate-200/80 hover:ring-slate-300'
                          }`}
                        >
                          <span className={`text-[11px] font-bold tabular-nums ${
                            active ? 'text-primary' : isToday ? 'text-slate-900' : 'text-slate-500'
                          }`}
                          >
                            {day.getDate()}
                          </span>
                          <span className="mt-0.5 flex min-w-0 flex-col gap-0.5">
                            {items.slice(0, 2).map((p) => (
                              <span
                                key={p._id || `${key}-${p.title}`}
                                className="truncate rounded bg-slate-100 px-0.5 text-[9px] font-medium leading-tight text-slate-600"
                              >
                                {p.title}
                              </span>
                            ))}
                            {items.length > 2 && (
                              <span className="text-[9px] font-medium text-slate-400">+{items.length - 2}</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {!showAll && session && picked && (
          <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] leading-snug text-slate-500">
              {isPremium
                ? `Adds ${session.name} on ${dayLabel(picked)}, and keeps it as a template.`
                : 'Premium adds it to that day and keeps it as a template in the planner.'}
            </p>
            <button
              type="button"
              onClick={addOne}
              disabled={busy != null}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {!isPremium && <LockClosedIcon className="h-3.5 w-3.5" />}
              {busy === 'one' ? 'Adding…' : `Add to ${dayLabel(picked)}`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <TestSection
      id="train-from-test"
      icon={CalendarDaysIcon}
      tint="primary"
      title="Train from this test"
      subtitle={prescription.headline}
      meta={meta}
    >
      <p className="mb-3 text-[13px] leading-snug text-slate-600">{prescription.detail}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {sessions.map((item) => (
          <button
            key={item.presetKey}
            type="button"
            onClick={() => openSession(item, item.date)}
            className="flex flex-col rounded-xl bg-slate-50 p-3 text-left ring-1 ring-slate-200/80 transition-colors hover:ring-slate-300"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Suggested {dayLabel(item.date)}
              {item.seconds > 0 && (
                <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-300">
                  · {fmtDuration(item.seconds)}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">{item.name}</div>
            <p className="mt-1 text-[12px] leading-snug text-slate-500">{item.why}</p>
            <div className="mt-3 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200/70">
              <ProfileChart steps={item.steps} height={56} />
            </div>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => {
            setSession(null);
            setShowAll(true);
            setPicked(new Date());
            setCursor(startOfWeek(new Date()));
            setOpen(true);
          }}
          className="text-[12px] font-semibold text-primary hover:underline"
        >
          Show all trainings
        </button>
        <button
          type="button"
          onClick={addWeek}
          disabled={busy != null}
          className="text-[12px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-60"
        >
          {busy === 'week' ? 'Adding…' : 'Add all three on the suggested days'}
        </button>
      </div>
      {modal}
    </TestSection>
  );
}
