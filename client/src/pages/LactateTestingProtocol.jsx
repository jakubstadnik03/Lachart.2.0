import React from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';

const LactateTestingProtocol = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-pink-50">
      <Helmet>
        <title>Lactate Testing Protocol: Complete Guide for Cycling & Running | LaChart</title>
        <link rel="canonical" href="https://lachart.net/lactate-testing-protocol" />
        <meta
          name="description"
          content="Complete lactate testing protocol guide for cycling and running. Step-by-step instructions, equipment needed, and professional testing procedures for accurate lactate threshold determination."
        />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
      </Helmet>

      {/* Hero */}
      <header className="relative mx-auto max-w-6xl px-4 pt-12 pb-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl"
        >
          <div className="absolute -top-10 -right-10 w-60 h-60 rounded-full bg-primary/10 blur-2xl" />
          <div className="absolute -bottom-10 -left-10 w-72 h-72 rounded-full bg-pink-300/10 blur-3xl" />

          <div className="relative px-6 py-10 md:px-12 md:py-14">
            <div className="flex items-center gap-3 mb-4 text-primary">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                <path d="M3 12h3l3 8 4-16 3 8h4"/>
              </svg>
              <span className="text-sm font-semibold tracking-wide">Protocol Guide</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight">
              Lactate Testing Protocol
            </h1>
            <p className="mt-4 text-lg md:text-xl text-gray-700 max-w-3xl">
              Professional, field‑tested procedures for accurate lactate threshold determination (LT1, LT2) across cycling and running.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="px-3 py-1 rounded-full text-sm bg-white/70 border border-white/50 text-gray-700">Cycling</span>
              <span className="px-3 py-1 rounded-full text-sm bg-white/70 border border-white/50 text-gray-700">Running</span>
              <span className="px-3 py-1 rounded-full text-sm bg-white/70 border border-white/50 text-gray-700">Coach‑ready</span>
            </div>
          </div>
        </motion.div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 space-y-8">
        {/* Equipment */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl"
        >
          <div className="px-6 py-6 md:px-10 md:py-8">
            <div className="flex items-center gap-2 mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              <h2 className="text-2xl font-bold text-gray-900">Required Equipment</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl p-5 bg-indigo-50/60 border border-indigo-100">
                <h3 className="text-lg font-semibold text-indigo-900 mb-3">Essential</h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• Lactate analyzer, lancets, test strips</li>
                  <li>• Heart rate monitor</li>
                  <li>• Power meter (cycling) or GPS watch (running)</li>
                  <li>• Stopwatch/timer</li>
                  <li>• Data recording sheet</li>
                </ul>
              </div>
              <div className="rounded-2xl p-5 bg-pink-50/60 border border-pink-100">
                <h3 className="text-lg font-semibold text-pink-900 mb-3">Optional</h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• Treadmill / Stationary bike</li>
                  <li>• VO2 analyzer</li>
                  <li>• Environmental monitors</li>
                  <li>• Video recording equipment</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Protocol Steps */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl"
        >
          <div className="px-6 py-6 md:px-10 md:py-8 space-y-6">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l4 8H8l4-8z"/>
                <path d="M2 22h20l-10-6-10 6z"/>
              </svg>
              <h2 className="text-2xl font-bold text-gray-900">Step‑by‑Step Protocol</h2>
            </div>

            {/* Pre‑Test */}
            <div className="rounded-2xl p-5 bg-white/70 border border-white/50">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Pre‑Test Preparation</h3>
              <ol className="list-decimal pl-5 space-y-2 text-gray-700">
                <li>Rested athlete (no intense training 24–48h prior)</li>
                <li>Consistent nutrition and hydration</li>
                <li>Calibrate power meter and HR monitor</li>
                <li>Controlled environment (temp/humidity)</li>
                <li>Prepared data sheets</li>
              </ol>
            </div>

            {/* Cycling */}
            <div className="rounded-2xl p-5 bg-white/70 border border-white/50">
              <div className="flex items-center gap-2 mb-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="5.5" cy="17.5" r="3.5"/>
                  <circle cx="18.5" cy="17.5" r="3.5"/>
                  <path d="M5.5 17.5L9 7h6l3.5 10.5"/>
                </svg>
                <h3 className="text-xl font-semibold text-gray-900">Cycling Protocol</h3>
              </div>
              <ol className="list-decimal pl-5 space-y-2 text-gray-700">
                <li>Warm‑up 10′ at 100–150W</li>
                <li>Start 150W, +25–30W every 3–4′</li>
                <li>Blood sample end of each stage</li>
                <li>Record power, HR, lactate</li>
                <li>Stop near race pace / volitional exhaustion</li>
                <li>Cool‑down 5′</li>
              </ol>
            </div>

            {/* Running */}
            <div className="rounded-2xl p-5 bg-white/70 border border-white/50">
              <div className="flex items-center gap-2 mb-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 5l2 2 3-3"/>
                  <path d="M9 7l-4 9"/>
                  <path d="M16 13l-3 6"/>
                </svg>
                <h3 className="text-xl font-semibold text-gray-900">Running Protocol</h3>
              </div>
              <ol className="list-decimal pl-5 space-y-2 text-gray-700">
                <li>Warm‑up 10′ easy</li>
                <li>Start comfortable pace, +0.5 km/h every 3–4′</li>
                <li>Blood sample end of each stage</li>
                <li>Record pace, HR, lactate</li>
                <li>Stop near race pace / volitional exhaustion</li>
                <li>Cool‑down 5′</li>
              </ol>
            </div>
          </div>
        </motion.section>

        {/* Best Practices */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="bg-white/60 backdrop-blur-lg rounded-3xl border border-white/30 shadow-xl"
        >
          <div className="px-6 py-6 md:px-10 md:py-8">
            <div className="flex items-center gap-2 mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z"/>
              </svg>
              <h2 className="text-2xl font-bold text-gray-900">Best Practices</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl p-5 bg-yellow-50/60 border border-yellow-100">
                <h3 className="text-lg font-semibold text-yellow-900 mb-3">Testing Conditions</h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• Consistent time of day</li>
                  <li>• Temp 18–22°C, low airflow</li>
                  <li>• Quiet environment</li>
                  <li>• Same equipment each session</li>
                </ul>
              </div>
              <div className="rounded-2xl p-5 bg-violet-50/60 border border-violet-100">
                <h3 className="text-lg font-semibold text-violet-900 mb-3">Data Collection</h3>
                <ul className="space-y-2 text-gray-700">
                  <li>• Record immediately after each stage</li>
                  <li>• Consistent sampling technique</li>
                  <li>• Same site (finger/ear) each time</li>
                  <li>• Record environment conditions</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.section>

        {/* CTA */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden bg-primary text-white rounded-3xl shadow-xl border border-primary/30"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/10" />
          <div className="relative px-6 py-8 md:px-10 md:py-10 text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to Start Your Lactate Testing?</h2>
            <p className="text-lg text-white/90 mb-6">Use our free online lactate calculator to analyze your test results and determine your training zones.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <a
                href="/lactate-curve-calculator"
                className="inline-flex items-center px-6 py-3 rounded-lg bg-white text-primary font-bold shadow-lg hover:bg-gray-100 transition"
              >
                Try Free Calculator
              </a>
              <a
                href="/lactate-guide"
                className="inline-flex items-center px-6 py-3 rounded-lg border border-white text-white font-bold hover:bg-white hover:text-primary transition"
              >
                Read Complete Guide
              </a>
            </div>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer className="py-10">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-400 text-sm">
          © {new Date().getFullYear()} LaChart. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default LactateTestingProtocol;
