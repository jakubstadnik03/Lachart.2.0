import React, { useEffect, useState } from 'react';
import { trackEvent } from '../utils/analytics';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, EffectCoverflow } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/effect-coverflow';
import ContactUs from '../components/ContactUs';

// Lazy load the ContactForm component
//const ContactForm = lazy(() => import('../components/ContactForm'));

// FAQ Accordion Item Component
const FAQItem = ({ icon, question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);

  const iconPaths = {
    question: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    check: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    flag: "M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9",
    chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
  };

  return (
    <motion.div 
      className="group bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
      initial={false}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 sm:p-5 md:p-6 flex items-center justify-between gap-3 sm:gap-4 text-left focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-2xl"
      >
        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
          <div className={`flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center transition-colors ${isOpen ? 'from-primary/20 to-primary/10' : ''}`}>
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPaths[icon]} />
            </svg>
          </div>
          <h3 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 leading-tight flex-1 min-w-0">
            {question}
          </h3>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="flex-shrink-0 ml-2"
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 sm:px-5 md:px-6 pb-4 sm:pb-5 md:pb-6 pt-0">
              <div className="pl-11 sm:pl-14 md:pl-16">
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                  {answer}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Image loading component
const LazyImage = ({ src, alt, className }) => {
  const [isLoading, setIsLoading] = React.useState(true);

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse rounded-xl" />
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        loading="lazy"
      />
    </div>
  );
};


const updates = [
  {
    title: 'Bulk Strava interval detection released',
    date: 'Nov 2025',
    summary: 'Detect every power fluctuation, auto-create Strava laps, and analyze LT blocks instantly.',
    link: '/fit-analysis'
  },
  {
    title: 'Responsive lactate calculator revamp',
    date: 'Oct 2025',
    summary: 'TestingWithoutLogin now loads faster, scales on mobile, and preserves manual adjustments.',
    link: '/lactate-curve-calculator'
  },
  {
    title: 'Training Calendar available for all roles',
    date: 'Sep 2025',
    summary: 'Athletes, coaches, and admins now share the same calendar with athlete switcher support.',
    link: '/training-calendar'
  }
];

const seoUseCases = [
  {
    title: 'Free Lactate Curve Calculator',
    description: 'Upload or enter test steps, visualize lactate vs. power/pace, and export PDF reports. Supports cycling, running, swimming, and triathlon.',
    link: '/lactate-curve-calculator',
    anchor: 'free-lactate-curve-calculator'
  },
  {
    title: 'Coach & Athlete Management Software',
    description: 'Plan workouts, review FIT trainings, sync Strava, and manage lactate history for every athlete inside one secure coach workspace.',
    link: '/dashboard',
    anchor: 'coach-athlete-management'
  },
  {
    title: 'Training Calendar with Strava & FIT Sync',
    description: 'Compare planned vs. completed sessions, detect intervals automatically, and keep all sports in a single interactive calendar.',
    link: '/training-calendar',
    anchor: 'training-calendar'
  }
];

const faqItems = [
  {
    icon: 'question',
    question: 'What is lactate threshold and why is it important?',
    answer: "Lactate threshold is the exercise intensity at which lactate begins to accumulate in the blood. It's crucial for endurance athletes because it determines your optimal training zones and racing strategy. Our free lactate calculator helps you find your LT1 and LT2 thresholds accurately."
  },
  {
    icon: 'check',
    question: 'How accurate is the free lactate threshold calculator?',
    answer: 'LaChart uses multiple professional methods (OBLA, Dmax, IAT, log-log) to calculate your lactate threshold with high accuracy. Our algorithms are based on sports science research and provide reliable results for cycling, running, and triathlon training.'
  },
  {
    icon: 'user',
    question: 'Do I need to register to use the lactate calculator?',
    answer: 'No registration is required for basic lactate threshold calculations. You can use our free online calculator immediately. However, creating a free account allows you to save results, track progress over time, and access advanced features.'
  },
  {
    icon: 'flag',
    question: 'What sports is LaChart suitable for?',
    answer: 'LaChart is designed for all endurance sports including cycling, running, triathlon, swimming, and rowing. Our lactate testing protocols and training zone calculations work for any sport that involves sustained aerobic effort.'
  },
  {
    icon: 'chart',
    question: 'How does LaChart compare to expensive lab testing?',
    answer: 'While lab testing provides the most precise results, LaChart offers professional-grade analysis at a fraction of the cost. Our algorithms use the same calculation methods as expensive sports science software, making advanced lactate analysis accessible to all athletes.'
  }
];

const About = () => {
  // Cookie consent state
  const [showCookieBar, setShowCookieBar] = useState(false);
  const [leadEmail, setLeadEmail] = useState('');
  // Filter state
  const [selectedCategory, setSelectedCategory] = useState('All');
  // Sticky header state
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Cookie consent effect
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('cookiesAccepted')) {
      setTimeout(() => setShowCookieBar(true), 1500);
    }
  }, []);

  // Handle scroll for sticky header
  useEffect(() => {
    const handleScroll = () => {
      // Show header after scrolling past the demo banner and navbar
      setIsScrolled(window.scrollY > 120);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Smooth scroll to section
  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      const headerHeight = 80; // Fixed offset for sticky header
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight;
      window.scrollTo({
        top: Math.max(0, offsetPosition),
        behavior: 'smooth'
      });
    }
    setIsMobileMenuOpen(false);
  };

  const handleAcceptCookies = () => {
    localStorage.setItem('cookiesAccepted', '1');
    setShowCookieBar(false);
  };

  const handleLeadSubmit = (event) => {
    event.preventDefault();
    if (!leadEmail) {
      return;
    }
    trackEvent('lead_submit', { source: 'about_page', email: leadEmail });
    if (typeof window !== 'undefined') {
      const subject = encodeURIComponent('LaChart onboarding request');
      const body = encodeURIComponent(`Email: ${leadEmail}\n\nI would like a quick walkthrough of LaChart and its lactate analysis features.`);
      window.location.href = `mailto:lachart@lachart.net?subject=${subject}&body=${body}`;
    }
    setLeadEmail('');
  };

  // Category mapping from feature categories to filter buttons
  const categoryMap = {
    'Core Feature': 'Testing',
    'Analysis': 'Analysis',
    'Training': 'Testing',
    'Progress': 'Analytics',
    'Integration': 'Integration',
    'Organization': 'Management',
    'Coaching': 'Management',
    'Planning': 'Planning',
    'Analytics': 'Analytics',
    'Tools': 'Tools'
  };

  const features = [
    {
      title: 'Lactate Curve Generation',
      description: 'Enter test values (power, heart rate, lactate, or pace for running/swimming) and automatically generate your lactate curve. Calculate critical thresholds: LT1, LT2, LTP1, LTP2, IAT, Log-log, OBLA (2.0, 2.5, 3.0, 3.5), and baseline adjustments. Visualize your complete lactate profile.',
      icon: '📊',
      category: 'Core Feature'
    },
    {
      title: 'Training Zone Calculation',
      description: 'Automatically calculate 5 training zones (Active Recovery, Endurance, Tempo, Lactate Threshold, VO2 Max) with precise power/pace ranges and percentages. Zones are calculated from your lactate thresholds and customized for cycling, running, and swimming.',
      icon: '🎯',
      category: 'Core Feature'
    },
    {
      title: 'Historical Test Comparison',
      description: 'Store all your lactate tests and compare curves over time. Track how your zones shift and improve. Visualize progress by overlaying multiple test curves to see your lactate threshold evolution.',
      icon: '📈',
      category: 'Analysis'
    },
    {
      title: 'Lactate Recording to Intervals',
      description: 'Record lactate values directly to training intervals. Categorize workouts by intensity (Threshold, VO2max, Endurance, etc.) and track lactate levels for each interval. Build a comprehensive database of your training responses.',
      icon: '🧪',
      category: 'Training'
    },
    {
      title: 'Training Progress Tracking',
      description: 'Compare the same workout type over time. Track how your pace/power improves for identical training sessions (e.g., 10x1km runs) at the same lactate level. See your progress visualized across months and seasons.',
      icon: '⚡',
      category: 'Progress'
    },
    {
      title: 'Strava Integration',
      description: 'Sync workouts from Strava. Automatically import training data including power, heart rate, cadence, and speed. Analyze TSS, training load, and performance metrics—all in one platform.',
      icon: '🔗',
      category: 'Integration'
    },
    {
      title: 'FIT File Analysis',
      description: 'Upload FIT files directly from your devices. Full analysis with interval detection, power/pace graphs, heart rate zones, and comprehensive training statistics. Automatic interval detection from power fluctuations.',
      icon: '📤',
      category: 'Integration'
    },
    {
      title: 'Training Categorization',
      description: 'Automatically categorize workouts by intensity based on lactate zones and power/pace. Classify sessions as Threshold, VO2max, Endurance, Tempo, or Recovery. Track training distribution and balance.',
      icon: '🏷️',
      category: 'Organization'
    },
    {
      title: 'Coach & Athlete Management',
      description: 'For coaches: manage multiple athletes, view their historical lactate tests, track training calendars, and monitor lactate values from workouts. Switch between athletes seamlessly and get a complete overview of each athlete\'s development.',
      icon: '👨‍🏫',
      category: 'Coaching'
    },
    {
      title: 'Training Calendar',
      description: 'Interactive calendar showing all workouts from Strava, FIT files, and manual entries. View training load and track lactate measurements across your training timeline.',
      icon: '📅',
      category: 'Planning'
    },
    {
      title: 'TSS & Performance Analytics',
      description: 'Calculate Training Stress Score (TSS) for each workout. Analyze training load, intensity distribution, and performance trends. Monthly zone analysis showing time spent in each training zone.',
      icon: '📊',
      category: 'Analytics'
    },
    {
      title: 'Free Lactate Calculator',
      description: 'No registration required. Enter your test data and instantly generate a lactate curve with all threshold calculations. Export results to PDF. Perfect for quick analysis without creating an account.',
      icon: '🧮',
      category: 'Tools'
    }
  ];

  // Filter features based on selected category
  const filteredFeatures = selectedCategory === 'All' 
    ? features 
    : features.filter(feature => categoryMap[feature.category] === selectedCategory);

  const audiences = [
    {
      title: 'Coaches',
      description: 'Manage multiple athletes, view historical lactate tests, track training calendars, and monitor lactate values from workouts',
      icon: '👨‍🏫'
    },
    {
      title: 'Athletes',
      description: 'Generate lactate curves, calculate training zones, track progress over time, and record lactate to intervals',
      icon: '🏃‍♂️'
    },
    {
      title: 'Cyclists',
      description: 'Test with power, calculate zones, sync from Strava, and analyze TSS and training load',
      icon: '🚴'
    },
    {
      title: 'Triathletes',
      description: 'Test with pace, track improvements in same workouts over time, and compare historical tests',
      icon: '🏊'
    }
  ];

  const faqStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    }))
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>Lactate Curve Analyzer & Lactate Threshold Calculator | LaChart - Free Online Tool</title>
        <link rel="canonical" href="https://lachart.net/about" />
        <meta name="description" content="Generate lactate curves from test data, calculate all critical thresholds (LT1, LT2, LTP1, LTP2, IAT, Log-log, OBLA), and automatically determine training zones. Track progress over time, record lactate to intervals, and analyze workouts from Strava, Garmin, and Wahoo." />
        <meta name="keywords" content="lactate curve analyzer, lactate threshold calculator, lactate measurement, OBLA calculation, LT1 LT2 calculator, IAT threshold, endurance training zones, lactate testing app, sports analytics, performance analysis, cycling lactate test, running lactate test, lactate threshold training, anaerobic threshold, aerobic threshold, lactate zones, training zones calculator, sports science, endurance performance, lactate testing protocol, threshold training, cycling performance, running performance, triathlon training, lactate curve analysis, lactate testing software, free lactate calculator, online lactate analysis, lactate threshold determination, training zone calculator, endurance sports, performance testing, lactate testing methods, lactate threshold training zones, cycling power zones, running pace zones, lactate testing equipment, lactate threshold test, lactate curve interpretation, lactate testing results, lactate threshold improvement, lactate testing for athletes, lactate testing for coaches, lactate testing protocol cycling, lactate testing protocol running, lactate threshold training plan, lactate testing data analysis, lactate curve fitting, lactate threshold calculation methods, lactate testing accuracy, lactate testing reliability, lactate testing validity, lactate testing standardization, lactate testing best practices, lactate testing guidelines, lactate testing recommendations, lactate testing tips, lactate testing advice, lactate testing help, lactate testing support, lactate testing tutorial, lactate testing guide, lactate testing manual, lactate testing handbook, lactate testing book, lactate testing research, lactate testing studies, lactate testing science, lactate testing methodology, lactate testing techniques, lactate testing procedures, lactate testing protocols, lactate testing standards, lactate testing quality, lactate testing precision, lactate testing consistency, lactate testing reproducibility, lactate testing repeatability, lactate testing validity, lactate testing reliability, lactate testing accuracy, lactate testing sensitivity, lactate testing specificity, lactate testing predictive value, lactate testing diagnostic accuracy, lactate testing clinical utility, lactate testing practical application, lactate testing real world, lactate testing field testing, lactate testing laboratory testing, lactate testing portable testing, lactate testing mobile testing, lactate testing remote testing, lactate testing telemedicine, lactate testing digital health, lactate testing health technology, lactate testing fitness technology, lactate testing sports technology, lactate testing performance technology, lactate testing training technology, lactate testing coaching technology, lactate testing athlete technology, lactate testing coach technology, lactate testing team technology, lactate testing club technology, lactate testing organization technology, lactate testing institution technology, lactate testing university technology, lactate testing college technology, lactate testing school technology, lactate testing academy technology, lactate testing center technology, lactate testing facility technology, lactate testing laboratory technology, lactate testing clinic technology, lactate testing hospital technology, lactate testing medical technology, lactate testing healthcare technology, lactate testing wellness technology, lactate testing lifestyle technology, lactate testing fitness technology, lactate testing health technology, lactate testing sports technology, lactate testing performance technology, lactate testing training technology, lactate testing coaching technology, lactate testing athlete technology, lactate testing coach technology, lactate testing team technology, lactate testing club technology, lactate testing organization technology, lactate testing institution technology, lactate testing university technology, lactate testing college technology, lactate testing school technology, lactate testing academy technology, lactate testing center technology, lactate testing facility technology, lactate testing laboratory technology, lactate testing clinic technology, lactate testing hospital technology, lactate testing medical technology, lactate testing healthcare technology, lactate testing wellness technology, lactate testing lifestyle technology" />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
        <meta name="author" content="LaChart Team" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#7c3aed" />
        <meta property="og:title" content="Lactate Curve Analyzer & Lactate Threshold Calculator | LaChart - Free Online Tool" />
        <meta property="og:description" content="Generate lactate curves from test data, calculate all critical thresholds (LT1, LT2, LTP1, LTP2, IAT, Log-log, OBLA), and automatically determine training zones. Track progress over time, record lactate to intervals, and analyze workouts from Strava." />
        <meta property="og:image" content="https://lachart.net/images/lachart1.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://lachart.net/about" />
        <meta property="og:site_name" content="LaChart" />
        <meta property="og:locale" content="en_US" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Lactate Curve Analyzer & Lactate Threshold Calculator | LaChart" />
        <meta name="twitter:description" content="Generate lactate curves from test data, calculate all critical thresholds (LT1, LT2, LTP1, LTP2, IAT, Log-log, OBLA), and automatically determine training zones. Track progress over time, record lactate to intervals, and analyze workouts from Strava." />
        <meta name="twitter:image" content="https://lachart.net/images/lachart1.png" />
        <meta name="twitter:site" content="@lachart" />
        <meta name="twitter:creator" content="@lachart" />
        <link rel="alternate" hrefLang="en" href="https://lachart.net/about" />
        <link rel="alternate" hrefLang="x-default" href="https://lachart.net/about" />
        <script type="application/ld+json">
          {`
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "LaChart - Lactate Curve Analyzer",
              "url": "https://lachart.net/about",
              "description": "Generate lactate curves from test data, calculate all critical thresholds (LT1, LT2, LTP1, LTP2, IAT, Log-log, OBLA), and automatically determine training zones. Track progress over time, record lactate to intervals, and analyze workouts from Strava.",
              "applicationCategory": "SportsApplication",
              "operatingSystem": "Web Browser",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "publisher": {
                "@type": "Organization",
                "name": "LaChart",
                "url": "https://lachart.net",
                "logo": {
                  "@type": "ImageObject",
                  "url": "https://lachart.net/images/LaChart.png"
                }
              },
              "featureList": [
                "Lactate Curve Analysis",
                "LT1 and LT2 Calculation", 
                "OBLA Determination",
                "IAT Threshold Analysis",
                "Training Zone Calculation",
                "Coach Mode",
                "Athlete Management",
                "Performance Tracking",
                "Data Export",
                "Free Online Calculator"
              ],
              "screenshot": "https://lachart.net/images/lachart1.png",
              "softwareVersion": "2.0",
              "datePublished": "2024-01-01",
              "dateModified": "2025-01-23",
              "inLanguage": "en",
              "isAccessibleForFree": true,
              "browserRequirements": "Requires JavaScript. Requires HTML5.",
              "softwareHelp": "https://lachart.net/lactate-guide",
              "author": {
                "@type": "Organization",
                "name": "LaChart Team"
              }
            }
          `}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(faqStructuredData)}
        </script>
      </Helmet>
      {/* Navbar with hover effects */}
      <nav className="w-full bg-white shadow-sm py-4 px-6 flex items-center justify-between z-20 relative">
        <div className="flex items-center gap-2">
          <a href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <img src="/images/LaChart.png" alt="LaChart Logo" className="h-9 w-11" />
            <span className="text-2xl font-bold text-primary tracking-tight">LaChart</span>
          </a>
        </div>
        <div className="flex items-center gap-6">
          <a href="/login" className="text-primary font-semibold hover:text-primary-dark transition-colors">Login</a>
          <a href="/signup" className="px-4 py-2 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">Register</a>
        </div>
      </nav>
      {/* Demo Info with improved styling */}
      <div className="w-full bg-secondary text-white py-3 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-4">
          <span className="font-semibold text-center sm:text-left">Test your demo app with calculating Lactate thresholds from a lactate testing.</span>
          <a href="/lactate-curve-calculator" 
             className="inline-block px-6 py-2 rounded-lg bg-white text-secondary font-bold shadow-lg hover:shadow-xl hover:bg-gray-50 transform hover:-translate-y-0.5 transition-all">
            Try Demo
          </a>
        </div>
      </div>
      {/* Sticky Navigation Header */}
      <nav className={`fixed top-0 left-0 right-0 z-50 bg-white shadow-md transition-all duration-300 ${isScrolled ? 'py-2 shadow-lg' : 'py-3'} ${isScrolled ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
              <img src="/images/LaChart.png" alt="LaChart Logo" className="h-8 w-10" />
              <span className="text-xl font-bold text-primary tracking-tight">LaChart</span>
            </a>
            
            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-1 overflow-x-auto">
              <button onClick={() => scrollToSection('features')} className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:text-primary whitespace-nowrap transition-colors">Features</button>
              <button onClick={() => scrollToSection('connect')} className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:text-primary whitespace-nowrap transition-colors">Connect</button>
              <button onClick={() => scrollToSection('solutions')} className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:text-primary whitespace-nowrap transition-colors">Solutions</button>
              <button onClick={() => scrollToSection('guide')} className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:text-primary whitespace-nowrap transition-colors">Guide</button>
              <button onClick={() => scrollToSection('coaching')} className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:text-primary whitespace-nowrap transition-colors">Coaching</button>
              <button onClick={() => scrollToSection('testimonials')} className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:text-primary whitespace-nowrap transition-colors">Testimonials</button>
              <button onClick={() => scrollToSection('how-to-use')} className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:text-primary whitespace-nowrap transition-colors">How to Use</button>
              <button onClick={() => scrollToSection('faq')} className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:text-primary whitespace-nowrap transition-colors">FAQ</button>
              <button onClick={() => scrollToSection('contact')} className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:text-primary whitespace-nowrap transition-colors">Contact</button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 text-gray-700 hover:text-primary"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile Navigation */}
          {isMobileMenuOpen && (
            <div className="lg:hidden py-4 border-t border-gray-200">
              <div className="flex flex-col gap-2">
                <button onClick={() => scrollToSection('features')} className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary text-left">Features</button>
                <button onClick={() => scrollToSection('connect')} className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary text-left">Connect</button>
                <button onClick={() => scrollToSection('solutions')} className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary text-left">Solutions</button>
                <button onClick={() => scrollToSection('guide')} className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary text-left">Guide</button>
                <button onClick={() => scrollToSection('coaching')} className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary text-left">Coaching</button>
                <button onClick={() => scrollToSection('testimonials')} className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary text-left">Testimonials</button>
                <button onClick={() => scrollToSection('how-to-use')} className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary text-left">How to Use</button>
                <button onClick={() => scrollToSection('faq')} className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary text-left">FAQ</button>
                <button onClick={() => scrollToSection('contact')} className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary text-left">Contact</button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section - TrainingPeaks Style */}
      <section id="hero" className="relative bg-gradient-to-br from-primary via-primary to-purple-700 text-white py-20 sm:py-24 lg:py-32 overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight"
            >
              Maximize Your Lactate Performance
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-xl sm:text-2xl mb-8 text-purple-100 max-w-2xl mx-auto"
            >
              Generate lactate curves from your test data, calculate training zones, and track your progress over time. The complete training ecosystem for athletes and coaches focused on lactate-based performance.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            >
              <a
                href="/signup"
                onClick={() => trackEvent('cta_click', { label: 'about_signup' })}
                className="inline-flex items-center justify-center bg-white text-primary font-bold px-8 py-4 rounded-lg shadow-xl hover:bg-gray-50 transition-all transform hover:-translate-y-1 text-lg min-w-[200px]"
              >
                Sign Up
              </a>
              <a
                href="/lactate-curve-calculator"
                onClick={() => trackEvent('cta_click', { label: 'about_try_demo' })}
                className="inline-flex items-center justify-center border-2 border-white text-white font-bold px-8 py-4 rounded-lg hover:bg-white hover:text-primary transition-all transform hover:-translate-y-1 text-lg min-w-[200px]"
              >
                Try Demo for Free
              </a>
            </motion.div>
            </div>
          </div>
        
        {/* Decorative bottom wave */}
        <div className="absolute bottom-0 left-0 w-full">
          <svg className="w-full h-16 text-white" fill="currentColor" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <path d="M0,0 C300,120 900,0 1200,120 L1200,120 L0,120 Z"></path>
          </svg>
          </div>
      </section>

      {/* Total Training Ecosystem Section - TrainingPeaks Style */}
      <section id="features" className="py-20 bg-white scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase mb-3">LaChart Features</h2>
            <h3 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4">
              The Total Training Ecosystem
            </h3>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              LaChart is your complete training ecosystem focused on lactate-based performance. Generate lactate curves from test data, calculate training zones, track progress over time, record lactate to intervals, sync with Strava—all in one platform.
            </p>
                </div>
          
          {/* Feature Categories */}
          <div className="mb-12">
            <div className="flex flex-wrap justify-center gap-3 mb-8">
              {['All', 'Analysis', 'Management', 'Planning', 'Integration', 'Tools', 'Testing', 'Analytics'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredFeatures.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all group"
                >
                  <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">{feature.icon}</div>
                  <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">{feature.category}</div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </motion.div>
              ))}
          </div>
          </div>
        </div>
      </section>

      {/* Connect & Sync Section - TrainingPeaks Style */}
      <section id="connect" className="py-20 bg-gray-50 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <h2 className="text-base text-primary font-semibold tracking-wide uppercase mb-3">Device Connections</h2>
              <h3 className="text-4xl font-extrabold text-gray-900 mb-6">
                Connect, Sync, Go
              </h3>
              <p className="text-lg text-gray-600 mb-8">
                When your gear syncs, your training stays on track. Connect your favorite apps, wearables, and devices. Upload FIT files directly or sync with Strava. After each session, your metrics automatically flow into LaChart, connecting you, your data, and your coach.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {['Strava', 'FIT Files', 'Manual Entry'].map((device) => (
                  <div key={device} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-200">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700">{device}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-center">
              <LazyImage 
                src="/images/lachart1.png" 
                alt="LaChart Device Integration" 
                className="w-full max-w-2xl h-[260px] sm:h-[320px] lg:h-[380px] rounded-3xl shadow-2xl border border-gray-200 object-contain bg-white" 
              />
            </div>
        </div>
        </div>
      </section>

      {/* Features Section - TrainingPeaks Athlete Features Style */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Every Ride, Run, and Rep */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center mb-24">
            <div className="order-2 lg:order-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Lactate Curve Generation</h3>
              </div>
              <p className="text-lg text-gray-600 leading-relaxed">
                Enter your test values (power, heart rate, lactate, or pace) and instantly generate your lactate curve. Calculate all critical thresholds: LT1, LT2, LTP1, LTP2, IAT, Log-log, OBLA (2.0-3.5), and baseline adjustments. See your complete lactate profile visualized in one clear graph.
              </p>
            </div>
            <div className="order-1 lg:order-2 flex justify-center">
              <LazyImage 
                src="/images/lachart_training.png" 
                alt="Every Ride, Run, and Rep - LaChart Features" 
                className="w-full max-w-2xl h-[260px] sm:h-[340px] lg:h-[420px] rounded-3xl shadow-2xl border border-gray-200 object-cover" 
              />
            </div>
          </div>

          {/* Sync, Link, and Connect */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center mb-24">
            <div className="flex justify-center order-1 lg:order-1">
              <LazyImage 
                src="/images/lachart2.jpeg" 
                alt="Sync, Link, and Connect - LaChart Features" 
                className="w-full max-w-2xl h-[260px] sm:h-[340px] lg:h-[420px] rounded-3xl shadow-2xl border border-gray-200 object-cover" 
              />
            </div>
            <div className="order-2 lg:order-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Sync, Link, and Connect</h3>
              </div>
              <p className="text-lg text-gray-600 leading-relaxed">
                Connect Strava. Upload FIT files or sync automatically. Import all your training data including power, heart rate, cadence, and speed. Analyze TSS, training load, and performance metrics—all in one platform.
              </p>
            </div>
          </div>

          {/* Plan, Execute, and Succeed */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center mb-24">
            <div className="order-2 lg:order-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">Training Zone Calculation</h3>
              </div>
              <p className="text-lg text-gray-600 leading-relaxed">
                Automatically calculate 5 training zones from your lactate thresholds: Active Recovery, Endurance, Tempo, Lactate Threshold, and VO2 Max. Get precise power/pace ranges and percentages for each zone. Zones are customized for cycling, running, and swimming based on your test results.
          </p>
        </div>
            <div className="order-1 lg:order-2 flex justify-center">
              <LazyImage 
                src="/images/lactate_testing.png" 
                alt="Plan, Execute, and Succeed - LaChart Features" 
                className="w-full max-w-2xl h-[260px] sm:h-[340px] lg:h-[420px] rounded-3xl shadow-2xl border border-gray-200 object-cover" 
              />
            </div>
          </div>

          {/* Go Beyond a Single Sport */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center mb-24">
            <div className="flex justify-center order-1 lg:order-1">
              <LazyImage 
                src="/images/lachart4.jpeg" 
                alt="Go Beyond a Single Sport - LaChart Features" 
                className="w-full max-w-2xl h-[260px] sm:h-[340px] lg:h-[420px] rounded-3xl shadow-2xl border border-gray-200 object-cover" 
              />
            </div>
            <div className="order-2 lg:order-2">
              <h3 className="text-3xl font-extrabold text-gray-900 mb-4">Historical Test Comparison</h3>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Store all your lactate tests and compare curves over time. Track how your zones shift and improve. Visualize progress by overlaying multiple test curves to see your lactate threshold evolution. Watch your LT1 and LT2 move to higher intensities as you get fitter.
              </p>
              <div className="space-y-3">
                {['Compare multiple test curves', 'Track zone shifts over time', 'Visualize threshold improvements', 'Export comparison reports'].map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span className="text-gray-700 font-medium">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Don't Think, Just Train */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center mb-24">
            <div className="order-2 lg:order-1">
              <h3 className="text-3xl font-extrabold text-gray-900 mb-4">Lactate Recording & Progress Tracking</h3>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Record lactate values directly to training intervals. Categorize workouts by intensity (Threshold, VO2max, Endurance, etc.) and track how your performance improves over time. Compare the same workout type (e.g., 10x1km runs) at the same lactate level to see your progress across months.
              </p>
              <div className="space-y-3">
                {['Record lactate to intervals', 'Categorize by intensity', 'Compare same workouts over time', 'Track pace/power improvements'].map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span className="text-gray-700 font-medium">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="order-1 lg:order-2 flex justify-center">
              <LazyImage 
                src="/images/lachart5.jpeg" 
                alt="Don't Think, Just Train - LaChart Features" 
                className="w-full max-w-2xl h-[260px] sm:h-[340px] lg:h-[420px] rounded-3xl shadow-2xl border border-gray-200 object-cover" 
              />
            </div>
          </div>

          {/* Metrics That Actually Make Sense */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div className="flex justify-center order-1 lg:order-1">
              <LazyImage 
                src="/images/lachart6.jpeg" 
                alt="Metrics That Actually Make Sense - LaChart Features" 
                className="w-full max-w-2xl h-[260px] sm:h-[340px] lg:h-[420px] rounded-3xl shadow-2xl border border-gray-200 object-cover" 
              />
            </div>
            <div className="order-2 lg:order-2">
              <h3 className="text-3xl font-extrabold text-gray-900 mb-4">Training Analysis & TSS</h3>
              <p className="text-lg text-gray-600 leading-relaxed mb-6">
                Analyze every workout with TSS calculation, training load tracking, and comprehensive performance metrics. View detailed graphs of power, heart rate, cadence, and speed. Automatic interval detection from FIT files and Strava activities. Everything you need to understand your training.
              </p>
              <div className="space-y-3">
                {['TSS calculation per workout', 'Training load analysis', 'Power/pace/heart rate graphs', 'Automatic interval detection'].map((metric) => (
                  <div key={metric} className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span className="text-gray-700 font-medium">{metric}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEO-focused solution blocks */}
      <section id="solutions" className="py-16 bg-gray-50 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
            <div>
              <h2 className="text-base text-primary font-semibold tracking-wide uppercase">Solutions</h2>
              <p className="mt-2 text-3xl leading-tight font-extrabold text-gray-900">
                Everything you need for lactate testing, coaching, and planning
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {seoUseCases.map((useCase) => (
              <article id={useCase.anchor} key={useCase.title} className="bg-white rounded-2xl shadow p-6 border border-gray-100 flex flex-col">
                <h3 className="text-2xl font-bold text-gray-900 mb-3">{useCase.title}</h3>
                <p className="text-gray-600 flex-1">{useCase.description}</p>
                <a
                  href={useCase.link}
                  className="inline-flex items-center text-primary font-semibold mt-6"
                  onClick={() => trackEvent('cta_click', { label: `about_use_case_${useCase.anchor}` })}
                >
                  Explore {useCase.title.split(' ')[0]}
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Lactate Guide Section */}
      <section id="guide" className="py-16 bg-gray-50 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-base text-primary font-semibold tracking-wide uppercase">Learn About Lactate</h2>
              <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                Master Lactate Threshold Training
              </p>
              <p className="mt-4 text-lg text-gray-600">
                Discover the science behind lactate, understand what lactate threshold means, and learn how to improve your performance through proper training methods. Our comprehensive guide covers everything from basic concepts to advanced training protocols.
              </p>
              <div className="mt-6 space-y-4">
                <div className="flex items-start">
                  <span className="text-primary mr-3">📚</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">Complete Theory</h3>
                    <p className="text-gray-600 text-sm">Learn what lactate is, how it affects your body, and why the threshold matters for endurance performance.</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <span className="text-primary mr-3">🧪</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">Testing Protocols</h3>
                    <p className="text-gray-600 text-sm">Understand different methods to measure lactate threshold, from lab tests to field estimations.</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <span className="text-primary mr-3">🏃‍♂️</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">Training Strategies</h3>
                    <p className="text-gray-600 text-sm">Discover proven methods to increase your lactate threshold and improve endurance performance.</p>
                  </div>
                </div>
              </div>
              <div className="mt-8">
                <a 
                  href="/lactate-guide" 
                  onClick={() => trackEvent('cta_click', { label: 'about_guide_section' })}
                  className="inline-block bg-primary text-white font-bold px-8 py-3 rounded-lg shadow hover:bg-primary-dark transition"
                >
                  Read the Complete Guide
                </a>
              </div>
            </div>
            <div className="flex justify-center">
              <LazyImage 
                src="/images/lachart3.jpeg" 
                alt="Lactate Analysis and Testing" 
                className="w-full max-w-lg rounded-2xl shadow-lg object-cover" 
              />
            </div>
          </div>
        </div>
      </section>

      {/* Screenshots Section */}
      <section className="py-16 bg-gray-50">
        <h2 className="text-3xl font-bold text-center mb-12">See LaChart in Action</h2>
        <div className="max-w-7xl mx-auto">
          <Swiper
            effect={'coverflow'}
            grabCursor={true}
            centeredSlides={true}
            initialSlide={2}
            slidesPerView={'auto'}
            coverflowEffect={{
              rotate: 0,
              stretch: 0,
              depth: 100,
              modifier: 2.5,
              slideShadows: false,
            }}
            pagination={{ 
              clickable: true,
              bulletActiveClass: 'swiper-pagination-bullet-active custom-bullet-active'
            }}
            navigation={true}
            modules={[EffectCoverflow, Pagination, Navigation]}
            className="mySwiper !pb-12"
          >
            {[
              {
                src: '/images/lactate-curve-calculator.png',
                alt: 'Lactate Curve Calculator',
                title: 'Lactate Curve Calculator'
              },
              {
                src: '/images/Form-fitness-chart.png',
                alt: 'Form & Fitness Chart',
                title: 'Form & Fitness Trend'
              },
              {
                src: '/images/training-calendar.png',
                alt: 'Training Calendar',
                title: 'Training Calendar Overview'
              },
              {
                src: '/images/training-analytics.png',
                alt: 'Training Analytics',
                title: 'Training Analytics & TSS'
              }
            ].map((image) => (
              <SwiperSlide key={image.alt} className="!w-[300px] sm:!w-[450px] md:!w-[600px]">
                {({ isActive }) => (
                  <div className={`
                    relative transition-all duration-300 
                    ${isActive ? 'scale-100' : 'scale-90 opacity-70'}
                  `}>
                    <div className="bg-white rounded-xl shadow-lg p-4 relative">
                      <div className="absolute top-3 left-3 bg-gray-100 text-xs px-2 py-1 rounded-full">
                        {image.title}
                      </div>
                      <LazyImage 
                        src={image.src}
                        alt={image.alt}
                        className="w-full h-[200px] sm:h-[300px] md:h-[400px] rounded-lg object-contain" 
                      />
                    </div>
                  </div>
                )}
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </section>

      {/* Personalized Coaching Section - TrainingPeaks Style */}
      <section id="coaching" className="py-20 bg-white scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase mb-3">For Athletes & Coaches</h2>
            <h3 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4">
              Personalized Coaching for Any Kind of Athlete
            </h3>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              For coaches: manage multiple athletes, view their historical lactate tests, track training calendars, and monitor lactate values from workouts. Switch between athletes seamlessly and get a complete overview of each athlete's development.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {audiences.map((audience, index) => (
              <motion.div
                key={audience.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-8 text-center hover:shadow-lg transition-all group"
              >
                <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">{audience.icon}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{audience.title}</h3>
                <p className="text-gray-600">{audience.description}</p>
              </motion.div>
            ))}
          </div>
          
          <div className="mt-12 text-center">
            <a
              href="/signup"
              onClick={() => trackEvent('cta_click', { label: 'about_find_coach' })}
              className="inline-flex items-center text-primary font-bold text-lg hover:text-primary-dark transition-colors"
            >
              Find a Coach
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* A Proven Guide to Peak Progress Section - TrainingPeaks Style */}‹

      {/* Testimonials Section - TrainingPeaks Style */}
      <section id="testimonials" className="py-20 bg-gray-50 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                quote: "When I started training for my first ultramarathon and half Ironman, I had no idea how to train. LaChart makes every workout simple. It's synced to my devices, and all I have to do is press start!",
                author: "Chiara",
                role: "Runner, Cyclist, Triathlete"
              },
              {
                quote: "I can rely on this software to gauge how tired I am, how much training load I'm getting, and even track lactate in relation to my scheduled training sessions.",
                author: "Sterling",
                role: "Cyclist"
              },
              {
                quote: "I hired a coach who dialed in my training, and at the age of 52, I had my strongest, most successful season yet. Not only achieving my personal goals, but also helping teammates accomplish theirs…what a great feeling!",
                author: "Marc",
                role: "Cyclist"
              },
              {
                quote: "It's worth every penny, and it gives me a huge competitive advantage over anyone not using the platform. Makes you want to keep it as a secret weapon.",
                author: "Maciej",
                role: "Triathlete"
              }
            ].map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all"
              >
                <p className="text-gray-700 mb-4 leading-relaxed">"{testimonial.quote}"</p>
                <div className="border-t border-gray-200 pt-4">
                  <p className="font-semibold text-gray-900">{testimonial.author}</p>
                  <p className="text-sm text-gray-600">{testimonial.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trusted By Section - TrainingPeaks Style */}
      <section className="py-16 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Trusted by the World's Top Sports Federations</h3>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Professional coaches, elite athletes, and training teams trust LaChart to help prep them for the biggest events in the world.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center opacity-60">
            {['Professional Coaches', 'Elite Athletes', 'Training Teams', 'Sports Labs'].map((org) => (
              <div key={org} className="text-center">
                <div className="text-sm font-semibold text-gray-700">{org}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section - TrainingPeaks Style */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase mb-3">Why LaChart</h2>
            <p className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-4">
            Why choose LaChart for your lactate testing and performance analysis?
          </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="bg-white p-10 rounded-2xl shadow-lg">
              <ul className="space-y-5 text-lg">
                <li className="flex items-start gap-3">
                  <span className="text-primary text-2xl font-bold mt-1">✓</span>
                  <span className="text-gray-700">Generate lactate curves from test data (power, heart rate, lactate, pace)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary text-2xl font-bold mt-1">✓</span>
                  <span className="text-gray-700">Calculate all critical thresholds: LT1, LT2, LTP1, LTP2, IAT, Log-log, OBLA (2.0-3.5)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary text-2xl font-bold mt-1">✓</span>
                  <span className="text-gray-700">Automatically determine 5 training zones with precise power/pace ranges</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary text-2xl font-bold mt-1">✓</span>
                  <span className="text-gray-700">Compare historical tests and track zone shifts over time</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary text-2xl font-bold mt-1">✓</span>
                  <span className="text-gray-700">Record lactate values to training intervals and categorize workouts</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary text-2xl font-bold mt-1">✓</span>
                  <span className="text-gray-700">Compare same workout types over time to track progress (e.g., 10x1km runs)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary text-2xl font-bold mt-1">✓</span>
                  <span className="text-gray-700">Sync with Strava - analyze TSS and training load</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary text-2xl font-bold mt-1">✓</span>
                  <span className="text-gray-700">Coach management: track multiple athletes' tests, training calendars, and lactate values</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary text-2xl font-bold mt-1">✓</span>
                  <span className="text-gray-700">Export results to PDF for professional reporting</span>
                </li>
              </ul>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-lg flex items-center justify-center">
              <LazyImage 
                src="/images/lachart3.png" 
                alt="Training Interface" 
                className="w-full max-w-md object-contain rounded-xl" 
              />
            </div>
          </div>
        </div>
      </section>

      {/* Latest updates */}
      <section className="py-16 bg-white border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-10">
            <div>
              <h2 className="text-base text-primary font-semibold tracking-wide uppercase">Product updates</h2>
              <p className="mt-2 text-3xl font-extrabold text-gray-900">What’s new in LaChart</p>
            </div>
            <a href="/changelog" className="text-primary font-semibold hover:text-primary-dark">
              View full changelog →
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {updates.map((item) => (
              <div key={item.title} className="bg-gray-50 rounded-2xl p-6 border border-gray-100 h-full flex flex-col">
                <p className="text-sm uppercase tracking-wide text-gray-500">{item.date}</p>
                <h3 className="text-xl font-bold text-gray-900 mt-2">{item.title}</h3>
                <p className="text-gray-600 mt-3 flex-1">{item.summary}</p>
                <a href={item.link} className="mt-4 inline-flex items-center text-primary font-semibold">
                  Learn more
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Subscribe Section - TrainingPeaks Style */}
      <section className="py-20 bg-gradient-to-br from-primary to-purple-700 text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-4">Subscribe and Stay on Track!</h2>
          <p className="text-lg text-purple-100 mb-8">
            Your training doesn't have to stop after your workout. Get weekly tips and guides sent directly to your inbox to keep you moving forward and help you conquer your next challenge.
          </p>
          <form onSubmit={handleLeadSubmit} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              required
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
              placeholder="you@email.com"
              className="flex-1 px-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-white"
            />
            <button
              type="submit"
              className="px-6 py-3 bg-white text-primary font-bold rounded-lg shadow-lg hover:bg-gray-50 transition-all transform hover:-translate-y-0.5 whitespace-nowrap"
            >
              Submit
            </button>
          </form>
          <p className="text-sm text-purple-200 mt-4">
            Receive the latest training articles and updates on our products and services.
          </p>
        </div>
      </section>

      {/* How to Use LaChart Section */}
      <section id="how-to-use" className="py-16 bg-white scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-base text-primary font-semibold tracking-wide uppercase text-center">How to Use LaChart</h2>
          <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl text-center mb-12">
            Real-World Applications
          </p>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Lactate Testing Card */}
            <div className="bg-gray-50 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="text-3xl mb-4">🧪</div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Lactate Testing</h3>
              <p className="text-gray-600">
                During lactate tests, record each step's data including intervals and measurements. LaChart automatically generates your lactate curve and identifies key points like LT1, LT2, and other thresholds. Compare with historical tests to track your performance improvements over time.
              </p>
            </div>

            {/* Coach Management Card */}
            <div className="bg-gray-50 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="text-3xl mb-4">👥</div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Coach Management</h3>
              <p className="text-gray-600">
                Coaches and testers can organize athletes into groups, assign and conduct tests, and evaluate results. The platform provides a comprehensive overview of each athlete's progress and development over time.
              </p>
            </div>

            {/* Training Progress Card */}
            <div className="bg-gray-50 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="text-3xl mb-4">📈</div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Training Progress</h3>
              <p className="text-gray-600">
                For recurring training sessions, like "10x1km LT2 runs", track changes in lactate levels and pace across multiple sessions. Monitor your progress and see how your performance metrics improve over time.
              </p>
            </div>
          </div>

          {/* Example Workflow */}
          <div className="mt-12 bg-gray-50 p-8 rounded-2xl shadow-lg">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Example Workflow</h3>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">1</div>
                <div>
                  <h4 className="font-semibold text-gray-900">Record Test Data</h4>
                  <p className="text-gray-600">Enter your step-by-step test data including power output, heart rate, and lactate measurements.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">2</div>
                <div>
                  <h4 className="font-semibold text-gray-900">Analyze Results</h4>
                  <p className="text-gray-600">LaChart automatically generates your lactate curve and calculates key training zones (LT1, LT2, OBLA, IAT).</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold">3</div>
                <div>
                  <h4 className="font-semibold text-gray-900">Track Progress</h4>
                  <p className="text-gray-600">Compare current results with historical data to visualize your performance improvements.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Coach & athlete collaboration explainer */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div>
              <h2 className="text-base text-primary font-semibold tracking-wide uppercase">Coach workspace</h2>
              <p className="mt-2 text-3xl font-extrabold text-gray-900">
                Invite athletes, track their tests, and approve trainings
              </p>
              <ul className="mt-6 space-y-4 text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="text-primary font-bold">1.</span>
                  <div>
                    <p className="font-semibold text-gray-900">Create athlete profiles</p>
                    <p className="text-sm text-gray-600">Add each athlete once. Assign roles (athlete, coach, admin) and share credentials securely.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary font-bold">2.</span>
                  <div>
                    <p className="font-semibold text-gray-900">Upload trainings & tests</p>
                    <p className="text-sm text-gray-600">Import FIT/Strava sessions or log manual workouts. Attach lactate tests, interpret LT1/LT2, and save notes per athlete.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-primary font-bold">3.</span>
                  <div>
                    <p className="font-semibold text-gray-900">Monitor calendars and intervals</p>
                    <p className="text-sm text-gray-600">Switch athletes via the dashboard or Training Calendar. Detect intervals automatically, compare planned vs. completed, and adjust training blocks.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="text-base text-secondary font-semibold tracking-wide uppercase">Athlete workspace</h2>
              <p className="mt-2 text-3xl font-extrabold text-gray-900">
                Athletes add data; coaches see progress instantly
              </p>
              <ul className="mt-6 space-y-4 text-gray-700">
                <li className="flex items-start gap-3">
                  <span className="text-secondary font-bold">A.</span>
                  <div>
                    <p className="font-semibold text-gray-900">Log in and connect Strava</p>
                    <p className="text-sm text-gray-600">Athletes authenticate, sync their devices, or type workouts manually so each training flows into the shared calendar.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-secondary font-bold">B.</span>
                  <div>
                    <p className="font-semibold text-gray-900">Record tests on site or remotely</p>
                    <p className="text-sm text-gray-600">Use the lactate form to input steps, base lactate, and intensity. Results instantly populate coach dashboards and testing history.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-secondary font-bold">C.</span>
                  <div>
                    <p className="font-semibold text-gray-900">Collaborate in real time</p>
                    <p className="text-sm text-gray-600">Coaches leave comments, adjust training load, and athletes confirm sessions. Everyone sees the same analytics and exported reports.</p>
                  </div>
                </li>
              </ul>
              <div className="mt-8 bg-white rounded-2xl p-5 shadow">
                <p className="text-sm text-gray-600 mb-3 uppercase tracking-wide">Access control</p>
                <p className="text-gray-800">
                  Athletes only see their own data. Coaches can switch between assigned athletes, and admins manage the entire organization. This mirrors how you already work offline—just digitized.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Description Section at the end */}
      <section className="py-16 bg-white border-t border-gray-100 mt-12">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center gap-10">
          <div className="flex-1 order-2 md:order-1">
            <h2 className="text-2xl font-bold text-primary mb-4">Try the Lactate Test Demo</h2>
            <p className="text-lg text-gray-700 mb-4">
              You can try out our demo by filling in your own test data in the lactate test form. After submitting, the app will generate a lactate curve from your data and automatically calculate important training zones such as <strong>LT1</strong>, <strong>LT2</strong>, and others (OBLA, IAT, log-log, etc.).
            </p>
            <p className="text-gray-600 mb-4">
              This is a great way to see how LaChart analyzes your performance and helps you understand your endurance profile. No login is required and your data will not be saved. Just experiment and see your results instantly!
            </p>
            <a href="/lactate-curve-calculator" className="inline-block mt-2 px-6 py-3 rounded bg-primary text-white font-bold shadow hover:bg-primary-dark transition">Try the Demo Now</a>
          </div>
          <div className="flex-1 flex justify-center order-1 md:order-2 mb-8 md:mb-0">
            <LazyImage 
              src="/images/lachart-test.png" 
              alt="Lactate Test Demo Screenshot" 
              className="max-w-xl w-full rounded-xl shadow object-contain border border-gray-100" 
            />
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-12 sm:py-16 md:py-20 bg-gradient-to-br from-gray-50 via-white to-blue-50/30 scroll-mt-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900 mb-3 sm:mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto">
              Everything you need to know about lactate threshold testing and LaChart
            </p>
          </div>
          <div className="space-y-3 sm:space-y-4">
            {faqItems.map((item) => (
              <FAQItem key={item.question} {...item} />
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section id="contact" className="py-16 bg-gray-50 border-t border-gray-100 scroll-mt-24">
        <div className="max-w-2xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-2xl font-bold text-primary mb-6 text-center">Contact us</h2>
            <ContactUs />
          </motion.div>
        </div>
      </section>

      {/* Ready to Go All In Section - TrainingPeaks Style */}
      <section className="py-24 bg-gradient-to-br from-primary via-primary to-purple-700 text-white relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
              <motion.h2 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6"
              >
              Ready to Go All In?
              </motion.h2>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-xl sm:text-2xl text-purple-100 mb-10"
              >
              Supercharge your data and cut through the noise with LaChart. Go all in on your training and bring it all under one roof.
              </motion.p>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
            <a
              href="/signup"
              onClick={() => trackEvent('cta_click', { label: 'footer_get_started' })}
                className="inline-flex items-center justify-center px-8 py-4 border border-transparent text-lg font-bold rounded-lg text-primary bg-white hover:bg-gray-100 transform hover:-translate-y-1 transition-all shadow-xl hover:shadow-2xl min-w-[200px]"
            >
                Sign Up
            </a>
            <a
              href="/login"
              onClick={() => trackEvent('cta_click', { label: 'footer_sign_in' })}
                className="inline-flex items-center justify-center px-8 py-4 border-2 border-white text-lg font-bold rounded-lg text-white hover:bg-white hover:text-primary transform hover:-translate-y-1 transition-all shadow-xl hover:shadow-2xl min-w-[200px]"
            >
                Sign In
            </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <motion.footer 
        className="bg-white py-12 border-t"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <a href="/" className="flex items-center gap-2">
                <img src="/images/LaChart.png" alt="LaChart Logo" className="h-9 w-11" />
                <span className="text-2xl font-bold text-primary tracking-tight">LaChart</span>
              </a>
              <p className="mt-4 text-gray-600">
                Advanced lactate testing and analysis for athletes and coaches.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 tracking-wider uppercase">Quick Links</h3>
              <ul className="mt-4 space-y-4">
                <li>
                  <a href="/lactate-curve-calculator" className="text-base text-gray-600 hover:text-primary">
                    Try Demo
                  </a>
                </li>
                <li>
                  <a href="/lactate-guide" className="text-base text-gray-600 hover:text-primary">
                    Lactate Guide
                  </a>
                </li>
                <li>
                  <a href="/login" className="text-base text-gray-600 hover:text-primary">
                    Login
                  </a>
                </li>
                <li>
                  <a href="/signup" className="text-base text-gray-600 hover:text-primary">
                    Register
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 tracking-wider uppercase">Contact</h3>
              <ul className="mt-4 space-y-4">
                <li className="flex items-center">
                  <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a href="mailto:lachart@lachart.net" className="ml-2 text-gray-600 hover:text-primary">
                    lachart@lachart.net
                  </a>
                </li>
                <li className="flex items-center">
                  <svg className="h-6 w-6 text-primary" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.5A4.25 4.25 0 0 0 3.5 7.75v8.5A4.25 4.25 0 0 0 7.75 20.5h8.5A4.25 4.25 0 0 0 20.5 16.25v-8.5A4.25 4.25 0 0 0 16.25 3.5h-8.5Zm8.75 2a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.5A3.5 3.5 0 1 0 12 15a3.5 3.5 0 0 0 0-7Z" />
                  </svg>
                  <a
                    href="https://www.instagram.com/lachartapp/?igsh=MXUwZWF3MnU2OXE0dg%3D%3D"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-gray-600 hover:text-primary"
                  >
                    @lachartapp on Instagram
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-200 pt-8 text-center space-y-3">
            <p className="text-base text-gray-400">
              &copy; {new Date().getFullYear()} LaChart. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-gray-500">
              <a
                href="https://lachart.net/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                Privacy Policy
              </a>
              <span className="text-gray-300">•</span>
              <a
                href="/terms"
                className="hover:text-primary transition-colors"
              >
                Terms of Use
              </a>
            </div>
            <p className="text-sm text-gray-500">
              Need help or have questions?{" "}
              <a
                href="mailto:lachart@lachart.net"
                className="text-primary hover:text-primary-dark font-medium"
              >
                Contact us
              </a>
              .
            </p>
          </div>
        </div>
      </motion.footer>

      {/* Cookie Consent Banner */}
      {showCookieBar && (
        <div className="fixed bottom-0 left-0 w-full z-[99999] flex items-end justify-center pointer-events-none">
          <div className="pointer-events-auto bg-white/90 border rounded-t-xl shadow px-6 py-4 mb-0 text-sm flex flex-col md:flex-row gap-3 md:gap-8 items-center fade-in-up animate-fade-in-up">
            <span>
              This website uses cookies to ensure you get the best experience.{' '}
              <a href="/privacy" target="_blank" className="underline text-primary">Learn more</a>.
            </span>
            <button
              className="ml-2 px-5 py-1 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark transition"
              onClick={handleAcceptCookies}
            >
              I Agree
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default About;