import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Menu from '../components/Menu';
import Header from '../components/Header/Header';
import Footer from '../components/Footer';
import { useNotification } from '../context/NotificationContext';

const FtpCalculatorPage = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [best20MinPower, setBest20MinPower] = useState('');
  const [weight, setWeight] = useState('');

  const p20 = parseFloat(best20MinPower || '0');
  const w = parseFloat(weight || '0');
  const ftp = p20 > 0 ? Math.round(p20 * 0.95) : null;
  const wkg = ftp && w > 0 ? (ftp / w).toFixed(2) : null;

  const handleCopySummary = () => {
    if (!ftp) {
      addNotification('Please enter your best 20-minute power first', 'warning');
      return;
    }
    const parts = [`Best 20-min power: ${p20} W`, `Estimated FTP: ${ftp} W`];
    if (wkg && w > 0) {
      parts.push(`Power-to-weight: ${wkg} W/kg (weight ${w} kg)`);
    }
    const text = parts.join(' | ');
    try {
      navigator.clipboard.writeText(text);
      addNotification('FTP summary copied to clipboard', 'success');
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
        <title>FTP Calculator | Functional Threshold Power from 20-minute Test</title>
        <link rel="canonical" href="https://lachart.net/ftp-calculator" />
        <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1" />
        <meta
          name="description"
          content="Free FTP calculator for cyclists and triathletes. Estimate your Functional Threshold Power (FTP) from a 20-minute test and get power-to-weight in W/kg."
        />
        <meta
          name="keywords"
          content="FTP calculator, functional threshold power, cycling FTP, W/kg, power to weight, 20-minute test, cycling training zones"
        />
        <meta property="og:title" content="FTP Calculator – Functional Threshold Power from 20-minute Test" />
        <meta
          property="og:description"
          content="Estimate your FTP and power to weight (W/kg) from a simple 20-minute all-out test. Perfect for cyclists and triathletes."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://lachart.net/ftp-calculator" />
        <meta property="og:image" content="https://lachart.net/og-ftp-calculator.png" />
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
              {/* Background orbs */}
              <div className="absolute -right-24 -top-20 w-80 h-80 bg-orange-200/30 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -left-16 bottom-0 w-60 h-60 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col lg:flex-row gap-8 items-start lg:items-center">
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-[11px] sm:text-xs font-semibold text-orange-700 mb-4">
                    ⚡ Cycling & Triathlon
                  </div>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
                    <span className="text-gray-900">FTP </span>
                    <span className="bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">Calculator</span>
                  </h1>
                  <p className="text-base sm:text-lg text-gray-600 max-w-2xl mb-6">
                    Estimate your Functional Threshold Power from a single 20‑minute all‑out effort and see your
                    power‑to‑weight ratio in W/kg. Perfect for cyclists and triathletes.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/signup')}
                      className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-pink-500 shadow-sm hover:shadow-md hover:opacity-90 transition-all"
                    >
                      Track FTP over time – free
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/lactate-curve-calculator')}
                      className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      Lactate-based thresholds →
                    </button>
                  </div>
                </div>
                {/* Quick stats */}
                <div className="grid grid-cols-2 gap-3 lg:w-64 flex-shrink-0">
                  {[
                    { label: 'Cat 4/5 men', value: '2.5–3.2 W/kg', color: 'bg-gray-50 border-gray-200' },
                    { label: 'Cat 3 men', value: '3.2–3.8 W/kg', color: 'bg-blue-50 border-blue-100' },
                    { label: 'Cat 1/2 men', value: '4.0–5.0 W/kg', color: 'bg-primary/5 border-primary/20' },
                    { label: 'Pro level', value: '5.0+ W/kg', color: 'bg-orange-50 border-orange-100' },
                  ].map(s => (
                    <div key={s.label} className={`rounded-xl border p-3 ${s.color}`}>
                      <div className="text-[10px] text-gray-500 mb-0.5">{s.label}</div>
                      <div className="text-sm font-bold text-gray-800">{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Calculator + education */}
            <section className="grid lg:grid-cols-5 gap-6 items-start">
              {/* Calculator — wider */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-7"
              >
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Estimate your FTP</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Ride 20 minutes as hard as you can sustain evenly and enter your average power below.
                </p>

                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Best 20‑min average power (W)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={best20MinPower}
                      onChange={(e) => setBest20MinPower(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                      placeholder="e.g. 280"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Body weight (kg) <span className="font-normal text-gray-400">– optional, for W/kg</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                      placeholder="e.g. 72"
                    />
                  </div>
                </div>

                {/* Results */}
                <div className="grid sm:grid-cols-3 gap-4 mb-6">
                  <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-pink-50 border border-orange-100 p-4">
                    <div className="text-[11px] font-semibold text-orange-500 uppercase tracking-wider mb-2">Estimated FTP</div>
                    <div className="text-3xl font-extrabold text-gray-900">{ftp ? `${ftp}` : '—'}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{ftp ? 'watts' : 'enter power above'}</div>
                    <p className="text-[11px] text-gray-400 mt-2">95% of 20-min power</p>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-100 p-4">
                    <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-2">Power-to-weight</div>
                    <div className="text-3xl font-extrabold text-gray-900">{wkg ? wkg : '—'}</div>
                    <div className="text-sm text-gray-500 mt-0.5">{wkg ? 'W/kg' : 'add weight above'}</div>
                    <p className="text-[11px] text-gray-400 mt-2">key for climbing & races</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-200 p-4 flex flex-col justify-center">
                    <p className="text-xs text-gray-500 leading-relaxed">
                      FTP is a rule‑of‑thumb estimate. For precise zones and race pacing, combine it with lactate testing in LaChart.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="px-4 py-2 text-xs sm:text-sm rounded-xl bg-gray-900 text-white hover:bg-black transition-colors"
                  >
                    Copy summary
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBest20MinPower('');
                      setWeight('');
                    }}
                    className="px-4 py-2 text-xs sm:text-sm rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </motion.div>

              {/* Education — narrower */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="lg:col-span-2 space-y-4"
              >
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center mb-3">
                    <span className="text-lg">🚴</span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-2">
                    How to run a 20‑min FTP test
                  </h2>
                  <ol className="list-decimal pl-4 space-y-1.5 text-sm text-gray-600">
                    <li>Warm up for 15–20 min including a few short efforts near threshold.</li>
                    <li>Ride 20 minutes as hard as you can sustain evenly — avoid sprinting at the start.</li>
                    <li>Record average power from your power meter or smart trainer.</li>
                    <li>Enter the value above — we estimate FTP as 95% of this figure.</li>
                  </ol>
                  <p className="text-xs text-gray-400 mt-3">
                    Tip: repeat on the same course/setup for comparable results.
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <span className="text-lg">📈</span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">
                    Track FTP + lactate together in LaChart
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Store FTP tests, lactate curves and daily workouts in one place. LaChart shows how LT1/LT2, FTP and
                    real‑world performance evolve across the season.
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

export default FtpCalculatorPage;
