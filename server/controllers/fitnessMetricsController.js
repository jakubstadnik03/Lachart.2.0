const FitTraining = require('../models/fitTraining');
const StravaActivity = require('../models/StravaActivity');
const GarminActivity = require('../models/GarminActivity');
const AppleHealthActivity = require('../models/AppleHealthActivity');
const Training = require('../models/training');
const User = require('../models/UserModel');
const mongoose = require('mongoose');
const { buildUserProfile, resolveActivityTss, dedupeActivitiesForLoad } = require('../utils/activityTss');
const { enrichProfileForTss } = require('../utils/inferThresholdsFromActivities');

function localDateKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calculate Fitness, Fatigue, and Form over time
 * Fitness builds up with training, Fatigue accumulates, Form = Fitness - Fatigue
 */
// Helper function to map sport to filter
function matchesSportFilter(sport, filter) {
  if (filter === 'all') return true;
  const sportLower = (sport || '').toLowerCase();
  if (filter === 'bike') {
    return sportLower === 'cycling' || sportLower.includes('ride') || sportLower.includes('bike') || sportLower.includes('cycle');
  }
  if (filter === 'run') {
    return sportLower === 'running' || sportLower.includes('run') || sportLower === 'run'
      || sportLower.includes('walk') || sportLower.includes('hike');
  }
  if (filter === 'swim') {
    return sportLower === 'swimming' || sportLower.includes('swim');
  }
  return true;
}

// Legacy alias — prefer resolveActivityTss from ../utils/activityTss
function calculateActivityTSS(activity, userProfile = null) {
  return resolveActivityTss(activity, userProfile);
}

const FIT_LOAD_SELECT = 'timestamp trainingStressScore totalElapsedTime sport avgPower avgSpeed normalizedPower avgHeartRate maxHeartRate distance tssDisplayMode manualTss';
const STRAVA_LOAD_SELECT = 'startDate movingTime elapsedTime distance averagePower averageSpeed sport average_heartrate max_heartrate weighted_average_watts manualTss tssDisplayMode';
const GARMIN_LOAD_SELECT = 'startDate movingTime elapsedTime distance averageSpeed sport averageHeartRate averagePower manualTss tssDisplayMode';

async function findByUserIdBothFormats(Model, athleteIdStr, athleteIdObj, filter, select, sortField) {
  let rows = await Model.find({ userId: athleteIdStr, ...filter }).select(select).sort({ [sortField]: 1 }).lean();
  if (!rows.length && athleteIdObj) {
    rows = await Model.find({ userId: athleteIdObj, ...filter }).select(select).sort({ [sortField]: 1 }).lean();
  }
  return rows;
}

function mapFitToLoad(t, userProfile) {
  return {
    date: t.timestamp,
    tss: resolveActivityTss({
      sport: t.sport,
      totalElapsedTime: t.totalElapsedTime,
      movingTime: t.totalElapsedTime,
      distance: t.distance,
      avgPower: t.avgPower,
      normalizedPower: t.normalizedPower,
      averageHeartRate: t.avgHeartRate,
      avgHeartRate: t.avgHeartRate,
      maxHeartRate: t.maxHeartRate,
      avgSpeed: t.avgSpeed,
      tss: t.trainingStressScore,
      trainingStressScore: t.trainingStressScore,
      manualTss: t.manualTss,
      tssDisplayMode: t.tssDisplayMode,
    }, userProfile),
    sport: t.sport || 'generic',
  };
}

function mapStravaToLoad(a, userProfile) {
  return {
    date: a.startDate,
    tss: resolveActivityTss({
      sport: a.sport,
      movingTime: a.movingTime,
      elapsedTime: a.elapsedTime,
      distance: a.distance,
      averagePower: a.averagePower,
      weighted_average_watts: a.weighted_average_watts,
      averageSpeed: a.averageSpeed,
      average_heartrate: a.average_heartrate,
      max_heartrate: a.max_heartrate,
      manualTss: a.manualTss,
      tssDisplayMode: a.tssDisplayMode,
    }, userProfile),
    sport: a.sport || 'generic',
  };
}

function mapGarminToLoad(a, userProfile) {
  return {
    date: a.startDate,
    tss: resolveActivityTss({
      sport: a.sport,
      movingTime: a.movingTime,
      elapsedTime: a.elapsedTime,
      distance: a.distance,
      averageSpeed: a.averageSpeed,
      averagePower: a.averagePower,
      average_heartrate: a.averageHeartRate,
      avgHeartRate: a.averageHeartRate,
      manualTss: a.manualTss,
      tssDisplayMode: a.tssDisplayMode,
    }, userProfile),
    sport: a.sport || 'generic',
  };
}

function mapAppleHealthToLoad(a, userProfile) {
  return {
    date: a.startDate,
    tss: resolveActivityTss({
      sport: a.sport || a.type,
      movingTime: a.durationSeconds,
      distance: a.distanceMeters,
      average_heartrate: a.avgHeartRate,
      avgHeartRate: a.avgHeartRate,
    }, userProfile),
    sport: a.sport || a.type || 'generic',
  };
}

async function calculateFormFitnessData(athleteId, days = 60, sportFilter = 'all') {
  try {
    console.log('calculateFormFitnessData called with athleteId:', athleteId, 'days:', days, 'sportFilter:', sportFilter);
    
    // Limit days to prevent excessive memory usage (max 180 days)
    const maxDays = 180;
    const effectiveDays = Math.min(days, maxDays);
    
    // Calculate date range. CTL has a 42-day time constant; to make today's
    // CTL/ATL/Form identical regardless of the requested `days` (so the mobile
    // dashboard, PC dashboard, and calendar all show the same form value), we
    // warm up the EMA over 6× CTL_TC = 252 days of history before the
    // displayed window. With < 60 days of warmup the series was only ~76%
    // converged, which caused the values to drift between views.
    const WARMUP_DAYS = 252;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const queryStartDate = new Date(today);
    queryStartDate.setDate(queryStartDate.getDate() - (effectiveDays + WARMUP_DAYS));
    queryStartDate.setHours(0, 0, 0, 0);
    
    // Get user profile for TSS calculation
    let user = null;
    try {
      user = await User.findById(athleteId);
    } catch (userError) {
      console.error('Error fetching user:', userError);
      // Try with ObjectId if athleteId is string
      try {
        const athleteIdObj = new mongoose.Types.ObjectId(athleteId);
        user = await User.findById(athleteIdObj);
      } catch (e) {
        console.error('Error fetching user with ObjectId:', e);
      }
    }
    
    const userProfile = buildUserProfile(user);

    // Try both String and ObjectId formats for athleteId
    const athleteIdStr = String(athleteId);
    let athleteIdObj = null;
    try {
      athleteIdObj = new mongoose.Types.ObjectId(athleteId);
    } catch (e) {
      // Not a valid ObjectId, use string
    }

    // Load every source the calendar uses so CTL/ATL match displayed TSS.
    const dateFilter = { $gte: queryStartDate };
    const [
      fitTrainings,
      stravaActivities,
      garminActivities,
      appleHealthActivities,
      trainings,
    ] = await Promise.all([
      FitTraining.find({ athleteId: athleteIdStr, timestamp: dateFilter })
        .select(FIT_LOAD_SELECT)
        .sort({ timestamp: 1 })
        .lean(),
      findByUserIdBothFormats(StravaActivity, athleteIdStr, athleteIdObj, { startDate: dateFilter }, STRAVA_LOAD_SELECT, 'startDate'),
      findByUserIdBothFormats(GarminActivity, athleteIdStr, athleteIdObj, { startDate: dateFilter }, GARMIN_LOAD_SELECT, 'startDate'),
      findByUserIdBothFormats(AppleHealthActivity, athleteIdStr, athleteIdObj, { startDate: dateFilter }, 'startDate durationSeconds distanceMeters sport type avgHeartRate', 'startDate'),
      Training.find({ athleteId: athleteIdStr, date: dateFilter })
        .select('date sport')
        .sort({ date: 1 })
        .lean(),
    ]);

    const rawForInference = [...fitTrainings, ...stravaActivities, ...garminActivities, ...appleHealthActivities];
    const effectiveProfile = enrichProfileForTss(userProfile, rawForInference);

    const allActivities = [
      ...fitTrainings
        .filter((t) => matchesSportFilter(t.sport, sportFilter))
        .map((t) => mapFitToLoad(t, effectiveProfile)),
      ...stravaActivities
        .filter((a) => matchesSportFilter(a.sport, sportFilter))
        .map((a) => mapStravaToLoad(a, effectiveProfile)),
      ...garminActivities
        .filter((a) => matchesSportFilter(a.sport, sportFilter))
        .map((a) => mapGarminToLoad(a, effectiveProfile)),
      ...appleHealthActivities
        .filter((a) => matchesSportFilter(a.sport || a.type, sportFilter))
        .map((a) => mapAppleHealthToLoad(a, effectiveProfile)),
      ...trainings
        .filter((t) => {
          if (sportFilter === 'all') return true;
          const trainingSport = t.sport || '';
          if (sportFilter === 'bike') return trainingSport === 'bike';
          if (sportFilter === 'run') return trainingSport === 'run' || trainingSport === 'walk';
          if (sportFilter === 'swim') return trainingSport === 'swim';
          return true;
        })
        .map((t) => ({
          date: t.date,
          tss: 0,
          sport: t.sport || 'generic',
        })),
    ].filter((a) => a.date).sort((a, b) => new Date(a.date) - new Date(b.date));

    const dedupedActivities = dedupeActivitiesForLoad(allActivities);
    if (dedupedActivities.length < allActivities.length) {
      console.log(`[FormFitness] deduped ${allActivities.length - dedupedActivities.length} duplicate activities for athlete ${athleteId}`);
    }

    if (dedupedActivities.length === 0) {
      console.log('No activities found for athleteId:', athleteId);
      return [];
    }

    // Calculate Fitness, Fatigue, and Form over time
    // Use the queryStartDate as calculation start (we already limited queries to this date)
    // Find the earliest activity date from loaded data
    const earliestActivityDate = new Date(dedupedActivities[0].date);
    earliestActivityDate.setHours(0, 0, 0, 0);
    
    // Calculate start date: either (today - effectiveDays) or earliest activity, whichever is later
    const requestedStartDate = new Date(today);
    requestedStartDate.setDate(requestedStartDate.getDate() - effectiveDays);
    requestedStartDate.setHours(0, 0, 0, 0);
    
    // Start from earliest activity to ensure accurate calculation
    // But only show data from requestedStartDate onwards
    const calculationStartDate = earliestActivityDate < requestedStartDate 
      ? earliestActivityDate 
      : requestedStartDate;
    
    const displayStartDate = requestedStartDate;

    // Group activities by date for easier lookup
    const dailyTSS = {};
    dedupedActivities.forEach(activity => {
      const dateStr = localDateKey(activity.date);
      if (!dateStr) return;
      if (!dailyTSS[dateStr]) {
        dailyTSS[dateStr] = 0;
      }
      dailyTSS[dateStr] += activity.tss || 0;
    });

    const data = [];

    // TrainingPeaks-like model:
    // - CTL (Fitness): exponential moving average of daily TSS with time constant 42 days
    // - ATL (Fatigue): exponential moving average of daily TSS with time constant 7 days
    // - TSB (Form): yesterday's CTL - yesterday's ATL (i.e., before applying today's TSS)
    const CTL_TC = 42;
    const ATL_TC = 7;
    const alphaCTL = 1 / CTL_TC;
    const alphaATL = 1 / ATL_TC;

    let ctl = 0;
    let atl = 0;

    // Calculate from earliest activity to ensure accurate CTL/ATL values
    // Use a more memory-efficient approach: calculate in batches and clear intermediate data
    const daysToCalculate = Math.ceil((today - calculationStartDate) / (1000 * 60 * 60 * 24));
    
    // If calculating more than 200 days, suggest garbage collection periodically
    if (daysToCalculate > 200 && global.gc) {
      // Force garbage collection every 100 days if available
      let gcCounter = 0;
      for (let d = new Date(calculationStartDate); d <= today; d.setDate(d.getDate() + 1)) {
        const dateStr = localDateKey(d);
        const tssToday = dailyTSS[dateStr] || 0; // rest days are 0

        // Form for this day is yesterday's balance (before updating today)
        const form = ctl - atl;

        // Update CTL/ATL with today's TSS (EMA)
        ctl = ctl + alphaCTL * (tssToday - ctl);
        atl = atl + alphaATL * (tssToday - atl);

        // Debug logging for today's values
        if (dateStr === localDateKey(today)) {
          console.log(`[Fitness/Fatigue Debug TP] Date: ${dateStr}`);
          console.log(`  TSS: ${tssToday}`);
          console.log(`  CTL(Fitness): ${ctl.toFixed(1)}`);
          console.log(`  ATL(Fatigue): ${atl.toFixed(1)}`);
          console.log(`  TSB(Form): ${form.toFixed(1)} (yesterday CTL-ATL)`);
        }

        if (d >= displayStartDate) {
          data.push({
            date: dateStr,
            dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            Fitness: Math.round(ctl),
            Form: Math.round(form),
            Fatigue: Math.round(atl),
            TSS: Math.round(tssToday)
          });
        }

        // Suggest GC every 100 days
        gcCounter++;
        if (gcCounter % 100 === 0 && global.gc) {
          global.gc();
        }
      }
    } else {
      // Normal calculation for smaller date ranges
      for (let d = new Date(calculationStartDate); d <= today; d.setDate(d.getDate() + 1)) {
        const dateStr = localDateKey(d);
        const tssToday = dailyTSS[dateStr] || 0; // rest days are 0

        // Form for this day is yesterday's balance (before updating today)
        const form = ctl - atl;

        // Update CTL/ATL with today's TSS (EMA)
        ctl = ctl + alphaCTL * (tssToday - ctl);
        atl = atl + alphaATL * (tssToday - atl);

        // Debug logging for today's values
        if (dateStr === localDateKey(today)) {
          console.log(`[Fitness/Fatigue Debug TP] Date: ${dateStr}`);
          console.log(`  TSS: ${tssToday}`);
          console.log(`  CTL(Fitness): ${ctl.toFixed(1)}`);
          console.log(`  ATL(Fatigue): ${atl.toFixed(1)}`);
          console.log(`  TSB(Form): ${form.toFixed(1)} (yesterday CTL-ATL)`);
        }

        if (d >= displayStartDate) {
          data.push({
            date: dateStr,
            dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            Fitness: Math.round(ctl),
            Form: Math.round(form),
            Fatigue: Math.round(atl),
            TSS: Math.round(tssToday)
          });
        }
      }
    }

    // Clear dailyTSS object to free memory before returning
    Object.keys(dailyTSS).forEach(key => delete dailyTSS[key]);
    
    console.log('calculateFormFitnessData returning', data.length, 'data points');
    return data;
  } catch (error) {
    console.error('Error calculating form fitness data:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

/**
 * Calculate today's metrics (Fitness, Fatigue, Form)
 */
async function calculateTodayMetrics(athleteId) {
  try {
    const data = await calculateFormFitnessData(athleteId, 90);
    
    if (data.length === 0) {
      return {
        fitness: 0,
        fatigue: 0,
        form: 0,
        fitnessChange: 0,
        fatigueChange: 0,
        formChange: 0
      };
    }

    const today = data[data.length - 1];
    const yesterday = data.length > 1 ? data[data.length - 2] : today;

    return {
      fitness: today.Fitness,
      fatigue: today.Fatigue,
      form: today.Form,
      fitnessChange: today.Fitness - yesterday.Fitness,
      fatigueChange: today.Fatigue - yesterday.Fatigue,
      formChange: today.Form - yesterday.Form
    };
  } catch (error) {
    console.error('Error calculating today metrics:', error);
    throw error;
  }
}

/**
 * Calculate training status based on weekly training load
 */
async function calculateTrainingStatus(athleteId) {
  try {
    console.log('calculateTrainingStatus called with athleteId:', athleteId);
    
    // Get user profile for TSS calculation
    let user = null;
    try {
      if (mongoose.Types.ObjectId.isValid(athleteId)) {
        user = await User.findById(athleteId);
      } else {
        user = await User.findById(String(athleteId));
      }
    } catch (userError) {
      console.error('Error fetching user:', userError);
    }
    
    const userProfile = buildUserProfile(user);

    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const fourWeeksAgo = new Date(today);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const athleteIdStr = String(athleteId);
    let athleteIdObj = null;
    try {
      athleteIdObj = new mongoose.Types.ObjectId(athleteId);
    } catch (e) {
      // Not a valid ObjectId, use string
    }

    // Get all activities
    const fitTrainings = await FitTraining.find({ 
      athleteId: athleteIdStr,
      timestamp: { $gte: fourWeeksAgo }
    })
      .select('timestamp trainingStressScore sport totalElapsedTime avgPower avgSpeed normalizedPower avgHeartRate maxHeartRate')
      .lean();

    // StravaActivity uses userId
    let stravaActivities = await StravaActivity.find({ 
      userId: athleteIdStr,
      startDate: { $gte: fourWeeksAgo }
    })
      .select('startDate movingTime averagePower averageSpeed sport average_heartrate max_heartrate weighted_average_watts manualTss')
      .lean();

    if (stravaActivities.length === 0 && athleteIdObj) {
      stravaActivities = await StravaActivity.find({ 
        userId: athleteIdObj,
        startDate: { $gte: fourWeeksAgo }
      })
        .select('startDate movingTime averagePower averageSpeed sport average_heartrate max_heartrate weighted_average_watts manualTss')
        .lean();
    }

    const mapFitTss = (t) => resolveActivityTss({
      sport: t.sport,
      totalElapsedTime: t.totalElapsedTime,
      movingTime: t.totalElapsedTime,
      avgPower: t.avgPower,
      normalizedPower: t.normalizedPower,
      averageHeartRate: t.avgHeartRate,
      avgHeartRate: t.avgHeartRate,
      maxHeartRate: t.maxHeartRate,
      avgSpeed: t.avgSpeed,
      tss: t.trainingStressScore,
      trainingStressScore: t.trainingStressScore,
    }, userProfile);

    const mapStravaTss = (a) => resolveActivityTss({
      sport: a.sport,
      movingTime: a.movingTime,
      averagePower: a.averagePower,
      weighted_average_watts: a.weighted_average_watts,
      averageSpeed: a.averageSpeed,
      average_heartrate: a.average_heartrate,
      max_heartrate: a.max_heartrate,
      manualTss: a.manualTss,
    }, userProfile);

    const allActivities = [
      ...fitTrainings.map(t => ({
        date: t.timestamp,
        tss: mapFitTss(t)
      })),
      ...stravaActivities.map(a => ({
        date: a.startDate,
        tss: mapStravaTss(a)
      }))
    ].filter(a => a.date);

    const dedupedActivities = dedupeActivitiesForLoad(allActivities);

    // Calculate weekly TSS for last 4 weeks
    const weeklyTSSArray = [];
    for (let i = 0; i < 4; i++) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      
      const weekTSS = dedupedActivities
        .filter(a => {
          const activityDate = new Date(a.date);
          return activityDate >= weekStart && activityDate < weekEnd;
        })
        .reduce((sum, a) => sum + (a.tss || 0), 0);
      
      if (weekTSS > 0 || i === 0) {
        weeklyTSSArray.push(weekTSS);
      }
    }

    // Current week TSS
    const currentWeekTSS = weeklyTSSArray[0] || 0;

    // Calculate average TSS from last 4 weeks (excluding current week)
    const pastWeeksTSS = weeklyTSSArray.slice(1).filter(tss => tss > 0);
    const averageTSS = pastWeeksTSS.length > 0
      ? pastWeeksTSS.reduce((sum, tss) => sum + tss, 0) / pastWeeksTSS.length
      : currentWeekTSS;

    const optimalMin = averageTSS * 0.8;
    const optimalMax = averageTSS * 1.2;

    // Determine status
    let status = 'Maintaining';
    let statusColor = 'bg-blue-500';
    let statusText = 'Maintaining';

    if (currentWeekTSS > optimalMax * 1.3) {
      status = 'Overreaching';
      statusColor = 'bg-red-500';
      statusText = 'Overreaching';
    } else if (currentWeekTSS >= optimalMin && currentWeekTSS <= optimalMax) {
      status = 'Productive';
      statusColor = 'bg-green-500';
      statusText = 'Productive';
    } else if (currentWeekTSS >= optimalMin * 0.5 && currentWeekTSS < optimalMin) {
      status = 'Maintaining';
      statusColor = 'bg-blue-500';
      statusText = 'Maintaining';
    } else if (currentWeekTSS > 0 && currentWeekTSS < optimalMin * 0.5) {
      status = 'Recovery';
      statusColor = 'bg-orange-500';
      statusText = 'Recovery';
    } else if (currentWeekTSS === 0) {
      status = 'Detraining';
      statusColor = 'bg-gray-800';
      statusText = 'Detraining';
    }

    return {
      status,
      statusText,
      statusColor,
      weeklyTSS: currentWeekTSS,
      optimalMin: Math.round(optimalMin),
      optimalMax: Math.round(optimalMax)
    };
  } catch (error) {
    console.error('Error calculating training status:', error);
    throw error;
  }
}

function localWeekStartKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return localDateKey(d);
}

/**
 * Calculate weekly training load
 */
async function calculateWeeklyTrainingLoad(athleteId, months = 3, sportFilter = 'all') {
  try {
    console.log('calculateWeeklyTrainingLoad called with athleteId:', athleteId, 'months:', months, 'sportFilter:', sportFilter);

    let user = null;
    try {
      if (mongoose.Types.ObjectId.isValid(athleteId)) {
        user = await User.findById(athleteId);
      } else {
        user = await User.findById(String(athleteId));
      }
    } catch (userError) {
      console.error('Error fetching user:', userError);
    }

    const userProfile = buildUserProfile(user);

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setHours(0, 0, 0, 0);

    const athleteIdStr = String(athleteId);
    let athleteIdObj = null;
    try {
      athleteIdObj = new mongoose.Types.ObjectId(athleteId);
    } catch (e) {
      // Not a valid ObjectId, use string
    }

    const dateFilter = { $gte: startDate };
    const [
      fitTrainings,
      stravaActivities,
      garminActivities,
      appleHealthActivities,
      trainings,
    ] = await Promise.all([
      FitTraining.find({ athleteId: athleteIdStr, timestamp: dateFilter })
        .select(FIT_LOAD_SELECT)
        .sort({ timestamp: 1 })
        .lean(),
      findByUserIdBothFormats(StravaActivity, athleteIdStr, athleteIdObj, { startDate: dateFilter }, STRAVA_LOAD_SELECT, 'startDate'),
      findByUserIdBothFormats(GarminActivity, athleteIdStr, athleteIdObj, { startDate: dateFilter }, GARMIN_LOAD_SELECT, 'startDate'),
      findByUserIdBothFormats(AppleHealthActivity, athleteIdStr, athleteIdObj, { startDate: dateFilter }, 'startDate durationSeconds distanceMeters sport type avgHeartRate', 'startDate'),
      Training.find({ athleteId: athleteIdStr, date: dateFilter })
        .select('date sport')
        .sort({ date: 1 })
        .lean(),
    ]);

    const rawForInference = [...fitTrainings, ...stravaActivities, ...garminActivities, ...appleHealthActivities];
    const effectiveProfile = enrichProfileForTss(userProfile, rawForInference);

    const allActivities = [
      ...fitTrainings
        .filter((t) => matchesSportFilter(t.sport, sportFilter))
        .map((t) => mapFitToLoad(t, effectiveProfile)),
      ...stravaActivities
        .filter((a) => matchesSportFilter(a.sport, sportFilter))
        .map((a) => mapStravaToLoad(a, effectiveProfile)),
      ...garminActivities
        .filter((a) => matchesSportFilter(a.sport, sportFilter))
        .map((a) => mapGarminToLoad(a, effectiveProfile)),
      ...appleHealthActivities
        .filter((a) => matchesSportFilter(a.sport || a.type, sportFilter))
        .map((a) => mapAppleHealthToLoad(a, effectiveProfile)),
      ...trainings
        .filter((t) => {
          if (sportFilter === 'all') return true;
          const trainingSport = t.sport || '';
          if (sportFilter === 'bike') return trainingSport === 'bike';
          if (sportFilter === 'run') return trainingSport === 'run' || trainingSport === 'walk';
          if (sportFilter === 'swim') return trainingSport === 'swim';
          return true;
        })
        .map((t) => ({
          date: t.date,
          tss: 0,
          sport: t.sport || 'generic',
        })),
    ].filter((a) => a.date);

    const dedupedActivities = dedupeActivitiesForLoad(allActivities);

    const weeklyData = {};

    dedupedActivities.forEach((activity) => {
      const activityDate = new Date(activity.date);
      if (Number.isNaN(activityDate.getTime()) || activityDate < startDate) return;

      const weekKey = localWeekStartKey(activityDate);
      if (!weekKey) return;

      if (!weeklyData[weekKey]) {
        const ws = new Date(`${weekKey}T12:00:00`);
        weeklyData[weekKey] = {
          weekStart: weekKey,
          weekLabel: ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          tss: 0,
        };
      }

      weeklyData[weekKey].tss += activity.tss || 0;
    });

    const data = Object.values(weeklyData).sort(
      (a, b) => a.weekStart.localeCompare(b.weekStart),
    );

    const calculateOptimalLoad = (index) => {
      if (index < 3) return Math.round(data[index]?.tss || 0);
      const last4Weeks = data.slice(Math.max(0, index - 3), index + 1);
      const avgTSS = last4Weeks.reduce((sum, w) => sum + (w.tss || 0), 0) / last4Weeks.length;
      return Math.round(avgTSS || 0);
    };

    return {
      data: data.map((week, index) => ({
        ...week,
        weekLabel: week.weekLabel || '',
        trainingLoad: Math.round(week.tss || 0),
        optimalLoad: calculateOptimalLoad(index),
      })),
    };
  } catch (error) {
    console.error('Error calculating weekly training load:', error);
    throw error;
  }
}

module.exports = {
  calculateFormFitnessData,
  calculateTodayMetrics,
  calculateTrainingStatus,
  calculateWeeklyTrainingLoad
};


