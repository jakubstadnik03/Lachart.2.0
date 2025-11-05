/**
 * Utility functions for FIT analysis page
 */

export const formatDuration = (seconds) => {
  if (!seconds) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export const formatDistance = (meters) => {
  if (!meters) return '0 m';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
};

export const formatSpeed = (mps) => {
  if (!mps) return '-';
  const kmh = mps * 3.6;
  return `${kmh.toFixed(1)} km/h`;
};

export const formatPace = (mps) => {
  if (!mps || mps === 0) return '-';
  const secondsPerKm = 1000 / mps;
  const hours = Math.floor(secondsPerKm / 3600);
  const minutes = Math.floor((secondsPerKm % 3600) / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}/km`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
};

/**
 * Prepare data for SVG training chart
 */
export const prepareTrainingChartData = (training) => {
  if (!training || !training.records || training.records.length === 0) return null;

  const records = training.records;
  
  // Calculate time from start in seconds
  const startTime = records[0]?.timestamp ? new Date(records[0].timestamp).getTime() : 0;
  const recordsWithTime = records.map((r, i) => {
    const recordTime = r.timestamp ? new Date(r.timestamp).getTime() : startTime + (i * 1000);
    const timeFromStart = (recordTime - startTime) / 1000; // Convert to seconds
    return {
      ...r,
      timeFromStart,
      speed: r.speed ? r.speed * 3.6 : null, // Convert to km/h
      heartRate: r.heartRate || null,
      power: r.power || null
    };
  });

  // Find max values for scaling
  const maxTime = recordsWithTime[recordsWithTime.length - 1]?.timeFromStart || 0;
  const maxSpeed = Math.max(...recordsWithTime.map(r => r.speed || 0).filter(v => v > 0));
  const maxHeartRate = Math.max(...recordsWithTime.map(r => r.heartRate || 0).filter(v => v > 0));
  const maxPower = Math.max(...recordsWithTime.map(r => r.power || 0).filter(v => v > 0));

  return {
    records: recordsWithTime,
    maxTime,
    maxSpeed,
    maxHeartRate,
    maxPower
  };
};

/**
 * Prepare interval bars data for chart
 */
export const prepareIntervalBarsData = (laps, chartData, trainingStartTime) => {
  if (!laps || laps.length === 0) return [];

  let cumulativeTime = 0;
  const allIntervalBars = laps.map((lap, index) => {
    // Use lap.startTime if available, otherwise use cumulative time
    let startTime = cumulativeTime;
    if (lap.startTime) {
      const lapStartTime = new Date(lap.startTime).getTime();
      startTime = (lapStartTime - trainingStartTime) / 1000; // Convert to seconds from start
    }
    
    const duration = lap.totalElapsedTime || lap.totalTimerTime || 0;
    const endTime = startTime + duration;
    cumulativeTime = endTime;
    
    // Get power for this interval (avgPower or maxPower)
    const power = lap.avgPower || lap.maxPower || 0;
    
    return {
      index,
      startTime,
      endTime,
      duration,
      power,
      lap
    };
  });

  // Filter bars with valid power and duration
  return allIntervalBars.filter(bar => bar.power > 0 && bar.duration > 0);
};

/**
 * Prepare all intervals chart data
 */
export const prepareAllIntervalsChartData = (selectedTraining, allTrainingsWithLaps, showAllTrainings) => {
  const allLaps = [];
  
  if (showAllTrainings && allTrainingsWithLaps.length > 0) {
    allTrainingsWithLaps.forEach(training => {
      if (training.laps && training.laps.length > 0) {
        training.laps.forEach((lap, index) => {
          allLaps.push({
            ...lap,
            trainingTimestamp: training.timestamp,
            trainingId: training._id,
            intervalNumber: allLaps.length + 1,
            startTime: lap.startTime || training.timestamp
          });
        });
      }
    });
  } else if (selectedTraining && selectedTraining.laps) {
    selectedTraining.laps.forEach((lap, index) => {
      allLaps.push({
        ...lap,
        trainingTimestamp: selectedTraining.timestamp,
        trainingId: selectedTraining._id,
        intervalNumber: index + 1,
        startTime: lap.startTime || selectedTraining.timestamp
      });
    });
  }

  if (allLaps.length === 0) return null;

  // Sort by start time
  allLaps.sort((a, b) => {
    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
    return timeA - timeB;
  });

  // Calculate cumulative time positions for X axis
  let cumulativeTime = 0;
  const xPositions = allLaps.map((lap, index) => {
    const duration = lap.totalElapsedTime || lap.totalTimerTime || 1;
    const startTime = cumulativeTime;
    const endTime = cumulativeTime + duration;
    cumulativeTime = endTime;
    return {
      start: startTime,
      end: endTime,
      duration: duration,
      label: formatDuration(duration)
    };
  });

  const labels = xPositions.map(pos => pos.start);
  const powerData = allLaps.map(lap => {
    const power = lap.avgPower || lap.maxPower || lap.normalizedPower || null;
    return (power !== null && power !== undefined && !isNaN(power) && power > 0) ? power : null;
  });
  const heartRateData = allLaps.map(lap => lap.avgHeartRate || lap.maxHeartRate || null);
  const intervalDurations = allLaps.map(lap => lap.totalElapsedTime || lap.totalTimerTime || 0);
  const barDurations = allLaps.map(lap => lap.totalElapsedTime || lap.totalTimerTime || 1);
  const barPositions = xPositions.map(pos => ({
    start: pos.start,
    end: pos.end,
    center: (pos.start + pos.end) / 2
  }));

  return {
    labels,
    powerData,
    intervalDurations,
    heartRateData,
    barDurations,
    barPositions,
    xPositions,
    totalIntervals: allLaps.length
  };
};

