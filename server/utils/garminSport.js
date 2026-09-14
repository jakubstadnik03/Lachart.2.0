/**
 * Garmin's activityType → the sport a GarminActivity row stores.
 *
 * Garmin has dozens of typeKeys. Running, cycling and swimming were always
 * mapped; everything else fell through to "other", and that is where the
 * calendar lost the gym. A planned strength session pairs with a recorded
 * strength session — never with "other" — so an athlete whose watch logged
 * "Síla" every morning had a plan that never ticked off.
 *
 * The values here are the vocabulary the client buckets on (resolveSportKey):
 * strength / yoga / fitness land in its gym bucket, elliptical and skiing in
 * their own, rowing stays "other" as it has no bucket yet.
 */

const EXACT = {
  running: 'running',
  cycling: 'cycling',
  biking: 'cycling',
  road_biking: 'cycling',
  mountain_biking: 'cycling',
  gravel_cycling: 'cycling',
  gravel_biking: 'cycling',
  cyclocross: 'cycling',
  track_cycling: 'cycling',
  virtual_ride: 'cycling',
  indoor_cycling: 'cycling',
  e_bike_fitness: 'cycling',
  e_bike_mountain: 'cycling',
  swimming: 'swimming',
  pool_swimming: 'swimming',
  lap_swimming: 'swimming',
  open_water_swimming: 'swimming',
  triathlon: 'triathlon',
  walking: 'running',
  hiking: 'running',
  trail_running: 'running',
  treadmill_running: 'running',
  street_running: 'running',
  track_running: 'running',
  virtual_run: 'running',
  indoor_running: 'running',
  ultra_run: 'running',
  // The gym family. Garmin splits it finer than anyone plans it.
  strength_training: 'strength',
  yoga: 'yoga',
  pilates: 'yoga',
  breathwork: 'yoga',
  flexibility_training: 'yoga',
  indoor_cardio: 'fitness',
  cardio_training: 'fitness',
  hiit: 'fitness',
  fitness_equipment: 'fitness',
  stair_climbing: 'fitness',
  indoor_climbing: 'fitness',
  bouldering: 'fitness',
  jump_rope: 'fitness',
  elliptical: 'elliptical',
  rowing: 'rowing',
  indoor_rowing: 'rowing',
  rowing_v2: 'rowing',
};

function mapGarminSportType(rawSport) {
  const sportType = String(rawSport || 'running').toLowerCase();
  if (EXACT[sportType]) return EXACT[sportType];
  // Keyword fallback so unmapped Garmin typeKeys (they have dozens) land in
  // the right bucket instead of everything defaulting to "running" — a wrong
  // sport breaks the calendar icon AND the Strava-vs-Garmin dedup.
  if (/swim/.test(sportType)) return 'swimming';
  if (/rid|bik|cycl/.test(sportType)) return 'cycling';
  if (/run|walk|hik/.test(sportType)) return 'running';
  if (/strength|weight/.test(sportType)) return 'strength';
  if (/yoga|pilates|stretch|flexib|breath|mobility/.test(sportType)) return 'yoga';
  if (/elliptical/.test(sportType)) return 'elliptical';
  if (/row/.test(sportType)) return 'rowing';
  if (/ski/.test(sportType) && !/kite/.test(sportType)) return 'skiing';
  if (/cardio|hiit|fitness|stair|gym|crossfit|climb/.test(sportType)) return 'fitness';
  return 'other';
}

/**
 * The sport of a stored row.
 *
 * Rows synced before the gym family was mapped say "other" but still carry
 * Garmin's own type in `raw.activityType`; older builds also stored the raw
 * typeKey itself as the sport. Both read back as what they should have been.
 */
function garminSportOf(doc) {
  const stored = String(doc?.sport || '').trim();
  const mapped = stored ? mapGarminSportType(stored) : '';
  if (mapped && mapped !== 'other') return mapped;
  const rawType = doc?.raw?.activityType?.typeKey || doc?.raw?.activityType;
  if (rawType) return mapGarminSportType(rawType);
  return mapped || 'other';
}

module.exports = { mapGarminSportType, garminSportOf };
