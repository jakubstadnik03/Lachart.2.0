/**
 * Why a subscriber left, asked at the moment they cancel.
 *
 * The options exist to separate fixes that look identical in the numbers but
 * are not: "too expensive" is a pricing problem, "missing" is a roadmap one,
 * and "never_set_up" is an activation one — and in October 2026 the evidence
 * pointed at the third (people cancelling the same day they started, with no
 * tracker and no app) without ever being able to prove it.
 *
 * `off_season` is here because this is an endurance product: an athlete
 * pausing between seasons is not churn in the usual sense and should not be
 * counted with people who left unhappy.
 *
 * The answer is optional, always. Cancelling stays one click away.
 */
const CANCEL_REASONS = [
  'too_expensive',
  'missing_feature',
  'never_set_up',
  'using_something_else',
  'off_season',
  'other',
];

/** Free-text notes are a courtesy, not a dataset — keep them short. */
const CANCEL_NOTE_MAX = 500;

/** @returns {string|null} the reason if we recognise it, else null. */
function normalizeCancelReason(value) {
  const v = String(value || '').trim().toLowerCase();
  return CANCEL_REASONS.includes(v) ? v : null;
}

/** @returns {string|null} a trimmed, length-capped note, or null. */
function normalizeCancelNote(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return null;
  return v.slice(0, CANCEL_NOTE_MAX);
}

module.exports = {
  CANCEL_REASONS,
  CANCEL_NOTE_MAX,
  normalizeCancelReason,
  normalizeCancelNote,
};
