/**
 * When the Coach Leads letter last went out to a user.
 *
 * sendToPerson records the send under a different key per segment — a coach
 * lands in coachOutreachSentAt, an athlete in athleteOutreachSentAt, and so on
 * — because the four segments are separate campaigns and each is meant to be
 * sent once. The admin list asks a simpler question, "when did I last email
 * this person", so it takes the most recent of them.
 *
 * @param {{outreach?: object}|null} user
 * @returns {Date|null}
 */
export function lastOutreachSentAt(user) {
  const o = user?.outreach;
  if (!o) return null;
  const times = [
    o.coachOutreachSentAt,
    o.athleteOutreachSentAt,
    o.untestedOutreachSentAt,
    o.othersOutreachSentAt,
  ]
    .map((v) => (v ? new Date(v) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()));
  if (!times.length) return null;
  return times.reduce((latest, d) => (d > latest ? d : latest));
}

/** Short, local, and unambiguous — the admin list has little room. */
export function formatOutreachSentAt(date) {
  if (!date) return null;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
