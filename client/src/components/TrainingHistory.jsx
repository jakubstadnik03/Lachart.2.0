import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Line } from 'react-chartjs-2';
import { useTrainings } from '../context/TrainingContext';
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
  const trainingContext = useTrainings();
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrainings = async () => {
      try {
        setLoading(true);
        if (typeof trainingContext.getTrainingsByTitle === 'function') {
          const data = await trainingContext.getTrainingsByTitle(decodeURIComponent(title));
          setTrainings(data);
        } else {
          console.error('getTrainingsByTitle is not a function:', trainingContext);
        }
      } catch (error) {
        console.error('Error fetching trainings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrainings();
  }, [title, trainingContext]);

  const chartData = {
    labels: trainings.map(t => new Date(t.date).toLocaleDateString()),
    datasets: [
      {
        label: 'Power',
        data: trainings.map(t => t.power),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
      },
      {
        label: 'Heart Rate',
        data: trainings.map(t => t.heartRate),
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1,
      },
      {
        label: 'Lactate',
        data: trainings.map(t => t.lactate),
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (trainings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold mb-4">No trainings found</h1>
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

      <div className="grid grid-cols-1 gap-4">
        {trainings.map((training, index) => (
          <motion.div
            key={training._id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-lg shadow-lg p-6"
          >
            <div className="space-y-4">
              <p className="font-medium text-lg">{new Date(training.date).toLocaleDateString()}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-gray-600">Sport</p>
                  <p className="font-medium">{training.sport}</p>
                </div>
                <div>
                  <p className="text-gray-600">Power</p>
                  <p className="font-medium">{training.power}</p>
                </div>
                <div>
                  <p className="text-gray-600">Heart Rate</p>
                  <p className="font-medium">{training.heartRate}</p>
                </div>
                <div>
                  <p className="text-gray-600">Lactate</p>
                  <p className="font-medium">{training.lactate}</p>
                </div>
                <div>
                  <p className="text-gray-600">RPE</p>
                  <p className="font-medium">{training.rpe}</p>
                </div>
                <div>
                  <p className="text-gray-600">Duration</p>
                  <p className="font-medium">{training.duration}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Training History</h2>
        <Line data={chartData} options={chartOptions} />
      </div>
    </motion.div>
  );
};

export default TrainingHistory; 