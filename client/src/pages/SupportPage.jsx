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
        answer: "LaChart is a specialized application designed for athletes and coaches focused on lactate testing and analysis. It provides comprehensive tools for tracking and analyzing lactate threshold data, helping users optimize their training zones and performance metrics. The application is completely free."
      },
      {
        question: "What types of athletes benefit from LaChart?",
        answer: "LaChart is particularly valuable for endurance athletes including runners, cyclists, triathletes, and swimmers. It's also an essential tool for coaches and sports scientists who conduct regular lactate testing and need sophisticated analysis tools."
      }
    ],
    account: [
      {
        question: "How do I create an account?",
        answer: "Creating an account is simple. Just click the 'Sign Up' button, enter your email and password, and choose your role (athlete or coach). You can then customize your profile and start using LaChart's features. Everything is free."
      },
      {
        question: "Can I have multiple athletes under one coach account?",
        answer: "Yes, coach accounts can manage multiple athletes. You can invite athletes to connect with your account, view their test results, and manage their training plans all from one dashboard."
      }
    ],
    training: [
      {
        question: "How does LaChart help with training optimization?",
        answer: "LaChart transforms complex lactate data into actionable training insights. It automatically calculates training zones based on your lactate test results, helps track changes in lactate threshold over time, and provides detailed analysis of aerobic and anaerobic adaptations."
      },
      {
        question: "Can I track multiple types of training?",
        answer: "Yes, LaChart supports various training types including running, cycling, and swimming. Each sport has specific metrics and analysis tools tailored to its unique characteristics."
      }
    ],
    lactate: [
      {
        question: "What are the key features of lactate testing in LaChart?",
        answer: (
          <div className={isMobile ? "space-y-1" : "space-y-2"}>
            <p>LaChart offers various methods of lactate analysis including:</p>
            <ul className={`list-disc ${isMobile ? 'pl-4 space-y-0.5 text-xs' : 'pl-5 space-y-1'}`}>
              <li><span className="font-medium">Log-log Analysis:</span> Mathematical approach for precise threshold determination</li>
              <li><span className="font-medium">Fixed Thresholds:</span> Including OBLA 2.0, 2.5, 3.0, and 3.5 mmol/L</li>
              <li><span className="font-medium">Baseline + Delta:</span> Bsln +0.5, +1.0, +1.5 mmol/L analysis</li>
              <li><span className="font-medium">LTP1 & LTP2:</span> First and second lactate turning points</li>
              <li><span className="font-medium">LTRatio:</span> Advanced lactate ratio analysis for threshold determination</li>
            </ul>
          </div>
        )
      },
      {
        question: "How do I interpret different lactate markers?",
        answer: (
          <div className={isMobile ? "space-y-1" : "space-y-2"}>
            <p>LaChart helps you understand various lactate markers:</p>
            <ul className={`list-disc ${isMobile ? 'pl-4 space-y-0.5 text-xs' : 'pl-5 space-y-1'}`}>
              <li><span className="font-medium">LTP1:</span> First lactate turning point, indicating aerobic threshold</li>
              <li><span className="font-medium">LTP2:</span> Second lactate turning point, indicating anaerobic threshold</li>
              <li><span className="font-medium">OBLA:</span> Onset of Blood Lactate Accumulation at various levels (2.0-3.5 mmol/L)</li>
              <li><span className="font-medium">Baseline + Delta:</span> Individual threshold determination based on resting lactate</li>
              <li><span className="font-medium">LTRatio:</span> Advanced analysis of lactate accumulation patterns</li>
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
    <div className={`bg-gradient-to-b from-purple-50 to-white ${isMobile ? 'm-1 rounded-lg' : 'm-5 rounded-3xl'}`} style={isMobile ? {} : { height: 'calc(100vh - 190px)' }}>
      <div className={`${isMobile ? 'px-2' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'} ${isMobile ? 'py-4' : 'py-12'}`}>
        <div className={`${isMobile ? 'flex flex-col' : 'grid lg:grid-cols-2'} ${isMobile ? 'gap-4' : 'gap-12'} items-center`}>
          <div>
            <h1 className={`${isMobile ? 'text-xl' : 'text-4xl'} font-bold text-gray-900 ${isMobile ? 'mb-3' : 'mb-6'}`}>
              Frequently asked questions
            </h1>
            <p className={`${isMobile ? 'text-xs' : 'text-lg'} text-gray-600 ${isMobile ? 'mb-4' : 'mb-8'}`}>
              LaChart specializes in lactate testing analysis, helping athletes and coaches optimize training through precise lactate threshold determination. From basic markers to advanced analysis methods, we provide the tools needed for performance enhancement. The application is completely free.
            </p>
          </div>
    
            <img
              src="/images/lactate-analysis.jpg"
              alt="LaChart Analysis Dashboard"
              className={`${isMobile ? 'rounded-md' : 'rounded-lg'} shadow-xl ${isMobile ? 'w-full' : ''}`}
            />

        </div>

        <div className={isMobile ? 'mt-6' : 'mt-16'}>
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
            <div className={isMobile ? 'w-full' : 'md:col-span-3'}>
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