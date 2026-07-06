/** Open the global Training Zones modal (Layout or native dashboard listens). */
export const OPEN_TRAINING_ZONES_MODAL_EVENT = 'openTrainingZonesModal';

const PROMPT_KEY = (userId) => `zonesDashboardPromptDismissed_${userId}`;
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** True when the user has no saved power or heart-rate zones for TSS. */
export function profileNeedsTrainingZones(profile) {
  if (!profile) return false;
  const cz = profile.powerZones?.cycling || {};
  const rz = profile.powerZones?.running || {};
  const sz = profile.powerZones?.swimming || {};
  const hz = profile.heartRateZones || {};

  const hasPower = !!(
    cz.lt1 || cz.lt2 || cz.ftp || cz.zone4?.min || profile.ftp
  );
  const hasRunPace = !!(
    rz.lt1 || rz.lt2 || rz.zone4?.min || profile.thresholdPace
  );
  const hasSwimPace = !!(sz.lt1 || sz.lt2 || sz.zone4?.min);
  const hasHr = ['cycling', 'running', 'swimming'].some((key) => {
    const z = hz[key];
    return !!(z?.lt2 || z?.lt2Hr || z?.maxHeartRate || z?.zone4?.max);
  }) || !!(profile.maxHr || profile.maxHeartRate);

  return !(hasPower || hasRunPace || hasSwimPace || hasHr);
}

export function shouldShowZonesDashboardPrompt(userId) {
  if (!userId) return false;
  try {
    const ts = localStorage.getItem(PROMPT_KEY(userId));
    if (!ts) return true;
    const age = Date.now() - parseInt(ts, 10);
    return Number.isNaN(age) || age > PROMPT_COOLDOWN_MS;
  } catch {
    return true;
  }
}

export function markZonesDashboardPromptDismissed(userId) {
  if (!userId) return;
  try {
    localStorage.setItem(PROMPT_KEY(userId), String(Date.now()));
  } catch { /* ignore */ }
}

export function requestTrainingZonesModal(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_TRAINING_ZONES_MODAL_EVENT, { detail }));
}

/**
 * Prompt once per cooldown when dashboard has workouts but no zones.
 * @returns {boolean} whether a prompt was scheduled
 */
export function maybePromptTrainingZonesSetup(user, activities, { force = false } = {}) {
  if (!user?._id || !Array.isArray(activities) || !activities.length) return false;
  if (!profileNeedsTrainingZones(user)) return false;
  if (!force && !shouldShowZonesDashboardPrompt(user._id)) return false;

  requestTrainingZonesModal({ source: 'dashboard', force });
  if (!force) markZonesDashboardPromptDismissed(user._id);
  return true;
}
