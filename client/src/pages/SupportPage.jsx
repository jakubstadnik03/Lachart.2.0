import React, { useState, useEffect } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

const FAQItem = ({ question, answer, isOpen, onClick, isMobile }) => (
  <div className={`border ${isMobile ? 'rounded-md mb-2' : 'rounded-lg mb-4'}`}>
    <button
      className={`w-full flex justify-between items-center ${isMobile ? 'p-2.5' : 'p-4'} text-left`}
      onClick={onClick}
    >
      <span className={`font-medium text-gray-900 ${isMobile ? 'text-sm' : ''} pr-2`}>{question}</span>
      {isOpen ? (
        <ChevronUpIcon className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-gray-500 flex-shrink-0`} />
      ) : (
        <ChevronDownIcon className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} text-gray-500 flex-shrink-0`} />
      )}
    </button>
    {isOpen && (
      <div className={`${isMobile ? 'px-2.5 pb-2.5 text-xs' : 'px-4 pb-4'} text-gray-600`}>
        {answer}
      </div>
    )}
  </div>
);

const SupportPage = () => {
  const [openQuestions, setOpenQuestions] = useState(new Set([0]));
  const [activeCategory, setActiveCategory] = useState('about');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Detect mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleQuestion = (index) => {
    const newOpenQuestions = new Set(openQuestions);
    if (newOpenQuestions.has(index)) {
      newOpenQuestions.delete(index);
    } else {
      newOpenQuestions.add(index);
    }
    setOpenQuestions(newOpenQuestions);
  };

  const faqCategories = {
    about: [
      {
        question: "What is LaChart?",
        answer: "LaChart is a comprehensive platform for endurance athletes and coaches focused on lactate threshold testing and analysis. It provides tools for generating lactate curves, calculating training zones (LT1, LT2, LTP1, LTP2, OBLA, IAT), tracking progress over time, and analyzing training data from Strava and FIT files. The application is completely free."
      },
      {
        question: "What types of athletes benefit from LaChart?",
        answer: "LaChart is designed for all endurance athletes including runners, cyclists, triathletes, and swimmers. It's also an essential tool for coaches who manage multiple athletes and need to track their lactate test history, training calendars, and performance metrics."
      }
    ],
    account: [
      {
        question: "How do I create an account?",
        answer: "Creating an account is simple and free. Click the 'Sign Up' button, enter your email and password, and choose your role (athlete or coach). You can then complete your profile with basic information, set up training zones, and optionally connect your Strava account to sync training data."
      },
      {
        question: "Can coaches manage multiple athletes?",
        answer: "Yes, coach accounts can manage multiple athletes. You can add athletes, view their historical lactate tests, track their training calendars, and monitor lactate values from workouts. Switch between athletes seamlessly from your dashboard to get a complete overview of each athlete's development."
      }
    ],
    training: [
      {
        question: "How does LaChart help with training optimization?",
        answer: "LaChart automatically calculates 5 training zones (Active Recovery, Endurance, Tempo, Lactate Threshold, VO2 Max) from your lactate thresholds. You can compare historical tests to track how your zones shift over time, record lactate values to training intervals, and compare the same workout types (e.g., 10x1km runs) to see your progress."
      },
      {
        question: "What training data can I analyze?",
        answer: "LaChart supports running, cycling, and swimming. You can sync workouts from Strava, upload FIT files directly, or enter training data manually. The platform analyzes power, heart rate, cadence, speed, calculates TSS, and automatically detects intervals from power fluctuations."
      }
    ],
    lactate: [
      {
        question: "What lactate threshold calculations does LaChart provide?",
        answer: (
          <div className={isMobile ? "space-y-1" : "space-y-2"}>
            <p>LaChart calculates all critical lactate thresholds from your test data:</p>
            <ul className={`list-disc ${isMobile ? 'pl-4 space-y-0.5 text-xs' : 'pl-5 space-y-1'}`}>
              <li><span className="font-medium">LT1 & LT2:</span> First and second lactate thresholds</li>
              <li><span className="font-medium">LTP1 & LTP2:</span> First and second lactate turning points (power/pace at thresholds)</li>
              <li><span className="font-medium">OBLA:</span> Onset of Blood Lactate Accumulation at 2.0, 2.5, 3.0, and 3.5 mmol/L</li>
              <li><span className="font-medium">IAT:</span> Individual Anaerobic Threshold</li>
              <li><span className="font-medium">Log-log:</span> Mathematical approach for precise threshold determination</li>
              <li><span className="font-medium">Baseline + Delta:</span> Thresholds based on resting lactate (Bsln +0.5, +1.0, +1.5 mmol/L)</li>
            </ul>
          </div>
        )
      },
      {
        question: "How do I perform a lactate test?",
        answer: (
          <div className={isMobile ? "space-y-1" : "space-y-2"}>
            <p>You can create a lactate test in LaChart by:</p>
            <ul className={`list-disc ${isMobile ? 'pl-4 space-y-0.5 text-xs' : 'pl-5 space-y-1'}`}>
              <li>Entering test steps with power/pace, heart rate, and lactate measurements</li>
              <li>LaChart automatically generates your lactate curve and calculates all thresholds</li>
              <li>Compare your current test with historical tests to track progress</li>
              <li>Export results to PDF for professional reporting</li>
              <li>Use the free calculator without registration, or save tests in your account</li>
            </ul>
          </div>
        )
      }
    ],
    pricing: [
      {
        question: "What pricing plans are available?",
        answer: "LaChart is completely free! All features are available at no cost. You can create unlimited tests, manage multiple athletes (for coaches), and use all analytical tools without any restrictions."
      },
      {
        question: "Is LaChart really free?",
        answer: "Yes, LaChart is completely free. There are no hidden fees, no subscriptions, and no feature limitations. All tools for lactate analysis, training zones, statistics, and other features are available for free."
      }
    ]
  };

  return (
    <div className={`bg-gradient-to-b from-purple-50 to-white ${isMobile ? 'm-1 rounded-lg' : 'm-5 rounded-3xl'} overflow-hidden`} style={isMobile ? {} : { height: 'calc(100vh - 190px)' }}>
      <div className={`${isMobile ? 'px-2' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} ${isMobile ? 'py-4' : 'py-12'} h-full flex flex-col`}>
        <div className={`${isMobile ? 'flex flex-col' : 'grid lg:grid-cols-2'} ${isMobile ? 'gap-4' : 'gap-12'} items-center flex-shrink-0`}>
          <div>
            <h1 className={`${isMobile ? 'text-xl' : 'text-4xl'} font-bold text-gray-900 ${isMobile ? 'mb-3' : 'mb-6'}`}>
              Frequently asked questions
            </h1>
            <p className={`${isMobile ? 'text-xs' : 'text-lg'} text-gray-600 ${isMobile ? 'mb-4' : 'mb-8'}`}>
              LaChart is a comprehensive platform for endurance athletes and coaches to analyze lactate threshold tests, track training progress, and optimize performance through data-driven insights. All features are completely free.
            </p>
          </div>
    
            <img
              src="/images/testing.png"
              alt="LaChart - Advanced Lactate Testing and Training Analysis"
              className={`${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-xl ${isMobile ? 'w-full' : 'w-full max-w-lg'} object-contain`}
            />

        </div>

        <div className={`${isMobile ? 'mt-6' : 'mt-8'} flex-1 overflow-y-auto min-h-0`}>
          <div className={`${isMobile ? 'flex flex-col' : 'grid md:grid-cols-4'} ${isMobile ? 'gap-4' : 'gap-8'}`}>
            <div className={isMobile ? 'w-full' : 'md:col-span-1'}>
              <nav className={`${isMobile ? 'flex flex-wrap gap-1' : 'space-y-2'} ${isMobile ? '' : 'sticky top-4'}`}>
                <button 
                  onClick={() => setActiveCategory('about')}
                  className={`block ${isMobile ? 'flex-1 min-w-[140px] px-2 py-1.5 text-xs' : 'w-full text-left px-3 py-2'} ${isMobile ? 'rounded-md' : 'rounded-lg'} ${
                    activeCategory === 'about' 
                      ? 'bg-blue-100 text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  About us
                </button>
                <button 
                  onClick={() => setActiveCategory('account')}
                  className={`block ${isMobile ? 'flex-1 min-w-[140px] px-2 py-1.5 text-xs' : 'w-full text-left px-3 py-2'} ${isMobile ? 'rounded-md' : 'rounded-lg'} ${
                    activeCategory === 'account' 
                      ? 'bg-blue-100 text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Account Management
                </button>
                <button 
                  onClick={() => setActiveCategory('training')}
                  className={`block ${isMobile ? 'flex-1 min-w-[140px] px-2 py-1.5 text-xs' : 'w-full text-left px-3 py-2'} ${isMobile ? 'rounded-md' : 'rounded-lg'} ${
                    activeCategory === 'training' 
                      ? 'bg-blue-100 text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Training Management
                </button>
                <button 
                  onClick={() => setActiveCategory('lactate')}
                  className={`block ${isMobile ? 'flex-1 min-w-[140px] px-2 py-1.5 text-xs' : 'w-full text-left px-3 py-2'} ${isMobile ? 'rounded-md' : 'rounded-lg'} ${
                    activeCategory === 'lactate' 
                      ? 'bg-blue-100 text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Lactate Tests
                </button>
                <button 
                  onClick={() => setActiveCategory('pricing')}
                  className={`block ${isMobile ? 'flex-1 min-w-[140px] px-2 py-1.5 text-xs' : 'w-full text-left px-3 py-2'} ${isMobile ? 'rounded-md' : 'rounded-lg'} ${
                    activeCategory === 'pricing' 
                      ? 'bg-blue-100 text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Plans and Pricing
                </button>
              </nav>
            </div>
            <div className={`${isMobile ? 'w-full' : 'md:col-span-3'} overflow-y-auto`}>
              {faqCategories[activeCategory].map((faq, index) => (
                <FAQItem
                  key={index}
                  question={faq.question}
                  answer={faq.answer}
                  isOpen={openQuestions.has(index)}
                  onClick={() => toggleQuestion(index)}
                  isMobile={isMobile}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportPage;