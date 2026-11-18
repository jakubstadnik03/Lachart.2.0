/**
 * Has this coach just created this same athlete?
 *
 * A slow server (Render waking up) left the Add Athlete form waiting with an
 * enabled button, and one coach's taps created "Son S" 13 times in 16 seconds.
 * A repeat of the same name and e-mail from the same coach within a few
 * minutes is the same athlete, so add-athlete answers with the first one.
 */
const WINDOW_MS = 10 * 60 * 1000;

const norm = (v) => String(v || '').trim().toLowerCase();

/** Pure match, for tests. */
function isSameRecentAthlete(candidate, { coachId, name, surname, email }, now = Date.now()) {
  if (!candidate) return false;
  if (String(candidate.coachId) !== String(coachId)) return false;
  if (candidate.isRegistrationComplete) return false;
  if (norm(candidate.name) !== norm(name) || norm(candidate.surname) !== norm(surname)) return false;
  if (norm(candidate.email) !== norm(email)) return false;
  const created = new Date(candidate.createdAt).getTime();
  return Number.isFinite(created) && now - created <= WINDOW_MS;
}

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The athlete this coach created moments ago with these details, or null. */
async function findRecentDuplicateAthlete(UserModel, { coachId, name, surname, email }, now = Date.now()) {
  const candidates = await UserModel.find({
    coachId,
    isRegistrationComplete: false,
    createdAt: { $gte: new Date(now - WINDOW_MS) },
    name: new RegExp(`^${escapeRe(String(name).trim())}$`, 'i'),
    surname: new RegExp(`^${escapeRe(String(surname).trim())}$`, 'i'),
  }).sort({ createdAt: 1 }).limit(5).lean();
  return candidates.find((c) => isSameRecentAthlete(c, { coachId, name, surname, email }, now)) || null;
}

module.exports = { isSameRecentAthlete, findRecentDuplicateAthlete, WINDOW_MS };
