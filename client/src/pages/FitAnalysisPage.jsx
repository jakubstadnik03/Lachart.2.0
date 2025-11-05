import React, { useState, useRef, useEffect } from 'react';
import { PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { uploadFitFile, getFitTrainings, getFitTraining, deleteFitTraining, createLap } from '../services/api';
import { motion } from 'framer-motion';
import CalendarView from '../components/Calendar/CalendarView';
import ReactECharts from 'echarts-for-react';
import { getIntegrationStatus } from '../services/api';
import { listExternalActivities } from '../services/api';
import { getStravaActivityDetail, updateStravaActivity, updateStravaLactateValues, getAllTitles, createStravaLap, deleteStravaLap, getTrainingById } from '../services/api';
import FitUploadSection from '../components/FitAnalysis/FitUploadSection';
import TrainingStats from '../components/FitAnalysis/TrainingStats';
import LapsTable from '../components/FitAnalysis/LapsTable';
import { prepareTrainingChartData, formatDuration, formatDistance } from '../utils/fitAnalysisUtils';
import WorkoutClustersList from '../components/WorkoutClustering/WorkoutClustersList';
import SimilarWorkouts from '../components/WorkoutClustering/SimilarWorkouts';

// Strava Laps Table Component
const StravaLapsTable = ({ selectedStrava, stravaChartRef, maxTime, loadStravaDetail, loadExternalActivities }) => {
  const [editingLactate, setEditingLactate] = useState(false);
  const [lactateInputs, setLactateInputs] = useState({});
  const [saving, setSaving] = useState(false);

  const handleSaveLactate = async () => {
    const lactateValues = Object.entries(lactateInputs).map(([key, value]) => {
      const index = parseInt(key.replace('lap-', ''));
      return {
        lapIndex: index,
        lactate: parseFloat(value)
      };
    }).filter(lv => lv.lactate && !isNaN(lv.lactate));

    if (lactateValues.length === 0) {
      alert('Please enter at least one lactate value');
      return;
    }

    try {
      setSaving(true);
      await updateStravaLactateValues(selectedStrava.id, lactateValues);
      await loadStravaDetail(selectedStrava.id);
      setEditingLactate(false);
      setLactateInputs({});
      alert('Lactate values saved successfully!');
    } catch (error) {
      console.error('Error saving lactate:', error);
      alert('Error saving lactate values');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLap = async (lapIndex) => {
    if (!window.confirm('Are you sure you want to delete this interval? This action cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      await deleteStravaLap(selectedStrava.id, lapIndex);
      await loadStravaDetail(selectedStrava.id);
      await loadExternalActivities(); // Reload to update calendar
      alert('Interval deleted successfully!');
    } catch (error) {
      console.error('Error deleting lap:', error);
      alert('Error deleting interval: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  if (!selectedStrava?.laps || selectedStrava.laps.length === 0) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-4">Intervals</h3>
        <p className="text-sm text-gray-600">No intervals available</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Intervals</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setEditingLactate(!editingLactate)}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
          >
            {editingLactate ? 'Cancel Edit' : 'Add Lactate'}
          </button>
        </div>
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {selectedStrava.laps.map((lap, index) => {
              // Calculate cumulative time for this lap
              let cumulativeTime = 0;
              for (let i = 0; i < index; i++) {
                cumulativeTime += (selectedStrava.laps[i]?.elapsed_time || 0);
              }
              const startTime = cumulativeTime;
              const endTime = cumulativeTime + (lap.elapsed_time || 0);
              
              return (
                <tr 
                  key={index}
                  onClick={(e) => {
                    // Don't zoom if clicking on lactate input
                    if (editingLactate && e.target.tagName === 'INPUT') return;
                    if (!stravaChartRef.current) return;
                    
                    const chart = stravaChartRef.current.getEchartsInstance();
                    const startTimeMin = startTime / 60;
                    const endTimeMin = endTime / 60;
                    const maxTimeMin = maxTime / 60;
                    
                    // Calculate zoom percentages
                    const startPercent = (startTimeMin / maxTimeMin) * 100;
                    const endPercent = (endTimeMin / maxTimeMin) * 100;
                    
                    // Add some padding (10% on each side)
                    const padding = Math.max(5, (endPercent - startPercent) * 0.1);
                    const zoomStart = Math.max(0, startPercent - padding);
                    const zoomEnd = Math.min(100, endPercent + padding);
                    
                    chart.dispatchAction({
                      type: 'dataZoom',
                      start: zoomStart,
                      end: zoomEnd
                    });
                  }}
                  className={`${lap.lactate ? 'bg-purple-50' : ''} ${!editingLactate ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}
                >
                  <td className="px-4 py-3 text-sm">{index + 1}</td>
                  <td className="px-4 py-3 text-sm">{formatDuration(lap.elapsed_time)}</td>
                  <td className="px-4 py-3 text-sm">{formatDistance(lap.distance)}</td>
                  <td className="px-4 py-3 text-sm">{lap.average_speed ? `${(lap.average_speed*3.6).toFixed(1)} km/h` : '-'}</td>
                  <td className="px-4 py-3 text-sm">{lap.average_heartrate ? `${Math.round(lap.average_heartrate)} bpm` : '-'}</td>
                  <td className="px-4 py-3 text-sm">{lap.average_watts ? `${Math.round(lap.average_watts)} W` : '-'}</td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
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
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      lap.lactate ? `${lap.lactate.toFixed(1)} mmol/L` : '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDeleteLap(index)}
                      disabled={saving}
                      className="px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-xs flex items-center gap-1"
                      title="Delete interval"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
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
            disabled={saving}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Lactate Values'}
          </button>
        </div>
      )}
    </div>
  );
};

const FitAnalysisPage = () => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [trainings, setTrainings] = useState([]);
  const [selectedTraining, setSelectedTraining] = useState(null);
  
  // Training chart hover state
  const [hoveredTrainingRecord, setHoveredTrainingRecord] = useState(null);
  const [trainingTooltipPosition, setTrainingTooltipPosition] = useState({ x: 0, y: 0 });
  const trainingChartRef = useRef(null);
  
  // Zoom state for training chart
  const [trainingZoom, setTrainingZoom] = useState({ min: 0, max: 1, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, time: 0 });
  const [dragEnd, setDragEnd] = useState({ x: 0, time: 0 });
  const [showCreateLapButton, setShowCreateLapButton] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState({ start: 0, end: 0 });
  const [selectionStats, setSelectionStats] = useState(null);
  const dragStateRef = useRef({ isActive: false, start: { x: 0, time: 0 }, end: { x: 0, time: 0 } });
  const [stravaConnected, setStravaConnected] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [externalActivities, setExternalActivities] = useState([]);
  const [selectedStrava, setSelectedStrava] = useState(null);
  const [selectedStravaStreams, setSelectedStravaStreams] = useState(null);
  const stravaChartRef = useRef(null);
  const [showClustering, setShowClustering] = useState(false);
  
  // Strava interval creation state
  const [stravaIsDragging, setStravaIsDragging] = useState(false);
  const [stravaDragStart, setStravaDragStart] = useState({ x: 0, time: 0 });
  const [stravaDragEnd, setStravaDragEnd] = useState({ x: 0, time: 0 });
  const [showStravaCreateLapButton, setShowStravaCreateLapButton] = useState(false);
  const [stravaSelectedTimeRange, setStravaSelectedTimeRange] = useState({ start: 0, end: 0 });
  const [stravaSelectionStats, setStravaSelectionStats] = useState(null);
  const stravaDragStateRef = useRef({ isActive: false, start: { x: 0, time: 0 }, end: { x: 0, time: 0 } });

  useEffect(() => {
    // Check if trainingId is in URL params (from TrainingTable click) - do this first
    const params = new URLSearchParams(window.location.search);
    const trainingId = params.get('trainingId');
    if (trainingId) {
      loadTrainingFromTrainingModel(trainingId);
    } else {
    loadTrainings();
    }
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
      
      // Check if we should restore Strava selection
      const savedStravaId = localStorage.getItem('fitAnalysis_selectedStravaId');
      if (savedStravaId) {
        // Verify the activity still exists
        const activityExists = acts?.some(a => String(a.stravaId) === savedStravaId);
        if (activityExists) {
          // Only load if not already selected (to avoid unnecessary API calls)
          if (!selectedStrava || String(selectedStrava.id) !== savedStravaId) {
            loadStravaDetail(savedStravaId);
          }
        } else {
          // Activity no longer exists, remove from localStorage
          localStorage.removeItem('fitAnalysis_selectedStravaId');
        }
      }
    } catch (e) {
      // ignore
    }
  };

  const loadStravaDetail = async (id) => {
    try {
      console.log('Loading Strava detail for ID:', id);
      const data = await getStravaActivityDetail(id);
      console.log('Strava detail loaded:', {
        hasDetail: !!data.detail,
        hasStreams: !!data.streams,
        streamsKeys: data.streams ? Object.keys(data.streams) : [],
        lapsCount: data.laps?.length || 0
      });
      
      // Merge titleManual and description into detail object
      const detailWithMeta = {
        ...data.detail,
        titleManual: data.titleManual,
        description: data.description,
        laps: data.laps || []
      };
      
      // Ensure streams data is properly set
      if (!data.streams) {
        console.warn('No streams data received from API');
        return;
      }
      
      setSelectedStrava(detailWithMeta);
      setSelectedStravaStreams(data.streams);
      setSelectedTraining(null);
      // Persist selection to localStorage
      localStorage.setItem('fitAnalysis_selectedStravaId', String(id));
      localStorage.removeItem('fitAnalysis_selectedTrainingId');
      localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
      
      console.log('Strava detail state updated successfully');
    } catch (e) {
      console.error('Error loading Strava detail:', e);
      // Remove invalid ID from localStorage
      localStorage.removeItem('fitAnalysis_selectedStravaId');
      // Clear state on error
      setSelectedStrava(null);
      setSelectedStravaStreams(null);
    }
  };

  // Training chart zoom and drag handlers - must be at top level (not conditionally rendered)
  useEffect(() => {
    const container = trainingChartRef.current;
    if (!container || !selectedTraining || !selectedTraining.records || selectedTraining.records.length === 0) return;

    const chartData = prepareTrainingChartData(selectedTraining);
    if (!chartData) return;

    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const graphWidth = 800 - padding.left - padding.right;

    // Convert screen X to time value - exposed to component scope
    window.screenXToTime = (screenX) => {
      const containerRect = container.getBoundingClientRect();
      const relativeX = screenX - containerRect.left - padding.left;
      const normalizedX = Math.max(0, Math.min(1, relativeX / graphWidth));
      const zoomedMinTime = chartData.maxTime * trainingZoom.min;
      const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
      const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
      const time = zoomedMinTime + (normalizedX * zoomedTimeRange);
      return Math.max(0, Math.min(chartData.maxTime, time));
    };

    const screenXToTime = window.screenXToTime;

    // Use ref for dragState so it can be accessed from overlay div handlers
    if (!dragStateRef.current || !dragStateRef.current.isActive) {
      dragStateRef.current = { isActive: false, start: { x: 0, time: 0 }, end: { x: 0, time: 0 } };
    }

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
      
      // Don't interfere if clicking on buttons or other interactive elements
      const target = e.target;
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        return;
      }
      
      // Check if click is inside the container
      const containerRect = container.getBoundingClientRect();
      const clickX = e.clientX - containerRect.left;
      const clickY = e.clientY - containerRect.top;
      
      // Allow drag if clicking in the graph area (not on buttons or other UI elements)
      if (clickX < padding.left || clickX > containerRect.width - padding.right || 
          clickY < padding.top || clickY > containerRect.height - padding.bottom) {
        return;
      }
      
      const startTime = screenXToTime(e.clientX);
      dragStateRef.current.isActive = true;
      dragStateRef.current.start = { x: clickX, time: startTime };
      dragStateRef.current.end = { x: clickX, time: startTime };
      setIsDragging(true);
      setDragStart({ x: dragStateRef.current.start.x, time: startTime });
      setDragEnd({ x: dragStateRef.current.end.x, time: startTime });
      e.preventDefault();
      e.stopPropagation();
    };
    
    const mouseLeaveHandler = () => {
      if (dragStateRef.current.isActive) {
        dragStateRef.current.isActive = false;
        dragStateRef.current.start = { x: 0, time: 0 };
        dragStateRef.current.end = { x: 0, time: 0 };
        setIsDragging(false);
        setDragStart({ x: 0, time: 0 });
        setDragEnd({ x: 0, time: 0 });
      }
    };
    
    const mouseMoveGlobalHandler = (e) => {
      if (!dragStateRef.current.isActive) return;
      
      const endTime = screenXToTime(e.clientX);
      const containerRect = container.getBoundingClientRect();
      const endX = e.clientX - containerRect.left;
      dragStateRef.current.end = { x: endX, time: endTime };
      setDragEnd({ x: endX, time: endTime });
    };
    
    const mouseUpGlobalHandler = (e) => {
      if (!dragStateRef.current.isActive) return;
      
      const startTime = Math.min(dragStateRef.current.start.time, dragStateRef.current.end.time);
      const endTime = Math.max(dragStateRef.current.start.time, dragStateRef.current.end.time);
      const timeRange = Math.abs(endTime - startTime);
      
      // If user wants to create a lap (hold Shift), show create lap button instead of zooming
      if (e.shiftKey && timeRange > chartData.maxTime * 0.01) {
        setSelectedTimeRange({ start: startTime, end: endTime });
        setShowCreateLapButton(true);
      } else if (timeRange > chartData.maxTime * 0.01) {
        // Normal zoom behavior
        const newMin = startTime / chartData.maxTime;
        const newMax = endTime / chartData.maxTime;
        const newScale = 1 / (newMax - newMin);
        
        setTrainingZoom({
          min: newMin,
          max: newMax,
          scale: newScale
        });
      }
      
      dragStateRef.current.isActive = false;
      dragStateRef.current.start = { x: 0, time: 0 };
      dragStateRef.current.end = { x: 0, time: 0 };
      setIsDragging(false);
      setDragStart({ x: 0, time: 0 });
      setDragEnd({ x: 0, time: 0 });
    };
    
    container.addEventListener('wheel', wheelHandler, { passive: false });
    // Keep container mousedown for fallback, but overlay div will handle most drags
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

  // Strava chart drag selection handlers
  useEffect(() => {
    if (!selectedStrava || !selectedStravaStreams) return;
    
    const container = document.getElementById('strava-chart-container');
    if (!container) return;
    
    // Get time array - could be time.data or time array directly
    const timeArray = selectedStravaStreams.time?.data || selectedStravaStreams.time || [];
    const maxTime = timeArray.length > 0 ? timeArray[timeArray.length - 1] : 0;
    
    if (maxTime === 0) {
      return;
    }
    
    const chartLeft = 60;
    const chartRight = 50;
    const chartTop = 60;
    const chartBottom = 80;
    
    // Helper function to get current maxTime from streams
    const getMaxTime = () => {
      const currentTimeArray = selectedStravaStreams?.time?.data || selectedStravaStreams?.time || [];
      return currentTimeArray.length > 0 ? currentTimeArray[currentTimeArray.length - 1] : 0;
    };
    
    const mouseDownHandler = (e) => {
      if (e.button !== 0) return;
      
      // Don't interfere if clicking on buttons
      const target = e.target;
      if (target.tagName === 'BUTTON' || target.closest('button')) return;
      
      const chartRect = container.getBoundingClientRect();
      const clickX = e.clientX - chartRect.left;
      const clickY = e.clientY - chartRect.top;
      
      if (clickX < chartLeft || clickX > chartRect.width - chartRight ||
          clickY < chartTop || clickY > chartRect.height - chartBottom) {
        return;
      }
      
      const currentMaxTime = getMaxTime();
      if (currentMaxTime === 0) {
        return;
      }
      
      const chartWidth = chartRect.width - chartLeft - chartRight;
      const relativeX = clickX - chartLeft;
      const normalizedX = Math.max(0, Math.min(1, relativeX / chartWidth));
      const timeInSeconds = normalizedX * currentMaxTime;
      
      stravaDragStateRef.current.isActive = true;
      stravaDragStateRef.current.start = { x: clickX, time: timeInSeconds };
      stravaDragStateRef.current.end = { x: clickX, time: timeInSeconds };
      
      setStravaIsDragging(true);
      setStravaDragStart({ x: clickX, time: timeInSeconds });
      setStravaDragEnd({ x: clickX, time: timeInSeconds });
      
      e.preventDefault();
      e.stopPropagation();
    };
    
    const mouseMoveGlobalHandler = (e) => {
      if (!stravaDragStateRef.current.isActive) return;
      
      const chartRect = container.getBoundingClientRect();
      const clickX = e.clientX - chartRect.left;
      const currentMaxTime = getMaxTime();
      const chartWidth = chartRect.width - chartLeft - chartRight;
      const relativeX = clickX - chartLeft;
      const normalizedX = Math.max(0, Math.min(1, relativeX / chartWidth));
      const timeInSeconds = normalizedX * currentMaxTime;
      
      stravaDragStateRef.current.end = { x: clickX, time: timeInSeconds };
      setStravaDragEnd({ x: clickX, time: timeInSeconds });
    };
    
    const mouseUpGlobalHandler = (e) => {
      if (!stravaDragStateRef.current.isActive) return;
      
      const currentMaxTime = getMaxTime();
      const startTime = Math.min(stravaDragStateRef.current.start.time, stravaDragStateRef.current.end.time);
      const endTime = Math.max(stravaDragStateRef.current.start.time, stravaDragStateRef.current.end.time);
      const timeRange = Math.abs(endTime - startTime);
      
      if (e.shiftKey && timeRange > currentMaxTime * 0.01) {
        if (stravaChartRef.current) {
          const chart = stravaChartRef.current.getEchartsInstance();
          const startPercent = (startTime / currentMaxTime) * 100;
          const endPercent = (endTime / currentMaxTime) * 100;
          chart.dispatchAction({
            type: 'dataZoom',
            start: startPercent,
            end: endPercent
          });
        }
      } else if (timeRange > currentMaxTime * 0.01) {
        setStravaSelectedTimeRange({ start: startTime, end: endTime });
        const calculateStats = (sTime, eTime) => {
          const time = timeArray;
          const speed = selectedStravaStreams.velocity_smooth?.data || selectedStravaStreams.velocity_smooth || [];
          const hr = selectedStravaStreams.heartrate?.data || selectedStravaStreams.heartrate || [];
          const power = selectedStravaStreams.watts?.data || selectedStravaStreams.watts || [];
          
          const selectedIndices = [];
          for (let i = 0; i < time.length; i++) {
            if (time[i] >= sTime && time[i] <= eTime) {
              selectedIndices.push(i);
            }
          }
          
          if (selectedIndices.length === 0) return null;
          
          const speeds = selectedIndices.map(i => speed[i]).filter(v => v && v > 0);
          const heartRates = selectedIndices.map(i => hr[i]).filter(v => v && v > 0);
          const powers = selectedIndices.map(i => power[i]).filter(v => v && v > 0);
          
          const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
          const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;
          const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null;
          const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : null;
          const avgPower = powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null;
          const maxPower = powers.length > 0 ? Math.max(...powers) : null;
          const totalDistance = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) * (eTime - sTime) / selectedIndices.length : null;
          
          return {
            duration: eTime - sTime,
            totalDistance,
            avgSpeed: avgSpeed ? (avgSpeed * 3.6).toFixed(1) : null,
            maxSpeed: maxSpeed ? (maxSpeed * 3.6).toFixed(1) : null,
            avgHeartRate,
            maxHeartRate,
            avgPower,
            maxPower
          };
        };
        const stats = calculateStats(startTime, endTime);
        setStravaSelectionStats(stats);
        setShowStravaCreateLapButton(true);
      }
      
      stravaDragStateRef.current.isActive = false;
      stravaDragStateRef.current.start = { x: 0, time: 0 };
      stravaDragStateRef.current.end = { x: 0, time: 0 };
      setStravaIsDragging(false);
      setStravaDragStart({ x: 0, time: 0 });
      setStravaDragEnd({ x: 0, time: 0 });
    };
    
    container.addEventListener('mousedown', mouseDownHandler);
    document.addEventListener('mousemove', mouseMoveGlobalHandler);
    document.addEventListener('mouseup', mouseUpGlobalHandler);
    
    return () => {
      container.removeEventListener('mousedown', mouseDownHandler);
      document.removeEventListener('mousemove', mouseMoveGlobalHandler);
      document.removeEventListener('mouseup', mouseUpGlobalHandler);
    };
  }, [selectedStrava, selectedStravaStreams]);

  const loadTrainings = async () => {
    try {
      const data = await getFitTrainings();
      setTrainings(data);
      
      // Check if we should restore training selection
      const savedTrainingId = localStorage.getItem('fitAnalysis_selectedTrainingId');
      const savedTrainingModelId = localStorage.getItem('fitAnalysis_selectedTrainingModelId');
      
      if (savedTrainingId && !selectedTraining) {
        // Verify the training still exists
        const trainingExists = data?.some(t => t._id === savedTrainingId);
        if (trainingExists) {
          loadTrainingDetail(savedTrainingId);
        } else {
          // Training no longer exists, remove from localStorage
          localStorage.removeItem('fitAnalysis_selectedTrainingId');
        }
      } else if (savedTrainingModelId && !selectedTraining) {
        // Try to restore Training model selection
        loadTrainingFromTrainingModel(savedTrainingModelId);
      }
    } catch (error) {
      console.error('Error loading trainings:', error);
    }
  };


  const loadTrainingDetail = async (id) => {
    try {
      const data = await getFitTraining(id);
      setSelectedTraining(data);
      // Persist selection to localStorage
      localStorage.setItem('fitAnalysis_selectedTrainingId', id);
      localStorage.removeItem('fitAnalysis_selectedStravaId');
      localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
    } catch (error) {
      console.error('Error loading training detail:', error);
      // Remove invalid ID from localStorage
      localStorage.removeItem('fitAnalysis_selectedTrainingId');
    }
  };

  // Load training from Training model (from TrainingTable)
  const loadTrainingFromTrainingModel = async (trainingId) => {
    try {
      console.log('Loading training from Training model, ID:', trainingId);
      const response = await getTrainingById(trainingId);
      const data = response.data || response; // Handle both response formats
      console.log('Training data loaded:', data);
      
      if (!data) {
        console.error('No training data received');
        return;
      }
      
      // Convert Training model to format compatible with FitAnalysisPage
      // Training model has results array, not records/laps like FitTraining
      const convertedTraining = {
        _id: data._id,
        titleManual: data.title,
        titleAuto: data.title,
        originalFileName: data.title,
        description: data.description || '',
        sport: data.sport === 'bike' ? 'cycling' : (data.sport === 'run' ? 'running' : (data.sport === 'swim' ? 'swimming' : 'generic')),
        timestamp: new Date(data.date),
        totalElapsedTime: data.results?.reduce((sum, r) => sum + (r.durationSeconds || parseDurationToSeconds(r.duration) || 0), 0) || 0,
        totalTimerTime: data.results?.reduce((sum, r) => sum + (r.durationSeconds || parseDurationToSeconds(r.duration) || 0), 0) || 0,
        // Convert results to laps format for display
        laps: data.results?.map((result, index) => {
          // Get duration in seconds - use durationSeconds if available, otherwise parse from duration string
          const durationSec = result.durationSeconds || parseDurationToSeconds(result.duration) || 0;
          
          return {
            lapNumber: index + 1,
            totalElapsedTime: durationSec,
            totalTimerTime: durationSec,
            avgPower: result.power || null,
            maxPower: result.power || null,
            avgHeartRate: result.heartRate || null,
            maxHeartRate: result.heartRate || null,
            lactate: result.lactate || null,
            // Note: Training model doesn't have records, so we can't show detailed chart
          };
        }) || [],
        records: [], // Training model doesn't have records, so no detailed chart
        isFromTrainingModel: true // Flag to indicate this is from Training model
      };
      
      console.log('Converted training:', convertedTraining);
      
      setSelectedTraining(convertedTraining);
      setSelectedStrava(null);
      // Persist selection to localStorage
      localStorage.setItem('fitAnalysis_selectedTrainingModelId', trainingId);
      localStorage.removeItem('fitAnalysis_selectedTrainingId');
      localStorage.removeItem('fitAnalysis_selectedStravaId');
      
      // Clean URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('trainingId');
      url.searchParams.delete('title');
      window.history.replaceState({}, '', url);
    } catch (error) {
      console.error('Error loading training from Training model:', error);
      console.error('Error details:', error.response?.data || error.message);
      localStorage.removeItem('fitAnalysis_selectedTrainingModelId');
      alert('Error loading training: ' + (error.response?.data?.error || error.message));
    }
  };
  
  // Helper function to parse duration string (MM:SS or HH:MM:SS) to seconds
  const parseDurationToSeconds = (durationStr) => {
    if (!durationStr || typeof durationStr !== 'string') return 0;
    const parts = durationStr.split(':');
    if (parts.length === 2) {
      // MM:SS format
      const minutes = parseInt(parts[0], 10) || 0;
      const seconds = parseInt(parts[1], 10) || 0;
      return minutes * 60 + seconds;
    } else if (parts.length === 3) {
      // HH:MM:SS format
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      const seconds = parseInt(parts[2], 10) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
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
      alert('Trainings uploaded successfully!');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error uploading file: ' + (error.response?.data?.message || error.message));
    } finally {
      setUploading(false);
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
        localStorage.removeItem('fitAnalysis_selectedTrainingId');
      }
      alert('Training deleted successfully');
    } catch (error) {
      console.error('Error deleting training:', error);
      alert('Error deleting training');
    }
  };



  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">FIT Training Analysis</h1>

        {/* Integrations Section */}
        <FitUploadSection
          files={files}
          uploading={uploading}
          stravaConnected={stravaConnected}
          onFileSelect={handleFileSelect}
          onUpload={handleUpload}
          onSyncComplete={loadExternalActivities}
        />

        {/* Calendar Section */}
        <CalendarView
          activities={[
            ...trainings.map(t => ({ 
              id: t._id, 
              date: t.timestamp, 
              title: t.titleManual || t.titleAuto || t.originalFileName || 'Untitled Training', 
              sport: t.sport 
            })),
            ...externalActivities.map(a => ({ 
              id: `strava-${a.stravaId}`, 
              date: a.startDate, 
              title: a.titleManual || a.name || 'Untitled Activity', 
              sport: a.sport 
            }))
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
        {selectedTraining && (
          <div className="w-full mt-6">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-lg shadow-md p-6 space-y-6"
                >
                  {/* Header Stats */}
              <TrainingStats 
                training={selectedTraining} 
                onDelete={handleDeleteTraining}
                onUpdate={async (id) => {
                  await loadTrainingDetail(id);
                  await loadTrainings(); // Reload to update calendar
                }}
              />


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
                      setShowCreateLapButton(false);
                      setSelectedTimeRange({ start: 0, end: 0 });
                      setSelectionStats(null);
                    };

                    const calculateSelectionStats = (startTime, endTime) => {
                      if (!selectedTraining?.records || selectedTraining.records.length === 0) return null;
                      
                      const trainingStartTime = selectedTraining.records[0]?.timestamp 
                        ? new Date(selectedTraining.records[0].timestamp).getTime() 
                        : selectedTraining.timestamp 
                          ? new Date(selectedTraining.timestamp).getTime() 
                          : Date.now();
                      
                      // Find records in the selected time range
                      const selectedRecords = selectedTraining.records.filter(record => {
                        if (!record.timestamp) return false;
                        const recordTime = new Date(record.timestamp).getTime();
                        const timeFromStart = (recordTime - trainingStartTime) / 1000;
                        return timeFromStart >= startTime && timeFromStart <= endTime;
                      });
                      
                      if (selectedRecords.length === 0) return null;
                      
                      // Calculate statistics
                      const speeds = selectedRecords.map(r => r.speed).filter(v => v && v > 0);
                      const heartRates = selectedRecords.map(r => r.heartRate).filter(v => v && v > 0);
                      const powers = selectedRecords.map(r => r.power).filter(v => v && v > 0);
                      const cadences = selectedRecords.map(r => r.cadence).filter(v => v && v > 0);
                      
                      const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
                      const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;
                      const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null;
                      const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : null;
                      const avgPower = powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null;
                      const maxPower = powers.length > 0 ? Math.max(...powers) : null;
                      const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length) : null;
                      
                      // Calculate distance
                      const firstRecord = selectedRecords[0];
                      const lastRecord = selectedRecords[selectedRecords.length - 1];
                      const totalDistance = lastRecord.distance && firstRecord.distance 
                        ? lastRecord.distance - firstRecord.distance 
                        : null;
                      
                      const duration = endTime - startTime;
                      
                      return {
                        duration,
                        totalDistance,
                        avgSpeed: avgSpeed ? (avgSpeed * 3.6).toFixed(1) : null, // km/h
                        maxSpeed: maxSpeed ? (maxSpeed * 3.6).toFixed(1) : null,
                        avgHeartRate,
                        maxHeartRate,
                        avgPower,
                        maxPower,
                        avgCadence
                      };
                    };

                    const handleCreateLap = async () => {
                      try {
                        const { start, end } = selectedTimeRange;
                        await createLap(selectedTraining._id, {
                          startTime: Math.min(start, end),
                          endTime: Math.max(start, end)
                        });
                        await loadTrainingDetail(selectedTraining._id);
                        setShowCreateLapButton(false);
                        setSelectedTimeRange({ start: 0, end: 0 });
                        setSelectionStats(null);
                      } catch (error) {
                        console.error('Error creating lap:', error);
                        alert('Error creating interval: ' + (error.response?.data?.error || error.message));
                      }
                    };

                    return (
                      <div className="mb-6">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold">Training Overview</h3>
                          <div className="flex gap-2 items-center">
                            <button
                              onClick={handleResetZoom}
                              className="px-3 py-1 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
                            >
                              Reset Zoom
                            </button>
                          </div>
                        </div>
                        {showCreateLapButton && selectionStats && (
                          <div className="mb-4 bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-lg font-semibold text-gray-900">Selected Interval Statistics</h4>
                              <button
                                onClick={() => {
                                  setShowCreateLapButton(false);
                                  setSelectedTimeRange({ start: 0, end: 0 });
                                  setSelectionStats(null);
                                }}
                                className="text-gray-500 hover:text-gray-700"
                              >
                                ✕
                              </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
                                <div className="text-xs text-gray-600 mb-1">Duration</div>
                                <div className="text-lg font-bold text-blue-700">{formatDuration(selectionStats.duration)}</div>
                              </div>
                              {selectionStats.totalDistance && (
                                <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
                                  <div className="text-xs text-gray-600 mb-1">Distance</div>
                                  <div className="text-lg font-bold text-blue-700">{formatDistance(selectionStats.totalDistance)}</div>
                                </div>
                              )}
                              {selectionStats.avgSpeed && (
                                <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
                                  <div className="text-xs text-gray-600 mb-1">Avg Speed</div>
                                  <div className="text-lg font-bold text-blue-700">{selectionStats.avgSpeed} km/h</div>
                                  {selectionStats.maxSpeed && (
                                    <div className="text-xs text-gray-500 mt-1">Max: {selectionStats.maxSpeed} km/h</div>
                                  )}
                                </div>
                              )}
                              {selectionStats.avgHeartRate && (
                                <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
                                  <div className="text-xs text-gray-600 mb-1">Avg HR</div>
                                  <div className="text-lg font-bold text-red-600">{selectionStats.avgHeartRate} bpm</div>
                                  {selectionStats.maxHeartRate && (
                                    <div className="text-xs text-gray-500 mt-1">Max: {selectionStats.maxHeartRate} bpm</div>
                                  )}
                                </div>
                              )}
                              {selectionStats.avgPower && (
                                <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
                                  <div className="text-xs text-gray-600 mb-1">Avg Power</div>
                                  <div className="text-lg font-bold text-purple-600">{selectionStats.avgPower} W</div>
                                  {selectionStats.maxPower && (
                                    <div className="text-xs text-gray-500 mt-1">Max: {selectionStats.maxPower} W</div>
                                  )}
                                </div>
                              )}
                              {selectionStats.avgCadence && (
                                <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
                                  <div className="text-xs text-gray-600 mb-1">Avg Cadence</div>
                                  <div className="text-lg font-bold text-green-600">{selectionStats.avgCadence} rpm</div>
                                </div>
                              )}
                            </div>
                            <div className="mt-4 flex justify-end">
                              <button
                                onClick={handleCreateLap}
                                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold shadow-md transition-colors flex items-center gap-2"
                              >
                                <span>✓</span> Create Interval
                              </button>
                            </div>
                          </div>
                        )}
                        {!showCreateLapButton && (
                          <div className="mb-2 text-xs text-gray-500 italic">
                            💡 Tip: Click and drag to select an interval, or hold <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Shift</kbd> while dragging to zoom
                          </div>
                        )}
                        <div 
                          ref={trainingChartRef}
                          className="relative border rounded-lg bg-white p-4 select-none" 
                          style={{ height: `${chartHeight}px`, cursor: isDragging ? 'crosshair' : 'default' }}
                        >
                          {/* Drag selection rectangle */}
                          {isDragging && dragStart.x !== dragEnd.x && (
                            <>
                            <div
                              className="absolute border-2 border-purple-500 bg-purple-200 bg-opacity-20 pointer-events-none z-40"
                              style={{
                                left: `${Math.min(dragStart.x, dragEnd.x) + padding.left}px`,
                                top: `${padding.top}px`,
                                width: `${Math.abs(dragEnd.x - dragStart.x)}px`,
                                height: `${graphHeight}px`
                              }}
                            />
                              {/* Show hint text when dragging */}
                              <div
                                className="absolute pointer-events-none z-50 text-xs text-purple-700 bg-purple-100 px-2 py-1 rounded"
                                style={{
                                  left: `${(Math.min(dragStart.x, dragEnd.x) + Math.max(dragStart.x, dragEnd.x)) / 2 + padding.left}px`,
                                  top: `${padding.top + 5}px`,
                                  transform: 'translateX(-50%)'
                                }}
                              >
                                {(() => {
                                  const startTime = Math.min(dragStart.time, dragEnd.time);
                                  const endTime = Math.max(dragStart.time, dragEnd.time);
                                  const duration = endTime - startTime;
                                  return `${formatDuration(duration)} - Release to create interval`;
                                })()}
                              </div>
                            </>
                          )}
                          
                          {/* Invisible overlay div for drag selection - positioned above SVG */}
                          <div
                            className="absolute drag-overlay"
                            style={{
                              left: `${padding.left}px`,
                              top: `${padding.top}px`,
                              width: `${graphWidth}px`,
                              height: `${graphHeight}px`,
                              cursor: isDragging ? 'crosshair' : 'default',
                              zIndex: 10,
                              pointerEvents: 'auto'
                            }}
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.preventDefault();
                              e.stopPropagation();
                              
                              const container = trainingChartRef.current;
                              if (!container) return;
                              
                              const containerRect = container.getBoundingClientRect();
                              const clickX = e.clientX - containerRect.left;
                              
                              // Calculate start time using the same logic as in useEffect
                              const relativeX = clickX - padding.left;
                              const normalizedX = Math.max(0, Math.min(1, relativeX / graphWidth));
                              const zoomedMinTime = chartData.maxTime * trainingZoom.min;
                              const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
                              const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
                              const startTime = zoomedMinTime + (normalizedX * zoomedTimeRange);
                              
                              // Use the dragStateRef from component scope
                              dragStateRef.current.isActive = true;
                              dragStateRef.current.start = { x: clickX, time: startTime };
                              dragStateRef.current.end = { x: clickX, time: startTime };
                              
                              setIsDragging(true);
                              setDragStart({ x: clickX, time: startTime });
                              setDragEnd({ x: clickX, time: startTime });
                            }}
                            onMouseMove={(e) => {
                              if (!dragStateRef.current.isActive) return;
                              
                              const container = trainingChartRef.current;
                              if (!container) return;
                              
                              const containerRect = container.getBoundingClientRect();
                              const clickX = e.clientX - containerRect.left;
                              
                              // Calculate end time
                              const relativeX = clickX - padding.left;
                              const normalizedX = Math.max(0, Math.min(1, relativeX / graphWidth));
                              const zoomedMinTime = chartData.maxTime * trainingZoom.min;
                              const zoomedMaxTime = chartData.maxTime * trainingZoom.max;
                              const zoomedTimeRange = zoomedMaxTime - zoomedMinTime;
                              const endTime = zoomedMinTime + (normalizedX * zoomedTimeRange);
                              
                              dragStateRef.current.end = { x: clickX, time: endTime };
                              setDragEnd({ x: clickX, time: endTime });
                            }}
                            onMouseUp={(e) => {
                              if (!dragStateRef.current.isActive) return;
                              
                              const startTime = Math.min(dragStateRef.current.start.time, dragStateRef.current.end.time);
                              const endTime = Math.max(dragStateRef.current.start.time, dragStateRef.current.end.time);
                              const timeRange = Math.abs(endTime - startTime);
                              
                              // If user wants to zoom (hold Shift), do zoom instead of showing create button
                              if (e.shiftKey && timeRange > chartData.maxTime * 0.01) {
                                // Zoom behavior when Shift is held
                                const newMin = startTime / chartData.maxTime;
                                const newMax = endTime / chartData.maxTime;
                                const newScale = 1 / (newMax - newMin);
                                
                                setTrainingZoom({
                                  min: newMin,
                                  max: newMax,
                                  scale: newScale
                                });
                              } else if (timeRange > chartData.maxTime * 0.01) {
                                // Show create interval button and stats (normal behavior)
                                setSelectedTimeRange({ start: startTime, end: endTime });
                                const stats = calculateSelectionStats(startTime, endTime);
                                setSelectionStats(stats);
                                setShowCreateLapButton(true);
                              }
                              
                              dragStateRef.current.isActive = false;
                              dragStateRef.current.start = { x: 0, time: 0 };
                              dragStateRef.current.end = { x: 0, time: 0 };
                              setIsDragging(false);
                              setDragStart({ x: 0, time: 0 });
                              setDragEnd({ x: 0, time: 0 });
                            }}
                            onMouseLeave={(e) => {
                              // Continue tracking mouse even when leaving overlay
                              if (dragStateRef.current.isActive) {
                                // Keep dragging active, mouseMoveGlobalHandler will handle it
                              }
                            }}
                          />
                          
                          <svg 
                            width="100%" 
                            height={svgHeight} 
                            viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
                            className="overflow-visible" 
                            style={{ cursor: isDragging ? 'crosshair' : 'default', pointerEvents: 'none', position: 'relative', zIndex: 1 }}
                          >
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

                            {/* Interval Bars - Background bars showing intervals */}
                            {(() => {
                              if (!selectedTraining?.laps || selectedTraining.laps.length === 0) return null;
                              
                              // Get training start time from first record
                              const trainingStartTime = chartData.records[0]?.timestamp 
                                ? new Date(chartData.records[0].timestamp).getTime() 
                                : Date.now();
                              
                              // Calculate time positions for each lap
                              let cumulativeTime = 0;
                              const allIntervalBars = selectedTraining.laps.map((lap, index) => {
                                let startTime = cumulativeTime;
                                if (lap.startTime) {
                                  const lapStartTime = new Date(lap.startTime).getTime();
                                  startTime = (lapStartTime - trainingStartTime) / 1000;
                                }
                                
                                const duration = lap.totalElapsedTime || lap.totalTimerTime || 0;
                                const endTime = startTime + duration;
                                cumulativeTime = endTime;
                                
                                const power = lap.avgPower || lap.maxPower || 0;
                                
                                return {
                                  index,
                                  startTime,
                                  endTime,
                                  duration,
                                  power
                                };
                              });
                              
                              const intervalBars = allIntervalBars.filter(bar => bar.power > 0 && bar.duration > 0);
                              
                              if (intervalBars.length === 0) return null;
                              
                              const maxIntervalPower = intervalBars.length > 0 
                                ? Math.max(...intervalBars.map(b => b.power))
                                : chartData.maxPower || 100;
                              const effectiveMaxPower = chartData.maxPower > 0 ? chartData.maxPower : maxIntervalPower;
                              
                              return intervalBars.map((bar) => {
                                if (bar.endTime < zoomedMinTime || bar.startTime > zoomedMaxTime) return null;
                                
                                const xStart = zoomedXScale(Math.max(bar.startTime, zoomedMinTime));
                                const xEnd = zoomedXScale(Math.min(bar.endTime, zoomedMaxTime));
                                
                                if (xStart === null || xEnd === null) return null;
                                
                                const barX = xStart;
                                const barWidth = Math.max(2, xEnd - xStart);
                                
                                const barTop = effectiveMaxPower > 0 
                                  ? padding.top + graphHeight - ((bar.power / effectiveMaxPower) * graphHeight)
                                  : padding.top + graphHeight;
                                const barBottom = padding.top + graphHeight;
                                const barHeight = Math.max(2, barBottom - barTop);
                                
                                const powerRatio = effectiveMaxPower > 0 ? bar.power / effectiveMaxPower : 0;
                                const baseR = 200;
                                const baseG = 180;
                                const baseB = 255;
                                const r = Math.round(baseR - (powerRatio * 60));
                                const g = Math.round(baseG - (powerRatio * 100));
                                const b = Math.round(baseB - (powerRatio * 50));
                                
                                return (
                                  <rect
                                    key={`interval-bar-${bar.index}`}
                                    x={barX}
                                    y={barTop}
                                    width={barWidth}
                                    height={barHeight}
                                    fill={`rgba(${r}, ${g}, ${b}, 0.35)`}
                                    stroke={`rgba(${r}, ${g}, ${b}, 0.6)`}
                                    strokeWidth="1"
                                    rx="2"
                                    ry="2"
                                    style={{ pointerEvents: 'none' }}
                                  />
                                );
                              }).filter(bar => bar !== null);
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
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'none' }}
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
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'none' }}
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
                                  style={{ cursor: isDragging ? 'crosshair' : 'pointer', pointerEvents: isDragging ? 'none' : 'none' }}
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
                                // Formát h:m (hodiny:minuty)
                                const timeStr = hours > 0 
                                  ? `${hours}:${minutes}`
                                  : `${minutes}`;
                                
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


                  {/* Laps/Intervals */}
                  <LapsTable 
                    training={selectedTraining}
                    onUpdate={loadTrainingDetail}
                  />
            </motion.div>
                        </div>
        )}

        {/* Strava Activity Detail */}
        {selectedStrava && (
          <div className="w-full mt-6">
            {!selectedStravaStreams ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-yellow-800">Loading graph data...</p>
              </div>
            ) : (() => {
          const time = selectedStravaStreams?.time?.data || [];
          const speed = selectedStravaStreams?.velocity_smooth?.data || [];
          const hr = selectedStravaStreams?.heartrate?.data || [];
          const power = selectedStravaStreams?.watts?.data || [];
          const altitude = selectedStravaStreams?.altitude?.data || [];
          const maxTime = time.length > 0 ? time[time.length-1] : 0;

          // Strava Title and Description Editor Component
          const StravaTitleEditor = () => {
            const [isEditingTitle, setIsEditingTitle] = useState(false);
            const [isEditingDescription, setIsEditingDescription] = useState(false);
            const [title, setTitle] = useState(selectedStrava?.titleManual || selectedStrava?.name || '');
            const [description, setDescription] = useState(selectedStrava?.description || '');
            const [saving, setSaving] = useState(false);
            const [allTitles, setAllTitles] = useState([]);
            const [showSuggestions, setShowSuggestions] = useState(false);
            const [filteredTitles, setFilteredTitles] = useState([]);
            const titleInputRef = useRef(null);
            const suggestionsRef = useRef(null);

            useEffect(() => {
              setTitle(selectedStrava?.titleManual || selectedStrava?.name || '');
              setDescription(selectedStrava?.description || '');
            }, [selectedStrava]);

            // Load all titles when editing starts
            useEffect(() => {
              if (isEditingTitle) {
                getAllTitles().then(titles => {
                  setAllTitles(titles);
                  setFilteredTitles(titles); // Zobrazit všechny titles na začátku
                  setShowSuggestions(titles.length > 0); // Zobrazit dropdown hned
                }).catch(err => console.error('Error loading titles:', err));
              }
            }, [isEditingTitle]);

            // Filter titles based on input
            useEffect(() => {
              if (title.trim() === '') {
                setFilteredTitles(allTitles);
                setShowSuggestions(allTitles.length > 0);
              } else {
                const filtered = allTitles.filter(t => 
                  t.toLowerCase().includes(title.toLowerCase())
                );
                setFilteredTitles(filtered);
                setShowSuggestions(filtered.length > 0);
              }
            }, [title, allTitles]);

            // Handle click outside to close suggestions
            useEffect(() => {
              const handleClickOutside = (event) => {
                if (
                  suggestionsRef.current &&
                  !suggestionsRef.current.contains(event.target) &&
                  titleInputRef.current &&
                  !titleInputRef.current.contains(event.target)
                ) {
                  setShowSuggestions(false);
                }
              };

              if (isEditingTitle) {
                document.addEventListener('mousedown', handleClickOutside);
                return () => document.removeEventListener('mousedown', handleClickOutside);
              }
            }, [isEditingTitle]);

            const handleSaveTitle = async () => {
              try {
                setSaving(true);
                await updateStravaActivity(selectedStrava.id, { title: title.trim() || null });
                setIsEditingTitle(false);
                await loadStravaDetail(selectedStrava.id);
                await loadExternalActivities(); // Reload to update calendar
                      } catch (error) {
                console.error('Error saving title:', error);
                alert('Error saving title');
              } finally {
                setSaving(false);
              }
            };

            const handleSaveDescription = async () => {
              try {
                setSaving(true);
                await updateStravaActivity(selectedStrava.id, { description: description.trim() || null });
                setIsEditingDescription(false);
                await loadStravaDetail(selectedStrava.id);
              } catch (error) {
                console.error('Error saving description:', error);
                alert('Error saving description');
              } finally {
                setSaving(false);
              }
            };

            const displayTitle = selectedStrava?.titleManual || selectedStrava?.name || 'Untitled Activity';
                    
                    return (
              <>
                {/* Title - Large and prominent */}
                <div className="mb-6 pb-4 border-b border-gray-200">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      {isEditingTitle ? (
                            <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              ref={titleInputRef}
                              type="text"
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              onFocus={() => {
                                if (allTitles.length > 0) {
                                  setShowSuggestions(true);
                                }
                              }}
                              className="w-full px-4 py-3 border-2 border-purple-300 rounded-lg text-3xl font-bold focus:outline-none focus:border-purple-500"
                              placeholder="Enter title..."
                              autoFocus
                            />
                            {showSuggestions && filteredTitles.length > 0 && (
                              <div
                                ref={suggestionsRef}
                                className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
                              >
                                {filteredTitles.map((suggestion, index) => (
                                  <div
                                    key={index}
                                    onClick={() => {
                                      setTitle(suggestion);
                                      setShowSuggestions(false);
                                    }}
                                    className="px-4 py-2 hover:bg-purple-50 cursor-pointer text-sm"
                                  >
                                    {suggestion}
                                    </div>
                                ))}
                              </div>
                            )}
                                    </div>
                        <button
                            onClick={handleSaveTitle}
                            disabled={saving}
                            className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            title="Save title"
                          >
                            <CheckIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              setIsEditingTitle(false);
                              setTitle(displayTitle);
                            }}
                            className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                            title="Cancel"
                          >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                      </div>
                      ) : (
                        <div className="flex items-center gap-3 group">
                          <h1 className="text-3xl font-bold text-gray-900">{displayTitle}</h1>
                          <button
                            onClick={() => setIsEditingTitle(true)}
                            className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                            title="Edit title"
                          >
                            <PencilIcon className="w-5 h-5" />
                          </button>
                            </div>
                          )}
                        </div>
                      </div>
                </div>
                
                {/* Description - Prominent box */}
                <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border-2 border-purple-200 shadow-sm">
                  <div className="flex items-start gap-2">
                    {isEditingDescription ? (
                      <>
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="flex-1 px-4 py-3 border-2 border-purple-300 rounded-lg min-h-[100px] bg-white text-gray-800 focus:outline-none focus:border-purple-500 resize-y"
                          placeholder="Enter description..."
                          autoFocus
                        />
                        <div className="flex flex-col gap-2 flex-shrink-0">
                        <button
                            onClick={handleSaveDescription}
                            disabled={saving}
                            className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            title="Save description"
                          >
                            <CheckIcon className="w-5 h-5" />
                        </button>
                          <button
                            onClick={() => {
                              setIsEditingDescription(false);
                              setDescription(selectedStrava?.description || '');
                            }}
                            className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                            title="Cancel"
                          >
                            <XMarkIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-start gap-3 w-full group">
                        <div className="flex-1">
                          {description ? (
                            <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-base">{description}</p>
                          ) : (
                          <button
                              onClick={() => setIsEditingDescription(true)}
                              className="text-gray-500 italic hover:text-gray-700 w-full text-left py-2 transition-colors"
                          >
                              📝 Click to add description...
                          </button>
                          )}
                        </div>
                        <button
                          onClick={() => setIsEditingDescription(true)}
                          className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-all flex-shrink-0"
                          title="Edit description"
                        >
                          <PencilIcon className="w-5 h-5" />
                        </button>
                    </div>
                  )}
          </div>
                </div>
              </>
            );
          };

          return (
            <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
              {/* Title and Description */}
              <StravaTitleEditor />
              
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


              {/* Streams Chart (ECharts) */}
              {(() => {
                // Extract time, speed, hr, power arrays from streams
                // Handle both formats: {time: {data: [...]}} and {time: [...]}
                const timeArray = selectedStravaStreams?.time?.data || selectedStravaStreams?.time || [];
                const speedArray = selectedStravaStreams?.velocity_smooth?.data || selectedStravaStreams?.velocity_smooth || [];
                const hrArray = selectedStravaStreams?.heartrate?.data || selectedStravaStreams?.heartrate || [];
                const powerArray = selectedStravaStreams?.watts?.data || selectedStravaStreams?.watts || [];
                const altitudeArray = selectedStravaStreams?.altitude?.data || selectedStravaStreams?.altitude || [];
                
                const time = timeArray;
                const speed = speedArray;
                const hr = hrArray;
                const power = powerArray;
                const altitude = altitudeArray;
                
                // Calculate stats from selected time range for Strava
                const calculateStravaSelectionStats = (startTime, endTime) => {
                  if (!time || time.length === 0) return null;
                  
                  // Find indices in the selected time range (time is in seconds)
                  const selectedIndices = [];
                  for (let i = 0; i < time.length; i++) {
                    if (time[i] >= startTime && time[i] <= endTime) {
                      selectedIndices.push(i);
                    }
                  }
                  
                  if (selectedIndices.length === 0) return null;
                  
                  // Calculate statistics
                  const speeds = selectedIndices.map(i => speed[i]).filter(v => v && v > 0);
                  const heartRates = selectedIndices.map(i => hr[i]).filter(v => v && v > 0);
                  const powers = selectedIndices.map(i => power[i]).filter(v => v && v > 0);
                  
                  const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;
                  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : null;
                  const avgHeartRate = heartRates.length > 0 ? Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length) : null;
                  const maxHeartRate = heartRates.length > 0 ? Math.max(...heartRates) : null;
                  const avgPower = powers.length > 0 ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length) : null;
                  const maxPower = powers.length > 0 ? Math.max(...powers) : null;
                  
                  // Calculate distance (approximate from speed)
                  const totalDistance = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) * (endTime - startTime) / selectedIndices.length : null;
                  const duration = endTime - startTime;
                  
                  return {
                    duration,
                    totalDistance,
                    avgSpeed: avgSpeed ? (avgSpeed * 3.6).toFixed(1) : null, // km/h
                    maxSpeed: maxSpeed ? (maxSpeed * 3.6).toFixed(1) : null,
                    avgHeartRate,
                    maxHeartRate,
                    avgPower,
                    maxPower
                  };
                };
                
                // Handler for creating Strava lap
                const handleCreateStravaLap = async () => {
                  try {
                    const { start, end } = stravaSelectedTimeRange;
                    await createStravaLap(selectedStrava.id, {
                      startTime: Math.min(start, end),
                      endTime: Math.max(start, end)
                    });
                    await loadStravaDetail(selectedStrava.id);
                    await loadExternalActivities(); // Reload Strava activities to update calendar
                    setShowStravaCreateLapButton(false);
                    setStravaSelectedTimeRange({ start: 0, end: 0 });
                    setStravaSelectionStats(null);
                    alert('Interval created successfully!');
                  } catch (error) {
                    console.error('Error creating Strava lap:', error);
                    alert('Error creating interval: ' + (error.response?.data?.error || error.message));
                  }
                };
                
                // Prepare interval bars data from laps
                const laps = selectedStrava?.laps || [];
                const intervalBars = [];
                
                // Calculate total activity time from streams (in seconds)
                const maxTime = time && time.length > 0 ? time[time.length - 1] : 0;
                
                // Get activity start time as Date object
                // Use start_date_local if available (consistent with backend), otherwise start_date
                const activityStartDateStr = selectedStrava?.start_date_local || selectedStrava?.start_date;
                const activityStartDate = activityStartDateStr 
                  ? new Date(activityStartDateStr)
                  : new Date();
                const activityStartTimeMs = activityStartDate.getTime();
                
                laps.forEach((lap, idx) => {
                  const power = lap.average_watts || lap.average_power || 0;
                  const duration = lap.elapsed_time || 0;
                  
                  // Skip if no duration
                  if (duration <= 0) return;
                  
                  // For original Strava laps (from API), require power > 0
                  // Manually created laps have startTime as ISO timestamp, allow power = 0 for them
                  // Original Strava laps have start_date or no startTime at all
                  const isManuallyCreated = lap.startTime && typeof lap.startTime === 'string' && !lap.start_date;
                  if (!isManuallyCreated && power <= 0) return;
                  
                  // Skip if this lap is the entire activity (likely the default Strava lap)
                  // If duration is within 95% of total activity time, it's probably the whole activity
                  if (maxTime > 0 && duration >= maxTime * 0.95) {
                    return;
                  }
                  
                  // Use actual startTime from lap if available (for manually created laps)
                  // startTime is stored as ISO timestamp string from backend
                  let startTimeSeconds = 0;
                  if (lap.startTime) {
                    // startTime is an ISO timestamp string, convert to seconds relative to activity start
                    const lapStartDate = new Date(lap.startTime);
                    const lapStartTimeMs = lapStartDate.getTime();
                    startTimeSeconds = (lapStartTimeMs - activityStartTimeMs) / 1000;
                    
                    // Ensure startTime is not negative (shouldn't happen, but safety check)
                    if (startTimeSeconds < 0) {
                      startTimeSeconds = 0;
                    }
                  } else if (lap.start_date) {
                    // Fallback to start_date from Strava API
                    const lapStartDate = new Date(lap.start_date);
                    const lapStartTimeMs = lapStartDate.getTime();
                    startTimeSeconds = (lapStartTimeMs - activityStartTimeMs) / 1000;
                    
                    if (startTimeSeconds < 0) {
                      startTimeSeconds = 0;
                    }
                  } else {
                    // Calculate cumulative time for laps without startTime or start_date
                    let cumulativeTime = 0;
                    for (let i = 0; i < idx; i++) {
                      cumulativeTime += (laps[i]?.elapsed_time || 0);
                    }
                    startTimeSeconds = cumulativeTime;
                  }
                  
                  const endTimeSeconds = startTimeSeconds + duration;
                  
                  // For rendering: use actual power if > 0
                  // For manually created intervals (with startTime), use minimum 50W if power is 0 for visibility
                  // For original Strava laps, use actual power (they already passed the power > 0 check above)
                  const displayPower = power > 0 ? power : (lap.startTime ? 50 : 0);
                  
                  intervalBars.push({
                    value: [(startTimeSeconds + endTimeSeconds) / 2 / 60, displayPower], // [center time, power] in minutes
                    interval: idx + 1,
                    startTime: startTimeSeconds / 60,
                    endTime: endTimeSeconds / 60,
                    duration: duration,
                    width: duration / 60, // Width in minutes
                    power: power, // Store original power
                    displayPower: displayPower, // Store display power for rendering
                    heartRate: lap.average_heartrate || lap.average_hr || null,
                    distance: lap.distance || 0,
                    lapIndex: idx
                  });
                });
                

                const option = {
                  backgroundColor: 'transparent',
                  tooltip: { 
                    trigger: 'axis',
                    show: true,
                    enterable: true,
                    confine: true,
                    axisPointer: {
                      type: 'cross',
                      label: {
                        backgroundColor: '#6a7985'
                      },
                      lineStyle: {
                        color: '#8B45D6',
                        width: 1,
                        type: 'dashed'
                      }
                    },
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderColor: 'rgba(139, 69, 190, 0.3)',
                    borderWidth: 1,
                    textStyle: { color: '#333', fontSize: 13 },
                    padding: [12, 16],
                    formatter: (params) => {
                      // If single params object (hovering over interval bar)
                      if (!Array.isArray(params) && params.seriesName === 'Intervals' && params.data?._barData) {
                        const barData = params.data._barData;
                        const lap = laps[barData.lapIndex] || {};
                        const avgSpeed = lap.average_speed ? (lap.average_speed * 3.6).toFixed(1) : '-';
                        
                        return `
                          <div style="font-weight: 600; color: #8B45D6; margin-bottom: 8px; font-size: 14px;">
                            Interval ${barData.interval || ''}
                          </div>
                          <div style="font-size: 12px; line-height: 1.8; color: #555;">
                            <div><span style="font-weight: 600;">Power:</span> <span style="color: #8B45D6;">${Math.round(barData.power || 0)} W</span></div>
                            ${barData.heartRate ? `<div><span style="font-weight: 600;">Heart Rate:</span> <span style="color: #FF6B6B;">${Math.round(barData.heartRate)} bpm</span></div>` : ''}
                            <div><span style="font-weight: 600;">Speed:</span> <span style="color: #4A90E2;">${avgSpeed} km/h</span></div>
                            <div><span style="font-weight: 600;">Distance:</span> <span style="color: #50C878;">${formatDistance(barData.distance || 0)}</span></div>
                            <div><span style="font-weight: 600;">Duration:</span> <span style="color: #666;">${formatDuration(barData.duration || 0)}</span></div>
                            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
                              ${barData.startTime?.toFixed(1)} - ${barData.endTime?.toFixed(1)} min
                            </div>
                          </div>
                        `;
                      }
                      
                      // For axis tooltip (line series) - params is an array
                      if (Array.isArray(params) && params.length > 0) {
                      let result = '';
                        
                        // Get time value from first param
                      const timeValue = params[0]?.axisValue || params[0]?.value?.[0] || 0;
                        
                        // Format time display
                        const hours = Math.floor(timeValue);
                        const minutes = Math.round((timeValue - hours) * 60);
                        const timeStr = hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}` : `${minutes} min`;
                        result += `<div style="font-weight: 600; margin-bottom: 8px; font-size: 14px; color: #333;">Time: ${timeStr}</div>`;
                      
                      // Check if hovering over an interval
                      const hoveredInterval = intervalBars.find(bar => {
                        const start = bar.startTime;
                        const end = bar.endTime;
                        return timeValue >= start && timeValue <= end;
                      });
                      
                      if (hoveredInterval) {
                          const lap = laps[hoveredInterval.lapIndex] || {};
                        const avgSpeed = lap.average_speed ? (lap.average_speed * 3.6).toFixed(1) : '-';
                        result += `
                            <div style="font-weight: 600; color: #8B45D6; margin-bottom: 8px; font-size: 14px; padding-top: 8px; border-top: 1px solid #eee;">
                            Interval ${hoveredInterval.interval || ''}
                          </div>
                          <div style="font-size: 12px; line-height: 1.8; color: #555;">
                            <div><span style="font-weight: 600;">Power:</span> <span style="color: #8B45D6;">${Math.round(hoveredInterval.power || 0)} W</span></div>
                            ${hoveredInterval.heartRate ? `<div><span style="font-weight: 600;">Heart Rate:</span> <span style="color: #FF6B6B;">${Math.round(hoveredInterval.heartRate)} bpm</span></div>` : ''}
                            <div><span style="font-weight: 600;">Speed:</span> <span style="color: #4A90E2;">${avgSpeed} km/h</span></div>
                            <div><span style="font-weight: 600;">Distance:</span> <span style="color: #50C878;">${formatDistance(hoveredInterval.distance || 0)}</span></div>
                            <div><span style="font-weight: 600;">Duration:</span> <span style="color: #666;">${formatDuration(hoveredInterval.duration || 0)}</span></div>
                          </div>
                        `;
                      }
                      
                      // Add line series values
                      params.forEach(param => {
                          if (param.seriesName && param.seriesName !== 'Intervals' && param.seriesName !== 'Elevation') {
                          const value = Array.isArray(param.value) ? param.value[1] : param.value;
                            if (value !== null && value !== undefined && value !== '' && !isNaN(value)) {
                          const unit = param.seriesName === 'Speed' ? ' km/h' : 
                                     param.seriesName === 'Heart Rate' ? ' bpm' : 
                                     param.seriesName === 'Power' ? ' W' : '';
                              result += `<div style="margin-top: 4px;"><span style="color: ${param.color || '#666'}; font-size: 14px;">●</span> <span style="font-weight: 500;">${param.seriesName}:</span> <span style="font-weight: 600;">${value}${unit}</span></div>`;
                            }
                          }
                        });
                        
                        return result || '<div>Hover over the chart to see values</div>';
                      }
                      
                      // Default fallback
                      return 'Hover over the chart to see values';
                    }
                  },
                  legend: {
                    data: ['Speed','Heart Rate','Power','Elevation','Intervals'],
                    textStyle: { fontSize: 12, fontWeight: 500 },
                    itemGap: 20,
                    top: 10,
                    left: 'center'
                  },
                  graphic: [
                    {
                      type: 'group',
                      left: '70%', // Umístění více vpravo, aby nepřekrývalo legendu
                      top: 10,
                      children: [
                        {
                          type: 'rect',
                          shape: {
                            width: 100,
                            height: 24,
                            r: 4
                          },
                          style: {
                            fill: '#f0f0f0',
                            stroke: '#8B45D6',
                            lineWidth: 1
                          },
                          z: 100
                        },
                        {
                          type: 'text',
                          style: {
                            text: 'Reset Zoom',
                            fontSize: 12,
                            fontWeight: 500,
                            fill: '#8B45D6',
                            textAlign: 'center',
                            textVerticalAlign: 'middle'
                          },
                          x: 50, // 50% z width obdélníku = střed
                          y: 12, // 50% z height = střed
                          z: 101
                        }
                      ],
                      onclick: () => {
                        if (stravaChartRef.current) {
                          const chart = stravaChartRef.current.getEchartsInstance();
                          chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
                        }
                      },
                      cursor: 'pointer'
                    }
                  ],
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
                    name: 'Time',
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
                    axisLabel: { 
                      color: '#999', 
                      fontSize: 11,
                      formatter: (value) => {
                        // value je v minutách, převést na hodiny a minuty
                        const totalMinutes = Math.floor(value);
                        const hours = Math.floor(totalMinutes / 60);
                        const minutes = totalMinutes % 60;
                        // Formát h:m
                        return hours > 0 ? `${hours}:${minutes}` : `${minutes}`;
                      }
                    }
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
                    // Interval Bars - using custom renderer
                    ...(intervalBars.length > 0 ? [{
                      name: 'Intervals',
                      type: 'custom',
                      coordinateSystem: 'cartesian2d',
                      data: intervalBars.map((bar) => ({
                        value: bar.value,
                        _barData: bar
                      })),
                      tooltip: {
                        show: true,
                        trigger: 'item',
                        formatter: (params) => {
                          const barData = params.data?._barData;
                          if (!barData) return '';
                          
                          const lap = laps[barData.lapIndex] || {};
                          const avgSpeed = lap.average_speed ? (lap.average_speed * 3.6).toFixed(1) : '-';
                          
                          return `
                            <div style="font-weight: 600; color: #8B45D6; margin-bottom: 8px; font-size: 14px;">
                              Interval ${barData.interval || ''}
                            </div>
                            <div style="font-size: 12px; line-height: 1.8; color: #555;">
                              <div><span style="font-weight: 600;">Power:</span> <span style="color: #8B45D6;">${Math.round(barData.power || 0)} W</span></div>
                              ${barData.heartRate ? `<div><span style="font-weight: 600;">Heart Rate:</span> <span style="color: #FF6B6B;">${Math.round(barData.heartRate)} bpm</span></div>` : ''}
                              <div><span style="font-weight: 600;">Speed:</span> <span style="color: #4A90E2;">${avgSpeed} km/h</span></div>
                              <div><span style="font-weight: 600;">Distance:</span> <span style="color: #50C878;">${formatDistance(barData.distance || 0)}</span></div>
                              <div><span style="font-weight: 600;">Duration:</span> <span style="color: #666;">${formatDuration(barData.duration || 0)}</span></div>
                              <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
                                ${barData.startTime?.toFixed(1)} - ${barData.endTime?.toFixed(1)} min
                              </div>
                            </div>
                          `;
                        },
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        borderColor: 'rgba(139, 69, 190, 0.3)',
                        borderWidth: 1,
                        textStyle: { color: '#333', fontSize: 13 },
                        padding: [12, 16]
                      },
                      emphasis: {
                        focus: 'none',
                        blurScope: 'none'
                      },
                      renderItem: (params, api) => {
                        try {
                          if (!params || params.dataIndex === undefined || !api) return null;
                          
                          const dataIndex = params.dataIndex;
                          const dataItem = params.data;
                          
                          // Get barData from data item
                          const barData = dataItem?._barData || intervalBars[dataIndex];
                          
                          if (!barData || !barData.value) return null;
                          
                          // Use barData.value directly - it's already [centerTime, power]
                          const dataValue = Array.isArray(barData.value) ? barData.value : [0, 0];
                        const [centerTime, power] = dataValue;
                          const startTime = barData.startTime;
                          const endTime = barData.endTime;
                          const actualPower = barData.power || power || 0;
                          
                          // Allow intervals with 0 power (they might still be valid intervals)
                          if (!startTime || !endTime || isNaN(startTime) || isNaN(endTime)) return null;
                          
                          // Use displayPower if available (for intervals without power data), otherwise use actualPower or minimum 50W
                          const displayPower = barData.displayPower || (actualPower > 0 ? actualPower : 50);
                          
                          // Check if api.coord exists and is a function
                          if (!api.coord || typeof api.coord !== 'function') return null;
                          
                          // Get coordinates
                          const startXCoord = api.coord([startTime, 0]);
                          const endXCoord = api.coord([endTime, 0]);
                          const powerYCoord = api.coord([centerTime, displayPower]);
                          const baseYCoord = api.coord([centerTime, 0]);
                          
                          if (!startXCoord || !endXCoord || !powerYCoord || !baseYCoord) return null;
                          
                          const startX = Array.isArray(startXCoord) ? startXCoord[0] : startXCoord;
                          const endX = Array.isArray(endXCoord) ? endXCoord[0] : endXCoord;
                          const powerY = Array.isArray(powerYCoord) ? powerYCoord[1] : powerYCoord;
                          const baseY = Array.isArray(baseYCoord) ? baseYCoord[1] : baseYCoord;
                          
                          if (startX === undefined || endX === undefined || powerY === undefined || baseY === undefined) return null;
                          
                        const x = Math.min(startX, endX);
                          const width = Math.max(2, Math.abs(endX - startX));
                          const height = Math.max(2, Math.abs(baseY - powerY));
                          const y = Math.min(powerY, baseY);
                          
                          if (width < 2 || height < 2 || isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) return null;
                          
                          // Lighter, more transparent color based on power
                          const maxPower = Math.max(...intervalBars.map(b => (b.power || 0) > 0 ? b.power : 50), 100);
                          const powerRatio = maxPower > 0 ? displayPower / maxPower : 0;
                          // Lighter purple/lavender colors
                          const baseR = 230, baseG = 220, baseB = 255;
                          const r = Math.round(baseR - (powerRatio * 40));
                          const g = Math.round(baseG - (powerRatio * 50));
                          const b = Math.round(baseB - (powerRatio * 20));
                        
                        return {
                          type: 'rect',
                            shape: { x, y, width, height, r: [2, 2, 0, 0] },
                          style: {
                              fill: `rgba(${r}, ${g}, ${b}, 0.25)`, // More transparent
                              stroke: `rgba(${r}, ${g}, ${b}, 0.4)`, // Lighter border
                              lineWidth: 1 // Thinner border
                            },
                            z2: 1
                          };
                        } catch (error) {
                          console.error(`Error rendering interval ${params?.dataIndex}:`, error);
                          return null;
                        }
                      },
                      z: 1,
                      silent: false
                    }] : []),
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
                  <div className="relative" id="strava-chart-container">
                    {/* Drag selection overlay for Strava chart - only visible when dragging */}
                    {stravaIsDragging && (
                      <div
                        className="absolute"
                        style={{
                          left: '60px',
                          top: '60px',
                          right: '50px',
                          bottom: '80px',
                          cursor: 'crosshair',
                          zIndex: 10,
                          pointerEvents: 'auto'
                        }}
                      />
                    )}
                    
                    {/* Drag selection rectangle */}
                    {stravaIsDragging && stravaDragStart.x !== stravaDragEnd.x && (
                      <>
                        <div
                          className="absolute border-2 border-purple-500 bg-purple-200 bg-opacity-20 pointer-events-none z-50"
                          style={{
                            left: `${60 + Math.min(stravaDragStart.x - 60, stravaDragEnd.x - 60)}px`,
                            top: '60px',
                            width: `${Math.abs(stravaDragEnd.x - stravaDragStart.x)}px`,
                            height: '240px'
                          }}
                        />
                        {/* Show hint text */}
                        <div
                          className="absolute pointer-events-none z-50 text-xs text-purple-700 bg-purple-100 px-2 py-1 rounded"
                          style={{
                            left: `${(stravaDragStart.x + stravaDragEnd.x) / 2}px`,
                            top: '65px',
                            transform: 'translateX(-50%)'
                          }}
                        >
                          {(() => {
                            const startTime = Math.min(stravaDragStart.time || 0, stravaDragEnd.time || 0);
                            const endTime = Math.max(stravaDragStart.time || 0, stravaDragEnd.time || 0);
                            const duration = Math.max(0, endTime - startTime);
                            if (duration > 0) {
                              return `${formatDuration(duration)} - Release to create interval`;
                            }
                            return 'Drag to select interval';
                          })()}
                        </div>
                      </>
                    )}
                    
                  <ReactECharts 
                    ref={stravaChartRef}
                    option={option} 
                    style={{ height: 320 }} 
                    notMerge={true} 
                    lazyUpdate={true} 
                  />
                  </div>
                );
              })()}

              {/* Strava Interval Creation Stats */}
              {showStravaCreateLapButton && stravaSelectionStats && (
                <div className="mt-4 bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-gray-900">Selected Interval Statistics</h4>
                    <button
                      onClick={() => {
                        setShowStravaCreateLapButton(false);
                        setStravaSelectedTimeRange({ start: 0, end: 0 });
                        setStravaSelectionStats(null);
                      }}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      ✕
                    </button>
                </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
                      <div className="text-xs text-gray-600 mb-1">Duration</div>
                      <div className="text-lg font-bold text-blue-700">{formatDuration(stravaSelectionStats.duration)}</div>
                    </div>
                    {stravaSelectionStats.totalDistance && (
                      <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
                        <div className="text-xs text-gray-600 mb-1">Distance</div>
                        <div className="text-lg font-bold text-blue-700">{formatDistance(stravaSelectionStats.totalDistance)}</div>
                      </div>
                    )}
                    {stravaSelectionStats.avgSpeed && (
                      <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
                        <div className="text-xs text-gray-600 mb-1">Avg Speed</div>
                        <div className="text-lg font-bold text-blue-700">{stravaSelectionStats.avgSpeed} km/h</div>
                        {stravaSelectionStats.maxSpeed && (
                          <div className="text-xs text-gray-500 mt-1">Max: {stravaSelectionStats.maxSpeed} km/h</div>
                        )}
                </div>
                    )}
                    {stravaSelectionStats.avgHeartRate && (
                      <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
                        <div className="text-xs text-gray-600 mb-1">Avg HR</div>
                        <div className="text-lg font-bold text-red-600">{stravaSelectionStats.avgHeartRate} bpm</div>
                        {stravaSelectionStats.maxHeartRate && (
                          <div className="text-xs text-gray-500 mt-1">Max: {stravaSelectionStats.maxHeartRate} bpm</div>
                        )}
              </div>
                    )}
                    {stravaSelectionStats.avgPower && (
                      <div className="bg-white/70 rounded-lg p-3 border border-blue-200">
                        <div className="text-xs text-gray-600 mb-1">Avg Power</div>
                        <div className="text-lg font-bold text-purple-600">{stravaSelectionStats.avgPower} W</div>
                        {stravaSelectionStats.maxPower && (
                          <div className="text-xs text-gray-500 mt-1">Max: {stravaSelectionStats.maxPower} W</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={async () => {
                        try {
                          const { start, end } = stravaSelectedTimeRange;
                          await createStravaLap(selectedStrava.id, {
                            startTime: Math.min(start, end),
                            endTime: Math.max(start, end)
                          });
                          await loadStravaDetail(selectedStrava.id);
                          await loadExternalActivities(); // Reload Strava activities to update calendar
                          setShowStravaCreateLapButton(false);
                          setStravaSelectedTimeRange({ start: 0, end: 0 });
                          setStravaSelectionStats(null);
                          alert('Interval created successfully!');
                        } catch (error) {
                          console.error('Error creating Strava lap:', error);
                          alert('Error creating interval: ' + (error.response?.data?.error || error.message));
                        }
                      }}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold shadow-md transition-colors flex items-center gap-2"
                    >
                      <span>✓</span> Create Interval
                    </button>
                  </div>
                </div>
              )}
              
              {!showStravaCreateLapButton && (
                <div className="mt-2 text-xs text-gray-500 italic">
                  💡 Tip: Click and drag on the chart to select an interval, or hold <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Shift</kbd> while dragging to zoom
                </div>
              )}

              {/* Laps/Intervals (Strava) */}
              <StravaLapsTable 
                selectedStrava={selectedStrava}
                stravaChartRef={stravaChartRef}
                maxTime={maxTime}
                loadStravaDetail={loadStravaDetail}
                loadExternalActivities={loadExternalActivities}
              />
            </div>
          );
        })()}
          </div>
        )}

        {/* Workout Clustering Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
              <div>
              <h2 className="text-2xl font-bold text-gray-900">Workout Clustering</h2>
              <p className="text-sm text-gray-600 mt-1">
                Automatically group and analyze similar workouts
              </p>
                </div>
            <button
              onClick={() => setShowClustering(!showClustering)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              {showClustering ? 'Hide Clustering' : 'Show Clustering'}
            </button>
          </div>

          {showClustering && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg shadow-md p-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main clusters list */}
                <div className="lg:col-span-2">
                  <WorkoutClustersList 
                    onSelectWorkout={(workout) => {
                      // Handle workout selection - could be an ID or object
                      const workoutId = workout?._id || workout;
                      if (workoutId && typeof workoutId === 'string') {
                        loadTrainingDetail(workoutId);
                        setSelectedStrava(null);
                      }
                    }} 
                    ftp={null} // TODO: Get FTP from user profile
                  />
                </div>

                {/* Sidebar with similar workouts */}
                <div className="lg:col-span-1">
                  {selectedTraining?._id && (
                    <SimilarWorkouts
                      workoutId={selectedTraining._id}
                      onSelectWorkout={(workoutId) => {
                        if (workoutId) {
                          loadTrainingDetail(workoutId);
                        }
                      }}
                    />
                  )}
                  
                  {!selectedTraining?._id && (
                    <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Similar Workouts
                      </h3>
                      <p className="text-sm text-gray-600">
                        Select a training to see similar workouts here.
                      </p>
                </div>
                  )}
              </div>
            </div>
            </motion.div>
          )}
          </div>
      </div>
    </div>
  );
};

export default FitAnalysisPage;


