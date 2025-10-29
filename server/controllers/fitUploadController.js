const FitTraining = require('../models/fitTraining');
const fs = require('fs');
const path = require('path');
const FitParser = require('fit-file-parser').default;

/**
 * Parse FIT file and extract training data
 */
async function parseFitFile(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`Reading FIT file, size: ${fileBuffer.length} bytes`);
    
    if (fileBuffer.length === 0) {
      throw new Error('FIT file is empty');
    }
    
    const fitParser = new FitParser({
      force: true,
      speedUnit: 'm/s',  // Use m/s for consistency
      lengthUnit: 'm',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'list'
    });
    
    return new Promise((resolve, reject) => {
      fitParser.parse(fileBuffer, (error, data) => {
        if (error) {
          console.error('FIT parser error:', error);
          reject(error);
          return;
        }
        
        console.log('FIT parser success, data structure:', {
          hasActivity: !!data.activity,
          sessionsCount: data.sessions?.length || 0,
          lapsCount: data.laps?.length || 0,
          recordsCount: data.records?.length || 0,
          hasFileId: !!data.file_id
        });
        
        resolve({
          activity: data.activity || null,
          sessions: data.sessions || [],
          laps: data.laps || [],
          records: data.records || [],
          events: data.events || [],
          deviceInfo: data.file_id || null,
          metadata: {}
        });
      });
    });
  } catch (error) {
    console.error('Error parsing FIT file:', error);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to parse FIT file: ${error.message}`);
  }
}

/**
 * Convert FIT data to our schema format
 */
function convertFitToTraining(fitData, athleteId, originalFileName) {
  const session = fitData.sessions[0] || fitData.activity || {};
  const records = fitData.records || [];
  const laps = fitData.laps || [];
  
  // Helper to safely get values from FIT messages (fit-file-parser uses objects with value property)
  const getValue = (obj, prop, defaultValue = null) => {
    if (!obj) return defaultValue;
    
    // Try direct property access
    let value = obj[prop];
    
    // If value is an object with 'value' property, extract it
    if (value && typeof value === 'object' && 'value' in value) {
      value = value.value;
    }
    
    if (value !== undefined && value !== null) return value;
    
    // Try camelCase variations
    const camelCase = prop.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    value = obj[camelCase];
    if (value && typeof value === 'object' && 'value' in value) {
      value = value.value;
    }
    if (value !== undefined && value !== null) return value;
    
    // Try snake_case
    const snakeCase = prop.replace(/([A-Z])/g, '_$1').toLowerCase();
    value = obj[snakeCase];
    if (value && typeof value === 'object' && 'value' in value) {
      value = value.value;
    }
    if (value !== undefined && value !== null) return value;
    
    return defaultValue;
  };
  
  // Debug: Log session structure
  if (session && Object.keys(session).length > 0) {
    console.log('Session keys:', Object.keys(session).slice(0, 20));
    console.log('Session sample:', JSON.stringify(session, null, 2).substring(0, 1000));
  }

  // Determine sport
  let sport = 'generic';
  const sportValue = getValue(session, 'sport') || getValue(session, 'type') || getValue(fitData.activity, 'sport');
  if (sportValue !== null && sportValue !== undefined) {
    const sportStr = String(sportValue).toLowerCase().replace(/\s+/g, '');
    const sportMap = {
      'running': 'running',
      'running1': 'running',
      'cycling': 'cycling',
      'cycling2': 'cycling',
      'swimming': 'swimming',
      'swimming3': 'swimming',
      'walking': 'running',
      'hiking': 'running',
      'run': 'running',
      'bike': 'cycling',
      'swim': 'swimming',
      '0': 'generic',
      '1': 'running',
      '2': 'cycling',
      '3': 'swimming'
    };
    sport = sportMap[sportStr] || 'generic';
  }

  // Get session totals - fit-file-parser provides these directly in seconds/meters
  const totalElapsedTimeRaw = getValue(session, 'total_elapsed_time') || 
                               getValue(session, 'totalElapsedTime') || 0;
  // Value is already in seconds, no conversion needed
  const totalElapsedTime = typeof totalElapsedTimeRaw === 'number' ? totalElapsedTimeRaw : 0;
  
  const totalDistanceRaw = getValue(session, 'total_distance') || 
                           getValue(session, 'totalDistance') || 0;
  // Value is already in meters
  const totalDistance = typeof totalDistanceRaw === 'number' ? totalDistanceRaw : 0;
  
  // Calculate averages - fit-file-parser uses snake_case and provides values in different units
  const validRecords = records.filter(r => getValue(r, 'timestamp'));
  
  // Session values might be in different formats
  const avgSpeed = (getValue(session, 'avg_speed') || getValue(session, 'avgSpeed')) || 
                   calculateAverage(validRecords, 'speed');
  const maxSpeed = (getValue(session, 'max_speed') || getValue(session, 'maxSpeed')) || 
                   Math.max(...validRecords.map(r => getValue(r, 'speed', 0) || 0), 0);
  const avgHeartRate = (getValue(session, 'avg_heart_rate') || getValue(session, 'avgHeartRate')) || 
                       calculateAverage(validRecords, 'heart_rate');
  const maxHeartRate = (getValue(session, 'max_heart_rate') || getValue(session, 'maxHeartRate')) || 
                       Math.max(...validRecords.map(r => getValue(r, 'heart_rate', 0) || 0), 0);
  const avgPower = (getValue(session, 'avg_power') || getValue(session, 'avgPower')) || 
                   calculateAverage(validRecords, 'power');
  const maxPower = (getValue(session, 'max_power') || getValue(session, 'maxPower')) || 
                   Math.max(...validRecords.map(r => getValue(r, 'power', 0) || 0), 0);
  const avgCadence = (getValue(session, 'avg_cadence') || getValue(session, 'avgCadence')) || 
                     calculateAverage(validRecords, 'cadence');
  const maxCadence = (getValue(session, 'max_cadence') || getValue(session, 'maxCadence')) || 
                     Math.max(...validRecords.map(r => getValue(r, 'cadence', 0) || 0), 0);

  // Convert records to our format - fit-file-parser uses snake_case
  const convertedRecords = validRecords.map((record) => {
    const timestamp = getValue(record, 'timestamp');
    return {
      timestamp: timestamp ? (timestamp instanceof Date ? timestamp : new Date(timestamp)) : null,
      positionLat: getValue(record, 'position_lat') || getValue(record, 'positionLat'),
      positionLong: getValue(record, 'position_long') || getValue(record, 'positionLong'),
      distance: getValue(record, 'distance'),
      altitude: getValue(record, 'altitude'),
      speed: getValue(record, 'speed'),
      power: getValue(record, 'power'),
      heartRate: getValue(record, 'heart_rate') || getValue(record, 'heartRate'),
      cadence: getValue(record, 'cadence'),
      temperature: getValue(record, 'temperature'),
      grade: getValue(record, 'grade'),
    };
  }).filter(r => r.timestamp);

  // Convert laps to our format - fit-file-parser uses snake_case, values are already in correct units
  const convertedLaps = laps.map((lap, index) => {
    const startTime = getValue(lap, 'start_time') || getValue(lap, 'startTime');
    const totalElapsedTimeRaw = getValue(lap, 'total_elapsed_time') || 
                                getValue(lap, 'totalElapsedTime') || 0;
    const totalTimerTimeRaw = getValue(lap, 'total_timer_time') || 
                              getValue(lap, 'totalTimerTime') || 0;
    
    return {
      lapNumber: index + 1,
      startTime: startTime ? (startTime instanceof Date ? startTime : new Date(startTime)) : null,
      totalElapsedTime: typeof totalElapsedTimeRaw === 'number' ? totalElapsedTimeRaw : 0,
      totalTimerTime: typeof totalTimerTimeRaw === 'number' ? totalTimerTimeRaw : 0,
      totalDistance: getValue(lap, 'total_distance') || getValue(lap, 'totalDistance') || 0,
      totalCycles: getValue(lap, 'total_cycles') || getValue(lap, 'totalCycles') || 0,
      avgSpeed: getValue(lap, 'avg_speed') || getValue(lap, 'avgSpeed') || 0,
      maxSpeed: getValue(lap, 'max_speed') || getValue(lap, 'maxSpeed') || 0,
      avgHeartRate: getValue(lap, 'avg_heart_rate') || getValue(lap, 'avgHeartRate') || null,
      maxHeartRate: getValue(lap, 'max_heart_rate') || getValue(lap, 'maxHeartRate') || null,
      avgPower: getValue(lap, 'avg_power') || getValue(lap, 'avgPower') || null,
      maxPower: getValue(lap, 'max_power') || getValue(lap, 'maxPower') || null,
      avgCadence: getValue(lap, 'avg_cadence') || getValue(lap, 'avgCadence') || null,
      maxCadence: getValue(lap, 'max_cadence') || getValue(lap, 'maxCadence') || null,
      startPositionLat: getValue(lap, 'start_position_lat') || getValue(lap, 'startPositionLat') || null,
      startPositionLong: getValue(lap, 'start_position_long') || getValue(lap, 'startPositionLong') || null,
      endPositionLat: getValue(lap, 'end_position_lat') || getValue(lap, 'endPositionLat') || null,
      endPositionLong: getValue(lap, 'end_position_long') || getValue(lap, 'endPositionLong') || null,
    };
  });

  const sessionTimestamp = getValue(session, 'timestamp') || 
                           getValue(session, 'start_time') || 
                           getValue(session, 'startTime') ||
                           (records.length > 0 ? getValue(records[0], 'timestamp') : null);
  
  const totalTimerTimeRaw = getValue(session, 'total_timer_time') || 
                            getValue(session, 'totalTimerTime') || 0;
  const totalTimerTime = typeof totalTimerTimeRaw === 'number' ? totalTimerTimeRaw : 0;
  
  // Get sub_sport value (might be object with value property)
  let subSport = getValue(session, 'sub_sport') || getValue(session, 'subSport');
  if (subSport && typeof subSport === 'object' && 'value' in subSport) {
    subSport = subSport.value;
  }
  if (typeof subSport === 'string') {
    subSport = subSport.replace(/_/g, ' ');
  }
  
  return {
    athleteId,
    originalFileName,
    sport,
    subSport: subSport || null,
    timestamp: sessionTimestamp ? (sessionTimestamp instanceof Date ? sessionTimestamp : new Date(sessionTimestamp)) : new Date(),
    totalElapsedTime: totalElapsedTime || 0, // Already in seconds
    totalTimerTime: totalTimerTime || 0, // Already in seconds
    totalDistance: totalDistance || 0, // Already in meters
    totalAscent: getValue(session, 'total_ascent') || getValue(session, 'totalAscent') || 0,
    totalDescent: getValue(session, 'total_descent') || getValue(session, 'totalDescent') || 0,
    totalCalories: getValue(session, 'total_calories') || getValue(session, 'totalCalories') || null,
    avgSpeed: avgSpeed || 0, // Already in m/s
    maxSpeed: isFinite(maxSpeed) ? maxSpeed : 0,
    avgHeartRate: avgHeartRate || null,
    maxHeartRate: isFinite(maxHeartRate) ? maxHeartRate : null,
    avgPower: avgPower || null,
    maxPower: isFinite(maxPower) ? maxPower : null,
    avgCadence: avgCadence || null,
    maxCadence: isFinite(maxCadence) ? maxCadence : null,
    records: convertedRecords,
    laps: convertedLaps,
    manufacturer: fitData.deviceInfo ? (getValue(fitData.deviceInfo, 'manufacturer') || null) : null,
    product: fitData.deviceInfo ? (getValue(fitData.deviceInfo, 'product') || null) : null,
    serialNumber: fitData.deviceInfo ? (getValue(fitData.deviceInfo, 'serial_number') || getValue(fitData.deviceInfo, 'serialNumber') || null) : null,
    softwareVersion: fitData.deviceInfo ? (getValue(fitData.deviceInfo, 'software_version') || getValue(fitData.deviceInfo, 'softwareVersion') || null) : null,
  };
}

function calculateAverage(records, field) {
  const values = records
    .map(r => {
      // Try direct property
      let value = r[field];
      if (value !== undefined && value !== null) {
        // If it's an object with value property, extract it
        if (typeof value === 'object' && 'value' in value) {
          value = value.value;
        }
        if (typeof value === 'number' && isFinite(value)) return value;
      }
      
      // Try snake_case version
      const snakeField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
      value = r[snakeField];
      if (value !== undefined && value !== null) {
        if (typeof value === 'object' && 'value' in value) {
          value = value.value;
        }
        if (typeof value === 'number' && isFinite(value)) return value;
      }
      
      return null;
    })
    .filter(v => v !== null && v !== undefined && !isNaN(v) && isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Upload and parse FIT file
 */
async function uploadFitFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const filePath = req.file.path;
    const originalFileName = req.file.originalname;
    const fileSize = req.file.size;

    console.log(`Processing FIT file: ${originalFileName} (${fileSize} bytes)`);

    // Parse FIT file
    const fitData = await parseFitFile(filePath);
    console.log('Parsed FIT data structure:', {
      sessions: fitData.sessions?.length || 0,
      laps: fitData.laps?.length || 0,
      records: fitData.records?.length || 0,
      hasActivity: !!fitData.activity,
      hasDeviceInfo: !!fitData.deviceInfo
    });
    
    // Convert to our schema
    const trainingData = convertFitToTraining(fitData, userId, originalFileName);
    trainingData.fileSize = fileSize;
    
    console.log('Converted training data:', {
      sport: trainingData.sport,
      totalDistance: trainingData.totalDistance,
      totalElapsedTime: trainingData.totalElapsedTime,
      totalTimerTime: trainingData.totalTimerTime,
      avgSpeed: trainingData.avgSpeed,
      maxSpeed: trainingData.maxSpeed,
      avgHeartRate: trainingData.avgHeartRate,
      maxHeartRate: trainingData.maxHeartRate,
      avgPower: trainingData.avgPower,
      maxPower: trainingData.maxPower,
      recordsCount: trainingData.records?.length || 0,
      lapsCount: trainingData.laps?.length || 0,
      firstRecord: trainingData.records?.[0],
      firstLap: trainingData.laps?.[0]
    });

    // Save to database
    const fitTraining = new FitTraining(trainingData);
    await fitTraining.save();

    // Delete temporary file
    fs.unlinkSync(filePath);

    console.log(`Successfully processed FIT file: ${fitTraining._id}`);

    res.status(201).json({
      success: true,
      training: fitTraining,
      message: 'FIT file uploaded and parsed successfully'
    });
  } catch (error) {
    console.error('Error uploading FIT file:', error);
    
    // Clean up file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Failed to process FIT file',
      message: error.message
    });
  }
}

/**
 * Get all FIT trainings for user
 */
async function getFitTrainings(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const trainings = await FitTraining.find({ athleteId: userId })
      .sort({ timestamp: -1 })
      .select('-records'); // Don't send all records by default

    res.json(trainings);
  } catch (error) {
    console.error('Error fetching FIT trainings:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get single FIT training with records
 */
async function getFitTraining(req, res) {
  try {
    const userId = req.user?.userId;
    const trainingId = req.params.id;

    const training = await FitTraining.findOne({
      _id: trainingId,
      athleteId: userId
    });

    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    res.json(training);
  } catch (error) {
    console.error('Error fetching FIT training:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update lactate values for intervals/records
 */
async function updateLactate(req, res) {
  try {
    const userId = req.user?.userId;
    const trainingId = req.params.id;
    const { lactateValues } = req.body; // { lapIndex: number, lactate: number } or { recordIndex: number, lactate: number }

    const training = await FitTraining.findOne({
      _id: trainingId,
      athleteId: userId
    });

    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    // Update lactate values
    lactateValues.forEach(({ type, index, lactate }) => {
      if (type === 'lap' && training.laps[index]) {
        training.laps[index].lactate = lactate;
      } else if (type === 'record' && training.records[index]) {
        training.records[index].lactate = lactate;
      }
    });

    training.analysisComplete = true;
    await training.save();

    res.json({
      success: true,
      training
    });
  } catch (error) {
    console.error('Error updating lactate:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Delete FIT training
 */
async function deleteFitTraining(req, res) {
  try {
    const userId = req.user?.userId;
    const trainingId = req.params.id;

    const training = await FitTraining.findOne({
      _id: trainingId,
      athleteId: userId
    });

    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    await FitTraining.findByIdAndDelete(trainingId);

    res.json({
      success: true,
      message: 'Training deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting FIT training:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  uploadFitFile,
  getFitTrainings,
  getFitTraining,
  updateLactate,
  deleteFitTraining
};

