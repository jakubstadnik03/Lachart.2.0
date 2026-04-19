const FitTraining = require('../models/fitTraining');
const WorkoutCluster = require('../models/workoutCluster');
const {
  detectIntervals,
  extractWorkoutPattern,
  calculateSimilarity,
  dbscan,
  generateClusterTitle
} = require('../utils/workoutClustering');

/**
 * Extract pattern from a single workout
 */
async function extractPattern(req, res) {
  try {
    const userId = req.user?.userId;
    const { workoutId } = req.params;
    const { ftp } = req.body; // Optional FTP for normalization

    const workout = await FitTraining.findOne({ _id: workoutId, athleteId: userId })
      .select('records workoutPattern patternExtracted')
      .lean();
    if (!workout) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    if (!workout.records || workout.records.length === 0) {
      return res.status(400).json({ error: 'No power data available' });
    }

    // Detect intervals
    const intervals = detectIntervals(workout.records);

    if (intervals.length === 0) {
      return res.status(400).json({ error: 'No intervals detected' });
    }

    // Extract pattern
    const pattern = extractWorkoutPattern(intervals, ftp);

    // Update workout with pattern (lean() means no .save() — use findByIdAndUpdate)
    await FitTraining.findByIdAndUpdate(workout._id, {
      workoutPattern: pattern,
      patternExtracted: true,
    });

    res.json({
      success: true,
      pattern,
      intervals: intervals.map(i => ({
        duration: i.workDuration,
        power: i.avgPower,
        restDuration: i.restDuration || 0
      }))
    });
  } catch (error) {
    console.error('Error extracting pattern:', error);
    res.status(500).json({ error: 'Failed to extract pattern', message: error.message });
  }
}

/**
 * Cluster all workouts for user
 * Memory-safe: processes records one workout at a time to avoid OOM on 512 MB instances.
 */
async function clusterWorkouts(req, res) {
  try {
    const userId = req.user?.userId;
    const { ftp, eps = 0.25, minPts = 3 } = req.body;

    // Step 1: Get lightweight metadata for all workouts — NO records loaded yet
    const workoutMeta = await FitTraining.find({
      athleteId: userId,
    })
      .select('_id patternExtracted workoutPattern titleManual titleAuto originalFileName timestamp sport laps')
      .lean();

    if (workoutMeta.length === 0) {
      return res.json({ clusters: [], workouts: [] });
    }

    // Step 2: For workouts missing patterns, load records one-at-a-time and extract
    const needsExtraction = workoutMeta.filter(w => !w.patternExtracted || !w.workoutPattern);
    for (const meta of needsExtraction) {
      // Load ONLY the records field for this single workout
      const workoutWithRecords = await FitTraining.findById(meta._id)
        .select('records workoutPattern patternExtracted')
        .lean();

      if (!workoutWithRecords?.records?.length) continue;

      const intervals = detectIntervals(workoutWithRecords.records);
      if (intervals.length > 0) {
        const pattern = extractWorkoutPattern(intervals, ftp);
        await FitTraining.findByIdAndUpdate(meta._id, {
          workoutPattern: pattern,
          patternExtracted: true,
        });
        // Patch the meta object so we use it below without re-querying
        meta.workoutPattern = pattern;
        meta.patternExtracted = true;
      }
      // workoutWithRecords goes out of scope here — GC can free it
    }

    // Step 3: Re-read lightweight metadata (now with extracted patterns)
    const updatedMeta = await FitTraining.find({ athleteId: userId })
      .select('_id patternExtracted workoutPattern titleManual titleAuto originalFileName timestamp sport laps')
      .lean();

    // Extract patterns for all workouts
    const patternsWithWorkouts = [];
    for (const workout of updatedMeta) {
      const pattern = workout.workoutPattern;
      if (pattern && pattern.intervalCount > 0) {
        patternsWithWorkouts.push({ workout, pattern });
      }
    }

    if (patternsWithWorkouts.length === 0) {
      return res.json({ clusters: [], workouts: [] });
    }

    // Perform clustering
    const patterns = patternsWithWorkouts.map(p => p.pattern);
    const clusters = dbscan(patterns, eps, minPts);

    // Save clusters to database
    // First, clear existing cluster assignments to avoid duplicates
    await FitTraining.updateMany(
      { athleteId: userId },
      { $unset: { clusterId: '', titleAuto: '' } }
    );

    const savedClusters = [];
    for (const cluster of clusters) {
      // Generate title
      const title = generateClusterTitle(cluster);

      // Create or update cluster
      // Use a stable cluster ID based on pattern characteristics
      const stableClusterId = `cluster_${Math.abs(
        cluster.patterns[0].intervalCount * 1000 +
        Math.round(cluster.patterns[0].meanDuration / 60) * 10 +
        Math.round(cluster.patterns[0].meanPowerNorm * 100)
      )}`;

      let existingCluster = await WorkoutCluster.findOne({
        clusterId: stableClusterId
      });

      if (!existingCluster) {
        existingCluster = new WorkoutCluster({
          clusterId: stableClusterId,
          canonicalTitle: title,
          pattern: {
            intervalCount: cluster.patterns[0].intervalCount,
            meanDuration: cluster.patterns.reduce((sum, p) => sum + p.meanDuration, 0) / cluster.patterns.length,
            stdDuration: cluster.patterns.reduce((sum, p) => sum + p.stdDuration, 0) / cluster.patterns.length,
            meanPowerNorm: cluster.patterns.reduce((sum, p) => sum + p.meanPowerNorm, 0) / cluster.patterns.length,
            workRestRatio: cluster.patterns.reduce((sum, p) => sum + p.workRestRatio, 0) / cluster.patterns.length,
            intensityZone: cluster.patterns[0].intensityZone,
            shapeVector: cluster.patterns[0].shapeVector
          },
          workoutIds: cluster.indices.map(idx => patternsWithWorkouts[idx].workout._id.toString()),
          exampleWorkouts: cluster.indices.slice(0, 3).map(idx => ({
            workoutId: patternsWithWorkouts[idx].workout._id.toString(),
            title: patternsWithWorkouts[idx].workout.titleManual || patternsWithWorkouts[idx].workout.titleAuto || 'Untitled',
            timestamp: patternsWithWorkouts[idx].workout.timestamp
          }))
        });
        await existingCluster.save();
      } else {
        // Update existing cluster
        existingCluster.workoutIds = cluster.indices.map(idx => patternsWithWorkouts[idx].workout._id.toString());
        existingCluster.exampleWorkouts = cluster.indices.slice(0, 3).map(idx => ({
          workoutId: patternsWithWorkouts[idx].workout._id.toString(),
          title: patternsWithWorkouts[idx].workout.titleManual || patternsWithWorkouts[idx].workout.titleAuto || 'Untitled',
          timestamp: patternsWithWorkouts[idx].workout.timestamp
        }));
        if (!existingCluster.titleManual) {
          existingCluster.canonicalTitle = title;
        }
        existingCluster.updatedAt = new Date();
        await existingCluster.save();
      }

      // Update workouts with cluster ID and auto title (lean objects — use updateMany)
      const workoutIds = cluster.indices.map(idx => patternsWithWorkouts[idx].workout._id);
      await FitTraining.updateMany(
        { _id: { $in: workoutIds } },
        { clusterId: stableClusterId, titleAuto: title }
      );

      savedClusters.push(existingCluster);
    }

    // Get workouts with cluster info (no records — keep it lean)
    const updatedWorkouts = await FitTraining.find({
      athleteId: userId,
      clusterId: { $ne: null }
    }).select('-records').lean().sort({ timestamp: -1 });

    res.json({
      success: true,
      clusters: savedClusters,
      workouts: updatedWorkouts.map(w => ({
        _id: w._id,
        title: w.titleManual || w.titleAuto || w.originalFileName,
        titleAuto: w.titleAuto,
        titleManual: w.titleManual,
        clusterId: w.clusterId,
        timestamp: w.timestamp,
        pattern: w.workoutPattern
      }))
    });
  } catch (error) {
    console.error('Error clustering workouts:', error);
    res.status(500).json({ error: 'Failed to cluster workouts', message: error.message });
  }
}

/**
 * Get all clusters for user
 */
async function getClusters(req, res) {
  try {
    const userId = req.user?.userId;

    // Get all workouts with clusters (exclude heavy records field)
    const workouts = await FitTraining.find({
      athleteId: userId,
      clusterId: { $ne: null }
    }).select('_id titleManual titleAuto originalFileName timestamp sport clusterId workoutPattern').lean();

    // Get unique cluster IDs
    const clusterIds = [...new Set(workouts.map(w => w.clusterId))];

    // Get cluster details
    const clusters = await WorkoutCluster.find({
      clusterId: { $in: clusterIds }
    }).lean();

    // Get workouts for each cluster
    const clustersWithWorkouts = clusters.map(cluster => {
      const clusterWorkouts = workouts
        .filter(w => w.clusterId === cluster.clusterId)
        .map(w => ({
          _id: w._id,
          title: w.titleManual || w.titleAuto || w.originalFileName,
          timestamp: w.timestamp,
          pattern: w.workoutPattern
        }));

      return {
        ...cluster,
        workouts: clusterWorkouts
      };
    });

    res.json({
      success: true,
      clusters: clustersWithWorkouts
    });
  } catch (error) {
    console.error('Error getting clusters:', error);
    res.status(500).json({ error: 'Failed to get clusters', message: error.message });
  }
}

/**
 * Update cluster title
 */
async function updateClusterTitle(req, res) {
  try {
    const userId = req.user?.userId;
    const { clusterId } = req.params;
    const { title, trainingRouteId } = req.body;

    const cluster = await WorkoutCluster.findOne({ clusterId });
    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    // Verify user owns workouts in this cluster
    const workouts = await FitTraining.find({
      athleteId: userId,
      clusterId
    });

    if (workouts.length === 0) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    cluster.titleManual = title;
    if (trainingRouteId) {
      cluster.trainingRouteId = trainingRouteId;
    }
    await cluster.save();

    // Update all workouts in cluster
    await FitTraining.updateMany(
      { clusterId },
      { titleManual: title, trainingRouteId }
    );

    res.json({
      success: true,
      cluster
    });
  } catch (error) {
    console.error('Error updating cluster title:', error);
    res.status(500).json({ error: 'Failed to update cluster title', message: error.message });
  }
}

/**
 * Get similar workouts to a given workout — auto-extracts pattern if needed.
 * Returns rich metric data for each similar workout for trend analysis.
 */
async function getSimilarWorkouts(req, res) {
  try {
    const userId = req.user?.userId;
    const { workoutId } = req.params;
    const { threshold = 0.65 } = req.query;

    // Load workout metadata without records first
    const workout = await FitTraining.findOne({ _id: workoutId, athleteId: userId })
      .select('_id titleManual titleAuto originalFileName timestamp sport laps workoutPattern patternExtracted clusterId')
      .lean();
    if (!workout) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    // Auto-extract pattern if not done yet — only then load records
    if (!workout.workoutPattern || !workout.patternExtracted) {
      const workoutWithRecords = await FitTraining.findById(workoutId)
        .select('records')
        .lean();
      if (workoutWithRecords?.records?.length > 0) {
        const intervals = detectIntervals(workoutWithRecords.records);
        if (intervals.length > 0) {
          const pattern = extractWorkoutPattern(intervals, null);
          await FitTraining.findByIdAndUpdate(workoutId, {
            workoutPattern: pattern,
            patternExtracted: true,
          });
          workout.workoutPattern = pattern;
          workout.patternExtracted = true;
        }
      }
    }

    if (!workout.workoutPattern || !workout.patternExtracted) {
      return res.json({ success: true, similar: [], reason: 'no_pattern' });
    }

    // Get all other workouts with extracted patterns
    const otherWorkouts = await FitTraining.find({
      athleteId: userId,
      _id: { $ne: workoutId },
      patternExtracted: true,
      'workoutPattern.intervalCount': { $gt: 0 }
    }).select('_id titleManual titleAuto originalFileName timestamp sport laps workoutPattern clusterId');

    // Calculate similarities and build rich response
    const similar = [];
    for (const other of otherWorkouts) {
      const similarity = calculateSimilarity(workout.workoutPattern, other.workoutPattern);
      if (similarity >= parseFloat(threshold)) {
        // Aggregate lap metrics
        const laps = other.laps || [];
        const lactateLaps = laps.filter(l => l.lactate != null && l.lactate > 0);
        const avgLactate = lactateLaps.length
          ? lactateLaps.reduce((s, l) => s + l.lactate, 0) / lactateLaps.length
          : null;
        const avgPower = laps.length
          ? laps.reduce((s, l) => s + (l.avgPower || l.avg_power || l.average_watts || 0), 0) / laps.length
          : other.workoutPattern?.meanPower || null;
        const avgHR = laps.length
          ? laps.reduce((s, l) => s + (l.avgHeartRate || l.avg_heart_rate || l.average_heartrate || 0), 0) / laps.length
          : null;
        const totalDuration = laps.reduce((s, l) => s + (l.moving_time || l.totalTimerTime || l.totalElapsedTime || 0), 0);
        const totalDistance = laps.reduce((s, l) => s + (l.totalDistance || l.distance || 0), 0);

        similar.push({
          _id: other._id,
          title: other.titleManual || other.titleAuto || other.originalFileName || 'Untitled',
          timestamp: other.timestamp,
          sport: other.sport,
          clusterId: other.clusterId,
          similarity: Math.round(similarity * 100),
          intervalCount: other.workoutPattern?.intervalCount,
          avgPower: avgPower ? Math.round(avgPower) : null,
          avgHR: avgHR ? Math.round(avgHR) : null,
          avgLactate: avgLactate ? Math.round(avgLactate * 10) / 10 : null,
          totalDuration,
          totalDistance: Math.round(totalDistance),
          lactateLapCount: lactateLaps.length,
        });
      }
    }

    // Sort by date (oldest first for trend chart)
    similar.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json({
      success: true,
      currentWorkout: {
        _id: workout._id,
        intervalCount: workout.workoutPattern?.intervalCount,
        pattern: workout.workoutPattern,
      },
      similar,
    });
  } catch (error) {
    console.error('Error getting similar workouts:', error);
    res.status(500).json({ error: 'Failed to get similar workouts', message: error.message });
  }
}

/**
 * GET /api/workout-clustering/cluster/:clusterId/trend
 * Returns all workouts in a cluster sorted chronologically with their metrics for trend analysis.
 */
async function getClusterTrend(req, res) {
  try {
    const userId = req.user?.userId;
    const { clusterId } = req.params;

    const workouts = await FitTraining.find({
      athleteId: userId,
      clusterId,
    })
      .select('_id titleManual titleAuto originalFileName timestamp sport laps workoutPattern')
      .sort({ timestamp: 1 });

    const trend = workouts.map(w => {
      const laps = w.laps || [];
      const lactateLaps = laps.filter(l => l.lactate != null && l.lactate > 0);
      const avgLactate = lactateLaps.length
        ? lactateLaps.reduce((s, l) => s + l.lactate, 0) / lactateLaps.length
        : null;
      const avgPower = w.workoutPattern?.meanPower
        || (laps.length ? laps.reduce((s, l) => s + (l.avgPower || l.avg_power || l.average_watts || 0), 0) / laps.length : null);
      const avgHR = laps.length
        ? laps.reduce((s, l) => s + (l.avgHeartRate || l.avg_heart_rate || l.average_heartrate || 0), 0) / laps.length
        : null;
      const totalDuration = laps.reduce((s, l) => s + (l.moving_time || l.totalTimerTime || l.totalElapsedTime || 0), 0);

      return {
        _id: w._id,
        title: w.titleManual || w.titleAuto || w.originalFileName || 'Untitled',
        timestamp: w.timestamp,
        sport: w.sport,
        avgPower: avgPower ? Math.round(avgPower) : null,
        avgHR: avgHR ? Math.round(avgHR) : null,
        avgLactate: avgLactate ? Math.round(avgLactate * 10) / 10 : null,
        totalDuration,
        intervalCount: w.workoutPattern?.intervalCount,
        lactateLapCount: lactateLaps.length,
      };
    });

    res.json({ success: true, clusterId, trend });
  } catch (error) {
    console.error('Error getting cluster trend:', error);
    res.status(500).json({ error: 'Failed to get cluster trend', message: error.message });
  }
}

module.exports = {
  extractPattern,
  clusterWorkouts,
  getClusters,
  updateClusterTitle,
  getSimilarWorkouts,
  getClusterTrend,
};

