import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Menu from '../components/Menu';
import Header from '../components/Header/Header';
import Footer from '../components/Footer';
import { useNotification } from '../context/NotificationContext';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert "MM:SS" or "H:MM:SS" pace string to decimal minutes/km */
function parsePace(str) {
  if (!str) return null;
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] + parts[1] / 60; // MM:SS
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60; // H:MM:SS (very slow pace)
  return null;
}

/** Format total seconds to H:MM:SS or MM:SS */
function formatTime(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '—';
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Format pace in min/km → MM:SS/km string */
function formatPace(minPerKm) {
  if (!minPerKm || minPerKm <= 0) return '—';
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

// ─── Running predictions ──────────────────────────────────────────────────────

const RUNNING_DISTANCES = [
  { label: '1 500 m', km: 1.5 },
  { label: '5 km', km: 5 },
  { label: '10 km', km: 10 },
  { label: 'Half Marathon', km: 21.0975 },
  { label: 'Marathon', km: 42.195 },
];

/**
 * Riegel: t2 = t1 × (d2/d1)^1.06
 * Reference: 10 km at LT2 pace
 */
function predictRunning(lt2PaceMinKm, lt1PaceMinKm) {
  if (!lt2PaceMinKm || lt2PaceMinKm <= 0) return null;

  const refDistKm = 10;
  const refTimeSec = lt2PaceMinKm * refDistKm * 60; // 10 km at LT2

  const predictions = RUNNING_DISTANCES.map(({ label, km }) => {
    const timeSec = refTimeSec * Math.pow(km / refDistKm, 1.06);
    const paceMinKm = timeSec / 60 / km;
    return { label, km, timeSec, pace: paceMinKm };
  });

  const easyPace = lt1PaceMinKm && lt1PaceMinKm > 0 ? lt1PaceMinKm : null;

  return { predictions, easyPace };
}

// ─── Cycling predictions ──────────────────────────────────────────────────────

const CYCLING_DISTANCES = [
  { label: '5 km TT', km: 5, powerFraction: 1.15 },
  { label: '10 km TT', km: 10, powerFraction: 1.08 },
  { label: '20 km TT', km: 20, powerFraction: 1.03 },
  { label: '40 km TT', km: 40, powerFraction: 1.00 },
  { label: '1 hr Power', km: null, powerFraction: 0.97 }, // special: 1 hour
];

const BASE_SPEED_KMH = 35; // baseline speed at LT2 power

/**
 * Speed scales with power^(1/3):
 *   speed(p) = BASE_SPEED × (p / lt2Power)^(1/3)
 * Time = distance / speed
 */
function predictCycling(lt2Power) {
  if (!lt2Power || lt2Power <= 0) return null;

  const predictions = CYCLING_DISTANCES.map(({ label, km, powerFraction }) => {
    const power = lt2Power * powerFraction;
    const speed = BASE_SPEED_KMH * Math.pow(power / lt2Power, 1 / 3);

    let timeSec;
    let distanceLabel;
    if (km === null) {
      // 1 hr power — report the distance covered in 1 hour
      timeSec = 3600;
      const distCovered = speed; // km/h × 1 h
      distanceLabel = `${distCovered.toFixed(1)} km`;
    } else {
      timeSec = (km / speed) * 3600;
      distanceLabel = null;
    }

    return { label, km, timeSec, speed, powerFraction, power: Math.round(power), distanceLabel };
  });

  return { predictions };
}

// ─── Confidence ───────────────────────────────────────────────────────────────

function ConfidenceBadge({ level }) {
  if (level === 'good') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
        </svg>
        Good estimate
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      Limited data
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const RacePredictorPage = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sport, setSport] = useState('running');
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // Running inputs
  const [lt2Pace, setLt2Pace] = useState(''); // e.g. "4:30"
  const [lt1Pace, setLt1Pace] = useState(''); // e.g. "5:15"

  // Cycling inputs
  const [lt2Power, setLt2Power] = useState(''); // watts

  const demoUser = { name: '', surname: '', email: '', role: '', sport: '', avatar: '' };

  // ── Computed results ────────────────────────────────────────────────────────

  const lt2PaceNum = parsePace(lt2Pace);
  const lt1PaceNum = parsePace(lt1Pace);
  const lt2PowerNum = parseFloat(lt2Power || '0') || null;

  const runResults = sport === 'running' ? predictRunning(lt2PaceNum, lt1PaceNum) : null;
  const cycleResults = sport === 'cycling' ? predictCycling(lt2PowerNum) : null;

  const hasRunInput = lt2PaceNum && lt2PaceNum > 0;
  const hasBothRunInputs = hasRunInput && lt1PaceNum && lt1PaceNum > 0;
  const hasCycleInput = lt2PowerNum && lt2PowerNum > 0;

  const runConfidence = hasBothRunInputs ? 'good' : (hasRunInput ? 'limited' : null);
  const cycleConfidence = hasCycleInput ? 'good' : null;

  // ── Copy handler ────────────────────────────────────────────────────────────

  const handleCopy = () => {
    let text = '';
    if (sport === 'running' && runResults) {
      const lines = runResults.predictions.map(p =>
        `${p.label}: ${formatTime(p.timeSec)} (${formatPace(p.pace)})`
      );
      if (runResults.easyPace) lines.push(`Easy run: ${formatPace(runResults.easyPace)}`);
      text = 'Running Race Predictions\n' + lines.join('\n');
    } else if (sport === 'cycling' && cycleResults) {
      const lines = cycleResults.predictions.map(p => {
        if (p.distanceLabel) return `${p.label}: covers ${p.distanceLabel} @ ${p.speed.toFixed(1)} km/h (${p.power} W)`;
        return `${p.label}: ${formatTime(p.timeSec)} @ ${p.speed.toFixed(1)} km/h (${p.power} W)`;
      });
      text = 'Cycling Race Predictions\n' + lines.join('\n');
    }
    if (!text) {
      addNotification('Enter your values first to copy results', 'warning');
      return;
    }
    try {
      navigator.clipboard.writeText(text);
      addNotification('Predictions copied to clipboard', 'success');
    } catch {
      addNotification('Unable to copy to clipboard on this device', 'warning');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-x-hidden w-full relative">
      <Helmet>
        <title>Race Time Predictor | Estimate Race Paces from LT1/LT2 Thresholds</title>
        <link rel="canonical" href="https://lachart.net/race-predictor" />
        <meta
          name="description"
          content="Free race time predictor for runners and cyclists. Estimate race times for 5K, 10K, half marathon, marathon and cycling TTs using your LT1/LT2 lactate thresholds and the Riegel formula."
        />
        <meta
          name="keywords"
          content="race time predictor, race pace calculator, riegel formula, LT1 LT2, lactate threshold, running race prediction, cycling TT prediction, 5K 10K marathon predictor"
        />
        <meta property="og:title" content="Race Time Predictor – Predict Race Times from Lactate Thresholds" />
        <meta
          property="og:description"
          content="Enter your LT1/LT2 pace or power and get predicted race times for every common distance. Uses the Riegel endurance formula."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://lachart.net/race-predictor" />
      </Helmet>

      {/* Left menu — desktop */}
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
          <div className="max-w-[1200px] mx-auto space-y-6">

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="relative bg-white rounded-3xl border border-gray-100 shadow-sm px-4 sm:px-8 py-10 overflow-hidden">
              <div className="absolute -right-24 -top-20 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -left-16 bottom-0 w-60 h-60 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col lg:flex-row gap-8 items-start lg:items-center">
                <div className="flex-1 min-w-0">
                  <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-[11px] sm:text-xs font-semibold text-indigo-700 mb-4">
                    🏁 Running &amp; Cycling
                  </div>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
                    <span className="text-gray-900">Race Time </span>
                    <span className="bg-gradient-to-r from-[#767EB5] to-[#599FD0] bg-clip-text text-transparent">Predictor</span>
                  </h1>
                  <p className="text-base sm:text-lg text-gray-600 max-w-2xl mb-6">
                    Enter your lactate threshold pace or power (LT1 / LT2) and instantly see predicted race times for
                    every major distance. Based on the Riegel endurance formula.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/signup')}
                      className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#767EB5] to-[#599FD0] shadow-sm hover:shadow-md hover:opacity-90 transition-all"
                    >
                      Track lactate tests — free
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/lactate-curve-calculator')}
                      className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      Find your LT1/LT2 →
                    </button>
                  </div>
                </div>

                {/* Quick reference cards */}
                <div className="grid grid-cols-2 gap-3 lg:w-64 flex-shrink-0">
                  {[
                    { label: 'LT2 ≈ race pace', value: '10 km', color: 'bg-indigo-50 border-indigo-200' },
                    { label: 'LT1 ≈ easy run', value: 'long run', color: 'bg-sky-50 border-sky-100' },
                    { label: 'Riegel exponent', value: '1.06', color: 'bg-primary/5 border-primary/20' },
                    { label: 'Accuracy', value: '±2–5%', color: 'bg-gray-50 border-gray-200' },
                  ].map(s => (
                    <div key={s.label} className={`rounded-xl border p-3 ${s.color}`}>
                      <div className="text-[10px] text-gray-500 mb-0.5">{s.label}</div>
                      <div className="text-sm font-bold text-gray-800">{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── Sport tabs + calculator ───────────────────────────────────── */}
            <div className="grid lg:grid-cols-5 gap-6 items-start">

              {/* Left: tabs + inputs + results */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-7"
              >
                {/* Sport selector */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
                  {['running', 'cycling'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSport(s)}
                      className={`px-5 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                        sport === s
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {s === 'running' ? '🏃 Running' : '🚴 Cycling'}
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {sport === 'running' && (
                    <motion.div
                      key="running"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Running race predictions</h2>
                      <p className="text-sm text-gray-500 mb-5">
                        Enter your threshold paces in <strong>MM:SS</strong> format (e.g. 4:30).
                        LT2 pace is used as the reference for the Riegel formula.
                      </p>

                      <div className="grid sm:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                            LT2 pace (min/km) — race threshold
                          </label>
                          <input
                            type="text"
                            value={lt2Pace}
                            onChange={e => setLt2Pace(e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                            placeholder="e.g. 4:30"
                          />
                          <p className="text-[11px] text-gray-400 mt-1">LT2 ≈ your 10K race pace</p>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                            LT1 pace (min/km) — aerobic threshold
                            <span className="font-normal text-gray-400 ml-1">optional</span>
                          </label>
                          <input
                            type="text"
                            value={lt1Pace}
                            onChange={e => setLt1Pace(e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                            placeholder="e.g. 5:15"
                          />
                          <p className="text-[11px] text-gray-400 mt-1">LT1 ≈ your easy long-run pace</p>
                        </div>
                      </div>

                      {/* Running results */}
                      {runResults && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700">Predicted race times</h3>
                            {runConfidence && <ConfidenceBadge level={runConfidence} />}
                          </div>
                          <div className="grid gap-2 mb-4">
                            {runResults.predictions.map(({ label, timeSec, pace }) => (
                              <motion.div
                                key={label}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center justify-between px-4 py-3 rounded-xl bg-indigo-50/60 border border-indigo-100"
                              >
                                <span className="text-sm font-semibold text-gray-800">{label}</span>
                                <div className="text-right">
                                  <div className="text-base font-bold text-indigo-700">{formatTime(timeSec)}</div>
                                  <div className="text-[11px] text-gray-500">{formatPace(pace)}</div>
                                </div>
                              </motion.div>
                            ))}

                            {/* Easy run pace */}
                            {runResults.easyPace && (
                              <motion.div
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center justify-between px-4 py-3 rounded-xl bg-sky-50 border border-sky-100"
                              >
                                <div>
                                  <span className="text-sm font-semibold text-gray-800">Easy run</span>
                                  <span className="ml-2 text-[11px] text-sky-600 font-medium">(LT1 pace)</span>
                                </div>
                                <div className="text-base font-bold text-sky-600">{formatPace(runResults.easyPace)}</div>
                              </motion.div>
                            )}
                          </div>
                        </div>
                      )}

                      {!hasRunInput && (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          Enter your LT2 pace above to see predictions
                        </div>
                      )}
                    </motion.div>
                  )}

                  {sport === 'cycling' && (
                    <motion.div
                      key="cycling"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Cycling race predictions</h2>
                      <p className="text-sm text-gray-500 mb-5">
                        Enter your LT2 power in watts (or FTP if you know it — they are approximately equal).
                        Speed scales with power<sup>1/3</sup> from a 35 km/h baseline.
                      </p>

                      <div className="grid sm:grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                            LT2 power (watts)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={lt2Power}
                            onChange={e => setLt2Power(e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                            placeholder="e.g. 280"
                          />
                          <p className="text-[11px] text-gray-400 mt-1">LT2 ≈ FTP, your 1-hour sustainable power</p>
                        </div>
                        <div className="flex flex-col justify-end pb-1">
                          <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                            <p className="text-xs text-amber-700 font-medium">Tip</p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              Don't know your LT2 power? Use our{' '}
                              <button
                                type="button"
                                onClick={() => navigate('/ftp-calculator')}
                                className="underline font-medium text-primary hover:opacity-80"
                              >
                                FTP Calculator
                              </button>{' '}
                              to estimate it.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Cycling results */}
                      {cycleResults && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700">Predicted TT times</h3>
                            {cycleConfidence && <ConfidenceBadge level={cycleConfidence} />}
                          </div>
                          <div className="grid gap-2 mb-4">
                            {cycleResults.predictions.map(({ label, timeSec, speed, power, powerFraction, distanceLabel }) => (
                              <motion.div
                                key={label}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center justify-between px-4 py-3 rounded-xl bg-sky-50/60 border border-sky-100"
                              >
                                <div>
                                  <span className="text-sm font-semibold text-gray-800">{label}</span>
                                  <span className="ml-2 text-[11px] text-gray-400">
                                    {Math.round(powerFraction * 100)}% LT2 · {power} W · {speed.toFixed(1)} km/h
                                  </span>
                                </div>
                                <div className="text-right">
                                  {distanceLabel ? (
                                    <div className="text-base font-bold text-sky-600">{distanceLabel}</div>
                                  ) : (
                                    <div className="text-base font-bold text-sky-600">{formatTime(timeSec)}</div>
                                  )}
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!hasCycleInput && (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          Enter your LT2 power above to see predictions
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-4 py-2 text-xs sm:text-sm rounded-xl bg-gray-900 text-white hover:bg-black transition-colors"
                  >
                    Copy results
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLt2Pace('');
                      setLt1Pace('');
                      setLt2Power('');
                    }}
                    className="px-4 py-2 text-xs sm:text-sm rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </motion.div>

              {/* Right: education + how it works */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="lg:col-span-2 space-y-4"
              >
                {/* How it works — expandable */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowHowItWorks(v => !v)}
                    className="w-full flex items-center justify-between px-5 sm:px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-base">📐</span>
                      </div>
                      <span className="text-base font-bold text-gray-900">How this works</span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${showHowItWorks ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  <AnimatePresence>
                    {showHowItWorks && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 sm:px-6 pb-5 space-y-4 text-sm text-gray-600">
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-1">Running — Riegel Formula</h4>
                            <p className="font-mono text-xs bg-gray-50 rounded-lg px-3 py-2 mb-2">
                              time₂ = time₁ × (dist₂ / dist₁)^<strong>1.06</strong>
                            </p>
                            <p>
                              Your LT2 pace sets the reference time for 10 km. The exponent (1.06)
                              models the slowing effect of increasing distance — faster runners
                              use a slightly lower exponent in practice.
                            </p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-1">Cycling — Power-to-speed model</h4>
                            <p className="font-mono text-xs bg-gray-50 rounded-lg px-3 py-2 mb-2">
                              speed = 35 km/h × (power / LT2)^(1/3)
                            </p>
                            <p>
                              Each distance uses a power fraction of LT2 (e.g. 5 km TT at 115%, 40 km at 100%).
                              Speed scales with the cube root of power, reflecting aerodynamic drag.
                              Baseline of 35 km/h at LT2 is a typical flat TT on a road bike.
                            </p>
                          </div>
                          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
                            <strong>Accuracy note:</strong> Predictions assume flat terrain, standard equipment and
                            optimal pacing. Real race times may vary ±5% depending on course, conditions and
                            individual response to fatigue.
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* What is LT1/LT2 */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                    <span className="text-lg">🩸</span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">What are LT1 and LT2?</h3>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li>
                      <span className="font-semibold text-sky-600">LT1</span> (aerobic threshold) — the intensity
                      where lactate first begins to rise. This is your ideal easy/long-run or Z2 pace.
                    </li>
                    <li>
                      <span className="font-semibold text-indigo-600">LT2</span> (anaerobic threshold / MLSS) —
                      maximum lactate steady state. Corresponds closely to 10K race pace for runners,
                      or FTP for cyclists.
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => navigate('/lactate-guide')}
                    className="mt-4 inline-flex items-center px-4 py-2 text-xs rounded-xl bg-primary text-white hover:bg-opacity-90 transition-colors"
                  >
                    Learn more in the Lactate Guide →
                  </button>
                </div>

                {/* CTA */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center mb-3">
                    <span className="text-lg">📈</span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">
                    Track LT1/LT2 over time in LaChart
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Store lactate tests, compare thresholds across months and see how race predictions
                    improve as your fitness grows — all in one free account.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/signup')}
                    className="inline-flex items-center px-4 py-2 text-xs sm:text-sm rounded-xl bg-gradient-to-r from-[#767EB5] to-[#599FD0] text-white hover:opacity-90 transition-colors"
                  >
                    Create free account →
                  </button>
                </div>
              </motion.div>
            </div>

            {/* ── Formula footnote ──────────────────────────────────────────── */}
            <p className="text-center text-xs text-gray-400 pb-4">
              Running predictions use the <strong>Riegel endurance formula</strong> (Peter Riegel, 1977) with exponent 1.06,
              referenced from your LT2 pace at 10 km. Cycling predictions use a cube-root power-to-speed model.
              Estimates are for flat courses under standard conditions.
            </p>

          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
};

export default RacePredictorPage;
