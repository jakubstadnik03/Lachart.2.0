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
    const explicitSelected = typeof r.isSelected === 'boolean';
    return {
      ...r,
      interval: r.interval ?? idx + 1,
      heartRate: r.heartRate ?? r.heart_rate ?? r.avgHeartRate ?? '',
      lactate: r.lactate ?? '',
      distanceMeters: r.distanceMeters ?? undefined,
      isSelected: explicitSelected ? r.isSelected : !isRec,
      isRecovery: isRec,
    };
  });
  raw.sport = mapSportForTrainingForm(raw.sport);
  // Pass through raw Strava laps for the bar chart in TrainingForm
  raw.laps = Array.isArray(training.laps) ? training.laps : undefined;
  return raw;
}
