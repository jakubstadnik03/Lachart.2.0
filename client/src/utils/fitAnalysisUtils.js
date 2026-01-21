/**
 * Utility functions for FIT analysis page
 */

import { formatDistance as formatDistanceWithUnits, formatSpeed as formatSpeedWithUnits, getUserUnits } from './unitsConverter';

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

export const formatDistance = (distance, user = null) => {
  if (!distance && distance !== 0) return '0 m';
  
  // Rozpoznání, zda hodnota přichází v metrech nebo kilometrech
  let distanceInMeters;
  
  if (typeof distance === 'string') {
    const cleanValue = distance.trim().toLowerCase();
    
    // Pokud už obsahuje jednotky, použij je
    if (cleanValue.includes('km')) {
      const kmMatch = cleanValue.match(/^([\d.]+)\s*km$/);
      if (kmMatch) {
        distanceInMeters = parseFloat(kmMatch[1]) * 1000;
      } else {
        distanceInMeters = parseFloat(cleanValue.replace(/km|m| /gi, '').trim());
        // Pokud je celé číslo > 100 bez desetinné čárky, pravděpodobně je to v metrech
        if (!isNaN(distanceInMeters) && distanceInMeters > 100 && distanceInMeters % 1 === 0 && !cleanValue.includes('.')) {
          // Už je v metrech
        } else {
          // Předpokládáme km
          distanceInMeters = distanceInMeters * 1000;
        }
      }
    } else if (cleanValue.includes('m') && !cleanValue.includes('km')) {
      const mMatch = cleanValue.match(/^([\d.]+)\s*m$/);
      if (mMatch) {
        distanceInMeters = parseFloat(mMatch[1]);
      } else {
        distanceInMeters = parseFloat(cleanValue.replace(/km|m| /gi, '').trim());
        // Pokud je celé číslo > 100 bez desetinné čárky, pravděpodobně je to v metrech
        if (isNaN(distanceInMeters) || !(distanceInMeters > 100 && distanceInMeters % 1 === 0 && !cleanValue.includes('.'))) {
          // Předpokládáme km
          distanceInMeters = distanceInMeters * 1000;
        }
      }
    } else {
      const numValue = parseFloat(cleanValue);
      if (!isNaN(numValue)) {
        // Pokud je celé číslo > 100 bez desetinné čárky, pravděpodobně je to v metrech
        if (numValue > 100 && numValue % 1 === 0 && !cleanValue.includes('.')) {
          distanceInMeters = numValue;
        } else {
          // Předpokládáme km
          distanceInMeters = numValue * 1000;
        }
      } else {
        distanceInMeters = 0;
      }
    }
  } else {
    const numValue = parseFloat(distance);
    if (isNaN(numValue)) {
      distanceInMeters = 0;
    } else {
      // Pokud je číslo > 100 a je to celé číslo, pravděpodobně je to v metrech
      if (numValue > 100 && numValue % 1 === 0) {
        distanceInMeters = numValue;
      } else {
        // Předpokládáme km (např. 0.900, 1.5, atd.)
        distanceInMeters = numValue * 1000;
      }
    }
  }
  
  if (user) {
    const units = getUserUnits(user);
    return formatDistanceWithUnits(distanceInMeters, units.distance).formatted;
  }
  // Fallback to metric
  if (distanceInMeters >= 1000) {
    return `${(distanceInMeters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(distanceInMeters)} m`;
};

export const formatSpeed = (mps, user = null) => {
  if (!mps) return '-';
  if (user) {
    const units = getUserUnits(user);
    return formatSpeedWithUnits(mps, units.distance).formatted;
  }
  // Fallback to metric
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
      heartRate: r.heartRate !== null && r.heartRate !== undefined ? r.heartRate : null,
      power: r.power !== null && r.power !== undefined ? r.power : null,
      cadence: r.cadence !== null && r.cadence !== undefined ? r.cadence : null,
      altitude: r.altitude !== null && r.altitude !== undefined ? r.altitude : null
    };
  });

  // Find max values for scaling
  const maxTime = recordsWithTime[recordsWithTime.length - 1]?.timeFromStart || 0;
  const maxSpeed = Math.max(...recordsWithTime.map(r => r.speed || 0).filter(v => v > 0), 1);
  const maxHeartRate = Math.max(...recordsWithTime.map(r => r.heartRate || 0).filter(v => v > 0), 1);
  const maxPower = Math.max(...recordsWithTime.map(r => r.power || 0).filter(v => v > 0), 1);
  
  // Calculate maxCadence - only if there are valid cadence values > 0
  const validCadenceValues = recordsWithTime.map(r => r.cadence).filter(v => v !== null && v !== undefined && v > 0);
  const maxCadence = validCadenceValues.length > 0 ? Math.max(...validCadenceValues) : null;
  
  // Calculate maxAltitude and minAltitude - include all altitude values (can be 0 or negative)
  const validAltitudeValues = recordsWithTime.map(r => r.altitude).filter(v => v !== null && v !== undefined);
  const maxAltitude = validAltitudeValues.length > 0 ? Math.max(...validAltitudeValues) : null;
  const minAltitude = validAltitudeValues.length > 0 ? Math.min(...validAltitudeValues) : null;
  
  return {
    records: recordsWithTime,
    maxTime,
    maxSpeed,
    maxHeartRate,
    maxPower,
    maxCadence,
    maxAltitude,
    minAltitude
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

