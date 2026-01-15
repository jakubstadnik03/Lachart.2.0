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
          <div className="max-w-[1200px] mx-auto space-y-10">
            {/* Hero / SEO copy */}
            <section className="bg-gradient-to-r from-orange-50 via-white to-pink-50 rounded-3xl border border-orange-100 shadow-sm px-4 sm:px-8 py-10 relative overflow-hidden">
              <div className="absolute -right-20 -top-16 w-64 h-64 bg-orange-200/40 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
                  FTP Calculator
                </h1>
                <p className="text-lg sm:text-xl text-gray-700 max-w-3xl mb-4">
                  Quickly estimate your **Functional Threshold Power (FTP)** from a single 20‑minute all‑out effort and see your
                  power‑to‑weight ratio in W/kg.
                </p>
                <p className="text-sm sm:text-base text-gray-600 max-w-3xl">
                  FTP is a popular metric in cycling and triathlon, but it&apos;s still just an estimate. LaChart goes further by
                  combining FTP with **lactate testing, training load and heart rate** to give you a complete picture of fitness,
                  fatigue and form.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/signup')}
                    className="px-5 py-2.5 rounded-full bg-primary text-white text-sm font-semibold shadow hover:bg-primary-dark transition-colors"
                  >
                    Sign up for free to track FTP over time
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/lactate-curve-calculator')}
                    className="px-5 py-2.5 rounded-full bg-white/80 border border-gray-200 text-sm font-medium text-gray-800 hover:bg-white shadow-sm transition-colors"
                  >
                    Generate lactate-based thresholds →
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
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">Estimate your FTP</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Perform a **20‑minute maximal test** and enter your average power below. We&apos;ll estimate 60‑minute FTP and
                  power‑to‑weight. Use a smart trainer, power meter or consistent indoor setup for best results.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Best 20‑minute average power (W)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={best20MinPower}
                      onChange={(e) => setBest20MinPower(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="e.g. 280"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Weight (kg) <span className="text-gray-400">(optional, for W/kg)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="e.g. 72"
                    />
                  </div>
                </div>

                <div className="mt-5 grid sm:grid-cols-3 gap-4">
                  <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Estimated FTP</div>
                    <div className="text-2xl font-bold text-primary">{ftp ? `${ftp} W` : '—'}</div>
                    <p className="text-xs text-gray-500 mt-1">≈95 % z 20‑minutového výkonu.</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Power‑to‑weight</div>
                    <div className="text-2xl font-bold text-amber-700">{wkg ? `${wkg} W/kg` : '—'}</div>
                    <p className="text-xs text-gray-500 mt-1">Skvělý quick‑check pro lezení a výkon v kopcích.</p>
                  </div>
                  <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-xs text-gray-600 flex items-center">
                    This FTP is a **rule‑of‑thumb estimate**. For precise training zones and race pacing, combine it with
                    lactate testing and daily training data in LaChart.
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="px-4 py-2 text-xs sm:text-sm rounded-lg bg-gray-900 text-white hover:bg-black transition-colors"
                  >
                    Copy FTP summary
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBest20MinPower('');
                      setWeight('');
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
                    How to perform a 20‑minute FTP test
                  </h2>
                  <ol className="list-decimal pl-5 space-y-1 text-gray-700 mb-2">
                    <li>Warm up for 15–20 minutes with a few short efforts close to threshold.</li>
                    <li>Ride 20 minutes **as hard as you can sustain evenly** – avoid sprinting at the start.</li>
                    <li>Use your power meter or smart trainer to record average power for the 20 minutes.</li>
                    <li>Enter that value above. We estimate FTP as 95 % of this 20‑minute power.</li>
                  </ol>
                  <p className="text-xs text-gray-500">
                    Tip: repeat the test on similar terrain & conditions (indoor vs outdoor) to compare like‑for‑like.
                  </p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                    Track FTP and lactate thresholds in LaChart
                  </h3>
                  <p className="mb-2">
                    LaChart lets you **store FTP tests, lactate tests and daily workouts** in one place. We calculate training
                    load (TSS), form, fitness and fatigue, and generate exportable reports for athletes and coaches.
                  </p>
                  <p className="mb-3">
                    Instead of a single FTP number, you get a full picture: how your LT1/LT2, FTP and real‑world performance
                    evolve across the season.
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

export default FtpCalculatorPage;

