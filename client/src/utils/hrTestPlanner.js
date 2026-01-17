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
export const estimateHRmax = (activities, days = 42) => {
  const now = Date.now();
  const cutoffDate = now - (days * 24 * 60 * 60 * 1000);
  
  // Filter activities from last N days
  const recentActivities = activities.filter(act => {
    const actDate = new Date(act.startDate || act.date || act.start_date).getTime();
    return actDate >= cutoffDate;
  });

  if (recentActivities.length < 3) {
    // Expand to 90 days if not enough data
    const cutoff90 = now - (90 * 24 * 60 * 60 * 1000);
    return estimateHRmax(activities.filter(act => {
      const actDate = new Date(act.startDate || act.date || act.start_date).getTime();
      return actDate >= cutoff90;
    }), 90);
  }

  const allHRValues = [];
  const rolling30sMax = [];
  const evidence = [];

  recentActivities.forEach(act => {
    if (!act.streams || !act.streams.heartrate) return;
    
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
    if (sport === 'run') return actSport.includes('run');
    if (sport === 'bike' || sport === 'ride') return actSport.includes('ride') || actSport.includes('bike');
    return true;
  });

  if (recentActivities.length < 2) {
    return {
      hr: { value: null, min: null, max: null },
      confidence: 'low',
      evidence: []
    };
  }

  const candidates = [];
  const driftThreshold = sport === 'run' ? 4 : 3; // 4% for run, 3% for bike

  recentActivities.forEach(act => {
    if (!act.streams || !act.streams.heartrate) return;
    
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
        candidates.push({
          meanHR: Math.round(meanHR),
          drift: drift.toFixed(1),
          duration: segment.length * 5 / 60, // minutes
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

  return {
    hr: {
      value: bestCandidate.meanHR,
      min: Math.round(minHR),
      max: Math.round(maxHR)
    },
    confidence,
    evidence: candidates.slice(0, 5)
  };
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
    if (sport === 'run') return actSport.includes('run');
    if (sport === 'bike' || sport === 'ride') return actSport.includes('ride') || actSport.includes('bike');
    return true;
  });

  if (recentActivities.length === 0) {
    return {
      hr: { value: null, min: null, max: null },
      confidence: 'low',
      evidence: []
    };
  }

  const minDuration = sport === 'run' ? 1200 : 1800; // 20 min run, 30 min bike (in seconds)
  const candidates = [];

  recentActivities.forEach(act => {
    if (!act.streams || !act.streams.heartrate) return;
    
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
      
      // Also check intensity if available
      let intensity = null;
      if (segment.some(p => p.power)) {
        const powerValues = segment.map(p => p.power).filter(p => p && p > 0);
        if (powerValues.length > 0) {
          intensity = powerValues.reduce((a, b) => a + b, 0) / powerValues.length;
        }
      } else if (segment.some(p => p.velocity)) {
        const velocityValues = segment.map(p => p.velocity).filter(v => v && v > 0);
        if (velocityValues.length > 0) {
          intensity = velocityValues.reduce((a, b) => a + b, 0) / velocityValues.length;
        }
      }

      candidates.push({
        lthr: Math.round(meanLTHR),
        duration: segment.length * 5 / 60,
        slope: slopeBpmPerMin.toFixed(2),
        intensity,
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
  const bestCandidate = candidates[0];
  
  // Range: ±(3-6 bpm) depending on stability
  const stability = candidates.length >= 3 
    ? Math.abs(candidates[0].lthr - candidates[2].lthr) 
    : 10;
  const range = stability < 5 ? 3 : 6;

  // Confidence
  let confidence = 'low';
  const uniqueDays = new Set(candidates.map(c => c.date)).size;
  if (candidates.length >= 3 && uniqueDays >= 2) {
    confidence = 'high';
  } else if (candidates.length >= 1) {
    confidence = 'med';
  }

  return {
    hr: {
      value: bestCandidate.lthr,
      min: Math.max(bestCandidate.lthr - range, 0),
      max: Math.min(bestCandidate.lthr + range, hrMaxEst?.value || 220)
    },
    confidence,
    evidence: candidates.slice(0, 5)
  };
};

// Fit HR -> intensity model (piecewise linear)
const fitHRIntensityModel = (activities, sport) => {
  const segments = [];
  
  activities.forEach(act => {
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
      
      return slope * targetHR + intercept;
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

  // Filter activities with HR streams
  const activitiesWithHR = activities.filter(act => 
    act.streams?.heartrate || act.streams?.hr
  );

  if (activitiesWithHR.length === 0) {
    return {
      hrMax: { value: null, confidence: 'low', evidence: [] },
      lt1: { hr: { value: null }, confidence: 'low', evidence: [] },
      lt2: { hr: { value: null }, confidence: 'low', evidence: [] },
      protocol: null
    };
  }

  // Estimate HRmax
  const hrMax = estimateHRmax(activitiesWithHR);

  // Estimate LT1
  const lt1 = estimateLT1(activitiesWithHR, hrMax, sport);

  // Estimate LT2
  const lt2 = estimateLT2(activitiesWithHR, hrMax, sport);

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
