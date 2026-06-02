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

const LaChartShared = registerPlugin('LaChartShared');

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
    todayCompleted: sanitiseWorkouts(metrics.todayCompleted),
    todayPlanned:   sanitiseWorkouts(metrics.todayPlanned),
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
  }));
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
