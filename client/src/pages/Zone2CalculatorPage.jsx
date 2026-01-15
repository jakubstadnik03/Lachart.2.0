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
          <div className="max-w-[1200px] mx-auto space-y-10">
            {/* Hero / SEO copy */}
            <section className="bg-gradient-to-r from-emerald-50 via-white to-sky-50 rounded-3xl border border-emerald-100 shadow-sm px-4 sm:px-8 py-10 relative overflow-hidden">
              <div className="absolute -right-20 -top-16 w-64 h-64 bg-emerald-200/40 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
                  Zone 2 Calculator
                </h1>
                <p className="text-lg sm:text-xl text-gray-700 max-w-3xl mb-4">
                  Find your **easy endurance** range in seconds. Enter your FTP or threshold heart rate and we&apos;ll estimate
                  practical Zone 2 power and heart rate bands for your daily training.
                </p>
                <p className="text-sm sm:text-base text-gray-600 max-w-3xl">
                  Zone 2 is the foundation of aerobic fitness – long, conversational sessions that build mitochondria and
                  durability without excessive fatigue. Use this free calculator as a starting point, and refine your zones with
                  proper lactate testing inside LaChart.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/signup')}
                    className="px-5 py-2.5 rounded-full bg-primary text-white text-sm font-semibold shadow hover:bg-primary-dark transition-colors"
                  >
                    Sign up for free to save your zones
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/lactate-curve-calculator')}
                    className="px-5 py-2.5 rounded-full bg-white/80 border border-gray-200 text-sm font-medium text-gray-800 hover:bg-white shadow-sm transition-colors"
                  >
                    Calculate lactate-based zones →
                  </button>
                </div>
              </div>
            </section>

            {/* Calculator */}
            <section className="grid lg:grid-cols-2 gap-6 items-start">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6"
              >
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">Estimate your Zone 2</h2>
                <p className="text-sm text-gray-600 mb-4">
                  You can use power, heart rate, or both. The more accurate your FTP/threshold HR, the better the estimate.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      FTP / LT2 (watts) <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={ftpInput}
                      onChange={(e) => setFtpInput(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="e.g. 260"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Threshold heart rate (bpm) <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={hrThresholdInput}
                      onChange={(e) => setHrThresholdInput(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="e.g. 170"
                    />
                  </div>
                </div>

                <div className="mt-5 grid sm:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Zone 2 power (approx.)</div>
                    <div className="text-2xl font-bold text-emerald-700">
                      {ftp && z2LowW && z2HighW ? `${z2LowW}–${z2HighW} W` : '—'}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">≈55–75 % of FTP.</p>
                  </div>
                  <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Zone 2 heart rate (approx.)</div>
                    <div className="text-2xl font-bold text-sky-700">
                      {thrHr && z2LowHr && z2HighHr ? `${z2LowHr}–${z2HighHr} bpm` : '—'}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">≈76–86 % of threshold HR.</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="px-4 py-2 text-xs sm:text-sm rounded-lg bg-gray-900 text-white hover:bg-black transition-colors"
                  >
                    Copy Zone 2 summary
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFtpInput('');
                      setHrThresholdInput('');
                    }}
                    className="px-4 py-2 text-xs sm:text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </motion.div>

              {/* Education / SEO text */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 text-sm sm:text-base text-gray-700"
              >
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                    Why Zone 2 training works
                  </h2>
                  <p className="mb-2">
                    Zone 2 is a low‑intensity endurance zone, usually just below your first lactate threshold. You should be
                    able to speak full sentences, breathe mostly through the nose, and finish the session feeling pleasantly
                    tired – not smashed.
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-gray-700">
                    <li>builds aerobic engine and mitochondrial density,</li>
                    <li>improves fat oxidation and efficiency,</li>
                    <li>allows high weekly volume without burning out,</li>
                    <li>pairs perfectly with 1–2 hard sessions per week.</li>
                  </ul>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                    Make Zone 2 truly personal with LaChart
                  </h3>
                  <p className="mb-2">
                    This calculator gives **generic percentage ranges**. In LaChart, we use your real lactate tests and daily
                    training data (power, pace, HR) to calculate LT1/LT2, track fatigue and automatically adjust training zones
                    over time.
                  </p>
                  <p className="mb-3">
                    Coaches can store multiple athletes, attach lactate to intervals and send professional test reports with one
                    click.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/about')}
                    className="px-4 py-2 text-xs sm:text-sm rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
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

