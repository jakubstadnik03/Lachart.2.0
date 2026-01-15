import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Menu from '../components/Menu';
import Header from '../components/Header/Header';
import Footer from '../components/Footer';
import { useNotification } from '../context/NotificationContext';

const TssCalculatorPage = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [np, setNp] = useState('');
  const [ftp, setFtp] = useState('');

  const h = parseFloat(hours || '0');
  const m = parseFloat(minutes || '0');
  const npVal = parseFloat(np || '0');
  const ftpVal = parseFloat(ftp || '0');
  const durationHours = Math.max(0, h) + Math.max(0, m) / 60;

  let tss: number | null = null;
  let ifVal: number | null = null;
  if (durationHours > 0 && npVal > 0 && ftpVal > 0) {
    ifVal = npVal / ftpVal;
    tss = Math.round(durationHours * ifVal * ifVal * 100);
  }

  const handleCopySummary = () => {
    if (!tss || !ifVal) {
      addNotification('Please fill in duration, NP and FTP first', 'warning');
      return;
    }
    const text = `Duration: ${durationHours.toFixed(2)} h | NP: ${npVal} W | FTP: ${ftpVal} W | IF: ${ifVal.toFixed(
      2
    )} | TSS: ${tss}`;
    try {
      navigator.clipboard.writeText(text);
      addNotification('TSS summary copied to clipboard', 'success');
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
        <title>TSS Calculator | Training Stress Score from NP, FTP and Duration</title>
        <link rel="canonical" href="https://lachart.net/tss-calculator" />
        <meta
          name="description"
          content="Free TSS calculator for cyclists and triathletes. Estimate Training Stress Score from Normalized Power, FTP and ride duration to understand how hard your workout was."
        />
        <meta
          name="keywords"
          content="TSS calculator, training stress score, NP, normalized power, cycling TSS, training load, CTL, ATL, endurance training"
        />
        <meta property="og:title" content="TSS Calculator – Training Stress Score from NP and FTP" />
        <meta
          property="og:description"
          content="Estimate Training Stress Score (TSS) from duration, Normalized Power and FTP to quantify how big a workout was."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://lachart.net/tss-calculator" />
        <meta property="og:image" content="https://lachart.net/og-tss-calculator.png" />
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
            <section className="bg-gradient-to-r from-sky-50 via-white to-violet-50 rounded-3xl border border-sky-100 shadow-sm px-4 sm:px-8 py-10 relative overflow-hidden">
              <div className="absolute -right-20 -top-16 w-64 h-64 bg-sky-200/40 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
                  TSS Calculator
                </h1>
                <p className="text-lg sm:text-xl text-gray-700 max-w-3xl mb-4">
                  Estimate **Training Stress Score (TSS)** from ride duration, Normalized Power and FTP. Understand how hard your
                  workout really was.
                </p>
                <p className="text-sm sm:text-base text-gray-600 max-w-3xl">
                  TSS is a cornerstone of modern endurance planning – it feeds into CTL/ATL charts and helps balance fitness and
                  fatigue. LaChart calculates TSS automatically from your rides and runs and combines it with lactate testing and
                  weekly load insights.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/signup')}
                    className="px-5 py-2.5 rounded-full bg-primary text-white text-sm font-semibold shadow hover:bg-primary-dark transition-colors"
                  >
                    Sign up for free to track TSS over time
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard')}
                    className="px-5 py-2.5 rounded-full bg-white/80 border border-gray-200 text-sm font-medium text-gray-800 hover:bg-white shadow-sm transition-colors"
                  >
                    See TSS on LaChart dashboard →
                  </button>
                </div>
              </div>
            </section>

            {/* Calculator + education */}
            <section className="grid lg:grid-cols-2 gap-6 items-start">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6"
              >
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">Calculate TSS</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Fill in your ride duration, Normalized Power (NP) and FTP. We&apos;ll compute intensity factor and TSS using
                  the classic Coggan formula.
                </p>

                <div className="grid sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Duration – hours</label>
                    <input
                      type="number"
                      min="0"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Duration – minutes</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Normalized Power (NP, W)</label>
                    <input
                      type="number"
                      min="0"
                      value={np}
                      onChange={(e) => setNp(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="e.g. 240"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">FTP (W)</label>
                    <input
                      type="number"
                      min="0"
                      value={ftp}
                      onChange={(e) => setFtp(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="e.g. 260"
                    />
                  </div>
                </div>

                <div className="mt-5 grid sm:grid-cols-3 gap-4">
                  <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Intensity Factor (IF)</div>
                    <div className="text-2xl font-bold text-sky-700">
                      {ifVal && Number.isFinite(ifVal) ? ifVal.toFixed(2) : '—'}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">NP / FTP</p>
                  </div>
                  <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">TSS</div>
                    <div className="text-2xl font-bold text-primary">{tss !== null ? tss : '—'}</div>
                    <p className="text-xs text-gray-500 mt-1">duration[h] × IF² × 100</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 flex items-center">
                    100 TSS ≈ one hour at FTP. 50–75 TSS is a moderate ride, 150+ TSS is a very demanding session that impacts
                    fatigue for several days.
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="px-4 py-2 text-xs sm:text-sm rounded-lg bg-gray-900 text-white hover:bg-black transition-colors"
                  >
                    Copy TSS summary
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHours('1');
                      setMinutes('0');
                      setNp('');
                      setFtp('');
                    }}
                    className="px-4 py-2 text-xs sm:text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 text-sm sm:text-base text-gray-700"
              >
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                    What is Training Stress Score?
                  </h2>
                  <p className="mb-2">
                    Training Stress Score (TSS) is a way to **quantify how much work** you did in a session, taking both
                    intensity and duration into account. Two short, hard intervals can end up with similar TSS as one longer,
                    easier ride.
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-gray-700">
                    <li>~50 TSS – recovery / easy endurance.</li>
                    <li>75–100 TSS – solid tempo / threshold workout.</li>
                    <li>150+ TSS – long or very hard session, higher recovery cost.</li>
                  </ul>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                    Go beyond single‑ride TSS with LaChart
                  </h3>
                  <p className="mb-2">
                    In LaChart, TSS from every workout feeds into **weekly load, CTL/ATL style metrics and training status** on
                    your dashboard. Combined with lactate tests and power/pace trends you can see exactly when you&apos;re
                    building fitness vs accumulating fatigue.
                  </p>
                  <p className="mb-3">
                    Coaches get athlete overviews, automatic weekly reports and exportable PDFs with key metrics.
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

export default TssCalculatorPage;

