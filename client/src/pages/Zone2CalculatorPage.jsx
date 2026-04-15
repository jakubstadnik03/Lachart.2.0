import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import Menu from '../components/Menu';
import Header from '../components/Header/Header';
import Footer from '../components/Footer';
import { motion } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';

const Zone2CalculatorPage = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [ftpInput, setFtpInput] = useState('');
  const [hrThresholdInput, setHrThresholdInput] = useState('');

  const ftp = parseFloat(ftpInput || '0');
  const thrHr = parseFloat(hrThresholdInput || '0');

  const z2LowW = ftp ? Math.round(ftp * 0.55) : null;
  const z2HighW = ftp ? Math.round(ftp * 0.75) : null;
  const z2LowHr = thrHr ? Math.round(thrHr * 0.76) : null;
  const z2HighHr = thrHr ? Math.round(thrHr * 0.86) : null;

  const handleCopySummary = () => {
    if (!ftp && !thrHr) {
      addNotification('Please fill at least FTP or threshold HR first', 'warning');
      return;
    }
    const parts = [];
    if (ftp && z2LowW && z2HighW) {
      parts.push(`Zone 2 power: ${z2LowW}–${z2HighW} W (≈55–75 % of FTP ${ftp} W)`);
    }
    if (thrHr && z2LowHr && z2HighHr) {
      parts.push(`Zone 2 HR: ${z2LowHr}–${z2HighHr} bpm (≈76–86 % of threshold HR ${thrHr} bpm)`);
    }
    const text = parts.join(' | ');
    try {
      navigator.clipboard.writeText(text);
      addNotification('Zone 2 summary copied to clipboard', 'success');
    } catch {
      addNotification('Unable to copy to clipboard on this device', 'warning');
    }
  };

  const demoUser = {
    name: '',
    surname: '',
    email: '',
    role: '',
    sport: '',
    avatar: ''
  };

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-x-hidden w-full relative">
      <Helmet>
        <title>Zone 2 Calculator | Heart Rate &amp; Power Ranges for Endurance Training</title>
        <link rel="canonical" href="https://lachart.net/zone2-calculator" />
        <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1" />
        <meta
          name="description"
          content="Free Zone 2 calculator for runners and cyclists. Estimate Zone 2 heart rate and power from FTP or threshold HR and learn how to use Zone 2 training in your endurance plan."
        />
        <meta
          name="keywords"
          content="zone 2 calculator, zone 2 heart rate, zone 2 power, endurance training zones, running, cycling, FTP, threshold heart rate"
        />
        <meta property="og:title" content="Zone 2 Calculator – Heart Rate & Power for Endurance Training" />
        <meta
          property="og:description"
          content="Calculate your Zone 2 heart rate and power ranges from FTP or threshold HR. Perfect for endurance athletes and coaches."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://lachart.net/zone2-calculator" />
        <meta property="og:image" content="https://lachart.net/og-zone2-calculator.png" />
      </Helmet>

      {/* Left menu */}
      <div className="menu-container hidden md:block fixed top-0 left-0 h-screen overflow-y-auto z-40">
        <Menu isMenuOpen={true} setIsMenuOpen={() => {}} user={demoUser} token="" />
      </div>

      {/* Mobile menu */}
      <div className="menu-container md:hidden fixed top-0 left-0 h-screen overflow-y-auto z-40">
        <Menu isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} user={demoUser} token="" />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen w-full overflow-x-hidden md:ml-64">
        <Header isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} user={demoUser} />

        <main className="flex-1 px-4 py-8 pt-16 md:pt-8">
          <div className="max-w-[1200px] mx-auto space-y-8">

            {/* Hero */}
            <section className="relative bg-white rounded-3xl border border-gray-100 shadow-sm px-4 sm:px-8 py-10 overflow-hidden">
              <div className="absolute -right-24 -top-20 w-80 h-80 bg-emerald-200/30 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -left-16 bottom-0 w-60 h-60 bg-sky-200/20 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col lg:flex-row gap-8 items-start lg:items-center">
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] sm:text-xs font-semibold text-emerald-700 mb-4">
                    🌿 Aerobic Base Building
                  </div>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
                    <span className="text-gray-900">Zone 2 </span>
                    <span className="bg-gradient-to-r from-emerald-500 to-sky-500 bg-clip-text text-transparent">Calculator</span>
                  </h1>
                  <p className="text-base sm:text-lg text-gray-600 max-w-2xl mb-6">
                    Find your easy endurance range in seconds. Enter your FTP or threshold heart rate to get practical
                    Zone 2 power and heart rate bands for long aerobic sessions.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/signup')}
                      className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-sky-500 shadow-sm hover:shadow-md hover:opacity-90 transition-all"
                    >
                      Save your zones – free
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/lactate-curve-calculator')}
                      className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      Lactate-based zones →
                    </button>
                  </div>
                </div>
                {/* Zone 2 benefits card */}
                <div className="lg:w-64 flex-shrink-0 w-full">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                    <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-3">Why Zone 2 matters</div>
                    <div className="space-y-2">
                      {[
                        'Builds mitochondrial density',
                        'Improves fat oxidation',
                        'Enables high weekly volume',
                        'Low fatigue, high adaptation',
                      ].map(b => (
                        <div key={b} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                          <span className="text-xs text-emerald-900">{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Calculator + education */}
            <section className="grid lg:grid-cols-5 gap-6 items-start">
              {/* Calculator */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-7"
              >
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Estimate your Zone 2</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Enter FTP, threshold HR, or both. The more accurate your inputs, the better the estimate.
                </p>

                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      FTP / LT2 (watts)
                      <span className="ml-1 font-normal text-gray-400">– optional</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={ftpInput}
                      onChange={(e) => setFtpInput(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
                      placeholder="e.g. 260"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Threshold heart rate (bpm)
                      <span className="ml-1 font-normal text-gray-400">– optional</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={hrThresholdInput}
                      onChange={(e) => setHrThresholdInput(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-all"
                      placeholder="e.g. 170"
                    />
                  </div>
                </div>

                {/* Results */}
                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-5">
                    <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider mb-2">Zone 2 Power</div>
                    <div className="text-3xl font-extrabold text-gray-900">
                      {ftp && z2LowW && z2HighW ? `${z2LowW}–${z2HighW}` : '—'}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">{ftp && z2LowW ? 'watts' : 'enter FTP above'}</div>
                    <p className="text-[11px] text-gray-400 mt-2">≈ 55–75% of FTP</p>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-100 p-5">
                    <div className="text-[11px] font-semibold text-sky-600 uppercase tracking-wider mb-2">Zone 2 Heart Rate</div>
                    <div className="text-3xl font-extrabold text-gray-900">
                      {thrHr && z2LowHr && z2HighHr ? `${z2LowHr}–${z2HighHr}` : '—'}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">{thrHr && z2LowHr ? 'bpm' : 'enter threshold HR above'}</div>
                    <p className="text-[11px] text-gray-400 mt-2">≈ 76–86% of threshold HR</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="px-4 py-2 text-xs sm:text-sm rounded-xl bg-gray-900 text-white hover:bg-black transition-colors"
                  >
                    Copy Zone 2 summary
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFtpInput(''); setHrThresholdInput(''); }}
                    className="px-4 py-2 text-xs sm:text-sm rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </motion.div>

              {/* Education */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="lg:col-span-2 space-y-4"
              >
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center mb-3">
                    <span className="text-lg">🌿</span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-2">
                    Why Zone 2 training works
                  </h2>
                  <p className="text-sm text-gray-600 mb-3">
                    Zone 2 is just below your first lactate threshold. You should be able to speak full sentences,
                    breathe through the nose, and finish pleasantly tired – not smashed.
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-600">
                    {[
                      'Builds aerobic engine and mitochondrial density',
                      'Improves fat oxidation and metabolic efficiency',
                      'Allows high weekly volume without excessive fatigue',
                      'Pairs perfectly with 1–2 hard sessions per week',
                    ].map(item => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <span className="text-lg">🧪</span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">
                    Make Zone 2 truly personal with LaChart
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    This calculator gives generic percentage ranges. In LaChart, your real lactate tests and daily
                    training data pinpoint LT1/LT2 precisely, and zones update automatically as your fitness changes.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/about')}
                    className="inline-flex items-center px-4 py-2 text-xs sm:text-sm rounded-xl bg-primary text-white hover:bg-primary-dark transition-colors"
                  >
                    Learn more about LaChart →
                  </button>
                </div>
              </motion.div>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default Zone2CalculatorPage;
