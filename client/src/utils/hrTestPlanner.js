/**
 * HR-First Smart Lactate Test Planner
 * Estimates HRmax, LT1, LT2 from training data and generates HR-guided test protocol
 */

// Preprocess streams: resample, smooth, filter artifacts
export const preprocessStreams = (streams, resampleInterval = 5) => {
  if (!streams) return null;

  // Handle both formats: { time: { data: [...] } } and { time: [...] }
  const time = streams.time?.data || streams.time || [];
  const hr = streams.heartrate?.data || streams.heartrate || streams.hr?.data || streams.hr || [];
  const power = streams.watts?.data || streams.watts || streams.power?.data || streams.power || [];
  const velocity = streams.velocity_smooth?.data || streams.velocity_smooth || streams.velocity?.data || streams.velocity || [];
  const distance = streams.distance?.data || streams.distance || [];

  if (!time || time.length === 0) return null;

  // Resample to fixed interval (default 5s)
  const resampled = [];
  const startTime = time[0];
  const endTime = time[time.length - 1];
  
  for (let t = startTime; t <= endTime; t += resampleInterval) {
    // Find closest original point
    let closestIdx = 0;
    let minDiff = Math.abs(time[0] - t);
    for (let i = 1; i < time.length; i++) {
      const diff = Math.abs(time[i] - t);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    
    resampled.push({
      time: t,
      hr: hr[closestIdx] || null,
      power: power[closestIdx] || null,
      velocity: velocity[closestIdx] || null,
      distance: distance[closestIdx] || null
    });
  }

  // Smooth HR with rolling median (15s window = 3 samples at 5s interval)
  const smoothed = [];
  const windowSize = 3;
  for (let i = 0; i < resampled.length; i++) {
    const window = [];
    for (let j = Math.max(0, i - Math.floor(windowSize / 2)); 
         j <= Math.min(resampled.length - 1, i + Math.floor(windowSize / 2)); 
         j++) {
      if (resampled[j].hr !== null && resampled[j].hr > 0) {
        window.push(resampled[j].hr);
      }
    }
    
    let smoothedHR = resampled[i].hr;
    if (window.length > 0) {
      window.sort((a, b) => a - b);
      smoothedHR = window[Math.floor(window.length / 2)]; // median
    }
    
    // Filter artifacts: HR spikes (change > 15 bpm within 5s)
    if (i > 0 && smoothed[i - 1] && smoothed[i - 1].hr) {
      const hrDiff = Math.abs(smoothedHR - smoothed[i - 1].hr);
      if (hrDiff > 15) {
        // Clamp to previous value + max change
        smoothedHR = smoothed[i - 1].hr + Math.sign(smoothedHR - smoothed[i - 1].hr) * 15;
      }
    }
    
    smoothed.push({
      ...resampled[i],
      hr: smoothedHR
    });
  }

  return smoothed;
};

// Estimate HRmax from hard segments
export const estimateHRmax = (activities, days = 42, sport = null) => {
  const now = Date.now();
  const cutoffDate = now - (days * 24 * 60 * 60 * 1000);
  
  // Filter activities from last N days
  let recentActivities = activities.filter(act => {
    const actDate = new Date(act.startDate || act.date || act.start_date).getTime();
    return actDate >= cutoffDate;
  });
  
  // Filter by sport if specified
  if (sport) {
    recentActivities = recentActivities.filter(act => {
      const actSport = (act.sport || act.type || '').toLowerCase();
      if (sport === 'run') {
        return actSport.includes('run') || actSport === 'running';
      }
      if (sport === 'bike' || sport === 'ride') {
        return actSport.includes('ride') || actSport.includes('bike') || actSport.includes('cycling') || actSport === 'virtualride';
      }
      return true;
    });
  }

  if (recentActivities.length < 3) {
    // Expand to 90 days, then 180 days
    if (days >= 180) {
      // Even with 180 days, if we don't have enough, return null
      return {
        value: null,
        min: null,
        max: null,
        confidence: 'low',
        evidence: []
      };
    }
    const nextDays = days < 90 ? 90 : 180;
    const nextCutoff = now - (nextDays * 24 * 60 * 60 * 1000);
    let expandedActivities = activities.filter(act => {
      const actDate = new Date(act.startDate || act.date || act.start_date).getTime();
      return actDate >= nextCutoff;
    });
    if (sport) {
      expandedActivities = expandedActivities.filter(act => {
        const actSport = (act.sport || act.type || '').toLowerCase();
        if (sport === 'run') return actSport.includes('run') || actSport === 'running';
        if (sport === 'bike' || sport === 'ride') return actSport.includes('ride') || actSport.includes('bike') || actSport.includes('cycling') || actSport === 'virtualride';
        return true;
      });
    }
    return estimateHRmax(expandedActivities, nextDays, sport);
  }

  const allHRValues = [];
  const rolling30sMax = [];
  const evidence = [];

  recentActivities.forEach(act => {
    if (!act.streams) return;
    
    // Check if streams have heartrate data - handle both formats: { heartrate: { data: [...] } } and { heartrate: [...] }
    const hrData = act.streams.heartrate?.data || act.streams.heartrate || act.streams.hr?.data || act.streams.hr;
    if (!hrData || !Array.isArray(hrData) || hrData.length === 0) return;
    
    const processed = preprocessStreams(act.streams);
    if (!processed || processed.length < 6) return; // Need at least 30s of data

    // Identify "hard" portions: top 20% HR within activity
    const hrValues = processed.map(p => p.hr).filter(h => h && h > 0);
    if (hrValues.length === 0) return;
    
    const hrThreshold = percentile(hrValues, 80); // Top 20%
    
    // Compute rolling 30s average (6 samples at 5s interval)
    const rollingWindow = 6;
    for (let i = rollingWindow - 1; i < processed.length; i++) {
      const window = processed.slice(i - rollingWindow + 1, i + 1);
      const avgHR = window.reduce((sum, p) => sum + (p.hr || 0), 0) / window.length;
      
      // Only consider if in "hard" portion
      if (avgHR >= hrThreshold) {
        rolling30sMax.push(avgHR);
        allHRValues.push(avgHR);
      }
    }

    if (rolling30sMax.length > 0) {
      evidence.push({
        activityId: act.id || act.stravaId || act._id,
        date: act.startDate || act.date || act.start_date,
        maxRolling30s: Math.max(...rolling30sMax),
        samples: rolling30sMax.length
      });
    }
  });

  if (allHRValues.length === 0) {
    return {
      value: null,
      min: null,
      max: null,
      confidence: 'low',
      evidence: []
    };
  }

  // Compute percentiles
  const p99 = percentile(allHRValues, 99);
  const p98 = percentile(allHRValues, 98);
  const maxRolling = Math.max(...allHRValues);

  // HRmax estimate: max of rolling30s_max and p99, with conservative bias
  const hrMaxEst = Math.max(maxRolling, p99);
  
  // Range: [p98, maxRolling] padded
  const minEst = Math.max(p98 - 2, Math.min(...allHRValues));
  const maxEst = Math.min(maxRolling + 2, 220); // Cap at 220

  // Confidence based on amount of hard data
  let confidence = 'low';
  if (evidence.length >= 4 && allHRValues.length >= 50) {
    confidence = 'high';
  } else if (evidence.length >= 2 && allHRValues.length >= 20) {
    confidence = 'med';
  }

  return {
    value: Math.round(hrMaxEst),
    min: Math.round(minEst),
    max: Math.round(maxEst),
    confidence,
    evidence: evidence.slice(0, 5) // Top 5 activities
  };
};

// Estimate LT1 (Aerobic threshold) using cardiac drift
export const estimateLT1 = (activities, hrMaxEst, sport = 'run', days = 42) => {
  const now = Date.now();
  const cutoffDate = now - (days * 24 * 60 * 60 * 1000);
  
  const recentActivities = activities.filter(act => {
    const actDate = new Date(act.startDate || act.date || act.start_date).getTime();
    return actDate >= cutoffDate;
    // Filter by sport if available
  }).filter(act => {
    const actSport = (act.sport || act.type || '').toLowerCase();
    if (sport === 'run') {
      return actSport.includes('run') || actSport === 'running';
    }
    if (sport === 'bike' || sport === 'ride') {
      return actSport.includes('ride') || actSport.includes('bike') || actSport.includes('cycling') || actSport === 'virtualride';
    }
    return true;
  });

  // Expand time window if not enough activities
  if (recentActivities.length < 2) {
    if (days < 180) {
      const nextDays = days < 90 ? 90 : 180;
      const nextCutoff = now - (nextDays * 24 * 60 * 60 * 1000);
      const expandedActivities = activities.filter(act => {
        const actDate = new Date(act.startDate || act.date || act.start_date).getTime();
        return actDate >= nextCutoff;
      }).filter(act => {
        const actSport = (act.sport || act.type || '').toLowerCase();
        if (sport === 'run') {
          return actSport.includes('run') || actSport === 'running';
        }
        if (sport === 'bike' || sport === 'ride') {
          return actSport.includes('ride') || actSport.includes('bike') || actSport.includes('cycling') || actSport === 'virtualride';
        }
        return true;
      });
      if (expandedActivities.length >= 2) {
        return estimateLT1(expandedActivities, hrMaxEst, sport, nextDays);
      }
    }
    return {
      hr: { value: null, min: null, max: null },
      confidence: 'low',
      evidence: []
    };
  }

  const candidates = [];
  const driftThreshold = sport === 'run' ? 4 : 3; // 4% for run, 3% for bike

  recentActivities.forEach(act => {
    if (!act.streams) return;
    
    // Check if streams have heartrate data - handle both formats: { heartrate: { data: [...] } } and { heartrate: [...] }
    const hrData = act.streams.heartrate?.data || act.streams.heartrate || act.streams.hr?.data || act.streams.hr;
    if (!hrData || !Array.isArray(hrData) || hrData.length === 0) return;
    
    const processed = preprocessStreams(act.streams);
    if (!processed || processed.length < 240) return; // Need at least 20 min (240 samples at 5s)

    // Find steady segments >= 20 min
    const minSegmentLength = 240; // 20 min at 5s intervals
    
    for (let start = 120; start < processed.length - minSegmentLength; start += 60) {
      const segment = processed.slice(start, start + minSegmentLength);
      
      // Check pace/power variability if available
      const hasPace = segment.some(p => p.velocity !== null);
      const hasPower = segment.some(p => p.power !== null);
      
      let isSteady = false;
      if (hasPower) {
        const powerValues = segment.map(p => p.power).filter(p => p && p > 0);
        if (powerValues.length > 0) {
          const mean = powerValues.reduce((a, b) => a + b, 0) / powerValues.length;
          const std = Math.sqrt(powerValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / powerValues.length);
          const cv = mean > 0 ? (std / mean) * 100 : 100;
          isSteady = cv <= 5;
        }
      } else if (hasPace) {
        const velocityValues = segment.map(p => p.velocity).filter(v => v && v > 0);
        if (velocityValues.length > 0) {
          const mean = velocityValues.reduce((a, b) => a + b, 0) / velocityValues.length;
          const std = Math.sqrt(velocityValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / velocityValues.length);
          const cv = mean > 0 ? (std / mean) * 100 : 100;
          isSteady = cv <= 5;
        }
      } else {
        // Use HR stability: std <= 6 bpm
        const hrValues = segment.map(p => p.hr).filter(h => h && h > 0);
        if (hrValues.length > 0) {
          const mean = hrValues.reduce((a, b) => a + b, 0) / hrValues.length;
          const std = Math.sqrt(hrValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / hrValues.length);
          isSteady = std <= 6;
        }
      }

      if (!isSteady) continue;

      // Compute cardiac drift (exclude first 2 min = 24 samples)
      const firstHalf = segment.slice(24, Math.floor(segment.length / 2));
      const secondHalf = segment.slice(Math.floor(segment.length / 2));
      
      const hr1 = firstHalf.map(p => p.hr).filter(h => h && h > 0);
      const hr2 = secondHalf.map(p => p.hr).filter(h => h && h > 0);
      
      if (hr1.length === 0 || hr2.length === 0) continue;
      
      const meanHR1 = hr1.reduce((a, b) => a + b, 0) / hr1.length;
      const meanHR2 = hr2.reduce((a, b) => a + b, 0) / hr2.length;
      const drift = ((meanHR2 - meanHR1) / meanHR1) * 100;

      if (drift <= driftThreshold) {
        const meanHR = (meanHR1 + meanHR2) / 2;
        
        // Calculate average pace/power from the SAME portion where HR is measured (secondHalf, which is more stable)
        let pace = null;
        let power = null;
        
        // Use second half of segment (where HR2 is measured - more stable)
        const secondHalfSegment = segment.slice(Math.floor(segment.length / 2));
        
        if (hasPower) {
          // Calculate power from second half (where HR2 is measured)
          const powerValues = secondHalfSegment.map(p => p.power).filter(p => p && p > 0);
          if (powerValues.length > 0) {
            power = Math.round(powerValues.reduce((a, b) => a + b, 0) / powerValues.length);
          } else {
            // Fallback to whole segment
            const allPowerValues = segment.map(p => p.power).filter(p => p && p > 0);
            if (allPowerValues.length > 0) {
              power = Math.round(allPowerValues.reduce((a, b) => a + b, 0) / allPowerValues.length);
            }
          }
        } else if (hasPace) {
          // Calculate pace from second half (where HR2 is measured)
          const velocityValues = secondHalfSegment.map(p => p.velocity).filter(v => v && v > 0);
          if (velocityValues.length > 0) {
            const avgVelocity = velocityValues.reduce((a, b) => a + b, 0) / velocityValues.length; // m/s
            const paceSecPerKm = Math.round(1000 / avgVelocity);
            const mins = Math.floor(paceSecPerKm / 60);
            const secs = paceSecPerKm % 60;
            pace = `${mins}:${String(secs).padStart(2, '0')} /km`;
          } else {
            // Fallback to whole segment
            const allVelocityValues = segment.map(p => p.velocity).filter(v => v && v > 0);
            if (allVelocityValues.length > 0) {
              const avgVelocity = allVelocityValues.reduce((a, b) => a + b, 0) / allVelocityValues.length; // m/s
            const paceSecPerKm = Math.round(1000 / avgVelocity);
            const mins = Math.floor(paceSecPerKm / 60);
            const secs = paceSecPerKm % 60;
            pace = `${mins}:${String(secs).padStart(2, '0')} /km`;
            }
          }
        }
        
        candidates.push({
          meanHR: Math.round(meanHR),
          drift: drift.toFixed(1),
          duration: segment.length * 5 / 60, // minutes
          pace,
          power,
          activityId: act.id || act.stravaId || act._id,
          date: act.startDate || act.date || act.start_date
        });
      }
    }
  });

  if (candidates.length === 0) {
    return {
      hr: { value: null, min: null, max: null },
      confidence: 'low',
      evidence: []
    };
  }

  // Sort by mean HR (descending) and pick highest that meets drift threshold
  candidates.sort((a, b) => b.meanHR - a.meanHR);
  const bestCandidate = candidates[0];
  
  // Range: top 3 candidates ± padding
  const top3 = candidates.slice(0, 3);
  const minHR = Math.min(...top3.map(c => c.meanHR)) - 3;
  const maxHR = Math.max(...top3.map(c => c.meanHR)) + 3;

  // Confidence
  let confidence = 'low';
  const uniqueDays = new Set(candidates.map(c => c.date)).size;
  if (candidates.length >= 4 && uniqueDays >= 3) {
    confidence = 'high';
  } else if (candidates.length >= 2) {
    confidence = 'med';
  }

  const result = {
    hr: {
      value: bestCandidate.meanHR,
      min: Math.round(minHR),
      max: Math.round(maxHR)
    },
    confidence,
    evidence: candidates.slice(0, 5)
  };
  
  // Add pace/power from best candidate if available
  if (bestCandidate) {
    if (bestCandidate.pace) result.pace = bestCandidate.pace;
    if (bestCandidate.power) result.power = bestCandidate.power;
  }
  
  return result;
};

// Estimate LT2 (LTHR) from sustained hard segments
export const estimateLT2 = (activities, hrMaxEst, sport = 'run', days = 42) => {
  const now = Date.now();
  const cutoffDate = now - (days * 24 * 60 * 60 * 1000);
  
  const recentActivities = activities.filter(act => {
    const actDate = new Date(act.startDate || act.date || act.start_date).getTime();
    return actDate >= cutoffDate;
  }).filter(act => {
    const actSport = (act.sport || act.type || '').toLowerCase();
    if (sport === 'run') {
      return actSport.includes('run') || actSport === 'running';
    }
    if (sport === 'bike' || sport === 'ride') {
      return actSport.includes('ride') || actSport.includes('bike') || actSport.includes('cycling') || actSport === 'virtualride';
    }
    return true;
  });

  // Expand time window if not enough activities
  if (recentActivities.length === 0) {
    if (days < 180) {
      const nextDays = days < 90 ? 90 : 180;
      const nextCutoff = now - (nextDays * 24 * 60 * 60 * 1000);
      const expandedActivities = activities.filter(act => {
        const actDate = new Date(act.startDate || act.date || act.start_date).getTime();
        return actDate >= nextCutoff;
      }).filter(act => {
        const actSport = (act.sport || act.type || '').toLowerCase();
        if (sport === 'run') {
          return actSport.includes('run') || actSport === 'running';
        }
        if (sport === 'bike' || sport === 'ride') {
          return actSport.includes('ride') || actSport.includes('bike') || actSport.includes('cycling') || actSport === 'virtualride';
        }
        return true;
      });
      if (expandedActivities.length > 0) {
        return estimateLT2(expandedActivities, hrMaxEst, sport, nextDays);
      }
    }
    return {
      hr: { value: null, min: null, max: null },
      confidence: 'low',
      evidence: []
    };
  }

  const minDuration = sport === 'run' ? 1200 : 1800; // 20 min run, 30 min bike (in seconds)
  const candidates = [];

  recentActivities.forEach(act => {
    if (!act.streams) return;
    
    // Check if streams have heartrate data - handle both formats: { heartrate: { data: [...] } } and { heartrate: [...] }
    const hrData = act.streams.heartrate?.data || act.streams.heartrate || act.streams.hr?.data || act.streams.hr;
    if (!hrData || !Array.isArray(hrData) || hrData.length === 0) return;
    
    const processed = preprocessStreams(act.streams);
    if (!processed || processed.length < minDuration / 5) return; // Need enough samples

    // Ignore first 10 min (warm-up)
    const warmupEnd = 120; // 10 min = 120 samples at 5s
    
    // Find best sustained hard segment
    const segmentLength = sport === 'run' ? 240 : 360; // 20 min run, 30 min bike
    
    for (let start = warmupEnd; start <= processed.length - segmentLength; start += 60) {
      const segment = processed.slice(start, start + segmentLength);
      
      // Check HR coverage >= 80%
      const hrValues = segment.map(p => p.hr).filter(h => h && h > 0);
      const hrCoverage = hrValues.length / segment.length;
      if (hrCoverage < 0.8) continue;

      // Check HR slope (should be small for quasi-steady)
      const times = segment.map((p, i) => i * 5); // seconds
      const hrData = segment.map(p => p.hr).filter((h, i) => h && h > 0);
      const timeData = times.filter((t, i) => segment[i].hr && segment[i].hr > 0);
      
      if (hrData.length < 10) continue;
      
      // Simple linear regression for slope
      const n = hrData.length;
      const sumX = timeData.reduce((a, b) => a + b, 0);
      const sumY = hrData.reduce((a, b) => a + b, 0);
      const sumXY = timeData.reduce((sum, t, i) => sum + t * hrData[i], 0);
      const sumX2 = timeData.reduce((sum, t) => sum + t * t, 0);
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const slopeBpmPerMin = slope * 60; // Convert to bpm/min
      
      if (slopeBpmPerMin > 0.25) continue; // Too much drift

      // Use last 15-20 min of segment for LTHR
      const lastPortion = segment.slice(-180); // Last 15 min (180 samples)
      const lastHR = lastPortion.map(p => p.hr).filter(h => h && h > 0);
      
      if (lastHR.length === 0) continue;
      
      const meanLTHR = lastHR.reduce((a, b) => a + b, 0) / lastHR.length;
      
      // Ensure segment is "hard" enough - HR should be at least 85% of HRmax estimate for LT2
      // Also ensure it's higher than typical LT1 (if HRmax is available, LT2 should be ~85-92% of HRmax)
      if (hrMaxEst?.value) {
        const minLT2HR = hrMaxEst.value * 0.85; // At least 85% of HRmax
        if (meanLTHR < minLT2HR) {
          continue; // Skip segments that are too easy for LT2
        }
      }
      
      // Calculate pace/power from LAST PORTION (where LTHR is measured) - this is more accurate
      let pace = null;
      let power = null;
      
      // Check for power data in last portion
      const lastPowerValues = lastPortion.map(p => p.power).filter(p => p && p > 0);
      if (lastPowerValues.length > 0) {
        const avgPower = lastPowerValues.reduce((a, b) => a + b, 0) / lastPowerValues.length;
        power = Math.round(avgPower);
      }
      
      // Check for velocity data in last portion (for running)
      if (!power) {
        const lastVelocityValues = lastPortion.map(p => p.velocity).filter(v => v && v > 0);
        if (lastVelocityValues.length > 0) {
          const avgVelocity = lastVelocityValues.reduce((a, b) => a + b, 0) / lastVelocityValues.length; // m/s
        if (sport === 'run') {
            const paceSecPerKm = Math.round(1000 / avgVelocity);
          const mins = Math.floor(paceSecPerKm / 60);
          const secs = paceSecPerKm % 60;
          pace = `${mins}:${String(secs).padStart(2, '0')} /km`;
          }
        }
      }
      
      // Fallback: use whole segment if last portion doesn't have data
      if (!power && !pace) {
        const segmentPowerValues = segment.map(p => p.power).filter(p => p && p > 0);
        if (segmentPowerValues.length > 0) {
          const avgPower = segmentPowerValues.reduce((a, b) => a + b, 0) / segmentPowerValues.length;
          power = Math.round(avgPower);
        } else {
          const segmentVelocityValues = segment.map(p => p.velocity).filter(v => v && v > 0);
          if (segmentVelocityValues.length > 0) {
            const avgVelocity = segmentVelocityValues.reduce((a, b) => a + b, 0) / segmentVelocityValues.length; // m/s
            if (sport === 'run') {
              const paceSecPerKm = Math.round(1000 / avgVelocity);
              const mins = Math.floor(paceSecPerKm / 60);
              const secs = paceSecPerKm % 60;
              pace = `${mins}:${String(secs).padStart(2, '0')} /km`;
            }
          }
        }
      }
      
      candidates.push({
        lthr: Math.round(meanLTHR),
        duration: segment.length * 5 / 60,
        slope: slopeBpmPerMin.toFixed(2),
        pace,
        power,
        activityId: act.id || act.stravaId || act._id,
        date: act.startDate || act.date || act.start_date
      });
    }
  });

  if (candidates.length === 0) {
    return {
      hr: { value: null, min: null, max: null },
      confidence: 'low',
      evidence: []
    };
  }

  // Sort by LTHR (descending) and pick best
  candidates.sort((a, b) => b.lthr - a.lthr);
  
  // Filter out candidates that are too low (below typical LT2 range)
  // LT2 should be higher than LT1, so filter candidates that are likely LT1 or below
  // If hrMaxEst is available, LT2 should be at least 80% of HRmax
  const filteredCandidates = hrMaxEst?.value 
    ? candidates.filter(c => c.lthr >= hrMaxEst.value * 0.80)
    : candidates;
  
  // If no candidates found after filtering, use original candidates but log warning
  const candidatesToUse = filteredCandidates.length > 0 ? filteredCandidates : candidates;
  if (filteredCandidates.length === 0 && candidates.length > 0 && hrMaxEst?.value) {
    console.warn(`[estimateLT2] All ${candidates.length} candidates filtered out (below 80% HRmax). Using best candidate anyway.`);
  }
  
  if (candidatesToUse.length === 0) {
    return {
      hr: { value: null, min: null, max: null },
      confidence: 'low',
      evidence: []
    };
  }
  
  const bestCandidate = candidatesToUse[0];
  
  // Range: ±(3-6 bpm) depending on stability
  const stability = candidatesToUse.length >= 3 
    ? Math.abs(candidatesToUse[0].lthr - candidatesToUse[2].lthr) 
    : 10;
  const range = stability < 5 ? 3 : 6;

  // Confidence
  let confidence = 'low';
  const uniqueDays = new Set(candidatesToUse.map(c => c.date)).size;
  if (candidatesToUse.length >= 3 && uniqueDays >= 2) {
    confidence = 'high';
  } else if (candidatesToUse.length >= 1) {
    confidence = 'med';
  }

  // Calculate min and max correctly (min should be lower than max)
  const minHR = Math.max(bestCandidate.lthr - range, 0);
  const maxHR = Math.min(bestCandidate.lthr + range, hrMaxEst?.value || 220);
  
  // Ensure min < max
  const finalMin = Math.min(minHR, maxHR);
  const finalMax = Math.max(minHR, maxHR);

  const result = {
    hr: {
      value: bestCandidate.lthr,
      min: finalMin,
      max: finalMax
    },
    confidence,
    evidence: candidatesToUse.slice(0, 5)
  };
  
  // Add pace/power from best candidate if available
  if (bestCandidate) {
    if (bestCandidate.pace) result.pace = bestCandidate.pace;
    if (bestCandidate.power) result.power = bestCandidate.power;
  }
  
  return result;
};

// Fit HR -> intensity model (piecewise linear)
export const fitHRIntensityModel = (activities, sport) => {
  const segments = [];
  
  // Filter activities by sport first
  const filteredActivities = activities.filter(act => {
    const actSport = (act.sport || act.type || '').toLowerCase();
    if (sport === 'run') {
      return actSport.includes('run') || actSport === 'running';
    }
    if (sport === 'bike' || sport === 'ride') {
      return actSport.includes('ride') || actSport.includes('bike') || actSport.includes('cycling') || actSport === 'virtualride';
    }
    return true;
  });
  
  filteredActivities.forEach(act => {
    if (!act.streams || !act.streams.heartrate) return;
    
    const processed = preprocessStreams(act.streams);
    if (!processed || processed.length < 120) return; // At least 10 min
    
    // Extract steady segments (5 min windows)
    for (let start = 60; start < processed.length - 60; start += 30) {
      const segment = processed.slice(start, start + 60); // 5 min
      
      const hrValues = segment.map(p => p.hr).filter(h => h && h > 0);
      if (hrValues.length < 40) continue;
      
      const meanHR = hrValues.reduce((a, b) => a + b, 0) / hrValues.length;
      const hrStd = Math.sqrt(hrValues.reduce((sum, val) => sum + Math.pow(val - meanHR, 2), 0) / hrValues.length);
      
      if (hrStd > 5) continue; // Too variable
      
      let intensity = null;
      if (sport === 'bike' || sport === 'ride') {
        const powerValues = segment.map(p => p.power).filter(p => p && p > 0);
        if (powerValues.length > 0) {
          intensity = powerValues.reduce((a, b) => a + b, 0) / powerValues.length;
        }
      } else if (sport === 'run') {
        const velocityValues = segment.map(p => p.velocity).filter(v => v && v > 0);
        if (velocityValues.length > 0) {
          intensity = velocityValues.reduce((a, b) => a + b, 0) / velocityValues.length; // m/s
        }
      }
      
      if (intensity && intensity > 0) {
        segments.push({ hr: meanHR, intensity });
      }
    }
  });

  if (segments.length < 5) return null;

  // Simple piecewise linear: fit two segments (below/above ~75% HRmax)
  segments.sort((a, b) => a.hr - b.hr);
  
  return {
    predict: (targetHR) => {
      // Find closest segments
      const closest = segments.reduce((best, seg) => {
        const diff = Math.abs(seg.hr - targetHR);
        return !best || diff < best.diff ? { seg, diff } : best;
      }, null);
      
      if (!closest) return null;
      
      // Linear interpolation with nearby points
      const idx = segments.findIndex(s => s === closest.seg);
      const window = segments.slice(Math.max(0, idx - 2), Math.min(segments.length, idx + 3));
      
      if (window.length < 2) return closest.seg.intensity;
      
      // Simple linear fit
      const n = window.length;
      const sumX = window.reduce((sum, s) => sum + s.hr, 0);
      const sumY = window.reduce((sum, s) => sum + s.intensity, 0);
      const sumXY = window.reduce((sum, s) => sum + s.hr * s.intensity, 0);
      const sumX2 = window.reduce((sum, s) => sum + s.hr * s.hr, 0);
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      
      const predicted = slope * targetHR + intercept;
      return predicted > 0 ? predicted : null;
    }
  };
};

// Generate HR-guided test protocol
export const generateHRProtocol = (hrMax, lt1, lt2, sport = 'run', activities = []) => {
  if (!hrMax?.value || !lt1?.hr?.value || !lt2?.hr?.value) {
    return null;
  }

  // Determine stage duration
  let stageDurationMin = 4;
  // Could check HR noise here, defaulting to 4 min for now

  // Start HR
  const startHROffset = sport === 'run' ? 15 : 12;
  const startHR = Math.max(
    lt1.hr.value - startHROffset,
    Math.round(hrMax.value * 0.55) // At least 55% of HRmax
  );

  // HR step
  const stepHR = stageDurationMin === 4 ? 6 : 5;

  // End condition
  const endHR = Math.min(
    lt2.hr.value + 10,
    Math.round(hrMax.value * 0.95)
  );

  // Build stages
  const stages = [];
  let currentHR = startHR;
  let stageNum = 1;

  // At least 2 stages below LT1
  while (currentHR < lt1.hr.value - 5 && stageNum <= 10) {
    stages.push({
      stage: stageNum,
      targetHR: currentHR,
      suggestedPace: null,
      suggestedPower: null,
      notes: `Below LT1 (${lt1.hr.value} bpm)`
    });
    currentHR += stepHR;
    stageNum++;
  }

  // 2 stages spanning LT1
  for (let i = 0; i < 2 && currentHR < lt2.hr.value - 5 && stageNum <= 10; i++) {
    stages.push({
      stage: stageNum,
      targetHR: currentHR,
      suggestedPace: null,
      suggestedPower: null,
      notes: `Near LT1 (${lt1.hr.value} bpm)`
    });
    currentHR += stepHR;
    stageNum++;
  }

  // 2 stages spanning LT2
  for (let i = 0; i < 2 && currentHR <= endHR && stageNum <= 10; i++) {
    stages.push({
      stage: stageNum,
      targetHR: currentHR,
      suggestedPace: null,
      suggestedPower: null,
      notes: `Near LT2 (${lt2.hr.value} bpm)`
    });
    currentHR += stepHR;
    stageNum++;
  }

  // 1-2 stages above LT2
  while (currentHR <= endHR && stageNum <= 10) {
    stages.push({
      stage: stageNum,
      targetHR: currentHR,
      suggestedPace: null,
      suggestedPower: null,
      notes: `Above LT2 (${lt2.hr.value} bpm)`
    });
    currentHR += stepHR;
    stageNum++;
  }

  // Map HR to pace/power if model available
  const model = fitHRIntensityModel(activities, sport);
  if (model) {
    stages.forEach(stage => {
      const intensity = model.predict(stage.targetHR);
      if (intensity && intensity > 0) {
        if (sport === 'run') {
          // Convert m/s to pace (sec/km)
          const paceSecPerKm = Math.round(1000 / intensity);
          const mins = Math.floor(paceSecPerKm / 60);
          const secs = paceSecPerKm % 60;
          stage.suggestedPace = `${mins}:${String(secs).padStart(2, '0')} /km`;
        } else if (sport === 'bike' || sport === 'ride') {
          stage.suggestedPower = Math.round(intensity);
        }
      }
    });
  }

  return {
    sport,
    stageDurationMin,
    stages,
    stopRules: [
      `Stop when HR >= ${endHR} bpm`,
      `Stop when RPE >= 8/10`,
      `Stop if performance deteriorates significantly`
    ]
  };
};

// Main function: generate complete HR-first test plan
export const generateHRTestPlan = async (activities, sport = 'run') => {
  if (!activities || activities.length === 0) {
    return {
      hrMax: { value: null, confidence: 'low', evidence: [] },
      lt1: { hr: { value: null }, confidence: 'low', evidence: [] },
      lt2: { hr: { value: null }, confidence: 'low', evidence: [] },
      protocol: null
    };
  }

  // Filter activities with HR streams - handle both formats: { heartrate: { data: [...] } } and { heartrate: [...] }
  let activitiesWithHR = activities.filter(act => {
    if (!act.streams) return false;
    const hrData = act.streams.heartrate?.data || act.streams.heartrate || act.streams.hr?.data || act.streams.hr;
    return hrData && Array.isArray(hrData) && hrData.length > 0;
  });
  
  console.log(`[generateHRTestPlan] Total activities with HR streams: ${activitiesWithHR.length}`, 
    activitiesWithHR.map(a => ({ sport: a.sport || a.type, id: a.stravaId || a.id }))
  );
  
  // Filter by sport if specified
  if (sport) {
    const beforeFilter = activitiesWithHR.length;
    activitiesWithHR = activitiesWithHR.filter(act => {
      const actSport = (act.sport || act.type || '').toLowerCase();
      if (sport === 'run') {
        return actSport.includes('run') || actSport === 'running';
      }
      if (sport === 'bike' || sport === 'ride') {
        return actSport.includes('ride') || actSport.includes('bike') || actSport.includes('cycling') || actSport === 'virtualride';
      }
      return true;
    });
    console.log(`[generateHRTestPlan] After filtering for ${sport}: ${activitiesWithHR.length} activities (was ${beforeFilter})`);
  }

  if (activitiesWithHR.length === 0) {
    return {
      hrMax: { value: null, confidence: 'low', evidence: [] },
      lt1: { hr: { value: null }, confidence: 'low', evidence: [] },
      lt2: { hr: { value: null }, confidence: 'low', evidence: [] },
      protocol: null
    };
  }

  // Estimate HRmax (with sport filtering)
  const hrMax = estimateHRmax(activitiesWithHR, 42, sport);

  // Estimate LT1
  const lt1 = estimateLT1(activitiesWithHR, hrMax, sport);

  // Estimate LT2
  let lt2 = estimateLT2(activitiesWithHR, hrMax, sport);
  
  // Ensure LT2 is higher than LT1 (minimum 8-12 bpm difference)
  if (lt1?.hr?.value) {
    const minLT2HR = lt1.hr.value + (sport === 'run' ? 10 : 8); // Run: +10 bpm, Bike: +8 bpm
    const maxLT2HR = hrMax?.value ? Math.round(hrMax.value * 0.92) : null; // Typically LT2 is ~85-92% of HRmax
    
    if (!lt2?.hr?.value) {
      // If LT2 not found, estimate from LT1 and HRmax
      const estimatedLT2 = maxLT2HR ? Math.min(maxLT2HR, minLT2HR + 5) : minLT2HR;
      lt2 = {
        hr: {
          value: estimatedLT2,
          min: Math.max(estimatedLT2 - 5, lt1.hr.value + 5),
          max: Math.min(estimatedLT2 + 5, hrMax?.value || 220)
        },
        confidence: 'low',
        evidence: []
      };
    } else if (lt2.hr.value <= lt1.hr.value) {
      // If LT2 is too low or equal to LT1, adjust it
      const adjustedValue = maxLT2HR ? Math.min(maxLT2HR, minLT2HR + 5) : minLT2HR;
      lt2.hr.value = adjustedValue;
      // Ensure min < max
      const newMin = Math.max(adjustedValue - 5, lt1.hr.value + 5);
      const newMax = Math.min(adjustedValue + 5, hrMax?.value || 220);
      lt2.hr.min = Math.min(newMin, newMax);
      lt2.hr.max = Math.max(newMin, newMax);
      lt2.confidence = 'low'; // Lower confidence if adjusted
      console.warn(`[HRTestPlan] LT2 HR (${lt2.hr.value}) <= LT1 HR (${lt1.hr.value}), adjusted to ${adjustedValue} bpm`);
    } else if (lt2.hr.value < minLT2HR) {
      // If LT2 is only slightly above LT1, adjust it
      const adjustedValue = maxLT2HR ? Math.min(maxLT2HR, minLT2HR + 5) : minLT2HR;
      if (adjustedValue > lt2.hr.value) {
        lt2.hr.value = adjustedValue;
        // Ensure min < max
        const newMin = Math.max(adjustedValue - 5, lt1.hr.value + 5);
        const newMax = Math.min(adjustedValue + 5, hrMax?.value || 220);
        lt2.hr.min = Math.min(newMin, newMax);
        lt2.hr.max = Math.max(newMin, newMax);
        lt2.confidence = lt2.confidence === 'high' ? 'med' : 'low';
        console.warn(`[HRTestPlan] LT2 HR (${lt2.hr.value}) too close to LT1 HR (${lt1.hr.value}), adjusted to ${adjustedValue} bpm`);
      }
    } else {
      // LT2 is valid, but ensure min < max
      if (lt2.hr.min > lt2.hr.max) {
        const temp = lt2.hr.min;
        lt2.hr.min = lt2.hr.max;
        lt2.hr.max = temp;
        console.warn(`[HRTestPlan] Fixed LT2 min/max: min was ${temp}, max was ${lt2.hr.max}, swapped`);
      }
    }
  }

  // Validate and fix power/pace values - LT2 must have higher power/pace than LT1
  if (lt1?.hr?.value && lt2?.hr?.value && lt1.hr.value < lt2.hr.value) {
    // Build HR->intensity model to estimate correct power/pace if values are inconsistent
    const model = fitHRIntensityModel(activitiesWithHR, sport);
    
    if (model) {
      // If LT2 power is lower than LT1 power (or missing), estimate from HR using model
      if (sport === 'bike' || sport === 'ride') {
        if (lt2.power && lt1.power && lt2.power <= lt1.power) {
          // LT2 power should be higher - estimate from HR using model
          const estimatedPower = model.predict(lt2.hr.value);
          if (estimatedPower && estimatedPower > lt1.power) {
            console.warn(`[HRTestPlan] LT2 power (${lt2.power}W) <= LT1 power (${lt1.power}W), using model estimate: ${Math.round(estimatedPower)}W`);
            lt2.power = Math.round(estimatedPower);
          } else if (lt1.power) {
            // Fallback: LT2 power should be at least 5-10% higher than LT1
            lt2.power = Math.round(lt1.power * 1.08);
            console.warn(`[HRTestPlan] LT2 power adjusted to ${lt2.power}W (8% above LT1)`);
          }
        } else if (!lt2.power && lt1.power) {
          // LT2 power missing - estimate from HR
          const estimatedPower = model.predict(lt2.hr.value);
          if (estimatedPower && estimatedPower > lt1.power) {
            lt2.power = Math.round(estimatedPower);
          } else {
            lt2.power = Math.round(lt1.power * 1.08);
          }
        }
      } else if (sport === 'run') {
        // For running, check pace (lower pace = faster = higher intensity)
        // LT2 should have lower pace (faster) than LT1
        if (lt2.pace && lt1.pace) {
          // Parse pace strings (e.g., "4:30 /km")
          const parsePace = (paceStr) => {
            if (!paceStr) return null;
            const match = paceStr.match(/(\d+):(\d+)/);
            if (!match) return null;
            return parseInt(match[1]) * 60 + parseInt(match[2]);
          };
          const lt1PaceSec = parsePace(lt1.pace);
          const lt2PaceSec = parsePace(lt2.pace);
          if (lt1PaceSec && lt2PaceSec && lt2PaceSec >= lt1PaceSec) {
            // LT2 pace is slower or equal - estimate from HR
            const estimatedVelocity = model.predict(lt2.hr.value);
            if (estimatedVelocity && estimatedVelocity > 0) {
              const paceSecPerKm = Math.round(1000 / estimatedVelocity);
              const mins = Math.floor(paceSecPerKm / 60);
              const secs = paceSecPerKm % 60;
              lt2.pace = `${mins}:${String(secs).padStart(2, '0')} /km`;
              console.warn(`[HRTestPlan] LT2 pace adjusted using model: ${lt2.pace}`);
            }
          }
        } else if (!lt2.pace && lt1.pace) {
          // LT2 pace missing - estimate from HR
          const estimatedVelocity = model.predict(lt2.hr.value);
          if (estimatedVelocity && estimatedVelocity > 0) {
            const paceSecPerKm = Math.round(1000 / estimatedVelocity);
            const mins = Math.floor(paceSecPerKm / 60);
            const secs = paceSecPerKm % 60;
            lt2.pace = `${mins}:${String(secs).padStart(2, '0')} /km`;
          }
        }
      }
    } else {
      // No model available - use simple heuristic
      if (sport === 'bike' || sport === 'ride') {
        if (lt2.power && lt1.power && lt2.power <= lt1.power) {
          // LT2 power should be at least 5-10% higher than LT1
          lt2.power = Math.round(lt1.power * 1.08);
          console.warn(`[HRTestPlan] LT2 power adjusted to ${lt2.power}W (8% above LT1, no model available)`);
        }
      }
    }
  }

  // Generate protocol
  const protocol = generateHRProtocol(hrMax, lt1, lt2, sport, activitiesWithHR);

  return {
    hrMax,
    lt1,
    lt2,
    protocol
  };
};

// Helper: percentile calculation
const percentile = (arr, p) => {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};
