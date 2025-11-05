/**
 * Advanced Workout Clustering Utilities
 * Implements interval detection, pattern extraction, DTW, and DBSCAN clustering
 */

/**
 * Detect work/rest intervals from power time series
 * Uses adaptive thresholding to detect intervals
 */
function detectIntervals(records, options = {}) {
  const {
    minIntervalDuration = 30, // minimum 30 seconds
    minRestDuration = 10, // minimum 10 seconds rest
    powerThresholdRatio = 0.3, // 30% of max power as threshold
    smoothingWindow = 5 // seconds for smoothing
  } = options;

  if (!records || records.length === 0) return [];

  // Extract power values with timestamps
  const powerData = records
    .filter(r => r.power && r.power > 0 && r.timestamp)
    .map(r => ({
      time: r.timestamp instanceof Date ? r.timestamp.getTime() : new Date(r.timestamp).getTime(),
      power: r.power
    }))
    .sort((a, b) => a.time - b.time);

  if (powerData.length < 10) return [];

  // Calculate time differences
  const timeSeries = [];
  let currentTime = 0;
  for (let i = 0; i < powerData.length; i++) {
    if (i === 0) {
      currentTime = 0;
    } else {
      const timeDiff = (powerData[i].time - powerData[i - 1].time) / 1000; // seconds
      currentTime += timeDiff;
    }
    timeSeries.push({
      time: currentTime,
      power: powerData[i].power
    });
  }

  // Smooth power data
  const smoothedPower = smoothPowerData(timeSeries, smoothingWindow);

  // Calculate threshold
  const maxPower = Math.max(...smoothedPower.map(p => p.power));
  const threshold = maxPower * powerThresholdRatio;

  // Detect intervals
  const intervals = [];
  let currentInterval = null;
  let isInWork = false;

  for (let i = 0; i < smoothedPower.length; i++) {
    const isWork = smoothedPower[i].power >= threshold;

    if (isWork && !isInWork) {
      // Start of work interval
      if (currentInterval && currentInterval.restEnd) {
        currentInterval.restDuration = smoothedPower[i].time - currentInterval.restEnd;
        if (currentInterval.restDuration >= minRestDuration) {
          intervals.push(currentInterval);
        }
      }
      currentInterval = {
        workStart: smoothedPower[i].time,
        workEnd: null,
        restStart: null,
        restEnd: null,
        workDuration: 0,
        restDuration: 0,
        avgPower: 0,
        powerValues: []
      };
      isInWork = true;
    } else if (!isWork && isInWork) {
      // End of work interval
      if (currentInterval) {
        currentInterval.workEnd = smoothedPower[i].time;
        currentInterval.workDuration = currentInterval.workEnd - currentInterval.workStart;
        currentInterval.avgPower = currentInterval.powerValues.length > 0
          ? currentInterval.powerValues.reduce((sum, p) => sum + p, 0) / currentInterval.powerValues.length
          : 0;

        if (currentInterval.workDuration >= minIntervalDuration) {
          currentInterval.restStart = smoothedPower[i].time;
        } else {
          // Too short, discard
          currentInterval = null;
        }
      }
      isInWork = false;
    }

    if (currentInterval && isInWork) {
      currentInterval.powerValues.push(smoothedPower[i].power);
    }
  }

  // Handle last interval
  if (currentInterval && currentInterval.workStart) {
    if (!currentInterval.workEnd) {
      currentInterval.workEnd = smoothedPower[smoothedPower.length - 1].time;
      currentInterval.workDuration = currentInterval.workEnd - currentInterval.workStart;
      currentInterval.avgPower = currentInterval.powerValues.length > 0
        ? currentInterval.powerValues.reduce((sum, p) => sum + p, 0) / currentInterval.powerValues.length
        : 0;
    }
    intervals.push(currentInterval);
  }

  // Filter out warm-up/cool-down (first and last intervals if too different)
  return filterWarmupCooldown(intervals);
}

/**
 * Smooth power data using moving average
 */
function smoothPowerData(timeSeries, windowSize) {
  const smoothed = [];
  for (let i = 0; i < timeSeries.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(timeSeries.length, i + Math.ceil(windowSize / 2));
    const window = timeSeries.slice(start, end);
    const avgPower = window.reduce((sum, p) => sum + p.power, 0) / window.length;
    smoothed.push({
      time: timeSeries[i].time,
      power: avgPower
    });
  }
  return smoothed;
}

/**
 * Filter warm-up and cool-down intervals
 */
function filterWarmupCooldown(intervals) {
  if (intervals.length <= 2) return intervals;

  const avgPower = intervals.reduce((sum, i) => sum + i.avgPower, 0) / intervals.length;
  const threshold = avgPower * 0.7; // 70% of average

  // Filter first interval if significantly lower
  const filtered = intervals.filter((interval, index) => {
    if (index === 0 && interval.avgPower < threshold) return false;
    if (index === intervals.length - 1 && interval.avgPower < threshold) return false;
    return true;
  });

  return filtered;
}

/**
 * Extract workout pattern from intervals
 */
function extractWorkoutPattern(intervals, ftp = null) {
  if (!intervals || intervals.length === 0) return null;

  const intervalDurations = intervals.map(i => i.workDuration);
  const intervalPowers = intervals.map(i => i.avgPower);
  const restDurations = intervals
    .filter(i => i.restDuration && i.restDuration > 0)
    .map(i => i.restDuration);

  // Normalize durations
  const meanDuration = intervalDurations.reduce((sum, d) => sum + d, 0) / intervalDurations.length;
  const normalizedDurations = intervalDurations.map(d => d / meanDuration);

  // Normalize powers
  const meanPower = intervalPowers.reduce((sum, p) => sum + p, 0) / intervalPowers.length;
  const normalizedPowers = ftp ? intervalPowers.map(p => p / ftp) : intervalPowers.map(p => p / meanPower);

  // Calculate statistics
  const stdDuration = Math.sqrt(
    intervalDurations.reduce((sum, d) => sum + Math.pow(d - meanDuration, 2), 0) / intervalDurations.length
  );

  // Work/rest ratio
  const totalWork = intervalDurations.reduce((sum, d) => sum + d, 0);
  const totalRest = restDurations.reduce((sum, d) => sum + d, 0);
  const workRestRatio = totalRest > 0 ? totalWork / totalRest : 0;

  // Intensity zone detection
  const intensityZone = detectIntensityZone(meanPower, ftp);

  // Shape vector (trend of intervals)
  const shapeVector = calculateShapeVector(normalizedPowers);

  const pattern = {
    intervalCount: intervals.length,
    intervalDurations,
    intervalPowers,
    restDurations,
    normalizedDurations,
    normalizedPowers,
    workRestRatio,
    intensityZone,
    shapeVector,
    meanDuration,
    stdDuration,
    meanPowerNorm: ftp ? meanPower / ftp : normalizedPowers.reduce((sum, p) => sum + p, 0) / normalizedPowers.length
  };

  return pattern;
}

/**
 * Detect intensity zone based on power
 */
function detectIntensityZone(meanPower, ftp) {
  if (!ftp) return 'unknown';
  const ratio = meanPower / ftp;
  if (ratio < 0.55) return 'Z1';
  if (ratio < 0.75) return 'Z2';
  if (ratio < 0.90) return 'Z3';
  if (ratio < 1.05) return 'Z4';
  if (ratio < 1.20) return 'Z5';
  return 'Z6';
}

/**
 * Calculate shape vector (trend of intervals)
 */
function calculateShapeVector(normalizedPowers) {
  if (normalizedPowers.length < 2) return [1];
  
  const shape = [];
  for (let i = 1; i < normalizedPowers.length; i++) {
    const diff = normalizedPowers[i] - normalizedPowers[i - 1];
    shape.push(diff > 0.05 ? 1 : diff < -0.05 ? -1 : 0);
  }
  return shape;
}

/**
 * Dynamic Time Warping (DTW) for comparing sequences
 */
function dtw(sequence1, sequence2) {
  if (!sequence1 || !sequence2 || sequence1.length === 0 || sequence2.length === 0) {
    return Infinity;
  }

  const n = sequence1.length;
  const m = sequence2.length;

  // Create cost matrix
  const cost = Array(n + 1).fill(null).map(() => Array(m + 1).fill(Infinity));
  cost[0][0] = 0;

  // Fill cost matrix
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const dist = Math.abs(sequence1[i - 1] - sequence2[j - 1]);
      cost[i][j] = dist + Math.min(
        cost[i - 1][j],     // insertion
        cost[i][j - 1],     // deletion
        cost[i - 1][j - 1]  // match
      );
    }
  }

  return cost[n][m];
}

/**
 * Normalize DTW distance to similarity score (0-1)
 */
function dtwSimilarity(dtwDistance, maxDistance = 10) {
  const normalized = Math.min(dtwDistance / maxDistance, 1);
  return Math.max(0, 1 - normalized);
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Calculate similarity between two workout patterns
 */
function calculateSimilarity(pattern1, pattern2) {
  if (!pattern1 || !pattern2) return 0;

  // Feature vector for cosine similarity
  const vec1 = [
    pattern1.intervalCount / 20, // normalize to 0-1 (assuming max 20 intervals)
    pattern1.meanDuration / 3600, // normalize to hours
    pattern1.stdDuration / 600, // normalize to 10 minutes
    pattern1.meanPowerNorm,
    pattern1.workRestRatio / 5 // normalize (assuming max ratio of 5)
  ];

  const vec2 = [
    pattern2.intervalCount / 20,
    pattern2.meanDuration / 3600,
    pattern2.stdDuration / 600,
    pattern2.meanPowerNorm,
    pattern2.workRestRatio / 5
  ];

  // Cosine similarity
  const cosine = cosineSimilarity(vec1, vec2);

  // DTW on normalized durations
  const dtwDurations = dtw(pattern1.normalizedDurations, pattern2.normalizedDurations);
  const dtwDurationSim = dtwSimilarity(dtwDurations, 5);

  // DTW on normalized powers
  const dtwPowers = dtw(pattern1.normalizedPowers, pattern2.normalizedPowers);
  const dtwPowerSim = dtwSimilarity(dtwPowers, 2);

  // Combined similarity score
  const similarity = 0.4 * cosine + 0.3 * dtwDurationSim + 0.3 * dtwPowerSim;

  return similarity;
}

/**
 * DBSCAN clustering algorithm
 */
function dbscan(patterns, eps = 0.25, minPts = 3) {
  if (!patterns || patterns.length === 0) return [];

  const clusters = [];
  const visited = new Set();
  const noise = new Set();

  // Calculate distance matrix
  const distances = [];
  for (let i = 0; i < patterns.length; i++) {
    distances[i] = [];
    for (let j = 0; j < patterns.length; j++) {
      if (i === j) {
        distances[i][j] = 0;
      } else {
        const similarity = calculateSimilarity(patterns[i], patterns[j]);
        distances[i][j] = 1 - similarity; // Convert similarity to distance
      }
    }
  }

  let clusterId = 0;

  for (let i = 0; i < patterns.length; i++) {
    if (visited.has(i)) continue;

    visited.add(i);
    const neighbors = getNeighbors(i, patterns, distances, eps);

    if (neighbors.length < minPts) {
      noise.add(i);
      continue;
    }

    // Create new cluster
    const cluster = {
      clusterId: `temp_cluster_${clusterId++}`, // Temporary ID, will be replaced with stable ID
      indices: [i],
      patterns: [patterns[i]]
    };

    // Expand cluster
    let j = 0;
    while (j < neighbors.length) {
      const neighbor = neighbors[j];
      
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        const neighborNeighbors = getNeighbors(neighbor, patterns, distances, eps);
        
        if (neighborNeighbors.length >= minPts) {
          neighbors.push(...neighborNeighbors);
        }
      }

      if (!cluster.indices.includes(neighbor) && !noise.has(neighbor)) {
        cluster.indices.push(neighbor);
        cluster.patterns.push(patterns[neighbor]);
      }

      j++;
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Get neighbors within eps distance
 */
function getNeighbors(pointIndex, patterns, distances, eps) {
  const neighbors = [];
  for (let i = 0; i < patterns.length; i++) {
    if (distances[pointIndex][i] <= eps) {
      neighbors.push(i);
    }
  }
  return neighbors;
}

/**
 * Generate automatic title for cluster
 */
function generateClusterTitle(cluster) {
  if (!cluster.patterns || cluster.patterns.length === 0) return 'Unknown Workout';

  // Calculate centroid
  const avgIntervalCount = cluster.patterns.reduce((sum, p) => sum + p.intervalCount, 0) / cluster.patterns.length;
  const avgDuration = cluster.patterns.reduce((sum, p) => sum + p.meanDuration, 0) / cluster.patterns.length;
  const avgPowerNorm = cluster.patterns.reduce((sum, p) => sum + p.meanPowerNorm, 0) / cluster.patterns.length;
  const avgIntervalDuration = avgDuration / avgIntervalCount;

  // Generate title based on patterns
  const reps = Math.round(avgIntervalCount);
  const intervalMinutes = Math.round(avgIntervalDuration / 60);

  if (avgIntervalDuration >= 18 * 60 && avgIntervalDuration <= 25 * 60 && reps === 3) {
    return `3×${intervalMinutes}' Tempo / Threshold`;
  }

  if (avgPowerNorm > 0.9 && reps >= 10) {
    return `VO₂max Intervals`;
  }

  if (reps >= 4 && reps <= 6 && avgIntervalDuration >= 8 * 60 && avgIntervalDuration <= 12 * 60) {
    return `${reps}×${intervalMinutes}' Threshold`;
  }

  if (reps >= 10 && reps <= 20 && avgIntervalDuration < 3 * 60) {
    return `VO₂ Repeats`;
  }

  // Fallback
  return `${reps}×${intervalMinutes}' Intervals`;
}

module.exports = {
  detectIntervals,
  extractWorkoutPattern,
  calculateSimilarity,
  dbscan,
  generateClusterTitle,
  dtw,
  cosineSimilarity
};

