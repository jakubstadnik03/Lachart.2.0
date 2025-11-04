import React, { useState, useRef, useEffect } from 'react';
import { uploadFitFile, getFitTrainings, getFitTraining, updateLactateValues, deleteFitTraining } from '../services/api';
import { motion } from 'framer-motion';
import {
  CloudArrowUpIcon,
  DocumentArrowUpIcon,
  ClockIcon,
  MapPinIcon,
  HeartIcon,
  BoltIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import CalendarView from '../components/Calendar/CalendarView';
import ReactECharts from 'echarts-for-react';
import { getIntegrationStatus } from '../services/api';
import { listExternalActivities, syncStravaActivities } from '../services/api';
import { getStravaActivityDetail } from '../services/api';


const FitAnalysisPage = () => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [trainings, setTrainings] = useState([]);
  const [selectedTraining, setSelectedTraining] = useState(null);
  const [editingLactate, setEditingLactate] = useState(null);
  const [lactateInputs, setLactateInputs] = useState({});
  const [showAllTrainings, setShowAllTrainings] = useState(false);
  const [allTrainingsWithLaps, setAllTrainingsWithLaps] = useState([]);
  const fileInputRef = useRef(null);
  const [hoveredInterval, setHoveredInterval] = useState(null);
  const [hoveredHeartRate, setHoveredHeartRate] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0, barX: 0, barY: 0 });
  const chartContainerRef = useRef(null);
  
  // Training chart hover state
  const [hoveredTrainingRecord, setHoveredTrainingRecord] = useState(null);
  const [trainingTooltipPosition, setTrainingTooltipPosition] = useState({ x: 0, y: 0 });
  const trainingChartRef = useRef(null);
  
  // Zoom state for training chart
  const [trainingZoom, setTrainingZoom] = useState({ min: 0, max: 1, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, time: 0 });
  const [dragEnd, setDragEnd] = useState({ x: 0, time: 0 });
  const [stravaConnected, setStravaConnected] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [externalActivities, setExternalActivities] = useState([]);
  const [selectedStrava, setSelectedStrava] = useState(null);
  const [selectedStravaStreams, setSelectedStravaStreams] = useState(null);
  const [stravaSeries, setStravaSeries] = useState({ speed: true, hr: true, power: true, altitude: true });
  const stravaChartRef = useRef(null);

  useEffect(() => {
    loadTrainings();
  }, []);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await getIntegrationStatus();
        setStravaConnected(Boolean(status.stravaConnected));
        setGarminConnected(Boolean(status.garminConnected));
      } catch (e) {
        // ignore if not logged
      }
    };
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'connected') {
      checkStatus();
      loadExternalActivities();
      const url = window.location.pathname;
      window.history.replaceState({}, '', url);
    } else {
      checkStatus();
      loadExternalActivities();
    }
  }, []);

  const loadExternalActivities = async () => {
    try {
      const acts = await listExternalActivities();
      setExternalActivities(acts || []);
    } catch (e) {
      // ignore
    }
  };

  const loadStravaDetail = async (id) => {
    try {
      const data = await getStravaActivityDetail(id);
      setSelectedStrava(data.detail);
      setSelectedStravaStreams(data.streams);
      setSelectedTraining(null);
    } catch (e) {}
  };

  // Training chart zoom and drag handlers - must be at top level (not conditionally rendered)
  useEffect(() => {
    const container = trainingChartRef.current;
    if (!container || !selectedTraining || !selectedTraining.records || selectedTraining.records.length === 0) return;

    const chartData = prepareTrainingChartData(selectedTraining);
    if (!chartData) return;

    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const graphWidth = 800 - padding.left - padding.right;

    // Convert screen X to time value
    const screenXToTime = (screenX) => {
      const containerRect = container.getBoundingClientRect();
      const relativeX = screenX - containerRect.left - padding.left;
      const normalizedX = Math.max(0, Math.min(1, relativeX / graphWidth));
      const zoomedMinTime = chartData.maxTime * trainingZoom.min;
      const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
      const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
      const time = zoomedMinTime + (normalizedX * zoomedTimeRange);
      return Math.max(0, Math.min(chartData.maxTime, time));
    };

    let dragState = { isActive: false, start: { x: 0, time: 0 }, end: { x: 0, time: 0 } };

    const wheelHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const delta = e.deltaY > 0 ? 1.1 : 0.9;
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - padding.left;
      const mouseRatio = Math.max(0, Math.min(1, mouseX / graphWidth));
      
      setTrainingZoom(prev => {
        const currentRange = prev.max - prev.min;
        const newRange = Math.max(0.05, Math.min(1, currentRange * delta));
        
        if (newRange !== currentRange) {
          const centerTimeRatio = prev.min + currentRange * mouseRatio;
          const newMin = Math.max(0, centerTimeRatio - newRange * mouseRatio);
          const newMax = Math.min(1, newMin + newRange);
          
          return {
            min: newMin,
            max: newMax,
            scale: 1 / newRange
          };
        }
        return prev;
      });
    };
    
    const mouseDownHandler = (e) => {
      if (e.button !== 0) return;
      if (!container.contains(e.target)) return;
      
      const startTime = screenXToTime(e.clientX);
      const containerRect = container.getBoundingClientRect();
      dragState.isActive = true;
      dragState.start = { x: e.clientX - containerRect.left, time: startTime };
      dragState.end = { x: e.clientX - containerRect.left, time: startTime };
      setIsDragging(true);
      setDragStart({ x: dragState.start.x, time: startTime });
      setDragEnd({ x: dragState.end.x, time: startTime });
      e.preventDefault();
      e.stopPropagation();
    };
    
    const mouseLeaveHandler = () => {
      if (dragState.isActive) {
        dragState.isActive = false;
        dragState.start = { x: 0, time: 0 };
        dragState.end = { x: 0, time: 0 };
        setIsDragging(false);
        setDragStart({ x: 0, time: 0 });
        setDragEnd({ x: 0, time: 0 });
      }
    };
    
    const mouseMoveGlobalHandler = (e) => {
      if (!dragState.isActive) return;
      
      const endTime = screenXToTime(e.clientX);
      const containerRect = container.getBoundingClientRect();
      const endX = e.clientX - containerRect.left;
      dragState.end = { x: endX, time: endTime };
      setDragEnd({ x: endX, time: endTime });
    };
    
    const mouseUpGlobalHandler = (e) => {
      if (!dragState.isActive) return;
      
      const startTime = Math.min(dragState.start.time, dragState.end.time);
      const endTime = Math.max(dragState.start.time, dragState.end.time);
      
      if (Math.abs(endTime - startTime) > chartData.maxTime * 0.01) {
        const newMin = startTime / chartData.maxTime;
        const newMax = endTime / chartData.maxTime;
        const newScale = 1 / (newMax - newMin);
        
        setTrainingZoom({
          min: newMin,
          max: newMax,
          scale: newScale
        });
      }
      
      dragState.isActive = false;
      dragState.start = { x: 0, time: 0 };
      dragState.end = { x: 0, time: 0 };
      setIsDragging(false);
      setDragStart({ x: 0, time: 0 });
      setDragEnd({ x: 0, time: 0 });
    };
    
    container.addEventListener('wheel', wheelHandler, { passive: false });
    container.addEventListener('mousedown', mouseDownHandler);
    container.addEventListener('mouseleave', mouseLeaveHandler);
    document.addEventListener('mousemove', mouseMoveGlobalHandler);
    document.addEventListener('mouseup', mouseUpGlobalHandler);
    
    return () => {
      container.removeEventListener('wheel', wheelHandler);
      container.removeEventListener('mousedown', mouseDownHandler);
      container.removeEventListener('mouseleave', mouseLeaveHandler);
      document.removeEventListener('mousemove', mouseMoveGlobalHandler);
      document.removeEventListener('mouseup', mouseUpGlobalHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTraining?._id, trainingZoom, isDragging]);

  const loadTrainings = async () => {
    try {
      const data = await getFitTrainings();
      setTrainings(data);
    } catch (error) {
      console.error('Error loading trainings:', error);
    }
  };


  const loadTrainingDetail = async (id) => {
    try {
      const data = await getFitTraining(id);
      setSelectedTraining(data);
    } catch (error) {
      console.error('Error loading training detail:', error);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    try {
      setUploading(true);
      for (const file of files) {
        await uploadFitFile(file);
      }
      await loadTrainings();
      setFiles([]);
      fileInputRef.current.value = '';
      alert('Trainings uploaded successfully!');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error uploading file: ' + (error.response?.data?.message || error.message));
    } finally {
      setUploading(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDistance = (meters) => {
    if (!meters) return '0 m';
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${Math.round(meters)} m`;
  };

  const formatSpeed = (mps) => {
    if (!mps) return '-';
    const kmh = mps * 3.6;
    return `${kmh.toFixed(1)} km/h`;
  };

  const formatPace = (mps) => {
    if (!mps || mps === 0) return '-';
    const secondsPerKm = 1000 / mps;
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = Math.floor(secondsPerKm % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
  };

  const prepareAllIntervalsChartData = () => {
    const allLaps = [];
    
    if (showAllTrainings && allTrainingsWithLaps.length > 0) {
      // Use all trainings with laps
      allTrainingsWithLaps.forEach(training => {
        if (training.laps && training.laps.length > 0) {
          training.laps.forEach((lap, index) => {
            allLaps.push({
              ...lap,
              trainingTimestamp: training.timestamp,
              trainingId: training._id,
              intervalNumber: allLaps.length + 1,
              startTime: lap.startTime || training.timestamp
            });
          });
        }
      });
    } else if (selectedTraining && selectedTraining.laps) {
      // Use only selected training
      selectedTraining.laps.forEach((lap, index) => {
        allLaps.push({
          ...lap,
          trainingTimestamp: selectedTraining.timestamp,
          trainingId: selectedTraining._id,
          intervalNumber: index + 1,
          startTime: lap.startTime || selectedTraining.timestamp
        });
      });
    }

    if (allLaps.length === 0) return null;

    // Sort by start time
    allLaps.sort((a, b) => {
      const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
      const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
      return timeA - timeB;
    });

    // Calculate cumulative time positions for X axis
    let cumulativeTime = 0;
    const xPositions = allLaps.map((lap, index) => {
      const duration = lap.totalElapsedTime || lap.totalTimerTime || 1;
      const startTime = cumulativeTime;
      const endTime = cumulativeTime + duration;
      cumulativeTime = endTime;
      return {
        start: startTime,
        end: endTime,
        duration: duration,
        label: formatDuration(duration)
      };
    });

    // X axis labels - cumulative time from start (in seconds for linear scale)
    const labels = xPositions.map((pos, index) => {
      // Return the start time in seconds for linear scale
      return pos.start;
    });

    // Bar data: Power (watts) for bar height
    // Try multiple power fields: avgPower, maxPower, normalizedPower
    const powerData = allLaps.map(lap => {
      const power = lap.avgPower || lap.maxPower || lap.normalizedPower || null;
      // Ensure power is a valid number
      return (power !== null && power !== undefined && !isNaN(power) && power > 0) ? power : null;
    });

    // Heart rate data (for line chart)
    const heartRateData = allLaps.map(lap => lap.avgHeartRate || lap.maxHeartRate || null);

    // Interval durations for variable bar width
    const intervalDurations = allLaps.map(lap => lap.totalElapsedTime || lap.totalTimerTime || 0);

    // Bar widths based on interval duration (in seconds) - same as height data
    const barDurations = allLaps.map(lap => lap.totalElapsedTime || lap.totalTimerTime || 1);
    
    // Calculate bar positions (start and end times for X axis)
    const barPositions = xPositions.map(pos => ({
      start: pos.start,
      end: pos.end,
      center: (pos.start + pos.end) / 2
    }));

    return {
      labels,
      powerData,
      intervalDurations,
      heartRateData,
      barDurations,
      barPositions,
      xPositions,
      totalIntervals: allLaps.length
    };
  };

  const handleSaveLactate = async () => {
    if (!selectedTraining) return;

    const lactateValues = Object.entries(lactateInputs).map(([key, value]) => {
      const [type, index] = key.split('-');
      return {
        type,
        index: parseInt(index),
        lactate: parseFloat(value)
      };
    }).filter(lv => lv.lactate && !isNaN(lv.lactate));

    try {
      await updateLactateValues(selectedTraining._id, lactateValues);
      await loadTrainingDetail(selectedTraining._id);
      setEditingLactate(null);
      setLactateInputs({});
      alert('Lactate values saved successfully!');
    } catch (error) {
      console.error('Error saving lactate:', error);
      alert('Error saving lactate values');
    }
  };

  const handleDeleteTraining = async (trainingId) => {
    if (!window.confirm('Are you sure you want to delete this training? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteFitTraining(trainingId);
      await loadTrainings();
      if (selectedTraining?._id === trainingId) {
        setSelectedTraining(null);
      }
      alert('Training deleted successfully');
    } catch (error) {
      console.error('Error deleting training:', error);
      alert('Error deleting training');
    }
  };

  const predictLactate = (training) => {
    if (!training || !training.records || training.records.length === 0) return null;

    // Find intervals with lactate values
    const intervalsWithLactate = training.laps.filter(lap => lap.lactate != null);
    
    if (intervalsWithLactate.length === 0) return null;

    // Simple prediction based on power/heart rate
    const predictions = training.laps.map((lap, index) => {
      if (lap.lactate != null) {
        return { index, lactate: lap.lactate, predicted: false };
      }

      // Find nearest interval with lactate
      const nearestLactate = intervalsWithLactate.reduce((nearest, current) => {
        const currentDist = Math.abs((current.avgPower || 0) - (lap.avgPower || 0)) + 
                           Math.abs((current.avgHeartRate || 0) - (lap.avgHeartRate || 0));
        const nearestDist = Math.abs((nearest.avgPower || 0) - (lap.avgPower || 0)) + 
                           Math.abs((nearest.avgHeartRate || 0) - (lap.avgHeartRate || 0));
        return currentDist < nearestDist ? current : nearest;
      });

      // Predict based on power/heart rate
      let predictedLactate = nearestLactate.lactate;
      
      if (lap.avgPower && nearestLactate.avgPower) {
        const powerDiff = (lap.avgPower - nearestLactate.avgPower) / nearestLactate.avgPower;
        predictedLactate = nearestLactate.lactate * (1 + powerDiff * 0.5);
      } else if (lap.avgHeartRate && nearestLactate.avgHeartRate) {
        const hrDiff = (lap.avgHeartRate - nearestLactate.avgHeartRate) / nearestLactate.avgHeartRate;
        predictedLactate = nearestLactate.lactate * (1 + hrDiff * 0.3);
      }

      return {
        index,
        lactate: Math.max(0.5, Math.min(15, predictedLactate)),
        predicted: true
      };
    });

    return predictions;
  };

  // Prepare data for SVG training chart (full training time)
  const prepareTrainingChartData = (training) => {
    if (!training || !training.records || training.records.length === 0) return null;

    // Use ALL records, not limited
    const records = training.records;
    
    // Calculate time from start in seconds
    const startTime = records[0]?.timestamp ? new Date(records[0].timestamp).getTime() : 0;
    const recordsWithTime = records.map((r, i) => {
      const recordTime = r.timestamp ? new Date(r.timestamp).getTime() : startTime + (i * 1000);
      const timeFromStart = (recordTime - startTime) / 1000; // Convert to seconds
      return {
        ...r,
        timeFromStart,
        speed: r.speed ? r.speed * 3.6 : null, // Convert to km/h
        heartRate: r.heartRate || null,
        power: r.power || null
      };
    });

    // Find max values for scaling
    const maxTime = recordsWithTime[recordsWithTime.length - 1]?.timeFromStart || 0;
    const maxSpeed = Math.max(...recordsWithTime.map(r => r.speed || 0).filter(v => v > 0));
    const maxHeartRate = Math.max(...recordsWithTime.map(r => r.heartRate || 0).filter(v => v > 0));
    const maxPower = Math.max(...recordsWithTime.map(r => r.power || 0).filter(v => v > 0));

    return {
      records: recordsWithTime,
      maxTime,
      maxSpeed,
      maxHeartRate,
      maxPower
    };
  };


  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">FIT Training Analysis</h1>

        {/* Integrations Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-md p-6 mb-6"
        >
          <h2 className="text-xl font-semibold mb-4">Connect & Sync</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                try {
                  const { getStravaAuthUrl } = require('../services/api');
                  const url = await getStravaAuthUrl();
                  window.location.href = url;
                } catch (e) {
                  console.error(e);
                }
              }}
              disabled={stravaConnected}
              className={`px-3 py-2 rounded-md text-sm ${stravaConnected ? 'bg-green-100 text-green-800 cursor-default' : 'bg-orange-600 text-white hover:bg-orange-700'}`}
            >
              {stravaConnected ? 'Strava Connected' : 'Connect Strava'}
            </button>
            <button
              onClick={async () => {
                try {
                  const { startGarminAuth } = require('../services/api');
                  const url = await startGarminAuth();
                  window.location.href = url;
                } catch (e) {
                  console.error(e);
                }
              }}
              className="px-3 py-2 rounded-md bg-gray-700 text-white hover:bg-gray-800 text-sm"
            >
              Connect Garmin
            </button>
            <button
              onClick={async () => {
                try { 
                  const res = await syncStravaActivities(); 
                  await loadExternalActivities();
                  alert(`Strava sync: imported ${res.imported}, updated ${res.updated}`); 
                } catch(e){ console.error(e); alert('Strava sync failed'); }
              }}
              className="px-3 py-2 rounded-md bg-orange-100 text-orange-800 hover:bg-orange-200 text-sm"
            >
              Sync Strava
            </button>
            <button
              onClick={async () => {
                const { syncGarminActivities } = require('../services/api');
                try { await syncGarminActivities(); alert('Garmin sync requested'); } catch(e){ console.error(e); alert('Garmin sync failed'); }
              }}
              className="px-3 py-2 rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm"
            >
              Sync Garmin
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm flex items-center gap-2"
            >
              <CloudArrowUpIcon className="w-4 h-4" />
              Upload FIT File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".fit"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            {files.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{files.length} file(s) selected</span>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <DocumentArrowUpIcon className="w-4 h-4" />
                      Upload
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Calendar Section */}
        <CalendarView
          activities={[
            ...trainings.map(t => ({ id: t._id, date: t.timestamp, title: t.originalFileName, sport: t.sport })),
            ...externalActivities.map(a => ({ id: `strava-${a.stravaId}`, date: a.startDate, title: a.name, sport: a.sport }))
          ]}
          onSelectActivity={(a) => { 
            if (a?.id && String(a.id).startsWith('strava-')) {
              const sid = String(a.id).replace('strava-','');
              loadStravaDetail(sid);
            } else if (a?.id) {
              loadTrainingDetail(a.id);
            }
          }}
        />

        {/* Training Detail and Charts - Full Width */}
        {selectedTraining ? (
          <div className="w-full mt-6">
            {selectedTraining ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-lg shadow-md p-6 space-y-6"
                >
                  {/* Header Stats */}
                  {selectedTraining && (
                    <>
                      <div className="flex justify-between items-start mb-4">
                        <h2 className="text-2xl font-bold text-gray-900">Training Details</h2>
                        <button
                          onClick={() => handleDeleteTraining(selectedTraining._id)}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                        >
                          <TrashIcon className="w-4 h-4" />
                          Delete Training
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <ClockIcon className="w-4 h-4" />
                        Duration
                      </div>
                      <div className="text-xl font-bold mt-1">
                        {formatDuration(selectedTraining.totalElapsedTime)}
                      </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <MapPinIcon className="w-4 h-4" />
                        Distance
                      </div>
                      <div className="text-xl font-bold mt-1">
                        {formatDistance(selectedTraining.totalDistance)}
                      </div>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <HeartIcon className="w-4 h-4" />
                        Avg Heart Rate
                      </div>
                      <div className="text-xl font-bold mt-1">
                        {selectedTraining.avgHeartRate ? `${Math.round(selectedTraining.avgHeartRate)} bpm` : '-'}
                      </div>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <BoltIcon className="w-4 h-4" />
                        Avg Power
                      </div>
                      <div className="text-xl font-bold mt-1">
                        {selectedTraining.avgPower ? `${Math.round(selectedTraining.avgPower)} W` : '-'}
                      </div>
                    </div>
                  </div>
                    </>
                  )}

                  {showAllTrainings && !selectedTraining && (
                    <div className="mb-4">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        All Intervals from Filtered Trainings
                      </h2>
                      <p className="text-sm text-gray-600">
                        Showing {allTrainingsWithLaps.length} training(s) with {allTrainingsWithLaps.reduce((sum, t) => sum + (t.laps?.length || 0), 0)} total intervals
                      </p>
                    </div>
                  )}

                  {/* Training Chart - Full Time SVG Version */}
                  {selectedTraining && selectedTraining.records && selectedTraining.records.length > 0 && (() => {
                    const chartData = prepareTrainingChartData(selectedTraining);
                    if (!chartData) return null;

                    const chartHeight = 300;
                    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
                    const svgWidth = 800;
                    const svgHeight = chartHeight;
                    const graphWidth = svgWidth - padding.left - padding.right;
                    const graphHeight = svgHeight - padding.top - padding.bottom;

                    // Scale functions
                    const speedYScale = (speed) => padding.top + graphHeight - ((speed / chartData.maxSpeed) * graphHeight);
                    const hrYScale = (hr) => padding.top + graphHeight - ((hr / chartData.maxHeartRate) * graphHeight);
                    const powerYScale = (power) => padding.top + graphHeight - ((power / chartData.maxPower) * graphHeight);

                    // Sample data for performance (show every Nth point for long trainings)
                    const sampleRate = chartData.records.length > 5000 ? 10 : chartData.records.length > 2000 ? 5 : 1;
                    const sampledRecords = chartData.records.filter((_, i) => i % sampleRate === 0 || i === chartData.records.length - 1);

                    // Zoom calculations
                    const zoomedMinTime = chartData.maxTime * trainingZoom.min;
                    const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
                    const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
                    const zoomedXScale = (time) => {
                      if (time < zoomedMinTime || time > zoomedMaxTime) return null;
                      const normalizedTime = (time - zoomedMinTime) / zoomedTimeRange;
                      return padding.left + normalizedTime * graphWidth;
                    };

                    const handleTrainingChartHover = (record, event) => {
                      if (isDragging) return; // Don't show tooltip while dragging
                      
                      setHoveredTrainingRecord(record);
                      
                      const container = trainingChartRef.current;
                      if (!container) return;
                      
                      // Calculate X position based on record time
                      const x = zoomedXScale(record.timeFromStart);
                      if (x === null) return;
                      
                      // Calculate Y position - average of all visible metrics at this point
                      let avgY = 0;
                      let count = 0;
                      
                      if (record.speed) {
                        avgY += speedYScale(record.speed);
                        count++;
                      }
                      if (record.heartRate) {
                        avgY += hrYScale(record.heartRate);
                        count++;
                      }
                      if (record.power) {
                        avgY += powerYScale(record.power);
                        count++;
                      }
                      
                      const tooltipY = count > 0 ? avgY / count : padding.top + graphHeight / 2;
                      
                      // Get SVG element to calculate scale
                      const svgElement = container.querySelector('svg');
                      if (!svgElement) return;
                      const svgRect = svgElement.getBoundingClientRect();
                      const scaleX = svgRect.width / svgWidth;
                      const scaleY = svgRect.height / svgHeight;
                      
                      // Calculate position relative to container
                      const svgX = x * scaleX;
                      const svgY = tooltipY * scaleY;
                      
                      setTrainingTooltipPosition({
                        x: svgX,
                        y: svgY - 10 // Offset above the point
                      });
                    };

                    const handleTrainingChartLeave = () => {
                      if (!isDragging) {
                        setHoveredTrainingRecord(null);
                      }
                    };

                    const handleResetZoom = () => {
                      setTrainingZoom({ min: 0, max: 1, scale: 1 });
                      setIsDragging(false);
                      setDragStart({ x: 0, time: 0 });
                      setDragEnd({ x: 0, time: 0 });
                    };

                    return (
                      <div className="mb-6">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold">Training Overview</h3>
                          <div className="flex gap-2">
                            <button
                              onClick={handleResetZoom}
                              className="px-3 py-1 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
                            >
                              Reset Zoom
                            </button>
                          </div>
                        </div>
                        <div 
                          ref={trainingChartRef}
                          className="relative border rounded-lg bg-white p-4 select-none" 
                          style={{ height: `${chartHeight}px`, cursor: isDragging ? 'crosshair' : 'default' }}
                        >
                          {/* Drag selection rectangle */}
                          {isDragging && dragStart.x !== dragEnd.x && (
                            <div
                              className="absolute border-2 border-purple-500 bg-purple-200 bg-opacity-20 pointer-events-none z-40"
                              style={{
                                left: `${Math.min(dragStart.x, dragEnd.x) + padding.left}px`,
                                top: `${padding.top}px`,
                                width: `${Math.abs(dragEnd.x - dragStart.x)}px`,
                                height: `${graphHeight}px`
                              }}
                            />
                          )}
                          
                          <svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="overflow-visible" style={{ cursor: isDragging ? 'crosshair' : 'default' }}>
                            {/* Grid lines - based on zoom */}
                            {(() => {
                              const numGridLines = 5;
                              const gridValues = [];
                              for (let i = 0; i <= numGridLines; i++) {
                                const ratio = i / numGridLines;
                                const time = zoomedMinTime + (zoomedTimeRange * ratio);
                                gridValues.push({ time, x: zoomedXScale(time) });
                              }
                              return gridValues.map(({ time, x }, i) => {
                                if (x === null) return null;
                                return (
                                  <line
                                    key={`grid-x-${i}`}
                                    x1={x}
                                    y1={padding.top}
                                    x2={x}
                                    y2={padding.top + graphHeight}
                                    stroke="rgba(240, 240, 250, 0.8)"
                                    strokeWidth="1"
                                    strokeDasharray="2,2"
                                  />
                                );
                              });
                            })()}

                            {/* Speed line - lighter blue */}
                            {sampledRecords.map((record, index) => {
                              if (index === 0 || !record.speed) return null;
                              const prevRecord = sampledRecords[index - 1];
                              if (!prevRecord.speed) return null;
                              
                              // Check if within zoom range
                              if (record.timeFromStart < zoomedMinTime || record.timeFromStart > zoomedMaxTime) return null;
                              if (prevRecord.timeFromStart < zoomedMinTime || prevRecord.timeFromStart > zoomedMaxTime) return null;
                              
                              const x1 = zoomedXScale(prevRecord.timeFromStart);
                              const x2 = zoomedXScale(record.timeFromStart);
                              
                              if (x1 === null || x2 === null) return null;
                              
                              return (
                                <line
                                  key={`speed-${index}`}
                                  x1={x1}
                                  y1={speedYScale(prevRecord.speed)}
                                  x2={x2}
                                  y2={speedYScale(record.speed)}
                                  stroke="rgba(120, 180, 255, 0.7)"
                                  strokeWidth="1.5"
                                  onMouseEnter={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseMove={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseLeave={handleTrainingChartLeave}
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'auto' }}
                                />
                              );
                            })}

                            {/* Heart Rate line - lighter red */}
                            {sampledRecords.map((record, index) => {
                              if (index === 0 || !record.heartRate) return null;
                              const prevRecord = sampledRecords[index - 1];
                              if (!prevRecord.heartRate) return null;
                              
                              if (record.timeFromStart < zoomedMinTime || record.timeFromStart > zoomedMaxTime) return null;
                              if (prevRecord.timeFromStart < zoomedMinTime || prevRecord.timeFromStart > zoomedMaxTime) return null;
                              
                              const x1 = zoomedXScale(prevRecord.timeFromStart);
                              const x2 = zoomedXScale(record.timeFromStart);
                              
                              if (x1 === null || x2 === null) return null;
                              
                              return (
                                <line
                                  key={`hr-${index}`}
                                  x1={x1}
                                  y1={hrYScale(prevRecord.heartRate)}
                                  x2={x2}
                                  y2={hrYScale(record.heartRate)}
                                  stroke="rgba(255, 120, 140, 0.7)"
                                  strokeWidth="1.5"
                                  onMouseEnter={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseMove={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseLeave={handleTrainingChartLeave}
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'auto' }}
                                />
                              );
                            })}

                            {/* Power line - lighter orange/purple */}
                            {sampledRecords.map((record, index) => {
                              if (index === 0 || !record.power) return null;
                              const prevRecord = sampledRecords[index - 1];
                              if (!prevRecord.power) return null;
                              
                              if (record.timeFromStart < zoomedMinTime || record.timeFromStart > zoomedMaxTime) return null;
                              if (prevRecord.timeFromStart < zoomedMinTime || prevRecord.timeFromStart > zoomedMaxTime) return null;
                              
                              const x1 = zoomedXScale(prevRecord.timeFromStart);
                              const x2 = zoomedXScale(record.timeFromStart);
                              
                              if (x1 === null || x2 === null) return null;
                              
                              return (
                                <line
                                  key={`power-${index}`}
                                  x1={x1}
                                  y1={powerYScale(prevRecord.power)}
                                  x2={x2}
                                  y2={powerYScale(record.power)}
                                  stroke="rgba(200, 140, 220, 0.7)"
                                  strokeWidth="1.5"
                                  onMouseEnter={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseMove={(e) => !isDragging && handleTrainingChartHover(record, e)}
                                  onMouseLeave={handleTrainingChartLeave}
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'auto' }}
                                />
                              );
                            })}

                            {/* Axis lines */}
                            <line
                              x1={padding.left}
                              y1={padding.top}
                              x2={padding.left}
                              y2={padding.top + graphHeight}
                              stroke="rgba(180, 160, 220, 0.6)"
                              strokeWidth="2"
                            />
                            <line
                              x1={padding.left}
                              y1={padding.top + graphHeight}
                              x2={padding.left + graphWidth}
                              y2={padding.top + graphHeight}
                              stroke="rgba(180, 160, 220, 0.6)"
                              strokeWidth="2"
                            />

                            {/* X-axis labels (Time) - based on zoom */}
                            {(() => {
                              const numLabels = 5;
                              const labels = [];
                              for (let i = 0; i <= numLabels; i++) {
                                const ratio = i / numLabels;
                                const time = zoomedMinTime + (zoomedTimeRange * ratio);
                                labels.push({ time, x: zoomedXScale(time) });
                              }
                              return labels.map(({ time, x }, i) => {
                                if (x === null) return null;
                                const totalSeconds = Math.floor(time);
                                const hours = Math.floor(totalSeconds / 3600);
                                const minutes = Math.floor((totalSeconds % 3600) / 60);
                                const seconds = totalSeconds % 60;
                                const timeStr = hours > 0 
                                  ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                                  : `${minutes}:${seconds.toString().padStart(2, '0')}`;
                                
                                return (
                                  <g key={`x-label-${i}`}>
                                    <line
                                      x1={x}
                                      y1={padding.top + graphHeight}
                                      x2={x}
                                      y2={padding.top + graphHeight + 5}
                                      stroke="rgba(200, 180, 220, 0.6)"
                                      strokeWidth="1"
                                    />
                                    <text
                                      x={x}
                                      y={padding.top + graphHeight + 20}
                                      textAnchor="middle"
                                      fontSize="11"
                                      fill="rgba(120, 90, 160, 0.8)"
                                      fontWeight="500"
                                    >
                                      {timeStr}
                                    </text>
                                  </g>
                                );
                              });
                            })()}


                            {/* Axis labels */}
                            <text
                              x={padding.left + graphWidth / 2}
                              y={svgHeight - 5}
                              textAnchor="middle"
                              fontSize="13"
                              fill="rgba(120, 90, 160, 0.9)"
                              fontWeight="600"
                            >
                              Time
                            </text>
                          </svg>
                          
                          {/* Training Chart Tooltip */}
                          {hoveredTrainingRecord && trainingTooltipPosition.x > 0 && trainingTooltipPosition.y > 0 && (
                            <div
                              className="absolute pointer-events-none z-50"
                              style={{
                                left: `${trainingTooltipPosition.x}px`,
                                top: `${trainingTooltipPosition.y}px`,
                                transform: 'translate(-50%, -100%)',
                                marginTop: '-10px',
                                minWidth: '200px',
                                maxWidth: '250px'
                              }}
                            >
                              <div
                                style={{
                                  background: 'rgba(255, 255, 255, 0.85)',
                                  backdropFilter: 'blur(10px) saturate(180%)',
                                  WebkitBackdropFilter: 'blur(10px) saturate(180%)',
                                  borderRadius: '12px',
                                  padding: '12px 16px',
                                  boxShadow: '0 8px 32px rgba(139, 69, 190, 0.2), 0 0 1px rgba(139, 69, 190, 0.3) inset',
                                  border: '1px solid rgba(255, 255, 255, 0.3)'
                                }}
                              >
                                <div className="font-bold mb-2 text-purple-800">Training Data</div>
                                <div className="text-sm space-y-1 text-gray-700">
                                  {hoveredTrainingRecord.speed && (
                                    <div className="font-medium">Speed: <span className="text-blue-600">{hoveredTrainingRecord.speed.toFixed(1)} km/h</span></div>
                                  )}
                                  {hoveredTrainingRecord.heartRate && (
                                    <div className="font-medium">Heart Rate: <span className="text-red-500">{Math.round(hoveredTrainingRecord.heartRate)} bpm</span></div>
                                  )}
                                  {hoveredTrainingRecord.power && (
                                    <div className="font-medium">Power: <span className="text-purple-600">{Math.round(hoveredTrainingRecord.power)} W</span></div>
                                  )}
                                  <div className="font-medium">Time: <span className="text-purple-600">{formatDuration(hoveredTrainingRecord.timeFromStart)}</span></div>
                                </div>
                              </div>
                              {/* Arrow */}
                              <div
                                style={{
                                  position: 'absolute',
                                  left: '50%',
                                  top: '100%',
                                  transform: 'translateX(-50%)',
                                  width: 0,
                                  height: 0,
                                  borderLeft: '8px solid transparent',
                                  borderRight: '8px solid transparent',
                                  borderTop: '8px solid rgba(255, 255, 255, 0.85)',
                                  filter: 'drop-shadow(0 2px 4px rgba(139, 69, 190, 0.2))'
                                }}
                              />
                            </div>
                          )}
                          
                          {/* Zoom indicator */}
                          {trainingZoom.scale > 1 && (
                            <div className="absolute top-2 right-2 text-xs text-gray-600 bg-white bg-opacity-80 px-2 py-1 rounded">
                              Zoom: {trainingZoom.scale.toFixed(1)}x
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* All Intervals Chart - Power (Bar) + Heart Rate (Line) - Simplified Version */}
                  {(() => {
                    const intervalData = prepareAllIntervalsChartData();
                    if (!intervalData || intervalData.totalIntervals === 0) return null;

                    // Filter intervals with valid power data
                    const validIntervals = intervalData.powerData.map((power, index) => ({
                      index,
                      power,
                      duration: intervalData.intervalDurations[index] || 0,
                      start: intervalData.barPositions[index]?.start || 0,
                      end: intervalData.barPositions[index]?.end || 0,
                      heartRate: intervalData.heartRateData[index] || null
                    })).filter(item => item.power !== null && item.power !== undefined && item.power > 0);

                    if (validIntervals.length === 0) {
                      return (
                        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                          <p className="text-yellow-800">No power data available for intervals. Power data may not be present in this FIT file.</p>
                        </div>
                      );
                    }

                    // Calculate max time for X axis
                    const maxTime = validIntervals.length > 0 
                      ? validIntervals[validIntervals.length - 1].end 
                      : 0;

                    // Create SVG-based chart instead of Chart.js
                    const maxPower = Math.max(...validIntervals.map(i => i.power));
                    const minPower = Math.min(...validIntervals.map(i => i.power));
                    const chartHeight = 300;
                    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
                    const svgWidth = 800; // Base width for calculations
                    const svgHeight = chartHeight;

                    const handleBarHover = (interval, index, event) => {
                      try {
                        setHoveredInterval(interval);
                        setHoveredHeartRate(null); // Clear HR hover when hovering bar
                        
                        // Get the rect element's bounding box
                        const rect = event.currentTarget.getBoundingClientRect();
                        
                        // Find the chart container - use multiple fallbacks
                        let container = chartContainerRef.current;
                        if (!container) {
                          // Try to find by navigating up from the SVG element
                          const svgElement = event.currentTarget.ownerSVGElement;
                          if (svgElement) {
                            container = svgElement.closest('[id="chart-container"]') || 
                                       svgElement.closest('.relative.border') ||
                                       svgElement.parentElement;
                          }
                          
                          if (!container) {
                            container = document.getElementById('chart-container');
                          }
                        }
                        
                        if (!container) {
                          console.warn('Container not found, using fallback');
                          // Fallback: use mouse position
                          const containerEl = event.currentTarget.closest('.relative.border') || 
                                            event.currentTarget.closest('.relative');
                          if (containerEl) {
                            const containerRect = containerEl.getBoundingClientRect();
                            setTooltipPosition({
                              x: (rect.left + rect.width / 2) - containerRect.left,
                              y: rect.top - containerRect.top - 10,
                              barX: rect.left + rect.width / 2,
                              barY: rect.top
                            });
                          }
                          return;
                        }
                        
                        const containerRect = container.getBoundingClientRect();
                        
                        // Calculate tooltip position - center of the bar horizontally, above the bar vertically
                        const barCenterX = rect.left + rect.width / 2;
                        const barTopY = rect.top;
                        
                        // Convert to container-relative coordinates
                        const tooltipX = barCenterX - containerRect.left;
                        const tooltipY = barTopY - containerRect.top;
                        
                        setTooltipPosition({ 
                          x: tooltipX,
                          y: tooltipY,
                          barX: barCenterX,
                          barY: barTopY
                        });
                      } catch (error) {
                        console.error('Error in handleBarHover:', error);
                      }
                    };

                    const handleBarLeave = () => {
                      setHoveredInterval(null);
                    };

                    const handleHeartRateHover = (interval, index, event) => {
                      setHoveredHeartRate(interval);
                      setHoveredInterval(null); // Clear bar hover when hovering HR line
                      
                      // Get mouse position
                      const container = chartContainerRef.current;
                      if (!container) {
                        const containerEl = document.getElementById('chart-container') || 
                                           event.currentTarget.closest('.relative.border');
                        if (!containerEl) return;
                        const containerRect = containerEl.getBoundingClientRect();
                        setTooltipPosition({
                          x: event.clientX - containerRect.left,
                          y: event.clientY - containerRect.top,
                          barX: event.clientX,
                          barY: event.clientY
                        });
                        return;
                      }
                      
                      const containerRect = container.getBoundingClientRect();
                      setTooltipPosition({
                        x: event.clientX - containerRect.left,
                        y: event.clientY - containerRect.top,
                        barX: event.clientX,
                        barY: event.clientY
                      });
                    };

                    const handleHeartRateLeave = () => {
                      setHoveredHeartRate(null);
                    };

                    // Calculate dimensions for SVG
                    const graphWidth = svgWidth - padding.left - padding.right;
                    const graphHeight = svgHeight - padding.top - padding.bottom;
                    
                    // Scale functions
                    const xScale = (time) => padding.left + (time / maxTime) * graphWidth;
                    const yScale = (power) => padding.top + graphHeight - ((power / maxPower) * graphHeight);
                    const barWidthScale = (duration) => Math.max(4, (duration / maxTime) * graphWidth * 0.95);
                    
                    return (
                      <div className="relative">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold">
                            All Intervals (N = {intervalData.totalIntervals} intervals)
                          </h3>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(200, 140, 180, 0.6)' }}></div>
                              <span>Power (W)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-0.5" style={{ backgroundColor: 'rgba(255, 120, 140, 0.8)' }}></div>
                              <span>Heart Rate (bpm)</span>
                            </div>
                          </div>
                        </div>
                        <div ref={chartContainerRef} className="relative border rounded-lg bg-white p-4" id="chart-container" style={{ height: `${chartHeight}px` }}>
                          <svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="overflow-visible">
                            {/* Y-axis labels (Power) - lighter colors */}
                            {[0, maxPower * 0.25, maxPower * 0.5, maxPower * 0.75, maxPower].map((value, i) => (
                              <g key={`y-label-${i}`}>
                                <line
                                  x1={padding.left}
                                  y1={yScale(value)}
                                  x2={padding.left - 5}
                                  y2={yScale(value)}
                                  stroke="rgba(200, 180, 220, 0.6)"
                                  strokeWidth="1"
                                />
                                <text
                                  x={padding.left - 10}
                                  y={yScale(value) + 4}
                                  textAnchor="end"
                                  fontSize="11"
                                  fill="rgba(120, 90, 160, 0.8)"
                                  fontWeight="500"
                                >
                                  {Math.round(value)}
                                </text>
                              </g>
                            ))}
                            
                            {/* X-axis labels (Time) - lighter colors */}
                            {[0, maxTime * 0.25, maxTime * 0.5, maxTime * 0.75, maxTime].map((value, i) => {
                              const totalSeconds = Math.floor(value);
                              const hours = Math.floor(totalSeconds / 3600);
                              const minutes = Math.floor((totalSeconds % 3600) / 60);
                              const seconds = totalSeconds % 60;
                              const timeStr = hours > 0 
                                ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                                : `${minutes}:${seconds.toString().padStart(2, '0')}`;
                              
                              return (
                                <g key={`x-label-${i}`}>
                                  <line
                                    x1={xScale(value)}
                                    y1={padding.top + graphHeight}
                                    x2={xScale(value)}
                                    y2={padding.top + graphHeight + 5}
                                    stroke="rgba(200, 180, 220, 0.6)"
                                    strokeWidth="1"
                                  />
                                  <text
                                    x={xScale(value)}
                                    y={padding.top + graphHeight + 20}
                                    textAnchor="middle"
                                    fontSize="11"
                                    fill="rgba(120, 90, 160, 0.8)"
                                    fontWeight="500"
                                  >
                                    {timeStr}
                                  </text>
                                </g>
                              );
                            })}
                            
                            {/* Grid lines - lighter */}
                            {[0, maxPower * 0.25, maxPower * 0.5, maxPower * 0.75, maxPower].map((value, i) => (
                              <line
                                key={`grid-y-${i}`}
                                x1={padding.left}
                                y1={yScale(value)}
                                x2={padding.left + graphWidth}
                                y2={yScale(value)}
                                stroke="rgba(240, 240, 250, 0.8)"
                                strokeWidth="1"
                                strokeDasharray="2,2"
                              />
                            ))}
                            
                            {/* Bars */}
                            {validIntervals.map((interval, index) => {
                              const xPos = xScale(interval.start);
                              const width = barWidthScale(interval.duration);
                              const height = graphHeight - yScale(interval.power) + padding.top;
                              const barY = yScale(interval.power);
                              
                              // Calculate lighter color based on power - brighter palette
                              const powerRatio = maxPower > minPower ? (interval.power - minPower) / (maxPower - minPower) : 0.5;
                              // Lighter purple palette: starting from light lavender to medium purple
                              const baseR = 200;
                              const baseG = 180;
                              const baseB = 255;
                              const r = Math.round(baseR - (powerRatio * 60)); // 200 to 140
                              const g = Math.round(baseG - (powerRatio * 100)); // 180 to 80
                              const b = Math.round(baseB - (powerRatio * 50)); // 255 to 205
                              
                              // Gap between bars - lighter
                              const gapWidth = 4;
                              const actualBarX = index === 0 ? xPos : xPos + gapWidth / 2;
                              const actualBarWidth = Math.max(4, width - gapWidth);
                              
                              return (
                                <g key={`bar-${index}`}>
                                  {/* Light background for gap */}
                                  {index > 0 && (
                                    <rect
                                      x={xScale(validIntervals[index - 1].end) - gapWidth / 2}
                                      y={padding.top}
                                      width={gapWidth}
                                      height={graphHeight}
                                      fill="rgba(250, 248, 255, 0.8)"
                                    />
                                  )}
                                  
                                  {/* Bar */}
                                  <rect
                                    x={actualBarX}
                                    y={barY}
                                    width={actualBarWidth}
                                    height={height}
                                    fill={`rgba(${r}, ${g}, ${b}, 0.6)`}
                                    stroke={`rgba(${r}, ${g}, ${b}, 0.8)`}
                                    strokeWidth="1.5"
                                    rx="2"
                                    ry="2"
                                    onMouseEnter={(e) => {
                                      e.stopPropagation();
                                      handleBarHover(interval, index, e);
                                    }}
                                    onMouseMove={(e) => {
                                      e.stopPropagation();
                                      handleBarHover(interval, index, e);
                                    }}
                                    onMouseLeave={(e) => {
                                      e.stopPropagation();
                                      handleBarLeave();
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  />
                                </g>
                              );
                            })}
                            
                            {/* Heart Rate Line - lighter red with hover */}
                            {validIntervals.filter(i => i.heartRate !== null).map((interval, index, arr) => {
                              if (index === 0) return null;
                              const prevInterval = arr[index - 1];
                              if (prevInterval.heartRate === null) return null;
                              
                              const maxHR = Math.max(...validIntervals.filter(i => i.heartRate !== null).map(i => i.heartRate));
                              const hrYScale = (hr) => padding.top + graphHeight - ((hr / maxHR) * graphHeight);
                              
                              const x1 = xScale(prevInterval.end);
                              const y1 = hrYScale(prevInterval.heartRate);
                              const x2 = xScale(interval.end);
                              const y2 = hrYScale(interval.heartRate);
                              
                              return (
                                <g key={`hr-line-${index}`}>
                                  {/* Invisible hover area */}
                                  <rect
                                    x={Math.min(x1, x2) - 10}
                                    y={Math.min(y1, y2) - 10}
                                    width={Math.abs(x2 - x1) + 20}
                                    height={Math.abs(y2 - y1) + 20}
                                    fill="transparent"
                                    onMouseEnter={(e) => handleHeartRateHover(interval, index, e.nativeEvent)}
                                    onMouseLeave={handleHeartRateLeave}
                                    style={{ cursor: 'pointer' }}
                                  />
                                  {/* Visible heart rate line */}
                                  <line
                                    x1={x1}
                                    y1={y1}
                                    x2={x2}
                                    y2={y2}
                                    stroke="rgba(255, 120, 140, 0.8)"
                                    strokeWidth="2.5"
                                    style={{ pointerEvents: 'none' }}
                                  />
                                </g>
                              );
                            })}
                            
                            {/* Axis lines - lighter */}
                            <line
                              x1={padding.left}
                              y1={padding.top}
                              x2={padding.left}
                              y2={padding.top + graphHeight}
                              stroke="rgba(180, 160, 220, 0.6)"
                              strokeWidth="2"
                            />
                            <line
                              x1={padding.left}
                              y1={padding.top + graphHeight}
                              x2={padding.left + graphWidth}
                              y2={padding.top + graphHeight}
                              stroke="rgba(180, 160, 220, 0.6)"
                              strokeWidth="2"
                            />
                            
                            {/* Axis labels - lighter */}
                            <text
                              x={padding.left - 30}
                              y={padding.top + graphHeight / 2}
                              textAnchor="middle"
                              fontSize="13"
                              fill="rgba(120, 90, 160, 0.9)"
                              fontWeight="600"
                              transform={`rotate(-90 ${padding.left - 30} ${padding.top + graphHeight / 2})`}
                            >
                              Power (W)
                            </text>
                            <text
                              x={padding.left + graphWidth / 2}
                              y={svgHeight - 5}
                              textAnchor="middle"
                              fontSize="13"
                              fill="rgba(120, 90, 160, 0.9)"
                              fontWeight="600"
                            >
                              Training Time
                            </text>
                          </svg>
                          
                          {/* HTML Tooltip with Liquid Glass effect and arrow */}
                          {(hoveredInterval || hoveredHeartRate) && (
                            <div
                              className="absolute pointer-events-none z-50"
                              style={{
                                left: `${tooltipPosition.x || 0}px`,
                                top: `${tooltipPosition.y || 0}px`,
                                transform: 'translate(-50%, -100%)',
                                marginTop: '-10px',
                                minWidth: '200px',
                                maxWidth: '250px',
                                visibility: (tooltipPosition.x > 0 && tooltipPosition.y > 0) ? 'visible' : 'hidden'
                              }}
                            >
                              {/* Tooltip content */}
                              <div
                                style={{
                                  background: 'rgba(255, 255, 255, 0.85)',
                                  backdropFilter: 'blur(10px) saturate(180%)',
                                  WebkitBackdropFilter: 'blur(10px) saturate(180%)',
                                  borderRadius: '12px',
                                  padding: '12px 16px',
                                  boxShadow: '0 8px 32px rgba(139, 69, 190, 0.2), 0 0 1px rgba(139, 69, 190, 0.3) inset',
                                  border: '1px solid rgba(255, 255, 255, 0.3)'
                                }}
                              >
                                {hoveredInterval ? (
                                  <>
                                    <div className="font-bold mb-2 text-purple-800">Interval {hoveredInterval.index + 1}</div>
                                    <div className="text-sm space-y-1 text-gray-700">
                                      <div className="font-medium">Power: <span className="text-purple-600">{Math.round(hoveredInterval.power)} W</span></div>
                                      <div className="font-medium">Duration: <span className="text-purple-600">{formatDuration(hoveredInterval.duration)}</span></div>
                                      <div className="font-medium">Time: <span className="text-purple-600">{formatDuration(hoveredInterval.start)} - {formatDuration(hoveredInterval.end)}</span></div>
                                      {hoveredInterval.heartRate && (
                                        <div className="font-medium">Heart Rate: <span className="text-red-500">{Math.round(hoveredInterval.heartRate)} bpm</span></div>
                                      )}
                                    </div>
                                  </>
                                ) : hoveredHeartRate ? (
                                  <>
                                    <div className="font-bold mb-2 text-red-700">Heart Rate</div>
                                    <div className="text-sm space-y-1 text-gray-700">
                                      <div className="font-medium">Heart Rate: <span className="text-red-500">{Math.round(hoveredHeartRate.heartRate)} bpm</span></div>
                                      <div className="font-medium">Interval: <span className="text-purple-600">{hoveredHeartRate.index + 1}</span></div>
                                      {hoveredHeartRate.power && (
                                        <div className="font-medium">Power: <span className="text-purple-600">{Math.round(hoveredHeartRate.power)} W</span></div>
                                      )}
                                      <div className="font-medium">Time: <span className="text-purple-600">{formatDuration(hoveredHeartRate.start)} - {formatDuration(hoveredHeartRate.end)}</span></div>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                              {/* Arrow pointing down */}
                              <div
                                style={{
                                  position: 'absolute',
                                  left: '50%',
                                  top: '100%',
                                  transform: 'translateX(-50%)',
                                  width: 0,
                                  height: 0,
                                  borderLeft: '8px solid transparent',
                                  borderRight: '8px solid transparent',
                                  borderTop: '8px solid rgba(255, 255, 255, 0.85)',
                                  filter: 'drop-shadow(0 2px 4px rgba(139, 69, 190, 0.2))'
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Laps/Intervals */}
                  {selectedTraining && selectedTraining.laps && selectedTraining.laps.length > 0 && (
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold">Intervals</h3>
                        <button
                          onClick={() => setEditingLactate(!editingLactate)}
                          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
                        >
                          {editingLactate ? 'Cancel Edit' : 'Add Lactate'}
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Distance</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Speed</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg HR</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Power</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lactate</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {selectedTraining.laps.map((lap, index) => (
                              <tr key={index} className={lap.lactate ? 'bg-purple-50' : ''}>
                                <td className="px-4 py-3 text-sm">{index + 1}</td>
                                <td className="px-4 py-3 text-sm">{formatDuration(lap.totalElapsedTime)}</td>
                                <td className="px-4 py-3 text-sm">{formatDistance(lap.totalDistance)}</td>
                                <td className="px-4 py-3 text-sm">{formatSpeed(lap.avgSpeed)}</td>
                                <td className="px-4 py-3 text-sm">{lap.avgHeartRate ? `${Math.round(lap.avgHeartRate)} bpm` : '-'}</td>
                                <td className="px-4 py-3 text-sm">{lap.avgPower ? `${Math.round(lap.avgPower)} W` : '-'}</td>
                                <td className="px-4 py-3 text-sm">
                                  {editingLactate ? (
                                    <input
                                      type="number"
                                      step="0.1"
                                      placeholder="mmol/L"
                                      value={lactateInputs[`lap-${index}`] || lap.lactate || ''}
                                      onChange={(e) => setLactateInputs({
                                        ...lactateInputs,
                                        [`lap-${index}`]: e.target.value
                                      })}
                                      className="w-20 px-2 py-1 border rounded text-sm"
                                    />
                                  ) : (
                                    lap.lactate ? `${lap.lactate.toFixed(1)} mmol/L` : '-'
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {editingLactate && (
                        <div className="mt-4 flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingLactate(false);
                              setLactateInputs({});
                            }}
                            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveLactate}
                            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                          >
                            Save Lactate Values
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ) : null}
          </div>
        ) : null}

        {/* Strava Activity Detail */}
        {selectedStrava && selectedStravaStreams ? (
          <div className="w-full mt-6">
            {(() => {
          const time = selectedStravaStreams?.time?.data || [];
          const speed = selectedStravaStreams?.velocity_smooth?.data || [];
          const hr = selectedStravaStreams?.heartrate?.data || [];
          const power = selectedStravaStreams?.watts?.data || [];
          const altitude = selectedStravaStreams?.altitude?.data || [];
          const maxTime = time.length > 0 ? time[time.length-1] : 0;

          return (
            <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
              {/* Header Stats + Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Duration</div>
                  <div className="text-xl font-bold mt-1">{formatDuration(selectedStrava.elapsed_time)}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Distance</div>
                  <div className="text-xl font-bold mt-1">{formatDistance(selectedStrava.distance)}</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Avg Heart Rate</div>
                  <div className="text-xl font-bold mt-1">{selectedStrava.average_heartrate ? `${Math.round(selectedStrava.average_heartrate)} bpm` : '-'}</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Avg Power</div>
                  <div className="text-xl font-bold mt-1">{selectedStrava.average_watts ? `${Math.round(selectedStrava.average_watts)} W` : '-'}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-1"><input type="checkbox" checked={stravaSeries.speed} onChange={(e)=>setStravaSeries(s=>({...s,speed:e.target.checked}))}/> Speed</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={stravaSeries.hr} onChange={(e)=>setStravaSeries(s=>({...s,hr:e.target.checked}))}/> Heart Rate</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={stravaSeries.power} onChange={(e)=>setStravaSeries(s=>({...s,power:e.target.checked}))}/> Power</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={stravaSeries.altitude} onChange={(e)=>setStravaSeries(s=>({...s,altitude:e.target.checked}))}/> Elevation</label>
                <button 
                  className="px-2 py-1 border rounded hover:bg-gray-100" 
                  onClick={() => {
                    if (stravaChartRef.current) {
                      const chart = stravaChartRef.current.getEchartsInstance();
                      chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
                    }
                  }}
                >
                  Reset Zoom
                </button>
              </div>

              {/* Streams Chart (ECharts) */}
              {(() => {
                // Prepare interval bars data from laps
                const laps = selectedStrava?.laps || [];
                const intervalBars = [];
                let cumulativeTime = 0;
                
                laps.forEach((lap, idx) => {
                  const startTime = cumulativeTime;
                  const endTime = cumulativeTime + (lap.elapsed_time || 0);
                  const power = lap.average_watts || lap.average_power || 0;
                  const duration = lap.elapsed_time || 0;
                  
                  intervalBars.push({
                    value: [(startTime + endTime) / 2 / 60, power], // [center time, power] in minutes
                    interval: idx + 1,
                    startTime: startTime / 60,
                    endTime: endTime / 60,
                    duration: duration,
                    width: duration / 60, // Width in minutes
                    power: power,
                    heartRate: lap.average_heartrate || lap.average_hr || null,
                    distance: lap.distance || 0
                  });
                  
                  cumulativeTime = endTime;
                });

                const option = {
                  backgroundColor: 'transparent',
                  tooltip: { 
                    trigger: 'axis',
                    axisPointer: {
                      type: 'cross',
                      label: {
                        backgroundColor: '#6a7985'
                      }
                    },
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderColor: 'rgba(139, 69, 190, 0.3)',
                    borderWidth: 1,
                    textStyle: { color: '#333', fontSize: 13 },
                    padding: [12, 16],
                    formatter: (params) => {
                      let result = '';
                      const timeValue = params[0]?.axisValue || params[0]?.value?.[0] || 0;
                      
                      // Check if hovering over an interval
                      const hoveredInterval = intervalBars.find(bar => {
                        const start = bar.startTime;
                        const end = bar.endTime;
                        return timeValue >= start && timeValue <= end;
                      });
                      
                      if (hoveredInterval) {
                        const lap = laps[hoveredInterval.interval - 1] || {};
                        const avgSpeed = lap.average_speed ? (lap.average_speed * 3.6).toFixed(1) : '-';
                        result += `
                          <div style="font-weight: 600; color: #8B45D6; margin-bottom: 8px; font-size: 14px;">
                            Interval ${hoveredInterval.interval || ''}
                          </div>
                          <div style="font-size: 12px; line-height: 1.8; color: #555;">
                            <div><span style="font-weight: 600;">Power:</span> <span style="color: #8B45D6;">${Math.round(hoveredInterval.power || 0)} W</span></div>
                            ${hoveredInterval.heartRate ? `<div><span style="font-weight: 600;">Heart Rate:</span> <span style="color: #FF6B6B;">${Math.round(hoveredInterval.heartRate)} bpm</span></div>` : ''}
                            <div><span style="font-weight: 600;">Speed:</span> <span style="color: #4A90E2;">${avgSpeed} km/h</span></div>
                            <div><span style="font-weight: 600;">Distance:</span> <span style="color: #50C878;">${formatDistance(hoveredInterval.distance || 0)}</span></div>
                            <div><span style="font-weight: 600;">Duration:</span> <span style="color: #666;">${formatDuration(hoveredInterval.duration || 0)}</span></div>
                            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
                              ${hoveredInterval.startTime?.toFixed(1)} - ${hoveredInterval.endTime?.toFixed(1)} min
                            </div>
                          </div>
                        `;
                      }
                      
                      // Add line series values
                      params.forEach(param => {
                        if (param.seriesName !== 'Intervals' && param.seriesName !== 'Elevation') {
                          const value = Array.isArray(param.value) ? param.value[1] : param.value;
                          const unit = param.seriesName === 'Speed' ? ' km/h' : 
                                     param.seriesName === 'Heart Rate' ? ' bpm' : 
                                     param.seriesName === 'Power' ? ' W' : '';
                          result += `<div style="margin-top: 4px;"><span style="color: ${param.color};">●</span> ${param.seriesName}: <span style="font-weight: 600;">${value}${unit}</span></div>`;
                        }
                      });
                      
                      return result || 'Hover over the chart to see values';
                    }
                  },
                  legend: {
                    data: ['Speed','Heart Rate','Power','Elevation','Intervals'],
                    selected: {
                      'Speed': stravaSeries.speed,
                      'Heart Rate': stravaSeries.hr,
                      'Power': stravaSeries.power,
                      'Elevation': stravaSeries.altitude,
                      'Intervals': true
                    },
                    textStyle: { fontSize: 12, fontWeight: 500 },
                    itemGap: 20,
                    top: 10
                  },
                  dataZoom: [
                    { 
                      type: 'inside',
                      filterMode: 'none'
                    },
                    { 
                      type: 'slider',
                      height: 20,
                      bottom: 10,
                      handleStyle: {
                        color: '#8B45D6',
                        borderColor: '#8B45D6'
                      },
                      dataBackground: {
                        areaStyle: { color: 'rgba(139, 69, 190, 0.1)' }
                      },
                      selectedDataBackground: {
                        areaStyle: { color: 'rgba(139, 69, 190, 0.2)' }
                      }
                    }
                  ],
                  grid: { 
                    left: 60, 
                    right: 50, 
                    top: 60, 
                    bottom: 80,
                    containLabel: false
                  },
                  xAxis: {
                    type: 'value',
                    name: 'Time (min)',
                    nameLocation: 'middle',
                    nameGap: 30,
                    nameTextStyle: { fontSize: 12, fontWeight: 600, color: '#666' },
                    min: 0,
                    max: maxTime / 60,
                    axisLine: { lineStyle: { color: '#E0E0E0' } },
                    axisTick: { show: false },
                    splitLine: { 
                      show: true, 
                      lineStyle: { type: 'dashed', color: '#F0F0F0' }
                    },
                    axisLabel: { color: '#999', fontSize: 11 }
                  },
                  yAxis: [
                    { 
                      type: 'value', 
                      name: '',
                      axisLine: { lineStyle: { color: '#E0E0E0' } },
                      axisTick: { show: false },
                      splitLine: { 
                        show: true, 
                        lineStyle: { type: 'dashed', color: '#F0F0F0' }
                      },
                      axisLabel: { color: '#999', fontSize: 11 }
                    },
                    { 
                      type: 'value', 
                      name: 'Elevation (m)', 
                      position: 'right',
                      nameTextStyle: { fontSize: 12, fontWeight: 600, color: '#A07850' },
                      axisLine: { show: true, lineStyle: { color: '#A07850' } },
                      axisTick: { show: false },
                      splitLine: { show: false },
                      axisLabel: { color: '#A07850', fontSize: 11 }
                    }
                  ],
                  series: [
                    {
                      name: 'Intervals',
                      type: 'custom',
                      coordinateSystem: 'cartesian2d',
                      data: intervalBars.map(bar => ({
                        value: bar.value,
                        custom: {
                          interval: bar.interval,
                          startTime: bar.startTime,
                          endTime: bar.endTime,
                          duration: bar.duration,
                          width: bar.width,
                          power: bar.power,
                          heartRate: bar.heartRate,
                          distance: bar.distance
                        }
                      })),
                      renderItem: (params, api) => {
                        const dataValue = params.value || params.data?.value;
                        const custom = params.data?.custom || {};
                        
                        if (!Array.isArray(dataValue) || dataValue.length < 2) {
                          return null;
                        }
                        
                        const [centerTime, power] = dataValue;
                        const startTime = custom.startTime || (centerTime - (custom.width || 0) / 2);
                        const endTime = custom.endTime || (centerTime + (custom.width || 0) / 2);
                        const barWidth = custom.width || 0;
                        
                        if (barWidth <= 0 || power <= 0) return null;
                        
                        // Get coordinates - api.coord converts data values [x, y] to pixel coordinates [x, y]
                        // X coordinates for start and end time
                        const startX = api.coord([startTime, 0])[0];
                        const endX = api.coord([endTime, 0])[0];
                        // Y coordinates for power and base (0)
                        const powerY = api.coord([centerTime, power])[1];
                        const baseY = api.coord([centerTime, 0])[1];
                        
                        // Calculate bar dimensions
                        // In ECharts, Y increases downward, so baseY > powerY
                        const x = Math.min(startX, endX);
                        const width = Math.max(3, Math.abs(endX - startX));
                        const height = Math.max(3, Math.abs(baseY - powerY));
                        const y = Math.min(powerY, baseY); // Top of bar (smaller Y value = higher on screen)
                        
                        if (width < 3 || height < 3) return null;
                        
                        // Use a more visible color - light purple with good opacity
                        const color = `rgba(139, 69, 190, 0.4)`; // Purple with good visibility
                        const borderColor = `rgba(139, 69, 190, 0.7)`; // More visible border
                        
                        return {
                          type: 'rect',
                          shape: {
                            x: x,
                            y: y,
                            width: width,
                            height: height,
                            r: [2, 2, 0, 0]
                          },
                          style: {
                            fill: color,
                            stroke: borderColor,
                            lineWidth: 1.5
                          },
                          styleEmphasis: {
                            fill: `rgba(139, 69, 190, 0.5)`,
                            stroke: `rgba(139, 69, 190, 0.8)`,
                            lineWidth: 2
                          },
                          z2: 1 // Lower z-index to be behind line series
                        };
                      },
                      z: 1, // Behind line series (they have z: 2 or higher)
                      silent: true // Don't interfere with tooltip on line series
                    },
                    {
                      name: 'Speed', 
                      type: 'line', 
                      smooth: true,
                      data: time.map((t, i) => [t / 60, (speed[i] * 3.6).toFixed(1)]),
                      lineStyle: { 
                        color: '#4A90E2',
                        width: 2.5,
                        shadowBlur: 4,
                        shadowColor: 'rgba(74, 144, 226, 0.3)'
                      },
                      symbol: 'none',
                      areaStyle: {
                        color: {
                          type: 'linear',
                          x: 0, y: 0, x2: 0, y2: 1,
                          colorStops: [
                            { offset: 0, color: 'rgba(74, 144, 226, 0.15)' },
                            { offset: 1, color: 'rgba(74, 144, 226, 0.01)' }
                          ]
                        }
                      },
                      z: 2
                    },
                    {
                      name: 'Heart Rate', 
                      type: 'line', 
                      smooth: true,
                      data: time.map((t, i) => [t / 60, hr[i] || null]).filter(d => d[1] !== null),
                      lineStyle: { 
                        color: '#FF6B6B',
                        width: 2.5,
                        shadowBlur: 4,
                        shadowColor: 'rgba(255, 107, 107, 0.3)'
                      },
                      symbol: 'none',
                      areaStyle: {
                        color: {
                          type: 'linear',
                          x: 0, y: 0, x2: 0, y2: 1,
                          colorStops: [
                            { offset: 0, color: 'rgba(255, 107, 107, 0.15)' },
                            { offset: 1, color: 'rgba(255, 107, 107, 0.01)' }
                          ]
                        }
                      },
                      z: 2
                    },
                    {
                      name: 'Power', 
                      type: 'line', 
                      smooth: true,
                      data: time.map((t, i) => [t / 60, power[i] || null]).filter(d => d[1] !== null),
                      lineStyle: { 
                        color: '#8B45D6',
                        width: 2.5,
                        shadowBlur: 4,
                        shadowColor: 'rgba(139, 69, 190, 0.3)'
                      },
                      symbol: 'none',
                      areaStyle: {
                        color: {
                          type: 'linear',
                          x: 0, y: 0, x2: 0, y2: 1,
                          colorStops: [
                            { offset: 0, color: 'rgba(139, 69, 190, 0.15)' },
                            { offset: 1, color: 'rgba(139, 69, 190, 0.01)' }
                          ]
                        }
                      },
                      z: 2
                    },
                    {
                      name: 'Elevation', 
                      type: 'line', 
                      yAxisIndex: 1, 
                      areaStyle: {
                        color: {
                          type: 'linear',
                          x: 0, y: 0, x2: 0, y2: 1,
                          colorStops: [
                            { offset: 0, color: 'rgba(160, 120, 80, 0.4)' },
                            { offset: 1, color: 'rgba(160, 120, 80, 0.05)' }
                          ]
                        }
                      },
                      data: time.map((t, i) => [t / 60, altitude[i] || null]).filter(d => d[1] !== null),
                      lineStyle: { 
                        color: '#A07850',
                        width: 2,
                        shadowBlur: 3,
                        shadowColor: 'rgba(160, 120, 80, 0.2)'
                      },
                      symbol: 'none',
                      z: 2
                    }
                  ]
                };
                return (
                  <ReactECharts 
                    ref={stravaChartRef}
                    option={option} 
                    style={{ height: 320 }} 
                    notMerge={true} 
                    lazyUpdate={true} 
                  />
                );
              })()}

              {/* Laps/Intervals (Strava) */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Intervals</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Distance</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Speed</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg HR</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Power</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(selectedStrava?.laps || []).map((lap, index) => (
                        <tr key={index}>
                          <td className="px-4 py-3 text-sm">{index + 1}</td>
                          <td className="px-4 py-3 text-sm">{formatDuration(lap.elapsed_time)}</td>
                          <td className="px-4 py-3 text-sm">{formatDistance(lap.distance)}</td>
                          <td className="px-4 py-3 text-sm">{lap.average_speed ? `${(lap.average_speed*3.6).toFixed(1)} km/h` : '-'}</td>
                          <td className="px-4 py-3 text-sm">{lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : '-'}</td>
                          <td className="px-4 py-3 text-sm">{lap.average_watts ? `${Math.round(lap.average_watts)} W` : '-'}</td>
                        </tr>
                      ))}
                      {(!selectedStrava?.laps || selectedStrava.laps.length === 0) && (
                        <tr><td className="px-4 py-3 text-sm" colSpan={6}>No intervals available</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default FitAnalysisPage;


