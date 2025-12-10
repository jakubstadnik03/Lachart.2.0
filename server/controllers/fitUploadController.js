const FitTraining = require('../models/fitTraining');
const fs = require('fs');
const path = require('path');
const FitParser = require('fit-file-parser').default;
const TrainingAbl = require('../abl/trainingAbl');

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
    // Ensure athleteId is stored as string (schema expects String type)
    const trainingData = convertFitToTraining(fitData, String(userId), originalFileName);
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

    // Get user to check role
    const User = require('../models/UserModel');
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine which athleteId to use
    let targetAthleteId = userId.toString(); // Always convert to string for consistency
    
    // Only process athleteId if it's provided and not empty/null/undefined
    const athleteIdParam = req.query.athleteId;
    if (athleteIdParam && 
        athleteIdParam !== 'null' && 
        athleteIdParam !== 'undefined' && 
        String(athleteIdParam).trim() !== '' &&
        athleteIdParam !== null &&
        athleteIdParam !== undefined) {
      // If query parameter is provided, validate access
      if (user.role === 'coach') {
        // Coach can view their own trainings or their athletes' trainings
        if (String(athleteIdParam) === String(userId)) {
          targetAthleteId = String(userId);
        } else {
          // Check if athlete belongs to coach
          const athlete = await User.findById(athleteIdParam);
          if (!athlete) {
            return res.status(404).json({ error: 'Athlete not found' });
          }
          if (!athlete.coachId || String(athlete.coachId) !== String(userId)) {
            return res.status(403).json({ error: 'This athlete does not belong to your team' });
          }
          targetAthleteId = String(athleteIdParam);
        }
      } else if (user.role === 'athlete') {
        // Athlete can only view their own trainings - ignore athleteId parameter
        targetAthleteId = String(userId);
      }
    } else {
      // No athleteId provided - use user's own ID
      targetAthleteId = String(userId);
    }

    // Ensure targetAthleteId is a string
    // athleteId is stored as String in the schema, so we need to match it exactly
    // When userId is ObjectId, convert it to string
    const targetAthleteIdStr = targetAthleteId ? String(targetAthleteId) : String(userId);
    
    console.log('Fetching FIT trainings:', {
      userId: String(userId),
      userIdType: typeof userId,
      targetAthleteId: targetAthleteIdStr,
      userRole: user.role,
      athleteIdParam: req.query.athleteId
    });
    
    try {
      // Find trainings with the athleteId as string
      // Try both userId.toString() and String(userId) to handle different formats
      let trainings = await FitTraining.find({ athleteId: targetAthleteIdStr })
        .sort({ timestamp: -1 })
        .select('-records'); // Don't send all records by default

      // If no results and userId is ObjectId, try with ObjectId.toString() format
      if (trainings.length === 0 && userId && userId.toString && userId.toString() !== targetAthleteIdStr) {
        trainings = await FitTraining.find({ athleteId: userId.toString() })
          .sort({ timestamp: -1 })
          .select('-records');
      }

      console.log(`Found ${trainings.length} FIT trainings for athleteId: ${targetAthleteIdStr}`);

      res.json(trainings);
    } catch (dbError) {
      console.error('Database error fetching FIT trainings:', dbError);
      throw dbError;
    }
  } catch (error) {
    console.error('Error fetching FIT trainings:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
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

    // Sync to Training model - sync all intervals (not just those with lactate)
    try {
      await TrainingAbl.syncTrainingFromSource('fit', training, userId);
    } catch (syncError) {
      console.error('Error syncing to Training model:', syncError);
      // Don't fail the request if sync fails
    }

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
 * Update training title and description
 */
async function updateFitTraining(req, res) {
  try {
    const userId = req.user?.userId;
    const trainingId = req.params.id;
  const { title, description, selectedLapIndices } = req.body;

    const training = await FitTraining.findOne({
      _id: trainingId,
      athleteId: userId
    });

    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    const oldTitle = training.titleManual || training.titleAuto || training.originalFileName;
    
    // Update title if provided
    if (title !== undefined) {
      training.titleManual = title || null;
    }

    // Update description if provided
    if (description !== undefined) {
      training.description = description || null;
    }

    await training.save();

    // Update Training records with the same title
    if (title !== undefined && title) {
      const Training = require('../models/training');
      const newTitle = title.trim();
      
      // Find Training records with the same title (old or new)
      const trainingRecords = await Training.find({
        athleteId: userId.toString(),
        title: { $in: [oldTitle, newTitle] }
      });
      
      // Update all matching Training records
      for (const trainingRecord of trainingRecords) {
        if (trainingRecord.title === oldTitle || trainingRecord.title === newTitle) {
          trainingRecord.title = newTitle;
          if (description !== undefined) {
            trainingRecord.description = description || null;
          }
          await trainingRecord.save();
        }
      }
    }

    try {
    let lapIndices = null;
    if (Array.isArray(selectedLapIndices)) {
      lapIndices = selectedLapIndices
        .map((value) => {
          const parsed = typeof value === 'number' ? value : parseInt(value, 10);
          return Number.isInteger(parsed) ? parsed : null;
        })
        .filter((value) => value !== null && value >= 0);

      if (lapIndices && training.laps && training.laps.length > 0) {
        const maxIndex = training.laps.length - 1;
        lapIndices = lapIndices.filter((value) => value <= maxIndex);
      }

      if (lapIndices.length === 0) {
        lapIndices = null;
      }
    }

    await TrainingAbl.syncTrainingFromSource('fit', training, userId, {
      selectedLapIndices: lapIndices
    });
    } catch (syncError) {
      console.error('Error syncing training after update:', syncError);
    }

    res.json({
      success: true,
      training
    });
  } catch (error) {
    console.error('Error updating training:', error);
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

/**
 * Get all unique training titles available to the user
 */
async function getAllTitles(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const titles = await TrainingAbl.getTrainingTitles(userId);

    res.json(titles);
  } catch (error) {
    console.error('Error getting all titles:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create a new lap from time range selection
 */
async function createLap(req, res) {
  try {
    const userId = req.user?.userId;
    const trainingId = req.params.id;
    const { startTime, endTime } = req.body; // startTime and endTime in seconds from training start

    const training = await FitTraining.findOne({
      _id: trainingId,
      athleteId: userId
    });

    if (!training) {
      return res.status(404).json({ error: 'Training not found' });
    }

    if (!training.records || training.records.length === 0) {
      return res.status(400).json({ error: 'Training has no records' });
    }

    // Get training start time
    const trainingStartTime = training.records[0]?.timestamp 
      ? new Date(training.records[0].timestamp).getTime() 
      : training.timestamp 
        ? new Date(training.timestamp).getTime() 
        : Date.now();

    // Find records in the selected time range
    const selectedRecords = training.records.filter(record => {
      if (!record.timestamp) return false;
      const recordTime = new Date(record.timestamp).getTime();
      const timeFromStart = (recordTime - trainingStartTime) / 1000; // Convert to seconds
      return timeFromStart >= startTime && timeFromStart <= endTime;
    });

    if (selectedRecords.length === 0) {
      return res.status(400).json({ error: 'No records found in selected time range' });
    }

    // Calculate statistics from selected records
    const speeds = selectedRecords.map(r => r.speed).filter(v => v && v > 0);
    const heartRates = selectedRecords.map(r => r.heartRate).filter(v => v && v > 0);
    const powers = selectedRecords.map(r => r.power).filter(v => v && v > 0);
    const cadences = selectedRecords.map(r => r.cadence).filter(v => v && v > 0);
    const distances = selectedRecords.map(r => r.distance).filter(v => v && v > 0);

    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;
    const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null;
    const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : null;
    const avgPower = powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null;
    const maxPower = powers.length > 0 ? Math.max(...powers) : null;
    const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : null;
    const maxCadence = cadences.length > 0 ? Math.max(...cadences) : null;

    // Calculate distance
    const firstRecord = selectedRecords[0];
    const lastRecord = selectedRecords[selectedRecords.length - 1];
    const totalDistance = lastRecord.distance && firstRecord.distance 
      ? lastRecord.distance - firstRecord.distance 
      : null;

    // Calculate elapsed time
    const totalElapsedTime = endTime - startTime;

    // Get positions
    const startPositionLat = firstRecord.positionLat || null;
    const startPositionLong = firstRecord.positionLong || null;
    const endPositionLat = lastRecord.positionLat || null;
    const endPositionLong = lastRecord.positionLong || null;

    // Create new lap
    const newLap = {
      lapNumber: (training.laps?.length || 0) + 1,
      startTime: new Date(trainingStartTime + startTime * 1000),
      totalElapsedTime: totalElapsedTime,
      totalTimerTime: totalElapsedTime,
      totalDistance: totalDistance || 0,
      avgSpeed: avgSpeed || 0,
      maxSpeed: maxSpeed || 0,
      avgHeartRate: avgHeartRate,
      maxHeartRate: maxHeartRate,
      avgPower: avgPower,
      maxPower: maxPower,
      avgCadence: avgCadence,
      maxCadence: maxCadence,
      startPositionLat: startPositionLat,
      startPositionLong: startPositionLong,
      endPositionLat: endPositionLat,
      endPositionLong: endPositionLong
    };

    // Add lap to training
    if (!training.laps) {
      training.laps = [];
    }
    training.laps.push(newLap);

    await training.save();

    res.json({
      success: true,
      lap: newLap,
      training
    });
  } catch (error) {
    console.error('Error creating lap:', error);
    res.status(500).json({ error: error.message });
  }
}

async function getTrainingsWithLactate(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const User = require('../models/UserModel');
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine which athleteId to use
    let targetAthleteId = userId.toString();
    const athleteIdParam = req.query.athleteId;
    if (athleteIdParam && 
        athleteIdParam !== 'null' && 
        athleteIdParam !== 'undefined' && 
        String(athleteIdParam).trim() !== '' &&
        athleteIdParam !== null &&
        athleteIdParam !== undefined) {
      if (user.role === 'coach') {
        if (String(athleteIdParam) === String(userId)) {
          targetAthleteId = String(userId);
        } else {
          const athlete = await User.findById(athleteIdParam);
          if (!athlete) {
            return res.status(404).json({ error: 'Athlete not found' });
          }
          if (!athlete.coachId || String(athlete.coachId) !== String(userId)) {
            return res.status(403).json({ error: 'This athlete does not belong to your team' });
          }
          targetAthleteId = String(athleteIdParam);
        }
      } else if (user.role === 'athlete') {
        targetAthleteId = String(userId);
      }
    } else {
      targetAthleteId = String(userId);
    }

    const targetAthleteIdStr = targetAthleteId ? String(targetAthleteId) : String(userId);
    
    // Get FIT trainings with lactate
    let fitTrainings = [];
    try {
    const FitTraining = require('../models/fitTraining');
      fitTrainings = await FitTraining.find({ 
      athleteId: targetAthleteIdStr,
      'laps.lactate': { $exists: true, $ne: null }
    })
      .sort({ timestamp: -1 })
      .select('-records')
      .lean();

    // If no results, try with ObjectId format
    if (fitTrainings.length === 0 && userId && userId.toString && userId.toString() !== targetAthleteIdStr) {
      fitTrainings = await FitTraining.find({ 
        athleteId: userId.toString(),
        'laps.lactate': { $exists: true, $ne: null }
      })
        .sort({ timestamp: -1 })
        .select('-records')
        .lean();
    }

    // Filter to only include trainings that have at least one lap with lactate
    fitTrainings = fitTrainings.filter(training => 
      training.laps && training.laps.some(lap => lap.lactate != null && lap.lactate !== undefined)
    );
    } catch (fitError) {
      console.error('Error fetching FIT trainings:', fitError);
      // Continue with empty array
    }

    // Get Strava activities with lactate
    let filteredStrava = [];
    try {
    const StravaActivity = require('../models/StravaActivity');
    const stravaActivities = await StravaActivity.find({
      userId: targetAthleteIdStr,
      'laps.lactate': { $exists: true, $ne: null }
    })
      .sort({ startDate: -1 })
      .lean();

    // Filter Strava activities
      filteredStrava = stravaActivities.filter(activity => 
      activity.laps && activity.laps.some(lap => lap.lactate != null && lap.lactate !== undefined)
    );
    } catch (stravaError) {
      console.error('Error fetching Strava activities:', stravaError);
      // Continue with empty array
    }

    // Get Training model trainings with lactate
    let filteredTrainings = [];
    try {
    const Training = require('../models/training');
    const trainings = await Training.find({
      athleteId: targetAthleteIdStr,
      'results.lactate': { $exists: true, $ne: null }
    })
      .sort({ date: -1 })
      .lean();

    // Filter Training model trainings
      filteredTrainings = trainings.filter(training => 
      training.results && training.results.some(result => result.lactate != null && result.lactate !== undefined)
    );
    } catch (trainingError) {
      console.error('Error fetching Training model trainings:', trainingError);
      // Continue with empty array
    }

    // Combine all trainings
    const allTrainings = [
      ...fitTrainings.map(t => ({ ...t, type: 'fit', source: 'FIT Training' })),
      ...filteredStrava.map(t => ({ ...t, type: 'strava', source: 'Strava Activity' })),
      ...filteredTrainings.map(t => ({ ...t, type: 'training', source: 'Training' }))
    ].sort((a, b) => {
      try {
      const dateA = a.timestamp || a.startDate || a.date || new Date(0);
      const dateB = b.timestamp || b.startDate || b.date || new Date(0);
        const dateAObj = dateA instanceof Date ? dateA : new Date(dateA);
        const dateBObj = dateB instanceof Date ? dateB : new Date(dateB);
        return dateBObj - dateAObj;
      } catch (sortError) {
        console.error('Error sorting trainings:', sortError);
        return 0;
      }
    });

    res.json(allTrainings);
  } catch (error) {
    console.error('Error fetching trainings with lactate:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/**
 * Analyze FIT trainings by month with power zones and lactate prediction
 */
async function analyzeTrainingsByMonth(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const User = require('../models/UserModel');
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('User:', { userId: String(userId), role: user.role });

    // Determine which athleteId to use
    let targetAthleteId = userId.toString();
    const athleteIdParam = req.query.athleteId;
    if (athleteIdParam && 
        athleteIdParam !== 'null' && 
        athleteIdParam !== 'undefined' && 
        String(athleteIdParam).trim() !== '' &&
        athleteIdParam !== null &&
        athleteIdParam !== undefined) {
      if (user.role === 'coach') {
        if (String(athleteIdParam) === String(userId)) {
          targetAthleteId = String(userId);
        } else {
          const athlete = await User.findById(athleteIdParam);
          if (!athlete) {
            return res.status(404).json({ error: 'Athlete not found' });
          }
          if (!athlete.coachId || String(athlete.coachId) !== String(userId)) {
            return res.status(403).json({ error: 'This athlete does not belong to your team' });
          }
          targetAthleteId = String(athleteIdParam);
        }
      } else if (user.role === 'athlete') {
        targetAthleteId = String(userId);
      }
    } else {
      targetAthleteId = String(userId);
    }

    const targetAthleteIdStr = targetAthleteId ? String(targetAthleteId) : String(userId);
    console.log('Target athlete ID:', targetAthleteIdStr);
    
    // Check if specific month is requested
    const monthKeyParam = req.query.monthKey;
    const onlyMetadata = !monthKeyParam; // If no monthKey, return only metadata (list of months)
    
    console.log('Request params:', { monthKey: monthKeyParam, onlyMetadata });
    
    // Get user's power zones from profile
    let userPowerZones = null;
    if (user.powerZones?.cycling && user.powerZones.cycling.lastUpdated) {
      userPowerZones = user.powerZones.cycling;
      console.log('Using power zones from profile:', {
        lt1: userPowerZones.lt1,
        lt2: userPowerZones.lt2,
        lastUpdated: userPowerZones.lastUpdated
      });
    } else {
      console.log('No power zones in profile, will estimate from data');
    }
    
    // Get FIT trainings with records (sekundu po sekundě data) - POUZE FIT SOUBORY
    // Pokud je specifikován měsíc, filtrujeme už v databázi pro rychlejší načítání
    let fitTrainings = [];
    try {
      const FitTraining = require('../models/fitTraining');
      
      // Pokud máme monthKey, vytvoříme date range pro daný měsíc
      let dateFilter = {};
      if (monthKeyParam) {
        const [year, month] = monthKeyParam.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);
        dateFilter = {
          timestamp: {
            $gte: startDate,
            $lte: endDate
          }
        };
        console.log(`Filtering FIT trainings for month ${monthKeyParam}: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      }
      
      const query = {
        athleteId: targetAthleteIdStr,
        sport: { $in: ['cycling', 'running', 'swimming'] }, // Include all sports
        records: { $exists: true, $ne: [] },
        ...dateFilter
      };
      
      console.log('Fetching FIT trainings for athleteId:', targetAthleteIdStr, monthKeyParam ? `(month: ${monthKeyParam})` : '(all months)');
      fitTrainings = await FitTraining.find(query)
        .select('timestamp records title titleManual sport')
        .lean();

      console.log(`Found ${fitTrainings.length} FIT trainings with records${monthKeyParam ? ` for month ${monthKeyParam}` : ''}`);

      // If no results, try with ObjectId format
      if (fitTrainings.length === 0 && userId && userId.toString && userId.toString() !== targetAthleteIdStr) {
        console.log('Trying with userId.toString():', userId.toString());
        const query2 = {
          athleteId: userId.toString(),
          sport: { $in: ['cycling', 'running', 'swimming'] }, // Include all sports
          records: { $exists: true, $ne: [] },
          ...dateFilter
        };
        fitTrainings = await FitTraining.find(query2)
          .select('timestamp records title titleManual')
          .lean();
        console.log(`Found ${fitTrainings.length} FIT trainings with userId.toString()${monthKeyParam ? ` for month ${monthKeyParam}` : ''}`);
      }
    } catch (fitError) {
      console.error('Error fetching FIT trainings:', fitError);
    }

    // Simple lactate prediction (optional - pouze pokud jsou data)
    // Pro optimalizaci: pokud máme monthKey, načteme lactate data jen z aktuálního měsíce
    const powerLactateMap = new Map();
    if (!onlyMetadata) {
      // Pro metadata nepotřebujeme lactate mapping
      fitTrainings.forEach(training => {
        if (training.records && training.records.length > 0) {
          training.records.forEach(record => {
            if (record.power && record.lactate != null && record.lactate !== undefined) {
              const power = Math.round(record.power);
              if (!powerLactateMap.has(power)) {
                powerLactateMap.set(power, []);
              }
              powerLactateMap.get(power).push(record.lactate);
            }
          });
        }
      });
    }

    const predictLactate = (power) => {
      if (powerLactateMap.size < 2) return null;
      const powerRounded = Math.round(power);
      if (powerLactateMap.has(powerRounded)) {
        const lactates = powerLactateMap.get(powerRounded);
        return lactates.reduce((a, b) => a + b, 0) / lactates.length;
      }
      const sortedPowers = Array.from(powerLactateMap.keys()).sort((a, b) => a - b);
      const lower = sortedPowers.filter(p => p < powerRounded).pop();
      const upper = sortedPowers.filter(p => p > powerRounded).shift();
      if (!lower && !upper) return null;
      if (!lower) {
        const lactates = powerLactateMap.get(upper);
        return lactates.reduce((a, b) => a + b, 0) / lactates.length;
      }
      if (!upper) {
        const lactates = powerLactateMap.get(lower);
        return lactates.reduce((a, b) => a + b, 0) / lactates.length;
      }
      const lowerLactates = powerLactateMap.get(lower);
      const upperLactates = powerLactateMap.get(upper);
      const lowerLactate = lowerLactates.reduce((a, b) => a + b, 0) / lowerLactates.length;
      const upperLactate = upperLactates.reduce((a, b) => a + b, 0) / upperLactates.length;
      const ratio = (powerRounded - lower) / (upper - lower);
      return lowerLactate + (upperLactate - lowerLactate) * ratio;
    };

    // No FTP estimation - zones must come from lactate test

    // Define heart rate zones - use from profile if available, otherwise estimate from max HR
    const getHeartRateZones = (maxHeartRate, sportType = 'cycling') => {
      // Try to get HR zones from profile first
      const userHrZones = user?.heartRateZones?.[sportType];
      if (userHrZones && userHrZones.zone1 && userHrZones.zone1.min !== undefined) {
        return {
          1: { min: userHrZones.zone1.min || 0, max: userHrZones.zone1.max || Infinity },
          2: { min: userHrZones.zone2?.min || 0, max: userHrZones.zone2?.max || Infinity },
          3: { min: userHrZones.zone3?.min || 0, max: userHrZones.zone3?.max || Infinity },
          4: { min: userHrZones.zone4?.min || 0, max: userHrZones.zone4?.max || Infinity },
          5: { min: userHrZones.zone5?.min || 0, max: userHrZones.zone5?.max || Infinity }
        };
      }
      
      // Fallback: Standard percentage-based HR zones
      // These are typical zones: 50-60%, 60-70%, 70-80%, 80-90%, 90-100% of max HR
      const safeMaxHR = Math.max(maxHeartRate, 150);
      return {
        1: { min: 0, max: safeMaxHR * 0.60 }, // 0-60% (Recovery)
        2: { min: safeMaxHR * 0.60, max: safeMaxHR * 0.70 }, // 60-70% (Aerobic)
        3: { min: safeMaxHR * 0.70, max: safeMaxHR * 0.80 }, // 70-80% (Tempo)
        4: { min: safeMaxHR * 0.80, max: safeMaxHR * 0.90 }, // 80-90% (Threshold)
        5: { min: safeMaxHR * 0.90, max: Infinity } // 90-100%+ (VO2max)
      };
    };

    // Define power zones - ONLY use zones from lactate test (profile), no FTP estimation
    const getPowerZones = (maxPower) => {
      // Use user's zones from profile (from lactate test) - REQUIRED
      if (userPowerZones && userPowerZones.zone1 && userPowerZones.zone1.min !== undefined) {
        const zones = {
          1: { min: userPowerZones.zone1.min || 0, max: userPowerZones.zone1.max || Infinity },
          2: { min: userPowerZones.zone2?.min || 0, max: userPowerZones.zone2?.max || Infinity },
          3: { min: userPowerZones.zone3?.min || 0, max: userPowerZones.zone3?.max || Infinity },
          4: { min: userPowerZones.zone4?.min || 0, max: userPowerZones.zone4?.max || Infinity },
          5: { min: userPowerZones.zone5?.min || 0, max: userPowerZones.zone5?.max || Infinity }
        };
        return zones;
      }
      
      // No zones from lactate test - use fallback (only if absolutely necessary)
      // This should rarely happen if user has completed a lactate test
      console.warn('No power zones from lactate test found in profile. Using fallback zones based on max power.');
      const safeMaxPower = Math.max(maxPower, 150);
      const fallbackFTP = safeMaxPower * 0.75;
      
      const zones = {
        1: { min: 0, max: fallbackFTP * 0.55 }, // Recovery
        2: { min: fallbackFTP * 0.55, max: fallbackFTP * 0.75 }, // Aerobic
        3: { min: fallbackFTP * 0.75, max: fallbackFTP * 0.90 }, // Tempo
        4: { min: fallbackFTP * 0.90, max: fallbackFTP * 1.05 }, // Threshold
        5: { min: fallbackFTP * 1.05, max: Infinity } // VO2max
      };
      console.warn('Using fallback zones (FTP estimated as 75% of max power):', zones);
      return zones;
    };

    // Define running pace zones - use from profile if available, otherwise use default zones
    const getRunningPaceZones = (avgPace = null) => {
      const userRunningZones = user?.powerZones?.running;
      if (userRunningZones && userRunningZones.zone1 && userRunningZones.zone1.min !== undefined) {
        return {
          1: { min: userRunningZones.zone1.min || 0, max: userRunningZones.zone1.max || Infinity },
          2: { min: userRunningZones.zone2?.min || 0, max: userRunningZones.zone2?.max || Infinity },
          3: { min: userRunningZones.zone3?.min || 0, max: userRunningZones.zone3?.max || Infinity },
          4: { min: userRunningZones.zone4?.min || 0, max: userRunningZones.zone4?.max || Infinity },
          5: { min: userRunningZones.zone5?.min || 0, max: userRunningZones.zone5?.max || Infinity }
        };
      }
      
      // Default zones based on average pace if available, otherwise use generic zones
      // Typical running zones: Recovery (slow), Aerobic, Tempo, Threshold, VO2max
      // Default: assume 5:00/km average pace, zones are +/- percentages
      // For running: lower pace (faster) = lower seconds, so zone 5 is fastest (lowest seconds)
      // Zone 1 is slowest (highest seconds), Zone 5 is fastest (lowest seconds)
      const defaultAvgPace = avgPace || 300; // 5:00/km default
      return {
        1: { min: defaultAvgPace * 1.2, max: Infinity }, // Recovery: >20% slower than avg (slowest)
        2: { min: defaultAvgPace * 1.05, max: defaultAvgPace * 1.2 }, // Aerobic: 5-20% slower
        3: { min: defaultAvgPace * 0.95, max: defaultAvgPace * 1.05 }, // Tempo: ±5% of avg
        4: { min: defaultAvgPace * 0.85, max: defaultAvgPace * 0.95 }, // Threshold: 5-15% faster
        5: { min: 0, max: defaultAvgPace * 0.85 } // VO2max: >15% faster (fastest)
      };
    };

    // Define swimming pace zones - use from profile if available
    const getSwimmingPaceZones = () => {
      const userSwimmingZones = user?.powerZones?.swimming;
      if (userSwimmingZones && userSwimmingZones.zone1 && userSwimmingZones.zone1.min !== undefined) {
        return {
          1: { min: userSwimmingZones.zone1.min || 0, max: userSwimmingZones.zone1.max || Infinity },
          2: { min: userSwimmingZones.zone2?.min || 0, max: userSwimmingZones.zone2?.max || Infinity },
          3: { min: userSwimmingZones.zone3?.min || 0, max: userSwimmingZones.zone3?.max || Infinity },
          4: { min: userSwimmingZones.zone4?.min || 0, max: userSwimmingZones.zone4?.max || Infinity },
          5: { min: userSwimmingZones.zone5?.min || 0, max: userSwimmingZones.zone5?.max || Infinity }
        };
      }
      return null;
    };

    // Group trainings by month and analyze
    const monthlyAnalysis = {};
    let fitTrainingsProcessed = 0;
    let fitTrainingsSkipped = 0;

    // If onlyMetadata, we'll just collect month keys without full analysis
    if (onlyMetadata) {
      console.log('\n=== COLLECTING MONTH METADATA (no full analysis) ===');
    } else {
      console.log(`\n=== PROCESSING FIT TRAININGS FOR MONTH: ${monthKeyParam} ===`);
    }
    for (let idx = 0; idx < fitTrainings.length; idx++) {
      const training = fitTrainings[idx];
      if (!training.timestamp || !training.records || training.records.length === 0) {
        fitTrainingsSkipped++;
        continue;
      }

      const trainingDate = new Date(training.timestamp);
      const monthKey = `${trainingDate.getFullYear()}-${String(trainingDate.getMonth() + 1).padStart(2, '0')}`;
      
      // If onlyMetadata, just count trainings per month, skip full analysis
      if (onlyMetadata) {
        if (!monthlyAnalysis[monthKey]) {
          const monthName = trainingDate.toLocaleString('cs-CZ', { month: 'long', year: 'numeric' });
          monthlyAnalysis[monthKey] = {
            month: monthName,
            monthKey: monthKey,
            trainings: 0
          };
        }
        monthlyAnalysis[monthKey].trainings++;
        fitTrainingsProcessed++;
        continue;
      }
      
      // If specific month requested, skip other months (shouldn't happen if we filtered in DB, but keep as safety)
      if (monthKeyParam && monthKey !== monthKeyParam) {
        fitTrainingsSkipped++;
        continue;
      }
      
      fitTrainingsProcessed++;
      const monthName = trainingDate.toLocaleString('cs-CZ', { month: 'long', year: 'numeric' });

      if (!monthlyAnalysis[monthKey]) {
        monthlyAnalysis[monthKey] = {
          month: monthName,
          monthKey: monthKey,
          trainings: 0,
          totalTime: 0,
          zones: {
            1: { time: 0, avgPower: 0, predictedLactate: 0, powerCount: 0 },
            2: { time: 0, avgPower: 0, predictedLactate: 0, powerCount: 0 },
            3: { time: 0, avgPower: 0, predictedLactate: 0, powerCount: 0 },
            4: { time: 0, avgPower: 0, predictedLactate: 0, powerCount: 0 },
            5: { time: 0, avgPower: 0, predictedLactate: 0, powerCount: 0 }
          },
          hrZones: {
            1: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            2: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            3: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            4: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            5: { time: 0, avgHeartRate: 0, heartRateCount: 0 }
          },
          // Separate HR zones for bike and run
          bikeHrZones: {
            1: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            2: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            3: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            4: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            5: { time: 0, avgHeartRate: 0, heartRateCount: 0 }
          },
          runningHrZones: {
            1: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            2: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            3: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            4: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            5: { time: 0, avgHeartRate: 0, heartRateCount: 0 }
          },
          runningZoneTimes: {
            1: { time: 0, avgPace: 0, paceCount: 0 },
            2: { time: 0, avgPace: 0, paceCount: 0 },
            3: { time: 0, avgPace: 0, paceCount: 0 },
            4: { time: 0, avgPace: 0, paceCount: 0 },
            5: { time: 0, avgPace: 0, paceCount: 0 }
          },
          swimmingZoneTimes: {
            1: { time: 0, avgPace: 0, paceCount: 0 },
            2: { time: 0, avgPace: 0, paceCount: 0 },
            3: { time: 0, avgPace: 0, paceCount: 0 },
            4: { time: 0, avgPace: 0, paceCount: 0 },
            5: { time: 0, avgPace: 0, paceCount: 0 }
          },
          maxPower: 0,
          avgPower: 0,
          totalPowerSum: 0,
          powerCount: 0,
          // Bike statistics (excluding running/swimming)
          bikeTotalPowerSum: 0,
          bikePowerCount: 0,
          bikeAvgPower: 0,
          bikeMaxPower: 0,
          bikeTime: 0,
          maxHeartRate: 0,
          avgHeartRate: 0,
          totalHeartRateSum: 0,
          heartRateCount: 0,
          totalTSS: 0,
          bikeTSS: 0,
          runningTSS: 0,
          // Bike statistics
          bikeTrainings: 0,
          bikeTime: 0,
          // Running statistics
          runningTrainings: 0,
          runningTime: 0,
          runningDistance: 0,
          runningTotalPaceSum: 0,
          runningPaceCount: 0,
          runningMaxPace: Infinity, // Lower is faster
          runningAvgPace: 0,
          runningMaxHeartRate: 0,
          runningAvgHeartRate: 0,
          runningTotalHeartRateSum: 0,
          runningHeartRateCount: 0,
          // Swimming statistics
          swimmingTrainings: 0,
          swimmingTime: 0,
          swimmingDistance: 0,
          trainingList: [] // List of trainings in this month
        };
      }

      // Count total trainings (for metadata)
      monthlyAnalysis[monthKey].trainings++;

      // Analyze records/laps first to get accurate maxPower and heart rate
      let maxPowerInTraining = 0;
      let avgPowerInTraining = 0;
      let totalPowerSum = 0;
      let powerCount = 0;
      let maxHeartRateInTraining = 0;
      let avgHeartRateInTraining = 0;
      let totalHeartRateSum = 0;
      let heartRateCount = 0;

      // Get training sport type
      const trainingSport = training.sport || 'generic';
      const isRunning = trainingSport === 'running';
      const isSwimming = trainingSport === 'swimming';
      const isCycling = trainingSport === 'cycling';
      
      // Track running/swimming statistics
      let runningTimeInTraining = 0;
      let runningDistanceInTraining = 0;
      let runningTotalPaceSum = 0;
      let runningPaceCount = 0;
      let runningMaxPaceInTraining = Infinity;
      let runningMaxHeartRateInTraining = 0;
      let runningTotalHeartRateSum = 0;
      let runningHeartRateCount = 0;

      // Analyze records if available
      if (training.records && training.records.length > 0) {
        let previousTimestamp = null;
        let recordsWithPower = 0;
        
        training.records.forEach((record, index) => {
        // Collect heart rate data
        if (record.heartRate && record.heartRate > 0) {
          const hr = record.heartRate;
          maxHeartRateInTraining = Math.max(maxHeartRateInTraining, hr);
          totalHeartRateSum += hr;
          heartRateCount++;
          
          // Track heart rate in monthly analysis
          monthlyAnalysis[monthKey].maxHeartRate = Math.max(monthlyAnalysis[monthKey].maxHeartRate, hr);
          monthlyAnalysis[monthKey].totalHeartRateSum += hr;
          monthlyAnalysis[monthKey].heartRateCount++;
          
          // Track running heart rate separately
          if (isRunning) {
            runningMaxHeartRateInTraining = Math.max(runningMaxHeartRateInTraining, hr);
            runningTotalHeartRateSum += hr;
            runningHeartRateCount++;
            monthlyAnalysis[monthKey].runningMaxHeartRate = Math.max(monthlyAnalysis[monthKey].runningMaxHeartRate || 0, hr);
            monthlyAnalysis[monthKey].runningTotalHeartRateSum += hr;
            monthlyAnalysis[monthKey].runningHeartRateCount++;
          }
          
          // Determine HR zone (use same time increment as power if available)
          let hrTimeIncrement = 1;
          if (record.timestamp && previousTimestamp) {
            const timeDiff = (new Date(record.timestamp) - new Date(previousTimestamp)) / 1000;
            if (timeDiff > 0 && timeDiff < 10) {
              hrTimeIncrement = timeDiff;
            }
          }
          
          // Determine HR zone based on sport type
          const maxHR = isRunning 
            ? (monthlyAnalysis[monthKey].runningMaxHeartRate || monthlyAnalysis[monthKey].maxHeartRate)
            : monthlyAnalysis[monthKey].maxHeartRate;
          const sportType = isRunning ? 'running' : 'cycling';
          const hrZones = getHeartRateZones(maxHR, sportType);
          let hrZone = 1;
          if (hr >= hrZones[5].min) hrZone = 5;
          else if (hr >= hrZones[4].min) hrZone = 4;
          else if (hr >= hrZones[3].min) hrZone = 3;
          else if (hr >= hrZones[2].min) hrZone = 2;
          
          // Add time to HR zone (both general and sport-specific)
          monthlyAnalysis[monthKey].hrZones[hrZone].time += hrTimeIncrement;
          monthlyAnalysis[monthKey].hrZones[hrZone].avgHeartRate += hr * hrTimeIncrement;
          monthlyAnalysis[monthKey].hrZones[hrZone].heartRateCount += hrTimeIncrement;
          
          // Add to sport-specific HR zones
          if (isRunning) {
            monthlyAnalysis[monthKey].runningHrZones[hrZone].time += hrTimeIncrement;
            monthlyAnalysis[monthKey].runningHrZones[hrZone].avgHeartRate += hr * hrTimeIncrement;
            monthlyAnalysis[monthKey].runningHrZones[hrZone].heartRateCount += hrTimeIncrement;
          } else if (isCycling) {
            monthlyAnalysis[monthKey].bikeHrZones[hrZone].time += hrTimeIncrement;
            monthlyAnalysis[monthKey].bikeHrZones[hrZone].avgHeartRate += hr * hrTimeIncrement;
            monthlyAnalysis[monthKey].bikeHrZones[hrZone].heartRateCount += hrTimeIncrement;
          }
        }
        
        // Calculate time increment (1 second default, or actual difference)
        let timeIncrement = 1;
        if (record.timestamp && previousTimestamp) {
          const timeDiff = (new Date(record.timestamp) - new Date(previousTimestamp)) / 1000;
          if (timeDiff > 0 && timeDiff < 10) {
            timeIncrement = timeDiff;
          }
        }
        if (record.timestamp) {
          previousTimestamp = record.timestamp;
        }

        // Process power zones for cycling
        if (isCycling && record.power && record.power > 0) {
          recordsWithPower++;
          const power = record.power;
          maxPowerInTraining = Math.max(maxPowerInTraining, power);
          totalPowerSum += power;
          powerCount++;
          monthlyAnalysis[monthKey].totalPowerSum += power;
          monthlyAnalysis[monthKey].powerCount++;
          
          // Track bike-specific statistics (excluding running/swimming)
          monthlyAnalysis[monthKey].bikeTotalPowerSum += power * timeIncrement;
          monthlyAnalysis[monthKey].bikePowerCount += timeIncrement;
          monthlyAnalysis[monthKey].bikeMaxPower = Math.max(monthlyAnalysis[monthKey].bikeMaxPower || 0, power);
          monthlyAnalysis[monthKey].bikeTime += timeIncrement;

          monthlyAnalysis[monthKey].maxPower = Math.max(monthlyAnalysis[monthKey].maxPower, power);
          monthlyAnalysis[monthKey].totalTime += timeIncrement;

          // Determine zone - use global FTP estimate
          const zones = getPowerZones(monthlyAnalysis[monthKey].maxPower);
          
          let zone = 1;
          if (power >= zones[5].min) zone = 5;
          else if (power >= zones[4].min) zone = 4;
          else if (power >= zones[3].min) zone = 3;
          else if (power >= zones[2].min) zone = 2;
          
          // Add time to zone
          monthlyAnalysis[monthKey].zones[zone].time += timeIncrement;
          monthlyAnalysis[monthKey].zones[zone].avgPower += power * timeIncrement;
          monthlyAnalysis[monthKey].zones[zone].powerCount += timeIncrement;

          // Predict lactate
          const predictedLactate = predictLactate(power);
          if (predictedLactate !== null) {
            monthlyAnalysis[monthKey].zones[zone].predictedLactate += predictedLactate * timeIncrement;
          }
        }
        // Process running pace zones
        else if (isRunning && record.speed && record.speed > 0) {
          // Calculate pace in seconds per km (pace = 1000 / speed in m/s)
          const paceSeconds = 1000 / record.speed;
          
          monthlyAnalysis[monthKey].totalTime += timeIncrement;
          runningTimeInTraining += timeIncrement;
          
          // Track running statistics (weighted by time)
          runningTotalPaceSum += paceSeconds * timeIncrement;
          runningPaceCount += timeIncrement;
          if (paceSeconds < runningMaxPaceInTraining) {
            runningMaxPaceInTraining = paceSeconds;
          }
          if (record.distance) {
            runningDistanceInTraining += record.distance;
          }

          // Always calculate zones, even if not from profile (use default zones)
          // Use current average pace for default zones if no profile zones
          const currentAvgPace = monthlyAnalysis[monthKey].runningPaceCount > 0 
            ? monthlyAnalysis[monthKey].runningTotalPaceSum / monthlyAnalysis[monthKey].runningPaceCount 
            : paceSeconds;
          const runningZones = getRunningPaceZones(currentAvgPace);
          
          // Always calculate zones (will use default if no profile zones)
          if (runningZones) {
            let zone = 1; // Default to slowest zone
            // For running, lower pace (faster) = lower seconds
            // Zone 5 is fastest (lowest seconds), Zone 1 is slowest (highest seconds)
            // Check from fastest to slowest using min/max boundaries
            // Zone 5: pace >= min and <= max (fastest)
            if (paceSeconds >= runningZones[5].min && paceSeconds <= runningZones[5].max) {
              zone = 5; // Fastest
            } 
            // Zone 4: pace >= min and <= max
            else if (paceSeconds >= runningZones[4].min && paceSeconds <= runningZones[4].max) {
              zone = 4;
            } 
            // Zone 3: pace >= min and <= max
            else if (paceSeconds >= runningZones[3].min && paceSeconds <= runningZones[3].max) {
              zone = 3;
            } 
            // Zone 2: pace >= min and <= max
            else if (paceSeconds >= runningZones[2].min && paceSeconds <= runningZones[2].max) {
              zone = 2;
            }
            // Zone 1 is default (slowest - pace >= min or pace > max)
            
            // Add time to running zone
            monthlyAnalysis[monthKey].runningZoneTimes[zone].time += timeIncrement;
            monthlyAnalysis[monthKey].runningZoneTimes[zone].avgPace += paceSeconds * timeIncrement;
            monthlyAnalysis[monthKey].runningZoneTimes[zone].paceCount += timeIncrement;
          }
        }
        // Process swimming pace zones
        else if (isSwimming && record.speed && record.speed > 0) {
          // Calculate pace in seconds per 100m (pace = 100 / speed in m/s)
          const paceSeconds = 100 / record.speed;
          
          monthlyAnalysis[monthKey].totalTime += timeIncrement;

          // Get swimming pace zones from profile (if available in future)
          const swimmingZones = getSwimmingPaceZones();
          if (swimmingZones) {
            let zone = 1;
            // For swimming, lower pace (faster) = lower seconds
            if (paceSeconds <= swimmingZones[5].max) zone = 5;
            else if (paceSeconds <= swimmingZones[4].max) zone = 4;
            else if (paceSeconds <= swimmingZones[3].max) zone = 3;
            else if (paceSeconds <= swimmingZones[2].max) zone = 2;
            
            // Add time to swimming zone
            monthlyAnalysis[monthKey].swimmingZoneTimes[zone].time += timeIncrement;
            monthlyAnalysis[monthKey].swimmingZoneTimes[zone].avgPace += paceSeconds * timeIncrement;
            monthlyAnalysis[monthKey].swimmingZoneTimes[zone].paceCount += timeIncrement;
          }
        }
        else if (record.timestamp && previousTimestamp) {
          // Even without power/speed, track time
          monthlyAnalysis[monthKey].totalTime += timeIncrement;
        }
        });
      }

      // Only use laps for heart rate data if records don't have it, but don't use laps for zone time calculation
      // Zone time is calculated from records only (whole FIT file)
      if (training.laps && training.laps.length > 0 && heartRateCount === 0) {
        // Only use laps for heart rate if we don't have it from records
        training.laps.forEach(lap => {
          const lapHeartRate = lap.avgHeartRate || lap.maxHeartRate || 0;
          const lapMaxHeartRate = lap.maxHeartRate || lapHeartRate;
          const elapsedTime = lap.totalElapsedTime || lap.totalTimerTime || 0;

          if (lapHeartRate > 0 && elapsedTime > 0) {
            maxHeartRateInTraining = Math.max(maxHeartRateInTraining, lapMaxHeartRate || lapHeartRate);
            totalHeartRateSum += lapHeartRate * elapsedTime;
            heartRateCount += elapsedTime;
          }
        });
      }

      // Calculate averages
      avgPowerInTraining = powerCount > 0 ? totalPowerSum / powerCount : (training.avgPower || 0);
      avgHeartRateInTraining = heartRateCount > 0 ? totalHeartRateSum / heartRateCount : (training.avgHeartRate || 0);
      
      // Use calculated maxPower or fallback to training.maxPower
      maxPowerInTraining = maxPowerInTraining || training.maxPower || 0;
      maxHeartRateInTraining = maxHeartRateInTraining || training.maxHeartRate || 0;
      
      // Count trainings by sport type
      if (isRunning) {
        monthlyAnalysis[monthKey].runningTrainings++;
        // Always add running time (calculated from records/zone times)
        monthlyAnalysis[monthKey].runningTime += runningTimeInTraining;
        if (runningTimeInTraining > 0) {
          monthlyAnalysis[monthKey].runningDistance += runningDistanceInTraining || training.totalDistance || 0;
          monthlyAnalysis[monthKey].runningTotalPaceSum += runningTotalPaceSum;
          monthlyAnalysis[monthKey].runningPaceCount += runningPaceCount;
          if (runningMaxPaceInTraining < monthlyAnalysis[monthKey].runningMaxPace) {
            monthlyAnalysis[monthKey].runningMaxPace = runningMaxPaceInTraining;
          }
        }
        monthlyAnalysis[monthKey].runningMaxHeartRate = Math.max(monthlyAnalysis[monthKey].runningMaxHeartRate || 0, runningMaxHeartRateInTraining);
        // Also add total time if we have it from training and no records processed
        if (runningTimeInTraining === 0 && training.totalElapsedTime) {
          monthlyAnalysis[monthKey].runningTime += training.totalElapsedTime || training.totalTimerTime || 0;
        }
      } else if (isSwimming) {
        monthlyAnalysis[monthKey].swimmingTrainings++;
        // Swimming time is already added in the swimming pace processing section
      } else if (isCycling || !isRunning && !isSwimming) {
        // Count as bike if it's cycling or if it's not running/swimming (default to bike)
        monthlyAnalysis[monthKey].bikeTrainings++;
      }

      // Store training info for this month (after analysis to get accurate values)
      if (!monthlyAnalysis[monthKey].trainingList) {
        monthlyAnalysis[monthKey].trainingList = [];
      }
      const trainingInfo = {
        id: training._id?.toString() || training.id?.toString(),
        type: 'fit',
        timestamp: training.timestamp,
        date: trainingDate.toISOString(),
        title: training.title || `Training ${trainingDate.toLocaleDateString('cs-CZ')}`,
        avgPower: Math.round(avgPowerInTraining),
        maxPower: Math.round(maxPowerInTraining),
        avgHeartRate: Math.round(avgHeartRateInTraining) || 0,
        maxHeartRate: Math.round(maxHeartRateInTraining) || 0,
        totalTime: training.totalElapsedTime || training.totalTimerTime || 0,
        totalDistance: training.totalDistance || 0,
        cadence: training.avgCadence || 0,
        speed: training.avgSpeed || 0
      };
      monthlyAnalysis[monthKey].trainingList.push(trainingInfo);
    }

    // Get Strava activities from database (same as in calendar)
    let stravaActivities = [];
    try {
      const StravaActivity = require('../models/StravaActivity');
      const mongoose = require('mongoose');
      let userIdObj = null;
      try {
        userIdObj = new mongoose.Types.ObjectId(targetAthleteIdStr);
        console.log('Strava: Using ObjectId format:', userIdObj);
      } catch (e) {
        console.log('Strava: Using string format:', targetAthleteIdStr);
      }
      
      const query = userIdObj 
        ? { userId: userIdObj, sport: { $in: ['Ride', 'VirtualRide', 'EBikeRide', 'Run', 'VirtualRun', 'Walk', 'Hike', 'Swim'] } }
        : { userId: targetAthleteIdStr, sport: { $in: ['Ride', 'VirtualRide', 'EBikeRide', 'Run', 'VirtualRun', 'Walk', 'Hike', 'Swim'] } };
      
      stravaActivities = await StravaActivity.find(query)
        .select('startDate stravaId averagePower averageHeartRate averageSpeed average_speed movingTime elapsedTime distance sport name raw')
        .lean();


      // If no results, try with ObjectId format
      if (stravaActivities.length === 0 && userId && userId.toString && userId.toString() !== targetAthleteIdStr) {
        try {
          const userIdObj2 = new mongoose.Types.ObjectId(userId.toString());
          stravaActivities = await StravaActivity.find({ 
            userId: userIdObj2,
            sport: { $in: ['Ride', 'VirtualRide', 'EBikeRide', 'Run', 'VirtualRun', 'Walk', 'Hike', 'Swim'] }
          })
          .select('startDate stravaId averagePower')
          .lean();
          console.log(`Found ${stravaActivities.length} Strava activities with userId ObjectId`);
        } catch (e) {
          console.log('Strava: Error with ObjectId format:', e.message);
        }
      }
    } catch (stravaError) {
      console.error('Error fetching Strava activities:', stravaError);
    }

    // Process Strava activities (same logic as FIT files - second by second from streams)
    let stravaProcessed = 0;
    let stravaSkipped = 0;
    
    for (let idx = 0; idx < stravaActivities.length; idx++) {
      const activity = stravaActivities[idx];
      if (!activity.startDate) {
        stravaSkipped++;
        continue;
      }
      
      const activityDate = new Date(activity.startDate);
      const monthKey = `${activityDate.getFullYear()}-${String(activityDate.getMonth() + 1).padStart(2, '0')}`;
      
      // If onlyMetadata, just count activities per month
      if (onlyMetadata) {
        if (!monthlyAnalysis[monthKey]) {
          const monthName = activityDate.toLocaleString('cs-CZ', { month: 'long', year: 'numeric' });
          monthlyAnalysis[monthKey] = {
            month: monthName,
            monthKey: monthKey,
            trainings: 0
          };
        }
        monthlyAnalysis[monthKey].trainings++;
        stravaProcessed++;
        continue;
      }
      
      // If specific month requested, skip other months (shouldn't happen if we filtered in DB, but keep as safety)
      if (monthKeyParam && monthKey !== monthKeyParam) {
        stravaSkipped++;
        continue;
      }
      
      // Load streams from Strava API for second-by-second data
      let streams = null;
      try {
        const axios = require('axios');
        const integrationsRoutes = require('../routes/integrationsRoutes');
        const getValidStravaToken = integrationsRoutes.getValidStravaToken;
        const User = require('../models/UserModel');
        const user = await User.findById(userId);
        
        if (!user || !getValidStravaToken) {
          stravaSkipped++;
          continue;
        }
        
        const token = await getValidStravaToken(user);
        if (!token || !activity.stravaId) {
          stravaSkipped++;
          continue;
        }
        
        // Get sport type from activity
        const activitySport = activity.sport || activity.sport_type || 'Ride';
        const isStravaRunning = ['Run', 'VirtualRun', 'Walk', 'Hike'].includes(activitySport);
        const isStravaSwimming = ['Swim'].includes(activitySport);
        
        // Request appropriate streams based on sport
        const streamKeys = isStravaRunning || isStravaSwimming 
          ? 'time,velocity_smooth,heartrate' // velocity_smooth for pace calculation
          : 'time,watts,heartrate'; // watts for cycling
        
        const streamsResp = await axios.get(`https://www.strava.com/api/v3/activities/${activity.stravaId}/streams`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { keys: streamKeys, key_by_type: true },
          timeout: 5000 // Zkrácený timeout na 5 sekund
        });
        streams = streamsResp.data;
      } catch (streamError) {
        // If streams fail, use database data as fallback
        streams = null;
      }
      
      // Get sport type from activity (need to check before using streams)
      const activitySport = activity.sport || activity.sport_type || 'Ride';
      const isStravaRunning = ['Run', 'VirtualRun', 'Walk', 'Hike'].includes(activitySport);
      const isStravaSwimming = ['Swim'].includes(activitySport);
      const isStravaCycling = !isStravaRunning && !isStravaSwimming;
      
      // Check if we have required streams based on sport type
      const hasPowerStream = streams && streams.watts && streams.watts.data && streams.watts.data.length > 0;
      const hasSpeedStream = streams && streams.velocity_smooth && streams.velocity_smooth.data && streams.velocity_smooth.data.length > 0;
      
      // If no streams, use database data (averagePower, averageHeartRate, movingTime)
      const useDatabaseData = !streams || (!hasPowerStream && !hasSpeedStream);
      
      if (!useDatabaseData) {
        if ((isStravaRunning || isStravaSwimming) && !hasSpeedStream) {
          stravaSkipped++;
          continue;
        }
        if (!isStravaRunning && !isStravaSwimming && !hasPowerStream) {
          stravaSkipped++;
          continue;
        }
      }
      
      const monthName = activityDate.toLocaleString('cs-CZ', { month: 'long', year: 'numeric' });

      if (!monthlyAnalysis[monthKey]) {
        monthlyAnalysis[monthKey] = {
          month: monthName,
          monthKey: monthKey,
          trainings: 0,
          totalTime: 0,
          zones: {
            1: { time: 0, avgPower: 0, predictedLactate: 0, powerCount: 0 },
            2: { time: 0, avgPower: 0, predictedLactate: 0, powerCount: 0 },
            3: { time: 0, avgPower: 0, predictedLactate: 0, powerCount: 0 },
            4: { time: 0, avgPower: 0, predictedLactate: 0, powerCount: 0 },
            5: { time: 0, avgPower: 0, predictedLactate: 0, powerCount: 0 }
          },
          hrZones: {
            1: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            2: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            3: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            4: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            5: { time: 0, avgHeartRate: 0, heartRateCount: 0 }
          },
          // Separate HR zones for bike and run
          bikeHrZones: {
            1: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            2: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            3: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            4: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            5: { time: 0, avgHeartRate: 0, heartRateCount: 0 }
          },
          runningHrZones: {
            1: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            2: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            3: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            4: { time: 0, avgHeartRate: 0, heartRateCount: 0 },
            5: { time: 0, avgHeartRate: 0, heartRateCount: 0 }
          },
          runningZoneTimes: {
            1: { time: 0, avgPace: 0, paceCount: 0 },
            2: { time: 0, avgPace: 0, paceCount: 0 },
            3: { time: 0, avgPace: 0, paceCount: 0 },
            4: { time: 0, avgPace: 0, paceCount: 0 },
            5: { time: 0, avgPace: 0, paceCount: 0 }
          },
          swimmingZoneTimes: {
            1: { time: 0, avgPace: 0, paceCount: 0 },
            2: { time: 0, avgPace: 0, paceCount: 0 },
            3: { time: 0, avgPace: 0, paceCount: 0 },
            4: { time: 0, avgPace: 0, paceCount: 0 },
            5: { time: 0, avgPace: 0, paceCount: 0 }
          },
          maxPower: 0,
          avgPower: 0,
          totalPowerSum: 0,
          powerCount: 0,
          // Bike statistics (excluding running/swimming)
          bikeTotalPowerSum: 0,
          bikePowerCount: 0,
          bikeAvgPower: 0,
          bikeMaxPower: 0,
          bikeTime: 0,
          maxHeartRate: 0,
          avgHeartRate: 0,
          totalHeartRateSum: 0,
          heartRateCount: 0,
          totalTSS: 0,
          bikeTSS: 0,
          runningTSS: 0,
          // Bike statistics (excluding running/swimming)
          bikeTrainings: 0,
          bikeTime: 0,
          bikeTotalPowerSum: 0,
          bikePowerCount: 0,
          bikeAvgPower: 0,
          bikeMaxPower: 0,
          // Running statistics
          runningTrainings: 0,
          runningTime: 0,
          runningDistance: 0,
          runningTotalPaceSum: 0,
          runningPaceCount: 0,
          runningMaxPace: Infinity, // Lower is faster
          runningAvgPace: 0,
          runningMaxHeartRate: 0,
          runningAvgHeartRate: 0,
          runningTotalHeartRateSum: 0,
          runningHeartRateCount: 0,
          // Swimming statistics
          swimmingTrainings: 0,
          swimmingTime: 0,
          swimmingDistance: 0,
          trainingList: []
        };
      }

      monthlyAnalysis[monthKey].trainings++;

      // Use database data if streams are not available
      if (useDatabaseData) {
        // Use data from database (averagePower, averageHeartRate, movingTime/elapsedTime)
        const stravaTotalTime = activity.movingTime || activity.elapsedTime || 0;
        const stravaAvgPower = activity.averagePower || 0;
        const stravaAvgHeartRate = activity.averageHeartRate || 0;
        
        // Try to get max power from raw data (max_watts or similar)
        let stravaMaxPower = stravaAvgPower;
        if (activity.raw) {
          // Check various possible locations for max power
          stravaMaxPower = activity.raw.max_watts || 
                          activity.raw.maxWatts || 
                          activity.raw.weighted_average_watts || 
                          (stravaAvgPower * 1.3); // Approximate max as 1.3x average if not available
        } else {
          // Approximate max power as 1.3x average if no raw data
          stravaMaxPower = stravaAvgPower > 0 ? stravaAvgPower * 1.3 : 0;
        }
        
        // Try to get max heart rate from raw data
        let stravaMaxHeartRate = stravaAvgHeartRate;
        if (activity.raw) {
          stravaMaxHeartRate = activity.raw.max_heartrate || 
                              activity.raw.maxHeartRate || 
                              (stravaAvgHeartRate * 1.15); // Approximate max as 1.15x average
        } else {
          stravaMaxHeartRate = stravaAvgHeartRate > 0 ? stravaAvgHeartRate * 1.15 : 0;
        }
        
        // Update statistics for Strava activities by sport type
        if (isStravaRunning) {
          // Ensure runningTrainings is initialized
          if (monthlyAnalysis[monthKey].runningTrainings === undefined) {
            monthlyAnalysis[monthKey].runningTrainings = 0;
          }
          monthlyAnalysis[monthKey].runningTrainings++;
          monthlyAnalysis[monthKey].runningTime += stravaTotalTime;
          if (activity.distance) {
            monthlyAnalysis[monthKey].runningDistance += activity.distance;
          }
          
          // Calculate average pace from database (averageSpeed in m/s or from distance/time)
          let stravaAvgSpeed = activity.averageSpeed || activity.average_speed || 0;
          if (!stravaAvgSpeed && activity.distance && stravaTotalTime > 0) {
            // Calculate from distance and time: speed = distance / time (m/s)
            stravaAvgSpeed = activity.distance / stravaTotalTime;
          }
          
          if (stravaAvgSpeed > 0) {
            // Convert speed (m/s) to pace (seconds per km)
            const paceSeconds = 1000 / stravaAvgSpeed;
            monthlyAnalysis[monthKey].runningTotalPaceSum += paceSeconds * stravaTotalTime;
            monthlyAnalysis[monthKey].runningPaceCount += stravaTotalTime;
            // Update max pace (lower is faster, so we want the minimum pace value)
            if (paceSeconds < monthlyAnalysis[monthKey].runningMaxPace) {
              monthlyAnalysis[monthKey].runningMaxPace = paceSeconds;
            }
          }
          
          if (stravaMaxHeartRate > 0) {
            monthlyAnalysis[monthKey].runningMaxHeartRate = Math.max(monthlyAnalysis[monthKey].runningMaxHeartRate || 0, stravaMaxHeartRate);
            monthlyAnalysis[monthKey].runningTotalHeartRateSum += stravaAvgHeartRate * stravaTotalTime;
            monthlyAnalysis[monthKey].runningHeartRateCount += stravaTotalTime;
          }
        } else if (isStravaSwimming) {
          monthlyAnalysis[monthKey].swimmingTrainings++;
          monthlyAnalysis[monthKey].swimmingTime += stravaTotalTime;
          if (activity.distance) {
            monthlyAnalysis[monthKey].swimmingDistance += activity.distance;
          }
        } else {
          // Default to bike for cycling or other activities
          monthlyAnalysis[monthKey].bikeTrainings++;
          monthlyAnalysis[monthKey].bikeTime += stravaTotalTime;
          monthlyAnalysis[monthKey].totalTime += stravaTotalTime;
          
          // Use averagePower from database for bike statistics
          if (stravaAvgPower > 0) {
            monthlyAnalysis[monthKey].bikeTotalPowerSum += stravaAvgPower * stravaTotalTime;
            monthlyAnalysis[monthKey].bikePowerCount += stravaTotalTime;
            monthlyAnalysis[monthKey].bikeMaxPower = Math.max(monthlyAnalysis[monthKey].bikeMaxPower || 0, stravaMaxPower);
            monthlyAnalysis[monthKey].maxPower = Math.max(monthlyAnalysis[monthKey].maxPower || 0, stravaMaxPower);
            monthlyAnalysis[monthKey].totalPowerSum += stravaAvgPower * stravaTotalTime;
            monthlyAnalysis[monthKey].powerCount += stravaTotalTime;
          }
          
          // Use averageHeartRate from database
          if (stravaAvgHeartRate > 0) {
            monthlyAnalysis[monthKey].maxHeartRate = Math.max(monthlyAnalysis[monthKey].maxHeartRate || 0, stravaMaxHeartRate);
            monthlyAnalysis[monthKey].totalHeartRateSum += stravaAvgHeartRate * stravaTotalTime;
            monthlyAnalysis[monthKey].heartRateCount += stravaTotalTime;
          }
        }
        
        // Store Strava activity info
        if (!monthlyAnalysis[monthKey].trainingList) {
          monthlyAnalysis[monthKey].trainingList = [];
        }
        const stravaTrainingInfo = {
          id: activity._id?.toString() || activity.id?.toString(),
          type: 'strava',
          timestamp: activity.startDate,
          date: activityDate.toISOString(),
          title: activity.name || `Strava Activity ${activityDate.toLocaleDateString('cs-CZ')}`,
          avgPower: Math.round(stravaAvgPower),
          maxPower: Math.round(stravaAvgPower), // Use avg as max if no stream data
          avgHeartRate: Math.round(stravaAvgHeartRate) || 0,
          maxHeartRate: Math.round(stravaAvgHeartRate) || 0,
          totalTime: stravaTotalTime
        };
        monthlyAnalysis[monthKey].trainingList.push(stravaTrainingInfo);
        stravaProcessed++;
        continue; // Skip stream processing
      }

      // Analyze Strava streams (sekundu po sekundě) stejně jako records pro FIT tréninky
      const timeStream = streams.time?.data || [];
      const powerStream = streams.watts?.data || [];
      const speedStream = streams.velocity_smooth?.data || [];
      const heartRateStream = streams.heartrate?.data || [];
      
      let stravaMaxPower = 0;
      let stravaAvgPower = 0;
      let stravaMaxHeartRate = 0;
      let stravaAvgHeartRate = 0;
      let stravaTotalTime = 0;
      let totalPowerSum = 0;
      let powerCount = 0;
      let totalHeartRateSum = 0;
      let heartRateCount = 0;
      let recordsWithPower = 0;
      
      // Determine which stream to use based on sport
      const dataStream = isStravaCycling ? powerStream : speedStream;
      const streamLength = Math.max(powerStream.length, speedStream.length);
      
      // Projdeme každý datový bod v streams (sekundu po sekundě)
      for (let i = 0; i < streamLength; i++) {
        const power = powerStream[i] || 0;
        const speed = speedStream[i] || 0; // m/s
        const heartRate = heartRateStream[i] || 0;
        
        // Calculate time increment
        let timeIncrement = 1;
        if (i > 0 && timeStream[i] && timeStream[i - 1]) {
          const timeDiff = timeStream[i] - timeStream[i - 1];
          if (timeDiff > 0 && timeDiff < 10) {
            timeIncrement = timeDiff;
          }
        }
        
        // Process cycling power zones
        if (isStravaCycling && power && power > 0) {
          recordsWithPower++;
          stravaMaxPower = Math.max(stravaMaxPower, power);
          totalPowerSum += power;
          powerCount++;
          
          monthlyAnalysis[monthKey].totalPowerSum += power;
          monthlyAnalysis[monthKey].powerCount++;
          
          // Track bike-specific statistics (excluding running/swimming)
          monthlyAnalysis[monthKey].bikeTotalPowerSum += power * timeIncrement;
          monthlyAnalysis[monthKey].bikePowerCount += timeIncrement;
          monthlyAnalysis[monthKey].bikeMaxPower = Math.max(monthlyAnalysis[monthKey].bikeMaxPower || 0, power);
          monthlyAnalysis[monthKey].bikeTime += timeIncrement;
          
          monthlyAnalysis[monthKey].maxPower = Math.max(monthlyAnalysis[monthKey].maxPower, power);
          monthlyAnalysis[monthKey].totalTime += timeIncrement;
          stravaTotalTime += timeIncrement;

          // Determine zone
          const zones = getPowerZones(monthlyAnalysis[monthKey].maxPower);
          let zone = 1;
          if (power >= zones[5].min) zone = 5;
          else if (power >= zones[4].min) zone = 4;
          else if (power >= zones[3].min) zone = 3;
          else if (power >= zones[2].min) zone = 2;

          // Add time to zone (sekundu po sekundě)
          monthlyAnalysis[monthKey].zones[zone].time += timeIncrement;
          monthlyAnalysis[monthKey].zones[zone].avgPower += power * timeIncrement;
          monthlyAnalysis[monthKey].zones[zone].powerCount += timeIncrement;

          // Predict lactate
          const predictedLactate = predictLactate(power);
          if (predictedLactate !== null) {
            monthlyAnalysis[monthKey].zones[zone].predictedLactate += predictedLactate * timeIncrement;
          }
        }
        // Process running pace zones
        else if (isStravaRunning && speed && speed > 0) {
          // Calculate pace in seconds per km (pace = 1000 / speed in m/s)
          const paceSeconds = 1000 / speed;
          
          monthlyAnalysis[monthKey].totalTime += timeIncrement;
          stravaTotalTime += timeIncrement;
          
          // Update running pace statistics for monthly analysis
          monthlyAnalysis[monthKey].runningTotalPaceSum += paceSeconds * timeIncrement;
          monthlyAnalysis[monthKey].runningPaceCount += timeIncrement;
          if (paceSeconds < monthlyAnalysis[monthKey].runningMaxPace) {
            monthlyAnalysis[monthKey].runningMaxPace = paceSeconds;
          }

          // Always calculate zones, even if not from profile (use default zones)
          // Use current average pace for default zones if no profile zones
          const currentAvgPace = monthlyAnalysis[monthKey].runningPaceCount > 0 
            ? monthlyAnalysis[monthKey].runningTotalPaceSum / monthlyAnalysis[monthKey].runningPaceCount 
            : paceSeconds;
          const runningZones = getRunningPaceZones(currentAvgPace);
          
          // Always calculate zones (will use default if no profile zones)
          if (runningZones) {
            let zone = 1; // Default to slowest zone
            // Check from fastest to slowest (lowest seconds to highest seconds)
            if (paceSeconds <= runningZones[5].max) { // Fastest zone
              zone = 5;
            } else if (paceSeconds <= runningZones[4].max) {
              zone = 4;
            } else if (paceSeconds <= runningZones[3].max) {
              zone = 3;
            } else if (paceSeconds <= runningZones[2].max) {
              zone = 2;
            }
            // Zone 1 is default (slowest)
            
            // Add time to running zone
            monthlyAnalysis[monthKey].runningZoneTimes[zone].time += timeIncrement;
            monthlyAnalysis[monthKey].runningZoneTimes[zone].avgPace += paceSeconds * timeIncrement;
            monthlyAnalysis[monthKey].runningZoneTimes[zone].paceCount += timeIncrement;
          }
        }
        // Process swimming pace zones
        else if (isStravaSwimming && speed && speed > 0) {
          // Calculate pace in seconds per 100m (pace = 100 / speed in m/s)
          const paceSeconds = 100 / speed;
          
          monthlyAnalysis[monthKey].totalTime += timeIncrement;
          stravaTotalTime += timeIncrement;

          // Get swimming pace zones from profile
          const swimmingZones = getSwimmingPaceZones();
          if (swimmingZones) {
            let zone = 1;
            // For swimming, lower pace (faster) = lower seconds
            if (paceSeconds <= swimmingZones[5].max) zone = 5;
            else if (paceSeconds <= swimmingZones[4].max) zone = 4;
            else if (paceSeconds <= swimmingZones[3].max) zone = 3;
            else if (paceSeconds <= swimmingZones[2].max) zone = 2;
            
            // Add time to swimming zone
            monthlyAnalysis[monthKey].swimmingZoneTimes[zone].time += timeIncrement;
            monthlyAnalysis[monthKey].swimmingZoneTimes[zone].avgPace += paceSeconds * timeIncrement;
            monthlyAnalysis[monthKey].swimmingZoneTimes[zone].paceCount += timeIncrement;
          }
        }
        else if (timeStream[i]) {
          // Track time even without power/speed
          monthlyAnalysis[monthKey].totalTime += timeIncrement;
          stravaTotalTime += timeIncrement;
        }
        
        // Collect heart rate data
        if (heartRate && heartRate > 0) {
          stravaMaxHeartRate = Math.max(stravaMaxHeartRate, heartRate);
          totalHeartRateSum += heartRate;
          heartRateCount++;
          
          // Track heart rate in monthly analysis
          monthlyAnalysis[monthKey].maxHeartRate = Math.max(monthlyAnalysis[monthKey].maxHeartRate, heartRate);
          monthlyAnalysis[monthKey].totalHeartRateSum += heartRate;
          monthlyAnalysis[monthKey].heartRateCount++;
          
          // Calculate time increment for HR zones (same as power)
          let hrTimeIncrement = 1;
          if (i > 0 && timeStream[i] && timeStream[i - 1]) {
            const timeDiff = timeStream[i] - timeStream[i - 1];
            if (timeDiff > 0 && timeDiff < 10) {
              hrTimeIncrement = timeDiff;
            }
          }
          
          // Determine HR zone based on sport type
          const maxHR = isStravaRunning 
            ? (monthlyAnalysis[monthKey].runningMaxHeartRate || monthlyAnalysis[monthKey].maxHeartRate)
            : monthlyAnalysis[monthKey].maxHeartRate;
          const sportType = isStravaRunning ? 'running' : 'cycling';
          const hrZones = getHeartRateZones(maxHR, sportType);
          let hrZone = 1;
          if (heartRate >= hrZones[5].min) hrZone = 5;
          else if (heartRate >= hrZones[4].min) hrZone = 4;
          else if (heartRate >= hrZones[3].min) hrZone = 3;
          else if (heartRate >= hrZones[2].min) hrZone = 2;
          
          // Add time to HR zone (both general and sport-specific)
          monthlyAnalysis[monthKey].hrZones[hrZone].time += hrTimeIncrement;
          monthlyAnalysis[monthKey].hrZones[hrZone].avgHeartRate += heartRate * hrTimeIncrement;
          monthlyAnalysis[monthKey].hrZones[hrZone].heartRateCount += hrTimeIncrement;
          
          // Add to sport-specific HR zones
          if (isStravaRunning) {
            monthlyAnalysis[monthKey].runningHrZones[hrZone].time += hrTimeIncrement;
            monthlyAnalysis[monthKey].runningHrZones[hrZone].avgHeartRate += heartRate * hrTimeIncrement;
            monthlyAnalysis[monthKey].runningHrZones[hrZone].heartRateCount += hrTimeIncrement;
          } else if (isStravaCycling) {
            monthlyAnalysis[monthKey].bikeHrZones[hrZone].time += hrTimeIncrement;
            monthlyAnalysis[monthKey].bikeHrZones[hrZone].avgHeartRate += heartRate * hrTimeIncrement;
            monthlyAnalysis[monthKey].bikeHrZones[hrZone].heartRateCount += hrTimeIncrement;
          }
        }
      }
      
      // Calculate averages
      stravaAvgPower = powerCount > 0 ? totalPowerSum / powerCount : 0;
      stravaAvgHeartRate = heartRateCount > 0 ? totalHeartRateSum / heartRateCount : 0;

      // Update statistics for Strava activities by sport type
      if (isStravaRunning) {
        // Ensure runningTrainings is initialized
        if (monthlyAnalysis[monthKey].runningTrainings === undefined) {
          monthlyAnalysis[monthKey].runningTrainings = 0;
        }
        monthlyAnalysis[monthKey].runningTrainings++;
        monthlyAnalysis[monthKey].runningTime += stravaTotalTime;
        if (activity.distance) {
          monthlyAnalysis[monthKey].runningDistance += activity.distance;
        }
        // runningTotalPaceSum and runningPaceCount are already updated in the loop above
        monthlyAnalysis[monthKey].runningMaxHeartRate = Math.max(monthlyAnalysis[monthKey].runningMaxHeartRate || 0, stravaMaxHeartRate);
        if (stravaAvgHeartRate > 0) {
          monthlyAnalysis[monthKey].runningTotalHeartRateSum += stravaAvgHeartRate * stravaTotalTime;
          monthlyAnalysis[monthKey].runningHeartRateCount += stravaTotalTime;
        }
      } else if (isStravaSwimming) {
        monthlyAnalysis[monthKey].swimmingTrainings++;
        monthlyAnalysis[monthKey].swimmingTime += stravaTotalTime;
        if (activity.distance) {
          monthlyAnalysis[monthKey].swimmingDistance += activity.distance;
        }
      } else {
        // Default to bike for cycling or other activities
        monthlyAnalysis[monthKey].bikeTrainings++;
        monthlyAnalysis[monthKey].bikeTime += stravaTotalTime;
      }

      // Store Strava activity info
      if (!monthlyAnalysis[monthKey].trainingList) {
        monthlyAnalysis[monthKey].trainingList = [];
      }
      const stravaTrainingInfo = {
        id: activity._id?.toString() || activity.id?.toString(),
        type: 'strava',
        timestamp: activity.startDate,
        date: activityDate.toISOString(),
        title: activity.name || `Strava Activity ${activityDate.toLocaleDateString('cs-CZ')}`,
        avgPower: Math.round(stravaAvgPower),
        maxPower: Math.round(stravaMaxPower),
        avgHeartRate: Math.round(stravaAvgHeartRate) || 0,
        maxHeartRate: Math.round(stravaMaxHeartRate) || 0,
        totalTime: stravaTotalTime
      };
      monthlyAnalysis[monthKey].trainingList.push(stravaTrainingInfo);
      stravaProcessed++;
    }

    // Finalize calculations (only if not onlyMetadata)
    if (!onlyMetadata) {
      Object.keys(monthlyAnalysis).forEach(monthKey => {
        const month = monthlyAnalysis[monthKey];
        month.avgPower = month.powerCount > 0 ? month.totalPowerSum / month.powerCount : 0;
        month.avgHeartRate = month.heartRateCount > 0 ? month.totalHeartRateSum / month.heartRateCount : 0;

        // Ensure all training counts are numbers (not undefined)
        month.trainings = Number(month.trainings) || 0;
        month.bikeTrainings = Number(month.bikeTrainings) || 0;
        month.runningTrainings = Number(month.runningTrainings) || 0;
        month.swimmingTrainings = Number(month.swimmingTrainings) || 0;
        month.totalTime = Number(month.totalTime) || 0;
        month.runningTime = Number(month.runningTime) || 0;
        month.swimmingTime = Number(month.swimmingTime) || 0;
        
        // Calculate bikeTime (total - running - swimming)
        month.bikeTime = Math.max(0, month.totalTime - month.runningTime - month.swimmingTime);

        // Get zones (from lactate test profile)
        const zones = getPowerZones(month.maxPower);
        month.powerZones = zones;
        month.usesProfileZones = !!userPowerZones;
        
        // Get HR zones (general - for backward compatibility)
        const hrZones = getHeartRateZones(month.maxHeartRate, 'cycling');
        month.heartRateZones = hrZones;
        
        // Get separate HR zones for bike and run
        const bikeMaxHR = month.maxHeartRate || 0;
        const runningMaxHR = month.runningMaxHeartRate || month.maxHeartRate || 0;
        const bikeHrZones = getHeartRateZones(bikeMaxHR, 'cycling');
        const runningHrZones = getHeartRateZones(runningMaxHR, 'running');
        month.bikeHeartRateZones = bikeHrZones;
        month.runningHeartRateZones = runningHrZones;
        
        // Get running pace zones from profile or use default
        // Load zones if we have pace data OR if user has profile zones (even without pace data)
        const userRunningZones = user?.powerZones?.running;
        const hasProfileRunningZones = !!(userRunningZones && userRunningZones.zone1 && userRunningZones.zone1.min !== undefined);
        
        if (month.runningPaceCount > 0 || hasProfileRunningZones) {
          const avgPace = month.runningPaceCount > 0 
            ? month.runningTotalPaceSum / month.runningPaceCount 
            : null; // Use null if no pace data, getRunningPaceZones will use profile zones or default
          const runningZones = getRunningPaceZones(avgPace);
          if (runningZones) {
            month.runningZones = runningZones;
            // Mark if using profile zones or default
            month.usesProfileRunningZones = hasProfileRunningZones;
          }
        }
        
        // Get swimming pace zones from profile (if available in future)
        const swimmingZones = getSwimmingPaceZones();
        if (swimmingZones) {
          month.swimmingZones = swimmingZones;
        }
        
        // Calculate FTP from zones for display (LTP2 from profile, or from zone 4)
        const ftpFromZones = userPowerZones?.lt2 || (zones[4].max / 1.05);
        
        // Finalize bike statistics
        if (month.bikePowerCount > 0) {
          month.bikeAvgPower = month.bikeTotalPowerSum / month.bikePowerCount;
        } else {
          month.bikeAvgPower = 0;
        }
        // Ensure bikeMaxPower is set
        month.bikeMaxPower = Number(month.bikeMaxPower) || 0;
        
        // Calculate total TSS for the month (bike + run)
        let bikeTSS = 0;
        let runningTSS = 0;
        
        // Calculate bike TSS (using bike power)
        if (month.bikeTime > 0 && month.bikeAvgPower > 0 && ftpFromZones > 0) {
          // TSS = (seconds * NP^2) / (FTP^2 * 3600) * 100
          // Using bikeAvgPower as NP approximation
          const np = month.bikeAvgPower;
          bikeTSS = Math.round((month.bikeTime * Math.pow(np, 2)) / (Math.pow(ftpFromZones, 2) * 3600) * 100);
        }
        
        // Calculate running TSS (using pace - similar formula but with threshold pace)
        // For running, we use threshold pace (LTP2) as reference, or fallback to avg pace
        const thresholdPace = userRunningZones?.lt2; // Threshold pace in seconds per km
        if (month.runningTime > 0 && month.runningAvgPace > 0) {
          let referencePace = thresholdPace;
          // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
          if (!referencePace || referencePace <= 0) {
            referencePace = month.runningAvgPace;
          }
          // Running TSS formula: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
          // Faster pace (lower seconds) = higher intensity = higher TSS
          // If avgPace is faster than reference (lower seconds), intensity > 1.0
          const intensityRatio = referencePace / month.runningAvgPace; // > 1 if faster than reference
          runningTSS = Math.round((month.runningTime * Math.pow(intensityRatio, 2)) / 3600 * 100);
        }
        
        month.totalTSS = bikeTSS + runningTSS;
        month.bikeTSS = bikeTSS;
        month.runningTSS = runningTSS;

      // Finalize zone statistics
      [1, 2, 3, 4, 5].forEach(zoneNum => {
        const zone = month.zones[zoneNum];
        // Ensure all values are numbers
        zone.time = Number(zone.time) || 0;
        zone.avgPower = Number(zone.avgPower) || 0;
        zone.predictedLactate = Number(zone.predictedLactate) || 0;
        zone.powerCount = Number(zone.powerCount) || 0;
        
        if (zone.powerCount > 0) {
          zone.avgPower = zone.avgPower / zone.powerCount;
        }
        if (zone.time > 0 && zone.predictedLactate > 0) {
          zone.predictedLactate = zone.predictedLactate / zone.time;
        }
        zone.percentage = month.totalTime > 0 ? (zone.time / month.totalTime) * 100 : 0;
        
      });
      
      // Finalize HR zone statistics (general)
      [1, 2, 3, 4, 5].forEach(zoneNum => {
        const hrZone = month.hrZones[zoneNum];
        hrZone.time = Number(hrZone.time) || 0;
        hrZone.avgHeartRate = Number(hrZone.avgHeartRate) || 0;
        hrZone.heartRateCount = Number(hrZone.heartRateCount) || 0;
        
        if (hrZone.heartRateCount > 0) {
          hrZone.avgHeartRate = hrZone.avgHeartRate / hrZone.heartRateCount;
        }
        hrZone.percentage = month.totalTime > 0 ? (hrZone.time / month.totalTime) * 100 : 0;
      });
      
      // Finalize bike HR zone statistics
      [1, 2, 3, 4, 5].forEach(zoneNum => {
        const bikeHrZone = month.bikeHrZones[zoneNum];
        bikeHrZone.time = Number(bikeHrZone.time) || 0;
        bikeHrZone.avgHeartRate = Number(bikeHrZone.avgHeartRate) || 0;
        bikeHrZone.heartRateCount = Number(bikeHrZone.heartRateCount) || 0;
        
        if (bikeHrZone.heartRateCount > 0) {
          bikeHrZone.avgHeartRate = bikeHrZone.avgHeartRate / bikeHrZone.heartRateCount;
        }
        bikeHrZone.percentage = month.bikeTime > 0 ? (bikeHrZone.time / month.bikeTime) * 100 : 0;
      });
      
      // Finalize running HR zone statistics
      [1, 2, 3, 4, 5].forEach(zoneNum => {
        const runningHrZone = month.runningHrZones[zoneNum];
        runningHrZone.time = Number(runningHrZone.time) || 0;
        runningHrZone.avgHeartRate = Number(runningHrZone.avgHeartRate) || 0;
        runningHrZone.heartRateCount = Number(runningHrZone.heartRateCount) || 0;
        
        if (runningHrZone.heartRateCount > 0) {
          runningHrZone.avgHeartRate = runningHrZone.avgHeartRate / runningHrZone.heartRateCount;
        }
        runningHrZone.percentage = month.runningTime > 0 ? (runningHrZone.time / month.runningTime) * 100 : 0;
      });
      
      // Finalize running statistics
      if (month.runningPaceCount > 0) {
        month.runningAvgPace = month.runningTotalPaceSum / month.runningPaceCount;
      } else {
        month.runningAvgPace = 0;
      }
      if (month.runningHeartRateCount > 0) {
        month.runningAvgHeartRate = month.runningTotalHeartRateSum / month.runningHeartRateCount;
      } else {
        month.runningAvgHeartRate = 0;
      }
      if (month.runningMaxPace === Infinity || month.runningMaxPace === undefined || month.runningMaxPace === null) {
        month.runningMaxPace = 0;
      }
      // Ensure all running statistics are numbers
      month.runningAvgPace = Number(month.runningAvgPace) || 0;
      month.runningMaxPace = Number(month.runningMaxPace) || 0;
      month.runningAvgHeartRate = Number(month.runningAvgHeartRate) || 0;
      month.runningMaxHeartRate = Number(month.runningMaxHeartRate) || 0;
      month.runningDistance = Number(month.runningDistance) || 0;
      
      // Finalize running zone statistics
      // Calculate total running time from zone times if runningTime is 0
      const totalRunningZoneTime = [1, 2, 3, 4, 5].reduce((sum, zoneNum) => {
        return sum + (Number(month.runningZoneTimes[zoneNum]?.time) || 0);
      }, 0);
      if (month.runningTime === 0 && totalRunningZoneTime > 0) {
        month.runningTime = totalRunningZoneTime;
      }
      
      [1, 2, 3, 4, 5].forEach(zoneNum => {
        const runningZone = month.runningZoneTimes[zoneNum];
        runningZone.time = Number(runningZone.time) || 0;
        runningZone.avgPace = Number(runningZone.avgPace) || 0;
        runningZone.paceCount = Number(runningZone.paceCount) || 0;
        
        if (runningZone.paceCount > 0) {
          runningZone.avgPace = runningZone.avgPace / runningZone.paceCount;
        }
        runningZone.percentage = month.runningTime > 0 ? (runningZone.time / month.runningTime) * 100 : 0;
        
      });
      
      // Finalize swimming zone statistics
      [1, 2, 3, 4, 5].forEach(zoneNum => {
        const swimmingZone = month.swimmingZoneTimes[zoneNum];
        swimmingZone.time = Number(swimmingZone.time) || 0;
        swimmingZone.avgPace = Number(swimmingZone.avgPace) || 0;
        swimmingZone.paceCount = Number(swimmingZone.paceCount) || 0;
        
        if (swimmingZone.paceCount > 0) {
          swimmingZone.avgPace = swimmingZone.avgPace / swimmingZone.paceCount;
        }
        swimmingZone.percentage = month.totalTime > 0 ? (swimmingZone.time / month.totalTime) * 100 : 0;
        
      });
      });
    }

    // Sort training lists by date and detect similar trainings (only if not onlyMetadata)
    if (!onlyMetadata) {
      Object.keys(monthlyAnalysis).forEach(monthKey => {
      if (monthlyAnalysis[monthKey].trainingList) {
        monthlyAnalysis[monthKey].trainingList.sort((a, b) => {
          return new Date(a.date) - new Date(b.date);
        });
        
        // Detect similar trainings (within 10% power difference and similar duration)
        monthlyAnalysis[monthKey].trainingList.forEach((training, idx) => {
          training.similarTrainings = [];
          monthlyAnalysis[monthKey].trainingList.forEach((otherTraining, otherIdx) => {
            if (idx !== otherIdx && training.avgPower > 0 && otherTraining.avgPower > 0) {
              const powerDiff = Math.abs(training.avgPower - otherTraining.avgPower) / Math.max(training.avgPower, otherTraining.avgPower);
              const timeDiff = Math.abs(training.totalTime - otherTraining.totalTime) / Math.max(training.totalTime || 1, otherTraining.totalTime || 1);
              
              // Similar if power difference < 10% and time difference < 20%
              if (powerDiff < 0.10 && timeDiff < 0.20) {
                training.similarTrainings.push({
                  id: otherTraining.id,
                  type: otherTraining.type,
                  title: otherTraining.title,
                  date: otherTraining.date,
                  avgPower: otherTraining.avgPower,
                  totalTime: otherTraining.totalTime
                });
              }
            }
          });
        });
      }
      });
    }

    // Convert to array and sort by month
    // If onlyMetadata, return just the list of months with training counts
    if (onlyMetadata) {
      const result = Object.values(monthlyAnalysis).sort((a, b) => {
        return a.monthKey.localeCompare(b.monthKey);
      });
      
      // Remove trainingList from response to reduce payload size (not used on frontend)
      result.forEach(month => {
        if (month.trainingList) {
          delete month.trainingList;
        }
      });
      
      return res.json(result);
    }
    
    // Full analysis for specific month
    const result = Object.values(monthlyAnalysis).sort((a, b) => {
      return a.monthKey.localeCompare(b.monthKey);
    });

    // Remove trainingList from response to reduce payload size (not used on frontend)
    result.forEach(month => {
      if (month.trainingList) {
        delete month.trainingList;
      }
    });

    res.json(result);
  } catch (error) {
    console.error('\n=== ERROR IN ANALYZE TRAININGS BY MONTH ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      name: error.name,
      code: error.code,
      userId: req.user?.userId
    });
    console.error('=== END ERROR ===\n');
    res.status(500).json({ 
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

module.exports = {
  uploadFitFile,
  getFitTrainings,
  getFitTraining,
  updateLactate,
  updateFitTraining,
  deleteFitTraining,
  getAllTitles,
  createLap,
  getTrainingsWithLactate,
  analyzeTrainingsByMonth
};

