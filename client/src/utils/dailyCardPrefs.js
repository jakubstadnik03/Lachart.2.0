/**
 * Daily coaching card preferences — voice, delivery time, minimise state.
 *
 * Stored on the user (so they follow the athlete across devices) with a
 * localStorage mirror so the card can paint with the right voice on first frame
 * instead of flashing the default and then correcting itself.
 */
import { API_ENDPOINTS } from '../config/api.config';
import { DEFAULT_COACHING_STYLE, COACHING_STYLE_IDS } from '../constants/coachingStyles';

const LS_KEY = 'lachart:dailyCardPrefs';

export const DEFAULT_DAILY_CARD_PREFS = {
  enabled: true,
  /** Local wall-clock time the card is pushed. */
  hour: 7,
  minute: 0,
  style: DEFAULT_COACHING_STYLE,
  /** Show the rotating lactate lesson. */
  lesson: true,
};

function sanitize(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const hour = Number(p.dailyCardHour ?? p.hour);
  const minute = Number(p.dailyCardMinute ?? p.minute);
  const style = p.dailyCardStyle ?? p.style;
  return {
    enabled: (p.dailyCard ?? p.enabled) !== false,
    hour: Number.isFinite(hour) && hour >= 0 && hour <= 23 ? Math.floor(hour) : DEFAULT_DAILY_CARD_PREFS.hour,
    minute: Number.isFinite(minute) && minute >= 0 && minute <= 59 ? Math.floor(minute) : 0,
    style: COACHING_STYLE_IDS.includes(style) ? style : DEFAULT_COACHING_STYLE,
    lesson: (p.dailyCardLesson ?? p.lesson) !== false,
  };
}

/** Prefs from the user object, falling back to the local mirror. */
export function readDailyCardPrefs(user) {
  const fromUser = user?.notifications;
  if (fromUser && (fromUser.dailyCardStyle || fromUser.dailyCard !== undefined || fromUser.dailyCardHour !== undefined)) {
    return sanitize(fromUser);
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return sanitize(JSON.parse(raw));
  } catch { /* ignore */ }
  return { ...DEFAULT_DAILY_CARD_PREFS };
}

export function cacheDailyCardPrefs(prefs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(sanitize(prefs)));
  } catch { /* ignore */ }
}

/** Map card prefs onto the user's `notifications` sub-document. */
export function toNotificationFields(prefs) {
  const p = sanitize(prefs);
  return {
    dailyCard: p.enabled,
    dailyCardHour: p.hour,
    dailyCardMinute: p.minute,
    dailyCardStyle: p.style,
    dailyCardLesson: p.lesson,
  };
}

/**
 * Persist to the server, merging into the notifications the user already has so
 * a card change never clears an unrelated push preference.
 */
export async function saveDailyCardPrefs(prefs, existingNotifications = {}) {
  const merged = { ...(existingNotifications || {}), ...toNotificationFields(prefs) };
  cacheDailyCardPrefs(prefs);

  const response = await fetch(API_ENDPOINTS.EDIT_PROFILE, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify({ notifications: merged }),
  });
  if (!response.ok) throw new Error('Failed to save daily card preferences');

  const updatedUser = await response.json();
  window.dispatchEvent(new CustomEvent('userUpdated', { detail: updatedUser }));
  return updatedUser;
}

// ── Minimise-to-chip state ─────────────────────────────────────────
// Per day: minimising is "I've read today's card", not "hide this forever".

function minimiseKey(athleteId, dateKey) {
  return `lachart:dailyCardMin:${athleteId || 'self'}:${dateKey}`;
}

export function isCardMinimised(athleteId, dateKey) {
  try {
    return localStorage.getItem(minimiseKey(athleteId, dateKey)) === '1';
  } catch {
    return false;
  }
}

export function setCardMinimised(athleteId, dateKey, minimised) {
  try {
    if (minimised) localStorage.setItem(minimiseKey(athleteId, dateKey), '1');
    else localStorage.removeItem(minimiseKey(athleteId, dateKey));
  } catch { /* ignore */ }
}
