import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Trash, Plus, X, Save, HelpCircle, ArrowRight, Edit, Info, Settings2, Lock } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthProvider';
import { trackEvent } from '../../utils/analytics';
import { resolveDistanceUnitSystem } from '../../utils/unitsConverter';
import TrainingGlossary from '../DashboardPage/TrainingGlossary';

// Tutorial steps configuration
const tutorialSteps = [
  {
    field: 'title',
    message: 'Start by entering the test title',
    example: 'Example: Lactate Test - Bike (15.3.2024)'
  },
  {
    field: 'sport',
    message: 'Select the sport for your test',
    example: 'Running, Cycling or Swimming'
  },
  {
    field: 'weight',
    message: 'Enter your weight',
    example: 'Value in kg (e.g., 75)'
  },
  {
    field: 'baseLa',
    message: 'Enter your baseline lactate level',
    example: 'Value in mmol/L measured before the test (e.g., 1.2)'
  },
  {
    field: 'power_0',
    message: 'Enter power/pace for the first interval',
    example: 'For cycling: watts (e.g., 200W)\nFor running/swimming: pace (e.g., 4:30)'
  },
  {
    field: 'heartRate_0',
    message: 'Enter heart rate',
    example: 'Value in beats per minute (e.g., 150)'
  },
  {
    field: 'lactate_0',
    message: 'Enter measured lactate value',
    example: 'Value in mmol/L (e.g., 2.5)'
  }
];

// Portal-based Tutorial message component
const TutorialMessagePortal = ({ step, onNext, onSkip, inputRef }) => {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (inputRef && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX + rect.width / 2,
        width: rect.width
      });
    }
  }, [inputRef, step]);

  if (!step) return null;

  return ReactDOM.createPortal(
    <div 
      ref={tooltipRef}
      className="bg-white rounded-lg shadow-lg border border-primary/10 p-4 max-w-xs"
      style={{
        position: 'absolute',
        top: coords.top - 16, // 16px above input
        left: coords.left,
        transform: 'translate(-50%, -100%)',
        animation: 'fadeIn 0.3s ease-out',
        pointerEvents: 'auto',
        zIndex: 9999, // High z-index to be above everything
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold">
          ?
        </div>
        <div className="flex-1">
          <p className="text-gray-800 font-medium mb-1">{step.message}</p>
          <p className="text-gray-500 text-sm whitespace-pre-line">{step.example}</p>
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={onSkip}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Skip tutorial
            </button>
            <button
              onClick={onNext}
              className="flex items-center gap-1 text-primary hover:text-primary-dark font-medium"
            >
              Next <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="absolute w-3 h-3 bg-white transform rotate-45 border-r border-b border-primary/10"
           style={{
             bottom: '-6px',
             left: '50%',
             marginTop: '-3px'
           }}
      />
    </div>,
    document.body
  );
};

// Improved click logging function
const logClick = (element, details = {}) => {
  // Format the details object to be more readable
  const formattedDetails = Object.entries(details)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  
  console.log(`[Click] ${element}${formattedDetails ? ` (${formattedDetails})` : ''}`);
};

// Add data change logging
const logDataChange = (type, data) => {
  // Only log essential data to keep console clean
  const essentialData = {
    title: data.title,
    sport: data.sport,
    date: data.date,
    results: data.results?.length || 0
  };
  console.log(`[Data Change] ${type}:`, essentialData);
};

function TestingForm({ testData, onTestDataChange, onSave, onGlucoseColumnChange, onDelete, demoMode = false, disableInnerScroll = false, isPremium = true }) {
  const normalizeSport = (sport) => {
    const s = String(sport || '').trim().toLowerCase();
    if (s === 'running' || s.includes('run')) return 'run';
    if (s === 'swimming' || s.includes('swim')) return 'swim';
    if (s === 'cycling' || s === 'cycle' || s.includes('bike')) return 'bike';
    return s || '';
  };
  const { addNotification } = useNotification();
  const { user } = useAuth();
  const [currentTutorialStep, setCurrentTutorialStep] = useState(0);
  const [highlightedField, setHighlightedField] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [inputMode, setInputMode] = useState('pace');
  const [showGlossary, setShowGlossary] = useState(false);
  // Get unitSystem from user profile, fallback to testData or 'metric'
  const getUserUnitSystem = () => {
    return resolveDistanceUnitSystem(user, testData?.unitSystem || 'metric');
  };
  const [unitSystem, setUnitSystem] = useState(getUserUnitSystem());
  // RPE Scale: 'rpe' (1-10) or 'borg' (6-20)
  const [rpeScale, setRpeScale] = useState(() => {
    if (testData?.rpeScale) return testData.rpeScale;
    return 'rpe'; // Default to RPE scale
  });
  const [isSaving, setIsSaving] = useState(false);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  // Helper functions for conversions
  const convertSecondsToPace = (seconds) => {
    if (!seconds && seconds !== 0) return '0:00';
      const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const convertPaceToSeconds = (paceString) => {
    if (!paceString) return 0;
    const paceStr = String(paceString).trim();
    if (!paceStr.includes(':')) {
      // If no colon, try to parse as number (might already be seconds)
      const num = parseFloat(paceStr.replace(',', '.'));
      return isNaN(num) ? 0 : num;
    }
    const parts = paceStr.split(':');
    if (parts.length < 2) return 0;
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseInt(parts[1], 10) || 0;
    if (isNaN(minutes) || isNaN(seconds)) return 0;
    return (minutes * 60) + seconds;
  };

  /**
   * Pace sports: running stores seconds per km (metric) or per mile (imperial).
   * Swimming stores seconds per 100m; speed uses km/h (metric) or mph (imperial).
   */
  const convertSecondsToSpeed = (seconds, unitSystem, sport) => {
    if (!seconds) return 0;
    if (sport === 'swim') {
      const kmh = 360 / seconds;
      if (unitSystem === 'imperial') return kmh * 0.621371;
      return kmh;
    }
    // run (and any legacy path): duration per distance unit → km/h or mph via 3600/s
    return 3600 / seconds;
  };

  const convertSpeedToSeconds = (speed, unitSystem, sport) => {
    if (!speed || speed === 0) return 0;
    const speedNum = typeof speed === 'string' ? parseFloat(speed.replace(',', '.')) : speed;
    if (isNaN(speedNum) || speedNum <= 0) return 0;

    if (sport === 'swim') {
      if (unitSystem === 'imperial') {
        const kmh = speedNum / 0.621371;
        if (kmh <= 0) return 0;
        return 360 / kmh;
      }
      return 360 / speedNum;
    }
    // run: km/h or mph → sec/km or sec/mile
    return 3600 / speedNum;
  };

  const [formData, setFormData] = useState({
    title: testData?.title || '',
    description: testData?.description || '',
    weight: testData?.weight || '',
    sport: normalizeSport(testData?.sport),
    baseLa: testData?.baseLa !== undefined && testData?.baseLa !== null ? String(testData.baseLa) : (testData?.baseLactate !== undefined && testData?.baseLactate !== null ? String(testData.baseLactate) : ''),
    date: formatDate(testData?.date),
    specifics: testData?.specifics || { specific: '', weather: '' },
    comments: testData?.comments || '',
    // Protocol metadata — saved alongside the test for cross-test comparison
    // and future use by improved LT analysis (Modified Dmax / IAT). None of
    // these influence the current curve fit directly.
    restingHR: testData?.restingHR ?? '',
    preLoadHR: testData?.preLoadHR ?? '',
    maxHR: testData?.maxHR ?? '',
    maxLactate: testData?.maxLactate ?? '',
    recoveryHR3min: testData?.recoveryHR3min ?? '',
    recoveryLactate3min: testData?.recoveryLactate3min ?? '',
    stageDurationSec: testData?.stageDurationSec ?? '',
    restBetweenStagesSec: testData?.restBetweenStagesSec ?? '',
  });

  useEffect(() => {
    // Priority: user profile units > testData unitSystem > default 'metric'
    setUnitSystem(resolveDistanceUnitSystem(user, testData?.unitSystem || 'metric'));
    
    if (testData?.inputMode) {
        setInputMode(testData.inputMode);
      }
    
    if (testData?.rpeScale) {
      setRpeScale(testData.rpeScale);
    } else {
      setRpeScale('rpe'); // Default to RPE if not set
    }
  }, [testData, user]);

  // Convert display format when switching inputMode/unitSystem (for existing values only)
  useEffect(() => {
    if ((formData.sport === 'run' || formData.sport === 'swim') && rows.length > 0) {
      const updatedRows = rows.map(row => {
        if (!row.power || row.power === '') return row;
        
        const powerStr = String(row.power).trim();
        let powerNum = parseFloat(powerStr.replace(',', '.'));
        
        // Convert based on current inputMode
        if (inputMode === 'pace') {
          // Convert to pace format (MM:SS)
          
          // If it already has ':', keep as is (already in pace format)
          if (powerStr.includes(':')) {
            return row;
          }
          
          // If it's a number, try to convert
          if (!isNaN(powerNum)) {
            // If it's a large number (>= 60), assume it's seconds from backend - convert to pace
            if (powerNum >= 60) {
              return { ...row, power: convertSecondsToPace(powerNum) };
            }
            // If it's a small number (< 50), assume it's speed - convert to pace
            else if (powerNum > 0 && powerNum < 50) {
            const seconds = convertSpeedToSeconds(powerNum, unitSystem, formData.sport);
            return { ...row, power: convertSecondsToPace(seconds) };
            }
            // For values 50-60, might be ambiguous - keep as is or convert based on context
          }
        } else if (inputMode === 'speed') {
          // Convert to speed format
          
          // If it has ':', it's pace format - convert to speed
          if (powerStr.includes(':')) {
            const paceSeconds = convertPaceToSeconds(powerStr);
            const speed = convertSecondsToSpeed(paceSeconds, unitSystem, formData.sport);
            const speedNum = Number(speed);
            return { ...row, power: Number.isFinite(speedNum) ? speedNum.toFixed(1) : '' };
          }
          
          // If it's a number, check what it is
          if (!isNaN(powerNum)) {
            // If it's a large number (>= 60), assume it's seconds from backend - convert to speed
            if (powerNum >= 60) {
              const speed = convertSecondsToSpeed(powerNum, unitSystem, formData.sport);
              const speedNum = Number(speed);
              return { ...row, power: Number.isFinite(speedNum) ? speedNum.toFixed(1) : '' };
            }
            // If it's already a small number (< 50), assume it's already speed, keep as is
            // But might need to convert if unitSystem changed
            if (powerNum > 0 && powerNum < 50) {
              // Check if unitSystem changed - if so, might need conversion
              // For now, keep as is (user might have typed it in current unitSystem)
              return row;
            }
          }
        }
        
        return row; // Keep as is if we can't determine format
      });
      
      // Only update if rows actually changed
      if (JSON.stringify(updatedRows) !== JSON.stringify(rows)) {
        console.log('[useEffect inputMode/unitSystem] Converting rows:', { inputMode, unitSystem, rowsCount: rows.length });
        setRows(updatedRows);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputMode, unitSystem, formData.sport]);

  // Determine if we're in new test mode (all editable) or previous test mode (needs edit button)
  const isNewTest = !testData?._id;

  const [rows, setRows] = useState([]);
  
  // Store original test data when entering edit mode for cancel functionality
  const [originalTestData, setOriginalTestData] = useState(null);

  const [showGlucose, setShowGlucose] = useState(true);
  const [showVO2, setShowVO2] = useState(true);
  const [showFormSettings, setShowFormSettings] = useState(false);
  const formSettingsRef = useRef(null);
  const rowsScrollRef = useRef(null);
  const [rowsCanScroll, setRowsCanScroll] = useState(false);
  const [rowsAtTop, setRowsAtTop] = useState(true);
  const [rowsAtBottom, setRowsAtBottom] = useState(true);

  const inputRefs = useRef({});

  // Handle tutorial navigation
  const handleNextTutorialStep = () => {
    setCurrentTutorialStep(prev => {
      if (prev < tutorialSteps.length - 1) {
        return prev + 1;
      }
      return -1; // End tutorial
    });
  };

  const handleSkipTutorial = () => {
    setCurrentTutorialStep(-1);
  };

  // Update tutorial position when step changes
  useEffect(() => {
    if (currentTutorialStep >= 0) {
      const currentStep = tutorialSteps[currentTutorialStep];
      const inputEl = inputRefs.current[currentStep.field];
      if (inputEl) {
        inputEl.focus();
      }
    }
  }, [currentTutorialStep]);

  // Initialize refs for new rows
  useEffect(() => {
    rows.forEach((_, index) => {
      ['power', 'heartRate', 'lactate', 'glucose', 'vo2', 'RPE'].forEach(field => {
        const key = `${field}_${index}`;
        if (!inputRefs.current[key]) {
          inputRefs.current[key] = null;
        }
      });
    });

    Object.keys(inputRefs.current).forEach(key => {
      if (key.includes('_') && parseInt(key.split('_')[1]) >= rows.length) {
        delete inputRefs.current[key];
      }
    });
  }, [rows]);

  // Check if any row has glucose data
  const hasGlucoseData = rows.some(row => 
    row.glucose !== undefined && 
    row.glucose !== null && 
    row.glucose !== '' && 
    Number(row.glucose) !== 0
  );

  // Check if any row has VO2 data
  const hasVO2Data = rows.some(row => 
    row.vo2 !== undefined && 
    row.vo2 !== null && 
    row.vo2 !== '' && 
    Number(row.vo2) !== 0
  );

  // Check if any row has RPE data
  const hasRPEData = rows.some(row => 
    row.RPE !== undefined && 
    row.RPE !== null && 
    row.RPE !== '' && 
    Number(row.RPE) !== 0
  );

  // Update showGlucose based on whether there's any non-zero glucose data
  // If data exists, always show the column
  useEffect(() => {
    if (hasGlucoseData) {
      setShowGlucose(true);
    } else {
      setShowGlucose(false);
    }
  }, [hasGlucoseData]);

  // Update showVO2 based on whether there's any non-zero VO2 data
  // If data exists, always show the column
  useEffect(() => {
    if (hasVO2Data) {
      setShowVO2(true);
    } else {
      setShowVO2(false);
    }
  }, [hasVO2Data]);

  // Notify parent component when glucose column visibility changes
  useEffect(() => {
    if (onGlucoseColumnChange) {
      onGlucoseColumnChange(!showGlucose);
    }
  }, [showGlucose, onGlucoseColumnChange]);

  const handleScrollHintClick = () => {
    const el = rowsScrollRef.current;
    if (!el) return;
    const step = Math.max(120, Math.round(el.clientHeight * 0.6));
    el.scrollBy({ top: step, behavior: 'smooth' });
  };

  // Visual scroll hint for the intervals table (fade + helper text).
  useEffect(() => {
    const el = rowsScrollRef.current;
    if (!el) return;

    const updateRowsScrollState = () => {
      const canScroll = el.scrollHeight > el.clientHeight + 2;
      const atTop = el.scrollTop <= 2;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
      setRowsCanScroll(canScroll);
      setRowsAtTop(atTop);
      setRowsAtBottom(atBottom);
    };

    updateRowsScrollState();
    el.addEventListener('scroll', updateRowsScrollState);
    window.addEventListener('resize', updateRowsScrollState);

    return () => {
      el.removeEventListener('scroll', updateRowsScrollState);
      window.removeEventListener('resize', updateRowsScrollState);
    };
  }, [rows.length, hasGlucoseData, hasVO2Data, formData.sport, inputMode, isEditMode, isNewTest]);

  useEffect(() => {
    if (!showFormSettings) return;
    const onPointerDown = (e) => {
      if (formSettingsRef.current && !formSettingsRef.current.contains(e.target)) {
        setShowFormSettings(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowFormSettings(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showFormSettings]);

  const handleValueChange = (rowIndex, field, value) => {
    console.log('Input change:', { rowIndex, field, value });
    
    // Always store the value as a string
    const updatedRows = rows.map((row, index) => {
      if (index === rowIndex) {
        return { ...row, [field]: String(value) };
      }
      return row;
    });
    
    console.log('Updated rows:', updatedRows);
    setRows(updatedRows);
      
      const updatedTestData = {
        ...testData,
      results: updatedRows
      };
    
      onTestDataChange(updatedTestData);
  };

  // Update useEffect for testData changes to preserve raw values
  // Use ref to track if we're currently updating from user input to avoid circular updates
  const isUpdatingFromUserInput = useRef(false);
  const lastBaseLaValue = useRef('');
  
  const lastResultsSignatureRef = useRef(null);

  useEffect(() => {
    if (!testData) {
      setRows([{
        interval: 1,
        power: '',
        heartRate: '',
        lactate: '',
        glucose: '',
        vo2: '',
        RPE: ''
      }]);
      return;
    }

    if (isUpdatingFromUserInput.current) {
      return;
    }

    if (testData) {
      // Use baseLa if available (string from user input), otherwise use baseLactate
      // IMPORTANT: Preserve the exact string value, including partial inputs like "1."
      // Don't use String() conversion if it's already a string to preserve partial inputs
      let baseLaValue = '';
      if (testData.baseLa !== undefined && testData.baseLa !== null) {
        // If it's already a string, use it directly (preserves "1." or "1,")
        // If it's a number, convert to string
        baseLaValue = typeof testData.baseLa === 'string' ? testData.baseLa : String(testData.baseLa);
      } else if (testData.baseLactate !== undefined && testData.baseLactate !== null) {
        baseLaValue = typeof testData.baseLactate === 'string' ? testData.baseLactate : String(testData.baseLactate);
      }
      
      // Only update formData if the value actually changed to avoid unnecessary re-renders
      // that might cause input to lose focus or cursor position
      setFormData(prevFormData => {
        // If baseLa is the same, don't update (preserves user's partial input like "1.")
        // Also check if user is currently typing (value hasn't changed from last known value)
        if (prevFormData.baseLa === baseLaValue && 
            prevFormData.title === (testData.title || '') &&
            prevFormData.sport === (testData.sport || '')) {
          return prevFormData; // No change needed
        }
        
        // Store the last known value
        lastBaseLaValue.current = baseLaValue;
        
        return {
        title: testData.title || '',
        description: testData.description || '',
        weight: testData.weight?.toString() || '',
        sport: testData.sport || '',
          baseLa: baseLaValue,
        date: formatDate(testData.date),
        specifics: testData.specifics || { specific: '', weather: '' },
        comments: testData.comments || ''
        };
      });
      const resultsSignature = JSON.stringify(
        (testData.results || []).map(row => ({
          interval: row.interval,
          power: row.power,
          heartRate: row.heartRate,
          lactate: row.lactate,
          glucose: row.glucose,
          vo2: row.vo2,
          RPE: row.RPE
        }))
      );

      if (resultsSignature === lastResultsSignatureRef.current) {
        return;
      }
      lastResultsSignatureRef.current = resultsSignature;

      if (testData.results && testData.results.length > 0) {
        const initialRows = testData.results.map(row => {
          let power = row.power !== undefined && row.power !== null ? String(row.power) : '';
          
          // For existing tests (from backend), convert seconds to display format
          // Run: metric tests store sec/km, imperial tests store sec/mile (same MM:SS formatting).
          // Swim: sec/100m.
          if ((testData.sport === 'run' || testData.sport === 'swim') && power) {
            const powerNum = parseFloat(power);
            // If it's a number > 60, it's seconds from backend - convert to display format
            if (!isNaN(powerNum) && powerNum > 60 && !power.includes(':')) {
              // Convert based on current inputMode and unitSystem
              if (inputMode === 'pace') {
                // Convert seconds to MM:SS format
                power = convertSecondsToPace(powerNum);
              } else if (inputMode === 'speed') {
                // Convert seconds to speed (km/h or mph)
                const speed = convertSecondsToSpeed(powerNum, unitSystem, testData.sport);
                const speedNum = Number(speed);
                power = Number.isFinite(speedNum) ? speedNum.toFixed(1) : '';
            } else {
                // Fallback: convert to pace format
                power = convertSecondsToPace(powerNum);
            }
          }
          }
          
          return {
            interval: row.interval || 1,
            power,
            heartRate: row.heartRate ? String(row.heartRate) : '',
            lactate: row.lactate ? String(row.lactate) : '',
            glucose: row.glucose ? String(row.glucose) : '',
            vo2: row.vo2 ? String(row.vo2) : '',
            RPE: row.RPE ? String(row.RPE) : '',
            // 'work' rows feed the LT curve; 'recovery' rows are saved but
            // excluded from regression / LT1 / LT2. Default to 'work' for
            // backwards-compat with older saved tests.
            intervalType: row.intervalType === 'recovery' ? 'recovery' : 'work',
          };
        });
        setRows(initialRows);
      } else {
        setRows([{
          interval: 1,
          power: '',
          heartRate: '',
          lactate: '',
          glucose: '',
          vo2: '',
          RPE: '',
          intervalType: 'work',
        }]);
      }
    }
  }, [testData, isNewTest, inputMode, unitSystem]);

// NO AUTOMATIC CONVERSIONS - let user type anything

  // Helper function to convert power value to seconds for backend
  const convertPowerToSeconds = (powerValue, currentInputMode, currentUnitSystem, sport) => {
    if (!powerValue || powerValue === '' || powerValue === null || powerValue === undefined) {
      return 0;
    }
    
    // For bike, power is already in watts, return as is
    if (sport === 'bike') {
      const num = parseFloat(String(powerValue).replace(',', '.'));
      return isNaN(num) ? 0 : num;
    }
    
    // For run/swim, we need to convert to seconds
    const powerStr = String(powerValue).trim();
    
    // Check if it's already in pace format (MM:SS)
    if (powerStr.includes(':')) {
      return convertPaceToSeconds(powerStr);
    }
    
    // Try to parse as number
    const powerNum = parseFloat(powerStr.replace(',', '.'));
    if (isNaN(powerNum)) {
      console.warn(`[convertPowerToSeconds] Cannot parse "${powerStr}" as number`);
      return 0;
    }
    
    // Determine if it's speed or already seconds based on value and current mode
    // Speed values are typically: 8-25 km/h (or 5-15 mph) for running
    // Seconds values are typically: 180-600+ for pace
    const isLikelySpeed = (currentInputMode === 'speed') || 
                          (powerNum > 0 && powerNum < 50 && !powerStr.includes(':')) ||
                          (powerNum > 0 && powerNum < 30 && currentUnitSystem === 'imperial');
    
    const isLikelySeconds = powerNum >= 100; // Pace in seconds is usually 100+
    
    let result;
    if (isLikelySpeed && !isLikelySeconds) {
      // It's speed, convert to seconds
      result = convertSpeedToSeconds(powerNum, currentUnitSystem, sport);
      console.log(`[convertPowerToSeconds] Speed ${powerNum} ${currentUnitSystem === 'imperial' ? 'mph' : 'km/h'} -> ${result}s`);
    } else if (isLikelySeconds) {
      // It's already in seconds, return as is
      result = powerNum;
      console.log(`[convertPowerToSeconds] Already seconds: ${powerNum}s`);
    } else {
      // Ambiguous case: use current inputMode to decide
      if (currentInputMode === 'speed') {
        result = convertSpeedToSeconds(powerNum, currentUnitSystem, sport);
        console.log(`[convertPowerToSeconds] Ambiguous, using speed mode: ${powerNum} -> ${result}s`);
      } else {
        // Assume it's already seconds if in pace mode
        result = powerNum;
        console.log(`[convertPowerToSeconds] Ambiguous, using pace mode (assume seconds): ${powerNum}s`);
      }
    }
    
    return result;
  };

  const handleSaveChanges = async () => {
    if (!validateForm()) {
      return;
    }
    const parseLocalizedNumber = (value, emptyFallback = 0) => {
      const raw = value === null || value === undefined ? '' : String(value).trim();
      if (raw === '') return emptyFallback;
      const parsed = parseFloat(raw.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : emptyFallback;
    };
    const finalInputMode = inputMode;
    const finalUnitSystem = unitSystem;
    
    const updatedTest = {
      ...testData,
      title: formData.title.trim(),
      description: formData.description?.trim() || '',
      weight: parseLocalizedNumber(formData.weight, 0),
      sport: formData.sport,
      baseLactate: parseLocalizedNumber(formData.baseLa, 0),
      date: formData.date,
      specifics: formData.specifics || { specific: '', weather: '' },
      comments: formData.comments?.trim() || '',
      unitSystem: finalUnitSystem,
      inputMode: finalInputMode,
      rpeScale: rpeScale,
      results: rows
        .map((row, index) => {
          // Convert power to seconds for backend
          const powerInSeconds = convertPowerToSeconds(
            row.power, 
            finalInputMode, 
            finalUnitSystem, 
            formData.sport
          );
          
          const convertToNumber = (value) => {
            if (value === '' || value === undefined || value === null) return 0;
            if (typeof value !== 'string') {
              const n = Number(value);
              return isNaN(n) ? 0 : n;
            }
            return parseFloat(value.replace(',', '.'));
          };
          
          return {
            interval: index + 1,
            power: powerInSeconds,
            heartRate: convertToNumber(row.heartRate),
            lactate: convertToNumber(row.lactate),
            glucose: convertToNumber(row.glucose),
            vo2: convertToNumber(row.vo2),
            RPE: convertToNumber(row.RPE)
          };
        })
        .filter(row => {
          // Filter out empty rows - a row is empty if power is 0 or empty, or lactate is 0 or empty
          // At minimum, both power and lactate must have valid values
          const hasPower = row.power !== undefined && row.power !== null && row.power !== 0 && row.power !== '';
          const hasLactate = row.lactate !== undefined && row.lactate !== null && row.lactate !== 0 && row.lactate !== '';
          return hasPower && hasLactate;
        })
    };

    if (!updatedTest.results || updatedTest.results.length === 0) {
      addNotification(
        'Add at least one interval with power (or pace) and lactate before saving.',
        'error'
      );
      return;
    }

    if (!onSave) {
      addNotification('Save is not available in this view.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await onSave(updatedTest);
      addNotification('Test data saved successfully', 'success');
      trackEvent('test_saved', {
        sport: formData.sport,
        intervals: rows.length,
        isNewTest: isNewTest
      });
      setIsEditMode(false);
      setOriginalTestData(null); // Clear original data after successful save
    } catch (error) {
      console.error('Error saving test data:', error);
      const apiMsg = error?.response?.data?.error || error?.response?.data?.message;
      addNotification(
        apiMsg || error?.message || 'Failed to save test data',
        'error'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const validateForm = () => {
    const errors = [];
    const baseLaRaw = formData.baseLa === null || formData.baseLa === undefined ? '' : String(formData.baseLa).trim();
    
    if (!formData.title?.trim()) {
      errors.push('Test title is required');
      setHighlightedField('title');
    }
    
    if (!formData.sport) {
      errors.push('Sport is required');
      setHighlightedField('sport');
    }
    
    // Validate baseLactate - should be a positive number
    const baseLaNum = baseLaRaw ? parseFloat(baseLaRaw.replace(',', '.')) : 0;
    if (!baseLaRaw || isNaN(baseLaNum) || baseLaNum <= 0) {
      errors.push('Base lactate is required and must be greater than 0');
      setHighlightedField('baseLa');
    }
    
    if (errors.length > 0) {
      errors.forEach(error => addNotification(error, 'error'));
      return false;
    }
    
    return true;
  };

  const handleFormDataChange = (field, value) => {
    logClick('Form Field Change', { field, value });
    
    // Mark that we're updating from user input to prevent useEffect from overwriting
    if (field === 'baseLa') {
      isUpdatingFromUserInput.current = true;
      const stringValue = typeof value === 'string' ? value : String(value);
      lastBaseLaValue.current = stringValue;
      setFormData(prev => ({ ...prev, baseLa: stringValue }));
      const updatedTestData = {
        ...testData,
        baseLa: stringValue,
        baseLactate: stringValue,
        results: rows
      };
      onTestDataChange(updatedTestData);
      setTimeout(() => {
        isUpdatingFromUserInput.current = false;
      }, 300);
      return;
    }
    
    if (field === 'sport') {
      const newFormData = {
        ...formData,
        sport: value
      };
      setFormData(newFormData);
      
      // Update rows with converted power values
      const updatedRows = rows.map(row => {
        let power = row.power;
        if (value === 'bike' && power) {
          power = convertPaceToSeconds(power);
        } else if ((value === 'run' || value === 'swim') && power) {
          power = convertSecondsToPace(power);
        }
        return { ...row, power };
      });
      setRows(updatedRows);
      
      const updatedTestData = {
        ...testData,
        title: newFormData.title,
        description: newFormData.description,
        weight: newFormData.weight,
        sport: value,
        baseLactate: newFormData.baseLa,
        date: newFormData.date,
        specifics: newFormData.specifics,
        comments: newFormData.comments,
        results: updatedRows
      };
      
      logDataChange('Sport Change', updatedTestData);
      onTestDataChange(updatedTestData);
      return;
    }

    // For other field changes
    // IMPORTANT: For baseLa, preserve the exact string value as typed by user (including "1." or "1,")
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    // Spread newFormData FIRST so optional fields (restingHR, maxLactate,
    // stageDurationSec, etc.) propagate up without each one having to be
    // listed explicitly. Then re-override the canonical fields below to
    // preserve previous semantics for date / baseLa / specifics.
    const updatedTestData = {
      ...testData,
      ...newFormData,
      title: newFormData.title,
      description: newFormData.description,
      weight: newFormData.weight,
      sport: newFormData.sport,
      // For baseLa, keep exact string value - don't convert, don't parse, don't format
      // Use the value directly as string, preserving partial inputs like "1." or "1,"
      baseLa: field === 'baseLa' ? (typeof value === 'string' ? value : String(value)) : newFormData.baseLa,
      // Also store in baseLactate as string for compatibility (will be parsed only when saving)
      baseLactate: field === 'baseLa' ? (typeof value === 'string' ? value : String(value)) : newFormData.baseLa,
      date: newFormData.date,
      specifics: newFormData.specifics,
      comments: newFormData.comments,
      results: rows
    };
    
    logDataChange('Field Update', updatedTestData);
    onTestDataChange(updatedTestData);
  };

  const handleDeleteRow = (rowIndex) => {
    const updatedRows = rows.filter((_, index) => index !== rowIndex);
    updatedRows.forEach((row, index) => (row.interval = index + 1));
    setRows(updatedRows);
  };

  const handleAddRow = () => {
    const newRow = {
      interval: rows.length + 1,
      power: '',
      heartRate: '',
      lactate: '',
      glucose: '',
      RPE: '',
      intervalType: 'work',
    };

    setRows([...rows, newRow]);
  };

  // Toggle a row between 'work' (counted in the LT curve) and 'recovery'
  // (saved but excluded from regression / LT1 / LT2). Used when the user
  // logs a post-test recovery sample at low intensity — without this flag
  // that sample would distort the polynomial fit and the X axis.
  const handleToggleRecoveryRow = (rowIndex) => {
    setRows(prev => prev.map((r, i) =>
      i === rowIndex ? { ...r, intervalType: r.intervalType === 'recovery' ? 'work' : 'recovery' } : r
    ));
  };

  // ── Step-test wizard ─────────────────────────────────────────────────────
  // Generates an evenly-spaced ladder of intervals: starting value, increment
  // per step, number of steps. Replaces the current rows.
  const [stepWizardOpen, setStepWizardOpen] = useState(false);
  const [stepWizard, setStepWizard] = useState({
    start: '',
    increment: '',
    steps: 8,
    stageDurationSec: 180,
  });

  const formatPaceSeconds = (totalSec) => {
    const s = Math.max(0, Math.round(Number(totalSec) || 0));
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  const parsePaceInput = (val) => {
    if (val == null) return NaN;
    const s = String(val).trim();
    const mmss = s.match(/^(\d+):(\d{1,2})$/);
    if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };

  const handleApplyStepWizard = () => {
    const sport = formData.sport;
    const isPace = sport === 'run' || sport === 'swim';
    const stepsN = Math.max(1, Math.min(30, parseInt(stepWizard.steps, 10) || 0));

    let startN, incN;
    if (isPace) {
      // Pace input: MM:SS strings. Increment is in SECONDS (negative = getting faster).
      startN = parsePaceInput(stepWizard.start);
      incN = Number(String(stepWizard.increment).replace(',', '.'));
    } else {
      // Bike: watts. Both are numeric.
      startN = Number(String(stepWizard.start).replace(',', '.'));
      incN = Number(String(stepWizard.increment).replace(',', '.'));
    }
    if (!Number.isFinite(startN) || !Number.isFinite(incN) || stepsN < 1) {
      addNotification('Fill in start, increment and step count first.', 'warning');
      return;
    }
    const generated = Array.from({ length: stepsN }, (_, i) => {
      const v = startN + incN * i;
      return {
        interval: i + 1,
        power: isPace ? formatPaceSeconds(v) : String(Math.round(v)),
        heartRate: '',
        lactate: '',
        glucose: '',
        vo2: '',
        RPE: '',
        intervalType: 'work',
      };
    });
    setRows(generated);
    // Also propagate stage duration to the test-level metadata so the curve
    // calculator (and exports) can apply stage-duration corrections later.
    onTestDataChange({
      ...testData,
      ...formData,
      stageDurationSec: Number(stepWizard.stageDurationSec) || undefined,
      results: generated.map(r => ({ ...r })),
    });
    setStepWizardOpen(false);
    addNotification(`Generated ${stepsN} step intervals.`, 'success');
  };

  const handleDeleteTest = () => {
    if (window.confirm('Are you sure you want to delete this test? This action cannot be undone.')) {
      if (onDelete) {
        onDelete(testData);
        addNotification('Test deleted successfully', 'success');
      }
    }
  };

  // Handle input focus
  const handleInputFocus = (field, event) => {
    // setHelpPosition({
    //   top: `${rect.top - 80}px`,
    //   left: `${rect.left}px`
    // });
    // setActiveHelp(field);
  };

  // Handle input blur
  const handleInputBlur = () => {
    // Add small delay to make the help message more readable
    setTimeout(() => {
      // setActiveHelp(null);
    }, 200);
  };

  // Helper to get the correct ref for the current tutorial step
  const getTutorialInputRef = () => {
    if (currentTutorialStep < 0) return null;
    const step = tutorialSteps[currentTutorialStep];
    // For table fields like power_0, heartRate_0, etc.
    if (step.field.includes('_')) {
      return inputRefs.current[step.field] ? { current: inputRefs.current[step.field] } : null;
    }
    // For form fields
    return inputRefs.current[step.field] ? { current: inputRefs.current[step.field] } : null;
  };


  // Removed automatic formatting on blur - let user type whatever they want
  const handlePowerBlur = (index, value) => {
    // Do nothing - keep the value exactly as user typed it
    return;
  };

  // Update the input field in the table
  const renderInput = (index, field, value, placeholder) => {
    const isTutorialField = currentTutorialStep >= 0 && tutorialSteps[currentTutorialStep].field === `${field}_${index}`;
    let displayValue = value;
    
    // NO AUTOMATIC CONVERSIONS - let user type anything
    // Only show the raw value as stored in state
    return (
      <div className="min-w-0 overflow-hidden relative">
      <input 
          ref={el => inputRefs.current[`${field}_${index}`] = el}
        type="text"
          value={displayValue === undefined || displayValue === null ? '' : String(displayValue)}
          onChange={(e) => {
            handleValueChange(index, field, e.target.value);
          }}
          onBlur={(e) => {
            if (field === 'power' && (formData.sport === 'run' || formData.sport === 'swim')) {
              handlePowerBlur(index, e.target.value);
            }
          }}
          disabled={!isNewTest && !isEditMode}
          className={`w-full min-w-0 max-w-full box-border p-0.5 text-xs border rounded-lg text-center focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
            (!isNewTest && !isEditMode) ? 'bg-gray-50' : ''
          } ${isTutorialField ? 'ring-2 ring-primary border-primary' : ''}`}
          placeholder={placeholder}
        />
      </div>
    );
  };

  const baseLaValue = formData.baseLa === null || formData.baseLa === undefined ? '' : String(formData.baseLa);
  const baseLaTrimmed = baseLaValue.trim();
  const baseLaParsed = baseLaTrimmed ? parseFloat(baseLaTrimmed.replace(',', '.')) : 0;
  const isBaseLaInvalid = !baseLaTrimmed || Number.isNaN(baseLaParsed) || baseLaParsed <= 0;

  return (
    <div className="flex flex-col w-full min-w-0 max-w-full overflow-x-hidden p-2 sm:p-4 bg-white rounded-xl relative h-full">
      {/* keyframes moved to global CSS (index.css) */}

      {/* Single Tutorial Message Portal */}
      {demoMode && currentTutorialStep >= 0 && (
        <TutorialMessagePortal
          step={tutorialSteps[currentTutorialStep]}
          onNext={handleNextTutorialStep}
          onSkip={handleSkipTutorial}
          inputRef={getTutorialInputRef()}
        />
      )}

      {/* Corner actions: absolute inside card padding — no extra row; title row reserves horizontal space */}
      <div className="absolute z-20 top-1.5 right-1.5 sm:top-2 sm:right-2 flex items-center gap-0.5">
        {demoMode && (
          <button
            onClick={() => setCurrentTutorialStep(0)}
            className="text-primary hover:text-primary-dark transition-colors p-1 rounded-lg hover:bg-gray-100"
            aria-label="Start tutorial"
            title="Tutorial"
            type="button"
          >
            <HelpCircle size={22} />
          </button>
        )}

        <div className="relative" ref={formSettingsRef}>
          <button
            type="button"
            onClick={() => setShowFormSettings((v) => !v)}
            className={`text-gray-600 hover:text-gray-900 transition-colors p-1 rounded-lg hover:bg-gray-100 ${showFormSettings ? 'bg-gray-100 text-gray-900' : ''}`}
            aria-label="Form display settings"
            aria-expanded={showFormSettings}
            title="Display settings"
          >
            <Settings2 size={20} />
          </button>
          {showFormSettings && (
            <div
              className="absolute right-0 top-full mt-1 z-50 w-[min(calc(100vw-2rem),18rem)] rounded-xl border border-gray-200 bg-white shadow-lg p-3 space-y-3"
              role="dialog"
              aria-label="Test form display settings"
            >
              {(formData.sport === 'run' || formData.sport === 'swim') && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Input mode</label>
                    <div className="bg-gray-100 rounded-lg p-1 flex shadow-sm">
                      <button
                        type="button"
                        onClick={() => setInputMode('pace')}
                        className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${inputMode === 'pace' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                        disabled={!isNewTest && !isEditMode}
                      >
                        Pace
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputMode('speed')}
                        className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${inputMode === 'speed' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                        disabled={!isNewTest && !isEditMode}
                      >
                        Speed
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Unit system</label>
                    <div className="bg-gray-100 rounded-lg p-1 flex shadow-sm">
                      <button
                        type="button"
                        onClick={() => setUnitSystem('metric')}
                        className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${unitSystem === 'metric' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                        disabled={!isNewTest && !isEditMode}
                      >
                        {inputMode === 'pace' ? 'pace/km' : 'km/h'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnitSystem('imperial')}
                        className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${unitSystem === 'imperial' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                        disabled={!isNewTest && !isEditMode}
                      >
                        {inputMode === 'pace' ? 'pace/mile' : 'mph'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(!hasGlucoseData || !hasVO2Data) && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Show columns</label>
                  <div className="bg-gray-100 rounded-lg p-1 inline-flex flex-wrap gap-0 shadow-sm">
                    {!hasGlucoseData && (
                      <button
                        type="button"
                        onClick={() => setShowGlucose(!showGlucose)}
                        disabled={!isNewTest && !isEditMode}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${showGlucose ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                      >
                        Glucose
                      </button>
                    )}
                    {!hasVO2Data && (
                      <button
                        type="button"
                        onClick={() => setShowVO2(!showVO2)}
                        disabled={!isNewTest && !isEditMode}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${showVO2 ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                      >
                        VO₂
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">RPE scale</label>
                <div className="bg-gray-100 rounded-lg p-1 flex flex-col sm:flex-row shadow-sm gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setRpeScale('rpe');
                      onTestDataChange({
                        ...testData,
                        rpeScale: 'rpe',
                        results: rows
                      });
                    }}
                    className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${rpeScale === 'rpe' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                    disabled={!isNewTest && !isEditMode}
                  >
                    RPE (1–10)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRpeScale('borg');
                      onTestDataChange({
                        ...testData,
                        rpeScale: 'borg',
                        results: rows
                      });
                    }}
                    className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${rpeScale === 'borg' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                    disabled={!isNewTest && !isEditMode}
                  >
                    Borg (6–20)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowGlossary(true)}
          className="text-gray-500 hover:text-gray-700 transition-colors p-1 rounded-lg hover:bg-gray-100"
          aria-label="Show glossary"
          title="Training Glossary"
          type="button"
        >
          <Info size={20} />
        </button>
      </div>

      <div data-tour="tour-test-details" className="flex flex-col gap-2 flex-shrink-0 min-w-0 w-full">
        {/* Title and Edit Button Row — pr-* keeps text/Edit clear of corner icon cluster */}
        <div
          className={`flex items-center gap-2 min-w-0 ${
            demoMode ? 'pr-[5.5rem] sm:pr-24' : 'pr-14 sm:pr-16'
          }`}
        >
          <div className="flex-1 min-w-0">
            <input 
              ref={el => inputRefs.current['title'] = el}
              type="text"
              value={formData.title}
              onChange={(e) => {
                logClick('Title Input Change', { value: e.target.value });
                handleFormDataChange('title', e.target.value);
                setHighlightedField(null);
              }}
              disabled={!isNewTest && !isEditMode}
              className={`test-title-input w-full p-1.5 border rounded-lg text-sm ${
                highlightedField === 'title' ? 'border-red-500 ring-2 ring-red-200' : ''
              } ${(!isNewTest && !isEditMode) ? 'bg-gray-50' : ''}`}
              placeholder="Test Title *"
              required
            />
          </div>
          
          {/* Edit Mode Toggle - Only show for existing tests */}
          {!isNewTest && (
            <button
              disabled={!isPremium}
              onClick={() => {
                if (!isPremium) return;
                logClick('Edit/Cancel Button', { isEditMode });
                if (isEditMode) {
                  // Cancel: restore original data
                  if (originalTestData) {
                    // Restore formData
                    setFormData({
                      title: originalTestData.title || '',
                      description: originalTestData.description || '',
                      weight: originalTestData.weight?.toString() || '',
                      sport: normalizeSport(originalTestData.sport),
                      baseLa: originalTestData.baseLactate?.toString() || '',
                      date: formatDate(originalTestData.date),
                      specifics: originalTestData.specifics || { specific: '', weather: '' },
                      comments: originalTestData.comments || ''
                    });
                    
                    // Restore inputMode and unitSystem first (before restoring rows)
                    const restoredInputMode = originalTestData.inputMode || inputMode;
                    const restoredUnitSystem = originalTestData.unitSystem || unitSystem;
                    if (originalTestData.inputMode) {
                      setInputMode(originalTestData.inputMode);
                    }
                    if (originalTestData.unitSystem) {
                      setUnitSystem(originalTestData.unitSystem);
                    }
                    
                    // Restore rows with proper formatting based on restored inputMode/unitSystem
                    if (originalTestData.results && originalTestData.results.length > 0) {
                      const restoredRows = originalTestData.results.map(row => {
                        let power = row.power !== undefined && row.power !== null ? String(row.power) : '';
                        
                        // For existing tests, convert seconds from backend to display format
                        if ((originalTestData.sport === 'run' || originalTestData.sport === 'swim') && power) {
                          const powerNum = parseFloat(power);
                          // If it's a number >= 60, it's seconds from backend - convert to display format
                          if (!isNaN(powerNum) && powerNum >= 60 && !power.includes(':')) {
                            if (restoredInputMode === 'pace') {
                              power = convertSecondsToPace(powerNum);
                            } else if (restoredInputMode === 'speed') {
                              const speed = convertSecondsToSpeed(
                                powerNum,
                                restoredUnitSystem,
                                originalTestData.sport
                              );
                              const speedNum = Number(speed);
                              power = Number.isFinite(speedNum) ? speedNum.toFixed(1) : '';
                            } else {
                              power = convertSecondsToPace(powerNum);
                            }
                          }
                        }
                        
                        return {
                          interval: row.interval || 1,
                          power,
                          heartRate: row.heartRate ? String(row.heartRate) : '',
                          lactate: row.lactate ? String(row.lactate) : '',
                          glucose: row.glucose ? String(row.glucose) : '',
                          vo2: row.vo2 ? String(row.vo2) : '',
                          RPE: row.RPE ? String(row.RPE) : ''
                        };
                      });
                      setRows(restoredRows);
                    }
                    
                    setOriginalTestData(null);
                  }
                } else {
                  // Enter edit mode: save current state as original
                  setOriginalTestData({ ...testData });
                }
                setIsEditMode(!isEditMode);
              }}
              className={`shrink-0 justify-center px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap text-sm ${
                isEditMode
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                  : 'bg-primary hover:bg-primary-dark text-white'
              } ${!isPremium ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isEditMode ? (
                <>
                  <X size={14} />
                  Cancel
                </>
              ) : (
                <>
                  {isPremium ? <Edit size={14} /> : <Lock size={14} />}
                  Edit
                </>
              )}
            </button>
          )}
      </div>

      <textarea 
        value={formData.description} 
        onChange={(e) => handleFormDataChange('description', e.target.value)} 
          className="w-full p-1.5 border rounded-lg text-sm flex-shrink-0"
          disabled={!isNewTest && !isEditMode}
        placeholder="Description of this testing..." 
          rows={2}
      />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
          <div className="relative min-w-0">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Date</label>
        <input 
              ref={el => inputRefs.current['date'] = el}
          type="date" 
          value={formData.date}
          onChange={(e) => handleFormDataChange('date', e.target.value)} 
              className={`w-full p-1 border rounded-lg text-sm ${
                currentTutorialStep === 0 ? 'ring-2 ring-primary border-primary' : ''
              }`}
              disabled={!isNewTest && !isEditMode}
        />
          </div>

          <div className="relative min-w-0">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Weight</label>
        <input 
              ref={el => inputRefs.current['weight'] = el}
          type="text" 
          value={formData.weight} 
              onChange={(e) => handleFormDataChange('weight', e.target.value)}
              className={`w-full p-1 border rounded-lg text-sm ${
                currentTutorialStep === 2 ? 'ring-2 ring-primary border-primary' : ''
              }`}
              disabled={!isNewTest && !isEditMode}
              placeholder="kg"
            />
          </div>

          <div className="relative min-w-0">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Base La
              {isBaseLaInvalid && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            <div className="relative group">
              <input 
                ref={el => inputRefs.current['baseLa'] = el}
                type="text"
                value={formData.baseLa}
                onChange={(e) => handleFormDataChange('baseLa', e.target.value)}
                className={`w-full p-1 border rounded-lg text-sm ${
                  currentTutorialStep === 3 ? 'ring-2 ring-primary border-primary' : ''
                } ${
                  isBaseLaInvalid
                    ? 'border-red-300 bg-red-50' 
                    : ''
                }`}
                disabled={!isNewTest && !isEditMode}
                placeholder="mmol/L"
              />
              {isBaseLaInvalid && (
                <div className="absolute left-0 top-full mt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none max-w-xs">
                  <div className="bg-red-600 text-white text-xs rounded-lg px-3 py-2 shadow-lg relative">
                    <div className="space-y-1">
                      <p>⚠️ <strong>Base lactate is required</strong></p>
                      <p>for accurate threshold calculations</p>
                    </div>
                    <div className="absolute -top-1 left-4 w-2 h-2 bg-red-600 transform rotate-45"></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative min-w-0">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">
              Sport
              {!formData.sport && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            <div className="relative group">
              <select 
                ref={el => inputRefs.current['sport'] = el}
                value={formData.sport} 
                onChange={(e) => {
                  logClick('Sport Select Change', { value: e.target.value });
                  handleFormDataChange('sport', e.target.value);
                }}
                className={`w-full p-1 pr-7 border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary ${
                  currentTutorialStep === 1 ? 'ring-2 ring-primary border-primary' : ''
                } ${(!isNewTest && !isEditMode) ? 'bg-gray-50 cursor-not-allowed' : ''} ${
                  !formData.sport ? 'border-red-300 bg-red-50' : ''
                }`}
                style={{ WebkitAppearance: 'none', appearance: 'none' }}
                disabled={!isNewTest && !isEditMode}
              >
                <option value="">Sport *</option>
                <option value="run">Run</option>
                <option value="bike">Bike</option>
                <option value="swim">Swim</option>
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {!formData.sport && (
                <div className="absolute left-0 top-full mt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none max-w-xs">
                  <div className="bg-red-600 text-white text-xs rounded-lg px-3 py-2 shadow-lg relative">
                    <div className="space-y-1">
                      <p>⚠️ <strong>Sport is required</strong></p>
                      <p>Please select a sport for this test</p>
                    </div>
                    <div className="absolute -top-1 left-4 w-2 h-2 bg-red-600 transform rotate-45"></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Conditions</label>
        <input 
              ref={el => inputRefs.current['specifics'] = el}
              type="text"
              value={formData.specifics.specific}
              onChange={(e) => handleFormDataChange('specifics', { 
                ...formData.specifics, 
                specific: e.target.value 
              })}
              onFocus={(e) => handleInputFocus('specifics', e)}
              onBlur={handleInputBlur}
              className="w-full p-1 border rounded-lg text-sm"
              disabled={!isNewTest && !isEditMode}
              placeholder="e.g., Indoor"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Weather</label>
        <input
              ref={el => inputRefs.current['specifics'] = el}
              type="text"
              value={formData.specifics.weather}
              onChange={(e) => handleFormDataChange('specifics', {
                ...formData.specifics,
                weather: e.target.value
              })}
              onFocus={(e) => handleInputFocus('specifics', e)}
              onBlur={handleInputBlur}
              className="w-full p-1 border rounded-lg text-sm"
              disabled={!isNewTest && !isEditMode}
              placeholder="e.g., 20°C"
        />
      </div>
      </div>

      {/* Optional protocol / pre-and-post values. These don't influence the
          curve fit on their own, but they're saved on the test so future
          comparisons and a Modified-Dmax / IAT analysis can use them. */}
      {(isNewTest || isEditMode) && (
        <details className="mt-2 rounded-lg border border-gray-100 bg-gray-50/40">
          <summary className="cursor-pointer px-2 py-1.5 text-xs font-semibold text-gray-700 select-none">
            Protocol & pre/post values <span className="text-gray-400 font-normal">(optional)</span>
          </summary>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 pt-1">
            <div className="min-w-0">
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Resting HR</label>
              <input
                type="number"
                value={formData.restingHR ?? ''}
                onChange={(e) => handleFormDataChange('restingHR', e.target.value)}
                className="w-full p-1 border rounded-lg text-sm"
                placeholder="bpm"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Pre-load HR</label>
              <input
                type="number"
                value={formData.preLoadHR ?? ''}
                onChange={(e) => handleFormDataChange('preLoadHR', e.target.value)}
                className="w-full p-1 border rounded-lg text-sm"
                placeholder="bpm"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Max HR</label>
              <input
                type="number"
                value={formData.maxHR ?? ''}
                onChange={(e) => handleFormDataChange('maxHR', e.target.value)}
                className="w-full p-1 border rounded-lg text-sm"
                placeholder="bpm"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Max Lactate</label>
              <input
                type="text"
                value={formData.maxLactate ?? ''}
                onChange={(e) => handleFormDataChange('maxLactate', e.target.value)}
                className="w-full p-1 border rounded-lg text-sm"
                placeholder="mmol/L"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Recovery HR +3min</label>
              <input
                type="number"
                value={formData.recoveryHR3min ?? ''}
                onChange={(e) => handleFormDataChange('recoveryHR3min', e.target.value)}
                className="w-full p-1 border rounded-lg text-sm"
                placeholder="bpm"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Recovery La +3min</label>
              <input
                type="text"
                value={formData.recoveryLactate3min ?? ''}
                onChange={(e) => handleFormDataChange('recoveryLactate3min', e.target.value)}
                className="w-full p-1 border rounded-lg text-sm"
                placeholder="mmol/L"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Stage duration</label>
              <input
                type="number"
                min={30}
                max={900}
                step={30}
                value={formData.stageDurationSec ?? ''}
                onChange={(e) => handleFormDataChange('stageDurationSec', e.target.value)}
                className="w-full p-1 border rounded-lg text-sm"
                placeholder="seconds"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Rest between</label>
              <input
                type="number"
                min={0}
                max={300}
                step={5}
                value={formData.restBetweenStagesSec ?? ''}
                onChange={(e) => handleFormDataChange('restBetweenStagesSec', e.target.value)}
                className="w-full p-1 border rounded-lg text-sm"
                placeholder="seconds"
              />
            </div>
          </div>
        </details>
      )}
      </div>

        {/* Data Table */}
      <div data-tour="tour-measurements-table" className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {(() => {
            // Calculate columns: Int + Power + HR + La + (Glu?) + (VO2?) + RPE + (Del?)
            // Count actual visible columns - must match header and row structure exactly
            // Header structure: Int | Power | HR | La | [Glu?] | [VO2?] | RPE | [Del?]
            // Row structure: Int | Power | HR | La | [Glu?] | [VO2?] | RPE | [Del?]
            
            // Count flexible columns (all except Int and Del which are fixed)
            let flexibleColCount = 0;
            flexibleColCount += 1; // Power/Pace
            flexibleColCount += 1; // HR
            flexibleColCount += 1; // La
            if (hasGlucoseData || showGlucose) {
              flexibleColCount += 1; // Glucose
            }
            if (hasVO2Data || showVO2) {
              flexibleColCount += 1; // VO2
            }
            flexibleColCount += 1; // RPE (always shown)
            
            // minmax(0,1fr) so tracks can shrink on narrow viewports (no horizontal scroll)
            const gridTemplateCols = ['32px']; // Int (fixed width)
            for (let i = 0; i < flexibleColCount; i++) {
              gridTemplateCols.push('minmax(0, 1fr)');
            }
            if (isNewTest || isEditMode) {
              gridTemplateCols.push('32px'); // Delete column only when rows can be removed
            }
            
            const gridTemplateColumns = gridTemplateCols.join(' ');
            
            return (
              <div className="flex flex-col flex-1 min-h-0 min-w-0">
                <div className="w-full min-w-0 max-w-full flex-shrink-0 overflow-x-hidden touch-manipulation" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <div className="grid gap-0.5 items-center p-1 text-xs font-semibold bg-gray-100 rounded-lg w-full min-w-0" style={{ gridTemplateColumns }}>
                    <div className="text-center min-w-0 truncate">Int.</div>
                    <div className="text-center min-w-0 truncate">
                      {formData.sport === 'bike' ? 'Power' :
                        (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'pace' ? 'Pace' :
                        (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'speed' ? 'Speed' : 'Power'}
                    </div>
                    <div className="text-center min-w-0 truncate">HR</div>
                    <div className="text-center min-w-0 truncate">La</div>
                    {(hasGlucoseData || showGlucose) && <div className="text-center min-w-0 truncate">Glu</div>}
                    {(hasVO2Data || showVO2) && <div className="text-center min-w-0 truncate">VO₂</div>}
                    {(hasRPEData || true) && <div className="text-center min-w-0 truncate">RPE</div>}
                    {(isNewTest || isEditMode) && <div className="text-center min-w-0 truncate">Del</div>}
                  </div>
                </div>
                <div className="relative flex-1 min-h-0 min-w-0 max-h-full overflow-x-hidden touch-manipulation" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div
                  ref={rowsScrollRef}
                  className={`h-full w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden ${rowsCanScroll ? 'pr-1' : ''}`}
                >
                  {rows.map((row, index) => {
                    const isRecovery = row.intervalType === 'recovery';
                    return (
                    <div
                      key={index}
                      className={`grid gap-0.5 items-center mt-0.5 p-0.5 sm:p-1 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors w-full min-w-0 max-w-full ${isRecovery ? 'bg-amber-50/60 italic opacity-80' : 'bg-white'}`}
                      style={{ gridTemplateColumns }}
                      title={isRecovery ? 'Recovery sample — excluded from the lactate curve' : undefined}
                    >
                      {(isNewTest || isEditMode) ? (
                        <button
                          type="button"
                          onClick={() => handleToggleRecoveryRow(index)}
                          className={`mx-auto w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold transition-colors ${isRecovery ? 'bg-amber-200 text-amber-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                          title={isRecovery ? 'Recovery row — click to mark as work' : 'Click to mark as recovery (excluded from curve)'}
                        >
                          {isRecovery ? 'R' : index + 1}
                        </button>
                      ) : (
                        <div className={`text-center text-xs min-w-0 overflow-hidden ${isRecovery ? 'text-amber-700' : ''}`}>
                          {isRecovery ? 'R' : index + 1}
                        </div>
                      )}
                      {renderInput(index, 'power', row.power,
                        formData.sport === 'bike' ? 'W' :
                        (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'pace' ? 'MM:SS' :
                        (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'speed' ? (unitSystem === 'imperial' ? 'mph' : 'km/h') : 'MM:SS'
                      )}
                      {renderInput(index, 'heartRate', row.heartRate, 'bpm')}
                      {renderInput(index, 'lactate', row.lactate, 'mmol/L')}
                      {(hasGlucoseData || showGlucose) && renderInput(index, 'glucose', row.glucose, 'mmol/L')}
                      {(hasVO2Data || showVO2) && renderInput(index, 'vo2', row.vo2, 'ml/kg/min')}
                      {(hasRPEData || true) && renderInput(index, 'RPE', row.RPE, rpeScale === 'borg' ? '6-20' : '1-10')}
                      {(isNewTest || isEditMode) && (
                        <div className="flex justify-center items-center min-w-0 overflow-hidden min-h-[1.5rem]">
                          <button
                            type="button"
                            onClick={() => {
                              logClick('Delete Row Button', { rowIndex: index });
                              handleDeleteRow(index);
                            }}
                            className="p-0.5 text-red-600 hover:text-red-800 transition-colors"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
                {rowsCanScroll && !rowsAtTop && (
                  <div className="pointer-events-none absolute top-0 left-0 right-0 h-5 bg-gradient-to-b from-white via-white/80 to-transparent rounded-t-lg" />
                )}
                {rowsCanScroll && !rowsAtBottom && (
                  <>
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white via-white/90 to-transparent rounded-b-lg" />
                    <button
                      type="button"
                      onClick={handleScrollHintClick}
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-gray-600 bg-white/95 px-2 py-0.5 rounded-full border border-gray-200 hover:bg-white hover:text-gray-800 transition-colors"
                      title="Scroll down"
                    >
                      Scroll for more rows
                    </button>
                  </>
                )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Action buttons only when editing — view mode gives full height to the measurements table */}
        {(isNewTest || isEditMode) && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-2 flex-shrink-0">
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                data-tour="tour-add-interval"
                type="button"
                disabled={!isPremium && !isNewTest}
                onClick={() => {
                  if (!isPremium && !isNewTest) return;
                  logClick('Add Interval Button');
                  handleAddRow();
                }}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors ${!isPremium && !isNewTest ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {!isPremium && !isNewTest ? <Lock size={14} /> : <Plus size={14} />} Add Interval
              </button>
              <button
                type="button"
                onClick={() => {
                  logClick('Open Step Wizard');
                  // Default the wizard with sensible per-sport seeds.
                  const isPace = formData.sport === 'run' || formData.sport === 'swim';
                  setStepWizard({
                    start: isPace ? (formData.sport === 'swim' ? '02:00' : '06:00') : '100',
                    increment: isPace ? '-10' : '25',
                    steps: 6,
                    stageDurationSec: 180,
                  });
                  setStepWizardOpen(true);
                }}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors"
                title="Generate a step-test ladder of intervals"
              >
                <Settings2 size={14} /> Step wizard
              </button>
            </div>

            <div className="flex gap-2 w-full sm:w-auto">
              {!isNewTest && !demoMode && (
                <button
                  type="button"
                  onClick={() => {
                    logClick('Delete Test Button', { testId: testData._id });
                    handleDeleteTest();
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                >
                  <Trash size={14} /> Delete Test
                </button>
              )}

              {!demoMode && (
                <button
                  type="button"
                  data-tour="tour-save-test"
                  disabled={isSaving}
                  onClick={() => {
                    logClick('Save Button', { isNewTest });
                    void handleSaveChanges();
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:pointer-events-none"
                >
                  <Save size={14} />{' '}
                  {isSaving ? 'Saving…' : isNewTest ? 'Save Test' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        )}

      {/* Field Validation Messages */}
      {highlightedField && (
        <div className="mt-2 text-red-500 text-sm flex-shrink-0">
          Please fill in the {highlightedField} field
        </div>
      )}

      {/* Glossary Modal */}
      <TrainingGlossary
        isOpen={showGlossary}
        onClose={() => setShowGlossary(false)}
        initialTerm="Lactate Testing"
        initialCategory="Lactate"
      />

      {/* Step-test wizard — generates an evenly-spaced ladder of intervals. */}
      {stepWizardOpen && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setStepWizardOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Step-test wizard</h3>
              <button
                type="button"
                onClick={() => setStepWizardOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Generates intervals automatically. Existing rows will be replaced.
              {formData.sport === 'bike'
                ? ' Start watts + increment in watts.'
                : ' Pace as MM:SS; increment in seconds (negative = getting faster).'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Start {formData.sport === 'bike' ? '(W)' : '(MM:SS)'}
                </label>
                <input
                  type="text"
                  value={stepWizard.start}
                  onChange={(e) => setStepWizard(s => ({ ...s, start: e.target.value }))}
                  placeholder={formData.sport === 'bike' ? '100' : '06:00'}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Step {formData.sport === 'bike' ? '(W)' : '(seconds)'}
                </label>
                <input
                  type="text"
                  value={stepWizard.increment}
                  onChange={(e) => setStepWizard(s => ({ ...s, increment: e.target.value }))}
                  placeholder={formData.sport === 'bike' ? '25' : '-10'}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Steps</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={stepWizard.steps}
                  onChange={(e) => setStepWizard(s => ({ ...s, steps: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Stage (sec)</label>
                <input
                  type="number"
                  min={30}
                  max={900}
                  step={30}
                  value={stepWizard.stageDurationSec}
                  onChange={(e) => setStepWizard(s => ({ ...s, stageDurationSec: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-gray-50 border border-gray-100 p-2 text-[11px] text-gray-600">
              {(() => {
                const isPace = formData.sport === 'run' || formData.sport === 'swim';
                const stepsN = Math.max(1, Math.min(30, parseInt(stepWizard.steps, 10) || 0));
                const startN = isPace ? parsePaceInput(stepWizard.start) : Number(String(stepWizard.start).replace(',', '.'));
                const incN = Number(String(stepWizard.increment).replace(',', '.'));
                if (!Number.isFinite(startN) || !Number.isFinite(incN)) return 'Fill all fields to preview.';
                const first = isPace ? formatPaceSeconds(startN) : `${Math.round(startN)} W`;
                const last = isPace ? formatPaceSeconds(startN + incN * (stepsN - 1)) : `${Math.round(startN + incN * (stepsN - 1))} W`;
                return `Preview: ${stepsN} stages, ${first} → ${last}, ${stepWizard.stageDurationSec || 180}s each.`;
              })()}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setStepWizardOpen(false)}
                className="flex-1 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyStepWizard}
                className="flex-1 px-3 py-2 text-sm text-white bg-indigo-500 rounded-lg hover:bg-indigo-600"
              >
                Generate
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default TestingForm;
