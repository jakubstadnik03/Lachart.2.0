const FitTraining = require('../models/fitTraining');
const StravaActivity = require('../models/StravaActivity');
const Training = require('../models/training');
const User = require('../models/UserModel');
const mongoose = require('mongoose');

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
    return sportLower === 'running' || sportLower.includes('run') || sportLower === 'run';
  }
  if (filter === 'swim') {
    return sportLower === 'swimming' || sportLower.includes('swim');
  }
  return true;
}

// Helper function to calculate TSS for activity (same logic as CalendarView.jsx)
function calculateActivityTSS(activity, userProfile = null) {
  try {
    // Get duration - try different field names
    const seconds = Number(activity.movingTime || activity.totalElapsedTime || activity.elapsedTime || activity.duration || 0);
    if (seconds === 0) return 0;
    
    // Get FTP and threshold paces from user profile (same as CalendarView.jsx)
    const ftp = userProfile?.powerZones?.cycling?.lt2 || 
                userProfile?.powerZones?.cycling?.zone5?.min || 
                userProfile?.ftp || 
                250; // Default estimate
    const thresholdPace = userProfile?.powerZones?.running?.lt2 || 
                          userProfile?.runningZones?.lt2 || 
                          null;
    const thresholdSwimPace = userProfile?.powerZones?.swimming?.lt2 || null;
    
    const sport = (activity.sport || '').toLowerCase();
    
    // For cycling: TSS = (seconds * NP^2) / (FTP^2 * 3600) * 100
    if (sport.includes('ride') || sport.includes('cycle') || sport.includes('bike') || sport === 'cycling') {
      const avgPower = Number(activity.averagePower || activity.avgPower || 0);
      if (avgPower > 0 && ftp > 0) {
        const np = avgPower; // Using avgPower as NP approximation
        return Math.round((seconds * Math.pow(np, 2)) / (Math.pow(ftp, 2) * 3600) * 100);
      }
    }
    
    // For running: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
    if (sport.includes('run') || sport.includes('walk') || sport.includes('hike') || sport === 'running') {
      const avgSpeed = Number(activity.averageSpeed || activity.avgSpeed || 0); // m/s
      if (avgSpeed > 0) {
        const avgPaceSeconds = Math.round(1000 / avgSpeed); // seconds per km
        let referencePace = thresholdPace;
        // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
        if (!referencePace || referencePace <= 0) {
          referencePace = avgPaceSeconds;
        }
        // Faster pace (lower seconds) = higher intensity = higher TSS
        const intensityRatio = referencePace / avgPaceSeconds; // > 1 if faster than reference
        return Math.round((seconds * Math.pow(intensityRatio, 2)) / 3600 * 100);
      }
    }
    
    // For swimming: TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
    // Swimming pace is per 100m (not per km)
    if (sport.includes('swim') || sport === 'swimming') {
      const avgSpeed = Number(activity.averageSpeed || activity.avgSpeed || 0); // m/s
      if (avgSpeed > 0) {
        const avgPaceSeconds = Math.round(100 / avgSpeed); // seconds per 100m
        let referencePace = thresholdSwimPace;
        // If no threshold pace from profile, use average pace as reference (intensity = 1.0)
        if (!referencePace || referencePace <= 0) {
          referencePace = avgPaceSeconds;
        }
        // Faster pace (lower seconds) = higher intensity = higher TSS
        const intensityRatio = referencePace / avgPaceSeconds; // > 1 if faster than reference
        return Math.round((seconds * Math.pow(intensityRatio, 2)) / 3600 * 100);
      }
    }
    
    return 0;
  } catch (error) {
    console.error('Error calculating activity TSS:', error);
    return 0;
  }
}

// Helper function to calculate TSS for Strava activity (alias for consistency)
function calculateStravaTSS(activity, userProfile = null) {
  return calculateActivityTSS(activity, userProfile);
}

async function calculateFormFitnessData(athleteId, days = 60, sportFilter = 'all') {
  try {
    console.log('calculateFormFitnessData called with athleteId:', athleteId, 'days:', days, 'sportFilter:', sportFilter);
    
    // Limit days to prevent excessive memory usage (max 180 days)
    const maxDays = 180;
    const effectiveDays = Math.min(days, maxDays);
    
    // Calculate date range: we need activities from (days + 60) ago to ensure accurate CTL/ATL calculation
    // CTL has 42-day time constant, so we need at least 60 days of history for accurate calculation
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const queryStartDate = new Date(today);
    queryStartDate.setDate(queryStartDate.getDate() - (effectiveDays + 60)); // Extra 60 days for CTL calculation
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
    
    const userProfile = user ? {
      powerZones: user.powerZones || {},
      ftp: user.ftp || 250
    } : null;

    // Try both String and ObjectId formats for athleteId
    const athleteIdStr = String(athleteId);
    let athleteIdObj = null;
    try {
      athleteIdObj = new mongoose.Types.ObjectId(athleteId);
    } catch (e) {
      // Not a valid ObjectId, use string
    }

    // Get activities with TSS - only from queryStartDate onwards to reduce memory usage
    const fitTrainings = await FitTraining.find({ 
      athleteId: athleteIdStr,
      timestamp: { $gte: queryStartDate }
    })
      .select('timestamp trainingStressScore totalElapsedTime sport avgPower avgSpeed')
      .sort({ timestamp: 1 })
      .lean();

    // StravaActivity uses userId, try both formats - limit by date
    let stravaActivities = await StravaActivity.find({ 
      userId: athleteIdStr,
      startDate: { $gte: queryStartDate }
    })
      .select('startDate movingTime averagePower averageSpeed sport')
      .sort({ startDate: 1 })
      .lean();

    // If no results and athleteId is ObjectId, try with ObjectId format
    if (stravaActivities.length === 0 && athleteIdObj) {
      stravaActivities = await StravaActivity.find({ 
        userId: athleteIdObj,
        startDate: { $gte: queryStartDate }
      })
        .select('startDate movingTime averagePower averageSpeed sport')
        .sort({ startDate: 1 })
        .lean();
    }

    const trainings = await Training.find({ 
      athleteId: athleteIdStr,
      date: { $gte: queryStartDate }
    })
      .select('date sport')
      .sort({ date: 1 })
      .lean();

    // Combine all activities with TSS and sport info
    // Use stored TSS if available, otherwise calculate it (same logic as CalendarView.jsx)
    const allActivities = [
      ...fitTrainings
        .filter(t => matchesSportFilter(t.sport, sportFilter))
        .map(t => {
          // Use stored TSS if available, otherwise calculate it
          let tss = Number(t.trainingStressScore || 0);
          if ((!tss || tss === 0) && t.totalElapsedTime > 0) {
            tss = calculateActivityTSS({
              sport: t.sport,
              totalElapsedTime: t.totalElapsedTime,
              avgPower: t.avgPower,
              avgSpeed: t.avgSpeed
            }, userProfile);
          }
          return {
            date: t.timestamp,
            tss: tss,
            sport: t.sport || 'generic'
          };
        }),
      ...stravaActivities
        .filter(a => matchesSportFilter(a.sport, sportFilter))
        .map(a => ({
          date: a.startDate,
          tss: calculateActivityTSS(a, userProfile),
          sport: a.sport || 'generic'
        })),
      ...trainings
        .filter(t => {
          // Map Training sport format (run/bike/swim) to filter
          if (sportFilter === 'all') return true;
          const trainingSport = t.sport || '';
          if (sportFilter === 'bike') return trainingSport === 'bike';
          if (sportFilter === 'run') return trainingSport === 'run';
          if (sportFilter === 'swim') return trainingSport === 'swim';
          return true;
        })
        .map(t => ({
          date: t.date,
          tss: 0, // Training model doesn't have TSS, would need to calculate from results
          sport: t.sport || 'generic'
        }))
    ].filter(a => a.date).sort((a, b) => new Date(a.date) - new Date(b.date));

    if (allActivities.length === 0) {
      console.log('No activities found for athleteId:', athleteId);
      return [];
    }

    // Calculate Fitness, Fatigue, and Form over time
    // Use the queryStartDate as calculation start (we already limited queries to this date)
    // Find the earliest activity date from loaded data
    const earliestActivityDate = allActivities.length > 0 
      ? new Date(allActivities[0].date)
      : queryStartDate;
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
    allActivities.forEach(activity => {
      const activityDate = new Date(activity.date);
      const dateStr = activityDate.toISOString().split('T')[0];
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
        const dateStr = d.toISOString().split('T')[0];
        const tssToday = dailyTSS[dateStr] || 0; // rest days are 0

        // Form for this day is yesterday's balance (before updating today)
        const form = ctl - atl;

        // Update CTL/ATL with today's TSS (EMA)
        ctl = ctl + alphaCTL * (tssToday - ctl);
        atl = atl + alphaATL * (tssToday - atl);

        // Debug logging for today's values
        if (dateStr === today.toISOString().split('T')[0]) {
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
            Fatigue: Math.round(atl)
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
        const dateStr = d.toISOString().split('T')[0];
        const tssToday = dailyTSS[dateStr] || 0; // rest days are 0

        // Form for this day is yesterday's balance (before updating today)
        const form = ctl - atl;

        // Update CTL/ATL with today's TSS (EMA)
        ctl = ctl + alphaCTL * (tssToday - ctl);
        atl = atl + alphaATL * (tssToday - atl);

        // Debug logging for today's values
        if (dateStr === today.toISOString().split('T')[0]) {
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
            Fatigue: Math.round(atl)
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
    
    const userProfile = user ? {
      powerZones: user.powerZones || {},
      ftp: user.ftp || 250
    } : null;

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
      .select('timestamp trainingStressScore sport totalElapsedTime avgPower avgSpeed')
      .lean();

    // StravaActivity uses userId
    let stravaActivities = await StravaActivity.find({ 
      userId: athleteIdStr,
      startDate: { $gte: fourWeeksAgo }
    })
      .select('startDate movingTime averagePower averageSpeed sport')
      .lean();

    if (stravaActivities.length === 0 && athleteIdObj) {
      stravaActivities = await StravaActivity.find({ 
        userId: athleteIdObj,
        startDate: { $gte: fourWeeksAgo }
      })
        .select('startDate movingTime averagePower averageSpeed sport')
        .lean();
    }

    const allActivities = [
      ...fitTrainings.map(t => {
        // Use stored TSS if available, otherwise calculate it (same logic as CalendarView.jsx)
        let tss = Number(t.trainingStressScore || 0);
        if ((!tss || tss === 0) && t.totalElapsedTime > 0) {
          tss = calculateActivityTSS({
            sport: t.sport,
            totalElapsedTime: t.totalElapsedTime,
            avgPower: t.avgPower,
            avgSpeed: t.avgSpeed
          }, userProfile);
        }
        return {
          date: t.timestamp,
          tss: tss
        };
      }),
      ...stravaActivities.map(a => ({
        date: a.startDate,
        tss: calculateActivityTSS(a, userProfile)
      }))
    ].filter(a => a.date);

    // Calculate weekly TSS for last 4 weeks
    const weeklyTSSArray = [];
    for (let i = 0; i < 4; i++) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      
      const weekTSS = allActivities
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

/**
 * Calculate weekly training load
 */
async function calculateWeeklyTrainingLoad(athleteId, months = 3, sportFilter = 'all') {
  try {
    console.log('calculateWeeklyTrainingLoad called with athleteId:', athleteId, 'months:', months, 'sportFilter:', sportFilter);
    
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
    
    const userProfile = user ? {
      powerZones: user.powerZones || {},
      ftp: user.ftp || 250
    } : null;

    const today = new Date();
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - months);

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
      timestamp: { $gte: startDate }
    })
      .select('timestamp trainingStressScore sport totalElapsedTime avgPower avgSpeed')
      .lean();

    // StravaActivity uses userId
    let stravaActivities = await StravaActivity.find({ 
      userId: athleteIdStr,
      startDate: { $gte: startDate }
    })
      .select('startDate movingTime averagePower averageSpeed sport')
      .lean();

    if (stravaActivities.length === 0 && athleteIdObj) {
      stravaActivities = await StravaActivity.find({ 
        userId: athleteIdObj,
        startDate: { $gte: startDate }
      })
        .select('startDate movingTime averagePower averageSpeed sport')
        .lean();
    }

    const allActivities = [
      ...fitTrainings
        .filter(t => matchesSportFilter(t.sport, sportFilter))
        .map(t => {
          // Use stored TSS if available, otherwise calculate it (same logic as CalendarView.jsx)
          let tss = Number(t.trainingStressScore || 0);
          if ((!tss || tss === 0) && t.totalElapsedTime > 0) {
            tss = calculateActivityTSS({
              sport: t.sport,
              totalElapsedTime: t.totalElapsedTime,
              avgPower: t.avgPower,
              avgSpeed: t.avgSpeed
            }, userProfile);
          }
          return {
            date: t.timestamp,
            tss: tss
          };
        }),
      ...stravaActivities
        .filter(a => matchesSportFilter(a.sport, sportFilter))
        .map(a => ({
          date: a.startDate,
          tss: calculateActivityTSS(a, userProfile)
        }))
    ].filter(a => a.date);

    // Group activities by week
    const weeklyData = {};
    
    allActivities.forEach(activity => {
      const activityDate = new Date(activity.date);
      if (activityDate < startDate) return;

      // Get week start (Monday)
      const weekStart = new Date(activityDate);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
      weekStart.setDate(diff);
      weekStart.setHours(0, 0, 0, 0);

      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          weekStart: weekKey,
          weekLabel: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          tss: 0
        };
      }
      
      weeklyData[weekKey].tss += activity.tss || 0;
    });

    // Convert to array and sort by date
    const data = Object.values(weeklyData).sort((a, b) => 
      new Date(a.weekStart) - new Date(b.weekStart)
    );

    // Calculate optimal load (average of last 4 weeks, with some variation)
    const calculateOptimalLoad = (index) => {
      if (index < 3) return data[index]?.tss || 0;
      
      const last4Weeks = data.slice(Math.max(0, index - 3), index + 1);
      const avgTSS = last4Weeks.reduce((sum, w) => sum + (w.tss || 0), 0) / last4Weeks.length;
      return Math.round(avgTSS || 0);
    };

    return {
      data: data.map((week, index) => ({
        ...week,
        weekLabel: week.weekLabel || '',
        trainingLoad: Math.round(week.tss || 0),
        optimalLoad: calculateOptimalLoad(index)
      }))
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


