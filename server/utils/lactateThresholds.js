/**
 * Lactate thresholds calculation (server-side port of client Testing-page/DataTable.jsx logic)
 * - No React/UI
 * - Focuses on deterministic threshold values for reports/emails
 */

// Linear interpolation helper
function interpolate(x0, y0, x1, y1, targetY) {
  if (y1 === y0) return x0;
  return x0 + ((targetY - y0) * (x1 - x0)) / (y1 - y0);
}

function filterOutliersAndCreateMonotonic(points, isPaceSport = false) {
  if (!points || points.length < 2) return points;

  const sortedPoints = [...points].sort((a, b) => {
    if (isPaceSport) return b.power - a.power; // pace: slower->faster (sec desc)
    return a.power - b.power; // bike: low->high
  });

  const filtered = [sortedPoints[0]];
  for (let i = 1; i < sortedPoints.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = sortedPoints[i];

    const intensityDiff = isPaceSport
      ? (prev.power - curr.power) / (prev.power || 1)
      : (curr.power - prev.power) / (prev.power || 1);

    const lactateDiff = (Number(curr.lactate) || 0) - (Number(prev.lactate) || 0);

    // Drop obvious outlier drops (see client logic)
    if (lactateDiff < -0.5 && Math.abs(intensityDiff) < 0.1) continue;
    filtered.push(curr);
  }

  return filtered;
}

function calculateDmax(points, isPaceSport = false) {
  if (!points || points.length < 3) return null;

  const filteredPoints = filterOutliersAndCreateMonotonic(points, isPaceSport);
  const sortedPoints = (filteredPoints && filteredPoints.length >= 3)
    ? filteredPoints
    : [...points].sort((a, b) => (isPaceSport ? (b.power - a.power) : (a.power - b.power)));

  const firstPoint = sortedPoints[0];
  const lastPoint = sortedPoints[sortedPoints.length - 1];
  if ((Number(firstPoint.power) || 0) === (Number(lastPoint.power) || 0)) return null;

  const slope = ((Number(lastPoint.lactate) || 0) - (Number(firstPoint.lactate) || 0)) /
    ((Number(lastPoint.power) || 0) - (Number(firstPoint.power) || 0));
  const intercept = (Number(firstPoint.lactate) || 0) - slope * (Number(firstPoint.power) || 0);

  let maxDistance = 0;
  let dmaxPoint = null;
  for (let i = 1; i < sortedPoints.length - 1; i++) {
    const p = sortedPoints[i];
    const x = Number(p.power) || 0;
    const y = Number(p.lactate) || 0;
    const distance = Math.abs(y - (slope * x + intercept)) / Math.sqrt(1 + slope * slope);
    if (distance > maxDistance) {
      maxDistance = distance;
      dmaxPoint = p;
    }
  }

  if (!dmaxPoint && sortedPoints.length >= 2) {
    dmaxPoint = sortedPoints[Math.floor(sortedPoints.length / 2)];
  }

  return dmaxPoint;
}

function calculateIAT(points) {
  if (!points || points.length < 3) return null;
  const sortedPoints = [...points].sort((a, b) => (a.power - b.power));

  let maxIncrease = 0;
  let iatPoint = null;
  for (let i = 1; i < sortedPoints.length; i++) {
    const dp = (Number(sortedPoints[i].power) || 0) - (Number(sortedPoints[i - 1].power) || 0);
    if (dp === 0) continue;
    const dl = (Number(sortedPoints[i].lactate) || 0) - (Number(sortedPoints[i - 1].lactate) || 0);
    const increase = dl / dp;
    if (increase > maxIncrease) {
      maxIncrease = increase;
      iatPoint = sortedPoints[i];
    }
  }
  return iatPoint;
}

function calculateDerivatives(points) {
  if (!points || points.length < 3) return { firstDerivative: [], secondDerivative: [] };

  const firstDerivative = [];
  const secondDerivative = [];

  for (let i = 1; i < points.length - 1; i++) {
    const dp = (Number(points[i + 1].power) || 0) - (Number(points[i - 1].power) || 0);
    if (dp === 0) continue;
    const d1 = ((Number(points[i + 1].lactate) || 0) - (Number(points[i - 1].lactate) || 0)) / dp;
    firstDerivative.push({ power: points[i].power, value: d1 });
  }

  for (let i = 0; i < firstDerivative.length - 1; i++) {
    const dp = (Number(firstDerivative[i + 1].power) || 0) - (Number(firstDerivative[i].power) || 0);
    if (dp === 0) continue;
    const d2 = (firstDerivative[i + 1].value - firstDerivative[i].value) / dp;
    secondDerivative.push({ power: firstDerivative[i].power, value: d2 });
  }

  return { firstDerivative, secondDerivative };
}

function calculateLogLogThreshold(results) {
  if (!results || results.length < 3) return null;
  try {
    const logData = results.map(r => ({
      logPower: Math.log(Number(r.power) || 0.000001),
      logLactate: Math.log(Number(r.lactate) || 0.000001),
      originalPoint: r
    }));

    let maxDeltaSlope = -Infinity;
    let breakpointIndex = 0;
    for (let i = 1; i < logData.length - 1; i++) {
      const slopeBefore = (logData[i].logLactate - logData[i - 1].logLactate) /
        (logData[i].logPower - logData[i - 1].logPower || 1e-9);
      const slopeAfter = (logData[i + 1].logLactate - logData[i].logLactate) /
        (logData[i + 1].logPower - logData[i].logPower || 1e-9);
      const deltaSlope = slopeAfter - slopeBefore;
      if (deltaSlope > maxDeltaSlope) {
        maxDeltaSlope = deltaSlope;
        breakpointIndex = i;
      }
    }
    return logData[breakpointIndex]?.originalPoint || null;
  } catch {
    return null;
  }
}

function findLactateThresholds(results, baseLactate, sport = 'bike') {
  if (!results || results.length < 3) {
    return { ltp1: null, ltp2: null, ltp1Point: null, ltp2Point: null };
  }

  const isPaceSport = sport === 'run' || sport === 'swim';
  const effectiveBaseLactate = Number(baseLactate) || 1.0;

  let ltp2Point = calculateDmax(results, isPaceSport);
  if (!ltp2Point) return { ltp1: null, ltp2: null, ltp1Point: null, ltp2Point: null };

  // LTP1 heuristic from client (after lactate minimum)
  const sortedForLTP1 = [...results].sort((a, b) => (isPaceSport ? (b.power - a.power) : (a.power - b.power)));
  let minLactate = Infinity;
  let minIdx = -1;
  for (let i = 0; i < sortedForLTP1.length; i++) {
    const la = Number(sortedForLTP1[i].lactate);
    if (!Number.isFinite(la)) continue;
    if (la < minLactate) {
      minLactate = la;
      minIdx = i;
    }
  }

  let ltp1Point = null;
  for (let i = Math.max(0, minIdx + 1); i < sortedForLTP1.length; i++) {
    const p = sortedForLTP1[i];
    if ((Number(p.lactate) || 0) >= effectiveBaseLactate * 0.9) {
      let stable = true;
      for (let j = i + 1; j < Math.min(i + 3, sortedForLTP1.length); j++) {
        if ((Number(sortedForLTP1[j].lactate) || 0) < (Number(p.lactate) || 0) - 0.3) {
          stable = false;
          break;
        }
      }
      if (stable) {
        ltp1Point = p;
        break;
      }
    }
  }

  if (!ltp1Point) {
    const { secondDerivative } = calculateDerivatives(results);
    const cand = secondDerivative.find(d => d.value > 0.0005);
    if (cand) {
      const match = results.find(r => Math.abs((Number(r.power) || 0) - (Number(cand.power) || 0)) < 0.1) || results[0];
      return { ltp1: Number(cand.power) || null, ltp2: Number(ltp2Point.power) || null, ltp1Point: match, ltp2Point };
    }
    ltp1Point = results[0];
  }

  // Validate ordering / swap if needed (same as client)
  if (isPaceSport) {
    if ((Number(ltp1Point.power) || 0) <= (Number(ltp2Point.power) || 0)) {
      return {
        ltp1: Number(ltp2Point.power) || null,
        ltp2: Number(ltp1Point.power) || null,
        ltp1Point: ltp2Point,
        ltp2Point: ltp1Point
      };
    }
  } else {
    if ((Number(ltp1Point.power) || 0) >= (Number(ltp2Point.power) || 0)) {
      return {
        ltp1: Number(ltp2Point.power) || null,
        ltp2: Number(ltp1Point.power) || null,
        ltp1Point: ltp2Point,
        ltp2Point: ltp1Point
      };
    }
  }

  return {
    ltp1: Number(ltp1Point.power) || null,
    ltp2: Number(ltp2Point.power) || null,
    ltp1Point,
    ltp2Point
  };
}

function calculateThresholds(testData) {
  const baseLactate = Number(testData?.baseLactate) || 0;
  const sport = testData?.sport || 'bike';
  const resultsRaw = Array.isArray(testData?.results) ? testData.results : [];

  const results = resultsRaw
    .map(r => ({
      power: Number(r.power),
      heartRate: Number(r.heartRate),
      lactate: Number(r.lactate),
      glucose: Number(r.glucose),
      RPE: Number(r.RPE),
      interval: Number(r.interval)
    }))
    .filter(r => Number.isFinite(r.power) && Number.isFinite(r.lactate));

  if (results.length < 3) return { heartRates: {}, lactates: {} };

  const sortedResults = [...results].sort((a, b) => {
    if (sport === 'run' || sport === 'swim') return b.power - a.power;
    return a.power - b.power;
  });

  const thresholds = { heartRates: {}, lactates: {} };

  const logLog = calculateLogLogThreshold(sortedResults);
  if (logLog) {
    thresholds['Log-log'] = logLog.power;
    thresholds.heartRates['Log-log'] = logLog.heartRate;
    thresholds.lactates['Log-log'] = logLog.lactate;
  }

  const iat = calculateIAT(sortedResults);
  if (iat) {
    thresholds['IAT'] = iat.power;
    thresholds.heartRates['IAT'] = iat.heartRate;
    thresholds.lactates['IAT'] = iat.lactate;
  }

  const { ltp1, ltp2, ltp1Point, ltp2Point } = findLactateThresholds(sortedResults, baseLactate, sport);
  if (ltp1 && ltp1Point) {
    thresholds['LTP1'] = ltp1;
    thresholds.heartRates['LTP1'] = ltp1Point.heartRate || null;
    thresholds.lactates['LTP1'] = ltp1Point.lactate || null;
  }
  if (ltp2 && ltp2Point) {
    thresholds['LTP2'] = ltp2;
    thresholds.heartRates['LTP2'] = ltp2Point.heartRate || null;
    thresholds.lactates['LTP2'] = ltp2Point.lactate || null;
  }

  const effectiveBase = baseLactate || 1.0;
  const targets = [
    2.0, 2.5, 3.0, 3.5,
    effectiveBase + 0.5, effectiveBase + 1.0, effectiveBase + 1.5
  ];
  const keys = [
    'OBLA 2.0', 'OBLA 2.5', 'OBLA 3.0', 'OBLA 3.5',
    'Bsln + 0.5', 'Bsln + 1.0', 'Bsln + 1.5'
  ];

  for (let i = 1; i < sortedResults.length; i++) {
    const prev = sortedResults[i - 1];
    const curr = sortedResults[i];
    for (let t = 0; t < targets.length; t++) {
      const target = targets[t];
      if ((Number(prev.lactate) || 0) <= target && (Number(curr.lactate) || 0) >= target) {
        const key = keys[t];
        thresholds[key] = interpolate(prev.power, prev.lactate, curr.power, curr.lactate, target);
        thresholds.heartRates[key] = interpolate(prev.heartRate, prev.lactate, curr.heartRate, curr.lactate, target);
        thresholds.lactates[key] = target;
      }
    }
  }

  if (ltp1 && ltp2 && ltp1 > 0 && ltp2 > 0) {
    const isPaceSport = sport === 'run' || sport === 'swim';
    const ratio = isPaceSport ? (ltp1 / ltp2) : (ltp2 / ltp1);
    if (Number.isFinite(ratio)) thresholds['LTRatio'] = ratio.toFixed(2);
  }

  return thresholds;
}

module.exports = {
  calculateThresholds
};


