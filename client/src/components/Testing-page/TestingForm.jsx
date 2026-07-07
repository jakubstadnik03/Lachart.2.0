import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Trash, Plus, X, Save, HelpCircle, ArrowRight, Edit, Info, Settings2, Lock } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthProvider';
import { trackEvent } from '../../utils/analytics';
import { resolveDistanceUnitSystem } from '../../utils/unitsConverter';
import TrainingGlossary from '../DashboardPage/TrainingGlossary';
import { sanitizeLactateInput } from '../../utils/lactateInput';

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
    example: 'Resting sample before warm-up (e.g., 1.2 mmol/L). Not the same as lactate from step 1 — see Protocol tips below.'
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
    example: 'Value at sampling time for this step (mmol/L, e.g. 2.5). Power/HR = full step intensity.'
  }
];

const PROTOCOL_TIPS = [
  { label: 'Base La', text: 'at rest, before test' },
  { label: 'Row 1', text: 'first workload step' },
  { label: 'Lactate column', text: 'measured value at sampling time' },
  { label: 'Power / HR', text: 'intensity of that step' },
];

const FieldHint = ({ children, wide = false }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const recalc = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = wide ? 288 : 240;
    setCoords({
      top: rect.top - 8,
      left: Math.min(
        Math.max(8, rect.left + rect.width / 2 - width / 2),
        window.innerWidth - width - 8,
      ),
    });
  }, [wide]);

  useEffect(() => {
    if (!open) return undefined;
    recalc();
    const close = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-field-hint-popover]')) return;
      setOpen(false);
    };
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close, { passive: true });
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open, recalc]);

  const popover = open
    ? ReactDOM.createPortal(
        <div
          data-field-hint-popover
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: wide ? 288 : 240,
            transform: 'translateY(-100%)',
            zIndex: 10050,
          }}
          className="rounded-xl bg-gray-900 px-3 py-2 text-white text-[10px] sm:text-[11px] leading-snug shadow-xl font-normal normal-case text-left"
        >
          {children}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="inline-flex items-center justify-center w-4 h-4 ml-0.5 align-middle rounded-full bg-primary/10 text-primary cursor-pointer flex-shrink-0 touch-manipulation"
        aria-label="More info"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <HelpCircle size={12} strokeWidth={2.5} />
      </button>
      {popover}
    </>
  );
};

const ProtocolTipsPanel = ({ className = '' }) => (
  <details className={`rounded-lg border border-primary/15 bg-primary/5 ${className}`}>
    <summary className="cursor-pointer px-2.5 py-1.5 text-[11px] font-semibold text-primary select-none">
      Protocol tips — how to enter your test
    </summary>
    <ul className="px-3 pb-2 pt-0 text-[11px] text-gray-600 space-y-1">
      {PROTOCOL_TIPS.map(({ label, text }) => (
        <li key={label} className="flex gap-1.5">
          <span className="text-primary font-semibold shrink-0">{label}</span>
          <span>= {text}</span>
        </li>
      ))}
    </ul>
  </details>
);

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
    stageDistance: testData?.stageDistance ?? '',
    restBetweenStagesSec: testData?.restBetweenStagesSec ?? '',
  });

  useEffect(() => {
    // Priority: user profile units > testData unitSystem > default 'metric'
    setUnitSystem(resolveDistanceUnitSystem(user, testData?.unitSystem || 'metric'));
    
    // Testing-form input mode resolution order:
    //   1. Whatever the test was saved with (explicit override per test).
    //   2. The user's global Preferences → Running Pace Display
    //      ('minpkm' → 'pace' | 'kmh' → 'speed').
    //   3. Default 'pace'.
    if (testData?.inputMode) {
      setInputMode(testData.inputMode);
    } else if (user?.trainingPreferences?.paceDisplay) {
      setInputMode(user.trainingPreferences.paceDisplay === 'kmh' ? 'speed' : 'pace');
    }

    if (testData?.rpeScale) {
      setRpeScale(testData.rpeScale);
    } else if (user?.trainingPreferences?.rpeScale) {
      setRpeScale(user.trainingPreferences.rpeScale);
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
  // Map of row-index → human-readable error message for invalid pace inputs.
  // Drives the red border + tooltip on the row's power input so a typo like
  // "5.75" doesn't silently disappear from the curve.
  const [paceInputErrors, setPaceInputErrors] = useState({});
  
  // Store original test data when entering edit mode for cancel functionality
  const [originalTestData, setOriginalTestData] = useState(null);

  const [showGlucose, setShowGlucose] = useState(true);
  const [showVO2, setShowVO2] = useState(true);
  // Running power (watts, e.g. Stryd) — optional second metric for run tests,
  // shown alongside pace. Defaults OFF, auto-shown when any row has data.
  const [showRunPower, setShowRunPower] = useState(false);
  // Per-user preference: show the Dur/Dist stage column.
  // Defaults OFF — auto-shown when any row actually has stage data.
  const [showStageCol, setShowStageCol] = useState(() => {
    try {
      const stored = localStorage.getItem('testingForm_showStageCol');
      // '1' = explicitly on, '0' = explicitly off, null = default (off)
      return stored === '1';
    } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('testingForm_showStageCol', showStageCol ? '1' : '0'); } catch {}
  }, [showStageCol]);
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
      ['power', 'runPower', 'heartRate', 'lactate', 'glucose', 'vo2', 'RPE'].forEach(field => {
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

  // Check if any row has running-power data (run tests only)
  const hasRunPowerData = formData.sport === 'run' && rows.some(row =>
    row.runPower !== undefined &&
    row.runPower !== null &&
    row.runPower !== '' &&
    Number(row.runPower) !== 0
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

  // Auto-show running-power column when any row has data; hide when empty in view mode
  useEffect(() => {
    if (hasRunPowerData) {
      setShowRunPower(true);
    } else if (!isNewTest && !isEditMode) {
      setShowRunPower(false);
    }
  }, [hasRunPowerData, isNewTest, isEditMode]);

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
    const nextValue = (field === 'lactate' || field === 'glucose')
      ? sanitizeLactateInput(value)
      : value;
    console.log('Input change:', { rowIndex, field, value: nextValue });
    
    // Always store the value as a string
    const updatedRows = rows.map((row, index) => {
      if (index === rowIndex) {
        return { ...row, [field]: String(nextValue) };
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
          duration: row.duration,
          distanceMeters: row.distanceMeters,
          power: row.power,
          runPower: row.runPower,
          heartRate: row.heartRate,
          lactate: row.lactate,
          glucose: row.glucose,
          vo2: row.vo2,
          RPE: row.RPE,
          intervalType: row.intervalType,
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
          
          // Duration is stored as seconds in the DB; render as MM:SS in the
          // form. Empty string means "use the test-level stageDurationSec".
          let durationStr = '';
          if (row.duration !== undefined && row.duration !== null && row.duration !== '') {
            const n = Number(row.duration);
            if (Number.isFinite(n) && n > 0) {
              const m = Math.floor(n / 60);
              const s = Math.round(n % 60);
              durationStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            } else if (typeof row.duration === 'string') {
              durationStr = row.duration;
            }
          }
          return {
            interval: row.interval || 1,
            duration: durationStr,
            distanceMeters: row.distanceMeters !== undefined && row.distanceMeters !== null && row.distanceMeters !== ''
              ? String(row.distanceMeters) : '',
            power,
            // Running power (watts) stored as-is from the backend.
            runPower: row.runPower ? String(row.runPower) : '',
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
          duration: '',
          distanceMeters: '',
          power: '',
          runPower: '',
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

          // Per-row stage duration: accept MM:SS string from the input, or
          // already-numeric seconds. Empty means "use the test-level default".
          let durationSec = null;
          if (row.duration !== undefined && row.duration !== null && String(row.duration).trim() !== '') {
            const s = String(row.duration).trim();
            const mmss = s.match(/^(\d+):(\d{1,2})$/);
            if (mmss) {
              durationSec = Number(mmss[1]) * 60 + Number(mmss[2]);
            } else {
              const n = Number(s.replace(',', '.'));
              if (Number.isFinite(n) && n > 0) durationSec = Math.round(n);
            }
          }

          return {
            interval: index + 1,
            power: powerInSeconds,
            // Running power (watts) — only persisted for run tests that
            // actually have a value, so bike/swim rows stay clean.
            ...(formData.sport === 'run' && row.runPower !== undefined && row.runPower !== null && String(row.runPower).trim() !== ''
              ? { runPower: convertToNumber(row.runPower) }
              : {}),
            heartRate: convertToNumber(row.heartRate),
            lactate: convertToNumber(row.lactate),
            glucose: convertToNumber(row.glucose),
            vo2: convertToNumber(row.vo2),
            RPE: convertToNumber(row.RPE),
            // Preserve recovery flag + per-row stage duration / distance so
            // the curve calculator can exclude recovery samples and short
            // stages. Both fields are optional — if neither is set the row is
            // treated as "default-length" and never penalized.
            intervalType: row.intervalType === 'recovery' ? 'recovery' : 'work',
            ...(durationSec != null ? { duration: durationSec } : {}),
            ...(row.distanceMeters !== undefined && row.distanceMeters !== null && String(row.distanceMeters).trim() !== ''
              ? { distanceMeters: convertToNumber(row.distanceMeters) }
              : {}),
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
    
    // Base lactate is OPTIONAL (2026-05) — many testers don't take a
    // resting sample. Only validate that the value PARSES if it was
    // provided; empty silently passes through to the save flow.
    if (baseLaRaw) {
      const baseLaNum = parseFloat(baseLaRaw.replace(',', '.'));
      if (isNaN(baseLaNum) || baseLaNum <= 0) {
        errors.push('Base lactate must be a positive number (or leave empty).');
        setHighlightedField('baseLa');
      }
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
      const stringValue = sanitizeLactateInput(typeof value === 'string' ? value : String(value));
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
    const lactateFields = new Set(['maxLactate', 'recoveryLactate3min']);
    const nextValue = lactateFields.has(field)
      ? sanitizeLactateInput(value)
      : value;
    const newFormData = { ...formData, [field]: nextValue };
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
      duration: '',
      distanceMeters: '',
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
  // Wizard input mode for run/swim: 'pace' (MM:SS) or 'speed' (km/h or mph).
  // Bike always uses watts and ignores this. Defaults to the form's current
  // inputMode so the wizard feels consistent with the table.
  const [wizardInputMode, setWizardInputMode] = useState('pace');
  useEffect(() => {
    setWizardInputMode(inputMode === 'speed' ? 'speed' : 'pace');
  }, [inputMode, stepWizardOpen]);

  // Whether the Dur column captures stage *duration* (MM:SS) or *distance*
  // (meters). Swim tests are often distance-based (100m, 200m, 400m), so we
  // default to distance for swim. Pulled from testData.stageMeasureMode so
  // the choice is remembered across re-opens.
  const [stageMeasureMode, setStageMeasureMode] = useState(() => {
    if (testData?.stageMeasureMode === 'distance' || testData?.stageMeasureMode === 'duration') {
      return testData.stageMeasureMode;
    }
    return (testData?.sport === 'swim' || formData?.sport === 'swim') ? 'distance' : 'duration';
  });
  const isDistanceMode = stageMeasureMode === 'distance';
  const stageColumnLabel = isDistanceMode ? 'Dist' : 'Dur';
  const stageColumnTooltip = isDistanceMode
    ? 'Distance of this stage in meters. Leave blank to use the test-level default. Shorter stages are excluded from the curve so they don\'t pull the regression.'
    : 'Duration from step start to blood sample (MM:SS). E.g. 5:00 if sampled at minute 5 of a 6 min stage. Leave blank to use test-level stage duration.';

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
    const isPaceSport = sport === 'run' || sport === 'swim';
    const isSpeedInput = isPaceSport && wizardInputMode === 'speed';
    const stepsN = Math.max(1, Math.min(30, parseInt(stepWizard.steps, 10) || 0));

    // Trim early — same reason as in the preview: an empty input ("")
    // turns into Number("") = 0 and used to silently produce a flat ladder
    // (every stage identical). Require a real value and reject zero step.
    const startStr = String(stepWizard.start ?? '').trim();
    const incStr = String(stepWizard.increment ?? '').trim();
    if (!startStr || !incStr) {
      addNotification('Fill in both Start and Step before generating.', 'warning');
      return;
    }

    let startN, incN;
    if (isPaceSport && !isSpeedInput) {
      // Pace input: MM:SS strings. Increment in SECONDS (negative = faster).
      startN = parsePaceInput(startStr);
      incN = Number(incStr.replace(',', '.'));
    } else if (isSpeedInput) {
      // Speed input: km/h (or mph). Both numeric. Pace gets faster as speed
      // grows → flip the sign when projecting to pace-seconds below.
      startN = Number(startStr.replace(',', '.'));
      incN = Number(incStr.replace(',', '.'));
    } else {
      // Bike: watts. Both are numeric.
      startN = Number(startStr.replace(',', '.'));
      incN = Number(incStr.replace(',', '.'));
    }
    if (!Number.isFinite(startN) || !Number.isFinite(incN) || stepsN < 1) {
      addNotification('Fill in start, increment and step count first.', 'warning');
      return;
    }
    if (incN === 0) {
      addNotification('Step can\'t be 0 — every stage would have the same value.', 'warning');
      return;
    }
    const stageSec = Number(stepWizard.stageDurationSec) || 0;
    const defaultDur = stageSec > 0 ? formatPaceSeconds(stageSec) : '';
    const generated = Array.from({ length: stepsN }, (_, i) => {
      const v = startN + incN * i;
      let powerValue;
      if (isSpeedInput) {
        // Keep the wizard's speed values AS speed (e.g. "12.0", "13.0", …)
        // and flip the form's inputMode to 'speed' below so the table
        // column header and units match. Previously we silently converted
        // to MM:SS pace, which surprised users who picked Speed mode
        // deliberately and then saw paces.
        powerValue = Number.isFinite(v) && v > 0 ? Number(v).toFixed(1) : '';
      } else if (isPaceSport) {
        powerValue = formatPaceSeconds(v);
      } else {
        powerValue = String(Math.round(v));
      }
      return {
        interval: i + 1,
        // Pre-fill duration so users see the protocol the wizard set up. Last
        // row can be edited to a shorter value if the test was truncated.
        duration: defaultDur,
        power: powerValue,
        heartRate: '',
        lactate: '',
        glucose: '',
        vo2: '',
        RPE: '',
        intervalType: 'work',
      };
    });
    setRows(generated);
    // Sync the parent form's display mode to the wizard's input mode so the
    // table header (Pace vs Speed) and the row values match. Without this,
    // generating speed rows would leave the form in Pace mode and the
    // useEffect at line ~284 would re-convert "12.0" → "05:00" pace — which
    // is exactly the data-loss the user reported.
    if (isPaceSport) {
      setInputMode(isSpeedInput ? 'speed' : 'pace');
    }
    // Also propagate stage duration AND the chosen inputMode to the
    // test-level metadata so the curve calculator (and exports) read the
    // right axis. Without `inputMode`, a saved test would forget whether
    // its `power` column held pace seconds or km/h.
    onTestDataChange({
      ...testData,
      ...formData,
      stageDurationSec: Number(stepWizard.stageDurationSec) || undefined,
      inputMode: isPaceSport ? (isSpeedInput ? 'speed' : 'pace') : (testData?.inputMode || undefined),
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


  // Normalise common pace shorthand (5.30, 5,30, 530) to the canonical
  // "MM:SS" form expected by the lactate-curve parser. Honza Kubeš
  // (beta tester, 2026-05) typed "5.30" expecting min:sec — the value got
  // stored as the float 5.30 (≈ 5 sec/km), which downstream code rejected
  // by silently dropping that point from the curve. The graph then turned
  // red and the user had to play "guess the typo" with no inline signal.
  //
  // Behaviour (pace mode only, run/swim):
  //   "5:30"  → "5:30"                       (already canonical)
  //   "5.30"  → "5:30"                       (dot → colon)
  //   "5,30"  → "5:30"                       (comma → colon)
  //   "530"   → "5:30"                       (3-digit shortcut)
  //   "5:7"   → "5:07"                       (pad seconds)
  //   "5:75"  → keep raw + flag as error     (seconds > 59)
  //   "abc"   → keep raw + flag as error     (non-numeric)
  // Errors are surfaced via paceInputErrors so the row's input gets a
  // red border + tooltip with the explanation instead of failing silently.
  const handlePowerBlur = (index, value) => {
    const sport = formData.sport;
    if (sport !== 'run' && sport !== 'swim') return;
    if (inputMode !== 'pace') return;
    const raw = String(value ?? '').trim();
    if (!raw) {
      setPaceInputErrors(prev => { const n = { ...prev }; delete n[index]; return n; });
      return;
    }

    // Already canonical MM:SS / M:SS — validate seconds 0–59 and pad
    const colonMatch = raw.match(/^(\d+):(\d{1,2})$/);
    if (colonMatch) {
      const mins = Number(colonMatch[1]);
      const secs = Number(colonMatch[2]);
      if (secs > 59) {
        setPaceInputErrors(prev => ({ ...prev, [index]: `Seconds must be 0–59 (got "${colonMatch[2]}")` }));
        return;
      }
      const padded = `${mins}:${String(secs).padStart(2, '0')}`;
      setPaceInputErrors(prev => { const n = { ...prev }; delete n[index]; return n; });
      if (padded !== raw) handleValueChange(index, 'power', padded);
      return;
    }

    // mm.ss or mm,ss — convert separator → colon, pad seconds
    const sepMatch = raw.match(/^(\d+)[.,](\d{1,2})$/);
    if (sepMatch) {
      const mins = Number(sepMatch[1]);
      const secs = Number(sepMatch[2]);
      if (secs > 59) {
        setPaceInputErrors(prev => ({ ...prev, [index]: `Seconds must be 0–59 (got "${sepMatch[2]}")` }));
        return;
      }
      const fixed = `${mins}:${String(secs).padStart(2, '0')}`;
      setPaceInputErrors(prev => { const n = { ...prev }; delete n[index]; return n; });
      handleValueChange(index, 'power', fixed);
      return;
    }

    // Bare 3- or 4-digit shorthand: 530 → 5:30, 1030 → 10:30
    const bareMatch = raw.match(/^(\d{3,4})$/);
    if (bareMatch) {
      const digits = bareMatch[1];
      const secs = Number(digits.slice(-2));
      const mins = Number(digits.slice(0, -2));
      if (secs > 59) {
        setPaceInputErrors(prev => ({ ...prev, [index]: `Seconds must be 0–59 (got "${String(secs)}")` }));
        return;
      }
      const fixed = `${mins}:${String(secs).padStart(2, '0')}`;
      setPaceInputErrors(prev => { const n = { ...prev }; delete n[index]; return n; });
      handleValueChange(index, 'power', fixed);
      return;
    }

    // Anything else — flag as error so the input lights up red and the
    // user sees WHY before the lactate curve breaks
    setPaceInputErrors(prev => ({ ...prev, [index]: `Use MM:SS format (e.g. 5:30) — "${raw}" isn't valid pace` }));
  };

  // Detect rows whose POWER (or pace) is non-monotonic compared to the
  // earlier rows. Real tests are step protocols — intensity strictly
  // increases each stage. If row N is lower than the max seen in rows
  // 0..N-1 *and* we're in the second half of the test, that's almost
  // certainly a user typo (e.g. "196" typed instead of "296") which
  // would otherwise rip the polynomial fit apart.
  //
  // Returns a Set<index> of bad rows. Skips recovery rows (those are
  // expected to be lower-power on purpose).
  const anomalousPowerRowIndices = React.useMemo(() => {
    const bad = new Set();
    if (!Array.isArray(rows) || rows.length < 3) return bad;
    const isPace = formData.sport === 'run' || formData.sport === 'swim';
    // Direction of "harder" depends on BOTH the sport AND the input mode:
    //   • bike (watts)      → higher W = harder       → score = +p
    //   • run/swim, pace    → lower sec/km = harder   → score = −p
    //   • run/swim, SPEED   → higher km/h = harder    → score = +p
    // Without the inputMode check, the detector previously flagged a perfectly
    // valid ascending speed ladder (12, 13, 14, 15, 16, 17 km/h on a Run test)
    // as anomalous from the midpoint onwards — the fix is to invert the sign
    // only when we're actually reading pace-seconds.
    const isPaceMode = isPace && inputMode === 'pace';
    const parseRowPower = (r) => {
      if (r?.intervalType === 'recovery') return null;
      const raw = r?.power;
      if (raw == null || raw === '') return null;
      const str = String(raw).trim().replace(',', '.');
      // For pace inputs we may get "MM:SS" — convert to seconds to compare.
      if (isPaceMode && str.includes(':')) {
        const [m, s] = str.split(':').map(Number);
        if (Number.isFinite(m) && Number.isFinite(s)) return m * 60 + s;
        return null;
      }
      const n = Number(str);
      return Number.isFinite(n) ? n : null;
    };
    // Normalise so "harder" is always a HIGHER number — see comment above.
    const hardnessScore = (p) => (p == null ? null : (isPaceMode ? -p : p));
    let maxHardness = -Infinity;
    const half = Math.floor(rows.length / 2);
    for (let i = 0; i < rows.length; i++) {
      const h = hardnessScore(parseRowPower(rows[i]));
      if (h == null) continue;
      if (h < maxHardness && i >= half) {
        bad.add(i);
      } else if (h > maxHardness) {
        maxHardness = h;
      }
    }
    return bad;
    // inputMode added 2026-05: anomaly detection inverts hardness sign for
    // pace mode vs speed/watts mode (see isPaceMode inside) — so the memo
    // must re-run when the user toggles between Pace and Speed displays.
  }, [rows, formData.sport, inputMode]);

  // Update the input field in the table
  const renderInput = (index, field, value, placeholder) => {
    const isTutorialField = currentTutorialStep >= 0 && tutorialSteps[currentTutorialStep].field === `${field}_${index}`;
    const isAnomalous = field === 'power' && anomalousPowerRowIndices.has(index);
    const paceErr = field === 'power' ? paceInputErrors[index] : null;
    let displayValue = value;

    // NO AUTOMATIC CONVERSIONS - let user type anything
    // Only show the raw value as stored in state
    return (
      <div className="min-w-0 overflow-hidden relative">
      <input
          ref={el => inputRefs.current[`${field}_${index}`] = el}
        type="text"
          inputMode={field === 'lactate' || field === 'glucose' ? 'decimal' : undefined}
          value={displayValue === undefined || displayValue === null ? '' : String(displayValue)}
          onChange={(e) => {
            handleValueChange(index, field, e.target.value);
            // Clear stale pace error as soon as user edits — re-validated on blur
            if (field === 'power' && paceInputErrors[index]) {
              setPaceInputErrors(prev => { const n = { ...prev }; delete n[index]; return n; });
            }
          }}
          onBlur={(e) => {
            if (field === 'power' && (formData.sport === 'run' || formData.sport === 'swim')) {
              handlePowerBlur(index, e.target.value);
            }
          }}
          disabled={!isNewTest && !isEditMode}
          title={paceErr || (isAnomalous ? 'This value is lower than an earlier stage — likely a typo (e.g. 196 typed instead of 296). It will be excluded from the lactate curve.' : undefined)}
          className={`w-full min-w-0 max-w-full box-border p-0.5 text-xs border rounded-lg text-center focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${
            (!isNewTest && !isEditMode) ? 'bg-gray-50' : ''
          } ${isTutorialField ? 'ring-2 ring-primary border-primary' : ''} ${
            (isAnomalous || paceErr) ? 'border-red-500 bg-red-50 text-red-700 font-semibold ring-1 ring-red-300' : ''
          }`}
          placeholder={placeholder}
        />
        {paceErr && (
          <div className="absolute left-0 right-0 top-full mt-0.5 z-10 text-[9px] leading-tight text-red-600 font-medium bg-red-50 border border-red-200 rounded px-1 py-0.5 pointer-events-none whitespace-normal">
            {paceErr}
          </div>
        )}
      </div>
    );
  };

  const baseLaValue = formData.baseLa === null || formData.baseLa === undefined ? '' : String(formData.baseLa);
  const baseLaTrimmed = baseLaValue.trim();
  const baseLaParsed = baseLaTrimmed ? parseFloat(baseLaTrimmed.replace(',', '.')) : 0;
  // Base lactate is OPTIONAL (2026-05): not every lab takes a resting sample
  // and some testers prefer to omit it rather than enter a fake "1.0" zero.
  // Empty is fine — only flag as invalid when the user has TYPED something
  // that isn't a positive number (catches typos like "abc" or negative values).
  const isBaseLaInvalid = baseLaTrimmed !== '' && (Number.isNaN(baseLaParsed) || baseLaParsed <= 0);

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

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Show columns</label>
                <div className="bg-gray-100 rounded-lg p-1 inline-flex flex-wrap gap-0 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setShowStageCol(v => !v)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${(showStageCol) ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                    title="Show or hide the Dur / Dist column on the intervals table"
                  >
                    {isDistanceMode ? 'Dist' : 'Dur'}
                  </button>
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
                  {formData.sport === 'run' && !hasRunPowerData && (
                    <button
                      type="button"
                      onClick={() => setShowRunPower(!showRunPower)}
                      disabled={!isNewTest && !isEditMode}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${showRunPower ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                      title="Show or hide the running Power (watts) column — e.g. Stryd"
                    >
                      Power
                    </button>
                  )}
                </div>
              </div>

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
              className={`w-full p-1 border rounded-lg text-sm appearance-none h-[30px] ${
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
            <label className="flex items-center text-xs font-medium text-gray-700 mb-0.5">
              Base La
              <FieldHint>
                Before warm-up — not step 1 lactate
              </FieldHint>
              {isBaseLaInvalid && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            <div className="relative group">
              <input 
                ref={el => inputRefs.current['baseLa'] = el}
                type="text"
                inputMode="decimal"
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
                      <p>⚠️ <strong>Must be a positive number</strong></p>
                      <p>Leave blank if you didn't measure resting lactate.</p>
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
                inputMode="decimal"
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
                inputMode="decimal"
                value={formData.recoveryLactate3min ?? ''}
                onChange={(e) => handleFormDataChange('recoveryLactate3min', e.target.value)}
                className="w-full p-1 border rounded-lg text-sm"
                placeholder="mmol/L"
              />
            </div>
            <div className="min-w-0">
              <label className="flex items-center text-[11px] font-medium text-gray-600 mb-0.5">
                Stage duration
                <FieldHint wide>
                  Time from step start to blood sample. For 6 min stages sampled at min 5, enter 5:00 (300 s). Stages ≥ 4 min do not change threshold math.
                </FieldHint>
              </label>
              <input
                type="number"
                min={30}
                max={900}
                step={30}
                value={formData.stageDurationSec ?? ''}
                onChange={(e) => handleFormDataChange('stageDurationSec', e.target.value)}
                className="w-full p-1 border rounded-lg text-sm"
                placeholder="e.g. 300 (5 min)"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Stage distance</label>
              <input
                type="number"
                min={25}
                max={5000}
                step={25}
                value={formData.stageDistance ?? ''}
                onChange={(e) => handleFormDataChange('stageDistance', e.target.value)}
                className="w-full p-1 border rounded-lg text-sm"
                placeholder="meters"
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
      <ProtocolTipsPanel className="mb-2 flex-shrink-0" />
      <div data-tour="tour-measurements-table" className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {(() => {
            // Auto-show stage column if any row has actual duration/distance data
            const hasStageData = rows.some(r =>
              (r.duration       !== undefined && r.duration       !== null && String(r.duration).trim()       !== '') ||
              (r.distanceMeters !== undefined && r.distanceMeters !== null && String(r.distanceMeters).trim() !== '')
            );
            // Show if user explicitly enabled it OR data already exists
            const shouldShowStageCol = showStageCol || hasStageData;
            // Running power (watts) — run tests only, when toggled on or data exists
            const shouldShowRunPower = formData.sport === 'run' && (
              hasRunPowerData || ((isNewTest || isEditMode) && showRunPower)
            );

            // Calculate columns: Int + Dur + Pace + [Pwr?] + HR + La + (Glu?) + (VO2?) + RPE + (Del?)
            // Count actual visible columns - must match header and row structure exactly
            // Header structure: Int | Dur | Pace | [Pwr?] | HR | La | [Glu?] | [VO2?] | RPE | [Del?]
            // Row structure:    Int | Dur | Pace | [Pwr?] | HR | La | [Glu?] | [VO2?] | RPE | [Del?]

            // Count flexible columns (all except Int and Del which are fixed)
            let flexibleColCount = 0;
            if (shouldShowStageCol) flexibleColCount += 1; // Duration / Distance — togglable in settings
            flexibleColCount += 1; // Power/Pace
            if (shouldShowRunPower) flexibleColCount += 1; // Running power (watts)
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
                    {shouldShowStageCol && ((isNewTest || isEditMode) ? (
                      <button
                        type="button"
                        onClick={() => {
                          const next = isDistanceMode ? 'duration' : 'distance';
                          setStageMeasureMode(next);
                          // Persist on the test so it's remembered on reopen.
                          onTestDataChange({ ...testData, ...formData, stageMeasureMode: next, results: rows });
                        }}
                        className="mx-auto px-1 py-0.5 rounded-md text-[10px] font-bold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 transition-colors flex items-center gap-0.5"
                        title={`${stageColumnTooltip}\n\nClick to switch to ${isDistanceMode ? 'duration (MM:SS)' : 'distance (meters)'}.`}
                      >
                        {stageColumnLabel}
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 10l5-5 5 5M7 14l5 5 5-5" />
                        </svg>
                      </button>
                    ) : (
                      <div className="text-center min-w-0 truncate" title={stageColumnTooltip}>{stageColumnLabel}</div>
                    ))}
                    {/* Power / Pace / Speed — clickable toggle for run/swim
                        between pace (MM:SS/km or /100m) and speed (km/h or
                        mph). Bike is always "Power" — no toggle. */}
                    {(() => {
                      const isPaceSport = formData.sport === 'run' || formData.sport === 'swim';
                      const speedUnit = unitSystem === 'imperial' ? 'mph' : 'km/h';
                      const label = formData.sport === 'bike'
                        ? 'Power'
                        : inputMode === 'speed' ? 'Speed' : 'Pace';
                      const togglable = isPaceSport && (isNewTest || isEditMode);
                      if (!togglable) {
                        return <div className="text-center min-w-0 truncate">{label}</div>;
                      }
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const next = inputMode === 'pace' ? 'speed' : 'pace';
                            setInputMode(next);
                            onTestDataChange({ ...testData, ...formData, inputMode: next, results: rows });
                          }}
                          className="mx-auto px-1 py-0.5 rounded-md text-[10px] font-bold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 transition-colors flex items-center gap-0.5"
                          title={`Currently showing ${label} (${inputMode === 'speed' ? speedUnit : 'MM:SS'}). Click to switch to ${inputMode === 'pace' ? `speed (${speedUnit})` : 'pace (MM:SS)'}.`}
                        >
                          {label}
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M7 10l5-5 5 5M7 14l5 5 5-5" />
                          </svg>
                        </button>
                      );
                    })()}
                    {shouldShowRunPower && <div className="text-center min-w-0 truncate" title="Running power (watts) — e.g. Stryd">Pwr</div>}
                    <div className="text-center min-w-0 truncate">HR</div>
                    <div className="text-center min-w-0 truncate flex items-center justify-center">
                      La
                      <FieldHint>Measured at sampling time for this step (mmol/L).</FieldHint>
                    </div>
                    {(hasGlucoseData || showGlucose) && <div className="text-center min-w-0 truncate">Glu</div>}
                    {(hasVO2Data || showVO2) && <div className="text-center min-w-0 truncate">VO₂</div>}
                    {/* RPE / Borg toggle — RPE is 1–10, Borg is 6–20. Persisted
                        on the test via testData.rpeScale so reopening keeps
                        the chosen scale. */}
                    {(hasRPEData || true) && (
                      (isNewTest || isEditMode) ? (
                        <button
                          type="button"
                          onClick={() => {
                            const next = rpeScale === 'rpe' ? 'borg' : 'rpe';
                            setRpeScale(next);
                            onTestDataChange({ ...testData, ...formData, rpeScale: next, results: rows });
                          }}
                          className="mx-auto px-1 py-0.5 rounded-md text-[10px] font-bold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 transition-colors flex items-center gap-0.5"
                          title={`Currently using ${rpeScale === 'borg' ? 'Borg (6–20)' : 'RPE (1–10)'} scale. Click to switch.`}
                        >
                          {rpeScale === 'borg' ? 'Borg' : 'RPE'}
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M7 10l5-5 5 5M7 14l5 5 5-5" />
                          </svg>
                        </button>
                      ) : (
                        <div className="text-center min-w-0 truncate">
                          {rpeScale === 'borg' ? 'Borg' : 'RPE'}
                        </div>
                      )
                    )}
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
                      {/* Per-row stage duration (MM:SS) OR distance (meters)
                          depending on the column toggle in the header.
                          Hidden when no data and user hasn't enabled the column. */}
                      {shouldShowStageCol && (isDistanceMode
                        ? renderInput(index, 'distanceMeters', row.distanceMeters,
                            formData.stageDurationSec || formData.stageDistance
                              ? String(formData.stageDistance || '')
                              : 'm'
                          )
                        : renderInput(index, 'duration', row.duration,
                            formData.stageDurationSec
                              ? formatPaceSeconds(formData.stageDurationSec)
                              : 'MM:SS'
                          ))}
                      {renderInput(index, 'power', row.power,
                        // Placeholder for the "Speed/Pace/Power" column.
                        // - Bike has no pace concept → always watts.
                        // - Run/swim respect the chosen inputMode (pace 'MM:SS'
                        //   or speed 'km/h' / 'mph').
                        // - Before a sport is selected, fall back to the user's
                        //   global Preferences (inputMode is already seeded from
                        //   user.trainingPreferences.paceDisplay on mount), so a
                        //   km/h user never sees a stale 'MM:SS' default.
                        formData.sport === 'bike' ? 'W'
                          : inputMode === 'speed'
                            ? (unitSystem === 'imperial' ? 'mph' : 'km/h')
                            : 'MM:SS'
                      )}
                      {shouldShowRunPower && renderInput(index, 'runPower', row.runPower, 'W')}
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

        {/* Action buttons only when editing — wrap onto multiple rows on
            narrow viewports so they never overflow the form card. */}
        {(isNewTest || isEditMode) && (
          <div className="flex flex-wrap items-center gap-2 mt-2 flex-shrink-0">
            <button
              data-tour="tour-add-interval"
              type="button"
              disabled={!isPremium && !isNewTest}
              onClick={() => {
                if (!isPremium && !isNewTest) return;
                logClick('Add Interval Button');
                handleAddRow();
              }}
              className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors whitespace-nowrap ${!isPremium && !isNewTest ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {!isPremium && !isNewTest ? <Lock size={14} /> : <Plus size={14} />} Add Interval
            </button>
            <button
              type="button"
              onClick={() => {
                logClick('Open Step Wizard');
                // Smart re-open (2026-05): if there are existing rows we infer
                // the wizard fields FROM them so re-opening the wizard shows
                // exactly what's already in the table — not stale defaults
                // that don't match (e.g. table has 12-17 km/h in Speed mode
                // but wizard shows 06:00 pace). Falls back to per-sport seeds
                // only when the table is empty.
                const sport = formData.sport;
                const isPace = sport === 'run' || sport === 'swim';

                // Helper: read a row's "power" cell as a clean number, taking
                // into account whether it's stored as MM:SS pace or a plain
                // number (watts / km/h).
                const readRow = (idx) => {
                  const raw = rows?.[idx]?.power;
                  if (raw == null || raw === '') return null;
                  const str = String(raw).trim().replace(',', '.');
                  if (isPace && inputMode === 'pace' && str.includes(':')) {
                    const [m, s] = str.split(':').map(Number);
                    if (Number.isFinite(m) && Number.isFinite(s)) return m * 60 + s;
                    return null;
                  }
                  const n = Number(str);
                  return Number.isFinite(n) ? n : null;
                };

                // Build wizard seed from existing rows when at least 2 valid
                // power values are present (need 2 to know the increment).
                const r0 = readRow(0);
                const r1 = readRow(1);
                const hasInferableRows = Number.isFinite(r0) && Number.isFinite(r1);

                let seed;
                if (hasInferableRows) {
                  // Increment is row[1] − row[0]. For pace seconds that's
                  // typically negative (getting faster); for speed/watts it's
                  // typically positive. Either way we just copy what's there.
                  const incRaw = r1 - r0;
                  // Round to keep the input clean — sub-second pace deltas
                  // and 0.05 km/h speed deltas aren't realistic.
                  const inc = isPace && inputMode === 'pace'
                    ? Math.round(incRaw)
                    : Math.round(incRaw * 10) / 10;
                  const startStr = isPace && inputMode === 'pace'
                    ? formatPaceSeconds(r0)
                    : (Math.round(r0 * 10) / 10).toString();
                  // Stage duration: read the first row's `duration` cell, parse
                  // MM:SS → seconds. Fall back to test-level stageDurationSec
                  // → 180 default.
                  const durStr = String(rows[0]?.duration || '').trim();
                  const durMmss = durStr.match(/^(\d+):(\d{1,2})$/);
                  const durSec = durMmss
                    ? Number(durMmss[1]) * 60 + Number(durMmss[2])
                    : (Number(testData?.stageDurationSec) || 180);
                  seed = {
                    start: startStr,
                    increment: String(inc),
                    steps: rows.length || 6,
                    stageDurationSec: durSec,
                  };
                } else {
                  // No rows yet — default the wizard with sensible per-sport
                  // seeds (kept identical to the original behaviour).
                  seed = {
                    start: isPace ? (sport === 'swim' ? '02:00' : '06:00') : '100',
                    increment: isPace ? '-10' : '25',
                    steps: 6,
                    stageDurationSec: 180,
                  };
                }
                setStepWizard(seed);
                // Wizard mode should mirror the form's current inputMode so
                // re-opening the wizard while in Speed mode doesn't reset to
                // Pace mode and re-show MM:SS labels for km/h data.
                if (isPace) {
                  setWizardInputMode(inputMode === 'speed' ? 'speed' : 'pace');
                }
                setStepWizardOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors whitespace-nowrap"
              title="Generate a step-test ladder of intervals"
            >
              <Settings2 size={14} /> Step wizard
            </button>

            {/* Spacer pushes Delete + Save to the right on wide rows but
                disappears (height 0) when the row wraps. */}
            <div className="grow" />

            {!isNewTest && !demoMode && (
              <button
                type="button"
                onClick={() => {
                  logClick('Delete Test Button', { testId: testData._id });
                  handleDeleteTest();
                }}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors whitespace-nowrap"
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
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:pointer-events-none whitespace-nowrap"
              >
                <Save size={14} />{' '}
                {isSaving ? 'Saving…' : isNewTest ? 'Save Test' : 'Save Changes'}
              </button>
            )}
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
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4"
          style={{ pointerEvents: 'auto' }}
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
            {/* Single shared scope for all wizard fields. Previously the
                description IIFE owned isPaceSport/isSpeed/speedUnit while
                the field-grid + preview each re-derived (sometimes
                differently). Hoisted here so labels, placeholders, preview
                hint and helper text all read from the same signal — fixes
                the 2026-05 bug where a shared-link test with no sport set
                showed `(MM:SS)` labels but a watts preview. */}
            {(() => {
              const isPaceSport = formData.sport === 'run' || formData.sport === 'swim';
              const isSwim = formData.sport === 'swim';
              const isSpeed = isPaceSport && wizardInputMode === 'speed';
              const speedUnit = unitSystem === 'imperial' ? 'mph' : 'km/h';
              // Hard guard: with no sport selected we don't know whether the
              // user means watts or pace — both interpretations produce
              // confusing previews. Show an inline warning + disable Generate
              // until the parent form's Sport field is filled.
              const noSport = !formData.sport;
              // Pace ↔ Speed helpers for the toggle below. Auto-convert when
              // switching modes so values the user already typed don't get
              // wiped — previously the toggle just blanked the inputs which
              // surprised users and made the wizard feel buggy.
              //
              //   Run  pace ↔ speed:   sec/km = 3600 / kmh
              //   Swim pace ↔ speed:   sec/100m = 360 / kmh
              const convertStartToSpeed = (paceStr) => {
                const sec = parsePaceInput(paceStr);
                if (!Number.isFinite(sec) || sec <= 0) return '';
                const k = isSwim ? 360 / sec : 3600 / sec;
                let display = k;
                if (unitSystem === 'imperial') display = k / 1.609344;
                return display.toFixed(1);
              };
              const convertStartToPace = (speedStr) => {
                let k = Number(String(speedStr).replace(',', '.'));
                if (!Number.isFinite(k) || k <= 0) return '';
                if (unitSystem === 'imperial') k = k * 1.609344;
                const sec = isSwim ? 360 / k : 3600 / k;
                return formatPaceSeconds(sec);
              };
              // The increment unit changes too (pace = Δseconds, speed = Δkm/h)
              // so we can't meaningfully convert — clearing is the right call.
              // Negative pace increment means "getting faster" which maps to
              // positive speed increment; can't preserve sign without value.

              // Three sport chips for the no-sport state. Clicking sets the
              // parent form's sport field AND seeds reasonable wizard defaults
              // so the user doesn't see a blank wizard staring back at them.
              // Mirrors the seed logic used when the wizard opens with a sport
              // already set (see button at line ~2134) — keeps the two entry
              // points equivalent.
              //
              // Seeds per sport:
              //   run  → 6:00 pace, −10 s/stage, 6 stages, 180 s each
              //   swim → 2:00 / 100 m, −10 s/stage, 6 stages, 180 s each
              //   bike → 100 W start, +25 W per stage, 6 stages, 180 s each
              const pickSport = (sport) => {
                setFormData(prev => ({ ...prev, sport }));
                const seed = sport === 'bike'
                  ? { start: '100',  increment: '25'  }
                  : sport === 'swim'
                    ? { start: '02:00', increment: '-10' }
                    : { start: '06:00', increment: '-10' }; // run
                setStepWizard(s => ({
                  ...s,
                  ...seed,
                  steps: s.steps || 6,
                  stageDurationSec: s.stageDurationSec || 180,
                }));
                // Run/swim share the Pace mode default; bike has no pace/
                // speed toggle so the mode doesn't matter for it.
                if (sport === 'run' || sport === 'swim') {
                  setWizardInputMode('pace');
                }
              };
              return (
                <>
                  {noSport && (
                    <div className="mb-3 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-[12px] text-amber-900 leading-snug mb-2">
                        <strong>Pick a sport first.</strong> The wizard adapts its units (watts vs pace) to the sport.
                      </p>
                      <div className="flex gap-1.5">
                        {[
                          { id: 'run',  label: 'Run' },
                          { id: 'bike', label: 'Bike' },
                          { id: 'swim', label: 'Swim' },
                        ].map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => pickSport(s.id)}
                            className="flex-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors"
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mb-3">
                    Generates intervals automatically. Existing rows will be replaced.
                    {!isPaceSport
                      ? ' Start watts + increment in watts.'
                      : isSpeed
                        ? ` Speed in ${speedUnit}; increment positive = getting faster.`
                        : ' Pace as MM:SS; increment in seconds (negative = getting faster).'}
                  </p>

                  {/* Pace ↔ Speed toggle for run/swim — bike has no equivalent.
                      Switching now CONVERTS the start value instead of clearing
                      it (e.g. 06:00 pace ↔ 10.0 km/h). The increment can't be
                      auto-converted because its unit (Δs vs Δkm/h) and sign
                      convention flip — we still wipe that so the user is
                      prompted to fill it in deliberately. */}
                  {isPaceSport && (
                    <div className="mb-3 bg-gray-100 rounded-lg p-1 inline-flex shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          if (wizardInputMode === 'pace') return;
                          setWizardInputMode('pace');
                          setStepWizard(s => ({
                            ...s,
                            start: convertStartToPace(s.start),
                            increment: '',
                          }));
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${wizardInputMode === 'pace' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        Pace (MM:SS)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (wizardInputMode === 'speed') return;
                          setWizardInputMode('speed');
                          setStepWizard(s => ({
                            ...s,
                            start: convertStartToSpeed(s.start),
                            increment: '',
                          }));
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${wizardInputMode === 'speed' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900'}`}
                      >
                        Speed ({speedUnit})
                      </button>
                    </div>
                  )}

                  {/* Field grid — labels, placeholders and the preview hint
                      below all share isPaceSport / isSpeed / speedUnit from
                      this IIFE so they stay in sync. */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Start {!isPaceSport ? '(W)' : isSpeed ? `(${speedUnit})` : '(MM:SS)'}
                      </label>
                      <input
                        type="text"
                        value={stepWizard.start}
                        onChange={(e) => setStepWizard(s => ({ ...s, start: e.target.value }))}
                        placeholder={
                          !isPaceSport ? '100'
                          : isSpeed ? (isSwim ? '4.0' : '10')
                          : '06:00'
                        }
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    {/* Renamed 2026-05: was "Step (seconds)" which read like
                        the duration of each step (the literal stage length).
                        It's actually the INCREMENT — how much the pace/power
                        changes between stages. New label spells out direction
                        ("+ slower / − faster") so users can't misread the
                        sign convention. */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        {!isPaceSport
                          ? 'Power step (W)'
                          : isSpeed
                            ? `Speed step (${speedUnit})`
                            : 'Pace step (Δs)'}
                      </label>
                      <input
                        type="text"
                        value={stepWizard.increment}
                        onChange={(e) => setStepWizard(s => ({ ...s, increment: e.target.value }))}
                        placeholder={!isPaceSport ? '25' : isSpeed ? '1' : '-10'}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      {/* Inline direction reminder — pace-mode is the one that
                          confuses people (negative = getting faster is counter-
                          intuitive on first sight). Watts and speed both have
                          + = harder which matches the usual mental model. */}
                      {isPaceSport && !isSpeed && (
                        <p className="text-[10.5px] text-gray-400 mt-1 leading-tight">
                          <span className="font-semibold">−</span> faster · <span className="font-semibold">+</span> slower
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Number of stages</label>
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
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Stage duration (sec)</label>
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
                </>
              );
            })()}
            <div className="mt-3 rounded-lg bg-gray-50 border border-gray-100 p-2 text-[11px] text-gray-600">
              {(() => {
                const isPaceSport = formData.sport === 'run' || formData.sport === 'swim';
                const isSwim = formData.sport === 'swim';
                const isSpeed = isPaceSport && wizardInputMode === 'speed';
                const speedUnit = unitSystem === 'imperial' ? 'mph' : 'km/h';
                const stepsN = Math.max(1, Math.min(30, parseInt(stepWizard.steps, 10) || 0));
                // Treat blank inputs explicitly as "not filled in" — vanilla
                // Number("") returns 0, which used to slip through the
                // Number.isFinite() guard and silently produce 6 stages with
                // zero progression (every stage at the same speed). Trim
                // first so leading/trailing spaces don't masquerade as data.
                const startStr = String(stepWizard.start ?? '').trim();
                const incStr = String(stepWizard.increment ?? '').trim();
                if (!startStr) return 'Enter a start value to preview.';
                if (!incStr) return 'Enter a step/increment to preview.';
                const startN = (isPaceSport && !isSpeed)
                  ? parsePaceInput(startStr)
                  : Number(startStr.replace(',', '.'));
                const incN = Number(incStr.replace(',', '.'));
                if (!Number.isFinite(startN) || !Number.isFinite(incN)) return 'Fill all fields to preview.';
                // A zero step is technically "finite" but produces an
                // identical ladder — refuse it so users don't ship a flat
                // step-test by accident.
                if (incN === 0) return 'Step can\'t be 0 — stages would all be the same.';

                const fmt = (n) => {
                  if (!isPaceSport) return `${Math.round(n)} W`;
                  if (isSpeed) {
                    // Convert km/h (or mph) → pace and show both.
                    let kmh = n;
                    if (unitSystem === 'imperial') kmh = n * 1.609344;
                    const paceSec = isSwim ? 360 / kmh : 3600 / kmh;
                    return `${n.toFixed(1)} ${speedUnit} (${formatPaceSeconds(paceSec)})`;
                  }
                  return formatPaceSeconds(n);
                };
                const first = fmt(startN);
                const last = fmt(startN + incN * (stepsN - 1));
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
              {/* Generate is gated on a sport being set in the parent form —
                  without it we can't reliably interpret the values (watts vs
                  pace). The amber warning banner above tells the user why. */}
              <button
                type="button"
                onClick={handleApplyStepWizard}
                disabled={!formData.sport}
                className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
                  !formData.sport
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'text-white bg-indigo-500 hover:bg-indigo-600'
                }`}
                title={!formData.sport ? 'Pick a sport in the form first' : 'Replace existing rows with the generated ladder'}
              >
                Generate
              </button>
            </div>
          </div>
        </div>,
        document.getElementById('app-modal-root') || document.body,
      )}
    </div>
  );
}

export default TestingForm;
