import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Line } from 'react-chartjs-2';
import { getTrainingsByTitle, getTrainingTitles, deleteTraining, updateTraining } from '../services/api';
import api from '../services/api';
import { useNotification } from '../context/NotificationContext';
import TrainingForm from './TrainingForm';
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
  const [tooltip, setTooltip] = useState(null);
  const [allTrainingTitles, setAllTrainingTitles] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedSport, setSelectedSport] = useState(null);
  const [trainingToEdit, setTrainingToEdit] = useState(null);
  const [trainingToDelete, setTrainingToDelete] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { addNotification } = useNotification();

  // Format duration based on durationType
  const formatDuration = (duration, durationType) => {
    if (!duration) return '00:00';
    
    // If duration is already a string (like "1 km"), return it as is
    if (typeof duration === 'string') {
      return duration;
    }
    
    // If duration is a number, format it as time
    const minutes = Math.floor(duration / 60);
    const remainingSeconds = Math.floor(duration % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Convert seconds to pace for display
  const secondsToPace = (seconds) => {
    if (!seconds) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

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
        
        if (Array.isArray(data) && data.length > 0) {
          setTrainings(data);
          // Set the sport from the first training
          setSelectedSport(data[0].sport);
        } else {
          console.error('API returned non-array data or empty array:', data);
          setError('Invalid data format received from server');
        }
      } catch (error) {
        console.error('Error fetching trainings:', error);
        setError(error.message || 'Failed to fetch trainings');
      } finally {
        setLoading(false);
      }
    };

    const fetchAllTrainingTitles = async () => {
      try {
        const titles = await getTrainingTitles();
        if (Array.isArray(titles)) {
          setAllTrainingTitles(titles);
        }
      } catch (error) {
        console.error('Error fetching all training titles:', error);
      }
    };

    fetchTrainings();
    fetchAllTrainingTitles();
  }, [title]);

  const handleTrainingSelect = (selectedTitle) => {
    setIsDropdownOpen(false);
    if (selectedTitle !== title) {
      navigate(`/training-history/${encodeURIComponent(selectedTitle)}`);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).replace(/\//g, '-');
  };

  // Calculate progress indicators
  const calculateProgress = () => {
    if (trainings.length < 2) return null;
    
    // Sort trainings by date (oldest first)
    const sortedTrainings = [...trainings].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    // Calculate values based on sport type
    const isPaceSport = selectedSport === 'run' || selectedSport === 'swim';
    
    // Calculate average power/pace for each training
    const powerData = sortedTrainings.map(t => {
      const validPowers = t.results.filter(r => r.power > 0).map(r => r.power);
      if (validPowers.length === 0) return null;
      
      const avgPower = validPowers.reduce((sum, power) => sum + power, 0) / validPowers.length;
      
      // For pace sports, convert to pace format for display
      if (isPaceSport) {
        return avgPower; // Keep as seconds for calculations
      }
      
      return Math.round(avgPower);
    });
    
    // Calculate average heart rate for each training
    const hrData = sortedTrainings.map(t => {
      const validHRs = t.results.filter(r => r.heartRate > 0).map(r => r.heartRate);
      return validHRs.length > 0 
        ? Math.round(validHRs.reduce((sum, hr) => sum + hr, 0) / validHRs.length) 
        : null;
    });
    
    // Calculate max lactate for each training
    const lactateData = sortedTrainings.map(t => {
      const validLactates = t.results.filter(r => r.lactate > 0).map(r => r.lactate);
      return validLactates.length > 0 
        ? Math.max(...validLactates) 
        : null;
    });
    
    // Calculate progress percentages
    const powerProgress = powerData[powerData.length - 1] && powerData[0] 
      ? ((powerData[powerData.length - 1] - powerData[0]) / powerData[0] * 100).toFixed(1) 
      : null;
    
    const hrProgress = hrData[hrData.length - 1] && hrData[0] 
      ? ((hrData[hrData.length - 1] - hrData[0]) / hrData[0] * 100).toFixed(1) 
      : null;
    
    const lactateProgress = lactateData[lactateData.length - 1] && lactateData[0] 
      ? ((lactateData[lactateData.length - 1] - lactateData[0]) / lactateData[0] * 100).toFixed(1) 
      : null;
    
    return {
      powerProgress,
      hrProgress,
      lactateProgress,
      powerData,
      hrData,
      lactateData,
      dates: sortedTrainings.map(t => formatDate(t.date)),
      isPaceSport
    };
  };

  const progress = calculateProgress();

  // Prepare data for charts
  const chartData = {
    labels: progress ? progress.dates : trainings.map(t => formatDate(t.date)),
    datasets: [
      {
        label: progress?.isPaceSport ? 'Pace (min/km)' : 'Power (W)',
        data: progress ? progress.powerData : trainings.map(t => {
          const validPowers = t.results.filter(r => r.power > 0).map(r => r.power);
          if (validPowers.length === 0) return null;
          
          const avgPower = validPowers.reduce((sum, power) => sum + power, 0) / validPowers.length;
          
          // For pace sports, keep as seconds for calculations
          if (progress?.isPaceSport) {
            return avgPower;
          }
          
          return Math.round(avgPower);
        }),
        borderColor: 'rgb(63, 140, 254)',
        backgroundColor: 'rgb(63, 140, 254)',
        pointStyle: 'circle',
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: 'rgb(63, 140, 254)',
        yAxisID: 'y',
      },
      {
        label: 'Heart Rate (BPM)',
        data: progress ? progress.hrData : trainings.map(t => {
          const validHRs = t.results.filter(r => r.heartRate > 0).map(r => r.heartRate);
          return validHRs.length > 0 
            ? Math.round(validHRs.reduce((sum, hr) => sum + hr, 0) / validHRs.length) 
            : null;
        }),
        borderColor: 'rgb(231, 81, 90)',
        backgroundColor: 'rgb(231, 81, 90)',
        pointStyle: 'circle',
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: 'rgb(231, 81, 90)',
        yAxisID: 'y1',
      },
      {
        label: 'Lactate (mmol/L)',
        data: progress ? progress.lactateData : trainings.map(t => {
          const validLactates = t.results.filter(r => r.lactate > 0).map(r => r.lactate);
          return validLactates.length > 0 
            ? Math.max(...validLactates) 
            : null;
        }),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgb(34, 197, 94)',
        pointStyle: 'circle',
        pointRadius: 5,
        pointHoverRadius: 8,
        pointBackgroundColor: 'rgb(34, 197, 94)',
        yAxisID: 'y2',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          pointRadius: 4,
          font: { size: 12 },
        },
      },
      tooltip: {
        enabled: false,
        external: (context) => {
          if (context.tooltip.opacity === 0) {
            setTooltip(null);
          } else {
            setTooltip({
              ...context.tooltip,
              dataPoints: context.tooltip.dataPoints.map(point => ({
                ...point,
                datasetIndex: point.datasetIndex,
                dataIndex: point.dataIndex,
                label: point.label,
                value: point.raw
              }))
            });
          }
        },
      },
    },
    scales: {
      y: {
        title: { 
          display: true, 
          text: progress?.isPaceSport ? 'Pace (min/km)' : 'Power (W)' 
        },
        min: 0,
        max: progress?.isPaceSport 
          ? Math.max(...(progress ? progress.powerData : trainings.map(t => {
              const validPowers = t.results.filter(r => r.power > 0).map(r => r.power);
              return validPowers.length > 0 
                ? validPowers.reduce((sum, power) => sum + power, 0) / validPowers.length 
                : 0;
            }))) + 60
          : Math.max(...(progress ? progress.powerData : trainings.map(t => {
              const validPowers = t.results.filter(r => r.power > 0).map(r => r.power);
              return validPowers.length > 0 
                ? Math.round(validPowers.reduce((sum, power) => sum + power, 0) / validPowers.length) 
                : 0;
            }))) + 60,
        ticks: { 
          display: true,
          callback: function(value) {
            if (progress?.isPaceSport) {
              return secondsToPace(value);
            }
            return value;
          }
        },
        border: { dash: [6, 6] },
        grid: {
          color: 'rgba(0, 0, 0, 0.15)',
          borderDash: [4, 4],
          drawTicks: true,
        },
      },
      y1: {
        title: { display: true, text: 'Heart Rate (BPM)' },
        min: 100,
        max: 210,
        position: 'right',
        ticks: { display: true },
        grid: {
          drawOnChartArea: true,
          color: 'rgba(0, 0, 0, 0)',
          borderDash: [4, 4],
        },
      },
      y2: {
        title: { display: true, text: 'Lactate (mmol/L)' },
        min: 0,
        max: 8,
        position: 'right',
        offset: 80,
        ticks: { display: true },
        grid: {
          drawOnChartArea: true,
          color: 'rgba(0, 0, 0, 0)',
          borderDash: [4, 4],
        },
      },
      x: {
        title: { display: true, text: 'Date' },
        border: { dash: [6, 6] },
        grid: {
          color: 'rgba(0, 0, 0, 0.15)',
          borderDash: [4, 4],
        },
      },
    },
  };

  // Custom tooltip component
  const CustomTooltip = ({ tooltip, datasets }) => {
    if (!tooltip?.dataPoints) return null;

    const index = tooltip.dataPoints[0]?.dataIndex;
    if (index === undefined) return null;

    const date = tooltip.dataPoints[0]?.label || "N/A";
    const powerValue = datasets[0]?.data?.[index];
    const power = progress?.isPaceSport 
      ? (powerValue ? secondsToPace(powerValue) : "N/A") 
      : (powerValue ?? "N/A");
    const hr = datasets[1]?.data?.[index] ?? "N/A";
    const lactate = datasets[2]?.data?.[index] ?? "N/A";

    return (
      <div
        className="absolute bg-white/95 backdrop-blur-sm shadow-lg p-3 rounded-xl text-sm border border-gray-100"
        style={{
          left: tooltip.caretX,
          top: tooltip.caretY,
          transform: "translate(-50%, -120%)",
          position: "absolute",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 50
        }}
      >
        <div className="font-bold text-gray-900 mb-1">{date}</div>
        <div className="flex items-center gap-2 text-blue-600">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          {progress?.isPaceSport ? 'Pace' : 'Power'}: {power} {progress?.isPaceSport ? 'min/km' : 'W'}
        </div>
        <div className="flex items-center gap-2 text-red-600">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          Heart Rate: {hr} BPM
        </div>
        <div className="flex items-center gap-2 text-green-600">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          Lactate: {lactate} mmol/L
        </div>
        <div
          className="absolute w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-8 border-t-white"
          style={{
            left: "50%",
            bottom: "-8px",
            transform: "translateX(-50%)",
          }}
        ></div>
      </div>
    );
  };

  const handleEditTraining = (training) => {
    setTrainingToEdit(training);
    setShowEditModal(true);
  };

  const handleDeleteTraining = (training) => {
    setTrainingToDelete(training);
    setShowDeleteModal(true);
  };

  const handleAddNewTraining = () => {
    setTrainingToEdit({
      title: decodeURIComponent(title),
      sport: selectedSport,
      date: new Date().toISOString().slice(0, 16),
      specifics: {
        specific: "",
        weather: "",
        customSpecific: "",
        customWeather: ""
      },
      results: []
    });
    setShowAddModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!trainingToDelete || !trainingToDelete._id) {
      setError("Cannot delete training without ID");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await deleteTraining(trainingToDelete._id);
      setShowDeleteModal(false);
      setTrainingToDelete(null);
      addNotification(`Training "${trainingToDelete.title}" was successfully deleted`, 'success');
      
      // Refresh the trainings list
      const data = await getTrainingsByTitle(decodeURIComponent(title));
      if (Array.isArray(data) && data.length > 0) {
        setTrainings(data);
      }
    } catch (error) {
      console.error("Error deleting training:", error);
      setError("Failed to delete training. " + (error.response?.data?.message || error.message));
      addNotification("Failed to delete training", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSubmit = async (updatedTraining) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await updateTraining(updatedTraining._id, updatedTraining);
      
      // Update local state
      const updatedTrainings = trainings.map(training => 
        training._id === updatedTraining._id ? response : training
      );
      setTrainings(updatedTrainings);
      
      setShowEditModal(false);
      setTrainingToEdit(null);
      addNotification("Training updated successfully", 'success');
      
    } catch (error) {
      console.error("Error updating training:", error);
      setError("Failed to update training. " + (error.response?.data?.message || error.message));
      addNotification("Failed to update training", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSubmit = async (newTraining) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Add the new training
      const response = await api.post('/trainings', newTraining);
      
      // Update local state
      setTrainings(prev => [...prev, response.data]);
      
      setShowAddModal(false);
      setTrainingToEdit(null);
      addNotification("Training added successfully", 'success');
      
    } catch (error) {
      console.error("Error adding training:", error);
      setError("Failed to add training. " + (error.response?.data?.message || error.message));
      addNotification("Failed to add training", 'error');
    } finally {
      setIsLoading(false);
    }
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
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
        >
          Back
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
          className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark"
        >
          Back
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
        <div className="flex items-center">
          <h1 className="text-3xl font-bold mr-4">{decodeURIComponent(title)}</h1>
          
          {/* Training Selection Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark flex items-center"
            >
              <span>Change Training</span>
              <svg 
                className={`ml-2 h-5 w-5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isDropdownOpen && (
              <div className="absolute z-10 mt-2 w-64 bg-white rounded-md shadow-lg overflow-hidden">
                <div className="py-1 max-h-60 overflow-y-auto">
                  {allTrainingTitles.map((trainingTitle) => (
                    <button
                      key={trainingTitle}
                      onClick={() => handleTrainingSelect(trainingTitle)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                        trainingTitle === title ? 'bg-primary-light text-primary font-medium' : 'text-gray-700'
                      }`}
                    >
                      {trainingTitle}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Add New Training Button */}
        <button
          onClick={handleAddNewTraining}
          className="px-4 py-2 bg-secondary text-white rounded hover:bg-secondary-dark flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add New Training
        </button>
      </div>

      {/* Progress Summary */}
      {progress && (
        <div className="mb-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Progress Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-blue-700 font-medium">{progress.isPaceSport ? 'Pace' : 'Power'}</h3>
              <div className="flex items-center justify-between mt-2">
                <span className="text-2xl font-bold text-blue-600">
                  {progress.isPaceSport 
                    ? secondsToPace(progress.powerData[progress.powerData.length - 1] || 0) 
                    : (progress.powerData[progress.powerData.length - 1] || '-')} {progress.isPaceSport ? 'min/km' : 'W'}
                </span>
                {progress.powerProgress && (
                  <span className={`text-sm font-medium ${progress.powerProgress > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {progress.powerProgress > 0 ? '+' : ''}{progress.powerProgress}%
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">Latest average {progress.isPaceSport ? 'pace' : 'power'}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <h3 className="text-red-700 font-medium">Heart Rate</h3>
              <div className="flex items-center justify-between mt-2">
                <span className="text-2xl font-bold text-red-600">
                  {progress.hrData[progress.hrData.length - 1] || '-'} BPM
                </span>
                {progress.hrProgress && (
                  <span className={`text-sm font-medium ${progress.hrProgress > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {progress.hrProgress > 0 ? '+' : ''}{progress.hrProgress}%
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">Latest average heart rate</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="text-green-700 font-medium">Lactate</h3>
              <div className="flex items-center justify-between mt-2">
                <span className="text-2xl font-bold text-green-600">
                  {progress.lactateData[progress.lactateData.length - 1]?.toFixed(1) || '-'} mmol/L
                </span>
                {progress.lactateProgress && (
                  <span className={`text-sm font-medium ${progress.lactateProgress > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {progress.lactateProgress > 0 ? '+' : ''}{progress.lactateProgress}%
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">Latest max lactate</p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="mb-8 bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Training History</h2>
        <div className="relative" style={{ width: '100%', height: '400px' }}>
          <Line data={chartData} options={chartOptions} />
          {tooltip && <CustomTooltip tooltip={tooltip} datasets={chartData.datasets} />}
        </div>
      </div>

      {/* Training Details */}
      <div className="grid grid-cols-1 gap-4">
        {trainings.map((training, index) => (
          <motion.div
            key={training._id || index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-lg shadow-lg p-6 relative group"
          >
            <div className="absolute right-4 top-4 transform flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <button 
                onClick={() => handleEditTraining(training)}
                className="p-2 text-primary hover:text-primary-dark hover:bg-blue-100 rounded-full bg-white shadow-sm"
                title="Edit training"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button 
                onClick={() => handleDeleteTraining(training)}
                className="p-2 text-red hover:text-red-dark hover:bg-red-100 rounded-full bg-white shadow-sm"
                title="Delete training"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="font-medium text-lg">{formatDate(training.date)}</p>
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
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {training.sport === 'run' || training.sport === 'swim' ? 'Pace' : 'Power'}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">HR</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">La</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RPE</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {training.results.map((result) => (
                      <tr key={result._id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{result.interval}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                          {formatDuration(result.duration, result.durationType)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                          {training.sport === 'run' || training.sport === 'swim' 
                            ? secondsToPace(result.power) 
                            : result.power || '-'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{result.heartRate || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{result.lactate || '-'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{result.RPE || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && trainingToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Delete Training</h3>
            <p className="mb-6">
              Are you sure you want to delete the training "{trainingToDelete.title}" from {formatDate(trainingToDelete.date)}? 
              This action cannot be undone.
            </p>
            
            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
                {error}
              </div>
            )}
            
            <div className="flex justify-end gap-4">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setTrainingToDelete(null);
                  setError(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-red-300"
                disabled={isLoading}
              >
                {isLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && trainingToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 p-3 bg-red-100 text-red-700 rounded-lg z-50">
            {error}
          </div>
          
          <TrainingForm 
            onClose={() => {
              setShowEditModal(false);
              setTrainingToEdit(null);
              setError(null);
            }}
            onSubmit={handleEditSubmit}
            initialData={trainingToEdit}
            isEditing={true}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Add New Training Modal */}
      {showAddModal && trainingToEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 p-3 bg-red-100 text-red-700 rounded-lg z-50">
            {error}
          </div>
          
          <TrainingForm 
            onClose={() => {
              setShowAddModal(false);
              setTrainingToEdit(null);
              setError(null);
            }}
            onSubmit={handleAddSubmit}
            initialData={trainingToEdit}
            isEditing={false}
            isLoading={isLoading}
          />
        </div>
      )}
    </motion.div>
  );
};

export default TrainingHistory; 