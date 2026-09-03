/**
 * Printing a threshold in the unit its sport is spoken in.
 *
 * The engine works in "demand" — watts for the bike, metres per second for the
 * pace sports — because that is the only scale on which a heart-rate slope
 * means anything. Nobody trains in metres per second. Everything an athlete
 * reads goes through here, so a threshold looks the same on the test page, the
 * session panel and the insight that mentions it.
 */

export function fmtPaceSec(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  // Round to the whole second FIRST. Taking the remainder of an unrounded
  // value and rounding that can land on 60 — 239.5 s/km printed as "3:60"
  // on a chart axis, which is not a time.
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** An intensity: "265 W", "4:12/km", "31.4 km/h". */
export function fmtDemand(demand, kind, storageMode) {
  if (!Number.isFinite(demand) || demand <= 0) return '—';
  if (kind === 'bike') return `${Math.round(demand)} W`;
  if (storageMode === 'speed') return `${(demand * 3.6).toFixed(1)} km/h`;
  return `${fmtPaceSec(1000 / demand)}/km`;
}

/**
 * A signed change in demand, printed the way the sport talks about it.
 *
 * Pace is the awkward one: a threshold that improved is a *smaller* number of
 * seconds, so the sign would read backwards if the difference were taken on the
 * axis the engine works in. It is converted to seconds per kilometre and
 * flipped, so "+8 s/km" always means faster — the direction an athlete expects
 * a plus to point.
 */
export function fmtDemandDelta(delta, demandNow, kind, storageMode) {
  if (!Number.isFinite(delta)) return '—';
  if (kind === 'bike') return `${delta > 0 ? '+' : ''}${Math.round(delta)} W`;
  if (storageMode === 'speed') return `${delta > 0 ? '+' : ''}${(delta * 3.6).toFixed(1)} km/h`;
  const before = 1000 / (demandNow - delta);
  const after = 1000 / demandNow;
  const secs = Math.round(before - after);
  return `${secs > 0 ? '+' : ''}${secs} s/km`;
}

/** The same, unsigned — for sentences that already say which way it went. */
export function fmtDemandMagnitude(delta, demandNow, kind, storageMode) {
  const s = fmtDemandDelta(delta, demandNow, kind, storageMode);
  return s.replace(/^[+-]/, '');
}

/** Bare number for a chart axis — no unit, the axis label carries that. */
export function axisTick(demand, kind, storageMode) {
  if (kind === 'bike') return Math.round(demand);
  if (storageMode === 'speed') return (demand * 3.6).toFixed(1);
  return fmtPaceSec(1000 / demand);
}

/** What the demand axis is measuring, for the axis label. */
export function demandUnitLabel(kind, storageMode) {
  if (kind === 'bike') return 'Watts';
  if (storageMode === 'speed') return 'km/h';
  return 'Pace (min/km)';
}

export function fmtHours(sec) {
  const s = Number(sec) || 0;
  if (s < 60) return '0h';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

export function fmtShortDate(d) {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  return t.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function fmtLongDate(d) {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '';
  return t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "3 weeks" / "4 months" — how a coach says how old a test is. */
export function fmtAge(days) {
  const d = Math.round(Number(days) || 0);
  if (d < 14) return `${d} day${d === 1 ? '' : 's'}`;
  if (d < 70) return `${Math.round(d / 7)} weeks`;
  return `${Math.round(d / 30)} months`;
}
