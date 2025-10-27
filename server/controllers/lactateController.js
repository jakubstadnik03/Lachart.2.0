const LactateSession = require('../models/LactateSession');
const Test = require('../models/test');
const Training = require('../models/training');
const {
  calculateDLADt,
  fitExponentialDecay,
  calculateTHalf,
  calculateAUC,
  calculateClearanceRate,
  evaluateLactateZone,
  generateRecommendations
} = require('../utils/lactateCalculations');

/**
 * Load latest test data for lactate prediction
 */
const loadLatestTestData = async (athleteId, sport) => {
  try {
    console.log(`🔬 Loading latest test data for athlete ${athleteId}, sport: ${sport}`);
    
    // Find the latest test for this athlete and sport
    const latestTest = await Test.findOne({ 
      athleteId, 
      sport,
      'results.lactate': { $exists: true, $ne: null }
    }).sort({ createdAt: -1 });
    
    if (!latestTest) {
      console.log(`❌ No test found for athlete ${athleteId}, sport: ${sport}`);
      return null;
    }
    
    console.log(`✅ Found latest test: ${latestTest.title} (${latestTest.createdAt})`);
    console.log(`📊 Test has ${latestTest.results.length} results`);
    
    // Extract lactate curve data from the test
    const lactateCurve = latestTest.results.map(result => ({
      power: result.power,
      heartRate: result.heartRate,
      lactate: result.lactate,
      interval: result.interval
    })).filter(result => result.lactate && result.lactate > 0);
    
    console.log(`📈 Lactate curve data points: ${lactateCurve.length}`);
    lactateCurve.forEach((point, index) => {
      console.log(`  ${index + 1}. Power: ${point.power}, HR: ${point.heartRate}, Lactate: ${point.lactate} mmol/L`);
    });
    
    return {
      testId: latestTest._id,
      testTitle: latestTest.title,
      testDate: latestTest.createdAt,
      lactateCurve,
      baseLactate: latestTest.baseLactate || 1.0
    };
  } catch (error) {
    console.error('Error loading latest test data:', error);
    return null;
  }
};

/**
 * Predict lactate from latest test curve
 */
const predictLactateFromTest = (targetPower, targetPace, lactateCurve, baseLactate) => {
  if (!lactateCurve || lactateCurve.length === 0) {
    return baseLactate;
  }
  
  // Convert target to power if it's pace
  let targetValue = targetPower;
  if (targetPace && !targetPower) {
    // For running, convert pace (s/km) to approximate power
    targetValue = 1000 / targetPace * 3.6; // Rough conversion to km/h, then to power
  }
  
  console.log(`🎯 Predicting lactate for target: ${targetValue} (power: ${targetPower}, pace: ${targetPace})`);
  
  // Find the closest points in the lactate curve
  const sortedCurve = lactateCurve.sort((a, b) => a.power - b.power);
  
  // If target is below minimum power, use base lactate
  if (targetValue <= sortedCurve[0].power) {
    console.log(`📊 Target below minimum, using base lactate: ${baseLactate}`);
    return baseLactate;
  }
  
  // If target is above maximum power, extrapolate
  if (targetValue >= sortedCurve[sortedCurve.length - 1].power) {
    const lastPoint = sortedCurve[sortedCurve.length - 1];
    const secondLastPoint = sortedCurve[sortedCurve.length - 2];
    const slope = (lastPoint.lactate - secondLastPoint.lactate) / (lastPoint.power - secondLastPoint.power);
    const predictedLactate = lastPoint.lactate + slope * (targetValue - lastPoint.power);
    console.log(`📊 Target above maximum, extrapolating: ${predictedLactate.toFixed(2)} mmol/L`);
    return Math.max(baseLactate, Math.min(20, predictedLactate)); // Clamp between base and 20
  }
  
  // Interpolate between two points
  for (let i = 0; i < sortedCurve.length - 1; i++) {
    const point1 = sortedCurve[i];
    const point2 = sortedCurve[i + 1];
    
    if (targetValue >= point1.power && targetValue <= point2.power) {
      const ratio = (targetValue - point1.power) / (point2.power - point1.power);
      const predictedLactate = point1.lactate + ratio * (point2.lactate - point1.lactate);
      console.log(`📊 Interpolated lactate: ${predictedLactate.toFixed(2)} mmol/L (between ${point1.lactate} and ${point2.lactate})`);
      return Math.max(baseLactate, predictedLactate);
    }
  }
  
  return baseLactate;
};

/**
 * Create a new lactate session
 */
const createSession = async (req, res) => {
  try {
    const { athleteId, sport, title, description, startTime, envTempC, altitudeM, notes, intervals } = req.body;
    
    const session = new LactateSession({
      athleteId,
      sport,
      title,
      description,
      startTime: new Date(startTime),
      envTempC,
      altitudeM,
      notes,
      intervals: intervals || []
    });
    
    await session.save();
    res.status(201).json(session);
  } catch (error) {
    console.error('Error creating lactate session:', error);
    res.status(500).json({ error: 'Failed to create lactate session' });
  }
};

/**
 * Add intervals to a session
 */
const addIntervals = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { intervals } = req.body;
    
    const session = await LactateSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    session.intervals.push(...intervals);
    await session.save();
    
    res.json(session);
  } catch (error) {
    console.error('Error adding intervals:', error);
    res.status(500).json({ error: 'Failed to add intervals' });
  }
};

/**
 * Add lactate samples to a session
 */
const addLactateSamples = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { samples } = req.body;
    
    const session = await LactateSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Add timestamp if not provided
    const samplesWithTimestamp = samples.map(sample => ({
      ...sample,
      timestamp: sample.timestamp || new Date(session.startTime.getTime() + (sample.offsetFromIntervalEndS || 0) * 1000)
    }));
    
    session.lactateSamples.push(...samplesWithTimestamp);
    await session.save();
    
    res.json(session);
  } catch (error) {
    console.error('Error adding lactate samples:', error);
    res.status(500).json({ error: 'Failed to add lactate samples' });
  }
};

/**
 * Add stream points to a session
 */
const addStreamPoints = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { streamPoints } = req.body;
    
    const session = await LactateSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    session.streamPoints.push(...streamPoints);
    await session.save();
    
    res.json(session);
  } catch (error) {
    console.error('Error adding stream points:', error);
    res.status(500).json({ error: 'Failed to add stream points' });
  }
};

/**
 * Analyze a lactate session
 */
const analyzeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`🔬 Analyzing session ${sessionId}`);
    
    const session = await LactateSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    console.log(`🔬 Analyzing session ${sessionId} for athlete ${session.athleteId}`);
    
    // Load latest test data for lactate prediction
    const latestTestData = await loadLatestTestData(session.athleteId, session.sport);
    
    // Calculate metrics for each interval
    const intervalMetrics = [];
    let previousLactate = latestTestData?.baseLactate || 1.0; // Use base lactate from test
    
    console.log(`📊 Processing ${session.intervals.length} intervals`);
    
    for (const interval of session.intervals) {
      console.log(`📊 Processing interval ${interval.seq} (${interval.kind})`);
      
      if (interval.kind === 'work') {
        // Find lactate samples for this interval
        const intervalSamples = session.lactateSamples.filter(sample => 
          sample.intervalId && sample.intervalId.toString() === interval._id.toString()
        );
        
        let lactateEndWork = null;
        let dLaDtMmolPerMin = null;
        let aucMmolMin = null;
        
        if (intervalSamples.length >= 2) {
          // Use real lactate samples
          const sortedSamples = intervalSamples.sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
          );
          
          const lactateStart = sortedSamples[0].valueMmolL;
          lactateEndWork = sortedSamples[sortedSamples.length - 1].valueMmolL;
          
          dLaDtMmolPerMin = calculateDLADt(lactateStart, lactateEndWork, interval.durationS);
          aucMmolMin = calculateAUC(sortedSamples.map(sample => ({
            t_s: (new Date(sample.timestamp) - new Date(session.startTime)) / 1000,
            L: sample.valueMmolL
          })));
          
          previousLactate = lactateEndWork;
        } else if (latestTestData && latestTestData.lactateCurve.length > 0) {
          // Use latest test data for prediction
          lactateEndWork = predictLactateFromTest(
            interval.targetPowerW, 
            interval.targetPaceSPerKm, 
            latestTestData.lactateCurve, 
            latestTestData.baseLactate
          );
          
          dLaDtMmolPerMin = calculateDLADt(previousLactate, lactateEndWork, interval.durationS);
          aucMmolMin = (previousLactate + lactateEndWork) / 2 * interval.durationS / 60;
          
          previousLactate = lactateEndWork;
        } else {
          // Fallback: use basic estimation
          const baseLactate = latestTestData?.baseLactate || 1.0;
          const powerFactor = (interval.targetPowerW || interval.targetPaceSPerKm || 0) / 200;
          
          lactateEndWork = Math.max(baseLactate, Math.min(8.0, baseLactate * (1 + powerFactor * 0.3)));
          dLaDtMmolPerMin = calculateDLADt(previousLactate, lactateEndWork, interval.durationS);
          aucMmolMin = (previousLactate + lactateEndWork) / 2 * interval.durationS / 60;
          
          previousLactate = lactateEndWork;
        }
        
        intervalMetrics.push({
          intervalId: interval._id,
          seq: interval.seq,
          kind: interval.kind,
          durationS: interval.durationS,
          startOffsetS: interval.startOffsetS,
          targetPowerW: interval.targetPowerW,
          targetPaceSPerKm: interval.targetPaceSPerKm,
          targetLactateMin: interval.targetLactateMin,
          targetLactateMax: interval.targetLactateMax,
          lactateEndWork: lactateEndWork,
          dLaDtMmolPerMin: dLaDtMmolPerMin,
          aucMmolMin: aucMmolMin,
          zone: lactateEndWork && interval.targetLactateMin && interval.targetLactateMax 
            ? evaluateLactateZone(lactateEndWork, interval.targetLactateMin, interval.targetLactateMax)
            : 'N/A'
        });
        
      } else if (interval.kind === 'rest') {
        // Find lactate samples for this rest interval
        const intervalSamples = session.lactateSamples.filter(sample => 
          sample.intervalId && sample.intervalId.toString() === interval._id.toString()
        );
        
        let lactateEndRest = null;
        let clearanceRateMmolPerMin = null;
        let tHalfS = null;
        
        if (intervalSamples.length >= 2) {
          // Use real lactate samples
          const sortedSamples = intervalSamples.sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
          );
          
          const lactateStart = sortedSamples[0].valueMmolL;
          lactateEndRest = sortedSamples[sortedSamples.length - 1].valueMmolL;
          
          const decayPoints = sortedSamples.map(sample => ({
            t_s: (new Date(sample.timestamp) - new Date(session.startTime)) / 1000,
            L: sample.valueMmolL
          }));
          
          const { tau, L_end, r_squared } = fitExponentialDecay(decayPoints);
          tHalfS = calculateTHalf(tau);
          clearanceRateMmolPerMin = calculateClearanceRate(lactateStart, lactateEndRest, interval.durationS);
          
          previousLactate = lactateEndRest;
        } else {
          // Estimate clearance during rest (simplified)
          const clearanceRate = 0.5; // mmol/L/min typical clearance rate
          lactateEndRest = Math.max(1.0, previousLactate - clearanceRate * interval.durationS / 60);
          clearanceRateMmolPerMin = clearanceRate;
          tHalfS = 90; // Typical t½
          
          previousLactate = lactateEndRest;
        }
        
        intervalMetrics.push({
          intervalId: interval._id,
          seq: interval.seq,
          kind: interval.kind,
          durationS: interval.durationS,
          startOffsetS: interval.startOffsetS,
          targetPowerW: interval.targetPowerW,
          targetPaceSPerKm: interval.targetPaceSPerKm,
          targetLactateMin: interval.targetLactateMin,
          targetLactateMax: interval.targetLactateMax,
          lactateEndRest: lactateEndRest,
          clearanceRateMmolPerMin: clearanceRateMmolPerMin,
          tHalfS: tHalfS
        });
      }
    }
    
    console.log('📊 Generated intervalMetrics:', intervalMetrics.length, 'items');
    
    // Generate overall recommendations
    let recommendations = [];
    try {
      recommendations = generateRecommendations(intervalMetrics);
    } catch (error) {
      console.error('❌ Error generating recommendations:', error);
      recommendations = ['Analysis completed - check individual interval metrics'];
    }
    
    // Calculate overall metrics
    const workIntervals = intervalMetrics.filter(m => m.dLaDtMmolPerMin);
    const restIntervals = intervalMetrics.filter(m => m.tHalfS);
    const aucIntervals = intervalMetrics.filter(m => m.aucMmolMin);
    
    const avgDLADt = workIntervals.length > 0 
      ? workIntervals.reduce((sum, m) => sum + m.dLaDtMmolPerMin, 0) / workIntervals.length 
      : 0;
    
    const avgTHalf = restIntervals.length > 0 
      ? restIntervals.reduce((sum, m) => sum + m.tHalfS, 0) / restIntervals.length 
      : 0;
    
    const totalAUC = aucIntervals.reduce((sum, m) => sum + m.aucMmolMin, 0);
    
    // Update session with calculated metrics
    session.intervalMetrics = intervalMetrics;
    session.overallMetrics = {
      avgDLADt,
      avgTHalf,
      totalAUC,
      recommendations
    };
    
    await session.save();
    
    res.json({
      session,
      analysis: {
        sessionInfo: {
          _id: session._id,
          athleteId: session.athleteId,
          sport: session.sport,
          title: session.title,
          description: session.description,
          startTime: session.startTime,
          endTime: session.endTime,
          envTempC: session.envTempC,
          altitudeM: session.altitudeM,
          notes: session.notes
        },
        intervalMetrics,
        overallMetrics: session.overallMetrics
      }
    });
  } catch (error) {
    console.error('Error analyzing session:', error);
    res.status(500).json({ error: 'Failed to analyze session' });
  }
};

/**
 * Get a specific session
 */
const getSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await LactateSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
};

/**
 * Get session analysis
 */
const getSessionAnalysis = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await LactateSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({
      sessionInfo: {
        _id: session._id,
        athleteId: session.athleteId,
        sport: session.sport,
        title: session.title,
        description: session.description,
        startTime: session.startTime,
        endTime: session.endTime,
        envTempC: session.envTempC,
        altitudeM: session.altitudeM,
        notes: session.notes
      },
      intervalMetrics: session.intervalMetrics || [],
      overallMetrics: session.overallMetrics || { recommendations: [] }
    });
  } catch (error) {
    console.error('Error getting session analysis:', error);
    res.status(500).json({ error: 'Failed to get session analysis' });
  }
};

/**
 * Get all sessions for an athlete
 */
const getAthleteSessions = async (req, res) => {
  try {
    const { athleteId } = req.params;
    
    const sessions = await LactateSession.find({ athleteId }).sort({ createdAt: -1 });
    res.json(sessions);
  } catch (error) {
    console.error('Error getting athlete sessions:', error);
    res.status(500).json({ error: 'Failed to get athlete sessions' });
  }
};

module.exports = {
  createSession,
  addIntervals,
  addLactateSamples,
  addStreamPoints,
  analyzeSession,
  getSession,
  getSessionAnalysis,
  getAthleteSessions
};