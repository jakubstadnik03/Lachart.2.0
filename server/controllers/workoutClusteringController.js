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

    const workout = await FitTraining.findOne({ _id: workoutId, athleteId: userId });
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

    // Update workout with pattern
    workout.workoutPattern = pattern;
    workout.patternExtracted = true;
    await workout.save();

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
 */
async function clusterWorkouts(req, res) {
  try {
    const userId = req.user?.userId;
    const { ftp, eps = 0.25, minPts = 3 } = req.body;

    // Get all workouts with power data
    const workouts = await FitTraining.find({
      athleteId: userId,
      'records.power': { $exists: true, $ne: null }
    });

    if (workouts.length === 0) {
      return res.json({ clusters: [], workouts: [] });
    }

    // Extract patterns for all workouts
    const patternsWithWorkouts = [];
    for (const workout of workouts) {
      let pattern = workout.workoutPattern;

      // Extract pattern if not already extracted
      if (!pattern || !workout.patternExtracted) {
        const intervals = detectIntervals(workout.records);
        if (intervals.length > 0) {
          pattern = extractWorkoutPattern(intervals, ftp);
          workout.workoutPattern = pattern;
          workout.patternExtracted = true;
          await workout.save();
        }
      }

      if (pattern && pattern.intervalCount > 0) {
        patternsWithWorkouts.push({
          workout,
          pattern
        });
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

      // Update workouts with cluster ID and auto title
      for (let i = 0; i < cluster.indices.length; i++) {
        const idx = cluster.indices[i];
        const workout = patternsWithWorkouts[idx].workout;
        workout.clusterId = stableClusterId;
        workout.titleAuto = title;
        await workout.save();
      }

      savedClusters.push(existingCluster);
    }

    // Get workouts with cluster info
    const updatedWorkouts = await FitTraining.find({
      athleteId: userId,
      clusterId: { $ne: null }
    }).sort({ timestamp: -1 });

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

    // Get all workouts with clusters
    const workouts = await FitTraining.find({
      athleteId: userId,
      clusterId: { $ne: null }
    });

    // Get unique cluster IDs
    const clusterIds = [...new Set(workouts.map(w => w.clusterId))];

    // Get cluster details
    const clusters = await WorkoutCluster.find({
      clusterId: { $in: clusterIds }
    });

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
        ...cluster.toObject(),
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
 * Get similar workouts to a given workout
 */
async function getSimilarWorkouts(req, res) {
  try {
    const userId = req.user?.userId;
    const { workoutId } = req.params;
    const { threshold = 0.75 } = req.query;

    const workout = await FitTraining.findOne({ _id: workoutId, athleteId: userId });
    if (!workout) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    if (!workout.workoutPattern || !workout.patternExtracted) {
      return res.status(400).json({ error: 'Pattern not extracted for this workout' });
    }

    // Get all other workouts
    const otherWorkouts = await FitTraining.find({
      athleteId: userId,
      _id: { $ne: workoutId },
      patternExtracted: true,
      'workoutPattern.intervalCount': { $gt: 0 }
    });

    // Calculate similarities
    const similar = [];
    for (const other of otherWorkouts) {
      const similarity = calculateSimilarity(workout.workoutPattern, other.workoutPattern);
      if (similarity >= parseFloat(threshold)) {
        similar.push({
          workout: {
            _id: other._id,
            title: other.titleManual || other.titleAuto || other.originalFileName,
            timestamp: other.timestamp,
            clusterId: other.clusterId
          },
          similarity
        });
      }
    }

    // Sort by similarity
    similar.sort((a, b) => b.similarity - a.similarity);

    res.json({
      success: true,
      similar: similar.slice(0, 10) // Top 10
    });
  } catch (error) {
    console.error('Error getting similar workouts:', error);
    res.status(500).json({ error: 'Failed to get similar workouts', message: error.message });
  }
}

module.exports = {
  extractPattern,
  clusterWorkouts,
  getClusters,
  updateClusterTitle,
  getSimilarWorkouts
};

