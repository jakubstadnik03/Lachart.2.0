/**
 * Per-sport week targets, cleaned on the way in.
 *
 * The season plan lets a coach write "eight hours on the bike, two runs"
 * against a week. Anything else that arrives in that object is dropped: the
 * shape is a small fixed set of sports, and a client is not the place the
 * list of them is decided.
 */

/** The sports a week target may be set for. */
const TARGET_SPORTS = ['bike', 'run', 'swim', 'strength'];

/**
 * @param {unknown} raw
 * @returns {Object|undefined} the cleaned map, or undefined when nothing is set
 */
function sanitizeSportMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  for (const sport of TARGET_SPORTS) {
    const v = raw[sport];
    // A cleared box arrives as '' or null and means "no target for this sport",
    // which is not the same as a target of zero — zero is a deliberate
    // "nothing this week" and has to survive.
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) out[sport] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

module.exports = { TARGET_SPORTS, sanitizeSportMap };
