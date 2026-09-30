/**
 * The week a test is asking for.
 *
 * Each session is a real workout chart. Clicking one opens the day picker,
 * and that one session is what gets written to the calendar. Free accounts
 * can look and choose the day; saving it is the paid step. The workouts are
 * the planner's own presets, so a session added here and a template dragged
 * onto a day are the same structure, still aimed at this athlete's LT1 and LT2.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import TestSection from './TestSection';
import { resolveLtAnchorsFromTest } from './resolveLtAnchorsFromTest';
import { prescribeFromTest, prescriptionDates } from '../../utils/testWorkoutPrescription';
import { sportKind } from '../../utils/hrPowerProfile';
import { buildPresetSteps } from '../WorkoutPlanner/WorkoutBuilder';
import { stepsTotalSeconds } from '../../utils/planSessionSteps';
import { addDays, isSameDay, startOfWeek, toLocalDateStr } from '../WorkoutPlanner/plannerWeekUtils';
import { MiniWorkoutChart, fmtDuration } from '../WorkoutPlanner/WorkoutPlanModal';
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

function WorkoutChart({ steps, chartWidth, chartHeight }) {
  return (
    <div className="w-full overflow-hidden rounded-lg bg-white ring-1 ring-slate-200/80 px-1.5 py-2 [&_svg]:h-auto [&_svg]:w-full">
      <MiniWorkoutChart steps={steps} width={chartWidth} height={chartHeight} />
    </div>
  );
}

export default function TrainFromTestCard({ test, isPremium, athleteId = null, onUpgrade }) {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [busy, setBusy] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [picked, setPicked] = useState(null);
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));
  const [lastAdded, setLastAdded] = useState(null);

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

  if (!built) return null;

  const { anchors, prescription, dates, sessions } = built;
  const imperialRun = ['imperial', 'us', 'mile', 'miles', 'mi', 'mph'].includes(
    String(test?.unitSystem ?? '').trim().toLowerCase(),
  );
  const lt1Text = fmtAnchor(anchors.lt1_value, prescription.sport, imperialRun);
  const lt2Text = fmtAnchor(anchors.lt2_value, prescription.sport, imperialRun);
  const meta = [lt1Text && `LT1 ${lt1Text}`, lt2Text && `LT2 ${lt2Text}`].filter(Boolean).join(' · ');

  const selected = sessions.find((s) => s.presetKey === selectedKey) || null;
  const lines = selected ? stepsToLines(selected.steps) : [];
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(cursor, n));
  const today = new Date();

  const choose = (session) => {
    setSelectedKey(session.presetKey);
    setPicked(new Date(session.date));
    setCursor(startOfWeek(session.date));
  };

  const ensureTemplate = async (session, templates) => {
    const saved = (templates || []).some(
      (t) => t.name === session.name && Array.isArray(t.tags) && t.tags.includes('from-test'),
    );
    if (saved) return false;
    await createWorkoutTemplate({
      name: session.name,
      sport: prescription.sport,
      description: session.why,
      comment: 'From your lactate test. Drag it onto any day.',
      tags: [session.category, 'from-test'],
      steps: session.steps,
    });
    return true;
  };

  const addOne = async () => {
    if (!selected || !picked) return;
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
        (p) => p.title === selected.name && plannedDayKey(p.date) === date,
      );
      if (!already) {
        await createPlannedWorkout({
          date,
          sport: prescription.sport,
          title: selected.name,
          description: selected.why,
          comment: 'Prescribed from your lactate test. Targets follow your LT1 and LT2.',
          steps: selected.steps,
          plannedDuration: selected.seconds,
          category: selected.category,
        }, athleteId || null);
      }
      await ensureTemplate(selected, templates);
      trackFeatureUsage('testing', 'create', { action_detail: 'test_prescription_one' });
      addNotification(
        already
          ? `${selected.name} is already on ${dayLabel(picked)}.`
          : `Added ${selected.name} to ${dayLabel(picked)}.`,
        'success',
      );
      setLastAdded({ name: selected.name, date, label: dayLabel(picked) });
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
      for (const session of sessions) {
        const date = toLocalDateStr(session.date);
        if (!alreadyPlanned.has(`${date}|${session.name}`)) {
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
          plannedAdded += 1;
        }
        if (await ensureTemplate(session, knownTemplates)) {
          templatesAdded += 1;
          knownTemplates = [...knownTemplates, { name: session.name, tags: ['from-test'] }];
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

  const openPlanner = () => {
    const q = athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : '';
    navigate(`/workout-planner${q}`, {
      state: { fromTest: true, focusDate: lastAdded?.date },
    });
  };

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
        {sessions.map((session) => {
          const on = selectedKey === session.presetKey;
          return (
            <button
              key={session.presetKey}
              type="button"
              onClick={() => choose(session)}
              aria-pressed={on}
              className={`flex flex-col rounded-xl p-3 text-left ring-1 transition-colors ${
                on
                  ? 'bg-primary/5 ring-primary'
                  : 'bg-slate-50 ring-slate-200/80 hover:ring-slate-300'
              }`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Suggested {dayLabel(session.date)}
                {session.seconds > 0 && (
                  <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-300">
                    · {fmtDuration(session.seconds)}
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm font-bold text-slate-900">{session.name}</div>
              <p className="mt-1 text-[12px] leading-snug text-slate-500">{session.why}</p>
              <div className="mt-3">
                <WorkoutChart steps={session.steps} chartWidth={360} chartHeight={140} />
              </div>
            </button>
          );
        })}
      </div>

      {selected && picked ? (
        <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900">{selected.name}</h4>
            <span className="text-[11px] tabular-nums text-slate-400">{fmtDuration(selected.seconds)}</span>
          </div>
          <div className="mt-2">
            <WorkoutChart steps={selected.steps} chartWidth={720} chartHeight={180} />
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

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Add on</p>
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
          <div className="mt-1 grid grid-cols-7 gap-1">
            {weekDays.map((day) => {
              const active = isSameDay(day, picked);
              const isToday = isSameDay(day, today);
              const suggested = isSameDay(day, selected.date);
              return (
                <button
                  key={toLocalDateStr(day)}
                  type="button"
                  onClick={() => setPicked(new Date(day))}
                  aria-pressed={active}
                  className={`flex flex-col items-center rounded-lg px-1 py-1.5 text-center ring-1 transition-colors ${
                    active
                      ? 'bg-primary text-white ring-primary'
                      : 'bg-slate-50 text-slate-700 ring-slate-200/80 hover:ring-slate-300'
                  }`}
                >
                  <span className={`text-[10px] font-semibold uppercase ${active ? 'text-white/80' : 'text-slate-400'}`}>
                    {day.toLocaleDateString(undefined, { weekday: 'narrow' })}
                  </span>
                  <span className="text-sm font-bold tabular-nums">{day.getDate()}</span>
                  <span className={`mt-0.5 h-1 w-1 rounded-full ${
                    suggested ? (active ? 'bg-white' : 'bg-primary') : isToday && !active ? 'bg-slate-300' : 'bg-transparent'
                  }`} />
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] leading-snug text-slate-500">
              {isPremium
                ? `Adds ${selected.name} on ${dayLabel(picked)}, and keeps it as a template.`
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
          {lastAdded && (
            <button
              type="button"
              onClick={openPlanner}
              className="mt-2 text-[12px] font-semibold text-primary hover:underline"
            >
              {lastAdded.name} is on {lastAdded.label}. Open the planner
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-slate-400">Click a session to choose the day it goes on.</p>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={addWeek}
          disabled={busy != null}
          className="text-[12px] font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-60"
        >
          {busy === 'week' ? 'Adding…' : 'Add all three on the suggested days'}
        </button>
      </div>
    </TestSection>
  );
}
