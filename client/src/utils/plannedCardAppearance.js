import { planSportColor } from './planCompliance';

/**
 * How a calendar card looks, given what happened to the plan.
 *
 * The dashboard's week strip has always coloured these by compliance — did the
 * planned session get done, get missed, or is it still ahead — while the
 * calendar page coloured by what kind of session it was. Same week, same
 * sessions, two colours: a missed "Bike heat" read red on one screen and green
 * on the other, and neither screen said which question it was answering.
 *
 * Compliance won, because "what did I actually do" is what a calendar is for.
 * The category survives as its own chip on the card, where it says what the
 * session was without pretending to say whether it happened.
 *
 * Pure and shared so the two calendars cannot drift apart again.
 *
 * @param {object}  state
 * @param {boolean} state.isCompleted   the plan was done
 * @param {boolean} state.isMissed      the day passed with nothing paired
 * @param {boolean} state.isPlanned     still ahead, nothing paired yet
 * @param {string}  [state.sport]       used to tint a purely planned card
 * @param {{color: string, bg: string}} [state.compliance] from findCompliance
 * @returns {{bg: string, borderColor: string, borderStyle: string, accent: string}}
 */
export function plannedCardAppearance({
  isCompleted = false,
  isMissed = false,
  isPlanned = false,
  sport = null,
  compliance = null,
} = {}) {
  if (isCompleted) {
    // findCompliance grades how close the session came; without a grade it is
    // still done, so fall back to plain green rather than to "no opinion".
    const style = compliance || { color: '#22c55e', bg: '#f0fdf4' };
    return { bg: style.bg, borderColor: style.color, borderStyle: 'solid', accent: style.color };
  }
  if (isMissed) {
    return { bg: '#fef2f2', borderColor: '#fecaca', borderStyle: 'solid', accent: '#ef4444' };
  }
  if (isPlanned) {
    const planColor = planSportColor(sport);
    // Dashed and barely tinted: it has not happened yet and should not read as
    // though it had.
    return { bg: `${planColor}10`, borderColor: `${planColor}55`, borderStyle: 'dashed', accent: planColor };
  }
  // A completed activity with no plan behind it — nothing to comply with.
  return { bg: '#ffffff', borderColor: '#e5e7eb', borderStyle: 'solid', accent: '#e5e7eb' };
}
