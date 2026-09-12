/**
 * A compared session, opened from the Compare tab, as the activity the modal
 * starts from.
 *
 * Only what the list knows for sure goes in; the modal fetches the session
 * itself and fills the rest. A zero here used to win over the loaded number,
 * so a compared ride opened with no duration, no power and "missing
 * heart-rate data" while its own chart drew all three.
 */
export function comparedSessionStub(na, current) {
  const n = (v) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  const stub = {
    id: na.id, _id: na.id, type: na.type,
    sport: na.sport || current?.sport || null, date: na.date,
    title: na.title,
    category: na.category ?? null, lactate: na.lactate ?? null,
    laps: Array.isArray(na.laps) ? na.laps : [],
  };
  if (n(na.distance)) stub.distance = n(na.distance);
  if (n(na.duration)) { stub.movingTime = n(na.duration); stub.moving_time = n(na.duration); }
  if (n(na.elapsedTime)) stub.elapsed_time = n(na.elapsedTime);
  if (n(na.avgHr)) stub.average_heartrate = n(na.avgHr);
  if (n(na.avgPower)) stub.average_watts = n(na.avgPower);
  if (n(na.normalizedPower)) stub.weighted_average_watts = n(na.normalizedPower);
  return stub;
}

export default comparedSessionStub;
