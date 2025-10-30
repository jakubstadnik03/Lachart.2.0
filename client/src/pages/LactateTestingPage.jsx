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
import { saveLactateSession } from '../services/api';
import deviceConnectivity from '../services/deviceConnectivity';
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  ClockIcon,
  ChartBarIcon,
  PlusIcon
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
    timestamp: Date.now()
  });

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

  // Refs for intervals
  const intervalTimerRef = useRef(null);
  const dataCollectionIntervalRef = useRef(null);
  const testTimerRef = useRef(null);
  const countdownRef = useRef(null);

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

  // Data collection
  const collectDataPoint = useCallback(() => {
    const dataPoint = {
      ...liveData,
      timestamp: Date.now(),
      step: currentStep,
      intervalTime: intervalTimer,
      totalTime: totalTestTime
    };
    setHistoricalData(prev => [...prev, dataPoint]);
  }, [liveData, currentStep, intervalTimer, totalTestTime]);

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
          addNotification('Interval completed. Ready for recovery.', 'info');
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

    // Start interval timer
    startIntervalTimer();

    // Start total test timer
    testTimerRef.current = setInterval(() => {
      setTotalTestTime(prev => prev + 1);
    }, 1000);

    // Start data collection (collect every second, including during recovery)
    dataCollectionIntervalRef.current = setInterval(() => {
      // Only collect data during work or recovery phases, not during countdown
      if (phase === 'work' || phase === 'recovery') {
        collectDataPoint();
      }
    }, 1000);

    addNotification('Test started', 'success');
  };

  // Pause test
  const handlePauseTest = () => {
    setTestState('paused');
    if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    if (testTimerRef.current) clearInterval(testTimerRef.current);
    if (dataCollectionIntervalRef.current) clearInterval(dataCollectionIntervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    addNotification('Test paused', 'info');
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
    
    // Resume data collection
    dataCollectionIntervalRef.current = setInterval(() => {
      if (phase === 'work' || phase === 'recovery') {
        collectDataPoint();
      }
    }, 1000);
    
    addNotification('Test resumed', 'success');
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
    addNotification('Test completed', 'success');
  };

  // Add lactate value and BORG
  const handleAddLactate = (lactateValue, borgValue) => {
    const currentStepData = protocol.steps[currentStep];
    const avgPower = historicalData
      .filter(d => d.step === currentStep)
      .reduce((sum, d) => sum + (d.power || 0), 0) / (historicalData.filter(d => d.step === currentStep).length || 1);

    setLactateValues(prev => [...prev, {
      step: currentStep + 1,
      power: avgPower || currentStepData?.targetPower || 0,
      lactate: parseFloat(lactateValue),
      borg: borgValue ? parseFloat(borgValue) : null,
      time: totalTestTime
    }]);

    setShowLactateModal(false);
    addNotification('Lactate value and BORG added', 'success');
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
    setShowLactateModal(true);
    
    addNotification('Interval ended. Enter lactate value.', 'info');
  };

  // Start next interval (after recovery)
  const handleStartInterval = () => {
    if (testState !== 'running' || phase !== 'recovery') return;
    
    // Stop any recovery timer
    if (intervalTimerRef.current) {
      clearInterval(intervalTimerRef.current);
      intervalTimerRef.current = null;
    }
    
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
            setCurrentStep(prevStep => prevStep + 1);
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
    
    addNotification('Starting interval in 3 seconds...', 'info');
  };

  // Save test session
  const handleSaveTest = async () => {
    try {
      const sessionData = {
        athleteId: user._id,
        startTime: new Date(Date.now() - totalTestTime * 1000).toISOString(),
        endTime: new Date().toISOString(),
        protocol: protocol,
        deviceData: historicalData,
        lactateValues: lactateValues,
        testDuration: totalTestTime,
        currentStep: currentStep
      };

      await saveLactateSession(sessionData);
      addNotification('Test session saved successfully', 'success');
    } catch (error) {
      console.error('Error saving test:', error);
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

  // Update data collection based on phase
  useEffect(() => {
    if (dataCollectionIntervalRef.current) {
      clearInterval(dataCollectionIntervalRef.current);
    }
    
    if (testState === 'running') {
      dataCollectionIntervalRef.current = setInterval(() => {
        // Only collect data during work or recovery phases, not during countdown
        if (phase === 'work' || phase === 'recovery') {
          collectDataPoint();
        }
      }, 1000);
    }
    
    return () => {
      if (dataCollectionIntervalRef.current) {
        clearInterval(dataCollectionIntervalRef.current);
      }
    };
  }, [phase, testState, collectDataPoint]);

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
      <div className="max-w-7xl mx-auto">
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

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Device Connection & Interval Setup */}
          <div className="lg:col-span-1 space-y-6">
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
                  });
                  
                  if (connected) {
                    addNotification(`${deviceType} connected successfully`, 'success');
                  } else {
                    // Connection failed
                    console.log('Web Bluetooth connection failed');
                    addNotification('Failed to connect to device. Please check if your device is turned on and in pairing mode.', 'error');
                  }
                } catch (error) {
                  console.error('Error connecting to device:', error);
                  addNotification(`Failed to connect: ${error.message}`, 'error');
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
                  
                  addNotification(`${deviceType} disconnected`, 'success');
                } catch (error) {
                  console.error('Error disconnecting device:', error);
                  addNotification(`Error disconnecting ${deviceType}`, 'error');
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

          {/* Right Column - Live Dashboard & Charts */}
          <div className="lg:col-span-2 space-y-6">
            <LiveDashboard
              liveData={liveData}
              devices={devices}
              testState={testState}
              historicalData={historicalData}
            />

            <LactateChart
              lactateValues={lactateValues}
              historicalData={historicalData}
              protocol={protocol}
            />
          </div>
        </div>

        {/* Lactate Entry Modal */}
        {showLactateModal && (
          <LactateEntryModal
            isOpen={showLactateModal}
            onClose={() => setShowLactateModal(false)}
            onSubmit={handleAddLactate}
            currentStep={currentStep + 1}
            suggestedPower={currentStepData?.targetPower || 0}
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
      </div>
    </div>
  );
};

export default LactateTestingPage;

