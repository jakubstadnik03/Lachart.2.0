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
          <div className="max-w-[1200px] mx-auto space-y-10">
            {/* Hero */}
            <section className="bg-white rounded-3xl shadow-sm border border-gray-100 px-4 sm:px-8 py-8 sm:py-10 relative overflow-hidden">
              <div className="absolute inset-x-0 -top-24 h-40 bg-gradient-to-r from-primary/20 via-emerald-200/20 to-sky-300/20 blur-3xl pointer-events-none" />
              <div className="relative flex flex-col lg:flex-row gap-6 lg:gap-10">
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] sm:text-xs font-semibold text-primary mb-3">
                    Power • Pace • Heart rate
                  </div>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight mb-3">
                    Training Zones Calculator
                  </h1>
                  <p className="text-sm sm:text-base text-gray-600 max-w-2xl mb-4">
                    Estimate your day‑to‑day training zones from three simple anchors: FTP (or LT2), threshold running pace and
                    threshold heart rate. Use it as a starting point before you build a full lactate profile in LaChart.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/signup')}
                      className="inline-flex items-center justify-center px-4 sm:px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-primary to-pink-500 shadow-sm hover:shadow-md hover:from-primary/90 hover:to-pink-500/90 transition-all"
                    >
                      Save zones & tests – sign up for free
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/lactate-curve-calculator')}
                      className="inline-flex items-center justify-center px-4 sm:px-5 py-2.5 rounded-xl text-sm font-medium text-gray-800 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      Generate lactate-based zones →
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Calculators grid */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Bike power zones */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 sm:p-5"
              >
                <h2 className="text-sm sm:text-base font-semibold text-gray-900 mb-2">
                  Bike power zones (from FTP)
                </h2>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">FTP / LT2 (W)</label>
                  <input
                    type="number"
                    min="0"
                    value={ftp}
                    onChange={(e) => setFtp(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="e.g. 260"
                  />
                </div>
                {(() => {
                  const v = parseFloat(ftp || '0');
                  if (!v || v <= 0) {
                    return <p className="text-xs text-gray-500">Enter FTP to see approximate Z1–Z5 power ranges.</p>;
                  }
                  const zones = [
                    { label: 'Z1 Endurance', lo: 0.55, hi: 0.75 },
                    { label: 'Z2 Tempo', lo: 0.76, hi: 0.9 },
                    { label: 'Z3 Threshold', lo: 0.91, hi: 1.05 },
                    { label: 'Z4 VO2', lo: 1.06, hi: 1.2 },
                    { label: 'Z5 Anaerobic', lo: 1.21, hi: 1.5 },
                  ];
                  return (
                    <div className="mt-2 space-y-1.5 text-xs text-gray-700">
                      {zones.map((z) => (
                        <div key={z.label} className="flex items-center justify-between">
                          <span className="mr-2">{z.label}</span>
                          <span className="font-semibold text-gray-900">
                            {Math.round(v * z.lo)}–{Math.round(v * z.hi)} W
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </motion.div>

              {/* Run pace zones */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 sm:p-5"
              >
                <h2 className="text-sm sm:text-base font-semibold text-gray-900 mb-2">Run pace zones (per km)</h2>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Threshold pace (mm:ss / km)
                  </label>
                  <input
                    type="text"
                    value={thresholdPace}
                    onChange={(e) => setThresholdPace(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="e.g. 4:00"
                  />
                </div>
                {(() => {
                  const thr = parsePaceToSeconds(thresholdPace || '');
                  if (!thr) {
                    return (
                      <p className="text-xs text-gray-500">
                        Enter threshold pace to see easy / steady / threshold / interval pace bands.
                      </p>
                    );
                  }
                  const zones = [
                    { label: 'Z1 Easy', lo: thr + 60, hi: thr + 90 },
                    { label: 'Z2 Steady', lo: thr + 30, hi: thr + 60 },
                    { label: 'Z3 Threshold', lo: thr - 10, hi: thr + 10 },
                    { label: 'Z4 Interval', lo: thr - 20, hi: thr - 5 },
                    { label: 'Z5 Repetition', lo: thr - 40, hi: thr - 25 },
                  ];
                  return (
                    <div className="mt-2 space-y-1.5 text-xs text-gray-700">
                      {zones.map((z) => (
                        <div key={z.label} className="flex items-center justify-between">
                          <span className="mr-2">{z.label}</span>
                          <span className="font-semibold text-gray-900">
                            {formatPaceFromSeconds(z.lo)}–{formatPaceFromSeconds(z.hi)} /km
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </motion.div>

              {/* Heart rate zones */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-gray-100 bg-gray-50/80 p-4 sm:p-5"
              >
                <h2 className="text-sm sm:text-base font-semibold text-gray-900 mb-2">
                  Heart rate zones (from threshold HR)
                </h2>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Threshold HR (bpm)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={thresholdHr}
                    onChange={(e) => setThresholdHr(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="e.g. 170"
                  />
                </div>
                {(() => {
                  const thr = parseFloat(thresholdHr || '0');
                  if (!thr || thr <= 0) {
                    return (
                      <p className="text-xs text-gray-500">
                        Enter threshold HR to see approximate Z1–Z5 heart rate ranges.
                      </p>
                    );
                  }
                  const zones = [
                    { label: 'Z1 Recovery', lo: 0.65, hi: 0.78 },
                    { label: 'Z2 Endurance', lo: 0.79, hi: 0.88 },
                    { label: 'Z3 Tempo', lo: 0.89, hi: 0.94 },
                    { label: 'Z4 Threshold', lo: 0.95, hi: 1.02 },
                    { label: 'Z5 VO2max', lo: 1.03, hi: 1.10 },
                  ];
                  return (
                    <div className="mt-2 space-y-1.5 text-xs text-gray-700">
                      {zones.map((z) => (
                        <div key={z.label} className="flex items-center justify-between">
                          <span className="mr-2">{z.label}</span>
                          <span className="font-semibold text-gray-900">
                            {Math.round(thr * z.lo)}–{Math.round(thr * z.hi)} bpm
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </motion.div>
            </section>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default TrainingZonesCalculatorPage;

