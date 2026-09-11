/** Open the global Training Zones modal (Layout or native dashboard listens). */
export const OPEN_TRAINING_ZONES_MODAL_EVENT = 'openTrainingZonesModal';

/** Fired after a coach saves an athlete's zones: `{ athleteId, profile }`. */
export const ATHLETE_PROFILE_UPDATED_EVENT = 'athleteProfileUpdated';

const COACH_ROLES = ['coach', 'tester', 'testing', 'admin'];
export const isCoachLikeUser = (user) => !!user && (COACH_ROLES.includes(String(user.role || '').toLowerCase()) || user.admin === true);

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

/*
 * A coach on an athlete's profile.
 *
 * The zones modal used to be the athlete's alone: a coach opening a new
 * athlete saw a profile with "No thresholds set" three times over and had to
 * find the editor themselves. Now the same modal opens for the coach, on the
 * athlete's behalf, once per app session per athlete — and saves through the
 * coach endpoint, never through the coach's own profile.
 */
const ATHLETE_PROMPT_KEY = (athleteId) => `zonesPromptDismissed_${athleteId}`;

export function athleteZonesPromptDismissedThisSession(athleteId) {
  try { return !!athleteId && sessionStorage.getItem(ATHLETE_PROMPT_KEY(athleteId)) === '1'; } catch { return false; }
}

export function dismissAthleteZonesPromptForSession(athleteId) {
  try { if (athleteId) sessionStorage.setItem(ATHLETE_PROMPT_KEY(athleteId), '1'); } catch { /* ignore */ }
}

/**
 * Ask a coach for the zones of the athlete they are looking at, when that
 * athlete has none. Nothing happens for athletes looking at themselves —
 * their own prompt lives elsewhere — or for a profile already seen this session.
 * @returns {boolean} whether the modal was requested
 */
export function maybePromptAthleteZonesSetup(viewer, athleteProfile) {
  const athleteId = athleteProfile?._id;
  if (!athleteId || !viewer?._id || String(athleteId) === String(viewer._id)) return false;
  if (!isCoachLikeUser(viewer)) return false;
  if (!profileNeedsTrainingZones(athleteProfile)) return false;
  if (athleteZonesPromptDismissedThisSession(athleteId)) return false;
  dismissAthleteZonesPromptForSession(athleteId);
  requestTrainingZonesModal({ source: 'athlete-profile', athleteId: String(athleteId), profile: athleteProfile });
  return true;
}

/** Save zones the modal produced onto an athlete, and tell the page. */
export async function saveAthleteZones(athleteId, formData) {
  // Loaded here rather than at the top: this module is pure otherwise, and
  // the utilities that import it should stay free of the HTTP client.
  const { updateAthleteProfile } = await import('../services/api');
  const res = await updateAthleteProfile(athleteId, { ...formData, zonesSource: 'coach' });
  const profile = res?.data?.athlete || res?.data || null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ATHLETE_PROFILE_UPDATED_EVENT, { detail: { athleteId: String(athleteId), profile } }));
  }
  return profile;
}
