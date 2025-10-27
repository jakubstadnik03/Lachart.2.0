import React, { useState } from 'react';
import { motion } from 'framer-motion';

const LactateSessionForm = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    sport: 'run',
    title: '',
    description: '',
    startTime: '',
    envTempC: '',
    altitudeM: '',
    notes: '',
    intervals: []
  });

  const [currentInterval, setCurrentInterval] = useState({
    kind: 'work',
    durationType: 'time', // 'time' or 'distance'
    duration: '3:00', // MM:SS format for time, or distance in km
    intensity: '', // pace (MM:SS/km) or power (W) or speed (km/h)
    targetLactateMin: '',
    targetLactateMax: ''
  });

  const [repeatSettings, setRepeatSettings] = useState({
    enabled: false,
    count: 1,
    workInterval: {
      kind: 'work',
      durationType: 'time',
      duration: '3:00',
      intensity: '',
      targetLactateMin: '',
      targetLactateMax: ''
    },
    restInterval: {
      kind: 'rest',
      durationType: 'time',
      duration: '2:00',
      intensity: '',
      targetLactateMin: '',
      targetLactateMax: ''
    }
  });

  // Helper functions
  const timeToSeconds = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return parseInt(timeStr) || 0;
  };

  const secondsToTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const paceToSeconds = (paceStr) => {
    if (!paceStr) return 0;
    const parts = paceStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return parseInt(paceStr) || 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleIntervalChange = (e) => {
    const { name, value } = e.target;
    setCurrentInterval(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const addRepeatIntervals = () => {
    if (!repeatSettings.enabled || repeatSettings.count <= 0) return;
    
    const newIntervals = [];
    let totalDuration = formData.intervals.reduce((sum, interval) => sum + interval.durationS, 0);
    
    for (let i = 0; i < repeatSettings.count; i++) {
      // Add work interval
      const workDurationS = repeatSettings.workInterval.durationType === 'time' 
        ? timeToSeconds(repeatSettings.workInterval.duration)
        : parseFloat(repeatSettings.workInterval.duration) * 1000;
      
      let workTargetPowerW = null;
      let workTargetPaceSPerKm = null;
      
      if (formData.sport === 'bike' && repeatSettings.workInterval.intensity) {
        workTargetPowerW = parseInt(repeatSettings.workInterval.intensity);
      } else if ((formData.sport === 'run' || formData.sport === 'swim') && repeatSettings.workInterval.intensity) {
        workTargetPaceSPerKm = paceToSeconds(repeatSettings.workInterval.intensity);
      }
      
      newIntervals.push({
        kind: 'work',
        seq: formData.intervals.length + newIntervals.length + 1,
        startOffsetS: totalDuration,
        durationS: workDurationS,
        targetPowerW: workTargetPowerW,
        targetPaceSPerKm: workTargetPaceSPerKm,
        targetLactateMin: parseFloat(repeatSettings.workInterval.targetLactateMin) || null,
        targetLactateMax: parseFloat(repeatSettings.workInterval.targetLactateMax) || null
      });
      
      totalDuration += workDurationS;
      
      // Add rest interval (except for the last work interval)
      if (i < repeatSettings.count - 1) {
        const restDurationS = repeatSettings.restInterval.durationType === 'time' 
          ? timeToSeconds(repeatSettings.restInterval.duration)
          : parseFloat(repeatSettings.restInterval.duration) * 1000;
        
        newIntervals.push({
          kind: 'rest',
          seq: formData.intervals.length + newIntervals.length + 1,
          startOffsetS: totalDuration,
          durationS: restDurationS,
          targetPowerW: null,
          targetPaceSPerKm: null,
          targetLactateMin: parseFloat(repeatSettings.restInterval.targetLactateMin) || null,
          targetLactateMax: parseFloat(repeatSettings.restInterval.targetLactateMax) || null
        });
        
        totalDuration += restDurationS;
      }
    }
    
    setFormData(prev => ({
      ...prev,
      intervals: [...prev.intervals, ...newIntervals]
    }));
    
    console.log(`➕ Added ${newIntervals.length} intervals (${repeatSettings.count} work + ${repeatSettings.count - 1} rest)`);
  };

  const addInterval = () => {
    if (!currentInterval.duration) return;
    
    // Calculate duration in seconds
    const durationS = currentInterval.durationType === 'time' 
      ? timeToSeconds(currentInterval.duration)
      : parseFloat(currentInterval.duration) * 1000; // Convert km to meters for now
    
    if (durationS <= 0) return;

    // Calculate start offset
    const totalDuration = formData.intervals.reduce((sum, interval) => sum + interval.durationS, 0);
    
    // Convert intensity to appropriate format
    let targetPowerW = null;
    let targetPaceSPerKm = null;
    
    if (formData.sport === 'bike' && currentInterval.intensity) {
      targetPowerW = parseInt(currentInterval.intensity);
    } else if ((formData.sport === 'run' || formData.sport === 'swim') && currentInterval.intensity) {
      targetPaceSPerKm = paceToSeconds(currentInterval.intensity);
    }

    const newInterval = {
      kind: currentInterval.kind,
      seq: formData.intervals.length + 1,
      startOffsetS: totalDuration,
      durationS: durationS,
      targetPowerW: targetPowerW,
      targetPaceSPerKm: targetPaceSPerKm,
      targetLactateMin: parseFloat(currentInterval.targetLactateMin) || null,
      targetLactateMax: parseFloat(currentInterval.targetLactateMax) || null
    };

    console.log('➕ Adding interval:', newInterval);
    setFormData(prev => ({
      ...prev,
      intervals: [...prev.intervals, newInterval]
    }));
    
    // Reset form for next interval
    setCurrentInterval({
      kind: currentInterval.kind === 'work' ? 'rest' : 'work', // Alternate work/rest
      durationType: 'time',
      duration: '3:00',
      intensity: '',
      targetLactateMin: '',
      targetLactateMax: ''
    });
  };

  const removeInterval = (index) => {
    setFormData(prev => ({
      ...prev,
      intervals: prev.intervals.filter((_, i) => i !== index)
    }));
  };

  const addPresetTemplate = (template) => {
    const templates = {
      pyramid: [
        { kind: 'work', durationType: 'time', duration: '3:00', intensity: '4:00', targetLactateMin: 2.0, targetLactateMax: 3.0 },
        { kind: 'rest', durationType: 'time', duration: '2:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '5:00', intensity: '3:45', targetLactateMin: 2.5, targetLactateMax: 3.5 },
        { kind: 'rest', durationType: 'time', duration: '2:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '7:00', intensity: '3:30', targetLactateMin: 3.0, targetLactateMax: 4.0 },
        { kind: 'rest', durationType: 'time', duration: '2:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '5:00', intensity: '3:45', targetLactateMin: 2.5, targetLactateMax: 3.5 },
        { kind: 'rest', durationType: 'time', duration: '2:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '3:00', intensity: '4:00', targetLactateMin: 2.0, targetLactateMax: 3.0 }
      ],
      threshold: [
        { kind: 'work', durationType: 'time', duration: '8:00', intensity: '3:45', targetLactateMin: 3.0, targetLactateMax: 4.0 },
        { kind: 'rest', durationType: 'time', duration: '3:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '8:00', intensity: '3:45', targetLactateMin: 3.0, targetLactateMax: 4.0 },
        { kind: 'rest', durationType: 'time', duration: '3:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '8:00', intensity: '3:45', targetLactateMin: 3.0, targetLactateMax: 4.0 },
        { kind: 'rest', durationType: 'time', duration: '3:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '8:00', intensity: '3:45', targetLactateMin: 3.0, targetLactateMax: 4.0 }
      ],
      intervals: [
        { kind: 'work', durationType: 'time', duration: '3:00', intensity: '3:15', targetLactateMin: 4.0, targetLactateMax: 6.0 },
        { kind: 'rest', durationType: 'time', duration: '2:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '3:00', intensity: '3:15', targetLactateMin: 4.0, targetLactateMax: 6.0 },
        { kind: 'rest', durationType: 'time', duration: '2:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '3:00', intensity: '3:15', targetLactateMin: 4.0, targetLactateMax: 6.0 },
        { kind: 'rest', durationType: 'time', duration: '2:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '3:00', intensity: '3:15', targetLactateMin: 4.0, targetLactateMax: 6.0 },
        { kind: 'rest', durationType: 'time', duration: '2:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '3:00', intensity: '3:15', targetLactateMin: 4.0, targetLactateMax: 6.0 },
        { kind: 'rest', durationType: 'time', duration: '2:00', intensity: '', targetLactateMin: '', targetLactateMax: '' },
        { kind: 'work', durationType: 'time', duration: '3:00', intensity: '3:15', targetLactateMin: 4.0, targetLactateMax: 6.0 }
      ]
    };

    const templateIntervals = templates[template];
    if (!templateIntervals) return;

    // Clear existing intervals
    setFormData(prev => ({
      ...prev,
      intervals: []
    }));

    // Add template intervals one by one
    templateIntervals.forEach((templateInterval, index) => {
      setTimeout(() => {
        const durationS = timeToSeconds(templateInterval.duration);
        const totalDuration = formData.intervals.reduce((sum, interval) => sum + interval.durationS, 0);
        
        let targetPowerW = null;
        let targetPaceSPerKm = null;
        
        if (formData.sport === 'bike' && templateInterval.intensity) {
          targetPowerW = parseInt(templateInterval.intensity);
        } else if ((formData.sport === 'run' || formData.sport === 'swim') && templateInterval.intensity) {
          targetPaceSPerKm = paceToSeconds(templateInterval.intensity);
        }

        const newInterval = {
          kind: templateInterval.kind,
          seq: index + 1,
          startOffsetS: totalDuration,
          durationS: durationS,
          targetPowerW: targetPowerW,
          targetPaceSPerKm: targetPaceSPerKm,
          targetLactateMin: templateInterval.targetLactateMin || null,
          targetLactateMax: templateInterval.targetLactateMax || null
        };

        setFormData(prev => ({
          ...prev,
          intervals: [...prev.intervals, newInterval]
        }));
      }, index * 100); // Small delay for visual effect
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('📝 Form submitted with data:', formData);
    onSubmit(formData);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto"
    >
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Create Lactate Session</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Session Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Session Title
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              placeholder="e.g., Threshold Training Session"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sport
            </label>
            <select
              name="sport"
              value={formData.sport}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="run">Running</option>
              <option value="bike">Cycling</option>
              <option value="swim">Swimming</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Describe your training session goals and focus..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Time
            </label>
            <input
              type="datetime-local"
              name="startTime"
              value={formData.startTime}
              onChange={handleInputChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temperature (°C)
            </label>
            <input
              type="number"
              name="envTempC"
              value={formData.envTempC}
              onChange={handleInputChange}
              step="0.1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Altitude (m)
            </label>
            <input
              type="number"
              name="altitudeM"
              value={formData.altitudeM}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Preset Templates */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Templates</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <button
              type="button"
              onClick={() => addPresetTemplate('pyramid')}
              className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="font-medium text-gray-800">Pyramid Workout</div>
              <div className="text-sm text-gray-600 mt-1">3-5-7-5-3 min intervals</div>
            </button>
            
            <button
              type="button"
              onClick={() => addPresetTemplate('threshold')}
              className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="font-medium text-gray-800">Threshold Session</div>
              <div className="text-sm text-gray-600 mt-1">4x8 min @ threshold</div>
            </button>
            
            <button
              type="button"
              onClick={() => addPresetTemplate('intervals')}
              className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="font-medium text-gray-800">VO2 Max Intervals</div>
              <div className="text-sm text-gray-600 mt-1">6x3 min @ VO2 max</div>
            </button>
          </div>
        </div>

        {/* Repeat Intervals */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Repeat Intervals</h3>
          
          <div className="bg-blue-50 p-4 rounded-lg mb-4">
            <div className="flex items-center space-x-4 mb-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={repeatSettings.enabled}
                  onChange={(e) => setRepeatSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Enable Repeat Mode</span>
              </label>
              
              {repeatSettings.enabled && (
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Repeat:</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={repeatSettings.count}
                    onChange={(e) => setRepeatSettings(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <span className="text-sm text-gray-600">times</span>
                </div>
              )}
            </div>
            
            {repeatSettings.enabled && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Work Interval */}
                <div className="bg-white p-4 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-gray-800 mb-3 flex items-center">
                    <span className="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
                    Work Interval
                  </h4>
                  
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Duration Type</label>
                        <select
                          value={repeatSettings.workInterval.durationType}
                          onChange={(e) => setRepeatSettings(prev => ({
                            ...prev,
                            workInterval: { ...prev.workInterval, durationType: e.target.value }
                          }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="time">Time</option>
                          <option value="distance">Distance</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {repeatSettings.workInterval.durationType === 'time' ? 'Duration (MM:SS)' : 'Distance (km)'}
                        </label>
                        <input
                          type="text"
                          value={repeatSettings.workInterval.duration}
                          onChange={(e) => setRepeatSettings(prev => ({
                            ...prev,
                            workInterval: { ...prev.workInterval, duration: e.target.value }
                          }))}
                          placeholder={repeatSettings.workInterval.durationType === 'time' ? '3:00' : '1.0'}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {formData.sport === 'bike' ? 'Power (W)' : 'Pace (MM:SS/km)'}
                      </label>
                      <input
                        type="text"
                        value={repeatSettings.workInterval.intensity}
                        onChange={(e) => setRepeatSettings(prev => ({
                          ...prev,
                          workInterval: { ...prev.workInterval, intensity: e.target.value }
                        }))}
                        placeholder={formData.sport === 'bike' ? '250' : '4:00'}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Target Lactate Min</label>
                        <input
                          type="number"
                          step="0.1"
                          value={repeatSettings.workInterval.targetLactateMin}
                          onChange={(e) => setRepeatSettings(prev => ({
                            ...prev,
                            workInterval: { ...prev.workInterval, targetLactateMin: e.target.value }
                          }))}
                          placeholder="2.0"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Target Lactate Max</label>
                        <input
                          type="number"
                          step="0.1"
                          value={repeatSettings.workInterval.targetLactateMax}
                          onChange={(e) => setRepeatSettings(prev => ({
                            ...prev,
                            workInterval: { ...prev.workInterval, targetLactateMax: e.target.value }
                          }))}
                          placeholder="3.0"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Rest Interval */}
                <div className="bg-white p-4 rounded-lg border border-green-200">
                  <h4 className="font-medium text-gray-800 mb-3 flex items-center">
                    <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                    Rest Interval
                  </h4>
                  
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Duration Type</label>
                        <select
                          value={repeatSettings.restInterval.durationType}
                          onChange={(e) => setRepeatSettings(prev => ({
                            ...prev,
                            restInterval: { ...prev.restInterval, durationType: e.target.value }
                          }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        >
                          <option value="time">Time</option>
                          <option value="distance">Distance</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {repeatSettings.restInterval.durationType === 'time' ? 'Duration (MM:SS)' : 'Distance (km)'}
                        </label>
                        <input
                          type="text"
                          value={repeatSettings.restInterval.duration}
                          onChange={(e) => setRepeatSettings(prev => ({
                            ...prev,
                            restInterval: { ...prev.restInterval, duration: e.target.value }
                          }))}
                          placeholder={repeatSettings.restInterval.durationType === 'time' ? '2:00' : '0.5'}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Target Lactate Min</label>
                        <input
                          type="number"
                          step="0.1"
                          value={repeatSettings.restInterval.targetLactateMin}
                          onChange={(e) => setRepeatSettings(prev => ({
                            ...prev,
                            restInterval: { ...prev.restInterval, targetLactateMin: e.target.value }
                          }))}
                          placeholder="1.0"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Target Lactate Max</label>
                        <input
                          type="number"
                          step="0.1"
                          value={repeatSettings.restInterval.targetLactateMax}
                          onChange={(e) => setRepeatSettings(prev => ({
                            ...prev,
                            restInterval: { ...prev.restInterval, targetLactateMax: e.target.value }
                          }))}
                          placeholder="2.0"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {repeatSettings.enabled && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={addRepeatIntervals}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add {repeatSettings.count} Work + {repeatSettings.count - 1} Rest Intervals
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Interval Configuration */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Intervals</h3>
          
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type
                </label>
                <select
                  name="kind"
                  value={currentInterval.kind}
                  onChange={handleIntervalChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="work">Work</option>
                  <option value="rest">Rest</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duration Type
                </label>
                <select
                  name="durationType"
                  value={currentInterval.durationType}
                  onChange={handleIntervalChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="time">Time (MM:SS)</option>
                  <option value="distance">Distance (km)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {currentInterval.durationType === 'time' ? 'Duration (MM:SS)' : 'Distance (km)'}
                </label>
                <input
                  type="text"
                  name="duration"
                  value={currentInterval.duration}
                  onChange={handleIntervalChange}
                  placeholder={currentInterval.durationType === 'time' ? '3:00' : '1.0'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {formData.sport === 'bike' ? 'Power (W)' : 
                   formData.sport === 'run' ? 'Pace (MM:SS/km)' : 
                   'Pace (MM:SS/100m)'}
                </label>
                <input
                  type="text"
                  name="intensity"
                  value={currentInterval.intensity}
                  onChange={handleIntervalChange}
                  placeholder={formData.sport === 'bike' ? '250' : '4:00'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Lactate Min (mmol/L)
                </label>
                <input
                  type="number"
                  name="targetLactateMin"
                  value={currentInterval.targetLactateMin}
                  onChange={handleIntervalChange}
                  step="0.1"
                  placeholder="2.0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Lactate Max (mmol/L)
                </label>
                <input
                  type="number"
                  name="targetLactateMax"
                  value={currentInterval.targetLactateMax}
                  onChange={handleIntervalChange}
                  step="0.1"
                  placeholder="3.0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <button
              type="button"
              onClick={addInterval}
              className="bg-blue-500 text-white px-6 py-2 rounded-md hover:bg-blue-600 transition-colors font-medium"
            >
              + Add Interval
            </button>
          </div>
        </div>

        {/* Added Intervals */}
        {formData.intervals.length > 0 && (
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Workout Structure</h3>
            <div className="space-y-3">
              {formData.intervals.map((interval, index) => (
                <motion.div 
                  key={index} 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between bg-white border border-gray-200 p-4 rounded-lg shadow-sm"
                >
                  <div className="flex items-center space-x-6">
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      interval.kind === 'work' 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {interval.kind === 'work' ? '🔥 Work' : '💚 Rest'}
                    </div>
                    
                    <div className="text-lg font-semibold text-gray-800">
                      {secondsToTime(interval.durationS)}
                    </div>
                    
                    {interval.targetPowerW && (
                      <div className="text-gray-600">
                        <span className="font-medium">{interval.targetPowerW}W</span>
                      </div>
                    )}
                    
                    {interval.targetPaceSPerKm && (
                      <div className="text-gray-600">
                        <span className="font-medium">{secondsToTime(interval.targetPaceSPerKm)}/km</span>
                      </div>
                    )}
                    
                    {interval.targetLactateMin && interval.targetLactateMax && (
                      <div className="text-gray-600">
                        <span className="font-medium">{interval.targetLactateMin}-{interval.targetLactateMax} mmol/L</span>
                      </div>
                    )}
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => removeInterval(index)}
                    className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                    title="Remove interval"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              ))}
              
              {/* Total Duration */}
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-blue-800">Total Duration:</span>
                  <span className="text-lg font-bold text-blue-900">
                    {secondsToTime(formData.intervals.reduce((sum, interval) => sum + interval.durationS, 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-4 pt-6 border-t">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Create Session
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default LactateSessionForm;
