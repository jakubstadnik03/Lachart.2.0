/**
 * Sport keys for notification icons / labels — mirrors client SportIcon.resolveSportKey.
 * @returns {'bike'|'swim'|'hike'|'walk'|'run'|'gym'|null}
 */
function normalizeSportForNotif(sport) {
  if (!sport) return null;
  const s = String(sport).toLowerCase();
  if (/ride|bike|cycl|velo|virtual/.test(s)) return 'bike';
  if (/swim/.test(s)) return 'swim';
  if (/hike/.test(s)) return 'hike';
  if (/walk/.test(s)) return 'walk';
  if (/run|trail|treadmill/.test(s)) return 'run';
  if (/gym|weight|strength|workout|crossfit|yoga|elliptical|fitness/.test(s)) return 'gym';
  return null;
}

/** Human-readable label for push / in-app notification body text. */
function sportNotifLabel(sportKey) {
  switch (sportKey) {
    case 'bike': return 'ride';
    case 'swim': return 'swim';
    case 'hike': return 'hike';
    case 'walk': return 'walk';
    case 'run': return 'run';
    case 'gym': return 'workout';
    default: return 'activity';
  }
}

module.exports = { normalizeSportForNotif, sportNotifLabel };
