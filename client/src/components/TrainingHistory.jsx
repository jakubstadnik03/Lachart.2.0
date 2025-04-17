import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Line } from 'react-chartjs-2';
import { getTrainingsByTitle } from '../services/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const TrainingHistory = () => {
  const { title } = useParams();
  const navigate = useNavigate();
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTrainings = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Use the API function directly
        const decodedTitle = decodeURIComponent(title);
        console.log('Fetching trainings with title:', decodedTitle);
        
        const data = await getTrainingsByTitle(decodedTitle);
        console.log('API response:', data);
        
        if (Array.isArray(data)) {
          setTrainings(data);
        } else {
          console.error('API returned non-array data:', data);
          setError('Invalid data format received from server');
        }
      } catch (error) {
        console.error('Error fetching trainings:', error);
        setError(error.message || 'Failed to fetch trainings');
      } finally {
        setLoading(false);
      }
    };

    fetchTrainings();
  }, [title]);

  // Prepare data for charts
  const chartData = {
    labels: trainings.map(t => new Date(t.date).toLocaleDateString()),
    datasets: [
      {
        label: 'Power',
        data: trainings.map(t => {
          // Calculate average power for all intervals
          const validPowers = t.results.filter(r => r.power > 0).map(r => r.power);
          return validPowers.length > 0 
            ? validPowers.reduce((sum, power) => sum + power, 0) / validPowers.length 
            : null;
        }),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
      {
        label: 'Heart Rate',
        data: trainings.map(t => {
          // Calculate average heart rate for all intervals
          const validHRs = t.results.filter(r => r.heartRate > 0).map(r => r.heartRate);
          return validHRs.length > 0 
            ? validHRs.reduce((sum, hr) => sum + hr, 0) / validHRs.length 
            : null;
        }),
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1,
      },
      {
        label: 'Lactate',
        data: trainings.map(t => {
          // Get max lactate value
          const validLactates = t.results.filter(r => r.lactate > 0).map(r => r.lactate);
          return validLactates.length > 0 
            ? Math.max(...validLactates) 
            : null;
        }),
        borderColor: 'rgb(153, 102, 255)',
        tension: 0.1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Training History',
      },
    },
  };

  // Format duration from seconds to MM:SS
  const formatDuration = (seconds) => {
    if (!seconds) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold mb-4 text-red-600">Error: {error}</h1>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (trainings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold mb-4">No trainings found for "{decodeURIComponent(title)}"</h1>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="container mx-auto px-4 py-8"
    >
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">{decodeURIComponent(title)}</h1>
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Go Back
        </button>
      </div>

      {/* Charts */}
      <div className="mb-8 bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Training History</h2>
        <Line data={chartData} options={chartOptions} />
      </div>

      {/* Training Details */}
      <div className="grid grid-cols-1 gap-4">
        {trainings.map((training, index) => (
          <motion.div
            key={training._id || index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-lg shadow-lg p-6"
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="font-medium text-lg">{new Date(training.date).toLocaleDateString()}</p>
                <p className="text-gray-600">{training.specifics?.specific || 'No specifics'}</p>
              </div>
              
              {training.description && (
                <p className="text-gray-700">{training.description}</p>
              )}
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-gray-600">Sport</p>
                  <p className="font-medium">{training.sport}</p>
                </div>
                <div>
                  <p className="text-gray-600">Type</p>
                  <p className="font-medium">{training.type}</p>
                </div>
                <div>
                  <p className="text-gray-600">Weather</p>
                  <p className="font-medium">{training.specifics?.weather || 'N/A'}</p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Interval</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Power</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Heart Rate</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lactate</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RPE</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {training.results.map((result) => (
                      <tr key={result._id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{result.interval}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDuration(result.duration)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{result.power || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{result.heartRate || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{result.lactate || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{result.RPE || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

export default TrainingHistory; 