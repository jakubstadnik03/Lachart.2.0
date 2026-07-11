/**
 * Helpers for activityTitleUpdated / activityMetricsUpdated window events.
 * Keeps calendar lists, dashboard totals and modal state in sync after edits.
 */

/** Build `openActivity` deep-link id from a stored notification resource. */
export function normalizeNotificationActivityId(resourceType, resourceId) {
  if (!resourceId) return null;
  const rid = String(resourceId).trim();
  const rt = String(resourceType || '').toLowerCase();
  if (rt === 'strava' || rt === 'strava_import') {
    return rid.startsWith('strava-') ? rid : `strava-${rid.replace(/^strava-/, '')}`;
  }
  if (rt === 'fit') {
    return rid.startsWith('fit-') ? rid : `fit-${rid}`;
  }
  if (rt === 'training' || rt === 'regular') {
    return rid.startsWith('regular-') || rid.startsWith('training-')
      ? rid
      : `regular-${rid}`;
  }
  return rid;
}

/** Dispatch event consumed by NativeDashboardPage to open an activity modal. */
export function requestOpenActivity(activityId) {
  if (!activityId) return;
  try {
    window.dispatchEvent(new CustomEvent('openActivityRequest', { detail: { id: String(activityId) } }));
  } catch { /* ignore */ }
}

/** Stable app-level id used in calendar lists and save/event routing. */
export function getActivityAppId(activity) {
  if (!activity) return '';
  const rawId = String(activity.id || '');
  if (/^(strava|fit|regular|garmin|apple)-/i.test(rawId)) return rawId;
  if (activity.stravaId != null) return `strava-${activity.stravaId}`;
  if (activity.garminId != null) return `garmin-${activity.garminId}`;
  if (activity.healthKitId != null) return `apple-${activity.healthKitId}`;
  if (activity.type === 'fit' && activity._id) return `fit-${activity._id}`;
  if (activity.type === 'regular' && activity._id) return `regular-${activity._id}`;
  if (activity._id) return String(activity._id);
  return rawId;
}

/** Resolve nutritional calories (kcal) from stored or Strava-derived activity fields. */
export function resolveActivityCaloriesKcal(activity) {
  if (!activity || typeof activity !== 'object') return 0;

  const explicit = Number(activity.calories ?? activity.totalCalories ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);

  const kj = Number(
    activity.kilojoules
    ?? activity.workout_kilojoules
    ?? activity.work_kilojoules
    ?? activity.work
    ?? activity.raw?.kilojoules
    ?? 0,
  );
  if (Number.isFinite(kj) && kj > 0) return Math.round(kj / 4.184);

  const power = Number(
    activity.avgPower
    ?? activity.averagePower
    ?? activity.average_watts
    ?? activity.averageWatts
    ?? 0,
  );
  const dur = Number(
    activity.movingTime
    ?? activity.moving_time
    ?? activity.duration
    ?? activity.elapsed_time
    ?? activity.totalElapsedTime
    ?? activity.elapsedTime
    ?? 0,
  );
  if (power > 0 && dur > 0) return Math.round((power * dur) / 4184);

  return 0;
}

/** Decide which backend update endpoint to hit for an activity snapshot. */
export function resolveActivitySaveKind(activity) {
  const appId = getActivityAppId(activity);
  if (
    activity?.stravaId != null
    || activity?.source === 'strava'
    || activity?.type === 'strava'
    || appId.startsWith('strava-')
  ) {
    return {
      kind: 'strava',
      externalId: String(activity.stravaId ?? appId.replace(/^strava-/i, '')),
    };
  }
  if (
    activity?.garminId != null
    || activity?.source === 'garmin'
    || appId.startsWith('garmin-')
  ) {
    return {
      kind: 'garmin',
      externalId: String(activity.garminId ?? appId.replace(/^garmin-/i, '')),
    };
  }
  if (
    activity?.source === 'fit'
    || activity?.type === 'fit'
    || appId.startsWith('fit-')
  ) {
    return {
      kind: 'fit',
      externalId: String(activity._id ?? appId.replace(/^fit-/i, '')),
    };
  }
  if (activity?.type === 'regular' || appId.startsWith('regular-')) {
    return {
      kind: 'regular',
      externalId: String(activity._id ?? appId.replace(/^regular-/i, '')),
    };
  }
  if (activity?._id) return { kind: 'regular', externalId: String(activity._id) };
  return { kind: null, externalId: null };
}

export function buildActivityMatcher(id) {
  const rawId = String(id || '').replace(/^(strava-|fit-|regular-|training-)/, '');
  const fullId = String(id || '');
  return (t) => {
    if (!t) return false;
    return String(t._id) === rawId
      || String(t.id) === rawId
      || String(t.id) === fullId
      || String(t.stravaId) === rawId
      || (t.stravaId != null && `strava-${t.stravaId}` === fullId)
      || (t.garminId != null && `garmin-${t.garminId}` === fullId)
      || (t._id != null && `fit-${t._id}` === fullId)
      || (t._id != null && `regular-${t._id}` === fullId)
      || (t._id != null && `training-${t._id}` === fullId);
  };
}

  /** Build a patch object for in-memory activity lists from a save payload. */
export function metricsPatchFromDetail(detail = {}) {
  if (!detail || typeof detail !== 'object') return {};

  const patch = {};

  if (detail.title) {
    patch.title = detail.title;
    patch.titleManual = detail.title;
  }
  if (detail.description !== undefined) patch.description = detail.description;

  const secs = detail.movingTime ?? detail.duration ?? null;
  if (secs != null && Number.isFinite(Number(secs))) {
    const s = Math.round(Number(secs));
    patch.movingTime = s;
    patch.moving_time = s;
    patch.duration = s;
    patch.elapsedTime = s;
    patch.elapsed_time = s;
    patch.totalElapsedTime = s;
    patch.totalTimerTime = s;
    patch.totalTime = s;
    patch.metricsManualized = true;
  }

  if (detail.distance != null && Number.isFinite(Number(detail.distance))) {
    const m = Math.round(Number(detail.distance));
    patch.distance = m;
    patch.totalDistance = m;
    patch.metricsManualized = true;
  }

  if (detail.tss != null && Number.isFinite(Number(detail.tss))) {
    const t = Math.round(Number(detail.tss));
    patch.tss = t;
    patch.trainingStressScore = t;
    // Only stamp manualTss when the workout is in manual mode — power/hr TSS
    // is recomputed client-side from duration + zones and must not stick as manual.
    if (detail.tssDisplayMode === 'manual' || detail.manualTss != null) {
      patch.manualTss = t;
      patch.metricsManualized = true;
    }
  }

  if (detail.calories != null && Number.isFinite(Number(detail.calories))) {
    patch.calories = Math.round(Number(detail.calories));
    patch.totalCalories = Math.round(Number(detail.calories));
  }

  if (detail.rpe != null) patch.rpe = Number(detail.rpe) || 0;
  if (detail.lactate != null) patch.lactate = Number(detail.lactate) || 0;

  if (detail.tssDisplayMode) patch.tssDisplayMode = detail.tssDisplayMode;
  if (detail.metricsManualized === true) patch.metricsManualized = true;

  return patch;
}

/** Merge a saved planned workout into an in-memory list (update or append). */
export function upsertPlannedWorkoutList(prev, saved) {
  if (!saved?._id) return prev;
  const list = Array.isArray(prev) ? prev : [];
  const idx = list.findIndex((p) => String(p._id) === String(saved._id));
  if (idx >= 0) {
    const next = [...list];
    next[idx] = saved;
    return next;
  }
  return [...list, saved];
}

/** Remove a planned workout from an in-memory list by id. */
export function removePlannedWorkoutFromList(prev, id) {
  if (!id) return prev;
  const list = Array.isArray(prev) ? prev : [];
  return list.filter((p) => String(p._id) !== String(id));
}

export function notifyPlannedWorkoutUpdated(planned) {
  if (!planned?._id) return;
  try {
    window.dispatchEvent(new CustomEvent('plannedWorkoutUpdated', { detail: { planned } }));
  } catch { /* ignore */ }
}

export function notifyPlannedWorkoutDeleted(id) {
  if (!id) return;
  try {
    window.dispatchEvent(new CustomEvent('plannedWorkoutDeleted', { detail: { id: String(id) } }));
  } catch { /* ignore */ }
}

export function patchCalendarCache(matches, patch) {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || (!key.startsWith('athleteTrainings_v3_') && !key.startsWith('calendarData_'))) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) continue;
        let changed = false;
        const next = data.map((t) => {
          if (!matches(t)) return t;
          changed = true;
          return { ...t, ...patch };
        });
        if (changed) localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // corrupt entry
      }
    }
  } catch {
    // private mode
  }
}
