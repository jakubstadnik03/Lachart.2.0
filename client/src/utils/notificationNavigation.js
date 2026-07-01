/**
 * Shared routing for in-app notifications and push tap deep links.
 */
import { normalizeNotificationActivityId } from './activityEventPatches';

function encodePath(path) {
  if (!path || path === '/') return '/';
  if (path.startsWith('http')) return path;
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Resolve navigation target from notification document or push payload.
 * @returns {{ path: string, isExternal?: boolean }}
 */
export function resolveNotificationTarget(input = {}) {
  const type = String(input.type || '').toLowerCase();
  const rt = String(input.resourceType || input.resource_type || '').toLowerCase();
  const rid = input.resourceId || input.resource_id;
  const data = input.pushData || input;

  const openRaceFeedback = data.openRaceFeedback || data.open_race_feedback;
  const openPlanned = data.openPlanned || data.open_planned || data.plannedWorkoutId;
  const openRace = data.openRace || data.open_race || data.raceId;
  const screen = data.screen;

  if (openRaceFeedback || type === 'race_post') {
    const id = openRaceFeedback || rid;
    return { path: id ? `/dashboard?openRaceFeedback=${encodeURIComponent(id)}` : '/dashboard' };
  }

  if (openRace || (rt === 'race' && rid)) {
    const id = openRace || rid;
    return { path: `/dashboard?openRace=${encodeURIComponent(id)}` };
  }

  if (openPlanned ||
    type === 'coach_plan_changed' ||
    type === 'coach_plan_added' ||
    rt === 'planned'
  ) {
    const id = openPlanned || rid;
    return { path: id ? `/dashboard?openPlanned=${encodeURIComponent(id)}` : '/dashboard' };
  }

  const openActivity = data.openActivity || data.open_activity;
  if (openActivity) {
    return { path: `/dashboard?openActivity=${encodeURIComponent(openActivity)}` };
  }

  if (
    type === 'weekly_digest' ||
    type === 'weekly_review_request' ||
    rt === 'dashboard' ||
    screen === 'dashboard'
  ) {
    return { path: '/dashboard' };
  }

  const trainingId = data.trainingId || data.training_id;
  const trainingType = data.trainingType || data.training_type;
  if (trainingId && trainingType) {
    const prefix = trainingType === 'strava' ? 'strava' : trainingType === 'fit' ? 'fit' : 'regular';
    return { path: `/dashboard?openActivity=${encodeURIComponent(`${prefix}-${trainingId}`)}` };
  }

  const activityId = data.activityId || data.activity_id;
  const activityType = data.activityType || data.activity_type;
  if (activityId) {
    const prefix = activityType || (type === 'garmin_import' ? 'garmin' : type === 'strava_import' ? 'strava' : null);
    if (prefix) {
      return { path: `/dashboard?openActivity=${encodeURIComponent(`${prefix}-${activityId}`)}` };
    }
  }

  if (type === 'strava_import' && (activityId || rid)) {
    const id = activityId || rid;
    return { path: `/dashboard?openActivity=${encodeURIComponent(`strava-${id}`)}` };
  }

  const target = normalizeNotificationActivityId(rt, rid);
  if (target) {
    return { path: `/dashboard?openActivity=${encodeURIComponent(target)}` };
  }

  if (rid && rt === 'training') {
    return { path: `/training-calendar/training-${rid}` };
  }

  if (rid) {
    return { path: `/training-calendar/${encodeURIComponent(rid)}` };
  }

  return { path: '/dashboard' };
}

/** Navigate using react-router navigate fn or full page replace (Capacitor). */
export function applyNotificationNavigation(target, { navigate, replace = false } = {}) {
  const path = encodePath(target?.path || '/');
  if (navigate && !replace) {
    navigate(path);
    return;
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  window.location.replace(`${origin}${path}`);
}
