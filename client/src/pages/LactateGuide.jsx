import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { trackGuideInteraction, trackConversionFunnel } from '../utils/analytics';

const LactateGuide = () => {
  // FAQ state and item toggling (match SupportPage behavior)
  const [openFaq, setOpenFaq] = useState(new Set([0]));
  const toggleFaq = (index) => {
    const updated = new Set(openFaq);
    if (updated.has(index)) updated.delete(index); else updated.add(index);
    setOpenFaq(updated);
  };

  // Track page view and smooth scroll handler
  useEffect(() => {
    // Track page view
    trackGuideInteraction('view', 'page_load');
    trackConversionFunnel('guide_view', { source: 'direct' });

    const handleSmoothScroll = (e) => {
      const target = e.target.closest('a[href^="#"]');
      if (target) {
        e.preventDefault();
        const targetId = target.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
          trackGuideInteraction('section_click', targetId);
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }
    };

    // Add event listener to the document
    document.addEventListener('click', handleSmoothScroll);

    // Cleanup
    return () => {
      document.removeEventListener('click', handleSmoothScroll);
    };
  }, []);

  const faqItems = [
    {
      question: 'What is the best method to calculate lactate threshold?',
      answer: 'No single method is perfect. LaChart uses multiple methods (OBLA, Dmax, IAT, log-log) and cross-validates results for the most accurate threshold determination.'
    },
    {
      question: 'How often should I test my lactate threshold?',
      answer: "Every 6-8 weeks during training blocks, or when you notice significant performance changes. More frequent testing isn't necessary and can lead to overreaching."
    },
    {
      question: 'Can I calculate lactate threshold without blood testing?',
      answer: 'Yes, but less accurately. Use heart rate (85–90% HRmax) or power FTP-based proxies. Blood lactate testing provides the most precise results.'
    },
    {
      question: "What's the difference between LT1 and LT2?",
      answer: 'LT1 (LTP1) is the aerobic threshold where lactate first rises above baseline (~2 mmol/L). LT2 (LTP2) is the anaerobic threshold where accumulation accelerates rapidly (~4 mmol/L).' 
    }
  ];

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
  return (
    <div className="min-h-screen bg-white" style={{ scrollBehavior: 'smooth' }}>
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

      <main>
      <Helmet>
        <title>How to Calculate Lactate Threshold: Complete Guide & Testing Methods | LaChart</title>
        <link rel="canonical" href="https://lachart.net/lactate-guide" />
        <meta
          name="description"
          content="Complete guide to calculate lactate threshold with step-by-step methods: OBLA, Dmax, IAT, log-log. Professional testing protocols for cycling & running. Free lactate calculator and training zone analysis included."
        />
        <meta
          name="keywords"
          content="how to calculate lactate threshold, lactate threshold calculation, lactate testing methods, OBLA calculation, Dmax method, IAT threshold, lactate zones, cycling lactate test, running lactate test, lactate threshold training, LT1 LT2 calculation, anaerobic threshold test, aerobic threshold test, lactate threshold training zones, lactate testing protocol, lactate testing equipment, lactate testing results, lactate curve analysis, lactate threshold improvement, lactate testing for athletes, lactate testing for coaches, lactate testing protocol cycling, lactate testing protocol running, lactate threshold training plan, lactate testing data analysis, lactate curve fitting, lactate threshold calculation methods, lactate testing accuracy, lactate testing reliability, lactate testing validity, lactate testing standardization, lactate testing best practices, lactate testing guidelines, lactate testing recommendations, lactate testing tips, lactate testing advice, lactate testing help, lactate testing support, lactate testing tutorial, lactate testing guide, lactate testing manual, lactate testing handbook, lactate testing book, lactate testing research, lactate testing studies, lactate testing science, lactate testing methodology, lactate testing techniques, lactate testing procedures, lactate testing protocols, lactate testing standards, lactate testing quality, lactate testing precision, lactate testing consistency, lactate testing reproducibility, lactate testing repeatability, lactate testing validity, lactate testing reliability, lactate testing accuracy, lactate testing sensitivity, lactate testing specificity, lactate testing predictive value, lactate testing diagnostic accuracy, lactate testing clinical utility, lactate testing practical application, lactate testing real world, lactate testing field testing, lactate testing laboratory testing, lactate testing portable testing, lactate testing mobile testing, lactate testing remote testing, lactate testing telemedicine, lactate testing digital health, lactate testing health technology, lactate testing fitness technology, lactate testing sports technology, lactate testing performance technology, lactate testing training technology, lactate testing coaching technology, lactate testing athlete technology, lactate testing coach technology, lactate testing team technology, lactate testing club technology, lactate testing organization technology, lactate testing institution technology, lactate testing university technology, lactate testing college technology, lactate testing school technology, lactate testing academy technology, lactate testing center technology, lactate testing facility technology, lactate testing laboratory technology, lactate testing clinic technology, lactate testing hospital technology, lactate testing medical technology, lactate testing healthcare technology, lactate testing wellness technology, lactate testing lifestyle technology"
        />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
        <meta name="author" content="LaChart Team" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#7c3aed" />
        <meta property="og:title" content="How to Calculate Lactate Threshold: Complete Guide & Testing Methods | LaChart" />
        <meta property="og:description" content="Complete guide to calculate lactate threshold with step-by-step methods: OBLA, Dmax, IAT, log-log. Professional testing protocols for cycling & running. Free lactate calculator included." />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://lachart.net/lactate-guide" />
        <meta property="og:image" content="https://lachart.net/images/lactate-analysis.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="LaChart" />
        <meta property="og:locale" content="en_US" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="How to Calculate Lactate Threshold: Complete Guide & Testing Methods | LaChart" />
        <meta name="twitter:description" content="Complete guide to calculate lactate threshold with step-by-step methods: OBLA, Dmax, IAT, log-log. Professional testing protocols for cycling & running." />
        <meta name="twitter:image" content="https://lachart.net/images/lactate-analysis.jpg" />
        <meta name="twitter:site" content="@lachart" />
        <meta name="twitter:creator" content="@lachart" />
        <link rel="alternate" hrefLang="en" href="https://lachart.net/lactate-guide" />
        <link rel="alternate" hrefLang="x-default" href="https://lachart.net/lactate-guide" />
        <script type="application/ld+json">
          {`
            {
              "@context": "https://schema.org",
              "@type": "Article",
              "headline": "How to Calculate Lactate Threshold: Complete Guide & Testing Methods",
              "description": "Complete guide to calculate lactate threshold with step-by-step methods: OBLA, Dmax, IAT, log-log. Professional testing protocols for cycling & running. Free lactate calculator included.",
              "author": {
                "@type": "Organization",
                "name": "LaChart Team",
                "url": "https://lachart.net"
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
              "image": "https://lachart.net/images/lactate-analysis.jpg",
              "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": "https://lachart.net/lactate-guide"
              },
              "datePublished": "2024-01-01",
              "dateModified": "2025-01-23",
              "inLanguage": "en",
              "articleSection": "Sports Science",
              "keywords": "lactate threshold, lactate testing, OBLA, Dmax, IAT, LT1, LT2, cycling, running, triathlon, endurance training, sports science, performance analysis",
              "about": [
                {
                  "@type": "Thing",
                  "name": "Lactate Threshold",
                  "description": "The exercise intensity at which lactate begins to accumulate in the blood"
                },
                {
                  "@type": "Thing", 
                  "name": "Lactate Testing",
                  "description": "Methods for measuring blood lactate levels during exercise"
                },
                {
                  "@type": "Thing",
                  "name": "Endurance Training",
                  "description": "Training methods to improve aerobic and anaerobic capacity"
                }
              ]
            }
          `}
        </script>
      </Helmet>

      {/* Hero with sticky in-page nav */}
      <section className="bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 border-b relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5"></div>
        <div className="max-w-6xl mx-auto px-4 py-10 md:py-14 relative">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-8 items-start">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 leading-tight">
                How to Calculate Lactate Threshold: Complete Guide & Testing Methods
              </h1>
              <p className="mt-4 text-gray-600 max-w-2xl text-lg">
                Professional guide to calculate lactate threshold with step-by-step methods: OBLA, Dmax, IAT, log-log. Complete testing protocols for cycling and running. Free lactate calculator and training zone analysis included.
              </p>
              <motion.div 
                className="mt-6 flex flex-wrap gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <a 
                  href="/lactate-curve-calculator" 
                  onClick={() => {
                    trackGuideInteraction('cta_click', 'try_demo_hero');
                    trackConversionFunnel('demo_start', { source: 'guide_hero' });
                  }}
                  className="inline-flex items-center px-5 py-2.5 rounded-lg bg-primary text-white font-bold shadow-lg hover:bg-primary-dark hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
                >
                  Try Demo
                </a>
                <a 
                  href="/signup" 
                  onClick={() => {
                    trackGuideInteraction('cta_click', 'get_started_hero');
                    trackConversionFunnel('signup_start', { source: 'guide_hero' });
                  }}
                  className="inline-flex items-center px-5 py-2.5 rounded-lg border border-primary text-primary font-bold hover:bg-indigo-50 hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200"
                >
                  Get Started
                </a>
              </motion.div>
            </motion.div>
            <motion.nav 
              className="hidden md:block sticky top-4 self-start"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <div className="bg-white/80 backdrop-blur-sm border rounded-xl shadow-lg p-4 hover:shadow-xl transition-all duration-300">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">On this page</div>
                <ul className="space-y-2 text-sm">
                  <li><a className="text-indigo-700 hover:text-indigo-900 hover:underline transition-colors" href="#what-is-lactate">What is lactate</a></li>
                  <li><a className="text-indigo-700 hover:text-indigo-900 hover:underline transition-colors" href="#lactate-threshold">Lactate threshold (LT1/LTP1, LT2/LTP2)</a></li>
                  <li><a className="text-indigo-700 hover:text-indigo-900 hover:underline transition-colors" href="#zones">How to calculate lactate threshold</a></li>
                  <li><a className="text-indigo-700 hover:text-indigo-900 hover:underline transition-colors" href="#testing">Cycling & running test protocols</a></li>
                  <li><a className="text-indigo-700 hover:text-indigo-900 hover:underline transition-colors" href="#example">Step-by-step calculation example</a></li>
                  <li><a className="text-indigo-700 hover:text-indigo-900 hover:underline transition-colors" href="#faq">FAQ: Common questions</a></li>
                  <li><a className="text-indigo-700 hover:text-indigo-900 hover:underline transition-colors" href="#using-lachart">Free lactate calculator</a></li>
                </ul>
              </div>
            </motion.nav>
          </div>
        </div>
      </section>

      {/* Content sections */}
      <article className="max-w-6xl mx-auto px-4 py-10 bg-gradient-to-b from-white to-gray-50">
        {/* Section: What is lactate */}
        <motion.section 
          id="what-is-lactate" 
          className="grid md:grid-cols-2 gap-10 items-center py-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">What is lactate and why is it important for athletes?</h2>
            <p className="mt-3 text-gray-600">
              Lactate is a normal product of metabolism and a valuable fuel source for athletes. During higher
              exercise intensities, lactate production rises; when it exceeds clearance, it accumulates in the blood.
              This shift marks the critical transition from comfortable aerobic work to challenging
              anaerobic effort, defining your lactate threshold.
            </p>
            <p className="mt-3 text-gray-600">
              Modern research (e.g., Dr. George Brooks) has reframed lactate as a key energy
              shuttle and signaling molecule—not a waste product. Understanding lactate metabolism is essential for optimizing endurance training and performance in cycling, running, and triathlon.
            </p>
          </motion.div>
          <motion.div 
            className="flex justify-center"
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <img src="/images/lactate-analysis.jpg" alt="Lactate concept" className="rounded-2xl shadow-lg w-full max-w-md object-cover hover:shadow-xl transition-all duration-300" />
          </motion.div>
        </motion.section>

        {/* Section: Lactate threshold */}
        <motion.section 
          id="lactate-threshold" 
          className="py-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Lactate threshold (LT1/LTP1, LT2/LTP2) - The key to endurance performance</h2>
          <p className="mt-3 text-gray-600">
            Lactate thresholds are critical anchor points on your lactate–intensity curve that determine your training zones and racing strategy. In practice, we distinguish
            between two key thresholds that every endurance athlete should understand:
          </p>
          <div className="mt-6 grid md:grid-cols-2 gap-6">
            <motion.div 
              className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200 hover:shadow-lg transition-all duration-300"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <h3 className="text-lg font-bold text-blue-900 mb-2 flex items-center">
                🔵 LT1 / LTP1 (Aerobic Threshold)
              </h3>
              <p className="text-gray-700">
                The first breakpoint where lactate begins to rise above baseline. Often proxied near 2 mmol/L,
                but more precisely determined by curve methods. Training below/around LT1 builds aerobic base.
              </p>
            </motion.div>
            <motion.div 
              className="bg-gradient-to-br from-red-50 to-pink-50 p-6 rounded-xl border border-red-200 hover:shadow-lg transition-all duration-300"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <h3 className="text-lg font-bold text-red-900 mb-2 flex items-center">
                🔴 LT2 / LTP2 (Anaerobic Threshold)
              </h3>
              <p className="text-gray-700">
                The upper breakpoint where accumulation accelerates rapidly. Common proxy is 4 mmol/L (OBLA),
                but alternatives include Dmax or IAT. Training at/below LT2 improves sustainable speed.
              </p>
            </motion.div>
          </div>
          <motion.div 
            className="mt-6 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-6 hover:shadow-lg transition-all duration-300"
            whileHover={{ scale: 1.01 }}
            transition={{ duration: 0.2 }}
          >
            <h3 className="font-bold text-indigo-900 text-lg mb-3">⏱️ How long can you be above LT2?</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center p-3 bg-white/50 rounded-lg">
                <div className="text-2xl font-bold text-indigo-600">30–60 min</div>
                <div className="text-sm text-gray-600">Elite athletes</div>
              </div>
              <div className="text-center p-3 bg-white/50 rounded-lg">
                <div className="text-2xl font-bold text-indigo-600">20–40 min</div>
                <div className="text-sm text-gray-600">Trained athletes</div>
              </div>
              <div className="text-center p-3 bg-white/50 rounded-lg">
                <div className="text-2xl font-bold text-indigo-600">10–20 min</div>
                <div className="text-sm text-gray-600">Amateur athletes</div>
              </div>
            </div>
            <p className="mt-4 text-center text-gray-700">The further above LT2 you go, the shorter you can hold it.</p>
          </motion.div>
        </motion.section>

        {/* Section: How to calculate lactate threshold */}
        <motion.section 
          id="zones" 
          className="py-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">How to Calculate Lactate Threshold: 5 Professional Methods</h2>
          <p className="mt-3 text-gray-600">
            After conducting your lactate test, LaChart's advanced algorithms fit your lactate curve and calculate thresholds using multiple professional methods for maximum accuracy:
            <strong> OBLA (4 mmol/L)</strong>, <strong>IAT</strong> (maximal steady state with offset),
            <strong> Dmax</strong> (maximum perpendicular distance between curve and baseline–peak line),
            <strong> log–log</strong> (linear fit in log space), and derivation of <strong>LTP1</strong> and <strong>LTP2</strong>. This multi-method approach ensures reliable results for your training zones.
          </p>
          
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">Step-by-Step Calculation Process</h3>
            <ol className="list-decimal pl-5 space-y-2 text-gray-700">
              <li><strong>Collect test data:</strong> Power/pace, heart rate, and lactate values for each stage</li>
              <li><strong>Plot the curve:</strong> Create lactate vs. intensity graph</li>
              <li><strong>Apply calculation methods:</strong> OBLA, Dmax, IAT, log-log analysis</li>
              <li><strong>Determine LT1/LTP1:</strong> First significant rise above baseline</li>
              <li><strong>Determine LT2/LTP2:</strong> Point of rapid lactate accumulation</li>
              <li><strong>Calculate training zones:</strong> Divide intensity range into 5 zones</li>
            </ol>
          </div>
          <div className="mt-4 grid md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900">Zone 1–2 (below LT1/LTP1)</h3>
              <p className="text-gray-600 text-sm mt-1">Aerobic capacity, recovery, long volume training.</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900">Zone 3–4 (around LT2/LTP2)</h3>
              <p className="text-gray-600 text-sm mt-1">Tempo/Threshold – sustainable speed development.</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900">Zone 5+ (above LT2)</h3>
              <p className="text-gray-600 text-sm mt-1">Short, intense intervals – VO2max, economy.</p>
            </div>
          </div>
        </motion.section>


        {/* Section: Testing protocols */}
        <motion.section 
          id="testing" 
          className="py-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Testing protocols</h2>
            
            {/* Laboratory test images */}
            <div className="mt-8 grid md:grid-cols-2 gap-6">
              <motion.div 
                className="relative group"
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <img 
                  src="/images/lactate-test1.jpeg" 
                  alt="Laboratory lactate testing setup with athlete on bike" 
                  className="rounded-xl shadow-lg w-full object-cover hover:shadow-xl transition-all duration-300"
                />
                <div className="absolute inset-0 bg-black/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">Laboratory Testing Setup</span>
                </div>
              </motion.div>
              <motion.div 
                className="relative group"
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <img 
                  src="/images/lactate-test2.jpeg" 
                  alt="Athlete wearing respiratory mask during lactate test" 
                  className="rounded-xl shadow-lg w-full object-cover hover:shadow-xl transition-all duration-300"
                />
                <div className="absolute inset-0 bg-black/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">VO2 & Lactate Analysis</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
          <div className="mt-3 grid md:grid-cols-2 gap-6">
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900">Cycling – graded ramp</h3>
              <ul className="text-gray-600 text-sm mt-1 list-disc pl-5 space-y-1">
                <li>Start at 100–150 W, increase by 25–30 W every 3–4 minutes.</li>
                <li>At the end of each stage, take a blood sample (finger prick), record power (W), heart rate (HR), and lactate (La).</li>
                <li>Continue until near race pace or until exhaustion.</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900">Running – track/treadmill</h3>
              <ul className="text-gray-600 text-sm mt-1 list-disc pl-5 space-y-1">
                <li>Start at easy pace, increase speed every 3–4 minutes (e.g., +0.5 km/h).</li>
                <li>Take lactate sample at the end of each stage, record pace/speed, HR, and La.</li>
                <li>Stop when approaching race pace or at high fatigue.</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 bg-gray-50 border rounded-xl p-4">
            <h3 className="font-semibold text-gray-900">Norwegian method</h3>
            <p className="text-gray-600 text-sm mt-1">Training around thresholds (typically 2–3 mmol/L and ~4 mmol/L) with precise intensity control based on lactate; goal is high volume of quality work without overreaching.</p>
          </div>
        </motion.section>

        {/* Section: Step-by-step calculation example */}
        <section id="example" className="py-8">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Step-by-Step Calculation Example</h2>
          <p className="mt-3 text-gray-600">Real cycling test data: 150 W (La 1.2), 180 W (1.5), 210 W (2.0), 240 W (2.6), 270 W (3.4), 300 W (4.6).</p>
          
          <div className="mt-6 grid md:grid-cols-2 gap-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">Calculation Results</h3>
              <ul className="text-gray-700 space-y-2">
                <li><strong>LTP1 (LT1):</strong> ~210 W (La ~2.0) via curve shape/log-log</li>
                <li><strong>LTP2 (LT2):</strong> ~285-300 W (Dmax/OBLA ~4 mmol/L)</li>
                <li><strong>Training Zones (automatically generated):</strong></li>
                <li className="ml-4">• <strong>Zone 1:</strong> 70–90% LT1 (147–189 W) – Recovery, reference wide zone</li>
                <li className="ml-4">• <strong>Zone 2:</strong> 90–100% LT1 (189–210 W) – Aerobic base building</li>
                <li className="ml-4">• <strong>Zone 3:</strong> 100% LT1 – 95% LT2 (210–271 W) – Tempo, sweet spot</li>
                <li className="ml-4">• <strong>Zone 4:</strong> 96–104% LT2 (274–312 W) – Threshold, high aerobic</li>
                <li className="ml-4">• <strong>Zone 5:</strong> 105–120% LT2 (299–360 W) – VO2max+, sprint intervals</li>
              </ul>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-3">How LaChart Calculates</h3>
              <ol className="text-gray-700 space-y-1 text-sm">
                <li>1. Fits polynomial curve to your data points</li>
                <li>2. Applies all 5 calculation methods simultaneously</li>
                <li>3. Cross-validates results for accuracy</li>
                <li>4. Generates training zones for cycling & running</li>
                <li>5. Provides confidence intervals for each threshold</li>
              </ol>
            </div>
          </div>
        </section>

        {/* Section: FAQ (same style as SupportPage) */}
        <motion.section 
          id="faq" 
          className="py-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">FAQ: Common Lactate Threshold Questions</h2>
          <div className="mt-6">
            {faqItems.map((item, index) => (
              <FAQItem
                key={index}
                question={item.question}
                answer={item.answer}
                isOpen={openFaq.has(index)}
                onClick={() => toggleFaq(index)}
              />
            ))}
          </div>
        </motion.section>

        {/* Section: Training to raise LT */}
        <section className="py-8">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">How to raise your lactate threshold</h2>
          <ul className="mt-3 text-gray-700 list-disc pl-5 space-y-1">
            <li><strong>Threshold intervals</strong>: sustained efforts at or slightly above LT.</li>
            <li><strong>HIIT</strong>: short, hard repeats with measured recovery.</li>
            <li><strong>Steady-state</strong>: longer work near LT for durability.</li>
            <li><strong>Long easy</strong>: genuine low intensity to grow the aerobic base.</li>
          </ul>
        </section>

        {/* Section: Free lactate calculator */}
        <motion.section 
          id="using-lachart" 
          className="py-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Free Lactate Threshold Calculator</h2>
            <p className="mt-3 text-gray-600">Calculate your lactate threshold instantly with our free online calculator. No registration required for basic calculations.</p>
            
            {/* LaChart application screenshot */}
            <div className="mt-8">
              <motion.div 
                className="relative group"
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <img 
                  src="/images/lachart1.png" 
                  alt="LaChart application showing lactate curve analysis and calculated thresholds" 
                  className="rounded-xl shadow-lg w-full object-cover hover:shadow-xl transition-all duration-300"
                />
                <div className="absolute inset-0 bg-black/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">LaChart Analysis Dashboard</span>
                </div>
              </motion.div>
            </div>
            
            <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 hover:shadow-lg transition-all duration-300">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">How to Use the Calculator</h3>
              <ol className="list-decimal pl-5 text-gray-700 space-y-2">
                <li><strong>Enter test data:</strong> Input power/pace, heart rate, and lactate values for each stage</li>
                <li><strong>Automatic calculation:</strong> LaChart applies all 5 methods (OBLA, Dmax, IAT, log-log, LTP1/LTP2)</li>
                <li><strong>Get results:</strong> Receive precise thresholds and training zones for cycling and running</li>
                <li><strong>Track progress:</strong> Save results to compare changes over time (requires free account)</li>
              </ol>
            </div>
          </motion.div>
          
          <motion.div 
            className="mt-6 flex flex-wrap gap-3"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <a 
              href="/lactate-curve-calculator" 
              onClick={() => {
                trackGuideInteraction('cta_click', 'try_calculator_bottom');
                trackConversionFunnel('demo_start', { source: 'guide_bottom' });
              }}
              className="inline-flex items-center px-6 py-3 rounded-lg bg-primary text-white font-bold shadow-lg hover:bg-primary-dark hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
            >
              🧮 Try Free Calculator
            </a>
            <a 
              href="/signup" 
              onClick={() => {
                trackGuideInteraction('cta_click', 'create_account_bottom');
                trackConversionFunnel('signup_start', { source: 'guide_bottom' });
              }}
              className="inline-flex items-center px-6 py-3 rounded-lg border border-primary text-primary font-bold hover:bg-indigo-50 hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200"
            >
              📊 Create Free Account
            </a>
          </motion.div>
        </motion.section>

        {/* Section: Useful links (Demo & Menu) */}
        <motion.section 
          id="links" 
          className="py-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Useful links</h2>
          <p className="mt-3 text-gray-600">Jump straight into a demo and explore the app layout with the left navigation menu.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/lactate-curve-calculator" className="inline-flex items-center px-6 py-3 rounded-lg bg-primary text-white font-bold shadow hover:bg-primary-dark transition">
              🚀 Open Demo Test (TestingWithoutLogin)
            </a>
            <a href="/lactate-curve-calculator" className="inline-flex items-center px-6 py-3 rounded-lg border border-gray-300 text-gray-800 font-bold hover:bg-gray-50 transition">
              🧭 See App Menu (Menu component)
            </a>
          </div>
        </motion.section>
      </article>
      </main>

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
                  <a href="mailto:jakub.stadnik01@gmail.com" className="ml-2 text-gray-600 hover:text-primary">
                    jakub.stadnik01@gmail.com
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-200 pt-8 text-center">
            <p className="text-base text-gray-400">
              &copy; {new Date().getFullYear()} LaChart. All rights reserved.
            </p>
          </div>
        </div>
      </motion.footer>
    </div>
  );
};

export default LactateGuide;


