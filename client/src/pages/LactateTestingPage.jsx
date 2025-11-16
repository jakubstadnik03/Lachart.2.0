import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthProvider';
import { useNotification } from '../context/NotificationContext';
import DeviceConnectionPanel from '../components/LactateTesting/DeviceConnectionPanel';
import IntervalManager from '../components/LactateTesting/IntervalManager';
import LiveDashboard from '../components/LactateTesting/LiveDashboard';
import LactateEntryModal from '../components/LactateTesting/LactateEntryModal';
import LactateChart from '../components/LactateTesting/LactateChart';
import ProtocolEditModal from '../components/LactateTesting/ProtocolEditModal';
import { saveLactateSession, getLactateSessions, getLactateSessionById, completeLactateSession, downloadLactateSessionFit } from '../services/api';
import deviceConnectivity from '../services/deviceConnectivity';
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  ClockIcon,
  ChartBarIcon,
  PlusIcon,
  ArrowDownTrayIcon as DownloadIcon
} from '@heroicons/react/24/outline';

const LactateTestingPage = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();

  // Test state
  const [testState, setTestState] = useState('idle'); // idle, running, paused, completed
  const [currentStep, setCurrentStep] = useState(0);
  const [intervalTimer, setIntervalTimer] = useState(0);
  const [totalTestTime, setTotalTestTime] = useState(0);
  const [phase, setPhase] = useState('work'); // 'work', 'recovery', 'countdown'
  const [countdown, setCountdown] = useState(0); // Countdown before interval start (3, 2, 1, 0)
  const [recoveryTimer, setRecoveryTimer] = useState(0); // Recovery timer (counts up during recovery)

  // Device connections
  const [devices, setDevices] = useState({
    bikeTrainer: { connected: false, data: null },
    heartRate: { connected: false, data: null },
    moxy: { connected: false, data: null },
    coreTemp: { connected: false, data: null },
    vo2master: { connected: false, data: null }
  });

  // Real-time data streams
  const [liveData, setLiveData] = useState({
    power: 0,
    cadence: 0,
    heartRate: 0,
    smo2: 0,
    thb: 0,
    coreTemp: 0,
    vo2: 0,
    vco2: 0,
    ventilation: 0,
    speed: 0,
    timestamp: Date.now()
  });
  
  // Keep refs in sync with state
  useEffect(() => {
    liveDataRef.current = liveData;
  }, [liveData]);
  
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);
  
  useEffect(() => {
    intervalTimerRef2.current = intervalTimer;
  }, [intervalTimer]);
  
  useEffect(() => {
    totalTestTimeRef.current = totalTestTime;
  }, [totalTestTime]);

  // Historical data for charts
  const [historicalData, setHistoricalData] = useState([]);
  const [lactateValues, setLactateValues] = useState([]); // [{step, power, lactate, borg, time}]

  // Interval protocol
  const [protocol, setProtocol] = useState({
    workDuration: 360, // seconds
    recoveryDuration: 60, // seconds
    steps: [],
    startPower: 100, // watts
    powerIncrement: 20, // watts per step
    maxSteps: 8
  });

  // UI state
  const [showLactateModal, setShowLactateModal] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
  const [showProtocolEdit, setShowProtocolEdit] = useState(false);

  // Previous Lactate Sessions
  const [previousSessions, setPreviousSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Refs for intervals
  const intervalTimerRef = useRef(null);
  const dataCollectionIntervalRef = useRef(null);
  const testTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const recoveryTimerRef = useRef(null);
  const liveDataRef = useRef(liveData);
  const currentStepRef = useRef(currentStep);
  const intervalTimerRef2 = useRef(intervalTimer);
  const totalTestTimeRef = useRef(totalTestTime);

  // Initialize protocol steps
  useEffect(() => {
    const steps = [];
    for (let i = 0; i < protocol.maxSteps; i++) {
      steps.push({
        stepNumber: i + 1,
        targetPower: protocol.startPower + (i * protocol.powerIncrement),
        phase: 'work', // 'work' or 'recovery'
        duration: i === 0 ? protocol.workDuration : protocol.workDuration,
        recoveryDuration: protocol.recoveryDuration
      });
    }
    setProtocol(prev => ({ ...prev, steps }));
  }, [protocol.startPower, protocol.powerIncrement, protocol.maxSteps, protocol.workDuration, protocol.recoveryDuration]);

  // Data collection - collect data every second from test start
  const collectDataPoint = useCallback(() => {
    // Always collect data, even if values are 0/null - this creates the curves from the start
    // Use refs to get the latest values (since they update asynchronously)
    setHistoricalData(prev => {
      const currentLiveData = liveDataRef.current;
      const currentTotalTime = totalTestTimeRef.current;
      const dataPoint = {
        ...currentLiveData,
        timestamp: Date.now(),
        step: currentStepRef.current,
        intervalTime: intervalTimerRef2.current,
        totalTime: currentTotalTime
      };
      
      // Debug logging
      if (prev.length % 10 === 0 || prev.length < 5) {
        console.log(`[collectDataPoint] Collected data point #${prev.length + 1}:`, {
          totalTime: currentTotalTime,
          power: currentLiveData.power,
          heartRate: currentLiveData.heartRate,
          cadence: currentLiveData.cadence,
          speed: currentLiveData.speed
        });
      }
      
      // Add new data point to the end
      return [...prev, dataPoint];
    });
  }, []);

  // Start interval timer for current phase
  const startIntervalTimer = useCallback(() => {
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
    }
    
    intervalTimerRef.current = setInterval(() => {
      setIntervalTimer(prev => {
        const currentStepData = protocol.steps[currentStep];
        const maxTime = currentStepData?.duration || 360;
        
        if (prev + 1 >= maxTime) {
          // Interval finished, move to recovery
          setPhase('recovery');
          setIntervalTimer(0);
          setRecoveryTimer(0);
          // Start recovery timer
          if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);
          recoveryTimerRef.current = setInterval(() => {
            setRecoveryTimer(prev => prev + 1);
          }, 1000);
          // Automatically open lactate entry modal
          setTimeout(() => {
            setShowLactateModal(true);
            addNotification('Interval completed. Enter lactate value.', 'info');
          }, 0);
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
  }, [currentStep, protocol.steps, addNotification]);

  // Start test
  const handleStartTest = () => {
    if (testState === 'idle' && showCalibration) {
      setShowCalibration(false);
    }

    setTestState('running');
    setCurrentStep(0);
    setIntervalTimer(0);
    setTotalTestTime(0);
    setHistoricalData([]);
    setLactateValues([]);
    setPhase('work');
    setCountdown(0);

    // Set initial power target on trainer
    const firstStep = protocol.steps[0];
    if (firstStep && devices.bikeTrainer?.connected) {
      // Wait a bit for connection to stabilize, then set power
      setTimeout(async () => {
        try {
          await deviceConnectivity.setPower('bikeTrainer', firstStep.targetPower);
          console.log(`Initial power set to ${firstStep.targetPower}W on trainer`);
        } catch (err) {
          console.error('Failed to set initial power on trainer:', err);
        }
      }, 500);
    }

    // Start interval timer
    startIntervalTimer();

    // Start total test timer
    testTimerRef.current = setInterval(() => {
      setTotalTestTime(prev => prev + 1);
    }, 1000);

    // Start data collection immediately and then every second
    // Collect first data point immediately (at time 0)
    setTimeout(() => {
      collectDataPoint();
      console.log('[handleStartTest] First data point collected');
    }, 100);
    
    // Then collect data every second throughout the entire test (including countdown)
    dataCollectionIntervalRef.current = setInterval(() => {
      // Collect data throughout the entire test (including countdown)
      collectDataPoint();
    }, 1000);
    
    console.log('[handleStartTest] Data collection started, interval:', dataCollectionIntervalRef.current);

    // Use setTimeout to avoid setState during render
    setTimeout(() => {
      addNotification('Test started', 'success');
    }, 0);
  };

  // Pause test
  const handlePauseTest = () => {
    setTestState('paused');
    if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    if (testTimerRef.current) clearInterval(testTimerRef.current);
    if (dataCollectionIntervalRef.current) clearInterval(dataCollectionIntervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);
    setTimeout(() => {
      addNotification('Test paused', 'info');
    }, 0);
  };

  // Resume test
  const handleResumeTest = () => {
    setTestState('running');
    
    // Resume interval timer if in work phase
    if (phase === 'work') {
      startIntervalTimer();
    }
    
    // Always resume total test timer
    testTimerRef.current = setInterval(() => {
      setTotalTestTime(prev => prev + 1);
    }, 1000);
    
    // Resume data collection (collect every second from test start)
    dataCollectionIntervalRef.current = setInterval(() => {
      // Collect data throughout the entire test
      collectDataPoint();
    }, 1000);
    
    setTimeout(() => {
      addNotification('Test resumed', 'success');
    }, 0);
  };

  // Stop test
  const handleStopTest = () => {
    setTestState('completed');
    setPhase('work');
    setCountdown(0);
    if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    if (testTimerRef.current) clearInterval(testTimerRef.current);
    if (dataCollectionIntervalRef.current) clearInterval(dataCollectionIntervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setTimeout(() => {
      addNotification('Test completed', 'success');
    }, 0);
  };

  // Add lactate value and BORG
  const handleAddLactate = (lactateValue, borgValue, manualPower = null) => {
    const currentStepData = protocol.steps[currentStep];
    const avgPower = historicalData
      .filter(d => d.step === currentStep)
      .reduce((sum, d) => sum + (d.power || 0), 0) / (historicalData.filter(d => d.step === currentStep).length || 1);

    // Use manual power if provided, otherwise use average from historical data, otherwise use target power
    const finalPower = manualPower !== null ? manualPower : (avgPower || currentStepData?.targetPower || 0);

    setLactateValues(prev => [...prev, {
      step: currentStep + 1,
      power: finalPower,
      lactate: parseFloat(lactateValue),
      borg: borgValue ? parseFloat(borgValue) : null,
      time: totalTestTime
    }]);

    setShowLactateModal(false);
    setTimeout(() => {
      addNotification('Lactate value and BORG added', 'success');
    }, 0);
  };

  // Skip/End current interval early
  const handleSkipInterval = () => {
    if (testState !== 'running' || phase !== 'work') return;
    
    // Stop current interval timer
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    
    // Switch to recovery phase (data collection continues)
    setPhase('recovery');
    setIntervalTimer(0);
    
    // Show lactate entry modal
    setTimeout(() => {
      setShowLactateModal(true);
      addNotification('Interval ended. Enter lactate value.', 'info');
    }, 0);
  };

  // Start next interval (after recovery)
  const handleStartInterval = () => {
    if (testState !== 'running' || phase !== 'recovery') return;
    
    // Stop any recovery timer
    if (recoveryTimerRef.current) {
      clearInterval(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    setRecoveryTimer(0);
    
    // Start 3-second countdown
    setPhase('countdown');
    setCountdown(3);
    setIntervalTimer(0);
    
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Countdown finished, start interval
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          
          // Move to next step if available, otherwise stay on current
          if (currentStep < protocol.steps.length - 1) {
            setCurrentStep(prevStep => {
              const newStep = prevStep + 1;
              // Set power target on trainer when step changes
              const nextStepData = protocol.steps[newStep];
              if (nextStepData && devices.bikeTrainer?.connected) {
                setTimeout(async () => {
                  try {
                    await deviceConnectivity.setPower('bikeTrainer', nextStepData.targetPower);
                    console.log(`Power set to ${nextStepData.targetPower}W for step ${newStep + 1}`);
                  } catch (err) {
                    console.error('Failed to set power on trainer:', err);
                  }
                }, 100);
              }
              return newStep;
            });
          } else {
            // Even if staying on current step, update power if needed
            const currentStepData = protocol.steps[currentStep];
            if (currentStepData && devices.bikeTrainer?.connected) {
              setTimeout(async () => {
                try {
                  await deviceConnectivity.setPower('bikeTrainer', currentStepData.targetPower);
                  console.log(`Power set to ${currentStepData.targetPower}W for current step`);
                } catch (err) {
                  console.error('Failed to set power on trainer:', err);
                }
              }, 100);
            }
          }
          
          // Start work phase
          setPhase('work');
          setIntervalTimer(0);
          
          // Start interval timer
          startIntervalTimer();
          
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    setTimeout(() => {
      addNotification('Starting interval in 3 seconds...', 'info');
    }, 0);
  };

  // Save test session
  const handleSaveTest = async () => {
    try {
      const startTime = new Date(Date.now() - totalTestTime * 1000);
      const endTime = new Date();
      
      // Generate FIT file data from historical data
      const fitFileData = {
        sport: 'bike', // Default to bike, could be determined from protocol
        totalElapsedTime: totalTestTime,
        totalDistance: historicalData.reduce((sum, d) => sum + (d.speed || 0), 0) * (totalTestTime / historicalData.length) || 0,
        avgSpeed: historicalData.length > 0 
          ? historicalData.reduce((sum, d) => sum + (d.speed || 0), 0) / historicalData.length 
          : 0,
        maxSpeed: historicalData.length > 0 
          ? Math.max(...historicalData.map(d => d.speed || 0)) 
          : 0,
        avgHeartRate: historicalData.length > 0 
          ? historicalData.reduce((sum, d) => sum + (d.heartRate || 0), 0) / historicalData.length 
          : 0,
        maxHeartRate: historicalData.length > 0 
          ? Math.max(...historicalData.map(d => d.heartRate || 0)) 
          : 0,
        avgPower: historicalData.length > 0 
          ? historicalData.reduce((sum, d) => sum + (d.power || 0), 0) / historicalData.length 
          : 0,
        maxPower: historicalData.length > 0 
          ? Math.max(...historicalData.map(d => d.power || 0)) 
          : 0,
        records: historicalData.map((m, index) => ({
          timestamp: new Date(startTime.getTime() + (m.totalTime || index) * 1000),
          power: m.power || 0,
          heartRate: m.heartRate || 0,
          speed: m.speed || 0,
          cadence: m.cadence || 0,
          lactate: m.lactate || null
        })),
        laps: protocol.steps.map((step, index) => {
          const stepData = historicalData.filter(d => d.step === index);
          const stepLactate = lactateValues.find(lv => lv.step === index + 1);
          return {
            lapNumber: index + 1,
            startTime: new Date(startTime.getTime() + (stepData[0]?.totalTime || index * protocol.workDuration) * 1000),
            totalElapsedTime: stepData.length > 0 ? stepData.length : protocol.workDuration,
            totalDistance: stepData.reduce((sum, d) => sum + (d.speed || 0), 0) || 0,
            avgSpeed: stepData.length > 0 ? stepData.reduce((sum, d) => sum + (d.speed || 0), 0) / stepData.length : 0,
            avgHeartRate: stepData.length > 0 ? stepData.reduce((sum, d) => sum + (d.heartRate || 0), 0) / stepData.length : 0,
            avgPower: stepData.length > 0 ? stepData.reduce((sum, d) => sum + (d.power || 0), 0) / stepData.length : step.targetPower,
            lactate: stepLactate ? stepLactate.lactate : null
          };
        })
      };

      const sessionData = {
        athleteId: user._id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        protocol: protocol,
        measurements: historicalData,
        lactateValues: lactateValues,
        testDuration: totalTestTime,
        currentStep: currentStep,
        status: 'completed'
      };

      // First create the session
      const response = await saveLactateSession(sessionData);
      const sessionId = response.session?._id || response.data?.session?._id || response._id;

      if (sessionId) {
        // Then complete the session with FIT file data
        try {
          await completeLactateSession(sessionId, { fitFileData });
          addNotification('Test session saved successfully with FIT file', 'success');
        } catch (fitError) {
          console.error('Error saving FIT file:', fitError);
          addNotification('Test session saved, but FIT file generation failed', 'warning');
        }
      } else {
        addNotification('Test session saved successfully', 'success');
      }
    } catch (error) {
      console.error('Error saving test:', error);
      if (error.response) {
        console.error('Backend error detail:', error.response.data);
      }
      addNotification('Failed to save test session', 'error');
    }
  };

  // Update live data from devices
  const updateDeviceData = useCallback((deviceType, data) => {
    setDevices(prev => ({
      ...prev,
      [deviceType]: {
        ...prev[deviceType],
        connected: true,
        data
      }
    }));

    // Update live data stream
    setLiveData(prev => ({
      ...prev,
      ...data,
      timestamp: Date.now()
    }));
  }, []);

  // Previous Lactate Sessions
  useEffect(() => {
    // Load all lactate sessions for user
    const loadSessions = async () => {
      if (!user?._id) return;
      try {
        setLoadingSessions(true);
        const resp = await getLactateSessions(user._id);
        const list = Array.isArray(resp.data) ? resp.data : (resp.data?.sessions || resp.data || []);
        setPreviousSessions(list);
        if (list.length > 0) setSelectedSessionId(list[0]._id);
      } catch (e) {
        setPreviousSessions([]);
      } finally {
        setLoadingSessions(false);
      }
    };
    loadSessions();
  }, [user?._id]);

  useEffect(() => {
    // Load details for selected session
    const loadSession = async () => {
      if (!selectedSessionId) return setSelectedSession(null);
      try {
        setLoadingSessions(true);
        const resp = await getLactateSessionById(selectedSessionId);
        setSelectedSession(resp.data || resp);
      } catch(e) {
        setSelectedSession(null);
      } finally {
        setLoadingSessions(false);
      }
    };
    loadSession();
  }, [selectedSessionId]);

  // Helper: transform lactate session to chart data
  const transformSessionToChartData = (session) => {
    // Prefer FIT file if present
    if (session?.fitFile?.fitData) {
      const fit = session.fitFile.fitData;
      const fitHistorical = Array.isArray(fit.records) ? fit.records.map(r => ({
        power: Number(r.power || 0),
        heartRate: Number(r.heartRate || 0),
        timestamp: r.timestamp ? new Date(r.timestamp).getTime() : Date.now()
      })) : [];
      const fitLactate = Array.isArray(fit.laps) ? fit.laps.filter(l => typeof l.lactate === 'number').map((l, i) => ({
        step: l.lapNumber || i+1,
        power: Number(l.avgPower || 0),
        lactate: Number(l.lactate),
        time: (l.totalElapsedTime||0) * (l.lapNumber||i+1)
      })) : [];
      return { historical: fitHistorical, lactateValues: fitLactate };
    }
    // Else parse realtime measurements
    if (Array.isArray(session?.measurements) && session.measurements.length > 0) {
      const mesHistorical = session.measurements.map(m => ({
        power: Number(m.power || 0),
        heartRate: Number(m.heartRate || 0),
        timestamp: new Date(m.timestamp).getTime() || Date.now()
      }));
      // If measurements have lactate, try to extract based on intervals
      let mesLactate = session.measurements
        .filter(m => typeof m.lactate === 'number')
        .map((m, i) => ({ step: m.interval || i + 1, power: m.power, lactate: m.lactate, time: m.timestamp ? new Date(m.timestamp).getTime() : i * 60 }));
      // Or if explicit intervals, session.results/lactateValues
      if (Array.isArray(session.lactateValues)) mesLactate = session.lactateValues;
      return { historical: mesHistorical, lactateValues: mesLactate };
    }
    return { historical: [], lactateValues: [] };
  };

  // Update data collection based on test state
  // Note: Data collection is started in handleStartTest and handleResumeTest
  // This effect only handles cleanup when test stops
  useEffect(() => {
    if (testState !== 'running' && dataCollectionIntervalRef.current) {
      clearInterval(dataCollectionIntervalRef.current);
      dataCollectionIntervalRef.current = null;
    }
    
    return () => {
      if (dataCollectionIntervalRef.current) {
        clearInterval(dataCollectionIntervalRef.current);
      }
    };
  }, [testState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
      if (testTimerRef.current) clearInterval(testTimerRef.current);
      if (dataCollectionIntervalRef.current) clearInterval(dataCollectionIntervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentStepData = protocol.steps[currentStep] || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-pink-50 p-6">
      <div className=" mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Lactate Threshold Testing</h1>
          <p className="text-gray-600">Real-time testing with connected sensors and devices</p>
        </div>

        {/* Test Controls */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-gray-600" />
                <span className="text-lg font-semibold">Total Time: {formatTime(totalTestTime)}</span>
              </div>
              {testState !== 'idle' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Step {currentStep + 1}/{protocol.steps.length}</span>
                  <span className="text-sm text-gray-600">•</span>
                  {phase === 'countdown' ? (
                    <span className="text-sm font-bold text-primary">Starting in {countdown}...</span>
                  ) : phase === 'recovery' ? (
                    <span className="text-sm text-gray-600">Recovery (data recording)</span>
                  ) : (
                    <span className="text-sm text-gray-600">Interval: {formatTime(intervalTimer)}</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {testState === 'idle' && (
                <>
                  <button
                    onClick={() => setShowCalibration(true)}
                    className="px-4 py-2 bg-white/70 text-gray-700 rounded-xl hover:bg-white/90 border border-white/40 shadow"
                  >
                    Calibrate
                  </button>
                  <button
                    onClick={handleStartTest}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-2 shadow"
                  >
                    <PlayIcon className="w-5 h-5" />
                    Start Test
                  </button>
                </>
              )}
              {testState === 'running' && phase === 'work' && (
                <>
                  <button
                    onClick={handlePauseTest}
                    className="px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 flex items-center gap-2 shadow"
                  >
                    <PauseIcon className="w-5 h-5" />
                    Pause
                  </button>
                  <button
                    onClick={handleSkipInterval}
                    className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 flex items-center gap-2 shadow"
                  >
                    <StopIcon className="w-5 h-5" />
                    End Interval
                  </button>
                  <button
                    onClick={() => setShowLactateModal(true)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 flex items-center gap-2 shadow"
                  >
                    <PlusIcon className="w-5 h-5" />
                    Add Lactate
                  </button>
                  <button
                    onClick={handleStopTest}
                    className="px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 flex items-center gap-2 shadow"
                  >
                    <StopIcon className="w-5 h-5" />
                    Stop Test
                  </button>
                </>
              )}
              {testState === 'running' && phase === 'recovery' && (
                <>
                  <button
                    onClick={handleStartInterval}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-2 shadow"
                  >
                    <PlayIcon className="w-5 h-5" />
                    Start Interval
                  </button>
                  <button
                    onClick={() => setShowLactateModal(true)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 flex items-center gap-2 shadow"
                  >
                    <PlusIcon className="w-5 h-5" />
                    Add Lactate
                  </button>
                  <button
                    onClick={handlePauseTest}
                    className="px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 flex items-center gap-2 shadow"
                  >
                    <PauseIcon className="w-5 h-5" />
                    Pause
                  </button>
                  <button
                    onClick={handleStopTest}
                    className="px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 flex items-center gap-2 shadow"
                  >
                    <StopIcon className="w-5 h-5" />
                    Stop Test
                  </button>
                </>
              )}
              {testState === 'running' && phase === 'countdown' && (
                <>
                  <div className="px-4 py-2 bg-primary text-white rounded-xl flex items-center gap-2 text-xl font-bold shadow">
                    Starting in {countdown}...
                  </div>
                  <button
                    onClick={handleStopTest}
                    className="px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 flex items-center gap-2 shadow"
                  >
                    <StopIcon className="w-5 h-5" />
                    Stop Test
                  </button>
                </>
              )}
              {testState === 'paused' && (
                <>
                  <button
                    onClick={handleResumeTest}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-2 shadow"
                  >
                    <PlayIcon className="w-5 h-5" />
                    Resume
                  </button>
                  <button
                    onClick={handleStopTest}
                    className="px-4 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 flex items-center gap-2 shadow"
                  >
                    <StopIcon className="w-5 h-5" />
                    Stop
                  </button>
                </>
              )}
              {testState === 'completed' && (
                <button
                  onClick={handleSaveTest}
                  className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 flex items-center gap-2 shadow"
                >
                  <ChartBarIcon className="w-5 h-5" />
                  Save Test
                </button>
              )}
            </div>
          </div>

          {/* Current Step Info */}
          {testState !== 'idle' && currentStepData && (
            <div className="mt-4 p-4 bg-white/70 backdrop-blur rounded-2xl border border-white/40">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Current Phase</div>
                  <div className="text-lg font-semibold text-primary">
                    {phase === 'countdown' ? 'Countdown' : phase === 'recovery' ? 'Recovery' : 'Work'}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Target Power</div>
                  <div className="text-lg font-semibold text-primary">
                    {currentStepData.targetPower} W
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Step Duration</div>
                  <div className="text-lg font-semibold text-primary">
                    {formatTime(currentStepData.duration)}
                  </div>
                </div>
              </div>
              {phase === 'countdown' && (
                <div className="mt-2 text-center">
                  <div className="text-4xl font-bold text-primary">{countdown}</div>
                  <div className="text-sm text-gray-600">Starting interval...</div>
                </div>
              )}
              {phase === 'recovery' && (
                <div className="mt-2 text-center">
                  <div className="text-sm text-emerald-600">✓ Recording data during recovery</div>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Device Connection Panel & Interval Protocol - Top, Collapsible */}
        <div className="mb-6 space-y-4">
          <DeviceConnectionPanel
            devices={devices}
            onDeviceConnect={async (deviceType) => {
                console.log('Connecting to device:', deviceType);
                
                // Check if Web Bluetooth is available
                if (!navigator.bluetooth) {
                  // Web Bluetooth not supported
                  console.log('Web Bluetooth not available');
                  addNotification('Web Bluetooth not supported. Please use Chrome, Edge, or Opera browser.', 'error');
                  return;
                }
                
                // Try real Web Bluetooth connection
                try {
                  addNotification(`Connecting to ${deviceType}...`, 'info');
                  const connected = await deviceConnectivity.connectWebBluetooth(deviceType, (data) => {
                    updateDeviceData(deviceType, data);
                    
                    // Check if power is missing for bikeTrainer
                    if (deviceType === 'bikeTrainer' && (data.power === null || data.power === undefined)) {
                      // Power is not available - this is expected for some Tacx trainers that only have CSC Service
                      // We'll show a one-time warning
                      if (!devices.bikeTrainer?.powerWarningShown) {
                        console.warn('Power data is not available from this trainer. Only speed and cadence are available via Bluetooth.');
                        // Note: We'll show this in console, but won't spam notifications
                      }
                    }
                  });
                  
                  if (connected) {
                    setTimeout(() => {
                      addNotification(`${deviceType} connected successfully`, 'success');
                    }, 0);
                    
                    // For bikeTrainer, try to enable ERGO mode and set initial power
                    if (deviceType === 'bikeTrainer') {
                      // Give it a moment to establish connection, then try to set ERGO mode
                      setTimeout(async () => {
                        try {
                          // Check if we can control the trainer (FE-C support)
                          if (deviceConnectivity.supportsErgoMode('bikeTrainer')) {
                            // Trainer supports FE-C control - we can set power
                            setTimeout(() => {
                              addNotification('Trainer supports ERGO mode control. Power can be set from the app.', 'success');
                            }, 0);
                            
                            // Set initial power if test is running or if we have a protocol
                            if (protocol.steps.length > 0) {
                              const initialPower = protocol.steps[0]?.targetPower || protocol.startPower || 100;
                              await deviceConnectivity.setPower('bikeTrainer', initialPower);
                              setTimeout(() => {
                                addNotification(`Initial power set to ${initialPower}W`, 'info');
                              }, 0);
                            }
                          } else {
                            // Trainer doesn't support FE-C control, but check if power reading is available
                            setTimeout(() => {
                              const trainerData = devices.bikeTrainer?.data;
                              if (trainerData && (trainerData.power === null || trainerData.power === undefined)) {
                                addNotification('Note: This trainer does not support ERGO mode control. Power cannot be set automatically. You may need to set it manually on the trainer or use a separate power meter.', 'warning');
                              } else if (trainerData && trainerData.power !== null && trainerData.power !== undefined) {
                                addNotification(`Power reading available: ${trainerData.power.toFixed(0)}W`, 'success');
                              }
                            }, 2000);
                          }
                        } catch (error) {
                          console.error('Error setting up trainer control:', error);
                          setTimeout(() => {
                            addNotification(`Warning: Could not set up trainer control: ${error.message}`, 'warning');
                          }, 0);
                        }
                      }, 1000);
                    }
                  } else {
                    // Connection failed
                    console.log('Web Bluetooth connection failed');
                    setTimeout(() => {
                      addNotification('Failed to connect to device. Please check if your device is turned on and in pairing mode.', 'error');
                    }, 0);
                  }
                } catch (error) {
                  console.error('Error connecting to device:', error);
                  setTimeout(() => {
                    addNotification(`Failed to connect: ${error.message}`, 'error');
                  }, 0);
                }
              }}
              onDeviceDisconnect={async (deviceType) => {
                try {
                  // Stop simulated data first
                  deviceConnectivity.stopSimulatedData(deviceType);
                  
                  // Then disconnect real device
                  await deviceConnectivity.disconnectDevice(deviceType);
                  
                  // Update UI state
                  setDevices(prev => ({
                    ...prev,
                    [deviceType]: { connected: false, data: null }
                  }));
                  
                  setTimeout(() => {
                    addNotification(`${deviceType} disconnected`, 'success');
                  }, 0);
                } catch (error) {
                  console.error('Error disconnecting device:', error);
                  setTimeout(() => {
                    addNotification(`Error disconnecting ${deviceType}`, 'error');
                  }, 0);
                }
              }}
          />
          
          <IntervalManager
            protocol={protocol}
            onProtocolChange={setProtocol}
            testState={testState}
            onEditProtocol={() => setShowProtocolEdit(true)}
          />
        </div>

        {/* Main Content - Live Dashboard & Charts */}
        <div className="space-y-6">
            <LiveDashboard
              liveData={liveData}
              devices={devices}
              testState={testState}
              historicalData={historicalData}
              intervalTimer={intervalTimer}
              protocol={protocol}
              currentStep={currentStep}
            />

            <LactateChart
              lactateValues={lactateValues}
              historicalData={historicalData}
              protocol={protocol}
            />
        </div>

        {/* Lactate Entry Modal */}
        {showLactateModal && (
          <LactateEntryModal
            isOpen={showLactateModal}
            onClose={() => setShowLactateModal(false)}
            onSubmit={handleAddLactate}
            currentStep={currentStep + 1}
            suggestedPower={currentStepData?.targetPower || 0}
            allowManualPower={devices.bikeTrainer?.connected && (devices.bikeTrainer?.data?.power === null || devices.bikeTrainer?.data?.power === undefined)}
            actualPower={historicalData
              .filter(d => d.step === currentStep)
              .reduce((sum, d) => sum + (d.power || 0), 0) / (historicalData.filter(d => d.step === currentStep).length || 1) || null}
            currentHeartRate={liveData.heartRate || devices.heartRate?.data?.heartRate || null}
            recoveryTime={recoveryTimer}
            onStartNextInterval={handleStartInterval}
            testState={testState}
            phase={phase}
            onCompleteInterval={() => {
              // Move to next step after adding lactate
              if (currentStep < protocol.steps.length - 1) {
                setCurrentStep(prev => prev + 1);
                setIntervalTimer(0);
              } else {
                handleStopTest();
              }
            }}
          />
        )}

        {/* Protocol Edit Modal */}
        {showProtocolEdit && (
          <ProtocolEditModal
            isOpen={showProtocolEdit}
            onClose={() => setShowProtocolEdit(false)}
            protocol={protocol}
            onProtocolUpdate={(updatedProtocol) => {
              // Update protocol
              setProtocol(updatedProtocol);
              
              // If test is running and we're beyond the protocol, adjust current step
              if (testState === 'running' && currentStep >= updatedProtocol.steps.length) {
                setCurrentStep(updatedProtocol.steps.length - 1);
              }
              
              // If interval timer is running, check if we need to adjust based on new duration
              if (testState === 'running' && intervalTimerRef.current) {
                const currentStepData = updatedProtocol.steps[currentStep];
                if (currentStepData) {
                  const maxTime = currentStepData.phase === 'work' 
                    ? currentStepData.duration 
                    : currentStepData.recoveryDuration || 60;
                  
                  // Reset timer if current interval time exceeds new duration
                  if (intervalTimer >= maxTime) {
                    setIntervalTimer(maxTime - 1);
                  }
                }
              }
              
              setShowProtocolEdit(false);
              addNotification('Protocol updated successfully', 'success');
            }}
            testState={testState}
            currentStep={currentStep}
          />
        )}

        {/* Calibration Modal */}
        {showCalibration && testState === 'idle' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            >
              <h2 className="text-xl font-bold mb-4">Device Calibration</h2>
              <p className="text-gray-600 mb-4">
                Calibrate your devices before starting the test. Ensure all sensors are properly positioned and functioning.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCalibration(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 flex-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowCalibration(false);
                    handleStartTest();
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex-1"
                >
                  Start Test
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Previous Testing Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">Previous Lactate Sessions</h2>
            <select className="px-3 py-2 bg-white/80 border border-gray-200 rounded-xl text-sm" value={selectedSessionId} onChange={e => setSelectedSessionId(e.target.value)}>
              {previousSessions.map(s => (
                <option key={s._id} value={s._id}>
                  {new Date(s.completedAt || s.createdAt || s.date).toLocaleString()} • {s.sport || 'test'}
                </option>
              ))}
            </select>
          </div>
          {loadingSessions && <div className="text-sm text-gray-600">Loading previous session…</div>}
          {!loadingSessions && selectedSession && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                  <div className="bg-white/70 rounded-2xl border border-white/40 p-4">
                    <div className="text-sm text-gray-600">Sport</div>
                    <div className="text-xl font-semibold text-primary">{selectedSession.sport ?? '—'}</div>
                  </div>
                  <div className="bg-white/70 rounded-2xl border border-white/40 p-4">
                    <div className="text-sm text-gray-600">Délka</div>
                    <div className="text-xl font-semibold text-primary">{selectedSession.duration ? `${Math.round(selectedSession.duration/60)} min` : '—'}</div>
                  </div>
                  <div className="bg-white/70 rounded-2xl border border-white/40 p-4">
                    <div className="text-sm text-gray-600">Datum</div>
                    <div className="text-xl font-semibold text-primary">{selectedSession.completedAt ? new Date(selectedSession.completedAt).toLocaleString() : (selectedSession.createdAt ? new Date(selectedSession.createdAt).toLocaleString() : '—')}</div>
                  </div>
                </div>
                {selectedSession.fitFile && (
                  <button
                    onClick={async () => {
                      try {
                        const blob = await downloadLactateSessionFit(selectedSession._id);
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = selectedSession.fitFile.originalName || `lactate-session-${selectedSession._id}.fit`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                        addNotification('FIT file downloaded successfully', 'success');
                      } catch (error) {
                        console.error('Error downloading FIT file:', error);
                        addNotification('Failed to download FIT file', 'error');
                      }
                    }}
                    className="ml-4 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 flex items-center gap-2 shadow"
                  >
                    <DownloadIcon className="w-5 h-5" />
                    Download FIT
                  </button>
                )}
              </div>
              <div className="mt-2">
                {/* Transform session data for chart rendering */}
                {(() => {
                  const { historical, lactateValues } = transformSessionToChartData(selectedSession);
                  return (
                    <LactateChart
                      lactateValues={lactateValues}
                      historicalData={historical}
                      protocol={{ steps: [] }}
                    />
                  );
                })()}
              </div>
            </div>
          )}
          {!loadingSessions && previousSessions.length === 0 && <div className="text-sm text-gray-600">No previous sessions found.</div>}
        </motion.div>
      </div>
    </div>
  );
};

export default LactateTestingPage;

