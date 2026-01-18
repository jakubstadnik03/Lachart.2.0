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
import { useTrainer } from '../trainer/react/useTrainer.js';
import { TrainerConnectModal } from '../trainer/react/TrainerConnectModal.jsx';
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  ClockIcon,
  ChartBarIcon,
  PlusIcon,
  ArrowDownTrayIcon as DownloadIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
const LactateTestingPage = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();

  // New Trainer Connectivity System (FTMS/Companion)
  const trainer = useTrainer();
  const [showTrainerModal, setShowTrainerModal] = useState(false);

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
  
  // Interval protocol
  const [protocol, setProtocol] = useState({
    workDuration: 360, // seconds
    recoveryDuration: 60, // seconds
    steps: [],
    startPower: 100, // watts
    powerIncrement: 20, // watts per step
    maxSteps: 8
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

  useEffect(() => {
    testStateRef.current = testState;
  }, [testState]);

  const protocolRef = useRef(protocol);
  useEffect(() => {
    protocolRef.current = protocol;
  }, [protocol]);

  // Historical data for charts
  const [historicalData, setHistoricalData] = useState([]);
  const [lactateValues, setLactateValues] = useState([]); // [{step, power, lactate, borg, time}]

  const handleProtocolSubmit = useCallback((nextProtocol) => {
    setProtocol(nextProtocol);
    setTimeout(() => {
      addNotification('Interval protocol updated', 'success');
    }, 0);
  }, [addNotification]);

  // UI state
  const [showLactateModal, setShowLactateModal] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
  const [showProtocolEdit, setShowProtocolEdit] = useState(false);
  const [mockDataMode, setMockDataMode] = useState(false); // Mock data mode for testing
  // Always use new trainer system - old system removed

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
  const testStateRef = useRef(testState);
  const phaseRef = useRef(phase);
  const mockDeviceIntervalsRef = useRef({}); // For mock data generation per device
  const handleStartIntervalRef = useRef(null);
  
  // Keep phase ref in sync
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Update bikeTrainer device state when trainer connects/disconnects
  useEffect(() => {
    if (trainer.connectedDevice && trainer.status !== 'disconnected') {
      // Update bikeTrainer to show as connected immediately
      setDevices(prev => ({
        ...prev,
        bikeTrainer: {
          connected: true,
          name: trainer.connectedDevice.name, // Store trainer name
          data: prev.bikeTrainer?.data || {
            power: null,
            cadence: null,
            speed: null,
          }
        }
      }));
    } else if (trainer.status === 'disconnected' || !trainer.connectedDevice) {
      // Disconnect bikeTrainer when trainer disconnects
      setDevices(prev => ({
        ...prev,
        bikeTrainer: { connected: false, data: null, name: null }
      }));
    }
  }, [trainer.connectedDevice, trainer.status]);

  // Integrate trainer system telemetry
  useEffect(() => {
    if (!trainer.telemetry) return;

    const telemetry = trainer.telemetry;
    const currentPhase = phaseRef.current;
    
    // Update bikeTrainer device state with telemetry data
    if (trainer.connectedDevice && trainer.status !== 'disconnected') {
      setDevices(prev => ({
        ...prev,
        bikeTrainer: {
          connected: true,
          data: {
            power: telemetry.power || null,
            cadence: telemetry.cadence || null,
            speed: telemetry.speed || null,
          }
        }
      }));

      // Update liveData with trainer telemetry
      setLiveData(prev => {
        const updated = { ...prev, timestamp: Date.now() };
        
        // During recovery phase, force power/cadence/speed to 0
        if (currentPhase === 'recovery') {
          updated.power = 0;
          updated.cadence = 0;
          updated.speed = 0;
        } else {
          if (telemetry.power !== undefined && telemetry.power !== null) {
            updated.power = telemetry.power;
          }
          if (telemetry.cadence !== undefined && telemetry.cadence !== null) {
            updated.cadence = telemetry.cadence;
          }
          if (telemetry.speed !== undefined && telemetry.speed !== null) {
            updated.speed = telemetry.speed;
          }
        }
        
        liveDataRef.current = updated;
        return updated;
      });
    }
  }, [trainer.telemetry, trainer.connectedDevice, trainer.status]);

  // Auto-request control and start when trainer connects
  useEffect(() => {
    if (trainer.status === 'ready' && trainer.requestControl && trainer.start) {
      const setupTrainer = async () => {
        try {
          await trainer.requestControl();
          await trainer.start();
          addNotification('Trainer control granted and started', 'success');
        } catch (err) {
          console.error('Failed to setup trainer:', err);
          addNotification('Failed to setup trainer control', 'warning');
        }
      };
      setupTrainer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainer.status]);

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
  // This function MUST be called every second to save all data
  const collectDataPoint = useCallback(() => {
    // Always collect data when called - save EVERY value, even if 0 or null
    const currentLiveData = liveDataRef.current;
    const currentTotalTime = totalTestTimeRef.current;
    const currentStep = currentStepRef.current;
    const currentIntervalTime = intervalTimerRef2.current;
    
    // Create data point with ALL values - save everything every second
    const dataPoint = {
      power: currentLiveData.power !== undefined ? currentLiveData.power : null,
      cadence: currentLiveData.cadence !== undefined ? currentLiveData.cadence : null,
      speed: currentLiveData.speed !== undefined ? currentLiveData.speed : null,
      heartRate: currentLiveData.heartRate !== undefined ? currentLiveData.heartRate : null,
      smo2: currentLiveData.smo2 !== undefined ? currentLiveData.smo2 : null,
      thb: currentLiveData.thb !== undefined ? currentLiveData.thb : null,
      coreTemp: currentLiveData.coreTemp !== undefined ? currentLiveData.coreTemp : null,
      vo2: currentLiveData.vo2 !== undefined ? currentLiveData.vo2 : null,
      vco2: currentLiveData.vco2 !== undefined ? currentLiveData.vco2 : null,
      ventilation: currentLiveData.ventilation !== undefined ? currentLiveData.ventilation : null,
      timestamp: Date.now(),
      step: currentStep,
      intervalTime: currentIntervalTime,
      totalTime: currentTotalTime
    };
    
    // Always add to historical data - save every second
    setHistoricalData(prev => {
      const newData = [...prev, dataPoint];
      
      // Log every point for first 20, then every 10
      if (newData.length <= 20 || newData.length % 10 === 0) {
        console.log(`[collectDataPoint] ✅ #${newData.length} | Time: ${currentTotalTime}s | Power: ${dataPoint.power ?? 'null'}W | HR: ${dataPoint.heartRate ?? 'null'} | Cadence: ${dataPoint.cadence?.toFixed(0) ?? 'null'}rpm | Speed: ${dataPoint.speed?.toFixed(1) ?? 'null'}km/h`);
      }
      
      return newData;
    });
  }, []); // No dependencies - uses refs

  const stopMockDeviceStream = useCallback((deviceType) => {
    const intervals = mockDeviceIntervalsRef.current;
    if (intervals[deviceType]) {
      clearInterval(intervals[deviceType]);
      delete intervals[deviceType];
    }
  }, []);

  const stopAllMockDeviceStreams = useCallback(() => {
    const intervals = mockDeviceIntervalsRef.current;
    Object.keys(intervals).forEach((deviceType) => {
      clearInterval(intervals[deviceType]);
      delete intervals[deviceType];
    });
  }, []);

  const updateDeviceData = useCallback((deviceType, data) => {
    setDevices(prev => ({
      ...prev,
      [deviceType]: {
        ...prev[deviceType],
        connected: true,
        data
      }
    }));

    setLiveData(prev => {
      const updated = {
        ...prev,
        timestamp: Date.now()
      };
      
      if (deviceType === 'bikeTrainer') {
        // During recovery phase, force power/cadence/speed to 0
        if (phase === 'recovery') {
          updated.power = 0;
          updated.cadence = 0;
          updated.speed = 0;
        } else {
          if (data.power !== null && data.power !== undefined) {
            updated.power = data.power;
          }
          if (data.cadence !== null && data.cadence !== undefined) {
            updated.cadence = data.cadence;
          }
          if (data.speed !== null && data.speed !== undefined) {
            updated.speed = data.speed;
          }
        }
      }
      
      if (deviceType === 'heartRate') {
        // During recovery, simulate gradually decreasing HR
        if (phase === 'recovery' && data.heartRate !== null && data.heartRate !== undefined) {
          // Gradually decrease HR during recovery (about 1-2 bpm per 10 seconds)
          const decreaseRate = recoveryTimer / 10; // Decrease by ~1 bpm per 10 seconds
          updated.heartRate = Math.max(data.heartRate - decreaseRate, data.heartRate * 0.85); // Don't go below 85% of current HR
        } else {
          if (data.heartRate !== null && data.heartRate !== undefined) updated.heartRate = data.heartRate;
        }
      } else {
        // For other devices, update normally
        if (data.smo2 !== null && data.smo2 !== undefined) updated.smo2 = data.smo2;
        if (data.thb !== null && data.thb !== undefined) updated.thb = data.thb;
        if (data.coreTemp !== null && data.coreTemp !== undefined) updated.coreTemp = data.coreTemp;
        if (data.vo2 !== null && data.vo2 !== undefined) updated.vo2 = data.vo2;
        if (data.vco2 !== null && data.vco2 !== undefined) updated.vco2 = data.vco2;
        if (data.ventilation !== null && data.ventilation !== undefined) updated.ventilation = data.ventilation;
      }
      
      liveDataRef.current = updated;
      
      if (deviceType === 'bikeTrainer' && (data.power !== null || data.cadence !== null || data.speed !== null)) {
        if (Math.random() < 0.1) {
          console.log(`[updateDeviceData] bikeTrainer: Power=${updated.power ?? 'null'}W, Cadence=${updated.cadence?.toFixed(0) ?? 'null'}rpm, Speed=${updated.speed?.toFixed(1) ?? 'null'}km/h (phase: ${phase})`);
        }
      }
      
      return updated;
    });
  }, [phase, recoveryTimer]);

  const startMockDeviceStream = useCallback((deviceType) => {
    if (!mockDataMode) return;
    stopMockDeviceStream(deviceType);
    const intervals = mockDeviceIntervalsRef.current;

    if (deviceType === 'bikeTrainer') {
      setDevices(prev => ({
        ...prev,
        bikeTrainer: {
          connected: true,
          data: prev.bikeTrainer?.data || { power: 0, cadence: 0, speed: 0 }
        }
      }));

      let mockPower = 0;
      let mockCadence = 0;
      let mockSpeed = 0;

      intervals[deviceType] = setInterval(() => {
        const currentPhase = phaseRef.current;
        const isRunning = testStateRef.current === 'running';
        
        // During recovery phase, generate 0W (not pedaling)
        if (isRunning && currentPhase === 'recovery') {
          // Gradually decrease power, cadence, speed to 0
          mockPower = mockPower * 0.9; // Decay to 0
          mockPower = Math.max(0, mockPower);
          
          mockCadence = mockCadence * 0.9; // Decay to 0
          mockCadence = Math.max(0, mockCadence);
          
          mockSpeed = mockSpeed * 0.9; // Decay to 0
          mockSpeed = Math.max(0, mockSpeed);

          updateDeviceData('bikeTrainer', {
            power: Math.round(mockPower),
            cadence: Math.round(mockCadence),
            speed: Math.round(mockSpeed * 10) / 10
          });
          return;
        }

        // During work phase, generate normal power
        const currentProtocol = protocolRef.current;
        const steps = currentProtocol?.steps || [];
        const currentStepValue = currentStepRef.current;
        const currentStepData = steps[currentStepValue];
        const targetPower = currentStepData?.targetPower || currentProtocol?.startPower || 100;

        const powerDiff = targetPower - mockPower;
        mockPower = mockPower + (powerDiff * 0.1) + ((Math.random() - 0.5) * 10);
        mockPower = Math.max(0, mockPower);

        mockCadence = 70 + (Math.random() * 20) + (mockPower / 10);
        mockCadence = Math.min(105, Math.max(60, mockCadence));

        mockSpeed = (mockPower / 10) + (mockCadence / 3) + (Math.random() * 2);
        mockSpeed = Math.max(10, Math.min(40, mockSpeed));

        updateDeviceData('bikeTrainer', {
          power: Math.round(mockPower),
          cadence: Math.round(mockCadence),
          speed: Math.round(mockSpeed * 10) / 10
        });
      }, 500);
      return;
    }

    if (deviceType === 'heartRate') {
      setDevices(prev => ({
        ...prev,
        heartRate: {
          connected: true,
          data: prev.heartRate?.data || { heartRate: 0 }
        }
      }));

      let mockHeartRate = 120;
      intervals[deviceType] = setInterval(() => {
        const targetPower = liveDataRef.current.power || 120;
        const hrTrend = targetPower / 2;
        mockHeartRate += (hrTrend - mockHeartRate) * 0.05 + (Math.random() - 0.5) * 4;
        mockHeartRate = Math.min(190, Math.max(80, mockHeartRate));

        updateDeviceData('heartRate', { heartRate: Math.round(mockHeartRate) });
      }, 700);
      return;
    }

    if (deviceType === 'moxy') {
      setDevices(prev => ({
        ...prev,
        moxy: {
          connected: true,
          data: prev.moxy?.data || { smo2: 0, thb: 0 }
        }
      }));

      let mockSmo2 = 70;
      let mockThb = 12;
      intervals[deviceType] = setInterval(() => {
        const loadFactor = (liveDataRef.current.power || 100) / 300;
        mockSmo2 += ((65 - (loadFactor * 10)) - mockSmo2) * 0.05 + (Math.random() - 0.5);
        mockSmo2 = Math.min(80, Math.max(55, mockSmo2));

        mockThb += (Math.random() - 0.5) * 0.1;
        mockThb = Math.min(13.5, Math.max(10, mockThb));

        updateDeviceData('moxy', {
          smo2: Math.round(mockSmo2 * 10) / 10,
          thb: Math.round(mockThb * 10) / 10
        });
      }, 900);
      return;
    }

    if (deviceType === 'coreTemp') {
      setDevices(prev => ({
        ...prev,
        coreTemp: {
          connected: true,
          data: prev.coreTemp?.data || { coreTemp: 37.0 }
        }
      }));

      let mockCoreTemp = 37.0;
      intervals[deviceType] = setInterval(() => {
        const loadFactor = (liveDataRef.current.power || 100) / 300;
        // Core temp increases with load, typically 37-39°C range
        const targetTemp = 37.0 + (loadFactor * 1.5);
        mockCoreTemp += (targetTemp - mockCoreTemp) * 0.02 + (Math.random() - 0.5) * 0.1;
        mockCoreTemp = Math.min(39.5, Math.max(36.5, mockCoreTemp));

        updateDeviceData('coreTemp', {
          coreTemp: Math.round(mockCoreTemp * 10) / 10
        });
      }, 2000);
      return;
    }

    if (deviceType === 'vo2master') {
      setDevices(prev => ({
        ...prev,
        vo2master: {
          connected: true,
          data: prev.vo2master?.data || { vo2: 30, vco2: 25, ventilation: 60 }
        }
      }));

      let mockVo2 = 30;
      let mockVco2 = 25;
      let mockVentilation = 60;
      intervals[deviceType] = setInterval(() => {
        const loadFactor = (liveDataRef.current.power || 100) / 300;
        const hrFactor = (liveDataRef.current.heartRate || 120) / 180;
        
        // VO2 increases with load (typically 20-60 ml/kg/min)
        const targetVo2 = 20 + (loadFactor * 40);
        mockVo2 += (targetVo2 - mockVo2) * 0.05 + (Math.random() - 0.5) * 2;
        mockVo2 = Math.min(65, Math.max(20, mockVo2));

        // VCO2 is typically 0.8-1.0x VO2 (RER)
        const targetVco2 = mockVo2 * 0.9;
        mockVco2 += (targetVco2 - mockVco2) * 0.05 + (Math.random() - 0.5) * 1.5;
        mockVco2 = Math.min(65, Math.max(20, mockVco2));

        // Ventilation increases with load and HR (typically 40-150 L/min)
        const targetVentilation = 40 + (loadFactor * 80) + (hrFactor * 30);
        mockVentilation += (targetVentilation - mockVentilation) * 0.05 + (Math.random() - 0.5) * 5;
        mockVentilation = Math.min(160, Math.max(35, mockVentilation));

        updateDeviceData('vo2master', {
          vo2: Math.round(mockVo2 * 10) / 10,
          vco2: Math.round(mockVco2 * 10) / 10,
          ventilation: Math.round(mockVentilation * 10) / 10
        });
      }, 1500);
      return;
    }
  }, [mockDataMode, stopMockDeviceStream, setDevices, updateDeviceData]);

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
          
          // Set power to 0 W on trainer during recovery
          if (devices.bikeTrainer?.connected) {
            setTimeout(async () => {
              try {
                if (trainer.setErgWatts && trainer.status === 'controlled') {
                  await trainer.setErgWatts(0);
                  console.log('✅ Power set to 0W during recovery');
                }
              } catch (err) {
                console.error('Failed to set power to 0 during recovery:', err);
              }
            }, 100);
          }
          
          // Start recovery timer with auto-start next interval
          if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);
          recoveryTimerRef.current = setInterval(() => {
            setRecoveryTimer(prev => {
              const recoveryDuration = protocol.recoveryDuration || 60;
              // Auto-start next interval when recovery duration is reached
              if (prev + 1 >= recoveryDuration) {
                if (recoveryTimerRef.current) {
                  clearInterval(recoveryTimerRef.current);
                  recoveryTimerRef.current = null;
                }
                // Automatically start next interval
                setTimeout(() => {
                  if (handleStartIntervalRef.current) {
                    handleStartIntervalRef.current();
                  }
                }, 100);
                return recoveryDuration;
              }
              return prev + 1;
            });
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
  }, [currentStep, protocol.steps, protocol.recoveryDuration, devices.bikeTrainer?.connected, addNotification, trainer]);

  // Start test
  const handleStartTest = () => {
    if (testState === 'idle' && showCalibration) {
      setShowCalibration(false);
    }

    // Reset all state
    setCurrentStep(0);
    currentStepRef.current = 0; // Update ref immediately
    setIntervalTimer(0);
    intervalTimerRef2.current = 0; // Update ref immediately
    setTotalTestTime(0);
    totalTestTimeRef.current = 0; // Update ref immediately
    setHistoricalData([]);
    setLactateValues([]);
    setPhase('work');
    setCountdown(0);
    
    console.log('[handleStartTest] 🔄 Starting test, resetting all state...');
    
    // Update testStateRef FIRST, before setting state (React state is async)
    testStateRef.current = 'running';
    setTestState('running');
    
    console.log('[handleStartTest] ✅ Test state set to running, testStateRef:', testStateRef.current);

    // Auto-connect mock devices if mock mode is enabled
    if (mockDataMode) {
      if (!devices.bikeTrainer?.connected) {
        startMockDeviceStream('bikeTrainer');
      }
      if (!devices.heartRate?.connected) {
        startMockDeviceStream('heartRate');
      }
      if (!devices.moxy?.connected) {
        startMockDeviceStream('moxy');
      }
      if (!devices.coreTemp?.connected) {
        startMockDeviceStream('coreTemp');
      }
      if (!devices.vo2master?.connected) {
        startMockDeviceStream('vo2master');
      }
    }

    // Start total test timer FIRST
    if (testTimerRef.current) {
      clearInterval(testTimerRef.current);
    }
    testTimerRef.current = setInterval(() => {
      setTotalTestTime(prev => {
        const newTime = prev + 1;
        totalTestTimeRef.current = newTime; // Update ref immediately
        if (newTime % 10 === 0) {
          console.log(`[Test Timer] ⏱️ Total time: ${newTime}s`);
        }
        return newTime;
      });
    }, 1000);
    console.log('[handleStartTest] ✅ Test timer started, interval ID:', testTimerRef.current);

    // Start data collection interval
    if (dataCollectionIntervalRef.current) {
      clearInterval(dataCollectionIntervalRef.current);
      dataCollectionIntervalRef.current = null;
    }
    
    // Collect first data point immediately (at time 0)
    setTimeout(() => {
      console.log('[handleStartTest] 🔄 Collecting first data point, testStateRef:', testStateRef.current);
      collectDataPoint();
      console.log('[handleStartTest] ✅ First data point collected, totalTestTime:', totalTestTimeRef.current);
    }, 500);
    
    // Start interval for continuous data collection
    // Clear any existing interval first
    if (dataCollectionIntervalRef.current) {
      clearInterval(dataCollectionIntervalRef.current);
      dataCollectionIntervalRef.current = null;
    }
    
    // Start data collection interval - MUST run every second to save all data
    // Clear any existing interval first
    if (dataCollectionIntervalRef.current) {
      clearInterval(dataCollectionIntervalRef.current);
      dataCollectionIntervalRef.current = null;
    }
    
    // Start interval immediately - collect data every second
    console.log('[handleStartTest] 🔄 Starting data collection interval (every 1 second)...');
    
    dataCollectionIntervalRef.current = setInterval(() => {
      // Always check if test is running
      if (testStateRef.current === 'running') {
        // Collect data point - this saves ALL values every second
        collectDataPoint();
      }
    }, 1000); // Every 1000ms = 1 second
    
    console.log('[handleStartTest] ✅ Data collection interval started, ID:', dataCollectionIntervalRef.current);
    console.log('[handleStartTest] 📝 Data will be saved every second while test is running');
    
    // Start interval timer
    startIntervalTimer();

    // Set initial power target on trainer
    const firstStep = protocol.steps[0];
    if (firstStep && devices.bikeTrainer?.connected) {
      // Wait a bit for connection to stabilize, then set power
      setTimeout(async () => {
        try {
          if (trainer.setErgWatts && trainer.status === 'controlled') {
            await trainer.setErgWatts(firstStep.targetPower);
            console.log(`✅ Initial power set to ${firstStep.targetPower}W on trainer`);
            setTimeout(() => {
              addNotification(`Initial power set to ${firstStep.targetPower}W`, 'info');
            }, 0);
          }
        } catch (err) {
          console.error('Failed to set initial power on trainer:', err);
          setTimeout(() => {
            addNotification(`Failed to set initial power: ${err.message}`, 'warning');
          }, 0);
        }
      }, 2000); // Increased delay to ensure connection is stable
    }
    
    console.log('[handleStartTest] ✅ Test started, testStateRef:', testStateRef.current, 'Total time:', totalTestTimeRef.current);

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

  // Clear/Reset test data
  const handleClearTest = () => {
    // Confirm before clearing
    if (!window.confirm('Are you sure you want to clear all test data? This action cannot be undone.')) {
      return;
    }

    // Stop all timers
    if (intervalTimerRef.current) clearInterval(intervalTimerRef.current);
    if (testTimerRef.current) clearInterval(testTimerRef.current);
    if (dataCollectionIntervalRef.current) clearInterval(dataCollectionIntervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);

    // Reset all state
    setTestState('idle');
    setCurrentStep(0);
    setIntervalTimer(0);
    setTotalTestTime(0);
    setPhase('work');
    setCountdown(0);
    setRecoveryTimer(0);
    setHistoricalData([]);
    setLactateValues([]);
    setLiveData({
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

    // Reset refs
    liveDataRef.current = {
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
    };
    currentStepRef.current = 0;
    intervalTimerRef2.current = 0;
    totalTestTimeRef.current = 0;
    testStateRef.current = 'idle';

    setTimeout(() => {
      addNotification('Test data cleared', 'success');
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
    
    // Stay in recovery phase after saving lactate
    // Set power to 0 W on trainer during recovery
    if (devices.bikeTrainer?.connected) {
      setTimeout(async () => {
        try {
          if (trainer.setErgWatts && trainer.status === 'controlled') {
            await trainer.setErgWatts(0);
            console.log('✅ Power set to 0W during recovery');
          }
        } catch (err) {
          console.error('Failed to set power to 0 during recovery:', err);
        }
      }, 100);
    }
    
    // Ensure recovery phase is active and recovery timer is running
    if (phase !== 'recovery') {
      setPhase('recovery');
    }
    
    // Ensure recovery timer is running (restart if needed)
    if (testState === 'running') {
      // Stop existing recovery timer if running
      if (recoveryTimerRef.current) {
        clearInterval(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
      
      // Reset recovery timer to 0 and start it
      setRecoveryTimer(0);
      recoveryTimerRef.current = setInterval(() => {
        setRecoveryTimer(prev => {
          const recoveryDuration = protocol.recoveryDuration || 60;
          // Auto-start next interval when recovery duration is reached
          if (prev + 1 >= recoveryDuration) {
            if (recoveryTimerRef.current) {
              clearInterval(recoveryTimerRef.current);
              recoveryTimerRef.current = null;
            }
            // Automatically start next interval
            setTimeout(() => {
              if (handleStartIntervalRef.current) {
                handleStartIntervalRef.current();
              }
            }, 100);
            return recoveryDuration;
          }
          return prev + 1;
        });
      }, 1000);
    }
    
    setTimeout(() => {
      addNotification('Lactate value and BORG added. Recovery phase active.', 'success');
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
  const handleStartInterval = useCallback(() => {
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
                // Wait a bit longer to ensure previous commands are processed
                setTimeout(async () => {
                  try {
                    if (trainer.setErgWatts && trainer.status === 'controlled') {
                      await trainer.setErgWatts(nextStepData.targetPower);
                      console.log(`✅ Power set to ${nextStepData.targetPower}W for step ${newStep + 1}`);
                    } else {
                      // Double-check connection before setting power
                      if (!deviceConnectivity.isDeviceConnected('bikeTrainer')) {
                        console.warn('Trainer not connected, skipping power set');
                        return;
                      }
                      
                      if (deviceConnectivity.supportsErgoMode('bikeTrainer')) {
                        await deviceConnectivity.setPower('bikeTrainer', nextStepData.targetPower);
                        console.log(`✅ Power set to ${nextStepData.targetPower}W for step ${newStep + 1} (old system)`);
                      }
                    }
                  } catch (err) {
                    console.error('Failed to set power on trainer:', err);
                    addNotification(`Failed to set power: ${err.message}`, 'warning');
                  }
                }, 1000); // Increased delay to avoid conflicts
              }
              return newStep;
            });
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
  }, [testState, phase, currentStep, protocol.steps, devices.bikeTrainer?.connected, addNotification, startIntervalTimer, trainer]);
  
  // Store handleStartInterval in ref
  useEffect(() => {
    handleStartIntervalRef.current = handleStartInterval;
  }, [handleStartInterval]);

  // Save test session
  const handleSaveTest = async () => {
    try {
      if (!user?._id) {
        addNotification('You must be logged in to save a test', 'error');
        return;
      }

      if (historicalData.length === 0) {
        addNotification('No data to save. Please run a test first.', 'warning');
        return;
      }

      console.log('[handleSaveTest] Starting save...', {
        dataPoints: historicalData.length,
        totalTime: totalTestTime,
        userId: user._id
      });

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
        // Save ALL data points - every value that was recorded
        records: historicalData.map((m, index) => ({
          timestamp: new Date(startTime.getTime() + (m.totalTime || index) * 1000),
          // Core metrics
          power: m.power !== null && m.power !== undefined ? m.power : null,
          heartRate: m.heartRate !== null && m.heartRate !== undefined ? m.heartRate : null,
          speed: m.speed !== null && m.speed !== undefined ? m.speed : null,
          cadence: m.cadence !== null && m.cadence !== undefined ? m.cadence : null,
          // Additional metrics
          smo2: m.smo2 !== null && m.smo2 !== undefined ? m.smo2 : null,
          thb: m.thb !== null && m.thb !== undefined ? m.thb : null,
          coreTemp: m.coreTemp !== null && m.coreTemp !== undefined ? m.coreTemp : null,
          vo2: m.vo2 !== null && m.vo2 !== undefined ? m.vo2 : null,
          vco2: m.vco2 !== null && m.vco2 !== undefined ? m.vco2 : null,
          ventilation: m.ventilation !== null && m.ventilation !== undefined ? m.ventilation : null,
          // Test metadata
          step: m.step !== null && m.step !== undefined ? m.step : null,
          intervalTime: m.intervalTime !== null && m.intervalTime !== undefined ? m.intervalTime : null,
          totalTime: m.totalTime !== null && m.totalTime !== undefined ? m.totalTime : null,
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
        status: 'completed',
        sport: 'bike', // Required by backend
        title: `Lactate Test - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}` // Required by backend
      };

      console.log('[handleSaveTest] Session data prepared:', {
        measurements: sessionData.measurements.length,
        lactateValues: sessionData.lactateValues.length,
        testDuration: sessionData.testDuration,
        fitRecords: fitFileData.records.length,
        fitLaps: fitFileData.laps.length
      });
      
      // Log first few records to verify data
      if (fitFileData.records.length > 0) {
        console.log('[handleSaveTest] ✅ First 3 FIT records:', fitFileData.records.slice(0, 3));
        console.log('[handleSaveTest] ✅ Last 3 FIT records:', fitFileData.records.slice(-3));
      } else {
        console.warn('[handleSaveTest] ⚠️ No FIT records to save!');
      }

      // First create the session
      setTimeout(() => {
        addNotification('Saving test session...', 'info');
      }, 0);

      const response = await saveLactateSession(sessionData);
      console.log('[handleSaveTest] Save response:', response);
      
      const sessionId = response?.data?.session?._id || response?.data?._id || response?.session?._id || response?._id;

      if (sessionId) {
        console.log('[handleSaveTest] Session created with ID:', sessionId);
        // Then complete the session with FIT file data
        try {
          await completeLactateSession(sessionId, { fitFileData });
          setTimeout(() => {
            addNotification('Test session saved successfully with FIT file', 'success');
          }, 0);
        } catch (fitError) {
          console.error('[handleSaveTest] Error saving FIT file:', fitError);
          setTimeout(() => {
            addNotification('Test session saved, but FIT file generation failed', 'warning');
          }, 0);
        }
      } else {
        console.warn('[handleSaveTest] No session ID returned:', response);
        setTimeout(() => {
          addNotification('Test session saved, but no session ID returned', 'warning');
        }, 0);
      }
    } catch (error) {
      console.error('Error saving test:', error);
      const backendMessage = error.response?.data?.message || error.response?.data?.error;
      if (error.response) {
        console.error('Backend error detail:', error.response.data);
      }
      addNotification(backendMessage ? `Failed to save test: ${backendMessage}` : 'Failed to save test session', 'error');
    }
  };

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
    const empty = { historical: [], lactateValues: [], laps: [] };
    if (!session) return empty;

    const normalizeRecord = (record, index, startTimestamp) => {
      const ts = record.timestamp ? new Date(record.timestamp).getTime() : startTimestamp ? startTimestamp + index * 1000 : Date.now();
      const time = startTimestamp ? Math.max(0, (ts - startTimestamp) / 1000) : index;
      const toNumber = (value) => (value === null || value === undefined || Number.isNaN(Number(value)) ? null : Number(value));
      return {
        timestamp: ts,
        time,
        power: toNumber(record.power),
        heartRate: toNumber(record.heartRate),
        cadence: toNumber(record.cadence),
        speed: toNumber(record.speed),
        smo2: toNumber(record.smo2),
        vo2: toNumber(record.vo2),
        thb: toNumber(record.thb),
        ventilation: toNumber(record.ventilation),
        step: toNumber(record.step),
        intervalTime: toNumber(record.intervalTime),
        totalTime: toNumber(record.totalTime)
      };
    };

    // Prefer FIT data if available
    if (session?.fitFile?.fitData) {
      const fit = session.fitFile.fitData;
      const records = Array.isArray(fit.records) ? fit.records : [];
      const startTimestamp = records.length > 0 && records[0].timestamp ? new Date(records[0].timestamp).getTime() : null;
      const fitHistorical = records.map((record, index) => normalizeRecord(record, index, startTimestamp));

      const fitLaps = Array.isArray(fit.laps)
        ? fit.laps.map((lap, idx) => ({
            lapNumber: lap.lapNumber || idx + 1,
            startTime: lap.startTime ? new Date(lap.startTime).toLocaleTimeString() : null,
            totalElapsedTime: lap.totalElapsedTime || lap.duration || lap.total_timer_time || lap.totalTimerTime || null,
            totalDistance: lap.totalDistance || lap.total_distance || null,
            avgPower: lap.avgPower || lap.averagePower || null,
            avgHeartRate: lap.avgHeartRate || lap.averageHeartRate || null,
            avgCadence: lap.avgCadence || lap.averageCadence || null,
            lactate: typeof lap.lactate === 'number' ? lap.lactate : null
          }))
        : [];

      const fitLactate = fitLaps
        .filter((lap) => typeof lap.lactate === 'number')
        .map((lap, i) => ({
          step: lap.lapNumber || i + 1,
          power: lap.avgPower || 0,
          lactate: lap.lactate,
          time: lap.totalElapsedTime || 0
        }));

      return {
        historical: fitHistorical,
        lactateValues: fitLactate,
        laps: fitLaps
      };
    }

    // Fallback to stored realtime measurements
    if (Array.isArray(session?.measurements) && session.measurements.length > 0) {
      const measurements = session.measurements.map((measurement, index) =>
        normalizeRecord(measurement, index, measurement.timestamp ? new Date(measurement.timestamp).getTime() : null)
      );

      let mesLactate = session.measurements
        .filter((m) => typeof m.lactate === 'number')
        .map((m, i) => ({
          step: m.interval || i + 1,
          power: m.power,
          lactate: m.lactate,
          time: m.timestamp ? new Date(m.timestamp).getTime() : i * 60
        }));
      if (Array.isArray(session.lactateValues)) mesLactate = session.lactateValues;

      const laps = Array.isArray(session.laps)
        ? session.laps
        : (session.protocol?.steps || []).map((step, idx) => ({
            lapNumber: idx + 1,
            avgPower: step.targetPower || step.power || null,
            avgHeartRate: null,
            totalElapsedTime: step.duration || session.protocol.workDuration,
            lactate: mesLactate[idx]?.lactate ?? null
          }));

      return {
        historical: measurements,
        lactateValues: mesLactate,
        laps
      };
    }

    return empty;
  };

  // Update data collection based on test state
  // Note: Data collection is started in handleStartTest and handleResumeTest
  // This effect only handles cleanup when test stops (paused, completed, idle)
  useEffect(() => {
    // Only clean up if test is explicitly stopped (not running)
    // Don't clean up during state transitions
    if (testState === 'paused' || testState === 'completed' || testState === 'idle') {
      if (dataCollectionIntervalRef.current) {
        console.log('[useEffect] 🛑 Stopping data collection, test state:', testState);
        clearInterval(dataCollectionIntervalRef.current);
        dataCollectionIntervalRef.current = null;
      }
    }
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
                <>
                  <button
                    onClick={handleSaveTest}
                    className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 flex items-center gap-2 shadow"
                  >
                    <ChartBarIcon className="w-5 h-5" />
                    Save Test
                  </button>
                  <button
                    onClick={handleClearTest}
                    className="px-4 py-2 bg-gray-600 text-white rounded-xl hover:bg-gray-700 flex items-center gap-2 shadow"
                  >
                    <TrashIcon className="w-5 h-5" />
                    Clear Test
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Current Step Info */}
          {testState !== 'idle' && currentStepData && (
            <div className="mt-4 p-4 bg-white/70 backdrop-blur rounded-2xl border border-white/40">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <div className="text-xs sm:text-sm text-gray-600">Current Phase</div>
                  <div className="text-base sm:text-lg font-semibold text-primary">
                    {phase === 'countdown' ? 'Countdown' : phase === 'recovery' ? 'Recovery' : 'Work'}
                  </div>
                </div>
                <div>
                  <div className="text-xs sm:text-sm text-gray-600">Target Power</div>
                  <div className="text-base sm:text-lg font-semibold text-primary">
                    {currentStepData.targetPower} W
                  </div>
                  {/* Show actual power vs target power if bikeTrainer is connected */}
                  {devices.bikeTrainer?.connected && devices.bikeTrainer?.data?.power !== null && devices.bikeTrainer?.data?.power !== undefined && (
                    <div className="text-xs mt-1">
                      <span className={Math.abs((devices.bikeTrainer.data.power || 0) - currentStepData.targetPower) <= 30 
                        ? 'text-green-600' 
                        : 'text-orange-600'}>
                        Actual: {Math.round(devices.bikeTrainer.data.power)}W
                        {Math.abs((devices.bikeTrainer.data.power || 0) - currentStepData.targetPower) <= 30 
                          ? ' ✅' 
                          : ` (${Math.round((devices.bikeTrainer.data.power || 0) - currentStepData.targetPower)}W)`}
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs sm:text-sm text-gray-600">Step Duration</div>
                  <div className="text-base sm:text-lg font-semibold text-primary">
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
          {/* Trainer Connection & Mock Data Mode */}
          <div className="bg-white/80 backdrop-blur rounded-xl border border-gray-200 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(trainer.connectedDevice || (trainer.status !== 'disconnected' && trainer.status !== 'error')) ? (
                  <>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span className="text-sm font-medium text-gray-700">
                      🚴 Trainer: <span className="font-semibold text-green-600">
                        {trainer.connectedDevice?.name || 'Connected'}
                      </span>
                    </span>
                    {trainer.telemetry && (
                      <span className="text-xs text-gray-500">
                        {trainer.telemetry.power !== undefined && `${Math.round(trainer.telemetry.power)}W`}
                        {trainer.telemetry.cadence !== undefined && ` • ${Math.round(trainer.telemetry.cadence)}rpm`}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                    <span className="text-sm font-medium text-gray-700">🚴 Trainer: Not Connected</span>
                  </>
                )}
              </div>
              <button
                onClick={() => setShowTrainerModal(true)}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium"
              >
                {trainer.connectedDevice ? 'Manage Trainer' : 'Connect Trainer'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 cursor-pointer flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={mockDataMode}
                  onChange={(e) => {
                    setMockDataMode(e.target.checked);
                    if (e.target.checked) {
                      setTimeout(() => {
                        addNotification('Mock data mode enabled. Connect bike trainer to use mock data.', 'info');
                      }, 0);
                      startMockDeviceStream('bikeTrainer');
                      startMockDeviceStream('heartRate');
                      startMockDeviceStream('moxy');
                      startMockDeviceStream('coreTemp');
                      startMockDeviceStream('vo2master');
                    } else {
                      stopAllMockDeviceStreams();
                      setDevices(prev => ({
                        ...prev,
                        bikeTrainer: { connected: false, data: null },
                        heartRate: { connected: false, data: null },
                        moxy: { connected: false, data: null },
                        coreTemp: { connected: false, data: null },
                        vo2master: { connected: false, data: null }
                      }));
                    }
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span>🔧 Mock Data Mode (for testing without real trainer)</span>
              </label>
            </div>
          </div>
          
          <DeviceConnectionPanel
            devices={devices}
            onDeviceConnect={async (deviceType) => {
                console.log('Connecting to device:', deviceType);
                
                // Always use trainer modal for bikeTrainer
                if (deviceType === 'bikeTrainer') {
                  setShowTrainerModal(true);
                  return;
                }
                
                // Mock data mode for supported devices
                if (mockDataMode && ['bikeTrainer', 'heartRate', 'moxy', 'coreTemp', 'vo2master'].includes(deviceType)) {
                  startMockDeviceStream(deviceType);
                  setTimeout(() => {
                    addNotification(`${deviceType} connected in mock mode`, 'info');
                  }, 0);
                  return;
                }
                
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
                    
                    // For bikeTrainer, connection is handled via trainer modal
                    if (deviceType === 'bikeTrainer') {
                      // This should not happen as bikeTrainer is redirected to trainer modal
                      return;
                    }
                    
                    // Old code for other devices (kept for reference but bikeTrainer is handled separately)
                    if (false && deviceType === 'bikeTrainer') {
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
                            // Wait a bit longer to ensure connection is fully established
                            if (protocol.steps.length > 0 && testState === 'running') {
                              const initialPower = protocol.steps[0]?.targetPower || protocol.startPower || 100;
                              // Wait a bit more before setting power
                              setTimeout(async () => {
                                try {
                                  await deviceConnectivity.setPower('bikeTrainer', initialPower);
                                  setTimeout(() => {
                                    addNotification(`Initial power set to ${initialPower}W`, 'info');
                                  }, 0);
                                } catch (err) {
                                  console.error('Failed to set initial power:', err);
                                }
                              }, 500);
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
                      }, 1500); // Increased delay to ensure connection is stable
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
                  // Handle trainer system disconnect
                  if (deviceType === 'bikeTrainer' && trainer.connectedDevice) {
                    await trainer.disconnect();
                    setTimeout(() => {
                      addNotification('Trainer disconnected', 'success');
                    }, 0);
                    return;
                  }
                  
                  stopMockDeviceStream(deviceType);
                  
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
            onProtocolSubmit={handleProtocolSubmit}
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
              <div className="mt-2 space-y-6">
                {/* Transform session data for chart rendering */}
                {(() => {
                  const { historical, lactateValues, laps } = transformSessionToChartData(selectedSession);
                  const hasLaps = Array.isArray(laps) && laps.length > 0;

                  return (
                    <>
                      <LactateChart
                        lactateValues={lactateValues}
                        historicalData={historical}
                        laps={laps}
                      />

                      {hasLaps && (
                        <div>
                          <h3 className="text-sm font-semibold text-gray-700 mb-2">Lap Summary</h3>
                          <div className="overflow-x-auto bg-white/60 backdrop-blur rounded-2xl border border-white/40">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                              <thead className="bg-white/70 text-gray-600">
                                <tr>
                                  <th className="px-4 py-2 text-left font-medium">Lap</th>
                                  <th className="px-4 py-2 text-left font-medium">Duration</th>
                                  <th className="px-4 py-2 text-left font-medium">Avg Power</th>
                                  <th className="px-4 py-2 text-left font-medium">Avg HR</th>
                                  <th className="px-4 py-2 text-left font-medium">Avg Cadence</th>
                                  <th className="px-4 py-2 text-left font-medium">Lactate</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {laps.map((lap) => (
                                  <tr key={`lap-${lap.lapNumber}`}>
                                    <td className="px-4 py-2 font-semibold text-gray-900">#{lap.lapNumber}</td>
                                    <td className="px-4 py-2 text-gray-700">{formatTime(lap.totalElapsedTime)}</td>
                                    <td className="px-4 py-2 text-gray-700">{lap.avgPower ? `${Math.round(lap.avgPower)} W` : '—'}</td>
                                    <td className="px-4 py-2 text-gray-700">{lap.avgHeartRate ? `${Math.round(lap.avgHeartRate)} bpm` : '—'}</td>
                                    <td className="px-4 py-2 text-gray-700">{lap.avgCadence ? `${Math.round(lap.avgCadence)} rpm` : '—'}</td>
                                    <td className="px-4 py-2 text-gray-700">
                                      {lap.lactate !== null && lap.lactate !== undefined ? `${Number(lap.lactate).toFixed(2)} mmol/L` : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          {!loadingSessions && previousSessions.length === 0 && <div className="text-sm text-gray-600">No previous sessions found.</div>}
        </motion.div>

        {/* Trainer Connect Modal */}
        {showTrainerModal && (
          <TrainerConnectModal
            isOpen={showTrainerModal}
            onClose={() => setShowTrainerModal(false)}
          />
        )}
      </div>
    </div>
  );
};

export default LactateTestingPage;

