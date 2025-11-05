const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt.config');
const verifyToken = require('../middleware/verifyToken');
const StravaActivity = require('../models/StravaActivity');
const User = require('../models/UserModel');
const router = express.Router();

// GET /api/integrations/strava/auth-url
router.get('/strava/auth-url', (req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID || 'STRAVA_CLIENT_ID';
  const redirectUri = process.env.STRAVA_REDIRECT_URI || 'http://localhost:8000/api/integrations/strava/callback';
  const scope = 'activity:read_all,profile:read_all,read_all';
  // Try to forward current JWT in state so callback can identify user without Authorization header
  const authHeader = req.headers.authorization || '';
  const state = encodeURIComponent(authHeader.replace('Bearer ', ''));
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&approval_prompt=auto&state=${state}`;
  res.json({ url });
});

// OAuth callback - exchange code for tokens and save to user
router.get('/strava/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    // Extract user from state (JWT passed from auth-url call)
    if (!state) return res.status(401).json({ error: 'Missing auth state' });
    let decoded;
    try {
      decoded = jwt.verify(decodeURIComponent(state), JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid auth state' });
    }
    const client_id = process.env.STRAVA_CLIENT_ID;
    const client_secret = process.env.STRAVA_CLIENT_SECRET;
    if (!client_id || !client_secret) {
      return res.status(500).json({ error: 'Strava credentials missing' });
    }
    const tokenResp = await axios.post('https://www.strava.com/oauth/token', {
      client_id,
      client_secret,
      code,
      grant_type: 'authorization_code'
    });
    const { access_token, refresh_token, expires_at, athlete } = tokenResp.data || {};
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.strava = {
      athleteId: athlete?.id?.toString() || user.strava?.athleteId || null,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_at
    };
    await user.save();
    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    // Redirect back to app with a flag
    return res.redirect(`${frontend}/fit-analysis?strava=connected`);
  } catch (err) {
    console.error('Strava callback error', err.response?.data || err.message);
    res.status(500).json({ error: 'Strava callback failed' });
  }
});

async function getValidStravaToken(user) {
  if (!user?.strava?.accessToken) return null;
  const now = Math.floor(Date.now() / 1000);
  if (user.strava.expiresAt && user.strava.expiresAt - 60 > now) return user.strava.accessToken;
  // refresh
  const client_id = process.env.STRAVA_CLIENT_ID;
  const client_secret = process.env.STRAVA_CLIENT_SECRET;
  const resp = await axios.post('https://www.strava.com/oauth/token', {
    client_id,
    client_secret,
    grant_type: 'refresh_token',
    refresh_token: user.strava.refreshToken
  });
  user.strava.accessToken = resp.data.access_token;
  user.strava.refreshToken = resp.data.refresh_token || user.strava.refreshToken;
  user.strava.expiresAt = resp.data.expires_at;
  await user.save();
  return user.strava.accessToken;
}

// Helper function to delay requests to respect rate limits
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// POST /api/integrations/strava/sync (basic history fetch)
router.post('/strava/sync', verifyToken, async (req, res) => {
  let imported = 0;
  let updated = 0;
  let total = 0;
  
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.strava?.accessToken) {
      return res.status(400).json({ error: 'Strava not connected' });
    }
    
    const token = await getValidStravaToken(user);
    if (!token) {
      return res.status(401).json({ error: 'Invalid Strava token' });
    }
    
    const per_page = 100;
    let page = 1;
    const maxPages = 200; // Safety limit: max 20,000 activities (200 × 100)
    
    // Optional: support 'since' parameter to fetch activities after a specific date
    const { since } = req.body || {};
    const params = { per_page };
    if (since) {
      params.after = new Date(since).getTime() / 1000; // Strava expects Unix timestamp
    }
    
    // Strava rate limit: 600 requests per 15 minutes = ~1 request per 1.5 seconds
    // Add delay between requests to avoid hitting rate limit
    const delayBetweenRequests = 2000; // 2 seconds between requests (conservative)
    
    console.log(`Starting Strava sync for user ${user._id}, max pages: ${maxPages}`);
    
    while (page <= maxPages) {
      try {
        console.log(`Fetching page ${page}...`);
        
        const resp = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
          headers: { Authorization: `Bearer ${token}` },
          params: { ...params, page },
          timeout: 30000 // 30 second timeout per request
        });
        
        const arr = resp.data || [];
        
        if (arr.length === 0) {
          console.log(`No more activities at page ${page}`);
          break; // No more activities
        }
        
        total += arr.length;
        console.log(`Processing ${arr.length} activities from page ${page} (total so far: ${total})`);
        
        // Process activities in batch to avoid overwhelming the database
        for (const a of arr) {
          try {
            const doc = {
              userId: user._id.toString(),
              stravaId: a.id,
              name: a.name || 'Untitled Activity',
              sport: a.sport_type || a.type || 'Ride',
              startDate: new Date(a.start_date_local || a.start_date),
              elapsedTime: a.elapsed_time || 0,
              movingTime: a.moving_time || 0,
              distance: a.distance || 0,
              averageSpeed: a.average_speed || null,
              averageHeartRate: a.average_heartrate || null,
              averagePower: a.average_watts || null,
              raw: a
            };
            
            const resUp = await StravaActivity.updateOne(
              { userId: user._id, stravaId: a.id },
              { $set: doc },
              { upsert: true }
            );
            
            if (resUp.upsertedCount > 0) imported += 1;
            else if (resUp.modifiedCount > 0) updated += 1;
          } catch (dbErr) {
            console.error(`Error saving activity ${a.id}:`, dbErr.message);
            // Continue with next activity
          }
        }
        
        // If we got less than per_page, we've reached the end
        if (arr.length < per_page) {
          console.log(`Reached end of activities (got ${arr.length} < ${per_page})`);
          break;
        }
        
        page += 1;
        
        // Add delay between requests to respect rate limits (except for last page)
        if (page <= maxPages) {
          await delay(delayBetweenRequests);
        }
      } catch (requestErr) {
        console.error(`Error on page ${page}:`, requestErr.response?.data || requestErr.message);
        
        // Handle rate limit errors
        if (requestErr.response?.status === 429 || 
            (requestErr.response?.data?.message && requestErr.response.data.message.includes('Rate Limit'))) {
          const rateLimitData = requestErr.response?.data || {};
          const retryAfter = requestErr.response?.headers?.['retry-after'] || 900; // Default 15 minutes
          
          console.error('Strava rate limit exceeded', {
            retryAfter,
            errors: rateLimitData.errors,
            imported,
            updated,
            total
          });
          
          return res.status(429).json({
            error: 'Strava rate limit exceeded',
            message: `Strava API rate limit has been exceeded. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
            retryAfter,
            imported,
            updated,
            totalFetched: total,
            partial: true
          });
        }
        
        // For other errors, log and continue if we have some data, otherwise fail
        if (total === 0) {
          throw requestErr;
        }
        
        // If we have some data, return partial results
        console.warn(`Request error on page ${page}, but returning partial results`);
        break;
      }
    }
    
    console.log(`Strava sync completed: imported ${imported}, updated ${updated}, total ${total}`);
    res.json({ imported, updated, totalFetched: total, status: 'ok' });
  } catch (err) {
    console.error('Strava sync error:', err);
    console.error('Error stack:', err.stack);
    
    // Handle rate limit errors in catch block too
    if (err.response?.status === 429 || 
        (err.response?.data?.message && err.response.data.message.includes('Rate Limit'))) {
      const retryAfter = err.response?.headers?.['retry-after'] || 900;
      return res.status(429).json({
        error: 'Strava rate limit exceeded',
        message: `Strava API rate limit has been exceeded. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
        retryAfter,
        imported,
        updated,
        totalFetched: total,
        partial: total > 0
      });
    }
    
    // Return partial results if we have any
    if (total > 0) {
      return res.json({
        imported,
        updated,
        totalFetched: total,
        status: 'partial',
        error: 'Sync completed with errors',
        message: err.message
      });
    }
    
    res.status(500).json({ 
      error: 'Strava sync failed',
      message: err.response?.data?.message || err.message || 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Garmin placeholders (note: Garmin has restricted APIs)
router.get('/garmin/auth-url', (req, res) => {
  const url = 'https://connect.garmin.com/';
  res.json({ url });
});

router.post('/garmin/sync', verifyToken, async (req, res) => {
  res.json({ imported: 0, updated: 0, status: 'stub' });
});

// List normalized activities
router.get('/activities', verifyToken, async (req, res) => {
  // Remove limit to show all activities, but add reasonable safety limit
  const acts = await StravaActivity.find({ userId: req.user.userId })
    .sort({ startDate: -1 })
    .limit(50000); // Safety limit: max 50,000 activities
  res.json(acts);
});

// Connection status
router.get('/status', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const stravaConnected = Boolean(user?.strava?.accessToken);
    const garminConnected = Boolean(user?.garmin?.accessToken);
    res.json({ stravaConnected, garminConnected });
  } catch (e) {
    res.status(500).json({ error: 'status_failed' });
  }
});

// Detailed activity with streams (time, speed, HR, power)
router.get('/strava/activities/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const token = await getValidStravaToken(user);
    const id = req.params.id;
    const detailResp = await axios.get(`https://www.strava.com/api/v3/activities/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const streamsResp = await axios.get(`https://www.strava.com/api/v3/activities/${id}/streams`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { keys: 'time,velocity_smooth,heartrate,watts,altitude', key_by_type: true }
    });
    // Laps (intervals)
    let laps = [];
    try {
      const lapsResp = await axios.get(`https://www.strava.com/api/v3/activities/${id}/laps`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      laps = lapsResp.data || [];
    } catch (e) {}
    
    // Get saved title, description and laps with lactate from database
    const savedActivity = await StravaActivity.findOne({ userId: user._id, stravaId: parseInt(id) });
    
    // Merge saved laps with lactate values into laps from API
    // Always use saved laps from database as base (they include manually created laps)
    // Then enrich with API lap data where available
    let mergedLaps = laps;
    if (savedActivity?.laps && savedActivity.laps.length > 0) {
      // Start with saved laps from database (they include manually created ones)
      mergedLaps = savedActivity.laps.map(savedLap => {
        // Try to find matching API lap by checking if startTime matches (within 5 seconds)
        const apiLap = laps.find(lap => {
          if (lap.start_date && savedLap.startTime) {
            const apiTime = new Date(lap.start_date).getTime();
            const savedTime = new Date(savedLap.startTime).getTime();
            return Math.abs(apiTime - savedTime) < 5000;
          }
          return false;
        });
        
        // If we found a matching API lap, merge the data (keep saved lap structure but add API data)
        if (apiLap) {
          return {
            ...savedLap,
            // Keep API lap fields that might be more up-to-date
            distance: apiLap.distance || savedLap.distance,
            average_speed: apiLap.average_speed || savedLap.average_speed,
            max_speed: apiLap.max_speed || savedLap.max_speed,
            average_heartrate: apiLap.average_heartrate || savedLap.average_heartrate,
            max_heartrate: apiLap.max_heartrate || savedLap.max_heartrate,
            average_watts: apiLap.average_watts || savedLap.average_watts,
            max_watts: apiLap.max_watts || savedLap.max_watts,
            average_cadence: apiLap.average_cadence || savedLap.average_cadence,
            max_cadence: apiLap.max_cadence || savedLap.max_cadence,
            // Preserve saved lap fields
            lactate: savedLap.lactate !== undefined ? savedLap.lactate : null,
            lapNumber: savedLap.lapNumber,
            startTime: savedLap.startTime,
            elapsed_time: savedLap.elapsed_time || apiLap.elapsed_time,
            moving_time: savedLap.moving_time || apiLap.moving_time
          };
        }
        // If no match, use saved lap as-is (manually created lap)
        return savedLap;
      });
      
      // Add any API laps that don't have matches in saved laps (shouldn't happen often, but just in case)
      laps.forEach(apiLap => {
        const hasMatch = savedActivity.laps.some(savedLap => {
          if (apiLap.start_date && savedLap.startTime) {
            const apiTime = new Date(apiLap.start_date).getTime();
            const savedTime = new Date(savedLap.startTime).getTime();
            return Math.abs(apiTime - savedTime) < 5000;
          }
          return false;
        });
        if (!hasMatch) {
          mergedLaps.push(apiLap);
        }
      });
      
      // Sort laps by startTime to ensure chronological order
      mergedLaps.sort((a, b) => {
        const timeA = a.startTime ? new Date(a.startTime).getTime() : (a.start_date ? new Date(a.start_date).getTime() : 0);
        const timeB = b.startTime ? new Date(b.startTime).getTime() : (b.start_date ? new Date(b.start_date).getTime() : 0);
        return timeA - timeB;
      });
    }
    
    res.json({ 
      detail: detailResp.data, 
      streams: streamsResp.data, 
      laps: mergedLaps,
      titleManual: savedActivity?.titleManual || null,
      description: savedActivity?.description || null
    });
  } catch (e) {
    console.error('Strava activity detail error', e.response?.data || e.message);
    res.status(500).json({ error: 'activity_detail_failed' });
  }
});

// Update Strava activity title and description
router.put('/strava/activities/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const stravaId = parseInt(req.params.id);
    const { title, description } = req.body;

    const activity = await StravaActivity.findOne({
      userId: user._id,
      stravaId: stravaId
    });

    if (!activity) {
      return res.status(404).json({ error: 'Strava activity not found' });
    }

    const oldTitle = activity.titleManual || activity.name;
    
    // Update title if provided
    if (title !== undefined) {
      activity.titleManual = title || null;
    }

    // Update description if provided
    if (description !== undefined) {
      activity.description = description || null;
    }

    await activity.save();

    // Update Training records with the same title
    if (title !== undefined && title) {
      const Training = require('../models/training');
      const newTitle = title.trim();
      
      // Find Training records with the same title (old or new)
      const trainingRecords = await Training.find({
        athleteId: user._id.toString(),
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

    res.json({
      success: true,
      activity
    });
  } catch (error) {
    console.error('Error updating Strava activity:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update Strava activity laps lactate values
router.put('/strava/activities/:id/lactate', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const stravaId = parseInt(req.params.id);
    const { lactateValues } = req.body; // [{ lapIndex: number, lactate: number }]

    const activity = await StravaActivity.findOne({
      userId: user._id,
      stravaId: stravaId
    });

    if (!activity) {
      return res.status(404).json({ error: 'Strava activity not found' });
    }

    // Initialize laps array if it doesn't exist
    if (!activity.laps || activity.laps.length === 0) {
      // Try to get laps from Strava API
      const token = await getValidStravaToken(user);
      try {
        const lapsResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}/laps`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        activity.laps = lapsResp.data || [];
      } catch (e) {
        return res.status(400).json({ error: 'No laps available for this activity' });
      }
    }

    // Update lactate values
    lactateValues.forEach(({ lapIndex, lactate }) => {
      if (activity.laps[lapIndex]) {
        activity.laps[lapIndex].lactate = lactate || null;
      }
    });

    await activity.save();

    // Sync to Training model - sync all intervals (not just those with lactate)
    try {
      const TrainingAbl = require('../abl/trainingAbl');
      // Merge activity data with detail for sync
      const activityData = {
        ...activity.toObject(),
        name: activity.name,
        titleManual: activity.titleManual,
        description: activity.description,
        sport: activity.sport,
        startDate: activity.startDate,
        elapsedTime: activity.elapsedTime,
        movingTime: activity.movingTime,
        laps: activity.laps
      };
      await TrainingAbl.syncTrainingFromSource('strava', activityData, user._id.toString());
    } catch (syncError) {
      console.error('Error syncing to Training model:', syncError);
      // Don't fail the request if sync fails
    }

    res.json({
      success: true,
      activity
    });
  } catch (error) {
    console.error('Error updating Strava activity lactate:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new lap from time range selection for Strava activity
router.post('/strava/activities/:id/laps', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const stravaId = parseInt(req.params.id);
    const { startTime, endTime } = req.body; // startTime and endTime in seconds from activity start

    const activity = await StravaActivity.findOne({
      userId: user._id,
      stravaId: stravaId
    });

    if (!activity) {
      return res.status(404).json({ error: 'Strava activity not found' });
    }

    // Get streams from Strava API to calculate statistics
    const token = await getValidStravaToken(user);
    let streams = null;
    try {
      const streamsResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}/streams`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { keys: 'time,velocity_smooth,heartrate,watts,altitude,cadence', key_by_type: true }
      });
      streams = streamsResp.data;
    } catch (e) {
      return res.status(400).json({ error: 'Could not fetch activity streams from Strava' });
    }

    // Find data points in the selected time range
    const timeStream = streams.time?.data || [];
    const speedStream = streams.velocity_smooth?.data || [];
    const hrStream = streams.heartrate?.data || [];
    const powerStream = streams.watts?.data || [];
    const cadenceStream = streams.cadence?.data || [];
    const altitudeStream = streams.altitude?.data || [];

    const selectedIndices = [];
    for (let i = 0; i < timeStream.length; i++) {
      const time = timeStream[i];
      if (time >= startTime && time <= endTime) {
        selectedIndices.push(i);
      }
    }

    if (selectedIndices.length === 0) {
      return res.status(400).json({ error: 'No data found in selected time range' });
    }

    // Calculate statistics from selected data points
    const speeds = selectedIndices.map(i => speedStream[i]).filter(v => v && v > 0);
    const heartRates = selectedIndices.map(i => hrStream[i]).filter(v => v && v > 0);
    const powers = selectedIndices.map(i => powerStream[i]).filter(v => v && v > 0);
    const cadences = selectedIndices.map(i => cadenceStream[i]).filter(v => v && v > 0);

    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;
    const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null;
    const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : null;
    const avgPower = powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null;
    const maxPower = powers.length > 0 ? Math.max(...powers) : null;
    const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : null;
    const maxCadence = cadences.length > 0 ? Math.max(...cadences) : null;

    // Calculate distance (approximate from speed)
    const totalDistance = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) * (endTime - startTime) / selectedIndices.length : null;

    // Calculate elapsed time
    const elapsedTime = endTime - startTime;

    // Get activity start date from Strava API detail
    let activityStartDate = null;
    try {
      const detailResp = await axios.get(`https://www.strava.com/api/v3/activities/${stravaId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Use start_date_local if available (more accurate), otherwise start_date
      const startDateStr = detailResp.data.start_date_local || detailResp.data.start_date;
      if (startDateStr) {
        activityStartDate = new Date(startDateStr);
      }
    } catch (e) {
      // Fallback to activity.startDate if API call fails
      activityStartDate = activity.startDate ? new Date(activity.startDate) : new Date();
    }
    
    // Final fallback if still no date
    if (!activityStartDate || isNaN(activityStartDate.getTime())) {
      activityStartDate = activity.startDate ? new Date(activity.startDate) : new Date();
    }

    // Create new lap with startTime relative to activity start_date
    const newLap = {
      lapNumber: (activity.laps?.length || 0) + 1,
      startTime: new Date(activityStartDate.getTime() + startTime * 1000),
      elapsed_time: elapsedTime,
      moving_time: elapsedTime,
      distance: totalDistance || 0,
      average_speed: avgSpeed || 0,
      max_speed: maxSpeed || 0,
      average_heartrate: avgHeartRate,
      max_heartrate: maxHeartRate,
      average_watts: avgPower,
      max_watts: maxPower,
      average_cadence: avgCadence,
      max_cadence: maxCadence
    };

    // Initialize laps array if it doesn't exist
    if (!activity.laps) {
      activity.laps = [];
    }
    activity.laps.push(newLap);

    await activity.save();

    res.json({
      success: true,
      lap: newLap,
      activity
    });
  } catch (error) {
    console.error('Error creating Strava lap:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a lap from Strava activity
router.delete('/strava/activities/:id/laps/:lapIndex', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const stravaId = parseInt(req.params.id);
    const lapIndex = parseInt(req.params.lapIndex);

    const activity = await StravaActivity.findOne({
      userId: user._id,
      stravaId: stravaId
    });

    if (!activity) {
      return res.status(404).json({ error: 'Strava activity not found' });
    }

    if (!activity.laps || activity.laps.length === 0) {
      return res.status(400).json({ error: 'No laps available for this activity' });
    }

    if (lapIndex < 0 || lapIndex >= activity.laps.length) {
      return res.status(400).json({ error: 'Invalid lap index' });
    }

    // Remove the lap at the specified index
    activity.laps.splice(lapIndex, 1);
    
    // Update lap numbers for remaining laps
    activity.laps.forEach((lap, index) => {
      lap.lapNumber = index + 1;
    });

    await activity.save();

    res.json({
      success: true,
      message: 'Lap deleted successfully',
      activity
    });
  } catch (error) {
    console.error('Error deleting Strava lap:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
