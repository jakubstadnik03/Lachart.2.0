import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Trash, Plus, X, Save, HelpCircle, ArrowRight, Edit } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { trackEvent } from '../../utils/analytics';

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
      className="z-50 bg-white rounded-lg shadow-lg border border-primary/10 p-4 max-w-xs"
      style={{
        position: 'absolute',
        top: coords.top - 16, // 16px above input
        left: coords.left,
        transform: 'translate(-50%, -100%)',
        animation: 'fadeIn 0.3s ease-out',
        pointerEvents: 'auto',
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

function TestingForm({ testData, onTestDataChange, onSave, onGlucoseColumnChange, onDelete, demoMode = false, disableInnerScroll = false }) {
  const { addNotification } = useNotification();
  const [currentTutorialStep, setCurrentTutorialStep] = useState(0);
  const [highlightedField, setHighlightedField] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [inputMode, setInputMode] = useState('pace');
  const [unitSystem, setUnitSystem] = useState('metric'); // 'metric' (km, pace/km) nebo 'imperial' (mile, mph)

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

  const convertSecondsToSpeed = (seconds, unitSystem) => {
    if (!seconds) return 0;
    if (unitSystem === 'imperial') {
      // Convert pace (seconds per km) to speed (mph)
      // First convert seconds per km to km/h, then to mph
      const kmh = 3600 / seconds; // Convert seconds per km to km/h
      return kmh * 0.621371; // Convert km/h to mph
    } else {
      // Convert pace (seconds per km) to speed (km/h)
      return 3600 / seconds;
    }
  };

  const convertSpeedToSeconds = (speed, unitSystem) => {
    if (!speed || speed === 0) return 0;
    const speedNum = typeof speed === 'string' ? parseFloat(speed.replace(',', '.')) : speed;
    if (isNaN(speedNum) || speedNum <= 0) return 0;
    
    if (unitSystem === 'imperial') {
      // Convert speed (mph) to pace (seconds per km)
      // First convert mph to km/h, then to seconds per km
      const kmh = speedNum / 0.621371; // Convert mph to km/h
      if (kmh <= 0) return 0;
      return 3600 / kmh; // Convert km/h to seconds per km
    } else {
      // Convert speed (km/h) to pace (seconds per km)
      if (speedNum <= 0) return 0;
      return 3600 / speedNum;
    }
  };

  const [formData, setFormData] = useState({
    title: testData?.title || '',
    description: testData?.description || '',
    weight: testData?.weight || '',
    sport: testData?.sport || '',
    baseLa: testData?.baseLactate || '',
    date: formatDate(testData?.date),
    specifics: testData?.specifics || { specific: '', weather: '' },
    comments: testData?.comments || ''
  });

  useEffect(() => {
    if (testData) {
      if (testData.unitSystem) {
        setUnitSystem(testData.unitSystem);
      }
      if (testData.inputMode) {
        setInputMode(testData.inputMode);
      }
    }
  }, [testData]);

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
              const seconds = convertSpeedToSeconds(powerNum, unitSystem);
              return { ...row, power: convertSecondsToPace(seconds) };
            }
            // For values 50-60, might be ambiguous - keep as is or convert based on context
          }
        } else if (inputMode === 'speed') {
          // Convert to speed format
          
          // If it has ':', it's pace format - convert to speed
          if (powerStr.includes(':')) {
            const seconds = convertPaceToSeconds(powerStr);
            const speed = convertSecondsToSpeed(seconds, unitSystem);
            return { ...row, power: speed.toFixed(1) };
          }
          
          // If it's a number, check what it is
          if (!isNaN(powerNum)) {
            // If it's a large number (>= 60), assume it's seconds from backend - convert to speed
            if (powerNum >= 60) {
              const speed = convertSecondsToSpeed(powerNum, unitSystem);
              return { ...row, power: speed.toFixed(1) };
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
      ['power', 'heartRate', 'lactate', 'glucose', 'RPE'].forEach(field => {
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

  // Update showGlucose based on whether there's any non-zero glucose data
  useEffect(() => {
    if (!hasGlucoseData) {
      setShowGlucose(false);
    }
  }, [hasGlucoseData]);

  // Notify parent component when glucose column visibility changes
  useEffect(() => {
    if (onGlucoseColumnChange) {
      onGlucoseColumnChange(!showGlucose);
    }
  }, [showGlucose, onGlucoseColumnChange]);

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
  useEffect(() => {
    if (testData) {
      setFormData({
        title: testData.title || '',
        description: testData.description || '',
        weight: testData.weight?.toString() || '',
        sport: testData.sport || '',
        baseLa: testData.baseLactate?.toString() || '',
        date: formatDate(testData.date),
        specifics: testData.specifics || { specific: '', weather: '' },
        comments: testData.comments || ''
      });
      if (testData.results && testData.results.length > 0) {
        const initialRows = testData.results.map(row => {
          let power = row.power !== undefined && row.power !== null ? String(row.power) : '';
          
          // For existing tests (from backend), convert seconds to display format
          // Backend always stores pace in seconds for run/swim
          if (!isNewTest && (testData.sport === 'run' || testData.sport === 'swim') && power) {
            const powerNum = parseFloat(power);
            // If it's a number > 60, it's seconds from backend - convert to display format
            if (!isNaN(powerNum) && powerNum > 60 && !power.includes(':')) {
              // Convert based on current inputMode and unitSystem
              if (inputMode === 'pace') {
                // Convert seconds to MM:SS format
                power = convertSecondsToPace(powerNum);
              } else if (inputMode === 'speed') {
                // Convert seconds to speed (km/h or mph)
                const speed = convertSecondsToSpeed(powerNum, unitSystem);
                power = speed.toFixed(1);
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
            RPE: row.RPE ? String(row.RPE) : ''
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
          RPE: ''
        }]);
      }
    } else {
      setRows([{
        interval: 1,
        power: '',
        heartRate: '',
        lactate: '',
        glucose: '',
        RPE: ''
      }]);
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
      // It's pace format, convert to seconds
      const seconds = convertPaceToSeconds(powerStr);
      console.log(`[convertPowerToSeconds] Pace "${powerStr}" -> ${seconds}s`);
      return seconds;
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
      result = convertSpeedToSeconds(powerNum, currentUnitSystem);
      console.log(`[convertPowerToSeconds] Speed ${powerNum} ${currentUnitSystem === 'imperial' ? 'mph' : 'km/h'} -> ${result}s`);
    } else if (isLikelySeconds) {
      // It's already in seconds, return as is
      result = powerNum;
      console.log(`[convertPowerToSeconds] Already seconds: ${powerNum}s`);
    } else {
      // Ambiguous case: use current inputMode to decide
      if (currentInputMode === 'speed') {
        result = convertSpeedToSeconds(powerNum, currentUnitSystem);
        console.log(`[convertPowerToSeconds] Ambiguous, using speed mode: ${powerNum} -> ${result}s`);
      } else {
        // Assume it's already seconds if in pace mode
        result = powerNum;
        console.log(`[convertPowerToSeconds] Ambiguous, using pace mode (assume seconds): ${powerNum}s`);
      }
    }
    
    return result;
  };

  const handleSaveChanges = () => {
    if (!validateForm()) {
      return;
    }
    const finalInputMode = inputMode;
    const finalUnitSystem = unitSystem;
    
    const updatedTest = {
      ...testData,
      title: formData.title.trim(),
      description: formData.description?.trim() || '',
      weight: formData.weight === '' ? 0 : parseFloat(formData.weight.replace(',', '.')),
      sport: formData.sport,
      baseLactate: formData.baseLa === '' ? 0 : parseFloat(formData.baseLa.replace(',', '.')),
      date: formData.date,
      specifics: formData.specifics || { specific: '', weather: '' },
      comments: formData.comments?.trim() || '',
      unitSystem: finalUnitSystem,
      inputMode: finalInputMode,
      results: rows.map((row, index) => {
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
          RPE: convertToNumber(row.RPE)
        };
      })
    };
    if (onSave) {
      try {
        onSave(updatedTest);
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
        addNotification('Failed to save test data', 'error');
      }
    }
  };

  const validateForm = () => {
    const errors = [];
    
    if (!formData.title?.trim()) {
      errors.push('Test title is required');
      setHighlightedField('title');
    }
    
    if (!formData.sport) {
      errors.push('Sport is required');
      setHighlightedField('sport');
    }
    
    if (errors.length > 0) {
      errors.forEach(error => addNotification(error, 'error'));
      return false;
    }
    
    return true;
  };

  const handleFormDataChange = (field, value) => {
    logClick('Form Field Change', { field, value });
    
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
    const newFormData = { ...formData, [field]: value };
    setFormData(newFormData);

    const updatedTestData = {
      ...testData,
      title: newFormData.title,
      description: newFormData.description,
      weight: newFormData.weight,
      sport: newFormData.sport,
      baseLactate: newFormData.baseLa,
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
      RPE: ''
    };
    
    setRows([...rows, newRow]);
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
          className={`w-full min-w-0 p-0.5 text-xs border rounded-lg text-center focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
            (!isNewTest && !isEditMode) ? 'bg-gray-50' : ''
          } ${isTutorialField ? 'ring-2 ring-primary border-primary' : ''}`}
          placeholder={placeholder}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col max-w-lg mx-auto p-1 sm:px-1 sm:py-4 bg-gray-50 rounded-lg relative">
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

      {/* Help Button */}
      {demoMode && (
        <button
          onClick={() => setCurrentTutorialStep(0)}
          className="absolute top-[1.3rem] right-4 text-primary hover:text-primary-dark transition-colors"
        >
          <HelpCircle size={24} />
              </button>
            )}

      <div className="space-y-2">
        {/* Title and Edit Button Row */}
        <div className="flex items-center gap-2 justify-between">
          <div className="flex-1">
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
              onClick={() => {
                logClick('Edit/Cancel Button', { isEditMode });
                if (isEditMode) {
                  // Cancel: restore original data
                  if (originalTestData) {
                    // Restore formData
                    setFormData({
                      title: originalTestData.title || '',
                      description: originalTestData.description || '',
                      weight: originalTestData.weight?.toString() || '',
                      sport: originalTestData.sport || '',
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
                              const speed = convertSecondsToSpeed(powerNum, restoredUnitSystem);
                              power = speed.toFixed(1);
                            } else {
                              // Fallback: convert to pace
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
              className={`px-2 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap text-sm ${
                isEditMode 
                  ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                  : 'bg-primary hover:bg-primary-dark text-white'
              }`}
            >
              {isEditMode ? (
                <>
                  <X size={14} />
                  Cancel
                </>
              ) : (
                <>
                  <Edit size={14} />
                  Edit
                </>
              )}
            </button>
          )}
      </div>

      <textarea 
        value={formData.description} 
        onChange={(e) => handleFormDataChange('description', e.target.value)} 
          className="w-full p-1.5 border rounded-lg text-sm"
          disabled={!isNewTest && !isEditMode}
        placeholder="Description of this testing..." 
          rows={2}
      />

        <div className="grid grid-cols-4 gap-2">
          <div className="relative">
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

          <div className="relative">
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

          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Base La</label>
            <input 
              ref={el => inputRefs.current['baseLa'] = el}
              type="text"
              value={formData.baseLa}
              onChange={(e) => handleFormDataChange('baseLa', e.target.value)}
              className={`w-full p-1 border rounded-lg text-sm ${
                currentTutorialStep === 3 ? 'ring-2 ring-primary border-primary' : ''
              }`}
              disabled={!isNewTest && !isEditMode}
              placeholder="mmol/L"
            />
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-0.5">Sport</label>
        <select 
              ref={el => inputRefs.current['sport'] = el}
          value={formData.sport} 
              onChange={(e) => {
                logClick('Sport Select Change', { value: e.target.value });
                handleFormDataChange('sport', e.target.value);
              }}
              className={`w-full p-1 border rounded-lg text-sm ${
                currentTutorialStep === 1 ? 'ring-2 ring-primary border-primary' : ''
              }`}
              disabled={!isNewTest && !isEditMode}
            >
              <option value="">Sport *</option>
          <option value="run">Run</option>
          <option value="bike">Bike</option>
          <option value="swim">Swim</option>
        </select>
          </div>
        </div>

        {/* Unit System Controls */}
        {(formData.sport === 'run' || formData.sport === 'swim') && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Input Mode</label>
              <div className="bg-gray-100 rounded-lg p-1 inline-flex shadow-sm">
                <button
                  onClick={() => setInputMode('pace')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${inputMode === 'pace' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                  disabled={!isNewTest && !isEditMode}
                >
                  Pace
                </button>
                <button
                  onClick={() => setInputMode('speed')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${inputMode === 'speed' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                  disabled={!isNewTest && !isEditMode}
                >
                  Speed
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Unit System</label>
              <div className="bg-gray-100 rounded-lg p-1 inline-flex shadow-sm">
                <button
                  onClick={() => setUnitSystem('metric')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${unitSystem === 'metric' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                  disabled={!isNewTest && !isEditMode}
                >
                  {inputMode === 'pace' ? 'pace/km' : 'km/h'}
                </button>
                <button
                  onClick={() => setUnitSystem('imperial')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${unitSystem === 'imperial' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                  disabled={!isNewTest && !isEditMode}
                >
                  {inputMode === 'pace' ? 'pace/mile' : 'mph'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
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
          <div>
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

        {/* Data Table */}
        <div className="mt-3 overflow-x-auto">
          {(() => {
            const gridCols = (isNewTest || isEditMode) 
              ? (showGlucose 
                  ? 'grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px]'
                  : 'grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px]')
              : (showGlucose
                  ? 'grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]'
                  : 'grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]');
            
            return (
              <>
                <div className={`grid ${gridCols} gap-0.5 items-center p-1 text-xs font-semibold bg-gray-100 rounded-lg w-full min-w-0`}>
                  <div className="text-center min-w-0 overflow-hidden">Int.</div>
                  <div className="text-center min-w-0 overflow-hidden">
  {formData.sport === 'bike' ? 'Power' :
    (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'pace' ? 'Pace' :
    (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'speed' ? 'Speed' : 'Power'}
</div>
                  <div className="text-center min-w-0 overflow-hidden">HR</div>
                  <div className="text-center min-w-0 overflow-hidden">La</div>
                  {showGlucose && <div className="text-center min-w-0 overflow-hidden">Glu</div>}
                  <div className="text-center min-w-0 overflow-hidden">RPE</div>
                  {(isNewTest || isEditMode) && <div className="text-center min-w-0 overflow-hidden">Del</div>}
                </div>
                <div className={`${disableInnerScroll ? '' : 'max-h-[400px] overflow-y-auto'}`}>
                  {rows.map((row, index) => (
                    <div
                      key={index}
                      className={`grid ${gridCols} gap-0.5 items-center mt-0.5 p-1 bg-white rounded-lg w-full min-w-0 hover:bg-gray-50 transition-colors`}
                    >
                      <div className="text-center text-xs min-w-0 overflow-hidden">{index + 1}</div>
                      {renderInput(index, 'power', row.power,
                        formData.sport === 'bike' ? 'W' :
                        (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'pace' ? 'MM:SS' :
                        (formData.sport === 'run' || formData.sport === 'swim') && inputMode === 'speed' ? (unitSystem === 'imperial' ? 'mph' : 'km/h') : 'MM:SS'
                      )}
                      {renderInput(index, 'heartRate', row.heartRate, 'bpm')}
                      {renderInput(index, 'lactate', row.lactate, 'mmol/L')}
                      {showGlucose && renderInput(index, 'glucose', row.glucose, 'mmol/L')}
                      {renderInput(index, 'RPE', row.RPE, '1-10')}
                      {(isNewTest || isEditMode) && (
                        <div className="flex justify-center min-w-0 overflow-hidden">
        <button 
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
                  ))}
                </div>
              </>
            );
          })()}
        </div>

        {/* Action Buttons */}
        {(isNewTest || isEditMode) && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-2">
            <button 
              onClick={() => {
                logClick('Add Interval Button');
                handleAddRow();
              }}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
            >
              <Plus size={14} /> Add Interval
            </button>

          <div className="flex gap-2 w-full sm:w-auto">
              {!isNewTest && (
            <button 
                  onClick={() => {
                    logClick('Delete Test Button', { testId: testData._id });
                    handleDeleteTest();
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                >
                  <Trash size={14} /> Delete Test
            </button>
              )}

            <button 
                onClick={() => {
                  logClick('Save Button', { isNewTest });
                  handleSaveChanges();
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
            >
                <Save size={14} /> {isNewTest ? 'Save Test' : 'Save Changes'}
            </button>
            </div>
          </div>
        )}
      </div>

      {/* Field Validation Messages */}
      {highlightedField && (
        <div className="mt-2 text-red-500 text-sm">
          Please fill in the {highlightedField} field
        </div>
      )}
    </div>
  );
}

export default TestingForm;
