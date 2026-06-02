/**
 * widgetCache.js — pushes form/fitness + today's workouts into the iOS App
 * Group cache so the LaChart home-screen widget renders the same data the
 * user sees in the app. Web / Android no-op gracefully.
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
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    await LaChartShared.setFormFitness({
      fitness:   Math.round(Number(metrics.fitness)   || 0),
      fatigue:   Math.round(Number(metrics.fatigue)   || 0),
      form:      Math.round(Number(metrics.form)      || 0),
      formDelta: Math.round(Number(metrics.formDelta) || 0),
      sparkline: Array.isArray(metrics.sparkline)
        ? metrics.sparkline.map(v => Math.round(Number(v) || 0)).slice(-14)
        : [],
      todayCompleted: sanitiseWorkouts(metrics.todayCompleted),
      todayPlanned:   sanitiseWorkouts(metrics.todayPlanned),
    });
  } catch (e) {
    console.warn('[widgetCache] writeFormFitness failed:', e?.message || e);
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
  try { await LaChartShared.reloadWidgets(); }
  catch (_) { /* ignore */ }
}
