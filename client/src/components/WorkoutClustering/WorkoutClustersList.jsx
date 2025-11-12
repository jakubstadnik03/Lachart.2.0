import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getClusters, clusterWorkouts, updateClusterTitle } from '../../services/api';

const WorkoutClustersList = ({ onSelectWorkout, ftp = null }) => {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [clustering, setClustering] = useState(false);
  const [editingTitle, setEditingTitle] = useState(null);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    loadClusters();
  }, []);

  const loadClusters = async () => {
    try {
      setLoading(true);
      const response = await getClusters();
      if (response.success) {
        setClusters(response.clusters || []);
      }
    } catch (error) {
      console.error('Error loading clusters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCluster = async () => {
    try {
      setClustering(true);
      const response = await clusterWorkouts(ftp);
      
      // Show success message with statistics
      if (response.success) {
        const clusterCount = response.clusters?.length || 0;
        const workoutCount = response.workouts?.length || 0;
        alert(`Clustering completed!\n\nFound ${clusterCount} clusters\nGrouped ${workoutCount} workouts`);
      }
      
      await loadClusters();
    } catch (error) {
      console.error('Error clustering workouts:', error);
      alert('Error clustering workouts: ' + (error.response?.data?.message || error.message));
    } finally {
      setClustering(false);
    }
  };

  const handleUpdateTitle = async (clusterId, currentTitle) => {
    try {
      await updateClusterTitle(clusterId, newTitle || currentTitle);
      setEditingTitle(null);
      setNewTitle('');
      await loadClusters();
    } catch (error) {
      console.error('Error updating title:', error);
      alert('Error updating title');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600">Loading clusters...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Workout Clusters</h3>
          <p className="text-sm text-gray-600 mt-1">
            Automatically grouped similar workouts
          </p>
        </div>
        <button
          onClick={handleCluster}
          disabled={clustering}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {clustering && (
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {clustering ? 'Analyzing workouts...' : 'Cluster Workouts'}
        </button>
      </div>

      {clusters.length === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 text-center">
          <p className="text-gray-600 mb-4">No clusters found. Click "Cluster Workouts" to analyze your workouts.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {clusters.map((cluster) => (
            <motion.div
              key={cluster.clusterId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  {editingTitle === cluster.clusterId ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder={cluster.titleManual || cluster.canonicalTitle}
                        className="flex-1 px-3 py-1 border rounded-md text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => handleUpdateTitle(cluster.clusterId, cluster.canonicalTitle)}
                        className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingTitle(null);
                          setNewTitle('');
                        }}
                        className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-semibold text-gray-900">
                        {cluster.titleManual || cluster.canonicalTitle || 'Untitled Cluster'}
                      </h4>
                      <button
                        onClick={() => {
                          setEditingTitle(cluster.clusterId);
                          setNewTitle(cluster.titleManual || cluster.canonicalTitle || '');
                        }}
                        className="text-xs text-purple-600 hover:text-purple-700 underline"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {cluster.workouts?.length || 0} workouts • {cluster.pattern?.intensityZone || 'Unknown'} Zone
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {cluster.workouts?.slice(0, 5).map((workout) => (
                  <div
                    key={workout._id}
                    onClick={() => onSelectWorkout && onSelectWorkout(workout._id)}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer transition-colors"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{workout.title}</div>
                      <div className="text-xs text-gray-500">
                        {workout.timestamp ? new Date(workout.timestamp).toLocaleDateString() : 'Unknown date'}
                      </div>
                    </div>
                    {workout.pattern && (
                      <div className="text-xs text-gray-500">
                        {workout.pattern.intervalCount} intervals
                      </div>
                    )}
                  </div>
                ))}
                {cluster.workouts?.length > 5 && (
                  <div className="text-xs text-gray-500 text-center pt-2">
                    +{cluster.workouts.length - 5} more workouts
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkoutClustersList;

