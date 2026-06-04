/**
 * watchWorkoutSync.js — receives WorkoutSummary payloads from the
 * LaChart Apple Watch app via the LaChartWatchSync Capacitor plugin, then
 * POSTs them to the LaChart backend so they show up in the training log
 * with full lap detail + CORE/Stryd graphs.
 *
 * Architecture:
 *   Watch (Swift) ──WCSession──> iPhone (LaChartWatchSyncPlugin.swift)
 *                                       │
 *                                       │  notifyListeners('watchWorkoutReceived', payload)
 *                                       ▼
 *                          watchWorkoutSync.js (this file)
 *                                       │
 *                                       │  POST /training/from-watch
 *                                       ▼
 *                                Mongo (Training collection)
 *                                       │
 *                                       │  GET /api/user/athlete/<id>/trainings
 *                                       ▼
 *                          React: TrainingPage / Calendar / Dashboard
 *
 * The plugin buffers messages that arrive before this listener is wired
 * up (cold-start by watch transfer). We call `flushPending()` right after
 * attaching the listener to replay them.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import api from '../services/api';

const LaChartWatchSync = registerPlugin('LaChartWatchSync');

let isWired = false;
let listenerHandle = null;

/**
 * Wire up the watch sync listener. Safe to call multiple times — only
 * the first call registers the listener. iPhone-native (Capacitor) only;
 * web build no-ops.
 */
export async function initWatchWorkoutSync() {
  if (isWired) return;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return;
  if (!Capacitor.isPluginAvailable('LaChartWatchSync')) {
    console.warn('[watchSync] LaChartWatchSync plugin not registered — add Plugin .swift + .m to App target Compile Sources');
    return;
  }

  try {
    listenerHandle = await LaChartWatchSync.addListener(
      'watchWorkoutReceived',
      (payload) => { void handleWorkoutPayload(payload); }
    );
    isWired = true;
    console.log('[watchSync] listener wired');

    // Drain anything the plugin buffered before we got here.
    try {
      const flushed = await LaChartWatchSync.flushPending();
      if (flushed?.flushed > 0) {
        console.log('[watchSync] flushed', flushed.flushed, 'pending workouts');
      }
    } catch (e) {
      console.warn('[watchSync] flushPending failed:', e?.message || e);
    }
  } catch (e) {
    console.warn('[watchSync] addListener failed:', e?.message || e);
  }
}

export async function teardownWatchWorkoutSync() {
  try { await listenerHandle?.remove?.(); } catch {}
  listenerHandle = null;
  isWired = false;
}

/**
 * Map the watch's WorkoutSummary shape to the backend's Training shape
 * and POST it. The backend dedup endpoint accepts repeated submissions
 * (matched by sourceWatchActivityId) so a flaky WCSession that re-sends
 * doesn't create duplicate trainings.
 */
async function handleWorkoutPayload(payload) {
  if (!payload || typeof payload !== 'object') return;
  console.log('[watchSync] received workoutSummary keys:', Object.keys(payload));

  try {
    // The watch sends `{ type: 'workoutSummary', payload: { …summary } }`
    // via WCSession. Tolerate both `payload.payload` (the canonical wire
    // shape) and a flat envelope in case the bridge ever sends the summary
    // at the top level (e.g. retry/fallback path).
    const s = (payload.payload && typeof payload.payload === 'object')
      ? payload.payload
      : (payload.summary && typeof payload.summary === 'object' ? payload.summary : payload);

    const body = {
      title:         s.title || 'Watch workout',
      sport:         normaliseSport(s.sport),
      date:          s.date || new Date().toISOString(),
      duration:      Number(s.duration) || 0,           // seconds
      distance:      Number(s.distance) || 0,           // metres
      avgHR:         Number(s.avgHR) || 0,
      maxHR:         Number(s.maxHR) || 0,
      avgPower:      Number(s.avgPower) || 0,
      calories:      Number(s.calories) || 0,
      elevation:     Number(s.elevation) || 0,
      avgPace:       Number(s.avgPace) || 0,
      // Distribution Z1..Z5 as fractions 0..1
      zoneDistribution: s.zoneDistribution && typeof s.zoneDistribution === 'object'
        ? s.zoneDistribution
        : {},
      // Per-lap rows — include the sensor averages the watch
      // computed at markLap() time so the iPhone detail page can show
      // them without rescanning the time-series.
      laps: Array.isArray(s.laps) ? s.laps.map((l) => ({
        number:      Number(l.number)      || 0,
        pace:        Number(l.pace)        || 0,
        time:        Number(l.time)        || 0,
        zoneId:      Number(l.zoneId)      || 0,
        avgHR:       Number(l.avgHR)       || 0,
        avgPower:    Number(l.avgPower)    || 0,
        avgCadence:  Number(l.avgCadence)  || 0,
        avgCoreTemp: Number(l.avgCoreTemp) || 0,
        peakHSI:     Number(l.peakHSI)     || 0,
        distance:    Number(l.distance)    || 0,
      })) : [],
      // Manual lactate readings if the user logged any during the run
      lactateReadings: Array.isArray(s.lactateReadings) ? s.lactateReadings.map((r) => ({
        timestamp: r.timestamp,
        mmol:      Number(r.mmol) || 0,
        hr:        Number(r.hr)   || 0,
        pace:      Number(r.pace) || 0,
      })) : [],
      aiInsight: s.aiInsight || null,

      // Advanced CORE / Stryd time-series — backend stores these for the
      // detail-page graphs. May be empty arrays on watches without the
      // matching sensor paired.
      coreTempSeries: Array.isArray(s.coreTempSeries) ? s.coreTempSeries.map((p) => ({
        t:    Number(p.t)    || 0,
        core: Number(p.core) || 0,
        skin: Number(p.skin) || 0,
        hsi:  Number(p.hsi)  || 0,
      })) : [],
      strydSeries: Array.isArray(s.strydSeries) ? s.strydSeries.map((p) => ({
        t:       Number(p.t)       || 0,
        power:   Number(p.power)   || 0,
        cadence: Number(p.cadence) || 0,
        gct:     Number(p.gct)     || 0,
        vosc:    Number(p.vosc)    || 0,
        lss:     Number(p.lss)     || 0,
      })) : [],
      hsiPeak: Number(s.hsiPeak) || 0,

      // Idempotency key — backend uses this to dedup if Watch re-sends.
      sourceWatchActivityId: String(s.watchActivityId || s.id || `watch-${Date.now()}`),
    };

    const resp = await api.post('/training/from-watch', body);
    console.log('[watchSync] saved training, id=', resp?.data?._id || resp?.data?.id);

    // Notify the UI so calendar/training list refresh themselves without
    // waiting for the user to navigate away and back.
    try {
      window.dispatchEvent(new CustomEvent('watchWorkoutSaved', {
        detail: { training: resp?.data || null },
      }));
    } catch {}
  } catch (e) {
    console.error('[watchSync] failed to POST workout:', e?.response?.data || e?.message || e);
  }
}

/** Normalise the watch's sport label to LaChart's canonical lowercase set. */
function normaliseSport(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('swim'))    return 'swim';
  if (s.includes('run') || s.includes('běh') || s.includes('beh')) return 'run';
  if (s.includes('bike') || s.includes('cycl') || s.includes('ride')) return 'bike';
  if (s.includes('strength') || s.includes('weight') || s.includes('gym')) return 'strength';
  if (s.includes('walk') || s.includes('hike')) return 'walk';
  return 'other';
}

export async function isWatchPaired() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return { paired: false, installed: false, reachable: false };
  }
  if (!Capacitor.isPluginAvailable('LaChartWatchSync')) {
    return { paired: false, installed: false, reachable: false };
  }
  try {
    return await LaChartWatchSync.isWatchPaired();
  } catch {
    return { paired: false, installed: false, reachable: false };
  }
}
