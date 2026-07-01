/**
 * widgetCache.js — pushes form/fitness + today's workouts into the iOS App
 * Group cache so the LaChart home-screen widget renders the same data the
 * user sees in the app. Web / Android no-op gracefully.
 *
 * Loud-by-default logging: every call prints what was sent, what came back
 * (`{ok:true, bytes}` from the Swift plugin), AND any failure with the
 * Capacitor error code. When the widget shows "Open LaChart to sync"
 * forever despite the app being open, Safari → Develop → iPhone → console
 * is the ground truth — these logs tell you immediately whether:
 *   • the plugin call never ran      → `[widgetCache] skipped: ...`
 *   • the plugin isn't registered    → "not implemented" error
 *   • the App Group isn't configured → "App Group … not configured" reject
 *   • the call succeeded             → `[widgetCache] wrote N bytes`
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { getTodayMetrics, getFormFitnessData, getRaceEvents } from '../services/api';

// Single shared plugin proxy — re-exported so other modules don't call
// registerPlugin('LaChartShared') again (Capacitor warns "registered twice").
export const LaChartShared = registerPlugin('LaChartShared');

/**
 * @param {{
 *   fitness: number,
 *   fatigue: number,
 *   form: number,
 *   formDelta?: number,
 *   sparkline?: number[],
 *   todayCompleted?: Array<{ title, sport?, durationSec?, category?, subtitle? }>,
 *   todayPlanned?:   Array<{ title, sport?, durationSec?, category?, subtitle? }>,
 * }} metrics
 */
export async function writeFormFitnessToWidget(metrics) {
  const platform = Capacitor.getPlatform();
  if (platform !== 'ios') {
    console.debug('[widgetCache] skipped: platform =', platform);
    return;
  }
  if (!Capacitor.isPluginAvailable('LaChartShared')) {
    console.error(
      '[widgetCache] LaChartShared plugin NOT available in this build. ' +
      'Check Xcode → App target → Build Phases → Compile Sources includes ' +
      'LaChartSharedPlugin.swift AND LaChartSharedPlugin.m, then rebuild.'
    );
    return;
  }
  const payload = {
    fitness:   Math.round(Number(metrics.fitness)   || 0),
    fatigue:   Math.round(Number(metrics.fatigue)   || 0),
    form:      Math.round(Number(metrics.form)      || 0),
    formDelta: Math.round(Number(metrics.formDelta) || 0),
    sparkline: Array.isArray(metrics.sparkline)
      ? metrics.sparkline.map(v => Math.round(Number(v) || 0)).slice(-14)
      : [],
    todayCompleted:  sanitiseWorkouts(metrics.todayCompleted),
    todayPlanned:    sanitiseWorkouts(metrics.todayPlanned),
    tomorrowPlanned: sanitiseWorkouts(metrics.tomorrowPlanned),
    raceDaysUntil: metrics.raceDaysUntil != null ? Math.round(Number(metrics.raceDaysUntil)) : null,
    raceName: metrics.raceName ? String(metrics.raceName).slice(0, 40) : null,
  };
  console.log('[widgetCache] writing →', {
    fitness: payload.fitness,
    fatigue: payload.fatigue,
    form:    payload.form,
    completed: payload.todayCompleted.length,
    planned:   payload.todayPlanned.length,
  });
  try {
    const res = await LaChartShared.setFormFitness(payload);
    console.log('[widgetCache] OK — wrote', res?.bytes, 'bytes; widget will reload');
  } catch (e) {
    // Capacitor wraps native rejects as { message, code, errorMessage }.
    console.error(
      '[widgetCache] setFormFitness FAILED:',
      e?.message || e?.errorMessage || e,
      e?.code ? `(code: ${e.code})` : ''
    );
  }
}

function sanitiseWorkouts(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 4).map(w => ({
    title:       String(w?.title || 'Workout').slice(0, 48),
    sport:       w?.sport       ? String(w.sport)       : null,
    category:    w?.category    ? String(w.category)    : null,
    subtitle:    w?.subtitle    ? String(w.subtitle).slice(0, 64) : null,
    durationSec: Number.isFinite(Number(w?.durationSec)) ? Math.round(Number(w.durationSec)) : null,
    // Deep-link target id (prefixed activity id / planned id) — lets the
    // widget open this specific training when tapped.
    id:          w?.id != null ? String(w.id) : null,
    // Whether this session was part of the calendar plan (drives the ✓).
    planned:     w?.planned === true,
  }));
}

/**
 * Insurance writer — fetches the form/fitness numbers straight from the API and
 * pushes them to the widget WITHOUT needing the dashboard to be mounted.
 *
 * The dashboard still writes the full payload (incl. today's done/planned
 * workout lists) whenever the Home tab is open; this lighter writer guarantees
 * the widget shows *something* current even if the user never opens Home —
 * called on app launch and after a Strava sync from the always-mounted shell.
 */
export async function syncWidgetFromApi(athleteId) {
  if (Capacitor.getPlatform() !== 'ios' || !athleteId) return;
  try {
    const [todayRes, sparkRes, raceRes] = await Promise.all([
      getTodayMetrics(athleteId).catch(() => ({ data: {} })),
      getFormFitnessData(athleteId, 90, 'all').catch(() => ({ data: [] })),
      getRaceEvents(athleteId, { from: new Date(new Date().setHours(0, 0, 0, 0)).toISOString() }).catch(() => ({ data: [] })),
    ]);
    const tm = todayRes?.data || {};
    if (tm.fitness == null && tm.fatigue == null && tm.form == null) return;
    const raw = Array.isArray(sparkRes?.data) ? sparkRes.data : (sparkRes?.data?.data || []);
    const sparkline = raw.slice(-14).map(d => Number(d?.Form ?? d?.form ?? d?.tsb ?? 0));
    const nextRace = Array.isArray(raceRes?.data) && raceRes.data[0] ? raceRes.data[0] : null;
    let raceDaysUntil = null;
    if (nextRace?.date) {
      const d = new Date(nextRace.date);
      const t = new Date();
      d.setHours(0, 0, 0, 0);
      t.setHours(0, 0, 0, 0);
      raceDaysUntil = Math.max(0, Math.round((d - t) / 86400000));
    }
    await writeFormFitnessToWidget({
      fitness:   tm.fitness,
      fatigue:   tm.fatigue,
      form:      tm.form,
      formDelta: tm.formChange,
      sparkline,
      raceDaysUntil,
      raceName: nextRace?.name || null,
      // Workout lists are filled by the dashboard's richer write; keep empty
      // here so this insurance path stays cheap (no calendar/plan fetch).
      todayCompleted: [],
      todayPlanned:   [],
    });
  } catch (e) {
    console.warn('[widgetCache] syncWidgetFromApi failed:', e?.message || e);
  }
}

export async function reloadWidgets() {
  if (Capacitor.getPlatform() !== 'ios') return;
  if (!Capacitor.isPluginAvailable('LaChartShared')) return;
  try {
    await LaChartShared.reloadWidgets();
    console.log('[widgetCache] reloadWidgets OK');
  } catch (e) {
    console.warn('[widgetCache] reloadWidgets failed:', e?.message || e);
  }
}
