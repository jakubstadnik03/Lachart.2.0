/** Normalise sport for TrainingForm (lactate shortcut / Strava sync). */
export function mapSportForTrainingForm(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('swim')) return 'swim';
  if (s.includes('run') || s === 'walk' || s === 'hike') return 'run';
  if (s.includes('bike') || s.includes('cycl') || s.includes('ride')) return 'bike';
  return 'bike';
}

/** Deep clone for modal; normalise results + sport for TrainingForm (lactate shortcut). */
export function prepareTrainingForLactateEntry(training) {
  const raw =
    typeof structuredClone === 'function'
      ? structuredClone(training)
      : JSON.parse(JSON.stringify(training));
  const results = Array.isArray(raw.results) ? raw.results : [];
  raw.results = results.map((r, idx) => {
    const isRec = r.isRecovery === true;
    return {
      ...r,
      interval: r.interval ?? idx + 1,
      heartRate: r.heartRate ?? r.heart_rate ?? r.avgHeartRate ?? '',
      lactate: r.lactate ?? '',
      isSelected: isRec ? false : true,
      isRecovery: isRec,
    };
  });
  raw.sport = mapSportForTrainingForm(raw.sport);
  return raw;
}
