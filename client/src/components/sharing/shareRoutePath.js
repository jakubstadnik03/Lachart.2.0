/**
 * Project GPS [lat,lng] points into an SVG path `d` string for share cards.
 */
export function buildRoutePath(gpsPoints, { boxX, boxY, boxW, boxH, maxPoints = 400 } = {}) {
  if (!Array.isArray(gpsPoints) || gpsPoints.length < 2) return null;
  if (boxW == null || boxH == null) return null;

  let pts = gpsPoints;
  if (gpsPoints.length > maxPoints) {
    const step = Math.ceil(gpsPoints.length / maxPoints);
    pts = gpsPoints.filter((_, i) => i % step === 0 || i === gpsPoints.length - 1);
  }
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const dLat = maxLat - minLat || 1e-6;
  const dLng = maxLng - minLng || 1e-6;
  const bx = boxX ?? 0;
  const by = boxY ?? 0;
  const scale = Math.min(boxW / dLng, boxH / dLat);
  const offsetX = bx + (boxW - dLng * scale) / 2;
  const offsetY = by + (boxH - dLat * scale) / 2;
  const project = (lat, lng) => [
    offsetX + (lng - minLng) * scale,
    offsetY + (maxLat - lat) * scale,
  ];
  return pts
    .map((p) => project(p[0], p[1]))
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
}
