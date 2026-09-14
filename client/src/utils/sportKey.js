/**
 * Canonical sport keys used across dashboard, calendar, and native tiles.
 *
 * Lives here, away from the icon set, so the modules that pair plans with
 * sessions (and the Expo app that shares them) can ask what sport a string
 * names without pulling in React or the SVGs. SportIcon re-exports it, so
 * every existing import keeps working.
 */
export function resolveSportKey(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('bike') || s.includes('ride') || s.includes('cycl') || s.includes('virtual')) return 'bike';
  if (s.includes('swim')) return 'swim';
  if (s.includes('elliptical') || s.includes('cross-trainer') || s.includes('crosstrainer')) return 'elliptical';
  if (
    s.includes('nordic') ||
    s.includes('backcountry') ||
    s.includes('rollerski') ||
    (s.includes('ski') && !s.includes('kite'))
  ) return 'ski';
  if (s.includes('hike')) return 'hike';
  if (s.includes('walk')) return 'walk';
  if (s.includes('run') || s.includes('trail')) return 'run';
  if (s.includes('gym') || s.includes('weight') || s.includes('strength') || s.includes('workout') ||
      s.includes('crossfit') || s.includes('yoga') || s.includes('fitness'))
    return 'gym';
  return 'other';
}

/**
 * Which flavour of gym a sport string names — weights and conditioning, or
 * yoga and its cousins. The planner offers one gym sport for both, so this
 * is what tells a morning of weights from a morning of yoga when a strength
 * plan has both to choose from. Null for anything outside the gym.
 */
export function gymKind(sport) {
  const s = String(sport || '').toLowerCase();
  if (/yoga|j[oó]ga|pilates|stretch|protah|mobilit|flexib|breath/.test(s)) return 'yoga';
  return resolveSportKey(s) === 'gym' ? 'strength' : null;
}
