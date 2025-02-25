import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

const FAQItem = ({ question, answer, isOpen, onClick }) => (
  <div className="border rounded-lg mb-4">
    <button
      className="w-full flex justify-between items-center p-4 text-left"
      onClick={onClick}
    >
      <span className="font-medium text-gray-900">{question}</span>
      {isOpen ? (
        <ChevronUpIcon className="w-5 h-5 text-gray-500" />
      ) : (
        <ChevronDownIcon className="w-5 h-5 text-gray-500" />
      )}
    </button>
    {isOpen && (
      <div className="px-4 pb-4 text-gray-600">
        {answer}
      </div>
    )}
  </div>
);

const SupportPage = () => {
  const [openQuestions, setOpenQuestions] = useState(new Set([0]));
  const [activeCategory, setActiveCategory] = useState('about');

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
        answer: "LaChart is a specialized application designed for athletes and coaches focused on lactate testing and analysis. It provides comprehensive tools for tracking and analyzing lactate threshold data, helping users optimize their training zones and performance metrics."
      },
      {
        question: "What types of athletes benefit from LaChart?",
        answer: "LaChart is particularly valuable for endurance athletes including runners, cyclists, triathletes, and swimmers. It's also an essential tool for coaches and sports scientists who conduct regular lactate testing and need sophisticated analysis tools."
      }
    ],
    account: [
      {
        question: "How do I create an account?",
        answer: "Creating an account is simple. Just click the 'Sign Up' button, enter your email and password, and choose your role (athlete or coach). You can then customize your profile and start using LaChart's features."
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
          <div className="space-y-2">
            <p>LaChart offers various methods of lactate analysis including:</p>
            <ul className="list-disc pl-5 space-y-1">
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
          <div className="space-y-2">
            <p>LaChart helps you understand various lactate markers:</p>
            <ul className="list-disc pl-5 space-y-1">
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
        answer: "LaChart offers flexible pricing plans including Individual Athlete, Coach, and Team subscriptions. Each plan includes different features and number of users. Contact us for detailed pricing information."
      },
      {
        question: "Is there a free trial available?",
        answer: "Yes, we offer a 14-day free trial that includes all features. This allows you to fully explore LaChart's capabilities before choosing a subscription plan."
      }
    ]
  };

  return (
    <div className=" bg-gradient-to-b from-purple-50 to-white m-5 rounded-3xl" style={{ height: 'calc(100vh - 190px)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-6">
              Frequently asked questions.
            </h1>
            <p className="text-lg text-gray-600 mb-8">
              LaChart specializes in lactate testing analysis, helping athletes and coaches optimize training through precise lactate threshold determination. From basic markers to advanced analysis methods, we provide the tools needed for performance enhancement.
            </p>
          </div>
    
            <img
              src="/images/lactate-analysis.jpg"
              alt="LaChart Analysis Dashboard"
              className="rounded-lg shadow-xl"
            />

        </div>

        <div className="mt-16">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="md:col-span-1">
              <nav className="space-y-2 sticky top-4">
                <button 
                  onClick={() => setActiveCategory('about')}
                  className={`block w-full text-left px-3 py-2 rounded-lg ${
                    activeCategory === 'about' 
                      ? 'bg-blue-100 text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  About us
                </button>
                <button 
                  onClick={() => setActiveCategory('account')}
                  className={`block w-full text-left px-3 py-2 rounded-lg ${
                    activeCategory === 'account' 
                      ? 'bg-blue-100 text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Account Management
                </button>
                <button 
                  onClick={() => setActiveCategory('training')}
                  className={`block w-full text-left px-3 py-2 rounded-lg ${
                    activeCategory === 'training' 
                      ? 'bg-blue-100 text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Training Management
                </button>
                <button 
                  onClick={() => setActiveCategory('lactate')}
                  className={`block w-full text-left px-3 py-2 rounded-lg ${
                    activeCategory === 'lactate' 
                      ? 'bg-blue-100 text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Lactate Tests
                </button>
                <button 
                  onClick={() => setActiveCategory('pricing')}
                  className={`block w-full text-left px-3 py-2 rounded-lg ${
                    activeCategory === 'pricing' 
                      ? 'bg-blue-100 text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Plans and Pricing
                </button>
              </nav>
            </div>
            <div className="md:col-span-3">
              {faqCategories[activeCategory].map((faq, index) => (
                <FAQItem
                  key={index}
                  question={faq.question}
                  answer={faq.answer}
                  isOpen={openQuestions.has(index)}
                  onClick={() => toggleQuestion(index)}
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