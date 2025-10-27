import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend as ChartLegend,
} from 'chart.js';
import api from '../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  ChartLegend
);

const FitFileAnalyzer = () => {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileUpload = useCallback((event) => {
    const uploadedFile = event.target.files[0];
    if (uploadedFile && uploadedFile.name.endsWith('.fit')) {
      setFile(uploadedFile);
      setError(null);
      analyzeFitFile(uploadedFile);
    } else {
      setError('Please select a valid .fit file');
    }
  }, []);

  const analyzeFitFile = async (file) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('fitFile', file);
      
      const response = await api.post('/api/fit-analyzer/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        setAnalysis(response.data.data);
      } else {
        throw new Error(response.data.message || 'Analysis failed');
      }
    } catch (err) {
      setError('Error analyzing file: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        title: { display: true, text: 'Time' }
      },
      y: {
        title: { display: true, text: 'Power (W) / HR (bpm) / Speed (km/h)' }
      }
    },
    plugins: {
      legend: { display: true },
      title: { display: true, text: 'Training Analysis' }
    }
  };

  const chartData = analysis ? {
    labels: analysis.chartData.labels,
    datasets: [
      {
        label: 'Power (W)',
        data: analysis.chartData.power,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        yAxisID: 'y'
      },
      {
        label: 'Heart Rate (bpm)',
        data: analysis.chartData.hr,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        yAxisID: 'y'
      },
      {
        label: 'Speed (km/h)',
        data: analysis.chartData.speed,
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        yAxisID: 'y'
      }
    ]
  } : null;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg p-6"
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              📊 FIT File Analyzer
            </h1>
            <p className="text-gray-600">
              Upload your .fit file to analyze training data, intervals, and laps
            </p>
          </div>

          {/* File Upload */}
          <div className="mb-8">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".fit"
                onChange={handleFileUpload}
                className="hidden"
                id="fit-file-upload"
              />
              <label
                htmlFor="fit-file-upload"
                className="cursor-pointer flex flex-col items-center"
              >
                <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-lg font-medium text-gray-700">
                  {file ? file.name : 'Click to upload .fit file'}
                </span>
                <span className="text-sm text-gray-500 mt-1">
                  Supported format: .fit files only
                </span>
              </label>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-8">
              <div className="inline-flex items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
                <span className="text-gray-600">Analyzing file...</span>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex">
                <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span className="text-red-800">{error}</span>
              </div>
            </div>
          )}

          {/* Analysis Results */}
          {analysis && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{analysis.totalTime}</div>
                  <div className="text-sm text-gray-600">Total Time</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{analysis.totalDistance}</div>
                  <div className="text-sm text-gray-600">Distance</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">{analysis.averagePower}</div>
                  <div className="text-sm text-gray-600">Avg Power</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{analysis.averageHR}</div>
                  <div className="text-sm text-gray-600">Avg HR</div>
                </div>
              </div>

              {/* Chart */}
              <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Training Chart</h3>
                <div style={{ height: '400px' }}>
                  {chartData && <Line data={chartData} options={chartOptions} />}
                </div>
              </div>

              {/* Intervals */}
              <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Intervals</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Name</th>
                        <th className="text-left py-2">Duration</th>
                        <th className="text-left py-2">Power</th>
                        <th className="text-left py-2">HR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.intervals.map((interval, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2">{interval.name}</td>
                          <td className="py-2">{interval.duration}</td>
                          <td className="py-2">{interval.power}</td>
                          <td className="py-2">{interval.hr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Laps */}
              <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Laps</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Lap</th>
                        <th className="text-left py-2">Time</th>
                        <th className="text-left py-2">Distance</th>
                        <th className="text-left py-2">Power</th>
                        <th className="text-left py-2">HR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.laps.map((lap, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2">{lap.lap}</td>
                          <td className="py-2">{lap.time}</td>
                          <td className="py-2">{lap.distance}</td>
                          <td className="py-2">{lap.power}</td>
                          <td className="py-2">{lap.hr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default FitFileAnalyzer;
