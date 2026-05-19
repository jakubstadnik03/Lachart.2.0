/**
 * Google Encoded Polyline algorithm decoder.
 *
 * Strava returns `map.summary_polyline` (and `map.polyline` for detailed
 * activities) as a Google-encoded polyline string — even when the
 * /activities/{id}/streams endpoint fails to return a `latlng` stream
 * (transient 400/404, indoor → outdoor crossover, very short rides).
 * Decoding it gives us a usable lat/lng track for the activity map
 * without needing the streams endpoint to succeed.
 *
 * Algorithm: each lat or lng delta is encoded as a variable-length
 * sequence of 5-bit groups, ASCII-shifted by 63. See
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 *
 * Returns an array of [lat, lng] pairs. Empty input → empty array.
 * Never throws — invalid bytes just truncate the result.
 */
function decodePolyline(str, precision = 5) {
  if (!str || typeof str !== 'string') return [];
  const factor = 10 ** precision;
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const len = str.length;

  while (index < len) {
    // Decode lat
    let result = 0;
    let shift = 0;
    let byte;
    do {
      if (index >= len) return coordinates;
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    // Decode lng
    result = 0;
    shift = 0;
    do {
      if (index >= len) return coordinates;
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

module.exports = { decodePolyline };
