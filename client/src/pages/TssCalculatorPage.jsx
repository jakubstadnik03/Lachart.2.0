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

  let tss = null;
  let ifVal = null;
  if (durationHours > 0 && npVal > 0 && ftpVal > 0) {
    ifVal = npVal / ftpVal;
    tss = Math.round(durationHours * ifVal * ifVal * 100);
  }

  // Intensity classification
  const getZoneLabel = () => {
    if (!tss) return null;
    if (tss < 50) return { label: 'Recovery', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' };
    if (tss < 100) return { label: 'Moderate', color: 'text-sky-600', bg: 'bg-sky-50 border-sky-200' };
    if (tss < 150) return { label: 'High', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' };
    return { label: 'Very demanding', color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
  };
  const zone = getZoneLabel();

  const handleCopySummary = () => {
    if (!tss || !ifVal) {
      addNotification('Please fill in duration, NP and FTP first', 'warning');
      return;
    }
    const text = `Duration: ${durationHours.toFixed(2)} h | NP: ${npVal} W | FTP: ${ftpVal} W | IF: ${ifVal.toFixed(2)} | TSS: ${tss}`;
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
          <div className="max-w-[1200px] mx-auto space-y-8">

            {/* Hero */}
            <section className="relative bg-white rounded-3xl border border-gray-100 shadow-sm px-4 sm:px-8 py-10 overflow-hidden">
              <div className="absolute -right-24 -top-20 w-80 h-80 bg-sky-200/30 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -left-16 bottom-0 w-60 h-60 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col lg:flex-row gap-8 items-start lg:items-center">
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-[11px] sm:text-xs font-semibold text-sky-700 mb-4">
                    📊 Training Load Quantification
                  </div>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
                    <span className="text-gray-900">TSS </span>
                    <span className="bg-gradient-to-r from-sky-500 to-violet-500 bg-clip-text text-transparent">Calculator</span>
                  </h1>
                  <p className="text-base sm:text-lg text-gray-600 max-w-2xl mb-6">
                    Estimate Training Stress Score from ride duration, Normalized Power and FTP. Understand how demanding
                    your workout really was, and plan your recovery accordingly.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/signup')}
                      className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-violet-500 shadow-sm hover:shadow-md hover:opacity-90 transition-all"
                    >
                      Track TSS over time – free
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      LaChart dashboard →
                    </button>
                  </div>
                </div>
                {/* TSS reference scale */}
                <div className="lg:w-64 flex-shrink-0 w-full">
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">TSS Reference Scale</div>
                    {[
                      { range: '< 50', label: 'Recovery/Easy', color: 'bg-emerald-400' },
                      { range: '50–100', label: 'Moderate workout', color: 'bg-sky-400' },
                      { range: '100–150', label: 'Hard / demanding', color: 'bg-amber-400' },
                      { range: '150+', label: 'Very hard / epic', color: 'bg-red-400' },
                    ].map(s => (
                      <div key={s.range} className="flex items-center gap-2.5">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.color}`} />
                        <span className="text-xs text-gray-700 font-medium w-16">{s.range}</span>
                        <span className="text-xs text-gray-500">{s.label}</span>
                      </div>
                    ))}
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
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Calculate TSS</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Fill in duration, Normalized Power and FTP. We use the classic Coggan formula: TSS = (duration in h × IF² × 100).
                </p>

                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Duration – hours</label>
                    <input
                      type="number"
                      min="0"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Duration – minutes</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Normalized Power – NP (W)</label>
                    <input
                      type="number"
                      min="0"
                      value={np}
                      onChange={(e) => setNp(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                      placeholder="e.g. 240"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">FTP (W)</label>
                    <input
                      type="number"
                      min="0"
                      value={ftp}
                      onChange={(e) => setFtp(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                      placeholder="e.g. 260"
                    />
                  </div>
                </div>

                {/* Results */}
                <div className="grid sm:grid-cols-3 gap-4 mb-6 mt-2">
                  <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-violet-50 border border-sky-100 p-4">
                    <div className="text-[11px] font-semibold text-sky-600 uppercase tracking-wider mb-2">Intensity Factor (IF)</div>
                    <div className="text-3xl font-extrabold text-gray-900">
                      {ifVal && Number.isFinite(ifVal) ? ifVal.toFixed(2) : '—'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">NP ÷ FTP</div>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-primary/5 to-purple-50 border border-primary/20 p-4">
                    <div className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-2">TSS</div>
                    <div className="text-3xl font-extrabold text-gray-900">{tss !== null ? tss : '—'}</div>
                    <div className="text-xs text-gray-500 mt-1">training stress score</div>
                  </div>
                  <div className={`rounded-2xl border p-4 flex flex-col justify-center ${zone ? zone.bg : 'bg-gray-50 border-gray-200'}`}>
                    {zone ? (
                      <>
                        <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Session rating</div>
                        <div className={`text-lg font-bold ${zone.color}`}>{zone.label}</div>
                        <div className="text-xs text-gray-400 mt-1">based on TSS</div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Fill in all fields to see session rating.</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="px-4 py-2 text-xs sm:text-sm rounded-xl bg-gray-900 text-white hover:bg-black transition-colors"
                  >
                    Copy TSS summary
                  </button>
                  <button
                    type="button"
                    onClick={() => { setHours('1'); setMinutes('0'); setNp(''); setFtp(''); }}
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
                  <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center mb-3">
                    <span className="text-lg">📊</span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-2">
                    What is Training Stress Score?
                  </h2>
                  <p className="text-sm text-gray-600 mb-3">
                    TSS quantifies how much training stress you accumulated, taking both intensity and duration into account.
                    Two short, hard intervals can equal a longer, easier ride.
                  </p>
                  <ul className="space-y-1.5 text-sm text-gray-600">
                    {[
                      '~50 TSS – recovery or easy endurance',
                      '75–100 TSS – solid tempo / threshold workout',
                      '150+ TSS – long or very demanding day',
                    ].map(item => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <span className="text-lg">📈</span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">
                    Beyond single‑ride TSS with LaChart
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    In LaChart, TSS from every workout feeds into weekly load, CTL/ATL metrics and training status.
                    Combined with lactate tests you see exactly when you're building fitness vs accumulating fatigue.
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

export default TssCalculatorPage;
