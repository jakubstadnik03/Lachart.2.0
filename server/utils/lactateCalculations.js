/**
 * Core lactate analysis calculations
 * Based on the detailed specification provided
 */

/**
 * Calculate dLa/dt (lactate production rate) during work
 * @param {number} lactateStart - Lactate at start of work (mmol/L)
 * @param {number} lactateEnd - Lactate at end of work (mmol/L)
 * @param {number} workDurationS - Work duration in seconds
 * @returns {number} dLa/dt in mmol/L/min
 */
function calculateDLADt(lactateStart, lactateEnd, workDurationS) {
  const workDurationMin = workDurationS / 60.0;
  return (lactateEnd - lactateStart) / Math.max(workDurationMin, 1e-6);
}

/**
 * Fit exponential decay to lactate clearance data
 * L(t) = L_end + (L0 - L_end) * e^(-t/tau)
 * @param {Array} points - Array of {t_s: number, L: number} objects
 * @returns {Object} {tau: number, L_end: number, r_squared: number}
 */
function fitExponentialDecay(points) {
  if (points.length < 3) {
    return { tau: 0, L_end: 0, r_squared: 0 };
  }

  // Sort points by time
  const sortedPoints = points.sort((a, b) => a.t_s - b.t_s);
  
  // Estimate L_end as the last point
  const L_end = sortedPoints[sortedPoints.length - 1].L;
  
  // Linear regression on log-transformed data
  // log(L - L_end) = log(L0 - L_end) - t/tau
  let sum_t = 0, sum_log = 0, sum_t_log = 0, sum_t2 = 0;
  let n = 0;
  
  for (const point of sortedPoints) {
    if (point.L > L_end) {
      const t = point.t_s;
      const log_val = Math.log(point.L - L_end);
      sum_t += t;
      sum_log += log_val;
      sum_t_log += t * log_val;
      sum_t2 += t * t;
      n++;
    }
  }
  
  if (n < 2) {
    return { tau: 0, L_end, r_squared: 0 };
  }
  
  // Calculate tau from linear regression
  const tau = (n * sum_t_log - sum_t * sum_log) / (sum_t * sum_t - n * sum_t2);
  
  // Calculate R-squared
  let ss_res = 0, ss_tot = 0;
  const mean_log = sum_log / n;
  
  for (const point of sortedPoints) {
    if (point.L > L_end) {
      const t = point.t_s;
      const log_val = Math.log(point.L - L_end);
      const predicted = sum_log / n - tau * (t - sum_t / n);
      ss_res += Math.pow(log_val - predicted, 2);
      ss_tot += Math.pow(log_val - mean_log, 2);
    }
  }
  
  const r_squared = ss_tot > 0 ? 1 - (ss_res / ss_tot) : 0;
  
  return {
    tau: Math.abs(tau), // Ensure positive tau
    L_end,
    r_squared
  };
}

/**
 * Calculate half-life (t½) from tau
 * @param {number} tau - Time constant
 * @returns {number} Half-life in seconds
 */
function calculateTHalf(tau) {
  return tau * Math.log(2);
}

/**
 * Calculate time to reach target lactate in rest
 * @param {number} L0 - Current lactate (mmol/L)
 * @param {number} L_end - Resting lactate (mmol/L)
 * @param {number} tau - Time constant
 * @param {number} L_target - Target lactate (mmol/L)
 * @returns {number} Time in seconds
 */
function timeToTarget(L0, L_end, tau, L_target) {
  if (L_target <= L_end || L0 <= L_end) {
    return 0;
  }
  
  const ratio = (L_target - L_end) / Math.max(L0 - L_end, 1e-9);
  return ratio > 0 ? tau * Math.log(1 / ratio) : 0;
}

/**
 * Calculate Area Under Curve (AUC) using trapezoidal rule
 * @param {Array} points - Array of {t_s: number, L: number} objects
 * @returns {number} AUC in mmol*min
 */
function calculateAUC(points) {
  if (points.length < 2) return 0;
  
  const sortedPoints = points.sort((a, b) => a.t_s - b.t_s);
  let auc = 0;
  
  for (let i = 1; i < sortedPoints.length; i++) {
    const dt = (sortedPoints[i].t_s - sortedPoints[i-1].t_s) / 60; // Convert to minutes
    const avgL = (sortedPoints[i].L + sortedPoints[i-1].L) / 2;
    auc += dt * avgL;
  }
  
  return auc;
}

/**
 * Calculate clearance rate (mmol/L/min)
 * @param {number} L_start - Lactate at start of rest
 * @param {number} L_end - Lactate at end of rest
 * @param {number} restDurationS - Rest duration in seconds
 * @returns {number} Clearance rate in mmol/L/min
 */
function calculateClearanceRate(L_start, L_end, restDurationS) {
  const restDurationMin = restDurationS / 60.0;
  return (L_start - L_end) / Math.max(restDurationMin, 1e-6);
}

/**
 * Evaluate lactate zone (under/ok/over target)
 * @param {number} actualLactate - Measured lactate
 * @param {number} targetMin - Target minimum
 * @param {number} targetMax - Target maximum
 * @returns {string} 'under', 'ok', or 'over'
 */
function evaluateLactateZone(actualLactate, targetMin, targetMax) {
  if (actualLactate < targetMin) return 'under';
  if (actualLactate > targetMax) return 'over';
  return 'ok';
}

/**
 * Generate training recommendations based on metrics
 * @param {Array} intervalMetrics - Array of interval metrics
 * @returns {Array} Array of recommendation strings
 */
function generateRecommendations(intervalMetrics) {
  const recommendations = [];
  
  if (!intervalMetrics || !Array.isArray(intervalMetrics) || intervalMetrics.length === 0) {
    return ['No interval data available for recommendations'];
  }
  
  // Check for high dLa/dt
  const highDLADt = intervalMetrics.filter(metric => 
    metric && metric.dLaDtMmolPerMin && metric.dLaDtMmolPerMin > 0.8
  ).length;
  
  if (highDLADt > intervalMetrics.length * 0.5) {
    recommendations.push('Reduce power by 10-20W for next session - high lactate production rate');
  }
  
  // Check for short t½
  const shortTHalf = intervalMetrics.filter(metric => 
    metric && metric.tHalfS && metric.tHalfS < 60
  ).length;
  
  if (shortTHalf > intervalMetrics.length * 0.3) {
    recommendations.push('Consider adding 1 interval - good lactate clearance');
  }
  
  // Check for high end-work lactate
  const highEndWork = intervalMetrics.filter(metric => 
    metric && metric.lactateEndWork && metric.lactateEndWork > 8
  ).length;
  
  if (highEndWork >= 2) {
    recommendations.push('Reduce intensity or extend rest periods to L<3.0 mmol/L');
  }
  
  return recommendations;
}

module.exports = {
  calculateDLADt,
  fitExponentialDecay,
  calculateTHalf,
  timeToTarget,
  calculateAUC,
  calculateClearanceRate,
  evaluateLactateZone,
  generateRecommendations
};
