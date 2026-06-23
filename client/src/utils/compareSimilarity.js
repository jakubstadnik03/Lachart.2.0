/** Shared helpers for Compare tab — title tokens & similarity scoring. */

export const COMPARE_TITLE_STOPWORDS = new Set([
  'morning', 'evening', 'afternoon', 'night', 'midday',
  'ride', 'run', 'swim', 'bike', 'cycling', 'running', 'swimming',
  'training', 'workout', 'session', 'activity', 'indoor', 'outdoor',
  'easy', 'long', 'hard', 'short', 'recovery', 'active', 'rest',
  'virtual', 'zwift', 'trainer', 'commute', 'lunch',
  'rano', 'vecer', 'odpoledne', 'trenink', 'cyklistika', 'beh', 'plavani',
]);

export function titleTokens(s) {
  return new Set(
    String(s || '').toLowerCase()
      .replace(/[·\-_,/;:!?@#()]/g, ' ')
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9áčďéěíňóřšťúůýž]/gi, ''))
      .filter((t) => t.length >= 3),
  );
}

/** Meaningful title words — skips generic sport/time labels. */
export function distinctiveTitleTokens(title) {
  return [...titleTokens(title)].filter((t) => !COMPARE_TITLE_STOPWORDS.has(t));
}

export function isGenericTitle(title) {
  const all = [...titleTokens(title)];
  if (all.length === 0) return true;
  return all.every((t) => COMPARE_TITLE_STOPWORDS.has(t));
}
