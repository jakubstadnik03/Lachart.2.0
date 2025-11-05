import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getSimilarWorkouts } from '../../services/api';

const SimilarWorkouts = ({ workoutId, onSelectWorkout, threshold = 0.75 }) => {
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (workoutId) {
      loadSimilar();
    }
  }, [workoutId]);

  const loadSimilar = async () => {
    try {
      setLoading(true);
      const response = await getSimilarWorkouts(workoutId, threshold);
      if (response.success) {
        setSimilar(response.similar || []);
      }
    } catch (error) {
      console.error('Error loading similar workouts:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!workoutId) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Similar Workouts
        </h3>
        <p className="text-sm text-gray-600">
          Select a training to see similar workouts here.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Similar Workouts
        </h3>
        <div className="text-sm text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Similar Workouts
      </h3>
      {similar.length === 0 ? (
        <p className="text-sm text-gray-600">
          No similar workouts found (threshold: {Math.round(threshold * 100)}%).
        </p>
      ) : (
        <div className="space-y-2">
          {similar.map((item, index) => (
            <motion.div
              key={item.workout._id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onSelectWorkout && onSelectWorkout(item.workout._id)}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer transition-colors"
            >
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">{item.workout.title}</div>
                <div className="text-xs text-gray-500">
                  {item.workout.timestamp ? new Date(item.workout.timestamp).toLocaleDateString() : 'Unknown date'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-purple-600 font-medium">
                  {Math.round(item.similarity * 100)}%
                </div>
                {item.workout.clusterId && (
                  <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
                    Clustered
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SimilarWorkouts;

