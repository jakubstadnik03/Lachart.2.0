/**
 * "Does this imported activity look like an interval session?"
 *
 * Grown out of the Field Lactate panel, where it drives the "Intervals?" /
 * "Likely test" badges. It lives here because the dashboard now asks the same
 * question for a different reason — deciding which Strava/Garmin activities are
 * worth offering in Training History and the Training Graph — and two copies of
 * a scoring table would answer it differently within a week.
 *
 * The inputs are all cheap summary fields, deliberately: the caller must be able
 * to score a list of activities without fetching each one's laps.
 *
 * @typedef {object} ScoreInput
 * @property {string} [name]           activity title
 * @property {number} [lapCount]       number of laps recorded
 * @property {number} [lapDurationCv]  coefficient of variation of lap durations
 * @property {number} [avgHr]          average heart rate across laps
 * @property {number} [avgWatts]       average power across laps
 */

/** score >= this reads as a deliberate test session. */
export const LIKELY_TEST_SCORE = 7;
/** score >= this reads as structured intervals. */
export const LIKELY_INTERVALS_SCORE = 5;

/**
 * @param {ScoreInput} a
 * @returns {{ score: number, signals: string[] }}
 */
export function scoreIntervalSession(a) {
  let score = 0;
  const signals = [];
  const name = (a?.name || '').toLowerCase();

  if (/lactate|lactát|lactat/.test(name)) { score += 5; signals.push('🧪 lactate in name'); }
  else if (/interval|intervaly|intervals/.test(name)) { score += 4; signals.push('🔁 intervals'); }
  else if (/tempo|threshold|lt[12]|ltp|ftp|vo2/.test(name)) { score += 3; signals.push('⚡ threshold'); }
  else if (/test|testing|quality|race|effort/.test(name)) { score += 2; signals.push('🏁 test/race'); }
  else if (/hard|fast|speed|sprint/.test(name)) { score += 1; }

  if (a?.lapCount >= 8) { score += 3; signals.push(`${a.lapCount} laps`); }
  else if (a?.lapCount >= 5) { score += 2; signals.push(`${a.lapCount} laps`); }
  else if (a?.lapCount >= 3) { score += 1; }

  if (a?.lapDurationCv != null) {
    if (a.lapDurationCv < 0.12 && a.lapCount >= 3) { score += 3; signals.push('structured intervals'); }
    else if (a.lapDurationCv < 0.25 && a.lapCount >= 3) { score += 1; }
  }

  if (a?.avgHr) {
    if (a.avgHr >= 165) { score += 3; signals.push(`❤️ ${a.avgHr} bpm avg`); }
    else if (a.avgHr >= 150) { score += 2; signals.push(`❤️ ${a.avgHr} bpm avg`); }
    else if (a.avgHr >= 135) { score += 1; }
  }

  if (a?.avgWatts) {
    if (a.avgWatts >= 220) { score += 2; signals.push(`⚡ ${a.avgWatts}W`); }
    else if (a.avgWatts >= 160) { score += 1; }
  }

  return { score, signals: signals.slice(0, 3) };
}

/**
 * Read an activity in whichever shape it arrives — the Field Lactate feed, the
 * integrations list and the merged dashboard array each name these differently.
 */
export function intervalSignalsFromActivity(a) {
  if (!a) return { name: '', lapCount: 0, lapDurationCv: null, avgHr: null, avgWatts: null };
  return {
    name: a.name || a.title || a.titleManual || '',
    lapCount: Number(a.lapCount ?? (Array.isArray(a.laps) ? a.laps.length : 0)) || 0,
    lapDurationCv: a.lapDurationCv ?? null,
    avgHr: a.avgHr ?? a.avgHeartRate ?? a.averageHeartRate ?? a.average_heartrate ?? null,
    avgWatts: a.avgWatts ?? a.avgPower ?? a.averagePower ?? a.average_watts ?? null,
  };
}

/**
 * Does this activity look structured enough to be worth charting?
 *
 * Requires at least two laps on top of the score: a single-lap activity has no
 * intervals to show no matter how its title reads, and admitting it would put
 * an empty chart back in the picker.
 */
export function looksLikeIntervalSession(activity, threshold = LIKELY_INTERVALS_SCORE) {
  const signals = intervalSignalsFromActivity(activity);
  if (signals.lapCount < 2) return false;
  return scoreIntervalSession(signals).score >= threshold;
}
