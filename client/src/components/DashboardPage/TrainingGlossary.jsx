import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

// Organize terms by category
const GLOSSARY_CATEGORIES = {
  'Training': [
    'Form & Fitness',
    'Training Load',
    'Training Status',
    'Training Stress Score® (TSS)',
    'Intensity Factor® (IF)',
    'Training Impulse (TRIMP)',
    'Heart Rate Stress Score (hrTSS)',
  ],
  'Power & Performance': [
    'Normalized Power® (NP)',
    'Maximum Power',
    'Functional Threshold Power (FTP)',
    'Variability Index',
    'Efficiency Factor',
    'Power to Weight Ratio',
    'Power Profile',
    'Power Curve Recency',
  ],
  'Lactate': [
    'Lactate Threshold',
    'Lactate Threshold 1 (LT1)',
    'Lactate Threshold 2 (LT2)',
    'OBLA (Onset of Blood Lactate Accumulation)',
    'Baseline Lactate',
    'Lactate Curve',
    'Lactate Testing',
    'Training Zones',
  ],
  'Other': [
    'Aerobic Decoupling',
  ]
};

const ALL_GLOSSARY_TERMS = {
  'Form & Fitness': {
    title: 'Form & Fitness',
    description: 'The Form & Fitness chart in LaChart helps you track and predict your level of Fitness, Fatigue, and Form across all sports (cycling, running, swimming). These metrics are calculated using the Training Stress Score (TSS) from all your activities.',
    calculation: 'Fitness, Fatigue, and Form are calculated using rolling averages of daily TSS (Training Stress Score). The calculation starts from your earliest activity in the database to ensure accurate accumulation of values.',
    definitions: [
      {
        term: 'Fitness',
        definition: 'Fitness represents your long-term accumulated fitness level. It is calculated as a rolling average of daily TSS over the last 42 days (including rest days with 0 TSS). Fitness builds up gradually as you train consistently and reflects your overall training capacity. If you don\'t train for a longer period, your Fitness level will slowly decline. High Fitness = large endurance capacity.'
      },
      {
        term: 'Fatigue',
        definition: 'Fatigue represents short-term tiredness from recent training. It is calculated as a rolling average of daily TSS over the last 7 days (including rest days with 0 TSS). Fatigue increases quickly after hard training sessions and accumulates during intensive training periods. It also decreases rapidly after a few days of lighter training or recovery. Fatigue reacts much faster than Fitness. High fatigue has a negative impact on your performance, even if your fitness level is high.'
      },
      {
        term: 'Form',
        definition: 'Form represents your current readiness to perform. It is calculated as: Form = Fitness - Fatigue. Positive Form (+20 to +40) indicates peak form (race-ready). Moderate positive Form (+5 to +15) means fresh and ready for good training. Near zero (0 to -10) is normal training state. Negative Form (-10 to -30) indicates hard training period. Very negative Form (< -30) suggests risk of overreaching. Before a race, you want positive Form. During training, Form is often negative.'
      }
    ]
  },
  'Training Load': {
    title: 'Training Load',
    description: 'Training Load represents the accumulated Training Stress Score (TSS) from all activities in a given week. It shows how hard you have trained each week across all sports (cycling, running, swimming).',
    calculation: 'Weekly Training Load is calculated by summing TSS from all activities in a week (Monday to Sunday). TSS is calculated from power/pace data and your personal zones (FTP for cycling, threshold pace for running/swimming) from your profile.',
    additional: 'LaChart calculates your optimal training load range for each week based on your past training (average of last 4 weeks). Training in the optimal range (80-120% of average) will help you maintain and improve your overall fitness. You can filter by sport (all, bike, run, swim) to see training load for specific activities.'
  },
  'Training Status': {
    title: 'Training Status',
    description: 'Training Status evaluates your weekly training progress and shows how productive your training was. It compares your actual training load (weekly TSS) in the current week to your optimal training load range, which is based on your past 4 weeks of training.',
    calculation: 'Optimal load range is calculated as 80-120% of your average weekly TSS from the past 4 weeks (excluding current week). Your current week\'s TSS is then compared to this range to determine your training status.',
    statuses: [
      {
        name: 'Overreaching',
        color: 'bg-red-500',
        description: 'Your training load is too high and your body needs a recovery period. Make sure to add lighter, recovery activities.'
      },
      {
        name: 'Productive',
        color: 'bg-green-500',
        description: 'Your training had a positive impact and increased your overall fitness.'
      },
      {
        name: 'Maintaining',
        color: 'bg-blue-500',
        description: 'Enough training load to maintain your fitness level.'
      },
      {
        name: 'Recovery',
        color: 'bg-orange-500',
        description: 'Lighter training load after a period of more intensive training.'
      },
      {
        name: 'Detraining',
        color: 'bg-gray-800',
        description: 'Training load is too low and your fitness is decreasing.'
      }
    ]
  },
  'Normalized Power® (NP)': {
    title: 'Normalized Power® (NP)',
    description: 'Normalized Power (NP) is a weighted average power that better reflects the physiological cost of variable power output than average power. It accounts for the fact that your body responds differently to steady-state efforts versus variable efforts.',
    calculation: 'NP is calculated using a 30-second rolling average, which is then raised to the 4th power, averaged, and then the 4th root is taken. This gives more weight to high-power efforts, which have a greater physiological impact.'
  },
  'Maximum Power': {
    title: 'Maximum Power',
    description: 'Maximum Power is the highest power output you achieved during a training session or activity. It represents your peak power output for that specific duration.',
    calculation: 'Maximum Power is simply the highest recorded power value from all data points in your activity.'
  },
  'Functional Threshold Power (FTP)': {
    title: 'Functional Threshold Power (FTP)',
    description: 'Functional Threshold Power (FTP) is the highest power you can sustain for approximately one hour. It\'s a key metric for determining training zones and measuring fitness improvements.',
    calculation: 'FTP is typically determined through a 20-minute or 60-minute time trial, or can be estimated from your power zones and training history.'
  },
  'Training Stress Score® (TSS)': {
    title: 'Training Stress Score® (TSS)',
    description: 'Training Stress Score (TSS) measures overall training load (stress on the body) for a training session. It accounts for both intensity and duration of the activity. TSS of 100 points represents one hour of training at threshold intensity (FTP for cycling, threshold pace for running/swimming).',
    calculation: 'TSS is calculated differently for each sport:\n• Cycling: TSS = (seconds × NP²) / (FTP² × 3600) × 100\n• Running: TSS = (seconds × (thresholdPace/avgPace)²) / 3600 × 100\n• Swimming: TSS = (seconds × (thresholdPace/avgPace)²) / 3600 × 100\n\nLaChart uses your personal zones from your profile (FTP, threshold pace) for accurate TSS calculation. If zones are not available, it uses fallback values.',
    additional: 'TSS can help determine required recovery after each activity:\n• 0 - 150: Low stress, recovery likely complete by next day\n• 150 - 300: Medium stress, possible tiredness next day, gone by 2nd day\n• 300 - 450: High stress, some tiredness even after two days\n• 450+: Very high stress, likely tired for several days'
  },
  'Intensity Factor® (IF)': {
    title: 'Intensity Factor® (IF)',
    description: 'Intensity Factor (IF) is a measure of how intense a ride was relative to your Functional Threshold Power (FTP).',
    calculation: 'IF = Normalized Power / FTP. An IF of 1.0 means you rode at your FTP for the entire ride. Values above 1.0 indicate a very intense ride, while values below 1.0 indicate a more moderate effort.'
  },
  'Variability Index': {
    title: 'Variability Index',
    description: 'Variability Index (VI) measures how variable your power output was during a ride. It compares Normalized Power to Average Power.',
    calculation: 'VI = Normalized Power / Average Power. A VI of 1.0 means steady-state power. Higher VI values indicate more variable power output, which typically results in higher physiological stress for the same average power.'
  },
  'Efficiency Factor': {
    title: 'Efficiency Factor',
    description: 'Efficiency Factor (EF) is the ratio of Normalized Power to average heart rate. It indicates how efficiently you\'re producing power relative to your heart rate.',
    calculation: 'EF = Normalized Power / Average Heart Rate. Higher EF values indicate better efficiency, meaning you can produce more power at a given heart rate.'
  },
  'Aerobic Decoupling': {
    title: 'Aerobic Decoupling',
    description: 'Aerobic Decoupling measures how much your heart rate drifts upward relative to power output during a steady-state effort. It indicates aerobic fitness and endurance capacity.',
    calculation: 'Aerobic Decoupling = (HR in second half / HR in first half) - 1. Values close to 0 indicate good aerobic fitness, while higher values suggest fatigue or poor aerobic conditioning.'
  },
  'Heart Rate Stress Score (hrTSS)': {
    title: 'Heart Rate Stress Score (hrTSS)',
    description: 'Heart Rate Stress Score (hrTSS) is similar to TSS but calculated using heart rate data instead of power. It measures training load based on heart rate zones.',
    calculation: 'hrTSS uses your heart rate zones and the time spent in each zone to calculate a stress score, providing an alternative to power-based TSS for activities without power data.'
  },
  'Training Impulse (TRIMP)': {
    title: 'Training Impulse (TRIMP)',
    description: 'Training Impulse (TRIMP) is a method of quantifying training load based on heart rate. It accounts for both the duration and intensity of exercise.',
    calculation: 'TRIMP = Duration × Average Heart Rate × Heart Rate Reserve. It provides a single number that represents the overall training stress of a workout.'
  },
  'Power to Weight Ratio': {
    title: 'Power to Weight Ratio',
    description: 'Power to Weight Ratio is your power output divided by your body weight. It\'s a key metric for climbing performance and overall cycling performance.',
    calculation: 'Power to Weight Ratio = Power (watts) / Weight (kg). Higher values indicate better performance, especially in climbing and acceleration.'
  },
  'Power Profile': {
    title: 'Power Profile',
    description: 'Power Profile shows your best power outputs across different time durations (e.g., 5 seconds, 1 minute, 5 minutes, 20 minutes, 1 hour). It helps identify your strengths and weaknesses.',
    calculation: 'Power Profile is created by analyzing all your activities and finding the maximum power output for each time duration.'
  },
  'Power Curve Recency': {
    title: 'Power Curve Recency',
    description: 'Power Curve Recency shows how your current power outputs compare to your all-time bests. It helps track recent performance trends.',
    calculation: 'Power Curve Recency compares your best power outputs from a recent time period (e.g., last 30 days) to your all-time bests for the same durations.'
  },
  'Lactate Threshold': {
    title: 'Lactate Threshold',
    description: 'Lactate Threshold (LT) is the exercise intensity at which blood lactate concentration begins to accumulate rapidly. It represents the transition from aerobic to anaerobic metabolism.',
    calculation: 'Lactate Threshold is typically identified as the point where lactate levels rise significantly above baseline, usually around 2-4 mmol/L depending on the individual.'
  },
  'Lactate Threshold 1 (LT1)': {
    title: 'Lactate Threshold 1 (LT1)',
    description: 'Lactate Threshold 1 (LT1), also known as the Aerobic Threshold, is the first significant increase in blood lactate above baseline. It represents the upper limit of purely aerobic metabolism.',
    calculation: 'LT1 is typically identified as the point where lactate rises to approximately 2.0 mmol/L above baseline, or where there is a clear deviation from baseline levels.'
  },
  'Lactate Threshold 2 (LT2)': {
    title: 'Lactate Threshold 2 (LT2)',
    description: 'Lactate Threshold 2 (LT2), also known as the Anaerobic Threshold or Maximum Lactate Steady State (MLSS), is the highest exercise intensity at which lactate production and clearance are balanced.',
    calculation: 'LT2 is typically identified as the point where lactate reaches approximately 4.0 mmol/L, or where there is a second significant increase in lactate accumulation rate.'
  },
  'OBLA (Onset of Blood Lactate Accumulation)': {
    title: 'OBLA (Onset of Blood Lactate Accumulation)',
    description: 'OBLA is the exercise intensity at which blood lactate concentration reaches a specific level (commonly 2.0, 2.5, 3.0, or 3.5 mmol/L). It\'s used to determine training zones and assess fitness.',
    calculation: 'OBLA is determined by identifying the power output or pace at which lactate reaches the specified concentration during an incremental exercise test.'
  },
  'Baseline Lactate': {
    title: 'Baseline Lactate',
    description: 'Baseline Lactate is the resting blood lactate concentration measured before exercise. It provides a reference point for evaluating lactate accumulation during exercise.',
    calculation: 'Baseline Lactate is typically measured at rest, before any exercise begins. Normal resting values are usually between 0.5-2.0 mmol/L.'
  },
  'Lactate Curve': {
    title: 'Lactate Curve',
    description: 'A Lactate Curve is a graphical representation of blood lactate concentration plotted against exercise intensity (power or pace). It helps identify thresholds and training zones.',
    calculation: 'The lactate curve is created by plotting lactate values from multiple exercise intensities. A polynomial regression is often used to smooth the curve and identify key inflection points.'
  },
  'Lactate Testing': {
    title: 'Lactate Testing',
    description: 'Lactate Testing is a method of assessing fitness by measuring blood lactate concentration at various exercise intensities. It helps determine training zones and track fitness improvements.',
    calculation: 'During lactate testing, athletes perform incremental exercise stages (e.g., 3-5 minute intervals) with increasing intensity. Blood lactate is measured after each stage to create a lactate curve.'
  },
  'Training Zones': {
    title: 'Training Zones',
    description: 'Training Zones are intensity ranges used to structure training. They are typically based on lactate thresholds, heart rate, or power/pace. Zones help athletes train at appropriate intensities for specific adaptations.',
    calculation: 'Training zones are calculated from lactate thresholds (LT1 and LT2). Zone 1 is below LT1, Zone 2 is at LT1, Zone 3 is between LT1 and LT2, Zone 4 is at LT2, and Zone 5 is above LT2.'
  }
};

const TrainingGlossary = ({ isOpen, onClose, initialTerm = 'Form & Fitness', initialCategory = null }) => {
  const [selectedTerm, setSelectedTerm] = useState(initialTerm);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || 'Training');
  const selectedTermRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Update selectedTerm and category when initialTerm changes
  useEffect(() => {
    if (initialTerm && isOpen) {
      setSelectedTerm(initialTerm);
      // Find and set the category for the initial term
      for (const [category, terms] of Object.entries(GLOSSARY_CATEGORIES)) {
        if (terms.includes(initialTerm)) {
          setSelectedCategory(category);
          break;
        }
      }
    }
  }, [initialTerm, isOpen]);

  // Scroll selected term into view
  useEffect(() => {
    if (selectedTermRef.current && isOpen) {
      selectedTermRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedTerm, isOpen]);

  const currentContent = ALL_GLOSSARY_TERMS[selectedTerm] || ALL_GLOSSARY_TERMS['Form & Fitness'];
  
  // Get terms for selected category
  const categoryTerms = GLOSSARY_CATEGORIES[selectedCategory] || GLOSSARY_CATEGORIES['Training'];

  if (!isOpen) return null;

  // Render modal using React Portal to document.body to ensure it's always on top
  return ReactDOM.createPortal(
    <div className={`fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center ${isMobile ? 'p-0' : 'p-4'}`}>
      <div className={`bg-white w-full flex flex-col ${isMobile ? 'h-[100dvh] max-h-[100dvh] rounded-none' : 'rounded-lg max-w-5xl max-h-[90vh]'}`}>
        {/* Header */}
        <div className={`sticky top-0 bg-white border-b border-gray-200 z-10 ${isMobile ? 'p-3' : 'p-4'}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className={`${isMobile ? 'text-base' : 'text-xl'} font-semibold text-gray-900`}>TRAINING GLOSSARY</h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-6 h-6 text-gray-500" />
            </button>
          </div>
          
          {/* Category Tabs */}
          <div className={`flex gap-2 overflow-x-auto pb-2 ${isMobile ? '[-webkit-overflow-scrolling:touch]' : ''}`}>
            {Object.keys(GLOSSARY_CATEGORIES).map((category) => (
              <button
                key={category}
                onClick={() => {
                  setSelectedCategory(category);
                  // Select first term in category
                  const firstTerm = GLOSSARY_CATEGORIES[category][0];
                  if (firstTerm && ALL_GLOSSARY_TERMS[firstTerm]) {
                    setSelectedTerm(firstTerm);
                  }
                }}
                className={`px-3 py-2 rounded-lg ${isMobile ? 'text-xs' : 'text-sm'} font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Mobile: Term selector instead of left sidebar */}
          {isMobile && (
            <div className="mt-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">Term</label>
              <div className="relative">
                <select
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value)}
                  className="appearance-none w-full pl-3 pr-9 py-2 h-10 border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {categoryTerms.map((term) => (
                    ALL_GLOSSARY_TERMS[term] ? (
                      <option key={term} value={term}>{term}</option>
                    ) : null
                  ))}
                </select>
                <ChevronDownIcon className="w-4 h-4 text-gray-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className={`flex flex-1 overflow-hidden ${isMobile ? 'flex-col' : ''}`}>
          {/* Left side - Term list */}
          {!isMobile && (
          <div className="w-64 border-r border-gray-200 overflow-y-auto bg-gray-50">
            <div className="p-4 space-y-1">
              {categoryTerms.map((term) => {
                if (!ALL_GLOSSARY_TERMS[term]) return null;
                const isSelected = selectedTerm === term;
                return (
                  <button
                    key={term}
                    ref={isSelected ? selectedTermRef : null}
                    onClick={() => setSelectedTerm(term)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 ${
                      isSelected
                        ? 'bg-red-500 text-white font-medium shadow-md'
                        : 'text-gray-700 hover:bg-gray-200 hover:shadow-sm'
                    }`}
                  >
                    {term}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          {/* Right side - Content */}
          <div className="flex-1 overflow-y-auto bg-white">
            <div className={`${isMobile ? 'p-4' : 'p-6'}`}>
              {currentContent ? (
                <>
                  <h3 className={`${isMobile ? 'text-lg' : 'text-2xl'} font-semibold text-gray-900 mb-3`}>{currentContent.title}</h3>
                  
                  {currentContent.description && (
                    <div className="mb-6">
                      <p className={`${isMobile ? 'text-sm' : 'text-base'} text-gray-700 leading-relaxed`}>{currentContent.description}</p>
                    </div>
                  )}
                  
                  {currentContent.calculation && (
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                      <h4 className="font-semibold text-gray-900 mb-2">Calculation:</h4>
                      <p className={`${isMobile ? 'text-sm' : 'text-base'} text-gray-700 leading-relaxed whitespace-pre-line`}>{currentContent.calculation}</p>
                    </div>
                  )}
                  
                  {currentContent.additional && (
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                      <p className={`${isMobile ? 'text-sm' : 'text-base'} text-gray-700 whitespace-pre-line leading-relaxed`}>{currentContent.additional}</p>
                    </div>
                  )}

                  {currentContent.definitions && currentContent.definitions.length > 0 && (
                    <div className="space-y-4 mb-6">
                      <h4 className="font-semibold text-gray-900 text-lg mb-3">Definitions:</h4>
                      {currentContent.definitions.map((def, index) => (
                        <div key={index} className="border-l-4 border-red-500 pl-4 py-2 bg-red-50 rounded-r-lg">
                          <h5 className="font-semibold text-gray-900 mb-2">{def.term}</h5>
                          <p className={`${isMobile ? 'text-sm' : 'text-base'} text-gray-700 leading-relaxed`}>{def.definition}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {currentContent.statuses && currentContent.statuses.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="font-semibold text-gray-900 text-lg mb-3">Status Types:</h4>
                      {currentContent.statuses.map((status, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                          <div className={`w-5 h-5 rounded-full ${status.color} mt-0.5 flex-shrink-0`}></div>
                          <div className="flex-1">
                            <h5 className="font-semibold text-gray-900 mb-1">{status.name}</h5>
                            <p className="text-gray-700 leading-relaxed">{status.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500">No content available for this term.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TrainingGlossary;

