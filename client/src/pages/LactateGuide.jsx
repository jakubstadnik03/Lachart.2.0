import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

const LactateGuide = () => {
  // FAQ state and item toggling (match SupportPage behavior)
  const [openFaq, setOpenFaq] = useState(new Set([0]));
  const toggleFaq = (index) => {
    const updated = new Set(openFaq);
    if (updated.has(index)) updated.delete(index); else updated.add(index);
    setOpenFaq(updated);
  };

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
    <main className="min-h-screen bg-white">
      <Helmet>
        <title>How to Calculate Lactate Threshold: Complete Guide & Testing Methods | LaChart</title>
        <link rel="canonical" href="https://lachart.net/lactate-guide" />
        <meta
          name="description"
          content="Learn how to calculate lactate threshold with step-by-step methods: OBLA, Dmax, IAT, log-log. Complete testing protocols for cycling & running. Free lactate calculator included."
        />
        <meta
          name="keywords"
          content="how to calculate lactate threshold, lactate threshold calculation, lactate testing methods, OBLA calculation, Dmax method, IAT threshold, lactate zones, cycling lactate test, running lactate test, lactate threshold training, LT1 LT2 calculation, anaerobic threshold test"
        />
        <meta property="og:title" content="How to Calculate Lactate Threshold: Complete Guide & Testing Methods | LaChart" />
        <meta property="og:description" content="Step-by-step guide to calculate lactate threshold using OBLA, Dmax, IAT methods. Free testing protocols for cyclists and runners." />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://lachart.net/lactate-guide" />
        <meta property="og:image" content="/images/lactate-analysis.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">
          {`
            {
              "@context": "https://schema.org",
              "@type": "Article",
              "headline": "Mastering Lactate Threshold Training",
              "author": {
                "@type": "Person",
                "name": "LaChart Editorial"
              },
              "publisher": {
                "@type": "Organization",
                "name": "LaChart"
              },
              "image": "/images/lactate-analysis.jpg",
              "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": "https://lachart.net/lactate-guide"
              },
              "description": "Comprehensive guide to lactate, lactate threshold, testing protocols, and training methods to improve performance."
            }
          `}
        </script>
      </Helmet>

      {/* Hero with sticky in-page nav */}
      <header className="bg-gradient-to-br from-indigo-50 via-blue-50 to-purple-50 border-b relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5"></div>
        <div className="max-w-6xl mx-auto px-4 py-10 md:py-14 relative">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-8 items-start">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-3xl md:text-5xl font-extrabold text-gray-900 leading-tight">
                How to Calculate Lactate Threshold: Complete Guide
              </h1>
              <p className="mt-4 text-gray-600 max-w-2xl text-lg">
                Learn step-by-step methods to calculate lactate threshold (LT1, LT2) using OBLA, Dmax, IAT, and log-log methods. 
                Complete testing protocols for cycling and running with free calculator.
              </p>
              <motion.div 
                className="mt-6 flex flex-wrap gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <a href="/testing-without-login" className="inline-flex items-center px-5 py-2.5 rounded-lg bg-primary text-white font-bold shadow-lg hover:bg-primary-dark hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200">
                  🧮 Try Demo
                </a>
                <a href="/signup" className="inline-flex items-center px-5 py-2.5 rounded-lg border border-primary text-primary font-bold hover:bg-indigo-50 hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200">
                  📊 Get Started
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
      </header>

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
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">What is lactate?</h2>
            <p className="mt-3 text-gray-600">
              Lactate is a normal product of metabolism and a valuable fuel. During higher
              intensities, production rises; when it exceeds clearance, it accumulates.
              This shift marks the transition from comfortable aerobic work to challenging
              anaerobic effort.
            </p>
            <p className="mt-3 text-gray-600">
              Modern research (e.g., Dr. George Brooks) reframed lactate as a key energy
              shuttle and signaling molecule—not a waste product.
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
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">Lactate threshold (LT1/LTP1, LT2/LTP2)</h2>
          <p className="mt-3 text-gray-600">
            Lactate thresholds are anchor points on your lactate–intensity curve. In practice, we distinguish
            between two key thresholds:
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
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">How to Calculate Lactate Threshold: 5 Methods</h2>
          <p className="mt-3 text-gray-600">
            After testing, LaChart fits your lactate curve and calculates thresholds using multiple methods for higher accuracy:
            <strong> OBLA (4 mmol/L)</strong>, <strong>IAT</strong> (maximal steady state with offset),
            <strong> Dmax</strong> (maximum perpendicular distance between curve and baseline–peak line),
            <strong> log–log</strong> (linear fit in log space), and derivation of <strong>LTP1</strong> and <strong>LTP2</strong>.
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
              <h3 className="font-semibold text-gray-900">Zone 1–2 (pod LT1/LTP1)</h3>
              <p className="text-gray-600 text-sm mt-1">Aerobní kapacita, regenerace, dlouhé objemy.</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900">Zone 3–4 (kolem LT2/LTP2)</h3>
              <p className="text-gray-600 text-sm mt-1">Tempo/Threshold – rozvoj udržitelné rychlosti.</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900">Zone 5+ (nad LT2)</h3>
              <p className="text-gray-600 text-sm mt-1">Krátké, intenzivní úseky – VO2max, ekonomika.</p>
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
                <li>Start 100–150 W, zvyšujte o 25–30 W každé 3–4 min.</li>
                <li>Na konci každého stupně odeberte kapku krve (u prstu), zaznamenejte W, HR, La.</li>
                <li>Pokračujte do blízkosti závodního tempa nebo do odmítnutí.</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg">
              <h3 className="font-semibold text-gray-900">Running – track/treadmill</h3>
              <ul className="text-gray-600 text-sm mt-1 list-disc pl-5 space-y-1">
                <li>Start v lehkém tempu, zvyšujte rychlost každé 3–4 min (např. +0.5 km/h).</li>
                <li>Odběr laktátu na konci stupně, zaznamenejte pace/speed, HR, La.</li>
                <li>Ukončete, když se přiblížíte závodnímu tempu nebo při vysoké únavě.</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 bg-gray-50 border rounded-xl p-4">
            <h3 className="font-semibold text-gray-900">Norwegian method</h3>
            <p className="text-gray-600 text-sm mt-1">Práce okolo prahů (často 2–3 mmol/L a ~4 mmol/L) s přesným řízením intenzit dle laktátu; cílem je vysoký objem kvalitní práce bez přestřelení.</p>
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
                <li><strong>Training Zones:</strong></li>
                <li className="ml-4">• Zone 1-2: &lt;210 W (aerobic base)</li>
                <li className="ml-4">• Zone 3-4: 210-285 W (threshold)</li>
                <li className="ml-4">• Zone 5+: &gt;285 W (VO2max)</li>
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
            <a href="/testing-without-login" className="inline-flex items-center px-6 py-3 rounded-lg bg-primary text-white font-bold shadow-lg hover:bg-primary-dark hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200">
              🧮 Try Free Calculator
            </a>
            <a href="/signup" className="inline-flex items-center px-6 py-3 rounded-lg border border-primary text-primary font-bold hover:bg-indigo-50 hover:shadow-md transform hover:-translate-y-0.5 transition-all duration-200">
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
            <a href="/testing-without-login" className="inline-flex items-center px-6 py-3 rounded-lg bg-primary text-white font-bold shadow hover:bg-primary-dark transition">
              🚀 Open Demo Test (TestingWithoutLogin)
            </a>
            <a href="/testing-without-login" className="inline-flex items-center px-6 py-3 rounded-lg border border-gray-300 text-gray-800 font-bold hover:bg-gray-50 transition">
              🧭 See App Menu (Menu component)
            </a>
          </div>
        </motion.section>
      </article>
    </main>
  );
};

export default LactateGuide;


