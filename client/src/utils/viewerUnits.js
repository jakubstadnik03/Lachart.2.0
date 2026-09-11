/**
 * The units the person looking at the screen reads in.
 *
 * Pace is stored one way — seconds per kilometre, seconds per 100 m — and an
 * athlete on miles was reading "7:27/km" under a run whose header already
 * said "12:21/mi", because the formatters deep inside charts and insight
 * sentences had no way to know who was looking. Threading a unit system down
 * through every tick formatter and nested card would have touched a hundred
 * call sites; the preference is a property of the viewer, like their locale,
 * so it is held once here and set whenever the signed-in user changes.
 *
 * Reading it is cheap and pure enough: formatters that take an explicit
 * unit system still can, and tests set it directly.
 */

import {
  KM_PER_MILE,
  M_PER_YARD,
  formatPaceMMSS,
  getUserUnits,
  resolveDistanceUnitSystem,
} from './unitsConverter';

let current = 'metric';

/** Set from the signed-in user — AuthProvider does this; tests may too. */
export function setViewerUnitSystem(unitSystem) {
  current = unitSystem === 'imperial' ? 'imperial' : 'metric';
}

/** The signed-in user's distance units, resolved the way the app does everywhere. */
export function setViewerUnitsFromUser(user) {
  setViewerUnitSystem(resolveDistanceUnitSystem({ units: getUserUnits(user) }));
}

export function viewerUnitSystem() {
  return current;
}

export function viewerIsImperial() {
  return current === 'imperial';
}

const isSwim = (sport) => String(sport || '').toLowerCase().includes('swim');

/** "/km" | "/mi" | "/100m" | "/100yd" for the viewer. */
export function viewerPaceSuffix(sport = 'run') {
  if (isSwim(sport)) return current === 'imperial' ? '/100yd' : '/100m';
  return current === 'imperial' ? '/mi' : '/km';
}

/** "min/km" | "min/mi" | "min/100m" | "min/100yd". */
export function viewerPaceUnitLabel(sport = 'run') {
  return `min${viewerPaceSuffix(sport)}`;
}

/** Stored pace (sec/km or sec/100m) → the viewer's seconds per unit. */
export function paceToViewer(canonicalSec, sport = 'run') {
  const n = Number(canonicalSec);
  if (!Number.isFinite(n)) return n;
  if (current !== 'imperial') return n;
  return isSwim(sport) ? n * M_PER_YARD : n * KM_PER_MILE;
}

/** The viewer's seconds per unit → stored pace (sec/km or sec/100m). */
export function paceFromViewer(displaySec, sport = 'run') {
  const n = Number(displaySec);
  if (!Number.isFinite(n)) return n;
  if (current !== 'imperial') return n;
  return isSwim(sport) ? n / M_PER_YARD : n / KM_PER_MILE;
}

/** Stored pace → "7:27/mi" (or "—" when there is nothing to show). */
export function fmtViewerPace(canonicalSec, sport = 'run') {
  const mmss = formatPaceMMSS(paceToViewer(canonicalSec, sport));
  return mmss ? `${mmss}${viewerPaceSuffix(sport)}` : '—';
}

/** Stored pace → "7:27", no unit — for a cell whose header carries it. */
export function fmtViewerPaceBare(canonicalSec, sport = 'run') {
  return formatPaceMMSS(paceToViewer(canonicalSec, sport)) || '';
}

/** A pace difference in stored seconds → "+12 s/mi". Sign as given. */
export function fmtViewerPaceDelta(canonicalDeltaSec, sport = 'run') {
  const n = Number(canonicalDeltaSec);
  if (!Number.isFinite(n)) return '—';
  const secs = Math.round(paceToViewer(n, sport));
  return `${secs > 0 ? '+' : ''}${secs} s${viewerPaceSuffix(sport)}`;
}
