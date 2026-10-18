/**
 * Which Fitness / Fatigue / Form numbers a week card should print.
 *
 * The native home screen shows these twice: once on the status card for today,
 * once on the week card. They were reading different sources — the status card
 * takes the server's calculateFormFitnessData, the week card walked its own
 * locally derived PMC series — so the same athlete on the same screen was
 * 167 / 181 / −40 in one card and 181 / 201 / −49 in the other.
 *
 * The rule: when the week on screen is the one containing today, these tiles
 * describe today, so they come from the same server numbers the status card
 * uses. A past or future week has no "today" in it and is read from the series
 * snapshot, which is the only thing that knows about those days.
 */

/** Does the displayed week contain `today`? */
export function weekContainsToday(monday, sunday, today = new Date()) {
  if (!(monday instanceof Date) || !(sunday instanceof Date)) return false;
  if (Number.isNaN(monday.getTime()) || Number.isNaN(sunday.getTime())) return false;
  const t = today instanceof Date ? today.getTime() : NaN;
  if (Number.isNaN(t)) return false;
  // getWeekBounds puts monday at 00:00:00.000 and sunday at 23:59:59.999, so a
  // plain comparison holds at any hour — including Sunday evening, where a
  // midnight-to-midnight range would have dropped the day.
  return t >= monday.getTime() && t <= sunday.getTime();
}

/**
 * The snapshot the week card's tiles should show.
 *
 * @param {object}   o
 * @param {Date}     o.monday        start of the displayed week
 * @param {Date}     o.sunday        end of the displayed week
 * @param {Date}     [o.today]
 * @param {object}   [o.todayMetrics] server numbers: {fitness, fatigue, form}
 * @param {object}   [o.endSnap]      series point: {Fitness, Fatigue, Form}
 * @returns {{Fitness:number, Fatigue:number, Form:number}|null}
 */
export function resolveWeekEndValues({
  monday,
  sunday,
  today = new Date(),
  todayMetrics = null,
  endSnap = null,
} = {}) {
  const hasServer = todayMetrics
    && (todayMetrics.fitness != null || todayMetrics.form != null || todayMetrics.fatigue != null);

  if (hasServer && weekContainsToday(monday, sunday, today)) {
    return {
      Fitness: Number(todayMetrics.fitness) || 0,
      Fatigue: Number(todayMetrics.fatigue) || 0,
      Form: Number(todayMetrics.form) || 0,
    };
  }
  return endSnap || null;
}
