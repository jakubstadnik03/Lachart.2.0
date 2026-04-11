import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Menu from '../components/Menu';
import Header from '../components/Header/Header';
import Footer from '../components/Footer';

const TrainingZonesCalculatorPage = () => {
  const navigate = useNavigate();
  const [ftp, setFtp] = useState('');
  const [thresholdPace, setThresholdPace] = useState('');
  const [thresholdHr, setThresholdHr] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const demoUser = {
    name: '',
    surname: '',
    email: '',
    role: '',
    sport: '',
    avatar: ''
  };

  const parsePaceToSeconds = (value) => {
    if (!value || typeof value !== 'string' || !value.includes(':')) return null;
    const [m, s] = value.split(':').map(Number);
    if (Number.isNaN(m) || Number.isNaN(s)) return null;
    return m * 60 + s;
  };

  const formatPaceFromSeconds = (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const powerZones = [
    { label: 'Z1 Endurance', lo: 0.55, hi: 0.75, color: 'bg-sky-100 border-sky-200 text-sky-700' },
    { label: 'Z2 Tempo',     lo: 0.76, hi: 0.90, color: 'bg-emerald-100 border-emerald-200 text-emerald-700' },
    { label: 'Z3 Threshold', lo: 0.91, hi: 1.05, color: 'bg-amber-100 border-amber-200 text-amber-700' },
    { label: 'Z4 VO2',       lo: 1.06, hi: 1.20, color: 'bg-orange-100 border-orange-200 text-orange-700' },
    { label: 'Z5 Anaerobic', lo: 1.21, hi: 1.50, color: 'bg-red-100 border-red-200 text-red-700' },
  ];

  const hrZones = [
    { label: 'Z1 Recovery',  lo: 0.65, hi: 0.78, color: 'bg-sky-100 border-sky-200 text-sky-700' },
    { label: 'Z2 Endurance', lo: 0.79, hi: 0.88, color: 'bg-emerald-100 border-emerald-200 text-emerald-700' },
    { label: 'Z3 Tempo',     lo: 0.89, hi: 0.94, color: 'bg-amber-100 border-amber-200 text-amber-700' },
    { label: 'Z4 Threshold', lo: 0.95, hi: 1.02, color: 'bg-orange-100 border-orange-200 text-orange-700' },
    { label: 'Z5 VO2max',    lo: 1.03, hi: 1.10, color: 'bg-red-100 border-red-200 text-red-700' },
  ];

  const paceZones = (thr) => [
    { label: 'Z1 Easy',       lo: thr + 60, hi: thr + 90, color: 'bg-sky-100 border-sky-200 text-sky-700' },
    { label: 'Z2 Steady',     lo: thr + 30, hi: thr + 60, color: 'bg-emerald-100 border-emerald-200 text-emerald-700' },
    { label: 'Z3 Threshold',  lo: thr - 10, hi: thr + 10, color: 'bg-amber-100 border-amber-200 text-amber-700' },
    { label: 'Z4 Interval',   lo: thr - 20, hi: thr - 5,  color: 'bg-orange-100 border-orange-200 text-orange-700' },
    { label: 'Z5 Repetition', lo: thr - 40, hi: thr - 25, color: 'bg-red-100 border-red-200 text-red-700' },
  ];

  const ftpVal = parseFloat(ftp || '0');
  const thrPaceSec = parsePaceToSeconds(thresholdPace || '');
  const hrVal = parseFloat(thresholdHr || '0');

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-x-hidden w-full relative">
      <Helmet>
        <title>Training Zones Calculator | Power, Pace &amp; Heart Rate Zones</title>
        <link rel="canonical" href="https://lachart.net/training-zones-calculator" />
        <meta
          name="description"
          content="Free training zones calculator for cyclists and runners. Estimate power zones from FTP, running pace zones from threshold pace, and heart rate zones from threshold HR."
        />
        <meta
          name="keywords"
          content="training zones calculator, power zones, pace zones, heart rate zones, FTP zones, running pace zones, cycling training zones"
        />
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
              <div className="absolute -right-24 -top-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute left-1/3 bottom-0 w-60 h-60 bg-emerald-200/20 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] sm:text-xs font-semibold text-primary mb-4">
                  🏃 Power • Pace • Heart Rate
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
                  <span className="text-gray-900">Training </span>
                  <span className="bg-gradient-to-r from-primary to-pink-500 bg-clip-text text-transparent">Zones Calculator</span>
                </h1>
                <p className="text-base sm:text-lg text-gray-600 max-w-2xl mb-6">
                  Estimate your day‑to‑day training zones from three simple anchors: FTP (or LT2), threshold running
                  pace and threshold heart rate. Enter any or all of them below.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/signup')}
                    className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-primary to-pink-500 shadow-sm hover:shadow-md hover:opacity-90 transition-all"
                  >
                    Save zones & tests – sign up for free
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/lactate-curve-calculator')}
                    className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                  >
                    Generate lactate-based zones →
                  </button>
                </div>
              </div>
            </section>

            {/* Calculators grid */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* Bike power zones */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6"
              >
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-base flex-shrink-0">
                    ⚡
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 leading-tight">Bike Power Zones</h2>
                    <p className="text-[11px] text-gray-400">from FTP / LT2</p>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">FTP / LT2 (W)</label>
                  <input
                    type="number"
                    min="0"
                    value={ftp}
                    onChange={(e) => setFtp(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 transition-all"
                    placeholder="e.g. 260"
                  />
                </div>
                {ftpVal > 0 ? (
                  <div className="space-y-1.5">
                    {powerZones.map((z) => (
                      <div key={z.label} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${z.color}`}>
                        <span className="text-xs font-medium">{z.label}</span>
                        <span className="text-xs font-bold">{Math.round(ftpVal * z.lo)}–{Math.round(ftpVal * z.hi)} W</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-center">
                    <p className="text-xs text-gray-400">Enter FTP to see Z1–Z5 power ranges</p>
                  </div>
                )}
              </motion.div>

              {/* Run pace zones */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6"
              >
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-base flex-shrink-0">
                    🏃
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 leading-tight">Run Pace Zones</h2>
                    <p className="text-[11px] text-gray-400">per kilometre</p>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Threshold pace (mm:ss /km)</label>
                  <input
                    type="text"
                    value={thresholdPace}
                    onChange={(e) => setThresholdPace(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300/50 focus:border-emerald-300 transition-all"
                    placeholder="e.g. 4:00"
                  />
                </div>
                {thrPaceSec ? (
                  <div className="space-y-1.5">
                    {paceZones(thrPaceSec).map((z) => (
                      <div key={z.label} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${z.color}`}>
                        <span className="text-xs font-medium">{z.label}</span>
                        <span className="text-xs font-bold">{formatPaceFromSeconds(z.lo)}–{formatPaceFromSeconds(z.hi)} /km</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-center">
                    <p className="text-xs text-gray-400">Enter threshold pace to see easy / threshold / interval bands</p>
                  </div>
                )}
              </motion.div>

              {/* Heart rate zones */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6"
              >
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-base flex-shrink-0">
                    ❤️
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 leading-tight">Heart Rate Zones</h2>
                    <p className="text-[11px] text-gray-400">from threshold HR</p>
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Threshold HR (bpm)</label>
                  <input
                    type="number"
                    min="0"
                    value={thresholdHr}
                    onChange={(e) => setThresholdHr(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-300/50 focus:border-red-300 transition-all"
                    placeholder="e.g. 170"
                  />
                </div>
                {hrVal > 0 ? (
                  <div className="space-y-1.5">
                    {hrZones.map((z) => (
                      <div key={z.label} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${z.color}`}>
                        <span className="text-xs font-medium">{z.label}</span>
                        <span className="text-xs font-bold">{Math.round(hrVal * z.lo)}–{Math.round(hrVal * z.hi)} bpm</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-center">
                    <p className="text-xs text-gray-400">Enter threshold HR to see Z1–Z5 heart rate ranges</p>
                  </div>
                )}
              </motion.div>
            </section>

            {/* Bottom CTA strip */}
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-1">Want zones based on real lactate data?</h3>
                <p className="text-sm text-gray-500">
                  These ranges are estimates. LaChart calculates your personal LT1 and LT2 from actual lab or field
                  lactate tests and updates your zones automatically.
                </p>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => navigate('/lactate-curve-calculator')}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors shadow-sm whitespace-nowrap"
                >
                  Try lactate calculator
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/signup')}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Sign up free
                </button>
              </div>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default TrainingZonesCalculatorPage;
